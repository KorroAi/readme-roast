import { Rng } from '../../core/rng';
import type { StructureSpec } from '../../world/gen/types';
import { STAIR_COPING } from '../../world/gen/architecture';
import { MAT } from '../materials';
import { StructureBuilder, TexMode, type V3 } from './builder';

type Flight = Extract<StructureSpec, { kind: 'stairFlight' }>;

/** Riser height and tread depth (m): four per metre of the flight's 1:1 slope. */
export const RISER = 0.25;
/** Library A strip rows (texels) by course height (materials/courses.ts COURSE_LIBRARIES.A). */
export const STRIP_A = { half: 0, metre: 8, metreB: 24, oneHalf: 40, two: 64, twoB: 96 } as const;

/**
 * Height of the tread under the point `s` metres down a flight (its walking plane is top - s):
 * what the explorer's feet stand on visually.
 */
export function treadHeight(f: Pick<Flight, 'top' | 'run'>, s: number): number {
  const n = Math.round(f.run / RISER);
  const j = Math.max(0, Math.min(n, Math.ceil((s - RISER / 2) / RISER)));
  return f.top - RISER * j + (j === 0 || j === n ? 0.03 : 0);
}

const X: V3 = [1, 0, 0];
const Z: V3 = [0, 0, 1];

/**
 * A monumental stair flight: monolithic steps (one stone across the walk, 0.25 m risers on
 * 0.25 m treads with a worn, chamfered nosing) between raking parapets (a dressed inner face, an
 * outer band standing a little proud of the voxel flank below it so the flank's 1 m steps vanish
 * behind a straight rake, a string course under it, a coping of long sloped stones), newels at
 * the head.
 *
 * Local frame: x = s (metres down the flight from its head), y up, z = c (across, walk centred).
 * The walking plane is y = top - s (PlayerController walks it on the B.RAMP_* cells); every tread
 * is within RISER / 2 of it.
 */
export function buildStairFlight(b: StructureBuilder, f: Flight): void {
  const rng = new Rng(f.seed);
  b.push();
  b.translate(f.x0, 0, f.z0);
  if (f.dir === 'z') b.rotate(1, -Math.PI / 2);
  const hw = f.width / 2;
  const n = Math.round(f.run / RISER);
  const top = f.top;

  // Steps. Step j: tread at top - j * RISER from s(j-1) back to its nosing at s(j); its riser
  // drops to the next tread. The first and last treads run onto the landings (a threshold stone a
  // few cm proud of the terrain floor, covering the bevel where the floor meets the flight).
  const sAt = (j: number) => (j < 0 ? -0.6 : j >= n ? f.run + 0.3 : RISER * j + RISER / 2);
  const z0 = -hw - 0.02;
  const z1 = hw + 0.02;
  const segs = 6;
  const zs = Array.from({ length: segs + 1 }, (_, k) => z0 + ((z1 - z0) * k) / segs);
  for (let j = 0; j <= n; j++) {
    const back = sAt(j - 1);
    const nose = sAt(j);
    const end = j === 0 || j === n;
    const h = top - RISER * j + (end ? 0.03 : 0);
    const below = j === n ? h - 0.12 : top - RISER * (j + 1);
    b.surface = { mode: TexMode.Stone, layer: MAT.floorSlab, row: STRIP_A.half, axis: Z, across: X, u0: rng.int(0, 1023), top: h, vRef: nose };
    // The nosing is worn: its chamfer is deeper toward the middle of the walk.
    const ws = zs.map((_, k) => {
      if (j === n) return 0.02;
      const mid = 1 - Math.abs((k / segs) * 2 - 1);
      return 0.022 + 0.05 * mid * mid * (0.6 + 0.4 * rng.next());
    });
    const aoBack = j === 0 ? 0.85 : 0.6;
    for (let k = 0; k < segs; k++) {
      const za = zs[k];
      const zb = zs[k + 1];
      b.quad([back, h, zb], [nose - ws[k + 1], h, zb], [nose - ws[k], h, za], [back, h, za], [aoBack, 1, 1, aoBack]);
      b.quad([nose - ws[k + 1], h, zb], [nose, h - ws[k + 1], zb], [nose, h - ws[k], za], [nose - ws[k], h, za], [1, 1, 1, 1]);
      if (j < n) b.quad([nose, h - ws[k + 1], zb], [nose, below, zb], [nose, below, za], [nose, h - ws[k], za], [1, 0.55, 0.55, 1]);
    }
    if (j === n) b.quad([nose, h, z1], [nose, below, z1], [nose, below, z0], [nose, h, z0]);
    if (j === 0) b.quad([back, h - 0.12, z1], [back, h, z1], [back, h, z0], [back, h - 0.12, z0]);
  }

  // Parapets.
  const y = (s: number, dy: number) => top - s + dy;
  const capLo = STAIR_COPING - 0.3;
  const s0 = 0;
  const s1 = f.run;
  /** A raking band in the plane z = c between heights lo and hi above the walking plane. */
  const band = (c: number, lo: number, hi: number, out: V3, aoLo = 1, aoHi = 1) =>
    b.quadOut([s0, y(s0, lo), c], [s1, y(s1, lo), c], [s1, y(s1, hi), c], [s0, y(s0, hi), c], out, [aoLo, aoLo, aoHi, aoHi]);
  for (const side of [-1, 1]) {
    const cIn = side * hw;
    const cOut = side * (hw + f.parapet);
    const cBand = side * (hw + f.parapet + 0.06);
    const out: V3 = [0, 0, side];
    const inward: V3 = [0, 0, -side];
    b.surface = { mode: TexMode.World, layer: MAT.masonry, row: 0, axis: X, across: Z, u0: 0, top: 0 };
    // Inner face, from below the treads to under the coping (darker where it meets the steps).
    band(cIn, -0.4, capLo, inward, 0.55, 1);
    // Outer band, proud of the flank wall, from two metres below the walk to the coping.
    band(cBand, -2.1, capLo, out);
    // A raking string course at the band's foot: a lit edge over a shadow line.
    const cs = side * (hw + f.parapet + 0.14);
    b.surface = { mode: TexMode.Stone, layer: MAT.masonry, row: STRIP_A.half, axis: X, across: Z, u0: rng.int(0, 1023), top: 0 };
    b.push();
    b.translate(0, top, 0).rotate(2, -Math.PI / 4);
    // In this frame x runs down the rake (slope length) and y is normal to the walking plane.
    const L = f.run * Math.SQRT2;
    const n0 = -2.1 / Math.SQRT2;
    b.surface = { ...b.surface, top: n0 + 0.17 };
    const ca = Math.min(cBand, cs);
    const cb = Math.max(cBand, cs);
    b.box(0, n0, ca, L, n0 + 0.17, cb, 0.03, side > 0 ? 32 : 16);
    b.pop();
    // Coping: long sloped stones, overhanging both faces, chamfered, end to end (V joints).
    const cA = Math.min(cIn, cOut) - (side > 0 ? 0.07 : 0.13);
    const cB = Math.max(cIn, cOut) + (side > 0 ? 0.13 : 0.07);
    let s = s0 + 0.5;
    while (s < s1 - 0.01) {
      const len = Math.min(s1 + 0.02 - s, rng.range(1.7, 2.7));
      b.push();
      b.translate(s, y(s, STAIR_COPING), 0).rotate(2, -Math.PI / 4);
      b.surface = { mode: TexMode.Stone, layer: MAT.masonry, row: STRIP_A.oneHalf, axis: X, across: Z, u0: rng.int(0, 1023), top: 0, vRef: cA };
      b.box(0, -0.3 / Math.SQRT2, cA, len * Math.SQRT2, 0, cB, 0.035);
      b.pop();
      s += len;
    }
    // Newel at the head: a squared post with a cap stone, standing on the landing; the coping
    // starts from its downhill face.
    const n1 = Math.min(cIn, cOut) - 0.12;
    const n2 = Math.max(cIn, cOut) + 0.12;
    b.surface = { mode: TexMode.Stone, layer: MAT.masonry, row: STRIP_A.two, axis: X, across: Z, u0: rng.int(0, 1023), top: top + 1.5 };
    b.box(-0.5, top - 0.3, n1, 0.7, top + 1.5, n2, 0.04, 8);
    b.surface = { mode: TexMode.Stone, layer: MAT.masonry, row: STRIP_A.half, axis: X, across: Z, u0: rng.int(0, 1023), top: top + 1.8, vRef: n1 - 0.1 };
    b.box(-0.6, top + 1.5, n1 - 0.1, 0.8, top + 1.8, n2 + 0.1, 0.05);
  }
  b.pop();
}
