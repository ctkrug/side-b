/**
 * @vitest-environment jsdom
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import postcss from "postcss";
import { describe, expect, it } from "vitest";

/**
 * The toaster is the app's overlay layer: every confirmation, every error
 * and the missing-tracks notice are toasts. It only works while it stays
 * pinned to the viewport — the deck page runs far taller than the fold, so
 * a toaster that falls into document flow renders below it and the share
 * confirmation is never seen at all.
 *
 * That is a cascade bug rather than a DOM one, and it shipped straight past
 * a full jsdom suite because jsdom resolves no stylesheet specificity. So
 * these read the real CSS and pin the invariant the cascade has to hold.
 */

const CSS_FILES = ["main.css", "layout.css", "components.css"];

// Read from the project root, not via `new URL(..., import.meta.url)`: Vite
// rewrites that form into an asset import and hands back the wrong file.
const sheet = postcss.parse(
  CSS_FILES.map((name) => readFileSync(resolve("src/styles", name), "utf8")).join("\n"),
);

/** Every rule in the sheet that declares `position`, at any nesting. */
function positionRules() {
  const rules = [];
  sheet.walkRules((rule) => {
    if (rule.parent?.name === "keyframes") {
      return;
    }
    const declaration = rule.nodes.findLast(
      (node) => node.type === "decl" && node.prop === "position",
    );
    if (declaration) {
      rules.push({ selector: rule.selector, position: declaration.value });
    }
  });
  return rules;
}

/**
 * Selector lists in the sheet include pseudo-elements (`*::before`), which
 * no element can match; treat those as "does not apply" rather than as an
 * error.
 */
function matchesAny(element, selectorList) {
  return selectorList.split(",").some((part) => {
    try {
      return element.matches(part.trim());
    } catch {
      return false;
    }
  });
}

function mount(html) {
  document.body.innerHTML = `<div id="app"><div class="grain"></div>${html}</div>`;
  return document.querySelector("#app > *:last-child");
}

describe("the toaster's overlay layer", () => {
  it("is pinned to the viewport by the stylesheet", () => {
    const own = positionRules().filter((rule) => rule.selector === ".toaster-host");
    expect(own).toHaveLength(1);
    expect(own[0].position).toBe("fixed");
  });

  it("is not knocked back into flow by a higher-specificity rule", () => {
    const host = mount(`<div class="toaster-host"></div>`);
    const conflicting = positionRules().filter(
      (rule) =>
        rule.selector !== ".toaster-host" &&
        rule.position !== "fixed" &&
        matchesAny(host, rule.selector),
    );
    expect(
      conflicting.map((rule) => rule.selector),
      "these also match .toaster-host and drop it out of the viewport",
    ).toEqual([]);
  });

  it("still lifts the app's own children above the grain", () => {
    const topbar = mount(`<header class="topbar"></header>`);
    expect(positionRules().some((rule) => matchesAny(topbar, rule.selector))).toBe(true);
  });
});
