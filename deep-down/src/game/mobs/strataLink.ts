import { ROSTERS } from './rosters';
import { SPECIES } from './species';
import { setSpawnSpots, type Lair, type Nest } from './spawner';
import type { MobSim } from './MobSim';
import type { MobBiome, MobKind } from './types';

/**
 * The link between WORLD's stratum layout and the creatures (round 3, MOBS), pure so the game
 * (MobDirector) and the Node proofs (tools/mob-density.ts) wire a stratum the same way.
 */

type Solid = (x: number, y: number, z: number) => boolean;

/** Still water as WORLD gives it (LakeDef): a surface height over the masked columns of a box. */
export interface LakeView {
  level: number;
  min: readonly number[];
  max: readonly number[];
  mask: ArrayLike<number>;
}

/** The stratum layout fields MOBS reads (structurally: WORLD's StratumLayout). */
export interface StrataLayout {
  stratum?: number;
  biomes?: readonly string[];
  biomeAt?: (x: number, y: number, z: number) => string;
  lairs?: ReadonlyArray<{ id: string; biome: string; guardian: string; centre: readonly number[]; radius: number; spawn?: readonly number[] }>;
  nests?: ReadonlyArray<{ id?: string; biome: string; p: readonly number[]; radius?: number; kind?: string | null }>;
  spawnPoints?: ReadonlyArray<{ p: readonly number[]; biome: string; dark: boolean; open: boolean; ceiling: boolean }>;
  heart?: { centre: readonly number[]; radius: number; spawn: readonly number[] } | null;
  features?: { lakes?: ReadonlyArray<LakeView> };
}

/**
 * Whether a cell's bottom lies more than `deep` m under a lake's surface with open water over it
 * (rock between them: another cave under the lake, dry). Cells are integers.
 */
export function underLake(lakes: readonly LakeView[], solid: Solid, x: number, y: number, z: number, deep = 0.45): boolean {
  for (const l of lakes) {
    if (x < l.min[0] || x > l.max[0] || z < l.min[1] || z > l.max[1]) continue;
    if (!l.mask[(z - l.min[1]) * (l.max[0] - l.min[0] + 1) + (x - l.min[0])]) continue;
    if (y > l.level - deep || y < l.level - 16) continue;
    let open = true;
    for (let yy = y; yy <= Math.floor(l.level); yy++)
      if (solid(x, yy, z)) {
        open = false;
        break;
      }
    if (open) return true;
  }
  return false;
}

/** The dark tide: with no day cycle in the deep, the creatures stir in waves (an 8-minute cycle, 0..1). */
export function darkTide(seconds: number, period = 480): number {
  const k = 0.5 - 0.5 * Math.cos((seconds / period) * Math.PI * 2);
  return Math.max(0, Math.min(1, (k - 0.35) / 0.65));
}

/**
 * Wire a stratum: its biome map (spawning reads the roster of the biome at the explorer), its lairs
 * (a guardian asleep in each; the Dark Heart's chamber sealed until `heartLit()`), its nests and
 * WORLD's spawn points. @returns the kinds that live in it (to warm their models on arrival).
 */
export function linkStrata(sim: MobSim, layout: StrataLayout, heartLit: () => boolean): MobKind[] {
  const biomeAt = layout.biomeAt;
  sim.env.biomeAt =
    typeof biomeAt === 'function'
      ? (x, y, z) => {
          const b = biomeAt(x, y, z);
          return b in ROSTERS ? (b as MobBiome) : null;
        }
      : undefined;
  const lairs: Lair[] = [];
  for (const l of layout.lairs ?? []) {
    if (!(l.biome in ROSTERS) || !(l.guardian in SPECIES)) continue;
    const sp = l.spawn ?? l.centre;
    lairs.push({ id: l.id, biome: l.biome as MobBiome, guardian: l.guardian as Lair['guardian'], x: l.centre[0], y: l.centre[1], z: l.centre[2], radius: l.radius, sx: sp[0], sy: sp[1], sz: sp[2] });
  }
  if (layout.heart) {
    const h = layout.heart;
    // The Dark Heart wakes when the 12 shards relight the Heart (LOOP's 'quest:heartLit'): before that
    // its chamber is still, so the ending cannot come before the shards.
    lairs.push({ id: 'heart', biome: 'heart', guardian: 'heartOfDark', x: h.centre[0], y: h.centre[1], z: h.centre[2], radius: h.radius, sx: h.spawn[0], sy: h.spawn[1], sz: h.spawn[2], sealed: () => !heartLit() });
  }
  sim.lairs = lairs;
  // Still water: nothing spawns where a lake would hide it (the dips of a flooded chamber).
  const lakes = (layout.features?.lakes ?? []).filter((l) => l && Array.isArray(l.min) && Array.isArray(l.max) && l.mask && Number.isFinite(l.level));
  sim.env.underwater = lakes.length ? (x, y, z) => underLake(lakes, sim.env.solid, x, y, z) : undefined;
  const nests: Nest[] = [];
  let id = 1;
  for (const n of layout.nests ?? []) {
    if (!(n.biome in ROSTERS)) continue;
    nests.push({ id: id++, biome: n.biome as MobBiome, x: n.p[0], y: n.p[1], z: n.p[2], radius: n.radius ?? 3, kind: n.kind && n.kind in SPECIES ? (n.kind as MobKind) : null, next: 0, kills: 0 });
  }
  sim.nests = nests;
  setSpawnSpots((layout.spawnPoints ?? []).filter((q) => q.biome in ROSTERS).map((q) => ({ x: q.p[0], y: q.p[1], z: q.p[2], biome: q.biome as MobBiome, dark: q.dark, open: q.open, ceiling: q.ceiling })));
  const biomes = (layout.biomes ?? []).filter((b): b is MobBiome => b in ROSTERS);
  if (layout.heart) biomes.push('heart');
  const kinds = new Set<MobKind>();
  for (const b of biomes) {
    const r = ROSTERS[b];
    for (const e of [...r.monsters, ...r.beings]) kinds.add(e.kind);
    kinds.add(r.guardian);
  }
  return [...kinds];
}
