import * as THREE from 'three';
import type { LightingUniforms } from '../lighting';

/**
 * A living flame for fires and braziers (round 2, VIS): one camera-facing quad per flame whose
 * fragment shader draws licking tongues from scrolling noise inside a teardrop, a white-gold core
 * at the base going orange then red at the tips, with soft edges and an additive glow, so the camp
 * fire reads as fire (not a stack of pink boxes). It stays upright on screen (its "up" is the world's
 * up projected into the view), so it keeps its shape when looked down on. One draw call per flame.
 */

const vert = /* glsl */ `
uniform vec2 uSize; // width, height (m)
out vec2 vUv;
out float vFade;
void main() {
  vUv = vec2(position.x, position.y); // x -0.5..0.5, y 0..1
  vec4 c = viewMatrix * modelMatrix * vec4(0.0, 0.0, 0.0, 1.0);
  // World up in view space: the flame rises along it on screen.
  vec3 up = (viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz;
  vec2 u2 = up.xy;
  float l = length(u2);
  u2 = l > 0.2 ? u2 / l : vec2(0.0, 1.0);
  vec2 r2 = vec2(u2.y, -u2.x);
  float scale = length(modelMatrix[1].xyz);
  // Seen from above the flame shortens (foreshortened), but never to a sliver.
  float h = uSize.y * scale * mix(0.6, 1.0, clamp(l, 0.0, 1.0));
  c.xy += r2 * position.x * uSize.x * scale + u2 * position.y * h;
  // Fade it out right at the lens (never a screen-filling glow).
  vFade = smoothstep(0.35, 0.9, -c.z);
  gl_Position = projectionMatrix * c;
}
`;

/** The flame's fragment shader (shared with the instanced torch flames, render/torches.ts). */
export const FLAME_FRAG = /* glsl */ `
precision highp float;
uniform float uTime;
uniform float uSeed;
uniform float uIntensity;
uniform float uSceneEncode;
in vec2 vUv;
in float vFade;
layout(location = 0) out highp vec4 fragColor;
float h21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float vn(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(h21(i), h21(i + vec2(1, 0)), u.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), u.x), u.y);
}
float fbm(vec2 p) { return vn(p) * 0.55 + vn(p * 2.03 + 3.1) * 0.3 + vn(p * 4.1 + 7.7) * 0.15; }
void main() {
  float y = vUv.y;
  float t = uTime * 1.0 + uSeed * 13.0;
  // Tongues: the noise scrolls up and sways, more at the top.
  float n = fbm(vec2(vUv.x * 3.2 + uSeed * 5.0, y * 2.6 - t * 2.4));
  float n2 = fbm(vec2(vUv.x * 6.0 - uSeed * 3.0, y * 4.5 - t * 3.6));
  float x = vUv.x + (n - 0.5) * 0.34 * y + sin(t * 1.7 + y * 3.0) * 0.03 * y;
  // Teardrop: wide and round at the base, narrowing to licking tips.
  float w = 0.46 * pow(max(1.0 - y, 0.0), 0.75) * (0.75 + 0.45 * n) * smoothstep(0.0, 0.12, y + 0.04);
  float d = abs(x) / max(w, 1e-3);
  float body = 1.0 - smoothstep(0.55, 1.0, d);
  // Breaks in the tips (tongues separate as they rise).
  body *= 1.0 - smoothstep(0.35, 0.95, y) * smoothstep(0.42, 0.62, n2);
  float heat = body * pow(max(1.0 - y, 0.0), 0.55) * (1.0 - 0.35 * d * d);
  if (heat < 0.004) discard;
  // Deep red at the licking tips, orange body, gold toward the base, a small pale core.
  vec3 col = mix(vec3(0.8, 0.12, 0.02), vec3(1.0, 0.42, 0.06), smoothstep(0.06, 0.32, heat));
  col = mix(col, vec3(1.0, 0.72, 0.3), smoothstep(0.38, 0.7, heat));
  col = mix(col, vec3(1.0, 0.93, 0.78), smoothstep(0.78, 0.98, heat));
  vec3 c = col * heat * (1.3 + 1.4 * heat) * uIntensity * vFade;
  c = uSceneEncode > 0.5 ? sqrt(c / (1.0 + c)) : c;
  fragColor = vec4(c, 1.0); // additive (SRC_ALPHA, ONE)
}
`;

export function createFlameMaterial(lighting: LightingUniforms, seed: number, width: number, height: number): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    glslVersion: THREE.GLSL3,
    uniforms: {
      uTime: lighting.uTime,
      uSceneEncode: (lighting as Record<string, THREE.IUniform>).uSceneEncode ?? { value: 0 },
      uSeed: { value: seed },
      uSize: { value: new THREE.Vector2(width, height) },
      uIntensity: { value: 1 },
    },
    vertexShader: vert,
    fragmentShader: FLAME_FRAG,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
}

let quad: THREE.BufferGeometry | null = null;
/** The flame quad: x -0.5..0.5, y 0..1 (the vertex shader places it). */
export function flameQuad(): THREE.BufferGeometry {
  if (quad) return quad;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-0.5, 0, 0, 0.5, 0, 0, 0.5, 1, 0, -0.5, 1, 0]), 3));
  g.setIndex([0, 1, 2, 0, 2, 3]);
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0.5, 0), 1.2);
  quad = g;
  return g;
}
