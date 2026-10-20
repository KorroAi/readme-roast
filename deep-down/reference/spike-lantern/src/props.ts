// Procedural props: crystal clusters and gems (faceted, emissive), the treasure chest, hanging roots, floor pebbles,
// the first-person lantern and volumetric light shafts. All merged per material: one draw call each.

import * as THREE from 'three';
import { LAYER } from './grid';
import { rng } from './util';

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
  /** One crystal: an irregular prism with a pyramidal tip. */
  crystal(base: THREE.Vector3, dir: THREE.Vector3, len: number, radius: number, pal: number, seed: number, sides = 6): void {
    const r = rng(seed);
    const d = dir.clone().normalize();
    const t1 = new THREE.Vector3().crossVectors(d, Math.abs(d.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0)).normalize();
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
      // Tip facet: barycentric coordinates flagged by +2 in the facet u.
      this.tri(b1[i], b1[j], apex, [tBody, 3, 0, pal], [tBody, 2, 1, pal], [1, 2, 0, pal]);
    }
  }
  /** A cluster of crystals fanning out around an axis. */
  cluster(base: THREE.Vector3, axis: THREE.Vector3, count: number, size: number, spread: number, pal: number | ((i: number) => number), seed: number): void {
    const r = rng(seed);
    const ax = axis.clone().normalize();
    const t1 = new THREE.Vector3().crossVectors(ax, Math.abs(ax.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0)).normalize();
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
      this.crystal(p, dir, len, rad, typeof pal === 'number' ? pal : pal(i), seed * 31 + i * 7);
    }
  }
  build(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nrm, 3));
    g.setAttribute('aCry', new THREE.Float32BufferAttribute(this.cry, 4));
    g.computeBoundingSphere();
    return g;
  }
}

// ---------------------------------------------------------------------------------------- world-shader prop meshes
/** Geometry with the world shader's attributes (position, normal, aTangent, uv, aMat). */
export class PropBuilder {
  pos: number[] = [];
  nrm: number[] = [];
  tan: number[] = [];
  uv: number[] = [];
  mat: number[] = [];
  idx: number[] = [];
  private vert(p: THREE.Vector3, n: THREE.Vector3, t: THREE.Vector3, u: number, v: number, layer: number, seed: number, tint: number): number {
    this.pos.push(p.x, p.y, p.z);
    this.nrm.push(n.x, n.y, n.z);
    this.tan.push(t.x, t.y, t.z);
    this.uv.push(u, v);
    this.mat.push(layer, seed, 0, tint);
    return this.pos.length / 3 - 1;
  }
  /** Oriented box (center, half sizes, rotation), texture `scale` metres per tile. */
  box(c: THREE.Vector3, h: THREE.Vector3, q: THREE.Quaternion, layer: number, tint = 0, scale = 0.5, seed = 0.5): void {
    const axes = [new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1)].map((a) => a.applyQuaternion(q));
    const hs = [h.x, h.y, h.z];
    for (let a = 0; a < 3; a++)
      for (const s of [1, -1]) {
        const u = (a + 1) % 3, v = (a + 2) % 3;
        const n = axes[a].clone().multiplyScalar(s);
        // Order corners so (U x V) points along n.
        const U = axes[s > 0 ? u : v], V = axes[s > 0 ? v : u];
        const hu = hs[s > 0 ? u : v], hv = hs[s > 0 ? v : u];
        const center = c.clone().addScaledVector(axes[a], s * hs[a]);
        const base = this.pos.length / 3;
        for (const [du, dv] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
          const p = center.clone().addScaledVector(U, du * hu).addScaledVector(V, dv * hv);
          this.vert(p, n, U, (du * hu + hu) / scale, (dv * hv + hv) / scale, layer, seed, tint);
        }
        this.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
      }
  }
  /** Generic: add a three geometry (non-indexed or indexed) with a planar uv from its own uvs. */
  geometry(g: THREE.BufferGeometry, m: THREE.Matrix4, layer: number, tint = 0, uvScale = 1, seed = 0.5): void {
    const gi = g.index ? g : g;
    const p = gi.getAttribute('position'), n = gi.getAttribute('normal'), uv = gi.getAttribute('uv');
    const nm = new THREE.Matrix3().getNormalMatrix(m);
    const base = this.pos.length / 3;
    for (let i = 0; i < p.count; i++) {
      const v = new THREE.Vector3().fromBufferAttribute(p, i).applyMatrix4(m);
      const nn = new THREE.Vector3().fromBufferAttribute(n, i).applyMatrix3(nm).normalize();
      const t = new THREE.Vector3().crossVectors(nn, Math.abs(nn.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0)).normalize();
      this.vert(v, nn, t, uv ? uv.getX(i) * uvScale : 0, uv ? uv.getY(i) * uvScale : 0, layer, seed, tint);
    }
    if (g.index) for (let i = 0; i < g.index.count; i++) this.idx.push(base + g.index.getX(i));
    else for (let i = 0; i < p.count; i++) this.idx.push(base + i);
  }
  build(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nrm, 3));
    g.setAttribute('aTangent', new THREE.Float32BufferAttribute(this.tan, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('aMat', new THREE.Float32BufferAttribute(this.mat, 4));
    g.setIndex(this.idx);
    g.computeBoundingSphere();
    return g;
  }
}

/** The treasure chest: planked body, arched lid, iron bands and corners, a gold lock. Returns its glow seam. */
export function chest(pb: PropBuilder, cb: CrystalBuilder, at: THREE.Vector3, yaw: number): { seam: THREE.Vector3; size: THREE.Vector3 } {
  const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
  const W = 0.4, D = 0.26, H = 0.36; // half width, half depth, body height
  const L = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z).applyQuaternion(q).add(at);
  const wood = LAYER.wood, iron = LAYER.iron;
  pb.box(L(0, H / 2, 0), new THREE.Vector3(W, H / 2, D), q, wood, 0, 0.42, 0.4);
  // Arched lid: 6 slats around a half cylinder along x.
  const R = D, seg = 6, lidY = H + 0.012;
  for (let i = 0; i < seg; i++) {
    const a0 = (i / seg) * Math.PI, a1 = ((i + 1) / seg) * Math.PI, am = (a0 + a1) / 2;
    const cy = lidY + Math.sin(am) * R * 0.62, cz = Math.cos(am) * R;
    const qs = q.clone().multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -(am - Math.PI / 2) * 0.95));
    const half = Math.hypot(Math.cos(a1) - Math.cos(a0), (Math.sin(a1) - Math.sin(a0)) * 0.62) * R * 0.5 + 0.004;
    pb.box(L(0, cy, cz), new THREE.Vector3(W + 0.006, 0.018, half), qs, wood, 0, 0.42, 0.65);
  }
  // Lid end caps.
  for (const sx of [-1, 1]) pb.box(L(sx * (W + 0.004), lidY + R * 0.3, 0), new THREE.Vector3(0.012, R * 0.3, D * 0.98), q, wood, 0, 0.42, 0.2);
  // Iron bands (vertical, wrapping body and lid) and the rim.
  for (const bx of [-W * 0.62, W * 0.62]) {
    pb.box(L(bx, H / 2, D + 0.008), new THREE.Vector3(0.032, H / 2, 0.01), q, iron, 2, 0.25);
    pb.box(L(bx, H / 2, -D - 0.008), new THREE.Vector3(0.032, H / 2, 0.01), q, iron, 2, 0.25);
    for (let i = 0; i < seg; i++) {
      const am = ((i + 0.5) / seg) * Math.PI;
      const cy = lidY + Math.sin(am) * (R + 0.016) * 0.62, cz = Math.cos(am) * (R + 0.016);
      const qs = q.clone().multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -(am - Math.PI / 2) * 0.95));
      pb.box(L(bx, cy, cz), new THREE.Vector3(0.034, 0.01, R * 0.29), qs, iron, 2, 0.25);
    }
  }
  pb.box(L(0, H - 0.02, 0), new THREE.Vector3(W + 0.012, 0.03, D + 0.012), q, iron, 2, 0.25);
  pb.box(L(0, 0.025, 0), new THREE.Vector3(W + 0.01, 0.025, D + 0.01), q, iron, 2, 0.25);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) pb.box(L(sx * (W - 0.005), H / 2, sz * (D - 0.005)), new THREE.Vector3(0.02, H / 2 + 0.004, 0.02), q, iron, 2, 0.25);
  // Gold lock plate with a dark keyhole.
  pb.box(L(0, H - 0.03, D + 0.022), new THREE.Vector3(0.06, 0.075, 0.012), q, iron, 1, 0.3);
  pb.box(L(0, H - 0.045, D + 0.036), new THREE.Vector3(0.012, 0.022, 0.004), q, iron, 2, 0.3);
  // Warm light leaking from under the lid: a thin glowing seam (crystal shader, amber).
  const seamA = L(-W + 0.03, H + 0.006, D + 0.004), seamB = L(W - 0.03, H + 0.006, D + 0.004);
  const dirS = seamB.clone().sub(seamA);
  const len = dirS.length();
  const sq = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dirS.clone().normalize());
  const sg = new THREE.CylinderGeometry(0.007, 0.007, len, 4, 1, true).toNonIndexed();
  sg.applyQuaternion(sq);
  sg.translate((seamA.x + seamB.x) / 2, (seamA.y + seamB.y) / 2, (seamA.z + seamB.z) / 2);
  const sp = sg.getAttribute('position'), sn = sg.getAttribute('normal');
  for (let i = 0; i < sp.count; i++) {
    cb.pos.push(sp.getX(i), sp.getY(i), sp.getZ(i));
    cb.nrm.push(sn.getX(i), sn.getY(i), sn.getZ(i));
    cb.cry.push(0.0, 0.5, 0.5, 3);
  }
  return { seam: L(0, H + 0.02, D + 0.12), size: new THREE.Vector3(W * 2, H + R * 0.62, D * 2) };
}

/** Hanging roots: tapered tubes drooping from the ceiling, with a few rootlets. */
export function roots(pb: PropBuilder, anchors: Array<[THREE.Vector3, number]>, seed: number): void {
  const r = rng(seed);
  for (const [top, length] of anchors) {
    const strands = 1 + Math.floor(r() * 2);
    for (let s = 0; s < strands; s++) {
      const pts: THREE.Vector3[] = [];
      const sway = new THREE.Vector3((r() - 0.5) * 0.5, 0, (r() - 0.5) * 0.5);
      const L = length * (0.6 + 0.4 * r());
      for (let i = 0; i <= 6; i++) {
        const t = i / 6;
        pts.push(top.clone().add(new THREE.Vector3(sway.x * t * t + Math.sin(t * 5 + s) * 0.04, -L * t, sway.z * t * t + Math.cos(t * 4 + s) * 0.04)));
      }
      pts[0].y += 0.15;
      const curve = new THREE.CatmullRomCurve3(pts);
      const r0 = 0.045 + r() * 0.035;
      const tube = new THREE.TubeGeometry(curve, 20, r0, 7, false);
      // Taper: scale each ring towards the curve by its parameter.
      const p = tube.getAttribute('position');
      const segs = 20, radial = 7;
      for (let i = 0; i <= segs; i++) {
        const c = curve.getPointAt(i / segs);
        const k = 1 - 0.82 * Math.pow(i / segs, 1.3);
        for (let j = 0; j <= radial; j++) {
          const vi = i * (radial + 1) + j;
          const v = new THREE.Vector3().fromBufferAttribute(p, vi).sub(c).multiplyScalar(k).add(c);
          p.setXYZ(vi, v.x, v.y, v.z);
        }
      }
      tube.computeVertexNormals();
      pb.geometry(tube, new THREE.Matrix4(), LAYER.soil[0], 0, 2.5, 0.2);
    }
  }
}

/** Low-poly pebbles scattered on floor points. */
export function pebbles(pb: PropBuilder, spots: Array<[THREE.Vector3, number, number]>, seed: number): void {
  const r = rng(seed);
  const base = new THREE.IcosahedronGeometry(1, 0);
  for (const [p, size, layer] of spots) {
    const m = new THREE.Matrix4().compose(
      p.clone().add(new THREE.Vector3(0, size * 0.25, 0)),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(r() * 6, r() * 6, r() * 6)),
      new THREE.Vector3(size * (0.8 + r() * 0.5), size * (0.45 + r() * 0.25), size * (0.8 + r() * 0.5)),
    );
    pb.geometry(base, m, layer, 0, size * 3, r());
  }
}

// --------------------------------------------------------------------------------------------------------- lantern
/** The held lantern: opaque parts (brass frame, dark iron, flame) and the glass (drawn additively over them). */
export function lanternGeometry(): { opaque: THREE.BufferGeometry; glass: THREE.BufferGeometry } {
  const opaque: Array<[THREE.BufferGeometry, number]> = [];
  const glass: Array<[THREE.BufferGeometry, number]> = [];
  const add = (list: Array<[THREE.BufferGeometry, number]>, g: THREE.BufferGeometry, part: number) => list.push([g.index ? g.toNonIndexed() : g, part]);
  const sides = 6;
  const rot = Math.PI / sides;
  // Foot: a stepped hexagonal base.
  add(opaque, new THREE.CylinderGeometry(0.046, 0.052, 0.02, sides).rotateY(rot).translate(0, 0.01, 0), 0);
  add(opaque, new THREE.CylinderGeometry(0.041, 0.046, 0.012, sides).rotateY(rot).translate(0, 0.026, 0), 2);
  // Glass chimney.
  add(glass, new THREE.CylinderGeometry(0.036, 0.036, 0.086, sides, 1, true).rotateY(rot).translate(0, 0.075, 0), 1);
  // Corner posts at every other corner.
  for (let i = 0; i < sides; i += 2) {
    const a = (i / sides) * Math.PI * 2;
    add(opaque, new THREE.BoxGeometry(0.007, 0.092, 0.007).rotateY(-a).translate(Math.cos(a) * 0.039, 0.075, Math.sin(a) * 0.039), 0);
  }
  // Top ring, roof, chimney cap.
  add(opaque, new THREE.CylinderGeometry(0.043, 0.043, 0.006, sides).rotateY(rot).translate(0, 0.12, 0), 0);
  add(opaque, new THREE.CylinderGeometry(0.014, 0.049, 0.032, sides).rotateY(rot).translate(0, 0.139, 0), 0);
  add(opaque, new THREE.CylinderGeometry(0.011, 0.013, 0.016, sides).rotateY(rot).translate(0, 0.162, 0), 2);
  add(opaque, new THREE.CylinderGeometry(0.017, 0.017, 0.004, sides).rotateY(rot).translate(0, 0.171, 0), 0);
  // Bail: a thin wire loop.
  add(opaque, new THREE.TorusGeometry(0.021, 0.0024, 5, 20).translate(0, 0.192, 0), 2);
  // Burner and flame.
  add(opaque, new THREE.CylinderGeometry(0.012, 0.016, 0.012, 8).translate(0, 0.038, 0), 0);
  add(opaque, new THREE.CylinderGeometry(0.0022, 0.0028, 0.012, 6).translate(0, 0.049, 0), 2);
  const flame = new THREE.SphereGeometry(0.0085, 12, 10);
  const fp = flame.getAttribute('position');
  for (let i = 0; i < fp.count; i++) {
    // Teardrop: pinch the top.
    const y = fp.getY(i) / 0.0085;
    const k = y > 0 ? 1 - 0.75 * y * y : 1;
    fp.setXYZ(i, fp.getX(i) * k, fp.getY(i) * (y > 0 ? 2.3 : 1.1), fp.getZ(i) * k);
  }
  add(opaque, flame.translate(0, 0.064, 0), 3);
  const merge = (parts: Array<[THREE.BufferGeometry, number]>) => {
    let count = 0;
    for (const [g] of parts) count += g.getAttribute('position').count;
    const pos = new Float32Array(count * 3), nrm = new Float32Array(count * 3), part = new Float32Array(count);
    let o = 0;
    for (const [g, pid] of parts) {
      g.computeVertexNormals();
      const p = g.getAttribute('position'), n = g.getAttribute('normal');
      for (let i = 0; i < p.count; i++, o++) {
        pos.set([p.getX(i), p.getY(i), p.getZ(i)], o * 3);
        nrm.set([n.getX(i), n.getY(i), n.getZ(i)], o * 3);
        part[o] = pid;
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
    g.setAttribute('aPart', new THREE.BufferAttribute(part, 1));
    g.computeBoundingSphere();
    return g;
  };
  return { opaque: merge(opaque), glass: merge(glass) };
}

// ------------------------------------------------------------------------------------------------------ light shafts
/** An open cone from `top` along `dir`; aAlong = 0 at the top, 1 at the far end. */
export function shaftGeometry(top: THREE.Vector3, dir: THREE.Vector3, length: number, r0: number, r1: number): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(r0, r1, length, 20, 8, true);
  const p = g.getAttribute('position');
  const along = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    along[i * 2] = 0.5 - p.getY(i) / length;
    along[i * 2 + 1] = Math.atan2(p.getZ(i), p.getX(i));
  }
  g.setAttribute('aAlong', new THREE.BufferAttribute(along, 2));
  g.translate(0, -length / 2, 0);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, -1, 0), dir.clone().normalize());
  g.applyQuaternion(q);
  g.translate(top.x, top.y, top.z);
  return g;
}
