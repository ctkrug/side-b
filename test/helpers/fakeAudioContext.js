/**
 * A minimal stand-in for the Web Audio API, enough to assemble and inspect
 * a graph in Node. It records connections so tests can assert on the
 * routing that was actually built rather than on how the builder was
 * called.
 */

class FakeParam {
  constructor(value = 0) {
    this.value = value;
    // Recorded automation, so tests can assert on envelopes and ramps.
    this.events = [];
  }

  _record(method, value, time) {
    this.events.push({ method, value, time });
    this.value = value;
    return this;
  }

  setValueAtTime(value, time) {
    return this._record("setValueAtTime", value, time);
  }

  linearRampToValueAtTime(value, time) {
    return this._record("linearRampToValueAtTime", value, time);
  }

  exponentialRampToValueAtTime(value, time) {
    if (value === 0) {
      throw new RangeError("exponentialRampToValueAtTime cannot target 0");
    }
    return this._record("exponentialRampToValueAtTime", value, time);
  }

  setTargetAtTime(value, time, constant) {
    this.events.push({ method: "setTargetAtTime", value, time, constant });
    this.value = value;
    return this;
  }

  cancelScheduledValues(time) {
    return this._record("cancelScheduledValues", this.value, time);
  }
}

class FakeNode {
  // The node kind lives on `nodeType`, not `type`: BiquadFilter and
  // Oscillator both expose a real `type` property that would clobber it.
  constructor(nodeType) {
    this.nodeType = nodeType;
    this.outputs = [];
    this.disconnected = false;
  }

  connect(target) {
    this.outputs.push(target);
    return target;
  }

  disconnect() {
    this.disconnected = true;
    this.outputs = [];
  }
}

class FakeBuffer {
  constructor(channels, length, sampleRate) {
    this.numberOfChannels = channels;
    this.length = length;
    this.sampleRate = sampleRate;
    this._data = Array.from(
      { length: channels },
      () => new Float32Array(length),
    );
  }

  getChannelData(channel) {
    return this._data[channel];
  }
}

export class FakeAudioContext {
  constructor({ sampleRate = 44100 } = {}) {
    this.sampleRate = sampleRate;
    this.currentTime = 0;
    this.state = "running";
    this.destination = new FakeNode("destination");
    this.created = [];
    this.resumeCount = 0;
  }

  _track(node) {
    this.created.push(node);
    return node;
  }

  createGain() {
    const node = new FakeNode("gain");
    node.gain = new FakeParam(1);
    return this._track(node);
  }

  createDelay(maxDelay = 1) {
    const node = new FakeNode("delay");
    node.maxDelay = maxDelay;
    node.delayTime = new FakeParam(0);
    return this._track(node);
  }

  createWaveShaper() {
    const node = new FakeNode("waveshaper");
    node.curve = null;
    node.oversample = "none";
    return this._track(node);
  }

  createBiquadFilter() {
    const node = new FakeNode("biquad");
    node.type = "lowpass";
    node.frequency = new FakeParam(350);
    node.Q = new FakeParam(1);
    node.gain = new FakeParam(0);
    return this._track(node);
  }

  createBufferSource() {
    const node = new FakeNode("buffersource");
    node.buffer = null;
    node.loop = false;
    node.loopStart = 0;
    node.loopEnd = 0;
    node.playbackRate = new FakeParam(1);
    node.started = false;
    node.stopped = false;
    node.onended = null;
    node.start = (when = 0, offset = 0) => {
      node.started = true;
      node.startedAt = when;
      node.startOffset = offset;
    };
    node.stop = () => {
      if (node.stopped) {
        throw new Error("already stopped");
      }
      node.stopped = true;
    };
    return this._track(node);
  }

  createOscillator() {
    const node = new FakeNode("oscillator");
    node.type = "sine";
    node.frequency = new FakeParam(440);
    node.detune = new FakeParam(0);
    node.started = false;
    node.start = (when = 0) => {
      node.started = true;
      node.startedAt = when;
    };
    node.stop = (when = 0) => {
      node.stopped = true;
      node.stoppedAt = when;
    };
    return this._track(node);
  }

  createBuffer(channels, length, sampleRate) {
    return new FakeBuffer(channels, length, sampleRate);
  }

  resume() {
    this.resumeCount += 1;
    this.state = "running";
    return Promise.resolve();
  }

  close() {
    this.state = "closed";
    return Promise.resolve();
  }
}

/** Nodes of a given type that this context handed out. */
export function nodesOfType(ctx, nodeType) {
  return ctx.created.filter((node) => node.nodeType === nodeType);
}

/** Whether a path exists from `from` to `to` by following connections. */
export function isConnected(from, to, seen = new Set()) {
  if (from === to) {
    return true;
  }
  if (seen.has(from)) {
    return false;
  }
  seen.add(from);
  return from.outputs.some((next) => isConnected(next, to, seen));
}
