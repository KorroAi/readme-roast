import { Rng } from '../../core/rng';

/**
 * Seamless pixel-art painting for terrain materials.
 *
 * Every material is a MAT_SIZE x MAT_SIZE texture that wraps on both axes: all noise,
 * cells, strata and cracks here are periodic, so a texture sampled in world space shows no
 * seam at its border and no seam at any voxel boundary. At 16 texels per metre a layer spans
 * 8 m, so a single block never shows a frame of its own.
 *
 * Channels: RGB = sRGB albedo, A = height (0..255) for ordinary materials or emissive mask
 * for glowing ones (see MaterialInfo.emissive). Height drives material boundaries: where two
 * materials meet, the one that is "taller" at that texel pushes into the other.
 */

export const MAT_SIZE = 128;
/** Texels per metre in world space (matches the 16-px pixel-art density of props and UI). */
export const MAT_DENSITY = 16;

export class MatCanvas {
  readonly size = MAT_SIZE;
  readonly rgb = new Float32Array(MAT_SIZE * MAT_SIZE * 3);
  readonly a = new Float32Array(MAT_SIZE * MAT_SIZE);

  idx(x: number, y: number): number {
    const s = this.size;
    return (((x % s) + s) % s) + (((y % s) + s) % s) * s;
  }

  set(x: number, y: number, hex: number, alpha?: number): void {
    const i = this.idx(x, y);
    this.rgb[i * 3] = (hex >> 16) & 255;
    this.rgb[i * 3 + 1] = (hex >> 8) & 255;
    this.rgb[i * 3 + 2] = hex & 255;
    if (alpha !== undefined) this.a[i] = alpha;
  }

  setRgb(x: number, y: number, r: number, g: number, b: number): void {
    const i = this.idx(x, y) * 3;
    this.rgb[i] = r;
    this.rgb[i + 1] = g;
    this.rgb[i + 2] = b;
  }

  getHex(x: number, y: number): number {
    const i = this.idx(x, y) * 3;
    return (Math.round(this.rgb[i]) << 16) | (Math.round(this.rgb[i + 1]) << 8) | Math.round(this.rgb[i + 2]);
  }

  /** Multiply brightness of one texel. */
  shade(x: number, y: number, f: number): void {
    const i = this.idx(x, y) * 3;
    this.rgb[i] *= f;
    this.rgb[i + 1] *= f;
    this.rgb[i + 2] *= f;
  }

  /** Blend one texel toward a colour. */
  tint(x: number, y: number, hex: number, t: number): void {
    const i = this.idx(x, y) * 3;
    this.rgb[i] += (((hex >> 16) & 255) - this.rgb[i]) * t;
    this.rgb[i + 1] += (((hex >> 8) & 255) - this.rgb[i + 1]) * t;
    this.rgb[i + 2] += ((hex & 255) - this.rgb[i + 2]) * t;
  }

  height(x: number, y: number): number {
    return this.a[this.idx(x, y)];
  }

  setHeight(x: number, y: number, h: number): void {
    this.a[this.idx(x, y)] = h;
  }

  /** RGBA8 bytes (clamped) for upload. */
  toBytes(out: Uint8Array, offset: number): void {
    const n = this.size * this.size;
    for (let i = 0; i < n; i++) {
      out[offset + i * 4] = clampByte(this.rgb[i * 3]);
      out[offset + i * 4 + 1] = clampByte(this.rgb[i * 3 + 1]);
      out[offset + i * 4 + 2] = clampByte(this.rgb[i * 3 + 2]);
      out[offset + i * 4 + 3] = clampByte(this.a[i]);
    }
  }
}

const clampByte = (v: number): number => (v <= 0 ? 0 : v >= 255 ? 255 : Math.round(v));

// ---------------------------------------------------------------------------------------
// Periodic noise

/** Value noise with an integer lattice of `cells` per texture edge; wraps exactly. */
export class PeriodicNoise {
  private readonly lattice: Float32Array;

  constructor(rng: Rng, readonly cells: number) {
    this.lattice = new Float32Array(cells * cells);
    for (let i = 0; i < this.lattice.length; i++) this.lattice[i] = rng.next();
  }

  /** x, y in texels (any range); returns 0..1. */
  at(x: number, y: number): number {
    const c = this.cells;
    const fx = (x / MAT_SIZE) * c;
    const fy = (y / MAT_SIZE) * c;
    const x0 = Math.floor(fx);
    const y0 = Math.floor(fy);
    const tx = fx - x0;
    const ty = fy - y0;
    const sx = tx * tx * (3 - 2 * tx);
    const sy = ty * ty * (3 - 2 * ty);
    const v = (xx: number, yy: number) => this.lattice[(((xx % c) + c) % c) + (((yy % c) + c) % c) * c];
    const a = v(x0, y0) + (v(x0 + 1, y0) - v(x0, y0)) * sx;
    const b = v(x0, y0 + 1) + (v(x0 + 1, y0 + 1) - v(x0, y0 + 1)) * sx;
    return a + (b - a) * sy;
  }
}

/** Fractal sum of periodic octaves; `base` lattice cells for the first octave (power of 2 keeps it seamless). */
export function fbm(rng: Rng, base: number, octaves: number, gain = 0.5): (x: number, y: number) => number {
  const layers: Array<{ n: PeriodicNoise; amp: number }> = [];
  let amp = 1;
  let total = 0;
  for (let o = 0; o < octaves; o++) {
    layers.push({ n: new PeriodicNoise(rng, base << o), amp });
    total += amp;
    amp *= gain;
  }
  return (x, y) => {
    let v = 0;
    for (const l of layers) v += l.n.at(x, y) * l.amp;
    return v / total;
  };
}

/** Domain-warped field: wobbles straight features (strata, joints) so they read as geology. */
export function warp(field: (x: number, y: number) => number, wx: (x: number, y: number) => number, wy: (x: number, y: number) => number, amount: number) {
  return (x: number, y: number) => field(x + (wx(x, y) - 0.5) * amount, y + (wy(x, y) - 0.5) * amount);
}

// ---------------------------------------------------------------------------------------
// Periodic cells (stones, slabs, cobbles)

export interface Cell {
  x: number;
  y: number;
  /** Per-cell random value in [0,1). */
  r: number;
}

/**
 * Periodic Worley cells: returns nearest-cell id, distance to it, and distance to the second
 * nearest (edge = d2 - d1 small near borders). Points are jittered on a grid of
 * `count` x `count` cells over the texture.
 */
export class PeriodicCells {
  readonly cells: Cell[] = [];

  /** `nx` x `ny` jittered points over the texture (use nx != ny for elongated stones). */
  constructor(rng: Rng, readonly nx: number, readonly ny: number = nx, jitter = 0.85) {
    const sx = MAT_SIZE / nx;
    const sy = MAT_SIZE / ny;
    for (let j = 0; j < ny; j++)
      for (let i = 0; i < nx; i++) {
        this.cells.push({ x: (i + 0.5 + (rng.next() - 0.5) * jitter) * sx, y: (j + 0.5 + (rng.next() - 0.5) * jitter) * sy, r: rng.next() });
      }
  }

  /**
   * Nearest / second-nearest search with wrap-around; `ax`/`ay` weight the axes (anisotropic
   * stones). Points are jittered within their grid cell, so only the surrounding 5x5 grid cells
   * can hold the two nearest points.
   */
  query(x: number, y: number, ax = 1, ay = 1): { id: number; d1: number; d2: number } {
    let d1 = Infinity;
    let d2 = Infinity;
    let id = 0;
    const W = MAT_SIZE;
    const gx = Math.floor((((x % W) + W) % W) / (W / this.nx));
    const gy = Math.floor((((y % W) + W) % W) / (W / this.ny));
    for (let j = -2; j <= 2; j++)
      for (let i = -2; i <= 2; i++) {
        const k = ((gx + i + this.nx) % this.nx) + ((gy + j + this.ny) % this.ny) * this.nx;
        const c = this.cells[k];
        let dx = Math.abs(x - c.x) % W;
        let dy = Math.abs(y - c.y) % W;
        dx = Math.min(dx, W - dx);
        dy = Math.min(dy, W - dy);
        const d = Math.sqrt(dx * dx * ax + dy * dy * ay);
        if (d < d1) {
          d2 = d1;
          d1 = d;
          id = k;
        } else if (d < d2) d2 = d;
      }
    return { id, d1, d2 };
  }
}

// ---------------------------------------------------------------------------------------
// Colour helpers

/** Pick from a dark->light ramp with an ordered-dither offset (keeps the pixel-art look). */
export function ramp(colors: readonly number[], v: number, x: number, y: number, dither = 0.5): number {
  const bayer = BAYER4[(x & 3) + (y & 3) * 4] / 16 - 0.5;
  const t = Math.max(0, Math.min(0.999, v + bayer * dither / colors.length));
  return colors[Math.floor(t * colors.length)];
}

const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

export function mixHex(a: number, b: number, t: number): number {
  const ar = (a >> 16) & 255;
  const ag = (a >> 8) & 255;
  const ab = a & 255;
  const r = Math.round(ar + (((b >> 16) & 255) - ar) * t);
  const g = Math.round(ag + (((b >> 8) & 255) - ag) * t);
  const bl = Math.round(ab + ((b & 255) - ab) * t);
  return (r << 16) | (g << 8) | bl;
}

export function scaleHex(a: number, f: number): number {
  const r = Math.min(255, Math.round(((a >> 16) & 255) * f));
  const g = Math.min(255, Math.round(((a >> 8) & 255) * f));
  const b = Math.min(255, Math.round((a & 255) * f));
  return (r << 16) | (g << 8) | b;
}

// ---------------------------------------------------------------------------------------
// Features

/** A wandering hairline fracture that wraps around the texture edges. Returns its pixels. */
export function fracture(c: MatCanvas, rng: Rng, color: number, len: number, opts: { x?: number; y?: number; dir?: number; turn?: number; heightCut?: number } = {}): Array<[number, number]> {
  let x = opts.x ?? rng.int(0, MAT_SIZE - 1);
  let y = opts.y ?? rng.int(0, MAT_SIZE - 1);
  let dir = opts.dir ?? rng.int(0, 7);
  const turn = opts.turn ?? 0.3;
  const dirs = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];
  const pts: Array<[number, number]> = [];
  for (let i = 0; i < len; i++) {
    c.set(x, y, color);
    if (opts.heightCut !== undefined) c.setHeight(x, y, opts.heightCut);
    pts.push([x, y]);
    if (rng.chance(turn)) dir = (dir + (rng.chance(0.5) ? 1 : 7)) % 8;
    x += dirs[dir][0];
    y += dirs[dir][1];
  }
  return pts;
}

/** Light the texel above/left of each fracture pixel and darken below/right: an engraved edge. */
export function engraveEdges(c: MatCanvas, pts: Array<[number, number]>, light = 1.12, dark = 0.8): void {
  for (const [x, y] of pts) {
    c.shade(x, y - 1, light);
    c.shade(x + 1, y + 1, dark);
  }
}

/** Fill the whole canvas from a function of (x, y) -> sRGB hex (+ optional height). */
export function paintAll(c: MatCanvas, fn: (x: number, y: number) => { hex: number; h?: number }): void {
  for (let y = 0; y < MAT_SIZE; y++)
    for (let x = 0; x < MAT_SIZE; x++) {
      const r = fn(x, y);
      c.set(x, y, r.hex, r.h);
    }
}

export { Rng };
