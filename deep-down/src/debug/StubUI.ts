// A development stand-in for the shell's screens: records what was asked, renders nothing (headless harnesses).

import type { ScreenId } from '../ui/types';

export class StubUI {
  screen: ScreenId = 'none';
  readonly log: string[] = [];
  showScreen(id: ScreenId): void {
    this.screen = id;
    this.log.push(`screen:${id}`);
  }
  toast(text: string): void {
    this.log.push(`toast:${text}`);
  }
  get blocking(): boolean {
    return this.screen !== 'none';
  }
}
