// The walkability grid (W1-LEAD §3 and §5: per-voxel walkable flags, step-up links, ladder and rope links, a pure
// findPath that 1D's Explore walks on) on hand-made grids, then on the W1 world: every chamber's arrival reaches its
// exit and every socket it shows.
import { describe, expect, it } from 'vitest';
import { B } from '../../../src/config/blocks';
import { NavGrid, pathLengthM, type VoxelReader } from '../../../src/world/hybrid/nav';
import { DeepWorld } from '../../../src/world/hybrid/DeepWorld';
import { planWalk } from '../../../src/game/hybrid/explore';

/** A box world: solid everywhere, with air boxes carved (voxel coordinates, inclusive-exclusive). */
class TestGrid implements VoxelReader {
  private readonly air = new Set<string>();
  private readonly solidOverride = new Set<string>();
  carve(x0: number, j0: number, z0: number, x1: number, j1: number, z1: number): this {
    for (let x = x0; x < x1; x++) for (let j = j0; j < j1; j++) for (let z = z0; z < z1; z++) this.air.add(`${x},${j},${z}`);
    return this;
  }
  fill(x0: number, j0: number, z0: number, x1: number, j1: number, z1: number): this {
    for (let x = x0; x < x1; x++) for (let j = j0; j < j1; j++) for (let z = z0; z < z1; z++) {
      this.air.delete(`${x},${j},${z}`);
      this.solidOverride.add(`${x},${j},${z}`);
    }
    return this;
  }
  get(x: number, j: number, z: number): number {
    return this.air.has(`${x},${j},${z}`) ? B.AIR : B.SLATE;
  }
}

const bounds = { x0: 0, x1: 40, j0: 0, j1: 30, z0: 0, z1: 40 };
/** Feet point of voxel (x, j, z): the cell centre on the floor surface. */
const feet = (x: number, j: number, z: number) => ({ x: (x + 0.5) * 0.5, y: j * 0.5, z: (z + 0.5) * 0.5 });

describe('NavGrid on hand-made grids', () => {
  it('a room: walkable away from the walls, not inside them, not without headroom', () => {
    // A 10 x 10 voxel room (5 m), 6 voxels tall, floor at j = 2 (feet row 2).
    const g = new TestGrid().carve(5, 2, 5, 15, 8, 15);
    const nav = new NavGrid(g, bounds);
    expect(nav.walkableAt(5.25, 1.0, 5.25)).toBe(true); // the middle (voxel 10, 2, 10)
    expect(nav.walkableAt((5 + 0.5) * 0.5, 1.0, (10 + 0.5) * 0.5)).toBe(false); // the cell against the wall (clearance)
    expect(nav.walkableAt((6 + 0.5) * 0.5, 1.0, (10 + 0.5) * 0.5)).toBe(true); // one cell in
    expect(nav.walkableAt(5, 0.5, 5)).toBe(false); // inside the floor
    // A low ceiling (3 voxels = 1.5 m) is not walkable.
    const low = new TestGrid().carve(5, 2, 5, 15, 5, 15);
    expect(new NavGrid(low, bounds).walkableCells().length).toBe(0);
  });

  it('climbs a 0.5 m step, never a 1.0 m one', () => {
    // Two rooms side by side along x: floor j = 2, then j = 3 (one step up), then j = 5 (a 1 m ledge).
    const g = new TestGrid().carve(2, 2, 4, 12, 10, 14).carve(12, 3, 4, 22, 10, 14).carve(22, 5, 4, 32, 12, 14);
    const nav = new NavGrid(g, bounds);
    const a = feet(6, 2, 9);
    const b = feet(17, 3, 9);
    const c = feet(27, 5, 9);
    const ab = nav.findPath(a, b);
    expect(ab).not.toBeNull();
    expect(ab![ab!.length - 1]).toEqual(b);
    // Each step of the path changes the floor by at most one voxel.
    for (let i = 1; i < ab!.length; i++) expect(Math.abs(ab![i].y - ab![i - 1].y)).toBeLessThanOrEqual(0.5 + 1e-9);
    expect(nav.findPath(b, c)).toBeNull();
  });

  it('walks a stair of 0.5 m steps up 2.5 m', () => {
    const g = new TestGrid().carve(2, 2, 4, 10, 12, 12);
    for (let s = 0; s < 5; s++) g.carve(10 + s * 2, 3 + s, 4, 12 + s * 2, 12, 12);
    g.carve(20, 7, 4, 30, 14, 12);
    const nav = new NavGrid(g, bounds);
    const p = nav.findPath(feet(5, 2, 8), feet(25, 7, 8));
    expect(p).not.toBeNull();
    expect(p![p!.length - 1].y).toBeCloseTo(3.5, 9);
  });

  it('never cuts a corner and goes around a pillar', () => {
    const g = new TestGrid().carve(2, 2, 2, 22, 8, 22).fill(10, 2, 2, 12, 8, 16);
    const nav = new NavGrid(g, bounds);
    const p = nav.findPath(feet(5, 2, 5), feet(18, 2, 5));
    expect(p).not.toBeNull();
    // The wall runs z 2..16: the path must pass beyond z 16 (+ clearance).
    expect(Math.max(...p!.map((q) => q.z))).toBeGreaterThan(8);
    for (const q of p!) expect(nav.walkableAt(q.x, q.y, q.z)).toBe(true);
  });

  it('rides a ladder link between two floors', () => {
    const g = new TestGrid().carve(2, 2, 2, 12, 8, 12).carve(2, 14, 2, 12, 20, 12);
    const top = feet(6, 14, 6);
    const bottom = feet(6, 2, 6);
    expect(new NavGrid(g, bounds).findPath(bottom, top)).toBeNull();
    const nav = new NavGrid(g, bounds, { links: [{ a: bottom, b: top, kind: 'ladder' }] });
    const p = nav.findPath(feet(4, 2, 4), feet(9, 14, 9));
    expect(p).not.toBeNull();
    expect(p!.some((q) => q.y === top.y)).toBe(true);
  });

  it('keeps out of prop blockers and snaps a near point onto the floor', () => {
    const g = new TestGrid().carve(2, 2, 2, 22, 8, 22);
    const nav = new NavGrid(g, bounds, { blockers: [{ pos: { x: 6, y: 1, z: 6 }, r: 0.8 }] });
    expect(nav.walkableAt(6.25, 1, 6.25)).toBe(false);
    const q = nav.nearestWalkable({ x: 6.2, y: 1.6, z: 6.2 }, 2)!;
    expect(q).not.toBeNull();
    expect(Math.hypot(q.x - 6, q.z - 6)).toBeGreaterThan(0.8);
  });

  it("is 1D's NavLike: planWalk turns a tapped point into an eye path on it", () => {
    const g = new TestGrid().carve(2, 2, 2, 30, 8, 30);
    const nav = new NavGrid(g, bounds);
    const plan = planWalk(nav, { x: 3, y: 1 + 1.6, z: 3 }, { x: 12, y: 1, z: 12 });
    expect(plan).not.toBeNull();
    expect(plan!.length).toBeGreaterThan(10);
    expect(plan!.eye.every((e) => Math.abs(e.y - 2.6) < 1e-6)).toBe(true);
  });
});

describe('NavGrid on the W1 world', () => {
  const world = new DeepWorld({ lifeSeed: 12345, runSeed: 7, worker: false });
  // Two windows cover Topsoil and Glowroot (nodes 0–17).
  const groups = [
    { focus: -6, nodes: [0, 1, 2, 3, 4] },
    { focus: -40, nodes: [5, 6, 7, 8, 9] },
    { focus: -80, nodes: [10, 11, 12, 13] },
    { focus: -115, nodes: [14, 15, 16, 17] },
  ];
  for (const grp of groups)
    it(`nodes ${grp.nodes[0]}–${grp.nodes[grp.nodes.length - 1]}: the arrival reaches the exit, every shown socket, and the Dig pose reaches the arrival`, () => {
      const last = grp.nodes[grp.nodes.length - 1];
      const p0 = world.placement(grp.nodes[0]);
      world.prime(p0.chamber.floorY + 4, world.placement(last + 1).depthTop + world.placement(last + 1).K);
      for (const i of grp.nodes) {
        const p = world.placement(i);
        if (!world.ready(p.chamber.box.min.y) || !world.ready(p.chamber.box.max.y - 1)) continue;
        const nav = world.nav(i)!;
        expect(nav, `nav ${i}`).not.toBeNull();
        const a = p.chamber.stands[0].feet;
        const ex = p.chamber.exits[0];
        if (ex.type !== 'closed') expect(nav.findPath(a, ex.approach), `node ${i} ${p.chamber.template}: arrival → exit`).not.toBeNull();
        for (const s of p.chamber.sockets) {
          if (s.hidden) continue;
          expect(nav.findPath(a, s.approach), `node ${i} ${p.chamber.template}: ${s.id} ${s.kind}`).not.toBeNull();
        }
        if (!p.drift.faceFrame.dir.y) {
          const dig = { x: p.drift.stand.pos.x, y: p.drift.stand.pos.y - 1.6, z: p.drift.stand.pos.z };
          const path = nav.findPath(dig, a);
          expect(path, `node ${i}: Dig pose → arrival`).not.toBeNull();
          expect(pathLengthM(path!)).toBeLessThan(30);
        }
      }
    }, 180_000);
});
