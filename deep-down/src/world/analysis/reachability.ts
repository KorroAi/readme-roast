import { SOLID } from '../../config/blocks';
import type { VoxelWorld } from '../VoxelWorld';

/**
 * Walkability analysis used by world-generation tests and debug tools.
 * A cell is standable when the explorer (2 blocks tall) fits and there is ground below.
 * Moves: walk to a 4-neighbor at the same height, step up 1 (auto-step), or drop down
 * at most `maxDrop` blocks (a safe fall).
 */
export function standable(w: VoxelWorld, x: number, y: number, z: number): boolean {
  return !SOLID[w.get(x, y, z)] && !SOLID[w.get(x, y + 1, z)] && SOLID[w.get(x, y - 1, z)] === 1;
}

/**
 * @param links optional rides (world/gen/features: the hoist, the rift rope): standing on one end's
 * cell reaches the other end's cell. Ends are feet positions (cell = floor of each coordinate).
 */
export function reachableCells(
  w: VoxelWorld,
  sx: number,
  sy: number,
  sz: number,
  maxDrop = 3,
  links?: ReadonlyArray<{ top: readonly number[]; bottom: readonly number[] }>,
  /** Highest ledge climbed in one go (1: the auto-step; 2 with the Grip Boots' jump). */
  stepUp = 1,
): Uint8Array {
  const seen = new Uint8Array(w.sx * w.sy * w.sz);
  const queue: number[] = [];
  const jump = new Map<number, number[]>();
  for (const l of links ?? []) {
    const a = w.index(Math.floor(l.top[0]), Math.floor(l.top[1]), Math.floor(l.top[2]));
    const b = w.index(Math.floor(l.bottom[0]), Math.floor(l.bottom[1]), Math.floor(l.bottom[2]));
    jump.set(a, [...(jump.get(a) ?? []), b]);
    jump.set(b, [...(jump.get(b) ?? []), a]);
  }
  let y0 = sy;
  while (y0 > 1 && !standable(w, sx, y0, sz)) y0--;
  if (!standable(w, sx, y0, sz)) return seen;
  const push = (x: number, y: number, z: number) => {
    const i = w.index(x, y, z);
    if (seen[i]) return;
    seen[i] = 1;
    queue.push(i);
  };
  push(sx, y0, sz);
  const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  while (queue.length) {
    const i = queue.pop()!;
    const z = Math.floor(i / (w.sx * w.sy));
    const y = Math.floor(i / w.sx) % w.sy;
    const x = i % w.sx;
    const ride = jump.get(i);
    if (ride) for (const j of ride) if (!seen[j]) {
      seen[j] = 1;
      queue.push(j);
    }
    for (const [dx, dz] of dirs) {
      const nx = x + dx;
      const nz = z + dz;
      if (!w.inBounds(nx, y, nz)) continue;
      if (standable(w, nx, y, nz)) push(nx, y, nz);
      // Step (or jump) up: needs headroom above the current cell all the way.
      for (let up = 1; up <= stepUp; up++) {
        if (SOLID[w.get(x, y + 1 + up, z)]) break;
        if (standable(w, nx, y + up, nz)) {
          push(nx, y + up, nz);
          break;
        }
      }
      // Drop down into the neighbor column.
      if (!SOLID[w.get(nx, y, nz)] && !SOLID[w.get(nx, y + 1, nz)]) {
        for (let d = 1; d <= maxDrop; d++) {
          if (SOLID[w.get(nx, y - d, nz)]) break;
          if (standable(w, nx, y - d, nz)) {
            push(nx, y - d, nz);
            break;
          }
        }
      }
    }
  }
  return seen;
}

/** Is any reachable standable cell within `radius` (horizontal) and 2 levels of (x,y,z)? */
export function nearReachable(w: VoxelWorld, seen: Uint8Array, x: number, y: number, z: number, radius = 1, levels = 2): boolean {
  for (let dy = -levels; dy <= levels; dy++)
    for (let dz = -radius; dz <= radius; dz++)
      for (let dx = -radius; dx <= radius; dx++) {
        const xx = Math.floor(x) + dx;
        const yy = Math.floor(y) + dy;
        const zz = Math.floor(z) + dz;
        if (w.inBounds(xx, yy, zz) && seen[w.index(xx, yy, zz)]) return true;
      }
  return false;
}

/** Count voxels of `id` whose center is within `reach` of a reachable cell's chest height. */
export function minableCount(w: VoxelWorld, seen: Uint8Array, id: number, reach = 4.2): number {
  let count = 0;
  const r = Math.ceil(reach);
  for (let i = 0; i < w.blocks.length; i++) {
    if (w.blocks[i] !== id) continue;
    const z = Math.floor(i / (w.sx * w.sy));
    const y = Math.floor(i / w.sx) % w.sy;
    const x = i % w.sx;
    let ok = false;
    for (let dy = -r; dy <= r && !ok; dy++)
      for (let dz = -r; dz <= r && !ok; dz++)
        for (let dx = -r; dx <= r && !ok; dx++) {
          const xx = x + dx;
          const yy = y + dy;
          const zz = z + dz;
          if (!w.inBounds(xx, yy, zz) || !seen[w.index(xx, yy, zz)]) continue;
          if (Math.hypot(dx, dy - 1.3, dz) <= reach) ok = true;
        }
    if (ok) count++;
  }
  return count;
}
