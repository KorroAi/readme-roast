import { describe, expect, it } from 'vitest';
import { createIdleBus } from '../../../src/idle/bus';
import { PITY, chestPath, openChest, rollChest, rollChestSeeded, seededRandom } from '../../../src/idle/model/chests';
import { stateAt } from './w2fixture';

describe('chests (SPEC §5.8, E15)', () => {
  it('E15: 1e6 seeded rolls from Wood (pity off) — Copper+ 40 % ± 0.3, Crystal+ 12 % ± 0.2, Reliquary+ 2.4 % ± 0.1, Lintel 0.24 % ± 0.03', () => {
    const r = seededRandom(12345);
    const n = 1_000_000;
    const at = [0, 0, 0, 0, 0];
    const pity = { crystal: 0, reliquary: 0, lintel: 0 };
    for (let i = 0; i < n; i++) at[rollChest(0, pity, r, false).tier]++;
    const plus = (t: number) => at.slice(t).reduce((a, b) => a + b, 0) / n;
    expect(Math.abs(plus(1) - 0.4)).toBeLessThan(0.003);
    expect(Math.abs(plus(2) - 0.12)).toBeLessThan(0.002);
    expect(Math.abs(plus(3) - 0.024)).toBeLessThan(0.001);
    expect(Math.abs(plus(4) - 0.0024)).toBeLessThan(0.0003);
  });

  it('pity is never exceeded: Crystal+ within 12, Reliquary+ within 40, Lintel within 300', () => {
    const r = seededRandom(7);
    const pity = { crystal: 0, reliquary: 0, lintel: 0 };
    let since = [0, 0, 0];
    for (let i = 0; i < 200000; i++) {
      const t = rollChest(0, pity, r).tier;
      since = since.map((x) => x + 1);
      if (t >= 2) since[0] = 0;
      if (t >= 3) since[1] = 0;
      if (t >= 4) since[2] = 0;
      expect(since[0]).toBeLessThan(PITY.crystal);
      expect(since[1]).toBeLessThan(PITY.reliquary);
      expect(since[2]).toBeLessThan(PITY.lintel);
    }
  });

  it('the seeded contract form is pure and its path lists every tier passed, floor first', () => {
    const a = rollChestSeeded(99, 0, { crystal: 0, reliquary: 0, lintel: 0 });
    const b = rollChestSeeded(99, 0, { crystal: 0, reliquary: 0, lintel: 0 });
    expect(a).toEqual(b);
    expect(chestPath({ floor: 1, tier: 3, steps: 2 })).toEqual(['copper', 'crystal', 'reliquary']);
  });

  it('opening credits gold (seconds of income), gems and the tier extras; the event carries the true path', () => {
    const s = stateAt(300, 2, { pick: 80, lines: [60, 50, 40, 20] });
    const bus = createIdleBus();
    const opened: Array<{ tier: string; path?: string[]; extras?: string[] }> = [];
    bus.on('chest:open', (e) => opened.push(e));
    const gold0 = s.run.gold.clone();
    for (let i = 0; i < 300; i++) openChest(s, `t:${i}`, 2, 'test', bus);
    expect(s.run.gold.gt(gold0)).toBe(true);
    for (const o of opened) expect(o.path?.[o.path.length - 1]).toBe(o.tier);
    expect(opened.some((o) => o.extras?.some((x) => x.startsWith('reroll')))).toBe(true);
    expect(s.meta.rerolls).toBeGreaterThan(0);
    expect(Object.keys(s.meta.finds).length).toBeGreaterThan(0);
    // Lintel: a Time Crystal and a Lantern Storm.
    const t0 = s.meta.timeCrystals;
    openChest(s, 'lintel', 4, 'test', bus);
    expect(s.meta.timeCrystals).toBe(t0 + 1);
    expect(s.run.boosts.storm?.mult).toBe(10);
  });
});
