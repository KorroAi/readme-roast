/**
 * How the creatures move through the voxel world without ever entering rock or floating:
 * walkers keep their feet on a floor cell (stepping up or down one block, falling otherwise),
 * crawlers cling cell by cell to any rock face (floors, walls, ceilings), fliers refuse every move
 * into rock axis by axis. Pure functions over a `solid` query, unit-tested on small worlds.
 */
export type SolidFn = (x: number, y: number, z: number) => boolean;

export interface V3 {
  x: number;
  y: number;
  z: number;
}

const f = Math.floor;

/** A walker of `height` cells can stand with its feet in cell (x, y, z). */
export function standableFor(solid: SolidFn, x: number, y: number, z: number, height: number): boolean {
  if (!solid(x, y - 1, z)) return false;
  for (let k = 0; k < height; k++) if (solid(x, y + k, z)) return false;
  return true;
}

/** The feet cell y of the floor at column (x, z) within one step of y (up 1, level, down to `drop`), or null. */
export function floorNear(solid: SolidFn, x: number, y: number, z: number, height: number, drop = 3): number | null {
  if (standableFor(solid, x, y, z, height)) return y;
  if (standableFor(solid, x, y + 1, z, height)) return y + 1;
  for (let d = 1; d <= drop; d++) if (standableFor(solid, x, y - d, z, height)) return y - d;
  return null;
}

/**
 * Move a walker's feet by (vx, vz) * dt with collision: a move into a column with no floor within a
 * step (a wall, a drop deeper than `drop`) is refused axis by axis. The feet's y eases to the floor.
 * @returns true when the move was (partly) blocked.
 */
export function walkStep(solid: SolidFn, foot: V3, vx: number, vz: number, dt: number, height: number, radius: number, drop = 2): boolean {
  let blocked = false;
  const cy = f(foot.y + 0.01);
  const tryMove = (nx: number, nz: number): boolean => {
    // Probe a little ahead (the body's radius) so a big body never pokes into a wall.
    const px = nx + Math.sign(nx - foot.x) * radius * 0.8;
    const pz = nz + Math.sign(nz - foot.z) * radius * 0.8;
    const fy = floorNear(solid, f(px), cy, f(pz), height, drop);
    const fy2 = floorNear(solid, f(nx), cy, f(nz), height, drop);
    if (fy === null || fy2 === null) return false;
    foot.x = nx;
    foot.z = nz;
    return true;
  };
  const nx = foot.x + vx * dt;
  const nz = foot.z + vz * dt;
  if (!tryMove(nx, nz)) {
    blocked = true;
    if (!tryMove(nx, foot.z)) tryMove(foot.x, nz);
  }
  const fy = floorNear(solid, f(foot.x), cy, f(foot.z), height, 6);
  if (fy !== null) {
    // Ease the feet onto the floor: up a step quickly, down a little slower (a short fall).
    const k = Math.min(1, dt * (fy > foot.y ? 14 : 9));
    foot.y += (fy - foot.y) * k;
    if (Math.abs(fy - foot.y) < 0.01) foot.y = fy;
  }
  return blocked;
}

/** An open cell touching rock by a face or an edge: a crawler can cling there (and wrap round edges). */
export function clingable(solid: SolidFn, x: number, y: number, z: number): boolean {
  if (solid(x, y, z)) return false;
  for (let dz = -1; dz <= 1; dz++)
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        const n = (dx ? 1 : 0) + (dy ? 1 : 0) + (dz ? 1 : 0);
        if (n === 0 || n === 3) continue;
        if (solid(x + dx, y + dy, z + dz)) return true;
      }
  return false;
}

/** The way out of the rock at an open cell (unit length; up when there is no rock round it). */
export function surfaceNormal(solid: SolidFn, x: number, y: number, z: number, out: V3): V3 {
  let nx = 0;
  let ny = 0;
  let nz = 0;
  for (let dz = -1; dz <= 1; dz++)
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy && !dz) continue;
        if (!solid(x + dx, y + dy, z + dz)) continue;
        const w = 1 / (dx * dx + dy * dy + dz * dz);
        nx -= dx * w;
        ny -= dy * w;
        nz -= dz * w;
      }
  const l = Math.hypot(nx, ny, nz);
  if (l < 1e-6) {
    out.x = 0;
    out.y = 1;
    out.z = 0;
  } else {
    out.x = nx / l;
    out.y = ny / l;
    out.z = nz / l;
  }
  return out;
}

/** Contact with rock (how many of the 6 faces of the cell touch it). */
export function contact(solid: SolidFn, x: number, y: number, z: number): number {
  return (solid(x - 1, y, z) ? 1 : 0) + (solid(x + 1, y, z) ? 1 : 0) + (solid(x, y - 1, z) ? 1 : 0) + (solid(x, y + 1, z) ? 1 : 0) + (solid(x, y, z - 1) ? 1 : 0) + (solid(x, y, z + 1) ? 1 : 0);
}

/**
 * The crawler's next cell from `c` toward `goal`: one of the 26 neighbours that is clingable and not
 * across a rock edge, scored by distance to the goal plus `cost(x, y, z)` (light, the explorer)
 * plus `jitter` (0..1 per call). @returns false when no neighbour is open.
 */
export function crawlNext(solid: SolidFn, c: V3, goal: V3, out: V3, cost: (x: number, y: number, z: number) => number, jitter: () => number, away = false): boolean {
  let best = Infinity;
  let found = false;
  const cx = c.x;
  const cy = c.y;
  const cz = c.z;
  for (let dz = -1; dz <= 1; dz++)
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy && !dz) continue;
        const x = cx + dx;
        const y = cy + dy;
        const z = cz + dz;
        if (!clingable(solid, x, y, z)) continue;
        // Never across an edge of rock: every cell the diagonal passes by must be open.
        const n = (dx ? 1 : 0) + (dy ? 1 : 0) + (dz ? 1 : 0);
        if (n > 1 && !diagonalClear(solid, cx, cy, cz, dx, dy, dz)) continue;
        const d = Math.hypot(x + 0.5 - goal.x, y + 0.5 - goal.y, z + 0.5 - goal.z);
        const s = (away ? -d : d) + cost(x, y, z) + jitter() * 0.6 + (n - 1) * 0.08 - contact(solid, x, y, z) * 0.05;
        if (s < best) {
          best = s;
          out.x = x;
          out.y = y;
          out.z = z;
          found = true;
        }
      }
  return found;
}

/** Every cell of the box between a cell and its diagonal neighbour (but the two) is open. */
function diagonalClear(solid: SolidFn, x: number, y: number, z: number, dx: number, dy: number, dz: number): boolean {
  for (const ix of dx ? [0, dx] : [0])
    for (const iy of dy ? [0, dy] : [0])
      for (const iz of dz ? [0, dz] : [0]) {
        if ((ix === 0 && iy === 0 && iz === 0) || (ix === dx && iy === dy && iz === dz)) continue;
        if (solid(x + ix, y + iy, z + iz)) return false;
      }
  return true;
}

/** Move a flier by v * dt, refusing (and damping) any axis that would bring its body into rock. */
export function flyStep(solid: SolidFn, p: V3, v: V3, dt: number, radius: number): void {
  const r = Math.min(0.45, radius);
  const clear = (x: number, y: number, z: number) => !solid(f(x), f(y), f(z)) && !solid(f(x + r), f(y), f(z)) && !solid(f(x - r), f(y), f(z)) && !solid(f(x), f(y + r), f(z)) && !solid(f(x), f(y - r), f(z)) && !solid(f(x), f(y), f(z + r)) && !solid(f(x), f(y), f(z - r));
  const nx = p.x + v.x * dt;
  if (clear(nx, p.y, p.z)) p.x = nx;
  else v.x *= -0.3;
  const ny = p.y + v.y * dt;
  if (clear(p.x, ny, p.z)) p.y = ny;
  else v.y *= -0.3;
  const nz = p.z + v.z * dt;
  if (clear(p.x, p.y, nz)) p.z = nz;
  else v.z *= -0.3;
}

/** Height of open air above a point (cells, up to `max`). */
export function headroom(solid: SolidFn, x: number, y: number, z: number, max = 8): number {
  let n = 0;
  while (n < max && !solid(f(x), f(y) + n, f(z))) n++;
  return n;
}

/** Straight line between two points through open cells only (a voxel walk, 0.25 m steps). */
export function clearLine(solid: SolidFn, a: V3, b: V3): boolean {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const dz = b.z - a.z;
  const len = Math.hypot(dx, dy, dz);
  const n = Math.max(1, Math.ceil(len / 0.25));
  for (let i = 1; i < n; i++) {
    const k = i / n;
    if (solid(f(a.x + dx * k), f(a.y + dy * k), f(a.z + dz * k))) return false;
  }
  return true;
}
