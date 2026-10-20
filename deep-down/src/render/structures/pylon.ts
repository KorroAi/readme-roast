import { Rng } from '../../core/rng';
import type { StructureSpec } from './types';
import { MAT } from '../materials';
import { StructureBuilder, TexMode, type V3 } from './builder';
import { STRIP_A } from './strips';

type Pylon = Extract<StructureSpec, { kind: 'pylon' }>;
type Coping = Extract<StructureSpec, { kind: 'coping' }>;
type Weathering = Extract<StructureSpec, { kind: 'weathering' }>;
type KerbSlope = Extract<StructureSpec, { kind: 'kerbSlope' }>;

/** Height (m) of the pylon's cavetto cornice under the landing it carries. */
export const CORNICE_H = 4.05;

/**
 * The landing pylon's dress over its voxel walls (which keep their coursed masonry): a battered
 * socle with a weathered top at its foot, roll mouldings up its corners, framed recesses, and an
 * Egyptian cornice (torus roll, a gorge flaring out a metre, a fillet slab) under the landing, so
 * the tower reads as a pylon carrying the stair landing, not a box. The dress runs round the
 * faces that show (`path`, outward to its left); the flights cover the rest.
 */
export function buildPylon(b: StructureBuilder, p: Pylon): void {
  const rng = new Rng(p.seed);
  const path = p.path;
  b.aoAt = b.contactAo();
  const masonry = (row: number, top: number) => {
    b.surface = { mode: TexMode.Stone, layer: MAT.masonry, row, axis: [1, 0, 0], across: [0, 0, 1], u0: rng.int(0, 1023), top };
  };
  // Cornice: torus roll, gorge, fillet slab; its top 5 cm under the landing floor.
  const yc = p.top - CORNICE_H;
  const gorge: Array<[number, number]> = [];
  for (let k = 0; k <= 8; k++) {
    const t = (k / 8) * (Math.PI / 2);
    gorge.push([0.05 + 0.95 * (1 - Math.cos(t)), yc + 0.85 + 2.1 * Math.sin(t)]);
  }
  const cornice: Array<[number, number]> = [
    [0, yc - 0.05],
    [0.13, yc + 0.06],
    [0.21, yc + 0.22],
    [0.21, yc + 0.42],
    [0.13, yc + 0.6],
    [0.04, yc + 0.72],
    ...gorge,
    [1.06, yc + 3.0],
    [1.06, p.top - 0.05],
    [0, p.top - 0.05],
  ];
  masonry(STRIP_A.two, p.top);
  b.surface = { ...b.surface, mode: TexMode.World };
  b.sweep(path, cornice, true);
  // Socle: the dressed foot course with a sloping weathering, a roll where it meets the wall.
  const socle: Array<[number, number]> = [
    [1.03, p.foot - 0.4],
    [1.03, p.foot + 1.55],
    [0.86, p.foot + 1.85],
    [0.3, p.foot + 2.0],
    [0.2, p.foot + 2.06],
    [0.2, p.foot + 2.22],
    [0, p.foot + 2.3],
  ];
  masonry(STRIP_A.metre, p.foot + 2.3);
  b.surface = { ...b.surface, mode: TexMode.World };
  b.sweep(path, socle, true);
  // Roll mouldings up the convex corners of the path, from the socle to the cornice.
  for (let i = 1; i + 1 < path.length; i++) {
    const [x, z] = path[i];
    const a: V3 = [path[i][0] - path[i - 1][0], 0, path[i][1] - path[i - 1][1]];
    const c: V3 = [path[i + 1][0] - path[i][0], 0, path[i + 1][1] - path[i][1]];
    // With the outward side on the left, a turn to the right (seen from above) is convex.
    if (a[0] * c[2] - a[2] * c[0] < 0) continue;
    // The roll's arc: 270 degrees round the outside, from along the outgoing face to back along
    // the incoming one (revolve angle t points along (cos t, -sin t)).
    const back = Math.atan2(a[2], -a[0]);
    b.push();
    b.translate(x, 0, z);
    const r = 0.24;
    for (let ya = p.foot + 2.25; ya < yc - 0.05; ya += 2) {
      const yb = Math.min(yc, ya + 2);
      b.surface = { mode: TexMode.Monolith, layer: MAT.masonry, row: STRIP_A.two, axis: [1, 0, 0], across: [0, 0, 1], u0: rng.int(0, 1023), top: yb };
      const u0 = b.surface.u0;
      b.revolve([[r, ya], [r, yb]], 12, (ang, _rr, y) => [ang * r * 16 + u0, (yb - y) * 16], () => 1, back - Math.PI * 1.5, Math.PI * 1.5);
    }
    b.pop();
  }
  // Frames round the recesses: jambs, sill and lintel standing a little proud of the wall.
  for (const r of p.recesses) {
    masonry(STRIP_A.half, r.y1 + 0.5);
    b.surface = { ...b.surface, mode: TexMode.Monolith };
    const w = 0.36;
    const proud = 0.09;
    if (r.face === 'z') {
      const z = r.at;
      const zo = z - proud * r.out;
      const za = Math.min(z, zo);
      const zb = Math.max(z, zo) + 0.02;
      b.box(r.a0 - w, r.y0 - 0.45, za, r.a0, r.y1 + 0.5, zb, 0.03);
      b.box(r.a1, r.y0 - 0.45, za, r.a1 + w, r.y1 + 0.5, zb, 0.03);
      b.box(r.a0, r.y1, za, r.a1, r.y1 + 0.5, zb, 0.03);
      b.box(r.a0, r.y0 - 0.45, za, r.a1, r.y0, zb, 0.03);
    } else {
      const x = r.at;
      const xo = x + proud * r.out;
      const xa = Math.min(x, xo) - 0.02;
      const xb = Math.max(x, xo);
      b.box(xa, r.y0 - 0.45, r.a0 - w, xb, r.y1 + 0.5, r.a0, 0.03);
      b.box(xa, r.y0 - 0.45, r.a1, xb, r.y1 + 0.5, r.a1 + w, 0.03);
      b.box(xa, r.y1, r.a0, xb, r.y1 + 0.5, r.a1, 0.03);
      b.box(xa, r.y0 - 0.45, r.a0, xb, r.y0, r.a1, 0.03);
    }
  }
}

/**
 * A run of coping stones on top of a wall from a to b: saddleback stones (a ridge along the
 * middle, chamfered eaves) about `stone` metres long with narrow V joints, overhanging the wall a
 * little on both sides.
 */
export function buildCoping(b: StructureBuilder, c: Coping): void {
  const rng = new Rng(c.seed);
  const dx = c.b[0] - c.a[0];
  const dz = c.b[1] - c.a[1];
  const len = Math.hypot(dx, dz);
  if (len < 0.1) return;
  b.aoAt = b.contactAo();
  b.push();
  // Local x along the run, z across it, y up (a proper rotation about y).
  const ang = Math.atan2(-dz, dx);
  b.translate(c.a[0], 0, c.a[1]).rotate(1, ang);
  const hw = c.width / 2;
  const y0 = c.y;
  const y1 = c.y + c.height;
  let x = 0;
  while (x < len - 0.05) {
    const l = Math.min(len - x, c.stone * rng.range(0.75, 1.25));
    b.push();
    b.translate(x, 0, 0);
    // A prism along local z, turned to run along x (its texture along the run).
    b.rotate(1, Math.PI / 2);
    b.surface = { mode: TexMode.Stone, layer: MAT.masonry, row: STRIP_A.half, axis: [0, 0, 1], across: [1, 0, 0], u0: rng.int(0, 1023), top: y1, vRef: -hw };
    const e = y0 + c.height * 0.45;
    b.stone(Math.round(x * 8), 1, c.seed);
    b.prism([[-hw, y0], [hw, y0], [hw, e], [0, y1], [-hw, e]], 0.006, l - 0.006);
    b.pop();
    x += l;
  }
  b.pop();
}

/**
 * A weathering: the sloped stones that shed water off a set-back, in courses of 1-2 m along it,
 * their lower edge a little proud of the step's face, so a stepped buttress reads as battered
 * masonry, not a stack of boxes.
 */
export function buildWeathering(b: StructureBuilder, w: Weathering): void {
  const rng = new Rng(w.seed);
  b.aoAt = b.contactAo();
  let z = w.z0;
  while (z < w.z1 - 0.05) {
    const l = Math.min(w.z1 - z, rng.range(1.0, 2.0));
    b.surface = { mode: TexMode.Stone, layer: MAT.masonry, row: STRIP_A.half, axis: [0, 0, 1], across: [1, 0, 0], u0: rng.int(0, 1023), top: w.y + w.rise, vRef: w.x0 };
    const lip = w.x0 - 0.1;
    b.prism([[lip, w.y - 0.05], [w.x1 + 0.02, w.y - 0.05], [w.x1 + 0.02, w.y + w.rise], [lip, w.y + 0.22]], z + 0.008, z + l - 0.008);
    z += l;
  }
}

/**
 * A battered kerb: the edge of a paved way sloping down one metre to the floor beside it (the
 * explorer walks it as a ramp), in dressed stones 1-2 m long with a chamfered top arris.
 */
export function buildKerbSlope(b: StructureBuilder, k: KerbSlope): void {
  const rng = new Rng(k.seed);
  b.aoAt = b.contactAo();
  let x = k.x0;
  while (x < k.x1 - 0.05) {
    const l = Math.min(k.x1 - x, rng.range(1.1, 2.1));
    b.surface = { mode: TexMode.Stone, layer: MAT.masonry, row: STRIP_A.half, axis: [1, 0, 0], across: [0, 0, 1], u0: rng.int(0, 1023), top: k.y, vRef: k.z };
    b.push();
    // Section in the y-z plane (z outward), swept along x: a prism along local z turned onto x.
    b.translate(x, 0, k.z).rotate(1, Math.PI / 2);
    // After the turn local x = -z(world): outward (k.out) is local x = -k.out.
    const o = -k.out;
    const sec: Array<[number, number]> = [[0, k.y - 1.06], [o * 1.02, k.y - 1.06], [o * 1.02, k.y - 0.98], [o * 0.06, k.y + 0.0], [0, k.y + 0.02]];
    b.prism(o > 0 ? sec : sec.slice().reverse(), 0.005, l - 0.005);
    b.pop();
    x += l;
  }
}
