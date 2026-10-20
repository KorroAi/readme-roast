import { describe, expect, it } from 'vitest';
import { centroid, fractureCube, isConvex, shardSets, splitConvex, unitCube, volume } from '../../../src/render/fx/fracture';

// SPEC §11.4: 3 BSP-fractured unit boxes, 9-12 convex shards each, volumes summing to 1.
describe('fracture (shards fill the cell they replace)', () => {
  it('the unit cube has volume 1 and its centroid at the origin', () => {
    expect(volume(unitCube())).toBeCloseTo(1, 12);
    for (const v of centroid(unitCube())) expect(Math.abs(v)).toBeLessThan(1e-12);
  });

  it('a split keeps the volume and both halves convex', () => {
    const halves = splitConvex(unitCube(), [0.6, 0.48, 0.64], 0.1);
    expect(halves).not.toBeNull();
    const [a, b] = halves!;
    expect(volume(a) + volume(b)).toBeCloseTo(1, 9);
    expect(isConvex(a)).toBe(true);
    expect(isConvex(b)).toBe(true);
  });

  it('every set has 9-12 convex shards whose volumes sum to 1 ± 1e-6', () => {
    const sets = shardSets();
    expect(sets.length).toBe(3);
    for (const set of sets) {
      expect(set.length).toBeGreaterThanOrEqual(9);
      expect(set.length).toBeLessThanOrEqual(12);
      const sum = set.reduce((a, s) => a + s.volume, 0);
      expect(Math.abs(sum - 1)).toBeLessThan(1e-6);
      for (const s of set) {
        expect(s.volume).toBeGreaterThan(0.01);
        expect(s.positions.length % 9).toBe(0);
        for (const v of s.positions) expect(Number.isFinite(v)).toBe(true);
      }
    }
    for (const [seed, n] of [[0x5a17, 10], [0x9e11, 12], [0x31c7, 9]] as const) for (const p of fractureCube(seed, n)) expect(isConvex(p)).toBe(true);
  });

  it('is deterministic (the same seed gives the same shards)', () => {
    const a = fractureCube(77, 10).map(volume);
    const b = fractureCube(77, 10).map(volume);
    expect(a).toEqual(b);
  });
});
