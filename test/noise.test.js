import { describe, expect, it } from "vitest";
import { generateWhiteNoise, mulberry32 } from "../src/audio/noise.js";

describe("generateWhiteNoise", () => {
  it("produces the requested number of samples", () => {
    expect(generateWhiteNoise(100, mulberry32(1))).toHaveLength(100);
  });

  it("stays within the [-1, 1] range", () => {
    const samples = generateWhiteNoise(2000, mulberry32(42));
    for (const sample of samples) {
      expect(sample).toBeGreaterThanOrEqual(-1);
      expect(sample).toBeLessThanOrEqual(1);
    }
  });
});

describe("mulberry32", () => {
  it("is deterministic for a given seed", () => {
    const a = mulberry32(7);
    const b = mulberry32(7);
    expect(a()).toBe(b());
    expect(a()).toBe(b());
  });

  it("produces different sequences for different seeds", () => {
    const a = mulberry32(1)();
    const b = mulberry32(2)();
    expect(a).not.toBe(b);
  });
});
