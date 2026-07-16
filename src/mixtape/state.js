import { clamp } from "../audio/utils.js";

/**
 * The mixtape model. Kept pure and framework-free: the UI, the audio engine
 * and the share-link codec all read from this same shape, so there is one
 * definition of what a mixtape *is*.
 */

export const DEFAULT_EFFECTS = Object.freeze({
  wowFlutter: 0.35,
  saturation: 0.4,
  hiss: 0.25,
});

export const EFFECT_KEYS = Object.freeze(Object.keys(DEFAULT_EFFECTS));

/**
 * Effect amounts are normalised 0..1 so the UI, the codec and the audio
 * nodes never have to agree on engineering units. Out-of-range and
 * non-finite values collapse to the default rather than poisoning the
 * audio graph with NaN.
 */
export function normalizeEffects(effects = {}) {
  const result = {};
  for (const key of EFFECT_KEYS) {
    const value = effects[key];
    result[key] = Number.isFinite(value)
      ? clamp(value, 0, 1)
      : DEFAULT_EFFECTS[key];
  }
  return result;
}

export function createTrack({
  id,
  title,
  source = "file",
  sampleId = null,
  durationSeconds = 0,
  effects,
} = {}) {
  return {
    id: id ?? `track-${Math.random().toString(36).slice(2, 10)}`,
    title: title?.trim() ? title.trim() : "Untitled",
    source: source === "sample" ? "sample" : "file",
    sampleId,
    durationSeconds: Number.isFinite(durationSeconds)
      ? Math.max(0, durationSeconds)
      : 0,
    effects: normalizeEffects(effects),
  };
}

export function createMixtape({ title = "Side B", tracks = [], cover } = {}) {
  return {
    title: title?.trim() ? title.trim() : "Side B",
    tracks: tracks.map((track) => createTrack(track)),
    cover: cover ?? null,
  };
}

/**
 * Update one effect on one track, returning a new mixtape. Unknown track
 * ids and unknown effect keys are no-ops so a stale UI event can never
 * corrupt state.
 */
export function setTrackEffect(mixtape, trackId, key, value) {
  if (!EFFECT_KEYS.includes(key)) {
    return mixtape;
  }
  let changed = false;
  const tracks = mixtape.tracks.map((track) => {
    if (track.id !== trackId) {
      return track;
    }
    changed = true;
    return {
      ...track,
      effects: normalizeEffects({ ...track.effects, [key]: value }),
    };
  });
  return changed ? { ...mixtape, tracks } : mixtape;
}

export function totalDurationSeconds(mixtape) {
  return mixtape.tracks.reduce(
    (sum, track) => sum + (track.durationSeconds ?? 0),
    0,
  );
}

/**
 * Which track is playing at a given offset into the whole tape, and how far
 * into that track we are. Returns null past the end of the tape.
 */
export function trackAtElapsed(mixtape, elapsedSeconds) {
  if (!(elapsedSeconds >= 0)) {
    return null;
  }
  let cursor = 0;
  for (let index = 0; index < mixtape.tracks.length; index++) {
    const track = mixtape.tracks[index];
    const end = cursor + track.durationSeconds;
    if (elapsedSeconds < end) {
      return { index, track, offsetSeconds: elapsedSeconds - cursor };
    }
    cursor = end;
  }
  return null;
}

/**
 * Fraction of the whole tape played, 0..1. An empty tape reads as 0 rather
 * than NaN so the reel renderer always has a finite number to draw with.
 */
export function tapeProgress(mixtape, elapsedSeconds) {
  const total = totalDurationSeconds(mixtape);
  if (total <= 0) {
    return 0;
  }
  return clamp(elapsedSeconds / total, 0, 1);
}
