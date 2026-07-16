import {
  IDLE_RPM,
  PLAY_RPM,
  advanceAngle,
  reelRpm,
  supplyReelRadiusRatio,
  takeUpReelRadiusRatio,
} from "./cassette.js";
import { resizeCanvasToDisplaySize } from "./canvas.js";
import { clamp } from "../audio/utils.js";

/**
 * The cassette deck, drawn on canvas. The reels are driven by real
 * playback position rather than a looping animation: reel speed comes from
 * how full each reel is, and each reel's tape pack grows and shrinks as
 * the tape moves. That correspondence is the whole point — it is visible
 * proof the audio is really being played, not decorated.
 */

const PALETTE = {
  bg: "#1c140f",
  surface1: "#2b2018",
  surface2: "#3a2c20",
  shell: "#e8e0d0",
  shellEdge: "#b8ae9b",
  shellShadow: "#8d8474",
  window: "#171009",
  tape: "#4a3524",
  tapeEdge: "#66492f",
  hub: "#2b2018",
  text: "#f4e9d8",
  textMuted: "#b9a68d",
  accent: "#e8934a",
  accentSupport: "#5a8f7b",
  danger: "#d1495b",
  label: "#f0e4cb",
};

// A cassette is ~100mm x 64mm; keeping that ratio is what makes the shape
// read as a cassette rather than a generic rounded rectangle.
const SHELL_ASPECT = 100 / 64;

const REEL_MAX_RADIUS = 0.155;
const REEL_HUB_RADIUS = 0.052;
const REEL_TEETH = 6;

function roundedRect(ctx, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

/**
 * Fit the cassette shell into the available box at its true aspect ratio,
 * centred, with margin. Letterboxing rather than stretching keeps the
 * shell proportioned at every breakpoint.
 */
export function shellLayout(width, height, margin = 0.08) {
  const boxWidth = width * (1 - margin * 2);
  const boxHeight = height * (1 - margin * 2);
  let shellWidth = boxWidth;
  let shellHeight = shellWidth / SHELL_ASPECT;
  if (shellHeight > boxHeight) {
    shellHeight = boxHeight;
    shellWidth = shellHeight * SHELL_ASPECT;
  }
  return {
    x: (width - shellWidth) / 2,
    y: (height - shellHeight) / 2,
    width: shellWidth,
    height: shellHeight,
  };
}

function drawBackground(ctx, width, height) {
  // A warm pool of lamplight rather than a flat fill, per DESIGN.md.
  const glow = ctx.createRadialGradient(
    width / 2,
    height * 0.42,
    Math.min(width, height) * 0.05,
    width / 2,
    height * 0.42,
    Math.max(width, height) * 0.75,
  );
  glow.addColorStop(0, PALETTE.surface2);
  glow.addColorStop(0.65, PALETTE.surface1);
  glow.addColorStop(1, PALETTE.bg);
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, width, height);
}

function drawShell(ctx, shell, { recording, glowStrength }) {
  const { x, y, width, height } = shell;
  const radius = height * 0.08;

  if (glowStrength > 0) {
    ctx.save();
    ctx.shadowColor = recording
      ? `rgba(209, 73, 91, ${0.55 * glowStrength})`
      : `rgba(232, 147, 74, ${0.5 * glowStrength})`;
    ctx.shadowBlur = height * 0.3 * glowStrength;
    roundedRect(ctx, x, y, width, height, radius);
    ctx.fillStyle = PALETTE.shell;
    ctx.fill();
    ctx.restore();
  }

  const body = ctx.createLinearGradient(x, y, x, y + height);
  body.addColorStop(0, "#f6f0e4");
  body.addColorStop(0.5, PALETTE.shell);
  body.addColorStop(1, PALETTE.shellEdge);
  roundedRect(ctx, x, y, width, height, radius);
  ctx.fillStyle = body;
  ctx.fill();
  ctx.strokeStyle = PALETTE.shellShadow;
  ctx.lineWidth = Math.max(1, height * 0.006);
  ctx.stroke();

  // The five shell screws — the kind of detail that makes plastic read as
  // a moulded object instead of a rectangle.
  const screwRadius = height * 0.014;
  const insets = [
    [x + width * 0.035, y + height * 0.06],
    [x + width * 0.965, y + height * 0.06],
    [x + width * 0.035, y + height * 0.94],
    [x + width * 0.965, y + height * 0.94],
    [x + width * 0.5, y + height * 0.94],
  ];
  for (const [sx, sy] of insets) {
    ctx.beginPath();
    ctx.arc(sx, sy, screwRadius, 0, Math.PI * 2);
    ctx.fillStyle = PALETTE.shellShadow;
    ctx.fill();
  }
}

function drawLabel(ctx, shell, { title, cover }) {
  const x = shell.x + shell.width * 0.08;
  const y = shell.y + shell.height * 0.1;
  const width = shell.width * 0.84;
  const height = shell.height * 0.3;

  roundedRect(ctx, x, y, width, height, shell.height * 0.02);
  ctx.fillStyle = PALETTE.label;
  ctx.fill();
  ctx.strokeStyle = "rgba(0,0,0,.15)";
  ctx.lineWidth = Math.max(1, shell.height * 0.004);
  ctx.stroke();

  // The "SIDE B" stripe along the label's head.
  ctx.fillStyle = PALETTE.accent;
  ctx.fillRect(x, y, width, height * 0.16);
  ctx.fillStyle = PALETTE.bg;
  ctx.font = `700 ${height * 0.12}px "Baloo 2", ui-rounded, sans-serif`;
  ctx.textBaseline = "middle";
  ctx.textAlign = "left";
  ctx.fillText("SIDE B", x + width * 0.02, y + height * 0.08);

  if (cover) {
    const size = height * 0.62;
    const coverX = x + width - size - width * 0.02;
    const coverY = y + height * 0.28;
    ctx.save();
    roundedRect(ctx, coverX, coverY, size, size, size * 0.12);
    ctx.clip();
    ctx.drawImage(cover, coverX, coverY, size, size);
    ctx.restore();
  }

  ctx.fillStyle = "#3a2c20";
  ctx.font = `500 ${height * 0.19}px "Baloo 2", ui-rounded, sans-serif`;
  ctx.textBaseline = "alphabetic";
  const maxWidth = cover ? width * 0.6 : width * 0.9;
  ctx.fillText(title || "Untitled tape", x + width * 0.03, y + height * 0.55, maxWidth);

  // Ruled lines, the way a real j-card invites you to write a tracklist.
  ctx.strokeStyle = "rgba(58,44,32,.25)";
  ctx.lineWidth = Math.max(1, shell.height * 0.003);
  for (let i = 0; i < 2; i++) {
    const lineY = y + height * (0.72 + i * 0.14);
    ctx.beginPath();
    ctx.moveTo(x + width * 0.03, lineY);
    ctx.lineTo(x + (cover ? width * 0.6 : width * 0.95), lineY);
    ctx.stroke();
  }
}

function drawTapePack(ctx, cx, cy, radius, shell) {
  const pack = ctx.createRadialGradient(cx, cy, shell.height * REEL_HUB_RADIUS, cx, cy, radius);
  pack.addColorStop(0, PALETTE.tapeEdge);
  pack.addColorStop(1, PALETTE.tape);
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.fillStyle = pack;
  ctx.fill();
}

function drawReel(ctx, cx, cy, angle, shell) {
  const hubRadius = shell.height * REEL_HUB_RADIUS;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(angle);

  ctx.beginPath();
  ctx.arc(0, 0, hubRadius, 0, Math.PI * 2);
  ctx.fillStyle = PALETTE.hub;
  ctx.fill();

  // Drive teeth: the visual that makes rotation legible at a glance.
  ctx.fillStyle = PALETTE.shell;
  for (let i = 0; i < REEL_TEETH; i++) {
    const a = (i / REEL_TEETH) * Math.PI * 2;
    ctx.save();
    ctx.rotate(a);
    ctx.beginPath();
    ctx.moveTo(0, -hubRadius * 0.95);
    ctx.lineTo(hubRadius * 0.28, -hubRadius * 0.45);
    ctx.lineTo(-hubRadius * 0.28, -hubRadius * 0.45);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  ctx.beginPath();
  ctx.arc(0, 0, hubRadius * 0.36, 0, Math.PI * 2);
  ctx.fillStyle = PALETTE.shellEdge;
  ctx.fill();
  ctx.restore();
}

function drawWindow(ctx, shell, state) {
  const x = shell.x + shell.width * 0.14;
  const y = shell.y + shell.height * 0.46;
  const width = shell.width * 0.72;
  const height = shell.height * 0.36;

  roundedRect(ctx, x, y, width, height, shell.height * 0.03);
  ctx.fillStyle = PALETTE.window;
  ctx.fill();

  const cy = y + height / 2;
  const supplyX = x + width * 0.26;
  const takeUpX = x + width * 0.74;
  const maxRadius = shell.height * REEL_MAX_RADIUS;

  const supplyRadius = maxRadius * supplyReelRadiusRatio(state.progress);
  const takeUpRadius = maxRadius * takeUpReelRadiusRatio(state.progress);

  drawTapePack(ctx, supplyX, cy, supplyRadius, shell);
  drawTapePack(ctx, takeUpX, cy, takeUpRadius, shell);

  // The span of tape stretched between the two packs, across the head.
  ctx.strokeStyle = PALETTE.tape;
  ctx.lineWidth = Math.max(1, shell.height * 0.022);
  ctx.beginPath();
  ctx.moveTo(supplyX, cy + supplyRadius);
  ctx.lineTo(takeUpX, cy + takeUpRadius);
  ctx.stroke();

  drawReel(ctx, supplyX, cy, state.supplyAngle, shell);
  drawReel(ctx, takeUpX, cy, state.takeUpAngle, shell);

  // Window glass: a diagonal sheen so it reads as a surface, not a hole.
  const sheen = ctx.createLinearGradient(x, y, x + width, y + height);
  sheen.addColorStop(0, "rgba(255,255,255,.10)");
  sheen.addColorStop(0.45, "rgba(255,255,255,.02)");
  sheen.addColorStop(1, "rgba(255,255,255,.07)");
  roundedRect(ctx, x, y, width, height, shell.height * 0.03);
  ctx.fillStyle = sheen;
  ctx.fill();
  ctx.strokeStyle = "rgba(0,0,0,.35)";
  ctx.lineWidth = Math.max(1, shell.height * 0.006);
  ctx.stroke();
}

function drawRecordLed(ctx, shell, { recording, pulse }) {
  const radius = shell.height * 0.022;
  const cx = shell.x + shell.width * 0.5;
  const cy = shell.y + shell.height * 0.88;
  ctx.save();
  if (recording) {
    ctx.shadowColor = PALETTE.danger;
    ctx.shadowBlur = radius * (4 + pulse * 6);
  }
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.fillStyle = recording
    ? `rgba(209,73,91,${0.55 + pulse * 0.45})`
    : "rgba(120,100,90,.5)";
  ctx.fill();
  ctx.restore();
}

/** Format seconds as the m:ss a tape counter would show. */
export function formatTapeTime(seconds) {
  const safe = Number.isFinite(seconds) && seconds > 0 ? Math.floor(seconds) : 0;
  const minutes = Math.floor(safe / 60);
  return `${minutes}:${String(safe % 60).padStart(2, "0")}`;
}

function drawCounter(ctx, shell, state) {
  const text = `${formatTapeTime(state.elapsedSeconds)} / ${formatTapeTime(
    state.totalSeconds,
  )}`;
  ctx.font = `600 ${shell.height * 0.055}px Inter, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = PALETTE.textMuted;
  ctx.fillText(text, shell.x + shell.width * 0.2, shell.y + shell.height * 0.88);
}

/**
 * Draw one frame. Pure with respect to the supplied state: everything it
 * needs is passed in, which keeps the animation loop and the drawing
 * independently testable.
 */
export function drawCassette(ctx, width, height, state) {
  ctx.clearRect(0, 0, width, height);
  drawBackground(ctx, width, height);
  const shell = shellLayout(width, height);
  drawShell(ctx, shell, state);
  drawLabel(ctx, shell, state);
  drawWindow(ctx, shell, state);
  drawCounter(ctx, shell, state);
  drawRecordLed(ctx, shell, state);
  return shell;
}

/**
 * The animation loop. Owns only the two reel angles and the glow envelope;
 * everything else it reads from the caller each frame, so the renderer
 * never becomes a second source of truth about playback.
 */
export function createCassetteRenderer(canvas, { getState, win = globalThis }) {
  if (!canvas) {
    throw new TypeError("createCassetteRenderer requires a canvas");
  }
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new TypeError("createCassetteRenderer requires a 2d context");
  }

  let supplyAngle = 0;
  let takeUpAngle = 0;
  let glowStrength = 0;
  let lastTime = null;
  let frameHandle = null;
  let running = false;

  const reducedMotion =
    win.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false;

  function frame(now) {
    if (!running) {
      return;
    }
    const deltaSeconds =
      lastTime === null ? 0 : Math.min(0.1, (now - lastTime) / 1000);
    lastTime = now;

    const state = getState();
    // Canvas geometry throws on a non-finite argument, and a throw here
    // means no next frame is requested — one bad number would freeze the
    // deck for the session rather than for a frame.
    const reported = Number(state.progress);
    const progress = Number.isNaN(reported) ? 0 : clamp(reported, 0, 1);
    const playing = Boolean(state.playing);

    // Idle-spin when stopped, so the deck never looks dead (DESIGN.md's
    // signature detail); ramp the glow rather than snapping it.
    const baseRpm = playing ? PLAY_RPM : IDLE_RPM;
    supplyAngle = advanceAngle(
      supplyAngle,
      reelRpm(supplyReelRadiusRatio(progress), baseRpm),
      deltaSeconds,
    );
    takeUpAngle = advanceAngle(
      takeUpAngle,
      reelRpm(takeUpReelRadiusRatio(progress), baseRpm),
      deltaSeconds,
    );

    const glowTarget = playing ? 1 : 0;
    // ~300ms ramp to the target, per the design's record-start juice.
    glowStrength += (glowTarget - glowStrength) * Math.min(1, deltaSeconds / 0.3);

    const pulse = reducedMotion ? 1 : (Math.sin(now / 180) + 1) / 2;

    resizeCanvasToDisplaySize(canvas, win.devicePixelRatio ?? 1);
    const ratio = canvas.width / (canvas.clientWidth || canvas.width);
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    drawCassette(ctx, canvas.width / ratio, canvas.height / ratio, {
      ...state,
      progress,
      supplyAngle,
      takeUpAngle,
      glowStrength,
      pulse,
    });

    frameHandle = win.requestAnimationFrame(frame);
  }

  return {
    start() {
      if (running) {
        return;
      }
      running = true;
      lastTime = null;
      frameHandle = win.requestAnimationFrame(frame);
    },
    stop() {
      running = false;
      if (frameHandle !== null) {
        win.cancelAnimationFrame?.(frameHandle);
        frameHandle = null;
      }
    },
    isRunning() {
      return running;
    },
  };
}
