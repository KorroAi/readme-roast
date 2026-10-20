import { describe, expect, it } from 'vitest';
import { SHAFT_COLUMNS, TAP_CAP_PER_S, TapCap, columnAt, holdRate, inReach, inRegion, swipeColumn, targetColumn } from '../../../src/ui/idle/TapSurface';
import { Rng } from '../../../src/core/rng';

// The shaft at 390 px: 7 × 44 px centred (41 px margins).
const S = { left: 41, right: 349 };

describe('column mapping (F3)', () => {
  it('maps 20 random points per column to that column, at three widths', () => {
    const rng = new Rng(7);
    for (const width of [360, 390, 412]) {
      const left = (width - 308) / 2;
      const s = { left, right: left + 308 };
      for (let c = 0; c < SHAFT_COLUMNS; c++) {
        for (let i = 0; i < 20; i++) {
          const x = left + c * 44 + 0.01 + rng.next() * 43.98;
          expect(columnAt(x, s)).toBe(c);
        }
      }
    }
  });

  it('maps the wall margins to columns 0 and 6', () => {
    expect(columnAt(0, S)).toBe(0);
    expect(columnAt(40.9, S)).toBe(0);
    expect(columnAt(349, S)).toBe(6);
    expect(columnAt(389, S)).toBe(6);
  });

  it('ignores vertical position by construction (x only)', () => {
    expect(columnAt(41 + 44 * 3 + 20, S)).toBe(3);
  });
});

describe('swipe hysteresis', () => {
  it('leaves a column only 0.6 of a column past its edge', () => {
    // Column 3 spans 173..217; the switch happens past 217 + 26.4.
    expect(swipeColumn(230, 3, S)).toBe(3);
    expect(swipeColumn(244, 3, S)).toBe(4);
    expect(swipeColumn(150, 3, S)).toBe(3);
    expect(swipeColumn(146, 3, S)).toBe(2);
    expect(swipeColumn(340, 3, S)).toBe(6);
  });
});

describe('the target rule', () => {
  it('hits the tapped column when its top cell is within 2 rows of the floor', () => {
    expect(targetColumn(2, [0, 0, 0, 0, 0, 0, 0])).toBe(2);
    expect(targetColumn(2, [0, 0, 2, 0, 0, 0, 0])).toBe(2);
  });

  it('goes to the nearest column that is, left first on a tie', () => {
    expect(targetColumn(3, [0, 9, 9, 9, 9, 0, 0])).toBe(5);
    expect(targetColumn(3, [0, 0, 9, 9, 9, 0, 0])).toBe(1);
    expect(targetColumn(3, [9, 9, 0, 9, 0, 9, 9])).toBe(2);
    expect(targetColumn(0, [Infinity, Infinity, Infinity, Infinity, Infinity, Infinity, 1])).toBe(6);
  });

  it('returns −1 when no column has a cell in reach', () => {
    expect(targetColumn(3, [9, 9, 9, 9, 9, 9, 9])).toBe(-1);
    expect(targetColumn(3, [-1, -1, -1, -1, -1, -1, -1])).toBe(-1);
  });
});

describe('regions and reach', () => {
  it('accepts the world region only', () => {
    const r = { top: 173, bottom: 610, left: 0, right: 390 };
    expect(inRegion(100, 172, r)).toBe(false);
    expect(inRegion(100, 173, r)).toBe(true);
    expect(inRegion(100, 609, r)).toBe(true);
    expect(inRegion(100, 610, r)).toBe(false);
  });

  it('limits entity reach to 4 m above and below the floor (CRITIQUE MUST 8)', () => {
    expect(inReach(400 - 176, 400)).toBe(true);
    expect(inReach(400 - 177, 400)).toBe(false);
    expect(inReach(400 + 176, 400)).toBe(true);
    expect(inReach(400 + 177, 400)).toBe(false);
  });
});

describe('the hold stream rate (CRITIQUE MUST 1)', () => {
  it('is 3/s base, at most 5/s with Steady Hand, 8/s in a Surge', () => {
    expect(holdRate(0, false)).toBe(3);
    expect(holdRate(3, false)).toBe(4);
    expect(holdRate(6, false)).toBe(5);
    expect(holdRate(60, false)).toBe(5);
    expect(holdRate(0, true)).toBe(8);
  });
});

describe('the global tap cap', () => {
  it('counts at most 8 hits in any 1 s window', () => {
    const cap = new TapCap();
    let counted = 0;
    // 20 taps/s for 3 s.
    for (let i = 0; i < 60; i++) if (cap.admit(i * 50)) counted++;
    expect(counted).toBeLessThanOrEqual(3 * TAP_CAP_PER_S);
    expect(counted).toBeGreaterThanOrEqual(3 * TAP_CAP_PER_S - 1);
  });

  it('never caps rhythmic tapping at 5/s or a 7-column swipe started fresh', () => {
    const cap = new TapCap();
    for (let i = 0; i < 50; i++) expect(cap.admit(i * 200)).toBe(true);
    const fresh = new TapCap();
    for (let i = 0; i < 7; i++) expect(fresh.admit(10_000 + i * 70)).toBe(true);
  });

  it('three fingers plus a hold cannot beat the cap', () => {
    const cap = new TapCap();
    const rng = new Rng(3);
    const times: number[] = [];
    for (let f = 0; f < 3; f++) for (let i = 0; i < 40; i++) times.push(i * 100 + rng.next() * 30);
    for (let i = 0; i < 40; i++) times.push(i * 125); // the hold stream at 8/s
    times.sort((a, b) => a - b);
    let counted = 0;
    for (const t of times) if (cap.admit(t)) counted++;
    expect(counted).toBeLessThanOrEqual(Math.ceil(4) * TAP_CAP_PER_S + TAP_CAP_PER_S);
    expect(cap.recent(4000)).toBeLessThanOrEqual(TAP_CAP_PER_S);
  });
});

import { keyAction } from '../../../src/input/DesktopInput';

describe('desktop keys (SPEC §3.1)', () => {
  it('maps 1–7 to the columns, Space to the last column, B to BEST and Esc to Back; repeats never tap', () => {
    for (let n = 1; n <= 7; n++) expect(keyAction(`Digit${n}`, false)).toEqual({ kind: 'tap', col: n - 1 });
    expect(keyAction('Numpad4', false)).toEqual({ kind: 'tap', col: 3 });
    expect(keyAction('Digit8', false)).toBeNull();
    expect(keyAction('Digit0', false)).toBeNull();
    expect(keyAction('Space', false)).toEqual({ kind: 'again' });
    expect(keyAction('KeyB', false)).toEqual({ kind: 'best' });
    expect(keyAction('Escape', false)).toEqual({ kind: 'back' });
    for (const code of ['Digit3', 'Space', 'KeyB', 'Escape']) expect(keyAction(code, true), code).toBeNull();
    expect(keyAction('KeyW', false)).toBeNull();
  });
});
