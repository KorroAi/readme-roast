import { createImpulseBuffer, createNoiseBank, type NoiseBank } from './buffers';
import type { BusName } from './sfx';
import type { SynthTarget } from './synth';

/**
 * Category bus: a dry input and a reverb-send input, both carrying the category volume so
 * the sliders scale the reverb tail too. One-shot voices feed both (through their own send
 * level); continuous noise beds stay dry, which lets the convolver idle in quiet moments.
 * After the volume, each bus is high-passed (a phone cannot play the lowest octave; it would only
 * eat the limiter's headroom) and goes through its duck gain (mixer.ts: important cues step the
 * score and the beds back).
 */
export interface Bus {
  input: GainNode;
  wet: GainNode;
  /** Ducking (1 = none), on the dry path and on the reverb send. */
  duck: GainNode;
  duckWet: GainNode;
}

/**
 *   music ─► hp ─► shelf ─► duck ─┐
 *   sfx ───► hp ─────────► duck ──┼──► mix ──► muffle ──► master ──► compressor ──► clipper ──► destination
 *   amb ───► hp ─► shelf ─► duck ─┘     ▲
 *   bus sends ──► duck ──► convolver ──► reverb return
 */
export interface MixGraph {
  ctx: BaseAudioContext;
  noise: NoiseBank;
  buses: Record<BusName, Bus>;
  /** Lowpass on the whole mix, swept down briefly when the player is hurt. */
  muffle: BiquadFilterNode;
  master: GainNode;
  compressor: DynamicsCompressorNode;
  /** A soft clipper after the limiter: transparent below 0.85, never past full scale. */
  clipper: WaveShaperNode | null;
  /** The last node before the destination (the meter taps it). */
  output: AudioNode;
  /** Reverb return level: grows with how open the space around the player is. */
  reverbReturn: GainNode;
}

/** The soft clipper's curve: linear to 0.85, then a tanh knee that never passes 1. */
export function clipperCurve(n = 2048): Float32Array<ArrayBuffer> {
  const curve = new Float32Array(n);
  const knee = 0.85;
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    const a = Math.abs(x);
    const y = a <= knee ? a : knee + (1 - knee) * Math.tanh((a - knee) / (1 - knee));
    curve[i] = Math.sign(x) * y;
  }
  return curve;
}

export function createMixGraph(ctx: BaseAudioContext, destination: AudioNode, seed: number): MixGraph {
  const noise = createNoiseBank(ctx, seed);
  const mix = ctx.createGain();
  const muffle = ctx.createBiquadFilter();
  muffle.type = 'lowpass';
  // Open (the hit's muffle closes it): 20 kHz, or as high as the context's rate allows.
  muffle.frequency.value = Math.min(20000, ctx.sampleRate * 0.45);
  muffle.Q.value = 0.5;
  const master = ctx.createGain();
  // Limiter: transparent at normal levels, catches stacked hits before they clip.
  const compressor = ctx.createDynamicsCompressor();
  compressor.threshold.value = -6;
  compressor.knee.value = 6;
  compressor.ratio.value = 12;
  compressor.attack.value = 0.002;
  compressor.release.value = 0.2;
  let clipper: WaveShaperNode | null = null;
  let output: AudioNode = compressor;
  if (typeof ctx.createWaveShaper === 'function') {
    clipper = ctx.createWaveShaper();
    clipper.curve = clipperCurve();
    clipper.oversample = 'none';
    output = clipper;
  }
  mix.connect(muffle).connect(master).connect(compressor);
  if (clipper) compressor.connect(clipper).connect(destination);
  else compressor.connect(destination);

  const reverbIn = ctx.createGain();
  const convolver = ctx.createConvolver();
  convolver.buffer = createImpulseBuffer(ctx, seed);
  const reverbReturn = ctx.createGain();
  reverbReturn.gain.value = 0.6;
  reverbIn.connect(convolver).connect(reverbReturn).connect(mix);

  // The score below 55 Hz (and a gentle shelf under 160 Hz), the beds below 60 Hz, the effects
  // below 40 Hz: headphones keep the warmth above those.
  const bus = (hp: number, shelf: number): Bus => {
    const input = ctx.createGain();
    const wet = ctx.createGain();
    const duck = ctx.createGain();
    const duckWet = ctx.createGain();
    const high = ctx.createBiquadFilter();
    high.type = 'highpass';
    high.frequency.value = hp;
    high.Q.value = -3.01;
    let head: AudioNode = input.connect(high);
    if (shelf !== 0) {
      const low = ctx.createBiquadFilter();
      low.type = 'lowshelf';
      low.frequency.value = 160;
      low.gain.value = shelf;
      head = head.connect(low);
    }
    head.connect(duck).connect(mix);
    wet.connect(duckWet).connect(reverbIn);
    return { input, wet, duck, duckWet };
  };

  return { ctx, noise, buses: { music: bus(55, -3), sfx: bus(40, 0), ambience: bus(60, -2) }, muffle, master, compressor, clipper, output, reverbReturn };
}

export function busTarget(graph: MixGraph, bus: BusName, rand: () => number): SynthTarget {
  const b = graph.buses[bus];
  return { ctx: graph.ctx, noise: graph.noise, out: b.input, wet: b.wet, rand };
}
