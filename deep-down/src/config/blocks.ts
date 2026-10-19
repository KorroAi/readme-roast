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
def({ id: B.SOIL, name: 'block.soil', solid: true, visible: true, hardness: 1.4, tier: 1, drop: noDrop, sound: 'soil', tiles: same(TILE.soil), debris: [0x4a3a2e, 0x3a2d23] });
def({ id: B.GRAVEL, name: 'block.gravel', solid: true, visible: true, hardness: 1.6, tier: 1, drop: { item: 'stone', min: 1, max: 1, chance: 0.5 }, sound: 'soil', tiles: same(TILE.gravel), debris: [0x2d323b, 0x3a3d42] });
def({ id: B.MOSS, name: 'block.moss', solid: true, visible: true, hardness: 2.6, tier: 1, drop: stoneDrop, sound: 'soil', tiles: { top: TILE.mossTop, side: TILE.mossSide, bottom: TILE.slate }, glow: 0, debris: [0x2f5d55, 0x4d5666] });
def({ id: B.COPPER_ORE, name: 'block.copperOre', solid: true, visible: true, hardness: 4, tier: 1, drop: { item: 'copperOre', min: 1, max: 2, chance: 1 }, sound: 'metal', tiles: same(TILE.copperOre), debris: [0xa95628, 0x2d323b, 0x2f4c3e] });
def({ id: B.IRON_ORE, name: 'block.ironOre', solid: true, visible: true, hardness: 6, tier: 2, drop: { item: 'ironOre', min: 1, max: 1, chance: 1 }, sound: 'metal', tiles: same(TILE.ironOre), debris: [0x5e6269, 0x222730, 0x572b20] });
def({
  id: B.CRYSTAL, name: 'block.crystal', solid: true, visible: true, hardness: 3.5, tier: 1,
  drop: { item: 'glimmerShard', min: 1, max: 2, chance: 1 }, sound: 'crystal', tiles: same(TILE.crystal),
  // A seam in dark rock, not a lamp: enough light to find it, the clusters carry the glow.
  emission: [0.12, 0.44, 0.56], glow: 1.3, debris: [0x52e8f5, 0x9ff6ff, 0x1b8aa8],
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
  emission: [0.025, 0.1, 0.13], glow: 1.25, debris: [0x535a6a],
});
def({ id: B.PLANK, name: 'block.plank', solid: true, visible: true, hardness: 999, tier: UNBREAKABLE_TIER, protectedReason: 'protected', drop: noDrop, sound: 'wood', tiles: same(TILE.plank), debris: [0x7a5536, 0x5c3f28] });
def({ id: B.BEAM, name: 'block.beam', solid: true, visible: true, hardness: 999, tier: UNBREAKABLE_TIER, protectedReason: 'protected', drop: noDrop, sound: 'wood', tiles: { top: TILE.beamEnd, side: TILE.beamSide, bottom: TILE.beamEnd }, debris: [0x5c3f28] });
def({ id: B.HEARTH, name: 'block.hearth', solid: true, visible: true, hardness: 999, tier: UNBREAKABLE_TIER, protectedReason: 'protected', drop: noDrop, sound: 'stone', tiles: same(TILE.hearth), glow: 1.1, debris: [0x332b25] });
def({ id: B.BEDROCK, name: 'block.bedrock', solid: true, visible: true, hardness: 999, tier: UNBREAKABLE_TIER, protectedReason: 'unbreakable', drop: noDrop, sound: 'ancient', tiles: same(TILE.bedrock), debris: [0x14161c] });
def({ id: B.LIGHT_AMBER, name: 'block.light', solid: false, visible: false, hardness: 0, tier: 0, drop: noDrop, sound: 'stone', tiles: same(0), emission: [1.0, 0.7, 0.42] });
def({ id: B.LIGHT_EMBER, name: 'block.light', solid: false, visible: false, hardness: 0, tier: 0, drop: noDrop, sound: 'stone', tiles: same(0), emission: [1.0, 0.6, 0.32] });
def({ id: B.LIGHT_CYAN, name: 'block.light', solid: false, visible: false, hardness: 0, tier: 0, drop: noDrop, sound: 'stone', tiles: same(0), emission: [0.16, 0.6, 0.76] });
def({ id: B.LIGHT_LAMP, name: 'block.light', solid: false, visible: false, hardness: 0, tier: 0, drop: noDrop, sound: 'stone', tiles: same(0), emission: [0.86, 0.56, 0.31] });
def({ id: B.LIGHT_ABYSS, name: 'block.light', solid: false, visible: false, hardness: 0, tier: 0, drop: noDrop, sound: 'stone', tiles: same(0), emission: [0.5, 0.32, 1.0] });

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

export function blockDef(id: number): BlockDef {
  return defs[id] ?? defs[B.AIR];
}
