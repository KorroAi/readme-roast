import { describe, expect, it } from 'vitest';
import { createIdleBus, type IdleEvents } from '../../../src/idle/bus';
import { CRUMBLE_DELAY, hpLog10, KAPPA, subLog } from '../../../src/idle/config/curves';
import { applyHit, breakthroughs, cellHpLog10, isOpenRow, resetWindow, rowKinds, targetCell, tickCrumbles, TUTORIAL_CROSSING } from '../../../src/idle/model/shaft';
import { CELL, COLS, type IdleState } from '../../../src/idle/model/state';
import { createIdle } from '../../../src/idle/model/step';

const L10 = Math.log10;

/** A state whose floor is plain rock at depth d (no seal: every seal opened). */
function rockState(d = 200, seed = 3): IdleState {
  const s = createIdle(seed, 0);
  s.meta.sealsOpened = Array.from({ length: 40 }, (_, i) => i);
  resetWindow(s, d);
  for (const row of s.shaft.rows) {
    row.kinds.fill(CELL.ROCK);
    row.left.fill(1);
  }
  return s;
}

/** log10 of the total HP left in the window. */
function hpLeft(s: IdleState): number {
  let t = 0;
  for (const row of s.shaft.rows) for (let c = 0; c < COLS; c++) if (row.left[c] > 0) t += Math.pow(10, cellHpLog10(row.kinds[c], row.depth) - hpLog10(s.run.depth)) * row.left[c];
  return t;
}

describe('the shaft model (SPEC §3.2)', () => {
  it('conserves damage exactly (to 1e-12) while nothing crumbles', () => {
    const s = rockState(300);
    const before = hpLeft(s);
    // A hit worth 2.5 cells on column 3 with pierce 2: down the column, then the floor row.
    const res = applyHit(s, 3, 300, hpLog10(300) + L10(2.5), { source: 'tap', crit: false, pierce: 2 });
    expect(Math.abs(res.absorbed - (hpLog10(300) + L10(2.5)))).toBeLessThan(1e-12);
    const after = hpLeft(s);
    expect(Math.abs(before - after - 2.5)).toBeLessThan(1e-9);
    expect(res.cells).toBe(2);
    expect(res.chain).toBe(2);
  });

  it('pierce goes down the column first, then the nearest living cell of the floor row', () => {
    const s = rockState(300);
    applyHit(s, 2, 300, hpLog10(300) + L10(2.5), { source: 'tap', crit: false, pierce: 2 });
    // Column 2: floor and the row below broken; the overflow lands on the floor's nearest cell (col 1, left first).
    expect(s.shaft.rows[0].left[2]).toBe(0);
    expect(s.shaft.rows[1].left[2]).toBe(0);
    // 2.5 cells of HP(300): 1 + 1.0392 (the row below is one slope step harder) + the rest.
    expect(s.shaft.rows[0].left[1]).toBeCloseTo(1 - (1.5 - 1.0392), 9);
    expect(s.shaft.rows[0].left[3]).toBe(1);
  });

  it('the leftover crumble starts at 5 of 7, shakes 0.3 s, then breaks the rest with loot', () => {
    const s = rockState(300);
    const bus = createIdleBus();
    const breaks: Array<IdleEvents['cell:break']> = [];
    bus.on('cell:break', (e) => breaks.push(e));
    let crumble = 0;
    bus.on('row:crumble', () => crumble++);
    for (const c of [0, 1, 2, 3]) applyHit(s, c, 300, hpLog10(300), { source: 'tap', crit: false, pierce: 1 }, bus);
    expect(crumble).toBe(0);
    applyHit(s, 4, 300, hpLog10(300), { source: 'tap', crit: false, pierce: 1 }, bus);
    expect(crumble).toBe(1);
    expect(s.run.depth).toBe(300);
    s.time += CRUMBLE_DELAY + 0.01;
    tickCrumbles(s, bus);
    expect(s.run.depth).toBe(301);
    expect(breaks.filter((b) => b.source === 'crumble')).toHaveLength(2);
  });

  it('κ measured by a cell-level sim of random taps is 0.86 ± 0.03', () => {
    // A tapper at about 3.2 taps a cell (the first 45 minutes' median): random columns, the target rule.
    const s = rockState(500, 11);
    let rng = 12345;
    const rand = () => ((rng = (Math.imul(rng, 1103515245) + 12345) >>> 0) / 4294967296);
    const rows = 4000;
    const start = s.run.depth;
    let dealt = 0;
    for (let guard = 0; guard < 200000 && s.run.depth < start + rows; guard++) {
      const t = targetCell(s, Math.floor(rand() * 7));
      if (!t) {
        s.time += CRUMBLE_DELAY + 0.01;
        tickCrumbles(s);
        continue;
      }
      const dmg = hpLog10(t.depth) + L10(1 / 3.2);
      const r = applyHit(s, t.col, t.depth, dmg, { source: 'tap', crit: false, pierce: 1, rowLimit: 1 });
      dealt += Math.pow(10, r.absorbed - hpLog10(t.depth));
      s.time += 0.2;
      tickCrumbles(s);
      for (const row of s.shaft.rows) {
        row.kinds.fill(row.kinds[0] === CELL.AIR ? CELL.ROCK : row.kinds[0]);
      }
    }
    const kappa = dealt / ((s.run.depth - start) * 7);
    expect(Math.abs(kappa - KAPPA)).toBeLessThan(0.03);
  });

  it('the target rule: the tapped column within 2 rows, else the nearest column whose top cell is', () => {
    const s = rockState(300);
    for (let i = 0; i < 3; i++) s.shaft.rows[i].left[5] = 0;
    expect(targetCell(s, 5)).toEqual({ col: 4, depth: 300 });
    s.shaft.rows[0].left[3] = 0;
    expect(targetCell(s, 3)).toEqual({ col: 3, depth: 301 });
  });

  it('rows are a pure function of (run seed, depth); the tutorial crossing and grottos are open rows', () => {
    const a = rowKinds(42, 777);
    const b = rowKinds(42, 777);
    expect([...a]).toEqual([...b]);
    for (let d = TUTORIAL_CROSSING.top; d <= TUTORIAL_CROSSING.bottom; d++) expect(isOpenRow(1, d)).toBe(true);
    const spans = breakthroughs(1, 40, 2000);
    expect(spans.length).toBeGreaterThan(30);
    for (const g of spans) for (let d = g.top; d <= g.bottom; d++) expect(isOpenRow(1, d)).toBe(true);
  });

  it('a huge hit clears rows analytically and racks the chests it passes', () => {
    const s = rockState(300);
    const before = s.run.depth;
    applyHit(s, 3, 300, hpLog10(300) + 40, { source: 'tap', crit: false, pierce: 1 });
    expect(s.run.depth).toBeGreaterThan(before + 100);
    expect(s.run.rack.length).toBeGreaterThan(0);
    expect(s.run.rack.length).toBeLessThanOrEqual(10);
    expect(Number.isFinite(s.run.gold.log10())).toBe(true);
    void subLog;
  });
});
