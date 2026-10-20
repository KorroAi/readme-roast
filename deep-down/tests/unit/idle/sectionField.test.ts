import { describe, expect, it } from 'vitest';
import { B } from '../../../src/config/blocks';
import { Rng } from '../../../src/core/rng';
import { RING_SX, RING_SY, RingWorld } from '../../../src/world/descent/RingWorld';
import { CUT_LAYER, SectionField } from '../../../src/render/descent/SectionField';

// BUILD W2 (2B tests): a break relaxes only the box around the opened cells, and the field equals a full transform.
function world(seed: number): RingWorld {
  const w = new RingWorld();
  const rng = new Rng(seed);
  const at = (x: number, y: number) => x + RING_SX * (y + RING_SY * CUT_LAYER);
  // The shaft (open above row 40 of storage) and a few caverns at the cut.
  for (let y = 0; y < 40; y++) for (let x = 28; x <= 34; x++) w.blocks[at(x, y)] = B.AIR;
  for (let i = 0; i < 12; i++) {
    const cx = rng.int(2, RING_SX - 3);
    const cy = rng.int(0, RING_SY - 1);
    const r = rng.int(1, 3);
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (cx + dx >= 0 && cx + dx < RING_SX) w.blocks[at(cx + dx, (cy + dy + RING_SY) % RING_SY)] = B.AIR;
  }
  return w;
}

describe('SectionField (SPEC §11.4)', () => {
  it('an incremental open equals a full transform, also across the ring seam', () => {
    for (const seed of [1, 2, 3, 4]) {
      const w = world(seed);
      const inc = new SectionField(w);
      inc.update();
      const rng = new Rng(seed * 31);
      for (let step = 0; step < 40; step++) {
        // A row of breaks: 1-7 cells of one shaft row, some at the seam (storage rows 159 / 0).
        const y = step % 5 === 0 ? (step % 2 ? 0 : RING_SY - 1) : rng.int(40, RING_SY - 1);
        const cells: Array<[number, number]> = [];
        for (let c = 0; c < rng.int(1, 7); c++) cells.push([28 + rng.int(0, 6), y]);
        for (const [x, yy] of cells) w.blocks[x + RING_SX * (yy + RING_SY * CUT_LAYER)] = B.AIR;
        inc.open(cells);
        const full = new SectionField(w);
        full.update();
        let maxDiff = 0;
        for (let yy = 0; yy < RING_SY; yy++) for (let x = 0; x < RING_SX; x++) maxDiff = Math.max(maxDiff, Math.abs(inc.at(x, yy) - full.at(x, yy)));
        expect(maxDiff, `seed ${seed} step ${step}`).toBeLessThan(1e-4);
        let bytes = 0;
        for (let i = 0; i < full.texture.image.data!.length; i++) bytes = Math.max(bytes, Math.abs((inc.texture.image.data as Uint8Array)[i] - (full.texture.image.data as Uint8Array)[i]));
        expect(bytes).toBeLessThanOrEqual(1);
        full.dispose();
      }
      expect(inc.partial).toBeGreaterThan(30);
      expect(inc.full).toBe(1);
      inc.dispose();
    }
  });

  it('distances are the 3 x 3 chamfer metric, capped at 16 cells', () => {
    const w = new RingWorld();
    w.blocks[10 + RING_SX * (80 + RING_SY * CUT_LAYER)] = B.AIR;
    const f = new SectionField(w);
    f.update();
    expect(f.at(10, 80)).toBe(0);
    expect(f.at(13, 80)).toBeCloseTo(3, 5);
    expect(f.at(13, 83)).toBeCloseTo(3 * Math.SQRT2, 5);
    expect(f.at(14, 81)).toBeCloseTo(3 + Math.SQRT2, 5);
    expect(f.at(40, 80)).toBe(16);
  });
});
