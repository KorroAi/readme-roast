import * as THREE from 'three';
import { BLOCKS, SIDE_VARIANTS, VARIANT_COUNT } from '../config/blocks';
import { CRACK_FIRST_LAYER, CRACK_STAGES, TILE_NAMES, TILE_SIZE } from '../config/tiles';
import { LIGHTING_GLSL, type LightingUniforms } from './lighting';
import { BASE_LAYER_COUNT, FAMILY, GEO_SIDE_OF, GEO_TOP_OF, MAT, MATERIAL_NAMES, type MaterialName } from './materials';

/** Round 3: the biome metal and resin ores (their tall texels glint as metal). */
const METAL_LAYERS: readonly MaterialName[] = ['goldVein', 'silverVein', 'frostIron', 'orichalcum', 'starsteel', 'runegold', 'pearlOre', 'amberOre', 'sapAmber'];
import { courseGlsl } from './materials/courses';
import { MAT_DENSITY, MAT_SIZE } from './materials/paint';
import { AO_SCALE, OFFSET_RANGE } from './mesher';
import type { TerrainUniforms } from './terrainRig';
import type { TileAtlas } from './textures';
import { DETAIL_UNIFORM, detailGlsl } from './detail';
import { HI_SIZE, MAT_GLOW_GLSL } from './terrainRig';

/** Builds the sRGB texture array from the procedural tiles, with mipmaps for distant faces. */
export function createTileTexture(atlas: TileAtlas): THREE.DataArrayTexture {
  const tex = new THREE.DataArrayTexture(atlas.data, TILE_SIZE, TILE_SIZE, atlas.layers);
  tex.format = THREE.RGBAFormat;
  tex.type = THREE.UnsignedByteType;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.unpackAlignment = 1;
  tex.needsUpdate = true;
  return tex;
}

/** Emissive strength per texture layer, derived from the block definitions that use it. */
export function tileGlowTable(): number[] {
  const glow = new Array(TILE_NAMES.length).fill(0);
  for (const b of BLOCKS) {
    if (!b || !b.visible) continue;
    const variants = Array.from({ length: VARIANT_COUNT[b.id] }, (_, i) => SIDE_VARIANTS[b.id * 4 + i]);
    for (const t of [b.tiles.top, b.tiles.side, b.tiles.bottom, ...variants]) glow[t] = Math.max(glow[t], b.glow);
  }
  return glow;
}

const vertex = /* glsl */ `
// One interleaved 16-byte vertex (render/mesher.ts): the mesher sculpts on the CPU, once per
// chunk, so the vertex stage only decodes. No texture fetches here.
in vec4 aGeo;   // lattice corner xyz (chunk-local), octahedral normal x (0..254, 127 = 0)
in vec4 aData;
in vec4 aNb;
in vec4 aShape; // sculpted offset xyz (128 = 0), octahedral normal y
out vec3 vGrid;
out vec3 vNormal;
flat out vec4 vNb;
flat out int vFlags;
out vec3 vWorldPos;
out vec2 vUv;
out float vAo;
out float vDepth;
flat out int vFace;
flat out float vLayer;

const float OFF_STEP = ${OFFSET_RANGE.toFixed(4)} / 127.0;

vec3 octDecode(vec2 e) {
  vec3 v = vec3(e, 1.0 - abs(e.x) - abs(e.y));
  if (v.z < 0.0) v.xy = (1.0 - abs(v.yx)) * vec2(v.x >= 0.0 ? 1.0 : -1.0, v.y >= 0.0 ? 1.0 : -1.0);
  return normalize(v);
}

void main() {
  vec4 g = modelMatrix * vec4(aGeo.xyz, 1.0);
  vGrid = g.xyz;
  vFace = int(aData.x + 0.5);
  vAo = aData.y * (1.0 / ${AO_SCALE}.0); // 0..3, fractional on natural rock
  vLayer = aData.z;
  int bits = int(aData.w + 0.5);
  vUv = vec2(float(bits & 1), 1.0 - float((bits >> 1) & 1));
  vFlags = bits >> 4; // family (2 bits) | rune << 2
  vNb = aNb;
  // Smooth shading normal from the mesher (chunks are only translated: no normal matrix).
  vNormal = octDecode((vec2(aGeo.w, aShape.w) - 127.0) * (1.0 / 127.0));
  // Crack-free sculpting: the offset is a pure function of the lattice point's world position
  // and the 8 voxels around it, identical in every face and chunk that shares the vertex.
#ifdef NO_DISP
  vec3 off = vec3(0.0);
#else
  vec3 off = (aShape.xyz - 128.0) * OFF_STEP;
#endif
  vec4 wp = vec4(g.xyz + off, 1.0);
  vWorldPos = wp.xyz;
  vec4 mv = viewMatrix * wp;
  vDepth = length(mv.xyz);
  gl_Position = projectionMatrix * mv;
}
`;

const fragment = /* glsl */ `
precision highp float;
precision highp sampler2DArray;
precision highp sampler3D;
${LIGHTING_GLSL}
uniform sampler2DArray uMat;
uniform sampler3D uNoise;
${MAT_GLOW_GLSL}
uniform vec4 uTarget;   // xyz = cell being mined, w = crack tile layer (< 0: none)
uniform vec4 uTargetFx; // x = impact flash, y = actively mining, z = too hard
uniform vec4 uTargetHit; // xyz = where the mining ray hits the block, w = 1 when known
uniform sampler2DArray uDetail; // HD stone (render/detail.ts): rg normal, b height, a tone
${detailGlsl(MATERIAL_NAMES)}
// Rarity highlights (render/highlight.ts): a ${HI_SIZE}^3 byte volume of cell codes around the eye
// (0 air, 1 plain solid, 2..6 common..legendary), the selected cell and the rarity colours.
uniform highp sampler3D uHiTex;
uniform vec4 uHiOrigin;
uniform vec4 uHiSel;
uniform vec4 uHiFx;
uniform vec3 uHiCol[5];
uniform vec4 uHiView;
uniform vec4 uSonar;   // xyz origin, w the shell's radius now (render/sonar.ts)
uniform vec4 uSonarFx; // x band width, y strength (0 off), z full radius
uniform vec3 uSonarTint; // the shell's colour (the sonar's pale gold; the Heart's rose, then gold)
int hiCode(ivec3 c) {
  ivec3 l = c - ivec3(uHiOrigin.xyz);
  if (uHiOrigin.w < 0.5 || any(lessThan(l, ivec3(0))) || any(greaterThan(l, ivec3(${HI_SIZE - 1})))) return 0;
  return int(texelFetch(uHiTex, l, 0).r * 255.0 + 0.5);
}

in vec3 vGrid;
in vec3 vNormal;
flat in vec4 vNb;
flat in int vFlags;
in vec3 vWorldPos;
in vec2 vUv;
in float vAo;
in float vDepth;
flat in int vFace;
flat in float vLayer;
layout(location = 0) out highp vec4 fragColor;

const vec3 FACE_N[6] = vec3[](vec3(1,0,0), vec3(-1,0,0), vec3(0,1,0), vec3(0,-1,0), vec3(0,0,1), vec3(0,0,-1));
const float MAT_PERIOD = ${MAT_SIZE / MAT_DENSITY}.0;

// World-space projection per face axis, upright and unmirrored as seen from outside.
vec2 worldUv(vec3 p, int face) {
  vec2 uv;
  if (face == 0) uv = vec2(-p.z, -p.y);
  else if (face == 1) uv = vec2(p.z, -p.y);
  else if (face == 2) uv = vec2(p.x, p.z);
  else if (face == 3) uv = vec2(p.x, -p.z);
  else if (face == 4) uv = vec2(p.x, -p.y);
  else uv = vec2(-p.x, -p.y);
  return uv / MAT_PERIOD;
}

// Sharp bilinear (texel-snapped bilinear magnification, uMat is linear-filtered): inside a texel
// the sample stays on the texel centre and it crosses to the next texel over max(one screen pixel,
// soft texels). Pixel art keeps crisp texel edges at reading distance, without the shimmer of raw
// nearest sampling and without 10-15 px hard-edged blocks right in front of the lens. The
// gradients are the continuous ones, so mip selection is unchanged.
// soft < 0: adaptive, -soft x screen pixels per texel (clamped to 0.15-0.55 texels), so rock
// stays crisp at reading distance and softens only when a texel grows past ~8 px near the lens.
vec2 sharpUv(vec2 uv, vec2 gx, vec2 gy, float soft) {
  vec2 t = uv * ${MAT_SIZE}.0;
  vec2 c = floor(t + 0.5);
  vec2 fw = (abs(gx) + abs(gy)) * ${MAT_SIZE}.0;
  vec2 s = soft >= 0.0 ? vec2(soft) : clamp(-soft / max(fw, vec2(1e-4)), 0.15, 0.55);
  vec2 w = max(fw, s);
  // HD: once a texel spans more than ~3 px (first person, arm's length) its steps would read as
  // blocks, so the sample eases into plain bilinear; the detail layer carries the form there.
  w = mix(w, vec2(1.0), smoothstep(2.5, 6.0, 1.0 / max(max(fw.x, fw.y), 1e-4)));
  return (c + clamp((t - c) / w, -0.5, 0.5)) * (1.0 / ${MAT_SIZE}.0);
}

// HD stone detail in world space (render/detail.ts), matching the material projections: xyz is the
// bend of the shading normal in world space (from the layer's tangent normal), w its tone.
vec4 dTex(vec2 m, int l) { return texture(uDetail, vec3(m * DETAIL_INV, float(l))); }
vec4 detailTop(vec3 p, float s, int l) {
  vec4 d = dTex(vec2(p.x, p.z * s), l);
  vec2 t = d.xy * 2.0 - 1.0;
  return vec4(t.x, 0.0, t.y * s, d.w);
}
vec4 detailSide(vec3 p, vec3 n, int l) {
  float sx = n.x >= 0.0 ? 1.0 : -1.0;
  float sz = n.z >= 0.0 ? 1.0 : -1.0;
  vec2 w = n.xz * n.xz;
  w *= w;
  float tz = w.y / max(w.x + w.y, 1e-6);
  float wa = tz < 0.03 ? 0.0 : (tz > 0.97 ? 1.0 : tz);
  vec4 r = vec4(0.0);
  if (wa < 1.0) {
    vec4 d = dTex(vec2(-p.z * sx, -p.y), l);
    vec2 t = d.xy * 2.0 - 1.0;
    r += vec4(0.0, -t.y, -sx * t.x, d.w) * (1.0 - wa);
  }
  if (wa > 0.0) {
    vec4 d = dTex(vec2(p.x * sz, -p.y), l);
    vec2 t = d.xy * 2.0 - 1.0;
    r += vec4(sz * t.x, -t.y, 0.0, d.w) * wa;
  }
  return r;
}
vec4 detailFace(vec3 p, int face, int l) {
  vec4 d = dTex(worldUv(p, face) * MAT_PERIOD, l);
  vec2 t = d.xy * 2.0 - 1.0;
  vec3 T = face == 0 ? vec3(0.0, 0.0, -1.0) : face == 1 ? vec3(0.0, 0.0, 1.0) : face == 5 ? vec3(-1.0, 0.0, 0.0) : vec3(1.0, 0.0, 0.0);
  vec3 B = face == 2 ? vec3(0.0, 0.0, 1.0) : face == 3 ? vec3(0.0, 0.0, -1.0) : vec3(0.0, -1.0, 0.0);
  return vec4(T * t.x + B * t.y, d.w);
}
vec4 matGrad(vec2 uv, float layer, vec2 gx, vec2 gy, float soft) {
  // Natural rock (soft < 0) at arm's length: the 16 t/m layer's painted pixel features (strata
  // cracks, pebbles) would read as blurred pixel art over the HD detail, so its colour comes from a
  // softer mip there (up to ~2 levels); the detail layer draws the form.
  if (soft < 0.0) {
    vec2 fw = (abs(gx) + abs(gy)) * ${MAT_SIZE}.0;
    float ppt = 1.0 / max(max(fw.x, fw.y), 1e-4);
    // Ore veins keep their nuggets (the vein is the find): only a light softening there.
    int li = int(layer + 0.5);
    bool ore = li == ${MAT.copperVein} || li == ${MAT.copperTop} || li == ${MAT.ironVein} || li == ${MAT.ironTop} || ${METAL_LAYERS.map((m) => `li == ${MAT[m]}`).join(' || ')};
    float b = (ore ? 0.6 : 2.0) * smoothstep(3.0, 10.0, ppt);
    if (b > 0.01) return textureLod(uMat, vec3(uv, layer), b);
  }
  return textureGrad(uMat, vec3(sharpUv(uv, gx, gy, soft), layer), gx, gy);
}

// Texel softness of the sharp-bilinear edge per family (texels): rock and earth soften up close
// (adaptive), dressed stone stays crisp.
const float SOFT_ROCK = -0.025;
const float SOFT_CUT = 0.12;

// Natural rock is sampled where the sculpted surface really is (vWorldPos, not the voxel lattice),
// so chamfers and smoothed steps take the texture at its true scale instead of a stretched face
// projection. Top layers (chosen only where the smooth normal is within ~45 degrees of up) are
// projected from above. Side layers use the two wall planes, blended by the normal (biplanar:
// both have v = -y, so beds line up around corners and are drawn as the level contours they are
// on any slope), and ceilings the plane from below. Projections are upright and unmirrored as
// seen from outside, like worldUv; a second fetch happens only where two planes really blend.
vec2 rockUv;  // main plane of the fragment (for partners and the near grain)
vec2 rockGx;
vec2 rockGy;
vec4 rockTop(vec3 p, vec3 dx, vec3 dy, vec3 n, float layer) {
  float s = n.y >= 0.0 ? 1.0 : -1.0;
  rockUv = vec2(p.x, p.z * s) * (1.0 / MAT_PERIOD);
  rockGx = vec2(dx.x, dx.z * s) * (1.0 / MAT_PERIOD);
  rockGy = vec2(dy.x, dy.z * s) * (1.0 / MAT_PERIOD);
  return matGrad(rockUv, layer, rockGx, rockGy, SOFT_ROCK);
}
vec4 rockSide(vec3 p, vec3 dx, vec3 dy, vec3 n, float layer) {
  if (n.y < -0.72) return rockTop(p, dx, dy, n, layer); // ceiling: from below
  float sx = n.x >= 0.0 ? 1.0 : -1.0;
  float sz = n.z >= 0.0 ? 1.0 : -1.0;
  vec2 uvX = vec2(-p.z * sx, -p.y) * (1.0 / MAT_PERIOD);
  vec2 gxX = vec2(-dx.z * sx, -dx.y) * (1.0 / MAT_PERIOD);
  vec2 gyX = vec2(-dy.z * sx, -dy.y) * (1.0 / MAT_PERIOD);
  vec2 uvZ = vec2(p.x * sz, -p.y) * (1.0 / MAT_PERIOD);
  vec2 gxZ = vec2(dx.x * sz, -dx.y) * (1.0 / MAT_PERIOD);
  vec2 gyZ = vec2(dy.x * sz, -dy.y) * (1.0 / MAT_PERIOD);
  vec2 w = n.xz * n.xz;
  w *= w;
  float tz = w.y / max(w.x + w.y, 1e-6);
  bool zMain = tz > 0.5;
  rockUv = zMain ? uvZ : uvX;
  rockGx = zMain ? gxZ : gxX;
  rockGy = zMain ? gyZ : gyX;
  vec4 c = matGrad(rockUv, layer, rockGx, rockGy, SOFT_ROCK);
  float wo = zMain ? 1.0 - tz : tz;
  if (wo > 0.03) c = mix(c, zMain ? matGrad(uvX, layer, gxX, gyX, SOFT_ROCK) : matGrad(uvZ, layer, gxZ, gyZ, SOFT_ROCK), wo);
  return c;
}

// Geology top / side layer of the rock a face carries (materials/index.ts GEO_TOP_OF, GEO_SIDE_OF).
const int GEO_TOP[${MATERIAL_NAMES.length}] = int[](${Array.from(GEO_TOP_OF).join(', ')});
const int GEO_SIDE[${MATERIAL_NAMES.length}] = int[](${Array.from(GEO_SIDE_OF).join(', ')});
const float SCRIPT_LAYER = ${MAT.script}.0;
const float CRACK0 = ${CRACK_FIRST_LAYER}.0;
const float CRACKS = ${CRACK_STAGES}.0;
${courseGlsl({ masonry: MAT.masonry, masonryB: MAT.masonryB, crumbling: MAT.crumbling, crumblingB: MAT.crumblingB })}

float luma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }
// Round 3: smooth value noise (lava's crawling glow).
float noise3(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  vec3 u = f * f * (3.0 - 2.0 * f);
  float a = mix(mix(hash13(i), hash13(i + vec3(1, 0, 0)), u.x), mix(hash13(i + vec3(0, 1, 0)), hash13(i + vec3(1, 1, 0)), u.x), u.y);
  float b = mix(mix(hash13(i + vec3(0, 0, 1)), hash13(i + vec3(1, 0, 1)), u.x), mix(hash13(i + vec3(0, 1, 1)), hash13(i + vec3(1, 1, 1)), u.x), u.y);
  return mix(a, b, u.z);
}

// Height used to decide boundaries: alpha for ordinary layers, brightness for emissive ones.
float heightOf(vec4 t, int layer) {
  return matGlow(layer) > 0.0 ? luma(t.rgb) : t.a;
}

// Soft sky-less hemisphere shading from the sculpted normal: walls nearly equal (no
// per-axis Minecraft look), floors brightest, ceilings darkest.
float shadeOf(vec3 n) {
  vec3 w = n * n;
  vec3 pos = vec3(0.84, 1.0, 0.82);
  vec3 neg = vec3(0.80, 0.6, 0.86);
  return dot(w, mix(neg, pos, step(0.0, n)));
}

// Where the line of sight from the camera to the target block's centre enters the block (the
// mining highlight's centre when the ray hit is not given).
vec3 targetEntry(vec3 c) {
  vec3 rd = c + 0.5 - cameraPosition;
  rd = vec3(abs(rd.x) < 1e-4 ? 1e-4 : rd.x, abs(rd.y) < 1e-4 ? 1e-4 : rd.y, abs(rd.z) < 1e-4 ? 1e-4 : rd.z);
  vec3 a = (c - cameraPosition) / rd;
  vec3 b = (c + 1.0 - cameraPosition) / rd;
  vec3 lo = min(a, b);
  return cameraPosition + rd * clamp(max(max(lo.x, lo.y), lo.z), 0.0, 1.0);
}

// Fractures from a strike at the origin of q (metres in the face plane): five hairline cracks
// (about a centimetre, at least ~1 px: px is metres per pixel) that wander as they run out, reach further with damage (0..1) and taper, a
// short branch off some of them and a small crushed pit at the centre. Returns the crack core
// (x) and a lit lip beside it (y), so the cracks read as cut into the stone, not drawn on it.
vec2 fracture(vec2 q, float dmg, float seed, float px) {
  float r = length(q);
  float reach = 0.14 + 0.66 * dmg;
  if (r > reach + 0.07) return vec2(0.0);
  float ang = atan(q.y, q.x);
  float c = 1.0 - step(0.008 + 0.01 * dmg + px, r);
  float lip = 0.0;
  for (int k = 0; k < 5; k++) {
    float fk = float(k);
    float h1 = fract(seed * 7.13 + fk * 0.618);
    float h2 = fract(seed * 3.71 + fk * 0.377);
    float len = reach * (0.45 + 0.55 * h2);
    float a = (fk + 0.2 + 0.6 * h1) * 1.2566 + sin(r * 9.0 + fk * 2.1 + seed * 6.0) * 0.3;
    float da = abs(mod(ang - a + 3.14159, 6.28318) - 3.14159) * r;
    // Hairlines: ~1 cm at the root, tapering, never thinner than about 1.2 px (px: metres per
    // pixel at the fragment), so they stay fine at arm's length and still read from 3 m.
    // Round 2: finer at arm's length (the root was ~11 px wide at 1 m: a dark star), still >= 1.2 px.
    float w = 0.0055 * (1.0 - r / len) + px * 1.1;
    float on = step(r, len);
    c = max(c, step(da, w) * on);
    lip = max(lip, step(da, w + 0.012 + px) * on * step(0.0, sin(ang - a)));
    // a short branch off the middle of some cracks, bending away
    float ab = a + (h1 > 0.5 ? 1.5 : -1.5) * max(r - len * 0.45, 0.0) / len;
    float db = abs(mod(ang - ab + 3.14159, 6.28318) - 3.14159) * r;
    c = max(c, step(db, w * 0.8) * step(len * 0.45, r) * step(r, len * 0.8) * step(0.5, fract(h2 * 5.0 + fk * 0.5)));
  }
  return vec2(c, lip * (1.0 - c));
}

void main() {
#ifdef DEBUG_CLIP
  if (vWorldPos.y > uDebug.y) discard; // debug section view only: discard would disable early-Z
#endif
  vec3 n = FACE_N[vFace];
  ivec3 cell = ivec3(floor(vGrid - n * 0.5));
  int family = vFlags & 3;
  int layer = int(vLayer + 0.5);
  // Shading normal of the sculpted surface: smooth across natural rock (the mesher's lattice
  // normal, bent by the relief), flat on masonry, crystal and timber. NO_DERIV: face normal.
#ifdef NO_DERIV
  vec3 ng = n;
#else
  vec3 ng = normalize(vNormal);
#endif
  vec2 uv = worldUv(vGrid, vFace);
  vec2 uvDx = dFdx(uv);
  vec2 uvDy = dFdy(uv);
  // Natural rock: the sculpted position bent by a slow world-space warp (about 6 m features, up
  // to +-0.8 m along and +-1.5 m across the beds), so the 8 m period never lines up and the beds
  // undulate through the world, not once per texture tile. One fetch, also the macro variation.
  vec4 macroN = textureLod(uNoise, vWorldPos * (1.0 / 190.0), 0.0);
  vec3 rp = vWorldPos + (macroN.rga - 0.5) * vec3(1.6, 3.0, 1.6);
  vec3 rpDx = dFdx(rp);
  vec3 rpDy = dFdy(rp);
  bool natural = family == ${FAMILY.GEOLOGY} || layer == ${MAT.sealStone};
  // Material fetch. Masonry: courses laid in world space from the course libraries
  // (materials/courses.ts) on the voxel face (it is cut stone, nearly unsculpted); its fetch uses
  // the continuous projection's gradients, so mip selection does not jump at course joints.
  // Natural rock: biplanar from the sculpted surface, top or side layer from the smooth normal.
  vec4 crs = vec4(0.0);
  vec4 tex;
  int shownLayer = layer;
  bool topShown = false;
  if (family == ${FAMILY.MASONRY}) {
    // The face's plane from its solid cell (half a voxel inside), not the interpolated vGrid:
    // on a plane that is a multiple of the vocabulary cell, interpolation noise would flip the
    // region hash per pixel.
    crs = masonryCourse(uv * MAT_PERIOD, vFace, dot(vec3(cell), abs(n)) + 0.5);
    tex = courseSample(layer, crs, uvDx, uvDy);
  } else if (natural) {
    int topL = GEO_TOP[layer];
    int sideL = GEO_SIDE[layer];
    // Loose material and worn floor rest on slopes gentler than about 38 degrees; steeper rock
    // shows its beds. The threshold wanders with the world noise, and inside the band the
    // taller of the two layers at this texel claims it, so the boundary follows the stone.
    float t = (ng.y - 0.79 - (macroN.b - 0.5) * 0.18) * (1.0 / 0.13);
    // One layer for top and side (gravel, bedrock, the seal stone): the projection still follows the
    // surface, from above only on floor-like slopes (a wall leaning 1 degree up must not take the
    // top projection: its texture would smear into vertical streaks).
    if (topL == sideL) t = ng.y > 0.72 ? 2.0 : -2.0;
    if (t >= 1.0) {
      tex = rockTop(rp, rpDx, rpDy, ng, float(topL));
      topShown = true;
    } else if (t <= -1.0) {
      tex = rockSide(rp, rpDx, rpDy, ng, float(sideL));
    } else {
      vec4 b = rockSide(rp, rpDx, rpDy, ng, float(sideL));
      vec2 su = rockUv, sgx = rockGx, sgy = rockGy;
      vec4 a = rockTop(rp, rpDx, rpDy, ng, float(topL));
      topShown = (a.a - b.a) * 1.1 + t * 0.6 > 0.0;
      tex = topShown ? a : b;
      if (!topShown) {
        rockUv = su;
        rockGx = sgx;
        rockGy = sgy;
      }
    }
    shownLayer = topShown ? topL : sideL;
  } else tex = matGrad(uv, vLayer, uvDx, uvDy, SOFT_CUT);

#ifdef USE_BLEND
  // Natural boundaries: near an edge shared with a different material of the same family (the
  // mesher lists those partners per face edge), the material that is "taller" at this texel
  // (rock nubs, pebbles, vein metal) pushes across. Both faces evaluate the same world-space
  // test, so they agree exactly. Faces without partners pay nothing. Rock partners are mapped to
  // the same top or side layer as the shown one and sampled through the same projection.
  if (family != 0 && min(min(vNb.x, vNb.y), min(vNb.z, vNb.w)) < 254.5) {
    int ax = vFace >> 1;
    vec3 t1 = ax == 0 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0);
    vec3 t2 = ax == 2 ? vec3(0.0, 1.0, 0.0) : vec3(0.0, 0.0, 1.0);
    float wobble = textureLod(uNoise, vGrid * (1.0 / 3.1), 0.0).a - 0.5;
    float hs = heightOf(tex, shownLayer);
    for (int k = 0; k < 2; k++) {
      float l = dot(fract(vGrid), k == 0 ? t1 : t2);
      int side = l < 0.5 ? -1 : 1;
      float d = side < 0 ? l : 1.0 - l;
      float nlf = k == 0 ? (side < 0 ? vNb.x : vNb.y) : (side < 0 ? vNb.z : vNb.w);
      if (nlf > 254.5 || d > 0.6) continue;
      int nl = int(nlf + 0.5);
      if (natural) nl = topShown ? GEO_TOP[nl] : GEO_SIDE[nl];
      if (nl == shownLayer) continue;
      vec4 ntex = family == ${FAMILY.MASONRY} ? courseSample(nl, crs, uvDx, uvDy) : natural ? matGrad(rockUv, float(nl), rockGx, rockGy, SOFT_ROCK) : matGrad(uv, float(nl), uvDx, uvDy, SOFT_CUT);
      // Antisymmetric by construction (the neighbour's face computes exactly -claim at the same
      // point), so the two faces draw one boundary curve. No constant bias: it would let both
      // sides claim a strip at the edge and swap the materials there.
      float claim = (heightOf(ntex, nl) - hs) * 0.75 - wobble * 0.6 * float(side);
      if (d < claim) {
        tex = ntex;
        shownLayer = nl;
        break;
      }
    }
  }
#endif

  // Macro variation instead of a per-block brightness jitter, which used to reveal the cube
  // grid: about 6 m features from the warp fetch on natural rock (its texture carries the finer
  // variation), plus about 1.2 m features elsewhere.
#ifdef NO_MACRO
  float macro = 0.5;
#else
  float macro = macroN.b;
  if (!natural) macro = textureLod(uNoise, vGrid * (1.0 / 38.0), 0.0).a * 0.65 + macroN.b * 0.35;
#endif
  vec3 albedo = tex.rgb * (0.84 + 0.32 * macro);
  // Round 2: dressed stone up close. Past ~5 px a texel the cut-stone colour is magnified bilinear
  // (soft), so its joints smeared into blurry bands (floors at the feet, walls at arm's length).
  // The height channel marks the joints (about 0 in the mortar, 0.6-0.85 on the stone): thresholded
  // at its midpoint it gives a crisp joint line at any magnification (as a distance field does),
  // drawn as a dark groove with a faint lit lip, so slabs read cut and sharp, not out of focus.
  if (family == ${FAMILY.MASONRY} && matGlow(shownLayer) <= 0.0) {
    vec2 fwm = (abs(uvDx) + abs(uvDy)) * ${MAT_SIZE}.0;
    float pptm = 1.0 / max(max(fwm.x, fwm.y), 1e-4);
    float nearK = smoothstep(4.0, 9.0, pptm);
    if (nearK > 0.0) {
      float aa = 0.9 / pptm;
      float joint = 1.0 - smoothstep(0.34 - aa, 0.34 + aa, tex.a);
      float lip = smoothstep(0.34 + aa, 0.34 + 3.0 * aa, tex.a) * (1.0 - smoothstep(0.5, 0.62, tex.a));
      albedo *= mix(1.0, (1.0 - 0.55 * joint) * (1.0 + 0.12 * lip), nearK);
    }
  }
  // Near the lens a rock texel spans many pixels: a fine grain (64 per metre, ALU value noise on
  // the main projection, no fetch, about 25 ALU) fades in there, so close rock reads as stone,
  // not as a magnified pixel. Skipped wherever a texel is under 5 px.
  if (natural) {
    vec2 fwr = (abs(rockGx) + abs(rockGy)) * ${MAT_SIZE}.0;
    float ppt = 1.0 / max(max(fwr.x, fwr.y), 1e-4);
    if (ppt > 5.0) {
      vec2 dq = rockUv * ${MAT_SIZE * 4}.0;
      vec2 i = floor(dq);
      vec2 f = fract(dq);
      f = f * f * (3.0 - 2.0 * f);
      // Four lattice values from one dot product each (cheap sine hash; precision is ample at
      // these magnitudes after the wrap to the texture period).
      i = mod(i, 1024.0);
      vec4 hv = fract(sin(vec4(dot(i, vec2(12.9898, 78.233)), dot(i + vec2(1.0, 0.0), vec2(12.9898, 78.233)), dot(i + vec2(0.0, 1.0), vec2(12.9898, 78.233)), dot(i + 1.0, vec2(12.9898, 78.233)))) * 43758.5453);
      float g = mix(mix(hv.x, hv.y, f.x), mix(hv.z, hv.w, f.x), f.y);
      albedo *= 1.0 + (g - 0.5) * 0.2 * smoothstep(5.0, 12.0, ppt);
    }
  }

  // HD stone: the detail layer bends the shading normal (facets, creases, grain) and darkens its
  // creases; natural rock takes it through the same warped biplanar projection as its material.
  int dl = DETAIL_L[shownLayer];
  float dk = DETAIL_K[shownLayer];
  vec4 det = natural ? (topShown || ng.y < -0.72 ? detailTop(rp, ng.y >= 0.0 ? 1.0 : -1.0, dl) : detailSide(rp, ng, dl)) : detailFace(vGrid, vFace, dl);
  vec3 nd = normalize(ng + det.xyz * dk);
  albedo *= mix(1.0, 0.5 + det.w, dk);
  // VIS r2: dressed stone's exposed corners (a pedestal, a lintel, a wall's end) are worn round. On
  // a convex edge (the neighbour in the plane and the cell diagonally in front both air, read from
  // the highlight volume within ~13 m) the shading normal rolls over toward the side face across
  // the last ~5 cm and the arris is chipped in places, so a lone block of masonry reads as cut
  // stone catching the flame on its edges, not as a flat box.
  if (family == ${FAMILY.MASONRY} && vDepth < 13.0 && uHiOrigin.w > 0.5) {
    int bax = vFace >> 1;
    ivec3 bT1 = bax == 0 ? ivec3(0, 1, 0) : ivec3(1, 0, 0);
    ivec3 bT2 = bax == 2 ? ivec3(0, 1, 0) : ivec3(0, 0, 1);
    vec3 blc = vGrid - vec3(cell);
    ivec3 bn = ivec3(n);
    float chip = textureLod(uNoise, vGrid * 0.9, 0.0).r;
    float fade = 1.0 - smoothstep(10.0, 13.0, vDepth);
    for (int k = 0; k < 4; k++) {
      ivec3 t = k == 0 ? -bT1 : k == 1 ? bT1 : k == 2 ? -bT2 : bT2;
      float d = k == 0 ? dot(blc, vec3(bT1)) : k == 1 ? 1.0 - dot(blc, vec3(bT1)) : k == 2 ? dot(blc, vec3(bT2)) : 1.0 - dot(blc, vec3(bT2));
      if (d > 0.08) continue;
      if (hiCode(cell + t) != 0 || hiCode(cell + t + bn) != 0) continue;
      float r = (1.0 - smoothstep(0.0, 0.05 * (0.7 + 0.6 * chip), d)) * fade;
      nd = normalize(nd + vec3(t) * r * 0.9);
      albedo *= 1.0 - 0.2 * r * smoothstep(0.55, 0.75, chip);
    }
  }
  // Ore veins up close: the nuggets are the saturated texels of the vein layer. Their bilinear mask
  // is re-sharpened (a narrow smoothstep: crisp, smooth outlines at any magnification), their rim
  // darkened like a seat in the rock, and the normal bulges out along the mask's screen gradient,
  // so each nugget reads as a rounded lump of metal, not as a blurred orange stain.
  float oreMetal = 0.0;
  // Polish 2: the rim of the native-copper nuggets up close (the rarity highlight draws on it).
  float oreRim = 0.0;
  float oreNear = 0.0;
  bool isCopper = shownLayer == ${MAT.copperVein} || shownLayer == ${MAT.copperTop};
  bool isIron = shownLayer == ${MAT.ironVein} || shownLayer == ${MAT.ironTop};
  if (isCopper || isIron) {
    float cmx = max(tex.r, max(tex.g, tex.b));
    float sat = (cmx - min(tex.r, min(tex.g, tex.b))) / max(cmx, 1e-3);
    // Copper: its nuggets are the saturated texels. Iron (round 2): its steel bands are the tallest
    // texels of the layer (height alpha ~0.86+), grey, so they are found by height, not colour.
    // VIS r2: copper's nuggets are orange-red (r well above g); the bilinear blend from them to the
    // grey-green crust runs through yellow, which was taken for metal and smeared a rainbow up close.
    float orange = smoothstep(1.15, 1.45, tex.r / max(tex.g, 1e-3));
    float m = isCopper ? smoothstep(0.4, 0.62, sat) * smoothstep(0.06, 0.16, cmx) * orange : smoothstep(0.83, 0.89, tex.a) * (1.0 - smoothstep(0.25, 0.45, sat));
    // Iron's steel is found by height: a narrow threshold on the 16 t/m layer drew it with stepped
    // texel edges at arm's length, so its edge is wider (copper's colour mask stays crisp).
    float crisp = isCopper ? smoothstep(0.45, 0.55, m) : smoothstep(0.3, 0.7, m);
    // Polish 2: at arm's length a painted copper bead spans 4-6 texels (25-40 cm at 1 m), so the
    // magnified mask read as flat orange camouflage blobs across the wall. Up close the bead area
    // becomes what a vein is: a dark oxidised seam in the grey rock, studded with small nuggets of
    // native copper (about 1.5-4 cm, a world-space cellular field on the rock's own projection,
    // crisp at any magnification). From ~10 m out the painted texture holds on its own.
    float seam = 0.0;
    float hm = m;
    if (isCopper) {
      vec2 fwc = (abs(rockGx) + abs(rockGy)) * ${MAT_SIZE}.0;
      float pptc = 1.0 / max(max(fwc.x, fwc.y), 1e-4);
      oreNear = smoothstep(4.0, 11.0, pptc);
      if (oreNear > 0.0) {
        // Two octaves of world-space value noise (~3 cm and ~1.3 cm features) push the smooth
        // painted mask over a high threshold in places: irregular nuggets of varied size, packed
        // where the painted vein is dense, none outside it.
        float n1 = textureLod(uNoise, vWorldPos * 1.05, 0.0).g;
        float n2 = textureLod(uNoise, vWorldPos * 2.4 + 7.3, 0.0).b;
        float field = m * 0.6 + (n1 - 0.5) * 1.2 + (n2 - 0.5) * 0.6;
        float aa = max(fwidth(field) * 0.8, 1e-3);
        // (the painted mask only gates presence, softly: its bilinear texel contour would draw
        // stair-stepped nugget edges at arm's length; the noise field draws the shape)
        float nug = smoothstep(0.7 - aa, 0.7 + aa, field) * smoothstep(0.0, 0.22, m);
        // The vein between the nuggets is the host's grey, a little darker (oxidised ore), with a
        // dark seat hugging each nugget: paint never spreads over the wall. Any warm tint left by
        // the magnified texels (the bilinear blend from an orange bead into grey) greys too.
        float warm = smoothstep(0.08, 0.3, sat) * smoothstep(1.04, 1.25, tex.r / max(tex.g, 1e-3));
        seam = (1.0 - nug) * max(smoothstep(0.02, 0.35, m), warm) * oreNear;
        albedo *= 1.0 - 0.3 * smoothstep(0.56, 0.68, field) * (1.0 - nug) * oreNear;
        crisp = mix(crisp, nug, oreNear);
        // Each nugget is domed (its height rises with the field inside it), so the flame's
        // specular rolls over it like a lump of metal instead of lighting a flat stain.
        hm = mix(m, smoothstep(0.62, 0.95, field) * smoothstep(0.0, 0.22, m), oreNear);
        // Each nugget leans its own way (the two noise octaves as a tilt), so the flame catches a
        // few of them, not every one at once (a flat nugget facing the lantern was one salmon fill).
        nd = normalize(nd + (vec3(n1, n2, 1.0 - n1) - 0.5) * 1.4 * nug * oreNear);
        oreRim = smoothstep(0.62, 0.7, field) * (1.0 - smoothstep(0.7, 0.78, field)) * oreNear;
      }
    }
    // The soft fringe of a nugget (and the yellow of that blend) takes the host rock's grey, so a
    // nugget at arm's length has a clean edge, not an orange stain around it.
    float lum = dot(albedo, vec3(0.2126, 0.7152, 0.0722));
    // Copper: a texel blended between the orange metal and the green crust (olive, yellow) is
    // neither; it takes the host's grey, so up close the vein, its crust and the rock stay three
    // clean colours.
    float green = smoothstep(0.98, 1.06, tex.g / max(tex.r, 1e-3)) * smoothstep(0.12, 0.22, sat);
    float between = isCopper ? (1.0 - max(smoothstep(1.3, 1.5, tex.r / max(tex.g, 1e-3)), green)) * smoothstep(0.18, 0.35, sat) : 0.0;
    float fringe = max(max((1.0 - crisp) * smoothstep(0.05, 0.45, m), between), isCopper ? green * mix(0.35, 0.8, oreNear) : 0.0);
    // Up close the whole painted vein outside the nuggets takes the host's grey (slightly dimmed:
    // its luminance is the bright orange's), so no orange or pink spreads round the metal.
    albedo = mix(albedo, vec3(lum) * vec3(1.03, 1.0, 0.96) * mix(1.0, 0.82, seam), max(fringe * mix(0.75, 1.0, oreNear), seam));
    float rim = smoothstep(0.12, 0.4, m) * (1.0 - smoothstep(0.45, 0.6, m)) * (1.0 - oreNear);
    // World-space gradient of the mask (1/m) from its screen derivatives: the nugget as a height
    // field about 2 cm tall, so its flanks tilt outward.
    vec3 px = dFdx(vWorldPos);
    vec3 py = dFdy(vWorldPos);
    vec3 gw = px * (dFdx(hm) / max(dot(px, px), 1e-10)) + py * (dFdy(hm) / max(dot(py, py), 1e-10));
    // Round 2: the nugget stands proud (about 3.5 cm), so the flame models it as a lump of metal.
    nd = normalize(nd - gw * 0.035);
    // Iron's steel reads cool and bright against the warm-lit host rock (it was the rock's own grey).
    // VIS r2 (arm's length): steel is a dark blue-grey metal (the flame's specular gives its shine),
    // not a pale plate; iron's rust crust is a deep red-brown, not orange paint.
    // Native copper is a deep coppery metal whose shine is the flame's specular: a third less
    // saturated than the painted orange (flat orange paint at arm's length), toned by the detail
    // layer so a large nugget has a hammered surface, not one flat fill.
    vec3 copperAlb = mix(albedo, vec3(lum) * vec3(1.25, 0.78, 0.56), 0.35) * 1.18 * (0.78 + 0.44 * det.w);
    // Up close a nugget may sit where the painted texel was rock: native copper of its own (a
    // deep coppery metal; the flame's specular gives its shine).
    copperAlb = mix(copperAlb, vec3(0.2, 0.075, 0.03) * (0.8 + 0.4 * det.w), oreNear);
    vec3 metalAlb = isCopper ? copperAlb : max(albedo * 1.25, vec3(0.1, 0.105, 0.12)) * vec3(0.92, 0.97, 1.08) * (0.8 + 0.4 * det.w);
    if (isIron) {
      float rust = smoothstep(1.25, 1.6, tex.r / max(tex.g, 1e-3)) * smoothstep(0.35, 0.6, sat);
      albedo = mix(albedo, mix(vec3(lum), albedo, 0.3) * vec3(1.06, 0.9, 0.8) * 0.78, rust);
    }
    albedo = mix(albedo * (1.0 - 0.5 * rim), metalAlb, crisp);
    oreMetal = crisp;
  }
  // Round 3: the biomes' metal ores (gold, silver, frost iron, orichalcum, starsteel, runegold, pearl,
  // amber, sap): their nuggets are the tall texels of the vein (materials/strata.ts paintVein), so
  // they glint as metal or resin under the flame.
  bool isMetal3 = ${METAL_LAYERS.map((m) => `shownLayer == ${MAT[m]}`).join(' || ')};
  if (isMetal3) oreMetal = smoothstep(0.8, 0.86, tex.a) * smoothstep(0.08, 0.2, max(tex.r, max(tex.g, tex.b)));

  vec3 samplePos = vGrid + n * 0.5;
  vec4 ls = lightSample(samplePos);
  float ao = vAo / 3.0;
  float aoCurve = 0.18 + 0.82 * ao;
  float shade = shadeOf(normalize(ng + det.xyz * (dk * 0.6)));
  // Placed lights (lamps, crystals) come from one side (LAMP_DIR: from the light volume's
  // gradient), so faces turned away and recesses lose them faster than the all-round cool fill: a
  // crevice inside a warm pool falls to blue-black, not to dark amber.
#ifdef LAMP_DIR
  vec2 facing = placedFacing(ls, samplePos, n);
#else
  vec2 facing = vec2(1.0);
#endif
  vec3 lantern = lanternLight(samplePos, vWorldPos, nd, ls.a) * (0.4 + 0.6 * ao);
  // The lantern and the lamps own the faces they light (the cool fill is cut there): warm against
  // cold per face, not lavender everywhere.
  vec3 ambient = ambientFrom(ls, ng, facing, ao, lantern) * shade * aoCurve;
  // A crystal's face would otherwise be lit by its own emission (sampled one voxel in front)
  // and then add its emission on top: the blown-out cube. Its light is for its surroundings.
  if (family == ${FAMILY.CRYSTAL}) ambient *= 0.3;
  vec3 color = albedo * (ambient + lantern + vec3(uDebug.x) * shade * aoCurve + glowLight(vWorldPos, n) * aoCurve);
  vec3 litByFlame = albedo * lantern;
  // The flame's specular on the detailed surface: wet stone and ore metal glint as the lantern
  // moves, dry rubble barely. Roughness widens where the normal changes fast on screen (no sparkle).
  {
    vec3 toEye = normalize(cameraPosition - vWorldPos);
    float rough = clamp(max(DETAIL_R[shownLayer] + (0.5 - det.w) * 0.3, length(fwidth(nd)) * 1.5), 0.12, 1.0);
    vec3 f0 = vec3(0.035);
    if (oreMetal > 0.0) {
      // Ore nuggets: metal, their own colour in the reflection (copper warm, iron a cool steel), a
      // tighter lobe so they glint as the flame moves.
      vec3 metalF0 = isCopper ? mix(tex.rgb * 0.95, vec3(0.72, 0.44, 0.3), oreNear) : isMetal3 ? clamp(tex.rgb * 1.4, 0.0, 1.0) : mix(vec3(0.42, 0.45, 0.5), tex.rgb * 1.6, 0.35);
      f0 = mix(f0, metalF0, oreMetal);
      // Up close a tight lobe on tilted nuggets: a few glint at a time, the rest read as dark metal.
      rough = mix(rough, isCopper ? mix(0.36, 0.3, oreNear) : 0.32, oreMetal);
      color *= 1.0 - 0.4 * oreMetal;
    } else if (isIron) {
      f0 = vec3(0.07);
      rough = min(rough, 0.46);
    }
    vec3 spec = lanternSpec(nd, toEye, rough, f0) * (0.3 + 0.7 * ao);
    // Round 2: ore sparkle. Each ~4 cm grain of the metal has its own tilted facet; the few turned
    // to mirror the flame at the eye flash as a pin-point glint, so a vein twinkles as the explorer
    // moves past it (still when the view is still: calm).
    if (oreMetal > 0.05) {
      vec3 gc = floor(vWorldPos * 24.0);
      float hg = hash13(gc + 17.0);
      if (hg > 0.72) {
        vec3 tilt = vec3(hash13(gc + 3.1), hash13(gc + 7.7), hash13(gc + 11.3)) - 0.5;
        vec3 gn = normalize(nd + tilt * 1.1);
        float g = pow(max(dot(reflect(-gLanternL, gn), toEye), 0.0), 64.0);
        spec += gLanternRad * (isCopper ? vec3(1.0, 0.78, 0.5) : vec3(0.85, 0.9, 1.0)) * g * 2.2 * oreMetal;
      }
    }
    color += spec;
    litByFlame += spec;
  }
  // Arm's length: the flame-lit colour eases under a ceiling (lighting.ts nearShoulder).
  color = nearShoulder(color, litByFlame);

  float glow = tex.a * matGlow(shownLayer);
  vec3 emissive = tex.rgb * glow;
  // Round 3: lava moves. Its glow crawls under the crust (two slow noise layers drifting across each
  // other) and breathes, the hottest seams brightening and dimming over seconds: calm, never strobing.
  if (shownLayer == ${MAT.lava} || shownLayer == ${MAT.magmaCore}) {
    vec2 lp = vWorldPos.xz * 0.55;
    float f1 = hash13(vec3(floor(lp + uTime * vec2(0.05, 0.03)), 3.0));
    float n1 = noise3(vec3(lp + uTime * vec2(0.06, 0.035), uTime * 0.04));
    float n2 = noise3(vec3(lp * 2.3 - uTime * vec2(0.03, 0.07), 7.0 + uTime * 0.05));
    float heat = 0.7 + 0.55 * n1 + 0.3 * n2 + 0.05 * f1;
    emissive *= heat * (0.92 + 0.08 * sin(uTime * 0.7 + dot(vWorldPos.xz, vec2(0.21, 0.17))));
    emissive += vec3(1.0, 0.45, 0.12) * smoothstep(0.55, 0.9, n1 * n2 * 1.8) * 0.35 * glow;
  }

  // Round 3 (VIS, the Frost Caverns' wow): the ice holds a slow aurora, bands of pale green, cyan and
  // violet drifting deep inside it (sampled behind the surface along the view, so they slide with the
  // eye like light in thick glass); faint, slow, never a strobe.
  if (shownLayer == ${MAT.frostIce} || shownLayer == ${MAT.iceCrystal}) {
    vec3 iv = normalize(vWorldPos - cameraPosition);
    vec3 q = vWorldPos + iv * 0.8;
    float b1 = sin(q.y * 1.1 + sin(q.x * 0.31 + uTime * 0.11) * 2.0 + sin(q.z * 0.27 - uTime * 0.09) * 2.0 + uTime * 0.21);
    float band = smoothstep(0.45, 1.0, b1) * (0.45 + 0.55 * noise3(q * 0.35 + vec3(0.0, uTime * 0.05, 0.0)));
    vec3 hue = mix(vec3(0.22, 1.0, 0.62), vec3(0.55, 0.45, 1.0), 0.5 + 0.5 * sin(q.x * 0.13 + q.z * 0.11 + uTime * 0.05));
    emissive += hue * band * 0.085;
  }
  // Round 3 (VIS, the Obsidian Abyss's wow): its black glass holds a deep sky, faint violet-white stars
  // far behind the surface (parallax with the eye), each twinkling at its own slow pace.
  if (shownLayer == ${MAT.obsidian} || shownLayer == ${MAT.obsidianFloor}) {
    vec3 ov = normalize(vWorldPos - cameraPosition);
    vec3 q = (vWorldPos + ov * 7.0) * 1.7;
    vec3 sc = floor(q);
    float h = hash13(sc);
    vec3 sf = fract(q) - 0.5 - (vec3(hash13(sc + 1.3), hash13(sc + 2.7), hash13(sc + 4.1)) - 0.5) * 0.6;
    float star = step(0.935, h) * smoothstep(0.13, 0.0, length(sf)) * (0.55 + 0.45 * sin(uTime * (0.5 + h * 1.3) + h * 40.0));
    emissive += mix(vec3(0.55, 0.4, 1.0), vec3(1.0, 0.95, 1.0), fract(h * 7.3)) * star * 0.34;
  }

  // Round 3 (VIS, the Sunken City's wow): its gold runes answer the lantern, waking round the explorer
  // (within ~10 m, brightest at 3 m) and settling again behind; far off they keep a faint glow.
  if (shownLayer == ${MAT.cityBrick} || shownLayer == ${MAT.cityTile}) {
    vec3 dl = vWorldPos - uLanternPos;
    float wake = smoothstep(10.0, 3.0, length(vec3(dl.x, dl.y * 0.5, dl.z)));
    emissive *= 0.55 + 1.5 * wake * (0.92 + 0.08 * sin(uTime * 1.3 - length(dl) * 0.8));
  }

  // Round 3: the bioluminescent rock breathes (lighting.ts bioBreath: the caps, vines and glowing moss).
  if (shownLayer == ${MAT.capTeal} || shownLayer == ${MAT.capMagenta} || shownLayer == ${MAT.glowVine} || shownLayer == ${MAT.sporeLoam} || shownLayer == ${MAT.mycelFloor} || shownLayer == ${MAT.jungleMoss}) emissive *= bioBreath(vWorldPos);

  // Crystal is glass, not stone: a broad, soft reflection of the lantern slides over its faces as
  // the explorer moves, and the painted glints at the prism tips flare when their own (tilted)
  // facet mirrors the flame toward the eye, so the seam sparkles in a few places, not everywhere.
  if (family == ${FAMILY.CRYSTAL}) {
    vec3 toEye = normalize(cameraPosition - vWorldPos);
    vec3 toLamp = normalize(uLanternPos - vWorldPos);
    float sheen = pow(max(dot(reflect(-toLamp, n), toEye), 0.0), 24.0);
    float glint = smoothstep(0.78, 0.9, tex.a);
    vec2 fc = floor(uv * 32.0);
    vec3 tilt = vec3(hash13(vec3(fc, 1.0 + float(vFace))), hash13(vec3(fc, 9.0)), hash13(vec3(fc.yx, 4.0))) - 0.5;
    float flare = pow(max(dot(reflect(-toLamp, normalize(n + tilt)), toEye), 0.0), 12.0);
    vec3 glass = shownLayer == ${MAT.gemOre} ? vec3(0.62, 0.42, 1.0) : vec3(0.28, 0.75, 0.84);
    // Round 3: a biome's crystal (amethyst, ice, verdite, voidshard, obsidian...) reflects in its own hue.
    if (shownLayer >= ${BASE_LAYER_COUNT}) {
      float tl = max(max(tex.r, max(tex.g, tex.b)), 0.02);
      glass = clamp(tex.rgb / tl, 0.0, 1.0) * 0.8 + 0.12;
    }
    color += glass * luma(lantern) * (sheen * 0.2 + flare * glint * 2.5);
  }
  // Round 3 (VIS): the deep's gems are iridescent: their inner light shifts hue with the angle they
  // are seen at (walk past a geode wall and it turns from violet to cyan; the bog's opals play every
  // colour), never by themselves (calm: it moves only when the eye does).
  if (shownLayer == ${MAT.amethyst} || shownLayer == ${MAT.mireOpal} || shownLayer == ${MAT.voidshard} || shownLayer == ${MAT.sporeQuartz} || shownLayer == ${MAT.iceCrystal} || shownLayer == ${MAT.verdite}) {
    vec3 ve = normalize(cameraPosition - vWorldPos);
    float ik = 0.5 + 0.5 * sin(dot(ve, n) * 5.0 + dot(vWorldPos, vec3(0.37, 0.21, 0.29)) * 2.0);
    vec3 ia = vec3(1.0);
    vec3 ib = vec3(1.0);
    if (shownLayer == ${MAT.amethyst}) { ia = vec3(1.05, 0.75, 1.15); ib = vec3(0.55, 1.05, 1.2); }
    else if (shownLayer == ${MAT.mireOpal}) { ia = 0.55 + 0.65 * cos(6.2832 * (ik + vec3(0.0, 0.33, 0.67))); ib = ia; }
    else if (shownLayer == ${MAT.voidshard}) { ia = vec3(1.1, 0.7, 1.15); ib = vec3(0.6, 0.75, 1.3); }
    else if (shownLayer == ${MAT.sporeQuartz}) { ia = vec3(0.7, 1.15, 1.05); ib = vec3(1.2, 0.7, 1.1); }
    else if (shownLayer == ${MAT.iceCrystal}) { ia = vec3(0.8, 1.0, 1.15); ib = vec3(0.95, 1.12, 1.0); }
    else { ia = vec3(0.75, 1.15, 0.8); ib = vec3(1.15, 1.05, 0.6); }
    emissive *= mix(ia, ib, ik);
  }

  // Inscriptions: the builders' script (materials/script.ts) laid in world space along the band,
  // so a row of glyph stones reads as one carved line of text (a headline the glyphs hang from,
  // glyphs of varying width, word gaps, a baseline groove), not one icon per stone. Each band
  // (course and plane) takes its own line of text and starting point. Carved: the groove is
  // dark, worn away in places (world-space noise, ~0.5 m patches); the ink is dim until the lantern
  // comes close ("the inscriptions answer the light"), and a slow pulse travels along the line.
  // A band two courses tall (mesher bit 7: rune bit + bit 7 = upper stone, bit 7 alone = lower
  // stone) carries one line of script at twice the size, for inscriptions read from afar.
  if ((vFlags & 12) != 0 && vFace != 2 && vFace != 3) {
    bool tall = (vFlags & 8) != 0;
    int y0 = cell.y - ((vFlags & 4) != 0 && tall ? 1 : 0);
    float scale = tall ? 0.5 : 1.0;
    float plane = dot(vec3(cell), abs(n));
    float hb = hash13(vec3(float(y0) + 0.5, plane * 1.7 + float(vFace), 3.1));
    float line = floor(hb * 8.0);
    float row = clamp((float(y0) + (tall ? 2.0 : 1.0) - vGrid.y) * scale, 0.0, 0.999);
    vec2 su = vec2(uv.x * scale + fract(hb * 13.7), (line + row) * (1.0 / 8.0));
    vec4 scr = matGrad(su, SCRIPT_LAYER, uvDx * scale, uvDy * scale, SOFT_CUT);
    float erosion = smoothstep(0.3, 0.46, textureLod(uNoise, vGrid * (1.0 / 18.0) + hb * 7.0, 0.0).g);
    float carve = smoothstep(0.24, 0.42, scr.a) * (0.55 + 0.45 * erosion);
    // A band at the feet (a kerb of glyph stones, as round the Choir's dais) whispers: its ink is
    // a thin core of the strokes and much dimmer, so the landmark it rings holds the eye, not a row
    // of glowing glyph boxes. Friezes at and above eye height keep their light.
    float low = 1.0 - smoothstep(-0.2, 0.6, float(y0) + (tall ? 2.0 : 1.0) - cameraPosition.y);
    float ink = smoothstep(0.72 + 0.16 * low, 0.95 + 0.03 * low, scr.a) * erosion;
    // The wake reaches up: a frieze high over a doorway answers a lantern carried beneath it.
    vec3 dl = vGrid - uLanternPos;
    float wake = smoothstep(9.0, 2.5, length(vec3(dl.x, dl.y * 0.35, dl.z)));
    color *= 1.0 - carve * (0.62 - 0.22 * low); // the carved groove
    emissive += scr.rgb * ink * (0.26 + 0.8 * wake) * (1.0 - 0.72 * low) * (0.85 + 0.15 * sin(uTime * 1.1 - uv.x * MAT_PERIOD * 0.8));
  }

  // Rarity highlights (render/highlight.ts): every minable find within ~14 m wears a crisp thin rim
  // in its rarity colour along the edges where the find meets other stone (the vein's outline, not a
  // block grid), a faint inner glow that gathers toward that rim, and a slow breath (one every 3 s).
  // The selected cell is outlined on its own (every edge it shares with other stone), brighter and
  // steady. Legendary finds carry a slow shimmer. Derivatives are taken here, in uniform flow.
  vec3 hiLc = vGrid - vec3(cell);
  int hiAx = vFace >> 1;
  ivec3 hiT1 = hiAx == 0 ? ivec3(0, 1, 0) : ivec3(1, 0, 0);
  ivec3 hiT2 = hiAx == 2 ? ivec3(0, 1, 0) : ivec3(0, 0, 1);
  vec2 hiL = vec2(dot(hiLc, vec3(hiT1)), dot(hiLc, vec3(hiT2)));
  vec2 hiW = fwidth(hiL);
  bool hiSel = uHiSel.w > 1.5 && all(equal(cell, ivec3(uHiSel.xyz)));
  int hiC = hiCode(cell);
  // Polish 2: a cell the volume holds as air (a block just broken, its old faces still on screen
  // until the remesh lands) never draws, selected or not: no leftover outline polygons.
  if (hiC >= 2 && (vDepth < 14.5 || hiSel)) {
    ivec3 nI = ivec3(n);
    float sel = hiSel ? uHiFx.y : 0.0;
    // An ore vein is rock with metal in it: its cell edges are arbitrary lines on the wall, so up
    // close its highlight lives on the nuggets themselves (oreRim), not on the block grid.
    int faceSide = GEO_SIDE[layer];
    bool oreCell = faceSide == ${MAT.copperVein} || faceSide == ${MAT.ironVein};
    // Polish 2: outlines only while a cell is small on screen. hiFrac is the share of the screen
    // height a 1 m cell spans at this depth: crisp lines are full from ~6 m out (a cell under ~10 %
    // of the height) and gone by ~3.4 m (18 %), so neither the ambient rims nor the selection ever
    // draw a long line or a frame across a wall at arm's length.
    float hiFrac = uHiView.x / max(vDepth, 0.05);
    float lineVis = 1.0 - smoothstep(0.1, 0.18, hiFrac);
    // Ambient rims are quieter still: a crisp line only from ~10 m out (a cell under ~6 % of the
    // height), so a find's outline at 4-8 m never reads as a white frame on the wall; nearer, its
    // soft inner glow carries it.
    float lineAmb = 1.0 - smoothstep(0.06, 0.12, hiFrac);
    // Line width in pixels (crisp: about 1.7 px ambient, 2.6 px selected), never wider than 9 cm.
    vec2 w = min(hiW * mix(2.4, 2.6, sel), vec2(0.09));
    float line = 0.0;
    float outer = 0.0;
    float minD = 1.0;
    for (int k = 0; k < 4; k++) {
      ivec3 t = k == 0 ? -hiT1 : k == 1 ? hiT1 : k == 2 ? -hiT2 : hiT2;
      float d = k == 0 ? hiL.x : k == 1 ? 1.0 - hiL.x : k == 2 ? hiL.y : 1.0 - hiL.y;
      if (d > 0.4) continue;
      // Who owns the surface across this edge: the cell diagonally in front (a concave corner), the
      // neighbour in the plane (a flat continuation), or this cell itself (a convex corner).
      ivec3 diag = cell + t + nI;
      ivec3 side = cell + t;
      int cd = hiCode(diag);
      int cs = hiCode(side);
      bool other = cd >= 1 || cs >= 1;
      int oc = cd >= 1 ? cd : cs;
      // The find's own outline (the vein's, the pile's), selected or not: never the grid of cells
      // inside it. The selected cell draws its share of that outline, brighter. A selected loose
      // block (a heap, roots, a crystal, a seal) also draws its convex edges, where its surface
      // turns away into the air: that line hugs the thing itself at any distance, so it stays on
      // up close (a vein's edges are arbitrary lines on the wall: never).
      bool rim = other && oc != hiC;
      bool convex = !other && hiSel && !oreCell;
      // A selected block inside a heap also takes its own edges against the heap, but only while
      // it is small on screen (from ~3.4 m out); up close its glow and the cracks carry it.
      bool inner = other && oc == hiC && hiSel && !oreCell;
      if (!rim && !convex && !inner) continue;
      // Convex edges stay on a little nearer (to ~2.1 m), then they too fade: at arm's length a
      // block's own outline would be a frame across the screen.
      float ev = rim ? mix(lineAmb, lineVis, sel) : inner ? lineVis : 1.0 - smoothstep(0.16, 0.3, hiFrac);
      float ww = k < 2 ? w.x : w.y;
      if (rim) minD = min(minD, d);
      // Ambient: a soft-edged rim (a glow line, not a drawn box); selected: crisp.
      line = max(line, ev * (1.0 - smoothstep(ww * mix(0.25, 0.55, sel), ww * 1.15, d)));
      outer = max(outer, ev * smoothstep(ww * 1.0, ww * 1.4, d) * (1.0 - smoothstep(ww * 1.8, ww * 2.6, d)));
    }
    int code = hiC;
    vec3 hc = uHiCol[clamp(code - 2, 0, 4)];
    if (hiSel && uHiFx.z > 0.5) hc = mix(vec3(dot(hc, vec3(0.2126, 0.7152, 0.0722))), vec3(1.0, 0.32, 0.26), 0.55); // too hard
    float amb = (1.0 - smoothstep(10.0, 14.0, vDepth)) * (0.84 + 0.16 * sin(uHiFx.x * 2.0944)) * uHiFx.w * (1.0 - sel);
    float k = amb + 2.4 * sel;
    // The inner glow gathers in a band ~10 cm inside the rim. Ambient: a soft glowing seam with a
    // thin, quieter line at its edge; up close only a breath of it (the find is in the lantern's
    // light by then). Selected: the crisp line from afar; up close the soft band and a faint tint
    // over the struck block, so a selected rubble pile or crystal reads chosen without a frame.
    // Ore: the soft band too stays off the cell edges up close (it would draw a soft square).
    float gather = exp(-minD * 11.0) * (oreCell ? lineVis : mix(mix(0.3, 1.0, lineVis), 1.0, sel));
    // Ambient: the find glows softly from within and its rim is only a hairline (never a white box
    // on the wall); selected, the crisp line carries it.
    // (no flat tint over an ambient find's faces: on dark stone even a breath of it read as a pale box)
    vec3 hi = hc * (line * mix(0.065, 0.28, sel) + gather * mix(0.045, 0.02, sel) + 0.0006 + (oreCell ? 0.0 : 0.008 * sel * (1.0 - lineVis))) * k;
    // Ore up close: the rarity colour runs round the nuggets (a crisp rim) with a faint glow on
    // the metal: the vein's outline is its metal, brighter on the struck block.
    hi += hc * (oreRim * mix(0.0, 0.04, sel) + oreMetal * oreNear * mix(0.004, 0.01, sel)) * k * (1.0 - lineVis * 0.5);
    if (code == 6) {
      // Legendary: a slow band of light travels over the find (about one pass every 5 s).
      float band = smoothstep(0.75, 1.0, sin(dot(vWorldPos, vec3(1.1, 0.7, 0.9)) * 1.4 - uHiFx.x * 1.25));
      hi += hc * band * (0.35 * line + 0.05) * max(amb, sel);
    }
    // A thin dark seat just outside the rim, so the line stays crisp on pale or lantern-lit stone.
    color *= 1.0 - 0.32 * outer * min(k, 1.0);
    emissive += hi;
  }

  // Mining feedback on the sculpted surface, not a cube frame: a soft warm light gathers around
  // the point the pick strikes (the ray hit, or where the line of sight to the block enters it),
  // spreading over the block's own faces, and fractures radiate from it as the damage grows
  // (stage 0-9), the stone's own joints and partings opening first. Red when too hard.
  // Metres per pixel at the fragment (taken in uniform control flow, outside the branch below).
  float pxMetres = length(fwidth(vWorldPos)) * 0.7;
  if (all(equal(cell, ivec3(uTarget.xyz)))) {
    vec3 hit = uTargetHit.w > 0.5 ? uTargetHit.xyz : targetEntry(uTarget.xyz);
    vec3 dh = vWorldPos - hit;
    float r = length(dh);
    float spot = 1.0 - smoothstep(0.06, 0.7, r);
    if (uTarget.w >= 0.0) {
      float dmg = (uTarget.w - CRACK0 + 1.0) / CRACKS;
      // In-plane offset around the hit, snapped to the material texels: crisp pixel cracks.
      vec2 q = worldUv(dh, vFace) * MAT_PERIOD;
      vec2 fr = fracture(q, dmg, hash13(vec3(cell)), pxMetres);
      float joints = (1.0 - smoothstep(0.1, 0.17, heightOf(tex, shownLayer))) * (1.0 - smoothstep(0.1 + dmg * 0.55, 0.22 + dmg * 0.55, r));
      float crack = max(fr.x, joints * 0.6 * smoothstep(0.1, 0.3, dmg));
      // Cut into the stone, not inked on it: the groove darkens by at most ~half (darker as the
      // block nears breaking), with a lit lip beside it.
      color *= (1.0 - crack * (0.42 + 0.2 * dmg)) * (1.0 + fr.y * 0.18);
    }
    vec3 spotColor = uTargetFx.z > 0.5 ? vec3(1.0, 0.36, 0.3) : hiSel ? mix(vec3(1.0, 0.82, 0.58), uHiCol[clamp(int(uHiSel.w + 0.5) - 2, 0, 4)], 0.6) : vec3(1.0, 0.82, 0.58);
    color += spotColor * spot * spot * (0.025 + 0.05 * uTargetFx.y) + vec3(1.0, 0.92, 0.8) * uTargetFx.x * 0.2 * spot;
  }

  // Zone atmosphere: haze (pooling low, lit by the light volume around the fragment) takes the
  // surface, and emission fades into it too, so distant glows become glowing air, not specks.
  vec4 atm = atmosphere(vWorldPos, vDepth, ls.rgb);
  color = mix(color, atm.rgb, atm.a);
  // Round 3: glowing rock (caps, glow vines, crystals, ice) flares as the sonar's shell passes and
  // keeps a little of its light behind it (uSonarFx.w: the afterglow), like the glowing decor.
  if (uSonarFx.y > 0.001) {
    float bsd = distance(vWorldPos, uSonar.xyz);
    float bah = (bsd - uSonar.w) / 1.8;
    float breach = 1.0 - smoothstep(0.75, 1.0, bsd / max(uSonarFx.z, 1.0));
    emissive *= 1.0 + (exp(-bah * bah) * 2.0 + step(bsd, uSonar.w) * exp(-(uSonar.w - bsd) * 0.07) * 0.7 * uSonarFx.w) * uSonarFx.y * breach;
  }
  color += emissive * uAtmos.w * (1.0 - atm.a * uAtmos.z);
  // Round 3: the sonar pulse (render/sonar.ts), the lantern's ring of light sweeping out over the
  // rock: a thin pale-gold line where the expanding shell crosses the surface, a faint wake behind
  // it, fading with the pulse's reach. It passes over everything once and is gone (no lingering grid).
  if (uSonarFx.y > 0.001) {
    float sd = distance(vWorldPos, uSonar.xyz);
    float sw = max(uSonarFx.x, 0.05);
    float ahead = (sd - uSonar.w) / sw;
    float edge = exp(-ahead * ahead * 2.2);
    float wake = ahead < 0.0 ? exp(ahead * 0.35) * 0.18 : 0.0;
    float reach = 1.0 - smoothstep(0.55, 1.0, uSonar.w / max(uSonarFx.z, 1.0));
    // Contour rings in the wake every 1.5 m (world-space, so they stay on the rock).
    float rings = pow(abs(sin((sd - uSonar.w) * 2.0944)), 24.0) * wake * 2.2;
    color += uSonarTint * (edge * 0.55 + wake * 0.2 + rings * 0.25) * uSonarFx.y * reach;
  }
  fragColor = vec4(sceneOut(color), 1.0);
}
`;

/**
 * @param debugClip compile the debug section-view discard (uDebug.y). Off in the game: any
 * possible discard turns off early depth rejection / hidden-surface removal on mobile GPUs.
 */
export function createTerrainMaterial(lighting: LightingUniforms, tiles: THREE.DataArrayTexture, terrain: TerrainUniforms, debugClip = false, blend = true, extraDefines: Record<string, string> = {}): THREE.ShaderMaterial {
  const defines: Record<string, string> = { ...extraDefines };
  if (debugClip) defines.DEBUG_CLIP = '';
  if (blend) defines.USE_BLEND = '';
  // Directional placed light (one extra light-volume fetch); the Battery preset removes it.
  defines.LAMP_DIR = '';
  return new THREE.ShaderMaterial({
    glslVersion: THREE.GLSL3,
    defines,
    uniforms: {
      ...lighting,
      ...terrain,
      // The tile atlas is no longer sampled here (inscriptions come from the script layer of
      // uMat, mining fractures are computed); kept bound for callers that read it back.
      uTiles: { value: tiles },
      uDetail: DETAIL_UNIFORM,
    },
    vertexShader: vertex,
    fragmentShader: fragment,
  });
}
