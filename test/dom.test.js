/**
 * @vitest-environment jsdom
 */
import { describe, expect, it } from "vitest";
import { ICONS, append, clear, el, icon } from "../src/ui/dom.js";

/**
 * These run against a real DOM. The two regressions they pin (custom
 * properties silently dropped, null appended as the text "null") both
 * shipped to the page before a browser check caught them.
 */

describe("el", () => {
  it("creates an element with text content", () => {
    const node = el("p", {}, "hello");
    expect(node.tagName).toBe("P");
    expect(node.textContent).toBe("hello");
  });

  it("sets the class name", () => {
    expect(el("div", { class: "deck" }).className).toBe("deck");
  });

  it("sets dataset entries", () => {
    expect(el("div", { dataset: { transport: "play" } }).dataset.transport).toBe("play");
  });

  it("sets ordinary style properties", () => {
    expect(el("div", { style: { color: "red" } }).style.color).toBe("red");
  });

  it("sets CSS custom properties", () => {
    // Object.assign on style drops these; the swatches rendered black.
    const node = el("div", { style: { "--swatch": "#e8934a" } });
    expect(node.style.getPropertyValue("--swatch")).toBe("#e8934a");
  });

  it("sets both custom and ordinary properties together", () => {
    const node = el("div", { style: { "--swatch": "#fff", opacity: "0.5" } });
    expect(node.style.getPropertyValue("--swatch")).toBe("#fff");
    expect(node.style.opacity).toBe("0.5");
  });

  it("attaches event listeners from on* keys", () => {
    let clicked = 0;
    const node = el("button", { onClick: () => (clicked += 1) });
    node.click();
    expect(clicked).toBe(1);
  });

  it("sets attributes that are not element properties", () => {
    expect(el("div", { "aria-label": "Deck" }).getAttribute("aria-label")).toBe("Deck");
  });

  it("renders a boolean-true attribute as present and empty", () => {
    expect(el("input", { "aria-hidden": true }).getAttribute("aria-hidden")).toBe("");
  });

  it("skips null, undefined and false props rather than printing them", () => {
    const node = el("div", { title: null, id: undefined, hidden: false });
    expect(node.hasAttribute("title")).toBe(false);
    expect(node.id).toBe("");
    expect(node.hidden).toBe(false);
  });

  it("appends element and text children in order", () => {
    const node = el("div", {}, [el("span", {}, "a"), "b"]);
    expect(node.textContent).toBe("ab");
  });

  it("skips absent children instead of rendering them as text", () => {
    const node = el("div", {}, ["a", null, undefined, false, "b"]);
    expect(node.textContent).toBe("ab");
  });

  it("accepts a single child that is not an array", () => {
    expect(el("div", {}, el("span", {}, "x")).textContent).toBe("x");
  });

  it("stringifies a number child", () => {
    expect(el("div", {}, [0]).textContent).toBe("0");
  });
});

describe("append", () => {
  it("appends every present child", () => {
    const node = append(el("div"), el("span", {}, "a"), el("span", {}, "b"));
    expect(node.children).toHaveLength(2);
  });

  it("skips null rather than writing the text 'null'", () => {
    const node = append(el("div"), el("span", {}, "a"), null, undefined, false);
    expect(node.children).toHaveLength(1);
    expect(node.textContent).toBe("a");
  });

  it("flattens an array of children", () => {
    expect(append(el("div"), [el("i"), el("b")]).children).toHaveLength(2);
  });

  it("appends nothing when given nothing", () => {
    expect(append(el("div")).children).toHaveLength(0);
  });
});

describe("clear", () => {
  it("removes every child", () => {
    const node = el("div", {}, [el("span"), el("span")]);
    expect(clear(node).children).toHaveLength(0);
  });

  it("is safe on an already-empty node", () => {
    expect(clear(el("div")).children).toHaveLength(0);
  });
});

describe("icon", () => {
  it("builds an svg with the given path", () => {
    const svg = icon(ICONS.play);
    expect(svg.tagName.toLowerCase()).toBe("svg");
    expect(svg.querySelectorAll("path")).toHaveLength(1);
  });

  it("is hidden from assistive tech, since buttons carry the label", () => {
    expect(icon(ICONS.play).getAttribute("aria-hidden")).toBe("true");
  });

  it("accepts several paths", () => {
    expect(icon([ICONS.play, ICONS.stop]).querySelectorAll("path")).toHaveLength(2);
  });

  it("honours the requested size", () => {
    expect(icon(ICONS.play, { size: 32 }).getAttribute("width")).toBe("32");
  });

  it("defaults to currentColor so it inherits the control's colour", () => {
    expect(icon(ICONS.play).querySelector("path").getAttribute("fill")).toBe(
      "currentColor",
    );
  });

  it("every icon in the set has a path", () => {
    for (const [name, path] of Object.entries(ICONS)) {
      expect(path, name).toMatch(/^[Mm]/);
    }
  });
});
