import { describe, expect, it } from 'vitest';
import { createIdleBus, type IdleEvents } from '../../../src/idle/bus';
import { hp, hpLog10 } from '../../../src/idle/config/curves';
import { COMBO, CRIT, PICK, SURGE } from '../../../src/idle/config/upgrades';
import { comboMult, critChance, tapBaseLog10 } from '../../../src/idle/model/run';
import { resetWindow } from '../../../src/idle/model/shaft';
import { CELL, type IdleState } from '../../../src/idle/model/state';
import { createIdle, stepIdle } from '../../../src/idle/model/step';
import { resolveTap, tickCombo } from '../../../src/idle/model/tap';

function deepState(d = 300): IdleState {
  const s = createIdle(9, 0);
  s.meta.sealsOpened = Array.from({ length: 30 }, (_, i) => i);
  s.meta.tutorial.done = true;
  s.tutorial.done = true;
  resetWindow(s, d);
  for (const row of s.shaft.rows) {
    row.kinds.fill(CELL.ROCK);
    row.left.fill(1);
  }
  return s;
}

describe('the tap (SPEC §3.2)', () => {
  it('E1: HP(0) = the level-1 pick = 100, and the first tap of a new game breaks a cell', () => {
    expect(hp(0)).toBe(100);
    expect(PICK.dmg).toBe(100);
    const s = createIdle(1, 0);
    const bus = createIdleBus();
    const breaks: Array<IdleEvents['cell:break']> = [];
    bus.on('cell:break', (e) => breaks.push(e));
    stepIdle(s, 1 / 60, [{ col: 3, kind: 'tap' }], bus);
    expect(breaks.length).toBeGreaterThanOrEqual(1);
    expect(breaks[0].col).toBe(3);
    expect(breaks[0].gold.toNumber()).toBeCloseTo(1, 9);
  });

  it('applies the order: base (pick + edge × crew), crit ×5, combo, Surge ×3', () => {
    const s = deepState();
    s.run.pick = 40;
    s.run.lines = [30];
    const base = tapBaseLog10(s);
    // A known RNG draw: force no crit by a 0 % chance via a huge rng state check instead: compare two taps.
    s.tap.combo = 24; // the next tap makes it 25
    s.tap.lastHit = s.time;
    const r = resolveTap(s, 3, 'tap');
    const expectNoCrit = base + Math.log10(comboMult(25));
    const expectCrit = expectNoCrit + Math.log10(CRIT.mult);
    expect(Math.abs(r.dmgLog10 - (r.crit ? expectCrit : expectNoCrit))).toBeLessThan(1e-9);
    // Surge: ×3 on top.
    s.tap.surgeEnd = s.time + 5;
    s.tap.lastHit = s.time;
    const before = s.tap.combo;
    const r2 = resolveTap(s, 3, 'tap');
    const e2 = base + Math.log10(comboMult(before + 1)) + Math.log10(SURGE.mult) + (r2.crit ? Math.log10(CRIT.mult) : 0);
    expect(Math.abs(r2.dmgLog10 - e2)).toBeLessThan(1e-6);
  });

  it('combo: +1 within 0.6 s, holds add half; after 1.2 s quiet it falls by 5 every 0.5 s', () => {
    const s = deepState();
    for (let i = 0; i < 20; i++) {
      s.time += 0.3;
      resolveTap(s, i % 7, 'tap');
    }
    expect(s.tap.combo).toBe(20);
    s.time += 0.3;
    resolveTap(s, 2, 'hold');
    expect(s.tap.combo).toBe(20 + COMBO.holdGain);
    s.time += 1.19;
    tickCombo(s);
    expect(s.tap.combo).toBe(20.5);
    s.time += 0.02;
    tickCombo(s);
    expect(s.tap.combo).toBe(15.5);
    s.time += 0.5;
    tickCombo(s);
    expect(s.tap.combo).toBe(10.5);
    expect(comboMult(50)).toBe(2);
    expect(comboMult(500)).toBe(2);
  });

  it('crit odds over 1e5 seeded taps match 5 % + 1 % per Lucky Strike level', () => {
    for (const lucky of [0, 10]) {
      const s = deepState();
      s.run.ups.lucky = lucky;
      let crits = 0;
      const n = 100000;
      for (let i = 0; i < n; i++) {
        s.time += 0.2;
        // Keep the floor intact so every tap resolves the same way.
        if (i % 50 === 0) for (const row of s.shaft.rows) row.left.fill(1);
        if (resolveTap(s, 3, 'tap').crit) crits++;
      }
      const p = critChance(s);
      expect(Math.abs(crits / n - p)).toBeLessThan(0.004);
    }
  });

  it('a hold hit fills half the Surge meter (CRITIQUE MUST 1)', () => {
    const s = deepState();
    s.meta.revealed.push('surge');
    s.run.ups.lucky = 0;
    let taps = 0;
    let holds = 0;
    for (let i = 0; i < 2000; i++) {
      s.time += 0.2;
      for (const row of s.shaft.rows) row.left.fill(1);
      const before = s.tap.surge;
      const kind = i % 2 ? 'hold' : 'tap';
      const r = resolveTap(s, 3, kind);
      if (s.tap.surge < before) continue; // a Surge fired
      const gain = s.tap.surge - before;
      if (!r.crit) {
        if (kind === 'tap') taps = gain;
        else holds = gain;
      }
    }
    expect(taps).toBe(SURGE.perHit);
    expect(holds).toBe(SURGE.perHit * SURGE.holdFactor);
  });

  it('the seal takes every tap while it holds the floor', () => {
    const s = createIdle(2, 0);
    s.meta.tutorial.done = true;
    s.tutorial.done = true;
    resetWindow(s, 40);
    expect(s.shaft.rows[0].kinds[0]).toBe(CELL.SEAL);
    stepIdle(s, 1 / 60, [], undefined);
    expect(s.seal).not.toBeNull();
    const before = s.seal!.left;
    stepIdle(s, 1 / 60, [{ col: 0, kind: 'tap' }]);
    expect(s.seal!.left).toBeLessThan(before);
    void hpLog10;
  });
});
