import * as THREE from 'three';
import { BLOCKS, SIDE_VARIANTS, VARIANT_COUNT } from '../config/blocks';
import { CRACK_FIRST_LAYER, CRACK_STAGES, TILE_NAMES, TILE_SIZE } from '../config/tiles';
import { LIGHTING_GLSL, type LightingUniforms } from './lighting';
import { FAMILY, GEO_SIDE_OF, GEO_TOP_OF, MAT, MATERIAL_NAMES } from './materials';
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
uniform float uMatGlow[${MATERIAL_NAMES.length}];
uniform vec4 uTarget;   // xyz = cell being mined, w = crack tile layer (< 0: none)
uniform vec4 uTargetFx; // x = impact flash, y = actively mining, z = too hard
uniform vec4 uTargetHit; // xyz = where the mining ray hits the block, w = 1 when known

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

  vec3 samplePos = vGrid + n * 0.5;
  vec4 ls = lightSample(samplePos);
  float ao = vAo / 3.0;
  float aoCurve = 0.18 + 0.82 * ao;
  float shade = shadeOf(ng);
  // Placed lights (lamps, crystals) come from one side (LAMP_DIR: from the light volume's
  // gradient), so faces turned away and recesses lose them faster than the all-round cool fill: a
  // crevice inside a warm pool falls to blue-black, not to dark amber.
#ifdef LAMP_DIR
  vec2 facing = placedFacing(ls, samplePos, n);
#else
  vec2 facing = vec2(1.0);
#endif
  vec3 ambient = ambientFrom(ls, ng, facing, ao) * shade * aoCurve;
  // A crystal's face would otherwise be lit by its own emission (sampled one voxel in front)
  // and then add its emission on top: the blown-out cube. Its light is for its surroundings.
  if (family == ${FAMILY.CRYSTAL}) ambient *= 0.3;
  vec3 lantern = lanternLight(samplePos, vWorldPos, ng, ls.a) * (0.4 + 0.6 * ao);
  vec3 color = albedo * (ambient + lantern + vec3(uDebug.x) * shade * aoCurve);

  float glow = tex.a * uMatGlow[shownLayer];
  vec3 emissive = tex.rgb * glow;

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

  // Mining feedback on the sculpted surface, not a cube frame: a soft warm light gathers around
  // the point the pick strikes (the ray hit, or where the line of sight to the block enters it),
  // spreading over the block's own faces, and fractures radiate from it as the damage grows
  // (stage 0-9), the stone's own joints and partings opening first. Red when too hard.
  if (all(equal(cell, ivec3(uTarget.xyz)))) {
    vec3 hit = uTargetHit.w > 0.5 ? uTargetHit.xyz : targetEntry(uTarget.xyz);
    vec3 dh = vWorldPos - hit;
    float r = length(dh);
    float spot = 1.0 - smoothstep(0.06, 0.7, r);
    if (uTarget.w >= 0.0) {
      float dmg = (uTarget.w - CRACK0 + 1.0) / CRACKS;
      // In-plane offset around the hit, snapped to the material texels: crisp pixel cracks.
      vec2 q = worldUv(dh, vFace) * MAT_PERIOD;
      q = (floor(q * ${MAT_DENSITY}.0) + 0.5) * (1.0 / ${MAT_DENSITY}.0);
      vec2 fr = fracture(q, dmg, hash13(vec3(cell)));
      float joints = (1.0 - smoothstep(0.1, 0.17, heightOf(tex, shownLayer))) * (1.0 - smoothstep(0.1 + dmg * 0.55, 0.22 + dmg * 0.55, r));
      float crack = max(fr.x, joints * smoothstep(0.1, 0.3, dmg));
      color *= (1.0 - crack * 0.78) * (1.0 + fr.y * 0.25);
    }
    vec3 spotColor = uTargetFx.z > 0.5 ? vec3(1.0, 0.36, 0.3) : vec3(1.0, 0.82, 0.58);
    color += spotColor * spot * spot * (0.025 + 0.05 * uTargetFx.y) + vec3(1.0, 0.92, 0.8) * uTargetFx.x * 0.2 * spot;
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
    },
    vertexShader: vertex,
    fragmentShader: fragment,
  });
}
