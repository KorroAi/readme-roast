// Chests (SPEC §5.8), the W1 core: an instant, honest roll-up from the floor tier (each step one roll:
// Wood → Copper 40 %, Copper → Crystal 30 %, Crystal → Reliquary 20 %, Reliquary → Lintel 10 %), pity
// gauges (Crystal+ within 12, Reliquary+ within 40, Lintel within 300), contents in seconds of income
// and gems. The animation always lands on the true result. W2 adds Finds, facet rerolls and extras.

import { Big } from '../../core/big';
import type { ChestTier, IdleBus } from '../bus';
import type { IdleState } from './state';
import { rand } from './tap';

export const CHEST_TIERS: readonly ChestTier[] = ['wood', 'copper', 'crystal', 'reliquary', 'lintel'];
/** Step odds from tier i to i + 1. */
export const STEP_ODDS: readonly number[] = [0.4, 0.3, 0.2, 0.1];
/** Gold in seconds of current income, and gem ranges, per tier. */
export const CHEST_GOLD_S: readonly number[] = [8, 20, 90, 300, 1200];
export const CHEST_GEMS: ReadonlyArray<readonly [number, number]> = [[0, 1], [2, 4], [8, 12], [25, 40], [100, 100]];
/** Pity: a chest of at least tier t within N chests. */
export const PITY = { crystal: 12, reliquary: 40, lintel: 300 } as const;

export interface ChestRoll {
  floor: number;
  tier: number;
  steps: number;
}

/**
 * Roll a chest from `floor` (0 wood … 4 lintel). `pity` is advanced and reset in place. `r` gives uniform
 * [0, 1) numbers. Pure apart from the pity object.
 */
export function rollChest(floor: number, pity: { crystal: number; reliquary: number; lintel: number }, r: () => number, pityOn = true): ChestRoll {
  let tier = Math.max(0, Math.min(4, floor));
  let steps = 0;
  while (tier < 4 && steps < 4) {
    if (r() < STEP_ODDS[tier]) {
      tier++;
      steps++;
    } else break;
  }
  if (pityOn) {
    pity.crystal++;
    pity.reliquary++;
    pity.lintel++;
    if (pity.lintel >= PITY.lintel && tier < 4) tier = 4;
    else if (pity.reliquary >= PITY.reliquary && tier < 3) tier = 3;
    else if (pity.crystal >= PITY.crystal && tier < 2) tier = 2;
    if (tier >= 2) pity.crystal = 0;
    if (tier >= 3) pity.reliquary = 0;
    if (tier >= 4) pity.lintel = 0;
    steps = tier - Math.max(0, Math.min(4, floor));
  }
  return { floor, tier, steps };
}

/** Open a chest now: roll, credit its gold and gems, emit chest:open. `scripted` forces at least one step (the tutorial's Wood → Copper). */
export function openChest(s: IdleState, id: string, floor: number, source: string, bus?: IdleBus, scripted = false): ChestRoll {
  const roll = rollChest(floor, s.meta.pity, () => rand(s));
  if (scripted && roll.tier < 1) {
    roll.tier = 1;
    roll.steps = 1 - floor;
  }
  const goldL = s.rates.goldPerSec.log10() + Math.log10(CHEST_GOLD_S[roll.tier]);
  const gold = Number.isFinite(goldL) ? Big.fromLog10(goldL) : Big.from(5 + 5 * roll.tier);
  s.run.gold.addIn(gold);
  s.run.goldEarned.addIn(gold);
  s.meta.lifetime.gold.addIn(gold);
  const [g0, g1] = CHEST_GEMS[roll.tier];
  const gems = g0 + Math.floor(rand(s) * (g1 - g0 + 1));
  s.meta.gems += gems;
  s.meta.stats.chests++;
  if (roll.tier > s.meta.records.bestChest) s.meta.records.bestChest = roll.tier;
  bus?.emit('chest:open', { id, floor: CHEST_TIERS[floor], tier: CHEST_TIERS[roll.tier], steps: roll.steps, gold: gold.clone(), gems, source });
  bus?.emit('gold:gain', { amount: gold.clone(), source: 'chest', col: -1, depth: s.run.depth });
  if (gems > 0) bus?.emit('gems:gain', { amount: gems, source: 'chest', col: -1, depth: s.run.depth });
  return roll;
}

/** Open the next chest on the rack (one tap each on return). */
export function openRack(s: IdleState, bus?: IdleBus): boolean {
  const floor = s.run.rack.shift();
  if (floor === undefined) return false;
  openChest(s, `rack:${s.nextId++}`, floor, 'rack', bus);
  bus?.emit('chest:rack', { count: s.run.rack.length });
  return true;
}
