import type { NoiseColor, Voice } from './synth';

/**
 * The creatures' and the weapons' sounds (round 2, MOBS), synthesized like every other sound
 * (registered into sfx.ts SFX, so they render offline in the tests). Monsters are unsettling but
 * never shrill: dry clicks, breath, whispers and low drones; beings chirp, squeak and chime.
 * Every attack's wind-up has its own cue (the telegraph), heard before the blow.
 */
export interface MobSfxDef {
  bus: 'sfx' | 'ambience';
  gain: number;
  wet: number;
  priority: number;
  length: number;
  minGap: number;
  build: (v: Voice, p: { gain?: number; pan?: number; pitch?: number; intensity?: number }) => void;
}

export const def = (gain: number, wet: number, priority: number, length: number, build: MobSfxDef['build'], minGap = 0.05, bus: MobSfxDef['bus'] = 'sfx'): MobSfxDef => ({ bus, gain, wet, priority, length, minGap, build });

export function noiseBurst(v: Voice, t: number, color: NoiseColor, type: BiquadFilterType, freq: number, q: number, peak: number, decay: number, attack = 0.001): BiquadFilterNode {
  const f = v.filter(type, freq, q);
  v.noise(color, t, t + attack + decay + 0.03).connect(f).connect(v.perc(t, attack, peak, decay)).connect(v.out);
  return f;
}

export function swellNoise(v: Voice, t: number, color: NoiseColor, type: BiquadFilterType, freq: number, q: number, peak: number, attack: number, hold: number, release: number): BiquadFilterNode {
  const f = v.filter(type, freq, q);
  v.noise(color, t, t + attack + hold + release + 0.05).connect(f).connect(v.swell(t, attack, peak, hold, release)).connect(v.out);
  return f;
}

export function glide(v: Voice, t: number, type: OscillatorType, f0: number, f1: number, dur: number, peak: number, attack = 0.005): void {
  const o = v.osc(type, f0, t, t + dur + 0.05);
  o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  o.connect(v.swell(t, attack, peak, dur * 0.3, dur * 0.7)).connect(v.out);
}

export function thud(v: Voice, t: number, f0: number, f1: number, peak: number, decay: number): void {
  const o = v.osc('sine', f0, t, t + decay + 0.05);
  o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(f1, t + decay * 0.7);
  o.connect(v.perc(t, 0.002, peak, decay)).connect(v.out);
}

export function bell(v: Voice, t: number, f: number, amp: number, decay: number): void {
  for (const [r, a, d] of [[1, 1, 1], [2.01, 0.4, 0.6], [3.03, 0.18, 0.4], [4.2, 0.08, 0.25]] as const) {
    if (f * r > v.ctx.sampleRate * 0.45) continue;
    v.osc('sine', f * r, t, t + decay * d + 0.05).connect(v.perc(t, 0.002, amp * a, decay * d)).connect(v.out);
  }
}

export const MOB_SFX = {
  // ---- Monsters: their voices and their wind-ups (the telegraph).
  /** Crawler wind-up: a dry rattle of clicks, a hiss under it. */
  'mob.chitter': def(0.75, 0.25, 3, 0.8, (v, p) => {
    const t = v.t;
    const k = p.pitch ?? 1;
    for (let i = 0; i < 9; i++) {
      const at = t + i * v.rand(0.035, 0.06);
      noiseBurst(v, at, 'white', 'bandpass', v.rand(2600, 4200) * k, 6, v.rand(0.25, 0.45), 0.012);
    }
    swellNoise(v, t, 'white', 'highpass', 5200, 0.7, 0.08, 0.05, 0.2, 0.3);
  }, 0.2),
  /** The Gnasher's faint breathing (it is not a boulder). */
  'mob.breath': def(0.6, 0.4, 1, 2.4, (v) => {
    const t = v.t;
    const f = swellNoise(v, t, 'pink', 'bandpass', 380, 1.2, 0.35, 0.9, 0.2, 1.1);
    f.frequency.setValueAtTime(320, t);
    f.frequency.linearRampToValueAtTime(520, t + 1.1);
    f.frequency.linearRampToValueAtTime(280, t + 2.2);
    v.osc('sine', 55, t, t + 2.3).connect(v.swell(t, 0.8, 0.08, 0.3, 1.1)).connect(v.out);
  }, 1, 'ambience'),
  /** The Gnasher opens: a wet growl and a rattle of crystal teeth. */
  'mob.snarl': def(0.85, 0.3, 3, 1.0, (v) => {
    const t = v.t;
    const src = v.osc('sawtooth', 70, t, t + 0.8);
    src.frequency.setValueAtTime(64, t);
    src.frequency.linearRampToValueAtTime(92, t + 0.6);
    const env = v.swell(t, 0.05, 0.4, 0.35, 0.35);
    src.connect(v.filter('lowpass', 520, 2)).connect(env).connect(v.out);
    v.lfo(env.gain, 23, 0.25, t, t + 0.8, 'square');
    for (let i = 0; i < 6; i++) {
      const at = t + 0.1 + i * 0.07;
      v.osc('sine', v.rand(2800, 4600), at, at + 0.08).connect(v.perc(at, 0.001, 0.06, 0.06)).connect(v.out);
    }
  }, 0.3),
  /** A shade wisp near the flame: an airy whisper sweeping through vowels. */
  'mob.whisper': def(0.6, 0.6, 2, 2.0, (v) => {
    const t = v.t;
    const a = swellNoise(v, t, 'white', 'bandpass', 900, 5, 0.3, 0.5, 0.4, 0.9);
    a.frequency.setValueAtTime(700, t);
    a.frequency.exponentialRampToValueAtTime(1700, t + 0.9);
    a.frequency.exponentialRampToValueAtTime(600, t + 1.8);
    const b = swellNoise(v, t + 0.15, 'white', 'bandpass', 2400, 7, 0.15, 0.4, 0.3, 0.9);
    b.frequency.setValueAtTime(2600, t + 0.15);
    b.frequency.exponentialRampToValueAtTime(1500, t + 1.7);
  }, 0.4),
  /** The Hollow Stalker's presence: low beating sines, a slow dread. */
  'mob.drone': def(0.55, 0.65, 2, 3.6, (v) => {
    const t = v.t;
    for (const [f, a] of [[49, 0.16], [49.7, 0.16], [73.4, 0.06], [98.6, 0.04]] as const) v.osc('sine', f, t, t + 3.4).connect(v.swell(t, 1.2, a, 0.8, 1.4)).connect(v.out);
    swellNoise(v, t, 'brown', 'lowpass', 220, 0.7, 0.12, 1, 0.8, 1.4);
  }, 1.5),
  /** The Stalker's wind-up: a thin rising tone against a falling one (dissonant, quiet). */
  'mob.shriek': def(0.6, 0.6, 3, 1.6, (v) => {
    const t = v.t;
    glide(v, t, 'sine', 620, 980, 1.1, 0.12, 0.3);
    glide(v, t, 'sine', 660, 470, 1.1, 0.1, 0.3);
    glide(v, t, 'triangle', 110, 82, 1.2, 0.18, 0.2);
  }, 0.5),
  /** Stone on stone: the Sentinel moves or raises its fist. */
  'mob.grind': def(0.8, 0.45, 3, 1.6, (v) => {
    const t = v.t;
    const f = swellNoise(v, t, 'brown', 'bandpass', 260, 1.4, 0.7, 0.15, 0.6, 0.6);
    v.lfo(f.frequency, 9, 60, t, t + 1.4);
    for (let k = 0; k < 4; k++) noiseBurst(v, t + v.rand(0.1, 1), 'white', 'bandpass', v.rand(900, 1700), 1.4, 0.12, 0.05);
    thud(v, t, 70, 38, 0.5, 0.4);
  }, 0.4),
  /** The Sentinel's sweep coming: a rising hum under the grinding. */
  'mob.charge': def(0.7, 0.45, 3, 1.6, (v) => {
    const t = v.t;
    glide(v, t, 'triangle', 90, 180, 1.3, 0.22, 0.2);
    glide(v, t, 'sine', 360, 720, 1.3, 0.05, 0.4);
  }, 0.4),
  /** The Deep Worm, far away: a vast groan and the rock settling. */
  'mob.groan': def(0.7, 0.85, 2, 4.2, (v) => {
    const t = v.t;
    const src = v.osc('sawtooth', 38, t, t + 3.8);
    src.frequency.setValueAtTime(34, t);
    src.frequency.linearRampToValueAtTime(46, t + 1.6);
    src.frequency.linearRampToValueAtTime(30, t + 3.6);
    src.connect(v.filter('lowpass', 180, 1.5)).connect(v.swell(t, 1, 0.45, 1, 1.8)).connect(v.out);
    v.osc('sine', 27, t, t + 3.8).connect(v.swell(t, 1.2, 0.3, 1, 1.6)).connect(v.out);
    swellNoise(v, t + 0.5, 'brown', 'lowpass', 140, 0.7, 0.25, 1, 0.8, 1.6);
  }, 2.5, 'ambience'),
  // ---- Strikes on monsters.
  /** Flesh or chitin struck. */
  'mob.hit.flesh': def(0.8, 0.12, 3, 0.4, (v) => {
    const t = v.t;
    thud(v, t, 180 * v.vary(0.08), 70, 0.6, 0.12);
    noiseBurst(v, t, 'pink', 'bandpass', 900 * v.vary(0.15), 1.2, 0.4, 0.07);
    noiseBurst(v, t + 0.01, 'white', 'highpass', 3800, 0.8, 0.12, 0.03);
  }, 0.04),
  /** A blow glancing off stone armour or a shut shell. */
  'mob.hit.armour': def(0.8, 0.25, 3, 0.7, (v) => {
    const t = v.t;
    thud(v, t, 140, 60, 0.5, 0.1);
    for (const [r, a, d] of [[1, 0.2, 0.4], [2.6, 0.12, 0.25], [4.1, 0.06, 0.15]] as const) v.osc('sine', 900 * r * v.vary(0.02), t, t + d + 0.05).connect(v.perc(t, 0.001, a, d)).connect(v.out);
    noiseBurst(v, t, 'white', 'bandpass', 2400, 1.1, 0.25, 0.04);
  }, 0.04),
  /** A wisp struck: smoke tearing. */
  'mob.hit.smoke': def(0.7, 0.4, 3, 0.6, (v) => {
    const t = v.t;
    const f = swellNoise(v, t, 'pink', 'bandpass', 1200, 1.5, 0.4, 0.01, 0.05, 0.35);
    f.frequency.setValueAtTime(1800, t);
    f.frequency.exponentialRampToValueAtTime(400, t + 0.35);
  }, 0.04),
  /** A monster dies: a falling squeal into a crumble. */
  'mob.die.monster': def(0.75, 0.35, 3, 1.2, (v) => {
    const t = v.t;
    glide(v, t, 'sawtooth', 520, 140, 0.45, 0.08, 0.01);
    v.osc('sine', 260, t, t + 0.5).connect(v.perc(t, 0.005, 0.12, 0.4)).connect(v.out);
    for (let k = 0; k < 5; k++) noiseBurst(v, t + 0.12 + k * v.rand(0.04, 0.09), 'white', 'bandpass', v.rand(700, 1600), 1.2, 0.18, 0.05);
  }, 0.1),
  /** A wisp dispersed: a long sigh of air. */
  'mob.die.smoke': def(0.7, 0.7, 3, 1.6, (v) => {
    const t = v.t;
    const f = swellNoise(v, t, 'white', 'bandpass', 1400, 3, 0.35, 0.02, 0.2, 1.2);
    f.frequency.setValueAtTime(2200, t);
    f.frequency.exponentialRampToValueAtTime(300, t + 1.3);
  }, 0.2),
  /** The Sentinel falls: a heavy collapse of stone. */
  'mob.die.stone': def(0.9, 0.55, 4, 3.0, (v) => {
    const t = v.t;
    thud(v, t, 90, 30, 0.9, 0.7);
    swellNoise(v, t, 'brown', 'lowpass', 300, 0.8, 0.6, 0.05, 0.6, 1.8);
    for (let k = 0; k < 10; k++) noiseBurst(v, t + v.rand(0.05, 1.8), 'white', 'bandpass', v.rand(600, 1800), 1.2, v.rand(0.1, 0.3), 0.06);
    bell(v, t + 0.3, 220, 0.1, 2);
  }, 1),
  // ---- Beings.
  /** A glimmerkin's chirp. */
  'mob.chirp': def(0.55, 0.2, 2, 0.5, (v) => {
    const t = v.t;
    glide(v, t, 'sine', 1900 * v.vary(0.05), 2900, 0.08, 0.16);
    glide(v, t + 0.11, 'sine', 2100 * v.vary(0.05), 3300, 0.09, 0.13);
  }, 0.3),
  /** A burrower's cheeky squeak. */
  'mob.squeak': def(0.55, 0.2, 2, 0.5, (v) => {
    const t = v.t;
    glide(v, t, 'triangle', 1500 * v.vary(0.06), 2400, 0.07, 0.18);
    glide(v, t + 0.09, 'triangle', 2300, 1300, 0.12, 0.14);
  }, 0.3),
  /** A lampling's chime (they come to light the way). */
  'mob.chime': def(0.5, 0.6, 2, 1.6, (v) => {
    const t = v.t;
    bell(v, t, 1318.5, 0.12, 1.2);
    bell(v, t + 0.09, 1975.5, 0.08, 1);
  }, 0.4),
  /** Caught: a bright little arpeggio and a sparkle. */
  'mob.catch': def(0.7, 0.4, 3, 1.2, (v) => {
    const t = v.t;
    [1174.7, 1480, 1760, 2349.3].forEach((f, i) => bell(v, t + i * 0.055, f, 0.09, 0.5));
    noiseBurst(v, t + 0.05, 'white', 'highpass', 7200, 0.7, 0.08, 0.25);
  }, 0.1),
  /** A drift jelly's spores: an airy shimmer rising. */
  'mob.spores': def(0.6, 0.7, 3, 2.0, (v) => {
    const t = v.t;
    const f = swellNoise(v, t, 'white', 'bandpass', 3000, 4, 0.18, 0.3, 0.3, 1.2);
    f.frequency.setValueAtTime(2000, t);
    f.frequency.exponentialRampToValueAtTime(6000, t + 1.4);
    [880, 1318.5, 1760].forEach((fr, i) => bell(v, t + 0.1 + i * 0.12, fr, 0.06, 1.1));
  }, 0.3),
  // ---- Weapons (FP's viewmodels; FP emits the 'weapon:*' events).
  /** A blade or the pick cutting the air. */
  'weapon.whoosh': def(0.6, 0.06, 2, 0.35, (v, p) => {
    const t = v.t;
    const k = p.pitch ?? 1;
    const f = swellNoise(v, t, 'pink', 'bandpass', 700 * k, 1.6, 0.35, 0.04, 0.03, 0.16);
    f.frequency.setValueAtTime(500 * k, t);
    f.frequency.exponentialRampToValueAtTime(1900 * k, t + 0.12);
  }, 0.05),
  /** The blade's bite (layered on the creature's own hit). */
  'weapon.slice': def(0.55, 0.1, 2, 0.3, (v) => {
    const t = v.t;
    noiseBurst(v, t, 'white', 'highpass', 4200, 0.9, 0.22, 0.05);
    v.osc('sine', 3100 * v.vary(0.03), t, t + 0.12).connect(v.perc(t, 0.001, 0.05, 0.1)).connect(v.out);
  }, 0.05),
  /** The Flare Sling: a taut twang and the shard's fizz. */
  'weapon.sling': def(0.65, 0.15, 2, 0.6, (v) => {
    const t = v.t;
    glide(v, t, 'triangle', 240, 150, 0.12, 0.25, 0.002);
    const f = swellNoise(v, t + 0.02, 'white', 'bandpass', 4000, 2, 0.14, 0.02, 0.1, 0.3);
    f.frequency.setValueAtTime(5500, t);
    f.frequency.exponentialRampToValueAtTime(2500, t + 0.4);
  }, 0.08),
  /** A light shard strikes: a bright crackle. */
  'weapon.spark': def(0.6, 0.25, 2, 0.5, (v) => {
    const t = v.t;
    for (let i = 0; i < 5; i++) noiseBurst(v, t + i * v.rand(0.01, 0.03), 'white', 'highpass', v.rand(3500, 7000), 0.8, 0.2, 0.02);
    bell(v, t, 2637, 0.05, 0.4);
  }, 0.05),
  /** A Flash Charge: a rising flare and a ringing burst of light. */
  'weapon.flash': def(0.8, 0.5, 3, 1.6, (v) => {
    const t = v.t;
    const f = swellNoise(v, t, 'white', 'bandpass', 1500, 1.4, 0.5, 0.06, 0.05, 0.6);
    f.frequency.setValueAtTime(800, t);
    f.frequency.exponentialRampToValueAtTime(7000, t + 0.4);
    thud(v, t + 0.06, 120, 50, 0.5, 0.3);
    [1760, 2217.5, 2637].forEach((fr) => bell(v, t + 0.08, fr, 0.06, 1.2));
  }, 0.3),
  /** The pick on ordinary rock: a soft, dull tunk (nothing breaks). */
  'block.tunk': def(0.6, 0.12, 2, 0.3, (v) => {
    const t = v.t;
    thud(v, t, 210 * v.vary(0.06), 120, 0.45, 0.07);
    noiseBurst(v, t, 'pink', 'lowpass', 1300, 0.8, 0.2, 0.04);
  }, 0.05),
} satisfies Record<string, MobSfxDef>;
