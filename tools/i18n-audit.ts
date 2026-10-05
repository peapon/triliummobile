/**
 * Do the two catalogues agree, and is anything left untranslated in the UI?
 *
 * Two failure modes this catches, both quiet:
 *
 * 1. **A key present in one language and missing in the other.** Nothing throws — `t()` falls back
 *    to the key, so the UI shows `editor.save` to somebody instead of "Done". It is visible if you
 *    look in the right language and invisible otherwise.
 * 2. **A literal UI string that never went through `t()`.** Adding a screen in Chinese and forgetting
 *    to add a key leaves that screen untranslated for everyone else, and no test notices.
 *
 *   pnpm exec tsx tools/i18n-audit.ts
 */

import { readFileSync } from "node:fs";

import { allKeys, catalogue } from "../apps/web/src/i18n.js";

const findings: string[] = [];

// ---------------------------------------------------------------- 1. catalogues agree
const cn = catalogue("cn");
const en = catalogue("en");

for (const key of allKeys()) {
  const inCn = key in cn;
  const inEn = key in en;
  if (!inCn || !inEn) {
    findings.push(`key only in ${inCn ? "cn" : "en"}: ${key}`);
    continue;
  }
  if (cn[key]!.trim() === "") findings.push(`empty cn value: ${key}`);
  if (en[key]!.trim() === "") findings.push(`empty en value: ${key}`);
  // A value that is identical in both is usually a key that was added and never translated.
  if (cn[key] === en[key] && /[\u4e00-\u9fa5]/.test(cn[key]!)) {
    findings.push(`en value is still Chinese: ${key} -> ${cn[key]}`);
  }
}

// Placeholders must match, or a translation silently drops a value.
const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(",");
for (const key of allKeys()) {
  if (!(key in cn) || !(key in en)) continue;
  if (placeholders(cn[key]!) !== placeholders(en[key]!)) {
    findings.push(`placeholders differ: ${key} (${placeholders(cn[key]!)} vs ${placeholders(en[key]!)})`);
  }
}

// ---------------------------------------------------------------- 2. nothing left hard-coded
/**
 * Files whose visible text must come from the catalogue.
 *
 * `速记 Inbox` is excluded by name and with reason: it is the title of a note stored on the server,
 * so translating it would create a second note in a second language and the inbox would stop being
 * found. Data, not interface.
 */
const UI_FILES = ["apps/web/src/main.ts", "apps/web/src/worker.ts"];
const ALLOWED_LITERALS = new Set(["速记 Inbox"]);

/**
 * Blank out comments while keeping the line structure, so a reported line number still points at the
 * right line.
 *
 * Done across the whole file rather than per line: a block comment spanning several lines was the
 * reason this check used to report Chinese quoted *inside* a comment, which is allowed.
 */
function stripComments(source: string): string {
  const blank = (text: string) => text.replace(/[^\n]/g, " ");
  return source
    .replace(/\/\*[\s\S]*?\*\//g, blank)
    .split("\n")
    .map((line) => line.replace(/\/\/.*$/, ""))
    .join("\n");
}

for (const file of UI_FILES) {
  const lines = stripComments(readFileSync(file, "utf8")).split("\n");

  lines.forEach((line, index) => {
    // Both quote styles: the first pass over this code found only double-quoted strings and missed
    // every template literal, which is where about a third of the real UI text lives.
    for (const match of line.matchAll(/(?<![\w$])"([^"\n]*[\u4e00-\u9fa5][^"\n]*)"|`([^`\n]*[\u4e00-\u9fa5][^`\n]*)`/g)) {
      const literal = match[1] ?? match[2]!;
      if (ALLOWED_LITERALS.has(literal)) continue;
      findings.push(`${file}:${index + 1}  hard-coded UI string: ${JSON.stringify(literal)}`);
    }
  });
}

// ---------------------------------------------------------------- report
if (findings.length === 0) {
  console.log("");
  console.log(`  catalogues agree — ${allKeys().length} keys, cn and en`);
  console.log(`  no hard-coded UI strings left in ${UI_FILES.join(", ")}`);
  console.log("");
} else {
  console.log("");
  for (const finding of findings) console.log(`  ✗ ${finding}`);
  console.log(`\n  ${findings.length} finding(s)`);
  console.log("");
  process.exitCode = 1;
}
