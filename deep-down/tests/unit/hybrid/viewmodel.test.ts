// The viewmodel (SPEC §3.7, BUILD §3.3 MUST 5): the lantern lower left and the tool lower right, together ≤ 12 % of the
// screen, nothing in the central 50 % column at rest, perfectly still at rest, the strike's contact pose recovering in
// 220 ms, mirrored for the left hand, the key light where SPEC §8.3 puts it.
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { KEY_LIGHT_CAM, Viewmodel } from '../../../src/render/hybrid/Viewmodel';
import { STRIKE_RECOVER_S } from '../../../src/render/hybrid/viewmodelState';
import type { StoneTextures } from '../../../src/render/lantern/painter';

const tex = { albedo: new THREE.Texture(), normal: new THREE.Texture(), ms: 0 } as unknown as StoneTextures;

function worldCam(): THREE.PerspectiveCamera {
  const c = new THREE.PerspectiveCamera(93, W / H, 0.08, 100);
  c.position.set(1, 2, 3);
  c.updateMatrixWorld(true);
  return c;
}

const W = 390, H = 844;

/** Rasterises the viewmodel's triangles (through its own camera) onto a 1 px mask at 390 × 844: the honest screen
 *  coverage, plus each group's pixel bounds. */
function coverage(vm: Viewmodel): { area: number; rects: Array<{ x0: number; x1: number; y0: number; y1: number }>; centre: number } {
  const mask = new Uint8Array(W * H);
  const rects: Array<{ x0: number; x1: number; y0: number; y1: number }> = [];
  vm.scene.updateMatrixWorld(true);
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  const px = (v: THREE.Vector3, m: THREE.Matrix4) => {
    v.applyMatrix4(m).project(vm.camera);
    v.set((v.x * 0.5 + 0.5) * W, (-v.y * 0.5 + 0.5) * H, v.z);
  };
  for (const g of vm.scene.children) {
    const r = { x0: Infinity, x1: -Infinity, y0: Infinity, y1: -Infinity };
    g.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh || !m.visible) return;
      const p = m.geometry.getAttribute('position');
      const idx = m.geometry.getIndex();
      const n = idx ? idx.count : p.count;
      for (let t = 0; t + 2 < n; t += 3) {
        const i0 = idx ? idx.getX(t) : t, i1 = idx ? idx.getX(t + 1) : t + 1, i2 = idx ? idx.getX(t + 2) : t + 2;
        a.fromBufferAttribute(p, i0); b.fromBufferAttribute(p, i1); c.fromBufferAttribute(p, i2);
        px(a, m.matrixWorld); px(b, m.matrixWorld); px(c, m.matrixWorld);
        const minX = Math.max(0, Math.floor(Math.min(a.x, b.x, c.x))), maxX = Math.min(W - 1, Math.ceil(Math.max(a.x, b.x, c.x)));
        const minY = Math.max(0, Math.floor(Math.min(a.y, b.y, c.y))), maxY = Math.min(H - 1, Math.ceil(Math.max(a.y, b.y, c.y)));
        const d = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
        if (Math.abs(d) < 1e-9) continue;
        for (let y = minY; y <= maxY; y++)
          for (let x = minX; x <= maxX; x++) {
            const sx = x + 0.5, sy = y + 0.5;
            const w0 = ((b.x - sx) * (c.y - sy) - (b.y - sy) * (c.x - sx)) / d;
            const w1 = ((c.x - sx) * (a.y - sy) - (c.y - sy) * (a.x - sx)) / d;
            if (w0 < 0 || w1 < 0 || w0 + w1 > 1) continue;
            mask[y * W + x] = 1;
            r.x0 = Math.min(r.x0, x); r.x1 = Math.max(r.x1, x); r.y0 = Math.min(r.y0, y); r.y1 = Math.max(r.y1, y);
          }
      }
    });
    if (Number.isFinite(r.x0)) rects.push(r);
  }
  let area = 0, centre = 0;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      if (!mask[y * W + x]) continue;
      area++;
      // The central 50 % column above the bottom strip (the face's working area).
      if (x >= W * 0.25 && x < W * 0.75 && y < H * 0.72) centre++;
    }
  return { area: area / (W * H), rects, centre };
}

describe('Viewmodel (SPEC §3.7)', () => {
  it('keeps the lantern and the tool ≤ 12 % of the screen and out of the central 50 % column at rest', () => {
    for (const mirror of [false, true]) {
      const vm = new Viewmodel();
      vm.init(tex);
      vm.set({ mirror });
      vm.frame(worldCam(), W / H);
      const cov = coverage(vm);
      expect(cov.rects.length).toBe(2);
      expect(cov.area, `mirror ${mirror}`).toBeLessThanOrEqual(0.12);
      expect(cov.area, `mirror ${mirror}: drawn at all`).toBeGreaterThan(0.02);
      expect(cov.centre, `mirror ${mirror}: pixels in the central column`).toBe(0);
      for (const r of cov.rects) expect(r.y1).toBeGreaterThan(H * 0.7);
      // The lantern sits on the free hand's side (left unless mirrored).
      const lanternLeft = (cov.rects[0].x0 + cov.rects[0].x1) / 2 < W / 2;
      expect(lanternLeft).toBe(!mirror);
    }
  });

  it('is still at rest and recovers from a strike in 220 ms', () => {
    const vm = new Viewmodel();
    vm.init(tex);
    const cam = worldCam();
    vm.frame(cam, W / H);
    const snap = () => vm.scene.children.map((g) => g.matrixWorld.elements.join(','));
    const rest = snap();
    for (let i = 0; i < 30; i++) {
      vm.update(1 / 60);
      vm.frame(cam, W / H);
    }
    expect(snap()).toEqual(rest);
    vm.strike({ x: 1, y: 2, z: 0 }, cam);
    vm.frame(cam, W / H);
    expect(vm.moving).toBe(true);
    for (let t = 0; t < STRIKE_RECOVER_S + 0.02; t += 1 / 60) vm.update(1 / 60);
    vm.frame(cam, W / H);
    expect(vm.moving).toBe(false);
    expect(snap()).toEqual(rest);
  });

  it('puts the key light at the SPEC §8.3 lantern position and mirrors it for the left hand', () => {
    const vm = new Viewmodel();
    vm.init(tex);
    const cam = worldCam();
    const f = vm.flameWorld(cam, new THREE.Vector3()).sub(cam.position);
    expect(f.x).toBeCloseTo(KEY_LIGHT_CAM.x, 5);
    expect(f.y).toBeCloseTo(KEY_LIGHT_CAM.y, 5);
    vm.set({ mirror: true });
    const g = vm.flameWorld(cam, new THREE.Vector3()).sub(cam.position);
    expect(g.x).toBeCloseTo(-KEY_LIGHT_CAM.x, 5);
    const b = vm.bounds(390, 844);
    expect(b.lantern.x).toBeGreaterThan(195);
  });
});
