import * as THREE from 'three';
import { B } from '../../config/blocks';
import type { LightingUniforms } from '../../render/lighting';
import { LIGHTING_GLSL } from '../../render/lighting';
import type { VoxelWorld } from '../../world/VoxelWorld';

const vert = /* glsl */ `
in vec3 aColor;
in float aSize;
in vec2 aCorner;
in float aFar;
uniform float uPixelScale;
out vec3 vColor;
out float vFar;
out float vDepth;
out float vNear;
out vec2 vUv;
out vec3 vWorldPos;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorldPos = wp.xyz;
  vec4 mv = viewMatrix * wp;
  vDepth = length(mv.xyz);
  float z = max(0.1, -mv.z);
  // Halos keep a minimum on-screen size so distant lamps still read as points of light.
  float px = clamp(max(aSize * uPixelScale / z, mix(6.0, 9.0, smoothstep(14.0, 30.0, z))), 1.0, aFar > 0.5 ? 180.0 : 96.0);
  // Round 2 (glitch hunt): a halo beside a wall was cut by it in a hard line. The quad is drawn
  // half its size nearer the eye (same size on screen), so the wall it hangs on no longer slices
  // it, while rock between the eye and the light still hides it.
  float pull = min(aSize * 0.5, z * 0.4);
  mv.xyz += normalize(-mv.xyz) * pull;
  float z2 = max(0.1, -mv.z);
  // Camera-facing quad rather than a point sprite: GPUs drop a whole point once its centre
  // leaves the screen, which made big halos pop at the edges.
  mv.xy += aCorner * (0.5 * px * z2 / uPixelScale);
  gl_Position = projectionMatrix * mv;
  vUv = aCorner;
  vColor = aColor;
  // Fade out when very close: up close the lamp itself and its light do the work. A far glow
  // (polish 2) only gathers from ~14 m out: the light of a balcony lamp seen from far below.
  vNear = aFar > 0.5 ? smoothstep(14.0, 26.0, vDepth) : smoothstep(3.5, 12.0, vDepth);
  vFar = aFar;
}
`;

const frag = /* glsl */ `
precision highp float;
${LIGHTING_GLSL}
in vec3 vColor;
in float vDepth;
in float vNear;
in vec2 vUv;
in vec3 vWorldPos;
in float vFar;
layout(location = 0) out highp vec4 fragColor;
void main() {
  float d = length(vUv);
  if (d > 1.0) discard;
  float core = vFar > 0.5 ? 0.0 : exp(-d * d * 9.0);
  float glow = vFar > 0.5 ? exp(-d * d * 3.5) * (1.0 - d * d) : exp(-d * d * 2.5) * 0.35;
  // Halos are the breadcrumbs across the dark: the haze dims them but never erases them.
  float fog = atmosphere(vWorldPos, vDepth, vec3(0.0)).a;
  // A gentle flicker per light (its phase from where it is), never a band sliding across the
  // halo (the old phase ran with the screen x: glitch hunt, round 2).
  float flicker = 0.95 + 0.05 * sin(uTime * 7.0 + dot(vWorldPos, vec3(1.7, 3.1, 2.3)));
  // Polish 2: far lights resist the haze a little more (a lamp across a vault still reads).
  vec3 col = vColor * (core + glow) * (1.0 - fog * mix(0.6, 0.35, vFar)) * vNear * flicker * uAtmos.w;
  fragColor = vec4(sceneOut(col), 1.0);
}
`;

/**
 * Soft additive halos on every placed light source (lamps, fires, crystal clusters, abyss
 * lights). They make the dark read as a space full of distant lights, the way the eye
 * sees lanterns across a cavern, at the cost of a single draw call.
 */
export interface HaloSource {
  x: number;
  y: number;
  z: number;
  /** Emitter block id (amber, lamp, ember, abyss, magma or glowroot). */
  id: number;
  /** Optional overrides of the id's look: linear HDR colour, world size (m), lift above the cell. */
  color?: readonly [number, number, number];
  size?: number;
  lift?: number;
}

/** Every halo-worthy emitter voxel in a world (used once at load for static lights). */
export function collectWorldLights(world: VoxelWorld): HaloSource[] {
  const out: HaloSource[] = [];
  const b = world.blocks;
  for (let i = 0; i < b.length; i++) {
    const id = b[i];
    if (id !== B.LIGHT_AMBER && id !== B.LIGHT_LAMP && id !== B.LIGHT_EMBER && id !== B.LIGHT_ABYSS) continue;
    out.push({ x: i % world.sx, y: Math.floor(i / world.sx) % world.sy, z: Math.floor(i / (world.sx * world.sy)), id });
  }
  return out;
}

/**
 * Soft additive halos on placed light sources (lamps, fires, abyss lights). They make the
 * dark read as a space full of distant lights, the way the eye sees lanterns across a
 * cavern, at the cost of a single draw call (camera-facing quads).
 */
export class HaloSystem {
  readonly mesh: THREE.Mesh;
  private readonly material: THREE.ShaderMaterial;

  /**
   * Polish 2: the world, for the far glows. A lamp or fire with open air above it also gets a wide,
   * faint glow ~1.3 m over it that gathers only from ~14 m out, so a light on a balcony far above
   * (the Lantern Vault's) still reads from the floor through the haze, over the slab's edge that
   * hides its flame. It sits in open air (never inside rock: nothing glows through walls).
   */
  private readonly world: (() => VoxelWorld) | null;

  constructor(lighting: LightingUniforms, sources: HaloSource[], world: (() => VoxelWorld) | null = null) {
    this.world = world;
    this.material = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      uniforms: { ...lighting, uPixelScale: { value: 600 } },
      vertexShader: vert,
      fragmentShader: frag,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.mesh = new THREE.Mesh(HaloSystem.geometry(sources, world?.() ?? null), this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 10;
  }

  private static geometry(sources: HaloSource[], world: VoxelWorld | null = null): THREE.BufferGeometry {
    const quads: Array<{ p: [number, number, number]; rgb: [number, number, number]; sz: number; far: number }> = [];
    sources.forEach((s) => {
      let rgb: [number, number, number];
      let sz: number;
      let lift = 0.55;
      if (s.id === B.LIGHT_ABYSS) {
        rgb = [0.55, 0.32, 1.4];
        sz = 1.6;
        lift = 0.5;
      } else if (s.id === B.LIGHT_EMBER) {
        rgb = [1.6, 0.75, 0.28];
        sz = 0.9;
        lift = 0.4;
      } else if (s.id === B.LIGHT_MAGMA) {
        // An ember fissure: deep red-orange heat breathing out of the slit.
        rgb = [1.5, 0.46, 0.14];
        sz = 1.25;
        lift = 0.5;
      } else if (s.id === B.LIGHT_GLOWROOT) {
        // The glowroot moss's own green-gold light: a faint, wide breath of colour in the air,
        // never an orb (the lights hang in open air above the moss).
        rgb = [0.07, 0.11, 0.035];
        sz = 2.6;
        lift = 0.5;
      } else if (s.id === B.LIGHT_LAMP) {
        // Amber-gold like the lamps' light (blocks.ts), not red-orange.
        rgb = [1.3, 0.8, 0.38];
        sz = 0.7;
      } else {
        rgb = [1.6, 1.0, 0.52];
        sz = 0.85;
      }
      if (s.color) rgb = [s.color[0], s.color[1], s.color[2]];
      if (s.size !== undefined) sz = s.size;
      if (s.lift !== undefined) lift = s.lift;
      quads.push({ p: [s.x + 0.5, s.y + lift, s.z + 0.5], rgb, sz, far: 0 });
      // The far glow: lamps and fires with two cells of open air over them.
      const warm = s.id === B.LIGHT_EMBER || s.id === B.LIGHT_LAMP || s.id === B.LIGHT_AMBER;
      if (warm && world && !s.color && world.get(s.x, s.y + 1, s.z) === B.AIR && world.get(s.x, s.y + 2, s.z) === B.AIR) {
        quads.push({ p: [s.x + 0.5, s.y + 1.3, s.z + 0.5], rgb: [rgb[0] * 0.16, rgb[1] * 0.14, rgb[2] * 0.12], sz: s.id === B.LIGHT_EMBER ? 3.2 : 2.4, far: 1 });
      }
    });
    const n = quads.length;
    const pos = new Float32Array(n * 12);
    const col = new Float32Array(n * 12);
    const size = new Float32Array(n * 4);
    const corner = new Float32Array(n * 8);
    const far = new Float32Array(n * 4);
    const index: number[] = [];
    const CORNERS = [-1, -1, 1, -1, 1, 1, -1, 1];
    quads.forEach((q, i) => {
      for (let k = 0; k < 4; k++) {
        const v = i * 4 + k;
        pos.set(q.p, v * 3);
        col.set(q.rgb, v * 3);
        size[v] = q.sz;
        far[v] = q.far;
        corner[v * 2] = CORNERS[k * 2];
        corner[v * 2 + 1] = CORNERS[k * 2 + 1];
      }
      const b = i * 4;
      index.push(b, b + 1, b + 2, b, b + 2, b + 3);
    });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('aFar', new THREE.BufferAttribute(far, 1));
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
    geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
    geo.setAttribute('aCorner', new THREE.BufferAttribute(corner, 2));
    geo.setIndex(index);
    return geo;
  }

  get count(): number {
    return this.mesh.geometry.getAttribute('position').count / 4;
  }

  setPixelScale(heightPx: number, fovDeg: number): void {
    this.material.uniforms.uPixelScale.value = heightPx / (2 * Math.tan((fovDeg * Math.PI) / 360));
  }

  /** Replace the halo set (cheap: a few dozen points). */
  setSources(sources: HaloSource[]): void {
    this.mesh.geometry.dispose();
    this.mesh.geometry = HaloSystem.geometry(sources, this.world?.() ?? null);
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.material.dispose();
  }
}
