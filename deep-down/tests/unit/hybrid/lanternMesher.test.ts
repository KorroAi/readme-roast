import { describe, expect, it } from 'vitest';
import { B } from '../../../src/config/blocks';
import { VoxelWorld } from '../../../src/world/VoxelWorld';
import { copyPadded } from '../../../src/render/mesher';
import { BEVEL, meshLantern } from '../../../src/render/lantern/mesher';

/** A 32³-voxel world (16 m): solid slate with a carved room, a shaft, a lone block and a step. */
function room(plug = true): VoxelWorld {
  const w = new VoxelWorld(32, 32, 32);
  for (let z = 0; z < 32; z++) for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) w.setRaw(x, y, z, B.SLATE);
  for (let z = 4; z < 28; z++) for (let y = 4; y < 14; y++) for (let x = 4; x < 28; x++) w.setRaw(x, y, z, B.AIR);
  for (let z = 10; z < 14; z++) for (let y = 14; y < 30; y++) for (let x = 10; x < 14; x++) w.setRaw(x, y, z, B.AIR);
  w.setRaw(8, 4, 8, B.SLATE);
  for (let z = 4; z < 9; z++) for (let x = 20; x < 28; x++) w.setRaw(x, 4, z, B.SLATE);
  if (plug) w.setRaw(6, 4, 12, B.FACE_PLUG); // invisible solid: occludes, never meshed (FaceRenderer draws it)
  return w;
}

const key = (p: Float32Array, i: number) => `${Math.round(p[i * 3] * 1e4)},${Math.round(p[i * 3 + 1] * 1e4)},${Math.round(p[i * 3 + 2] * 1e4)}`;

describe('lantern mesher (W1-LEAD §1)', () => {
  it('is watertight inside a chunk: no interior edge is used by an odd number of triangles', () => {
    const w = room(false);
    const m = meshLantern(copyPadded(w, 0, 0, 0), 0, 0, 0);
    expect(m.faceCount).toBeGreaterThan(300);
    const edges = new Map<string, number>();
    const p = m.positions;
    const onBorder = (k: string) => k.split(',').map(Number).some((v) => v <= 0.2e4 || v >= 7.8e4);
    for (let t = 0; t < m.indices.length; t += 3) {
      const a = key(p, m.indices[t]), b = key(p, m.indices[t + 1]), c = key(p, m.indices[t + 2]);
      for (const [u, v] of [[a, b], [b, c], [c, a]]) {
        const e = u < v ? `${u}|${v}` : `${v}|${u}`;
        edges.set(e, (edges.get(e) ?? 0) + 1);
      }
    }
    let bad = 0;
    for (const [e, n] of edges) {
      const [u, v] = e.split('|');
      if (onBorder(u) || onBorder(v)) continue;
      if (n % 2 === 1) bad++;
    }
    expect(bad).toBe(0);
  });

  it('bevels convex edges by 3-6 cm and never meshes invisible solids', () => {
    expect(BEVEL).toBeGreaterThanOrEqual(0.03);
    expect(BEVEL).toBeLessThanOrEqual(0.06);
    const w = room();
    const m = meshLantern(copyPadded(w, 0, 0, 0), 0, 0, 0);
    // No vertex sits inside the face-plug voxel (6, 4, 12) → metres [3, 3.5) x [2, 2.5) x [6, 6.5).
    for (let v = 0; v < m.vertexCount; v++) {
      const x = m.positions[v * 3], y = m.positions[v * 3 + 1], z = m.positions[v * 3 + 2];
      expect(x > 3.06 && x < 3.44 && y > 2.06 && y < 2.44 && z > 6.06 && z < 6.44).toBe(false);
    }
    // Deterministic.
    const m2 = meshLantern(copyPadded(w, 0, 0, 0), 0, 0, 0);
    expect(m2.positions.every((v, i) => v === m.positions[i])).toBe(true);
  });

  it('meshes a dense chunk within a worker budget', () => {
    const w = room();
    const pad = copyPadded(w, 0, 0, 0);
    meshLantern(pad, 0, 0, 0);
    const t0 = performance.now();
    for (let i = 0; i < 4; i++) meshLantern(pad, 0, 0, 0);
    const ms = (performance.now() - t0) / 4;
    console.log(`lantern mesh: ${ms.toFixed(1)} ms per chunk`);
    expect(ms).toBeLessThan(40);
  });
});
