import { bell, def, glide, noiseBurst, swellNoise, thud, type MobSfxDef } from './mobSfx';

/**
 * The loop's sounds (round 3, LOOP): the sonar pulse, the dash, the vein combo, placing, using a
 * consumable, equipping, a recipe unlocked, quest steps and rewards, the Heart Shard, the gate, the
 * Heart, a biome's arrival, orders, the hazards' warnings and the tutorial's nudge. Synthesized like
 * every other sound and registered into sfx.ts SFX; eventMap.ts says which event plays which.
 * Audio is unverified by ear (BRIEF §4): levels are set against the existing UI and pickup voices.
 */
export const LOOP_SFX = {
  /** Sonar: a soft ping that blooms outward, with a faint return a beat later. */
  'loop.sonar': def(0.55, 0.7, 3, 2.6, (v) => {
    const t = v.t;
    bell(v, t, 1046.5, 0.22, 1.2);
    glide(v, t, 'sine', 1568, 784, 0.9, 0.12);
    bell(v, t + 0.55, 1046.5 * 0.5, 0.07, 1.4);
    swellNoise(v, t, 'pink', 'bandpass', 2400, 6, 0.04, 0.05, 0.2, 0.8);
  }, 0.4),
  /** Dash: a quick air whoosh. */
  'loop.dash': def(0.5, 0.15, 2, 0.5, (v) => {
    const f = swellNoise(v, v.t, 'pink', 'bandpass', 700, 1.4, 0.5, 0.02, 0.06, 0.25);
    f.frequency.setValueAtTime(500, v.t);
    f.frequency.exponentialRampToValueAtTime(1800, v.t + 0.2);
  }, 0.15),
  /** Vein combo: a tick that climbs with each link (pitch from the event). */
  'loop.combo': def(0.32, 0.1, 2, 0.4, (v, p) => {
    const k = Math.max(1, Math.min(5, Math.round((p.intensity ?? 0.2) * 5)));
    bell(v, v.t, 660 * Math.pow(1.122, k - 1), 0.12, 0.25);
  }, 0.04),
  /** Placing a block, a ladder or a rope: a wooden knock. */
  'loop.place': def(0.6, 0.2, 2, 0.5, (v) => {
    thud(v, v.t, 220, 90, 0.4, 0.18);
    noiseBurst(v, v.t, 'pink', 'bandpass', 1200, 1.5, 0.18, 0.06);
  }, 0.06),
  /** A torch set on the wall: the knock, then the flame catching. */
  'loop.torch': def(0.6, 0.25, 2, 1.2, (v) => {
    thud(v, v.t, 200, 90, 0.3, 0.15);
    const f = swellNoise(v, v.t + 0.08, 'pink', 'highpass', 1500, 0.7, 0.22, 0.12, 0.15, 0.6);
    f.frequency.setValueAtTime(900, v.t + 0.08);
  }, 0.06),
  /** Eating or a bandage: two soft rising notes. */
  'loop.heal': def(0.45, 0.25, 3, 0.9, (v) => {
    bell(v, v.t, 523.25, 0.14, 0.5);
    bell(v, v.t + 0.12, 783.99, 0.12, 0.6);
  }, 0.2),
  /** A potion: a cork, a gulp, and a shimmer. */
  'loop.potion': def(0.5, 0.3, 3, 1.1, (v) => {
    noiseBurst(v, v.t, 'white', 'bandpass', 2600, 4, 0.18, 0.03);
    thud(v, v.t + 0.12, 180, 120, 0.25, 0.2);
    glide(v, v.t + 0.25, 'sine', 880, 1760, 0.5, 0.08);
  }, 0.2),
  /** Equipping gear: a buckle's clink. */
  'loop.equip': def(0.45, 0.2, 3, 0.6, (v) => {
    bell(v, v.t, 1318.5, 0.1, 0.3);
    noiseBurst(v, v.t + 0.05, 'white', 'highpass', 4000, 0.7, 0.08, 0.05);
  }, 0.1),
  /** A new recipe: a bright two-note lift. */
  'loop.unlock': def(0.4, 0.35, 3, 1.0, (v) => {
    bell(v, v.t, 987.77, 0.1, 0.5);
    bell(v, v.t + 0.09, 1318.5, 0.09, 0.6);
  }, 0.5),
  /** A quest step: one warm chime. */
  'loop.quest': def(0.45, 0.45, 3, 1.6, (v) => {
    bell(v, v.t, 587.33, 0.14, 1.2);
    bell(v, v.t + 0.06, 880, 0.08, 1.0);
  }, 0.8),
  /** A Heart Shard: a low pulse and a rising triad, heard over everything. */
  'loop.shard': def(0.7, 0.6, 4, 3.2, (v) => {
    const t = v.t;
    thud(v, t, 70, 45, 0.5, 0.9);
    bell(v, t + 0.1, 440, 0.16, 1.6);
    bell(v, t + 0.32, 554.37, 0.14, 1.6);
    bell(v, t + 0.54, 659.25, 0.16, 2.2);
    swellNoise(v, t, 'pink', 'bandpass', 1800, 3, 0.05, 0.4, 0.6, 1.6);
  }, 2),
  /** The gate opening: stone grinding and a deep bell. */
  'loop.gate': def(0.75, 0.6, 4, 4.0, (v) => {
    const t = v.t;
    const f = swellNoise(v, t, 'brown', 'lowpass', 260, 0.9, 0.6, 0.8, 1.4, 1.4);
    v.lfo(f.frequency, 6, 60, t, t + 3.5);
    bell(v, t + 0.4, 146.83, 0.22, 3.2);
  }, 3),
  /** The Heart relit: a long swell and a major chord. */
  'loop.heart': def(0.8, 0.7, 4, 6.0, (v) => {
    const t = v.t;
    swellNoise(v, t, 'pink', 'lowpass', 900, 0.8, 0.25, 1.5, 2, 2.4);
    for (const [f, d] of [[293.66, 0], [369.99, 0.25], [440, 0.5], [587.33, 0.8]] as const) bell(v, t + d, f, 0.14, 4.5);
  }, 5),
  /** A new biome: an open fifth that hangs in the air. */
  'loop.arrival': def(0.5, 0.7, 3, 3.5, (v) => {
    bell(v, v.t, 392, 0.1, 2.8);
    bell(v, v.t + 0.15, 587.33, 0.08, 2.8);
  }, 3),
  /** An order paid: coins. */
  'loop.order': def(0.5, 0.25, 3, 1.0, (v) => {
    for (let k = 0; k < 4; k++) bell(v, v.t + k * 0.07, 1567.98 * v.vary(0.04), 0.07, 0.3);
  }, 0.5),
  /** The hazards' warnings as they start to hurt: a shiver (cold), a cough of gas, a hiss of heat, a heartbeat (the dark). */
  'loop.hazard.cold': def(0.5, 0.4, 3, 1.6, (v) => {
    const f = swellNoise(v, v.t, 'white', 'bandpass', 3200, 5, 0.14, 0.2, 0.4, 0.8);
    v.lfo(f.frequency, 9, 600, v.t, v.t + 1.4);
  }, 2),
  'loop.hazard.gas': def(0.55, 0.2, 3, 1.0, (v) => {
    noiseBurst(v, v.t, 'pink', 'bandpass', 600, 1.2, 0.35, 0.18);
    noiseBurst(v, v.t + 0.28, 'pink', 'bandpass', 520, 1.2, 0.25, 0.16);
  }, 2),
  'loop.hazard.heat': def(0.5, 0.2, 3, 1.4, (v) => {
    swellNoise(v, v.t, 'white', 'highpass', 5000, 0.7, 0.16, 0.1, 0.5, 0.7);
    thud(v, v.t, 60, 40, 0.3, 0.6);
  }, 2),
  'loop.hazard.dark': def(0.6, 0.3, 3, 1.6, (v) => {
    thud(v, v.t, 58, 42, 0.5, 0.25);
    thud(v, v.t + 0.32, 52, 40, 0.35, 0.25);
  }, 2),
  /** The tutorial moving on: a light tick. */
  'loop.tutorial': def(0.35, 0.2, 3, 0.5, (v) => bell(v, v.t, 1174.66, 0.08, 0.3), 0.3),
  /** A station or an outpost set down: a heavy knock and a little settling. */
  'loop.station': def(0.65, 0.3, 3, 1.2, (v) => {
    thud(v, v.t, 120, 60, 0.55, 0.35);
    noiseBurst(v, v.t + 0.05, 'brown', 'lowpass', 700, 0.8, 0.25, 0.3);
  }, 0.3),
} satisfies Record<string, MobSfxDef>;
