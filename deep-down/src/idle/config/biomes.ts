// The biome ladder (hybrid SPEC §4.3): 14 authored biomes at fixed depths, then Echo strata forever. Each biome lists its
// ores, the mechanism sealing its exit, its signature event and its music. Looks live in
// biomeLooks.ts (B). Echo strata come every ECHO_SPACING rows (CRITIQUE MUST 3: 550 m, not 1,100 m,
// so a new stratum arrives at least every play day in week 1) and replay base biome
// 1 + ((n − 1) mod 13) with a mutator.

export interface BiomeDef {
  /** Stable id (i18n `idle.biome.<id>`, look and kit keys). */
  id: string;
  /** Start depth (rows). */
  start: number;
  /** Ore ids: common, rich (i18n `idle.ore.<id>`). */
  ores: readonly [string, string];
  /**
   * The mechanism sealing this biome's exit into the next biome (hybrid SPEC §4.3; i18n `idle.seal.<id>`): a hatch, a
   * root knot, a prism lock… Seals are machines and locks, never beings.
   */
  seal: string;
  /** Signature event id (W2). */
  event: string;
  /** Music: mode and tempo (C's MusicScheduler). */
  music: { mode: string; root: string; bpm: number };
  creatures: readonly string[]; // always empty: read by the pre-switch world files until the purge switch deletes them
  warden: string; // = the old seal id, read by the pre-switch shell until the purge switch deletes it
}

const B = (id: string, start: number, ores: readonly [string, string], seal: string, old: string, event: string, music: BiomeDef['music']): BiomeDef => ({
  id, start, ores, seal, event, music, creatures: [], warden: old, // the two purge shims (see BiomeDef)
});

/** The 14 authored biomes (seal ids are mechanism ids, SPEC §4.3). */
export const BIOMES: readonly BiomeDef[] = [
  B('topsoil', 0, ['copper', 'amber'], 'haldenHatch', 'haldenHatch', 'rootPull', { mode: 'majorPentatonic', root: 'D', bpm: 84 }),
  B('glowroot', 40, ['tin', 'jade'], 'rootKnot', 'rootKnot', 'seedFall', { mode: 'dorian', root: 'D', bpm: 86 }),
  B('crystal', 120, ['quartz', 'sapphire'], 'prismLock', 'prismLock', 'crystalBloom', { mode: 'lydian', root: 'E', bpm: 76 }),
  B('halden', 240, ['iron', 'silver'], 'crusher', 'crusher', 'pressureValves', { mode: 'mixolydian', root: 'C', bpm: 96 }),
  B('fungal', 400, ['gold', 'sporePearl'], 'sporeValve', 'sporeValve', 'sporeBurst', { mode: 'lydian', root: 'G', bpm: 72 }),
  B('drowned', 600, ['pearl', 'lapis'], 'drownedBell', 'drownedBell', 'pearlBubbles', { mode: 'aeolian', root: 'Bb', bpm: 70 }),
  B('magma', 900, ['ruby', 'fireOpal'], 'forgeHeart', 'forgeHeart', 'lavaSurge', { mode: 'phrygian', root: 'D', bpm: 100 }),
  B('fossil', 1300, ['boneGold', 'insectAmber'], 'boneOrgan', 'boneOrgan', 'boneRattle', { mode: 'aeolian', root: 'C#', bpm: 66 }),
  B('frost', 1800, ['rimeSilver', 'frostDiamond'], 'iceLockWheel', 'iceLockWheel', 'iceShatter', { mode: 'minor', root: 'B', bpm: 74 }),
  B('loom', 2400, ['lumenCrystal', 'loomstone'], 'threadLock', 'threadLock', 'threadWeave', { mode: 'lydian', root: 'A', bpm: 68 }),
  B('ironCore', 3100, ['mythril', 'magnetite'], 'escapement', 'escapement', 'gearLock', { mode: 'major', root: 'Eb', bpm: 90 }),
  B('starHeart', 3900, ['starShard', 'plasmaPearl'], 'astralGeode', 'astralGeode', 'starFall', { mode: 'lydian', root: 'E', bpm: 74 }),
  B('voidSea', 4800, ['voidPearl', 'nullGlass'], 'mirrorGate', 'mirrorGate', 'gravityFlip', { mode: 'wholeTone', root: 'C', bpm: 60 }),
  B('gate', 5800, ['gateStone', 'sigilOre'], 'lastLintel', 'lastLintel', 'runeLock', { mode: 'runes', root: 'D', bpm: 64 }),
];

/** Authored biome count. */
export const AUTHORED_BIOMES = BIOMES.length;

/** Where Echo I starts (the end of The Gate). */
export const ECHO_START = 6900;

/** Rows between Echo strata (CRITIQUE MUST 3: 550, SPEC said 1,100). */
export const ECHO_SPACING = 550;

/** The eight mutators (SPEC §6.5; rules in W3). */
export const MUTATORS = ['hollowed', 'rich', 'molten', 'frozen', 'drowned', 'overgrown', 'inverted', 'starlit'] as const;
export type MutatorId = (typeof MUTATORS)[number];

/** Start depth of biome index k (k ≥ 14 are Echo strata: Echo n = k − 13). */
export function biomeStart(k: number): number {
  if (k <= 0) return 0;
  if (k < AUTHORED_BIOMES) return BIOMES[k].start;
  return ECHO_START + (k - AUTHORED_BIOMES) * ECHO_SPACING;
}

/** The biome index at a depth (rows). */
export function biomeAt(depth: number): number {
  if (depth < ECHO_START) {
    let k = 0;
    while (k + 1 < AUTHORED_BIOMES && BIOMES[k + 1].start <= depth) k++;
    return k;
  }
  return AUTHORED_BIOMES + Math.floor((depth - ECHO_START) / ECHO_SPACING);
}

/** The first row of the biome after the one at `depth` (its gate row / seal). */
export function nextBiomeStart(depth: number): number {
  return biomeStart(biomeAt(depth) + 1);
}

/** Echo number of biome index k (0 for authored biomes). */
export function echoNumber(k: number): number {
  return k < AUTHORED_BIOMES ? 0 : k - AUTHORED_BIOMES + 1;
}

/** The authored biome a biome index looks and plays like (Echo n replays base 1 + ((n − 1) mod 13)). */
export function baseBiome(k: number): number {
  if (k < AUTHORED_BIOMES) return Math.max(0, k);
  const n = echoNumber(k);
  return 1 + ((n - 1) % (AUTHORED_BIOMES - 1));
}

/** The biome definition for any index (Echo strata return their base). */
export function biomeDef(k: number): BiomeDef {
  return BIOMES[baseBiome(k)];
}

/**
 * The mutators of Echo stratum k (empty for authored biomes): one from Echo I, a second from the second
 * cycle (n ≥ 14), a third from the third. The same mutator never lands on the same base biome in two
 * consecutive cycles (the offset per cycle is coprime to 8).
 */
export function mutatorsOf(k: number): MutatorId[] {
  const n = echoNumber(k);
  if (n <= 0) return [];
  const cycle = Math.floor((n - 1) / (AUTHORED_BIOMES - 1));
  const base = baseBiome(k);
  const out: MutatorId[] = [];
  const count = Math.min(3, 1 + cycle);
  for (let j = 0; j < count; j++) {
    const i = (base * 3 + cycle * 5 + j * 3) % MUTATORS.length;
    let id = MUTATORS[i];
    let step = 1;
    while (out.includes(id)) id = MUTATORS[(i + step++) % MUTATORS.length];
    out.push(id);
  }
  return out;
}

/** Hue rotation of Echo stratum k in degrees (+37° per Echo number; SPEC §6.5). */
export function echoHue(k: number): number {
  return (echoNumber(k) * 37) % 360;
}

/**
 * One-time depth cards (CRITIQUE MUST 11): the real world's depths and heights, shown the first time the
 * displayed depth passes them. `metres` is display metres (rows × the display scale).
 */
export const DEPTH_CARDS: ReadonlyArray<{ id: string; metres: number }> = [
  { id: 'burj', metres: 828 },
  { id: 'mponeng', metres: 3900 },
  { id: 'everest', metres: 8849 },
  { id: 'kola', metres: 12262 },
  { id: 'moho', metres: 35000 },
  { id: 'mantle', metres: 660000 },
  { id: 'outerCore', metres: 2890000 },
  { id: 'innerCore', metres: 5150000 },
  { id: 'centre', metres: 6371000 },
  { id: 'through', metres: 12742000 },
  { id: 'moon', metres: 384400000 },
  { id: 'sun', metres: 149600000000 },
];
