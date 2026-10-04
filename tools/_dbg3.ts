import { chromium } from "playwright-core";

const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });

page.on("console", (m) => console.log(`[console.${m.type()}]`, m.text().slice(0, 300)));
page.on("pageerror", (e) => console.log("[pageerror]", String(e).slice(0, 300)));
page.on("response", async (r) => {
  const u = r.url();
  if (u.includes("/api/")) {
    let body = "";
    try { body = (await r.text()).slice(0, 200); } catch { /* ignore */ }
    console.log(`[http] ${r.status()} ${r.request().method()} ${u.replace("http://127.0.0.1:5273", "")} :: ${body.replace(/\s+/g, " ")}`);
  }
});

await page.goto("http://127.0.0.1:5273/", { waitUntil: "load" });
await page.waitForSelector("#connect", { timeout: 45000 });

console.log("--- server field value:", await page.inputValue("#server"));
await page.fill("#password", "triliumtest123");
await page.click("#connect");

for (let i = 0; i < 12; i++) {
  await page.waitForTimeout(2500);
  const status = await page.textContent("#status").catch(() => "(no status)");
  const body = ((await page.textContent("body")) ?? "").replace(/\s+/g, " ");
  console.log(`t+${(i + 1) * 2.5}s status=${JSON.stringify(status)} | ${body.slice(0, 160)}`);
  if (await page.$(".tabbar")) {
    console.log("--- tabbar appeared, reading counts ---");
    break;
  }
}
await browser.close();
