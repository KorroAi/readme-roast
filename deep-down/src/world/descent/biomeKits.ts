import { B, EMITTER, SLOT, biomeBlock } from '../../config/blocks';
import type { PropKind, PropTap } from '../../render/props/types';

/**
 * What each biome is built from (SPEC §6.5, §6.6): block ids per role (64 + 8 b + slot, painted by 2D's section
 * look), its key-colour emitter (the glow below the seal above it, alcove and cavern lights), the dressing of its
 * alcoves and caverns (medium props, the small scatter, the hero), its tappables, its
 * liquid and its ambient particles. All 14 authored biomes; Echo strata use their base biome's kit (W3 adds the
 * mutator kits).
 */
export interface BiomeKit {
  /** Host rock families laid in dipping beds (hostA, hostB) and the look-only lenses. */
  hostA: number;
  hostB: number;
  soft: number;
  hard: number;
  ore: number;
  rich: number;
  gem: number;
  special: number;
  /** The key-colour fissure emitter (solid glowing stone). */
  emitter: number;
  /** Medium dressing props (alcoves, caverns), with weights. */
  props: ReadonlyArray<[PropKind, number]>;
  /** The small scatter (instanced: 1 per ~3 m of cavern floor), with weights. */
  small: ReadonlyArray<[PropKind, number]>;
  /** The hero of a grotto (SPEC §6.6 per-biome fill) and its scale. */
  hero: [PropKind, number];
  /** What an alcove's tappable is (a crate, an urn, a note, a crystal). */
  tappable: [PropKind, PropTap, number];
  /** The alcove light: a hanging lantern (people) or the biome's own glow. */
  alcoveLight: 'lantern' | 'emitter';
  /** Bed thickness range (m) and dip (degrees). */
  beds: [number, number];
  dip: number;
  /** The biome's liquid (30 % of caverns), or null. */
  liquid: 'water' | 'lava' | 'brass' | 'ice' | 'spore' | null;
  /** Ambient particles in its caverns and their colour. */
  mote: 'dust' | 'spore' | 'ember' | 'bubble' | 'snow' | 'glint' | 'thread';
  moteColor: number;
}

type KitSpec = Omit<BiomeKit, 'hostA' | 'hostB' | 'soft' | 'hard' | 'ore' | 'rich' | 'gem' | 'special'>;

const kit = (b: number, k: KitSpec): BiomeKit => ({
  hostA: biomeBlock(b, SLOT.HOST_A),
  hostB: biomeBlock(b, SLOT.HOST_B),
  soft: biomeBlock(b, SLOT.SOFT),
  hard: biomeBlock(b, SLOT.HARD),
  ore: biomeBlock(b, SLOT.ORE),
  rich: biomeBlock(b, SLOT.RICH),
  gem: biomeBlock(b, SLOT.GEM),
  special: biomeBlock(b, SLOT.SPECIAL),
  ...k,
});

const KITS: readonly BiomeKit[] = [
  // 0 Topsoil Roots: soil, gravel, umber, root wood; the Halden crews' crates and barrels; seep water.
  kit(0, {
    emitter: EMITTER.SODIUM,
    props: [['crate', 3], ['barrel', 2], ['ropeCoil', 2], ['pickaxeRack', 1], ['satchel', 1], ['brokenCart', 1], ['root', 2], ['mushroom', 1]],
    small: [['pebbles', 4], ['root', 1], ['mushroom', 1]],
    hero: ['root', 2.6],
    tappable: ['crate', 'crate', 1],
    alcoveLight: 'lantern',
    beds: [3, 6],
    dip: 4,
    liquid: 'water',
    mote: 'dust',
    moteColor: 0xd8c0a0,
  }),
  // 1 Glowroot Caverns: moss, slate, root wood, glowroot; green light from the roots; a dark mirror pool.
  kit(1, {
    emitter: EMITTER.GLOWROOT,
    props: [['root', 4], ['mushroom', 2], ['crystalCluster', 1], ['ropeCoil', 1], ['haldenNote', 1], ['tablet', 1]],
    small: [['root', 2], ['mushroom', 2], ['pebbles', 3]],
    hero: ['root', 3.2],
    tappable: ['crystalCluster', 'crystal', 2],
    alcoveLight: 'emitter',
    beds: [4, 8],
    dip: 6,
    liquid: 'water',
    mote: 'spore',
    moteColor: 0x9be7a8,
  }),
  // 2 Crystal Grotto: slate, deep slate, echo crystal, crystal; spires with uplight; a mirror pool.
  kit(2, {
    emitter: EMITTER.CRYSTAL,
    props: [['crystalCluster', 4], ['stalagmite', 3], ['tablet', 1], ['runeStone', 1]],
    small: [['crystalCluster', 1], ['stalagmite', 2], ['pebbles', 3]],
    hero: ['crystalCluster', 3.5],
    tappable: ['crystalCluster', 'crystal', 3],
    alcoveLight: 'emitter',
    beds: [5, 9],
    dip: 8,
    liquid: 'water',
    mote: 'glint',
    moteColor: 0x8fe3ee,
  }),
  // 3 Halden Works: deep slate, ancient brick, timber, brass; the old works' kit.
  kit(3, {
    emitter: EMITTER.SODIUM,
    props: [['brokenCart', 2], ['crate', 2], ['barrel', 2], ['pickaxeRack', 1], ['hoistWinch', 1], ['lanternPost', 1], ['gear', 1]],
    small: [['pebbles', 3], ['crate', 1], ['barrel', 1]],
    hero: ['hoistWinch', 2.4],
    tappable: ['crate', 'crate', 1],
    alcoveLight: 'lantern',
    beds: [3, 7],
    dip: 3,
    liquid: null,
    mote: 'dust',
    moteColor: 0xffc890,
  }),
  // 4 Fungal Deep: umber, moss, cap, mycel; mushrooms 2-5 m, shelf fungi; spore pools.
  kit(4, {
    emitter: EMITTER.SPORE,
    props: [['mushroom', 5], ['root', 1], ['satchel', 1], ['crystalCluster', 1]],
    small: [['mushroom', 4], ['pebbles', 2]],
    hero: ['mushroom', 4.5],
    tappable: ['mushroom', 'gem', 2],
    alcoveLight: 'emitter',
    beds: [4, 8],
    dip: 5,
    liquid: 'spore',
    mote: 'spore',
    moteColor: 0xc58cff,
  }),
  // 5 Drowned Ruins: ancient tile, glyph stone, masonry, coral; columns, urns; a flooded floor.
  kit(5, {
    emitter: EMITTER.AQUA,
    props: [['urn', 3], ['coral', 3], ['runeStone', 1], ['tablet', 1], ['crate', 1]],
    small: [['coral', 3], ['pebbles', 2], ['urn', 1]],
    hero: ['runeStone', 3.2],
    tappable: ['urn', 'crate', 1],
    alcoveLight: 'lantern',
    beds: [3, 6],
    dip: 2,
    liquid: 'water',
    mote: 'bubble',
    moteColor: 0x9fe6ff,
  }),
  // 6 Magma Veins: basalt, obsidian, magma; obsidian spikes, basalt columns; a lava river.
  kit(6, {
    emitter: EMITTER.LAVA,
    props: [['stalagmite', 4], ['forge', 1], ['crystalCluster', 1], ['pebbles', 2]],
    small: [['stalagmite', 2], ['pebbles', 3]],
    hero: ['stalagmite', 3.8],
    tappable: ['crystalCluster', 'gem', 2],
    alcoveLight: 'emitter',
    beds: [5, 9],
    dip: 7,
    liquid: 'lava',
    mote: 'ember',
    moteColor: 0xff9a40,
  }),
  // 7 Fossil Halls: bone, resin, umber; bones, ribs, resin lumps.
  kit(7, {
    emitter: EMITTER.RESIN,
    props: [['bone', 3], ['rib', 3], ['tablet', 1], ['crate', 1]],
    small: [['bone', 3], ['pebbles', 2]],
    hero: ['rib', 4.0],
    tappable: ['tablet', 'fossil', 5],
    alcoveLight: 'lantern',
    beds: [4, 8],
    dip: 4,
    liquid: null,
    mote: 'dust',
    moteColor: 0xffd090,
  }),
  // 8 Frost Hollow: ice, frost slate, echo crystal; icicles, ice pillars; an ice sheet.
  kit(8, {
    emitter: EMITTER.ICE,
    props: [['iceSpire', 4], ['crystalCluster', 1], ['crate', 1], ['lanternPost', 1]],
    small: [['iceSpire', 2], ['pebbles', 2]],
    hero: ['iceSpire', 4.2],
    tappable: ['crystalCluster', 'crystal', 3],
    alcoveLight: 'emitter',
    beds: [4, 8],
    dip: 6,
    liquid: 'ice',
    mote: 'snow',
    moteColor: 0xe8f4ff,
  }),
  // 9 The Loom: pale ashlar, glyph stone, ancient brick; glass lanterns, looms, threads.
  kit(9, {
    emitter: EMITTER.WHITE_GOLD,
    props: [['lanternPost', 2], ['crystalCluster', 2], ['surveyTable', 1], ['runeStone', 1], ['urn', 1]],
    small: [['crystalCluster', 1], ['pebbles', 2], ['urn', 1]],
    hero: ['crystalCluster', 3.8],
    tappable: ['crystalCluster', 'crystal', 2],
    alcoveLight: 'lantern',
    beds: [3, 6],
    dip: 1,
    liquid: null,
    mote: 'thread',
    moteColor: 0xfff4d0,
  }),
  // 10 Iron Core: ironbound, deep slate, gear metal; pistons, gears, pipes; molten brass.
  kit(10, {
    emitter: EMITTER.STEEL,
    props: [['gear', 4], ['barrel', 1], ['hoistWinch', 1], ['brokenCart', 1]],
    small: [['gear', 1], ['pebbles', 3]],
    hero: ['gear', 4.2],
    tappable: ['crate', 'crate', 1],
    alcoveLight: 'lantern',
    beds: [3, 7],
    dip: 3,
    liquid: 'brass',
    mote: 'ember',
    moteColor: 0xffb060,
  }),
  // 11 Star Heart: star glass, gold rock, crystal; a sunstone shard field, star spires.
  kit(11, {
    emitter: EMITTER.STAR,
    props: [['sunshard', 4], ['crystalCluster', 2], ['stalagmite', 1]],
    small: [['sunshard', 2], ['pebbles', 2]],
    hero: ['sunshard', 4.5],
    tappable: ['sunshard', 'gem', 2],
    alcoveLight: 'emitter',
    beds: [4, 8],
    dip: 5,
    liquid: null,
    mote: 'glint',
    moteColor: 0xfff1c2,
  }),
  // 12 Void Sea: void stone, echo crystal, bedrock; null-glass shards, drifting jellies; an upward fall.
  kit(12, {
    emitter: EMITTER.VOID,
    props: [['nullShard', 4], ['runeStone', 1], ['crystalCluster', 1]],
    small: [['nullShard', 2], ['pebbles', 2]],
    hero: ['nullShard', 4.8],
    tappable: ['nullShard', 'gem', 2],
    alcoveLight: 'emitter',
    beds: [5, 9],
    dip: 8,
    liquid: null,
    mote: 'glint',
    moteColor: 0xb9a2ff,
  }),
  // 13 The Gate: glyph stone, bedrock, black stone; rune pillars, monoliths, rune stones, tablets.
  kit(13, {
    emitter: EMITTER.RUNE,
    props: [['runeStone', 4], ['tablet', 2], ['urn', 1], ['lanternPost', 1]],
    small: [['runeStone', 1], ['pebbles', 3]],
    hero: ['runeStone', 4.0],
    tappable: ['tablet', 'note', 1],
    alcoveLight: 'emitter',
    beds: [3, 6],
    dip: 2,
    liquid: null,
    mote: 'glint',
    moteColor: 0x8fe3ee,
  }),
];

/** The kit of a (base) biome index. */
export function kitOf(biome: number): BiomeKit {
  const b = Math.max(0, biome);
  return KITS[b % KITS.length];
}

/** Key colour of each biome's light (sRGB), from SPEC §11.2: the glow below, lamps and halos. */
export const KEY_COLOUR: readonly number[] = [0xffb35c, 0x9be7a8, 0x2fb6cc, 0xffa04a, 0xc58cff, 0x5fb7ff, 0xff7a2e, 0xffb000, 0x7fd8ff, 0xfff4d0, 0x8fb8ff, 0xfff1c2, 0x6a5cff, 0x8fe3ee];

/** The surface turf of row 0, and the chest shell. */
export const SURFACE_BLOCK = B.TOPSOIL;
