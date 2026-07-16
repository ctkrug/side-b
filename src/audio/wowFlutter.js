const TAU = Math.PI * 2;

export const DEFAULT_WOW_FLUTTER = {
  wowRateHz: 0.8,
  wowDepthMs: 3,
  flutterRateHz: 6,
  flutterDepthMs: 0.4,
};

/**
 * Delay-time offset (in milliseconds) for a variable delay line modeling
 * tape transport speed instability: a slow "wow" LFO (motor speed drift)
 * summed with a faster, shallower "flutter" LFO (capstan jitter).
 */
export function wowFlutterOffsetMs(timeSeconds, params = DEFAULT_WOW_FLUTTER) {
  const { wowRateHz, wowDepthMs, flutterRateHz, flutterDepthMs } = params;
  const wow = Math.sin(TAU * wowRateHz * timeSeconds) * wowDepthMs;
  const flutter = Math.sin(TAU * flutterRateHz * timeSeconds) * flutterDepthMs;
  return wow + flutter;
}
