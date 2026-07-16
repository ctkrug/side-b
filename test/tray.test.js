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

  // An index arrives from a drag payload, which is a string a hostile page
  // can set to anything; a comparison against NaN is false either way.
  it.each([
    [NaN, 1],
    [0, NaN],
    [1.5, 0],
    [0, 1.5],
    ["a", 1],
    [undefined, 1],
  ])("ignores the non-integer index pair (%p, %p)", (from, to) => {
    const tray = [trackA, trackB, trackC];
    expect(reorderTrack(tray, from, to)).toBe(tray);
  });

  it("is a no-op when a track is dropped on itself", () => {
    const tray = [trackA, trackB];
    expect(reorderTrack(tray, 1, 1)).toBe(tray);
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
