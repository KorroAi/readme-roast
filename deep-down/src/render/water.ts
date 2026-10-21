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

void main() {
  vec2 p = vWorldPos.xz;
  float e = 0.06;
  float h0 = ripple(p);
  vec3 n = normalize(vec3(-(ripple(p + vec2(e, 0.0)) - h0) / e * 0.035, 1.0, -(ripple(p + vec2(0.0, e)) - h0) / e * 0.035));
  vec3 v = normalize(cameraPosition - vWorldPos);
  float ndv = max(dot(n, v), 0.0);
  float fres = 0.02 + 0.98 * pow(1.0 - ndv, 5.0);
  vec3 sp = vWorldPos + vec3(0.0, 0.5, 0.0);
  vec4 ls = lightSample(sp);
  // Reflection: the cave above is dark (the zone's hued air); lamps near the water show in it as
  // warm glows, read from the light volume along the reflected ray only where it is strongly lit
  // (a mirror of the lights, not an even wash of their light).
  vec3 r = reflect(-v, n);
  vec3 l1 = lightSample(vWorldPos + r * 3.0 + vec3(0.0, 0.3, 0.0)).rgb;
  vec3 l2 = lightSample(vWorldPos + r * 7.0 + vec3(0.0, 0.3, 0.0)).rgb;
  // The light volume is irradiance (bright everywhere near a lamp), not the lamp itself: only the
  // hottest few metres around a light are mirrored, broken up by the ripples.
  float rip = 0.55 + 0.9 * wn(p * 4.0 + uTime * 0.15);
  vec3 lamps = (l1 * smoothstep(1.2, 3.5, luma3(l1)) + l2 * smoothstep(1.2, 3.5, luma3(l2)) * 0.6) * rip;
  // The far cave in the mirror is dark stone in the zone's air: its hue halved (a saturated band of
  // fog colour at grazing angles read as a flat blue strip behind the island).
  vec3 air = mix(uFogLow, uFogColor, 0.5);
  vec3 refl = mix(vec3(luma3(air)), air, 0.5) * 0.24 + lamps * 0.22;
  // The flame on the water: a tight glint on the ripples and a broad soft sheen.
  vec3 lantern = lanternLight(sp, vWorldPos, n, ls.a);
  vec3 spec = lanternSpec(n, v, 0.07, vec3(0.02)) * 1.6 + lanternSpec(n, v, 0.28, vec3(0.02)) * 0.45;
  // Body: clear over the shallows (the stone floor shows through, tinted), blue-black in the deep.
  float deep = smoothstep(0.2, 2.5, vDepthM);
  vec3 body = mix(vec3(0.006, 0.02, 0.024), vec3(0.0015, 0.004, 0.007), deep) * (0.6 + 0.4 * ls.a) + lantern * 0.015 * (1.0 - deep);
  float cover = mix(0.4, 0.97, deep);
  cover = mix(cover, 0.9, fres * 0.6);
  // A faint lighter line where the water meets the shore.
  float shore = 1.0 - smoothstep(0.0, 0.08, vDepthM);
  vec3 edge = vec3(0.05, 0.06, 0.06) * shore * (0.4 + 0.6 * wn(p * 9.0 + uTime * 0.2)) * (0.2 + luma3(lantern));
  // Premultiplied: the body covers the floor, the reflections and glints add on top.
  vec3 color = body * cover + refl * fres + spec + edge;
  float alpha = cover;
  vec4 atm = atmosphere(vWorldPos, vDepth, ls.rgb);
  color = mix(color, atm.rgb * alpha, atm.a);
  fragColor = vec4(sceneOut(color), clamp(alpha, 0.0, 1.0));
}
`;

export class WaterSurfaces {
  readonly group = new THREE.Group();
  private readonly material: THREE.ShaderMaterial;

  constructor(lighting: LightingUniforms, world: VoxelWorld, lakes: readonly LakeDef[]) {
    this.group.name = 'water';
    this.material = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      uniforms: { ...lighting },
      vertexShader: vert,
      fragmentShader: frag,
      transparent: true,
      depthWrite: false,
      side: THREE.FrontSide,
      blending: THREE.CustomBlending,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneMinusSrcAlphaFactor,
    });
    for (const lake of lakes) {
      const geo = lakeGeometry(world, lake);
      if (!geo) continue;
      const mesh = new THREE.Mesh(geo, this.material);
      mesh.name = `water:${lake.id}`;
      mesh.renderOrder = 4;
      mesh.matrixAutoUpdate = false;
      this.group.add(mesh);
    }
  }

  dispose(): void {
    for (const c of this.group.children) (c as THREE.Mesh).geometry.dispose();
    this.material.dispose();
  }
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
