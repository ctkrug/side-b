import { describe, expect, it } from "vitest";
import {
  generateTone,
  harmonicDistortion,
  peak,
  rms,
} from "../src/audio/analysis.js";
import { saturationMakeupGain, softClipSample } from "../src/audio/saturation.js";
import { delaySecondsAt } from "../src/audio/tapeChain.js";

/**
 * Acceptance tests for the tape chain's *character* (stories 1.1 and 1.3).
 * The graph tests prove the nodes are wired up; these prove the wiring
 * actually produces tape-like behaviour, by measuring the audio.
 *
 * They model the same signal path the graph builds — dry/wet saturation
 * crossfade with makeup gain — offline, since Node has no Web Audio.
 */

const SAMPLE_RATE = 44100;
const FUNDAMENTAL = 1000;

function saturate(samples, amount) {
  const makeup = saturationMakeupGain(amount);
  return samples.map(
    (sample) =>
      sample * (1 - amount) + softClipSample(sample, amount) * makeup * amount,
  );
}

describe("saturation character", () => {
  const tone = generateTone(FUNDAMENTAL, 0.25, SAMPLE_RATE, 0.5);

  // Story 1.3: amount 0 leaves the signal within 1% RMS of the input.
  it("is transparent at amount 0", () => {
    const output = saturate(tone, 0);
    const delta = Math.abs(rms(output) - rms(tone)) / rms(tone);
    expect(delta).toBeLessThan(0.01);
  });

  it("adds no harmonics at amount 0", () => {
    expect(harmonicDistortion(saturate(tone, 0), FUNDAMENTAL, SAMPLE_RATE)).toBeCloseTo(
      harmonicDistortion(tone, FUNDAMENTAL, SAMPLE_RATE),
      4,
    );
  });

  // Story 1.3: driving 0 → 1 audibly increases harmonic content.
  it("increases harmonic content monotonically as drive rises", () => {
    const readings = [0, 0.25, 0.5, 0.75, 1].map((amount) =>
      harmonicDistortion(saturate(tone, amount), FUNDAMENTAL, SAMPLE_RATE),
    );
    for (let i = 1; i < readings.length; i++) {
      expect(readings[i]).toBeGreaterThan(readings[i - 1]);
    }
  });

  it("produces substantial harmonic content at full drive", () => {
    expect(
      harmonicDistortion(saturate(tone, 1), FUNDAMENTAL, SAMPLE_RATE),
    ).toBeGreaterThan(0.1);
  });

  it("keeps a full-scale input from clipping at any drive", () => {
    const hot = generateTone(FUNDAMENTAL, 0.1, SAMPLE_RATE, 1);
    for (const amount of [0, 0.3, 0.6, 1]) {
      expect(peak(saturate(hot, amount))).toBeLessThanOrEqual(1 + 1e-6);
    }
  });

  it("compresses: it lifts a quiet signal more than a loud one", () => {
    const quiet = generateTone(FUNDAMENTAL, 0.1, SAMPLE_RATE, 0.1);
    const loud = generateTone(FUNDAMENTAL, 0.1, SAMPLE_RATE, 0.9);
    const lift = (input) => rms(saturate(input, 0.8)) / rms(input);
    expect(lift(quiet)).toBeGreaterThan(lift(loud));
  });
});

describe("the tape chain versus a plain gain change", () => {
  const tone = generateTone(FUNDAMENTAL, 0.25, SAMPLE_RATE, 0.5);

  // Story 1.1: engaged vs bypassed must differ measurably, and by more
  // than level alone — otherwise it is a volume knob, not a tape machine.
  it("changes the spectrum, which a gain change cannot", () => {
    const engaged = saturate(tone, 0.6);
    const louder = tone.map((s) => s * 1.5);
    const clean = harmonicDistortion(tone, FUNDAMENTAL, SAMPLE_RATE);

    expect(harmonicDistortion(louder, FUNDAMENTAL, SAMPLE_RATE)).toBeCloseTo(clean, 4);
    expect(harmonicDistortion(engaged, FUNDAMENTAL, SAMPLE_RATE)).toBeGreaterThan(
      clean + 0.01,
    );
  });

  it("differs from the source even after matching levels", () => {
    const engaged = saturate(tone, 0.7);
    const matched = engaged.map((s) => s * (rms(tone) / rms(engaged)));
    let difference = 0;
    for (let i = 0; i < tone.length; i++) {
      difference = Math.max(difference, Math.abs(matched[i] - tone[i]));
    }
    expect(difference).toBeGreaterThan(0.01);
  });
});

describe("wow and flutter character", () => {
  // Story 1.2: depth 0 makes the delay line a pass-through.
  it("holds delay constant at depth 0, so pitch is untouched", () => {
    const readings = [];
    for (let t = 0; t < 2; t += 0.01) {
      readings.push(delaySecondsAt(t, 0));
    }
    expect(new Set(readings).size).toBe(1);
  });

  it("sweeps the delay line continuously — no jumps that would click", () => {
    let previous = delaySecondsAt(0, 1);
    for (let t = 1 / 60; t < 2; t += 1 / 60) {
      const current = delaySecondsAt(t, 1);
      // A frame-to-frame step under 1ms keeps the pitch shift musical.
      expect(Math.abs(current - previous)).toBeLessThan(0.001);
      previous = current;
    }
  });

  it("keeps the wobble within the delay line's headroom", () => {
    for (let t = 0; t < 5; t += 0.005) {
      const delay = delaySecondsAt(t, 1);
      expect(delay).toBeGreaterThan(0);
      expect(delay).toBeLessThan(1);
    }
  });
});
