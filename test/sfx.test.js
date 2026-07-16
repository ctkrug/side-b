import { describe, expect, it } from "vitest";
import {
  MUTE_STORAGE_KEY,
  RETRIGGER_MS,
  createSfx,
  readMutePreference,
  writeMutePreference,
} from "../src/audio/sfx.js";
import { FakeAudioContext, isConnected } from "./helpers/fakeAudioContext.js";

const fakeStorage = (initial = {}) => {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => map.set(key, String(value)),
    _map: map,
  };
};

/** Storage that throws, as it does in some private browsing modes. */
const hostileStorage = () => ({
  getItem() {
    throw new Error("access denied");
  },
  setItem() {
    throw new Error("access denied");
  },
});

const VOICES = ["click", "whirUp", "whirDown", "chunk", "tapeClick"];

function build({ storage = fakeStorage(), context = new FakeAudioContext() } = {}) {
  let clock = 0;
  const sfx = createSfx({ context, storage, now: () => clock });
  return {
    context,
    storage,
    sfx,
    advance: (ms) => {
      clock += ms;
    },
  };
}

const soundingNodes = (ctx) =>
  ctx.created.filter((node) => node.started && !node.loop);

describe("readMutePreference", () => {
  it("reads a stored preference", () => {
    expect(readMutePreference(fakeStorage({ [MUTE_STORAGE_KEY]: "true" }))).toBe(true);
    expect(readMutePreference(fakeStorage({ [MUTE_STORAGE_KEY]: "false" }))).toBe(
      false,
    );
  });

  it("defaults to unmuted when nothing is stored", () => {
    expect(readMutePreference(fakeStorage())).toBe(false);
  });

  it("defaults to unmuted for a missing or hostile storage", () => {
    expect(readMutePreference(null)).toBe(false);
    expect(readMutePreference(hostileStorage())).toBe(false);
  });

  it("treats a garbage stored value as unmuted", () => {
    expect(readMutePreference(fakeStorage({ [MUTE_STORAGE_KEY]: "yes" }))).toBe(false);
  });
});

describe("writeMutePreference", () => {
  it("persists the preference and reports success", () => {
    const storage = fakeStorage();
    expect(writeMutePreference(storage, true)).toBe(true);
    expect(storage.getItem(MUTE_STORAGE_KEY)).toBe("true");
  });

  it("reports failure rather than throwing on a hostile storage", () => {
    expect(writeMutePreference(hostileStorage(), true)).toBe(false);
    expect(writeMutePreference(null, true)).toBe(false);
  });
});

describe("createSfx", () => {
  it("plays each named voice", () => {
    const { sfx, advance } = build();
    for (const name of VOICES) {
      advance(RETRIGGER_MS * 2);
      expect(sfx.play(name)).toBe(true);
    }
  });

  it("makes a sound routed to the destination", () => {
    const { sfx, context } = build();
    sfx.play("click");
    const sounding = soundingNodes(context);
    expect(sounding.length).toBeGreaterThan(0);
    for (const node of sounding) {
      expect(isConnected(node, context.destination)).toBe(true);
    }
  });

  it("ignores an unknown voice rather than throwing", () => {
    const { sfx, context } = build();
    expect(sfx.play("kazoo")).toBe(false);
    expect(soundingNodes(context)).toHaveLength(0);
  });

  it("keeps interface sounds well under full scale", () => {
    const { sfx, context } = build();
    sfx.play("chunk");
    for (const node of context.created) {
      if (node.nodeType === "gain") {
        expect(node.gain.value).toBeLessThanOrEqual(1);
      }
    }
  });

  it("degrades to silence without Web Audio instead of throwing", () => {
    const sfx = createSfx({ context: null, storage: fakeStorage() });
    expect(() => sfx.play("click")).not.toThrow();
    expect(sfx.play("click")).toBe(false);
    expect(sfx.toggleMute()).toBe(true);
  });
});

describe("mute", () => {
  it("starts unmuted by default", () => {
    expect(build().sfx.isMuted()).toBe(false);
  });

  // Story 2.4: mute state persists across a refresh.
  it("starts muted when that was the stored preference", () => {
    const storage = fakeStorage({ [MUTE_STORAGE_KEY]: "true" });
    expect(build({ storage }).sfx.isMuted()).toBe(true);
  });

  it("makes no sound while muted", () => {
    const { sfx, context } = build();
    sfx.setMuted(true);
    expect(sfx.play("click")).toBe(false);
    expect(soundingNodes(context)).toHaveLength(0);
  });

  it("sounds again after unmuting", () => {
    const { sfx, context } = build();
    sfx.setMuted(true);
    sfx.play("click");
    sfx.setMuted(false);
    expect(sfx.play("click")).toBe(true);
    expect(soundingNodes(context).length).toBeGreaterThan(0);
  });

  it("persists the preference on change", () => {
    const { sfx, storage } = build();
    sfx.setMuted(true);
    expect(storage.getItem(MUTE_STORAGE_KEY)).toBe("true");
    sfx.setMuted(false);
    expect(storage.getItem(MUTE_STORAGE_KEY)).toBe("false");
  });

  it("toggles and returns the new state", () => {
    const { sfx } = build();
    expect(sfx.toggleMute()).toBe(true);
    expect(sfx.isMuted()).toBe(true);
    expect(sfx.toggleMute()).toBe(false);
  });

  it("coerces a non-boolean rather than storing it raw", () => {
    const { sfx } = build();
    sfx.setMuted("yes");
    expect(sfx.isMuted()).toBe(true);
  });

  it("still mutes when the preference cannot be persisted", () => {
    const { sfx } = build({ storage: hostileStorage() });
    expect(sfx.setMuted(true)).toBe(true);
    expect(sfx.play("click")).toBe(false);
  });

  it("silences its own bus, not the whole context", () => {
    const { sfx, context } = build();
    sfx.setMuted(true);
    const busses = context.created.filter(
      (node) => node.nodeType === "gain" && node.outputs.includes(context.destination),
    );
    expect(busses).toHaveLength(1);
    expect(busses[0].gain.value).toBe(0);
  });
});

describe("retrigger throttle", () => {
  it("drops a repeat inside the throttle window", () => {
    const { sfx } = build();
    expect(sfx.play("click")).toBe(true);
    expect(sfx.play("click")).toBe(false);
  });

  it("allows a repeat once the window has passed", () => {
    const { sfx, advance } = build();
    sfx.play("click");
    advance(RETRIGGER_MS + 1);
    expect(sfx.play("click")).toBe(true);
  });

  it("throttles each voice independently", () => {
    const { sfx } = build();
    expect(sfx.play("click")).toBe(true);
    expect(sfx.play("chunk")).toBe(true);
  });
});
