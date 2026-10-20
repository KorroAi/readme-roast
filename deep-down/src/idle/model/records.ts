// Records, splits, the ghost race and planted lanterns (SPEC §7.7, CRITIQUE MUST 6). The ghost lantern races a PAR,
// not your last run: the pure sim's projection for this run's starting power (prestige.ts computes it at every new
// run), sampled every 30 s. A green split (5 gems) needs a biome reached at least 5 % under par. Planted lanterns:
// every Rekindle plants yours at the depth it reached; tapping one as you pass it gives +2 % damage for the run.

import type { IdleBus } from '../bus';
import { biomeStart } from '../config/biomes';
import { PAR, PLANTED_BONUS } from '../config/prestige';
import { creditGems } from './gain';
import { invalidateMults } from './mult';
import type { IdleState } from './state';

/** The par run's time (s) to reach `depth` (Infinity when the par never got there, or there is no par). */
export function parTime(s: IdleState, depth: number): number {
  const p = s.run.par;
  if (p.length === 0) return Infinity;
  if (depth <= p[0]) return 0;
  for (let i = 1; i < p.length; i++) {
    if (p[i] >= depth) {
      const a = p[i - 1];
      const f = p[i] > a ? (depth - a) / (p[i] - a) : 1;
      return (i - 1 + f) * PAR.every;
    }
  }
  return Infinity;
}

/** The ghost's depth now: the par run's depth at this run's time (−1 when there is no ghost). */
export function ghostDepth(s: IdleState, t = s.run.runTime): number {
  const p = s.run.par;
  if (p.length === 0) return -1;
  const x = t / PAR.every;
  const i = Math.floor(x);
  if (i >= p.length - 1) return p[p.length - 1];
  return p[i] + (p[i + 1] - p[i]) * (x - i);
}

/** Metres ahead of the ghost (negative behind); null when there is no ghost. */
export function ghostLead(s: IdleState): number | null {
  const g = ghostDepth(s);
  return g < 0 ? null : s.run.depth - g;
}

/** A biome reached in this run: record its split, compare with par and the best; a green split pays 5 gems. */
export function biomeSplit(s: IdleState, biome: number, bus?: IdleBus): { time: number; best: number; par: number; green: boolean } {
  const key = String(biome);
  const time = s.run.runTime;
  if (s.run.splits[key] !== undefined) return { time: s.run.splits[key], best: s.meta.records.splits[key] ?? Infinity, par: Infinity, green: false };
  s.run.splits[key] = time;
  const best = s.meta.records.splits[key] ?? Infinity;
  const par = parTime(s, biomeStart(biome));
  const green = Number.isFinite(par) && par > 0 && time <= (1 - PAR.greenBy) * par;
  if (green) creditGems(s, PAR.gems, 'record', bus);
  if (time < best) {
    s.meta.records.splits[key] = time;
    if (Number.isFinite(best)) bus?.emit('record:new', { id: `split:${biome}`, value: time, old: best });
  }
  bus?.emit('split', { biome, time, par, best, green });
  return { time, best, par, green };
}

/** Per-step checks: the ghost overtaken, the 500 m marks, the deepest record line. */
export function tickRecords(s: IdleState, bus?: IdleBus): void {
  const lead = ghostLead(s);
  if (lead !== null) {
    if (lead > 0 && s.run.ghostPassed < 0) {
      s.run.ghostPassed = Math.floor(s.run.runTime / PAR.every);
      bus?.emit('ghost:pass', { depth: s.run.depth, ahead: lead });
    } else if (lead < -2 && s.run.ghostPassed >= 0) s.run.ghostPassed = -1; // fell behind: the next pass bursts again
  }
  const m500 = Math.floor(s.run.depth / 500) * 500;
  if (m500 > 0) {
    const k = String(m500);
    const best = s.meta.records.marks500[k];
    if (s.run.splits[`m${k}`] === undefined) {
      s.run.splits[`m${k}`] = s.run.runTime;
      if (best === undefined || s.run.runTime < best) {
        s.meta.records.marks500[k] = s.run.runTime;
        if (best !== undefined) bus?.emit('record:new', { id: `mark500:${m500}`, value: s.run.runTime, old: best });
      }
    }
  }
}

/** A record that only grows (bestCombo, bestTapCells, bestChest): emit record:new when beaten (≥ 2 to stay quiet early). */
export function bumpRecord(s: IdleState, id: 'bestCombo' | 'bestTapCells' | 'bestChest', value: number, bus?: IdleBus): void {
  const old = s.meta.records[id];
  if (value <= old) return;
  s.meta.records[id] = value;
  if (old >= 2) bus?.emit('record:new', { id, value, old });
}

// ----- planted lanterns ---------------------------------------------------------------------------------

/** Plant this run's lantern (a Rekindle): `n` the Rekindle number. */
export function plantLantern(s: IdleState, depth: number, bus?: IdleBus): number {
  const n = s.meta.stats.rekindles;
  s.meta.planted.push({ depth, n });
  // Keep the save small: the 40 most recent lanterns.
  if (s.meta.planted.length > 40) s.meta.planted.splice(0, s.meta.planted.length - 40);
  bus?.emit('lantern:planted', { depth, n });
  return n;
}

/** Tap planted lantern `n` (+2 % damage for the run, once a run each). */
export function tapLantern(s: IdleState, n: number, bus?: IdleBus): boolean {
  const p = s.meta.planted.find((x) => x.n === n);
  if (!p || s.run.lanterns.includes(n)) return false;
  s.run.lanterns.push(n);
  s.run.plantedBonus += PLANTED_BONUS;
  s.meta.stats.passed++;
  s.meta.lastUsed.lantern = s.playTime;
  invalidateMults(s);
  bus?.emit('lantern:tap', { id: `lantern:${n}`, n, bonus: s.run.plantedBonus });
  bus?.emit('entity:done', { id: `lantern:${n}`, kind: 'lantern', reward: `bonus:${PLANTED_BONUS}` });
  return true;
}

/** Lanterns planted in [from, to) not yet collected this run (the Plunge and analytic rows collect them). */
export function collectPassed(s: IdleState, from: number, to: number, bus?: IdleBus): number {
  let n = 0;
  for (const p of s.meta.planted) if (p.depth >= from && p.depth < to && !s.run.lanterns.includes(p.n)) {
    if (tapLantern(s, p.n, bus)) n++;
  }
  return n;
}

/** Planted lanterns within `range` rows of the floor (B and the ruler draw them). */
export function lanternsNear(s: IdleState, range = 12): Array<{ depth: number; n: number; tapped: boolean }> {
  const d = s.run.depth;
  return s.meta.planted.filter((p) => Math.abs(p.depth - d) <= range).map((p) => ({ ...p, tapped: s.run.lanterns.includes(p.n) }));
}
