/**
 * The app shell.
 *
 * Phone-first by design: the primary action is capture, the secondary is lookup, and editing is
 * deliberately absent (that is the tablet target). Everything works with no network — a note is
 * written to the local replica and the status line says what is still owed to the server.
 *
 * All data access goes through the worker (see `rpc.ts` for why), so every render is async: the view
 * model is loaded first, then the markup is built from it. That keeps the render functions pure and
 * means no view has to cope with a half-loaded state.
 */

import { toSnippet, type NoteDetail, type NoteSummary } from "./data.js";
import { icon } from "./icons.js";
import { InkCanvas, createInkDoc, paintInk, parseInkDoc, serializeInkDoc } from "./ink.js";
import { hasNativeBridge, nativeFetch } from "./native-fetch.js";
import { WorkerClient, type AppCounts, type ProgressEvent } from "./rpc.js";
import "./style.css";

/**
 * Two tabs, matching the reference: quick notes and the tree.
 *
 * Was three (`capture` / `search` / `browse`) in a bottom tab bar. The reference puts its two
 * sections in a **centred segmented control at the top** and has no bottom bar at all, which is the
 * single biggest structural difference this refactor makes. Search is not a tab there either — it is
 * a full screen entered from the bar.
 */
type Tab = "notes" | "library";

/** The same children rendered two ways, switched from the options sheet. */
type LayoutMode = "list" | "grid";

/** Sort keys Trilium already has; nothing new is offered. */
type SortKey = "modified" | "created" | "title";

/** Bottom sheets, the reference's pattern for options and for creating. */
type Sheet = "none" | "view";

interface AppState {
  tab: Tab;
  query: string;
  browsePath: string[];
  openNoteId: string | null;
  syncing: boolean;
  busy: boolean;
  configured: boolean;
  serverHost: string | null;
  pending: number;
  progress: ProgressEvent | null;
  lastMessage: string;
  lastOk: boolean;
  /** Detail-view mode. Editing and ink are tablet features; the phone stays read-only by design. */
  detailMode: DetailMode;
  /** Set when the ink layer has unsaved strokes. */
  inkDirty: boolean;
  /** Set when the note currently has an ink attachment, so the layer must be drawn. */
  hasInk: boolean;
  /** The settings screen is a navigation step, so the back gesture closes it. */
  settingsOpen: boolean;
  /** List or grid, for the same collection of children. */
  layout: LayoutMode;
  sort: SortKey;
  /** Which bottom sheet is up, if any. */
  sheet: Sheet;
  /** The note ids walked into, root first. Empty means the tree root. */
  libraryPath: string[];
  /** Titles for the walked path, so a breadcrumb needs no extra query. */
  libraryTitles: string[];
  /** The full-screen editor, entered from the capture bar. */
  editorOpen: boolean;
  editorTitle: string;
  editorBody: string;
  /** Search is a screen of its own, not a tab. */
  searchOpen: boolean;
  /** The AI chat list, opened from the home action row. */
  aiOpen: boolean;
  searchQuery: string;
}

type DetailMode = "view" | "edit" | "ink";

/**
 * Tablets get editing and ink; phones do not. That is a product decision, not a technical limit —
 * the phone's job is 速记 / 速查 / 查看.
 */
function isPad(): boolean {
  return window.matchMedia("(min-width: 720px)").matches;
}

const ROOT_NOTE_ID = "root";

const state: AppState = {
  tab: "notes",
  query: "",
  browsePath: [ROOT_NOTE_ID],
  openNoteId: null,
  syncing: false,
  busy: false,
  configured: false,
  serverHost: null,
  pending: 0,
  progress: null,
  lastMessage: "",
  lastOk: true,
  detailMode: "view",
  inkDirty: false,
  hasInk: false,
  settingsOpen: false,
  layout: "list",
  sort: "modified",
  sheet: "none",
  libraryPath: [],
  libraryTitles: [],
  editorOpen: false,
  editorTitle: "",
  editorBody: "",
  searchOpen: false,
  searchQuery: "",
  aiOpen: false
};

let inkCanvas: InkCanvas | null = null;

const worker = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
const api = new WorkerClient(worker);

/**
 * Perform the worker's HTTP through the shell.
 *
 * The worker holds the database and therefore the sync engine, but the native bridge is injected
 * into this frame only, so every request the engine makes arrives here to be forwarded.
 */
worker.addEventListener("message", (event: MessageEvent) => {
  const data = event.data as { event?: string; id?: number; request?: unknown };
  if (data?.event !== "http" || typeof data.id !== "number" || !data.request) return;

  const request = data.request as {
    url: string;
    method: string;
    headers: Record<string, string>;
    bodyBase64: string;
  };

  const bytes = request.bodyBase64 ? base64ToBytes(request.bodyBase64) : undefined;

  nativeFetch(request.url, {
    method: request.method,
    headers: request.headers,
    ...(bytes && bytes.byteLength > 0 ? { body: bytes } : {})
  })
    .then(async (response) => {
      const buffer = new Uint8Array(await response.arrayBuffer());
      const headers: Record<string, string> = {};
      response.headers.forEach((value, key) => {
        headers[key] = value;
      });

      worker.postMessage({
        event: "httpResult",
        id: data.id,
        result: {
          status: response.status,
          headers,
          bodyBase64: bytesToBase64(buffer)
        }
      });
    })
    .catch((error: unknown) => {
      worker.postMessage({
        event: "httpResult",
        id: data.id,
        result: {
          status: 0,
          headers: {},
          bodyBase64: "",
          error: error instanceof Error ? error.message : String(error)
        }
      });
    });
});

function bytesToBase64(bytes: Uint8Array): string {
  let out = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    out += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(out);
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
  return bytes;
}
const app = document.getElementById("app") as HTMLDivElement;

api.progressHandler = (progress) => {
  state.progress = progress;

  // Repainting just the status line keeps a long initial sync legible without rebuilding the view,
  // which would fight the user's scroll position and the caret.
  const element = document.getElementById("status");
  if (element) {
    element.textContent = progress.message;
    element.className = `status ${progress.phase === "error" ? "bad" : "busy"}`;
  }
};

// ------------------------------------------------------------------ navigation

/**
 * Record a step the back gesture should undo.
 *
 * The shell forwards its back button by calling `WebviewController.backward()`, which fires
 * `popstate` here — so the WebView's own history is the whole back stack and the shell needs no
 * knowledge of the app's structure.
 */
function pushStep(): void {
  history.pushState({ triliumStep: true }, "");
}

/**
 * Undo one step. Returns whether anything was undone, so the shell can decide between closing the
 * overlay and letting the system exit.
 */
function stepBack(): boolean {
  if (state.openNoteId !== null) {
    state.openNoteId = null;
    state.detailMode = "view";
    void render();
    return true;
  }

  // Walking up the tree is a step. Without this the back gesture leaves the app from three levels
  // deep, which is not what backing out of a folder means.
  if (state.libraryPath.length > 0) {
    state.libraryPath = state.libraryPath.slice(0, -1);
    state.libraryTitles = state.libraryTitles.slice(0, -1);
    void render();
    return true;
  }

  if (state.sheet === "view") {
    state.sheet = "none";
    void render();
    return true;
  }

  if (state.settingsOpen) {
    state.settingsOpen = false;
    void render();
    return true;
  }

  if (state.aiOpen) {
    state.aiOpen = false;
    void render();
    return true;
  }

  if (state.searchOpen) {
    state.searchOpen = false;
    void render();
    return true;
  }

  if (state.editorOpen) {
    state.editorOpen = false;
    void render();
    return true;
  }

  return false;
}

window.addEventListener("popstate", () => {
  stepBack();
});

/**
 * Exposed for the shell as a fallback: if a device runs the back gesture without the WebView
 * reporting backward history, the page can still be told directly.
 */
(globalThis as unknown as { __triliumBack?: () => boolean }).__triliumBack = stepBack;

// ---------------------------------------------------------------------- boot

async function boot(): Promise<void> {
  renderBootSkeleton();

  try {
    await api.ready();

    // Tell the worker where its network comes from before anything tries to use it.
    const bridged = hasNativeBridge();
    await api.useNativeHttp(bridged);
    console.log(`shell: native bridge ${bridged ? "active" : "absent"}, origin ${location.origin}`);

    await refreshChrome();
    console.log(`shell: configured=${state.configured}`);

    await render();
    // The build's identity, logged where the shell can read it. Verifying that a device is running
    // the build just made should not depend on squinting at the screen.
    console.log(`shell: build ${__BUILD_ID__}`);
    console.log("shell: rendered");

    await autoConfigureForTest();
  } catch (error) {
    // Logged as well as shown: on a device the screen is unreadable from a script, and an unlogged
    // throw here is invisible.
    console.log(`shell: boot failed: ${error instanceof Error ? error.stack ?? error.message : error}`);

    commit(`
      <div class="setup">
        <h2>无法打开本地数据库</h2>
        <p>${escapeHtml(String(error))}</p>
      </div>`);
  }
}

/**
 * Write a note the way the capture screen does, then sync it.
 *
 * The read direction is proven by the boot sync. This proves the write direction from the device —
 * and the evidence is read out of the server's own database afterwards, not taken from a 2xx.
 */
async function captureForTest(): Promise<void> {
  const marker = import.meta.env?.VITE_E2E_CAPTURE;
  if (!marker) return;

  try {
    const inbox = await api.inboxNoteId();
    const created = await api.createTextNote({
      parentNoteId: inbox,
      title: marker,
      content: `<p>由鸿蒙设备离线创建：${marker}</p>`
    });

    console.log(`shell: captured note ${created.noteId} locally`);

    await refreshChrome();
    console.log(`shell: pending after capture = ${state.pending}`);

    await runSync();
    console.log(`shell: post-capture sync ok=${state.lastOk} message="${state.lastMessage}"`);
  } catch (error) {
    console.log(`shell: capture failed: ${error instanceof Error ? error.message : error}`);
  }
}

/**
 * Report the layout the device actually chose, and exercise the editing write path.
 *
 * Both matter on a form factor the browser tests cannot speak for. The viewport decides which of the
 * two layouts runs — the phone's single pane or the tablet's two — and editing is a write path that
 * has never run on a device.
 */
async function selfTestOnDevice(): Promise<void> {
  if (!import.meta.env?.VITE_E2E_SERVER) return;

  console.log(
    `device: viewport ${window.innerWidth}x${window.innerHeight} ` +
      `dpr=${window.devicePixelRatio} pad=${isPad()}`
  );

  const marker = import.meta.env?.VITE_E2E_EDIT;
  if (!marker) return;

  try {
    // Edit through the same call the tablet's editor makes on save.
    const candidates = await api.search(marker);
    if (candidates.length === 0) {
      console.log(`device: no note matching "${marker}" to edit`);
      return;
    }

    const target = candidates[0]!;
    const before = await api.getNote(target.noteId);
    const edited = `${before?.content ?? ""}<p>${marker} 已编辑</p>`;

    await api.updateNoteContent(target.noteId, edited);
    console.log(`device: edited ${target.noteId} locally`);

    await refreshChrome();
    console.log(`device: pending after edit = ${state.pending}`);

    await runSync();
    console.log(`device: post-edit sync ok=${state.lastOk} message="${state.lastMessage}"`);
  } catch (error) {
    console.log(`device: edit failed: ${error instanceof Error ? error.message : error}`);
  }
}

/**
 * Point the client at a *second* vault and prove the first one's replica is gone.
 *
 * The marker note exists only in the first vault. If the replica were not wiped on the switch, it
 * would still be here afterwards — and the following sync would push it, and everything else from
 * the first vault, into the second. So the test asserts the marker disappears locally *before* any
 * sync, and the server-side check confirms it never arrives.
 */
async function vaultSwitchTest(): Promise<void> {
  const serverB = import.meta.env?.VITE_E2E_SERVER_B;
  const passwordB = import.meta.env?.VITE_E2E_PASSWORD_B;
  const marker = import.meta.env?.VITE_E2E_CAPTURE;

  if (!serverB || !passwordB || !marker) return;

  try {
    const before = await api.counts();
    const foundBefore = (await api.search(marker)).length;
    const vaultA = await api.vaultInfo();

    console.log(
      `vaultswitch: BEFORE notes=${before.notes} markerHits=${foundBefore} docId=${vaultA.documentId}`
    );

    await api.configure(serverB, passwordB);

    const afterWipe = await api.counts();
    const foundAfterWipe = (await api.search(marker)).length;
    const vaultB = await api.vaultInfo();

    console.log(
      `vaultswitch: AFTER CONFIGURE notes=${afterWipe.notes} markerHits=${foundAfterWipe} ` +
        `docId=${vaultB.documentId}`
    );

    await refreshChrome();
    await runSync();

    const afterSync = await api.counts();
    console.log(
      `vaultswitch: AFTER SYNC notes=${afterSync.notes} pending=${state.pending} ` +
        `ok=${state.lastOk} message="${state.lastMessage}"`
    );
  } catch (error) {
    console.log(`vaultswitch: failed: ${error instanceof Error ? error.message : error}`);
  }
}

/**
 * Configure from build-time credentials, for the on-device end-to-end run.
 *
 * A shipped build has neither variable set, so this is inert in production. It exists because the
 * emulator can drive touch input but not a WebView's DOM, so the setup form cannot otherwise be
 * completed from a script.
 */
async function autoConfigureForTest(): Promise<void> {
  const server = import.meta.env?.VITE_E2E_SERVER;
  const password = import.meta.env?.VITE_E2E_PASSWORD;
  const secret = import.meta.env?.VITE_E2E_SECRET;

  // Either credential will do: the password only ever fetches the seed, and the login itself is
  // built from the secret.
  if (!server || (!password && !secret)) return;

  try {
    if (secret) {
      // A build-time secret skips the password exchange, for verifying against a vault whose
      // password is not available. The HMAC login only ever uses the secret.
      console.log(`shell: configuring from a known secret against ${server}`);
      await api.configureWithSecret(server, secret);
      await refreshChrome();
      await render();

      // Nothing may be owed to a server we are only reading. If this is non-zero, stop.
      console.log(`shell: pending before sync = ${state.pending}`);
    } else if (!state.configured && password) {
      console.log(`shell: test auto-configure against ${server}`);
      await api.configure(server, password);
      await refreshChrome();
      await render();
    } else {
      console.log(`shell: already configured against ${state.serverHost}`);
    }

    if (secret && state.pending > 0) {
      console.log(`shell: REFUSING to sync — ${state.pending} local changes would be written to a server we only mean to read`);
      return;
    }

    // Sync on boot in a test build: that is the thing being verified on the device.
    await runSync();
    console.log(
      `shell: boot sync finished ok=${state.lastOk} message="${state.lastMessage}" ` +
        `pending=${state.pending}`
    );

    await captureForTest();
    await selfTestOnDevice();
    await vaultSwitchTest();
  } catch (error) {
    console.log(`shell: auto-configure failed: ${error instanceof Error ? error.message : error}`);
  }
}

/**
 * The shape of the screen, before the data exists.
 *
 * A single line of grey text is the first thing the app shows, and it is the one screen guaranteed
 * to be seen on every launch.
 */
function renderBootSkeleton(): void {
  app.innerHTML = `
    <div class="appbar"><h1>TriliumMobile</h1><span class="status">正在打开本地数据库…</span></div>
    <div class="boot-mark"><img src="/icon-192.png" alt="" width="56" height="56" /></div>
    <div class="view">
      ${Array.from({ length: 5 }, () => `
        <div class="skeleton" style="padding:16px;margin-bottom:8px">
          <div class="skeleton skeleton-line" style="width:70%"></div>
          <div class="skeleton skeleton-line short" style="margin-bottom:0"></div>
        </div>`).join("")}
    </div>
  `;
}

/** Small pieces of cross-view state, refreshed after actions rather than on every render. */
async function refreshChrome(): Promise<void> {
  state.configured = await api.isConfigured();
  state.serverHost = await api.serverHost();
  state.pending = state.configured ? await api.pendingPushCount() : 0;
}

// -------------------------------------------------------------------- render

/**
 * Put new markup on the page.
 *
 * The app replaces its whole body on every navigation, which is why it used to flash. The obvious
 * fix is `document.startViewTransition` — ArkWeb is Chromium 144, so every target has it — but it
 * was tried and reverted: **while a transition is in flight the page is not hit-testable.**
 * Measured on this app, `document.elementFromPoint` over the ink canvas returned `<html>` while
 * `activeViewTransition` was set, and the canvas itself once it cleared. That is a ~250ms window on
 * every navigation in which taps and strokes are silently dropped, which is a bad trade for an app
 * whose whole point is fast capture.
 *
 * Continuity comes from CSS animations on insertion instead (`.view`, `.detail`): the same sense of
 * movement, with nothing removed from the hit-test tree.
 */
function commit(html: string): void {
  app.innerHTML = html;
}

async function render(): Promise<void> {
  inkCanvas?.destroy();
  inkCanvas = null;

  if (!state.configured) {
    renderSetup();
    return;
  }

  const view = await renderView();
  const detail = state.openNoteId ? await renderDetail(state.openNoteId) : "";

  commit(`
    ${renderAppbar()}
    <div class="view" id="view">${view}</div>
    ${detail}
    ${renderFabCluster()}
    ${renderSheet()}
    ${renderEditor()}
    ${renderSearchScreen()}
    ${await renderAiScreen()}
  `);

  measureAppBar();
  wire();
}

/**
 * Publish the global bar's height as a custom property.
 *
 * The tablet layout offsets the note panel below the bar, and the bar's height depends on the
 * safe-area inset, which CSS alone cannot feed back into a sibling's `top`.
 */
function measureAppBar(): void {
  const bar = document.querySelector(".appbar");
  if (!bar) return;

  const height = bar.getBoundingClientRect().height;
  if (height > 0) {
    document.documentElement.style.setProperty("--appbar-h", `${Math.round(height)}px`);
  }
}

/**
 * The app bar carries *state*, never a sentence.
 *
 * It used to show the full result message — "同步完成：拉取 2909 项，用时 0.7s" — beside the title. That
 * text is `nowrap` and the title is `flex: 1; min-width: 0`, so the title lost every fight: measured
 * at 390px it was given 46px of the 105px it needs, and at 320px it was given **zero**. The name of
 * the app was unreadable on every screen of every phone.
 *
 * The long message is not lost — it goes to a toast, which is where a transient sentence belongs.
 * What stays here is only what is actionable at a glance.
 */
/**
 * The top bar: a centred segmented control, a search entry, and an overflow.
 *
 * Modelled on the reference, where every screen carries the same centred `小记 | 知识库` control and
 * nothing else persistent. The app name is gone from here — it occupied the only flexible space in a
 * bar that now has none to spare, and the user already knows which app they opened.
 *
 * Sync and settings moved into the options sheet rather than crowding the bar, which is where the
 * reference keeps its own miscellaneous actions.
 */
function renderAppbar(): string {
  const segment = (id: Tab, label: string) =>
    `<button data-tab="${id}" role="tab" aria-selected="${state.tab === id}">${label}</button>`;

  return `
    <div class="appbar">
      <span class="appbar-spacer"></span>
      <div class="segmented" role="tablist">
        ${segment("notes", "速记")}
        ${segment("library", "知识库")}
      </div>
      <button id="open-sheet" class="icon-only ghost" aria-label="更多">${icon("more", "icon-lg")}</button>
    </div>
    ${renderStatusStrip()}
  `;
}

/**
 * A thin line under the bar, shown only when there is something to say.
 *
 * Sync state has to live somewhere, and the reference's own answer — put it behind `⋯` — would hide
 * a pending backlog. A strip that appears only when work is owed, in flight, or failed keeps the
 * information without costing the resting state anything.
 */
function renderStatusStrip(): string {
  const label = state.syncing
    ? state.progress?.message || "同步中…"
    : state.pending > 0
      ? `${state.pending} 项待同步`
      : !state.lastOk && state.lastMessage
        ? "同步失败"
        : "";

  if (!label) return `<div id="status" class="status-strip" hidden></div>`;

  const cls = state.syncing ? "busy" : state.lastOk ? "ok" : "bad";
  return `<div id="status" class="status-strip ${cls}">${escapeHtml(label)}</div>`;
}

/**
 * The two tabs.
 *
 * `notes` is the quick-note surface: an entry into the editor, then the most recently touched notes.
 * `library` is Trilium's tree, walked one level at a time — the reference's drill-down.
 */
async function renderView(): Promise<string> {
  return state.tab === "notes" ? renderNotes() : renderLibrary();
}

/**
 * 速记 — capture, then what was captured recently.
 *
 * The capture entry is a bar rather than a form: tapping it opens the full-screen editor, which is
 * the reference's flow and also the right one for a phone. The form-with-a-save-button it replaces
 * spent a third of the screen on chrome before a single character was typed.
 */
async function renderNotes(): Promise<string> {
  const notes = sortNotes(await api.recent(60));
  const counts = await api.counts();

  const empty = `
    <div class="empty">
      还没有笔记。<br />点上面的输入框记第一条。
    </div>`;

  return `
    <div class="section-head">
      <span>最近</span>
      <span class="section-count">${counts.notes.toLocaleString("en-US")} 条</span>
    </div>

    ${notes.length === 0 ? empty : renderNoteCollection(notes, "notes")}
  `;
}

/**
 * 知识库 — the note tree, one level at a time.
 *
 * The parent is whichever book was walked into; the root when nothing has been. A `book` descends,
 * anything else opens. That is exactly what a tree is, so no new concept is introduced.
 */
async function renderLibrary(): Promise<string> {
  const parentNoteId = state.libraryPath[state.libraryPath.length - 1] ?? "root";
  const children = sortNotes(await api.childrenOf(parentNoteId));

  const crumbs = state.libraryPath
    .map((_, index) => `<span data-crumb="${index}">${escapeHtml(state.libraryTitles[index] ?? "…")}</span>`)
    .join(`<span class="sep">/</span>`);

  const empty = `
    <div class="empty">
      这个目录是空的。<br />在速记里新建一条，或换个目录。
    </div>`;

  return `
    ${state.libraryPath.length > 0 ? `<div class="crumbs"><span data-crumb="root">知识库</span><span class="sep">/</span>${crumbs}</div>` : ""}

    <div class="section-head">
      <span>${state.libraryPath.length === 0 ? "全部" : escapeHtml(state.libraryTitles[state.libraryTitles.length - 1] ?? "")}</span>
      <span class="section-count">${children.length} 项</span>
    </div>

    ${children.length === 0 ? empty : renderNoteCollection(children, "library")}
  `;
}

/** Apply the sheet's sort choice. Titles sort with `localeCompare` so Chinese orders sensibly. */
function sortNotes(notes: NoteSummary[]): NoteSummary[] {
  const sorted = [...notes];

  switch (state.sort) {
    case "created":
      // `utcDateCreated` is not on the summary, so fall back to id order, which Trilium assigns
      // monotonically. Honest about what the data supports rather than faking a date.
      sorted.sort((a, b) => (a.noteId < b.noteId ? 1 : -1));
      return sorted;
    case "title":
      sorted.sort((a, b) => a.title.localeCompare(b.title, "zh-Hans-CN"));
      return sorted;
    default:
      sorted.sort((a, b) => (a.utcDateModified < b.utcDateModified ? 1 : -1));
      return sorted;
  }
}

/**
 * A collection of notes, as a list or a grid.
 *
 * One renderer for both surfaces and both layouts, so the two tabs cannot drift apart.
 */
function renderNoteCollection(notes: NoteSummary[], context: "notes" | "library"): string {
  const cards = notes.map((note) => renderNoteCard(note, context));

  if (state.layout === "grid") {
    return `<div class="grid">${cards.join("")}</div>`;
  }

  return `<div class="list">${cards.join("")}</div>`;
}

/**
 * One note.
 *
 * A `book` descends when tapped; anything else opens. The trailing count is the only difference
 * between the two, which is the reference's own treatment.
 */
function renderNoteCard(note: NoteSummary, context: "notes" | "library"): string {
  const kind = noteKind(note.type);
  // Having children is what makes a note a container. A `book` is one, but so are `doc`, `text`,
  // `code` and `render` notes — in a real vault only 23 of 152 parents were books, so keying on the
  // type stranded every level below the second.
  const descends = context === "library" && note.childCount > 0;

  const className = state.layout === "grid" ? "card" : "row";
  const target = descends ? `data-into="${note.noteId}"` : `data-open="${note.noteId}"`;

  // Trilium's own icon when the note carries one, otherwise the generic mark for its type. Colour
  // is the note's `color` label, which is a hex value.
  const mark = note.iconClass
    ? `<i class="${escapeAttr(note.iconClass)}" aria-hidden="true"></i>`
    : icon(kind);

  const tint = note.color ? ` style="color:${escapeAttr(note.color)}"` : "";

  return `
    <button class="${className}" ${target} data-note-id="${note.noteId}">
      <span class="note-icon"${tint}>${mark}</span>
      <span class="note-text">
        <span class="title">${escapeHtml(note.title || "无标题")}</span>
        <span class="meta">${escapeHtml(describeNote(note, descends))}</span>
      </span>
    </button>
  `;
}

/** Map a Trilium note type to one of the bundled icons. */
function noteKind(type: string): string {
  switch (type) {
    case "book":
      return "book";
    case "code":
      return "code";
    case "image":
      return "image";
    case "file":
      return "file";
    case "canvas":
      return "canvas";
    default:
      return "note";
  }
}

/** `更新 3月5日` for a note, `N 个子笔记` for a book. */
function describeNote(note: NoteSummary, descends: boolean): string {
  if (descends) return `${note.childCount} 项`;

  const date = note.utcDateModified?.slice(0, 10).replace(/-/g, "/") ?? "";
  return date ? `更新 ${date}` : note.type;
}


/**
 * The three entries, floating over the content at the bottom.
 *
 * They were a three-across row at the top of the home screen, which was a misreading of the
 * reference: its `+` and `AI` sit at y≈0.86 with list content *below* them, so they float over the
 * list rather than occupying a row of it. Floating also keeps them reachable from either tab and
 * puts them under the thumb, which is where a phone wants its primary action.
 *
 * The middle one is filled because capturing is what the phone is for.
 */
function renderFabCluster(): string {
  return `
    <div class="fab-cluster">
      <button id="open-search" class="fab" aria-label="搜索">${icon("search", "icon-lg")}</button>
      <button id="open-editor" class="fab fab-primary" aria-label="新建速记">${icon("plus", "icon-lg")}</button>
      <button id="open-ai" class="fab" aria-label="AI 笔记">${icon("ai", "icon-lg")}</button>
    </div>
  `;
}

/**
 * The options sheet.
 *
 * The reference's screen 8 is a bottom sheet of labelled groups, each showing its current value
 * inline, dismissed by `取消`. Sync and settings live here because the top bar no longer has room
 * for them and the reference keeps its own miscellaneous actions behind an overflow too.
 *
 * Wrapped in a `<form>` so iOS and the shell offer a dismiss affordance; `method="dialog"` would not
 * help in a WebView, so closing is handled by the button and by the backdrop.
 */
function renderSheet(): string {
  if (state.sheet !== "view") return "";

  const choice = (group: string, value: string, label: string) =>
    `<button data-choice="${group}" data-value="${value}" aria-selected="${state[group as "layout" | "sort"] === value}">${label}</button>`;

  return `
    <div class="sheet-backdrop" id="sheet-backdrop">
      <div class="sheet" role="dialog" aria-label="显示选项">
        <div class="sheet-group">
          <div class="sheet-label">布局</div>
          <div class="segmented">
            ${choice("layout", "list", "列表")}
            ${choice("layout", "grid", "网格")}
          </div>
        </div>

        <div class="sheet-group">
          <div class="sheet-label">排序方式</div>
          <div class="segmented">
            ${choice("sort", "modified", "按更新时间")}
            ${choice("sort", "created", "按创建时间")}
            ${choice("sort", "title", "按标题")}
          </div>
        </div>

        <div class="sheet-group">
          <button class="sheet-action" id="sheet-sync" ${state.syncing ? "disabled" : ""}>
            ${icon("sync")}<span>立即同步</span>
            ${state.pending > 0 ? `<span class="sheet-value">${state.pending} 项待同步</span>` : ""}
          </button>
          <button class="sheet-action" id="sheet-settings">
            ${icon("settings")}<span>设置</span>
            <span class="sheet-value">${escapeHtml(state.serverHost ?? "未配置")}</span>
          </button>
        </div>

        <button class="sheet-cancel" id="sheet-cancel">取消</button>
      </div>
    </div>
  `;
}

/**
 * The full-screen editor.
 *
 * The reference's screen 4: `×` to abandon at the left, `完成` to keep at the right, and nothing
 * else competing with the text. Replaces an inline form whose label, banner and hint left about
 * half the screen for the note itself.
 */
function renderEditor(): string {
  if (!state.editorOpen) return "";

  return `
    <div class="screen" id="editor-screen">
      <div class="appbar">
        <button id="editor-cancel" class="icon-only ghost" aria-label="放弃">${icon("close", "icon-lg")}</button>
        <span class="screen-title">新建速记</span>
        <button id="editor-image" class="ghost">${icon("image")} 图片</button>
        <button id="editor-save" class="primary">完成</button>
      </div>

      <div class="view">
        <input id="editor-title" placeholder="标题（可留空）" value="${escapeAttr(state.editorTitle)}" autocomplete="off" />
        <textarea id="editor-body" placeholder="记你想记…" autofocus>${escapeHtml(state.editorBody)}</textarea>
      </div>
    </div>
  `;
}

/**
 * Search, as a screen rather than a tab.
 *
 * The reference's screen 2: a field pinned at the top with `取消` beside it, results below. Search
 * history is deliberately absent — it would be a new capability rather than a new arrangement of an
 * existing one.
 */
function renderSearchScreen(): string {
  if (!state.searchOpen) return "";

  return `
    <div class="screen" id="search-screen">
      <div class="appbar search-bar">
        <div class="search-field">
          ${icon("search")}
          <input id="search-input" type="search" placeholder="搜索标题与正文…"
                 value="${escapeAttr(state.searchQuery)}" autocomplete="off" autocorrect="off" spellcheck="false" />
        </div>
        <button id="search-cancel" class="ghost">取消</button>
      </div>
      <div class="view" id="search-results"></div>
    </div>
  `;
}

/**
 * AI chats.
 *
 * Trilium has a real `llmChat` note type — a migration shows it was once a code note and became a
 * type of its own — plus `/api/special-notes/llm-chat` and a streaming endpoint behind it. So this
 * is an arrangement of something Trilium already has, not an invented capability.
 *
 * The list reads the **local replica**, which means it works offline and needs no server round trip.
 * Starting a new chat does not: that goes through the server's LLM provider, so the screen says so
 * rather than offering a button that cannot work.
 */
async function renderAiScreen(): Promise<string> {
  if (!state.aiOpen) return "";

  // A failing query must not take the whole app down with it: the shell renders this eagerly.
  const chats = sortNotes(await api.notesOfType("llmChat", 50).catch(() => []));

  const body =
    chats.length === 0
      ? `<div class="empty">
           这台设备的副本里还没有 AI 对话。<br /><br />
           Trilium 的 AI 对话需要服务端配置好模型提供方；<br />
           配置后已有的对话会随同步出现在这里。
         </div>`
      : `<div class="list">${chats
          .map(
            (chat) => `
        <button class="row" data-open="${chat.noteId}" data-note-id="${chat.noteId}">
          <span class="note-icon">${icon("ai")}</span>
          <span class="note-text">
            <span class="title">${escapeHtml(chat.title || "无标题对话")}</span>
            <span class="meta">${escapeHtml(describeNote(chat, false))}</span>
          </span>
        </button>`
          )
          .join("")}</div>`;

  return `
    <div class="screen" id="ai-screen">
      <div class="appbar">
        <button id="ai-back" class="icon-only ghost" aria-label="返回">${icon("back", "icon-lg")}</button>
        <span class="screen-title">AI 笔记</span>
        <span class="appbar-spacer"></span>
      </div>
      <div class="view">
        <div class="section-head">
          <span>对话</span>
          <span class="section-count">${chats.length} 个</span>
        </div>
        ${body}
      </div>
    </div>
  `;
}

async function renderDetail(noteId: string): Promise<string> {
  const note = await api.getNote(noteId);
  if (!note) return "";

  const ink = await api.loadInk(noteId);
  state.hasInk = Boolean(ink.attachmentId);

  const labels = note.labels
    .filter((label) => !label.name.startsWith("_"))
    .slice(0, 12)
    .map((label) => `<span class="chip">${escapeHtml(label.value ? `${label.name}=${label.value}` : label.name)}</span>`)
    .join("");

  const attachments = await api.listAttachments(noteId);
  const stubbedAttachments = attachments.filter((attachment) => attachment.stubbed);
  const undownloaded = note.contentStubbed ? 1 + stubbedAttachments.length : stubbedAttachments.length;

  // Attachments are stubbed above the sync cap, which for a real vault is most of the bytes. Saying
  // so, and offering the download, is the difference between "empty note" and "not fetched yet".
  const stubbed = note.contentStubbed
    ? `<div class="banner">
         <span>正文超过同步上限，尚未下载到本机。</span>
         <button id="fetch-note-blob">下载正文</button>
       </div>`
    : "";

  const attachmentList =
    attachments.length > 0
      ? `<div class="attachments">
           ${attachments
             .map(
               (attachment) => `
             <div class="attachment">
               <span class="attachment-title">${escapeHtml(attachment.title)}</span>
               <span class="attachment-meta">${escapeHtml(attachment.mime || attachment.role)}</span>
               ${
                 attachment.stubbed
                   ? `<button data-fetch-attachment="${attachment.attachmentId}">${icon("download")} 下载</button>`
                   : `<span class="attachment-meta">已缓存</span>`
               }
             </div>`
             )
             .join("")}
         </div>`
      : "";

  // Always offered, not only when there is already something attached: the first file needs a way in.
  const attachmentBar = `
    <div class="attachments">
      <button id="add-attachment" class="attachment-add">
        ${icon("plus")} 添加附件
      </button>
    </div>`;

  const renderable = note.type === "text" || note.type === "code";

  // Editing is intentionally only offered for the note types this client can round-trip safely.
  // A `book`, `canvas` or `render` note has structure this simple editor would destroy.
  const desktop = isPad();
  const toolbar = desktop && renderable ? renderDetailToolbar(note) : "";

  const bodyClass = state.detailMode === "edit" ? "body editing" : "body";

  const body =
    state.detailMode === "edit"
      ? `<div id="editor" class="editor" contenteditable="true" spellcheck="false">${sanitizeHtml(note.content)}</div>`
      : `${stubbed}${renderContent(note)}`;

  // In ink mode the content stops scrolling so the strokes stay aligned with what they annotate.
  const inkLayer =
    state.detailMode === "ink" || state.hasInk
      ? `<canvas id="ink-layer" class="ink-layer${state.detailMode === "ink" ? " active" : ""}"></canvas>`
      : "";

  return `
    <div class="detail" data-mode="${state.detailMode}">
      <div class="appbar">
        <button id="detail-back" class="ghost">${icon("back")} 返回</button>
        <h1>${escapeHtml(note.title || "(无标题)")}</h1>
      </div>
      ${toolbar}
      <div class="${bodyClass}" id="detail-body">
        ${body}
        ${inkLayer}
      </div>
      ${state.detailMode === "ink" ? renderInkToolbar() : ""}
      ${labels ? `<div class="label-chips">${labels}</div>` : ""}
      ${attachmentList}
      ${attachmentBar}
      ${
        undownloaded > 0 && state.detailMode !== "ink"
          ? `<div class="cache-note">本机还有 ${undownloaded} 项内容未下载</div>`
          : ""
      }
    </div>
  `;
}

function renderDetailToolbar(note: NoteDetail): string {
  const active = (mode: DetailMode) => (state.detailMode === mode ? " active" : "");
  const inkLabel = state.inkDirty ? "笔迹 •" : "笔迹";

  if (state.detailMode === "edit") {
    return `<div class="detail-toolbar">
      <button id="mode-save" class="primary">保存</button>
      <button id="mode-cancel">取消</button>
    </div>`;
  }

  return `<div class="detail-toolbar">
    <button id="mode-edit" class="${active("edit").trim()}">编辑</button>
    <button id="mode-ink" class="${active("ink").trim()}">${inkLabel}</button>
  </div>`;
}

function renderInkToolbar(): string {
  return `<div class="ink-toolbar">
    <span class="ink-hint" id="ink-hint">用笔或手指书写</span>
    <button data-ink-color="#e8eaed" class="swatch" style="--swatch:#e8eaed" aria-label="白色"></button>
    <button data-ink-color="#ff6b6b" class="swatch" style="--swatch:#ff6b6b" aria-label="红色"></button>
    <button data-ink-color="#3ddc84" class="swatch" style="--swatch:#3ddc84" aria-label="绿色"></button>
    <button data-ink-color="#6ea8fe" class="swatch" style="--swatch:#6ea8fe" aria-label="蓝色"></button>
    <button id="ink-undo">撤销</button>
    <button id="ink-clear">清空</button>
    <button id="ink-save" class="primary" ${state.inkDirty ? "" : "disabled"}>保存笔迹</button>
  </div>`;
}

/**
 * Note content is Trilium-flavoured CKEditor HTML, so it is injected rather than parsed into native
 * views. It is sanitised first: a note may have arrived from any server, and in the native shell
 * this document has a JS bridge attached.
 */
function renderContent(note: NoteDetail): string {
  if (note.content === "") return `<div class="empty">（空笔记）</div>`;

  if (note.type === "code") return `<pre>${escapeHtml(note.content)}</pre>`;

  if (note.type === "image") {
    if (note.dataUrl) return `<img class="note-image" src="${note.dataUrl}" alt="${escapeAttr(note.title)}" />`;
    return `<div class="empty">图片还在服务端，点上面的「下载正文」取回。</div>`;
  }

  if (note.type === "file") {
    if (note.dataUrl) {
      return `<a class="note-file" href="${note.dataUrl}" download="${escapeAttr(note.title)}">
        ${icon("file")} 下载 ${escapeHtml(note.title)}
      </a>`;
    }
    return `<div class="empty">附件笔记（${escapeHtml(note.mime)}）——需先下载。</div>`;
  }

  return sanitizeHtml(note.content);
}

// ---------------------------------------------------------------------- wire

function wire(): void {
  // ---------------------------------------------------------------- navigation

  document.querySelectorAll<HTMLButtonElement>(".segmented [data-tab]").forEach((button) => {
    button.addEventListener("click", () => {
      state.tab = button.dataset.tab as Tab;
      state.openNoteId = null;
      state.settingsOpen = false;
      void render();
    });
  });

  /** Descend into a book, remembering its title so the breadcrumb needs no query. */
  document.querySelectorAll<HTMLElement>("[data-into]").forEach((card) => {
    card.addEventListener("click", () => {
      const noteId = card.dataset.into!;
      const title = card.querySelector(".title")?.textContent ?? "";
      state.libraryPath = [...state.libraryPath, noteId];
      state.libraryTitles = [...state.libraryTitles, title];
      pushStep();
      void render();
    });
  });

  document.querySelectorAll<HTMLElement>("[data-open]").forEach((card) => {
    card.addEventListener("click", () => {
      state.openNoteId = card.dataset.open!;
      pushStep();
      void render();
    });
  });

  document.querySelectorAll<HTMLElement>("[data-crumb]").forEach((crumb) => {
    crumb.addEventListener("click", () => {
      const at = crumb.dataset.crumb;
      const depth = at === "root" ? 0 : Number(at) + 1;
      state.libraryPath = state.libraryPath.slice(0, depth);
      state.libraryTitles = state.libraryTitles.slice(0, depth);
      void render();
    });
  });

  // --------------------------------------------------------------- the sheet

  document.getElementById("open-sheet")?.addEventListener("click", () => {
    state.sheet = "view";
    pushStep();
    void render();
  });

  document.getElementById("sheet-cancel")?.addEventListener("click", () => history.back());
  document.getElementById("sheet-backdrop")?.addEventListener("click", (event) => {
    // Only the backdrop itself closes it; taps inside the sheet must not.
    if (event.target === event.currentTarget) history.back();
  });

  document.querySelectorAll<HTMLElement>("[data-choice]").forEach((button) => {
    button.addEventListener("click", () => {
      const group = button.dataset.choice as "layout" | "sort";
      state[group] = button.dataset.value as never;

      // Picking closes the sheet, the way the reference's rows do: choose, and you are returned.
      // Closing is left to `stepBack` — clearing `sheet` here first would leave it with nothing to
      // do, and the new layout would never be rendered.
      if (history.state?.triliumStep) history.back();
      else {
        state.sheet = "none";
        void render();
      }
    });
  });

  document.getElementById("sheet-sync")?.addEventListener("click", () => {
    state.sheet = "none";
    void runSync(true);
  });

  document.getElementById("sheet-settings")?.addEventListener("click", () => {
    state.sheet = "none";
    state.settingsOpen = true;
    pushStep();
    void renderSettings();
  });

  // -------------------------------------------------------------- the editor

  document.getElementById("open-editor")?.addEventListener("click", () => {
    state.editorOpen = true;
    state.editorTitle = "";
    state.editorBody = "";
    pushStep();
    void render();
  });

  document.getElementById("editor-cancel")?.addEventListener("click", () => history.back());

  document.getElementById("editor-save")?.addEventListener("click", () => {
    void saveFromEditor();
  });

  document.getElementById("editor-image")?.addEventListener("click", () => {
    void addImageToInbox();
  });

  // `⌘/Ctrl + Enter` keeps the keyboard shortcut the inline form had.
  document.getElementById("editor-body")?.addEventListener("keydown", (event) => {
    const keyboard = event as KeyboardEvent;
    if (keyboard.key === "Enter" && (keyboard.metaKey || keyboard.ctrlKey)) {
      keyboard.preventDefault();
      void saveFromEditor();
    }
  });

  // -------------------------------------------------------------- the search

  document.getElementById("open-search")?.addEventListener("click", () => {
    state.searchOpen = true;
    state.searchQuery = "";
    pushStep();
    void render().then(() => document.getElementById("search-input")?.focus());
  });

  document.getElementById("search-cancel")?.addEventListener("click", () => history.back());

  // ----------------------------------------------------------------- the AI

  document.getElementById("open-ai")?.addEventListener("click", () => {
    state.aiOpen = true;
    pushStep();
    void render();
  });

  document.getElementById("ai-back")?.addEventListener("click", () => history.back());

  document.querySelectorAll<HTMLElement>("#ai-screen [data-open]").forEach((card) => {
    card.addEventListener("click", () => {
      state.aiOpen = false;
      state.openNoteId = card.dataset.open!;
      pushStep();
      void render();
    });
  });

  const searchInput = document.getElementById("search-input") as HTMLInputElement | null;
  if (searchInput) {
    searchInput.addEventListener("input", () => {
      state.searchQuery = searchInput.value;
      void renderSearchResults();
    });
    if (state.searchQuery) void renderSearchResults();
  }

  document.getElementById("detail-back")?.addEventListener("click", () => {
    // Go through history so the hardware back button and this button share one stack.
    history.back();
  });

  document.getElementById("add-attachment")?.addEventListener("click", () => {
    void addAttachmentToOpenNote();
  });

  if (state.openNoteId) void wireDetail(state.openNoteId);
}

/**
 * Ask for a file.
 *
 * `<input type="file">` is the only picker a WebView offers, and on HarmonyOS it does nothing at all
 * unless the shell implements `onShowFileSelector` — which `Index.ets` now does. Kept as a promise so
 * callers read like the rest of the app rather than like event plumbing.
 */
function pickFile(accept: string): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept;
    input.style.display = "none";
    document.body.appendChild(input);

    input.addEventListener("change", () => {
      const file = input.files?.[0] ?? null;
      input.remove();
      resolve(file);
    });

    // A cancelled picker fires no event in some engines; `cancel` covers the ones that do.
    input.addEventListener("cancel", () => {
      input.remove();
      resolve(null);
    });

    input.click();
  });
}

/** Read a picked file as bytes, for a path that expects a `Uint8Array`. */
async function readBytes(file: File): Promise<Uint8Array> {
  return new Uint8Array(await file.arrayBuffer());
}

/** Write the editor's contents as a note, then leave. */
async function saveFromEditor(): Promise<void> {
  const titleInput = document.getElementById("editor-title") as HTMLInputElement | null;
  const bodyInput = document.getElementById("editor-body") as HTMLTextAreaElement | null;

  const title = (titleInput?.value ?? state.editorTitle).trim();
  const body = bodyInput?.value ?? state.editorBody;

  if (!title && !body.trim()) {
    showToast("什么都没写", true);
    return;
  }

  state.busy = true;

  try {
    // A note with no title takes its first line, which is what a quick note is.
    const resolved = title || body.trim().split("\n")[0]!.slice(0, 80);
    const inbox = await api.inboxNoteId();

    await api.createTextNote({
      parentNoteId: inbox,
      title: resolved,
      content: `<p>${escapeHtml(body.trim()).replace(/\n/g, "</p><p>")}</p>`
    });

    state.editorOpen = false;
    state.editorTitle = "";
    state.editorBody = "";
    history.back();

    await refreshChrome();
    showToast("已保存，等待同步", false);
    await render();
  } catch (error) {
    showToast(error instanceof Error ? error.message : String(error), true);
  } finally {
    state.busy = false;
  }
}

/**
 * Add an image as an image note in the inbox.
 *
 * An image note rather than an attachment, because that is what a picture taken on a phone is: a
 * thing of its own that happens to live in the inbox, exactly as Trilium models a standalone image.
 * The editor's text is kept, so a picture and a thought can be captured together.
 */
async function addImageToInbox(): Promise<void> {
  const file = await pickFile("image/*");
  if (!file) return;

  try {
    const inbox = await api.inboxNoteId();
    const title = state.editorTitle.trim() || file.name.replace(/\.[^.]+$/, "") || "图片";

    const created = await api.createImageNote({
      parentNoteId: inbox,
      title,
      mime: file.type || "image/png",
      bytes: await readBytes(file)
    });

    // Keep whatever was typed, then leave: the image is saved and the text still needs saving.
    state.editorBody = (document.getElementById("editor-body") as HTMLTextAreaElement | null)?.value
      ?? state.editorBody;

    await refreshChrome();
    showToast(`已添加图片 ${file.name}`, false);

    if (!state.editorBody.trim()) {
      state.editorOpen = false;
      history.back();
    }

    await render();
    void created;
  } catch (error) {
    showToast(error instanceof Error ? error.message : String(error), true);
  }
}

/** Attach a file to the note that is open. */
async function addAttachmentToOpenNote(): Promise<void> {
  const noteId = state.openNoteId;
  if (!noteId) return;

  const file = await pickFile("*/*");
  if (!file) return;

  try {
    await api.attachFile({
      ownerNoteId: noteId,
      title: file.name,
      mime: file.type || "application/octet-stream",
      bytes: await readBytes(file)
    });

    await refreshChrome();
    showToast(`已附加 ${file.name}`, false);
    await render();
  } catch (error) {
    showToast(error instanceof Error ? error.message : String(error), true);
  }
}

/** The search screen's body, rendered on its own so typing does not re-render the whole app. */
async function renderSearchResults(): Promise<void> {
  const container = document.getElementById("search-results");
  if (!container) return;

  const query = state.searchQuery.trim();
  const results = await api.search(query, 60);

  if (results.length === 0) {
    container.innerHTML = `<div class="empty">没有匹配的笔记。<br />搜索在本地进行，标题和正文都会命中。</div>`;
    return;
  }

  container.innerHTML = renderNoteCollection(sortNotes(results), "notes");
  // The collection is new markup, so its handlers have to be attached again.
  container.querySelectorAll<HTMLElement>("[data-open]").forEach((card) => {
    card.addEventListener("click", () => {
      state.searchOpen = false;
      state.openNoteId = card.dataset.open!;
      pushStep();
      void render();
    });
  });
}

async function wireDetail(noteId: string): Promise<void> {
  const canvas = document.getElementById("ink-layer") as HTMLCanvasElement | null;

  if (canvas && state.detailMode === "ink") {
    // The canvas becomes live *before* the stored strokes are read back. Awaiting the attachment
    // first leaves the element visible but inert, so a stroke drawn in that window is simply lost —
    // and the window is a network-shaped one, not a frame.
    inkCanvas = new InkCanvas(canvas, createInkDoc(aspectOf(canvas)), {
      color: currentInkColor,
      width: currentInkWidth,
      onChange: () => {
        // Dirty only once there is something to save, so a stray tap does not offer an empty save.
        state.inkDirty = (inkCanvas?.document.strokes.length ?? 0) > 0;
        const save = document.getElementById("ink-save") as HTMLButtonElement | null;
        if (save) save.disabled = !state.inkDirty;
      }
    });

    requestAnimationFrame(() => {
      inkCanvas?.resize();
      updateInkHint();
    });

    void api.loadInk(noteId).then((stored) => {
      if (stored.doc && inkCanvas) inkCanvas.setDocument(parseInkDoc(stored.doc));
    });
  } else if (canvas && state.hasInk) {
    // Read-only display: the phone annotates nothing, but it must still show what a tablet drew.
    const stored = await api.loadInk(noteId);
    const doc = parseInkDoc(stored.doc);
    requestAnimationFrame(() => paintInk(canvas, doc));
  }

  // ---------------------------------------------------------------- modes

  document.getElementById("mode-edit")?.addEventListener("click", () => {
    state.detailMode = "edit";
    void render();
  });

  document.getElementById("mode-ink")?.addEventListener("click", () => {
    state.detailMode = state.detailMode === "ink" ? "view" : "ink";
    void render();
  });

  document.getElementById("mode-cancel")?.addEventListener("click", () => {
    state.detailMode = "view";
    void render();
  });

  document.getElementById("mode-save")?.addEventListener("click", async () => {
    const editor = document.getElementById("editor");
    if (!editor) return;

    // The editor holds sanitised HTML, so what is saved is what the sanitiser produced — an edit
    // can never introduce a script that the read path would then have to strip.
    await api.updateNoteContent(noteId, editor.innerHTML);
    state.detailMode = "view";
    showToast("已保存", false);
    // Refresh first: the status bar must say the change is owed to the server straight away, not
    // only after the next unrelated action refreshes it.
    await refreshChrome();
    await render();
  });

  // ------------------------------------------------------- on-demand downloads

  document.getElementById("fetch-note-blob")?.addEventListener("click", async (event) => {
    const button = event.currentTarget as HTMLButtonElement;
    button.disabled = true;
    button.textContent = "下载中…";

    const result = await api.fetchNoteBlob(noteId);

    if (result.fetched) {
      showToast(`已下载 ${(result.bytes / 1024).toFixed(0)} KB`, false);
    } else {
      showToast(result.error ?? "下载失败", true);
    }

    await render();
  });

  document.querySelectorAll<HTMLElement>("[data-fetch-attachment]").forEach((button) => {
    button.addEventListener("click", async () => {
      const attachmentId = button.dataset.fetchAttachment;
      if (!attachmentId) return;

      button.textContent = "下载中…";
      const result = await api.fetchAttachmentBlob(attachmentId);

      if (result.fetched) {
        showToast(`已下载 ${(result.bytes / 1024).toFixed(0)} KB`, false);
      } else {
        showToast(result.error ?? "下载失败", true);
      }

      await render();
    });
  });

  // --------------------------------------------------------------- ink tools

  document.querySelectorAll<HTMLElement>("[data-ink-color]").forEach((swatch) => {
    swatch.addEventListener("click", () => {
      currentInkColor = swatch.dataset.inkColor ?? currentInkColor;
      inkCanvas?.setStyle({ color: currentInkColor });
    });
  });

  document.getElementById("ink-undo")?.addEventListener("click", () => {
    inkCanvas?.undo();
    state.inkDirty = (inkCanvas?.document.strokes.length ?? 0) > 0;
    const save = document.getElementById("ink-save") as HTMLButtonElement | null;
    if (save) save.disabled = !state.inkDirty;
  });

  document.getElementById("ink-clear")?.addEventListener("click", () => {
    inkCanvas?.clear();
    state.inkDirty = (inkCanvas?.document.strokes.length ?? 0) > 0;
    const save = document.getElementById("ink-save") as HTMLButtonElement | null;
    if (save) save.disabled = !state.inkDirty;
  });

  document.getElementById("ink-save")?.addEventListener("click", async () => {
    if (!inkCanvas) return;

    await api.saveInk(noteId, serializeInkDoc(inkCanvas.document));
    state.inkDirty = false;
    state.hasInk = true;
    showToast("笔迹已保存，将随笔记同步", false);
    await refreshChrome();
    await render();
  });
}

/** Remembered across notes, because a pen's colour is a property of the session, not the note. */
let currentInkColor = "#e8eaed";
const currentInkWidth = 0.004;

function aspectOf(canvas: HTMLCanvasElement): number {
  const rect = canvas.getBoundingClientRect();
  return rect.height > 0 ? rect.width / rect.height : 1;
}

/** Tell the user whether a stylus is actually being recognised — the one thing docs cannot promise. */
function updateInkHint(): void {
  const hint = document.getElementById("ink-hint");
  if (!hint || !inkCanvas) return;

  hint.textContent = inkCanvas.sawPen
    ? "已识别到手写笔"
    : "用笔或手指书写";
}

// ------------------------------------------------------------------- actions

/**
 * Run a sync.
 *
 * `announce` distinguishes a sync the user asked for from one that happens on its own. The bar is
 * silent when everything is fine, so a *manual* sync needs a result it can point at; an automatic
 * one does not, and announcing every boot sync would be noise.
 */
async function runSync(announce = false): Promise<void> {
  state.syncing = true;
  state.lastMessage = "连接中…";
  await render();

  try {
    const outcome = await api.sync();
    state.lastOk = outcome.ok;
    state.lastMessage = outcome.message;

    // The bar only shows "同步失败"; the sentence that explains it arrives as a toast.
    if (!outcome.ok) showToast(outcome.message || "同步失败", true);
    else if (announce) showToast(outcome.message || "已同步", false);
  } catch (error) {
    state.lastOk = false;
    state.lastMessage = error instanceof Error ? error.message : String(error);
    showToast(state.lastMessage, true);
  } finally {
    state.syncing = false;
    state.progress = null;
    await refreshChrome();
    await render();
  }
}

// -------------------------------------------------------------------- setup

async function renderSetup(error?: string): Promise<void> {
  // In a browser the only address that can work is this page's own origin (the server sends
  // `Cross-Origin-Resource-Policy: same-origin`). Inside the shell the request goes out natively, so
  // the field must hold the server's real address instead.
  const host = state.serverHost ?? (hasNativeBridge() ? "" : location.origin);

  commit(`
    <div class="setup">
      <img class="brand-mark" src="/icon-192.png" alt="" width="72" height="72" />
      <h2>连接 Trilium 服务端</h2>
      <p>
        填入你自建服务端的地址与密码。密码只用于读取同步密钥，之后同步走的是
        documentSecret 的 HMAC，不会再发送密码。
      </p>
      ${error ? `<div class="banner bad">${escapeHtml(error)}</div>` : ""}
      <div class="field">
        <label for="server">服务端地址</label>
        <input id="server" type="url" inputmode="url" autocapitalize="off" autocorrect="off"
               spellcheck="false" placeholder="http://192.168.1.10:8080" value="${escapeAttr(host)}" />
      </div>
      <div class="field">
        <label for="password">密码</label>
        <input id="password" type="password" autocomplete="current-password" />
      </div>
      <button class="primary" id="connect" ${state.busy ? "disabled" : ""}>
        ${state.busy ? "连接中…" : "连接并首次同步"}
      </button>
      <p>
        首次同步会拉取整个笔记树。二进制附件超过 4 MiB 的部分不会下载，点开时再按需获取。
      </p>
      <p class="note">
        ⚠️ 地址必须与当前页面<b>同源</b>。Trilium 服务端返回
        <code>Cross-Origin-Resource-Policy: same-origin</code> 且不带 CORS 头，浏览器会直接拒绝
        跨源读取。开发时由 Vite 代理 <code>/api</code> 转发到真实服务端；正式环境请把本应用
        部署在服务端同源之下（或由原生外壳代为转发请求）。
      </p>
    </div>
  `);

  document.getElementById("connect")?.addEventListener("click", async () => {
    const serverHost = (document.getElementById("server") as HTMLInputElement).value.trim();
    const password = (document.getElementById("password") as HTMLInputElement).value;

    if (!serverHost || !password) {
      await renderSetup("请填写服务端地址和密码");
      return;
    }

    state.busy = true;
    await renderSetup("");

    try {
      await api.configure(serverHost, password);
      state.busy = false;
      await refreshChrome();
      await render();
      await runSync();
    } catch (error) {
      state.busy = false;
      await refreshChrome();
      await renderSetup(error instanceof Error ? error.message : String(error));
    }
  });
}

async function renderSettings(): Promise<void> {
  const [vault, cap] = await Promise.all([api.vaultInfo(), api.maxBlobContentSize()]);
  const counts = vault.counts;
  state.openNoteId = null;
  state.settingsOpen = true;

  commit(`
    <div class="appbar">
      <button id="settings-back" class="ghost">${icon("back")} 返回</button>
      <h1>设置</h1>
    </div>
    <div class="view">
      <div class="banner">
        服务端：${escapeHtml(vault.serverHost || "(未配置)")}<br />
        知识库 ID：<code>${escapeHtml(vault.documentId ?? "(未绑定)")}</code><br />
        本地：${counts.notes.toLocaleString("en-US")} 条笔记 ·
        ${counts.branches.toLocaleString("en-US")} 个分支 ·
        ${counts.attributes.toLocaleString("en-US")} 个属性 ·
        ${counts.blobs.toLocaleString("en-US")} 个内容块
      </div>
      <div class="banner">
        换到<b>另一个知识库</b>时本地副本会自动清除——两个库的实体混在一起是无法复原的。
        下面的按钮只在你想手动清空时用。
      </div>
      <div class="field">
        <label for="blob-cap">附件同步上限（字节，0 = 不限制）</label>
        <input id="blob-cap" type="number" inputmode="numeric" value="${cap}" />
      </div>
      <button id="save-settings" class="primary">保存</button>
      <button id="reconfigure" style="margin-top:10px">重新配置服务端</button>
      <button id="clear-data" class="danger">清除本地数据（保留连接设置）</button>
    </div>
  `);

  document.getElementById("settings-back")?.addEventListener("click", () => history.back());

  document.getElementById("save-settings")?.addEventListener("click", async () => {
    const value = Number((document.getElementById("blob-cap") as HTMLInputElement).value);
    await api.setMaxBlobContentSize(Number.isFinite(value) && value >= 0 ? value : 4 * 1024 * 1024);
    showToast("已保存", false);
    await render();
  });

  document.getElementById("reconfigure")?.addEventListener("click", async () => {
    // Also wipes: "reconfigure" means start over, and leaving the old vault's rows behind is the
    // bug this button used to have.
    await api.reset();
    await refreshChrome();
    await renderSetup();
  });

  document.getElementById("clear-data")?.addEventListener("click", async () => {
    await api.clearLocalData();
    await refreshChrome();
    showToast("本地副本已清除，下次同步会重新拉取", false);
    await render();
  });
}

// -------------------------------------------------------------------- helpers

/**
 * Show a transient message.
 *
 * Deliberately does *not* go through `render()`. It used to set state and re-render on a timer,
 * which meant a toast dismissing two seconds later replaced the entire view — destroying anything
 * the user had started in the meantime. Drawing a stroke while an earlier toast was still up lost
 * the stroke, and the same would have happened to a half-typed note. The toast now owns its own
 * element and touches nothing else.
 */
function showToast(text: string, bad: boolean): void {
  document.querySelector(".toast")?.remove();

  const element = document.createElement("div");
  element.className = bad ? "toast bad" : "toast";
  element.textContent = text;
  document.body.appendChild(element);

  window.setTimeout(() => element.remove(), 2400);
}

function firstLine(text: string): string {
  return text.split("\n").map((line) => line.trim()).find((line) => line.length > 0) ?? "";
}

function formatDate(utc: string): string {
  const match = utc?.match(/^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})/);
  if (!match) return "";

  const [, year, month, day, hour, minute] = match;
  const then = Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute));
  const deltaMinutes = (Date.now() - then) / 60000;

  if (deltaMinutes < 1) return "刚刚";
  if (deltaMinutes < 60) return `${Math.floor(deltaMinutes)} 分钟前`;
  if (deltaMinutes < 60 * 24) return `${Math.floor(deltaMinutes / 60)} 小时前`;
  if (deltaMinutes < 60 * 24 * 7) return `${Math.floor(deltaMinutes / (60 * 24))} 天前`;

  return `${year}-${month}-${day}`;
}

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeAttr(input: string): string {
  return escapeHtml(input);
}

/**
 * Allow-list sanitiser for note HTML.
 *
 * Note content is authored on other devices and arrives over the network, and in the native shell
 * this document has a JS bridge attached — so scripts, event handlers, `javascript:` URLs, embedded
 * frames and remote form posts are all stripped rather than trusted.
 */
export function sanitizeHtml(html: string): string {
  const template = document.createElement("template");
  template.innerHTML = html;

  const ALLOWED = new Set([
    "P", "BR", "B", "STRONG", "I", "EM", "U", "S", "DEL", "CODE", "PRE", "BLOCKQUOTE",
    "UL", "OL", "LI", "H1", "H2", "H3", "H4", "H5", "H6", "HR", "SPAN", "DIV",
    "TABLE", "THEAD", "TBODY", "TR", "TD", "TH", "FIGURE", "FIGCAPTION",
    "A", "IMG", "MARK", "SUB", "SUP", "SMALL"
  ]);

  for (const element of Array.from(template.content.querySelectorAll("*"))) {
    if (!ALLOWED.has(element.tagName)) {
      element.replaceWith(...Array.from(element.childNodes));
      continue;
    }

    for (const attribute of Array.from(element.attributes)) {
      const name = attribute.name.toLowerCase();
      const value = attribute.value;

      const keep =
        name === "href" ||
        name === "title" ||
        name === "alt" ||
        name === "src" ||
        name === "colspan" ||
        name === "rowspan" ||
        name.startsWith("data-") ||
        (name === "class" && /^(language-|trilium-)/.test(value));

      if (!keep) {
        element.removeAttribute(attribute.name);
        continue;
      }

      if ((name === "href" || name === "src") && /^\s*(javascript|data|vbscript):/i.test(value)) {
        element.removeAttribute(attribute.name);
      }
    }

    if (element.tagName === "A") {
      element.setAttribute("target", "_blank");
      element.setAttribute("rel", "noopener noreferrer");
    }
  }

  return template.innerHTML;
}

void boot();
