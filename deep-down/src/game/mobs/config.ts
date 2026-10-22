import { SPECIES, type Drop, type MobDef } from './species';
import type { MobKind } from './types';

/**
 * The creatures' rules (rounds 2-3, MOBS). Each kind's numbers live in species.ts (MOB_DEFS is
 * that table); damage to the explorer is in health points (100 at the start, more with armour).
 */
export type { Locomotion, MobDef } from './species';

export const MOB_DEFS: Record<MobKind, MobDef> = SPECIES;

/** The spawner and the survival rules. */
export const MOBS_RULES = {
  /** No monster above this displayed depth (m): the Hollow, from the landing down (overridden from the layout). */
  monsterDepth: 85,
  /** Depth over which the monster budget rises from 1 to its max. */
  depthRamp: 60,
  maxMonsters: 6,
  /** Beings appear from the tunnel down (not in camp). */
  beingDepth: 52,
  maxBeings: 4,
  /** Spawn shell round the explorer (m). */
  spawnMin: 12,
  spawnMax: 24,
  /** Never spawn within the lantern's pool: its radius times this, plus the margin. */
  poolFactor: 0.75,
  poolMargin: 2.5,
  /** Placed light (lamps, crystals) above this keeps monsters away from a cell (0..1 of the light volume). */
  darkLight: 0.22,
  /** Mobs farther than this are put away. */
  despawn: 42,
  /** Seconds between two spawn attempts, and the shortest gap between two monster spawns. */
  attemptEvery: 1.2,
  monsterGap: 7,
  beingGap: 9,
  /** The Hollow Stalker: rare (one in this many monster spawns at depth, at most one every `stalkerGap` s). */
  stalkerOdds: 7,
  stalkerGap: 150,
  /** The flame counts as "full" above this (the Stalker flees), "dim" below `dimFlame` (it approaches). */
  fullFlame: 0.72,
  dimFlame: 0.45,
  /** A wisp near the flame drains this many seconds of oil per second and dims it to `wispDim`. */
  wispDrain: 2.5,
  wispDim: 0.55,
  /** Lamplings follow this long, then go home. */
  lamplingFollow: 75,
  /** A drift jelly's spores: oil seconds given, light boost and its length. */
  jellyOil: 45,
  jellyBoost: 1.22,
  jellyBoostSeconds: 30,
  /** A Shellback's crystals regrow one every this many seconds. */
  shellRegrow: 90,
  /** The Deep Worm passes at most once every this many seconds. */
  wormGap: 300,
  /** Seconds a hit flash lasts on a mob. */
  flash: 0.16,
  /** Hit stop on a monster strike (s). */
  hitStop: 0.04,
  /** Reach for touching a being (m, from the eye). */
  touchReach: 3.6,
  // ---- Round 3: the strata (BRIEF §0.5, §0.6).
  /** Monsters about at once per stratum (index 1..6), before the night and dark bonuses. */
  strataMonsters: [0, 4, 5, 6, 7, 8, 9] as readonly number[],
  /** Beings about at once per stratum. */
  strataBeings: [0, 4, 4, 4, 5, 5, 5] as readonly number[],
  /** Up to this many more monsters in deep night and with a dead flame. */
  nightExtra: 2,
  darkExtra: 2,
  /** Shortest gap between two monster spawns in the strata (s). */
  strataGap: 4,
  /** A quiet stretch longer than this (s, random in the band) brings an encounter (20-40 s in the deep). */
  encounterMin: 20,
  encounterMax: 38,
  /** Nests: a pack while the explorer is within `nestRange` m, at most every `nestGap` s; quiet after `nestKills`. */
  nestRange: 24,
  nestGap: 12,
  nestKills: 10,
  /** Guardians: wake inside their lair's radius, reset after `leashSeconds` outside it plus `leashMargin`. */
  leashMargin: 12,
  leashSeconds: 8,
  /** A guardian's open guard (after each attack) takes this much more. */
  vulnerable: 1.6,
  /** A stunned charger (it hit a wall) takes this much more. */
  stunned: 1.5,
  /** Watching a creature up close this long (s, within `watchRange` m, near the screen centre) scans it. */
  watchSeconds: 1.6,
  watchRange: 9,
  /** Hostile spits: their life (s); at most this many in the air. */
  spitLife: 3.2,
  maxSpits: 40,
  /** The hit stop on a strong blow (a weak spot, a kill). */
  hitStopHeavy: 0.07,
  /** Knock-back speed (m/s) of a blow on a mass-1 creature. */
  knock: 5,
  /** A fleeing being chased this long (s) runs out of breath and stops (catch it then). */
  chaseTire: 4.5,
  /** Placed light this bright (0..1 of the light volume: a torch's pool) keeps swarmers off. */
  torchFear: 0.5,
} as const;

/** Drops: each entry lists item ids in preference order (the first one the game knows is used). */
export const MOB_DROPS: Partial<Record<MobKind, readonly Drop[]>> = Object.fromEntries(Object.entries(SPECIES).filter(([, d]) => d.drops.length > 0).map(([k, d]) => [k, d.drops]));

/** The treasure burrower (an event): a golden thief whose pouch is full. */
export const TREASURE_DROPS = [
  { items: ['glimmerShard', 'amber'], min: 1, max: 2, chance: 1 },
  { items: ['gem', 'echoShard'], min: 2, max: 4, chance: 1 },
] as const;

/** How many monsters may be about at a displayed depth (0 above the Hollow). Pure, unit-tested. */
export function monsterBudget(depth: number, start: number = MOBS_RULES.monsterDepth): number {
  if (!(depth >= start)) return 0;
  const k = Math.min(1, (depth - start) / MOBS_RULES.depthRamp);
  return Math.max(1, Math.round(1 + k * (MOBS_RULES.maxMonsters - 1)));
}

/** Crawler pack size at a depth: lone ones at first, packs of 2-4 deeper down. */
export function packSize(depth: number, roll: number, start: number = MOBS_RULES.monsterDepth): number {
  const k = Math.max(0, Math.min(1, (depth - start) / MOBS_RULES.depthRamp));
  if (k < 0.25) return 1;
  return 2 + Math.min(2, Math.floor(roll * (1 + k * 2.2)));
}
