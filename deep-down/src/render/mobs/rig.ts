import * as THREE from 'three';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * The creatures' modelling kit (round 2, MOBS): sculpted primitives merged into ONE geometry per
 * kind, every vertex bound rigidly to a bone (aBone), so a creature with twenty jointed legs is a
 * single draw call that the vertex shader poses from a uniform array of bone matrices.
 *
 * Vertex layout: position, normal (float32), color (rgba float32: linear albedo or glow colour, and
 * opacity for translucent parts), aBone (float), aMat (vec4: emissive, subsurface, gloss, rim).
 */
export const MAX_BONES = 28;

export interface PartLook {
  /** sRGB hex or linear rgb. */
  color: number | [number, number, number];
  /** 0 lit surface .. 1 self-lit (the colour is the glow). */
  emit?: number;
  /** Lantern light passing through thin flesh, wax, jelly (0..1). */
  sss?: number;
  /** Wet or polished: tighter, brighter flame glints (0..1). */
  gloss?: number;
  /** Silhouette rim from the room's light (0..1). */
  rim?: number;
  /** Opacity for translucent materials (1 = opaque). */
  alpha?: number;
  /** A colour gradient along local y (from `color` at y0 to `top` at y1). */
  top?: number;
  y0?: number;
  y1?: number;
  /** Flat facets (crystals, cut stone). */
  flat?: boolean;
}

interface Part {
  geo: THREE.BufferGeometry;
  bone: number;
  look: PartLook;
}

export interface BoneDef {
  parent: number;
  pivot: THREE.Vector3;
  name: string;
}

export interface BuiltModel {
  geometry: THREE.BufferGeometry;
  bones: BoneDef[];
  /** Bone index by name. */
  index: Record<string, number>;
  radius: number;
}

const lin = new THREE.Color();
function linearOf(c: number | [number, number, number]): [number, number, number] {
  if (Array.isArray(c)) return c;
  lin.setHex(c, THREE.SRGBColorSpace);
  return [lin.r, lin.g, lin.b];
}

export class ModelBuilder {
  private readonly parts: Part[] = [];
  readonly bones: BoneDef[] = [];
  readonly index: Record<string, number> = {};

  /** A bone turning about `pivot` (model space, rest pose), under `parent` (-1: the root). */
  bone(name: string, parent: string | number, pivot: [number, number, number]): number {
    const p = typeof parent === 'string' ? this.index[parent] : parent;
    const i = this.bones.length;
    if (i >= MAX_BONES) throw new Error(`mob model: more than ${MAX_BONES} bones`);
    this.bones.push({ parent: p ?? -1, pivot: new THREE.Vector3(...pivot), name });
    this.index[name] = i;
    return i;
  }

  add(geo: THREE.BufferGeometry, bone: string | number, look: PartLook): this {
    const b = typeof bone === 'string' ? this.index[bone] : bone;
    this.parts.push({ geo, bone: b ?? 0, look });
    return this;
  }

  build(): BuiltModel {
    let vCount = 0;
    let iCount = 0;
    const prepared = this.parts.map((p) => {
      let g = p.geo;
      if (p.look.flat) {
        g = g.index ? g.toNonIndexed() : g;
        g.computeVertexNormals();
      } else if (!g.getAttribute('normal')) g.computeVertexNormals();
      const n = g.getAttribute('position').count;
      const idx = g.index ? g.index.count : n;
      vCount += n;
      iCount += idx;
      return { g, n, idx, p };
    });
    const pos = new Float32Array(vCount * 3);
    const nor = new Float32Array(vCount * 3);
    const col = new Float32Array(vCount * 4);
    const bone = new Float32Array(vCount);
    const mat = new Float32Array(vCount * 4);
    const index = new Uint32Array(iCount);
    let v = 0;
    let ii = 0;
    let radius = 0;
    for (const { g, n, p } of prepared) {
      const P = g.getAttribute('position');
      const N = g.getAttribute('normal');
      const L = p.look;
      const c0 = linearOf(L.color);
      const c1 = L.top !== undefined ? linearOf(L.top) : c0;
      const y0 = L.y0 ?? -0.5;
      const y1 = L.y1 ?? 0.5;
      for (let k = 0; k < n; k++) {
        const x = P.getX(k);
        const y = P.getY(k);
        const z = P.getZ(k);
        pos.set([x, y, z], (v + k) * 3);
        nor.set([N.getX(k), N.getY(k), N.getZ(k)], (v + k) * 3);
        const tt = Math.max(0, Math.min(1, (y - y0) / Math.max(1e-4, y1 - y0)));
        const s = tt * tt * (3 - 2 * tt);
        col.set([c0[0] + (c1[0] - c0[0]) * s, c0[1] + (c1[1] - c0[1]) * s, c0[2] + (c1[2] - c0[2]) * s, L.alpha ?? 1], (v + k) * 4);
        bone[v + k] = p.bone;
        mat.set([L.emit ?? 0, L.sss ?? 0, L.gloss ?? 0, L.rim ?? 0.5], (v + k) * 4);
        radius = Math.max(radius, Math.hypot(x, y, z));
      }
      if (g.index) for (let k = 0; k < g.index.count; k++) index[ii++] = g.index.getX(k) + v;
      else for (let k = 0; k < n; k++) index[ii++] = v + k;
      v += n;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geometry.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(col, 4));
    geometry.setAttribute('aBone', new THREE.BufferAttribute(bone, 1));
    geometry.setAttribute('aMat', new THREE.BufferAttribute(mat, 4));
    geometry.setIndex(new THREE.BufferAttribute(index, 1));
    geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), radius * 1.6 + 0.5);
    return { geometry, bones: this.bones, index: this.index, radius };
  }
}

/** Per-instance pose: local rotation, offset and scale per bone, composed into skinning matrices. */
export class Rig {
  readonly rot: THREE.Quaternion[];
  readonly off: THREE.Vector3[];
  readonly scl: THREE.Vector3[];
  /** The uniform array (MAX_BONES matrices, model space). */
  readonly matrices: THREE.Matrix4[];
  private readonly local = new THREE.Matrix4();
  private readonly t1 = new THREE.Matrix4();
  private readonly t2 = new THREE.Matrix4();

  constructor(readonly bones: readonly BoneDef[]) {
    this.rot = bones.map(() => new THREE.Quaternion());
    this.off = bones.map(() => new THREE.Vector3());
    this.scl = bones.map(() => new THREE.Vector3(1, 1, 1));
    this.matrices = Array.from({ length: MAX_BONES }, () => new THREE.Matrix4());
  }

  reset(): void {
    for (let i = 0; i < this.bones.length; i++) {
      this.rot[i].identity();
      this.off[i].set(0, 0, 0);
      this.scl[i].set(1, 1, 1);
    }
  }

  /** Set a bone's rotation from Euler angles (radians, XYZ order). */
  euler(i: number, x: number, y: number, z: number, order: THREE.EulerOrder = 'XYZ'): void {
    if (i === undefined || i < 0) return;
    eul.set(x, y, z, order);
    this.rot[i].setFromEuler(eul);
  }

  /**
   * Add a rotation on top of the one a pose set (round 3: the hit flinch and the death collapse are
   * overlays on every kind's own pose): R = R_pose * R(x, y, z).
   */
  turn(i: number, x: number, y: number, z: number): void {
    if (i === undefined || i < 0 || (x === 0 && y === 0 && z === 0)) return;
    eul.set(x, y, z, 'XYZ');
    tq.setFromEuler(eul);
    this.rot[i].multiply(tq);
  }

  /** Compose: M_b = M_parent * T(pivot + off) * R * S * T(-pivot). Parents come before children. */
  update(): void {
    for (let i = 0; i < this.bones.length; i++) {
      const b = this.bones[i];
      const p = b.pivot;
      this.t1.makeTranslation(-p.x, -p.y, -p.z);
      this.local.compose(tv.copy(p).add(this.off[i]), this.rot[i], this.scl[i]).multiply(this.t1);
      if (b.parent >= 0) this.matrices[i].multiplyMatrices(this.matrices[b.parent], this.local);
      else this.matrices[i].copy(this.local);
    }
    void this.t2;
  }
}

const eul = new THREE.Euler();
const tv = new THREE.Vector3();
const tq = new THREE.Quaternion();

// ---------------------------------------------------------------------------------------
// Primitives (all model space, metres)

/** A smooth ellipsoid, optionally lumpy. */
export function ellipsoid(rx: number, ry: number, rz: number, at: [number, number, number] = [0, 0, 0], seg = 18, lump = 0, seed = 1): THREE.BufferGeometry {
  const g = new THREE.SphereGeometry(1, seg, Math.max(6, Math.round(seg * 0.7)));
  const p = g.getAttribute('position');
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    const z = p.getZ(i);
    const k = lump > 0 ? 1 + lump * fbm3(x * 2.1 + seed, y * 2.1, z * 2.1 - seed) : 1;
    p.setXYZ(i, x * rx * k + at[0], y * ry * k + at[1], z * rz * k + at[2]);
  }
  g.computeVertexNormals();
  return g;
}

/** A tapered limb from a to b (radius ra to rb) with rounded ends. */
export function limb(a: [number, number, number], b: [number, number, number], ra: number, rb: number, seg = 8, out: THREE.BufferGeometry[] = []): THREE.BufferGeometry {
  const va = new THREE.Vector3(...a);
  const vb = new THREE.Vector3(...b);
  const len = va.distanceTo(vb);
  const g = new THREE.CylinderGeometry(rb, ra, len, seg, 3, true);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), vb.clone().sub(va).normalize());
  g.applyQuaternion(q);
  const mid = va.clone().add(vb).multiplyScalar(0.5);
  g.translate(mid.x, mid.y, mid.z);
  const ca = new THREE.SphereGeometry(ra, seg, Math.max(4, seg >> 1)).translate(va.x, va.y, va.z);
  const cb = new THREE.SphereGeometry(rb, seg, Math.max(4, seg >> 1)).translate(vb.x, vb.y, vb.z);
  out.push(ca, cb);
  return merge([g, ca, cb]);
}

/** A crystal: a hexagonal prism with a pointed tip, base at the origin, along +y, then placed. */
export function crystal(len: number, r: number, at: [number, number, number], dir: [number, number, number], twist = 0, sides = 6): THREE.BufferGeometry {
  const pts = [new THREE.Vector2(0, -0.02), new THREE.Vector2(r * 0.78, 0), new THREE.Vector2(r, len * 0.62), new THREE.Vector2(r * 0.35, len * 0.9), new THREE.Vector2(0, len)];
  const g = new THREE.LatheGeometry(pts, sides, twist, Math.PI * 2);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(...dir).normalize());
  g.applyQuaternion(q);
  g.translate(...at);
  return g;
}

/** A lumpy boulder (icosphere displaced by noise, smooth normals). */
export function boulder(r: number, seed: number, amp = 0.22, detail = 4, squash = 0.82): THREE.BufferGeometry {
  let g: THREE.BufferGeometry = new THREE.IcosahedronGeometry(1, detail);
  g.deleteAttribute('normal');
  g.deleteAttribute('uv');
  g = mergeVertices(g);
  const p = g.getAttribute('position');
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    const z = p.getZ(i);
    // Chunky facets: a ridged noise plus a broad lump.
    const k = 1 + amp * (0.65 * fbm3(x * 1.7 + seed, y * 1.7, z * 1.7) + 0.35 * Math.abs(fbm3(x * 4.3, y * 4.3 + seed, z * 4.3)) - 0.15);
    p.setXYZ(i, x * r * k, y * r * k * squash, z * r * k);
  }
  g.computeVertexNormals();
  return g;
}

/** A rounded, bevelled block (cut stone, automaton plates). */
export function block(w: number, h: number, d: number, at: [number, number, number], bevel = 0.06): THREE.BufferGeometry {
  // A box whose edges are chamfered by pulling the corners in (sphere-blended), smooth normals.
  const g = new THREE.BoxGeometry(w, h, d, 3, 3, 3);
  const p = g.getAttribute('position');
  const hx = w / 2;
  const hy = h / 2;
  const hz = d / 2;
  const b = Math.min(bevel, hx * 0.9, hy * 0.9, hz * 0.9);
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    const z = p.getZ(i);
    const ix = Math.max(-hx + b, Math.min(hx - b, x));
    const iy = Math.max(-hy + b, Math.min(hy - b, y));
    const iz = Math.max(-hz + b, Math.min(hz - b, z));
    const dx = x - ix;
    const dy = y - iy;
    const dz = z - iz;
    const l = Math.hypot(dx, dy, dz);
    if (l > 1e-6) p.setXYZ(i, ix + (dx / l) * b, iy + (dy / l) * b, iz + (dz / l) * b);
  }
  g.deleteAttribute('normal');
  g.deleteAttribute('uv');
  const m = mergeVertices(g);
  m.computeVertexNormals();
  m.translate(...at);
  return m;
}

/** A surface of revolution (bells, shells, lantern glass) round +y. */
export function lathe(profile: Array<[number, number]>, seg = 20, at: [number, number, number] = [0, 0, 0]): THREE.BufferGeometry {
  const g = new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), seg);
  g.translate(...at);
  return g;
}

/** A flat wing / fin shape in the xz plane (outline points), slightly cupped, double-sided by the material. */
export function fin(outline: Array<[number, number]>, cup = 0.1): THREE.BufferGeometry {
  const shape = new THREE.Shape(outline.map(([x, z]) => new THREE.Vector2(x, z)));
  const g = new THREE.ShapeGeometry(shape, 6);
  // ShapeGeometry is in xy: lay it in xz and cup it.
  const p = g.getAttribute('position');
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    p.setXYZ(i, x, -cup * (x * x + y * y), y);
  }
  g.computeVertexNormals();
  return g;
}

/** Merge geometries (positions and normals only). */
export function merge(list: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const pos: number[] = [];
  const nor: number[] = [];
  const idx: number[] = [];
  let base = 0;
  for (const g of list) {
    const P = g.getAttribute('position');
    if (!g.getAttribute('normal')) g.computeVertexNormals();
    const N = g.getAttribute('normal');
    for (let i = 0; i < P.count; i++) {
      pos.push(P.getX(i), P.getY(i), P.getZ(i));
      nor.push(N.getX(i), N.getY(i), N.getZ(i));
    }
    if (g.index) for (let i = 0; i < g.index.count; i++) idx.push(g.index.getX(i) + base);
    else for (let i = 0; i < P.count; i++) idx.push(i + base);
    base += P.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  out.setIndex(idx);
  return out;
}

/** Apply a transform to a geometry (returns it). */
export function place(g: THREE.BufferGeometry, at: [number, number, number], rot: [number, number, number] = [0, 0, 0], scale: [number, number, number] = [1, 1, 1]): THREE.BufferGeometry {
  const m = new THREE.Matrix4().compose(new THREE.Vector3(...at), new THREE.Quaternion().setFromEuler(new THREE.Euler(...rot)), new THREE.Vector3(...scale));
  g.applyMatrix4(m);
  return g;
}

// Cheap deterministic value noise for modelling (not per frame).
function hash(x: number, y: number, z: number): number {
  let h = Math.imul(x | 0, 0x8da6b343) ^ Math.imul(y | 0, 0xd8163841) ^ Math.imul(z | 0, 0xcb1ab31f);
  h = Math.imul(h ^ (h >>> 13), 0x5bd1e995);
  return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
}

export function noise3(x: number, y: number, z: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const zi = Math.floor(z);
  const xf = x - xi;
  const yf = y - yi;
  const zf = z - zi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const w = zf * zf * (3 - 2 * zf);
  const l = (a: number, b: number, t: number) => a + (b - a) * t;
  const c = (dx: number, dy: number, dz: number) => hash(xi + dx, yi + dy, zi + dz);
  return l(l(l(c(0, 0, 0), c(1, 0, 0), u), l(c(0, 1, 0), c(1, 1, 0), u), v), l(l(c(0, 0, 1), c(1, 0, 1), u), l(c(0, 1, 1), c(1, 1, 1), u), v), w) * 2 - 1;
}

export function fbm3(x: number, y: number, z: number): number {
  return noise3(x, y, z) * 0.6 + noise3(x * 2.03, y * 2.03, z * 2.03) * 0.28 + noise3(x * 4.1, y * 4.1, z * 4.1) * 0.12;
}
