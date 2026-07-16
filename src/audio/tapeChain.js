import { buildSaturationCurve, saturationMakeupGain } from "./saturation.js";
import { DEFAULT_WOW_FLUTTER, wowFlutterOffsetMs } from "./wowFlutter.js";
import { DEFAULT_EFFECTS, normalizeEffects } from "../mixtape/state.js";
import { clamp } from "./utils.js";

/**
 * The tape chain: the live Web Audio graph that makes a track sound like
 * tape instead of a file. One chain per track.
 *
 *   input ─→ delay ─┬─→ dry ─────────────────────┬─→ output
 *                   └─→ wet → shaper → makeup ───┘
 *   hiss ── noise → filter → hissGain ───────────┘
 *
 * The delay line is what produces wow & flutter: modulating its delay time
 * shifts pitch exactly the way a drifting tape transport does. Saturation
 * is a dry/wet crossfade rather than an always-on waveshaper so that an
 * amount of 0 is genuinely transparent, not merely subtle.
 */

/** Nominal delay the wobble modulates around. Must exceed peak wow depth. */
export const BASE_DELAY_SECONDS = 0.02;

/** Hiss sits well under the program material even at full level. */
export const MAX_HISS_GAIN = 0.06;

/** Master trim, leaving headroom for the hiss bed on top of a hot mix. */
export const OUTPUT_GAIN = 0.8;

const NOISE_BUFFER_SECONDS = 2;

/**
 * Scale the normalized 0..1 UI amount onto the wow/flutter LFO depths.
 * Depth 0 pins the delay line to a constant time — no modulation, so no
 * pitch shift and the node passes its input through unchanged.
 */
export function wowFlutterParams(amount) {
  const scale = clamp(amount, 0, 1);
  return {
    ...DEFAULT_WOW_FLUTTER,
    wowDepthMs: DEFAULT_WOW_FLUTTER.wowDepthMs * scale,
    flutterDepthMs: DEFAULT_WOW_FLUTTER.flutterDepthMs * scale,
  };
}

/**
 * Delay time in seconds for a given moment. Clamped at zero because a
 * negative delay is not a thing a DelayNode will accept.
 */
export function delaySecondsAt(timeSeconds, amount) {
  const offsetMs = wowFlutterOffsetMs(timeSeconds, wowFlutterParams(amount));
  return Math.max(0, BASE_DELAY_SECONDS + offsetMs / 1000);
}

function createNoiseBuffer(ctx) {
  const length = Math.floor(ctx.sampleRate * NOISE_BUFFER_SECONDS);
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const channel = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) {
    channel[i] = Math.random() * 2 - 1;
  }
  return buffer;
}

export function createTapeChain(ctx, { effects = DEFAULT_EFFECTS } = {}) {
  if (!ctx) {
    throw new TypeError("createTapeChain requires an AudioContext");
  }
  let current = normalizeEffects(effects);
  let hissEnabled = true;

  const input = ctx.createGain();
  const delay = ctx.createDelay(1);
  const dry = ctx.createGain();
  const wet = ctx.createGain();
  const shaper = ctx.createWaveShaper();
  const makeup = ctx.createGain();
  const output = ctx.createGain();

  delay.delayTime.value = BASE_DELAY_SECONDS;
  output.gain.value = OUTPUT_GAIN;

  input.connect(delay);
  delay.connect(dry);
  delay.connect(wet);
  wet.connect(shaper);
  shaper.connect(makeup);
  dry.connect(output);
  makeup.connect(output);

  // Hiss is generated, not sampled: white noise through a bandpass, so it
  // reads as tape hiss rather than a full-spectrum static wash. It joins
  // after saturation because tape adds its noise floor to the recording.
  const hissSource = ctx.createBufferSource();
  hissSource.buffer = createNoiseBuffer(ctx);
  hissSource.loop = true;
  const hissFilter = ctx.createBiquadFilter();
  hissFilter.type = "bandpass";
  hissFilter.frequency.value = 4200;
  hissFilter.Q.value = 0.6;
  const hissGain = ctx.createGain();
  hissSource.connect(hissFilter);
  hissFilter.connect(hissGain);
  hissGain.connect(output);
  hissSource.start();

  function applyEffects() {
    dry.gain.value = 1 - current.saturation;
    wet.gain.value = current.saturation;
    shaper.curve = buildSaturationCurve(current.saturation);
    makeup.gain.value = saturationMakeupGain(current.saturation);
    hissGain.gain.value = hissEnabled ? current.hiss * MAX_HISS_GAIN : 0;
  }
  applyEffects();

  return {
    input,
    output,

    /** Drive the wobble. Called once per animation frame by the player. */
    update(timeSeconds) {
      delay.delayTime.value = delaySecondsAt(timeSeconds, current.wowFlutter);
    },

    setEffects(next) {
      current = normalizeEffects({ ...current, ...next });
      applyEffects();
    },

    getEffects() {
      return { ...current };
    },

    /** Master hiss bypass — silences the bed without stopping playback. */
    setHissEnabled(enabled) {
      hissEnabled = Boolean(enabled);
      applyEffects();
    },

    dispose() {
      try {
        hissSource.stop();
      } catch {
        // Already stopped: a BufferSource throws if stopped twice, and a
        // double dispose is not an error worth propagating to the caller.
      }
      for (const node of [
        input,
        delay,
        dry,
        wet,
        shaper,
        makeup,
        hissSource,
        hissFilter,
        hissGain,
        output,
      ]) {
        node.disconnect();
      }
    },
  };
}
