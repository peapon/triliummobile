/**
 * Do the catalogues agree, and is anything left untranslated in the interface?
 *
 * Three failure modes, all quiet:
 *
 * 1. **A key in one language and not another.** Nothing throws — `t()` falls back to English, so the
 *    UI shows whichever language was translated and English for the rest. Invisible unless you read
 *    the right language.
 * 2. **A key whose placeholders differ between languages.** A renamed `{count}` is not an error; the
 *    value is simply dropped and a sentence reads as if a number were missing.
 * 3. **A literal UI string that never went through `t()`.** Adding a screen in one language and
 *    forgetting the catalogue leaves it untranslated for everybody else, and no test notices.
 *
 * Check 3 works on the whole file rather than line by line. An earlier version matched per line and
 * therefore could not see text inside a **multi-line** template literal — which is where most of a
 * screen's markup lives. It reported 27 findings when there were 81.
 *
 *   pnpm exec tsx tools/i18n-audit.ts
 */

import { readFileSync } from "node:fs";

import { allKeys, catalogue, LANGUAGES } from "../apps/web/src/i18n.js";

const findings: string[] = [];

// ---------------------------------------------------------------- 1. every catalogue agrees
const keys = allKeys();
const reference = catalogue("en");
const chinese = catalogue("cn");

/**
 * Keys whose Japanese value is legitimately the same string as the Chinese one.
 *
 * Japanese and Chinese share a great many technical terms, and for a handful of short ones the
 * correct translation *is* the identical characters. Listed explicitly rather than by loosening the
 * check, so that a new untranslated entry is still caught.
 */
const SHARED_WITH_CHINESE: Record<string, string[]> = {
  ja: ["common.save", "notes.recent", "time.updated"] // 保存 · 最近 · 更新
};
const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(",");

for (const { code } of LANGUAGES) {
  const messages = catalogue(code);

  const missing = keys.filter((key) => !(key in messages));
  if (missing.length > 0) {
    findings.push(`${code}: ${missing.length} missing key(s), e.g. ${missing.slice(0, 3).join(", ")}`);
  }

  const extra = Object.keys(messages).filter((key) => !keys.includes(key));
  if (extra.length > 0) {
    findings.push(`${code}: ${extra.length} key(s) not in the reference, e.g. ${extra.slice(0, 3).join(", ")}`);
  }

  for (const key of keys) {
    const value = messages[key];
    if (value === undefined) continue;
    if (value.trim() === "") findings.push(`${code}: empty value for ${key}`);
    if (placeholders(value) !== placeholders(reference[key]!)) {
      findings.push(`${code}: placeholders differ from en for ${key}`);
    }
    // Copied from the Chinese catalogue rather than translated.
    //
    // Tested by identity against `cn`, not by "contains CJK": Japanese uses kanji, which occupies the
    // same Unicode block, so a range test flags every Japanese entry. A value identical to the
    // Chinese one in a different language has not been touched.
    if (
      code !== "cn" &&
      value === chinese[key] &&
      /[\u4e00-\u9fa5]/.test(value) &&
      !(SHARED_WITH_CHINESE[code] ?? []).includes(key)
    ) {
      findings.push(`${code}: identical to the Chinese value — untranslated: ${key}`);
    }
  }
}

// ---------------------------------------------------------------- 2. nothing left hard-coded
/**
 * Files whose visible text must come from the catalogue.
 *
 * `速记 Inbox` is excluded by name. It is a **migration literal**: the inbox is found by its note id,
 * and this string exists so a vault whose inbox was created by an older build is still recognised.
 * It is compared against stored data, never shown.
 */
const UI_FILES = ["apps/web/src/main.ts", "apps/web/src/worker.ts"];
const ALLOWED_LITERALS = new Set(["速记 Inbox"]);

/**
 * Blank out comments while keeping every offset, so a match can still be mapped to a line.
 *
 * Done across the whole file, not per line: a block comment spanning several lines was the reason
 * this check used to report Chinese quoted *inside* a comment, which is allowed.
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
  const source = stripComments(readFileSync(file, "utf8"));

  // Both quote styles, and a template literal may span lines — hence the whole-source scan.
  const pattern = /(?<![\w$])"([^"\n]*[\u4e00-\u9fa5][^"\n]*)"|`([^`]*[\u4e00-\u9fa5][^`]*)`/g;

  for (const match of source.matchAll(pattern)) {
    const literal = match[1] ?? match[2]!;
    if (ALLOWED_LITERALS.has(literal)) continue;

    const line = source.slice(0, match.index).split("\n").length;
    const shown = literal.length > 60 ? `${literal.slice(0, 57)}…` : literal;
    findings.push(`${file}:${line}  hard-coded UI string: ${JSON.stringify(shown)}`);
  }
}

// ---------------------------------------------------------------- report
if (findings.length === 0) {
  console.log("");
  console.log(`  catalogues agree — ${keys.length} keys × ${LANGUAGES.length} languages`);
  console.log(`  no hard-coded UI strings in ${UI_FILES.join(", ")}`);
  console.log("");
} else {
  console.log("");
  for (const finding of findings.slice(0, 40)) console.log(`  ✗ ${finding}`);
  if (findings.length > 40) console.log(`  … and ${findings.length - 40} more`);
  console.log(`\n  ${findings.length} finding(s)`);
  console.log("");
  process.exitCode = 1;
}
