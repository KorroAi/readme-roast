import { SOLID } from '../config/blocks';
import type { VoxelWorld } from '../world/VoxelWorld';
import { raycastVoxels } from '../world/raycast';

/**
 * Touch aim assist: with no finger on the world, the Mine button works on the block the
 * explorer is obviously facing. The camera's centre ray wins when it lands on something
 * minable in reach; otherwise this picks the exposed, minable block in reach that is closest
 * to the view direction, with a clear line from the hand (never through a wall).
 */
export interface AssistHit {
  x: number;
  y: number;
  z: number;
  /** Face of the block that looks at the hand. */
  nx: number;
  ny: number;
  nz: number;
  block: number;
}

/** Widest angle from the view direction a target may sit at (cos 62°). */
export const ASSIST_MIN_DOT = 0.47;

const FACES: ReadonlyArray<readonly [number, number, number]> = [
  [1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1],
];

/**
 * @param hand  where the pick is held (reach is measured from here to block centres)
 * @param dir   unit view direction (the camera's centre ray)
 * @param score extra preference per block id (e.g. negative for blocks the pick is too weak for);
 *              return null to exclude a block
 */
export function assistTarget(
  world: VoxelWorld,
  hx: number,
  hy: number,
  hz: number,
  dx: number,
  dy: number,
  dz: number,
  reach: number,
  score: (id: number) => number | null,
): AssistHit | null {
  const r = Math.ceil(reach);
  const bx = Math.floor(hx);
  const by = Math.floor(hy);
  const bz = Math.floor(hz);
  let best: AssistHit | null = null;
  let bestScore = -Infinity;
  for (let z = bz - r; z <= bz + r; z++)
    for (let y = by - r; y <= by + r; y++)
      for (let x = bx - r; x <= bx + r; x++) {
        const id = world.get(x, y, z);
        if (!SOLID[id]) continue;
        const extra = score(id);
        if (extra === null) continue;
        const vx = x + 0.5 - hx;
        const vy = y + 0.5 - hy;
        const vz = z + 0.5 - hz;
        const d = Math.hypot(vx, vy, vz);
        if (d > reach || d < 1e-6) continue;
        const dot = (vx * dx + vy * dy + vz * dz) / d;
        if (dot < ASSIST_MIN_DOT) continue;
        // The open face that looks most toward the hand.
        let face = -1;
        let faceDot = 0;
        for (let f = 0; f < 6; f++) {
          const [fx, fy, fz] = FACES[f];
          if (SOLID[world.get(x + fx, y + fy, z + fz)]) continue;
          const fd = -(fx * vx + fy * vy + fz * vz);
          if (fd > faceDot) {
            faceDot = fd;
            face = f;
          }
        }
        if (face < 0) continue;
        const s = dot * 2 - d * 0.35 + extra;
        if (s <= bestScore) continue;
        // Line of sight from the hand to that face: the first solid cell must be this block.
        const [fx, fy, fz] = FACES[face];
        const tx = x + 0.5 + fx * 0.5 - hx;
        const ty = y + 0.5 + fy * 0.5 - hy;
        const tz = z + 0.5 + fz * 0.5 - hz;
        const len = Math.hypot(tx, ty, tz);
        const hit = raycastVoxels(world, hx, hy, hz, tx / len, ty / len, tz / len, len + 0.6);
        if (!hit || hit.x !== x || hit.y !== y || hit.z !== z) continue;
        bestScore = s;
        best = { x, y, z, nx: fx, ny: fy, nz: fz, block: id };
      }
  return best;
}
