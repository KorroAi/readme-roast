import { describe, expect, it } from 'vitest';
import { CUT_Z, DescentCamera, SHAFT_X0 } from '../../../src/render/descent/DescentCamera';
import { generateSlab } from '../../../src/world/descent/slab';
import { TUTORIAL_CRYSTALS } from '../../../src/world/descent/tutorialRows';
import { kindsFor } from './ringFixture';

// W2 MUST 0 (W1 leftover): the three tutorial crystal clusters sit fully on screen at 360, 390 and 412 px wide, and
// within 4 m of the floor while it is at 24-31 m (the crystal step).
const VIEWS: Array<[number, number, number, number]> = [
  [360, 740, 138, 540],
  [390, 844, 173, 610],
  [412, 915, 166, 691],
];

describe('the tutorial crystal clusters', () => {
  it('are generated where TUTORIAL_CRYSTALS says, tappable with model ids', () => {
    const slab = generateSlab({ runSeed: 7, k: 1, kinds: kindsFor(7, 1, 0) });
    const crystals = slab.props.filter((p) => p.tap === 'crystal' && p.y === -28);
    expect(crystals.length).toBe(3);
    for (const c of crystals) expect(c.id).toMatch(/^crystal:\d+$/);
    for (const want of TUTORIAL_CRYSTALS) expect(crystals.some((c) => Math.abs(c.x - want.x) < 1e-9 && Math.abs(c.z - want.z) < 1e-9)).toBe(true);
  });

  it('are fully on screen and within 4 m of the floor at 360, 390 and 412 px, floor 24-31 m', () => {
    for (const [w, h, top, bottom] of VIEWS)
      for (let floor = 24; floor <= 31; floor++) {
        const cam = new DescentCamera({ width: w, height: h, regionTop: top, regionBottom: bottom });
        cam.motion = { reduced: true, life: false, shake: 0 };
        cam.setFloor(floor, true);
        cam.update(0);
        for (const c of TUTORIAL_CRYSTALS) {
          const r = 0.42 * c.scale;
          const hgt = 0.85 * c.scale;
          for (const [dx, dy, dz] of [[-r, 0, 0], [r, 0, 0], [0, hgt, 0], [-r, hgt, r], [r, hgt, r]]) {
            const p = cam.project(c.x + dx, -28 + dy, c.z + dz);
            expect(p.x, `${w} px, floor ${floor}, x ${c.x}`).toBeGreaterThanOrEqual(0);
            expect(p.x, `${w} px, floor ${floor}, x ${c.x}`).toBeLessThanOrEqual(w);
            expect(p.y).toBeGreaterThanOrEqual(0);
            expect(p.y).toBeLessThanOrEqual(h);
          }
          expect(Math.abs(28 - 0.45 * c.scale - floor)).toBeLessThanOrEqual(4);
        }
      }
    expect(CUT_Z).toBe(60);
    expect(SHAFT_X0).toBe(28);
  });
});
