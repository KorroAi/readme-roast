import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { B } from '../../src/config/blocks';
import { VoxelWorld } from '../../src/world/VoxelWorld';
import { ALL_CONNECTED, CaveCuller, chunkConnectivity, connected } from '../../src/render/caveCulling';

/** A world of solid stone, `cs`-sized chunks. */
function stone(sx: number, sy: number, sz: number): VoxelWorld {
  const w = new VoxelWorld(sx, sy, sz, 16);
  w.blocks.fill(B.SLATE);
  return w;
}

/** Carve a 2 x 2 tunnel along x at height y, depth z (inclusive range of x). */
function tunnelX(w: VoxelWorld, x0: number, x1: number, y: number, z: number): void {
  for (let x = x0; x <= x1; x++) for (let dy = 0; dy < 2; dy++) for (let dz = 0; dz < 2; dz++) w.setRaw(x, y + dy, z + dz, B.AIR);
}

describe('cave culling (VIS round 3)', () => {
  it('finds which faces a chunk joins through its open cells', () => {
    const w = stone(16, 16, 16);
    expect(chunkConnectivity(w, 0, 0, 0)).toBe(0);
    tunnelX(w, 0, 15, 7, 7);
    const m = chunkConnectivity(w, 0, 0, 0);
    expect(connected(m, 0, 1)).toBe(true); // +x <-> -x
    expect(connected(m, 0, 2)).toBe(false); // +x <-> +y
    expect(connected(m, 4, 5)).toBe(false); // +z <-> -z
    w.blocks.fill(B.AIR);
    expect(chunkConnectivity(w, 0, 0, 0)).toBe(ALL_CONNECTED);
  });

  it('two caves in one chunk are not joined', () => {
    const w = stone(16, 16, 16);
    // One pocket touching +x only, another touching -z only.
    tunnelX(w, 12, 15, 3, 3);
    for (let z = 0; z < 4; z++) w.setRaw(3, 10, z, B.AIR);
    const m = chunkConnectivity(w, 0, 0, 0);
    expect(connected(m, 0, 5)).toBe(false);
  });

  it('draws the chunks a tunnel leads to and hides the ones behind rock', () => {
    const w = stone(64, 16, 32);
    tunnelX(w, 0, 63, 7, 7);
    const c = new CaveCuller(w);
    c.invalidateAll();
    c.compute(Infinity);
    c.run(new THREE.Vector3(4, 8, 8), 200, null);
    const at = (cx: number, cz: number) => c.visible[w.chunkIndex(cx, 0, cz)];
    // Along the tunnel: every chunk.
    expect([at(0, 0), at(1, 0), at(2, 0), at(3, 0)]).toEqual([1, 1, 1, 1]);
    // The row beside it is solid rock: reached as the tunnel's walls next to the eye's chunk and the
    // ones the tunnel opens on, never beyond.
    expect(at(3, 1)).toBe(0);
  });

  it('a solid chunk stops the walk (it bounds the cave but leads nowhere)', () => {
    const w = stone(64, 16, 16);
    tunnelX(w, 0, 20, 7, 7);
    tunnelX(w, 34, 63, 7, 7);
    const c = new CaveCuller(w);
    c.invalidateAll();
    c.compute(Infinity);
    c.run(new THREE.Vector3(4, 8, 8), 200, null);
    const at = (cx: number) => c.visible[w.chunkIndex(cx, 0, 0)];
    expect(at(0)).toBe(1);
    expect(at(1)).toBe(1); // the tunnel ends in it (its own rock is the end wall)
    expect(at(2)).toBe(0); // solid, and no open cell of the walk touches it
    expect(at(3)).toBe(0); // the cave beyond the wall
    // A tunnel that runs to the chunk's face: the solid chunk beyond holds the end wall, so it is
    // drawn, and nothing past it.
    tunnelX(w, 0, 31, 7, 7);
    c.invalidateAll();
    c.compute(Infinity);
    c.run(new THREE.Vector3(4, 8, 8), 200, null);
    expect([at(1), at(2)]).toEqual([1, 1]);
    for (let x = 32; x < 48; x++) for (let y = 0; y < 16; y++) for (let z = 0; z < 16; z++) w.setRaw(x, y, z, B.SLATE);
    c.invalidateAll();
    c.compute(Infinity);
    c.run(new THREE.Vector3(4, 8, 8), 200, null);
    expect(at(3)).toBe(0);
  });

  it('an unknown chunk is drawn as if open (never hidden wrongly)', () => {
    const w = stone(48, 16, 16);
    tunnelX(w, 0, 47, 7, 7);
    const c = new CaveCuller(w);
    c.run(new THREE.Vector3(4, 8, 8), 200, null);
    expect(c.visible[w.chunkIndex(2, 0, 0)]).toBe(1);
  });
});
