// The headless pacing sim (SPEC Appendix A, §5.12), shared by the tests and tools/econ-sim.ts. It runs the
// real model's formulas (run.ts: DPS, the pick's edge, costs, buying) on a real IdleState, and advances
// depth row by row with the real row content (shaft.rowKinds: kinds, open rows, gate rows), a row costing
// κ × its cells' HP and paying its cells' gold. Active steps of 0.5 s; offline steps use the closed form.
// It adds, each at its expected rate: first-time seals (20 s of active time, a Crystal chest), chest cells
// (30 s of income), the Drifting Ember (first at 100 s, then every 150 s, 40 s of income; the W2 event in this old sim).

import { Big } from '../../core/big';
import { biomeAt, biomeStart } from '../config/biomes';
import { KINDS, kindGoldLog10, kindHpLog10 } from '../config/cells';
import { goldPerHp, hpLog10, KAPPA } from '../config/curves';
import { CRIT, holdRateOf } from '../config/upgrades';
import { pathStep, tickGoals } from '../model/goals';

/** Path steps the pacing sim cannot progress (their systems are not played here). */
const SIM_SKIPS: ReadonlySet<string> = new Set(['contract', 'facet', 'ember', 'rank', 'finds', 'crystalChest', 'page', 'rekindle', 'planted', 'crown', 'breakThrough', 'lamps', 'chart', 'relic', 'secret']);
import { activeDpsLog10, crewDpsLog10, critChance, edgeOf, goldPerDmgLog10, refreshRates, tapBaseLog10 } from '../model/run';
import { isOpenRow, rowKinds } from '../model/shaft';
import { CELL, COLS, type IdleState } from '../model/state';
import { createIdle } from '../model/step';
import { BOT_DEFAULT, botBuy, humanBuy, type BotOpts } from './bot';

const L10 = Math.log10;

export interface PacingOpts {
  /** Seconds to simulate. */
  secs: number;
  dt: number;
  /** Taps per second (5 the bot, 3 the human); 'hold' taps at the hold stream's rate with half combo. */
  taps: number;
  profile: 'bot' | 'human' | 'hold';
  seed: number;
  /** Active time per first-time seal (s) and its chest (seconds of income). */
  sealSecs: number;
  sealChestSecs: number;
  chestSecs: number;
  emberFirst: number;
  emberEvery: number;
  emberSecs: number;
  /** Hire the first Shovel Hand as soon as affordable after this time (the tutorial orders it). */
  shovelAt: number;
  /** A human waits this long before each purchase. */
  humanDelay: number;
  bot: BotOpts;
  /** Depths to time (rows). */
  marks: readonly number[];
  /** Appendix A caps a tap at one cell's HP; the game lets overkill flow on (false = the game). */
  capTaps: boolean;
  /** Sample the goal bar every 0.5 s (E12). */
  sampleGoals: boolean;
}

export const PACING_DEFAULT: PacingOpts = {
  secs: 7200,
  dt: 0.5,
  taps: 5,
  profile: 'bot',
  seed: 12345,
  sealSecs: 20,
  sealChestSecs: 90,
  chestSecs: 30,
  emberFirst: 100,
  emberEvery: 150,
  emberSecs: 40,
  shovelAt: 8,
  humanDelay: 2,
  bot: BOT_DEFAULT,
  marks: [20, 40, 80, 120, 240, 400, 600, 900, 1300, 1800],
  capTaps: false,
  sampleGoals: false,
};

export interface PacingResult {
  /** Seconds to first reach each mark (Infinity if not reached). */
  reach: Record<number, number>;
  firstBuy: number;
  firstCrew: number;
  /** Longest gap between rewards (purchase, chest, biome, ember) in the first 30 min (s). */
  maxGap: number;
  /** Taps per cell p10 / p50 / p90 over 20 s – 45 min. */
  tpc: [number, number, number];
  /** Row time (s) samples over the first 40 min: p10 / p50 / p90. */
  rowSec: [number, number, number];
  /** Share of 0.5 s samples where the Pick's next level is a ≥ 1 % tap gain (CRITIQUE MUST 2). */
  slot1Ok: number;
  /** Active ÷ idle income at 5, 30 and 120 min (E20). */
  e20: Record<number, number>;
  /** The run's state at each of these times (s): depth, pick, lines. */
  snapshots: Array<{ t: number; depth: number; pick: number; edge: number; lines: number[]; gear: number; goldLog10: number; dpsLog10: number; rowSec: number }>;
  /** Final state. */
  state: IdleState;
  /** Purchases made (count). */
  purchases: number;
  /** The goal bar sampled every 0.5 s (E12, L5): fill, ETA and id. */
  goals: Array<{ t: number; id: string; fill: number; eta: number }>;
}

/** Gold (log10) and cost (log10) of row d with the run's real content. */
export function rowEconomy(s: IdleState, d: number, kinds: Uint8Array): { cost: number; gold: number; open: boolean; gate: boolean } {
  if (isOpenRow(s.runSeed, d)) return { cost: -Infinity, gold: -Infinity, open: true, gate: false };
  rowKinds(s.runSeed, d, kinds);
  const h = hpLog10(d);
  let hpSum = 0;
  let goldSum = 0;
  for (let c = 0; c < COLS; c++) {
    const k = KINDS[kinds[c]];
    hpSum += kinds[c] === CELL.AIR ? 0 : Math.pow(10, kindHpLog10(kinds[c], d));
    goldSum += k.gold > 0 ? Math.pow(10, kindGoldLog10(kinds[c], d)) : 0;
  }
  const gate = kinds[0] === CELL.GATE;
  return { cost: h + L10(hpSum * KAPPA), gold: goldSum > 0 ? h + L10(goldSum * goldPerHp()) : -Infinity, open: false, gate };
}

function quantiles(a: number[]): [number, number, number] {
  if (a.length === 0) return [0, 0, 0];
  const b = [...a].sort((x, y) => x - y);
  const q = (p: number) => b[Math.floor(p * (b.length - 1))];
  return [q(0.1), q(0.5), q(0.9)];
}

/** The first run (SPEC §5.12's first table): from a fresh game, active the whole time. */
export function simFirstRun(partial: Partial<PacingOpts> = {}): PacingResult {
  const o: PacingOpts = { ...PACING_DEFAULT, ...partial, bot: { ...PACING_DEFAULT.bot, ...(partial.bot ?? {}) } };
  const s = createIdle(o.seed, 0);
  s.meta.tutorial.done = true;
  s.tutorial.done = true;
  const kinds = new Uint8Array(COLS);
  const reach: Record<number, number> = {};
  for (const m of o.marks) reach[m] = Infinity;
  let t = 0;
  let prog = 0;
  let firstBuy = Infinity;
  let firstCrew = Infinity;
  const rewards: number[] = [];
  const tpc: number[] = [];
  const rows: number[] = [];
  let slotOk = 0;
  let slotN = 0;
  const e20: Record<number, number> = {};
  const snapshots: PacingResult['snapshots'] = [];
  const snapAt = [10, 30, 60, 120, 180, 300, 600, 900, 1200, 1800, 2400, 3600, 5400, 7200];
  let snapI = 0;
  let emberT = o.emberFirst;
  let sealBlock = 0;
  let humanWait = 0;
  let purchases = 0;
  const goals: PacingResult['goals'] = [];
  let sealOneAt: number | undefined;
  let row = rowEconomy(s, 0, kinds);
  const rate = () => (o.profile === 'hold' ? holdRateOf(s.run.ups.steady ?? 0, false) : o.taps);
  while (t < o.secs) {
    const step = o.dt;
    const taps = rate();
    // A seal fight holds the floor for its active time.
    let rem = step;
    if (sealBlock > 0) {
      const used = Math.min(sealBlock, rem);
      sealBlock -= used;
      rem -= used;
      if (sealBlock <= 0) {
        // Broken: the Crystal chest, then the floor drops.
        const inc = activeDpsLog10(s, taps, crewDpsLog10(s), s.run.pick, s.run.ups.lucky ?? 0, o.capTaps) + goldPerDmgLog10();
        s.run.gold.addIn(Big.fromLog10(inc + L10(o.sealChestSecs)));
        s.meta.sealsOpened.push(biomeAt(s.run.depth));
        rewards.push(t);
        s.run.depth++;
        prog = 0;
        row = rowEconomy(s, s.run.depth, kinds);
      }
    }
    for (let guard = 0; guard < 100000 && rem > 0; guard++) {
      const d = s.run.depth;
      if (row.open) {
        s.run.depth++;
        row = rowEconomy(s, s.run.depth, kinds);
        continue;
      }
      if (row.gate && d >= 40 && !s.meta.sealsOpened.includes(biomeAt(d))) {
        // A first-time seal.
        sealBlock = o.sealSecs;
        const used = Math.min(sealBlock, rem);
        sealBlock -= used;
        rem -= used;
        if (sealBlock > 0) break;
        const inc = activeDpsLog10(s, taps, crewDpsLog10(s), s.run.pick, s.run.ups.lucky ?? 0, o.capTaps) + goldPerDmgLog10();
        s.run.gold.addIn(Big.fromLog10(inc + L10(o.sealChestSecs)));
        s.meta.sealsOpened.push(biomeAt(d));
        s.run.depth++;
        row = rowEconomy(s, s.run.depth, kinds);
        continue;
      }
      const ld = activeDpsLog10(s, taps, crewDpsLog10(s), s.run.pick, s.run.ups.lucky ?? 0, o.capTaps);
      if (ld === -Infinity) break;
      const need = Math.pow(10, row.cost - ld) * (1 - prog);
      if (need <= rem) {
        rem -= need;
        if (row.gold > -Infinity) s.run.gold.addIn(Big.fromLog10(row.gold + L10(1 - prog)));
        if (d % 25 === 24) {
          s.run.gold.addIn(Big.fromLog10(ld + goldPerDmgLog10() + L10(o.chestSecs)));
          rewards.push(t);
        }
        s.run.depth++;
        prog = 0;
        if (s.run.depth > s.run.dmax) {
          s.run.dmax = s.run.depth;
          const k = biomeAt(s.run.depth);
          if (biomeStart(k) === s.run.depth) rewards.push(t);
        }
        row = rowEconomy(s, s.run.depth, kinds);
      } else {
        const f = rem / Math.pow(10, row.cost - ld);
        prog += f;
        if (row.gold > -Infinity) s.run.gold.addIn(Big.fromLog10(row.gold + L10(f)));
        rem = 0;
      }
    }
    // The Drifting Ember.
    emberT -= step;
    if (emberT <= 0) {
      emberT = o.emberEvery;
      const inc = activeDpsLog10(s, taps, crewDpsLog10(s), s.run.pick, s.run.ups.lucky ?? 0, o.capTaps) + goldPerDmgLog10();
      s.run.gold.addIn(Big.fromLog10(inc + L10(o.emberSecs)));
      rewards.push(t);
    }
    // Buying.
    if ((s.run.lines[0] ?? 0) === 0 && t >= o.shovelAt) {
      const c = Math.pow(10, 1.69897);
      if (s.run.gold.toNumber() >= c) {
        s.run.gold.subIn(c);
        while (s.run.lines.length < 1) s.run.lines.push(0);
        s.run.lines[0] = 1;
        rewards.push(t);
        purchases++;
        if (firstCrew === Infinity) firstCrew = t;
        if (firstBuy === Infinity) firstBuy = t;
      }
    }
    if (o.profile === 'human') {
      humanWait -= step;
      if (humanWait <= 0) {
        const b = humanBuy(s);
        if (b) {
          purchases++;
          rewards.push(t);
          if (firstBuy === Infinity) firstBuy = t;
          if (b.startsWith('crew:') && firstCrew === Infinity) firstCrew = t;
          humanWait = o.humanDelay;
        }
      }
    } else {
      const bought = botBuy(s, { ...o.bot, taps, cap: o.capTaps });
      if (bought.length > 0) {
        purchases += bought.length;
        rewards.push(t);
        if (firstBuy === Infinity) firstBuy = t;
        if (firstCrew === Infinity && bought.some((b) => b.startsWith('crew:'))) firstCrew = t;
      }
    }
    // Samples.
    const crew = crewDpsLog10(s);
    if (t > 20 && t < 2700) {
      const p = critChance(s);
      const tap = tapBaseLog10(s, s.run.pick, crew) + L10(1.5 * (1 + p * (CRIT.mult - 1)));
      tpc.push(Math.pow(10, hpLog10(s.run.depth) - tap));
    }
    if (t < 2400) {
      const act = activeDpsLog10(s, taps, crew, s.run.pick, s.run.ups.lucky ?? 0, o.capTaps);
      rows.push(Math.pow(10, L10(7 * KAPPA) + hpLog10(s.run.depth) - act));
    }
    {
      const now = tapBaseLog10(s, s.run.pick, crew);
      const next = tapBaseLog10(s, s.run.pick + 1, crew);
      slotN++;
      if (Math.pow(10, next - now) - 1 >= 0.01) slotOk++;
    }
    // The goal bar (every 0.5 s, the game's own goal machine on the bot's state).
    if (o.sampleGoals) {
      s.time = t;
      s.playTime = t;
      if (s.run.dmax > s.meta.record) s.meta.record = s.run.dmax;
      s.meta.stats.cells = Math.max(s.meta.stats.cells, s.run.dmax * 7);
      s.meta.stats.chests = Math.floor(s.run.dmax / 25) + (s.run.dmax > 6 ? 1 : 0);
      if (s.run.dmax >= 30 && !s.meta.firstTime.includes('used:dynamite')) s.meta.firstTime.push('used:dynamite');
      if (s.meta.sealsOpened.includes(1) && t > (sealOneAt ??= t) + 40 && !s.meta.firstTime.includes('used:surge')) s.meta.firstTime.push('used:surge');
      if (t >= o.emberFirst && !s.meta.firstTime.includes('ember:caught')) s.meta.firstTime.push('ember:caught');
      // Path steps of systems this sim does not play (W2: rank, Finds, events, facets…) count as done when reached.
      for (let p = pathStep(s); p && SIM_SKIPS.has(p.kind); p = pathStep(s)) s.meta.path.step = p.n + 1;
      refreshRates(s, taps);
      tickGoals(s);
      const g = s.goals.current;
      goals.push({ t, id: g.id, fill: g.fill, eta: g.eta });
    }
    for (const m of [300, 1800, 7200]) if (Math.abs(t - m) < o.dt / 2 && crew > -Infinity) e20[m / 60] = Math.pow(10, activeDpsLog10(s, taps, crew, s.run.pick, s.run.ups.lucky ?? 0, o.capTaps) - crew);
    t += step;
    for (const m of o.marks) if (reach[m] === Infinity && s.run.dmax >= m) reach[m] = t;
    while (snapI < snapAt.length && t >= snapAt[snapI]) {
      const act = activeDpsLog10(s, taps, crew, s.run.pick, s.run.ups.lucky ?? 0, o.capTaps);
      snapshots.push({
        t: snapAt[snapI], depth: s.run.depth, pick: s.run.pick, edge: edgeOf(s.run.pick, s.run.depth), lines: [...s.run.lines], gear: s.run.gear.length,
        goldLog10: s.run.gold.log10(), dpsLog10: act, rowSec: Math.pow(10, L10(7 * KAPPA) + hpLog10(s.run.depth) - act),
      });
      snapI++;
    }
  }
  rewards.sort((a, b) => a - b);
  let maxGap = 0;
  for (let i = 1; i < rewards.length; i++) if (rewards[i] < 1800) maxGap = Math.max(maxGap, rewards[i] - rewards[i - 1]);
  return { reach, firstBuy, firstCrew, maxGap, tpc: quantiles(tpc), rowSec: quantiles(rows), slot1Ok: slotN ? slotOk / slotN : 0, e20, snapshots, state: s, purchases, goals };
}

/** The SPEC §5.12 first-run targets: [mark, sim time s, band lo s, band hi s]. */
export const FIRST_RUN_TARGETS: ReadonlyArray<[number, number, number, number]> = [
  [20, 28, 20, 45],
  [40, 69, 50, 100],
  [80, 120, 100, 180],
  [120, 192, 150, 270],
  [240, 462, 360, 600],
  [400, 900, 720, 1080],
  [600, 1458, 1200, 1800],
  [900, 2022, 1680, 2400],
  [1300, 2748, 2280, 3300],
  [1800, 7050, 5400, Infinity],
];

