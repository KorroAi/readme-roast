/**
 * Round 3 seam (LOOP): the goal, the guidance and the side loop (BRIEF §0.3, §0.7).
 *
 * - The main quest "Relight the Heart": per stratum find the two guardians' lairs, defeat them for
 *   their Heart Shards, prepare the next pick, open the stratum's Gate and descend; at the bottom
 *   the 12 shards relight the Heart, its guardian falls, then the ending and free play.
 * - One optional side task is tracked beside it (a camp order, a biome task, the bestiary...).
 * - Camp orders: 3 at a time, renewed on each return to camp, plus one daily order.
 * - The taught-by-doing tutorial: one step at a time, each with a short line and the id of the
 *   control the UI rings (`highlight`, a ui/hud/actions UiTargetId). Skippable.
 * - Hints (stuck 90 s, low flame, low health, full bag), first-time tips and biome arrival cards.
 *
 * `QuestSystem` (game/quests/Quests) implements it; the HUD tracker reads `main()` and `side()`
 * every frame (no allocation when nothing changed), the Quests screen reads `view()`.
 */
import type { UiTargetId } from '../../ui/hud/actions';
import type { BiomeKey, ItemId } from '../../config/items';

export type QuestKind = 'tutorial' | 'main' | 'side' | 'order' | 'biome' | 'bestiary';

/** Where the compass arrow points (null: nowhere known yet). */
export interface QuestTarget {
  x: number;
  y: number;
  z: number;
  /** The stratum it is in (1..6); the arrow only shows in that stratum. */
  stratum: number;
  kind: 'lair' | 'gate' | 'heart' | 'camp' | 'outpost' | 'station' | 'page' | 'point';
}

export interface QuestStepView {
  /** Stable id, e.g. 'main:s1.lairs', 'main:s2.guardian.floodedGrottoes', 'order:3', 'tut:mine'. */
  id: string;
  kind: QuestKind;
  /** Short title for the tracker ("Relight the Heart · I"). */
  title: string;
  /** The step itself, one line ("Defeat the Amber Matriarch"). */
  text: string;
  progress: { have: number; need: number } | null;
  target: QuestTarget | null;
  /** A reward line, when there is one ("+6 Torches"). */
  reward: string | null;
}

export interface OrderView {
  id: string;
  text: string;
  have: number;
  need: number;
  reward: string;
  daily: boolean;
  /** Done and waiting to be paid at camp. */
  done: boolean;
}

/** The tutorial steps, in order (BRIEF §0.7). */
export type TutorialStepId = 'look' | 'move' | 'mine' | 'pickup' | 'craft' | 'torch' | 'fight' | 'sonar' | 'bag' | 'map' | 'quest';

export interface TutorialStepView {
  id: TutorialStepId;
  /** 1-based, of `total`. */
  index: number;
  total: number;
  /** The short line shown by the ringed control. */
  line: string;
  /** The control to ring (null: none). */
  highlight: UiTargetId | null;
}

/** A biome arrival card (BRIEF §0.7): name, one line, its hazard and the gear that answers it, the guardian's rumour. */
export interface ArrivalCard {
  biome: BiomeKey;
  name: string;
  line: string;
  stratum: number;
  hazard: string | null;
  counter: string | null;
  rumour: string;
  /** False after the first visit: a short banner instead of the card. */
  first: boolean;
}

/** The Quests screen (main chain, biome tasks, the camp's orders, the feats, pages, shards). */
export interface QuestsScreenView {
  main: Array<{ stratum: number; name: string; steps: Array<{ text: string; done: boolean; current: boolean }> }>;
  current: QuestStepView;
  tracked: string | null;
  biomes: Array<{ biome: BiomeKey; name: string; visited: boolean; tasks: Array<{ id: string; text: string; have: number; need: number; done: boolean; reward: string }> }>;
  orders: OrderView[];
  feats: Array<{ id: string; name: string; text: string; earned: boolean }>;
  pages: Array<{ n: number; title: string; body: string; found: boolean }>;
  shards: { have: number; total: number; biomes: BiomeKey[] };
  /** The Heart has been relit (the ending was seen: free play). */
  free: boolean;
}

export interface QuestSystem {
  main(): QuestStepView;
  side(): QuestStepView | null;
  orders(): OrderView[];
  /** Track a side task by id (a QuestStepView or order id), or null for the automatic choice. */
  track(id: string | null): void;
  tutorial(): TutorialStepView | null;
  /** The same as tutorial() (UI's name for it). */
  tutorialStep(): TutorialStepView | null;
  skipTutorial(): void;
  view(): QuestsScreenView;
}

/** What the HUD needs each frame from LOOP (filled into the HUD state by Game). */
export interface LoopHud {
  main: QuestStepView;
  side: QuestStepView | null;
  tutorial: TutorialStepView | null;
  /** Bearing of the main target relative to the camera (radians, + right) and metres, or null. */
  compass: { bearing: number; distance: number; kind: QuestTarget['kind'] } | null;
  /** Hazard meters 0..1 (build-up) and the active wards' seconds left. */
  hazard: { kind: 'cold' | 'gas' | 'heat' | 'dark' | null; level: number; warded: number };
}

declare module '../../core/events' {
  interface GameEvents {
    /** Round 3 (LOOP): the main quest (or a tracked task) moved to a new step. */
    'quest:step': { id: string; kind: QuestKind; text: string };
    /** A quest, task, order or the whole chain was completed (`reward` already paid). */
    'quest:done': { id: string; kind: QuestKind; reward: string | null };
    /** The tutorial moved on (null: done or skipped). */
    'tutorial:step': { id: TutorialStepId | null; highlight: UiTargetId | null; line: string | null };
    /** A Heart Shard was taken (from a guardian of `biome`): `count` of 12. */
    'quest:shard': { biome: BiomeKey; count: number };
    /** A journal page was read (number `n`). */
    'quest:page': { n: number; first: boolean };
    /** A hint to show (stuck, low flame, low health, full bag, first-time tips). */
    'guide:hint': { id: string; text: string; target: UiTargetId | null };
    /** A biome was entered (the arrival card on the first visit). */
    'guide:arrival': { card: ArrivalCard };
    /** The 12 shards relit the Heart (the final fight follows), and the ending after it. */
    'quest:heartLit': Record<string, never>;
    'quest:ending': Record<string, never>;
    /** An order was paid at camp. */
    'order:paid': { id: string; reward: string };
    /** A bestiary entry gave its bonus. */
    'bestiary:reward': { kind: string; text: string };
    /** A hazard started or stopped hurting (gameplay/Hazards), for audio and the HUD edge. */
    'hazard:changed': { kind: 'cold' | 'gas' | 'heat' | 'dark' | null; level: number };
    /** An item reward was paid (into the bag, or the bank when full). */
    'reward:paid': { items: Partial<Record<ItemId, number>>; reason: string };
  }
}
