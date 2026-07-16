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

## Using it

1. **Load the tray.** Click a built-in track, or drop your own audio files onto
   the tray (they are decoded in your browser and never uploaded anywhere).
2. **Hit record.** The reels spin, the tape counter runs, and you hear the full
   chain — wow/flutter, saturation and hiss — with no setup.
3. **Turn the knobs.** Each track has its own wow/flutter, saturation and hiss
   sliders. They retune the live audio graph as you drag: there is no baked
   file to re-render.
4. **Doodle a cover** on the pad, and it appears on the cassette's j-card label.
5. **Share the tape.** The whole mixtape — track list, every effect setting and
   your doodle — is encoded into the link itself. No account, no backend.

Built-in tracks are synthesized from scratch in code, which is what lets a
shared link rebuild the exact same tape on someone else's machine. A tape
containing your own files will list those tracks as missing for whoever opens
it, and ask them to supply the audio.

## Features

- Drag-and-drop track tray with reorderable rows (local files or built-in tracks)
- Live tape chain: wow/flutter, saturation and a filtered hiss floor, per track
- Canvas cassette frame-synced to `AudioContext` playback position
- Hand-drawn cover art doodle pad, drawn onto the cassette label
- Shareable mixtape link, encoded client-side with no backend
- Synthesized interface sounds with a mute toggle that persists

## Stack

- Vanilla JavaScript (ES modules), no framework
- Web Audio API for all DSP — no pre-baked audio files for effects
- Canvas 2D for the cassette player and doodle pad
- [Vite](https://vitejs.dev/) for dev server + static production build
- [Vitest](https://vitest.dev/) for unit tests

## Status

The core is built and playable end to end. See [`docs/VISION.md`](docs/VISION.md)
for the design, [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the code map,
and [`docs/BACKLOG.md`](docs/BACKLOG.md) for what is left.

## Development

```bash
npm install
npm run dev      # local dev server
npm test         # unit tests
npm run coverage # unit tests + a coverage report
npm run lint     # eslint
npm run build    # static production build into dist/
```

The build is base-path relative, so `dist/` can be served from any subpath.

## License

MIT — see [LICENSE](LICENSE).
