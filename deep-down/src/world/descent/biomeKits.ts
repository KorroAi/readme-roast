import { B, EMITTER, SLOT, biomeBlock } from '../../config/blocks';
import type { PropKind } from '../../render/props/types';

/**
 * What each biome is built from (SPEC §6.5, §6.6): block ids per role, the dressing props of its alcoves and
 * chambers, its key-colour emitter (the glow below the seal above it, alcove lights). W1 authors biomes 0-3;
 * deeper biomes reuse these kits until W2 paints theirs (the block ids are already per biome).
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
  /** Medium dressing props (alcoves, chambers), with weights. */
  props: ReadonlyArray<[PropKind, number]>;
  /** The alcove light: a hanging lantern (people) or the biome's own glow. */
  alcoveLight: 'lantern' | 'emitter';
  /** Bed thickness range (m) and dip (degrees). */
  beds: [number, number];
  dip: number;
}

const kit = (b: number, k: Omit<BiomeKit, 'hostA' | 'hostB' | 'soft' | 'hard' | 'ore' | 'rich' | 'gem' | 'special'>): BiomeKit => ({
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

const W1_KITS: readonly BiomeKit[] = [
  // 0 Topsoil Roots: soil, gravel, umber, root wood; the Halden crews' crates and barrels.
  kit(0, {
    emitter: EMITTER.SODIUM,
    props: [['crate', 3], ['barrel', 2], ['ropeCoil', 2], ['pickaxeRack', 1], ['satchel', 1], ['brokenCart', 1]],
    alcoveLight: 'lantern',
    beds: [3, 6],
    dip: 4,
  }),
  // 1 Glowroot Caverns: moss, slate, root wood, glowroot; green light from the roots.
  kit(1, {
    emitter: EMITTER.GLOWROOT,
    props: [['crystalCluster', 1], ['ropeCoil', 1], ['crate', 1], ['haldenNote', 1], ['tablet', 1]],
    alcoveLight: 'emitter',
    beds: [4, 8],
    dip: 6,
  }),
  // 2 Crystal Grotto: slate, deep slate, echo crystal, crystal.
  kit(2, {
    emitter: EMITTER.CRYSTAL,
    props: [['crystalCluster', 4], ['tablet', 1], ['runeStone', 1]],
    alcoveLight: 'emitter',
    beds: [5, 9],
    dip: 8,
  }),
  // 3 Halden Works: deep slate, ancient brick, timber, brass; the old works' kit.
  kit(3, {
    emitter: EMITTER.SODIUM,
    props: [['brokenCart', 2], ['crate', 2], ['barrel', 2], ['pickaxeRack', 1], ['hoistWinch', 1], ['lanternPost', 1]],
    alcoveLight: 'lantern',
    beds: [3, 7],
    dip: 3,
  }),
];

/** The kit of a (base) biome index. */
export function kitOf(biome: number): BiomeKit {
  const b = Math.max(0, biome);
  if (b < W1_KITS.length) return W1_KITS[b];
  // Until W2: the block ids are the biome's own (its look reuses a W1 kit's materials).
  const base = W1_KITS[b % W1_KITS.length];
  return { ...base, ...kit(b, { emitter: base.emitter, props: base.props, alcoveLight: base.alcoveLight, beds: base.beds, dip: base.dip }) };
}

/** Key colour of each biome's light (sRGB), from SPEC §11.2: the glow below, lamps and halos. */
export const KEY_COLOUR: readonly number[] = [0xffb35c, 0x9be7a8, 0x2fb6cc, 0xffa04a, 0xc58cff, 0x5fb7ff, 0xff7a2e, 0xffb000, 0x7fd8ff, 0xfff4d0, 0x8fb8ff, 0xfff1c2, 0x6a5cff, 0x8fe3ee];

/** The surface turf of row 0, and the chest shell. */
export const SURFACE_BLOCK = B.TOPSOIL;
