import { beforeAll, describe, expect, it } from 'vitest';
import { generateWorld } from '../../src/world/gen/generateWorld';
import type { WorldLayout } from '../../src/world/gen/types';
import { PlayerController } from '../../src/game/PlayerController';

/**
 * Drive the real player controller with joystick-style input only (no jumping, no mining)
 * along the marked route: camp -> tunnel -> ledge -> both stair flights -> hall floor, and
 * back. Proves the critical path is walkable with auto-step alone, in both directions.
 */
let layout: WorldLayout;

beforeAll(() => {
  layout = generateWorld();
});

type P = [number, number, number];

function walkTo(p: PlayerController, target: P, maxSeconds = 40): boolean {
  const dt = 1 / 30;
  let stuckTimer = 0;
  let lastD = Infinity;
  for (let t = 0; t < maxSeconds; t += dt) {
    const dx = target[0] - p.x;
    const dz = target[2] - p.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.9 && Math.abs(target[1] - p.y) < 2.5) return true;
    // Camera yaw that makes "forward" point at the target: forward = (-sin(yaw), -cos(yaw)).
    const camYaw = Math.atan2(-dx, -dz);
    p.update(dt, 0, 1, false, camYaw, true);
    if (d > lastD - 0.002) stuckTimer += dt;
    else stuckTimer = 0;
    lastD = Math.min(lastD, d);
    if (stuckTimer > 4) return false;
  }
  return false;
}

function routePoints(l: WorldLayout): P[] {
  const pts: P[] = l.route.map((r) => [r[0] + 0.5, r[1], r[2] + 0.5] as P);
  pts.push(l.landmarks.stairsTop as P, [119, 66, 74], l.landmarks.landing as P, [122.5, 64, 80.5], [122.5, 52, 92], l.landmarks.stairsBottom as P);
  return pts;
}

describe('walking the marked route', () => {
  it('reaches the Hollow floor from camp using only forward movement', () => {
    const p = new PlayerController(layout.world);
    const s = layout.spawn;
    p.teleport(s.x, s.y, s.z);
    const pts = routePoints(layout);
    const reached: string[] = [];
    for (const pt of pts) {
      const ok = walkTo(p, pt);
      expect(ok, `stuck walking to ${pt.join(',')} from ${[p.x, p.y, p.z].map((v) => v.toFixed(1)).join(',')} after ${reached.length} points`).toBe(true);
      reached.push(pt.join(','));
    }
    expect(p.y).toBeLessThan(46);
  });

  it('climbs back up to camp the same way', () => {
    const p = new PlayerController(layout.world);
    const pts = routePoints(layout).reverse();
    const start = pts[0];
    p.teleport(start[0], start[1] + 0.5, start[2]);
    for (const pt of [...pts.slice(1), [layout.spawn.x, layout.spawn.y, layout.spawn.z] as P]) {
      const ok = walkTo(p, pt);
      expect(ok, `stuck climbing to ${pt.join(',')} from ${[p.x, p.y, p.z].map((v) => v.toFixed(1)).join(',')}`).toBe(true);
    }
    expect(p.y).toBeGreaterThan(100);
  });
});

describe('walking the hall', () => {
  it('reaches the temple seal, crosses the bridge, and finds the shrine door', () => {
    const p = new PlayerController(layout.world);
    const sb = layout.landmarks.stairsBottom as P;
    p.teleport(sb[0], sb[1] + 0.5, sb[2]);
    const seal = layout.landmarks.seal as P;
    const bridge = layout.landmarks.bridge as P;
    const door = layout.landmarks.shrineDoor as P;
    const legs: Array<[string, P]> = [
      ['seal', [seal[0] - 1.5, seal[1], seal[2]]],
      ['bridge start', [bridge[0], bridge[1], bridge[2] - 7]],
      ['bridge end', [bridge[0], bridge[1], bridge[2] + 7]],
      ['bridge back', [bridge[0], bridge[1], bridge[2] - 7]],
      ['hall center', [100, 42, 108]],
      ['shrine door', [door[0] + 2.5, door[1], door[2]]],
    ];
    for (const [name, pt] of legs) {
      expect(walkTo(p, pt, 60), `stuck walking to ${name} from ${[p.x, p.y, p.z].map((v) => v.toFixed(1)).join(',')}`).toBe(true);
    }
  });
});
