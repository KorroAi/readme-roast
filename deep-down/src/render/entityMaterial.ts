import * as THREE from 'three';
import { LIGHTING_GLSL, type LightingUniforms } from './lighting';

/**
 * Material for every non-terrain object (props, the explorer, tools, drops, debris).
 *
 * Geometry attributes:
 *   position  Float32 x3
 *   normal    Float32 x3
 *   color     Uint8 x3 normalized (sRGB albedo; converted to linear in the shader)
 *   aEmissive Uint8 x1 normalized (0 = lit surface, 1 = fully self-illuminated)
 *
 * Supports InstancedMesh (instanceMatrix, instanceColor as a tint multiplier).
 * Lighting comes from the shared LightingRig volumes, so objects match the terrain.
 */

const vertex = /* glsl */ `
in vec3 color;
in float aEmissive;
out vec3 vWorldPos;
out vec3 vNormal;
out vec3 vColor;
out float vEmissive;
out float vDepth;

vec3 srgbToLinear(vec3 c) {
  return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c));
}

void main() {
  vec4 local = vec4(position, 1.0);
  vec3 n = normal;
  #ifdef USE_INSTANCING
    local = instanceMatrix * local;
    n = mat3(instanceMatrix) * n;
  #endif
  vec4 wp = modelMatrix * local;
  vWorldPos = wp.xyz;
  vNormal = normalize(mat3(modelMatrix) * n);
  vColor = srgbToLinear(color);
  #ifdef USE_INSTANCING_COLOR
    vColor *= instanceColor;
  #endif
  vEmissive = aEmissive;
  vec4 mv = viewMatrix * wp;
  vDepth = length(mv.xyz);
  gl_Position = projectionMatrix * mv;
}
`;

const fragment = /* glsl */ `
precision highp float;
${LIGHTING_GLSL}
uniform vec3 uTint;
uniform float uEmissiveScale;
uniform vec3 uEmissiveColor;
uniform float uFlash;
uniform float uFade;

in vec3 vWorldPos;
in vec3 vNormal;
in vec3 vColor;
in float vEmissive;
in float vDepth;
layout(location = 0) out highp vec4 fragColor;

void main() {
#ifdef USE_FADE
  // Screen-door fade (used when the camera gets very close to the explorer).
  if (uFade < 0.999) {
    float d = fract(dot(gl_FragCoord.xy, vec2(0.7548777, 0.5698403)));
    if (d > uFade) discard;
  }
#endif
  vec3 n = normalize(vNormal);
  if (!gl_FrontFacing) n = -n;
  vec3 albedo = vColor * uTint;
  vec3 samplePos = vWorldPos + n * 0.35;
  float shade = 0.72 + 0.28 * n.y; // soft top light so forms read in flat ambient
  vec3 light = worldLight(samplePos) * shade + lanternLight(samplePos, vWorldPos, n);
  vec3 color = albedo * light;
  vec3 emissive = (albedo + uEmissiveColor) * vEmissive * uEmissiveScale;
  float fog = fogFactor(vDepth);
  color = mix(color, uFogColor, fog);
  color += emissive * (1.0 - fog * 0.7);
  color += uFlash * vec3(1.0, 0.95, 0.85);
  fragColor = vec4(color, 1.0);
}
`;

export interface EntityMaterialOptions {
  emissiveScale?: number;
  emissiveColor?: THREE.ColorRepresentation;
  doubleSided?: boolean;
  /** Compile the screen-door fade (uFade). Only for materials that fade: discard costs early-Z. */
  fade?: boolean;
}

export function createEntityMaterial(lighting: LightingUniforms, opts: EntityMaterialOptions = {}): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    glslVersion: THREE.GLSL3,
    uniforms: {
      ...lighting,
      uTint: { value: new THREE.Color(1, 1, 1) },
      uEmissiveScale: { value: opts.emissiveScale ?? 2.2 },
      uEmissiveColor: { value: new THREE.Color(opts.emissiveColor ?? 0x000000) },
      uFlash: { value: 0 },
      uFade: { value: 1 },
    },
    defines: opts.fade ? { USE_FADE: '' } : {},
    vertexShader: vertex,
    fragmentShader: fragment,
    side: opts.doubleSided ? THREE.DoubleSide : THREE.FrontSide,
  });
}
