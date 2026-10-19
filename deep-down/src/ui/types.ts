import type { ItemId } from '../config/items';
import type { RecipeId } from '../config/recipes';
import type { ExpeditionReport } from '../gameplay/Records';
import type { Settings, SlotData, ItemCounts } from '../save/types';

export type { ExpeditionReport } from '../gameplay/Records';

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

export type ScreenId = 'none' | 'menu' | 'loading' | 'pause' | 'settings' | 'inventory' | 'crafting' | 'death' | 'confirm';

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
  craft(recipe: RecipeId): void;
  openInventory(): void;
  openCrafting(): void;
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
