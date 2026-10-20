// The Dig sheet's gold upgrades (SPEC §5.4) with the critic panel's changes:
// - CRITIQUE MUST 2: Rally is folded into the Pick. Every tap carries a share of the crew's DPS, the
//   pick's EDGE, which every Pick level raises by ×1.03. The edge is measured against the rock: its
//   reference level rises with log HP(d), so a pick bought along the way stays at par while one left
//   behind dulls. Every Pick level is therefore a real +3 % on the tap at any depth (slot 1 is never a
//   dead card), and the tap's share stays bounded (E20: active ÷ idle 2–4).
// - CRITIQUE MUST 1: Steady Hand raises the ONE hold stream from 3/s to 5/s (+1/3 per level).
// - CRITIQUE MUST 10: damage tiers (×2.5 every 25 levels) are split from the named tool forms (gear.ts).

/** The pick (SPEC §5.4): cost c0 × r^(L − 1), damage 100 × L × 2.5^floor(L / 25). */
export const PICK = {
  c0: 30,
  /**
   * 1.28, not SPEC's 1.20: the game lets overkill flow on (SPEC §3.2) while Appendix A capped a tap at one
   * cell; with the flow, a 1.20 pick made the first minute twice as fast as the table (calibrated by
   * `tools/econ-sim.ts first`, which now models the game's flow).
   */
  r: 1.28,
  dmg: 100,
  tierEvery: 25,
  tierX: 2.5,
  /** The edge: the share of crew DPS a tap carries, at par (CRITIQUE MUST 2). */
  edgeBase: 0.14,
  /** ×edgeStep per level above the reference, ÷ per level below. */
  edgeStep: 1.03,
  /** The edge never exceeds this (E20 ≤ 4) nor falls under edgeMin. */
  edgeMax: 0.33,
  edgeMin: 0.02,
  /** Reference level offset: the reference is log_r(HP(d)/HP0) + edgeOffset. */
  edgeOffset: -12,
} as const;

export type UpgradeId = 'lucky' | 'shock' | 'steady' | 'bellows';

export interface UpgradeDef {
  id: UpgradeId;
  /** Unlock depth (rows). */
  unlock: number;
  /** c0 in rows of gold at `costAt` (SPEC §5.4). */
  costRows: number;
  costAt: number;
  r: number;
  /** Max level (Infinity: none). */
  max: number;
}

export const UPGRADES: readonly UpgradeDef[] = [
  { id: 'lucky', unlock: 30, costRows: 1.5, costAt: 30, r: 2.5, max: 25 },
  { id: 'steady', unlock: 60, costRows: 2, costAt: 60, r: 4, max: 6 },
  { id: 'shock', unlock: 120, costRows: 4, costAt: 120, r: 6, max: Infinity },
  { id: 'bellows', unlock: 180, costRows: 6, costAt: 180, r: 6, max: 10 },
];

export function upgradeDef(id: string): UpgradeDef | undefined {
  return UPGRADES.find((u) => u.id === id);
}

/** Crit (SPEC §3.2): min(30 %, 5 % + 1 % per Lucky Strike level); a crit deals ×5. */
export const CRIT = { base: 0.05, perLevel: 0.01, max: 0.3, mult: 5 } as const;

/** Combo (SPEC §3.4): +1 within 0.6 s; after 1.2 s quiet −5 every 0.5 s; ×(1 + 0.02 × min(combo, 50)). */
export const COMBO = {
  window: 0.6,
  decayAfter: 1.2,
  decayEvery: 0.5,
  decayStep: 5,
  perCombo: 0.02,
  cap: 50,
  tiers: [10, 25, 50, 100, 250, 500, 1000] as readonly number[],
  /** A hold-stream hit adds this much combo (CRITIQUE MUST 1). */
  holdGain: 0.5,
} as const;

/** The Lantern Surge (SPEC §3.4): 1 per hit, 4 per crit, full at 240; ×3 taps for 10 s (+1 s per Bellows). */
export const SURGE = {
  meterMax: 240,
  perHit: 1,
  perCrit: 4,
  /** Hold-stream hits fill half (CRITIQUE MUST 1). */
  holdFactor: 0.5,
  duration: 10,
  perBellows: 1,
  mult: 3,
  /** The first Surge is scripted: the meter appears pre-filled to this. */
  scriptedFill: 140,
} as const;

/** Hold auto-tap stream (CRITIQUE MUST 1): one global stream, 3/s base, +1/3 per Steady Hand level (5/s at L6), 8/s in a Surge. */
export const HOLD = { base: 3, perSteady: 1 / 3, max: 5, surge: 8 } as const;

/** Counted hits per second across all pointers (CRITIQUE MUST 1; the input layer enforces it). */
export const TAP_CAP = 8;

/** Shockwave splash (SPEC §5.4): side neighbours in the floor row. */
export function shockwave(level: number): { reach: number; frac: number } {
  if (level <= 0) return { reach: 0, frac: 0 };
  if (level <= 4) return { reach: 1, frac: 0.25 * level };
  if (level <= 8) return { reach: 2, frac: 0.25 * (level - 4) };
  return { reach: 6, frac: Math.min(1, 0.25 + 0.25 * Math.floor((level - 8) / 4)) };
}

/** Pierce depth (SPEC §3.2): 1 + floor(pickTier / 3) cells down the column, at most 8 below the floor. */
export function pierceOf(pickTier: number): number {
  return Math.min(8, 1 + Math.floor(pickTier / 3));
}

/** The pick's damage tier at level L (0-based: tier 0 below 25). */
export function pickTier(level: number): number {
  return Math.floor(Math.max(1, level) / PICK.tierEvery);
}

/** The hold stream's rate (hits/s). */
export function holdRateOf(steady: number, surge: boolean): number {
  if (surge) return HOLD.surge;
  return Math.min(HOLD.max, HOLD.base + HOLD.perSteady * Math.max(0, steady));
}
