// Device-independent input of the idle game (SPEC §3.1). Touch and the mouse arrive as pointer events on the canvas
// (src/ui/idle/TapSurface.ts: a click is a tap); the keyboard maps to the same actions here, so a desktop player and
// the e2e keys play the same game.

/** What a key does. */
export type KeyAction =
  /** Tap column `col` (0..6) at the floor. */
  | { kind: 'tap'; col: number }
  /** Tap the last key column again (Space). */
  | { kind: 'again' }
  /** Buy the BEST card (B). */
  | { kind: 'best' }
  /** Back: close the top sheet or screen, or pause (Esc). */
  | { kind: 'back' };

/** Where key actions go (IdleGame). */
export interface KeySink {
  /** False while a key must not act (a text field focused is handled here; the sink adds modes and modals). */
  keysEnabled(): boolean;
  keyAction(a: KeyAction): void;
  /** Any key counts as input (the idle frame cap wakes). */
  keyInput(): void;
}
