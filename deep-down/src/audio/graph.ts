import { createImpulseBuffer, createNoiseBank, type NoiseBank } from './buffers';
import type { BusName } from './sfx';
import type { SynthTarget } from './synth';

/**
 * Category bus: a dry input and a reverb-send input, both carrying the category volume so
 * the sliders scale the reverb tail too. One-shot voices feed both (through their own send
 * level); continuous noise beds stay dry, which lets the convolver idle in quiet moments.
 */
export interface Bus {
  input: GainNode;
  wet: GainNode;
}

/**
 *   music ─┐
 *   sfx ───┼──► mix ──► muffle ──► master ──► compressor ──► destination
 *   amb ───┘     ▲
 *   bus sends ──► convolver ──► reverb return
 */
export interface MixGraph {
  ctx: BaseAudioContext;
  noise: NoiseBank;
  buses: Record<BusName, Bus>;
  /** Lowpass on the whole mix, swept down briefly when the player is hurt. */
  muffle: BiquadFilterNode;
  master: GainNode;
  compressor: DynamicsCompressorNode;
  /** Reverb return level: grows with how open the space around the player is. */
  reverbReturn: GainNode;
}

export function createMixGraph(ctx: BaseAudioContext, destination: AudioNode, seed: number): MixGraph {
  const noise = createNoiseBank(ctx, seed);
  const mix = ctx.createGain();
  const muffle = ctx.createBiquadFilter();
  muffle.type = 'lowpass';
  muffle.frequency.value = 20000;
  muffle.Q.value = 0.5;
  const master = ctx.createGain();
  // Gentle limiter: transparent at normal levels, catches stacked hits before they clip.
  const compressor = ctx.createDynamicsCompressor();
  compressor.threshold.value = -6;
  compressor.knee.value = 6;
  compressor.ratio.value = 12;
  compressor.attack.value = 0.002;
  compressor.release.value = 0.2;
  mix.connect(muffle).connect(master).connect(compressor).connect(destination);

  const reverbIn = ctx.createGain();
  const convolver = ctx.createConvolver();
  convolver.buffer = createImpulseBuffer(ctx, seed);
  const reverbReturn = ctx.createGain();
  reverbReturn.gain.value = 0.6;
  reverbIn.connect(convolver).connect(reverbReturn).connect(mix);

  const bus = (): Bus => {
    const input = ctx.createGain();
    const wet = ctx.createGain();
    input.connect(mix);
    wet.connect(reverbIn);
    return { input, wet };
  };

  return { ctx, noise, buses: { music: bus(), sfx: bus(), ambience: bus() }, muffle, master, compressor, reverbReturn };
}

export function busTarget(graph: MixGraph, bus: BusName, rand: () => number): SynthTarget {
  const b = graph.buses[bus];
  return { ctx: graph.ctx, noise: graph.noise, out: b.input, wet: b.wet, rand };
}
