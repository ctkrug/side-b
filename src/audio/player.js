import { createTapeChain } from "./tapeChain.js";
import { totalDurationSeconds, trackAtElapsed } from "../mixtape/state.js";

/**
 * The transport. Owns the AudioContext, schedules tracks back to back, and
 * exposes the one number the cassette renderer needs: how far into the
 * tape we are, derived from AudioContext.currentTime rather than a
 * wall-clock timer, so the reels stay locked to the audio.
 */

export const TRANSPORT_STATES = Object.freeze({
  STOPPED: "stopped",
  PLAYING: "playing",
  PAUSED: "paused",
});

/**
 * Lazily create an AudioContext on first gesture, per autoplay policy.
 * Returns null where Web Audio does not exist (tests, old browsers) so
 * callers degrade instead of throwing.
 */
export function createAudioContext(win = globalThis) {
  const Ctor = win.AudioContext ?? win.webkitAudioContext;
  return Ctor ? new Ctor() : null;
}

export function createPlayer({ context, getBuffer }) {
  if (!context) {
    throw new TypeError("createPlayer requires an AudioContext");
  }
  if (typeof getBuffer !== "function") {
    throw new TypeError("createPlayer requires a getBuffer(track) function");
  }

  const master = context.createGain();
  master.connect(context.destination);

  let state = TRANSPORT_STATES.STOPPED;
  let mixtape = null;
  let voices = [];
  let hissEnabled = true;
  // Elapsed tape time = (context.currentTime - startedAt) + offsetAtStart.
  let startedAt = 0;
  let pausedElapsed = 0;
  let listeners = new Set();

  function emit() {
    for (const listener of listeners) {
      listener(state);
    }
  }

  function teardownVoices() {
    for (const voice of voices) {
      try {
        voice.source.stop();
      } catch {
        // A source that already ended throws on stop; nothing to undo.
      }
      voice.source.disconnect();
      voice.chain.dispose();
    }
    voices = [];
  }

  /**
   * Schedule every track from `fromElapsed` onward in one pass. Scheduling
   * ahead on the audio clock (rather than firing a timer per track) is what
   * keeps track transitions sample-accurate.
   */
  function scheduleFrom(fromElapsed) {
    const now = context.currentTime;
    let cursor = 0;
    for (const track of mixtape.tracks) {
      const trackStart = cursor;
      const trackEnd = cursor + track.durationSeconds;
      cursor = trackEnd;
      if (trackEnd <= fromElapsed) {
        continue;
      }
      const buffer = getBuffer(track);
      if (!buffer) {
        continue;
      }
      const offsetIntoTrack = Math.max(0, fromElapsed - trackStart);
      const when = now + Math.max(0, trackStart - fromElapsed);

      const chain = createTapeChain(context, { effects: track.effects });
      chain.setHissEnabled(hissEnabled);
      const source = context.createBufferSource();
      source.buffer = buffer;
      source.connect(chain.input);
      chain.output.connect(master);
      source.start(when, offsetIntoTrack);
      voices.push({ track, chain, source });
    }
  }

  function elapsedSeconds() {
    if (state === TRANSPORT_STATES.PLAYING) {
      return context.currentTime - startedAt + pausedElapsed;
    }
    return state === TRANSPORT_STATES.PAUSED ? pausedElapsed : 0;
  }

  function stopTransport() {
    if (state === TRANSPORT_STATES.STOPPED) {
      return false;
    }
    teardownVoices();
    pausedElapsed = 0;
    state = TRANSPORT_STATES.STOPPED;
    emit();
    return true;
  }

  return {
    get state() {
      return state;
    },

    isPlaying() {
      return state === TRANSPORT_STATES.PLAYING;
    },

    elapsedSeconds,

    onStateChange(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    /** Start (or restart) the tape from a given offset. */
    play(nextMixtape, fromElapsed = 0) {
      if (nextMixtape) {
        mixtape = nextMixtape;
      }
      if (!mixtape || mixtape.tracks.length === 0) {
        return false;
      }
      teardownVoices();
      pausedElapsed = Math.max(0, fromElapsed);
      startedAt = context.currentTime;
      scheduleFrom(pausedElapsed);
      if (voices.length === 0) {
        return false;
      }
      state = TRANSPORT_STATES.PLAYING;
      emit();
      return true;
    },

    pause() {
      if (state !== TRANSPORT_STATES.PLAYING) {
        return false;
      }
      pausedElapsed = elapsedSeconds();
      teardownVoices();
      state = TRANSPORT_STATES.PAUSED;
      emit();
      return true;
    },

    resume() {
      if (state !== TRANSPORT_STATES.PAUSED) {
        return false;
      }
      return this.play(null, pausedElapsed);
    },

    stop: stopTransport,

    /**
     * Advance the wobble on every live chain, and park the transport once
     * the tape has run out. Called once per animation frame by the render
     * loop, which is also what makes it the place that notices the end:
     * the last source ending is not itself an event the tape observes.
     */
    update() {
      if (state !== TRANSPORT_STATES.PLAYING) {
        return;
      }
      if (elapsedSeconds() >= totalDurationSeconds(mixtape)) {
        stopTransport();
        return;
      }
      const time = context.currentTime;
      for (const voice of voices) {
        voice.chain.update(time);
      }
    },

    /** Live effect edit — no restart, because there is no baked file. */
    setTrackEffects(trackId, effects) {
      for (const voice of voices) {
        if (voice.track.id === trackId) {
          voice.chain.setEffects(effects);
        }
      }
    },

    setHissEnabled(enabled) {
      hissEnabled = Boolean(enabled);
      for (const voice of voices) {
        voice.chain.setHissEnabled(hissEnabled);
      }
    },

    /** Which track is under the playhead right now, or null. */
    currentTrack() {
      return mixtape ? trackAtElapsed(mixtape, elapsedSeconds()) : null;
    },

    dispose() {
      teardownVoices();
      listeners = new Set();
      master.disconnect();
    },
  };
}
