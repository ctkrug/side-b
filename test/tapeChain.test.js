import { describe, expect, it } from "vitest";
import {
  BASE_DELAY_SECONDS,
  MAX_HISS_GAIN,
  createTapeChain,
  delaySecondsAt,
  wowFlutterParams,
} from "../src/audio/tapeChain.js";
import { DEFAULT_WOW_FLUTTER } from "../src/audio/wowFlutter.js";
import {
  FakeAudioContext,
  isConnected,
  nodesOfType,
} from "./helpers/fakeAudioContext.js";

describe("wowFlutterParams", () => {
  it("scales both LFO depths by the amount", () => {
    const params = wowFlutterParams(0.5);
    expect(params.wowDepthMs).toBeCloseTo(DEFAULT_WOW_FLUTTER.wowDepthMs * 0.5);
    expect(params.flutterDepthMs).toBeCloseTo(
      DEFAULT_WOW_FLUTTER.flutterDepthMs * 0.5,
    );
  });

  it("leaves the LFO rates alone — amount is depth, not speed", () => {
    const params = wowFlutterParams(0.5);
    expect(params.wowRateHz).toBe(DEFAULT_WOW_FLUTTER.wowRateHz);
    expect(params.flutterRateHz).toBe(DEFAULT_WOW_FLUTTER.flutterRateHz);
  });

  it("zeroes both depths at amount 0", () => {
    const params = wowFlutterParams(0);
    expect(params.wowDepthMs).toBe(0);
    expect(params.flutterDepthMs).toBe(0);
  });

  it("clamps amounts outside 0..1", () => {
    expect(wowFlutterParams(9).wowDepthMs).toBe(DEFAULT_WOW_FLUTTER.wowDepthMs);
    expect(wowFlutterParams(-9).wowDepthMs).toBe(0);
  });
});

describe("delaySecondsAt", () => {
  // Story 1.2: depth 0 must make the delay line a pass-through.
  it("holds a constant delay at amount 0, so the signal is unmodulated", () => {
    for (const t of [0, 0.25, 1, 7.5, 100]) {
      expect(delaySecondsAt(t, 0)).toBeCloseTo(BASE_DELAY_SECONDS, 12);
    }
  });

  it("modulates above and below the base delay across a full wow cycle", () => {
    // The slow wow LFO runs at 0.8Hz, so a sample window shorter than
    // ~1.25s can sit entirely in one half of the cycle and look one-sided.
    const samples = [];
    for (let t = 0; t < 2; t += 0.01) {
      samples.push(delaySecondsAt(t, 1));
    }
    expect(Math.min(...samples)).toBeLessThan(BASE_DELAY_SECONDS);
    expect(Math.max(...samples)).toBeGreaterThan(BASE_DELAY_SECONDS);
  });

  it("never returns a negative delay", () => {
    for (let t = 0; t < 5; t += 0.01) {
      expect(delaySecondsAt(t, 1)).toBeGreaterThanOrEqual(0);
    }
  });

  it("deepens the wobble as the amount rises", () => {
    const swing = (amount) => {
      let min = Infinity;
      let max = -Infinity;
      for (let t = 0; t < 5; t += 0.005) {
        const value = delaySecondsAt(t, amount);
        min = Math.min(min, value);
        max = Math.max(max, value);
      }
      return max - min;
    };
    expect(swing(1)).toBeGreaterThan(swing(0.5));
    expect(swing(0.5)).toBeGreaterThan(swing(0.1));
  });
});

describe("createTapeChain", () => {
  const build = (effects) => {
    const ctx = new FakeAudioContext();
    return { ctx, chain: createTapeChain(ctx, { effects }) };
  };

  // Locate stages by following the graph rather than by construction
  // order, so these tests survive a refactor of how the chain is wired up.
  const shaperOf = (ctx) => nodesOfType(ctx, "waveshaper")[0];
  const wetOf = (ctx) =>
    nodesOfType(ctx, "delay")[0].outputs.find((node) =>
      isConnected(node, shaperOf(ctx)),
    );
  const dryOf = (ctx) =>
    nodesOfType(ctx, "delay")[0].outputs.find(
      (node) => !isConnected(node, shaperOf(ctx)),
    );
  const hissGainOf = (ctx) => nodesOfType(ctx, "biquad")[0].outputs[0];

  it("throws without an AudioContext rather than failing later", () => {
    expect(() => createTapeChain(null)).toThrow(TypeError);
  });

  it("routes input through to output", () => {
    const { chain } = build();
    expect(isConnected(chain.input, chain.output)).toBe(true);
  });

  it("puts the delay line in the signal path", () => {
    const { ctx, chain } = build();
    const delay = nodesOfType(ctx, "delay")[0];
    expect(delay).toBeDefined();
    expect(isConnected(chain.input, delay)).toBe(true);
    expect(isConnected(delay, chain.output)).toBe(true);
  });

  it("puts the waveshaper in the signal path", () => {
    const { ctx, chain } = build();
    const shaper = nodesOfType(ctx, "waveshaper")[0];
    expect(shaper.curve).toBeInstanceOf(Float32Array);
    expect(isConnected(chain.input, shaper)).toBe(true);
    expect(isConnected(shaper, chain.output)).toBe(true);
  });

  it("starts a looping band-limited hiss source into the output", () => {
    const { ctx, chain } = build();
    const source = nodesOfType(ctx, "buffersource")[0];
    const filter = nodesOfType(ctx, "biquad")[0];
    expect(source.loop).toBe(true);
    expect(source.started).toBe(true);
    expect(filter.type).toBe("bandpass");
    expect(isConnected(source, chain.output)).toBe(true);
  });

  it("does not route hiss through the saturation stage", () => {
    const { ctx } = build();
    const source = nodesOfType(ctx, "buffersource")[0];
    const shaper = nodesOfType(ctx, "waveshaper")[0];
    expect(isConnected(source, shaper)).toBe(false);
  });

  // Story 1.3: amount 0 must leave the signal essentially untouched.
  it("is fully dry at saturation 0", () => {
    const { ctx } = build({ saturation: 0 });
    expect(dryOf(ctx).gain.value).toBe(1);
    expect(wetOf(ctx).gain.value).toBe(0);
  });

  it("is fully wet at saturation 1", () => {
    const { ctx } = build({ saturation: 1 });
    expect(dryOf(ctx).gain.value).toBe(0);
    expect(wetOf(ctx).gain.value).toBe(1);
  });

  it("keeps the dry/wet crossfade at unity sum", () => {
    for (const saturation of [0, 0.3, 0.75, 1]) {
      const { ctx } = build({ saturation });
      expect(dryOf(ctx).gain.value + wetOf(ctx).gain.value).toBeCloseTo(1);
    }
  });

  it("drives the delay time from the current time on update", () => {
    const { ctx, chain } = build({ wowFlutter: 1 });
    const delay = nodesOfType(ctx, "delay")[0];
    chain.update(0.3);
    expect(delay.delayTime.value).toBeCloseTo(delaySecondsAt(0.3, 1));
    chain.update(0.7);
    expect(delay.delayTime.value).toBeCloseTo(delaySecondsAt(0.7, 1));
  });

  it("holds the delay steady on update when wow/flutter is 0", () => {
    const { ctx, chain } = build({ wowFlutter: 0 });
    const delay = nodesOfType(ctx, "delay")[0];
    chain.update(0.3);
    const first = delay.delayTime.value;
    chain.update(9.1);
    expect(delay.delayTime.value).toBe(first);
  });

  it("gives the delay line headroom for the deepest wobble", () => {
    const { ctx } = build();
    const delay = nodesOfType(ctx, "delay")[0];
    let peak = 0;
    for (let t = 0; t < 5; t += 0.005) {
      peak = Math.max(peak, delaySecondsAt(t, 1));
    }
    expect(delay.maxDelay).toBeGreaterThan(peak);
  });

  it("scales hiss level by the amount and keeps it under the program", () => {
    const quiet = build({ hiss: 0 });
    const loud = build({ hiss: 1 });
    expect(hissGainOf(quiet.ctx).gain.value).toBe(0);
    expect(hissGainOf(loud.ctx).gain.value).toBeCloseTo(MAX_HISS_GAIN);
    expect(MAX_HISS_GAIN).toBeLessThan(0.2);
  });

  it("applies live effect changes without rebuilding the graph", () => {
    const { ctx, chain } = build({ saturation: 0 });
    const nodeCount = ctx.created.length;
    chain.setEffects({ saturation: 0.8 });
    expect(chain.getEffects().saturation).toBe(0.8);
    expect(ctx.created.length).toBe(nodeCount);
  });

  it("clamps effect values written through setEffects", () => {
    const { chain } = build();
    chain.setEffects({ hiss: 42, saturation: -1 });
    expect(chain.getEffects().hiss).toBe(1);
    expect(chain.getEffects().saturation).toBe(0);
  });

  it("leaves untouched effects alone on a partial update", () => {
    const { chain } = build({ wowFlutter: 0.9, hiss: 0.1 });
    chain.setEffects({ saturation: 0.5 });
    expect(chain.getEffects().wowFlutter).toBe(0.9);
    expect(chain.getEffects().hiss).toBe(0.1);
  });

  // Story 1.4: the hiss bypass must not stop the music.
  it("silences the hiss bed on bypass without stopping the source", () => {
    const { ctx, chain } = build({ hiss: 1 });
    const source = nodesOfType(ctx, "buffersource")[0];
    const hissGain = hissGainOf(ctx);
    chain.setHissEnabled(false);
    expect(hissGain.gain.value).toBe(0);
    expect(source.stopped).toBe(false);
    chain.setHissEnabled(true);
    expect(hissGain.gain.value).toBeCloseTo(MAX_HISS_GAIN);
  });

  it("restores the stored hiss level after a bypass round-trip", () => {
    const { ctx, chain } = build({ hiss: 0.4 });
    const hissGain = hissGainOf(ctx);
    chain.setHissEnabled(false);
    chain.setHissEnabled(true);
    expect(hissGain.gain.value).toBeCloseTo(0.4 * MAX_HISS_GAIN);
  });

  it("disconnects every node on dispose", () => {
    const { ctx, chain } = build();
    chain.dispose();
    for (const node of ctx.created) {
      expect(node.disconnected).toBe(true);
    }
  });

  it("tolerates a double dispose", () => {
    const { chain } = build();
    chain.dispose();
    expect(() => chain.dispose()).not.toThrow();
  });
});
