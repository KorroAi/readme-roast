// The world grid of the first-person hybrid (W1-LEAD §1: "bevelled 0.5 m voxel stone"). Every world module speaks
// metres in the RingWorld frame (x and z 0..64 across the footprint, y up, negative below the surface); voxels are
// 0.5 m cubes, so voxel (i, j, k) spans [i·0.5, i·0.5 + 0.5) on each axis and world y = j·0.5.
//
// CONTRACT (W1, 1B, published at 0:45): VOXEL and the ring dimensions are the seam for 1C (mesher, ChunkRenderer), 1E
// (the light volume's origin and scale) and 1D (the walkability grid's cell).

/** Metres per voxel. */
export const VOXEL = 0.5;
/** Voxels per metre. */
export const PER_M = 1 / VOXEL;
/** The footprint every node fits in (m, SPEC §4.10). */
export const FOOTPRINT_M = 64;
/** The ring window in voxels: 128 x 192 x 128 (64 x 96 x 64 m); y is a ring of 6 slabs of 16 m (32 voxel rows). */
export const RING_SX = 128;
export const RING_SZ = 128;
export const SLAB_M = 16;
export const SLAB_ROWS = SLAB_M * PER_M;
export const SLOTS = 6;
export const RING_SY = SLAB_ROWS * SLOTS;
/** Live slabs relative to the focus slab (the player's): 1 above, 3 below; one slot is always the dead barrier. */
export const LIVE_ABOVE = 1;
export const LIVE_BELOW = 3;
/** Chunk edge in voxels (16 voxels = 8 m). */
export const CHUNK = 16;

/** The voxel index holding world coordinate m (any axis). */
export const vox = (m: number): number => Math.floor(m * PER_M + 1e-9);
/** The world coordinate (m) of voxel index i's low face. */
export const met = (i: number): number => i * VOXEL;
/** The world centre (m) of voxel index i. */
export const mid = (i: number): number => (i + 0.5) * VOXEL;

/** The slab holding world y (m): slab k spans y in [-16k - 16, -16k). The sky (y >= 0) is slab -1. */
export const slabOfY = (y: number): number => Math.floor(-y / SLAB_M - 1e-9);
/** World y (m) of slab k's top (its rows span [top - 16, top)). */
export const slabTopY = (k: number): number => -SLAB_M * k;
/** The storage slot of slab k. */
export const slotOfSlab = (k: number): number => (((-k - 1) % SLOTS) + SLOTS) % SLOTS;
/** Storage row of voxel row j (world y = j·0.5). */
export const storageRow = (j: number): number => ((j % RING_SY) + RING_SY) % RING_SY;

/** A world point or direction in metres (the render seam's Vec3). */
export interface V3 {
  x: number;
  y: number;
  z: number;
}

/** An axis-aligned box in metres (min inclusive, max exclusive on the voxel grid). */
export interface Box3 {
  min: V3;
  max: V3;
}

export const v3 = (x: number, y: number, z: number): V3 => ({ x, y, z });

/** The light volume as the shaders sample it (W1-LEAD §5, the 1B ↔ 1E seam): world metres → texture coordinates
 *  uvw = (p - origin) / (scale · size), with the y axis wrapping (RepeatWrapping) because the window is a ring. */
export interface LightVolumeInfo {
  /** World position (m) of texel (0, 0, 0)'s low corner. */
  origin: V3;
  /** Metres per texel (= VOXEL). */
  scale: number;
  /** Texels per axis. */
  size: [number, number, number];
  /** y wraps (the ring); x and z clamp. */
  wrapY: true;
  /** RGB = emitted light (0..255 → linear 0..LIGHT_GAIN), A = openness (how open the surrounding space is). */
  layout: 'rgba8';
}

export const LIGHT_VOLUME: LightVolumeInfo = {
  origin: { x: 0, y: 0, z: 0 },
  scale: VOXEL,
  size: [RING_SX, RING_SY, RING_SZ],
  wrapY: true,
  layout: 'rgba8',
};
