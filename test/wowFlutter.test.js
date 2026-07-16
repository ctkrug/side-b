import { describe, expect, it } from "vitest";
import { wowFlutterOffsetMs } from "../src/audio/wowFlutter.js";

describe("wowFlutterOffsetMs", () => {
  it("returns zero offset at t=0 (both LFOs start at their zero crossing)", () => {
    expect(wowFlutterOffsetMs(0)).toBeCloseTo(0);
  });

  it("stays within the combined depth of the wow and flutter LFOs", () => {
    const params = {
      wowRateHz: 0.8,
      wowDepthMs: 3,
      flutterRateHz: 6,
      flutterDepthMs: 0.4,
    };
    const maxOffset = params.wowDepthMs + params.flutterDepthMs;
    for (let t = 0; t < 5; t += 0.01) {
      const offset = wowFlutterOffsetMs(t, params);
      expect(Math.abs(offset)).toBeLessThanOrEqual(maxOffset + 1e-9);
    }
  });

  it("is periodic with the wow rate when flutter depth is zero", () => {
    const params = {
      wowRateHz: 1,
      wowDepthMs: 2,
      flutterRateHz: 6,
      flutterDepthMs: 0,
    };
    expect(wowFlutterOffsetMs(0.25, params)).toBeCloseTo(
      wowFlutterOffsetMs(1.25, params),
    );
  });
});
