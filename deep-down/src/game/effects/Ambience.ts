import * as THREE from 'three';
import { B } from '../../config/blocks';
import { LIGHTING_GLSL, type LightingUniforms } from '../../render/lighting';
import { createEntityMaterial } from '../../render/entityMaterial';
import { VoxBuilder } from '../../render/voxModel';
import type { VoxelWorld } from '../../world/VoxelWorld';
import { HaloSystem, type HaloSource } from './Halos';

/**
 * Ambient wonder (no gameplay), within the calm-FX rules:
 * - drips: a bead gathers under the roof and falls to the floor every few seconds, a glint of the
 *   lantern and the light around it (one draw call, animated on the GPU, gone past 16 m);
 * - glow caps: small clumps of fungi against the walls, pale amber-gold caps that glow faintly,
 *   so the deep's dark always holds a warm point (one draw call), with a soft halo each;
 * - the deep zones' own glows: a halo of heat in every ember fissure (LIGHT_MAGMA), a faint wide
 *   glow round the glowroot lights, and the heat over the Ember Deep's hearth. One draw call.
 * Static except the drips' fall: nothing else moves.
 */
export interface AmbientAnchor {
  kind: 'drip' | 'fungus';
  p: readonly [number, number, number];
  drop?: number;
  n?: number;
}

type Landmarks = Readonly<Record<string, readonly number[] | undefined>>;

const dripVert = /* glsl */ `
in vec3 aAnchor;
in vec3 aFall; // x: drop (m), y: period (s), z: phase (0..1)
in vec2 aCorner;
uniform float uTime;
uniform float uPixelScale;
out vec2 vUv;
out vec3 vWorldPos;
out float vDepth;
out float vAlpha;
void main() {
  float drop = aFall.x;
  float period = aFall.y;
  float t = fract(uTime / period + aFall.z) * period;
  float fallT = sqrt(2.0 * max(drop - 0.1, 0.1) / 9.8);
  float form = period - fallT;
  float y;
  float stretch;
  float a;
  if (t < form) {
    // The bead gathers under the roof.
    y = 0.03;
    stretch = 1.0;
    a = smoothstep(0.0, form, t) * 0.7;
  } else {
    float ft = t - form;
    y = 0.03 + 4.9 * ft * ft;
    stretch = 1.0 + min(9.8 * ft * 0.25, 2.2);
    a = 1.0 - smoothstep(0.9, 1.0, ft / fallT);
  }
  vec3 p = aAnchor - vec3(0.0, y, 0.0);
  vWorldPos = p;
  vec4 mv = viewMatrix * vec4(p, 1.0);
  float z = max(0.1, -mv.z);
  vDepth = length(mv.xyz);
  // At least ~1.5 px wide, so a far drip is a thread of light, never a sparkle.
  float w = max(0.008, 1.2 * z / uPixelScale);
  vec3 upV = mat3(viewMatrix) * vec3(0.0, 1.0, 0.0);
  mv.xyz += vec3(aCorner.x * w, 0.0, 0.0) + upV * (aCorner.y * w * 1.3 * stretch);
  gl_Position = projectionMatrix * mv;
  vUv = aCorner;
  vAlpha = a * smoothstep(16.0, 10.0, vDepth) * smoothstep(0.6, 1.4, vDepth);
}
`;

const dripFrag = /* glsl */ `
precision highp float;
${LIGHTING_GLSL}
in vec2 vUv;
in vec3 vWorldPos;
in float vDepth;
in float vAlpha;
layout(location = 0) out highp vec4 fragColor;
void main() {
  float d = length(vUv);
  if (d > 1.0 || vAlpha < 0.003) discard;
  float body = exp(-d * d * 3.5);
  // Water carries the light around it and glints with the flame.
  vec4 ls = lightSample(vWorldPos);
  float lit = lanternVisibility(vWorldPos);
  float dl = length(uLanternPos - vWorldPos);
  vec3 glint = uLanternColor * (uLanternIntensity * lit * 1.6 / (1.0 + 0.35 * dl * dl));
  // Round 3: water is pale and cool; it takes only a little of the light round it (a drip under a
  // warm light pocket read as an orange spark), its glint the flame's.
  vec3 col = (ambientFrom(ls) * 0.35 + glint * 0.85 + vec3(0.026, 0.034, 0.042)) * body * vAlpha * 0.85;
  float fog = atmosphere(vWorldPos, vDepth, vec3(0.0)).a;
  col *= 1.0 - fog;
  fragColor = vec4(uSceneEncode > 0.5 ? col * 1.4 : col, 1.0);
}
`;

const hash = (n: number): number => {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
};

/** Warm glow caps of the first version's "glowing fungi", built from bevel-free low-poly domes. */
function buildCaps(b: VoxBuilder, anchors: readonly AmbientAnchor[]): number {
  let n = 0;
  for (const [i, a] of anchors.entries()) {
    if (a.kind !== 'fungus') continue;
    const count = Math.max(1, Math.min(7, a.n ?? 3));
    for (let k = 0; k < count; k++) {
      const h1 = hash(i * 13.1 + k * 3.7);
      const h2 = hash(i * 7.3 + k * 11.9);
      const h3 = hash(i * 2.9 + k * 5.3);
      const ang = h1 * Math.PI * 2;
      const rr = k === 0 ? 0 : 0.08 + 0.2 * h2;
      const x = a.p[0] + Math.cos(ang) * rr;
      const z = a.p[2] + Math.sin(ang) * rr;
      const s = (k === 0 ? 1.15 : 0.6 + 0.5 * h3) * 0.11;
      const stem = s * (1.2 + 1.3 * h2);
      b.push().translate(x, a.p[1], z).rotateY(h3 * 6.28);
      // Stem: a slim pale prism; cap: a low faceted dome whose underside glows.
      b.crystal(s * 0.22, stem, 0, 5, 0xcab89a, 0xb8a585, 0);
      b.push().translate(0, stem, 0);
      b.crystal(s * 0.95, s * 0.18, s * 0.42, 7, 0xd9a15a, 0xc98d48, 0.38);
      b.push().rotateX(Math.PI).translate(0, 0, 0);
      b.crystal(s * 0.9, 0.001, s * 0.12, 7, 0xffd27a, 0xf7c46a, 0.9);
      b.pop().pop().pop();
      n++;
    }
  }
  return n;
}

/** Every LIGHT_MAGMA and LIGHT_GLOWROOT emitter in the world (the deep zones' own light). */
export function deepGlowSources(world: VoxelWorld): HaloSource[] {
  const out: HaloSource[] = [];
  const b = world.blocks;
  for (let i = 0; i < b.length; i++) {
    const id = b[i];
    if (id !== B.LIGHT_MAGMA && id !== B.LIGHT_GLOWROOT) continue;
    out.push({ x: i % world.sx, y: Math.floor(i / world.sx) % world.sy, z: Math.floor(i / (world.sx * world.sy)), id });
  }
  return out;
}

/**
 * The focal glows of the monotone spaces (the polish round's note 3: one warm counterpoint and one
 * lit focal point each). Positions come from the world's landmarks; a missing landmark gives none.
 */
export function focalGlows(lm: Landmarks): HaloSource[] {
  const out: HaloSource[] = [];
  const add = (key: string, dy: number, color: [number, number, number], size: number) => {
    const p = lm[key];
    if (p) out.push({ x: p[0] - 0.5, y: p[1] - 0.5 + dy, z: p[2] - 0.5, id: B.LIGHT_EMBER, color, size, lift: 0.5 });
  };
  // The Ember Deep: the hearth's heat over its bed of lanternstone (the cavern's focal point; the
  // gate, the rift floor and the Glowroot take their warm counterpoint from CONTENT's lamps and the
  // lantern pool, which now owns its faces under cool light: lighting.ts ambientFrom).
  add('emberDeep', 1.0, [1.7, 0.6, 0.18], 2.4);
  return out;
}

export class Ambience {
  readonly group = new THREE.Group();
  private readonly dripMaterial: THREE.ShaderMaterial | null = null;
  private readonly halos: HaloSystem;
  readonly drips: number;
  readonly caps: number;

  /** `deepGlows` false: the deep zones' glows are drawn elsewhere (round 3: the strata's light pockets). */
  constructor(lighting: LightingUniforms, world: VoxelWorld, anchors: readonly AmbientAnchor[], landmarks: Landmarks, deepGlows = true) {
    this.group.name = 'ambience';
    // Drips.
    const drips = anchors.filter((a) => a.kind === 'drip' && (a.drop ?? 0) >= 1);
    this.drips = drips.length;
    if (drips.length) {
      const anchor = new Float32Array(drips.length * 12);
      const fall = new Float32Array(drips.length * 12);
      const corner = new Float32Array(drips.length * 8);
      const index: number[] = [];
      const C = [-1, -1, 1, -1, 1, 1, -1, 1];
      drips.forEach((d, i) => {
        const period = 3.2 + 4.5 * hash(i * 5.1 + d.p[0]);
        const phase = hash(i * 9.7 + d.p[2]);
        for (let k = 0; k < 4; k++) {
          const v = i * 4 + k;
          anchor.set([d.p[0], d.p[1], d.p[2]], v * 3);
          fall.set([d.drop ?? 3, period, phase], v * 3);
          corner.set([C[k * 2], C[k * 2 + 1]], v * 2);
        }
        index.push(i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3);
      });
      const g = new THREE.BufferGeometry();
      // position is required by three.js; the shader places the quads from aAnchor.
      g.setAttribute('position', new THREE.BufferAttribute(anchor, 3));
      g.setAttribute('aAnchor', new THREE.BufferAttribute(anchor, 3));
      g.setAttribute('aFall', new THREE.BufferAttribute(fall, 3));
      g.setAttribute('aCorner', new THREE.BufferAttribute(corner, 2));
      g.setIndex(index);
      const mat = new THREE.ShaderMaterial({
        glslVersion: THREE.GLSL3,
        uniforms: { ...lighting, uPixelScale: { value: 800 } },
        vertexShader: dripVert,
        fragmentShader: dripFrag,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      this.dripMaterial = mat;
      const mesh = new THREE.Mesh(g, mat);
      mesh.frustumCulled = false;
      mesh.renderOrder = 9;
      mesh.name = 'drips';
      mesh.onBeforeRender = (r, _s, cam) => {
        const fov = (cam as THREE.PerspectiveCamera).fov ?? 78;
        mat.uniforms.uPixelScale.value = r.getDrawingBufferSize(SIZE).y / (2 * Math.tan((fov * Math.PI) / 360));
      };
      this.group.add(mesh);
    }
    // Glow caps.
    const vb = new VoxBuilder();
    this.caps = buildCaps(vb, anchors);
    if (this.caps) {
      const mesh = new THREE.Mesh(vb.build(), createEntityMaterial(lighting, { emissiveScale: 1.6 }));
      mesh.name = 'glowCaps';
      this.group.add(mesh);
    }
    // Halos: the deep glows, the focal glows and a faint one over each clump of caps.
    const sources: HaloSource[] = [...(deepGlows ? deepGlowSources(world) : []), ...focalGlows(landmarks)];
    for (const a of anchors) if (a.kind === 'fungus') sources.push({ x: a.p[0] - 0.5, y: a.p[1] - 0.5, z: a.p[2] - 0.5, id: B.LIGHT_EMBER, color: [0.5, 0.32, 0.12], size: 0.45, lift: 0.62 });
    this.halos = new HaloSystem(lighting, sources);
    this.halos.mesh.name = 'ambientHalos';
    this.halos.mesh.onBeforeRender = (r, _s, cam) => {
      this.halos.setPixelScale(r.getDrawingBufferSize(SIZE).y, (cam as THREE.PerspectiveCamera).fov ?? 78);
    };
    this.group.add(this.halos.mesh);
  }

  get haloCount(): number {
    return this.halos.count;
  }

  dispose(): void {
    for (const o of this.group.children) {
      const m = o as THREE.Mesh;
      m.geometry?.dispose();
      (m.material as THREE.Material | undefined)?.dispose();
    }
    this.dripMaterial?.dispose();
  }
}

const SIZE = new THREE.Vector2();
