import * as THREE from 'three';
import { LIGHTING_GLSL, type LightingUniforms } from '../../render/lighting';

/**
 * Round 3 (VIS, the Sulphur Bog's wow, in real places only): its vents breathe. Every 7-12 s one of
 * the layout's gas vents near the explorer (WORLD's `gasVent` props: the geyser field, the bog's
 * hollows) huffs a column of sulphur steam: puffs leave the vent one after another, rise fast and
 * slow, widen and thin out over ~4 s, faintly lit from within by the sulphur's yellow-green and by
 * whatever light is near. One draw call while a column stands; nothing between them. Calm: one column
 * at a time, never over the lens (a puff thins out as the eye comes into it).
 */

const PUFFS = 26;
/** Seconds a column lasts (the last puff leaves at ~1.6 s and is gone by ~4.2 s). */
export const GEYSER_TIME = 4.4;

const vert = /* glsl */ `
in vec2 aCorner;
in vec4 aPuff;   // x leave time (s), y rise speed (m/s), z size (m), w drift seed
uniform vec3 uOrigin;
uniform float uAge;
uniform float uHeight;
out vec2 vUv;
out float vAlpha;
out vec3 vWorldPos;
out float vDepth;
out float vRise;
void main() {
  float age = uAge - aPuff.x;
  float live = step(0.0, age) * step(age, 2.6);
  age = clamp(age, 0.0, 2.6);
  // Fast out of the vent, slowing as it climbs (an exponential approach to its height).
  float rise = uHeight * (1.0 - exp(-age * aPuff.y / uHeight));
  float a = aPuff.w * 6.2832;
  vec3 drift = vec3(cos(a), 0.0, sin(a)) * (0.15 + age * 0.35);
  vec3 c = uOrigin + vec3(0.0, 0.2 + rise, 0.0) + drift;
  float size = aPuff.z * (0.35 + age * 0.75);
  vec4 mv = viewMatrix * vec4(c, 1.0);
  float d = length(mv.xyz);
  vAlpha = live * smoothstep(0.0, 0.25, age) * (1.0 - smoothstep(1.2, 2.6, age)) * smoothstep(size * 0.4, size * 1.3, d);
  mv.xy += aCorner * size;
  vWorldPos = c;
  vDepth = d;
  vUv = aCorner;
  vRise = rise / uHeight;
  gl_Position = projectionMatrix * mv;
}
`;

const frag = /* glsl */ `
precision highp float;
${LIGHTING_GLSL}
in vec2 vUv;
in float vAlpha;
in vec3 vWorldPos;
in float vDepth;
in float vRise;
layout(location = 0) out highp vec4 fragColor;
float gh(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float gn(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(gh(i), gh(i + vec2(1, 0)), u.x), mix(gh(i + vec2(0, 1)), gh(i + vec2(1, 1)), u.x), u.y);
}
void main() {
  float r2 = dot(vUv, vUv);
  if (r2 > 1.0 || vAlpha < 0.003) discard;
  float n = gn(vUv * 2.6 + vWorldPos.xz * 0.4 + uTime * 0.3) * 0.6 + gn(vUv * 6.0 - uTime * 0.5) * 0.4;
  float a = exp(-r2 * 2.4) * (1.0 - r2) * vAlpha * (0.55 + 0.6 * n) * 0.5;
  vec4 ls = lightSample(vWorldPos);
  vec3 lit = ambientFrom(ls) * 0.9 + lanternLight(vWorldPos, vWorldPos, normalize(uLanternPos - vWorldPos), 0.5, 1.2) * 0.4;
  // Steam, warmest low in the column where the vent's heat lights it from within.
  vec3 col = vec3(0.78, 0.82, 0.55) * (lit + vec3(0.06, 0.07, 0.015)) + vec3(0.09, 0.11, 0.02) * (1.0 - vRise) * uAtmos.w;
  vec4 atm = atmosphere(vWorldPos, vDepth, ls.rgb);
  col = mix(col, atm.rgb, atm.a);
  fragColor = vec4(sceneOut(col) * a, a);
}
`;

export class GeyserFx {
  readonly group = new THREE.Group();
  private readonly mesh: THREE.Mesh<THREE.InstancedBufferGeometry, THREE.ShaderMaterial>;
  private vents: Array<[number, number, number]> = [];
  private wait = 6;
  private age = -1;
  /** Eruptions so far (the report, tests). */
  eruptions = 0;
  /** The vent erupting now (null between columns). */
  active: [number, number, number] | null = null;

  constructor(lighting: LightingUniforms) {
    this.group.name = 'geysers';
    const g = new THREE.InstancedBufferGeometry();
    g.setAttribute('aCorner', new THREE.BufferAttribute(new Float32Array([-1, -1, 1, -1, 1, 1, -1, 1]), 2));
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(12), 3));
    g.setIndex([0, 1, 2, 0, 2, 3]);
    const puff = new Float32Array(PUFFS * 4);
    for (let i = 0; i < PUFFS; i++) {
      const h = (i * 0.618034) % 1;
      puff.set([(i / PUFFS) * 1.6, 3.2 + h * 2.4, 0.55 + ((i * 0.377) % 1) * 0.5, (i * 0.7548) % 1], i * 4);
    }
    g.setAttribute('aPuff', new THREE.InstancedBufferAttribute(puff, 4));
    g.instanceCount = PUFFS;
    this.mesh = new THREE.Mesh(
      g,
      new THREE.ShaderMaterial({
        glslVersion: THREE.GLSL3,
        uniforms: { ...lighting, uOrigin: { value: new THREE.Vector3() }, uAge: { value: 0 }, uHeight: { value: 5.5 } },
        vertexShader: vert,
        fragmentShader: frag,
        transparent: true,
        depthWrite: false,
        blending: THREE.CustomBlending,
        blendSrc: THREE.OneFactor,
        blendDst: THREE.OneMinusSrcAlphaFactor,
      }),
    );
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 8;
    this.mesh.visible = false;
    this.group.add(this.mesh);
  }

  /** The layout's vents (a new layout): any column stops. */
  setVents(vents: ReadonlyArray<readonly number[]>): void {
    this.vents = vents.filter((v) => v.length >= 3 && v.every((n) => Number.isFinite(n))).map((v) => [v[0], v[1], v[2]]);
    this.stop();
  }

  get ventCount(): number {
    return this.vents.length;
  }

  /** Erupt the vent nearest (x, y, z) within `reach` m now (the debug API, captures); false if none. */
  erupt(x: number, y: number, z: number, reach = 30): boolean {
    let best: [number, number, number] | null = null;
    let bd = reach;
    for (const v of this.vents) {
      const d = Math.hypot(v[0] - x, (v[1] - y) * 1.5, v[2] - z);
      if (d < bd) {
        bd = d;
        best = v;
      }
    }
    if (!best) return false;
    this.active = best;
    this.age = 0;
    this.eruptions++;
    (this.mesh.material.uniforms.uOrigin.value as THREE.Vector3).set(best[0], best[1], best[2]);
    this.mesh.visible = true;
    return true;
  }

  stop(): void {
    this.age = -1;
    this.active = null;
    this.mesh.visible = false;
  }

  /** Each frame: the column rises; between columns, the next vent near the explorer is chosen. */
  update(dt: number, camera: THREE.Camera): void {
    if (!this.vents.length) return;
    if (this.age >= 0) {
      this.age += dt;
      this.mesh.material.uniforms.uAge.value = this.age;
      if (this.age > GEYSER_TIME) this.stop();
      return;
    }
    this.wait -= dt;
    if (this.wait > 0) return;
    this.wait = 7 + Math.random() * 5;
    const p = camera.position;
    this.erupt(p.x, p.y - 1.6, p.z, 28);
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
  }
}
