import { Rng } from '../../core/rng';
import type { StructureSpec } from '../../world/gen/types';
import { BASE_TOP, CAPITAL_H, columnNeck, echinusRadius, fractureHeight, plinthHalf, shaftRadius } from '../../world/gen/architecture';
import { MAT } from '../materials';
import { StructureBuilder, TexMode, type V3 } from './builder';
import { STRIP_A } from './stairs';

type Column = Extract<StructureSpec, { kind: 'column' }>;
type Drum = Extract<StructureSpec, { kind: 'drum' }>;
type Block = Extract<StructureSpec, { kind: 'block' }>;

const D = 16;
const TAU = Math.PI * 2;
const STRIPS_2M = [STRIP_A.two, STRIP_A.twoB];

/** Texels around a round stone: whole strip widths (128 texels), so the wrap has no seam. */
function aroundUv(radius: number): (a: number, u0: number) => number {
  const wraps = Math.max(1, Math.round((TAU * radius) / 8));
  return (a, u0) => (a / TAU) * wraps * 128 + u0;
}

/**
 * A round column (world/gen/architecture.ts for its proportions): a square plinth, an attic base
 * (torus, scotia, torus), a shaft of drums of 1.6-2.2 m with entasis and a groove at each bed
 * joint, then a necking ring, a flaring echinus and a square abacus running into the rock; or a
 * shaft broken off in a conchoidal fracture.
 */
export function buildColumn(b: StructureBuilder, c: Column): void {
  const rng = new Rng(c.seed);
  const R = c.radius;
  const ph = plinthHalf(R);
  const segs = R > 2.5 ? 40 : 32;
  const around = aroundUv(R);
  const fy = c.y;
  const full = c.state === 'full';
  const neck = full ? columnNeck(c) : 0;
  b.push();
  b.translate(c.x, 0, c.z);
  b.aoAt = () => 1;
  const stone = (row: number, top: number, vRef = 0) => {
    b.surface = { mode: TexMode.Stone, layer: MAT.masonry, row, axis: [1, 0, 0], across: [0, 0, 1], u0: rng.int(0, 1023), top, vRef };
  };

  // Plinth: an exact square (its collision is whole cells), set into the floor.
  stone(STRIP_A.metre, fy + 1, -ph);
  b.box(-ph, fy - 0.35, -ph, ph, fy + 1, ph, 0.05, 8);

  // Attic base: lower torus, scotia, upper torus, fillet; darker where it sits on the plinth.
  const base: Array<[number, number]> = [
    [R + 0.36, fy + 1.0],
    [R + 0.44, fy + 1.07],
    [R + 0.46, fy + 1.18],
    [R + 0.4, fy + 1.3],
    [R + 0.26, fy + 1.36],
    [R + 0.17, fy + 1.43],
    [R + 0.15, fy + 1.52],
    [R + 0.2, fy + 1.58],
    [R + 0.27, fy + 1.64],
    [R + 0.29, fy + 1.72],
    [R + 0.22, fy + 1.81],
    [R + 0.08, fy + 1.86],
    [R + 0.06, BASE_TOP + fy],
    [R, BASE_TOP + fy],
  ];
  stone(STRIP_A.metre, fy + BASE_TOP);
  const ub = b.surface.u0;
  b.revolve(base, segs, (a, _r, y) => [around(a, ub), (fy + BASE_TOP - y) * D], (y) => (y < fy + 1.12 ? 0.55 : y > fy + 1.4 && y < fy + 1.6 ? 0.75 : 1));

  // Shaft: drums with entasis, a groove at every bed joint, each drum its own stone.
  const breakTop = (a: number) => fractureHeight(c, Math.cos(a) * R * 0.98, -Math.sin(a) * R * 0.98);
  let yEnd: number;
  if (full) yEnd = neck;
  else {
    yEnd = Infinity;
    for (let k = 0; k < 64; k++) yEnd = Math.min(yEnd, breakTop((k / 64) * TAU));
    yEnd -= 0.25;
  }
  let y0 = fy + BASE_TOP;
  const g = 0.035;
  while (y0 < yEnd - 0.05) {
    let h = rng.range(1.6, 2.15);
    if (yEnd - (y0 + h) < 0.9) h = yEnd - y0; // no sliver drum under the capital / the break
    const y1 = Math.min(yEnd, y0 + h);
    const jitter = rng.range(-0.012, 0.012);
    const r0 = shaftRadius(c, y0) + jitter;
    const r1 = shaftRadius(c, y1) + jitter;
    const first = y0 <= fy + BASE_TOP + 1e-6;
    const profile: Array<[number, number]> = first ? [[r0, y0]] : [[r0 - g, y0], [r0, y0 + 0.045]];
    profile.push(full || y1 < yEnd - 1e-6 ? [r1, y1 - 0.045] : [r1, y1]);
    if (full || y1 < yEnd - 1e-6) profile.push([r1 - g, y1]);
    stone(STRIPS_2M[rng.int(0, 1)], y1);
    const u0 = b.surface.u0;
    b.revolve(profile, segs, (a, _r, y) => [around(a, u0), (y1 - y) * D], (y) => (first && y < y0 + 0.2 ? 0.78 : 1), rng.range(0, TAU));
    y0 = y1;
  }

  if (full) {
    // Capital: astragal, necking, echinus flaring to the abacus; dark in the crease under it.
    const rn = shaftRadius(c, neck);
    const re = echinusRadius(R);
    const cap: Array<[number, number]> = [
      [rn - g, neck],
      [rn + 0.06, neck + 0.05],
      [rn + 0.08, neck + 0.12],
      [rn + 0.06, neck + 0.19],
      [rn, neck + 0.24],
      [rn - 0.01, neck + 0.45],
      [rn + 0.06, neck + 0.7],
      [rn + 0.22, neck + 0.98],
      [rn + 0.46, neck + 1.24],
      [re - 0.12, neck + 1.46],
      [re, neck + 1.6],
      [re, neck + CAPITAL_H],
    ];
    stone(STRIP_A.two, neck + CAPITAL_H);
    const uc = b.surface.u0;
    b.revolve(cap, segs, (a, _r, y) => [around(a, uc), (neck + CAPITAL_H - y) * D], (y) => (y < neck + 0.3 ? 0.8 : y > neck + 1.5 ? 0.7 : 1));
    // Abacus: a square slab running well into the rock it carries.
    stone(STRIP_A.metre, neck + CAPITAL_H + 1, -ph);
    b.box(-ph, neck + CAPITAL_H, -ph, ph, c.top + 3.5, ph, 0.06, 4);
  } else {
    // The break: the last drum's wall up to the fracture, and the fracture surface (raw stone).
    const ang = Array.from({ length: segs + 1 }, (_, j) => (j / segs) * TAU);
    const rim = ang.map((a) => {
      const h = breakTop(a);
      const r = shaftRadius(c, h) * (1 - 0.025 * (1 + Math.sin(a * 7 + c.seed)));
      return { a, h, r };
    });
    const yb = y0;
    const rb = shaftRadius(c, yb);
    const bottom = ang.map((a): V3 => [Math.cos(a) * (rb - g), yb, -Math.sin(a) * (rb - g)]);
    const lip = rim.map((p): V3 => [Math.cos(p.a) * p.r, p.h, -Math.sin(p.a) * p.r]);
    const radial = ang.map((a): V3 => [Math.cos(a), 0, -Math.sin(a)]);
    const hMax = Math.max(...rim.map((p) => p.h));
    stone(STRIPS_2M[rng.int(0, 1)], hMax);
    const u0 = b.surface.u0;
    const uvA = ang.map((a): [number, number] => [around(a, u0), Math.min(31, (hMax - yb) * D)]);
    const uvB = rim.map((p): [number, number] => [around(p.a, u0), Math.max(0, (hMax - p.h) * D)]);
    b.strip(bottom, lip, radial, radial, undefined, undefined, uvA, uvB);
    b.surface = { mode: TexMode.Plain, layer: MAT.stoneSide, row: 0, axis: [1, 0, 0], across: [0, 0, 1], u0: rng.int(0, 127), top: 0, vRef: 0 };
    const K = 5;
    const pt = (k: number, j: number): V3 => {
      const p = rim[j];
      const f = 1 - k / K;
      const r = p.r * f * (k === 0 ? 1 : 0.985);
      const x = Math.cos(p.a) * r;
      const z = -Math.sin(p.a) * r;
      return [x, k === 0 ? p.h - 0.04 : fractureHeight(c, x, z), z];
    };
    for (let k = 0; k < K; k++)
      for (let j = 0; j < segs; j++) {
        if (k === K - 1) b.poly([pt(k, j), pt(k, j + 1), pt(K, 0)]);
        else b.quadOut(pt(k, j), pt(k, j + 1), pt(k + 1, j + 1), pt(k + 1, j), [0, 1, 0]);
      }
  }
  b.pop();
}

/** A fallen drum (or two, rolled a little apart), its ends dressed bed faces. */
export function buildDrum(b: StructureBuilder, d: Drum): void {
  const rng = new Rng(d.seed);
  const pieces = d.length > 2.5 ? 2 : 1;
  const r = d.radius + 0.04;
  const around = aroundUv(r);
  const segs = r > 2.5 ? 40 : 32;
  const len = d.length / pieces;
  b.aoAt = () => 1;
  for (let i = 0; i < pieces; i++) {
    const c = -d.length / 2 + len * (i + 0.5);
    const off = pieces > 1 ? (i === 0 ? -1 : 1) * rng.range(0.04, 0.12) : 0;
    b.push();
    b.translate(d.x + (d.axis === 'x' ? c : off), d.y, d.z + (d.axis === 'z' ? c : off));
    if (d.axis === 'x') b.rotate(2, -Math.PI / 2);
    else b.rotate(0, Math.PI / 2);
    b.rotate(0, rng.range(-0.025, 0.025)).rotate(1, d.roll + i * 1.7);
    const h = len / 2 - 0.04;
    const ch = 0.07;
    const profile: Array<[number, number]> = [
      [0, -h],
      [r - ch, -h],
      [r, -h + ch],
      [r, h - ch],
      [r - ch, h],
      [0, h],
    ];
    b.surface = { mode: TexMode.Stone, layer: MAT.masonry, row: STRIPS_2M[rng.int(0, 1)], axis: [1, 0, 0], across: [0, 0, 1], u0: rng.int(0, 1023), top: 0 };
    const u0 = b.surface.u0;
    // Side: around x along; ends: the bed face squeezed into the strip.
    b.revolve(profile, segs, (a, rr, y) => (Math.abs(y) > h - 1e-3 && rr < r - ch + 1e-3 ? [Math.cos(a) * rr * D + u0, ((Math.sin(a) * rr) / r + 1) * 15] : [around(a, u0), Math.min(31, (h - y) * D * (31 / (2 * h * D)))]));
    b.pop();
  }
}

/** A dressed block lying on the floor (a fallen slab), a little askew. */
export function buildBlock(b: StructureBuilder, k: Block): void {
  const rng = new Rng(k.seed);
  const [x0, y0, z0] = k.min;
  const [x1, y1, z1] = k.max;
  b.aoAt = () => 1;
  b.push();
  b.translate((x0 + x1) / 2, 0, (z0 + z1) / 2).rotate(1, rng.range(-0.05, 0.05));
  const hx = (x1 - x0) / 2 - 0.03;
  const hz = (z1 - z0) / 2 - 0.03;
  const along = k.axis === 'x';
  b.surface = { mode: TexMode.Stone, layer: MAT.masonry, row: y1 - y0 > 0.7 ? STRIP_A.metre : STRIP_A.half, axis: along ? [1, 0, 0] : [0, 0, 1], across: along ? [0, 0, 1] : [1, 0, 0], u0: rng.int(0, 1023), top: y1, vRef: along ? -hz : -hx };
  b.box(-hx, y0 - 0.06, -hz, hx, y1, hz, k.chamfer, 8);
  b.pop();
}
