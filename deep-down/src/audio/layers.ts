import type { NoiseBank } from './buffers';

// Continuous loops: the lantern flame, the campfire, the cave bed and the crystal hum.
// Levels are pushed at control rate by AudioSystem; each layer only exists while audible.

/** Pushes a value to an AudioParam only when it moved noticeably, keeping the automation timeline short. */
export class ParamTarget {
  private last = Number.NaN;

  constructor(
    private readonly param: AudioParam,
    private readonly timeConstant: number,
    private readonly epsilon: number,
  ) {}

  set(value: number, now: number): void {
    // AudioParams throw on non-finite values; a bad frame of world state just keeps the last level.
    if (!Number.isFinite(value) || Math.abs(value - this.last) < this.epsilon) return;
    this.last = value;
    this.param.setTargetAtTime(value, now, this.timeConstant);
  }
}

/** Optional reverb send of a layer. */
export interface LayerSend {
  to: AudioNode;
  amount: number;
}

/** Tracks the nodes of one running loop so it can be torn down completely. */
export class LoopGraph {
  readonly out: GainNode;
  /** The stereo position of a positional layer (null: centred, no panner). */
  readonly panner: StereoPannerNode | null = null;
  /** A positional layer's lowpass: closes when rock stands between the ear and the source. */
  readonly muffle: BiquadFilterNode | null = null;
  private readonly nodes: AudioNode[] = [];
  private readonly sources: AudioScheduledSourceNode[] = [];

  constructor(readonly ctx: BaseAudioContext, dest: AudioNode, send: LayerSend | null, pan = false) {
    this.out = ctx.createGain();
    this.out.gain.value = 0;
    let head: AudioNode = this.out;
    if (pan) {
      const m = ctx.createBiquadFilter();
      m.type = 'lowpass';
      m.frequency.value = OPEN_CUTOFF;
      m.Q.value = 0;
      this.muffle = m;
      this.nodes.push(m);
      head = head.connect(m);
    }
    if (pan && typeof ctx.createStereoPanner === 'function') {
      this.panner = ctx.createStereoPanner();
      this.nodes.push(this.panner);
      head = head.connect(this.panner);
    }
    head.connect(dest);
    if (send) head.connect(this.gain(send.amount)).connect(send.to);
  }

  /** A looping buffer of the noise bank (an alias kept short for the beds). */
  buffer(buffer: AudioBuffer, rate = 1): AudioBufferSourceNode {
    return this.loop(buffer, rate);
  }

  loop(buffer: AudioBuffer, rate = 1): AudioBufferSourceNode {
    const s = this.ctx.createBufferSource();
    s.buffer = buffer;
    s.loop = true;
    s.playbackRate.value = rate;
    // Start each loop at a different point so layers sharing a buffer never phase together.
    s.start(this.ctx.currentTime, Math.random() * buffer.duration);
    this.sources.push(s);
    this.nodes.push(s);
    return s;
  }

  osc(type: OscillatorType, freq: number): OscillatorNode {
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    o.start(this.ctx.currentTime);
    this.sources.push(o);
    this.nodes.push(o);
    return o;
  }

  filter(type: BiquadFilterType, freq: number, q = Math.SQRT1_2): BiquadFilterNode {
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    this.nodes.push(f);
    return f;
  }

  gain(value: number): GainNode {
    const g = this.ctx.createGain();
    g.gain.value = value;
    this.nodes.push(g);
    return g;
  }

  lfo(param: AudioParam, rate: number, depth: number, type: OscillatorType = 'sine'): void {
    const o = this.osc('sine', rate);
    o.type = type;
    o.connect(this.gain(depth)).connect(param);
  }

  dispose(): void {
    const t = this.ctx.currentTime;
    for (const s of this.sources) s.stop(t + 0.05);
    for (const n of this.nodes) n.disconnect();
    this.out.disconnect();
  }
}

/** Seconds a layer stays built after going silent, so brief dips do not rebuild it. */
const LINGER = 2.5;
/** A positional layer's lowpass in the open, and behind rock (audio/probe occlusionOf). */
export const OPEN_CUTOFF = 16000;
export const MUFFLED_CUTOFF = 650;

/**
 * A looping layer that is built when its level rises above silence and torn down after a
 * few quiet seconds, so layers the player cannot hear cost no CPU.
 */
export abstract class LazyLayer {
  private graph: LoopGraph | null = null;
  private level: ParamTarget | null = null;
  private panTarget: ParamTarget | null = null;
  private muffleTarget: ParamTarget | null = null;
  private quiet = 0;

  constructor(
    protected readonly ctx: BaseAudioContext,
    protected readonly noise: NoiseBank,
    private readonly dest: AudioNode,
    private readonly fade = 0.25,
    private readonly send: LayerSend | null = null,
    private readonly positional = false,
  ) {}

  protected abstract build(g: LoopGraph): void;

  /** Drop references to nodes of the torn-down graph. */
  protected onTeardown(): void {}

  /** Built and sounding (diagnostics, tests). */
  get live(): boolean {
    return this.graph !== null;
  }

  setLevel(level: number, now: number, dt: number): void {
    if (level > 0.0005) {
      this.quiet = 0;
      if (!this.graph) {
        this.graph = new LoopGraph(this.ctx, this.dest, this.send, this.positional);
        this.level = new ParamTarget(this.graph.out.gain, this.fade, 0.0005);
        if (this.graph.panner) this.panTarget = new ParamTarget(this.graph.panner.pan, 0.15, 0.02);
        if (this.graph.muffle) this.muffleTarget = new ParamTarget(this.graph.muffle.frequency, 0.35, 25);
        this.build(this.graph);
      }
      this.level!.set(level, now);
    } else if (this.graph) {
      this.level!.set(0, now);
      this.quiet += dt;
      if (this.quiet > LINGER) this.stop();
    }
  }

  /** Stereo position of a positional layer (-1..1). */
  setPan(pan: number, now: number): void {
    this.panTarget?.set(Math.max(-1, Math.min(1, pan)), now);
  }

  /** How muffled a positional layer is: 0 in the open, 1 behind solid rock (its lowpass closes). */
  setOcclusion(occlusion: number, now: number): void {
    const o = Number.isFinite(occlusion) ? Math.max(0, Math.min(1, occlusion)) : 0;
    // Exponential between the two cutoffs: each step of rock darkens it by a similar ratio.
    this.muffleTarget?.set(OPEN_CUTOFF * Math.pow(MUFFLED_CUTOFF / OPEN_CUTOFF, o), now);
  }

  stop(): void {
    if (!this.graph) return;
    this.graph.dispose();
    this.graph = null;
    this.level = null;
    this.panTarget = null;
    this.muffleTarget = null;
    this.onTeardown();
  }
}

/** Lantern flame: crackle impulses over a soft breathy bed, with a flutter gain for sputtering. */
export class LanternLoop extends LazyLayer {
  private flutter: ParamTarget | null = null;

  protected build(g: LoopGraph): void {
    const flutter = g.gain(1);
    flutter.connect(g.out);
    g.loop(this.noise.crackle).connect(g.filter('highpass', 700)).connect(g.gain(0.55)).connect(flutter);
    g.loop(this.noise.pink).connect(g.filter('bandpass', 520, 0.8)).connect(g.gain(0.3)).connect(flutter);
    this.flutter = new ParamTarget(flutter.gain, 0.015, 0.01);
  }

  protected override onTeardown(): void {
    this.flutter = null;
  }

  /** Momentary flame strength (1 = steady); driven irregularly while fuel runs low. */
  flicker(value: number, now: number): void {
    this.flutter?.set(value, now);
  }
}

/** Campfire: bigger, lower crackles, a breathing low roar and a little hiss. */
export class CampfireLoop extends LazyLayer {
  protected build(g: LoopGraph): void {
    g.loop(this.noise.crackle, 0.72).connect(g.filter('lowpass', 3500)).connect(g.gain(0.7)).connect(g.out);
    const roar = g.gain(0.6);
    g.loop(this.noise.brown).connect(g.filter('lowpass', 350)).connect(roar).connect(g.out);
    g.lfo(roar.gain, 0.3, 0.2);
    g.loop(this.noise.pink).connect(g.filter('bandpass', 1100, 0.7)).connect(g.gain(0.12)).connect(g.out);
  }
}

/** Soft high sine cluster with slow beating and shimmer, near crystal formations. */
export class CrystalHum extends LazyLayer {
  protected build(g: LoopGraph): void {
    const shimmer = g.gain(0.8);
    shimmer.connect(g.out);
    g.lfo(shimmer.gain, 0.23, 0.25);
    const partials: Array<[number, number]> = [[1318.51, 0.25], [1320.9, 0.2], [1975.53, 0.15], [2637.02, 0.08]];
    for (const [f, a] of partials) g.osc('sine', f).connect(g.gain(a)).connect(shimmer);
  }
}

/**
 * The cave itself: a low drone (lowpassed brown noise breathing on a slow LFO), an "air"
 * band that grows in big chambers, and a sub tone that rises with depth. Darker deeper.
 */
export class CaveBed extends LazyLayer {
  private cutoff: ParamTarget | null = null;
  private air: ParamTarget | null = null;
  private sub: ParamTarget | null = null;

  protected build(g: LoopGraph): void {
    const lp = g.filter('lowpass', 300, 0.7);
    const drone = g.gain(0.5);
    g.loop(this.noise.brown).connect(lp).connect(drone).connect(g.out);
    g.lfo(drone.gain, 0.06, 0.18);

    const band = g.filter('bandpass', 520, 1.6);
    const air = g.gain(0);
    g.loop(this.noise.pink).connect(band).connect(air).connect(g.out);
    g.lfo(band.frequency, 0.045, 140);

    const sub = g.gain(0);
    sub.connect(g.out);
    g.osc('sine', 55).connect(sub);
    g.osc('sine', 55.4).connect(sub);

    this.cutoff = new ParamTarget(lp.frequency, 0.8, 2);
    this.air = new ParamTarget(air.gain, 0.6, 0.002);
    this.sub = new ParamTarget(sub.gain, 0.8, 0.002);
  }

  protected override onTeardown(): void {
    this.cutoff = this.air = this.sub = null;
  }

  shape(cutoffHz: number, air: number, sub: number, now: number): void {
    this.cutoff?.set(cutoffHz, now);
    this.air?.set(air, now);
    this.sub?.set(sub, now);
  }
}
