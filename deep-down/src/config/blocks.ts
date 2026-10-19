import type { TextKey } from '../i18n';
import type { ItemId } from './items';
import { TILE } from './tiles';

/** Block ids stored in the voxel grid (one byte per voxel). */
export const B = {
  AIR: 0,
  SLATE: 1,
  DEEP_SLATE: 2,
  UMBER: 3,
  SOIL: 4,
  GRAVEL: 5,
  MOSS: 6,
  COPPER_ORE: 7,
  IRON_ORE: 8,
  CRYSTAL: 9,
  HARDENED_SLATE: 10,
  ANCIENT_BRICK: 11,
  ANCIENT_TILE: 12,
  CRUMBLING_BRICK: 13,
  GLYPH_STONE: 14,
  PLANK: 15,
  BEAM: 16,
  HEARTH: 17,
  BEDROCK: 18,
  /** Invisible, non-solid light emitters used by props (lanterns, fires, crystal shards). */
  LIGHT_AMBER: 19,
  LIGHT_EMBER: 20,
  LIGHT_CYAN: 21,
  LIGHT_ABYSS: 22,
  /** Dimmer amber for route lanterns: pools of warmth with darkness between them. */
  LIGHT_LAMP: 23,
  /**
   * Collision of built forms drawn as structure meshes (render/structures): solid, invisible
   * (the chunk mesher draws no faces for them), unbreakable. Masonry and timber variants.
   */
  STRUCTURE: 24,
  STRUCTURE_TIMBER: 25,
  /**
   * Stair flights drawn as structure meshes. A wedge (RAMP_*) is solid below its cell's diagonal,
   * descending toward +x, -x, +z or -z; the explorer walks on that plane (PlayerController), so
   * the fine stair mesh (0.25 m risers) never floats over 1 m voxel steps. A base cell
   * (RAMP_BASE_*) is the full cube under a wedge: it takes the wedge's plane (its own diagonal one
   * metre up) for the explorer's footing. Everything else (light, camera, mining rays,
   * reachability) sees solid cubes.
   */
  RAMP_PX: 26,
  RAMP_NX: 27,
  RAMP_PZ: 28,
  RAMP_NZ: 29,
  RAMP_BASE_PX: 30,
  RAMP_BASE_NX: 31,
  RAMP_BASE_PZ: 32,
  RAMP_BASE_NZ: 33,
} as const;

export type SoundKind = 'stone' | 'metal' | 'crystal' | 'wood' | 'soil' | 'ancient';

/** Minimum pickaxe tier meaning "cannot be mined by any tool in this build". */
export const UNBREAKABLE_TIER = 99;

export interface BlockDef {
  id: number;
  name: TextKey;
  /** Collides and blocks light. */
  solid: boolean;
  /** Produces faces in the chunk mesh. */
  visible: boolean;
  /** Hit points in pickaxe-power units. */
  hardness: number;
  /** Minimum pickaxe tier able to break it. */
  tier: number;
  /** Why it cannot be mined at any tier (shown to the player). */
  protectedReason?: 'unbreakable' | 'protected';
  drop: { item: ItemId; min: number; max: number; chance: number } | null;
  sound: SoundKind;
  tiles: { top: number; side: number; bottom: number };
  /** Emitted light, linear RGB in [0, 1] (scaled by LIGHT.maxLevel). */
  emission: [number, number, number] | null;
  /** Shader emissive strength for texels flagged emissive in the texture alpha channel. */
  glow: number;
  /** sRGB colors for debris particles. */
  debris: readonly number[];
}

const same = (tile: number) => ({ top: tile, side: tile, bottom: tile });

const defs: BlockDef[] = [];

function def(d: Omit<BlockDef, 'glow' | 'emission' | 'debris'> & Partial<Pick<BlockDef, 'glow' | 'emission' | 'debris'>>): void {
  defs[d.id] = { glow: 0, emission: null, debris: [0x55606e, 0x3c4450], ...d };
}

const noDrop = null;
const stoneDrop = { item: 'stone' as const, min: 1, max: 1, chance: 1 };

def({ id: B.AIR, name: 'block.air', solid: false, visible: false, hardness: 0, tier: 0, drop: noDrop, sound: 'stone', tiles: same(0) });
def({ id: B.SLATE, name: 'block.slate', solid: true, visible: true, hardness: 3, tier: 1, drop: stoneDrop, sound: 'stone', tiles: same(TILE.slate), debris: [0x363b44, 0x252a33, 0x41454d] });
def({ id: B.DEEP_SLATE, name: 'block.deepSlate', solid: true, visible: true, hardness: 4, tier: 1, drop: stoneDrop, sound: 'stone', tiles: same(TILE.deepSlate), debris: [0x2e3440, 0x252a33, 0x3b4250] });
def({ id: B.UMBER, name: 'block.umber', solid: true, visible: true, hardness: 3, tier: 1, drop: stoneDrop, sound: 'stone', tiles: same(TILE.umber), debris: [0x4a4b4d, 0x37383b, 0x404144] });
def({ id: B.SOIL, name: 'block.soil', solid: true, visible: true, hardness: 1.4, tier: 1, drop: { item: 'rootFibre', min: 1, max: 1, chance: 0.45 }, sound: 'soil', tiles: same(TILE.soil), debris: [0x4a3a2e, 0x3a2d23] });
def({ id: B.GRAVEL, name: 'block.gravel', solid: true, visible: true, hardness: 1.6, tier: 1, drop: { item: 'stone', min: 1, max: 1, chance: 0.5 }, sound: 'soil', tiles: same(TILE.gravel), debris: [0x2d323b, 0x3a3d42] });
def({ id: B.MOSS, name: 'block.moss', solid: true, visible: true, hardness: 2.6, tier: 1, drop: stoneDrop, sound: 'soil', tiles: { top: TILE.mossTop, side: TILE.mossSide, bottom: TILE.slate }, glow: 0, debris: [0x2f5d55, 0x4d5666] });
def({ id: B.COPPER_ORE, name: 'block.copperOre', solid: true, visible: true, hardness: 4, tier: 1, drop: { item: 'copperOre', min: 1, max: 2, chance: 1 }, sound: 'metal', tiles: same(TILE.copperOre), debris: [0xa95628, 0x2d323b, 0x2f4c3e] });
def({ id: B.IRON_ORE, name: 'block.ironOre', solid: true, visible: true, hardness: 6, tier: 2, drop: { item: 'ironOre', min: 1, max: 2, chance: 1 }, sound: 'metal', tiles: same(TILE.ironOre), debris: [0x5e6269, 0x222730, 0x572b20] });
def({
  id: B.CRYSTAL, name: 'block.crystal', solid: true, visible: true, hardness: 3.5, tier: 1,
  drop: { item: 'glimmerShard', min: 1, max: 2, chance: 1 }, sound: 'crystal', tiles: same(TILE.crystal),
  // A seam in dark rock, not a lamp: enough light to find it, the clusters carry the glow.
  emission: [0.1, 0.38, 0.48], glow: 1.3, debris: [0x52e8f5, 0x9ff6ff, 0x1b8aa8],
});
def({ id: B.HARDENED_SLATE, name: 'block.hardenedSlate', solid: true, visible: true, hardness: 7, tier: 2, drop: stoneDrop, sound: 'stone', tiles: same(TILE.hardenedSlate), debris: [0x1f222b, 0x2b2f3a] });
def({ id: B.ANCIENT_BRICK, name: 'block.ancientBrick', solid: true, visible: true, hardness: 999, tier: UNBREAKABLE_TIER, protectedReason: 'unbreakable', drop: noDrop, sound: 'ancient', tiles: { top: TILE.ancientBrickTop, side: TILE.ancientBrick, bottom: TILE.ancientBrickTop }, debris: [0x535a6a, 0x434957] });
def({ id: B.ANCIENT_TILE, name: 'block.ancientTile', solid: true, visible: true, hardness: 999, tier: UNBREAKABLE_TIER, protectedReason: 'unbreakable', drop: noDrop, sound: 'ancient', tiles: { top: TILE.ancientTile, side: TILE.ancientBrick, bottom: TILE.ancientBrickTop }, glow: 0, debris: [0x535a6a] });
def({ id: B.CRUMBLING_BRICK, name: 'block.crumblingBrick', solid: true, visible: true, hardness: 2, tier: 1, drop: stoneDrop, sound: 'ancient', tiles: same(TILE.crumblingBrick), glow: 1.4, debris: [0x5c6474, 0x474e5c] });
def({
  id: B.GLYPH_STONE, name: 'block.glyphStone', solid: true, visible: true, hardness: 999, tier: UNBREAKABLE_TIER, protectedReason: 'unbreakable',
  drop: noDrop, sound: 'ancient', tiles: { top: TILE.ancientBrickTop, side: TILE.glyphStone, bottom: TILE.ancientBrickTop },
  // Inscriptions breathe a faint cold light along their course; the carved runes themselves
  // wake near the lantern (terrain shader). They must never flood a room.
  emission: [0.05, 0.23, 0.28], glow: 1.25, debris: [0x535a6a],
});
def({ id: B.PLANK, name: 'block.plank', solid: true, visible: true, hardness: 999, tier: UNBREAKABLE_TIER, protectedReason: 'protected', drop: noDrop, sound: 'wood', tiles: same(TILE.plank), debris: [0x7a5536, 0x5c3f28] });
def({ id: B.BEAM, name: 'block.beam', solid: true, visible: true, hardness: 999, tier: UNBREAKABLE_TIER, protectedReason: 'protected', drop: noDrop, sound: 'wood', tiles: { top: TILE.beamEnd, side: TILE.beamSide, bottom: TILE.beamEnd }, debris: [0x5c3f28] });
def({ id: B.HEARTH, name: 'block.hearth', solid: true, visible: true, hardness: 999, tier: UNBREAKABLE_TIER, protectedReason: 'protected', drop: noDrop, sound: 'stone', tiles: same(TILE.hearth), glow: 1.1, debris: [0x332b25] });
def({ id: B.BEDROCK, name: 'block.bedrock', solid: true, visible: true, hardness: 999, tier: UNBREAKABLE_TIER, protectedReason: 'unbreakable', drop: noDrop, sound: 'ancient', tiles: same(TILE.bedrock), debris: [0x14161c] });
// Warm lights are amber-gold, not red-orange: the light volume is squared-ish on its way to the
// shader (lightSample: pow 1.55), and a light with too little green mixes with the cool open fill
// on the bluish stone into rose and mauve at the rim of every pool. With green at ~0.6 of red
// after that curve the rim passes through warm grey into blue-black instead.
def({ id: B.LIGHT_AMBER, name: 'block.light', solid: false, visible: false, hardness: 0, tier: 0, drop: noDrop, sound: 'stone', tiles: same(0), emission: [1.0, 0.74, 0.46] });
def({ id: B.LIGHT_EMBER, name: 'block.light', solid: false, visible: false, hardness: 0, tier: 0, drop: noDrop, sound: 'stone', tiles: same(0), emission: [1.0, 0.6, 0.32] });
def({ id: B.LIGHT_CYAN, name: 'block.light', solid: false, visible: false, hardness: 0, tier: 0, drop: noDrop, sound: 'stone', tiles: same(0), emission: [0.13, 0.51, 0.66] });
// Route lamps are a deeper amber than the explorer's pale-gold lantern, so their pools read as
// separate islands of warmth.
def({ id: B.LIGHT_LAMP, name: 'block.light', solid: false, visible: false, hardness: 0, tier: 0, drop: noDrop, sound: 'stone', tiles: same(0), emission: [1.0, 0.7, 0.36] });
def({ id: B.LIGHT_ABYSS, name: 'block.light', solid: false, visible: false, hardness: 0, tier: 0, drop: noDrop, sound: 'stone', tiles: same(0), emission: [0.5, 0.32, 1.0] });
// Built forms drawn as structure meshes: collision only (no chunk faces), never mined.
const structureStone = { solid: true, visible: false, hardness: 999, tier: UNBREAKABLE_TIER, protectedReason: 'unbreakable', drop: noDrop, sound: 'ancient', tiles: { top: TILE.ancientBrickTop, side: TILE.ancientBrick, bottom: TILE.ancientBrickTop }, debris: [0x535a6a, 0x434957] } as const;
def({ id: B.STRUCTURE, name: 'block.ancientBrick', ...structureStone });
def({ id: B.STRUCTURE_TIMBER, name: 'block.beam', solid: true, visible: false, hardness: 999, tier: UNBREAKABLE_TIER, protectedReason: 'protected', drop: noDrop, sound: 'wood', tiles: { top: TILE.beamEnd, side: TILE.beamSide, bottom: TILE.beamEnd }, debris: [0x5c3f28] });
for (const id of [B.RAMP_PX, B.RAMP_NX, B.RAMP_PZ, B.RAMP_NZ, B.RAMP_BASE_PX, B.RAMP_BASE_NX, B.RAMP_BASE_PZ, B.RAMP_BASE_NZ]) def({ id, name: 'block.ancientTile', ...structureStone });

export const BLOCKS: readonly BlockDef[] = defs;
export const BLOCK_COUNT = defs.length;

// Flat lookup tables for hot loops (mesher, physics, light) - avoid property access per voxel.
export const SOLID = new Uint8Array(256);
export const VISIBLE = new Uint8Array(256);
export const EMIT_R = new Uint8Array(256);
export const EMIT_G = new Uint8Array(256);
export const EMIT_B = new Uint8Array(256);
export const TILE_TOP = new Uint8Array(256);
export const TILE_SIDE = new Uint8Array(256);
export const TILE_BOTTOM = new Uint8Array(256);
export const GLOW = new Float32Array(256);

for (const d of defs) {
  SOLID[d.id] = d.solid ? 1 : 0;
  VISIBLE[d.id] = d.visible ? 1 : 0;
  if (d.emission) {
    EMIT_R[d.id] = Math.round(d.emission[0] * 255);
    EMIT_G[d.id] = Math.round(d.emission[1] * 255);
    EMIT_B[d.id] = Math.round(d.emission[2] * 255);
  }
  TILE_TOP[d.id] = d.tiles.top;
  TILE_SIDE[d.id] = d.tiles.side;
  TILE_BOTTOM[d.id] = d.tiles.bottom;
  GLOW[d.id] = d.glow;
}

/**
 * Optional side-face variants chosen per block position, so repeated materials (glyph
 * frames, brick walls) do not tile visibly. Up to 4 variants per block.
 */
export const SIDE_VARIANTS = new Uint8Array(256 * 4);
export const VARIANT_COUNT = new Uint8Array(256);
function setVariants(id: number, tiles: number[]): void {
  VARIANT_COUNT[id] = tiles.length;
  tiles.forEach((t, i) => (SIDE_VARIANTS[id * 4 + i] = t));
}
setVariants(B.GLYPH_STONE, [TILE.glyphStone, TILE.glyphStoneB, TILE.glyphStoneC]);
setVariants(B.ANCIENT_BRICK, [TILE.ancientBrick, TILE.ancientBrick, TILE.ancientBrick, TILE.ancientBrickCarved]);

export const isEmitter = (id: number): boolean => (EMIT_R[id] | EMIT_G[id] | EMIT_B[id]) !== 0;

/**
 * Stair footing per block id (PlayerController): 0 = an ordinary cube; otherwise
 * direction (1 +x, 2 -x, 3 +z, 4 -z, the way the flight descends) + 4 x the height of the plane
 * above the cell's own diagonal (0 for a wedge, 1 for the base cell under it). The plane rises
 * one metre per metre: at the uphill face of the cell it is at y + 1 + lift, at the downhill
 * face at y + lift.
 */
export const RAMP = new Uint8Array(256);
RAMP[B.RAMP_PX] = 1;
RAMP[B.RAMP_NX] = 2;
RAMP[B.RAMP_PZ] = 3;
RAMP[B.RAMP_NZ] = 4;
RAMP[B.RAMP_BASE_PX] = 5;
RAMP[B.RAMP_BASE_NX] = 6;
RAMP[B.RAMP_BASE_PZ] = 7;
RAMP[B.RAMP_BASE_NZ] = 8;

/**
 * Height of the stair plane of ramp cell (cx, cy, cz) with RAMP code `r` at the point (x, z). Uphill
 * of the cell the plane stops at its top edge (a flight meets its landing level).
 */
export function rampPlane(r: number, cx: number, cy: number, cz: number, x: number, z: number): number {
  const dir = ((r - 1) & 3) + 1;
  const lift = (r - 1) >> 2;
  const f = dir === 1 ? x - cx : dir === 2 ? cx + 1 - x : dir === 3 ? z - cz : cz + 1 - z;
  return cy + lift + 1 - Math.max(0, f);
}

export function blockDef(id: number): BlockDef {
  return defs[id] ?? defs[B.AIR];
}
