# 04 — Stylus / handwriting input on Pad: HarmonyOS (鸿蒙), iPadOS, Android

Research date: **2026-10-04** (Asia/Shanghai). Author: research subagent.
Scope: an offline-first Trilium Notes client. Phone = quick capture + search + reading.
**Pad = that plus keyboard editing and "手写笔输入编辑"**. UI plan: web core (HTML/CSS/JS) in a
WebView (ArkWeb / WKWebView / Android WebView), thin native shell (hand-written ArkTS; Capacitor
for Android/iOS).

> **Confidence convention.** `[verified]` = primary source fetched and the statement read directly
> (official docs, source code, MDN browser-compat-data JSON). `[reported]` = credible secondary
> source (vendor forum, maintainer, StackOverflow). `[UNCERTAIN]` = could not confirm from a
> primary source; treat as a hypothesis to test on a device.
>
> **Fetch note.** `developer.huawei.com` doc-center pages are an Angular SPA that returns only
> `<app-root>` to a plain HTTP fetch. All Huawei content below was retrieved through a
> JS-rendering text proxy; the **canonical URLs are cited** and the text is `[verified]` against
> the rendered page, but treat them as one step removed from a raw fetch. Where a page could not
> be rendered at all it is marked `[UNCERTAIN]` and listed in §8.

---

## 1. Disambiguating "手写笔输入编辑" — three different products

These are usually conflated in one phrase. They have almost nothing in common technically.

### (a) Handwriting-to-text (笔迹转文字 / Scribble-style)

Write with the pen, the system IME converts to typed characters that land in the focused field.
**Nothing of ours is in the loop** — it is a system + IME feature. The only question that matters is
*does the system route it into a WebView text field?*

| Platform | Free in a WebView? | Evidence |
|---|---|---|
| iPadOS | **Yes** | `[verified]` "By default, Scribble works in all standard text components — such as text fields, text views, search fields, and **editable fields in web content** — except password fields." — [Apple HIG, Apple Pencil and Scribble](https://developer.apple.com/design/human-interface-guidelines/apple-pencil-and-scribble) |
| Android 14+ (API 34) | **Yes** | `[verified]` "Android text entry fields, including EditText components and **WebView text widgets**, support stylus input by default." — [Stylus input in text fields](https://developer.android.com/develop/ui/views/touch-and-input/stylus-input/stylus-input-in-text-fields) |
| HarmonyOS (ArkWeb) | **No / doubtful** | `[reported]` System 全局手写 triggers in ArkWeb `<input>` but **not** in `<textarea>` or `contenteditable` — [Huawei forum thread](https://developer.huawei.com/consumer/cn/forum/topic/0210157907485611572) (original missing, mirror: [bbs.itying.com](http://bbs.itying.com/topic/67057700bb648a00d098581f)); a second thread reports web `input`/`textarea` not accepting stylus writes at all in the browser — [Huawei forum](https://developer.huawei.com/consumer/cn/forum/topic/0202172489107476174) |

**This asymmetry is the single most important finding in this document.** It inverts the usual
assumption that HarmonyOS, being the priority platform, is also the most capable.

### (b) Ink annotation / freehand markup over existing content

Strokes drawn on a canvas layer *above* or *behind* existing note content. Requires: stroke capture,
a stroke model, a renderer, a persistence format, and an undo/history model. **All of that is
platform-agnostic and can live in the web core.** Only two things are genuinely native:

- **Low-latency rendering** (front-buffer / predicted points) — HarmonyOS `StylusFrameBoost` + 报点预测,
  Android `GLFrontBufferedRenderer` + `input-motionprediction`, iOS Ink/PencilKit prediction.
- **Palm rejection** — free on iPadOS (OS-level), heuristic/app-level on Android, no app-level
  primitive on HarmonyOS (`setHandwritingFlag` is a System API — see §2).

### (c) Freeform sketch notes as a first-class note type

Same machinery as (b), plus a *note type*, a *thumbnail*, and a *search story* (an ink note is
invisible to full-text search until you either recognize the strokes or store a text proxy).
On Trilium this maps onto either a text note with an embedded ink block or a dedicated
canvas-style note (§6).

### What is reusable vs what must be native

| Layer | Reusable across all three | Must be native per platform |
|---|---|---|
| Stroke capture from Pointer Events | ✅ web core | — |
| Stroke model + JSON serialisation | ✅ web core | — |
| Renderer (canvas/WebGL) | ✅ web core | — |
| Undo / history | ✅ web core | — |
| Handwriting→text | — | ✅ system IME (free on iOS + Android 14+; **not** ArkWeb) |
| Low-latency front buffer | — | ✅ Pen Kit / GLFrontBufferedRenderer / PencilKit |
| Palm rejection | partial (heuristics in JS) | ✅ best signal is native |
| Pressure / tilt | ✅ via Pointer Events (version floors differ) | prop delivered by OS |
| Pen-body gestures (squeeze / double-tap) | — | ✅ Pen Kit `stylusInteraction`, `UIPencilInteraction` |
| Note-type + storage integration | ✅ Trilium-side | — |

**Conclusion for §1: build (b) and (c) once in the web core; get (a) free on two of three platforms
and treat HarmonyOS as the exception that needs a native escape hatch.**

---

## 2. HarmonyOS (priority platform)

### 2.1 What Huawei ships: **Pen Kit（手写笔服务）**

Pen Kit is an **HMS kit** (not open-source OpenHarmony), imported as `@kit.Penkit`, guarded by
`SystemCapability.Stylus.Handwrite` and `SystemCapability.Stylus.StylusService`.
`[verified]` [Pen Kit 简介](https://developer.huawei.com/consumer/cn/doc/doccenter-capabilities/pen-introduction).

It exposes **five** capabilities `[verified]`:

1. **手写套件 (Handwriting suite)** — an ArkUI **component**: `HandwriteComponent` + `HandwriteController`.
2. **报点预测 (point prediction)** — predicts points ahead of the nib to improve 跟手性 (follow-the-hand
   feel). On by default inside the suite; separately integrable.
3. **一笔成形 (instant shape)** — `InstantShapeGenerator`; recognises a held stroke into a clean shape.
4. **全局取色 (global colour picker)**.
5. **手写交互 (stylus interaction)** — `stylusInteraction.on('squeeze')` / `on('doubleTap')`, API 5.1.1(19)+:
   M-Pencil body squeeze and double-tap events. `[verified]`
   [stylusInteraction](https://developer.huawei.com/consumer/cn/doc/doccenter-references/api/pen-stylusinteraction).

Also `StylusFrameBoost`（手写笔跟手性加速）for frame-rate boosting during writing `[verified]`
[StylusFrameBoost](https://developer.huawei.com/consumer/cn/doc/doccenter-references/api/pen-stylusframeboost).

### 2.2 `HandwriteComponent` / `HandwriteController` — what it actually is

`[verified]` [HandwriteController](https://developer.huawei.com/consumer/cn/doc/doccenter-references/api/pen-handwritecontroller),
[HandwriteComponent](https://developer.huawei.com/consumer/cn/doc/doccenter-references/api/pen-handwritecomponent),
[接入手写套件](https://developer.huawei.com/consumer/cn/doc/doccenter-capabilities/pen-suite).

- It is an **ArkUI component**, not something a WebView can host. You get a full canvas + toolbar:
  7 brushes (ballpoint, pen, pencil, marker, highlighter, mosaic, laser), 5 widths, 100+ colours,
  stroke-eraser / pixel-eraser / highlighter-only eraser / clear, shape tools, lasso, and (API 26.0.0)
  a ring toolbar opened by squeezing the pen body.
- It **only scrolls vertically**; no horizontal panning `[verified]`.
- API surface: `load(path)`, `save(path): Promise<void>`, `onLoad(cb)`, `getContentRange(): Rect`
  (API 6.0.0/20), `getThumbnail(rect): Promise<PixelMap>` (20), `scrollTo(yOffset)` (6.1.0/23).
- **Persistence is an opaque proprietary note file.** `load(path)` "loads a note file from the given
  path; if the path does not exist, a new note file is created". No documented open/parseable format,
  no stroke export, no way to read the strokes back into your own model. `[verified]`
  (documented behaviour), **format undocumented `[UNCERTAIN]`**.
- `getThumbnail()` returning a `PixelMap` is the only documented bridge from Pen Kit ink back into
  something you can store yourself.
- **No handwriting *recognition* API.** See §2.5.

### 2.3 ArkUI stylus event APIs (the native, non-WebView path)

`[verified]` from OpenHarmony docs (`github.com/openharmony/docs`, grepped locally) and Huawei refs:

- `SourceTool.Pen = 2` — input-tool enum on touch/gesture events, since **API 9**, atomic-service API
  since API 11. `[verified]` `ts-gesture-settings.md#SourceTool`.
  (`SourceType.PEN` also exists in `ResponseRegionSupportedTool<sup>22+</sup>`, which lets you
  restrict a touch target's hit region to pen only — a crude palm-rejection primitive.)
- `TouchEvent.pressure` since **API 15**, range `[0, 65535)`. `HistoricalPoint.force` for batched
  sub-samples. `getHistoricalPoints(): Array<HistoricalPoint>` since API 10. `[verified]`
  `ts-universal-events-touch.md`.
- Gesture events carry `pressure` (0–1), `tiltX`, `tiltY`, and `rollAngle` (API 17+). `[verified]`
  `ts-gesture-customize-judge.md`.
- **Hover** events fire for a stylus held above the screen; examples test `event.sourceTool == SourceTool.Pen`.
  `[verified]` `ts-universal-events-hover.md`. Note the doc caveat: "some styli do not support hover
  events, depending on hardware capability."
- NDK/C equivalents: `OH_ArkUI_UIInputEvent_GetToolType()`, `UI_INPUT_EVENT_TOOL_TYPE_PEN = 2`,
  `OH_ArkUI_PointerEvent_GetTiltX()`, `GetTiltY()`, `GetRollAngle()`. `[verified]` `capi-ui-input-event-h.md`.
- **Palm rejection is not available to third-party apps.** `window.setHandwritingFlag(enable)` —
  "After this flag is added, the window responds to stylus events but not touch events" — is marked
  **System API**, `SystemCapability.Window.SessionManager`. `[verified]`
  `js-apis-window-sys.md#setHandwritingFlag`. This is the OS mechanism Huawei's own notes app uses;
  we cannot.
- `Rosen`/ArkUI also cancels finger touches when a stylus is active: `Cancel` is triggered when
  "手指触摸过程中存在手写笔操作，手指的触摸操作会收到 Cancel 事件" `[verified]`
  `ts-appendix-enums.md`. **This is the one palm-rejection behaviour we may get for free** — worth
  testing early.

### 2.4 Does **ArkWeb** receive stylus events?

- ArkWeb is Chromium-based. The OpenHarmony ArkWeb doc states only: "ArkWeb receives the ArkUI touch
  event and identifies the gesture… ArkWeb gestures comply with the touch events, UI events, and
  **pointer events defined by the W3C standard**." `[verified]`
  [web-gesture.md](https://gitee.com/openharmony/docs/blob/master/en/application-dev/web/web-gesture.md)
- I found **no** HarmonyOS or OpenHarmony document that explicitly guarantees `pointerType === "pen"`,
  `getCoalescedEvents`, `getPredictedEvents`, or palm rejection **inside ArkWeb**. Since ArkUI does
  carry `SourceTool.Pen` and Chromium maps stylus tool types to `pointerType: "pen"`, it is *plausible*
  and likely, but **unproven** → `[UNCERTAIN]`. **This must be measured on a real device before any
  architecture is committed** (see MVI step 6).
- No ArkWeb API for palm rejection, point prediction, or front-buffer rendering was found →
  assume **not exposed** `[UNCERTAIN]`.
- ArkWeb ↔ native bridging is well-trodden: `registerJavaScriptProxy` / `javaScriptProxy` and
  `runJavaScript`, which is the escape hatch if ArkWeb stylus fidelity disappoints. `[reported]`
  (multiple Huawei forum threads on `registerJavaScriptProxy` timing bugs — a known rough edge).

### 2.5 Does HarmonyOS expose handwriting **recognition** to third-party apps?

**No, not as a stroke→text API. It is effectively IME / system-UI only.** Evidence:

- `[reported]` A Huawei developer-forum technical thread (2026-03-24) surveys every option and
  concludes: "查阅文档发现，目前的 Pen Kit 提供了极佳的墨迹渲染（拟真笔刷）和图形识别（一笔成形），
  但并没有暴露出'轨迹转文本'的接口。" — *Pen Kit exposes no trajectory→text interface.* The four
  approaches it evaluates:
  1. **Canvas snapshot → Core Vision Kit `textRecognition` (image OCR).** Works, but it is visual OCR:
     wastes the pen's X/Y/Time/Pressure data, requires a cross-thread screenshot, is too slow for
     "write and see text appear", and fails on non-print handwriting.
  2. **Third-party C++ trajectory engines** (Zinnia, $P, LipiTk) via NAPI — offline, but CPU-only (no
     NPU), CJK-biased models, and adds HAP size.
  3. **Pen Kit** — no such interface.
  4. **System 全局手写 + a `TextArea`** — recognition is fast ("接近华为笔记体验") but **it consumes
     the ink**: once text is committed the original handwriting is gone, so you cannot keep a
     stroke layer *and* extract text.
  Huawei's official reply was a non-answer asking for business justification and frequency of use —
  i.e. no committed API. `[verified]` that the thread and reply exist;
  `[reported]` for the technical conclusions.
  [Forum thread](https://developer.huawei.com/consumer/cn/forum/topic/0207209760463484658)
- The nearest *supported* recognition is **Core Vision Kit 通用文字识别 (`textRecognition`)** — image
  OCR. `[reported]` ([Core Vision Kit OCR walkthrough](https://developer.huawei.com/consumer/cn/forum/topic/0204223551822397082)),
  with a known complaint thread "文本识别识别度低" `[reported]`.
- Huawei's own consumer support confirms 全局手写 requires HarmonyOS 2+ and a supported M-Pencil
  generation: `[verified]` [华为平板全局手写无法使用](https://consumer.huawei.com/cn/support/content/zh-cn15822601/).
- Third-party IMEs *are* possible on HarmonyOS (e.g. an open-source Metasequoia IME has a HarmonyOS
  platform port) `[reported]`, but shipping our own IME to get recognition is absurd for a notes app.

**Practical consequence: on HarmonyOS, "write with the pen and get text" inside our WebView is not
achievable today via an official API.** The realistic options are (i) a native ArkTS handwriting
field for text entry, (ii) OCR after the fact, (iii) our own on-device stroke recogniser.

---

## 3. iPadOS

### 3.1 Scribble in `WKWebView` — **works, and it is free**

`[verified]` Apple HIG: Scribble "works in all standard text components — such as text fields, text
views, search fields, and **editable fields in web content** — except password fields", and "Because
Scribble is fully integrated into iPadOS, it's available to all apps by default."
([HIG](https://developer.apple.com/design/human-interface-guidelines/apple-pencil-and-scribble))

- Scribble requires Apple Pencil; it does not work with a finger. `[verified]` HIG: "Scribble only
  supports Apple Pencil input."
- Programmatic control is `[verified]`-by-documentation-reference: [`UIScribbleInteraction`](https://developer.apple.com/documentation/uikit/uiscribbleinteraction)
  (for custom text fields) and [`UIIndirectScribbleInteraction`](https://developer.apple.com/documentation/uikit/uiindirectscribbleinteraction-1nfjm)
  (for areas that are not text fields at all — the HIG cites Reminders' "write in the blank space"
  behaviour). `UIScribbleInteraction.isHandwritingEnabled` is the documented disable switch.
  `[UNCERTAIN]`: whether an interaction registered on the native view **container** can suppress or
  enable Scribble *inside* the `WKWebView`'s own content — the web content is a separate responder
  graph. Assume you can suppress it only by disabling Pencil input on the `WKWebView` as a whole.
- The HIG also warns about behaviours that break writing in web UI: do not autoscroll the field while
  writing, do not move/resize the field mid-stroke, do not show autocomplete during writing, and hide
  placeholder text as soon as writing starts. `[verified]` — these are cheap, high-impact rules for a
  `contenteditable` editor.

### 3.2 PencilKit inside a `WKWebView` — **no; ink requires native**

- `PKCanvasView` / `PKDrawing` / `PKToolPicker` are native UIKit/`UIView` objects. There is **no
  supported way to render `PKDrawing` ink inside web content** `[UNCERTAIN]` (absence of any Apple
  API for it) — the working patterns are:
  - **Overlay**: add a sibling/child `PKCanvasView` above the `WKWebView` and toggle
    `isUserInteractionEnabled` to arbitrate between drawing and scrolling/selection. `[reported]`
    (the standard community answer; see [SO: Overlaying PKCanvasView on top of WKWebView](https://stackoverflow.com/questions/66251895)).
  - **Export/import only**: draw on your own HTML canvas, and use PencilKit purely as a converter
    (`PKDrawing.image(from:scale:)` in, `PKDrawing(data:)` out) — keeps web as the source of truth.
- `PKToolPicker` requires a native responder to observe. It is a floating panel, so it can visually
  coexist with a web content view, but it will not drive a web canvas. `[UNCERTAIN]` for the
  coexistence specifics; `[verified]` that it is a native, responder-attached control.
- Apple Pencil senses "tilt (altitude), force (pressure), orientation (azimuth), and barrel roll"
  `[verified]` HIG.

### 3.3 Pointer Events for Apple Pencil in Safari/WKWebView

`[verified]` **`pointerType === "pen"` is real.** WebKit commit
["Produce "pen" Pointer Events if using a stylus (e.g. Apple Pencil)"](https://github.com/WebKit/WebKit/commit/7f23d038821327941799bcffb3b20a0c7d8bd9d3)
maps `PlatformTouchPoint::TouchType::Stylus` → `"pen"_s`, and adds the WPT test
`pointerevents/ios/pointer-events-dispatch-on-stylus.html` asserting `event.pointerType == "pen"`.
Safari/WKWebView share the same engine, so this applies to WKWebView.

Exact version floors, read from MDN browser-compat-data JSON `[verified]`
([`api/PointerEvent.json`](https://github.com/mdn/browser-compat-data/blob/main/api/PointerEvent.json),
[`api/Element.json`](https://github.com/mdn/browser-compat-data/blob/main/api/Element.json)):

| Feature | Chrome / Android WebView | Safari / iOS |
|---|---|---|
| `pointerType` | 55 | 13 |
| `pressure` | 55 | 13 |
| `tiltX`, `tiltY` | 55 | 13 |
| `twist`, `tangentialPressure` | 57 | 13 |
| `altitudeAngle`, `azimuthAngle` | 86 | **18.2** |
| `getCoalescedEvents()` | 58 | **18.2** |
| `getPredictedEvents()` | 77 | **18.2** |
| `pointerrawupdate` | 77 | **not supported** |

Implications: tilt is available broadly; **coalesced and predicted events are iPadOS 18.2+**; there is
no `pointerrawupdate` on iOS, so on iPad you get the standard pointer dispatch rate, not raw digitizer
samples. Whether Safari exposes *real* Apple Pencil pressure (vs a constant 0.5 / force-derived value)
must be confirmed on device → `[UNCERTAIN]`; community reports say it works when the event originates
from Pencil.

### 3.4 Palm rejection

`[reported]` iPadOS performs palm rejection at OS level whenever the Pencil is in use — the app
receives no palm touches and needs no heuristics. `[UNCERTAIN]` in the WebView-specific case; worth
one device test. `UIPencilInteraction` (`preferredTapAction`, `UIPencilPreferredAction`) is the
documented API for the Pencil double-tap action. `[verified]` [UIPencilInteraction](https://developer.apple.com/documentation/uikit/uipencilinteraction).

---

## 4. Android

### 4.1 Stylus handwriting in text fields — **free since Android 14**

`[verified]` [Stylus input in text fields](https://developer.android.com/develop/ui/views/touch-and-input/stylus-input/stylus-input-in-text-fields):

- "Android 14 (API level 34) and higher enable users to write into any text input field in any app
  using a stylus. Android text entry fields, including EditText components and **WebView text
  widgets**, support stylus input by default."
- Relevant APIs (all API 34): `View.setAutoHandwritingEnabled(boolean)`,
  `View.setHandwritingBoundsOffsets(l,t,r,b)` (default handwriting bounds = 40 dp vertical / 10 dp
  horizontal padding around the view), `View.setHandwritingDelegatorCallback(Runnable)` +
  `View.setIsHandwritingDelegate(boolean)` for placeholder→real-field delegation.
  `[verified]` [View reference](https://developer.android.com/reference/android/view/View).
- **Two caveats that matter to us:**
  1. It requires "an input method editor (IME) that supports the Android 14 stylus handwriting APIs"
     — i.e. it is not purely an OS guarantee. Gboard supports it. `[verified]`.
  2. Not supported for password `inputType`. `[verified]`.
  3. The doc names "*EditText components and WebView text widgets*" — i.e. `<input>`/`<textarea>`.
     **`contenteditable` is not mentioned.** `[UNCERTAIN]` → must be tested; if it fails, the fallback
     is a hidden `<textarea>`-based editor surface for pen entry on Android.
- Opting out matters if a text field overlays a drawing surface — "you may need to disable stylus
  handwriting to allow the user to draw. See `setAutoHandwritingEnabled()`." `[verified]`.

### 4.2 `MotionEvent` stylus APIs

`[verified]` [Advanced stylus features](https://developer.android.com/develop/ui/views/touch-and-input/stylus-input/advanced-stylus-features):

- Tool type: `MotionEvent.TOOL_TYPE_STYLUS`, `TOOL_TYPE_ERASER`; read via `event.getToolType(pointerIndex)`.
- Axes via `getAxisValue(int)` / `getAxisValue(axis, pointerIndex)`:
  - `AXIS_X`, `AXIS_Y` — position
  - `AXIS_PRESSURE` (or `getPressure()`) — 0..1, "higher values can be returned depending on the
    screen calibration" → **normalise in your code**
  - `AXIS_ORIENTATION` (or `getOrientation()`) — radians, `0..π` clockwise or `0..-π` counterclockwise
  - `AXIS_TILT` — radians, 0 = perpendicular, `π/2` = flat (unreachable in practice)
  - `AXIS_DISTANCE` — hover distance; "don't rely on precise values"
- Actions: `ACTION_DOWN` / `ACTION_POINTER_DOWN` → `ACTION_MOVE` → `ACTION_UP` / `ACTION_POINTER_UP`;
  `ACTION_CANCEL`. One "motion set" = DOWN…UP for one pointer.
- `View.requestUnbufferedDispatch(int source)` and `requestUnbufferedDispatch(MotionEvent)` exist for
  low-latency dispatch. `[verified]` View reference.
- Historical (batched) samples: the doc warns `MotionEvent`s arrive on every move and to avoid
  allocation in the handler; `getHistorical*` accessors exist in the platform API `[UNCERTAIN]`
  (not enumerated on the fetched page — verify in the `MotionEvent` reference).

### 4.3 Low-latency ink: what is actually public

- **Jetpack low-latency graphics** — `androidx.graphics.lowlatency.GLFrontBufferedRenderer`
  (`androidx.graphics:graphics-core`). Front-buffer rendering (writes directly to screen, no
  multi-buffer swap). `[verified]` [GLFrontBufferedRenderer](https://developer.android.com/reference/kotlin/androidx/graphics/lowlatency/GLFrontBufferedRenderer)
  and the advanced-stylus guide.
- **Motion prediction** — `androidx.input:input-motionprediction:1.0.0`, **stable** (released
  2025-11-19), provides `MotionEventPredictor`. `[verified]`
  [Input release notes](https://developer.android.com/jetpack/androidx/releases/input).
- **Jetpack Ink API (`androidx.ink:*`)** — `[verified]`
  [Ink release notes](https://developer.android.com/jetpack/androidx/releases/ink): **stable 1.0.0**
  (2025-09-23) with `1.1.0-alpha09` in alpha. Modules: `ink-authoring`, `ink-brush`, `ink-geometry`,
  `ink-rendering`, `ink-strokes`, `ink-storage`, `ink-nativeloader`. Notably it "uses Google's Ink
  library as the core" and **"You can use Ink API modules that aren't Android-specific in server-side
  JVM code under Linux for x86_64. This enables high-fidelity server-side rendering, ensuring that
  digital ink looks identical across mobile previews and exported documents like PDFs or PNGs."**
  That is directly interesting for a Trilium server that must render ink client-independently.
- **`android.graphics.ink` (platform, API 34) is not public SDK surface.** `[verified-by-absence]`
  `https://developer.android.com/reference/android/graphics/ink/package-summary` returns **404**.
  Use `androidx.ink`. `[reported]` corroboration: community articles treat Android 14's Ink API as
  not broadly available to third-party apps. Do **not** plan on `android.graphics.ink`.

### 4.4 WebView pointer events

Chrome/Android WebView version floors are the third column of the table in §3.3 `[verified]` (BCD
`webview_android` mirrors `chrome_android` for these features). So in an Android WebView we can expect
`pointerType`, `pressure`, `tiltX`/`tiltY`, `twist` (55/57+), `altitudeAngle`/`azimuthAngle` (86+),
`getCoalescedEvents()` (58+), `getPredictedEvents()` (77+), `pointerrawupdate` (77+).

`[UNCERTAIN]`: whether a *stylus* on a real device actually populates those values through the
Chromium input pipeline into WebView. Chromium's Android stylus handling has historically lagged the
platform APIs. **This is the highest-value thing to measure on Android hardware.** The escape hatch is
§4.6.

### 4.5 Palm rejection on Android — **not free**

`[verified]` [Stylus palm rejection](https://developer.android.com/develop/adaptive-apps/cookbook/stylus-palm-rejection):
"Your app must identify extraneous touch events and ignore them." Concretely:

- `ACTION_CANCEL` is triggered by navigation gestures and by **palm rejection**; the app must find the
  pointer with `getPointerId(getActionIndex())`, drop that stroke, and re-render.
- **`FLAG_CANCELED`** (added **Android 13 / API 33**) marks the pointer-up as unintentional —
  typically a grip or palm touch. Check `(event.flags and FLAG_CANCELED) == FLAG_CANCELED`, then undo
  the last motion set from that pointer's `ACTION_DOWN`.
- "`FLAG_CANCELED` is not set for cancelable events such as palm touches… apps cannot determine
  whether the touch was intended or not on **Android 12 and lower**."
- Practical consequence: you need an **undoable stroke history** regardless, because the remedy for a
  palm touch is always "remove the stroke and re-render".
- Full-screen apps should also use `WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE` to
  stop edge swipes from landing on the canvas. `[verified]`.

### 4.6 Capacitor / WebView escape hatch

The Android shell can intercept pen input before the WebView sees it: override
`Activity.dispatchTouchEvent(MotionEvent)` (or attach an `OnTouchListener` to the `WebView`), read
`getToolType()`, `getPressure()`, `getAxisValue(AXIS_TILT)`, and forward to JS via
`WebView.evaluateJavascript(...)` or a `@JavascriptInterface` bridge (`addJavascriptInterface`).
`[verified]` that `evaluateJavascript` and `addJavascriptInterface` are the official mechanisms
([WebView reference](https://developer.android.com/reference/android/webkit/WebView),
[addJavascriptInterface](https://developer.android.com/reference/android/webkit/WebView#addJavascriptInterface(java.lang.Object,%20java.lang.String)));
`[reported]` as a Capacitor plugin pattern — there is no well-known off-the-shelf Capacitor stylus/ink
plugin, so this would be our own small plugin. `[UNCERTAIN]`: returning the intercepted events to the
WebView for normal hit-testing after inspection requires care (typically forward non-pen events to
`super.dispatchTouchEvent` and consume pen events).

---

## 5. Cross-platform summary

| Capability | HarmonyOS | iPadOS | Android |
|---|---|---|---|
| Handwriting→text in WebView | ❌ (textarea/contenteditable) `[reported]` | ✅ free `[verified]` | ✅ API 34+, `<input>`/`<textarea>` `[verified]`; contenteditable `[UNCERTAIN]` |
| Handwriting→text, native | ✅ system 全局手写 in TextInput/TextArea; ❌ no stroke→text API `[reported]` | ✅ Scribble in native text views | ✅ EditText default `[verified]` |
| Stroke→text API for 3rd parties | ❌ `[reported]` | ❌ (Scribble is IME-like) | ❌ (IME-delegated) `[verified]` |
| `pointerType === "pen"` in WebView | `[UNCERTAIN]` | ✅ `[verified]` (WebKit source) | Chrome 55+ `[verified]` (BCD); device `[UNCERTAIN]` |
| Pressure / tilt via Pointer Events | ArkUI yes `[verified]`; ArkWeb `[UNCERTAIN]` | ✅ 13+ `[verified]` | ✅ 55/57+ `[verified]` |
| Coalesced / predicted events | `[UNCERTAIN]` | 18.2+ / 18.2+ `[verified]` | 58+ / 77+ `[verified]` |
| Low-latency front buffer | Pen Kit / StylusFrameBoost (ArkUI only) `[verified]` | PencilKit (native only) | `GLFrontBufferedRenderer` (native only) `[verified]` |
| Palm rejection | no app-level API (`setHandwritingFlag` = System API) `[verified]`; finger-cancel on stylus `[verified]` | OS-level, free `[reported]` | app-implemented; `FLAG_CANCELED` 13+ `[verified]` |
| Ink storage format we control | ❌ Pen Kit format opaque | ✅ ours (PencilKit optional) | ✅ ours, or `androidx.ink` `ink-storage` |
| Pen-body gestures | `stylusInteraction` squeeze/doubleTap `[verified]` | `UIPencilInteraction` `[verified]` | usually none (button → `BUTTON_STYLUS_PRIMARY`) `[UNCERTAIN]` |

---

## 6. Recommendation for our architecture

**The lowest-risk path is: delegate handwriting-to-text to the system IME, and build exactly one
platform-agnostic canvas ink layer in the web core.** Do not adopt PencilKit, Pen Kit, or
`androidx.ink` as *storage*. Optionally adopt them later as *render accelerators* behind our own
stroke model.

### 6.1 Handwriting-to-text

- **iPadOS**: zero code. Ensure the editor uses real `<textarea>`/`contenteditable` with a sane size,
  no autoscroll-while-writing, no autocomplete during strokes (HIG rules, §3.1). Optionally add
  `UIScribbleInteraction` / `UIIndirectScribbleInteraction` for a "write anywhere in the note body"
  affordance.
- **Android 14+**: zero code for `<textarea>` flows. Test `contenteditable`. If it fails, keep a
  hidden `<textarea>` "pen entry" surface that commits into the rich editor.
- **HarmonyOS**: **cannot be done in ArkWeb.** Provide a small native ArkTS **手写输入 field**: a
  `TextInput`/`TextArea` presented by the shell (where 全局手写 / 小艺输入法 work) or a Pen Kit
  suite page, whose `onChange` / `onSubmit` result is pushed back into the web editor through
  `runJavaScript`/`registerJavaScriptProxy`. This is the *only* mandatory native code for feature (a).

### 6.2 Ink (annotations + sketches)

One implementation in the web core:

- **Capture**: Pointer Events; gate drawing on `pointerType === "pen"` with a finger fallback
  (many users have no pen); `touch-action: none` on the canvas; use `getCoalescedEvents()` where
  available (58+/18.2+) and `getPredictedEvents()` where available (77+/18.2+) purely for smoothing.
- **Stroke model** (JSON, one array per note):
  ```
  { v: 1, canvas: {w, h, dpr},
    strokes: [ { id, tool: "pen"|"highlighter"|"eraser",
                 color: "#rrggbb", width, seed,
                 pts: [[x, y, pressure, tiltX, tiltY, t], ...] } ] }
  ```
  Points are normalized to `[0,1]` in canvas space so the note survives resizes and DPI changes.
- **Rendering**: `canvas 2d` with variable-width quads from pressure; one canvas layer per ink block.
- **Undo**: a stroke stack (also the mechanism Android's palm-rejection `ACTION_CANCEL` needs — §4.5).
- **Search story**: ink is invisible to FTS until recognised. Store (i) a rendered PNG/thumbnail and
  (ii) an optional text proxy (typed caption, or OCR/recognition output) as note content.

### 6.3 Mapping onto Trilium

- Trilium text notes are HTML. Add an **ink block** to the HTML:
  `<div class="trilium-ink" data-ink-id="K1">…canvas…</div>`, and store the stroke JSON as a Trilium
  **attachment** on the note (`ink-K1.json`). The HTML note stays the source of truth for text; ink
  rides along as an attachment and is re-hydrated on open. This survives sync, export, and revision
  history without inventing a new note type.
- For (c) freeform sketch notes, the same JSON is the whole note body — either a text note containing
  only the ink block, or (better long-term) a dedicated note type per Trilium's existing `canvas`
  note-type precedent.
- **Excalidraw alignment.** Trilium already has an Excalidraw integration; Excalidraw elements are
  JSON with an identical "free draw" element shape (`points`, `pressures`, `simulatePressure`). Two
  options: (i) store ink blocks as Excalidraw-compatible element JSON to reuse its renderer/editor,
  or (ii) keep our own lean stroke JSON and only *render* into Excalidraw when the user converts an
  annotation into a canvas note. Recommend (ii) for v1: Excalidraw's element model carries much more
  than we need, and its `pressures` array has known fidelity gaps for tilt.
- Ink strokes should be **stored per-note as an attachment, never inline base64 in the HTML** — inline
  blobs bloat sync payloads and wreck text diffs.

### 6.4 Per-platform native minimum (ranked by cost)

| Platform | Mandatory native work | Optional later |
|---|---|---|
| iPadOS | none | PencilKit overlay for pro ink; `UIScribbleInteraction`s |
| Android | palm-rejection bridge (intercept `dispatchTouchEvent`, read `FLAG_CANCELED`/`ACTION_CANCEL`/`TOOL_TYPE_STYLUS`, forward to JS) | `GLFrontBufferedRenderer`, `input-motionprediction`, `androidx.ink` rendering |
| HarmonyOS | handwriting-input field (TextInput/TextArea or Pen Kit suite) + JS bridge; palm-rejection heuristic | Pen Kit `HandwriteComponent` for OS-grade ink; `stylusInteraction` squeeze→tool palette; `StylusFrameBoost` |

---

## 7. Impossible or painful inside a WebView (forces native)

1. **HarmonyOS handwriting-to-text in ArkWeb.** System 全局手写 reportedly does not fire in
   `textarea`/`contenteditable`; there is no stroke→text API at all. → native ArkTS entry field. `[reported]`
2. **HarmonyOS Pen Kit.** `HandwriteComponent` is ArkUI-only; its persistence format is opaque; no
   recognition. → native only, and an all-or-nothing bet.
3. **HarmonyOS palm rejection.** The OS primitive (`setHandwritingFlag`) is a System API. We get only
   the implicit "finger touches get `Cancel` while a stylus is active" behaviour, plus our own
   heuristics. `[verified]`
4. **HarmonyOS low-latency rendering.** 报点预测 / `StylusFrameBoost` are ArkUI-side; nothing suggests
   ArkWeb can use them. `[UNCERTAIN]`
5. **iOS PencilKit.** `PKCanvasView` + `PKToolPicker` cannot render inside web content; overlay or
   export/import only. `[UNCERTAIN]` on overlay details, `[verified]` that it is native.
6. **iOS `pointerrawupdate`.** Not supported in Safari/WKWebView → fewer raw samples. `[verified]`
7. **iOS coalesced/predicted events.** Only iPadOS **18.2+**. Older devices get jagged fast strokes.
   `[verified]`
8. **Android palm rejection.** Must be implemented; below API 33 you cannot even tell an intentional
   from a palm touch. `[verified]`
9. **Android WebView stylus fidelity.** Whether Chromium populates pen pressure/tilt for WebView is
   unproven; the shell interception bridge is the guaranteed path. `[UNCERTAIN]`
10. **System-level gesture conflicts.** Android edge-swipe navigation and iOS scribble/undo gestures
    can steal strokes from a canvas; both need native configuration (Android insets behaviour;
    iOS gesture recogniser priorities).

---

## 8. Minimum viable implementation

The smallest set of work that delivers a genuinely useful stylus experience on Pad.
Ordered; each step is independently shippable.

1. **Verify the two unknowns on real hardware first** (1 day). On an M-Pencil HarmonyOS Pad: does
   ArkWeb deliver `pointerdown` with `pointerType === "pen"`, non-trivial `pressure`, and
   `getCoalescedEvents`? Does a finger touch get `Cancel` while the pen is down? On Android: does a
   `contenteditable` accept Android 14 stylus handwriting, and does the WebView report pen pressure?
   *Everything below depends on these answers.*
2. **Web-core ink canvas** (the bulk of the value). Pointer Events capture, `touch-action: none`,
   pen-gated with finger fallback, pressure→width, coalesced events when present, `pointerType`-aware
   tool switching (pen = ink, finger = scroll/select). One component.
3. **Stroke persistence as a Trilium attachment.** JSON stroke model (§6.2), saved as
   `ink-<id>.json` on the note; rendered on open; PNG export for thumbnails/preview. No new note type.
4. **System handwriting-to-text for free on iOS + Android.** Use `<textarea>`/`contenteditable` per
   §6.1; write down the HIG-driven editor rules (no autoscroll while writing, no autocomplete
   mid-stroke, generous field size).
5. **Android palm-rejection bridge** (~100 lines Kotlin in a Capacitor plugin): intercept
   `dispatchTouchEvent`, detect `TOOL_TYPE_STYLUS` to set a "pen active" flag, map
   `ACTION_CANCEL` / `FLAG_CANCELED` to a JS `cancelStroke(pointerId)`, forward everything else to the
   WebView. Reuses the undo stack from step 2.
6. **HarmonyOS handwriting-input field** (the only mandatory ArkTS work): a native `TextInput`/
   `TextArea` entry surface launched from the web editor's toolbar, pushing recognised text back via
   the JS bridge. This closes the HarmonyOS gap in feature (a) without touching Pen Kit.
7. **Palm-rejection heuristic in the shared web core** (fallback everywhere): during an active pen
   stroke, ignore any pointer whose `pointerType === "touch"` and whose `width`/`height` (contact
   ellipse) exceeds a threshold; discard strokes that begin while a pen stroke is live.

**Deliberately deferred:** Pen Kit `HandwriteComponent` integration, PencilKit overlay,
`GLFrontBufferedRenderer` / `input-motionprediction` / `androidx.ink`, server-side ink rendering,
stroke→text recognition engines, and pen-body gesture shortcuts (squeeze/double-tap → tool palette).
Each is an upgrade behind the same stroke model, not a prerequisite.

**Open question to put back to the owner:** is "stylus handwriting input editing" required to mean
*(a) write-and-convert-to-text*, or *(b) annotate/sketch with ink*? If (b) only, HarmonyOS becomes
almost as cheap as the other two platforms and step 6 can be dropped from v1. If (a) is required on
HarmonyOS at parity with iPad, that is a materially larger native investment and possibly not fully
achievable today.

---

## 9. Sources, and what could not be fetched

**Fetched successfully (primary unless noted).**
- Apple: [HIG — Apple Pencil and Scribble](https://developer.apple.com/design/human-interface-guidelines/apple-pencil-and-scribble),
  [UIScribbleInteraction](https://developer.apple.com/documentation/uikit/uiscribbleinteraction),
  [UIIndirectScribbleInteraction](https://developer.apple.com/documentation/uikit/uiindirectscribbleinteraction-1nfjm),
  [UIPencilInteraction](https://developer.apple.com/documentation/uikit/uipencilinteraction)
- WebKit: [commit 7f23d03 "Produce 'pen' Pointer Events if using a stylus"](https://github.com/WebKit/WebKit/commit/7f23d038821327941799bcffb3b20a0c7d8bd9d3)
- MDN browser-compat-data: [PointerEvent.json](https://github.com/mdn/browser-compat-data/blob/main/api/PointerEvent.json), [Element.json](https://github.com/mdn/browser-compat-data/blob/main/api/Element.json)
- W3C: [Pointer Events Level 3](https://www.w3.org/TR/pointerevents3/) (`pointerType` table), [Pointer Events 4 WD](https://www.w3.org/TR/2025/WD-pointerevents4-20251015/)
- Android: [Stylus input in text fields](https://developer.android.com/develop/ui/views/touch-and-input/stylus-input/stylus-input-in-text-fields),
  [Advanced stylus features](https://developer.android.com/develop/ui/views/touch-and-input/stylus-input/advanced-stylus-features),
  [Stylus palm rejection](https://developer.android.com/develop/adaptive-apps/cookbook/stylus-palm-rejection),
  [View reference](https://developer.android.com/reference/android/view/View),
  [Ink (Jetpack) release notes](https://developer.android.com/jetpack/androidx/releases/ink),
  [Input (Jetpack) release notes](https://developer.android.com/jetpack/androidx/releases/input),
  [GLFrontBufferedRenderer](https://developer.android.com/reference/kotlin/androidx/graphics/lowlatency/GLFrontBufferedRenderer)
- HarmonyOS/Pen Kit: [Pen Kit 简介](https://developer.huawei.com/consumer/cn/doc/doccenter-capabilities/pen-introduction),
  [接入手写套件](https://developer.huawei.com/consumer/cn/doc/doccenter-capabilities/pen-suite),
  [HandwriteController](https://developer.huawei.com/consumer/cn/doc/doccenter-references/api/pen-handwritecontroller),
  [HandwriteComponent](https://developer.huawei.com/consumer/cn/doc/doccenter-references/api/pen-handwritecomponent),
  [stylusInteraction](https://developer.huawei.com/consumer/cn/doc/doccenter-references/api/pen-stylusinteraction),
  [StylusFrameBoost](https://developer.huawei.com/consumer/cn/doc/doccenter-references/api/pen-stylusframeboost),
  [华为平板全局手写无法使用](https://consumer.huawei.com/cn/support/content/zh-cn15822601/)
- OpenHarmony (grepped from a local sparse clone of `github.com/openharmony/docs`, `master`):
  `arkui-ts/ts-gesture-settings.md` (SourceTool), `arkui-ts/ts-universal-events-touch.md` (pressure,
  getHistoricalPoints), `arkui-ts/ts-universal-events-hover.md` (pen hover),
  `arkui-ts/ts-gesture-customize-judge.md` (tiltX/tiltY/rollAngle),
  `arkui-ts/ts-appendix-enums.md` (ResponseRegionSupportedTool.PEN, Cancel semantics),
  `js-apis-window-sys.md` (`setHandwritingFlag`, System API),
  `capi-ui-input-event-h.md` (NDK tool type / tilt / roll),
  [`web-gesture.md`](https://gitee.com/openharmony/docs/blob/master/en/application-dev/web/web-gesture.md)

**Could not be fetched as raw pages (JS-rendered; content obtained via a rendering proxy or not at
all) — treat any claim resting solely on these as one step removed:**
- All `developer.huawei.com` doc-center pages and forum threads. The forum thread
  `0210157907485611572` ("全局手写功能在HTML里的textarea和可编辑div标签上无法触发") returned only page
  chrome; its text was recovered from the [itying mirror](http://bbs.itying.com/topic/67057700bb648a00d098581f)
  and is therefore `[reported]`, not `[verified]`.
- [Rockchip/Huawei forum on browser input stylus](https://developer.huawei.com/consumer/cn/forum/topic/0202172489107476174)
  (body extracted; official reply was only "file a ticket").
- No official Huawei page stating whether **ArkWeb** delivers `pointerType === "pen"` was found at
  all. That gap is the top device-verification item.
