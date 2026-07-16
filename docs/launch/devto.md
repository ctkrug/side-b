---
title: Making a browser mixtape actually sound like tape
published: false
tags: webaudio, javascript, canvas, dsp
---

Search "mixtape maker" and every result is a cover-art generator. Pick a template, type a
title, export a JPEG to post next to a streaming link. Not one of them touches the audio.

That always struck me as backwards. What made a mixtape a mixtape was not the j-card. It
was that the songs came out sounding different: warmer, a little unstable, hissy in the
quiet parts. That is a real signal chain, and the Web Audio API can build all of it from
oscillators, delay lines and waveshapers. So I built [Side B](https://apps.charliekrug.com/side-b/),
a cassette deck in the browser. Here are the two decisions worth writing down.

## Pitch modulation from a delay line

Tape wobble is pitch modulation, and Web Audio has no pitch-shift node. It does not need
one. A `DelayNode` whose `delayTime` you modulate shifts pitch for free: shrink the delay
and samples arrive sooner, so pitch rises; grow it and pitch falls. That is the same
physical mechanism as a tape transport speeding up and dragging, which is why it sounds
right rather than like an effect.

Wow and flutter are then just two sine LFOs summed. Slow motor drift, faster capstan
jitter:

```js
const wow = Math.sin(TAU * wowRateHz * t) * wowDepthMs;          // 0.8 Hz, 3ms
const flutter = Math.sin(TAU * flutterRateHz * t) * flutterDepthMs; // 6 Hz, 0.4ms
return wow + flutter;
```

The delay line sits at a nominal 20ms and the offset modulates around it. That nominal
value is not cosmetic: it has to exceed the peak wow depth, or the delay time goes
negative and the node rejects it.

Two details cost me more time than the DSP did. Depth zero has to be *exactly*
transparent, not just quiet, so the amount scales the LFO depths rather than gating the
node; at zero the delay time is constant and the signal passes through untouched.
Saturation has the same requirement, so it is a dry/wet crossfade around the waveshaper
instead of an always-on curve. "Basically transparent" is the kind of thing you only
catch by asserting it in a test.

**What I would do differently:** I drive `delayTime` from a pure `wowFlutterOffsetMs(t)`
function, called once per animation frame. It made the wobble trivially unit-testable
with no audio graph, which I liked. But it samples a 6 Hz flutter LFO at 60fps, which is
ten samples per cycle, and it stops entirely when the tab is backgrounded. The right
answer is an `OscillatorNode` wired to the `delayTime` AudioParam, so modulation runs on
the audio thread at audio rate, and to keep the pure function for the tests only. I would
take the audio-rate version and lose nothing.

## The URL is the backend

There is no server. The whole tape, tracklist, per-track effect settings and the cover you
doodle, is JSON packed into base64url in the location hash. Open the link and the tape
rebuilds. No account, no upload, no database to run for a toy.

Two things fall out of that, and both are more interesting than the encoding.

The first is that a URL is a small container. About 2000 characters is the safe ceiling
across browsers, so the payload gets terse: single-character keys, effects rounded to two
decimals (finer than the sliders resolve anyway), doodle points quantized and packed.

The second is a security problem I did not see coming. A share link is text a stranger
controls, and every built-in track it names gets synthesized to PCM the moment the link
opens. An unbounded tracklist is therefore a memory bomb in a URL. A hand-written link
claiming a few thousand tracks will allocate gigabytes before the page finishes loading.
QA built one that reached 21GB. The fix is one bound, `MAX_TRACKS = 64`, sitting far above
any tape a person would make and far below one that hurts.

The related bug was subtler. Playback schedules every track ahead of time against the
`AudioContext` clock, which is what keeps the reels locked to the audio. But that means a
take is a *snapshot*: delete a track mid-record and the deleted song keeps playing,
because its source node was scheduled minutes ago. Every tray edit now reschedules the
remaining take from the current playhead. Anything you build on scheduled-ahead audio has
this bug waiting in it.

## Worth it?

The reels are driven by `AudioContext` playback position rather than a timer, so the
picture cannot drift from the sound, and that detail is most of why it reads as a machine
instead of an animation. That was the fun part.

Code: [github.com/ctkrug/side-b](https://github.com/ctkrug/side-b). Try it:
[apps.charliekrug.com/side-b](https://apps.charliekrug.com/side-b/).
