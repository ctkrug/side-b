import { describe, expect, it } from "vitest";
import {
  COVER_COLORS,
  DEFAULT_STROKE_WIDTH,
  appendPoint,
  coverPointCount,
  createCover,
  createStroke,
  drawCover,
  isCoverEmpty,
  packCover,
  quantize,
  toCoverSpace,
  unpackCover,
} from "../src/ui/doodle.js";
import { FakeContext2D, createFakeCanvas } from "./helpers/fakeCanvas.js";

const rect = { left: 0, top: 0, width: 200, height: 200 };

const strokeOf = (points, color = COVER_COLORS[0]) => ({
  color,
  width: DEFAULT_STROKE_WIDTH,
  points,
});

describe("quantize", () => {
  it("rounds to a thousandth", () => {
    expect(quantize(0.123456)).toBe(0.123);
  });

  it("clamps outside 0..1", () => {
    expect(quantize(-1)).toBe(0);
    expect(quantize(5)).toBe(1);
  });
});

describe("toCoverSpace", () => {
  it("maps a pointer position into 0..1 space", () => {
    expect(toCoverSpace(100, 50, rect)).toEqual({ x: 0.5, y: 0.25 });
  });

  it("accounts for the pad's offset on the page", () => {
    expect(toCoverSpace(150, 150, { left: 100, top: 100, width: 200, height: 200 })).toEqual(
      { x: 0.25, y: 0.25 },
    );
  });

  it("clamps a point dragged outside the pad to its edge", () => {
    expect(toCoverSpace(-50, 400, rect)).toEqual({ x: 0, y: 1 });
  });

  it("returns null for a pad with no layout yet", () => {
    expect(toCoverSpace(10, 10, { left: 0, top: 0, width: 0, height: 0 })).toBeNull();
    expect(toCoverSpace(10, 10, null)).toBeNull();
  });
});

describe("createStroke", () => {
  it("starts empty with the requested color", () => {
    const stroke = createStroke(COVER_COLORS[2]);
    expect(stroke.color).toBe(COVER_COLORS[2]);
    expect(stroke.points).toEqual([]);
  });

  it("falls back to the first palette color for an unknown color", () => {
    expect(createStroke("#ff00ff").color).toBe(COVER_COLORS[0]);
  });

  it("clamps the stroke width to a usable range", () => {
    expect(createStroke(COVER_COLORS[0], 0).width).toBe(1);
    expect(createStroke(COVER_COLORS[0], 500).width).toBe(24);
  });
});

describe("appendPoint", () => {
  it("adds the first point", () => {
    const stroke = appendPoint(createStroke(COVER_COLORS[0]), { x: 0.1, y: 0.1 });
    expect(stroke.points).toHaveLength(1);
  });

  it("adds a point far enough from the last", () => {
    const stroke = createStroke(COVER_COLORS[0]);
    appendPoint(stroke, { x: 0.1, y: 0.1 });
    appendPoint(stroke, { x: 0.5, y: 0.5 });
    expect(stroke.points).toHaveLength(2);
  });

  it("skips a point too close to the last, to keep the link small", () => {
    const stroke = createStroke(COVER_COLORS[0]);
    appendPoint(stroke, { x: 0.1, y: 0.1 });
    appendPoint(stroke, { x: 0.1005, y: 0.1005 });
    expect(stroke.points).toHaveLength(1);
  });

  it("ignores a null point", () => {
    const stroke = appendPoint(createStroke(COVER_COLORS[0]), null);
    expect(stroke.points).toHaveLength(0);
  });
});

describe("isCoverEmpty and coverPointCount", () => {
  it("treats a null or strokeless cover as empty", () => {
    expect(isCoverEmpty(null)).toBe(true);
    expect(isCoverEmpty(createCover())).toBe(true);
    expect(coverPointCount(null)).toBe(0);
  });

  it("treats a cover of empty strokes as empty", () => {
    expect(isCoverEmpty(createCover([strokeOf([])]))).toBe(true);
  });

  it("counts points across every stroke", () => {
    const cover = createCover([
      strokeOf([{ x: 0, y: 0 }]),
      strokeOf([
        { x: 0.5, y: 0.5 },
        { x: 0.6, y: 0.6 },
      ]),
    ]);
    expect(isCoverEmpty(cover)).toBe(false);
    expect(coverPointCount(cover)).toBe(3);
  });
});

describe("drawCover", () => {
  const render = (cover, options) => {
    const ctx = createFakeCanvas().getContext("2d");
    drawCover(ctx, cover, 200, options);
    return ctx;
  };

  it("strokes each drawn path", () => {
    const ctx = render(
      createCover([
        strokeOf([
          { x: 0, y: 0 },
          { x: 1, y: 1 },
        ]),
      ]),
    );
    expect(ctx.callsTo("stroke")).toHaveLength(1);
    expect(ctx.callsTo("lineTo")).toHaveLength(1);
  });

  it("scales normalized points to the canvas size", () => {
    const ctx = render(createCover([strokeOf([{ x: 0.5, y: 0.25 }, { x: 1, y: 1 }])]));
    expect(ctx.callsTo("moveTo")[0].args).toEqual([100, 50]);
    expect(ctx.callsTo("lineTo")[0].args).toEqual([200, 200]);
  });

  it("renders a single-point stroke as a dot rather than dropping it", () => {
    const ctx = render(createCover([strokeOf([{ x: 0.5, y: 0.5 }])]));
    expect(ctx.callsTo("lineTo")[0].args).toEqual([100, 100]);
    expect(ctx.callsTo("stroke")).toHaveLength(1);
  });

  it("skips empty strokes", () => {
    expect(render(createCover([strokeOf([])])).callsTo("stroke")).toHaveLength(0);
  });

  it("paints a background when asked", () => {
    const ctx = render(null, { background: "#fff" });
    expect(ctx.callsTo("fillRect")[0].args).toEqual([0, 0, 200, 200]);
  });

  it("draws nothing but survives a null cover", () => {
    expect(() => render(null)).not.toThrow();
    expect(render(null).callsTo("stroke")).toHaveLength(0);
  });
});

describe("packCover and unpackCover", () => {
  const cover = createCover([
    strokeOf(
      [
        { x: 0.1, y: 0.2 },
        { x: 0.3, y: 0.4 },
      ],
      COVER_COLORS[1],
    ),
    strokeOf([{ x: 0.5, y: 0.5 }], COVER_COLORS[3]),
  ]);

  it("round-trips a cover losslessly", () => {
    expect(unpackCover(packCover(cover))).toEqual(cover);
  });

  it("round-trips every palette color", () => {
    for (const color of COVER_COLORS) {
      const single = createCover([strokeOf([{ x: 0.5, y: 0.5 }], color)]);
      expect(unpackCover(packCover(single)).strokes[0].color).toBe(color);
    }
  });

  it("packs an empty cover as nothing to carry", () => {
    expect(packCover(createCover())).toBeNull();
    expect(packCover(null)).toBeNull();
  });

  it("packs to a compact integer form", () => {
    const packed = packCover(cover);
    expect(packed[0]).toMatchObject({ c: 1, p: [100, 200, 300, 400] });
  });

  it("stays small enough for a URL at a realistic doodle size", () => {
    // ~40 strokes of 25 points is a busy but plausible cover.
    const busy = createCover(
      Array.from({ length: 40 }, (_, s) =>
        strokeOf(
          Array.from({ length: 25 }, (_, i) => ({
            x: quantize((i % 10) / 10),
            y: quantize((s % 10) / 10),
          })),
          COVER_COLORS[s % COVER_COLORS.length],
        ),
      ),
    );
    expect(JSON.stringify(packCover(busy)).length).toBeLessThan(20_000);
  });

  it("returns null rather than throwing for non-array input", () => {
    expect(unpackCover(null)).toBeNull();
    expect(unpackCover("nope")).toBeNull();
    expect(unpackCover(42)).toBeNull();
  });

  it("skips malformed strokes instead of failing the whole cover", () => {
    const recovered = unpackCover([
      null,
      { p: "not-an-array" },
      { c: 0, w: 30, p: [500, 500] },
    ]);
    expect(recovered.strokes).toHaveLength(1);
  });

  it("drops non-numeric coordinates", () => {
    const recovered = unpackCover([{ c: 0, w: 30, p: ["x", "y", 500, 500] }]);
    expect(recovered.strokes[0].points).toEqual([{ x: 0.5, y: 0.5 }]);
  });

  it("ignores a trailing unpaired coordinate", () => {
    const recovered = unpackCover([{ c: 0, w: 30, p: [500, 500, 700] }]);
    expect(recovered.strokes[0].points).toHaveLength(1);
  });

  it("falls back to a palette color for an out-of-range index", () => {
    const recovered = unpackCover([{ c: 99, w: 30, p: [100, 100] }]);
    expect(COVER_COLORS).toContain(recovered.strokes[0].color);
  });

  it("clamps a hostile stroke width", () => {
    const recovered = unpackCover([{ c: 0, w: 99999, p: [100, 100] }]);
    expect(recovered.strokes[0].width).toBeLessThanOrEqual(24);
  });

  it("returns null when nothing survives unpacking", () => {
    expect(unpackCover([{ p: [] }])).toBeNull();
  });

  it("produces a cover that renders", () => {
    const ctx = new FakeContext2D();
    drawCover(ctx, unpackCover(packCover(cover)), 100);
    expect(ctx.callsTo("stroke")).toHaveLength(2);
  });
});
