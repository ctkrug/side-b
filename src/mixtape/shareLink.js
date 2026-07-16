/**
 * Encode/decode mixtape state into a URL-safe string so a mixtape can be
 * shared as a link with no backend: the whole state lives in the URL.
 */

export function encodeMixtape(state) {
  const json = JSON.stringify(state);
  const base64 = btoa(unescape(encodeURIComponent(json)));
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function decodeMixtape(encoded) {
  const padded = encoded
    .replace(/-/g, "+")
    .replace(/_/g, "/")
    .padEnd(Math.ceil(encoded.length / 4) * 4, "=");
  const json = decodeURIComponent(escape(atob(padded)));
  return JSON.parse(json);
}
