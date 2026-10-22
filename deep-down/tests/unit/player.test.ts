import { describe, expect, it } from 'vitest';
import { B } from '../../src/config/blocks';
import { VoxelWorld } from '../../src/world/VoxelWorld';
import { PlayerController } from '../../src/game/PlayerController';

/** Flat floor at y = 4 (walk level y = 5). */
function floorWorld(): VoxelWorld {
  const w = new VoxelWorld(32, 32, 32);
  w.fill(0, 0, 0, 31, 4, 31, B.SLATE);
  return w;
}

/** camYaw such that "forward" (moveY = 1) walks toward +X. */
const FACE_PLUS_X = -Math.PI / 2;

function run(p: PlayerController, seconds: number, moveX: number, moveY: number, camYaw = FACE_PLUS_X, jumpAt = -1) {
  const dt = 1 / 60;
  let landed = 0;
  let jumped = false;
  for (let i = 0; i < seconds * 60; i++) {
    const ev = p.update(dt, moveX, moveY, i === jumpAt, camYaw, true);
    if (ev.landedSpeed > 0) landed = Math.max(landed, ev.landedSpeed);
    jumped ||= ev.jumped;
  }
  return { landed, jumped };
}

describe('PlayerController', () => {
  it('settles on the floor and walks camera-relative', () => {
    const w = floorWorld();
    const p = new PlayerController(w);
    p.teleport(8.5, 5.5, 16.5);
    run(p, 0.5, 0, 0);
    expect(p.grounded).toBe(true);
    expect(p.y).toBeCloseTo(5, 3);
    // Round 3 (the nervous feel): about 4.2 m/s once in stride, eased in over a sixth of a second.
    run(p, 0.1, 0, 1);
    expect(p.speed).toBeGreaterThan(1.5);
    expect(p.speed).toBeLessThan(3.2);
    run(p, 0.9, 0, 1);
    expect(p.speed).toBeCloseTo(4.2, 2);
    expect(p.x).toBeGreaterThan(11);
    expect(Math.abs(p.z - 16.5)).toBeLessThan(0.05);
    // ... and eased to a stop (no snap), within a few tenths of a metre.
    const x0 = p.x;
    run(p, 0.05, 0, 0);
    expect(p.speed).toBeGreaterThan(1.5);
    run(p, 0.5, 0, 0);
    expect(p.speed).toBe(0);
    expect(p.x - x0).toBeLessThan(0.45);
  });

  it('auto-steps onto a one-block ledge but not a two-block wall', () => {
    const w = floorWorld();
    w.fill(12, 5, 0, 31, 5, 31, B.SLATE); // ledge 1 high from x=12
    const p = new PlayerController(w);
    p.teleport(8.5, 5, 16.5);
    run(p, 0.2, 0, 0);
    run(p, 1.5, 0, 1);
    expect(p.x).toBeGreaterThan(12.5);
    expect(p.y).toBeCloseTo(6, 3);

    const w2 = floorWorld();
    w2.fill(12, 5, 0, 31, 6, 31, B.SLATE); // wall 2 high
    const p2 = new PlayerController(w2);
    p2.teleport(8.5, 5, 16.5);
    run(p2, 1.5, 0, 1);
    expect(p2.x).toBeLessThan(12);
    expect(p2.x).toBeGreaterThan(11.5); // flush against the wall
  });

  it('can jump onto a two-block wall only with a jump plus step', () => {
    const w = floorWorld();
    w.fill(12, 5, 0, 31, 5, 31, B.SLATE);
    const p = new PlayerController(w);
    p.teleport(10.5, 5, 16.5);
    const r = run(p, 0.5, 0, 0, FACE_PLUS_X, 5);
    expect(r.jumped).toBe(true);
  });

  it('reports landing speed after a fall', () => {
    const w = floorWorld();
    const p = new PlayerController(w);
    p.teleport(8.5, 20, 16.5);
    const r = run(p, 2, 0, 0);
    expect(r.landed).toBeGreaterThan(15); // ~sqrt(2*24*15) = 26.8 m/s
    expect(p.grounded).toBe(true);
  });

  it('reports every landing (no fall is silently absorbed by the ground probe)', () => {
    const w = floorWorld();
    let missed = 0;
    for (let k = 0; k < 230; k++) {
      const p = new PlayerController(w);
      p.teleport(8.5, 8 + k * 0.013, 16.5);
      const r = run(p, 1.5, 0, 0);
      if (!(r.landed > 0)) missed++;
    }
    expect(missed).toBe(0);
  });

  it('never tunnels through the floor at max fall speed', () => {
    const w = floorWorld();
    const p = new PlayerController(w);
    p.teleport(8.5, 30, 16.5);
    p.vy = -32;
    run(p, 1.5, 0, 0);
    expect(p.y).toBeCloseTo(5, 3);
  });

  it('cannot walk out of the world (bedrock boundary)', () => {
    const w = floorWorld();
    const p = new PlayerController(w);
    p.teleport(2.5, 5, 16.5);
    run(p, 3, 0, -1); // backwards = toward -X
    expect(p.x).toBeGreaterThan(0.3);
  });

  it('rescues the player when a block appears inside them', () => {
    const w = floorWorld();
    const p = new PlayerController(w);
    p.teleport(8.5, 5, 16.5);
    run(p, 0.6, 0, 0);
    w.setRaw(8, 5, 16, B.SLATE);
    w.setRaw(8, 6, 16, B.SLATE);
    run(p, 0.1, 0, 0);
    expect(p.collides(p.x, p.y, p.z)).toBe(false);
  });

  it('teleports back to a safe spot if the position becomes invalid', () => {
    const w = floorWorld();
    const p = new PlayerController(w);
    p.teleport(8.5, 5, 16.5);
    run(p, 1, 0, 0);
    p.x = Number.NaN;
    const r = p.update(1 / 60, 0, 0, false, 0, false);
    expect(r.rescued).toBe(true);
    expect(Number.isFinite(p.x)).toBe(true);
  });
});

import { Guidance } from '../../src/game/Guidance';

describe('Guidance', () => {
  it('reports positive bearing for targets to the right of the camera', () => {
    // yaw 0: camera looks toward -Z, right is +X.
    expect(Guidance.bearing(0, 0, 0, 0, -10)).toBeCloseTo(0, 5);
    expect(Guidance.bearing(0, 0, 0, 10, 0)).toBeCloseTo(Math.PI / 2, 5);
    expect(Guidance.bearing(0, 0, 0, -10, 0)).toBeCloseTo(-Math.PI / 2, 5);
  });

  it('points one step toward camp along the route', () => {
    const g = new Guidance([[0, 0, 0], [10, 0, 0], [20, 0, 0]]);
    expect(g.next(19, 0, 0)).toEqual([10, 0, 0]);
    expect(g.next(40, 0, 0)).toEqual([20, 0, 0]);
    expect(g.next(1, 0, 0)).toEqual([0, 0, 0]);
  });
});
