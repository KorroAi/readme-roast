import { describe, expect, it } from 'vitest';
import { createIdleBus } from '../../../src/idle/bus';
import { goldPerHp, hpLog10, KAPPA, rowCostLog10 } from '../../../src/idle/config/curves';
import { awaySeconds, collectOffline, computeOffline, offlineCap, returnFromAway } from '../../../src/idle/model/offline';
import { resetWindow } from '../../../src/idle/model/shaft';
import { CELL } from '../../../src/idle/model/state';
import { createIdle } from '../../../src/idle/model/step';

/** A 1-second step integration of the same row model (κ·7·H per row, gold = HP dug / κ × gold per HP). */
function stepped(from: number, dps: number, seconds: number): { depth: number; prog: number; gold: number } {
  let d = from;
  let prog = 0;
  let gold = 0;
  const gph = goldPerHp() / KAPPA;
  for (let t = 0; t < seconds; t++) {
    let w = dps;
    for (let guard = 0; guard < 1e7 && w > 0; guard++) {
      const row = Math.pow(10, rowCostLog10(d));
      const need = row * (1 - prog);
      if (w >= need) {
        w -= need;
        gold += need * gph;
        d++;
        prog = 0;
      } else {
        prog += w / row;
        gold += w * gph;
        w = 0;
      }
    }
  }
  return { depth: d + prog, prog, gold };
}

function openState(depth: number) {
  const s = createIdle(21, 0);
  s.meta.sealsOpened = Array.from({ length: 30 }, (_, i) => i);
  resetWindow(s, depth);
  for (const row of s.shaft.rows) {
    row.kinds.fill(CELL.ROCK);
    row.left.fill(1);
  }
  return s;
}

describe('offline (SPEC §4.2–§4.3)', () => {
  // E7: depth error ≤ 1e-6 m, gold ≤ 1e-9 in log10, ≤ 5 ms, never past an unopened seal.
  const cases: Array<[number, number, number]> = [
    // [depth, rows per second at the start, hours]
    [0, 0.5, 1],
    [45, 0.2, 3],
    [300, 0.05, 6],
    [900, 0.02, 12],
    [2400, 0.01, 24],
    [4000, 0.004, 8],
    [6000, 0.002, 2],
  ];
  for (const [depth, rps, hours] of cases) {
    it(`E7: the closed form equals 1 s steps from ${depth} m for ${hours} h`, () => {
      const s = openState(depth);
      const dpsLog10 = rowCostLog10(depth) + Math.log10(rps);
      const secs = hours * 3600;
      const t0 = performance.now();
      const r = computeOffline(s, secs, { dpsLog10, eff: 1, throughSeals: true });
      const ms = performance.now() - t0;
      const ref = stepped(depth, Math.pow(10, dpsLog10), secs);
      expect(Math.abs(r.toDepth - Math.floor(ref.depth))).toBeLessThanOrEqual(0);
      expect(Math.abs(r.goldRows.log10() - Math.log10(ref.gold))).toBeLessThan(1e-9);
      expect(ms).toBeLessThan(5);
      expect(hpLog10(r.toDepth)).toBeGreaterThan(0);
    });
  }

  it('first sight: the crew stops at the next never-opened seal and the rest pays gallery gold', () => {
    const s = createIdle(3, 0);
    resetWindow(s, 30);
    s.run.lines = [80, 40];
    const r = computeOffline(s, 3 * 3600, { apply: true });
    expect(r.toDepth).toBe(40);
    expect(r.sealBiome).toBe(1);
    expect(r.goldGallery.gt(0)).toBe(true);
    expect(s.run.depth).toBe(40);
    expect(s.shaft.rows[0].kinds[0]).toBe(CELL.SEAL);
  });

  it('chest cells passed go to the rack (10 at most), the rest become gold', () => {
    const s = openState(100);
    const r = computeOffline(s, 12 * 3600, { dpsLog10: rowCostLog10(100) + Math.log10(2000), eff: 1, apply: true, throughSeals: true });
    expect(r.toDepth - r.fromDepth).toBeGreaterThan(300);
    expect(s.run.rack.length).toBe(10);
    expect(r.chestsGold).toBeGreaterThan(0);
  });

  it('S3: a clock that moved back gives 0 and never a negative value; the cap holds; under 30 s is not offline', () => {
    const s = createIdle(1, 1_000_000);
    expect(awaySeconds(s, 2_000_000, 1_500_000).counted).toBe(0);
    s.monotonicMs = 5_000_000;
    expect(awaySeconds(s, 1_000_000, 3_000_000).counted).toBe(0);
    s.monotonicMs = 0;
    expect(awaySeconds(s, 0, 10 * 3600 * 1000)).toMatchObject({ counted: offlineCap(s), capped: true });
    expect(awaySeconds(s, 0, 20_000).counted).toBe(0);
    expect(offlineCap(s)).toBe(3 * 3600);
  });

  it('the return: the floor moves now, the gold waits for Collect, nothing is taken away', () => {
    const s = createIdle(5, 0);
    s.meta.sealsOpened = [1, 2, 3];
    resetWindow(s, 50);
    s.run.lines = [60, 30, 10];
    s.monotonicMs = 0;
    const bus = createIdleBus();
    let ready = 0;
    bus.on('offline:ready', () => ready++);
    const gold0 = s.run.gold.clone();
    const r = returnFromAway(s, 0, 2 * 3600 * 1000, bus);
    expect(r).not.toBeNull();
    expect(ready).toBe(1);
    expect(s.run.depth).toBe(r!.toDepth);
    expect(s.run.gold.eq(gold0)).toBe(true);
    const got = collectOffline(s, bus);
    expect(got.gt(0)).toBe(true);
    expect(s.run.gold.gte(gold0.add(got).mul(0.999999))).toBe(true);
    expect(collectOffline(s, bus).isZero()).toBe(true);
  });
});
