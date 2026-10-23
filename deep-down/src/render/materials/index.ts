import { B, BLOCKS, PAINT_AS } from '../../config/blocks';
import { MAT_SIZE, MatCanvas, rngFor } from './paint';
import { PAINTERS, type MaterialPainter } from './painters';
import { echoCrystal } from './minerals';
import { emberGlass, gemOre, roots, rubble } from './finds';
import { beginHostCache, endHostCache } from './rock';
import { STRATA_LAYERS, STRATA_LAYER_NAMES, type StrataLayerName } from './strata';

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

const BASE_MATERIAL_NAMES = [
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
  // Round 2: the minable finds that replace free digging (materials/finds.ts).
  'rubble',
  'roots',
  'gemOre',
  // Polish 2: the Ember Deep's black seal, its cracks glowing (finds.ts emberGlass).
  'emberGlass',
] as const;

/** The layers before round 3 (their indices never move). */
export const BASE_LAYER_COUNT = BASE_MATERIAL_NAMES.length;

/**
 * Every layer: the base ones, then round 3's biome layers (materials/strata.ts), appended in order.
 */
export const MATERIAL_NAMES = [...BASE_MATERIAL_NAMES, ...STRATA_LAYER_NAMES] as const;

export type MaterialName = (typeof BASE_MATERIAL_NAMES)[number] | StrataLayerName;
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
  // Lead 01:17 (the geode's crystals pop): glimmer 0.85 -> 1.05, echo 0.95 -> 1.15.
  crystal: { glow: 1.05 },
  sealStone: { glow: 0 },
  masonry: { glow: 0 },
  masonryTop: { glow: 0 },
  floorSlab: { glow: 0 },
  crumbling: { glow: 0.9 },
  plank: { glow: 0 },
  beamSide: { glow: 0 },
  beamEnd: { glow: 0 },
  // Lanternstone and the hearth: a held flame, the deep's warm focal glint (polish: brighter).
  hearth: { glow: 1.25 },
  bedrock: { glow: 0 },
  masonryB: { glow: 0 },
  crumblingB: { glow: 0.9 },
  script: { glow: 0 },
  echoCrystal: { glow: 1.15 },
  rubble: { glow: 0 },
  roots: { glow: 0 },
  gemOre: { glow: 0.9 },
  emberGlass: { glow: 1.1 },
  ...(Object.fromEntries(STRATA_LAYER_NAMES.map((n) => [n, { glow: STRATA_LAYERS[n].glow }])) as Record<StrataLayerName, MaterialInfo>),
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
  // The content pass (finished game): lanternstone (warm-veined stone holding a flame: the hearth's
  // ember veins) and ember glass (the Ember Deep's black seal: bedrock's dark glassy stone; its red
  // light comes from the block's emission in the light volume).
  [B.LANTERNSTONE]: { top: 'hearth', side: 'hearth', bottom: 'hearth', family: FAMILY.NONE, rigidity: 2 },
  [B.EMBER_GLASS]: { top: 'emberGlass', side: 'emberGlass', bottom: 'emberGlass', family: FAMILY.NONE, rigidity: 1 },
  // Round 2 (WORLD's minable finds): a loose-stone heap, root tangles, a violet gem pocket.
  [B.RUBBLE]: rock('rubble', 'rubble'),
  [B.ROOTS]: rock('roots', 'roots'),
  [B.GEM_ORE]: { top: 'gemOre', side: 'gemOre', bottom: 'gemOre', family: FAMILY.CRYSTAL, rigidity: 1 },
};

// Round 3: the twelve biomes' blocks (keyed by WORLD's B names, so a missing id is simply skipped).
const crystalOf = (m: MaterialName, rigidity: 0 | 1 | 2 | 3 = 1): BlockSurface => ({ top: m, side: m, bottom: m, family: FAMILY.CRYSTAL, rigidity });
const plainOf = (m: MaterialName, rigidity: 0 | 1 | 2 | 3 = 2, topM: MaterialName = m): BlockSurface => ({ top: topM, side: m, bottom: m, family: FAMILY.NONE, rigidity });
const STRATA_SURFACES: Record<string, BlockSurface> = {
  AMBER_LIMESTONE: rock('amberLimeTop', 'amberLimeSide'),
  AMBER_SANDSTONE: rock('amberSandTop', 'amberSandSide'),
  AMBER_FLOOR: rock('amberFloor', 'amberFloor'),
  AMBER_ORE: rock('amberOre', 'amberOre'),
  MYCEL_ROCK: rock('mycelTop', 'mycelSide'),
  SPORE_LOAM: rock('sporeLoam', 'sporeLoam'),
  MYCEL_FLOOR: rock('mycelFloor', 'mycelFloor'),
  SPORE_QUARTZ: crystalOf('sporeQuartz'),
  MUSHROOM_STEM: plainOf('mushroomStem', 2),
  MUSHROOM_CAP_TEAL: plainOf('capTeal', 2),
  MUSHROOM_CAP_MAGENTA: plainOf('capMagenta', 2),
  ROOT_EARTH: rock('rootEarthTop', 'rootEarthSide'),
  ROOT_CLAY: rock('rootClaySide', 'rootClaySide'),
  ROOT_FLOOR: rock('rootFloor', 'rootFloor'),
  GOLD_ORE: rock('goldVein', 'goldVein'),
  THICK_ROOT: plainOf('thickRoot', 2),
  FLOOD_STONE: rock('floodTop', 'floodSide'),
  FLOOD_SHALE: rock('floodShaleSide', 'floodShaleSide'),
  FLOOD_FLOOR: rock('floodFloor', 'floodFloor'),
  PEARL_ORE: rock('pearlOre', 'pearlOre'),
  GEODE_ROCK: rock('geodeTop', 'geodeSide'),
  GEODE_CALCITE: rock('calciteSide', 'calciteSide'),
  GEODE_FLOOR: rock('geodeFloor', 'geodeFloor'),
  AMETHYST: crystalOf('amethyst'),
  MINE_ROCK: rock('mineTop', 'mineSide'),
  MINE_SHALE: rock('mineShaleSide', 'mineShaleSide'),
  MINE_FLOOR: rock('mineFloor', 'mineFloor'),
  COAL_ORE: rock('coalSeam', 'coalSeam'),
  SILVER_ORE: rock('silverVein', 'silverVein'),
  FROST_ICE: crystalOf('frostIce', 2),
  FROST_ROCK: rock('frostRockTop', 'frostRockSide'),
  FROST_SNOW: rock('frostSnow', 'frostSnow'),
  FROST_IRON: rock('frostIron', 'frostIron'),
  ICE_CRYSTAL: crystalOf('iceCrystal'),
  JUNGLE_ROCK: rock('jungleTop', 'jungleSide'),
  JUNGLE_LOAM: rock('jungleLoam', 'jungleLoam'),
  JUNGLE_MOSS: rock('jungleMoss', 'jungleMoss'),
  VERDITE: crystalOf('verdite'),
  SAP_AMBER: rock('sapAmber', 'sapAmber'),
  GLOW_VINE: rock('glowVine', 'glowVine'),
  SULPHUR_ROCK: rock('sulphurTop', 'sulphurSide'),
  BOG_MUD: rock('bogMud', 'bogMud'),
  BOG_CRUST: rock('bogCrust', 'bogCrust'),
  SULPHUR_ORE: rock('sulphurOre', 'sulphurOre'),
  MIRE_OPAL: crystalOf('mireOpal'),
  TOXIC_POOL: rock('toxicPool', 'toxicPool'),
  CITY_STONE: plainOf('cityStone', 1),
  CITY_BRICK: plainOf('cityBrick', 1),
  CITY_TILE: plainOf('cityStone', 1, 'cityTile'),
  RUNEGOLD: rock('runegold', 'runegold'),
  ORICHALCUM: rock('orichalcum', 'orichalcum'),
  BASALT: rock('basaltTop', 'basaltSide'),
  SCORIA: rock('scoriaSide', 'scoriaSide'),
  ASH_FLOOR: rock('ashFloor', 'ashFloor'),
  EMBERITE: crystalOf('emberite'),
  MAGMA_CORE: plainOf('magmaCore', 2),
  LAVA: plainOf('lava', 2),
  OBSIDIAN: crystalOf('obsidian'),
  VOID_STONE: rock('voidStoneSide', 'voidStoneSide'),
  OBSIDIAN_FLOOR: { top: 'obsidianFloor', side: 'obsidian', bottom: 'obsidian', family: FAMILY.CRYSTAL, rigidity: 1 },
  VOIDSHARD: crystalOf('voidshard'),
  STARSTEEL: rock('starsteel', 'starsteel'),
  HEART_STONE: rock('heartStone', 'heartStone'),
  GATE_SEAL: plainOf('gateSeal', 1),
  CRACKED_WALL: rock('crackedWall', 'crackedWall'),
  // The Halden works: the iron-bound vault door, and the glyph plates pressed in order.
  HALDEN_DOOR: plainOf('haldenDoor', 0),
  PRESSURE_PLATE: { top: 'pressurePlate', side: 'masonry', bottom: 'masonryTop', family: FAMILY.NONE, rigidity: 1 },
  DOOR: plainOf('builtDoor', 0),
};
const blockIdByName = B as unknown as Record<string, number>;
for (const [k, surf] of Object.entries(STRATA_SURFACES)) if (blockIdByName[k] !== undefined) BLOCK_SURFACES[blockIdByName[k]] = surf;
// Built things look like their old twins.
for (const [k, like] of [['BUILT_PLANK', B.PLANK], ['BUILT_BRICK', B.ANCIENT_BRICK]] as const) if (blockIdByName[k] !== undefined) BLOCK_SURFACES[blockIdByName[k]] = BLOCK_SURFACES[like];

// Round 3: a visible block with no surface of its own yet looks like WORLD's PAINT_AS stand-in.
for (const d of BLOCKS) {
  if (!d || !d.visible || BLOCK_SURFACES[d.id]) continue;
  const look = BLOCK_SURFACES[PAINT_AS[d.id]];
  if (look) BLOCK_SURFACES[d.id] = look;
}

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
  /** Round 3: the layers actually painted (the others are flat stand-ins). */
  painted?: string[];
}

/** Layers added after the painters table (final pass W3): painted from here, after all the others. */
const EXTRA_PAINTERS: Record<string, MaterialPainter> = {
  echoCrystal,
  rubble,
  roots,
  gemOre,
  emberGlass,
  ...Object.fromEntries(STRATA_LAYER_NAMES.map((n) => [n, STRATA_LAYERS[n].painter])),
};

export interface MaterialOptions {
  /**
   * Round 3: paint only the biome layers of these biomes (a stratum's two, plus 'heart' in VI); the
   * base layers and the built things are always painted, other biomes' layers get a flat stand-in
   * (never on screen in that stratum). Omitted: every layer.
   */
  biomes?: readonly string[];
}

/** Does a layer need painting for these options? */
export function layerWanted(name: MaterialName, opts: MaterialOptions = {}): boolean {
  const s = (STRATA_LAYERS as Record<string, { biomes: readonly string[] }>)[name];
  if (!s || !opts.biomes) return true;
  return s.biomes.includes('built') || s.biomes.some((b) => opts.biomes!.includes(b));
}

/** Paint every material layer (deterministic), or a stratum's (opts.biomes). */
export function generateMaterials(opts: MaterialOptions = {}): MaterialAtlas {
  const layers = MATERIAL_NAMES.length;
  const data = new Uint8Array(MAT_SIZE * MAT_SIZE * 4 * layers);
  const painted: string[] = [];
  beginHostCache();
  try {
    MATERIAL_NAMES.forEach((name, layer) => {
      const off = layer * MAT_SIZE * MAT_SIZE * 4;
      if (!layerWanted(name, opts)) {
        // A flat dark stand-in: cheap, never seen (no block of this stratum uses it).
        for (let i = 0; i < MAT_SIZE * MAT_SIZE; i++) data.set([40, 40, 44, 128], off + i * 4);
        return;
      }
      const c = new MatCanvas();
      const paint = (PAINTERS as Record<string, MaterialPainter>)[name] ?? EXTRA_PAINTERS[name];
      paint(c, rngFor(name));
      c.toBytes(data, off);
      painted.push(name);
    });
  } finally {
    endHostCache();
  }
  return { size: MAT_SIZE, layers, data, painted };
}

export { MAT_SIZE };
