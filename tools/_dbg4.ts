import { chromium } from "playwright-core";

const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });

page.on("pageerror", (e) => console.log("[pageerror]", String(e).slice(0, 400)));
page.on("response", async (r) => {
  const u = r.url();
  if (u.includes("/api/") && !u.includes("setup/status")) {
    let body = "";
    try { body = (await r.text()).slice(0, 160); } catch { /* ignore */ }
    console.log(`[http] ${r.status()} ${r.request().method()} ${u.replace("http://127.0.0.1:5273", "")} :: ${body.replace(/\s+/g, " ")}`);
  }
});

await page.goto("http://127.0.0.1:5273/", { waitUntil: "load" });
await page.waitForSelector("#connect", { timeout: 45000 });
await page.fill("#password", "triliumtest123");
await page.click("#connect");
await page.waitForSelector(".tabbar", { timeout: 120000 });
await page.waitForTimeout(3000);
console.log("### first sync done, status =", await page.textContent("#status"));

await page.click('[data-tab="capture"]');
await page.waitForSelector("#capture-body");
await page.fill("#capture-title", "debug note");
await page.fill("#capture-body", "hello");
await page.click("#capture-save");
await page.waitForTimeout(1500);
console.log("### after capture, status =", await page.textContent("#status"));

console.log("### clicking sync");
await page.click("#sync");
await page.waitForTimeout(15000);
console.log("### after sync, status =", await page.textContent("#status"));
console.log("### body:", ((await page.textContent("body")) ?? "").replace(/\s+/g, " ").slice(0, 200));

await browser.close();
