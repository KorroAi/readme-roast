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
  // ---- Round 3: the archetypes' voices and wind-ups (every attack is heard before it lands).
  /** A swarmer's idle buzz (ticks, mites, scarabs): a dry, beating drone, close and small. */
  'mob.buzz': def(0.45, 0.2, 1, 0.8, (v, p) => {
    const t = v.t;
    const k = p.pitch ?? 1;
    const src = v.osc('sawtooth', 132 * k * v.vary(0.08), t, t + 0.7);
    const env = v.swell(t, 0.08, 0.16, 0.3, 0.3);
    src.connect(v.filter('bandpass', 900 * k, 2.2)).connect(env).connect(v.out);
    v.lfo(env.gain, 38 * v.vary(0.1), 0.12, t, t + 0.7, 'square');
  }, 0.6),
  /** A spitter's idle croak (toads, newts, lizards): two throaty pulses. */
  'mob.croak': def(0.55, 0.3, 1, 0.8, (v, p) => {
    const t = v.t;
    const k = (p.pitch ?? 1) * v.vary(0.08);
    for (const at of [t, t + 0.22]) {
      const src = v.osc('square', 82 * k, at, at + 0.2);
      src.frequency.setValueAtTime(96 * k, at);
      src.frequency.exponentialRampToValueAtTime(70 * k, at + 0.16);
      const env = v.perc(at, 0.01, 0.22, 0.16);
      src.connect(v.filter('bandpass', 620 * k, 3)).connect(env).connect(v.out);
      v.lfo(env.gain, 31, 0.1, at, at + 0.18, 'square');
    }
  }, 0.8),
  /** A bat's wings: a quick patter of soft beats. */
  'mob.flutter': def(0.45, 0.25, 1, 0.8, (v) => {
    const t = v.t;
    // (×4 and a little longer than at first: AUDIO measured it at -52 LUFS, inaudible on a phone.)
    for (let i = 0; i < 8; i++) noiseBurst(v, t + i * v.rand(0.055, 0.075), 'pink', 'bandpass', v.rand(900, 1500), 1.4, v.rand(0.5, 0.85), 0.042);
  }, 0.6),
  /** A ceiling dropper's tell: a drip, then another, and a faint creak of roots or ice. */
  'mob.drip': def(0.6, 0.55, 3, 1.0, (v) => {
    const t = v.t;
    for (const [at, f] of [[0, 1500], [0.32, 1800]] as const) {
      glide(v, t + at, 'sine', f * v.vary(0.05), f * 2.1, 0.05, 0.18, 0.002);
      noiseBurst(v, t + at + 0.02, 'white', 'bandpass', 4200, 3, 0.05, 0.03);
    }
    const f = swellNoise(v, t + 0.1, 'brown', 'bandpass', 420, 5, 0.1, 0.25, 0.2, 0.4);
    v.lfo(f.frequency, 6, 80, t + 0.1, t + 0.95);
  }, 0.5),
  /** A spitter swells: a wet hiss rising to the spit (also a guardian's volley). */
  'mob.hiss': def(0.65, 0.3, 3, 0.9, (v) => {
    const t = v.t;
    const f = swellNoise(v, t, 'white', 'bandpass', 2600, 2.5, 0.28, 0.45, 0.15, 0.25);
    f.frequency.setValueAtTime(1800, t);
    f.frequency.exponentialRampToValueAtTime(4200, t + 0.6);
    const g = v.osc('sawtooth', 70, t, t + 0.7);
    const env = v.swell(t, 0.3, 0.08, 0.2, 0.2);
    g.connect(v.filter('lowpass', 400, 1.5)).connect(env).connect(v.out);
    v.lfo(env.gain, 27, 0.06, t, t + 0.7, 'square');
  }, 0.3),
  /** The glob leaves the mouth: a wet "ptoo". */
  'mob.spit': def(0.6, 0.15, 2, 0.45, (v) => {
    const t = v.t;
    noiseBurst(v, t, 'pink', 'bandpass', 1300 * v.vary(0.1), 1.8, 0.4, 0.08);
    glide(v, t, 'sine', 340 * v.vary(0.06), 140, 0.12, 0.25, 0.003);
  }, 0.08),
  /** A glob lands (on rock, or on the explorer): a splat and a few droplets. */
  'mob.splat': def(0.6, 0.2, 2, 0.6, (v) => {
    const t = v.t;
    noiseBurst(v, t, 'pink', 'lowpass', 1600, 0.9, 0.45, 0.12);
    thud(v, t, 160, 70, 0.25, 0.1);
    for (let i = 0; i < 4; i++) {
      const at = t + 0.05 + i * v.rand(0.03, 0.07);
      v.osc('sine', v.rand(2200, 3600), at, at + 0.05).connect(v.perc(at, 0.001, 0.04, 0.04)).connect(v.out);
    }
  }, 0.06),
  /** A beast's challenge before a charge: a snort and a low growl. */
  'mob.roar': def(0.8, 0.35, 3, 1.1, (v, p) => {
    const t = v.t;
    const k = (p.pitch ?? 1) * v.vary(0.06);
    noiseBurst(v, t, 'pink', 'bandpass', 700 * k, 1.6, 0.35, 0.09);
    noiseBurst(v, t + 0.14, 'pink', 'bandpass', 650 * k, 1.6, 0.3, 0.08);
    const src = v.osc('sawtooth', 78 * k, t + 0.25, t + 1.0);
    src.frequency.setValueAtTime(70 * k, t + 0.25);
    src.frequency.linearRampToValueAtTime(104 * k, t + 0.75);
    const env = v.swell(t + 0.25, 0.12, 0.34, 0.3, 0.3);
    src.connect(v.filter('lowpass', 640 * k, 2.5)).connect(env).connect(v.out);
    v.lfo(env.gain, 19, 0.16, t + 0.25, t + 1.0, 'square');
  }, 0.4),
  /** The charge itself: hooves drumming and a rush of air. */
  'mob.rush': def(0.75, 0.2, 3, 0.9, (v) => {
    const t = v.t;
    for (let i = 0; i < 5; i++) thud(v, t + i * 0.11, 120 * v.vary(0.08), 55, 0.32, 0.08);
    const f = swellNoise(v, t, 'pink', 'bandpass', 600, 1.2, 0.25, 0.25, 0.2, 0.3);
    f.frequency.setValueAtTime(400, t);
    f.frequency.exponentialRampToValueAtTime(1400, t + 0.5);
  }, 0.3),
  /** A diver marks its target: a thin, breathy shriek (low enough never to sting). */
  'mob.screech': def(0.5, 0.45, 3, 0.9, (v) => {
    const t = v.t;
    const a = v.osc('sine', 1500 * v.vary(0.05), t, t + 0.6);
    a.frequency.setValueAtTime(1300, t);
    a.frequency.linearRampToValueAtTime(1900, t + 0.35);
    a.frequency.linearRampToValueAtTime(1600, t + 0.6);
    const env = v.swell(t, 0.06, 0.08, 0.25, 0.3);
    a.connect(env).connect(v.out);
    v.lfo(a.frequency, 11, 40, t, t + 0.6);
    swellNoise(v, t, 'white', 'bandpass', 2600, 3, 0.1, 0.05, 0.25, 0.3);
  }, 0.4),
  /** The dive: a falling whoosh. */
  'mob.swoop': def(0.6, 0.25, 2, 0.8, (v) => {
    const t = v.t;
    const f = swellNoise(v, t, 'pink', 'bandpass', 900, 1.6, 0.35, 0.15, 0.15, 0.35);
    f.frequency.setValueAtTime(2200, t);
    f.frequency.exponentialRampToValueAtTime(500, t + 0.6);
  }, 0.2),
  /** A burrower underground: a low rumble rolling closer. */
  'mob.rumble': def(0.65, 0.5, 2, 1.6, (v) => {
    const t = v.t;
    const f = swellNoise(v, t, 'brown', 'lowpass', 140, 0.9, 0.45, 0.4, 0.5, 0.6);
    v.lfo(f.frequency, 7, 40, t, t + 1.5);
    v.osc('sine', 41, t, t + 1.5).connect(v.swell(t, 0.4, 0.14, 0.5, 0.6)).connect(v.out);
    for (let k = 0; k < 4; k++) noiseBurst(v, t + v.rand(0.2, 1.2), 'white', 'bandpass', v.rand(500, 900), 1.2, 0.05, 0.05);
  }, 0.6),
  /** A burrower (or a guardian) bursts up through the floor: a crack, debris, dust. */
  'mob.burst': def(0.85, 0.35, 3, 1.2, (v) => {
    const t = v.t;
    thud(v, t, 110, 40, 0.7, 0.35);
    noiseBurst(v, t, 'brown', 'lowpass', 900, 0.8, 0.5, 0.3);
    for (let k = 0; k < 8; k++) noiseBurst(v, t + 0.03 + k * v.rand(0.03, 0.08), 'white', 'bandpass', v.rand(800, 2200), 1.3, v.rand(0.08, 0.18), 0.04);
  }, 0.15),
  /** A slam lands, a dropper hits the floor: a heavy stomp and loose stones. */
  'mob.stomp': def(0.9, 0.35, 3, 1.2, (v) => {
    const t = v.t;
    thud(v, t, 95 * v.vary(0.05), 34, 0.85, 0.45);
    noiseBurst(v, t, 'brown', 'lowpass', 600, 0.8, 0.4, 0.25);
    for (let k = 0; k < 6; k++) noiseBurst(v, t + 0.06 + k * v.rand(0.04, 0.1), 'white', 'bandpass', v.rand(700, 1700), 1.2, v.rand(0.06, 0.14), 0.05);
  }, 0.1),
  /** A charger into the rock (dazed), a dropper landing: a dull thud. */
  'mob.thud': def(0.8, 0.25, 3, 0.7, (v) => {
    const t = v.t;
    thud(v, t, 150 * v.vary(0.06), 52, 0.6, 0.2);
    noiseBurst(v, t, 'pink', 'lowpass', 1100, 0.8, 0.3, 0.08);
  }, 0.08),
  /** An exploder lights: a sizzling fuse and a whistle rising to the burst. */
  'mob.fuse': def(0.6, 0.25, 3, 1.2, (v) => {
    const t = v.t;
    const f = swellNoise(v, t, 'white', 'highpass', 3800, 0.8, 0.14, 0.05, 0.85, 0.15);
    v.lfo(f.frequency, 23, 900, t, t + 1.05);
    for (let k = 0; k < 10; k++) noiseBurst(v, t + k * v.rand(0.06, 0.11), 'white', 'bandpass', v.rand(3000, 6000), 2, 0.08, 0.012);
    glide(v, t + 0.2, 'triangle', 520, 1250, 0.85, 0.06, 0.3);
  }, 0.3),
  /** A lit exploder bursts: a deep boom and crackle (its circle was marked). */
  'mob.boom': def(0.95, 0.5, 4, 1.6, (v) => {
    const t = v.t;
    thud(v, t, 130, 34, 0.95, 0.55);
    noiseBurst(v, t, 'brown', 'lowpass', 1400, 0.8, 0.7, 0.45);
    noiseBurst(v, t, 'white', 'lowpass', 4200, 0.8, 0.25, 0.12);
    for (let k = 0; k < 7; k++) noiseBurst(v, t + 0.08 + k * v.rand(0.05, 0.12), 'white', 'bandpass', v.rand(1200, 3200), 1.4, v.rand(0.05, 0.12), 0.03);
  }, 0.12),
  /** An unlit exploder struck down: a small wet pop. */
  'mob.pop': def(0.6, 0.2, 2, 0.5, (v) => {
    const t = v.t;
    glide(v, t, 'sine', 420 * v.vary(0.08), 120, 0.09, 0.3, 0.002);
    noiseBurst(v, t, 'pink', 'bandpass', 1500, 1.4, 0.3, 0.07);
  }, 0.05),
  // ---- Guardians (heard across the arena: big, slow, readable).
  /** A guardian winds up (most patterns) or wakes: a vast growl over a sub thud. */
  'guardian.roar': def(0.95, 0.6, 4, 2.0, (v, p) => {
    const t = v.t;
    const k = (p.pitch ?? 1) * v.vary(0.04);
    thud(v, t, 70 * k, 30, 0.55, 0.5);
    for (const [f, a] of [[52, 0.32], [78, 0.18]] as const) {
      const src = v.osc('sawtooth', f * k, t, t + 1.7);
      src.frequency.setValueAtTime(f * k * 0.9, t);
      src.frequency.linearRampToValueAtTime(f * k * 1.25, t + 0.8);
      src.frequency.linearRampToValueAtTime(f * k * 0.85, t + 1.6);
      const env = v.swell(t + 0.05, 0.25, a, 0.7, 0.7);
      src.connect(v.filter('lowpass', 520 * k, 2.2)).connect(env).connect(v.out);
      v.lfo(env.gain, 14, a * 0.35, t, t + 1.7, 'square');
    }
    const f = swellNoise(v, t, 'brown', 'bandpass', 360, 1.2, 0.35, 0.3, 0.6, 0.8);
    f.frequency.setValueAtTime(260, t);
    f.frequency.linearRampToValueAtTime(520, t + 0.8);
  }, 0.6),
  /** A guardian calls its brood: a wavering, rising howl answered from the dark. */
  'guardian.call': def(0.85, 0.7, 4, 1.8, (v) => {
    const t = v.t;
    for (const [f0, f1, a] of [[170, 380, 0.2], [255, 570, 0.08]] as const) {
      const o = v.osc('triangle', f0, t, t + 1.4);
      o.frequency.setValueAtTime(f0, t);
      o.frequency.exponentialRampToValueAtTime(f1, t + 1.0);
      o.frequency.exponentialRampToValueAtTime(f1 * 0.8, t + 1.35);
      o.connect(v.swell(t, 0.2, a, 0.6, 0.55)).connect(v.out);
      v.lfo(o.frequency, 6, f0 * 0.05, t, t + 1.4);
    }
    swellNoise(v, t + 0.2, 'white', 'bandpass', 1400, 2, 0.1, 0.4, 0.4, 0.6);
    for (let k = 0; k < 3; k++) noiseBurst(v, t + 0.9 + k * v.rand(0.12, 0.25), 'white', 'bandpass', v.rand(2600, 4200), 6, 0.08, 0.02);
  }, 0.8),
  /** A shockwave leaves a guardian: a deep boom and the rumble of the rolling ring. */
  'guardian.wave': def(0.95, 0.6, 4, 1.8, (v) => {
    const t = v.t;
    thud(v, t, 82, 30, 0.9, 0.6);
    const r = swellNoise(v, t, 'brown', 'lowpass', 220, 0.9, 0.45, 0.1, 0.6, 0.9);
    r.frequency.setValueAtTime(320, t);
    r.frequency.exponentialRampToValueAtTime(120, t + 1.4);
    const w = swellNoise(v, t, 'pink', 'bandpass', 700, 1.2, 0.18, 0.05, 0.3, 0.6);
    w.frequency.setValueAtTime(1600, t);
    w.frequency.exponentialRampToValueAtTime(380, t + 0.9);
  }, 0.4),
  /** A guardian snuffs the light: a long breath drawn in and the lantern's gutter. */
  'guardian.snuff': def(0.85, 0.7, 4, 2.0, (v) => {
    const t = v.t;
    const f = swellNoise(v, t, 'white', 'bandpass', 1800, 2.5, 0.3, 0.7, 0.3, 0.8);
    f.frequency.setValueAtTime(3200, t);
    f.frequency.exponentialRampToValueAtTime(280, t + 1.6);
    glide(v, t + 0.2, 'sine', 220, 52, 1.5, 0.22, 0.2);
    for (let k = 0; k < 5; k++) noiseBurst(v, t + 0.9 + k * v.rand(0.06, 0.14), 'pink', 'bandpass', v.rand(500, 900), 2, 0.1, 0.05);
  }, 1),
  /** A guardian's new phase: a roar breaking into a rising shimmer (faster now). */
  'guardian.phase': def(0.95, 0.65, 4, 2.0, (v) => {
    const t = v.t;
    thud(v, t, 90, 34, 0.7, 0.5);
    const src = v.osc('sawtooth', 60, t, t + 1.3);
    src.frequency.setValueAtTime(58, t);
    src.frequency.exponentialRampToValueAtTime(120, t + 1.1);
    src.connect(v.filter('lowpass', 700, 2)).connect(v.swell(t, 0.15, 0.3, 0.5, 0.6)).connect(v.out);
    glide(v, t + 0.3, 'sine', 330, 990, 1.2, 0.1, 0.3);
    const f = swellNoise(v, t + 0.3, 'white', 'bandpass', 2000, 3, 0.12, 0.5, 0.3, 0.6);
    f.frequency.setValueAtTime(1200, t + 0.3);
    f.frequency.exponentialRampToValueAtTime(5200, t + 1.3);
  }, 1),
  /** A guardian falls: a long falling groan, its body coming down, then its shard rings out. */
  'guardian.fall': def(1.0, 0.75, 4, 4.0, (v) => {
    const t = v.t;
    const src = v.osc('sawtooth', 120, t, t + 1.8);
    src.frequency.setValueAtTime(130, t);
    src.frequency.exponentialRampToValueAtTime(36, t + 1.7);
    src.connect(v.filter('lowpass', 480, 1.6)).connect(v.swell(t, 0.1, 0.32, 0.5, 1.2)).connect(v.out);
    thud(v, t + 1.1, 80, 28, 0.95, 0.8);
    swellNoise(v, t + 1.1, 'brown', 'lowpass', 300, 0.8, 0.55, 0.05, 0.6, 1.6);
    for (let k = 0; k < 9; k++) noiseBurst(v, t + 1.15 + v.rand(0, 1.4), 'white', 'bandpass', v.rand(600, 1800), 1.2, v.rand(0.08, 0.22), 0.06);
    // The Heart Shard's ring.
    [987.8, 1318.5, 1975.5].forEach((f, i) => bell(v, t + 2.3 + i * 0.12, f, 0.1, 1.6));
  }, 2),
  // A guardian's wind-ups, one voice per pattern (learnt by ear: the next blow is known before it is
  // seen). The summon calls ('guardian.call'), the volley hisses ('mob.hiss'), the burrow rumbles.
  /** Slam: a deep creak rising as the weight is lifted, a grinding band climbing under it (the stomp lands after). */
  'guardian.tell.slam': def(0.9, 0.5, 4, 1.4, (v, p) => {
    const t = v.t;
    const k = (p.pitch ?? 1) * v.vary(0.04);
    const src = v.osc('sawtooth', 38 * k, t, t + 1.25);
    src.frequency.setValueAtTime(38 * k, t);
    src.frequency.exponentialRampToValueAtTime(72 * k, t + 1.1);
    src.connect(v.filter('lowpass', 420, 2.4)).connect(v.swell(t, 0.5, 0.34, 0.5, 0.15)).connect(v.out);
    const g = swellNoise(v, t, 'brown', 'bandpass', 220, 1.6, 0.26, 0.6, 0.4, 0.12);
    g.frequency.setValueAtTime(200, t);
    g.frequency.exponentialRampToValueAtTime(760, t + 1.1);
    for (let i = 0; i < 4; i++) noiseBurst(v, t + 0.2 + i * v.rand(0.18, 0.26), 'pink', 'bandpass', v.rand(300, 520), 3, 0.12, 0.08);
  }, 0.6),
  /** Shockwave: a hum building in pitch and tremble, a pulse as it breaks ("jump"). */
  'guardian.tell.ring': def(0.85, 0.55, 4, 1.3, (v) => {
    const t = v.t;
    const o = v.osc('sine', 110, t, t + 1.1);
    o.frequency.setValueAtTime(96, t);
    o.frequency.exponentialRampToValueAtTime(230, t + 0.95);
    const env = v.swell(t, 0.7, 0.3, 0.2, 0.15);
    o.connect(env).connect(v.out);
    v.lfo(env.gain, 6, 0.1, t, t + 1.05, 'triangle');
    const hi = v.osc('triangle', 880, t + 0.3, t + 1.05);
    hi.frequency.setValueAtTime(700, t + 0.3);
    hi.frequency.exponentialRampToValueAtTime(1760, t + 0.95);
    hi.connect(v.swell(t + 0.3, 0.5, 0.05, 0.1, 0.1)).connect(v.out);
    thud(v, t + 0.95, 90, 40, 0.5, 0.25);
  }, 0.5),
  /** Charge: two scrapes of a hoof (or a claw) on rock, a snort, a low growl: it is coming down the lane. */
  'guardian.tell.charge': def(0.85, 0.35, 4, 1.2, (v, p) => {
    const t = v.t;
    const k = (p.pitch ?? 1) * v.vary(0.05);
    for (const at of [0.04, 0.38]) {
      const f = swellNoise(v, t + at, 'pink', 'lowpass', 700, 0.9, 0.3, 0.02, 0.1, 0.12);
      f.frequency.setValueAtTime(900, t + at);
      f.frequency.exponentialRampToValueAtTime(260, t + at + 0.22);
    }
    const sn = swellNoise(v, t + 0.68, 'white', 'bandpass', 900 * k, 1.4, 0.24, 0.03, 0.06, 0.16);
    sn.frequency.setValueAtTime(1100 * k, t + 0.68);
    sn.frequency.exponentialRampToValueAtTime(500 * k, t + 0.9);
    const g = v.osc('sawtooth', 58 * k, t + 0.1, t + 1.0);
    g.connect(v.filter('lowpass', 380, 2)).connect(v.swell(t + 0.1, 0.4, 0.2, 0.3, 0.2)).connect(v.out);
  }, 0.5),
  /** Eruptions: a rumble rolling under the floor toward the listener, cracks running ahead of it. */
  'guardian.tell.line': def(0.85, 0.5, 4, 1.3, (v) => {
    const t = v.t;
    const r = swellNoise(v, t, 'brown', 'lowpass', 120, 0.8, 0.5, 0.75, 0.15, 0.25);
    r.frequency.setValueAtTime(90, t);
    r.frequency.exponentialRampToValueAtTime(320, t + 0.95);
    // The grinding of the floor about to split (the mids carry it on a phone).
    const m = swellNoise(v, t + 0.1, 'pink', 'bandpass', 300, 1.4, 0.55, 0.6, 0.15, 0.2);
    m.frequency.setValueAtTime(240, t + 0.1);
    m.frequency.exponentialRampToValueAtTime(520, t + 0.95);
    for (let i = 0; i < 7; i++) noiseBurst(v, t + 0.15 + i * 0.12 + v.rand(0, 0.04), 'white', 'bandpass', v.rand(1600, 2600), 4, 0.12 + i * 0.015, 0.035);
    thud(v, t + 0.02, 55, 32, 0.35, 0.4);
  }, 0.5),
  /** Dive: a rising, wavering screech as it climbs and marks its spot ("dash"). */
  'guardian.tell.dive': def(0.75, 0.55, 4, 1.2, (v, p) => {
    const t = v.t;
    const k = (p.pitch ?? 1) * v.vary(0.05);
    const o = v.osc('sawtooth', 320 * k, t, t + 0.95);
    o.frequency.setValueAtTime(300 * k, t);
    o.frequency.exponentialRampToValueAtTime(840 * k, t + 0.85);
    v.lfo(o.frequency, 9, 22 * k, t, t + 0.95);
    o.connect(v.filter('bandpass', 1200 * k, 2.2)).connect(v.swell(t, 0.5, 0.16, 0.25, 0.2)).connect(v.out);
    swellNoise(v, t + 0.2, 'white', 'highpass', 3000, 0.8, 0.06, 0.4, 0.2, 0.2);
  }, 0.5),
  /**
   * A guardian's guard opens (after an attack): the tell to strike. A heavy exhale with a clank of
   * plates parting, then two rising chimes in a bright fifth ("now!"), never shrill.
   */
  'guardian.open': def(0.85, 0.45, 4, 1.4, (v) => {
    const t = v.t;
    const f = swellNoise(v, t, 'pink', 'lowpass', 900, 0.8, 0.32, 0.06, 0.18, 0.55);
    f.frequency.setValueAtTime(1300, t);
    f.frequency.exponentialRampToValueAtTime(260, t + 0.7);
    thud(v, t, 140 * v.vary(0.04), 60, 0.35, 0.22);
    noiseBurst(v, t + 0.02, 'white', 'bandpass', 2400, 3, 0.12, 0.05);
    bell(v, t + 0.12, 659.3, 0.11, 0.9);
    bell(v, t + 0.3, 987.8, 0.12, 1.0);
  }, 0.4),
  /**
   * The Dark Heart's beat (lub-dub), heard through the chamber: two deep, soft-edged thumps and a
   * low swell between them. It quickens with each phase (the sim sets the tempo).
   */
  'guardian.heartbeat': def(0.9, 0.55, 3, 1.0, (v) => {
    const t = v.t;
    // The deep body of each thump (felt on headphones) and its knock in the mids (heard on a phone).
    for (const [at, f, a] of [[0, 62, 0.75], [0.19, 54, 0.55]] as const) {
      thud(v, t + at, f, f * 0.55, a, 0.34);
      thud(v, t + at, 170, 95, a * 0.95, 0.13);
      noiseBurst(v, t + at, 'pink', 'bandpass', 380, 1.1, a * 0.45, 0.08);
    }
    swellNoise(v, t, 'brown', 'lowpass', 160, 0.7, 0.3, 0.02, 0.05, 0.3);
    const o = v.osc('sine', 41, t, t + 0.8);
    o.connect(v.swell(t + 0.02, 0.12, 0.16, 0.2, 0.4)).connect(v.out);
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
