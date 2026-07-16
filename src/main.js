import { createAudioContext, createPlayer } from "./audio/player.js";
import { AudioLoadError, createLibrary } from "./audio/library.js";
import { createSfx, readMutePreference, writeMutePreference } from "./audio/sfx.js";
import {
  EFFECT_KEYS,
  createMixtape,
  setTrackEffect,
  tapeProgress,
  totalDurationSeconds,
} from "./mixtape/state.js";
import {
  ShareLinkError,
  buildShareUrl,
  isShareUrlSafe,
  readMixtapeFromUrl,
} from "./mixtape/shareLink.js";
import { createCassetteRenderer, formatTapeTime } from "./ui/cassetteRenderer.js";
import { addTrack, removeTrack, reorderTrack } from "./ui/tray.js";
import { ICONS, append, clear, el, icon } from "./ui/dom.js";
import { createToaster } from "./ui/toast.js";
import {
  COVER_COLORS,
  appendPoint,
  createCover,
  createStroke,
  drawCover,
  isCoverEmpty,
  toCoverSpace,
} from "./ui/doodle.js";

/**
 * The composition root. Owns the mixtape state and wires the engine (the
 * player and its tape chains) to the views (the deck canvas, the tray, the
 * doodle pad). Everything it imports is independently unit-tested; this
 * file is the part that can only be judged by using it.
 */

const EFFECT_LABELS = {
  wowFlutter: "Wow & flutter",
  saturation: "Saturation",
  hiss: "Hiss",
};

const COVER_EXPORT_SIZE = 512;

const SAMPLE_SHELF = [
  { sampleId: "moonlit-drive", title: "Moonlit Drive" },
  { sampleId: "basement-tape", title: "Basement Tape" },
  { sampleId: "porch-light", title: "Porch Light" },
];

function boot() {
  const root = document.getElementById("app");
  if (!root) {
    throw new Error("missing #app root element");
  }

  // ---- state ---------------------------------------------------------

  let mixtape = createMixtape({ tracks: [] });
  let cover = createCover([]);
  let context = null;
  let library = null;
  let player = null;
  let sfx = null;
  let coverImage = null;
  let activeStroke = null;
  let strokeColor = COVER_COLORS[0];
  let linkError = null;
  let pendingMixtape = null;
  // Mirrored here because the mute button must show the stored preference
  // at boot, long before a gesture creates the AudioContext and the SFX bus.
  let muted = false;

  const refs = {};

  function safeStorage() {
    try {
      return globalThis.localStorage ?? null;
    } catch {
      // Storage access throws outright in some sandboxed contexts.
      return null;
    }
  }

  /**
   * The AudioContext is created on the first real gesture, per the autoplay
   * policy — and everything depending on it is built at that same moment.
   */
  function ensureAudio() {
    if (context) {
      if (context.state === "suspended") {
        context.resume();
      }
      return context;
    }
    context = createAudioContext();
    if (!context) {
      toaster.show("This browser has no Web Audio support, so the deck can't run.", {
        tone: "error",
      });
      return null;
    }
    library = createLibrary({ context });
    sfx = createSfx({ context, storage: safeStorage() });
    muted = sfx.isMuted();
    player = createPlayer({ context, getBuffer: (track) => library.get(track.id) });
    player.onStateChange(renderTransport);
    syncMuteButton();
    hydratePending();
    renderTray();
    renderTransport();
    return context;
  }

  const sound = (name) => sfx?.play(name);

  // ---- shared-link intake --------------------------------------------

  function readSharedTape() {
    try {
      const shared = readMixtapeFromUrl(window.location.href);
      if (shared) {
        pendingMixtape = shared;
        mixtape = shared;
        cover = shared.cover ?? createCover([]);
        redrawCoverImage();
      }
    } catch (error) {
      // Story 3.4: a broken link gets a designed state, not a blank page.
      linkError =
        error instanceof ShareLinkError ? error.message : "this link could not be read";
    }
  }

  function hydratePending() {
    if (!pendingMixtape || !library) {
      return;
    }
    library.hydrate(pendingMixtape);
    const missing = library.missingTracks(pendingMixtape);
    if (missing.length > 0) {
      const plural = missing.length > 1;
      toaster.show(
        `${missing.length} track${plural ? "s" : ""} on this tape came from the sender's own files. Add ${plural ? "them" : "it"} to hear the whole tape.`,
        { tone: "info", duration: 6000 },
      );
    }
    pendingMixtape = null;
  }

  // ---- deck ----------------------------------------------------------

  function deckState() {
    const elapsed = player?.elapsedSeconds() ?? 0;
    const playing = player?.isPlaying() ?? false;
    return {
      progress: tapeProgress(mixtape, elapsed),
      playing,
      recording: playing,
      title: mixtape.title,
      cover: coverImage,
      elapsedSeconds: elapsed,
      totalSeconds: totalDurationSeconds(mixtape),
    };
  }

  /**
   * The doodle is rasterized once per change into an offscreen canvas so
   * the deck's animation loop can blit it, rather than re-stroking every
   * path sixty times a second.
   */
  function redrawCoverImage() {
    if (isCoverEmpty(cover)) {
      coverImage = null;
      return;
    }
    const offscreen = document.createElement("canvas");
    offscreen.width = COVER_EXPORT_SIZE;
    offscreen.height = COVER_EXPORT_SIZE;
    const ctx = offscreen.getContext("2d");
    if (!ctx) {
      coverImage = null;
      return;
    }
    drawCover(ctx, cover, COVER_EXPORT_SIZE, { background: "#f0e4cb" });
    coverImage = offscreen;
  }

  // ---- transport -----------------------------------------------------

  function play() {
    if (!ensureAudio() || mixtape.tracks.length === 0) {
      return;
    }
    if (player.state === "paused") {
      player.resume();
    } else {
      player.play(mixtape);
    }
    sound("whirUp");
  }

  function pause() {
    if (player?.pause()) {
      sound("whirDown");
    }
  }

  function stop() {
    if (player?.stop()) {
      sound("whirDown");
    }
  }

  function record() {
    if (!ensureAudio() || mixtape.tracks.length === 0) {
      return;
    }
    player.play(mixtape, 0);
    sound("whirUp");
  }

  // ---- tray ----------------------------------------------------------

  async function addFiles(files) {
    if (!ensureAudio()) {
      return;
    }
    for (const file of files) {
      try {
        const track = await library.addFile(file);
        mixtape = { ...mixtape, tracks: addTrack(mixtape.tracks, track) };
        sound("chunk");
      } catch (error) {
        // Bad input is a designed state, never a console stack trace.
        toaster.show(
          error instanceof AudioLoadError ? error.message : `${file.name} could not be added`,
          { tone: "error" },
        );
      }
    }
    renderTray();
    renderTransport();
  }

  function addSample(sampleId) {
    if (!ensureAudio()) {
      return;
    }
    try {
      const track = library.createSampleTrack(sampleId);
      mixtape = { ...mixtape, tracks: addTrack(mixtape.tracks, track) };
      sound("chunk");
      renderTray();
      renderTransport();
    } catch {
      toaster.show("That track could not be loaded.", { tone: "error" });
    }
  }

  function dropTrack(trackId) {
    mixtape = { ...mixtape, tracks: removeTrack(mixtape.tracks, trackId) };
    library?.forget(trackId);
    sound("click");
    if (mixtape.tracks.length === 0) {
      player?.stop();
    }
    renderTray();
    renderTransport();
  }

  function moveTrack(fromIndex, toIndex) {
    const tracks = reorderTrack(mixtape.tracks, fromIndex, toIndex);
    if (tracks === mixtape.tracks) {
      return;
    }
    mixtape = { ...mixtape, tracks };
    sound("click");
    renderTray();
  }

  function setEffect(trackId, key, amount) {
    mixtape = setTrackEffect(mixtape, trackId, key, amount);
    const track = mixtape.tracks.find((entry) => entry.id === trackId);
    // Live: there is no baked file, so the graph changes underneath.
    player?.setTrackEffects(trackId, track.effects);
  }

  // ---- sharing -------------------------------------------------------

  async function copyToClipboard(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      return false;
    }
  }

  async function share() {
    if (mixtape.tracks.length === 0) {
      toaster.show("Add a track before sharing your tape.", { tone: "error" });
      return;
    }
    const tape = { ...mixtape, cover: isCoverEmpty(cover) ? null : cover };
    let url;
    try {
      url = buildShareUrl(tape, window.location.href);
    } catch {
      toaster.show("This tape could not be turned into a link.", { tone: "error" });
      return;
    }

    window.history.replaceState(null, "", url);
    sound("tapeClick");

    if (!isShareUrlSafe(url)) {
      toaster.show(
        "This tape's link is very long — some apps may cut it short. A simpler doodle keeps it shorter.",
        { tone: "error" },
      );
      return;
    }

    if (await copyToClipboard(url)) {
      toaster.show("Link copied — your tape is in your clipboard.", { tone: "success" });
      return;
    }
    // Story 3.3: a clipboard denial must not be a silent failure.
    toaster.show("Copy this link to share your tape:", {
      tone: "info",
      action: el("input", {
        class: "toast__link",
        value: url,
        readOnly: true,
        "aria-label": "Your mixtape link",
        onFocus: (event) => event.target.select(),
      }),
    });
  }

  // ---- views ---------------------------------------------------------

  function wordmark() {
    return el("h1", { class: "wordmark" }, [
      el("span", { class: "wordmark__side" }, "Side"),
      el("span", { class: "wordmark__b" }, "B"),
    ]);
  }

  function transportButton({ name, label, iconPath, onClick, variant = "" }) {
    return el(
      "button",
      {
        type: "button",
        class: `deck-button ${variant}`.trim(),
        dataset: { transport: name },
        "aria-label": label,
        onClick: () => {
          sound("click");
          onClick();
        },
      },
      [icon(iconPath), el("span", { class: "deck-button__label" }, label)],
    );
  }

  function renderTransport() {
    const bar = refs.transport;
    if (!bar) {
      return;
    }
    const empty = mixtape.tracks.length === 0;
    const playing = player?.isPlaying() ?? false;
    for (const button of bar.querySelectorAll("[data-transport]")) {
      const name = button.dataset.transport;
      button.disabled = empty || (name === "pause" && !playing);
      button.classList.toggle(
        "is-active",
        playing && (name === "record" || name === "play"),
      );
    }
    refs.recordLed?.classList.toggle("is-recording", playing);
    const count = mixtape.tracks.length;
    refs.status.textContent = empty
      ? "Empty tape — drop some tracks in"
      : playing
        ? `Recording · ${formatTapeTime(totalDurationSeconds(mixtape))} of tape`
        : `Ready · ${count} track${count > 1 ? "s" : ""} · ${formatTapeTime(totalDurationSeconds(mixtape))}`;
  }

  function effectSlider(track, key) {
    const percent = Math.round(track.effects[key] * 100);
    const output = el("output", { class: "slider__value" }, String(percent));
    return el("label", { class: "slider" }, [
      el("span", { class: "slider__label" }, [EFFECT_LABELS[key], output]),
      el("input", {
        type: "range",
        class: "slider__input",
        min: "0",
        max: "100",
        value: String(percent),
        "aria-label": `${EFFECT_LABELS[key]} for ${track.title}`,
        onInput: (event) => {
          const amount = Number(event.target.value) / 100;
          output.textContent = String(Math.round(amount * 100));
          setEffect(track.id, key, amount);
        },
      }),
    ]);
  }

  function trackRow(track, index) {
    const missing = library ? !library.has(track.id) : false;
    return el(
      "li",
      {
        class: `track${missing ? " track--missing" : ""}`,
        draggable: "true",
        dataset: { index: String(index) },
        onDragstart: (event) => {
          event.dataTransfer.setData("text/plain", String(index));
          event.dataTransfer.effectAllowed = "move";
          event.currentTarget.classList.add("is-dragging");
        },
        onDragend: (event) => event.currentTarget.classList.remove("is-dragging"),
        onDragover: (event) => {
          event.preventDefault();
          event.currentTarget.classList.add("is-over");
        },
        onDragleave: (event) => event.currentTarget.classList.remove("is-over"),
        onDrop: (event) => {
          event.preventDefault();
          // Without this the tray's own file-drop handler also fires.
          event.stopPropagation();
          event.currentTarget.classList.remove("is-over");
          const from = Number(event.dataTransfer.getData("text/plain"));
          if (Number.isInteger(from)) {
            moveTrack(from, index);
          }
        },
      },
      [
        el("div", { class: "track__head" }, [
          el("span", { class: "track__grip", "aria-hidden": "true" }, "⠿"),
          el("div", { class: "track__meta" }, [
            el("span", { class: "track__title" }, track.title),
            el(
              "span",
              { class: "track__sub" },
              missing
                ? "audio missing — add this file"
                : `${formatTapeTime(track.durationSeconds)} · ${track.source === "sample" ? "built-in" : "your file"}`,
            ),
          ]),
          el(
            "button",
            {
              type: "button",
              class: "icon-button",
              "aria-label": `Remove ${track.title}`,
              onClick: () => dropTrack(track.id),
            },
            [icon(ICONS.trash, { size: 18 })],
          ),
        ]),
        el(
          "div",
          { class: "track__effects" },
          EFFECT_KEYS.map((key) => effectSlider(track, key)),
        ),
      ],
    );
  }

  function renderTray() {
    const list = refs.trackList;
    if (!list) {
      return;
    }
    clear(list);
    if (mixtape.tracks.length === 0) {
      list.append(
        el("li", { class: "tray-empty" }, [
          el("span", { class: "tray-empty__reel", "aria-hidden": "true" }),
          el("p", { class: "tray-empty__title" }, "The tray is empty"),
          el(
            "p",
            { class: "tray-empty__hint" },
            "Drop an audio file here, or start with a built-in track below.",
          ),
        ]),
      );
      return;
    }
    mixtape.tracks.forEach((track, index) => list.append(trackRow(track, index)));
  }

  function renderSampleShelf() {
    // The catalogue is static, so it lists before any AudioContext exists —
    // clicking one is the gesture that creates it.
    return el(
      "div",
      { class: "shelf" },
      SAMPLE_SHELF.map((spec) =>
        el(
          "button",
          { type: "button", class: "chip", onClick: () => addSample(spec.sampleId) },
          [el("span", { class: "chip__dot", "aria-hidden": "true" }), spec.title],
        ),
      ),
    );
  }

  function renderDoodlePad() {
    const canvas = el("canvas", {
      class: "doodle__pad",
      width: 400,
      height: 400,
      role: "img",
      "aria-label": "Cover art you draw yourself",
    });

    const redraw = () => {
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        return;
      }
      const ratio = Math.min(globalThis.devicePixelRatio ?? 1, 2);
      const size = canvas.clientWidth || 300;
      const target = Math.round(size * ratio);
      if (canvas.width !== target) {
        canvas.width = target;
        canvas.height = target;
      }
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      drawCover(ctx, cover, size, { background: "#f0e4cb" });
    };
    refs.redrawDoodle = redraw;

    const pointAt = (event) =>
      toCoverSpace(event.clientX, event.clientY, canvas.getBoundingClientRect());

    canvas.addEventListener("pointerdown", (event) => {
      // Capture keeps the stroke alive if the pointer leaves the pad;
      // preventDefault stops a touch drag from scrolling the page.
      event.preventDefault();
      canvas.setPointerCapture?.(event.pointerId);
      const stroke = appendPoint(createStroke(strokeColor), pointAt(event));
      cover = createCover([...cover.strokes, stroke]);
      activeStroke = cover.strokes.at(-1);
      redraw();
    });

    canvas.addEventListener("pointermove", (event) => {
      if (!activeStroke) {
        return;
      }
      event.preventDefault();
      appendPoint(activeStroke, pointAt(event));
      redraw();
    });

    const endStroke = () => {
      if (!activeStroke) {
        return;
      }
      activeStroke = null;
      redrawCoverImage();
      sound("click");
    };
    canvas.addEventListener("pointerup", endStroke);
    canvas.addEventListener("pointercancel", endStroke);

    const swatches = el(
      "div",
      { class: "swatches", role: "group", "aria-label": "Pen colour" },
      COVER_COLORS.map((color) =>
        el("button", {
          type: "button",
          class: `swatch${color === strokeColor ? " is-selected" : ""}`,
          style: { "--swatch": color },
          "aria-label": `Pen colour ${color}`,
          "aria-pressed": String(color === strokeColor),
          onClick: (event) => {
            strokeColor = color;
            sound("click");
            for (const node of swatches.children) {
              const selected = node === event.currentTarget;
              node.classList.toggle("is-selected", selected);
              node.setAttribute("aria-pressed", String(selected));
            }
          },
        }),
      ),
    );

    const undo = () => {
      if (cover.strokes.length === 0) {
        return;
      }
      cover = createCover(cover.strokes.slice(0, -1));
      redraw();
      redrawCoverImage();
      sound("click");
    };

    const clearCover = () => {
      cover = createCover([]);
      redraw();
      redrawCoverImage();
      sound("click");
    };

    return el("section", { class: "panel doodle", "aria-label": "Cover art" }, [
      el("header", { class: "panel__head" }, [
        el("h2", { class: "panel__title" }, "Cover art"),
        el("div", { class: "panel__actions" }, [
          el("button", { type: "button", class: "text-button", onClick: undo }, [
            icon(ICONS.undo, { size: 16 }),
            "Undo",
          ]),
          el("button", { type: "button", class: "text-button", onClick: clearCover }, "Clear"),
        ]),
      ]),
      canvas,
      swatches,
    ]);
  }

  function renderLinkError() {
    if (!linkError) {
      return null;
    }
    return el("div", { class: "banner banner--error", role: "alert" }, [
      el("p", { class: "banner__text" }, [
        el("strong", {}, "That tape wouldn't play. "),
        `${linkError}. Start a fresh one below.`,
      ]),
      el(
        "button",
        {
          type: "button",
          class: "text-button",
          onClick: (event) => {
            linkError = null;
            window.history.replaceState(null, "", window.location.pathname);
            event.currentTarget.closest(".banner").remove();
          },
        },
        "Dismiss",
      ),
    ]);
  }

  function syncMuteButton() {
    refs.mute.setAttribute("aria-pressed", String(muted));
    refs.mute.classList.toggle("is-muted", muted);
    clear(refs.mute).append(
      icon(muted ? ICONS.muted : ICONS.sound, { size: 18 }),
      el("span", {}, muted ? "Sound off" : "Sound on"),
    );
  }

  // ---- layout --------------------------------------------------------

  const toasterHost = el("div", { class: "toaster-host" });
  const toaster = createToaster(toasterHost);

  readSharedTape();

  const deckCanvas = el("canvas", {
    class: "deck__canvas",
    role: "img",
    "aria-label": "Cassette deck. The reels turn while the tape plays.",
  });

  const fileInput = el("input", {
    type: "file",
    accept: "audio/*",
    multiple: true,
    class: "visually-hidden",
    id: "file-input",
    onChange: (event) => {
      addFiles([...event.target.files]);
      // Reset, so re-picking the same file still fires a change event.
      event.target.value = "";
    },
  });

  refs.status = el("p", {
    class: "deck__status",
    role: "status",
    "aria-live": "polite",
  });
  refs.recordLed = el("span", { class: "led", "aria-hidden": "true" });

  refs.transport = el(
    "div",
    { class: "transport", role: "group", "aria-label": "Transport" },
    [
      transportButton({
        name: "record",
        label: "Record",
        iconPath: ICONS.record,
        variant: "deck-button--record",
        onClick: record,
      }),
      transportButton({ name: "play", label: "Play", iconPath: ICONS.play, onClick: play }),
      transportButton({ name: "pause", label: "Pause", iconPath: ICONS.pause, onClick: pause }),
      transportButton({ name: "stop", label: "Stop", iconPath: ICONS.stop, onClick: stop }),
    ],
  );

  refs.trackList = el("ul", { class: "tray__list" });

  refs.mute = el(
    "button",
    {
      type: "button",
      class: "pill",
      "aria-pressed": "false",
      onClick: () => {
        // Toggling sound is itself the gesture that may create the context.
        ensureAudio();
        muted = sfx ? sfx.toggleMute() : !muted;
        if (!sfx) {
          // No Web Audio here, but the preference should still stick.
          writeMutePreference(safeStorage(), muted);
        }
        syncMuteButton();
        if (!muted) {
          sound("click");
        }
      },
    },
    [icon(ICONS.sound, { size: 18 }), el("span", {}, "Sound on")],
  );

  const tray = el(
    "section",
    {
      class: "panel tray",
      "aria-label": "Track tray",
      onDragover: (event) => {
        event.preventDefault();
        tray.classList.add("is-over");
      },
      onDragleave: () => tray.classList.remove("is-over"),
      onDrop: (event) => {
        event.preventDefault();
        tray.classList.remove("is-over");
        const files = [...(event.dataTransfer?.files ?? [])];
        if (files.length > 0) {
          addFiles(files);
        }
      },
    },
    [
      el("header", { class: "panel__head" }, [
        el("h2", { class: "panel__title" }, "Track tray"),
        el("label", { class: "text-button", for: "file-input" }, [
          icon(ICONS.eject, { size: 16 }),
          "Add files",
        ]),
      ]),
      fileInput,
      refs.trackList,
      el("p", { class: "shelf__label" }, "Or start with a built-in track"),
      renderSampleShelf(),
    ],
  );

  append(
    root,
    el("div", { class: "grain", "aria-hidden": "true" }),
    el("header", { class: "topbar" }, [
      wordmark(),
      el("p", { class: "tagline" }, "Records to tape, not to a file."),
      el("div", { class: "topbar__actions" }, [
        refs.mute,
        el("button", { type: "button", class: "button button--primary", onClick: share }, [
          icon(ICONS.share, { size: 18 }),
          "Share tape",
        ]),
      ]),
    ]),
    renderLinkError(),
    el("main", { class: "deck-page" }, [
      el("section", { class: "deck", "aria-label": "Cassette deck" }, [
        deckCanvas,
        el("div", { class: "deck__bar" }, [
          el("div", { class: "deck__readout" }, [refs.recordLed, refs.status]),
          refs.transport,
        ]),
      ]),
      el("aside", { class: "deck-panel" }, [tray, renderDoodlePad()]),
    ]),
    toasterHost,
  );

  muted = readMutePreference(safeStorage());
  syncMuteButton();
  renderTray();
  renderTransport();
  refs.redrawDoodle?.();

  createCassetteRenderer(deckCanvas, { getState: deckState }).start();

  // Keep the wobble moving on every live chain, once per frame.
  const tick = () => {
    player?.update();
    globalThis.requestAnimationFrame(tick);
  };
  globalThis.requestAnimationFrame(tick);

  window.addEventListener("resize", () => refs.redrawDoodle?.());
}

boot();
