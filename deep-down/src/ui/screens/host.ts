import type { ItemCounts, Settings } from '../../save/types';
import type { ToastTone } from '../notices';
import type { JournalTab, NodeId, Place, ScreenId, UiActions } from '../types';

export interface ConfirmSpec {
  text: string;
  yes: string;
  no: string;
  onYes(): void;
  onNo?(): void;
  /** Style the confirming button as destructive (red). */
  danger?: boolean;
}

export type InventoryTab = 'backpack' | 'storage' | 'equipment' | 'journal';

/** The upgrade tree's tabs: the Workbench, the Forge, and camp plots plus field sites together. */
export type TreeTab = Extract<Place, 'workbench' | 'forge' | 'camp'>;

export type AboutTab = 'about' | 'privacy' | 'licences';

/** UI-side state that survives re-renders of a screen. */
export interface ScreenState {
  invTab: InventoryTab;
  /** Selected backpack slot in the inventory detail view. */
  invSlot: number;
  loadingProgress: number;
  loadingLabel: string;
  deathLost: ItemCounts;
  /** Upgrade tree: the open tab and the selected node (null: pick one when the screen opens). */
  treeTab: TreeTab;
  treeSel: NodeId | null;
  /** The node just made, and when (performance.now()): it lights and sparks run down its groove. */
  treeCrafted: { id: NodeId; at: number } | null;
  journalTab: JournalTab;
  aboutTab: AboutTab;
  /** When the open Expedition Report was opened (its banked counts run up from here). */
  reportAt: number;
}

/** What screen builders may use. Implemented by UI. */
export interface ScreenHost {
  readonly actions: UiActions;
  readonly state: ScreenState;
  /** True while a screen is built because it was just opened (false for a rebuild in place). */
  readonly opening: boolean;
  show(id: ScreenId): void;
  confirm(c: ConfirmSpec): void;
  /** Leave Settings for the screen it was opened from (menu or pause). */
  settingsBack(): void;
  toast(text: string, tone?: ToastTone): void;
  /** Rebuild the open screen, keeping scroll position and focus. */
  rerender(): void;
  /** Apply a settings change; with `coalesce` (slider drags) at most one patch per frame. */
  patchSettings(p: Partial<Settings>, coalesce?: boolean): void;
  /** Close the Expedition Report (dismissing it) and return to play. */
  closeReport(): void;
  /** The report's Open Workbench: dismiss it and open the upgrade tree. */
  openFromReport(): void;
  /** Leave About for Settings (where it was opened from). */
  aboutBack(): void;
}
