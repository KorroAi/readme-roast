import type { ItemId } from '../config/items';
import type { NodeId, NodeResult, Place, Prereq, TreeLine } from '../config/recipes';
import type { CraftReason } from '../gameplay/Crafting';
import type { ExpeditionReport, RecordsState } from '../gameplay/Records';
import type { Settings, SlotData, ItemCounts } from '../save/types';

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
  | 'about';

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

export type JournalTab = 'discoveries' | 'runes' | 'relics';

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
  ending: EndingView;
  /** The tab to open on (openJournal(tab)); 'discoveries' by default. */
  focus: JournalTab;
}

/** Actions the UI can request. Implemented by the game; the UI never touches game state directly. */
export interface UiActions {
  continueGame(): void;
  newGame(): void;
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
}

export interface PickupNotice {
  item: ItemId;
  count: number;
  /** Where the drop was on screen when it was picked up, 0..1 from the top left (when known). */
  sx?: number;
  sy?: number;
}
