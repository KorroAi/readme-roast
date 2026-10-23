import * as THREE from 'three';
import { LIGHTING_GLSL, type LightingUniforms } from '../../render/lighting';

/**
 * Round 3 (VIS): the hazards made visible, in real places only (BRIEF §3 VIS).
 *
 * - Cold: the explorer's breath fogs in front of the lens every few seconds in the frost (and when
 *   the cold meter rises), and a pale rime creeps in from the screen's edges with the meter.
 * - Gas: WORLD's gas pockets (layout.hazards kind 'gas') hold a low, slowly churning haze of soft
 *   green-yellow veils (instanced, one draw call), and inside one the screen takes a sickly cast.
 * - Heat: near lava (layout.hazards kind 'lava') the lower view shimmers and the edge warms; the lava
 *   itself crawls with light (terrain shader).
 * - The dark and the void: the screen's edge closes in, violet-black, with the meter.
 * The screen-edge parts are the post pass's (PostFX params.hazard: x frost, y gas, z heat, w dark),
 * eased here over ~1 s; none of them ever covers the centre.
 */

export type HazardKind = 'cold' | 'gas' | 'heat' | 'dark' | null;

/** What the hazard meter says (LOOP's gameplay/Hazards: active kind and meter 0..1). */
export interface HazardReading {
  kind: HazardKind;
  level: number;
}

/** WORLD's hazard zones (StratumLayout.hazards), read structurally. */
export interface HazardZoneView {
  kind: string;
  centre: readonly [number, number, number] | readonly number[];
  radius: number;
  strength?: number;
}

/** Veils per gas pocket and their reach. */
const VEILS_MAX = 160;

const veilVert = /* glsl */ `
in vec2 aCorner;
in vec4 aVeil;   // xyz centre, w size (m)
in vec4 aSeed;   // x phase, y drift radius, z alpha, w unused
uniform float uTime;
out vec2 vUv;
out float vAlpha;
out vec3 vWorldPos;
out float vDepth;
void main() {
  float t = uTime * 0.07 + aSeed.x * 6.2832;
  vec3 c = aVeil.xyz + vec3(cos(t), sin(t * 0.7) * 0.25, sin(t)) * aSeed.y;
  vec4 mv = viewMatrix * vec4(c, 1.0);
  float size = aVeil.w * (0.9 + 0.1 * sin(uTime * 0.3 + aSeed.x * 11.0));
  float d = length(mv.xyz);
  // Never a veil over the lens: thin out as the eye enters one.
  vAlpha = aSeed.z * smoothstep(size * 0.35, size * 1.1, d) * (1.0 - smoothstep(38.0, 48.0, d));
  mv.xy += aCorner * size;
  vWorldPos = c + vec3(aCorner * size, 0.0);
  vDepth = d;
  vUv = aCorner;
  gl_Position = projectionMatrix * mv;
}
`;

const veilFrag = /* glsl */ `
precision highp float;
${LIGHTING_GLSL}
in vec2 vUv;
in float vAlpha;
in vec3 vWorldPos;
in float vDepth;
layout(location = 0) out highp vec4 fragColor;
void main() {
  float r2 = dot(vUv, vUv);
  if (r2 > 1.0 || vAlpha < 0.002) discard;
  // A soft blob, thinner at the top: the gas pools low.
  float a = exp(-r2 * 2.6) * (1.0 - r2) * smoothstep(1.0, -0.2, vUv.y) * vAlpha;
  vec4 ls = lightSample(vWorldPos);
  vec3 lit = ambientFrom(ls) * 0.8 + lanternLight(vWorldPos, vWorldPos, normalize(uLanternPos - vWorldPos), 0.5, 1.2) * 0.35;
  vec3 col = vec3(0.62, 0.68, 0.2) * (lit + vec3(0.05, 0.06, 0.01));
  vec4 atm = atmosphere(vWorldPos, vDepth, ls.rgb);
  col = mix(col, atm.rgb, atm.a);
  a *= 1.0 - atm.a * 0.6;
  fragColor = vec4(sceneOut(col) * a, a);
}
`;

const breathVert = /* glsl */ `
in vec2 aCorner;
in vec3 aPuff;   // x lateral offset, y phase delay (s), z size scale
uniform vec3 uOrigin;
uniform vec3 uFwd;
uniform vec3 uSide;
uniform float uAge;
out vec2 vUv;
out float vAlpha;
out vec3 vWorldPos;
void main() {
  float age = max(0.0, uAge - aPuff.y);
  // Out of the mouth and up a little, widening as it thins. QA 01:50: a faint wisp low in the view
  // that the cave shows through (it was a lantern-lit white cloud over the middle third): smaller,
  // fainter, from lower down, and gone sooner.
  vec3 c = uOrigin + uFwd * (0.1 + age * 0.24) + uSide * aPuff.x * (1.0 + age) + vec3(0.0, age * 0.08, 0.0);
  float size = (0.05 + age * 0.11) * aPuff.z;
  vAlpha = smoothstep(0.0, 0.3, age) * (1.0 - smoothstep(0.4, 1.4, age)) * 0.07;
  vec4 mv = viewMatrix * vec4(c, 1.0);
  mv.xy += aCorner * size;
  vWorldPos = c;
  vUv = aCorner;
  gl_Position = projectionMatrix * mv;
}
`;

const breathFrag = /* glsl */ `
precision highp float;
${LIGHTING_GLSL}
in vec2 vUv;
in float vAlpha;
in vec3 vWorldPos;
layout(location = 0) out highp vec4 fragColor;
void main() {
  float r2 = dot(vUv, vUv);
  if (r2 > 1.0) discard;
  float a = exp(-r2 * 3.0) * (1.0 - r2) * vAlpha;
  vec4 ls = lightSample(vWorldPos);
  vec3 lit = ambientFrom(ls) + lanternLight(vWorldPos, vWorldPos, normalize(uLanternPos - vWorldPos), 0.5, 0.6) * 0.6;
  // The flame is a hand's breadth away: its light on the wisp is capped (no white cloud).
  vec3 col = vec3(0.85, 0.9, 0.95) * min(lit * 0.8 + vec3(0.04), vec3(0.3));
  fragColor = vec4(sceneOut(col) * a, a);
}
`;

/** How strongly a point sits in a zone (1 well inside, 0 beyond radius + edge). */
function zoneFactor(z: HazardZoneView, x: number, y: number, zz: number, edge: number): number {
  const c = z.centre;
  const d = Math.hypot(x - c[0], (y - c[1]) * 1.5, zz - c[2]);
  const r = z.radius;
  if (d <= r * 0.6) return 1;
  if (d >= r + edge) return 0;
  const t = (d - r * 0.6) / (r * 0.4 + edge);
  return 1 - t * t * (3 - 2 * t);
}

export class HazardFx {
  readonly group = new THREE.Group();
  /** The eased screen-edge levels (x frost, y gas, z heat, w dark). */
  readonly levels = new THREE.Vector4(0, 0, 0, 0);
  private zones: HazardZoneView[] = [];
  private readonly veils: THREE.Mesh<THREE.InstancedBufferGeometry, THREE.ShaderMaterial>;
  private readonly veilAttr: THREE.InstancedBufferAttribute;
  private readonly seedAttr: THREE.InstancedBufferAttribute;
  private readonly breath: THREE.Mesh<THREE.InstancedBufferGeometry, THREE.ShaderMaterial>;
  private breathT = 99;
  private nextBreath = 1.5;
  private readonly fwd = new THREE.Vector3();
  private readonly side = new THREE.Vector3();
  /** Veils drawn (the report). */
  veilCount = 0;

  constructor(lighting: LightingUniforms) {
    this.group.name = 'hazardFx';
    const quad = (n: number): THREE.InstancedBufferGeometry => {
      const g = new THREE.InstancedBufferGeometry();
      g.setAttribute('aCorner', new THREE.BufferAttribute(new Float32Array([-1, -1, 1, -1, 1, 1, -1, 1]), 2));
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(12), 3));
      g.setIndex([0, 1, 2, 0, 2, 3]);
      g.instanceCount = n;
      return g;
    };
    const vg = quad(0);
    this.veilAttr = new THREE.InstancedBufferAttribute(new Float32Array(VEILS_MAX * 4), 4);
    this.seedAttr = new THREE.InstancedBufferAttribute(new Float32Array(VEILS_MAX * 4), 4);
    vg.setAttribute('aVeil', this.veilAttr);
    vg.setAttribute('aSeed', this.seedAttr);
    const blend = { transparent: true, depthWrite: false, blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor } as const;
    this.veils = new THREE.Mesh(vg, new THREE.ShaderMaterial({ glslVersion: THREE.GLSL3, uniforms: { ...lighting }, vertexShader: veilVert, fragmentShader: veilFrag, ...blend }));
    this.veils.frustumCulled = false;
    this.veils.renderOrder = 8;
    this.veils.visible = false;
    const bg = quad(3);
    bg.setAttribute('aPuff', new THREE.InstancedBufferAttribute(new Float32Array([0, 0, 1, -0.06, 0.12, 0.8, 0.07, 0.22, 0.9]), 3));
    this.breath = new THREE.Mesh(
      bg,
      new THREE.ShaderMaterial({
        glslVersion: THREE.GLSL3,
        uniforms: { ...lighting, uOrigin: { value: new THREE.Vector3() }, uFwd: { value: new THREE.Vector3() }, uSide: { value: new THREE.Vector3() }, uAge: { value: 99 } },
        vertexShader: breathVert,
        fragmentShader: breathFrag,
        ...blend,
      }),
    );
    this.breath.frustumCulled = false;
    this.breath.renderOrder = 30;
    this.breath.visible = false;
    this.group.add(this.veils, this.breath);
  }

  /** The stratum's hazard zones (a new layout): the gas veils are laid out once. */
  setZones(zones: readonly HazardZoneView[]): void {
    this.zones = zones.filter((z) => z && Array.isArray(z.centre) && typeof z.radius === 'number');
    const v = this.veilAttr.array as Float32Array;
    const s = this.seedAttr.array as Float32Array;
    let n = 0;
    let k = 1;
    const rnd = () => {
      k = (k * 16807) % 2147483647;
      return k / 2147483647;
    };
    for (const z of this.zones) {
      if (z.kind !== 'gas') continue;
      const count = Math.max(5, Math.min(18, Math.round(z.radius * 1.4)));
      for (let i = 0; i < count && n < VEILS_MAX; i++, n++) {
        const a = rnd() * Math.PI * 2;
        const r = Math.sqrt(rnd()) * z.radius * 0.85;
        v.set([z.centre[0] + Math.cos(a) * r, z.centre[1] + 0.5 + rnd() * 1.6, z.centre[2] + Math.sin(a) * r, 1.6 + rnd() * 2.0], n * 4);
        s.set([rnd(), 0.3 + rnd() * 0.8, (0.08 + rnd() * 0.06) * Math.min(1, (z.strength ?? 1) + 0.2), 0], n * 4);
      }
    }
    this.veilCount = n;
    this.veils.geometry.instanceCount = n;
    this.veilAttr.needsUpdate = true;
    this.seedAttr.needsUpdate = true;
    this.veils.visible = n > 0;
  }

  /**
   * Each frame: the screen-edge levels (eased) from the biome mix, the zones round the eye and the
   * hazard meter; the breath in the cold.
   */
  update(dt: number, camera: THREE.Camera, weights: ReadonlyMap<string, number>, reading: HazardReading | null): void {
    const p = camera.position;
    let gasZ = 0;
    let heatZ = 0;
    for (const z of this.zones) {
      if (z.kind === 'gas') gasZ = Math.max(gasZ, zoneFactor(z, p.x, p.y, p.z, 2));
      else if (z.kind === 'lava') heatZ = Math.max(heatZ, zoneFactor(z, p.x, p.y, p.z, 7));
    }
    const lvl = reading?.level ?? 0;
    const kind = reading?.kind ?? null;
    const frost = Math.max(kind === 'cold' ? lvl : 0, (weights.get('frostCaverns') ?? 0) * 0.32);
    const gas = Math.max(kind === 'gas' ? lvl * 0.9 : 0, gasZ * 0.55);
    const heat = Math.max(kind === 'heat' ? lvl : 0, heatZ * 0.65);
    const dark = Math.max(kind === 'dark' ? lvl * 0.8 : 0, (weights.get('obsidianAbyss') ?? 0) * 0.18);
    const a = dt > 0 ? 1 - Math.exp(-dt / 0.9) : 1;
    const L = this.levels;
    L.set(L.x + (frost - L.x) * a, L.y + (gas - L.y) * a, L.z + (heat - L.z) * a, L.w + (dark - L.w) * a);
    // Breath: every ~3.4 s while it is cold enough to see it.
    const cold = Math.max(frost, (weights.get('frostCaverns') ?? 0) * 0.6);
    this.breathT += dt;
    if (cold > 0.25) {
      this.nextBreath -= dt;
      if (this.nextBreath <= 0) {
        this.nextBreath = 3.1 + Math.random() * 0.8;
        this.breathT = 0;
      }
    }
    const on = this.breathT < 2.2;
    this.breath.visible = on;
    if (on) {
      const u = this.breath.material.uniforms;
      camera.getWorldDirection(this.fwd);
      this.side.set(-this.fwd.z, 0, this.fwd.x).normalize();
      (u.uOrigin.value as THREE.Vector3).copy(p).addScaledVector(this.fwd, 0.34).add(new THREE.Vector3(0, -0.2, 0));
      (u.uFwd.value as THREE.Vector3).copy(this.fwd);
      (u.uSide.value as THREE.Vector3).copy(this.side);
      u.uAge.value = this.breathT;
    }
  }

  dispose(): void {
    this.veils.geometry.dispose();
    this.veils.material.dispose();
    this.breath.geometry.dispose();
    this.breath.material.dispose();
  }
}
