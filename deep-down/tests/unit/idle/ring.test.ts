import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { B } from '../../../src/config/blocks';
import { LightField } from '../../../src/world/light';
import { DEAD, RING_SY, RingWorld, SLOTS, slotOfSlab, storageRow } from '../../../src/world/descent/RingWorld';
import { DescentWorld } from '../../../src/render/descent/DescentWorld';
import { CELL_Z0, CELL_Z1, SHAFT_X0 } from '../../../src/world/descent/slab';
import { kindsFor, ringAt } from './ringFixture';

/** A renderer stand-in: the light uploads only flag the texture (no GL in Node). */
const glStub = { properties: { get: () => ({}) }, getContext: () => null, state: null } as unknown as THREE.WebGLRenderer;

describe('RingWorld (SPEC §6.2)', () => {
  it('maps depth rows to storage rows and slabs to slots', () => {
    expect(storageRow(-1)).toBe(RING_SY - 1);
    expect(storageRow(-160)).toBe(0);
    expect(storageRow(-161)).toBe(RING_SY - 1);
    expect(slotOfSlab(0)).toBe(SLOTS - 1);
    expect(slotOfSlab(1)).toBe(SLOTS - 2);
    expect(slotOfSlab(10)).toBe(SLOTS - 1);
    expect(slotOfSlab(-1)).toBe(0);
    expect(RingWorld.windowFor(0)).toEqual({ first: -2, last: 6 });
    expect(RingWorld.windowFor(37)).toEqual({ first: 0, last: 8 });
  });

  it('reads the sky and the apron as air, the outside of the window as stone, and writes in world y', () => {
    const ring = ringAt(7, 50);
    expect(ring.get(31, 0, 30)).toBe(B.AIR);
    expect(ring.get(31, 5, 30)).toBe(B.AIR);
    expect(ring.get(31, -60, 60)).toBe(B.AIR);
    expect(ring.get(31, -60, 63)).toBe(B.AIR);
    expect(ring.get(-1, -60, 30)).toBe(B.BEDROCK);
    // Outside the live window (slab 9 is not loaded at 50 m: the window is 1..9 minus the dead slot).
    expect(ring.get(31, -16 * 12 - 3, 30)).toBe(B.BEDROCK);
    // One slot is always dead: the light barrier between the window's ends.
    expect(Array.from(ring.slotSlab).filter((k) => k === DEAD).length).toBe(1);
    const x = SHAFT_X0 + 2;
    expect(ring.set(x, -51, CELL_Z1, B.AIR)).toBe(true);
    expect(ring.get(x, -51, CELL_Z1)).toBe(B.AIR);
    expect(ring.blocks[ring.indexW(x, -51, CELL_Z1)]).toBe(B.AIR);
  });

  it('W4: after 200 recycles the light equals a fresh compute (RGB exactly, openness exactly)', async () => {
    const world = new DescentWorld();
    const seed = 7;
    let floor = 0;
    const kinds = (k: number) => kindsFor(seed, k, floor);
    await world.build(seed, 0, kinds);
    const focus = new THREE.Vector3(31.5, 0, 70);
    for (let step = 1; step <= 200; step++) {
      floor = step * 16;
      focus.y = -floor;
      for (let i = 0; i < 12 && (i === 0 || world.pendingSlabs > 0); i++) world.update(floor, focus, glStub);
      expect(world.pendingSlabs, `step ${step}`).toBe(0);
      // Break a few floor cells too (the incremental light and openness rules).
      if (step % 20 === 0) world.breakCells([{ row: floor, col: 1 }, { row: floor, col: 4 }, { row: floor + 1, col: 4 }]);
    }
    const { first, last } = world.window;
    expect(first).toBe(200 - 2);
    expect(last).toBe(200 + 6);
    const check = world.lightCheck();
    expect(check.mismatched, `max diff ${check.maxDiff}`).toBe(0);
    // Openness (W2 MUST 0): the worker's band, the drops and the 30 broken cells all equal a full compute.
    expect(check.openMismatched, `openness max diff ${check.openMaxDiff}`).toBe(0);
  }, 180_000);

  it('a break sets the cell to air and lights it like a fresh compute', async () => {
    const world = new DescentWorld();
    await world.build(9, 30, (k) => kindsFor(9, k, 30));
    const ids = world.breakCells([{ row: 30, col: 0 }, { row: 30, col: 1 }, { row: 31, col: 1 }]);
    expect(ids.length).toBe(3);
    for (const [row, col] of [[30, 0], [30, 1], [31, 1]]) for (let z = CELL_Z0; z <= CELL_Z1; z++) expect(world.ring.get(SHAFT_X0 + col, -row - 1, z)).toBe(B.AIR);
    const c = world.lightCheck();
    expect(c.mismatched).toBe(0);
    expect(c.openMismatched, `openness after breaks (max diff ${c.openMaxDiff})`).toBe(0);
  }, 60_000);

  it('computeOpennessBox equals the full compute inside its box (wrapping rows included)', () => {
    const ring = ringAt(5, 40);
    const a = new LightField(ring, undefined, { wrapY: true });
    a.computeAll();
    // Carve a hole, then recompute a box around it; the result must equal a fresh full compute everywhere.
    for (let x = 20; x < 30; x++) for (let z = 40; z < 60; z++) for (let y = -45; y < -38; y++) ring.set(x, y, z, B.AIR);
    a.computeOpennessBox(20 - 7, 29 + 7, storageRow(-45) - 7, storageRow(-45) - 7 + 7 + 7 + 7, 40 - 7, 63);
    const b = new LightField(ring, undefined, { wrapY: true });
    b.computeAll();
    let diff = 0;
    for (let i = 3; i < a.data.length; i += 4) if (a.data[i] !== b.data[i]) diff++;
    expect(diff).toBe(0);
  });
});
