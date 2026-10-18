import * as THREE from 'three';
import { B } from '../../config/blocks';
import type { LightingUniforms } from '../../render/lighting';
import { LIGHTING_GLSL } from '../../render/lighting';
import type { VoxelWorld } from '../../world/VoxelWorld';

const vert = /* glsl */ `
in vec3 aColor;
in float aSize;
uniform float uPixelScale;
out vec3 vColor;
out float vDepth;
out float vNear;
void main() {
  vec4 mv = viewMatrix * modelMatrix * vec4(position, 1.0);
  vDepth = length(mv.xyz);
  gl_Position = projectionMatrix * mv;
  // Halos keep a minimum on-screen size so distant lamps still read as points of light.
  float px = aSize * uPixelScale / max(0.1, -mv.z);
  gl_PointSize = clamp(max(px, 6.0), 1.0, 96.0);
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
layout(location = 0) out highp vec4 fragColor;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float d = length(c) * 2.0;
  if (d > 1.0) discard;
  float core = exp(-d * d * 9.0);
  float glow = exp(-d * d * 2.5) * 0.35;
  float fog = fogFactor(vDepth);
  float flicker = 0.92 + 0.08 * sin(uTime * 9.0 + gl_FragCoord.x * 0.01);
  vec3 col = vColor * (core + glow) * (1.0 - fog * 0.55) * vNear * flicker;
  fragColor = vec4(col, 1.0);
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
  /** Emitter block id (amber, lamp, ember or abyss). */
  id: number;
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
 * cavern, at the cost of a single draw call.
 */
export class HaloSystem {
  readonly points: THREE.Points;
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
    this.points = new THREE.Points(HaloSystem.geometry(sources), this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = 10;
  }

  private static geometry(sources: HaloSource[]): THREE.BufferGeometry {
    const pos = new Float32Array(sources.length * 3);
    const col = new Float32Array(sources.length * 3);
    const size = new Float32Array(sources.length);
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
      } else if (s.id === B.LIGHT_LAMP) {
        rgb = [1.3, 0.72, 0.32];
        sz = 0.7;
      } else {
        rgb = [1.6, 0.92, 0.45];
        sz = 0.85;
      }
      pos.set([s.x + 0.5, s.y + lift, s.z + 0.5], i * 3);
      col.set(rgb, i * 3);
      size[i] = sz;
    });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
    geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
    return geo;
  }

  get count(): number {
    return this.points.geometry.getAttribute('position').count;
  }

  setPixelScale(heightPx: number, fovDeg: number): void {
    this.material.uniforms.uPixelScale.value = heightPx / (2 * Math.tan((fovDeg * Math.PI) / 360));
  }

  /** Replace the halo set (cheap: a few dozen points). */
  setSources(sources: HaloSource[]): void {
    this.points.geometry.dispose();
    this.points.geometry = HaloSystem.geometry(sources);
  }

  dispose(): void {
    this.points.geometry.dispose();
    this.material.dispose();
  }
}
