/**
 * Pure state-transition helpers for the track tray, kept framework-free so
 * they're trivial to unit test and reusable from any future UI layer.
 */

export function addTrack(tray, track) {
  return [...tray, track];
}

export function removeTrack(tray, trackId) {
  return tray.filter((track) => track.id !== trackId);
}

export function reorderTrack(tray, fromIndex, toIndex) {
  if (
    fromIndex < 0 ||
    fromIndex >= tray.length ||
    toIndex < 0 ||
    toIndex >= tray.length
  ) {
    return tray;
  }
  const next = [...tray];
  const [moved] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, moved);
  return next;
}

export function totalDurationSeconds(tray) {
  return tray.reduce((sum, track) => sum + (track.durationSeconds ?? 0), 0);
}
