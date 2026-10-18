import type { ItemCounts, Settings } from '../../save/types';
import type { ToastTone } from '../notices';
import type { ScreenId, UiActions } from '../types';

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

/** UI-side state that survives re-renders of a screen. */
export interface ScreenState {
  invTab: InventoryTab;
  /** Selected backpack slot in the inventory detail view. */
  invSlot: number;
  loadingProgress: number;
  loadingLabel: string;
  deathLost: ItemCounts;
}

/** What screen builders may use. Implemented by UI. */
export interface ScreenHost {
  readonly actions: UiActions;
  readonly state: ScreenState;
  show(id: ScreenId): void;
  confirm(c: ConfirmSpec): void;
  /** Leave Settings for the screen it was opened from (menu or pause). */
  settingsBack(): void;
  toast(text: string, tone?: ToastTone): void;
  /** Rebuild the open screen, keeping scroll position and focus. */
  rerender(): void;
  /** Apply a settings change; with `coalesce` (slider drags) at most one patch per frame. */
  patchSettings(p: Partial<Settings>, coalesce?: boolean): void;
  /** Register the title canvas so it is redrawn crisply on resize. */
  setTitleCanvas(canvas: HTMLCanvasElement | null, scale: number): void;
}
