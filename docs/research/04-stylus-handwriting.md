# 04 — Stylus / handwriting input on Pad: HarmonyOS (鸿蒙), iPadOS, Android

Research date: **2026-10-04** (Asia/Shanghai). Author: research subagent.
Scope: offline-first Trilium Notes client. Phone = capture + search + read. **Pad = that plus keyboard
editing and "手写笔输入编辑" (stylus handwriting input editing)**. UI plan: web core (HTML/CSS/JS) in a
WebView (ArkWeb / WKWebView / Android WebView) wrapped by a thin native shell (hand-written ArkTS;
Capacitor for Android/iOS).

> **Confidence.** `[verified]` = primary source fetched and read (official docs, source code, MDN
> browser-compat-data JSON). `[reported]` = credible secondary (vendor forum, community). `[UNCERTAIN]`
> = not confirmable from a primary source; test on a device.
>
> **Fetch caveat.** `developer.huawei.com` doc-center is an Angular SPA that returns only `<app-root>`
> to a plain fetch. Huawei content below was read through a JS-rendering text proxy — canonical URLs
> cited, text `[verified]` against the rendered page, but one step removed from a raw fetch. Anything
> not rendered at all is `[reported]`/`[UNCERTAIN]` and listed in §9.

---

## 1. "手写笔输入编辑" (stylus handwriting input editing) is three different products

### (a) Handwriting-to-text (笔迹转文字 / Scribble)
System IME converts pen strokes to typed characters in the focused field. **We write no code.** The only
question is whether the system routes it into a WebView text field — and the answer differs per platform,
which is the single most important finding here (it inverts the assumption that the priority platform is
the most capable one):

| Platform | Free in a WebView? | Evidence |
|---|---|---|
| iPadOS | **Yes** | `[verified]` "Scribble works in all standard text components — text fields, text views, search fields, and **editable fields in web content** — except password fields" — [Apple HIG](https://developer.apple.com/design/human-interface-guidelines/apple-pencil-and-scribble) |
| Android 14+ (API 34) | **Yes** | `[verified]` "Android text entry fields, including EditText components and **WebView text widgets**, support stylus input by default" — [Stylus input in text fields](https://developer.android.com/develop/ui/views/touch-and-input/stylus-input/stylus-input-in-text-fields) |
| HarmonyOS / ArkWeb | **No** | `[reported]` 全局手写 (Global Handwriting) fires in ArkWeb `<input>` but **not** `<textarea>`/`contenteditable` — [Huawei forum](https://developer.huawei.com/consumer/cn/forum/topic/0210157907485611572) (mirror: [bbs.itying.com](http://bbs.itying.com/topic/67057700bb648a00d098581f)); a second thread reports web `input`/`textarea` rejecting stylus writes entirely — [Huawei forum](https://developer.huawei.com/consumer/cn/forum/topic/0202172489107476174) |

### (b) Ink annotation / freehand markup
Strokes on a canvas layer over or behind note content. Requires stroke capture, a stroke model, a
renderer, a persistence format, undo history. **All platform-agnostic → lives in the web core.** Only two
parts are genuinely native: **low-latency rendering** (HarmonyOS 报点预测 (point prediction) / `StylusFrameBoost`, Android
`GLFrontBufferedRenderer`+`input-motionprediction`, iOS PencilKit prediction) and **palm rejection**
(free on iPadOS, app-implemented on Android, no app-level primitive on HarmonyOS).

### (c) Freeform sketch notes as a first-class note type
Same machinery as (b) plus a note type, a thumbnail, and a **search story** — ink is invisible to full-text search until recognised or given a text proxy.

**What is reusable across all three vs what must be native:**

| Reusable in the web core | Must be native per platform |
|---|---|
| Stroke capture (Pointer Events), stroke model + JSON persistence, renderer, undo history, note-type/storage integration | Handwriting→text (system IME; free on iOS + Android 14+, **not** ArkWeb) · low-latency front buffer (Pen Kit / `GLFrontBufferedRenderer` / PencilKit) · best palm-rejection signal · pen-body gestures (`stylusInteraction`, `UIPencilInteraction`) |
| Pressure / tilt via Pointer Events (version floors differ) | The OS supplies the raw data |

**Verdict: build (b)+(c) once in the web core; get (a) free on 2 of 3 platforms and treat HarmonyOS as the exception needing a native escape hatch.**

---

## 2. HarmonyOS (priority platform)

### 2.1 Pen Kit（手写笔服务） — an HMS kit, not open OpenHarmony
`@kit.Penkit`; `SystemCapability.Stylus.Handwrite` / `SystemCapability.Stylus.StylusService`.
`[verified]` [Pen Kit 简介](https://developer.huawei.com/consumer/cn/doc/doccenter-capabilities/pen-introduction).
Five capabilities:
1. **手写套件 (handwriting suite)** — ArkUI component `HandwriteComponent` + `HandwriteController`.
2. **报点预测** — predicts points ahead of the nib (跟手性, "pen tracking"); on by default in the suite, separately integrable.
3. **一笔成形 (instant shape)** — `InstantShapeGenerator`; a held stroke snaps to a clean shape.
4. **全局取色** — global colour picker.
5. **手写交互** — `stylusInteraction.on('squeeze')` / `on('doubleTap')`, API 5.1.1(19)+ `[verified]`
   [stylusInteraction](https://developer.huawei.com/consumer/cn/doc/doccenter-references/api/pen-stylusinteraction).
Plus `StylusFrameBoost`（跟手性加速, "pen-tracking acceleration"）`[verified]` [StylusFrameBoost](https://developer.huawei.com/consumer/cn/doc/doccenter-references/api/pen-stylusframeboost).

### 2.2 `HandwriteComponent` / `HandwriteController` — the catch
`[verified]` [HandwriteController](https://developer.huawei.com/consumer/cn/doc/doccenter-references/api/pen-handwritecontroller),
[HandwriteComponent](https://developer.huawei.com/consumer/cn/doc/doccenter-references/api/pen-handwritecomponent),
[接入手写套件](https://developer.huawei.com/consumer/cn/doc/doccenter-capabilities/pen-suite):
- **ArkUI component — a WebView cannot host it.** Canvas + toolbar: 7 brushes (ballpoint/pen/pencil/
  marker/highlighter/mosaic/laser), 5 widths, 100+ colours, stroke/pixel/highlighter-only erasers, clear,
  shapes, lasso, and (API 26.0.0) a ring toolbar opened by squeezing the pen body. **Vertical scroll only.**
- API: `load(path)`, `save(path): Promise<void>`, `onLoad(cb)`, `getContentRange(): Rect` (API 6.0.0/20),
  `getThumbnail(rect): Promise<PixelMap>` (20), `scrollTo(yOffset)` (6.1.0/23).
- **Persistence is an opaque proprietary note file** — `load(path)` creates a new note file if absent.
  No documented format, no stroke export. `getThumbnail()` is the only documented bridge back to data we
  can own. `[verified]` for the behaviour, format `[UNCERTAIN]`.
- **No recognition API** (§2.5).

### 2.3 ArkUI stylus event APIs (the native, non-WebView path)
`[verified]` from OpenHarmony docs (`github.com/openharmony/docs`, grepped from a local sparse clone):
- `SourceTool.Pen = 2` — input-tool enum on touch/gesture events, **API 9+**, atomic-service API 11+
  (`ts-gesture-settings.md`). `ResponseRegionSupportedTool.PEN` (API 22) restricts a touch target's hit
  region to pen only — a crude palm-rejection primitive (`ts-appendix-enums.md`).
- `TouchEvent.pressure` **API 15+**, `[0, 65535)`; `HistoricalPoint.force`; `getHistoricalPoints()` API 10+
  (`ts-universal-events-touch.md`). Gesture events carry `pressure` (0–1), `tiltX`, `tiltY`, `rollAngle`
  (API 17+) (`ts-gesture-customize-judge.md`).
- **Hover** fires for a pen held above the screen; examples test `sourceTool == SourceTool.Pen`. Doc
  caveat: "some styli do not support hover events, depending on hardware capability"
  (`ts-universal-events-hover.md`).
- NDK: `OH_ArkUI_UIInputEvent_GetToolType()`, `UI_INPUT_EVENT_TOOL_TYPE_PEN = 2`,
  `OH_ArkUI_PointerEvent_GetTiltX/GetTiltY/GetRollAngle()` (`capi-ui-input-event-h.md`).
- **Palm rejection has no app-level API.** `window.setHandwritingFlag(enable)` — "the window responds to
  stylus events but not touch events" — is a **System API** (`js-apis-window-sys.md`). That is Huawei's own
  mechanism; we cannot call it. `[verified]`
- **One freebie:** ArkUI cancels finger touches while a stylus is active — `Cancel` fires when
  "手指触摸过程中存在手写笔操作" ("a stylus operation happens during a finger touch") (`ts-appendix-enums.md`). `[verified]` — **test this first**, it may cover
  most palm rejection for free.

### 2.4 Does ArkWeb receive stylus events?
- ArkWeb is Chromium-based. The only relevant doc statement: "ArkWeb receives the ArkUI touch event and
  identifies the gesture… ArkWeb gestures comply with the touch events, UI events, and **pointer events
  defined by the W3C standard**." `[verified]` [web-gesture.md](https://gitee.com/openharmony/docs/blob/master/en/application-dev/web/web-gesture.md)
- **No HarmonyOS/OpenHarmony document was found that guarantees `pointerType === "pen"`,
  `getCoalescedEvents`, `getPredictedEvents`, or palm rejection inside ArkWeb.** ArkUI does carry
  `SourceTool.Pen` and Chromium maps stylus tool types to `pointerType: "pen"`, so it is plausible and
  likely — but **unproven** → `[UNCERTAIN]`. **Measure on a device before committing to an architecture.**
- No ArkWeb API for palm rejection, point prediction, or front-buffer rendering was found → assume not
  exposed `[UNCERTAIN]`.
- Escape hatch is well-trodden: `registerJavaScriptProxy` / `javaScriptProxy` + `runJavaScript`.
  `[reported]` (several Huawei forum threads on `registerJavaScriptProxy` timing bugs — a known rough edge).

### 2.5 Does HarmonyOS expose handwriting **recognition** to third parties? **No — IME/system-UI only.**
`[reported]` A Huawei forum technical thread (2026-03-24) surveys every option and concludes Pen Kit "并没有暴露出'轨迹转文本'的接口" ("does not expose a trajectory-to-text interface"). Its four evaluated approaches:
1. **Canvas snapshot → Core Vision Kit `textRecognition` (image OCR).** Pure visual OCR: wastes the pen's X/Y/Time/Pressure data, needs a cross-thread screenshot, too slow for "write and see text", fails on non-print handwriting.
2. **Third-party C++ trajectory engines** (Zinnia, $P, LipiTk) over NAPI — offline, but CPU-only (no NPU), CJK-biased models, adds HAP size.
3. **Pen Kit** — no such interface.
4. **System 全局手写 + a `TextArea`** — fast recognition, but **it consumes the ink**: once text is committed the handwriting is gone, so you cannot keep a stroke layer *and* extract text.

Huawei's official reply was a non-answer asking for business justification — `[verified]` that thread and reply exist, `[reported]` for the conclusions. [Forum thread](https://developer.huawei.com/consumer/cn/forum/topic/0207209760463484658). The nearest *supported* recognition is **Core Vision Kit 通用文字识别 (general text recognition, `textRecognition`)** — image OCR `[reported]` ([walkthrough](https://developer.huawei.com/consumer/cn/forum/topic/0204223551822397082)); a complaint thread exists on low accuracy. 全局手写 itself requires HarmonyOS 2+ and a supported M-Pencil generation `[verified]` ([support page](https://consumer.huawei.com/cn/support/content/zh-cn15822601/)).

**Consequence: on HarmonyOS, "write with the pen and get text" inside our WebView is not achievable today via an official API.** Options: a native ArkTS handwriting field, post-hoc OCR, or our own recogniser.

---

## 3. iPadOS

### 3.1 Scribble in `WKWebView` — works, free
`[verified]` HIG: Scribble "available to all apps by default", works in editable fields in web content,
and "Scribble only supports Apple Pencil input" (no finger).
- Programmatic control: [`UIScribbleInteraction`](https://developer.apple.com/documentation/uikit/uiscribbleinteraction)
  (custom text fields) and [`UIIndirectScribbleInteraction`](https://developer.apple.com/documentation/uikit/uiindirectscribbleinteraction-1nfjm)
  (non-text-field areas — the HIG's "write in blank space" pattern). `isHandwritingEnabled` is the disable
  switch. `[UNCERTAIN]`: whether an interaction on the native container can enable/disable Scribble *inside*
  the WKWebView's own content — treat the web content as a separate responder graph and assume you can only
  disable Pencil input on the whole `WKWebView`.
- **Cheap, high-impact editor rules from the HIG** `[verified]`: no autoscroll while writing; never
  move/resize the field mid-stroke; no autocomplete during writing; hide placeholder text the moment writing
  starts; fields must be large enough to write in.

### 3.2 PencilKit inside a `WKWebView` — **no; ink requires native**
`PKCanvasView` / `PKDrawing` / `PKToolPicker` are native UIView objects; there is no supported way to render
`PKDrawing` ink inside web content `[UNCERTAIN]` (absence of any Apple API). Working patterns:
- **Overlay** a `PKCanvasView` above the `WKWebView`, arbitrating with `isUserInteractionEnabled`.
  `[reported]` — [SO: Overlaying PKCanvasView on top of WKWebView](https://stackoverflow.com/questions/66251895).
- **Export/import only** — ink on your own HTML canvas; use PencilKit purely as a converter
  (`PKDrawing.image(from:scale:)` in, `PKDrawing(data:)` out). Keeps the web model as source of truth.
- `PKToolPicker` needs a native responder to observe; it is a floating panel so it can visually coexist,
  but it will not drive a web canvas. `[UNCERTAIN]` for coexistence specifics.
- Apple Pencil senses "tilt (altitude), force (pressure), orientation (azimuth), and barrel roll" `[verified]` HIG.

### 3.3 Pointer Events for Apple Pencil
`[verified]` **`pointerType === "pen"` is real.** WebKit commit
["Produce "pen" Pointer Events if using a stylus (e.g. Apple Pencil)"](https://github.com/WebKit/WebKit/commit/7f23d038821327941799bcffb3b20a0c7d8bd9d3)
maps `TouchType::Stylus` → `"pen"_s` and adds WPT test `pointerevents/ios/pointer-events-dispatch-on-stylus.html`
asserting `event.pointerType == "pen"`. WKWebView shares the engine.

Version floors, read from MDN BCD JSON `[verified]` ([`api/PointerEvent.json`](https://github.com/mdn/browser-compat-data/blob/main/api/PointerEvent.json), [`api/Element.json`](https://github.com/mdn/browser-compat-data/blob/main/api/Element.json)):

| Feature | Chrome / Android WebView | Safari / iOS |
|---|---|---|
| `pointerType`, `pressure`, `tiltX`, `tiltY` | 55 | 13 |
| `twist`, `tangentialPressure` | 57 | 13 |
| `altitudeAngle`, `azimuthAngle` | 86 | **18.2** |
| `getCoalescedEvents()` | 58 | **18.2** |
| `getPredictedEvents()` | 77 | **18.2** |
| `pointerrawupdate` | 77 | **not supported** |

→ tilt is broadly available; **coalesced/predicted events need iPadOS 18.2+**; no `pointerrawupdate` on iOS (standard dispatch rate, not raw digitizer samples). Whether Safari exposes *real* Pencil pressure vs a constant/force-derived value must be confirmed on device → `[UNCERTAIN]`.

### 3.4 Palm rejection
`[reported]` iPadOS rejects the palm at OS level whenever Pencil is in use; apps get no palm touches and need no heuristics. `[UNCERTAIN]` specifically inside the WebView — one device test. `UIPencilInteraction` (`preferredTapAction`, `UIPencilPreferredAction`) is the documented double-tap API `[verified]` ([UIPencilInteraction](https://developer.apple.com/documentation/uikit/uipencilinteraction)).

---

## 4. Android

### 4.1 Stylus handwriting in text fields — free since API 34
`[verified]` [Stylus input in text fields](https://developer.android.com/develop/ui/views/touch-and-input/stylus-input/stylus-input-in-text-fields):
- API 34+ lets users "write into any text input field in any app"; "Android text entry fields, including
  EditText components and **WebView text widgets**, support stylus input by default."
- APIs (all 34): `View.setAutoHandwritingEnabled(boolean)`, `setHandwritingBoundsOffsets(l,t,r,b)`
  (default bounds = 40 dp vertical / 10 dp horizontal padding), `setHandwritingDelegatorCallback(Runnable)`
  + `setIsHandwritingDelegate(boolean)` for placeholder→field delegation `[verified]`
  [View reference](https://developer.android.com/reference/android/view/View).
- **Three caveats:** (i) needs "an IME that supports the Android 14 stylus handwriting APIs" — not a pure
  OS guarantee (Gboard does); (ii) unsupported for password `inputType`; (iii) the doc names
  "*EditText components and WebView text widgets*" — i.e. `<input>`/`<textarea>`. **`contenteditable` is
  not mentioned** → `[UNCERTAIN]`, test it; fallback is a hidden `<textarea>` pen-entry surface.
- Opt out via `setAutoHandwritingEnabled(false)` when a text field overlays a drawing surface `[verified]`.

### 4.2 `MotionEvent` stylus APIs
`[verified]` [Advanced stylus features](https://developer.android.com/develop/ui/views/touch-and-input/stylus-input/advanced-stylus-features):
- `getToolType(i)` → `TOOL_TYPE_STYLUS`, `TOOL_TYPE_ERASER`.
- Axes via `getAxisValue(int)`: `AXIS_X`/`AXIS_Y`; `AXIS_PRESSURE` (or `getPressure()`) 0..1 but "higher
  values can be returned depending on screen calibration" → **normalise**; `AXIS_ORIENTATION` (radians,
  0..π cw / 0..−π ccw); `AXIS_TILT` (radians, 0 = perpendicular, π/2 = flat, unreachable); `AXIS_DISTANCE`
  (hover; "don't rely on precise values").
- `ACTION_DOWN`/`ACTION_POINTER_DOWN` → `ACTION_MOVE` → `ACTION_UP`/`ACTION_POINTER_UP`; `ACTION_CANCEL`.
  One "motion set" = DOWN…UP per pointer. Avoid heap allocation / lambdas in the handler — events fire on
  every move.
- `View.requestUnbufferedDispatch(int source)` and `requestUnbufferedDispatch(MotionEvent)` exist for
  low-latency dispatch `[verified]`. `getHistorical*` accessors exist in the platform API `[UNCERTAIN]`
  (not enumerated on the fetched page).

### 4.3 Low-latency ink — what is actually public
- **Jetpack low-latency graphics** — `androidx.graphics.lowlatency.GLFrontBufferedRenderer`
  (`androidx.graphics:graphics-core`); front-buffer rendering, no multi-buffer swap. `[verified]`
  [GLFrontBufferedRenderer](https://developer.android.com/reference/kotlin/androidx/graphics/lowlatency/GLFrontBufferedRenderer).
- **Motion prediction** — `androidx.input:input-motionprediction:1.0.0`, **stable** (2025-11-19),
  `MotionEventPredictor`. `[verified]` [Input release notes](https://developer.android.com/jetpack/androidx/releases/input).
- **Jetpack Ink (`androidx.ink:*`)** — **stable 1.0.0** (2025-09-23), `1.1.0-alpha09` in alpha; modules
  `ink-authoring`, `ink-brush`, `ink-geometry`, `ink-rendering`, `ink-strokes`, `ink-storage`,
  `ink-nativeloader`. Notably: Android-independent modules run "in server-side JVM code under Linux for
  x86_64 … enabling high-fidelity server-side rendering, ensuring that digital ink looks identical across
  mobile previews and exported documents like PDFs or PNGs." `[verified]`
  [Ink release notes](https://developer.android.com/jetpack/androidx/releases/ink) — directly relevant to a
  Trilium server that must render ink client-independently.
- **`android.graphics.ink` (platform, API 34) is not public SDK surface.**
  `[verified-by-absence]` `https://developer.android.com/reference/android/graphics/ink/package-summary`
  returns **404**. Use `androidx.ink`. Do not plan on `android.graphics.ink`.

### 4.4 WebView pointer events
Version floors are the middle column of the §3.3 table `[verified]` (BCD `webview_android` mirrors
`chrome_android`). `[UNCERTAIN]`: whether a *stylus* on real hardware actually populates those values
through Chromium's input pipeline into WebView — Chromium's Android stylus handling has historically lagged
the platform APIs. **Highest-value thing to measure on Android hardware.** Escape hatch in §4.6.

### 4.5 Palm rejection on Android — not free
`[verified]` [Stylus palm rejection](https://developer.android.com/develop/adaptive-apps/cookbook/stylus-palm-rejection):
"Your app must identify extraneous touch events and ignore them."
- `ACTION_CANCEL` fires on navigation gestures and on palm rejection; find the pointer with
  `getPointerId(getActionIndex())`, drop that stroke, re-render.
- **`FLAG_CANCELED`** (added **API 33**) marks a pointer-up as unintentional (grip/palm). Test
  `(event.flags and FLAG_CANCELED) == FLAG_CANCELED`, then undo the last motion set from that pointer's
  `ACTION_DOWN`. "…apps cannot determine whether the touch was intended or not on **Android 12 and lower**."
- You therefore need an **undoable stroke history** regardless — the remedy for a palm touch is always
  "remove the stroke and re-render".
- Full-screen apps should set `WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE` so edge swipes
  don't land on the canvas `[verified]`.

### 4.6 Capacitor / WebView escape hatch
Override `Activity.dispatchTouchEvent(MotionEvent)` (or attach an `OnTouchListener` to the `WebView`), read
`getToolType()`/`getPressure()`/`getAxisValue(AXIS_TILT)`, and forward to JS via
`WebView.evaluateJavascript(...)` or a `@JavascriptInterface` bridge. `[verified]` that both are the official
mechanisms ([WebView reference](https://developer.android.com/reference/android/webkit/WebView));
`[reported]` as a Capacitor pattern — there is **no well-known off-the-shelf Capacitor stylus/ink plugin**,
so this is our own small plugin. `[UNCERTAIN]`: forwarding non-pen events to `super.dispatchTouchEvent` while
consuming pen events needs care.

---

## 5. Cross-platform summary

| Capability | HarmonyOS | iPadOS | Android |
|---|---|---|---|
| Handwriting→text in WebView | ❌ textarea/contenteditable `[reported]` | ✅ free `[verified]` | ✅ API 34+ input/textarea `[verified]`; contenteditable `[UNCERTAIN]` |
| Handwriting→text, native | ✅ 全局手写 in TextInput/TextArea; ❌ no stroke→text API `[reported]` | ✅ Scribble in native text views | ✅ EditText by default `[verified]` |
| Stroke→text API for 3rd parties | ❌ `[reported]` | ❌ (IME-like) | ❌ (IME-delegated) `[verified]` |
| `pointerType === "pen"` in WebView | `[UNCERTAIN]` | ✅ `[verified]` (WebKit source) | 55+ `[verified]` BCD; device `[UNCERTAIN]` |
| Pressure / tilt via Pointer Events | ArkUI ✅ `[verified]`; ArkWeb `[UNCERTAIN]` | ✅ 13+ `[verified]` | ✅ 55/57+ `[verified]` |
| Coalesced / predicted events | `[UNCERTAIN]` | 18.2+ / 18.2+ `[verified]` | 58+ / 77+ `[verified]` |
| Low-latency front buffer | Pen Kit / StylusFrameBoost (ArkUI only) `[verified]` | PencilKit (native) | `GLFrontBufferedRenderer` (native) `[verified]` |
| Palm rejection | no app API (`setHandwritingFlag` = System API) `[verified]`; finger-cancel on stylus `[verified]` | OS-level, free `[reported]` | app-implemented; `FLAG_CANCELED` 33+ `[verified]` |
| Ink storage we control | ❌ Pen Kit format opaque | ✅ ours | ✅ ours, or `androidx.ink` `ink-storage` |
| Pen-body gestures | squeeze/doubleTap `[verified]` | `UIPencilInteraction` `[verified]` | usually none `[UNCERTAIN]` |

---

## 6. Recommendation for our architecture

**Lowest-risk path: delegate handwriting-to-text to the system IME; build exactly one platform-agnostic
canvas ink layer in the web core. Never adopt PencilKit, Pen Kit, or `androidx.ink` as *storage* — optionally
adopt them later as render accelerators behind our own stroke model.**

**6.1 Handwriting-to-text.** iPadOS: zero code (real `<textarea>`/`contenteditable`, plus the HIG editor
rules from §3.1). Android 14+: zero code for `<textarea>`; test `contenteditable` and keep a hidden
`<textarea>` pen-entry surface as fallback. **HarmonyOS: cannot be done in ArkWeb** — ship a small native
ArkTS 手写输入 field (`TextInput`/`TextArea` where 全局手写 / 小艺输入法 (Celia IME) work) whose result is pushed into the
web editor via `registerJavaScriptProxy`/`runJavaScript`. This is the *only* mandatory native code for (a).

**6.2 Ink.** One web-core implementation:
- *Capture* — Pointer Events, gate on `pointerType === "pen"` with a finger fallback, `touch-action: none`, `getCoalescedEvents()` (58+/18.2+) and `getPredictedEvents()` (77+/18.2+) for smoothing only.
- *Stroke model* (JSON per note), points normalised to `[0,1]` in canvas space so notes survive resize/DPI:
  ```
  { v:1, canvas:{w,h,dpr},
    strokes:[ { id, tool:"pen"|"highlighter"|"eraser", color:"#rrggbb", width, seed,
                pts:[[x,y,pressure,tiltX,tiltY,t], …] } ] }
  ```
- *Render* — `canvas 2d`, variable-width quads from pressure. *Undo* — a stroke stack, which is also the mechanism Android's `ACTION_CANCEL` palm rejection needs.
- *Search story* — ink is invisible to FTS: store a rendered thumbnail plus an optional text proxy (caption or recognition output) as note content.

**6.3 Mapping onto Trilium.** Text notes are HTML. Add an ink block `<div class="trilium-ink" data-ink-id="K1">…canvas…</div>` and store the stroke JSON as a Trilium **attachment** (`ink-K1.json`) on the note. The HTML note stays the source of truth for text; ink rides along and re-hydrates on open — survives sync, export and revision history with no new note type. For (c), the same JSON is the note body (a text note containing only the ink block), or later a dedicated `canvas`-style note type.
**Excalidraw alignment:** Trilium already has an Excalidraw integration, and Excalidraw's `freedraw` element is JSON with `points`/`pressures`/`simulatePressure`. For v1 keep our own lean stroke JSON and only *render into* Excalidraw when the user converts an annotation into a canvas note — Excalidraw's element model carries far more than we need and its pressure fidelity for tilt is limited. **Never inline base64 ink in the HTML** — it bloats sync payloads and destroys text diffs.

**6.4 Per-platform native minimum, by cost.**

| Platform | Mandatory | Optional later |
|---|---|---|
| iPadOS | none | PencilKit overlay for pro ink; `UIScribbleInteraction`s |
| Android | palm-rejection bridge (`dispatchTouchEvent` → `FLAG_CANCELED`/`ACTION_CANCEL`/`TOOL_TYPE_STYLUS` → JS) | `GLFrontBufferedRenderer`, `input-motionprediction`, `androidx.ink` rendering |
| HarmonyOS | handwriting-input field (TextInput/TextArea or Pen Kit) + JS bridge; palm heuristic | Pen Kit `HandwriteComponent`; squeeze→tool palette; `StylusFrameBoost` |

---

## 7. Impossible or painful in a WebView (forces native)

1. **HarmonyOS handwriting-to-text in ArkWeb** — 全局手写 reportedly doesn't fire in
   textarea/contenteditable, and no stroke→text API exists at all. → native ArkTS entry field. `[reported]`
2. **HarmonyOS Pen Kit** — `HandwriteComponent` is ArkUI-only, its format is opaque, no recognition. → all-or-nothing native bet.
3. **HarmonyOS palm rejection** — the OS primitive (`setHandwritingFlag`) is a System API; left with the
   implicit finger-`Cancel` behaviour plus our own heuristics. `[verified]`
4. **HarmonyOS low-latency rendering** — 报点预测 / `StylusFrameBoost` are ArkUI-side; nothing suggests ArkWeb can use them. `[UNCERTAIN]`
5. **iOS PencilKit** — cannot render inside web content; overlay or export/import only. `[verified]` native, `[UNCERTAIN]` overlay details.
6. **iOS `pointerrawupdate`** — unsupported in Safari/WKWebView → fewer raw samples. `[verified]`
7. **iOS coalesced/predicted events** — iPadOS 18.2+ only; older devices get jagged fast strokes. `[verified]`
8. **Android palm rejection** — must be implemented; below API 33 you cannot tell intentional from palm. `[verified]`
9. **Android WebView stylus fidelity** — unproven; the shell interception bridge is the guaranteed path. `[UNCERTAIN]`
10. **System gesture conflicts** — Android edge-swipe navigation and iOS scribble/undo gestures can steal
    strokes from a canvas; both need native configuration. `[reported]`

---

## 8. Minimum viable implementation

Ordered; each step independently shippable.

1. **Measure the two unknowns on real hardware first (≈1 day).** HarmonyOS: does ArkWeb deliver `pointerdown`
   with `pointerType === "pen"`, non-trivial `pressure`, and `getCoalescedEvents`? Does a finger touch get
   `Cancel` while the pen is down? Android: does a `contenteditable` accept API-34 stylus handwriting, and
   does WebView report pen pressure? *Everything below depends on these answers.*
2. **Web-core ink canvas** (the bulk of the value). Pointer Events capture, `touch-action: none`, pen-gated
   with finger fallback, pressure→width, coalesced events when present, `pointerType`-aware tool switching
   (pen = ink, finger = scroll/select). One component.
3. **Stroke persistence as a Trilium attachment.** JSON model (§6.2) saved as `ink-<id>.json` on the note;
   re-rendered on open; PNG export for thumbnails/preview. No new note type.
4. **System handwriting-to-text, free, on iOS + Android.** Per §6.1, plus the HIG editor rules.
5. **Android palm-rejection bridge** (~100 lines Kotlin in a Capacitor plugin): intercept `dispatchTouchEvent`,
   detect `TOOL_TYPE_STYLUS` to set a "pen active" flag, map `ACTION_CANCEL`/`FLAG_CANCELED` to a JS
   `cancelStroke(pointerId)`, forward everything else to the WebView. Reuses step 2's undo stack.
6. **HarmonyOS handwriting-input field** (the only mandatory ArkTS work): a native `TextInput`/`TextArea`
   entry surface launched from the web editor toolbar, pushing recognised text back over the JS bridge.
   Closes the HarmonyOS gap in (a) without touching Pen Kit.
7. **Shared palm-rejection heuristic** (fallback everywhere): while a pen stroke is live, ignore any
   `pointerType === "touch"` pointer whose contact ellipse exceeds a width threshold; discard strokes that
   begin during a live pen stroke.

**Deferred:** Pen Kit `HandwriteComponent`, PencilKit overlay, `GLFrontBufferedRenderer` /
`input-motionprediction` / `androidx.ink`, server-side ink rendering, stroke→text recognisers, and
squeeze/double-tap tool shortcuts. Each is an upgrade behind the same stroke model, not a prerequisite.

**Question back to the owner:** does "stylus handwriting input editing" mean *(a) write-and-convert-to-text*
or *(b) annotate/sketch with ink*? If **(b) only**, HarmonyOS becomes nearly as cheap as the other two and
step 6 drops out of v1. If **(a) at iPad parity on HarmonyOS** is required, that is a materially larger native
investment and may not be fully achievable today.

---

## 9. Sources, and what could not be fetched

**Apple** — [HIG: Apple Pencil and Scribble](https://developer.apple.com/design/human-interface-guidelines/apple-pencil-and-scribble) · [UIScribbleInteraction](https://developer.apple.com/documentation/uikit/uiscribbleinteraction) · [UIIndirectScribbleInteraction](https://developer.apple.com/documentation/uikit/uiindirectscribbleinteraction-1nfjm) · [UIPencilInteraction](https://developer.apple.com/documentation/uikit/uipencilinteraction)

**WebKit / W3C / compat data** — [commit 7f23d03 "Produce 'pen' Pointer Events if using a stylus"](https://github.com/WebKit/WebKit/commit/7f23d038821327941799bcffb3b20a0c7d8bd9d3) · [MDN `api/PointerEvent.json`](https://github.com/mdn/browser-compat-data/blob/main/api/PointerEvent.json) · [MDN `api/Element.json`](https://github.com/mdn/browser-compat-data/blob/main/api/Element.json) · [Pointer Events L3](https://www.w3.org/TR/pointerevents3/) · [PE4 WD](https://www.w3.org/TR/2025/WD-pointerevents4-20251015/)

**Android** — [Stylus input in text fields](https://developer.android.com/develop/ui/views/touch-and-input/stylus-input/stylus-input-in-text-fields) · [Advanced stylus features](https://developer.android.com/develop/ui/views/touch-and-input/stylus-input/advanced-stylus-features) · [Stylus palm rejection](https://developer.android.com/develop/adaptive-apps/cookbook/stylus-palm-rejection) · [View](https://developer.android.com/reference/android/view/View) · [Ink](https://developer.android.com/jetpack/androidx/releases/ink) · [Input](https://developer.android.com/jetpack/androidx/releases/input) · [GLFrontBufferedRenderer](https://developer.android.com/reference/kotlin/androidx/graphics/lowlatency/GLFrontBufferedRenderer) · [WebView](https://developer.android.com/reference/android/webkit/WebView)

**HarmonyOS / Pen Kit** — [Pen Kit 简介](https://developer.huawei.com/consumer/cn/doc/doccenter-capabilities/pen-introduction) · [接入手写套件](https://developer.huawei.com/consumer/cn/doc/doccenter-capabilities/pen-suite) · [HandwriteController](https://developer.huawei.com/consumer/cn/doc/doccenter-references/api/pen-handwritecontroller) · [HandwriteComponent](https://developer.huawei.com/consumer/cn/doc/doccenter-references/api/pen-handwritecomponent) · [stylusInteraction](https://developer.huawei.com/consumer/cn/doc/doccenter-references/api/pen-stylusinteraction) · [StylusFrameBoost](https://developer.huawei.com/consumer/cn/doc/doccenter-references/api/pen-stylusframeboost) · [华为平板全局手写无法使用](https://consumer.huawei.com/cn/support/content/zh-cn15822601/)

**OpenHarmony** (grepped from a local sparse clone of `github.com/openharmony/docs@master`) — `ts-gesture-settings.md` (SourceTool) · `ts-universal-events-touch.md` (pressure, getHistoricalPoints) · `ts-universal-events-hover.md` (pen hover) · `ts-gesture-customize-judge.md` (tiltX/tiltY/rollAngle) · `ts-appendix-enums.md` (ResponseRegionSupportedTool.PEN, Cancel semantics) · `js-apis-window-sys.md` (`setHandwritingFlag`, System API) · `capi-ui-input-event-h.md` (NDK tool type / tilt / roll) · [web-gesture.md](https://gitee.com/openharmony/docs/blob/master/en/application-dev/web/web-gesture.md)

**Could not be fetched raw (JS-rendered; text obtained via a rendering proxy, or not at all).** Treat any
claim resting solely on these as one step removed:
- All `developer.huawei.com` doc-center pages and forum threads. Thread `0210157907485611572` ("全局手写…在
  textarea 和可编辑 div 标签上无法触发" — "global handwriting … cannot be triggered on textarea and
  editable div elements") returned page chrome only; its text came from the
  [itying mirror](http://bbs.itying.com/topic/67057700bb648a00d098581f) → `[reported]`, not `[verified]`.
- [Huawei forum: browser input/textarea rejects stylus writes](https://developer.huawei.com/consumer/cn/forum/topic/0202172489107476174)
  (body extracted; the official reply was only "file a ticket").
- **No official Huawei page stating whether ArkWeb delivers `pointerType === "pen"` was found at all.** That
  gap is the top device-verification item (MVI step 1).
