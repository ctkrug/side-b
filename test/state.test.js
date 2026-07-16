import { describe, expect, it } from "vitest";
import {
  DEFAULT_EFFECTS,
  createMixtape,
  createTrack,
  normalizeEffects,
  setTrackEffect,
  tapeProgress,
  totalDurationSeconds,
  trackAtElapsed,
} from "../src/mixtape/state.js";

const tape = () =>
  createMixtape({
    tracks: [
      { id: "a", title: "A", durationSeconds: 10 },
      { id: "b", title: "B", durationSeconds: 20 },
    ],
  });

describe("normalizeEffects", () => {
  it("keeps in-range values untouched", () => {
    expect(normalizeEffects({ wowFlutter: 0, saturation: 1, hiss: 0.5 })).toEqual(
      { wowFlutter: 0, saturation: 1, hiss: 0.5 },
    );
  });

  it("fills missing keys with defaults", () => {
    expect(normalizeEffects({})).toEqual({ ...DEFAULT_EFFECTS });
  });

  it("clamps values outside 0..1", () => {
    const result = normalizeEffects({ wowFlutter: 4, saturation: -2, hiss: 0.5 });
    expect(result.wowFlutter).toBe(1);
    expect(result.saturation).toBe(0);
  });

  it("falls back to defaults for non-finite values", () => {
    const result = normalizeEffects({ wowFlutter: NaN, saturation: Infinity });
    expect(result.wowFlutter).toBe(DEFAULT_EFFECTS.wowFlutter);
    expect(result.saturation).toBe(DEFAULT_EFFECTS.saturation);
  });

  it("ignores unknown keys", () => {
    expect(normalizeEffects({ bogus: 9 })).toEqual({ ...DEFAULT_EFFECTS });
  });
});

describe("createTrack", () => {
  it("defaults a blank title to Untitled", () => {
    expect(createTrack({ title: "   " }).title).toBe("Untitled");
    expect(createTrack({}).title).toBe("Untitled");
  });

  it("trims titles", () => {
    expect(createTrack({ title: "  Tape Loop  " }).title).toBe("Tape Loop");
  });

  it("generates a unique id when none is supplied", () => {
    expect(createTrack({}).id).not.toBe(createTrack({}).id);
  });

  it("rejects negative and non-finite durations", () => {
    expect(createTrack({ durationSeconds: -5 }).durationSeconds).toBe(0);
    expect(createTrack({ durationSeconds: NaN }).durationSeconds).toBe(0);
  });

  it("only accepts sample or file as a source", () => {
    expect(createTrack({ source: "sample" }).source).toBe("sample");
    expect(createTrack({ source: "spotify" }).source).toBe("file");
  });
});

describe("setTrackEffect", () => {
  it("updates only the named track", () => {
    const next = setTrackEffect(tape(), "b", "saturation", 0.9);
    expect(next.tracks[1].effects.saturation).toBe(0.9);
    expect(next.tracks[0].effects.saturation).toBe(DEFAULT_EFFECTS.saturation);
  });

  it("clamps the written value", () => {
    const next = setTrackEffect(tape(), "a", "hiss", 12);
    expect(next.tracks[0].effects.hiss).toBe(1);
  });

  it("is a no-op for an unknown track id", () => {
    const before = tape();
    expect(setTrackEffect(before, "nope", "hiss", 1)).toBe(before);
  });

  it("is a no-op for an unknown effect key", () => {
    const before = tape();
    expect(setTrackEffect(before, "a", "reverb", 1)).toBe(before);
  });

  it("does not mutate the input mixtape", () => {
    const before = tape();
    setTrackEffect(before, "a", "hiss", 1);
    expect(before.tracks[0].effects.hiss).toBe(DEFAULT_EFFECTS.hiss);
  });
});

describe("totalDurationSeconds", () => {
  it("sums track durations", () => {
    expect(totalDurationSeconds(tape())).toBe(30);
  });

  it("is zero for an empty tape", () => {
    expect(totalDurationSeconds(createMixtape())).toBe(0);
  });
});

describe("trackAtElapsed", () => {
  it("finds the first track at the start of the tape", () => {
    expect(trackAtElapsed(tape(), 0)).toMatchObject({
      index: 0,
      offsetSeconds: 0,
    });
  });

  it("crosses into the next track at the boundary", () => {
    expect(trackAtElapsed(tape(), 10)).toMatchObject({
      index: 1,
      offsetSeconds: 0,
    });
    expect(trackAtElapsed(tape(), 9.999)).toMatchObject({ index: 0 });
  });

  it("reports the offset within the found track", () => {
    expect(trackAtElapsed(tape(), 25).offsetSeconds).toBeCloseTo(15);
  });

  it("returns null past the end of the tape", () => {
    expect(trackAtElapsed(tape(), 30)).toBeNull();
    expect(trackAtElapsed(tape(), 1000)).toBeNull();
  });

  it("returns null for an empty tape or bad input", () => {
    expect(trackAtElapsed(createMixtape(), 0)).toBeNull();
    expect(trackAtElapsed(tape(), -1)).toBeNull();
    expect(trackAtElapsed(tape(), NaN)).toBeNull();
  });
});

describe("tapeProgress", () => {
  it("maps elapsed time onto 0..1", () => {
    expect(tapeProgress(tape(), 15)).toBeCloseTo(0.5);
  });

  it("clamps rather than overshooting", () => {
    expect(tapeProgress(tape(), 999)).toBe(1);
    expect(tapeProgress(tape(), -5)).toBe(0);
  });

  it("is 0 (not NaN) for an empty tape", () => {
    expect(tapeProgress(createMixtape(), 5)).toBe(0);
  });

  // The reel renderer feeds this straight into canvas geometry, and a
  // non-finite radius throws there — taking the animation loop with it.
  it.each([[NaN], [undefined], ["halfway"], [null]])(
    "is 0 (not NaN) for the playhead %p",
    (elapsed) => {
      expect(tapeProgress(tape(), elapsed)).toBe(0);
    },
  );

  it("is 1 for an infinite playhead", () => {
    expect(tapeProgress(tape(), Infinity)).toBe(1);
  });
});
