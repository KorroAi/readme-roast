import type { SoundKind } from '../config/blocks';
import { saturate } from '../core/math';
import type { MusicNote } from './MusicScheduler';
import { Voice, type NoiseColor, type SynthTarget } from './synth';
import { midiToHz } from './theory';

// Every one-shot sound in the game, synthesized from oscillators, the shared noise buffers
// and envelopes. Recipes only talk to a Voice, so the same code plays live through the mix
// graph or renders into an OfflineAudioContext for tests.

export type BusName = 'music' | 'sfx' | 'ambience';

/** Reverb send every voice of a category gets on top of its own (music sits further back). */
const BASE_SEND: Record<BusName, number> = { music: 0.35, sfx: 0.12, ambience: 0.3 };

export interface SfxParams {
  /** Crack progress in [0, 1]: hits get slightly higher and brighter as the cell weakens. */
  progress?: number;
  /** Generic strength in [0, 1] (a boom's size, a chest's tier). */
  intensity?: number;
  /** How many things are involved (the cash roll's ticks). */
  count?: number;
  /** Stereo position in [-1, 1]. */
  pan?: number;
  /** Gain multiplier on top of the sound's own level. */
  gain?: number;
  /** Pitch multiplier (ladders, combo semitones; drips get lower in the depths). */
  pitch?: number;
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
  const k = p.pitch ?? 1;
  return { pitch: v.vary(0.06) * (1 + 0.12 * pr) * k, bright: v.vary(0.15) * (1 + 0.45 * pr) * Math.sqrt(k), pr };
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

// ---------------------------------------------------------------------------------------
// Registry

const def = (bus: BusName, gain: number, wet: number, priority: number, length: number, build: SfxDef['build'], minGap = 0.025): SfxDef => ({
  bus, gain, wet, priority, length, minGap, build,
});

/** A tap: the material hit, shifted by p.pitch (the combo's semitones). */
const tap = (kind: SoundKind, length: number, wet: number) =>
  def('sfx', 0.72, wet, 2, length, (v, p) => HIT[kind](v, p), 0.035);
/** A break: the material's collapse plus a pluck on the break ladder at p.pitch. */
const brk = (kind: SoundKind, length: number, wet: number) =>
  def('sfx', 0.8, wet, 2, length, (v, p) => {
    BREAK[kind](v);
    if (p.pitch) pluck(v, v.t + 0.005, 587.33 * p.pitch, 0.13, 0.7);
  }, 0.035);

export const SFX = {
  // ----- the tap (SPEC §10.3, §10.10): a material hit, ±6 % pitch, +1 semitone per 5 combo (p.pitch) -----
  'tap.stone': tap('stone', 0.4, 0.12),
  'tap.metal': tap('metal', 0.9, 0.18),
  'tap.crystal': tap('crystal', 1.2, 0.35),
  'tap.wood': tap('wood', 0.3, 0.1),
  'tap.soil': tap('soil', 0.35, 0.08),
  'tap.ancient': tap('ancient', 1.6, 0.3),
  // ----- breaks: the material's collapse plus a note on the pentatonic break ladder (p.pitch) -----
  'break.stone': brk('stone', 1.0, 0.25),
  'break.metal': brk('metal', 1.3, 0.3),
  'break.crystal': brk('crystal', 1.4, 0.5),
  'break.wood': brk('wood', 0.8, 0.2),
  'break.soil': brk('soil', 0.9, 0.15),
  'break.ancient': brk('ancient', 1.6, 0.35),

  /** A crit: a sharp crack and a 55 Hz thump under the hit. */
  crit: def('sfx', 0.85, 0.15, 3, 0.5, (v) => {
    const t = v.t;
    burst(v, t, 'white', 'highpass', 3200 * v.vary(0.08), 0.8, 0.5, 0.05);
    burst(v, t + 0.006, 'white', 'bandpass', 1500, 2, 0.3, 0.03);
    thump(v, t, 110, 55, 0.95, 0.22);
  }, 0.05),

  /** An ore or rich-ore break: a bright chime pitched from the value (p.pitch). */
  'ore.chime': def('sfx', 0.7, 0.45, 3, 1.4, (v, p) => {
    const f = 1046.5 * (p.pitch ?? 1);
    ring(v, v.t, f, TINK, 1.2);
    pluck(v, v.t + 0.02, f * 1.5, 0.12, 0.9);
    burst(v, v.t, 'white', 'highpass', 6500, 0.7, 0.08, 0.05);
  }, 0.05),

  /** A gem or geode: a crystal ring. */
  'gem.ring': def('sfx', 0.75, 0.6, 3, 2.0, (v, p) => {
    const t = v.t;
    const base = 1568 * (p.pitch ?? 1);
    ring(v, t, base, CRYSTAL, 1.1);
    ring(v, t + 0.06, base * 1.5, CRYSTAL, 0.5);
    burst(v, t, 'white', 'highpass', 7000, 0.7, 0.1, 0.12);
  }, 0.08),

  /** A coin lands on the counter: a small bright tick, +1 semitone per landing within 600 ms (p.pitch). */
  'coin.tick': def('sfx', 0.55, 0.08, 1, 0.15, (v, p) => {
    const t = v.t;
    const f = 2637 * (p.pitch ?? 1);
    v.osc('sine', f, t, t + 0.07).connect(v.perc(t, 0.001, 0.1, 0.05)).connect(v.out);
    v.osc('sine', f * 2.76, t, t + 0.04).connect(v.perc(t, 0.001, 0.03, 0.025)).connect(v.out);
  }, 0.018),

  /** A row clears: root + 5th + octave on the current ladder step, over a low thunk. */
  'row.clear': def('sfx', 0.8, 0.35, 3, 1.6, (v, p) => {
    const t = v.t;
    const f = 293.66 * (p.pitch ?? 1);
    thump(v, t, 120, 46, 0.7, 0.16);
    grains(v, t, 0.25, 'lowpass', 700, 0.8, 0.3, 0.75);
    for (const [k, a] of [[1, 0.16], [1.5, 0.12], [2, 0.1]] as const) pluck(v, t + 0.01, f * k, a, 1.1);
  }, 0.08),

  /** The leftover crumble: a gravel slide. */
  crumble: def('sfx', 0.6, 0.2, 2, 0.8, (v) => {
    grains(v, v.t, 0.6, 'bandpass', 900, 0.9, 0.45, 0.85);
    burst(v, v.t, 'brown', 'lowpass', 380, 0.7, 0.3, 0.4);
  }, 0.1),

  /** A pierce chain or a column burst: a low boom (p.intensity 0..1). */
  boom: def('sfx', 0.85, 0.3, 3, 1.4, (v, p) => {
    const i = saturate(p.intensity ?? 0.5);
    const t = v.t;
    thump(v, t, 90, 34, 0.7 + 0.3 * i, 0.3 + 0.2 * i);
    burst(v, t, 'brown', 'lowpass', 300 + 300 * i, 0.7, 0.5, 0.5);
    grains(v, t + 0.03, 0.5, 'bandpass', 1300, 0.8, 0.4 * i, 1);
  }, 0.12),

  /** A purchase: a brass ka-ching on the next note of the purchase arpeggio (p.pitch). */
  buy: def('sfx', 0.75, 0.25, 3, 0.7, (v, p) => {
    const t = v.t;
    const f = 587.33 * (p.pitch ?? 1);
    ring(v, t, f * 2, METAL, 0.5);
    blip(v, t, f, 0.2, 0.25);
    blip(v, t + 0.045, f * 1.5, 0.16, 0.3);
    burst(v, t, 'white', 'highpass', 6000, 0.7, 0.07, 0.04);
  }, 0.03),

  /** A ★: a stinger a fifth above the last purchase note (p.pitch). */
  'buy.star': def('sfx', 0.85, 0.5, 4, 1.8, (v, p) => {
    const t = v.t;
    const f = 880 * (p.pitch ?? 1);
    [1, 1.25, 1.5, 2].forEach((k, i) => pluck(v, t + i * 0.055, f * k, 0.17, 1.2));
    ring(v, t + 0.2, f * 2, CRYSTAL, 0.5);
    burst(v, t, 'white', 'highpass', 6500, 0.7, 0.08, 0.3);
  }, 0.1),

  /** The pick reaches a new tier: forge hits, a rising choir, a crash. */
  'tool.tier': def('sfx', 0.85, 0.5, 4, 2.6, (v) => {
    const t = v.t;
    const anvil = (at: number, g: number, k: number) => {
      thump(v, at, 170 * k, 70 * k, 0.7 * g, 0.12);
      ring(v, at, 820 * k, ANVIL, g);
    };
    anvil(t, 0.7, 1);
    anvil(t + 0.18, 0.85, 1.06);
    padChord(v, t + 0.25, [293.66, 369.99, 440, 587.33], 'sawtooth', 0.035, 900, 0.4, 0.3, 1.2);
    burst(v, t + 0.7, 'white', 'highpass', 2500, 0.7, 0.5, 0.6);
    thump(v, t + 0.7, 80, 30, 0.9, 0.4);
  }, 0.5),

  /** A combo tier (10, 25, 50): a rising chime, a step per tier (p.pitch). */
  'combo.tier': def('sfx', 0.7, 0.4, 3, 1.0, (v, p) => {
    const f = 1174.66 * (p.pitch ?? 1);
    [1, 1.25, 1.5].forEach((k, i) => blip(v, v.t + i * 0.05, f * k, 0.14, 0.3));
  }, 0.2),

  /** A combo of 10 or more fades away: a soft fizz at −18 dB. Costs nothing. */
  'combo.lost': def('sfx', 0.12, 0.2, 1, 0.5, (v) => {
    sweep(v, v.t, 3000, 700, 0.3, 1, 0.01, 0.4, 0.3);
  }, 0.5),

  /** The ready ping of a card: a tink pitched C, E or G by slot (p.pitch). */
  'ui.tink': def('sfx', 0.6, 0.2, 2, 0.4, (v, p) => {
    ring(v, v.t, 2093 * (p.pitch ?? 1), TINK, 0.8);
  }, 0.1),

  /** A chest pops out of its cell: a creak and a sparkle. */
  'chest.creak': def('sfx', 0.7, 0.25, 3, 0.8, (v) => {
    const t = v.t;
    const o = v.osc('sawtooth', 180, t, t + 0.35);
    o.frequency.setValueAtTime(180, t);
    o.frequency.exponentialRampToValueAtTime(120, t + 0.3);
    o.connect(v.filter('bandpass', 900, 6)).connect(v.swell(t, 0.04, 0.12, 0.1, 0.2)).connect(v.out);
    burst(v, t + 0.2, 'white', 'highpass', 7000, 0.7, 0.1, 0.25);
  }, 0.2),

  /** A chest opens (p.intensity by tier): a pop up to a bright bloom. */
  'chest.open': def('sfx', 0.85, 0.5, 4, 1.8, (v, p) => {
    const i = saturate(p.intensity ?? 0);
    const t = v.t;
    thump(v, t, 200, 120, 0.5, 0.08);
    [523.25, 659.25, 783.99, 1046.5].slice(0, 2 + Math.round(2 * i)).forEach((f, k) => pluck(v, t + 0.03 + k * 0.06, f * (p.pitch ?? 1), 0.16, 1));
    burst(v, t, 'white', 'highpass', 6000, 0.7, 0.1 + 0.15 * i, 0.3);
  }, 0.15),

  /** A seal appears: a low drone and a drum hit. */
  'seal.appear': def('sfx', 0.85, 0.45, 4, 2.4, (v) => {
    const t = v.t;
    padChord(v, t, [73.42, 110, 146.83], 'sawtooth', 0.05, 500, 0.3, 0.8, 1.2);
    thump(v, t, 70, 36, 0.9, 0.35);
    thump(v, t + 0.4, 70, 36, 0.7, 0.3);
  }, 1),

  /** A hit on the seal: a low stone gong. */
  'seal.hit': def('sfx', 0.6, 0.35, 2, 0.8, (v) => {
    thump(v, v.t, 160, 80, 0.5, 0.12);
    ring(v, v.t, 330 * v.vary(0.03), ANVIL, 0.35);
  }, 0.06),

  /** The seal breaks: a shatter and a rising choir stinger. */
  'seal.break': def('sfx', 0.95, 0.6, 4, 3.2, (v) => {
    const t = v.t;
    collapse(v, t, 1500);
    burst(v, t, 'white', 'highpass', 3000, 0.7, 0.5, 0.4);
    padChord(v, t + 0.1, [293.66, 440, 587.33, 739.99], 'sawtooth', 0.04, 600, 0.5, 0.8, 1.6);
    [587.33, 739.99, 880, 1174.66].forEach((f, i) => pluck(v, t + 0.3 + i * 0.1, f, 0.15, 1.4));
  }, 1),

  /** A new biome's stinger (3 s). */
  reveal: def('sfx', 0.9, 0.75, 4, 4.4, (v) => {
    const t = v.t;
    const lp = padChord(v, t, [146.83, 220, 329.63, 369.99], 'sawtooth', 0.045, 400, 0.8, 1.2, 2.2);
    lp.frequency.setValueAtTime(400, t);
    lp.frequency.exponentialRampToValueAtTime(2400, t + 1.4);
    lp.frequency.exponentialRampToValueAtTime(900, t + 4);
    [587.33, 739.99, 880, 1108.73, 1318.51, 1760].forEach((f, i) => pluck(v, t + 0.2 + i * 0.12, f, 0.15, 1.4));
  }, 1),

  /** The Lucky Moth caught: a bell. */
  moth: def('sfx', 0.8, 0.6, 4, 2.0, (v) => {
    ring(v, v.t, 1318.51, CRYSTAL, 1);
    [1, 1.25, 1.5, 2].forEach((k, i) => blip(v, v.t + 0.04 + i * 0.05, 880 * k, 0.12, 0.4));
  }, 0.3),

  // ----- Wave 2 (SPEC §10.10) ------------------------------------------------------------------------------

  /** A chest roll-up step: a major third higher per step (p.pitch), a bright tick and a shimmer. */
  'chest.step': def('sfx', 0.75, 0.45, 3, 1.0, (v, p) => {
    const t = v.t;
    const f = 659.25 * (p.pitch ?? 1);
    thump(v, t, 260, 150, 0.35, 0.06);
    pluck(v, t + 0.01, f, 0.16, 0.8);
    ring(v, t + 0.02, f * 2, CRYSTAL, 0.35);
    burst(v, t, 'white', 'highpass', 7000, 0.7, 0.06, 0.18);
  }, 0.08),

  /** A target caught (moths, crystals, boulders): a short bright pluck that climbs per catch (p.pitch). */
  catch: def('sfx', 0.65, 0.4, 3, 0.7, (v, p) => {
    const f = 1046.5 * (p.pitch ?? 1);
    pluck(v, v.t, f, 0.14, 0.5);
    blip(v, v.t + 0.03, f * 1.5, 0.1, 0.25);
  }, 0.04),

  /** A perfect Strike: an anvil ring and a rising fifth. */
  'strike.perfect': def('sfx', 0.85, 0.5, 4, 1.4, (v) => {
    const t = v.t;
    thump(v, t, 220, 90, 0.6, 0.1);
    ring(v, t, 1318.51, ANVIL, 0.8);
    [1, 1.5, 2].forEach((k, i) => pluck(v, t + 0.05 + i * 0.06, 880 * k, 0.15, 1));
  }, 0.15),

  /** A Feat tier: a medal chime pitched by tier (p.pitch). */
  feat: def('sfx', 0.8, 0.5, 4, 1.8, (v, p) => {
    const t = v.t;
    const f = 783.99 * (p.pitch ?? 1);
    [1, 1.25, 1.5, 2].forEach((k, i) => pluck(v, t + i * 0.07, f * k, 0.15, 1.2));
    ring(v, t + 0.28, f * 2, CRYSTAL, 0.6);
  }, 0.3),

  /** A rank-up: a warm three-note chime and a low bell. */
  rank: def('sfx', 0.8, 0.5, 4, 1.6, (v) => {
    const t = v.t;
    [587.33, 739.99, 880].forEach((f, i) => pluck(v, t + i * 0.08, f, 0.16, 1.1));
    ring(v, t, 293.66, ANVIL, 0.4);
  }, 0.3),

  /** A charted gate: a gate chord with a crack. */
  gate: def('sfx', 0.85, 0.5, 4, 2.0, (v) => {
    const t = v.t;
    collapse(v, t, 900);
    padChord(v, t + 0.05, [293.66, 440, 587.33], 'sawtooth', 0.04, 900, 0.2, 0.5, 1.0);
  }, 0.5),

  /** The Rekindle: a deep bell, then rushing wind. */
  rekindle: def('sfx', 0.95, 0.7, 4, 4.4, (v) => {
    const t = v.t;
    ring(v, t, 146.83, ANVIL, 1);
    thump(v, t, 90, 40, 0.8, 0.6);
    sweep(v, t + 0.5, 400, 3200, 1.6, 1, 0.3, 0.25, 0.8);
    padChord(v, t + 1.6, [146.83, 220, 293.66, 369.99], 'sawtooth', 0.04, 700, 0.6, 1.0, 1.8);
  }, 2),

  /** The Lantern Surge starts: a gong; the drum layer enters on the next bar. */
  'surge.start': def('sfx', 0.9, 0.6, 4, 2.6, (v) => {
    const t = v.t;
    thump(v, t, 110, 50, 0.9, 0.4);
    ring(v, t, 220, ANVIL, 0.9);
    burst(v, t, 'white', 'highpass', 4000, 0.7, 0.3, 0.6);
  }, 1),

  /** The Surge ends: a soft falling sweep. */
  'surge.end': def('sfx', 0.4, 0.4, 2, 1.0, (v) => {
    sweep(v, v.t, 2400, 500, 0.6, 1, 0.02, 0.3, 0.5);
  }, 1),

  /** Earthquake: a long low boom with rubble. */
  quake: def('sfx', 0.9, 0.4, 3, 2.4, (v) => {
    const t = v.t;
    thump(v, t, 60, 28, 1, 0.9);
    collapse(v, t + 0.05, 600);
    collapse(v, t + 0.4, 400);
  }, 0.5),

  /** An event begins: a bright two-note sting. */
  'event.sting': def('sfx', 0.75, 0.45, 3, 1.2, (v) => {
    pluck(v, v.t, 880, 0.16, 0.8);
    pluck(v, v.t + 0.09, 1318.51, 0.16, 1);
  }, 0.5),

  /** A record broken: a two-note chime in the relic register. */
  record: def('sfx', 0.7, 0.5, 3, 1.2, (v) => {
    blip(v, v.t, 987.77, 0.14, 0.4);
    blip(v, v.t + 0.08, 1479.98, 0.14, 0.5);
  }, 0.5),

  // ----- The score's rhythm layers (SPEC §10.10): drums at combo ≥ 25, in a Surge, events and the Plunge; the boss pulse
  // under a Warden fight. Scheduled ahead on the music bus by src/audio/drums.ts; p.gain is the layer's level.
  'drum.kick': def('music', 0.9, 0.15, 1, 0.5, (v) => thump(v, v.t, 120, 42, 0.9, 0.28), 0),
  'drum.snare': def('music', 0.55, 0.3, 1, 0.4, (v) => {
    burst(v, v.t, 'white', 'bandpass', 2200, 0.9, 0.5, 0.14);
    thump(v, v.t, 220, 160, 0.25, 0.06);
  }, 0),
  'drum.hat': def('music', 0.3, 0.1, 1, 0.12, (v) => burst(v, v.t, 'white', 'highpass', 8000, 0.7, 0.35, 0.03), 0),
  'boss.pulse': def('music', 0.7, 0.35, 1, 1.4, (v) => {
    thump(v, v.t, 55, 38, 0.8, 0.5);
    padChord(v, v.t, [55, 82.41], 'sawtooth', 0.05, 380, 0.05, 0.4, 0.6);
  }, 0),

  /** The return feast's cash roll (p.count ticks). */
  'cash.roll': def('sfx', 0.7, 0.3, 3, 1.6, (v, p) => {
    const n = Math.max(4, Math.min(24, p.count ?? 12));
    for (let i = 0; i < n; i++) {
      const at = v.t + (i * 1.2) / n;
      v.osc('sine', 2093 * Math.pow(2, (i % 12) / 24), at, at + 0.05).connect(v.perc(at, 0.001, 0.07, 0.04)).connect(v.out);
    }
  }, 0.5),

  'ui.tap': def('sfx', 0.8, 0, 3, 0.1, (v) => {
    const t = v.t;
    const o = v.osc('triangle', 1500, t, t + 0.05);
    o.frequency.setValueAtTime(1500, t);
    o.frequency.exponentialRampToValueAtTime(1100, t + 0.02);
    o.connect(v.perc(t, 0.002, 0.2, 0.035)).connect(v.out);
    burst(v, t, 'white', 'highpass', 5000, 0.7, 0.06, 0.008);
  }, 0.03),
  /** "Not yet": a low, short buzz (never harsh: nothing is lost). */
  'ui.no': def('sfx', 0.7, 0.05, 3, 0.3, (v) => {
    const t = v.t;
    const lp = v.filter('lowpass', 700, 0.8);
    lp.connect(v.out);
    const env = v.perc(t, 0.004, 0.14, 0.1);
    env.connect(lp);
    v.osc('square', 146.83, t, t + 0.14).connect(env);
    v.osc('square', 155.56, t, t + 0.14).connect(env);
  }, 0.12),
  'ui.open': def('sfx', 0.8, 0.1, 3, 0.3, (v) => {
    blip(v, v.t, 660, 0.16, 0.12);
    blip(v, v.t + 0.05, 990, 0.16, 0.14);
  }),
  'ui.close': def('sfx', 0.8, 0.1, 3, 0.3, (v) => {
    blip(v, v.t, 990, 0.14, 0.1);
    blip(v, v.t + 0.05, 660, 0.14, 0.12);
  }),
  saved: def('sfx', 0.8, 0.1, 1, 0.15, (v) => {
    const t = v.t;
    v.osc('sine', 2093, t, t + 0.06).connect(v.perc(t, 0.001, 0.08, 0.035)).connect(v.out);
    v.osc('sine', 3136, t + 0.03, t + 0.08).connect(v.perc(t + 0.03, 0.001, 0.035, 0.03)).connect(v.out);
  }, 1),

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
