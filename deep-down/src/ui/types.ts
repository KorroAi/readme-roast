import type { ItemId } from '../config/items';
import type { NodeId, NodeResult, Place, Prereq, TreeLine } from '../config/recipes';
import type { CraftReason } from '../gameplay/Crafting';
import type { FeatsView } from '../gameplay/Feats';
import type { ExpeditionReport, RecordsState } from '../gameplay/Records';
import type { Settings, SlotData, ItemCounts } from '../save/types';
import type { UiTargetId } from './hud/actions';
// Round 3: the menus read LOOP's views (game/craft, game/quests) as they are.
export type { BagView, BagItemView, CraftMenuView, RecipeCardView, GearView, HotbarView } from '../game/craft/types';
export type { QuestsScreenView, ArrivalCard, TutorialStepView } from '../game/quests/types';

export type { ExpeditionReport, ReportNext, ReportOvernight } from '../gameplay/Records';
export type { NodeId, Place, TreeLine, NodeResult } from '../config/recipes';
export type { CraftReason } from '../gameplay/Crafting';

/** Lantern state for the gauge: ok, past the turn-back mark (tight), at walk-home time (critical), out (empty). */
export type FuelState = 'ok' | 'tight' | 'critical' | 'empty';

/** What the compass needle points at. */
export type CompassKind = 'camp' | 'cache' | 'seam' | 'site';

/** A compass target: bearing relative to the camera (radians, + = right) and walking metres. */
export interface CompassTarget {
  kind: CompassKind;
  bearing: number;
  distance: number;
}

/** Read-only snapshot of what the HUD shows, refreshed by the game every frame. */
export interface HudState {
  health: number;
  maxHealth: number;
  /** Lantern fuel in [0, 1]. */
  lantern: number;
  lanternLow: boolean;
  backpackUsed: number;
  backpackMax: number;
  /** Displayed depth in meters (positive number, shown as "-N m"). */
  depth: number;
  atCamp: boolean;
  /** Camp direction relative to the camera, radians (0 = straight ahead, + = to the right). */
  campBearing: number;
  campDistance: number;
  objectiveText: string;
  /** Contextual interaction prompt (e.g. "Workbench"), or null. */
  interactLabel: string | null;
  /** Mining feedback for the current target, or null. */
  target: { name: string; progress: number; blocked: boolean } | null;
  /** True while a reticle should be drawn (desktop pointer lock). */
  showCrosshair: boolean;
  fps: number;
  frameMs: number;
  drawCalls: number;
  triangles: number;

  /** Lantern burn time left and the equipped lantern's capacity, seconds. */
  fuelSeconds: number;
  fuelCapacity: number;
  /** Seconds of walking back to camp from here (null at camp, or where no walk home exists). */
  homeSeconds: number | null;
  /** Where the turn-back mark sits on the gauge, as a fraction of capacity (null at camp). */
  turnBackFraction: number | null;
  fuelState: FuelState;
  /** The cold's bite in [0, 1] (frost edge): 0 while the lantern burns. */
  cold: number;
  /** The primary compass target. campBearing/campDistance mirror it for compatibility. */
  compass: CompassTarget;
  /** The pack left behind, when there is one (the second compass chip). */
  cache: { bearing: number; distance: number; count: number } | null;
  /** Deepest depth ever reached (metres), and whether this trip is beyond the old record. */
  bestDepth: number;
  newBest: boolean;
  /** No slot can take anything more. */
  packFull: boolean;
  /** Sealed Pouch slots at the end of the pack (0 without one). */
  pouchSlots: number;

  // Round 3 (UI): the action layout's HUD. Filled by game/Game from the WORLD, LOOP and MOBS seams.
  /** Where the explorer is: the biome's display name, the stratum (1..6) and its roman numeral. */
  biomeName: string;
  stratum: number;
  /** The reticle: what the Action button would do on what is under it, and the mining progress on its ring. */
  reticle: ReticleKind;
  reticleProgress: number;
  /** The find under the reticle ("Copper Vein"), shown small under it while it is a find; null: none. */
  reticleName: string | null;
  /** The quest tracker: the main step and one optional side task. */
  tracker: TrackerView;
  /** The compass arrow to the current objective, once it is known (null hides it). */
  objectiveArrow: ObjectiveArrowView | null;
  /** The guardian fight's health bar (null hides it). */
  guardian: GuardianBarView | null;
  /** The 6 hotbar slots and the selected one. */
  hotbar: HudSlot[];
  hotbarSelected: number;
  /** The selected slot holds something placeable: the Place button shows. */
  canPlace: boolean;
  /** Cooldowns in [0, 1] (0 = ready). */
  dashCooldown: number;
  sonarCooldown: number;
  /** The Interact button's icon kind and verb (null: nothing to use near). */
  interact: InteractView | null;
  /** Sprinting now (the stick at its edge or Shift). */
  sprinting: boolean;
  /** The tutorial step on screen (null: none). */
  tutorial: TutorialView | null;
  /** The hazard building up here (cold, gas, heat, dark) with its meter 0..1 and a ward's seconds left; null: none. */
  hazard: { kind: 'cold' | 'gas' | 'heat' | 'dark'; level: number; warded: number } | null;
  /** The tamed companion (a Lampling): its name, level, progress to the next (0..1), what it does, its glow. */
  companion: CompanionChipView | null;
}

/** The companion's HUD chip (MOBS's `mobs.companion()`). */
export interface CompanionChipView {
  name: string;
  level: number;
  /** 0..1 toward the next level (1 at the top level). */
  progress: number;
  state: 'follow' | 'scout' | 'fight';
  glow: number;
}

// ---------------------------------------------------------------------------------------
// Round 3 (UI) view types: what the HUD and the menus read. game/Game builds them from the
// other owners' seams (LOOP's items, craft, hotbar and quests, WORLD's strata and explored map,
// MOBS's guardians and bestiary); the UI never reads game state directly.

export type ReticleKind = 'none' | 'mine' | 'attack' | 'use' | 'place' | 'blocked';

export interface TrackerLine {
  id: string;
  text: string;
  /** Counted progress (2 of 5), when the step has one. */
  have?: number;
  need?: number;
}

export interface TrackerView {
  main: TrackerLine | null;
  side: TrackerLine | null;
}

export interface ObjectiveArrowView {
  /** Bearing relative to the view (radians, + = right) and straight-line metres. */
  bearing: number;
  distance: number;
  /** Up or down by more than a few metres: the arrow says which way (−1 down, 0 level, 1 up). */
  vertical: -1 | 0 | 1;
}

export interface GuardianBarView {
  name: string;
  hp: number;
  max: number;
  /** 1-based phase and how many (the Heart has 3). */
  phase: number;
  phases: number;
  /** Its guard is open: the window's share left (1 as it opens, 0 as it shuts); null while closed. */
  open?: number | null;
  /** The attack it winds up now, said plainly ("Charge: step off the lane"), or null. */
  telegraph?: string | null;
}

export interface HudSlot {
  /** The item id in the slot (null: empty). */
  item: string | null;
  name: string;
  count: number;
  /** The selected item can be placed on a face (block, torch, ladder, rope). */
  placeable: boolean;
}

/** The Interact button's look: the target's icon and its verb ("Open", "Craft", "Talk"...). */
export interface InteractView {
  icon: 'chest' | 'station' | 'being' | 'door' | 'rope' | 'page' | 'gate' | 'outpost' | 'bed' | 'other';
  verb: string;
  label: string;
}

/** One tutorial step on screen: the ring on a control and the short line by it (LOOP's steps). */
export interface TutorialView {
  target: UiTargetId | null;
  line: string;
  step: number;
  total: number;
}

/**
 * A map marker (minimap and Map screen), world coordinates. Round 3 places (WORLD's §6 stretch):
 * 'vista' (the landmark hall's balcony), 'river' (the underground river's spring), 'works' (the
 * Halden works' entry), 'secret' (a secret room found), 'place' (a named set piece found), 'ravine'
 * (a ravine's rope down, once seen); 'cache' is the pack a black-out left.
 */
export interface MapMarker {
  kind: 'camp' | 'outpost' | 'lair' | 'gate' | 'page' | 'chest' | 'objective' | 'cache' | 'shrine' | 'nest' | 'vista' | 'river' | 'works' | 'secret' | 'place' | 'ravine';
  x: number;
  z: number;
  /** Text for the Map screen's legend and the tapped marker. */
  label?: string;
  id?: string;
  /** Done (a beaten lair, an opened chest, a read page): drawn dim. */
  done?: boolean;
}

/** A line on the map (the underground river): only its explored stretches, as x, z pairs. */
export interface MapLine {
  kind: 'water' | 'lava';
  /** One polyline per explored stretch: [x0, z0, x1, z1, ...] in world metres. */
  runs: ReadonlyArray<readonly number[]>;
}

/**
 * The explored stratum, read by the minimap and the Map screen. `cell(x, z)` is the drawn state of a
 * column (0 unexplored, 1 explored rock, 2 explored floor, 3 water, 4 hazard) and `biome(x, z)` its
 * biome index (for the tint); `revision` bumps when anything changed, so the canvas redraws only then.
 */
export interface MapSource {
  width: number;
  depth: number;
  /** World x/z of the map's (0, 0) column. */
  originX: number;
  originZ: number;
  revision: number;
  cell(x: number, z: number): number;
  biome(x: number, z: number): number;
  /** The height a column was seen at (feet y), for the Map's hill-shade; absent: flat. */
  height?(x: number, z: number): number;
  /** The tint of each biome index (sRGB hex). */
  biomeColors: readonly number[];
  markers: readonly MapMarker[];
  /** Lines drawn over the caves (the river's explored stretches); absent: none. */
  lines?: readonly MapLine[];
  /** The stratum's floor heights span (feet y, low to high), for the Map's elevation tint and contours. */
  heightRange?: readonly [number, number];
  /** The explorer (world x, z) and the view's yaw (radians, the camera's). */
  playerX: number;
  playerZ: number;
  yaw: number;
}

export interface MapView {
  source: MapSource;
  stratum: number;
  stratumName: string;
  biomes: Array<{ name: string; color: number; explored: number }>;
  /** Outposts and the camp, for fast travel (`here`: the explorer stands at it; `stratum`: where it is). */
  travel: Array<{ id: string; name: string; x: number; z: number; here: boolean; can: boolean; reason: string | null; stratum: number }>;
  /** The seed of this expedition (shown on the map and in Settings). */
  seed: string;
  /** Named places of this stratum reached / in all (vistas, the river, the works, set pieces, secrets). */
  places?: { found: number; total: number };
}

export interface BestiaryEntryView {
  kind: string;
  name: string;
  biome: string;
  role: 'monster' | 'being' | 'guardian' | 'boss';
  desc: string;
  /** Met (seen), scanned, defeated counts. */
  seen: boolean;
  scanned: boolean;
  defeated: number;
  bonus: string | null;
}

export interface BestiaryView {
  entries: BestiaryEntryView[];
  found: number;
  total: number;
}


/** The Continue card: a short summary of the saved game (null when there is none). */
export interface SaveSummary {
  savedAt: number;
  /** Seconds played. */
  playTime: number;
  expeditions: number;
  /** Deepest depth ever reached, metres. */
  bestDepth: number;
  discoveries: number;
  discoveriesTotal: number;
  runes: number;
  runesTotal: number;
  equipment: { pickaxe: number; lantern: number; pack: number };
  /** A pack is waiting somewhere in the Hollow. */
  cacheWaiting: boolean;
  /** The black stone has answered (the finale was reached). */
  finale?: boolean;
  /** Round 3: the expedition the save holds (the title's Continue card), absent for a 1.x save. */
  expedition?: {
    stratum: number;
    /** The stratum's display name and its two biomes' names. */
    stratumName: string;
    biomes: string[];
    deepest: number;
    shards: number;
    seed: number;
  };
}

/** Round 3: the black-out card's story (where, what did it, where the explorer wakes). */
export interface BlackoutInfo {
  /** What blacked the explorer out: a creature's name, or the fall, the cold, the gas, the heat, the dark. */
  cause: string;
  depth: number;
  biome: string;
  stratum: number;
  /** Where the explorer wakes: the camp, or an outpost's bed (its biome). */
  wake: string;
}

/** What the inventory and crafting screens need. */
export interface InventoryView {
  backpack: Array<SlotData | null>;
  storage: ItemCounts;
  equipment: { pickaxe: number; lantern: number; pack: number };
  journal: string[];
  /** Total of each item available for crafting (backpack + storage). */
  available: ItemCounts;
  atCamp: boolean;
  /** The last `pouchSlots` backpack slots are the Sealed Pouch (kept through a black-out). */
  pouchSlots: number;
}

export type ScreenId =
  | 'none'
  | 'menu'
  | 'loading'
  | 'pause'
  | 'settings'
  | 'inventory'
  | 'crafting'
  | 'death'
  | 'confirm'
  // Final pass W3: the Expedition Report, the Survey Table board, the Journal, the end card, About.
  | 'summary'
  | 'board'
  | 'journal'
  | 'ending'
  | 'about'
  // Round 3 (UI): the action layout's menus (crafting and inventory keep their ids).
  | 'map'
  | 'quests'
  | 'bestiary';

// ---------------------------------------------------------------------------------------
// The upgrade tree (final pass W3; filled by game/Progression)

/** One cost chip: `have` counts what this node can be paid from (storage + pack at camp; the pack for a field site). */
export interface CostChip {
  item: ItemId;
  have: number;
  need: number;
}

/** A before -> after stat for the detail pane's bars (`max` is the bar's full scale). */
export interface NodeStat {
  label: string;
  before: number;
  after: number;
  max: number;
  /** Formatted values, e.g. "10 min", "8", "Tier 3". */
  beforeText: string;
  afterText: string;
}

export interface CraftTreeNode {
  id: NodeId;
  name: string;
  /** The behaviour sentence: what the node changes. */
  does: string;
  place: Place;
  line: TreeLine;
  /** Row from the top, unique within the line (tiers descend). */
  row: number;
  result: NodeResult;
  prio: 'must' | 'should';
  /** owned | ok (craftable now) | locked (a prerequisite) | notHere | missing | carryToSite. */
  state: CraftReason;
  /** Some but not all materials are on hand (the partial ring). */
  partial: boolean;
  /** Player-facing reason it cannot be made now ("Build the Forge first", "Only at camp"), null when ok or owned. */
  reason: string | null;
  prereqs: Array<{ id: Prereq; name: string; met: boolean }>;
  cost: CostChip[];
  stats: NodeStat[];
  /** Built for free once its prerequisites are met (the Relic Shelf): no Craft button. */
  auto: boolean;
}

export interface CraftPlace {
  id: Place;
  name: string;
  /** The place can be used now (at camp; the Forge once built). */
  open: boolean;
  /** Why not, when closed ("Build the Forge first", "Only at camp"). */
  reason: string | null;
}

export interface CraftTreeView {
  /** Every node in tree order. */
  nodes: CraftTreeNode[];
  places: CraftPlace[];
  /** The tab the screen should open on (openCrafting(place)); 'workbench' by default. */
  focus: Place;
  /** A node to select on open (a stake sign opens its station), or null. */
  select: NodeId | null;
  /** The node the Next line points at, or null. */
  next: NodeId | null;
  atCamp: boolean;
  /** Materials on hand (pack + storage). */
  available: ItemCounts;
}

// ---------------------------------------------------------------------------------------
// The Survey Table board

/** A rumour: where the deep has stirred (the living rock, the glimmer bloom), and how far a walk it is. */
export interface Rumour {
  /** Site id (a living-rock site, or the bloom's prop id): the compass target id. */
  id: string;
  kind: 'living' | 'bloom';
  /** Area id and its name ("the Halden Face"). */
  area: string;
  areaName: string;
  /** One line, e.g. "Fresh copper and iron at the Halden Face — 61 m". */
  text: string;
  /** What grew there tonight. */
  ore: Array<{ item: ItemId; count: number }>;
  /** Walking metres from camp (null when no walk reaches it). */
  distance: number | null;
  /** False once the bloom has been mined. */
  present: boolean;
  /** This is the compass target now. */
  target: boolean;
}

export interface SurveyView {
  records: Readonly<RecordsState>;
  /** Expeditions into the Hollow so far (the deep's night count). */
  day: number;
  rumours: Rumour[];
  /** The compass target's id, or null (the compass points home). */
  target: string | null;
  /** The Survey Table is built (the board can be opened from it). */
  built: boolean;
}

// ---------------------------------------------------------------------------------------
// The Journal

export type JournalTab = 'discoveries' | 'runes' | 'relics' | 'feats';

export interface JournalEntry {
  id: string;
  title: string;
  body: string;
  found: boolean;
  /** A light hint where to look, shown on the '?' card while unfound. */
  hint: string;
  major: boolean;
  /** A Halden log (a found text). */
  log: boolean;
  /** Zone id and name, for the zone headers. */
  zone: string;
  zoneName: string;
  /** When it was found: the expedition number and the displayed depth (null when unknown or unfound). */
  expedition: number | null;
  depth: number | null;
}

export interface RunePage {
  /** The key item (the Ancient Tablet is the Lantern rune). */
  item: ItemId;
  /** Glyph index into config/runes RUNES (0..7), also its Relic Shelf socket. */
  glyph: number;
  name: string;
  /** The page's one line (shown once found). */
  line: string;
  found: boolean;
  /** A light hint where it waits, shown while unfound. */
  hint: string;
  expedition: number | null;
  depth: number | null;
}

export interface RelicText {
  id: string;
  title: string;
  body: string;
  found: boolean;
}

export interface JournalZone {
  id: string;
  name: string;
  found: number;
  total: number;
}

/** The end card: the numbers of the whole descent. */
export interface EndingView {
  /** The finale has been reached (the end card has something to show). */
  reached: boolean;
  expeditions: number;
  /** Deepest depth ever reached, metres. */
  deepest: number;
  /** Seconds played. */
  playTime: number;
  /** The black stone's one line. */
  answer: string;
}

export interface JournalView {
  /** Every discovery in the table, in table order (found or not). */
  discoveries: JournalEntry[];
  zones: JournalZone[];
  found: number;
  total: number;
  /** The eight runes in glyph order. */
  runes: RunePage[];
  runesFound: number;
  runesTotal: number;
  relics: RelicText[];
  /** The Feats page (journal feats and lifetime numbers), when the game keeps them. */
  feats?: FeatsView;
  ending: EndingView;
  /** The tab to open on (openJournal(tab)); 'discoveries' by default. */
  focus: JournalTab;
}

/** Actions the UI can request. Implemented by the game; the UI never touches game state directly. */
export interface UiActions {
  continueGame(): void;
  /** Start a new expedition; `seed` (the optional New Game field) picks the world, else one is rolled. */
  newGame(seed?: string): void;
  openVisualLab(): void;
  pause(): void;
  resume(): void;
  returnToCamp(): void;
  quitToMenu(): void;
  respawn(): void;
  /** Make a node of the upgrade tree (data-key craft:{id}). */
  craft(id: NodeId): void;
  openInventory(): void;
  /** Open the upgrade tree, on the tab of `place` (default: the Workbench). */
  openCrafting(place?: Place): void;
  closeScreen(): void;
  updateSettings(patch: Partial<Settings>): void;
  resetSettings(): void;
  deleteSave(): void;
  getInventory(): InventoryView;
  getSettings(): Settings;
  hasSave(): boolean;
  saveTimestamp(): number | null;
  /** The saved game for the Continue card, or null. */
  getSaveSummary(): SaveSummary | null;
  /** The last expedition's report (until dismissed), or null. */
  getReport(): ExpeditionReport | null;
  dismissReport(): void;

  // Final pass W3 (implemented by game/Game through game/Progression).
  /** The upgrade tree as it stands now. */
  getCraftTree(): CraftTreeView;
  /** Open the Survey Table board (records and rumours). */
  openBoard(): void;
  getSurvey(): SurveyView;
  /** Point the compass at a rumour (its id), or back home (null). */
  setCompassTarget(id: string | null): void;
  /** Open the Journal (default tab: discoveries; the Relic Shelf opens the runes). */
  openJournal(tab?: JournalTab): void;
  getJournal(): JournalView;
  /** Open About / Licences. */
  openAbout(): void;
  /** Close the end card and play on (the Hollow keeps growing). */
  continueAfterEnding(): void;
  /** Drop a backpack stack on the ground in front of the explorer (it can be picked up again). */
  dropStack(slot: number): void;

  // Round 3 (UI): the action layout's menus.
  /** LOOP's menu actions (craft, use, equip, assign, bank), null before a game is loaded. */
  loop(): import('../game/craft/types').LoopActions | null;
  /** Open one of the menus (Bag, Craft, Map, Quests, Bestiary, Settings, pause). */
  openMenu(screen: import('./hud/actions').MenuScreen): void;
  /** The explored stratum for the Map screen (null before WORLD's strata are in). */
  getMap(): MapView | null;
  /** Fast travel to an outpost (or the camp) of this stratum. */
  fastTravel(id: string): void;
  getQuests(): import('../game/quests/types').QuestsScreenView | null;
  /** Track a side task on the HUD (null: the automatic choice). */
  trackQuest(id: string | null): void;
  getBestiary(): BestiaryView | null;
  skipTutorial(): void;
  /** The expedition's seed (Settings, the Map), '' before one is rolled. */
  getSeed(): string;
  /** Button size and opacity (the control layout's own preferences). */
  getControlPrefs(): import('./controlPrefs').ControlPrefs;
  setControlPrefs(p: Partial<import('./controlPrefs').ControlPrefs>): void;
  /** Forget which first-time tips were shown (Settings), so they show again. */
  replayTips?(): void;
  /** The strata world is loaded (else the first version's hand-made world: its report and end card). */
  strata?(): boolean;
  /** Today's Daily Descent for the title (LOOP's), null when there is none. */
  daily?(): DailyCard | null;
  /** Start today's Daily Descent (a new expedition on its seed, its goal and modifiers on). */
  newDaily?(): void;
  /** The strata's end card (LOOP's endingView), null outside the strata. */
  endingView?(): { title: string; body: string; free: string; lines: Array<{ label: string; value: string }> } | null;
}

/** The title's Daily Descent button: today's goal and modifiers, the best time today. */
export interface DailyCard {
  title: string;
  goalText: string;
  modTexts: string[];
  /** "12 min 5 s", or null before a run is done today. */
  best: string | null;
}

export interface DiscoveryNotice {
  id: string;
  title: string;
  body: string;
  /** How many discoveries the player has made, this one included, out of `total` in the game. */
  index: number;
  total: number;
  /** A major discovery (the hollow, shrine, gate, rift, answer) gets the big banner. */
  major: boolean;
  /** Round 2: the first-time card of the rarity colours (the banner shows the legend under the body). */
  legend?: boolean;
  /** The text keys of its title and body: the banner writes them again on a language switch. */
  titleKey?: string;
  bodyKey?: string;
}

export interface PickupNotice {
  item: ItemId;
  count: number;
  /** Where the drop was on screen when it was picked up, 0..1 from the top left (when known). */
  sx?: number;
  sy?: number;
}
