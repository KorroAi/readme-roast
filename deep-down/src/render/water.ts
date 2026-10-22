import * as THREE from 'three';
import { SOLID } from '../config/blocks';
import type { LakeDef } from '../world/gen/features/types';
import type { VoxelWorld } from '../world/VoxelWorld';
import { LIGHTING_GLSL, type LightingUniforms } from './lighting';

/**
 * Still water (round 2, VIS): the surfaces of WORLD's lakes (layout.features.lakes), one mesh per
 * lake over its wet columns, so the Still Lake reads as a dark mirror and the Deep as black water.
 *
 * - The shallows show their stone floor through clear water (alpha from the depth baked per
 *   vertex); deep water goes to a blue-black that hides its bottom.
 * - Reflections without a mirror pass: the flame's glint (GGX on a slowly rippling normal), the
 *   placed lights above the water read back from the light volume along the reflected ray (the
 *   warm lamps of the shore glow in the water), and a fresnel sheen of the zone's air.
 * - Calm: ripples move slowly (no wave motion), the water's edge gets a faint lighter line.
 * One draw call per lake; nothing writes depth, so the drawn floor stays the depth truth.
 */

const vert = /* glsl */ `
in float aDepth;
out vec3 vWorldPos;
out float vDepthM;
out float vDepth;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorldPos = wp.xyz;
  vDepthM = aDepth;
  vec4 mv = viewMatrix * wp;
  vDepth = length(mv.xyz);
  gl_Position = projectionMatrix * mv;
}
`;

const frag = /* glsl */ `
precision highp float;
${LIGHTING_GLSL}
// Round 3: the biome's water (render/biomeLook.ts WaterLook, eased by VisDirector).
uniform vec3 uWaterDeep;
uniform vec3 uWaterShallow;
uniform vec4 uWaterSky;   // rgb the cave mirrored in the water, a: 1 = use it (0: the zone's air, the old world)
uniform vec4 uWaterGlow;  // rgb bioluminescence, a amount (0 off): specks, and a wave behind the sonar's shell
uniform vec4 uSonar;      // shared with the terrain (render/sonar.ts): xyz origin, w the shell's radius
uniform vec4 uSonarFx;    // x band, y strength (0 off), z full radius
in vec3 vWorldPos;
in float vDepthM;
in float vDepth;
layout(location = 0) out highp vec4 fragColor;

float luma3(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
float wh(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float wn(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(wh(i), wh(i + vec2(1, 0)), u.x), mix(wh(i + vec2(0, 1)), wh(i + vec2(1, 1)), u.x), u.y);
}
// Height of the slow ripples (two drifting octaves and a fine shiver), metres-ish.
float ripple(vec2 p) {
  float t = uTime;
  return wn(p * 1.3 + vec2(t * 0.11, t * 0.07)) * 0.6 + wn(p * 3.1 - vec2(t * 0.17, -t * 0.13)) * 0.3 + wn(p * 7.0 + t * 0.3) * 0.1;
}
// Drip rings: a third of the 2.5 m cells catches a drip every 5-9 s; its ring widens at 0.5 m/s and
// fades in about 2 s. Returns the slope push (xz) and the ring's brightness (z).
vec3 dripRings(vec2 p) {
  vec2 c0 = floor(p / 2.5);
  vec3 acc = vec3(0.0);
  for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
    vec2 c = c0 + vec2(float(i), float(j));
    float h = wh(c * 0.731 + 0.17);
    if (h > 0.34) continue;
    float period = 5.0 + 4.0 * wh(c + 3.1);
    float t = fract(uTime / period + wh(c + 7.7)) * period;
    vec2 at = (c + vec2(0.2 + 0.6 * wh(c + 1.3), 0.2 + 0.6 * wh(c + 5.9))) * 2.5;
    vec2 d = p - at;
    float r = length(d);
    float front = (r - t * 0.5) / 0.035;
    float k = exp(-front * front) * exp(-t * 1.1);
    acc.xy += (r > 1e-3 ? d / r : vec2(0.0)) * k;
    acc.z += k;
  }
  return acc;
}

void main() {
  vec2 p = vWorldPos.xz;
  float e = 0.06;
  float h0 = ripple(p);
  vec3 drip = dripRings(p);
  vec3 n = normalize(vec3(-(ripple(p + vec2(e, 0.0)) - h0) / e * 0.035 + drip.x * 0.12, 1.0, -(ripple(p + vec2(0.0, e)) - h0) / e * 0.035 + drip.y * 0.12));
  vec3 v = normalize(cameraPosition - vWorldPos);
  float ndv = max(dot(n, v), 0.0);
  float fres = 0.02 + 0.98 * pow(1.0 - ndv, 5.0);
  vec3 sp = vWorldPos + vec3(0.0, 0.5, 0.0);
  vec4 ls = lightSample(sp);
  // Reflection: the cave above is dark (the biome's mirrored stone: uWaterSky, or the zone's hued air
  // in the old world); lights near the water show in it as warm glows, read from the light volume
  // along the reflected ray only where it is brighter than the light on the water itself (a mirror
  // of the lights, not an even wash: an evenly lit cavern no longer turns the water into a sheet).
  vec3 r = reflect(-v, n);
  vec3 l1 = lightSample(vWorldPos + r * 3.0 + vec3(0.0, 0.3, 0.0)).rgb;
  vec3 l2 = lightSample(vWorldPos + r * 7.0 + vec3(0.0, 0.3, 0.0)).rgb;
  float rip = 0.55 + 0.9 * wn(p * 4.0 + uTime * 0.15);
  vec3 hot = max(l1 - ls.rgb * 0.85, 0.0) + max(l2 - ls.rgb * 0.85, 0.0) * 0.6;
  vec3 lamps = hot / (1.0 + luma3(hot)) * rip;
  vec3 air = mix(uFogLow, uFogColor, 0.5);
  vec3 sky;
  if (uWaterSky.a > 0.5) {
    // Round 3: a dim mirror of the cave, marched through the light volume along the reflected ray:
    // the first rock it meets (openness gone) gives the lit stone there (its light and the cool
    // fill on dark rock), open air further on the biome's mirrored dark. Walls stand dark in the
    // water, lit corners and light pockets show as soft glows.
    vec3 rock = uWaterSky.rgb;
    float t = 0.8;
    for (int i = 0; i < 5; i++) {
      vec4 lr = lightSample(vWorldPos + r * t + vec3(0.0, 0.2, 0.0));
      vec3 lit = (uAmbient + uOpenAmbient * lr.a * lr.a + lr.rgb) * 0.075;
      if (lr.a < 0.18) {
        rock = mix(rock, lit, 0.85);
        break;
      }
      rock = mix(rock, lit * 0.6 + uWaterSky.rgb * 0.4, 0.3);
      t *= 1.9;
    }
    sky = rock;
  } else sky = mix(vec3(luma3(air)), air, 0.5) * 0.24;
  vec3 refl = sky + lamps * 0.32;
  // The flame on the water: a tight glint on the ripples and a broad soft sheen.
  vec3 lantern = lanternLight(sp, vWorldPos, n, ls.a);
  vec3 spec = lanternSpec(n, v, 0.07, vec3(0.02)) * 1.4 + lanternSpec(n, v, 0.28, vec3(0.02)) * 0.35;
  // Body: clear over the shallows (the stone floor shows through, tinted), dark in the deep.
  float deep = smoothstep(0.2, 2.5, vDepthM);
  vec3 body = mix(uWaterShallow, uWaterDeep, deep) * (0.6 + 0.4 * ls.a) + lantern * uWaterShallow * 0.45 * (1.0 - deep);
  // Round 3: the shallows cover a little more (a pool must read as water, not a damp floor).
  float cover = mix(0.56, 0.97, deep);
  cover = mix(cover, 0.94, fres * 0.6);
  // A faint lighter line where the water meets the shore, tinted by the shallows.
  float shore = 1.0 - smoothstep(0.0, 0.1, vDepthM);
  vec3 edge = (uWaterShallow * 1.6 + 0.006) * shore * (0.35 + 0.65 * wn(p * 9.0 + uTime * 0.2)) * (0.3 + min(luma3(lantern), 0.8));
  // Drip rings catch the light around them.
  vec3 rings = (sky * 0.8 + lantern * 0.025 + ls.rgb * 0.012) * min(drip.z, 1.0) * 0.45;
  // Bioluminescence: sparse drifting specks, and a bright wave that follows the sonar's shell over
  // the water and lingers behind it (the Flooded Grottoes' wow; any biome may set uWaterGlow).
  vec3 glow = vec3(0.0);
  if (uWaterGlow.a > 0.001) {
    float speck = smoothstep(0.82, 0.97, wn(p * 2.2 + vec2(uTime * 0.03, -uTime * 0.02))) * (0.5 + 0.5 * sin(uTime * 0.9 + wh(floor(p * 2.2)) * 6.28));
    float wave = 0.0;
    if (uSonarFx.y > 0.001) {
      float sd = distance(vWorldPos, uSonar.xyz);
      float ahead = (sd - uSonar.w) / 2.2;
      float reach = 1.0 - smoothstep(0.7, 1.0, sd / max(uSonarFx.z, 1.0));
      // The front: a bright band, broken by the plankton's own patchiness. Behind it: specks that
      // keep glowing a while (the afterglow), never a lit sheet.
      float patchy = 0.45 + 0.9 * wn(p * 1.6 - uTime * 0.2);
      float specks = smoothstep(0.5, 0.88, wn(p * 3.4 + vec2(uTime * 0.06, -uTime * 0.04))) * (0.6 + 0.4 * wn(p * 9.0));
      float front = exp(-ahead * ahead) * 1.3 * reach * patchy;
      float trail = step(sd, uSonar.w) * exp(-(uSonar.w - sd) * 0.1) * uSonarFx.w * specks * 1.1;
      wave = (front + trail) * uSonarFx.y * step(sd, uSonarFx.z * 1.1);
    }
    glow = uWaterGlow.rgb * uWaterGlow.a * (speck * 0.22 + wave * 1.4 + drip.z * 0.12);
  }
  // Premultiplied: the body covers the floor, the reflections and glints add on top.
  vec3 color = body * cover + refl * fres + spec + edge + rings + glow;
  float alpha = cover;
  vec4 atm = atmosphere(vWorldPos, vDepth, ls.rgb);
  color = mix(color, atm.rgb * alpha, atm.a);
  fragColor = vec4(sceneOut(color), clamp(alpha, 0.0, 1.0));
}
`;

/** A biome's water (linear colours; render/biomeLook.ts WaterLook). */
export interface WaterTint {
  deep: [number, number, number];
  shallow: [number, number, number];
  /** The cave mirrored in the water; null = the zone's air (the old world). */
  sky: [number, number, number] | null;
  /** Bioluminescence colour and amount (0 off). */
  glow: [number, number, number];
  glowAmount: number;
}

/** The round 2 water (the old world, and a biome that sets none). */
export const DEFAULT_WATER: WaterTint = { deep: [0.0015, 0.004, 0.007], shallow: [0.006, 0.02, 0.024], sky: null, glow: [0, 0, 0], glowAmount: 0 };

export class WaterSurfaces {
  readonly group = new THREE.Group();
  private readonly material: THREE.ShaderMaterial;
  private mesh: THREE.Mesh | null = null;

  /** The biome tint uniforms (setTint) and the sonar's (shared with the terrain: setSonar). */
  readonly uniforms = {
    uWaterDeep: { value: new THREE.Vector3(...DEFAULT_WATER.deep) },
    uWaterShallow: { value: new THREE.Vector3(...DEFAULT_WATER.shallow) },
    uWaterSky: { value: new THREE.Vector4(0, 0, 0, 0) },
    uWaterGlow: { value: new THREE.Vector4(0, 0, 0, 0) },
    uSonar: { value: new THREE.Vector4(0, -9999, 0, 0) },
    uSonarFx: { value: new THREE.Vector4(1.2, 0, 24, 0) },
  };

  constructor(lighting: LightingUniforms, world: VoxelWorld, lakes: readonly LakeDef[]) {
    this.group.name = 'water';
    this.material = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      uniforms: { ...lighting, ...this.uniforms },
      vertexShader: vert,
      fragmentShader: frag,
      transparent: true,
      depthWrite: false,
      side: THREE.FrontSide,
      blending: THREE.CustomBlending,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneMinusSrcAlphaFactor,
    });
    this.set(world, lakes);
  }

  /** The biome's water (VisDirector eases it with the biome mix). */
  setTint(t: WaterTint): void {
    const u = this.material.uniforms;
    (u.uWaterDeep.value as THREE.Vector3).set(...t.deep);
    (u.uWaterShallow.value as THREE.Vector3).set(...t.shallow);
    if (t.sky) (u.uWaterSky.value as THREE.Vector4).set(t.sky[0], t.sky[1], t.sky[2], 1);
    else (u.uWaterSky.value as THREE.Vector4).set(0, 0, 0, 0);
    (u.uWaterGlow.value as THREE.Vector4).set(t.glow[0], t.glow[1], t.glow[2], t.glowAmount);
  }

  /** Share the terrain's sonar uniforms (the bioluminescent wave follows the same shell). */
  setSonar(sonar: THREE.IUniform<THREE.Vector4>, fx: THREE.IUniform<THREE.Vector4>): void {
    this.material.uniforms.uSonar = sonar;
    this.material.uniforms.uSonarFx = fx;
  }

  /** How many wet quads are drawn (tests, the debug report). */
  get quads(): number {
    return this.mesh ? (this.mesh.geometry.index?.count ?? 0) / 6 : 0;
  }

  /**
   * Replace the lakes (round 3: a stratum switch swaps the world in place). Every lake goes into one
   * merged mesh: one draw call for all the water of a stratum.
   */
  set(world: VoxelWorld, lakes: readonly LakeDef[]): void {
    if (this.mesh) {
      this.group.remove(this.mesh);
      this.mesh.geometry.dispose();
      this.mesh = null;
    }
    const parts: THREE.BufferGeometry[] = [];
    for (const lake of lakes) {
      const g = lakeGeometry(world, lake);
      if (g) parts.push(g);
    }
    if (!parts.length) return;
    const geo = parts.length === 1 ? parts[0] : mergeLakes(parts);
    const mesh = new THREE.Mesh(geo, this.material);
    mesh.name = 'water:lakes';
    mesh.renderOrder = 4;
    mesh.matrixAutoUpdate = false;
    this.mesh = mesh;
    this.group.add(mesh);
  }

  dispose(): void {
    this.mesh?.geometry.dispose();
    this.mesh = null;
    this.material.dispose();
  }
}

/** Merge lake geometries (position, aDepth, index) into one. */
function mergeLakes(parts: readonly THREE.BufferGeometry[]): THREE.BufferGeometry {
  let verts = 0;
  let idx = 0;
  for (const g of parts) {
    verts += g.getAttribute('position').count;
    idx += g.index!.count;
  }
  const pos = new Float32Array(verts * 3);
  const dep = new Float32Array(verts);
  const ind = new Uint32Array(idx);
  let v = 0;
  let k = 0;
  for (const g of parts) {
    const p = g.getAttribute('position').array as Float32Array;
    const d = g.getAttribute('aDepth').array as Float32Array;
    pos.set(p, v * 3);
    dep.set(d, v);
    const src = g.index!.array;
    for (let i = 0; i < src.length; i++) ind[k + i] = src[i] + v;
    v += d.length;
    k += src.length;
    g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('aDepth', new THREE.BufferAttribute(dep, 1));
  out.setIndex(new THREE.BufferAttribute(ind, 1));
  out.computeBoundingSphere();
  out.computeBoundingBox();
  return out;
}

/**
 * One quad per wet column at the lake's level, corners shared, with the water depth at each corner
 * (to the first solid voxel below, averaged over the corner's columns; 0 at the shore).
 */
export function lakeGeometry(world: VoxelWorld, lake: LakeDef): THREE.BufferGeometry | null {
  const [x0, z0] = lake.min;
  const [x1, z1] = lake.max;
  const w = x1 - x0 + 1;
  const wet = (x: number, z: number) => x >= x0 && x <= x1 && z >= z0 && z <= z1 && lake.mask[(z - z0) * w + (x - x0)] === 1;
  const depthAt = (x: number, z: number): number => {
    if (!wet(x, z)) return 0;
    const top = Math.floor(lake.level);
    for (let y = top; y > top - 24; y--) if (SOLID[world.get(x, y, z)]) return Math.max(0, lake.level - (y + 1));
    return 24;
  };
  const cols = new Float32Array(w * (z1 - z0 + 1));
  for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) cols[(z - z0) * w + (x - x0)] = depthAt(x, z);
  const pos: number[] = [];
  const dep: number[] = [];
  const idx: number[] = [];
  const corner = new Map<number, number>();
  const cw = w + 1;
  const vtx = (cx: number, cz: number): number => {
    const key = (cz - z0) * cw + (cx - x0);
    let i = corner.get(key);
    if (i !== undefined) return i;
    // Depth at a corner: the mean over its four columns, 0 if any of them is shore (dry).
    let sum = 0;
    let dry = false;
    for (const [dx, dz] of [[-1, -1], [0, -1], [-1, 0], [0, 0]]) {
      const x = cx + dx;
      const z = cz + dz;
      if (!wet(x, z)) dry = true;
      else sum += cols[(z - z0) * w + (x - x0)];
    }
    i = pos.length / 3;
    pos.push(cx, lake.level, cz);
    dep.push(dry ? 0 : sum / 4);
    corner.set(key, i);
    return i;
  };
  for (let z = z0; z <= z1; z++)
    for (let x = x0; x <= x1; x++) {
      if (!wet(x, z)) continue;
      // The column's water must be open to the air (not capped by rock at the level).
      if (SOLID[world.get(x, Math.floor(lake.level), z)]) continue;
      const a = vtx(x, z);
      const b = vtx(x + 1, z);
      const c = vtx(x + 1, z + 1);
      const d = vtx(x, z + 1);
      // Counter-clockwise seen from above (+y): a, d, c and a, c, b.
      idx.push(a, d, c, a, c, b);
    }
  if (!idx.length) return null;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
  g.setAttribute('aDepth', new THREE.BufferAttribute(new Float32Array(dep), 1));
  g.setIndex(idx);
  g.computeBoundingSphere();
  g.computeBoundingBox();
  return g;
}
