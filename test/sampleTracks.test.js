import { describe, expect, it } from "vitest";
import {
  SAMPLE_TRACKS,
  findSampleTrack,
  noteFrequency,
  pluckEnvelope,
  renderSampleTrack,
} from "../src/audio/sampleTracks.js";

describe("noteFrequency", () => {
  it("anchors A4 at 440Hz", () => {
    expect(noteFrequency(0)).toBeCloseTo(440);
  });

  it("doubles an octave up and halves an octave down", () => {
    expect(noteFrequency(12)).toBeCloseTo(880);
    expect(noteFrequency(-12)).toBeCloseTo(220);
  });
});

describe("pluckEnvelope", () => {
  it("is silent outside the note's lifetime", () => {
    expect(pluckEnvelope(-0.1, 1)).toBe(0);
    expect(pluckEnvelope(1.1, 1)).toBe(0);
  });

  it("rises from zero to full over the attack", () => {
    expect(pluckEnvelope(0, 1, 0.01)).toBe(0);
    expect(pluckEnvelope(0.01, 1, 0.01)).toBeCloseTo(1);
  });

  it("decays monotonically after the attack", () => {
    const early = pluckEnvelope(0.1, 1);
    const late = pluckEnvelope(0.8, 1);
    expect(late).toBeLessThan(early);
    expect(late).toBeGreaterThan(0);
  });

  it("never leaves the 0..1 range", () => {
    for (let t = 0; t <= 1; t += 0.01) {
      const value = pluckEnvelope(t, 1);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(1);
    }
  });
});

describe("findSampleTrack", () => {
  it("finds a track by id", () => {
    expect(findSampleTrack("porch-light")?.title).toBe("Porch Light");
  });

  it("returns null for an unknown id", () => {
    expect(findSampleTrack("nope")).toBeNull();
    expect(findSampleTrack(undefined)).toBeNull();
  });
});

describe("SAMPLE_TRACKS", () => {
  it("have unique ids", () => {
    const ids = SAMPLE_TRACKS.map((track) => track.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("all declare a positive duration and bpm", () => {
    for (const track of SAMPLE_TRACKS) {
      expect(track.durationSeconds).toBeGreaterThan(0);
      expect(track.bpm).toBeGreaterThan(0);
    }
  });
});

describe("renderSampleTrack", () => {
  const spec = SAMPLE_TRACKS[0];
  const sampleRate = 8000;

  it("renders the requested number of samples", () => {
    const pcm = renderSampleTrack(spec, sampleRate);
    expect(pcm).toBeInstanceOf(Float32Array);
    expect(pcm.length).toBe(spec.durationSeconds * sampleRate);
  });

  const peakOf = (pcm) => pcm.reduce((max, s) => Math.max(max, Math.abs(s)), 0);

  it("stays within [-1, 1] so it cannot clip before the tape chain", () => {
    expect(peakOf(renderSampleTrack(spec, sampleRate))).toBeLessThanOrEqual(1);
  });

  it("is not silent", () => {
    expect(peakOf(renderSampleTrack(spec, sampleRate))).toBeGreaterThan(0.1);
  });

  it("renders every built-in track without clipping or silence", () => {
    for (const track of SAMPLE_TRACKS) {
      const peak = peakOf(renderSampleTrack(track, sampleRate));
      expect(peak).toBeGreaterThan(0.1);
      expect(peak).toBeLessThanOrEqual(1);
    }
  });

  it("is deterministic — the same spec renders identical audio", () => {
    expect(Array.from(renderSampleTrack(spec, sampleRate))).toEqual(
      Array.from(renderSampleTrack(spec, sampleRate)),
    );
  });

  it("renders each sample track distinctly", () => {
    const first = renderSampleTrack(SAMPLE_TRACKS[0], sampleRate);
    const second = renderSampleTrack(SAMPLE_TRACKS[1], sampleRate);
    expect(Array.from(first)).not.toEqual(Array.from(second));
  });

  it("fades in and out so stopping never clicks", () => {
    const pcm = renderSampleTrack(spec, sampleRate);
    expect(Math.abs(pcm[0])).toBeLessThan(0.001);
    expect(Math.abs(pcm[pcm.length - 1])).toBeLessThan(0.001);
  });

  it("throws on a missing spec or a non-positive sample rate", () => {
    expect(() => renderSampleTrack(null, 44100)).toThrow(TypeError);
    expect(() => renderSampleTrack(spec, 0)).toThrow(TypeError);
  });
});
