import { fft } from '../analysis';

// A small, spec-shaped Web Audio renderer in plain TypeScript, for Node: the game's real audio code
// (mix graph, voices, layers, the score, the AudioSystem itself) runs against it in unit tests and
// tools, and what comes out is measured (peaks, loudness, NaN, voices). It is not a browser: it
// implements the nodes and behaviours the game uses, following the Web Audio API 1.0 algorithms
// (AudioParam automation, the BiquadFilter formulas with Q in dB for low/high-pass, equal-power
// panning, the ConvolverNode's normalisation, the DynamicsCompressor kernel with its pre-delay,
// knee, adaptive release and makeup gain). Oscillators are PolyBLEP band-limited rather than
// wavetable, so spectra differ slightly from Chrome's; levels and envelopes match.
// Never imported by the game (tree-shaken away); tests/unit/audio*.test.ts and tools/audio-* use it.

export const RENDER_QUANTUM = 128;
const Q = RENDER_QUANTUM;
const MAX_FLOAT = 3.4028234663852886e38;

type AutomationRate = 'a-rate' | 'k-rate';

class SimDomError extends Error {
  constructor(name: string, message: string) {
    super(message);
    this.name = name;
  }
}

const finiteOrThrow = (...xs: number[]): void => {
  for (const x of xs) if (!Number.isFinite(x)) throw new TypeError(`The provided value is non-finite: ${x}`);
};

// ---------------------------------------------------------------------------------------
// AudioParam

interface ParamEvent {
  type: 'set' | 'linear' | 'exp' | 'target' | 'curve';
  time: number;
  value: number;
  tau: number;
  curve: Float32Array | null;
  duration: number;
}

export class SimParam {
  readonly defaultValue: number;
  readonly minValue: number;
  readonly maxValue: number;
  automationRate: AutomationRate;
  /** Nodes connected into this param (audio-rate modulation, summed into the computed value). */
  readonly sources: SimNode[] = [];
  private readonly events: ParamEvent[] = [];
  /** Start value of each event (the value just before it), memoised; NaN = not known yet. */
  private starts: number[] = [];
  private initial: number;
  private current: number;
  private readonly buf = new Float32Array(Q);
  private bufQ = -1;
  /** The last computed quantum held one value (nodes take fast paths on it). */
  constant = true;

  constructor(private readonly ctx: SimContextBase, value: number, min = -MAX_FLOAT, max = MAX_FLOAT, rate: AutomationRate = 'a-rate') {
    this.defaultValue = value;
    this.minValue = min;
    this.maxValue = max;
    this.automationRate = rate;
    this.initial = value;
    this.current = value;
  }

  get value(): number {
    return this.current;
  }

  set value(v: number) {
    finiteOrThrow(v);
    this.current = v;
    if (this.events.length === 0) this.initial = v;
    else this.setValueAtTime(v, this.ctx.currentTime);
  }

  setValueAtTime(value: number, time: number): this {
    finiteOrThrow(value, time);
    if (time < 0) throw new RangeError('negative time');
    this.insert({ type: 'set', time, value, tau: 0, curve: null, duration: 0 });
    return this;
  }

  linearRampToValueAtTime(value: number, time: number): this {
    finiteOrThrow(value, time);
    if (time < 0) throw new RangeError('negative time');
    this.prepareRamp(time);
    this.insert({ type: 'linear', time, value, tau: 0, curve: null, duration: 0 });
    return this;
  }

  exponentialRampToValueAtTime(value: number, time: number): this {
    finiteOrThrow(value, time);
    if (value === 0) throw new RangeError('exponentialRampToValueAtTime: value must not be 0');
    if (time < 0) throw new RangeError('negative time');
    this.prepareRamp(time);
    this.insert({ type: 'exp', time, value, tau: 0, curve: null, duration: 0 });
    return this;
  }

  setTargetAtTime(value: number, time: number, timeConstant: number): this {
    finiteOrThrow(value, time, timeConstant);
    if (time < 0 || timeConstant < 0) throw new RangeError('negative time or time constant');
    if (timeConstant === 0) return this.setValueAtTime(value, time);
    this.insert({ type: 'target', time, value, tau: timeConstant, curve: null, duration: 0 });
    return this;
  }

  setValueCurveAtTime(values: ArrayLike<number>, time: number, duration: number): this {
    finiteOrThrow(time, duration);
    const curve = Float32Array.from(values as ArrayLike<number>);
    if (curve.length < 2) throw new SimDomError('InvalidStateError', 'curve too short');
    this.insert({ type: 'curve', time, value: curve[curve.length - 1], tau: 0, curve, duration });
    // The spec puts an implicit setValueAtTime(last, time + duration) after a curve.
    this.insert({ type: 'set', time: time + duration, value: curve[curve.length - 1], tau: 0, curve: null, duration: 0 });
    return this;
  }

  cancelScheduledValues(cancelTime: number): this {
    finiteOrThrow(cancelTime);
    let w = 0;
    for (let r = 0; r < this.events.length; r++) if (this.events[r].time < cancelTime) this.events[w++] = this.events[r];
    this.events.length = w;
    this.starts = [];
    return this;
  }

  cancelAndHoldAtTime(cancelTime: number): this {
    const v = this.intrinsicAt(cancelTime);
    this.cancelScheduledValues(cancelTime);
    this.insert({ type: 'set', time: cancelTime, value: v, tau: 0, curve: null, duration: 0 });
    return this;
  }

  /** Events on the timeline (tests). */
  get eventCount(): number {
    return this.events.length;
  }

  /**
   * A ramp starts at the previous event (spec 1.6.3): with none, from the value now; a SetTarget
   * that has started is frozen at the value now, one that has not yet started is replaced.
   */
  private prepareRamp(time: number): void {
    const now = this.ctx.currentTime;
    let prev = -1;
    for (let i = 0; i < this.events.length; i++) if (this.events[i].time <= time) prev = i;
    if (prev < 0) {
      this.insert({ type: 'set', time: now, value: this.intrinsicAt(now), tau: 0, curve: null, duration: 0 });
      return;
    }
    const e = this.events[prev];
    if (e.type !== 'target') return;
    if (e.time < now) this.insert({ type: 'set', time: now, value: this.intrinsicAt(now), tau: 0, curve: null, duration: 0 });
    else {
      const before = this.startOf(prev);
      this.events[prev] = { type: 'set', time: e.time, value: before, tau: 0, curve: null, duration: 0 };
      this.starts = [];
    }
  }

  private insert(e: ParamEvent): void {
    let i = this.events.length;
    while (i > 0 && this.events[i - 1].time > e.time) i--;
    this.events.splice(i, 0, e);
    this.starts = [];
  }

  /** The value just before event i (the curve of events 0..i-1 at event i's time). */
  private startOf(i: number): number {
    if (i <= 0) return this.initial;
    const memo = this.starts[i];
    if (memo !== undefined && !Number.isNaN(memo)) return memo;
    const v = this.evalPrefix(i - 1, this.events[i].time);
    this.starts[i] = v;
    return v;
  }

  /** The value at time t of the curve made by events 0..k (k is the last event at or before t). */
  private evalPrefix(k: number, t: number): number {
    if (k < 0) return this.initial;
    const e = this.events[k];
    switch (e.type) {
      case 'set':
      case 'linear':
      case 'exp':
        return e.value;
      case 'target': {
        const v0 = this.startOf(k);
        return e.value + (v0 - e.value) * Math.exp(-(t - e.time) / e.tau);
      }
      case 'curve': {
        const c = e.curve!;
        if (t >= e.time + e.duration) return c[c.length - 1];
        const pos = ((t - e.time) / e.duration) * (c.length - 1);
        const j = Math.floor(pos);
        const f = pos - j;
        return c[j] * (1 - f) + c[Math.min(c.length - 1, j + 1)] * f;
      }
    }
  }

  /** The intrinsic (timeline-only) value at time t. */
  intrinsicAt(t: number): number {
    const ev = this.events;
    let k = -1;
    while (k + 1 < ev.length && ev[k + 1].time <= t) k++;
    const next = ev[k + 1];
    if (next && (next.type === 'linear' || next.type === 'exp')) {
      const t0 = k >= 0 ? ev[k].time : this.ctx.currentTime;
      const v0 = k >= 0 ? this.endValueOf(k) : this.initial;
      const t1 = next.time;
      const span = t1 - t0;
      if (span <= 0) return next.value;
      const x = Math.min(1, Math.max(0, (t - t0) / span));
      if (next.type === 'linear') return v0 + (next.value - v0) * x;
      if (v0 === 0 || v0 * next.value < 0) return v0;
      return v0 * Math.pow(next.value / v0, x);
    }
    return this.evalPrefix(k, t);
  }

  private endValueOf(k: number): number {
    const e = this.events[k];
    if (e.type === 'target') return this.startOf(k);
    return e.value;
  }

  /**
   * The computed values for render quantum `q` (a-rate: per sample; k-rate: one value), including
   * the audio-rate inputs, clamped to the nominal range.
   */
  compute(q: number): Float32Array {
    if (this.bufQ === q) return this.buf;
    this.bufQ = q;
    const sr = this.ctx.sampleRate;
    const t0 = (q * Q) / sr;
    this.prune(t0);
    const out = this.buf;
    if (this.automationRate === 'k-rate') {
      let v = this.intrinsicAt(t0);
      for (const s of this.sources) {
        const ch = s.pull(q);
        v += ch.length > 1 ? (ch[0][0] + ch[1][0]) * 0.5 : ch[0][0];
      }
      v = Math.min(this.maxValue, Math.max(this.minValue, v));
      out.fill(v);
      this.current = v;
      this.constant = true;
      return out;
    }
    this.fillTimeline(out, q, sr);
    let constant = this.constant;
    for (const s of this.sources) {
      const ch = s.pull(q);
      constant = false;
      if (ch.length > 1) {
        const a = ch[0];
        const b = ch[1];
        for (let i = 0; i < Q; i++) out[i] += (a[i] + b[i]) * 0.5;
      } else {
        const a = ch[0];
        for (let i = 0; i < Q; i++) out[i] += a[i];
      }
    }
    if (this.minValue > -MAX_FLOAT || this.maxValue < MAX_FLOAT) {
      const lo = this.minValue;
      const hi = this.maxValue;
      for (let i = 0; i < Q; i++) {
        const v = out[i];
        out[i] = v < lo ? lo : v > hi ? hi : v;
      }
    }
    this.constant = constant;
    this.current = out[0];
    return out;
  }

  /**
   * Drop events that can no longer shape the curve (the browser forgets past events too): once the
   * second event has started, the first only mattered through the second's start value.
   */
  private prune(t0: number): void {
    const ev = this.events;
    let dropped = false;
    while (ev.length >= 2 && ev[1].time <= t0) {
      this.initial = this.startOf(1);
      ev.shift();
      this.starts = [];
      dropped = true;
    }
    if (dropped) this.starts = [];
  }

  /** Fill one quantum from the timeline with closed forms per segment. Sets `constant`. */
  private fillTimeline(out: Float32Array, q: number, sr: number): void {
    const ev = this.events;
    const frame0 = q * Q;
    if (ev.length === 0) {
      out.fill(this.initial);
      this.constant = true;
      return;
    }
    let i = 0;
    let constant = true;
    let first = Number.NaN;
    while (i < Q) {
      const t = (frame0 + i) / sr;
      let k = -1;
      while (k + 1 < ev.length && ev[k + 1].time <= t) k++;
      const next = ev[k + 1];
      // Samples of this segment: until the next event's time.
      let n = Q - i;
      if (next) {
        const until = Math.ceil(next.time * sr - 1e-7) - (frame0 + i);
        n = Math.max(1, Math.min(n, until));
      }
      if (next && (next.type === 'linear' || next.type === 'exp')) {
        const t0 = k >= 0 ? ev[k].time : t;
        const v0 = k >= 0 ? this.endValueOf(k) : this.initial;
        const span = next.time - t0;
        const v1 = next.value;
        if (span <= 0) {
          out.fill(v1, i, i + n);
        } else if (next.type === 'linear') {
          const slope = (v1 - v0) / span;
          for (let j = 0; j < n; j++) out[i + j] = v0 + slope * ((frame0 + i + j) / sr - t0);
          if (slope !== 0) constant = false;
        } else if (v0 === 0 || v0 * v1 < 0) {
          out.fill(v0, i, i + n);
        } else {
          const ratio = v1 / v0;
          let v = v0 * Math.pow(ratio, (t - t0) / span);
          const step = Math.pow(ratio, 1 / (span * sr));
          for (let j = 0; j < n; j++) {
            out[i + j] = v;
            v *= step;
          }
          if (ratio !== 1) constant = false;
        }
      } else {
        const e = k >= 0 ? ev[k] : null;
        if (!e || e.type !== 'target' && e.type !== 'curve') {
          out.fill(this.evalPrefix(k, t), i, i + n);
        } else if (e.type === 'target') {
          const v0 = this.startOf(k);
          let d = (v0 - e.value) * Math.exp(-(t - e.time) / e.tau);
          const decay = Math.exp(-1 / (e.tau * sr));
          for (let j = 0; j < n; j++) {
            out[i + j] = e.value + d;
            d *= decay;
          }
          if (Math.abs(d) > 1e-7 * Math.max(1, Math.abs(e.value))) constant = false;
        } else {
          for (let j = 0; j < n; j++) out[i + j] = this.evalPrefix(k, (frame0 + i + j) / sr);
          constant = false;
        }
      }
      if (Number.isNaN(first)) first = out[i];
      else if (out[i] !== first) constant = false;
      i += n;
    }
    this.constant = constant;
  }
}

// ---------------------------------------------------------------------------------------
// Buffers and periodic waves

export class SimAudioBuffer {
  readonly numberOfChannels: number;
  readonly length: number;
  readonly sampleRate: number;
  private readonly data: Float32Array[];

  constructor(opts: { numberOfChannels?: number; length: number; sampleRate: number }) {
    const channels = opts.numberOfChannels ?? 1;
    if (!(channels >= 1) || !(opts.length >= 1) || !(opts.sampleRate > 0)) throw new SimDomError('NotSupportedError', 'bad buffer');
    this.numberOfChannels = channels;
    this.length = Math.floor(opts.length);
    this.sampleRate = opts.sampleRate;
    this.data = Array.from({ length: channels }, () => new Float32Array(this.length));
  }

  get duration(): number {
    return this.length / this.sampleRate;
  }

  getChannelData(c: number): Float32Array {
    const d = this.data[c];
    if (!d) throw new SimDomError('IndexSizeError', `channel ${c}`);
    return d;
  }

  copyToChannel(src: Float32Array, c: number, start = 0): void {
    this.getChannelData(c).set(src.subarray(0, Math.max(0, this.length - start)), start);
  }

  copyFromChannel(dst: Float32Array, c: number, start = 0): void {
    dst.set(this.getChannelData(c).subarray(start, start + dst.length));
  }
}

export class SimPeriodicWave {
  /** One cycle, 2048 samples, normalised to peak 1 unless asked not to. */
  readonly table: Float32Array;

  constructor(real: ArrayLike<number>, imag: ArrayLike<number>, normalise = true) {
    const n = 2048;
    const table = new Float32Array(n);
    const harmonics = Math.min(real.length, imag.length, 512);
    for (let k = 1; k < harmonics; k++) {
      const a = real[k];
      const b = imag[k];
      if (a === 0 && b === 0) continue;
      for (let i = 0; i < n; i++) {
        const ph = (2 * Math.PI * k * i) / n;
        table[i] += a * Math.cos(ph) + b * Math.sin(ph);
      }
    }
    if (normalise) {
      let peak = 0;
      for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(table[i]));
      if (peak > 0) for (let i = 0; i < n; i++) table[i] /= peak;
    }
    this.table = table;
  }
}

const SINE = (() => {
  const n = 4096;
  const t = new Float32Array(n + 1);
  for (let i = 0; i <= n; i++) t[i] = Math.sin((2 * Math.PI * i) / n);
  return t;
})();

// ---------------------------------------------------------------------------------------
// Nodes

type Dest = SimNode | SimParam;
type ChannelMode = 'max' | 'clamped-max' | 'explicit';


export abstract class SimNode {
  readonly context: SimContextBase;
  numberOfInputs = 1;
  numberOfOutputs = 1;
  channelCount = 2;
  channelCountMode: ChannelMode = 'max';
  channelInterpretation: 'speakers' | 'discrete' = 'speakers';
  /** Upstream nodes feeding input 0. */
  readonly inputs: SimNode[] = [];
  /** Where this node's output goes. */
  readonly outputs: Dest[] = [];
  protected out: Float32Array[] = [new Float32Array(Q)];
  private pulledQ = -1;
  private busy = false;
  /** The mixed input, reused: views of one and of two channels. */
  private readonly mixBufs = [new Float32Array(Q), new Float32Array(Q)];
  private readonly mixViews: Float32Array[][] = [[], [this.mixBufs[0]], [this.mixBufs[0], this.mixBufs[1]]];

  constructor(ctx: SimContextBase) {
    this.context = ctx;
    ctx.nodesCreated++;
  }

  connect<T extends Dest>(dest: T): T extends SimNode ? T : undefined {
    if (dest instanceof SimParam) {
      dest.sources.push(this);
    } else {
      if ((dest as SimNode).context !== this.context) throw new SimDomError('InvalidAccessError', 'different context');
      (dest as SimNode).inputs.push(this);
    }
    this.outputs.push(dest);
    return (dest instanceof SimParam ? undefined : dest) as T extends SimNode ? T : undefined;
  }

  disconnect(dest?: Dest): void {
    const remove = (d: Dest) => {
      const list = d instanceof SimParam ? d.sources : d.inputs;
      for (let i = list.length - 1; i >= 0; i--) if (list[i] === this) list.splice(i, 1);
    };
    if (dest) {
      remove(dest);
      for (let i = this.outputs.length - 1; i >= 0; i--) if (this.outputs[i] === dest) this.outputs.splice(i, 1);
      return;
    }
    for (const d of this.outputs) remove(d);
    this.outputs.length = 0;
  }

  /** This node's output for quantum q (computed once per quantum; a cycle sees the last one). */
  pull(q: number): Float32Array[] {
    if (this.pulledQ === q || this.busy) return this.out;
    this.busy = true;
    try {
      this.process(q);
    } finally {
      this.busy = false;
      this.pulledQ = q;
    }
    return this.out;
  }

  protected abstract process(q: number): void;

  /** How many channels the mixed input has (spec 1.5.4, computedNumberOfChannels). */
  protected inputChannels(q: number): number {
    let max = 1;
    for (const n of this.inputs) max = Math.max(max, n.pull(q).length);
    if (this.channelCountMode === 'explicit') return this.channelCount;
    if (this.channelCountMode === 'clamped-max') return Math.min(max, this.channelCount);
    return max;
  }

  /** Sum the inputs into `channels` channels (speakers up/down-mix, mono and stereo). */
  protected mixInputs(q: number, channels: number): Float32Array[] {
    let mix = this.mixViews[channels];
    if (!mix) {
      mix = Array.from({ length: channels }, (_, c) => this.mixBufs[c] ?? new Float32Array(Q));
      this.mixViews[channels] = mix;
    }
    for (let c = 0; c < channels; c++) mix[c].fill(0);
    for (const n of this.inputs) {
      const src = n.pull(q);
      if (src.length === channels) {
        for (let c = 0; c < channels; c++) {
          const a = src[c];
          const m = mix[c];
          for (let i = 0; i < Q; i++) m[i] += a[i];
        }
      } else if (src.length === 1) {
        const a = src[0];
        for (let c = 0; c < channels; c++) {
          const m = mix[c];
          for (let i = 0; i < Q; i++) m[i] += a[i];
        }
      } else if (channels === 1) {
        const a = src[0];
        const b = src[1];
        const m = mix[0];
        for (let i = 0; i < Q; i++) m[i] += (a[i] + b[i]) * 0.5;
      } else {
        for (let c = 0; c < channels; c++) {
          const a = src[Math.min(c, src.length - 1)];
          const m = mix[c];
          for (let i = 0; i < Q; i++) m[i] += a[i];
        }
      }
    }
    return mix;
  }

  protected ensureOut(channels: number): Float32Array[] {
    if (this.out.length !== channels) {
      while (this.out.length < channels) this.out.push(new Float32Array(Q));
      if (this.out.length > channels) this.out = this.out.slice(0, channels);
    }
    return this.out;
  }
}

class SimDestination extends SimNode {
  readonly maxChannelCount = 2;

  constructor(ctx: SimContextBase, channels: number) {
    super(ctx);
    this.channelCount = channels;
    this.channelCountMode = 'explicit';
    this.numberOfOutputs = 0;
    this.out = Array.from({ length: channels }, () => new Float32Array(Q));
  }

  protected process(q: number): void {
    const mix = this.mixInputs(q, this.channelCount);
    for (let c = 0; c < this.channelCount; c++) this.out[c].set(mix[c]);
  }
}

export class SimGain extends SimNode {
  readonly gain: SimParam;

  constructor(ctx: SimContextBase) {
    super(ctx);
    this.gain = new SimParam(ctx, 1);
  }

  protected process(q: number): void {
    const channels = this.inputChannels(q);
    const mix = this.mixInputs(q, channels);
    const out = this.ensureOut(channels);
    const g = this.gain.compute(q);
    if (this.gain.constant) {
      const k = g[0];
      for (let c = 0; c < channels; c++) {
        const a = mix[c];
        const o = out[c];
        for (let i = 0; i < Q; i++) o[i] = a[i] * k;
      }
    } else {
      for (let c = 0; c < channels; c++) {
        const a = mix[c];
        const o = out[c];
        for (let i = 0; i < Q; i++) o[i] = a[i] * g[i];
      }
    }
  }
}

type BiquadType = 'lowpass' | 'highpass' | 'bandpass' | 'lowshelf' | 'highshelf' | 'peaking' | 'notch' | 'allpass';

export class SimBiquad extends SimNode {
  type: BiquadType = 'lowpass';
  readonly frequency: SimParam;
  readonly Q: SimParam;
  readonly gain: SimParam;
  readonly detune: SimParam;
  private state: Float64Array[] = [];
  private b0 = 1;
  private b1 = 0;
  private b2 = 0;
  private a1 = 0;
  private a2 = 0;

  constructor(ctx: SimContextBase) {
    super(ctx);
    const nyq = ctx.sampleRate / 2;
    this.frequency = new SimParam(ctx, 350, 0, nyq);
    this.Q = new SimParam(ctx, 1);
    this.gain = new SimParam(ctx, 0);
    this.detune = new SimParam(ctx, 0);
  }

  /** Coefficients per the Web Audio spec's formulas (RBJ cookbook; low/high-pass Q in dB). */
  private coefficients(freq: number, qv: number, gainDb: number, detune: number): void {
    const sr = this.context.sampleRate;
    let f0 = freq * (detune !== 0 ? Math.pow(2, detune / 1200) : 1);
    f0 = Math.min(sr * 0.4999, Math.max(1, f0));
    const w0 = (2 * Math.PI * f0) / sr;
    const cw = Math.cos(w0);
    const sw = Math.sin(w0);
    const A = Math.pow(10, gainDb / 40);
    let b0: number, b1: number, b2: number, a0: number, a1: number, a2: number;
    switch (this.type) {
      case 'lowpass': {
        const alpha = sw / (2 * Math.pow(10, qv / 20));
        b0 = (1 - cw) / 2; b1 = 1 - cw; b2 = (1 - cw) / 2; a0 = 1 + alpha; a1 = -2 * cw; a2 = 1 - alpha;
        break;
      }
      case 'highpass': {
        const alpha = sw / (2 * Math.pow(10, qv / 20));
        b0 = (1 + cw) / 2; b1 = -(1 + cw); b2 = (1 + cw) / 2; a0 = 1 + alpha; a1 = -2 * cw; a2 = 1 - alpha;
        break;
      }
      case 'bandpass': {
        const alpha = sw / (2 * Math.max(1e-4, qv));
        b0 = alpha; b1 = 0; b2 = -alpha; a0 = 1 + alpha; a1 = -2 * cw; a2 = 1 - alpha;
        break;
      }
      case 'notch': {
        const alpha = sw / (2 * Math.max(1e-4, qv));
        b0 = 1; b1 = -2 * cw; b2 = 1; a0 = 1 + alpha; a1 = -2 * cw; a2 = 1 - alpha;
        break;
      }
      case 'allpass': {
        const alpha = sw / (2 * Math.max(1e-4, qv));
        b0 = 1 - alpha; b1 = -2 * cw; b2 = 1 + alpha; a0 = 1 + alpha; a1 = -2 * cw; a2 = 1 - alpha;
        break;
      }
      case 'peaking': {
        const alpha = sw / (2 * Math.max(1e-4, qv));
        b0 = 1 + alpha * A; b1 = -2 * cw; b2 = 1 - alpha * A; a0 = 1 + alpha / A; a1 = -2 * cw; a2 = 1 - alpha / A;
        break;
      }
      case 'lowshelf':
      case 'highshelf': {
        const alphaS = (sw / 2) * Math.sqrt(2);
        const sq = 2 * alphaS * Math.sqrt(A);
        if (this.type === 'lowshelf') {
          b0 = A * (A + 1 - (A - 1) * cw + sq); b1 = 2 * A * (A - 1 - (A + 1) * cw); b2 = A * (A + 1 - (A - 1) * cw - sq);
          a0 = A + 1 + (A - 1) * cw + sq; a1 = -2 * (A - 1 + (A + 1) * cw); a2 = A + 1 + (A - 1) * cw - sq;
        } else {
          b0 = A * (A + 1 + (A - 1) * cw + sq); b1 = -2 * A * (A - 1 + (A + 1) * cw); b2 = A * (A + 1 + (A - 1) * cw - sq);
          a0 = A + 1 - (A - 1) * cw + sq; a1 = 2 * (A - 1 - (A + 1) * cw); a2 = A + 1 - (A - 1) * cw - sq;
        }
        break;
      }
    }
    this.b0 = b0 / a0;
    this.b1 = b1 / a0;
    this.b2 = b2 / a0;
    this.a1 = a1 / a0;
    this.a2 = a2 / a0;
  }

  protected process(q: number): void {
    const channels = this.inputChannels(q);
    const mix = this.mixInputs(q, channels);
    const out = this.ensureOut(channels);
    while (this.state.length < channels) this.state.push(new Float64Array(4));
    const f = this.frequency.compute(q);
    const qv = this.Q.compute(q);
    const g = this.gain.compute(q);
    const d = this.detune.compute(q);
    const varying = !(this.frequency.constant && this.Q.constant && this.gain.constant && this.detune.constant);
    if (!varying) this.coefficients(f[0], qv[0], g[0], d[0]);
    for (let c = 0; c < channels; c++) {
      const s = this.state[c];
      let x1 = s[0], x2 = s[1], y1 = s[2], y2 = s[3];
      const a = mix[c];
      const o = out[c];
      for (let i = 0; i < Q; i++) {
        if (varying && (i & 7) === 0) this.coefficients(f[i], qv[i], g[i], d[i]);
        const x = a[i];
        let y = this.b0 * x + this.b1 * x1 + this.b2 * x2 - this.a1 * y1 - this.a2 * y2;
        if (Math.abs(y) < 1e-30) y = 0;
        x2 = x1;
        x1 = x;
        y2 = y1;
        y1 = y;
        o[i] = y;
      }
      s[0] = x1; s[1] = x2; s[2] = y1; s[3] = y2;
    }
  }

  getFrequencyResponse(freqs: Float32Array, mag: Float32Array, phase: Float32Array): void {
    this.coefficients(this.frequency.value, this.Q.value, this.gain.value, this.detune.value);
    const sr = this.context.sampleRate;
    for (let i = 0; i < freqs.length; i++) {
      const w = (2 * Math.PI * freqs[i]) / sr;
      const cr = Math.cos(w), ci = -Math.sin(w), c2r = Math.cos(2 * w), c2i = -Math.sin(2 * w);
      const nr = this.b0 + this.b1 * cr + this.b2 * c2r;
      const ni = this.b1 * ci + this.b2 * c2i;
      const dr = 1 + this.a1 * cr + this.a2 * c2r;
      const di = this.a1 * ci + this.a2 * c2i;
      const den = dr * dr + di * di;
      const hr = (nr * dr + ni * di) / den;
      const hi = (ni * dr - nr * di) / den;
      mag[i] = Math.hypot(hr, hi);
      phase[i] = Math.atan2(hi, hr);
    }
  }
}

/** Sources: start once, stop (the last call wins), 'ended' after the stop. */
export abstract class SimScheduledSource extends SimNode {
  onended: (() => void) | null = null;
  protected startFrame = -1;
  protected stopFrame = Infinity;
  protected endedFired = false;
  private listeners: Array<() => void> = [];

  constructor(ctx: SimContextBase) {
    super(ctx);
    this.numberOfInputs = 0;
  }

  start(when = 0, ..._rest: number[]): void {
    finiteOrThrow(when);
    if (this.startFrame >= 0) throw new SimDomError('InvalidStateError', 'start() called twice');
    if (when < 0) throw new RangeError('negative start');
    this.startFrame = Math.max(0, Math.round(when * this.context.sampleRate));
    this.context.track(this);
  }

  stop(when = 0): void {
    finiteOrThrow(when);
    if (this.startFrame < 0) throw new SimDomError('InvalidStateError', 'stop() before start()');
    if (this.endedFired) return;
    this.stopFrame = Math.max(0, Math.round(when * this.context.sampleRate));
  }

  addEventListener(type: string, fn: () => void): void {
    if (type === 'ended') this.listeners.push(fn);
  }

  removeEventListener(type: string, fn: () => void): void {
    if (type === 'ended') this.listeners = this.listeners.filter((f) => f !== fn);
  }

  /** Has the source finished by the end of quantum q (stopped, or played out)? */
  finishedBy(q: number): boolean {
    return this.startFrame >= 0 && (this.stopFrame <= (q + 1) * Q || this.playedOut());
  }

  protected playedOut(): boolean {
    return false;
  }

  /** Fire 'ended' once (the context calls it after the quantum). */
  fireEnded(): void {
    if (this.endedFired) return;
    this.endedFired = true;
    this.onended?.();
    for (const fn of this.listeners) fn();
  }

  get started(): boolean {
    return this.startFrame >= 0;
  }

  get ended(): boolean {
    return this.endedFired;
  }
}

const polyBlep = (t: number, dt: number): number => {
  if (t < dt) {
    const x = t / dt;
    return x + x - x * x - 1;
  }
  if (t > 1 - dt) {
    const x = (t - 1) / dt;
    return x * x + x + x + 1;
  }
  return 0;
};

export class SimOscillator extends SimScheduledSource {
  type: OscillatorType | 'custom' = 'sine';
  readonly frequency: SimParam;
  readonly detune: SimParam;
  private phase = 0;
  private wave: Float32Array | null = null;

  constructor(ctx: SimContextBase) {
    super(ctx);
    const nyq = ctx.sampleRate / 2;
    this.frequency = new SimParam(ctx, 440, -nyq, nyq);
    this.detune = new SimParam(ctx, 0);
  }

  setPeriodicWave(wave: SimPeriodicWave): void {
    this.wave = wave.table;
    this.type = 'custom';
  }

  protected process(q: number): void {
    const out = this.ensureOut(1)[0];
    const f0 = q * Q;
    if (this.startFrame < 0 || this.startFrame >= f0 + Q || this.stopFrame <= f0) {
      out.fill(0);
      return;
    }
    const freq = this.frequency.compute(q);
    const det = this.detune.compute(q);
    const detConst = this.detune.constant && det[0] === 0;
    const sr = this.context.sampleRate;
    const from = Math.max(0, this.startFrame - f0);
    const to = Math.min(Q, this.stopFrame - f0);
    out.fill(0, 0, from);
    out.fill(0, to);
    const type = this.type;
    const table = this.wave;
    let ph = this.phase;
    for (let i = from; i < to; i++) {
      const hz = detConst ? freq[i] : freq[i] * Math.pow(2, det[i] / 1200);
      const dt = Math.min(0.5, Math.abs(hz) / sr);
      let s: number;
      if (type === 'sine') {
        const x = ph * 4096;
        const j = x | 0;
        const fr = x - j;
        s = SINE[j] + (SINE[j + 1] - SINE[j]) * fr;
      } else if (type === 'sawtooth') {
        let t = ph + 0.5;
        if (t >= 1) t -= 1;
        s = 2 * t - 1 - polyBlep(t, dt);
      } else if (type === 'square') {
        s = (ph < 0.5 ? 1 : -1) + polyBlep(ph, dt) - polyBlep((ph + 0.5) % 1, dt);
      } else if (type === 'triangle') {
        // Naive triangle (its harmonics fall at 12 dB/octave, so aliasing stays far below the
        // fundamental): -1 at phase 0, +1 at half a cycle.
        s = 1 - 4 * Math.abs(ph - 0.5);
      } else if (table) {
        const x = ph * 2048;
        const j = x | 0;
        const fr = x - j;
        s = table[j & 2047] + (table[(j + 1) & 2047] - table[j & 2047]) * fr;
      } else s = 0;
      out[i] = s;
      ph += hz / sr;
      ph -= Math.floor(ph);
    }
    this.phase = ph;
  }
}

export class SimBufferSource extends SimScheduledSource {
  buffer: SimAudioBuffer | null = null;
  loop = false;
  loopStart = 0;
  loopEnd = 0;
  readonly playbackRate: SimParam;
  readonly detune: SimParam;
  private pos = 0;
  private offsetFrames = 0;
  private begun = false;
  private done = false;
  private dataOf: SimAudioBuffer | null = null;
  private data: Float32Array[] = [];

  constructor(ctx: SimContextBase) {
    super(ctx);
    this.playbackRate = new SimParam(ctx, 1, -MAX_FLOAT, MAX_FLOAT, 'k-rate');
    this.detune = new SimParam(ctx, 0, -MAX_FLOAT, MAX_FLOAT, 'k-rate');
  }

  override start(when = 0, offset = 0, duration?: number): void {
    super.start(when);
    finiteOrThrow(offset);
    this.offsetFrames = Math.max(0, offset) * (this.buffer?.sampleRate ?? this.context.sampleRate);
    if (duration !== undefined) {
      finiteOrThrow(duration);
      this.stopFrame = Math.min(this.stopFrame, this.startFrame + Math.round(duration * this.context.sampleRate));
    }
  }

  protected override playedOut(): boolean {
    return this.done;
  }

  protected process(q: number): void {
    const buf = this.buffer;
    const channels = buf ? buf.numberOfChannels : 1;
    const out = this.ensureOut(channels);
    const f0 = q * Q;
    for (const o of out) o.fill(0);
    if (!buf || this.done || this.startFrame < 0 || this.startFrame >= f0 + Q || this.stopFrame <= f0) return;
    if (!this.begun) {
      this.begun = true;
      this.pos = this.offsetFrames;
    }
    const rate0 = this.playbackRate.compute(q)[0] * Math.pow(2, this.detune.compute(q)[0] / 1200);
    const step = (rate0 * buf.sampleRate) / this.context.sampleRate;
    const len = buf.length;
    let ls = 0;
    let le = len;
    if (this.loop) {
      ls = Math.max(0, Math.min(len, this.loopStart * buf.sampleRate));
      le = this.loopEnd > 0 ? Math.max(0, Math.min(len, this.loopEnd * buf.sampleRate)) : len;
      if (ls >= le) {
        ls = 0;
        le = len;
      }
    }
    const from = Math.max(0, this.startFrame - f0);
    const to = Math.min(Q, this.stopFrame - f0);
    if (this.dataOf !== buf) {
      this.dataOf = buf;
      this.data = Array.from({ length: channels }, (_, c) => buf.getChannelData(c));
    }
    const data = this.data;
    let pos = this.pos;
    for (let i = from; i < to; i++) {
      if (this.loop) {
        if (pos >= le) pos = ls + ((pos - ls) % Math.max(1e-9, le - ls));
        if (pos < 0) pos = le - ((ls - pos) % Math.max(1e-9, le - ls));
      } else if (pos >= len || pos < 0) {
        this.done = true;
        break;
      }
      const j = Math.floor(pos);
      const fr = pos - j;
      const j1 = j + 1 < (this.loop ? le : len) ? j + 1 : this.loop ? ls : j;
      for (let c = 0; c < channels; c++) {
        const d = data[c];
        out[c][i] = d[j] + ((d[j1] ?? 0) - d[j]) * fr;
      }
      pos += step;
    }
    this.pos = pos;
  }
}

export class SimConstantSource extends SimScheduledSource {
  readonly offset: SimParam;

  constructor(ctx: SimContextBase) {
    super(ctx);
    this.offset = new SimParam(ctx, 1);
  }

  protected process(q: number): void {
    const out = this.ensureOut(1)[0];
    const f0 = q * Q;
    out.fill(0);
    if (this.startFrame < 0 || this.startFrame >= f0 + Q || this.stopFrame <= f0) return;
    const v = this.offset.compute(q);
    const from = Math.max(0, this.startFrame - f0);
    const to = Math.min(Q, this.stopFrame - f0);
    for (let i = from; i < to; i++) out[i] = v[i];
  }
}

export class SimStereoPanner extends SimNode {
  readonly pan: SimParam;

  constructor(ctx: SimContextBase) {
    super(ctx);
    this.pan = new SimParam(ctx, 0, -1, 1);
    this.channelCount = 2;
    this.channelCountMode = 'clamped-max';
    this.out = [new Float32Array(Q), new Float32Array(Q)];
  }

  protected process(q: number): void {
    const channels = this.inputChannels(q);
    const mix = this.mixInputs(q, channels);
    const [l, r] = this.ensureOut(2);
    const p = this.pan.compute(q);
    const half = Math.PI / 2;
    if (channels === 1) {
      const a = mix[0];
      for (let i = 0; i < Q; i++) {
        const x = (p[i] + 1) / 2;
        l[i] = a[i] * Math.cos(x * half);
        r[i] = a[i] * Math.sin(x * half);
      }
      return;
    }
    const a = mix[0];
    const b = mix[1];
    for (let i = 0; i < Q; i++) {
      const pan = p[i];
      if (pan <= 0) {
        const x = pan + 1;
        l[i] = a[i] + b[i] * Math.cos(x * half);
        r[i] = b[i] * Math.sin(x * half);
      } else {
        const x = pan;
        l[i] = a[i] * Math.cos(x * half);
        r[i] = b[i] + a[i] * Math.sin(x * half);
      }
    }
  }
}

/** Uniform-partitioned FFT convolution of one channel: zero latency, a 128 head then 2048 blocks. */
class PartitionedConvolver {
  private readonly head: Conv;
  private readonly tail: Conv | null;

  constructor(ir: Float32Array) {
    const HEAD = 2048;
    this.head = new Conv(ir.subarray(0, Math.min(ir.length, HEAD)), Q, 0);
    this.tail = ir.length > HEAD ? new Conv(ir.subarray(HEAD), HEAD, HEAD) : null;
  }

  process(input: Float32Array, out: Float32Array): void {
    this.head.process(input, out, false);
    this.tail?.process(input, out, true);
  }
}

/**
 * One uniform partition stage: blocks of `block` input samples convolved with the IR (split into
 * partitions of `block`), the result delayed by `delay` samples (the head covers the first part).
 * Input arrives one render quantum at a time; a block's output is ready when its input is complete.
 */
class Conv {
  private readonly parts: Array<{ re: Float64Array; im: Float64Array }> = [];
  private readonly n: number;
  private readonly fdlRe: Float64Array[] = [];
  private readonly fdlIm: Float64Array[] = [];
  private fdlHead = 0;
  private readonly inBlock: Float64Array;
  private inFill = 0;
  /** Output overlap ring: samples to add to the output stream. */
  private readonly ring: Float64Array;
  private readonly ringMask: number;
  private silentBlocks = 0;
  private readonly accRe: Float64Array;
  private readonly accIm: Float64Array;

  constructor(ir: Float32Array, private readonly block: number, delay: number) {
    this.n = block * 2;
    const count = Math.ceil(ir.length / block);
    for (let p = 0; p < count; p++) {
      const re = new Float64Array(this.n);
      const im = new Float64Array(this.n);
      for (let i = 0; i < block; i++) re[i] = ir[p * block + i] ?? 0;
      fft(re, im);
      this.parts.push({ re, im });
      this.fdlRe.push(new Float64Array(this.n));
      this.fdlIm.push(new Float64Array(this.n));
    }
    this.inBlock = new Float64Array(block);
    let size = 1;
    while (size < ir.length + this.n + delay + block * 2) size <<= 1;
    this.ring = new Float64Array(size);
    this.ringMask = size - 1;
    // Output for input sample k lands at stream position k + delay (+ the IR offset in the partitions).
    // Blocks are processed when complete, `block - Q` samples after their first sample arrived, so
    // the stage writes at an offset that keeps the output aligned with the input stream.
    this.writeBase = delay;
    this.accRe = new Float64Array(this.n);
    this.accIm = new Float64Array(this.n);
  }

  private writeBase: number;
  private streamPos = 0;

  process(input: Float32Array, out: Float32Array, add: boolean): void {
    // Collect the input.
    let energy = 0;
    for (let i = 0; i < Q; i++) {
      this.inBlock[this.inFill + i] = input[i];
      energy += input[i] * input[i];
    }
    const blockStart = this.streamPos - this.inFill;
    this.inFill += Q;
    this.streamPos += Q;
    if (this.inFill >= this.block) {
      this.inFill = 0;
      this.consume(blockStart, energy);
    }
    // Emit this quantum's output from the ring (the head stage writes ahead of time; the tail stage's
    // first useful output is `delay` samples later, already covered by the ring's alignment).
    const base = this.streamPos - Q;
    for (let i = 0; i < Q; i++) {
      const at = (base + i) & this.ringMask;
      const v = this.ring[at];
      this.ring[at] = 0;
      if (add) out[i] += v;
      else out[i] = v;
    }
  }

  private consume(blockStart: number, lastEnergy: number): void {
    // Skip all work while the input and the delay line are silent.
    let blockEnergy = lastEnergy;
    for (let i = 0; i < this.block - Q; i++) blockEnergy += this.inBlock[i] * this.inBlock[i];
    if (blockEnergy === 0) this.silentBlocks++;
    else this.silentBlocks = 0;
    const P = this.parts.length;
    this.fdlHead = (this.fdlHead + P - 1) % P;
    const re = this.fdlRe[this.fdlHead];
    const im = this.fdlIm[this.fdlHead];
    re.fill(0);
    im.fill(0);
    if (blockEnergy > 0) {
      for (let i = 0; i < this.block; i++) re[i] = this.inBlock[i];
      fft(re, im);
    }
    if (this.silentBlocks > P) return;
    // Each partition p contributes (input block convolved with IR part p) at offset p * block.
    const n = this.n;
    const half = n / 2;
    for (let p = 0; p < P; p++) {
      const k = (this.fdlHead + p) % P;
      const xr = this.fdlRe[k];
      const xi = this.fdlIm[k];
      const part = this.parts[p];
      // Accumulate in the frequency domain per output offset: partitions combine at the same offset
      // only when they pair (block b - p with part p); here each delay-line slot k holds the block
      // that arrived p blocks ago, so the sum over p is the current output block.
      if (p === 0) {
        for (let i = 0; i <= half; i++) {
          this.accRe[i] = xr[i] * part.re[i] - xi[i] * part.im[i];
          this.accIm[i] = xr[i] * part.im[i] + xi[i] * part.re[i];
        }
      } else {
        for (let i = 0; i <= half; i++) {
          this.accRe[i] += xr[i] * part.re[i] - xi[i] * part.im[i];
          this.accIm[i] += xr[i] * part.im[i] + xi[i] * part.re[i];
        }
      }
    }
    // Real signal: mirror the spectrum, then inverse FFT (conjugate trick).
    const ar = this.accRe;
    const ai = this.accIm;
    for (let i = 1; i < half; i++) {
      ar[n - i] = ar[i];
      ai[n - i] = -ai[i];
    }
    for (let i = 0; i < n; i++) ai[i] = -ai[i];
    fft(ar, ai);
    const inv = 1 / n;
    // The current output block (time-aligned to this input block): overlap-add its 2 * block samples.
    const at = blockStart + this.writeBase;
    for (let i = 0; i < n; i++) {
      const idx = (at + i) & this.ringMask;
      this.ring[idx] += ar[i] * inv;
    }
  }
}

export class SimConvolver extends SimNode {
  normalize = true;
  private ir: SimAudioBuffer | null = null;
  private scale = 1;
  private convs: PartitionedConvolver[] = [];
  private irChannels = 0;
  private readonly tmp = new Float32Array(Q);

  constructor(ctx: SimContextBase) {
    super(ctx);
    this.channelCount = 2;
    this.channelCountMode = 'clamped-max';
  }

  get buffer(): SimAudioBuffer | null {
    return this.ir;
  }

  set buffer(b: SimAudioBuffer | null) {
    this.ir = b;
    this.convs = [];
    this.irChannels = b?.numberOfChannels ?? 0;
    if (!b) return;
    if (b.sampleRate !== this.context.sampleRate) throw new SimDomError('NotSupportedError', 'impulse response sample rate');
    this.scale = this.normalize ? normalizationScale(b) : 1;
    // One convolver per output channel: a stereo IR's two channels, or a mono IR for each side.
    for (let c = 0; c < 2; c++) {
      const data = Float32Array.from(b.getChannelData(Math.min(c, b.numberOfChannels - 1)), (v) => v * this.scale);
      this.convs.push(new PartitionedConvolver(data));
    }
  }

  protected process(q: number): void {
    const channels = this.inputChannels(q);
    const mix = this.mixInputs(q, channels);
    if (!this.ir) {
      const out = this.ensureOut(1);
      out[0].fill(0);
      return;
    }
    const outCh = this.irChannels >= 2 || channels >= 2 ? 2 : 1;
    const out = this.ensureOut(outCh);
    for (let c = 0; c < outCh; c++) {
      this.tmp.set(channels >= 2 ? mix[c] : mix[0]);
      this.convs[c].process(this.tmp, out[c]);
    }
  }
}

/** The ConvolverNode's normalisation (Web Audio spec, "Normalization"). */
export function normalizationScale(b: { numberOfChannels: number; length: number; sampleRate: number; getChannelData(c: number): Float32Array }): number {
  const GainCalibration = 0.00125;
  const GainCalibrationSampleRate = 44100;
  const MinPower = 0.000125;
  let power = 0;
  for (let c = 0; c < b.numberOfChannels; c++) {
    const d = b.getChannelData(c);
    for (let i = 0; i < d.length; i++) power += d[i] * d[i];
  }
  power = Math.sqrt(power / (b.numberOfChannels * b.length));
  if (!Number.isFinite(power) || power < MinPower) power = MinPower;
  let scale = 1 / power;
  scale *= GainCalibration;
  scale *= GainCalibrationSampleRate / b.sampleRate;
  if (b.numberOfChannels === 4) scale *= 0.5;
  return scale;
}

const dbToLin = (db: number): number => Math.pow(10, db / 20);
const linToDb = (x: number): number => (x > 0 ? 20 * Math.log10(x) : -1000);

/**
 * The DynamicsCompressorNode, after the Web Audio spec's processing model (as Chromium's
 * DynamicsCompressorKernel): a 6 ms pre-delay, a detector on the un-delayed peak, the knee curve,
 * attack and an adaptive release, the sin() warp and makeup gain = (1 / fullRangeGain)^0.6.
 */
export class SimCompressor extends SimNode {
  readonly threshold: SimParam;
  readonly knee: SimParam;
  readonly ratio: SimParam;
  readonly attack: SimParam;
  readonly release: SimParam;
  private delay: Float32Array[] = [];
  private delayIndex = 0;
  private detectorAverage = 0;
  private compressorGain = 1;
  private maxAttackDiffDb = -1;
  private metering = 0;
  private linearThreshold = 0;
  private kneeThresholdDb = 0;
  private kneeThreshold = 0;
  private ykneeThresholdDb = 0;
  private slope = 1;
  private k = 5;
  private lastCurve = '';

  constructor(ctx: SimContextBase) {
    super(ctx);
    this.channelCount = 2;
    this.channelCountMode = 'clamped-max';
    this.threshold = new SimParam(ctx, -24, -100, 0, 'k-rate');
    this.knee = new SimParam(ctx, 30, 0, 40, 'k-rate');
    this.ratio = new SimParam(ctx, 12, 1, 20, 'k-rate');
    this.attack = new SimParam(ctx, 0.003, 0, 1, 'k-rate');
    this.release = new SimParam(ctx, 0.25, 0, 1, 'k-rate');
  }

  get reduction(): number {
    return this.metering;
  }

  private kneeCurve(x: number, k: number): number {
    if (x < this.linearThreshold) return x;
    return this.linearThreshold + (1 - Math.exp(-k * (x - this.linearThreshold))) / k;
  }

  private saturate(x: number, k: number): number {
    if (x < this.kneeThreshold) return this.kneeCurve(x, k);
    const xDb = linToDb(x);
    return dbToLin(this.ykneeThresholdDb + this.slope * (xDb - this.kneeThresholdDb));
  }

  private slopeAt(x: number, k: number): number {
    if (x < this.linearThreshold) return 1;
    const x2 = x * 1.001;
    const xDb = linToDb(x);
    const x2Db = linToDb(x2);
    const yDb = linToDb(this.kneeCurve(x, k));
    const y2Db = linToDb(this.kneeCurve(x2, k));
    return (y2Db - yDb) / (x2Db - xDb);
  }

  private updateCurve(thresholdDb: number, kneeDb: number, ratio: number): void {
    const key = `${thresholdDb}|${kneeDb}|${ratio}`;
    if (key === this.lastCurve) return;
    this.lastCurve = key;
    this.linearThreshold = dbToLin(thresholdDb);
    this.slope = 1 / ratio;
    // k at the slope 1/ratio at the knee's end (binary search, as the kernel does).
    const x = dbToLin(thresholdDb + kneeDb);
    let minK = 0.1;
    let maxK = 10000;
    let k = 5;
    for (let i = 0; i < 15; i++) {
      if (this.slopeAt(x, k) < this.slope) maxK = k;
      else minK = k;
      k = Math.sqrt(minK * maxK);
    }
    this.k = k;
    this.kneeThresholdDb = thresholdDb + kneeDb;
    this.kneeThreshold = dbToLin(this.kneeThresholdDb);
    this.ykneeThresholdDb = linToDb(this.kneeCurve(this.kneeThreshold, k));
  }

  protected process(q: number): void {
    const channels = this.inputChannels(q);
    const mix = this.mixInputs(q, channels);
    const out = this.ensureOut(channels);
    const sr = this.context.sampleRate;
    const preDelayFrames = Math.round(0.006 * sr);
    const size = 1024;
    while (this.delay.length < channels) this.delay.push(new Float32Array(size));
    const threshold = this.threshold.compute(q)[0];
    const knee = this.knee.compute(q)[0];
    const ratio = this.ratio.compute(q)[0];
    const attack = this.attack.compute(q)[0];
    const release = this.release.compute(q)[0];
    this.updateCurve(threshold, knee, ratio);
    const k = this.k;
    const fullRangeGain = this.saturate(1, k);
    const makeup = Math.pow(1 / fullRangeGain, 0.6);
    const attackFrames = Math.max(0.001, attack) * sr;
    const releaseFrames = Math.max(0.001, release) * sr;
    const satReleaseFrames = 0.0025 * sr;
    const y1 = releaseFrames * 0.09;
    const y2 = releaseFrames * 0.16;
    const y3 = releaseFrames * 0.42;
    const y4 = releaseFrames * 0.98;
    const kA = 0.9999999999999998 * y1 + 1.8432219684323923e-16 * y2 - 1.9373394351676423e-16 * y3 + 8.824516011816245e-18 * y4;
    const kB = -1.5788320352845888 * y1 + 2.3305837032074286 * y2 - 0.9141194204840429 * y3 + 0.1623677525612032 * y4;
    const kC = 0.5334142869106424 * y1 - 1.272736789213631 * y2 + 0.9258856042207512 * y3 - 0.18656310191776226 * y4;
    const kD = 0.08783463138207234 * y1 - 0.1694162967925622 * y2 + 0.08588057951595272 * y3 - 0.00429891410546283 * y4;
    const kE = -0.042416883008123074 * y1 + 0.1115693827987602 * y2 - 0.09764676325265872 * y3 + 0.028494263462021576 * y4;
    const mask = size - 1;
    let frame = 0;
    for (let div = 0; div < Q / 32; div++) {
      if (!Number.isFinite(this.detectorAverage)) this.detectorAverage = 1;
      const desiredGain = this.detectorAverage;
      const scaledDesiredGain = Math.asin(Math.min(1, desiredGain)) / (Math.PI / 2);
      let envelopeRate: number;
      const isReleasing = scaledDesiredGain > this.compressorGain;
      let diffDb = linToDb(this.compressorGain / scaledDesiredGain);
      if (isReleasing) {
        this.maxAttackDiffDb = -1;
        if (!Number.isFinite(diffDb)) diffDb = -1;
        let x = Math.min(0, Math.max(-12, diffDb));
        x = 0.25 * (x + 12);
        const x2 = x * x;
        const rf = kA + kB * x + kC * x2 + kD * x2 * x + kE * x2 * x2;
        envelopeRate = dbToLin(5 / rf);
      } else {
        if (!Number.isFinite(diffDb)) diffDb = 1;
        if (this.maxAttackDiffDb === -1 || this.maxAttackDiffDb < diffDb) this.maxAttackDiffDb = diffDb;
        const eff = Math.max(0.5, this.maxAttackDiffDb);
        envelopeRate = 1 - Math.pow(0.25 / eff, 1 / attackFrames);
      }
      let det = this.detectorAverage;
      let gain = this.compressorGain;
      for (let n = 0; n < 32; n++, frame++) {
        const w = this.delayIndex;
        const r = (w - preDelayFrames + size) & mask;
        let input = 0;
        for (let c = 0; c < channels; c++) {
          const s = mix[c][frame];
          this.delay[c][w] = s;
          const a = s < 0 ? -s : s;
          if (a > input) input = a;
        }
        const shaped = this.saturate(input, k);
        const attenuation = input <= 0.0001 ? 1 : shaped / input;
        let attenuationDb = -linToDb(attenuation);
        attenuationDb = Math.max(2, attenuationDb);
        const satReleaseRate = dbToLin(attenuationDb / satReleaseFrames) - 1;
        const rate = attenuation > det ? satReleaseRate : 1;
        det += (attenuation - det) * rate;
        det = Math.min(1, det);
        if (!Number.isFinite(det)) det = 1;
        if (envelopeRate < 1) gain += (scaledDesiredGain - gain) * envelopeRate;
        else {
          gain *= envelopeRate;
          gain = Math.min(1, gain);
        }
        const warped = Math.sin((Math.PI / 2) * gain);
        const total = makeup * warped;
        const dbReal = 20 * Math.log10(Math.max(1e-12, warped));
        if (dbReal < this.metering) this.metering = dbReal;
        else this.metering += (dbReal - this.metering) * 0.0005;
        for (let c = 0; c < channels; c++) out[c][frame] = this.delay[c][r] * total;
        this.delayIndex = (w + 1) & mask;
      }
      this.detectorAverage = det;
      this.compressorGain = gain;
    }
  }
}

export class SimWaveShaper extends SimNode {
  curve: Float32Array | null = null;
  oversample: 'none' | '2x' | '4x' = 'none';

  protected process(q: number): void {
    const channels = this.inputChannels(q);
    const mix = this.mixInputs(q, channels);
    const out = this.ensureOut(channels);
    const c = this.curve;
    for (let ch = 0; ch < channels; ch++) {
      const a = mix[ch];
      const o = out[ch];
      if (!c || c.length === 0) {
        o.set(a);
        continue;
      }
      const n = c.length;
      for (let i = 0; i < Q; i++) {
        const v = ((n - 1) / 2) * (a[i] + 1);
        if (v <= 0) o[i] = c[0];
        else if (v >= n - 1) o[i] = c[n - 1];
        else {
          const k = Math.floor(v);
          const f = v - k;
          o[i] = (1 - f) * c[k] + f * c[k + 1];
        }
      }
    }
  }
}

export class SimDelay extends SimNode {
  readonly delayTime: SimParam;
  private lines: Float32Array[] = [];
  private w = 0;

  constructor(ctx: SimContextBase, maxDelay = 1) {
    super(ctx);
    this.delayTime = new SimParam(ctx, 0, 0, maxDelay, 'k-rate');
    this.size = Math.ceil(maxDelay * ctx.sampleRate) + Q * 2 + 2;
  }

  private readonly size: number;

  protected process(q: number): void {
    const channels = this.inputChannels(q);
    const mix = this.mixInputs(q, channels);
    const out = this.ensureOut(channels);
    while (this.lines.length < channels) this.lines.push(new Float32Array(this.size));
    const d = Math.max(Q, this.delayTime.compute(q)[0] * this.context.sampleRate);
    for (let i = 0; i < Q; i++) {
      for (let c = 0; c < channels; c++) {
        const line = this.lines[c];
        line[(this.w + i) % this.size] = mix[c][i];
        const pos = this.w + i - d;
        const j = Math.floor(pos);
        const f = pos - j;
        const a = line[((j % this.size) + this.size) % this.size];
        const b = line[(((j + 1) % this.size) + this.size) % this.size];
        out[c][i] = a + (b - a) * f;
      }
    }
    this.w = (this.w + Q) % this.size;
  }
}

export class SimAnalyser extends SimNode {
  fftSize = 2048;
  smoothingTimeConstant = 0.8;
  minDecibels = -100;
  maxDecibels = -30;
  private readonly history = new Float32Array(32768);
  private written = 0;

  constructor(ctx: SimContextBase) {
    super(ctx);
    ctx.autoPull.push(this);
  }

  get frequencyBinCount(): number {
    return this.fftSize / 2;
  }

  protected process(q: number): void {
    const channels = this.inputChannels(q);
    const mix = this.mixInputs(q, channels);
    const out = this.ensureOut(channels);
    for (let c = 0; c < channels; c++) out[c].set(mix[c]);
    const h = this.history;
    for (let i = 0; i < Q; i++) {
      let v = 0;
      for (let c = 0; c < channels; c++) v += mix[c][i];
      h[(this.written + i) % h.length] = v / channels;
    }
    this.written += Q;
  }

  getFloatTimeDomainData(arr: Float32Array): void {
    const h = this.history;
    const n = Math.min(arr.length, this.fftSize);
    for (let i = 0; i < n; i++) arr[i] = h[(((this.written - n + i) % h.length) + h.length) % h.length];
  }
}

// ---------------------------------------------------------------------------------------
// Contexts

export abstract class SimContextBase {
  readonly sampleRate: number;
  readonly destination: SimDestination;
  readonly listener = {};
  state: 'suspended' | 'running' | 'closed' = 'running';
  onstatechange: (() => void) | null = null;
  /** Frames rendered so far (currentTime = frame / sampleRate). */
  protected frame = 0;
  /** Nodes processed every quantum even when nothing downstream pulls them (analysers). */
  readonly autoPull: SimNode[] = [];
  /** Started sources that have not ended. */
  private active = new Set<SimScheduledSource>();
  nodesCreated = 0;
  /** The most sources alive at once (diagnostics). */
  peakActiveSources = 0;

  constructor(sampleRate: number, channels: number) {
    this.sampleRate = sampleRate;
    this.destination = new SimDestination(this, channels);
  }

  get currentTime(): number {
    return this.frame / this.sampleRate;
  }

  get activeSources(): number {
    return this.active.size;
  }

  track(src: SimScheduledSource): void {
    this.active.add(src);
    if (this.active.size > this.peakActiveSources) this.peakActiveSources = this.active.size;
  }

  createGain(): SimGain {
    return new SimGain(this);
  }

  createBiquadFilter(): SimBiquad {
    return new SimBiquad(this);
  }

  createOscillator(): SimOscillator {
    return new SimOscillator(this);
  }

  createBufferSource(): SimBufferSource {
    return new SimBufferSource(this);
  }

  createConstantSource(): SimConstantSource {
    return new SimConstantSource(this);
  }

  createStereoPanner(): SimStereoPanner {
    return new SimStereoPanner(this);
  }

  createConvolver(): SimConvolver {
    return new SimConvolver(this);
  }

  createDynamicsCompressor(): SimCompressor {
    return new SimCompressor(this);
  }

  createWaveShaper(): SimWaveShaper {
    return new SimWaveShaper(this);
  }

  createDelay(maxDelayTime = 1): SimDelay {
    return new SimDelay(this, maxDelayTime);
  }

  createAnalyser(): SimAnalyser {
    return new SimAnalyser(this);
  }

  createBuffer(numberOfChannels: number, length: number, sampleRate: number): SimAudioBuffer {
    return new SimAudioBuffer({ numberOfChannels, length, sampleRate });
  }

  createPeriodicWave(real: ArrayLike<number>, imag: ArrayLike<number>, opts?: { disableNormalization?: boolean }): SimPeriodicWave {
    return new SimPeriodicWave(real, imag, !opts?.disableNormalization);
  }

  /** Render one quantum into `outs` (channels of the destination) at offset `at`. */
  protected renderQuantum(outs: Float32Array[] | null, at: number): void {
    const q = this.frame / Q;
    const dest = this.destination.pull(q);
    for (const n of this.autoPull) n.pull(q);
    if (outs) for (let c = 0; c < outs.length; c++) outs[c].set(dest[c].subarray(0, Math.min(Q, outs[c].length - at)), at);
    // 'ended' after the quantum, as the browser dispatches it after rendering.
    const ended: SimScheduledSource[] = [];
    for (const s of this.active) if (s.finishedBy(q)) ended.push(s);
    for (const s of ended) {
      this.active.delete(s);
      s.fireEnded();
    }
    this.frame += Q;
  }
}

/** A realtime-like context whose clock moves only when `render()` is called (tests drive it). */
export class SimAudioContext extends SimContextBase {
  readonly baseLatency = 0;
  /** Everything rendered since the last `take()`, per channel. */
  private recorded: Float32Array[][] = [[], []];
  recording = true;

  constructor(opts: { sampleRate?: number; latencyHint?: unknown } = {}) {
    super(opts.sampleRate ?? 24000, 2);
  }

  resume(): Promise<void> {
    if (this.state !== 'closed') this.state = 'running';
    return Promise.resolve();
  }

  suspend(): Promise<void> {
    if (this.state !== 'closed') this.state = 'suspended';
    return Promise.resolve();
  }

  close(): Promise<void> {
    this.state = 'closed';
    return Promise.resolve();
  }

  /** Advance the clock by `seconds` (whole quanta), rendering the graph. */
  render(seconds: number): void {
    const quanta = Math.max(0, Math.round((seconds * this.sampleRate) / Q));
    for (let i = 0; i < quanta; i++) {
      if (this.recording) {
        const outs = [new Float32Array(Q), new Float32Array(Q)];
        this.renderQuantum(outs, 0);
        this.recorded[0].push(outs[0]);
        this.recorded[1].push(outs[1]);
      } else this.renderQuantum(null, 0);
    }
  }

  /** The recorded output since the last take (and clear it). */
  take(): [Float32Array, Float32Array] {
    const join = (parts: Float32Array[]) => {
      const out = new Float32Array(parts.length * Q);
      parts.forEach((p, i) => out.set(p, i * Q));
      return out;
    };
    const res: [Float32Array, Float32Array] = [join(this.recorded[0]), join(this.recorded[1])];
    this.recorded = [[], []];
    return res;
  }
}

export class SimOfflineAudioContext extends SimContextBase {
  readonly length: number;
  private readonly channels: number;

  constructor(a: number | { numberOfChannels?: number; length: number; sampleRate: number }, length?: number, sampleRate?: number) {
    const o = typeof a === 'number' ? { numberOfChannels: a, length: length!, sampleRate: sampleRate! } : a;
    super(o.sampleRate, o.numberOfChannels ?? 1);
    this.length = Math.floor(o.length);
    this.channels = o.numberOfChannels ?? 1;
    this.state = 'suspended';
  }

  startRendering(): Promise<SimAudioBuffer> {
    this.state = 'running';
    const buf = new SimAudioBuffer({ numberOfChannels: this.channels, length: this.length, sampleRate: this.sampleRate });
    const outs = Array.from({ length: this.channels }, (_, c) => buf.getChannelData(c));
    for (let at = 0; at < this.length; at += Q) this.renderQuantum(outs, at);
    this.state = 'closed';
    return Promise.resolve(buf);
  }

  resume(): Promise<void> {
    return Promise.resolve();
  }

  suspend(): Promise<void> {
    return Promise.resolve();
  }
}

/** Put the emulator on globalThis as AudioContext / OfflineAudioContext (tests); returns an undo. */
export function installSimAudio(sampleRate = 24000): { contexts: SimAudioContext[]; restore: () => void } {
  const g = globalThis as Record<string, unknown>;
  const prev = { AudioContext: g.AudioContext, OfflineAudioContext: g.OfflineAudioContext, webkitAudioContext: g.webkitAudioContext };
  const contexts: SimAudioContext[] = [];
  class Ctx extends SimAudioContext {
    constructor(opts: { sampleRate?: number; latencyHint?: unknown } = {}) {
      super({ sampleRate: opts.sampleRate ?? sampleRate });
      contexts.push(this);
    }
  }
  g.AudioContext = Ctx;
  g.OfflineAudioContext = SimOfflineAudioContext;
  return {
    contexts,
    restore: () => {
      g.AudioContext = prev.AudioContext;
      g.OfflineAudioContext = prev.OfflineAudioContext;
      g.webkitAudioContext = prev.webkitAudioContext;
    },
  };
}
