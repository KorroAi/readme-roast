import * as THREE from 'three';
import { LOOK_FOG_GLSL, lookShared } from '../../look';
import { VoxBuilder } from '../../voxModel';
import { SCENE_ENCODE as SCENE_ENCODE_REF } from '../../lighting';

/**
 * The set-piece kit (owner 2D): a baked-light material and geometry helpers for the hero models of the
 * Vistas (SPEC §6.7). A set piece is built once (2-8k triangles) from VoxBuilder boxes, prisms and tubes; its
 * light is baked into the vertex colours at build time (a soft sky-less hemisphere, a height AO and 4-8
 * coloured point lights), so it needs no light-volume fetch and looks right anywhere, in a cavern or behind
 * a Vista opening. Emissive parts glow through bloom; moving parts are separate meshes animated in
 * `onBeforeRender` from the shared look clock.
 */

export interface BakeLight {
  x: number;
  y: number;
  z: number;
  /** sRGB colour and intensity (1 = a lamp at 1 m). */
  color: number;
  intensity: number;
  radius: number;
}

const vertex = /* glsl */ `
in vec3 aLit;
in float aEmissive;
in vec3 color;
out vec3 vLit;
out vec3 vAlbedo;
out float vEmissive;
out float vDist;
vec3 srgbToLinear(vec3 c) { return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c)); }
void main() {
  vLit = aLit;
  vAlbedo = srgbToLinear(color);
  vEmissive = aEmissive;
  vec4 mv = viewMatrix * modelMatrix * vec4(position, 1.0);
  vDist = length(mv.xyz);
  gl_Position = projectionMatrix * mv;
}
`;

const fragment = /* glsl */ `
precision highp float;
${LOOK_FOG_GLSL}
uniform float uGlow;
uniform float uSceneEncode;
in vec3 vLit;
in vec3 vAlbedo;
in float vEmissive;
in float vDist;
layout(location = 0) out highp vec4 fragColor;
void main() {
  float pulse = 0.85 + 0.15 * sin(uLookTime * 1.7 + vDist * 0.3);
  vec3 c = vLit + vAlbedo * vEmissive * uGlow * pulse * 3.2;
  float f = lookFogAmount(vDist);
  c = mix(c, mix(uLookFogLow, uLookFog, 0.6), f * 0.85);
  fragColor = vec4(uSceneEncode > 0.5 ? sqrt(c / (1.0 + c)) : c, 1.0);
}
`;

let material: THREE.ShaderMaterial | null = null;

/** The one set-piece material (one program for every hero). */
export function setPieceMaterial(sceneEncode: THREE.IUniform<number>): THREE.ShaderMaterial {
  if (material) return material;
  material = new THREE.ShaderMaterial({
    glslVersion: THREE.GLSL3,
    uniforms: { ...lookShared(), uGlow: { value: 1 }, uSceneEncode: sceneEncode },
    vertexShader: vertex,
    fragmentShader: fragment,
    side: THREE.DoubleSide,
  });
  return material;
}

const srgbLin = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);

/**
 * Bake light into a VoxBuilder geometry: aLit = albedo x (hemisphere ambient x height AO + point lights).
 * `ambient` is the sRGB fill colour (the biome's open fill), `lights` the hero's light rig.
 */
export function bake(g: THREE.BufferGeometry, ambient: number, ambientK: number, lights: readonly BakeLight[], floorY = 0, topY = 10): THREE.BufferGeometry {
  const pos = g.getAttribute('position') as THREE.BufferAttribute;
  const nrm = g.getAttribute('normal') as THREE.BufferAttribute;
  const col = g.getAttribute('color') as THREE.BufferAttribute;
  const lit = new Float32Array(pos.count * 3);
  const amb = new THREE.Color(ambient);
  const lc = lights.map((l) => new THREE.Color(l.color));
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const nx = nrm.getX(i);
    const ny = nrm.getY(i);
    const nz = nrm.getZ(i);
    const ar = srgbLin(col.getX(i) / 255);
    const ag = srgbLin(col.getY(i) / 255);
    const ab = srgbLin(col.getZ(i) / 255);
    const hemi = 0.55 + 0.45 * ny;
    const ao = 0.45 + 0.55 * Math.min(1, Math.max(0, (y - floorY) / Math.max(1, topY - floorY)));
    let r = amb.r * ambientK * hemi * ao;
    let gg = amb.g * ambientK * hemi * ao;
    let b = amb.b * ambientK * hemi * ao;
    for (let k = 0; k < lights.length; k++) {
      const L = lights[k];
      const dx = L.x - x;
      const dy = L.y - y;
      const dz = L.z - z;
      const d = Math.hypot(dx, dy, dz) || 1;
      const ndl = Math.max(0, (nx * dx + ny * dy + nz * dz) / d) * 0.8 + 0.2;
      const t = Math.max(0, 1 - d / L.radius);
      const a = (L.intensity * ndl * t * t) / (1 + 0.15 * d * d);
      r += lc[k].r * a;
      gg += lc[k].g * a;
      b += lc[k].b * a;
    }
    lit[i * 3] = ar * r;
    lit[i * 3 + 1] = ag * gg;
    lit[i * 3 + 2] = ab * b;
  }
  g.setAttribute('aLit', new THREE.BufferAttribute(lit, 3));
  return g;
}

/** A tapered tube along a polyline (roots, ribs, tendrils): `sides`-gon rings, radius r0 -> r1. */
export function tube(b: VoxBuilder, pts: ReadonlyArray<[number, number, number]>, r0: number, r1: number, sides: number, color: number, emissive = 0): void {
  const rings: Array<Array<[number, number, number]>> = [];
  const up = new THREE.Vector3(0, 0, 1);
  const t = new THREE.Vector3();
  const u = new THREE.Vector3();
  const w = new THREE.Vector3();
  for (let i = 0; i < pts.length; i++) {
    const a = pts[Math.max(0, i - 1)];
    const c = pts[Math.min(pts.length - 1, i + 1)];
    t.set(c[0] - a[0], c[1] - a[1], c[2] - a[2]).normalize();
    u.copy(Math.abs(t.z) > 0.9 ? new THREE.Vector3(1, 0, 0) : up).cross(t).normalize();
    w.copy(t).cross(u).normalize();
    const r = r0 + (r1 - r0) * (i / Math.max(1, pts.length - 1));
    const ring: Array<[number, number, number]> = [];
    for (let s = 0; s < sides; s++) {
      const ang = (s / sides) * Math.PI * 2;
      const ca = Math.cos(ang) * r;
      const sa = Math.sin(ang) * r;
      ring.push([pts[i][0] + u.x * ca + w.x * sa, pts[i][1] + u.y * ca + w.y * sa, pts[i][2] + u.z * ca + w.z * sa]);
    }
    rings.push(ring);
  }
  const rgb = [(color >> 16) & 255, (color >> 8) & 255, color & 255];
  for (let i = 0; i + 1 < rings.length; i++)
    for (let s = 0; s < sides; s++) {
      const s2 = (s + 1) % sides;
      const v: Array<[number, number, number]> = [rings[i][s], rings[i][s2], rings[i + 1][s2], rings[i + 1][s]];
      const n = quadNormal(v);
      b.quad(v, n, rgb, emissive);
    }
}

function quadNormal(v: Array<[number, number, number]>): [number, number, number] {
  const ux = v[1][0] - v[0][0], uy = v[1][1] - v[0][1], uz = v[1][2] - v[0][2];
  const vx = v[3][0] - v[0][0], vy = v[3][1] - v[0][1], vz = v[3][2] - v[0][2];
  const nx = uy * vz - uz * vy;
  const ny = uz * vx - ux * vz;
  const nz = ux * vy - uy * vx;
  const l = Math.hypot(nx, ny, nz) || 1;
  // Rings run counter-clockwise around the tube's direction, so this points outward.
  return [nx / l, ny / l, nz / l];
}

/** A low dome / ellipsoid cap of `sides` x `stacks` (mushroom caps, the sun, stones). */
export function dome(b: VoxBuilder, cx: number, cy: number, cz: number, rx: number, ry: number, rz: number, sides: number, stacks: number, color: number, emissive = 0, from = 0, to = Math.PI / 2): void {
  const rgb = [(color >> 16) & 255, (color >> 8) & 255, color & 255];
  const p = (i: number, j: number): [number, number, number] => {
    const lat = from + ((to - from) * j) / stacks;
    const lon = (i / sides) * Math.PI * 2;
    return [cx + Math.cos(lat) * Math.cos(lon) * rx, cy + Math.sin(lat) * ry, cz + Math.cos(lat) * Math.sin(lon) * rz];
  };
  for (let j = 0; j < stacks; j++)
    for (let i = 0; i < sides; i++) {
      const v: Array<[number, number, number]> = [p(i, j), p(i + 1, j), p(i + 1, j + 1), p(i, j + 1)];
      const mid = [(v[0][0] + v[2][0]) / 2 - cx, (v[0][1] + v[2][1]) / 2 - cy, (v[0][2] + v[2][2]) / 2 - cz];
      const l = Math.hypot(mid[0] / rx, mid[1] / ry, mid[2] / rz) || 1;
      b.quad([v[0], v[3], v[2], v[1]], [mid[0] / rx / l, mid[1] / ry / l, mid[2] / rz / l], rgb, emissive);
    }
}

/** A tiny hidden mesh with the set-piece material, for shader warm-up at load (VistaBackdrop holds one). */
export function setPieceWarmup(): THREE.Mesh {
  const b = new VoxBuilder();
  b.cube(0, 0, 0, 0.1, 0.1, 0.1, 0x808080);
  const m = finish(b, SCENE_ENCODE_REF, 0x808080, 1, [], 0, 1);
  m.name = 'setPiece-warmup';
  m.frustumCulled = false;
  return m;
}

/** Finish a VoxBuilder into a baked mesh with the shared set-piece material. */
export function finish(b: VoxBuilder, sceneEncode: THREE.IUniform<number>, ambient: number, ambientK: number, lights: readonly BakeLight[], floorY: number, topY: number): THREE.Mesh {
  const g = bake(b.build(), ambient, ambientK, lights, floorY, topY);
  const m = new THREE.Mesh(g, setPieceMaterial(sceneEncode));
  m.name = 'setPiece';
  return m;
}
