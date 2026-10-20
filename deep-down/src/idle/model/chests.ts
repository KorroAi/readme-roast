// Chests (SPEC §5.8): an instant, honest roll-up from the floor tier (each step one roll: Wood → Copper 40 %, Copper →
// Crystal 30 %, Crystal → Reliquary 20 %, Reliquary → Lintel 10 %; up to 4 steps), pity gauges (Crystal+ within 12,
// Reliquary+ within 40, Lintel within 300), contents in seconds of income and gems, and the extras: Copper 15 % +5 free
// levels on an owned crew line; Crystal a Find roll (new 60 %) and a free facet reroll; Reliquary a relic Find (or 5
// levels on an owned one); Lintel a relic Find, a cosmetic, a Time Crystal and a 20 s Lantern Storm (everything ×10).
// The animation always lands on the true result: `path` lists exactly the tiers it passes.

import { Big } from '../../core/big';
import type { ChestTier, IdleBus } from '../bus';
import { AUTHORED_BIOMES, baseBiome, biomeAt } from '../config/biomes';
import { CODEX } from '../config/codex';
import { XP } from '../config/rank';
import { awardFind, rollFind } from './codex';
import { addStoredRerolls, facetStats } from './facets';
import { addXp, chestGoldLog10, creditGems, creditGold } from './gain';
import { hasPerk, invalidateMults, mults } from './mult';
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
/** Extras (SPEC §5.8). */
export const EXTRAS = { copperLevelsP: 0.15, levels: 5, stormSeconds: 20, stormX: 10 } as const;

export interface ChestRoll {
  floor: number;
  tier: number;
  steps: number;
}

/**
 * Roll a chest from `floor` (0 wood … 4 lintel). `pity` is advanced and reset in place. `r` gives uniform [0, 1)
 * numbers; `stepAdd` raises every step's odds (Four-Leaf, the Lucky Lamp perk). Pure apart from the pity object.
 */
export function rollChest(floor: number, pity: { crystal: number; reliquary: number; lintel: number }, r: () => number, pityOn = true, stepAdd = 0): ChestRoll {
  let tier = Math.max(0, Math.min(4, floor));
  let steps = 0;
  while (tier < 4 && steps < 4) {
    if (r() < STEP_ODDS[tier] + stepAdd) {
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

/** A seeded xorshift32 for pure rolls (the contract form: `rollChestSeeded(seed, floor, pity)`). */
export function seededRandom(seed: number): () => number {
  let x = seed >>> 0 || 0x9e3779b9;
  return () => {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    return (x >>> 0) / 4294967296;
  };
}

/** The contract form (BUILD §3.1): roll from a seed; returns the step list floor → result (pity copied, not mutated). */
export function rollChestSeeded(seed: number, floor: number, pity: { crystal: number; reliquary: number; lintel: number }): { roll: ChestRoll; path: ChestTier[]; pity: { crystal: number; reliquary: number; lintel: number } } {
  const p = { ...pity };
  const roll = rollChest(floor, p, seededRandom(seed));
  return { roll, path: chestPath(roll), pity: p };
}

/** The tiers a roll passes, floor first. */
export function chestPath(roll: ChestRoll): ChestTier[] {
  const out: ChestTier[] = [];
  for (let t = roll.floor; t <= roll.tier; t++) out.push(CHEST_TIERS[t]);
  return out;
}

/** The pity gauges for the chest info card (0..1 each; > 0.8 puts a violet "!" on the next chest). */
export function pityGauges(s: IdleState): { crystal: number; reliquary: number; lintel: number } {
  const p = s.meta.pity;
  return { crystal: p.crystal / PITY.crystal, reliquary: p.reliquary / PITY.reliquary, lintel: p.lintel / PITY.lintel };
}

/**
 * Open a chest now: roll, credit its gold, gems and extras, emit chest:open. `scripted` forces at least one step (the
 * tutorial's Wood → Copper). Facets raise the floor (Fortune 4) and every 10th chest of the run (Fortune 6).
 */
export function openChest(s: IdleState, id: string, floor: number, source: string, bus?: IdleBus, scripted = false): ChestRoll {
  const fs = facetStats(s);
  let f = Math.max(0, Math.min(4, floor + fs.chestFloorUp));
  s.run.chests++;
  if (fs.tenthReliquary && s.run.chests % 10 === 0) f = Math.max(f, 3);
  const m = mults(s);
  const roll = rollChest(f, s.meta.pity, () => rand(s), true, m.chestStep);
  roll.floor = Math.max(0, Math.min(4, floor));
  roll.steps = roll.tier - roll.floor;
  if (scripted && roll.tier < 1) {
    roll.tier = 1;
    roll.steps = 1 - roll.floor;
  }
  let goldSecs = CHEST_GOLD_S[roll.tier] * m.chestGold;
  const extras: string[] = [];
  if (hasPerk(s, 'lockpick')) {
    goldSecs *= 1.5;
    extras.push('card');
  }
  const goldL = chestGoldLog10(s, goldSecs, source);
  const gold = Number.isFinite(goldL) ? Big.fromLog10(goldL) : Big.from(5 + 5 * roll.tier);
  const [g0, g1] = CHEST_GEMS[roll.tier];
  const gems = g0 + Math.floor(rand(s) * (g1 - g0 + 1));
  // Extras.
  const page = Math.max(0, Math.min(AUTHORED_BIOMES - 1, baseBiome(biomeAt(s.run.depth))));
  if (roll.tier === 1 && rand(s) < EXTRAS.copperLevelsP) {
    const line = freeLevels(s);
    if (line >= 0) extras.push(`levels:${line}:${EXTRAS.levels}`);
  }
  if (roll.tier === 2) {
    const id2 = rollFind(s, rand(s) < 0.5 ? 'rare' : 'fossil', page, bus, 1, rand(s) < CODEX.chestNew);
    if (id2) extras.push(`find:${id2}`);
    addStoredRerolls(s, 1);
    extras.push('reroll:1');
  }
  if (roll.tier >= 3) {
    const relic = `find:${page}:${5}`;
    if ((s.meta.finds[relic] ?? 0) > 0 && roll.tier === 3) {
      awardFind(s, relic, bus);
      extras.push(`findLevel:${relic}`);
    } else {
      awardFind(s, roll.tier === 4 ? `find:${page}:4` : relic, bus);
      extras.push(`find:${roll.tier === 4 ? `find:${page}:4` : relic}`);
    }
  }
  if (roll.tier === 4) {
    const cos = `flame.lintel${s.meta.stats.lintels % 4}`;
    if (!s.meta.cosmetics.owned.includes(cos)) s.meta.cosmetics.owned.push(cos);
    extras.push(`cosmetic:${cos}`);
    s.meta.timeCrystals++;
    extras.push('crystal:1');
    s.run.boosts.storm = { end: s.time + EXTRAS.stormSeconds, mult: EXTRAS.stormX };
    invalidateMults(s);
    extras.push(`storm:${EXTRAS.stormSeconds}`);
    bus?.emit('boost:start', { id: 'storm', until: s.time + EXTRAS.stormSeconds, mult: EXTRAS.stormX });
  }
  creditGold(s, gold, 'chest', bus);
  if (gems > 0) s.meta.gems += gems;
  s.meta.stats.chests++;
  if (roll.tier >= 2) s.meta.stats.crystalPlus++;
  if (roll.tier >= 3) s.meta.stats.reliquaryPlus++;
  if (roll.tier >= 4) s.meta.stats.lintels++;
  if (roll.tier > s.meta.records.bestChest) {
    const old = s.meta.records.bestChest;
    s.meta.records.bestChest = roll.tier;
    if (old >= 1) bus?.emit('record:new', { id: 'bestChest', value: roll.tier, old });
  }
  addXp(s, XP.chest[roll.tier]);
  s.meta.lastUsed.chest = s.playTime;
  s.director.lastBeat = s.time;
  s.director.lastFind = s.time;
  bus?.emit('chest:open', { id, floor: CHEST_TIERS[roll.floor], tier: CHEST_TIERS[roll.tier], steps: roll.steps, gold: gold.clone(), gems, source, path: chestPath(roll), extras });
  if (gems > 0) bus?.emit('gems:gain', { amount: gems, source: 'chest', col: -1, depth: s.run.depth });
  // Second Look: 10 % a double chest.
  if (fs.doubleChest > 0 && source !== 'double' && rand(s) < fs.doubleChest) openChest(s, `${id}:2`, floor, 'double', bus);
  return roll;
}

/** +5 free levels on a random owned crew line (the Copper extra). @returns the line (−1 none owned). */
function freeLevels(s: IdleState): number {
  const owned: number[] = [];
  for (let i = 0; i < s.run.lines.length; i++) if (s.run.lines[i] > 0) owned.push(i);
  if (!owned.length) return -1;
  const i = owned[Math.floor(rand(s) * owned.length)];
  s.run.lines[i] += EXTRAS.levels;
  return i;
}

/** Open the next chest on the rack (one tap each on return). */
export function openRack(s: IdleState, bus?: IdleBus): boolean {
  const floor = s.run.rack.shift();
  if (floor === undefined) return false;
  openChest(s, `rack:${s.nextId++}`, floor, 'rack', bus);
  bus?.emit('chest:rack', { count: s.run.rack.length });
  return true;
}

/** Give a chest to the rack (offline, analytic rows): 10 hold, the rest become ~30 s of income. @returns true when racked. */
export function rackChest(s: IdleState, floor: number, bus?: IdleBus): boolean {
  if (s.run.rack.length < 10) {
    s.run.rack.push(floor);
    bus?.emit('chest:rack', { count: s.run.rack.length });
    return true;
  }
  creditGold(s, Big.fromLog10(chestGoldLog10(s, 30)), 'chest', bus);
  creditGems(s, 0, 'chest', bus);
  return false;
}
