// IdleState: the whole pure game (SPEC §12.1). No Three.js, no DOM; one object the step function
// mutates, the save serialises and the UI and world read. Times are model seconds (`state.time`) or
// epoch ms (`now`, `savedAt`). Depth is the floor row index: row d spans world y ∈ [−d − 1, −d) and
// 1 row = 1 m (SPEC §6.2). The shaft is 7 cells wide; each cell stores its remaining HP as a fraction.

import { Big } from '../../core/big';

// ----- cells ------------------------------------------------------------------------------------------

/** Cell kinds in the shaft (SPEC §5.3). Stored as u8 in rows and in the save. */
export const CELL = {
  /** Open: dug, or a cavern crossing the shaft. */
  AIR: 0,
  /** The biome's host rock (soft and hard lenses and the rock families are look only). */
  ROCK: 1,
  /** Common ore (×2.5 gold). */
  ORE: 2,
  /** Rich ore (×4 gold, ×1.5 HP). */
  RICH: 3,
  /** Rare: gem (×8 gold, ×2 HP, +1 gem). */
  GEM: 4,
  /** Rare: fossil (a Find roll in W2). */
  FOSSIL: 5,
  /** Rare: geode (a Strike widget in W2). */
  GEODE: 6,
  /** A chest cell (×3 HP; pops a chest). */
  CHEST: 7,
  /** Golden Vein cell (×20 gold; events). */
  GOLDEN: 8,
  /** Gate row of a charted gate (×3 HP, ×1 gold). */
  GATE: 9,
  /** A boulder left by a Cave-in (×3 HP, ×3 gold). */
  BOULDER: 10,
  /** A never-opened seal's slab (the fight; not broken cell by cell). */
  SEAL: 11,
  /** The surface row (row 0): pays exactly 1 gold a cell (CRITIQUE SHOULD 19). */
  TOPSOIL: 12,
  /** Packed earth and roots of the first 20 m (×2 HP: the crack stages show while the pick is small). */
  SOIL: 13,
} as const;

export type CellKind = (typeof CELL)[keyof typeof CELL];

export const CELL_KIND_COUNT = 14;

/** Width of the shaft in cells. */
export const COLS = 7;
/** The centre column (chest cells sit here). */
export const CENTRE_COL = 3;

/** One row of the shaft. `left[c]` is the remaining HP fraction (1 intact, 0 broken). */
export interface RowState {
  depth: number;
  kinds: Uint8Array;
  left: Float64Array;
  /** Cells of this row breaking in the leftover crumble (bit c set), and when it ends (model s). */
  crumbleMask: number;
  crumbleAt: number;
}

/** How many rows the model keeps live: the floor row and the rows below it (pierce reaches 8 below). */
export const SHAFT_WINDOW = 12;

export interface ShaftState {
  /** The floor row's depth (= run.depth). rows[i] is depth floor + i. */
  rows: RowState[];
}

// ----- the run (reset by Rekindle) --------------------------------------------------------------------

export interface SkillState {
  lvl: number;
  /** Model time (s) the cooldown ends (0: ready). */
  cdEnd: number;
  /** Model time (s) the active effect ends (0: inactive). */
  activeEnd: number;
  /** Free charges (the tutorial's first Dynamite). */
  charges: number;
}

export interface RunState {
  /** The floor row's depth. */
  depth: number;
  /** The deepest floor this run. */
  dmax: number;
  gold: Big;
  /** Gold earned this run (for Feats and the stats). */
  goldEarned: Big;
  /** Pick level (≥ 1). */
  pick: number;
  /** Upgrade levels of the Dig sheet (id → level): lucky, shock, steady, bellows. */
  ups: Record<string, number>;
  /** Crew line levels (index = line). */
  lines: number[];
  /** Bought gear card ids. */
  gear: string[];
  skills: Record<string, SkillState>;
  /** Run time (model seconds since the run began). */
  runTime: number;
  /** Chests waiting on the Chest Rack (tiers as floors: 0 wood … 4 lintel). */
  rack: number[];
  /** The ghost of the previous run: depth every 30 s (W2 race). */
  ghost: number[];
  /** Run-scoped damage bonus from planted lanterns tapped (+2 % each, W2). */
  plantedBonus: number;
  /** Lucky Moth frenzy ends (model s; 0 inactive). */
  frenzyEnd: number;
}

// ----- the tap layer (combo, crit rng, the Surge) -----------------------------------------------------

export interface TapState {
  /** Current combo (holds add half, so it can be fractional). */
  combo: number;
  /** Model time of the last counted hit. */
  lastHit: number;
  /** Model time of the next combo decay step (after 1.2 s without a hit, −5 every 0.5 s). */
  decayAt: number;
  /** The best combo tier announced this streak. */
  tierShown: number;
  /** Surge meter 0..SURGE.meterMax. */
  surge: number;
  /** Surge ends at (model s; 0 inactive). */
  surgeEnd: number;
  /** The meter has filled and waits (CRITIQUE SHOULD 1 hook; W1 fires at once). */
  surgeArmedAt: number;
  /** Seeded RNG state (xorshift32) for crits and rolls. */
  rng: number;
  /** Counted hits this second (a model-side guard; the input layer caps at 8/s). */
  hitsThisSecond: number;
  secondStart: number;
}

// ----- seals (SPEC §7.1; W1: the Halden Hatch and first-time seals, minimal) --------------------------

export interface SealState {
  biome: number;
  depth: number;
  /** HP as a Big and the remaining fraction. */
  hp: Big;
  left: number;
  /** Model time the timer ends, and its length. */
  endsAt: number;
  time: number;
  /** 'fight' while the timer runs; 'held' after a fail (tap to start again). */
  phase: 'fight' | 'held';
  started: number;
}

// ----- meta (kept across runs) ------------------------------------------------------------------------

export interface MetaState {
  embers: Big;
  embersMax: Big;
  threads: Big;
  loom: Record<string, number>;
  sigils: Record<string, number>;
  /** Lifetime deepest floor. */
  record: number;
  cycleRecord: number;
  /** Biome indices whose seal was ever opened. */
  sealsOpened: number[];
  /** Biomes ever entered (revealed). */
  biomesSeen: number[];
  gems: number;
  timeCrystals: number;
  boostEnd: number;
  finds: Record<string, number>;
  bestiary: Record<string, number>;
  lore: string[];
  biomeSeals: number[];
  feats: Record<string, number>;
  secrets: string[];
  marks: number;
  rank: { r: number; xp: number };
  records: {
    deepest: number;
    splits: Record<string, number>;
    marks500: Record<string, number>;
    bestHit: Big;
    bestCombo: number;
    bestTapCells: number;
    bestChest: number;
    bestOffline: Big;
    bestEmbers: Big;
  };
  planted: Array<{ depth: number; n: number }>;
  contracts: Array<{ tpl: string; target: number; progress: number }>;
  contractCount: number;
  daily: { lastDay: number; calendarDay: number; claimedToday: boolean };
  pity: { crystal: number; reliquary: number; lintel: number };
  tutorial: { step: number; done: boolean };
  path: { step: number };
  hints: Record<string, number>;
  /** First-time cards and one-time depth cards already shown. */
  firstTime: string[];
  /** UI elements revealed (progressive reveal, SPEC §8.3). */
  revealed: string[];
  cosmetics: { owned: string[]; equipped: Record<string, string> };
  stats: {
    taps: number; cells: number; cellsNew: number; crits: number; chests: number; events: number; creatures: number;
    purchases: number; stars: number; rekindles: number; weaves: number; offlineHours: number; levels: number;
  };
  lifetime: { gold: Big; embersEver: Big };
  /** Highest named tool form unlocked (CRITIQUE MUST 10). */
  toolForm: number;
  /** Highest 20 m mark ever reached (for the +1 gem marks). */
  markMax: number;
  /** Crew line blueprints kept (lines unlocked once). */
  blueprints: number;
}

// ----- guidance ---------------------------------------------------------------------------------------

export interface GoalView {
  /** Goal id: 'tut:<step>', 'path:<n>', 'seal', 'near:<what>', 'mark', 'fallback', 'claim:offline'. */
  id: string;
  /** i18n key and params for the line. */
  key: string;
  params: Record<string, string | number>;
  /** 0..1. */
  fill: number;
  /** Seconds to completion at the current rates (Infinity when unknown). */
  eta: number;
  /** Reward chip text key ('' none) and params. */
  reward: string;
  rewardParams: Record<string, string | number>;
  /** Where tapping the goal goes ('' nothing): 'card:<id>', 'sheet:<id>', 'seal', 'codex'. */
  go: string;
  /** Icon id. */
  icon: string;
}

export interface GoalState {
  current: GoalView;
  /** Model time the current goal was chosen (hysteresis 4 s). */
  since: number;
  /** Model time of the next re-evaluation (every 0.5 s). */
  nextEval: number;
}

export interface TutorialState {
  /** Index into TUTORIAL_STEPS (−1 before the first, length when done). */
  index: number;
  /** Model time the current step began. */
  since: number;
  /** Fallback fires (count) for the current step. */
  fallbacks: number;
  /** Model time of the next fallback. */
  nextFallback: number;
  /** Counters the steps watch. */
  breaks: number;
  done: boolean;
}

export interface HintState {
  /** Model time the last hint showed (at most one per 20 s). */
  lastShown: number;
  /** Model time of the last counted hit (H1) and when BEST became affordable (H2). */
  lastHitAt: number;
  bestReadySince: number;
  bestReadyId: string;
}

// ----- offline ------------------------------------------------------------------------------------

export interface OfflineResult {
  /** Seconds away (as counted, after the clock guard and the cap). */
  seconds: number;
  /** Seconds away before the cap. */
  away: number;
  capped: boolean;
  fromDepth: number;
  toDepth: number;
  /** Gold dug (rows) and gallery gold (time left at a seal), as Big; `gold` is their sum. */
  goldRows: Big;
  goldGallery: Big;
  gold: Big;
  /** Chests added to the rack (and those turned to gold because the rack was full). */
  chests: number;
  chestsGold: number;
  /** The crew waits at this unopened seal (biome index, −1 none). */
  sealBiome: number;
  /** Deepest biome crossed (for the gate flash; −1 none). */
  biomeCrossed: number;
  /** Credited yet (the feast's Collect). */
  collected: boolean;
}

// ----- the whole state ----------------------------------------------------------------------------

export interface IdleState {
  v: 3;
  /** The save seed and the run index: runSeed = hash(seed, runIndex). */
  seed: number;
  runIndex: number;
  runSeed: number;
  /** Model clock (s): advances by every step; never saved as absolute time. */
  time: number;
  /** Total played seconds (saved). */
  playTime: number;
  /** Epoch ms of the last step (the save's savedAt). */
  now: number;
  /** The monotonic guard: the largest epoch ms ever seen (SPEC §4.2 clock guard). */
  monotonicMs: number;
  run: RunState;
  meta: MetaState;
  shaft: ShaftState;
  tap: TapState;
  seal: SealState | null;
  goals: GoalState;
  tutorial: TutorialState;
  hints: HintState;
  /** The pending return feast (null when none). */
  offline: OfflineResult | null;
  /** Chests popped out and waiting for a tap (entity ids). */
  chests: Array<{ id: string; col: number; depth: number; floor: number; at: number }>;
  /** The Lucky Moth in flight (null when none) and its clock. */
  moth: { id: string; born: number; life: number; scripted: boolean } | null;
  nextMothAt: number;
  /** Counter for entity ids. */
  nextId: number;
  /** Crew strike phase origin per line (model s) so rigs and damage agree. */
  crewT0: number[];
  /** Unspent crew damage that lands on the next impact frame (log-free accumulator per line, as Big). */
  crewPending: Big[];
  /** Last computed rates (cached by step for the UI, goals and BEST). */
  rates: { crewDps: Big; tapDmg: Big; goldPerSec: Big; rowSec: number; tapsPerSec: number };
}

// ----- constructors ---------------------------------------------------------------------------------

export function newRow(depth: number): RowState {
  return { depth, kinds: new Uint8Array(COLS), left: new Float64Array(COLS), crumbleMask: 0, crumbleAt: 0 };
}

export function newMeta(): MetaState {
  return {
    embers: Big.zero(),
    embersMax: Big.zero(),
    threads: Big.zero(),
    loom: {},
    sigils: {},
    record: 0,
    cycleRecord: 0,
    sealsOpened: [],
    biomesSeen: [0],
    gems: 0,
    timeCrystals: 0,
    boostEnd: 0,
    finds: {},
    bestiary: {},
    lore: [],
    biomeSeals: [],
    feats: {},
    secrets: [],
    marks: 0,
    rank: { r: 1, xp: 0 },
    records: {
      deepest: 0,
      splits: {},
      marks500: {},
      bestHit: Big.zero(),
      bestCombo: 0,
      bestTapCells: 0,
      bestChest: 0,
      bestOffline: Big.zero(),
      bestEmbers: Big.zero(),
    },
    planted: [],
    contracts: [],
    contractCount: 0,
    daily: { lastDay: 0, calendarDay: 0, claimedToday: false },
    pity: { crystal: 0, reliquary: 0, lintel: 0 },
    tutorial: { step: 0, done: false },
    path: { step: 1 },
    hints: {},
    firstTime: [],
    revealed: [],
    cosmetics: { owned: [], equipped: {} },
    stats: {
      taps: 0, cells: 0, cellsNew: 0, crits: 0, chests: 0, events: 0, creatures: 0, purchases: 0, stars: 0,
      rekindles: 0, weaves: 0, offlineHours: 0, levels: 0,
    },
    lifetime: { gold: Big.zero(), embersEver: Big.zero() },
    toolForm: 0,
    markMax: 0,
    blueprints: 0,
  };
}

/** A run's seed from the save seed and the run index (SPEC §6.2: every run has new veins and caverns). */
export function runSeedOf(seed: number, runIndex: number): number {
  let h = (seed ^ 0x9e3779b9) >>> 0;
  h = Math.imul(h ^ (runIndex + 0x85ebca6b), 0xc2b2ae35) >>> 0;
  h ^= h >>> 16;
  h = Math.imul(h, 0x27d4eb2f) >>> 0;
  h ^= h >>> 15;
  return h >>> 0 || 1;
}
