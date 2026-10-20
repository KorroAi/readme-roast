import * as THREE from 'three';
import { LIGHTING_GLSL, type LightingUniforms } from '../lighting';
import { MAT_DENSITY, MAT_SIZE } from '../materials/paint';
import { SECTION_SHADE_GLSL, sectionUniforms } from '../look';

/**
 * The shard material (SPEC §11.4; CRITIQUE B MUST 9): shards are evaluated statelessly in the vertex shader (the
 * same closed-form ballistics as GpuParticles, with two analytic bounces on the floor ledge, restitution 0.25),
 * and shaded from the material layer of the cell they came from, sampled at the fragment's spawn-time world
 * position through 2D's section look (render/look.ts `sectionShade`, the same chunk the terrain's section path
 * uses), so at F0 a shard looks like the patch of face it replaces; blocks without a section row fall back to
 * their material layer (the face projection uv = (x, -y)). They
 * decay a heat glow over 300 ms and dissolve over their last 250 ms with an ember rim (the only discard in play).
 *
 * Per vertex: position (relative to the shard's centroid), normal, aShard (centroid in cube coordinates, block
 * index), aSpin (spin axis, spin rate). Per block (a broken cell; uniforms, so a break writes no buffer):
 * uBlockA = (centre x, y, z, birth on the FX clock), uBlockB = (block id, floor y of the landing ledge,
 * tap direction x, heat), uBlockC = (speed scale, life, crumble 0/1, material layer for the fallback).
 */
export const SHARD_BLOCKS = 32;

export interface ShardUniforms {
  [name: string]: THREE.IUniform;
  uFxTime: THREE.IUniform<number>;
  uBlockA: THREE.IUniform<THREE.Vector4[]>;
  uBlockB: THREE.IUniform<THREE.Vector4[]>;
  uBlockC: THREE.IUniform<THREE.Vector4[]>;
  uMat: THREE.IUniform<THREE.Texture | null>;
  uSectionKey: THREE.IUniform<THREE.Color>;
  uCamFill: THREE.IUniform<THREE.Color>;
}

const vert = /* glsl */ `
in vec4 aShard;
in vec4 aSpin;
uniform float uFxTime;
uniform vec4 uBlockA[${SHARD_BLOCKS}];
uniform vec4 uBlockB[${SHARD_BLOCKS}];
uniform vec4 uBlockC[${SHARD_BLOCKS}];
out vec3 vWorldPos;
out vec3 vOrig;
out vec3 vNormal;
out vec3 vLocal;
out float vDepth;
out float vDissolve;
out float vHeat;
flat out float vLayer;
flat out float vBlock;
float hash11(float p) { p = fract(p * 0.1031); p *= p + 33.33; p *= p + p; return fract(p); }
vec3 rotateAxis(vec3 v, vec3 a, float ang) {
  float c = cos(ang), s = sin(ang);
  return v * c + cross(a, v) * s + a * dot(a, v) * (1.0 - c);
}
void main() {
  int b = int(aShard.w + 0.5);
  vec4 A = uBlockA[b];
  vec4 B = uBlockB[b];
  vec4 C = uBlockC[b];
  float age = uFxTime - A.w;
  float life = C.y;
  vBlock = B.x;
  vLayer = C.w;
  vec3 cen = aShard.xyz;
  // Spawn-time world position of this vertex: the shard fills its part of the cell's front metre.
  vOrig = A.xyz + cen + position;
  vLocal = position + cen;
  if (age < 0.0 || age >= life) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    vWorldPos = vOrig; vNormal = normal; vDepth = 0.0; vDissolve = 1.0; vHeat = 0.0;
    return;
  }
  float h = hash11(aShard.x * 37.1 + aShard.y * 91.7 + aShard.z * 13.3 + float(b) * 7.7);
  // Out of the cell, mostly up and toward the camera, pushed away from the tap side; 2.5-4.5 m/s.
  vec3 dir = normalize(vec3(cen.x * 2.2 + B.z * 0.35, 0.75 + cen.y * 1.4, 0.55 + cen.z * 0.6));
  float speed = mix(2.5, 4.5, h) * C.x;
  vec3 v0 = dir * speed;
  if (C.z > 0.5) v0 = vec3(cen.x * 0.8, 0.4, 0.25) * speed * 0.4; // a crumble sinks rather than flies
  const float G = 11.0;
  float y0 = A.y + cen.y;
  float yf = B.y + 0.12 * (0.5 + h);
  // Analytic bounces on the ledge: first landing t1, a 0.25 restitution hop to t2, then rest.
  float disc = v0.y * v0.y + 2.0 * G * max(0.0, y0 - yf);
  float t1 = (v0.y + sqrt(disc)) / G;
  float vy1 = 0.25 * (G * t1 - v0.y);
  float t2 = t1 + 2.0 * vy1 / G;
  vec3 p;
  float tx = min(age, t1) + 0.35 * max(0.0, min(age, t2) - t1);
  p.x = A.x + cen.x + v0.x * tx;
  p.z = A.z + cen.z + v0.z * tx;
  bool ledge = p.z < 60.3 && B.y > -1e3;
  if (!ledge || age < t1) p.y = y0 + v0.y * age - 0.5 * G * age * age;
  else if (age < t2) { float u = age - t1; p.y = yf + vy1 * u - 0.5 * G * u * u; }
  else p.y = yf;
  // Spin 4-9 rad/s, slowing once landed.
  float spinT = ledge ? min(age, t1) + 0.3 * max(0.0, min(age, t2) - t1) : age;
  float ang = aSpin.w * spinT;
  vec3 local = rotateAxis(position, normalize(aSpin.xyz), ang);
  vNormal = rotateAxis(normal, normalize(aSpin.xyz), ang);
  // Shrink a touch while dissolving.
  float dissolve = smoothstep(life - 0.25, life, age);
  vDissolve = dissolve;
  vHeat = B.w * exp(-age / 0.3);
  vec3 wp = p + local * (1.0 - 0.25 * dissolve);
  vWorldPos = wp;
  vec4 mv = viewMatrix * vec4(wp, 1.0);
  vDepth = length(mv.xyz);
  gl_Position = projectionMatrix * mv;
}
`;

const frag = /* glsl */ `
precision highp float;
precision highp sampler2DArray;
${LIGHTING_GLSL}
${SECTION_SHADE_GLSL}
uniform sampler2DArray uMat;
uniform vec3 uSectionKey;
uniform vec3 uCamFill;
in vec3 vWorldPos;
in vec3 vOrig;
in vec3 vNormal;
in vec3 vLocal;
in float vDepth;
in float vDissolve;
in float vHeat;
flat in float vLayer;
flat in float vBlock;
layout(location = 0) out highp vec4 fragColor;
const float MAT_PERIOD = ${MAT_SIZE / MAT_DENSITY}.0;
vec3 srgbToLinear(vec3 c) { return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c)); }
float hash13s(vec3 p) { p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
void main() {
  // Dissolve with an ember rim (the only discard in play, the last 250 ms).
  float n = hash13s(floor(vLocal * 9.0));
  if (vDissolve > 0.0 && n < vDissolve) discard;
  float rim = vDissolve > 0.0 ? 1.0 - smoothstep(0.0, 0.18, n - vDissolve) : 0.0;
  vec3 nrm = normalize(vNormal);
  vec4 ls = lightSample(vWorldPos);
  vec3 lantern = lanternLight(vWorldPos, vWorldPos, nrm, 0.6);
  // The section's light: the key, the light volume, the camera fill on faces turned to the camera, the lantern.
  vec3 diffuse = ambientFrom(ls, nrm) + uSectionKey + uCamFill * max(nrm.z, 0.0) + lantern;
  // Inner faces (the fracture surfaces) read a little darker than the cut face.
  float inner = 1.0 - step(0.98, abs(nrm.z)) * step(59.98, vOrig.z);
  vec3 col = sectionShade(vOrig.xy, vBlock, diffuse, lantern, vWorldPos);
  if (dot(col, col) <= 0.0) {
    // No section row (a structure or legacy block): its material layer at the face projection.
    vec2 uv = vec2(vOrig.x, -vOrig.y) / MAT_PERIOD;
    col = srgbToLinear(texture(uMat, vec3(uv, vLayer)).rgb) * diffuse;
  }
  col *= 1.0 - 0.18 * inner;
  col += vec3(1.0, 0.55, 0.22) * (vHeat * 1.6 + rim * 2.2);
  vec4 atm = atmosphere(vWorldPos, vDepth, ls.rgb);
  col = mix(col, atm.rgb, atm.a);
  fragColor = vec4(sceneOut(col), 1.0);
}
`;

export function createShardMaterial(
  lighting: LightingUniforms,
  matTex: THREE.Texture | null,
  section: { uSectionKey: THREE.IUniform<THREE.Color>; uCamFill: THREE.IUniform<THREE.Color> },
): { material: THREE.ShaderMaterial; uniforms: ShardUniforms } {
  const uniforms: ShardUniforms = {
    ...(lighting as unknown as Record<string, THREE.IUniform>),
    ...sectionUniforms(),
    uSectionKey: section.uSectionKey,
    uCamFill: section.uCamFill,
    uFxTime: { value: 0 },
    uBlockA: { value: Array.from({ length: SHARD_BLOCKS }, () => new THREE.Vector4(0, 0, 0, -1e6)) },
    uBlockB: { value: Array.from({ length: SHARD_BLOCKS }, () => new THREE.Vector4(0, -1e4, 0, 0)) },
    uBlockC: { value: Array.from({ length: SHARD_BLOCKS }, () => new THREE.Vector4(1, 1, 0, 0)) },
    uMat: { value: matTex },
  };
  const material = new THREE.ShaderMaterial({ glslVersion: THREE.GLSL3, vertexShader: vert, fragmentShader: frag, uniforms });
  return { material, uniforms };
}
