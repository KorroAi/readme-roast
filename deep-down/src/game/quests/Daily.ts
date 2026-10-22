import type { ItemId } from '../../config/items';
import { t, type TextKey } from '../../i18n';
import { Rng } from '../../core/rng';

/**
 * The daily descent (round 3 stretch, LOOP; BRIEF §6): one seed per day for everyone (UTC), a goal,
 * and one or two modifiers drawn from the same seed. New Game → "Daily Descent" starts an
 * expedition on `daily(day).seed`; the clock runs from the start, and reaching the goal records the
 * day's best time (kept in the loop's save, with the last days' bests).
 */
export type DailyGoal = 'guardian' | 'gate1' | 'shards3' | 'stratum3';
export type DailyMod = 'rich' | 'swarm' | 'dark' | 'gift' | 'fragile';

export interface DailyDef {
  day: number;
  seed: number;
  goal: DailyGoal;
  mods: DailyMod[];
  /** "2026-10-22" (UTC). */
  date: string;
  /** "Daily Descent · 2026-10-22", the goal's line, the modifiers' lines. */
  title: string;
  goalText: string;
  modTexts: string[];
}

const GOALS: readonly DailyGoal[] = ['guardian', 'gate1', 'shards3', 'stratum3'];
const MODS: readonly DailyMod[] = ['rich', 'swarm', 'dark', 'gift', 'fragile'];

/** The day number (UTC days since 1970) of a time. */
export function dayOf(now = Date.now()): number {
  return Math.floor(now / 86_400_000);
}

/** The daily descent of a day: the same for every player. */
export function daily(day = dayOf()): DailyDef {
  const d = Math.floor(day);
  const seed = (Math.imul(d ^ 0x6a09e667, 0x9e3779b1) ^ 0xdd0d) >>> 0;
  const rng = new Rng(seed ^ 0x51ed);
  const goal = GOALS[Math.floor(rng.next() * GOALS.length) % GOALS.length];
  const mods: DailyMod[] = [];
  const first = MODS[Math.floor(rng.next() * MODS.length) % MODS.length];
  mods.push(first);
  if (rng.next() < 0.5) {
    const second = MODS[Math.floor(rng.next() * MODS.length) % MODS.length];
    if (second !== first && !(first === 'gift' && second === 'fragile') && !(first === 'fragile' && second === 'gift')) mods.push(second);
  }
  const date = new Date(d * 86_400_000).toISOString().slice(0, 10);
  return {
    day: d,
    seed,
    goal,
    mods,
    date,
    title: t('daily3.title', { date }),
    goalText: t(`daily3.goal.${goal}` as TextKey),
    modTexts: mods.map((m) => t(`daily3.mod.${m}` as TextKey)),
  };
}

/** What the modifiers do to a fresh expedition (Loop applies them on a daily New Game). */
export const DAILY_EFFECT: Record<DailyMod, { gift?: Partial<Record<ItemId, number>>; maxHealth?: number; burn?: number; dropBonus?: number; swarm?: number }> = {
  rich: { dropBonus: 0.5 },
  swarm: { swarm: 1.5 },
  dark: { burn: 1.3 },
  gift: { gift: { torch: 12, bandage: 4, oilFlask: 2, copperIngot: 4 } },
  fragile: { maxHealth: -30 },
};

export interface DailyRun {
  day: number;
  goal: DailyGoal;
  mods: DailyMod[];
  /** Play seconds at the start, and when the goal was reached (null: not yet). */
  t0: number;
  done: number | null;
}

export interface DailySave {
  run: DailyRun | null;
  /** Best seconds per day (the last 14 days kept). */
  best: Record<string, number>;
}

/** The goal is met (Loop asks each second while a daily run is on). */
export function goalMet(goal: DailyGoal, s: { shards: number; gatesOpened: number; deepest: number; guardians: number }): boolean {
  switch (goal) {
    case 'guardian':
      return s.guardians >= 1;
    case 'gate1':
      return s.gatesOpened >= 1;
    case 'shards3':
      return s.shards >= 3;
    case 'stratum3':
      return s.deepest >= 3;
  }
}
