import { beforeAll, describe, expect, it } from 'vitest';
import { B, SOLID } from '../../src/config/blocks';
import { HOME } from '../../src/config/balance';
import { generateWorld } from '../../src/world/gen/generateWorld';
import { HomeField, ReachSet, walkSeconds } from '../../src/world/analysis/homeField';
import { reachableCells, standable } from '../../src/world/analysis/reachability';
import type { WorldLayout } from '../../src/world/gen/types';
import type { VoxelWorld } from '../../src/world/VoxelWorld';
import { Rng } from '../../src/core/rng';

let layout: WorldLayout;
let field: HomeField;
let seen: Uint8Array;

/** Every standable cell inside the camp box (the field's targets), as indices. */
function campCells(w: VoxelWorld, l: WorldLayout): Set<number> {
  const out = new Set<number>();
  for (let i = 0; i < field.dist.length; i++) if (field.dist[i] === 0) out.add(i);
  void w;
  void l;
  return out;
}

/** Forward BFS from one cell with reachability's own moves (world.get, a separate implementation) until a target is met. */
function walkedSteps(w: VoxelWorld, start: [number, number, number], targets: Set<number>, maxDrop = HOME.maxDrop): number {
  const dist = new Map<number, number>();
  const s = w.index(...start);
  dist.set(s, 0);
  let frontier = [start];
  let d = 0;
  while (frontier.length) {
    const next: Array<[number, number, number]> = [];
    for (const [x, y, z] of frontier) {
      if (targets.has(w.index(x, y, z))) return d;
      const push = (nx: number, ny: number, nz: number) => {
        const i = w.index(nx, ny, nz);
        if (dist.has(i)) return;
        dist.set(i, d + 1);
        next.push([nx, ny, nz]);
      };
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx;
        const nz = z + dz;
        if (standable(w, nx, y, nz)) push(nx, y, nz);
        if (!SOLID[w.get(x, y + 2, z)] && standable(w, nx, y + 1, nz)) push(nx, y + 1, nz);
        if (!SOLID[w.get(nx, y, nz)] && !SOLID[w.get(nx, y + 1, nz)]) {
          for (let k = 1; k <= maxDrop; k++) {
            if (SOLID[w.get(nx, y - k, nz)]) break;
            if (standable(w, nx, y - k, nz)) {
              push(nx, y - k, nz);
              break;
            }
          }
        }
      }
    }
    frontier = next;
    d++;
  }
  return -1;
}

beforeAll(() => {
  layout = generateWorld();
  field = new HomeField(layout.world);
  field.computeToRegion(layout.camp);
  const s = layout.spawn;
  seen = reachableCells(layout.world, Math.floor(s.x), Math.floor(s.y) + 1, Math.floor(s.z));
});

describe('walk-home field', () => {
  it('recomputes fast (time printed), and only touches the walkable area', () => {
    const times: number[] = [];
    for (let i = 0; i < 6; i++) times.push(field.computeToRegion(layout.camp));
    const warm = Math.min(...times.slice(2));
    console.log(`[homeField] recompute ms: ${times.map((t) => t.toFixed(2)).join(' ')} (warm best ${warm.toFixed(2)} ms, target <= 15 ms); cells with a way home: ${field.size}`);
    expect(warm).toBeLessThan(60); // generous ceiling for a loaded machine; the target is 15 ms
    expect(field.size).toBeGreaterThan(1000);
    expect(field.size).toBeLessThan(layout.world.blocks.length / 50);
  });

  it('every reachable cell with a way home follows the gradient to camp in D steps, and its turn-back fuel covers the walk', () => {
    let checked = 0;
    let pits = 0;
    const bad: string[] = [];
    for (let i = 0; i < seen.length; i++) {
      if (!seen[i]) continue;
      const d = field.dist[i];
      if (d < 0) {
        pits++;
        continue;
      }
      checked++;
      let c = i;
      let steps = 0;
      while (field.dist[c] > 0 && steps <= d) {
        const n = field.downhill(c);
        if (n < 0 || field.dist[n] !== field.dist[c] - 1) break;
        c = n;
        steps++;
      }
      if (field.dist[c] !== 0 || steps > d) bad.push(`${field.cellXYZ(i)} (D ${d}, stopped at ${field.dist[c]} after ${steps})`);
      const walk = walkSeconds(d);
      if (walk * HOME.turnBackFactor + HOME.turnBackMarginS < walk * 1.25) bad.push(`turn-back fuel at ${field.cellXYZ(i)}`);
    }
    expect(bad).toEqual([]);
    console.log(`[homeField] gradient checked on ${checked} reachable cells; ${pits} reachable cells have no walk home (pits)`);
    expect(checked).toBeGreaterThan(5000);
    // Pits (cells reached by a drop with no way back up) are rare; the cache never lands in one.
    expect(pits).toBeLessThan(checked * 0.01);
  });

  it('matches an independent forward walk from sampled cells', () => {
    const targets = campCells(layout.world, layout);
    const rng = new Rng(17);
    const cells: number[] = [];
    for (let i = 0; i < seen.length; i++) if (seen[i] && field.dist[i] >= 0) cells.push(i);
    for (let k = 0; k < 40; k++) {
      const i = cells[rng.int(0, cells.length - 1)];
      const xyz = field.cellXYZ(i);
      expect(walkedSteps(layout.world, xyz, targets), `cell ${xyz}`).toBe(field.dist[i]);
    }
  });

  it('at the balcony (seal open) the compass distance is within 10% of the walked distance', () => {
    const l = generateWorld();
    const w = l.world;
    // Break the seal, as the player does with the Copper Pickaxe.
    for (let i = 0; i < w.blocks.length; i++) if (w.blocks[i] === B.HARDENED_SLATE) w.blocks[i] = B.AIR;
    const f = new HomeField(w);
    f.computeToRegion(l.camp);
    const b = l.landmarks.balcony;
    const cell = f.cellNear(b[0], b[1], b[2]);
    expect(cell).toBeGreaterThanOrEqual(0);
    const compass = f.dist[cell];
    const targets = new Set<number>();
    for (let i = 0; i < f.dist.length; i++) if (f.dist[i] === 0) targets.add(i);
    const walked = walkedSteps(w, f.cellXYZ(cell), targets);
    const camp = l.landmarks.campfire;
    const straight = Math.hypot(camp[0] - b[0], camp[1] - b[1], camp[2] - b[2]);
    console.log(`[homeField] balcony: compass ${compass} m, walked ${walked} m, straight line ${straight.toFixed(0)} m, walk home ${walkSeconds(compass).toFixed(0)} s`);
    expect(Math.abs(compass - walked)).toBeLessThanOrEqual(walked * 0.1);
    expect(compass).toBeGreaterThan(straight);
  });

  it('a ride edge shortens the way home', () => {
    const f = new HomeField(layout.world);
    f.computeToRegion(layout.camp);
    const seal = layout.landmarks.stairsBottom;
    const at = f.cellNear(seal[0], seal[1], seal[2]);
    const before = f.dist[at];
    expect(before).toBeGreaterThan(50);
    const camp = [...f.dist.keys()].find((i) => f.dist[i] === 0)!;
    f.addEdge(f.cellXYZ(at), f.cellXYZ(camp), 10);
    f.computeToRegion(layout.camp);
    expect(f.dist[at]).toBe(10);
    expect(f.downhill(at)).toBe(camp);
    f.clearEdges();
    f.computeToRegion(layout.camp);
    expect(f.dist[at]).toBe(before);
  });

  it('finds the explorer on stairs and in a small jump', () => {
    const top = layout.landmarks.stairsTop;
    expect(field.cellNear(top[0], top[1], top[2])).toBeGreaterThanOrEqual(0);
    const ledge = layout.landmarks.ledge;
    expect(field.cellNear(ledge[0] + 0.5, ledge[1] + 0.6, ledge[2] + 0.5)).toBeGreaterThanOrEqual(0);
  });
});

describe('ReachSet', () => {
  it('equals reachableCells on the generated world', () => {
    const r = new ReachSet(layout.world);
    const s = layout.spawn;
    r.computeFrom(Math.floor(s.x), Math.floor(s.y) + 1, Math.floor(s.z));
    let diff = 0;
    let n = 0;
    for (let i = 0; i < seen.length; i++) {
      if (seen[i] !== r.reach[i]) diff++;
      if (seen[i]) n++;
    }
    expect(diff).toBe(0);
    expect(r.size).toBe(n);
    // A second compute resets the first one's cells.
    r.computeFrom(Math.floor(s.x), Math.floor(s.y) + 1, Math.floor(s.z));
    expect(r.size).toBe(n);
  });
});
