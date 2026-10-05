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
      const button = document.getElementById("sync") as HTMLButtonElement | null;
      return button !== null && !button.disabled;
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
  await page.waitForSelector(".tabbar", { timeout: 120_000 });
  await settle(page);

  await page.click('[data-tab="capture"]');
  await page.waitForSelector("#capture-body");
  await shoot(page, `${scheme}-1-capture`);

  await page.click('[data-tab="search"]');
  await page.waitForSelector("#search-input");
  await shoot(page, `${scheme}-2-search`);

  await page.click('[data-tab="browse"]');
  await page.waitForSelector(".row");
  await shoot(page, `${scheme}-3-browse`);

  await page.locator(".row").first().click();
  await page.waitForSelector(".detail");
  await shoot(page, `${scheme}-4-detail`);
  await page.click("#detail-back");
  await page.waitForTimeout(500);

  await page.click("#settings");
  await page.waitForSelector("#clear-data");
  await shoot(page, `${scheme}-5-settings`);
  await page.click("#settings-back");
  await page.waitForTimeout(500);

  // The tablet frame: two panes instead of one.
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.waitForTimeout(400);
  await page.click('[data-tab="browse"]');
  await page.waitForSelector(".row");
  await page.locator(".row").first().click();
  await page.waitForSelector(".detail");
  await shoot(page, `${scheme}-6-tablet`);
  await page.click("#detail-back");
  await page.waitForTimeout(400);
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
    await page.waitForSelector(".tabbar", { timeout: 180_000 });
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
