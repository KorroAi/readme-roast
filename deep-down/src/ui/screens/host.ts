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
  /** Round 3: the stratum whose own load the loading screen shows (its card), null: the boot's logo. */
  loadingStratum: number | null;
  deathLost: ItemCounts;
  /** Round 3: the black-out's story (null: the first version's card). */
  deathInfo: import('../types').BlackoutInfo | null;
  /** Upgrade tree: the open tab and the selected node (null: pick one when the screen opens). */
  treeTab: TreeTab;
  treeSel: NodeId | null;
  /** The node just made, and when (performance.now()): it lights and sparks run down its groove. */
  treeCrafted: { id: NodeId; at: number } | null;
  journalTab: JournalTab;
  aboutTab: AboutTab;
  /** When the open Expedition Report was opened (its banked counts run up from here). */
  reportAt: number;
  // Round 3 (UI): the menus' remembered tabs and selections.
  bagTab: import('./r3/bag').BagTab;
  bagSel: string | null;
  /** The piece whose gem picker is open in the Bag (null: none). */
  bagSocket: string | null;
  /** A long-press on a hotbar slot opened the Bag to fill this slot (-1: none). */
  assignSlot: number;
  craftTab: string | null;
  /** The Craft menu shows only this station's recipes (a placed station's Interact), null: all. */
  craftStation: string | null;
  /** The recipe just made (its card flashes once). */
  craftFlash: string | null;
  questsTab: import('./r3/quests').QuestsTab;
  bestiaryBiome: string | null;
  /** The menu whose "?" help card is open (null: none). */
  help: string | null;
  /** The Map's pan and zoom while it stays open (reset when it opens). */
  mapCamera: import('./r3/map').MapCamera | null;
  /** The trip card to show (LOOP's 'trip:summary' in the strata), null: the first version's report. */
  trip: import('../../game/quests/Trip').TripSummary | null;
  /** The strata's end card (LOOP's endingView after 'quest:ending'), null: the first version's. */
  ending: { title: string; body: string; free: string; lines: Array<{ label: string; value: string }> } | null;
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
