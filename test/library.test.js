import { describe, expect, it } from "vitest";
import {
  AudioLoadError,
  createLibrary,
  isAudioFile,
  titleFromFilename,
} from "../src/audio/library.js";
import { SAMPLE_TRACKS } from "../src/audio/sampleTracks.js";
import { createMixtape } from "../src/mixtape/state.js";
import { FakeAudioContext } from "./helpers/fakeAudioContext.js";

const SAMPLE_ID = SAMPLE_TRACKS[0].id;

/** A stand-in for a File: just arrayBuffer(), name and type. */
const fakeFile = (name, type = "audio/mpeg", { fails = false } = {}) => ({
  name,
  type,
  arrayBuffer: async () => {
    if (fails) {
      throw new Error("read failed");
    }
    return new ArrayBuffer(8);
  },
});

function build({ decodeFails = false } = {}) {
  // A low sample rate keeps sample-track synthesis cheap in tests.
  const context = new FakeAudioContext({ sampleRate: 8000 });
  context.decodeAudioData = async () => {
    if (decodeFails) {
      throw new Error("EncodingError");
    }
    const buffer = context.createBuffer(1, 8000, 8000);
    buffer.duration = 1;
    return buffer;
  };
  return { context, library: createLibrary({ context }) };
}

describe("isAudioFile", () => {
  it("accepts files with an audio MIME type", () => {
    expect(isAudioFile(fakeFile("a.mp3", "audio/mpeg"))).toBe(true);
    expect(isAudioFile(fakeFile("a.wav", "audio/wav"))).toBe(true);
  });

  it("rejects non-audio files", () => {
    expect(isAudioFile(fakeFile("cat.png", "image/png"))).toBe(false);
    expect(isAudioFile(fakeFile("notes.txt", "text/plain"))).toBe(false);
  });

  it("falls back to the extension when the MIME type is missing", () => {
    expect(isAudioFile(fakeFile("song.flac", ""))).toBe(true);
    expect(isAudioFile(fakeFile("song.MP3", ""))).toBe(true);
    expect(isAudioFile(fakeFile("readme", ""))).toBe(false);
  });

  it("rejects nothing at all", () => {
    expect(isAudioFile(null)).toBe(false);
    expect(isAudioFile(undefined)).toBe(false);
  });
});

describe("titleFromFilename", () => {
  it("strips the extension", () => {
    expect(titleFromFilename("Moonlit Drive.mp3")).toBe("Moonlit Drive");
  });

  it("keeps dots inside the name", () => {
    expect(titleFromFilename("track.01.final.wav")).toBe("track.01.final");
  });

  it("handles a name with no extension", () => {
    expect(titleFromFilename("demo")).toBe("demo");
  });

  it("falls back for empty or non-string names", () => {
    expect(titleFromFilename("")).toBe("Untitled");
    expect(titleFromFilename("   ")).toBe("Untitled");
    expect(titleFromFilename(null)).toBe("Untitled");
    expect(titleFromFilename(".mp3")).toBe("Untitled");
  });
});

describe("createLibrary", () => {
  it("requires an AudioContext", () => {
    expect(() => createLibrary({})).toThrow(TypeError);
  });

  it("starts with nothing loaded", () => {
    const { library } = build();
    expect(library.get("nope")).toBeNull();
    expect(library.has("nope")).toBe(false);
  });

  it("lists the built-in sample catalogue", () => {
    const { library } = build();
    const catalogue = library.sampleCatalogue();
    expect(catalogue).toHaveLength(SAMPLE_TRACKS.length);
    expect(catalogue[0]).toMatchObject({ sampleId: SAMPLE_ID });
  });
});

describe("sample tracks", () => {
  it("synthesizes a sample into a playable buffer", () => {
    const { library } = build();
    const buffer = library.loadSample(SAMPLE_ID);
    expect(buffer.length).toBeGreaterThan(0);
    expect(library.has(SAMPLE_ID)).toBe(true);
  });

  it("reuses the cached buffer rather than re-rendering", () => {
    const { library } = build();
    expect(library.loadSample(SAMPLE_ID)).toBe(library.loadSample(SAMPLE_ID));
  });

  it("rejects an unknown sample id", () => {
    const { library } = build();
    expect(() => library.loadSample("nope")).toThrow(AudioLoadError);
    expect(() => library.createSampleTrack("nope")).toThrow(AudioLoadError);
  });

  it("creates a tray-ready track with its audio loaded", () => {
    const { library } = build();
    const track = library.createSampleTrack(SAMPLE_ID);
    expect(track).toMatchObject({ source: "sample", sampleId: SAMPLE_ID });
    expect(track.durationSeconds).toBeGreaterThan(0);
    expect(library.get(track.id)).not.toBeNull();
  });

  it("gives each added copy of a sample its own identity", () => {
    const { library } = build();
    const first = library.createSampleTrack(SAMPLE_ID);
    const second = library.createSampleTrack(SAMPLE_ID);
    expect(first.id).not.toBe(second.id);
    expect(library.get(first.id)).not.toBeNull();
    expect(library.get(second.id)).not.toBeNull();
  });
});

describe("addFile", () => {
  it("decodes a file into a track with its duration", async () => {
    const { library } = build();
    const track = await library.addFile(fakeFile("Basement Tape.mp3"));
    expect(track).toMatchObject({ title: "Basement Tape", source: "file" });
    expect(track.durationSeconds).toBe(1);
    expect(library.get(track.id)).not.toBeNull();
  });

  it("rejects a non-audio file by name", async () => {
    const { library } = build();
    await expect(library.addFile(fakeFile("cat.png", "image/png"))).rejects.toThrow(
      /cat\.png is not audio/,
    );
  });

  it("rejects undecodable audio without leaking a DOMException", async () => {
    const { library } = build({ decodeFails: true });
    await expect(library.addFile(fakeFile("broken.mp3"))).rejects.toThrow(
      AudioLoadError,
    );
  });

  it("rejects a file that cannot be read", async () => {
    const { library } = build();
    await expect(
      library.addFile(fakeFile("locked.mp3", "audio/mpeg", { fails: true })),
    ).rejects.toThrow(AudioLoadError);
  });

  it("leaves nothing cached when a load fails", async () => {
    const { library } = build({ decodeFails: true });
    await expect(library.addFile(fakeFile("broken.mp3"))).rejects.toThrow();
    expect(library.missingTracks(createMixtape())).toEqual([]);
  });
});

describe("attachFile", () => {
  it("supplies audio for an existing track", async () => {
    const { library } = build();
    await library.attachFile("shared-track", fakeFile("mine.mp3"));
    expect(library.has("shared-track")).toBe(true);
  });

  it("does not leave the temporary track's audio behind", async () => {
    const { library } = build();
    await library.attachFile("shared-track", fakeFile("mine.mp3"));
    const mixtape = createMixtape({
      tracks: [{ id: "shared-track", durationSeconds: 1 }],
    });
    expect(library.missingTracks(mixtape)).toEqual([]);
  });

  it("rejects a non-audio file", async () => {
    const { library } = build();
    await expect(library.attachFile("t", fakeFile("cat.png", "image/png"))).rejects.toThrow(
      AudioLoadError,
    );
  });
});

describe("hydrate and missingTracks", () => {
  const sharedTape = () =>
    createMixtape({
      tracks: [
        { id: "s1", source: "sample", sampleId: SAMPLE_ID, durationSeconds: 12 },
        { id: "f1", source: "file", title: "Their Song", durationSeconds: 30 },
      ],
    });

  it("restores audio for a shared link's sample tracks", () => {
    const { library } = build();
    library.hydrate(sharedTape());
    expect(library.has("s1")).toBe(true);
  });

  it("reports a shared link's local-file track as missing, not broken", () => {
    const { library } = build();
    const mixtape = library.hydrate(sharedTape());
    expect(library.missingTracks(mixtape).map((track) => track.id)).toEqual(["f1"]);
  });

  it("survives a link naming a sample this build does not have", () => {
    const { library } = build();
    const mixtape = createMixtape({
      tracks: [{ id: "x", source: "sample", sampleId: "from-the-future" }],
    });
    expect(() => library.hydrate(mixtape)).not.toThrow();
    expect(library.missingTracks(mixtape)).toHaveLength(1);
  });

  it("reports nothing missing once every track has audio", async () => {
    const { library } = build();
    const mixtape = library.hydrate(sharedTape());
    await library.attachFile("f1", fakeFile("their-song.mp3"));
    expect(library.missingTracks(mixtape)).toEqual([]);
  });
});

describe("forget", () => {
  it("drops a track's audio", () => {
    const { library } = build();
    const track = library.createSampleTrack(SAMPLE_ID);
    expect(library.forget(track.id)).toBe(true);
    expect(library.has(track.id)).toBe(false);
  });

  it("is a no-op for an unknown track", () => {
    expect(build().library.forget("nope")).toBe(false);
  });
});
