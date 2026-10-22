import type { NoiseBank } from './buffers';

/** Where one-shot sounds are built. Identical for realtime playback and offline rendering. */
export interface SynthTarget {
  ctx: BaseAudioContext;
  noise: NoiseBank;
  /** Dry input of the destination bus (post-volume). */
  out: AudioNode;
  /** Reverb send of the destination bus (post-volume), or null for a dry render. */
  wet: AudioNode | null;
  /** Random source in [0, 1) for per-hit variation. */
  rand: () => number;
}

export type NoiseColor = 'white' | 'pink' | 'brown';

/** Exponential ramps cannot reach zero; this is -80 dB. */
export const SILENT = 0.0001;

/**
 * One sounding event: a small graph of sources, filters and envelopes behind a single
 * output gain. It owns every node it creates and disconnects them all once its last
 * source has stopped, so finished sounds release their memory and CPU.
 */
export class Voice {
  readonly ctx: BaseAudioContext;
  /** Voice master gain; recipes connect their final stages here. */
  readonly out: GainNode;
  /** Latest scheduled stop time of any source, in context seconds. */
  end: number;
  private readonly nodes: AudioNode[] = [];
  private readonly sources: AudioScheduledSourceNode[] = [];
  private last: AudioScheduledSourceNode | null = null;
  private released = false;
  /** Transposition of every tone of the sound, in cents (oscillator detune; the LFOs stay put). */
  private readonly cents: number;

  constructor(
    private readonly target: SynthTarget,
    /** Start time of the sound in context seconds. */
    readonly t: number,
    opts: { gain?: number; wet?: number; pan?: number; transpose?: number } = {},
  ) {
    const ctx = (this.ctx = target.ctx);
    this.cents = Number.isFinite(opts.transpose) ? Math.max(-1200, Math.min(1200, (opts.transpose ?? 0) * 100)) : 0;
    this.end = t;
    this.out = ctx.createGain();
    this.out.gain.value = opts.gain ?? 1;
    let head: AudioNode = this.out;
    if (opts.pan && typeof ctx.createStereoPanner === 'function') {
      const p = ctx.createStereoPanner();
      p.pan.value = Math.max(-1, Math.min(1, opts.pan));
      head = head.connect(p);
      this.nodes.push(p);
    }
    head.connect(target.out);
    if (target.wet && opts.wet) {
      const send = ctx.createGain();
      send.gain.value = opts.wet;
      head.connect(send).connect(target.wet);
      this.nodes.push(send);
    }
  }

  /** Uniform random in [lo, hi). */
  rand(lo: number, hi: number): number {
    return lo + (hi - lo) * this.target.rand();
  }

  /** Random factor around 1 (e.g. vary(0.06) = +-6 %). */
  vary(amount: number): number {
    return 1 + (this.target.rand() * 2 - 1) * amount;
  }

  pick<T>(items: readonly T[]): T {
    return items[Math.floor(this.target.rand() * items.length)];
  }

  get noiseBank(): NoiseBank {
    return this.target.noise;
  }

  osc(type: OscillatorType, freq: number, start: number, stop: number): OscillatorNode {
    const o = this.rawOsc(type, freq, start, stop);
    if (this.cents !== 0) {
      // Transposed up, a tone never passes 0.45 of the sample rate (it would fold back or clamp).
      const room = 1200 * Math.log2((this.ctx.sampleRate * 0.45) / Math.max(1, Math.abs(freq)));
      o.detune.value = Math.min(this.cents, Math.max(0, room));
    }
    return o;
  }

  private rawOsc(type: OscillatorType, freq: number, start: number, stop: number): OscillatorNode {
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    this.schedule(o, start, stop);
    return o;
  }

  /** Noise of a given color from a random position in the shared buffer (looped if longer). */
  noise(color: NoiseColor, start: number, stop: number, rate = 1): AudioBufferSourceNode {
    const buf = this.target.noise[color];
    const needed = (stop - start) * rate;
    const span = Math.max(0, buf.duration - needed - 0.01);
    const src = this.buffer(buf, start, stop, rate, this.target.rand() * span);
    src.loop = needed > buf.duration - 0.01;
    return src;
  }

  /** One of the granular debris textures. `offset` skips the dense impact part. */
  crumble(start: number, stop: number, rate = 1, offset = 0): AudioBufferSourceNode {
    return this.buffer(this.pick(this.target.noise.crumble), start, stop, rate, offset);
  }

  buffer(buf: AudioBuffer, start: number, stop: number, rate = 1, offset = 0): AudioBufferSourceNode {
    const s = this.ctx.createBufferSource();
    s.buffer = buf;
    s.playbackRate.value = rate;
    this.nodes.push(s);
    s.start(start, Math.max(0, Math.min(offset, buf.duration - 0.001)));
    this.track(s, stop);
    return s;
  }

  filter(type: BiquadFilterType, freq: number, q = Math.SQRT1_2): BiquadFilterNode {
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = Math.min(freq, this.ctx.sampleRate * 0.45);
    f.Q.value = q;
    this.nodes.push(f);
    return f;
  }

  gain(value = 1): GainNode {
    const g = this.ctx.createGain();
    g.gain.value = value;
    this.nodes.push(g);
    return g;
  }

  /** Percussive envelope: linear attack to `peak`, exponential decay to silence. */
  perc(start: number, attack: number, peak: number, decay: number): GainNode {
    const g = this.gain(0);
    g.gain.setValueAtTime(SILENT, start);
    g.gain.linearRampToValueAtTime(peak, start + attack);
    g.gain.exponentialRampToValueAtTime(SILENT, start + attack + decay);
    return g;
  }

  /** Swell envelope: attack, hold, then exponential release. */
  swell(start: number, attack: number, peak: number, hold: number, release: number): GainNode {
    const g = this.gain(0);
    g.gain.setValueAtTime(SILENT, start);
    g.gain.linearRampToValueAtTime(peak, start + attack);
    g.gain.setValueAtTime(peak, start + attack + hold);
    g.gain.exponentialRampToValueAtTime(SILENT, start + attack + hold + release);
    return g;
  }

  /** Low-frequency oscillator wired into `param` with the given depth. */
  lfo(param: AudioParam, rate: number, depth: number, start: number, stop: number, type: OscillatorType = 'sine'): void {
    this.rawOsc(type, rate, start, stop).connect(this.gain(depth)).connect(param);
  }

  /** Done building: release every node once the last source has stopped. Returns the end time. */
  finish(): number {
    if (this.last) this.last.onended = () => this.release();
    else this.release();
    return this.end;
  }

  /** Fade out from `when` and stop everything (voice stealing, interrupted music). */
  kill(when: number, fade = 0.04): void {
    if (this.released) return;
    const g = this.out.gain;
    g.cancelScheduledValues(when);
    g.setValueAtTime(g.value, when);
    // Five time constants: the sources stop at -43 dB, below an audible click.
    g.setTargetAtTime(0, when, fade / 5);
    const stop = when + fade;
    for (const s of this.sources) {
      try {
        s.stop(stop);
      } catch {
        // Already stopped: nothing left to cut.
      }
    }
    this.end = Math.min(this.end, stop);
  }

  private schedule(src: AudioScheduledSourceNode, start: number, stop: number): void {
    this.nodes.push(src);
    src.start(start);
    this.track(src, stop);
  }

  private track(src: AudioScheduledSourceNode, stop: number): void {
    src.stop(stop);
    this.sources.push(src);
    if (stop >= this.end || !this.last) {
      this.end = Math.max(this.end, stop);
      this.last = src;
    }
  }

  private release(): void {
    if (this.released) return;
    this.released = true;
    for (const n of this.nodes) n.disconnect();
    this.out.disconnect();
    this.nodes.length = 0;
    this.sources.length = 0;
    this.last = null;
  }
}
