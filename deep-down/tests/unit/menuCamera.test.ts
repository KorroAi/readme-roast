import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { lockedVerticalFov } from '../../src/game/CameraRig';
import { MENU_FPS, MENU_HFOV, MenuCamera, menuExplorerPose, menuFov, menuPose } from '../../src/game/MenuCamera';
import { generateWorld } from '../../src/world/gen/generateWorld';

/** The title camera exactly as Game.updateMenu computed it before the extraction (commit ee3c11e). */
function preRefactor(t: number, ledge: readonly [number, number, number]) {
  return {
    x: ledge[0] + 5 + Math.sin(t * 0.05) * 1.2,
    y: ledge[1] + 3.5 + Math.sin(t * 0.08) * 0.4,
    z: ledge[2] + 6 + Math.cos(t * 0.05) * 1.2,
    pitch: -0.5 + Math.sin(t * 0.06) * 0.04,
    yaw: -2.2 + Math.sin(t * 0.045) * 0.16,
  };
}

describe('MenuCamera', () => {
  const ledge: [number, number, number] = [92, 88, 76];

  it('keeps the pre-refactor pose for t = 0..10 s', () => {
    for (let t = 0; t <= 10; t += 0.25) {
      const a = menuPose(t, ledge);
      const b = preRefactor(t, ledge);
      for (const k of ['x', 'y', 'z', 'pitch', 'yaw'] as const) expect(Math.abs(a[k] - b[k])).toBeLessThan(1e-6);
    }
  });

  it('drives a camera along that pose, with the gameplay lens', () => {
    const cam = new THREE.PerspectiveCamera();
    const mc = new MenuCamera(ledge);
    const aspect = 915 / 412;
    for (let i = 0; i < 300; i++) mc.update(1 / 30, cam, aspect); // 10 s at the menu's 30 fps
    const b = preRefactor(mc.time, ledge);
    expect(cam.position.distanceTo(new THREE.Vector3(b.x, b.y, b.z))).toBeLessThan(1e-6);
    expect(cam.rotation.order).toBe('YXZ');
    expect(Math.abs(cam.rotation.x - b.pitch)).toBeLessThan(1e-6);
    expect(Math.abs(cam.rotation.y - b.yaw)).toBeLessThan(1e-6);
    // A locked horizontal lens like gameplay's, not a 68 degree vertical one (112 degrees across at 2.22:1).
    expect(cam.fov).toBeCloseTo(lockedVerticalFov(aspect, MENU_HFOV), 9);
    expect(MENU_HFOV).toBeGreaterThanOrEqual(90);
    expect(MENU_HFOV).toBeLessThanOrEqual(96);
    const hfov = (2 * Math.atan(Math.tan((cam.fov * Math.PI) / 360) * aspect) * 180) / Math.PI;
    expect(hfov).toBeCloseTo(MENU_HFOV, 6);
    expect(menuFov(aspect)).toBe(cam.fov);
    mc.reset();
    expect(mc.time).toBe(0);
  });

  it('runs the title screen at 30 fps', () => {
    expect(MENU_FPS).toBe(30);
  });

  it('stands the explorer on the very lip of the ledge', () => {
    const l = generateWorld();
    const lm = l.landmarks.ledge;
    const p = menuExplorerPose(l.world, lm);
    expect(p.y).toBe(lm[1]);
    // Walked out from the landmark, still on rock, with open air a step ahead.
    expect(Math.hypot(p.x - (lm[0] + 0.5), p.z - (lm[2] + 0.5))).toBeGreaterThan(0.2);
    expect(l.world.isSolid(Math.floor(p.x), Math.floor(lm[1]) - 1, Math.floor(p.z))).toBe(true);
    const ahead = [Math.floor(p.x + Math.sin(p.yaw) * 1.15), Math.floor(p.z + Math.cos(p.yaw) * 1.15)];
    expect(l.world.isSolid(ahead[0], Math.floor(lm[1]) - 1, ahead[1])).toBe(false);
  });
});
