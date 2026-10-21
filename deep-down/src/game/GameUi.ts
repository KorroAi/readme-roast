import type { EventBus, GameEvents } from '../core/events';
import type { InputState } from '../input/types';
import type { ItemCounts, Settings } from '../save/types';
import type { DiscoveryNotice, HudState, ScreenId, UiActions } from '../ui/types';

/** The slice of the UI the game drives. Implemented by ui/UI (and a dev stub for tests). */
export interface GameUi {
  readonly screen: ScreenId;
  showScreen(id: ScreenId, opts?: { confirm?: { text: string; yes: string; no: string; onYes(): void; onNo?(): void } }): void;
  isBlockingInput(): boolean;
  setGameplayActive(active: boolean): void;
  setHud(state: HudState): void;
  setLoading(progress01: number, label: string): void;
  showDiscovery(n: DiscoveryNotice): void;
  toast(text: string, tone?: 'info' | 'warn' | 'good'): void;
  hint(text: string, ms?: number): void;
  showDeath(lost: ItemCounts): void;
  applySettings(s: Settings): void;
  refresh(): void;
  readonly touch: { setInteractVisible(label: string | null): void };
  dispose(): void;
}

export type UiFactory = (root: HTMLElement, actions: UiActions, bus: EventBus<GameEvents>, input: InputState) => GameUi;
