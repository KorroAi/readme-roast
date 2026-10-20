// Save v3 (SPEC §12.3): create, validate, normalize, and the conversion between the live IdleState and
// the saved form. Big values serialise as [m, e]; cell HP as remaining fractions; model times as seconds
// remaining (the model clock restarts at 0 each session). The save stays ≤ 16 KB (S1).

import { Big } from '../core/big';
import { createIdle } from '../idle/model/step';
import { fillRow } from '../idle/model/shaft';
import { wardenOf } from '../idle/model/seals';
import { COLS, newMeta, newRow, SHAFT_WINDOW, type IdleState } from '../idle/model/state';
import type { BigJSON, RowSave, SaveV3 } from './types';

export const SAVE_VERSION = 3;

const bj = (b: Big): BigJSON => [b.m, b.e];
const fromBj = (x: unknown): Big => Big.fromJSON(x);

/** A brand-new game's save (the first launch). */
export function createNewSave(seed: number, now: number): SaveV3 {
  return stateToSave(createIdle(seed, now));
}

/** The live state as a save (pure: reads the state only). */
export function stateToSave(s: IdleState): SaveV3 {
  const t = s.time;
  const rows: RowSave[] = s.shaft.rows.map((r) => ({ kinds: Array.from(r.kinds), left: Array.from(r.left, (v) => (v > 0 ? +v.toPrecision(15) : 0)) }));
  const skills: SaveV3['run']['skills'] = {};
  for (const [id, k] of Object.entries(s.run.skills)) {
    skills[id] = { lvl: k.lvl, cd: Math.max(0, k.cdEnd - t), active: Math.max(0, k.activeEnd - t), charges: k.charges };
  }
  const m = s.meta;
  const st = s.offline && !s.offline.collected ? s.offline : null;
  return {
    version: 3,
    savedAt: s.now,
    monotonicMs: s.monotonicMs,
    playTime: s.playTime,
    seed: s.seed,
    runIndex: s.runIndex,
    run: {
      depth: s.run.depth,
      rows,
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
      harvested: {},
      breach: null,
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
      bestiary: { ...m.bestiary },
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
          sealBiome: st.sealBiome, biomeCrossed: st.biomeCrossed,
        }
      : null,
    tap: { combo: s.tap.combo, rng: s.tap.rng },
  };
}

/** A live state from a (normalized, valid) save. `now` is the wall clock of this session's start. */
export function saveToState(d: SaveV3, now: number): IdleState {
  const s = createIdle(d.seed, d.savedAt);
  s.runIndex = d.runIndex;
  s.runSeed = runSeed(d.seed, d.runIndex);
  s.playTime = d.playTime;
  s.now = d.savedAt;
  s.monotonicMs = Math.max(d.monotonicMs, d.savedAt);
  // Meta first (seals decide how rows show).
  const m = s.meta;
  const dm = d.meta;
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
  m.bestiary = { ...dm.bestiary };
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
  m.tutorial = { step: dm.tutorial.step, done: dm.tutorial.done };
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
  // The run.
  const r = s.run;
  const dr = d.run;
  r.depth = dr.depth;
  r.dmax = Math.max(dr.dmaxRun, dr.depth);
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
  // A seal fight resumes held (the player starts it again with a tap; nothing lost).
  if (dr.seal) {
    s.seal = {
      biome: dr.seal.biome, depth: r.depth, hp: fromBj(dr.seal.hp), left: Math.max(0, Math.min(1, dr.seal.left)), endsAt: 0, time: 30, phase: 'held', started: 0,
      warden: wardenOf(dr.seal.biome), weakNext: 0, weakUntil: 0, weakIndex: 0, finisher: '', fails: 0,
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
    };
  }
  s.now = now;
  if (now > s.monotonicMs) s.monotonicMs = now;
  return s;
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

// ----- validation and normalization ---------------------------------------------------------------

const isObj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x);
const isNum = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);

/** Structural check of a v3 save (after normalization every field is present and typed). */
export function validateSaveData(x: unknown): x is SaveV3 {
  if (!isObj(x) || x.version !== 3) return false;
  if (!isNum(x.savedAt) || !isNum(x.seed) || !isNum(x.playTime) || x.playTime < 0 || !isNum(x.runIndex)) return false;
  const run = x.run;
  const meta = x.meta;
  if (!isObj(run) || !isObj(meta)) return false;
  if (!isNum(run.depth) || run.depth < 0 || !isNum(run.pick) || run.pick < 1) return false;
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
 * Fill every missing or invalid field of a v3 save from the defaults (a newer v3 field read by an
 * older build, a hand-edited save). Never throws.
 */
export function normalizeSave(x: unknown): { data: SaveV3; report: NormalizeReport } {
  const report: NormalizeReport = { fixed: 0, dropped: 0 };
  const src = isObj(x) ? x : {};
  const seed = isNum(src.seed) ? src.seed >>> 0 : 1;
  const savedAt = isNum(src.savedAt) ? src.savedAt : 0;
  const def = createNewSave(seed, savedAt);
  const out = deepFill(def, src, report) as SaveV3;
  out.version = 3;
  // Ranges.
  out.run.depth = Math.max(0, Math.floor(out.run.depth));
  out.run.pick = Math.max(1, Math.floor(out.run.pick));
  out.run.lines = out.run.lines.map((v) => (isNum(v) ? Math.max(0, Math.floor(v)) : 0));
  out.meta.gems = Math.max(0, Math.floor(out.meta.gems));
  out.meta.record = Math.max(out.meta.record, out.run.depth);
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
