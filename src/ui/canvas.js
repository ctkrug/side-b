/**
 * Canvas sizing. A canvas has two sizes — its CSS box and its pixel
 * buffer — and if they disagree the drawing is blurry. These helpers keep
 * the buffer at devicePixelRatio x the box, and recompute on resize.
 */

/** Cap the ratio: a 3x buffer on a large deck costs more than it shows. */
export const MAX_PIXEL_RATIO = 2;

export function effectivePixelRatio(devicePixelRatio) {
  if (!Number.isFinite(devicePixelRatio) || devicePixelRatio <= 0) {
    return 1;
  }
  return Math.min(devicePixelRatio, MAX_PIXEL_RATIO);
}

export function backingStoreSize(cssWidth, cssHeight, devicePixelRatio) {
  const ratio = effectivePixelRatio(devicePixelRatio);
  return {
    width: Math.max(1, Math.round(cssWidth * ratio)),
    height: Math.max(1, Math.round(cssHeight * ratio)),
    ratio,
  };
}

/**
 * Match the canvas buffer to its CSS box. Returns true when the buffer
 * actually changed, so a caller can skip redundant redraws — resize
 * events fire far more often than the size really changes.
 */
export function resizeCanvasToDisplaySize(canvas, devicePixelRatio = 1) {
  const cssWidth = canvas.clientWidth || 0;
  const cssHeight = canvas.clientHeight || 0;
  if (cssWidth === 0 || cssHeight === 0) {
    return false;
  }
  const { width, height } = backingStoreSize(cssWidth, cssHeight, devicePixelRatio);
  if (canvas.width === width && canvas.height === height) {
    return false;
  }
  canvas.width = width;
  canvas.height = height;
  return true;
}
