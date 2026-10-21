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
  | 'cell' | 'crumble' | 'chest' | 'ember' | 'event' | 'offline' | 'gallery' | 'dynamite'
  | 'contract' | 'feat' | 'rank' | 'mark' | 'record' | 'seal' | 'path' | 'daily' | 'codex' | 'tappable' | 'debug'
  | 'skin' | 'pocket' | 'ride' | 'works' | 'secret' | 'relic';

/** Chest tiers, low to high (SPEC §5.8). */
export type ChestTier = 'wood' | 'copper' | 'crystal' | 'reliquary' | 'lintel';

/** Buy modes (SPEC §5.4–§5.5). */
export type BuyMode = 'x1' | 'x10' | 'star' | 'max';

/** The five mini-game widgets (SPEC §7.3). */
export type WidgetKind = 'catch' | 'mash' | 'strike' | 'sequence' | 'pick';

/** Strike grades (SPEC §7.3): perfect ×5 (×10 for a seal finisher), good ×2, else ×1. */
export type StrikeGrade = 'perfect' | 'good' | 'miss';

/**
 * Where an event target travels, in shaft coordinates relative to the floor at spawn: `x` in columns (0 = the left
 * cell's centre, 6 the right one's; −0.8 and 6.8 are the walls), `y` in rows below the floor's top (negative = above).
 * The point at time t ∈ [t0, t1] is the quadratic Bézier (x0, y0) → (cx, cy) → (x1, y1) at u = (t − t0)/(t1 − t0).
 * Paths stay inside the reach band (CRITIQUE MUST 8: −4 ≤ y ≤ 4) and the lower 65 % of the world region (y ≥ −2.5).
 */
export interface EventPath {
  x0: number; y0: number; cx: number; cy: number; x1: number; y1: number;
}

/** A facet card as offered (SPEC §5.10). */
export interface FacetCardView {
  id: string;
  tag: string;
  rarity: 'common' | 'rare' | 'relic';
  duo: boolean;
  /** The value multiplier of the rarity (×1, ×1.5, ×2.5). */
  value: number;
}

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
  /**
   * A chest opened: the honest roll-up from `floor` to `tier` (`steps` taken; the reveal plays exactly these steps:
   * `path` is every tier it passed, floor first), its contents already credited. `extras` lists the rest of the haul
   * as reward codes: 'levels:<line>:<n>', 'find:<id>', 'findLevel:<id>', 'reroll:<n>', 'cosmetic:<id>', 'crystal:<n>'
   * (Time Crystals), 'storm:<s>' (a Lantern Storm), 'card' (the Lockpick perk's extra card).
   */
  'chest:open': { id: string; floor: ChestTier; tier: ChestTier; steps: number; gold: Big; gems: number; source: string; path?: ChestTier[]; extras?: string[] };
  /** The Chest Rack changed (offline, analytic rows). */
  'chest:rack': { count: number };

  // ----- seals (hybrid SPEC §5.5; the Halden Hatch in W1) -------------------------------------------
  /**
   * The player took a Seal hall's exit: the fight starts (timer `time` s, HP as Big). `mech` is the mechanism's id
   * (i18n `idle.seal.<id>`); `estimate` the seconds an active player needs at the current rates (H5's colour).
   * Emitted again when a held seal is restarted by a tap.
   */
  'seal:start': { biome: number; depth: number; hp: Big; time: number; mech?: string; estimate?: number; retry?: boolean };
  /** A hit on the seal (fraction left). `weak` when it struck the lit weak point (×5); `finisher` for the Strike finisher. */
  'seal:hit': { biome: number; left: number; dmg: Big; weak: boolean; finisher?: boolean };
  /**
   * The seal broke (first time ever for this biome). Its rewards are already credited: `gems`, the seal's relic Find
   * (`relic`, '' when the page already has it: it levels instead), a Crystal-floor chest (opened: see chest:open with
   * source 'seal'), `xp`, and `hand` true when a facet hand was queued (from the second seal of a run).
   */
  'seal:break': { biome: number; depth: number; time: number; gems?: number; relic?: string; xp?: number; hand?: boolean };
  /** The timer ran out: the seal keeps `kept` of the damage (50 %); tapping starts again. `pct` the HP left in %. */
  'seal:fail': { biome: number; left: number; kept: number; pct?: number };
  /**
   * A charted gate (a seal opened in a previous run) broke like a hard row. `split` the run time (s) to it, `best` the
   * best split before (Infinity when none), `par` the ghost's time to it (Infinity before the first Rekindle), `green`
   * when it beat par by ≥ 5 % (CRITIQUE MUST 6: it paid 5 gems).
   */
  'gate:break': { biome: number; depth: number; split: number; best?: number; par?: number; green?: boolean };
  /**
   * The mechanism's weak point lit (`lit` true) or went dark. `id` is the tappable `weak:<sealId>:<i>` (sealId = the biome
   * the seal opens, i = 0..2: which of its three points), `until` the model time it goes dark.
   */
  'seal:weak': { biome: number; lit: boolean; id?: string; point?: number; until?: number };
  /** The Strike finisher appeared at 25 % HP (`widget` the widget id: tap it to stop the needle; perfect = a ×10 hit). */
  'seal:finisher': { biome: number; widget: string };

  // ----- events and widgets (SPEC §5.6; W2) ----------------------------------------------------------
  /** The Drifting Ember appeared (entity id `ember:<n>`; dormant in W1), drifting for `life` s. */
  'ember:spawn': { id: string; life: number };
  'ember:catch': { id: string; outcome: 'gold' | 'frenzy' | 'gems' | 'refresh'; gold: Big; gems: number };
  'ember:gone': { id: string };
  /** The next event shows on the Depth Ruler `inSeconds` ahead (SPEC §7.2 "Announced"). `id` the event to come. */
  'event:announce': { id: string; type: string; inSeconds: number };
  /**
   * An event began (`id` its event id: entity ids are `event:<id>:<n>`; `type` from config/events.ts; `widget` the
   * widget kind or '' for passive ones such as the Golden Vein; `life` its window in s, Infinity for waiting events).
   * `first` when this type was never dealt before (its first-time card follows as 'firsttime').
   */
  'event:start': { id: string; type: string; widget: string; life: number; first?: boolean; depth?: number };
  /** A target of an event entered the world (B spawns it; C may draw its widget chrome). `taps` hits to take it. */
  'event:target': { event: string; id: string; kind: string; t0: number; t1: number; path: EventPath; taps: number };
  /** A target was hit: `left` taps still needed (0: taken), `caught` it counted. */
  'event:hit': { event: string; id: string; left: number; caught: boolean };
  /** A target left the world uncaught (it flew off, shattered on the floor, hid). */
  'event:miss': { event: string; id: string };
  /** An event ended with its result, rewards already credited. `caught`/`of` how many targets were taken. */
  'event:end': { id: string; type: string; result: 'done' | 'partial' | 'missed'; gold: Big; gems: number; caught?: number; of?: number; extras?: string[] };
  /** The find guarantee (SPEC §7.2): a micro-surfacing to tap (`id` an event entity), gone after `life` s. */
  'find:surface': { id: string; kind: 'gem' | 'critter' | 'pebble'; col: number; depth: number; life: number };
  /** A widget opened (SPEC §7.3). `owner`: 'seal', 'geode', 'event:<id>', 'rope', 'facet'. `life` its window (s). */
  'widget:start': { id: string; kind: WidgetKind; owner: string; life: number };
  /** A widget input resolved (a Strike needle stopped, a Sequence mark, a Mash tier, a Pick choice). */
  'widget:input': { id: string; kind: WidgetKind; grade: string; value: number };
  /** A widget closed: `result` 'done' | 'partial' | 'missed' | 'skipped', `score` its graded value. */
  'widget:end': { id: string; kind: WidgetKind; owner: string; result: string; score: number };

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

  // ----- tappables (W2.md §3.5) ---------------------------------------------------------------------
  /** A multi-tap entity took a hit (`hits` of `need`). */
  'entity:hit': { id: string; kind: string; hits: number; need: number };
  /** An entity was used up (caught, opened, read, collected): B removes it. `reward` a reward code ('' none). */
  'entity:done': { id: string; kind: string; reward: string };
  /**
   * The model changed cells that are already generated (Golden Vein, the boredom breaker, Codex pity, Treasure Map,
   * Cave-in boulders): B repaints them. Kinds are CellKind; rowKinds() stays the generator's base.
   */
  'cells:change': { cells: Array<{ depth: number; col: number; kind: CellKind }>; reason: string };

  // ----- progression (SPEC §7.4–§7.7) ----------------------------------------------------------------
  /**
   * A Feat family reached a tier (I–X, then endless). Rewards credited: +1 Mark, `gems`, 30 XP; `cosmetic` at tier V
   * ('' otherwise); `perk` true at tier X (the family's permanent perk is now on).
   */
  'feat:tier': { family: string; tier: number; gems?: number; marks?: number; cosmetic?: string; perk?: boolean };
  /** A secret Feat was found (5 Marks and 25 gems credited). */
  'feat:secret': { id: string };
  /** A rank was reached: rewards credited (`gems`, a Copper chest every 5 ranks, `title` every 25, '' otherwise). */
  'rank:up': { rank: number; gems?: number; chest?: boolean; title?: string; cosmetic?: string };
  /** XP was earned (throttled: at most every 0.25 s, summed). */
  'xp:gain': { amount: number; xp: number; need: number };
  /** A Codex entry was found for the first time (`biome` its page, `level` 1). */
  'codex:new': { id: string; section: 'find' | 'lamp' | 'lore'; biome?: number };
  /** A duplicate Find levelled it up (+1 %). */
  'codex:level': { id: string; level: number };
  /** A biome page is complete: its Biome Seal (+10 % gold and power) is stamped. */
  'codex:page': { biome: number };
  /** Every 10 entries: a Codex chest (Crystal floor; opened as chest:open with source 'codex'). */
  'codex:chest': { entries: number };
  /** A lore entry was read (a Halden note on the back wall, a mural, a seal card). */
  'lore:read': { id: string; biome: number };
  /** A new contract filled `slot` (0..2, or 3 with the Contractor perk). */
  'contract:new': { slot: number; tpl: string; target: number; grand: boolean };
  /** A contract's progress crossed a quarter. */
  'contract:progress': { slot: number; progress: number; target: number };
  /** A contract was completed (rewards credited: `gems`, 2 min of income; a Grand one adds a Crystal chest and a Time Crystal). */
  'contract:done': { id: string; grand: boolean; slot?: number; gems?: number; gold?: Big };
  /** The Daily Lantern Chest is waiting (first launch of a local day). */
  'daily:ready': { day: number };
  /** The daily chest (and the calendar's day) were claimed. `reward` the calendar's reward code. */
  'daily:claim': { day: number; calendarDay: number; reward: string };
  /** A facet hand is queued (`pending` hands waiting, including the one on offer). */
  'facet:hand': { pending: number };
  /** A hand of three is on offer now. */
  'facet:offer': { cards: FacetCardView[]; rerollFree: boolean; rerollGems: number };
  /** A facet was kept. */
  'facet:pick': { id: string; tag?: string; rarity?: string; duo?: boolean };
  /** A set bonus of a tag became active (2, 4 or 6 facets). */
  'facet:set': { tag: string; count: number };
  'facet:reroll': { free: boolean; gems: number };
  /** The Surge meter is full and waits up to 8 s for a tap on the ring (CRITIQUE SHOULD 1). */
  'surge:armed': { until: number };
  'prestige:ready': { layer: 'rekindle' | 'weave' | 'breach'; gain: Big };
  'prestige:done': { layer: 'rekindle' | 'weave' | 'breach'; gain: Big; total?: Big; depth?: number };
  /** Your lantern was planted where this run ended (`n` the Rekindle number). Entity id `lantern:<n>`. */
  'lantern:planted': { depth: number; n: number };
  /** A planted lantern was tapped as you passed it: +2 % damage for the run (`bonus` the run's total). */
  'lantern:tap': { id: string; n: number; bonus: number };
  /** You overtook the ghost lantern (the par run, CRITIQUE MUST 6). `ahead` metres ahead of par. */
  'ghost:pass': { depth: number; ahead: number };
  /** A biome reached in this run: its split against par and the best (`green`: ≥ 5 % under par, 5 gems paid). */
  'split': { biome: number; time: number; par: number; best: number; green: boolean };
  /** A personal record broke (`id`: 'deepest', 'bestHit', 'bestCombo', 'bestTapCells', 'bestChest', 'bestOffline', 'bestEmbers', 'split:<biome>', 'mark500:<m>'). */
  'record:new': { id: string; value?: number; old?: number };
  'milestone:number': { suffix: string };
  /** Gems spent on a sink (SPEC §5.7). */
  'gems:spend': { amount: number; sink: string };
  /** A timed boost began (Lantern Oil, a Lantern Storm, a Supply Rope boost, Cataclysm): `mult` on its stat. */
  'boost:start': { id: string; until: number; mult: number };
  'boost:end': { id: string };
  /** A Time Crystal was spent: an hour of crew output now. */
  'warp': { seconds: number; gold: Big };

  // ----- the node crawl (hybrid SPEC §12.3 item 1; W1-LEAD §3 phases dig, explore, ride, seal, camp) ------------------
  // `node` is the node index (src/idle/model/chart.ts nodeAt). Ids of chamber things are B's socket ids; skin ids are
  // whatever the scene's pick gave (one per wall-skin cell); ride glints are `ride:<node>:<j>`.
  /** The player's phase changed (camp → dig → explore → ride → dig …; explore → seal → explore after the reveal). */
  'phase:change': { from: NodePhaseName; to: NodePhaseName; node: number };
  /**
   * The player arrived at a node: at its drift face (`phase` 'dig'), or at the mouth of its chamber the crew already
   * opened (`phase` 'explore', `dark` true: the next tap glides in and first light is yours). `dug` rows of this drift
   * the crew already cleared (the catch-up track).
   */
  'node:arrive': { node: number; phase: NodePhaseName; biome: number; depth: number; dark: boolean; dug: number };
  /** A breach broke: chamber `node` is open. `by` the player (first light follows at once) or the crew (left dark). */
  'node:breach': { node: number; by: 'player' | 'crew'; promise: string; depth: number };
  /** First light of chamber `node` this run (always the player's, L10). `first`: never seen in any run (lifetime). */
  'node:firstLight': { node: number; first: boolean; biome: number };
  /** The player left chamber `node`: leftovers joined the Works (`works` their gold), `racked` items went to the rack. */
  'node:leave': { node: number; works: Big; racked: number };
  /** A strike-type chamber tappable took a hit and did not break (`left` remaining fraction, `stage` 0–3 the crack). */
  'tappable:hit': { node: number; id: string; kind: string; left: number; stage: number; dmg: Big; crit: boolean };
  /** A strike-type chamber tappable broke and paid (`by` the player, or 'crew' never: crews mine leftovers as Works). */
  'chamber:harvest': { node: number; id: string; kind: string; gold: Big; gems: number; crit: boolean };
  /** A wall-skin cell was struck (`broke` when it broke and paid `gold`). */
  'skin:strike': { node: number; id: string; broke: boolean; left: number; gold: Big };
  /** A broken skin cell hid a pocket (12 %): a nugget (gold), a gem, or a Halden scrap (a Find roll). */
  'skin:pocket': { node: number; id: string; kind: 'nugget' | 'gem' | 'scrap'; gold: Big; gems: number; find: string };
  /** A secret broke open (a cracked wall, a hollow floor, a loose brick): `cache` the focus id of what it revealed. */
  'secret:found': { node: number; id: string; cache: string; reveals: string };
  /** A cold Halden lamp was relit (`lit` of `of` cold lamps now burning in this chamber). */
  'lamp:relight': { node: number; id: string; lit: number; of: number };
  /** Every lamp of chamber `node` is lit: charted (lifetime). `first` the first time ever (+1 gem, +20 XP). */
  'chamber:charted': { node: number; first: boolean; gems: number };
  /** The player reached a stand (an arrival pose or an objective auto-walk target). */
  'stand:move': { node: number; stand: number };
  /** The focus pop opened on a focus-type object (`kind` chest, relic, note, mural, geode, cache…). */
  'focus:open': { node: number; id: string; kind: string };
  /** The focus pop closed (`resolved` when its object was opened, read or graded; else it waits in the chamber). */
  'focus:close': { node: number; id: string; resolved: boolean };
  /** The relic ring (or a geode's ring) graded a release: `grade` worn … perfect, `u` the fraction of the close. */
  'relic:grade': { node: number; id: string; relic: string; grade: string; u: number; gems: number; better: boolean };
  /** A Halden note was read in the focus pop (the lore entry is in the Codex). */
  'note:read': { node: number; id: string; lore: string };
  /** The Way Down began from chamber `node` to `to` (`kind` its shape; `targets` the pass-by glint ids). */
  'ride:start': { node: number; to: number; kind: string; targets: string[]; seconds: number };
  /** A pass-by glint was mined during the ride. */
  'ride:glint': { node: number; id: string; kind: string; gold: Big; gems: number };
  /** The ride ended at node `to` (`skipped` when a tap skipped it). */
  'ride:end': { node: number; to: number; skipped: boolean };
  /** A slice of the player's drift fell (`slice` index of the slice now in front, of `K`). */
  'drift:slice': { node: number; slice: number; K: number; depth: number };
  /** The face moved back by `slices` (the camera creeps forward that far). */
  'drift:creep': { node: number; slices: number };
  /** Lantern Raise toward a far point (x, y, z world metres; the camera does not move). */
  'lantern:raise': { node: number; x: number; y: number; z: number };
  /** A strike on deep rock in reach: the tunk (`hint` the tappable to rim for 0.6 s, '' none). */
  'rock:tunk': { node: number; hint: string };
  /** The crew reached the leash: it digs no further and its strikes become Works haul. */
  'leash:full': { open: number; L: number; depth: number };
  /** A cart delivery of the Works haul (every ≈ 6 s; `cart` false before Mine Carts: it joins the rate silently). */
  'works:haul': { gold: Big; cart: boolean; fromLeftovers: boolean };
  /** The exit of a Seal hall was tapped but this seal is closed in this build (the Root Knot: "Opens in the next build"). */
  'seal:closed': { biome: number; node: number };
  /** The camp phase began (the menu at dusk) or the player went down the adit. */
  'camp:enter': { node: number };
  'camp:descend': { node: number };
  /** An item went to the Chest Rack (a skipped chest or relic): `kind` and the rack's count. */
  'rack:add': { kind: 'chest' | 'relic'; id: string; count: number };
}

/** The player's phases (W1-LEAD §3). Declared here so the bus has no import cycle with model/nodes.ts. */
export type NodePhaseName = 'camp' | 'dig' | 'explore' | 'ride' | 'seal';

export type IdleBus = EventBus<IdleEvents>;

/** A fresh bus for the model (one per game; tests make their own). */
export function createIdleBus(): IdleBus {
  return new EventBus<IdleEvents>();
}
