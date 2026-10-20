// The voxel grid of one spike scene: 0.5 m blocks, a few block kinds, topology clean-up and a DDA ray cast.

export const CELL = 0.5;

export const enum Blk {
  Air = 0,
  Rock = 1,
  Ore = 2,
  Gem = 3,
  Soil = 4,
  Grotto = 5,
  Basalt = 6,
  Magma = 7,
  Bedrock = 8,
}

/** Texture-array layers (see painter.ts); per block kind: [top faces, side faces, bottom faces]. */
export const LAYER = {
  rock: [0, 1, 2, 3],
  floor: [4, 5],
  ore: [6, 7],
  gem: [8],
  soil: [9],
  grotto: [10, 11],
  grottoFloor: [12],
  basalt: [13, 14],
  magma: [15, 16],
  wood: 17,
  iron: 18,
  ash: [19],
} as const;
export const LAYER_COUNT = 20;

export function layersFor(b: Blk): readonly [readonly number[], readonly number[], readonly number[]] {
  switch (b) {
    case Blk.Ore:
      return [LAYER.ore, LAYER.ore, LAYER.ore];
    case Blk.Gem:
      return [LAYER.gem, LAYER.gem, LAYER.gem];
    case Blk.Soil:
      return [LAYER.soil, LAYER.soil, LAYER.soil];
    case Blk.Grotto:
      return [LAYER.grottoFloor, LAYER.grotto, LAYER.grotto];
    case Blk.Basalt:
      return [LAYER.ash, LAYER.basalt, LAYER.basalt];
    case Blk.Magma:
      return [LAYER.magma, LAYER.magma, LAYER.magma];
    case Blk.Bedrock:
      return [LAYER.basalt, LAYER.basalt, LAYER.basalt];
    default:
      return [LAYER.floor, LAYER.rock, LAYER.rock];
  }
}

export interface Hit {
  x: number;
  y: number;
  z: number;
  /** Face normal of the entered face (axis-aligned). */
  nx: number;
  ny: number;
  nz: number;
  t: number;
  px: number;
  py: number;
  pz: number;
}

export class Grid {
  readonly data: Uint8Array;
  /** Bumped on every edit (for caches). */
  version = 0;
  constructor(
    readonly nx: number,
    readonly ny: number,
    readonly nz: number,
    /** World position of the min corner of cell (0, 0, 0). */
    readonly ox: number,
    readonly oy: number,
    readonly oz: number,
  ) {
    this.data = new Uint8Array(nx * ny * nz);
  }
  idx(x: number, y: number, z: number): number {
    return x + this.nx * (y + this.ny * z);
  }
  inside(x: number, y: number, z: number): boolean {
    return x >= 0 && y >= 0 && z >= 0 && x < this.nx && y < this.ny && z < this.nz;
  }
  get(x: number, y: number, z: number): Blk {
    if (!this.inside(x, y, z)) return Blk.Bedrock;
    return this.data[this.idx(x, y, z)] as Blk;
  }
  set(x: number, y: number, z: number, b: Blk): void {
    if (this.inside(x, y, z)) this.data[this.idx(x, y, z)] = b;
    this.version++;
  }
  solid(x: number, y: number, z: number): boolean {
    return this.get(x, y, z) !== Blk.Air;
  }
  /** Cell coordinates of a world position. */
  cellOf(px: number, py: number, pz: number): [number, number, number] {
    return [Math.floor((px - this.ox) / CELL), Math.floor((py - this.oy) / CELL), Math.floor((pz - this.oz) / CELL)];
  }
  /** World centre of a cell. */
  center(x: number, y: number, z: number): [number, number, number] {
    return [this.ox + (x + 0.5) * CELL, this.oy + (y + 0.5) * CELL, this.oz + (z + 0.5) * CELL];
  }
  /** Fill every cell whose centre satisfies `f` with `b`. */
  fill(f: (x: number, y: number, z: number) => boolean, b: Blk): void {
    for (let z = 0; z < this.nz; z++)
      for (let y = 0; y < this.ny; y++)
        for (let x = 0; x < this.nx; x++) {
          const [cx, cy, cz] = this.center(x, y, z);
          if (f(cx, cy, cz)) this.data[this.idx(x, y, z)] = b;
        }
    this.version++;
  }

  /**
   * Make the solid set a clean 2-manifold for the lattice mesher: no two solids meeting only along an edge or a
   * corner, no single floating blocks, no one-block air pockets. Fills the open cell with the most solid neighbours.
   */
  cleanup(): void {
    const faces = (x: number, y: number, z: number) =>
      +this.solid(x + 1, y, z) + +this.solid(x - 1, y, z) + +this.solid(x, y + 1, z) + +this.solid(x, y - 1, z) + +this.solid(x, y, z + 1) + +this.solid(x, y, z - 1);
    for (let pass = 0; pass < 6; pass++) {
      let changed = 0;
      for (let z = -1; z < this.nz; z++)
        for (let y = -1; y < this.ny; y++)
          for (let x = -1; x < this.nx; x++) {
            // Edge diagonals in the three planes.
            const planes: Array<[number[], number[], number[], number[]]> = [
              [[x, y, z], [x + 1, y, z], [x, y + 1, z], [x + 1, y + 1, z]],
              [[x, y, z], [x + 1, y, z], [x, y, z + 1], [x + 1, y, z + 1]],
              [[x, y, z], [x, y + 1, z], [x, y, z + 1], [x, y + 1, z + 1]],
            ];
            for (const [a, b, c, d] of planes) {
              const sa = this.solid(a[0], a[1], a[2]), sb = this.solid(b[0], b[1], b[2]), sc = this.solid(c[0], c[1], c[2]), sd = this.solid(d[0], d[1], d[2]);
              if (sa === sd && sb === sc && sa !== sb) {
                const open = sa ? [b, c] : [a, d];
                const pick = faces(open[0][0], open[0][1], open[0][2]) >= faces(open[1][0], open[1][1], open[1][2]) ? open[0] : open[1];
                if (this.inside(pick[0], pick[1], pick[2])) {
                  this.data[this.idx(pick[0], pick[1], pick[2])] = this.neighbourKind(pick[0], pick[1], pick[2]);
                  changed++;
                }
              }
            }
            // Corner-only contacts in the 2x2x2 block.
            let n = 0;
            for (let k = 0; k < 8; k++) n += +this.solid(x + (k & 1), y + ((k >> 1) & 1), z + ((k >> 2) & 1));
            if (n === 2 || n === 6) {
              for (let k = 0; k < 4; k++) {
                const ax = x + (k & 1), ay = y + ((k >> 1) & 1), az = z;
                const bx = x + 1 - (k & 1), by = y + 1 - ((k >> 1) & 1), bz = z + 1;
                const s1 = this.solid(ax, ay, az), s2 = this.solid(bx, by, bz);
                if (s1 === s2 && (n === 2 ? s1 : !s1)) {
                  // Fill an open cell next to the pair to join it (n = 2) or fill one of the two holes (n = 6).
                  const tx = n === 2 ? bx : ax, ty = n === 2 ? ay : ay, tz = n === 2 ? az : az;
                  if (this.inside(tx, ty, tz) && !this.solid(tx, ty, tz)) {
                    this.data[this.idx(tx, ty, tz)] = this.neighbourKind(tx, ty, tz);
                    changed++;
                  }
                }
              }
            }
          }
      for (let z = 0; z < this.nz; z++)
        for (let y = 0; y < this.ny; y++)
          for (let x = 0; x < this.nx; x++) {
            const s = this.solid(x, y, z), f = faces(x, y, z);
            if (s && f === 0) {
              this.data[this.idx(x, y, z)] = Blk.Air;
              changed++;
            } else if (!s && f === 6) {
              this.data[this.idx(x, y, z)] = this.neighbourKind(x, y, z);
              changed++;
            }
          }
      if (!changed) break;
    }
    this.version++;
  }
  /** Close the grid's sides and floor (the top stays open where a scene cut a sky hole). */
  sealBorder(b: Blk = Blk.Rock): void {
    for (let z = 0; z < this.nz; z++)
      for (let y = 0; y < this.ny; y++)
        for (let x = 0; x < this.nx; x++)
          if (x === 0 || z === 0 || y === 0 || x === this.nx - 1 || z === this.nz - 1) {
            const i = this.idx(x, y, z);
            if (this.data[i] === Blk.Air) this.data[i] = b;
          }
    this.version++;
  }
  /** The kind of the first solid face neighbour (rock if none). */
  private neighbourKind(x: number, y: number, z: number): Blk {
    const n: Array<[number, number, number]> = [[0, -1, 0], [1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1], [0, 1, 0]];
    for (const [dx, dy, dz] of n) {
      const b = this.get(x + dx, y + dy, z + dz);
      if (b !== Blk.Air && b !== Blk.Ore && b !== Blk.Gem) return b === Blk.Bedrock ? Blk.Rock : b;
    }
    return Blk.Rock;
  }

  /** Amanatides-Woo DDA through the cells; returns the first solid cell hit. */
  raycast(px: number, py: number, pz: number, dx: number, dy: number, dz: number, maxT: number): Hit | null {
    let [x, y, z] = this.cellOf(px, py, pz);
    const sx = dx > 0 ? 1 : -1, sy = dy > 0 ? 1 : -1, sz = dz > 0 ? 1 : -1;
    const bx = this.ox + (x + (sx > 0 ? 1 : 0)) * CELL, by = this.oy + (y + (sy > 0 ? 1 : 0)) * CELL, bz = this.oz + (z + (sz > 0 ? 1 : 0)) * CELL;
    let tx = dx !== 0 ? (bx - px) / dx : Infinity, ty = dy !== 0 ? (by - py) / dy : Infinity, tz = dz !== 0 ? (bz - pz) / dz : Infinity;
    const ddx = dx !== 0 ? CELL / Math.abs(dx) : Infinity, ddy = dy !== 0 ? CELL / Math.abs(dy) : Infinity, ddz = dz !== 0 ? CELL / Math.abs(dz) : Infinity;
    let t = 0, nx = 0, ny = 0, nz = 0;
    for (let i = 0; i < 512 && t <= maxT; i++) {
      if (this.solid(x, y, z) && i > 0) return { x, y, z, nx, ny, nz, t, px: px + dx * t, py: py + dy * t, pz: pz + dz * t };
      if (tx < ty && tx < tz) {
        x += sx;
        t = tx;
        tx += ddx;
        nx = -sx;
        ny = 0;
        nz = 0;
      } else if (ty < tz) {
        y += sy;
        t = ty;
        ty += ddy;
        nx = 0;
        ny = -sy;
        nz = 0;
      } else {
        z += sz;
        t = tz;
        tz += ddz;
        nx = 0;
        ny = 0;
        nz = -sz;
      }
    }
    return null;
  }
}
