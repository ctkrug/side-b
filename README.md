# Side B

Pick a few songs, drop them into a virtual mixtape, and watch it *record* onto an
animated cassette — reels spinning in sync with real playback — while a from-scratch
Web Audio tape-emulation chain warms, warps, and hisses the audio into something that
actually sounds like tape, not an MP3 with a filter slapped on. When it's done, share
the mixtape with a link and a cover you doodled yourself.

## Why

Every "mixtape maker" on the web today is a cover-art generator: pick a template,
type a title, export a JPEG. None of them touch the audio. Side B does the opposite —
the visual cassette is secondary to a real signal chain built in the Web Audio API:

- **Wow & flutter** — slow and fast pitch modulation from LFOs driving a variable
  delay line, modeling motor speed instability in a real tape transport.
- **Saturation** — soft-clipping waveshaper that warms transients the way magnetic
  tape compresses and colors a signal.
- **Hiss** — filtered noise floor mixed under the program material, level-matched so
  it reads as tape hiss rather than static.
- **Frame-synced cassette animation** — the reels' rotation and take-up ratio are
  driven by actual `AudioContext` playback position, not a looping GIF.

## The wow moment

Drag three tracks into the tray, hit record, and the cassette reels visibly spin while
a warm, hissy, slightly-warped version of the audio plays in real time — before you've
touched a single setting.

## Planned features

- Drag-and-drop track tray (local files or sample library)
- Live tape-emulation chain: wow/flutter, saturation, hiss, tone
- Canvas cassette player frame-synced to playback
- Hand-drawn cover art doodle pad (canvas, exportable as the mixtape's cover)
- Shareable mixtape link (state encoded client-side, no backend required)
- Per-track and master tape-effect controls

## Stack

- Vanilla JavaScript (ES modules), no framework
- Web Audio API for all DSP — no pre-baked audio files for effects
- Canvas 2D for the cassette player and doodle pad
- [Vite](https://vitejs.dev/) for dev server + static production build
- [Vitest](https://vitest.dev/) for unit tests

## Status

Early scaffold — see [`docs/VISION.md`](docs/VISION.md) for the full design and
[`docs/BACKLOG.md`](docs/BACKLOG.md) for the build plan.

## Development

```bash
npm install
npm run dev      # local dev server
npm test         # unit tests
npm run build    # static production build into dist/
```

## License

MIT — see [LICENSE](LICENSE).
