import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_EFFECTS,
  EFFECT_KEYS,
  createMixtape,
  normalizeEffects,
  tapeProgress,
  totalDurationSeconds,
  trackAtElapsed,
} from "../src/mixtape/state.js";
import { decodeMixtape, encodeMixtape } from "../src/mixtape/shareLink.js";
import { COVER_COLORS, packCover, quantize, unpackCover } from "../src/ui/doodle.js";
import { addTrack, removeTrack, reorderTrack } from "../src/ui/tray.js";
import { advanceAngle, normalizeAngle, reelRpm } from "../src/ui/cassette.js";
import { supplyReelRadiusRatio, takeUpReelRadiusRatio } from "../src/ui/cassette.js";
import { clamp } from "../src/audio/utils.js";
import { wowFlutterOffsetMs } from "../src/audio/wowFlutter.js";

/**
 * Properties, not examples. These state the invariants the rest of the app
 * leans on — a codec that round-trips, a playhead that stays inside the
 * tape, geometry that stays finite — and let fast-check hunt for the input
 * that breaks them. Example tests only ever check the cases we thought of.
 */

/** Anything a hostile link, a stray event or a bad number could carry. */
const anyValue = fc.oneof(
  fc.double(),
  fc.double({ noNaN: false, noDefaultInfinity: false }),
  fc.string(),
  fc.constant(null),
  fc.constant(undefined),
  fc.boolean(),
  fc.constant(NaN),
  fc.constant(Infinity),
  fc.constant(-Infinity),
);

/**
 * The codec quantizes effects and durations to two decimals on purpose — a
 * URL is a small container and the sliders resolve no finer. So the
 * round-trip properties generate what the app can actually produce; a
 * denormal effect amount is not a mixtape anyone can make.
 */
const twoDecimals = (max) => fc.integer({ min: 0, max: max * 100 }).map((n) => n / 100);

const trackArb = fc.record({
  id: fc.string({ minLength: 1, maxLength: 12 }),
  title: fc.string({ maxLength: 40 }),
  source: fc.constantFrom("sample", "file"),
  sampleId: fc.constantFrom("moonlit-drive", "basement-tape", "porch-light"),
  durationSeconds: twoDecimals(600),
  effects: fc.record(
    Object.fromEntries(EFFECT_KEYS.map((key) => [key, twoDecimals(1)])),
  ),
});

const mixtapeArb = fc.record({
  title: fc.string({ maxLength: 60 }),
  tracks: fc.array(trackArb, { minLength: 1, maxLength: 8 }),
});

const pointArb = fc.record({
  x: fc.double({ min: 0, max: 1, noNaN: true }).map(quantize),
  y: fc.double({ min: 0, max: 1, noNaN: true }).map(quantize),
});

const strokeArb = fc.record({
  color: fc.constantFrom(...COVER_COLORS),
  width: fc.integer({ min: 10, max: 240 }).map((w) => w / 10),
  points: fc.array(pointArb, { minLength: 1, maxLength: 20 }),
});

describe("normalizeEffects", () => {
  it("always lands inside 0..1, whatever it is handed", () => {
    fc.assert(
      fc.property(fc.dictionary(fc.string(), anyValue), (raw) => {
        const effects = normalizeEffects(raw);
        for (const key of EFFECT_KEYS) {
          expect(effects[key]).toBeGreaterThanOrEqual(0);
          expect(effects[key]).toBeLessThanOrEqual(1);
        }
      }),
    );
  });

  it("only ever reports the three known keys", () => {
    fc.assert(
      fc.property(fc.dictionary(fc.string(), anyValue), (raw) => {
        expect(Object.keys(normalizeEffects(raw)).sort()).toEqual(
          [...EFFECT_KEYS].sort(),
        );
      }),
    );
  });

  it("leaves an already-valid amount untouched", () => {
    fc.assert(
      fc.property(fc.double({ min: 0, max: 1, noNaN: true }), (value) => {
        expect(normalizeEffects({ hiss: value }).hiss).toBe(value);
        // The keys it was not given fall back to the defaults.
        expect(normalizeEffects({ hiss: value }).saturation).toBe(
          DEFAULT_EFFECTS.saturation,
        );
      }),
    );
  });
});

describe("the share-link codec", () => {
  // The one property the whole feature rests on: what a sender encodes is
  // what a recipient decodes.
  it("round-trips any mixtape it can encode", () => {
    fc.assert(
      fc.property(mixtapeArb, (raw) => {
        const tape = createMixtape(raw);
        expect(decodeMixtape(encodeMixtape(tape))).toEqual(tape);
      }),
    );
  });

  it("round-trips a mixtape with cover art", () => {
    fc.assert(
      fc.property(mixtapeArb, fc.array(strokeArb, { minLength: 1, maxLength: 6 }), (raw, strokes) => {
        const tape = createMixtape({ ...raw, cover: { strokes } });
        expect(decodeMixtape(encodeMixtape(tape))).toEqual(tape);
      }),
    );
  });

  it("never throws anything but a ShareLinkError on arbitrary text", () => {
    fc.assert(
      fc.property(fc.string(), (text) => {
        try {
          decodeMixtape(text);
        } catch (error) {
          expect(error.name).toBe("ShareLinkError");
        }
      }),
    );
  });

  it("never throws anything but a ShareLinkError on arbitrary JSON", () => {
    fc.assert(
      fc.property(fc.json(), (json) => {
        try {
          decodeMixtape(btoa(json));
        } catch (error) {
          expect(error.name).toBe("ShareLinkError");
        }
      }),
    );
  });
});

describe("the cover codec", () => {
  it("round-trips any drawable cover", () => {
    fc.assert(
      fc.property(fc.array(strokeArb, { minLength: 1, maxLength: 8 }), (strokes) => {
        const cover = { strokes };
        expect(unpackCover(packCover(cover))).toEqual(cover);
      }),
    );
  });

  it("yields only palette colours and drawable widths, whatever it unpacks", () => {
    const packedArb = fc.array(
      fc.record({ c: anyValue, w: anyValue, p: fc.array(anyValue, { maxLength: 12 }) }),
      { maxLength: 6 },
    );
    fc.assert(
      fc.property(packedArb, (packed) => {
        const cover = unpackCover(packed);
        for (const stroke of cover?.strokes ?? []) {
          expect(COVER_COLORS).toContain(stroke.color);
          expect(stroke.width).toBeGreaterThanOrEqual(1);
          expect(stroke.width).toBeLessThanOrEqual(24);
          for (const point of stroke.points) {
            // These become canvas coordinates, which throw on NaN.
            expect(Number.isFinite(point.x)).toBe(true);
            expect(Number.isFinite(point.y)).toBe(true);
          }
        }
      }),
    );
  });
});

describe("the playhead", () => {
  it("keeps tapeProgress inside 0..1 for any playhead", () => {
    fc.assert(
      fc.property(mixtapeArb, anyValue, (raw, elapsed) => {
        const progress = tapeProgress(createMixtape(raw), elapsed);
        expect(Number.isFinite(progress)).toBe(true);
        expect(progress).toBeGreaterThanOrEqual(0);
        expect(progress).toBeLessThanOrEqual(1);
      }),
    );
  });

  it("only ever reports a track the tape actually holds", () => {
    fc.assert(
      fc.property(mixtapeArb, fc.double({ min: 0, max: 5000, noNaN: true }), (raw, elapsed) => {
        const tape = createMixtape(raw);
        const at = trackAtElapsed(tape, elapsed);
        if (at === null) {
          // Past the end is the only reason to report nothing.
          expect(elapsed).toBeGreaterThanOrEqual(totalDurationSeconds(tape));
          return;
        }
        expect(tape.tracks[at.index]).toBe(at.track);
        expect(at.offsetSeconds).toBeGreaterThanOrEqual(0);
        expect(at.offsetSeconds).toBeLessThanOrEqual(at.track.durationSeconds);
      }),
    );
  });

  it("never reports a track for a nonsense playhead", () => {
    fc.assert(
      fc.property(
        mixtapeArb,
        fc.oneof(fc.constant(NaN), fc.constant(-Infinity), fc.double({ max: -0.001, noNaN: true })),
        (raw, elapsed) => {
          expect(trackAtElapsed(createMixtape(raw), elapsed)).toBeNull();
        },
      ),
    );
  });
});

describe("the tray", () => {
  const trayArb = fc.array(trackArb, { maxLength: 8 });

  // Compared by reference count rather than by sorting: a default sort
  // stringifies, which throws on a null-prototype object fast-check builds.
  const census = (tracks) => {
    const counts = new Map();
    for (const track of tracks) {
      counts.set(track, (counts.get(track) ?? 0) + 1);
    }
    return counts;
  };

  it("reorders without gaining, losing or duplicating a track", () => {
    fc.assert(
      fc.property(trayArb, fc.integer(), fc.integer(), (tray, from, to) => {
        const next = reorderTrack(tray, from, to);
        expect(next).toHaveLength(tray.length);
        expect(census(next)).toEqual(census(tray));
      }),
    );
  });

  it("never mutates the tray it was given", () => {
    fc.assert(
      fc.property(trayArb, fc.integer(), fc.integer(), (tray, from, to) => {
        const before = [...tray];
        reorderTrack(tray, from, to);
        removeTrack(tray, tray[0]?.id);
        addTrack(tray, { id: "new" });
        expect(tray).toEqual(before);
      }),
    );
  });

  it("removes exactly the matching track", () => {
    fc.assert(
      fc.property(trayArb, (tray) => {
        for (const track of tray) {
          expect(removeTrack(tray, track.id).some((t) => t.id === track.id)).toBe(false);
        }
      }),
    );
  });
});

describe("reel geometry", () => {
  it("keeps both reel radii inside the window at any progress", () => {
    fc.assert(
      fc.property(fc.double({ min: 0, max: 1, noNaN: true }), (progress) => {
        for (const ratio of [
          takeUpReelRadiusRatio(progress),
          supplyReelRadiusRatio(progress),
        ]) {
          expect(ratio).toBeGreaterThanOrEqual(0.35);
          expect(ratio).toBeLessThanOrEqual(1);
        }
      }),
    );
  });

  // Tape leaving one reel arrives on the other, so the pair is conserved.
  it("trades radius between the reels as the tape moves", () => {
    fc.assert(
      fc.property(fc.double({ min: 0, max: 1, noNaN: true }), (progress) => {
        expect(takeUpReelRadiusRatio(progress) + supplyReelRadiusRatio(progress)).toBeCloseTo(
          1.35,
          10,
        );
      }),
    );
  });

  it("turns a fuller reel more slowly than an emptier one", () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0.36, max: 1, noNaN: true }),
        fc.double({ min: 0.36, max: 1, noNaN: true }),
        (a, b) => {
          fc.pre(a < b);
          expect(reelRpm(a)).toBeGreaterThan(reelRpm(b));
        },
      ),
    );
  });

  it("keeps an integrated angle finite and inside one turn", () => {
    fc.assert(
      fc.property(anyValue, anyValue, anyValue, (angle, rpm, delta) => {
        const next = advanceAngle(angle, rpm, delta);
        expect(Number.isFinite(next)).toBe(true);
        expect(next).toBeGreaterThanOrEqual(0);
        expect(next).toBeLessThan(Math.PI * 2);
      }),
    );
  });

  it("normalizes any angle into one turn", () => {
    fc.assert(
      fc.property(anyValue, (angle) => {
        const wrapped = normalizeAngle(angle);
        expect(Number.isFinite(wrapped)).toBe(true);
        expect(wrapped).toBeGreaterThanOrEqual(0);
        expect(wrapped).toBeLessThan(Math.PI * 2);
      }),
    );
  });
});

describe("the tape's wobble", () => {
  const paramsArb = fc.record({
    wowRateHz: fc.double({ min: 0.1, max: 4, noNaN: true }),
    wowDepthMs: fc.double({ min: 0, max: 10, noNaN: true }),
    flutterRateHz: fc.double({ min: 1, max: 20, noNaN: true }),
    flutterDepthMs: fc.double({ min: 0, max: 4, noNaN: true }),
  });

  // The two LFOs sum, so the excursion can never exceed their depths
  // added together — that bound is what keeps the delay line positive.
  it("never swings wider than its two depths combined", () => {
    fc.assert(
      fc.property(fc.double({ min: 0, max: 600, noNaN: true }), paramsArb, (time, params) => {
        const offset = wowFlutterOffsetMs(time, params);
        expect(Number.isFinite(offset)).toBe(true);
        expect(Math.abs(offset)).toBeLessThanOrEqual(
          params.wowDepthMs + params.flutterDepthMs + 1e-9,
        );
      }),
    );
  });

  it("is perfectly still when both depths are 0", () => {
    fc.assert(
      fc.property(fc.double({ min: 0, max: 600, noNaN: true }), paramsArb, (time, params) => {
        // Math.abs, because a negative sine scaled by zero depth is -0:
        // numerically still, but not Object.is-equal to 0.
        expect(
          Math.abs(wowFlutterOffsetMs(time, { ...params, wowDepthMs: 0, flutterDepthMs: 0 })),
        ).toBe(0);
      }),
    );
  });

  // A delay line that ran backwards would click; the offset is what the
  // chain adds to its centre delay, so a bounded swing is the guarantee.
  it("keeps the default wobble inside the centre delay", () => {
    fc.assert(
      fc.property(fc.double({ min: 0, max: 600, noNaN: true }), (time) => {
        expect(Math.abs(wowFlutterOffsetMs(time))).toBeLessThanOrEqual(3.4 + 1e-9);
      }),
    );
  });
});

describe("clamp", () => {
  it("returns a value inside the range, and the bound otherwise", () => {
    fc.assert(
      fc.property(
        fc.double({ noNaN: true }),
        fc.double({ noNaN: true }),
        fc.double({ noNaN: true }),
        (value, a, b) => {
          const min = Math.min(a, b);
          const max = Math.max(a, b);
          const result = clamp(value, min, max);
          expect(result).toBeGreaterThanOrEqual(min);
          expect(result).toBeLessThanOrEqual(max);
          if (value >= min && value <= max) {
            expect(result).toBe(value);
          }
        },
      ),
    );
  });
});
