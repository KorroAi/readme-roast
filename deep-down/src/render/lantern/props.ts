// Procedural prop geometry in the Lantern Voxel language (W1-LEAD §1, §4 "a huge improvement in visual detail"; ported
// and extended from reference/spike-lantern/src/props.ts). Every built edge is bevelled; valuables are real 3D objects.
// Builders merge into one geometry per material (one draw call each) with the prop surface's attributes:
//   PropBuilder: position, normal, uv (metres), aProp (layer, tint, seed, glow)  → propSurface 'prop' or 'glow'
//   CrystalBuilder: position, normal, aCry (axial t, facet u, facet v, palette)  → propSurface 'crystal'

import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { LAYER } from './layers';
import { TINT } from './propSurface';

/** Seeded PRNG (mulberry32). */
export function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const Y = new THREE.Vector3(0, 1, 0);
const X = new THREE.Vector3(1, 0, 0);
const tmpM = new THREE.Matrix4();
const tmpQ = new THREE.Quaternion();
const tmpS = new THREE.Vector3();

/** A material spec for a prop part: texture layer, tint, glow class (propSurface). */
export interface Finish {
  layer: number;
  tint?: number;
  glow?: number;
}
export const WOOD: Finish = { layer: LAYER.timber };
export const OLD_WOOD: Finish = { layer: LAYER.timber, tint: TINT.oldWood };
export const IRON: Finish = { layer: LAYER.iron, tint: TINT.darkIron };
export const BRASS: Finish = { layer: LAYER.brass, tint: TINT.brass };
export const GOLD: Finish = { layer: LAYER.brass, tint: TINT.gold };
export const STONE: Finish = { layer: LAYER.slate };
export const MASONRY: Finish = { layer: LAYER.masonry };
export const ROOT: Finish = { layer: LAYER.rootwood };
export const ROPE: Finish = { layer: LAYER.timber, tint: TINT.rope };
export const CHALK: Finish = { layer: LAYER.masonry, tint: TINT.chalk };
export const RUNE: Finish = { layer: LAYER.masonry, tint: TINT.rune };
export const WEB: Finish = { layer: LAYER.slate, tint: TINT.web };

export class PropBuilder {
  pos: number[] = [];
  nrm: number[] = [];
  uv: number[] = [];
  prop: number[] = [];
  idx: number[] = [];

  get vertexCount(): number {
    return this.pos.length / 3;
  }

  /** Add a three geometry under a matrix; uv = its own uvs × uvScale (metres), or a box projection when absent. */
  geometry(g: THREE.BufferGeometry, m: THREE.Matrix4, f: Finish, seed = 0.5, uvScale = 1): void {
    const p = g.getAttribute('position'), n = g.getAttribute('normal'), uv = g.getAttribute('uv');
    const nm = new THREE.Matrix3().getNormalMatrix(m);
    const base = this.pos.length / 3;
    const v = new THREE.Vector3(), nn = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i).applyMatrix4(m);
      nn.fromBufferAttribute(n, i).applyMatrix3(nm).normalize();
      this.pos.push(v.x, v.y, v.z);
      this.nrm.push(nn.x, nn.y, nn.z);
      if (uv) this.uv.push(uv.getX(i) * uvScale, uv.getY(i) * uvScale);
      else {
        const ax = Math.abs(nn.x), ay = Math.abs(nn.y);
        this.uv.push(ax > 0.6 ? v.z : v.x, ay > 0.6 ? v.z : v.y);
      }
      this.prop.push(f.layer, f.tint ?? 0, seed, f.glow ?? 0);
    }
    if (g.index) for (let i = 0; i < g.index.count; i++) this.idx.push(base + g.index.getX(i));
    else for (let i = 0; i < p.count; i++) this.idx.push(base + i);
  }

  /** A bevelled box (chamfer `bevel` m) centred at c, half sizes h, rotation q. UVs in metres. */
  box(c: THREE.Vector3Like, h: THREE.Vector3Like, q: THREE.Quaternion, f: Finish, seed = 0.5, bevel = 0.02): void {
    const w = h.x * 2, hh = h.y * 2, d = h.z * 2;
    const r = Math.min(bevel, w / 2.2, hh / 2.2, d / 2.2);
    const g = r > 0.002 ? new RoundedBoxGeometry(w, hh, d, 1, r) : new THREE.BoxGeometry(w, hh, d);
    // Metric uvs: rebuild from positions (RoundedBox's uvs are per face 0..1).
    const p = g.getAttribute('position'), n = g.getAttribute('normal');
    const uv = new Float32Array(p.count * 2);
    for (let i = 0; i < p.count; i++) {
      const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i));
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      if (ax >= ay && ax >= az) uv.set([z, y], i * 2);
      else if (ay >= az) uv.set([x, z], i * 2);
      else uv.set([x, y], i * 2);
    }
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    this.geometry(g, tmpM.compose(new THREE.Vector3(c.x, c.y, c.z), q, tmpS.set(1, 1, 1)), f, seed);
    g.dispose();
  }

  /** A lathed or extruded cylinder from a to b (radius r0 at a, r1 at b), `sides` facets. */
  cylinder(a: THREE.Vector3, b: THREE.Vector3, r0: number, r1: number, f: Finish, sides = 8, seed = 0.5, caps = true): void {
    const dir = b.clone().sub(a);
    const len = dir.length();
    const g = new THREE.CylinderGeometry(r1, r0, len, sides, 1, !caps);
    const uv = g.getAttribute('uv');
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * Math.PI * 2 * Math.max(r0, r1), uv.getY(i) * len);
    tmpQ.setFromUnitVectors(Y, dir.normalize());
    this.geometry(g, tmpM.compose(a.clone().lerp(b, 0.5), tmpQ, tmpS.set(1, 1, 1)), f, seed);
    g.dispose();
  }

  build(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nrm, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('aProp', new THREE.Float32BufferAttribute(this.prop, 4));
    g.setIndex(this.pos.length / 3 > 65535 ? new THREE.Uint32BufferAttribute(this.idx, 1) : new THREE.Uint16BufferAttribute(this.idx, 1));
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return g;
  }
}

// ------------------------------------------------------------------------------------------------------- crystals
export class CrystalBuilder {
  pos: number[] = [];
  nrm: number[] = [];
  cry: number[] = [];
  private tri(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, ca: number[], cb: number[], cc: number[]): void {
    const n = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a)).normalize();
    for (const [p, q] of [[a, ca], [b, cb], [c, cc]] as Array<[THREE.Vector3, number[]]>) {
      this.pos.push(p.x, p.y, p.z);
      this.nrm.push(n.x, n.y, n.z);
      this.cry.push(q[0], q[1], q[2], q[3]);
    }
  }
  /** One crystal: an irregular prism (6–8 sides) with a pyramidal tip. */
  crystal(base: THREE.Vector3, dir: THREE.Vector3, len: number, radius: number, pal: number, seed: number, sides = 6): void {
    const r = rng(seed);
    const d = dir.clone().normalize();
    const t1 = new THREE.Vector3().crossVectors(d, Math.abs(d.y) < 0.9 ? Y : X).normalize();
    const t2 = new THREE.Vector3().crossVectors(d, t1);
    const tipLen = len * (0.22 + r() * 0.12);
    const bodyLen = len - tipLen;
    const rot = r() * Math.PI * 2;
    const ring = (h: number, scale: number) => {
      const out: THREE.Vector3[] = [];
      for (let i = 0; i < sides; i++) {
        const a = rot + (i / sides) * Math.PI * 2;
        const rr = radius * scale * (0.86 + 0.28 * ((Math.sin(seed * 3.1 + i * 2.3) + 1) / 2));
        out.push(base.clone().addScaledVector(d, h).addScaledVector(t1, Math.cos(a) * rr).addScaledVector(t2, Math.sin(a) * rr));
      }
      return out;
    };
    const b0 = ring(-radius * 0.6, 0.92);
    const b1 = ring(bodyLen, 1.0);
    const apex = base.clone().addScaledVector(d, len).addScaledVector(t1, (r() - 0.5) * radius * 0.3).addScaledVector(t2, (r() - 0.5) * radius * 0.3);
    const tBody = bodyLen / len;
    for (let i = 0; i < sides; i++) {
      const j = (i + 1) % sides;
      this.tri(b0[i], b0[j], b1[j], [0, 0, 0, pal], [0, 1, 0, pal], [tBody, 1, 1, pal]);
      this.tri(b0[i], b1[j], b1[i], [0, 0, 0, pal], [tBody, 1, 1, pal], [tBody, 0, 1, pal]);
      this.tri(b1[i], b1[j], apex, [tBody, 3, 0, pal], [tBody, 2, 1, pal], [1, 2, 0, pal]);
    }
  }
  /** A cluster of 3–9 crystals fanning out around an axis. */
  cluster(base: THREE.Vector3, axis: THREE.Vector3, count: number, size: number, spread: number, pal: number | ((i: number) => number), seed: number): void {
    const r = rng(seed);
    const ax = axis.clone().normalize();
    const t1 = new THREE.Vector3().crossVectors(ax, Math.abs(ax.y) < 0.9 ? Y : X).normalize();
    const t2 = new THREE.Vector3().crossVectors(ax, t1);
    for (let i = 0; i < count; i++) {
      const main = i === 0;
      const a = r() * Math.PI * 2;
      const tilt = main ? r() * 0.12 : spread * (0.35 + r() * 0.65);
      const dir = ax.clone().multiplyScalar(Math.cos(tilt)).addScaledVector(t1, Math.sin(tilt) * Math.cos(a)).addScaledVector(t2, Math.sin(tilt) * Math.sin(a));
      const len = size * (main ? 1 : 0.35 + r() * 0.5);
      const rad = len * (0.16 + r() * 0.06);
      const off = main ? 0 : size * 0.12 * (0.5 + r());
      const p = base.clone().addScaledVector(t1, Math.cos(a) * off).addScaledVector(t2, Math.sin(a) * off);
      this.crystal(p, dir, len, rad, typeof pal === 'number' ? pal : pal(i), seed * 31 + i * 7, 6 + (i % 3 === 2 ? 2 : 0));
    }
  }
  build(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nrm, 3));
    g.setAttribute('aCry', new THREE.Float32BufferAttribute(this.cry, 4));
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return g;
  }
}

// ----------------------------------------------------------------------------------------------- the prop library
const qY = (a: number) => new THREE.Quaternion().setFromAxisAngle(Y, a);
const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

/** The treasure chest (planked body, arched lid of slats, iron bands, corners, a gold lock plate). Local frame: base
 *  centre at the origin, front toward +z. Returns its size. `lid` 0..1 opens the lid about the back edge. */
export function chest(pb: PropBuilder, at: THREE.Vector3, yaw: number, lid = 0, band: Finish = IRON): THREE.Vector3 {
  const q = qY(yaw);
  const W = 0.36, D = 0.24, H = 0.32;
  const L = (x: number, y: number, z: number) => V(x, y, z).applyQuaternion(q).add(at);
  pb.box(L(0, H / 2, 0), V(W, H / 2, D), q, WOOD, 0.41, 0.015);
  // Lid: 6 slats on a half cylinder along x, hinged at the back top edge.
  const R = D, seg = 6, lidY = H + 0.01;
  const open = lid * 1.75;
  const hinge = V(0, lidY, -D);
  const lidQ = new THREE.Quaternion().setFromAxisAngle(X, -open);
  const LL = (x: number, y: number, z: number) => V(x, y, z).sub(hinge).applyQuaternion(lidQ).add(hinge).applyQuaternion(q).add(at);
  for (let i = 0; i < seg; i++) {
    const a0 = (i / seg) * Math.PI, a1 = ((i + 1) / seg) * Math.PI, am = (a0 + a1) / 2;
    const cy = lidY + Math.sin(am) * R * 0.62, cz = Math.cos(am) * R;
    const qs = q.clone().multiply(lidQ).multiply(new THREE.Quaternion().setFromAxisAngle(X, -(am - Math.PI / 2) * 0.95));
    const half = Math.hypot(Math.cos(a1) - Math.cos(a0), (Math.sin(a1) - Math.sin(a0)) * 0.62) * R * 0.5 + 0.004;
    pb.box(LL(0, cy, cz), V(W + 0.006, 0.017, half), qs, WOOD, 0.6 + i * 0.05, 0.006);
  }
  for (const sx of [-1, 1]) pb.box(LL(sx * (W + 0.004), lidY + R * 0.3, 0), V(0.012, R * 0.3, D * 0.98), q.clone().multiply(lidQ), WOOD, 0.2, 0.004);
  for (const bx of [-W * 0.62, W * 0.62]) {
    pb.box(L(bx, H / 2, D + 0.008), V(0.03, H / 2, 0.01), q, band, 0.3, 0.004);
    pb.box(L(bx, H / 2, -D - 0.008), V(0.03, H / 2, 0.01), q, band, 0.3, 0.004);
    for (let i = 0; i < seg; i++) {
      const am = ((i + 0.5) / seg) * Math.PI;
      const cy = lidY + Math.sin(am) * (R + 0.016) * 0.62, cz = Math.cos(am) * (R + 0.016);
      const qs = q.clone().multiply(lidQ).multiply(new THREE.Quaternion().setFromAxisAngle(X, -(am - Math.PI / 2) * 0.95));
      pb.box(LL(bx, cy, cz), V(0.032, 0.009, R * 0.29), qs, band, 0.3, 0.003);
    }
  }
  pb.box(L(0, H - 0.02, 0), V(W + 0.012, 0.028, D + 0.012), q, band, 0.25, 0.006);
  pb.box(L(0, 0.024, 0), V(W + 0.01, 0.024, D + 0.01), q, band, 0.25, 0.006);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) pb.box(L(sx * (W - 0.005), H / 2, sz * (D - 0.005)), V(0.02, H / 2 + 0.004, 0.02), q, band, 0.25, 0.004);
  // Gold lock plate, a dark keyhole, two rivets.
  pb.box(LL(0, H - 0.03, D + 0.022), V(0.055, 0.07, 0.011), q.clone().multiply(lidQ), GOLD, 0.3, 0.008);
  pb.box(LL(0, H - 0.045, D + 0.034), V(0.011, 0.02, 0.004), q.clone().multiply(lidQ), IRON, 0.3, 0.002);
  return V(W * 2, H + R * 0.62, D * 2);
}

/** Hanging roots: tapered tubes drooping from the ceiling, a few rootlets. */
export function roots(pb: PropBuilder, anchors: ReadonlyArray<readonly [THREE.Vector3, number]>, seed: number, f: Finish = ROOT): void {
  const r = rng(seed);
  for (const [top, length] of anchors) {
    const strands = 1 + Math.floor(r() * 2);
    for (let s = 0; s < strands; s++) {
      const pts: THREE.Vector3[] = [];
      const sway = V((r() - 0.5) * 0.5, 0, (r() - 0.5) * 0.5);
      const Ln = length * (0.6 + 0.4 * r());
      for (let i = 0; i <= 6; i++) {
        const t = i / 6;
        pts.push(top.clone().add(V(sway.x * t * t + Math.sin(t * 5 + s) * 0.04, -Ln * t, sway.z * t * t + Math.cos(t * 4 + s) * 0.04)));
      }
      pts[0].y += 0.15;
      const curve = new THREE.CatmullRomCurve3(pts);
      const r0 = 0.04 + r() * 0.03;
      const segs = 16, radial = 6;
      const tube = new THREE.TubeGeometry(curve, segs, r0, radial, false);
      const p = tube.getAttribute('position');
      for (let i = 0; i <= segs; i++) {
        const c = curve.getPointAt(i / segs);
        const k = 1 - 0.85 * Math.pow(i / segs, 1.3);
        for (let j = 0; j <= radial; j++) {
          const vi = i * (radial + 1) + j;
          const v = new THREE.Vector3().fromBufferAttribute(p, vi).sub(c).multiplyScalar(k).add(c);
          p.setXYZ(vi, v.x, v.y, v.z);
        }
      }
      tube.computeVertexNormals();
      pb.geometry(tube, new THREE.Matrix4(), f, r(), 2.5);
      tube.dispose();
    }
  }
}

/** Low-poly pebbles and rubble on floor points [position, size]. */
export function pebbles(pb: PropBuilder, spots: ReadonlyArray<readonly [THREE.Vector3, number]>, seed: number, f: Finish = STONE): void {
  const r = rng(seed);
  const base = new THREE.IcosahedronGeometry(1, 0);
  const m = new THREE.Matrix4();
  for (const [p, size] of spots) {
    m.compose(
      p.clone().add(V(0, size * 0.22, 0)),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(r() * 6, r() * 6, r() * 6)),
      V(size * (0.8 + r() * 0.5), size * (0.45 + r() * 0.25), size * (0.8 + r() * 0.5)),
    );
    pb.geometry(base, m, f, r(), size * 3);
  }
  base.dispose();
}

/** Dripstone: a tapered, slightly bent stalactite (down) or stalagmite (up) as a lathe of 7 sides with rings. */
export function dripstone(pb: PropBuilder, root: THREE.Vector3, length: number, radius: number, up: boolean, seed: number, f: Finish = STONE): void {
  const r = rng(seed);
  const pts: THREE.Vector2[] = [];
  const n = 7;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const w = radius * Math.pow(1 - t, 1.25) * (1 + 0.12 * Math.sin(t * 13 + seed)) + 0.006;
    pts.push(new THREE.Vector2(w, t * length));
  }
  const g = new THREE.LatheGeometry(pts, 7);
  // Bend: lean the tip a little.
  const p = g.getAttribute('position');
  const lean = V((r() - 0.5) * 0.25, 0, (r() - 0.5) * 0.25);
  for (let i = 0; i < p.count; i++) {
    const t = p.getY(i) / length;
    p.setXYZ(i, p.getX(i) + lean.x * t * t * length, p.getY(i), p.getZ(i) + lean.z * t * t * length);
  }
  g.computeVertexNormals();
  const q = up ? new THREE.Quaternion() : new THREE.Quaternion().setFromAxisAngle(X, Math.PI);
  pb.geometry(g, new THREE.Matrix4().compose(root, q.multiply(qY(r() * 6.28)), V(1, 1, 1)), f, r(), 1);
  g.dispose();
}

/** A Halden timber set: two posts and a cap with iron straps and nail heads; `w` clear width, `h` clear height. The
 *  frame's local x is across the drift, z along it. */
export function timberSet(pb: PropBuilder, base: THREE.Vector3, yaw: number, w: number, h: number, seed: number): void {
  const q = qY(yaw);
  const r = rng(seed);
  const L = (x: number, y: number, z: number) => V(x, y, z).applyQuaternion(q).add(base);
  const t = 0.11;
  const lean = 0.05;
  for (const sx of [-1, 1]) {
    const tilt = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1).applyQuaternion(q), sx * lean * 0.5);
    pb.box(L(sx * (w / 2 + t / 2 - lean * 0.25), h / 2, 0), V(t / 2, h / 2, t / 2), tilt.multiply(q.clone()), OLD_WOOD, r(), 0.018);
    // An iron strap near the top of each post.
    pb.box(L(sx * (w / 2 + t / 2 - lean * 0.4), h - 0.22, 0), V(t / 2 + 0.008, 0.03, t / 2 + 0.008), q, IRON, r(), 0.004);
  }
  pb.box(L(0, h + t / 2, 0), V(w / 2 + t + 0.08, t / 2 + 0.01, t / 2 + 0.01), q, OLD_WOOD, r(), 0.02);
  // Wedges between cap and posts, nail heads on the cap.
  for (const sx of [-1, 1]) {
    pb.box(L(sx * (w / 2 + t / 2), h - 0.02, t / 2 + 0.02), V(0.05, 0.035, 0.02), q, WOOD, r(), 0.006);
    for (const dz of [-0.03, 0.03]) pb.box(L(sx * (w / 2 + t / 2), h + t / 2, t / 2 + 0.012 + dz * 0), V(0.012, 0.012, 0.006), q, IRON, r(), 0.003);
  }
}

/** Rails with sleepers every 0.6 m and spikes, from a to b on the floor (gauge 0.6 m). */
export function rails(pb: PropBuilder, a: THREE.Vector3, b: THREE.Vector3, seed: number): void {
  const r = rng(seed);
  const dir = b.clone().sub(a);
  const len = dir.length();
  dir.normalize();
  const side = new THREE.Vector3().crossVectors(Y, dir).normalize();
  const yaw = Math.atan2(dir.x, dir.z);
  const q = qY(yaw);
  for (let s = 0.3; s < len; s += 0.6) {
    const c = a.clone().addScaledVector(dir, s);
    const jit = (r() - 0.5) * 0.06;
    pb.box(c.clone().add(V(0, 0.035, 0)).addScaledVector(side, jit), V(0.5, 0.035, 0.08), q.clone().multiply(qY((r() - 0.5) * 0.06)), OLD_WOOD, r(), 0.012);
    for (const g of [-0.3, 0.3]) {
      const sp = c.clone().addScaledVector(side, g + 0.05 * Math.sign(g)).add(V(0, 0.08, 0));
      pb.box(sp, V(0.012, 0.012, 0.012), q, IRON, r(), 0.003);
    }
  }
  for (const g of [-0.3, 0.3]) {
    const o = side.clone().multiplyScalar(g);
    pb.box(a.clone().add(b).multiplyScalar(0.5).add(o).add(V(0, 0.095, 0)), V(0.022, 0.025, len / 2), q, IRON, r(), 0.006);
  }
}

/** A chain of oval links from a to b (link length ~0.09 m). */
export function chain(pb: PropBuilder, a: THREE.Vector3, b: THREE.Vector3, sag: number, f: Finish = IRON, link = 0.09): void {
  const len = a.distanceTo(b);
  const n = Math.max(2, Math.round(len / (link * 0.8)));
  const torus = new THREE.TorusGeometry(link * 0.32, link * 0.09, 4, 8);
  torus.scale(1, 1.6, 1);
  const m = new THREE.Matrix4();
  for (let i = 0; i < n; i++) {
    const t0 = i / n, t1 = (i + 1) / n;
    const p0 = a.clone().lerp(b, t0), p1 = a.clone().lerp(b, t1);
    p0.y -= Math.sin(Math.PI * t0) * sag;
    p1.y -= Math.sin(Math.PI * t1) * sag;
    const mid = p0.clone().add(p1).multiplyScalar(0.5);
    const d = p1.clone().sub(p0).normalize();
    const qq = new THREE.Quaternion().setFromUnitVectors(Y, d).multiply(qY(i % 2 ? Math.PI / 2 : 0));
    m.compose(mid, qq, V(1, 1, 1));
    pb.geometry(torus, m, f, (i * 0.37) % 1, 0.3);
  }
  torus.dispose();
}

/** A rope from a to b with a sag (a twisted tube). */
export function rope(pb: PropBuilder, a: THREE.Vector3, b: THREE.Vector3, sag: number, radius = 0.025): void {
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= 8; i++) {
    const t = i / 8;
    const p = a.clone().lerp(b, t);
    p.y -= Math.sin(Math.PI * t) * sag;
    pts.push(p);
  }
  const tube = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 16, radius, 5, false);
  pb.geometry(tube, new THREE.Matrix4(), ROPE, 0.4, 1.5);
  tube.dispose();
}

/** A Halden lamp on a bracket (post or wall): bracket, hood, glass cage and the burner. Returns the flame position.
 *  The glass and flame go to `glow` (lit only when the lamp is lit: aInst.y on an instanced glow mesh, or uGlow). */
export function haldenLamp(pb: PropBuilder, glow: PropBuilder, at: THREE.Vector3, yaw: number, post: boolean, seed: number): THREE.Vector3 {
  const q = qY(yaw);
  const L = (x: number, y: number, z: number) => V(x, y, z).applyQuaternion(q).add(at);
  if (post) {
    pb.box(L(0, 0.75, 0), V(0.06, 0.75, 0.06), q, OLD_WOOD, 0.3, 0.015);
    pb.box(L(0, 0.04, 0), V(0.14, 0.04, 0.14), q, MASONRY, 0.5, 0.012);
    pb.box(L(0, 1.48, 0.12), V(0.025, 0.025, 0.16), q, IRON, 0.2, 0.004);
  }
  const top = post ? L(0, 1.42, 0.27) : L(0, 0, 0.2);
  const lq = q;
  const T = (x: number, y: number, z: number) => V(x, y, z).applyQuaternion(lq).add(top);
  // Hook, hood, cage posts, base.
  pb.cylinder(T(0, 0.02, 0), T(0, 0.08, 0), 0.008, 0.008, IRON, 5, seed);
  pb.cylinder(T(0, -0.04, 0), T(0, 0.02, 0), 0.09, 0.03, IRON, 6, seed);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    pb.box(T(Math.cos(a) * 0.06, -0.14, Math.sin(a) * 0.06), V(0.008, 0.1, 0.008), lq, IRON, seed, 0.002);
  }
  pb.cylinder(T(0, -0.27, 0), T(0, -0.23, 0), 0.075, 0.07, BRASS, 6, seed);
  // The glass (glow) and the burner flame.
  const gl = new THREE.CylinderGeometry(0.052, 0.052, 0.17, 6, 1, true);
  glow.geometry(gl, new THREE.Matrix4().compose(T(0, -0.14, 0), lq, V(1, 1, 1)), { layer: 0, glow: 1 }, seed);
  gl.dispose();
  return T(0, -0.15, 0);
}

/** A carved octagon plaque (Halden signage) on a wall: a bevelled plate with a brass rim and carved rune grooves. */
export function plaque(pb: PropBuilder, at: THREE.Vector3, normal: THREE.Vector3, size: number, seed: number): void {
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal.clone().normalize());
  const L = (x: number, y: number, z: number) => V(x, y, z).applyQuaternion(q).add(at);
  const oct = new THREE.CylinderGeometry(size, size, 0.04, 8, 1, false);
  oct.rotateX(Math.PI / 2);
  oct.rotateZ(Math.PI / 8);
  pb.geometry(oct, new THREE.Matrix4().compose(L(0, 0, 0.02), q, V(1, 1, 1)), MASONRY, seed);
  const rim = new THREE.TorusGeometry(size * 0.98, 0.012, 3, 8);
  rim.rotateZ(Math.PI / 8);
  pb.geometry(rim, new THREE.Matrix4().compose(L(0, 0, 0.042), q, V(1, 1, 1)), BRASS, seed);
  oct.dispose();
  rim.dispose();
  // Rune strokes: thin raised bars in rune cyan (carved script: emission only in the groove via the tint).
  const r = rng(seed * 977);
  for (let i = 0; i < 4; i++) {
    const a = r() * Math.PI;
    const l = size * (0.3 + r() * 0.4);
    pb.box(L((r() - 0.5) * size * 0.8, (r() - 0.5) * size * 0.8, 0.045), V(l / 2, 0.008, 0.004), q.clone().multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), a)), RUNE, r(), 0.002);
  }
}

/** A cobweb in a corner (decor only, never tappable): a few radial strands and two spiral rings. */
export function cobweb(pb: PropBuilder, corner: THREE.Vector3, u: THREE.Vector3, v: THREE.Vector3, size: number, seed: number): void {
  const r = rng(seed);
  const strands = 5;
  const tips: THREE.Vector3[] = [];
  for (let i = 0; i < strands; i++) {
    const t = i / (strands - 1);
    const d = u.clone().multiplyScalar(Math.cos(t * Math.PI * 0.5)).add(v.clone().multiplyScalar(Math.sin(t * Math.PI * 0.5)));
    const tip = corner.clone().addScaledVector(d, size * (0.8 + r() * 0.3));
    tips.push(tip);
    pb.cylinder(corner, tip, 0.0025, 0.0025, WEB, 3, r(), false);
  }
  for (const k of [0.45, 0.75])
    for (let i = 0; i < strands - 1; i++) {
      const a = corner.clone().lerp(tips[i], k), b = corner.clone().lerp(tips[i + 1], k);
      a.addScaledVector(u.clone().add(v).normalize(), -0.02);
      pb.cylinder(a, b, 0.002, 0.002, WEB, 3, r(), false);
    }
}

/** Ore nuggets half-sunk in a wall face: `count` angular 6–20 cm nuggets around `c` on the plane of normal `n`. */
export function nuggets(pb: PropBuilder, c: THREE.Vector3, n: THREE.Vector3, spread: number, count: number, tint: number, seed: number): void {
  const r = rng(seed);
  const nn = n.clone().normalize();
  const t1 = new THREE.Vector3().crossVectors(nn, Math.abs(nn.y) < 0.9 ? Y : X).normalize();
  const t2 = new THREE.Vector3().crossVectors(nn, t1);
  const g = new THREE.DodecahedronGeometry(1, 0);
  const m = new THREE.Matrix4();
  for (let i = 0; i < count; i++) {
    const a = r() * Math.PI * 2, d = Math.sqrt(r()) * spread;
    const s = 0.035 + r() * r() * 0.07;
    const p = c.clone().addScaledVector(t1, Math.cos(a) * d).addScaledVector(t2, Math.sin(a) * d).addScaledVector(nn, s * 0.15);
    m.compose(p, new THREE.Quaternion().setFromEuler(new THREE.Euler(r() * 6, r() * 6, r() * 6)), V(s * (0.8 + r() * 0.5), s * (0.7 + r() * 0.4), s * (0.8 + r() * 0.5)));
    pb.geometry(g, m, { layer: LAYER.brass, tint }, r(), 0.4);
  }
  g.dispose();
}
