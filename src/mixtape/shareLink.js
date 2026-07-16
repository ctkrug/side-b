/**
 * Encode/decode mixtape state into a URL-safe string so a mixtape can be
 * shared as a link with no backend: the whole state lives in the URL.
 *
 * The payload is deliberately terse (short keys, packed cover strokes,
 * effects quantized to two decimals) because a URL is a small container
 * and a whole tape has to fit inside one.
 */

import { EFFECT_KEYS, createMixtape, normalizeEffects } from "./state.js";
import { packCover, unpackCover } from "../ui/doodle.js";

/** Browsers vary; ~2000 chars is the safe ceiling across all of them. */
export const SAFE_URL_LENGTH = 2000;

/**
 * A link is text a stranger controls, and opening one costs real memory:
 * every sample track it names is synthesized to PCM on arrival, so an
 * unbounded tracklist is a memory bomb in a URL. 64 sits far above any
 * tape a person would make and far below a payload that could hurt.
 *
 * Deliberately not a cap on the payload's length: an over-budget link
 * still decodes (SAFE_URL_LENGTH only warns), and a big doodle is merely
 * a lot of small numbers — it costs nothing like a track does.
 */
export const MAX_TRACKS = 64;

export class ShareLinkError extends Error {
  constructor(message) {
    super(message);
    this.name = "ShareLinkError";
  }
}

function toBase64Url(json) {
  const base64 = btoa(unescape(encodeURIComponent(json)));
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(encoded) {
  const padded = encoded
    .replace(/-/g, "+")
    .replace(/_/g, "/")
    .padEnd(Math.ceil(encoded.length / 4) * 4, "=");
  return decodeURIComponent(escape(atob(padded)));
}

/** Two decimals is finer than the sliders resolve, and half the length. */
const round2 = (value) => Math.round(value * 100) / 100;

export function encodeMixtape(mixtape) {
  if (!mixtape || !Array.isArray(mixtape.tracks)) {
    throw new ShareLinkError("cannot encode a mixtape without tracks");
  }
  const payload = {
    v: 1,
    t: mixtape.title,
    k: mixtape.tracks.map((track) => ({
      i: track.id,
      n: track.title,
      s: track.source,
      m: track.sampleId ?? undefined,
      d: round2(track.durationSeconds),
      e: EFFECT_KEYS.map((key) => round2(track.effects[key])),
    })),
    c: packCover(mixtape.cover) ?? undefined,
  };
  return toBase64Url(JSON.stringify(payload));
}

/**
 * Rebuild a mixtape from an encoded payload. Throws ShareLinkError for
 * anything malformed so the caller can show a designed error state; a
 * corrupt link must never surface as a blank page or a raw stack trace.
 */
export function decodeMixtape(encoded) {
  if (typeof encoded !== "string" || encoded.length === 0) {
    throw new ShareLinkError("this link has no mixtape in it");
  }
  let payload;
  try {
    payload = JSON.parse(fromBase64Url(encoded));
  } catch {
    throw new ShareLinkError("this link is damaged and cannot be read");
  }

  if (!payload || typeof payload !== "object" || !Array.isArray(payload.k)) {
    throw new ShareLinkError("this link is damaged and cannot be read");
  }
  if (payload.v !== 1) {
    throw new ShareLinkError("this link was made by a different version of Side B");
  }
  if (payload.k.length > MAX_TRACKS) {
    throw new ShareLinkError(
      `this link claims more tracks than a tape can hold (over ${MAX_TRACKS})`,
    );
  }

  const tracks = payload.k
    .filter((entry) => entry && typeof entry === "object")
    .map((entry) => {
      const amounts = Array.isArray(entry.e) ? entry.e : [];
      const effects = {};
      EFFECT_KEYS.forEach((key, index) => {
        effects[key] = Number(amounts[index]);
      });
      return {
        id: typeof entry.i === "string" ? entry.i : undefined,
        title: typeof entry.n === "string" ? entry.n : undefined,
        source: entry.s,
        sampleId: typeof entry.m === "string" ? entry.m : null,
        durationSeconds: Number(entry.d),
        // normalizeEffects turns any NaN back into a sane default.
        effects: normalizeEffects(effects),
      };
    });

  if (tracks.length === 0) {
    throw new ShareLinkError("this link's mixtape has no tracks");
  }

  return createMixtape({
    title: typeof payload.t === "string" ? payload.t : undefined,
    tracks,
    cover: unpackCover(payload.c),
  });
}

/** The full shareable URL for a mixtape, relative to the current page. */
export function buildShareUrl(mixtape, href) {
  const url = new URL(href);
  url.hash = `tape=${encodeMixtape(mixtape)}`;
  return url.toString();
}

/**
 * Read a mixtape out of a URL's hash. Returns null when there is no tape
 * in the link at all (the ordinary first visit) and throws only when a
 * tape is present but broken — the two cases need different UI.
 */
export function readMixtapeFromUrl(href) {
  const hash = new URL(href).hash.replace(/^#/, "");
  if (!hash) {
    return null;
  }
  const encoded = new URLSearchParams(hash).get("tape");
  return encoded ? decodeMixtape(encoded) : null;
}

/** Whether the encoded tape still fits comfortably in a URL. */
export function isShareUrlSafe(url) {
  return url.length <= SAFE_URL_LENGTH;
}
