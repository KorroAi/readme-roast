// The Lantern Voxel material layers (W1-LEAD §1, §4): one painted texture-array layer per stone family or built
// material, and the table that gives every block id its top, side and bottom layer, its erosion and its finish.
// Pure data (the mesher and the painter both read it; no Three.js).

import { B, BIOME_BLOCK_BASE, BIOME_BLOCKS, EMITTER_BASE, SLOT } from '../../config/blocks';

/** Texture-array layers (painter.ts paints them in this order). */
export const LAYER = {
  slate: 0, // cool blue-grey chiselled stone (the host rock)
  slateFloor: 1, // the same, worn flat, dust in the joints, gravel
  soil: 2, // dark warm earth with clumps and root fibres (Topsoil)
  umber: 3, // warm grey-brown stone
  moss: 4, // green-grey stone, moss on the tops (Glowroot)
  mossFloor: 5, // root litter and moss over stone (Glowroot floors)
  grotto: 6, // blue-violet stone with mineral crust (Crystal Grotto)
  basalt: 7, // near-black basalt with joints (deep biomes)
  masonry: 8, // Halden dressed stone in courses
  timber: 9, // planks and beams: grain, knots
  iron: 10, // hammered dark iron, rivets
  brass: 11, // worn brass
  rootwood: 12, // root bark (roots, root wood blocks)
  crystalHost: 13, // dark glassy host around crystal seams (emissive mask)
} as const;
export const LAYER_COUNT = 14;

/** Finish of a layer: base roughness and metalness (the painter's B texture refines them per texel). */
export const LAYER_FINISH: ReadonlyArray<{ rough: number; metal: number; normal: number }> = [
  { rough: 0.78, metal: 0, normal: 1.0 }, // slate
  { rough: 0.86, metal: 0, normal: 0.8 }, // slateFloor
  { rough: 0.94, metal: 0, normal: 0.9 }, // soil
  { rough: 0.82, metal: 0, normal: 1.0 }, // umber
  { rough: 0.88, metal: 0, normal: 0.9 }, // moss
  { rough: 0.9, metal: 0, normal: 0.8 }, // mossFloor
  { rough: 0.6, metal: 0, normal: 1.0 }, // grotto
  { rough: 0.72, metal: 0, normal: 0.9 }, // basalt
  { rough: 0.8, metal: 0, normal: 0.9 }, // masonry
  { rough: 0.74, metal: 0, normal: 0.7 }, // timber
  { rough: 0.45, metal: 1, normal: 0.6 }, // iron
  { rough: 0.35, metal: 1, normal: 0.5 }, // brass
  { rough: 0.86, metal: 0, normal: 0.8 }, // rootwood
  { rough: 0.4, metal: 0, normal: 0.9 }, // crystalHost
];

/** Per block id: top, side and bottom layers; 255 = not a lantern surface (invisible or not drawn). */
export const LAYER_TOP = new Uint8Array(256).fill(LAYER.slate);
export const LAYER_SIDE = new Uint8Array(256).fill(LAYER.slate);
export const LAYER_BOTTOM = new Uint8Array(256).fill(LAYER.slate);
/** 1 = natural rock: the 0.5 m skin erodes (cells.ts). Built things and specials stay exact. */
const ERODE = new Uint8Array(256);
/** Emission class per block (the surface shader's glow): 0 none, 1 glowroot green, 2 crystal cyan, 3 gold, 4 ember,
 *  5 violet, 6 rune cyan. */
export const GLOW_CLASS = new Uint8Array(256);
/** Value tint per block (×1/128): biome slot shades of the same layer read as different strata. */
export const TONE = new Uint8Array(256).fill(128);

function set(id: number, top: number, side: number, bottom = side, erode = 1, tone = 128): void {
  LAYER_TOP[id] = top;
  LAYER_SIDE[id] = side;
  LAYER_BOTTOM[id] = bottom;
  ERODE[id] = erode;
  TONE[id] = tone;
}

set(B.SLATE, LAYER.slateFloor, LAYER.slate);
set(B.DEEP_SLATE, LAYER.slateFloor, LAYER.slate, LAYER.slate, 1, 104);
set(B.HARDENED_SLATE, LAYER.slateFloor, LAYER.slate, LAYER.slate, 1, 92);
set(B.UMBER, LAYER.umber, LAYER.umber);
set(B.SOIL, LAYER.soil, LAYER.soil);
set(B.TOPSOIL, LAYER.mossFloor, LAYER.soil);
set(B.GRAVEL, LAYER.slateFloor, LAYER.slateFloor);
set(B.MOSS, LAYER.mossFloor, LAYER.moss);
set(B.COPPER_ORE, LAYER.slateFloor, LAYER.slate);
set(B.IRON_ORE, LAYER.slateFloor, LAYER.slate);
set(B.CRYSTAL, LAYER.crystalHost, LAYER.crystalHost, LAYER.crystalHost, 0);
set(B.ECHO_CRYSTAL, LAYER.crystalHost, LAYER.crystalHost, LAYER.crystalHost, 0);
set(B.ANCIENT_BRICK, LAYER.masonry, LAYER.masonry, LAYER.masonry, 0);
set(B.ANCIENT_TILE, LAYER.masonry, LAYER.masonry, LAYER.masonry, 0);
set(B.CRUMBLING_BRICK, LAYER.masonry, LAYER.masonry, LAYER.masonry, 0, 112);
set(B.GLYPH_STONE, LAYER.masonry, LAYER.masonry, LAYER.masonry, 0, 120);
set(B.GATE_STONE, LAYER.masonry, LAYER.masonry, LAYER.masonry, 0, 136);
set(B.SEAL_STONE, LAYER.iron, LAYER.masonry, LAYER.masonry, 0, 100);
set(B.IRONBOUND, LAYER.iron, LAYER.masonry, LAYER.masonry, 0);
set(B.PLANK, LAYER.timber, LAYER.timber, LAYER.timber, 0);
set(B.BEAM, LAYER.timber, LAYER.timber, LAYER.timber, 0, 112);
set(B.CHEST_SHELL, LAYER.timber, LAYER.timber, LAYER.timber, 0);
set(B.HEARTH, LAYER.basalt, LAYER.masonry, LAYER.masonry, 0, 90);
set(B.BEDROCK, LAYER.basalt, LAYER.basalt, LAYER.basalt, 0, 80);
set(B.FOSSIL, LAYER.slateFloor, LAYER.umber, LAYER.umber, 1, 150);
set(B.GEODE, LAYER.crystalHost, LAYER.grotto, LAYER.grotto, 0);
set(B.GOLDEN, LAYER.brass, LAYER.brass, LAYER.brass, 0);
set(B.BOULDER, LAYER.slate, LAYER.slate, LAYER.slate, 1, 96);
// The hybrid's blocks (1B, W1): Halden masonry, timber decks and treads, a secret's cracked wall.
set(B.MASONRY, LAYER.masonry, LAYER.masonry, LAYER.masonry, 0);
set(B.DECK, LAYER.timber, LAYER.timber, LAYER.timber, 0, 116);
set(B.CRACK, LAYER.slateFloor, LAYER.slate, LAYER.slate, 0, 120);

/** Biome slot surfaces: [hostA, hostB, soft, hard, ore, rich, gem, special] → [top, side, tone]. */
const BIOME_SURF: ReadonlyArray<ReadonlyArray<readonly [number, number, number]>> = [
  // 0 Topsoil Roots: earth over slate, umber, root wood.
  [[LAYER.mossFloor, LAYER.soil, 128], [LAYER.slateFloor, LAYER.slate, 128], [LAYER.umber, LAYER.umber, 128], [LAYER.rootwood, LAYER.rootwood, 120], [LAYER.slateFloor, LAYER.slate, 116], [LAYER.slateFloor, LAYER.slate, 110], [LAYER.slateFloor, LAYER.slate, 104], [LAYER.rootwood, LAYER.rootwood, 112]],
  // 1 Glowroot Caverns: moss stone, slate, root wood, glowroot.
  [[LAYER.mossFloor, LAYER.moss, 128], [LAYER.slateFloor, LAYER.slate, 118], [LAYER.mossFloor, LAYER.slate, 136], [LAYER.rootwood, LAYER.rootwood, 116], [LAYER.slateFloor, LAYER.slate, 110], [LAYER.mossFloor, LAYER.moss, 112], [LAYER.mossFloor, LAYER.moss, 108], [LAYER.rootwood, LAYER.rootwood, 124]],
  // 2 Crystal Grotto.
  [[LAYER.grotto, LAYER.grotto, 128], [LAYER.grotto, LAYER.grotto, 108], [LAYER.crystalHost, LAYER.crystalHost, 128], [LAYER.crystalHost, LAYER.crystalHost, 120], [LAYER.grotto, LAYER.grotto, 120], [LAYER.grotto, LAYER.grotto, 112], [LAYER.crystalHost, LAYER.crystalHost, 112], [LAYER.crystalHost, LAYER.crystalHost, 124]],
  // 3 Halden Works.
  [[LAYER.slateFloor, LAYER.slate, 100], [LAYER.masonry, LAYER.masonry, 128], [LAYER.timber, LAYER.timber, 120], [LAYER.brass, LAYER.brass, 128], [LAYER.slateFloor, LAYER.slate, 108], [LAYER.slateFloor, LAYER.slate, 112], [LAYER.slateFloor, LAYER.slate, 104], [LAYER.timber, LAYER.timber, 112]],
];
for (let b = 0; b < BIOME_BLOCKS; b++)
  for (let slot = 0; slot < 8; slot++) {
    const [top, side, tone] = b < BIOME_SURF.length ? BIOME_SURF[b][slot] : [LAYER.basalt, LAYER.basalt, 100 + slot * 4];
    const built = side === LAYER.masonry || side === LAYER.timber || side === LAYER.brass || side === LAYER.crystalHost;
    set(BIOME_BLOCK_BASE + 8 * b + slot, top, side, side, built ? 0 : 1, tone);
  }
// Emissive slots: Glowroot's special, Crystal Grotto's crystal slots, Topsoil's rich amber.
GLOW_CLASS[BIOME_BLOCK_BASE + 8 * 1 + SLOT.SPECIAL] = 1;
GLOW_CLASS[BIOME_BLOCK_BASE + 8 * 2 + SLOT.HARD] = 2;
GLOW_CLASS[BIOME_BLOCK_BASE + 8 * 2 + SLOT.SPECIAL] = 2;
GLOW_CLASS[B.CRYSTAL] = 2;
GLOW_CLASS[B.GEODE] = 2;
GLOW_CLASS[B.GOLDEN] = 3;
GLOW_CLASS[B.GLYPH_STONE] = 6;
/** Class 7: a cracked wall (a secret): dark fracture lines in world space, a faint cool draught in the cracks. */
GLOW_CLASS[B.CRACK] = 7;
for (let i = 0; i < 16; i++) {
  const id = EMITTER_BASE + i;
  set(id, LAYER.crystalHost, LAYER.crystalHost, LAYER.crystalHost, 0);
  GLOW_CLASS[id] = i === 0 ? 1 : i === 6 || i === 7 || i === 15 ? 4 : i === 12 ? 6 : i === 2 || i === 3 ? 3 : 2;
}

/** Natural rock whose 0.5 m skin erodes (cells.ts). */
export const erodable = (id: number): boolean => ERODE[id] === 1;

/** The value class of a block for the 3D nugget dressing on exposed ore faces: 0 none, 1 ore, 2 rich, 3 gem. */
export function nuggetClass(id: number): number {
  if (id === B.COPPER_ORE || id === B.IRON_ORE) return 1;
  if (id >= BIOME_BLOCK_BASE && id < BIOME_BLOCK_BASE + 8 * BIOME_BLOCKS) {
    const slot = (id - BIOME_BLOCK_BASE) & 7;
    if (slot === SLOT.ORE) return 1;
    if (slot === SLOT.RICH) return 2;
    if (slot === SLOT.GEM) return 3;
  }
  return 0;
}
