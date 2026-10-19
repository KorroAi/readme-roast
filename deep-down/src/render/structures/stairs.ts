import { Rng } from '../../core/rng';
import type { StructureSpec } from '../../world/gen/types';
import { STAIR_COPING } from '../../world/gen/generateWorld';
import { MAT } from '../materials';
import { StructureBuilder, TexMode, type Surface, type V3 } from './builder';

type Flight = Extract<StructureSpec, { kind: 'stairFlight' }>;

/** Riser height and tread depth (m): four per metre of the flight's 1:1 slope. */
export const RISER = 0.25;
/** Library A strip rows (texels) by course height (materials/courses.ts COURSE_LIBRARIES.A). */
export const STRIP_A = { half: 0, metre: 8, metreB: 24, oneHalf: 40, two: 64, twoB: 96 } as const;

/**
 * A monumental stair flight: monolithic steps (one stone across the walk, 0.25 m risers on
 * 0.25 m treads with a worn, chamfered nosing) between raking parapets (a dressed inner face, an
 * outer band standing a little proud of the voxel flank below it so the flank's 1 m steps vanish
 * behind a straight rake, and a coping of long sloped stones), newels at the head.
 *
 * Local frame: x = s (metres down the flight from its head), y up, z = c (across, walk centred).
 * The walking plane is y = top - s (PlayerController walks it on the B.RAMP_* cells); every tread
 * is within RISER / 2 of it.
 */
export function buildStairFlight(b: StructureBuilder, f: Flight): void {
  const rng = new Rng(f.seed);
  b.push();
  b.translate(f.dir === 'x' ? f.x0 : f.x0, 0, f.dir === 'x' ? f.z0 : f.z0);
  if (f.dir === 'z') b.rotate(1, -Math.PI / 2);
  const sDir: V3 = b.dirToWorld([1, 0, 0]);
  const cDir: V3 = b.dirToWorld([0, 0, 1]);
  const origin = b.toWorld([0, 0, 0]);
  const along = (s: number) => origin[0] * sDir[0] + origin[2] * sDir[2] + s;
  const hw = f.width / 2;
  const n = Math.round(f.run / RISER);
  const top = f.top;

  // Steps. Step j: tread at top - j * RISER from s(j-1) back to its nosing at s(j); its riser
  // drops to the next tread. The first and last treads run onto the landings (a threshold stone a
  // few cm proud of the terrain floor, covering the bevel where the floor meets the flight).
  const sAt = (j: number) => (j < 0 ? -0.6 : j >= n ? f.run + 0.3 : RISER * j + RISER / 2);
  for (let j = 0; j <= n; j++) {
    const back = sAt(j - 1);
    const nose = sAt(j);
    const end = j === 0 || j === n;
    const h = top - RISER * j + (end ? 0.03 : 0);
    const below = j === n ? h - 0.12 : top - RISER * (j + 1);
    const stone: Surface = { mode: TexMode.Stone, layer: MAT.floorSlab, row: STRIP_A.half, axis: cDir, across: sDir, u0: rng.int(0, 1023), top: h, vRef: along(nose) };
    b.surface = stone;
    // Tread: darker at the back (the inner corner under the riser above).
    const z0 = -hw - 0.02;
    const z1 = hw + 0.02;
    // The nosing is worn: its chamfer is deeper and rounder toward the middle of the walk.
    const segs = 6;
    const wear = (k: number) => {
      const u = k / segs;
      const mid = 1 - Math.abs(u * 2 - 1);
      return 0.025 + 0.045 * mid * mid * (0.6 + 0.4 * rng.next());
    };
    const ws = Array.from({ length: segs + 1 }, (_, k) => (j === n ? 0.02 : wear(k)));
    const zs = Array.from({ length: segs + 1 }, (_, k) => z0 + ((z1 - z0) * k) / segs);
    const aoBack = j === 0 ? 0.85 : 0.62;
    for (let k = 0; k < segs; k++) {
      const za = zs[k];
      const zb = zs[k + 1];
      // tread top (nosing chamfer start at nose - w)
      b.quad([back, h, zb], [nose - ws[k + 1], h, zb], [nose - ws[k], h, za], [back, h, za], [aoBack, 1, 1, aoBack]);
      // chamfer
      b.quad([nose - ws[k + 1], h, zb], [nose, h - ws[k + 1], zb], [nose, h - ws[k], za], [nose - ws[k], h, za], [1, 1, 1, 1]);
      // riser
      if (j < n) b.quad([nose, h - ws[k + 1], zb], [nose, below, zb], [nose, below, za], [nose, h - ws[k], za], [1, 0.55, 0.55, 1]);
    }
    if (j === n) b.quad([nose, h, z1], [nose, below, z1], [nose, below, z0], [nose, h, z0]);
    if (j === 0) b.quad([back, h - 0.12, z1], [back, h, z1], [back, h, z0], [back, h - 0.12, z0]);
  }

  // Parapets.
  for (const side of [-1, 1]) {
    const cIn = side * hw;
    const cOut = side * (hw + f.parapet);
    const cBand = side * (hw + f.parapet + 0.06);
    const s0 = 0;
    const s1 = f.run;
    const y = (s: number, dy: number) => top - s + dy;
    const capLo = STAIR_COPING - 0.3;
    // Faces are listed counter-clockwise seen from outside: the inner face looks toward -side.
    const face = (c: number, outward: number, lo: number, hi: number) => {
      const a: V3 = [s0, y(s0, lo), c];
      const bq: V3 = [s1, y(s1, lo), c];
      const cq: V3 = [s1, y(s1, hi), c];
      const d: V3 = [s0, y(s0, hi), c];
      if (outward > 0) b.quad(a, d, cq, bq);
      else b.quad(a, bq, cq, d);
    };
    b.surface = { mode: TexMode.World, layer: MAT.masonry, row: 0, axis: sDir, across: cDir, u0: 0, top: 0 };
    // Inner face, from below the treads to under the coping.
    face(cIn, -side, -0.4, capLo);
    // Outer band, proud of the flank wall, from two metres below the walk to the coping.
    face(cBand, side, -2.15, capLo);
    // Band foot: a raking string course under the band (a shadow line, not a ledge of boxes).
    b.push();
    b.surface = { mode: TexMode.Stone, layer: MAT.masonry, row: STRIP_A.half, axis: sDir, across: cDir, u0: rng.int(0, 1023), top: 0 };
    const sc = side * (hw + f.parapet + 0.13);
    for (const [lo, hi, c] of [[-2.15, -1.95, sc]] as const) {
      const a: V3 = [s0, y(s0, lo), c];
      const bq: V3 = [s1, y(s1, lo), c];
      const cq: V3 = [s1, y(s1, hi), c];
      const d: V3 = [s0, y(s0, hi), c];
      if (side > 0) b.quad(a, d, cq, bq);
      else b.quad(a, bq, cq, d);
      // its top and underside back to the band
      const ta: V3 = [s0, y(s0, hi), cBand];
      const tb: V3 = [s1, y(s1, hi), cBand];
      const ua: V3 = [s0, y(s0, lo), cBand];
      const ub: V3 = [s1, y(s1, lo), cBand];
      if (side > 0) {
        b.quad(d, ta, tb, cq);
        b.quad(a, bq, ub, ua);
      } else {
        b.quad(d, cq, tb, ta);
        b.quad(a, ua, ub, bq);
      }
    }
    b.pop();
    // Coping: long sloped stones, overhanging both faces, chamfered, end to end (V joints).
    const cA = Math.min(cIn, cOut) - (side > 0 ? 0.06 : 0.12);
    const cB = Math.max(cIn, cOut) + (side > 0 ? 0.12 : 0.06);
    let s = s0 - 0.35;
    const slope = Math.SQRT2;
    while (s < s1 - 0.01) {
      const len = Math.min(s1 + 0.02 - s, rng.range(1.6, 2.6));
      const s2 = s + len;
      b.push();
      // The stone's own frame: x down the rake, y normal to it.
      b.translate(s, y(s, STAIR_COPING), 0).rotate(2, -Math.PI / 4);
      b.surface = { mode: TexMode.Stone, layer: MAT.masonry, row: STRIP_A.oneHalf, axis: norm3(b.dirToWorld([1, 0, 0])), across: cDir, u0: rng.int(0, 1023), top: y(s, STAIR_COPING), vRef: 0 };
      const th = 0.3 / slope;
      b.box(0, -th * 1.0, cA, len * slope, 0, cB, 0.035);
      b.pop();
      s = s2;
    }
    // Newel at the head: a squared post with a cap stone, standing on the landing.
    b.surface = { mode: TexMode.Stone, layer: MAT.masonry, row: STRIP_A.oneHalf, axis: sDir, across: cDir, u0: rng.int(0, 1023), top: top + 1.55 };
    const n0 = Math.min(cIn, cOut) - 0.12;
    const n1 = Math.max(cIn, cOut) + 0.12;
    b.box(-0.55, top - 0.3, n0, 0.75, top + 1.45, n1, 0.04, 8);
    b.surface = { ...b.surface, top: top + 1.75, u0: rng.int(0, 1023) };
    b.box(-0.65, top + 1.45, n0 - 0.1, 0.85, top + 1.75, n1 + 0.1, 0.05);
  }
  b.pop();
}

function norm3(v: V3): V3 {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
}
