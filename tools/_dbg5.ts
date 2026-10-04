import { chromium } from "playwright-core";

const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage({ viewport: { width: 1024, height: 768 } });

page.on("pageerror", (e) => console.log("[pageerror]", String(e).slice(0, 300)));
page.on("console", (m) => { if (m.type() === "error") console.log("[console.error]", m.text().slice(0, 300)); });
page.on("response", async (r) => {
  const u = r.url();
  if (u.includes("/blob") || u.includes("/open") || u.includes("login")) {
    let size = "";
    try { size = ` len=${(await r.text()).length}`; } catch { size = " (no text)"; }
    console.log(`[http] ${r.status()} ${r.request().method()} ${u.replace("http://127.0.0.1:5273", "")}${size}`);
  }
});

await page.goto("http://127.0.0.1:5273/", { waitUntil: "load" });
await page.waitForSelector("#connect", { timeout: 45000 });
await page.fill("#password", "triliumtest123");
await page.click("#connect");
await page.waitForSelector(".tabbar", { timeout: 120000 });
await page.waitForTimeout(2500);

// Reproduce the E2E precondition: a reload restarts the worker, so the blob fetch must establish
// its own session.
await page.reload({ waitUntil: "domcontentloaded" });
await page.waitForSelector(".tabbar", { timeout: 60000 });
await page.waitForTimeout(2500);

await page.click('[data-tab="search"]');
await page.waitForSelector("#search-input");
await page.fill("#search-input", "E2E 大附件笔记");
await page.waitForTimeout(800);
console.log("rows found:", await page.locator(".row").count());

await page.locator(".row").first().click();
await page.waitForSelector(".detail");
console.log("download button present:", await page.locator("#fetch-note-blob").count());

await page.click("#fetch-note-blob");
await page.waitForTimeout(8000);
console.log("button still present:", await page.locator("#fetch-note-blob").count());
console.log("toast:", await page.locator(".toast").textContent().catch(() => "(none)"));
console.log("status:", await page.textContent("#status"));
console.log("body chars:", ((await page.textContent(".detail .body")) ?? "").length);

await browser.close();
