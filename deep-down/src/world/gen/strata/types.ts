import type { Region, WorldLayout } from '../types';
import type { BiomeId, HazardKind, StratumIndex } from '../../../config/biomes';
import type { GuardianKind, MobKind } from '../../../game/mobs/types';

export type { ExploredMapData } from './explored';
export { ExploredMap } from './explored';

/** A world point in metres: feet positions are cell centre x/z and the floor-top y. */
export type V3 = [number, number, number];

/**
 * Round 3 (WORLD seam): one generated stratum (docs/round3/BRIEF.md §0.1). It is an ordinary
 * WorldLayout (the session, renderers, props and saves take it unchanged) plus the strata data.
 * Everything is plain data except `biomeAt`, which `withBiomeAt` rebuilds after the worker's copy.
 */
export interface StratumLayout extends WorldLayout {
  stratum: StratumIndex;
  /** The expedition seed (shown in Settings); each stratum derives its own from it. */
  expeditionSeed: number;
  biomes: [BiomeId, BiomeId];
  /** Per column (x + z * sx): 0 = biome A, 1 = biome B, 2 = the Heart (stratum VI only). */
  regionMap: Uint8Array;
  /** Per column, 0..255: how deep into its biome the column is (0 on the border): VIS blends looks with it. */
  regionBlend: Uint8Array;
  /** The biome at a world position (rebuilt on the main thread from regionMap). */
  biomeAt(x: number, y: number, z: number): BiomeId;
  /** One guardian lair (an arena) per biome. */
  lairs: LairSite[];
  /** The sealed shaft down to the next stratum (stratum VI: the Heart's door instead). */
  gate: GateSite;
  /** Where the explorer arrives from above (the lift's foot, or the camp in stratum I). */
  arrival: { x: number; y: number; z: number; yaw: number };
  outpostSites: OutpostSite[];
  /** Halden's journal pages (numbered across the whole deep). */
  pages: PageSite[];
  chests: ChestSite[];
  nests: NestSite[];
  /** Spawn points for the creatures, with what the spawner needs to weigh them. */
  spawnPoints: SpawnPoint[];
  caverns: CavernSite[];
  /** Hazard pockets (gas in low places, cold zones, lava rivers, void drops). */
  hazards: HazardZone[];
  /** Placed structures (mine camps, shrines, ore rooms, vaults, set pieces). */
  sites: StructureSite[];
  /** The camp (stratum I only). */
  campSite: CampSite | null;
  /** The Heart's chamber (stratum VI only). */
  heart: { centre: V3; radius: number; spawn: V3 } | null;
  /** Density per biome, counted by the generator (tests and tools). */
  stats: Record<string, BiomeStats>;
}

export interface LairSite {
  id: string;
  biome: BiomeId;
  guardian: GuardianKind;
  /** The arena's floor centre (feet), its radius (m), and where the guardian waits. */
  centre: V3;
  radius: number;
  spawn: V3;
  /** The mouth of the arena (feet), where the walk in arrives. */
  entrance: V3;
  /** Revealed on the map when the explorer comes this close (m), by sonar or by a journal page. */
  revealRadius: number;
}

export interface GateSite {
  id: string;
  stratum: StratumIndex;
  /** The seal's top centre (feet stand on it), and where to stand to use it. */
  centre: V3;
  stand: V3;
  /** The seal cells (B.GATE_SEAL): the gate is open once they are air. */
  seal: V3[];
  /** The biomes whose Heart Shards open it (this stratum's two). */
  shards: BiomeId[];
  shardsNeeded: number;
  /** The next stratum (null in VI: the Heart's door). */
  next: StratumIndex | null;
}

export interface OutpostSite {
  id: string;
  biome: BiomeId;
  /** A flat, safe spot (feet) where an Outpost Kit fits well (any floor works; these are suggested and marked). */
  p: V3;
  radius: number;
}

export interface PageSite {
  id: string;
  /** Page number across the whole deep (stratum I has 1..n, stratum II continues). */
  n: number;
  biome: BiomeId;
  p: V3;
  /** The prop that holds it (kind 'haldenNote', feature 'note'). */
  prop: string;
  /** A page can tell where its biome's lair is. */
  revealsLair: string | null;
}

export interface ChestSite {
  id: string;
  biome: BiomeId;
  p: V3;
  prop: string;
  /** A tunnel chest, a vault's (behind a cracked wall), a mine camp's, a shrine's, a lair's reward. */
  kind: 'tunnel' | 'vault' | 'camp' | 'shrine' | 'lair' | 'oreRoom';
  /** 1..6: the loot table's tier (the stratum, +1 for vaults and lairs). */
  tier: number;
}

export interface NestSite {
  id: string;
  biome: BiomeId;
  p: V3;
  radius: number;
  /** The swarmer it breeds (MOBS may override with the roster's nest entry). */
  kind: MobKind | null;
}

export interface SpawnPoint {
  p: V3;
  biome: BiomeId;
  /** No generated light within 8 m. */
  dark: boolean;
  /** In a big cavern (room for brutes and flyers). */
  open: boolean;
  /** Under a roof within 4 m (ceiling ambushers). */
  ceiling: boolean;
}

export interface CavernSite {
  id: string;
  biome: BiomeId;
  centre: V3;
  /** Half extents (m). */
  radius: V3;
}

export interface HazardZone {
  id: string;
  kind: HazardKind;
  biome: BiomeId;
  centre: V3;
  radius: number;
  /** 0..1. */
  strength: number;
}

export interface StructureSite {
  id: string;
  kind: 'mineCamp' | 'shrine' | 'oreRoom' | 'vault' | 'setPiece' | 'lightPocket';
  biome: BiomeId;
  centre: V3;
  radius: number;
  /** A set piece's name (geode, stillLake, lanternVault, crystalChoir, emberDeep). */
  name?: string;
}

export interface CampSite {
  region: Region;
  fire: V3;
  /** The camp's stations (workbench, furnace, forge, alchemy) with their floor spots (LOOP places them). */
  stations: Array<{ station: 'workbench' | 'furnace' | 'forge' | 'alchemy' | 'storage' | 'bedroll'; p: V3; rotY: number }>;
}

export interface BiomeStats {
  /** Air columns that a walker can stand in (floor cells). */
  floorCells: number;
  oreVeins: number;
  oreBlocks: number;
  chests: number;
  props: number;
  lights: number;
  caverns: number;
  /** Chests per 25 m of walked floor, an estimate: chests / (floorCells / 25 / 3). */
  chestsPer25m: number;
}

/** Rebuild the layout's biomeAt after a structured clone (the worker) dropped it. */
export function withBiomeAt<T extends Omit<StratumLayout, 'biomeAt'>>(layout: T): T & Pick<StratumLayout, 'biomeAt'> {
  const sx = layout.world.sx;
  const sz = layout.world.sz;
  const [a, b] = layout.biomes;
  const map = layout.regionMap;
  const heart = layout.heart;
  const out = layout as T & Pick<StratumLayout, 'biomeAt'>;
  out.biomeAt = (x: number, y: number, z: number): BiomeId => {
    const xi = Math.max(0, Math.min(sx - 1, Math.floor(x)));
    const zi = Math.max(0, Math.min(sz - 1, Math.floor(z)));
    const r = map[xi + zi * sx];
    if (r === 2 || (heart && Math.hypot(x - heart.centre[0], (y - heart.centre[1]) * 1.5, z - heart.centre[2]) < heart.radius)) return 'heart';
    return r === 1 ? b : a;
  };
  return out;
}

/** Is this layout a stratum (the strata generator's) rather than the old hand-made world? */
export function isStratumLayout(l: WorldLayout): l is StratumLayout {
  return (l as Partial<StratumLayout>).stratum !== undefined && (l as Partial<StratumLayout>).regionMap !== undefined;
}
