import { describe, expect, it } from "vitest";
import {
  buildSaturationCurve,
  saturationMakeupGain,
  softClipSample,
} from "../src/audio/saturation.js";

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

describe("saturationMakeupGain", () => {
  it("restores a full-scale input to unity through the curve", () => {
    for (const amount of [0, 0.25, 0.5, 1]) {
      const shaped = softClipSample(1, amount) * saturationMakeupGain(amount);
      expect(shaped).toBeCloseTo(1, 6);
    }
  });

  it("never attenuates — the curve only ever loses level", () => {
    for (let amount = 0; amount <= 1; amount += 0.1) {
      expect(saturationMakeupGain(amount)).toBeGreaterThanOrEqual(1);
    }
  });

  it("keeps the makeup-compensated curve inside [-1, 1]", () => {
    const amount = 0.7;
    const curve = buildSaturationCurve(amount, 512);
    const makeup = saturationMakeupGain(amount);
    const peak = curve.reduce((max, y) => Math.max(max, Math.abs(y * makeup)), 0);
    expect(peak).toBeLessThanOrEqual(1 + 1e-6);
  });
});
