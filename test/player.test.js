import { describe, expect, it } from "vitest";
import {
  TRANSPORT_STATES,
  createAudioContext,
  createPlayer,
} from "../src/audio/player.js";
import { createMixtape } from "../src/mixtape/state.js";
import { FakeAudioContext, isConnected } from "./helpers/fakeAudioContext.js";

const tape = () =>
  createMixtape({
    tracks: [
      { id: "a", title: "A", durationSeconds: 10 },
      { id: "b", title: "B", durationSeconds: 20 },
    ],
  });

function build({ buffers = true } = {}) {
  const ctx = new FakeAudioContext();
  const player = createPlayer({
    context: ctx,
    getBuffer: () => (buffers ? ctx.createBuffer(1, 100, ctx.sampleRate) : null),
  });
  return { ctx, player };
}

/** Sources the player started, in scheduling order. */
const startedSources = (ctx) =>
  ctx.created.filter((node) => node.nodeType === "buffersource" && node.started);

/** Music sources only — every chain also starts a looping hiss source. */
const musicSources = (ctx) =>
  startedSources(ctx).filter((node) => !node.loop);

describe("createAudioContext", () => {
  it("returns null where Web Audio does not exist", () => {
    expect(createAudioContext({})).toBeNull();
  });

  it("constructs from the standard constructor", () => {
    const ctx = createAudioContext({ AudioContext: FakeAudioContext });
    expect(ctx).toBeInstanceOf(FakeAudioContext);
  });

  it("falls back to the webkit-prefixed constructor", () => {
    const ctx = createAudioContext({ webkitAudioContext: FakeAudioContext });
    expect(ctx).toBeInstanceOf(FakeAudioContext);
  });
});

describe("createPlayer", () => {
  it("rejects a missing context or getBuffer", () => {
    expect(() => createPlayer({ context: null, getBuffer: () => {} })).toThrow(
      TypeError,
    );
    expect(() => createPlayer({ context: new FakeAudioContext() })).toThrow(
      TypeError,
    );
  });

  it("starts stopped with a zero playhead", () => {
    const { player } = build();
    expect(player.state).toBe(TRANSPORT_STATES.STOPPED);
    expect(player.isPlaying()).toBe(false);
    expect(player.elapsedSeconds()).toBe(0);
  });
});

describe("play", () => {
  it("starts one music source per track and reports playing", () => {
    const { ctx, player } = build();
    expect(player.play(tape())).toBe(true);
    expect(player.isPlaying()).toBe(true);
    expect(musicSources(ctx)).toHaveLength(2);
  });

  it("routes every track through a tape chain to the destination", () => {
    const { ctx, player } = build();
    player.play(tape());
    for (const source of musicSources(ctx)) {
      expect(isConnected(source, ctx.destination)).toBe(true);
      // Straight to the destination would mean the tape chain was bypassed.
      expect(source.outputs).not.toContain(ctx.destination);
    }
  });

  it("schedules tracks back to back on the audio clock", () => {
    const { ctx, player } = build();
    ctx.currentTime = 5;
    player.play(tape());
    const [first, second] = musicSources(ctx);
    expect(first.startedAt).toBeCloseTo(5);
    expect(second.startedAt).toBeCloseTo(15);
  });

  it("refuses to play an empty tape", () => {
    const { player } = build();
    expect(player.play(createMixtape())).toBe(false);
    expect(player.state).toBe(TRANSPORT_STATES.STOPPED);
  });

  it("refuses to play when no track has audio loaded", () => {
    const { player } = build({ buffers: false });
    expect(player.play(tape())).toBe(false);
    expect(player.state).toBe(TRANSPORT_STATES.STOPPED);
  });

  it("skips only the tracks already behind the start offset", () => {
    const { ctx, player } = build();
    player.play(tape(), 12);
    const sources = musicSources(ctx);
    expect(sources).toHaveLength(1);
    expect(sources[0].startOffset).toBeCloseTo(2);
  });

  it("starts mid-track at the right offset", () => {
    const { ctx, player } = build();
    player.play(tape(), 4);
    expect(musicSources(ctx)[0].startOffset).toBeCloseTo(4);
  });

  it("treats a negative start offset as the beginning", () => {
    const { player } = build();
    player.play(tape(), -30);
    expect(player.elapsedSeconds()).toBeCloseTo(0);
  });

  // A BufferSource throws on a non-finite start time, which would leave
  // the transport wedged mid-play with half its voices scheduled.
  it.each([[NaN], ["soon"], [undefined]])(
    "treats the unreadable start offset %p as the beginning",
    (offset) => {
      const { ctx, player } = build();
      expect(player.play(tape(), offset)).toBe(true);
      expect(player.elapsedSeconds()).toBeCloseTo(0);
      for (const source of startedSources(ctx)) {
        expect(Number.isFinite(source.startedAt)).toBe(true);
        expect(Number.isFinite(source.startOffset ?? 0)).toBe(true);
      }
    },
  );

  it("stops the previous voices when restarted", () => {
    const { ctx, player } = build();
    player.play(tape());
    const first = musicSources(ctx);
    player.play(tape());
    for (const source of first) {
      expect(source.stopped).toBe(true);
    }
  });
});

describe("elapsedSeconds", () => {
  it("tracks the audio clock while playing", () => {
    const { ctx, player } = build();
    ctx.currentTime = 100;
    player.play(tape());
    ctx.currentTime = 103.5;
    expect(player.elapsedSeconds()).toBeCloseTo(3.5);
  });

  it("counts from the start offset", () => {
    const { ctx, player } = build();
    player.play(tape(), 6);
    ctx.currentTime += 2;
    expect(player.elapsedSeconds()).toBeCloseTo(8);
  });

  it("freezes while paused and resumes from there", () => {
    const { ctx, player } = build();
    player.play(tape());
    ctx.currentTime += 4;
    player.pause();
    expect(player.elapsedSeconds()).toBeCloseTo(4);
    ctx.currentTime += 100;
    expect(player.elapsedSeconds()).toBeCloseTo(4);
    player.resume();
    expect(player.elapsedSeconds()).toBeCloseTo(4);
  });

  it("returns to zero on stop", () => {
    const { ctx, player } = build();
    player.play(tape());
    ctx.currentTime += 4;
    player.stop();
    expect(player.elapsedSeconds()).toBe(0);
  });
});

describe("pause, resume and stop", () => {
  it("silences the sources on pause", () => {
    const { ctx, player } = build();
    player.play(tape());
    player.pause();
    expect(player.state).toBe(TRANSPORT_STATES.PAUSED);
    for (const source of musicSources(ctx)) {
      expect(source.stopped).toBe(true);
    }
  });

  it("reschedules from the playhead on resume", () => {
    const { ctx, player } = build();
    player.play(tape());
    ctx.currentTime += 12;
    player.pause();
    player.resume();
    const live = musicSources(ctx).filter((source) => !source.stopped);
    expect(live).toHaveLength(1);
    expect(live[0].startOffset).toBeCloseTo(2);
  });

  it("ignores pause when not playing, and resume when not paused", () => {
    const { player } = build();
    expect(player.pause()).toBe(false);
    expect(player.resume()).toBe(false);
    player.play(tape());
    expect(player.resume()).toBe(false);
  });

  it("ignores a repeated stop", () => {
    const { player } = build();
    player.play(tape());
    expect(player.stop()).toBe(true);
    expect(player.stop()).toBe(false);
  });

  it("plays again after a stop", () => {
    const { player } = build();
    player.play(tape());
    player.stop();
    expect(player.play(tape())).toBe(true);
  });
});

describe("onStateChange", () => {
  it("reports each transition", () => {
    const { player } = build();
    const seen = [];
    player.onStateChange((state) => seen.push(state));
    player.play(tape());
    player.pause();
    player.stop();
    expect(seen).toEqual([
      TRANSPORT_STATES.PLAYING,
      TRANSPORT_STATES.PAUSED,
      TRANSPORT_STATES.STOPPED,
    ]);
  });

  it("stops reporting once unsubscribed", () => {
    const { player } = build();
    const seen = [];
    const off = player.onStateChange((state) => seen.push(state));
    off();
    player.play(tape());
    expect(seen).toEqual([]);
  });
});

describe("update", () => {
  it("drives the wobble only while playing", () => {
    const { ctx, player } = build();
    player.play(tape());
    const delay = ctx.created.find((node) => node.nodeType === "delay");
    ctx.currentTime = 0.3;
    player.update();
    const moved = delay.delayTime.value;
    player.pause();
    ctx.currentTime = 0.9;
    player.update();
    expect(delay.delayTime.value).toBe(moved);
  });

  it("is a no-op before playback starts", () => {
    const { player } = build();
    expect(() => player.update()).not.toThrow();
  });
});

describe("reaching the end of the tape", () => {
  it("stops itself once the last track has played out", () => {
    const { ctx, player } = build();
    player.play(tape());
    ctx.currentTime = 30;
    player.update();
    expect(player.state).toBe(TRANSPORT_STATES.STOPPED);
    expect(player.isPlaying()).toBe(false);
    expect(player.elapsedSeconds()).toBe(0);
  });

  it("keeps playing right up to the final moment of the tape", () => {
    const { ctx, player } = build();
    player.play(tape());
    ctx.currentTime = 29.9;
    player.update();
    expect(player.state).toBe(TRANSPORT_STATES.PLAYING);
  });

  it("releases the voices it scheduled when the tape runs out", () => {
    const { ctx, player } = build();
    player.play(tape());
    const sources = musicSources(ctx);
    ctx.currentTime = 30;
    player.update();
    for (const source of sources) {
      expect(source.stopped).toBe(true);
    }
  });

  it("announces the stop so the transport can re-render", () => {
    const { ctx, player } = build();
    const seen = [];
    player.onStateChange((state) => seen.push(state));
    player.play(tape());
    ctx.currentTime = 30;
    player.update();
    expect(seen).toEqual([TRANSPORT_STATES.PLAYING, TRANSPORT_STATES.STOPPED]);
  });
});

describe("retape", () => {
  const shorter = () =>
    createMixtape({ tracks: [{ id: "a", title: "A", durationSeconds: 10 }] });

  it("stops a rolling tape, because a take cannot be re-cut mid-roll", () => {
    const { ctx, player } = build();
    player.play(tape());
    const sources = musicSources(ctx);
    expect(player.retape(shorter())).toBe(true);
    expect(player.state).toBe(TRANSPORT_STATES.STOPPED);
    for (const source of sources) {
      expect(source.stopped).toBe(true);
    }
  });

  it("adopts the new tracklist, so a later play uses it", () => {
    const { ctx, player } = build();
    player.play(tape());
    player.retape(shorter());
    player.play();
    expect(musicSources(ctx).filter((node) => node.started)).toHaveLength(3);
    expect(player.currentTrack().track.id).toBe("a");
  });

  it("drops a paused playhead rather than resuming into a stale tape", () => {
    const { ctx, player } = build();
    player.play(tape());
    ctx.currentTime = 12;
    player.pause();
    player.retape(shorter());
    expect(player.state).toBe(TRANSPORT_STATES.STOPPED);
    expect(player.elapsedSeconds()).toBe(0);
  });

  it("is a quiet no-op while the deck is already stopped", () => {
    const { player } = build();
    expect(player.retape(shorter())).toBe(false);
    expect(player.state).toBe(TRANSPORT_STATES.STOPPED);
    // Still adopted, even though nothing had to be interrupted.
    expect(player.play()).toBe(true);
  });
});

describe("live parameter edits", () => {
  it("applies effect changes to the matching track's chain only", () => {
    const { player } = build();
    player.play(tape());
    player.setTrackEffects("a", { saturation: 0.9 });
    expect(player.currentTrack().track.effects.saturation).not.toBe(0.9);
    expect(() => player.setTrackEffects("nope", { hiss: 1 })).not.toThrow();
  });

  it("toggles the hiss bed without stopping playback", () => {
    const { ctx, player } = build();
    player.play(tape());
    player.setHissEnabled(false);
    expect(player.isPlaying()).toBe(true);
    for (const source of musicSources(ctx)) {
      expect(source.stopped).toBe(false);
    }
  });

  it("carries the hiss setting into tracks scheduled later", () => {
    const { ctx, player } = build();
    player.setHissEnabled(false);
    player.play(tape());
    const hissGains = ctx.created
      .filter((node) => node.nodeType === "biquad")
      .map((filter) => filter.outputs[0]);
    expect(hissGains.length).toBeGreaterThan(0);
    for (const gain of hissGains) {
      expect(gain.gain.value).toBe(0);
    }
  });
});

describe("currentTrack", () => {
  it("follows the playhead across the track boundary", () => {
    const { ctx, player } = build();
    player.play(tape());
    expect(player.currentTrack().track.id).toBe("a");
    ctx.currentTime += 11;
    expect(player.currentTrack().track.id).toBe("b");
  });

  it("is null past the end of the tape and before any tape is loaded", () => {
    const { ctx, player } = build();
    expect(player.currentTrack()).toBeNull();
    player.play(tape());
    ctx.currentTime += 999;
    expect(player.currentTrack()).toBeNull();
  });
});

describe("dispose", () => {
  it("stops every voice and detaches listeners", () => {
    const { ctx, player } = build();
    const seen = [];
    player.onStateChange((state) => seen.push(state));
    player.play(tape());
    seen.length = 0;
    player.dispose();
    for (const source of musicSources(ctx)) {
      expect(source.stopped).toBe(true);
    }
    expect(seen).toEqual([]);
  });
});
