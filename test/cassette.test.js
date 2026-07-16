import { describe, expect, it } from "vitest";
import { reelRotationRadians, takeUpReelRadiusRatio } from "../src/ui/cassette.js";

describe("reelRotationRadians", () => {
  it("returns 0 at t=0", () => {
    expect(reelRotationRadians(0, 33)).toBe(0);
  });

  it("wraps around after a full revolution", () => {
    const rpm = 60; // 1 revolution per second
    expect(reelRotationRadians(1, rpm)).toBeCloseTo(0, 5);
  });

  it("always stays within [0, 2π)", () => {
    for (let t = 0; t < 10; t += 0.37) {
      const angle = reelRotationRadians(t, 45);
      expect(angle).toBeGreaterThanOrEqual(0);
      expect(angle).toBeLessThan(Math.PI * 2);
    }
  });
});

describe("takeUpReelRadiusRatio", () => {
  it("starts at the minimum ratio when progress is 0", () => {
    expect(takeUpReelRadiusRatio(0, 0.35)).toBeCloseTo(0.35);
  });

  it("reaches 1 when progress is complete", () => {
    expect(takeUpReelRadiusRatio(1)).toBeCloseTo(1);
  });

  it("clamps out-of-range progress", () => {
    expect(takeUpReelRadiusRatio(-1)).toBeCloseTo(takeUpReelRadiusRatio(0));
    expect(takeUpReelRadiusRatio(2)).toBeCloseTo(takeUpReelRadiusRatio(1));
  });
});
