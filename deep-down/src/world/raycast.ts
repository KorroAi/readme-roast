import type { VoxelWorld } from './VoxelWorld';
import { SOLID } from '../config/blocks';

export interface VoxelHit {
  x: number;
  y: number;
  z: number;
  /** Face normal of the entered face (points back toward the ray origin). */
  nx: number;
  ny: number;
  nz: number;
  /** Distance along the (normalized) ray to the entry point. */
  distance: number;
  block: number;
}

/**
 * Amanatides & Woo voxel traversal. Returns the first solid voxel within maxDist.
 * Direction need not be normalized; distance is reported in world units.
 */
export function raycastVoxels(
  world: VoxelWorld,
  ox: number,
  oy: number,
  oz: number,
  dx: number,
  dy: number,
  dz: number,
  maxDist: number,
  solidTable: Uint8Array = SOLID,
): VoxelHit | null {
  const len = Math.hypot(dx, dy, dz);
  if (len < 1e-9) return null;
  dx /= len;
  dy /= len;
  dz /= len;

  let x = Math.floor(ox);
  let y = Math.floor(oy);
  let z = Math.floor(oz);
  const stepX = dx > 0 ? 1 : -1;
  const stepY = dy > 0 ? 1 : -1;
  const stepZ = dz > 0 ? 1 : -1;
  const tDeltaX = dx !== 0 ? Math.abs(1 / dx) : Infinity;
  const tDeltaY = dy !== 0 ? Math.abs(1 / dy) : Infinity;
  const tDeltaZ = dz !== 0 ? Math.abs(1 / dz) : Infinity;
  let tMaxX = dx !== 0 ? (dx > 0 ? x + 1 - ox : ox - x) * tDeltaX : Infinity;
  let tMaxY = dy !== 0 ? (dy > 0 ? y + 1 - oy : oy - y) * tDeltaY : Infinity;
  let tMaxZ = dz !== 0 ? (dz > 0 ? z + 1 - oz : oz - z) * tDeltaZ : Infinity;
  let nx = 0;
  let ny = 0;
  let nz = 0;
  let t = 0;

  // The origin voxel itself counts (e.g. camera clipped into a wall).
  for (let i = 0; i < 1024; i++) {
    const id = world.get(x, y, z);
    if (solidTable[id]) return { x, y, z, nx, ny, nz, distance: t, block: id };
    if (tMaxX < tMaxY && tMaxX < tMaxZ) {
      t = tMaxX;
      if (t > maxDist) return null;
      x += stepX;
      tMaxX += tDeltaX;
      nx = -stepX;
      ny = 0;
      nz = 0;
    } else if (tMaxY < tMaxZ) {
      t = tMaxY;
      if (t > maxDist) return null;
      y += stepY;
      tMaxY += tDeltaY;
      nx = 0;
      ny = -stepY;
      nz = 0;
    } else {
      t = tMaxZ;
      if (t > maxDist) return null;
      z += stepZ;
      tMaxZ += tDeltaZ;
      nx = 0;
      ny = 0;
      nz = -stepZ;
    }
  }
  return null;
}
