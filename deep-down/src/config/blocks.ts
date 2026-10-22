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
  /**
   * Round 2 (WORLD): only interesting things are minable. Ordinary rock is indestructible, so the
   * stone recipes need comes from rubble: loose-stone heaps on the floors near the camp and along
   * the routes (common).
   */
  RUBBLE: 34,
  /** Lanternstone (content): warm-veined stone; breaking it frees a Lantern Ember (+30 s of flame). */
  LANTERNSTONE: 35,
  /** Root tangles (round 2): hanging and creeping roots, the source of Root Fibre now that soil is indestructible (common). */
  ROOTS: 36,
  /** Gem pockets (round 2): violet geodes in the deep caverns' walls (epic); they drop gems. */
  GEM_ORE: 37,
  // 38 stays reserved (statues, fossils): air for now.
  /** Echo crystal (final pass W3): the rift's pale glass. Tier 3; it glows in the shader only, no light. */
  ECHO_CRYSTAL: 39,
  /** Ironbound stone (final pass W3): the seal-stone of the relic niches, with a rune band. Tier 3. */
  IRONBOUND: 40,
  /** The deep zones beyond the rift (content): the Glowroot's green-gold and the Ember Deep's red light. */
  LIGHT_GLOWROOT: 41,
  LIGHT_MAGMA: 42,
  /** Ember glass (content): the black glass sealing the Ember Deep. Tier 4: only a Glimmer-edged Pickaxe cuts it. */
  EMBER_GLASS: 43,
  /**
   * Round 2 (WORLD): the events director's passing lights (a crystal bloom, the echo light, a spore
   * geyser). Invisible, non-solid emitters that never persist: WorldSession.worldEdits saves them as
   * air and the director clears any it finds when a world is attached.
   */
  LIGHT_EVENT: 44,
  LIGHT_EVENT_GOLD: 45,
  // ---- Round 3 (WORLD): the twelve biomes of the strata (config/biomes.ts). Per biome: two host
  // rocks (plain), a floor (plain) and 2-3 ores or gems of rising rarity. PAINT_AS below names the
  // old block each one looks like until VIS paints it.
  // Stratum I: Amber Hollows, Mushroom Forest.
  AMBER_LIMESTONE: 46,
  AMBER_SANDSTONE: 47,
  AMBER_FLOOR: 48,
  AMBER_ORE: 49,
  MYCEL_ROCK: 50,
  SPORE_LOAM: 51,
  MYCEL_FLOOR: 52,
  SPORE_QUARTZ: 53,
  /** Giant fungi, built of blocks: stems are plain, the caps glow and are minable (common). */
  MUSHROOM_STEM: 54,
  MUSHROOM_CAP_TEAL: 55,
  MUSHROOM_CAP_MAGENTA: 56,
  // Stratum II: Root Galleries, Flooded Grottoes.
  ROOT_EARTH: 57,
  ROOT_CLAY: 58,
  ROOT_FLOOR: 59,
  GOLD_ORE: 60,
  /** The galleries' great roots (columns and arches of living wood): plain. */
  THICK_ROOT: 61,
  FLOOD_STONE: 62,
  FLOOD_SHALE: 63,
  FLOOD_FLOOR: 64,
  PEARL_ORE: 65,
  // Stratum III: Crystal Geode, Old Halden Mines.
  GEODE_ROCK: 66,
  GEODE_CALCITE: 67,
  GEODE_FLOOR: 68,
  AMETHYST: 69,
  MINE_ROCK: 70,
  MINE_SHALE: 71,
  MINE_FLOOR: 72,
  COAL_ORE: 73,
  SILVER_ORE: 74,
  // Stratum IV: Frost Caverns, Glowroot Jungle.
  FROST_ICE: 75,
  FROST_ROCK: 76,
  FROST_SNOW: 77,
  FROST_IRON: 78,
  ICE_CRYSTAL: 79,
  JUNGLE_ROCK: 80,
  JUNGLE_LOAM: 81,
  JUNGLE_MOSS: 82,
  VERDITE: 83,
  SAP_AMBER: 84,
  /** Bioluminescent vines hanging from the jungle's roofs: minable (common, fibre). */
  GLOW_VINE: 85,
  // Stratum V: Sulphur Bog, Sunken City.
  SULPHUR_ROCK: 86,
  BOG_MUD: 87,
  BOG_CRUST: 88,
  SULPHUR_ORE: 89,
  MIRE_OPAL: 90,
  /** A toxic pool's crust (floor): plain; it marks a gas pocket (HAZARD). */
  TOXIC_POOL: 91,
  CITY_STONE: 92,
  CITY_BRICK: 93,
  CITY_TILE: 94,
  RUNEGOLD: 95,
  ORICHALCUM: 96,
  // Stratum VI: Magma Veins, Obsidian Abyss, and the Heart.
  BASALT: 97,
  SCORIA: 98,
  ASH_FLOOR: 99,
  EMBERITE: 100,
  MAGMA_CORE: 101,
  /** A lava river's surface: solid (nobody sinks), plain, hot (HAZARD 'lava'), bright. */
  LAVA: 102,
  OBSIDIAN: 103,
  VOID_STONE: 104,
  OBSIDIAN_FLOOR: 105,
  VOIDSHARD: 106,
  STARSTEEL: 107,
  HEART_STONE: 108,
  // ---- Round 3 (WORLD): the strata's built things.
  /** The Gate of a stratum: the seal over its shaft. Unbreakable; it opens (turns to air) with the stratum's 2 Heart Shards. */
  GATE_SEAL: 109,
  /** Cracked walls in front of treasure vaults: minable by any pick (common). */
  CRACKED_WALL: 110,
  /** Building (LOOP's items place these): planks and bricks a pick takes back. */
  BUILT_PLANK: 111,
  BUILT_BRICK: 112,
  /** Placed climbables: invisible, non-solid cells drawn as models by VIS; CLIMB below. */
  LADDER: 113,
  ROPE: 114,
  /** A placed torch: an invisible, non-solid warm emitter drawn as a model by VIS (TorchLights). */
  TORCH: 115,
  DOOR: 116,
  DOOR_OPEN: 117,
  /** Biome light pockets (invisible, non-solid emitters). */
  LIGHT_TEAL: 118,
  LIGHT_MAGENTA: 119,
  LIGHT_ICE: 120,
  LIGHT_SULPHUR: 121,
  LIGHT_RUNE: 122,
  LIGHT_VOID: 123,
  LIGHT_HEART: 124,
  /** The mini-dungeons (Halden works): the iron-bound door of a reward vault (it opens when the works' levers or plates are all set) and a pressure plate in a floor. */
  HALDEN_DOOR: 125,
  PRESSURE_PLATE: 126,
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
  /**
   * Ordinary rock (round 2): never minable. A tap gives a soft "tunk" and a tiny chip, never damage
   * or a crack (config/rarity isMinable). Set on every plain stone, soil and gravel block.
   */
  plain?: true;
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
def({ id: B.SLATE, name: 'block.slate', solid: true, visible: true, hardness: 999, tier: UNBREAKABLE_TIER, protectedReason: 'unbreakable', plain: true, drop: noDrop, sound: 'stone', tiles: same(TILE.slate), debris: [0x363b44, 0x252a33, 0x41454d] });
def({ id: B.DEEP_SLATE, name: 'block.deepSlate', solid: true, visible: true, hardness: 999, tier: UNBREAKABLE_TIER, protectedReason: 'unbreakable', plain: true, drop: noDrop, sound: 'stone', tiles: same(TILE.deepSlate), debris: [0x2e3440, 0x252a33, 0x3b4250] });
def({ id: B.UMBER, name: 'block.umber', solid: true, visible: true, hardness: 999, tier: UNBREAKABLE_TIER, protectedReason: 'unbreakable', plain: true, drop: noDrop, sound: 'stone', tiles: same(TILE.umber), debris: [0x4a4b4d, 0x37383b, 0x404144] });
def({ id: B.SOIL, name: 'block.soil', solid: true, visible: true, hardness: 999, tier: UNBREAKABLE_TIER, protectedReason: 'unbreakable', plain: true, drop: noDrop, sound: 'soil', tiles: same(TILE.soil), debris: [0x4a3a2e, 0x3a2d23] });
def({ id: B.GRAVEL, name: 'block.gravel', solid: true, visible: true, hardness: 999, tier: UNBREAKABLE_TIER, protectedReason: 'unbreakable', plain: true, drop: noDrop, sound: 'soil', tiles: same(TILE.gravel), debris: [0x2d323b, 0x3a3d42] });
def({ id: B.MOSS, name: 'block.moss', solid: true, visible: true, hardness: 999, tier: UNBREAKABLE_TIER, protectedReason: 'unbreakable', plain: true, drop: noDrop, sound: 'soil', tiles: { top: TILE.mossTop, side: TILE.mossSide, bottom: TILE.slate }, glow: 0, debris: [0x2f5d55, 0x4d5666] });
def({ id: B.COPPER_ORE, name: 'block.copperOre', solid: true, visible: true, hardness: 4, tier: 1, drop: { item: 'copperOre', min: 1, max: 2, chance: 1 }, sound: 'metal', tiles: same(TILE.copperOre), debris: [0xa95628, 0x2d323b, 0x2f4c3e] });
def({ id: B.IRON_ORE, name: 'block.ironOre', solid: true, visible: true, hardness: 6, tier: 2, drop: { item: 'ironOre', min: 1, max: 2, chance: 1 }, sound: 'metal', tiles: same(TILE.ironOre), debris: [0x5e6269, 0x222730, 0x572b20] });
def({
  id: B.CRYSTAL, name: 'block.crystal', solid: true, visible: true, hardness: 3.5, tier: 1,
  drop: { item: 'glimmerShard', min: 1, max: 2, chance: 1 }, sound: 'crystal', tiles: same(TILE.crystal),
  // A seam in dark rock, not a lamp: enough light to find it, the clusters carry the glow.
  emission: [0.1, 0.38, 0.48], glow: 1.3, debris: [0x52e8f5, 0x9ff6ff, 0x1b8aa8],
});
def({ id: B.HARDENED_SLATE, name: 'block.hardenedSlate', solid: true, visible: true, hardness: 7, tier: 2, drop: stoneDrop, sound: 'stone', tiles: same(TILE.hardenedSlate), debris: [0x1f222b, 0x2b2f3a] });
def({ id: B.ANCIENT_BRICK, name: 'block.ancientBrick', solid: true, visible: true, hardness: 999, tier: UNBREAKABLE_TIER, protectedReason: 'unbreakable', plain: true, drop: noDrop, sound: 'ancient', tiles: { top: TILE.ancientBrickTop, side: TILE.ancientBrick, bottom: TILE.ancientBrickTop }, debris: [0x535a6a, 0x434957] });
def({ id: B.ANCIENT_TILE, name: 'block.ancientTile', solid: true, visible: true, hardness: 999, tier: UNBREAKABLE_TIER, protectedReason: 'unbreakable', plain: true, drop: noDrop, sound: 'ancient', tiles: { top: TILE.ancientTile, side: TILE.ancientBrick, bottom: TILE.ancientBrickTop }, glow: 0, debris: [0x535a6a] });
def({ id: B.CRUMBLING_BRICK, name: 'block.crumblingBrick', solid: true, visible: true, hardness: 2, tier: 1, drop: stoneDrop, sound: 'ancient', tiles: same(TILE.crumblingBrick), glow: 1.4, debris: [0x5c6474, 0x474e5c] });
def({
  id: B.GLYPH_STONE, name: 'block.glyphStone', solid: true, visible: true, hardness: 999, tier: UNBREAKABLE_TIER, protectedReason: 'unbreakable', plain: true,
  drop: noDrop, sound: 'ancient', tiles: { top: TILE.ancientBrickTop, side: TILE.glyphStone, bottom: TILE.ancientBrickTop },
  // Inscriptions breathe a faint cold light along their course; the carved runes themselves
  // wake near the lantern (terrain shader). They must never flood a room.
  emission: [0.05, 0.23, 0.28], glow: 1.25, debris: [0x535a6a],
});
def({ id: B.PLANK, name: 'block.plank', solid: true, visible: true, hardness: 999, tier: UNBREAKABLE_TIER, protectedReason: 'protected', drop: noDrop, sound: 'wood', tiles: same(TILE.plank), debris: [0x7a5536, 0x5c3f28] });
def({ id: B.BEAM, name: 'block.beam', solid: true, visible: true, hardness: 999, tier: UNBREAKABLE_TIER, protectedReason: 'protected', drop: noDrop, sound: 'wood', tiles: { top: TILE.beamEnd, side: TILE.beamSide, bottom: TILE.beamEnd }, debris: [0x5c3f28] });
def({ id: B.HEARTH, name: 'block.hearth', solid: true, visible: true, hardness: 999, tier: UNBREAKABLE_TIER, protectedReason: 'protected', drop: noDrop, sound: 'stone', tiles: same(TILE.hearth), glow: 1.1, debris: [0x332b25] });
def({ id: B.BEDROCK, name: 'block.bedrock', solid: true, visible: true, hardness: 999, tier: UNBREAKABLE_TIER, protectedReason: 'unbreakable', plain: true, drop: noDrop, sound: 'ancient', tiles: same(TILE.bedrock), debris: [0x14161c] });
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
const structureStone = { solid: true, visible: false, hardness: 999, tier: UNBREAKABLE_TIER, protectedReason: 'unbreakable', plain: true, drop: noDrop, sound: 'ancient', tiles: { top: TILE.ancientBrickTop, side: TILE.ancientBrick, bottom: TILE.ancientBrickTop }, debris: [0x535a6a, 0x434957] } as const;
def({ id: B.STRUCTURE, name: 'block.ancientBrick', ...structureStone });
def({ id: B.STRUCTURE_TIMBER, name: 'block.beam', solid: true, visible: false, hardness: 999, tier: UNBREAKABLE_TIER, protectedReason: 'protected', drop: noDrop, sound: 'wood', tiles: { top: TILE.beamEnd, side: TILE.beamSide, bottom: TILE.beamEnd }, debris: [0x5c3f28] });
for (const id of [B.RAMP_PX, B.RAMP_NX, B.RAMP_PZ, B.RAMP_NZ, B.RAMP_BASE_PX, B.RAMP_BASE_NX, B.RAMP_BASE_PZ, B.RAMP_BASE_NZ]) def({ id, name: 'block.ancientTile', ...structureStone });
// The deep tier (final pass W3). Echo crystal: the crystal's look in pale cyan-white (materials:
// echoCrystal), a glow in the shader only and no light emission (the cyan budget holds).
def({
  id: B.ECHO_CRYSTAL, name: 'block.echoCrystal', solid: true, visible: true, hardness: 6, tier: 3,
  drop: { item: 'echoShard', min: 1, max: 1, chance: 1 }, sound: 'crystal', tiles: same(TILE.crystal),
  emission: null, glow: 0, debris: [0xd8f4f6, 0xb9e9ef, 0x6fb8c4],
});
// Ironbound: the seal-stone with a rune band; it closes the relic niches until an iron pick opens them.
def({ id: B.IRONBOUND, name: 'block.ironbound', solid: true, visible: true, hardness: 12, tier: 3, drop: stoneDrop, sound: 'metal', tiles: same(TILE.hardenedSlate), debris: [0x2b2f3a, 0x4a4f5a, 0x1f222b] });
// The content pass (finished game): the lantern gamble and the deep zones beyond the rift.
// Lanternstone holds a flame: no drop (breaking it refuels the lantern, game/Progression).
def({
  id: B.LANTERNSTONE, name: 'block.lanternstone', solid: true, visible: true, hardness: 3, tier: 1, drop: noDrop, sound: 'crystal', tiles: same(TILE.hearth),
  emission: [0.55, 0.36, 0.14], glow: 0.8, debris: [0xffc76f, 0xd18a34, 0x5a2c0c],
});
// The deep zones' light: a soft green-gold from the glowroot moss, a low red from the ember fissures.
def({ id: B.LIGHT_GLOWROOT, name: 'block.light', solid: false, visible: false, hardness: 0, tier: 0, drop: noDrop, sound: 'stone', tiles: same(0), emission: [0.24, 0.36, 0.13] });
def({ id: B.LIGHT_MAGMA, name: 'block.light', solid: false, visible: false, hardness: 0, tier: 0, drop: noDrop, sound: 'stone', tiles: same(0), emission: [0.85, 0.32, 0.1] });
// Ember glass: black glass with a red heart, tier 4. It glows faintly so the seal reads in the dark.
def({ id: B.EMBER_GLASS, name: 'block.emberGlass', solid: true, visible: true, hardness: 14, tier: 4, drop: stoneDrop, sound: 'crystal', tiles: same(TILE.hardenedSlate), emission: [0.16, 0.05, 0.02], glow: 0.4, debris: [0x1a1014, 0x5a1a0c, 0x2b2f3a] });
// Round 2 (WORLD): the minable things that replace free digging. Rubble heaps give the stone the
// recipes need, root tangles the fibre, gem pockets the gems (config/rarity: common, common, epic).
def({ id: B.RUBBLE, name: 'block.rubble', solid: true, visible: true, hardness: 1.2, tier: 1, drop: { item: 'stone', min: 1, max: 2, chance: 1 }, sound: 'soil', tiles: same(TILE.gravel), debris: [0x5a5f68, 0x3d424b, 0x777b82] });
def({ id: B.ROOTS, name: 'block.roots', solid: true, visible: true, hardness: 1, tier: 1, drop: { item: 'rootFibre', min: 1, max: 2, chance: 1 }, sound: 'wood', tiles: same(TILE.soil), debris: [0x7a5a3a, 0x5a4028, 0x9a7a52] });
def({
  id: B.GEM_ORE, name: 'block.gemOre', solid: true, visible: true, hardness: 5, tier: 2,
  drop: { item: 'gem', min: 1, max: 1, chance: 1 }, sound: 'crystal', tiles: same(TILE.crystal),
  // A violet geode. No light of its own (the cold budget): its epic highlight and the shader glow show it.
  emission: null, glow: 0.9, debris: [0xb98cff, 0x7a4fd0, 0x2b2f3a],
});
def({ id: B.LIGHT_EVENT, name: 'block.light', solid: false, visible: false, hardness: 0, tier: 0, drop: noDrop, sound: 'stone', tiles: same(0), emission: [0.2, 0.62, 0.78] });
def({ id: B.LIGHT_EVENT_GOLD, name: 'block.light', solid: false, visible: false, hardness: 0, tier: 0, drop: noDrop, sound: 'stone', tiles: same(0), emission: [0.62, 0.7, 0.22] });

// ---- Round 3 (WORLD): the strata's blocks. Host rocks and floors are plain (never minable: a tap is
// a "tunk"); ores carry the tier of their stratum (config/biomes: the first ore of a biome opens one
// tier lower, so the pick of the stratum above can mine what forges the next one). Names are text
// keys from world/gen/strata/text.ts (WORLD_TEXT_EN, spread into the English table by LOOP).
const k = (key: string) => key as TextKey;
const plainRock = (id: number, name: string, sound: SoundKind, tile: number, debris: readonly number[], extra: Partial<BlockDef> = {}) =>
  def({ id, name: k(name), solid: true, visible: true, hardness: 999, tier: UNBREAKABLE_TIER, protectedReason: 'unbreakable', plain: true, drop: noDrop, sound, tiles: same(tile), debris, ...extra });
const ore = (id: number, name: string, tier: number, hardness: number, item: ItemId, sound: SoundKind, tile: number, debris: readonly number[], extra: Partial<BlockDef> = {}) =>
  def({ id, name: k(name), solid: true, visible: true, hardness, tier, drop: { item, min: 1, max: 2, chance: 1 }, sound, tiles: same(tile), debris, ...extra });
const emitter = (id: number, emission: [number, number, number]) => def({ id, name: 'block.light', solid: false, visible: false, hardness: 0, tier: 0, drop: noDrop, sound: 'stone', tiles: same(0), emission });

// Stratum I. Amber Hollows: warm limestone and sandstone, amberite and copper.
plainRock(B.AMBER_LIMESTONE, 'block.amberLimestone', 'stone', TILE.umber, [0xb08a5a, 0x8a6a44, 0xc9a374]);
plainRock(B.AMBER_SANDSTONE, 'block.amberSandstone', 'stone', TILE.umber, [0xc49a62, 0x9a7446]);
plainRock(B.AMBER_FLOOR, 'block.amberFloor', 'soil', TILE.gravel, [0xa88456, 0x7a5e3c]);
ore(B.AMBER_ORE, 'block.amberOre', 1, 3.5, 'amber', 'crystal', TILE.copperOre, [0xffb347, 0xd9822b, 0x8a5a2a], { emission: [0.22, 0.13, 0.03], glow: 0.9 });
// Mushroom Forest: dark mycelium rock, spore loam, spore quartz, and the giant fungi.
plainRock(B.MYCEL_ROCK, 'block.mycelRock', 'stone', TILE.deepSlate, [0x3a3446, 0x2a2533]);
plainRock(B.SPORE_LOAM, 'block.sporeLoam', 'soil', TILE.soil, [0x4a3a4e, 0x352a38]);
plainRock(B.MYCEL_FLOOR, 'block.mycelFloor', 'soil', TILE.mossTop, [0x5a4a66, 0x3a6a66]);
ore(B.SPORE_QUARTZ, 'block.sporeQuartz', 1, 3.5, 'sporeQuartz', 'crystal', TILE.crystal, [0x6af0e0, 0xd07ae8, 0x2a8a8a], { emission: [0.05, 0.22, 0.2], glow: 1.1 });
def({ id: B.MUSHROOM_STEM, name: k('block.mushroomStem'), solid: true, visible: true, hardness: 2.5, tier: 1, drop: { item: 'fungalWood', min: 1, max: 2, chance: 1 }, sound: 'wood', tiles: same(TILE.beamSide), debris: [0xd8cfc0, 0xa89c8a] });
def({ id: B.MUSHROOM_CAP_TEAL, name: k('block.mushroomCap'), solid: true, visible: true, hardness: 1.2, tier: 1, drop: { item: 'glowcap', min: 1, max: 2, chance: 1 }, sound: 'soil', tiles: same(TILE.mossTop), emission: [0.04, 0.3, 0.28], glow: 1.2, debris: [0x3ff0d8, 0x1a9a8a, 0x9ffff0] });
def({ id: B.MUSHROOM_CAP_MAGENTA, name: k('block.mushroomCap'), solid: true, visible: true, hardness: 1.2, tier: 1, drop: { item: 'glowcap', min: 1, max: 2, chance: 1 }, sound: 'soil', tiles: same(TILE.mossTop), emission: [0.3, 0.05, 0.26], glow: 1.2, debris: [0xf04ad8, 0x9a1a8a, 0xffa0f0] });
// Stratum II. Root Galleries: root earth and clay, gold, the great roots.
plainRock(B.ROOT_EARTH, 'block.rootEarth', 'soil', TILE.soil, [0x5a4428, 0x3e2e1a]);
plainRock(B.ROOT_CLAY, 'block.rootClay', 'soil', TILE.umber, [0x7a5a34, 0x5a4024]);
plainRock(B.ROOT_FLOOR, 'block.rootFloor', 'soil', TILE.soil, [0x4a3a22, 0x6a5a30]);
ore(B.GOLD_ORE, 'block.goldOre', 2, 5, 'goldOre', 'metal', TILE.copperOre, [0xffd34a, 0xc9a02a, 0x5a4428]);
def({ id: B.THICK_ROOT, name: k('block.thickRoot'), solid: true, visible: true, hardness: 5, tier: 2, drop: { item: 'heartwood', min: 1, max: 1, chance: 1 }, sound: 'wood', tiles: same(TILE.beamSide), debris: [0x6a4a2a, 0x4a3218, 0x8a6a3a] });
// Flooded Grottoes: cold blue stone and shale, pearls.
plainRock(B.FLOOD_STONE, 'block.floodStone', 'stone', TILE.deepSlate, [0x3a4a5e, 0x2a3646]);
plainRock(B.FLOOD_SHALE, 'block.floodShale', 'stone', TILE.slate, [0x46566a, 0x34404e]);
plainRock(B.FLOOD_FLOOR, 'block.floodFloor', 'soil', TILE.gravel, [0x5a6a7a, 0x3a4652]);
ore(B.PEARL_ORE, 'block.pearlOre', 2, 5, 'pearl', 'crystal', TILE.crystal, [0xe8f0ff, 0xb0c8e0, 0x6a8aa8], { glow: 0.8 });
// Stratum III. Crystal Geode: dark violet rock and banded calcite, amethyst (plus glimmer and gem pockets).
plainRock(B.GEODE_ROCK, 'block.geodeRock', 'stone', TILE.deepSlate, [0x3a2a4e, 0x2a1e3a]);
plainRock(B.GEODE_CALCITE, 'block.geodeCalcite', 'crystal', TILE.umber, [0xd8d0e0, 0xa898b8]);
plainRock(B.GEODE_FLOOR, 'block.geodeFloor', 'soil', TILE.gravel, [0x4a3a5a, 0x6a5a7a]);
ore(B.AMETHYST, 'block.amethyst', 3, 6, 'gem', 'crystal', TILE.crystal, [0xb070ff, 0x7a3ad0, 0xe0c0ff], { emission: [0.16, 0.06, 0.3], glow: 1.1 });
// Old Halden Mines: rust-stained rock and shale, coal (the furnace's fuel), silver.
plainRock(B.MINE_ROCK, 'block.mineRock', 'stone', TILE.umber, [0x6a4a34, 0x4a3424]);
plainRock(B.MINE_SHALE, 'block.mineShale', 'stone', TILE.slate, [0x3e3a38, 0x2e2a28]);
plainRock(B.MINE_FLOOR, 'block.mineFloor', 'soil', TILE.gravel, [0x5a4a3e, 0x3a3028]);
ore(B.COAL_ORE, 'block.coalOre', 1, 3, 'coal', 'stone', TILE.ironOre, [0x1a1a1e, 0x2e2e34, 0x4a4a50]);
ore(B.SILVER_ORE, 'block.silverOre', 3, 7, 'silverOre', 'metal', TILE.ironOre, [0xd8dce8, 0x9aa0ae, 0x4a4e5a]);
// Stratum IV. Frost Caverns: blue ice and frosted rock, frost iron, ice crystal.
plainRock(B.FROST_ICE, 'block.frostIce', 'crystal', TILE.crystal, [0xa8d8f0, 0x6aa8d0, 0xe0f4ff], { glow: 0.3 });
plainRock(B.FROST_ROCK, 'block.frostRock', 'stone', TILE.slate, [0x8a9aae, 0x5a6a7e]);
plainRock(B.FROST_SNOW, 'block.frostSnow', 'soil', TILE.gravel, [0xe8f0f8, 0xb8c8d8]);
ore(B.FROST_IRON, 'block.frostIron', 3, 8, 'rimeIron', 'metal', TILE.ironOre, [0x9ab8d8, 0x5a7898, 0xd8e8f8]);
ore(B.ICE_CRYSTAL, 'block.iceCrystal', 4, 7, 'frostCrystal', 'crystal', TILE.crystal, [0xd0f4ff, 0x8ad8f8, 0xffffff], { emission: [0.1, 0.22, 0.3], glow: 1.2 });
// Glowroot Jungle: mossy dark rock and loam, verdite, sap amber, glowing vines.
plainRock(B.JUNGLE_ROCK, 'block.jungleRock', 'stone', TILE.mossSide, [0x2a3a2a, 0x1e2a1e]);
plainRock(B.JUNGLE_LOAM, 'block.jungleLoam', 'soil', TILE.soil, [0x3a3a22, 0x2a2a18]);
plainRock(B.JUNGLE_MOSS, 'block.jungleMoss', 'soil', TILE.mossTop, [0x4a8a3a, 0x2a5a22], { glow: 0.5 });
ore(B.VERDITE, 'block.verdite', 3, 8, 'verdite', 'crystal', TILE.copperOre, [0x5aff7a, 0x2aa84a, 0x1a4a2a], { emission: [0.06, 0.26, 0.08], glow: 1.1 });
ore(B.SAP_AMBER, 'block.sapAmber', 4, 7, 'sapAmber', 'crystal', TILE.hearth, [0xffc04a, 0xd8902a, 0x6a4a1a], { emission: [0.26, 0.17, 0.04], glow: 1 });
def({ id: B.GLOW_VINE, name: k('block.glowVine'), solid: true, visible: true, hardness: 1, tier: 1, drop: { item: 'glowvine', min: 1, max: 2, chance: 1 }, sound: 'wood', tiles: same(TILE.soil), emission: [0.08, 0.24, 0.06], glow: 1, debris: [0x7aff5a, 0x3a8a2a] });
// Stratum V. Sulphur Bog: yellow-green rock, bog mud, sulphur, mire opal, toxic pools.
plainRock(B.SULPHUR_ROCK, 'block.sulphurRock', 'stone', TILE.umber, [0x9a9a3a, 0x6a6a22]);
plainRock(B.BOG_MUD, 'block.bogMud', 'soil', TILE.soil, [0x3a3a1e, 0x4a4a28]);
plainRock(B.BOG_CRUST, 'block.bogCrust', 'soil', TILE.gravel, [0x6a6a34, 0x4a4a22]);
ore(B.SULPHUR_ORE, 'block.sulphurOre', 4, 6, 'sulphur', 'crystal', TILE.copperOre, [0xf0f04a, 0xc8c82a, 0x5a5a1a], { emission: [0.18, 0.2, 0.02], glow: 0.8 });
ore(B.MIRE_OPAL, 'block.mireOpal', 5, 9, 'mireOpal', 'crystal', TILE.crystal, [0x8affc8, 0x4ac8a0, 0xf0fff8], { emission: [0.06, 0.24, 0.16], glow: 1.1 });
plainRock(B.TOXIC_POOL, 'block.toxicPool', 'soil', TILE.mossTop, [0xa8e83a, 0x6aa822], { emission: [0.12, 0.2, 0.02], glow: 1 });
// Sunken City: carved halls of stone and gold-runed brick, runegold, orichalcum.
plainRock(B.CITY_STONE, 'block.cityStone', 'ancient', TILE.ancientBrick, [0x8a7a5a, 0x6a5a40]);
plainRock(B.CITY_BRICK, 'block.cityBrick', 'ancient', TILE.ancientBrick, [0x9a8a5a, 0xc9a84a], { glow: 0.6 });
plainRock(B.CITY_TILE, 'block.cityTile', 'ancient', TILE.ancientTile, [0x7a6a4a, 0x5a4a34]);
ore(B.RUNEGOLD, 'block.runegold', 4, 8, 'runegold', 'metal', TILE.hearth, [0xffd860, 0xc9a030, 0x6a5020], { emission: [0.28, 0.2, 0.04], glow: 1.1 });
ore(B.ORICHALCUM, 'block.orichalcum', 5, 10, 'orichalcum', 'metal', TILE.copperOre, [0xff9a5a, 0xd86a3a, 0xffd0a0], { glow: 0.9 });
// Stratum VI. Magma Veins: basalt and scoria, emberite, magma core, lava.
plainRock(B.BASALT, 'block.basalt', 'stone', TILE.bedrock, [0x2a2626, 0x1a1818]);
plainRock(B.SCORIA, 'block.scoria', 'stone', TILE.umber, [0x5a2e22, 0x3a1e16]);
plainRock(B.ASH_FLOOR, 'block.ashFloor', 'soil', TILE.gravel, [0x4a4444, 0x6a6262]);
ore(B.EMBERITE, 'block.emberite', 5, 9, 'emberite', 'crystal', TILE.hearth, [0xff6a2a, 0xc83a1a, 0xffc08a], { emission: [0.34, 0.1, 0.02], glow: 1.2 });
ore(B.MAGMA_CORE, 'block.magmaCore', 6, 11, 'magmaCore', 'crystal', TILE.hearth, [0xffb04a, 0xff5a1a, 0xffffa0], { emission: [0.5, 0.22, 0.04], glow: 1.4 });
plainRock(B.LAVA, 'block.lava', 'stone', TILE.hearth, [0xff7a2a, 0xffc04a], { emission: [0.95, 0.38, 0.06], glow: 1.6 });
// Obsidian Abyss: black glass and void stone, voidshard, starsteel; the Heart's stone.
plainRock(B.OBSIDIAN, 'block.obsidian', 'crystal', TILE.bedrock, [0x14101e, 0x2a1e3e, 0x4a3a6e], { glow: 0.3 });
plainRock(B.VOID_STONE, 'block.voidStone', 'ancient', TILE.bedrock, [0x1a1424, 0x0e0a16]);
plainRock(B.OBSIDIAN_FLOOR, 'block.obsidianFloor', 'crystal', TILE.bedrock, [0x1e1a2a, 0x2e2640]);
ore(B.VOIDSHARD, 'block.voidshard', 5, 10, 'voidshard', 'crystal', TILE.crystal, [0x9a5aff, 0x5a2ac8, 0xe0c8ff], { emission: [0.2, 0.08, 0.36], glow: 1.3 });
ore(B.STARSTEEL, 'block.starsteel', 6, 12, 'starsteel', 'metal', TILE.ironOre, [0xe8e8ff, 0xa0a0d8, 0x5a5a8a], { glow: 1 });
plainRock(B.HEART_STONE, 'block.heartStone', 'ancient', TILE.hearth, [0xff3a4a, 0x8a1a2a], { emission: [0.4, 0.04, 0.08], glow: 1.5 });
// The strata's built things.
def({ id: B.GATE_SEAL, name: k('block.gateSeal'), solid: true, visible: true, hardness: 999, tier: UNBREAKABLE_TIER, protectedReason: 'protected', drop: noDrop, sound: 'ancient', tiles: same(TILE.glyphStone), emission: [0.12, 0.05, 0.1], glow: 1.2, debris: [0x535a6a, 0xff6a8a] });
def({ id: B.CRACKED_WALL, name: k('block.crackedWall'), solid: true, visible: true, hardness: 2, tier: 1, drop: stoneDrop, sound: 'stone', tiles: same(TILE.crumblingBrick), debris: [0x5c6474, 0x474e5c, 0x8a8a8a] });
def({ id: B.BUILT_PLANK, name: 'block.plank', solid: true, visible: true, hardness: 1, tier: 1, drop: null, sound: 'wood', tiles: same(TILE.plank), debris: [0x7a5536, 0x5c3f28] });
def({ id: B.BUILT_BRICK, name: 'block.ancientBrick', solid: true, visible: true, hardness: 1.5, tier: 1, drop: null, sound: 'ancient', tiles: { top: TILE.ancientBrickTop, side: TILE.ancientBrick, bottom: TILE.ancientBrickTop }, debris: [0x535a6a, 0x434957] });
def({ id: B.LADDER, name: k('block.ladder'), solid: false, visible: false, hardness: 0, tier: 0, drop: noDrop, sound: 'wood', tiles: same(TILE.plank) });
def({ id: B.ROPE, name: k('block.rope'), solid: false, visible: false, hardness: 0, tier: 0, drop: noDrop, sound: 'wood', tiles: same(TILE.beamSide) });
// A torch is a warm pool, a little brighter than a route lamp: darkness is a choice.
def({ id: B.TORCH, name: k('block.torch'), solid: false, visible: false, hardness: 0, tier: 0, drop: noDrop, sound: 'wood', tiles: same(0), emission: [1.0, 0.72, 0.4] });
def({ id: B.DOOR, name: k('block.door'), solid: true, visible: true, hardness: 1, tier: 1, drop: null, sound: 'wood', tiles: same(TILE.plank), debris: [0x7a5536, 0x5c3f28] });
def({ id: B.DOOR_OPEN, name: k('block.door'), solid: false, visible: false, hardness: 0, tier: 0, drop: noDrop, sound: 'wood', tiles: same(TILE.plank) });
emitter(B.LIGHT_TEAL, [0.08, 0.5, 0.46]);
emitter(B.LIGHT_MAGENTA, [0.46, 0.1, 0.42]);
emitter(B.LIGHT_ICE, [0.34, 0.56, 0.72]);
emitter(B.LIGHT_SULPHUR, [0.42, 0.48, 0.08]);
emitter(B.LIGHT_RUNE, [0.7, 0.54, 0.16]);
emitter(B.LIGHT_VOID, [0.32, 0.12, 0.62]);
emitter(B.LIGHT_HEART, [0.86, 0.14, 0.2]);
// The Halden works' lock: an iron-bound door (it never breaks: the works open it) and a plate set in the floor.
def({ id: B.HALDEN_DOOR, name: k('block.haldenDoor'), solid: true, visible: true, hardness: 999, tier: UNBREAKABLE_TIER, protectedReason: 'protected', drop: noDrop, sound: 'metal', tiles: same(TILE.hardenedSlate), debris: [0x5c3f28, 0x4a4f5a, 0x2b2f3a] });
def({ id: B.PRESSURE_PLATE, name: k('block.pressurePlate'), solid: true, visible: true, hardness: 999, tier: UNBREAKABLE_TIER, protectedReason: 'protected', drop: noDrop, sound: 'ancient', tiles: { top: TILE.glyphStone, side: TILE.ancientBrick, bottom: TILE.ancientBrickTop }, glow: 0.5, debris: [0x535a6a, 0x434957] });

/** The events director's passing lights (never saved). */
export const EVENT_LIGHT = new Uint8Array(256);
EVENT_LIGHT[B.LIGHT_EVENT] = 1;
EVENT_LIGHT[B.LIGHT_EVENT_GOLD] = 1;
// Ids not defined yet (38) behave as air, so tables and loops over BLOCKS have no holes.
// A definition above or added later replaces the reservation.
const MAX_BLOCK_ID = Math.max(...Object.values(B));
for (let id = 0; id <= MAX_BLOCK_ID; id++) if (!defs[id]) def({ id, name: 'block.air', solid: false, visible: false, hardness: 0, tier: 0, drop: noDrop, sound: 'stone', tiles: same(0) });

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
 * Round 3 (WORLD): the old block each new block looks like until VIS paints it (identity for the
 * blocks that have their own material). VIS's material table may fall back to BLOCK_SURFACES[PAINT_AS[id]].
 */
export const PAINT_AS = new Uint8Array(256).map((_, i) => i);
const paintAs: Array<[number, number]> = [
  [B.AMBER_LIMESTONE, B.UMBER], [B.AMBER_SANDSTONE, B.SLATE], [B.AMBER_FLOOR, B.GRAVEL], [B.AMBER_ORE, B.COPPER_ORE],
  [B.MYCEL_ROCK, B.DEEP_SLATE], [B.SPORE_LOAM, B.SOIL], [B.MYCEL_FLOOR, B.MOSS], [B.SPORE_QUARTZ, B.CRYSTAL],
  [B.MUSHROOM_STEM, B.ROOTS], [B.MUSHROOM_CAP_TEAL, B.MOSS], [B.MUSHROOM_CAP_MAGENTA, B.MOSS],
  [B.ROOT_EARTH, B.SOIL], [B.ROOT_CLAY, B.UMBER], [B.ROOT_FLOOR, B.SOIL], [B.GOLD_ORE, B.COPPER_ORE], [B.THICK_ROOT, B.ROOTS],
  [B.FLOOD_STONE, B.DEEP_SLATE], [B.FLOOD_SHALE, B.SLATE], [B.FLOOD_FLOOR, B.GRAVEL], [B.PEARL_ORE, B.ECHO_CRYSTAL],
  [B.GEODE_ROCK, B.DEEP_SLATE], [B.GEODE_CALCITE, B.UMBER], [B.GEODE_FLOOR, B.GRAVEL], [B.AMETHYST, B.GEM_ORE],
  [B.MINE_ROCK, B.UMBER], [B.MINE_SHALE, B.SLATE], [B.MINE_FLOOR, B.GRAVEL], [B.COAL_ORE, B.IRON_ORE], [B.SILVER_ORE, B.IRON_ORE],
  [B.FROST_ICE, B.ECHO_CRYSTAL], [B.FROST_ROCK, B.SLATE], [B.FROST_SNOW, B.GRAVEL], [B.FROST_IRON, B.IRON_ORE], [B.ICE_CRYSTAL, B.CRYSTAL],
  [B.JUNGLE_ROCK, B.MOSS], [B.JUNGLE_LOAM, B.SOIL], [B.JUNGLE_MOSS, B.MOSS], [B.VERDITE, B.COPPER_ORE], [B.SAP_AMBER, B.LANTERNSTONE], [B.GLOW_VINE, B.ROOTS],
  [B.SULPHUR_ROCK, B.UMBER], [B.BOG_MUD, B.SOIL], [B.BOG_CRUST, B.GRAVEL], [B.SULPHUR_ORE, B.COPPER_ORE], [B.MIRE_OPAL, B.GEM_ORE], [B.TOXIC_POOL, B.MOSS],
  [B.CITY_STONE, B.ANCIENT_BRICK], [B.CITY_BRICK, B.ANCIENT_BRICK], [B.CITY_TILE, B.ANCIENT_TILE], [B.RUNEGOLD, B.LANTERNSTONE], [B.ORICHALCUM, B.COPPER_ORE],
  [B.BASALT, B.DEEP_SLATE], [B.SCORIA, B.UMBER], [B.ASH_FLOOR, B.GRAVEL], [B.EMBERITE, B.EMBER_GLASS], [B.MAGMA_CORE, B.LANTERNSTONE], [B.LAVA, B.HEARTH],
  [B.OBSIDIAN, B.EMBER_GLASS], [B.VOID_STONE, B.BEDROCK], [B.OBSIDIAN_FLOOR, B.BEDROCK], [B.VOIDSHARD, B.GEM_ORE], [B.STARSTEEL, B.IRON_ORE],
  [B.HEART_STONE, B.HEARTH], [B.GATE_SEAL, B.IRONBOUND], [B.CRACKED_WALL, B.CRUMBLING_BRICK], [B.BUILT_PLANK, B.PLANK], [B.BUILT_BRICK, B.ANCIENT_BRICK],
  [B.DOOR, B.PLANK], [B.HALDEN_DOOR, B.IRONBOUND], [B.PRESSURE_PLATE, B.GLYPH_STONE],
];
for (const [id, look] of paintAs) PAINT_AS[id] = look;

/** Round 3: climbable cells (ladders, ropes): PlayerController climbs while its body overlaps one. */
export const CLIMB = new Uint8Array(256);
CLIMB[B.LADDER] = 1;
CLIMB[B.ROPE] = 1;

/** Round 3: what a block does to whoever stands on or in it (LOOP's hazards read this): 0 none, else the hazard. */
export type BlockHazard = 'lava' | 'gas';
export const HAZARD_OF: Partial<Record<number, BlockHazard>> = { [B.LAVA]: 'lava', [B.TOXIC_POOL]: 'gas' };

/** Round 3: blocks a player places (LOOP's items name them; a pick takes them back with no drop). */
export const PLACEABLE: ReadonlySet<number> = new Set([B.BUILT_PLANK, B.BUILT_BRICK, B.LADDER, B.ROPE, B.TORCH, B.DOOR]);

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
