import { B } from '../../config/blocks';
import { MAT_SIZE, MatCanvas, rngFor } from './paint';
import { PAINTERS, type MaterialPainter } from './painters';
import { echoCrystal } from './minerals';
import { beginHostCache, endHostCache } from './rock';
import { recolor } from './recolor';
import { copperVein, crystal, ironVein } from './minerals';
import { beamSide, plank } from './timber';
import { dampSide, weatheredSide } from './rock';
import { masonry } from './masonry';
import { soil } from './earth';
import { BIOME_BLOCKS, EMITTER_BASE, SLOT } from '../../config/blocks';

/**
 * Terrain material library.
 *
 * Terrain is no longer textured per block. Each material is a seamless MAT_SIZE texture
 * sampled in world space (16 texels per metre, 8 m period), so a wall of one material is one
 * continuous surface and the voxel grid disappears from the texture. Where two materials of the
 * same family meet, the terrain shader draws an irregular, height-driven boundary instead of
 * the cube edge (see terrainMaterial.ts). Masonry layers are course libraries instead: the
 * shader lays their courses in world space (courses.ts), so dressed stone never repeats.
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
  // Megalithic twins of the wall layers: never on a block, chosen by the shader per course
  // stretch (see courses.ts).
  'masonryB',
  'crumblingB',
  // The builders' script: eight carved lines of inscription (alpha = groove / ink mask), laid
  // along an inscription band by the terrain shader. Never on a block face by itself.
  'script',
  // The deep tier (final pass W3): Echo crystal, the crystal bleached pale (minerals.ts echoCrystal).
  'echoCrystal',
  // The descent (W1): ores, gems and fittings of biomes 0-3 recoloured from the existing painters
  // (recolor.ts) until W2's painters land, plus the chest shell, gate stone, fossil and gold leaf.
  'copperOre',
  'amberVein',
  'tinVein',
  'jadeVein',
  'quartzVein',
  'sapphireVein',
  'silverVein',
  'brassPlate',
  'rootWood',
  'glowroot',
  'gemRose',
  'gemJade',
  'gemViolet',
  'goldLeaf',
  'fossilBone',
  'chestShell',
  'gateStone',
  'turf',
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
  crystal: { glow: 0.85 },
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
  masonryB: { glow: 0 },
  crumblingB: { glow: 0.9 },
  script: { glow: 0 },
  echoCrystal: { glow: 0.95 },
  copperOre: { glow: 0 },
  amberVein: { glow: 0.9 },
  tinVein: { glow: 0 },
  jadeVein: { glow: 0.9 },
  quartzVein: { glow: 0 },
  sapphireVein: { glow: 0.95 },
  silverVein: { glow: 0 },
  brassPlate: { glow: 0 },
  rootWood: { glow: 0 },
  glowroot: { glow: 1.2 },
  gemRose: { glow: 1.0 },
  gemJade: { glow: 1.0 },
  gemViolet: { glow: 1.0 },
  goldLeaf: { glow: 0.6 },
  fossilBone: { glow: 0 },
  chestShell: { glow: 0 },
  gateStone: { glow: 0 },
  turf: { glow: 0 },
};

/**
 * Course libraries (see courses.ts): every masonry-family layer. The terrain shader lays their
 * strips course by course, so they wrap along x (pieces end on a joint) but never vertically.
 */
export const COURSE_LAYERS: readonly MaterialName[] = ['masonry', 'masonryTop', 'floorSlab', 'crumbling', 'masonryB', 'crumblingB'];

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
  // The deep tier (final pass W3): Echo crystal, and Ironbound (the seal-stone with a rune band).
  [B.ECHO_CRYSTAL]: { top: 'echoCrystal', side: 'echoCrystal', bottom: 'echoCrystal', family: FAMILY.CRYSTAL, rigidity: 1 },
  [B.IRONBOUND]: { top: 'sealStone', side: 'sealStone', bottom: 'sealStone', family: FAMILY.NONE, rigidity: 2, rune: true },
};

// ---- The descent's blocks (config/blocks: 41..63 specials, 64 + 8 b + slot, 176.. emitters) ----
const flat = (m: MaterialName, family: number = FAMILY.NONE, rigidity: 0 | 1 | 2 | 3 = 1): BlockSurface => ({ top: m, side: m, bottom: m, family, rigidity });
BLOCK_SURFACES[B.CHEST_SHELL] = flat('chestShell', FAMILY.NONE, 0);
BLOCK_SURFACES[B.GATE_STONE] = { top: 'masonryTop', side: 'gateStone', bottom: 'masonryTop', family: FAMILY.NONE, rigidity: 1 };
BLOCK_SURFACES[B.SEAL_STONE] = flat('sealStone', FAMILY.NONE, 2);
BLOCK_SURFACES[B.FOSSIL] = rock('fossilBone', 'fossilBone');
BLOCK_SURFACES[B.GEODE] = flat('crystal', FAMILY.CRYSTAL, 1);
BLOCK_SURFACES[B.GOLDEN] = rock('goldLeaf', 'goldLeaf');
BLOCK_SURFACES[B.BOULDER] = rock('deepTop', 'deepSide');
BLOCK_SURFACES[B.TOPSOIL] = rock('turf', 'turf');
/** W1 kits per biome slot (hostA, hostB, soft, hard, ore, rich, gem, special); biomes 4..13 reuse them. */
const KIT_SURFACES: ReadonlyArray<ReadonlyArray<BlockSurface>> = [
  [rock('soil', 'soilSide'), rock('gravel', 'gravel'), rock('weatheredTop', 'weatheredSide'), flat('rootWood', FAMILY.NONE, 2), rock('copperOre', 'copperOre'), flat('amberVein', FAMILY.CRYSTAL), flat('gemRose', FAMILY.CRYSTAL), flat('rootWood', FAMILY.NONE, 2)],
  [rock('dampTop', 'dampSide', 'stoneSide'), rock('stoneTop', 'stoneSide'), rock('dampTop', 'dampSide'), flat('rootWood', FAMILY.NONE, 2), rock('tinVein', 'tinVein'), flat('jadeVein', FAMILY.CRYSTAL), flat('gemJade', FAMILY.CRYSTAL), flat('glowroot', FAMILY.CRYSTAL)],
  [rock('stoneTop', 'stoneSide'), rock('deepTop', 'deepSide'), flat('echoCrystal', FAMILY.CRYSTAL), flat('crystal', FAMILY.CRYSTAL), rock('quartzVein', 'quartzVein'), flat('sapphireVein', FAMILY.CRYSTAL), flat('gemViolet', FAMILY.CRYSTAL), flat('crystal', FAMILY.CRYSTAL)],
  [rock('deepTop', 'deepSide'), { top: 'masonryTop', side: 'masonry', bottom: 'masonryTop', family: FAMILY.MASONRY, rigidity: 1 }, flat('plank', FAMILY.NONE, 0), flat('brassPlate', FAMILY.NONE, 1), rock('ironTop', 'ironVein'), rock('silverVein', 'silverVein'), flat('gemRose', FAMILY.CRYSTAL), { top: 'beamEnd', side: 'beamSide', bottom: 'beamEnd', family: FAMILY.NONE, rigidity: 0 }],
];
for (let b = 0; b < BIOME_BLOCKS; b++)
  for (let slot = 0; slot < 8; slot++) BLOCK_SURFACES[64 + 8 * b + slot] = KIT_SURFACES[b % KIT_SURFACES.length][slot];
const EMITTER_MATS: MaterialName[] = ['glowroot', 'crystal', 'amberVein', 'goldLeaf', 'gemViolet', 'jadeVein', 'sapphireVein', 'amberVein', 'amberVein', 'echoCrystal', 'goldLeaf', 'sapphireVein', 'goldLeaf', 'gemViolet', 'crystal', 'gemRose'];
EMITTER_MATS.forEach((m, i) => (BLOCK_SURFACES[EMITTER_BASE + i] = flat(m, FAMILY.CRYSTAL, 1)));
void SLOT;

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

/**
 * Natural rock chooses its top or side layer per fragment from the sculpted normal (a chamfer or
 * a smoothed step is not a voxel face), so the shader needs both layers of the rock a face
 * carries: GEO_TOP_OF[layer] and GEO_SIDE_OF[layer] for every geology top or side layer
 * (identity elsewhere). Bottom layers that differ from the side (damp stone's dry underside) are
 * another rock's side layer and map within that rock.
 */
export const GEO_TOP_OF = new Uint8Array(MATERIAL_NAMES.length).map((_, i) => i);
export const GEO_SIDE_OF = new Uint8Array(MATERIAL_NAMES.length).map((_, i) => i);
for (const s of Object.values(BLOCK_SURFACES)) {
  if (s.family !== FAMILY.GEOLOGY) continue;
  const top = MAT[s.top];
  const side = MAT[s.side];
  GEO_TOP_OF[top] = GEO_TOP_OF[side] = top;
  GEO_SIDE_OF[top] = GEO_SIDE_OF[side] = side;
}

export interface MaterialAtlas {
  size: number;
  layers: number;
  /** RGBA8, layer-major. */
  data: Uint8Array;
}

/** Layers added after the painters table: painted from here, after all the others. */
const EXTRA_PAINTERS: Record<string, MaterialPainter> = {
  echoCrystal,
  copperOre: recolor(copperVein, [0x1c0c06, 0x3e1c0c, 0x7a3a18, 0xc06a2c, 0xf0a060, 0xffd0a0], 1.05),
  amberVein: recolor(crystal, [0x2a1404, 0x6a3008, 0xb8600e, 0xf09a28, 0xffd070], 1.1),
  tinVein: recolor(ironVein, [0x1c2026, 0x343a44, 0x566070, 0x8a96a8, 0xb4c0d0], 0.95),
  jadeVein: recolor(crystal, [0x04140c, 0x0c3a22, 0x1c7848, 0x46c080, 0xa8f0c8], 1.1),
  quartzVein: recolor(ironVein, [0x241e26, 0x463a48, 0x7a6880, 0xb09ab8, 0xd8c8e0], 0.95),
  sapphireVein: recolor(crystal, [0x02061a, 0x081c5a, 0x1840a8, 0x3c78f0, 0x9cc4ff], 1.1),
  silverVein: recolor(ironVein, [0x22262c, 0x444a54, 0x707884, 0xa4acb8, 0xd4dae4], 1.0),
  brassPlate: recolor(copperVein, [0x3a2a10, 0x6c4e1c, 0xa8803a, 0xd8b064, 0xf8e0a0]),
  rootWood: recolor(beamSide, [0x1a120c, 0x2e2016, 0x4a3422, 0x6a4c32, 0x8a6a48]),
  glowroot: recolor(crystal, [0x020a04, 0x06301a, 0x1a7a40, 0x5ad888, 0xc8ffd8], 1.1),
  gemRose: recolor(crystal, [0x1a0410, 0x5a1438, 0xb03a78, 0xf07ab0, 0xffd0e8], 1.15),
  gemJade: recolor(crystal, [0x041a10, 0x14583a, 0x3aa874, 0x84f0b4, 0xd8fff0], 1.15),
  gemViolet: recolor(crystal, [0x0c041a, 0x30145a, 0x6a3ab0, 0xa880f0, 0xe8d8ff], 1.15),
  goldLeaf: recolor(copperVein, [0x4a3008, 0x8a6014, 0xd0a030, 0xf8d860, 0xfff4b8], 1.1),
  fossilBone: recolor(weatheredSide, [0x2a241c, 0x5a5040, 0x948670, 0xc8b8a0, 0xeee4d0]),
  chestShell: recolor(plank, [0x24160c, 0x4a2e18, 0x7a5230, 0xa87a48, 0xd0a060]),
  gateStone: recolor(masonry, [0x1a1c22, 0x343842, 0x565c6a, 0x7c8494, 0xa8b0c0]),
  turf: recolor(soil, [0x0e0c08, 0x1e1a10, 0x2e3018, 0x3c4622, 0x52602e], 0.9),
};
void dampSide;

/** Paint every material layer (deterministic). */
export function generateMaterials(): MaterialAtlas {
  const layers = MATERIAL_NAMES.length;
  const data = new Uint8Array(MAT_SIZE * MAT_SIZE * 4 * layers);
  beginHostCache();
  try {
    MATERIAL_NAMES.forEach((name, layer) => {
      const c = new MatCanvas();
      const paint = (PAINTERS as Record<string, MaterialPainter>)[name] ?? EXTRA_PAINTERS[name];
      paint(c, rngFor(name));
      c.toBytes(data, layer * MAT_SIZE * MAT_SIZE * 4);
    });
  } finally {
    endHostCache();
  }
  return { size: MAT_SIZE, layers, data };
}

export { MAT_SIZE };
