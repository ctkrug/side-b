# Architecture — Side B

A static, client-only site. No backend, no accounts, no build-time audio
assets: every sound is either synthesized in code or decoded from a file the
visitor picks, and the whole mixtape rides in the URL.

## How to run

| Task | Command |
|---|---|
| Dev server | `npm run dev` |
| Unit tests | `npm test` (vitest) |
| Coverage | `npm run coverage` |
| Lint | `npm run lint` |
| Production build | `npm run build` → `site/` (committed; this is what gets published) |
| Preview the build | `npm run preview` |

The build is base-path relative (`base: "./"` in `vite.config.js`) so it can be
served from a subpath such as `apps.charliekrug.com/side-b/`. Nothing may use a
leading-slash asset path.

## The shape of it

```
index.html          fonts, favicon (inline SVG), stylesheet links, #app root
src/main.js         composition root — owns mixtape state, wires engine to views
src/audio/          the tape engine
src/mixtape/        the model and the share-link codec
src/ui/             canvas rendering, the doodle pad, DOM helpers
src/styles/         main.css (tokens) · layout.css (composition) · components.css
```

### `src/audio` — the engine

| File | Responsibility |
|---|---|
| `utils.js` | `clamp` / `lerp` / `dbToGain` |
| `wowFlutter.js` | `wowFlutterOffsetMs` — two summed LFOs (slow wow + fast flutter) |
| `saturation.js` | cubic soft-clip curve for a `WaveShaperNode`, plus its makeup gain |
| `noise.js` | white noise generation and a seeded PRNG for tests |
| `analysis.js` | RMS / peak / Goertzel / THD — lets tests *measure* the DSP |
| `sampleTracks.js` | the three built-in tracks, synthesized deterministically to PCM |
| `tapeChain.js` | **the tape chain** — assembles the live per-track graph |
| `player.js` | the transport: schedules tracks, owns elapsed time, parks at the end of the tape |
| `library.js` | resolves tracks → `AudioBuffer` (synth samples, decoded files) |
| `sfx.js` | synthesized interface sounds + the persisted mute preference |

### `src/mixtape` — the model

- `state.js` — the mixtape/track shape, effect normalization (always clamped
  0..1), and the playhead maths (`trackAtElapsed`, `tapeProgress`).
- `shareLink.js` — the codec, `buildShareUrl` / `readMixtapeFromUrl`, and
  `ShareLinkError` for anything malformed.

### `src/ui` — the views

- `cassette.js` — reel maths (radius ratios, RPM from radius, angle integration).
- `cassetteRenderer.js` — draws the deck; owns the animation loop.
- `canvas.js` — devicePixelRatio-aware backing-store sizing.
- `doodle.js` — the cover art model (vector strokes) and its packed form.
- `dom.js` / `toast.js` — the element builder, icon set and the toaster.

## Data flow

```
                  ┌────────── main.js (owns `mixtape`) ──────────┐
                  │                                              │
  tray / sliders ─┤ setTrackEffect ─→ player.setTrackEffects ────┼─→ live graph
  transport ──────┤ play/pause/stop ─→ player                    │
  doodle pad ─────┤ cover strokes ─→ rasterized → deck label     │
  share ──────────┤ buildShareUrl(mixtape + cover) → location    │
                  └──────────────────────────────────────────────┘
                                   ↑
      on load: readMixtapeFromUrl(location) → library.hydrate()
```

**The audio graph, one chain per track** (`createTapeChain`):

```
 source ─→ input ─→ delay ─┬─→ dry gain ─────────────────────┬─→ output ─→ master
                           └─→ wet gain → shaper → makeup ───┤
           noise (looped) ─→ bandpass ─→ hiss gain ──────────┘
```

- **Wow & flutter** is the `delay` node: `player.update()` runs once per frame
  and writes `delaySecondsAt(t, amount)` into `delayTime`. Modulating a delay
  line shifts pitch, exactly as a drifting transport does. Depth 0 pins the
  delay to a constant, making the node a pass-through.
- **Saturation** is a *dry/wet crossfade*, not an always-on waveshaper, so
  amount 0 is genuinely transparent (measured THD 0.000) rather than merely
  subtle. Makeup gain is derived from the curve so the wet path hits the same
  ceiling as the dry.
- **Hiss** joins *after* saturation, because tape adds its noise floor to the
  recording rather than to the source.

**Timing.** Elapsed tape position comes from `AudioContext.currentTime`, never
`Date.now()` — that is what keeps the reels locked to the audio. The player
schedules every track ahead in a single pass on the audio clock, so track
transitions are sample-accurate instead of timer-driven.

## Decisions worth knowing

- **Sample tracks are synthesized, not shipped.** A share link can name a
  sample and the recipient's browser rebuilds identical audio; a local file
  could never survive the trip. It also makes the wow moment reachable with
  zero setup. Tracks from someone's own files arrive as *missing* — listed,
  with a prompt to supply the file, never silently dropped.
- **Cover art is vector strokes, not a PNG data URL.** A few hundred packed
  integers fit in a URL; a raster image does not. `packCover` indexes colors
  and integerizes coordinates. Budget is checked with `isShareUrlSafe`
  (2000 chars); a three-track tape with a modest doodle lands near 500.
- **State lives in the hash**, so a mixtape never reaches a server.
- **Errors are handled at the boundary.** `ShareLinkError` and `AudioLoadError`
  are the only two error types the UI presents; a corrupt link yields a
  designed banner and a working app, never a blank page.
- **A link is a stranger's input.** Opening one costs real memory: every
  sample track it names is synthesized to PCM on arrival, so `MAX_TRACKS`
  (64) bounds what a URL can ask the browser to build. Deliberately *not* a
  cap on payload length — an over-budget link still decodes, since
  `SAFE_URL_LENGTH` warns rather than blocks, and a big doodle is cheap
  where a track is not.
- **A tape is cut in one take.** The player schedules every voice ahead on
  the audio clock from one snapshot of the tracklist, so an edit made while
  the tape rolls cannot reach the take that is already playing. Any tray
  edit therefore goes through `player.retape`, which adopts the new list and
  parks the transport: you re-cut a tape from the top, not in the middle.

## Testing

`npm test` — 444 tests, no browser required. `npm run coverage` reports
99.7% of lines across `src/`, excluding `main.js` (see below).

- Pure logic (DSP maths, state, codec, reel physics) is tested directly.
- The Web Audio graph is tested against `test/helpers/fakeAudioContext.js`, a
  recording fake; tests locate nodes by **following connections**, not by
  construction order, so they survive a rewiring.
- Canvas rendering is tested against `test/helpers/fakeCanvas.js`, which records
  draw calls and drives `requestAnimationFrame` by hand. The fake accepts NaN
  where a real canvas throws, so tests assert on the *numbers* the renderer
  emits rather than merely driving it.
- `test/tapeCharacter.test.js` asserts the chain's *character* by measurement
  (THD rises monotonically with drive; transparent at 0; no clipping).
- `test/properties.test.js` states the invariants as fast-check properties —
  the codecs round-trip, the playhead stays inside the tape, reel geometry
  stays finite — and generates the inputs to break them.
- `test/dom.test.js` and `test/toast.test.js` opt into jsdom via a
  `@vitest-environment` docblock.
- `main.js` is excluded from coverage: it is the composition root, so it is
  wiring rather than logic, and everything it wires is covered on its own.

**Verified in a real browser** (not in CI — needs Chromium): rendering the chain
through an `OfflineAudioContext` gives THD 0.000 bypassed vs 0.240 engaged, peak
0.973 (no clipping), and an audible hiss floor where digital silence would sit.
Re-run that check by hand when changing the chain.
