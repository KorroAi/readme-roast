// Explore's walk planning (W1-LEAD §3), pure: a tapped world point becomes a floor destination on the walkability grid
// (1B's `world/hybrid/nav.ts`), a BFS path from 1B's `findPath`, then a path the camera can walk: string-pulled where
// the straight line stays walkable, corners rounded (Chaikin), the eye 1.6 m above the floor with steps of up to
// 0.5 m blended along the arc length (no stair-stepping, no bob), and an action's walk cut 0.9 m short of its target.
//
// The grid is reached only through `NavLike`, the slice of nav.ts this needs, so the planner is tested in Node with a
// hand-made grid and 1B's module plugs in unchanged.

import { EYE_HEIGHT } from './lens';
import type { V3 } from './ropeRide';

/** The slice of 1B's walkability grid the planner uses (feet points: world m on the floor surface). */
export interface NavLike {
  /** True when a standing body fits at the cell containing this feet point (solid floor under it, headroom above). */
  walkableAt(x: number, y: number, z: number): boolean;
  /**
   * A path of feet points from `from` to `to` over walkable cells (step-ups, ladders and ropes as links), or null when
   * none. The first point is at (or next to) `from`, the last at `to`.
   */
  findPath(from: V3, to: V3): ReadonlyArray<V3> | null;
  /** The grid cell size (m); 0.5 by default. */
  readonly cell?: number;
}

export const WALK = {
  /** A tapped point snaps to the nearest walkable cell within this radius (m). */
  snapM: 2.0,
  /** How far below a tapped point the snap looks first (m): taps on a wall's foot land on the floor below it. */
  snapDownM: 2.5,
  /** Corner rounding passes and the resample step for the eye's height blend (m). */
  chaikin: 2,
  resampleM: 0.25,
  /** The eye's height blend: a moving average over this arc length (m), so a 0.5 m step rises over ~1 m. */
  stepBlendM: 1.0,
  /** A walk whose destination lies closer than this is no walk (m): the tap acts or raises the lantern instead. */
  minWalkM: 0.35,
} as const;

/** The centre of the grid cell containing a coordinate, as a feet point (the floor of that cell). */
function cellCentre(v: number, cell: number): number {
  return (Math.floor(v / cell) + 0.5) * cell;
}

/**
 * The walkable feet point nearest to a world point (a tap's ray hit): first straight down (a floor, the foot of a wall),
 * then outward in rings up to `WALK.snapM`. Null when no floor is near.
 */
export function snapToFloor(nav: NavLike, p: V3, maxR: number = WALK.snapM): V3 | null {
  const c = nav.cell ?? 0.5;
  const x0 = cellCentre(p.x, c);
  const z0 = cellCentre(p.z, c);
  const yTop = Math.floor((p.y + 0.6) / c) * c;
  const below = Math.ceil(WALK.snapDownM / c);
  // Straight down first.
  for (let k = 0; k <= below; k++) {
    const y = yTop - k * c;
    if (nav.walkableAt(x0, y, z0)) return { x: x0, y, z: z0 };
  }
  // Then rings outward (nearest first), each column searched from a little above the point down.
  const rings = Math.ceil(maxR / c);
  let best: V3 | null = null;
  let bd = Infinity;
  for (let r = 1; r <= rings; r++) {
    for (let i = -r; i <= r; i++) {
      for (let j = -r; j <= r; j++) {
        if (Math.max(Math.abs(i), Math.abs(j)) !== r) continue;
        const x = x0 + i * c;
        const z = z0 + j * c;
        for (let k = -1; k <= below; k++) {
          const y = yTop - k * c;
          if (!nav.walkableAt(x, y, z)) continue;
          const d = Math.hypot(x - p.x, (y - p.y) * 0.6, z - p.z);
          if (d < bd && d <= maxR + c) {
            bd = d;
            best = { x, y, z };
          }
          break;
        }
      }
    }
    if (best) return best;
  }
  return best;
}

/** True when every sample of the straight feet line a → b (every ~0.2 m) is walkable and the floor height is steady. */
export function lineWalkable(nav: NavLike, a: V3, b: V3): boolean {
  const c = nav.cell ?? 0.5;
  const d = Math.hypot(b.x - a.x, b.z - a.z);
  if (Math.abs(b.y - a.y) > 0.01) return false;
  const n = Math.max(1, Math.ceil(d / (c * 0.4)));
  for (let i = 1; i < n; i++) {
    const u = i / n;
    // Test the sample and its neighbours across the line's width (a body is ~0.4 m wide).
    const x = a.x + (b.x - a.x) * u;
    const z = a.z + (b.z - a.z) * u;
    if (!nav.walkableAt(x, a.y, z)) return false;
  }
  return true;
}

/** String-pulling: drop every intermediate point the straight line can skip on level ground. */
export function pullString(nav: NavLike, pts: readonly V3[]): V3[] {
  if (pts.length <= 2) return pts.map((p) => ({ ...p }));
  const out: V3[] = [{ ...pts[0] }];
  let i = 0;
  while (i < pts.length - 1) {
    let j = pts.length - 1;
    for (; j > i + 1; j--) if (lineWalkable(nav, pts[i], pts[j])) break;
    out.push({ ...pts[j] });
    i = j;
  }
  return out;
}

/** Chaikin corner cutting on the horizontal plane (the ends stay; vertical links such as ladders are kept sharp). */
export function roundCorners(pts: readonly V3[], passes: number = WALK.chaikin): V3[] {
  let cur = pts.map((p) => ({ ...p }));
  for (let k = 0; k < passes; k++) {
    if (cur.length < 3) break;
    const next: V3[] = [cur[0]];
    for (let i = 0; i < cur.length - 1; i++) {
      const a = cur[i];
      const b = cur[i + 1];
      const steep = Math.abs(b.y - a.y) > 0.6 * Math.max(0.01, Math.hypot(b.x - a.x, b.z - a.z));
      if (steep) {
        if (i > 0) next.push({ ...a });
        if (i < cur.length - 2) next.push({ ...b });
        continue;
      }
      if (i > 0) next.push({ x: a.x * 0.75 + b.x * 0.25, y: a.y * 0.75 + b.y * 0.25, z: a.z * 0.75 + b.z * 0.25 });
      if (i < cur.length - 2) next.push({ x: a.x * 0.25 + b.x * 0.75, y: a.y * 0.25 + b.y * 0.75, z: a.z * 0.25 + b.z * 0.75 });
    }
    next.push(cur[cur.length - 1]);
    cur = dedupe(next);
  }
  return cur;
}

function dedupe(pts: V3[]): V3[] {
  const out: V3[] = [];
  for (const p of pts) {
    const l = out[out.length - 1];
    if (!l || Math.hypot(p.x - l.x, p.y - l.y, p.z - l.z) > 1e-4) out.push(p);
  }
  return out;
}

/** Path length (m). */
export function pathLength(pts: readonly V3[]): number {
  let L = 0;
  for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y, pts[i].z - pts[i - 1].z);
  return L;
}

/** Cut a path so it ends `d` metres (horizontal) short of `target`; never shorter than its start. */
export function stopShort(pts: readonly V3[], target: V3, d: number): V3[] {
  if (pts.length === 0) return [];
  const out: V3[] = [{ ...pts[0] }];
  const hd = (p: V3) => Math.hypot(p.x - target.x, p.z - target.z);
  if (hd(pts[0]) <= d) return out;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    if (hd(b) > d) {
      out.push({ ...b });
      continue;
    }
    // The point on a → b at horizontal distance d from the target (bisection: hd is not linear in u).
    let lo = 0;
    let hi = 1;
    for (let k = 0; k < 24; k++) {
      const m = (lo + hi) / 2;
      const p = { x: a.x + (b.x - a.x) * m, y: a.y + (b.y - a.y) * m, z: a.z + (b.z - a.z) * m };
      if (hd(p) > d) lo = m;
      else hi = m;
    }
    out.push({ x: a.x + (b.x - a.x) * lo, y: a.y + (b.y - a.y) * lo, z: a.z + (b.z - a.z) * lo });
    return out;
  }
  return out;
}

/**
 * Feet path → eye path: resampled every 0.25 m on level runs, the eye `eye` metres above the floor, the floor height
 * blended over ~1 m of arc length so a step of up to 0.5 m reads as a smooth rise. Steep links (ladders, ropes) keep
 * their exact vertical so the ride along them is on rails.
 */
export function eyePath(feet: readonly V3[], eye: number = EYE_HEIGHT): V3[] {
  if (feet.length === 0) return [];
  // Resample.
  const s: Array<V3 & { steep: boolean; arc: number }> = [];
  let arc = 0;
  s.push({ ...feet[0], steep: false, arc: 0 });
  for (let i = 1; i < feet.length; i++) {
    const a = feet[i - 1];
    const b = feet[i];
    const h = Math.hypot(b.x - a.x, b.z - a.z);
    const len = Math.hypot(h, b.y - a.y);
    const steep = Math.abs(b.y - a.y) > 0.6 * Math.max(0.01, len) && Math.abs(b.y - a.y) > 0.55;
    const n = steep ? 1 : Math.max(1, Math.ceil(len / WALK.resampleM));
    for (let k = 1; k <= n; k++) {
      const u = k / n;
      arc += len / n;
      s.push({ x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u, z: a.z + (b.z - a.z) * u, steep, arc });
    }
  }
  // Blend the floor height on non-steep stretches (a centred moving average over stepBlendM of arc).
  const half = WALK.stepBlendM / 2;
  const out: V3[] = [];
  for (let i = 0; i < s.length; i++) {
    const p = s[i];
    let y = p.y;
    if (!p.steep && i > 0 && i < s.length - 1) {
      let sum = 0;
      let w = 0;
      for (let j = i; j >= 0 && p.arc - s[j].arc <= half && !(j < i && s[j + 1].steep); j--) {
        const wt = 1 - (p.arc - s[j].arc) / (half + 1e-6);
        sum += s[j].y * wt;
        w += wt;
      }
      for (let j = i + 1; j < s.length && s[j].arc - p.arc <= half && !s[j].steep; j++) {
        const wt = 1 - (s[j].arc - p.arc) / (half + 1e-6);
        sum += s[j].y * wt;
        w += wt;
      }
      if (w > 0) y = sum / w;
    }
    out.push({ x: p.x, y: y + eye, z: p.z });
  }
  return dedupe(out);
}

/** A planned walk: the eye path the camera walks and where its feet end. */
export interface WalkPlan {
  eye: V3[];
  /** The floor point it ends on. */
  end: V3;
  /** Metres to walk. */
  length: number;
}

/**
 * Plan a walk from the eye at `eyeAt` to the floor point nearest `goal` (a tapped point or an object). With `actOn`,
 * the walk stops 0.9 m short of that object. Null when the goal has no reachable floor or is too close to be a walk.
 */
export function planWalk(nav: NavLike, eyeAt: V3, goal: V3, opts: { actOn?: V3; stopShortM?: number; eye?: number } = {}): WalkPlan | null {
  const eye = opts.eye ?? EYE_HEIGHT;
  const feet = snapToFloor(nav, { x: eyeAt.x, y: eyeAt.y - eye + 0.25, z: eyeAt.z }, 1.0) ?? { x: eyeAt.x, y: eyeAt.y - eye, z: eyeAt.z };
  const dest = snapToFloor(nav, goal);
  if (!dest) return null;
  const raw = nav.findPath(feet, dest);
  if (!raw || raw.length === 0) return null;
  let pts: V3[] = [{ x: eyeAt.x, y: feet.y, z: eyeAt.z }, ...raw.slice(1).map((p) => ({ x: p.x, y: p.y, z: p.z }))];
  if (raw.length === 1) pts.push({ ...raw[0] });
  pts = roundCorners(pullString(nav, pts));
  if (opts.actOn) pts = stopShort(pts, opts.actOn, opts.stopShortM ?? 0.9);
  const length = pathLength(pts);
  if (length < WALK.minWalkM) return null;
  const e = eyePath(pts, eye);
  return { eye: e.slice(1), end: pts[pts.length - 1], length };
}
