import * as THREE from 'three';
import { LOOK_FOG_GLSL, lookShared } from '../look';
import type { QualityLevel } from '../Renderer';

/**
 * God-ray cones (SPEC §6.7, §11.4; owner 2D): instanced additive cones of 16 segments with soft edges (the
 * view-angle falloff), a fade along their length, scrolling noise and motes inside. One draw for every cone
 * on screen. Vistas own most of them; B may add cones to a grotto through `set(owner, cones)`.
 *
 * Caps per preset (SPEC §11.5): Battery 8, Balanced 24, High 64.
 */

export interface LightCone {
  /** Apex (world metres) and the direction the light falls in (normalised here). */
  x: number;
  y: number;
  z: number;
  dx?: number;
  dy?: number;
  dz?: number;
  /** Length (m) and the radius at the far end (m). */
  length: number;
  radius: number;
  /** sRGB colour and intensity (about 0.1-0.6). */
  color: number;
  intensity?: number;
}

export const CONE_CAP: Record<QualityLevel, number> = { battery: 8, balanced: 24, high: 64 };
const MAX = 64;
const SEG = 16;

const vertex = /* glsl */ `
in vec4 aCol;    // rgb linear, intensity
out vec3 vCol;
out float vAlong;
out float vEdge;
out vec3 vWorld;
out float vDist;
out float vSeed;
void main() {
  vec4 wp = modelMatrix * instanceMatrix * vec4(position, 1.0);
  vWorld = wp.xyz;
  vAlong = -position.y;              // 0 at the apex, 1 at the far end (unit cone points down -y)
  vec3 nW = normalize(mat3(modelMatrix * instanceMatrix) * vec3(position.x, 0.0, position.z));
  vec3 toEye = normalize(cameraPosition - wp.xyz);
  vEdge = abs(dot(nW, toEye));       // 1 facing the eye (the cone's middle), 0 at the silhouette
  vCol = aCol.rgb * aCol.a;
  vSeed = float(gl_InstanceID) * 7.31;
  vec4 mv = viewMatrix * wp;
  vDist = length(mv.xyz);
  gl_Position = projectionMatrix * mv;
}
`;

const fragment = /* glsl */ `
precision highp float;
${LOOK_FOG_GLSL}
in vec3 vCol;
in float vAlong;
in float vEdge;
in vec3 vWorld;
in float vDist;
in float vSeed;
layout(location = 0) out highp vec4 fragColor;
float h1(float x) { return fract(sin(x * 91.17) * 43758.55); }
void main() {
  float soft = vEdge * vEdge * vEdge;
  float along = smoothstep(0.0, 0.12, vAlong) * (1.0 - smoothstep(0.55, 1.0, vAlong));
  // Slow streaks drifting across the beam, and dust motes caught in it.
  float streak = 0.75 + 0.25 * sin(vWorld.x * 2.3 + vWorld.z * 1.7 + uLookTime * 0.6 + vSeed);
  vec2 mq = vWorld.xy * 3.0 + vec2(0.0, uLookTime * 0.25);
  vec2 mi = floor(mq);
  float mote = step(0.985, h1(mi.x * 17.0 + mi.y * 131.0 + vSeed)) * smoothstep(0.5, 0.1, length(fract(mq) - 0.5));
  float a = soft * along * streak + mote * along * 0.8;
  // Near the camera (the clear air around the dig face) cones fade out; far ones sink into the haze.
  float near = smoothstep(14.0, 22.0, vDist);
  float fog = lookFogAmount(vDist);
  fragColor = vec4(vCol * a * near * (1.0 - 0.7 * fog), 0.0);
}
`;

export class LightCones {
  readonly mesh: THREE.InstancedMesh;
  private readonly col: THREE.InstancedBufferAttribute;
  private readonly owners = new Map<string, LightCone[]>();
  private cap = CONE_CAP.balanced;
  private dirty = true;
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly v = new THREE.Vector3();
  private readonly s = new THREE.Vector3();
  private readonly down = new THREE.Vector3(0, -1, 0);
  private readonly c = new THREE.Color();

  constructor() {
    // A unit open cone: apex at the origin, base radius 1 at y = -1.
    const g = new THREE.CylinderGeometry(1, 0.02, 1, SEG, 1, true);
    g.translate(0, -0.5, 0);
    const mat = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      uniforms: { ...lookShared() },
      vertexShader: vertex,
      fragmentShader: fragment,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    this.mesh = new THREE.InstancedMesh(g, mat, MAX);
    this.col = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 4), 4);
    g.setAttribute('aCol', this.col);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 20;
    this.mesh.name = 'lightCones';
  }

  setQuality(level: QualityLevel): void {
    this.cap = CONE_CAP[level];
    this.dirty = true;
  }

  /** Replace the cones of one owner (a Vista id, a grotto id); an empty list removes them. */
  set(owner: string, cones: LightCone[]): void {
    if (cones.length) this.owners.set(owner, cones);
    else this.owners.delete(owner);
    this.dirty = true;
  }

  get count(): number {
    return this.mesh.count;
  }

  update(): void {
    if (!this.dirty) return;
    this.dirty = false;
    let n = 0;
    const lin = this.col.array as Float32Array;
    for (const cones of this.owners.values())
      for (const k of cones) {
        if (n >= this.cap) break;
        this.v.set(k.dx ?? 0, k.dy ?? -1, k.dz ?? 0).normalize();
        this.q.setFromUnitVectors(this.down, this.v);
        this.s.set(k.radius, k.length, k.radius);
        this.m.compose(this.v.set(k.x, k.y, k.z), this.q, this.s);
        this.mesh.setMatrixAt(n, this.m);
        this.c.set(k.color);
        lin[n * 4] = this.c.r;
        lin[n * 4 + 1] = this.c.g;
        lin[n * 4 + 2] = this.c.b;
        lin[n * 4 + 3] = k.intensity ?? 0.3;
        n++;
      }
    this.mesh.count = n;
    this.mesh.visible = n > 0;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.col.needsUpdate = true;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }
}
