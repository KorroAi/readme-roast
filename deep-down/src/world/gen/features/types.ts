import type { Region } from '../types';

/** A world point (metres, or a voxel cell where the field says so). */
export type V3 = [number, number, number];

/**
 * Feature pass output (world variety, final pass W2): the places built after the key lights, and
 * the runtime data the game needs to bring them to life (rides, rune doors, moths, the living
 * rock and the glimmer bloom). Optional on WorldLayout, so older code and the zone worker's
 * `...rest` carry it untouched.
 */
export interface FeatureLayout {
  /** Every voxel the pass may write lies inside one of these boxes (containment test). */
  boxes: Region[];
  /** Points of interest of the new places (spacing tool, reachability tests, pockets). */
  pois: FeaturePoi[];
  /** Rides between two stand cells (the hoist, the rope down to the rift floor). */
  links: FeatureLink[];
  runeDoors: RuneDoorDef[];
  mothAnchors: MothAnchorDef[];
  /** Walls that re-roll their ore every expedition ("the deep breathes"). */
  living: LivingSite[];
  /** Where the glimmer bloom may appear (one per expedition, never twice in a row at one site). */
  blooms: BloomSite[];
  /** Named areas for rumours and the Survey Table (W3): a centre and a radius. */
  areas: FeatureArea[];
  sockets: { fossil: V3[] };
  /** Spots for special events (content W4): a creaking adit, a tremor, a surge, headframe dust. */
  eventSites: Array<{ id: string; p: V3; r: number; tag: 'yardCeiling' | 'riftFloor' | 'bridgeMid' | 'adit' }>;
}

export interface FeaturePoi {
  id: string;
  p: V3;
  kind: 'sight' | 'pickup' | 'landmark';
  /** The reachability test requires a walk (with barriers open and rides on) to reach it. */
  mustReach: boolean;
}

export type FeatureLinkId = 'hoist' | 'riftRope';

export interface FeatureLink {
  id: FeatureLinkId;
  kind: 'hoist' | 'rope';
  /** Feet positions (cell centre x/z, floor-top y) of the two stands. */
  top: V3;
  bottom: V3;
  /** The ride polyline from top to bottom (feet positions); rides up run it backwards. */
  path: V3[];
  /** Metres per second along the path. */
  speedDown: number;
  speedUp: number;
  /** The hoist is chained: the first ride must start from the bottom (it releases the chain). */
  lock?: 'releaseAtBottom';
}

export interface RuneDoorDef {
  id: string;
  /** Door cells (ANCIENT_BRICK): the door is open once every one of them is air. */
  cells: V3[];
  /** Glyph lintel cells over the door. */
  lintel: V3[];
  /** Where the explorer stands to wake it (feet), the wake radius (m) and the hold time (s). */
  wake: V3;
  radius: number;
  hold: number;
  /** Lantern tier needed (1 = any lit lantern; 2 = the copper lantern). */
  minLanternTier: number;
}

export interface MothAnchorDef {
  id: string;
  p: V3;
  count: number;
  /** Roost radius (m). */
  radius: number;
  /** A secret anchor: two or three moths keep tapping in place (the slit, a door). */
  secret?: boolean;
}

export interface LivingSite {
  id: 'haldenFace' | 'riftWalls' | 'emberWalls';
  /** Voxel indices of the living cells, and the host rock each one returns to. */
  cells: Int32Array;
  host: Uint8Array;
  /** Exact counts per expedition: these ores, the rest host rock. */
  table: Array<{ block: number; count: number }>;
  box: Region;
  /** Area id (see FeatureLayout.areas) for rumours. */
  area: string;
}

export interface BloomSite {
  id: string;
  /** Prop base position (feet of the cluster) and turn. */
  p: V3;
  rotY: number;
  area: string;
}

export interface FeatureArea {
  id: string;
  /** Rumour text key: `area.<id>` in i18n (en/world.ts). */
  p: V3;
  r: number;
}
