// Credits and spends (SPEC §5.7, §10.6): every gain goes through here so the ledger events, the lifetime counters and
// the records stay consistent. "Seconds of income" rewards (chests, events, contracts) use the reference income:
// the active income at the player's live tap rate, at least 2 taps/s, so a reward is worth the same at any depth.

import { Big } from '../../core/big';
import type { GainSource, IdleBus } from '../bus';
import { goldPerHp, hpLog10 } from '../config/curves';
import { incomeLog10 } from './run';
import { goldMultLog10 } from './shaft';
import type { IdleState } from './state';

/**
 * The reward budget (BUILD §3.1 MUST 8: the sim includes every system at its expected rate). SPEC's tables pay events,
 * chests and contracts in "seconds of current income"; with every W2 source on (an event a minute, chest cells, seals,
 * rank and Codex chests, contracts) they added up to more than the digging itself and the run ran away. The session sim
 * (`tools/econ-sim.ts days`) is calibrated with this scale on the W2 sources (events, tappables, contracts and every
 * chest that is not a chest cell); chest cells and the rack keep SPEC's calibrated value. A knob for the tools.
 */
export const REWARD = { secondsScale: 0.25 };

/** log10 of the income a "seconds of income" reward is measured in. */
export function refIncomeLog10(s: IdleState): number {
  const l = incomeLog10(s, Math.max(2, s.rates.tapsPerSec));
  return Number.isFinite(l) ? l : Math.log10(2);
}

/**
 * log10 of a chest's gold: `secs` seconds of the reference income, but never more than the rows of gold those seconds
 * are worth at the calibrated pace (a row every 2.5 s) at this depth. Chest cells come one per 25 ROWS, so in a fast
 * re-climb seconds-of-income chests would pay income × speed² and run away; the cap keeps a chest worth the rows it
 * stands for (the first run, at 1.4–3.6 s a row, is unchanged).
 */
export function chestGoldLog10(s: IdleState, secs: number, source = 'cell'): number {
  const scale = source === 'cell' || source === 'rack' || source === 'double' ? 1 : REWARD.secondsScale;
  const inc = refIncomeLog10(s) + Math.log10(secs * scale);
  const rows = hpLog10(s.run.depth) + Math.log10(7 * goldPerHp() * chestRows((secs * scale) / CHEST_ROW_SECONDS)) + goldMultLog10(s);
  return Math.min(inc, rows);
}

/** The calibrated row time a chest's seconds are converted at (SPEC §5.12: rows take 1.4–3.6 s in the first run). */
export const CHEST_ROW_SECONDS = 2.5;
/** Rows of gold past which a chest's gold grows as the square root (a Reliquary or Lintel jackpot stays a jackpot). */
export const CHEST_SOFT_ROWS = 40;

/**
 * The rows of gold a chest pays: linear up to CHEST_SOFT_ROWS, then √. The days sim (seed 3) rolled a Lintel at 474 m:
 * 1200 s = 480 rows of gold bought ~100 levels at once and, with the Storm, carried the run from 474 m to 890 m in 40 s.
 * Soft-capped, a Lintel pays ~139 rows and a Reliquary ~69 (Wood, Copper and Crystal are unchanged).
 */
export function chestRows(rows: number): number {
  return rows <= CHEST_SOFT_ROWS ? rows : CHEST_SOFT_ROWS * Math.sqrt(rows / CHEST_SOFT_ROWS);
}

/** Credit gold to the run (and the lifetime total). */
export function creditGold(s: IdleState, gold: Big, source: GainSource, bus?: IdleBus, col = -1, depth = s.run.depth): void {
  if (gold.isZero()) return;
  s.run.gold.addIn(gold);
  s.run.goldEarned.addIn(gold);
  s.meta.lifetime.gold.addIn(gold);
  bus?.emit('gold:gain', { amount: gold.clone(), source, col, depth });
}

/** Credit `secs` seconds of the reference income. @returns the gold credited. */
export function creditSeconds(s: IdleState, secs: number, source: GainSource, bus?: IdleBus, col = -1, depth = s.run.depth): Big {
  if (secs <= 0) return Big.zero();
  const gold = Big.fromLog10(refIncomeLog10(s) + Math.log10(secs * REWARD.secondsScale));
  creditGold(s, gold, source, bus, col, depth);
  return gold;
}

/** Credit gems. */
export function creditGems(s: IdleState, n: number, source: GainSource, bus?: IdleBus, col = -1, depth = s.run.depth): void {
  if (n <= 0) return;
  s.meta.gems += n;
  bus?.emit('gems:gain', { amount: n, source, col, depth });
}

/** Spend gems on a sink. @returns false when there are not enough (nothing changes). */
export function spendGems(s: IdleState, n: number, sink: string, bus?: IdleBus): boolean {
  if (n <= 0) return true;
  if (s.meta.gems < n) return false;
  s.meta.gems -= n;
  bus?.emit('gems:spend', { amount: n, sink });
  return true;
}

/** Add XP (rank.ts levels up on its 0.25 s check). */
export function addXp(s: IdleState, n: number): void {
  if (n <= 0) return;
  s.meta.rank.xp += n;
  s.xpPending += n;
}

/** Mark an entity id used this run (the last 96 kept). @returns false when it was already used. */
export function useOnce(s: IdleState, id: string): boolean {
  if (s.run.used.includes(id)) return false;
  s.run.used.push(id);
  if (s.run.used.length > 96) s.run.used.splice(0, s.run.used.length - 96);
  return true;
}
