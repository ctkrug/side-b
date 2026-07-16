# Vision — Side B

## The problem

Search "mixtape maker" and every result is the same thing: a cover-art generator. Pick
a title, a font, a gradient, export a JPEG you can post next to a Spotify playlist link.
The actual audio is untouched — it's the streaming service's file, playing through the
streaming service's player. The "tape" is purely cosmetic.

That's a missed opportunity. What made a mixtape a mixtape wasn't the cardboard j-card —
it was that the songs came out sounding *different*: warmer, a little unstable, hissy in
the quiet parts. That's a real, well-understood signal-processing chain (tape saturation,
wow-and-flutter pitch modulation, a noise floor), and the Web Audio API can build all of
it from oscillators, delay lines, and waveshapers — no plugin, no server, no pre-rendered
audio file.

## Who it's for

Anyone who wants to make a mood-board playlist for a friend and share something that
feels like a gift rather than a link to someone else's streaming catalog — people who
remember (or are nostalgic for, secondhand) making mixtapes, lo-fi/vaporwave listeners
who already like the tape aesthetic, and anyone bored of cover-art-only mixtape tools.

## The core idea

A drag-and-drop track tray feeds a from-scratch Web Audio DSP chain per track:

1. **Wow & flutter** — a variable delay line modulated by two summed LFOs (slow "wow"
   for motor speed drift, fast shallow "flutter" for capstan jitter) pitch-wobbles the
   signal the way a real tape transport does.
2. **Saturation** — a cubic soft-clip waveshaper compresses and colors transients,
   modeling how magnetic tape softens peaks rather than clipping them harshly.
3. **Hiss** — a filtered noise floor, level-matched under the program material, mixed
   in continuously so quiet passages read as tape rather than digital silence.

All three run live on the actual audio graph — turning a knob changes the sound in
real time, because there's no "baked" file, just nodes.

The cassette itself is rendered on canvas and frame-synced to `AudioContext.currentTime`:
reel rotation speed, and the growing/shrinking radius of the take-up vs. supply reel, are
computed directly from playback position — not a looping GIF that happens to look like a
cassette.

Once a mixtape sounds right, its state (track references, per-track and master effect
settings, hand-drawn cover art) encodes into a compact string and rides in the share
link itself — no backend, no database, no accounts. Anyone with the link gets the exact
same mixtape, deterministically reconstructed client-side.

## Key design decisions

- **No pre-baked audio files for effects.** Every DSP element is synthesized or
  processed live via Web Audio nodes. This is what makes the tool a real instrument
  rather than a preset filter, and it's the entire "edge over alternatives."
- **No backend.** Mixtape state lives in the URL. This keeps the project a static site
  (cheap to host, trivial to deploy, no accounts/auth surface to build or secure) and
  keeps the focus on the audio engine rather than infrastructure.
- **Canvas, not video/GIF, for the cassette.** Frame-syncing to real playback position
  is the detail that sells "this is actually processing the audio," not just decorating
  a page.
- **The cover art is hand-drawn, not generated.** A doodle canvas rather than an AI
  image generator or template picker keeps the personal, homemade-mixtape feeling
  intact — the whole point is that a friend made this specific thing for you.
- **Local/sample tracks only, not streaming-service integration.** Avoids licensing,
  auth, and API-quota complexity that would dwarf the actual product for a v1.

## What "v1 done" looks like

- Drag tracks into the tray, hit record, and hear the full tape chain (wow/flutter +
  saturation + hiss) processing them live while the cassette reels spin in sync with
  playback — the wow moment, reachable with zero configuration.
- Per-track and master controls for each effect (at minimum: wow/flutter depth,
  saturation drive, hiss level) with sane, already-good-sounding defaults.
- A doodle pad for hand-drawn cover art, saved as part of the mixtape.
- A working share link that reconstructs the exact same mixtape (tracks, effect
  settings, cover art) for anyone who opens it.
- The whole thing deployed as a static site with no server dependency.
