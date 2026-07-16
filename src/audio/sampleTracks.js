/**
 * Built-in demo tracks, synthesized from scratch rather than shipped as
 * audio files. Two reasons this matters:
 *
 *  - the wow moment is reachable with zero setup — no hunting for an mp3
 *    before you can hear the tape chain;
 *  - a share link can name a sample track and the recipient's browser can
 *    rebuild the exact same audio, which a local file could never do.
 */

const TAU = Math.PI * 2;

/** Semitone offsets from A4 (440Hz) → frequency. */
export function noteFrequency(semitonesFromA4) {
  return 440 * Math.pow(2, semitonesFromA4 / 12);
}

/**
 * Percussive attack, gentle exponential decay. Shaping every voice keeps
 * the synthesized material from reading as a raw, clicky test tone.
 */
export function pluckEnvelope(t, duration, attack = 0.01) {
  if (t < 0 || t > duration) {
    return 0;
  }
  if (t < attack) {
    return t / attack;
  }
  return Math.exp(-3 * ((t - attack) / duration));
}

export const SAMPLE_TRACKS = Object.freeze([
  {
    id: "moonlit-drive",
    title: "Moonlit Drive",
    durationSeconds: 12,
    bpm: 84,
    // Am — F — C — G, the mixtape chord progression.
    chords: [
      [0, 3, 7],
      [-4, 0, 5],
      [3, 7, 12],
      [-2, 2, 7],
    ],
    waveform: "triangle",
  },
  {
    id: "basement-tape",
    title: "Basement Tape",
    durationSeconds: 12,
    bpm: 96,
    chords: [
      [-5, -1, 2],
      [-7, -3, 0],
      [-9, -5, -2],
      [-7, -3, 0],
    ],
    waveform: "sawtooth",
  },
  {
    id: "porch-light",
    title: "Porch Light",
    durationSeconds: 12,
    bpm: 72,
    chords: [
      [7, 11, 14],
      [5, 9, 12],
      [2, 5, 9],
      [4, 7, 11],
    ],
    waveform: "sine",
  },
]);

export function findSampleTrack(sampleId) {
  return SAMPLE_TRACKS.find((track) => track.id === sampleId) ?? null;
}

function oscillate(waveform, phase) {
  switch (waveform) {
    case "sawtooth":
      return 2 * (phase - Math.floor(phase + 0.5));
    case "triangle":
      return 2 * Math.abs(2 * (phase - Math.floor(phase + 0.5))) - 1;
    default:
      return Math.sin(TAU * phase);
  }
}

/**
 * Render a sample track to mono PCM. Deterministic: the same spec and
 * sample rate always produce identical samples, which is what lets a share
 * link reconstruct a tape bit-for-bit on someone else's machine.
 */
export function renderSampleTrack(spec, sampleRate = 44100) {
  if (!spec || !(sampleRate > 0)) {
    throw new TypeError("renderSampleTrack requires a spec and a sample rate");
  }
  const length = Math.floor(spec.durationSeconds * sampleRate);
  const samples = new Float32Array(length);
  const beatSeconds = 60 / spec.bpm;
  const barSeconds = beatSeconds * 4;
  const noteSeconds = beatSeconds / 2;

  for (let i = 0; i < length; i++) {
    const time = i / sampleRate;
    const bar = Math.floor(time / barSeconds) % spec.chords.length;
    const chord = spec.chords[bar];

    // Arpeggio: step through the chord an eighth-note at a time.
    const step = Math.floor(time / noteSeconds);
    const noteTime = time - step * noteSeconds;
    const arpNote = chord[step % chord.length];
    const arpFreq = noteFrequency(arpNote + 12);
    const arp =
      oscillate(spec.waveform, arpFreq * time) *
      pluckEnvelope(noteTime, noteSeconds) *
      0.28;

    // Sustained pad underneath, one voice per chord tone.
    let pad = 0;
    for (const note of chord) {
      pad += Math.sin(TAU * noteFrequency(note - 12) * time);
    }
    pad = (pad / chord.length) * 0.22;

    samples[i] = arp + pad;
  }

  return applyFades(samples, sampleRate);
}

/**
 * Fade the first and last 40ms so looping or stopping a track never
 * produces a click — an artifact tape itself would never make.
 */
function applyFades(samples, sampleRate, fadeSeconds = 0.04) {
  const fadeLength = Math.min(
    Math.floor(fadeSeconds * sampleRate),
    Math.floor(samples.length / 2),
  );
  for (let i = 0; i < fadeLength; i++) {
    const gain = i / fadeLength;
    samples[i] *= gain;
    samples[samples.length - 1 - i] *= gain;
  }
  return samples;
}
