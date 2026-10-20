// The biome ladder (SPEC §6.5): 14 authored biomes at fixed depths, then Echo strata forever. Each
// biome lists its ore, creature and Warden ids, what unlocks on entry and its music. Looks live in
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
  /** Creature ids (W2 Bestiary). */
  creatures: readonly [string, string, string];
  /** The Warden holding the seal at this biome's exit (into the next biome); i18n `idle.warden.<id>`. */
  warden: string;
  /** Signature event id (W2). */
  event: string;
  /** Music: mode and tempo (C's MusicScheduler). */
  music: { mode: string; root: string; bpm: number };
}

/** The 14 authored biomes. */
export const BIOMES: readonly BiomeDef[] = [
  { id: 'topsoil', start: 0, ores: ['copper', 'amber'], creatures: ['rootGrub', 'burrowBeetle', 'lampBeetle'], warden: 'haldenHatch', event: 'rootPull', music: { mode: 'majorPentatonic', root: 'D', bpm: 84 } },
  { id: 'glowroot', start: 40, ores: ['tin', 'jade'], creatures: ['glowMoth', 'rootCrawler', 'glowToad'], warden: 'rootKnot', event: 'mothSwarm', music: { mode: 'dorian', root: 'D', bpm: 86 } },
  { id: 'crystal', start: 120, ores: ['quartz', 'sapphire'], creatures: ['echoBat', 'crystalCrab', 'shardHermit'], warden: 'prismWarden', event: 'crystalBloom', music: { mode: 'lydian', root: 'E', bpm: 76 } },
  { id: 'halden', start: 240, ores: ['iron', 'silver'], creatures: ['railRat', 'cartGhost', 'steamWisp'], warden: 'crusher', event: 'pressureValves', music: { mode: 'mixolydian', root: 'C', bpm: 96 } },
  { id: 'fungal', start: 400, ores: ['gold', 'sporePearl'], creatures: ['sporeToad', 'capSnail', 'puffcap'], warden: 'motherSpore', event: 'sporeBurst', music: { mode: 'lydian', root: 'G', bpm: 72 } },
  { id: 'drowned', start: 600, ores: ['pearl', 'lapis'], creatures: ['glassEel', 'lampFish', 'glassJelly'], warden: 'drownedBell', event: 'pearlBubbles', music: { mode: 'aeolian', root: 'Bb', bpm: 70 } },
  { id: 'magma', start: 900, ores: ['ruby', 'fireOpal'], creatures: ['salamander', 'ashBeetle', 'emberNewt'], warden: 'forgeHeart', event: 'lavaSurge', music: { mode: 'phrygian', root: 'D', bpm: 100 } },
  { id: 'fossil', start: 1300, ores: ['boneGold', 'insectAmber'], creatures: ['fossilCrab', 'boneWyrm', 'marrowWorm'], warden: 'singingSkull', event: 'boneRattle', music: { mode: 'aeolian', root: 'C#', bpm: 66 } },
  { id: 'frost', start: 1800, ores: ['rimeSilver', 'frostDiamond'], creatures: ['iceMoth', 'frostFox', 'iceWyrmling'], warden: 'rimeWyrm', event: 'iceShatter', music: { mode: 'minor', root: 'B', bpm: 74 } },
  { id: 'loom', start: 2400, ores: ['lumenCrystal', 'loomstone'], creatures: ['threadSpider', 'archivistWisp', 'loomMoth'], warden: 'loomKeeper', event: 'threadWeave', music: { mode: 'lydian', root: 'A', bpm: 68 } },
  { id: 'ironCore', start: 3100, ores: ['mythril', 'magnetite'], creatures: ['ironMite', 'coreRay', 'clockworkBeetle'], warden: 'escapement', event: 'gearLock', music: { mode: 'major', root: 'Eb', bpm: 90 } },
  { id: 'starHeart', start: 3900, ores: ['starShard', 'plasmaPearl'], creatures: ['starSprite', 'novaMoth', 'starJelly'], warden: 'astralGeode', event: 'starFall', music: { mode: 'lydian', root: 'E', bpm: 74 } },
  { id: 'voidSea', start: 4800, ores: ['voidPearl', 'nullGlass'], creatures: ['voidRay', 'driftJelly', 'watcherEye'], warden: 'reflection', event: 'gravityFlip', music: { mode: 'wholeTone', root: 'C', bpm: 60 } },
  { id: 'gate', start: 5800, ores: ['gateStone', 'sigilOre'], creatures: ['gatekeeper', 'echoOfYou', 'runeMoth'], warden: 'keeper', event: 'runeLock', music: { mode: 'runes', root: 'D', bpm: 64 } },
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
