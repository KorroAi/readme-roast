import * as THREE from 'three';
import { registerAtmosphere, type AtmospherePreset, type LightingRig } from './lighting';
import { DEFAULT_WATER, type WaterTint } from './water';

/**
 * Round 3 (VIS seam): each biome's look, and the smooth blend between them.
 *
 * A biome carries its own air (an atmosphere preset for its passages and a clearer `~open` twin for
 * its caverns: fog hue, the haze pooling in its ravines, the hued darks, the cool fill and the light
 * gain), a post grade (the lift of its darks, the gain of its highlights, its saturation), the colour
 * of its light pockets and its ambient effects. The explorer's lantern stays the warm amber in every
 * biome (warm safety vs. the biome's cold or strange air: ART_DIRECTION's pillar 2).
 *
 * Use (Game.ts VIS block, once per session): `const look = new BiomeLook(rig, post.params)`, then
 * every frame before `rig.updateAtmosphere`: `look.update(dt, x, y, z, biomeAt)`. `biomeAt` is
 * WORLD's StratumLayout.biomeAt; the look samples it on a ring around the explorer, so crossing a
 * region border fades over ~25 m and ~1 s instead of popping. `applyBiomeLook(id, blend)` forces a
 * biome (the Visual Lab, captures, a cut-scene) over the sampled one.
 */

/** The twelve biomes plus the Heart (the ids of config/biomes.ts BiomeId). */
export const LOOK_BIOMES = [
  'amberHollows',
  'mushroomForest',
  'rootGalleries',
  'floodedGrottoes',
  'crystalGeode',
  'haldenMines',
  'frostCaverns',
  'glowrootJungle',
  'sulphurBog',
  'sunkenCity',
  'magmaVeins',
  'obsidianAbyss',
  'heart',
] as const;
export type LookBiomeId = (typeof LOOK_BIOMES)[number];

/** Ambient effects a biome runs (game/effects: drips, spores, embers, snow, bubbles, motes). */
export type BiomeFx = 'drips' | 'dust' | 'spores' | 'fireflies' | 'mist' | 'snow' | 'embers' | 'bubbles' | 'motes' | 'ash' | 'runeMotes' | 'voidMotes' | 'heartMotes';

/** The hazard's visual (game/effects/HazardFx): cold breath and rim frost, gas haze, heat glow. */
export type HazardLook = 'none' | 'damp' | 'cold' | 'gas' | 'heat' | 'dark' | 'void';

export interface BiomeLookDef {
  /** The air of its passages. */
  atmosphere: AtmospherePreset;
  /** Its caverns: overrides on the passage air (clearer, a wider fill), blended by openness. */
  open: Partial<AtmospherePreset>;
  /** Post grade (display-linear): lift of the darks, gain of the highlights, saturation. */
  grade: { lift: [number, number, number]; gain: [number, number, number]; saturation: number };
  /** The colour of its light pockets and glowing things (linear rgb, 0..1). */
  light: [number, number, number];
  fx: readonly BiomeFx[];
  hazard: HazardLook;
}

/** A preset with the shared defaults (relative pools: random caves have no fixed floor). */
function air(p: Partial<AtmospherePreset> & Pick<AtmospherePreset, 'fog' | 'fogLow' | 'ambient' | 'open'>): AtmospherePreset {
  return {
    density: 0.04,
    poolLevel: -4,
    poolThickness: 5,
    poolDensity: 0.022,
    poolRelative: true,
    ambientGain: 0.6,
    openGain: 0.8,
    scatter: 0.12,
    bounce: 0.11,
    absorb: 0.7,
    exposure: 1.0,
    lightGain: 1.95,
    ...p,
  };
}

const CAVERN: Partial<AtmospherePreset> = { density: 0.022, openGain: 0.95, poolDensity: 0.026 };

/**
 * The looks. Hues: warm limestone amber (I-A), teal air with magenta pooling (I-B), green-gold earth
 * (II-A), cold blue water (II-B), cyan-violet crystal (III-A), rust-amber timber dust (III-B), pale
 * ice blue (IV-A), bioluminescent green (IV-B), sulphur yellow-green (V-A), blue halls with gold
 * highlights (V-B), smoky red over lava (VI-A), black-violet void (VI-B), and the Heart's rose-gold.
 * Darks are hued, never crushed; the lantern's pool stays amber on top of every one.
 */
export const BIOME_LOOKS: Record<LookBiomeId, BiomeLookDef> = {
  amberHollows: {
    // Warm limestone under warm lights, its shade a cool dusk grey: the lantern and the amber pockets
    // read warm against it (a monotone orange read as murk).
    atmosphere: air({ fog: 0x1e1a16, fogLow: 0x14120f, ambient: 0x16171a, open: 0x6e7076, density: 0.036, lightGain: 1.95, ambientGain: 0.75, openGain: 0.9 }),
    open: CAVERN,
    grade: { lift: [0.003, 0.0034, 0.0048], gain: [1.04, 1.0, 0.95], saturation: 1.06 },
    light: [1.0, 0.72, 0.4],
    fx: ['dust', 'drips'],
    hazard: 'none',
  },
  mushroomForest: {
    atmosphere: air({ fog: 0x10222a, fogLow: 0x24102c, ambient: 0x0e1a20, open: 0x5a8a94, density: 0.036, scatter: 0.18, lightGain: 2.0, poolDensity: 0.03 }),
    open: { ...CAVERN, density: 0.024 },
    grade: { lift: [0.0018, 0.0052, 0.0068], gain: [1.03, 0.97, 1.04], saturation: 1.18 },
    light: [0.62, 0.22, 0.72],
    fx: ['spores', 'drips'],
    hazard: 'none',
  },
  rootGalleries: {
    // Earth and old roots under green-gold light: the glow-worm ceilings and the glowroot pockets
    // carry it (lights brighter than the first draft's, and a warmer open fill: it read as a void).
    atmosphere: air({ fog: 0x1e2414, fogLow: 0x14170c, ambient: 0x1a2010, open: 0x8e9a66, density: 0.04, lightGain: 2.5, ambientGain: 0.78, openGain: 0.95 }),
    open: CAVERN,
    grade: { lift: [0.004, 0.0052, 0.0028], gain: [1.05, 1.03, 0.9], saturation: 1.06 },
    light: [0.62, 0.6, 0.22],
    fx: ['dust', 'fireflies'],
    hazard: 'damp',
  },
  floodedGrottoes: {
    // Cold blue water and stone, but never one blue: the grade keeps some warmth in the highlights
    // (the lantern's pool, the shore lamps) and the saturation down.
    atmosphere: air({ fog: 0x12243a, fogLow: 0x0a1a30, ambient: 0x101e30, open: 0x7090b0, density: 0.032, lightGain: 2.2, poolDensity: 0.03, scatter: 0.14 }),
    open: { ...CAVERN, density: 0.018 },
    grade: { lift: [0.0016, 0.0042, 0.0084], gain: [1.03, 1.0, 0.99], saturation: 1.0 },
    light: [0.2, 0.5, 0.82],
    fx: ['mist', 'drips'],
    hazard: 'damp',
  },
  crystalGeode: {
    // Lead 00:13: clear near air so the crystals pop (it read a little murky purple): a darker, more
    // neutral fill and a thinner haze behind them, the blue lift and the saturation eased.
    // Lead 01:17: the crystals pop: cooler, clearer air (slate blue, not violet; thinner, less
    // in-scatter), less placed light (the violet pockets as accents on a pale calcite floor, not a
    // wash: materials/strata.ts geodeFloor), the crystals' own glow raised instead.
    atmosphere: air({ fog: 0x141c2c, fogLow: 0x0e1a26, ambient: 0x0c1016, open: 0x52627a, density: 0.016, scatter: 0.07, lightGain: 1.9, exposure: 1.04 }),
    open: { ...CAVERN, density: 0.011 },
    grade: { lift: [0.003, 0.0035, 0.0044], gain: [1.03, 1.03, 1.03], saturation: 1.0 },
    light: [0.42, 0.45, 1.0],
    fx: ['motes', 'drips'],
    hazard: 'none',
  },
  haldenMines: {
    atmosphere: air({ fog: 0x221810, fogLow: 0x140e0a, ambient: 0x1a1410, open: 0x6e5a48, density: 0.046, lightGain: 1.85, scatter: 0.13 }),
    open: { ...CAVERN, density: 0.028 },
    grade: { lift: [0.0046, 0.003, 0.0016], gain: [1.08, 0.98, 0.86], saturation: 1.05 },
    light: [1.0, 0.66, 0.32],
    fx: ['dust', 'drips'],
    hazard: 'none',
  },
  frostCaverns: {
    atmosphere: air({ fog: 0x1a2a3e, fogLow: 0x22364c, ambient: 0x162438, open: 0x9ab8d4, density: 0.03, lightGain: 2.2, poolDensity: 0.032, openGain: 0.9 }),
    open: { ...CAVERN, density: 0.018, openGain: 1.05 },
    grade: { lift: [0.0028, 0.0058, 0.0102], gain: [0.96, 1.0, 1.06], saturation: 0.95 },
    light: [0.45, 0.72, 1.0],
    fx: ['snow'],
    hazard: 'cold',
  },
  glowrootJungle: {
    // Lead 00:13: it was drowned in one green: a lighter, greyer haze (still only past 12-18 m), a
    // less green fill and grade (saturation under 1), so the warm lantern pool and the glowing vines
    // read against it.
    // Lead 01:17: the olive is right but too dark (median 0.10): more fill (a greyer, brighter
    // ambient and open fill, the haze a step lighter) and a lantern pool that carries further (reach,
    // bounce), the saturation unchanged; the vine curtain stays the brightest glow.
    atmosphere: air({ fog: 0x2a332e, fogLow: 0x222a22, ambient: 0x151a15, open: 0x6e786a, density: 0.024, scatter: 0.1, lightGain: 1.8, ambientGain: 0.85, openGain: 0.95, bounce: 0.18, reach: 1.25, exposure: 1.06 }),
    open: { ...CAVERN, density: 0.014, openGain: 1.15 },
    grade: { lift: [0.0034, 0.0042, 0.0036], gain: [1.04, 1.02, 0.98], saturation: 0.9 },
    light: [0.36, 0.78, 0.34],
    fx: ['fireflies', 'spores'],
    hazard: 'dark',
  },
  sulphurBog: {
    atmosphere: air({ fog: 0x24280f, fogLow: 0x30340c, ambient: 0x181a08, open: 0x8a8a48, density: 0.044, poolDensity: 0.04, poolThickness: 4, lightGain: 1.9, scatter: 0.15 }),
    open: { ...CAVERN, density: 0.028, poolDensity: 0.04 },
    grade: { lift: [0.0046, 0.0056, 0.0012], gain: [1.04, 1.04, 0.84], saturation: 1.05 },
    light: [0.78, 0.85, 0.2],
    fx: ['motes', 'bubbles'],
    hazard: 'gas',
  },
  sunkenCity: {
    atmosphere: air({ fog: 0x141c2e, fogLow: 0x101426, ambient: 0x121a2c, open: 0x7a8aa8, density: 0.03, lightGain: 2.2 }),
    open: { ...CAVERN, density: 0.016 },
    grade: { lift: [0.003, 0.0038, 0.0078], gain: [1.08, 1.02, 0.86], saturation: 1.08 },
    light: [1.0, 0.78, 0.3],
    fx: ['runeMotes', 'dust'],
    hazard: 'none',
  },
  magmaVeins: {
    atmosphere: air({ fog: 0x2a100a, fogLow: 0x3a1408, ambient: 0x1a0a08, open: 0x8a4a34, density: 0.04, scatter: 0.22, poolDensity: 0.03, lightGain: 1.9, absorb: 0.6 }),
    open: CAVERN,
    grade: { lift: [0.0078, 0.0028, 0.0012], gain: [1.08, 0.96, 0.82], saturation: 1.1 },
    light: [0.95, 0.36, 0.1],
    fx: ['embers', 'ash'],
    hazard: 'heat',
  },
  obsidianAbyss: {
    // Lead 00:13: large areas read near-black: the darks lifted into a violet-hued 0.04-0.10 band
    // (never crushed), a brighter violet fill, its lights carrying further.
    atmosphere: air({ fog: 0x1e1630, fogLow: 0x281a44, ambient: 0x16102a, open: 0x6e5ea4, density: 0.028, lightGain: 2.3, scatter: 0.16, poolDensity: 0.03 }),
    open: CAVERN,
    grade: { lift: [0.0078, 0.0054, 0.0148], gain: [1.02, 0.98, 1.06], saturation: 1.0 },
    light: [0.5, 0.32, 1.0],
    fx: ['voidMotes'],
    hazard: 'void',
  },
  heart: {
    // Lead 00:13 (before the relighting): the chamber's darks lifted into a rose-violet band, never
    // crushed; the Heart itself is the frame's lit focal point (game/effects/HeartFinale).
    atmosphere: air({ fog: 0x26121e, fogLow: 0x341424, ambient: 0x1c0e1a, open: 0x8a4a6a, density: 0.028, lightGain: 2.2, scatter: 0.2 }),
    open: { ...CAVERN, density: 0.016 },
    grade: { lift: [0.0095, 0.0045, 0.0085], gain: [1.1, 0.98, 0.9], saturation: 1.02 },
    light: [1.0, 0.45, 0.35],
    fx: ['heartMotes', 'embers'],
    hazard: 'none',
  },
};

/**
 * Each biome's water (linear): the deep body, the shallows over the stone, the cave mirrored in it
 * and its bioluminescence (specks, and a wave behind the sonar's shell). Limestone pools are a clear
 * cool teal against the warm stone; the Flooded Grottoes are deep blue and glow the brightest.
 */
export const BIOME_WATER: Record<LookBiomeId, WaterTint> = {
  amberHollows: { deep: [0.002, 0.007, 0.007], shallow: [0.02, 0.045, 0.04], sky: [0.012, 0.01, 0.008], glow: [0, 0, 0], glowAmount: 0 },
  mushroomForest: { deep: [0.001, 0.006, 0.009], shallow: [0.008, 0.035, 0.04], sky: [0.004, 0.012, 0.016], glow: [0.2, 1.0, 0.85], glowAmount: 0.5 },
  rootGalleries: { deep: [0.004, 0.004, 0.0015], shallow: [0.03, 0.028, 0.012], sky: [0.01, 0.011, 0.006], glow: [0.7, 0.9, 0.25], glowAmount: 0.15 },
  floodedGrottoes: { deep: [0.0008, 0.005, 0.014], shallow: [0.008, 0.036, 0.065], sky: [0.004, 0.012, 0.026], glow: [0.25, 0.75, 1.0], glowAmount: 1 },
  crystalGeode: { deep: [0.002, 0.003, 0.012], shallow: [0.02, 0.03, 0.07], sky: [0.008, 0.008, 0.022], glow: [0.5, 0.45, 1.0], glowAmount: 0.5 },
  haldenMines: { deep: [0.004, 0.003, 0.002], shallow: [0.035, 0.022, 0.012], sky: [0.01, 0.008, 0.006], glow: [0, 0, 0], glowAmount: 0 },
  frostCaverns: { deep: [0.003, 0.01, 0.018], shallow: [0.04, 0.075, 0.09], sky: [0.012, 0.02, 0.03], glow: [0.5, 0.8, 1.0], glowAmount: 0.2 },
  glowrootJungle: { deep: [0.001, 0.006, 0.003], shallow: [0.012, 0.045, 0.02], sky: [0.004, 0.012, 0.006], glow: [0.35, 1.0, 0.4], glowAmount: 0.8 },
  sulphurBog: { deep: [0.006, 0.006, 0.001], shallow: [0.05, 0.05, 0.01], sky: [0.012, 0.012, 0.004], glow: [0.8, 0.9, 0.2], glowAmount: 0.2 },
  sunkenCity: { deep: [0.001, 0.006, 0.01], shallow: [0.012, 0.045, 0.05], sky: [0.008, 0.012, 0.018], glow: [1.0, 0.8, 0.35], glowAmount: 0.35 },
  magmaVeins: { deep: [0.006, 0.002, 0.001], shallow: [0.04, 0.015, 0.006], sky: [0.03, 0.008, 0.002], glow: [0, 0, 0], glowAmount: 0 },
  obsidianAbyss: { deep: [0.002, 0.0, 0.005], shallow: [0.02, 0.008, 0.04], sky: [0.008, 0.004, 0.016], glow: [0.6, 0.35, 1.0], glowAmount: 0.6 },
  heart: { deep: [0.006, 0.001, 0.003], shallow: [0.05, 0.015, 0.03], sky: [0.02, 0.006, 0.012], glow: [1.0, 0.45, 0.6], glowAmount: 0.5 },
};

/** The water of a biome mix (pure: weights as BiomeLook.weights; none known = the old world's water). */
export function waterTintFor(weights: ReadonlyMap<string, number>, out: WaterTint = { ...DEFAULT_WATER, deep: [0, 0, 0], shallow: [0, 0, 0], sky: [0, 0, 0], glow: [0, 0, 0] }): WaterTint {
  let total = 0;
  for (const [b, w] of weights) if (isLookBiome(b)) total += w;
  if (total <= 1e-4) {
    out.deep = [...DEFAULT_WATER.deep];
    out.shallow = [...DEFAULT_WATER.shallow];
    out.sky = null;
    out.glow = [0, 0, 0];
    out.glowAmount = 0;
    return out;
  }
  const deep: [number, number, number] = [0, 0, 0];
  const shallow: [number, number, number] = [0, 0, 0];
  const sky: [number, number, number] = [0, 0, 0];
  const glow: [number, number, number] = [0, 0, 0];
  let amount = 0;
  for (const [b, w0] of weights) {
    if (!isLookBiome(b)) continue;
    const t = BIOME_WATER[b];
    const w = w0 / total;
    for (let i = 0; i < 3; i++) {
      deep[i] += t.deep[i] * w;
      shallow[i] += t.shallow[i] * w;
      sky[i] += (t.sky ?? [0, 0, 0])[i] * w;
      glow[i] += t.glow[i] * t.glowAmount * w;
    }
    amount += t.glowAmount * w;
  }
  out.deep = deep;
  out.shallow = shallow;
  out.sky = sky;
  out.glow = amount > 1e-4 ? [glow[0] / amount, glow[1] / amount, glow[2] / amount] : [0, 0, 0];
  out.glowAmount = amount;
  return out;
}

/** The atmosphere id a biome registers (and `<id>~open` for its caverns). */
export const atmosphereId = (b: string): string => `biome:${b}`;

for (const b of LOOK_BIOMES) {
  const d = BIOME_LOOKS[b];
  registerAtmosphere(atmosphereId(b), d.atmosphere);
  registerAtmosphere(`${atmosphereId(b)}~open`, { ...d.atmosphere, ...d.open });
}

export const isLookBiome = (b: unknown): b is LookBiomeId => typeof b === 'string' && b in BIOME_LOOKS;

/**
 * The Heart relit (the main quest's end): its air turns from a dark rose to a warm clear gold, its
 * lights burn brighter, its grade warms. `relightHeart(t)` (0 dark, 1 lit) re-registers the Heart's
 * atmospheres and sets its grade between the two (the finale eases t over seconds; a save with the
 * Heart lit sets 1 at once).
 */
const HEART_DARK = { atmosphere: { ...BIOME_LOOKS.heart.atmosphere }, grade: { ...BIOME_LOOKS.heart.grade, lift: [...BIOME_LOOKS.heart.grade.lift] as [number, number, number], gain: [...BIOME_LOOKS.heart.grade.gain] as [number, number, number] } };
const HEART_LIT = {
  atmosphere: air({ fog: 0x2a1e18, fogLow: 0x3a2214, ambient: 0x1e1812, open: 0xb08a62, density: 0.022, lightGain: 2.7, scatter: 0.24, poolDensity: 0.012, openGain: 1.05, ambientGain: 0.9 }),
  grade: { lift: [0.006, 0.0044, 0.003] as [number, number, number], gain: [1.12, 1.03, 0.9] as [number, number, number], saturation: 1.1 },
};
let heartLit = 0;

function mixHex(a: number, b: number, t: number): number {
  const ch = (s: number) => Math.round(((a >> s) & 255) * (1 - t) + ((b >> s) & 255) * t);
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
}

export function relightHeart(t: number): void {
  const k = Math.max(0, Math.min(1, t));
  if (Math.abs(k - heartLit) < 1e-4) return;
  heartLit = k;
  const d = HEART_DARK.atmosphere;
  const l = HEART_LIT.atmosphere;
  const mixed: AtmospherePreset = { ...d };
  for (const key of Object.keys(l) as Array<keyof AtmospherePreset>) {
    const a = d[key];
    const b = l[key];
    if (typeof a !== 'number' || typeof b !== 'number') continue;
    const colour = key === 'fog' || key === 'fogLow' || key === 'ambient' || key === 'open';
    (mixed as unknown as Record<string, number>)[key] = colour ? mixHex(a, b, k) : a + (b - a) * k;
  }
  const def = BIOME_LOOKS.heart;
  def.atmosphere = mixed;
  const g = def.grade;
  for (let i = 0; i < 3; i++) {
    g.lift[i] = HEART_DARK.grade.lift[i] + (HEART_LIT.grade.lift[i] - HEART_DARK.grade.lift[i]) * k;
    g.gain[i] = HEART_DARK.grade.gain[i] + (HEART_LIT.grade.gain[i] - HEART_DARK.grade.gain[i]) * k;
  }
  g.saturation = HEART_DARK.grade.saturation + (HEART_LIT.grade.saturation - HEART_DARK.grade.saturation) * k;
  registerAtmosphere(atmosphereId('heart'), mixed);
  registerAtmosphere(`${atmosphereId('heart')}~open`, { ...mixed, ...def.open });
}

/** How lit the Heart is (0..1). */
export const heartLight = (): number => heartLit;

/** What the look writes into the post chain (PostFX.params satisfies it). */
export interface GradeTarget {
  lift: THREE.Color;
  gain: THREE.Color;
  saturation: number;
}

/** A biome sampler (WORLD's StratumLayout.biomeAt); null where nothing is known. */
export type BiomeSampler = (x: number, y: number, z: number) => string | null | undefined;

/** Ring of sample offsets (m) around the explorer: the centre weighs most, then 8 at 7 m, 8 at 14 m. */
const SAMPLES: ReadonlyArray<[number, number, number]> = (() => {
  const out: Array<[number, number, number]> = [[0, 0, 4]];
  for (const [r, w] of [
    [7, 1],
    [14, 0.6],
  ] as const)
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2 + (r > 10 ? Math.PI / 8 : 0);
      out.push([Math.cos(a) * r, Math.sin(a) * r, w]);
    }
  return out;
})();

let active: BiomeLook | null = null;

/**
 * Force a biome's look over the sampled one on the active BiomeLook (blend 0..1; null or 0 releases
 * it). The seam's free function: it routes to the BiomeLook constructed last.
 */
export function applyBiomeLook(biome: string | null, blend = 1): void {
  active?.applyBiomeLook(biome, blend);
}

export class BiomeLook {
  /** The biome mix around the explorer, eased (id -> weight, summing to 1 when any is known). */
  readonly weights = new Map<string, number>();
  /** The dominant biome now (null until one is known). */
  current: LookBiomeId | null = null;
  private forced: { biome: LookBiomeId; blend: number } | null = null;
  private readonly targets = new Map<string, number>();
  private readonly rigTargets = new Map<string, number>();
  private readonly base: { lift: THREE.Color; gain: THREE.Color; saturation: number } | null;
  private init = false;
  private lastX = Number.NaN;
  private lastZ = Number.NaN;

  constructor(
    private readonly rig: LightingRig,
    private readonly grade: GradeTarget | null = null,
  ) {
    this.base = grade ? { lift: grade.lift.clone(), gain: grade.gain.clone(), saturation: grade.saturation } : null;
    active = this;
  }

  /** Force a biome (blend 0..1 over the sampled mix); null or blend 0 releases it. */
  applyBiomeLook(biome: string | null, blend = 1): void {
    this.forced = biome && isLookBiome(biome) && blend > 0 ? { biome, blend: Math.min(1, blend) } : null;
  }

  /** The look of a biome (null if the id is unknown). */
  static def(biome: string | null | undefined): BiomeLookDef | null {
    return isLookBiome(biome) ? BIOME_LOOKS[biome] : null;
  }

  /**
   * Sample the biomes around (x, y, z), ease the mix (~1 s; snaps on a jump of 8 m or more) and push
   * it to the lighting rig (as atmosphere targets; the rig blends the camp box in itself) and the
   * grade. Call before LightingRig.updateAtmosphere.
   */
  update(dt: number, x: number, y: number, z: number, biomeAt: BiomeSampler | null): void {
    const t = this.targets;
    t.clear();
    let sum = 0;
    if (biomeAt) {
      for (const [dx, dz, w] of SAMPLES) {
        const b = biomeAt(x + dx, y + 0.5, z + dz);
        if (!isLookBiome(b)) continue;
        t.set(b, (t.get(b) ?? 0) + w);
        sum += w;
      }
    }
    if (this.forced) {
      const f = this.forced;
      for (const [b, w] of t) t.set(b, sum > 0 ? (w / sum) * (1 - f.blend) : 0);
      t.set(f.biome, (t.get(f.biome) ?? 0) + (sum > 0 ? f.blend : 1));
      sum = 1;
    } else if (sum > 0) for (const [b, w] of t) t.set(b, w / sum);
    const jump = Math.abs(x - this.lastX) + Math.abs(z - this.lastZ);
    this.lastX = x;
    this.lastZ = z;
    const a = !this.init || dt <= 0 || !(jump < 8) ? 1 : 1 - Math.exp(-dt / 0.9);
    if (sum > 0) this.init = true;
    const wts = this.weights;
    for (const [b, w] of wts) if (!t.has(b)) wts.set(b, w * (1 - a));
    for (const [b, w] of t) wts.set(b, (wts.get(b) ?? 0) + (w - (wts.get(b) ?? 0)) * a);
    let best: LookBiomeId | null = null;
    let bestW = 0;
    for (const [b, w] of wts) {
      if (w < 1e-3) {
        wts.delete(b);
        continue;
      }
      if (w > bestW && isLookBiome(b)) {
        bestW = w;
        best = b;
      }
    }
    this.current = best;
    // The rig takes the targets (it eases them itself, so hand it the un-eased mix).
    const rt = this.rigTargets;
    rt.clear();
    for (const [b, w] of t) rt.set(atmosphereId(b), w);
    this.rig.setBiomeTargets(rt.size ? rt : wts.size ? this.eased() : null);
    this.applyGrade();
  }

  /** Release the rig back to the old zones (a session without biomes). */
  detach(): void {
    this.rig.setBiomeTargets(null);
    if (this.grade && this.base) {
      this.grade.lift.copy(this.base.lift);
      this.grade.gain.copy(this.base.gain);
      this.grade.saturation = this.base.saturation;
    }
    if (active === this) active = null;
  }

  private eased(): Map<string, number> {
    const m = new Map<string, number>();
    for (const [b, w] of this.weights) m.set(atmosphereId(b), w);
    return m;
  }

  private applyGrade(): void {
    const g = this.grade;
    if (!g || !this.base) return;
    let total = 0;
    for (const w of this.weights.values()) total += w;
    if (total <= 1e-4) {
      g.lift.copy(this.base.lift);
      g.gain.copy(this.base.gain);
      g.saturation = this.base.saturation;
      return;
    }
    let lr = 0, lg = 0, lb = 0, gr = 0, gg = 0, gb = 0, sat = 0;
    for (const [b, w0] of this.weights) {
      const d = BiomeLook.def(b);
      if (!d) continue;
      const w = w0 / total;
      lr += d.grade.lift[0] * w;
      lg += d.grade.lift[1] * w;
      lb += d.grade.lift[2] * w;
      gr += d.grade.gain[0] * w;
      gg += d.grade.gain[1] * w;
      gb += d.grade.gain[2] * w;
      sat += d.grade.saturation * w;
    }
    g.lift.setRGB(lr, lg, lb);
    g.gain.setRGB(gr, gg, gb);
    g.saturation = sat;
  }
}
