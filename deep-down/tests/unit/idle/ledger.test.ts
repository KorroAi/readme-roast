import { describe, expect, it } from 'vitest';
import { DisplayLedger, NUMBER_OPS } from '../../../src/ui/fx/displayLedger';

describe('the display ledger (MX: shown = actual − in flight)', () => {
  it('shows actual minus what is in the air', () => {
    const l = new DisplayLedger(NUMBER_OPS);
    let actual = 100;
    const a = l.launch(30);
    const b = l.launch(20);
    actual += 50;
    expect(l.shown(actual)).toBe(100);
    l.land(a);
    expect(l.shown(actual)).toBe(130);
    l.land(b);
    expect(l.shown(actual)).toBe(150);
    expect(l.count).toBe(0);
    expect(l.pending).toBe(0);
  });

  it('flips affordability on the landing, not on the earning', () => {
    const l = new DisplayLedger(NUMBER_OPS);
    const cost = 30;
    let actual = 20;
    const id = l.launch(15);
    actual += 15;
    // The purchase rule checks actual (35 ≥ 30), the card shows shown (20 < 30).
    expect(actual >= cost).toBe(true);
    expect(l.affordable(actual, cost)).toBe(false);
    l.land(id);
    expect(l.affordable(actual, cost)).toBe(true);
  });

  it('never shows a negative balance after spending with coins in the air', () => {
    const l = new DisplayLedger(NUMBER_OPS);
    let actual = 10;
    const id = l.launch(40);
    actual += 40;
    actual -= 45; // a purchase on actual
    expect(l.shown(actual)).toBe(0);
    l.land(id);
    expect(l.shown(actual)).toBe(5);
  });

  it('ignores unknown and double landings, and settles everything', () => {
    const l = new DisplayLedger(NUMBER_OPS);
    const id = l.launch(5);
    expect(l.land(999)).toBe(false);
    expect(l.land(id)).toBe(true);
    expect(l.land(id)).toBe(false);
    l.launch(1);
    l.launch(2);
    l.settle();
    expect(l.shown(50)).toBe(50);
    expect(l.count).toBe(0);
  });

  it('reuses slots and refuses past capacity (the amount then shows at once)', () => {
    const l = new DisplayLedger(NUMBER_OPS, 4);
    const ids = [l.launch(1), l.launch(1), l.launch(1), l.launch(1)];
    expect(l.launch(1)).toBe(0);
    expect(l.directCredits).toBe(1);
    for (const id of ids) l.land(id);
    for (let i = 0; i < 100; i++) l.land(l.launch(1));
    expect(l.flightCredits).toBe(104);
    expect(l.count).toBe(0);
  });

  it('stays exact with float amounts once everything has landed', () => {
    const l = new DisplayLedger(NUMBER_OPS);
    let actual = 0;
    const ids: number[] = [];
    for (let i = 0; i < 30; i++) {
      const v = 0.1 * (i + 1) * 1.37;
      actual += v;
      ids.push(l.launch(v));
    }
    for (const id of ids) l.land(id);
    expect(l.shown(actual)).toBe(actual);
  });
});
