// Prestige layer 1 (SPEC §5.9): Rekindle → Embers at the Ember Shrine (600 m). EmbersTotal(R) = floor(25 × 2^((R −
// 600) / 200)), R the deepest point since the last Weave: "every new 200 m of record doubles your Embers". A Rekindle
// pays the total minus the Embers owned; each Ember is +10 % damage; Embers are never spent. It resets the run (depth,
// gold, levels, gear, skills, facets) and keeps everything else; it plants your lantern where you reached; the next
// run races a par (the projection at the new power, CRITIQUE MUST 6). Weave and Breach are W3's.

import { Big } from '../../core/big';
import type { IdleBus } from '../bus';
import { rowsCostLog10 } from '../config/curves';
import { EMBERS, embersTotalLog10, PAR, PERKS, RECOMMEND, REKINDLE_AT } from '../config/prestige';
import { projectRun, applyStartPerks } from '../sim/project';
import { invalidateMults } from './mult';
import { plantLantern } from './records';
import { crewDpsLog10, gameDpsLog10 } from './run';
import { analyticRows, resetWindow, settleFloor } from './shaft';
import type { IdleState } from './state';
import { newRun } from './step';
import { runSeedOf } from './state';
import { newDirector } from './director';

const L10 = Math.log10;

/** The Ember total a record is worth (a Big: exact past 1e308). */
export function embersTotal(record: number): Big {
  if (record < EMBERS.at) return Big.zero();
  const l = embersTotalLog10(record);
  // Exact below 1e15 (25 × 2^k is an integer at every 200 m step; the log form would land at 12799.99…).
  return l < 15 ? Big.from(Math.floor(EMBERS.base * Math.pow(2, (record - EMBERS.at) / EMBERS.per) + 1e-6)) : Big.fromLog10(l);
}

/** Embers a Rekindle would pay now (total for the cycle record − owned; never negative). */
export function rekindleGain(s: IdleState): Big {
  const total = embersTotal(Math.max(s.meta.cycleRecord, s.run.dmax));
  const g = total.sub(s.meta.embers);
  return g.floorZeroIn();
}

/** Rekindle is open (the Ember Shrine was reached in this cycle) and pays something. */
export function canRekindle(s: IdleState): boolean {
  return Math.max(s.meta.cycleRecord, s.run.dmax) >= REKINDLE_AT && !rekindleGain(s).isZero() && !s.seal;
}

/** The recommend rule (SPEC §5.9): `why` names the clause that fired ('' when not recommended). */
export function recommend(s: IdleState): { ok: boolean; why: '' | 'slow' | 'tenfold' | 'walled' } {
  if (!canRekindle(s)) return { ok: false, why: '' };
  const gain = rekindleGain(s);
  const owned = s.meta.embers;
  const row = s.rates.rowSec;
  if (owned.isZero() || gain.log10() >= owned.log10() + 1) return { ok: true, why: 'tenfold' };
  if (gain.gte(owned) && row > RECOMMEND.slowRow) return { ok: true, why: 'slow' };
  if (row > RECOMMEND.walledRow && s.run.runTime > RECOMMEND.walledRun && gain.log10() >= owned.log10() + L10(RECOMMEND.walledFrac)) return { ok: true, why: 'walled' };
  return { ok: false, why: '' };
}

/** Power now and after (the Ember multiplier ×A → ×B). */
export function powerAfter(s: IdleState): { before: number; after: number } {
  const e = s.meta.embers.toNumber();
  const g = rekindleGain(s).toNumber();
  return { before: 1 + EMBERS.perEmber * e, after: 1 + EMBERS.perEmber * (e + g) };
}

/**
 * The Rekindle screen's promise: "You will pass <record> in about <t>" (a pure sim of the next run, ≤ 30 ms).
 * @returns the seconds to pass the cycle record (Infinity when not within an hour).
 */
export function projection(s: IdleState): { passAt: number; record: number; gain: Big; before: number; after: number } {
  const gain = rekindleGain(s);
  const record = Math.max(s.meta.cycleRecord, s.run.dmax);
  const p = projectRun(s, { embers: s.meta.embers.add(gain), target: record, secs: 3600, dt: 4 });
  const pw = powerAfter(s);
  return { passAt: p.passAt, record, gain, before: pw.before, after: pw.after };
}

/** The perks the Ember total unlocks (ids, and the new ones a gain would add). */
export function perksAt(embers: number): string[] {
  return PERKS.filter((p) => embers >= p.at).map((p) => p.id);
}

export function hasEmberPerk(s: IdleState, id: string): boolean {
  const p = PERKS.find((x) => x.id === id);
  return !!p && s.meta.embersMax.toNumber() >= p.at;
}

/** The par of a run starting now (CRITIQUE MUST 6): the projection at this power, depth every 30 s. */
export function computePar(s: IdleState): number[] {
  const target = Math.max(s.meta.record, 40);
  const p = projectRun(s, { target, extra: 600, secs: PAR.maxSecs, every: PAR.every, dt: 4 });
  return p.samples;
}

/**
 * Rekindle now: credit the Embers, plant the lantern, reset the run, apply the start perks and the Head Start, set the
 * par. @returns the Embers gained (zero when it could not).
 */
export function rekindle(s: IdleState, bus?: IdleBus): Big {
  if (!canRekindle(s)) return Big.zero();
  const gain = rekindleGain(s);
  const reached = s.run.dmax;
  s.meta.embers.addIn(gain);
  if (s.meta.embers.gt(s.meta.embersMax)) s.meta.embersMax = s.meta.embers.clone();
  s.meta.lifetime.embersEver.addIn(gain);
  if (gain.gt(s.meta.records.bestEmbers)) {
    const old = s.meta.records.bestEmbers.toNumber();
    s.meta.records.bestEmbers = gain.clone();
    if (old > 0) bus?.emit('record:new', { id: 'bestEmbers', value: gain.toNumber(), old });
  }
  s.meta.stats.rekindles++;
  plantLantern(s, reached, bus);
  // Reset the run; keep the meta.
  s.runIndex++;
  s.runSeed = runSeedOf(s.seed, s.runIndex);
  s.run = newRun();
  s.crewT0 = [];
  s.crewPending = [];
  s.seal = null;
  s.chests = [];
  s.event = null;
  s.widgets = [];
  s.hand = null;
  s.overrides = [];
  s.hits = {};
  s.ember = null;
  const keep = s.director;
  s.director = { ...newDirector(), history: keep.history, since: keep.since, dealt: keep.dealt };
  s.tap.combo = 0;
  s.tap.surge = 0;
  s.tap.surgeEnd = 0;
  resetWindow(s, 0);
  applyStartPerks(s);
  invalidateMults(s);
  s.run.par = computePar(s);
  bus?.emit('prestige:done', { layer: 'rekindle', gain: gain.clone(), total: s.meta.embers.clone(), depth: reached });
  // The Head Start (100 Embers): a Plunge to 10 % of the record (20 % at 1e4, 30 % at 1e8; Feat perks +5 % each).
  const hs = headStartFrac(s);
  if (hs > 0) {
    const to = Math.floor(s.meta.record * hs);
    if (to > 1) {
      s.run.splits.hs = to;
      analyticRows(s, rowsCostLog10(0, to) + 1e-9, bus, 'analytic');
      settleFloor(s, bus, 'analytic');
    }
  }
  return gain;
}

/** The Head Start's fraction of the record (0 without the perk). */
export function headStartFrac(s: IdleState): number {
  const e = s.meta.embersMax.toNumber();
  let f = e >= 1e8 ? 0.3 : e >= 1e4 ? 0.2 : e >= 100 ? 0.1 : 0;
  if (f > 0) {
    if ((s.meta.feats.delver ?? 0) >= 10) f += 0.05;
    if ((s.meta.feats.swift ?? 0) >= 10) f += 0.05;
    f += 0.05 * (s.meta.loom.headStart ?? 0);
  }
  return Math.min(0.6, f);
}

/** Emit prestige:ready once a run when the recommendation turns on (the goal bar and the Lantern tab glow). */
export function tickPrestige(s: IdleState, bus?: IdleBus): void {
  const key = `ready:${s.runIndex}`;
  if (s.meta.firstTime.includes(key)) return;
  const r = recommend(s);
  if (!r.ok) return;
  // One key per run (pruned so the list stays short).
  s.meta.firstTime = s.meta.firstTime.filter((k) => !k.startsWith('ready:'));
  s.meta.firstTime.push(key);
  bus?.emit('prestige:ready', { layer: 'rekindle', gain: rekindleGain(s) });
}

/** The rates the Lantern sheet's Stats panel shows: active DPS and crew DPS (log10). */
export function powerLog10(s: IdleState): { active: number; crew: number } {
  const crew = crewDpsLog10(s);
  return { active: gameDpsLog10(s, 5, crew), crew };
}
