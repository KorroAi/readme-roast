import type { Ctx } from './slab';
import { BACK_Z, CUT, SHAFT_X0, SHAFT_X1, addProp, carve } from './slab';

/**
 * The authored surroundings of rows 0-39 (SPEC §8.2): the shaft cells' kinds come from the model's tutorial
 * table (copper at row 3, the chest at row 6, the gem at row 9, ...); this file authors what is around them:
 * the surface camp's ground, a fossil slab beside the shaft at row 14, the 4 m cavern crossing at rows 24-27
 * with three crystal clusters, the creature alcove at row 30 and the hall under the Halden Hatch (40 m, the
 * slab generator's Reveal Hall).
 */
export const TUTORIAL_ROWS = 40;

export function tutorialFeatures(ctx: Ctx): void {
  // A small lit alcove early so the dug shaft is never bare (rows 4-6, left).
  if (carve(ctx, 4, 6, SHAFT_X0, SHAFT_X0 + 3, BACK_Z - 3, BACK_Z)) {
    ctx.out.caverns.push({ id: 't4', kind: 'alcove', top: 4, bottom: 6, x0: SHAFT_X0, x1: SHAFT_X0 + 3, z0: BACK_Z - 3, z1: BACK_Z });
    addProp(ctx, 'crate', SHAFT_X0 + 0.9, 7, BACK_Z - 1.6);
    addProp(ctx, 'barrel', SHAFT_X0 + 2.4, 7, BACK_Z - 2.2);
    addProp(ctx, 'hangingLantern', SHAFT_X0 + 1.5, 7, BACK_Z - 0.6, { emitter: [SHAFT_X0 + 1, -5, BACK_Z - 1] });
  }
  // Row 11-13 right: a rope coil and a pick rack, Halden traces.
  if (carve(ctx, 11, 13, SHAFT_X1 - 3, SHAFT_X1, BACK_Z - 4, BACK_Z)) {
    ctx.out.caverns.push({ id: 't11', kind: 'alcove', top: 11, bottom: 13, x0: SHAFT_X1 - 3, x1: SHAFT_X1, z0: BACK_Z - 4, z1: BACK_Z });
    addProp(ctx, 'ropeCoil', SHAFT_X1 - 2.2, 14, BACK_Z - 2.5);
    addProp(ctx, 'pickaxeRack', SHAFT_X1 - 0.8, 14, BACK_Z - 1.2);
    addProp(ctx, 'hangingLantern', SHAFT_X1 - 1.5, 14, BACK_Z - 0.6, { emitter: [SHAFT_X1 - 2, -12, BACK_Z - 1] });
  }
  // Row 14: a fossil slab in a pocket beside the shaft (left), cutting the face.
  if (carve(ctx, 12, 14, SHAFT_X0 - 4, SHAFT_X0 - 1, CUT - 4, CUT - 1, 1)) {
    ctx.out.caverns.push({ id: 't14', kind: 'pocket', top: 12, bottom: 14, x0: SHAFT_X0 - 4, x1: SHAFT_X0 - 1, z0: CUT - 4, z1: CUT - 1 });
    addProp(ctx, 'tablet', SHAFT_X0 - 0.7, 15, CUT - 1.4, { tap: 'fossil', taps: 5, rotY: 0.5 });
  }
  // Rows 18-20 right: a pocket with a gem cluster, the promise of the next beat.
  if (carve(ctx, 18, 20, SHAFT_X1 + 1, SHAFT_X1 + 4, CUT - 4, CUT - 1, 1)) {
    ctx.out.caverns.push({ id: 't18', kind: 'pocket', top: 18, bottom: 20, x0: SHAFT_X1 + 1, x1: SHAFT_X1 + 4, z0: CUT - 4, z1: CUT - 1 });
    addProp(ctx, 'crystalCluster', SHAFT_X1 + 1.3, 21, CUT - 1.2, { tap: 'gem', taps: 3, scale: 0.8 });
  }
  // Rows 24-27: the 4 m cavern crossing, a lit grotto across the shaft with three crystal clusters.
  if (carve(ctx, 24, 27, SHAFT_X0 - 7, SHAFT_X1 + 7, BACK_Z - 14, CUT - 1, 1)) {
    ctx.out.caverns.push({ id: 't24', kind: 'grotto', top: 24, bottom: 27, x0: SHAFT_X0 - 7, x1: SHAFT_X1 + 7, z0: BACK_Z - 14, z1: CUT - 1 });
    addProp(ctx, 'crystalCluster', SHAFT_X0 - 2.2, 28, CUT - 2.5, { tap: 'crystal', taps: 2, scale: 1.2 });
    addProp(ctx, 'crystalCluster', SHAFT_X1 + 3.2, 28, CUT - 3, { tap: 'crystal', taps: 3, scale: 1.3 });
    addProp(ctx, 'crystalCluster', (SHAFT_X0 + SHAFT_X1) / 2 + 0.5, 28, BACK_Z - 6, { tap: 'crystal', taps: 2, scale: 1.6 });
    addProp(ctx, 'brokenCart', SHAFT_X0 - 4.5, 28, BACK_Z - 3);
    addProp(ctx, 'lanternPost', SHAFT_X1 + 5, 28, BACK_Z - 5, { emitter: [SHAFT_X1 + 5, -26, BACK_Z - 4] });
    addProp(ctx, 'hangingLantern', SHAFT_X0 - 3, 28, BACK_Z - 8, { emitter: [SHAFT_X0 - 3, -25, BACK_Z - 7] });
  }
  // Row 30: the creature alcove (W2 puts a lamp beetle in it; W1 its glowing nest).
  if (carve(ctx, 30, 32, SHAFT_X0 + 1, SHAFT_X0 + 4, BACK_Z - 4, BACK_Z)) {
    ctx.out.caverns.push({ id: 't30', kind: 'alcove', top: 30, bottom: 32, x0: SHAFT_X0 + 1, x1: SHAFT_X0 + 4, z0: BACK_Z - 4, z1: BACK_Z });
    addProp(ctx, 'satchel', SHAFT_X0 + 2, 33, BACK_Z - 2.5);
    addProp(ctx, 'crate', SHAFT_X0 + 3.4, 33, BACK_Z - 1.2, { tap: 'crate', taps: 1 });
    addProp(ctx, 'hangingLantern', SHAFT_X0 + 2.5, 33, BACK_Z - 0.6, { emitter: [SHAFT_X0 + 2, -31, BACK_Z - 1] });
  }
  // Row 35-37 right: the last Halden alcove before the hatch, its lamp lit.
  if (carve(ctx, 35, 37, SHAFT_X1 - 3, SHAFT_X1, BACK_Z - 3, BACK_Z)) {
    ctx.out.caverns.push({ id: 't35', kind: 'alcove', top: 35, bottom: 37, x0: SHAFT_X1 - 3, x1: SHAFT_X1, z0: BACK_Z - 3, z1: BACK_Z });
    addProp(ctx, 'haldenNote', SHAFT_X1 - 1.5, 38, BACK_Z - 1.8, { tap: 'note', taps: 1 });
    addProp(ctx, 'hangingLantern', SHAFT_X1 - 1.5, 38, BACK_Z - 0.6, { emitter: [SHAFT_X1 - 2, -36, BACK_Z - 1] });
  }
}
