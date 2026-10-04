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
import { InkCanvas, createInkDoc, paintInk, parseInkDoc, serializeInkDoc } from "./ink.js";
import { WorkerClient, type AppCounts, type ProgressEvent } from "./rpc.js";
import "./style.css";

type Tab = "capture" | "search" | "browse";

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
  toast: { text: string; bad: boolean } | null;
  /** Detail-view mode. Editing and ink are tablet features; the phone stays read-only by design. */
  detailMode: DetailMode;
  /** Set when the ink layer has unsaved strokes. */
  inkDirty: boolean;
  /** Set when the note currently has an ink attachment, so the layer must be drawn. */
  hasInk: boolean;
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
  tab: "capture",
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
  toast: null,
  detailMode: "view",
  inkDirty: false,
  hasInk: false
};

let inkCanvas: InkCanvas | null = null;

const worker = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
const api = new WorkerClient(worker);
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

// ---------------------------------------------------------------------- boot

async function boot(): Promise<void> {
  app.innerHTML = `<div class="empty">正在打开本地数据库…</div>`;

  try {
    await api.ready();
    await refreshChrome();
    await render();
  } catch (error) {
    app.innerHTML = `
      <div class="setup">
        <h2>无法打开本地数据库</h2>
        <p>${escapeHtml(String(error))}</p>
        <p>此应用需要 OPFS 存储，必须通过 http(s) 访问。</p>
      </div>`;
  }
}

/** Small pieces of cross-view state, refreshed after actions rather than on every render. */
async function refreshChrome(): Promise<void> {
  state.configured = await api.isConfigured();
  state.serverHost = await api.serverHost();
  state.pending = state.configured ? await api.pendingPushCount() : 0;
}

// -------------------------------------------------------------------- render

async function render(): Promise<void> {
  inkCanvas?.destroy();
  inkCanvas = null;

  if (!state.configured) {
    renderSetup();
    return;
  }

  const view = await renderView();
  const detail = state.openNoteId ? await renderDetail(state.openNoteId) : "";

  app.innerHTML = `
    ${renderAppbar()}
    <div class="view" id="view">${view}</div>
    ${renderTabbar()}
    ${detail}
    ${state.toast ? `<div class="toast ${state.toast.bad ? "bad" : ""}">${escapeHtml(state.toast.text)}</div>` : ""}
  `;

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

function renderAppbar(): string {
  const statusClass = state.syncing ? "busy" : state.lastOk ? "ok" : "bad";

  const label = state.syncing
    ? state.progress?.message || "同步中…"
    : state.pending > 0
      ? `${state.pending} 项待同步`
      : state.lastMessage || "已同步";

  return `
    <div class="appbar">
      <h1>TriliumMobile</h1>
      <span class="status ${statusClass}" id="status">${escapeHtml(label)}</span>
      <button id="sync" ${state.syncing ? "disabled" : ""}>${state.syncing ? "…" : "同步"}</button>
      <button id="settings" class="ghost" aria-label="设置">⚙</button>
    </div>
  `;
}

function renderTabbar(): string {
  const tab = (id: Tab, glyph: string, label: string) =>
    `<button data-tab="${id}" aria-selected="${state.tab === id}">
       <span class="glyph">${glyph}</span><span>${label}</span>
     </button>`;

  return `<nav class="tabbar">
    ${tab("capture", "✎", "速记")}
    ${tab("search", "⌕", "速查")}
    ${tab("browse", "☰", "浏览")}
  </nav>`;
}

async function renderView(): Promise<string> {
  switch (state.tab) {
    case "capture":
      return renderCapture(await api.counts());
    case "search":
      return renderSearch();
    case "browse":
      return renderBrowse();
  }
}

function renderCapture(counts: AppCounts): string {
  return `
    <div class="quick-note">
      <div class="banner">
        离线可用。保存后写入本地，联网时自动同步。
        本地现有 ${counts.notes.toLocaleString("en-US")} 条笔记。
      </div>
      <div class="field">
        <label for="capture-title">标题（可留空，自动取首行）</label>
        <input id="capture-title" placeholder="标题" autocomplete="off" enterkeyhint="next" />
      </div>
      <textarea id="capture-body" placeholder="随手记点什么…" enterkeyhint="enter"></textarea>
      <div class="capture-actions">
        <span class="hint">⌘/Ctrl + Enter 快速保存</span>
        <button class="primary" id="capture-save" ${state.busy ? "disabled" : ""}>保存</button>
      </div>
    </div>
  `;
}

async function renderSearch(): Promise<string> {
  const results = state.query.trim() ? await api.search(state.query) : await api.recent(30);

  const heading = state.query.trim() ? `${results.length} 条结果` : "最近修改（输入以搜索标题与正文）";

  const body =
    results.length === 0
      ? `<div class="empty">没有匹配的笔记。<br />搜索在本地进行，标题和正文都会命中。</div>`
      : `<div class="list">${await renderRows(results)}</div>`;

  return `
    <input id="search-input" type="search" placeholder="搜索…" value="${escapeAttr(state.query)}"
           autocomplete="off" autocorrect="off" spellcheck="false" enterkeyhint="search" />
    <div class="banner" style="margin-top:12px">${escapeHtml(heading)}</div>
    ${body}
  `;
}

async function renderBrowse(): Promise<string> {
  const current = state.browsePath[state.browsePath.length - 1] ?? ROOT_NOTE_ID;
  const [children, trail] = await Promise.all([api.childrenOf(current), api.breadcrumb(current)]);

  const crumbs = trail
    .map((crumb, index) => `<span data-crumb="${index}">${escapeHtml(crumb.title)}</span>`)
    .join(" <span>›</span> ");

  const body =
    children.length === 0
      ? `<div class="empty">这个笔记没有子笔记。</div>`
      : `<div class="list">${await renderRows(children, true)}</div>`;

  return `<div class="crumbs">${crumbs}</div>${body}`;
}

async function renderRows(notes: NoteSummary[], showTree = false): Promise<string> {
  const rows = await Promise.all(
    notes.map(async (note) => {
      const [detail, kids] = await Promise.all([
        api.getNote(note.noteId),
        showTree ? api.childCount(note.noteId) : Promise.resolve(0)
      ]);

      const snippet = detail ? toSnippet(detail.content) : "";
      const meta = [
        note.type !== "text" ? note.type : null,
        kids > 0 ? `${kids} 个子笔记` : null,
        formatDate(note.utcDateModified)
      ]
        .filter(Boolean)
        .join(" · ");

      return `
        <button class="row" data-note-id="${note.noteId}" data-is-dir="${showTree && kids > 0}">
          <span class="title">${escapeHtml(note.title || "(无标题)")}</span>
          ${snippet ? `<span class="snippet">${escapeHtml(snippet)}</span>` : ""}
          <span class="meta">${escapeHtml(meta)}</span>
        </button>
      `;
    })
  );

  return rows.join("");
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
                   ? `<button data-fetch-attachment="${attachment.attachmentId}">下载</button>`
                   : `<span class="attachment-meta">已缓存</span>`
               }
             </div>`
             )
             .join("")}
         </div>`
      : "";

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
        <button id="detail-back" class="ghost" aria-label="返回">‹ 返回</button>
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
    return `<div class="empty">图片笔记（${escapeHtml(note.mime)}）——本版本不在移动端渲染二进制内容。</div>`;
  }

  if (note.type === "file") {
    return `<div class="empty">附件笔记（${escapeHtml(note.mime)}）——需在桌面端打开。</div>`;
  }

  return sanitizeHtml(note.content);
}

// ---------------------------------------------------------------------- wire

function wire(): void {
  document.querySelectorAll<HTMLButtonElement>("[data-tab]").forEach((button) => {
    button.addEventListener("click", () => {
      state.tab = button.dataset.tab as Tab;
      state.openNoteId = null;
      void render();
    });
  });

  document.getElementById("sync")?.addEventListener("click", () => void runSync());
  document.getElementById("settings")?.addEventListener("click", () => void renderSettings());

  wireCapture();
  wireSearch();

  document.querySelectorAll<HTMLElement>("[data-crumb]").forEach((crumb) => {
    crumb.addEventListener("click", () => {
      state.browsePath = state.browsePath.slice(0, Number(crumb.dataset.crumb) + 1);
      void render();
    });
  });

  document.getElementById("detail-back")?.addEventListener("click", () => {
    state.openNoteId = null;
    state.detailMode = "view";
    void render();
  });

  if (state.openNoteId) void wireDetail(state.openNoteId);
}

/**
 * Wire the note-detail view.
 *
 * The ink canvas is created here rather than in the markup because it has to measure its own box,
 * which only exists once the markup is in the document.
 */
async function wireDetail(noteId: string): Promise<void> {
  const canvas = document.getElementById("ink-layer") as HTMLCanvasElement | null;

  if (canvas && state.detailMode === "ink") {
    const stored = await api.loadInk(noteId);
    const doc = stored.doc
      ? parseInkDoc(stored.doc)
      : createInkDoc(aspectOf(canvas));

    inkCanvas = new InkCanvas(canvas, doc, {
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

function wireCapture(): void {
  const titleInput = document.getElementById("capture-title") as HTMLInputElement | null;
  const bodyInput = document.getElementById("capture-body") as HTMLTextAreaElement | null;
  if (!titleInput || !bodyInput) return;

  const saveNote = async () => {
    const rawBody = bodyInput.value.trim();
    const rawTitle = titleInput.value.trim();

    if (rawBody === "" && rawTitle === "") {
      showToast("写点什么再保存", true);
      return;
    }

    state.busy = true;

    try {
      const inbox = await api.inboxNoteId();
      const title = rawTitle || firstLine(rawBody) || "速记";
      const content =
        rawBody === ""
          ? "<p></p>"
          : `<p>${escapeHtml(rawBody).replace(/\n{2,}/g, "</p><p>").replace(/\n/g, "<br />")}</p>`;

      await api.createTextNote({ parentNoteId: inbox, title, content });
      await refreshChrome();
      showToast("已保存到本地，等待同步", false);
    } catch (error) {
      showToast(error instanceof Error ? error.message : String(error), true);
    } finally {
      state.busy = false;
      await render();

      // render() rebuilt the DOM, so focus the fresh textarea to keep capture a rapid loop.
      (document.getElementById("capture-body") as HTMLTextAreaElement | null)?.focus();
    }
  };

  document.getElementById("capture-save")?.addEventListener("click", () => void saveNote());

  bodyInput.addEventListener("keydown", (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") void saveNote();
  });

  requestAnimationFrame(() => {
    if (document.activeElement?.tagName !== "INPUT" && document.activeElement?.tagName !== "TEXTAREA") {
      bodyInput.focus();
    }
  });
}

function wireSearch(): void {
  const input = document.getElementById("search-input") as HTMLInputElement | null;
  if (!input) return;

  let timer: number | undefined;

  const rerender = async () => {
    const caret = input.selectionStart ?? input.value.length;
    await render();

    const next = document.getElementById("search-input") as HTMLInputElement | null;
    if (next) {
      next.focus();
      next.setSelectionRange(caret, caret);
    }
  };

  input.addEventListener("input", () => {
    state.query = input.value;
    window.clearTimeout(timer);
    timer = window.setTimeout(() => void rerender(), 140);
  });

  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      state.query = input.value;
      void render();
    }
  });
}

// Note rows are rebuilt on every render, so the handler lives on the container and is attached once.
app.addEventListener("click", (event) => {
  const row = (event.target as HTMLElement).closest<HTMLElement>("[data-note-id]");
  if (!row) return;

  const noteId = row.dataset.noteId as string;

  if (row.dataset.isDir === "true" && state.tab === "browse") {
    state.browsePath = [...state.browsePath, noteId];
  } else {
    state.openNoteId = noteId;
  }

  void render();
});

// ------------------------------------------------------------------- actions

async function runSync(): Promise<void> {
  state.syncing = true;
  state.lastMessage = "连接中…";
  await render();

  try {
    const outcome = await api.sync();
    state.lastOk = outcome.ok;
    state.lastMessage = outcome.message;
    if (!outcome.ok) showToast(outcome.message, true);
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

function renderSetup(error?: string): void {
  // Defaults to this page's own origin, which is what actually works in a browser: the server sends
  // `Cross-Origin-Resource-Policy: same-origin`, so a page elsewhere cannot read its API at all.
  const host = state.serverHost ?? location.origin;

  app.innerHTML = `
    <div class="setup">
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
  `;

  document.getElementById("connect")?.addEventListener("click", async () => {
    const serverHost = (document.getElementById("server") as HTMLInputElement).value.trim();
    const password = (document.getElementById("password") as HTMLInputElement).value;

    if (!serverHost || !password) {
      renderSetup("请填写服务端地址和密码");
      return;
    }

    state.busy = true;
    renderSetup("");

    try {
      await api.configure(serverHost, password);
      state.busy = false;
      await refreshChrome();
      await render();
      await runSync();
    } catch (error) {
      state.busy = false;
      await refreshChrome();
      renderSetup(error instanceof Error ? error.message : String(error));
    }
  });
}

async function renderSettings(): Promise<void> {
  const [counts, cap] = await Promise.all([api.counts(), api.maxBlobContentSize()]);
  state.openNoteId = null;

  app.innerHTML = `
    <div class="appbar">
      <button id="settings-back" class="ghost">‹ 返回</button>
      <h1>设置</h1>
    </div>
    <div class="view">
      <div class="banner">
        服务端：${escapeHtml(state.serverHost || "(未配置)")}<br />
        本地：${counts.notes.toLocaleString("en-US")} 条笔记 ·
        ${counts.branches.toLocaleString("en-US")} 个分支 ·
        ${counts.attributes.toLocaleString("en-US")} 个属性 ·
        ${counts.blobs.toLocaleString("en-US")} 个内容块
      </div>
      <div class="field">
        <label for="blob-cap">附件同步上限（字节，0 = 不限制）</label>
        <input id="blob-cap" type="number" inputmode="numeric" value="${cap}" />
      </div>
      <button id="save-settings" class="primary">保存</button>
      <button id="reconfigure" style="margin-top:10px">重新配置服务端</button>
    </div>
  `;

  document.getElementById("settings-back")?.addEventListener("click", () => void render());

  document.getElementById("save-settings")?.addEventListener("click", async () => {
    const value = Number((document.getElementById("blob-cap") as HTMLInputElement).value);
    await api.setMaxBlobContentSize(Number.isFinite(value) && value >= 0 ? value : 4 * 1024 * 1024);
    showToast("已保存", false);
    await render();
  });

  document.getElementById("reconfigure")?.addEventListener("click", async () => {
    await api.reset();
    await refreshChrome();
    renderSetup();
  });
}

// -------------------------------------------------------------------- helpers

function showToast(text: string, bad: boolean): void {
  state.toast = { text, bad };
  window.setTimeout(() => {
    state.toast = null;
    void render();
  }, 2400);
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
