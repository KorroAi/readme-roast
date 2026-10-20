// Shaders of the lantern spike. One light model shared by every lit surface:
//   lantern  = warm point light at the flame: soft inverse-square pool, wrapped diffuse, GGX specular, soft cube
//              shadow (8-tap PCF);
//   ambience = cool hemisphere fill scaled by a voxel openness volume (soft AO, darker in crevices, never black);
//   accents  = baked emitter light from a voxel light volume (crystals, lava, a daylight shaft);
//   fog      = exponential depth fog + height fog, lit by the light volume along the ray and by the lantern (analytic).
// Output is linear HDR; post.ts adds bloom, tone mapping, grading and dither.

import * as THREE from 'three';

export function sharedUniforms() {
  return {
    uTime: { value: 0 },
    uCamPos: { value: new THREE.Vector3() },
    uLanternPos: { value: new THREE.Vector3() },
    uLanternColor: { value: new THREE.Color(1, 0.6, 0.3) },
    uLanternSoft: { value: 2.0 },
    uLanternRange: { value: 11 },
    tShadow: { value: null as THREE.Texture | null },
    uShadowFar: { value: 24 },
    uShadowOn: { value: 1 },
    tAmb: { value: null as THREE.Texture | null },
    tLight: { value: null as THREE.Texture | null },
    uVolOrigin: { value: new THREE.Vector3() },
    uVolSize: { value: new THREE.Vector3(1, 1, 1) },
    uSky: { value: new THREE.Color(0.05, 0.08, 0.09) },
    uGround: { value: new THREE.Color(0.02, 0.02, 0.025) },
    uAccentGain: { value: 1 },
    uFogColor: { value: new THREE.Color(0.01, 0.015, 0.02) },
    uFogDensity: { value: 0.06 },
    uFogHeight: { value: new THREE.Vector3(-2, 0.0, 0.0) }, // y, density, unused
    uFogScatter: { value: 0.35 },
    uLanternScatter: { value: 0.02 },
    uCrack: { value: new THREE.Vector4(0, 0, 0, 0) },
    uEmissive: { value: new THREE.Vector4(1, 1, 1, 1) }, // ore, gem, grotto, magma gains
    tNoise3: { value: null as THREE.Texture | null },
    uVein: { value: 0 },
  };
}
export type Shared = ReturnType<typeof sharedUniforms>;

const LIGHT_COMMON = /* glsl */ `
uniform float uTime;
uniform vec3 uCamPos;
uniform vec3 uLanternPos;
uniform vec3 uLanternColor;
uniform float uLanternSoft;
uniform float uLanternRange;
uniform samplerCube tShadow;
uniform float uShadowFar;
uniform float uShadowOn;
uniform sampler3D tAmb;
uniform sampler3D tLight;
uniform vec3 uVolOrigin;
uniform vec3 uVolSize;
uniform vec3 uSky;
uniform vec3 uGround;
uniform float uAccentGain;
uniform vec3 uFogColor;
uniform float uFogDensity;
uniform vec3 uFogHeight;
uniform float uFogScatter;
uniform float uLanternScatter;

vec3 volUV(vec3 p) { return (p - uVolOrigin) / uVolSize; }

// Warm-pale at the flame, deepening to amber with distance (luminance kept).
vec3 lanternTint(float d) {
  vec3 pale = vec3(1.0, 0.72, 0.44);
  vec3 amber = vec3(1.0, 0.47, 0.15);
  float k = smoothstep(0.4, 2.6, d);
  vec3 c = mix(pale, amber, k);
  return c / dot(c, vec3(0.2126, 0.7152, 0.0722)) * dot(uLanternColor, vec3(0.2126, 0.7152, 0.0722));
}

float lanternAtten(float d) {
  float att = 1. / (1. + d * d / (uLanternSoft * uLanternSoft));
  float w = clamp(1. - pow(d / uLanternRange, 4.), 0., 1.);
  return att * w * w;
}

const vec2 VOGEL[8] = vec2[8](vec2(0.2500, 0.0000), vec2(-0.3197, 0.2929), vec2(0.0484, -0.5571), vec2(0.4148, 0.5098),
  vec2(-0.7412, -0.1182), vec2(0.6794, -0.4542), vec2(-0.2128, 0.8599), vec2(-0.4859, -0.7962));

float lanternShadow(vec3 p, vec3 ng) {
  if (uShadowOn < 0.5) return 1.;
  vec3 L = p + ng * 0.035 - uLanternPos;
  float d = length(L);
  vec3 dir = L / d;
  vec3 t1 = normalize(cross(dir, abs(dir.y) < .9 ? vec3(0., 1., 0.) : vec3(1., 0., 0.)));
  vec3 t2 = cross(dir, t1);
  float r = 0.018 + 0.006 * d;
  float bias = 0.03 + 0.012 * d;
  float lit = 0.;
  for (int i = 0; i < 8; i++) {
    vec3 sd = dir + (t1 * VOGEL[i].x + t2 * VOGEL[i].y) * r;
    float s = texture(tShadow, sd).r * uShadowFar;
    lit += clamp((s - d + bias) * 12. + .5, 0., 1.);
  }
  return lit / 8.;
}

// Ambient occlusion from the openness volume (r = 0.5 m, g = 1.5 m, b = 3 m).
vec3 ambienceAt(vec3 p, vec3 ng) {
  vec4 a = texture(tAmb, volUV(p + ng * 0.25));
  return a.rgb;
}

vec3 ambientLight(vec3 n, vec3 amb) {
  float ao = mix(0.32, 1.0, smoothstep(0.30, 0.86, amb.r));
  float encl = mix(0.55, 1.0, smoothstep(0.25, 0.75, amb.g));
  float open = mix(0.75, 1.15, smoothstep(0.3, 0.8, amb.b));
  vec3 hemi = mix(uGround, uSky, n.y * 0.5 + 0.5);
  return hemi * ao * encl * open;
}

vec3 accentLight(vec3 p, vec3 ng, vec3 n, vec3 amb) {
  vec3 a = texture(tLight, volUV(p + ng * 0.25 + n * 0.1)).rgb;
  float ao = mix(0.45, 1.0, smoothstep(0.3, 0.86, amb.r));
  return a * ao * uAccentGain;
}

vec3 applyFog(vec3 col, vec3 p) {
  vec3 dv = p - uCamPos;
  float dist = length(dv);
  vec3 dir = dv / max(dist, 1e-4);
  float hf = uFogHeight.y * exp(-max(0., (p.y + uCamPos.y) * .5 - uFogHeight.x) * 0.6);
  float sigma = uFogDensity + hf;
  float trans = exp(-sigma * dist);
  // Single scattering of the light volume along the ray, 4 segments weighted by what each adds to the fog.
  float span = min(dist, 30.);
  vec3 ins = vec3(0.);
  float tPrev = 0.;
  float ePrev = 1.;
  for (int i = 0; i < 4; i++) {
    float t1 = span * (float(i) + 1.) / 4.;
    float e1 = exp(-sigma * t1);
    float tm = (tPrev + t1) * 0.5;
    // Clear air near the eye, luminous air in the distance (aerial perspective without a foreground wash).
    ins += texture(tLight, volUV(uCamPos + dir * tm)).rgb * (ePrev - e1) * smoothstep(2.5, 9., tm);
    tPrev = t1;
    ePrev = e1;
  }
  // Lantern glow in the air: closed-form integral of the soft inverse-square along the ray.
  vec3 lc = uLanternPos - uCamPos;
  float t0 = dot(lc, dir);
  float h2 = max(dot(lc, lc) - t0 * t0, 0.);
  float s2 = uLanternSoft * uLanternSoft;
  float k = sqrt(s2 + h2);
  float T = min(dist, uLanternRange);
  float glow = s2 / k * (atan((T - t0) / k) - atan(-t0 / k));
  return col * trans + uFogColor * (1. - trans) + ins * uFogScatter * uAccentGain + uLanternColor * glow * uLanternScatter;
}
`;
// --------------------------------------------------------------------------------------------- world (blocks, props)
export const WORLD_VERT = /* glsl */ `
attribute vec3 aTangent;
attribute vec4 aMat;
#ifdef DEBRIS
attribute vec4 aInst;
#endif
varying vec3 vWorld;
varying vec3 vNormal;
varying vec3 vTangent;
varying vec2 vUv;
varying vec4 vMat;
void main() {
  mat4 m = modelMatrix;
#ifdef USE_INSTANCING
  m = modelMatrix * instanceMatrix;
#endif
  vec4 wp = m * vec4(position, 1.);
  vWorld = wp.xyz;
  vNormal = normalize(mat3(m) * normal);
  vTangent = normalize(mat3(m) * aTangent);
  vUv = uv;
  vMat = aMat;
#ifdef DEBRIS
  vMat = vec4(aInst.x, aInst.y, aMat.z, aMat.w);
  vUv = uv + aInst.zw;
#endif
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

export const WORLD_FRAG = /* glsl */ `
uniform sampler2DArray tAlb;
uniform sampler2DArray tNrm;
uniform vec4 uCrack;
uniform vec4 uEmissive;
uniform sampler3D tNoise3;
uniform float uVein;
varying vec3 vWorld;
varying vec3 vNormal;
varying vec3 vTangent;
varying vec2 vUv;
varying vec4 vMat;
${LIGHT_COMMON}

float crackPattern(vec3 p, vec3 n) {
  vec3 q = (p - uCrack.xyz) / 0.5;
  if (max(max(abs(q.x), abs(q.y)), abs(q.z)) > 0.56) return 0.;
  vec2 f = abs(n.x) > .5 ? q.yz : abs(n.y) > .5 ? q.xz : q.xy;
  float a = atan(f.y, f.x);
  float r = length(f);
  float k = 0.;
  for (int i = 0; i < 5; i++) {
    float ai = float(i) * 1.2566 + 0.4 * sin(float(i) * 2.7);
    float da = abs(mod(a - ai - 0.35 * sin(r * 9. + float(i)) + 3.1416, 6.2832) - 3.1416);
    float w = 0.05 * (1. - r * 1.4);
    k = max(k, (1. - smoothstep(w * 0.4, w, da * r)) * step(r, uCrack.w * 0.75));
  }
  return k;
}

void main() {
  float layer = vMat.x;
  float tint = vMat.w;
  vec4 A = texture(tAlb, vec3(vUv, layer));
  vec4 Bt = texture(tNrm, vec3(vUv, layer));
  vec3 alb = A.rgb;
  // Per-block value variation (subtle) and prop tints.
  alb *= 0.9 + 0.2 * vMat.y;
  if (tint > 0.5 && tint < 1.5) alb = alb * vec3(2.3, 1.62, 0.62);       // gold
  else if (tint > 1.5 && tint < 2.5) alb = alb * vec3(0.55, 0.52, 0.5);  // dark iron
  else if (tint > 2.5 && tint < 3.5) alb = alb * vec3(1.9, 1.35, 0.72);  // brass

  vec3 ng = normalize(vNormal);
  if (!gl_FrontFacing) ng = -ng;
  vec3 T = normalize(vTangent - ng * dot(vTangent, ng));
  vec3 Bv = cross(ng, T);
  vec2 tn = Bt.xy * 2. - 1.;
  vec3 n = normalize(T * tn.x + Bv * tn.y + ng * sqrt(max(0., 1. - dot(tn, tn))));
  float rough = Bt.z;
  float mask = Bt.w;
  float metal = 0.;
  vec3 emis = vec3(0.);
  if (layer > 5.5 && layer < 7.5) { metal = mask; emis = alb * mask * 0.08 * uEmissive.x; }
  else if (layer > 7.5 && layer < 8.5) { emis = vec3(0.55, 0.28, 1.0) * mask * 0.5 * uEmissive.y; }
  else if (layer > 9.5 && layer < 12.5) { emis = vec3(0.25, 0.85, 1.0) * mask * 1.6 * uEmissive.z; }
  else if (layer > 14.5 && layer < 16.5) { emis = mix(vec3(1.0, 0.22, 0.04), vec3(1.0, 0.62, 0.22), mask) * mask * mask * 7.0 * uEmissive.w; }
  else if (layer > 17.5 && layer < 18.5) { metal = mask; }
  // Magma veins: a world-space 3D field, so the glowing cracks run continuously across blocks and around edges.
  float veinMask = smoothstep(4.0, 7.0, length(vWorld - uCamPos)) * (1. - smoothstep(0.6, 0.9, ng.y) * step(-0.5, vWorld.y));
  if (uVein > 0. && veinMask > 0. && ((layer > 12.5 && layer < 14.5) || layer > 18.5)) {
    vec3 q = vWorld * vec3(0.045, 0.06, 0.045);
    float f = texture(tNoise3, q).r * 0.8 + texture(tNoise3, q * 2.3 + 0.37).r * 0.2;
    float region = smoothstep(0.45, 0.62, texture(tNoise3, q * 0.5 + vec3(0.21, 0.6, 0.43)).r);
    veinMask *= region;
    float dv = abs(f - 0.5);
    float thick = 0.25 + 1.5 * texture(tNoise3, q * 4.1 + 0.71).r;
    float lowW = (0.005 + 0.011 * smoothstep(2.0, -7.0, vWorld.y)) * veinMask * thick;
    float core = 1. - smoothstep(lowW * 0.3, lowW, dv);
    float crust = 1. - smoothstep(lowW, lowW * 3.2 + 0.004, dv);
    alb *= 1. - 0.6 * crust;
    rough = mix(rough, 0.95, crust);
    float hot = core * core;
    float up = 1. - 0.55 * smoothstep(0.0, 5.0, vWorld.y);
    emis += (mix(vec3(1.0, 0.16, 0.02), vec3(1.0, 0.7, 0.3), hot) * hot * 4.5 + vec3(0.9, 0.12, 0.02) * crust * crust * 0.45) * uVein * up;
  }
  if (tint > 3.5) {
    // Lava: the magma texture as a molten river - crust plates over a glowing bath.
    // Lava from the world-space noise field (no tile): dark crust, meandering hot cracks, a few molten pools.
    vec2 lq = vWorld.xz * 0.075;
    float lf = texture(tNoise3, vec3(lq.x, 0.37, lq.y)).r * 0.72 + texture(tNoise3, vec3(lq.x * 2.6, 0.61, lq.y * 2.6)).r * 0.28;
    float lc = 1. - smoothstep(0.006, 0.03, abs(lf - 0.5));
    float lp = smoothstep(0.6, 0.74, lf);
    float hotL = max(lc, lp);
    emis = mix(vec3(0.85, 0.1, 0.02), vec3(1.0, 0.62, 0.22), hotL) * (0.07 + 0.25 * smoothstep(0.4, 0.6, lf) + 4.5 * lc + 2.2 * lp) * uEmissive.w;
    alb = vec3(0.045, 0.03, 0.028) * (0.7 + 0.6 * texture(tNoise3, vec3(lq.x * 6., 0.2, lq.y * 6.)).r);
    rough = 0.9;
  }

  // Mining crack overlay.
  if (uCrack.w > 0.) {
    float k = crackPattern(vWorld, ng);
    alb *= 1. - 0.85 * k;
    n = normalize(n + ng * 0.0);
    rough = mix(rough, 1., k);
  }

  // Specular anti-aliasing: widen the lobe where the normal changes fast on screen.
  vec3 dn = fwidth(ng);
  rough = clamp(max(rough, length(dn) * 1.2), 0.08, 1.);

  vec3 amb = ambienceAt(vWorld, ng);
  vec3 col = alb * (1. - metal * 0.7) * (ambientLight(n, amb) + accentLight(vWorld, ng, n, amb));

  vec3 V = normalize(uCamPos - vWorld);
  vec3 Lv = uLanternPos - vWorld;
  float d = length(Lv);
  vec3 L = Lv / d;
  float att = lanternAtten(d);
  if (att > 0.001) {
    float sh = lanternShadow(vWorld, ng);
    float ndl = dot(n, L);
    float wrap = clamp((ndl + 0.3) / 1.3, 0., 1.);
    // Geometry term on the real surface so normal maps never light faces turned away.
    float geo = clamp(dot(ng, L) * 4. + 0.6, 0., 1.);
    vec3 Li = lanternTint(d) * att * sh * geo;
    col += alb * (1. - metal * 0.85) * Li * wrap;
    vec3 H = normalize(L + V);
    float a = rough * rough;
    float a2 = a * a;
    float nh = max(dot(n, H), 0.);
    float dd = nh * nh * (a2 - 1.) + 1.;
    float D = a2 / (3.14159 * dd * dd);
    float lh = max(dot(L, H), 0.05);
    vec3 F0 = mix(vec3(0.035), alb, metal);
    vec3 F = F0 + (1. - F0) * pow(1. - lh, 5.);
    col += Li * D * F * (0.25 / (lh * lh)) * max(ndl, 0.) * (1. - 0.35 * (1. - metal));
  }
  col += emis;
  col = applyFog(col, vWorld);
  gl_FragColor = vec4(col, 1.);
}
`;

// ------------------------------------------------------------------------------------------------ crystals and gems
export const CRYSTAL_VERT = /* glsl */ `
attribute vec4 aCry; // axial t (0 base, 1 tip), facet u, facet v, palette index
varying vec3 vWorld;
varying vec3 vNormal;
varying vec4 vCry;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.);
  vWorld = wp.xyz;
  vNormal = normalize(mat3(modelMatrix) * normal);
  vCry = aCry;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

export const CRYSTAL_FRAG = /* glsl */ `
uniform vec3 uPal[5];
uniform vec3 uDeep[5];
uniform float uCrystalGain;
varying vec3 vWorld;
varying vec3 vNormal;
varying vec4 vCry;
${LIGHT_COMMON}
void main() {
  int ci = int(vCry.w + 0.5);
  vec3 glow = uPal[0];
  vec3 deep = uDeep[0];
  for (int i = 1; i < 5; i++) if (i == ci) { glow = uPal[i]; deep = uDeep[i]; }
  vec3 n = normalize(vNormal);
  vec3 V = normalize(uCamPos - vWorld);
  float ndv = abs(dot(n, V));
  float fres = pow(1. - ndv, 3.);
  float t = vCry.x;
  vec2 f = vCry.yz;
  float e;
  if (f.x > 1.5) {
    // Tip facet: barycentric coordinates.
    float b0 = f.x - 2., b1 = f.y;
    e = min(min(b0, b1), 1. - b0 - b1) * 1.5;
  } else e = min(min(f.x, 1. - f.x), min(f.y, 1. - f.y));
  float fw = fwidth(e) * 1.5;
  float edge = 1. - smoothstep(0.012, 0.05 + fw, e);
  float centre = smoothstep(0.0, 0.45, e);
  float axial = 1. - t;
  // Inner light: a luminous heart low in the crystal and along each facet's middle, a dark glassy rim,
  // thin lit facet edges, and a softly bright tip.
  float core = pow(axial, 1.1) * (0.35 + 0.65 * centre);
  float veil = 0.85 + 0.15 * sin(t * 23. + vWorld.x * 3.1 + vWorld.z * 2.3);
  vec3 col = deep * (0.55 + 0.45 * ndv);
  col += glow * (0.06 + 0.95 * core * veil) * uCrystalGain;
  col += mix(glow, vec3(0.85, 1., 1.), 0.3) * edge * (0.08 + 0.3 * axial) * uCrystalGain;
  col += glow * smoothstep(0.82, 1.0, t) * 0.15 * uCrystalGain;
  col += glow * fres * 0.12 * uCrystalGain;
  // Lantern: faint diffuse + sharp glints on the facets.
  vec3 Lv = uLanternPos - vWorld;
  float d = length(Lv);
  vec3 L = Lv / d;
  float att = lanternAtten(d);
  vec3 H = normalize(L + V);
  float nh = max(dot(n, H), 0.);
  float a2 = 0.012;
  float dd = nh * nh * (a2 - 1.) + 1.;
  float D = a2 / (3.14159 * dd * dd);
  float sh = lanternShadow(vWorld, n);
  col += lanternTint(d) * att * sh * (max(dot(n, L), 0.) * deep * 0.8 + D * 0.04 * max(dot(n, L), 0.));
  col = applyFog(col, vWorld);
  gl_FragColor = vec4(col, 1.);
}
`;

// ------------------------------------------------------------------------------------------------------- lantern
export const LANTERN_VERT = /* glsl */ `
attribute float aPart;
varying vec3 vWorld;
varying vec3 vNormal;
varying vec3 vLocal;
varying float vPart;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.);
  vWorld = wp.xyz;
  vNormal = normalize(mat3(modelMatrix) * normal);
  vLocal = position;
  vPart = aPart;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

export const LANTERN_FRAG = /* glsl */ `
uniform vec3 uCamPos;
uniform vec3 uFlame;
uniform vec3 uSky;
uniform vec3 uGlowColor;
uniform float uGlow;
varying vec3 vWorld;
varying vec3 vNormal;
varying vec3 vLocal;
varying float vPart;
void main() {
  vec3 n = normalize(vNormal);
  vec3 V = normalize(uCamPos - vWorld);
  vec3 Lv = uFlame - vWorld;
  float d = length(Lv);
  vec3 L = Lv / d;
  float ndl = dot(n, L);
  float ndv = max(dot(n, V), 0.);
  vec3 col;
  if (vPart > 2.5) {
    // Flame: white-gold core, orange skin.
    float core = pow(ndv, 1.5);
    col = mix(vec3(1.0, 0.36, 0.06), vec3(1.0, 0.86, 0.6), core) * 6.0 * uGlow;
  } else {
    bool brass = vPart < 0.5;
    vec3 alb = brass ? vec3(0.56, 0.38, 0.12) : vec3(0.05, 0.045, 0.042);
    // Direct light from the flame where the part faces it, through the glass.
    float near = 1. / (1. + d * d * 700.);
    vec3 warm = uGlowColor * uGlow;
    float facing = max(ndl, 0.) * 0.8 + 0.2 * (ndl * 0.5 + 0.5);
    col = alb * warm * near * facing * 2.2;
    // Environment: warm floor pool below, cool cave above; a metal reflects it.
    vec3 R = reflect(-V, n);
    vec3 env = mix(vec3(0.3, 0.16, 0.06), vec3(0.09, 0.08, 0.07), smoothstep(-0.2, 0.8, R.y));
    float fres = 0.04 + 0.96 * pow(1. - ndv, 5.);
    vec3 F0 = brass ? vec3(0.85, 0.62, 0.32) : vec3(0.08);
    col += env * mix(F0, vec3(1.), fres) * (brass ? 1.0 : 0.6);
    col += alb * (brass ? vec3(0.06, 0.04, 0.025) : uSky * 0.4) * (0.6 + 0.4 * n.y);
    // Glints of the flame on the metal.
    float spec = pow(max(dot(n, normalize(V + L)), 0.), 60.) * near;
    col += (brass ? vec3(1.0, 0.75, 0.42) : vec3(0.5, 0.4, 0.3)) * spec * uGlow * 3.;
  }
  gl_FragColor = vec4(col, 1.);
}
`;

export const GLASS_FRAG = /* glsl */ `
uniform vec3 uCamPos;
uniform vec3 uFlame;
uniform vec3 uSky;
uniform vec3 uGlowColor;
uniform float uGlow;
varying vec3 vWorld;
varying vec3 vNormal;
varying vec3 vLocal;
varying float vPart;
void main() {
  vec3 n = normalize(vNormal);
  vec3 V = normalize(uCamPos - vWorld);
  float ndv = abs(dot(n, V));
  // Smoky glass lit from inside: a soft bright band at flame height, darker towards the frame.
  float h = vLocal.y;
  float band = exp(-pow((h - 0.066) / 0.034, 2.));
  float edges = smoothstep(0.034, 0.05, h) * smoothstep(0.118, 0.1, h);
  vec3 col = uGlowColor * uGlow * (0.05 + 0.32 * band) * edges * (0.45 + 0.55 * ndv);
  // A cool sheen at grazing angles (the cave reflected in the glass).
  col += uSky * 1.6 * pow(1. - ndv, 3.) * edges;
  gl_FragColor = vec4(col, 1.);
}
`;
// ------------------------------------------------------------------------------------------- shadow distance pass
export const DIST_VERT = /* glsl */ `
varying vec3 vWorld;
void main() {
  mat4 m = modelMatrix;
#ifdef USE_INSTANCING
  m = modelMatrix * instanceMatrix;
#endif
  vec4 wp = m * vec4(position, 1.);
  vWorld = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;
export const DIST_FRAG = /* glsl */ `
uniform vec3 uLightPos;
uniform float uFar;
varying vec3 vWorld;
void main() { gl_FragColor = vec4(length(vWorld - uLightPos) / uFar, 0., 0., 1.); }
`;

// ----------------------------------------------------------------------------------------------- additive effects
export const SHAFT_VERT = /* glsl */ `
attribute vec2 aAlong;
varying vec3 vWorld;
varying vec3 vNormal;
varying float vAlong;
varying float vAng;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.);
  vWorld = wp.xyz;
  vNormal = normalize(mat3(modelMatrix) * normal);
  vAlong = aAlong.x;
  vAng = aAlong.y;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;
export const SHAFT_FRAG = /* glsl */ `
uniform vec3 uCamPos;
uniform vec3 uShaftColor;
uniform float uFogDensity;
varying vec3 vWorld;
varying vec3 vNormal;
varying float vAlong;
varying float vAng;
void main() {
  vec3 V = normalize(uCamPos - vWorld);
  float edge = pow(abs(dot(normalize(vNormal), V)), 2.2);
  float fall = (0.35 + 0.65 * pow(1. - vAlong, 1.5)) * smoothstep(0.0, 0.1, vAlong) * smoothstep(1.0, 0.86, vAlong);
  float streak = 0.72 + 0.28 * sin(vAng * 7. + vAlong * 2.) * sin(vAng * 3. - 1.3);
  float dist = length(uCamPos - vWorld);
  float a = edge * fall * streak * exp(-dist * uFogDensity * 0.35);
  gl_FragColor = vec4(uShaftColor * a, 1.);
}
`;

export const MOTE_VERT = /* glsl */ `
attribute vec4 aPhase;
uniform float uTime;
uniform float uPx;
uniform vec3 uCamPos;
uniform vec3 uLanternPos;
uniform vec3 uLanternColor;
uniform float uLanternSoft;
uniform sampler3D tLight;
uniform vec3 uVolOrigin;
uniform vec3 uVolSize;
uniform vec3 uBoxMin;
uniform vec3 uBoxSize;
uniform float uRise;
varying vec3 vCol;
void main() {
  vec3 p = position;
  float t = uTime;
  p.x += sin(t * (0.11 + aPhase.x * 0.08) + aPhase.y * 6.28) * 0.18;
  p.z += sin(t * (0.09 + aPhase.y * 0.07) + aPhase.z * 6.28) * 0.18;
  p.y += sin(t * (0.07 + aPhase.z * 0.05) + aPhase.x * 6.28) * 0.12 + t * uRise * (0.5 + aPhase.w);
  p = uBoxMin + mod(p - uBoxMin, uBoxSize);
  vec4 wp = modelMatrix * vec4(p, 1.);
  vec3 lv = uLanternPos - wp.xyz;
  float ld = dot(lv, lv);
  vec3 c = uLanternColor * (1. / (1. + ld / (uLanternSoft * uLanternSoft * 0.35)));
  c += texture(tLight, (wp.xyz - uVolOrigin) / uVolSize).rgb * 1.6;
  float dist = length(wp.xyz - uCamPos);
  float fadeNear = smoothstep(0.6, 1.4, dist);
  float fadeFar = 1. - smoothstep(7., 12., dist);
  vCol = c * 0.045 * fadeNear * fadeFar * (0.4 + 0.6 * aPhase.w);
  vec4 mv = viewMatrix * wp;
  gl_Position = projectionMatrix * mv;
  gl_PointSize = uPx * (0.018 + 0.016 * aPhase.w) / -mv.z * 700.;
}
`;
export const MOTE_FRAG = /* glsl */ `
varying vec3 vCol;
void main() {
  vec2 q = gl_PointCoord * 2. - 1.;
  float r = dot(q, q);
  float a = exp(-r * 3.5) * (1. - smoothstep(0.7, 1., r));
  gl_FragColor = vec4(vCol * a, 1.);
}
`;

// Soft billboards (dust puff, lantern halo, lava glow): additive, colour from a uniform per mesh.
export const SPRITE_VERT = /* glsl */ `
attribute vec4 aSprite; // size, alpha, unused, unused
varying vec2 vQ;
varying float vA;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.);
#ifdef USE_INSTANCING
  mv = modelViewMatrix * instanceMatrix * vec4(0., 0., 0., 1.);
  vec2 corner = position.xy;
  mv.xy += corner * aSprite.x;
#endif
  vQ = uv * 2. - 1.;
  vA = aSprite.y;
  gl_Position = projectionMatrix * mv;
}
`;
export const SPRITE_FRAG = /* glsl */ `
uniform vec3 uColor;
varying vec2 vQ;
varying float vA;
void main() {
  float r = dot(vQ, vQ);
  float a = exp(-r * 4.) * (1. - smoothstep(0.75, 1., r));
  gl_FragColor = vec4(uColor * a * vA, 1.);
}
`;

// --------------------------------------------------------------------------------------------------- post process
export const POST_VERT = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0., 1.); }
`;
export const PREFILTER_FRAG = /* glsl */ `
uniform sampler2D tSrc;
uniform vec2 uTexel;
uniform float uThreshold;
uniform float uKnee;
varying vec2 vUv;
vec3 tap(vec2 o) { return texture2D(tSrc, vUv + o * uTexel).rgb; }
void main() {
  vec3 c = (tap(vec2(-1., -1.)) + tap(vec2(1., -1.)) + tap(vec2(-1., 1.)) + tap(vec2(1., 1.))) * 0.25;
  float br = max(c.r, max(c.g, c.b));
  float rq = clamp(br - uThreshold + uKnee, 0., 2. * uKnee);
  rq = rq * rq / (4. * uKnee + 1e-4);
  float w = max(rq, br - uThreshold) / max(br, 1e-4);
  gl_FragColor = vec4(min(c * w, vec3(24.)), 1.);
}
`;
export const DOWN_FRAG = /* glsl */ `
uniform sampler2D tSrc;
uniform vec2 uTexel;
varying vec2 vUv;
vec3 tap(vec2 o) { return texture2D(tSrc, vUv + o * uTexel).rgb; }
void main() {
  vec3 a = tap(vec2(-2., -2.)), b = tap(vec2(0., -2.)), c = tap(vec2(2., -2.));
  vec3 d = tap(vec2(-1., -1.)), e = tap(vec2(1., -1.));
  vec3 f = tap(vec2(-2., 0.)), g = tap(vec2(0., 0.)), h = tap(vec2(2., 0.));
  vec3 i = tap(vec2(-1., 1.)), j = tap(vec2(1., 1.));
  vec3 k = tap(vec2(-2., 2.)), l = tap(vec2(0., 2.)), m = tap(vec2(2., 2.));
  vec3 s = (d + e + i + j) * 0.125 + (a + c + k + m) * 0.03125 + (b + f + h + l) * 0.0625 + g * 0.125;
  gl_FragColor = vec4(s, 1.);
}
`;
export const UP_FRAG = /* glsl */ `
uniform sampler2D tSrc;
uniform vec2 uTexel;
uniform float uScatter;
varying vec2 vUv;
vec3 tap(vec2 o) { return texture2D(tSrc, vUv + o * uTexel).rgb; }
void main() {
  vec3 s = tap(vec2(0.)) * 4. + (tap(vec2(-1., 0.)) + tap(vec2(1., 0.)) + tap(vec2(0., -1.)) + tap(vec2(0., 1.))) * 2.
         + tap(vec2(-1., -1.)) + tap(vec2(1., -1.)) + tap(vec2(-1., 1.)) + tap(vec2(1., 1.));
  gl_FragColor = vec4(s / 16. * uScatter, 1.);
}
`;
export const COMPOSITE_FRAG = /* glsl */ `
uniform sampler2D tScene;
uniform sampler2D tBloom;
uniform float uBloom;
uniform float uExposure;
uniform vec3 uLift;
uniform vec3 uGain;
uniform float uSat;
uniform float uVignette;
uniform vec2 uRes;
varying vec2 vUv;
// Khronos PBR Neutral tone mapping: keeps hue and saturation, soft shoulder (no hard clip).
vec3 neutral(vec3 c) {
  const float startCompression = 0.8 - 0.04;
  const float desaturation = 0.15;
  float x = min(c.r, min(c.g, c.b));
  float offset = x < 0.08 ? x - 6.25 * x * x : 0.04;
  c -= offset;
  float peak = max(c.r, max(c.g, c.b));
  if (peak < startCompression) return c;
  const float d = 1. - startCompression;
  float newPeak = 1. - d * d / (peak + d - startCompression);
  c *= newPeak / peak;
  float g = 1. - 1. / (desaturation * (peak - newPeak) + 1.);
  return mix(c, vec3(newPeak), g);
}
float ign(vec2 p) { return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }
void main() {
  vec3 c = texture2D(tScene, vUv).rgb + texture2D(tBloom, vUv).rgb * uBloom;
  c *= uExposure;
  c = neutral(c);
  // Grade: cool lifted shadows, warm highlights, gentle saturation.
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c = c + uLift * (1. - smoothstep(0., 0.35, l)) ;
  c *= mix(vec3(1.), uGain, smoothstep(0.25, 0.9, l));
  c = mix(vec3(l), c, uSat);
  vec2 q = vUv - 0.5;
  q.x *= uRes.x / uRes.y;
  c *= 1. - uVignette * smoothstep(0.25, 0.85, length(q * vec2(1.25, 0.95)));
  // A darker crown: the vault frames the view, the eye falls to the lit middle.
  c *= 1. - 0.22 * smoothstep(0.62, 1.0, vUv.y);
  c = clamp(c, 0., 1.);
  c = mix(c * 12.92, 1.055 * pow(c, vec3(1. / 2.4)) - 0.055, step(0.0031308, c));
  // Triangular dither (+-1 LSB) against banding in the fog gradients.
  float n = ign(gl_FragCoord.xy) + ign(gl_FragCoord.xy + 17.3) - 1.;
  c += n / 255.;
  gl_FragColor = vec4(c, 1.);
}
`;
