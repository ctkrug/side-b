import { describe, expect, it } from "vitest";
import { decodeMixtape, encodeMixtape } from "../src/mixtape/shareLink.js";

describe("encodeMixtape / decodeMixtape", () => {
  it("round-trips a mixtape state", () => {
    const state = {
      title: "Side B",
      tracks: [{ id: "a", title: "Track A" }],
      tapeEffects: { wow: 0.4, hiss: 0.2 },
    };
    expect(decodeMixtape(encodeMixtape(state))).toEqual(state);
  });

  it("produces a URL-safe string with no +, /, or = characters", () => {
    const encoded = encodeMixtape({ title: "édition spéciale / test+data" });
    expect(encoded).not.toMatch(/[+/=]/);
  });

  it("round-trips unicode characters", () => {
    const state = { title: "🎵 mixtape für dich 🎶" };
    expect(decodeMixtape(encodeMixtape(state))).toEqual(state);
  });
});
