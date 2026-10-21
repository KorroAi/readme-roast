import type { FeatureLink, V3 } from '../world/gen/features/types';

/**
 * A ride along a feature link (the Halden hoist, the rope down to the rift floor): the explorer
 * follows the link's polyline at its speed, easing in over the first metres and out over the last
 * (constant acceleration over EASE_M at each end), so the start and the stop have weight and the
 * position is continuous and its arc length never runs backwards. Pure: game/WorldFeatures owns
 * the explorer and the camera while a ride runs.
 */
export const EASE_M = 0.6;

export interface Ride {
  id: FeatureLink['id'];
  kind: FeatureLink['kind'];
  dir: 'up' | 'down';
  /** The polyline in travel order, and the arc length at each of its points. */
  pts: V3[];
  cum: number[];
  length: number;
  /** Cruise speed (m/s) and the easing distance actually used (shorter on a very short ride). */
  speed: number;
  ease: number;
  /** Total duration (s) and the time elapsed. */
  duration: number;
  t: number;
}

export function createRide(link: Pick<FeatureLink, 'id' | 'kind' | 'path' | 'speedDown' | 'speedUp'>, dir: 'up' | 'down'): Ride {
  const pts = (dir === 'down' ? link.path : [...link.path].reverse()).map((p) => [p[0], p[1], p[2]] as V3);
  const cum = [0];
  for (let k = 1; k < pts.length; k++) cum.push(cum[k - 1] + Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1], pts[k][2] - pts[k - 1][2]));
  const length = cum[cum.length - 1];
  const speed = Math.max(0.1, dir === 'down' ? link.speedDown : link.speedUp);
  const ease = Math.min(EASE_M, length / 2);
  return { id: link.id, kind: link.kind, dir, pts, cum, length, speed, ease, duration: rideDuration(length, speed, ease), t: 0 };
}

/** Seconds a ride of `length` takes at `speed` with `ease` metres of constant acceleration at each end. */
export function rideDuration(length: number, speed: number, ease = Math.min(EASE_M, length / 2)): number {
  return (length + 2 * ease) / speed;
}

/** Arc length travelled after `t` seconds. */
export function rideDistance(r: Ride, t: number): number {
  const T = r.duration;
  const v = r.speed;
  const ta = (2 * r.ease) / v;
  if (t <= 0) return 0;
  if (t >= T) return r.length;
  const a = ta > 0 ? v / ta : 0;
  if (t < ta) return 0.5 * a * t * t;
  if (t > T - ta) return r.length - 0.5 * a * (T - t) * (T - t);
  return r.ease + v * (t - ta);
}

/** The feet position at arc length `s`. */
export function ridePoint(r: Ride, s: number, out: { x: number; y: number; z: number } = { x: 0, y: 0, z: 0 }): { x: number; y: number; z: number } {
  const { pts, cum } = r;
  let k = 1;
  while (k < pts.length - 1 && cum[k] < s) k++;
  const span = cum[k] - cum[k - 1];
  const u = span > 0 ? Math.max(0, Math.min(1, (s - cum[k - 1]) / span)) : 1;
  const a = pts[k - 1];
  const b = pts[k];
  out.x = a[0] + (b[0] - a[0]) * u;
  out.y = a[1] + (b[1] - a[1]) * u;
  out.z = a[2] + (b[2] - a[2]) * u;
  return out;
}

export interface RideStep {
  x: number;
  y: number;
  z: number;
  done: boolean;
}

/** Advance the ride by dt seconds. @returns the explorer's feet position (in a reused object). */
export function stepRide(r: Ride, dt: number, out: RideStep = { x: 0, y: 0, z: 0, done: false }): RideStep {
  r.t = Math.min(r.duration, r.t + Math.max(0, dt));
  ridePoint(r, rideDistance(r, r.t), out);
  out.done = r.t >= r.duration;
  return out;
}

/** The stand the ride ends on. */
export function rideEnd(r: Ride): V3 {
  return r.pts[r.pts.length - 1];
}

/** A ride as an edge of the walking fields (world/analysis/homeField): stand cell to stand cell, in field steps. */
export interface RideEdge {
  from: [number, number, number];
  to: [number, number, number];
  cost: number;
}

/**
 * The rides as walking-field edges: a rope both ways; a hoist chained from below always up (using
 * it from the bottom releases it), and down once released. `stepsPerSecond` turns ride seconds into
 * field steps (config/balance RIDES.stepsPerSecond).
 */
export function rideEdges(links: readonly FeatureLink[], hoistReleased: boolean, stepsPerSecond: number): RideEdge[] {
  const cell = (p: V3): [number, number, number] => [Math.floor(p[0]), Math.floor(p[1]), Math.floor(p[2])];
  const out: RideEdge[] = [];
  for (const l of links) {
    out.push({ from: cell(l.bottom), to: cell(l.top), cost: createRide(l, 'up').duration * stepsPerSecond });
    if (l.lock !== 'releaseAtBottom' || hoistReleased) out.push({ from: cell(l.top), to: cell(l.bottom), cost: createRide(l, 'down').duration * stepsPerSecond });
  }
  return out;
}
