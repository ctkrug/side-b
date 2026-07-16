import { describe, expect, it } from "vitest";
import {
  IDLE_RPM,
  PLAY_RPM,
  advanceAngle,
  normalizeAngle,
  reelRpm,
  supplyReelRadiusRatio,
  takeUpReelRadiusRatio,
} from "../src/ui/cassette.js";

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

describe("supplyReelRadiusRatio", () => {
  it("mirrors the take-up reel", () => {
    for (const progress of [0, 0.25, 0.5, 0.75, 1]) {
      expect(supplyReelRadiusRatio(progress)).toBeCloseTo(
        takeUpReelRadiusRatio(1 - progress),
      );
    }
  });

  it("is full at the start and empty at the end", () => {
    expect(supplyReelRadiusRatio(0)).toBeCloseTo(1);
    expect(supplyReelRadiusRatio(1)).toBeCloseTo(0.35);
  });

  it("shrinks as the take-up reel grows — tape has to go somewhere", () => {
    let previous = supplyReelRadiusRatio(0);
    for (let p = 0.1; p <= 1; p += 0.1) {
      const current = supplyReelRadiusRatio(p);
      expect(current).toBeLessThan(previous);
      previous = current;
    }
  });
});

describe("reelRpm", () => {
  it("spins slower as the reel fills", () => {
    expect(reelRpm(1)).toBeLessThan(reelRpm(0.35));
  });

  it("is inversely proportional to radius", () => {
    expect(reelRpm(0.5, 30)).toBeCloseTo(60);
    expect(reelRpm(1, 30)).toBeCloseTo(30);
  });

  it("is zero for a zero or nonsense radius rather than infinite", () => {
    expect(reelRpm(0)).toBe(0);
    expect(reelRpm(-1)).toBe(0);
    expect(reelRpm(NaN)).toBe(0);
  });

  it("idles far slower than it plays", () => {
    expect(reelRpm(0.5, IDLE_RPM)).toBeLessThan(reelRpm(0.5, PLAY_RPM) / 10);
  });
});

describe("advanceAngle", () => {
  it("advances by the expected angle for a full revolution", () => {
    // 60rpm = one revolution per second.
    expect(advanceAngle(0, 60, 1)).toBeCloseTo(0);
    expect(advanceAngle(0, 60, 0.5)).toBeCloseTo(Math.PI);
  });

  it("accumulates across frames", () => {
    let angle = 0;
    for (let i = 0; i < 4; i++) {
      angle = advanceAngle(angle, 60, 0.125);
    }
    expect(angle).toBeCloseTo(Math.PI);
  });

  it("stays within one revolution", () => {
    let angle = 0;
    for (let i = 0; i < 200; i++) {
      angle = advanceAngle(angle, 300, 1 / 60);
      expect(angle).toBeGreaterThanOrEqual(0);
      expect(angle).toBeLessThan(Math.PI * 2);
    }
  });

  it("does not move on a zero, negative or nonsense frame time", () => {
    expect(advanceAngle(1, 60, 0)).toBeCloseTo(1);
    expect(advanceAngle(1, 60, -1)).toBeCloseTo(1);
    expect(advanceAngle(1, 60, NaN)).toBeCloseTo(1);
  });

  it("does not move at zero rpm", () => {
    expect(advanceAngle(1, 0, 1)).toBeCloseTo(1);
  });
});

describe("normalizeAngle", () => {
  it("wraps angles into a single revolution", () => {
    expect(normalizeAngle(Math.PI * 2)).toBeCloseTo(0);
    expect(normalizeAngle(Math.PI * 3)).toBeCloseTo(Math.PI);
  });

  it("maps negative angles into the positive range", () => {
    expect(normalizeAngle(-Math.PI)).toBeCloseTo(Math.PI);
  });

  it("recovers from a non-finite angle rather than propagating NaN", () => {
    expect(normalizeAngle(NaN)).toBe(0);
    expect(normalizeAngle(Infinity)).toBe(0);
  });
});
