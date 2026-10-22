import { ALL_KINDS, SPECIES, isGuardian } from './species';
import type { BestiaryEntry, BiomeRoster, MobBiome, MobKind, RosterEntry } from './types';

/**
 * The twelve biomes' creatures (round 3, MOBS; BRIEF §0.5): at least three monsters, one or more
 * endearing beings and one guardian per biome, the first game's twelve kinds among them, and the
 * Heart's boss at the very bottom. The spawner picks by weight inside a family; packs come several
 * at once; `night` and `dark` raise a weight when the day cycle turns or the flame dies.
 */
const e = (kind: MobKind, weight: number, pack: [number, number], max: number, extra: Partial<RosterEntry> = {}): RosterEntry => ({ kind, weight, pack, max, ...extra });

export const ROSTERS: Record<MobBiome, BiomeRoster> = {
  amberHollows: {
    biome: 'amberHollows',
    stratum: 1,
    monsters: [e('crawler', 4, [1, 3], 5, { nest: true, dark: 1.6 }), e('amberTick', 3, [3, 5], 7, { nest: true, night: 1.5 }), e('gnasher', 1.5, [1, 1], 2)],
    beings: [e('glimmerkin', 3, [1, 1], 2), e('moth', 1, [6, 9], 12)],
    guardian: 'amberMatriarch',
  },
  mushroomForest: {
    biome: 'mushroomForest',
    stratum: 1,
    monsters: [e('sporeling', 3, [2, 3], 5, { nest: true }), e('capSpitter', 3, [1, 2], 3), e('wisp', 1.5, [1, 1], 2, { dark: 2, night: 1.5 })],
    beings: [e('moth', 3, [7, 10], 14), e('jelly', 0.6, [1, 1], 1)],
    guardian: 'mycelord',
  },
  rootGalleries: {
    biome: 'rootGalleries',
    stratum: 2,
    monsters: [e('rootLasher', 3, [1, 2], 3, { dark: 1.4 }), e('tunnelGrub', 2, [1, 1], 2), e('thornback', 2.5, [1, 2], 3, { night: 1.4 }), e('crawler', 1.5, [2, 3], 4, { nest: true })],
    beings: [e('burrower', 3, [1, 1], 1), e('glimmerkin', 1, [1, 1], 1)],
    guardian: 'elderTaproot',
  },
  floodedGrottoes: {
    biome: 'floodedGrottoes',
    stratum: 2,
    monsters: [e('brineLeech', 3.5, [3, 5], 7, { nest: true }), e('spitNewt', 3, [1, 3], 4), e('clatterclaw', 1.5, [1, 1], 2, { night: 1.5 })],
    beings: [e('jelly', 3, [1, 2], 3), e('moth', 1, [5, 8], 10)],
    guardian: 'tideWarden',
  },
  crystalGeode: {
    biome: 'crystalGeode',
    stratum: 3,
    monsters: [e('shardling', 3, [2, 3], 5, { nest: true }), e('prismBat', 3, [2, 3], 5, { night: 1.6 }), e('geodeGolem', 1.2, [1, 1], 1), e('gnasher', 1, [1, 1], 2)],
    beings: [e('shellback', 3, [1, 1], 1), e('glimmerkin', 1.5, [1, 1], 2)],
    guardian: 'quartzTitan',
  },
  haldenMines: {
    biome: 'haldenMines',
    stratum: 3,
    monsters: [e('rustMite', 3.5, [4, 6], 8, { nest: true }), e('fuseBeetle', 2.5, [1, 2], 3), e('sentinel', 1, [1, 1], 1), e('wisp', 1, [1, 1], 2, { dark: 2 })],
    beings: [e('lampling', 3, [2, 3], 3), e('burrower', 1.2, [1, 1], 1)],
    guardian: 'foremanEngine',
  },
  frostCaverns: {
    biome: 'frostCaverns',
    stratum: 4,
    monsters: [e('icefang', 3, [2, 3], 4, { night: 1.6 }), e('frostBat', 3, [2, 4], 5), e('shiverDrip', 2, [1, 2], 3, { dark: 1.5 })],
    beings: [e('hearthmite', 3, [1, 2], 2), e('jelly', 0.6, [1, 1], 1)],
    guardian: 'rimeWyrm',
  },
  glowrootJungle: {
    biome: 'glowrootJungle',
    stratum: 4,
    monsters: [e('glowMantis', 3, [1, 2], 3, { night: 1.5 }), e('bloatToad', 3, [1, 2], 3), e('snapjaw', 1.5, [1, 1], 2), e('crawler', 1, [2, 4], 5, { nest: true })],
    beings: [e('vinebell', 3, [1, 1], 2), e('moth', 2, [8, 12], 14), e('lampling', 0.6, [2, 2], 2)],
    guardian: 'thornmother',
  },
  sulphurBog: {
    biome: 'sulphurBog',
    stratum: 5,
    monsters: [e('gasbag', 3, [1, 3], 4), e('sulphurSpitter', 3, [1, 2], 3), e('mireLurker', 2, [1, 1], 2, { night: 1.4 })],
    beings: [e('mudpup', 3, [1, 1], 2), e('jelly', 0.8, [1, 1], 1)],
    guardian: 'miasmaKing',
  },
  sunkenCity: {
    biome: 'sunkenCity',
    stratum: 5,
    monsters: [e('gildedScarab', 3.5, [4, 6], 8, { nest: true }), e('runeSentry', 2.5, [1, 2], 3), e('chestMimic', 1.5, [1, 1], 2), e('sentinel', 0.8, [1, 1], 1)],
    beings: [e('relicTurtle', 3, [1, 1], 1), e('lampling', 1, [2, 3], 3)],
    guardian: 'gildedColossus',
  },
  magmaVeins: {
    biome: 'magmaVeins',
    stratum: 6,
    monsters: [e('emberMite', 3.5, [3, 5], 7, { nest: true }), e('cinderHound', 3, [2, 3], 4, { night: 1.5 }), e('magmaBrute', 1.2, [1, 1], 1), e('fuseBeetle', 1, [1, 2], 2)],
    beings: [e('salamander', 3, [1, 1], 2)],
    guardian: 'magmaBehemoth',
  },
  obsidianAbyss: {
    biome: 'obsidianAbyss',
    stratum: 6,
    monsters: [e('glassWraith', 3, [1, 3], 4, { dark: 1.5 }), e('voidEye', 3, [1, 2], 3), e('stalker', 1, [1, 1], 1, { dark: 2.5 })],
    beings: [e('starmote', 3, [2, 3], 3)],
    guardian: 'voidHerald',
  },
  heart: {
    biome: 'heart',
    stratum: 6,
    monsters: [e('glassWraith', 2, [1, 2], 3), e('voidEye', 2, [1, 1], 2), e('emberMite', 2, [3, 4], 5)],
    beings: [e('starmote', 2, [2, 3], 3)],
    guardian: 'heartOfDark',
  },
};

/** The stratum (1..6) of a biome (the Heart counts as VI). */
export function stratumOf(biome: MobBiome): number {
  return ROSTERS[biome].stratum;
}

/** The two biomes of a stratum, in order. */
export function biomesOfStratum(stratum: number): MobBiome[] {
  return (Object.keys(ROSTERS) as MobBiome[]).filter((b) => b !== 'heart' && ROSTERS[b].stratum === stratum);
}

/** A biome for a depth in the first (hand-made) world, which has no biome map: 90 m a stratum, alternating by column. */
export function biomeForDepth(depth: number, x = 0, z = 0): MobBiome {
  const s = Math.max(1, Math.min(6, Math.floor(Math.max(0, depth) / 90) + 1));
  const pair = biomesOfStratum(s);
  const k = Math.sin(x * 0.031 + z * 0.017) + Math.sin(z * 0.023 - x * 0.011) > 0 ? 1 : 0;
  return pair[k] ?? pair[0];
}

// ---------------------------------------------------------------------------------------
// The bestiary's pages

/** Every page in display order: by biome, monsters, then beings, then the guardian. */
export const BESTIARY_ORDER: readonly MobKind[] = (() => {
  const out: MobKind[] = [];
  const seen = new Set<MobKind>();
  const push = (k: MobKind) => {
    if (seen.has(k)) return;
    seen.add(k);
    out.push(k);
  };
  for (const b of Object.keys(ROSTERS) as MobBiome[]) {
    for (const k of ALL_KINDS) if (SPECIES[k].biome === b && SPECIES[k].family === 'monster' && !isGuardian(k)) push(k);
    for (const k of ALL_KINDS) if (SPECIES[k].biome === b && SPECIES[k].family === 'being') push(k);
    push(ROSTERS[b].guardian);
  }
  for (const k of ALL_KINDS) push(k);
  return out;
})();

export function bestiary(kind: MobKind): BestiaryEntry {
  const s = SPECIES[kind];
  return {
    kind,
    family: s.family,
    rank: s.rank,
    archetype: s.archetype,
    biome: s.biome,
    nameKey: `mob.${kind}`,
    loreKey: `mob.lore.${kind}`,
    tipKey: `mob.tip.${kind}`,
    threat: s.threat,
    size: s.size,
    hp: s.hp,
    damage: s.damage,
    element: s.element,
    drops: s.drops.map((x) => x.items[0]),
  };
}

/** Bestiary bonus: a completed page (scanned or defeated) makes blows land harder on that kind. */
export const BESTIARY_BONUS = 1.2;
