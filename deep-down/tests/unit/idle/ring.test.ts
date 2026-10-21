// The hybrid's ring (BUILD §3.2 MUST 1: RingWorld without the cut): 0.5 m voxels, a y ring of 6 slabs, no cut plane,
// no apron, no open back; the dead slot is the light barrier; the light keeps its reach in metres at 0.5 m steps.
import { describe, expect, it } from 'vitest';
import { B } from '../../../src/config/blocks';
import { LightField, LIGHT_REACH } from '../../../src/world/light';
import { VoxelRing } from '../../../src/world/hybrid/VoxelRing';
import { DEAD_SLAB } from '../../../src/world/hybrid/ringConsts';
import { RING_SX, RING_SY, RING_SZ, SLAB_ROWS, SLOTS, slotOfSlab, storageRow } from '../../../src/world/hybrid/grid';
import { LIGHT_OPTIONS } from '../../../src/world/hybrid/slabLight';

const slab = (fill: number) => new Uint8Array(RING_SX * SLAB_ROWS * RING_SZ).fill(fill);

describe('VoxelRing (the ring without the cut)', () => {
  it('is 128 x 192 x 128 voxels of 0.5 m: 64 x 96 x 64 m, 6 slots of 32 rows', () => {
    const r = new VoxelRing();
    expect([r.sx, r.sy, r.sz]).toEqual([128, 192, 128]);
    expect(SLOTS * SLAB_ROWS).toBe(RING_SY);
    expect(r.slotSlab.every((k) => k === DEAD_SLAB)).toBe(true);
  });

  it('reads the sky above y = 0, bedrock outside the footprint and the live window, and has no cut or apron', () => {
    const r = new VoxelRing();
    r.writeSlab(0, slab(B.AIR));
    expect(r.get(10, 5, 10)).toBe(B.AIR); // sky
    expect(r.get(-1, -5, 10)).toBe(B.BEDROCK);
    expect(r.get(10, -5, RING_SZ)).toBe(B.BEDROCK);
    expect(r.get(10, -40, 10)).toBe(B.BEDROCK); // slab 1 not written
    // The old cut plane z = 60 at 1 m is z voxel 120 here: it is just rock or air like anywhere else.
    expect(r.get(10, -5, 120)).toBe(B.AIR);
    expect(r.get(10, -5, 127)).toBe(B.AIR);
  });

  it('maps slab k to slot (-k - 1) mod 6 and world rows through the ring', () => {
    const r = new VoxelRing();
    for (let k = 0; k < 8; k++) {
      expect(slotOfSlab(k)).toBe((((-k - 1) % SLOTS) + SLOTS) % SLOTS);
      // Slab k's top row is world row -32k - 1; its storage row is the top of its slot.
      expect(storageRow(-SLAB_ROWS * k - 1)).toBe(slotOfSlab(k) * SLAB_ROWS + SLAB_ROWS - 1);
    }
    r.writeSlab(2, slab(B.SLATE));
    expect(r.hasSlab(2)).toBe(true);
    expect(r.get(5, -SLAB_ROWS * 2 - 1, 5)).toBe(B.SLATE);
    expect(r.worldChunkY(slotOfSlab(2) * 2)).toBe(-2 * 2 - 2);
    expect(r.worldChunkY(slotOfSlab(2) * 2 + 1)).toBe(-2 * 2 - 1);
    r.killSlot(slotOfSlab(2));
    expect(r.hasSlab(2)).toBe(false);
    expect(r.get(5, -SLAB_ROWS * 2 - 1, 5)).toBe(B.BEDROCK);
  });

  it('writes only into live slabs and marks the chunks the mesher pads into', () => {
    const r = new VoxelRing();
    r.writeSlab(1, slab(B.SLATE));
    r.dirty.fill(0);
    expect(r.set(0, -SLAB_ROWS - 1, 0, B.AIR)).toBe(true);
    expect(r.set(0, -SLAB_ROWS * 3 - 1, 0, B.AIR)).toBe(false); // slab 3 is not live
    expect([...r.dirty].filter(Boolean).length).toBeGreaterThan(0);
    const out = new Uint8Array(20 * 20 * 20);
    r.copyPaddedWorld(0, slotOfSlab(1) * 2 + 1, 0, out);
    // The padding outside the footprint reads bedrock.
    expect(out[0]).toBe(B.BEDROCK);
  });

  it('keeps the light reach in metres at 0.5 m steps, and the dead slot stops light through the ring', () => {
    const r = new VoxelRing();
    r.writeSlab(0, slab(B.AIR));
    r.writeSlab(1, slab(B.AIR));
    const light = new LightField(r, undefined, LIGHT_OPTIONS);
    expect(light.reach).toBeGreaterThanOrEqual(2 * LIGHT_REACH - 6);
    expect(light.reach).toBeLessThanOrEqual(2 * LIGHT_REACH + 6);
    r.set(64, -20, 64, B.LIGHT_LAMP);
    light.computeAll();
    const at = (j: number) => light.data[(64 + RING_SX * (storageRow(j) + RING_SY * 64)) * 4];
    // 5 m away (10 steps) the lamp still lights; through the dead slots on the far side of the ring it does not.
    expect(at(-30)).toBeGreaterThan(0);
    expect(at(-20 + 96)).toBe(0);
  });
});
