import { describe, expect, it } from 'vitest';
import { B, SOLID } from '../../src/config/blocks';
import { HomeField, ReachSet } from '../../src/world/analysis/homeField';
import { Rng } from '../../src/core/rng';
import { TrapScratch, WORST_SOLID, fixTraps, homewardStates, homewardStatesByProbe, isState, walkStates, type TrapWorld } from '../../src/world/gen/strata/traps';
import { VoxelWorld } from '../../src/world/VoxelWorld';

/**
 * Round 3 (WORLD): traps (BRIEF §0.1: everything reachable is walkable or climbable; the pit rescue is
 * only a safety net). The walk model with ladders and ropes, the reverse search against its oracle,
 * and the fixer: a hollow filled flush, a basin given a ladder up the drop that leads in, a vein down a
 * floor made plain where mining it would leave a pit. The real strata are checked in strata.test.ts.
 */
const D = { sx: 32, sy: 32, sz: 32 };

/** Solid rock with a floor at y = 10 (feet at 10) over x, z in 2..29: a flat hall 6 high. */
function hall(): VoxelWorld {
  const w = new VoxelWorld(D.sx, D.sy, D.sz, 16);
  w.blocks.fill(B.SLATE);
  for (let z = 2; z < 30; z++) for (let x = 2; x < 30; x++) for (let y = 10; y < 16; y++) w.setRaw(x, y, z, B.AIR);
  return w;
}

const home = { min: [3, 10, 3], max: [6, 10, 6] };
const tw = (w: VoxelWorld): TrapWorld => ({ blocks: w.blocks, d: D, start: [4.5, 10, 4.5], home, open: [], fill: () => B.GRAVEL });

function trapped(w: VoxelWorld, S: Uint8Array = SOLID): number {
  const sc = new TrapScratch(D);
  const n = walkStates(w.blocks, S, D, [4.5, 10, 4.5], sc.a, sc.q);
  const reached = sc.q.slice(0, n);
  const targets: number[] = [];
  for (let z = 3; z <= 6; z++) for (let x = 3; x <= 6; x++) if (isState(w.blocks, S, D.sx, w.index(x, 10, z))) targets.push(w.index(x, 10, z));
  homewardStates(w.blocks, S, D, targets, sc.b, sc.q);
  let t = 0;
  for (const i of reached) if (!sc.b[i]) t++;
  return t;
}

describe('traps: the walk model and its reverse (round 3)', () => {
  it('climbs a ladder up a wall and walks off at the top; without it the ledge is out of reach', () => {
    const w = hall();
    // A ledge 4 high along x = 20..29.
    for (let z = 2; z < 30; z++) for (let x = 20; x < 30; x++) for (let y = 10; y < 14; y++) w.setRaw(x, y, z, B.SLATE);
    const sc = new TrapScratch(D);
    walkStates(w.blocks, SOLID, D, [4.5, 10, 4.5], sc.a, sc.q);
    expect(sc.a[w.index(25, 14, 10)]).toBe(0);
    for (let y = 10; y <= 14; y++) w.setRaw(19, y, 10, B.LADDER);
    walkStates(w.blocks, SOLID, D, [4.5, 10, 4.5], sc.a, sc.q);
    expect(sc.a[w.index(25, 14, 10)]).toBe(1);
    // And back down: the ledge walks home by the ladder.
    expect(trapped(w)).toBe(0);
  });

  it('the fast reverse search equals its oracle (forward rules asked one by one), ladders, ropes and lava included', () => {
    const rng = new Rng(77);
    for (let round = 0; round < 4; round++) {
      const w = hall();
      // Random steps, pits, pillars, ladders, ropes and lava over the hall floor.
      for (let k = 0; k < 140; k++) {
        const x = rng.int(2, 29);
        const z = rng.int(2, 29);
        const r = rng.next();
        if (r < 0.3) for (let y = 10; y < 10 + rng.int(1, 4); y++) w.setRaw(x, y, z, B.SLATE);
        else if (r < 0.55) for (let y = 9; y > 9 - rng.int(1, 4); y--) w.setRaw(x, y, z, B.AIR);
        else if (r < 0.7) for (let y = 10 - rng.int(0, 3); y < 10 + rng.int(1, 4); y++) w.setRaw(x, y, z, r < 0.62 ? B.LADDER : B.ROPE);
        else if (r < 0.75) w.setRaw(x, 9, z, B.LAVA);
      }
      for (const S of [SOLID, WORST_SOLID]) {
        const sc = new TrapScratch(D);
        const targets: number[] = [];
        for (let z = 3; z <= 6; z++) for (let y = 7; y <= 14; y++) for (let x = 3; x <= 6; x++) if (isState(w.blocks, S, D.sx, w.index(x, y, z))) targets.push(w.index(x, y, z));
        homewardStates(w.blocks, S, D, targets, sc.a, sc.q);
        homewardStatesByProbe(w.blocks, S, D, targets, sc.b, sc.q);
        let diff = 0;
        let count = 0;
        for (let i = 0; i < sc.a.length; i++) {
          if (sc.a[i] !== sc.b[i]) diff++;
          if (sc.a[i]) count++;
        }
        expect(diff).toBe(0);
        expect(count).toBeGreaterThan(200);
      }
    }
  });

  it('never stands on lava', () => {
    const w = hall();
    w.setRaw(12, 9, 12, B.LAVA);
    expect(isState(w.blocks, SOLID, D.sx, w.index(12, 10, 12))).toBe(false);
    expect(isState(w.blocks, SOLID, D.sx, w.index(13, 10, 12))).toBe(true);
  });
});

describe('traps: the fixer (round 3)', () => {
  it('fills a hollow flush to its rim (a 1-wide hole 3 deep)', () => {
    const w = hall();
    for (let y = 7; y < 10; y++) w.setRaw(15, y, 15, B.AIR);
    expect(trapped(w)).toBeGreaterThan(0);
    const fix = fixTraps(tw(w), new TrapScratch(D));
    expect(fix.remaining).toBe(0);
    expect(fix.ladders.length).toBe(0);
    expect(trapped(w)).toBe(0);
    // Flush: the hole is floor again (feet at 10).
    expect(SOLID[w.get(15, 9, 15)]).toBe(1);
  });

  it('gives a basin a ladder up the drop that leads in, and the walk in stays', () => {
    const w = hall();
    // A sunken room 3 deep at x, z 14..22 (its floor at feet 7), open to the hall above.
    for (let z = 14; z <= 22; z++) for (let x = 14; x <= 22; x++) for (let y = 7; y < 10; y++) w.setRaw(x, y, z, B.AIR);
    expect(trapped(w)).toBeGreaterThan(40);
    const fix = fixTraps(tw(w), new TrapScratch(D));
    expect(fix.remaining).toBe(0);
    expect(fix.ladders.length).toBe(1);
    const lad = fix.ladders[0];
    // The ladder runs from the basin's floor (7) to the hall's (10), in one column, at the basin's edge.
    expect(lad.map((c) => c[1])).toEqual([7, 8, 9, 10]);
    expect(new Set(lad.map((c) => `${c[0]},${c[2]}`)).size).toBe(1);
    for (const [x, y, z] of lad) expect(w.get(x, y, z)).toBe(B.LADDER);
    // The basin is still there (not filled).
    expect(SOLID[w.get(18, 7, 18)]).toBe(0);
    expect(trapped(w)).toBe(0);
  });

  it('in the worst case, a vein running down a floor becomes plain rock where mining it would leave a pit', () => {
    const w = hall();
    // Coal under the floor at (12, 9..7, 12): mined, a 1-wide pit 3 deep.
    for (let y = 7; y < 10; y++) w.setRaw(12, y, 12, B.COAL_ORE);
    expect(trapped(w)).toBe(0);
    expect(trapped(w, WORST_SOLID)).toBeGreaterThan(0);
    const fix = fixTraps(tw(w), new TrapScratch(D), { modes: ['carved', 'worst'] });
    expect(fix.remaining).toBe(0);
    expect(trapped(w, WORST_SOLID)).toBe(0);
    // The floor block itself may stay ore (a 1-deep dent is no pit); the ones under it are plain.
    expect(w.get(12, 7, 12)).not.toBe(B.COAL_ORE);
  });

  it('leaves what it is told to keep, and reports what it could not mend', () => {
    const w = hall();
    for (let y = 7; y < 10; y++) w.setRaw(15, y, 15, B.AIR);
    const kept = w.index(15, 7, 15);
    const fix = fixTraps({ ...tw(w), keep: (i) => i === kept }, new TrapScratch(D), { rounds: 3 });
    expect(fix.remaining).toBeGreaterThan(0);
    expect(w.get(15, 7, 15)).toBe(B.AIR);
  });
});

describe('the walk-home field climbs (round 3)', () => {
  it('a rope out of a pit puts the pit on the field (the pit rescue leaves a climber alone), and the forward set agrees', () => {
    const w = hall();
    // A shaft 8 deep at x, z 20..22, a rope up its side at (20, 2..10, 21).
    for (let z = 20; z <= 22; z++) for (let x = 20; x <= 22; x++) for (let y = 2; y < 10; y++) w.setRaw(x, y, z, B.AIR);
    const field = new HomeField(w, 3);
    field.computeToRegion({ id: 'camp', min: [3, 10, 3], max: [7, 11, 7] });
    expect(field.at(21, 2, 21)).toBe(-1);
    for (let y = 2; y <= 10; y++) w.setRaw(20, y, 21, B.ROPE);
    field.computeToRegion({ id: 'camp', min: [3, 10, 3], max: [7, 11, 7] });
    expect(field.at(21, 2, 21)).toBeGreaterThan(0);
    expect(field.cellNear(20.5, 5, 21.5)).toBeGreaterThanOrEqual(0);
    // Following the field down from the shaft's floor climbs the rope and reaches the camp.
    let c = field.cellNear(21.5, 2, 21.5);
    for (let k = 0; k < 200 && field.dist[c] > 0; k++) c = field.downhill(c);
    expect(field.dist[c]).toBe(0);
    const reach = new ReachSet(w, 3);
    reach.computeFrom(4, 10, 4);
    expect(reach.has(21, 2, 21)).toBe(true);
  });
});
