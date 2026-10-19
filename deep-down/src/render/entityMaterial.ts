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
uniform float uRim;

in vec3 vWorldPos;
in vec3 vNormal;
in vec3 vColor;
in float vEmissive;
in float vDepth;
layout(location = 0) out highp vec4 fragColor;

void main() {
  vec3 n = normalize(vNormal);
  if (!gl_FrontFacing) n = -n;
  // The explorer (uRim) is demoted: a darker coat (it is far more reflective than the rock
  // around it), so the route and the landmarks, not the carrier of the lantern, hold the
  // brightest values of the frame, even next to a lamp.
  vec3 albedo = vColor * uTint * (1.0 - 0.28 * uRim);
  vec3 samplePos = vWorldPos + n * 0.35;
  vec4 ls = lightSample(samplePos);
  float shade = 0.72 + 0.28 * n.y; // soft top light so forms read in flat ambient
  // Contact darkening: openness is 0 inside solid voxels, so the filtered volume 0.45 m below the
  // fragment fades toward the floor compared with the open space beside the fragment (ls.a).
  // Crates, barrels and boots sit in the world instead of floating on it (one extra fetch).
  float below = texture(uLightTex, (vWorldPos - vec3(0.0, 0.45, 0.0)) / uWorldSize).a;
  float contact = ls.a > 0.02 ? clamp(below / ls.a, 0.0, 1.0) : 1.0;
  contact = 0.4 + 0.6 * smoothstep(0.08, 0.9, contact);
  vec3 env = ambientFrom(ls);
  // The carrier's own lantern is measured from at least 3 m (its flame hangs at the hip):
  // otherwise the inverse-square core would make the explorer the brightest thing on screen.
  vec3 lantern = lanternLight(samplePos, vWorldPos, n, ls.a, 3.0 * uRim);
  vec3 emissive = (albedo + uEmissiveColor) * vEmissive * uEmissiveScale;
  if (uRim > 0.0) {
    // The explorer keeps its own colours: cool world light (cyan crystals, violet abyss) is half
    // desaturated on it (warm lamp light is not), so the ochre coat never turns teal. A faint
    // warm rim, only on silhouette edges turned away from the flame (where the lantern does not
    // already light it), separates it from dark rock without making it glow.
    float el = dot(env, vec3(0.2126, 0.7152, 0.0722));
    float cool = smoothstep(0.0, 0.35, (env.b - env.r) / max(el, 1e-4));
    env = mix(env, vec3(el), 0.55 * cool);
    vec3 v = normalize(cameraPosition - vWorldPos);
    float rim = pow(1.0 - clamp(dot(n, v), 0.0, 1.0), 3.0);
    vec3 toFlame = uLanternPos - vWorldPos;
    float away = 1.0 - smoothstep(-0.35, 0.25, dot(n, toFlame) / max(length(toFlame), 1e-3));
    float near = 1.0 - smoothstep(0.6, 2.6, length(toFlame));
    vec3 warm = uLanternColor * vec3(1.0, 0.62, 0.36) * uLanternIntensity;
    emissive += albedo * warm * (rim * away * near * 0.15 * uRim);
  }
  vec3 light = env * shade * contact + lantern * mix(0.7, 1.0, contact);
  vec3 color = albedo * light;
  vec4 atm = atmosphere(vWorldPos, vDepth, ls.rgb);
  color = mix(color, atm.rgb, atm.a);
  color += emissive * (1.0 - atm.a * uAtmos.z);
  color += uFlash * vec3(1.0, 0.95, 0.85);
  fragColor = vec4(sceneOut(color), 1.0);
}
`;

export interface EntityMaterialOptions {
  emissiveScale?: number;
  emissiveColor?: THREE.ColorRepresentation;
  doubleSided?: boolean;
  /**
   * The material belongs to the explorer, which fades near the camera (ExplorerModel blends it
   * with a constant alpha after a depth pass: no discard, no screen-door define). uFade is kept
   * as the explorer's current opacity.
   */
  fade?: boolean;
  /**
   * Character lighting (lantern distance clamp, edge rim away from the flame, darker albedo,
   * desaturated environment light), 0..1. Defaults to 1 for the explorer (fade) and 0 otherwise.
   */
  rim?: number;
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
      uRim: { value: opts.rim ?? (opts.fade ? 1 : 0) },
    },
    defines: {},
    vertexShader: vertex,
    fragmentShader: fragment,
    side: opts.doubleSided ? THREE.DoubleSide : THREE.FrontSide,
  });
}
