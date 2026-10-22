import type { EventBus, GameEvents } from '../core/events';
import type { InputState } from '../input/types';
import type { ItemCounts, Settings } from '../save/types';
import type { ArrivalCard, DiscoveryNotice, HudState, InteractView, MapSource, ScreenId, UiActions } from '../ui/types';
import type { PlayerActions, UiTargetId } from '../ui/hud/actions';

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
  readonly touch: {
    setInteractVisible(label: string | null): void;
    setFlash?(count: number): void;
    // Round 3: the action layout's contextual parts.
    setInteract?(v: InteractView | null): void;
    setPlaceVisible?(b: boolean): void;
    setCooldowns?(dash: number, sonar: number): void;
  };
  /** Round 3: the one action API (buttons, keys, tests drive the same path). */
  readonly player?: PlayerActions;
  arrival?(card: ArrivalCard): void;
  setMap?(src: MapSource | null): void;
  damageNumber?(sx: number, sy: number, amount: number, kind?: 'hit' | 'weak' | 'hurt'): void;
  tip?(id: string, target: UiTargetId, text: string): boolean;
  setControlPrefs?(p: { scale: number; opacity: number }): void;
  dispose(): void;
}

export type UiFactory = (root: HTMLElement, actions: UiActions, bus: EventBus<GameEvents>, input: InputState) => GameUi;
