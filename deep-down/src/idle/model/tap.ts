// What one tap does (SPEC §3.2), in order: combo, base, the pick's edge × crew DPS, crit, combo
// multiplier, the Surge, skills (hooks), apply to the target, pierce, splash, meters. Pure; the RNG is
// the state's seeded xorshift so a replay is exact. Holds give half combo and half Surge meter
// (CRITIQUE MUST 1). The input layer (C's TapSurface) already applied the 8/s cap; `kind` says how the
// hit was made.

import { Big } from '../../core/big';
import type { HitSource, IdleBus } from '../bus';
import { COMBO, CRIT, SURGE, pickTier, pierceOf, shockwave } from '../config/upgrades';
import { comboMult, critChance, surgeDuration, tapBaseLog10 } from './run';
import { applyHit, rowAt, targetCell } from './shaft';
import { hitSeal } from './seals';
import { CELL, COLS, type CellKind, type IdleState } from './state';

const L10 = Math.log10;

export type TapKind = 'tap' | 'hold' | 'swipe' | 'key';

/** One counted input for the model. `col` −1 with an `entity` id for entity taps (chests, the moth). */
export interface ModelTap {
  col: number;
  kind: TapKind;
  entity?: string;
}

/** xorshift32 on the state (crits, rolls). */
export function rand(s: IdleState): number {
  let x = s.tap.rng | 0 || 0x1234567;
  x ^= x << 13;
  x ^= x >>> 17;
  x ^= x << 5;
  s.tap.rng = x >>> 0;
  return (x >>> 0) / 4294967296;
}

/** The result of one tap (shared object; copy what you keep). */
export interface TapResult {
  col: number;
  depth: number;
  dmgLog10: number;
  crit: boolean;
  combo: number;
  cells: number;
  chain: number;
  seal: boolean;
  /** The kind of the first cell hit. */
  kind: CellKind;
}

const OUT: TapResult = { col: 0, depth: 0, dmgLog10: -Infinity, crit: false, combo: 0, cells: 0, chain: 0, seal: false, kind: CELL.ROCK };

/** Hooks other systems add to a tap (W2: facets, Cataclysm; the Moth Frenzy is in run.skillMultLog10). */
export interface TapHooks {
  /** Extra log10 multiplier on D (skills, facets). */
  dmgLog10?: (s: IdleState) => number;
  /** Extra crit chance and crit multiplier (facets). */
  critBonus?: (s: IdleState) => { p: number; x: number };
}

export const tapHooks: TapHooks = {};

/** Resolve one counted hit on column `col` (SPEC §3.2). */
export function resolveTap(s: IdleState, col: number, kind: TapKind, bus?: IdleBus): TapResult {
  const r = OUT;
  const t = s.time;
  const hold = kind === 'hold';
  // 1. Combo.
  if (t - s.tap.lastHit <= COMBO.window || s.tap.combo === 0) s.tap.combo += hold ? COMBO.holdGain : 1;
  else s.tap.combo = hold ? COMBO.holdGain : 1;
  s.tap.lastHit = t;
  s.tap.decayAt = t + COMBO.decayAfter;
  s.hints.lastHitAt = t;
  // 2–3. Base: the pick and its edge × crew DPS.
  let d = tapBaseLog10(s);
  // 4. Crit.
  const bonus = tapHooks.critBonus?.(s);
  const p = Math.min(0.95, critChance(s) + (bonus?.p ?? 0));
  const crit = rand(s) < p;
  if (crit) d += L10(CRIT.mult + (bonus?.x ?? 0));
  // 5. Combo.
  d += L10(comboMult(s.tap.combo));
  // 6. Surge.
  const surge = s.tap.surgeEnd > t;
  if (surge) d += L10(SURGE.mult);
  // 7. Skills and facets (hooks).
  if (tapHooks.dmgLog10) d += tapHooks.dmgLog10(s);
  r.dmgLog10 = d;
  r.crit = crit;
  r.combo = s.tap.combo;
  r.cells = 0;
  r.chain = 0;
  r.seal = false;
  const source: HitSource = kind;
  // 8. Apply: the seal takes every hit while it holds the floor.
  const floor = s.shaft.rows[0];
  if (floor.kinds[0] === CELL.SEAL) {
    r.seal = true;
    r.kind = CELL.SEAL;
    r.col = Math.max(0, Math.min(COLS - 1, col));
    r.depth = floor.depth;
    hitSeal(s, d, false, bus);
  } else {
    const tgt = targetCell(s, col);
    if (tgt) {
      r.col = tgt.col;
      r.depth = tgt.depth;
      r.kind = (rowAt(s, tgt.depth)?.kinds[tgt.col] ?? CELL.ROCK) as CellKind;
      const tier = pickTier(s.run.pick);
      const res = applyHit(s, tgt.col, tgt.depth, d, { source, crit, pierce: pierceOf(tier) }, bus);
      r.cells = res.cells;
      r.chain = res.chain;
      // 10. Shockwave: splash × D to side neighbours in the floor row (on top of D).
      const sw = shockwave(s.run.ups.shock ?? 0);
      if (sw.reach > 0 && sw.frac > 0) {
        const fl = s.shaft.rows[0];
        for (let k = 1; k <= sw.reach; k++) {
          for (const c of [tgt.col - k, tgt.col + k]) {
            if (c < 0 || c >= COLS) continue;
            const row = rowAt(s, fl.depth);
            if (!row || row.left[c] <= 0) continue;
            const sres = applyHit(s, c, row.depth, d + L10(sw.frac), { source: 'splash', crit: false, pierce: 1, rowLimit: 1 }, bus);
            r.cells += sres.cells;
          }
        }
      }
    } else {
      r.col = col;
      r.depth = floor.depth;
      r.kind = CELL.AIR;
    }
  }
  // 11. Meters.
  const gain = (crit ? SURGE.perCrit : SURGE.perHit) * (hold ? SURGE.holdFactor : 1);
  if (!surge) addSurge(s, gain, bus);
  s.meta.stats.taps++;
  if (crit) s.meta.stats.crits++;
  if (s.tap.combo > s.meta.records.bestCombo) s.meta.records.bestCombo = Math.floor(s.tap.combo);
  if (r.cells > s.meta.records.bestTapCells) s.meta.records.bestTapCells = r.cells;
  comboTiers(s, bus);
  bus?.emit('tap:hit', {
    col: r.col, depth: r.depth, kind: r.kind, source, dmg: Big.fromLog10(d), crit,
    combo: s.tap.combo, comboMult: comboMult(s.tap.combo), cells: r.cells, chain: r.chain, surge,
  });
  return r;
}

/** Fill the Surge meter; a full meter fires the Surge (CRITIQUE SHOULD 1's wait is a W2 hook). */
export function addSurge(s: IdleState, amount: number, bus?: IdleBus): void {
  if (!s.meta.revealed.includes('surge')) return;
  const before = s.tap.surge;
  s.tap.surge = Math.min(SURGE.meterMax, s.tap.surge + amount);
  const q0 = Math.floor((before / SURGE.meterMax) * 4);
  const q1 = Math.floor((s.tap.surge / SURGE.meterMax) * 4);
  if (q1 !== q0) bus?.emit('surge:meter', { fill: s.tap.surge / SURGE.meterMax });
  if (s.tap.surge >= SURGE.meterMax) startSurge(s, false, bus);
}

export function startSurge(s: IdleState, scripted: boolean, bus?: IdleBus): void {
  const dur = surgeDuration(s);
  s.tap.surge = 0;
  s.tap.surgeEnd = s.time + dur;
  if (!s.meta.firstTime.includes('used:surge')) s.meta.firstTime.push('used:surge');
  bus?.emit('surge:start', { duration: dur, scripted });
}

/** Combo tier events (10, 25, 50, then 100, 250…). */
function comboTiers(s: IdleState, bus?: IdleBus): void {
  const c = s.tap.combo;
  for (const tier of COMBO.tiers) {
    if (c >= tier && s.tap.tierShown < tier) {
      s.tap.tierShown = tier;
      bus?.emit('combo:tier', { tier, combo: Math.floor(c) });
    }
  }
}

/** Combo decay (SPEC §3.4): after 1.2 s without a hit it falls by 5 every 0.5 s; frozen during a Surge. */
export function tickCombo(s: IdleState, bus?: IdleBus): void {
  const t = s.time;
  if (s.tap.surgeEnd > t) {
    s.tap.decayAt = t + COMBO.decayAfter;
    return;
  }
  if (s.tap.combo > 0 && t >= s.tap.decayAt) {
    const before = s.tap.combo;
    s.tap.combo = Math.max(0, s.tap.combo - COMBO.decayStep);
    s.tap.decayAt = t + COMBO.decayEvery;
    if (s.tap.combo === 0) {
      if (before >= 10 || s.tap.tierShown >= 10) bus?.emit('combo:lost', { combo: Math.floor(Math.max(before, s.tap.tierShown)) });
      s.tap.tierShown = 0;
    } else {
      // Tiers re-arm once the combo falls below them.
      let shown = 0;
      for (const tier of COMBO.tiers) if (s.tap.combo >= tier) shown = tier;
      s.tap.tierShown = shown;
    }
  }
}
