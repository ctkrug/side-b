import { el } from "./dom.js";

/**
 * Transient status messages. Announced via a live region so the
 * confirmation reaches screen readers, not only sighted users.
 */

export const TOAST_MS = 3200;

export function createToaster(parent, { setTimeoutFn = setTimeout, clearTimeoutFn = clearTimeout } = {}) {
  const region = el("div", {
    class: "toaster",
    role: "status",
    "aria-live": "polite",
  });
  parent.append(region);
  let timer = null;

  function dismiss() {
    if (timer !== null) {
      clearTimeoutFn(timer);
      timer = null;
    }
    region.replaceChildren();
  }

  return {
    element: region,

    /** tone: "success" | "error" | "info" */
    show(message, { tone = "info", action = null, duration = TOAST_MS } = {}) {
      dismiss();
      const toast = el("div", { class: `toast toast--${tone}` }, [
        el("p", { class: "toast__text" }, message),
        action,
      ]);
      region.append(toast);
      // An error the user must read, or one carrying an action, stays put.
      if (tone !== "error" && !action) {
        timer = setTimeoutFn(dismiss, duration);
      }
      return toast;
    },

    dismiss,
  };
}
