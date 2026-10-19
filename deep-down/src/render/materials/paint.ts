import { Rng } from '../../core/rng';

/**
 * Seamless pixel-art painting for terrain materials.
 *
 * Every material is a MAT_SIZE x MAT_SIZE texture that wraps on both axes: all noise,
 * cells, strata and cracks here are periodic, so a texture sampled in world space shows no
 * seam at its border and no seam at any voxel boundary. At 16 texels per metre a layer spans
 * 8 m, so a single block never shows a frame of its own.
 *
 * Painters work in two steps: build a *value field* (0..1, one float per texel) out of geology,
 * stones and wear, then quantize it through a hand-picked palette ramp. Colour therefore always
 * stays on the family palette (pixel-art discipline) and shading never drifts off-hue.
 *
 * Channels: RGB = sRGB albedo, A = height (0..255) for ordinary materials or emissive mask
 * for glowing ones (see MaterialInfo.glow). Height drives material boundaries: where two
 * materials meet, the one that is "taller" at that texel pushes into the other.
 */

export const MAT_SIZE = 128;
/** Texels per metre in world space (matches the 16-px pixel-art density of props and UI). */
export const MAT_DENSITY = 16;

const S = MAT_SIZE;

/** Wrap a texel coordinate into 0..S-1. */
export const wrap = (v: number): number => ((v % S) + S) % S;

/** Signed shortest distance from a to b on the periodic axis (b - a). */
export const wrapDelta = (a: number, b: number): number => {
  let d = (b - a) % S;
  if (d > S / 2) d -= S;
  else if (d < -S / 2) d += S;
  return d;
};

export class MatCanvas {
  readonly size = MAT_SIZE;
  readonly rgb = new Float32Array(MAT_SIZE * MAT_SIZE * 3);
  readonly a = new Float32Array(MAT_SIZE * MAT_SIZE);

  idx(x: number, y: number): number {
    return wrap(Math.round(x)) + wrap(Math.round(y)) * S;
  }

  set(x: number, y: number, hex: number, alpha?: number): void {
    const i = this.idx(x, y);
    this.rgb[i * 3] = (hex >> 16) & 255;
    this.rgb[i * 3 + 1] = (hex >> 8) & 255;
    this.rgb[i * 3 + 2] = hex & 255;
    if (alpha !== undefined) this.a[i] = alpha;
  }

  getHex(x: number, y: number): number {
    const i = this.idx(x, y) * 3;
    return (Math.round(this.rgb[i]) << 16) | (Math.round(this.rgb[i + 1]) << 8) | Math.round(this.rgb[i + 2]);
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

/** Stable 0..1 hash of a (wrapped) texel, for choices that must not form a regular pattern. */
export function hash2(x: number, y: number): number {
  let h = Math.imul(wrap(Math.round(x)) + 1, 374761393) ^ Math.imul(wrap(Math.round(y)) + 1, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/**
 * Shared intermediate results (host rock, the masonry wall) for one generateMaterials() pass:
 * layers that continue another layer (damp stone, ores, crumbling masonry) reuse its exact
 * structure without recomputing it. Outside a pass nothing is cached.
 */
let paintCache: Map<string, unknown> | null = null;
export function beginPaintCache(): void {
  paintCache = new Map();
}
export function endPaintCache(): void {
  paintCache = null;
}
export function cached<T>(key: string, make: () => T): T {
  if (paintCache?.has(key)) return paintCache.get(key) as T;
  const v = make();
  paintCache?.set(key, v);
  return v;
}

/** Copy of a value field (cached fields are shared, so painters modify a copy). */
export function cloneField(f: Field2): Field2 {
  const g = new Field2();
  g.v.set(f.v);
  g.h.set(f.h);
  g.code.set(f.code);
  return g;
}

/** Deterministic per-material random stream, keyed by name (stable when layers are reordered). */
export function rngFor(name: string): Rng {
  let h = 2166136261;
  for (let i = 0; i < name.length; i++) h = Math.imul(h ^ name.charCodeAt(i), 16777619);
  return new Rng(h >>> 0);
}

// ---------------------------------------------------------------------------------------
// Periodic noise

/**
 * Value noise on an integer lattice of `cx` x `cy` cells per texture edge; wraps exactly.
 * Different cell counts per axis give stretched grain (wood, wet streaks) that stays seamless.
 */
export class PeriodicNoise {
  private readonly lattice: Float32Array;

  constructor(rng: Rng, readonly cx: number, readonly cy: number = cx) {
    this.lattice = new Float32Array(cx * cy);
    for (let i = 0; i < this.lattice.length; i++) this.lattice[i] = rng.next();
  }

  /** x, y in texels (any range); returns 0..1. */
  at(x: number, y: number): number {
    const cx = this.cx;
    const cy = this.cy;
    const fx = (x / S) * cx;
    const fy = (y / S) * cy;
    const fx0 = Math.floor(fx);
    const fy0 = Math.floor(fy);
    const tx = fx - fx0;
    const ty = fy - fy0;
    const sx = tx * tx * (3 - 2 * tx);
    const sy = ty * ty * (3 - 2 * ty);
    const x0 = ((fx0 % cx) + cx) % cx;
    const y0 = ((fy0 % cy) + cy) % cy;
    const x1 = x0 + 1 === cx ? 0 : x0 + 1;
    const y1 = y0 + 1 === cy ? 0 : y0 + 1;
    const l = this.lattice;
    const a = l[x0 + y0 * cx];
    const b = l[x1 + y0 * cx];
    const c = l[x0 + y1 * cx];
    const d = l[x1 + y1 * cx];
    const top = a + (b - a) * sx;
    return top + (c + (d - c) * sx - top) * sy;
  }
}

export type Field = (x: number, y: number) => number;

/**
 * Fractal sum of periodic octaves. `base` lattice cells across x for the first octave
 * (`baseY` across y, default = base); each octave doubles both, so it stays seamless.
 */
export function fbm(rng: Rng, base: number, octaves: number, gain = 0.5, baseY = base): Field {
  const layers: Array<{ n: PeriodicNoise; amp: number }> = [];
  let amp = 1;
  let total = 0;
  for (let o = 0; o < octaves; o++) {
    layers.push({ n: new PeriodicNoise(rng, base << o, baseY << o), amp });
    total += amp;
    amp *= gain;
  }
  return (x, y) => {
    let v = 0;
    for (let i = 0; i < layers.length; i++) v += layers[i].n.at(x, y) * layers[i].amp;
    return v / total;
  };
}

/** Bake a field into a texel array (fields are sampled many times by some painters). */
export function bake(field: Field): Float32Array {
  const out = new Float32Array(S * S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) out[x + y * S] = field(x, y);
  return out;
}

// ---------------------------------------------------------------------------------------
// Periodic cells (stones, slabs, facets)

export interface Cell {
  x: number;
  y: number;
  /** Per-cell random values in [0,1). */
  r: number;
  r2: number;
  r3: number;
}

export interface CellHit {
  id: number;
  d1: number;
  d2: number;
}

/**
 * Periodic Worley cells: nearest-cell id, distance to it, and distance to the second
 * nearest (edge = d2 - d1 small near borders). Points are jittered on an `nx` x `ny` grid.
 */
export class PeriodicCells {
  readonly cells: Cell[] = [];
  private readonly hit: CellHit = { id: 0, d1: 0, d2: 0 };

  constructor(rng: Rng, readonly nx: number, readonly ny: number = nx, jitter = 0.85) {
    const sx = S / nx;
    const sy = S / ny;
    for (let j = 0; j < ny; j++)
      for (let i = 0; i < nx; i++) {
        this.cells.push({ x: (i + 0.5 + (rng.next() - 0.5) * jitter) * sx, y: (j + 0.5 + (rng.next() - 0.5) * jitter) * sy, r: rng.next(), r2: rng.next(), r3: rng.next() });
      }
  }

  /**
   * Nearest / second-nearest search with wrap-around; `ax`/`ay` weight the axes (elongated
   * cells search further along the stretched axis). Returns a shared object: copy the fields
   * if you need two hits at once.
   */
  query(x: number, y: number, ax = 1, ay = 1): CellHit {
    let d1 = Infinity;
    let d2 = Infinity;
    let id = 0;
    const px = wrap(x);
    const py = wrap(y);
    const nx = this.nx;
    const ny = this.ny;
    const gx = Math.floor(px / (S / nx));
    const gy = Math.floor(py / (S / ny));
    const rx = ax < 0.5 ? 2 : 1;
    const ry = ay < 0.5 ? 2 : 1;
    const half = S / 2;
    const cells = this.cells;
    for (let j = -ry; j <= ry; j++) {
      const row = ((gy + j + ny) % ny) * nx;
      for (let i = -rx; i <= rx; i++) {
        const c = cells[((gx + i + nx) % nx) + row];
        let dx = c.x - px;
        if (dx > half) dx -= S;
        else if (dx < -half) dx += S;
        let dy = c.y - py;
        if (dy > half) dy -= S;
        else if (dy < -half) dy += S;
        const d = dx * dx * ax + dy * dy * ay;
        if (d < d1) {
          d2 = d1;
          d1 = d;
          id = ((gx + i + nx) % nx) + row;
        } else if (d < d2) d2 = d;
      }
    }
    this.hit.id = id;
    this.hit.d1 = Math.sqrt(d1);
    this.hit.d2 = Math.sqrt(d2);
    return this.hit;
  }
}

// ---------------------------------------------------------------------------------------
// Colour helpers

const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

/**
 * Pick from a dark->light ramp. By default there is no dither: the value fields are smooth, so
 * quantizing them gives clean pixel-art clusters with crisp contours. An ordered dither (only
 * where explicitly asked) would print a regular screen pattern over every mid-tone.
 */
export function ramp(colors: readonly number[], v: number, x: number, y: number, dither = 0): number {
  const bayer = BAYER4[(x & 3) + (y & 3) * 4] / 16 - 0.47;
  const t = Math.max(0, Math.min(0.999, v + (bayer * dither) / colors.length));
  return colors[Math.floor(t * colors.length)];
}

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
// Value / height fields with geological features

/**
 * A float value field + height field painted before quantization. Feature codes record what
 * each texel is (rock, crack, lip...) so overlays (veins, lichen, wet streaks) can follow the
 * geology instead of being scattered on top of it.
 */
export class Field2 {
  readonly v = new Float32Array(S * S);
  readonly h = new Float32Array(S * S);
  /** 0 = surface, 1 = crack / joint (recessed), 2 = lit lip, 3 = shadowed side. */
  readonly code = new Uint8Array(S * S);

  i(x: number, y: number): number {
    return wrap(Math.round(x)) + wrap(Math.round(y)) * S;
  }
  add(x: number, y: number, dv: number): void {
    this.v[this.i(x, y)] += dv;
  }
}

export type Pt = [number, number];

/**
 * A crack that runs mostly straight (joints and fractures are planar in rock), with a small
 * wander and occasional kinks. Returns 8-connected texel points (wrapped later on draw).
 */
export function crackPath(rng: Rng, x: number, y: number, angle: number, len: number, wander = 0.12, kink = 0.04): Pt[] {
  const pts: Pt[] = [];
  let a = angle;
  let fx = x;
  let fy = y;
  let lx = Math.round(x);
  let ly = Math.round(y);
  pts.push([lx, ly]);
  for (let i = 0; i < len; i++) {
    a += (rng.next() - 0.5) * wander + (angle - a) * 0.1;
    if (rng.chance(kink)) a += (rng.next() - 0.5) * 0.9;
    fx += Math.cos(a);
    fy += Math.sin(a);
    const nx = Math.round(fx);
    const ny = Math.round(fy);
    if (nx !== lx || ny !== ly) {
      pts.push([nx, ny]);
      lx = nx;
      ly = ny;
    }
  }
  return pts;
}

/**
 * Engrave a crack into a value field: the crack itself is recessed (code 1, low height). Light
 * comes from the upper left, so the groove's far wall (below / right of it) catches a lit lip
 * and the near side (above / left) falls into shadow. `depth` darkens the crack.
 */
export function engrave(f: Field2, pts: Pt[], opts: { depth?: number; lip?: number; shadow?: number; height?: number; widen?: number; rng?: Rng } = {}): void {
  const depth = opts.depth ?? 0.32;
  const lip = opts.lip ?? 0.09;
  const shadow = opts.shadow ?? 0.08;
  const hCut = opts.height ?? 18;
  const mark = (x: number, y: number) => {
    const i = f.i(x, y);
    if (f.code[i] !== 1) {
      f.code[i] = 1;
      f.v[i] -= depth;
      f.h[i] = Math.min(f.h[i], hCut);
    }
  };
  for (const [x, y] of pts) {
    mark(x, y);
    if (opts.widen && opts.rng && opts.rng.chance(opts.widen)) mark(x + 1, y);
  }
  for (const [x, y] of pts) {
    for (const [dx, dy, dv] of [[0, 1, lip], [1, 0, lip * 0.7], [-1, 0, -shadow * 0.7], [0, -1, -shadow]] as const) {
      const i = f.i(x + dx, y + dy);
      if (f.code[i] === 1) continue;
      f.v[i] += dv;
      if (f.code[i] === 0) f.code[i] = dv > 0 ? 2 : 3;
    }
  }
}

/**
 * A crack as a smooth curve (float texel positions, one per texel of length): mostly straight,
 * with a small wander and occasional kinks. Drawn with `groove`, which rasterizes it by
 * distance, so diagonal cracks do not turn into 1-texel stair steps.
 */
export function crackCurve(rng: Rng, x: number, y: number, angle: number, len: number, wander = 0.12, kink = 0.04): Pt[] {
  const pts: Pt[] = [[x, y]];
  let a = angle;
  for (let i = 0; i < len; i++) {
    a += (rng.next() - 0.5) * wander + (angle - a) * 0.1;
    if (rng.chance(kink)) a += (rng.next() - 0.5) * 0.9;
    x += Math.cos(a);
    y += Math.sin(a);
    pts.push([x, y]);
  }
  return pts;
}

export interface GrooveOptions {
  /** Width at the widest point, in texels (1 - 2.5). Tapers to a hairline at both ends. */
  width?: number;
  /** Value removed in the core (the core stays on the ramp: a shadowed groove, not ink). */
  depth?: number;
  /** Lit lip on the side that faces the light (below the groove) and shadow on the other side. */
  lip?: number;
  shadow?: number;
  /** Height of the core (0..255). */
  height?: number;
  /** Share of the length where the crack closes up (broken, not a continuous drawn line). */
  gaps?: number;
  /** Only texels for which this returns true are touched (e.g. the inside of one stone). */
  mask?: (x: number, y: number) => boolean;
  rng?: Rng;
}

/**
 * Paint a crack as a carved groove: a dark core 1-2 texels wide that tapers to nothing at both
 * ends and closes up in places, a lit lip on the lower side (the groove wall that faces the
 * light from above) and a shadowed upper side. Rasterized by distance to the curve, so the
 * line keeps its width at any angle. Codes: 1 core, 2 lip, 3 shadow.
 */
// Scratch buffers for groove(): the best (smallest normalized distance) hit per texel, so
// overlapping segments do not stack. Reset after each call, only where touched.
const gScore = new Float32Array(S * S).fill(Infinity);
const gDist = new Float32Array(S * S);
const gSide = new Float32Array(S * S);
const gWidth = new Float32Array(S * S);
const gTouched = new Int32Array(S * S);

export function groove(f: Field2, pts: Pt[], o: GrooveOptions = {}): void {
  if (pts.length < 2) return;
  const wMax = o.width ?? 1.6;
  const depth = o.depth ?? 0.2;
  const lip = o.lip ?? 0.09;
  const shadow = o.shadow ?? 0.07;
  const hCut = o.height ?? 20;
  const gaps = o.gaps ?? 0.15;
  // Cumulative length, and closed stretches along it.
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const L = cum[cum.length - 1] || 1;
  const phase = o.rng ? o.rng.next() * 100 : 0;
  const closed = (t: number) => gaps > 0 && Math.sin(t * L * 0.37 + phase) * 0.5 + Math.sin(t * L * 0.13 + phase * 1.7) * 0.5 < -1 + gaps * 2.2;
  let touched = 0;
  const R = Math.ceil(wMax / 2 + 2);
  for (let i = 0; i + 1 < pts.length; i++) {
    const [ax, ay] = pts[i];
    const [bx, by] = pts[i + 1];
    const dx = bx - ax;
    const dy = by - ay;
    const len2 = dx * dx + dy * dy || 1;
    // Width at this segment (segments are about a texel long): tapers to the ends, closes up.
    const t = (cum[i] + cum[i + 1]) / (2 * L);
    let w = wMax * Math.pow(Math.max(0, Math.sin(Math.PI * t)), 0.55);
    if (closed(t)) w *= 0.25;
    const reach = w / 2 + 1.3;
    const x0 = Math.floor(Math.min(ax, bx)) - R;
    const x1 = Math.ceil(Math.max(ax, bx)) + R;
    const y0 = Math.floor(Math.min(ay, by)) - R;
    const y1 = Math.ceil(Math.max(ay, by)) + R;
    for (let y = y0; y <= y1; y++)
      for (let x = x0; x <= x1; x++) {
        // Texel centres sit on integer coordinates (as in crackPath).
        let s = ((x - ax) * dx + (y - ay) * dy) / len2;
        s = s < 0 ? 0 : s > 1 ? 1 : s;
        const ox = x - (ax + dx * s);
        const oy = y - (ay + dy * s);
        const d = Math.sqrt(ox * ox + oy * oy);
        if (d > reach) continue;
        const k = wrap(x) + wrap(y) * S;
        const score = d - w / 2;
        if (gScore[k] <= score) continue;
        if (gScore[k] === Infinity) gTouched[touched++] = k;
        gScore[k] = score;
        gDist[k] = d;
        gWidth[k] = w;
        // Which side of the groove: below it (toward +y) faces the light from above.
        const nrm = d || 1;
        gSide[k] = oy / nrm + (ox / nrm) * 0.25;
      }
  }
  for (let n = 0; n < touched; n++) {
    const k = gTouched[n];
    gScore[k] = Infinity;
    const x = k % S;
    const y = (k - x) / S;
    if (o.mask && !o.mask(x, y)) continue;
    if (f.code[k] === 1) continue;
    const d = gDist[k];
    const w = gWidth[k];
    const core = d <= Math.max(0.35, w / 2);
    if (core && w >= 0.5) {
      f.code[k] = 1;
      f.v[k] -= depth * Math.min(1, 0.55 + w * 0.3);
      f.h[k] = Math.min(f.h[k], hCut);
    } else if (w >= 0.35 && d <= w / 2 + 1.2) {
      const side = gSide[k];
      const lit = side > 0.2;
      const shade = side < -0.2;
      const sc = Math.min(1, w / 1.4);
      if (lit) f.v[k] += lip * sc;
      else if (shade) f.v[k] -= shadow * sc;
      else f.v[k] -= shadow * 0.4 * sc;
      if (f.code[k] === 0) f.code[k] = lit ? 2 : 3;
    }
  }
}

/** A chipped flake: a small triangular scar, dark where the flake broke off, lit on its lower rim. */
export function chip(f: Field2, rng: Rng, x: number, y: number, r: number): void {
  const dir = rng.int(0, 3);
  for (let j = 0; j < r; j++)
    for (let i = 0; i < r - j; i++) {
      const px = dir & 1 ? x - i : x + i;
      const py = dir & 2 ? y - j : y + j;
      const k = f.i(px, py);
      if (f.code[k] === 1) continue;
      const rim = i + j === r - 1;
      f.v[k] += rim ? 0.07 : -0.11;
      f.h[k] -= rim ? 0 : 28;
    }
}

/**
 * Quantize a value field through a ramp into the canvas, with the field heights as alpha.
 * Crack and joint texels (code 1) move `crackMix` of the way toward the crack colour: they keep
 * some of the ramp tone, so a crack reads as a shadowed groove in the stone, not as ink.
 */
export function resolve(c: MatCanvas, f: Field2, pal: readonly number[], crack: number, dither = 0, crackMix = 0.35): void {
  const n = pal.length;
  const rgb = c.rgb;
  const a = c.a;
  const cr = (crack >> 16) & 255;
  const cg = (crack >> 8) & 255;
  const cb = crack & 255;
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const i = x + y * S;
      let v = f.v[i];
      if (dither) v += ((BAYER4[(x & 3) + (y & 3) * 4] / 16 - 0.47) * dither) / n;
      const hex = pal[v <= 0 ? 0 : v >= 0.999 ? n - 1 : Math.floor(v * n)];
      let r = (hex >> 16) & 255;
      let g = (hex >> 8) & 255;
      let b = hex & 255;
      if (f.code[i] === 1) {
        r += (cr - r) * crackMix;
        g += (cg - g) * crackMix;
        b += (cb - b) * crackMix;
      }
      rgb[i * 3] = r;
      rgb[i * 3 + 1] = g;
      rgb[i * 3 + 2] = b;
      a[i] = f.h[i];
    }
}

/**
 * Summed-area check over `win` x `win` windows on a `step` grid starting at `offset`
 * (wrapping): `fix` is called with the centre of every window holding fewer than `min` set
 * texels of `mask`. The table is built once per call, so use non-overlapping windows
 * (step >= win) when `fix` changes the mask.
 */
export function windowMinimum(mask: Uint8Array, win: number, step: number, min: number, fix: (x: number, y: number) => void, ox = 0, oy = ox): void {
  const W = S + win;
  const sat = new Int32Array((W + 1) * (W + 1));
  for (let y = 0; y < W; y++) {
    let row = 0;
    for (let x = 0; x < W; x++) {
      row += mask[(x % S) + (y % S) * S];
      sat[x + 1 + (y + 1) * (W + 1)] = sat[x + 1 + y * (W + 1)] + row;
    }
  }
  for (let wy = oy; wy < S; wy += step)
    for (let wx = ox; wx < S; wx += step) {
      const x1 = wx + win;
      const y1 = wy + win;
      const n = sat[x1 + y1 * (W + 1)] - sat[wx + y1 * (W + 1)] - sat[x1 + wy * (W + 1)] + sat[wx + wy * (W + 1)];
      if (n < min) fix(wx + win / 2, wy + win / 2);
    }
}

/** Texels within Manhattan distance `r` of any set texel of `mask` (excluding the mask itself). */
export function dilate(mask: Uint8Array, r: number): Uint8Array {
  const out = new Uint8Array(S * S);
  for (let i = 0; i < S * S; i++) {
    if (!mask[i]) continue;
    const x = i % S;
    const y = (i - x) / S;
    for (let dy = -r; dy <= r; dy++) {
      const yy = ((y + dy + S) % S) * S;
      const span = r - Math.abs(dy);
      for (let dx = -span; dx <= span; dx++) out[((x + dx + S) % S) + yy] = 1;
    }
  }
  for (let i = 0; i < S * S; i++) if (mask[i]) out[i] = 0;
  return out;
}

/** Fill the whole canvas from a function of (x, y) -> sRGB hex (+ optional height). */
export function paintAll(c: MatCanvas, fn: (x: number, y: number) => { hex: number; h?: number }): void {
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const r = fn(x, y);
      c.set(x, y, r.hex, r.h);
    }
}

/** Rasterize a disc-ish blob with an irregular edge; calls `fn` with the normalized radius (0 centre .. 1 edge). */
export function blob(x: number, y: number, r: number, edge: Field, fn: (px: number, py: number, t: number, dx: number, dy: number) => void, aspect = 1): void {
  const R = Math.ceil(r + 2);
  for (let dy = -R; dy <= R; dy++)
    for (let dx = -R; dx <= R; dx++) {
      const px = x + dx;
      const py = y + dy;
      const d = Math.sqrt(dx * dx + (dy * dy) / (aspect * aspect));
      const rr = r * (0.75 + 0.5 * edge(px, py));
      if (d <= rr) fn(px, py, d / Math.max(0.001, rr), dx, dy);
    }
}

export { Rng };
