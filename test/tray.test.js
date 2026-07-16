import { describe, expect, it } from "vitest";
import {
  addTrack,
  removeTrack,
  reorderTrack,
  totalDurationSeconds,
} from "../src/ui/tray.js";

const trackA = { id: "a", title: "A", durationSeconds: 120 };
const trackB = { id: "b", title: "B", durationSeconds: 180 };
const trackC = { id: "c", title: "C", durationSeconds: 90 };

describe("addTrack", () => {
  it("appends without mutating the original tray", () => {
    const tray = [trackA];
    const next = addTrack(tray, trackB);
    expect(tray).toHaveLength(1);
    expect(next).toEqual([trackA, trackB]);
  });
});

describe("removeTrack", () => {
  it("removes the track with the matching id", () => {
    expect(removeTrack([trackA, trackB], "a")).toEqual([trackB]);
  });

  it("is a no-op when the id isn't present", () => {
    expect(removeTrack([trackA], "missing")).toEqual([trackA]);
  });
});

describe("reorderTrack", () => {
  it("moves a track from one index to another", () => {
    expect(reorderTrack([trackA, trackB, trackC], 0, 2)).toEqual([
      trackB,
      trackC,
      trackA,
    ]);
  });

  it("ignores out-of-range indices", () => {
    const tray = [trackA, trackB];
    expect(reorderTrack(tray, 0, 5)).toEqual(tray);
    expect(reorderTrack(tray, -1, 1)).toEqual(tray);
  });
});

describe("totalDurationSeconds", () => {
  it("sums durations across the tray", () => {
    expect(totalDurationSeconds([trackA, trackB, trackC])).toBe(390);
  });

  it("returns 0 for an empty tray", () => {
    expect(totalDurationSeconds([])).toBe(0);
  });
});
