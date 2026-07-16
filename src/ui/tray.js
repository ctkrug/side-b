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

/** A drag payload is a string, so an index is only trustworthy once checked. */
function isSlot(index, tray) {
  return Number.isInteger(index) && index >= 0 && index < tray.length;
}

export function reorderTrack(tray, fromIndex, toIndex) {
  if (!isSlot(fromIndex, tray) || !isSlot(toIndex, tray)) {
    return tray;
  }
  if (fromIndex === toIndex) {
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
