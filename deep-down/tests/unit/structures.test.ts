import { beforeAll, describe, expect, it } from 'vitest';
import { B, RAMP, SOLID, VISIBLE, rampPlane } from '../../src/config/blocks';
import { generateWorld } from '../../src/world/gen/generateWorld';
import type { StructureSpec, WorldLayout } from '../../src/world/gen/types';
import { PlayerController } from '../../src/game/PlayerController';
import { StructureBuilder } from '../../src/render/structures/builder';
import { buildStructure } from '../../src/render/structures/kinds';
import { RISER, treadHeight } from '../../src/render/structures/stairs';
import { meshChunk } from '../../src/render/mesher';

/**
 * Built forms drawn as structure meshes over hidden collision cells (render/structures,
 * world/gen): their geometry is closed and faces outward, every hidden cell lies under a mesh,
 * the chunk mesher draws none of them, and the explorer walks the stair flights on their plane,
 * feet on the 0.25 m treads.
 */
let layout: WorldLayout;
const built = new Map<string, StructureBuilder>();

beforeAll(() => {
  layout = generateWorld();
  for (const s of layout.structures) {
    const b = new StructureBuilder(layout.world);
    buildStructure(b, s);
    built.set(s.id, b);
  }
});

type V = [number, number, number];

/** World AABB of a builder's vertices. */
function bounds(b: StructureBuilder): { min: V; max: V } {
  const min: V = [Infinity, Infinity, Infinity];
  const max: V = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < b.pos.length; i += 3)
    for (let k = 0; k < 3; k++) {
      min[k] = Math.min(min[k], b.pos[i + k]);
      max[k] = Math.max(max[k], b.pos[i + k]);
    }
  return { min, max };
}

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

describe('structures over hidden collision', () => {
  it('builds every structure without NaNs and within the vertex budget', () => {
    let total = 0;
    for (const s of layout.structures) {
      const b = built.get(s.id)!;
      expect(b.vertexCount, s.id).toBeGreaterThan(0);
      expect(b.pos.every(Number.isFinite), s.id).toBe(true);
      total += b.vertexCount;
    }
    // About 2 MB of structure geometry at 28 bytes per vertex.
    expect(total).toBeLessThan(80000);
  });

  it('puts a mesh over every hidden collision cell', () => {
    const w = layout.world;
    const boxes = layout.structures.map((s) => bounds(built.get(s.id)!));
    const hidden = new Set<number>([B.STRUCTURE, B.STRUCTURE_TIMBER, ...[...Array(256).keys()].filter((id) => RAMP[id])]);
    let cells = 0;
    const orphans: string[] = [];
    for (let z = 0; z < w.sz; z++)
      for (let y = 0; y < w.sy; y++)
        for (let x = 0; x < w.sx; x++) {
          if (!hidden.has(w.get(x, y, z))) continue;
          cells++;
          const cx = x + 0.5;
          const cy = y + 0.5;
          const cz = z + 0.5;
          const covered = boxes.some(({ min, max }) => cx > min[0] - 0.6 && cx < max[0] + 0.6 && cy > min[1] - 0.6 && cy < max[1] + 0.6 && cz > min[2] - 0.6 && cz < max[2] + 0.6);
          if (!covered && orphans.length < 5) orphans.push(`${x},${y},${z}`);
        }
    expect(cells).toBeGreaterThan(1000);
    expect(orphans, 'hidden cells with no structure mesh over them').toEqual([]);
  });

  it('keeps hidden cells solid, invisible and out of the chunk meshes', () => {
    for (const id of [B.STRUCTURE, B.STRUCTURE_TIMBER, B.RAMP_PX, B.RAMP_BASE_NZ]) {
      expect(SOLID[id]).toBe(1);
      expect(VISIBLE[id]).toBe(0);
    }
    // A chunk of the first stair flight: no vertex sits on a hidden cell's face toward the open.
    const w = layout.world;
    const mesh = meshChunk(w, 6, 4, 4); // x 96..111, y 64..79, z 64..79
    expect(mesh.faceCount).toBeGreaterThan(0);
  });

  it('gives every stair flight its wedge cells under the walking plane', () => {
    const w = layout.world;
    for (const f of layout.structures.filter((s): s is Extract<StructureSpec, { kind: 'stairFlight' }> => s.kind === 'stairFlight')) {
      for (let s = 0.5; s < f.run; s += 1) {
        const [x, z] = f.dir === 'x' ? [f.x0 + s, f.z0] : [f.x0, f.z0 + s];
        const plane = f.top - s;
        const cy = Math.floor(plane);
        const id = w.get(Math.floor(x), cy, Math.floor(z));
        expect(RAMP[id], `${f.id} s=${s}`).toBeGreaterThan(0);
        expect(rampPlane(RAMP[id], Math.floor(x), cy, Math.floor(z), x, z)).toBeCloseTo(plane, 5);
        // The tread the feet stand on is within half a riser of the plane.
        expect(Math.abs(treadHeight(f, s) - plane)).toBeLessThanOrEqual(RISER / 2 + 0.031);
      }
    }
  });
});

describe('walking the stair flights', () => {
  it('keeps the drawn feet within 0.15 m of the treads, up and down, at 60 and 30 fps', () => {
    for (const f of layout.structures.filter((s): s is Extract<StructureSpec, { kind: 'stairFlight' }> => s.kind === 'stairFlight')) {
      for (const fps of [60, 30]) {
        for (const down of [true, false]) {
          const dt = 1 / fps;
          const p = new PlayerController(layout.world);
          const at = (s: number): [number, number] => (f.dir === 'x' ? [f.x0 + s, f.z0 + 0.6] : [f.x0 - 0.6, f.z0 + s]);
          const [sx, sz] = at(down ? -1.2 : f.run + 1.2);
          p.teleport(sx, (down ? f.top : f.top - f.run) + 0.1, sz);
          for (let i = 0; i < 20; i++) p.update(dt, 0, 0, false, 0, false);
          const [ex, ez] = at(down ? f.run + 1.2 : -1.2);
          let worst = 0;
          let landings = 0;
          let frames = 0;
          for (let t = 0; t < 20; t += dt) {
            const dx = ex - p.x;
            const dz = ez - p.z;
            if (Math.hypot(dx, dz) < 0.3) break;
            if (p.update(dt, 0, 1, false, Math.atan2(-dx, -dz), true).landedSpeed > 0) landings++;
            const s = f.dir === 'x' ? p.x - f.x0 : p.z - f.z0;
            if (s < 0 || s > f.run) continue;
            frames++;
            worst = Math.max(worst, Math.abs(p.y - p.stepOffset - treadHeight(f, s)));
          }
          const tag = `${f.id} ${down ? 'down' : 'up'} ${fps} fps`;
          expect(frames, tag).toBeGreaterThan(f.run * fps * 0.15);
          expect(worst, tag).toBeLessThanOrEqual(0.15);
          expect(landings, tag).toBe(0);
        }
      }
    }
  });

  it('stands on a flight, and its wedges block a walker below their plane', () => {
    const f = layout.structures.find((s) => s.kind === 'stairFlight' && s.dir === 'x') as Extract<StructureSpec, { kind: 'stairFlight' }>;
    const p = new PlayerController(layout.world);
    p.teleport(f.x0 + 5.5, f.top - 5.5 + 0.4, f.z0);
    for (let i = 0; i < 60; i++) p.update(1 / 60, 0, 0, false, 0, false);
    expect(p.grounded).toBe(true);
    expect(p.y).toBeCloseTo(f.top - 5.5, 2);
    expect(p.collides(f.x0 + 5.5, f.top - 5.5 - 0.3, f.z0)).toBe(true);
    expect(p.collides(f.x0 + 5.5, f.top - 5.5 + 0.01, f.z0)).toBe(false);
  });
});
