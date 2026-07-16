import { describe, expect, it } from "vitest";
import {
  SAFE_URL_LENGTH,
  ShareLinkError,
  buildShareUrl,
  decodeMixtape,
  encodeMixtape,
  isShareUrlSafe,
  readMixtapeFromUrl,
} from "../src/mixtape/shareLink.js";
import { DEFAULT_EFFECTS, createMixtape } from "../src/mixtape/state.js";
import { COVER_COLORS, createCover, quantize } from "../src/ui/doodle.js";

const HREF = "https://apps.charliekrug.com/side-b/";

const tape = (overrides = {}) =>
  createMixtape({
    title: "Songs for the drive home",
    tracks: [
      {
        id: "t1",
        title: "Moonlit Drive",
        source: "sample",
        sampleId: "moonlit-drive",
        durationSeconds: 12,
        effects: { wowFlutter: 0.5, saturation: 0.25, hiss: 0.75 },
      },
      {
        id: "t2",
        title: "Porch Light",
        source: "sample",
        sampleId: "porch-light",
        durationSeconds: 12,
      },
    ],
    ...overrides,
  });

const coverOf = (points) =>
  createCover([{ color: COVER_COLORS[1], width: 3, points }]);

describe("encodeMixtape", () => {
  it("produces a URL-safe string with no +, / or = characters", () => {
    const encoded = encodeMixtape(tape({ title: "édition spéciale / test+data" }));
    expect(encoded).not.toMatch(/[+/=]/);
  });

  it("rejects a non-mixtape rather than encoding nonsense", () => {
    expect(() => encodeMixtape(null)).toThrow(ShareLinkError);
    expect(() => encodeMixtape({})).toThrow(ShareLinkError);
  });
});

describe("round-trip", () => {
  // Story 3.2: tracks, per-track effects and cover art round-trip losslessly.
  it("restores the title, tracks and every effect setting", () => {
    const original = tape();
    expect(decodeMixtape(encodeMixtape(original))).toEqual(original);
  });

  it("restores a cover doodle", () => {
    const original = tape({
      cover: coverOf([
        { x: 0.1, y: 0.2 },
        { x: 0.3, y: 0.45 },
      ]),
    });
    expect(decodeMixtape(encodeMixtape(original))).toEqual(original);
  });

  it("round-trips unicode in the tape and track titles", () => {
    const original = tape({ title: "🎵 mixtape für dich 🎶" });
    expect(decodeMixtape(encodeMixtape(original)).title).toBe("🎵 mixtape für dich 🎶");
  });

  it("keeps each track's effects attached to that track", () => {
    const decoded = decodeMixtape(encodeMixtape(tape()));
    expect(decoded.tracks[0].effects).toEqual({
      wowFlutter: 0.5,
      saturation: 0.25,
      hiss: 0.75,
    });
    expect(decoded.tracks[1].effects).toEqual({ ...DEFAULT_EFFECTS });
  });

  it("preserves track order", () => {
    const decoded = decodeMixtape(encodeMixtape(tape()));
    expect(decoded.tracks.map((track) => track.id)).toEqual(["t1", "t2"]);
  });

  it("round-trips a tape with no cover", () => {
    expect(decodeMixtape(encodeMixtape(tape())).cover).toBeNull();
  });

  it("round-trips a single-track tape", () => {
    const original = createMixtape({
      tracks: [{ id: "solo", title: "Solo", durationSeconds: 5 }],
    });
    expect(decodeMixtape(encodeMixtape(original))).toEqual(original);
  });
});

describe("decodeMixtape error handling", () => {
  // Story 3.4: a corrupt payload gets a designed error, never a stack trace.
  it("rejects an empty or non-string payload", () => {
    expect(() => decodeMixtape("")).toThrow(ShareLinkError);
    expect(() => decodeMixtape(null)).toThrow(ShareLinkError);
    expect(() => decodeMixtape(42)).toThrow(ShareLinkError);
  });

  it("rejects a payload that is not valid base64 or JSON", () => {
    expect(() => decodeMixtape("!!!not-base64!!!")).toThrow(ShareLinkError);
    expect(() => decodeMixtape(btoa("this is not json"))).toThrow(ShareLinkError);
  });

  it("rejects a truncated payload", () => {
    const encoded = encodeMixtape(tape());
    expect(() => decodeMixtape(encoded.slice(0, encoded.length / 2))).toThrow(
      ShareLinkError,
    );
  });

  it("rejects JSON that is not a mixtape", () => {
    expect(() => decodeMixtape(btoa(JSON.stringify({ hello: "world" })))).toThrow(
      ShareLinkError,
    );
    expect(() => decodeMixtape(btoa(JSON.stringify([1, 2, 3])))).toThrow(
      ShareLinkError,
    );
  });

  it("rejects a payload from an unknown version", () => {
    expect(() => decodeMixtape(btoa(JSON.stringify({ v: 99, k: [{}] })))).toThrow(
      /different version/,
    );
  });

  it("rejects a tape with no tracks", () => {
    expect(() => decodeMixtape(btoa(JSON.stringify({ v: 1, k: [] })))).toThrow(
      /no tracks/,
    );
  });

  it("always throws ShareLinkError, never a raw TypeError", () => {
    for (const bad of ["", "%%%", btoa("{"), btoa("[]"), null, undefined, {}]) {
      expect(() => decodeMixtape(bad)).toThrow(ShareLinkError);
    }
  });

  it("repairs hostile effect values instead of failing the whole tape", () => {
    const payload = {
      v: 1,
      k: [{ i: "x", n: "X", d: 10, e: [99, -99, "banana"] }],
    };
    const decoded = decodeMixtape(btoa(JSON.stringify(payload)));
    expect(decoded.tracks[0].effects.wowFlutter).toBe(1);
    expect(decoded.tracks[0].effects.saturation).toBe(0);
    expect(decoded.tracks[0].effects.hiss).toBe(DEFAULT_EFFECTS.hiss);
  });

  it("repairs a hostile duration", () => {
    const payload = { v: 1, k: [{ i: "x", n: "X", d: -5, e: [0, 0, 0] }] };
    expect(decodeMixtape(btoa(JSON.stringify(payload))).tracks[0].durationSeconds).toBe(
      0,
    );
  });

  it("skips malformed track entries but keeps the good ones", () => {
    const payload = {
      v: 1,
      k: [null, "nope", { i: "good", n: "Good", d: 10, e: [0.5, 0.5, 0.5] }],
    };
    expect(decodeMixtape(btoa(JSON.stringify(payload))).tracks).toHaveLength(1);
  });

  it("survives a cover that is not an array", () => {
    const payload = {
      v: 1,
      k: [{ i: "x", n: "X", d: 10, e: [0, 0, 0] }],
      c: "corrupt",
    };
    expect(decodeMixtape(btoa(JSON.stringify(payload))).cover).toBeNull();
  });
});

describe("buildShareUrl and readMixtapeFromUrl", () => {
  it("round-trips a mixtape through a URL", () => {
    const original = tape();
    expect(readMixtapeFromUrl(buildShareUrl(original, HREF))).toEqual(original);
  });

  it("keeps the page path, so the app still loads from its subpath", () => {
    const url = new URL(buildShareUrl(tape(), HREF));
    expect(url.pathname).toBe("/side-b/");
    expect(url.origin).toBe("https://apps.charliekrug.com");
  });

  it("puts the tape in the hash, so it never reaches a server", () => {
    const url = new URL(buildShareUrl(tape(), HREF));
    expect(url.hash.startsWith("#tape=")).toBe(true);
    expect(url.search).toBe("");
  });

  it("returns null for an ordinary first visit with no tape", () => {
    expect(readMixtapeFromUrl(HREF)).toBeNull();
    expect(readMixtapeFromUrl(`${HREF}#`)).toBeNull();
  });

  it("returns null for a hash that is not a tape", () => {
    expect(readMixtapeFromUrl(`${HREF}#about`)).toBeNull();
  });

  it("throws for a hash that has a broken tape in it", () => {
    expect(() => readMixtapeFromUrl(`${HREF}#tape=garbage!!`)).toThrow(ShareLinkError);
  });

  it("survives a share URL that already had a hash", () => {
    const url = buildShareUrl(tape(), `${HREF}#something-else`);
    expect(readMixtapeFromUrl(url)).toEqual(tape());
  });
});

describe("URL length budget", () => {
  // Story 3.2: 3 tracks + effects + a cover must fit a real URL.
  it("keeps a three-track tape with a modest doodle inside the budget", () => {
    const doodled = tape({
      cover: createCover(
        Array.from({ length: 6 }, (_, s) => ({
          color: COVER_COLORS[s % COVER_COLORS.length],
          width: 3,
          points: Array.from({ length: 12 }, (_, i) => ({
            x: quantize(i / 12),
            y: quantize(s / 6),
          })),
        })),
      ),
    });
    const url = buildShareUrl(doodled, HREF);
    expect(isShareUrlSafe(url)).toBe(true);
  });

  it("keeps a bare three-track tape far inside the budget", () => {
    expect(buildShareUrl(tape(), HREF).length).toBeLessThan(SAFE_URL_LENGTH / 2);
  });

  it("reports an over-budget URL rather than silently truncating it", () => {
    const huge = tape({
      cover: createCover(
        Array.from({ length: 60 }, (_, s) => ({
          color: COVER_COLORS[0],
          width: 3,
          points: Array.from({ length: 60 }, (_, i) => ({
            x: quantize((i % 30) / 30),
            y: quantize(s / 60),
          })),
        })),
      ),
    });
    const url = buildShareUrl(huge, HREF);
    expect(url.length).toBeGreaterThan(SAFE_URL_LENGTH);
    expect(isShareUrlSafe(url)).toBe(false);
    // Over budget still decodes — the limit is browser-practical, not ours.
    expect(readMixtapeFromUrl(url)).toEqual(huge);
  });
});
