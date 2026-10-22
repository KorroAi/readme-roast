import * as THREE from 'three';
import { B, SOLID } from '../config/blocks';
import type { VoxelWorld } from '../world/VoxelWorld';
import { createEntityMaterial } from './entityMaterial';
import { FOG_CULL, type LightingUniforms } from './lighting';
import { FLAME_FRAG } from './props/flame';
import { IRON, WOOD, CLOTH } from './props/palette';
import { VoxBuilder } from './voxModel';

/**
 * Round 3 (VIS seam): placed torches.
 *
 * A torch is one voxel: WORLD's `B.TORCH`, an invisible, non-solid warm emitter, so its light is the
 * light volume's (LightField floods it like any lamp, mining or placing updates it, and it saves as a
 * world edit). This draws what stands there: a pitch-wrapped stick, standing on the floor below it,
 * or leaning out of a wall from an iron bracket when the cell has no floor, with a living flame
 * (the camp fire's flame shader, instanced) and a soft warm halo. Everything is instanced: three
 * draw calls for every torch in view.
 *
 * The mount comes from the voxels around the cell: solid below = floor; else the first solid side
 * (+x, -x, +z, -z) = wall; else it hangs from the ceiling. Nothing to save.
 *
 * Wiring (Game.ts VIS block): `torches = new TorchLights(rig.uniforms)`, `scene.add(torches.group)`,
 * `torches.attach(world)` once the world is loaded (and after every stratum switch or restore),
 * `torches.notify(x, y, z)` after any block change (placing or breaking a torch, or its support),
 * `torches.update(dt, time, camera.position)` each frame.
 */

/** The torch block id (WORLD's B.TORCH; -1 until it exists). */
export const TORCH_ID: number = (B as unknown as Record<string, number>).TORCH ?? -1;
/** Most torches drawn at once (the nearest). */
export const MAX_TORCHES = 192;
/** Torches beyond this are not drawn (m; the haze hides them anyway). */
const TORCH_FAR = 70;

export type TorchMount = 'floor' | 'wall' | 'ceiling';

export interface TorchInfo {
  x: number;
  y: number;
  z: number;
  mount: TorchMount;
  /** Wall mount: the direction the torch leans out (away from the wall), unit x / z. */
  out: [number, number];
}

const SIDES: ReadonlyArray<[number, number]> = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

/** How a torch in cell (x, y, z) is mounted (pure; unit-tested). */
export function torchMount(world: VoxelWorld, x: number, y: number, z: number): TorchInfo {
  if (SOLID[world.get(x, y - 1, z)]) return { x, y, z, mount: 'floor', out: [0, 0] };
  for (const [dx, dz] of SIDES) if (SOLID[world.get(x + dx, y, z + dz)]) return { x, y, z, mount: 'wall', out: [-dx, -dz] };
  return { x, y, z, mount: SOLID[world.get(x, y + 1, z)] ? 'ceiling' : 'floor', out: [0, 0] };
}

/** The torch model (local: the stick's foot at the origin, rising along +y, 0.62 m). */
function torchGeometry(): THREE.BufferGeometry {
  const b = new VoxBuilder();
  // Stick: a dark octagonal-ish shaft (two crossed boxes), charred toward the head.
  b.box(-0.026, 0, -0.026, 0.026, 0.46, 0.026, WOOD.dark);
  b.box(-0.032, 0.02, -0.018, 0.032, 0.44, 0.018, WOOD.mid);
  b.box(-0.018, 0.02, -0.032, 0.018, 0.44, 0.032, WOOD.mid);
  b.box(-0.03, 0.4, -0.03, 0.03, 0.47, 0.03, WOOD.char);
  // An iron collar under the head.
  b.box(-0.04, 0.44, -0.04, 0.04, 0.47, 0.04, IRON.mid);
  // The pitch-soaked wrapping: a fat, uneven head of cloth bands.
  b.box(-0.05, 0.47, -0.05, 0.05, 0.56, 0.05, CLOTH.canvasDark & 0x2f2a26);
  b.box(-0.056, 0.49, -0.044, 0.056, 0.54, 0.044, 0x231d19);
  b.box(-0.044, 0.5, -0.056, 0.044, 0.55, 0.056, 0x1c1714);
  // Embers glowing in the wrapping's top.
  b.box(-0.036, 0.555, -0.036, 0.036, 0.575, 0.036, 0xff7a2a, 0.9);
  return b.build();
}

/** A wall bracket (local: the wall plate at z = 0, facing +z). */
function bracketGeometry(): THREE.BufferGeometry {
  const b = new VoxBuilder();
  b.box(-0.06, -0.08, 0, 0.06, 0.08, 0.025, IRON.dark);
  b.box(-0.02, -0.02, 0.02, 0.02, 0.02, 0.16, IRON.mid);
  b.box(-0.045, -0.03, 0.14, 0.045, 0.03, 0.18, IRON.light);
  return b.build();
}

const flameVert = /* glsl */ `
in vec3 aCenter;
in vec2 aSeedSize; // seed, size
uniform vec2 uSize;
out vec2 vUv;
out float vFade;
out float vSeed;
void main() {
  vUv = vec2(position.x, position.y);
  vSeed = aSeedSize.x;
  vec4 c = viewMatrix * vec4(aCenter, 1.0);
  vec3 up = (viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz;
  vec2 u2 = up.xy;
  float l = length(u2);
  u2 = l > 0.2 ? u2 / l : vec2(0.0, 1.0);
  vec2 r2 = vec2(u2.y, -u2.x);
  float s = aSeedSize.y;
  float h = uSize.y * s * mix(0.6, 1.0, clamp(l, 0.0, 1.0));
  c.xy += r2 * position.x * uSize.x * s + u2 * position.y * h;
  vFade = smoothstep(0.35, 0.9, -c.z) * (1.0 - smoothstep(${(TORCH_FAR - 15).toFixed(1)}, ${TORCH_FAR.toFixed(1)}, -c.z));
  gl_Position = projectionMatrix * c;
}
`;

const haloVert = /* glsl */ `
in vec3 aCenter;
in vec2 aSeedSize;
uniform float uTime;
out vec2 vQ;
out float vA;
void main() {
  vQ = position.xy * 2.0;
  vec4 c = viewMatrix * vec4(aCenter, 1.0);
  float flick = 0.88 + 0.08 * sin(uTime * 7.3 + aSeedSize.x * 40.0) + 0.04 * sin(uTime * 13.1 + aSeedSize.x * 17.0);
  float r = 0.9 * aSeedSize.y * flick;
  c.xy += position.xy * 2.0 * r;
  // Halos fade near the lens and into the haze.
  vA = smoothstep(0.6, 2.0, -c.z) * (1.0 - smoothstep(${(TORCH_FAR - 20).toFixed(1)}, ${TORCH_FAR.toFixed(1)}, -c.z)) * flick;
  gl_Position = projectionMatrix * c;
}
`;
const haloFrag = /* glsl */ `
precision highp float;
uniform float uSceneEncode;
in vec2 vQ;
in float vA;
layout(location = 0) out highp vec4 fragColor;
void main() {
  float d2 = dot(vQ, vQ);
  if (d2 > 1.0) discard;
  float g = exp(-d2 * 4.0) * (1.0 - d2) * vA;
  vec3 c = vec3(1.0, 0.58, 0.24) * g * 0.42;
  c = uSceneEncode > 0.5 ? sqrt(c / (1.0 + c)) : c;
  fragColor = vec4(c, 1.0);
}
`;

export class TorchLights {
  readonly group = new THREE.Group();
  /** Every torch of the world by cell index. */
  private readonly all = new Map<number, TorchInfo>();
  private world: VoxelWorld | null = null;
  private readonly bodies: THREE.InstancedMesh;
  private readonly brackets: THREE.InstancedMesh;
  private readonly flames: THREE.Mesh<THREE.InstancedBufferGeometry, THREE.ShaderMaterial>;
  private readonly halos: THREE.Mesh<THREE.InstancedBufferGeometry, THREE.ShaderMaterial>;
  private readonly centers = new Float32Array(MAX_TORCHES * 3);
  private readonly seeds = new Float32Array(MAX_TORCHES * 2);
  private dirty = true;
  private readonly lastEye = new THREE.Vector3(Number.NaN, 0, 0);
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly p = new THREE.Vector3();
  private readonly s = new THREE.Vector3(1, 1, 1);
  private readonly e = new THREE.Euler();

  constructor(lighting: LightingUniforms) {
    this.group.name = 'torches';
    const mat = createEntityMaterial(lighting, { emissiveScale: 2.4 });
    this.bodies = new THREE.InstancedMesh(torchGeometry(), mat, MAX_TORCHES);
    this.brackets = new THREE.InstancedMesh(bracketGeometry(), mat, MAX_TORCHES);
    for (const im of [this.bodies, this.brackets]) {
      im.count = 0;
      im.frustumCulled = false;
      im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    }
    const quad = (): THREE.InstancedBufferGeometry => {
      const g = new THREE.InstancedBufferGeometry();
      return g;
    };
    const fg = quad();
    fg.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-0.5, 0, 0, 0.5, 0, 0, 0.5, 1, 0, -0.5, 1, 0]), 3));
    fg.setIndex([0, 1, 2, 0, 2, 3]);
    const hg = quad();
    hg.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0]), 3));
    hg.setIndex([0, 1, 2, 0, 2, 3]);
    const centre = new THREE.InstancedBufferAttribute(this.centers, 3).setUsage(THREE.DynamicDrawUsage);
    const seed = new THREE.InstancedBufferAttribute(this.seeds, 2).setUsage(THREE.DynamicDrawUsage);
    for (const g of [fg, hg]) {
      g.setAttribute('aCenter', centre);
      g.setAttribute('aSeedSize', seed);
      g.instanceCount = 0;
    }
    const enc = (lighting as Record<string, THREE.IUniform>).uSceneEncode ?? { value: 0 };
    const flameMat = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      uniforms: { uTime: lighting.uTime, uSceneEncode: enc, uSize: { value: new THREE.Vector2(0.2, 0.34) }, uIntensity: { value: 0.9 } },
      vertexShader: flameVert,
      fragmentShader: FLAME_FRAG.replace('uniform float uSeed;', 'in float vSeed;\n#define uSeed vSeed'),
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const haloMat = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      uniforms: { uTime: lighting.uTime, uSceneEncode: enc },
      vertexShader: haloVert,
      fragmentShader: haloFrag,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.flames = new THREE.Mesh(fg, flameMat);
    this.halos = new THREE.Mesh(hg, haloMat);
    for (const o of [this.flames, this.halos]) {
      o.frustumCulled = false;
      o.renderOrder = 20;
    }
    this.group.add(this.bodies, this.brackets, this.halos, this.flames);
  }

  /** Torches known (all of the world, drawn or not). */
  get count(): number {
    return this.all.size;
  }

  /** Torches drawn now (the nearest, within TORCH_FAR). */
  get drawn(): number {
    return this.bodies.count;
  }

  /** The torch in a cell, if any (tests and the debug API). */
  at(x: number, y: number, z: number): TorchInfo | null {
    const w = this.world;
    return w ? (this.all.get(w.index(x, y, z)) ?? null) : null;
  }

  /** Find every torch of a newly loaded or restored world (one pass over the voxels). */
  attach(world: VoxelWorld): void {
    this.world = world;
    this.all.clear();
    if (TORCH_ID >= 0) {
      const b = world.blocks;
      const { sx, sy } = world;
      for (let i = 0; i < b.length; i++) {
        if (b[i] !== TORCH_ID) continue;
        const x = i % sx;
        const y = Math.floor(i / sx) % sy;
        const z = Math.floor(i / (sx * sy));
        this.all.set(i, torchMount(world, x, y, z));
      }
    }
    this.dirty = true;
  }

  /** A block changed at (x, y, z): a torch placed or taken there, or its support around it. */
  notify(x: number, y: number, z: number): void {
    const w = this.world;
    if (!w || TORCH_ID < 0) return;
    for (let dy = -1; dy <= 1; dy++)
      for (let dz = -1; dz <= 1; dz++)
        for (let dx = -1; dx <= 1; dx++) {
          if (Math.abs(dx) + Math.abs(dy) + Math.abs(dz) > 1) continue;
          const cx = x + dx;
          const cy = y + dy;
          const cz = z + dz;
          if (!w.inBounds(cx, cy, cz)) continue;
          const i = w.index(cx, cy, cz);
          if (w.blocks[i] === TORCH_ID) this.all.set(i, torchMount(w, cx, cy, cz));
          else this.all.delete(i);
        }
    this.dirty = true;
  }

  /** A chunk's voxels changed (ChunkRenderer.chunkListeners): rescan it and its rim. */
  notifyChunk(cx: number, cy: number, cz: number, size: number): void {
    const w = this.world;
    if (!w || TORCH_ID < 0) return;
    const x0 = Math.max(0, cx * size - 1);
    const y0 = Math.max(0, cy * size - 1);
    const z0 = Math.max(0, cz * size - 1);
    const x1 = Math.min(w.sx - 1, (cx + 1) * size);
    const y1 = Math.min(w.sy - 1, (cy + 1) * size);
    const z1 = Math.min(w.sz - 1, (cz + 1) * size);
    const b = w.blocks;
    for (let z = z0; z <= z1; z++)
      for (let y = y0; y <= y1; y++) {
        let i = w.index(x0, y, z);
        for (let x = x0; x <= x1; x++, i++) {
          if (b[i] === TORCH_ID) this.all.set(i, torchMount(w, x, y, z));
          else if (this.all.has(i)) this.all.delete(i);
        }
      }
    this.dirty = true;
  }

  update(_dt: number, _time: number, eye: THREE.Vector3): void {
    if (!this.dirty && this.lastEye.distanceToSquared(eye) < 4) return;
    this.dirty = false;
    this.lastEye.copy(eye);
    const far = Math.min(TORCH_FAR, FOG_CULL.value);
    const near: Array<{ t: TorchInfo; d: number }> = [];
    for (const t of this.all.values()) {
      const d = Math.hypot(t.x + 0.5 - eye.x, t.y + 0.5 - eye.y, t.z + 0.5 - eye.z);
      if (d < far) near.push({ t, d });
    }
    near.sort((a, b) => a.d - b.d);
    const n = Math.min(MAX_TORCHES, near.length);
    let nb = 0;
    for (let k = 0; k < n; k++) {
      const t = near[k].t;
      const seed = ((t.x * 73856093) ^ (t.y * 19349663) ^ (t.z * 83492791)) >>> 0;
      const yaw = ((seed % 628) / 100) * 1.0;
      let tip: [number, number, number];
      if (t.mount === 'wall') {
        // Bracket on the wall face, the stick leaning 28 degrees out of it.
        const [ox, oz] = t.out;
        const wx = t.x + 0.5 - ox * 0.5;
        const wz = t.z + 0.5 - oz * 0.5;
        const ang = Math.atan2(ox, oz);
        this.q.setFromEuler(this.e.set(0, ang, 0));
        this.p.set(wx, t.y + 0.42, wz);
        this.brackets.setMatrixAt(nb++, this.m.compose(this.p, this.q, this.s));
        const lean = 0.49;
        this.q.setFromEuler(this.e.set(lean, ang, 0, 'YXZ'));
        this.p.set(wx + ox * 0.16, t.y + 0.28, wz + oz * 0.16);
        this.bodies.setMatrixAt(k, this.m.compose(this.p, this.q, this.s));
        const h = 0.57;
        tip = [this.p.x + ox * Math.sin(lean) * h, this.p.y + Math.cos(lean) * h, this.p.z + oz * Math.sin(lean) * h];
      } else if (t.mount === 'ceiling') {
        // Hanging: the stick upright, its foot tied 0.5 m under the roof.
        this.q.setFromEuler(this.e.set(0, yaw, 0));
        this.p.set(t.x + 0.5, t.y + 0.1, t.z + 0.5);
        this.bodies.setMatrixAt(k, this.m.compose(this.p, this.q, this.s));
        tip = [this.p.x, this.p.y + 0.57, this.p.z];
      } else {
        // Standing: driven into the floor, a slight tilt.
        const tilt = 0.06 + ((seed >> 8) % 7) * 0.01;
        this.q.setFromEuler(this.e.set(tilt, yaw, 0, 'YXZ'));
        this.p.set(t.x + 0.5, t.y - 0.02, t.z + 0.5);
        this.bodies.setMatrixAt(k, this.m.compose(this.p, this.q, this.s));
        tip = [this.p.x + Math.sin(yaw) * Math.sin(tilt) * 0.57, this.p.y + Math.cos(tilt) * 0.57, this.p.z + Math.cos(yaw) * Math.sin(tilt) * 0.57];
      }
      this.centers.set(tip, k * 3);
      this.seeds[k * 2] = (seed % 1000) / 1000;
      this.seeds[k * 2 + 1] = 1;
    }
    this.bodies.count = n;
    this.brackets.count = nb;
    this.bodies.instanceMatrix.needsUpdate = true;
    this.brackets.instanceMatrix.needsUpdate = true;
    for (const g of [this.flames.geometry, this.halos.geometry]) {
      g.instanceCount = n;
      (g.getAttribute('aCenter') as THREE.InstancedBufferAttribute).needsUpdate = true;
      (g.getAttribute('aSeedSize') as THREE.InstancedBufferAttribute).needsUpdate = true;
    }
    this.group.visible = n > 0;
  }

  dispose(): void {
    this.bodies.geometry.dispose();
    this.brackets.geometry.dispose();
    (this.bodies.material as THREE.Material).dispose();
    this.flames.geometry.dispose();
    this.flames.material.dispose();
    this.halos.geometry.dispose();
    this.halos.material.dispose();
  }
}
