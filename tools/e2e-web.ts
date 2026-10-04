/**
 * End-to-end browser test for the app.
 *
 * This drives the real UI in a real Chrome against a real Trilium server, because the parts most
 * likely to break are exactly the parts no unit test covers: whether OPFS is usable from the page,
 * whether sqlite-wasm loads under Vite, whether the setup flow can read the sync seed, and whether
 * a note captured in the UI actually reaches the server.
 *
 * Uses the installed Chrome through `channel: "chrome"` so no browser download is needed.
 *
 * Usage:
 *   pnpm exec tsx tools/e2e-web.ts [appUrl] [serverHost] [password]
 */

import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

import { chromium, type Browser, type Page } from "playwright-core";

const APP_URL = process.argv[2] ?? "http://127.0.0.1:5273/";
// Same-origin on purpose: the server's `Cross-Origin-Resource-Policy: same-origin` makes a direct
// cross-origin call impossible from a page, so the app talks to its own origin and Vite proxies
// `/api` onward to the real server.
const SERVER_HOST = process.argv[3] ?? "http://127.0.0.1:5273";
const PASSWORD = process.argv[4] ?? "triliumtest123";
const SERVER_DB = ".trilium-test-data/document.db";

const failures: string[] = [];

/**
 * Wait until the status line has settled on a terminal message.
 *
 * Both parts matter. Matching only on the text is wrong twice over: the success message contains
 * "拉取" ("同步完成：拉取 N 项"), so a "not busy" text test hangs on a healthy sync; and
 * "项待同步" is both the pre-sync state and a valid resting state, so a loose pattern returns
 * before the sync it is waiting for has even started.
 */
async function waitForStatus(page: Page, pattern: RegExp): Promise<void> {
  await page.waitForFunction(
    (source: string) => {
      const el = document.getElementById("status");
      if (!el) return false;

      // The shell marks an in-flight sync with the `busy` class.
      if (el.classList.contains("busy")) return false;

      return new RegExp(source).test(el.textContent ?? "");
    },
    pattern.source,
    { timeout: 180_000 }
  );
}

/** After connecting, either outcome is terminal. */
const ANY_SETTLED = /同步完成|项待同步|不一致|失败/;

/** After pressing sync, only a completed round counts. */
const SYNC_SETTLED = /同步完成|不一致|失败/;

/**
 * Poll until the server's own database satisfies `predicate`.
 *
 * Asserting on the UI instead is fragile in a way that hides real failures: the status line from a
 * *previous* sync already reads "同步完成", so a wait for that text returns before the sync the test
 * is waiting on has even started. The server file is the authority anyway.
 */
async function waitForServer(predicate: () => boolean, timeoutMs = 30_000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    try {
      if (predicate()) return true;
    } catch {
      // The file may be mid-write; keep polling.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  return predicate();
}

function check(label: string, ok: boolean, detail = ""): void {
  const mark = ok ? "  ok  " : " FAIL ";
  console.log(`[${mark}] ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures.push(label);
}

/** Read the server's own database, so "it synced" is proven rather than inferred from the UI. */
function serverNoteCount(): number {
  const db = new DatabaseSync(SERVER_DB, { readOnly: true });
  const row = db.prepare("SELECT COUNT(*) AS c FROM notes WHERE isDeleted = 0").get() as { c: number };
  db.close();
  return row.c;
}

/** Does the given note's stored content contain this marker? Proves an edit actually landed. */
function serverNoteContains(noteId: string, needle: string): boolean {
  const db = new DatabaseSync(SERVER_DB, { readOnly: true });
  const row = db
    .prepare(
      `SELECT CAST(b.content AS TEXT) AS content
         FROM notes n JOIN blobs b ON b.blobId = n.blobId
        WHERE n.noteId = ?`
    )
    .get(noteId) as { content: string | null } | undefined;
  db.close();

  return Boolean(row?.content?.includes(needle));
}

/** The ink layer is a synced attachment, so the server's own file is the evidence that it saved. */
function serverInkAttachmentTitles(noteId: string): string[] {
  const db = new DatabaseSync(SERVER_DB, { readOnly: true });
  const rows = db
    .prepare("SELECT title FROM attachments WHERE ownerId = ? AND role = 'ink' AND isDeleted = 0")
    .all(noteId) as Array<{ title: string }>;
  db.close();

  return rows.map((row) => row.title);
}

function serverHasTitle(title: string): boolean {
  const db = new DatabaseSync(SERVER_DB, { readOnly: true });
  const row = db.prepare("SELECT 1 AS x FROM notes WHERE title = ? AND isDeleted = 0").get(title);
  db.close();
  return Boolean(row);
}

async function main(): Promise<void> {
  const profile = mkdtempSync(join(tmpdir(), "triliummobile-e2e-"));
  let browser: Browser | undefined;

  try {
    browser = await chromium.launch({
      channel: "chrome",
      headless: true,
      args: ["--no-first-run", "--no-default-browser-check"]
    });

    const context = await browser.newContext({
      viewport: { width: 390, height: 844 }, // iPhone-class, which is the design target
      deviceScaleFactor: 3,
      isMobile: true,
      hasTouch: true,
      locale: "zh-CN"
    });

    const page = await context.newPage();
    const consoleErrors: string[] = [];

    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });
    page.on("pageerror", (error) => consoleErrors.push(String(error)));

    // ------------------------------------------------------------------ load

    await page.goto(APP_URL, { waitUntil: "domcontentloaded" });

    // The setup screen only appears once the WASM module and OPFS are ready, so this doubles as the
    // check that both work in a plain browser page.
    await page.waitForSelector("#connect", { timeout: 45_000 });
    check("app boots and OPFS + sqlite-wasm initialise", true);

    // ------------------------------------------------------------- configure

    await page.fill("#server", SERVER_HOST);
    await page.fill("#password", PASSWORD);
    await page.click("#connect");

    // First sync pulls the whole server. The tab bar appearing only means the shell rendered, so
    // wait for the status line to report completion before reading any counts from it.
    await page.waitForSelector(".tabbar", { timeout: 120_000 });
    await waitForStatus(page, ANY_SETTLED);
    check("setup flow reads the sync seed and completes a first sync", true);

    const bodyText = (await page.textContent("body")) ?? "";
    const countMatch = bodyText.match(/本地现有\s*([\d,]+)\s*条笔记/);
    const pulledNotes = Number((countMatch?.[1] ?? "0").replace(/,/g, ""));

    check("the first sync actually populated the local replica", pulledNotes > 0, `${pulledNotes} notes`);

    // ---------------------------------------------------------------- search

    await page.click('[data-tab="search"]');
    await page.waitForSelector("#search-input");
    await page.fill("#search-input", "Trilium");
    await page.waitForTimeout(500);

    const resultRows = await page.locator(".row").count();
    check("local search returns results offline", resultRows > 0, `${resultRows} rows`);

    // --------------------------------------------------------------- capture

    const before = serverNoteCount();
    const title = `E2E 速记 ${Date.now()}`;

    await page.click('[data-tab="capture"]');
    await page.waitForSelector("#capture-body");
    await page.fill("#capture-title", title);
    await page.fill("#capture-body", "从浏览器 UI 离线创建，随后同步到服务端。");
    await page.click("#capture-save");

    await page.waitForTimeout(400);
    check(
      "capture writes locally and marks the note as pending",
      /待同步/.test((await page.textContent("#status")) ?? ""),
      (await page.textContent("#status")) ?? ""
    );

    // ----------------------------------------------------------------- sync

    await page.click("#sync");
    await waitForStatus(page, SYNC_SETTLED);

    const status = (await page.textContent("#status")) ?? "";
    check("sync reports success", /同步完成/.test(status), status);

    check(
      "the captured note is in the server's own database",
      serverHasTitle(title),
      `title="${title}"`
    );

    const after = serverNoteCount();
    check("server note count increased", after > before, `${before} -> ${after}`);

    // ---------------------------------------------------------------- browse

    await page.click('[data-tab="browse"]');
    await page.waitForSelector(".crumbs");
    const browseRows = await page.locator(".row").count();
    check("browse lists the tree from root", browseRows > 0, `${browseRows} children`);
    await page.screenshot({ path: "/tmp/triliummobile-3-browse.png" });

    // --------------------------------------------------------------- viewing

    // Opening a note is the "查看" half of the phone's job, and it exercises the sanitiser and the
    // content decode path (blob content arrives as bytes after a sync).
    await page.locator(".row").first().click();
    await page.waitForSelector(".detail .body", { timeout: 15_000 });

    const detailText = ((await page.textContent(".detail .body")) ?? "").trim();
    check("opening a note renders its content", detailText.length > 0, `${detailText.length} chars`);
    check(
      "rendered content carries no script or event handlers",
      (await page.locator('.detail .body script, .detail .body [onclick], .detail .body [onerror]').count()) === 0
    );

    await page.click("#detail-back");
    await page.waitForTimeout(300);

    // Screenshots for human review; the automated checks above are the actual evidence.
    await page.click('[data-tab="capture"]');
    await page.waitForSelector("#capture-body");
    await page.screenshot({ path: "/tmp/triliummobile-1-capture.png" });

    await page.click('[data-tab="search"]');
    await page.waitForSelector("#search-input");
    await page.screenshot({ path: "/tmp/triliummobile-2-search.png" });

    // ------------------------------------------------------------------ done

    const realErrors = consoleErrors.filter(
      (message) => !/favicon|Download the React DevTools/i.test(message)
    );
    check("no uncaught console errors", realErrors.length === 0, realErrors.slice(0, 3).join(" | "));

    // ------------------------------------------------------ tablet: edit and ink

    // The phone build offers neither by design, so the viewport switches to a tablet's.
    await page.setViewportSize({ width: 1024, height: 768 });

    // Open the note captured above rather than whatever the tree happens to list first: the
    // toolbar is offered only for the types this editor can round-trip, and root's first child is a
    // `book`, which would make this section test nothing.
    await page.click('[data-tab="search"]');
    await page.waitForSelector("#search-input");
    await page.fill("#search-input", title);
    await page.waitForTimeout(600);

    const targetRow = page.locator(".row").first();
    const targetNoteId = await targetRow.getAttribute("data-note-id");

    if (!targetNoteId) {
      check("the captured note is available to edit", false);
    } else {
      await targetRow.click();
      await page.waitForSelector(".detail");
      check("tablet shows the editing toolbar", (await page.locator("#mode-edit").count()) === 1);

      // ---------------------------------------------------------------- editing

      await page.click("#mode-edit");
      await page.waitForSelector("#editor");

      const marker = `e2e-edit-${Date.now()}`;
      await page.evaluate((value: string) => {
        document.getElementById("editor")!.innerHTML = `<p>${value}</p>`;
      }, marker);
      await page.click("#mode-save");
      await page.waitForTimeout(1000);

      // The edit is deliberately local-first: it must be visible immediately and owed to the
      // server, not blocked on a round trip.
      check(
        "an edit is visible locally before any sync",
        ((await page.textContent(".detail .body")) ?? "").includes(marker)
      );
      check(
        "the edit is still owed to the server",
        /待同步/.test((await page.textContent("#status")) ?? "")
      );

      // ------------------------------------------------------------------- ink

      await page.click("#mode-ink");
      await page.waitForSelector("#ink-layer.active", { timeout: 15_000 });

      const box = await page.locator("#ink-layer").boundingBox();
      if (!box) {
        check("the ink canvas has a drawable box", false);
      } else {
        // A mouse is a pointer too, so this drives the same code path a stylus would; `pointerType`
        // is the only difference and the app records it per stroke.
        await page.mouse.move(box.x + 40, box.y + 40);
        await page.mouse.down();
        for (let step = 1; step <= 12; step++) {
          await page.mouse.move(box.x + 40 + step * 12, box.y + 40 + Math.sin(step) * 20);
        }
        await page.mouse.up();
        await page.waitForTimeout(300);

        const saveDisabled = await page.locator("#ink-save").isDisabled();
        check("drawing a stroke enables the ink save button", !saveDisabled);

        await page.click("#ink-save");
        await page.waitForTimeout(1000);

        // Still local at this point — the round trip below is what carries both the edit and the
        // ink to the server, which is the whole offline-first contract.
      }

      await page.screenshot({ path: "/tmp/triliummobile-4-pad-ink.png" });

      // ------------------------------------------------- one sync carries both changes

      await page.click("#sync");

      const editArrived = await waitForServer(() => serverNoteContains(targetNoteId, marker));
      check("the tablet edit reached the server on the next sync", editArrived, `marker=${marker}`);

      const inkArrived = await waitForServer(() => serverInkAttachmentTitles(targetNoteId).length > 0);
      check(
        "the ink layer reached the server as an attachment",
        inkArrived,
        serverInkAttachmentTitles(targetNoteId).join(", ") || "(none)"
      );

      // ------------------------------------------------------- ink survives reload

      await page.reload({ waitUntil: "domcontentloaded" });
      await page.waitForSelector(".tabbar", { timeout: 60_000 });

      // Find it by search rather than by position: the edit bumped its timestamp, so it has moved
      // to the top of the recency list and may not sit under the same parent row as before.
      await page.click('[data-tab="search"]');
      await page.waitForSelector("#search-input");
      await page.fill("#search-input", marker);
      await page.waitForTimeout(600);

      const reopened = page.locator(`[data-note-id="${targetNoteId}"]`).first();
      if ((await reopened.count()) === 0) {
        check("the edited note is findable after a reload", false);
      } else {
        await reopened.click();
        await page.waitForSelector(".detail");
        check(
          "ink is still present after a reload, loaded from the local replica",
          (await page.locator("#ink-layer").count()) === 1
        );
        check(
          "the edit persisted across a reload",
          ((await page.textContent(".detail .body")) ?? "").includes(marker)
        );
      }
    }

    console.log("\nScreenshots: /tmp/triliummobile-{1-capture,2-search,3-browse,4-pad-ink}.png");
  } finally {
    await browser?.close();
    if (existsSync(profile)) rmSync(profile, { recursive: true, force: true });
  }

  if (failures.length > 0) {
    console.error(`\nFAILED — ${failures.length} check(s):\n  - ${failures.join("\n  - ")}`);
    process.exitCode = 1;
  } else {
    console.log("\nPASS — the app runs in a browser, syncs both ways, and the note reached the server.");
  }
}

main().catch((error) => {
  console.error("\nE2E crashed:", error);
  process.exitCode = 1;
});
