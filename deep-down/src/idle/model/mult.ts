// The W2 side of the multiplier stack (SPEC §5.6): Finds, the Bestiary, Marks, Rank, Biome Seals, facets, boosts and
// Feat perks, folded into a few logs the formulas in run.ts and shaft.ts read. Groups multiply; inside a group bonuses
// add. Embers, planted lanterns and Lantern Oil stay in run.ts's mAllLog10. Cached per model instant (the formulas
// call it hundreds of times a step); systems that change a bonus call `invalidateMults`.

import { CODEX, bestiaryTier, findDef } from '../config/codex';
import { RANK_POWER } from '../config/rank';
import { facetStats } from './facets';
import type { IdleState } from './state';

const L10 = Math.log10;

export interface Mults {
  /** On all damage (crew and taps). */
  power: number;
  /** On the crew only, and on the pick's own term only. */
  crew: number;
  pick: number;
  /** On gold. */
  gold: number;
  /** Crit chance points and the crit multiplier's add. */
  critP: number;
  critX: number;
  /** Chest gold ×, chest step points, offline efficiency points. */
  chestGold: number;
  chestStep: number;
  offline: number;
  /** Combo window (s) and cap adds. */
  comboWindow: number;
  comboCap: number;
  /** Upgrade cost multiplier (Tinkerer X: −5 %). */
  cost: number;
}

const cache = new WeakMap<IdleState, { t: number; v: number; m: Mults }>();
const version = new WeakMap<IdleState, number>();

/** Drop the cache (a Find, a Mark, a rank, a facet, a perk changed). */
export function invalidateMults(s: IdleState): void {
  version.set(s, (version.get(s) ?? 0) + 1);
}

/** True when a Feat family's tier X perk is on. */
export function hasPerk(s: IdleState, family: string): boolean {
  return (s.meta.feats[family] ?? 0) >= 10;
}

/** Calibration knob (tools only; the game never writes it): false turns every side multiplier off. */
export const SIDE = { on: true };

const NONE: Mults = { power: 0, crew: 0, pick: 0, gold: 0, critP: 0, critX: 0, chestGold: 1, chestStep: 0, offline: 0, comboWindow: 0, comboCap: 0, cost: 0 };

/** The multipliers now. */
export function mults(s: IdleState): Mults {
  if (!SIDE.on) return NONE;
  const v = version.get(s) ?? 0;
  const c = cache.get(s);
  if (c && c.t === s.time && c.v === v) return c.m;
  const m = compute(s);
  cache.set(s, { t: s.time, v, m });
  return m;
}

function compute(s: IdleState): Mults {
  const meta = s.meta;
  // Finds: +3 % (+1 % per duplicate level) to one stat each.
  let fCrew = 0, fTap = 0, fGold = 0, fCrit = 0, fOff = 0, fChest = 0;
  let entries = 0;
  for (const id in meta.finds) {
    const lv = meta.finds[id];
    if (lv <= 0) continue;
    entries++;
    const d = findDef(id);
    if (!d) continue;
    const b = CODEX.findBase + CODEX.findPerLevel * (lv - 1);
    if (d.stat === 'crew') fCrew += b;
    else if (d.stat === 'taps') fTap += b;
    else if (d.stat === 'gold') fGold += b;
    else if (d.stat === 'crit') fCrit += b;
    else if (d.stat === 'offline') fOff += b;
    else fChest += b;
  }
  // The Bestiary: each catch tier +2 % gold, per species.
  let best = 0;
  for (const id in meta.bestiary) {
    const n = meta.bestiary[id];
    if (n > 0) {
      entries++;
      best += CODEX.bestiaryPerTier * bestiaryTier(n);
    }
  }
  entries += meta.lore.length;
  const seals = meta.biomeSeals.length;
  const marks = meta.marks;
  const rank = Math.max(1, meta.rank.r);
  let power = L10(1 + 0.01 * marks) + L10(1 + RANK_POWER * (rank - 1)) + L10(1 + CODEX.biomeSealPower * seals);
  if (hasPerk(s, 'collector')) power += L10(1 + 0.005 * entries);
  let gold = L10(1 + fGold) + L10(1 + best) + L10(1 + 0.01 * marks) + L10(1 + CODEX.biomeSealGold * seals);
  if (hasPerk(s, 'demesure')) gold += L10(2);
  if (hasPerk(s, 'starwright')) gold += L10(1 + 0.01 * s.run.stars);
  let crew = L10(1 + fCrew);
  if (hasPerk(s, 'foreman')) crew += L10(1.5);
  const pick = L10(1 + fTap);
  // Facets.
  const fs = facetStats(s);
  let hired = 0;
  for (const lv of s.run.lines) if (lv > 0) hired++;
  let fCrewAdd = fs.crewAdd + fs.unionPer * hired;
  if (fs.workSong > 0) fCrewAdd += Math.min(fs.workSong, 0.01 * Math.floor(s.tap.combo / 2));
  crew += L10(1 + fCrewAdd) + L10(fs.crewX);
  gold += L10(1 + fs.goldAdd) + L10(fs.goldX);
  // Boosts on the run (Supply Rope, a Lantern Storm).
  const b = s.run.boosts;
  const t = s.time;
  if (b.crew2 && b.crew2.end > t) crew += L10(2);
  let critP = fs.critPts + (hasPerk(s, 'spark') ? 0.03 : 0);
  if (b.crit25 && b.crit25.end > t) critP += 0.25;
  return {
    power,
    crew,
    pick,
    gold,
    critP,
    critX: fs.critMultAdd + 5 * fCrit,
    chestGold: 1 + fChest,
    chestStep: fs.chestStepPts + (hasPerk(s, 'luckyLamp') ? 0.02 : 0),
    offline: fOff + (hasPerk(s, 'overseer') ? 0.25 : 0),
    comboWindow: fs.comboWindow + (hasPerk(s, 'rhythm') ? 0.2 : 0),
    comboCap: fs.comboCap,
    cost: hasPerk(s, 'tinkerer') ? L10(0.95) : 0,
  };
}

/** The product of the side multipliers (E25): Finds, Bestiary, Marks, Rank, Biome Seals and facets, on power × gold. */
export function sideProduct(s: IdleState): number {
  const m = mults(s);
  return Math.pow(10, m.power + m.gold + Math.max(m.crew, m.pick));
}
