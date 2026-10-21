// Idle and offline (SPEC §4.2–§4.3): the crew digs while you are away, at 50 % of its DPS (75 % at 250
// Embers, 100 % at 1e5), for up to 3 h (6 h at 25 Embers, 12 h at 250). The depth is the exact closed form
// over the HP segments (κ × 7 × H per row). The crew stops at the next seal it has never opened (first
// sight is the player's, L10); the time left pays gallery gold at the stop depth. Chest cells passed go to
// the Chest Rack (10; the rest become their gold). A clock that moved back gives 0; nothing is ever taken.

import { Big } from '../../core/big';
import type { IdleBus } from '../bus';
import { biomeAt } from '../config/biomes';
import { CHEST_EVERY } from '../config/cells';
import { addLog, goldPerHp, KAPPA, rowCostLog10, rowsForWork } from '../config/curves';
import { mults } from './mult';
import { crewDpsLog10 } from './run';
import { cellHpLog10, nextSealDepth, resetWindow } from './shaft';
import { welcomeBack } from './director';
import { flagSecret } from './feats';
import { returnHints } from './hints';
import { holdSealOnReturn } from './seals';
import { CELL, COLS, type IdleState, type OfflineResult } from './state';
import { crewStopDepth, haulGoldLog10, onFrontMoved, returnToFront } from './nodes';

const L10 = Math.log10;

/** Offline starts after the app is hidden this long (s). */
export const OFFLINE_MIN_S = 30;
/** Chests the rack holds. */
export const RACK_MAX = 10;
/** A chest turned to gold is worth this many seconds of the offline income. */
export const RACK_CHEST_S = 30;

/** Efficiency of the crew while away. */
export function offlineEfficiency(s: IdleState): number {
  // Thresholds in log10 with a hair of slack: a Big holds 1e5 as 10^5, which reads back as 99999.99999… .
  const e = s.meta.embersMax.log10() + 1e-9;
  const nightShift = s.meta.loom.nightShift ?? 0;
  let eff = e >= 5 ? 1 : e >= L10(250) ? 0.75 : 0.5;
  eff = Math.min(1, eff + 0.1 * nightShift + mults(s).offline);
  return eff;
}

/** The offline cap (s). */
export function offlineCap(s: IdleState): number {
  const e = s.meta.embersMax.log10() + 1e-9;
  const nightShift = s.meta.loom.nightShift ?? 0;
  const h = e >= L10(250) ? 12 : e >= L10(25) ? 6 : 3;
  return Math.min(24, h + 2 * nightShift) * 3600;
}

/**
 * Seconds that count as away (the clock guard, SPEC §4.2 and S3): `now − savedAt`, 0 when the clock moved
 * back (below the save time or below the monotonic guard), 0 under the 30 s threshold, capped.
 */
export function awaySeconds(s: IdleState, savedAt: number, now: number, monotonicMs = s.monotonicMs): { away: number; counted: number; capped: boolean } {
  if (!Number.isFinite(now) || !Number.isFinite(savedAt) || now < savedAt || now < monotonicMs - 1000) return { away: 0, counted: 0, capped: false };
  const away = (now - savedAt) / 1000;
  if (away < OFFLINE_MIN_S) return { away, counted: 0, capped: false };
  const cap = offlineCap(s);
  return { away, counted: Math.min(away, cap), capped: away > cap };
}

/** The floor row's dug fraction (0..1) of its full cost, for the closed form's starting point. */
function floorProgress(s: IdleState): number {
  const row = s.shaft.rows[0];
  if (row.kinds[0] === CELL.SEAL) return 0;
  let full = -Infinity;
  let left = -Infinity;
  for (let c = 0; c < COLS; c++) {
    if (row.kinds[c] === CELL.AIR) continue;
    const h = cellHpLog10(row.kinds[c], row.depth);
    full = addLog(full, h);
    if (row.left[c] > 0) left = addLog(left, h + L10(row.left[c]));
  }
  if (full === -Infinity) return 0;
  return Math.max(0, Math.min(0.999, 1 - Math.pow(10, left - full)));
}

/**
 * The closed form (pure on a copy of the numbers; `apply` writes the depth and the rack into the state).
 * `dpsLog10` overrides the crew DPS (tests); `eff` the efficiency; `throughSeals` ignores L10 (debug only).
 */
export function computeOffline(
  s: IdleState,
  seconds: number,
  opts: { dpsLog10?: number; eff?: number; throughSeals?: boolean; apply?: boolean; away?: number; capped?: boolean } = {},
): OfflineResult {
  const from = s.run.depth;
  const dps = opts.dpsLog10 ?? crewDpsLog10(s);
  const eff = opts.eff ?? offlineEfficiency(s);
  const res: OfflineResult = {
    seconds, away: opts.away ?? seconds, capped: opts.capped ?? false, fromDepth: from, toDepth: from,
    goldRows: Big.zero(), goldGallery: Big.zero(), gold: Big.zero(), chests: 0, chestsGold: 0, sealBiome: -1, biomeCrossed: -1, collected: false,
    chambers: 0, glimpses: [], darkNode: -1, leashStop: false,
  };
  if (seconds <= 0 || dps === -Infinity) return res;
  const work = dps + L10(eff) + L10(seconds);
  // Start from the floor row's progress.
  const p0 = floorProgress(s);
  const w0 = p0 > 0 ? addLog(work, rowCostLog10(from) + L10(p0)) : work;
  const sealStop = opts.throughSeals ? Infinity : s.shaft.rows[0].kinds[0] === CELL.SEAL ? from : nextSealDepth(s, from);
  // The node layer's leash (SPEC §5.3): the crew stops one slice short of the (L+1)-th unseen chamber ahead.
  const leash = opts.throughSeals ? Infinity : crewStopDepth(s);
  const stop = Math.min(sealStop, leash);
  res.leashStop = leash < sealStop;
  const walk = rowsForWork(from, w0, stop);
  const to = from + walk.rows;
  res.toDepth = to;
  // Gold for the rows dug (HP / κ × gold per HP; the floor's own dug part was already paid).
  const dug = rowsForWorkGold(walk.used, p0 > 0 ? rowCostLog10(from) + L10(p0) : -Infinity);
  res.goldRows = Big.fromLog10(dug);
  // Stopped at a never-opened seal or the leash: the rest of the time pays gallery gold (the Works haul: the leftover
  // chamber value first, then the face's average gold per damage).
  if (Number.isFinite(stop) && to >= stop) {
    if (!res.leashStop) res.sealBiome = biomeAt(stop);
    const usedW = walk.used;
    const restL = subLogSafe(w0, usedW);
    if (restL > -Infinity) res.goldGallery = Big.fromLog10(s.node.on ? haulGoldLog10(s, restL, !!opts.apply) : restL + L10(goldPerHp() / KAPPA));
  }
  // Chests passed (centre-column chest cells every 25 rows).
  const chestRows = Math.max(0, Math.floor((to - CHEST_EVERY) / CHEST_EVERY) - Math.floor((from - CHEST_EVERY) / CHEST_EVERY));
  const room = Math.max(0, RACK_MAX - s.run.rack.length);
  res.chests = Math.min(chestRows, room);
  res.chestsGold = chestRows - res.chests;
  if (res.chestsGold > 0) {
    const incL = dps + L10(eff) + L10(goldPerHp() / KAPPA);
    res.goldGallery.addIn(Big.fromLog10(incL + L10(RACK_CHEST_S * res.chestsGold)));
  }
  res.gold = res.goldRows.add(res.goldGallery);
  // Biomes crossed (already opened ones only).
  const k0 = biomeAt(from);
  const k1 = biomeAt(to);
  if (k1 > k0) res.biomeCrossed = k1;
  if (opts.apply) applyOffline(s, res, walk.frac);
  return res;
}

function rowsForWorkGold(usedL: number, alreadyPaidL: number): number {
  const net = alreadyPaidL > -Infinity ? subLogSafe(usedL, alreadyPaidL) : usedL;
  return net + L10(goldPerHp() / KAPPA);
}

function subLogSafe(a: number, b: number): number {
  if (b === -Infinity) return a;
  if (b >= a) return -Infinity;
  const d = a - b;
  if (d > 17) return a;
  return a + Math.log1p(-Math.pow(10, -d)) / Math.LN10;
}

/** Move the floor and rack the chests (the gold waits for Collect). */
function applyOffline(s: IdleState, r: OfflineResult, frac: number): void {
  const to = r.toDepth;
  if (to !== s.run.depth) {
    const from = s.run.depth;
    resetWindow(s, to);
    if (to > s.run.dmax) s.run.dmax = to;
    if (to > s.meta.record) s.meta.record = to;
    for (let k = biomeAt(r.fromDepth) + 1; k <= biomeAt(to); k++) if (!s.meta.biomesSeen.includes(k)) s.meta.biomesSeen.push(k);
    // The node layer: the chambers the crew broke into wait dark; the player arrives at the first dark mouth.
    if (s.node.on) {
      onFrontMoved(s, from, to, 'analytic');
      const opened = returnToFront(s, from);
      r.chambers = opened.length;
      r.glimpses = opened.slice(0, 3);
      r.darkNode = opened.length > 0 && s.node.phase === 'explore' && !s.node.chambers[s.node.node]?.lit ? s.node.node : -1;
    }
  }
  const floor = s.shaft.rows[0];
  if (frac > 0 && floor.kinds[0] !== CELL.SEAL) {
    const each = 1 - Math.min(0.999999, frac);
    for (let c = 0; c < COLS; c++) if (floor.left[c] > 0) floor.left[c] = Math.min(floor.left[c], each);
  }
  for (let i = 0; i < r.chests; i++) s.run.rack.push(0);
  // The crew waits at the seal: it is held until the player taps (after the feast).
  if (r.sealBiome >= 0 && floor.kinds[0] === CELL.SEAL) holdSealOnReturn(s);
}

/**
 * The return (SPEC §4.4): compute the closed form for the time away, move the floor, rack the chests and
 * keep the result for the feast. Gold is credited on Collect. Returns null when nothing counts.
 */
export function returnFromAway(s: IdleState, savedAt: number, now: number, bus?: IdleBus): OfflineResult | null {
  const a = awaySeconds(s, savedAt, now);
  if (a.counted <= 0) return null;
  const r = computeOffline(s, a.counted, { apply: true, away: a.away, capped: a.capped });
  s.meta.stats.offlineHours += a.counted / 3600;
  s.offline = r;
  if (a.away >= 8 * 3600) flagSecret(s, 'patience');
  bus?.emit('offline:ready', { seconds: a.counted, rows: r.toDepth - r.fromDepth, gold: r.gold.clone() });
  returnHints(s, r.sealBiome >= 0, a.capped, bus);
  if (r.chests > 0) bus?.emit('chest:rack', { count: s.run.rack.length });
  return r;
}

/** Collect the feast: credit its gold (the UI flies it in bundles through the ledger). */
export function collectOffline(s: IdleState, bus?: IdleBus): Big {
  const r = s.offline;
  if (!r || r.collected) return Big.zero();
  r.collected = true;
  s.run.gold.addIn(r.gold);
  s.run.goldEarned.addIn(r.gold);
  s.meta.lifetime.gold.addIn(r.gold);
  if (r.gold.gt(s.meta.records.bestOffline)) s.meta.records.bestOffline = r.gold.clone();
  bus?.emit('offline:collect', { gold: r.gold.clone(), chests: s.run.rack.length });
  welcomeBack(s);
  bus?.emit('gold:gain', { amount: r.gold.clone(), source: 'offline', col: -1, depth: s.run.depth });
  return r.gold.clone();
}

/** Fast-forward with the crew only (debug `advance`, the sim): 100 % efficiency, applied, no feast. */
export function advanceIdle(s: IdleState, seconds: number, bus?: IdleBus, throughSeals = false): OfflineResult {
  const r = computeOffline(s, seconds, { eff: 1, apply: true, throughSeals });
  s.run.gold.addIn(r.gold);
  s.run.goldEarned.addIn(r.gold);
  s.meta.lifetime.gold.addIn(r.gold);
  s.time += seconds;
  s.playTime += seconds;
  s.run.runTime += seconds;
  if (r.toDepth > r.fromDepth) bus?.emit('rows:analytic', { from: r.fromDepth, to: r.toDepth, gold: r.gold.clone(), chestsRacked: r.chests });
  return r;
}
