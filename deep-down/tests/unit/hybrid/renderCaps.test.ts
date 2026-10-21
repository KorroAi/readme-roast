// Render caps (SPEC §8.7, BUILD §3.3 MUST 7, U-LOOK): the shard cap and life, the shake clamp, the locked 52° horizontal
// FOV, and the voxel pick ray the face and Explore floor picks stand on.
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { B } from '../../../src/config/blocks';
import { clampShake, raycastVoxels, SHAKE_MAX_DEG, SHAKE_MAX_MS, verticalFovFor } from '../../../src/render/hybrid/DepthScene';
import { CHIP_CAP, Fx, SHARD_CAP, SHARD_CAP_CEREMONY } from '../../../src/render/hybrid/Fx';
import type { PropMaterials } from '../../../src/render/lantern/propSurface';
import type { VoxelWorld } from '../../../src/world/VoxelWorld';

const mats = { prop: new THREE.MeshBasicMaterial(), crystal: new THREE.MeshBasicMaterial(), glow: new THREE.MeshBasicMaterial() } as unknown as PropMaterials;

describe('FX caps (SPEC §8.7)', () => {
  it('holds ≤ 36 live shards in a beat, ≤ 60 in a ceremony, and clears every one inside 0.8 s', () => {
    expect([SHARD_CAP, SHARD_CAP_CEREMONY, CHIP_CAP]).toEqual([36, 60, 40]);
    const fx = new Fx(mats);
    const c = new THREE.Vector3(0, 2, 0), into = new THREE.Vector3(0, 0, -1);
    for (let i = 0; i < 12; i++) fx.blockBreak(c, into, 0, 9);
    expect(fx.shards).toBe(36);
    expect(fx.groups).toBe(1);
    fx.chips(c, new THREE.Vector3(0, 1.6, 2.5), 4, false);
    expect(fx.particles).toBe(4);
    fx.ceremony(1);
    for (let i = 0; i < 6; i++) fx.wallFall(c, into, new THREE.Vector3(1, 0, 0), 16);
    expect(fx.shards).toBe(60);
    for (let t = 0; t < 0.8; t += 1 / 60) fx.update(1 / 60);
    expect(fx.shards + fx.particles).toBe(0);
    expect(fx.groups).toBe(0);
    for (let t = 0; t < 0.5; t += 1 / 60) fx.update(1 / 60);
    for (let i = 0; i < 8; i++) fx.wallFall(c, into, new THREE.Vector3(1, 0, 0), 16);
    expect(fx.shards, 'the ceremony cap lapses').toBe(36);
  });

  it('keeps a beat\'s debris ≤ 6 % of the screen from the strike reach (two bursts in flight, SPEC §8.7)', () => {
    const fx = new Fx(mats);
    const cam = new THREE.PerspectiveCamera(verticalFovFor(52, 390 / 844), 390 / 844, 0.08, 100);
    cam.position.set(0, 1.6, 2.6);
    cam.lookAt(0, 1.8, 0);
    const c = new THREE.Vector3(0, 2, 0.25), into = new THREE.Vector3(0, 0, -1);
    fx.blockBreak(c, into, 0, 9);
    fx.chips(c, cam.position, 4, false);
    let worst = 0;
    for (let t = 0; t < 0.6; t += 1 / 60) {
      if (Math.abs(t - 0.3) < 1e-6 || (t > 0.29 && t < 0.31)) fx.blockBreak(c.clone().setX(0.5), into, 0, 9);
      fx.update(1 / 60);
      worst = Math.max(worst, fx.area(cam));
    }
    expect(worst).toBeGreaterThan(0);
    expect(worst).toBeLessThanOrEqual(0.06);
  });

  it('clamps every shake to ≤ 0.4° and ≤ 120 ms', () => {
    expect(SHAKE_MAX_DEG).toBe(0.4);
    expect(SHAKE_MAX_MS).toBe(120);
    expect(clampShake(3, 900)).toEqual({ deg: 0.4, ms: 120 });
    expect(clampShake(-0.2, 60)).toEqual({ deg: 0.2, ms: 60 });
    expect(clampShake(Number.NaN, Number.NaN)).toEqual({ deg: 0, ms: 1 });
  });
});

describe('lens', () => {
  it('locks the horizontal FOV at 52°: ~93° vertical on a 390 × 844 phone, 52° at aspect 1', () => {
    expect(verticalFovFor(52, 390 / 844)).toBeCloseTo(93.1, 0);
    expect(verticalFovFor(52, 1)).toBeCloseTo(52, 5);
    expect(verticalFovFor(52, 412 / 915)).toBeGreaterThan(verticalFovFor(52, 390 / 844));
  });
});

describe('raycastVoxels', () => {
  // A 16³ room: a solid wall at voxel z = 10, a floor at y = 0, everything else air.
  const world = {
    get(x: number, y: number, z: number): number {
      if (x < 0 || y < 0 || z < 0 || x >= 16 || y >= 16 || z >= 16) return B.BEDROCK;
      if (z === 10 || y === 0) return B.SLATE;
      return B.AIR;
    },
  } as unknown as VoxelWorld;

  it('finds the wall face straight ahead with its normal and distance in metres', () => {
    const hit = raycastVoxels(world, new THREE.Vector3(4.25, 3.25, 1.25), new THREE.Vector3(0, 0, 1), 12);
    expect(hit).not.toBeNull();
    expect(hit!.z).toBe(10);
    expect(hit!.nz).toBe(-1);
    expect(hit!.t).toBeCloseTo(5 - 1.25, 5);
    expect(hit!.id).toBe(B.SLATE);
  });

  it('lands on the floor looking down and returns null past maxT', () => {
    const d = new THREE.Vector3(0.3, -1, 0.2).normalize();
    const hit = raycastVoxels(world, new THREE.Vector3(3.1, 3.1, 2.1), d, 20);
    expect(hit!.y).toBe(0);
    expect(hit!.ny).toBe(1);
    expect(raycastVoxels(world, new THREE.Vector3(4.25, 3.25, 1.25), new THREE.Vector3(0, 0, 1), 2)).toBeNull();
  });
});
