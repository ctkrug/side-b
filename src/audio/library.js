import { SAMPLE_TRACKS, findSampleTrack, renderSampleTrack } from "./sampleTracks.js";
import { createTrack } from "../mixtape/state.js";

/**
 * Turns the two kinds of track into playable audio buffers:
 *
 *  - sample tracks, synthesized deterministically from a spec, so a shared
 *    link can rebuild them on any machine;
 *  - local files, decoded in the browser and never uploaded anywhere.
 *
 * Buffers are cached by track id; a track whose audio is missing (a shared
 * link naming the sender's local file) simply has no buffer, and the UI
 * asks for it rather than failing.
 */

export const AUDIO_FILE_PATTERN = /^audio\//;

/** Files a browser will not decode are rejected before they reach the tray. */
export function isAudioFile(file) {
  if (!file) {
    return false;
  }
  if (file.type) {
    return AUDIO_FILE_PATTERN.test(file.type);
  }
  // Some platforms hand over an empty MIME type; fall back to the suffix.
  return /\.(mp3|wav|ogg|m4a|aac|flac|opus|weba)$/i.test(file.name ?? "");
}

/** Strip the extension: a filename is a decent default track title. */
export function titleFromFilename(name) {
  if (typeof name !== "string" || name.trim() === "") {
    return "Untitled";
  }
  return name.replace(/\.[^./\\]+$/, "").trim() || "Untitled";
}

export class AudioLoadError extends Error {
  constructor(message) {
    super(message);
    this.name = "AudioLoadError";
  }
}

export function createLibrary({ context }) {
  if (!context) {
    throw new TypeError("createLibrary requires an AudioContext");
  }
  const buffers = new Map();

  function bufferFromSamples(samples) {
    const buffer = context.createBuffer(1, samples.length, context.sampleRate);
    buffer.getChannelData(0).set(samples);
    return buffer;
  }

  return {
    get(trackId) {
      return buffers.get(trackId) ?? null;
    },

    has(trackId) {
      return buffers.has(trackId);
    },

    /** Tracks with no audio yet — a shared link's local-file entries. */
    missingTracks(mixtape) {
      return mixtape.tracks.filter((track) => !buffers.has(track.id));
    },

    /** The built-in tracks, as tray-ready track objects. */
    sampleCatalogue() {
      return SAMPLE_TRACKS.map((spec) => ({
        sampleId: spec.id,
        title: spec.title,
        durationSeconds: spec.durationSeconds,
      }));
    },

    /**
     * Synthesize a sample track's audio. Idempotent: repeated calls reuse
     * the cached buffer rather than re-rendering.
     */
    loadSample(sampleId, trackId = sampleId) {
      if (buffers.has(trackId)) {
        return buffers.get(trackId);
      }
      const spec = findSampleTrack(sampleId);
      if (!spec) {
        throw new AudioLoadError(`unknown sample track: ${sampleId}`);
      }
      const buffer = bufferFromSamples(
        renderSampleTrack(spec, context.sampleRate),
      );
      buffers.set(trackId, buffer);
      return buffer;
    },

    /** A tray-ready track for a built-in sample. */
    createSampleTrack(sampleId) {
      const spec = findSampleTrack(sampleId);
      if (!spec) {
        throw new AudioLoadError(`unknown sample track: ${sampleId}`);
      }
      const track = createTrack({
        title: spec.title,
        source: "sample",
        sampleId: spec.id,
        durationSeconds: spec.durationSeconds,
      });
      this.loadSample(spec.id, track.id);
      return track;
    },

    /**
     * Decode a local file into a track. Rejects with AudioLoadError rather
     * than a raw DOMException so callers have one error type to present.
     */
    async addFile(file) {
      if (!isAudioFile(file)) {
        throw new AudioLoadError(`${file?.name ?? "That file"} is not audio`);
      }
      let buffer;
      try {
        const data = await file.arrayBuffer();
        buffer = await context.decodeAudioData(data);
      } catch {
        throw new AudioLoadError(`${file.name} could not be decoded`);
      }
      const track = createTrack({
        title: titleFromFilename(file.name),
        source: "file",
        durationSeconds: buffer.duration,
      });
      buffers.set(track.id, buffer);
      return track;
    },

    /**
     * Attach a decoded file to an existing track — how a recipient
     * supplies the audio for a shared tape's local-file track.
     */
    async attachFile(trackId, file) {
      const track = await this.addFile(file);
      const buffer = buffers.get(track.id);
      buffers.delete(track.id);
      buffers.set(trackId, buffer);
      return buffer;
    },

    /** Restore the audio a shared link's sample tracks refer to. */
    hydrate(mixtape) {
      for (const track of mixtape.tracks) {
        if (track.source === "sample" && track.sampleId) {
          try {
            this.loadSample(track.sampleId, track.id);
          } catch {
            // An unknown sample id (a link from a newer build) leaves the
            // track silent and listed as missing, rather than failing the
            // whole tape.
          }
        }
      }
      return mixtape;
    },

    forget(trackId) {
      return buffers.delete(trackId);
    },
  };
}
