/**
 * A tiny element builder. Not a framework — just enough to compose the
 * deck's UI declaratively without hand-writing createElement chains or
 * dropping unescaped strings into innerHTML.
 */

export function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value === null || value === undefined || value === false) {
      continue;
    }
    if (key === "class") {
      node.className = value;
    } else if (key === "dataset") {
      Object.assign(node.dataset, value);
    } else if (key === "style") {
      Object.assign(node.style, value);
    } else if (key.startsWith("on") && typeof value === "function") {
      node.addEventListener(key.slice(2).toLowerCase(), value);
    } else if (key in node && key !== "list") {
      node[key] = value;
    } else {
      node.setAttribute(key, value === true ? "" : String(value));
    }
  }
  for (const child of [children].flat()) {
    if (child === null || child === undefined || child === false) {
      continue;
    }
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}

export function clear(node) {
  node.replaceChildren();
  return node;
}

/**
 * An SVG icon. Icons are inline so they inherit currentColor and need no
 * network request or sprite sheet.
 */
export function icon(paths, { size = 20, fill = "currentColor" } = {}) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("width", String(size));
  svg.setAttribute("height", String(size));
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  for (const d of [paths].flat()) {
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", d);
    path.setAttribute("fill", fill);
    svg.append(path);
  }
  return svg;
}

export const ICONS = {
  play: "M8 5.5v13l11-6.5-11-6.5z",
  pause: "M7 5h3.5v14H7V5zm6.5 0H17v14h-3.5V5z",
  stop: "M6.5 6.5h11v11h-11z",
  record: "M12 6a6 6 0 100 12 6 6 0 000-12z",
  eject: "M12 5l7 8H5l7-8zm-7 12h14v2H5v-2z",
  trash: "M9 3h6l1 2h4v2H4V5h4l1-2zM6 9h12l-1 12H7L6 9z",
  share:
    "M14 4l6 5-6 5v-3.2c-3.4 0-5.8 1-7.5 3.4.7-3.9 3-6.6 7.5-7V4z M5 10v9h13v-4h2v6H3V8h5v2H5z",
  sound: "M4 9h3.5L12 5v14l-4.5-4H4V9zm12.5-1.5a6 6 0 010 9v-2.2a3.8 3.8 0 000-4.6V7.5z",
  muted: "M4 9h3.5L12 5v14l-4.5-4H4V9zm12 1.4L17.6 12l1.6 1.6-1.1 1.1L16.5 13l-1.6 1.6-1.1-1.1L15.4 12l-1.6-1.6 1.1-1.1 1.6 1.6 1.6-1.6 1.1 1.1z",
  undo: "M9 8V5l-6 5 6 5v-3.1c3.6 0 6.1 1.2 8 3.6-.8-4.3-3.4-7.2-8-7.5z",
};
