import { describe, expect, it } from 'vitest';
import { B } from '../../src/config/blocks';
import { VoxelWorld } from '../../src/world/VoxelWorld';
import { LightField, LanternField, LIGHT_REACH } from '../../src/world/light';
import { raycastVoxels } from '../../src/world/raycast';
import { meshChunk } from '../../src/render/mesher';
import { Rng } from '../../src/core/rng';

function emptyWorld(n = 32, h = 32): VoxelWorld {
  return new VoxelWorld(n, h, n);
}

describe('VoxelWorld', () => {
  it('reads bedrock outside the bounds so nothing can fall out', () => {
    const w = emptyWorld();
    expect(w.get(-1, 0, 0)).toBe(B.BEDROCK);
    expect(w.get(0, 32, 0)).toBe(B.BEDROCK);
    expect(w.isSolid(5, -3, 5)).toBe(true);
  });

  it('marks owning and touching neighbor chunks dirty on edit', () => {
    const w = emptyWorld();
    w.dirty.fill(0);
    w.set(15, 15, 15, B.SLATE); // corner of chunk (0,0,0) touching 7 neighbors
    const dirtyCount = w.dirty.reduce((a, b) => a + b, 0);
    expect(dirtyCount).toBe(8);
    w.dirty.fill(0);
    w.set(5, 5, 5, B.SLATE);
    expect(w.dirty.reduce((a, b) => a + b, 0)).toBe(1);
  });

  it('ignores no-op writes', () => {
    const w = emptyWorld();
    const rev = w.revision;
    expect(w.set(1, 1, 1, B.AIR)).toBe(false);
    expect(w.revision).toBe(rev);
  });
});

describe('meshChunk', () => {
  it('emits 6 faces for an isolated block and culls shared faces', () => {
    const w = emptyWorld();
    w.setRaw(4, 4, 4, B.SLATE);
    expect(meshChunk(w, 0, 0, 0).faceCount).toBe(6);
    w.setRaw(5, 4, 4, B.SLATE);
    expect(meshChunk(w, 0, 0, 0).faceCount).toBe(10);
  });

  it('culls faces across chunk borders', () => {
    const w = emptyWorld();
    w.setRaw(15, 4, 4, B.SLATE);
    w.setRaw(16, 4, 4, B.SLATE);
    expect(meshChunk(w, 0, 0, 0).faceCount).toBe(5);
    expect(meshChunk(w, 1, 0, 0).faceCount).toBe(5);
  });

  it('never meshes invisible emitters and treats them as non-occluding', () => {
    const w = emptyWorld();
    w.setRaw(4, 4, 4, B.LIGHT_AMBER);
    expect(meshChunk(w, 0, 0, 0).faceCount).toBe(0);
    w.setRaw(5, 4, 4, B.SLATE);
    expect(meshChunk(w, 0, 0, 0).faceCount).toBe(6);
  });

  it('produces counter-clockwise faces whose geometric normal matches the face id', () => {
    const w = emptyWorld();
    w.setRaw(4, 4, 4, B.SLATE);
    const m = meshChunk(w, 0, 0, 0);
    const normals = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
    for (let f = 0; f < m.faceCount; f++) {
      const i0 = m.indices[f * 6];
      const i1 = m.indices[f * 6 + 1];
      const i2 = m.indices[f * 6 + 2];
      const p = (i: number) => [m.positions[i * 3], m.positions[i * 3 + 1], m.positions[i * 3 + 2]];
      const [a, b, c] = [p(i0), p(i1), p(i2)];
      const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
      const v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
      const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
      const face = m.data[i0 * 4];
      expect(n).toEqual(normals[face]);
    }
  });

  it('darkens ambient occlusion where a wall meets a floor', () => {
    const w = emptyWorld();
    for (let x = 0; x < 16; x++) for (let z = 0; z < 16; z++) w.setRaw(x, 1, z, B.SLATE);
    w.setRaw(8, 2, 8, B.SLATE); // a bump on the floor
    const m = meshChunk(w, 0, 0, 0);
    // Find the top face of floor block (9,1,8): its corners at x=9 touch the bump.
    let minAo = 3;
    for (let v = 0; v < m.vertexCount; v++) {
      if (m.data[v * 4] !== 2) continue;
      const x = m.positions[v * 3];
      const y = m.positions[v * 3 + 1];
      const z = m.positions[v * 3 + 2];
      if (y === 2 && x === 9 && (z === 8 || z === 9)) minAo = Math.min(minAo, m.data[v * 4 + 1]);
    }
    expect(minAo).toBeLessThan(3);
  });
});

describe('raycastVoxels', () => {
  it('hits the first solid voxel and reports the entry face', () => {
    const w = emptyWorld();
    w.setRaw(10, 5, 5, B.SLATE);
    const hit = raycastVoxels(w, 2.5, 5.5, 5.5, 1, 0, 0, 20);
    expect(hit).not.toBeNull();
    expect([hit!.x, hit!.y, hit!.z]).toEqual([10, 5, 5]);
    expect([hit!.nx, hit!.ny, hit!.nz]).toEqual([-1, 0, 0]);
    expect(hit!.distance).toBeCloseTo(7.5, 5);
  });

  it('respects max distance', () => {
    const w = emptyWorld();
    w.setRaw(10, 5, 5, B.SLATE);
    expect(raycastVoxels(w, 2.5, 5.5, 5.5, 1, 0, 0, 5)).toBeNull();
  });
});

function randomCave(seed: number): VoxelWorld {
  const w = new VoxelWorld(48, 32, 48);
  const rng = new Rng(seed);
  w.blocks.fill(B.SLATE);
  // carve random rooms
  for (let r = 0; r < 10; r++) {
    const cx = rng.int(6, 41), cy = rng.int(6, 25), cz = rng.int(6, 41), rad = rng.int(3, 7);
    for (let z = cz - rad; z <= cz + rad; z++)
      for (let y = cy - rad; y <= cy + rad; y++)
        for (let x = cx - rad; x <= cx + rad; x++)
          if ((x - cx) ** 2 + (y - cy) ** 2 + (z - cz) ** 2 < rad * rad) w.setRaw(x, y, z, B.AIR);
  }
  for (let k = 0; k < 12; k++) {
    const x = rng.int(1, 46), y = rng.int(1, 30), z = rng.int(1, 46);
    if (w.get(x, y, z) === B.AIR) w.setRaw(x, y, z, rng.chance(0.5) ? B.LIGHT_AMBER : B.LIGHT_CYAN);
    else w.setRaw(x, y, z, B.CRYSTAL);
  }
  return w;
}

function fullLight(w: VoxelWorld): Uint8Array {
  const l = new LightField(w);
  l.computeAll();
  return l.data;
}

function rgbEqual(a: Uint8Array, b: Uint8Array): number {
  let diff = 0;
  for (let i = 0; i < a.length; i += 4) if (a[i] !== b[i] || a[i + 1] !== b[i + 1] || a[i + 2] !== b[i + 2]) diff++;
  return diff;
}

describe('LightField', () => {
  it('lights neighbors of an emitter and decays with distance', () => {
    const w = emptyWorld(64);
    w.setRaw(16, 16, 16, B.LIGHT_AMBER);
    const l = new LightField(w);
    l.computeAll();
    const at = (x: number) => l.data[w.index(x, 16, 16) * 4];
    expect(at(16)).toBe(255);
    expect(at(17)).toBeLessThan(255);
    expect(at(20)).toBeLessThan(at(17));
    expect(at(16 + LIGHT_REACH + 1)).toBe(0);
  });

  it('does not leak through a sealed wall', () => {
    const w = emptyWorld();
    w.fill(0, 0, 18, 31, 31, 18, B.SLATE);
    w.setRaw(16, 16, 16, B.LIGHT_AMBER);
    const l = new LightField(w);
    l.computeAll();
    for (let x = 0; x < 32; x++) for (let y = 0; y < 32; y++) expect(l.data[w.index(x, y, 19) * 4]).toBe(0);
  });

  it('removing emitters (crystals and lamps) matches a full recompute (property test)', () => {
    for (let seed = 11; seed <= 18; seed++) {
      const w = randomCave(seed);
      const l = new LightField(w);
      l.computeAll();
      const emitters: number[] = [];
      for (let i = 0; i < w.blocks.length; i++) if (w.blocks[i] === B.CRYSTAL || w.blocks[i] === B.LIGHT_AMBER || w.blocks[i] === B.LIGHT_CYAN) emitters.push(i);
      const rng = new Rng(seed * 31);
      for (let k = 0; k < Math.min(6, emitters.length); k++) {
        const i = emitters[rng.int(0, emitters.length - 1)];
        const z = Math.floor(i / (48 * 32)), y = Math.floor(i / 48) % 32, x = i % 48;
        const old = w.get(x, y, z);
        if (old === B.AIR) continue;
        w.set(x, y, z, B.AIR);
        l.onBlockChanged(x, y, z, old);
        // Interleave ordinary mining so removal and fill paths mix.
        const mx = rng.int(1, 46), my = rng.int(1, 30), mz = rng.int(1, 46);
        const mo = w.get(mx, my, mz);
        if (mo === B.SLATE) {
          w.set(mx, my, mz, B.AIR);
          l.onBlockChanged(mx, my, mz, mo);
        }
      }
      expect(rgbEqual(l.data, fullLight(w)), `seed ${seed}`).toBe(0);
    }
  });

  it('moving a lamp (remove + place elsewhere) matches a full recompute', () => {
    const w = randomCave(5);
    const l = new LightField(w);
    l.computeAll();
    let placed = 0;
    for (let i = 0; i < w.blocks.length && placed < 4; i++) {
      if (w.blocks[i] !== B.AIR) continue;
      const z = Math.floor(i / (48 * 32)), y = Math.floor(i / 48) % 32, x = i % 48;
      if (x % 7 || z % 5) continue;
      w.set(x, y, z, B.LIGHT_AMBER);
      l.onBlockChanged(x, y, z, B.AIR);
      w.set(x, y, z, B.AIR);
      l.onBlockChanged(x, y, z, B.LIGHT_AMBER);
      if (w.get(x, y - 1, z) === B.AIR) {
        w.set(x, y - 1, z, B.LIGHT_AMBER);
        l.onBlockChanged(x, y - 1, z, B.AIR);
      }
      placed++;
    }
    expect(rgbEqual(l.data, fullLight(w))).toBe(0);
  });

  it('incremental updates after mining match a full recompute (property test)', () => {
    for (let seed = 1; seed <= 6; seed++) {
      const w = randomCave(seed);
      const l = new LightField(w);
      l.computeAll();
      const rng = new Rng(seed * 77);
      for (let step = 0; step < 25; step++) {
        const x = rng.int(1, 46), y = rng.int(1, 30), z = rng.int(1, 46);
        const old = w.get(x, y, z);
        if (old === B.AIR) continue;
        w.set(x, y, z, B.AIR);
        l.onBlockChanged(x, y, z, old);
      }
      expect(rgbEqual(l.data, fullLight(w))).toBe(0);
    }
  });

  it('reports a changed box that covers every modified texel', () => {
    const w = randomCave(9);
    const l = new LightField(w);
    l.computeAll();
    const before = l.data.slice();
    // Mine next to a lit voxel.
    let target: [number, number, number] | null = null;
    for (let i = 0; i < w.blocks.length && !target; i++) {
      if (w.blocks[i] !== B.SLATE) continue;
      const z = Math.floor(i / (48 * 32)), y = Math.floor(i / 48) % 32, x = i % 48;
      if (x < 1 || y < 1 || z < 1 || x > 46 || y > 30 || z > 46) continue;
      for (const [dx, dy, dz] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]) {
        const n = w.index(x + dx, y + dy, z + dz);
        if (w.blocks[n] === B.AIR && Math.max(l.data[n * 4], l.data[n * 4 + 2]) > 40) target = [x, y, z];
      }
    }
    expect(target).not.toBeNull();
    const [x, y, z] = target!;
    w.set(x, y, z, B.AIR);
    const box = l.onBlockChanged(x, y, z, B.SLATE);
    for (let i = 0; i < w.blocks.length; i++) {
      if (before[i * 4] === l.data[i * 4] && before[i * 4 + 1] === l.data[i * 4 + 1] && before[i * 4 + 2] === l.data[i * 4 + 2]) continue;
      const zz = Math.floor(i / (48 * 32)), yy = Math.floor(i / 48) % 32, xx = i % 48;
      expect(xx >= box.x0 && xx <= box.x1 && yy >= box.y0 && yy <= box.y1 && zz >= box.z0 && zz <= box.z1).toBe(true);
    }
  });

  it('computes openness higher in big rooms than in tunnels', () => {
    const w = new VoxelWorld(64, 32, 64);
    w.blocks.fill(B.SLATE);
    w.fill(4, 4, 4, 30, 28, 30, B.AIR); // big room
    w.fill(40, 10, 10, 60, 11, 11, B.AIR); // 2x2 tunnel
    const l = new LightField(w);
    l.computeAll();
    const room = l.data[w.index(17, 16, 17) * 4 + 3];
    const tunnel = l.data[w.index(50, 10, 10) * 4 + 3];
    expect(room).toBeGreaterThan(200);
    expect(tunnel).toBeLessThan(60);
  });
});

describe('LanternField', () => {
  it('sees open space and is blocked by walls', () => {
    const w = emptyWorld();
    w.fill(20, 0, 0, 20, 31, 31, B.SLATE);
    const f = new LanternField(w);
    f.compute(16.5, 16.5, 16.5, 10);
    const S = LanternField.SIZE;
    const at = (x: number, y: number, z: number) => f.data[x - f.originX + S * (y - f.originY + S * (z - f.originZ))];
    expect(at(18, 16, 16)).toBe(255);
    expect(at(21, 16, 16)).toBe(0);
    expect(at(16, 16, 16 + 12)).toBe(0); // outside radius
  });
});

import { tileGlowTable } from '../../src/render/terrainMaterial';
import { TILE } from '../../src/config/tiles';

describe('tile glow table', () => {
  it('gives every glyph variant the glyph stone glow', () => {
    const g = tileGlowTable();
    expect(g[TILE.glyphStone]).toBeGreaterThan(0);
    expect(g[TILE.glyphStoneB]).toBe(g[TILE.glyphStone]);
    expect(g[TILE.glyphStoneC]).toBe(g[TILE.glyphStone]);
    expect(g[TILE.deepSlate]).toBe(0);
  });
});
