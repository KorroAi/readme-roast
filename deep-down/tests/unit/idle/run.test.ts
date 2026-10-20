import { describe, expect, it } from 'vitest';
import { Big } from '../../../src/core/big';
import { createIdleBus } from '../../../src/idle/bus';
import { lineCostLog10 } from '../../../src/idle/config/crew';
import { PICK } from '../../../src/idle/config/upgrades';
import { best, buy, candidates, card, edgeOf, paybackOf, price, quickSlots, tapBaseLog10 } from '../../../src/idle/model/run';
import { resetWindow } from '../../../src/idle/model/shaft';
import { createIdle } from '../../../src/idle/model/step';
import { simFirstRun } from '../../../src/idle/sim/pacing';

function rich(gold: number, depth = 200) {
  const s = createIdle(4, 0);
  s.meta.sealsOpened = Array.from({ length: 30 }, (_, i) => i);
  resetWindow(s, depth);
  s.run.dmax = depth;
  s.run.gold = Big.from(gold);
  return s;
}

describe('the economy view (SPEC §5.4–§5.5)', () => {
  it('costs: the pick c0 × r^(L − 1), lines c0 × 1.1^L', () => {
    const s = rich(0, 0);
    expect(price(s, 'pick').cost.toNumber()).toBeCloseTo(PICK.c0, 9);
    s.run.pick = 11;
    expect(price(s, 'pick').cost.toNumber()).toBeCloseTo(PICK.c0 * Math.pow(PICK.r, 10), 6);
    expect(price(s, 'crew:0').cost.toNumber()).toBeCloseTo(50, 9);
    s.run.lines = [7];
    expect(price(s, 'crew:0').costLog10).toBeCloseTo(Math.log10(50) + 7 * Math.log10(1.1), 9);
  });

  it('MAX buys the same levels for the same gold as repeated ×1 (closed form)', () => {
    for (const id of ['pick', 'crew:0', 'crew:2']) {
      const a = rich(1e9);
      const b = rich(1e9);
      const r = buy(a, id, 'max');
      let n = 0;
      while (buy(b, id, 'x1').ok) n++;
      expect(r.ok).toBe(true);
      expect(r.levels).toBe(n);
      expect(Math.abs(a.run.gold.log10() - b.run.gold.log10())).toBeLessThan(1e-6);
    }
  });

  it('NEXT ★ lands exactly on the next ★ (crew) and the next tier (pick), with a ★ event', () => {
    const s = rich(1e12);
    s.run.lines = [13];
    const bus = createIdleBus();
    let stars = 0;
    bus.on('crew:star', () => stars++);
    expect(buy(s, 'crew:0', 'star', bus).ok).toBe(true);
    expect(s.run.lines[0]).toBe(20);
    expect(stars).toBe(1);
    s.run.pick = 7;
    let tiers = 0;
    bus.on('pick:tier', () => tiers++);
    buy(s, 'pick', 'star', bus);
    expect(s.run.pick).toBe(25);
    expect(tiers).toBe(1);
  });

  it('a purchase it cannot afford is refused and changes nothing', () => {
    const s = rich(10);
    const bus = createIdleBus();
    let fail = '';
    bus.on('buy:fail', (e) => (fail = e.reason));
    expect(buy(s, 'crew:3', 'x1', bus).ok).toBe(false);
    expect(fail).toBe('gold');
    expect(s.run.gold.toNumber()).toBe(10);
    expect(lineCostLog10(3, 0)).toBeGreaterThan(1);
  });

  it('BEST is the lowest payback among the candidates', () => {
    const s = rich(5e4, 120);
    s.run.pick = 30;
    s.run.lines = [40, 10];
    const b = best(s);
    expect(b).not.toBeNull();
    const pb = paybackOf(s, b!);
    for (const id of candidates(s)) expect(paybackOf(s, id)).toBeGreaterThanOrEqual(pb - 1e-9);
    expect(card(s, b!)?.best).toBe(true);
    expect(quickSlots(s)[0]).toBe('pick');
  });

  it('CRITIQUE MUST 2: the pick is never a dead slot (every level ≥ +1 % of the tap; ≥ 95 % of 0.5 s samples over 2 h)', () => {
    // Direct: at depth 2,000 with a deep crew, one more Pick level is still +3 % on the tap.
    const s = rich(0, 2000);
    s.run.lines = [200, 200, 200, 200, 200, 200, 150, 120, 90, 40];
    s.run.pick = 300;
    const now = tapBaseLog10(s);
    const next = tapBaseLog10(s, 301);
    expect(Math.pow(10, next - now) - 1).toBeGreaterThanOrEqual(0.01);
    expect(edgeOf(300, 2000)).toBeLessThanOrEqual(PICK.edgeMax);
    // Over the 2 h first-run sim.
    const r = simFirstRun({ secs: 7200 });
    expect(r.slot1Ok).toBeGreaterThanOrEqual(0.95);
  }, 30000);
});
