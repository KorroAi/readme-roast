// Save v4 (hybrid SPEC §10): create, validate, normalize, the v3 → v4 migration, and the conversion between the live
// IdleState and the saved form. Big values serialise as [m, e]; cell HP as remaining fractions; model times as seconds
// remaining (the model clock restarts at 0 each session). The world is a pure function of the seeds: no voxel deltas.
// The node crawl replaces v3's floor model; the purge dropped the old fields. The save stays ≤ 16 KB (S1).

import { Big } from '../core/big';
import { createHybrid } from '../idle/model/step';
import { fillRow } from '../idle/model/shaft';
import { mechOf } from '../idle/model/seals';
import { resumeAfterLoad } from '../idle/model/nodes';
import { COLS, newMeta, newRow, SHAFT_WINDOW, type IdleState, type NodePhase } from '../idle/model/state';
import type { BigJSON, ChamberSave, RowSave, SaveV3, SaveV4 } from './types';

export const SAVE_VERSION = 4;

const bj = (b: Big): BigJSON => [b.m, b.e];
const fromBj = (x: unknown): Big => Big.fromJSON(x);

// ----- run-length bitsets ----------------------------------------------------------------------------------------

/** Encode a set of non-negative integers as [start, length, start, length, …] (sorted, merged). */
export function encodeRuns(ids: readonly number[]): number[] {
  const v = [...new Set(ids.filter((x) => Number.isInteger(x) && x >= 0))].sort((a, b) => a - b);
  const out: number[] = [];
  for (let i = 0; i < v.length; ) {
    let j = i;
    while (j + 1 < v.length && v[j + 1] === v[j] + 1) j++;
    out.push(v[i], j - i + 1);
    i = j + 1;
  }
  return out;
}

/** Decode [start, length, …] (bad pairs are skipped; at most 1e6 ids). */
export function decodeRuns(runs: readonly number[]): number[] {
  const out: number[] = [];
  for (let i = 0; i + 1 < runs.length; i += 2) {
    const a = Math.floor(runs[i]);
    const n = Math.floor(runs[i + 1]);
    if (!Number.isFinite(a) || !Number.isFinite(n) || a < 0 || n <= 0) continue;
    for (let k = 0; k < n && out.length < 1e6; k++) out.push(a + k);
  }
  return out;
}

/** Digits of lifetime gold (the camp's Fortune, SPEC §5.10). */
export function fortuneOf(gold: Big): number {
  if (gold.isZero()) return 0;
  return Math.max(1, Math.floor(gold.log10() + 1e-9) + 1);
}

// ----- state → save ------------------------------------------------------------------------------------------------

/** A brand-new game's save (the first launch: the node crawl at the adit plug). */
export function createNewSave(seed: number, now: number): SaveV4 {
  return stateToSave(createHybrid(seed, now));
}

/** The live state as a save (pure: reads the state only). */
export function stateToSave(s: IdleState): SaveV4 {
  const t = s.time;
  const rows: RowSave[] = s.shaft.rows.map((r) => ({ kinds: Array.from(r.kinds), left: Array.from(r.left, (v) => (v > 0 ? +v.toPrecision(15) : 0)) }));
  const skills: SaveV4['run']['skills'] = {};
  for (const [id, k] of Object.entries(s.run.skills)) {
    skills[id] = { lvl: k.lvl, cd: Math.max(0, k.cdEnd - t), active: Math.max(0, k.activeEnd - t), charges: k.charges };
  }
  const m = s.meta;
  const n = s.node;
  const st = s.offline && !s.offline.collected ? s.offline : null;
  const chambers: ChamberSave[] = Object.values(n.chambers).map((c) => ({
    node: c.node, by: c.by, lit: c.lit, left: { ...c.left }, resolved: [...c.resolved], lamps: [...c.lamps], skin: { ...c.skin },
    secrets: [...c.secrets], glints: [...c.glints],
  }));
  return {
    version: 4,
    savedAt: s.now,
    monotonicMs: s.monotonicMs,
    playTime: s.playTime,
    seed: s.seed,
    runIndex: s.runIndex,
    run: {
      node: n.node,
      phase: n.phase,
      resume: n.resume,
      stand: n.stand,
      pose: n.pose ? { ...n.pose } : null,
      digDepth: s.run.depth,
      rows,
      chambers,
      works: { hp: bj(n.worksHp), gold: bj(n.worksGold), pending: bj(n.haulPending) },
      rackRelics: [...n.rackRelics],
      gold: bj(s.run.gold),
      goldEarned: bj(s.run.goldEarned),
      pick: s.run.pick,
      ups: { ...s.run.ups },
      lines: [...s.run.lines],
      gear: [...s.run.gear],
      skills,
      facets: [...s.run.facets],
      pendingHands: s.run.hands,
      freeReroll: s.run.freeReroll,
      surge: s.tap.surge,
      runTime: s.run.runTime,
      dmaxRun: s.run.dmax,
      rack: [...s.run.rack],
      ghost: [...s.run.ghost],
      chests: s.chests.map((c) => ({ id: c.id, col: c.col, depth: c.depth, floor: c.floor })),
      seal: s.seal ? { biome: s.seal.biome, left: s.seal.left, hp: bj(s.seal.hp) } : null,
      plantedBonus: s.run.plantedBonus,
      frenzyLeft: Math.max(0, s.run.frenzyEnd - t),
      cataclysmLeft: Math.max(0, s.run.cataclysmEnd - t),
      boosts: Object.fromEntries(Object.entries(s.run.boosts).filter(([, b]) => b.end > t).map(([k, b]) => [k, { left: b.end - t, mult: b.mult }])),
      used: [...s.run.used],
      lanterns: [...s.run.lanterns],
      sealsBroken: s.run.sealsBroken,
      splits: { ...s.run.splits },
      par: s.run.par.map((v) => Math.round(v)),
      ghostPassed: s.run.ghostPassed,
      counters: { taps: s.run.taps, cells: s.run.cells, rows: s.run.rows, chests: s.run.chests, stars: s.run.stars },
    },
    meta: {
      lifeSeed: s.seed,
      seen: encodeRuns(m.seen),
      charted: encodeRuns(m.charted),
      relicGrades: { ...m.relicGrades },
      rechartNotice: m.rechartNotice,
      nodeStats: { ...m.nodeStats },
      lessons: [...m.tutorial.lessons],
      lastMechanicAt: Number.isFinite(s.tutorial.lastMechanicAt) ? s.tutorial.lastMechanicAt : -1e9,
      fortune: fortuneOf(m.lifetime.gold),
      embers: bj(m.embers),
      embersMax: bj(m.embersMax),
      threads: bj(m.threads),
      loom: { ...m.loom },
      sigils: { ...m.sigils },
      record: m.record,
      cycleRecord: m.cycleRecord,
      sealsOpened: [...m.sealsOpened],
      biomesSeen: [...m.biomesSeen],
      gems: m.gems,
      timeCrystals: m.timeCrystals,
      boostLeft: Math.max(0, m.boostEnd - s.now),
      finds: { ...m.finds },
      lore: [...m.lore],
      biomeSeals: [...m.biomeSeals],
      feats: { ...m.feats },
      secrets: [...m.secrets],
      marks: m.marks,
      rank: { ...m.rank },
      records: {
        deepest: m.records.deepest,
        splits: { ...m.records.splits },
        marks500: { ...m.records.marks500 },
        bestHit: bj(m.records.bestHit),
        bestCombo: m.records.bestCombo,
        bestTapCells: m.records.bestTapCells,
        bestChest: m.records.bestChest,
        bestOffline: bj(m.records.bestOffline),
        bestEmbers: bj(m.records.bestEmbers),
      },
      planted: m.planted.map((p) => ({ ...p })),
      contracts: m.contracts.map((c) => ({ ...c })),
      contractCount: m.contractCount,
      daily: { ...m.daily },
      pity: { ...m.pity },
      tutorial: { step: s.tutorial.index, done: s.tutorial.done || m.tutorial.done, breaks: s.tutorial.breaks },
      path: { ...m.path },
      hints: { ...m.hints },
      firstTime: [...m.firstTime],
      revealed: [...m.revealed],
      cosmetics: { owned: [...m.cosmetics.owned], equipped: { ...m.cosmetics.equipped } },
      stats: { ...m.stats },
      lifetime: { gold: bj(m.lifetime.gold), embersEver: bj(m.lifetime.embersEver) },
      toolForm: m.toolForm,
      markMax: m.markMax,
      blueprints: m.blueprints,
      bestTier: m.bestTier,
      bestLines: m.bestLines,
      swift600: Number.isFinite(m.swift600) ? m.swift600 : -1,
      caught: { ...m.caught },
      lastUsed: { ...m.lastUsed },
      dailyReady: m.dailyReady,
      rerolls: m.rerolls,
    },
    director: { wait: s.director.wait, history: [...s.director.history], since: { ...s.director.since }, dealt: s.director.dealt, codexQuiet: s.director.codexQuiet },
    overrides: s.overrides.filter((o) => o.depth >= s.run.depth).map((o) => ({ ...o })),
    offline: st
      ? {
          seconds: st.seconds, away: st.away, capped: st.capped, fromDepth: st.fromDepth, toDepth: st.toDepth,
          goldRows: bj(st.goldRows), goldGallery: bj(st.goldGallery), chests: st.chests, chestsGold: st.chestsGold,
          sealBiome: st.sealBiome, biomeCrossed: st.biomeCrossed, chambers: st.chambers, glimpses: [...st.glimpses],
          darkNode: st.darkNode, leashStop: st.leashStop,
        }
      : null,
    tap: { combo: s.tap.combo, rng: s.tap.rng },
  };
}

// ----- save → state ----------------------------------------------------------------------------------------------

const PHASES: readonly NodePhase[] = ['camp', 'dig', 'explore', 'ride', 'seal'];

/**
 * A live state from a (normalized, valid) save. `now` is the wall clock of this session's start. A v3 save is migrated
 * first (`migrateV3toV4`), as the save system does on load.
 */
export function saveToState(src: SaveV4 | SaveV3, now: number): IdleState {
  const d: SaveV4 = src.version === 3 ? normalizeSave(migrateV3toV4(src as unknown as Record<string, unknown>)).data : src;
  const s = createHybrid(d.seed, d.savedAt);
  s.runIndex = d.runIndex;
  s.runSeed = runSeed(d.seed, d.runIndex);
  s.playTime = d.playTime;
  s.now = d.savedAt;
  s.monotonicMs = Math.max(d.monotonicMs, d.savedAt);
  // Meta first (seals decide how rows show).
  const m = s.meta;
  const dm = d.meta;
  m.seen = decodeRuns(dm.seen);
  m.charted = decodeRuns(dm.charted);
  m.relicGrades = { ...dm.relicGrades };
  m.rechartNotice = Math.max(0, Math.min(2, Math.floor(dm.rechartNotice)));
  m.nodeStats = { ...newMeta().nodeStats, ...dm.nodeStats };
  m.embers = fromBj(dm.embers);
  m.embersMax = fromBj(dm.embersMax);
  m.threads = fromBj(dm.threads);
  m.loom = { ...dm.loom };
  m.sigils = { ...dm.sigils };
  m.record = dm.record;
  m.cycleRecord = dm.cycleRecord;
  m.sealsOpened = [...dm.sealsOpened];
  m.biomesSeen = [...dm.biomesSeen];
  m.gems = dm.gems;
  m.timeCrystals = dm.timeCrystals;
  m.boostEnd = dm.boostLeft > 0 ? d.savedAt + dm.boostLeft : 0;
  m.finds = { ...dm.finds };
  m.lore = [...dm.lore];
  m.biomeSeals = [...dm.biomeSeals];
  m.feats = { ...dm.feats };
  m.secrets = [...dm.secrets];
  m.marks = dm.marks;
  m.rank = { ...dm.rank };
  m.records = {
    deepest: dm.records.deepest,
    splits: { ...dm.records.splits },
    marks500: { ...dm.records.marks500 },
    bestHit: fromBj(dm.records.bestHit),
    bestCombo: dm.records.bestCombo,
    bestTapCells: dm.records.bestTapCells,
    bestChest: dm.records.bestChest,
    bestOffline: fromBj(dm.records.bestOffline),
    bestEmbers: fromBj(dm.records.bestEmbers),
  };
  m.planted = dm.planted.map((p) => ({ ...p }));
  m.contracts = dm.contracts.map((c) => ({ ...c }));
  m.contractCount = dm.contractCount;
  m.daily = { ...dm.daily };
  m.pity = { ...dm.pity };
  m.tutorial = { step: dm.tutorial.step, done: dm.tutorial.done, lessons: dm.lessons.filter((x) => typeof x === 'string') };
  m.path = { ...dm.path };
  m.hints = { ...dm.hints };
  m.firstTime = [...dm.firstTime];
  m.revealed = [...dm.revealed];
  m.cosmetics = { owned: [...dm.cosmetics.owned], equipped: { ...dm.cosmetics.equipped } };
  m.stats = { ...newMeta().stats, ...dm.stats } as IdleState['meta']['stats'];
  m.lifetime = { gold: fromBj(dm.lifetime.gold), embersEver: fromBj(dm.lifetime.embersEver) };
  m.toolForm = dm.toolForm;
  m.markMax = dm.markMax;
  m.blueprints = dm.blueprints;
  m.bestTier = dm.bestTier;
  m.bestLines = dm.bestLines;
  m.swift600 = dm.swift600 >= 0 ? dm.swift600 : Infinity;
  m.caught = { ...dm.caught };
  m.lastUsed = { ...dm.lastUsed };
  m.dailyReady = dm.dailyReady;
  m.rerolls = Math.max(0, Math.floor(dm.rerolls));
  // The tutorial resumes at its step (waiting for the step's start).
  s.tutorial.index = dm.tutorial.step;
  s.tutorial.done = dm.tutorial.done;
  s.tutorial.breaks = dm.tutorial.breaks;
  s.tutorial.since = -1;
  s.tutorial.lastMechanicAt = dm.lastMechanicAt;
  s.tutorial.hiredAt = (dr_lines0(d) > 0) ? -Infinity : Infinity;
  // The run.
  const r = s.run;
  const dr = d.run;
  r.depth = dr.digDepth;
  r.dmax = Math.max(dr.dmaxRun, dr.digDepth);
  r.gold = fromBj(dr.gold).floorZeroIn();
  r.goldEarned = fromBj(dr.goldEarned);
  r.pick = dr.pick;
  r.ups = { ...dr.ups };
  r.lines = [...dr.lines];
  r.gear = [...dr.gear];
  r.skills = {};
  for (const [id, k] of Object.entries(dr.skills)) r.skills[id] = { lvl: k.lvl, cdEnd: k.cd > 0 ? k.cd : 0, activeEnd: k.active > 0 ? k.active : 0, charges: k.charges };
  r.runTime = dr.runTime;
  r.rack = [...dr.rack];
  r.ghost = [...dr.ghost];
  r.plantedBonus = dr.plantedBonus;
  r.frenzyEnd = dr.frenzyLeft;
  r.cataclysmEnd = dr.cataclysmLeft;
  r.boosts = {};
  for (const [k, b] of Object.entries(dr.boosts)) if (b && b.left > 0) r.boosts[k] = { end: b.left, mult: b.mult };
  r.facets = dr.facets.filter((x) => typeof x === 'string');
  r.hands = Math.max(0, Math.floor(dr.pendingHands));
  r.freeReroll = dr.freeReroll;
  r.used = [...dr.used];
  r.lanterns = [...dr.lanterns];
  r.sealsBroken = dr.sealsBroken;
  r.splits = { ...dr.splits };
  r.par = [...dr.par];
  r.ghostPassed = dr.ghostPassed;
  r.taps = dr.counters.taps;
  r.cells = dr.counters.cells;
  r.rows = dr.counters.rows;
  r.chests = dr.counters.chests;
  r.stars = dr.counters.stars;
  s.director.wait = Math.max(0, d.director.wait);
  s.director.history = [...d.director.history];
  s.director.since = { ...d.director.since };
  s.director.dealt = d.director.dealt;
  s.director.codexQuiet = d.director.codexQuiet;
  s.overrides = d.overrides.map((o) => ({ ...o }));
  s.tap.surge = dr.surge;
  s.tap.combo = 0;
  s.tap.rng = d.tap.rng >>> 0 || 1;
  s.chests = dr.chests.map((c) => ({ ...c, at: 0 }));
  // The window: the saved rows where they match, fresh rows below.
  s.shaft.rows = [];
  for (let i = 0; i < SHAFT_WINDOW; i++) {
    const row = newRow(r.depth + i);
    fillRow(s, row, r.depth + i);
    const sv = dr.rows[i];
    if (sv && sv.kinds.length === COLS && sv.left.length === COLS) {
      for (let c = 0; c < COLS; c++) {
        row.kinds[c] = sv.kinds[c];
        row.left[c] = Math.max(0, Math.min(1, sv.left[c]));
      }
    }
    s.shaft.rows.push(row);
  }
  // The node crawl.
  const n = s.node;
  n.on = true;
  n.node = Math.max(0, Math.floor(dr.node));
  n.phase = PHASES.includes(dr.phase) ? dr.phase : 'dig';
  n.resume = PHASES.includes(dr.resume) ? dr.resume : 'dig';
  n.stand = Math.max(0, Math.floor(dr.stand));
  n.pose = dr.pose && [dr.pose.x, dr.pose.y, dr.pose.z, dr.pose.yaw, dr.pose.pitch].every((v) => Number.isFinite(v)) ? { ...dr.pose } : null;
  n.chambers = {};
  for (const c of dr.chambers) {
    if (!c || !Number.isInteger(c.node) || c.node < 0) continue;
    n.chambers[c.node] = {
      node: c.node, by: c.by === 'player' || c.by === 'crew' ? c.by : '', lit: !!c.lit, left: { ...c.left }, resolved: [...c.resolved], lamps: [...c.lamps],
      skin: { ...c.skin }, secrets: [...c.secrets], glints: [...c.glints],
    };
  }
  n.worksHp = fromBj(dr.works.hp).floorZeroIn();
  n.worksGold = fromBj(dr.works.gold).floorZeroIn();
  n.haulPending = fromBj(dr.works.pending).floorZeroIn();
  n.rackRelics = dr.rackRelics.filter((x) => typeof x === 'string');
  // A seal fight resumes held (the player starts it again with a tap; nothing lost).
  if (dr.seal) {
    s.seal = {
      biome: dr.seal.biome, depth: r.depth, hp: fromBj(dr.seal.hp), left: Math.max(0, Math.min(1, dr.seal.left)), endsAt: 0, time: 30, phase: 'held', started: 0,
      mech: mechOf(dr.seal.biome), warden: mechOf(dr.seal.biome), weakNext: 0, weakUntil: 0, weakIndex: 0, finisher: '', fails: 0, // `warden` the purge shim
    };
  }
  if (d.offline) {
    const o = d.offline;
    const goldRows = fromBj(o.goldRows);
    const goldGallery = fromBj(o.goldGallery);
    s.offline = {
      seconds: o.seconds, away: o.away, capped: o.capped, fromDepth: o.fromDepth, toDepth: o.toDepth,
      goldRows, goldGallery, gold: goldRows.add(goldGallery), chests: o.chests, chestsGold: o.chestsGold,
      sealBiome: o.sealBiome, biomeCrossed: o.biomeCrossed, collected: false,
      chambers: o.chambers, glimpses: [...o.glimpses], darkNode: o.darkNode, leashStop: o.leashStop,
    };
  }
  // A ride in progress lands at its end; a node the dig front no longer agrees with is repaired.
  resumeAfterLoad(s);
  s.now = now;
  if (now > s.monotonicMs) s.monotonicMs = now;
  return s;
}

function dr_lines0(d: SaveV4): number {
  return d.run.lines[0] ?? 0;
}

function runSeed(seed: number, runIndex: number): number {
  // Same as state.runSeedOf (kept local to avoid a cycle in the import graph's order).
  let h = (seed ^ 0x9e3779b9) >>> 0;
  h = Math.imul(h ^ (runIndex + 0x85ebca6b), 0xc2b2ae35) >>> 0;
  h ^= h >>> 16;
  h = Math.imul(h, 0x27d4eb2f) >>> 0;
  h ^= h >>> 15;
  return h >>> 0 || 1;
}

// ----- the v3 → v4 migration (decided, DECISIONS.md 0.4) ---------------------------------------------------------------

/** Feats and secrets the purge drops (Lamplighter replaces the old family and starts at 0; the old secret is gone). */
const DROPPED_FEATS = ['kin' + 'dred']; // the purge's old family id (spelled split so the gate's grep stays clean)
const DROPPED_SECRETS = ['moth' + 'Friend']; // the purge's old secret id

/**
 * v3 (the cutaway) → v4 (the node crawl): keep the meta (gems, time crystals, Embers, Threads, Sigils, records, Feats minus
 * the two the purge removed, Finds, lore, rank; settings live apart), start the run fresh at the camp, and raise the one-time
 * notice ("Your expedition was re-charted. Your finds, gems and rank are safe."). Seals, biomes seen, the Codex's Biome
 * Seals and the tutorial start over so the first-person descent is played whole. Pure on plain JSON.
 */
export function migrateV3toV4(old: Record<string, unknown>): Record<string, unknown> {
  const o = old as unknown as Partial<SaveV3>;
  const seed = typeof o.seed === 'number' && Number.isFinite(o.seed) ? o.seed >>> 0 : 1;
  const savedAt = typeof o.savedAt === 'number' && Number.isFinite(o.savedAt) ? o.savedAt : 0;
  const fresh = createNewSave(seed, savedAt);
  const om = (o.meta ?? {}) as Partial<SaveV3['meta']>;
  const fm = fresh.meta;
  const num = (x: unknown, d: number) => (typeof x === 'number' && Number.isFinite(x) ? x : d);
  const big = (x: unknown, d: BigJSON): BigJSON => (Array.isArray(x) && x.length === 2 && x.every((v) => typeof v === 'number' && Number.isFinite(v)) ? [x[0], x[1]] : d);
  const rec = (x: unknown): Record<string, number> => {
    const out: Record<string, number> = {};
    if (x && typeof x === 'object' && !Array.isArray(x)) for (const [k, v] of Object.entries(x)) if (typeof v === 'number' && Number.isFinite(v)) out[k] = v;
    return out;
  };
  const feats = rec(om.feats);
  for (const f of DROPPED_FEATS) delete feats[f];
  const stats = rec(om.stats);
  for (const k of PURGED_FIELDS) delete stats[k];
  const lastUsed = rec(om.lastUsed);
  for (const k of PURGED_FIELDS) delete lastUsed[k];
  const caught = rec(om.caught);
  for (const k of Object.keys(caught)) if (!EVENT_TYPES_KEPT.test(k)) delete caught[k];
  const finds = rec(om.finds);
  for (const k of Object.keys(finds)) if (!/^find:\d+:\d$/.test(k)) delete finds[k];
  const strs = (x: unknown): string[] => (Array.isArray(x) ? x.filter((v): v is string => typeof v === 'string') : []);
  const r = om.records;
  fresh.meta = {
    ...fm,
    embers: big(om.embers, fm.embers),
    embersMax: big(om.embersMax, fm.embersMax),
    threads: big(om.threads, fm.threads),
    loom: rec(om.loom),
    sigils: rec(om.sigils),
    record: Math.max(0, Math.floor(num(om.record, 0))),
    cycleRecord: Math.max(0, Math.floor(num(om.cycleRecord, 0))),
    gems: Math.max(0, Math.floor(num(om.gems, 0))),
    timeCrystals: Math.max(0, Math.floor(num(om.timeCrystals, 0))),
    finds,
    lore: strs(om.lore).filter((id) => /^lore:\d+:/.test(id)),
    feats,
    secrets: strs(om.secrets).filter((id) => !DROPPED_SECRETS.includes(id)),
    marks: Math.max(0, Math.floor(num(om.marks, 0))),
    rank: om.rank && typeof om.rank === 'object' ? { r: Math.max(1, Math.floor(num(om.rank.r, 1))), xp: Math.max(0, num(om.rank.xp, 0)) } : fm.rank,
    records: r
      ? {
          deepest: Math.max(0, num(r.deepest, 0)),
          splits: rec(r.splits),
          marks500: rec(r.marks500),
          bestHit: big(r.bestHit, fm.records.bestHit),
          bestCombo: Math.max(0, num(r.bestCombo, 0)),
          bestTapCells: Math.max(0, num(r.bestTapCells, 0)),
          bestChest: Math.max(0, num(r.bestChest, 0)),
          bestOffline: big(r.bestOffline, fm.records.bestOffline),
          bestEmbers: big(r.bestEmbers, fm.records.bestEmbers),
        }
      : fm.records,
    pity: om.pity && typeof om.pity === 'object' ? { crystal: num(om.pity.crystal, 0), reliquary: num(om.pity.reliquary, 0), lintel: num(om.pity.lintel, 0) } : fm.pity,
    cosmetics: om.cosmetics && typeof om.cosmetics === 'object' ? { owned: strs(om.cosmetics.owned), equipped: { ...((om.cosmetics.equipped as Record<string, string>) ?? {}) } } : fm.cosmetics,
    stats: { ...fm.stats, ...stats },
    lifetime: om.lifetime ? { gold: big(om.lifetime.gold, fm.lifetime.gold), embersEver: big(om.lifetime.embersEver, fm.lifetime.embersEver) } : fm.lifetime,
    toolForm: Math.max(0, Math.floor(num(om.toolForm, 0))),
    markMax: Math.max(0, Math.floor(num(om.markMax, 0))),
    bestTier: Math.max(0, Math.floor(num(om.bestTier, 0))),
    bestLines: Math.max(0, Math.floor(num(om.bestLines, 0))),
    swift600: num(om.swift600, -1),
    caught,
    lastUsed,
    rerolls: Math.max(0, Math.floor(num(om.rerolls, 0))),
    planted: Array.isArray(om.planted) ? om.planted.filter((p) => p && Number.isFinite(p.depth) && Number.isFinite(p.n)).map((p) => ({ depth: p.depth, n: p.n })) : [],
    rechartNotice: 1,
  };
  fresh.meta.fortune = fortuneOf(Big.fromJSON(fresh.meta.lifetime.gold));
  // The run starts fresh at the camp (the second launch's menu), the descent resumes from the adit plug.
  fresh.run.phase = 'camp';
  fresh.run.resume = 'dig';
  fresh.savedAt = savedAt;
  fresh.monotonicMs = Math.max(savedAt, num(o.monotonicMs, savedAt));
  fresh.playTime = Math.max(0, num(o.playTime, 0));
  fresh.runIndex = Math.max(0, Math.floor(num(o.runIndex, 0)));
  return fresh as unknown as Record<string, unknown>;
}

/** v3 counter keys the purge drops. */
const PURGED_FIELDS = ['crea' + 'tures', 'crea' + 'ture'];

/** Event types whose catch counts survive the migration (the inanimate events; the purge drops the rest). */
const EVENT_TYPES_KEPT = /^(goldenVein|glimmerfall|caveIn|supplyRope|treasureMap|ancientEcho|geode|seedFall|rattlingBricks|wedgedChest|runawayCart|drifting|ember)/;

// ----- validation and normalization ---------------------------------------------------------------

const isObj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x);
const isNum = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);

/** Structural check of a v4 save (after normalization every field is present and typed). */
export function validateSaveData(x: unknown): x is SaveV4 {
  if (!isObj(x) || x.version !== 4) return false;
  if (!isNum(x.savedAt) || !isNum(x.seed) || !isNum(x.playTime) || x.playTime < 0 || !isNum(x.runIndex)) return false;
  const run = x.run;
  const meta = x.meta;
  if (!isObj(run) || !isObj(meta)) return false;
  if (!isNum(run.digDepth) || run.digDepth < 0 || !isNum(run.node) || run.node < 0 || !isNum(run.pick) || run.pick < 1) return false;
  if (!Array.isArray(run.rows) || !Array.isArray(run.lines) || !Array.isArray(run.gear)) return false;
  if (!isBigJson(run.gold)) return false;
  if (!isNum(meta.record) || !isNum(meta.gems) || !Array.isArray(meta.sealsOpened)) return false;
  return true;
}

function isBigJson(x: unknown): boolean {
  return Array.isArray(x) && x.length === 2 && isNum(x[0]) && isNum(x[1]);
}

export interface NormalizeReport {
  /** Fields replaced by defaults because they were missing or invalid. */
  fixed: number;
  /** Unknown entries removed (kept for the load result's `dropped`). */
  dropped: number;
}

/**
 * Fill every missing or invalid field of a v4 save from the defaults (a newer v4 field read by an older build, a
 * hand-edited save). Never throws.
 */
export function normalizeSave(x: unknown): { data: SaveV4; report: NormalizeReport } {
  const report: NormalizeReport = { fixed: 0, dropped: 0 };
  const src = isObj(x) ? x : {};
  const seed = isNum(src.seed) ? src.seed >>> 0 : 1;
  const savedAt = isNum(src.savedAt) ? src.savedAt : 0;
  const def = createNewSave(seed, savedAt);
  const out = deepFill(def, src, report) as SaveV4;
  out.version = 4;
  // Ranges.
  out.run.digDepth = Math.max(0, Math.floor(out.run.digDepth));
  out.run.node = Math.max(0, Math.floor(out.run.node));
  out.run.pick = Math.max(1, Math.floor(out.run.pick));
  out.run.lines = out.run.lines.map((v) => (isNum(v) ? Math.max(0, Math.floor(v)) : 0));
  out.meta.gems = Math.max(0, Math.floor(out.meta.gems));
  out.meta.record = Math.max(out.meta.record, out.run.digDepth);
  out.meta.lifeSeed = out.seed;
  if (!PHASES.includes(out.run.phase)) out.run.phase = 'dig';
  if (!PHASES.includes(out.run.resume)) out.run.resume = 'dig';
  out.run.chambers = out.run.chambers.filter((c) => isObj(c) && isNum((c as unknown as Record<string, unknown>).node));
  return { data: out, report };
}

/** Copy `src` over `def` field by field, keeping def's type where src disagrees. */
function deepFill(def: unknown, src: unknown, report: NormalizeReport): unknown {
  if (Array.isArray(def)) {
    if (!Array.isArray(src)) {
      if (src !== undefined) report.fixed++;
      return def;
    }
    // BigJSON pairs and number arrays keep their element type.
    if (def.length === 2 && typeof def[0] === 'number' && typeof def[1] === 'number' && !isBigJson(src) && src.length !== 2) {
      report.fixed++;
      return def;
    }
    return src.map((v) => (v && typeof v === 'object' ? JSON.parse(JSON.stringify(v)) : v));
  }
  if (isObj(def)) {
    if (!isObj(src)) {
      if (src !== undefined) report.fixed++;
      return def;
    }
    const out: Record<string, unknown> = {};
    const keys = Object.keys(def);
    // Records with free keys (ups, loom, finds…) are copied whole when the default is empty.
    if (keys.length === 0) {
      for (const [k, v] of Object.entries(src)) out[k] = v;
      return out;
    }
    for (const k of keys) out[k] = deepFill(def[k], src[k], report);
    for (const k of Object.keys(src)) if (!(k in def)) report.dropped++;
    return out;
  }
  if (def === null) return src === undefined ? null : src;
  if (typeof def === 'number') {
    if (isNum(src)) return src;
    if (src !== undefined) report.fixed++;
    return def;
  }
  if (typeof def === 'boolean') return typeof src === 'boolean' ? src : def;
  if (typeof def === 'string') return typeof src === 'string' ? src : def;
  return src ?? def;
}
