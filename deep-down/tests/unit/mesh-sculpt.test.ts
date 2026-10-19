import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { B } from '../../src/config/blocks';
import { VoxelWorld } from '../../src/world/VoxelWorld';
import { ChunkMeshData, MESH_OPTIONS, VERTEX_BYTES, meshChunk } from '../../src/render/mesher';
import { ChunkRenderer } from '../../src/render/ChunkRenderer';
import { FAMILY, FAMILY_OF } from '../../src/render/materials';

// Guarantees of the sculpting mesher (dual-cell chamfer, relief, smooth normals); see mesher.ts.

/** 32^3 world (8 chunks): an irregular natural-rock terrain crossing every chunk seam, a masonry
 *  block, a timber deck and a crystal seam. */
function terrain(): VoxelWorld {
  const w = new VoxelWorld(32, 32, 32);
  for (let z = 0; z < 32; z++)
    for (let x = 0; x < 32; x++) {
      const h = 10 + Math.round(3 * Math.sin(x * 0.45) + 2 * Math.cos(z * 0.37 + x * 0.1));
      for (let y = 0; y < h; y++) w.setRaw(x, y, z, (x + z) % 7 === 0 ? B.UMBER : B.SLATE);
    }
  // A pillar and an overhang across the x = 16 and z = 16 seams.
  for (let y = 12; y < 22; y++) for (let x = 14; x < 18; x++) for (let z = 15; z < 17; z++) w.setRaw(x, y, z, B.DEEP_SLATE);
  for (let x = 12; x < 20; x++) for (let z = 13; z < 19; z++) w.setRaw(x, 22, z, B.SLATE);
  for (let x = 3; x < 7; x++) for (let z = 3; z < 7; z++) for (let y = 14; y < 17; y++) w.setRaw(x, y, z, B.ANCIENT_BRICK);
  for (let x = 24; x < 29; x++) for (let z = 3; z < 6; z++) w.setRaw(x, 16, z, B.PLANK);
  for (let y = 6; y < 9; y++) w.setRaw(31, y, 20, B.CRYSTAL);
  return w;
}

function meshes(w: VoxelWorld): Array<{ m: ChunkMeshData; ox: number; oy: number; oz: number }> {
  const out = [];
  for (let cz = 0; cz < w.cz; cz++) for (let cy = 0; cy < w.cy; cy++) for (let cx = 0; cx < w.cx; cx++) out.push({ m: meshChunk(w, cx, cy, cz), ox: cx * 16, oy: cy * 16, oz: cz * 16 });
  return out;
}

const familyAt = (w: VoxelWorld, x: number, y: number, z: number, face: number) => {
  // The voxel that owns a face is behind it: the face's corner box minus the normal side.
  void face;
  return FAMILY_OF[w.get(x, y, z)];
};

describe('sculpting mesher', () => {
  it('gives vertices shared across chunk seams bit-identical offsets and normals (no cracks, no light seams)', () => {
    const w = terrain();
    const seen = new Map<string, { off: string; nrm: string }>();
    let shared = 0;
    for (const { m, ox, oy, oz } of meshes(w)) {
      const pos = m.positions;
      const data = m.data;
      for (let v = 0; v < m.vertexCount; v++) {
        const p = [pos[v * 3] + ox, pos[v * 3 + 1] + oy, pos[v * 3 + 2] + oz];
        const b = v * VERTEX_BYTES;
        const off = `${m.vertices[b + 12]},${m.vertices[b + 13]},${m.vertices[b + 14]}`;
        const nrm = `${m.vertices[b + 3]},${m.vertices[b + 15]}`;
        // Same position and face orientation and material layer: the same vertex seen from either chunk.
        const key = `${p.join(',')}/${data[v * 4]}/${data[v * 4 + 2]}`;
        const onSeam = p.some((c) => c === 16);
        const prev = seen.get(key);
        if (prev) {
          expect(off, `offset at ${key}`).toBe(prev.off);
          expect(nrm, `normal at ${key}`).toBe(prev.nrm);
          if (onSeam) shared++;
        } else seen.set(key, { off, nrm });
        // Every face at a lattice point moves it identically, whatever its orientation.
        const any = `${p.join(',')}`;
        const o = seen.get(any);
        if (o) expect(off, `offset at ${any}`).toBe(o.off);
        else seen.set(any, { off, nrm });
      }
    }
    expect(shared).toBeGreaterThan(50);
  });

  it('keeps flat floor interiors exactly in place (feet stay on the floor)', () => {
    const w = new VoxelWorld(32, 16, 32);
    for (let x = 0; x < 32; x++) for (let z = 0; z < 32; z++) for (let y = 0; y < 5; y++) w.setRaw(x, y, z, B.SLATE);
    w.setRaw(20, 5, 20, B.SLATE); // one bump
    let interior = 0;
    for (const { m, ox, oz } of meshes(w)) {
      for (let v = 0; v < m.vertexCount; v++) {
        if (m.data[v * 4] !== 2) continue;
        const x = m.positions[v * 3] + ox;
        const z = m.positions[v * 3 + 2] + oz;
        // Skip the bump and the world edge (bedrock walls outside the world make creases there).
        if (m.positions[v * 3 + 1] !== 5 || (Math.abs(x - 20.5) < 2 && Math.abs(z - 20.5) < 2) || x < 2 || z < 2 || x > 30 || z > 30) continue;
        expect(m.offset(v)).toEqual([0, 0, 0]);
        expect(m.normal(v)[1]).toBeGreaterThan(0.999);
        interior++;
      }
    }
    expect(interior).toBeGreaterThan(3000);
  });

  it('moves walkable tops by at most the bevel at their edges', () => {
    const w = terrain();
    let maxDy = 0;
    let edges = 0;
    for (const { m } of meshes(w)) {
      for (let v = 0; v < m.vertexCount; v++) {
        if (m.data[v * 4] !== 2) continue;
        const dy = Math.abs(m.offset(v)[1]);
        maxDy = Math.max(maxDy, dy);
        if (dy > 0.05) edges++;
      }
    }
    // Convex corners bevel 0.85 / 3 m; relief adds at most 0.1 x 0.36 m vertically on walkable tops.
    expect(maxDy).toBeLessThanOrEqual(0.33);
    expect(edges).toBeGreaterThan(100);
  });

  it('keeps rendered rock within 0.4 m of the voxel surface it stands for (camera and body collide with voxels)', () => {
    const w = terrain();
    let worst = 0;
    let sag = 0;
    for (const { m, ox, oy, oz } of meshes(w)) {
      const o = [0, 0, 0];
      for (let v = 0; v < m.vertexCount; v++) {
        m.offset(v, o);
        const p = [m.positions[v * 3] + ox + o[0], m.positions[v * 3 + 1] + oy + o[1], m.positions[v * 3 + 2] + oz + o[2]];
        const c = p.map(Math.floor);
        if (w.isSolid(c[0], c[1], c[2])) continue;
        let best = 9;
        for (let dz = -1; dz <= 1; dz++) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          if (!w.isSolid(c[0] + dx, c[1] + dy, c[2] + dz)) continue;
          const d = [0, 1, 2].map((k) => Math.max(c[k] + [dx, dy, dz][k] - p[k], 0, p[k] - (c[k] + [dx, dy, dz][k] + 1)));
          best = Math.min(best, Math.hypot(d[0], d[1], d[2]));
        }
        worst = Math.max(worst, best);
        // Ceilings (bottom faces) hang at most 0.12 m into the head room below them.
        if (m.data[v * 4] === 3) sag = Math.max(sag, -o[1]);
      }
    }
    expect(worst).toBeLessThanOrEqual(0.42);
    expect(sag).toBeLessThanOrEqual(0.125);
  });

  it('keeps masonry crisp and timber exact', () => {
    const w = terrain();
    let brick = 0;
    let plank = 0;
    for (const { m, ox, oy, oz } of meshes(w)) {
      for (let v = 0; v < m.vertexCount; v++) {
        const lx = m.positions[v * 3] + ox;
        const ly = m.positions[v * 3 + 1] + oy;
        const lz = m.positions[v * 3 + 2] + oz;
        const face = m.data[v * 4];
        const fam = (m.data[v * 4 + 3] >> 4) & 3;
        const off = m.offset(v);
        const n = m.normal(v);
        const fn = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]][face];
        if (fam === FAMILY.MASONRY) {
          expect(Math.hypot(...off), `masonry offset at ${lx},${ly},${lz}`).toBeLessThan(0.1);
          expect(n[0] * fn[0] + n[1] * fn[1] + n[2] * fn[2], 'masonry keeps its face normal').toBeGreaterThan(0.999);
          brick++;
        }
        if (lx >= 24 && lx <= 29 && lz >= 3 && lz <= 6 && ly >= 16 && ly <= 17 && familyAt(w, Math.min(lx, 28), 16, Math.min(lz, 5), face) === FAMILY.NONE) {
          expect(off, 'timber is exact').toEqual([0, 0, 0]);
          plank++;
        }
      }
    }
    expect(brick).toBeGreaterThan(40);
    expect(plank).toBeGreaterThan(20);
  });

  it('bevels convex natural-rock edges and turns a 1 m step into a slope', () => {
    const w = new VoxelWorld(16, 16, 16);
    // Two terraces: y < 6 everywhere, y < 7 for z < 8 (a 1 m step facing +z at z = 8).
    for (let x = 0; x < 16; x++) for (let z = 0; z < 16; z++) for (let y = 0; y < (z < 8 ? 7 : 6); y++) w.setRaw(x, y, z, B.SLATE);
    MESH_OPTIONS.sculpt = true;
    const m = meshChunk(w, 0, 0, 0);
    let checked = 0;
    for (let v = 0; v < m.vertexCount; v++) {
      if (m.data[v * 4] !== 4) continue; // the riser (+z face)
      const x = m.positions[v * 3];
      if (x < 3 || x > 12 || m.positions[v * 3 + 2] !== 8) continue;
      const y = m.positions[v * 3 + 1];
      const off = m.offset(v);
      // Top arris sinks back into the rock, the foot fills out: the riser leans like a slope.
      if (y === 7) {
        expect(off[1]).toBeLessThan(-0.15);
        expect(off[2]).toBeLessThan(-0.05);
      } else {
        expect(off[1]).toBeGreaterThan(0.12);
        expect(off[2]).toBeGreaterThan(0.05);
      }
      checked++;
    }
    expect(checked).toBeGreaterThan(30);
  });

  it('gives natural rock one smooth normal per lattice point (no printed facets) that faces its face', () => {
    const w = terrain();
    const byPos = new Map<string, Set<string>>();
    for (const { m, ox, oy, oz } of meshes(w)) {
      for (let v = 0; v < m.vertexCount; v++) {
        if (((m.data[v * 4 + 3] >> 4) & 3) !== FAMILY.GEOLOGY || ((m.data[v * 4 + 3] >> 2) & 3) !== 3) continue;
        const face = m.data[v * 4];
        const n = m.normal(v);
        const fn = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]][face];
        expect(n[0] * fn[0] + n[1] * fn[1] + n[2] * fn[2], 'never faces away from its face').toBeGreaterThan(0);
        const px = m.positions[v * 3] + ox;
        const py = m.positions[v * 3 + 1] + oy;
        const pz = m.positions[v * 3 + 2] + oz;
        // The world edge is walled by bedrock outside the world.
        if (px < 2 || pz < 2 || px > 30 || pz > 30) continue;
        const key = `${px},${py},${pz}`;
        const set = byPos.get(key) ?? new Set<string>();
        set.add(`${m.vertices[v * VERTEX_BYTES + 3]},${m.vertices[v * VERTEX_BYTES + 15]}`);
        byPos.set(key, set);
      }
    }
    // Every face at a lattice point shares its normal, except the rare face the smooth normal
    // would face away from (thin features), which bends toward its own.
    const pts = [...byPos.values()];
    const smooth = pts.filter((s) => s.size === 1).length;
    expect(pts.length).toBeGreaterThan(1000);
    expect(smooth / pts.length).toBeGreaterThan(0.97);
  });

  it('shades natural-rock creases with a smooth AO, and leaves flat ground and gentle voxel slopes unshaded', () => {
    const w = new VoxelWorld(16, 16, 16);
    // Floor at y < 4, a wall at x < 3, and a 1:2 voxel staircase climbing toward +z from z = 8.
    for (let x = 0; x < 16; x++) for (let z = 0; z < 16; z++) {
      const h = z < 8 ? 4 : 4 + Math.floor((z - 8) / 2);
      for (let y = 0; y < (x < 3 ? 12 : h); y++) w.setRaw(x, y, z, B.SLATE);
    }
    const m = meshChunk(w, 0, 0, 0);
    let crease = 0;
    let stair = 0;
    for (let v = 0; v < m.vertexCount; v++) {
      const x = m.positions[v * 3];
      const y = m.positions[v * 3 + 1];
      const z = m.positions[v * 3 + 2];
      if (m.data[v * 4] === 2 && x === 3 && y === 4 && z > 1 && z < 7) {
        expect(m.ao(v), 'crease').toBeGreaterThan(1.5);
        expect(m.ao(v), 'crease').toBeLessThan(2.4);
        crease++;
      }
      if (x > 6 && x < 14 && z > 9 && z < 14 && y > 4) {
        expect(m.ao(v), `staircase ${x},${y},${z}`).toBeGreaterThan(2.6);
        stair++;
      }
      if (m.data[v * 4] === 2 && x > 6 && x < 14 && z > 1 && z < 6) expect(m.ao(v), 'flat floor').toBe(3);
    }
    expect(crease).toBeGreaterThan(4);
    expect(stair).toBeGreaterThan(20);
  });

  it('re-meshes a neighbour whose seam changed when an edit two voxels away alters it', async () => {
    const w = new VoxelWorld(32, 16, 16);
    for (let x = 0; x < 32; x++) for (let z = 0; z < 16; z++) for (let y = 0; y < 6; y++) w.setRaw(x, y, z, B.SLATE);
    for (let z = 4; z < 12; z++) for (let y = 6; y < 9; y++) w.setRaw(17, y, z, B.SLATE); // a wall at local x = 1 of chunk 1
    const cr = new ChunkRenderer(w, new THREE.MeshBasicMaterial());
    await cr.buildAll();
    expect(w.dirty.every((d) => d === 0)).toBe(true);
    // Mine the wall (x = 17 is local 1 of chunk 1): VoxelWorld only dirties chunk 1.
    for (let z = 4; z < 12; z++) for (let y = 6; y < 9; y++) w.set(17, y, z, B.AIR);
    expect(w.dirty[w.chunkIndex(0, 0, 0)]).toBe(0);
    cr.update(new THREE.Vector3(16, 8, 8), 1000);
    // Chunk 1's seam toward chunk 0 changed (the wide normal at x = 16 saw the wall): chunk 0 is queued.
    expect(w.dirty[w.chunkIndex(0, 0, 0)]).toBe(1);
    cr.update(new THREE.Vector3(16, 8, 8), 1000);
    expect(w.dirty.every((d) => d === 0)).toBe(true);
    // The GPU data of chunk 0 now matches a fresh mesh of the current world.
    const mesh = cr.group.children.find((c) => c.name === 'chunk_0_0_0') as THREE.Mesh;
    const attr = mesh.geometry.getAttribute('aGeo') as THREE.InterleavedBufferAttribute;
    const fresh = meshChunk(w, 0, 0, 0);
    expect(Array.from(attr.data.array as Uint8Array)).toEqual(Array.from(fresh.vertices));
  });
});
