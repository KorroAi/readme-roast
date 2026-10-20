import { describe, expect, it } from 'vitest';
import type { StructureSpec } from '../../src/render/structures/types';
import { StructureBuilder } from '../../src/render/structures/builder';
import { buildStructure } from '../../src/render/structures/kinds';

/**
 * The structure builders' geometry (render/structures): closed, outward-facing surfaces, and every spec kind
 * the descent uses builds without NaNs within its vertex budget. (The stair-walking checks went with the
 * third-person walker.)
 */
describe('structure builder', () => {
  it('builds closed, outward-facing chamfered boxes', () => {
    for (const c of [0, 0.05, 0.2]) {
      const b = new StructureBuilder(null);
      b.box(-1, -0.5, -2, 1, 0.5, 2, c);
      // Signed volume of a closed, outward-wound mesh equals its volume.
      let vol = 0;
      for (let t = 0; t < b.idx.length; t += 3) {
        const p = [0, 1, 2].map((k) => b.idx[t + k] * 3).map((o) => [b.pos[o], b.pos[o + 1], b.pos[o + 2]]);
        vol += (p[0][0] * (p[1][1] * p[2][2] - p[1][2] * p[2][1]) - p[0][1] * (p[1][0] * p[2][2] - p[1][2] * p[2][0]) + p[0][2] * (p[1][0] * p[2][1] - p[1][1] * p[2][0])) / 6;
      }
      const full = 2 * 1 * 4;
      expect(vol, `chamfer ${c}`).toBeGreaterThan(full * 0.9);
      expect(vol, `chamfer ${c}`).toBeLessThanOrEqual(full + 1e-6);
    }
  });

  it('turns revolved and swept surfaces outward', () => {
    const b = new StructureBuilder(null);
    b.revolve([[0, 0], [1, 0], [1.2, 1], [0.8, 2], [0, 2]], 24, (a, r, y) => [a * r * 16, y * 16]);
    b.sweep([[0, 0], [4, 0], [4, 4]], [[0, 0], [0.5, 0.2], [0.6, 1], [0, 1.2]], true);
    // Every triangle's normal agrees with its vertices' stored normals.
    let bad = 0;
    for (let t = 0; t < b.idx.length; t += 3) {
      const [i0, i1, i2] = [b.idx[t], b.idx[t + 1], b.idx[t + 2]];
      const p = [i0, i1, i2].map((i) => [b.pos[i * 3], b.pos[i * 3 + 1], b.pos[i * 3 + 2]]);
      const u = [p[1][0] - p[0][0], p[1][1] - p[0][1], p[1][2] - p[0][2]];
      const v = [p[2][0] - p[0][0], p[2][1] - p[0][1], p[2][2] - p[0][2]];
      const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
      if (Math.hypot(n[0], n[1], n[2]) < 1e-9) continue;
      const s = n[0] * b.nrm[i0 * 4] + n[1] * b.nrm[i0 * 4 + 1] + n[2] * b.nrm[i0 * 4 + 2];
      if (s < 0) bad++;
    }
    expect(bad).toBe(0);
  });
});

describe('structure specs', () => {
  const specs: StructureSpec[] = [
    { kind: 'column', id: 'c1', x: 30.5, y: -50, z: 40.5, radius: 0.6, top: -44, state: 'full', seed: 3 },
    { kind: 'column', id: 'c2', x: 34.5, y: -50, z: 40.5, radius: 0.5, top: -47, state: 'broken', seed: 4 },
    { kind: 'drum', id: 'd1', x: 32, y: -49.5, z: 38, axis: 'x', length: 1.2, radius: 0.5, roll: 0.3, seed: 5 },
    { kind: 'block', id: 'b1', min: [28, -50, 36], max: [30, -49.4, 37], axis: 'x', chamfer: 0.05, seed: 6 },
    { kind: 'coping', id: 'k1', a: [28, 50], b: [35, 50], y: -48, width: 0.5, height: 0.3, stone: 1.1, seed: 7 },
    { kind: 'beam', id: 'm1', a: [28, -45, 56.5], b: [35, -45, 56.5], w: 0.3, h: 0.35, splinter: 0, roll: 0, seed: 8 },
    { kind: 'beam', id: 'm2', a: [27.5, -50, 56.5], b: [27.5, -45, 56.5], w: 0.3, h: 0.3, splinter: 2, roll: 0.1, seed: 9 },
  ];
  it('builds every kind without NaNs and within a vertex budget', () => {
    let total = 0;
    for (const spec of specs) {
      const b = new StructureBuilder(null);
      buildStructure(b, spec);
      expect(b.vertexCount, spec.id).toBeGreaterThan(0);
      expect(b.pos.every(Number.isFinite), spec.id).toBe(true);
      total += b.vertexCount;
    }
    expect(total).toBeLessThan(20000);
  });
});
