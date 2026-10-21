// The shared lighting chunk of DEEP DOWN (W1-LEAD §4; owner 1E). Every lit surface of the game (the voxel world, the
// face, props, crystals, the viewmodel) builds a `Surface` and calls `shade()`. Materials never compute lighting
// themselves: one GLSL light model, one set of shared uniforms, one rig (`LightRig`) that drives them.
//
// THE SEAM (1C ↔ 1E, published at 0:45; it only grows):
//
//   import { LIGHTING_GLSL, lightingUniforms } from '../light/chunk';
//   const mat = new THREE.ShaderMaterial({
//     uniforms: { ...lightingUniforms(), tAlbedo: { value: tex } },     // shared IUniform objects: never clone the material
//     vertexShader: VERT,                                              // pass the world position and normals as varyings
//     fragmentShader: `${LIGHTING_GLSL}
//       varying vec3 vWorld; varying vec3 vNormal;
//       void main() {
//         vec3 ng = normalize(vNormal);
//         Surface s = surfaceInit(albedo, n);   // linear albedo, the normal-mapped world normal
//         s.geoNormal = ng;                     // the geometric normal (bias, offsets)
//         s.roughness = r; s.metal = m; s.ao = vertexAo; s.emission = e; s.wet = w; s.sss = k; s.sssColor = c;
//         vec3 V = normalize(cameraPosition - vWorld);
//         vec3 col = shade(s, vWorld, V);
//         gl_FragColor = lightOut(col, vWorld);  // fog when the volumetric pass is off, the AO weight in alpha, encode
//       }`,
//   });
//
// Rules for materials:
// - Opaque world materials write `lightOut()` exactly (its alpha carries the share of indirect light, which the GTAO
//   composite occludes). Additive and transparent materials may write any alpha: they are never occluded by GTAO.
// - The viewmodel pass gives shade() world positions too (viewmodel-space point × the world camera's matrixWorld).
// - Cheap paths: `shadeDiffuse(albedo, n, p)` (particles, shards: no shadow, no specular) and `lightFog(col, p)` (glow
//   cards, emissive sprites).
// - Uniform names are prefixed `uL_` (they never collide with the old `lighting.ts` chunk; a material includes one).
//
// What the stack does around shade() (no material code needed): the lantern's soft cube shadow (refreshed only when it
// moves or invalidateShadows() is called), one shadowed practical on High, the LightField as irradiance, an L1 SH probe
// per space (setAmbient), the chamber's reflection probe (captureProbe(), or on its own once the eye rests in a new
// space), GTAO on the indirect share, the volumetric fog, AgX + the biome LUT, and a hued dark floor (darks ≥ 0.04).
//
// Units: radiance is linear HDR. A light's colour × intensity is its radiance at normal incidence on a white Lambert
// surface; `shade()` multiplies by albedo (diffuse) and by GGX (specular). The post chain tone-maps (AgX) and grades.

export { LightRig } from './rig';
export type { LanternInput, LampInput, AmbientInput, FogInput, IrradianceSource, ShaftInput } from './rig';

export { MAX_PRACTICALS, LIGHT_UNIFORMS, lightingUniforms } from './uniforms';
export type { LightingUniformSet } from './uniforms';
import { MAX_PRACTICALS } from './uniforms';

/** Debug views (uL_Frame.z): what a capture can isolate. */
export const LIGHT_DEBUG = { none: 0, shadow: 1, irradiance: 2, ambient: 3, direct: 4, albedo: 5 } as const;

/**
 * The GLSL lighting chunk: uniforms, `struct Surface`, `surfaceInit()`, `shade()`, `shadeDiffuse()`, `lightFog()`,
 * `lightOut()`. Include it once at the top of a fragment shader (GLSL ES 3.00 through three's ShaderMaterial).
 */
export const LIGHTING_GLSL = /* glsl */ `
// ---------------------------------------------------------------- DEEP DOWN light chunk (1E) ----
#define L_PI 3.14159265
#define L_MAX_PRAC ${MAX_PRACTICALS}
const vec3 L_LUM = vec3(0.2126, 0.7152, 0.0722);

struct Surface {
  vec3 albedo;     // linear base colour (metals: their F0 tint)
  vec3 normal;     // world shading normal (normal-mapped), unit
  vec3 geoNormal;  // world geometric normal, unit (shadow bias, volume offsets, the terminator guard)
  float roughness; // perceptual 0..1
  float metal;     // 0..1
  float ao;        // baked AO 0..1 (1 = open)
  vec3 emission;   // linear HDR, added unlit
  float wet;       // 0..1: darker, glossier, reflects the chamber probe
  float sss;       // 0..1: light through the body (crystals, roots, ice)
  vec3 sssColor;   // its tint (refraction-lite)
  float specCap;   // the most direct specular radiance (0 = the lantern's cap)
};

Surface surfaceInit(vec3 albedo, vec3 n) {
  Surface s;
  s.albedo = albedo;
  s.normal = n;
  s.geoNormal = n;
  s.roughness = 0.8;
  s.metal = 0.0;
  s.ao = 1.0;
  s.emission = vec3(0.0);
  s.wet = 0.0;
  s.sss = 0.0;
  s.sssColor = albedo;
  s.specCap = 0.0;
  return s;
}

uniform vec4 uL_Lantern;
uniform vec4 uL_LanternColor;
uniform vec4 uL_LanternShape;
uniform vec3 uL_LanternDeep;
uniform samplerCube uL_ShadowA;
uniform vec4 uL_ShadowAPos;
uniform vec4 uL_ShadowAParams;
uniform vec3 uL_Wobble;
uniform samplerCube uL_ShadowB;
uniform vec4 uL_ShadowBPos;
uniform vec4 uL_ShadowBParams;
uniform vec4 uL_PracPos[L_MAX_PRAC];
uniform vec4 uL_PracCol[L_MAX_PRAC];
uniform int uL_PracCount;
uniform vec4 uL_Spot;
uniform vec3 uL_SpotColor;
uniform highp sampler3D uL_Irr;
uniform vec3 uL_IrrOrigin;
uniform vec3 uL_IrrInvSize;
uniform vec4 uL_IrrParams;
uniform vec3 uL_SH[4];
uniform vec4 uL_Ambient;
uniform vec4 uL_Rim;
uniform vec3 uL_RimColor;
uniform samplerCube uL_Probe;
uniform vec4 uL_ProbeParams;
uniform vec3 uL_ProbePos;
uniform vec3 uL_ProbeBoxMin;
uniform vec3 uL_ProbeBoxMax;
uniform vec4 uL_Shaft[2];
uniform vec4 uL_ShaftDir[2];
uniform vec4 uL_ShaftCol[2];
uniform int uL_ShaftCount;
uniform vec3 uL_FogColor;
uniform vec4 uL_Fog;
uniform vec4 uL_Frame;
uniform float uSceneEncode;

// Written by shade(): the indirect radiance of this fragment (ambient, bounce, rim, probe), which GTAO occludes.
vec3 gL_Indirect = vec3(0.0);
// Written by shade(): the lantern's shadow factor at this fragment (debug view and tests).
float gL_Shadow = 1.0;

// Interleaved gradient noise (Jimenez 2014): a stable per-pixel rotation, never animated (stillness).
float L_ign(vec2 p) { return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }

// ---- BRDF: GGX (Trowbridge-Reitz), height-correlated Smith visibility, Schlick Fresnel; Burley diffuse. ----
float L_D(float nh, float a) {
  float a2 = a * a;
  float d = nh * nh * (a2 - 1.0) + 1.0;
  return a2 / (L_PI * d * d);
}
float L_V(float nv, float nl, float a) {
  float gv = nl * (nv * (1.0 - a) + a);
  float gl = nv * (nl * (1.0 - a) + a);
  return 0.5 / max(gv + gl, 1e-5);
}
vec3 L_F(vec3 f0, float vh) {
  float f = pow(1.0 - vh, 5.0);
  return f0 + (1.0 - f0) * f;
}
float L_Burley(float nv, float nl, float lh, float rough) {
  float f90 = 0.5 + 2.0 * rough * lh * lh;
  float ls = 1.0 + (f90 - 1.0) * pow(1.0 - nl, 5.0);
  float vs = 1.0 + (f90 - 1.0) * pow(1.0 - nv, 5.0);
  return ls * vs;
}
// Karis' analytic environment BRDF (mobile): the split-sum scale and bias without a LUT.
vec3 L_EnvBRDF(vec3 f0, float rough, float nv) {
  const vec4 c0 = vec4(-1.0, -0.0275, -0.572, 0.022);
  const vec4 c1 = vec4(1.0, 0.0425, 1.04, -0.04);
  vec4 r = rough * c0 + c1;
  float a004 = min(r.x * r.x, exp2(-9.28 * nv)) * r.x + r.y;
  vec2 ab = vec2(-1.04, 1.04) * a004 + r.zw;
  return f0 * ab.x + ab.y;
}

// The shading inputs every light shares (filled once by shade()).
struct LCtx {
  vec3 p;
  vec3 n;
  vec3 ng;
  vec3 V;
  float nv;
  vec3 diffC;
  vec3 f0;
  float rough;
  float a;
  float wrap;
  float cap;
  float sss;
  vec3 sssColor;
};

// One direct light of radiance Li from direction L: wrapped Burley diffuse + capped GGX specular + translucency.
vec3 L_direct(LCtx c, vec3 L, vec3 Li) {
  float nlRaw = dot(c.n, L);
  // The terminator guard: normal maps never light a face whose geometry is turned away.
  float geo = clamp(dot(c.ng, L) * 4.0 + 0.6, 0.0, 1.0);
  float nl = clamp(nlRaw, 0.0, 1.0);
  // Energy-conserving wrap (soft stone, lifted terminators).
  float nlw = clamp((nlRaw + c.wrap) / ((1.0 + c.wrap) * (1.0 + c.wrap)), 0.0, 1.0);
  vec3 H = normalize(L + c.V);
  float nh = clamp(dot(c.n, H), 0.0, 1.0);
  float lh = clamp(dot(L, H), 0.0, 1.0);
  vec3 F = L_F(c.f0, lh);
  vec3 diff = c.diffC * (1.0 - F) * L_Burley(c.nv, max(nl, 1e-3), lh, c.rough) * nlw;
  vec3 spec = F * (L_D(nh, c.a) * L_V(c.nv, max(nl, 1e-3), c.a) * L_PI * nl);
  // Translucency: light that enters the back of a thin body and leaves tinted (crystals, roots).
  vec3 trans = c.sssColor * (c.sss * pow(clamp(dot(c.V, -L), 0.0, 1.0), 2.0) * 0.6 + c.sss * 0.25 * clamp(-nlRaw, 0.0, 1.0));
  // The specular is value-capped as radiance: ore and metal glints sparkle into the bloom, never blow out.
  return Li * (diff * geo + trans) + min(Li * spec * geo, vec3(c.cap));
}

// ---- the lantern's cube shadow: normal offset + slope bias, a 4-tap blocker search (contact hardening), rotated
// Vogel PCF of 8 or 16 taps. Distances are stored as dist / far from the render origin.
const vec2 L_VOGEL[16] = vec2[16](
  vec2(0.1768, 0.0000), vec2(-0.2234, 0.2047), vec2(0.0338, -0.3936), vec2(0.2927, 0.3598),
  vec2(-0.5232, -0.0833), vec2(0.4796, -0.3207), vec2(-0.1502, 0.6072), vec2(-0.3430, -0.5620),
  vec2(0.6827, 0.2241), vec2(-0.6886, 0.3075), vec2(0.2990, -0.7319), vec2(0.2846, 0.7839),
  vec2(-0.7856, -0.3707), vec2(0.8641, -0.2349), vec2(-0.4553, 0.8296), vec2(-0.2128, -0.9764));

float L_cubeShadow(samplerCube tex, vec4 org, vec4 prm, vec3 p, vec3 ng, vec3 wob) {
  float far = org.w;
  if (far <= 0.0) return 1.0;
  vec3 toP = p - org.xyz;
  float d0 = length(toP);
  if (d0 >= far * 0.98 || d0 < 1e-3) return 1.0;
  vec3 dir0 = toP / d0;
  float nl = clamp(dot(ng, -dir0), 0.0, 1.0);
  float texel = prm.x * d0;
  // Normal offset: out along the geometric normal by ~1.5 texels, more at grazing angles (no acne, no peter-panning).
  vec3 po = p + ng * (texel * prm.w * (0.6 + 1.4 * (1.0 - nl)));
  vec3 v = po - org.xyz;
  float dp = length(v);
  vec3 dir = normalize(v - wob);
  float slope = sqrt(max(1.0 - nl * nl, 0.0)) / max(nl, 0.2);
  float bias = texel * (0.5 + 1.2 * slope) + 0.004 * dp;
  vec3 t1 = normalize(cross(dir, abs(dir.y) < 0.9 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0)));
  vec3 t2 = cross(dir, t1);
  float ang = L_ign(gl_FragCoord.xy) * 6.2831853;
  float ca = cos(ang), sa = sin(ang);
  float lightSize = prm.y;
  // Blocker search over the light's cone (assume a blocker halfway): 4 taps.
  float rs = clamp(lightSize / max(dp, 0.2), prm.x * 2.0, 0.12);
  float blockSum = 0.0;
  float blockN = 0.0;
  for (int i = 0; i < 4; i++) {
    vec2 o = L_VOGEL[i * 4 + 1];
    o = vec2(o.x * ca - o.y * sa, o.x * sa + o.y * ca) * rs;
    float s = texture(tex, dir + t1 * o.x + t2 * o.y).r * far;
    if (s < dp - bias) { blockSum += s; blockN += 1.0; }
  }
  if (blockN < 0.5) return 1.0;
  float db = blockSum / blockN;
  // Penumbra (angular, as seen from the light): sharp at contact, softer with the gap.
  float rp = clamp(lightSize * (dp - db) / max(db * dp, 1e-3) * 0.5, prm.x * 1.25, 0.06);
  int taps = int(prm.z + 0.5);
  float lit = 0.0;
  float n = 0.0;
  float k = 1.0 / max(texel * 1.5, 0.004);
  for (int i = 0; i < 16; i++) {
    if (i >= taps) break;
    vec2 o = L_VOGEL[taps < 16 ? i * 2 : i];
    o = vec2(o.x * ca - o.y * sa, o.x * sa + o.y * ca) * rp;
    float s = texture(tex, dir + t1 * o.x + t2 * o.y).r * far;
    lit += clamp((s - dp + bias) * k + 0.5, 0.0, 1.0);
    n += 1.0;
  }
  // Fade to unshadowed at the end of the shadow range.
  return mix(lit / max(n, 1.0), 1.0, smoothstep(far * 0.8, far * 0.98, d0));
}

// ---- the irradiance volume (1B's LightField) and the ambient probe ----
vec4 L_irrFetch(vec3 q) {
  vec4 l = texture(uL_Irr, (q - uL_IrrOrigin) * uL_IrrInvSize);
  return vec4(pow(l.rgb, vec3(uL_IrrParams.y)) * uL_IrrParams.x, l.a);
}
// Coloured soft bounce at p: two trilinear taps out along the normal (the far one biased toward light in front).
vec3 L_irradiance(vec3 p, vec3 ng, vec3 n, out float open) {
  open = 1.0;
  if (uL_IrrParams.w < 0.5) return vec3(0.0);
  vec4 a = L_irrFetch(p + ng * uL_IrrParams.z);
  vec4 b = L_irrFetch(p + ng * (uL_IrrParams.z * 2.5) + n * 0.25);
  open = a.a;
  float ma = dot(a.rgb, L_LUM);
  float mb = dot(b.rgb, L_LUM);
  // Light growing away from the face arrives from in front of it (up to 1.4x); light fading away only wraps (0.5x).
  float facing = ma < 1e-4 ? 1.0 : clamp(1.0 + 1.6 * (mb - ma) / ma, 0.5, 1.4);
  return mix(a.rgb, b.rgb, 0.5) * facing;
}
vec3 L_sh(vec3 n) {
  return max(uL_SH[0] + uL_SH[1] * n.x + uL_SH[2] * n.y + uL_SH[3] * n.z, vec3(0.0));
}

// ---- the lantern ----
float L_lanternAtt(float d) {
  float s = uL_LanternShape.x;
  float att = 1.0 / (1.0 + d * d / (s * s));
  float w = clamp(1.0 - pow(d / max(uL_LanternColor.w, 0.5), 4.0), 0.0, 1.0);
  return att * w * w;
}
// The core colour deepening to amber with distance (luminance kept), SPEC §8.3.
vec3 L_lanternTint(float d) {
  vec3 core = uL_LanternColor.rgb;
  float lc = dot(core, L_LUM);
  vec3 deep = uL_LanternDeep / max(dot(uL_LanternDeep, L_LUM), 1e-4) * lc;
  return mix(core, deep, smoothstep(0.35, uL_LanternShape.w, d));
}

// A light shaft at p: the cylinder's soft cross-section times a fade at both ends of its length (0..1).
float L_shaftAt(int i, vec3 p) {
  vec4 a = uL_Shaft[i];
  vec4 d = uL_ShaftDir[i];
  vec3 v = p - a.xyz;
  float t = dot(v, d.xyz);
  if (t < 0.0 || t > d.w) return 0.0;
  float r = length(v - d.xyz * t);
  float soft = clamp(uL_ShaftCol[i].w, 0.05, 1.0);
  return (1.0 - smoothstep(a.w * (1.0 - soft), a.w, r)) * smoothstep(0.0, 0.6, t) * (1.0 - smoothstep(d.w * 0.85, d.w, t));
}

// Box-projected probe direction (a parallax-corrected cube: reflections sit on the chamber's walls).
vec3 L_probeDir(vec3 p, vec3 R) {
  if (uL_ProbeParams.w < 0.5) return R;
  vec3 r = R + vec3(1e-5);
  vec3 f = (uL_ProbeBoxMax - p) / r;
  vec3 b = (uL_ProbeBoxMin - p) / r;
  vec3 m = max(f, b);
  float t = min(min(m.x, m.y), m.z);
  return p + R * max(t, 0.0) - uL_ProbePos;
}

// ---- the light model ----
vec3 shade(Surface s, vec3 p, vec3 V) {
  LCtx c;
  float wet = clamp(s.wet, 0.0, 1.0);
  vec3 albedo = s.albedo * mix(1.0, 0.62, wet * (1.0 - s.metal));
  c.p = p;
  c.n = normalize(s.normal);
  c.ng = normalize(s.geoNormal);
  c.V = V;
  c.nv = clamp(abs(dot(c.n, V)), 1e-3, 1.0);
  // Specular antialiasing: widen the lobe where the normal changes fast on screen (no sparkle at distance).
  float rough = mix(s.roughness, 0.1, wet);
  vec3 dn = fwidth(c.ng);
  rough = clamp(max(rough, length(dn) * 1.1), 0.06, 1.0);
  c.rough = rough;
  c.a = rough * rough;
  c.diffC = albedo * (1.0 - s.metal);
  c.f0 = mix(vec3(0.04), s.albedo, s.metal);
  c.wrap = 0.2 + 0.15 * (1.0 - s.metal);
  c.cap = s.specCap > 0.0 ? s.specCap : uL_LanternShape.z;
  c.sss = s.sss;
  c.sssColor = s.sssColor;

  // Indirect: the chamber's ambient probe, the LightField bounce, the rim.
  float open;
  vec3 irr = L_irradiance(p, c.ng, c.n, open);
  float openK = mix(1.0 - uL_Ambient.y, 1.0, smoothstep(0.08, 0.7, open));
  vec3 amb = (L_sh(c.n) * openK + irr) * uL_Ambient.x;
  vec3 indirect = c.diffC * amb * s.ao;
  if (uL_Rim.w > 0.5) {
    float rim = clamp(dot(c.n, uL_Rim.xyz), 0.0, 1.0) * (0.3 + 0.7 * pow(1.0 - c.nv, 2.0));
    indirect += albedo * uL_RimColor * rim * openK * s.ao;
  }
  // Specular ambient: the probe on wet stone, metal and crystal; elsewhere a dim SH glint.
  vec3 R = reflect(-V, c.n);
  vec3 env;
  if (uL_ProbeParams.x > 0.5) env = textureLod(uL_Probe, L_probeDir(p, R), rough * uL_ProbeParams.y).rgb * uL_ProbeParams.z;
  else env = L_sh(R) * openK;
  float specOcc = clamp(pow(c.nv + s.ao, exp2(-16.0 * c.a - 1.0)) - 1.0 + s.ao, 0.0, 1.0);
  indirect += env * L_EnvBRDF(c.f0, rough, c.nv) * specOcc * uL_Ambient.w * mix(1.0, 2.2, wet);

  // Direct: the lantern (shadowed), the practicals (one may be shadowed), the Lantern Raise spot.
  vec3 direct = vec3(0.0);
  if (uL_Lantern.w > 0.5) {
    vec3 Lv = uL_Lantern.xyz - p;
    float d = length(Lv);
    float att = L_lanternAtt(d);
    if (att > 1e-4) {
      vec3 L = Lv / d;
      // The fuel tank shades the steep cone below the flame (L points up from a surface below it): the pool is a warm
      // ring on the way ahead, not a white disc at the feet.
      float tank = 1.0 - uL_LanternShape.y * smoothstep(0.6, 0.92, L.y);
      // The hood over the chimney shades the steep cone above: the vault stays a dark crown that frames the view.
      tank *= 1.0 - 0.55 * smoothstep(0.55, 0.95, -L.y);
      float sh = L_cubeShadow(uL_ShadowA, uL_ShadowAPos, uL_ShadowAParams, p, c.ng, uL_Wobble);
      gL_Shadow = sh;
      direct += L_direct(c, L, L_lanternTint(d) * (att * tank * sh));
    }
  }
  for (int i = 0; i < L_MAX_PRAC; i++) {
    if (i >= uL_PracCount) break;
    vec4 pp = uL_PracPos[i];
    vec4 pc = uL_PracCol[i];
    vec3 Lv = pp.xyz - p;
    float d2 = dot(Lv, Lv);
    float r2 = pp.w * pp.w;
    if (d2 >= r2) continue;
    float d = sqrt(d2);
    float x = d2 / r2;
    float win = 1.0 - x * x;
    float att = win * win / (1.0 + d2 / 0.49);
    float sh = pc.w > 0.5 ? L_cubeShadow(uL_ShadowB, uL_ShadowBPos, uL_ShadowBParams, p, c.ng, vec3(0.0)) : 1.0;
    direct += L_direct(c, Lv / max(d, 1e-3), pc.rgb * (att * sh));
  }
  for (int i = 0; i < 2; i++) {
    if (i >= uL_ShaftCount) break;
    float k = L_shaftAt(i, p);
    if (k > 0.0) direct += L_direct(c, -uL_ShaftDir[i].xyz, uL_ShaftCol[i].rgb * k);
  }
  if (uL_Spot.w > 0.0) {
    vec3 Lv = uL_Spot.xyz - p;
    float d2 = dot(Lv, Lv);
    float r2 = uL_Spot.w * uL_Spot.w;
    if (d2 < r2) {
      float x = d2 / r2;
      float win = (1.0 - x) * (1.0 - x);
      direct += L_direct(c, Lv * inversesqrt(max(d2, 1e-4)), uL_SpotColor * win);
    }
  }
  gL_Indirect = indirect;
  int dbg = int(uL_Frame.z + 0.5);
  if (dbg == 1) return vec3(gL_Shadow);
  if (dbg == 2) return irr;
  if (dbg == 3) return indirect;
  if (dbg == 4) return direct;
  if (dbg == 5) return s.albedo;
  if (dbg == 6 && uL_ShadowAPos.w > 0.0) {
    // The raw cube lookup against the true distance: grey = equal, white = the cube sees farther, black = nearer.
    vec3 tp = p - uL_ShadowAPos.xyz;
    float st = texture(uL_ShadowA, tp).r * uL_ShadowAPos.w;
    return vec3(clamp((st - length(tp)) * 0.5 + 0.5, 0.0, 1.0), clamp(st / 14.0, 0.0, 1.0), 0.0);
  }
  return indirect + direct + s.emission;
}

// Particles, shards, dust: the lantern (unshadowed), the ambient probe and the bounce; no specular.
vec3 shadeDiffuse(vec3 albedo, vec3 n, vec3 p) {
  float open;
  vec3 irr = L_irradiance(p, n, n, open);
  vec3 col = albedo * (L_sh(n) + irr) * uL_Ambient.x;
  if (uL_Lantern.w > 0.5) {
    vec3 Lv = uL_Lantern.xyz - p;
    float d = length(Lv);
    col += albedo * L_lanternTint(d) * (L_lanternAtt(d) * clamp(dot(n, Lv / max(d, 1e-3)) * 0.7 + 0.3, 0.0, 1.0));
  }
  gL_Indirect = vec3(0.0);
  return col;
}

// Analytic fog (exponential + height), with the lantern's glow in the air in closed form. The volumetric pass replaces
// it on Balanced and High (uL_Frame.y = 1).
vec3 lightFog(vec3 col, vec3 p) {
  if (uL_Frame.y > 0.5) return col;
  vec3 dv = p - cameraPosition;
  float dist = length(dv);
  vec3 dir = dv / max(dist, 1e-4);
  float hy = 0.5 * (p.y + cameraPosition.y) - uL_Fog.y;
  float sigma = uL_Fog.x + uL_Fog.w * exp(-max(hy, 0.0) * uL_Fog.z);
  float tr = exp(-sigma * dist);
  vec3 outc = col * tr + uL_FogColor * (1.0 - tr);
  if (uL_Lantern.w > 0.5) {
    vec3 lc = uL_Lantern.xyz - cameraPosition;
    float t0 = dot(lc, dir);
    float h2 = max(dot(lc, lc) - t0 * t0, 0.0);
    float s2 = uL_LanternShape.x * uL_LanternShape.x;
    float k = sqrt(s2 + h2);
    // Clear air in the first metre (no veil on the lens), as the volumetric pass does; the same scatter weight.
    float T = min(dist, uL_LanternColor.w);
    float t1 = min(1.0, T);
    float glow = s2 / k * (atan((T - t0) / k) - atan((t1 - t0) / k));
    outc += uL_LanternColor.rgb * glow * sigma * 0.16;
  }
  return outc;
}

// The final write of a lit opaque fragment: fog (when the volumetric pass is off), the indirect share in alpha for the
// GTAO composite (alpha 1 = nothing to occlude), and the 8-bit fallback encoding.
vec4 lightOut(vec3 col, vec3 p) {
  float lum = dot(col, L_LUM);
  float ind = clamp(dot(gL_Indirect, L_LUM) / max(lum, 1e-5), 0.0, 1.0);
  col = lightFog(col, p);
  col = uSceneEncode > 0.5 ? sqrt(col / (1.0 + col)) : col;
  return vec4(col, 1.0 - ind);
}
// ---------------------------------------------------------------- end of the light chunk ----
`;
