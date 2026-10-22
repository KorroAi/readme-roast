import type { SoundKind } from '../config/blocks';
import { saturate } from '../core/math';
import type { MusicNote } from './MusicScheduler';
import { Voice, type NoiseColor, type SynthTarget } from './synth';
import { midiToHz } from './theory';
import { EVENT_SFX } from './eventSfx';
import { MOB_SFX } from './mobSfx';
import { LOOP_SFX } from './loopSfx';

// Every one-shot sound in the game, synthesized from oscillators, the shared noise buffers
// and envelopes. Recipes only talk to a Voice, so the same code plays live through the mix
// graph or renders into an OfflineAudioContext for tests.

export type StepKind = 'stone' | 'soil' | 'wood' | 'ancient';
export type BusName = 'music' | 'sfx' | 'ambience';

/** Reverb send every voice of a category gets on top of its own (music sits further back). */
const BASE_SEND: Record<BusName, number> = { music: 0.35, sfx: 0.12, ambience: 0.3 };

export interface SfxParams {
  /** Mining progress in [0, 1]: hits get slightly higher and brighter as the block weakens. */
  progress?: number;
  /** Generic strength in [0, 1] (landing speed, walking pace, damage). */
  intensity?: number;
  /** How many things are involved (banked items). */
  count?: number;
  /** Stereo position in [-1, 1]. */
  pan?: number;
  /** Gain multiplier on top of the sound's own level. */
  gain?: number;
  /** Pitch multiplier (drips get lower in the depths). */
  pitch?: number;
  /** Pickaxe tier (heavier tools swing a little higher). */
  tier?: number;
  /** Surface under the player for landings. */
  material?: StepKind;
}

interface SfxDef {
  bus: BusName;
  /** Voice output level. */
  gain: number;
  /** Reverb send amount on top of the category's BASE_SEND. */
  wet: number;
  /** Voice-stealing priority: 0 ambience, 1 incidental, 2 gameplay, 3 feedback, 4 story beats. */
  priority: number;
  /** Upper bound of the dry sound's length in seconds (offline render length). */
  length: number;
  /** Minimum spacing between two plays of this sound. */
  minGap: number;
  build: (v: Voice, p: SfxParams) => void;
}

// ---------------------------------------------------------------------------------------
// Building blocks

/** Body impact: a sine (or other wave) with a fast downward pitch sweep. */
function thump(v: Voice, t: number, f0: number, f1: number, peak: number, decay: number, type: OscillatorType = 'sine', dest: AudioNode = v.out): void {
  const o = v.osc(type, f0, t, t + decay + 0.03);
  o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(f1, t + decay * 0.7);
  o.connect(v.perc(t, 0.002, peak, decay)).connect(dest);
}

/** Filtered noise burst. Returns the filter so callers can sweep it. */
function burst(
  v: Voice, t: number, color: NoiseColor, type: BiquadFilterType, freq: number, q: number,
  peak: number, decay: number, attack = 0.001, dest: AudioNode = v.out,
): BiquadFilterNode {
  const f = v.filter(type, freq, q);
  v.noise(color, t, t + attack + decay + 0.02).connect(f).connect(v.perc(t, attack, peak, decay)).connect(dest);
  return f;
}

/** A slice of the granular debris texture through a filter. */
function grains(
  v: Voice, t: number, dur: number, type: BiquadFilterType, freq: number, q: number, peak: number,
  rate = 1, offset = 0, dest: AudioNode = v.out,
): void {
  const f = v.filter(type, freq, q);
  v.crumble(t, t + dur + 0.01, rate, offset).connect(f).connect(v.swell(t, 0.002, peak, dur * 0.35, dur * 0.65)).connect(dest);
}

interface Partials {
  ratios: readonly number[];
  amps: readonly number[];
  decays: readonly number[];
}

// Inharmonic partial sets. Metal follows a free bar's mode ratios (clink), the clang is
// lower and denser, crystal is near-harmonic and high (glassy).
const METAL: Partials = { ratios: [1, 2.32, 4.25, 6.63], amps: [0.28, 0.22, 0.15, 0.09], decays: [0.55, 0.35, 0.22, 0.14] };
const CLANG: Partials = { ratios: [1, 2.41, 3.88, 5.2], amps: [0.34, 0.2, 0.1, 0.05], decays: [0.32, 0.2, 0.12, 0.08] };
const ANVIL: Partials = { ratios: [1, 2.76, 5.4, 8.93], amps: [0.32, 0.2, 0.09, 0.04], decays: [1.0, 0.55, 0.25, 0.12] };
const CRYSTAL: Partials = { ratios: [1, 1.5, 2.01, 2.99, 4.03], amps: [0.26, 0.1, 0.16, 0.09, 0.05], decays: [0.9, 0.6, 0.5, 0.32, 0.2] };
const TINK: Partials = { ratios: [1, 2.76], amps: [0.16, 0.06], decays: [0.22, 0.08] };

/** Struck resonator: sine partials, each with its own decay. `bend` glides pitch (deflect). */
function ring(v: Voice, t: number, base: number, p: Partials, gain = 1, dest: AudioNode = v.out, bend = 1): void {
  const nyquist = v.ctx.sampleRate * 0.45;
  for (let i = 0; i < p.ratios.length; i++) {
    const f = base * p.ratios[i] * v.vary(0.004);
    if (f >= nyquist) continue;
    const d = p.decays[i] * v.vary(0.1);
    const o = v.osc('sine', f, t, t + d + 0.05);
    if (bend !== 1) {
      o.frequency.setValueAtTime(f, t);
      o.frequency.exponentialRampToValueAtTime(f * bend, t + d);
    }
    o.connect(v.perc(t, 0.001, p.amps[i] * gain, d)).connect(dest);
  }
}

/** Short pleasant tone with a tiny upward glide (UI and pickups). */
function blip(v: Voice, t: number, freq: number, amp: number, decay: number, dest: AudioNode = v.out): void {
  const o = v.osc('sine', freq * 0.97, t, t + decay + 0.05);
  o.frequency.setValueAtTime(freq * 0.97, t);
  o.frequency.exponentialRampToValueAtTime(freq, t + 0.012);
  o.connect(v.perc(t, 0.003, amp, decay)).connect(dest);
  const h = v.osc('triangle', freq * 2, t, t + decay * 0.6 + 0.05);
  h.connect(v.perc(t, 0.002, amp * 0.15, decay * 0.6)).connect(dest);
}

/** Kalimba-like pluck: sine fundamental, a brief high tine overtone, a soft body partial. */
function pluck(v: Voice, t: number, freq: number, amp: number, decay: number, dest: AudioNode = v.out): void {
  v.osc('sine', freq, t, t + decay + 0.05).connect(v.perc(t, 0.003, amp, decay)).connect(dest);
  if (freq * 5.95 < v.ctx.sampleRate * 0.45) {
    v.osc('sine', freq * 5.95, t, t + 0.12).connect(v.perc(t, 0.001, amp * 0.2, 0.07)).connect(dest);
  }
  v.osc('triangle', freq * 2, t, t + 0.35).connect(v.perc(t, 0.002, amp * 0.14, 0.25)).connect(dest);
}

/** Irregular little pops (lantern sputter). */
function pops(v: Voice, t: number, n: number, spread: readonly [number, number], lo: number, hi: number): void {
  let at = t;
  for (let k = 0; k < n; k++) {
    at += v.rand(spread[0], spread[1]);
    burst(v, at, 'white', 'bandpass', v.rand(lo, hi), 1, v.rand(0.25, 0.5), v.rand(0.015, 0.045));
  }
}

/** Swept band of pink noise: whooshes, ignitions, the extinguish "fwip". */
function sweep(v: Voice, t: number, from: number, to: number, sweepTime: number, q: number, attack: number, peak: number, release: number): void {
  const f = v.filter('bandpass', from, q);
  f.frequency.setValueAtTime(from, t);
  f.frequency.exponentialRampToValueAtTime(to, t + sweepTime);
  v.noise('pink', t, t + attack + release + 0.05).connect(f).connect(v.swell(t, attack, peak, 0.02, release)).connect(v.out);
}

/** Soft chord through a lowpass with one shared swell envelope. */
function padChord(v: Voice, t: number, freqs: readonly number[], type: OscillatorType, level: number, cutoff: number, attack: number, hold: number, release: number): BiquadFilterNode {
  const lp = v.filter('lowpass', cutoff, 0.7);
  const mix = v.gain(level);
  mix.connect(lp).connect(v.swell(t, attack, 1, hold, release)).connect(v.out);
  const stop = t + attack + hold + release + 0.05;
  for (const f of freqs) v.osc(type, f * v.vary(0.002), t, stop).connect(mix);
  return lp;
}

/** Variation shared by mining hits. */
function hitShape(v: Voice, p: SfxParams): { pitch: number; bright: number; pr: number } {
  const pr = saturate(p.progress ?? 0);
  return { pitch: v.vary(0.06) * (1 + 0.12 * pr), bright: v.vary(0.15) * (1 + 0.45 * pr), pr };
}

// ---------------------------------------------------------------------------------------
// Recipes by material

const HIT: Record<SoundKind, (v: Voice, p: SfxParams) => void> = {
  // Punchy low thump + gritty filtered noise.
  stone(v, p) {
    const { pitch, bright } = hitShape(v, p);
    const t = v.t;
    thump(v, t, 150 * pitch, 52 * pitch, 0.85, 0.16);
    burst(v, t, 'white', 'bandpass', 700 * bright, 1.1, 0.55, 0.09);
    burst(v, t, 'pink', 'bandpass', 1800 * bright, 1.4, 0.12, 0.01);
    grains(v, t + 0.004, 0.16, 'bandpass', 1100 * bright, 1.6, 0.32, v.vary(0.1));
  },
  // Stone thump under bright inharmonic ringing: a clink.
  metal(v, p) {
    const { pitch, bright, pr } = hitShape(v, p);
    const t = v.t;
    const base = 1300 * pitch * (1 + 0.06 * pr);
    thump(v, t, 140 * pitch, 60 * pitch, 0.45, 0.12);
    burst(v, t, 'white', 'bandpass', 2600 * bright, 1.2, 0.25, 0.05);
    ring(v, t, base, METAL);
    // A slightly detuned twin of the fundamental beats against it like a real ore vein.
    v.osc('sine', base * 1.0035, t, t + 0.5).connect(v.perc(t, 0.001, 0.12, 0.45)).connect(v.out);
  },
  // Glassy high partials with a tremolo shimmer and a short sparkle.
  crystal(v, p) {
    const { pitch, pr } = hitShape(v, p);
    const t = v.t;
    thump(v, t, 230 * pitch, 130 * pitch, 0.22, 0.05);
    const shimmer = v.gain(1);
    shimmer.connect(v.out);
    v.lfo(shimmer.gain, v.rand(6, 9), 0.35, t, t + 1.1);
    ring(v, t, 2300 * pitch * (1 + 0.08 * pr), CRYSTAL, 1, shimmer);
    burst(v, t, 'white', 'highpass', 6500, 0.7, 0.16, 0.04);
    for (let k = 0; k < 3; k++) {
      const at = t + v.rand(0.01, 0.12);
      v.osc('sine', v.rand(5000, 8500), at, at + 0.1).connect(v.perc(at, 0.001, 0.05, 0.07)).connect(v.out);
    }
  },
  // Hollow knock: two body modes and a resonant band of noise.
  wood(v, p) {
    const { pitch, bright } = hitShape(v, p);
    const t = v.t;
    thump(v, t, 215 * pitch, 150 * pitch, 0.55, 0.09, 'triangle');
    v.osc('sine', 440 * pitch, t, t + 0.1).connect(v.perc(t, 0.001, 0.22, 0.06)).connect(v.out);
    burst(v, t, 'white', 'bandpass', 820 * bright, 5, 0.5, 0.05);
    burst(v, t, 'white', 'highpass', 2600 * bright, 0.7, 0.12, 0.012);
  },
  // Soft dull crunch.
  soil(v, p) {
    const { pitch, bright } = hitShape(v, p);
    const t = v.t;
    thump(v, t, 95 * pitch, 50 * pitch, 0.45, 0.12);
    grains(v, t, 0.2, 'lowpass', 900 * bright, 0.8, 0.6, v.rand(0.7, 0.9));
    burst(v, t, 'pink', 'lowpass', 520 * bright, 0.7, 0.35, 0.09);
  },
  // Dense stone tock with a faint resonant hum: the old builders' stone answers back.
  ancient(v, p) {
    const { pitch, bright } = hitShape(v, p);
    const t = v.t;
    thump(v, t, 240 * pitch, 95 * pitch, 0.75, 0.1);
    burst(v, t, 'white', 'bandpass', 1900 * bright, 2.2, 0.42, 0.05);
    burst(v, t, 'white', 'highpass', 4200, 0.7, 0.14, 0.012);
    hum(v, t, 0.06);
  },
};

function hum(v: Voice, t: number, level: number): void {
  v.osc('sine', 196, t, t + 1.5).connect(v.swell(t, 0.03, level, 0.1, 1.25)).connect(v.out);
  v.osc('sine', 294.3, t, t + 1.5).connect(v.swell(t, 0.03, level * 0.6, 0.1, 1.25)).connect(v.out);
}

function collapse(v: Voice, t: number, band: number): void {
  thump(v, t, 115 * v.vary(0.06), 42, 0.8, 0.22);
  grains(v, t, 0.6, 'bandpass', band * v.vary(0.15), 0.8, 0.75, v.rand(0.85, 1.1));
  grains(v, t + 0.02, 0.5, 'lowpass', 480, 0.7, 0.6, v.rand(0.6, 0.75));
  burst(v, t, 'brown', 'lowpass', 300, 0.7, 0.45, 0.35);
}

const BREAK: Record<SoundKind, (v: Voice) => void> = {
  stone(v) {
    collapse(v, v.t, 1300);
  },
  metal(v) {
    collapse(v, v.t, 1400);
    ring(v, v.t + 0.03, 1500 * v.vary(0.05), METAL, 0.45);
    ring(v, v.t + 0.17, 1900 * v.vary(0.05), METAL, 0.25);
  },
  // Shatter chime: a bright splash and glassy pings scattered over a few hundred ms.
  crystal(v) {
    const t = v.t;
    burst(v, t, 'white', 'highpass', 3800, 0.7, 0.45, 0.12);
    grains(v, t, 0.5, 'highpass', 3000, 0.7, 0.4, v.rand(1.3, 1.6));
    thump(v, t, 260, 140, 0.25, 0.06);
    const base = 1760 * v.vary(0.03);
    for (let k = 0; k < 7; k++) {
      const at = t + v.rand(0, 0.38);
      const f = base * Math.pow(2, v.pick([0, 3, 5, 7, 10, 12, 15]) / 12);
      const d = v.rand(0.35, 0.9);
      v.osc('sine', f, at, at + d + 0.05).connect(v.perc(at, 0.001, v.rand(0.08, 0.16), d)).connect(v.out);
      v.osc('sine', f * 2.01, at, at + d * 0.4 + 0.05).connect(v.perc(at, 0.001, 0.03, d * 0.4)).connect(v.out);
    }
  },
  wood(v) {
    const t = v.t;
    thump(v, t, 160, 90, 0.6, 0.14, 'triangle');
    grains(v, t, 0.45, 'bandpass', 900, 2, 0.6, 0.8);
    burst(v, t, 'white', 'bandpass', 500, 3, 0.4, 0.12);
  },
  soil(v) {
    const t = v.t;
    thump(v, t, 80, 38, 0.6, 0.16);
    grains(v, t, 0.55, 'lowpass', 800, 0.8, 0.8, 0.72);
    burst(v, t, 'brown', 'lowpass', 260, 0.7, 0.5, 0.3);
  },
  ancient(v) {
    const t = v.t;
    thump(v, t, 160, 55, 0.85, 0.25);
    grains(v, t, 0.6, 'bandpass', 1700, 1.2, 0.7, v.rand(0.9, 1.05));
    grains(v, t + 0.02, 0.5, 'lowpass', 520, 0.7, 0.55, 0.7);
    hum(v, t, 0.09);
  },
};

const STEP: Record<StepKind, (v: Voice, t: number) => void> = {
  stone(v, t) {
    const k = v.vary(0.1);
    burst(v, t, 'white', 'lowpass', 1400 * v.vary(0.2), 0.8, 0.3, 0.045);
    thump(v, t, 95 * k, 60 * k, 0.22, 0.05);
    grains(v, t, 0.06, 'bandpass', 2600 * v.vary(0.2), 1.2, 0.12, 1, v.rand(0, 0.3));
  },
  soil(v, t) {
    const k = v.vary(0.1);
    grains(v, t, 0.12, 'lowpass', 750 * v.vary(0.2), 0.8, 0.4, v.rand(0.6, 0.85), v.rand(0, 0.25));
    thump(v, t, 70 * k, 45 * k, 0.18, 0.06);
  },
  wood(v, t) {
    const k = v.vary(0.08);
    thump(v, t, 185 * k, 150 * k, 0.3, 0.07, 'triangle');
    burst(v, t, 'white', 'bandpass', 620 * v.vary(0.1), 4, 0.25, 0.04);
  },
  ancient(v, t) {
    const k = v.vary(0.08);
    burst(v, t, 'white', 'bandpass', 1800 * v.vary(0.15), 1.5, 0.28, 0.035);
    thump(v, t, 125 * k, 80 * k, 0.24, 0.05);
  },
};

const D_MAJOR_ADD9 = [293.66, 369.99, 440, 659.25];

// ---------------------------------------------------------------------------------------
// Registry

const def = (bus: BusName, gain: number, wet: number, priority: number, length: number, build: SfxDef['build'], minGap = 0.025): SfxDef => ({
  bus, gain, wet, priority, length, minGap, build,
});

const hit = (kind: SoundKind, length: number, wet: number) => def('sfx', 0.75, wet, 2, length, HIT[kind], 0.04);
const brk = (kind: SoundKind, length: number, wet: number) => def('sfx', 0.8, wet, 2, length, BREAK[kind], 0.04);
const step = (kind: StepKind) => def('sfx', 0.45, 0.08, 1, 0.2, (v) => STEP[kind](v, v.t), 0.06);
const pickup = (freqs: readonly number[], spacing: number, amp: number, decay: number, sparkle: number) => (v: Voice) => {
  freqs.forEach((f, i) => blip(v, v.t + i * spacing, f * v.vary(0.005), amp, decay));
  if (sparkle > 0) burst(v, v.t + 0.02, 'white', 'highpass', 7000, 0.7, sparkle, 0.08 + freqs.length * 0.03);
};

export const SFX = {
  'hit.stone': hit('stone', 0.4, 0.15),
  'hit.metal': hit('metal', 0.9, 0.2),
  'hit.crystal': hit('crystal', 1.2, 0.4),
  'hit.wood': hit('wood', 0.3, 0.12),
  'hit.soil': hit('soil', 0.35, 0.1),
  'hit.ancient': hit('ancient', 1.6, 0.35),
  'break.stone': brk('stone', 0.9, 0.25),
  'break.metal': brk('metal', 1.2, 0.3),
  'break.crystal': brk('crystal', 1.4, 0.55),
  'break.wood': brk('wood', 0.7, 0.2),
  'break.soil': brk('soil', 0.8, 0.15),
  'break.ancient': brk('ancient', 1.6, 0.35),

  // Can't break this: a dull clang whose pitch sags, then a weaker bounce off the surface.
  tooHard: def('sfx', 0.9, 0.2, 3, 0.6, (v) => {
    const t = v.t;
    const k = v.vary(0.04);
    const dull = v.filter('lowpass', 2400, 0.7);
    dull.connect(v.out);
    thump(v, t, 190 * k, 115 * k, 0.45, 0.07);
    ring(v, t, 520 * k, CLANG, 1, dull, 0.93);
    burst(v, t + 0.005, 'white', 'bandpass', 2600, 3, 0.14, 0.08);
    thump(v, t + 0.085, 210 * k, 130 * k, 0.18, 0.05);
    ring(v, t + 0.085, 545 * k, CLANG, 0.35, dull, 0.95);
  }, 0.12),

  swing: def('sfx', 0.9, 0.05, 1, 0.3, (v, p) => {
    const k = v.vary(0.08) * (1 + 0.06 * ((p.tier ?? 1) - 1));
    const t = v.t;
    const f = v.filter('bandpass', 350 * k, 1.3);
    f.frequency.setValueAtTime(350 * k, t);
    f.frequency.exponentialRampToValueAtTime(1500 * k, t + 0.09);
    f.frequency.exponentialRampToValueAtTime(500 * k, t + 0.22);
    v.noise('pink', t, t + 0.26).connect(f).connect(v.swell(t, 0.07, 0.75, 0.01, 0.16)).connect(v.out);
  }, 0.08),

  // Pickups get more notes, more sparkle and more space as items get rarer.
  'pickup.common': def('sfx', 0.8, 0.05, 2, 0.25, pickup([880], 0, 0.22, 0.13, 0), 0.05),
  'pickup.uncommon': def('sfx', 0.8, 0.1, 2, 0.35, pickup([880, 1318.51], 0.055, 0.22, 0.2, 0), 0.05),
  'pickup.rare': def('sfx', 0.8, 0.3, 3, 0.6, pickup([880, 1108.73, 1318.51], 0.05, 0.2, 0.3, 0.05), 0.05),
  'pickup.relic': def('sfx', 0.85, 0.45, 3, 1.0, pickup([1108.73, 1318.51, 1760, 2217.46], 0.06, 0.2, 0.5, 0.13), 0.05),

  rejected: def('sfx', 0.8, 0.05, 2, 0.35, (v) => {
    const lp = v.filter('lowpass', 1400, 0.7);
    lp.connect(v.out);
    [392, 311.13].forEach((f, i) => {
      const at = v.t + i * 0.085;
      v.osc('triangle', f, at, at + 0.15).connect(v.perc(at, 0.004, 0.24, 0.1)).connect(lp);
    });
  }, 0.2),

  // Stones and ore spilling into the chest, then a warm chord.
  banked: def('sfx', 0.85, 0.3, 3, 2.0, (v, p) => {
    const t = v.t;
    const n = Math.max(3, Math.min(12, 3 + Math.round((p.count ?? 4) / 2)));
    for (let i = 0; i < n; i++) {
      const at = t + v.rand(0, 0.42);
      burst(v, at, 'white', 'bandpass', v.rand(1800, 3600), 4, v.rand(0.08, 0.2), v.rand(0.02, 0.04));
      if (v.rand(0, 1) < 0.4) v.osc('sine', v.rand(2400, 4200), at, at + 0.15).connect(v.perc(at, 0.001, 0.06, 0.12)).connect(v.out);
    }
    grains(v, t, 0.45, 'bandpass', 2500, 1, 0.25, 1.2);
    padChord(v, t + 0.08, D_MAJOR_ADD9, 'triangle', 0.07, 1600, 0.3, 0.35, 1.1);
  }, 0.3),

  // Forge breath, two anvil strikes, then a rising chime.
  craft: def('sfx', 0.7, 0.4, 3, 2.6, (v) => {
    const t = v.t;
    const fw = v.filter('lowpass', 300, 0.9);
    fw.frequency.setValueAtTime(300, t);
    fw.frequency.exponentialRampToValueAtTime(1800, t + 0.14);
    fw.frequency.exponentialRampToValueAtTime(400, t + 0.4);
    v.noise('pink', t, t + 0.45).connect(fw).connect(v.swell(t, 0.12, 0.3, 0.02, 0.28)).connect(v.out);
    const anvil = (at: number, g: number, k: number) => {
      thump(v, at, 170 * k, 70 * k, 0.7 * g, 0.12);
      ring(v, at, 820 * k, ANVIL, g);
      burst(v, at, 'white', 'highpass', 3000, 0.7, 0.2 * g, 0.02);
    };
    anvil(t + 0.12, 1, 1);
    anvil(t + 0.4, 0.6, 1.06);
    [587.33, 739.99, 880, 1174.66].forEach((f, i) => pluck(v, t + 0.72 + i * 0.09, f, 0.16, 1.0));
  }, 0.3),

  // The rare discovery cue: an open D add9 pad blooming under a shimmering ascending lydian
  // arpeggio (the raised fourth is heard nowhere else), sent deep into the reverb.
  discovery: def('sfx', 0.9, 0.75, 4, 4.6, (v) => {
    const t = v.t;
    const lp = padChord(v, t, [146.83, 146.83 * 1.004, 220, 220 * 0.996, 329.63, 329.63 * 1.004, 369.99, 369.99 * 0.996], 'sawtooth', 0.045, 400, 0.9, 1.3, 2.2);
    lp.frequency.setValueAtTime(400, t);
    lp.frequency.exponentialRampToValueAtTime(2600, t + 1.6);
    lp.frequency.exponentialRampToValueAtTime(900, t + 4.2);
    const trem = v.gain(1);
    trem.connect(v.out);
    v.lfo(trem.gain, 6.5, 0.3, t, t + 4.5);
    [587.33, 659.25, 739.99, 830.61, 880, 1108.73, 1318.51, 1479.98, 1760].forEach((f, i) => pluck(v, t + 0.25 + i * 0.12, f, 0.15, 1.4, trem));
    burst(v, t + 0.3, 'white', 'highpass', 6000, 0.7, 0.05, 1.4, 0.6);
  }, 1),

  'step.stone': step('stone'),
  'step.soil': step('soil'),
  'step.wood': step('wood'),
  'step.ancient': step('ancient'),

  jump: def('sfx', 0.7, 0.05, 1, 0.25, (v) => {
    sweep(v, v.t, 500, 1300, 0.1, 1, 0.03, 0.18, 0.12);
    thump(v, v.t, 90, 60, 0.12, 0.05);
  }, 0.1),

  // Heavier thud with fall speed, plus the surface the player lands on.
  land: def('sfx', 0.65, 0.12, 2, 0.6, (v, p) => {
    const i = saturate(p.intensity ?? 0.5);
    const t = v.t;
    thump(v, t, 100, 40, 0.35 + 0.55 * i, 0.12 + 0.12 * i);
    burst(v, t, 'pink', 'lowpass', 700 + 500 * i, 0.7, 0.25 + 0.4 * i, 0.08 + 0.1 * i);
    grains(v, t, 0.1 + 0.25 * i, 'bandpass', 1500, 0.9, 0.1 + 0.3 * i, 0.9);
    STEP[p.material ?? 'stone'](v, t);
  }, 0.1),

  // Grunt-like: a low hit plus a buzzy source through two vocal formants, muffled.
  damaged: def('sfx', 0.85, 0.1, 3, 0.5, (v, p) => {
    const t = v.t;
    const k = v.vary(0.05);
    const g = 0.7 + 0.3 * saturate(p.intensity ?? 0.5);
    thump(v, t, 125 * k, 55 * k, 0.75 * g, 0.18);
    burst(v, t, 'pink', 'lowpass', 380, 0.7, 0.45 * g, 0.16);
    const src = v.osc('sawtooth', 140 * k, t, t + 0.3);
    src.frequency.setValueAtTime(140 * k, t);
    src.frequency.exponentialRampToValueAtTime(92 * k, t + 0.22);
    const env = v.swell(t, 0.02, 0.32 * g, 0.05, 0.14);
    env.connect(v.filter('lowpass', 1400, 0.7)).connect(v.out);
    src.connect(v.filter('bandpass', 520, 3)).connect(env);
    src.connect(v.filter('bandpass', 1150, 4)).connect(v.gain(0.6)).connect(env);
  }, 0.15),

  // A low drone falling away into the dark.
  died: def('sfx', 0.7, 0.45, 4, 3.4, (v) => {
    const t = v.t;
    const lp = v.filter('lowpass', 1400, 1.2);
    lp.frequency.setValueAtTime(1400, t);
    lp.frequency.exponentialRampToValueAtTime(160, t + 2.8);
    lp.connect(v.swell(t, 0.04, 0.32, 0.5, 2.4)).connect(v.out);
    for (const d of [-0.006, 0.006]) {
      const o = v.osc('sawtooth', 110 * (1 + d), t, t + 3.1);
      o.frequency.setValueAtTime(110 * (1 + d), t);
      o.frequency.exponentialRampToValueAtTime(36 * (1 + d), t + 2.8);
      o.connect(lp);
    }
    const sub = v.osc('sine', 55, t, t + 3.1);
    sub.frequency.setValueAtTime(55, t);
    sub.frequency.exponentialRampToValueAtTime(28, t + 2.8);
    sub.connect(v.swell(t, 0.05, 0.35, 0.6, 2.2)).connect(v.out);
    burst(v, t, 'brown', 'lowpass', 220, 0.7, 0.5, 2.5, 0.4);
  }, 1),

  respawned: def('sfx', 0.85, 0.45, 3, 3.4, (v) => {
    const t = v.t;
    padChord(v, t, [146.83, 220, 293.66, 369.99], 'triangle', 0.06, 1300, 1.1, 0.4, 1.6);
    v.osc('sine', 880, t, t + 3.3).connect(v.swell(t + 0.4, 0.9, 0.03, 0.3, 1.4)).connect(v.out);
  }, 1),

  // Home: a warm strummed D add9 over a soft pad.
  camp: def('sfx', 0.85, 0.4, 3, 3.2, (v) => {
    const t = v.t;
    [146.83, 220, 293.66, 369.99, 440, 659.25].forEach((f, i) => pluck(v, t + i * 0.07, f, 0.14, 1.8));
    padChord(v, t, [146.83, 220, 369.99], 'triangle', 0.05, 1100, 0.7, 0.5, 1.6);
  }, 2),

  'lantern.low': def('sfx', 0.9, 0.1, 2, 0.9, (v) => {
    const t = v.t;
    pops(v, t, 5, [0.04, 0.16], 1400, 3000);
    const f = v.filter('bandpass', 650, 0.9);
    const flutter = v.gain(0.6);
    v.lfo(flutter.gain, 11, 0.4, t, t + 0.8, 'square');
    v.noise('pink', t, t + 0.8).connect(f).connect(v.swell(t, 0.05, 0.2, 0.2, 0.4)).connect(flutter).connect(v.out);
  }, 0.5),

  // Sputter, then the flame collapses with a falling breathy "fwip".
  'lantern.empty': def('sfx', 0.8, 0.2, 3, 1.0, (v) => {
    const t = v.t;
    pops(v, t, 3, [0.05, 0.12], 1400, 3000);
    sweep(v, t + 0.38, 1800, 220, 0.35, 1.1, 0.015, 0.4, 0.32);
    thump(v, t + 0.38, 90, 48, 0.2, 0.18);
  }, 0.5),

  // Whoosh ignite: a rising band of air, a soft "foom" and the first crackles.
  'lantern.refueled': def('sfx', 0.8, 0.2, 3, 1.0, (v) => {
    const t = v.t;
    sweep(v, t, 250, 2600, 0.32, 0.9, 0.26, 0.4, 0.25);
    burst(v, t + 0.2, 'brown', 'lowpass', 420, 0.7, 0.45, 0.4, 0.05);
    thump(v, t + 0.2, 72, 52, 0.25, 0.3);
    pops(v, t + 0.3, 3, [0.05, 0.15], 2000, 3500);
  }, 0.5),

  saved: def('sfx', 0.8, 0.1, 1, 0.15, (v) => {
    const t = v.t;
    v.osc('sine', 2093, t, t + 0.06).connect(v.perc(t, 0.001, 0.08, 0.035)).connect(v.out);
    v.osc('sine', 3136, t + 0.03, t + 0.08).connect(v.perc(t + 0.03, 0.001, 0.035, 0.03)).connect(v.out);
  }, 1),

  'ui.click': def('sfx', 0.8, 0, 3, 0.1, (v) => {
    const t = v.t;
    const o = v.osc('triangle', 1500, t, t + 0.05);
    o.frequency.setValueAtTime(1500, t);
    o.frequency.exponentialRampToValueAtTime(1100, t + 0.02);
    o.connect(v.perc(t, 0.002, 0.2, 0.035)).connect(v.out);
    burst(v, t, 'white', 'highpass', 5000, 0.7, 0.06, 0.008);
  }, 0.03),
  'ui.open': def('sfx', 0.8, 0.1, 3, 0.3, (v) => {
    blip(v, v.t, 660, 0.16, 0.12);
    blip(v, v.t + 0.05, 990, 0.16, 0.14);
  }),
  'ui.close': def('sfx', 0.8, 0.1, 3, 0.3, (v) => {
    blip(v, v.t, 990, 0.14, 0.1);
    blip(v, v.t + 0.05, 660, 0.14, 0.12);
  }),
  'ui.error': def('sfx', 0.8, 0.05, 3, 0.35, (v) => {
    const t = v.t;
    const lp = v.filter('lowpass', 900, 0.8);
    lp.connect(v.out);
    for (const at of [t, t + 0.13]) {
      const env = v.perc(at, 0.004, 0.16, 0.09);
      env.connect(lp);
      v.osc('square', 196, at, at + 0.12).connect(env);
      v.osc('square', 207.65, at, at + 0.12).connect(env);
    }
  }, 0.2),
  'ui.craft': def('sfx', 0.8, 0.15, 3, 0.35, (v) => {
    thump(v, v.t, 260, 180, 0.2, 0.04);
    ring(v, v.t, 1800, TINK);
  }),
  'ui.confirm': def('sfx', 0.8, 0.15, 3, 0.45, (v) => {
    [660, 880, 1320].forEach((f, i) => blip(v, v.t + i * 0.06, f, 0.15, 0.18));
  }),

  // A water drip: a tiny bubble whose pitch jumps upward, heard mostly through the reverb.
  'amb.drip': def('ambience', 0.6, 0.85, 0, 0.6, (v, p) => {
    const t = v.t;
    const f = v.rand(900, 2200) * (p.pitch ?? 1);
    const drip = (at: number, freq: number, amp: number) => {
      const o = v.osc('sine', freq, at, at + 0.12);
      o.frequency.setValueAtTime(freq, at);
      o.frequency.exponentialRampToValueAtTime(freq * 1.7, at + 0.035);
      o.connect(v.perc(at, 0.001, amp, 0.07)).connect(v.out);
    };
    drip(t, f, 0.3);
    if (v.rand(0, 1) < 0.3) drip(t + v.rand(0.12, 0.3), f * 0.85, 0.18);
  }, 0.1),

  // Rock settling somewhere far away: a slow swell of sub rumble and a few distant pebbles.
  'amb.rumble': def('ambience', 0.6, 0.5, 0, 5.0, (v) => {
    const t = v.t;
    const lp = v.filter('lowpass', 160, 0.8);
    v.noise('brown', t, t + 4.6).connect(lp).connect(v.swell(t, 1.4, 0.7, 0.6, 2.4)).connect(v.out);
    v.osc('sine', 38, t, t + 4.6).connect(v.swell(t, 1.4, 0.25, 0.6, 2.4)).connect(v.out);
    for (let k = 0; k < 4; k++) grains(v, t + v.rand(1.2, 3), 0.25, 'bandpass', v.rand(900, 1600), 1, 0.08, 0.8, 0.2);
  }, 5),

  // Score voices, registered so they render offline like any other sound.
  'music.pad': def('music', 1, 0.5, 1, 9, (v) => buildMusicNote(v, { time: v.t, duration: 5, midi: 50, velocity: 0.7, voice: 'pad', brightness: 1100 }), 0),
  'music.pluck': def('music', 1, 0.55, 1, 2.5, (v) => buildMusicNote(v, { time: v.t, duration: 2.2, midi: 74, velocity: 0.7, voice: 'pluck', brightness: 1100 }), 0),
  // Round 2 (MOBS): the creatures' voices, their strikes and the weapons (audio/mobSfx).
  ...MOB_SFX,
  // Polish 2 (FP): the world events (audio/eventSfx).
  ...EVENT_SFX,
  // Round 3 (LOOP): the loop's sounds (audio/loopSfx).
  ...LOOP_SFX,
} satisfies Record<string, SfxDef>;

export type SfxName = keyof typeof SFX;
export const SFX_NAMES = Object.keys(SFX) as SfxName[];

export const isSfxName = (name: string): name is SfxName => name in SFX;

export function sfxInfo(name: SfxName): Readonly<Omit<SfxDef, 'build'>> {
  return SFX[name];
}

/** Build and start one sound at time `t` on `target`. Returns the voice (for limiting). */
export function playSfx(target: SynthTarget, name: SfxName, params: SfxParams, t: number): Voice {
  const d = SFX[name];
  const v = new Voice(target, t, { gain: d.gain * (params.gain ?? 1), wet: d.wet + BASE_SEND[d.bus], pan: params.pan });
  d.build(v, params);
  v.finish();
  return v;
}

/** Pads: detuned saw + triangle through a slowly opening lowpass. Plucks: kalimba-like tines. */
function buildMusicNote(v: Voice, note: MusicNote): void {
  const t = v.t;
  const f = midiToHz(note.midi);
  if (note.voice === 'pluck') {
    pluck(v, t, f, 0.2 * note.velocity, note.duration);
    return;
  }
  const attack = Math.min(2.5, note.duration * 0.3);
  const release = 3;
  const b = note.brightness;
  const lp = v.filter('lowpass', b * 0.6, 0.6);
  lp.frequency.setValueAtTime(b * 0.6, t);
  lp.frequency.linearRampToValueAtTime(b, t + attack);
  lp.frequency.linearRampToValueAtTime(b * 0.7, t + note.duration + release);
  lp.connect(v.swell(t, attack, 0.08 * note.velocity, Math.max(0, note.duration - attack), release)).connect(v.out);
  const stop = t + note.duration + release + 0.05;
  v.osc('sawtooth', f * 0.997, t, stop).connect(lp);
  v.osc('triangle', f * 1.003, t, stop).connect(v.gain(1.6)).connect(lp);
}

/** Start one score note on `target` (gain and reverb as registered for music voices). */
export function playMusicNote(target: SynthTarget, note: MusicNote): Voice {
  const d = SFX[note.voice === 'pad' ? 'music.pad' : 'music.pluck'];
  const v = new Voice(target, note.time, { gain: d.gain, wet: d.wet + BASE_SEND.music });
  buildMusicNote(v, note);
  v.finish();
  return v;
}
