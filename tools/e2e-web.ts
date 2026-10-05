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
 * Poll a page-side predicate from Node.
 *
 * `page.waitForFunction` polls inside the page, and it stalled here on conditions the page had
 * demonstrably already met: the blob fetch logged 0.5s in the worker while the wait sat for 300s,
 * and the element was gone the moment the wait gave up. Asking from outside is not affected by
 * whatever occupies the page's own timer.
 */
async function waitUntil(
  page: Page,
  predicate: () => boolean,
  timeoutMs: number,
  label: string
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    if (await page.evaluate(predicate)) return true;
    await page.waitForTimeout(250);
  }

  console.log(`    ${label}: still false after ${timeoutMs / 1000}s`);
  return false;
}



/**
 * Navigation helpers.
 *
 * The shell changed shape: two tabs in a centred segmented control, search and the editor as screens
 * of their own, and sync behind the options sheet. Naming each journey once keeps the checks below
 * about behaviour rather than about selectors.
 */
/**
 * Dismiss whatever is on top, so navigation starts from a known place.
 *
 * Every screen here is an overlay, and an overlay intercepts pointer events — a test that navigates
 * without closing one does not fail with "wrong screen", it fails with a click that never lands.
 */
async function dismissOverlays(page: Page): Promise<void> {
  for (const [selector, closer] of [
    ["#search-screen", "#search-cancel"],
    ["#editor-screen", "#editor-cancel"],
    ["#ai-screen", "#ai-back"],
    [".sheet", "#sheet-cancel"],
    [".detail", "#detail-back"]
  ] as const) {
    if (await page.locator(selector).count()) {
      await page.click(closer).catch(() => {});
      await page.waitForTimeout(350);
    }
  }
}

async function goHome(page: Page): Promise<void> {
  await dismissOverlays(page);
  await page.click('[data-tab="notes"]');
  await page.waitForSelector(".home-actions");
}

async function goLibrary(page: Page): Promise<void> {
  await dismissOverlays(page);
  await page.click('[data-tab="library"]');
  await page.waitForSelector(".section-head");
}

async function openSearch(page: Page, query = ""): Promise<void> {
  await goHome(page);
  await page.click("#open-search");
  await page.waitForSelector("#search-input");
  if (query) {
    await page.fill("#search-input", query);
    await page.waitForTimeout(400);
  }
}

async function closeSearch(page: Page): Promise<void> {
  await dismissOverlays(page);
}

async function openEditor(page: Page): Promise<void> {
  await goHome(page);
  await page.click("#open-editor");
  await page.waitForSelector("#editor-body");
}

/** Sync lives in the options sheet now, so this is the journey a person takes. */
async function syncVia(page: Page): Promise<void> {
  await page.click("#open-sheet");
  await page.waitForSelector("#sheet-sync");
  await page.click("#sheet-sync");
}



/**
 * Wait until no sync is in flight.
 *
 * Deliberately does not look for a phrase. The app bar is silent when everything is fine — showing a
 * sentence there is what crushed the title to 0px on a 320px phone — so "settled" is the sync
 * control being usable again, not a message on screen.
 */
async function waitForSettled(page: Page): Promise<void> {
  await page.waitForFunction(
    () => {
      // Settled means the status strip has nothing to say: it is hidden when there is no pending
      // work and no sync in flight. A failure is terminal too, so `bad` also counts.
      const strip = document.getElementById("status");
      if (strip === null) return false;
      if ((strip as HTMLElement).hidden) return true;
      return strip.classList.contains("bad");
    },
    undefined,
    { timeout: 180_000 }
  );
}

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
    await page.waitForSelector(".segmented", { timeout: 120_000 });
    await waitForSettled(page);
    check("setup flow reads the sync seed and completes a first sync", true);

    // The count is read from the capture screen's hint rather than a paragraph, so go there first.
    await goHome(page);
    const countText = (await page.textContent(".section-count")) ?? "";
    const pulledNotes = Number((countText.match(/([\d,]+)/)?.[1] ?? "0").replace(/,/g, ""));

    check("the first sync actually populated the local replica", pulledNotes > 0, `${pulledNotes} notes`);

    // ---------------------------------------------------------------- search

    await openSearch(page);
    await page.fill("#search-input", "Trilium");
    await page.waitForTimeout(500);
    // Scope to the search screen: the tab underneath renders rows too, and an unscoped selector
    // picks those and then times out because the overlay covers them.
    const searchRows = page.locator("#search-results .row, #search-results .card");

    const resultRows = await searchRows.count();
    check("local search returns results offline", resultRows > 0, `${resultRows} rows`);

    // --------------------------------------------------------------- capture

    const before = serverNoteCount();
    const title = `E2E 速记 ${Date.now()}`;

    await goHome(page);
    await openEditor(page);
    await page.fill("#editor-title", title);
    await page.fill("#editor-body", "从浏览器 UI 离线创建，随后同步到服务端。");
    await page.click("#editor-save");
    await page.waitForSelector("#editor-screen", { state: "detached", timeout: 30_000 }).catch(() => {});

    await page.waitForTimeout(400);
    check(
      "capture writes locally and marks the note as pending",
      /待同步/.test((await page.textContent("#status")) ?? ""),
      (await page.textContent("#status")) ?? ""
    );

    // ----------------------------------------------------------------- sync

    // Clicking sync, then waiting for the *server* to show the note. The app bar is silent when it
    // succeeds — a sentence there is what crushed the title to 0px — so there is no phrase to wait
    // for, and polling the outcome is immune to the UI's timing in a way a status check is not.
    await syncVia(page);

    const delivered = await waitForServer(() => serverHasTitle(title), 120_000);
    check("the captured note reached the server's own database", delivered, `title="${title}"`);

    const after = serverNoteCount();
    check("server note count increased", after > before, `${before} -> ${after}`);

    // And the client considers itself settled, with nothing left owed.
    await waitForSettled(page);
    const statusText = (await page.textContent("#status")) ?? "";
    check("nothing is left pending once delivered", !/待同步/.test(statusText), statusText);

    // ---------------------------------------------------------------- browse

    await goLibrary(page);
    await page.waitForSelector(".list, .grid, .empty");
    const browseRows = await page.locator("#view .row, #view .card").count();
    check("the library lists the tree from root", browseRows > 0, `${browseRows} children`);

    // Descending is what makes it a tree rather than a list: a `book` opens its own level and the
    // breadcrumb appears so the way back is visible.
    const firstBook = page.locator('[data-into]').first();
    if (await firstBook.count()) {
      await firstBook.click();
      await page.waitForSelector(".crumbs", { timeout: 15_000 });
      check("tapping a book descends and shows the way back", true);
      await page.click('[data-crumb="root"]');
      await page.waitForTimeout(400);
      check("the breadcrumb returns to the root", (await page.locator(".crumbs").count()) === 0);
    }
    await page.screenshot({ path: "/tmp/triliummobile-3-browse.png" });

    // --------------------------------------------------------------- viewing

    // Opening a note is the "查看" half of the phone's job, and it exercises the sanitiser and the
    // content decode path (blob content arrives as bytes after a sync).
    await page.locator("#view .row, #view .card").first().click();
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
    await goHome(page);
    await page.screenshot({ path: "/tmp/triliummobile-1-capture.png" });

    await openSearch(page);
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
    await openSearch(page);
    await page.fill("#search-input", title);
    await page.waitForTimeout(600);

    const targetRow = page.locator("#search-results .row, #search-results .card").first();
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

      // Diagnostics: if drawing does not register, the reason is almost always that something else
      // is on top of the canvas or the canvas has no area.
      // The canvas must be hit-testable *now*, not merely present. A view transition snapshots the
      // page and silently drops input while it runs — this assertion is what caught that, and it
      // will catch it again if transitions are ever reintroduced.
      const hitTest = await page.evaluate(() => {
        const canvas = document.getElementById("ink-layer") as HTMLCanvasElement | null;
        if (!canvas) return { present: false, hit: false };

        const rect = canvas.getBoundingClientRect();
        const top = document.elementFromPoint(rect.left + 40, rect.top + 40);
        return {
          present: true,
          hit: top === canvas,
          topElement: top ? `${top.tagName}.${top.className}` : "none",
          rect: `${Math.round(rect.width)}x${Math.round(rect.height)}`
        };
      });

      check(
        "the ink canvas is hit-testable straight away",
        hitTest.hit,
        `${hitTest.rect ?? "?"} topmost=${hitTest.topElement ?? "?"}`
      );

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

      await syncVia(page);

      const editArrived = await waitForServer(() => serverNoteContains(targetNoteId, marker));
      check("the tablet edit reached the server on the next sync", editArrived, `marker=${marker}`);

      const inkArrived = await waitForServer(() => serverInkAttachmentTitles(targetNoteId).length > 0);
      check(
        "the ink layer reached the server as an attachment",
        inkArrived,
        serverInkAttachmentTitles(targetNoteId).join(", ") || "(none)"
      );

      // ------------------------------------------------------- ink survives reload

      // Let any sync finish before tearing the page down: reloading mid-round leaves the OPFS
      // database locked for the incoming worker, which then cannot open it.
      await waitForSettled(page);
      await page.reload({ waitUntil: "domcontentloaded" });

      try {
        await page.waitForSelector(".segmented", { timeout: 120_000 });
      } catch {
        const body = ((await page.textContent("body")) ?? "").replace(/\s+/g, " ").slice(0, 200);
        check("the app comes back after a reload", false, body);
        throw new Error(`reload did not reach the shell: ${body}`);
      }

      // Find it by search rather than by position: the edit bumped its timestamp, so it has moved
      // to the top of the recency list and may not sit under the same parent row as before.
      await openSearch(page, marker);
      await page.waitForTimeout(600);

      const reopened = page.locator(`#search-results [data-note-id="${targetNoteId}"]`).first();
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

    // ------------------------------------------- on-demand download of stubbed blobs

    // The seeded note's body is above the 4 MiB sync cap, so a fresh client holds only the stub.
    // This is the case the whole blob cache exists for.
    // Close the note the previous section left open: on a tablet the panel covers the tab bar.
    if ((await page.locator("#detail-back").count()) > 0) {
      await page.click("#detail-back");
      await page.waitForTimeout(300);
    }

    await openSearch(page);
    await page.fill("#search-input", "E2E 大附件笔记");
    await page.waitForTimeout(700);

    const bigRow = page.locator("#search-results .row, #search-results .card").first();
    if ((await bigRow.count()) === 0) {
      check("the seeded large note synced down", false);
    } else {
      await bigRow.click();
      await page.waitForSelector(".detail");

      const stubBanner = await page.locator("#fetch-note-blob").count();
      check("a stubbed note offers a download instead of showing as empty", stubBanner === 1);

      const attachments = await page.locator(".attachment").count();
      check("the note's attachments are listed", attachments > 0, `${attachments} attachment(s)`);

      const downloadButtons = await page.locator("[data-fetch-attachment]").count();
      check("a stubbed attachment offers a download", downloadButtons > 0);

      // ------------------------------------------------------------- fetch the body

      if (stubBanner === 1) {
        await page.click("#fetch-note-blob");

        // Wait on the outcome — the body appearing — rather than on the download button
        // disappearing. The button is also absent while the placeholder is re-rendered, so the
        // weaker signal can pass for the wrong reason, and it failed spuriously when the emulator
        // was saturating the CPU during this run.
        let bodyLength = 0;
        try {
          await waitUntil(
            page,
            () => (document.querySelector(".detail .body")?.textContent ?? "").length > 100_000,
            180_000,
            "note body"
          );
          bodyLength = ((await page.textContent(".detail .body")) ?? "").length;
        } catch {
          bodyLength = ((await page.textContent(".detail .body")) ?? "").length;
          console.log("    download did not complete. state:");
          console.log("      toast   :", await page.locator(".toast").textContent().catch(() => "(none)"));
          console.log("      status  :", await page.textContent("#status"));
        }

        check("the note body downloads on demand", bodyLength > 100_000, `${bodyLength} chars`);
        check(
          "the placeholder is gone once the content is local",
          (await page.locator("#fetch-note-blob").count()) === 0
        );
      }

      // ------------------------------------------------------- fetch an attachment

      const firstDownload = page.locator("[data-fetch-attachment]").first();
      if ((await firstDownload.count()) > 0) {
        await firstDownload.click();

        const downloaded = await waitUntil(
          page,
          () => document.querySelectorAll("[data-fetch-attachment]").length === 0,
          120_000,
          "attachment"
        );

        if (!downloaded) {
          // Say what actually happened rather than only that a wait expired.
          console.log("    attachment download did not complete. state:");
          console.log("      toast      :", await page.locator(".toast").textContent().catch(() => "(none)"));
          console.log("      remaining  :", await page.locator("[data-fetch-attachment]").count());
          console.log(
            "      button text:",
            await page.locator("#attachments button").first().textContent().catch(() => "(none)")
          );
          console.log("      status     :", await page.textContent("#status").catch(() => "(none)"));
        }

        check("the attachment downloaded and is now cached", downloaded);
      }

      // The cache is local, so the download must not have produced a sync obligation.
      await page.click("#detail-back");
      await page.waitForTimeout(300);
      const statusAfterFetch = (await page.textContent("#status")) ?? "";
      check(
        "downloading does not create work for the sync queue",
        !/待同步/.test(statusAfterFetch),
        statusAfterFetch
      );

      await page.screenshot({ path: "/tmp/triliummobile-5-download.png" });
    }

    console.log("\nScreenshots: /tmp/triliummobile-{1-capture,2-search,3-browse,4-pad-ink,5-download}.png");
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
