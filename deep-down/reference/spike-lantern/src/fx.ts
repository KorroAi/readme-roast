// The few moving effects: drifting motes (ambient), the crumble of a mined block (chunks + a dust puff).
// Budget: motes + crumble + the loot flight (DOM) = at most three things moving at once.

import * as THREE from 'three';
import { MOTE_FRAG, MOTE_VERT, SPRITE_VERT, WORLD_FRAG, WORLD_VERT, type Shared } from './shaders';
import { PropBuilder } from './props';
import { rng } from './util';

export class Motes {
  readonly points: THREE.Points;
  readonly material: THREE.ShaderMaterial;
  constructor(shared: Shared, count: number, min: [number, number, number], size: [number, number, number], rise: number, pxRatio: number) {
    const r = rng(77);
    const pos = new Float32Array(count * 3), ph = new Float32Array(count * 4);
    for (let i = 0; i < count; i++) {
      pos.set([min[0] + r() * size[0], min[1] + r() * size[1], min[2] + r() * size[2]], i * 3);
      ph.set([r(), r(), r(), r()], i * 4);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aPhase', new THREE.BufferAttribute(ph, 4));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(min[0] + size[0] / 2, min[1] + size[1] / 2, min[2] + size[2] / 2), 50);
    this.material = new THREE.ShaderMaterial({
      vertexShader: MOTE_VERT,
      fragmentShader: MOTE_FRAG,
      uniforms: {
        ...shared,
        uPx: { value: pxRatio },
        uBoxMin: { value: new THREE.Vector3(...min) },
        uBoxSize: { value: new THREE.Vector3(...size) },
        uRise: { value: rise },
      },
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      transparent: true,
    });
    this.points = new THREE.Points(g, this.material);
    this.points.renderOrder = 10;
  }
}

interface Chunk {
  p: THREE.Vector3;
  v: THREE.Vector3;
  q: THREE.Quaternion;
  w: THREE.Vector3;
  s: number;
  floor: number;
}

const DUST_FRAG = /* glsl */ `
uniform vec3 uColor;
varying vec2 vQ;
varying float vA;
void main() {
  float r = dot(vQ, vQ);
  float a = exp(-r * 3.) * (1. - smoothstep(0.7, 1., r)) * vA;
  gl_FragColor = vec4(uColor * a, a);
}
`;

/** Chunks of a mined block (instanced, world shader) and a soft dust puff (3 sprites). */
export class Crumble {
  readonly mesh: THREE.InstancedMesh;
  readonly dust: THREE.InstancedMesh;
  private chunks: Chunk[] = [];
  private inst: THREE.InstancedBufferAttribute;
  private dustA: THREE.InstancedBufferAttribute;
  private t = -1;
  private origin = new THREE.Vector3();
  private dustMat: THREE.ShaderMaterial;
  static readonly N = 11;
  constructor(shared: Shared, textures: { tAlb: THREE.Texture; tNrm: THREE.Texture }) {
    const pb = new PropBuilder();
    pb.geometry(new THREE.DodecahedronGeometry(1, 0), new THREE.Matrix4(), 0, 0, 0.4, 0.5);
    const geo = pb.build();
    this.inst = new THREE.InstancedBufferAttribute(new Float32Array(Crumble.N * 4), 4);
    geo.setAttribute('aInst', this.inst);
    const mat = new THREE.ShaderMaterial({
      vertexShader: WORLD_VERT,
      fragmentShader: WORLD_FRAG,
      uniforms: { ...shared, ...{ tAlb: { value: textures.tAlb }, tNrm: { value: textures.tNrm } } },
      defines: { DEBRIS: 1 },
    });
    this.mesh = new THREE.InstancedMesh(geo, mat, Crumble.N);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    this.mesh.layers.set(1);
    // Dust: camera-facing quads.
    const quad = new THREE.PlaneGeometry(2, 2);
    this.dustA = new THREE.InstancedBufferAttribute(new Float32Array(3 * 4), 4);
    quad.setAttribute('aSprite', this.dustA);
    this.dustMat = new THREE.ShaderMaterial({
      vertexShader: SPRITE_VERT,
      fragmentShader: DUST_FRAG,
      uniforms: { uColor: { value: new THREE.Color(0.2, 0.15, 0.1) } },
      transparent: true,
      depthWrite: false,
      blending: THREE.CustomBlending,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneMinusSrcAlphaFactor,
    });
    this.dust = new THREE.InstancedMesh(quad, this.dustMat, 3);
    this.dust.frustumCulled = false;
    this.dust.count = 0;
    this.dust.layers.set(1);
    this.dust.renderOrder = 11;
  }
  get active(): boolean {
    return this.t >= 0;
  }
  /** Burst from a block centre towards `toward` (the camera), with the block's texture layer. */
  start(center: THREE.Vector3, toward: THREE.Vector3, layer: number, floorY: number, dustColor: THREE.Color): void {
    const r = rng(Math.floor(center.x * 97 + center.y * 31 + center.z * 13) >>> 0);
    this.chunks = [];
    this.origin.copy(center);
    const out = toward.clone().sub(center).setY(0).normalize();
    for (let i = 0; i < Crumble.N; i++) {
      const p = center.clone().add(new THREE.Vector3((r() - 0.5) * 0.32, (r() - 0.5) * 0.32, (r() - 0.5) * 0.32)).addScaledVector(out, 0.12);
      const v = out.clone().multiplyScalar(1.6 + r() * 1.6).add(new THREE.Vector3((r() - 0.5) * 1.6, 0.5 + r() * 1.6, (r() - 0.5) * 1.6));
      const s = i < 4 ? 0.1 + r() * 0.05 : 0.05 + r() * 0.05;
      this.chunks.push({ p, v, q: new THREE.Quaternion().setFromEuler(new THREE.Euler(r() * 6, r() * 6, r() * 6)), w: new THREE.Vector3(r() - 0.5, r() - 0.5, r() - 0.5).multiplyScalar(9), s, floor: floorY });
      this.inst.setXYZW(i, layer, r(), r(), r());
    }
    this.inst.needsUpdate = true;
    this.mesh.count = Crumble.N;
    this.dust.count = 3;
    this.dustMat.uniforms.uColor.value.copy(dustColor);
    this.t = 0;
    this.update(0);
  }
  update(dt: number): void {
    if (this.t < 0) return;
    this.t += dt;
    const T = 0.95;
    if (this.t > T) {
      this.t = -1;
      this.mesh.count = 0;
      this.dust.count = 0;
      return;
    }
    const m = new THREE.Matrix4(), dq = new THREE.Quaternion();
    this.chunks.forEach((c, i) => {
      // Sub-steps keep the floor bounce stable at low frame rates.
      for (let k = 0; k < 4; k++) {
        const h = dt / 4;
        c.v.y -= 9.8 * h;
        c.p.addScaledVector(c.v, h);
        if (c.p.y < c.floor + c.s * 0.6) {
          c.p.y = c.floor + c.s * 0.6;
          c.v.y = Math.abs(c.v.y) * 0.25;
          c.v.x *= 0.55;
          c.v.z *= 0.55;
          c.w.multiplyScalar(0.6);
        }
      }
      dq.setFromAxisAngle(c.w.clone().normalize(), c.w.length() * dt);
      c.q.premultiply(dq);
      const fade = this.t < T - 0.3 ? 1 : Math.max(0, (T - this.t) / 0.3);
      m.compose(c.p, c.q, new THREE.Vector3(c.s, c.s * 0.8, c.s).multiplyScalar(fade));
      this.mesh.setMatrixAt(i, m);
    });
    this.mesh.instanceMatrix.needsUpdate = true;
    // Dust: three soft puffs growing and fading over ~0.7 s.
    for (let i = 0; i < 3; i++) {
      const k = Math.min(1, this.t / 0.7);
      const p = this.origin.clone().add(new THREE.Vector3((i - 1) * 0.12, -0.08 + i * 0.05 - k * 0.12, 0.1 + i * 0.05));
      m.compose(p, new THREE.Quaternion(), new THREE.Vector3(1, 1, 1));
      this.dust.setMatrixAt(i, m);
      const size = 0.16 + 0.32 * Math.sqrt(k) + i * 0.04;
      const alpha = Math.sin(Math.min(1, this.t / 0.1) * Math.PI * 0.5) * (1 - k) * 0.55;
      this.dustA.setXYZW(i, size, alpha, 0, 0);
    }
    this.dust.instanceMatrix.needsUpdate = true;
    this.dustA.needsUpdate = true;
  }
}
