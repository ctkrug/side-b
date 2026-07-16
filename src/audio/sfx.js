/**
 * Synthesized interface sounds — the deck's tactile layer. Every sound is
 * built from oscillators and noise at call time; there are no audio files
 * to load, which keeps the build static and the sounds instant.
 *
 * This is deliberately separate from the tape chain: muting the interface
 * must never silence the music or the hiss that is part of the mix.
 */

export const MUTE_STORAGE_KEY = "side-b:sfx-muted";

/** Interface sounds sit well under the program material. */
const MASTER_GAIN = 0.18;

/** Ignore repeat triggers inside this window, so held keys cannot buzz. */
export const RETRIGGER_MS = 40;

/**
 * localStorage throws in private modes and sandboxed frames, so every
 * access is guarded: a preference that cannot be saved is a minor
 * degradation, not a crash.
 */
export function readMutePreference(storage) {
  try {
    return storage?.getItem(MUTE_STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

export function writeMutePreference(storage, muted) {
  if (!storage) {
    return false;
  }
  try {
    storage.setItem(MUTE_STORAGE_KEY, String(muted));
    return true;
  } catch {
    return false;
  }
}

export function createSfx({ context, storage = null, now = () => Date.now() }) {
  let muted = readMutePreference(storage);
  const lastPlayed = new Map();

  const master = context ? context.createGain() : null;
  if (master) {
    master.gain.value = muted ? 0 : MASTER_GAIN;
    master.connect(context.destination);
  }

  function shouldPlay(name) {
    if (!context || muted) {
      return false;
    }
    const at = now();
    const previous = lastPlayed.get(name);
    if (previous !== undefined && at - previous < RETRIGGER_MS) {
      return false;
    }
    lastPlayed.set(name, at);
    return true;
  }

  function tone({ type, from, to, duration, gain, delay = 0 }) {
    const start = context.currentTime + delay;
    const osc = context.createOscillator();
    const level = context.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(from, start);
    if (to !== from) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(1, to), start + duration);
    }
    level.gain.setValueAtTime(0, start);
    level.gain.linearRampToValueAtTime(gain, start + 0.005);
    level.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    osc.connect(level);
    level.connect(master);
    osc.start(start);
    osc.stop(start + duration + 0.02);
  }

  function noiseBurst({ duration, gain, frequency, delay = 0 }) {
    const start = context.currentTime + delay;
    const length = Math.max(1, Math.floor(context.sampleRate * duration));
    const buffer = context.createBuffer(1, length, context.sampleRate);
    const channel = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) {
      channel[i] = (Math.random() * 2 - 1) * (1 - i / length);
    }
    const source = context.createBufferSource();
    source.buffer = buffer;
    const filter = context.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = frequency;
    const level = context.createGain();
    level.gain.value = gain;
    source.connect(filter);
    filter.connect(level);
    level.connect(master);
    source.start(start);
  }

  /** The deck's voice: each sound maps to a physical event on the machine. */
  const voices = {
    // A button under a fingertip.
    click() {
      noiseBurst({ duration: 0.03, gain: 0.5, frequency: 2600 });
      tone({ type: "square", from: 880, to: 440, duration: 0.04, gain: 0.12 });
    },
    // The motor taking up speed.
    whirUp() {
      tone({ type: "sawtooth", from: 90, to: 260, duration: 0.28, gain: 0.1 });
      noiseBurst({ duration: 0.24, gain: 0.16, frequency: 900 });
    },
    // The motor winding down.
    whirDown() {
      tone({ type: "sawtooth", from: 260, to: 70, duration: 0.3, gain: 0.1 });
      noiseBurst({ duration: 0.26, gain: 0.12, frequency: 700 });
    },
    // A cassette seating in the tray.
    chunk() {
      tone({ type: "sine", from: 160, to: 60, duration: 0.12, gain: 0.5 });
      noiseBurst({ duration: 0.06, gain: 0.35, frequency: 420 });
    },
    // A tape door latching shut — the share confirmation.
    tapeClick() {
      tone({ type: "sine", from: 660, to: 660, duration: 0.07, gain: 0.22 });
      tone({
        type: "sine",
        from: 990,
        to: 990,
        duration: 0.12,
        gain: 0.18,
        delay: 0.06,
      });
    },
  };

  return {
    isMuted() {
      return muted;
    },

    setMuted(next) {
      muted = Boolean(next);
      if (master) {
        master.gain.value = muted ? 0 : MASTER_GAIN;
      }
      writeMutePreference(storage, muted);
      return muted;
    },

    toggleMute() {
      return this.setMuted(!muted);
    },

    /** Play a named sound. Unknown names and no-audio environments no-op. */
    play(name) {
      const voice = voices[name];
      if (!voice || !shouldPlay(name)) {
        return false;
      }
      voice();
      return true;
    },
  };
}
