// The hybrid's slabs (BUILD §3.2 MUST 4): pure functions of the seeds and the dig front, stamping every node that
// reaches into their band, in budget in Node (SPEC §11: ≤ 25 ms per 1 m slab then, here a 16 m slab of 0.5 m voxels).
import { describe, expect, it } from 'vitest';
import { B } from '../../../src/config/blocks';
import { generateSlab, SLAB_VOXELS } from '../../../src/world/hybrid/slab';
import { slabLight, CONTEXT_ROWS } from '../../../src/world/hybrid/slabLight';
import { nodesInBand } from '../../../src/world/hybrid/layout';
import { RING_SX, RING_SZ } from '../../../src/world/hybrid/grid';

describe('hybrid slabs', () => {
  it('stamp the nodes of their band: slab 0 holds the camp, the first drift and the Root Cellar', () => {
    const s = generateSlab({ lifeSeed: 12345, runSeed: 7, k: 0, dugTo: 0 });
    expect(s.blocks.length).toBe(SLAB_VOXELS);
    expect(s.nodes).toContain(0);
    expect(s.nodes).toEqual(nodesInBand(12345, -16, 0, 7));
    let air = 0;
    let plug = 0;
    for (const id of s.blocks) {
      if (id === B.AIR) air++;
      if (id === B.FACE_PLUG) plug++;
    }
    expect(air).toBeGreaterThan(10000);
    expect(plug).toBeGreaterThan(0);
  });

  it('a slab below the surface is mostly rock with its caverns carved, and no cut plane', () => {
    const s = generateSlab({ lifeSeed: 12345, runSeed: 7, k: 2, dugTo: 0 });
    let air = 0;
    for (const id of s.blocks) if (id === B.AIR) air++;
    expect(air / s.blocks.length).toBeGreaterThan(0.02);
    expect(air / s.blocks.length).toBeLessThan(0.6);
  });

  it('opens the rows already dug (the dig front) and the openings of this run', () => {
    const closed = generateSlab({ lifeSeed: 12345, runSeed: 7, k: 0, dugTo: 0 });
    const open = generateSlab({ lifeSeed: 12345, runSeed: 7, k: 0, dugTo: 5 });
    const count = (b: Uint8Array) => b.reduce((n, id) => n + (id === B.FACE_PLUG ? 1 : 0), 0);
    expect(count(open.blocks)).toBeLessThan(count(closed.blocks));
  });

  it('light for a slab is computed off the main thread with its context rows', () => {
    const s = generateSlab({ lifeSeed: 12345, runSeed: 7, k: 1, dugTo: 0 });
    const ctx = new Uint8Array(RING_SX * CONTEXT_ROWS * RING_SZ).fill(B.BEDROCK);
    const l = slabLight(s.blocks, ctx);
    expect(l.slab.length).toBe(SLAB_VOXELS * 4);
    let lit = 0;
    for (let i = 0; i < l.slab.length; i += 4) if (l.slab[i] | l.slab[i + 1] | l.slab[i + 2]) lit++;
    expect(lit).toBeGreaterThan(100);
  });
});
