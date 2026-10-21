import { describe, expect, it } from 'vitest';
import { B } from '../../src/config/blocks';
import { VoxelWorld } from '../../src/world/VoxelWorld';
import { lakeGeometry } from '../../src/render/water';

describe('water surfaces (VIS, round 2)', () => {
  it('covers only the wet open columns at the level, deeper toward the middle, 0 at the shore', () => {
    const w = new VoxelWorld(16, 16, 16);
    for (let x = 0; x < 16; x++) for (let z = 0; z < 16; z++) for (let y = 0; y < 4; y++) w.setRaw(x, y, z, B.SLATE);
    // A basin 4 x 4, 2 m deep in the middle two columns.
    for (let x = 4; x < 8; x++) for (let z = 4; z < 8; z++) w.setRaw(x, 3, z, B.AIR);
    for (let x = 5; x < 7; x++) for (let z = 5; z < 7; z++) w.setRaw(x, 2, z, B.AIR);
    const mask = new Uint8Array(16 * 16);
    for (let x = 4; x < 8; x++) for (let z = 4; z < 8; z++) mask[z * 16 + x] = 1;
    // One wet column capped by rock at the level is skipped.
    w.setRaw(7, 4, 7, B.SLATE);
    const g = lakeGeometry(w, { id: 't', level: 4.3, min: [0, 0], max: [15, 15], mask })!;
    expect(g).not.toBeNull();
    expect(g.index!.count / 6).toBe(15);
    const pos = g.getAttribute('position');
    const dep = g.getAttribute('aDepth');
    let maxD = 0;
    for (let i = 0; i < pos.count; i++) {
      expect(pos.getY(i)).toBeCloseTo(4.3, 5);
      const x = pos.getX(i);
      const z = pos.getZ(i);
      if (x === 4 || z === 4 || x === 8 || z === 8) expect(dep.getX(i)).toBe(0);
      maxD = Math.max(maxD, dep.getX(i));
    }
    expect(maxD).toBeGreaterThan(1.5);
  });
});
