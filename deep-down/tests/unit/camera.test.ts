import { describe, expect, it } from 'vitest';
import { B } from '../../src/config/blocks';
import { VoxelWorld } from '../../src/world/VoxelWorld';
import { CameraRig } from '../../src/game/CameraRig';
import { segmentClear } from '../../src/world/light';

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

  it('uses the full boom in open space', () => {
    const w = new VoxelWorld(32, 32, 32);
    const rig = new CameraRig(w);
    rig.snapTo(16, 16, 16);
    for (let i = 0; i < 200; i++) rig.update(1 / 60, 16, 16, 16, 1);
    expect(rig.distance).toBeGreaterThan(rig.maxDistance - 0.05);
  });
});
