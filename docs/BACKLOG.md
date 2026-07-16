# Backlog — Side B

Epics run roughly in order; within an epic, stories can interleave. Every story lists
concrete, checkable acceptance criteria — no vibes-based "works well."

## Epic 1 — Core tape engine & the wow moment

The demo path: drag tracks in, hit record, and the tape sound + spinning reels are
there before any settings are touched. Nothing else in the backlog matters if this
doesn't land first.

- [ ] **1.1 [WOW MOMENT] Drag three tracks in, hit record, hear live tape playback with spinning reels**
  - Dropping 2–3 local audio files into the tray and pressing Record starts playback
    routed through the full tape chain (wow/flutter + saturation + hiss) with zero
    prior configuration.
  - The canvas cassette's reels are visibly rotating within one animation frame of
    playback starting, and rotation speed visibly reflects `AudioContext.currentTime`
    (pausing playback stops reel rotation immediately).
  - Playing the same source with the tape chain bypassed vs. engaged is audibly and
    measurably different (RMS/spectral difference, not just a gain change).

- [ ] **1.2 Wire the wow/flutter delay-modulation node into the live audio graph**
  - A `DelayNode` whose delay time is driven by `wowFlutterOffsetMs` each frame is
    inserted between source and destination for every track.
  - Setting wow depth to 0 and flutter depth to 0 makes the node's output
    bit-for-bit equivalent (within float tolerance) to its input.
  - Unit tests for `wowFlutterOffsetMs` (already added in scope) continue to pass in
    CI.

- [ ] **1.3 Wire the saturation waveshaper into the live audio graph**
  - A `WaveShaperNode` built from `buildSaturationCurve` sits in the per-track chain
    with a drive amount exposed as a parameter.
  - Driving amount from 0 → 1 on a test tone audibly increases harmonic content
    (verified via an FFT bin check in a test or manual spectrum inspection noted in
    QA).
  - Amount = 0 leaves the signal within 1% RMS of the unprocessed input.

- [ ] **1.4 Wire the hiss noise floor into the live audio graph, level-matched**
  - A looped noise buffer (from `generateWhiteNoise`, band-limited via a filter) mixes
    under the program material at a level control (default subtle, not overpowering).
  - Hiss is audible in silent/quiet passages and does not clip or overpower material
    at default settings (peak output stays ≤ 0dBFS with hiss engaged).
  - Muting the master SFX/hiss toggle removes the hiss bed without stopping music
    playback.

- [ ] **1.5 Canvas cassette renderer frame-synced to playback position**
  - Reel angles use `reelRotationRadians`/`takeUpReelRadiusRatio` driven by the
    current track's elapsed playback time, recomputed every animation frame via
    `requestAnimationFrame`.
  - Canvas renders at `devicePixelRatio × CSS size` and redraws correctly after a
    window resize (checked at 390px, 768px, 1440px).
  - Reels idle-spin slowly when no mixtape is recording, per DESIGN.md's signature
    detail.

- [ ] **1.6 Design polish: deck stage matches DESIGN.md at desktop and phone**
  - At 1440×900 the deck stage occupies ~62% width per DESIGN.md's layout intent,
    with the amber glow and radial background treatment applied (no flat single-hue
    panel).
  - At 390×844 the deck stage stacks full-width above the transport controls with no
    horizontal scroll or overlap.
  - Squint test: hierarchy (deck > transport > tray) still reads with type/color
    blurred.

## Epic 2 — Mixtape composition & controls

Turning the wow-moment demo into a composable, controllable instrument.

- [ ] **2.1 Track tray: drag-and-drop add/remove/reorder with local file input**
  - Dragging a local audio file onto the tray (or using a file-picker fallback button)
    adds it using the `addTrack` helper; dropping outside the tray is a no-op.
  - Each tray row has a themed remove control that calls `removeTrack` and updates
    the UI without a full page reload.
  - Dragging a tray row to a new position calls `reorderTrack` and the visual order
    matches the returned array.

- [ ] **2.2 Per-track effect controls (wow/flutter depth, saturation drive, hiss level)**
  - Each tray row exposes three sliders (wow/flutter depth, saturation drive, hiss
    level) that update the corresponding audio node parameter within one animation
    frame of input.
  - Slider values persist per-track in the in-memory mixtape state (reordering tracks
    does not scramble which settings belong to which track).
  - All sliders are custom-styled (no unstyled native `<input type="range">`) with
    visible focus, hover, and active states.

- [ ] **2.3 Master transport controls (play/pause/stop/record) with themed states**
  - Play/Pause/Stop/Record buttons control playback of the full tray in sequence,
    and the currently active button reflects state (e.g., Record shows a pulsing
    danger-red LED while recording).
  - Every button has distinct hover, focus-visible, active (pressed/depressed), and
    disabled states per DESIGN.md's craft rules.
  - Keyboard users can reach and activate every transport control via Tab + Enter/Space.

- [ ] **2.4 Mute toggle for synth SFX, persisted in localStorage**
  - A pill-shaped mute button (per DESIGN.md) toggles all synth SFX (click, whir,
    chunk, share-confirm) without affecting tape-chain audio (hiss-as-effect keeps
    playing if it's part of the mix, only the SFX layer mutes).
  - Mute state is read from `localStorage` on load and persists across a page
    refresh.
  - The `AudioContext` is created lazily on first user gesture, and the app does not
    throw in an environment without Web Audio support (guarded, e.g. in tests).

- [ ] **2.5 Design polish: transport + controls match the juice plan**
  - Every transport button visibly depresses (~2px translate + shadow compression)
    within 90ms of a press, per DESIGN.md.
  - At least one synth SFX (click) is audible on button press with mute off, and
    silent with mute on.
  - Controls panel composes cleanly at 390px width (no cramped or overlapping
    sliders/buttons).

## Epic 3 — Cover art & sharing

The personal, homemade half of the product: a doodle instead of a template, and a
link instead of an account.

- [ ] **3.1 Doodle canvas for hand-drawn cover art**
  - A canvas pad supports freehand drawing via mouse and touch, a color picker
    (themed, not the bare native `<input type="color">`), and a clear button.
  - Drawing on touch devices works without triggering page scroll (`touch-action`
    handled).
  - The doodle can be exported as an image (data URL) that visually matches what was
    drawn.

- [ ] **3.2 Encode/decode full mixtape state (tracks + effects + cover art) to a link**
  - `encodeMixtape`/`decodeMixtape` (already added in scope) are extended to cover
    track effect settings and the doodle's data URL, and round-trip losslessly
    (verified by a unit test).
  - An encoded mixtape with 3 tracks, per-track effect settings, and a cover doodle
    stays under a reasonable URL length budget (documented in the story's QA notes;
    flagged if it risks exceeding common browser URL limits).

- [ ] **3.3 Share link UI: generate, copy, and confirm**
  - A "Share" action generates the link, copies it to the clipboard, and shows a
    themed success toast (green accent, per DESIGN.md) with a synth confirmation
    chime (respecting mute).
  - If clipboard access is unavailable/denied, the link is still shown selectable in
    the UI (no silent failure).

- [ ] **3.4 Opening a shared link reconstructs the exact mixtape**
  - Loading a URL produced by 3.2/3.3 in a fresh session reconstructs identical
    tracks, effect settings, and cover art with no additional user input required.
  - An invalid or corrupted share-link payload shows a designed error/empty state
    (not a blank page or unhandled exception).

- [ ] **3.5 Design polish: doodle pad + share flow match DESIGN.md**
  - The doodle pad and share toast use the same tokens (color, radius, shadow,
    motion timing) as the rest of the app — no visual seam between "the app" and
    "the sharing feature."
  - Responsive at 390px: doodle pad remains usable and touch targets stay ≥44px.
  - No anti-generic-ban violations present (checked against DESIGN.md's D4 ship
    gate list) on this flow.
