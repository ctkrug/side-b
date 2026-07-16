/**
 * Generate a buffer of white noise samples in [-1, 1] using a supplied
 * pseudo-random source so callers can substitute a seeded PRNG in tests.
 */
export function generateWhiteNoise(length, random = Math.random) {
  const samples = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    samples[i] = random() * 2 - 1;
  }
  return samples;
}

/**
 * Mulberry32 — a tiny, fast, deterministic PRNG. Used to make noise
 * generation reproducible in tests without pulling in a dependency.
 */
export function mulberry32(seed) {
  let a = seed;
  return function random() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
