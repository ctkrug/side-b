import { describe, expect, it } from "vitest";
import {
  MAX_PIXEL_RATIO,
  backingStoreSize,
  effectivePixelRatio,
  resizeCanvasToDisplaySize,
} from "../src/ui/canvas.js";

const fakeCanvas = (clientWidth, clientHeight) => ({
  clientWidth,
  clientHeight,
  width: 300,
  height: 150,
});

describe("effectivePixelRatio", () => {
  it("passes through a ratio within the cap", () => {
    expect(effectivePixelRatio(1)).toBe(1);
    expect(effectivePixelRatio(1.5)).toBe(1.5);
  });

  it("caps a very high ratio", () => {
    expect(effectivePixelRatio(4)).toBe(MAX_PIXEL_RATIO);
  });

  it("falls back to 1 for missing or nonsense values", () => {
    expect(effectivePixelRatio(undefined)).toBe(1);
    expect(effectivePixelRatio(0)).toBe(1);
    expect(effectivePixelRatio(-2)).toBe(1);
    expect(effectivePixelRatio(NaN)).toBe(1);
  });
});

describe("backingStoreSize", () => {
  it("scales the CSS box by the ratio", () => {
    expect(backingStoreSize(800, 600, 2)).toMatchObject({
      width: 1600,
      height: 1200,
      ratio: 2,
    });
  });

  it("matches the CSS box at ratio 1", () => {
    expect(backingStoreSize(390, 844, 1)).toMatchObject({
      width: 390,
      height: 844,
    });
  });

  it("rounds to whole pixels", () => {
    const size = backingStoreSize(390.4, 200.6, 1.5);
    expect(Number.isInteger(size.width)).toBe(true);
    expect(Number.isInteger(size.height)).toBe(true);
  });

  it("never returns a zero-sized buffer", () => {
    expect(backingStoreSize(0, 0, 2)).toMatchObject({ width: 1, height: 1 });
  });
});

describe("resizeCanvasToDisplaySize", () => {
  it("resizes the buffer to match the box and reports the change", () => {
    const canvas = fakeCanvas(800, 600);
    expect(resizeCanvasToDisplaySize(canvas, 2)).toBe(true);
    expect(canvas.width).toBe(1600);
    expect(canvas.height).toBe(1200);
  });

  it("reports no change when already the right size", () => {
    const canvas = fakeCanvas(800, 600);
    resizeCanvasToDisplaySize(canvas, 2);
    expect(resizeCanvasToDisplaySize(canvas, 2)).toBe(false);
  });

  it("resizes again when the ratio changes", () => {
    const canvas = fakeCanvas(800, 600);
    resizeCanvasToDisplaySize(canvas, 1);
    expect(resizeCanvasToDisplaySize(canvas, 2)).toBe(true);
    expect(canvas.width).toBe(1600);
  });

  it("resizes again when the box changes", () => {
    const canvas = fakeCanvas(800, 600);
    resizeCanvasToDisplaySize(canvas, 1);
    canvas.clientWidth = 390;
    expect(resizeCanvasToDisplaySize(canvas, 1)).toBe(true);
    expect(canvas.width).toBe(390);
  });

  it("leaves an unlaid-out canvas alone rather than zeroing it", () => {
    const canvas = fakeCanvas(0, 0);
    expect(resizeCanvasToDisplaySize(canvas, 2)).toBe(false);
    expect(canvas.width).toBe(300);
  });

  it("handles the phone and desktop breakpoints", () => {
    for (const [w, h] of [
      [390, 844],
      [768, 700],
      [1440, 900],
    ]) {
      const canvas = fakeCanvas(w, h);
      resizeCanvasToDisplaySize(canvas, 2);
      expect(canvas.width).toBe(w * 2);
      expect(canvas.height).toBe(h * 2);
    }
  });
});
