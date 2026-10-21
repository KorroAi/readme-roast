import * as THREE from 'three';
import { B } from '../../config/blocks';
import type { LightingUniforms } from '../../render/lighting';
import { LIGHTING_GLSL } from '../../render/lighting';
import type { VoxelWorld } from '../../world/VoxelWorld';

const vert = /* glsl */ `
in vec3 aColor;
in float aSize;
in vec2 aCorner;
uniform float uPixelScale;
out vec3 vColor;
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
  float px = clamp(max(aSize * uPixelScale / z, 6.0), 1.0, 96.0);
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
  // Fade out when very close: up close the lamp itself and its light do the work.
  vNear = smoothstep(3.5, 12.0, vDepth);
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
layout(location = 0) out highp vec4 fragColor;
void main() {
  float d = length(vUv);
  if (d > 1.0) discard;
  float core = exp(-d * d * 9.0);
  float glow = exp(-d * d * 2.5) * 0.35;
  // Halos are the breadcrumbs across the dark: the haze dims them but never erases them.
  float fog = atmosphere(vWorldPos, vDepth, vec3(0.0)).a;
  // A gentle flicker per light (its phase from where it is), never a band sliding across the
  // halo (the old phase ran with the screen x: glitch hunt, round 2).
  float flicker = 0.95 + 0.05 * sin(uTime * 7.0 + dot(vWorldPos, vec3(1.7, 3.1, 2.3)));
  vec3 col = vColor * (core + glow) * (1.0 - fog * 0.6) * vNear * flicker * uAtmos.w;
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

  constructor(lighting: LightingUniforms, sources: HaloSource[]) {
    this.material = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      uniforms: { ...lighting, uPixelScale: { value: 600 } },
      vertexShader: vert,
      fragmentShader: frag,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.mesh = new THREE.Mesh(HaloSystem.geometry(sources), this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 10;
  }

  private static geometry(sources: HaloSource[]): THREE.BufferGeometry {
    const n = sources.length;
    const pos = new Float32Array(n * 12);
    const col = new Float32Array(n * 12);
    const size = new Float32Array(n * 4);
    const corner = new Float32Array(n * 8);
    const index: number[] = [];
    const CORNERS = [-1, -1, 1, -1, 1, 1, -1, 1];
    sources.forEach((s, i) => {
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
      for (let k = 0; k < 4; k++) {
        const v = i * 4 + k;
        pos.set([s.x + 0.5, s.y + lift, s.z + 0.5], v * 3);
        col.set(rgb, v * 3);
        size[v] = sz;
        corner[v * 2] = CORNERS[k * 2];
        corner[v * 2 + 1] = CORNERS[k * 2 + 1];
      }
      const b = i * 4;
      index.push(b, b + 1, b + 2, b, b + 2, b + 3);
    });
    const geo = new THREE.BufferGeometry();
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
    this.mesh.geometry = HaloSystem.geometry(sources);
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.material.dispose();
  }
}
