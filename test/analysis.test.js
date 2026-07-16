import { describe, expect, it } from "vitest";
import {
  generateTone,
  goertzelMagnitude,
  harmonicDistortion,
  peak,
  rms,
} from "../src/audio/analysis.js";

const SAMPLE_RATE = 44100;

describe("rms", () => {
  it("is zero for silence and for an empty buffer", () => {
    expect(rms(new Float32Array(100))).toBe(0);
    expect(rms(new Float32Array(0))).toBe(0);
  });

  it("equals the amplitude of a DC signal", () => {
    expect(rms(new Float32Array(50).fill(0.5))).toBeCloseTo(0.5);
  });

  it("is amplitude/sqrt(2) for a sine", () => {
    const tone = generateTone(1000, 0.5, SAMPLE_RATE, 1);
    expect(rms(tone)).toBeCloseTo(1 / Math.SQRT2, 2);
  });
});

describe("peak", () => {
  it("finds the largest magnitude regardless of sign", () => {
    expect(peak(new Float32Array([0.1, -0.9, 0.3]))).toBeCloseTo(0.9);
  });

  it("is zero for an empty buffer", () => {
    expect(peak(new Float32Array(0))).toBe(0);
  });
});

describe("generateTone", () => {
  it("renders the requested length and amplitude", () => {
    const tone = generateTone(440, 0.25, SAMPLE_RATE, 0.5);
    expect(tone.length).toBe(SAMPLE_RATE * 0.25);
    expect(peak(tone)).toBeCloseTo(0.5, 2);
  });
});

describe("goertzelMagnitude", () => {
  it("recovers the amplitude of a tone at its own frequency", () => {
    const tone = generateTone(1000, 0.5, SAMPLE_RATE, 0.5);
    expect(goertzelMagnitude(tone, 1000, SAMPLE_RATE)).toBeCloseTo(0.5, 2);
  });

  it("reads near zero at a frequency the signal does not contain", () => {
    const tone = generateTone(1000, 0.5, SAMPLE_RATE, 0.5);
    expect(goertzelMagnitude(tone, 5000, SAMPLE_RATE)).toBeLessThan(0.01);
  });

  it("is zero for silence", () => {
    expect(goertzelMagnitude(new Float32Array(1000), 1000, SAMPLE_RATE)).toBeCloseTo(
      0,
      6,
    );
  });

  it("guards against an empty buffer or a bad sample rate", () => {
    expect(goertzelMagnitude(new Float32Array(0), 1000, SAMPLE_RATE)).toBe(0);
    expect(goertzelMagnitude(generateTone(1000, 0.1, SAMPLE_RATE), 1000, 0)).toBe(0);
  });
});

describe("harmonicDistortion", () => {
  it("is near zero for a pure sine", () => {
    const tone = generateTone(1000, 0.5, SAMPLE_RATE, 0.5);
    expect(harmonicDistortion(tone, 1000, SAMPLE_RATE)).toBeLessThan(0.01);
  });

  it("is unchanged by a pure gain change", () => {
    const tone = generateTone(1000, 0.5, SAMPLE_RATE, 0.4);
    const louder = tone.map((s) => s * 2);
    expect(harmonicDistortion(louder, 1000, SAMPLE_RATE)).toBeCloseTo(
      harmonicDistortion(tone, 1000, SAMPLE_RATE),
      4,
    );
  });

  it("rises when harmonics are added", () => {
    const tone = generateTone(1000, 0.5, SAMPLE_RATE, 0.5);
    const third = generateTone(3000, 0.5, SAMPLE_RATE, 0.2);
    const dirty = tone.map((s, i) => s + third[i]);
    expect(harmonicDistortion(dirty, 1000, SAMPLE_RATE)).toBeGreaterThan(0.3);
  });

  it("is zero when the fundamental is absent", () => {
    expect(harmonicDistortion(new Float32Array(1000), 1000, SAMPLE_RATE)).toBe(0);
  });
});
