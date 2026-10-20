import * as THREE from 'three';
import { LIGHTING_GLSL, type LightingUniforms } from '../lighting';
import type { Rng } from '../../core/rng';

/**
 * GPU particles (SPEC §11.4, BUILD W2 MUST 4): a ring of stateless particles in one instanced draw. Each slot
 * holds its spawn state (position + birth time, velocity + life, size0 / size1 / drag / gravity, colour + kind
 * flags); the vertex shader evaluates the exact drag-and-gravity motion from the FX clock, so the CPU writes
 * only the slots it spawns (no per-frame particle loop) and a hit-stop freezes them for free (`uFxTime`).
 *
 * Motion (per axis, drag k, gravity g on y; exact solution of v' = -k v + g):
 *   p(t) = p0 + v0 (1 - e^{-kt}) / k + g (t / k - (1 - e^{-kt}) / k^2)       (k > 0)
 *   p(t) = p0 + v0 t + g t^2 / 2                                               (k = 0)
 * `motionAt()` is the same formula in TypeScript (tested against a stepped integration).
 *
 * Blending is premultiplied (ONE, ONE_MINUS_SRC_ALPHA): lit kinds (dust, chips, spores) write their alpha;
 * additive kinds (sparks, glints, embers, rings) write alpha 0, so one draw mixes both. Particles fade within
 * 0.3 m of the cut plane and the back wall (an analytic soft plane, CRITIQUE B SHOULD 4), so no hard
 * intersection lines show without a depth texture.
 *
 * The density governor (SPEC §10.12): every spawn request is scaled by min(1, cap / (live + requested)) and
 * by the screen-area budget; live particles are never killed early (the ring only overwrites dead slots).
 */

export type ParticleKind = 'dust' | 'chip' | 'spark' | 'glint' | 'ember' | 'ring' | 'mote' | 'spore' | 'bubble' | 'streak';

/** Kind flags in the shader: 0 lit soft disc, 1 additive soft disc, 2 additive ring, 3 additive streak (velocity aligned), 4 lit square chip. */
const KIND_MODE: Record<ParticleKind, number> = { dust: 0, chip: 4, spark: 3, glint: 1, ember: 1, ring: 2, mote: 1, spore: 0, bubble: 2, streak: 3 };

export interface ParticleBurst {
  kind: ParticleKind;
  /** World position of the source. */
  x: number;
  y: number;
  z: number;
  count: number;
  /** sRGB hex colour (a second colour mixes in at random when given). */
  color: number;
  color2?: number;
  /** Speed range (m/s) and the cone: a direction and a spread 0 (a ray) .. 1 (a sphere). */
  speed: [number, number];
  dir?: [number, number, number];
  spread?: number;
  /** Life range (s). */
  life: [number, number];
  /** World size (m) at birth and death. */
  size: [number, number];
  drag?: number;
  /** m/s² on y (negative falls). */
  gravity?: number;
  /** Spawn jitter radius around the source (m). */
  jitter?: number;
  /** 0..1 emissive (1 = not lit by the world). */
  glow?: number;
}

/** The exact position along one axis at age t (the shader's formula). */
export function motionAt(p0: number, v0: number, g: number, k: number, t: number): number {
  if (k <= 1e-6) return p0 + v0 * t + 0.5 * g * t * t;
  const e = 1 - Math.exp(-k * t);
  return p0 + (v0 * e) / k + g * (t / k - e / (k * k));
}

/** How many of `requested` the governor lets through with `live` alive under `cap` (never more than requested). */
export function governed(requested: number, live: number, cap: number): number {
  if (requested <= 0 || cap <= 0) return 0;
  const room = Math.max(0, cap - live);
  const scale = Math.min(1, cap / Math.max(1, live + requested));
  return Math.max(0, Math.min(room, Math.round(requested * scale)));
}

const vert = /* glsl */ `
in vec4 aPos;   // spawn xyz, birth time (FX clock)
in vec4 aVel;   // v0 xyz, life
in vec4 aShape; // size0, size1, drag, gravity
in vec4 aCol;   // rgb (linear), mode + glow * 0.1 (mode in the integer part)
uniform float uFxTime;
uniform vec3 uCamRight;
uniform vec3 uCamUp;
out vec2 vUv;
out vec3 vColor;
out float vAlpha;
out float vMode;
out float vGlow;
out vec3 vWorldPos;
out float vDepth;
float axis(float p0, float v0, float g, float k, float t) {
  if (k < 1e-4) return p0 + v0 * t + 0.5 * g * t * t;
  float e = 1.0 - exp(-k * t);
  return p0 + v0 * e / k + g * (t / k - e / (k * k));
}
void main() {
  float age = uFxTime - aPos.w;
  float life = aVel.w;
  float u = age / max(1e-3, life);
  vMode = floor(aCol.w);
  vGlow = fract(aCol.w) * 10.0;
  vColor = aCol.rgb;
  vUv = position.xy;
  if (age < 0.0 || u >= 1.0) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    vAlpha = 0.0;
    vWorldPos = vec3(0.0);
    vDepth = 0.0;
    return;
  }
  float k = aShape.z;
  float g = aShape.w;
  vec3 p = vec3(axis(aPos.x, aVel.x, 0.0, k, age), axis(aPos.y, aVel.y, g, k, age), axis(aPos.z, aVel.z, 0.0, k, age));
  float size = mix(aShape.x, aShape.y, u);
  vec3 right = uCamRight;
  vec3 up = uCamUp;
  if (vMode > 2.5 && vMode < 3.5) {
    // A streak: stretched along the screen-projected velocity.
    float ek = exp(-k * age);
    vec3 v = vec3(aVel.x * ek, aVel.y * ek + g * (1.0 - ek) / max(k, 1e-3), aVel.z * ek);
    vec2 sv = vec2(dot(v, uCamRight), dot(v, uCamUp));
    float l = length(sv);
    vec2 d = l > 1e-3 ? sv / l : vec2(0.0, 1.0);
    right = uCamRight * d.x + uCamUp * d.y;
    up = -uCamRight * d.y + uCamUp * d.x;
    vec3 wp = p + right * position.x * size * (1.0 + min(6.0, l * 0.09)) + up * position.y * size * 0.35;
    vWorldPos = wp;
  } else {
    vWorldPos = p + (right * position.x + up * position.y) * size;
  }
  // Fade in over the first 6 %, out over the last 35 %; the soft planes at the cut (z 60) and the back wall (z 57).
  float a = smoothstep(0.0, 0.06, u) * (1.0 - smoothstep(0.65, 1.0, u));
  a *= smoothstep(0.0, 0.3, abs(vWorldPos.z - 60.0)) * smoothstep(0.0, 0.3, abs(vWorldPos.z - 57.0) + step(vWorldPos.z, 56.0) * 1.0);
  vAlpha = a;
  vec4 mv = viewMatrix * vec4(vWorldPos, 1.0);
  vDepth = length(mv.xyz);
  // Never a huge blurry disc right in front of the lens.
  vAlpha *= smoothstep(0.6, 2.0, -mv.z);
  gl_Position = projectionMatrix * mv;
}
`;

const frag = /* glsl */ `
precision highp float;
${LIGHTING_GLSL}
in vec2 vUv;
in vec3 vColor;
in float vAlpha;
in float vMode;
in float vGlow;
in vec3 vWorldPos;
in float vDepth;
layout(location = 0) out highp vec4 fragColor;
void main() {
  if (vAlpha <= 0.002) discard;
  vec2 c = vUv * 2.0;
  float r2 = dot(c, c);
  float shape;
  if (vMode < 0.5 || (vMode > 0.5 && vMode < 1.5)) shape = max(0.0, 1.0 - r2) * max(0.0, 1.0 - r2);
  else if (vMode < 2.5) { float r = sqrt(r2); shape = smoothstep(0.62, 0.8, r) * (1.0 - smoothstep(0.82, 1.0, r)); }
  else if (vMode < 3.5) shape = max(0.0, 1.0 - c.x * c.x) * max(0.0, 1.0 - c.y * c.y * 1.4);
  else shape = step(max(abs(c.x), abs(c.y)), 0.82) * (0.75 + 0.25 * step(c.x + c.y, 0.0));
  if (shape <= 0.003) discard;
  vec3 col = vColor;
  vec4 ls = lightSample(vWorldPos);
  vec4 atm = atmosphere(vWorldPos, vDepth, ls.rgb);
  bool additive = vMode > 0.5 && vMode < 3.5;
  if (!additive) {
    vec3 light = ambientFrom(ls) + lanternLight(vWorldPos, vWorldPos, normalize(uLanternPos - vWorldPos), 0.5, 1.2) * 0.85;
    col = col * mix(light, vec3(1.0), vGlow);
    col = mix(col, atm.rgb, atm.a);
    float a = vAlpha * shape * (1.0 - atm.a * 0.85);
    fragColor = vec4(sceneOut(col) * a, a);
  } else {
    // Additive: HDR emission (bloom picks it up), alpha 0 so it adds.
    float a = vAlpha * shape * (1.0 - atm.a * 0.9);
    fragColor = vec4(sceneOut(col * (1.0 + 2.0 * vGlow)) * a, 0.0);
  }
}
`;

const _c = new THREE.Color();
const _r = new THREE.Vector3();
const _u = new THREE.Vector3();
const _f = new THREE.Vector3();

export class GpuParticles {
  readonly mesh: THREE.Mesh;
  readonly material: THREE.ShaderMaterial;
  /** The ring size (the hard maximum); `cap` is the preset's live cap (SPEC §11.5). */
  readonly size: number;
  cap: number;
  private readonly geo: THREE.InstancedBufferGeometry;
  private readonly aPos: THREE.InstancedBufferAttribute;
  private readonly aVel: THREE.InstancedBufferAttribute;
  private readonly aShape: THREE.InstancedBufferAttribute;
  private readonly aCol: THREE.InstancedBufferAttribute;
  /** Death time of each slot (FX clock), for the live count and the ring's dead-slot search. */
  private readonly deathAt: Float32Array;
  private head = 0;
  private dirtyLo = Infinity;
  private dirtyHi = -1;
  /** FX clock (s): advanced by update(fxDt). */
  time = 0;
  /** Spawned since boot (debug). */
  spawned = 0;
  /** Particles refused by the governor since boot (debug). */
  refused = 0;
  /** Particle count multiplier (Motion levels: 1, Reduced 0.6, Off: ≤ 20 per burst). */
  scale = 1;
  motionOff = false;
  private liveCache = 0;
  private liveAt = -1;

  constructor(lighting: LightingUniforms, cap = 1024, size = 4096) {
    this.size = size;
    this.cap = Math.min(cap, size);
    const geo = new THREE.InstancedBufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0], 3));
    geo.setIndex([0, 1, 2, 0, 2, 3]);
    const mk = () => {
      const a = new THREE.InstancedBufferAttribute(new Float32Array(size * 4), 4);
      a.setUsage(THREE.DynamicDrawUsage);
      return a;
    };
    this.aPos = mk();
    this.aVel = mk();
    this.aShape = mk();
    this.aCol = mk();
    // Every slot starts dead (born in the far past with a tiny life).
    for (let i = 0; i < size; i++) {
      this.aPos.array[i * 4 + 3] = -1e6;
      this.aVel.array[i * 4 + 3] = 1e-3;
    }
    geo.setAttribute('aPos', this.aPos);
    geo.setAttribute('aVel', this.aVel);
    geo.setAttribute('aShape', this.aShape);
    geo.setAttribute('aCol', this.aCol);
    geo.instanceCount = size;
    this.geo = geo;
    this.deathAt = new Float32Array(size).fill(-1);
    this.material = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: vert,
      fragmentShader: frag,
      uniforms: { ...(lighting as unknown as Record<string, THREE.IUniform>), uFxTime: { value: 0 }, uCamRight: { value: new THREE.Vector3(1, 0, 0) }, uCamUp: { value: new THREE.Vector3(0, 1, 0) } },
      transparent: true,
      depthWrite: false,
      depthTest: true,
      blending: THREE.CustomBlending,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneMinusSrcAlphaFactor,
      blendSrcAlpha: THREE.OneFactor,
      blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
    });
    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.name = 'gpuParticles';
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 30;
  }

  /** Live particles now (cached per frame). */
  get live(): number {
    if (this.liveAt === this.time) return this.liveCache;
    let n = 0;
    const t = this.time;
    const d = this.deathAt;
    for (let i = 0; i < d.length; i++) if (d[i] > t) n++;
    this.liveCache = n;
    this.liveAt = this.time;
    return n;
  }

  /** Spawn a burst under the governor. @returns how many were spawned. */
  burst(b: ParticleBurst, rng: Rng): number {
    let want = Math.round(b.count * this.scale);
    if (this.motionOff) want = Math.min(want, 20);
    const n = governed(want, this.live, this.cap);
    this.refused += Math.max(0, want - n);
    if (n <= 0) return 0;
    _c.set(b.color);
    const r1 = _c.r;
    const g1 = _c.g;
    const b1 = _c.b;
    let r2 = r1;
    let g2 = g1;
    let b2 = b1;
    if (b.color2 !== undefined) {
      _c.set(b.color2);
      r2 = _c.r;
      g2 = _c.g;
      b2 = _c.b;
    }
    const mode = KIND_MODE[b.kind] + Math.min(0.0999, (b.glow ?? (KIND_MODE[b.kind] === 0 || KIND_MODE[b.kind] === 4 ? 0 : 1)) * 0.0999);
    const dir = b.dir ?? [0, 1, 0];
    const spread = b.spread ?? 1;
    const jit = b.jitter ?? 0.15;
    const dl = Math.hypot(dir[0], dir[1], dir[2]) || 1;
    const dx = dir[0] / dl;
    const dy = dir[1] / dl;
    const dz = dir[2] / dl;
    for (let i = 0; i < n; i++) {
      const s = this.nextSlot();
      // A direction in the cone: mix the axis with a random unit vector.
      const th = rng.next() * Math.PI * 2;
      const cz = rng.next() * 2 - 1;
      const sr = Math.sqrt(1 - cz * cz);
      let vx = dx * (1 - spread) + Math.cos(th) * sr * spread;
      let vy = dy * (1 - spread) + Math.sin(th) * sr * spread;
      let vz = dz * (1 - spread) + cz * spread;
      const vl = Math.hypot(vx, vy, vz) || 1;
      const sp = b.speed[0] + rng.next() * (b.speed[1] - b.speed[0]);
      vx = (vx / vl) * sp;
      vy = (vy / vl) * sp;
      vz = (vz / vl) * sp;
      const life = b.life[0] + rng.next() * (b.life[1] - b.life[0]);
      const p = this.aPos.array as Float32Array;
      const v = this.aVel.array as Float32Array;
      const sh = this.aShape.array as Float32Array;
      const co = this.aCol.array as Float32Array;
      const o = s * 4;
      p[o] = b.x + (rng.next() * 2 - 1) * jit;
      p[o + 1] = b.y + (rng.next() * 2 - 1) * jit;
      p[o + 2] = b.z + (rng.next() * 2 - 1) * jit * 0.5;
      p[o + 3] = this.time;
      v[o] = vx;
      v[o + 1] = vy;
      v[o + 2] = vz;
      v[o + 3] = life;
      const jsz = 0.8 + rng.next() * 0.4;
      sh[o] = b.size[0] * jsz;
      sh[o + 1] = b.size[1] * jsz;
      sh[o + 2] = b.drag ?? 2;
      sh[o + 3] = b.gravity ?? 0;
      const m = rng.next();
      co[o] = r1 + (r2 - r1) * m;
      co[o + 1] = g1 + (g2 - g1) * m;
      co[o + 2] = b1 + (b2 - b1) * m;
      co[o + 3] = mode;
      this.deathAt[s] = this.time + life;
      if (s < this.dirtyLo) this.dirtyLo = s;
      if (s > this.dirtyHi) this.dirtyHi = s;
    }
    this.spawned += n;
    this.liveCache += n;
    return n;
  }

  /** The next free slot from the ring head (a dead slot; if every slot lives, the oldest is reused). */
  private nextSlot(): number {
    const t = this.time;
    for (let k = 0; k < this.size; k++) {
      const s = (this.head + k) % this.size;
      if (this.deathAt[s] <= t) {
        this.head = (s + 1) % this.size;
        return s;
      }
    }
    const s = this.head;
    this.head = (s + 1) % this.size;
    return s;
  }

  /** Advance the FX clock (0 during a hit-stop) and upload the slots written since the last frame. */
  update(fxDt: number, camera: THREE.Camera): void {
    this.time += Math.max(0, fxDt);
    this.material.uniforms.uFxTime.value = this.time;
    camera.matrixWorld.extractBasis(_r, _u, _f);
    this.material.uniforms.uCamRight.value.copy(_r);
    this.material.uniforms.uCamUp.value.copy(_u);
    if (this.dirtyHi >= 0) {
      const start = this.dirtyLo * 4;
      const count = (this.dirtyHi - this.dirtyLo + 1) * 4;
      for (const a of [this.aPos, this.aVel, this.aShape, this.aCol]) {
        a.clearUpdateRanges();
        a.addUpdateRange(start, count);
        a.needsUpdate = true;
      }
      this.dirtyLo = Infinity;
      this.dirtyHi = -1;
    }
  }

  dispose(): void {
    this.geo.dispose();
    this.material.dispose();
  }
}
