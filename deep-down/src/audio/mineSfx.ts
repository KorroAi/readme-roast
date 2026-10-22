import { bell, burst, glide, grit, partials, sound, swell, thump, type SoundDef, type SoundParams } from './dsp';
import type { Voice } from './synth';

/**
 * Round 3's mining materials (AUDIO): the biome blocks whose rock is not plain stone, metal, crystal,
 * wood, soil or the builders' stone. Ice cracks crisply, obsidian glass rings sharp and dark, mushroom
 * caps give like sponge, bog mud slaps and sucks, snow crunches, glowing vines are fibres torn, amber
 * resin knocks warm. eventMap.ts says which block mines as which (MINE_SOUND); the hits climb a little
 * in pitch and brightness as the block weakens (`progress`), like the round-1 materials.
 *
 * Phone-first: every material's identity sits between 300 Hz and 5 kHz; a low body under it for
 * headphones.
 */

/** The hit's variation with the block's progress (higher and brighter as it gives). */
function shape(v: Voice, p: SoundParams): { pitch: number; bright: number } {
  const pr = Math.max(0, Math.min(1, p.progress ?? 0));
  return { pitch: v.vary(0.06) * (1 + 0.12 * pr), bright: v.vary(0.15) * (1 + 0.45 * pr) };
}

const ICE = { r: [1, 2.26, 3.9], a: [0.2, 0.1, 0.05], d: [0.32, 0.16, 0.08] };
const OBSIDIAN = { r: [1, 2.71, 4.6, 6.9], a: [0.2, 0.12, 0.06, 0.03], d: [0.26, 0.14, 0.07, 0.04] };

export type MineKind = 'ice' | 'glass' | 'fungus' | 'mud' | 'snow' | 'vine' | 'resin';
export const MINE_KINDS: readonly MineKind[] = ['ice', 'glass', 'fungus', 'mud', 'snow', 'vine', 'resin'];

export const MINE_SFX = {
  // ---- Ice: a crisp crack over a glassy ring, colder and lower than a gem's.
  'hit.ice': sound('sfx', 0.75, 0.3, 2, 0.6, (v, p) => {
    const { pitch, bright } = shape(v, p);
    const t = v.t;
    burst(v, t, 'white', 'highpass', 2800 * bright, 0.7, 0.45, 0.025);
    thump(v, t, 210 * pitch, 130 * pitch, 0.35, 0.06, 'triangle');
    partials(v, t, 1500 * pitch, ICE.r, ICE.a, ICE.d, 1);
    burst(v, t + 0.01, 'pink', 'bandpass', 1900 * bright, 2, 0.12, 0.04);
  }, 0.04),
  'break.ice': sound('sfx', 0.8, 0.45, 2, 1.4, (v) => {
    const t = v.t;
    burst(v, t, 'white', 'highpass', 2400, 0.7, 0.55, 0.06);
    thump(v, t, 180, 90, 0.5, 0.14);
    grit(v, t, 0.45, 'highpass', 2600, 0.8, 0.35, 1.4);
    for (let i = 0; i < 8; i++) {
      const at = t + 0.04 + v.rand(0, 0.5);
      partials(v, at, v.rand(1600, 3200), ICE.r, ICE.a, ICE.d, v.rand(0.3, 0.6));
    }
  }, 0.04),

  // ---- Obsidian glass: a hard tick and a short, dark, sharp ring; it breaks like a pane.
  'hit.glass': sound('sfx', 0.75, 0.3, 2, 0.6, (v, p) => {
    const { pitch, bright } = shape(v, p);
    const t = v.t;
    burst(v, t, 'white', 'highpass', 4200 * bright, 0.7, 0.3, 0.012);
    thump(v, t, 170 * pitch, 95 * pitch, 0.45, 0.07);
    partials(v, t, 1250 * pitch, OBSIDIAN.r, OBSIDIAN.a, OBSIDIAN.d, 1);
    burst(v, t, 'pink', 'bandpass', 1400 * bright, 1.6, 0.18, 0.03);
  }, 0.04),
  'break.glass': sound('sfx', 0.8, 0.45, 2, 1.4, (v) => {
    const t = v.t;
    burst(v, t, 'white', 'highpass', 3600, 0.7, 0.6, 0.09);
    thump(v, t, 150, 70, 0.55, 0.16);
    grit(v, t, 0.4, 'highpass', 3400, 0.8, 0.4, 1.6);
    for (let i = 0; i < 9; i++) {
      const at = t + 0.02 + v.rand(0, 0.45);
      partials(v, at, v.rand(1800, 4200), OBSIDIAN.r, OBSIDIAN.a, OBSIDIAN.d, v.rand(0.25, 0.55));
    }
  }, 0.04),

  // ---- Mushroom flesh: a soft spongy give, a puff of air; it tears and spores drift.
  'hit.fungus': sound('sfx', 0.75, 0.15, 2, 0.4, (v, p) => {
    const { pitch, bright } = shape(v, p);
    const t = v.t;
    thump(v, t, 175 * pitch, 115 * pitch, 0.6, 0.08, 'triangle');
    thump(v, t, 420 * pitch, 300 * pitch, 0.42, 0.05, 'triangle');
    burst(v, t, 'pink', 'bandpass', 850 * bright, 1.1, 1.05, 0.07, 0.004);
    burst(v, t + 0.01, 'pink', 'bandpass', 1600 * bright, 1.6, 0.32, 0.05);
  }, 0.04),
  'break.fungus': sound('sfx', 0.8, 0.3, 2, 1.2, (v) => {
    const t = v.t;
    thump(v, t, 140, 80, 0.6, 0.14, 'triangle');
    thump(v, t, 380, 260, 0.35, 0.08, 'triangle');
    const tear = swell(v, t, 'pink', 'bandpass', 900, 1.4, 0.75, 0.02, 0.1, 0.25);
    tear.frequency.setValueAtTime(700, t);
    tear.frequency.exponentialRampToValueAtTime(1600, t + 0.3);
    const f = swell(v, t + 0.15, 'pink', 'bandpass', 1200, 1.2, 0.12, 0.15, 0.1, 0.5);
    f.frequency.exponentialRampToValueAtTime(2800, t + 0.7);
    for (let i = 0; i < 4; i++) {
      const at = t + 0.25 + i * v.rand(0.08, 0.16);
      v.osc('sine', v.rand(2600, 3800), at, at + 0.3).connect(v.perc(at, 0.002, 0.03, 0.25)).connect(v.out);
    }
  }, 0.04),

  // ---- Bog mud: a wet slap and its suck; it gives with a heavy squelch and drops.
  'hit.mud': sound('sfx', 0.75, 0.1, 2, 0.4, (v, p) => {
    const { pitch, bright } = shape(v, p);
    const t = v.t;
    burst(v, t, 'pink', 'bandpass', 650 * bright, 0.9, 0.7, 0.07, 0.004);
    thump(v, t, 120 * pitch, 70 * pitch, 0.4, 0.08);
    glide(v, t + 0.03, 'sine', 360 * pitch, 760 * pitch, 0.06, 0.16, 0.002);
    burst(v, t + 0.05, 'white', 'bandpass', 1300, 2, 0.16, 0.05);
  }, 0.04),
  'break.mud': sound('sfx', 0.8, 0.2, 2, 1.0, (v) => {
    const t = v.t;
    thump(v, t, 95, 45, 0.6, 0.18);
    burst(v, t, 'pink', 'bandpass', 620, 0.8, 0.85, 0.22, 0.01);
    glide(v, t + 0.08, 'sine', 300, 820, 0.1, 0.2, 0.003);
    for (let i = 0; i < 3; i++) {
      const at = t + 0.25 + i * v.rand(0.08, 0.15);
      glide(v, at, 'sine', v.rand(500, 800), v.rand(1000, 1400), 0.04, 0.06, 0.001);
    }
  }, 0.04),

  // ---- Snow: a soft crunch; it slumps.
  'hit.snow': sound('sfx', 0.75, 0.1, 2, 0.4, (v, p) => {
    const { pitch, bright } = shape(v, p);
    const t = v.t;
    grit(v, t, 0.12, 'bandpass', 2100 * bright, 0.9, 0.75, 1.2, 0.05);
    grit(v, t, 0.1, 'bandpass', 1100 * bright, 1, 0.35, 1, 0.1);
    thump(v, t, 110 * pitch, 70 * pitch, 0.3, 0.06);
    burst(v, t, 'white', 'highpass', 3600, 0, 0.14, 0.03);
  }, 0.04),
  'break.snow': sound('sfx', 0.8, 0.2, 2, 0.9, (v) => {
    const t = v.t;
    grit(v, t, 0.45, 'bandpass', 1800, 0.8, 0.55, 1.1);
    burst(v, t, 'pink', 'lowpass', 900, 0, 0.4, 0.2, 0.01);
    thump(v, t, 95, 55, 0.4, 0.12);
  }, 0.04),

  // ---- Glowing vines: fibres pulled taut; they tear with a rip.
  'hit.vine': sound('sfx', 0.75, 0.15, 2, 0.4, (v, p) => {
    const { pitch, bright } = shape(v, p);
    const t = v.t;
    thump(v, t, 190 * pitch, 140 * pitch, 0.5, 0.06, 'triangle');
    thump(v, t, 480 * pitch, 360 * pitch, 0.42, 0.045, 'triangle');
    const f = burst(v, t, 'pink', 'bandpass', 1150 * bright, 1.6, 1.4, 0.075);
    f.frequency.exponentialRampToValueAtTime(1500 * bright, t + 0.07);
    burst(v, t + 0.012, 'white', 'bandpass', 2600, 2.5, 0.22, 0.03);
  }, 0.04),
  'break.vine': sound('sfx', 0.8, 0.25, 2, 1.0, (v) => {
    const t = v.t;
    const am = v.gain(0.55);
    swell(v, t, 'pink', 'bandpass', 1300, 1.2, 0.95, 0.02, 0.18, 0.18, am);
    am.connect(v.out);
    v.lfo(am.gain, 38, 0.45, t, t + 0.45, 'square');
    thump(v, t, 160, 100, 0.4, 0.1, 'triangle');
    thump(v, t, 420, 300, 0.25, 0.05, 'triangle');
    bell(v, t + 0.08, 1760, 0.03, 0.5);
  }, 0.04),

  // ---- Amber resin: a warm, dull knock with a honeyed overtone; it cracks and chimes softly.
  'hit.resin': sound('sfx', 0.75, 0.2, 2, 0.5, (v, p) => {
    const { pitch, bright } = shape(v, p);
    const t = v.t;
    thump(v, t, 240 * pitch, 170 * pitch, 0.5, 0.08, 'triangle');
    partials(v, t, 880 * pitch, [1, 2.4, 3.7], [0.34, 0.13, 0.05], [0.3, 0.13, 0.06], 1);
    burst(v, t, 'pink', 'bandpass', 1300 * bright, 1.6, 0.45, 0.04);
  }, 0.04),
  'break.resin': sound('sfx', 0.8, 0.35, 2, 1.2, (v) => {
    const t = v.t;
    thump(v, t, 200, 110, 0.55, 0.14, 'triangle');
    grit(v, t, 0.35, 'bandpass', 1500, 1, 0.6, 0.95);
    for (let i = 0; i < 4; i++) bell(v, t + 0.05 + i * v.rand(0.05, 0.1), [880, 1108.7, 1318.5, 1760][i], 0.1, 0.7);
  }, 0.04),
} satisfies Record<`${'hit' | 'break'}.${MineKind}`, SoundDef>;
