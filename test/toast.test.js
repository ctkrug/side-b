/**
 * @vitest-environment jsdom
 */
import { describe, expect, it } from "vitest";
import { TOAST_MS, createToaster } from "../src/ui/toast.js";

/**
 * The toaster is how every error and confirmation in the app reaches the
 * user — including the ones a screen reader has to hear — so its live
 * region and its dismissal rules are worth pinning.
 */

function build() {
  const parent = document.createElement("div");
  const timers = [];
  let cleared = [];
  const toaster = createToaster(parent, {
    setTimeoutFn: (fn, ms) => {
      timers.push({ fn, ms });
      return timers.length;
    },
    clearTimeoutFn: (handle) => cleared.push(handle),
  });
  return {
    parent,
    toaster,
    timers,
    cleared: () => cleared,
    /** Fire the most recently armed timer, as the clock would. */
    runTimer: () => timers.at(-1).fn(),
  };
}

describe("createToaster", () => {
  it("announces politely through a status live region", () => {
    const { toaster } = build();
    expect(toaster.element.getAttribute("role")).toBe("status");
    expect(toaster.element.getAttribute("aria-live")).toBe("polite");
  });

  it("mounts its region into the parent it was given", () => {
    const { parent, toaster } = build();
    expect(parent.contains(toaster.element)).toBe(true);
  });

  it("shows the message text", () => {
    const { toaster } = build();
    toaster.show("Link copied");
    expect(toaster.element.textContent).toContain("Link copied");
  });

  it("carries the tone as a modifier class", () => {
    const { toaster } = build();
    expect(toaster.show("saved", { tone: "success" }).className).toContain(
      "toast--success",
    );
    expect(toaster.show("nope", { tone: "error" }).className).toContain(
      "toast--error",
    );
  });

  it("defaults to the info tone", () => {
    const { toaster } = build();
    expect(toaster.show("fyi").className).toContain("toast--info");
  });

  it("shows one toast at a time, so messages cannot pile up", () => {
    const { toaster } = build();
    toaster.show("first");
    toaster.show("second");
    expect(toaster.element.children).toHaveLength(1);
    expect(toaster.element.textContent).toContain("second");
    expect(toaster.element.textContent).not.toContain("first");
  });

  it("clears a pending timer when replaced, so it cannot dismiss its successor", () => {
    const { toaster, cleared, runTimer } = build();
    toaster.show("first");
    toaster.show("second");
    expect(cleared()).toContain(1);
    runTimer();
    expect(toaster.element.children).toHaveLength(0);
  });

  it("auto-dismisses an ordinary message after the default delay", () => {
    const { toaster, timers, runTimer } = build();
    toaster.show("fyi");
    expect(timers.at(-1).ms).toBe(TOAST_MS);
    runTimer();
    expect(toaster.element.children).toHaveLength(0);
  });

  it("honours a caller's duration", () => {
    const { toaster, timers } = build();
    toaster.show("fyi", { duration: 6000 });
    expect(timers.at(-1).ms).toBe(6000);
  });

  // An error the user must read, or a message carrying something to click,
  // must not vanish on its own.
  it("leaves an error on screen", () => {
    const { toaster, timers } = build();
    toaster.show("that failed", { tone: "error" });
    expect(timers).toHaveLength(0);
    expect(toaster.element.children).toHaveLength(1);
  });

  it("leaves a message carrying an action on screen", () => {
    const { toaster, timers } = build();
    const input = document.createElement("input");
    toaster.show("copy this", { action: input });
    expect(timers).toHaveLength(0);
    expect(toaster.element.contains(input)).toBe(true);
  });

  it("dismisses on request", () => {
    const { toaster } = build();
    toaster.show("fyi");
    toaster.dismiss();
    expect(toaster.element.children).toHaveLength(0);
  });

  it("is a no-op to dismiss when nothing is showing", () => {
    const { toaster } = build();
    expect(() => toaster.dismiss()).not.toThrow();
    expect(toaster.element.children).toHaveLength(0);
  });
});
