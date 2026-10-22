import * as THREE from 'three';
import { SOLID } from '../../config/blocks';
import { LIGHTING_GLSL, type LightingUniforms } from '../../render/lighting';
import type { VoxelWorld } from '../../world/VoxelWorld';
import { BiomeMotes, type MoteStyle } from './BiomeMotes';

/**
 * Round 3 (VIS stretch): the deep's calm weather, in real places only (BRIEF §6).
 *
 * Now and then (every 70-140 s), while the explorer stands in a cavern of the right biome, a slow
 * event passes through it for about half a minute, fading in and out over five seconds:
 * - spore drift (the Mushroom Forest, the Glowroot Jungle): a wind of glowing spores crossing the hall;
 * - ice fog (the Frost Caverns): a low white fog rolling over the floor round the explorer;
 * - ember rain (the Magma Veins): embers sifting down from the roof.
 * One extra draw call while it runs; nothing when it does not. Leaving the cavern ends it.
 */

export type WeatherKind = 'sporeDrift' | 'iceFog' | 'emberRain';

/** The biomes with weather, and which. */
export const WEATHER_OF: Readonly<Record<string, WeatherKind>> = {
  mushroomForest: 'sporeDrift',
  glowrootJungle: 'sporeDrift',
  frostCaverns: 'iceFog',
  magmaVeins: 'emberRain',
};

/** The weather's mote styles (the fog is veils, below). */
const STYLES: Record<'sporeDrift' | 'emberRain', { style: MoteStyle; color: [number, number, number] }> = {
  sporeDrift: {
    style: { color: [0.32, 1.0, 0.86], color2: [1.0, 0.4, 0.9], share2: 0.45, size: 0.036, vel: [0.34, 0.06, 0.14], wobble: 0.5, wobbleRate: 0.05, twinkle: 0.4, twinkleRate: 0.2, glow: 0.95, density: 0.95, alpha: 0.9 },
    color: [0.32, 1.0, 0.86],
  },
  emberRain: {
    style: { color: [1.0, 0.5, 0.14], color2: [1.0, 0.78, 0.35], share2: 0.3, size: 0.024, vel: [0.05, -0.8, 0.03], wobble: 0.18, wobbleRate: 0.15, twinkle: 0.55, twinkleRate: 0.45, glow: 1.0, density: 0.7, alpha: 0.95 },
    color: [1.0, 0.5, 0.14],
  },
};

/** A cavern (WORLD's StratumLayout.caverns), read structurally. */
export interface CavernView {
  biome: string;
  centre: readonly number[];
  radius: readonly number[];
}

const FOG_VEILS = 30;

const fogVert = /* glsl */ `
in vec2 aCorner;
in vec4 aVeil;
in vec2 aSeed;
uniform float uTime;
uniform float uLevel;
out vec2 vUv;
out float vAlpha;
out vec3 vWorldPos;
out float vDepth;
void main() {
  float t = uTime * 0.05 + aSeed.x * 6.2832;
  vec3 c = aVeil.xyz + vec3(cos(t) * 1.4, 0.0, sin(t * 0.8) * 1.4);
  vec4 mv = viewMatrix * vec4(c, 1.0);
  float size = aVeil.w;
  float d = length(mv.xyz);
  vAlpha = uLevel * aSeed.y * smoothstep(size * 0.3, size * 1.2, d) * (1.0 - smoothstep(26.0, 34.0, d));
  mv.xy += aCorner * vec2(size * 1.6, size * 0.55);
  vWorldPos = c;
  vDepth = d;
  vUv = aCorner;
  gl_Position = projectionMatrix * mv;
}
`;

const fogFrag = /* glsl */ `
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
  float a = exp(-r2 * 2.4) * (1.0 - r2) * vAlpha;
  vec4 ls = lightSample(vWorldPos);
  vec3 lit = ambientFrom(ls) + lanternLight(vWorldPos, vWorldPos, normalize(uLanternPos - vWorldPos), 0.5, 1.0) * 0.5;
  vec3 col = vec3(0.8, 0.88, 0.96) * (lit * 0.9 + vec3(0.03, 0.035, 0.04));
  vec4 atm = atmosphere(vWorldPos, vDepth, ls.rgb);
  col = mix(col, atm.rgb, atm.a);
  fragColor = vec4(sceneOut(col) * a, a);
}
`;

export class WeatherFx {
  readonly group = new THREE.Group();
  private readonly motes: BiomeMotes;
  private readonly fog: THREE.Mesh<THREE.InstancedBufferGeometry, THREE.ShaderMaterial>;
  private readonly fogAttr: THREE.InstancedBufferAttribute;
  private caverns: CavernView[] = [];
  /** The weather now (null: calm), its cavern and its clock. */
  kind: WeatherKind | null = null;
  private cavern: CavernView | null = null;
  private t = 0;
  private readonly length = 32;
  private wait = 45;
  /** 0..1 now (the report, tests). */
  level = 0;

  constructor(lighting: LightingUniforms) {
    this.group.name = 'weather';
    this.motes = new BiomeMotes(lighting);
    this.motes.points.name = 'weatherMotes';
    const g = new THREE.InstancedBufferGeometry();
    g.setAttribute('aCorner', new THREE.BufferAttribute(new Float32Array([-1, -1, 1, -1, 1, 1, -1, 1]), 2));
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(12), 3));
    g.setIndex([0, 1, 2, 0, 2, 3]);
    this.fogAttr = new THREE.InstancedBufferAttribute(new Float32Array(FOG_VEILS * 4), 4);
    const seeds = new Float32Array(FOG_VEILS * 2);
    for (let i = 0; i < FOG_VEILS; i++) {
      seeds[i * 2] = (i * 0.618) % 1;
      seeds[i * 2 + 1] = 0.09 + ((i * 0.377) % 1) * 0.08;
    }
    g.setAttribute('aVeil', this.fogAttr);
    g.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds, 2));
    g.instanceCount = 0;
    this.fog = new THREE.Mesh(
      g,
      new THREE.ShaderMaterial({
        glslVersion: THREE.GLSL3,
        uniforms: { ...lighting, uLevel: { value: 0 } },
        vertexShader: fogVert,
        fragmentShader: fogFrag,
        transparent: true,
        depthWrite: false,
        blending: THREE.CustomBlending,
        blendSrc: THREE.OneFactor,
        blendDst: THREE.OneMinusSrcAlphaFactor,
      }),
    );
    this.fog.frustumCulled = false;
    this.fog.renderOrder = 8;
    this.fog.visible = false;
    this.group.add(this.motes.points, this.fog);
  }

  /** The stratum's caverns (a new layout): any weather stops. */
  setCaverns(caverns: readonly CavernView[]): void {
    this.caverns = caverns.filter((c) => c && Array.isArray(c.centre) && Array.isArray(c.radius) && WEATHER_OF[c.biome]);
    this.stop();
  }

  /** The cavern of a weather biome the explorer stands in, if any. */
  cavernAt(x: number, y: number, z: number): CavernView | null {
    for (const c of this.caverns) {
      const [cx, cy, cz] = c.centre;
      const [rx, ry, rz] = c.radius;
      const dx = (x - cx) / Math.max(1, rx);
      const dy = (y - cy) / Math.max(1, ry + 2);
      const dz = (z - cz) / Math.max(1, rz);
      if (dx * dx + dy * dy + dz * dz <= 1) return c;
    }
    return null;
  }

  /** Start the weather of the cavern round (x, y, z) now (the debug API, captures); false if none. */
  start(world: VoxelWorld, x: number, y: number, z: number): boolean {
    const c = this.cavernAt(x, y, z);
    if (!c) return false;
    this.kind = WEATHER_OF[c.biome];
    this.cavern = c;
    this.t = 0;
    if (this.kind === 'iceFog') this.layFog(world, x, y, z);
    return true;
  }

  stop(): void {
    this.kind = null;
    this.cavern = null;
    this.level = 0;
    this.fog.visible = false;
    this.motes.points.visible = false;
  }

  /** Veils of fog on the floor round the explorer (12 m), inside the cavern. */
  private layFog(world: VoxelWorld, x: number, y: number, z: number): void {
    const v = this.fogAttr.array as Float32Array;
    let n = 0;
    for (let i = 0; i < FOG_VEILS * 3 && n < FOG_VEILS; i++) {
      const a = i * 2.39996;
      const r = 2 + Math.sqrt((i % FOG_VEILS) / FOG_VEILS) * 11;
      const px = x + Math.cos(a) * r;
      const pz = z + Math.sin(a) * r;
      // The floor under the spot (within 5 m of the explorer's height).
      let fy = -1;
      for (let yy = Math.floor(y) + 3; yy > Math.floor(y) - 6; yy--) {
        if (SOLID[world.get(Math.floor(px), yy - 1, Math.floor(pz))] && !SOLID[world.get(Math.floor(px), yy, Math.floor(pz))]) {
          fy = yy;
          break;
        }
      }
      if (fy < 0) continue;
      v.set([px, fy + 0.35 + (i % 3) * 0.2, pz, 1.6 + (i % 5) * 0.35], n * 4);
      n++;
    }
    this.fog.geometry.instanceCount = n;
    this.fogAttr.needsUpdate = true;
  }

  update(dt: number, world: VoxelWorld, camera: THREE.Camera): void {
    const p = camera.position;
    if (!this.kind) {
      this.wait -= dt;
      if (this.wait <= 0) {
        this.wait = 70 + Math.random() * 70;
        this.start(world, p.x, p.y - 1.6, p.z);
      }
      return;
    }
    this.t += dt;
    // Leaving the cavern ends it (a little after: no flicker at the edge).
    const inside = this.cavern ? this.cavernAt(p.x, p.y - 1.6, p.z) === this.cavern : false;
    if (!inside && this.t < this.length - 5) this.t = this.length - 5;
    const s = (a: number, b: number, x: number) => {
      const k = Math.max(0, Math.min(1, (x - a) / (b - a)));
      return k * k * (3 - 2 * k);
    };
    this.level = s(0, 5, this.t) * (1 - s(this.length - 5, this.length, this.t));
    if (this.t >= this.length) {
      this.stop();
      return;
    }
    if (this.kind === 'iceFog') {
      this.fog.visible = true;
      this.fog.material.uniforms.uLevel.value = this.level;
      this.motes.points.visible = false;
    } else {
      const st = STYLES[this.kind];
      this.motes.updateFixed(st.style, st.color, this.level, p);
      this.fog.visible = false;
    }
  }

  dispose(): void {
    this.motes.dispose();
    this.fog.geometry.dispose();
    this.fog.material.dispose();
  }
}
