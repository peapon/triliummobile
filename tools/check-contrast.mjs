/**
 * Verify the palette against WCAG, reading the values out of the stylesheet.
 *
 * The stylesheet claims every text pair was measured. This is what measures them, so the claim can be
 * re-checked after any colour is touched rather than being a note about a past afternoon.
 *
 *   node tools/check-contrast.mjs
 *
 * Exits non-zero on a failure, so it can gate a commit.
 */

import { readFileSync } from "node:fs";

const CSS = readFileSync(new URL("../apps/web/src/style.css", import.meta.url), "utf8");

/** Pull `--name: value;` out of one block. */
function tokensIn(block) {
  const tokens = {};
  for (const match of block.matchAll(/--([a-z0-9-]+):\s*(#[0-9a-f]{3,8})\s*;/gi)) {
    tokens[match[1]] = match[2];
  }
  return tokens;
}

const rootBlock = CSS.slice(CSS.indexOf(":root {"), CSS.indexOf("@media (prefers-color-scheme: light)"));
const lightStart = CSS.indexOf("@media (prefers-color-scheme: light)");
const lightBlock = CSS.slice(lightStart, CSS.indexOf("@media (prefers-reduced-motion"));

const dark = tokensIn(rootBlock);
const light = { ...dark, ...tokensIn(lightBlock) };

// --- WCAG ---------------------------------------------------------------------------------------

const channels = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
const linear = (c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const luminance = (hex) => {
  const [r, g, b] = channels(hex).map(linear);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

/** [label, foreground token, background token, minimum ratio] */
const CHECKS = [
  ["body text on page", "text", "bg", 4.5],
  ["body text on card", "text", "surface", 4.5],
  ["secondary text on page", "muted", "bg", 4.5],
  ["secondary text on card", "muted", "surface", 4.5],
  ["secondary text on raised", "muted", "surface-2", 4.5],
  ["tertiary text on card", "faint", "surface", 4.5],
  ["accent text on card", "accent", "surface", 4.5],
  ["accent text on page", "accent", "bg", 4.5],
  ["danger text on card", "danger", "surface", 4.5],
  ["success text on card", "ok", "surface", 4.5],
  ["warning text on card", "warn", "surface", 4.5],
  ["primary button label", "accent-ink", "accent", 4.5],
  // 1.5:1 is the floor for a non-text boundary to be perceivable at all. A 1px rule below it is
  // there in the markup and invisible on the screen, which is what made the first version flat.
  ["hairline on card", "border", "surface", 1.5],
  ["hairline on page", "border", "bg", 1.5],
  ["strong hairline on card", "border-strong", "surface", 1.5]
];

let failures = 0;

for (const [name, tokens] of [
  ["dark", dark],
  ["light", light]
]) {
  console.log(`\n${name}`);
  for (const [label, fgToken, bgToken, target] of CHECKS) {
    const fg = tokens[fgToken];
    const bg = tokens[bgToken];

    if (!fg || !bg) {
      console.log(`  SKIP  missing token --${fg ? bgToken : fgToken}`);
      failures++;
      continue;
    }

    const ratio = contrast(fg, bg);
    const pass = ratio >= target;
    if (!pass) failures++;

    console.log(
      `  ${pass ? "PASS" : "FAIL"}  ${ratio.toFixed(2).padStart(6)}:1  (>= ${target})  ${label}`
    );
  }
}

console.log(`\n${failures === 0 ? "All contrast checks pass." : `${failures} contrast failure(s).`}`);
process.exit(failures === 0 ? 0 : 1);
