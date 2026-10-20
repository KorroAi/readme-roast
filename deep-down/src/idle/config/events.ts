// The Director's events (SPEC §7.2) and their numbers: unlock depths, windows, widgets, targets, rewards and the
// per-biome deck weights. Read by model/director.ts and the sim; B draws each target kind, C each widget.
// Rewards are in seconds of the current income (`rates.goldPerSec`), so an event is worth the same at any depth.

import type { WidgetKind } from '../bus';

export type EventType =
  | 'goldenVein' | 'glimmerfall' | 'mothSwarm' | 'treasureMole' | 'caveIn' | 'supplyRope' | 'mimic' | 'treasureMap'
  | 'ancientEcho' | 'signature' | 'geode' | 'surface';

export interface EventDef {
  id: EventType;
  /** Unlock depth (rows reached in the run). */
  unlock: number;
  /** The window (s) once live; Infinity for waiting events (they stay until done). */
  life: number;
  /** A warning before the targets appear (s): the Cave-in's 1 s. */
  warn: number;
  widget: WidgetKind | '';
  /** Targets (min, max) and taps per target (min, max). */
  targets: readonly [number, number];
  taps: readonly [number, number];
  /** Each target is on screen this long (s), within the window. */
  onScreen: readonly [number, number];
  /** What B draws for a target. */
  kind: string;
  /** Gold per target caught (s of income), and for all caught (s of income, on top). */
  perTarget: number;
  allBonus: number;
  /** Waiting events may be dealt to an idle player (SPEC §7.2 "Idle-friendly"). */
  waits: boolean;
}

export const EVENTS: Readonly<Record<EventType, EventDef>> = {
  goldenVein: { id: 'goldenVein', unlock: 30, life: 60, warn: 0, widget: '', targets: [0, 0], taps: [0, 0], onScreen: [0, 0], kind: '', perTarget: 0, allBonus: 0, waits: true },
  glimmerfall: { id: 'glimmerfall', unlock: 40, life: 4, warn: 0, widget: 'catch', targets: [5, 9], taps: [1, 1], onScreen: [1.2, 2.0], kind: 'crystal', perTarget: 3, allBonus: 0, waits: false },
  mothSwarm: { id: 'mothSwarm', unlock: 40, life: 8, warn: 0, widget: 'catch', targets: [6, 10], taps: [1, 1], onScreen: [1.4, 2.0], kind: 'moth', perTarget: 8, allBonus: 0, waits: false },
  treasureMole: { id: 'treasureMole', unlock: 80, life: 5, warn: 0, widget: 'catch', targets: [1, 1], taps: [3, 5], onScreen: [5, 5], kind: 'mole', perTarget: 0, allBonus: 0, waits: false },
  caveIn: { id: 'caveIn', unlock: 120, life: 6, warn: 1, widget: 'catch', targets: [3, 5], taps: [1, 3], onScreen: [1.6, 2.0], kind: 'boulder', perTarget: 10, allBonus: 0, waits: false },
  supplyRope: { id: 'supplyRope', unlock: 180, life: 20, warn: 0, widget: 'pick', targets: [1, 1], taps: [1, 1], onScreen: [20, 20], kind: 'crate', perTarget: 0, allBonus: 0, waits: true },
  mimic: { id: 'mimic', unlock: 240, life: 6, warn: 0, widget: 'catch', targets: [1, 1], taps: [5, 5], onScreen: [6, 6], kind: 'mimic', perTarget: 0, allBonus: 0, waits: false },
  treasureMap: { id: 'treasureMap', unlock: 320, life: Infinity, warn: 0, widget: '', targets: [0, 0], taps: [0, 0], onScreen: [0, 0], kind: '', perTarget: 0, allBonus: 0, waits: true },
  ancientEcho: { id: 'ancientEcho', unlock: 400, life: 6, warn: 0, widget: 'sequence', targets: [3, 4], taps: [1, 1], onScreen: [6, 6], kind: 'rune', perTarget: 0, allBonus: 0, waits: false },
  signature: { id: 'signature', unlock: 0, life: 8, warn: 0, widget: 'mash', targets: [1, 1], taps: [1, 1], onScreen: [8, 8], kind: 'signature', perTarget: 0, allBonus: 60, waits: false },
  geode: { id: 'geode', unlock: 120, life: Infinity, warn: 0, widget: 'strike', targets: [0, 0], taps: [0, 0], onScreen: [0, 0], kind: 'geode', perTarget: 0, allBonus: 0, waits: true },
  surface: { id: 'surface', unlock: 0, life: 6, warn: 0, widget: '', targets: [1, 1], taps: [1, 1], onScreen: [6, 6], kind: 'gem', perTarget: 5, allBonus: 0, waits: false },
};

/** The types the Director deals from its deck (the Lucky Moth has its own clock; geodes come from rare cells). */
export const DECK: readonly EventType[] = ['goldenVein', 'glimmerfall', 'mothSwarm', 'treasureMole', 'caveIn', 'supplyRope', 'mimic', 'treasureMap', 'ancientEcho', 'signature'];

/** Deck weights by biome column B0, B1, B2, B3, B4, B5+ (SPEC §7.2's table; 0 = not in the deck there). */
export const WEIGHTS: Readonly<Record<string, readonly number[]>> = {
  goldenVein: [14, 12, 12, 10, 10, 10],
  glimmerfall: [0, 16, 14, 10, 10, 10],
  mothSwarm: [0, 18, 8, 6, 6, 6],
  treasureMole: [0, 10, 12, 12, 10, 10],
  caveIn: [0, 0, 12, 14, 10, 10],
  supplyRope: [0, 0, 10, 14, 10, 10],
  mimic: [0, 0, 0, 12, 10, 10],
  treasureMap: [0, 0, 0, 12, 10, 10],
  ancientEcho: [0, 0, 0, 0, 10, 10],
  signature: [10, 12, 12, 12, 14, 14],
};

/** Cadence (SPEC §7.2): one event every U(40, 70) s of active play; ≥ 25 s with the Wonderstruck perk and relics. */
export const DIRECTOR = {
  gap: [40, 70] as const,
  minGap: 25,
  /** Active play: a counted hit within this many seconds. */
  activeWindow: 10,
  /** Announced on the Depth Ruler this long before it starts. */
  announce: 10,
  /** Idle-friendly: after this long without a tap only waiting events are dealt. */
  idleAfter: 20,
  /** Every unlocked type at least once in any 10 consecutive events; unseen for 12 → weight ×3. */
  rotation: 10,
  unseenAfter: 12,
  unseenX: 3,
  /** The find guarantee: 10 s of active play without a new find → a micro-surfacing within 1 s. */
  findQuiet: 10,
  /** The boredom breaker: no special cell broken for 25 s while tapping → one in the next 2 rows; no beat for 70 s → deal now. */
  specialQuiet: 25,
  beatQuiet: 70,
  /** The Codex pity: an incomplete page and no new entry for 6 min of active play → a geode or fossil in the next 6 rows. */
  codexPity: 360,
  /** Hold after a biome reveal and a seal break (s), and the first second of a Surge. */
  holdReveal: 5,
  holdSurge: 1,
} as const;

/** A signature event's widget and target kind per biome (SPEC §6.5, §7.3). */
export const SIGNATURES: Readonly<Record<string, { widget: WidgetKind; kind: string; targets: readonly [number, number]; life: number }>> = {
  rootPull: { widget: 'mash', kind: 'root', targets: [1, 1], life: 5 },
  mothSwarm: { widget: 'catch', kind: 'moth', targets: [6, 10], life: 8 },
  crystalBloom: { widget: 'mash', kind: 'bloom', targets: [1, 1], life: 5 },
  pressureValves: { widget: 'strike', kind: 'valve', targets: [1, 1], life: 8 },
  sporeBurst: { widget: 'catch', kind: 'spore', targets: [6, 9], life: 7 },
  pearlBubbles: { widget: 'catch', kind: 'bubble', targets: [6, 9], life: 7 },
  lavaSurge: { widget: 'mash', kind: 'lava', targets: [1, 1], life: 5 },
  boneRattle: { widget: 'sequence', kind: 'bone', targets: [4, 5], life: 8 },
  iceShatter: { widget: 'strike', kind: 'ice', targets: [1, 1], life: 8 },
  threadWeave: { widget: 'sequence', kind: 'thread', targets: [4, 6], life: 9 },
  gearLock: { widget: 'strike', kind: 'gear', targets: [1, 1], life: 8 },
  starFall: { widget: 'catch', kind: 'star', targets: [6, 9], life: 7 },
  gravityFlip: { widget: 'catch', kind: 'drop', targets: [6, 9], life: 7 },
  runeLock: { widget: 'sequence', kind: 'rune', targets: [5, 7], life: 10 },
};

/** Supply Rope boosts (SPEC §5.11): 60 s each. */
export const ROPE_BOOSTS = ['crew2', 'crit25', 'ores3', 'comboHold', 'goldenTouch'] as const;
export type RopeBoost = (typeof ROPE_BOOSTS)[number];
export const ROPE_SECONDS = 60;

/** Glimmerfall: a crystal missed shatters on the floor for 25 % of its value; 1 in 5 crystals is a gem. */
export const GLIMMER = { missPay: 0.25, gemEvery: 5 } as const;
/** Golden Vein: the next 5 rows, 3 cells a row. */
export const VEIN = { rows: 5, cells: 3 } as const;
/** Treasure Map: the buried chest sits this many rows down (Crystal floor). */
export const MAP = { rows: 6 } as const;
/** Ancient Echo: a Lore fragment and 10 gems. Geode: perfect a rare Find + 5 gems, good a Find roll, miss 2 gems. */
export const ECHO_GEMS = 10;
export const GEODE = { perfectGems: 5, missGems: 2, needles: 3 } as const;
/** Mash tiers (SPEC §7.3): 15 / 25 / 40 taps; the event pays more per tier. */
export const MASH_TIERS: readonly number[] = [15, 25, 40];
/** Mash reward per tier reached (s of income) for the signature mashes (Root Pull, Crystal Bloom, Lava Surge). */
export const MASH_PAY: readonly number[] = [20, 40, 60];
