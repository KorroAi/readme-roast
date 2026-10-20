// IdleEvents: every event the pure model emits (SPEC §3–§10, BUILD §0.10). This is the contract between
// the model (src/idle), the world (DescentScene, DigController), the juice (JuiceDirector, audio,
// haptics) and the UI. B and C request additions through the lead; A adds them.
//
// Conventions: `col` 0..6 (left to right), `depth` the row index (row d spans world y ∈ [−d − 1, −d)),
// gold and damage as Big (cloned: listeners may keep them), `by` who caused it. Events of systems that
// arrive in later waves are declared now so listeners can be written against them.

import { EventBus } from '../core/events';
import type { Big } from '../core/big';
import type { CellKind } from './model/state';

/** What dealt a hit. */
export type HitSource = 'tap' | 'hold' | 'swipe' | 'key' | 'crew' | 'splash' | 'skill' | 'crumble' | 'analytic';

/** Where gold or gems came from (the ledger's token origin and the stats). */
export type GainSource =
  | 'cell' | 'crumble' | 'chest' | 'moth' | 'event' | 'offline' | 'gallery' | 'dynamite' | 'creature'
  | 'contract' | 'feat' | 'rank' | 'mark' | 'record' | 'seal' | 'path' | 'daily' | 'codex' | 'tappable' | 'debug';

/** Chest tiers, low to high (SPEC §5.8). */
export type ChestTier = 'wood' | 'copper' | 'crystal' | 'reliquary' | 'lintel';

/** Buy modes (SPEC §5.4–§5.5). */
export type BuyMode = 'x1' | 'x10' | 'star' | 'max';

export interface IdleEvents {
  // ----- the tap (SPEC §3) ---------------------------------------------------------------------------
  /**
   * A counted hit resolved (taps, holds, swipes, keys). Emitted once per hit, after its damage applied.
   * `dmg` is the final damage (combo, crit, Surge and skills applied); `cells` how many cells it broke;
   * `chain` how many cells the pierce reached down the column (1 = only the target).
   */
  'tap:hit': {
    col: number; depth: number; kind: CellKind; source: HitSource; dmg: Big; crit: boolean; combo: number;
    comboMult: number; cells: number; chain: number; surge: boolean;
  };
  /** A hit landed on a cell without breaking it (every source). `left` is the remaining fraction; `stage` 0–3 the crack stage. */
  'cell:hit': { col: number; depth: number; kind: CellKind; left: number; stage: number; source: HitSource; dmg: Big; crit: boolean };
  /**
   * A cell broke. `gold` is its pay (already added to the run's gold), `gems` any gem it gave, `chainIndex`
   * its place in a pierce chain (0 = the hit cell), `belowRecord` true when this depth is past the lifetime
   * record (XP, Finds and Feat counters count only these; CRITIQUE MUST 5).
   */
  'cell:break': {
    col: number; depth: number; kind: CellKind; source: HitSource; gold: Big; gems: number; chainIndex: number;
    belowRecord: boolean; crit: boolean;
  };
  /** The leftover crumble started on a row (≥ 5 of 7 broken): the rest shake for 0.3 s, then break (cell:break with source 'crumble'). */
  'row:crumble': { depth: number; cols: number[] };
  /** The floor row cleared: the floor drops to `depth` (the new floor). `rows` > 1 for multi-row clears. */
  'row:clear': { depth: number; rows: number; source: HitSource };
  /**
   * Rows cleared analytically (crew far above 6 rows/s, Dynamite, a re-climb, `advance`): no per-cell events.
   * Chest cells passed went to the rack (CRITIQUE MUST 5).
   */
  'rows:analytic': { from: number; to: number; gold: Big; chestsRacked: number };
  /** The shaft below the floor opened into a cavern (a breakthrough): the floor falls `fall` rows at once. */
  'cavern:breakthrough': { from: number; to: number; fall: number };
  /** The combo reached a tier (10, 25, 50, then 100, 250 … for Feats). */
  'combo:tier': { tier: number; combo: number };
  /** A combo of ≥ 10 decayed away (a soft fizz; nothing lost). */
  'combo:lost': { combo: number };

  // ----- depth and biomes (SPEC §5.4 milestones, §6.5) -----------------------------------------------
  /** A new 20 m mark (`first`: lifetime first: +1 gem). */
  'depth:mark': { depth: number; first: boolean };
  /** A new lifetime depth record every 200 m (+10 gems; a split). */
  'depth:record': { depth: number };
  /** A one-time depth card (Burj Khalifa, Mponeng, Everest, Kola, Moho…; CRITIQUE MUST 11). */
  'depth:card': { id: string; metres: number };
  /** The floor entered a new biome (or Echo stratum). `first`: never seen before (the T5 reveal follows its seal). */
  'biome:enter': { biome: number; first: boolean; depth: number };
  /** The biome reveal should play now (after a first-time seal breaks, with the player watching). */
  'biome:reveal': { biome: number };
  /** The next biome's glow starts leaking up (40 m above a seal). */
  'biome:glow': { biome: number; depth: number };

  // ----- gains (the ledger, SPEC §10.6) --------------------------------------------------------------
  /** Gold credited to the run (already in state). `col`/`depth` locate the source on screen when it has one (−1 otherwise). */
  'gold:gain': { amount: Big; source: GainSource; col: number; depth: number };
  /** Gems credited (already in state). */
  'gems:gain': { amount: number; source: GainSource; col: number; depth: number };

  // ----- buying (SPEC §5.4–§5.5) ---------------------------------------------------------------------
  /** A purchase went through. `from`→`to` levels (gear and one-shots: 0 → 1). */
  'buy:done': { id: string; mode: BuyMode; levels: number; from: number; to: number; cost: Big };
  /** A purchase was refused (not enough gold, locked, maxed). */
  'buy:fail': { id: string; reason: 'gold' | 'locked' | 'max' };
  /** A crew line reached a ★ (every 10 levels: ×2). `stars` is how many ★ the line has now. */
  'crew:star': { line: number; level: number; stars: number };
  /** A crew line was crowned (every 50 levels). */
  'crew:crown': { line: number; level: number; crowns: number };
  /** The pick crossed damage tiers (every 25 levels: ×2.5). `tiers` crossed by this purchase (one ceremony for all). */
  'pick:tier': { tier: number; from: number; tiers: number; level: number };
  /** A new named tool form unlocked (lifetime milestone; CRITIQUE MUST 10). */
  'tool:form': { form: number; first: boolean };
  /** A crew line unlocked (its depth reached, or its blueprint kept). */
  'crew:unlock': { line: number; blueprint: boolean };
  /** A crew line's rig struck (on its impact frame). `cells` broken by this strike. */
  'crew:strike': { line: number; col: number; depth: number; dmg: Big; cells: number };
  /** New gear cards arrived (a biome start). */
  'gear:new': { biome: number; ids: string[] };
  /** A card became affordable for the first time since it last was not (the ready ping; UI may refine with the ledger). */
  'card:ready': { id: string };

  // ----- skills and the Surge (SPEC §3.4, §5.4) ------------------------------------------------------
  'skill:unlock': { id: string };
  'skill:use': { id: string; level: number };
  'skill:ready': { id: string };
  /** Dynamite went off: `rows` rows destroyed at once, paying `gold`. */
  'skill:dynamite': { from: number; rows: number; gold: Big };
  /** Earthquake: `dmg` applied at once. */
  'skill:earthquake': { dmg: Big; rows: number };
  'skill:cataclysm': { duration: number };
  'skill:end': { id: string };
  /** The Surge meter changed tier (for the ring's glow); emitted at most at 25 % steps. */
  'surge:meter': { fill: number };
  'surge:start': { duration: number; scripted: boolean };
  'surge:end': Record<string, never>;

  // ----- chests (SPEC §5.8) --------------------------------------------------------------------------
  /** A chest cell came into view below (its lid shows 6 rows ahead). */
  'chest:seen': { col: number; depth: number };
  /** A chest cell broke: the chest pops out and waits for a tap (entity id `chest:<n>`). */
  'chest:exposed': { id: string; col: number; depth: number; floor: ChestTier };
  /** A chest opened: the honest roll-up from `floor` to `tier` (`steps` taken), its contents already credited. */
  'chest:open': { id: string; floor: ChestTier; tier: ChestTier; steps: number; gold: Big; gems: number; source: string };
  /** The Chest Rack changed (offline, analytic rows). */
  'chest:rack': { count: number };

  // ----- seals and Wardens (SPEC §7.1; the Halden Hatch in W1) ---------------------------------------
  /** A never-opened seal is the floor now: the fight starts (timer `time` s, HP as Big). */
  'seal:start': { biome: number; depth: number; hp: Big; time: number };
  /** A hit on the seal (fraction left). */
  'seal:hit': { biome: number; left: number; dmg: Big; weak: boolean };
  /** The seal broke (first time ever for this biome). */
  'seal:break': { biome: number; depth: number; time: number };
  /** The timer ran out: the seal keeps `kept` of the damage (50 %); tapping starts again. */
  'seal:fail': { biome: number; left: number; kept: number };
  /** A charted gate (a seal opened in a previous run) broke like a hard row. */
  'gate:break': { biome: number; depth: number; split: number };
  /** The weak point lit (W2). */
  'seal:weak': { biome: number; lit: boolean };

  // ----- events and widgets (SPEC §7.2–§7.3; W2 except the Lucky Moth) -------------------------------
  /** The Lucky Moth appeared (entity id `moth:<n>`), crossing for `life` s. */
  'moth:spawn': { id: string; life: number; scripted: boolean };
  'moth:catch': { id: string; outcome: 'gold' | 'frenzy' | 'gems' | 'refresh'; gold: Big; gems: number };
  'moth:gone': { id: string };
  'event:announce': { id: string; type: string; inSeconds: number };
  'event:start': { id: string; type: string; widget: string; life: number };
  'event:end': { id: string; type: string; result: 'done' | 'partial' | 'missed'; gold: Big; gems: number };

  // ----- guidance (SPEC §8) --------------------------------------------------------------------------
  /** The goal on the bar changed (`id` the goal id). */
  'goal:change': { id: string };
  /** A goal completed (its reward already credited when it had one). */
  'goal:done': { id: string; reward: string };
  /** The tutorial moved to a step (`id` from TUTORIAL_STEPS). */
  'tutorial:step': { id: string; index: number };
  /** A non-blocking tutorial beat ("Copper! Worth 2.5×", "Every 10 levels: ×2", the combo): show `text` for `hold` s. */
  'tutorial:beat': { id: string; text: string; hold: number };
  /** A tutorial step's fallback fired (the ghost hand acts). */
  'tutorial:fallback': { id: string };
  'tutorial:done': Record<string, never>;
  /** A contextual hint should show (`target` the UI element or entity to point at). */
  'hint:show': { id: string; target: string };
  /** A first-time card (SPEC §8.8): `id` names the system, event, tab or widget. */
  'firsttime': { id: string };
  /** A UI element is revealed for the first time (progressive reveal, SPEC §8.3). */
  'ui:reveal': { id: string };
  /** A Path step completed (`index` 1-based). */
  'path:done': { index: number; reward: string };

  // ----- offline and the session (SPEC §4) -----------------------------------------------------------
  /** An offline result is ready for the return feast (state.offline holds it). */
  'offline:ready': { seconds: number; rows: number; gold: Big };
  /** The return feast's Collect: the haul was credited. */
  'offline:collect': { gold: Big; chests: number };

  // ----- progression (W2–W3, declared now) -----------------------------------------------------------
  'feat:tier': { family: string; tier: number };
  'feat:secret': { id: string };
  'rank:up': { rank: number };
  'codex:new': { id: string; section: 'find' | 'bestiary' | 'lore' };
  'contract:done': { id: string; grand: boolean };
  'facet:hand': { pending: number };
  'facet:pick': { id: string };
  'prestige:ready': { layer: 'rekindle' | 'weave' | 'breach'; gain: Big };
  'prestige:done': { layer: 'rekindle' | 'weave' | 'breach'; gain: Big };
  'record:new': { id: string };
  'milestone:number': { suffix: string };
}

export type IdleBus = EventBus<IdleEvents>;

/** A fresh bus for the model (one per game; tests make their own). */
export function createIdleBus(): IdleBus {
  return new EventBus<IdleEvents>();
}
