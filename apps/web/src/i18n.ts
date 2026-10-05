/**
 * Messages, and the language to show them in.
 *
 * Trilium ships about thirty languages and treats `locale` as a **synced** option — it belongs to the
 * vault rather than to a device. So this client does the same: it reads the server's `locale` and
 * follows it, and a device may override it locally, because a phone and a desktop are not always
 * wanted in the same language.
 *
 * Keys are semantic rather than the Chinese string itself. Using the text as the key is less code up
 * front and impossible to get out of step, but it makes an English sentence the identity of a
 * message, and this repository is published.
 *
 * A missing translation falls back to the key, which makes an omission loud in the UI rather than
 * silent — and `tools/i18n-audit.ts` fails if the two catalogues ever disagree about a key.
 */

import { cn } from "./locales/cn.js";
import { de } from "./locales/de.js";
import { en } from "./locales/en.js";
import { es } from "./locales/es.js";
import { fr } from "./locales/fr.js";
import { it } from "./locales/it.js";
import { ja } from "./locales/ja.js";
import { nl } from "./locales/nl.js";
import { ru } from "./locales/ru.js";

export type Language = "cn" | "en" | "fr" | "de" | "it" | "es" | "ja" | "ru" | "nl";

/** Shown in the picker, each in its own language — the one label a speaker always recognises. */
export const LANGUAGES: ReadonlyArray<{ code: Language; label: string }> = [
  { code: "cn", label: "简体中文" },
  { code: "en", label: "English" },
  { code: "fr", label: "Français" },
  { code: "de", label: "Deutsch" },
  { code: "it", label: "Italiano" },
  { code: "es", label: "Español" },
  { code: "ja", label: "日本語" },
  { code: "ru", label: "Русский" },
  { code: "nl", label: "Nederlands" }
];

/**
 * Every language, one file each.
 *
 * A file per language is deliberate: adding one is adding a file, not editing this one, which is what
 * makes a translation something somebody other than the author can contribute.
 */
const CATALOGUES: Record<Language, Record<string, string>> = { cn, en, fr, de, it, es, ja, ru, nl };

/**
 * Trilium's `locale` values are language codes, sometimes with a region: `en`, `en-GB`, `cn`, `pt-BR`.
 * Only the leading part matters here, and anything unrecognised falls back to the default rather than
 * showing keys.
 */
export function languageFromLocale(locale: string | null | undefined, fallback: Language = "cn"): Language {
  if (!locale) return fallback;

  const base = locale.trim().toLowerCase().split(/[-_]/)[0] ?? "";
  if (base === "zh") return "cn";

  const supported: Language[] = ["cn", "en", "fr", "de", "it", "es", "ja", "ru", "nl"];
  return (supported as string[]).includes(base) ? (base as Language) : fallback;
}

let current: Language = "cn";

export function getLanguage(): Language {
  return current;
}

export function setLanguage(language: Language): void {
  current = language;
  // The document language drives font selection and hyphenation, so it is worth keeping honest.
  // The same catalogue is loaded in the worker, which has no document — hence the guard.
  if (typeof document !== "undefined") {
    document.documentElement?.setAttribute("lang", language === "cn" ? "zh-CN" : "en");
  }
}

/**
 * Substitute `{name}` placeholders. Values are escaped by the caller when they reach markup.
 *
 * The fallback is **English**, not Chinese, and that is what makes a partial translation usable. A
 * contributor who translates eighty of a hundred and fifty keys gets a UI that is eighty per cent in
 * their language and readable in the rest, rather than one that is half in a language they do not
 * read. It is also the only way a language can be added incrementally — which is how all forty of
 * Trilium's were added.
 */
export function t(key: string, vars?: Record<string, string | number>): string {
  const template = CATALOGUES[current][key] ?? CATALOGUES.en[key] ?? key;
  if (!vars) return template;

  return template.replace(/\{(\w+)\}/g, (whole, name: string) =>
    name in vars ? String(vars[name]) : whole
  );
}

/** Every key, for the audit that checks the two catalogues agree. */
export function allKeys(): string[] {
  return [...new Set([...Object.keys(cn), ...Object.keys(en)])].sort();
}

/** The catalogue itself, so the audit can look for empty or missing entries. */
export function catalogue(language: Language): Record<string, string> {
  return CATALOGUES[language];
}
