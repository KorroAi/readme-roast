// Active skills (SPEC §5.4): unlock at a depth with level 1 free, then levelled with gold in the Dig
// sheet (from 3 rows of gold at the unlock depth, ×5 per level). The skill row shows them with cooldown
// sweeps. Cataclysm: all four used within 5 s → everything ×2 for 10 s.

export type SkillId = 'dynamite' | 'goldRush' | 'overdrive' | 'earthquake';

export interface SkillDef {
  id: SkillId;
  unlock: number;
  /** Seconds the effect lasts (0: instant). */
  duration: number;
  cooldown: number;
  /** Price of level 2 in rows of gold at the unlock depth; ×costR per further level. */
  costRows: number;
  costR: number;
  maxLevel: number;
}

export const SKILLS: readonly SkillDef[] = [
  { id: 'dynamite', unlock: 30, duration: 0, cooldown: 60, costRows: 3, costR: 5, maxLevel: 10 },
  { id: 'goldRush', unlock: 180, duration: 20, cooldown: 180, costRows: 3, costR: 5, maxLevel: 11 },
  { id: 'overdrive', unlock: 320, duration: 30, cooldown: 300, costRows: 3, costR: 5, maxLevel: 11 },
  { id: 'earthquake', unlock: 600, duration: 0, cooldown: 600, costRows: 3, costR: 5, maxLevel: Infinity },
];

export function skillDef(id: string): SkillDef | undefined {
  return SKILLS.find((k) => k.id === id);
}

/** Dynamite: rows destroyed at once (3, +1 per level to 12). */
export function dynamiteRows(level: number): number {
  return Math.min(12, 2 + Math.max(1, level));
}

/** Gold Rush multiplier (×5, +1 per level to ×15). */
export function goldRushMult(level: number): number {
  return Math.min(15, 4 + Math.max(1, level));
}

/** Overdrive crew multiplier (×10, +2 per level to ×30). */
export function overdriveMult(level: number): number {
  return Math.min(30, 8 + 2 * Math.max(1, level));
}

/** Earthquake: seconds of total DPS applied at once (60, +15 per level). */
export function earthquakeSeconds(level: number): number {
  return 45 + 15 * Math.max(1, level);
}

/** Cataclysm: the window (s) to use all four, its multiplier and duration. */
export const CATACLYSM = { window: 5, mult: 2, duration: 10 } as const;
