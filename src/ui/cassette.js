const TAU = Math.PI * 2;

/** Reel speeds, in RPM, at a nominal (mid-tape) reel radius. */
export const IDLE_RPM = 1.6;
export const PLAY_RPM = 33;

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

/**
 * Radius of the supply reel — the mirror of the take-up reel, since tape
 * leaving one arrives on the other.
 */
export function supplyReelRadiusRatio(progress, minRatio = 0.35) {
  return takeUpReelRadiusRatio(1 - progress, minRatio);
}

/**
 * Tape moves past the head at a constant linear speed, so a reel's
 * angular speed is inversely proportional to its current radius: a full
 * take-up reel turns slower than an empty one. This inverse relationship
 * is the detail that reads as a real transport rather than two hubs
 * spinning at a fixed rate.
 */
export function reelRpm(radiusRatio, baseRpm = PLAY_RPM) {
  if (!(radiusRatio > 0)) {
    return 0;
  }
  return baseRpm / radiusRatio;
}

/**
 * Integrate rotation over one frame. The reels accumulate angle rather
 * than deriving it from absolute time, because their speed changes as the
 * reels fill — deriving from elapsed time alone would make the angle jump
 * whenever the speed changed.
 */
export function advanceAngle(angle, rpm, deltaSeconds) {
  if (!Number.isFinite(deltaSeconds) || deltaSeconds <= 0) {
    return normalizeAngle(angle);
  }
  return normalizeAngle(angle + (rpm / 60) * TAU * deltaSeconds);
}

export function normalizeAngle(angle) {
  if (!Number.isFinite(angle)) {
    return 0;
  }
  const wrapped = angle % TAU;
  return wrapped < 0 ? wrapped + TAU : wrapped;
}
