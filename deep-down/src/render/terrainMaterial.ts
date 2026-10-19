import * as THREE from 'three';
import { BLOCKS, SIDE_VARIANTS, VARIANT_COUNT } from '../config/blocks';
import { RUNE_COUNT, RUNE_FIRST_LAYER, TILE_NAMES, TILE_SIZE } from '../config/tiles';
import { LIGHTING_GLSL, type LightingUniforms } from './lighting';
import { FAMILY, MATERIAL_NAMES } from './materials';
import { MAT_DENSITY, MAT_SIZE } from './materials/paint';
import { OFFSET_RANGE } from './mesher';
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
  vAo = aData.y;
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
uniform sampler2DArray uTiles;
uniform sampler3D uNoise;
uniform float uMatGlow[${MATERIAL_NAMES.length}];
uniform vec4 uTarget;   // xyz = cell being mined, w = crack tile layer (< 0: none)
uniform vec4 uTargetFx; // x = impact flash, y = actively mining, z = too hard

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
const float RUNE0 = ${RUNE_FIRST_LAYER}.0;
const int RUNES = ${RUNE_COUNT};

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

void main() {
#ifdef DEBUG_CLIP
  if (vWorldPos.y > uDebug.y) discard; // debug section view only: discard would disable early-Z
#endif
  vec3 n = FACE_N[vFace];
  ivec3 cell = ivec3(floor(vGrid - n * 0.5));
  int family = vFlags & 3;
  int layer = int(vLayer + 0.5);
  vec2 uv = worldUv(vGrid, vFace);
  vec4 tex = texture(uMat, vec3(uv, float(layer)));
  int shownLayer = layer;

#ifdef USE_BLEND
  // Natural boundaries: near an edge shared with a different material of the same family (the
  // mesher lists those partners per face edge), the material that is "taller" at this texel
  // (rock nubs, pebbles, vein metal) pushes across. Both faces evaluate the same world-space
  // test, so they agree exactly. Faces without partners pay nothing.
  if (family != 0 && min(min(vNb.x, vNb.y), min(vNb.z, vNb.w)) < 254.5) {
    int ax = vFace >> 1;
    vec3 t1 = ax == 0 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0);
    vec3 t2 = ax == 2 ? vec3(0.0, 1.0, 0.0) : vec3(0.0, 0.0, 1.0);
    float wobble = texture(uNoise, vGrid * (1.0 / 3.1)).a - 0.5;
    float hs = heightOf(tex, layer);
    for (int k = 0; k < 2; k++) {
      float l = dot(fract(vGrid), k == 0 ? t1 : t2);
      int side = l < 0.5 ? -1 : 1;
      float d = side < 0 ? l : 1.0 - l;
      float nlf = k == 0 ? (side < 0 ? vNb.x : vNb.y) : (side < 0 ? vNb.z : vNb.w);
      if (nlf > 254.5 || d > 0.6) continue;
      int nl = int(nlf + 0.5);
      vec4 ntex = texture(uMat, vec3(uv, nlf));
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

  // Macro variation (about 1.2 m and 6 m features) instead of a per-block brightness jitter,
  // which used to reveal the cube grid.
#ifdef NO_MACRO
  float macro = 0.5;
#else
  float macro = texture(uNoise, vGrid * (1.0 / 38.0)).a * 0.65 + texture(uNoise, vGrid * (1.0 / 190.0)).b * 0.35;
#endif
  vec3 albedo = tex.rgb * (0.84 + 0.32 * macro);

  // Shading normal of the sculpted surface: smooth across natural rock (the mesher's lattice
  // normal, bent by the relief), flat on masonry, crystal and timber. NO_DERIV: face normal.
#ifdef NO_DERIV
  vec3 ng = n;
#else
  vec3 ng = normalize(vNormal);
#endif

  vec3 samplePos = vGrid + n * 0.5;
  vec4 ls = lightSample(samplePos);
  float ao = vAo / 3.0;
  float aoCurve = 0.42 + 0.58 * ao;
  float shade = shadeOf(ng);
  vec3 ambient = ambientFrom(ls) * shade * aoCurve;
  // A crystal's face would otherwise be lit by its own emission (sampled one voxel in front)
  // and then add its emission on top: the blown-out cube. Its light is for its surroundings.
  if (family == ${FAMILY.CRYSTAL}) ambient *= 0.3;
  vec3 lantern = lanternLight(samplePos, vWorldPos, ng, ls.a) * (0.55 + 0.45 * ao);
  vec3 color = albedo * (ambient + lantern + vec3(uDebug.x) * shade * aoCurve);

  float glow = tex.a * uMatGlow[shownLayer];
  vec3 emissive = tex.rgb * glow;

  // Carved runes: decals in the builders' script, eroded by world-space noise, dim until the
  // explorer's lantern comes close ("the inscriptions answer the light"). Inscriptions are
  // horizontal bands, so the rune follows the position along the band (x + z; stride 3 is
  // coprime with 8, so no rune repeats within 8 stones) from a per-course start: it reads as
  // a line of text, not a scatter of stickers. A slow pulse travels along the line.
  if ((vFlags & 4) != 0 && vFace != 2 && vFace != 3) {
    float h = hash13(vec3(cell));
    int along = cell.x + cell.z;
    int start = int(hash13(vec3(0.5, float(cell.y), 0.5)) * float(RUNES));
    float rl = RUNE0 + float((along * 3 + start) % RUNES);
    vec4 rune = texture(uTiles, vec3(vUv, rl));
    float erosion = smoothstep(0.32, 0.62, texture(uNoise, vGrid * (1.0 / 2.3) + h * 7.0).g);
    float ink = rune.a * erosion;
    float wake = smoothstep(9.0, 2.5, distance(uLanternPos, vGrid));
    color = mix(color, color * 0.45, ink * 0.8); // carved: the groove is darker
    emissive += rune.rgb * ink * (0.12 + 0.9 * wake) * (0.85 + 0.15 * sin(uTime * 1.1 - float(along) * 0.8));
  }

  // Mining feedback on the exact sculpted surface.
  if (all(equal(cell, ivec3(uTarget.xyz)))) {
    if (uTarget.w >= 0.0) {
      float crack = texture(uTiles, vec3(vUv, uTarget.w)).a;
      color *= 1.0 - crack * 0.85;
    }
    vec2 lf = abs(vUv - 0.5);
    float rim = smoothstep(0.43, 0.5, max(lf.x, lf.y));
    vec3 rimColor = uTargetFx.z > 0.5 ? vec3(1.0, 0.36, 0.3) : vec3(1.0, 0.86, 0.64);
    color += rimColor * rim * (0.05 + 0.1 * uTargetFx.y) + vec3(1.0, 0.92, 0.8) * uTargetFx.x * 0.25;
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
  return new THREE.ShaderMaterial({
    glslVersion: THREE.GLSL3,
    defines,
    uniforms: {
      ...lighting,
      ...terrain,
      uTiles: { value: tiles },
    },
    vertexShader: vertex,
    fragmentShader: fragment,
  });
}
