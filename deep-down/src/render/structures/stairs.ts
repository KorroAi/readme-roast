import { Rng } from '../../core/rng';
import type { StructureSpec } from './types';
import { BAY_RING, STAIR_COPING, bayIntrados } from './geometry';
import { MAT } from '../materials';
import { StructureBuilder, TexMode, type V3 } from './builder';
import { newel } from './parts';

type Flight = Extract<StructureSpec, { kind: 'stairFlight' }>;

/** Riser height and tread depth (m): four per metre of the flight's 1:1 slope. */
export const RISER = 0.25;
export { STRIP_A } from './strips';
import { STRIP_A } from './strips';

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
 * The walking plane is y = top - s (the B.RAMP_* cells under it); every tread
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
  // Between parapets the steps tuck under them; without (a flight in a rock corridor) they run
  // into the walls.
  const tuck = f.parapet > 0 ? 0.02 : 0.3;
  const z0 = -hw - tuck;
  const z1 = hw + tuck;
  const segs = 4;
  const zs = Array.from({ length: segs + 1 }, (_, k) => z0 + ((z1 - z0) * k) / segs);
  for (let j = 0; j <= n; j++) {
    const back = sAt(j - 1);
    const nose = sAt(j);
    const end = j === 0 || j === n;
    const h = top - RISER * j + (end ? 0.03 : 0);
    const below = j === n ? h - 0.12 : top - RISER * (j + 1);
    b.stone(j, 1, f.seed);
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
  b.tone = 1;
  const y = (s: number, dy: number) => top - s + dy;
  const capLo = STAIR_COPING - 0.3;
  const s0 = 0;
  const s1 = f.run;
  /** A raking band in the plane z = c between heights lo and hi above the walking plane. */
  const band = (c: number, lo: number, hi: number, out: V3, aoLo = 1, aoHi = 1) =>
    b.quadOut([s0, y(s0, lo), c], [s1, y(s1, lo), c], [s1, y(s1, hi), c], [s0, y(s0, hi), c], out, [aoLo, aoLo, aoHi, aoHi]);
  for (const side of f.parapet > 0 ? [-1, 1] : []) {
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
    // A raking plinth course at the band's foot: a plain fascia 0.7 m deep standing 0.16 m
    // proud, a drip chamfer under it and a weathered (sloped) top. It is dressed as one run of
    // stone (no head joints: short joints on a long thin band read as a pipe's couplings), so
    // it reads as the flight's moulded base line rather than a rail.
    const n0 = -2.1 / Math.SQRT2;
    b.surface = { mode: TexMode.Monolith, layer: MAT.masonry, row: STRIP_A.metre, axis: [0, 0, 1], across: [1, 0, 0], u0: rng.int(0, 1023), top: n0 + 0.2 };
    b.tone = 0.9;
    b.push();
    // Frame: z runs down the rake (slope length), y normal to the walking plane, x across.
    b.translate(0, top, cBand).rotate(2, -Math.PI / 4).rotate(1, Math.PI / 2);
    const L = f.run * Math.SQRT2;
    const o = -side; // across, outward is -x in this frame for side +1
    const sec: Array<[number, number]> = [[0, n0 - 0.5], [o * 0.16, n0 - 0.44], [o * 0.16, n0 + 0.08], [o * 0.05, n0 + 0.19], [0, n0 + 0.2]];
    b.prism(o > 0 ? sec : sec.map(([u, v]) => [u, v] as [number, number]).reverse(), -n0 * 0.5, L - n0 * 0.5);
    b.tone = 1;
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
      b.stone(Math.round(s * 8), 3 + side, f.seed);
      b.box(0, -0.3 / Math.SQRT2, cA, len * Math.SQRT2, 0, cB, 0.035);
      b.tone = 1;
      b.pop();
      s += len;
    }
    // Newel at the head, standing on the landing; the coping starts from its downhill face.
    newel(b, rng, 0.1, (cIn + cOut) / 2, 0.5, f.parapet / 2 + 0.02, top, 1.85);
  }
  // Bays: each a rampant arch under the flight, a raking barrel soffit of voussoirs between the
  // flanks and the arch ring standing proud of both flanks.
  for (const [s0, s1] of f.bays) bay(b, f, s0, s1, rng);
  b.tone = 1;
  b.pop();
}

function bay(b: StructureBuilder, f: Flight, s0: number, s1: number, rng: Rng): void {
  const cF = f.width / 2 + f.parapet + 0.06;
  const y = (s: number) => bayIntrados(f.top, s0, s1, s);
  const slope = (s: number) => (y(Math.min(s1, s + 0.01)) - y(Math.max(s0, s - 0.01))) / (Math.min(s1, s + 0.01) - Math.max(s0, s - 0.01));
  // Outward (downward) unit normal of the intrados in the (s, y) plane.
  const nrm = (s: number): [number, number] => {
    const d = slope(s);
    const l = Math.hypot(d, 1);
    return [d / l, -1 / l];
  };
  // Voussoir boundaries: equal arc length, about 0.7 m.
  const pts: number[] = [s0];
  let len = 0;
  for (let s = s0; s < s1; s += 0.02) len += Math.hypot(0.02, y(s + 0.02) - y(s));
  const nv = Math.max(5, Math.round(len / 0.7));
  const step = len / nv;
  let acc = 0;
  for (let s = s0; s < s1 && pts.length < nv; s += 0.005) {
    acc += Math.hypot(0.005, y(s + 0.005) - y(s));
    if (acc >= step * pts.length) pts.push(s);
  }
  pts.push(s1);
  for (let k = 0; k + 1 < pts.length; k++) {
    const a = pts[k];
    const c = pts[k + 1];
    b.stone(k, 10 + Math.round(s0), f.seed);
    // Soffit: the voussoir's intrados face, across the whole flight, two segments for its curve.
    b.surface = { mode: TexMode.Stone, layer: MAT.masonry, row: STRIP_A.half, axis: Z, across: X, u0: rng.int(0, 1023), top: 0, vRef: a };
    const m = (a + c) / 2;
    for (const [p, q] of [[a, m], [m, c]]) {
      const n = nrm((p + q) / 2);
      b.quadOut([p, y(p), -cF], [q, y(q), -cF], [q, y(q), cF], [p, y(p), cF], [n[0], n[1], 0], [0.75, 0.75, 0.75, 0.75]);
    }
    // Ring stones on both flanks.
    for (const side of [-1, 1]) {
      const zo = side * (cF + 0.05);
      const zi = side * (cF - 0.25);
      const d = 0.012;
      const pa = a + d;
      const pc = c - d;
      const na = nrm(pa);
      const nc = nrm(pc);
      const inA: V3 = [pa, y(pa), 0];
      const inC: V3 = [pc, y(pc), 0];
      const outA: V3 = [pa - na[0] * BAY_RING, y(pa) - na[1] * BAY_RING, 0];
      const outC: V3 = [pc - nc[0] * BAY_RING, y(pc) - nc[1] * BAY_RING, 0];
      const at = (p: V3, z: number): V3 => [p[0], p[1], z];
      b.surface = { mode: TexMode.Monolith, layer: MAT.masonry, row: STRIP_A.metre, axis: X, across: Z, u0: rng.int(0, 1023), top: Math.max(outA[1], outC[1]) };
      const out: V3 = [0, 0, side];
      b.quadOut(at(inA, zo), at(inC, zo), at(outC, zo), at(outA, zo), out);
      // Joint faces, extrados and intrados edges back to the flank.
      // (The radial r = out - in turned a quarter: (-r.y, r.x) points back down the arch.)
      b.quadOut(at(inA, zo), at(outA, zo), at(outA, zi), at(inA, zi), [-(outA[1] - inA[1]), outA[0] - inA[0], 0]);
      b.quadOut(at(inC, zo), at(outC, zo), at(outC, zi), at(inC, zi), [outC[1] - inC[1], -(outC[0] - inC[0]), 0]);
      b.quadOut(at(outA, zo), at(outC, zo), at(outC, zi), at(outA, zi), [-(na[0] + nc[0]), -(na[1] + nc[1]), 0]);
      b.quadOut(at(inA, zo), at(inC, zo), at(inC, zi), at(inA, zi), [na[0] + nc[0], na[1] + nc[1], 0]);
    }
  }
}
