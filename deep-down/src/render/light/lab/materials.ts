// The light lab's materials (owner 1E): a reference use of the light chunk, the way 1C's surfaces use it. A stone
// block (instanced, per-block value ±6 %, world-space grain, puddles) and a prop material (albedo, roughness, metal,
// emission, translucency).

import * as THREE from 'three';
import { LIGHTING_GLSL, lightingUniforms } from '../chunk';

const NOISE = /* glsl */ `
float lh(vec3 p) { p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
float vn(vec3 p) {
  vec3 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(lh(i), lh(i + vec3(1, 0, 0)), f.x), mix(lh(i + vec3(0, 1, 0)), lh(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(lh(i + vec3(0, 0, 1)), lh(i + vec3(1, 0, 1)), f.x), mix(lh(i + vec3(0, 1, 1)), lh(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}
`;

export function stoneMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    name: 'lab-stone',
    uniforms: { ...lightingUniforms() },
    vertexShader: /* glsl */ `
      attribute float aSeed;
      attribute float aKind;
      varying vec3 vWorld;
      varying vec3 vNormal;
      varying float vSeed;
      varying float vKind;
      void main() {
        mat4 m = modelMatrix;
      #ifdef USE_INSTANCING
        m = modelMatrix * instanceMatrix;
      #endif
        vec4 wp = m * vec4(position, 1.0);
        vWorld = wp.xyz;
        vNormal = normalize(mat3(m) * normal);
        vSeed = aSeed;
        vKind = aKind;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: /* glsl */ `
      ${LIGHTING_GLSL}
      ${NOISE}
      varying vec3 vWorld;
      varying vec3 vNormal;
      varying float vSeed;
      varying float vKind;
      void main() {
        vec3 ng = normalize(vNormal);
        vec3 p = vWorld;
        float kind = vKind;
        // Cool blue-green stone, warmer floors; ±6 % per block; a slow world-space grain.
        vec3 base = kind < 0.5 ? vec3(0.20, 0.235, 0.25) : kind < 1.5 ? vec3(0.26, 0.24, 0.215) : vec3(0.30, 0.19, 0.11);
        float g = vn(p * 3.1) * 0.6 + vn(p * 9.7) * 0.4;
        vec3 alb = base * (0.94 + 0.12 * vSeed) * (0.85 + 0.3 * g);
        // Micro-relief normal from the same noise (resolution-free).
        vec3 q = p * 9.0;
        float n0 = vn(q);
        vec3 gr = vec3(vn(q + vec3(0.1, 0, 0)) - n0, vn(q + vec3(0, 0.1, 0)) - n0, vn(q + vec3(0, 0, 0.1)) - n0) / 0.1;
        gr -= ng * dot(gr, ng);
        float fw = length(fwidth(p));
        vec3 n = normalize(ng - gr * 0.05 * (1.0 - smoothstep(0.006, 0.03, fw)));
        float wet = 0.0;
        if (kind > 0.5 && kind < 1.5 && ng.y > 0.8) wet = smoothstep(0.6, 0.7, vn(p * vec3(0.5, 0.0, 0.5) + 3.7));
        Surface s = surfaceInit(alb, n);
        s.geoNormal = ng;
        s.roughness = kind > 1.5 ? 0.7 : 0.82 + 0.1 * g;
        s.wet = wet;
        vec3 col = shade(s, p, normalize(cameraPosition - p));
        gl_FragColor = lightOut(col, p);
      }`,
  });
}

export interface PropLook {
  albedo: number;
  roughness: number;
  metal: number;
  emission?: number;
  emissionGain?: number;
  sss?: number;
  sssColor?: number;
}

export function propMaterial(look: PropLook): THREE.ShaderMaterial {
  const c = (hex: number) => new THREE.Color().setHex(hex, THREE.SRGBColorSpace);
  return new THREE.ShaderMaterial({
    name: 'lab-prop',
    uniforms: {
      ...lightingUniforms(),
      uAlbedo: { value: c(look.albedo) },
      uRM: { value: new THREE.Vector2(look.roughness, look.metal) },
      uEmission: { value: c(look.emission ?? 0).multiplyScalar(look.emissionGain ?? 0) },
      uSss: { value: look.sss ?? 0 },
      uSssColor: { value: c(look.sssColor ?? look.albedo) },
    },
    vertexShader: /* glsl */ `
      varying vec3 vWorld;
      varying vec3 vNormal;
      varying vec3 vLocal;
      void main() {
        mat4 m = modelMatrix;
      #ifdef USE_INSTANCING
        m = modelMatrix * instanceMatrix;
      #endif
        vec4 wp = m * vec4(position, 1.0);
        vWorld = wp.xyz;
        vLocal = position;
        vNormal = normalize(mat3(m) * normal);
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: /* glsl */ `
      ${LIGHTING_GLSL}
      ${NOISE}
      uniform vec3 uAlbedo;
      uniform vec2 uRM;
      uniform vec3 uEmission;
      uniform float uSss;
      uniform vec3 uSssColor;
      varying vec3 vWorld;
      varying vec3 vNormal;
      varying vec3 vLocal;
      void main() {
        vec3 ng = normalize(vNormal);
        vec3 p = vWorld;
        vec3 alb = uAlbedo * (0.9 + 0.2 * vn(p * 6.0));
        Surface s = surfaceInit(alb, ng);
        s.roughness = uRM.x;
        s.metal = uRM.y;
        // Crystals: an inner glow brighter low in the body (the luminous heart), translucent at grazing light.
        float heart = uSss > 0.0 ? (0.45 + 0.55 * (1.0 - clamp(vLocal.y / 0.7, 0.0, 1.0))) : 1.0;
        s.emission = uEmission * heart;
        s.sss = uSss;
        s.sssColor = uSssColor;
        vec3 col = shade(s, p, normalize(cameraPosition - p));
        gl_FragColor = lightOut(col, p);
      }`,
  });
}
