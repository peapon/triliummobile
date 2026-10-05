/**
 * Capture the app in both colour schemes and both form factors, for human review.
 *
 * I cannot see rendered output, so this exists to put the result in front of someone who can.
 *
 * One browser context throughout: colour scheme comes from `emulateMedia` and the tablet frame from
 * `setViewportSize`. A second context would get its own OPFS replica and have to run an entire first
 * sync again, which is minutes of nothing for a picture of the same app.
 *
 *   pnpm exec tsx tools/screenshots.ts [appUrl] [password] [outDir]
 */

import { mkdirSync } from "node:fs";

import { chromium, type Page } from "playwright-core";

const APP_URL = process.argv[2] ?? "http://127.0.0.1:5273/";
const PASSWORD = process.argv[3] ?? "triliumtest123";
const OUT = process.argv[4] ?? "/tmp/triliummobile-shots";

/**
 * Wait until no sync is in flight.
 *
 * Not on a message: the app bar is deliberately silent when everything is fine, so "settled" is the
 * sync control being usable again.
 */
async function settle(page: Page): Promise<void> {
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

async function shoot(page: Page, name: string): Promise<void> {
  // Let the view transition and any shimmer settle before the frame is taken.
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${OUT}/${name}.png` });
  console.log(`  ${name}.png`);
}

/** Walk the app once per colour scheme, reusing the configured session and its replica. */
async function capture(page: Page, scheme: "dark" | "light"): Promise<void> {
  await page.emulateMedia({ colorScheme: scheme });
  await page.setViewportSize({ width: 390, height: 844 });

  await page.goto(APP_URL, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".segmented", { timeout: 120_000 });
  await settle(page);

  const leave = async () => {
    while (await page.locator(".detail, .sheet, .screen").count()) {
      await page.evaluate(() => history.back());
      await page.waitForTimeout(350);
    }
  };

  // 速记 — the quick-note surface.
  await page.click('[data-tab="notes"]');
  await page.waitForSelector(".home-actions");
  await shoot(page, `${scheme}-1-notes`);

  // The full-screen editor, which is where a note is actually written.
  await page.click("#open-editor");
  await page.waitForSelector("#editor-body");
  await page.fill("#editor-body", "离线记一条，联网后自动同步。");
  await shoot(page, `${scheme}-2-editor`);
  await leave();

  // 知识库 — the tree.
  await page.click('[data-tab="library"]');
  await page.waitForSelector(".list, .grid, .empty");
  await shoot(page, `${scheme}-3-library`);

  // The same children as a grid, which the options sheet switches to.
  await page.click("#open-sheet");
  await page.waitForSelector(".sheet");
  await shoot(page, `${scheme}-4-sheet`);
  await page.click('[data-choice="layout"][data-value="grid"]');
  await page.waitForSelector(".grid");
  await shoot(page, `${scheme}-5-library-grid`);
  await page.click("#open-sheet");
  await page.waitForSelector(".sheet");
  await page.click('[data-choice="layout"][data-value="list"]');
  await page.waitForSelector(".list");

  // Search, as a screen of its own.
  await page.click('[data-tab="notes"]');
  await page.click("#open-search");
  await page.waitForSelector("#search-input");
  await page.fill("#search-input", "Trilium");
  await page.waitForTimeout(700);
  await shoot(page, `${scheme}-6-search`);
  await leave();

  // AI chats, which Trilium stores as `llmChat` notes.
  await page.click('[data-tab="notes"]');
  await page.click("#open-ai");
  await page.waitForSelector("#ai-screen");
  await shoot(page, `${scheme}-7-ai`);
  await leave();

  // A note, and the tablet frame where the list and the note sit side by side.
  await page.click('[data-tab="library"]');
  await page.waitForSelector(".row, .card");
  await page.locator("#view .row, #view .card").first().click();
  await page.waitForSelector(".detail");
  await shoot(page, `${scheme}-8-detail`);

  await page.setViewportSize({ width: 1024, height: 768 });
  await page.waitForTimeout(500);
  await shoot(page, `${scheme}-9-tablet`);
  await leave();
}

async function main(): Promise<void> {
  mkdirSync(OUT, { recursive: true });

  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    locale: "zh-CN"
  });

  try {
    const page = await context.newPage();

    // Configure once; every later capture reuses this replica.
    await page.goto(APP_URL, { waitUntil: "domcontentloaded" });
    await page.waitForSelector("#connect", { timeout: 60_000 });
    await shoot(page, "0-setup");
    await page.fill("#password", PASSWORD);
    await page.click("#connect");
    await page.waitForSelector(".segmented", { timeout: 180_000 });
    await settle(page);
    console.log("configured.");

    for (const scheme of ["dark", "light"] as const) {
      console.log(`${scheme}:`);
      await capture(page, scheme);
    }
  } finally {
    await browser.close();
  }

  console.log(`\n${OUT}`);
}

main().catch((error) => {
  console.error("screenshots failed:", error);
  process.exitCode = 1;
});
