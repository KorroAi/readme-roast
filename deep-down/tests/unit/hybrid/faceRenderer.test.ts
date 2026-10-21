import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { CELL } from '../../../src/idle/model/state';
import { BLOCK_H, BLOCK_W, BOND, FaceRenderer } from '../../../src/render/hybrid/FaceRenderer';
import { verticalFovFor } from '../../../src/render/hybrid/DepthScene';
import type { FaceView } from '../../../src/render/hybrid/source';
import type { PropMaterials } from '../../../src/render/lantern/propSurface';

const mats = { prop: new THREE.MeshBasicMaterial(), crystal: new THREE.MeshBasicMaterial(), glow: new THREE.MeshBasicMaterial() } as unknown as PropMaterials;

function view(K = 5, dug = 0): FaceView {
  const rows = [];
  for (let s = dug; s < K; s++) {
    const kinds = new Uint8Array(7).fill(CELL.ROCK);
    if (s === 0) kinds[2] = CELL.ORE;
    rows.push({ depth: s, kinds, left: new Float64Array(7).fill(1) });
  }
  return { node: 0, biome: 0, frame: { origin: { x: 32, y: 8, z: 30 }, dir: { x: 0, y: 0, z: -1 }, up: { x: 0, y: 1, z: 0 } }, depth0: 0, K, rows, promise: 'treasure' };
}

/** The Dig pose (SPEC §3.1): eye 1.6 m over the floor, the face's front 3.0 m ahead, pitch −8°, hFOV 52° locked. */
function digCamera(w: number, h: number): THREE.PerspectiveCamera {
  const cam = new THREE.PerspectiveCamera(verticalFovFor(52, w / h), w / h, 0.08, 100);
  cam.rotation.order = 'YXZ';
  cam.position.set(32, 9.6, 33);
  cam.rotation.set((-8 * Math.PI) / 180, 0, 0);
  cam.updateMatrixWorld(true);
  cam.updateProjectionMatrix();
  return cam;
}

describe('FaceRenderer (SPEC §3.5, §8.5; W1-LEAD §1.1)', () => {
  it('lays the 7 blocks in a 2-3-2 bond whose snake-map neighbours touch (Shockwave and splash read)', () => {
    expect(BOND.length).toBe(7);
    const rows = new Map<number, number>();
    for (const [, v] of BOND) rows.set(v, (rows.get(v) ?? 0) + 1);
    expect([...rows.values()].sort()).toEqual([2, 2, 3]);
    for (let c = 0; c < 6; c++) {
      const [u0, v0] = BOND[c], [u1, v1] = BOND[c + 1];
      expect(Math.hypot(u1 - u0, v1 - v0)).toBeLessThanOrEqual(Math.hypot(BLOCK_W, BLOCK_H) + 1e-6);
    }
    // The centre column is the middle block (chests sit there).
    expect(BOND[3][0]).toBe(0);
  });

  it('draws every live front block ≥ 92 px at rest inside 27–68 % of the height and 7–93 % of the width (C7, C8)', () => {
    for (const [w, h] of [[360, 740], [390, 844], [412, 915]]) {
      const f = new FaceRenderer(mats);
      f.update(view(), null);
      const cells = f.cells(digCamera(w, h), w, h);
      expect(cells.length).toBe(7);
      for (const c of cells) {
        expect(Math.min(c.rect.w, c.rect.h), `${w}x${h} col ${c.col}`).toBeGreaterThanOrEqual(92);
        expect(c.rect.y / h).toBeGreaterThanOrEqual(0.25);
        expect((c.rect.y + c.rect.h) / h).toBeLessThanOrEqual(0.7);
        expect(c.rect.x / w).toBeGreaterThanOrEqual(0.07);
        expect((c.rect.x + c.rect.w) / w).toBeLessThanOrEqual(0.93);
      }
    }
  });

  it('picks the block under every block centre (the ray never misses the face)', () => {
    const f = new FaceRenderer(mats);
    f.update(view(), null);
    const cam = digCamera(390, 844);
    const rc = new THREE.Raycaster();
    for (const c of f.cells(cam, 390, 844)) {
      rc.setFromCamera(new THREE.Vector2((c.cx / 390) * 2 - 1, -(c.cy / 844) * 2 + 1), cam);
      const hit = f.raycast(rc.ray);
      expect(hit?.col).toBe(c.col);
      expect(hit?.slice).toBe(0);
    }
  });

  it('marks the last 3 slices with the breach leak and hides broken blocks', () => {
    const f = new FaceRenderer(mats);
    const v = view(5, 1);
    (v.rows[0].left as Float64Array)[3] = 0;
    f.update(v, null);
    const cells = f.cells(digCamera(390, 844), 390, 844);
    expect(cells.map((c) => c.col)).not.toContain(3);
    const blocks = f.group.children[0] as THREE.InstancedMesh;
    const a = blocks.geometry.getAttribute('aInst') as THREE.InstancedBufferAttribute;
    let leaks = 0;
    for (let i = 0; i < blocks.count; i++) if (a.getW(i) >= 100) leaks++;
    // Slices 2, 3, 4 of K = 5 leak: 3 × 7 blocks.
    expect(leaks).toBe(21);
  });
});
