import { SOLID, VISIBLE } from '../../config/blocks';
import { MAT_DENSITY } from '../materials/paint';
import type { VoxelWorld } from '../../world/VoxelWorld';

/**
 * Geometry for structure meshes (see StructureRenderer): polygons in world space with the
 * attributes of the structure material (structureMaterial.ts). Authoring helpers work in a local
 * frame (a rotation + translation stack), so a fallen drum or a beam lying askew is built like an
 * upright one.
 *
 * Every vertex gets a light-volume sample point: half a metre out along its normal, then moved
 * out of solid voxels (the collision cells a structure covers carry no light) and onto the centre
 * plane of the open cell, like the terrain's faces, so a stair tread over a voxel step reads the
 * light of the open cell above the step, not the dark inside of it.
 */

export type V3 = [number, number, number];

/** How a polygon takes its texture (structureMaterial.ts). */
export const enum TexMode {
  /** Dressed stone in world-space courses on the polygon's axis plane, like a terrain wall. */
  World = 0,
  /** One course strip of a library layer, in the stone's own frame. */
  Stone = 1,
  /** A seamless layer (timber), in the piece's own frame. */
  Plain = 2,
  /** One monolithic stone: Stone mode with u folded (mirrored) inside the strip's longest
   *  joint-free stone, so a drum or a voussoir shows no head joint. */
  Monolith = 3,
}

/**
 * Texture of the next polygons. Stone and Plain modes map in the builder's local frame at the
 * time of the call (a stone is authored as a box in its own frame, so a raking coping stone or a
 * fallen drum carries its texture with it): faces along `axis` take u = distance along it, its
 * end faces u = distance along `across`; side faces take v = texels below `top` (local y), faces
 * looking up or down v = texels from `vRef` along `across`.
 */
export interface Surface {
  mode: TexMode;
  layer: number;
  /** Strip row (texels) in the library layer (Stone mode). */
  row: number;
  /** The piece's length axis (unit, local frame). */
  axis: V3;
  /** Horizontal unit vector across the piece (local frame). */
  across: V3;
  /** Texel offset along u (a different stretch of the strip per stone). */
  u0: number;
  /** Local y of the top of the stone (side faces: v = texels below it). */
  top: number;
  /** Local coordinate along `across` where v = 0 on faces looking up or down. */
  vRef?: number;
  /** Plain mode: grain along v (beams) instead of u (boards). */
  grainAlongV?: boolean;
}

export const DEFAULT_SURFACE: Surface = { mode: TexMode.World, layer: 0, row: 0, axis: [1, 0, 0], across: [0, 0, 1], u0: 0, top: 0 };

const D = MAT_DENSITY;

type Mat = [number, number, number, number, number, number, number, number, number, number, number, number];
const IDENTITY: Mat = [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0];

export class StructureBuilder {
  readonly pos: number[] = [];
  readonly nrm: number[] = [];
  readonly st: number[] = [];
  readonly light: number[] = [];
  readonly info: number[] = [];
  readonly idx: number[] = [];
  surface: Surface = DEFAULT_SURFACE;
  /** Ambient occlusion of a vertex (0..1) from its world position and normal. */
  aoAt: (p: V3, n: V3) => number = () => 1;
  /** Fixed AO override for the next polygons (null = aoAt). */
  aoFixed: number[] | null = null;
  private frame: Mat = IDENTITY.slice() as Mat;
  private readonly stack: Mat[] = [];

  constructor(private readonly world: VoxelWorld | null) {}

  get vertexCount(): number {
    return this.pos.length / 3;
  }

  /**
   * Contact occlusion from the terrain under a vertex, for `aoAt`: a side or underside within
   * `reach` metres above a visible solid top darkens towards `min` at contact (smoothstep), so a
   * plinth, a parapet foot or a post sits in its own shadow like the terrain's inner corners.
   * Faces looking up are open and keep their light; hidden structure cells (the piece itself)
   * do not count as floor.
   */
  contactAo(min = 0.5, reach = 0.8): (p: V3, n: V3) => number {
    const w = this.world;
    if (!w) return () => 1;
    return (p, n) => {
      const up = Math.max(0, n[1]);
      if (up > 0.95) return 1;
      const qx = p[0] + n[0] * 0.2;
      const qy = p[1] + 0.02;
      const qz = p[2] + n[2] * 0.2;
      const x = Math.floor(qx);
      const z = Math.floor(qz);
      let d = reach;
      for (let y = Math.floor(qy); y >= Math.floor(qy - reach) - 1; y--) {
        const id = w.get(x, y, z);
        if (SOLID[id] && VISIBLE[id]) {
          d = Math.min(reach, Math.max(0, qy - (y + 1)));
          break;
        }
      }
      const t = d / reach;
      const k = 1 - (1 - min) * (1 - t * t * (3 - 2 * t));
      return k + (1 - k) * up;
    };
  }

  // -------------------------------------------------------------------------------------------
  // Frame

  push(): this {
    this.stack.push(this.frame.slice() as Mat);
    return this;
  }

  pop(): this {
    this.frame = this.stack.pop() ?? (IDENTITY.slice() as Mat);
    return this;
  }

  translate(x: number, y: number, z: number): this {
    const m = this.frame;
    m[9] += m[0] * x + m[3] * y + m[6] * z;
    m[10] += m[1] * x + m[4] * y + m[7] * z;
    m[11] += m[2] * x + m[5] * y + m[8] * z;
    return this;
  }

  /** Post-multiply a rotation about a local axis (radians). */
  rotate(axis: 0 | 1 | 2, a: number): this {
    const c = Math.cos(a);
    const s = Math.sin(a);
    const m = this.frame;
    // Columns 0..2 of the 3x3 part are m[0..2], m[3..5], m[6..8].
    const i = axis === 0 ? 3 : axis === 1 ? 6 : 0;
    const j = axis === 0 ? 6 : axis === 1 ? 0 : 3;
    for (let k = 0; k < 3; k++) {
      const a0 = m[i + k];
      const b0 = m[j + k];
      m[i + k] = a0 * c + b0 * s;
      m[j + k] = b0 * c - a0 * s;
    }
    return this;
  }

  /** Post-multiply a change of basis: local x, y, z become X, Y, Z (orthonormal), origin o. */
  basis(o: V3, X: V3, Y: V3, Z: V3): this {
    this.translate(o[0], o[1], o[2]);
    const m = this.frame;
    const c = [m[0], m[1], m[2], m[3], m[4], m[5], m[6], m[7], m[8]];
    const col = (v: V3, k: number) => {
      for (let i = 0; i < 3; i++) m[k + i] = c[i] * v[0] + c[3 + i] * v[1] + c[6 + i] * v[2];
    };
    col(X, 0);
    col(Y, 3);
    col(Z, 6);
    return this;
  }

  /** Local point to world. */
  toWorld(p: V3): V3 {
    const m = this.frame;
    return [m[0] * p[0] + m[3] * p[1] + m[6] * p[2] + m[9], m[1] * p[0] + m[4] * p[1] + m[7] * p[2] + m[10], m[2] * p[0] + m[5] * p[1] + m[8] * p[2] + m[11]];
  }

  /** Local direction to world. */
  dirToWorld(d: V3): V3 {
    const m = this.frame;
    return [m[0] * d[0] + m[3] * d[1] + m[6] * d[2], m[1] * d[0] + m[4] * d[1] + m[7] * d[2], m[2] * d[0] + m[5] * d[1] + m[8] * d[2]];
  }

  // -------------------------------------------------------------------------------------------
  // Polygons

  /**
   * A planar convex polygon in local coordinates, counter-clockwise seen from outside. `normals`
   * (local, per vertex) make it smooth-shaded; by default it is flat.
   */
  poly(local: V3[], normals?: V3[], aos?: number[]): void {
    const pts = local.map((p) => this.toWorld(p));
    const fn = faceNormal(pts);
    const ln = faceNormal(local);
    if (!fn || !ln) return;
    const ns = normals ? normals.map((n) => norm(this.dirToWorld(n))) : null;
    const base = this.vertexCount;
    const face = dominantFace(fn);
    for (let k = 0; k < pts.length; k++) {
      const n = ns ? ns[k] : fn;
      this.vertex(pts[k], local[k], n, ln, face, aos ? aos[k] : this.aoFixed ? this.aoFixed[k % this.aoFixed.length] : this.aoAt(pts[k], n));
    }
    for (let k = 1; k + 1 < pts.length; k++) this.idx.push(base, base + k, base + k + 1);
  }

  quad(a: V3, b: V3, c: V3, d: V3, aos?: number[]): void {
    this.poly([a, b, c, d], undefined, aos);
  }

  /** A quad turned to face `out` (local direction), whatever order its corners are given in. */
  quadOut(a: V3, b: V3, c: V3, d: V3, out: V3, aos?: number[]): void {
    const n = faceNormal([a, b, c, d]);
    if (!n) return;
    if (n[0] * out[0] + n[1] * out[1] + n[2] * out[2] >= 0) this.poly([a, b, c, d], undefined, aos);
    else this.poly([d, c, b, a], undefined, aos ? [aos[3], aos[2], aos[1], aos[0]] : undefined);
  }

  /**
   * A strip of quads between two rows of local points (same length), smooth-shaded with the
   * given per-point normals, counter-clockwise when row `a` runs left to right below row `b`
   * seen from outside. All quads take the face of the strip's middle normal (one texture
   * projection along a curved surface).
   */
  strip(a: V3[], b: V3[], na: V3[], nb: V3[], aoA?: number[], aoB?: number[], uvA?: Array<[number, number]>, uvB?: Array<[number, number]>): void {
    const n = a.length;
    const pa = a.map((p) => this.toWorld(p));
    const pb = b.map((p) => this.toWorld(p));
    const wa = na.map((v) => norm(this.dirToWorld(v)));
    const wb = nb.map((v) => norm(this.dirToWorld(v)));
    for (let k = 0; k + 1 < n; k++) {
      const quadPts = [pa[k], pa[k + 1], pb[k + 1], pb[k]];
      const localPts = [a[k], a[k + 1], b[k + 1], b[k]];
      const fn = faceNormal(quadPts) ?? wa[k];
      const ln = faceNormal(localPts) ?? na[k];
      const face = dominantFace(fn);
      const ns = [wa[k], wa[k + 1], wb[k + 1], wb[k]];
      const aos = [aoA?.[k], aoA?.[k + 1], aoB?.[k + 1], aoB?.[k]];
      const uvs = uvA && uvB ? [uvA[k], uvA[k + 1], uvB[k + 1], uvB[k]] : null;
      const base = this.vertexCount;
      for (let c = 0; c < 4; c++) this.vertex(quadPts[c], localPts[c], ns[c], ln, face, aos[c] ?? this.aoAt(quadPts[c], ns[c]), uvs ? uvs[c] : undefined);
      this.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
  }

  /**
   * A smooth surface of revolution about the local y axis with explicit texture coordinates:
   * `profile` [radius, y] from bottom to top (radius may vary per angle through `radiusAt`),
   * `segments` around from angle a0 over `sweep`. Profile points whose segments turn by less than
   * ~40 degrees share a normal (rounded mouldings), sharper turns crease. uv(angle, y) gives the
   * texels; ao(y, radius, world point, world normal) the occlusion.
   */
  revolve(
    profile: Array<[number, number]>,
    segments: number,
    uv: (angle: number, r: number, y: number) => [number, number],
    ao: (y: number, r: number, p: V3, n: V3) => number = () => 1,
    a0 = 0,
    sweep = Math.PI * 2,
    wobble?: (angle: number, k: number) => number,
  ): void {
    const m = profile.length;
    // Segment normals in the (r, y) plane, then per-point normals (smoothed unless creased).
    const segN: Array<[number, number]> = [];
    for (let k = 0; k + 1 < m; k++) {
      const dr = profile[k + 1][0] - profile[k][0];
      const dy = profile[k + 1][1] - profile[k][1];
      const l = Math.hypot(dr, dy) || 1;
      segN.push([dy / l, -dr / l]);
    }
    const ang = Array.from({ length: segments + 1 }, (_, j) => a0 + (sweep * j) / segments);
    for (let k = 0; k + 1 < m; k++) {
      const [r0, y0] = profile[k];
      const [r1, y1] = profile[k + 1];
      if (Math.abs(r0 - r1) < 1e-6 && Math.abs(y0 - y1) < 1e-6) continue;
      const nAt = (other: number): [number, number] => {
        const o = segN[other];
        const n = segN[k];
        if (!o || n[0] * o[0] + n[1] * o[1] < 0.77) return n;
        const x = n[0] + o[0];
        const y = n[1] + o[1];
        const l = Math.hypot(x, y) || 1;
        return [x / l, y / l];
      };
      const nA = nAt(k - 1);
      const nB = nAt(k + 1);
      // Two rings of shared vertices per profile segment (smooth around).
      const base = this.vertexCount;
      for (const [r, y, n, pk] of [[r0, y0, nA, k], [r1, y1, nB, k + 1]] as const) {
        for (const a of ang) {
          const c = Math.cos(a);
          const sn = -Math.sin(a);
          const rr = wobble ? r * wobble(a, pk) : r;
          const lp: V3 = [c * rr, y, sn * rr];
          const wn = norm(this.dirToWorld([c * n[0], n[1], sn * n[0]]));
          const wp = this.toWorld(lp);
          this.vertex(wp, lp, wn, wn, dominantFace(wn), ao(y, r, wp, wn), uv(a, rr, y));
        }
      }
      const row = segments + 1;
      for (let j = 0; j < segments; j++) this.idx.push(base + j, base + j + 1, base + row + j + 1, base + j, base + row + j + 1, base + row + j);
    }
  }

  private vertex(p: V3, lp: V3, n: V3, ln: V3, face: number, ao: number, uv?: [number, number]): void {
    const s = this.surface;
    this.pos.push(p[0], p[1], p[2]);
    this.nrm.push(Math.round(n[0] * 127), Math.round(n[1] * 127), Math.round(n[2] * 127), 0);
    let u: number;
    let v: number;
    if (uv) {
      [u, v] = uv;
    } else if (s.mode === TexMode.World) {
      [u, v] = worldUv(p, face);
      u *= D;
      v *= D;
    } else {
      const ax = s.axis;
      const w = s.across;
      const alongAxis = Math.abs(dot(ln, ax)) < 0.7;
      const flat = Math.abs(ln[1]) > 0.7;
      if (s.mode === TexMode.Plain && s.grainAlongV) {
        // Grain along the beam: v follows its axis, u runs around it (across, then up the sides).
        u = (flat ? dot(lp, w) : lp[1] + dot(lp, w) * 0.37) * D + s.u0;
        v = (alongAxis ? dot(lp, ax) : lp[1]) * D;
      } else {
        u = (alongAxis ? dot(lp, ax) : dot(lp, w)) * D + s.u0;
        const dv = dot(lp, w) - (s.vRef ?? 0);
        // (Stone and Monolith map alike; the shader folds Monolith's u into one stone.)
        const stone = s.mode === TexMode.Stone || s.mode === TexMode.Monolith;
        v = flat ? (stone ? Math.abs(dv) : dv) * D : (s.top - lp[1]) * D;
        if (stone) v = Math.max(0, Math.min(v, 255));
      }
    }
    this.st.push(clampI16(Math.round(u * 8)), clampI16(Math.round(v * 8)));
    const q = this.lightPoint(p, n);
    this.light.push(clampI8(Math.round((q[0] - p[0]) * 50)), clampI8(Math.round((q[1] - p[1]) * 50)), clampI8(Math.round((q[2] - p[2]) * 50)), 0);
    this.info.push(s.layer, face | (s.mode << 3), Math.round(Math.max(0, Math.min(1, ao)) * 255), s.row);
  }

  /** Light-volume sample point for a surface point (see the class comment). */
  private lightPoint(p: V3, n: V3): V3 {
    const q: V3 = [p[0] + n[0] * 0.5, p[1] + n[1] * 0.5, p[2] + n[2] * 0.5];
    const w = this.world;
    if (!w) return q;
    const solid = (x: number, y: number, z: number) => SOLID[w.get(Math.floor(x), Math.floor(y), Math.floor(z))] === 1;
    for (let k = 0; k < 4 && solid(q[0], q[1], q[2]); k++) {
      q[0] += n[0] * 0.5;
      q[1] += n[1] * 0.5;
      q[2] += n[2] * 0.5;
    }
    for (let k = 0; k < 3 && solid(q[0], q[1], q[2]); k++) q[1] = Math.floor(q[1]) + 1.5;
    // Off the solid cell below / beside: onto the centre plane of the open cell, so trilinear
    // filtering does not blend in the dark solid (the terrain samples its faces the same way).
    if (!solid(q[0], q[1], q[2])) {
      const fy = Math.floor(q[1]);
      if (q[1] < fy + 0.5 && solid(q[0], q[1] - 1, q[2])) q[1] = fy + 0.5;
      const fx = Math.floor(q[0]);
      if (q[0] < fx + 0.5 && solid(q[0] - 1, q[1], q[2])) q[0] = fx + 0.5;
      else if (q[0] > fx + 0.5 && solid(q[0] + 1, q[1], q[2])) q[0] = fx + 0.5;
      const fz = Math.floor(q[2]);
      if (q[2] < fz + 0.5 && solid(q[0], q[1], q[2] - 1)) q[2] = fz + 0.5;
      else if (q[2] > fz + 0.5 && solid(q[0], q[1], q[2] + 1)) q[2] = fz + 0.5;
    }
    // Keep within the encodable offset (+-2.5 m).
    for (let k = 0; k < 3; k++) q[k] = p[k] + Math.max(-2.5, Math.min(2.5, q[k] - p[k]));
    return q;
  }

  // -------------------------------------------------------------------------------------------
  // Solids

  /**
   * A dressed block from (x0, y0, z0) to (x1, y1, z1) in local coordinates with chamfered arrises
   * (`c` metres; 0 = sharp). Faces listed in `skip` (0 +x, 1 -x, 2 +y, 3 -y, 4 +z, 5 -z) are left
   * out (hidden against another block or the ground).
   */
  box(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, c = 0, skip = 0): void {
    c = Math.min(c, (x1 - x0) / 2 - 1e-3, (y1 - y0) / 2 - 1e-3, (z1 - z0) / 2 - 1e-3);
    if (c <= 1e-3) {
      const P = (i: number): V3 => [i & 1 ? x1 : x0, i & 2 ? y1 : y0, i & 4 ? z1 : z0];
      if (!(skip & 1)) this.quad(P(1), P(3), P(7), P(5));
      if (!(skip & 2)) this.quad(P(4), P(6), P(2), P(0));
      if (!(skip & 4)) this.quad(P(2), P(6), P(7), P(3));
      if (!(skip & 8)) this.quad(P(0), P(1), P(5), P(4));
      if (!(skip & 16)) this.quad(P(4), P(5), P(7), P(6));
      if (!(skip & 32)) this.quad(P(1), P(0), P(2), P(3));
      return;
    }
    // Inset faces, bevel strips along the 12 edges and corner triangles: built from the 6 face
    // rectangles shrunk by c, so it is a closed convex solid.
    const X = [x0, x0 + c, x1 - c, x1];
    const Y = [y0, y0 + c, y1 - c, y1];
    const Z = [z0, z0 + c, z1 - c, z1];
    const v = (i: number, j: number, k: number): V3 => [X[i], Y[j], Z[k]];
    // Faces.
    if (!(skip & 1)) this.quad(v(3, 1, 1), v(3, 2, 1), v(3, 2, 2), v(3, 1, 2));
    if (!(skip & 2)) this.quad(v(0, 1, 2), v(0, 2, 2), v(0, 2, 1), v(0, 1, 1));
    if (!(skip & 4)) this.quad(v(1, 3, 1), v(1, 3, 2), v(2, 3, 2), v(2, 3, 1));
    if (!(skip & 8)) this.quad(v(1, 0, 1), v(2, 0, 1), v(2, 0, 2), v(1, 0, 2));
    if (!(skip & 16)) this.quad(v(1, 1, 3), v(2, 1, 3), v(2, 2, 3), v(1, 2, 3));
    if (!(skip & 32)) this.quad(v(2, 1, 0), v(1, 1, 0), v(1, 2, 0), v(2, 2, 0));
    const has = (f: number) => !(skip & (1 << f));
    // Edge bevels (each between two faces; drawn if either face is drawn), turned outward.
    // Edges along x.
    for (const [j, k, fy, fz] of [[0, 0, 3, 5], [3, 0, 2, 5], [3, 3, 2, 4], [0, 3, 3, 4]] as const) {
      if (!has(fy) && !has(fz)) continue;
      const jy = j === 0 ? 1 : 2;
      const kz = k === 0 ? 1 : 2;
      this.quadOut(v(1, j, kz), v(2, j, kz), v(2, jy, k), v(1, jy, k), [0, j === 0 ? -1 : 1, k === 0 ? -1 : 1]);
    }
    // Edges along y.
    for (const [i, k, fx, fz] of [[0, 0, 1, 5], [3, 0, 0, 5], [3, 3, 0, 4], [0, 3, 1, 4]] as const) {
      if (!has(fx) && !has(fz)) continue;
      const ix = i === 0 ? 1 : 2;
      const kz = k === 0 ? 1 : 2;
      this.quadOut(v(i, 1, kz), v(i, 2, kz), v(ix, 2, k), v(ix, 1, k), [i === 0 ? -1 : 1, 0, k === 0 ? -1 : 1]);
    }
    // Edges along z.
    for (const [i, j, fx, fy] of [[0, 0, 1, 3], [3, 0, 0, 3], [3, 3, 0, 2], [0, 3, 1, 2]] as const) {
      if (!has(fx) && !has(fy)) continue;
      const ix = i === 0 ? 1 : 2;
      const jy = j === 0 ? 1 : 2;
      this.quadOut(v(i, jy, 1), v(i, jy, 2), v(ix, j, 2), v(ix, j, 1), [i === 0 ? -1 : 1, j === 0 ? -1 : 1, 0]);
    }
    // Corners.
    for (let ci = 0; ci < 8; ci++) {
      const i = ci & 1 ? 3 : 0;
      const j = ci & 2 ? 3 : 0;
      const k = ci & 4 ? 3 : 0;
      const fx = i ? 0 : 1;
      const fy = j ? 2 : 3;
      const fz = k ? 4 : 5;
      if (!has(fx) && !has(fy) && !has(fz)) continue;
      const ii = i ? 2 : 1;
      const jj = j ? 2 : 1;
      const kk = k ? 2 : 1;
      const px = v(i, jj, kk);
      const py = v(ii, j, kk);
      const pz = v(ii, jj, k);
      const sx = i ? 1 : -1;
      const sy = j ? 1 : -1;
      const sz = k ? 1 : -1;
      if (sx * sy * sz > 0) this.poly([px, py, pz]);
      else this.poly([px, pz, py]);
    }
  }

  /**
   * A solid of revolution about the local y axis: `profile` is [radius, y] from the bottom up,
   * `segments` around. Smooth around, creased at profile corners (each profile segment gets its
   * own normals). Caps are added where the profile starts or ends off the axis (`caps`).
   */
  lathe(profile: Array<[number, number]>, segments: number, caps: { bottom?: boolean; top?: boolean } = {}, a0 = 0, sweep = Math.PI * 2): void {
    const ang = Array.from({ length: segments + 1 }, (_, k) => a0 + (sweep * k) / segments);
    const ring = (r: number, y: number) => ang.map((a): V3 => [Math.cos(a) * r, y, -Math.sin(a) * r]);
    for (let k = 0; k + 1 < profile.length; k++) {
      const [r0, y0] = profile[k];
      const [r1, y1] = profile[k + 1];
      if (Math.abs(r0 - r1) < 1e-6 && Math.abs(y0 - y1) < 1e-6) continue;
      // Profile tangent (dr, dy) -> outward normal (dy, -dr) in the (r, y) plane.
      const dr = r1 - r0;
      const dy = y1 - y0;
      const l = Math.hypot(dr, dy);
      const nr = dy / l;
      const ny = -dr / l;
      const nrm = ang.map((a): V3 => [Math.cos(a) * nr, ny, -Math.sin(a) * nr]);
      this.strip(ring(r0, y0), ring(r1, y1), nrm, nrm);
    }
    const cap = (r: number, y: number, up: boolean) => {
      if (r < 1e-4) return;
      const pts = ring(r, y).slice(0, segments);
      this.poly(up ? pts : pts.slice().reverse());
    };
    if (caps.bottom) cap(profile[0][0], profile[0][1], false);
    if (caps.top) cap(profile[profile.length - 1][0], profile[profile.length - 1][1], true);
  }

  /**
   * A moulding swept along a horizontal polyline (local x-z points, at least two), mitred at its
   * corners: `profile` is [out, y] pairs from bottom to top, `out` measured along the path's
   * outward side (the left of the direction of travel when `left`, else the right). Open ends
   * are capped. Flat-shaded per profile segment.
   */
  sweep(path: Array<[number, number]>, profile: Array<[number, number]>, left: boolean, caps = true): void {
    const n = path.length;
    const segN: Array<[number, number]> = [];
    for (let i = 0; i + 1 < n; i++) {
      const dx = path[i + 1][0] - path[i][0];
      const dz = path[i + 1][1] - path[i][1];
      const l = Math.hypot(dx, dz) || 1;
      // Left of travel (x right, z down seen from above): (dz, -dx).
      segN.push(left ? [dz / l, -dx / l] : [-dz / l, dx / l]);
    }
    // Mitre offset direction per path point: the bisector, scaled so offsets stay parallel.
    const mit = path.map((_, i) => {
      const a = segN[Math.max(0, i - 1)];
      const c = segN[Math.min(segN.length - 1, i)];
      let mx = a[0] + c[0];
      let mz = a[1] + c[1];
      const l = Math.hypot(mx, mz) || 1;
      mx /= l;
      mz /= l;
      const k = 1 / Math.max(0.3, mx * c[0] + mz * c[1]);
      return [mx * k, mz * k] as [number, number];
    });
    const pt = (i: number, o: number, y: number): V3 => [path[i][0] + mit[i][0] * o, y, path[i][1] + mit[i][1] * o];
    for (let i = 0; i + 1 < n; i++) {
      const out: V3 = [segN[i][0], 0, segN[i][1]];
      for (let k = 0; k + 1 < profile.length; k++) {
        const [o0, y0] = profile[k];
        const [o1, y1] = profile[k + 1];
        const dy = y1 - y0;
        const dout = o1 - o0;
        // Outward normal of this profile segment in the (out, y) plane: (dy, -dout).
        const nrm: V3 = [out[0] * dy, -dout, out[2] * dy];
        b4(this, pt(i, o0, y0), pt(i + 1, o0, y0), pt(i + 1, o1, y1), pt(i, o1, y1), nrm);
      }
    }
    if (caps) {
      const capAt = (i: number, dir: number) => {
        const t: V3 = [path[i][0] - path[i - dir][0], 0, path[i][1] - path[i - dir][1]];
        // The section, fanned from its top corner at the wall (it sees the whole profile, even a
        // concave cove).
        const poly = [pt(i, 0, profile[profile.length - 1][1]), pt(i, 0, profile[0][1]), ...profile.map(([o, y]) => pt(i, o, y))];
        const nn = faceNormalOf(poly);
        if (nn && nn[0] * t[0] + nn[2] * t[2] < 0) poly.reverse();
        this.poly(poly);
      };
      capAt(0, -1);
      capAt(n - 1, 1);
    }
  }

  /**
   * A prism: the convex polygon `shape` ([u, v] counter-clockwise, in the local x-y plane) swept
   * along local z from z0 to z1. Flat-shaded, with both end caps unless skipped.
   */
  prism(shape: Array<[number, number]>, z0: number, z1: number, capStart = true, capEnd = true): void {
    const n = shape.length;
    for (let k = 0; k < n; k++) {
      const [u0, v0] = shape[k];
      const [u1, v1] = shape[(k + 1) % n];
      this.quad([u0, v0, z0], [u1, v1, z0], [u1, v1, z1], [u0, v0, z1]);
    }
    if (capEnd) this.poly(shape.map(([u, v]): V3 => [u, v, z1]));
    if (capStart) this.poly(shape.map(([u, v]): V3 => [u, v, z0]).reverse());
  }
}

export function dot(a: V3, b: V3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

export function norm(a: V3): V3 {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
}

function faceNormal(p: V3[]): V3 | null {
  // Newell's method.
  let x = 0;
  let y = 0;
  let z = 0;
  for (let i = 0; i < p.length; i++) {
    const a = p[i];
    const b = p[(i + 1) % p.length];
    x += (a[1] - b[1]) * (a[2] + b[2]);
    y += (a[2] - b[2]) * (a[0] + b[0]);
    z += (a[0] - b[0]) * (a[1] + b[1]);
  }
  const l = Math.hypot(x, y, z);
  return l < 1e-9 ? null : [x / l, y / l, z / l];
}

/** Axis face index (0 +x, 1 -x, 2 +y, 3 -y, 4 +z, 5 -z) of a normal. */
export function dominantFace(n: V3): number {
  const ax = Math.abs(n[0]);
  const ay = Math.abs(n[1]);
  const az = Math.abs(n[2]);
  if (ax >= ay && ax >= az) return n[0] >= 0 ? 0 : 1;
  if (ay >= az) return n[1] >= 0 ? 2 : 3;
  return n[2] >= 0 ? 4 : 5;
}

/** The terrain's world projection per face axis (terrainMaterial.ts worldUv), in metres. */
export function worldUv(p: V3, face: number): [number, number] {
  switch (face) {
    case 0:
      return [-p[2], -p[1]];
    case 1:
      return [p[2], -p[1]];
    case 2:
      return [p[0], p[2]];
    case 3:
      return [p[0], -p[2]];
    case 4:
      return [p[0], -p[1]];
    default:
      return [-p[0], -p[1]];
  }
}

const clampI16 = (v: number) => Math.max(-32768, Math.min(32767, v));
const clampI8 = (v: number) => Math.max(-127, Math.min(127, v));

function faceNormalOf(p: V3[]): V3 | null {
  return faceNormal(p);
}

/** A quad turned to face `out` (local). */
function b4(b: StructureBuilder, a: V3, c: V3, d: V3, e: V3, out: V3): void {
  b.quadOut(a, c, d, e, out);
}
