import type { GameUi } from '../game/GameUi';
import type { ScreenId } from '../ui/types';

/** Development-only stand-in for the real UI: records state, renders nothing. */
export class StubUI implements GameUi {
  screen: ScreenId = 'none';
  readonly log: string[] = [];
  readonly touch = { setInteractVisible: (label: string | null) => void this.log.push(`interact:${label}`) };
  showScreen(id: ScreenId): void {
    this.screen = id;
  }
  isBlockingInput(): boolean {
    return this.screen !== 'none' && this.screen !== 'menu';
  }
  setGameplayActive(): void {}
  setHud(): void {}
  setLoading(): void {}
  showDiscovery(n: { title: string }): void {
    this.log.push(`discovery:${n.title}`);
  }
  toast(text: string): void {
    this.log.push(`toast:${text}`);
  }
  hint(text: string): void {
    this.log.push(`hint:${text}`);
  }
  showDeath(): void {
    this.screen = 'death';
  }
  applySettings(): void {}
  refresh(): void {}
  dispose(): void {}
}
