// The shaft model (SPEC §3.2, §6.2): 7-cell rows whose cells store their remaining HP as a fraction;
// damage applies in log space to the target cell, pierces down the column, then flows into the nearest
// living cell of the floor row, then the next row (total damage conserved exactly); the leftover
// crumble at 5 of 7; seals at unopened biome starts; analytic rows past what one hit can show.
//
// Row content is a pure function of (runSeed, depth): `rowKinds()`. The world's slab generator (B, pass
// 4) calls it for the shaft footprint so the screen and the model agree cell for cell, and carves a
// cavern around every `breakthroughs()` span.

import { Big } from '../../core/big';
import type { HitSource, IdleBus } from '../bus';
import { AUTHORED_BIOMES, biomeAt, biomeStart } from '../config/biomes';
import { CHEST_EVERY, KINDS, kindGoldLog10, kindHpLog10, mixFor, SOIL_ROWS } from '../config/cells';
import { toolFormForBiome } from '../config/gear';
import { CRUMBLE_AT, CRUMBLE_DELAY, goldPerHp, hpLog10, KAPPA, rowCostLog10, rowsForWork, subLog } from '../config/curves';
import { CELL, CENTRE_COL, COLS, type CellKind, type IdleState, newRow, type RowState, SHAFT_WINDOW } from './state';
import { DEPTH_CARDS } from '../config/biomes';
import { XP } from '../config/rank';
import { rackChest } from './chests';
import { mapChestFound, noteSpecial, openGeode, overrideFloor, pityFind } from './director';
import { facetStats } from './facets';
import { addXp } from './gain';
import { mults } from './mult';
import { collectPassed } from './records';
import { currentPage, rollFind } from './codex';
import { chartedGate } from './seals';

const L10 = Math.log10;

// ----- deterministic row content ----------------------------------------------------------------------

/** 32-bit hash of integers (seeded). */
export function hash3(seed: number, a: number, b: number): number {
  let h = (seed ^ 0x2c1b3c6d) >>> 0;
  h = Math.imul(h ^ (a | 0), 0x297a2d39) >>> 0;
  h = Math.imul(h ^ (b | 0), 0x85ebca6b) >>> 0;
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35) >>> 0;
  h ^= h >>> 16;
  return h >>> 0;
}

/** Uniform [0, 1) from a hash. */
export function u01(seed: number, a: number, b: number): number {
  return hash3(seed, a, b) / 4294967296;
}

/** The authored tutorial rows 0–39 (SPEC §8.2): copper at row 3, a chest at 6, a gem at 9, the crossing at 24–27. */
export const TUTORIAL_ROWS = 40;
/** The tutorial's 4 m cavern crossing (rows open in the shaft). */
export const TUTORIAL_CROSSING = { top: 24, bottom: 27 } as const;

const TUT: Record<number, Array<[number, CellKind]>> = {
  3: [[2, CELL.ORE], [5, CELL.ORE]],
  6: [[CENTRE_COL, CELL.CHEST]],
  9: [[4, CELL.GEM]],
  12: [[1, CELL.ORE]],
  15: [[0, CELL.ORE], [1, CELL.ORE]],
  18: [[5, CELL.RICH]],
  21: [[3, CELL.ORE], [4, CELL.ORE]],
  23: [[1, CELL.RICH], [2, CELL.ORE]],
  28: [[0, CELL.ORE], [1, CELL.ORE]],
  29: [[5, CELL.RICH]],
  30: [[6, CELL.ORE], [5, CELL.ORE]],
  31: [[3, CELL.GEM]],
  32: [[5, CELL.ORE], [6, CELL.ORE]],
  33: [[2, CELL.RICH]],
  34: [[1, CELL.ORE], [2, CELL.ORE]],
  36: [[0, CELL.ORE], [4, CELL.GEM]],
  35: [[3, CELL.RICH]],
  37: [[4, CELL.ORE], [5, CELL.ORE]],
  38: [[1, CELL.ORE], [2, CELL.ORE]],
  39: [[3, CELL.RICH]],
};

/** Grotto breakthroughs below the tutorial: one every 25–40 rows, 3–5 rows open in the shaft. */
export const GROTTO = { minGap: 25, maxGap: 40, minRows: 3, maxRows: 5, from: 46 } as const;

/** The open spans [top, bottom] (inclusive) crossing the shaft in [from, to). Deterministic per run seed. */
export function breakthroughs(runSeed: number, from: number, to: number): Array<{ top: number; bottom: number }> {
  const out: Array<{ top: number; bottom: number }> = [];
  if (from <= TUTORIAL_CROSSING.bottom && to > TUTORIAL_CROSSING.top) out.push({ top: TUTORIAL_CROSSING.top, bottom: TUTORIAL_CROSSING.bottom });
  // Grottos sit in fixed 40-row cells (one per cell, jittered), so any window is cheap to query.
  const c0 = Math.max(0, Math.floor((Math.max(from, GROTTO.from) - GROTTO.from) / GROTTO.maxGap) - 1);
  const c1 = Math.floor((to - GROTTO.from) / GROTTO.maxGap) + 1;
  for (let c = c0; c <= c1; c++) {
    const g = grottoInCell(runSeed, c);
    if (g && g.bottom >= from && g.top < to) out.push(g);
  }
  return out;
}

function grottoInCell(runSeed: number, c: number): { top: number; bottom: number } | null {
  const base = GROTTO.from + c * GROTTO.maxGap;
  const span = GROTTO.minGap; // jitter keeps neighbours 25–40 apart on average
  const top = base + Math.floor(u01(runSeed, 0x6707, c) * (GROTTO.maxGap - span + 1));
  const rows = GROTTO.minRows + Math.floor(u01(runSeed, 0x6708, c) * (GROTTO.maxRows - GROTTO.minRows + 1));
  let bottom = top + rows - 1;
  // Never through a biome start (the gate row and the seal hall) or a chest row.
  const k = biomeAt(top);
  const nextStart = biomeStart(k + 1);
  if (top - biomeStart(k) < 3 || bottom >= nextStart - 2) return null;
  for (let d = top; d <= bottom; d++) if (d % CHEST_EVERY === CHEST_EVERY - 1) return null;
  if (bottom < top) bottom = top;
  return { top, bottom };
}

/** True when row d is open in the shaft (a cavern crossing). */
export function isOpenRow(runSeed: number, d: number): boolean {
  if (d >= TUTORIAL_CROSSING.top && d <= TUTORIAL_CROSSING.bottom) return true;
  if (d < GROTTO.from) return false;
  const c = Math.floor((d - GROTTO.from) / GROTTO.maxGap);
  for (const cc of [c - 1, c]) {
    if (cc < 0) continue;
    const g = grottoInCell(runSeed, cc);
    if (g && d >= g.top && d <= g.bottom) return true;
  }
  return false;
}

/** True when row d is the first row of a biome (a gate, or the seal while never opened). */
export function isGateRow(d: number): boolean {
  if (d <= 0) return false;
  return biomeStart(biomeAt(d)) === d;
}

/**
 * The kinds of row d for a run (pure; B's slab pass 4 calls it). Gate rows come back as GATE: the model
 * shows them as the seal while the biome was never opened (`sealPending`).
 */
export function rowKinds(runSeed: number, d: number, out: Uint8Array = new Uint8Array(COLS)): Uint8Array {
  if (d <= 0) {
    out.fill(CELL.TOPSOIL);
    return out;
  }
  if (isOpenRow(runSeed, d)) {
    out.fill(CELL.AIR);
    return out;
  }
  if (isGateRow(d)) {
    out.fill(CELL.GATE);
    return out;
  }
  out.fill(d < SOIL_ROWS ? CELL.SOIL : CELL.ROCK);
  if (d < TUTORIAL_ROWS) {
    const t = TUT[d];
    if (t) for (const [c, k] of t) out[c] = k;
    return out;
  }
  const mix = mixFor(biomeAt(d));
  // Veins: cells grouped in 3 × 2 blobs (a jittered grid); an ore blob makes 2–6 ore cells.
  const pOreBlob = (mix.ore + mix.rich) / 0.5;
  const richInBlob = mix.rich / (mix.ore + mix.rich);
  const rare = mix.gem + mix.fossil + mix.geode;
  const pRare = rare / (1 - pOreBlob);
  const by = Math.floor(d / 2);
  const shift = hash3(runSeed, 0x51, by) % 3;
  for (let c = 0; c < COLS; c++) {
    const bx = Math.floor((c + shift) / 3);
    const blob = u01(runSeed, bx * 977 + 13, by);
    const cell = u01(runSeed, c + 101, d);
    if (blob < pOreBlob) {
      if (cell < 0.5 * richInBlob) out[c] = CELL.RICH;
      else if (cell < 0.5) out[c] = CELL.ORE;
    } else if (cell < pRare) {
      const r = cell / pRare;
      out[c] = r < mix.gem / rare ? CELL.GEM : r < (mix.gem + mix.fossil) / rare ? CELL.FOSSIL : CELL.GEODE;
    }
  }
  if (d % CHEST_EVERY === CHEST_EVERY - 1) out[CENTRE_COL] = CELL.CHEST;
  return out;
}

// ----- the live window ----------------------------------------------------------------------------

/** Fill a row for depth d (fresh: every solid cell intact). */
export function fillRow(s: IdleState, row: RowState, d: number): void {
  row.depth = d;
  rowKinds(s.runSeed, d, row.kinds);
  row.crumbleMask = 0;
  row.crumbleAt = 0;
  if (sealPending(s, d)) row.kinds.fill(CELL.SEAL);
  else {
    decorate(s, row, d);
    for (const o of s.overrides) if (o.depth === d && row.kinds[o.col] !== CELL.AIR && row.kinds[o.col] !== CELL.SEAL) row.kinds[o.col] = o.kind;
  }
  for (let c = 0; c < COLS; c++) row.left[c] = row.kinds[c] === CELL.AIR ? 0 : 1;
}

/**
 * The run's facets reshape rows as they enter the window (below the visible section; B repaints from cells:change):
 * Treasure Nose puts a chest cell every 17 rows, Geode Sense and Fortune 2 add rare cells.
 */
function decorate(s: IdleState, row: RowState, d: number): void {
  if (s.run.facets.length === 0 || d < TUTORIAL_ROWS || isGateRow(d)) return;
  const fs = facetStats(s);
  if (fs.chestEvery > 0 && d % fs.chestEvery === fs.chestEvery - 1 && row.kinds[CENTRE_COL] !== CELL.AIR && row.kinds[CENTRE_COL] !== CELL.CHEST) {
    row.kinds[CENTRE_COL] = CELL.CHEST;
    s.overrides.push({ depth: d, col: CENTRE_COL, kind: CELL.CHEST, floor: 0 });
  }
  if (fs.rareX > 1) {
    const p = 0.01 * (fs.rareX - 1);
    for (let c = 0; c < COLS; c++) {
      if (row.kinds[c] !== CELL.ROCK) continue;
      const u = u01(s.runSeed ^ 0x5eed, c + 911, d);
      if (u < p) {
        row.kinds[c] = u < p * 0.4 ? CELL.GEM : u < p * 0.7 ? CELL.FOSSIL : CELL.GEODE;
        s.overrides.push({ depth: d, col: c, kind: row.kinds[c], floor: 0 });
      }
    }
  }
  if (s.overrides.length > 64) s.overrides.splice(0, s.overrides.length - 64);
}

/** True when row d is a never-opened seal (the first row of a biome whose seal was never broken). */
export function sealPending(s: IdleState, d: number): boolean {
  if (!isGateRow(d)) return false;
  const k = biomeAt(d);
  return !s.meta.sealsOpened.includes(k);
}

/** The depth of the next never-opened seal at or below `from` (Infinity when none within 64 biomes). */
export function nextSealDepth(s: IdleState, from: number): number {
  let k = biomeAt(from);
  if (biomeStart(k) < from || k === 0) k++;
  for (let i = 0; i < 64; i++, k++) {
    if (!s.meta.sealsOpened.includes(k)) return biomeStart(k);
  }
  return Infinity;
}

/** Rebuild the whole window from the floor (a new run, a jump, after analytic rows). */
export function resetWindow(s: IdleState, floor: number): void {
  s.run.depth = floor;
  if (s.shaft.rows.length !== SHAFT_WINDOW) {
    s.shaft.rows = [];
    for (let i = 0; i < SHAFT_WINDOW; i++) s.shaft.rows.push(newRow(floor + i));
  }
  for (let i = 0; i < SHAFT_WINDOW; i++) fillRow(s, s.shaft.rows[i], floor + i);
}

/** The row at depth d if it is in the window. */
export function rowAt(s: IdleState, d: number): RowState | null {
  const i = d - s.run.depth;
  return i >= 0 && i < s.shaft.rows.length ? s.shaft.rows[i] : null;
}

function rowSolid(row: RowState): boolean {
  for (let c = 0; c < COLS; c++) if (row.left[c] > 0) return true;
  return false;
}

/** Living cells of a row not crumbling. */
function living(row: RowState): number {
  let n = 0;
  for (let c = 0; c < COLS; c++) if (row.left[c] > 0 && !(row.crumbleMask & (1 << c))) n++;
  return n;
}

/**
 * The target rule (SPEC §3.1): for a tapped column, the depth of its topmost solid cell if it is at most
 * 2 rows below the floor, else the nearest column's. Returns [col, depth] or null (never: the floor row
 * always has a solid cell while it is the floor).
 */
export function targetCell(s: IdleState, col: number, maxBelow = 2): { col: number; depth: number } | null {
  const top = (c: number): number => {
    for (let i = 0; i <= maxBelow && i < s.shaft.rows.length; i++) {
      const r = s.shaft.rows[i];
      if (r.left[c] > 0 && !(r.crumbleMask & (1 << c))) return r.depth;
    }
    return -1;
  };
  const c0 = Math.max(0, Math.min(COLS - 1, col | 0));
  const d0 = top(c0);
  if (d0 >= 0) return { col: c0, depth: d0 };
  for (let k = 1; k < COLS; k++) {
    for (const c of [c0 - k, c0 + k]) {
      if (c < 0 || c >= COLS) continue;
      const d = top(c);
      if (d >= 0) return { col: c, depth: d };
    }
  }
  return null;
}

/** How many rows below the floor each column's topmost solid cell is (Infinity: none in reach). For the input layer. */
export function columnTops(s: IdleState, out: Float64Array = new Float64Array(COLS), maxBelow = 2): Float64Array {
  for (let c = 0; c < COLS; c++) {
    out[c] = Infinity;
    for (let i = 0; i <= maxBelow && i < s.shaft.rows.length; i++) {
      const r = s.shaft.rows[i];
      if (r.left[c] > 0 && !(r.crumbleMask & (1 << c))) {
        out[c] = i;
        break;
      }
    }
  }
  return out;
}

// ----- damage -----------------------------------------------------------------------------------------

/** log10 of a cell's full HP at its row (kind HP × row HP). */
export function cellHpLog10(kind: number, d: number): number {
  return hpLog10(d) + kindHpLog10(kind, d);
}

/** Options for one application of damage. */
export interface HitOpts {
  source: HitSource;
  crit: boolean;
  /** Pierce cells down the column (including the target). */
  pierce: number;
  /** Rows a single hit may clear cell by cell before the rest goes analytic. */
  rowLimit?: number;
  /** Gold multiplier (log10) on cells this hit breaks (Gold Rush…). */
  goldLog10?: number;
}

/** The outcome of one hit (for tap:hit and the tests). */
export interface HitResult {
  /** Cells broken. */
  cells: number;
  /** Cells the column pierce reached (≥ 1). */
  chain: number;
  /** log10 of the damage actually absorbed by cells (conservation: = the input unless a seal capped it). */
  absorbed: number;
  /** The first cell hit. */
  col: number;
  depth: number;
  kind: CellKind;
  /** Remaining fraction of the first cell after the hit (0 broken). */
  left: number;
}

const RESULT: HitResult = { cells: 0, chain: 0, absorbed: -Infinity, col: 0, depth: 0, kind: CELL.ROCK, left: 0 };

/**
 * Apply `dmgLog10` of damage starting at (col, depth). Pierce down the column up to `pierce` cells (8 below
 * the floor at most), then the nearest living cell of the floor row, then the next row; past `rowLimit`
 * rows the rest clears rows analytically. Breaks pay their gold and emit events. Returns a shared result
 * object (copy what you keep).
 */
export function applyHit(s: IdleState, col: number, depth: number, dmgLog10: number, o: HitOpts, bus?: IdleBus): HitResult {
  const r = RESULT;
  r.cells = 0;
  r.chain = 0;
  r.absorbed = -Infinity;
  r.col = col;
  r.depth = depth;
  const first = rowAt(s, depth);
  r.kind = (first ? first.kinds[col] : CELL.ROCK) as CellKind;
  r.left = first ? first.left[col] : 0;
  let left = dmgLog10;
  if (left === -Infinity) return r;
  // 1. The target, then down the column.
  const maxDepth = s.run.depth + 8;
  let d = depth;
  let chain = 0;
  let firstDone = false;
  while (left > -Infinity && chain < o.pierce && d <= maxDepth) {
    const row = rowAt(s, d);
    if (!row) break;
    if (row.kinds[col] === CELL.SEAL) break;
    if (row.left[col] > 0 && !(row.crumbleMask & (1 << col))) {
      left = hitCell(s, row, col, left, o, bus, chain);
      chain++;
      if (!firstDone) {
        firstDone = true;
        r.left = row.left[col];
      }
    }
    d++;
  }
  r.chain = Math.max(1, chain);
  // 2. The floor row (nearest living cell to the column), then the next rows; past `rowLimit` rows,
  // while the rest is worth at least two rows, the remainder clears rows analytically.
  const rowLimit = o.rowLimit ?? 16;
  let rows = 0;
  for (let guard = 0; guard < 4096 && left > -Infinity; guard++) {
    settleFloor(s, bus, o.source);
    const floor = s.shaft.rows[0];
    if (floor.kinds[0] === CELL.SEAL) break;
    if (rows >= rowLimit && left >= rowCostLog10(floor.depth) + L10(2)) {
      left = analyticRows(s, left, bus, o.source);
      break;
    }
    const c = nearestLiving(floor, col);
    if (c < 0) {
      // Every remaining cell is crumbling: the overflow finishes the crumble now and flows on.
      if (floor.crumbleMask) finishCrumble(s, floor, bus);
      else break;
      continue;
    }
    left = hitCell(s, floor, c, left, o, bus, chain);
    if (living(floor) === 0) rows++;
  }
  r.absorbed = subLog(dmgLog10, left);
  return r;
}

/** Hit one cell with `left` (log10) damage; returns the overflow (log10, −Infinity when absorbed). */
function hitCell(s: IdleState, row: RowState, c: number, left: number, o: HitOpts, bus: IdleBus | undefined, chainIndex: number): number {
  const kind = row.kinds[c] as CellKind;
  const full = cellHpLog10(kind, row.depth);
  const rem = row.left[c];
  const need = full + L10(rem); // log10 of the HP left
  if (left < need) {
    // Not broken: the fraction drops in log space.
    const f = Math.pow(10, left - full);
    row.left[c] = Math.max(1e-15, rem - f);
    const stage = crackStage(row.left[c]);
    bus?.emit('cell:hit', { col: c, depth: row.depth, kind, left: row.left[c], stage, source: o.source, dmg: Big.fromLog10(left), crit: o.crit });
    return -Infinity;
  }
  row.left[c] = 0;
  breakCell(s, row, c, kind, o.source, bus, chainIndex, o.crit, o.goldLog10 ?? 0, 1);
  checkCrumble(s, row, bus);
  RESULT.cells++;
  return subLog(left, need);
}

/** Crack stage 0–3 from the remaining fraction. */
export function crackStage(left: number): number {
  return left > 0.75 ? 0 : left > 0.5 ? 1 : left > 0.25 ? 2 : 3;
}

/** The cell's gold (log10) at its depth: HP(d) × goldPerHp × kind gold × the multipliers. */
export function cellGoldLog10(kind: number, d: number, extraLog10 = 0): number {
  const g = kindGoldLog10(kind, d);
  if (g === -Infinity) return -Infinity;
  return hpLog10(d) + L10(goldPerHp()) + g + extraLog10;
}

/** A cell broke: pay it, count it, pop a chest. `pay` is the loot fraction (crumbled valuables pay ½). */
function breakCell(s: IdleState, row: RowState, c: number, kind: CellKind, source: HitSource, bus: IdleBus | undefined, chainIndex: number, crit: boolean, goldLog10: number, pay: number): void {
  const gl = cellGoldLog10(kind, row.depth, goldLog10 + goldMultLog10(s) + facetKindGoldLog10(s, kind) + (pay !== 1 ? L10(pay) : 0));
  const gold = Big.fromLog10(gl);
  if (gl > -Infinity) {
    s.run.gold.addIn(gold);
    s.run.goldEarned.addIn(gold);
    s.meta.lifetime.gold.addIn(gold);
  }
  const gems = KINDS[kind].gems;
  if (gems > 0) s.meta.gems += gems;
  const belowRecord = row.depth >= s.meta.record;
  s.meta.stats.cells++;
  s.run.cells++;
  if (belowRecord) {
    s.meta.stats.cellsNew++;
    // XP counts only cells below the record (CRITIQUE MUST 5): ore and rare 3, the rest 1.
    addXp(s, kind === CELL.ORE || kind === CELL.RICH || kind === CELL.GEM || kind === CELL.FOSSIL || kind === CELL.GEODE ? XP.ore : XP.cell);
  }
  if (kind === CELL.ORE || kind === CELL.RICH) {
    s.meta.stats.ores++;
    s.meta.lastUsed.ore = s.playTime;
  }
  noteSpecial(s, kind);
  bus?.emit('cell:break', { col: c, depth: row.depth, kind, source, gold, gems, chainIndex, belowRecord, crit });
  if (gl > -Infinity) bus?.emit('gold:gain', { amount: gold.clone(), source: source === 'crumble' ? 'crumble' : 'cell', col: c, depth: row.depth });
  if (gems > 0) bus?.emit('gems:gain', { amount: gems, source: 'cell', col: c, depth: row.depth });
  if (kind === CELL.CHEST) {
    const id = `chest:${s.nextId++}`;
    const floor = Math.max(0, overrideFloor(s, row.depth, c));
    if (floor > 0) mapChestFound(s);
    s.chests.push({ id, col: c, depth: row.depth, floor, at: s.time });
    bus?.emit('chest:exposed', { id, col: c, depth: row.depth, floor: (['wood', 'copper', 'crystal', 'reliquary', 'lintel'] as const)[floor] });
  }
  // Rare cells: Finds (gems and geodes give minerals, fossils give fossils), a geode's Strike, the Codex pity's sure find.
  if (kind === CELL.GEM || kind === CELL.FOSSIL || kind === CELL.GEODE) {
    if (overrideFloor(s, row.depth, c) === -2) pityFind(s, kind, bus);
    else if (belowRecord || source !== 'analytic') rollFind(s, kind === CELL.FOSSIL ? 'fossil' : 'rare', currentPage(s), bus);
    if (kind === CELL.GEODE && source !== 'crumble') openGeode(s, row.depth, c, bus);
  }
}

/** log10 of the run's gold multipliers (Gold Rush while active; Finds, the Bestiary, Marks, Biome Seals, facets). */
export function goldMultLog10(s: IdleState): number {
  let l = mults(s).gold;
  const gr = s.run.skills.goldRush;
  if (gr && gr.activeEnd > s.time) l += L10(Math.min(15, 4 + Math.max(1, gr.lvl)));
  return l;
}

/** log10 of a kind's extra gold from facets and boosts (Assay and the ore boost on ore, Golden Hour on golden cells). */
function facetKindGoldLog10(s: IdleState, kind: number): number {
  const fs = facetStats(s);
  let l = 0;
  if (kind === CELL.ORE || kind === CELL.RICH) {
    if (fs.oreGoldX > 1) l += L10(fs.oreGoldX);
    const b = s.run.boosts.ores3;
    if (b && b.end > s.time) l += L10(3);
  }
  if (kind === CELL.GOLDEN && fs.goldenX > 1) l += L10(fs.goldenX);
  // Greed 4: every 50th cell broken pays as golden.
  if (fs.goldenEvery > 0 && (s.run.cells + 1) % fs.goldenEvery === 0) l += L10(20);
  return l;
}

/** Start the leftover crumble when ≥ 5 of a row's cells are broken (the floor row and the rows below). */
function checkCrumble(s: IdleState, row: RowState, bus?: IdleBus): void {
  if (row.crumbleMask) return;
  if (row.kinds[0] === CELL.SEAL) return;
  let broken = 0;
  let solid = 0;
  for (let c = 0; c < COLS; c++) {
    if (row.kinds[c] === CELL.AIR) continue;
    solid++;
    if (row.left[c] <= 0) broken++;
  }
  if (solid === 0 || broken >= solid) return;
  if (broken < CRUMBLE_AT - (COLS - solid)) return;
  let mask = 0;
  const cols: number[] = [];
  for (let c = 0; c < COLS; c++) if (row.left[c] > 0) {
    mask |= 1 << c;
    cols.push(c);
  }
  row.crumbleMask = mask;
  row.crumbleAt = s.time + CRUMBLE_DELAY;
  bus?.emit('row:crumble', { depth: row.depth, cols });
}

/** The crumbling cells fall: rock pays in full, valuables pay half (CRITIQUE SHOULD 5); chests always pop. */
export function finishCrumble(s: IdleState, row: RowState, bus?: IdleBus): void {
  const mask = row.crumbleMask;
  if (!mask) return;
  row.crumbleMask = 0;
  for (let c = 0; c < COLS; c++) {
    if (!(mask & (1 << c)) || row.left[c] <= 0) continue;
    row.left[c] = 0;
    const kind = row.kinds[c] as CellKind;
    const pay = kind === CELL.ROCK || kind === CELL.TOPSOIL || kind === CELL.SOIL || kind === CELL.GATE ? 1 : 0.5;
    breakCell(s, row, c, kind, 'crumble', bus, 0, false, 0, pay);
  }
}

/** Advance crumbles whose shake ended (called by step). */
export function tickCrumbles(s: IdleState, bus?: IdleBus): void {
  for (const row of s.shaft.rows) if (row.crumbleMask && s.time >= row.crumbleAt) finishCrumble(s, row, bus);
  settleFloor(s, bus, 'crumble');
}

/** The nearest living, non-crumbling cell of a row to column `col` (left first on a tie), −1 when none. */
function nearestLiving(row: RowState, col: number): number {
  const ok = (c: number) => row.left[c] > 0 && !(row.crumbleMask & (1 << c));
  if (ok(col)) return col;
  for (let k = 1; k < COLS; k++) {
    if (col - k >= 0 && ok(col - k)) return col - k;
    if (col + k < COLS && ok(col + k)) return col + k;
  }
  return -1;
}

/** Drop the floor past every cleared row; refill the window. Emits row:clear and breakthroughs. */
export function settleFloor(s: IdleState, bus: IdleBus | undefined, source: HitSource): number {
  let dropped = 0;
  let open = 0;
  const from = s.run.depth;
  for (let guard = 0; guard < 4096; guard++) {
    const floor = s.shaft.rows[0];
    if (rowSolid(floor) || floor.crumbleMask) break;
    const isAir = floor.kinds.every((k) => k === CELL.AIR);
    if (isAir) open++;
    // Shift the window: recycle the top row object to the bottom.
    const r = s.shaft.rows.shift() as RowState;
    s.run.depth++;
    fillRow(s, r, s.run.depth + SHAFT_WINDOW - 1);
    s.shaft.rows.push(r);
    dropped++;
  }
  if (dropped > 0) {
    if (s.run.depth > s.run.dmax) s.run.dmax = s.run.depth;
    s.run.rows += dropped;
    s.overrides = s.overrides.filter((o) => o.depth >= s.run.depth);
    if (open >= 3) bus?.emit('cavern:breakthrough', { from, to: s.run.depth, fall: open });
    bus?.emit('row:clear', { depth: s.run.depth, rows: dropped, source });
    onDepth(s, from, bus);
  }
  return dropped;
}

/** Depth hooks: biome entries, 20 m marks, records (records and marks are lifetime). */
export function onDepth(s: IdleState, from: number, bus?: IdleBus): void {
  const d = s.run.depth;
  const k0 = biomeAt(from);
  const k1 = biomeAt(d);
  for (let k = k0 + 1; k <= k1; k++) {
    const first = !s.meta.biomesSeen.includes(k);
    if (first) {
      s.meta.biomesSeen.push(k);
      addXp(s, XP.firstBiome);
    }
    bus?.emit('biome:enter', { biome: k, first, depth: biomeStart(k) });
    // A charted gate crossed while digging (a first-time seal's break records its own split).
    if (s.run.splits[String(k)] === undefined) chartedGate(s, k, bus);
    // A new named tool form with every new biome or stratum ever reached (CRITIQUE MUST 10).
    const form = toolFormForBiome(k);
    if (form > s.meta.toolForm) {
      s.meta.toolForm = form;
      bus?.emit('tool:form', { form, first: true });
    }
  }
  // 20 m marks: +1 gem the first time ever.
  const m0 = Math.floor(from / 20);
  const m1 = Math.floor(d / 20);
  for (let m = m0 + 1; m <= m1; m++) {
    const first = m * 20 > s.meta.markMax;
    if (first) {
      s.meta.markMax = m * 20;
      s.meta.gems += 1;
      bus?.emit('gems:gain', { amount: 1, source: 'record', col: -1, depth: m * 20 });
    }
    bus?.emit('depth:mark', { depth: m * 20, first });
  }
  if (d > s.meta.record) {
    const r0 = Math.floor(s.meta.record / 200);
    const r1 = Math.floor(d / 200);
    for (let r = r0 + 1; r <= r1; r++) {
      s.meta.gems += 10;
      bus?.emit('gems:gain', { amount: 10, source: 'record', col: -1, depth: r * 200 });
      bus?.emit('depth:record', { depth: r * 200 });
    }
    s.meta.record = d;
    s.meta.records.deepest = d;
  }
  if (d > s.meta.cycleRecord) s.meta.cycleRecord = d;
  // Swift (the fastest run to 600 m) and the depth cards (CRITIQUE MUST 11).
  // (A Head Start's Plunge does not count: the run must dig its own way to 600 m.)
  if (from < 600 && d >= 600 && s.run.runTime > 5 && !s.run.splits.hs && s.run.runTime < s.meta.swift600) s.meta.swift600 = s.run.runTime;
  for (const card of DEPTH_CARDS) {
    if (d >= card.metres && from < card.metres && !s.meta.firstTime.includes(`depth:${card.id}`)) {
      s.meta.firstTime.push(`depth:${card.id}`);
      bus?.emit('depth:card', { id: card.id, metres: card.metres });
    }
  }
  s.meta.lastUsed.dig = s.playTime;
  // The glow below: 40 m above a never-opened seal.
  const seal = nextSealDepth(s, from + 1);
  if (Number.isFinite(seal) && from < seal - 40 && d >= seal - 40) bus?.emit('biome:glow', { biome: biomeAt(seal), depth: seal });
}

/**
 * Clear rows analytically with `work` (log10 damage) from the floor, stopping at the next unopened seal.
 * Pays HP dug × gold per damage, racks chest cells passed (10 max, the rest to gold; CRITIQUE MUST 5).
 * Returns the work left over (−Infinity when it was all used).
 */
export function analyticRows(s: IdleState, work: number, bus: IdleBus | undefined, source: HitSource): number {
  const from = s.run.depth;
  // Finish the floor row first (its living cells), cell by cell is not needed: account it as a row.
  const stop = nextSealDepth(s, from);
  const res = rowsForWork(from, work, stop);
  if (res.rows <= 0 && res.frac <= 0) return work;
  const to = from + res.rows;
  const used = res.used;
  // Gold: the HP dug over κ (the crumble pays the whole row) at the run's gold multipliers.
  const goldL = used - L10(KAPPA) + L10(goldPerHp()) + goldMultLog10(s);
  const gold = Big.fromLog10(goldL);
  s.run.gold.addIn(gold);
  s.run.goldEarned.addIn(gold);
  s.meta.lifetime.gold.addIn(gold);
  // Chest cells passed.
  let racked = 0;
  const chestRows = Math.max(0, Math.floor((to - 1 - (CHEST_EVERY - 1)) / CHEST_EVERY) - Math.floor((from - 1 - (CHEST_EVERY - 1)) / CHEST_EVERY));
  for (let i = 0; i < chestRows; i++) if (rackChest(s, 0)) racked++;
  // Planted lanterns passed are collected (CRITIQUE MUST 5).
  collectPassed(s, from, to, bus);
  const cellsPassed = res.rows * COLS;
  s.meta.stats.cells += cellsPassed;
  if (to > s.meta.record) s.meta.stats.cellsNew += Math.min(cellsPassed, (to - Math.max(from, s.meta.record)) * COLS);
  resetWindow(s, to);
  // The leftover fraction of the next row: spread over its cells as damage (no further analytic step).
  const floor = s.shaft.rows[0];
  if (res.frac > 0 && floor.kinds[0] !== CELL.SEAL) {
    const each = 1 - Math.min(0.999999, res.frac);
    for (let c = 0; c < COLS; c++) if (floor.left[c] > 0) floor.left[c] = Math.max(1e-9, Math.min(floor.left[c], each));
  }
  bus?.emit('rows:analytic', { from, to, gold: gold.clone(), chestsRacked: racked });
  if (racked > 0) bus?.emit('chest:rack', { count: s.run.rack.length });
  bus?.emit('gold:gain', { amount: gold.clone(), source: 'cell', col: -1, depth: to });
  bus?.emit('row:clear', { depth: to, rows: res.rows, source });
  if (to > s.run.dmax) s.run.dmax = to;
  onDepth(s, from, bus);
  return -Infinity;
}

/** log10 of the floor row's remaining HP (for the crew's weakest-first and the ETA). */
export function floorLeftLog10(s: IdleState): number {
  const row = s.shaft.rows[0];
  let t = -Infinity;
  for (let c = 0; c < COLS; c++) if (row.left[c] > 0 && !(row.crumbleMask & (1 << c))) {
    const v = cellHpLog10(row.kinds[c], row.depth) + L10(row.left[c]);
    t = t === -Infinity ? v : Math.max(t, v) + Math.log10(1 + Math.pow(10, -Math.abs(t - v)));
  }
  return t;
}

/** The floor row's weakest living cell (the crew's first target), −1 when none. */
export function weakestCell(s: IdleState): number {
  const row = s.shaft.rows[0];
  let best = -1;
  let bl = Infinity;
  for (let c = 0; c < COLS; c++) {
    if (row.left[c] <= 0 || row.crumbleMask & (1 << c)) continue;
    const v = cellHpLog10(row.kinds[c], row.depth) + L10(row.left[c]);
    if (v < bl) {
      bl = v;
      best = c;
    }
  }
  return best;
}

/** Re-export for the step: the row cost (log10) used by the analytic paths. */
export const rowCost = rowCostLog10;
/** Authored biome count (re-export for B's kits). */
export const AUTHORED = AUTHORED_BIOMES;
