import * as THREE from 'three';

/**
 * Builder for small procedural models made of boxes (and a few faceted shapes) with
 * per-vertex sRGB color and emissive strength, producing geometry for entityMaterial.
 *
 * Units are world units (1 = one terrain block). Use push()/pop() with translate/rotate
 * to build articulated or tilted parts. Keep models compact: a prop should rarely need
 * more than a few hundred boxes.
 */
export class VoxBuilder {
  private pos: number[] = [];
  private nrm: number[] = [];
  private col: number[] = [];
  private emi: number[] = [];
  private idx: number[] = [];
  private stack: THREE.Matrix4[] = [];
  private m = new THREE.Matrix4();
  private readonly tmpV = new THREE.Vector3();
  private readonly tmpN = new THREE.Vector3();
  private readonly normalMat = new THREE.Matrix3();

  push(): this {
    this.stack.push(this.m.clone());
    return this;
  }

  pop(): this {
    const m = this.stack.pop();
    if (m) this.m = m;
    return this;
  }

  translate(x: number, y: number, z: number): this {
    this.m.multiply(new THREE.Matrix4().makeTranslation(x, y, z));
    return this;
  }

  rotateX(a: number): this {
    this.m.multiply(new THREE.Matrix4().makeRotationX(a));
    return this;
  }

  rotateY(a: number): this {
    this.m.multiply(new THREE.Matrix4().makeRotationY(a));
    return this;
  }

  rotateZ(a: number): this {
    this.m.multiply(new THREE.Matrix4().makeRotationZ(a));
    return this;
  }

  scale(x: number, y = x, z = x): this {
    this.m.multiply(new THREE.Matrix4().makeScale(x, y, z));
    return this;
  }

  /**
   * Axis-aligned box (in the current transform) from min to max corner.
   * `shade` darkens the bottom and side faces slightly for a hand-painted voxel look.
   */
  box(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, color: number, emissive = 0, shade = true): this {
    const c = [(color >> 16) & 255, (color >> 8) & 255, color & 255];
    const faces: Array<{ n: [number, number, number]; v: Array<[number, number, number]>; f: number }> = [
      { n: [1, 0, 0], v: [[x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1]], f: 0.86 },
      { n: [-1, 0, 0], v: [[x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [x0, y0, z0]], f: 0.8 },
      { n: [0, 1, 0], v: [[x0, y1, z0], [x0, y1, z1], [x1, y1, z1], [x1, y1, z0]], f: 1 },
      { n: [0, -1, 0], v: [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]], f: 0.62 },
      { n: [0, 0, 1], v: [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], f: 0.92 },
      { n: [0, 0, -1], v: [[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]], f: 0.76 },
    ];
    for (const face of faces) {
      const f = shade && emissive < 0.5 ? face.f : 1;
      this.quad(face.v, face.n, [c[0] * f, c[1] * f, c[2] * f], emissive);
    }
    return this;
  }

  /** Box by center and size. */
  cube(cx: number, cy: number, cz: number, sx: number, sy: number, sz: number, color: number, emissive = 0, shade = true): this {
    return this.box(cx - sx / 2, cy - sy / 2, cz - sz / 2, cx + sx / 2, cy + sy / 2, cz + sz / 2, color, emissive, shade);
  }

  /**
   * Faceted crystal: an n-sided prism of `radius` and `height` along +Y with a pointed tip.
   * Facets alternate between two colors so light catches individual faces.
   */
  crystal(radius: number, height: number, tip: number, sides: number, colorA: number, colorB: number, emissive: number): this {
    const ring = (y: number, r: number) =>
      Array.from({ length: sides }, (_, i) => {
        const a = (i / sides) * Math.PI * 2;
        return [Math.cos(a) * r, y, Math.sin(a) * r] as [number, number, number];
      });
    const bottom = ring(0, radius * 0.85);
    const top = ring(height, radius);
    const apex: [number, number, number] = [0, height + tip, 0];
    for (let i = 0; i < sides; i++) {
      const j = (i + 1) % sides;
      const color = i % 2 === 0 ? colorA : colorB;
      const c = [(color >> 16) & 255, (color >> 8) & 255, color & 255];
      // Angle increases from +X toward +Z, so j -> i is counter-clockwise seen from outside.
      const v: Array<[number, number, number]> = [bottom[j], bottom[i], top[i], top[j]];
      const n = faceNormal(v[0], v[1], v[2]);
      this.quad(v, n, c, emissive);
      const tn = faceNormal(top[j], top[i], apex);
      const tc = [Math.min(255, c[0] * 1.15), Math.min(255, c[1] * 1.15), Math.min(255, c[2] * 1.15)];
      this.tri(top[j], top[i], apex, tn, tc, Math.min(1, emissive * 1.2));
    }
    return this;
  }

  /** Raw quad in the current transform. Vertices counter-clockwise seen from outside. */
  quad(v: Array<[number, number, number]>, n: [number, number, number], rgb: number[], emissive: number): this {
    const base = this.pos.length / 3;
    for (const p of v) this.vertex(p, n, rgb, emissive);
    this.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    return this;
  }

  tri(a: [number, number, number], b: [number, number, number], c: [number, number, number], n: [number, number, number], rgb: number[], emissive: number): this {
    const base = this.pos.length / 3;
    this.vertex(a, n, rgb, emissive);
    this.vertex(b, n, rgb, emissive);
    this.vertex(c, n, rgb, emissive);
    this.idx.push(base, base + 1, base + 2);
    return this;
  }

  private vertex(p: [number, number, number], n: [number, number, number], rgb: number[], emissive: number): void {
    this.tmpV.set(p[0], p[1], p[2]).applyMatrix4(this.m);
    this.normalMat.getNormalMatrix(this.m);
    this.tmpN.set(n[0], n[1], n[2]).applyMatrix3(this.normalMat).normalize();
    this.pos.push(this.tmpV.x, this.tmpV.y, this.tmpV.z);
    this.nrm.push(this.tmpN.x, this.tmpN.y, this.tmpN.z);
    this.col.push(Math.round(rgb[0]), Math.round(rgb[1]), Math.round(rgb[2]));
    this.emi.push(Math.round(Math.max(0, Math.min(1, emissive)) * 255));
  }

  get vertexCount(): number {
    return this.pos.length / 3;
  }

  build(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(this.pos), 3));
    g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(this.nrm), 3));
    g.setAttribute('color', new THREE.BufferAttribute(new Uint8Array(this.col), 3, true));
    g.setAttribute('aEmissive', new THREE.BufferAttribute(new Uint8Array(this.emi), 1, true));
    const count = this.pos.length / 3;
    g.setIndex(count > 65535 ? new THREE.BufferAttribute(new Uint32Array(this.idx), 1) : new THREE.BufferAttribute(new Uint16Array(this.idx), 1));
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return g;
  }
}

function faceNormal(a: [number, number, number], b: [number, number, number], c: [number, number, number]): [number, number, number] {
  const ux = b[0] - a[0];
  const uy = b[1] - a[1];
  const uz = b[2] - a[2];
  const vx = c[0] - a[0];
  const vy = c[1] - a[1];
  const vz = c[2] - a[2];
  const nx = uy * vz - uz * vy;
  const ny = uz * vx - ux * vz;
  const nz = ux * vy - uy * vx;
  const l = Math.hypot(nx, ny, nz) || 1;
  return [nx / l, ny / l, nz / l];
}
