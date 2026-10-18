import type { ItemId } from '../config/items';
import type { RecipeId } from '../config/recipes';
import type { Settings, SlotData, ItemCounts } from '../save/types';

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
}

export interface DiscoveryNotice {
  id: string;
  title: string;
  body: string;
}

export interface PickupNotice {
  item: ItemId;
  count: number;
}
