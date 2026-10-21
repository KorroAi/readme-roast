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
   * descending toward +x, -x, +z or -z; the walking plane, so
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
  // 34..38 belong to the content stream (W4): TIN_ORE 34, LANTERNSTONE 35, LIGHT_RESONANCE 36,
  // STATUE_SOLID 37, FOSSIL 38. Until it defines them they are reserved as air (see below).
  /** Echo crystal (final pass W3): the rift's pale glass. Tier 3; it glows in the shader only, no light. */
  ECHO_CRYSTAL: 39,
  /** Ironbound stone: the seal-stone with a rune band. */
  IRONBOUND: 40,
  // The descent (SPEC §6.4): shared cells and specials 41..63.
  /** A chest cell's timber shell with brass bands (its lid shows in the section 6 rows ahead). */
  CHEST_SHELL: 41,
  /** The gate row at a biome start: carved builders' stone with a frieze. */
  GATE_STONE: 42,
  /** A never-opened seal's slab. */
  SEAL_STONE: 43,
  /** A fossil cell (bone in the rock). */
  FOSSIL: 44,
  /** A geode cell (a crystal-lined shell). */
  GEODE: 45,
  /** A golden cell (the Golden Vein event): gold leaf. */
  GOLDEN: 46,
  /** A boulder left by a Cave-in. */
  BOULDER: 47,
  /** The surface row's turf and loam. */
  TOPSOIL: 48,
  // The first-person hybrid (W1, src/world/hybrid): 49..55.
  /** A drift's face plug (the K slices not dug yet): solid for light, picking and walking, never meshed (the
   *  FaceRenderer draws the face blocks). A slice's plug voxels turn to AIR when the slice falls. */
  FACE_PLUG: 49,
  /** A secret's cracked wall, hollow floor or loose brick (W1-LEAD §3): solid, visible, breaks open on strikes. */
  CRACK: 50,
  /** The Halden Hatch's planks in the Lift Bottom's floor (the seal): solid, never meshed (SealRenderer draws it). */
  HATCH: 51,
  /** Dusk sky light falling down a sky shaft (invisible, non-solid emitter, cool blue: SPEC §8.4 #9fc3e6). */
  LIGHT_SKY: 52,
  /** The light that leaks through a breach or a seal's seams in the promise colour (invisible, non-solid). */
  LIGHT_LEAK_GREEN: 53,
  /** Halden masonry (dressed stone in courses, the bevel language of built things). */
  MASONRY: 54,
  /** Timber decking and stair treads (walkable timber). */
  DECK: 55,
} as const;

/** Biome block slots (SPEC §6.4): id = 64 + 8 b + slot for b = 0..13. */
export const SLOT = { HOST_A: 0, HOST_B: 1, SOFT: 2, HARD: 3, ORE: 4, RICH: 5, GEM: 6, SPECIAL: 7 } as const;
export const BIOME_BLOCK_BASE = 64;
export const BIOME_BLOCKS = 14;
/** The block id of a biome's slot. */
export const biomeBlock = (biome: number, slot: number): number => BIOME_BLOCK_BASE + 8 * (((biome % BIOME_BLOCKS) + BIOME_BLOCKS) % BIOME_BLOCKS) + slot;
/** Descent emitters 176..191: solid, visible glowing fissure stone in a key colour (the glow below, alcoves). */
export const EMITTER_BASE = 176;
export const EMITTER = {
  GLOWROOT: 176,
  CRYSTAL: 177,
  SODIUM: 178,
  GOLD: 179,
  SPORE: 180,
  AQUA: 181,
  LAVA: 182,
  RESIN: 183,
  ICE: 184,
  WHITE_GOLD: 185,
  STEEL: 186,
  STAR: 187,
  VOID: 188,
  RUNE: 189,
  CORAL: 190,
  EMBER: 191,
} as const;

/** @deprecated the old game's tool tiers (kept until src/gameplay is deleted). */
export const UNBREAKABLE_TIER = 99;

export type SoundKind = 'stone' | 'metal' | 'crystal' | 'wood' | 'soil' | 'ancient';

export interface BlockDef {
  id: number;
  /** Debug name (never shown to players: the game shows cell kinds, not blocks). */
  name: string;
  /** Collides and blocks light. */
  solid: boolean;
  /** Produces faces in the chunk mesh. */
  visible: boolean;
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


def({ id: B.AIR, name: 'block.air', solid: false, visible: false, sound: 'stone', tiles: same(0) });
def({ id: B.SLATE, name: 'block.slate', solid: true, visible: true, sound: 'stone', tiles: same(TILE.slate), debris: [0x363b44, 0x252a33, 0x41454d] });
def({ id: B.DEEP_SLATE, name: 'block.deepSlate', solid: true, visible: true, sound: 'stone', tiles: same(TILE.deepSlate), debris: [0x2e3440, 0x252a33, 0x3b4250] });
def({ id: B.UMBER, name: 'block.umber', solid: true, visible: true, sound: 'stone', tiles: same(TILE.umber), debris: [0x4a4b4d, 0x37383b, 0x404144] });
def({ id: B.SOIL, name: 'block.soil', solid: true, visible: true, sound: 'soil', tiles: same(TILE.soil), debris: [0x4a3a2e, 0x3a2d23] });
def({ id: B.GRAVEL, name: 'block.gravel', solid: true, visible: true, sound: 'soil', tiles: same(TILE.gravel), debris: [0x2d323b, 0x3a3d42] });
def({ id: B.MOSS, name: 'block.moss', solid: true, visible: true, sound: 'soil', tiles: { top: TILE.mossTop, side: TILE.mossSide, bottom: TILE.slate }, glow: 0, debris: [0x2f5d55, 0x4d5666] });
def({ id: B.COPPER_ORE, name: 'block.copperOre', solid: true, visible: true, sound: 'metal', tiles: same(TILE.copperOre), debris: [0xa95628, 0x2d323b, 0x2f4c3e] });
def({ id: B.IRON_ORE, name: 'block.ironOre', solid: true, visible: true, sound: 'metal', tiles: same(TILE.ironOre), debris: [0x5e6269, 0x222730, 0x572b20] });
def({
  id: B.CRYSTAL, name: 'block.crystal', solid: true, visible: true, sound: 'crystal', tiles: same(TILE.crystal),
  // A seam in dark rock, not a lamp: enough light to find it, the clusters carry the glow.
  emission: [0.1, 0.38, 0.48], glow: 1.3, debris: [0x52e8f5, 0x9ff6ff, 0x1b8aa8],
});
def({ id: B.HARDENED_SLATE, name: 'block.hardenedSlate', solid: true, visible: true, sound: 'stone', tiles: same(TILE.hardenedSlate), debris: [0x1f222b, 0x2b2f3a] });
def({ id: B.ANCIENT_BRICK, name: 'block.ancientBrick', solid: true, visible: true, sound: 'ancient', tiles: { top: TILE.ancientBrickTop, side: TILE.ancientBrick, bottom: TILE.ancientBrickTop }, debris: [0x535a6a, 0x434957] });
def({ id: B.ANCIENT_TILE, name: 'block.ancientTile', solid: true, visible: true, sound: 'ancient', tiles: { top: TILE.ancientTile, side: TILE.ancientBrick, bottom: TILE.ancientBrickTop }, glow: 0, debris: [0x535a6a] });
def({ id: B.CRUMBLING_BRICK, name: 'block.crumblingBrick', solid: true, visible: true, sound: 'ancient', tiles: same(TILE.crumblingBrick), glow: 1.4, debris: [0x5c6474, 0x474e5c] });
def({
  id: B.GLYPH_STONE, name: 'block.glyphStone', solid: true, visible: true, sound: 'ancient', tiles: { top: TILE.ancientBrickTop, side: TILE.glyphStone, bottom: TILE.ancientBrickTop },
  // Inscriptions breathe a faint cold light along their course; the carved runes themselves
  // wake near the lantern (terrain shader). They must never flood a room.
  emission: [0.05, 0.23, 0.28], glow: 1.25, debris: [0x535a6a],
});
def({ id: B.PLANK, name: 'block.plank', solid: true, visible: true, sound: 'wood', tiles: same(TILE.plank), debris: [0x7a5536, 0x5c3f28] });
def({ id: B.BEAM, name: 'block.beam', solid: true, visible: true, sound: 'wood', tiles: { top: TILE.beamEnd, side: TILE.beamSide, bottom: TILE.beamEnd }, debris: [0x5c3f28] });
def({ id: B.HEARTH, name: 'block.hearth', solid: true, visible: true, sound: 'stone', tiles: same(TILE.hearth), glow: 1.1, debris: [0x332b25] });
def({ id: B.BEDROCK, name: 'block.bedrock', solid: true, visible: true, sound: 'ancient', tiles: same(TILE.bedrock), debris: [0x14161c] });
// Warm lights are amber-gold, not red-orange: the light volume is squared-ish on its way to the
// shader (lightSample: pow 1.55), and a light with too little green mixes with the cool open fill
// on the bluish stone into rose and mauve at the rim of every pool. With green at ~0.6 of red
// after that curve the rim passes through warm grey into blue-black instead.
def({ id: B.LIGHT_AMBER, name: 'block.light', solid: false, visible: false, sound: 'stone', tiles: same(0), emission: [1.0, 0.74, 0.46] });
def({ id: B.LIGHT_EMBER, name: 'block.light', solid: false, visible: false, sound: 'stone', tiles: same(0), emission: [1.0, 0.6, 0.32] });
def({ id: B.LIGHT_CYAN, name: 'block.light', solid: false, visible: false, sound: 'stone', tiles: same(0), emission: [0.13, 0.51, 0.66] });
// Route lamps are a deeper amber than the explorer's pale-gold lantern, so their pools read as
// separate islands of warmth.
def({ id: B.LIGHT_LAMP, name: 'block.light', solid: false, visible: false, sound: 'stone', tiles: same(0), emission: [1.0, 0.7, 0.36] });
def({ id: B.LIGHT_ABYSS, name: 'block.light', solid: false, visible: false, sound: 'stone', tiles: same(0), emission: [0.5, 0.32, 1.0] });
// Built forms drawn as structure meshes: collision only (no chunk faces), never mined.
const structureStone = { solid: true, visible: false, sound: 'ancient', tiles: { top: TILE.ancientBrickTop, side: TILE.ancientBrick, bottom: TILE.ancientBrickTop }, debris: [0x535a6a, 0x434957] } as const;
def({ id: B.STRUCTURE, name: 'block.ancientBrick', ...structureStone });
def({ id: B.STRUCTURE_TIMBER, name: 'block.beam', solid: true, visible: false, sound: 'wood', tiles: { top: TILE.beamEnd, side: TILE.beamSide, bottom: TILE.beamEnd }, debris: [0x5c3f28] });
for (const id of [B.RAMP_PX, B.RAMP_NX, B.RAMP_PZ, B.RAMP_NZ, B.RAMP_BASE_PX, B.RAMP_BASE_NX, B.RAMP_BASE_PZ, B.RAMP_BASE_NZ]) def({ id, name: 'block.ancientTile', ...structureStone });
// The deep tier (final pass W3). Echo crystal: the crystal's look in pale cyan-white (materials:
// echoCrystal), a glow in the shader only and no light emission (the cyan budget holds).
def({
  id: B.ECHO_CRYSTAL, name: 'block.echoCrystal', solid: true, visible: true, sound: 'crystal', tiles: same(TILE.crystal),
  emission: null, glow: 0, debris: [0xd8f4f6, 0xb9e9ef, 0x6fb8c4],
});
// Ironbound: the seal-stone with a rune band; it closes the relic niches until an iron pick opens them.
def({ id: B.IRONBOUND, name: 'block.ironbound', solid: true, visible: true, sound: 'metal', tiles: same(TILE.hardenedSlate), debris: [0x2b2f3a, 0x4a4f5a, 0x1f222b] });
// ---- The descent (SPEC §6.4) -------------------------------------------------------------------
def({ id: B.CHEST_SHELL, name: 'block.chestShell', solid: true, visible: true, sound: 'wood', tiles: same(TILE.plank), debris: [0x7a5536, 0xc9a24a, 0x5c3f28] });
def({ id: B.GATE_STONE, name: 'block.gateStone', solid: true, visible: true, sound: 'ancient', tiles: same(TILE.ancientBrick), debris: [0x6a7080, 0x535a6a, 0x8a90a0] });
def({ id: B.SEAL_STONE, name: 'block.sealStone', solid: true, visible: true, sound: 'metal', tiles: same(TILE.hardenedSlate), debris: [0x343c4b, 0x8290ae] });
def({ id: B.FOSSIL, name: 'block.fossil', solid: true, visible: true, sound: 'stone', tiles: same(TILE.slate), debris: [0xd8ccb0, 0xa89a80, 0x6c6252] });
def({ id: B.GEODE, name: 'block.geode', solid: true, visible: true, sound: 'crystal', tiles: same(TILE.crystal), emission: [0.12, 0.3, 0.42], glow: 1, debris: [0x9fe6f0, 0x52b8d0, 0x3a3f4a] });
def({ id: B.GOLDEN, name: 'block.golden', solid: true, visible: true, sound: 'metal', tiles: same(TILE.copperOre), emission: [0.42, 0.3, 0.08], glow: 1, debris: [0xffd86a, 0xe0a83a, 0xfff2b0] });
def({ id: B.BOULDER, name: 'block.boulder', solid: true, visible: true, sound: 'stone', tiles: same(TILE.deepSlate), debris: [0x3b4250, 0x252a33] });
def({ id: B.TOPSOIL, name: 'block.topsoil', solid: true, visible: true, sound: 'soil', tiles: same(TILE.soil), debris: [0x5c4839, 0x4a3a2e, 0x6a7a4a] });
// ---- The first-person hybrid (W1) ---------------------------------------------------------------------------------
def({ id: B.FACE_PLUG, name: 'block.facePlug', solid: true, visible: false, sound: 'stone', tiles: same(TILE.slate), debris: [0x4a4b4d, 0x37383b] });
def({ id: B.CRACK, name: 'block.crack', solid: true, visible: true, sound: 'stone', tiles: same(TILE.crumblingBrick), debris: [0x5d6068, 0x43464d, 0x2d3036] });
def({ id: B.HATCH, name: 'block.hatch', solid: true, visible: false, sound: 'wood', tiles: same(TILE.plank), debris: [0x7a5536, 0x5c3f28, 0x8a8f99] });
def({ id: B.LIGHT_SKY, name: 'block.light', solid: false, visible: false, sound: 'stone', tiles: same(0), emission: [0.36, 0.5, 0.66] });
def({ id: B.LIGHT_LEAK_GREEN, name: 'block.light', solid: false, visible: false, sound: 'stone', tiles: same(0), emission: [0.22, 0.62, 0.36] });
def({ id: B.MASONRY, name: 'block.masonry', solid: true, visible: true, sound: 'ancient', tiles: { top: TILE.ancientBrickTop, side: TILE.ancientBrick, bottom: TILE.ancientBrickTop }, debris: [0x6a6f7a, 0x535a6a, 0x434957] });
def({ id: B.DECK, name: 'block.deck', solid: true, visible: true, sound: 'wood', tiles: same(TILE.plank), debris: [0x7a5536, 0x5c3f28] });

/** Debris and emission of each biome slot (looks: render/materials BIOME_SURFACES). Biomes 4..13 reuse the
 *  W1 kits until their painters land (W2). */
export interface BiomeSlotLook {
  sound: SoundKind;
  debris: readonly number[];
  emission?: [number, number, number];
  glow?: number;
}
const KIT_LOOKS: ReadonlyArray<ReadonlyArray<BiomeSlotLook>> = [
  // 0 Topsoil Roots: soil, gravel, umber, root wood; copper / amber.
  [
    { sound: 'soil', debris: [0x5c4839, 0x42342b, 0x2d2420] },
    { sound: 'soil', debris: [0x5f5750, 0x403b37, 0x2d323b] },
    { sound: 'stone', debris: [0x5d6068, 0x43464d, 0x2d3036] },
    { sound: 'wood', debris: [0x6d5541, 0x4d3d2f, 0x342821] },
    { sound: 'metal', debris: [0xe58444, 0xa65126, 0x5b2c19] },
    { sound: 'crystal', debris: [0xffc35a, 0xe08a20, 0x8a4a10], emission: [0.34, 0.18, 0.04], glow: 1 },
    { sound: 'crystal', debris: [0xff9ac0, 0xd0608a, 0x6a2a44], emission: [0.3, 0.1, 0.18], glow: 1 },
    { sound: 'wood', debris: [0x6d5541, 0x4d3d2f] },
  ],
  // 1 Glowroot Caverns: moss, slate, root wood, glowroot; tin / jade.
  [
    { sound: 'soil', debris: [0x445363, 0x2d3945, 0x4c5a4e] },
    { sound: 'stone', debris: [0x5c6472, 0x3e4553, 0x272d38] },
    { sound: 'soil', debris: [0x546475, 0x384553] },
    { sound: 'wood', debris: [0x6d5541, 0x4d3d2f, 0x342821] },
    { sound: 'metal', debris: [0xc8d2dc, 0x8e98a6, 0x4a525e] },
    { sound: 'crystal', debris: [0x8ff0b0, 0x3cb878, 0x1a5a3a], emission: [0.08, 0.36, 0.16], glow: 1 },
    { sound: 'crystal', debris: [0xb0ffd0, 0x50d890, 0x1a6a44], emission: [0.08, 0.3, 0.16], glow: 1 },
    { sound: 'soil', debris: [0x9be7a8, 0x4a9a5a], emission: [0.12, 0.42, 0.18], glow: 1 },
  ],
  // 2 Crystal Grotto: slate, deep slate, echo crystal, crystal; quartz / sapphire.
  [
    { sound: 'stone', debris: [0x5c6472, 0x3e4553, 0x272d38] },
    { sound: 'stone', debris: [0x48505e, 0x2e3541, 0x1d2129] },
    { sound: 'crystal', debris: [0xd8f4f6, 0xb9e9ef, 0x6fb8c4] },
    { sound: 'crystal', debris: [0x52e8f5, 0x9ff6ff, 0x1b8aa8], emission: [0.08, 0.3, 0.38], glow: 1 },
    { sound: 'crystal', debris: [0xf4e8f0, 0xd0b8c8, 0x8a7a90] },
    { sound: 'crystal', debris: [0x6aa0ff, 0x2a5ad8, 0x10286a], emission: [0.06, 0.14, 0.42], glow: 1 },
    { sound: 'crystal', debris: [0xd0a0ff, 0x8a50e0, 0x3a1a6a], emission: [0.2, 0.1, 0.4], glow: 1 },
    { sound: 'crystal', debris: [0x52e8f5, 0x9ff6ff], emission: [0.08, 0.3, 0.38], glow: 1 },
  ],
  // 3 Halden Works: deep slate, ancient brick, timber, brass; iron / silver.
  [
    { sound: 'stone', debris: [0x48505e, 0x2e3541, 0x1d2129] },
    { sound: 'ancient', debris: [0x606675, 0x434955, 0x2e323c] },
    { sound: 'wood', debris: [0x7f634d, 0x5c4838, 0x403227] },
    { sound: 'metal', debris: [0xe2b673, 0xb08840, 0x5a4420] },
    { sound: 'metal', debris: [0x8f97a2, 0x686c75, 0x834434] },
    { sound: 'metal', debris: [0xf0f4fa, 0xb8c0cc, 0x6a7280], emission: [0.2, 0.22, 0.26], glow: 1 },
    { sound: 'crystal', debris: [0xff9ac0, 0xd0608a, 0x6a2a44], emission: [0.3, 0.1, 0.18], glow: 1 },
    { sound: 'wood', debris: [0x5c3f28, 0x7a5536] },
  ],
];
export const SLOT_NAMES = ['hostA', 'hostB', 'soft', 'hard', 'ore', 'rich', 'gem', 'special'] as const;
for (let b = 0; b < BIOME_BLOCKS; b++)
  for (let slot = 0; slot < 8; slot++) {
    const look = KIT_LOOKS[b % KIT_LOOKS.length][slot];
    def({
      id: BIOME_BLOCK_BASE + 8 * b + slot,
      name: `block.b${b}.${SLOT_NAMES[slot]}`,
      solid: true,
      visible: true,
      sound: look.sound,
      tiles: same(TILE.slate),
      debris: look.debris,
      emission: look.emission ?? null,
      glow: look.glow ?? 0,
    });
  }
/** Fissure emitters (the glow below, alcove lights): solid glowing stone in a key colour. */
const EMITTER_LIGHT: ReadonlyArray<[number, number, number]> = [
  [0.26, 0.62, 0.32], [0.1, 0.42, 0.52], [0.9, 0.5, 0.18], [0.9, 0.7, 0.26], [0.6, 0.3, 0.8], [0.5, 0.8, 0.3],
  [0.2, 0.55, 0.8], [1, 0.4, 0.12], [0.9, 0.6, 0.12], [0.4, 0.75, 0.95], [1, 0.92, 0.7], [0.45, 0.6, 0.9],
  [0.95, 0.85, 0.6], [0.4, 0.3, 0.95], [0.4, 0.85, 0.9], [0.95, 0.5, 0.6],
];
EMITTER_LIGHT.forEach((e, i) => def({ id: EMITTER_BASE + i, name: `block.emitter${i}`, solid: true, visible: true, sound: 'crystal', tiles: same(TILE.crystal), emission: e, glow: 1.2, debris: [0xffffff, 0xd0d0d0] }));
// Descent block kinds for hot loops: 1 rock, 2 ore, 3 rich, 4 gem/valuable shell (V11 glints).
export const VALUE_CLASS = new Uint8Array(256);
for (let b = 0; b < BIOME_BLOCKS; b++) {
  VALUE_CLASS[BIOME_BLOCK_BASE + 8 * b + SLOT.ORE] = 2;
  VALUE_CLASS[BIOME_BLOCK_BASE + 8 * b + SLOT.RICH] = 3;
  VALUE_CLASS[BIOME_BLOCK_BASE + 8 * b + SLOT.GEM] = 4;
}
VALUE_CLASS[B.CHEST_SHELL] = 4;
VALUE_CLASS[B.GOLDEN] = 3;
VALUE_CLASS[B.GEODE] = 4;
VALUE_CLASS[B.FOSSIL] = 3;

// Ids not defined yet (34..38, the content stream's) behave as air, so tables and loops over
// BLOCKS have no holes. A definition above or added later replaces the reservation.
for (let id = 0; id < 256; id++) if (!defs[id]) def({ id, name: 'block.air', solid: false, visible: false, sound: 'stone', tiles: same(0) });

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
 * Stair footing per block id: 0 = an ordinary cube; otherwise
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
