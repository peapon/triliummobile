import { describe, expect, it } from "vitest";

import { createInkDoc, parseInkDoc, serializeInkDoc, strokeWidthPx, toNormalised, type InkDoc } from "./ink.js";

/**
 * The ink model's pure parts.
 *
 * The canvas itself is exercised in the browser E2E; what is tested here is the part that decides
 * whether a sketch survives a round trip through storage and back onto a differently sized screen,
 * and what happens when the stored file is damaged.
 */

const doc: InkDoc = {
  version: 1,
  aspect: 1.5,
  strokes: [
    { id: "s1", color: "#fff", width: 0.004, tool: "pen", points: [{ x: 0, y: 0, p: 0.5 }, { x: 1, y: 1 }] }
  ]
};

describe("normalising pointer input", () => {
  it("maps a pixel position onto the unit box", () => {
    expect(toNormalised(50, 25, { width: 200, height: 100 })).toEqual({ x: 0.25, y: 0.25 });
  });

  it("clamps outside the box, so a stroke that leaves the canvas stays representable", () => {
    expect(toNormalised(-20, 500, { width: 200, height: 100 })).toEqual({ x: 0, y: 1 });
  });

  it("returns the origin for a zero-sized box rather than dividing by zero", () => {
    expect(toNormalised(10, 10, { width: 0, height: 0 })).toEqual({ x: 0, y: 0 });
  });
});

describe("stroke width", () => {
  it("scales with the box, so a sketch looks the same at any size", () => {
    const stroke = doc.strokes[0]!;
    expect(strokeWidthPx(stroke, 1000)).toBeCloseTo(4, 5);
    expect(strokeWidthPx(stroke, 500)).toBeCloseTo(2, 5);
  });

  it("never collapses below one pixel", () => {
    expect(strokeWidthPx({ ...doc.strokes[0]!, width: 0 }, 10)).toBe(1);
  });
});

describe("round-tripping a stroke file", () => {
  it("survives serialise -> parse unchanged", () => {
    expect(parseInkDoc(serializeInkDoc(doc))).toEqual(doc);
  });

  it("preserves the record of the box it was drawn in", () => {
    expect(parseInkDoc(serializeInkDoc(doc)).aspect).toBe(1.5);
  });

  it("keeps a single-point stroke, which is how a deliberate dot is stored", () => {
    const dot: InkDoc = {
      version: 1,
      aspect: 1,
      strokes: [{ id: "d", color: "#fff", width: 0.01, tool: "pen", points: [{ x: 0.5, y: 0.5 }] }]
    };
    expect(parseInkDoc(serializeInkDoc(dot)).strokes[0]!.points).toHaveLength(1);
  });
});

describe("tolerating a damaged stroke file", () => {
  // A bad attachment must cost the note its ink, not the whole screen.
  it("returns an empty document for null, empty or non-JSON input", () => {
    for (const input of [null, "", "not json", "{", "[1,2,3]", "null"]) {
      expect(parseInkDoc(input).strokes).toEqual([]);
    }
  });

  it("returns an empty document when the shape is wrong", () => {
    expect(parseInkDoc('{"version":1,"strokes":"nope"}').strokes).toEqual([]);
    expect(parseInkDoc('{"version":1}').strokes).toEqual([]);
  });

  it("drops unusable points instead of failing the whole document", () => {
    const json = JSON.stringify({
      version: 1,
      aspect: 1,
      strokes: [
        { id: "s", color: "#fff", width: 0.004, points: [{ x: 0.1, y: 0.1 }, { x: "bad", y: 2 }, null] }
      ]
    });

    const parsed = parseInkDoc(json);
    expect(parsed.strokes).toHaveLength(1);
    expect(parsed.strokes[0]!.points).toEqual([{ x: 0.1, y: 0.1 }]);
  });

  it("drops strokes that lost all their points", () => {
    const json = JSON.stringify({
      version: 1,
      aspect: 1,
      strokes: [{ id: "s", color: "#fff", width: 0.004, points: [] }]
    });
    expect(parseInkDoc(json).strokes).toHaveLength(0);
  });

  it("substitutes sane defaults for missing fields", () => {
    const parsed = parseInkDoc('{"version":1,"strokes":[{"points":[{"x":0,"y":0}]}]}');
    const stroke = parsed.strokes[0]!;

    expect(stroke.color).toBe("#e8eaed");
    expect(stroke.width).toBeGreaterThan(0);
    expect(stroke.tool).toBe("pen");
    expect(parsed.aspect).toBe(1);
  });

  it("clamps out-of-range coordinates rather than trusting the file", () => {
    const parsed = parseInkDoc('{"version":1,"strokes":[{"points":[{"x":-5,"y":9,"p":2}]}]}');
    expect(parsed.strokes[0]!.points[0]).toEqual({ x: 0, y: 1, p: 1 });
  });
});

describe("createInkDoc", () => {
  it("records the drawing box's aspect ratio", () => {
    expect(createInkDoc(1.6).aspect).toBe(1.6);
  });

  it("falls back to a square for a degenerate aspect", () => {
    expect(createInkDoc(0).aspect).toBe(1);
    expect(createInkDoc(Number.NaN).aspect).toBe(1);
  });
});
