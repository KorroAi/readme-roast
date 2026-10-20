import * as THREE from 'three';
import { LIGHTING_GLSL, type LightingUniforms } from '../lighting';

/**
 * Liquids (SPEC §11.4): water, lava, brass, ice and spore sheets on cavern floors. Every pool is one instance of
 * a flat quad in a single instanced draw (SPEC §11.6 asks ≤ 2 pool draws in view; this is 1 for all of them).
 * The fragment shader shapes the pool (a noisy rounded outline, so no rectangle shows), scrolls two ripple
 * fields, lights water and ice from the light volume with a lantern glint, and makes lava, brass and spore
 * emissive (bloom picks them up). Premultiplied blending like the particles; no depth write, so props and
 * creatures standing in a pool stay visible through it. A pool lower than its floor fills the hollow it sits in.
 */
export type LiquidKind = 'water' | 'lava' | 'brass' | 'ice' | 'spore';

export interface LiquidSpec {
  id: string;
  kind: LiquidKind;
  /** The surface: world y, x and z extents. */
  y: number;
  x0: number;
  x1: number;
  z0: number;
  z1: number;
}

const KIND: Record<LiquidKind, number> = { water: 0, lava: 1, brass: 2, ice: 3, spore: 4 };
const MAX_POOLS = 48;

const vert = /* glsl */ `
in vec4 aRect;
in vec2 aPool;
out vec3 vWorldPos;
out vec2 vLocal;
out vec2 vSize;
out float vKind;
out float vSeed;
out float vDepth;
void main() {
  vec2 size = aRect.zw - aRect.xy;
  vec3 wp = vec3(aRect.x + position.x * size.x, aPool.x, aRect.y + position.z * size.y);
  vWorldPos = wp;
  vLocal = position.xz;
  vSize = size;
  vKind = floor(aPool.y + 0.5);
  vSeed = fract(aPool.y) * 17.0 + aRect.x * 0.37 + aRect.y * 0.11;
  vec4 mv = viewMatrix * vec4(wp, 1.0);
  vDepth = length(mv.xyz);
  gl_Position = projectionMatrix * mv;
}
`;

const frag = /* glsl */ `
precision highp float;
${LIGHTING_GLSL}
uniform float uLiqTime;
in vec3 vWorldPos;
in vec2 vLocal;
in vec2 vSize;
in float vKind;
in float vSeed;
in float vDepth;
layout(location = 0) out highp vec4 fragColor;

float h21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h21(i), h21(i + vec2(1.0, 0.0)), f.x), mix(h21(i + vec2(0.0, 1.0)), h21(i + vec2(1.0, 1.0)), f.x), f.y);
}

void main() {
  // The outline: a superellipse in the pool rectangle, its edge pushed by noise (metres), feathered over 0.35 m.
  vec2 q = (vLocal - 0.5) * 2.0;
  float r = pow(pow(abs(q.x), 3.0) + pow(abs(q.y), 3.0), 1.0 / 3.0);
  float edgeM = (1.0 - r) * 0.5 * min(vSize.x, vSize.y) + (vnoise(vWorldPos.xz * 0.9 + vSeed) - 0.5) * 0.9;
  float shore = smoothstep(0.0, 0.35, edgeM);
  if (shore <= 0.002) discard;
  float t = uLiqTime;
  vec2 p = vWorldPos.xz;
  float n1 = vnoise(p * 1.3 + vec2(t * 0.35, t * 0.21) + vSeed);
  float n2 = vnoise(p * 2.7 - vec2(t * 0.27, -t * 0.4) + vSeed * 2.0);
  float ripple = n1 * 0.6 + n2 * 0.4;
  vec3 n = normalize(vec3((n1 - 0.5) * 0.35, 1.0, (n2 - 0.5) * 0.35));
  vec4 ls = lightSample(vWorldPos + vec3(0.0, 0.4, 0.0));
  vec3 light = ambientFrom(ls, n) + lanternLight(vWorldPos, vWorldPos, n, 0.5, 1.2) * 0.85 + impactLight(vWorldPos, n);
  vec3 col;
  float a;
  if (vKind < 0.5) {
    // Water: dark depth, a lighter shallow rim, glints where the ripples face the light.
    col = mix(vec3(0.02, 0.06, 0.10), vec3(0.06, 0.17, 0.22), 1.0 - shore * 0.7) * light;
    col += light * smoothstep(0.72, 0.9, ripple) * 0.3;
    col += vec3(0.85, 0.95, 1.0) * smoothstep(0.08, 0.0, edgeM - 0.12) * 0.06 * (0.5 + n2);
    a = 0.82;
  } else if (vKind < 1.5) {
    // Lava: glowing flow under a cracked dark crust that drifts slowly.
    float crust = smoothstep(0.52, 0.66, vnoise(p * 1.1 + vec2(t * 0.06, t * 0.04) + vSeed));
    vec3 hot = mix(vec3(2.6, 0.55, 0.08), vec3(3.2, 1.6, 0.35), n2);
    col = mix(hot * (0.8 + 0.4 * n1), vec3(0.09, 0.035, 0.02) * light + hot * 0.06, crust);
    a = 1.0;
  } else if (vKind < 2.5) {
    // Molten brass: a slow golden sheen with bright streaks.
    float streak = smoothstep(0.7, 0.95, vnoise(vec2(p.x * 3.0 + t * 0.5, p.y * 0.6) + vSeed));
    col = vec3(0.95, 0.62, 0.22) * (0.55 + 0.6 * n1) * (0.6 + light) + vec3(1.8, 1.3, 0.6) * streak;
    a = 1.0;
  } else if (vKind < 3.5) {
    // Ice: pale and still, with hairline cracks.
    float crack = smoothstep(0.03, 0.0, abs(vnoise(p * 2.2 + vSeed) - 0.5)) * 0.6;
    col = mix(vec3(0.55, 0.72, 0.82), vec3(0.85, 0.94, 1.0), ripple * 0.4) * light * (1.0 - crack * 0.5) + vec3(0.6, 0.85, 1.0) * crack * 0.25;
    a = 0.92;
  } else {
    // Spore mire: murky green with glowing specks drifting on it.
    float speck = smoothstep(0.86, 0.95, vnoise(p * 6.0 + vec2(t * 0.15, -t * 0.1) + vSeed));
    col = vec3(0.04, 0.07, 0.03) * light + vec3(0.5, 1.1, 0.25) * speck + vec3(0.03, 0.08, 0.02) * n1;
    a = 0.9;
  }
  vec4 atm = atmosphere(vWorldPos, vDepth, ls.rgb);
  col = mix(col, atm.rgb, atm.a);
  a *= shore;
  fragColor = vec4(sceneOut(col) * a, a);
}
`;

export class LiquidPlane {
  readonly group = new THREE.Group();
  readonly mesh: THREE.Mesh;
  readonly material: THREE.ShaderMaterial;
  private readonly geo: THREE.InstancedBufferGeometry;
  private readonly aRect: THREE.InstancedBufferAttribute;
  private readonly aPool: THREE.InstancedBufferAttribute;
  private readonly pools: LiquidSpec[] = [];
  private dirty = false;

  constructor(lighting: LightingUniforms) {
    this.group.name = 'liquids';
    const quad = new THREE.PlaneGeometry(1, 1, 1, 1);
    quad.rotateX(-Math.PI / 2);
    quad.translate(0.5, 0, 0.5);
    const geo = new THREE.InstancedBufferGeometry();
    geo.index = quad.index;
    geo.setAttribute('position', quad.getAttribute('position'));
    this.aRect = new THREE.InstancedBufferAttribute(new Float32Array(MAX_POOLS * 4), 4);
    this.aPool = new THREE.InstancedBufferAttribute(new Float32Array(MAX_POOLS * 2), 2);
    this.aRect.setUsage(THREE.DynamicDrawUsage);
    this.aPool.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('aRect', this.aRect);
    geo.setAttribute('aPool', this.aPool);
    geo.instanceCount = 0;
    this.geo = geo;
    this.material = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: vert,
      fragmentShader: frag,
      uniforms: { ...(lighting as unknown as Record<string, THREE.IUniform>), uLiqTime: { value: 0 } },
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
    this.mesh.name = 'liquidPools';
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 2;
    this.mesh.visible = false;
    this.group.add(this.mesh);
  }

  /** Pools alive (tests, the debug panel). */
  get count(): number {
    return this.pools.length;
  }

  add(spec: LiquidSpec): void {
    if (this.pools.some((p) => p.id === spec.id)) return;
    if (spec.x1 - spec.x0 < 1 || spec.z1 - spec.z0 < 1) return;
    // The oldest pool goes first when the ring holds more (the ring keeps 10 slabs; pools are rare).
    if (this.pools.length >= MAX_POOLS) this.pools.shift();
    this.pools.push(spec);
    this.dirty = true;
  }

  remove(id: string): void {
    const i = this.pools.findIndex((p) => p.id === id);
    if (i < 0) return;
    this.pools.splice(i, 1);
    this.dirty = true;
  }

  update(time: number): void {
    this.material.uniforms.uLiqTime.value = time % 1000;
    if (!this.dirty) return;
    this.dirty = false;
    const r = this.aRect.array as Float32Array;
    const p = this.aPool.array as Float32Array;
    for (let i = 0; i < this.pools.length; i++) {
      const s = this.pools[i];
      r.set([s.x0, s.z0, s.x1, s.z1], i * 4);
      // Kind in the integer part, a per-pool seed in the fraction.
      let h = 0;
      for (let c = 0; c < s.id.length; c++) h = (h * 31 + s.id.charCodeAt(c)) >>> 0;
      p[i * 2] = s.y;
      p[i * 2 + 1] = KIND[s.kind] + ((h % 997) / 997) * 0.45;
    }
    this.aRect.needsUpdate = true;
    this.aPool.needsUpdate = true;
    this.geo.instanceCount = this.pools.length;
    this.mesh.visible = this.pools.length > 0;
  }

  dispose(): void {
    this.geo.dispose();
    this.material.dispose();
  }
}
