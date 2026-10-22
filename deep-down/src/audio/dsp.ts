import type { NoiseColor, Voice } from './synth';

/**
 * Building blocks for the round-3 sounds (AUDIO): the same recipes as sfx.ts's, shared by
 * actionSfx.ts and ambienceSfx.ts (a module of its own, so no sound file imports sfx.ts and the
 * registry never meets an import cycle).
 */

export type Bus = 'music' | 'sfx' | 'ambience';

export interface SoundParams {
  gain?: number;
  pan?: number;
  pitch?: number;
  intensity?: number;
  count?: number;
  material?: string;
  progress?: number;
  tier?: number;
}

export interface SoundDef {
  bus: Bus;
  gain: number;
  wet: number;
  /** Voice-stealing priority: 0 ambience, 1 incidental, 2 gameplay, 3 feedback, 4 story beats. */
  priority: number;
  length: number;
  minGap: number;
  build: (v: Voice, p: SoundParams) => void;
}

export const sound = (bus: Bus, gain: number, wet: number, priority: number, length: number, build: SoundDef['build'], minGap = 0.05): SoundDef => ({
  bus, gain, wet, priority, length, minGap, build,
});

/** Body impact: a sine (or other wave) with a fast downward pitch sweep. */
export function thump(v: Voice, t: number, f0: number, f1: number, peak: number, decay: number, type: OscillatorType = 'sine', dest: AudioNode = v.out): void {
  const o = v.osc(type, f0, t, t + decay + 0.04);
  o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + decay * 0.7);
  o.connect(v.perc(t, 0.002, peak, decay)).connect(dest);
}

/** A filtered noise burst. Returns the filter so callers can sweep it. */
export function burst(v: Voice, t: number, color: NoiseColor, type: BiquadFilterType, freq: number, q: number, peak: number, decay: number, attack = 0.001, dest: AudioNode = v.out): BiquadFilterNode {
  const f = v.filter(type, freq, q);
  v.noise(color, t, t + attack + decay + 0.03).connect(f).connect(v.perc(t, attack, peak, decay)).connect(dest);
  return f;
}

/** Filtered noise with a swell envelope (whooshes, hisses, breaths). Returns the filter. */
export function swell(v: Voice, t: number, color: NoiseColor, type: BiquadFilterType, freq: number, q: number, peak: number, attack: number, hold: number, release: number, dest: AudioNode = v.out): BiquadFilterNode {
  const f = v.filter(type, freq, q);
  v.noise(color, t, t + attack + hold + release + 0.05).connect(f).connect(v.swell(t, attack, peak, hold, release)).connect(dest);
  return f;
}

/** A slice of the granular debris texture through a filter (crunch, grit, scatter). */
export function grit(v: Voice, t: number, dur: number, type: BiquadFilterType, freq: number, q: number, peak: number, rate = 1, offset = 0, dest: AudioNode = v.out): void {
  const f = v.filter(type, freq, q);
  v.crumble(t, t + dur + 0.01, rate, offset).connect(f).connect(v.swell(t, 0.002, peak, dur * 0.35, dur * 0.65)).connect(dest);
}

/** A tone gliding from f0 to f1 (chirps, whistles, falling squeals). */
export function glide(v: Voice, t: number, type: OscillatorType, f0: number, f1: number, dur: number, peak: number, attack = 0.005, dest: AudioNode = v.out): OscillatorNode {
  const o = v.osc(type, f0, t, t + dur + 0.05);
  o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  o.connect(v.swell(t, attack, peak, dur * 0.3, dur * 0.7)).connect(dest);
  return o;
}

/** A struck bell: four near-harmonic partials. */
export function bell(v: Voice, t: number, f: number, amp: number, decay: number, dest: AudioNode = v.out): void {
  for (const [r, a, d] of [[1, 1, 1], [2.01, 0.4, 0.6], [3.03, 0.18, 0.4], [4.2, 0.08, 0.25]] as const) {
    if (f * r > v.ctx.sampleRate * 0.45) continue;
    v.osc('sine', f * r, t, t + decay * d + 0.05).connect(v.perc(t, 0.002, amp * a, decay * d)).connect(dest);
  }
}

/** Struck inharmonic partials (metal, glass, ice). */
export function partials(v: Voice, t: number, f: number, ratios: readonly number[], amps: readonly number[], decays: readonly number[], peak: number, dest: AudioNode = v.out): void {
  const nyq = v.ctx.sampleRate * 0.45;
  for (let i = 0; i < ratios.length; i++) {
    const fr = f * ratios[i] * v.vary(0.003);
    if (fr >= nyq) continue;
    const d = decays[i] * v.vary(0.08);
    v.osc('sine', fr, t, t + d + 0.05).connect(v.perc(t, 0.001, amps[i] * peak, d)).connect(dest);
  }
}

/** A short pleasant tone with a tiny upward glide (UI, rewards). */
export function blip(v: Voice, t: number, freq: number, amp: number, decay: number, dest: AudioNode = v.out): void {
  const o = v.osc('sine', freq * 0.97, t, t + decay + 0.05);
  o.frequency.setValueAtTime(freq * 0.97, t);
  o.frequency.exponentialRampToValueAtTime(freq, t + 0.012);
  o.connect(v.perc(t, 0.003, amp, decay)).connect(dest);
  v.osc('triangle', freq * 2, t, t + decay * 0.6 + 0.05).connect(v.perc(t, 0.002, amp * 0.15, decay * 0.6)).connect(dest);
}

/** A soft chord under one swell (stingers, rewards), through a lowpass. */
export function chord(v: Voice, t: number, freqs: readonly number[], type: OscillatorType, level: number, cutoff: number, attack: number, hold: number, release: number, dest: AudioNode = v.out): BiquadFilterNode {
  const lp = v.filter('lowpass', cutoff, 0);
  const mix = v.gain(level);
  mix.connect(lp).connect(v.swell(t, attack, 1, hold, release)).connect(dest);
  const stop = t + attack + hold + release + 0.05;
  for (const f of freqs) v.osc(type, f * v.vary(0.002), t, stop).connect(mix);
  return lp;
}

/** Coins: a few small bright bells, scattered. */
export function coins(v: Voice, t: number, n: number, amp: number): void {
  for (let k = 0; k < n; k++) {
    const at = t + k * v.rand(0.04, 0.08);
    partials(v, at, 2600 * v.vary(0.08), [1, 1.48, 2.36], [1, 0.5, 0.25], [0.18, 0.12, 0.08], amp);
  }
}

/** Equal temperament from A4 (semitones). */
export const st = (n: number): number => 440 * Math.pow(2, n / 12);
