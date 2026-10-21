import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { Viewmodel, actionPose, type RightTool } from '../../src/game/fp/Viewmodel';

// The first-person tools' screen footprint at rest, measured through the viewmodel's own lens:
// every triangle of the pick (with its glove and sleeve) and of the lantern (with its own) is
// projected and rasterised on a coarse grid of the screen.

type Part = 'pick' | 'lantern' | 'lanternBody';
interface Footprint {
  /** NDC bounds (x: -1 left .. 1 right; y: -1 bottom .. 1 top) of what is on screen. */
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  /** Fraction of the screen covered. */
  area: number;
}

const GW = 120;
const GH = 240;

function footprint(vm: Viewmodel, aspect: number, mirror = false): Record<Part, Footprint> {
  vm.set({ mirror });
  const cam = new THREE.PerspectiveCamera(78, aspect, 0.05, 100);
  cam.position.set(3, 4, 5);
  cam.rotation.set(-0.2, 0.7, 0, 'YXZ');
  cam.updateMatrixWorld();
  const amb = new THREE.Color(0.05, 0.05, 0.05);
  const fl = new THREE.Color(1, 0.6, 0.3);
  for (let i = 0; i < 90; i++) vm.update(1 / 60, cam, aspect, 0, 0, amb, fl);
  const internals = vm as unknown as { vmProj: THREE.Matrix4; pickSwing: THREE.Object3D; lanternSwing: THREE.Object3D; sleeves: THREE.Mesh[]; gloves: THREE.Mesh[] };
  const inv = new THREE.Matrix4().copy(vm.group.matrixWorld).invert();
  const parts: Record<Part, THREE.Mesh[]> = { pick: [internals.sleeves[0]], lantern: [internals.sleeves[1], internals.gloves[1]], lanternBody: [] };
  internals.pickSwing.traverse((o) => (o as THREE.Mesh).isMesh && parts.pick.push(o as THREE.Mesh));
  internals.lanternSwing.traverse((o) => (o as THREE.Mesh).isMesh && parts.lantern.push(o as THREE.Mesh) && parts.lanternBody.push(o as THREE.Mesh));
  const out = {} as Record<Part, Footprint>;
  const v = new THREE.Vector4();
  const m = new THREE.Matrix4();
  for (const part of ['pick', 'lantern', 'lanternBody'] as Part[]) {
    const grid = new Uint8Array(GW * GH);
    const f: Footprint = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity, area: 0 };
    for (const mesh of new Set(parts[part])) {
      m.multiplyMatrices(inv, mesh.matrixWorld);
      const pos = mesh.geometry.getAttribute('position');
      const pts: number[] = [];
      for (let i = 0; i < pos.count; i++) {
        v.set(pos.getX(i), pos.getY(i), pos.getZ(i), 1).applyMatrix4(m).applyMatrix4(internals.vmProj);
        pts.push(v.x / v.w, v.y / v.w);
      }
      for (let t = 0; t + 2 < pos.count; t += 3) {
        const ax = pts[t * 2], ay = pts[t * 2 + 1], bx = pts[t * 2 + 2], by = pts[t * 2 + 3], cx = pts[t * 2 + 4], cy = pts[t * 2 + 5];
        const d = (bx - ax) * (cy - ay) - (cx - ax) * (by - ay);
        if (Math.abs(d) < 1e-12) continue;
        const x0 = Math.max(0, Math.floor(((Math.min(ax, bx, cx) + 1) / 2) * GW));
        const x1 = Math.min(GW - 1, Math.ceil(((Math.max(ax, bx, cx) + 1) / 2) * GW));
        const y0 = Math.max(0, Math.floor(((Math.min(ay, by, cy) + 1) / 2) * GH));
        const y1 = Math.min(GH - 1, Math.ceil(((Math.max(ay, by, cy) + 1) / 2) * GH));
        for (let gy = y0; gy <= y1; gy++) {
          for (let gx = x0; gx <= x1; gx++) {
            const px = ((gx + 0.5) / GW) * 2 - 1;
            const py = ((gy + 0.5) / GH) * 2 - 1;
            const w0 = ((bx - px) * (cy - py) - (cx - px) * (by - py)) / d;
            const w1 = ((cx - px) * (ay - py) - (ax - px) * (cy - py)) / d;
            const w2 = 1 - w0 - w1;
            if (w0 < 0 || w1 < 0 || w2 < 0) continue;
            grid[gy * GW + gx] = 1;
          }
        }
      }
    }
    let n = 0;
    for (let gy = 0; gy < GH; gy++) {
      for (let gx = 0; gx < GW; gx++) {
        if (!grid[gy * GW + gx]) continue;
        n++;
        const px = ((gx + 0.5) / GW) * 2 - 1;
        const py = ((gy + 0.5) / GH) * 2 - 1;
        f.minX = Math.min(f.minX, px);
        f.maxX = Math.max(f.maxX, px);
        f.minY = Math.min(f.minY, py);
        f.maxY = Math.max(f.maxY, py);
      }
    }
    f.area = n / (GW * GH);
    out[part] = f;
  }
  return out;
}

describe('viewmodel layout', () => {
  // Portrait phone, landscape phone, desktop.
  const SHAPES = [390 / 844, 915 / 412, 16 / 9];

  it('keeps both tools out of the central 50 % column, at every tier and in either hand', () => {
    for (const tier of [1, 2, 3, 4]) {
      const vm = new Viewmodel();
      vm.set({ pickTier: tier, lanternTier: Math.min(3, tier) });
      for (const aspect of SHAPES) {
        for (const mirror of [false, true]) {
          const f = footprint(vm, aspect, mirror);
          const s = mirror ? -1 : 1;
          const at = `tier ${tier}, aspect ${aspect.toFixed(2)}${mirror ? ', left hand' : ''}`;
          // The pick on its side of the screen, the lantern on the other, never inside |x| < 0.5.
          const pickIn = mirror ? -f.pick.maxX : f.pick.minX;
          const lanternIn = mirror ? f.lantern.minX : -f.lantern.maxX;
          expect(pickIn, at).toBeGreaterThanOrEqual(0.5);
          expect(lanternIn, at).toBeGreaterThanOrEqual(0.5);
          expect(s * (f.pick.minX + f.pick.maxX), at).toBeGreaterThan(0);
          // Both stay in the lower half.
          expect(f.pick.maxY, at).toBeLessThan(-0.2);
          expect(f.lantern.maxY, at).toBeLessThan(-0.35);
        }
      }
      vm.dispose();
    }
  });

  it('is smaller than the first cut (the pick ~20 % smaller, the lantern under 3 %) and the whole lantern stays on screen', () => {
    for (const tier of [1, 2, 3, 4]) {
      const vm = new Viewmodel();
      vm.set({ pickTier: tier, lanternTier: Math.min(3, tier) });
      const port = footprint(vm, 390 / 844);
      // The first cut covered 3.1-4.0 % of a portrait screen with the pick and 3.2-4.0 % with the
      // lantern; 20 % smaller each way is 0.64 of that.
      expect(port.pick.area).toBeLessThan(0.64 * 0.04);
      // Round 2 (ROUND2 §0.5): the lantern was redone as the hero of the frame (a brass storm
      // lantern with panes, guard and flame); it may stand a little taller, still well under the
      // first cut's 3.2-4.0 %.
      expect(port.lantern.area).toBeLessThan(0.03);
      expect(port.lanternBody.area).toBeGreaterThan(0.01);
      for (const aspect of SHAPES) {
        const f = footprint(vm, aspect);
        // The lantern body (cage, fount, base) is wholly in frame on every screen shape.
        expect(f.lanternBody.minY, `aspect ${aspect.toFixed(2)}`).toBeGreaterThan(-0.95);
        expect(f.lanternBody.minX, `aspect ${aspect.toFixed(2)}`).toBeGreaterThan(-0.97);
      }
      vm.dispose();
    }
  });

  it('keeps every weapon in the right hand out of the central column and in the lower part of the view', () => {
    for (const tool of ['machete', 'spear', 'sling', 'flash'] as RightTool[]) {
      const vm = new Viewmodel();
      vm.setRightHand(tool, true);
      for (const aspect of SHAPES) {
        for (const mirror of [false, true]) {
          const f = footprint(vm, aspect, mirror);
          const at = `${tool}, aspect ${aspect.toFixed(2)}${mirror ? ', left hand' : ''}`;
          const inner = mirror ? -f.pick.maxX : f.pick.minX;
          expect(inner, at).toBeGreaterThanOrEqual(0.4);
          expect(f.pick.maxY, at).toBeLessThan(0.1);
          expect(f.pick.area, at).toBeLessThan(0.05);
        }
      }
      vm.dispose();
    }
  });
});

describe('weapon actions', () => {
  it('each blow lands at its contact frame: the spear is driven home, the sling lets go, the flash is thrown', () => {
    const c = 0.4;
    // Spear: drawn back before, furthest forward at contact.
    expect(actionPose('spear', c * 0.5, c).thrust).toBeLessThan(0);
    expect(actionPose('spear', c, c).thrust).toBeGreaterThan(0.2);
    expect(actionPose('spear', 0.999, c).thrust).toBeLessThan(0.02);
    // Sling: no kick until the release, then a kick that dies away.
    expect(actionPose('sling', c * 0.9, c).kick).toBe(0);
    expect(actionPose('sling', c + 0.02, c).kick).toBeGreaterThan(0.05);
    expect(actionPose('sling', c, c).lift).toBeGreaterThan(0.95);
    // Flash: drawn back low, then thrown up and forward.
    expect(actionPose('flash', c, c).lift).toBeLessThan(-0.3);
    expect(actionPose('flash', c + 0.2, c).thrust).toBeGreaterThan(0.1);
    // Machete: the pick's swing, a little wider; at rest outside the action.
    expect(actionPose('machete', c, c).angle).toBeLessThan(-1);
    for (const t of ['pick', 'machete', 'spear', 'sling', 'flash'] as RightTool[]) {
      expect(actionPose(t, 0, c)).toEqual({ angle: 0, thrust: 0, lift: 0, kick: 0 });
      expect(actionPose(t, 1, c)).toEqual({ angle: 0, thrust: 0, lift: 0, kick: 0 });
    }
  });

  it('a hit stop holds the blow still, then it finishes; a swap lowers the old tool first', () => {
    const vm = new Viewmodel();
    const cam = new THREE.PerspectiveCamera(78, 390 / 844, 0.05, 100);
    cam.updateMatrixWorld();
    const amb = new THREE.Color(0.05, 0.05, 0.05);
    const fl = new THREE.Color(1, 0.6, 0.3);
    vm.attack('machete', null, cam, 0.4, 0.4);
    expect(vm.rightHand).toBe('machete');
    for (let i = 0; i < 10; i++) vm.update(1 / 60, cam, 390 / 844, 0, 0, amb, fl);
    vm.hitStop(0.04);
    const internals = vm as unknown as { actT: number };
    const held = internals.actT;
    vm.update(0.02, cam, 390 / 844, 0, 0, amb, fl);
    expect(internals.actT).toBe(held);
    for (let i = 0; i < 40; i++) vm.update(1 / 60, cam, 390 / 844, 0, 0, amb, fl);
    expect(vm.swinging).toBe(false);
    // Back to the pick: lowered, then changed, then raised.
    vm.setRightHand('pick');
    vm.update(0.05, cam, 390 / 844, 0, 0, amb, fl);
    expect((vm as unknown as { shown: string }).shown).toBe('machete');
    for (let i = 0; i < 30; i++) vm.update(1 / 60, cam, 390 / 844, 0, 0, amb, fl);
    expect((vm as unknown as { shown: string }).shown).toBe('pick');
    vm.dispose();
  });
});
