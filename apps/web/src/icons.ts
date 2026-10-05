/**
 * Inline SVG icons.
 *
 * The tab bar used to be three Unicode glyphs (`✎ ⌕ ☰`) and a `⚙`. Those are drawn by whichever font
 * the platform resolves, so weight, baseline and optical size differ on every device, and they
 * inherit the text colour and stroke weight — which is a large part of why the chrome read as cheap.
 *
 * Inline SVG with `currentColor` and a consistent 24-unit grid renders identically everywhere and
 * costs no dependency. Routes target the HarmonyOS WebView and a plain browser, so a bundled icon
 * font or a JS icon library would both be more machinery than the six shapes warrant.
 */

const PATHS: Record<string, string> = {
  // A nib, not a plus: the tab is for writing, and a plus reads as "create a record".
  write: `<path d="M4 20h4L19 9a2.5 2.5 0 0 0-3.5-3.5L4.5 16.5V20z"/><path d="M14.5 6.5 17.5 9.5"/>`,
  search: `<circle cx="11" cy="11" r="6.5"/><path d="m16 16 4 4"/>`,
  browse: `<path d="M4 6h16"/><path d="M4 12h16"/><path d="M4 18h10"/>`,
  settings: `<circle cx="12" cy="12" r="3"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M18.7 5.3l-2.1 2.1M7.4 16.6l-2.1 2.1"/>`,
  back: `<path d="M15 5l-7 7 7 7"/>`,
  download: `<path d="M12 4v11"/><path d="m7.5 10.5 4.5 4.5 4.5-4.5"/><path d="M5 19h14"/>`,
  cloudOff: `<path d="M5 18h11a4 4 0 0 0 .6-7.96A5.5 5.5 0 0 0 7.2 8.4"/><path d="M3 3l18 18"/>`,
  more: `<circle cx="5" cy="12" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="19" cy="12" r="1.4"/>`,
  close: `<path d="M6 6l12 12M18 6L6 18"/>`,
  check: `<path d="M5 13l4.5 4.5L19 7"/>`,
  // Note types, so a row can say what it is before it is opened.
  book: `<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H19v15H6.5A2.5 2.5 0 0 0 4 20.5z"/><path d="M4 18.5A2.5 2.5 0 0 1 6.5 16H19"/>`,
  note: `<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4"/>`,
  code: `<path d="M9 8l-4 4 4 4"/><path d="M15 8l4 4-4 4"/>`,
  image: `<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="8.5" cy="10" r="1.5"/><path d="M21 16l-5-5-6 6"/>`,
  file: `<path d="M13 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V9z"/><path d="M13 3v6h6"/>`,
  canvas: `<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8" cy="10" r="2"/><circle cx="16" cy="15" r="2"/><path d="M9.5 11.5l5 2.5"/>`,
  grid: `<rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/>`,
  list: `<path d="M4 6h16M4 12h16M4 18h16"/>`,
  trash: `<path d="M4 7h16"/><path d="M9 7V5h6v2"/><path d="M6 7l1 13h10l1-13"/><path d="M10 11v6M14 11v6"/>`,
  plus: `<path d="M12 5v14M5 12h14"/>`,
  ai: `<path d="M12 3.5l1.9 4.6 4.6 1.9-4.6 1.9L12 16.5l-1.9-4.6L5.5 10l4.6-1.9z"/><path d="M18.5 16.5l.8 1.9 1.9.8-1.9.8-.8 1.9-.8-1.9-1.9-.8 1.9-.8z"/>`,
  sync: `<path d="M20 12a8 8 0 1 1-2.3-5.6"/><path d="M20 4v4h-4"/>`
};

/**
 * Render an icon as markup.
 *
 * `aria-hidden` because every icon here sits next to, or inside, something that already carries the
 * accessible name — a duplicate would make a screen reader announce the control twice.
 */
export function icon(name: keyof typeof PATHS | string, className = ""): string {
  const path = PATHS[name];
  if (!path) return "";

  const classes = className ? `icon ${className}` : "icon";

  return `<svg class="${classes}" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${path}</svg>`;
}
