# Design — Side B

## 1. Aesthetic direction

**Warm tactile toy.** Side B feels like a physical object you'd find on a thrift-store
shelf: a cream plastic cassette deck body, worn amber lamplight, chunky rounded
buttons that visibly depress, and a hand-labeled tape shell. Nothing here is a flat
"dark gray cards" dashboard — every surface reads as a material (plastic, foam, paper
label) rather than an abstract panel.

## 2. Tokens

| Token | Value | Use |
|---|---|---|
| `--bg` | `#1c140f` | page background — espresso brown |
| `--surface-1` | `#2b2018` | deck body / primary panels |
| `--surface-2` | `#3a2c20` | raised panels, tray, cards |
| `--text` | `#f4e9d8` | primary text — warm cream |
| `--text-muted` | `#b9a68d` | secondary text, labels |
| `--accent` | `#e8934a` | primary accent — amber lamplight (buttons, reels highlight, focus) |
| `--accent-support` | `#5a8f7b` | support accent — faded tape-green (secondary controls, VU idle) |
| `--danger` | `#d1495b` | record indicator, destructive actions |
| `--success` | `#7fae5a` | saved / share confirmations |

**Type pairing:** [Baloo 2](https://fonts.google.com/specimen/Baloo+2) (display —
rounded, chunky, toy-like weight) for the wordmark and headings; [Inter](https://fonts.google.com/specimen/Inter)
(UI) for body text and controls. System fallback stack: `"Baloo 2", ui-rounded, sans-serif`
and `Inter, -apple-system, "Segoe UI", sans-serif`.

**Spacing:** 8px base scale (8/16/24/32/48/64).

**Corner radius:** 14px on panels and buttons; 999px (pill) on toggles and the mute
button — chunky, never sharp.

**Shadow / glow:** layered warm-brown shadows (`0 2px 4px rgba(0,0,0,.4), 0 8px 24px
rgba(0,0,0,.35)`) for raised panels; a soft amber glow (`0 0 24px rgba(232,147,74,.25)`)
behind the active/recording cassette.

**Motion:** UI transitions 160ms ease-out; tactile feedback (button press, reel
tick) 90–120ms ease-out. Reels use a continuous linear rotation driven by playback
time, not eased.

## 3. Layout intent

The **hero is the cassette player** — a large skeuomorphic cassette deck rendered on
canvas, reels frame-synced to playback position. It anchors the page and takes the
visual majority of the viewport.

- **1440×900 desktop:** cassette deck fills the left ~62% of the viewport (large,
  centered vertically); the track tray, transport controls, and tape-effect knobs
  occupy the right ~38% as a stacked panel. No empty gutters — the deck's warm glow
  and background texture extend to the panel's edge.
- **390×844 phone:** cassette deck stacks on top (full width, ~55% of viewport
  height), transport controls directly below it, track tray and effects panel
  scrolls beneath. Controls sized for touch (≥44px).

## 4. Signature detail

The reels **idle-spin slowly** even before any recording starts — a slow ambient
rotation with a faint amber highlight sweeping across the tape window — so the deck
never looks static or dead on load. The wordmark "Side B" is set in Baloo 2 with a
tape-label tilt (a slight rotation and a hand-written underline stroke) evoking a
label scrawled on a cassette shell.

## 5. Juice plan

- **Button press:** every transport button (play/record/stop/eject) depresses
  visually (~2px translate + shadow compression) within 90ms of input.
- **Record start:** reels tween from idle speed to record speed over ~300ms; a
  warm amber glow ramps in around the deck; the danger-red record LED pulses.
- **Track drop into tray:** dropped track card springs into place (scale 0.9→1,
  120ms ease-out) with a soft "chunk" sound.
- **Save / share:** success toast slides in with a green accent pulse and a
  confetti-free but satisfying "tape-click" — no particle overload, this is a toy,
  not a game win screen.
- **Synth SFX (WebAudio-generated, no audio files):**
  - `click` — short filtered noise burst + pitch blip, for every button press.
  - `whir-up` / `whir-down` — a short ramped sawtooth/noise motor sound on
    record/stop transitions.
  - `chunk` — low thump (short sine burst + noise) for track drop and eject.
  - `tape-hiss` — continuous filtered noise bed, only audible while a mixtape is
    "recording" or playing back through the tape chain (this is also the actual
    DSP hiss, doing double duty as feedback and effect).
  - `share-confirm` — bright short chime (two-note sine) on successful share-link
    generation.
  - All SFX route through a master SFX gain with a **mute toggle** (pill button,
    top-right of the deck panel) whose state persists in `localStorage`. The
    `AudioContext` is created lazily on first user gesture.
- Respect `prefers-reduced-motion`: idle reel spin and button-press translate
  keep functioning (state still communicated) but glow ramps and toast slides
  drop to instant/opacity-only transitions.
