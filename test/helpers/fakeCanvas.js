/**
 * A recording stand-in for CanvasRenderingContext2D. It logs the calls a
 * renderer makes so tests can assert on what was drawn (and where)
 * without a real browser canvas.
 */

class FakeGradient {
  constructor(kind, args) {
    this.kind = kind;
    this.args = args;
    this.stops = [];
  }

  addColorStop(offset, color) {
    this.stops.push([offset, color]);
  }
}

export class FakeContext2D {
  constructor(canvas) {
    this.canvas = canvas;
    this.calls = [];
    this.gradients = [];
    this.transform = [1, 0, 0, 1, 0, 0];
    this._stack = [];
    this.fillStyle = "#000";
    this.strokeStyle = "#000";
    this.lineWidth = 1;
    this.font = "10px sans-serif";
    this.textAlign = "start";
    this.textBaseline = "alphabetic";
    this.shadowColor = "rgba(0,0,0,0)";
    this.shadowBlur = 0;

    const record =
      (name) =>
      (...args) => {
        this.calls.push({ name, args, fillStyle: this.fillStyle });
      };

    for (const name of [
      "clearRect",
      "fillRect",
      "beginPath",
      "closePath",
      "moveTo",
      "lineTo",
      "arc",
      "arcTo",
      "fill",
      "stroke",
      "fillText",
      "drawImage",
      "clip",
      "rotate",
      "translate",
      "setTransform",
      "scale",
    ]) {
      this[name] = record(name);
    }

    this.save = () => {
      this._stack.push(true);
      this.calls.push({ name: "save", args: [] });
    };
    this.restore = () => {
      this._stack.pop();
      this.calls.push({ name: "restore", args: [] });
    };
  }

  createLinearGradient(...args) {
    const gradient = new FakeGradient("linear", args);
    this.gradients.push(gradient);
    return gradient;
  }

  createRadialGradient(...args) {
    const gradient = new FakeGradient("radial", args);
    this.gradients.push(gradient);
    return gradient;
  }

  measureText(text) {
    return { width: text.length * 6 };
  }

  /** Every recorded call with the given name. */
  callsTo(name) {
    return this.calls.filter((call) => call.name === name);
  }

  /** True when save/restore are balanced — an unbalanced pair leaks state. */
  isBalanced() {
    return this._stack.length === 0;
  }
}

export function createFakeCanvas(clientWidth = 800, clientHeight = 500) {
  const canvas = {
    clientWidth,
    clientHeight,
    width: 300,
    height: 150,
  };
  canvas.getContext = (kind) =>
    kind === "2d" ? (canvas._ctx ??= new FakeContext2D(canvas)) : null;
  return canvas;
}

/**
 * A fake window driving requestAnimationFrame by hand, so tests can step
 * an animation loop frame by frame instead of waiting on real time.
 */
export function createFakeWindow({ devicePixelRatio = 1, reducedMotion = false } = {}) {
  let nextHandle = 1;
  const pending = new Map();
  return {
    devicePixelRatio,
    matchMedia: (query) => ({
      matches: query.includes("reduced-motion") ? reducedMotion : false,
      addEventListener() {},
      removeEventListener() {},
    }),
    requestAnimationFrame(callback) {
      const handle = nextHandle++;
      pending.set(handle, callback);
      return handle;
    },
    cancelAnimationFrame(handle) {
      pending.delete(handle);
    },
    /** Run every queued callback with the given timestamp. */
    flushFrame(now) {
      const callbacks = [...pending.values()];
      pending.clear();
      for (const callback of callbacks) {
        callback(now);
      }
    },
    pendingFrames() {
      return pending.size;
    },
  };
}
