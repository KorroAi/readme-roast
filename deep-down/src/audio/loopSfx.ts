import { bell as bellTo } from './dsp';
import { bell, def, noiseBurst, swellNoise, thud, type MobSfxDef } from './mobSfx';

/**
 * The loop's sounds (round 3, LOOP; AUDIO's since the handover): the vein combo, a recipe unlocked,
 * the Heart Shard, the gate, the Heart, orders and the hazards' onsets. The sonar, the dash, placing,
 * consuming, equipping, quest steps, the arrival and the tutorial moved to actionSfx.ts (AUDIO),
 * rebuilt to read on a phone. eventMap.ts says which event plays which.
 */
export const LOOP_SFX = {
  /** Vein combo: a bright tick that climbs a pentatonic with each link (the count from the event). */
  'loop.combo': def(0.6, 0.12, 2, 0.5, (v, p) => {
    const k = Math.max(1, Math.min(5, Math.round((p.intensity ?? 0.2) * 5)));
    const f = 880 * Math.pow(2, [0, 2, 4, 7, 9][k - 1] / 12);
    bell(v, v.t, f, 0.16, 0.3);
    if (k >= 4) bell(v, v.t + 0.04, f * 1.5, 0.08, 0.3);
  }, 0.04),
  /** A new recipe: a bright two-note lift. */
  'loop.unlock': def(0.4, 0.35, 3, 1.0, (v) => {
    bell(v, v.t, 987.77, 0.1, 0.5);
    bell(v, v.t + 0.09, 1318.5, 0.09, 0.6);
  }, 0.5),
  /** A Heart Shard: a low pulse and a rising triad, heard over everything. */
  'loop.shard': def(0.7, 0.6, 4, 3.2, (v) => {
    const t = v.t;
    thud(v, t, 70, 45, 0.5, 0.9);
    bell(v, t + 0.1, 440, 0.16, 1.6);
    bell(v, t + 0.32, 554.37, 0.14, 1.6);
    bell(v, t + 0.54, 659.25, 0.16, 2.2);
    swellNoise(v, t, 'pink', 'bandpass', 1800, 3, 0.05, 0.4, 0.6, 1.6);
  }, 2),
  /** The gate opening: the seal's stone grinding (heard on a phone), chains, a deep bell, a boom. */
  'loop.gate': def(0.8, 0.6, 4, 4.4, (v) => {
    const t = v.t;
    const f = swellNoise(v, t, 'brown', 'lowpass', 500, 2, 0.55, 0.8, 1.4, 1.4);
    v.lfo(f.frequency, 6, 150, t, t + 3.5);
    const g = swellNoise(v, t, 'pink', 'bandpass', 650, 2.2, 0.2, 0.8, 1.4, 1.4);
    v.lfo(g.frequency, 4.5, 180, t, t + 3.5);
    bell(v, t + 0.4, 146.83, 0.22, 3.2);
    bell(v, t + 0.42, 293.7, 0.12, 2.6);
    thud(v, t + 2.6, 180, 70, 0.45, 0.5);
    noiseBurst(v, t + 2.6, 'pink', 'bandpass', 700, 1, 0.3, 0.3);
  }, 3),
  /**
   * The Heart relit, act I ('quest:heartLit'; VIS: the twelve shards kindle one by one round it, 0.24 s
   * apart, its core flushes rose and a rose ring runs out over the chamber): a crystal kindles with each
   * shard, climbing the Heart's chord over two octaves, over the core's warm breath and the ring's low
   * bloom; the Heart's own chord rings when the last is lit. Written in D (the AudioSystem moves it).
   */
  'loop.heart': def(0.8, 0.7, 4, 6.4, (v) => {
    const t = v.t;
    const climb = [440, 493.88, 587.33, 659.25, 739.99, 880, 987.77, 1174.66, 1318.51, 1479.98, 1760, 2349.32];
    climb.forEach((f, k) => bell(v, t + k * 0.24, f * v.vary(0.002), 0.085 - 0.0025 * k, 1.4 + 0.1 * k));
    swellNoise(v, t + 0.2, 'pink', 'lowpass', 900, 0.8, 0.2, 1.4, 1.4, 2.6);
    thud(v, t + 0.6, 98, 55, 0.32, 1.6);
    for (const [f, a] of [[146.83, 0.1], [293.66, 0.12], [369.99, 0.08], [440, 0.07]] as const) bell(v, t + 2.9, f, a, 3.2);
  }, 5),
  /**
   * The deep relit, act II ('quest:ending'; VIS: a gold flash, a ring of gold light sweeping the whole
   * stratum at 30 m/s with every glowing thing it passes flaring, the Heart's air turning gold by ~5 s,
   * a column of light rising from the floor to the roof): a warm bloom from below, the air brightening
   * in a long rising breath, the column's open fifth, and glints left and right as the ring lights the
   * deep, fewer and fainter as it goes. Written in D (it rings in the Heart's key).
   */
  'finale.relight': def(0.7, 0.85, 4, 9.5, (v) => {
    const t = v.t;
    thud(v, t + 0.05, 73.42, 55, 0.4, 2.4);
    const air = swellNoise(v, t + 0.3, 'pink', 'bandpass', 600, 0.9, 0.24, 2.2, 2.2, 3.6);
    air.frequency.setValueAtTime(500, t + 0.3);
    air.frequency.exponentialRampToValueAtTime(3200, t + 5);
    for (const [f, a] of [[146.83, 0.05], [220, 0.04], [293.66, 0.045], [440, 0.035], [587.33, 0.025]] as const) v.osc('sine', f, t + 1, t + 9).connect(v.swell(t + 1, 2.5, a, 2.5, 3)).connect(v.out);
    const glints = [587.33, 739.99, 880, 1174.66, 1479.98, 1760, 2349.32];
    for (let i = 0; i < 18; i++) {
      const at = t + 0.5 + Math.pow(i / 18, 1.6) * 7.5 + v.rand(0, 0.12);
      const side = v.ctx.createStereoPanner();
      side.pan.value = (i % 2 ? 1 : -1) * v.rand(0.3, 0.85);
      side.connect(v.out);
      bellTo(v, at, glints[Math.floor(v.rand(0, glints.length))], 0.12 * (1 - 0.6 * (i / 18)), 1.3, side);
    }
  }, 5),
  /** An order paid: coins. */
  'loop.order': def(0.5, 0.25, 3, 1.0, (v) => {
    for (let k = 0; k < 4; k++) bell(v, v.t + k * 0.07, 1567.98 * v.vary(0.04), 0.07, 0.3);
  }, 0.5),
  /**
   * The hazards' onset, as they start to hurt (round 3 AUDIO: rebuilt to be heard on a phone): an icy
   * shiver and a gust (cold), a cough in a hiss of gas, a blast of heat, the dark's heartbeat.
   */
  'loop.hazard.cold': def(0.7, 0.4, 3, 1.8, (v) => {
    const f = swellNoise(v, v.t, 'white', 'bandpass', 3000, 3, 0.22, 0.15, 0.4, 0.8);
    v.lfo(f.frequency, 9, 700, v.t, v.t + 1.4);
    const g = swellNoise(v, v.t, 'pink', 'bandpass', 700, 1.5, 0.3, 0.3, 0.3, 0.8);
    g.frequency.setValueAtTime(500, v.t);
    g.frequency.exponentialRampToValueAtTime(1300, v.t + 0.6);
  }, 2),
  'loop.hazard.gas': def(0.75, 0.25, 3, 1.4, (v) => {
    swellNoise(v, v.t, 'white', 'bandpass', 2600, 1.2, 0.14, 0.15, 0.3, 0.6);
    noiseBurst(v, v.t + 0.25, 'pink', 'bandpass', 650, 1.3, 0.5, 0.16);
    noiseBurst(v, v.t + 0.26, 'white', 'bandpass', 1500, 1.5, 0.22, 0.12);
    noiseBurst(v, v.t + 0.55, 'pink', 'bandpass', 600, 1.3, 0.35, 0.14);
  }, 2),
  'loop.hazard.heat': def(0.7, 0.25, 3, 1.4, (v) => {
    swellNoise(v, v.t, 'white', 'highpass', 4500, 0, 0.18, 0.1, 0.4, 0.6);
    swellNoise(v, v.t, 'pink', 'bandpass', 700, 1, 0.3, 0.1, 0.3, 0.6);
    thud(v, v.t, 260, 150, 0.35, 0.2);
  }, 2),
  'loop.hazard.dark': def(0.8, 0.35, 3, 1.6, (v) => {
    for (const [at, g] of [[0, 1], [0.2, 0.7], [0.55, 0.9], [0.75, 0.6]] as const) {
      thud(v, v.t + at, 85, 48, 0.35 * g, 0.18);
      thud(v, v.t + at, 300, 170, 0.32 * g, 0.09);
      noiseBurst(v, v.t + at, 'pink', 'bandpass', 520, 1.3, 0.22 * g, 0.05);
    }
  }, 2),
} satisfies Record<string, MobSfxDef>;
