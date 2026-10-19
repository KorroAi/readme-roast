import type { EventBus, GameEvents } from '../core/events';

/**
 * Short vibrations for the moments a thumb should feel: a pick strike, a block giving way, a
 * pickup, a fall, a discovery. Uses navigator.vibrate (Android browsers and the WebView shell;
 * iOS has no web vibration, so it is simply absent there). Patterns are short and sparse: a
 * strike every swing must not turn the phone into a buzzer.
 */
export const HAPTIC_PATTERNS = {
  hit: 9,
  tooHard: [14, 40, 14],
  broken: 22,
  pickup: 6,
  damaged: 45,
  discovery: [18, 60, 28],
  craft: [12, 50, 12],
  /** The lantern crossed the turn-back mark: two firm knocks. */
  turnBack: [30, 90, 30],
  /** The cold bit (once per interval): a heartbeat. */
  cold: [16, 110, 26],
} as const;

export type HapticKind = keyof typeof HAPTIC_PATTERNS;

/** Minimum gap between two vibrations of the same kind (ms), so bursts do not blur together. */
const MIN_GAP_MS: Partial<Record<HapticKind, number>> = { pickup: 90, hit: 60 };

export class Haptics {
  private readonly last = new Map<HapticKind, number>();
  private readonly off: Array<() => void> = [];

  constructor(
    bus: EventBus<GameEvents>,
    /** Vibration is wanted right now (setting on, the player is on a touch screen). */
    private readonly enabled: () => boolean,
    private readonly vibrate: ((p: number | readonly number[]) => boolean) | null = typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function' ? (p) => navigator.vibrate(p as number | number[]) : null,
    private readonly now: () => number = () => performance.now(),
  ) {
    this.off.push(
      bus.on('block:hit', () => this.play('hit')),
      bus.on('block:tooHard', () => this.play('tooHard')),
      bus.on('block:broken', () => this.play('broken')),
      bus.on('item:picked', () => this.play('pickup')),
      bus.on('player:damaged', () => this.play('damaged')),
      bus.on('discovery', () => this.play('discovery')),
      bus.on('craft:done', () => this.play('craft')),
      bus.on('lantern:turnBack', () => this.play('turnBack')),
      bus.on('player:cold', () => this.play('cold')),
    );
  }

  /** @returns true when a vibration was requested. */
  play(kind: HapticKind): boolean {
    if (!this.vibrate || !this.enabled()) return false;
    const t = this.now();
    const gap = MIN_GAP_MS[kind] ?? 0;
    const prev = this.last.get(kind);
    if (prev !== undefined && t - prev < gap) return false;
    this.last.set(kind, t);
    try {
      return this.vibrate(HAPTIC_PATTERNS[kind]);
    } catch {
      return false;
    }
  }

  dispose(): void {
    for (const f of this.off) f();
    this.off.length = 0;
  }
}
