import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { CUT_Z, DescentCamera, SHAFT_X0, Spring, defaultLayout } from '../../../src/render/descent/DescentCamera';

const VIEWS: Array<[number, number, number, number]> = [
  // width, height, world region top, bottom (SPEC §9.2)
  [360, 740, 138, 540],
  [390, 844, 173, 610],
  [412, 915, 166, 691],
];

function cam(w: number, h: number, top: number, bottom: number, depth = 20): DescentCamera {
  const c = new DescentCamera({ width: w, height: h, regionTop: top, regionBottom: bottom });
  c.motion = { reduced: false, life: false, shake: 1 };
  c.setFloor(depth, true);
  c.update(0);
  return c;
}

describe('DescentCamera (SPEC §6.3)', () => {
  it('V6: cells are 44 +- 1 CSS px wide and the floor ledge is >= 22 px, at 360, 390 and 412 px', () => {
    for (const [w, h, top, bottom] of VIEWS) {
      const c = cam(w, h, top, bottom);
      const s = c.columns();
      const cell = (s.right - s.left) / 7;
      expect(cell, `${w} px`).toBeGreaterThan(43);
      expect(cell, `${w} px`).toBeLessThan(45);
      // The floor row's 3 m ledge: its front edge at the cut, its back edge at the back wall (z 57).
      const front = c.project(SHAFT_X0 + 3.5, -20, CUT_Z).y;
      const back = c.project(SHAFT_X0 + 3.5, -20, CUT_Z - 3).y;
      expect(front - back, `ledge at ${w} px`).toBeGreaterThanOrEqual(22);
    }
  });

  it('columns() are exact: the shaft centred, 7 equal strips of the width lock, the floor at 52 % of the region', () => {
    for (const [w, h, top, bottom] of VIEWS) {
      const c = cam(w, h, top, bottom);
      const s = c.columns();
      const ppm = w / Math.min(9.6, Math.max(8.2, w / 44));
      expect(s.left).toBeCloseTo(w / 2 - 3.5 * ppm, 3);
      expect(s.right).toBeCloseTo(w / 2 + 3.5 * ppm, 3);
      expect(s.floorY).toBeCloseTo(top + 0.52 * (bottom - top), 3);
      expect(c.floorScreenY()).toBeCloseTo(s.floorY, 6);
    }
  });

  it('screenOf(row, col) is the centre of the cell face, rows 44 px apart', () => {
    const c = cam(390, 844, 173, 610);
    const a = c.screenOf(20, 3);
    const b = c.screenOf(21, 3);
    expect(a.x).toBeCloseTo(195, 2);
    expect(b.y - a.y).toBeCloseTo(44, 0);
    expect(a.y).toBeCloseTo(c.floorScreenY() + 22, 1);
  });

  it('the follow spring lands a row drop with a ~4.5 % overshoot (2 px) and settles within 0.7 s', () => {
    const c = cam(390, 844, 173, 610, 20);
    c.setFloor(21);
    let minY = Infinity;
    let t = 0;
    let settled = -1;
    for (let i = 0; i < 120; i++) {
      c.update(1 / 60);
      t += 1 / 60;
      minY = Math.min(minY, c.followY);
      if (settled < 0 && i > 5 && Math.abs(c.followY + 21) < 0.02) settled = t;
    }
    const overshoot = -21 - minY;
    expect(overshoot).toBeGreaterThan(0.03);
    expect(overshoot).toBeLessThan(0.06);
    expect(settled).toBeGreaterThan(0);
    expect(settled).toBeLessThan(0.75);
  });

  it('a tap kick peaks at about 2 px some 31 ms later and stays under the 6 px cap', () => {
    const c = cam(390, 844, 173, 610);
    c.kick(0, 1);
    let peak = 0;
    let peakT = 0;
    for (let i = 1; i <= 30; i++) {
      c.update(1 / 600);
      if (c.kickPx > peak) {
        peak = c.kickPx;
        peakT = i / 600;
      }
    }
    expect(peak).toBeGreaterThan(1.5);
    expect(peak).toBeLessThan(2.4);
    expect(peakT).toBeGreaterThan(0.024);
    expect(peakT).toBeLessThan(0.038);
    for (let i = 0; i < 20; i++) c.kick(0, 1, true);
    c.update(1 / 60);
    expect(c.kickPx).toBeLessThanOrEqual(6.0001);
  });

  it('Reduced motion: the camera is at rest every frame (no kick, no shake, no sway; the follow is a tween)', () => {
    const c = cam(390, 844, 173, 610);
    c.motion = { reduced: true, life: false, shake: 1 };
    c.setFloor(21);
    c.kick(0, 1, true);
    c.addTrauma(1);
    const p = new THREE.PerspectiveCamera();
    for (let i = 0; i < 30; i++) {
      c.update(1 / 60);
      expect(c.kickPx).toBe(0);
      expect(c.traumaNow).toBe(0);
      c.apply(p);
      expect(p.rotation.y).toBe(0);
      expect(p.rotation.z).toBe(0);
    }
    // The tween reaches the floor without overshoot by 220 ms.
    expect(c.followY).toBe(-21);
    expect(c.atRest()).toBe(true);
  });

  it('the sheet re-frame puts the floor at 60 % of the strip above the sheet', () => {
    const c = cam(390, 844, 173, 610);
    c.setSheet(1);
    for (let i = 0; i < 120; i++) c.update(1 / 60);
    const sheetTop = 0.42 * 844;
    expect(c.floorScreenY()).toBeCloseTo(173 + 0.6 * (sheetTop - 173), 0);
  });

  it('the default layout matches SPEC §9.2 at the reference viewports', () => {
    expect(defaultLayout(390, 844).regionTop).toBeCloseTo(173, 3);
    expect(defaultLayout(390, 844).regionBottom).toBeCloseTo(610, 3);
    expect(defaultLayout(360, 740).regionBottom).toBeCloseTo(540, 3);
  });

  it('springs are stepped exactly (frame-rate independent)', () => {
    const a = new Spring(0, 9, 0.7);
    const b = new Spring(0, 9, 0.7);
    a.target = b.target = 1;
    for (let i = 0; i < 60; i++) a.step(1 / 60);
    for (let i = 0; i < 30; i++) b.step(1 / 30);
    expect(a.x).toBeCloseTo(b.x, 9);
  });

  it('W2 life sway moves the eye, not the cut: the cut plane stays within 1 px while the back of a cavern drifts', () => {
    const c = cam(390, 844, 173, 610);
    c.motion = { reduced: false, life: true, shake: 1 };
    const p = new THREE.PerspectiveCamera();
    const at = (x: number, y: number, z: number) => {
      c.apply(p, false);
      p.updateMatrixWorld(true);
      const v = new THREE.Vector3(x, y, z).project(p);
      return { x: (v.x * 0.5 + 0.5) * 390, y: (0.5 - v.y * 0.5) * 844 };
    };
    const cut0 = at(SHAFT_X0 + 3.5, -20, CUT_Z);
    const far0 = at(SHAFT_X0 + 3.5, -20, CUT_Z - 30);
    let cutMax = 0;
    let farMax = 0;
    for (let i = 0; i < 60 * 12; i++) {
      c.update(1 / 60);
      const a = at(SHAFT_X0 + 3.5, -20, CUT_Z);
      const b = at(SHAFT_X0 + 3.5, -20, CUT_Z - 30);
      cutMax = Math.max(cutMax, Math.hypot(a.x - cut0.x, a.y - cut0.y));
      farMax = Math.max(farMax, Math.hypot(b.x - far0.x, b.y - far0.y));
    }
    expect(cutMax).toBeLessThanOrEqual(1);
    expect(farMax).toBeGreaterThan(2);
  });

  it('W2 breakthrough fall: a drop of more than 3 rows falls (hold, accelerate, land with an overshoot) and reports the landing', () => {
    const c = cam(390, 844, 173, 610, 20);
    c.setFloor(40);
    expect(c.falling).toBe(true);
    let landed = '';
    let t = 0;
    let minY = Infinity;
    for (; t < 4 && !landed; t += 1 / 60) {
      c.update(1 / 60);
      minY = Math.min(minY, c.followY);
      if (c.landed) landed = c.landed;
    }
    expect(landed).toBe('fall');
    expect(t).toBeGreaterThan(0.25);
    expect(t).toBeLessThan(2);
    // A one-row step is not a fall.
    c.setFloor(41);
    expect(c.falling).toBe(false);
  });

  it('W2 Vista dolly: the camera backs out to 24 m and returns to the 12.6 m shot; Reduced motion skips it', () => {
    const c = cam(390, 844, 173, 610, 20);
    const d0 = c.distance;
    c.startDolly();
    let far = 0;
    for (let i = 0; i < 60 * 5; i++) {
      c.update(1 / 60);
      far = Math.max(far, c.distance);
    }
    expect(far).toBeGreaterThan(23);
    expect(c.distance).toBeCloseTo(d0, 3);
    const r = cam(390, 844, 173, 610, 20);
    r.motion = { reduced: true, life: false, shake: 1 };
    r.startDolly();
    r.update(1);
    expect(r.distance).toBeCloseTo(d0, 6);
  });
});
