/**
 * Measure the layout instead of guessing at it.
 *
 * The usual design loop is "look at it, fix what looks wrong". That loop is unavailable here — I
 * cannot see rendered output — so this measures the things a designer would judge by eye: what is
 * clipped, what overflows, what is too small to tap, how the vertical space is actually spent, and
 * whether anything overlaps anything else.
 *
 * It is not a substitute for taste. It is a substitute for *squinting*, which is the part I cannot do.
 *
 *   pnpm exec tsx tools/layout-audit.ts [appUrl] [password]
 */

import { chromium, type Page } from "playwright-core";

const APP_URL = process.argv[2] ?? "http://127.0.0.1:5273/";
const PASSWORD = process.argv[3] ?? "triliumtest123";

interface Finding {
  screen: string;
  form: string;
  kind: string;
  detail: string;
}

const findings: Finding[] = [];

const VIEWPORTS = [
  { name: "phone-360", width: 360, height: 640 },
  { name: "phone-390", width: 390, height: 844 },
  { name: "phone-narrow-320", width: 320, height: 568 },
  { name: "tablet-1024", width: 1024, height: 768 }
];

/**
 * Page-side measurement, as a string.
 *
 * Passed to `evaluate` as source rather than as a function: the TypeScript transform injects
 * `__name(...)` helpers into named function expressions, and those do not exist in the page, so a
 * function literal fails with `ReferenceError: __name is not defined`.
 *
 * Returns raw measurements; the reporting lives in Node, where it can be read and changed without
 * touching the page.
 */
const MEASURE_SOURCE = String.raw`
(() => {
  const viewport = { w: window.innerWidth, h: window.innerHeight };

  const describe = (el) => {
    const tag = el.tagName.toLowerCase();
    const cls = (el.className || "").toString().split(" ").filter(Boolean).slice(0, 2).join(".");
    const id = el.id ? "#" + el.id : "";
    return tag + id + (cls ? "." + cls : "");
  };

  const visible = (el) => {
    const s = getComputedStyle(el);
    return s.display !== "none" && s.visibility !== "hidden" && el.offsetParent !== null;
  };

  const interactive = Array.from(
    document.querySelectorAll("button, input, textarea, a[href], [data-tab]")
  ).filter(visible);

  const smallTargets = interactive
    .map(function (el) {
      const r = el.getBoundingClientRect();
      return { el: describe(el), w: Math.round(r.width), h: Math.round(r.height) };
    })
    .filter(function (t) { return t.h > 0 && t.h < 44; });

  const clipped = Array.from(document.querySelectorAll("*"))
    .filter(function (el) {
      const s = getComputedStyle(el);
      if (s.overflow === "visible" || s.display === "none") return false;
      if (el.scrollWidth <= el.clientWidth + 1) return false;
      return Array.from(el.childNodes).some(function (n) {
        return n.nodeType === Node.TEXT_NODE && n.textContent && n.textContent.trim();
      });
    })
    .slice(0, 8)
    .map(function (el) {
      return {
        el: describe(el),
        text: (el.textContent || "").trim().slice(0, 32),
        scrollWidth: el.scrollWidth,
        clientWidth: el.clientWidth
      };
    });

  const overflowing = Array.from(document.querySelectorAll("body *"))
    .filter(function (el) {
      const s = getComputedStyle(el);
      if (s.display === "none" || s.position === "fixed") return false;
      const r = el.getBoundingClientRect();
      return r.width > 0 && (r.right > viewport.w + 1 || r.left < -1);
    })
    .slice(0, 8)
    .map(function (el) {
      const r = el.getBoundingClientRect();
      return { el: describe(el), left: Math.round(r.left), right: Math.round(r.right) };
    });

  const detailOpen = !!document.querySelector(".detail");
  const chrome = Array.from(
    document.querySelectorAll(".appbar, .tabbar, .detail-toolbar, .ink-toolbar, .banner")
  ).filter(function (el) {
    // While the note panel is open the tab bar is behind it, so it consumes no visible space.
    return !(detailOpen && el.classList.contains("tabbar"));
  }).map(function (el) {
    const r = el.getBoundingClientRect();
    return { el: describe(el), h: Math.round(r.height), text: (el.textContent || "").trim().slice(0, 30) };
  });

  const scrollable = document.querySelector(".view, .detail .body");
  const scroll = scrollable
    ? { el: describe(scrollable), content: scrollable.scrollHeight, visible: scrollable.clientHeight }
    : null;

  const input = document.querySelector(".quick-note textarea");
  const primary = input
    ? { w: Math.round(input.getBoundingClientRect().width), h: Math.round(input.getBoundingClientRect().height) }
    : null;

  return {
    viewport: viewport,
    docOverflow: document.documentElement.scrollWidth > viewport.w + 1,
    docScrollWidth: document.documentElement.scrollWidth,
    smallTargets: smallTargets,
    clipped: clipped,
    overflowing: overflowing,
    chrome: chrome,
    scroll: scroll,
    primary: primary
  };
})()
`;

/** Shape of what the page-side source returns. */
interface Measurement {
  viewport: { w: number; h: number };
  docOverflow: boolean;
  docScrollWidth: number;
  smallTargets: Array<{ el: string; w: number; h: number }>;
  clipped: Array<{ el: string; text: string; scrollWidth: number; clientWidth: number }>;
  overflowing: Array<{ el: string; left: number; right: number }>;
  chrome: Array<{ el: string; h: number; text: string }>;
  scroll: { el: string; content: number; visible: number } | null;
  primary: { w: number; h: number } | null;
}

async function audit(page: Page, screen: string, form: string): Promise<void> {
  const m = (await page.evaluate(MEASURE_SOURCE)) as Measurement;

  if (m.docOverflow) {
    findings.push({
      screen,
      form,
      kind: "HORIZONTAL OVERFLOW",
      detail: `document is ${m.docScrollWidth}px wide in a ${m.viewport.w}px viewport`
    });
  }

  for (const t of m.overflowing) {
    findings.push({
      screen,
      form,
      kind: "escapes viewport",
      detail: `${t.el} spans ${t.left}..${t.right} (viewport 0..${m.viewport.w})`
    });
  }

  for (const c of m.clipped) {
    findings.push({
      screen,
      form,
      kind: "text clipped",
      detail: `${c.el} "${c.text}" needs ${c.scrollWidth}px, has ${c.clientWidth}px`
    });
  }

  for (const t of m.smallTargets) {
    findings.push({
      screen,
      form,
      kind: "tap target < 44px",
      detail: `${t.el} is ${t.w}x${t.h}`
    });
  }

  const chromeTotal = m.chrome.reduce((sum: number, c: { h: number }) => sum + c.h, 0);
  const report = {
    screen,
    form,
    chromeTotal,
    chrome: m.chrome,
    scroll: m.scroll,
    primary: m.primary,
    viewport: m.viewport
  };

  console.log(
    `  ${form.padEnd(15)} chrome=${String(chromeTotal).padStart(4)}px` +
      (m.primary ? `  textarea=${m.primary.w}x${m.primary.h}` : "") +
      (m.scroll ? `  scroll=${m.scroll.visible}/${m.scroll.content}` : "")
  );

  if (chromeTotal > m.viewport.h * 0.4) {
    findings.push({
      screen,
      form,
      kind: "chrome eats the screen",
      detail: `${chromeTotal}px of ${m.viewport.h}px (${Math.round((chromeTotal / m.viewport.h) * 100)}%) is bars and banners`
    });
  }

  void report;
}

async function main(): Promise<void> {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    locale: "zh-CN"
  });

  try {
    const page = await context.newPage();
    await page.goto(APP_URL, { waitUntil: "domcontentloaded" });
    await page.waitForSelector("#connect", { timeout: 60_000 });

    for (const vp of VIEWPORTS) {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.waitForTimeout(200);
      console.log(`\n${vp.name} (${vp.width}x${vp.height})`);
      await audit(page, "setup", vp.name);
    }

    await page.setViewportSize({ width: 390, height: 844 });
    await page.fill("#password", PASSWORD);
    await page.click("#connect");
    await page.waitForSelector(".tabbar", { timeout: 180_000 });
    // The bar is deliberately silent when settled, so "finished" is "the sync button is enabled
    // again", not a phrase.
    await page.waitForFunction(
      () => {
        const button = document.getElementById("sync") as HTMLButtonElement | null;
        return button !== null && !button.disabled;
      },
      undefined,
      { timeout: 180_000 }
    );

    const screens: Array<{ name: string; open: () => Promise<void> }> = [
      {
        name: "capture",
        open: async () => {
          await page.click('[data-tab="capture"]');
          await page.waitForSelector("#capture-body");
        }
      },
      {
        name: "search",
        open: async () => {
          await page.click('[data-tab="search"]');
          await page.waitForSelector("#search-input");
        }
      },
      {
        name: "browse",
        open: async () => {
          await page.click('[data-tab="browse"]');
          await page.waitForSelector(".row");
        }
      },
      {
        name: "detail",
        open: async () => {
          await page.click('[data-tab="browse"]');
          await page.waitForSelector(".row");
          await page.locator(".row").first().click();
          await page.waitForSelector(".detail");
        }
      }
    ];

    for (const screen of screens) {
      for (const vp of VIEWPORTS) {
        await page.setViewportSize({ width: vp.width, height: vp.height });
        await screen.open();
        await page.waitForTimeout(250);
        console.log(`\n${screen.name} — ${vp.name} (${vp.width}x${vp.height})`);
        await audit(page, screen.name, vp.name);

        if (screen.name === "detail") {
          await page.click("#detail-back");
          await page.waitForTimeout(300);
        }
      }
    }
  } finally {
    await browser.close();
  }

  console.log(`\n\n================ findings (${findings.length}) ================`);
  if (findings.length === 0) {
    console.log("nothing measurable is wrong: no overflow, no clipped text, no small targets.");
  }
  for (const f of findings) {
    console.log(`  [${f.kind}] ${f.screen}/${f.form}\n      ${f.detail}`);
  }
}

main().catch((error) => {
  console.error("layout audit failed:", error);
  process.exitCode = 1;
});
