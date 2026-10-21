import * as THREE from 'three';
import { LIGHTING_GLSL, type LightingUniforms } from '../../render/lighting';
import type { Rng } from '../../core/rng';
import { hash3, hexToLinear } from '../../core/math';

/** Calm FX caps per call (finished-game rules: short crumbles, a few motes, no fountains). */
export const FX_MAX = { dust: 6, sparkle: 8 } as const;

const vert = /* glsl */ `
in float aSize;
in float aAlpha;
in vec3 aColor;
in float aGlow;
uniform float uPixelScale;
out float vAlpha;
out vec3 vColor;
out vec3 vWorldPos;
out float vDepth;
out float vGlow;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorldPos = wp.xyz;
  vec4 mv = viewMatrix * wp;
  vDepth = length(mv.xyz);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = clamp(aSize * uPixelScale / max(0.1, -mv.z), 1.0, 64.0);
  // Fade particles that drift right in front of the lens instead of drawing huge blurry discs.
  // VIS r2: dust (no glow) fades sooner: a mining puff at arm's length read as a glowing disc.
  vAlpha = aAlpha * (aGlow > 0.5 ? smoothstep(0.5, 1.8, -mv.z) : smoothstep(0.8, 2.6, -mv.z));
  vColor = aColor;
  vGlow = aGlow;
}
`;

const frag = /* glsl */ `
precision highp float;
${LIGHTING_GLSL}
in float vAlpha;
in vec3 vColor;
in vec3 vWorldPos;
in float vDepth;
in float vGlow;
layout(location = 0) out highp vec4 fragColor;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float d = dot(c, c) * 4.0;
  if (d > 1.0) discard;
  // Dust is a soft puff (no edge); glints keep their small bright disc.
  float soft = vGlow > 0.5 ? (1.0 - d) : (1.0 - d) * (1.0 - d);
  // Lit by the same light volumes as everything else (no normal: average facing).
  vec4 ls = lightSample(vWorldPos);
  // Distance clamped to 1.2 m: motes drifting past the flame must not flash brighter than it.
  vec3 light = ambientFrom(ls) + lanternLight(vWorldPos, vWorldPos, normalize(uLanternPos - vWorldPos), 0.5, 1.2) * 0.8;
  vec3 col = vColor * mix(light, vec3(uAtmos.w), vGlow);
  vec4 atm = atmosphere(vWorldPos, vDepth, ls.rgb);
  col = mix(col, atm.rgb, atm.a);
  float a = vAlpha * soft * (1.0 - atm.a * 0.85);
  fragColor = vec4(sceneOut(col) * a, a);
}
`;

interface Puff {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  maxLife: number;
  size: number;
  grow: number;
  alpha: number;
  r: number;
  g: number;
  b: number;
  glow: number;
}

/**
 * Soft point particles: mining dust, sparkles, pickup glints, plus a persistent field of
 * floating cave motes around the explorer that catch the lantern light.
 * One draw call for puffs and one for motes.
 */
export class ParticleSystem {
  readonly group = new THREE.Group();
  private readonly puffs: Puff[] = [];
  private readonly max = 320;
  private readonly geo: THREE.BufferGeometry;
  private readonly pos: Float32Array;
  private readonly size: Float32Array;
  private readonly alpha: Float32Array;
  private readonly color: Float32Array;
  private readonly glowA: Float32Array;
  private readonly points: THREE.Points;
  private readonly material: THREE.ShaderMaterial;
  // Motes
  private readonly moteCount = 140;
  private readonly moteGeo: THREE.BufferGeometry;
  private readonly motePos: Float32Array;
  private readonly moteSeed: Float32Array;
  private readonly moteAlpha: Float32Array;
  budget: number;

  constructor(lighting: LightingUniforms, budget: number) {
    this.budget = Math.min(this.max, budget);
    this.material = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      uniforms: { ...lighting, uPixelScale: { value: 600 } },
      vertexShader: vert,
      fragmentShader: frag,
      transparent: true,
      depthWrite: false,
      blending: THREE.CustomBlending,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneMinusSrcAlphaFactor,
    });
    this.pos = new Float32Array(this.max * 3);
    this.size = new Float32Array(this.max);
    this.alpha = new Float32Array(this.max);
    this.color = new Float32Array(this.max * 3);
    this.glowA = new Float32Array(this.max);
    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('aColor', new THREE.BufferAttribute(this.color, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('aGlow', new THREE.BufferAttribute(this.glowA, 1).setUsage(THREE.DynamicDrawUsage));
    this.geo.setDrawRange(0, 0);
    this.points = new THREE.Points(this.geo, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = 8;
    this.group.add(this.points);

    this.motePos = new Float32Array(this.moteCount * 3);
    this.moteSeed = new Float32Array(this.moteCount * 3);
    this.moteAlpha = new Float32Array(this.moteCount);
    const moteSize = new Float32Array(this.moteCount);
    const moteColor = new Float32Array(this.moteCount * 3);
    const moteGlow = new Float32Array(this.moteCount);
    for (let i = 0; i < this.moteCount; i++) {
      // Deterministic seeds so screenshots are reproducible.
      this.moteSeed[i * 3] = hash3(i, 1, 7) * 1000;
      this.moteSeed[i * 3 + 1] = hash3(i, 2, 7) * 1000;
      this.moteSeed[i * 3 + 2] = hash3(i, 3, 7) * 1000;
      moteSize[i] = 0.018 + hash3(i, 4, 7) * 0.026;
      moteColor[i * 3] = 0.9;
      moteColor[i * 3 + 1] = 0.85;
      moteColor[i * 3 + 2] = 0.75;
    }
    this.moteGeo = new THREE.BufferGeometry();
    this.moteGeo.setAttribute('position', new THREE.BufferAttribute(this.motePos, 3).setUsage(THREE.DynamicDrawUsage));
    this.moteGeo.setAttribute('aSize', new THREE.BufferAttribute(moteSize, 1));
    this.moteGeo.setAttribute('aAlpha', new THREE.BufferAttribute(this.moteAlpha, 1).setUsage(THREE.DynamicDrawUsage));
    this.moteGeo.setAttribute('aColor', new THREE.BufferAttribute(moteColor, 3));
    this.moteGeo.setAttribute('aGlow', new THREE.BufferAttribute(moteGlow, 1));
    const motes = new THREE.Points(this.moteGeo, this.material);
    motes.frustumCulled = false;
    motes.renderOrder = 7;
    this.group.add(motes);
  }

  setPixelScale(heightPx: number, fovDeg: number): void {
    this.material.uniforms.uPixelScale.value = heightPx / (2 * Math.tan((fovDeg * Math.PI) / 360));
  }

  setBudget(n: number): void {
    this.budget = Math.min(this.max, n);
  }

  /** Dust cloud (e.g. when a block breaks). */
  dust(x: number, y: number, z: number, hex: number, count: number, rng: Rng, spread = 0.45): void {
    // Colors are sRGB hex like the rest of the palette; the shader works in linear light.
    const [r0, g0, b0] = hexToLinear(hex);
    // VIS r2: dust is the stone's colour half-greyed (a puff of copper ore is not orange paint).
    const l = 0.2126 * r0 + 0.7152 * g0 + 0.0722 * b0;
    const r = (r0 + l) / 2;
    const g = (g0 + l) / 2;
    const b = (b0 + l) / 2;
    // Calm FX: a few motes per call, never a cloud over the view.
    count = Math.min(count, FX_MAX.dust);
    for (let i = 0; i < count; i++) {
      this.spawn({
        x: x + rng.range(-spread, spread), y: y + rng.range(-spread, spread), z: z + rng.range(-spread, spread),
        vx: rng.range(-0.6, 0.6), vy: rng.range(0.1, 0.8), vz: rng.range(-0.6, 0.6),
        life: 0, maxLife: rng.range(0.7, 1.4), size: rng.range(0.25, 0.5), grow: 0.6, alpha: 0.36, r: r * 2.2, g: g * 2.2, b: b * 2.2, glow: 0,
      });
    }
  }

  /** Bright glints (crystal hits, pickups, discoveries). */
  sparkle(x: number, y: number, z: number, hex: number, count: number, rng: Rng, speed = 2.2): void {
    const [r, g, b] = hexToLinear(hex);
    count = Math.min(count, FX_MAX.sparkle);
    for (let i = 0; i < count; i++) {
      const a = rng.range(0, Math.PI * 2);
      const e = rng.range(-0.3, 1);
      this.spawn({
        x, y, z, vx: Math.cos(a) * speed * rng.range(0.3, 1), vy: e * speed, vz: Math.sin(a) * speed * rng.range(0.3, 1),
        life: 0, maxLife: rng.range(0.35, 0.8), size: rng.range(0.06, 0.12), grow: -0.5, alpha: 1, r: r * 2.5, g: g * 2.5, b: b * 2.5, glow: 1,
      });
    }
  }

  private spawn(p: Puff): void {
    if (this.puffs.length >= this.budget) this.puffs.shift();
    p.life = p.maxLife;
    this.puffs.push(p);
  }

  get activeCount(): number {
    return this.puffs.length;
  }

  update(dt: number, time: number, cx: number, cy: number, cz: number): void {
    // Puffs
    let n = 0;
    for (let i = this.puffs.length - 1; i >= 0; i--) {
      const p = this.puffs[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.puffs.splice(i, 1);
        continue;
      }
      p.vy -= (p.glow ? 3 : -0.15) * dt;
      p.vx *= 1 - 1.5 * dt;
      p.vy *= 1 - 1.5 * dt;
      p.vz *= 1 - 1.5 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      p.size = Math.max(0.01, p.size + p.grow * dt);
    }
    for (const p of this.puffs) {
      const t = p.life / p.maxLife;
      this.pos[n * 3] = p.x;
      this.pos[n * 3 + 1] = p.y;
      this.pos[n * 3 + 2] = p.z;
      this.size[n] = p.size;
      this.alpha[n] = p.alpha * Math.min(1, t * 2.2) * Math.min(1, (1 - t) * 8 + 0.2);
      this.color[n * 3] = p.r;
      this.color[n * 3 + 1] = p.g;
      this.color[n * 3 + 2] = p.b;
      this.glowA[n] = p.glow;
      n++;
    }
    this.geo.setDrawRange(0, n);
    if (n > 0) {
      for (const name of ['position', 'aSize', 'aAlpha', 'aColor', 'aGlow']) (this.geo.getAttribute(name) as THREE.BufferAttribute).needsUpdate = true;
    }

    // Motes: a 14 m box that wraps around the camera, drifting slowly.
    const R = 7;
    for (let i = 0; i < this.moteCount; i++) {
      const sx = this.moteSeed[i * 3];
      const sy = this.moteSeed[i * 3 + 1];
      const sz = this.moteSeed[i * 3 + 2];
      const wrap = (v: number, c: number) => c - R + ((((v - (c - R)) % (2 * R)) + 2 * R) % (2 * R));
      const x = wrap(sx + Math.sin(time * 0.13 + sy) * 1.5 + time * 0.05, cx);
      const y = wrap(sy + Math.sin(time * 0.11 + sz) * 1.2 - time * 0.04, cy);
      const z = wrap(sz + Math.cos(time * 0.09 + sx) * 1.5, cz);
      this.motePos[i * 3] = x;
      this.motePos[i * 3 + 1] = y;
      this.motePos[i * 3 + 2] = z;
      // Fade near the wrap boundary so motes never pop.
      const edge = Math.max(Math.abs(x - cx), Math.abs(y - cy), Math.abs(z - cz)) / R;
      this.moteAlpha[i] = 0.55 * Math.max(0, 1 - edge * edge) * (0.6 + 0.4 * Math.sin(time * 1.7 + sx));
    }
    (this.moteGeo.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    (this.moteGeo.getAttribute('aAlpha') as THREE.BufferAttribute).needsUpdate = true;
  }

  dispose(): void {
    this.geo.dispose();
    this.moteGeo.dispose();
    this.material.dispose();
  }
}
