// What one tap does (SPEC §3.2), in order: combo, base, the pick's edge × crew DPS, crit, combo
// multiplier, the Surge, skills (hooks), apply to the target, pierce, splash, meters. Pure; the RNG is
// the state's seeded xorshift so a replay is exact. Holds give half combo and half Surge meter
// (CRITIQUE MUST 1). The input layer (C's TapSurface) already applied the 8/s cap; `kind` says how the
// hit was made.

import { Big } from '../../core/big';
import type { HitSource, IdleBus } from '../bus';
import { COMBO, SURGE, pickTier, pierceOf, shockwave } from '../config/upgrades';
import { facetStats } from './facets';
import { flagSecret } from './feats';
import { comboLostHint } from './hints';
import { comboCap, comboMult, comboWindow, critChance, critMult, surgeDuration, surgeMult, tapBaseLog10 } from './run';
import { applyHit, cellHpLog10, rowAt, targetCell } from './shaft';
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
  const fs = facetStats(s);
  const build = fs.comboBuild;
  // 1. Combo (Tempo widens the window; Rhythm 2 builds ×2; Rhythm 6 never drops below 25).
  if (t - s.tap.lastHit <= comboWindow(s) || s.tap.combo === 0) s.tap.combo += (hold ? COMBO.holdGain : 1) * build;
  else s.tap.combo = Math.max(fs.comboFloor, (hold ? COMBO.holdGain : 1) * build);
  s.tap.lastHit = t;
  s.tap.decayAt = t + COMBO.decayAfter;
  s.hints.lastHitAt = t;
  s.run.taps++;
  const nth = s.run.taps;
  if (s.tap.combo > s.tap.peak) s.tap.peak = s.tap.combo;
  // 2–3. Base: the pick and its edge × crew DPS.
  let d = tapBaseLog10(s);
  // 4. Crit (Static: every Nth tap crits; Golden Touch: every 10th tap is a ×20 crit; Spark 6: mega crits ×10).
  const bonus = tapHooks.critBonus?.(s);
  const p = Math.min(0.95, critChance(s) + (bonus?.p ?? 0));
  const golden = !!s.run.boosts.goldenTouch && s.run.boosts.goldenTouch.end > t && nth % 10 === 0;
  const crit = rand(s) < p || (fs.staticEvery > 0 && nth % fs.staticEvery === 0) || golden;
  let mega = false;
  if (crit) {
    mega = fs.megaCrit > 0 && rand(s) < fs.megaCrit;
    d += L10(golden ? 20 : mega ? 10 : critMult(s) + (bonus?.x ?? 0));
  }
  // 5. Combo.
  d += L10(comboMult(s.tap.combo, comboCap(s)));
  // 6. Surge (and a Lintel chest's Lantern Storm: taps ×10 for 20 s — your lantern's storm, not the crew's).
  const surge = s.tap.surgeEnd > t;
  if (surge) d += L10(surgeMult(s));
  const storm = s.run.boosts.storm;
  if (storm && storm.end > t) d += L10(storm.mult);
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
      const goldL = crit && fs.critGoldX > 1 ? L10(fs.critGoldX) : 0;
      const floorDepth = s.run.depth;
      const firstHp = cellHpLog10(r.kind, tgt.depth) + L10(Math.max(1e-15, rowAt(s, tgt.depth)?.left[tgt.col] ?? 1));
      const res = applyHit(s, tgt.col, tgt.depth, d, { source, crit, pierce: pierceOf(tier), goldLog10: goldL }, bus);
      r.cells = res.cells;
      r.chain = res.chain;
      // Secrets: Overkill (one hit of 1,000× the cell's HP), Clean Sweep (one tap clears a row).
      if (d - firstHp >= 3) flagSecret(s, 'overkill');
      if (s.run.depth > floorDepth && res.cells >= 7) flagSecret(s, 'cleanSweep');
      // 10. Shockwave: splash × D to side neighbours in the floor row (on top of D); Wide Swing and Quake 2 widen it.
      const lvl = s.run.ups.shock ?? 0;
      const sw = shockwave(lvl > 0 ? lvl : fs.shockAdd > 0 ? 1 : 0);
      const frac = (lvl > 0 ? sw.frac + fs.shockAdd : fs.shockAdd) * fs.areaX;
      if (sw.reach > 0 && frac > 0) r.cells += splash(s, tgt.col, sw.reach, d + L10(Math.min(1, frac)), bus);
      // Facet blasts (each on top of D): Split Spark and Spark 4, Thunderclap, Charge Pack, Fault Line, Rolling Thunder,
      // Aftershock. Total damage stays conserved inside each blast (applyHit).
      // A blast's factor is its TOTAL over the cells it reaches (a 3×3 blast at ×5 deals 5 × D, shared by its cells), so
      // the facets add a fixed share of damage however wide they reach.
      if (crit && fs.critSplashCells > 0) r.cells += splash(s, tgt.col, fs.critSplashCells, d + L10(fs.critSplash * fs.areaX / (2 * fs.critSplashCells)), bus);
      if (crit && (fs.critBlast > 0 || mega)) r.cells += blast(s, tgt.col, fs.blastRadius, d + L10((mega ? 1 : fs.critBlast) * fs.areaX), bus, true);
      if (fs.chargeEvery > 0 && nth % fs.chargeEvery === 0) r.cells += blast(s, tgt.col, fs.blastRadius, d + L10(5 * fs.blastX * fs.areaX), bus, true);
      if (fs.faultEvery > 0 && nth % fs.faultEvery === 0) r.cells += splash(s, tgt.col, 6, d + L10((0.5 * fs.blastX * fs.areaX) / 6), bus);
      if (fs.rollingThunder > 0 && s.tap.combo >= 50 && nth % fs.rollingThunder === 0) r.cells += splash(s, tgt.col, 6, d + L10(fs.blastX / 6), bus);
      if (fs.aftershock > 0 && res.cells > 0) r.cells += splash(s, tgt.col, 1, cellHpLog10(r.kind, tgt.depth) + L10(fs.aftershock * res.cells * fs.areaX), bus);
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
  if (s.tap.combo > s.meta.records.bestCombo) {
    const old = s.meta.records.bestCombo;
    s.meta.records.bestCombo = Math.floor(s.tap.combo);
    if (old >= 10 && Math.floor(s.tap.combo) % 10 === 0) bus?.emit('record:new', { id: 'bestCombo', value: s.meta.records.bestCombo, old });
  }
  if (r.cells > s.meta.records.bestTapCells) s.meta.records.bestTapCells = r.cells;
  if (d > s.meta.records.bestHit.log10()) s.meta.records.bestHit.setLog10(d);
  s.meta.lastUsed.tap = s.playTime;
  if (crit) s.meta.lastUsed.crit = s.playTime;
  if (s.tap.combo >= 25) s.meta.lastUsed.combo = s.playTime;
  comboTiers(s, bus);
  bus?.emit('tap:hit', {
    col: r.col, depth: r.depth, kind: r.kind, source, dmg: Big.fromLog10(d), crit,
    combo: s.tap.combo, comboMult: comboMult(s.tap.combo), cells: r.cells, chain: r.chain, surge,
  });
  return r;
}

/**
 * Fill the Surge meter. A full meter waits up to 8 s for a tap on the ring (`fireSurge`), then fires by itself
 * (CRITIQUE SHOULD 1: the player may save it for a Warden or an event). The very first Surge fires at once.
 */
export function addSurge(s: IdleState, amount: number, bus?: IdleBus): void {
  if (!s.meta.revealed.includes('surge')) return;
  if (s.tap.surgeArmedAt > 0) return;
  const before = s.tap.surge;
  s.tap.surge = Math.min(SURGE.meterMax, s.tap.surge + amount);
  const q0 = Math.floor((before / SURGE.meterMax) * 4);
  const q1 = Math.floor((s.tap.surge / SURGE.meterMax) * 4);
  if (q1 !== q0) bus?.emit('surge:meter', { fill: s.tap.surge / SURGE.meterMax });
  if (s.tap.surge >= SURGE.meterMax) {
    if (!s.meta.firstTime.includes('used:surge')) startSurge(s, false, bus);
    else {
      s.tap.surgeArmedAt = s.time;
      bus?.emit('surge:armed', { until: s.time + SURGE_WAIT });
    }
  }
}

/** Seconds a full meter waits for a tap on the ring. */
export const SURGE_WAIT = 8;

/** A tap on the Surge ring: fire the armed Surge now. @returns false when the meter is not full. */
export function fireSurge(s: IdleState, bus?: IdleBus): boolean {
  if (s.tap.surgeArmedAt <= 0 || s.tap.surgeEnd > s.time) return false;
  startSurge(s, false, bus);
  return true;
}

/** An armed Surge fires by itself after the wait. */
export function tickSurge(s: IdleState, bus?: IdleBus): void {
  if (s.tap.surgeArmedAt > 0 && s.time - s.tap.surgeArmedAt >= SURGE_WAIT) startSurge(s, false, bus);
}

export function startSurge(s: IdleState, scripted: boolean, bus?: IdleBus): void {
  const dur = surgeDuration(s);
  s.tap.surge = 0;
  s.tap.surgeArmedAt = 0;
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
  const hold = s.run.boosts.comboHold;
  if (s.tap.surgeEnd > t || (hold && hold.end > t)) {
    s.tap.decayAt = t + COMBO.decayAfter;
    return;
  }
  if (s.tap.combo > 0 && t >= s.tap.decayAt) {
    const before = s.tap.combo;
    const floor = Math.min(before, facetStats(s).comboFloor);
    s.tap.combo = Math.max(floor, s.tap.combo - COMBO.decayStep);
    if (s.tap.combo === floor && floor > 0) {
      s.tap.decayAt = t + COMBO.decayEvery;
      return;
    }
    s.tap.decayAt = t + COMBO.decayEvery;
    if (s.tap.combo === 0) {
      if (before >= 10 || s.tap.tierShown >= 10) bus?.emit('combo:lost', { combo: Math.floor(Math.max(before, s.tap.tierShown)) });
      comboLostHint(s, s.tap.peak, bus);
      s.tap.peak = 0;
      s.tap.tierShown = 0;
    } else {
      // Tiers re-arm once the combo falls below them.
      let shown = 0;
      for (const tier of COMBO.tiers) if (s.tap.combo >= tier) shown = tier;
      s.tap.tierShown = shown;
    }
  }
}

/** Splash `dmgLog10` to the floor-row neighbours within `reach` of `col` (each its own hit). @returns cells broken. */
function splash(s: IdleState, col: number, reach: number, dmgLog10: number, bus?: IdleBus): number {
  let n = 0;
  for (let k = 1; k <= reach; k++) {
    for (const c of [col - k, col + k]) {
      if (c < 0 || c >= COLS) continue;
      const row = s.shaft.rows[0];
      if (!row || row.left[c] <= 0 || row.kinds[c] === CELL.SEAL) continue;
      n += applyHit(s, c, row.depth, dmgLog10, { source: 'splash', crit: false, pierce: 1, rowLimit: 1 }, bus).cells;
    }
  }
  return n;
}

/** A blast of radius `rad` around (col, floor): the floor row and the rows below (3×3 at radius 1). */
function blast(s: IdleState, col: number, rad: number, dmgLog10: number, bus?: IdleBus, shared = false): number {
  let n = 0;
  const d0 = s.run.depth;
  if (shared) dmgLog10 -= L10((rad + 1) * (2 * rad + 1));
  for (let dy = 0; dy <= rad; dy++) {
    for (let dx = -rad; dx <= rad; dx++) {
      const c = col + dx;
      if (c < 0 || c >= COLS) continue;
      const row = rowAt(s, d0 + dy);
      if (!row || row.left[c] <= 0 || row.kinds[c] === CELL.SEAL) continue;
      n += applyHit(s, c, row.depth, dmgLog10, { source: 'splash', crit: false, pierce: 1, rowLimit: 1 }, bus).cells;
    }
  }
  return n;
}
