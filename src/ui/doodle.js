/**
 * Cover art. Strokes are stored as vectors in a normalized 0..1 space, not
 * as pixels, for two reasons:
 *
 *  - the drawing survives the share link: a few hundred coordinates encode
 *    into a URL, where a PNG data URL would not;
 *  - it redraws crisply at any canvas size or pixel ratio.
 *
 * A rasterized data URL is still available via `toDataURL` for export.
 */

import { clamp } from "../audio/utils.js";

export const COVER_COLORS = Object.freeze([
  "#e8934a",
  "#d1495b",
  "#5a8f7b",
  "#f4e9d8",
  "#2b2018",
]);

export const DEFAULT_STROKE_WIDTH = 3;

/** Coordinates are quantized to 1/1000 — past that is invisible but costly. */
const PRECISION = 1000;

/**
 * A packed colour is an index into the palette, and it arrives from a
 * share link — so it has to be a real slot, not merely something that
 * indexes the array. "constructor" would otherwise resolve to a function.
 */
function paletteColor(index) {
  return Number.isInteger(index) && index >= 0 && index < COVER_COLORS.length
    ? COVER_COLORS[index]
    : COVER_COLORS[0];
}

export function quantize(value) {
  return Math.round(clamp(value, 0, 1) * PRECISION) / PRECISION;
}

/**
 * Convert a pointer event position into normalized cover space. Points
 * outside the pad clamp to its edge rather than being dropped, so a
 * stroke that runs off the pad ends cleanly at the boundary.
 */
export function toCoverSpace(clientX, clientY, rect) {
  if (!rect || !(rect.width > 0) || !(rect.height > 0)) {
    return null;
  }
  return {
    x: quantize((clientX - rect.left) / rect.width),
    y: quantize((clientY - rect.top) / rect.height),
  };
}

export function createStroke(color, width = DEFAULT_STROKE_WIDTH) {
  return {
    color: COVER_COLORS.includes(color) ? color : COVER_COLORS[0],
    width: clamp(width, 1, 24),
    points: [],
  };
}

/**
 * Append a point, skipping ones too close to the previous to matter. A
 * pointermove can fire every few pixels; keeping all of them would bloat
 * the share link without changing the drawing.
 */
export function appendPoint(stroke, point, minDistance = 0.004) {
  if (!point) {
    return stroke;
  }
  const last = stroke.points.at(-1);
  if (last && Math.hypot(point.x - last.x, point.y - last.y) < minDistance) {
    return stroke;
  }
  stroke.points.push(point);
  return stroke;
}

export function createCover(strokes = []) {
  return { strokes: strokes.map((stroke) => ({ ...stroke })) };
}

export function isCoverEmpty(cover) {
  return !cover || cover.strokes.every((stroke) => stroke.points.length === 0);
}

/** Total points across a cover — the number that drives share-link size. */
export function coverPointCount(cover) {
  if (!cover) {
    return 0;
  }
  return cover.strokes.reduce((sum, stroke) => sum + stroke.points.length, 0);
}

/**
 * Draw a cover into a 2D context sized `size` x `size`. Used both for the
 * live pad and for rendering the thumbnail onto the cassette label.
 */
export function drawCover(ctx, cover, size, { background = null } = {}) {
  if (background) {
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, size, size);
  }
  if (!cover) {
    return;
  }
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (const stroke of cover.strokes) {
    if (stroke.points.length === 0) {
      continue;
    }
    ctx.strokeStyle = stroke.color;
    ctx.lineWidth = (stroke.width / 100) * size;
    ctx.beginPath();
    const [first, ...rest] = stroke.points;
    // A single-point stroke is a dot: draw a zero-length line so round
    // caps render it, rather than dropping the mark the user made.
    ctx.moveTo(first.x * size, first.y * size);
    if (rest.length === 0) {
      ctx.lineTo(first.x * size, first.y * size);
    }
    for (const point of rest) {
      ctx.lineTo(point.x * size, point.y * size);
    }
    ctx.stroke();
  }
}

/**
 * Serialize a cover to its compact share-link form: colors become palette
 * indices and coordinates become integers, which roughly halves the
 * encoded length versus the in-memory shape.
 */
export function packCover(cover) {
  if (isCoverEmpty(cover)) {
    return null;
  }
  return cover.strokes
    .filter((stroke) => stroke.points.length > 0)
    .map((stroke) => ({
      c: Math.max(0, COVER_COLORS.indexOf(stroke.color)),
      w: Math.round(stroke.width * 10),
      p: stroke.points.flatMap((point) => [
        Math.round(point.x * PRECISION),
        Math.round(point.y * PRECISION),
      ]),
    }));
}

/**
 * Rebuild a cover from its packed form. Malformed input yields an empty
 * cover rather than throwing: a corrupt share link should degrade to a
 * blank j-card, not a broken page.
 */
export function unpackCover(packed) {
  if (!Array.isArray(packed)) {
    return null;
  }
  const strokes = [];
  for (const entry of packed) {
    if (!entry || !Array.isArray(entry.p)) {
      continue;
    }
    const points = [];
    for (let i = 0; i + 1 < entry.p.length; i += 2) {
      const x = Number(entry.p[i]);
      const y = Number(entry.p[i + 1]);
      if (!Number.isFinite(x) || !Number.isFinite(y)) {
        continue;
      }
      points.push({ x: quantize(x / PRECISION), y: quantize(y / PRECISION) });
    }
    if (points.length === 0) {
      continue;
    }
    strokes.push({
      color: paletteColor(entry.c),
      width: clamp(Number(entry.w) / 10 || DEFAULT_STROKE_WIDTH, 1, 24),
      points,
    });
  }
  return strokes.length > 0 ? createCover(strokes) : null;
}
