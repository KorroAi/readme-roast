// The session sim with every system on (SPEC §5.12's session model, BUILD §3.1 MUST 8): the REAL model (stepIdle) at
// 10 Hz, driven by a player bot — 5 taps/s on the floor, every event target caught, Strikes stopped near the zone,
// Sequences repeated, the weak point tapped when it lights, skills used when ready, the Surge fired from the ring,
// chests opened, facets picked, the daily chest claimed — buying by the calibration rule (best valued ΔDPS / cost,
// crew ×1.3) in chunks, Rekindling by the recommend rule (never in a session's last 3 minutes). Between sessions the
// closed form runs the crew offline (50 %, the caps) and the return is collected.
// Sessions: one 40-minute first session, then 6 minutes every 2 h from 08:00 to 24:00.

import { createIdleBus, type IdleBus } from '../bus';
import { biomeAt, AUTHORED_BIOMES } from '../config/biomes';
import { botBuy, botCandidates, BOT_DEFAULT } from './bot';
import { claimDaily } from '../model/daily';
import { tapEntity, widgetTap } from '../model/entities';
import { highlighted, pick } from '../model/facets';
import { featTiers } from '../model/feats';
import { sideProduct } from '../model/mult';
import { collectOffline, returnFromAway } from '../model/offline';
import { recommend, rekindle } from '../model/prestige';
import { activeDpsLog10, buy, crewDpsLog10, price } from '../model/run';
import { weakId } from '../model/seals';
import { cooldownLeft, useSkill } from '../model/skills';
import type { IdleState, StrikeWidget } from '../model/state';
import { createIdle, stepIdle, type ModelTap } from '../model/step';
import { fireSurge } from '../model/tap';
import { skipTutorial } from '../model/tutorial';
import { sequenceShowing, strikePos } from '../model/widgets';
import { addLog, subLog } from '../config/curves';
import { SKILLS } from '../config/skills';
import { codexCount } from '../model/codex';
import { gameDpsLog10 } from '../model/run';

const L10 = Math.log10;

export interface DaysOpts {
  days: number;
  seed: number;
  taps: number;
  /** Model step (s) while playing. */
  dt: number;
  /** First session (min), then sessions of `session` min every `every` h from `from` to `to` (local hours). */
  first: number;
  session: number;
  every: number;
  from: number;
  to: number;
  /** Log progress (the tool). */
  log?: (line: string) => void;
  /** Sample every this many played seconds (60). */
  sampleEvery?: number;
  /** A probe called after every step (debugging). */
  probe?: (s: IdleState) => void;
  /** Turn systems off to measure them (calibration): events, skills. */
  noEvents?: boolean;
  noSkills?: boolean;
  noFacets?: boolean;
  /** The buyer: the calibration bot's single levels ('x1') or NEXT ★-style chunks ('chunk', the default). */
  buyer?: 'x1' | 'chunk';
  /** The bus, given to a debugging probe (listeners may be attached before the run). */
  onBus?: (bus: IdleBus) => void;
}

export const DAYS_DEFAULT: DaysOpts = { days: 3, seed: 2026, taps: 5, dt: 0.1, first: 40, session: 6, every: 2, from: 8, to: 24 };

export interface DaySample {
  /** Played seconds and the wall time (s since start). */
  played: number;
  wall: number;
  record: number;
  depth: number;
  rekindles: number;
  embers: number;
  rank: number;
  featTiers: number;
  codex: number;
  biomes: number;
  side: number;
  goldLog10: number;
  /** Active ÷ idle income now (E20). */
  e20: number;
}

export interface DaysResult {
  samples: DaySample[];
  /** Run lengths (played s) of every Rekindle, in order (E9). */
  runs: number[];
  /** After each recommended Rekindle: played seconds to pass the old record, and the run it replaced (E8). */
  passes: Array<{ took: number; prev: number; record: number }>;
  /** Played seconds when lifetime gold first reached 1e100 (E11), Infinity when never. */
  googolAt: number;
  /** Played seconds at the first rank 10 (E19). */
  rank10At: number;
  /** Feat tiers at 30 min of play (E18). */
  feats30: number;
  /** The record at the end of each day, and the biomes first entered that day. */
  dayEnd: Array<{ record: number; newBiomes: number; feats: number; side: number; rank: number; played: number }>;
  state: IdleState;
  /** Wall-clock ms the sim took. */
  ms: number;
}

/** The bot's chunked buying (the calibration rule; ×10 levels, gear whole). */
function botBuyChunked(s: IdleState, taps: number, max = 20): number {
  let n = 0;
  for (let k = 0; k < max; k++) {
    const crew = crewDpsLog10(s);
    const act = activeDpsLog10(s, taps, crew, s.run.pick, s.run.ups.lucky ?? 0, false);
    const base = addLog(crew + L10(1.3), subLog(act, crew));
    const gold = s.run.gold.log10();
    let bestId = '';
    let bestScore = -Infinity;
    for (const id of botCandidates(s, BOT_DEFAULT)) {
      const mode = id.startsWith('gear:') ? 'x1' : 'x10';
      const pr = price(s, id, mode);
      if (pr.levels <= 0 || !(pr.costLog10 <= gold + 1e-9)) continue;
      let v: number;
      if (id === 'pick') {
        s.run.pick += pr.levels;
        v = valued(s, taps);
        s.run.pick -= pr.levels;
      } else if (id.startsWith('crew:')) {
        const i = Number(id.slice(5));
        while (s.run.lines.length <= i) s.run.lines.push(0);
        s.run.lines[i] += pr.levels;
        v = valued(s, taps);
        s.run.lines[i] -= pr.levels;
      } else if (id.startsWith('gear:')) {
        s.run.gear.push(id.slice(5));
        v = valued(s, taps);
        s.run.gear.pop();
      } else continue;
      const sc = subLog(v, base) - pr.costLog10;
      if (sc > bestScore) {
        bestScore = sc;
        bestId = id;
      }
    }
    if (!bestId) break;
    if (!buy(s, bestId, bestId.startsWith('gear:') ? 'x1' : 'x10').ok) break;
    n++;
  }
  // The Dig sheet's Lucky Strike when cheap (the human taps it from time to time).
  if ((s.run.ups.lucky ?? 0) < 25 && s.run.dmax >= 30 && price(s, 'up:lucky', 'x1').costLog10 < s.run.gold.log10() - 1) buy(s, 'up:lucky', 'x1');
  return n;
}

function valued(s: IdleState, taps: number): number {
  const crew = crewDpsLog10(s);
  const act = activeDpsLog10(s, taps, crew, s.run.pick, s.run.ups.lucky ?? 0, false);
  return addLog(crew + L10(1.3), subLog(act, crew));
}

/** Play the widgets and entities the model has up now (a good player). */
function playWidgets(s: IdleState, bus: IdleBus, out: ModelTap[], facets = true): void {
  const ev = s.event;
  const w = ev?.widget;
  if (w && !w.done) {
    if (w.kind === 'catch') {
      for (const tg of w.targets) if (tg.state === 'live' && s.time >= tg.t0 + 0.25) {
        out.push({ col: -1, kind: 'tap', entity: tg.id });
        break;
      }
    } else if (w.kind === 'mash') out.push({ col: -1, kind: 'tap', entity: w.target });
    else if (w.kind === 'pick') widgetTap(s, w.id, 0, bus);
    else if (w.kind === 'sequence' && !sequenceShowing(w, s.time)) widgetTap(s, w.id, w.order[w.pos], bus);
    else if (w.kind === 'strike' && Math.abs(strikePos(w, s.time) - w.zone) < 0.06) widgetTap(s, w.id, 0, bus);
  }
  for (const x of s.widgets) {
    if (x.done) continue;
    if (x.kind === 'strike' && Math.abs(strikePos(x as StrikeWidget, s.time) - (x as StrikeWidget).zone) < 0.06) widgetTap(s, x.id, 0, bus);
    if (x.kind === 'catch') for (const tg of x.targets) if (tg.state === 'live') out.push({ col: -1, kind: 'tap', entity: tg.id });
  }
  if (s.ember && s.time - s.ember.born > 0.6) out.push({ col: -1, kind: 'tap', entity: s.ember.id });
  if (s.chests.length) out.push({ col: -1, kind: 'tap', entity: s.chests[0].id });
  if (s.hand && facets) pick(s, highlighted(s), bus);
}

/** Run the session sim. */
export function simDays(partial: Partial<DaysOpts> = {}): DaysResult {
  const o: DaysOpts = { ...DAYS_DEFAULT, ...partial };
  const t0 = Date.now();
  // Day 0 starts at 08:00 local (the first 40-minute session), the clock in UTC so the sim is the same everywhere.
  const startMs = Date.UTC(2026, 9, 20, o.from);
  const s = createIdle(o.seed, startMs);
  const bus = createIdleBus();
  o.onBus?.(bus);
  skipTutorial(s, bus);
  s.meta.revealed.push('surge', 'combo', 'skills');
  const res: DaysResult = { samples: [], runs: [], passes: [], googolAt: Infinity, rank10At: Infinity, feats30: 0, dayEnd: [], state: s, ms: 0 };
  // Sessions (wall seconds from the start, length s).
  const sessions: Array<{ at: number; len: number }> = [{ at: 0, len: o.first * 60 }];
  for (let d = 0; d < o.days; d++) {
    for (let h = o.from + (d === 0 ? o.every : 0); h < o.to; h += o.every) {
      const at = d * 86400 + (h - o.from) * 3600;
      if (at > 0) sessions.push({ at, len: o.session * 60 });
    }
  }
  let runStart = 0;
  let pendingPass: { prev: number; record: number; at: number } | null = null;
  let wall = 0;
  const one: ModelTap[] = [];
  let nextBuy = 0;
  let nextSample = 0;
  let dayIdx = 0;
  let dayBiomes = s.meta.biomesSeen.length;
  bus.on('prestige:done', () => {
    res.runs.push(s.playTime - runStart);
    runStart = s.playTime;
  });
  for (const sess of sessions) {
    // Offline until the session (the closed form), then the return.
    if (sess.at > wall) {
      const savedAt = startMs + wall * 1000;
      wall = sess.at;
      const now = startMs + wall * 1000;
      s.monotonicMs = savedAt;
      s.now = savedAt;
      if (returnFromAway(s, savedAt, now, bus)) collectOffline(s, bus);
      s.now = now;
      s.monotonicMs = now;
      while (s.run.rack.length) tapEntity(s, 'rack', bus);
      if (s.meta.dailyReady) claimDaily(s, now, bus);
    }
    const end = sess.len;
    let acc = 0;
    for (let t = 0; t < end; t += o.dt) {
      one.length = 0;
      acc += o.taps * o.dt;
      while (acc >= 1) {
        acc -= 1;
        const w = weakId(s);
        one.push(w ? { col: -1, kind: 'tap', entity: w } : { col: Math.floor(t * 13) % 7, kind: 'tap' });
      }
      if (o.noEvents) s.director.wait = 1e9;
      playWidgets(s, bus, one, !o.noFacets);
      stepIdle(s, o.dt, one, bus, startMs + (wall + t) * 1000);
      o.probe?.(s);
      if (s.tap.surgeArmedAt > 0) fireSurge(s, bus);
      if (!o.noSkills) for (const k of SKILLS) if (s.run.skills[k.id] && cooldownLeft(s, k.id) === 0 && !s.seal) useSkill(s, k.id, bus);
      if (s.meta.dailyReady) claimDaily(s, startMs + (wall + t) * 1000, bus);
      if (s.playTime >= nextBuy) {
        if (o.buyer === 'x1') botBuy(s, { ...BOT_DEFAULT, taps: o.taps }, 200);
        else botBuyChunked(s, o.taps);
        nextBuy = s.playTime + 0.5;
      }
      // Rekindle by the rule, never in the session's last 3 minutes.
      if (end - t > 180 && recommend(s).ok) {
        const prev = s.playTime - runStart;
        const record = Math.max(s.meta.cycleRecord, s.run.dmax);
        rekindle(s, bus);
        pendingPass = { prev, record, at: s.playTime };
      }
      if (pendingPass && s.run.dmax > pendingPass.record) {
        res.passes.push({ took: s.playTime - pendingPass.at, prev: pendingPass.prev, record: pendingPass.record });
        pendingPass = null;
      }
      if (res.googolAt === Infinity && s.meta.lifetime.gold.log10() >= 100) res.googolAt = s.playTime;
      if (res.rank10At === Infinity && s.meta.rank.r >= 10) res.rank10At = s.playTime;
      if (!res.feats30 && s.playTime >= 1800) res.feats30 = featTiers(s);
      if (s.playTime >= nextSample) {
        nextSample = s.playTime + (o.sampleEvery ?? 60);
        const crew = crewDpsLog10(s);
        res.samples.push({
          played: s.playTime, wall: wall + t, record: s.meta.record, depth: s.run.depth, rekindles: s.meta.stats.rekindles,
          embers: s.meta.embers.toNumber(), rank: s.meta.rank.r, featTiers: featTiers(s), codex: codexCount(s),
          biomes: s.meta.biomesSeen.length, side: sideProduct(s), goldLog10: s.meta.lifetime.gold.log10(),
          e20: crew === -Infinity ? NaN : Math.pow(10, gameDpsLog10(s, o.taps, crew) - crew),
        });
      }
    }
    wall += sess.len;
    // End of a day (the last session before midnight).
    const d = Math.floor(sess.at / 86400);
    const nextAt = sessions[sessions.indexOf(sess) + 1]?.at ?? Infinity;
    if (Math.floor(nextAt / 86400) > d || nextAt === Infinity) {
      res.dayEnd.push({ record: s.meta.record, newBiomes: s.meta.biomesSeen.length - dayBiomes, feats: featTiers(s), side: sideProduct(s), rank: s.meta.rank.r, played: s.playTime });
      dayBiomes = s.meta.biomesSeen.length;
      dayIdx++;
      o.log?.(`day ${dayIdx}: record ${s.meta.record} m, biome ${biomeAt(s.meta.record)} (${Math.min(AUTHORED_BIOMES, s.meta.biomesSeen.length)} seen), Rekindles ${s.meta.stats.rekindles}, rank ${s.meta.rank.r}, Feat tiers ${featTiers(s)}, side ×${sideProduct(s).toFixed(2)}, ${((Date.now() - t0) / 1000).toFixed(0)} s`);
    }
  }
  res.ms = Date.now() - t0;
  return res;
}

/** One E-metric the session sim measures (SPEC §13.1): its id, whether it holds, and what was measured. */
export interface DaysCheck {
  id: string;
  ok: boolean;
  text: string;
}

/** The E-metrics of a session-sim result (E8, E9, E10, E11, E18, E19, E20, E25); a day the sim did not reach is skipped. */
export function daysChecks(r: DaysResult): DaysCheck[] {
  const out: DaysCheck[] = [];
  const f = (x: number) => (Number.isFinite(x) ? `${Math.round(x)} s` : 'never');
  // E8: after a recommended Rekindle the next run passes the old record within max(10 min, 40 % of the previous run).
  const late = r.passes.filter((p) => p.took > Math.max(600, 0.4 * p.prev));
  out.push({ id: 'E8', ok: r.passes.length > 0 && late.length === 0, text: `${r.passes.length} passes, ${late.length} late (took ${r.passes.map((p) => Math.round(p.took)).join(', ')} s)` });
  // E9: never 3 consecutive Rekindles with runs < 3 min.
  let chain = 0;
  let worst = 0;
  for (const run of r.runs) {
    chain = run < 180 ? chain + 1 : 0;
    worst = Math.max(worst, chain);
  }
  out.push({ id: 'E9', ok: worst < 3, text: `${r.runs.length} Rekindles, longest chain of runs < 3 min: ${worst} (runs ${r.runs.map((x) => Math.round(x)).join(', ')} s)` });
  // E10: day 3 record ≥ 6,500 m; ≥ 1 new biome on days 2 and 3.
  if (r.dayEnd.length >= 3) {
    const d = r.dayEnd;
    out.push({ id: 'E10', ok: d[2].record >= 6500 && d[1].newBiomes >= 1 && d[2].newBiomes >= 1, text: `day 3 record ${d[2].record} m; new biomes day 2 ${d[1].newBiomes}, day 3 ${d[2].newBiomes}` });
  }
  // E11: 1e100 gold by the end of day 2.
  if (r.dayEnd.length >= 2) out.push({ id: 'E11', ok: r.googolAt <= r.dayEnd[1].played, text: `1e100 lifetime gold at ${f(r.googolAt)} played (day 2 ends at ${Math.round(r.dayEnd[1].played)} s)` });
  // E18: ≥ 12 tiers in 30 min, ≥ 25 by the end of day 1, ≥ 50 by day 3.
  const d1 = r.dayEnd[0]?.feats ?? NaN;
  const d3 = r.dayEnd[2]?.feats ?? NaN;
  out.push({ id: 'E18', ok: r.feats30 >= 12 && !(d1 < 25) && !(d3 < 50), text: `Feat tiers: ${r.feats30} at 30 min, ${d1} at day 1, ${Number.isNaN(d3) ? '—' : d3} at day 3` });
  // E19: rank 10 between 12 and 20 min of play.
  out.push({ id: 'E19', ok: r.rank10At >= 720 && r.rank10At <= 1200, text: `rank 10 at ${f(r.rank10At)} played (target 720–1200 s)` });
  // E20: active ÷ idle income between 2 and 4 at minutes 5, 30 and 120.
  const at = (m: number) => r.samples.reduce<DaySample | null>((b, x) => (Math.abs(x.played - m * 60) < Math.abs((b?.played ?? Infinity) - m * 60) ? x : b), null);
  const e20 = [5, 30, 120].map((m) => at(m)?.e20 ?? NaN);
  out.push({ id: 'E20', ok: e20.every((x) => x >= 2 && x <= 4), text: `active/idle ${e20.map((x) => x.toFixed(2)).join(' / ')} at 5 / 30 / 120 min` });
  // E25: side multipliers ≤ ×10 at the end of day 3 (≤ ×30 at day 7).
  const side3 = r.dayEnd[Math.min(2, r.dayEnd.length - 1)]?.side ?? NaN;
  const side7 = r.dayEnd[6]?.side ?? NaN;
  out.push({ id: 'E25', ok: !(side3 > 10) && !(side7 > 30), text: `side product ×${side3.toFixed(1)} at day ${Math.min(3, r.dayEnd.length)}${Number.isNaN(side7) ? '' : `, ×${side7.toFixed(1)} at day 7`}` });
  return out;
}

/** The tool's printout of a session-sim result. */
export function daysReport(r: DaysResult): string[] {
  const lines = [`  sim ${(r.ms / 1000).toFixed(1)} s; samples (played min: record / depth, Rekindles, rank, Feat tiers, side ×):`];
  for (const x of r.samples.filter((_, i) => i % 5 === 0)) lines.push(`    ${String(Math.round(x.played / 60)).padStart(4)} min  ${String(x.record).padStart(6)} / ${String(x.depth).padStart(6)} m  rk ${x.rekindles}  rank ${x.rank}  feats ${x.featTiers}  side ×${x.side.toFixed(1)}`);
  for (const c of daysChecks(r)) lines.push(`  ${c.id.padEnd(4)} ${c.ok ? 'ok  ' : 'FAIL'}  ${c.text}`);
  return lines;
}
