import * as THREE from 'three';
import { BLOCKS, SIDE_VARIANTS, VARIANT_COUNT } from '../config/blocks';
import { CRACK_FIRST_LAYER, CRACK_STAGES, TILE_NAMES, TILE_SIZE } from '../config/tiles';
import { LIGHTING_GLSL, type LightingUniforms } from './lighting';
import { FAMILY, GEO_SIDE_OF, GEO_TOP_OF, KITS, LAYER_FALLBACK, MAT, MATERIAL_NAMES } from './materials';
import { SECTION_SHADE_GLSL, sectionUniforms } from './look';
import { courseGlsl } from './materials/courses';
import { MAT_DENSITY, MAT_SIZE } from './materials/paint';
import { AO_SCALE, OFFSET_RANGE } from './mesher';
import type { TerrainUniforms } from './terrainRig';
import type { TileAtlas } from './textures';

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
uniform vec4 uCellFx[8];
uniform vec4 uCellPop[2];
uniform vec4 uSection;

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
  // The cell pop (CRITIQUE B3): a hit cell's front face and its ledge scale about the cell centre (1.08
  // at the full pop, crits 1.14) and come 0.04 m forward, so a 44 px cell grows by about 3.5 px a side.
  if (uSection.x > 0.5 && (vFace == 4 || vFace == 2)) {
    float cu = float(bits & 1);
    float cv = float((bits >> 1) & 1);
    vec3 vox = vFace == 4 ? g.xyz - vec3(cu, cv, 1.0) : g.xyz - vec3(cu, 1.0, cv);
    for (int i = 0; i < 8; i++) {
      float pop = uCellPop[i >> 2][i & 3];
      if (pop <= 0.001) continue;
      vec4 c = uCellFx[i];
      if (abs(vox.x - c.x) > 0.1 || abs(vox.y - c.y) > 0.1 || vox.z < 56.5) continue;
      float sc = 1.0 + 0.08 * pop;
      if (vFace == 4) {
        wp.xy = vec2(c.x + 0.5, c.y + 0.5) + (wp.xy - vec2(c.x + 0.5, c.y + 0.5)) * sc;
        wp.z += 0.04 * pop + 0.01;
      } else {
        wp.x = c.x + 0.5 + (wp.x - c.x - 0.5) * sc;
        wp.y += (sc - 1.0) * 0.5;
        wp.z = 58.5 + (wp.z - 58.5) * sc;
      }
      break;
    }
  }
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
${SECTION_SHADE_GLSL}
// Preset switches as uniforms (CRITIQUE B SHOULD 7): a quality change never compiles a program.
uniform float uPresetBlend;
uniform float uPresetLampDir;
// The section look's guess of a block from its layer (materials/index.ts LAYER_FALLBACK).
const int LAYER_FB[${LAYER_FALLBACK.length}] = int[](${Array.from(LAYER_FALLBACK).join(', ')});
uniform sampler2DArray uMat;
uniform sampler3D uNoise;
uniform float uMatGlow[${MATERIAL_NAMES.length}];
uniform float uMatValue[${MATERIAL_NAMES.length}];
uniform vec4 uSection;      // x on, y floor top world y, z camera x, w camera y
uniform vec3 uSectionKey;
uniform vec3 uRimColor;
uniform vec3 uCamFill;
uniform vec3 uDeepTint;
uniform sampler2D uSectionField;
uniform vec4 uCellFx[8];    // cell x, cell bottom y, flash, crack
uniform vec4 uCellPop[2];

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
  return (c + clamp((t - c) / w, -0.5, 0.5)) * (1.0 / ${MAT_SIZE}.0);
}
vec4 matGrad(vec2 uv, float layer, vec2 gx, vec2 gy, float soft) {
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

// Height used to decide boundaries: alpha for ordinary layers, brightness for emissive ones.
float heightOf(vec4 t, int layer) {
  return uMatGlow[layer] > 0.0 ? luma(t.rgb) : t.a;
}

// Soft sky-less hemisphere shading from the sculpted normal: walls nearly equal (no
// per-axis Minecraft look), floors brightest, ceilings darkest.
float shadeOf(vec3 n) {
  vec3 w = n * n;
  vec3 pos = vec3(0.84, 1.0, 0.82);
  vec3 neg = vec3(0.80, 0.6, 0.86);
  return dot(w, mix(neg, pos, step(0.0, n)));
}

// Fractures from a strike at the origin of q (metres in the face plane): five hairline cracks
// (about one texel) that wander as they run out, reach further with damage (0..1) and taper, a
// short branch off some of them and a small crushed pit at the centre. Returns the crack core
// (x) and a lit lip beside it (y), so the cracks read as cut into the stone, not drawn on it.
vec2 fracture(vec2 q, float dmg, float seed) {
  float r = length(q);
  float reach = 0.14 + 0.66 * dmg;
  if (r > reach + 0.07) return vec2(0.0);
  float ang = atan(q.y, q.x);
  float c = 1.0 - step(0.03 + 0.035 * dmg, r);
  float lip = 0.0;
  for (int k = 0; k < 5; k++) {
    float fk = float(k);
    float h1 = fract(seed * 7.13 + fk * 0.618);
    float h2 = fract(seed * 3.71 + fk * 0.377);
    float len = reach * (0.45 + 0.55 * h2);
    float a = (fk + 0.2 + 0.6 * h1) * 1.2566 + sin(r * 9.0 + fk * 2.1 + seed * 6.0) * 0.3;
    float da = abs(mod(ang - a + 3.14159, 6.28318) - 3.14159) * r;
    float w = 0.034 * (1.0 - r / len);
    float on = step(r, len);
    c = max(c, step(da, w) * on);
    lip = max(lip, step(da, w + 0.06) * on * step(0.0, sin(ang - a)));
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
  // The HD look (look.ts): every cut-plane face of a painted block, and the ledge tops of the dig band, are
  // painted per pixel from the block's ramp; the other faces of biome blocks take their biome's ramp over the
  // legacy texture. The block comes from the SectionIds ring when bound, else from the layer and the depth.
  bool onCut = uSection.x > 0.5 && vFace == 4 && abs(vGrid.z - 60.0) < 0.02;
  float secId = -1.0;
  if (uSection.x > 0.5) {
    if (onCut) secId = sectionIdAt(cell.xy);
    if (secId < 0.0 || sectionRow(secId) < 0.0) {
      float bio = vGrid.y > uSecFallback.z ? uSecFallback.x : uSecFallback.y;
      int fb = LAYER_FB[int(mod(bio, ${KITS}.0) + 0.5) * ${MATERIAL_NAMES.length} + layer];
      secId = fb < 0 ? 64.0 + 8.0 * bio + float(-fb - 1) : fb > 0 ? float(fb) : -1.0;
    }
  }
  float secRowV = secId >= 0.0 ? sectionRow(secId) : -1.0;
  bool ledge = vFace == 2 && cell.z >= 57 && cell.x >= 28 && cell.x <= 34;
  // Every camera-facing face (the cut, the shaft's back wall, alcove backs) and the ledge tops are HD.
  bool hdFace = secRowV >= 0.0 && (vFace == 4 || ledge);
  vec2 pHD = vFace == 4 ? vWorldPos.xy + vec2(0.37, 0.21) * (60.0 - vGrid.z) : vec2(vWorldPos.x, vWorldPos.z * 0.8 + vGrid.y);
  SecTexel sTex;
  sTex.albedo = vec3(0.0);
  sTex.h = 0.5;
  sTex.spec = 0.0;
  sTex.emit = 0.0;
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
  if (hdFace) {
    sTex = sectionTexel(pHD, secRowV);
    tex = vec4(sTex.albedo, 0.0);
  } else if (family == ${FAMILY.MASONRY}) {
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
    if (topL == sideL) t = ng.y > 0.0 ? 2.0 : -2.0;
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
  // The other faces of biome blocks (cavern walls, the back wall, alcoves): the legacy texture's values
  // walked through the biome's own ramp, so a Fungal wall is violet even where it shares Topsoil's painter.
  if (!hdFace && secRowV >= 0.0) {
    float tv = clamp(sqrt(luma(tex.rgb)) * 1.75 - 0.1, 0.0, 1.0);
    tex.rgb = mix(tex.rgb, secRamp(secRowV, tv), 0.82);
  }

#ifdef USE_BLEND
  // Natural boundaries: near an edge shared with a different material of the same family (the
  // mesher lists those partners per face edge), the material that is "taller" at this texel
  // (rock nubs, pebbles, vein metal) pushes across. Both faces evaluate the same world-space
  // test, so they agree exactly. Faces without partners pay nothing. Rock partners are mapped to
  // the same top or side layer as the shown one and sampled through the same projection.
  if (uPresetBlend > 0.5 && !hdFace && family != 0 && min(min(vNb.x, vNb.y), min(vNb.z, vNb.w)) < 253.5) {
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
      if (nlf > 253.5 || d > 0.6) continue;
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
  vec3 albedo = tex.rgb * (hdFace ? 0.93 + 0.14 * macro : 0.84 + 0.32 * macro);
  // Near the lens a rock texel spans many pixels: a fine grain (64 per metre, ALU value noise on
  // the main projection, no fetch, about 25 ALU) fades in there, so close rock reads as stone,
  // not as a magnified pixel. Skipped wherever a texel is under 2 px (CRITIQUE B SHOULD 16).
  if (natural && !hdFace) {
    vec2 fwr = (abs(rockGx) + abs(rockGy)) * ${MAT_SIZE}.0;
    float ppt = 1.0 / max(max(fwr.x, fwr.y), 1e-4);
    if (ppt > 2.0) {
      vec2 dq = rockUv * ${MAT_SIZE * 4}.0;
      vec2 i = floor(dq);
      vec2 f = fract(dq);
      f = f * f * (3.0 - 2.0 * f);
      // Four lattice values from one dot product each (cheap sine hash; precision is ample at
      // these magnitudes after the wrap to the texture period).
      i = mod(i, 1024.0);
      vec4 hv = fract(sin(vec4(dot(i, vec2(12.9898, 78.233)), dot(i + vec2(1.0, 0.0), vec2(12.9898, 78.233)), dot(i + vec2(0.0, 1.0), vec2(12.9898, 78.233)), dot(i + 1.0, vec2(12.9898, 78.233)))) * 43758.5453);
      float g = mix(mix(hv.x, hv.y, f.x), mix(hv.z, hv.w, f.x), f.y);
      albedo *= 1.0 + (g - 0.5) * 0.2 * smoothstep(2.0, 7.0, ppt);
    }
  }

  vec3 samplePos = vGrid + n * 0.5;
  vec4 ls = lightSample(samplePos);
  float ao = vAo / 3.0;
  float aoCurve = 0.18 + 0.82 * ao;
  float shade = shadeOf(ng);
  // Placed lights (lamps, crystals) come from one side (LAMP_DIR: from the light volume's
  // gradient), so faces turned away and recesses lose them faster than the all-round cool fill: a
  // crevice inside a warm pool falls to blue-black, not to dark amber.
#ifdef LAMP_DIR
  vec2 facing = uPresetLampDir > 0.5 ? placedFacing(ls, samplePos, n) : vec2(1.0);
#else
  vec2 facing = vec2(1.0);
#endif
  vec3 lantern = lanternLight(samplePos, vWorldPos, ng, ls.a) * (0.4 + 0.6 * ao);
  // The descent's drawn section (SPEC §11.2): the cut-plane faces facing the camera.
  bool section = onCut;
  float value = hdFace ? sectionValue(secRowV) : uMatValue[shownLayer];
  float below = uSection.y - vGrid.y; // metres below the floor's top edge
  // A back wall or alcove back 1-3 m behind the flame takes it nearly head-on: a soft knee keeps that pool
  // from burning white (Magma, Fossil), while the weaker light further out is untouched.
  if (hdFace && !section && vFace == 4) lantern /= 1.0 + 0.6 * max(lantern.r, max(lantern.g, lantern.b));
  // Transient impact lights (crits, breaks, blasts): no visibility term, uniform-driven.
  vec3 impact = impactLight(vWorldPos, ng);
  vec3 ambient;
  vec3 secAdd = vec3(0.0);
  if (section) {
    // Key light (0.9 x the open fill) dimmed into the rock mass by the distance to the nearest open cell
    // of the cut, the apron's real light (lamps, emitters, the glow below), the dig lantern (wrapped on
    // the cut so the warm pool reads on the face) and a rim along every outline where the cut meets air.
    float dField = texture(uSectionField, vec2(vGrid.x / 64.0, vGrid.y / 160.0)).r * 16.0;
    bool inShaft = vGrid.x > 27.99 && vGrid.x < 35.01;
    float depthKey = mix(1.0, inShaft ? 0.62 : 0.35, 1.0 - exp(-0.45 * dField));
    vec2 fr2 = fract(vGrid.xy);
    float dEdge = 9.0;
    if (vNb.x > 253.5 && vNb.x < 254.5) dEdge = min(dEdge, fr2.x);
    if (vNb.y > 253.5 && vNb.y < 254.5) dEdge = min(dEdge, 1.0 - fr2.x);
    if (vNb.z > 253.5 && vNb.z < 254.5) dEdge = min(dEdge, fr2.y);
    if (vNb.w > 253.5 && vNb.w < 254.5) dEdge = min(dEdge, 1.0 - fr2.y);
    float rim = 1.0 - smoothstep(0.0, 0.15, dEdge);
    vec3 dl = uLanternPos - vWorldPos;
    float dist = length(dl);
    float lx = dist / max(uLanternRadius, 0.5);
    float win = clamp(1.0 - lx * lx * lx * lx, 0.0, 1.0);
    float lat = win * win / (1.0 + 6.0 * lx * lx);
    float lwrap = clamp(dot(vec3(0.0, 0.0, 1.0), dl / max(dist, 1e-3)) * 0.65 + 0.35, 0.0, 1.0);
    // On host rock the flame's amber is half as deep (V11): the valuables keep the full warm light, so copper,
    // iron and the chest stay apart from the lit rock around them; the floor, ledges and back wall keep the pool.
    vec3 deepL = lanternDeep();
    if (value < 0.5) {
      vec3 hostT = mix(vec3(1.0), deepL, 0.5);
      deepL = hostT * (dot(deepL, vec3(0.2126, 0.7152, 0.0722)) / dot(hostT, vec3(0.2126, 0.7152, 0.0722))); // same luminance
    }
    vec3 secLantern = uLanternColor * mix(vec3(1.0), deepL, smoothstep(0.05, 0.18, lx)) * (1.6 * lwrap * lat * uLanternIntensity);
    // Focus (SPEC §11.1 pillar 5): the key falls off away from the dig band, so the floor is the brightest band.
    float focus = mix(1.0, 0.6, smoothstep(1.5, 7.5, below)) * mix(1.0, 0.72, smoothstep(1.0, 5.0, -below));
    // The dig band is a lit stage: +45 % on the floor row and the row under it, falling off over 1 m.
    focus *= 1.0 + 0.6 * exp(-pow((below - 0.6) / 1.1, 2.0));
    ambient = (uSectionKey * depthKey + ls.rgb * 0.85) * focus + uRimColor * rim * (0.55 + 0.45 * depthKey);
    lantern = secLantern;
    // The dig band as a designed object (CRITIQUE B5): chisel seams at the shaft cells' boundaries, a
    // lit lip toward the lantern, fading out by 4 rows below the floor.
    if (inShaft) {
      float fade = 1.0 - smoothstep(0.0, 4.0, below - 1.0);
      vec2 e = min(fr2, 1.0 - fr2);
      float seam = 1.0 - smoothstep(0.0, 1.0 / 28.0, min(e.x, e.y));
      float lip = (1.0 - smoothstep(1.0 / 28.0, 2.0 / 28.0, 1.0 - fr2.y)) * (1.0 - seam);
      ambient *= 1.0 - 0.35 * seam * fade;
      secAdd += uLanternColor * 0.06 * lip * fade;
    } else if (fract(-vGrid.y * 0.25) < 1.0 / 64.0) ambient *= 0.75; // contour hairline every 4 m
  } else {
    // The lantern and the lamps own the faces they light (the cool fill is cut there): warm against
    // cold per face, not lavender everywhere.
    ambient = ambientFrom(ls, ng, facing, ao, lantern) * shade * aoCurve;
  }
  // A crystal's face would otherwise be lit by its own emission (sampled one voxel in front)
  // and then add its emission on top: the blown-out cube. Its light is for its surroundings.
  if (family == ${FAMILY.CRYSTAL} && !section && !hdFace) ambient *= 0.3;
  // The camera fill: faces turned toward the camera never go black (the shaft interior, the back wall).
  vec3 camFill = uCamFill * max(ng.z, 0.0) * aoCurve;
  // Focus for the stage above the floor too (the back wall, the shaft's sides): the dig band stays the brightest.
  if (uSection.x > 0.5 && !section && vGrid.z > 50.0 && vGrid.x > 25.0 && vGrid.x < 38.0) {
    float up = vGrid.y - uSection.y;
    ambient *= mix(1.0, 0.62, smoothstep(0.8, 5.0, up)) * (1.0 + 0.35 * exp(-pow((up - 0.4) / 0.9, 2.0)));
    camFill *= mix(1.0, 0.6, smoothstep(0.8, 5.0, up));
  }
  // The same knee for the light volume on camera-facing walls: a row of magma or resin emitters at the foot of
  // the back wall must light it, not burn it white (Magma, Fossil); ordinary walls (below 0.6) are untouched.
  if (hdFace && !section && vFace == 4) {
    float am = max(ambient.r, max(ambient.g, ambient.b));
    if (am > 0.6) ambient *= (0.6 + (am - 0.6) / (1.0 + 1.6 * (am - 0.6))) / am;
  }
  vec3 diffuse = ambient + lantern + camFill + impact + vec3(uDebug.x) * shade * aoCurve;
  vec3 color = hdFace ? sectionLight(sTex, pHD, diffuse, lantern, vWorldPos) * (0.93 + 0.14 * macro) + secAdd * albedo : albedo * diffuse + secAdd * albedo;

  float glow = hdFace ? 0.0 : tex.a * uMatGlow[shownLayer];
  vec3 emissive = hdFace ? sectionEmission(sTex) : tex.rgb * glow;
  if (uSection.x > 0.5 && value > 0.5) {
    // Valuables read through the dark (CRITIQUE B6): a self-light by value, rich ore pulsing at 0.7 Hz,
    // and the shine sweep (a 45 degree band crossing the screen every 3.2 s) lifting them by +1.6.
    float h = hash13(vec3(cell) + 0.5);
    float self = value < 1.5 ? 0.3 : value < 2.5 ? 0.48 : 0.6;
    float pulse = value > 1.5 ? 1.0 + 0.25 * sin(6.2832 * 0.7 * uTime + h * 6.2832) : 1.0;
    float sweepPos = (vGrid.x - vGrid.y) * 0.7071 - ((uSection.z - uSection.w) * 0.7071 - 14.0);
    float sweep = 1.0 - smoothstep(0.0, 0.3, abs(sweepPos - mod(uTime, 3.2) * 9.0));
    emissive += albedo * (self * pulse + 0.9 * sweep) * (section ? 1.0 : 0.6);
    emissive *= pulse;
  }

  // Crystal is glass, not stone: a broad, soft reflection of the lantern slides over its faces as
  // the explorer moves, and the painted glints at the prism tips flare when their own (tilted)
  // facet mirrors the flame toward the eye, so the seam sparkles in a few places, not everywhere.
  if (family == ${FAMILY.CRYSTAL} && !hdFace) {
    vec3 toEye = normalize(cameraPosition - vWorldPos);
    vec3 toLamp = normalize(uLanternPos - vWorldPos);
    float sheen = pow(max(dot(reflect(-toLamp, n), toEye), 0.0), 24.0);
    float glint = smoothstep(0.78, 0.9, tex.a);
    vec2 fc = floor(uv * 32.0);
    vec3 tilt = vec3(hash13(vec3(fc, 1.0 + float(vFace))), hash13(vec3(fc, 9.0)), hash13(vec3(fc.yx, 4.0))) - 0.5;
    float flare = pow(max(dot(reflect(-toLamp, normalize(n + tilt)), toEye), 0.0), 12.0);
    color += vec3(0.28, 0.75, 0.84) * luma(lantern) * (sheen * 0.2 + flare * glint * 2.5);
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
    float ink = smoothstep(0.72, 0.95, scr.a) * erosion;
    // The wake reaches up: a frieze high over a doorway answers a lantern carried beneath it.
    vec3 dl = vGrid - uLanternPos;
    float wake = smoothstep(9.0, 2.5, length(vec3(dl.x, dl.y * 0.35, dl.z)));
    color *= 1.0 - carve * 0.62; // the carved groove
    emissive += scr.rgb * ink * (0.26 + 0.8 * wake) * (0.85 + 0.15 * sin(uTime * 1.1 - uv.x * MAT_PERIOD * 0.8));
  }

  // Cell FX (SPEC §10.5): up to 8 hit cells flash and crack at once; the crack is the fracture() pattern
  // centred on the face, snapped to 32 texels per metre (CRITIQUE SHOULD 2), and a popping cell gets a
  // 1 px darker outline.
  if (uSection.x > 0.5 && cell.z >= 57 && cell.z <= 59) {
    for (int i = 0; i < 8; i++) {
      vec4 c = uCellFx[i];
      if (abs(float(cell.x) - c.x) > 0.1 || abs(float(cell.y) - c.y) > 0.1) continue;
      vec2 ctr = vec2(c.x + 0.5, c.y + 0.5) + (vec2(hash13(vec3(c.xy, 1.0)), hash13(vec3(c.xy, 2.0))) - 0.5) * 0.3;
      if (c.w > 0.0) {
        vec2 q = vWorldPos.xy - ctr;
        if (vFace != 4) q = vec2(vWorldPos.x - ctr.x, vWorldPos.z - 58.5);
        q = (floor(q * 32.0) + 0.5) * (1.0 / 32.0);
        vec2 frc = fracture(q, c.w, hash13(vec3(c.xy, 3.0)));
        color *= (1.0 - frc.x * 0.8) * (1.0 + frc.y * 0.3);
        emissive *= 1.0 - frc.x * 0.6;
      }
      float pop = uCellPop[i >> 2][i & 3];
      if (pop > 0.01 && vFace == 4) {
        vec2 e = min(fract(vGrid.xy), 1.0 - fract(vGrid.xy));
        color *= 1.0 - 0.35 * (1.0 - smoothstep(0.0, 0.03, min(e.x, e.y)));
      }
      color += vec3(1.0, 0.9, 0.74) * c.z * (0.55 + 0.45 * luma(albedo) * 4.0) * 0.6;
      break;
    }
  }

  if (section) {
    // The fog of rock: rows more than 6 m below the floor fade to a deep tint (x0.7 by 9 m); treasure and
    // gem emission passes through (the tease).
    float fr = smoothstep(6.0, 9.0, below);
    color = mix(color, uDeepTint, 0.6 * fr);
  }

  // Zone atmosphere: haze (pooling low, lit by the light volume around the fragment) takes the
  // surface, and emission fades into it too, so distant glows become glowing air, not specks.
  vec4 atm = atmosphere(vWorldPos, vDepth, ls.rgb);
  color = mix(color, atm.rgb, atm.a);
  color += emissive * (1.0 - atm.a * uAtmos.z);
  fragColor = vec4(sceneOut(color), 1.0);
}
`;

/**
 * The quality preset's terrain switches (shared by every terrain material; Renderer.setQuality sets them):
 * natural material boundaries (one extra fetch near a boundary) and the directional placed light (one extra
 * light-volume fetch). Uniforms, not defines, so a preset change never compiles a program (P3).
 */
export const TERRAIN_PRESET = { blend: { value: 1 } as THREE.IUniform<number>, lampDir: { value: 1 } as THREE.IUniform<number> };

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
      ...sectionUniforms(),
      uPresetBlend: TERRAIN_PRESET.blend,
      uPresetLampDir: TERRAIN_PRESET.lampDir,
      // The tile atlas is no longer sampled here (inscriptions come from the script layer of
      // uMat, mining fractures are computed); kept bound for callers that read it back.
      uTiles: { value: tiles },
    },
    vertexShader: vertex,
    fragmentShader: fragment,
  });
}
