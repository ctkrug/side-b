/**
 * Signal measurement helpers. These exist so claims about the tape chain
 * ("saturation adds harmonics", "the tape chain changes more than level")
 * can be *measured* in a test rather than asserted by ear.
 */

const TAU = Math.PI * 2;

export function rms(samples) {
  if (samples.length === 0) {
    return 0;
  }
  let sum = 0;
  for (const sample of samples) {
    sum += sample * sample;
  }
  return Math.sqrt(sum / samples.length);
}

export function peak(samples) {
  let max = 0;
  for (const sample of samples) {
    max = Math.max(max, Math.abs(sample));
  }
  return max;
}

/**
 * Magnitude of a single frequency bin via the Goertzel algorithm — the
 * cheap way to ask "how much 3kHz is in this signal?" without a full FFT.
 * Normalized by length so magnitudes are comparable across buffer sizes.
 */
export function goertzelMagnitude(samples, frequency, sampleRate) {
  if (!(sampleRate > 0) || samples.length === 0) {
    return 0;
  }
  const omega = (TAU * frequency) / sampleRate;
  const coeff = 2 * Math.cos(omega);
  let s1 = 0;
  let s2 = 0;
  for (const sample of samples) {
    const s0 = sample + coeff * s1 - s2;
    s2 = s1;
    s1 = s0;
  }
  const real = s1 - s2 * Math.cos(omega);
  const imag = s2 * Math.sin(omega);
  return (2 * Math.hypot(real, imag)) / samples.length;
}

/** A pure sine test tone. */
export function generateTone(frequency, durationSeconds, sampleRate, amplitude = 0.5) {
  const length = Math.floor(durationSeconds * sampleRate);
  const samples = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    samples[i] = amplitude * Math.sin((TAU * frequency * i) / sampleRate);
  }
  return samples;
}

/**
 * Total harmonic distortion: energy in harmonics 2..n over energy at the
 * fundamental. This is the number that separates "it got louder" from "it
 * got *dirtier*" — a gain change leaves THD untouched.
 */
export function harmonicDistortion(samples, fundamental, sampleRate, harmonics = 5) {
  const base = goertzelMagnitude(samples, fundamental, sampleRate);
  if (base === 0) {
    return 0;
  }
  let sum = 0;
  for (let h = 2; h <= harmonics; h++) {
    const frequency = fundamental * h;
    if (frequency >= sampleRate / 2) {
      break;
    }
    sum += goertzelMagnitude(samples, frequency, sampleRate) ** 2;
  }
  return Math.sqrt(sum) / base;
}
