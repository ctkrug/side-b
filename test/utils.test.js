import { describe, expect, it } from "vitest";
import { clamp, dbToGain, lerp } from "../src/audio/utils.js";

describe("clamp", () => {
  it("keeps values inside the range unchanged", () => {
    expect(clamp(5, 0, 10)).toBe(5);
  });

  it("clamps values below the minimum", () => {
    expect(clamp(-5, 0, 10)).toBe(0);
  });

  it("clamps values above the maximum", () => {
    expect(clamp(15, 0, 10)).toBe(10);
  });
});

describe("lerp", () => {
  it("interpolates linearly between two values", () => {
    expect(lerp(0, 10, 0.5)).toBe(5);
  });

  it("returns the start value at t=0 and end value at t=1", () => {
    expect(lerp(2, 8, 0)).toBe(2);
    expect(lerp(2, 8, 1)).toBe(8);
  });
});

describe("dbToGain", () => {
  it("maps 0dB to unity gain", () => {
    expect(dbToGain(0)).toBeCloseTo(1);
  });

  it("maps -6dB to roughly half amplitude", () => {
    expect(dbToGain(-6)).toBeCloseTo(0.501, 2);
  });
});
