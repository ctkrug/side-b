import { clamp } from "./utils.js";

/**
 * Soft-clip a single sample using a cubic waveshaper, the same curve shape
 * used to build a WaveShaperNode's transfer curve. Models the gentle
 * compression and harmonic coloring of magnetic tape saturation.
 *
 * amount: 0 = transparent (no coloration), 1 = heavy saturation.
 */
export function softClipSample(sample, amount = 0.3) {
  const drive = 1 + clamp(amount, 0, 1) * 9;
  const driven = clamp(sample * drive, -1, 1);
  return driven - (driven * driven * driven) / 3;
}

/**
 * The cubic curve maps a full-scale input to 2/3, so the saturated path
 * needs makeup gain to reach the same ceiling as the dry path. Derived
 * from the curve itself rather than hard-coded, so the two stay in step if
 * the curve shape ever changes.
 */
export function saturationMakeupGain(amount = 0.3) {
  const ceiling = softClipSample(1, amount);
  return ceiling > 0 ? 1 / ceiling : 1;
}

/**
 * Build a Float32Array transfer curve suitable for WaveShaperNode.curve,
 * sampling softClipSample across the [-1, 1] input range.
 */
export function buildSaturationCurve(amount = 0.3, numSamples = 1024) {
  const curve = new Float32Array(numSamples);
  for (let i = 0; i < numSamples; i++) {
    const x = (i / (numSamples - 1)) * 2 - 1;
    curve[i] = softClipSample(x, amount);
  }
  return curve;
}
