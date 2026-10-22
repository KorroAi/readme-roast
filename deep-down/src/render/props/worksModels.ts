import type { Rng } from '../../core/rng';
import type { ModelBuilder, PropModelOptions } from './models';
import { beam, disc, shade, vary } from './shapes';
import { COPPER, IRON, LEATHER, WOOD } from './palette';

/**
 * Round 3 (VIS): the Halden works' furniture (WORLD's mini-dungeon per stratum).
 *
 * `lever`: a wall lever of the works' lock, bolted to the back wall of its room (the prop stands in
 * the room cell by the wall, facing into the room; the wall's face is 0.5 m behind it). Variant 0:
 * the arm up, its tell-tale bead a dull red; variant 1: thrown (the arm down toward the room), the
 * bead burning rune-gold like the socket lamp it lit over the iron door. VisDirector keeps the
 * variant in step with the socket lamps in the voxels (the state WORLD saves).
 */

type Build = (m: ModelBuilder, rng: Rng, o: PropModelOptions) => void;

const WALL = -0.5;
const PIVOT_Y = 1.02;
const PIVOT_Z = WALL + 0.17;

const lever: Build = (m, rng, o) => {
  const b = m.body;
  const g = m.glow;
  const down = (o.variant | 0) === 1;
  // The backboard: three oak planks on the rock, iron straps and rivets.
  for (let i = 0; i < 3; i++) {
    const x0 = -0.33 + i * 0.22;
    b.box(x0 + 0.004, 0.5, WALL, x0 + 0.216, 1.6, WALL + 0.07, vary(WOOD.dark, rng, 0.08));
  }
  for (const y of [0.62, 1.44]) {
    b.box(-0.35, y, WALL + 0.068, 0.35, y + 0.07, WALL + 0.09, IRON.dark);
    for (const x of [-0.3, -0.1, 0.1, 0.3]) b.cube(x, y + 0.035, WALL + 0.095, 0.03, 0.03, 0.012, IRON.shine);
  }
  // The quadrant: two iron cheeks round the pivot, notched at both ends of the throw.
  for (const sx of [-1, 1]) {
    b.push().translate(sx * 0.075, PIVOT_Y, PIVOT_Z);
    for (let k = 0; k < 6; k++) {
      // From the arm's up rest to its thrown rest (rotateX(a) turns +y to (cos a, sin a) in y, z).
      const a = 0.3 + (k / 5) * 2.45;
      b.push().rotateX(a);
      b.box(-0.012, 0.0, -0.035, 0.012, 0.2, 0.035, IRON.mid);
      // The notches at the two rests: a little proud of the cheek (no shared plane).
      if (k === 0 || k === 5) b.box(-0.017, 0.16, -0.03, 0.017, 0.215, 0.03, IRON.light);
      b.pop();
    }
    b.pop();
  }
  // The pivot boss (a short iron drum along x) and its pin.
  b.push().translate(0, PIVOT_Y, PIVOT_Z).rotateZ(Math.PI / 2);
  disc(b, 0.07, -0.1, 0.1, IRON.mid);
  disc(b, 0.03, -0.12, 0.12, IRON.shine);
  b.pop();
  // The arm: up and leaning off the wall, or thrown down toward the room; a counterweight on its
  // short end and a T grip wrapped in leather.
  const a = down ? 2.62 : 0.42;
  const dy = Math.cos(a);
  const dz = Math.sin(a);
  const len = 0.62;
  const ex = 0;
  const ey = PIVOT_Y + dy * len;
  const ez = PIVOT_Z + dz * len;
  beam(b, 0, PIVOT_Y - dy * 0.1, PIVOT_Z - dz * 0.1, ex, ey, ez, 0.05, 0.05, IRON.mid);
  b.push().translate(0, PIVOT_Y - dy * 0.16, PIVOT_Z - dz * 0.16);
  b.box(-0.06, -0.05, -0.05, 0.06, 0.05, 0.05, IRON.dark);
  b.pop();
  beam(b, -0.13, ey, ez, 0.13, ey, ez, 0.06, 0.06, WOOD.light);
  for (const x of [-0.1, -0.05, 0.05, 0.1]) beam(b, x - 0.012, ey, ez, x + 0.012, ey, ez, 0.068, 0.068, LEATHER.dark);
  // The rod up into the rock (the lock's linkage), with a little bracket.
  b.box(0.2, 1.6, WALL + 0.02, 0.24, 2.3, WALL + 0.06, IRON.dark);
  b.box(0.16, 1.55, WALL + 0.006, 0.28, 1.62, WALL + 0.09, IRON.mid);
  // A brass maker's plate with the Halden mark.
  b.box(-0.12, 0.74, WALL + 0.07, 0.12, 0.86, WALL + 0.082, COPPER.dark);
  b.box(-0.09, 0.77, WALL + 0.082, 0.09, 0.83, WALL + 0.086, shade(COPPER.mid, 0.9));
  // The tell-tale bead over the board: dull red while it is up, rune-gold once thrown.
  b.box(-0.05, 1.6, WALL + 0.02, 0.05, 1.7, WALL + 0.1, IRON.dark);
  g.cube(0, 1.65, WALL + 0.105, 0.05, 0.05, 0.02, down ? 0xffd060 : 0x8a2a1a, down ? 1 : 0.45);
  m.glowScale = down ? 2.1 : 1.2;
};

export const WORKS_PROPS: Record<string, { build: Build; variants: number }> = {
  lever: { build: lever, variants: 2 },
};
