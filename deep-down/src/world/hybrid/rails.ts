// The cart run (W1-LEAD §3 Ride: "a mine-cart run along rails through a cavern system; ore glints and crystal knots
// pass by within reach"): the Copper Lode's Way Down. From the cart platform at the room's exit the rails swing out
// toward the footprint's centre through a grotto and back, dropping to the next drift's stub, where the cart stops
// facing the face. Pure geometry: the layout keeps its volume, nodeStamp carves it, the placement carries the ride.

import { type Box3, type V3 } from './grid';

export interface CartRun {
  /** The rail centreline at rail level (world m), every ~0.5 m, start (platform) to end (the next drift's stub). */
  rail: V3[];
  /** Eye points (1.6 m above the rail) for the ride. */
  ride: V3[];
  /** Pass-by slots along the run: a wall point within reach of the eye, its inward normal, and its ride fraction. */
  passBys: Array<{ id: string; pos: V3; normal: V3; t: number }>;
  /** The grotto the run swings through (centre on the rail, radius). */
  grotto: { centre: V3; r: number };
  /** The carved volume (for the overlap and lap-gap rules). */
  volume: Box3;
}

/** Tunnel half-width and height above the rail (m). */
export const CART_HALF = 1.5;
export const CART_H = 3.5;
/** Pass-by slots per run (1A's RIDE_GLINTS.cart is 6). */
export const CART_SLOTS = 6;

/**
 * The cart run from `start` (the platform, rail level) to `end` (the next drift's landing, rail level), bulging
 * `dip` metres toward `centre` (the footprint's middle).
 */
export function cartRun(node: number, start: V3, end: V3, centre: { x: number; z: number }, dip = 5.0): CartRun {
  const dx = end.x - start.x;
  const dz = end.z - start.z;
  const L = Math.hypot(dx, dz);
  const ux = dx / L;
  const uz = dz / L;
  // The side toward the footprint's centre.
  let nx = -uz;
  let nz = ux;
  const mx = (start.x + end.x) / 2;
  const mz = (start.z + end.z) / 2;
  if ((centre.x - mx) * nx + (centre.z - mz) * nz < 0) {
    nx = -nx;
    nz = -nz;
  }
  const drop = start.y - end.y;
  const at = (t: number): V3 => {
    const bulge = dip * Math.sin(Math.PI * t);
    const s = t * t * (3 - 2 * t);
    return { x: start.x + ux * L * t + nx * bulge, y: start.y - drop * s, z: start.z + uz * L * t + nz * bulge };
  };
  // Sample by arc length (~0.5 m).
  const dense: V3[] = [];
  for (let k = 0; k <= 400; k++) dense.push(at(k / 400));
  const rail: V3[] = [dense[0]];
  let acc = 0;
  for (let k = 1; k < dense.length; k++) {
    const a = dense[k - 1];
    const b = dense[k];
    acc += Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
    if (acc >= 0.5 || k === dense.length - 1) {
      rail.push(b);
      acc = 0;
    }
  }
  const ride = rail.map((p) => ({ x: p.x, y: p.y + 1.6, z: p.z }));
  const passBys: CartRun['passBys'] = [];
  for (let j = 0; j < CART_SLOTS; j++) {
    const t = (j + 0.5) / CART_SLOTS;
    const p = at(t);
    const q = at(Math.min(1, t + 0.01));
    const tx = q.x - p.x;
    const tz = q.z - p.z;
    const tl = Math.hypot(tx, tz) || 1;
    // Alternate walls: the outer wall, then the inner.
    const side = j % 2 === 0 ? 1 : -1;
    const sx = (-tz / tl) * side;
    const sz = (tx / tl) * side;
    passBys.push({ id: `ride:${node}:${j}`, pos: { x: p.x + sx * (CART_HALF - 0.05), y: p.y + 1.3 + 0.4 * (j % 3) * 0.5, z: p.z + sz * (CART_HALF - 0.05) }, normal: { x: -sx, y: 0, z: -sz }, t });
  }
  const g = at(0.5);
  const grotto = { centre: g, r: 3.2 };
  let min = { x: Infinity, y: Infinity, z: Infinity };
  let max = { x: -Infinity, y: -Infinity, z: -Infinity };
  for (const p of rail) {
    min = { x: Math.min(min.x, p.x - CART_HALF - 0.5), y: Math.min(min.y, p.y - 1), z: Math.min(min.z, p.z - CART_HALF - 0.5) };
    max = { x: Math.max(max.x, p.x + CART_HALF + 0.5), y: Math.max(max.y, p.y + CART_H + 0.5), z: Math.max(max.z, p.z + CART_HALF + 0.5) };
  }
  min = { x: Math.min(min.x, g.x - grotto.r - 0.5), y: min.y, z: Math.min(min.z, g.z - grotto.r - 0.5) };
  max = { x: Math.max(max.x, g.x + grotto.r + 0.5), y: Math.max(max.y, g.y + 5), z: Math.max(max.z, g.z + grotto.r + 0.5) };
  return { rail, ride, passBys, grotto, volume: { min, max } };
}

/** The point at fraction t (0..1, by arc length) of a polyline (1A's ride glints carry their `at`). */
export function pointOnPolyline(pts: ReadonlyArray<V3>, t: number): V3 {
  if (pts.length === 0) return { x: 0, y: 0, z: 0 };
  let total = 0;
  for (let i = 1; i < pts.length; i++) total += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y, pts[i].z - pts[i - 1].z);
  let want = Math.max(0, Math.min(1, t)) * total;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    const l = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
    if (want <= l || i === pts.length - 1) {
      const u = l > 0 ? Math.min(1, want / l) : 0;
      return { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u, z: a.z + (b.z - a.z) * u };
    }
    want -= l;
  }
  return { ...pts[pts.length - 1] };
}
