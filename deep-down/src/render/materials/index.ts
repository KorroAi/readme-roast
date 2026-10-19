import { B } from '../../config/blocks';
import { MAT_SIZE, MatCanvas, rngFor } from './paint';
import { PAINTERS } from './painters';
import { beginHostCache, endHostCache } from './rock';

/**
 * Terrain material library.
 *
 * Terrain is no longer textured per block. Each material is a seamless MAT_SIZE texture
 * sampled in world space (16 texels per metre, 8 m period), so a wall of one material is one
 * continuous surface and the voxel grid disappears from the texture. Where two materials of the
 * same family meet, the terrain shader draws an irregular, height-driven boundary instead of
 * the cube edge (see terrainMaterial.ts).
 *
 * The 16 px tile atlas (render/textures.ts) is still used for icons, drops, crack stages and
 * the rune decals carved into glyph stones.
 */

export const MATERIAL_NAMES = [
  'stoneSide',
  'stoneTop',
  'deepSide',
  'deepTop',
  'weatheredSide',
  'weatheredTop',
  'dampSide',
  'dampTop',
  'soil',
  'soilSide',
  'gravel',
  'copperVein',
  'copperTop',
  'ironVein',
  'ironTop',
  'crystal',
  'sealStone',
  'masonry',
  'masonryTop',
  'floorSlab',
  'crumbling',
  'plank',
  'beamSide',
  'beamEnd',
  'hearth',
  'bedrock',
] as const;

export type MaterialName = (typeof MATERIAL_NAMES)[number];
export const MAT = Object.fromEntries(MATERIAL_NAMES.map((n, i) => [n, i])) as Record<MaterialName, number>;

export interface MaterialInfo {
  /** Emissive strength. If > 0, the texture alpha is an emissive mask instead of a height. */
  glow: number;
}

export const MATERIAL_INFO: Record<MaterialName, MaterialInfo> = {
  stoneSide: { glow: 0 },
  stoneTop: { glow: 0 },
  deepSide: { glow: 0 },
  deepTop: { glow: 0 },
  weatheredSide: { glow: 0 },
  weatheredTop: { glow: 0 },
  // Damp stone does not glow: lichen is a muted crust, so cyan stays rare (minerals, the
  // builders' script, progression) and its alpha keeps working as a height for boundaries.
  dampSide: { glow: 0 },
  dampTop: { glow: 0 },
  soil: { glow: 0 },
  soilSide: { glow: 0 },
  gravel: { glow: 0 },
  copperVein: { glow: 0 },
  copperTop: { glow: 0 },
  ironVein: { glow: 0 },
  ironTop: { glow: 0 },
  crystal: { glow: 0.75 },
  sealStone: { glow: 0 },
  masonry: { glow: 0 },
  masonryTop: { glow: 0 },
  floorSlab: { glow: 0 },
  crumbling: { glow: 0.9 },
  plank: { glow: 0 },
  beamSide: { glow: 0 },
  beamEnd: { glow: 0 },
  hearth: { glow: 0.8 },
  bedrock: { glow: 0 },
};

/** Material families: only materials of the same non-zero family blend at their boundaries. */
export const FAMILY = { NONE: 0, GEOLOGY: 1, CRYSTAL: 2, MASONRY: 3 } as const;

export interface BlockSurface {
  top: MaterialName;
  side: MaterialName;
  bottom: MaterialName;
  family: number;
  /**
   * How far the terrain may be sculpted around this block (0 = straight edges for timber,
   * 1 = chipped masonry, 2 = firm rock, 3 = natural rock). A vertex takes the lowest rigidity
   * of the solid blocks around it, so displaced vertices are shared exactly and never crack.
   */
  rigidity: 0 | 1 | 2 | 3;
  /** Carved rune decal (local per-block UV) over the material, glowing where inked. */
  rune?: boolean;
}

const rock = (top: MaterialName, side: MaterialName, bottom: MaterialName = side): BlockSurface => ({ top, side, bottom, family: FAMILY.GEOLOGY, rigidity: 3 });

export const BLOCK_SURFACES: Record<number, BlockSurface> = {
  [B.SLATE]: rock('stoneTop', 'stoneSide'),
  [B.DEEP_SLATE]: rock('deepTop', 'deepSide'),
  [B.UMBER]: rock('weatheredTop', 'weatheredSide'),
  [B.SOIL]: rock('soil', 'soilSide'),
  [B.GRAVEL]: rock('gravel', 'gravel'),
  [B.MOSS]: rock('dampTop', 'dampSide', 'stoneSide'),
  [B.COPPER_ORE]: rock('copperTop', 'copperVein'),
  [B.IRON_ORE]: rock('ironTop', 'ironVein'),
  [B.BEDROCK]: rock('bedrock', 'bedrock'),
  [B.CRYSTAL]: { top: 'crystal', side: 'crystal', bottom: 'crystal', family: FAMILY.CRYSTAL, rigidity: 1 },
  [B.HARDENED_SLATE]: { top: 'sealStone', side: 'sealStone', bottom: 'sealStone', family: FAMILY.NONE, rigidity: 2 },
  [B.ANCIENT_BRICK]: { top: 'masonryTop', side: 'masonry', bottom: 'masonryTop', family: FAMILY.MASONRY, rigidity: 1 },
  [B.ANCIENT_TILE]: { top: 'floorSlab', side: 'masonry', bottom: 'masonryTop', family: FAMILY.MASONRY, rigidity: 1 },
  [B.CRUMBLING_BRICK]: { top: 'crumbling', side: 'crumbling', bottom: 'crumbling', family: FAMILY.MASONRY, rigidity: 1 },
  [B.GLYPH_STONE]: { top: 'masonryTop', side: 'masonry', bottom: 'masonryTop', family: FAMILY.MASONRY, rigidity: 1, rune: true },
  [B.PLANK]: { top: 'plank', side: 'plank', bottom: 'plank', family: FAMILY.NONE, rigidity: 0 },
  [B.BEAM]: { top: 'beamEnd', side: 'beamSide', bottom: 'beamEnd', family: FAMILY.NONE, rigidity: 0 },
  [B.HEARTH]: { top: 'hearth', side: 'hearth', bottom: 'hearth', family: FAMILY.NONE, rigidity: 1 },
};

/** Per block id: lowest-rigidity lookup used by the mesher (255 = not solid / no constraint). */
export const RIGIDITY = new Uint8Array(256).fill(255);
/** Per block id: material layer for top / side / bottom faces (mesher vertex data). */
export const MAT_TOP = new Uint8Array(256);
export const MAT_SIDE = new Uint8Array(256);
export const MAT_BOTTOM = new Uint8Array(256);
/** Per block id: material family (0 = never blends) and rune decal flag (0/1). */
export const FAMILY_OF = new Uint8Array(256);
export const RUNE_FLAG = new Uint8Array(256);
for (const [idStr, s] of Object.entries(BLOCK_SURFACES)) {
  const id = Number(idStr);
  RIGIDITY[id] = s.rigidity;
  FAMILY_OF[id] = s.family;
  RUNE_FLAG[id] = s.rune ? 1 : 0;
  MAT_TOP[id] = MAT[s.top];
  MAT_SIDE[id] = MAT[s.side];
  MAT_BOTTOM[id] = MAT[s.bottom];
}

export interface MaterialAtlas {
  size: number;
  layers: number;
  /** RGBA8, layer-major. */
  data: Uint8Array;
}

/** Paint every material layer (deterministic). */
export function generateMaterials(): MaterialAtlas {
  const layers = MATERIAL_NAMES.length;
  const data = new Uint8Array(MAT_SIZE * MAT_SIZE * 4 * layers);
  beginHostCache();
  try {
    MATERIAL_NAMES.forEach((name, layer) => {
      const c = new MatCanvas();
      PAINTERS[name](c, rngFor(name));
      c.toBytes(data, layer * MAT_SIZE * MAT_SIZE * 4);
    });
  } finally {
    endHostCache();
  }
  return { size: MAT_SIZE, layers, data };
}

export { MAT_SIZE };
