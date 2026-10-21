// U-W1 (SPEC §13.1): the descent's path is deterministic, stays inside the 64 × 64 footprint, and keeps ≥ 12 m of rock
// between a lap's spaces and anything of an earlier lap above them.
import { describe, expect, it } from 'vitest';
import { nodeAt } from '../../../src/idle/model/chart';
import { deepPath } from '../../../src/world/hybrid/deepPath';
import { clearLayoutCache, LAP_GAP, nodeFrame, planOverlap } from '../../../src/world/hybrid/layout';

const SEEDS = [1, 12345, 0xdeadbeef, 77];
/** The first two cycles: Topsoil and Glowroot (W1) plus the Crystal Grotto's first nodes (the layout runs past W1). */
const NODES = 26;

describe('deepPath (U-W1)', () => {
  it('is deterministic: the same seed gives the same path, a cleared cache too', () => {
    for (const seed of SEEDS) {
      const a = Array.from({ length: 120 }, (_, d) => deepPath(seed, d));
      clearLayoutCache();
      const b = Array.from({ length: 120 }, (_, d) => deepPath(seed, d));
      expect(b).toEqual(a);
    }
  });

  it('agrees with the chart: depth d lies in the drift of nodeOfDepth(d), slice d - depthTop', () => {
    const seed = 12345;
    for (let d = 0; d < 160; d++) {
      const p = deepPath(seed, d);
      const t = nodeAt(seed, p.node);
      expect(d).toBeGreaterThanOrEqual(t.depthTop);
      expect(d).toBeLessThan(t.depthTop + t.K);
      if (p.kind === 'drift') expect(p.slice).toBe(d - t.depthTop);
    }
  });

  it('moves 1 m per slice along a level drift (the face steps exactly one slice)', () => {
    const seed = 12345;
    for (let d = 0; d < 120; d++) {
      const a = deepPath(seed, d);
      const b = deepPath(seed, d + 1);
      if (a.node !== b.node || a.kind !== 'drift') continue;
      expect(Math.hypot(b.pos.x - a.pos.x, b.pos.z - a.pos.z)).toBeCloseTo(1, 6);
      expect(b.pos.y).toBe(a.pos.y);
    }
  });

  it('keeps every node volume inside the 64 × 64 footprint', () => {
    for (const seed of SEEDS)
      for (let i = 0; i < NODES; i++) {
        const fr = nodeFrame(seed, i);
        for (const v of fr.volumes) {
          expect(v.min.x).toBeGreaterThanOrEqual(0);
          expect(v.min.z).toBeGreaterThanOrEqual(0);
          expect(v.max.x).toBeLessThanOrEqual(64);
          expect(v.max.z).toBeLessThanOrEqual(64);
        }
      }
  });

  it('keeps ≥ 12 m of rock between a lap and any earlier, non-adjacent node above it (the lap gap)', () => {
    for (const seed of SEEDS) {
      let checked = 0;
      for (let i = 2; i < NODES; i++)
        for (let j = 0; j < i - 1; j++) {
          const a = nodeFrame(seed, i);
          const b = nodeFrame(seed, j);
          for (const va of a.volumes)
            for (const vb of b.volumes) {
              if (!planOverlap(va, vb, 0)) continue;
              checked++;
              expect(vb.min.y - va.max.y, `nodes ${j} above ${i}`).toBeGreaterThanOrEqual(LAP_GAP - 1e-6);
            }
        }
      expect(checked).toBeGreaterThan(10);
    }
  });

  it('turns at every chamber: four corners per lap, the Threshold under the Lift Bottom', () => {
    const seed = 12345;
    const corners = Array.from({ length: 12 }, (_, i) => nodeFrame(seed, i).corner);
    expect(corners.slice(0, 6)).toEqual([0, 1, 2, 3, 0, 1]);
    // Node 6 is the Glowroot Threshold: the same corner as the Lift Bottom above it.
    expect(nodeAt(seed, 6).kind).toBe('threshold');
    expect(corners[6]).toBe(corners[5]);
    expect(corners[7]).toBe((corners[6] + 1) & 3);
  });
});
