import type { KeyAction, KeySink } from './types';

// Desktop keys (SPEC §3.1): 1–7 tap a column, Space taps the last one again, B buys BEST, Esc is Back. Auto-repeat
// never taps (holding a key is not a hold stream; the pointer is). A click on the canvas is a tap (TapSurface).

/** The action for a key code (null: not a game key). Pure; unit tested. */
export function keyAction(code: string, repeat: boolean): KeyAction | null {
  if (code === 'Escape') return repeat ? null : { kind: 'back' };
  if (repeat) return null;
  const digit = code.startsWith('Digit') ? Number(code.slice(5)) : code.startsWith('Numpad') ? Number(code.slice(6)) : NaN;
  if (digit >= 1 && digit <= 7) return { kind: 'tap', col: digit - 1 };
  if (code === 'Space') return { kind: 'again' };
  if (code === 'KeyB') return { kind: 'best' };
  return null;
}

export class DesktopInput {
  private readonly onKeyDown = (e: KeyboardEvent): void => {
    const tg = e.target as HTMLElement | null;
    if (tg && (tg.tagName === 'INPUT' || tg.tagName === 'SELECT' || tg.tagName === 'TEXTAREA' || tg.isContentEditable)) return;
    this.sink.keyInput();
    const a = keyAction(e.code, e.repeat);
    if (!a) return;
    // Space would scroll or press a focused button; the game owns it.
    if (a.kind === 'again') e.preventDefault();
    if (a.kind !== 'back' && !this.sink.keysEnabled()) return;
    this.sink.keyAction(a);
  };

  constructor(private readonly sink: KeySink, private readonly target: Window = window) {
    target.addEventListener('keydown', this.onKeyDown);
  }

  dispose(): void {
    this.target.removeEventListener('keydown', this.onKeyDown);
  }
}
