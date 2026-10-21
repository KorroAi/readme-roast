import { beforeAll, describe, expect, it } from 'vitest';
import { RIDES } from '../../src/config/balance';
import { rideEdges } from '../../src/game/ropeRide';
import { HomeField, ReachSet } from '../../src/world/analysis/homeField';
import { generateWorld } from '../../src/world/gen/generateWorld';
import type { WorldLayout } from '../../src/world/gen/types';
import type { VoxelWorld } from '../../src/world/VoxelWorld';
import { openWorld } from '../../tools/poi-density';

/**
 * The compass and the walk home follow the walk-home field (world/analysis/homeField). The rides
 * are edges of it (game/ropeRide rideEdges, applied by game/WorldFeatures through Progression), so
 * from every new place the field leads home, the hoist shortens the way back from the yard, and the
 * rift floor's only way home is the rope.
 */
let layout: WorldLayout;
let w: VoxelWorld;

beforeAll(() => {
  layout = generateWorld();
  w = openWorld(layout);
});

function field(edges: ReturnType<typeof rideEdges>): HomeField {
  const f = new HomeField(w);
  for (const e of edges) f.addEdge(e.from, e.to, e.cost);
  f.computeToRegion(layout.camp);
  return f;
}

const at = (f: HomeField, p: readonly number[]) => {
  const c = f.cellNear(p[0], p[1], p[2]);
  return c >= 0 ? f.dist[c] : -1;
};

describe('the way home from the new places', () => {
  it('leads home from every point of interest the player must reach', () => {
    const f = field(rideEdges(layout.features!.links, true, RIDES.stepsPerSecond));
    for (const p of layout.features!.pois) {
      if (!p.mustReach) continue;
      // The nearest walkable cell to the point (pickups sit in walls, sights over the floor).
      let best = -1;
      for (let dy = -3; dy <= 2 && best < 0; dy++)
        for (let r = 0; r <= 2 && best < 0; r++)
          for (let dz = -r; dz <= r && best < 0; dz++)
            for (let dx = -r; dx <= r && best < 0; dx++) {
              const d = f.at(Math.floor(p.p[0]) + dx, Math.floor(p.p[1]) + dy, Math.floor(p.p[2]) + dz);
              if (d >= 0) best = d;
            }
      expect(best, `${p.id} has a way home`).toBeGreaterThan(0);
    }
  });

  it('the rift floor has a way home only by the rope', () => {
    const links = layout.features!.links;
    const camp = layout.landmarks.lastCamp;
    expect(at(field(rideEdges(links, false, RIDES.stepsPerSecond)), camp)).toBeGreaterThan(0);
    expect(at(field(rideEdges(links.filter((l) => l.id !== 'riftRope'), true, RIDES.stepsPerSecond)), camp)).toBe(-1);
    // The reach set (where a pack left behind may lie) follows the rope too.
    const reach = new ReachSet(w);
    for (const e of rideEdges(links, false, RIDES.stepsPerSecond)) reach.addEdge(e.from, e.to);
    const s = layout.spawn;
    reach.computeFrom(Math.floor(s.x), Math.floor(s.y) + 1, Math.floor(s.z));
    const bottom = links.find((l) => l.id === 'riftRope')!.bottom;
    expect(reach.has(Math.floor(bottom[0]), bottom[1], Math.floor(bottom[2]))).toBe(true);
  });

  it('the hoist makes the walk home from the yard at least 20 % shorter, and the yard points up it', () => {
    const links = layout.features!.links;
    const hoist = links.find((l) => l.id === 'hoist')!;
    const stairsOnly = field(rideEdges(links.filter((l) => l.id !== 'hoist'), false, RIDES.stepsPerSecond));
    const withHoist = field(rideEdges(links, true, RIDES.stepsPerSecond));
    for (const yard of [[92, 41, 85], hoist.bottom] as Array<readonly number[]>) {
      const a = at(stairsOnly, yard);
      const b = at(withHoist, yard);
      expect(a).toBeGreaterThan(0);
      expect(b / a, `yard ${yard.join(',')}: ${b} vs ${a} steps`).toBeLessThanOrEqual(0.8);
    }
    // Downhill from the hoist's foot is the ride up: the next cell is the top stand.
    const c = withHoist.cellNear(hoist.bottom[0], hoist.bottom[1], hoist.bottom[2]);
    expect(withHoist.cellXYZ(withHoist.downhill(c))).toEqual([Math.floor(hoist.top[0]), hoist.top[1], Math.floor(hoist.top[2])]);
  });
});
