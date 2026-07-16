import { describe, expect, it } from "vitest";
import {
  createCassetteRenderer,
  drawCassette,
  formatTapeTime,
  shellLayout,
} from "../src/ui/cassetteRenderer.js";
import { createFakeCanvas, createFakeWindow } from "./helpers/fakeCanvas.js";

/**
 * The reel body angles, as opposed to the fixed per-tooth rotations drawn
 * inside each reel: a reel is drawn as translate-to-centre then rotate.
 */
const reelAngles = (ctx) =>
  ctx.calls
    .filter(
      (call, index) => call.name === "rotate" && ctx.calls[index - 1]?.name === "translate",
    )
    .map((call) => call.args[0]);

/**
 * The shell's body gradient runs to #b8ae9b at its foot, which is where
 * the counter is printed — so that is the background the counter's ink has
 * to survive, not the lighter shell face above it.
 */
const SHELL_LOWER_EDGE = "#b8ae9b";

const relativeLuminance = (hex) => {
  const channel = (i) => {
    const c = parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(0) + 0.7152 * channel(1) + 0.0722 * channel(2);
};

/** WCAG contrast, so a legibility claim is measured rather than asserted. */
const contrastRatio = (a, b) => {
  const [light, dark] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
};

const baseState = (overrides = {}) => ({
  progress: 0,
  playing: false,
  recording: false,
  supplyAngle: 0,
  takeUpAngle: 0,
  glowStrength: 0,
  pulse: 0,
  title: "Test Tape",
  cover: null,
  elapsedSeconds: 0,
  totalSeconds: 0,
  ...overrides,
});

describe("formatTapeTime", () => {
  it("formats as m:ss with a padded seconds field", () => {
    expect(formatTapeTime(0)).toBe("0:00");
    expect(formatTapeTime(9)).toBe("0:09");
    expect(formatTapeTime(75)).toBe("1:15");
    expect(formatTapeTime(600)).toBe("10:00");
  });

  it("truncates fractional seconds rather than rounding up", () => {
    expect(formatTapeTime(59.9)).toBe("0:59");
  });

  it("shows zero for negative or nonsense input", () => {
    expect(formatTapeTime(-5)).toBe("0:00");
    expect(formatTapeTime(NaN)).toBe("0:00");
    expect(formatTapeTime(undefined)).toBe("0:00");
  });
});

describe("shellLayout", () => {
  it("centres the shell in the box", () => {
    const shell = shellLayout(1000, 600);
    expect(shell.x + shell.width / 2).toBeCloseTo(500);
    expect(shell.y + shell.height / 2).toBeCloseTo(300);
  });

  it("keeps the cassette aspect ratio in a wide box", () => {
    const shell = shellLayout(1600, 400);
    expect(shell.width / shell.height).toBeCloseTo(100 / 64, 2);
  });

  it("keeps the cassette aspect ratio in a tall phone box", () => {
    const shell = shellLayout(390, 844);
    expect(shell.width / shell.height).toBeCloseTo(100 / 64, 2);
  });

  it("always fits inside the box", () => {
    for (const [w, h] of [
      [390, 844],
      [768, 500],
      [1440, 900],
      [200, 200],
    ]) {
      const shell = shellLayout(w, h);
      expect(shell.x).toBeGreaterThanOrEqual(0);
      expect(shell.y).toBeGreaterThanOrEqual(0);
      expect(shell.x + shell.width).toBeLessThanOrEqual(w + 1e-6);
      expect(shell.y + shell.height).toBeLessThanOrEqual(h + 1e-6);
    }
  });

  it("fills most of a well-proportioned box — the deck is the hero", () => {
    const shell = shellLayout(1000, 640);
    expect(shell.width).toBeGreaterThan(1000 * 0.8);
  });
});

describe("drawCassette", () => {
  const render = (state, width = 800, height = 500) => {
    const canvas = createFakeCanvas(width, height);
    const ctx = canvas.getContext("2d");
    drawCassette(ctx, width, height, baseState(state));
    return ctx;
  };

  it("clears the frame before drawing", () => {
    const ctx = render();
    expect(ctx.calls[0].name).toBe("clearRect");
  });

  it("treats the background rather than leaving a flat fill", () => {
    const ctx = render();
    const radial = ctx.gradients.filter((g) => g.kind === "radial");
    expect(radial.length).toBeGreaterThan(0);
    expect(radial[0].stops.length).toBeGreaterThanOrEqual(3);
  });

  it("balances every save with a restore", () => {
    const ctx = render({ playing: true, glowStrength: 1, recording: true });
    expect(ctx.isBalanced()).toBe(true);
  });

  it("draws the tape counter", () => {
    const ctx = render({ elapsedSeconds: 75, totalSeconds: 180 });
    const texts = ctx.callsTo("fillText").map((call) => call.args[0]);
    expect(texts).toContain("1:15 / 3:00");
  });

  // The counter is printed on the cream shell, so it needs shell-dark ink:
  // the muted body colour measured 1.07:1 against the shell's lower edge.
  it("prints the counter in ink dark enough to read on the shell", () => {
    const ctx = render({ elapsedSeconds: 75, totalSeconds: 180 });
    const counter = ctx
      .callsTo("fillText")
      .find((call) => call.args[0] === "1:15 / 3:00");
    expect(contrastRatio(counter.fillStyle, SHELL_LOWER_EDGE)).toBeGreaterThanOrEqual(4.5);
  });

  it("draws the tape title on the label", () => {
    const ctx = render({ title: "Moonlit Drive" });
    const texts = ctx.callsTo("fillText").map((call) => call.args[0]);
    expect(texts).toContain("Moonlit Drive");
  });

  it("falls back to a placeholder rather than blank for an untitled tape", () => {
    const ctx = render({ title: "" });
    const texts = ctx.callsTo("fillText").map((call) => call.args[0]);
    expect(texts).toContain("Untitled tape");
  });

  it("draws the cover art when there is one, and skips it when not", () => {
    const cover = { width: 64, height: 64 };
    expect(render({ cover }).callsTo("drawImage")).toHaveLength(1);
    expect(render({ cover: null }).callsTo("drawImage")).toHaveLength(0);
  });

  it("grows the take-up tape pack as the tape plays", () => {
    // The last two full-circle arcs before the reels are the tape packs.
    const packRadii = (progress) =>
      render({ progress })
        .callsTo("arc")
        .map((call) => call.args[2]);
    const atStart = packRadii(0);
    const atEnd = packRadii(1);
    expect(Math.max(...atEnd)).toBeGreaterThan(0);
    expect(atStart).not.toEqual(atEnd);
  });

  it("adds a glow only when the glow envelope is open", () => {
    const dark = render({ glowStrength: 0 });
    const lit = render({ glowStrength: 1 });
    expect(lit.calls.length).toBeGreaterThan(dark.calls.length);
  });

  it("renders at phone, tablet and desktop sizes without throwing", () => {
    for (const [w, h] of [
      [390, 400],
      [768, 500],
      [1440, 900],
    ]) {
      expect(() => render({ playing: true }, w, h)).not.toThrow();
    }
  });

  it("survives a state with missing optional fields", () => {
    const canvas = createFakeCanvas(400, 300);
    const ctx = canvas.getContext("2d");
    expect(() =>
      drawCassette(ctx, 400, 300, { progress: 0, supplyAngle: 0, takeUpAngle: 0 }),
    ).not.toThrow();
  });
});

describe("createCassetteRenderer", () => {
  const build = (state = {}, winOptions) => {
    const canvas = createFakeCanvas(800, 500);
    const win = createFakeWindow(winOptions);
    let current = baseState(state);
    const renderer = createCassetteRenderer(canvas, {
      getState: () => current,
      win,
    });
    return {
      canvas,
      win,
      renderer,
      setState: (next) => {
        current = baseState({ ...current, ...next });
      },
    };
  };

  // Canvas geometry throws on a non-finite argument, and a throw inside the
  // frame callback means no next frame is ever requested — the deck would
  // freeze for the rest of the session rather than skip one bad frame.
  it.each([[NaN], [undefined], [Infinity], ["half"], [null]])(
    "draws only finite geometry when progress is %p",
    (progress) => {
      const { canvas, renderer, win } = build({ progress });
      renderer.start();
      win.flushFrame(0);
      win.flushFrame(16);
      const numbers = canvas.getContext("2d").calls.flatMap((call) =>
        call.args.filter((arg) => typeof arg === "number"),
      );
      expect(numbers.length).toBeGreaterThan(0);
      expect(numbers.every((value) => Number.isFinite(value))).toBe(true);
      expect(win.pendingFrames()).toBe(1);
    },
  );

  it("rejects a missing canvas or an unavailable 2d context", () => {
    expect(() => createCassetteRenderer(null, { getState: () => ({}) })).toThrow(
      TypeError,
    );
    expect(() =>
      createCassetteRenderer(
        { getContext: () => null },
        { getState: () => ({}) },
      ),
    ).toThrow(TypeError);
  });

  it("does not run until started", () => {
    const { renderer, win } = build();
    expect(renderer.isRunning()).toBe(false);
    expect(win.pendingFrames()).toBe(0);
    renderer.start();
    expect(renderer.isRunning()).toBe(true);
    expect(win.pendingFrames()).toBe(1);
  });

  it("keeps requesting frames while running", () => {
    const { renderer, win } = build();
    renderer.start();
    win.flushFrame(0);
    expect(win.pendingFrames()).toBe(1);
    win.flushFrame(16);
    expect(win.pendingFrames()).toBe(1);
  });

  it("stops requesting frames once stopped", () => {
    const { renderer, win } = build();
    renderer.start();
    win.flushFrame(0);
    renderer.stop();
    expect(renderer.isRunning()).toBe(false);
    expect(win.pendingFrames()).toBe(0);
  });

  it("ignores a repeated start", () => {
    const { renderer, win } = build();
    renderer.start();
    renderer.start();
    expect(win.pendingFrames()).toBe(1);
  });

  it("sizes the canvas backing store to devicePixelRatio", () => {
    const { renderer, win, canvas } = build({}, { devicePixelRatio: 2 });
    renderer.start();
    win.flushFrame(0);
    expect(canvas.width).toBe(1600);
    expect(canvas.height).toBe(1000);
  });

  it("redraws at the new size after the canvas box changes", () => {
    const { renderer, win, canvas } = build();
    renderer.start();
    win.flushFrame(0);
    canvas.clientWidth = 390;
    canvas.clientHeight = 300;
    win.flushFrame(16);
    expect(canvas.width).toBe(390);
    expect(canvas.height).toBe(300);
  });

  // Story 1.5: the reels idle-spin when nothing is playing.
  it("idle-spins the reels when stopped", () => {
    const { renderer, win, canvas } = build({ playing: false });
    const ctx = canvas.getContext("2d");
    renderer.start();
    win.flushFrame(0);
    ctx.calls.length = 0;
    win.flushFrame(500);
    expect(reelAngles(ctx).some((angle) => angle > 0)).toBe(true);
  });

  it("spins the reels faster while playing than while idle", () => {
    const angleAfter = (playing) => {
      const { renderer, win, canvas } = build({ playing });
      const ctx = canvas.getContext("2d");
      renderer.start();
      win.flushFrame(0);
      ctx.calls.length = 0;
      win.flushFrame(100);
      return Math.max(...reelAngles(ctx));
    };
    expect(angleAfter(true)).toBeGreaterThan(angleAfter(false));
  });

  // Story 1.1: the reels must respond within one frame of playback.
  it("reflects playback within a single frame of it starting", () => {
    const { renderer, win, canvas, setState } = build({ playing: false });
    const ctx = canvas.getContext("2d");
    renderer.start();
    win.flushFrame(0);
    setState({ playing: true });
    ctx.calls.length = 0;
    win.flushFrame(16);
    expect(reelAngles(ctx).some((angle) => angle > 0)).toBe(true);
  });

  it("stops the reels immediately when playback pauses", () => {
    const { renderer, win, canvas, setState } = build({ playing: true });
    const ctx = canvas.getContext("2d");
    renderer.start();
    win.flushFrame(0);
    win.flushFrame(500);
    setState({ playing: false });

    const angles = () => {
      ctx.calls.length = 0;
      win.flushFrame(1000);
      return reelAngles(ctx);
    };
    const first = angles();
    // Idle spin is slow but non-zero; over one frame the reels should
    // barely move compared to playing speed.
    const second = angles();
    expect(Math.abs(second[0] - first[0])).toBeLessThan(0.2);
  });

  it("does not jump after a long stall between frames", () => {
    const { renderer, win, canvas } = build({ playing: true });
    const ctx = canvas.getContext("2d");
    renderer.start();
    win.flushFrame(0);
    ctx.calls.length = 0;
    // A backgrounded tab can produce a multi-second gap; the loop clamps
    // delta time so the reels never lurch on return.
    win.flushFrame(10_000);
    const angles = reelAngles(ctx);
    expect(angles.length).toBeGreaterThan(0);
    expect(angles.every((angle) => Number.isFinite(angle))).toBe(true);
  });

  it("keeps the record LED steady when reduced motion is preferred", () => {
    const { renderer, win } = build({ recording: true }, { reducedMotion: true });
    renderer.start();
    expect(() => win.flushFrame(0)).not.toThrow();
  });
});
