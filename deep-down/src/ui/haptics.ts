import type { EventBus, GameEvents } from '../core/events';
import '../game/fp/events';
import '../game/craft/types';
import '../game/quests/types';
import '../game/mobs/types';

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
  /** The pick on plain rock: the lightest tick. */
  tunk: 5,
  /** A blow lands on a creature: a firm knock (the hit stop's weight). */
  strike: 16,
  /** A Flash Charge bursts. */
  flash: [10, 30, 24],
  // Round 3 (BRIEF §6: a haptic per action), short and sparse like the rest.
  /** Dash: one quick shove. */
  dash: 14,
  /** Sonar: the pulse leaves the lantern, then a faint echo. */
  sonar: [8, 70, 5],
  /** Something placed (a torch, a block, a ladder). */
  place: 10,
  /** A vein chained (the combo): a crisp tick that tightens with the chain. */
  combo: 7,
  /** A hotbar slot or a menu opened: the lightest touch. */
  select: 4,
  /** A recipe made in the round 3 Craft menu. */
  made: [12, 40, 12],
  /** A tutorial step done. */
  step: [6, 50, 10],
  /** A guardian wakes: a long low rumble. */
  guardian: [40, 60, 40, 60, 70],
  /** A guardian falls, a Heart Shard won: a rising triple. */
  shard: [20, 50, 30, 50, 60],
  /** A gate opens, fast travel lands. */
  gate: [30, 80, 50],
  /** A consumable used (food, a potion). */
  use: 12,
} as const;

export type HapticKind = keyof typeof HAPTIC_PATTERNS;

/** Minimum gap between two vibrations of the same kind (ms), so bursts do not blur together. */
const MIN_GAP_MS: Partial<Record<HapticKind, number>> = { pickup: 90, hit: 60, tunk: 120, strike: 60, combo: 120, select: 80, place: 120 };

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
      bus.on('block:tunk', () => this.play('tunk')),
      bus.on('weapon:hit', () => this.play('strike')),
      bus.on('weapon:flash', () => this.play('flash')),
      // Round 3: the action layout and the loop.
      bus.on('player:dash', () => this.play('dash')),
      bus.on('player:sonar', () => this.play('sonar')),
      bus.on('player:placed', () => this.play('place')),
      bus.on('mine:combo', () => this.play('combo')),
      bus.on('hotbar:selected', () => this.play('select')),
      bus.on('ui:opened', () => this.play('select')),
      bus.on('craft:made', () => this.play('made')),
      bus.on('item:used', () => this.play('use')),
      bus.on('tutorial:step', ({ id }) => {
        if (id) this.play('step');
      }),
      bus.on('mob:guardianAwake', () => this.play('guardian')),
      bus.on('quest:shard', () => this.play('shard')),
      bus.on('world:gateOpened', () => this.play('gate')),
      bus.on('player:travelled', () => this.play('gate')),
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
