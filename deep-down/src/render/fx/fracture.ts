/**
 * BSP fracture of the unit cube (SPEC §11.4): 3 seeded sets of 9-12 convex shards whose volumes sum to 1. A broken
 * cell's front metre is filled by one set at F0, so the hole never shows a 1-frame gap (SPEC §10.5).
 *
 * A convex polyhedron is a list of faces (polygons, counter-clockwise seen from outside). `splitConvex` clips every
 * face by a plane (Sutherland-Hodgman, which keeps the winding) and closes both halves with a cap polygon made of
 * the intersection points, sorted around their centroid. `fracture` splits the largest piece by a plane through a
 * jittered point near its centroid until it has the requested count. Pure and deterministic (tested:
 * tests/unit/idle/fracture.test.ts).
 */

export type Vec3 = [number, number, number];

export interface Face {
  verts: Vec3[];
  normal: Vec3;
}

export interface Convex {
  faces: Face[];
}

export interface Shard {
  /** Triangles (x, y, z per vertex), relative to the shard's centroid. */
  positions: Float32Array;
  normals: Float32Array;
  /** Centroid in cube coordinates ([-0.5, 0.5]³). */
  centroid: Vec3;
  volume: number;
}

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const scale = (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s];
const norm = (a: Vec3): Vec3 => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};

/** The unit cube [-0.5, 0.5]³. */
export function unitCube(): Convex {
  const h = 0.5;
  const v = (x: number, y: number, z: number): Vec3 => [x * h, y * h, z * h];
  return {
    faces: [
      { normal: [1, 0, 0], verts: [v(1, -1, -1), v(1, 1, -1), v(1, 1, 1), v(1, -1, 1)] },
      { normal: [-1, 0, 0], verts: [v(-1, -1, -1), v(-1, -1, 1), v(-1, 1, 1), v(-1, 1, -1)] },
      { normal: [0, 1, 0], verts: [v(-1, 1, -1), v(-1, 1, 1), v(1, 1, 1), v(1, 1, -1)] },
      { normal: [0, -1, 0], verts: [v(-1, -1, -1), v(1, -1, -1), v(1, -1, 1), v(-1, -1, 1)] },
      { normal: [0, 0, 1], verts: [v(-1, -1, 1), v(1, -1, 1), v(1, 1, 1), v(-1, 1, 1)] },
      { normal: [0, 0, -1], verts: [v(-1, -1, -1), v(-1, 1, -1), v(1, 1, -1), v(1, -1, -1)] },
    ],
  };
}

/** Volume by the divergence theorem (fan triangles from each face's first vertex). */
export function volume(p: Convex): number {
  let v = 0;
  for (const f of p.faces) for (let i = 1; i + 1 < f.verts.length; i++) v += dot(f.verts[0], cross(f.verts[i], f.verts[i + 1]));
  return v / 6;
}

/** Volume-weighted centroid. */
export function centroid(p: Convex): Vec3 {
  let vol = 0;
  const c: Vec3 = [0, 0, 0];
  for (const f of p.faces)
    for (let i = 1; i + 1 < f.verts.length; i++) {
      const a = f.verts[0];
      const b = f.verts[i];
      const d = f.verts[i + 1];
      const t = dot(a, cross(b, d)) / 6;
      vol += t;
      for (let k = 0; k < 3; k++) c[k] += (t * (a[k] + b[k] + d[k])) / 4;
    }
  return vol > 0 ? scale(c, 1 / vol) : c;
}

/** Every vertex on the inner side of every face plane (within eps): the shape is convex. */
export function isConvex(p: Convex, eps = 1e-6): boolean {
  for (const f of p.faces) {
    const d = dot(f.normal, f.verts[0]);
    for (const g of p.faces) for (const v of g.verts) if (dot(f.normal, v) - d > eps) return false;
  }
  return true;
}

function dedupe(points: Vec3[], eps = 1e-7): Vec3[] {
  const out: Vec3[] = [];
  for (const p of points) if (!out.some((q) => Math.abs(q[0] - p[0]) < eps && Math.abs(q[1] - p[1]) < eps && Math.abs(q[2] - p[2]) < eps)) out.push(p);
  return out;
}

/** Order coplanar points counter-clockwise around `n`. */
function orderAround(points: Vec3[], n: Vec3): Vec3[] {
  const c = scale(points.reduce<Vec3>((a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]], [0, 0, 0]), 1 / points.length);
  const u = norm(Math.abs(n[0]) < 0.9 ? cross(n, [1, 0, 0]) : cross(n, [0, 1, 0]));
  const w = cross(n, u);
  return points
    .map((p) => ({ p, a: Math.atan2(dot(sub(p, c), w), dot(sub(p, c), u)) }))
    .sort((x, y) => x.a - y.a)
    .map((x) => x.p);
}

/** Split by the plane n·x = d into the part with n·x ≥ d (front) and n·x ≤ d (back); null when a side is empty. */
export function splitConvex(p: Convex, n: Vec3, d: number): [Convex, Convex] | null {
  const front: Face[] = [];
  const back: Face[] = [];
  const onPlane: Vec3[] = [];
  const eps = 1e-9;
  for (const f of p.faces) {
    const fv: Vec3[] = [];
    const bv: Vec3[] = [];
    const m = f.verts.length;
    for (let i = 0; i < m; i++) {
      const a = f.verts[i];
      const b = f.verts[(i + 1) % m];
      const da = dot(n, a) - d;
      const db = dot(n, b) - d;
      if (da >= -eps) fv.push(a);
      if (da <= eps) bv.push(a);
      if (Math.abs(da) <= eps) onPlane.push(a);
      if ((da > eps && db < -eps) || (da < -eps && db > eps)) {
        const t = da / (da - db);
        const x: Vec3 = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
        fv.push(x);
        bv.push(x);
        onPlane.push(x);
      }
    }
    if (dedupe(fv).length >= 3) front.push({ normal: f.normal, verts: dedupe(fv) });
    if (dedupe(bv).length >= 3) back.push({ normal: f.normal, verts: dedupe(bv) });
  }
  const cap = dedupe(onPlane);
  if (cap.length < 3 || !front.length || !back.length) return null;
  const ring = orderAround(cap, n);
  // The back part's cap faces +n (outward from it), the front part's faces -n.
  back.push({ normal: n, verts: ring });
  front.push({ normal: scale(n, -1), verts: [...ring].reverse() });
  const a: Convex = { faces: front };
  const b: Convex = { faces: back };
  if (volume(a) < 1e-4 || volume(b) < 1e-4) return null;
  return [a, b];
}

/** A small deterministic generator (mulberry32). */
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Fracture the unit cube into `pieces` convex parts (seeded). */
export function fractureCube(seed: number, pieces: number): Convex[] {
  const r = rng(seed);
  const parts: Convex[] = [unitCube()];
  let guard = 0;
  while (parts.length < pieces && guard++ < 400) {
    // The largest piece splits next, so shard sizes stay comparable (no slivers next to boulders).
    let bi = 0;
    let bv = -1;
    for (let i = 0; i < parts.length; i++) {
      const v = volume(parts[i]);
      if (v > bv) {
        bv = v;
        bi = i;
      }
    }
    const p = parts[bi];
    const c = centroid(p);
    const th = r() * Math.PI * 2;
    const z = r() * 2 - 1;
    const s = Math.sqrt(1 - z * z);
    // Planes lean toward the cut face's axes a little less often (shards are wedges, not slabs).
    const n = norm([Math.cos(th) * s, Math.sin(th) * s, z * 0.7]);
    const j = 0.12 * Math.cbrt(bv);
    const at: Vec3 = [c[0] + (r() - 0.5) * j, c[1] + (r() - 0.5) * j, c[2] + (r() - 0.5) * j];
    const halves = splitConvex(p, n, dot(n, at));
    if (!halves) continue;
    if (volume(halves[0]) < 0.25 * bv * 0.5 || volume(halves[1]) < 0.25 * bv * 0.5) continue;
    parts.splice(bi, 1, halves[0], halves[1]);
  }
  return parts;
}

/** Triangles of a convex part relative to its centroid. */
export function shardOf(p: Convex): Shard {
  const c = centroid(p);
  const pos: number[] = [];
  const nor: number[] = [];
  for (const f of p.faces)
    for (let i = 1; i + 1 < f.verts.length; i++)
      for (const v of [f.verts[0], f.verts[i], f.verts[i + 1]]) {
        pos.push(v[0] - c[0], v[1] - c[1], v[2] - c[2]);
        nor.push(f.normal[0], f.normal[1], f.normal[2]);
      }
  return { positions: new Float32Array(pos), normals: new Float32Array(nor), centroid: c, volume: volume(p) };
}

let sets: Shard[][] | null = null;

/** The 3 shard sets (9-12 shards each), built once. */
export function shardSets(): Shard[][] {
  if (!sets) sets = [fractureCube(0x5a17, 10), fractureCube(0x9e11, 12), fractureCube(0x31c7, 9)].map((parts) => parts.map(shardOf));
  return sets;
}
