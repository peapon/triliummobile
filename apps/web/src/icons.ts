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
  cloudOff: `<path d="M5 18h11a4 4 0 0 0 .6-7.96A5.5 5.5 0 0 0 7.2 8.4"/><path d="M3 3l18 18"/>`
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
