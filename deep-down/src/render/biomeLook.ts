import * as THREE from 'three';
import { registerAtmosphere, type AtmospherePreset, type LightingRig } from './lighting';

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
export type BiomeFx = 'drips' | 'dust' | 'spores' | 'fireflies' | 'snow' | 'embers' | 'bubbles' | 'motes' | 'ash' | 'runeMotes' | 'voidMotes' | 'heartMotes';

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
    atmosphere: air({ fog: 0x221a12, fogLow: 0x16110c, ambient: 0x1c1610, open: 0x8a7a62, density: 0.038, lightGain: 1.9, ambientGain: 0.7, openGain: 0.85 }),
    open: CAVERN,
    grade: { lift: [0.0036, 0.0034, 0.0042], gain: [1.06, 1.0, 0.92], saturation: 1.1 },
    light: [1.0, 0.72, 0.4],
    fx: ['drips', 'dust'],
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
    atmosphere: air({ fog: 0x1c2012, fogLow: 0x12140a, ambient: 0x141a0c, open: 0x7a8456, density: 0.042, lightGain: 1.9 }),
    open: CAVERN,
    grade: { lift: [0.0034, 0.0048, 0.0022], gain: [1.05, 1.03, 0.88], saturation: 1.08 },
    light: [0.62, 0.6, 0.22],
    fx: ['dust', 'fireflies'],
    hazard: 'damp',
  },
  floodedGrottoes: {
    atmosphere: air({ fog: 0x10243a, fogLow: 0x0a1a30, ambient: 0x0e1e34, open: 0x6a90b8, density: 0.032, lightGain: 2.1, poolDensity: 0.03, scatter: 0.14 }),
    open: { ...CAVERN, density: 0.018 },
    grade: { lift: [0.001, 0.0042, 0.0092], gain: [1.0, 1.0, 1.03], saturation: 1.1 },
    light: [0.2, 0.5, 0.82],
    fx: ['drips', 'bubbles'],
    hazard: 'damp',
  },
  crystalGeode: {
    atmosphere: air({ fog: 0x16183a, fogLow: 0x0c2032, ambient: 0x10122a, open: 0x7a78b8, density: 0.034, scatter: 0.18, lightGain: 2.1 }),
    open: CAVERN,
    grade: { lift: [0.0036, 0.0036, 0.0098], gain: [1.0, 1.0, 1.06], saturation: 1.16 },
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
    atmosphere: air({ fog: 0x0f2216, fogLow: 0x0c1a0c, ambient: 0x0c1a12, open: 0x5f8a56, density: 0.036, scatter: 0.16, lightGain: 2.0 }),
    open: CAVERN,
    grade: { lift: [0.0018, 0.0068, 0.0028], gain: [1.0, 1.04, 0.92], saturation: 1.15 },
    light: [0.3, 0.8, 0.26],
    fx: ['fireflies', 'spores'],
    hazard: 'dark',
  },
  sulphurBog: {
    atmosphere: air({ fog: 0x24280f, fogLow: 0x30340c, ambient: 0x181a08, open: 0x8a8a48, density: 0.044, poolDensity: 0.04, poolThickness: 4, lightGain: 1.9, scatter: 0.15 }),
    open: { ...CAVERN, density: 0.028, poolDensity: 0.04 },
    grade: { lift: [0.0046, 0.0056, 0.0012], gain: [1.04, 1.04, 0.84], saturation: 1.05 },
    light: [0.78, 0.85, 0.2],
    fx: ['bubbles', 'motes'],
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
    atmosphere: air({ fog: 0x140e22, fogLow: 0x1e1036, ambient: 0x0c0816, open: 0x5a4a8a, density: 0.034, lightGain: 2.0, scatter: 0.16, poolDensity: 0.03 }),
    open: CAVERN,
    grade: { lift: [0.0038, 0.002, 0.009], gain: [1.02, 0.96, 1.08], saturation: 1.1 },
    light: [0.5, 0.32, 1.0],
    fx: ['voidMotes'],
    hazard: 'void',
  },
  heart: {
    atmosphere: air({ fog: 0x1a0c14, fogLow: 0x2a0c18, ambient: 0x100810, open: 0x7a3a5a, density: 0.03, lightGain: 2.1, scatter: 0.2 }),
    open: { ...CAVERN, density: 0.016 },
    grade: { lift: [0.0058, 0.002, 0.0056], gain: [1.1, 0.98, 0.9], saturation: 1.12 },
    light: [1.0, 0.45, 0.35],
    fx: ['heartMotes', 'embers'],
    hazard: 'none',
  },
};

/** The atmosphere id a biome registers (and `<id>~open` for its caverns). */
export const atmosphereId = (b: string): string => `biome:${b}`;

for (const b of LOOK_BIOMES) {
  const d = BIOME_LOOKS[b];
  registerAtmosphere(atmosphereId(b), d.atmosphere);
  registerAtmosphere(`${atmosphereId(b)}~open`, { ...d.atmosphere, ...d.open });
}

export const isLookBiome = (b: unknown): b is LookBiomeId => typeof b === 'string' && b in BIOME_LOOKS;

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
