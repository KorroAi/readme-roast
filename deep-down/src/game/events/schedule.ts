import { EVENTS } from '../../config/events';
import { Rng } from '../../core/rng';
import type { EventKind, GameEvent, V3 } from './types';

/**
 * The events director's clock and choice (pure, unit-tested): one event at a time, the next one
 * 2–4 minutes of exploration after the last one ended, the clock stopped at camp and while busy.
 */
export interface Placement {
  anchor: V3;
  radius: number;
  target?: V3;
  area?: string;
}

/** Where (and whether) an event of `kind` can happen now; null when it cannot. */
export type Placer = (kind: EventKind) => Placement | null;

export const EVENT_KINDS: readonly EventKind[] = ['tremor', 'bloom', 'migration', 'treasure', 'echo', 'gust', 'geyser', 'rockfall'];

export class EventSchedule {
  /** Exploration seconds (the clock the events run on). */
  clock = 0;
  current: GameEvent | null = null;
  /** Clock time the next event may start. */
  nextAt: number = EVENTS.firstAfter;
  /** Kinds another system has said it draws (MOBS: migration, treasure). */
  readonly handled = new Set<EventKind>();
  private last: EventKind | null = null;
  private n = 0;
  private readonly rng: Rng;

  constructor(seed: number) {
    this.rng = new Rng(seed);
  }

  get untilNext(): number {
    return this.current ? Infinity : Math.max(0, this.nextAt - this.clock);
  }

  /** Can `kind` run at this depth, with its handler? */
  allowed(kind: EventKind, depth: number): boolean {
    if (EVENTS.needsHandler.includes(kind) && !this.handled.has(kind)) return false;
    return depth >= EVENTS.minDepth[kind];
  }

  /**
   * Advance the clock (only while exploring) and start an event when one is due.
   * @returns the event that started this step, or null.
   */
  step(dt: number, exploring: boolean, depth: number, place: Placer, weightOf?: (kind: EventKind) => number): GameEvent | null {
    if (!exploring || !(dt > 0)) return null;
    this.clock += dt;
    if (this.current) {
      if (this.clock >= this.current.end) this.end();
      return null;
    }
    if (this.clock < this.nextAt) return null;
    const ev = this.pick(depth, place, weightOf);
    if (!ev) this.nextAt = this.clock + EVENTS.retry;
    return ev;
  }

  /** Start `kind` now if it can be placed (debug, tests, forced events). */
  start(kind: EventKind, p: Placement): GameEvent {
    if (this.current) this.end();
    const ev: GameEvent = { id: `${kind}-${++this.n}`, kind, start: this.clock, end: this.clock + EVENTS.duration[kind], anchor: p.anchor, radius: p.radius };
    if (p.target) ev.target = p.target;
    if (p.area) ev.area = p.area;
    this.current = ev;
    this.last = kind;
    return ev;
  }

  /** End the current event (its time ran out, or the player did the thing); the gap starts now. */
  end(): GameEvent | null {
    const ev = this.current;
    if (!ev) return null;
    this.current = null;
    this.nextAt = this.clock + EVENTS.gapMin + this.rng.next() * (EVENTS.gapMax - EVENTS.gapMin);
    return ev;
  }

  /** `weightOf`: a multiplier on a kind's odds here (round 3: the Halden Mines' loose roofs favour a rockfall). */
  private pick(depth: number, place: Placer, weightOf?: (kind: EventKind) => number): GameEvent | null {
    const kinds = EVENT_KINDS.filter((k) => this.allowed(k, depth) && k !== this.last);
    const weight = (k: EventKind) => EVENTS.weight[k] * (weightOf?.(k) ?? 1);
    // Weighted draw without replacement until one can be placed.
    const pool = kinds.slice();
    while (pool.length) {
      const total = pool.reduce((s, k) => s + weight(k), 0);
      let r = this.rng.next() * total;
      let k = pool[pool.length - 1];
      for (const c of pool) {
        r -= weight(c);
        if (r <= 0) {
          k = c;
          break;
        }
      }
      pool.splice(pool.indexOf(k), 1);
      const p = place(k);
      if (p) return this.start(k, p);
    }
    return null;
  }
}
