/**
 * Does the app actually do everything it was asked to?
 *
 * A gate to run before porting to another platform, so a second shell is not built around an
 * unfinished product. It checks structural facts — is each thing present and reachable — rather than
 * exercising behaviour, which `e2e-web.ts` does.
 *
 * Two rules learned the hard way, and both are load-bearing here:
 *
 * 1. **Read the whole screen in one evaluation.** Reading several numbers across separate calls lets
 *    a re-render land between them; that made 24 rows look like 48 and sent me chasing a duplicate
 *    that did not exist.
 * 2. **Wait for the view, not for a container.** The 速记 list and the library list are both `.list`
 *    inside `#view`, so waiting on `.list` after switching tabs read the tab being left — which made
 *    the library look empty and the tree look like it could not descend.
 *
 * Known gaps are listed explicitly at the end. An audit that only reports passes is not an audit.
 *
 *   pnpm exec tsx tools/feature-audit.ts
 */

import { chromium } from "playwright-core";
import { DatabaseSync } from "node:sqlite";

const APP_URL = process.argv[2] ?? "http://127.0.0.1:5273/";
const PASSWORD = process.argv[3] ?? "triliumtest123";
const SERVER_DB = process.argv[4] ?? ".trilium-test-data/document.db";

const results: Array<[string, boolean, string]> = [];
const check = (label: string, ok: boolean, detail = "") => results.push([label, ok, detail]);

const serverQuery = <T>(sql: string, params: unknown[] = []): T[] => {
  const db = new DatabaseSync(SERVER_DB, { readOnly: true });
  const rows = db.prepare(sql).all(...(params as never[])) as T[];
  db.close();
  return rows;
};

const browser = await chromium.launch({ channel: "chrome", headless: true });
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  locale: "zh-CN",
  hasTouch: true,
  isMobile: true
});
const page = await context.newPage();

// A stray `window.prompt`/`confirm` does nothing in ArkWeb, so any use shows up here as a native
// dialog rather than as a silent no-op on the device.
let nativeDialogs = 0;
page.on("dialog", async (d) => {
  nativeDialogs++;
  await d.dismiss();
});

await page.goto(APP_URL, { waitUntil: "domcontentloaded" });
await page.waitForSelector("#connect", { timeout: 60_000 });
await page.fill("#password", PASSWORD);
await page.click("#connect");
await page.waitForSelector(".segmented", { timeout: 180_000 });
await page.waitForFunction(
  () => {
    const s = document.getElementById("status");
    return s !== null && (s as HTMLElement).hidden;
  },
  undefined,
  { timeout: 180_000 }
);

// ---------------------------------------------------------------- 手机端 · 速记
await page.click('[data-tab="notes"]');
await page.waitForSelector("#view .row, #view .card");

const notes = await page.evaluate(() => {
  const kids = Array.from(document.querySelector("#view .list")?.children ?? []);
  return { count: kids.length, ids: kids.map((e) => e.getAttribute("data-note-id")) };
});

check("手机端：速记页列出笔记", notes.count > 0, `${notes.count} 条`);
check("手机端：悬浮「新建速记」", (await page.locator("#open-editor").count()) === 1);
check("手机端：悬浮「搜索」", (await page.locator("#open-search").count()) === 1);
check("手机端：AI 不再占据悬浮位", (await page.locator(".fab-cluster #open-ai").count()) === 0);
check("速记：最多 50 条", notes.count <= 50, `${notes.count} 条`);

// 速记 = the inbox subtree, newest created first.
const inbox = serverQuery<{ noteId: string }>(
  "SELECT noteId FROM notes WHERE title='速记 Inbox' AND isDeleted=0 LIMIT 1"
)[0];
const expectedQuick = inbox
  ? serverQuery<{ noteId: string }>(
      `WITH RECURSIVE s(noteId) AS (
         SELECT ? UNION SELECT b.noteId FROM branches b JOIN s ON b.parentNoteId=s.noteId WHERE b.isDeleted=0)
       SELECT noteId FROM notes
        WHERE isDeleted=0 AND noteId IN (SELECT noteId FROM s) AND noteId != ?
          AND noteId NOT LIKE '\\_%' ESCAPE '\\'
        ORDER BY utcDateCreated DESC LIMIT 50`,
      [inbox.noteId, inbox.noteId]
    ).map((r) => r.noteId)
  : [];
check(
  "速记：仅 Inbox 子树，按创建倒序",
  JSON.stringify(notes.ids) === JSON.stringify(expectedQuick),
  `${notes.ids.length} 对 ${expectedQuick.length}`
);

// ---------------------------------------------------------------- 搜索
await page.click("#open-search");
await page.waitForSelector("#search-input");
// The term is taken from the vault rather than hard-coded, so this does not break when the test
// server is rebuilt with different contents — which is exactly what happened to it.
const titleHit = serverQuery<{ title: string }>(
  `SELECT title FROM notes
    WHERE isDeleted = 0 AND length(title) > 6
      AND noteId NOT LIKE '\\_%' ESCAPE '\\'
    ORDER BY utcDateModified DESC LIMIT 1`
)[0];
const term = (titleHit?.title ?? "").split(/[\s(（]/)[0]!.slice(0, 10);

await page.fill("#search-input", term);
await page.waitForTimeout(1200);
const searchTitles = await page.locator("#search-results .title").allTextContents();
check(
  "搜索：标题命中排在最前",
  searchTitles.length > 0 && searchTitles[0]!.includes(term),
  `搜「${term}」→ ${searchTitles[0] ?? "(无结果)"}`
);
await page.fill("#search-input", "div");
await page.waitForTimeout(1000);
check(
  "搜索：HTML 标签名不算命中",
  (await page.locator("#search-results .row, #search-results .card").count()) <= 2,
  "搜「div」"
);
await page.click("#search-cancel");
await page.waitForTimeout(400);

// ---------------------------------------------------------------- 知识库
await page.click('[data-tab="library"]');
await page.waitForSelector('#view[data-view="library"] .list, #view[data-view="library"] .empty');
await page.waitForTimeout(600);

const library = await page.evaluate(() => {
  const kids = Array.from(document.querySelector("#view .list")?.children ?? []);
  const ids = kids.map((e) => e.getAttribute("data-note-id"));
  return {
    ids,
    duplicates: ids.length - new Set(ids).size,
    header: document.querySelector("#view .section-count")?.textContent?.trim() ?? ""
  };
});
const serverOrder = serverQuery<{ noteId: string }>(
  `SELECT b.noteId FROM branches b JOIN notes n ON n.noteId = b.noteId
    WHERE b.parentNoteId='root' AND b.isDeleted=0 AND n.isDeleted=0
      AND n.noteId NOT LIKE '\\_%' ESCAPE '\\'
    ORDER BY b.notePosition`
).map((r) => r.noteId);

check("知识库：系统隐藏笔记不显示", library.ids.every((id) => !(id ?? "").startsWith("_")), `${library.ids.length} 条`);
check("知识库：没有重复", library.duplicates === 0, `${library.duplicates} 个重复`);
check("知识库：表头与列表一致", library.header === `${library.ids.length} 项`, `表头「${library.header}」`);
check(
  "知识库：顺序与服务端 notePosition 一致",
  JSON.stringify(library.ids) === JSON.stringify(serverOrder),
  `${library.ids.length} 对 ${serverOrder.length}`
);
check("知识库：有容器可下钻", (await page.locator("[data-into]").count()) > 0, `${await page.locator("[data-into]").count()} 个`);

// ---------------------------------------------------------------- 设置
await page.click("#open-sheet");
await page.waitForSelector("#sheet-settings");
await page.click("#sheet-settings");
await page.waitForSelector("#sync-interval");

const intervals = await page
  .locator("#sync-interval option")
  .evaluateAll((els) => els.map((e) => (e as HTMLOptionElement).textContent?.trim() ?? ""));
check(
  "设置：自动同步间隔 1 分钟–4 小时可选",
  intervals.some((o) => o.includes("1 分钟")) && intervals.some((o) => o.includes("4 小时")),
  intervals.join(" / ")
);
check("设置：附件缓存上限可调", (await page.locator("#blob-cap").count()) === 1);
check("设置：清除本地数据", (await page.locator("#clear-data").count()) === 1);
check("设置：AI 入口在这里", (await page.locator("#open-ai").count()) === 1);
await page.click("#settings-back");
await page.waitForTimeout(400);

// ---------------------------------------------------------------- 详情 · 编辑 · 重命名 · 删除
await page.click("#open-search");
await page.waitForSelector("#search-input");
await page.fill("#search-input", "Trilium");
await page.waitForTimeout(1000);
await page.locator("#search-results [data-note-id]").first().click();
await page.waitForSelector(".detail");

check("详情：打开的是可编辑类型", (await page.locator(".detail").getAttribute("data-note-type")) === "text");
check("详情：重命名入口", (await page.locator("#note-rename").count()) === 1);
check("详情：删除入口", (await page.locator("#note-delete").count()) === 1);
check("详情：添加附件入口", (await page.locator("#add-attachment").count()) === 1);
check("手机端：默认不显示编辑工具栏", (await page.locator("#mode-edit").count()) === 0);

// The dialog must be the app's own: ArkWeb answers neither `prompt` nor `confirm`.
await page.click("#note-rename");
const dialogShown = await page
  .waitForSelector("#dialog-input", { timeout: 8000 })
  .then(() => true)
  .catch(() => false);
check("重命名用应用内弹层（不依赖 WebView）", dialogShown);
await page.click("#dialog-cancel");
await page.waitForTimeout(500);

// 方案C: long press opens the editor on a phone.
await page.evaluate(() => {
  document
    .querySelector(".detail .body")
    ?.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
});
await page.waitForTimeout(900);
check("手机端：长按进入编辑", (await page.locator("#editor").count()) > 0);
check("手机端：进入编辑后工具栏出现", (await page.locator("#mode-save").count()) > 0);

check("未使用 WebView 原生对话框", nativeDialogs === 0, `${nativeDialogs} 次`);

// ---------------------------------------------------------------- report
const gaps: Array<[string, string]> = [
  ["Android / iOS 壳", "未构建——本次审计正是它的前置条件"],
  ["手写转文字", "按决定推迟到 v2（v1 只做墨迹批注 + 手绘）"],
  ["手写笔 pointerType === \"pen\"", "需要真机 + 笔，模拟器无法验证"],
  ["AI 对话发消息", "需要服务端 LLM 配好；本地创建已可用"],
  ["移动端上传的 PDF 在桌面端", "**未解决**——服务端数据、哈希、引用格式、2.5MB 往返均已验证正确，未能复现"]
];

let failed = 0;
console.log("");
for (const [label, ok, detail] of results) {
  if (!ok) failed++;
  console.log(`  ${ok ? "✓" : "✗"} ${label}${detail ? `  (${detail})` : ""}`);
}
console.log(`\n  功能项：${results.length - failed}/${results.length} 通过`);

console.log("\n  已知未完成 / 未验证：");
for (const [what, why] of gaps) console.log(`    · ${what} — ${why}`);

await browser.close();
process.exitCode = failed === 0 ? 0 : 1;
