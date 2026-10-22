import { B, SOLID } from '../../config/blocks';
import type { Rng } from '../../core/rng';
import type { PropKind, PropSpec } from '../../world/gen/types';
import type { VoxelWorld } from '../../world/VoxelWorld';
import type { VoxBuilder } from '../voxModel';
import type { ModelBuilder, PropModelOptions } from './models';
import { beam, disc, shade, vary } from './shapes';
import { IRON, FIRE } from './palette';

/**
 * Round 3 (VIS): what glows in the strata's light pockets.
 *
 * WORLD lights the caves with pockets: a biome light voxel in the air under the roof (BIOMES[b].
 * lightBlock), so darkness is a choice. Alone it lights the rock from nowhere; here each pocket gets
 * the thing that glows there, hanging from the roof right over the light: glow-worm threads (cold
 * blue in the Flooded Grottoes, green-gold in the Root Galleries: a starry ceiling), hanging glow
 * caps (teal, magenta), amber resin drips, crystal drops, a mine lamp on its chain, ice, sulphur
 * crusts, a rune lamp, an ember crack, void shards, the Heart's veins. They are decor (nothing to
 * do), so the props' DecorBatch bakes them per 32 m cell: no draw call each.
 *
 * Every model hangs down from y = 0 (the roof face over the light).
 */

type Build = (m: ModelBuilder, rng: Rng, o: PropModelOptions) => void;

/** Glow-worm threads: dozens of silk lines with a bright bead each, mostly short, a few long. */
function glowWorms(bead: number, silk: number): Build {
  return (m, rng) => {
    const n = rng.int(26, 38);
    for (let i = 0; i < n; i++) {
      const a = rng.range(0, Math.PI * 2);
      const r = Math.sqrt(rng.next()) * 1.35;
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      // Lengths skewed short: the curtain is dense near the roof, a few threads reach low.
      const len = 0.08 + Math.pow(rng.next(), 2.2) * 0.75;
      m.glow.box(x - 0.005, -len, z - 0.005, x + 0.005, 0, z + 0.005, silk, 0.16);
      const s = rng.range(0.018, 0.03);
      m.glow.cube(x, -len - s * 0.4, z, s, s * 1.3, s, bead, rng.range(0.85, 1));
      // The worm's body at the roof: a faint smudge.
      if (i % 3 === 0) m.glow.cube(x, -0.012, z, 0.05, 0.016, 0.03, shade(bead, 0.6), 0.35);
    }
    m.glowScale = 2.1;
  };
}

/** A hanging glow cap: a stem down from the roof and an upturned cap, its gills glowing. */
function hangingCap(m: ModelBuilder, rng: Rng, x: number, z: number, len: number, r: number, cap: number, gill: number): void {
  const lean = rng.range(-0.2, 0.2);
  const turn = rng.range(0, Math.PI);
  for (const v of [m.body, m.glow]) v.push().translate(x, 0, z).rotateZ(lean).rotateY(turn);
  disc(m.body, r * 0.2, -len, 0.017, vary(0x6e6858, rng, 0.08));
  disc(m.body, r, -len - r * 0.24, -len, vary(cap, rng, 0.1));
  disc(m.body, r * 0.68, -len - r * 0.4, -len - r * 0.2, shade(cap, 0.9));
  // The gills face down at the cave: a glowing ring, and a bright drop of spores under it.
  disc(m.glow, r * 0.9, -len - r * 0.26, -len - r * 0.235, gill, 0.75);
  m.glow.cube(0, -len - r * 0.5, 0, r * 0.22, r * 0.3, r * 0.22, shade(gill, 1.3), 0.95);
  m.body.pop();
  m.glow.pop();
}

/** The hang of a pocket's lamp or cap below its roof, from its variant (DROP_STEP m steps; 0 = short). */
export const DROP_STEP = 0.5;
export const DROP_STEPS = 28;
const dropOf = (variant: number): number => Math.floor(variant / 4) * DROP_STEP;

/** A cord or chain from the roof (y 0) down `len` m; returns the y where it ends. */
function hanger(m: ModelBuilder, len: number, kind: 'cord' | 'chain' | 'bronze', col: number): number {
  if (len <= 0.01) return 0;
  if (kind === 'cord') {
    beam(m.body, 0, 0, 0, 0.02, -len, 0.015, 0.022, 0.022, col);
    for (let y = -0.4; y > -len; y -= 0.55) m.glow.cube(0.01, y, 0.01, 0.03, 0.03, 0.03, shade(col, 1.6), 0.3);
    return -len;
  }
  const c = kind === 'chain' ? IRON.mid : 0x6a4a1e;
  for (let k = 0; k < Math.round(len / 0.07); k++) {
    const y = -k * 0.07;
    if (k % 2) m.body.box(-0.012, y - 0.07, -0.024, 0.012, y, 0.024, c);
    else m.body.box(-0.024, y - 0.07, -0.012, 0.024, y, 0.012, shade(c, 0.85));
  }
  return -len;
}

function glowCaps(cap: number, gill: number, alt: number): Build {
  return (m, rng, o) => {
    const drop = dropOf(o.variant);
    // A long cord from a high roof down to the light: the caps grow at its end.
    const end = hanger(m, Math.max(0, drop - 0.4), 'cord', 0x8a8478);
    for (const v of [m.body, m.glow]) v.push().translate(0, end, 0);
    // A lumpy mycelium crust on the roof (or a knot at the cord's end), then caps hanging from it.
    if (end < 0) m.body.cube(0, -0.03, 0, 0.22, 0.08, 0.2, vary(0x3a3448, rng, 0.1));
    else for (let i = 0; i < 5; i++) m.body.cube(rng.range(-0.5, 0.5), -0.04 + i * 0.004, rng.range(-0.5, 0.5), rng.range(0.25, 0.45), 0.08 + i * 0.007, rng.range(0.25, 0.45), vary(0x3a3448, rng, 0.1));
    const n = rng.int(5, 8);
    for (let i = 0; i < n; i++) {
      const a = rng.range(0, Math.PI * 2);
      const r = i === 0 ? 0 : rng.range(0.15, 0.6);
      hangingCap(m, rng, Math.cos(a) * r, Math.sin(a) * r, i === 0 ? rng.range(0.35, 0.55) : rng.range(0.08, 0.35), i === 0 ? rng.range(0.16, 0.22) : rng.range(0.06, 0.13), cap, i % 3 === 2 ? alt : gill);
    }
    // Spore threads drifting from the gills.
    for (let i = 0; i < 6; i++) m.glow.cube(rng.range(-0.6, 0.6), -rng.range(0.5, 1.1), rng.range(-0.6, 0.6), 0.018, 0.018, 0.018, i % 2 ? gill : alt, 0.9);
    for (const v of [m.body, m.glow]) v.pop();
    m.glowScale = 1.9;
  };
}

/** Tapering hanging points (resin, crystal, ice): a few around a long one. */
function drops(m: ModelBuilder, rng: Rng, n: number, maxLen: number, crust: number, core: number, tip: number, glowAt: number): void {
  for (let i = 0; i < n; i++) {
    const main = i === 0;
    const a = rng.range(0, Math.PI * 2);
    const r = main ? 0 : rng.range(0.12, 0.45);
    const len = main ? maxLen : rng.range(0.2, maxLen * 0.7);
    const w = main ? 0.13 : rng.range(0.05, 0.1);
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    const tiers = Math.max(3, Math.round(len / 0.12));
    for (let k = 0; k < tiers; k++) {
      const t = k / tiers;
      const rr = w * (1 - t * 0.85);
      const y0 = -0.02 - len * t - i * 0.0031;
      const y1 = -0.02 - len * (t + 1 / tiers) - i * 0.0031;
      const glowing = t >= glowAt;
      const col = glowing ? (t > 0.8 ? tip : core) : vary(crust, rng, 0.06);
      const tb: VoxBuilder = glowing ? m.glow : m.body;
      tb.push().translate(x, 0, z).rotateY(rng.range(0, 0.8));
      disc(tb, rr, y1, y0, col, glowing ? 0.55 + t * 0.4 : 0);
      tb.pop();
    }
  }
}

const amberGlow: Build = (m, rng) => {
  disc(m.body, 0.45, -0.08, 0, 0x4a3d2e);
  drops(m, rng, rng.int(4, 6), rng.range(0.7, 1.1), 0x5a4b39, 0xd0781a, 0xffc860, 0.35);
  m.glowScale = 1.7;
};

const crystalDrops: Build = (m, rng) => {
  disc(m.body, 0.4, -0.07, 0, 0x22203a);
  for (let i = 0; i < rng.int(6, 9); i++) {
    const a = rng.range(0, Math.PI * 2);
    const r = i === 0 ? 0 : rng.range(0.08, 0.42);
    m.glow.push().translate(Math.cos(a) * r, 0, Math.sin(a) * r).rotateX(Math.PI).rotateZ(i === 0 ? 0 : rng.range(-0.5, 0.5)).rotateY(rng.range(0, 1.2));
    m.glow.crystal(i === 0 ? 0.1 : rng.range(0.035, 0.07), i === 0 ? rng.range(0.7, 1.0) : rng.range(0.18, 0.5), 0.1, rng.pick([5, 6]), i % 3 === 1 ? 0x6ae0f0 : 0x9a6aff, i % 3 === 1 ? 0x1a6a8a : 0x4a2a9a, 0.6);
    m.glow.pop();
  }
  m.anim = 'crystal';
  m.glowScale = 1.8;
};

const iceGlow: Build = (m, rng) => {
  disc(m.body, 0.4, -0.06, 0, 0x5a6a80);
  drops(m, rng, rng.int(5, 8), rng.range(0.8, 1.3), 0x7a8ca2, 0x7ac0e8, 0xd8f4ff, 0.2);
  m.glowScale = 1.5;
};

const sulphurCrust: Build = (m, rng) => {
  for (let i = 0; i < 7; i++) m.body.cube(rng.range(-0.45, 0.45), -0.05 - i * 0.004, rng.range(-0.45, 0.45), rng.range(0.2, 0.4), 0.1 + i * 0.003, rng.range(0.2, 0.4), vary(0x5a5a1a, rng, 0.1));
  for (let i = 0; i < rng.int(10, 15); i++) {
    const a = rng.range(0, Math.PI * 2);
    const r = rng.range(0.05, 0.5);
    m.glow.push().translate(Math.cos(a) * r, -0.06, Math.sin(a) * r).rotateX(Math.PI).rotateZ(rng.range(-0.6, 0.6));
    m.glow.crystal(rng.range(0.02, 0.045), rng.range(0.06, 0.22), 0.04, 4, 0xe0f04a, 0x8a8a22, 0.6);
    m.glow.pop();
  }
  m.glowScale = 1.6;
};

const mineLamp: Build = (m, rng, o) => {
  // An old miner's lamp on a hook and a chain, still burning low (a long chain from a high roof).
  const b = m.body;
  b.box(-0.03, -0.08, -0.03, 0.03, 0, 0.03, IRON.dark);
  const len = Math.max(rng.range(0.35, 0.6), dropOf(o.variant) - 0.25);
  for (let k = 0; k < Math.round(len / 0.06); k++) {
    const y = -0.08 - k * 0.06;
    if (k % 2) b.box(-0.012, y - 0.06, -0.022, 0.012, y, 0.022, IRON.mid);
    else b.box(-0.022, y - 0.06, -0.012, 0.022, y, 0.012, IRON.mid);
  }
  const y = -0.08 - len;
  b.box(-0.07, y - 0.03, -0.07, 0.07, y, 0.07, IRON.dark);
  for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) b.box(dx * 0.06 - 0.01, y - 0.2, dz * 0.06 - 0.01, dx * 0.06 + 0.01, y - 0.03, dz * 0.06 + 0.01, IRON.mid);
  b.box(-0.075, y - 0.24, -0.075, 0.075, y - 0.2, 0.075, IRON.dark);
  m.glow.box(-0.045, y - 0.19, -0.045, 0.045, y - 0.05, 0.045, FIRE.yellow, 0.9);
  m.glow.box(-0.02, y - 0.16, -0.02, 0.02, y - 0.08, 0.02, FIRE.core, 1);
  m.glowScale = 2;
};

const runeLamp: Build = (m, rng, o) => {
  // A carved stone lantern of the drowned city on a bronze chain, a rune glowing in each face.
  const b = m.body;
  const len = Math.max(rng.range(0.3, 0.5), dropOf(o.variant) - 0.2);
  hanger(m, len, 'bronze', 0x6a4a1e);
  const y = -len;
  b.box(-0.16, y - 0.06, -0.16, 0.16, y, 0.16, 0x5a4f39);
  b.box(-0.13, y - 0.36, -0.13, 0.13, y - 0.06, 0.13, 0x4a412e);
  b.box(-0.18, y - 0.42, -0.18, 0.18, y - 0.36, 0.18, 0x5a4f39);
  for (const [nx, nz] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
    const cx = nx * 0.132;
    const cz = nz * 0.132;
    m.glow.box(cx - (nz ? 0.05 : 0.004), y - 0.3, cz - (nx ? 0.05 : 0.004), cx + (nz ? 0.05 : 0.004), y - 0.12, cz + (nx ? 0.05 : 0.004), 0xffd060, 0.95);
  }
  m.glowScale = 1.9;
};

const emberCrack: Build = (m, rng) => {
  // A seam of glowing rock in the roof: dark basalt lips round a bright crack.
  for (let i = 0; i < 6; i++) m.body.cube(rng.range(-0.5, 0.5), -0.05 - i * 0.004, rng.range(-0.5, 0.5), rng.range(0.2, 0.4), 0.1 + i * 0.003, rng.range(0.2, 0.4), vary(0x242124, rng, 0.1));
  let x = -0.6;
  let z = rng.range(-0.2, 0.2);
  while (x < 0.6) {
    const nx = x + rng.range(0.12, 0.22);
    const nz = z + rng.range(-0.12, 0.12);
    beam(m.glow, x, -0.06, z, nx, -0.07, nz, 0.06, 0.05, 0xff6a1e, 0.9);
    beam(m.glow, x, -0.075, z, nx, -0.08, nz, 0.025, 0.02, 0xffd080, 1);
    x = nx;
    z = nz;
  }
  // Molten beads about to drop.
  for (let i = 0; i < 3; i++) m.glow.cube(rng.range(-0.5, 0.5), -0.12, rng.range(-0.15, 0.15), 0.04, 0.06, 0.04, 0xffa040, 0.95);
  m.glowScale = 2;
};

const voidShards: Build = (m, rng) => {
  disc(m.body, 0.38, -0.06, 0, 0x0c0a12);
  for (let i = 0; i < rng.int(5, 8); i++) {
    const a = rng.range(0, Math.PI * 2);
    const r = i === 0 ? 0 : rng.range(0.1, 0.4);
    m.body.push().translate(Math.cos(a) * r, -0.04, Math.sin(a) * r).rotateX(Math.PI).rotateZ(rng.range(-0.4, 0.4));
    m.body.crystal(rng.range(0.04, 0.09), rng.range(0.25, 0.8), 0.08, 4, 0x16121e, 0x0c0a12, 0);
    m.body.pop();
    m.glow.push().translate(Math.cos(a) * r, -0.04, Math.sin(a) * r).rotateX(Math.PI).rotateZ(rng.range(-0.4, 0.4));
    m.glow.crystal(0.012, rng.range(0.2, 0.6), 0.02, 4, 0xa070ff, 0x6a4aa8, 0.9);
    m.glow.pop();
  }
  m.glowScale = 1.8;
};

const heartVein: Build = (m, rng) => {
  // Living veins in the roof, beating faintly rose, a heavy drop of light at their meeting.
  for (let k = 0; k < rng.int(5, 7); k++) {
    let x = 0;
    let z = 0;
    const a = rng.range(0, Math.PI * 2);
    for (let i = 0; i < 5; i++) {
      const nx = x + Math.cos(a + rng.range(-0.5, 0.5)) * 0.16;
      const nz = z + Math.sin(a + rng.range(-0.5, 0.5)) * 0.16;
      beam(m.body, x, -0.03, z, nx, -0.04, nz, 0.07 * (1 - i * 0.15), 0.05, 0x3a0c18);
      beam(m.glow, x, -0.065, z, nx, -0.07, nz, 0.03 * (1 - i * 0.15), 0.015, 0xff4a6a, 0.8);
      x = nx;
      z = nz;
    }
  }
  disc(m.glow, 0.09, -0.32, -0.08, 0xff6a80, 0.9);
  m.glow.cube(0, -0.36, 0, 0.06, 0.08, 0.06, 0xffc0c8, 1);
  m.glowScale = 2;
};

/** The pocket kinds (models.ts merges them with the biome props). */
export const POCKET_PROPS: Record<string, { build: Build; variants: number }> = {
  glowWormsBlue: { build: glowWorms(0x8ad8ff, 0x6a9ab8), variants: 3 },
  glowWormsGold: { build: glowWorms(0xd8f070, 0x9aa070), variants: 3 },
  glowCapsTeal: { build: glowCaps(0x0e2a2c, 0x5af0dc, 0xf06ae0), variants: 4 * (DROP_STEPS + 1) },
  glowCapsMagenta: { build: glowCaps(0x2a0e2a, 0xf06ae0, 0x5af0dc), variants: 4 * (DROP_STEPS + 1) },
  amberGlow: { build: amberGlow, variants: 2 },
  crystalDrops: { build: crystalDrops, variants: 2 },
  iceGlow: { build: iceGlow, variants: 2 },
  sulphurCrust: { build: sulphurCrust, variants: 2 },
  mineLamp: { build: mineLamp, variants: 4 * (DROP_STEPS + 1) },
  runeLamp: { build: runeLamp, variants: 4 * (DROP_STEPS + 1) },
  emberCrack: { build: emberCrack, variants: 2 },
  voidShards: { build: voidShards, variants: 2 },
  heartVein: { build: heartVein, variants: 2 },
};

/** Which pocket glows for a biome (and the mushroom's two light colours). */
export function pocketKind(biome: string | null | undefined, lightId: number): PropKind | null {
  switch (biome) {
    case 'amberHollows':
      return 'amberGlow' as PropKind;
    case 'mushroomForest':
      return (lightId === B.LIGHT_MAGENTA ? 'glowCapsMagenta' : 'glowCapsTeal') as PropKind;
    case 'rootGalleries':
    case 'glowrootJungle':
      return 'glowWormsGold' as PropKind;
    case 'floodedGrottoes':
      return 'glowWormsBlue' as PropKind;
    case 'crystalGeode':
      return 'crystalDrops' as PropKind;
    case 'haldenMines':
      return 'mineLamp' as PropKind;
    case 'frostCaverns':
      return 'iceGlow' as PropKind;
    case 'sulphurBog':
      return 'sulphurCrust' as PropKind;
    case 'sunkenCity':
      return 'runeLamp' as PropKind;
    case 'magmaVeins':
      return 'emberCrack' as PropKind;
    case 'obsidianAbyss':
      return 'voidShards' as PropKind;
    case 'heart':
      return 'heartVein' as PropKind;
    default:
      return null;
  }
}

/** The biome light voxels (WORLD's BIOMES[b].lightBlock) a pocket can be. */
export const POCKET_LIGHTS: ReadonlySet<number> = new Set([B.LIGHT_LAMP, B.LIGHT_TEAL, B.LIGHT_MAGENTA, B.LIGHT_GLOWROOT, B.LIGHT_CYAN, B.LIGHT_ABYSS, B.LIGHT_ICE, B.LIGHT_SULPHUR, B.LIGHT_RUNE, B.LIGHT_MAGMA, B.LIGHT_VOID, B.LIGHT_HEART]);

/** A light pocket: the light voxel and where its glow hangs (null: it floats in open air). */
export interface Pocket {
  x: number;
  y: number;
  z: number;
  id: number;
  biome: string | null;
  /** The roof cell the pocket's model hangs from. */
  roof: number | null;
}

/**
 * Every free-standing biome light in a world (pure; unit-tested): the light voxels no prop owns (a
 * lamp post's, a brazier's), with the roof over each within 3 cells.
 */
export function findPockets(world: VoxelWorld, biomeAt: ((x: number, y: number, z: number) => string | null | undefined) | null, owned: ReadonlySet<number>): Pocket[] {
  const out: Pocket[] = [];
  const b = world.blocks;
  const { sx, sy } = world;
  for (let i = 0; i < b.length; i++) {
    const id = b[i];
    if (!POCKET_LIGHTS.has(id) || owned.has(i)) continue;
    const x = i % sx;
    const y = Math.floor(i / sx) % sy;
    const z = Math.floor(i / (sx * sy));
    let roof: number | null = null;
    for (let k = 1; k <= ROOF_REACH; k++) if (SOLID[world.get(x, y + k, z)]) {
      roof = y + k;
      break;
    }
    out.push({ x, y, z, id, biome: biomeAt ? (biomeAt(x + 0.5, y, z + 0.5) ?? null) : null, roof });
  }
  return out;
}

/** How far up a pocket's roof is looked for (cells). */
export const ROOF_REACH = 14;

/** Kinds that hang on a cord or chain down to the light (the others stay on the roof). */
const ON_A_LINE: ReadonlySet<string> = new Set(['glowCapsTeal', 'glowCapsMagenta', 'mineLamp', 'runeLamp']);

/** The drop from a pocket's roof to its light (m; 0 right under the roof). */
export const pocketDrop = (p: Pocket): number => (p.roof === null ? 0 : Math.max(0, p.roof - p.y - 1));

/**
 * The decor props of a set of pockets: each hangs from its roof (lamps and caps on a line down to the
 * light; worms, crystals, ice and crusts on the roof itself); none for a light with no roof in reach.
 */
export function pocketProps(pockets: readonly Pocket[], seed: number): PropSpec[] {
  const out: PropSpec[] = [];
  for (const p of pockets) {
    const kind = pocketKind(p.biome, p.id);
    if (!kind || p.roof === null) continue;
    const s = (seed * 31 + p.x * 73856093 + p.y * 19349663 + p.z * 83492791) >>> 0;
    const drop = ON_A_LINE.has(kind) ? Math.min(DROP_STEPS, Math.round(pocketDrop(p) / DROP_STEP)) : 0;
    out.push({
      id: `pocket_${p.x}_${p.y}_${p.z}`,
      kind,
      x: p.x + 0.5,
      y: p.roof,
      z: p.z + 0.5,
      rotY: ((s % 6283) / 1000),
      scale: drop > 0 ? 1 : 0.9 + ((s >>> 12) % 300) / 1000,
      anchor: [p.x, p.roof, p.z],
      emitters: [],
      seed: s,
      modelVariant: (s % 2) + 4 * drop,
    });
  }
  return out;
}
