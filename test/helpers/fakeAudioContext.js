/**
 * A minimal stand-in for the Web Audio API, enough to assemble and inspect
 * a graph in Node. It records connections so tests can assert on the
 * routing that was actually built rather than on how the builder was
 * called.
 */

class FakeParam {
  constructor(value = 0) {
    this.value = value;
  }
}

class FakeNode {
  constructor(type) {
    this.type = type;
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
    node.frequency = new FakeParam(440);
    node.detune = new FakeParam(0);
    node.started = false;
    node.start = () => {
      node.started = true;
    };
    node.stop = () => {
      node.stopped = true;
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
export function nodesOfType(ctx, type) {
  return ctx.created.filter((node) => node.type === type);
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
