/**
 * World events (round 2, WORLD seam; ROUND2 §0.7): something happens every 2–4 minutes of
 * exploration, calm but exciting, one at a time, never at the camp.
 *
 * The EventDirector (game/events/EventDirector) schedules them and runs the world side (voxels,
 * lights, the lantern, rewards); it emits `world:event` on the bus at each start and end. Other
 * systems answer by kind:
 * - MOBS spawns the event mobs: 'migration' (a glow-moth migration passing `anchor` -> `target`)
 *   and 'treasure' (a fleeing treasure mob at `anchor`, running toward `target`).
 * - VIS draws the presentation it owns (dust, the bloom's glow, the geyser's spores, the echo
 *   light's mote at `event.light`), FP/audio play the cue.
 */
export type EventKind = 'tremor' | 'bloom' | 'migration' | 'treasure' | 'echo' | 'gust' | 'geyser' | 'rockfall';

export type V3 = [number, number, number];

export interface GameEvent {
  /** Unique per game session: `${kind}-${n}`. */
  id: string;
  kind: EventKind;
  /** Game-clock seconds (exploration time, EventDirector.clock) when it starts and ends. */
  start: number;
  end: number;
  /** Where it happens (world metres): the pocket, the bloom, the brazier, the geyser, the rock fall. */
  anchor: V3;
  /** Radius of its effect (m). */
  radius: number;
  /** Where it leads, when it leads somewhere: the echo light's secret, the migration's and the treasure mob's way out, the tremor's pocket. */
  target?: V3;
  /** Area id (FeatureLayout.areas) for text, when known. */
  area?: string;
}

/** Live data of an event while it runs (updated in place each frame; read, never written, by others). */
export interface EventLive {
  /** The echo light's mote (world metres) as it leads the way, or the falling rocks' warning disc. */
  light?: V3;
  /** 0..1 through the event. */
  t: number;
}

/** What the director reads each frame. */
export interface EventContext {
  /** Feet position (m). */
  x: number;
  y: number;
  z: number;
  inCamp: boolean;
  /** A screen is open, a ride runs, the game is paused or a cut-scene plays: the clock stops. */
  busy: boolean;
  /** The lantern is lit (a gust needs a flame to dim). */
  lit: boolean;
  /** Depth below the surface (m). */
  depth: number;
}

/** The director's public face (FP's hub and the debug API call these). */
export interface EventDirectorApi {
  /** One frame (dt seconds). */
  update(dt: number, ctx: EventContext): void;
  /** The event running now, or null. */
  readonly current: GameEvent | null;
  readonly live: EventLive;
  /** Start an event of `kind` now near the explorer (debug, tests); null when it cannot be placed. */
  force(kind: EventKind, ctx: EventContext): GameEvent | null;
  /** Seconds of exploration until the next event may start. */
  readonly untilNext: number;
}

declare module '../../core/events' {
  interface GameEvents {
    /** A world event starts or ends (game/events). `ok` on an end: the player did the thing (lit the brazier, followed the light). */
    'world:event': { event: GameEvent; phase: 'start' | 'end'; ok?: boolean };
    /** The falling rocks land (damage was dealt through Health if the explorer stood under them). */
    'world:rockfall': { x: number; y: number; z: number; hit: boolean };
    /** The tremor opened a hidden pocket (cells carved) at x, y, z. */
    'world:pocket': { x: number; y: number; z: number; cells: number };
  }
}
