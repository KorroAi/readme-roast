import type { MobFamily, MobKind, MobRarity } from './types';

/**
 * The creatures' numbers (round 2, MOBS). Damage to the explorer is in health points (100, 140 with
 * the Miner's Coat: five or seven hearts of 20). Mob hit points are on the scale of WORLD's
 * `config/weapons.ts`: pickaxe 1, Iron Machete 2, Glimmer Spear 4.5, Flare Sling 1.5 a shard
 * (light shards hurt crawlers and wisps 1.5x), Flash Charge 6 to each monster in the burst.
 */
export type Locomotion = 'crawl' | 'walk' | 'fly' | 'still' | 'path';

export interface MobDef {
  kind: MobKind;
  family: MobFamily;
  /** Capsule round the body centre. */
  radius: number;
  halfHeight: number;
  /** Body centre above the feet (walkers) or off the surface (crawlers). */
  lift: number;
  hp: number;
  speed: number;
  locomotion: Locomotion;
  /** Damage of one attack (monsters). */
  damage: number;
  /** Telegraph (wind-up) seconds before an attack lands. */
  windup: number;
  /** Seconds between two attacks of the same mob. */
  cooldown: number;
  /** Reach of its attack (m, from its body centre to the explorer's). */
  reach: number;
  rarity?: MobRarity;
}

export const MOB_DEFS: Record<MobKind, MobDef> = {
  // Monsters.
  crawler: { kind: 'crawler', family: 'monster', radius: 0.42, halfHeight: 0, lift: 0.2, hp: 4, speed: 3.1, locomotion: 'crawl', damage: 9, windup: 0.6, cooldown: 3.2, reach: 1.25 },
  gnasher: { kind: 'gnasher', family: 'monster', radius: 0.62, halfHeight: 0.05, lift: 0.58, hp: 8, speed: 1.4, locomotion: 'still', damage: 18, windup: 0.75, cooldown: 2.6, reach: 2.1 },
  wisp: { kind: 'wisp', family: 'monster', radius: 0.55, halfHeight: 0.35, lift: 1.5, hp: 4, speed: 1.5, locomotion: 'fly', damage: 0, windup: 0.8, cooldown: 1, reach: 3.2 },
  stalker: { kind: 'stalker', family: 'monster', radius: 0.42, halfHeight: 1.05, lift: 1.5, hp: 14, speed: 1.25, locomotion: 'walk', damage: 28, windup: 1.1, cooldown: 4, reach: 2.2 },
  sentinel: { kind: 'sentinel', family: 'monster', radius: 0.95, halfHeight: 0.75, lift: 1.75, hp: 24, speed: 0.85, locomotion: 'walk', damage: 24, windup: 1.4, cooldown: 2.4, reach: 3.1 },
  worm: { kind: 'worm', family: 'monster', radius: 2.2, halfHeight: 0, lift: 0, hp: 1, speed: 6.5, locomotion: 'path', damage: 0, windup: 0, cooldown: 1, reach: 0 },
  // Beings.
  moth: { kind: 'moth', family: 'being', radius: 0.08, halfHeight: 0, lift: 1.4, hp: 1, speed: 2.4, locomotion: 'fly', damage: 0, windup: 0, cooldown: 1, reach: 0 },
  lampling: { kind: 'lampling', family: 'being', radius: 0.22, halfHeight: 0.04, lift: 1.5, hp: 1, speed: 3.6, locomotion: 'fly', damage: 0, windup: 0, cooldown: 1, reach: 0, rarity: 'rare' },
  glimmerkin: { kind: 'glimmerkin', family: 'being', radius: 0.3, halfHeight: 0, lift: 0.26, hp: 1, speed: 2.7, locomotion: 'walk', damage: 0, windup: 0, cooldown: 1, reach: 0, rarity: 'epic' },
  shellback: { kind: 'shellback', family: 'being', radius: 0.85, halfHeight: 0.1, lift: 0.62, hp: 1, speed: 0.35, locomotion: 'walk', damage: 0, windup: 0, cooldown: 1, reach: 0, rarity: 'rare' },
  jelly: { kind: 'jelly', family: 'being', radius: 0.6, halfHeight: 0.35, lift: 2.6, hp: 1, speed: 0.6, locomotion: 'fly', damage: 0, windup: 0, cooldown: 1, reach: 0, rarity: 'uncommon' },
  burrower: { kind: 'burrower', family: 'being', radius: 0.3, halfHeight: 0, lift: 0.27, hp: 1, speed: 3.2, locomotion: 'walk', damage: 0, windup: 0, cooldown: 1, reach: 0, rarity: 'uncommon' },
};

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
} as const;

/** Drops: each entry lists item ids in preference order (the first one the game knows is used). */
export const MOB_DROPS: Partial<Record<MobKind, Array<{ items: readonly string[]; min: number; max: number; chance: number }>>> = {
  crawler: [{ items: ['chitin', 'stone'], min: 1, max: 1, chance: 0.35 }],
  gnasher: [
    { items: ['gem', 'glimmerShard'], min: 1, max: 2, chance: 1 },
    { items: ['crystalShard', 'echoShard'], min: 1, max: 2, chance: 0.6 },
  ],
  wisp: [{ items: ['echoShard'], min: 1, max: 1, chance: 0.5 }],
  stalker: [{ items: ['lanternstone', 'glimmerShard'], min: 1, max: 1, chance: 1 }],
  sentinel: [
    { items: ['lanternstone', 'glimmerShard'], min: 2, max: 3, chance: 1 },
    { items: ['gem', 'echoShard'], min: 2, max: 3, chance: 1 },
  ],
  glimmerkin: [{ items: ['gem', 'glimmerShard'], min: 1, max: 2, chance: 1 }],
  shellback: [{ items: ['crystalShard', 'glimmerShard'], min: 2, max: 3, chance: 1 }],
  burrower: [
    { items: ['ironOre', 'copperOre'], min: 2, max: 3, chance: 1 },
    { items: ['gem', 'glimmerShard'], min: 1, max: 1, chance: 0.3 },
  ],
};

/** The treasure burrower (an event): a golden thief whose pouch is full. */
export const TREASURE_DROPS = [
  { items: ['lanternstone', 'glimmerShard'], min: 1, max: 2, chance: 1 },
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
