import type { EventKind } from '../game/events/types';

/**
 * The events director's tuning (round 2, ROUND2 §0.7): something happens every 2–4 minutes of
 * exploration (the clock stops at camp, on a ride and behind a screen), one event at a time.
 */
export const EVENTS = {
  /** Exploration seconds before the first event of a session, and between two events. */
  firstAfter: 75,
  gapMin: 120,
  gapMax: 240,
  /** When nothing can be placed at the planned time, look again after this long. */
  retry: 8,
  /** Seconds each kind runs at most (an echo light or a gust can end earlier, when done). */
  duration: { tremor: 6, bloom: 60, migration: 40, treasure: 45, echo: 90, gust: 45, geyser: 12, rockfall: 4 } satisfies Record<EventKind, number>,
  /** Relative odds when several kinds can happen here (the last kind is never repeated next). */
  weight: { tremor: 3, bloom: 3, migration: 2, treasure: 2, echo: 3, gust: 2, geyser: 2, rockfall: 2 } satisfies Record<EventKind, number>,
  /** Depth below which each kind may happen (m): the calmer ones from the first tunnel, the rest deeper. */
  minDepth: { tremor: 8, bloom: 0, migration: 0, treasure: 20, echo: 0, gust: 20, geyser: 40, rockfall: 15 } satisfies Record<EventKind, number>,
  /** Kinds whose actors another system draws (MOBS: the moths' migration, the treasure mob); off until it says it handles them. */
  needsHandler: ['migration', 'treasure'] as readonly EventKind[],
  /** The gust: the lantern's light falls to this fraction until the explorer stands by a lamp or a fire. */
  gustDim: 0.5,
  /** Within this many metres of a lamp, a fire or a brazier the flame steadies. */
  braziersRange: 2.6,
  /** The spore geyser: standing within this radius while it bursts feeds the lantern (s of flame). */
  geyserRadius: 2.2,
  geyserFuel: 20,
  /** The falling rocks: the warning before they land (s), the disc they cover (m), the knock (hp, never lethal). */
  rockWarn: 1.6,
  rockRadius: 1.5,
  rockDamage: 8,
  /** The echo light keeps this far ahead of the explorer (m) and moves this fast (m/s). */
  echoLead: 3.5,
  echoSpeed: 2.6,
} as const;
