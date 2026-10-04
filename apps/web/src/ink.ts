/**
 * The ink model and its canvas renderer.
 *
 * ADR D7 settles the shape: strokes live in **our own** format, persisted as a note attachment, and
 * are never stored as platform ink. PencilKit's and Huawei's Pen Kit both keep strokes in opaque
 * formats that do not round-trip (Pen Kit returns only a thumbnail), so a note's ink would be
 * trapped in whichever device drew it.
 *
 * Coordinates are normalised to [0, 1] against the drawing box, and a stroke's width is normalised
 * against the box width, so a sketch redraws correctly on any screen size. `aspect` records the box
 * the strokes were drawn in, so a doc drawn on a tablet does not distort when shown on a phone.
 */

export interface InkPoint {
  x: number;
  y: number;
  /** Normalised pressure 0–1, when the input device reports it. */
  p?: number;
}

export interface InkStroke {
  id: string;
  /** CSS colour. Kept as a string so a newer client can add a palette without a format change. */
  color: string;
  /** Normalised against the box width. */
  width: number;
  points: InkPoint[];
  /** Which device drew it — `pen`, `touch` or `mouse`. Diagnostic, and useful for palm heuristics. */
  tool: string;
}

export interface InkDoc {
  version: 1;
  /** Width / height of the box the strokes were drawn in. */
  aspect: number;
  strokes: InkStroke[];
}

export const EMPTY_INK: InkDoc = { version: 1, aspect: 1, strokes: [] };

export function createInkDoc(aspect: number): InkDoc {
  return { version: 1, aspect: aspect > 0 ? aspect : 1, strokes: [] };
}

/**
 * Parse a stored stroke file, tolerating anything.
 *
 * A malformed attachment must not take the note view down with it — the worst case should be a note
 * that shows no ink, not a screen that fails to open.
 */
export function parseInkDoc(json: string | null): InkDoc {
  if (!json) return { ...EMPTY_INK };

  try {
    const parsed = JSON.parse(json) as Partial<InkDoc>;
    if (!parsed || !Array.isArray(parsed.strokes)) return { ...EMPTY_INK };

    const strokes = parsed.strokes
      .filter((stroke): stroke is InkStroke => Boolean(stroke) && Array.isArray((stroke as InkStroke).points))
      .map((stroke) => ({
        id: String(stroke.id ?? ""),
        color: String(stroke.color ?? "#e8eaed"),
        width: Number.isFinite(stroke.width) ? Number(stroke.width) : 0.004,
        tool: String(stroke.tool ?? "pen"),
        points: stroke.points
          .filter((point) => Number.isFinite(point?.x) && Number.isFinite(point?.y))
          .map((point) => ({
            x: clamp01(point.x),
            y: clamp01(point.y),
            ...(Number.isFinite(point.p) ? { p: clamp01(point.p as number) } : {})
          }))
      }))
      .filter((stroke) => stroke.points.length > 0);

    return {
      version: 1,
      aspect: Number.isFinite(parsed.aspect) && (parsed.aspect as number) > 0 ? (parsed.aspect as number) : 1,
      strokes
    };
  } catch {
    return { ...EMPTY_INK };
  }
}

export function serializeInkDoc(doc: InkDoc): string {
  return JSON.stringify(doc);
}

function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

/** Map a pointer position in CSS pixels onto the normalised drawing box. */
export function toNormalised(
  offsetX: number,
  offsetY: number,
  box: { width: number; height: number }
): InkPoint {
  if (box.width <= 0 || box.height <= 0) return { x: 0, y: 0 };
  return { x: clamp01(offsetX / box.width), y: clamp01(offsetY / box.height) };
}

/** Line width in CSS pixels for a stroke drawn in a box of the given width. */
export function strokeWidthPx(stroke: InkStroke, boxWidth: number): number {
  return Math.max(1, stroke.width * boxWidth);
}

export interface InkCanvasOptions {
  /** Fired whenever a stroke is committed, so the host can mark the note dirty. */
  onChange?: (doc: InkDoc) => void;
  /** Base colour for new strokes. */
  color?: string;
  /** Base width for new strokes, normalised against the box width. */
  width?: number;
  /**
   * How long a pen sighting suppresses finger input, in milliseconds.
   *
   * There is no app-level palm-rejection API on any of the three targets (HarmonyOS's
   * `setHandwritingFlag` is a System API, and ArkWeb exposes nothing), so the honest approach is a
   * heuristic: once a stylus has been seen, reject touch for a short window. It is imperfect, and
   * deliberately so — the alternative is dropping finger input entirely.
   */
  palmRejectionMs?: number;
}

/**
 * A canvas that collects strokes.
 *
 * Rendering is redrawn wholesale on every change. That is fine at note scale (hundreds of strokes)
 * and removes a whole class of incremental-rendering bugs; if a note ever holds thousands of
 * strokes, an offscreen bitmap of committed strokes is the obvious next step.
 */
export class InkCanvas {
  private doc: InkDoc;
  private drawing: InkStroke | null = null;
  private lastPenAt = 0;
  private disposers: Array<() => void> = [];

  constructor(
    private readonly canvas: HTMLCanvasElement,
    doc: InkDoc,
    private readonly options: InkCanvasOptions = {}
  ) {
    this.doc = doc;
    this.attach();
    this.redraw();
  }

  get document(): InkDoc {
    return this.doc;
  }

  setDocument(doc: InkDoc): void {
    this.doc = doc;
    this.redraw();
  }

  /** Whether the last input came from a stylus. Drives the UI's hint about pen support. */
  get sawPen(): boolean {
    return this.lastPenAt > 0;
  }

  setStyle(style: { color?: string; width?: number }): void {
    if (style.color) this.options.color = style.color;
    if (style.width) this.options.width = style.width;
  }

  undo(): void {
    if (this.doc.strokes.length === 0) return;
    this.doc = { ...this.doc, strokes: this.doc.strokes.slice(0, -1) };
    this.redraw();
    this.options.onChange?.(this.doc);
  }

  clear(): void {
    if (this.doc.strokes.length === 0) return;
    this.doc = { ...this.doc, strokes: [] };
    this.redraw();
    this.options.onChange?.(this.doc);
  }

  destroy(): void {
    for (const dispose of this.disposers) dispose();
    this.disposers = [];
  }

  resize(): void {
    const rect = this.canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;

    // Render at device resolution so ink is not blurry on a phone's 3× display.
    const ratio = window.devicePixelRatio || 1;
    this.canvas.width = Math.round(rect.width * ratio);
    this.canvas.height = Math.round(rect.height * ratio);
    this.redraw();
  }

  // ---------------------------------------------------------------- input

  private attach(): void {
    const onDown = (event: PointerEvent) => {
      if (!this.acceptPointer(event)) return;

      // Capture so a stroke that leaves the canvas still receives its moves and its up.
      this.canvas.setPointerCapture(event.pointerId);
      event.preventDefault();

      if (event.pointerType === "pen") this.lastPenAt = performance.now();

      const rect = this.canvas.getBoundingClientRect();
      this.drawing = {
        id: randomId(),
        color: this.options.color ?? "#e8eaed",
        width: this.options.width ?? 0.004,
        tool: event.pointerType || "unknown",
        points: [this.pointFrom(event, rect)]
      };

      this.redraw();
    };

    const onMove = (event: PointerEvent) => {
      if (!this.drawing) return;
      if (!this.acceptPointer(event)) return;

      event.preventDefault();
      const rect = this.canvas.getBoundingClientRect();

      // Coalesced events carry the samples the compositor merged into this frame; without them a
      // fast stroke becomes a polygon. Not available everywhere, hence the fallback.
      const events =
        typeof event.getCoalescedEvents === "function" ? event.getCoalescedEvents() : [];
      const samples = events.length > 0 ? events : [event];

      for (const sample of samples) {
        this.drawing.points.push(this.pointFrom(sample, rect));
      }

      this.redraw();
    };

    const onUp = (event: PointerEvent) => {
      if (!this.drawing) return;

      if (event.pointerType === "pen") this.lastPenAt = performance.now();

      const finished = this.drawing;
      this.drawing = null;

      if (this.canvas.hasPointerCapture(event.pointerId)) {
        this.canvas.releasePointerCapture(event.pointerId);
      }

      // A tap that produced a single point is still a dot the user meant to make.
      if (finished.points.length > 0) {
        this.doc = { ...this.doc, strokes: [...this.doc.strokes, finished] };
        this.options.onChange?.(this.doc);
      }

      this.redraw();
    };

    const add = <K extends keyof HTMLElementEventMap>(
      type: K,
      handler: (event: HTMLElementEventMap[K]) => void
    ) => {
      this.canvas.addEventListener(type, handler as EventListener);
      this.disposers.push(() => this.canvas.removeEventListener(type, handler as EventListener));
    };

    add("pointerdown", onDown);
    add("pointermove", onMove);
    add("pointerup", onUp);
    add("pointercancel", onUp);
    // Palm or wrist resting on the glass must not scroll or zoom the page instead of drawing.
    this.canvas.style.touchAction = "none";
  }

  /**
   * Reject a touch that arrives while a stylus is in use.
   *
   * Mouse is always accepted so the whole thing stays usable — and testable — on a desktop.
   */
  private acceptPointer(event: PointerEvent): boolean {
    if (event.pointerType !== "touch") return true;

    const window = this.options.palmRejectionMs ?? 1500;
    return performance.now() - this.lastPenAt > window;
  }

  private pointFrom(event: PointerEvent, rect: DOMRect): InkPoint {
    const point = toNormalised(event.clientX - rect.left, event.clientY - rect.top, rect);

    // Pressure is 0.5 for devices that report nothing, and 0 for some pens on the first sample;
    // treating that as absence keeps the width mapping honest.
    if (event.pointerType === "pen" && event.pressure > 0) {
      point.p = event.pressure;
    }

    return point;
  }

  // -------------------------------------------------------------- rendering

  private redraw(): void {
    paintInk(this.canvas, this.doc, this.drawing ? [this.drawing] : []);
  }
}

/**
 * Draw a document onto a canvas, sized to its CSS box at device resolution.
 *
 * Exported separately from {@link InkCanvas} so a read-only view (the phone, which annotates
 * nothing) can render stored ink without attaching input handlers.
 *
 * @param extra strokes still being drawn, appended after the committed ones
 */
export function paintInk(canvas: HTMLCanvasElement, doc: InkDoc, extra: InkStroke[] = []): void {
  const context = canvas.getContext("2d");
  if (!context) return;

  const rect = canvas.getBoundingClientRect();
  const ratio = window.devicePixelRatio || 1;

  // Match the backing store to the element's current box; without this the drawing is stretched
  // whenever the layout changes after the canvas was first sized.
  const targetWidth = Math.max(1, Math.round((rect.width || canvas.clientWidth || 300) * ratio));
  const targetHeight = Math.max(1, Math.round((rect.height || canvas.clientHeight || 200) * ratio));
  if (canvas.width !== targetWidth) canvas.width = targetWidth;
  if (canvas.height !== targetHeight) canvas.height = targetHeight;

  const width = canvas.width / ratio;
  const height = canvas.height / ratio;

  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  context.clearRect(0, 0, width, height);

  for (const stroke of [...doc.strokes, ...extra]) {
    paintStroke(context, stroke, width, height);
  }
}

function paintStroke(
  context: CanvasRenderingContext2D,
  stroke: InkStroke,
  width: number,
  height: number
): void {
    if (stroke.points.length === 0) return;

    const baseWidth = strokeWidthPx(stroke, width);
    context.strokeStyle = stroke.color;
    context.fillStyle = stroke.color;
    context.lineCap = "round";
    context.lineJoin = "round";

    // A single sample is a dot, not a path — `lineTo` to the same point draws nothing.
    if (stroke.points.length === 1) {
      const only = stroke.points[0]!;
      context.beginPath();
      context.arc(only.x * width, only.y * height, baseWidth / 2, 0, Math.PI * 2);
      context.fill();
      return;
    }

  // Variable width: draw each segment separately rather than one long path, because a Canvas2D
  // path has a single line width for its whole length.
  for (let index = 1; index < stroke.points.length; index++) {
    const from = stroke.points[index - 1]!;
    const to = stroke.points[index]!;

    const pressure = to.p ?? from.p;
    context.lineWidth = pressure === undefined ? baseWidth : baseWidth * (0.4 + 1.2 * pressure);

    context.beginPath();
    context.moveTo(from.x * width, from.y * height);
    context.lineTo(to.x * width, to.y * height);
    context.stroke();
  }
}

function randomId(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}
