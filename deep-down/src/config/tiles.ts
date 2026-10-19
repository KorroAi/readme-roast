// Texture-array layer indices. The procedural texture generator (render/textures.ts)
// must produce exactly one 16x16 tile per entry, in this order.

export const TILE_NAMES = [
  'slate',
  'deepSlate',
  'umber',
  'soil',
  'gravel',
  'mossTop',
  'mossSide',
  'copperOre',
  'ironOre',
  'crystal',
  'hardenedSlate',
  'ancientBrick',
  'ancientBrickTop',
  'ancientTile',
  'crumblingBrick',
  'glyphStone',
  'plank',
  'beamSide',
  'beamEnd',
  'hearth',
  'bedrock',
  'glyphStoneB',
  'glyphStoneC',
  'ancientBrickCarved',
  'crack0',
  'crack1',
  'crack2',
  'crack3',
  'crack4',
  'crack5',
  'crack6',
  'crack7',
  'crack8',
  'crack9',
  // Rune decals carved into glyph stones (alpha = ink mask), the builders' script.
  'rune0',
  'rune1',
  'rune2',
  'rune3',
  'rune4',
  'rune5',
  'rune6',
  'rune7',
] as const;

export type TileName = (typeof TILE_NAMES)[number];

export const TILE = Object.fromEntries(TILE_NAMES.map((n, i) => [n, i])) as Record<TileName, number>;

export const TILE_SIZE = 16;
export const CRACK_STAGES = 10;
export const CRACK_FIRST_LAYER = TILE.crack0;
export const RUNE_FIRST_LAYER = TILE.rune0;
export const RUNE_COUNT = 8;
