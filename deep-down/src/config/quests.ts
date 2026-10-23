import type { TextKey } from '../i18n';
import type { UiTargetId } from '../ui/hud/actions';
import type { BiomeKey, ItemId } from './items';
import type { TutorialStepId } from '../game/quests/types';

/**
 * Quest data (round 3, LOOP; BRIEF §0.3, §0.7): the tutorial's steps, the camp orders' templates and
 * rewards, the biome tasks, the bestiary's milestones, the guardians' loot and the feats.
 * Everything a player reads is a text key (i18n/en/loop3.ts).
 */

/** Six strata, two biomes each (WORLD's STRATA order). */
export const STRATUM_BIOMES: Record<number, readonly [BiomeKey, BiomeKey]> = {
  1: ['amberHollows', 'mushroomForest'],
  2: ['rootGalleries', 'floodedGrottoes'],
  3: ['crystalGeode', 'haldenMines'],
  4: ['frostCaverns', 'glowrootJungle'],
  5: ['sulphurBog', 'sunkenCity'],
  6: ['magmaVeins', 'obsidianAbyss'],
};

export const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI'] as const;

export function stratumOfBiome(b: BiomeKey): number {
  for (let s = 1; s <= 6; s++) if (STRATUM_BIOMES[s].includes(b)) return s;
  return 6;
}

/** The pick each stratum's gate asks you to prepare (the next stratum's tier). */
export const NEXT_PICK: Record<number, ItemId | null> = { 1: 'copperPick', 2: 'ironPick', 3: 'crystalPick', 4: 'coldsteelPick', 5: 'sunmetalPick', 6: null };

// -------------------------------------------------------------------------------------
// The tutorial (taught by doing, the first 5 minutes)

export interface TutorialStepDef {
  id: TutorialStepId;
  line: TextKey;
  highlight: UiTargetId | null;
  /**
   * Seconds of play after which the step moves on by itself: the tutorial never blocks (a step that
   * needs a creature, a vein out of sight, a player who would rather explore). The time counts only
   * while playing, not in the menus.
   */
  timeout?: number;
}

export const TUTORIAL: readonly TutorialStepDef[] = [
  { id: 'look', line: 'tut.look', highlight: 'look', timeout: 60 },
  { id: 'move', line: 'tut.move', highlight: 'joystick', timeout: 60 },
  { id: 'mine', line: 'tut.mine', highlight: 'action', timeout: 150 },
  { id: 'pickup', line: 'tut.pickup', highlight: 'bag', timeout: 20 },
  { id: 'craft', line: 'tut.craft', highlight: 'craft', timeout: 120 },
  { id: 'torch', line: 'tut.torch', highlight: 'place', timeout: 120 },
  { id: 'fight', line: 'tut.fight', highlight: 'action', timeout: 45 },
  { id: 'sonar', line: 'tut.sonar', highlight: 'sonar', timeout: 60 },
  { id: 'bag', line: 'tut.bag', highlight: 'bag', timeout: 60 },
  { id: 'map', line: 'tut.map', highlight: 'map', timeout: 60 },
  { id: 'quest', line: 'tut.quest', highlight: 'quests', timeout: 60 },
];

/** What finishing the tutorial (not skipping it) pays: light and food for the first trip. */
export const TUTORIAL_REWARD: Partial<Record<ItemId, number>> = { torch: 6, bandage: 2, oilFlask: 1 };

/** Starter gift when the tutorial begins (so the first craft is in reach right away). */
export const STARTER_KIT: Partial<Record<ItemId, number>> = { fungalWood: 3, coal: 2, glowcap: 2, bandage: 2 };

// The 1.x explorer's gift with the "deep has changed" card (BRIEF §0.8) is WORLD's CHANGED_GIFT
// (game/StratumFlow.freshFromOld puts it in the new pack); the loop adds only STARTER_KIT then.

// -------------------------------------------------------------------------------------
// Rewards

export type Reward = Partial<Record<ItemId, number>>;

/** A reward bundle for a stratum's level (orders, biome tasks). Index by stratum 1..6. */
export const REWARDS: Record<number, readonly Reward[]> = {
  1: [{ torch: 6, bandage: 2 }, { copperIngot: 3 }, { flashCharge: 2 }, { oilFlask: 2 }, { roastCap: 3, torch: 4 }],
  2: [{ ironIngot: 3 }, { torch: 8, healingDraught: 1 }, { blastBomb: 2 }, { oilFlask: 2, rope: 3 }, { goldIngot: 1, bandage: 3 }],
  3: [{ silverIngot: 3 }, { glimmerShard: 3 }, { healingDraught: 2 }, { blastBomb: 3 }, { warmingTonic: 2, torch: 8 }],
  4: [{ coldsteelIngot: 2 }, { warmingTonic: 3 }, { healingDraught: 2, flare: 3 }, { frostFur: 3 }, { sapAmber: 2 }],
  5: [{ sunmetalIngot: 2 }, { antidote: 3 }, { healingDraught: 3 }, { flare: 4, oilFlask: 2 }, { blastBomb: 4 }],
  6: [{ embersteelIngot: 2 }, { coolingDraught: 3 }, { healingDraught: 3 }, { blastBomb: 4, flare: 4 }, { magmaCore: 1 }],
};

/** The loot a guardian leaves with its Heart Shard (paid into the bag, the bank when full). */
export const GUARDIAN_LOOT: Record<BiomeKey, Reward> = {
  amberHollows: { amber: 4, copperIngot: 4, healingDraught: 1 },
  mushroomForest: { sporeQuartz: 3, glowcap: 6, flashCharge: 2 },
  rootGalleries: { heartwood: 4, goldOre: 4, ironIngot: 2 },
  floodedGrottoes: { pearl: 4, glimmerShard: 2, healingDraught: 1 },
  crystalGeode: { glimmerShard: 5, gem: 2, echoShard: 3 },
  haldenMines: { silverOre: 5, blackOil: 4, haldenScrap: 6 },
  frostCaverns: { frostCrystal: 4, frostFur: 4, rimeIron: 4 },
  glowrootJungle: { sapAmber: 3, verdite: 2, glowvine: 8 },
  sulphurBog: { mireOpal: 2, sulphur: 8, venomSac: 2 },
  sunkenCity: { orichalcum: 2, runegold: 4, healingDraught: 2 },
  magmaVeins: { magmaCore: 2, emberite: 4, emberCore: 2 },
  obsidianAbyss: { voidshard: 4, starsteel: 1, voidEssence: 2 },
  heart: { starsteel: 2, voidshard: 4 },
};

// -------------------------------------------------------------------------------------
// Camp orders

export type OrderKind = 'deliver' | 'craft' | 'hunt' | 'smelt' | 'torches' | 'chests';

export interface OrderTemplate {
  kind: OrderKind;
  /** The item to bank or craft (deliver, craft), by stratum; a hunt/smelt/torches order has none. */
  items?: Record<number, readonly ItemId[]>;
  /** How many, at stratum 1; +50 % per stratum below. */
  need: number;
}

export const ORDER_TEMPLATES: readonly OrderTemplate[] = [
  {
    kind: 'deliver', need: 12,
    items: {
      1: ['copperOre', 'coal', 'glowcap', 'fungalWood'],
      2: ['ironOre', 'rootFibre', 'pearl'],
      3: ['silverOre', 'glimmerShard', 'echoShard'],
      4: ['rimeIron', 'glowvine', 'frostCrystal'],
      5: ['sulphur', 'runegold', 'mireOpal'],
      6: ['emberite', 'voidshard'],
    },
  },
  {
    kind: 'craft', need: 6,
    items: {
      1: ['torch', 'bandage', 'plank'],
      2: ['torch', 'rope', 'ladder'],
      3: ['healingDraught', 'oilFlask', 'flare'],
      4: ['warmingTonic', 'torch', 'flare'],
      5: ['antidote', 'blastBomb', 'oilFlask'],
      6: ['coolingDraught', 'blastBomb', 'healingDraught'],
    },
  },
  { kind: 'hunt', need: 6 },
  { kind: 'smelt', need: 5 },
  { kind: 'torches', need: 8 },
  { kind: 'chests', need: 4 },
];

/** Orders shown at once (plus the daily one). */
export const ORDER_SLOTS = 3;

// -------------------------------------------------------------------------------------
// Biome tasks (per biome: mine its materials, hunt, record its creatures, light it up)

export type BiomeTaskId = 'mine' | 'hunt' | 'scan' | 'torches' | 'places';

export interface BiomeTaskDef {
  id: BiomeTaskId;
  /** How many (0: counted from the world: the roster for 'scan', the named places for 'places'). */
  need: number;
}

export const BIOME_TASKS: readonly BiomeTaskDef[] = [
  { id: 'mine', need: 25 },
  { id: 'hunt', need: 8 },
  { id: 'scan', need: 0 },
  { id: 'torches', need: 6 },
  // WORLD's named places of the biome (its set piece, its secret room, and the vista, the river or
  // the works when they lie in it): counted from the stratum's layout once it is entered.
  { id: 'places', need: 0 },
];

/** The 'places' task's count before its stratum was entered (a set piece and a secret room). */
export const PLACES_DEFAULT = 2;

// -------------------------------------------------------------------------------------
// The bestiary: each new page pays 2 of the creature's first drop (or a bandage); milestones raise max health.

export const BESTIARY_MILESTONES: ReadonlyArray<{ count: number; health: number }> = [
  { count: 5, health: 10 },
  { count: 10, health: 10 },
  { count: 20, health: 10 },
  { count: 30, health: 10 },
  { count: 40, health: 10 },
  { count: 50, health: 10 },
];

// -------------------------------------------------------------------------------------
// Feats (round 3): each is a text pair `feat3.<id>` / `feat3.<id>.text` and a small reward.

export interface FeatSnapshot3 {
  crafted: number;
  smelted: number;
  torches: number;
  outposts: number;
  shards: number;
  deepest: number;
  heart: boolean;
  bestiary: number;
  orders: number;
  fullSet: boolean;
  pages: number;
  pickTier: number;
  /** Named places found (WORLD's 'world:site'), and whether every one of a stratum's was. */
  places?: number;
  placesStratum?: boolean;
  /** Round 3 stretch: the companion's level (0: none), camp levels built, barters, gems set, dailies done. */
  companion?: number;
  elites?: number;
  upgrades?: number;
  trades?: number;
  gems?: number;
  dailies?: number;
}

export interface FeatDef3 {
  id: string;
  check(s: FeatSnapshot3): boolean;
  reward: Reward;
}

export const FEATS3: readonly FeatDef3[] = [
  { id: 'firstCraft', check: (s) => s.crafted >= 1, reward: { torch: 4 } },
  { id: 'firstBar', check: (s) => s.smelted >= 1, reward: { coal: 4 } },
  { id: 'firstTorch', check: (s) => s.torches >= 1, reward: { torch: 4 } },
  { id: 'firstOutpost', check: (s) => s.outposts >= 1, reward: { oilFlask: 2 } },
  { id: 'firstGuardian', check: (s) => s.shards >= 1, reward: { healingDraught: 2 } },
  { id: 'stratum2', check: (s) => s.deepest >= 2, reward: { torch: 6 } },
  { id: 'stratum3', check: (s) => s.deepest >= 3, reward: { healingDraught: 2 } },
  { id: 'stratum4', check: (s) => s.deepest >= 4, reward: { warmingTonic: 2 } },
  { id: 'stratum5', check: (s) => s.deepest >= 5, reward: { antidote: 2 } },
  { id: 'stratum6', check: (s) => s.deepest >= 6, reward: { coolingDraught: 2 } },
  { id: 'sixShards', check: (s) => s.shards >= 6, reward: { blastBomb: 3 } },
  { id: 'allShards', check: (s) => s.shards >= 12, reward: { healingDraught: 3 } },
  { id: 'heart', check: (s) => s.heart, reward: {} },
  { id: 'torches50', check: (s) => s.torches >= 50, reward: { flare: 4 } },
  { id: 'bestiary10', check: (s) => s.bestiary >= 10, reward: { healingDraught: 1 } },
  { id: 'bestiary30', check: (s) => s.bestiary >= 30, reward: { healingDraught: 2 } },
  { id: 'orders5', check: (s) => s.orders >= 5, reward: { oilFlask: 2 } },
  { id: 'orders20', check: (s) => s.orders >= 20, reward: { blastBomb: 3 } },
  { id: 'crafts100', check: (s) => s.crafted >= 100, reward: { torch: 10 } },
  { id: 'fullSet', check: (s) => s.fullSet, reward: { bandage: 4 } },
  { id: 'pages12', check: (s) => s.pages >= 12, reward: { oilFlask: 2 } },
  { id: 'sunPick', check: (s) => s.pickTier >= 6, reward: {} },
  // Round 3 stretch.
  { id: 'tamed', check: (s) => (s.companion ?? 0) >= 1, reward: { glowTreat: 3 } },
  { id: 'companion5', check: (s) => (s.companion ?? 0) >= 5, reward: { glowTreat: 6 } },
  { id: 'campBuilt', check: (s) => (s.upgrades ?? 0) >= 1, reward: { torch: 8 } },
  { id: 'campGrown', check: (s) => (s.upgrades ?? 0) >= 8, reward: { healingDraught: 3 } },
  { id: 'firstTrade', check: (s) => (s.trades ?? 0) >= 1, reward: { oilFlask: 2 } },
  { id: 'firstGem', check: (s) => (s.gems ?? 0) >= 1, reward: { amber: 2 } },
  { id: 'daily', check: (s) => (s.dailies ?? 0) >= 1, reward: { blastBomb: 2 } },
  { id: 'elites10', check: (s) => (s.elites ?? 0) >= 10, reward: { healingDraught: 2 } },
  // The named places of the deep (WORLD's vistas, rivers, works, set pieces and secret rooms).
  { id: 'places10', check: (s) => (s.places ?? 0) >= 10, reward: { oilFlask: 3 } },
  { id: 'placesAll', check: (s) => !!s.placesStratum, reward: { flare: 4, healingDraught: 1 } },
];

// -------------------------------------------------------------------------------------
// Halden's journal: 24 pages (4 per stratum), text keys page.N.title / page.N.body.

export const PAGE_COUNT = 24;

// -------------------------------------------------------------------------------------
// Guidance timings

export const GUIDE = {
  /** No progress on the main step for this long: a hint (BRIEF §0.7: 90 s). */
  stuckSeconds: 90,
  /** Repeat a stuck hint after this much more, at most 3 times per step. */
  stuckRepeat: 120,
  stuckMax: 3,
  /** Low flame / low health hints: thresholds and the minimum gap between two. */
  lowFlame: 0.2,
  lowHealth: 0.3,
  gapSeconds: 60,
} as const;
