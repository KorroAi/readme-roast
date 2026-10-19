import { describe, expect, it } from 'vitest';
import { B } from '../../src/config/blocks';
import { VoxelWorld } from '../../src/world/VoxelWorld';
import { CameraRig } from '../../src/game/CameraRig';
import { segmentClear } from '../../src/world/light';
import { generateWorld } from '../../src/world/gen/generateWorld';
import { standable } from '../../src/world/analysis/reachability';
import { Rng } from '../../src/core/rng';

/** A 3x3 tunnel along X (y 5..7, z 15..17) through solid rock. */
function tunnelWorld(): VoxelWorld {
  const w = new VoxelWorld(32, 16, 32);
  w.blocks.fill(B.SLATE);
  w.fill(1, 5, 15, 30, 7, 17, B.AIR);
  return w;
}

describe('CameraRig collision', () => {
  it('never puts the camera inside rock or behind rock while turning in a tight tunnel', () => {
    const w = tunnelWorld();
    const rig = new CameraRig(w);
    const px = 16.5;
    const py = 5 + 1.45;
    const pz = 16.5;
    rig.snapTo(px, py, pz);
    let bad = 0;
    for (let i = 0; i < 360; i++) {
      rig.yaw = (i / 360) * Math.PI * 6; // fast swipes: three full turns in 6 s
      rig.pitch = -0.2 + 0.3 * Math.sin(i * 0.1);
      rig.update(1 / 60, px, py, pz, 16 / 9);
      const c = rig.camera.position;
      if (w.isSolidAt(c.x, c.y, c.z)) bad++;
      else if (!segmentClear(w, px, py, pz, c.x, c.y, c.z)) bad++;
    }
    expect(bad).toBe(0);
  });

  it('stays clear when the explorer is flush against a wall on the shoulder side', () => {
    const w = tunnelWorld();
    const rig = new CameraRig(w);
    // Wall at z = 18 (solid). Put the explorer 0.31 m from it and look along -X so "right" is +Z.
    const px = 16.5;
    const py = 6.45;
    const pz = 17.69;
    rig.snapTo(px, py, pz);
    rig.yaw = Math.PI / 2 * 1; // camera forward = (-1, 0, 0)
    rig.yaw = Math.PI / 2;
    for (let i = 0; i < 30; i++) rig.update(1 / 60, px, py, pz, 16 / 9);
    const c = rig.camera.position;
    expect(w.isSolidAt(c.x, c.y, c.z)).toBe(false);
  });

  it('swaps to the left shoulder when the right is walled in, keeping the explorer off the crosshair', () => {
    const w = tunnelWorld();
    const rig = new CameraRig(w);
    const px = 16.5;
    const py = 6.45;
    const pz = 17.6; // right side (+Z when yaw = -pi/2) is the wall at z = 18
    rig.snapTo(px, py, pz);
    rig.yaw = -Math.PI / 2;
    rig.pitch = -0.1;
    for (let i = 0; i < 90; i++) rig.update(1 / 60, px, py, pz, 16 / 9);
    const c = rig.camera.position;
    expect(c.z).toBeLessThan(pz - 0.3);
    expect(w.isSolidAt(c.x, c.y, c.z)).toBe(false);
    expect(segmentClear(w, px, py, pz, c.x, c.y, c.z)).toBe(true);
  });

  it('uses the full boom in open space', () => {
    const w = new VoxelWorld(32, 32, 32);
    const rig = new CameraRig(w);
    rig.snapTo(16, 16, 16);
    for (let i = 0; i < 200; i++) rig.update(1 / 60, 16, 16, 16, 1);
    expect(rig.distance).toBeGreaterThan(rig.maxDistance - 0.05);
  });

  it('keeps a clear line to the explorer at random poses all over the real zone (fuzz)', () => {
    const { world, landmarks } = generateWorld();
    const rng = new Rng(4242);
    const centres = Object.values(landmarks).filter((v): v is [number, number, number] => !!v);
    const rig = new CameraRig(world);
    let poses = 0;
    let blocked = 0;
    let inside = 0;
    for (let attempt = 0; attempt < 8000 && poses < 400; attempt++) {
      const c = centres[rng.int(0, centres.length - 1)];
      const x = Math.floor(c[0]) + rng.int(-8, 8);
      const y = Math.floor(c[1]) + rng.int(-4, 4);
      const z = Math.floor(c[2]) + rng.int(-8, 8);
      if (!standable(world, x, y, z)) continue;
      poses++;
      const px = x + 0.5;
      const py = y + 1.45;
      const pz = z + 0.5;
      rig.snapTo(px, py, pz);
      rig.yaw = rng.range(-Math.PI, Math.PI);
      rig.pitch = rng.range(-1.1, 0.8);
      for (let f = 0; f < 60; f++) {
        if (f % 20 === 10) rig.yaw += rng.range(-0.8, 0.8); // a swipe mid-settle
        rig.update(1 / 60, px, py, pz, 16 / 9);
        const cam = rig.camera.position;
        if (world.isSolidAt(cam.x, cam.y, cam.z)) inside++;
        else if (!segmentClear(world, px, py, pz, cam.x, cam.y, cam.z)) blocked++;
      }
    }
    expect(poses).toBeGreaterThan(300);
    expect(inside).toBe(0);
    expect(blocked).toBe(0);
  }, 60_000);
});
