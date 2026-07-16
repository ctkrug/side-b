import { describe, expect, it } from "vitest";
import { buildSaturationCurve, softClipSample } from "../src/audio/saturation.js";

describe("softClipSample", () => {
  it("leaves silence at zero", () => {
    expect(softClipSample(0, 0.5)).toBe(0);
  });

  it("never exceeds the [-1, 1] range", () => {
    for (let amount = 0; amount <= 1; amount += 0.25) {
      for (let x = -1; x <= 1; x += 0.1) {
        const y = softClipSample(x, amount);
        expect(y).toBeGreaterThanOrEqual(-1);
        expect(y).toBeLessThanOrEqual(1);
      }
    }
  });

  it("compresses distinct input levels toward the same ceiling under heavy drive", () => {
    // At amount=1 the drive is high enough that both a moderate and a
    // full-scale input clip before the cubic curve, so they land on
    // (almost) the same output — the hallmark of tape-style limiting.
    const moderate = softClipSample(0.15, 1);
    const fullScale = softClipSample(1, 1);
    expect(Math.abs(fullScale - moderate)).toBeLessThan(0.01);
  });
});

describe("buildSaturationCurve", () => {
  it("produces a curve of the requested length", () => {
    expect(buildSaturationCurve(0.3, 256)).toHaveLength(256);
  });

  it("is monotonically non-decreasing across the input range", () => {
    const curve = buildSaturationCurve(0.5, 512);
    for (let i = 1; i < curve.length; i++) {
      expect(curve[i]).toBeGreaterThanOrEqual(curve[i - 1] - 1e-6);
    }
  });
});
