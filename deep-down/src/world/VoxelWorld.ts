import { B, SOLID } from '../config/blocks';

/**
 * Dense voxel storage for one bounded world volume (one byte per voxel).
 *
 * Layout: index = x + sx * (y + sy * z). This matches the 3D light texture layout
 * (width = X, height = Y, depth = Z) so light can be uploaded without reordering.
 *
 * Out-of-bounds reads return BEDROCK, so the world is sealed and nothing can fall out.
 */
export class VoxelWorld {
  readonly sx: number;
  readonly sy: number;
  readonly sz: number;
  readonly chunkSize: number;
  readonly cx: number;
  readonly cy: number;
  readonly cz: number;
  readonly blocks: Uint8Array;
  /** Per-chunk dirty flags; the renderer remeshes and clears them. */
  readonly dirty: Uint8Array;
  /** Increments on every edit; cheap change detection for caches. */
  revision = 0;

  /** @param blocks optional existing voxel buffer to adopt (e.g. transferred from a worker). */
  constructor(sx: number, sy: number, sz: number, chunkSize = 16, blocks?: Uint8Array) {
    if (sx % chunkSize || sy % chunkSize || sz % chunkSize) {
      throw new Error(`World size ${sx}x${sy}x${sz} must be a multiple of chunk size ${chunkSize}`);
    }
    this.sx = sx;
    this.sy = sy;
    this.sz = sz;
    this.chunkSize = chunkSize;
    this.cx = sx / chunkSize;
    this.cy = sy / chunkSize;
    this.cz = sz / chunkSize;
    if (blocks && blocks.length !== sx * sy * sz) throw new Error('voxel buffer size mismatch');
    this.blocks = blocks ?? new Uint8Array(sx * sy * sz);
    this.dirty = new Uint8Array(this.cx * this.cy * this.cz);
  }

  inBounds(x: number, y: number, z: number): boolean {
    return x >= 0 && y >= 0 && z >= 0 && x < this.sx && y < this.sy && z < this.sz;
  }

  index(x: number, y: number, z: number): number {
    return x + this.sx * (y + this.sy * z);
  }

  get(x: number, y: number, z: number): number {
    if (x < 0 || y < 0 || z < 0 || x >= this.sx || y >= this.sy || z >= this.sz) return B.BEDROCK;
    return this.blocks[x + this.sx * (y + this.sy * z)];
  }

  /** Solidity at a (possibly fractional) world position. */
  isSolidAt(x: number, y: number, z: number): boolean {
    return SOLID[this.get(Math.floor(x), Math.floor(y), Math.floor(z))] === 1;
  }

  isSolid(x: number, y: number, z: number): boolean {
    return SOLID[this.get(x, y, z)] === 1;
  }

  /** Raw write without dirty tracking. Used by world generation before the first mesh build. */
  setRaw(x: number, y: number, z: number, id: number): void {
    if (x < 0 || y < 0 || z < 0 || x >= this.sx || y >= this.sy || z >= this.sz) return;
    this.blocks[x + this.sx * (y + this.sy * z)] = id;
  }

  /** Gameplay write: marks the owning chunk and any touching neighbor chunk dirty. */
  set(x: number, y: number, z: number, id: number): boolean {
    if (!this.inBounds(x, y, z)) return false;
    const i = this.index(x, y, z);
    if (this.blocks[i] === id) return false;
    this.blocks[i] = id;
    this.revision++;
    const cs = this.chunkSize;
    const lx = x % cs;
    const ly = y % cs;
    const lz = z % cs;
    const ccx = (x / cs) | 0;
    const ccy = (y / cs) | 0;
    const ccz = (z / cs) | 0;
    this.markDirty(ccx, ccy, ccz);
    // Ambient occlusion samples diagonal neighbors, so edges and corners touch up to 7 neighbors.
    const dxs = lx === 0 ? [0, -1] : lx === cs - 1 ? [0, 1] : [0];
    const dys = ly === 0 ? [0, -1] : ly === cs - 1 ? [0, 1] : [0];
    const dzs = lz === 0 ? [0, -1] : lz === cs - 1 ? [0, 1] : [0];
    for (const dx of dxs) for (const dy of dys) for (const dz of dzs) {
      if (dx || dy || dz) this.markDirty(ccx + dx, ccy + dy, ccz + dz);
    }
    return true;
  }

  chunkIndex(ccx: number, ccy: number, ccz: number): number {
    return ccx + this.cx * (ccy + this.cy * ccz);
  }

  markDirty(ccx: number, ccy: number, ccz: number): void {
    if (ccx < 0 || ccy < 0 || ccz < 0 || ccx >= this.cx || ccy >= this.cy || ccz >= this.cz) return;
    this.dirty[this.chunkIndex(ccx, ccy, ccz)] = 1;
  }

  markAllDirty(): void {
    this.dirty.fill(1);
  }

  fill(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, id: number): void {
    for (let z = Math.max(0, z0); z <= Math.min(this.sz - 1, z1); z++)
      for (let y = Math.max(0, y0); y <= Math.min(this.sy - 1, y1); y++)
        for (let x = Math.max(0, x0); x <= Math.min(this.sx - 1, x1); x++) this.blocks[this.index(x, y, z)] = id;
  }
}
