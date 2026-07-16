const TAU = Math.PI * 2;

/**
 * Continuous reel rotation angle (radians) for a given elapsed playback
 * time and speed in RPM. Used to frame-sync the canvas cassette animation
 * to actual AudioContext playback position rather than a looping asset.
 */
export function reelRotationRadians(elapsedSeconds, rpm) {
  const revolutionsPerSecond = rpm / 60;
  const angle = (elapsedSeconds * revolutionsPerSecond * TAU) % TAU;
  return angle < 0 ? angle + TAU : angle;
}

/**
 * As tape plays, it unwinds from the supply reel and winds onto the
 * take-up reel, so the take-up reel's apparent radius grows (and its
 * angular speed slows to keep linear tape speed constant) while the
 * supply reel's radius shrinks. Returns a 0..1 ratio for the take-up
 * reel's radius given how far through playback we are.
 */
export function takeUpReelRadiusRatio(progress, minRatio = 0.35) {
  const clamped = Math.min(1, Math.max(0, progress));
  return minRatio + (1 - minRatio) * clamped;
}
