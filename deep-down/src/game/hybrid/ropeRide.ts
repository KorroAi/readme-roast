// Rides along authored polylines (SPEC §3.2 rule 4), ported from v1's ropeRide.ts (9eb4166): a ride follows its
// polyline on a trapezoid speed profile (constant acceleration over a ramp at each end, a cruise between), so the
// position is continuous and the arc length never runs backwards. Pure: the camera owns the pose.

export interface V3 {
  x: number;
  y: number;
  z: number;
}

/** A polyline with its cumulative arc length. */
export interface Path {
  pts: V3[];
  cum: number[];
  length: number;
  /** The steepest segment's |sin| of its slope (vertical speed = speed × this, at most). */
  maxSin: number;
}

export function makePath(points: readonly V3[]): Path {
  const pts = points.map((p) => ({ x: p.x, y: p.y, z: p.z }));
  if (pts.length === 0) pts.push({ x: 0, y: 0, z: 0 });
  if (pts.length === 1) pts.push({ ...pts[0] });
  const cum = [0];
  let maxSin = 0;
  for (let k = 1; k < pts.length; k++) {
    const a = pts[k - 1];
    const b = pts[k];
    const d = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
    cum.push(cum[k - 1] + d);
    if (d > 1e-9) maxSin = Math.max(maxSin, Math.abs(b.y - a.y) / d);
  }
  return { pts, cum, length: cum[cum.length - 1], maxSin };
}

/** The point at arc length `s` (clamped). */
export function pathPoint(p: Path, s: number, out: V3 = { x: 0, y: 0, z: 0 }): V3 {
  const { pts, cum } = p;
  if (s <= 0) return copy(pts[0], out);
  if (s >= p.length) return copy(pts[pts.length - 1], out);
  let k = 1;
  while (k < pts.length - 1 && cum[k] < s) k++;
  const span = cum[k] - cum[k - 1];
  const u = span > 0 ? Math.max(0, Math.min(1, (s - cum[k - 1]) / span)) : 1;
  const a = pts[k - 1];
  const b = pts[k];
  out.x = a.x + (b.x - a.x) * u;
  out.y = a.y + (b.y - a.y) * u;
  out.z = a.z + (b.z - a.z) * u;
  return out;
}

function copy(a: V3, out: V3): V3 {
  out.x = a.x;
  out.y = a.y;
  out.z = a.z;
  return out;
}

/**
 * A trapezoid profile covering `dist` in `dur` seconds with `ramp` seconds of constant acceleration at each end:
 * peak speed = dist / (dur − ramp). Returns the distance covered after `t` (monotonic, continuous).
 */
export function trapezoid(dist: number, dur: number, ramp: number, t: number): number {
  if (dist <= 0 || dur <= 0) return t >= dur ? dist : 0;
  const r = Math.max(0, Math.min(ramp, dur / 2));
  const v = dist / (dur - r);
  if (t <= 0) return 0;
  if (t >= dur) return dist;
  if (r <= 0) return v * t;
  const a = v / r;
  if (t < r) return 0.5 * a * t * t;
  if (t > dur - r) return dist - 0.5 * a * (dur - t) * (dur - t);
  return 0.5 * v * r + v * (t - r);
}

/** The peak speed of a trapezoid profile. */
export function trapezoidPeak(dist: number, dur: number, ramp: number): number {
  const r = Math.max(0, Math.min(ramp, dur / 2));
  return dur - r > 0 ? dist / (dur - r) : Infinity;
}

/**
 * The shortest duration (≥ `want`) for which a trapezoid over `dist` with `ramp` keeps its peak at or under `vmax`.
 */
export function durationFor(dist: number, want: number, ramp: number, vmax: number): number {
  if (dist <= 0) return Math.max(0, want);
  const need = dist / vmax + ramp;
  return Math.max(want, need, 2 * ramp);
}
