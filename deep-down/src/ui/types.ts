// The shell's screens and the actions they request (src/ui/UI.ts hosts them over the world).
// The in-play HUD has its own view model (src/ui/idle/hudView.ts).

import type { Settings } from '../save/types';

/** Full screens over the world: the menu at the surface, settings, about; 'none' in play. */
export type ScreenId = 'none' | 'menu' | 'settings' | 'about';

/** What the shell's screens ask the game to do. Implemented by IdleGame. */
export interface UiActions {
  /** Menu → the shaft. */
  play(): void;
  /** The ≡ menu in play: back to the surface menu. */
  toMenu(): void;
  getSettings(): Settings;
  updateSettings(p: Partial<Settings>): void;
  resetSettings(): void;
  /** Erase the descent (asks first in the UI). */
  deleteSave(): void;
  hasSave(): boolean;
  /** When the save was written (epoch ms), or null. */
  saveTimestamp(): number | null;
  /** The Continue card's line ("312 m · Halden Works"), or ''. */
  saveSummary(): string;
}
