import { SOLID } from '../../config/blocks';
import { EYE_HEIGHT, REACH as FP_REACH } from '../../game/fp/constants';
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

/**
 * Count voxels of `id` the explorer can mine from a reachable cell: the voxel's centre within
 * `reach` of the eye (first person: game/fp/constants, 1.62 m over the feet, 3.5 m from the eye).
 * The reachable set is dilated once into a mask of minable voxels, so a common block (slate) costs
 * no more than a rare one.
 */
export function minableCount(w: VoxelWorld, seen: Uint8Array, id: number, reach = FP_REACH): number {
  // Offsets (voxel - feet cell) whose centre is within reach of that cell's eye.
  const r = Math.ceil(reach);
  const offs: number[] = [];
  for (let dy = -r; dy <= r + 2; dy++)
    for (let dz = -r; dz <= r; dz++)
      for (let dx = -r; dx <= r; dx++) if (Math.hypot(dx, dy - (EYE_HEIGHT - 0.5), dz) <= reach) offs.push(dx, dy, dz);
  const mask = new Uint8Array(w.blocks.length);
  const sxy = w.sx * w.sy;
  for (let i = 0; i < seen.length; i++) {
    if (!seen[i]) continue;
    const z = Math.floor(i / sxy);
    const y = Math.floor(i / w.sx) % w.sy;
    const x = i % w.sx;
    for (let k = 0; k < offs.length; k += 3) {
      const vx = x + offs[k];
      const vy = y + offs[k + 1];
      const vz = z + offs[k + 2];
      if (w.inBounds(vx, vy, vz)) mask[w.index(vx, vy, vz)] = 1;
    }
  }
  let count = 0;
  for (let i = 0; i < w.blocks.length; i++) if (mask[i] && w.blocks[i] === id) count++;
  return count;
}
