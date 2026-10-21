// IdleState: the whole pure game (SPEC §12.1). No Three.js, no DOM; one object the step function
// mutates, the save serialises and the UI and world read. Times are model seconds (`state.time`) or
// epoch ms (`now`, `savedAt`). Depth is the floor row index: row d spans world y ∈ [−d − 1, −d) and
// 1 row = 1 m (SPEC §6.2). The shaft is 7 cells wide; each cell stores its remaining HP as a fraction.

import { Big } from '../../core/big';
import type { EventPath, FacetCardView, StrikeGrade, WidgetKind } from '../bus';

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
  /** Model time the skill last became ready (H3), not saved. */
  readyAt?: number;
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
  /** The Ember Frenzy ends (model s; 0 inactive). */
  frenzyEnd: number;
  /** Cataclysm (all four skills within 5 s): everything ×2 until (model s; 0 inactive). */
  cataclysmEnd: number;
  /** Timed run boosts (Supply Rope picks, a Lantern Storm): id → { end (model s), mult }. */
  boosts: Record<string, { end: number; mult: number }>;
  /** Facets kept this run (ids from config/facets.ts), in the order picked. */
  facets: string[];
  /** Facet hands waiting (the one on offer included). */
  hands: number;
  /** The free reroll of this run is unused. */
  freeReroll: boolean;
  /** Entity ids used up this run (the last 96), so a tappable pays once. */
  used: string[];
  /** Planted lanterns tapped this run (their n). */
  lanterns: number[];
  /** Seals and charted gates broken this run (the facet hand comes from the second on). */
  sealsBroken: number;
  /** Run time (s) at which each biome index was first reached in this run. */
  splits: Record<string, number>;
  /** The par run (CRITIQUE MUST 6): projected depth every 30 s of run time at this run's starting power. */
  par: number[];
  /** The ghost has been overtaken at this sample index (−1: not yet). */
  ghostPassed: number;
  /** Counted taps this run (facets: every 10th tap, every 8th…). */
  taps: number;
  /** Cells broken this run (Greed 4: every 50th cell golden). */
  cells: number;
  /** Rows cleared this run (Foreman's Luck: a chest per 40 crew rows). */
  rows: number;
  /** Chests opened this run (Fortune 6: every 10th chest Reliquary+). */
  chests: number;
  /** ★ earned this run (the Starwright perk: +1 % gold each). */
  stars: number;
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
  /** Drumline's auto-taps owed (fractional). */
  drum: number;
  /** The streak's peak combo (H8). */
  peak: number;
  /** The hold stream (the tutorial's "Hold to keep digging"): model time the current hold began (−1 none), its last hit. */
  holdSince: number;
  holdLast: number;
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
  /** The mechanism's id (i18n `idle.seal.<id>`). */
  mech: string;
  warden: string; // = mech, read by the pre-switch shell until the purge switch deletes it
  /** The weak point: the next window starts at `weakNext`, it is lit until `weakUntil` (0 dark), point `weakIndex`. */
  weakNext: number;
  weakUntil: number;
  weakIndex: number;
  /** The Strike finisher's widget id ('' none yet; it appears once per fight at 25 % HP). */
  finisher: string;
  /** Fails so far (H6). */
  fails: number;
}

// ----- widgets and events (SPEC §7.2–§7.3) --------------------------------------------------------------

/** A target of a Catch, a Mash or an event (entity id `event:<eventId>:<n>`). */
export interface EventTarget {
  id: string;
  /** What the scene draws: 'crystal', 'seed', 'boulder', 'brick', 'crate', 'crack', 'rune', 'bubble', 'star', 'root', 'gem', 'pebble', 'meteor'… */
  kind: string;
  /** On screen from t0 to t1 (model s). */
  t0: number;
  t1: number;
  path: EventPath;
  /** Taps it takes, and taken so far. */
  need: number;
  hits: number;
  /** 'live' | 'caught' | 'missed'. */
  state: 'live' | 'caught' | 'missed';
}

interface WidgetBase {
  /** `widget:<n>`. */
  id: string;
  kind: WidgetKind;
  /** 'seal' | 'geode' | 'event:<eventId>' | 'rope' | 'facet'. */
  owner: string;
  born: number;
  /** Seconds it stays open (Infinity: until answered). */
  life: number;
  /** Closed (its result is final). */
  done: boolean;
  result: '' | 'done' | 'partial' | 'missed' | 'skipped';
}

export interface CatchWidget extends WidgetBase { kind: 'catch'; targets: EventTarget[] }
export interface MashWidget extends WidgetBase { kind: 'mash'; target: string; taps: number; tiers: readonly number[] }
export interface StrikeWidget extends WidgetBase {
  kind: 'strike';
  /** Needles to stop (1–3), each sweeps the arc in `period` s (there and back: position = triangle wave). */
  needles: number;
  period: number;
  /** The zones: centre of the perfect zone on the arc (0..1) and the zone widths (fractions of the arc). */
  zone: number;
  perfect: number;
  good: number;
  /** Model time the current needle started sweeping. */
  needleStart: number;
  grades: StrikeGrade[];
}
export interface SequenceWidget extends WidgetBase {
  kind: 'sequence';
  /** How many marks the UI lays out (the board) and the order they light (indices into the board). */
  board: number;
  order: number[];
  /** Each mark is shown for `showEach` s from `showFrom`; input opens after the last. */
  showEach: number;
  showFrom: number;
  /** Marks entered correctly so far. */
  pos: number;
  /** Restarts used (one allowed). */
  restarts: number;
}
export interface PickWidget extends WidgetBase { kind: 'pick'; cards: string[]; picked: number }
export type WidgetState = CatchWidget | MashWidget | StrikeWidget | SequenceWidget | PickWidget;

/** A live event dealt by the Director. */
export interface ActiveEvent {
  /** The event id (entity ids `event:<id>:<n>`). */
  id: string;
  type: string;
  born: number;
  /** The window ends (model s; Infinity: waits). */
  ends: number;
  /** Its widget (null for passive events such as the Golden Vein). */
  widget: WidgetState | null;
  /** Per-type counters (rows left of a Golden Vein, the crate's state, the loose bricks…). */
  n: number;
  /** Targets taken, of all; gold credited (log10) and gems. */
  caught: number;
  of: number;
  goldLog10: number;
  gems: number;
}

/** The Director (SPEC §7.2). */
export interface DirectorState {
  /** Seconds of active play until the next event. */
  wait: number;
  /** The type dealt next (chosen when announced), '' none yet. */
  next: string;
  announced: boolean;
  /** Types dealt, newest last (≤ 12). */
  history: string[];
  /** Events dealt since each type was last dealt. */
  since: Record<string, number>;
  dealt: number;
  /** Model time of the last beat (an event, a chest, a ceremony), of the last special cell broken, and of the last new find in view. */
  lastBeat: number;
  lastSpecial: number;
  lastFind: number;
  /** Active play seconds since the last new find (the find guarantee counts active time only). */
  findQuiet: number;
  specialQuiet: number;
  /** Nothing is dealt before this model time (ceremonies, the first seconds of a Surge). */
  holdUntil: number;
  /** The Codex pity clock: active seconds without a new entry on the current page. */
  codexQuiet: number;
}

/** A cell the model changed after generation (events, pity, the boredom breaker). `floor` for chest cells. */
export interface CellOverride {
  depth: number;
  col: number;
  kind: number;
  floor: number;
}

/** A facet hand on offer. */
export interface FacetHand {
  cards: FacetCardView[];
  /** Model time it was offered (auto-pick after 6 s with the perk). */
  at: number;
  rerolls: number;
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
  /** The Board (SPEC §7.4): `base` the counter's value when the contract was made; progress = counter − base. */
  contracts: Array<{ tpl: string; target: number; progress: number; base: number; arg: string; grand: boolean }>;
  contractCount: number;
  daily: { lastDay: number; calendarDay: number; claimedToday: boolean };
  pity: { crystal: number; reliquary: number; lintel: number };
  tutorial: { step: number; done: boolean; lessons: string[] };
  path: { step: number };
  hints: Record<string, number>;
  /** First-time cards and one-time depth cards already shown. */
  firstTime: string[];
  /** UI elements revealed (progressive reveal, SPEC §8.3). */
  revealed: string[];
  cosmetics: { owned: string[]; equipped: Record<string, string> };
  stats: {
    taps: number; cells: number; cellsNew: number; crits: number; chests: number; events: number;
    purchases: number; stars: number; rekindles: number; weaves: number; offlineHours: number; levels: number;
    /** Ore and rich ore broken (below the record), skills used, seals broken (first time), charted gates, Finds found,
     * perfect Strikes, planted lanterns passed, contracts done, chests by tier (crystal+, reliquary+, lintel). */
    ores: number; skills: number; seals: number; gates: number; finds: number; perfects: number; passed: number;
    contracts: number; crystalPlus: number; reliquaryPlus: number; lintels: number; reveals: number;
  };
  lifetime: { gold: Big; embersEver: Big };
  /** Highest named tool form unlocked (CRITIQUE MUST 10). */
  toolForm: number;
  /** Highest 20 m mark ever reached (for the +1 gem marks). */
  markMax: number;
  /** Crew line blueprints kept (lines unlocked once). */
  blueprints: number;
  /** Lifetime-best pick tier in one run and crew lines hired in one run (Forgemaster, Foreman). */
  bestTier: number;
  bestLines: number;
  /** Fastest run time (s) to 600 m (Swift), Infinity when never. */
  swift600: number;
  /** Lifetime events caught by type (secrets, contracts). */
  caught: Record<string, number>;
  /** Contract slot state: a template's base counter at creation, and a cooldown of guidance (the last-used mechanics). */
  lastUsed: Record<string, number>;
  /** Daily: the local day number of the last chest claimed and the claim waiting. */
  dailyReady: boolean;
  /** Stored free facet rerolls (Crystal chests, the calendar). */
  rerolls: number;
  /** Lifetime node bits (hybrid SPEC §4.6): first light ever done ("seen") and every lamp relit once ("charted"). */
  seen: number[];
  charted: number[];
  /** Best relic grade per Find id (0 worn … 4 perfect; SPEC §5.7). */
  relicGrades: Record<string, number>;
  /**
   * The v3 → v4 migration notice (SPEC §10): 0 none, 1 waiting to show ("Your expedition was re-charted…"), 2 shown.
   */
  rechartNotice: number;
  /** Node counters for the Feats and the Path: lamps relit, secrets found, breaches broken by the player, chambers charted. */
  nodeStats: { lamps: number; secrets: number; breaches: number; charted: number; glints: number; skins: number };
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
  /** The lesson sequencer (hybrid SPEC §6.4, L13): the lesson on screen ('' none) and when it began (model s). */
  lesson: string;
  lessonSince: number;
  /** Play time (s) the last new mechanic was introduced (a step from 3 on, or a lesson): the spacing rule's clock. */
  lastMechanicAt: number;
  /** The face the hold step counts taps on: its node and the run's tap count when the player arrived at it. */
  faceNode: number;
  faceTaps0: number;
  /** Play time the hire step ended (the hold step waits ≥ 40 s after it). */
  hiredAt: number;
  /**
   * A deferrable step passed over while it waited for its moment (the Pick card when the breach comes before 30 gold):
   * its index (−1 none), and the index to resume after it ran (−1 none).
   */
  deferred: number;
  resumeIndex: number;
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
  /** The node crawl: chambers the crew opened while away, up to 3 of them for the return glimpses (oldest first), the
   *  first dark chamber the player arrives at (−1: none, the player resumes where they were), and the leash stop. */
  chambers: number;
  glimpses: number[];
  darkNode: number;
  leashStop: boolean;
}

// ----- the node crawl (hybrid SPEC §4, §5.2–§5.3, §10; W1-LEAD §3) -------------------------------------------

/** The player's phase (W1-LEAD §3): the camp at dusk, a drift face, a chamber to explore, a Way Down, a seal fight. */
export type NodePhase = 'camp' | 'dig' | 'explore' | 'ride' | 'seal';

/** One chamber's state this run (the player's chamber and the ones the crew opened ahead of it). */
export interface ChamberRun {
  node: number;
  /** Who broke its breach ('' while closed). */
  by: '' | 'player' | 'crew';
  /** First light done this run (always by the player, L10). */
  lit: boolean;
  /** Strike-type tappables struck this run: id → remaining HP fraction (absent = untouched = 1). */
  left: Record<string, number>;
  /** Focus-type objects resolved this run (opened, read, graded, racked). */
  resolved: string[];
  /** Cold lamps relit this run. */
  lamps: string[];
  /** Wall-skin cells: id → remaining fraction (0 = broken). */
  skin: Record<string, number>;
  /** Secrets broken open this run (their revealed cache is the focus id `<secretId>:cache`). */
  secrets: string[];
  /** Ride glints mined on the Way Down out of this chamber. */
  glints: string[];
}

/** The Way Down being ridden. */
export interface RideRun {
  from: number;
  to: number;
  kind: string;
  /** Model time the ride began and its nominal length (s); `rideEnd` ends it (a 30 s guard ends a forgotten one). */
  t0: number;
  seconds: number;
}

/** The focus pop. `holdAt` the model time a relic ring's hold began (−1 none). */
export interface FocusRun {
  node: number;
  id: string;
  kind: string;
  holdAt: number;
}

export interface NodeState {
  /**
   * The node layer is on (the hybrid game, the node bot, save v4). Off, the face is the model's base physics with no
   * breach or leash stops: the closed-form sims and the shaft physics tests run it that way.
   */
  on: boolean;
  phase: NodePhase;
  /** The player's node (chart index). */
  node: number;
  /** The arrival stand or the last auto-walk target (0 = the arrival pose). */
  stand: number;
  /** The walking pose in a chamber (W1-LEAD §3 Explore), kept for the save; null = the stand's pose. */
  pose: null | { x: number; y: number; z: number; yaw: number; pitch: number };
  /** Chambers of this run that are open or being explored, by node. */
  chambers: Record<number, ChamberRun>;
  ride: RideRun | null;
  focus: FocusRun | null;
  /** The phase to resume after the camp (dig or explore). */
  resume: NodePhase;
  /** The Works (SPEC §5.3): leftover chamber value the crew mines first, as HP and gold; haul gold not yet delivered. */
  worksHp: Big;
  worksGold: Big;
  haulPending: Big;
  haulFromLeftovers: boolean;
  nextHaul: number;
  /** The leash was full at the last crew strike (for the `leash:full` edge). */
  leashFull: boolean;
  /** Relics skipped to the rack (Find ids). Chests use run.rack. */
  rackRelics: string[];
}

// ----- the whole state ----------------------------------------------------------------------------

export interface IdleState {
  v: 3;
  /** The node crawl: the player's node, phase, chambers, the Works (hybrid). */
  node: NodeState;
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
  /** The Drifting Ember in the air (null when none; dormant in W1) and its clock. */
  ember: { id: string; born: number; life: number } | null;
  nextEmberAt: number;
  /** Counter for entity ids. */
  nextId: number;
  /** Crew strike phase origin per line (model s) so rigs and damage agree. */
  crewT0: number[];
  /** Unspent crew damage that lands on the next impact frame (log-free accumulator per line, as Big). */
  crewPending: Big[];
  /** Last computed rates (cached by step for the UI, goals and BEST). */
  rates: { crewDps: Big; tapDmg: Big; goldPerSec: Big; rowSec: number; tapsPerSec: number };
  /** The Director and its live event (SPEC §7.2). */
  director: DirectorState;
  event: ActiveEvent | null;
  /** Widgets open outside events (the seal finisher, a geode's Strike). */
  widgets: WidgetState[];
  /** The facet hand on offer (null when none). */
  hand: FacetHand | null;
  /** Cells changed after generation (events, pity), applied whenever a row is filled. */
  overrides: CellOverride[];
  /** Hits taken by multi-tap entities (gem clusters, fossils, event targets), by id. */
  hits: Record<string, number>;
  /** XP earned since the last xp:gain event (throttle). */
  xpPending: number;
  /** Model time of the next 0.25 s progression check (Feats, rank, contracts). */
  nextCheck: number;
  /** Rows the crew cleared toward Foreman's Luck's next chest. */
  crewRows: number;
  /** Options the UI sets (Settings → auto-pick facets). */
  opts: { autoFacets: boolean };
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
    tutorial: { step: 0, done: false, lessons: [] },
    path: { step: 1 },
    hints: {},
    firstTime: [],
    revealed: [],
    cosmetics: { owned: [], equipped: {} },
    stats: {
      taps: 0, cells: 0, cellsNew: 0, crits: 0, chests: 0, events: 0, purchases: 0, stars: 0,
      rekindles: 0, weaves: 0, offlineHours: 0, levels: 0, ores: 0, skills: 0, seals: 0, gates: 0, finds: 0, perfects: 0,
      passed: 0, contracts: 0, crystalPlus: 0, reliquaryPlus: 0, lintels: 0, reveals: 0,
    },
    lifetime: { gold: Big.zero(), embersEver: Big.zero() },
    toolForm: 0,
    markMax: 0,
    blueprints: 0,
    bestTier: 0,
    bestLines: 0,
    swift600: Infinity,
    caught: {},
    lastUsed: {},
    dailyReady: false,
    rerolls: 0,
    seen: [],
    charted: [],
    relicGrades: {},
    rechartNotice: 0,
    nodeStats: { lamps: 0, secrets: 0, breaches: 0, charted: 0, glints: 0, skins: 0 },
  };
}

/** A fresh node layer (off until the hybrid game, the node bot or a v4 save turns it on). */
export function newNodeState(on = false): NodeState {
  return {
    on,
    phase: 'dig',
    node: 0,
    stand: 0,
    pose: null,
    chambers: {},
    ride: null,
    focus: null,
    resume: 'dig',
    worksHp: Big.zero(),
    worksGold: Big.zero(),
    haulPending: Big.zero(),
    haulFromLeftovers: false,
    nextHaul: 0,
    leashFull: false,
    rackRelics: [],
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
