// The Lantern Voxel render grid (W1-LEAD §1). 1B's world stores 0.5 m voxels (src/world/hybrid/grid.ts VOXEL), the size
// of the director's chunky stone blocks, so the surface is drawn on the world's own grid: one stone block per voxel.
// Light, picking, walking and the drawn surface agree to the centimetre (irregular silhouettes, missing corner blocks
// and ledges are authored in the world by 1B's kits and stamping, never faked by the renderer).
//
// Pure (no Three.js), shared by the mesher and its worker.

/** World voxel size (m) = the render block. */
export const CELL = 0.5;
/** Padding of the input block in voxels (mesher.ts copyPadded: 2), the chunk edge and the padded edge (20). */
export const RPAD = 2;
export const RCHUNK = 16;
export const RP = RCHUNK + 2 * RPAD;

/** 32-bit hash of up to four integers (deterministic, no state). */
export function hash4(a: number, b = 0, c = 0, d = 0): number {
  let h = Math.imul(a | 0, 0x27d4eb2d) ^ Math.imul(b | 0, 0x165667b1) ^ Math.imul(c | 0, 0x9e3779b1) ^ Math.imul(d | 0, 0x85ebca77);
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d);
  h ^= h >>> 12;
  h = Math.imul(h, 0x297a2d39);
  h ^= h >>> 15;
  return h >>> 0;
}
export const hashf = (a: number, b = 0, c = 0, d = 0): number => hash4(a, b, c, d) / 4294967296;
