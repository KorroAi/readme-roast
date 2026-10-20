import type { Settings } from '../../save/types';
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

export type AboutTab = 'about' | 'privacy' | 'licences';

/** UI-side state that survives re-renders of a screen. */
export interface ScreenState {
  aboutTab: AboutTab;
}

/** What screen builders may use. Implemented by UI. */
export interface ScreenHost {
  readonly actions: UiActions;
  readonly state: ScreenState;
  /** True while a screen is built because it was just opened (false for a rebuild in place). */
  readonly opening: boolean;
  show(id: ScreenId): void;
  confirm(c: ConfirmSpec): void;
  /** Leave Settings for the screen it was opened from (the menu, or play). */
  settingsBack(): void;
  toast(text: string, tone?: ToastTone): void;
  /** Rebuild the open screen, keeping scroll position and focus. */
  rerender(): void;
  /** Apply a settings change; with `coalesce` (slider drags) at most one patch per frame. */
  patchSettings(p: Partial<Settings>, coalesce?: boolean): void;
  /** Leave About for Settings (where it was opened from). */
  aboutBack(): void;
}
