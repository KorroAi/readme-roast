import * as THREE from 'three';
import { Rng } from '../core/rng';
import { BIOME_LOOKS, EMITTER_RAMPS, SPECIAL_RAMPS, SECTION_STYLE, type SlotLook } from '../idle/config/biomeLooks';

/**
 * The section look (W2 seam 1, owner 2D): how a cut-plane face of the descent is painted, shared by the
 * terrain shader (terrainMaterial.ts) and B's shards (render/fx/shardMaterial.ts), so at F0 a shard looks
 * exactly like the face it replaces.
 *
 * The section is painted procedurally per pixel (CRITIQUE B7, B8; SPEC §11.2): every block of every biome has a
 * 5-stop albedo ramp and a pattern style (strata, soft, hard, ore, glow, gem, wood, masonry, glass, metal,
 * bone, chest, organic, fibrous) from `src/idle/config/biomeLooks.ts`. The pattern is evaluated in world metres,
 * so a 44 px cell at DPR 3 shows laminations, clasts, veins, facets and grain at full resolution: there are no
 * texels to stair-step. One 3D noise texture (the terrain's 32^3 lattice) gives the mid and large scales; the
 * fine grain is an ALU hash faded out below 2 px per feature.
 *
 * GLSL contract (include LIGHTING_GLSL first; it provides uLanternPos, uTime and cameraPosition):
 *
 *   float sectionRow(float blockId)
 *       The ramp row of a block id (biome blocks 64..175, specials 41..56, emitters 176..191), -1 otherwise.
 *   SecTexel sectionTexel(vec2 p, float row)
 *       Albedo (linear), height 0..1 (for the emboss), specular mask and emissive amount at world point p
 *       (metres on the cut plane: x right, y up) of ramp row `row`.
 *   vec3 sectionLight(SecTexel s, vec2 p, vec3 diffuse, vec3 lantern, vec3 worldPos)
 *       Its lit colour without emission: albedo x diffuse x the emboss, plus the lantern's glint on ore, gem
 *       and metal. `diffuse` is every light reaching the face (key, light volume, fills, impacts), `lantern`
 *       the dig lantern's light at the face (for the specular), `worldPos` the shaded point.
 *   vec3 sectionEmission(SecTexel s)        its emission (add it after any fog so treasure glows through)
 *   float sectionValue(float row)           0 rock, 1 ore, 2 rich, 3 gem or chest
 *   vec3 sectionShade(vec2 p, float blockId, vec3 diffuse, vec3 lantern, vec3 worldPos)
 *       All of it in one call (light + emission); black for an id without a row (keep your own path).
 *   float sectionIdAt(ivec2 cell)           the block id of a cut-plane voxel (x, world y), -1 if unbound
 *
 * Uniforms (`sectionUniforms()`, one shared set: every material that includes the chunk spreads it into its
 * uniforms): uSecRamp, uSecParam, uSecNoise, uSecIds, uSecIdsOn, uSecFallback, uSecHue.
 */

/** Stops per ramp. */
export const RAMP_STOPS = 5;
/** Ramp rows: 112 biome blocks (64 + 8 b + slot), 16 specials (41..56), 16 emitters (176..191). */
export const SECTION_ROWS = 144;
export const SPECIAL_ROW0 = 112;
export const EMITTER_ROW0 = 128;

/** The ramp row of a block id, or -1 (pure; the GLSL `sectionRow` matches it). */
export function sectionRow(blockId: number): number {
  if (blockId >= 64 && blockId < 176) return blockId - 64;
  if (blockId >= 41 && blockId < 57) return SPECIAL_ROW0 + (blockId - 41);
  if (blockId >= 176 && blockId < 192) return EMITTER_ROW0 + (blockId - 176);
  return -1;
}

/** The slot look of a row (pure; null where no block paints there). */
export function slotLookOfRow(row: number): SlotLook | null {
  if (row < 0) return null;
  if (row < SPECIAL_ROW0) {
    const b = Math.floor(row / 8);
    return BIOME_LOOKS[b]?.ramps[row % 8] ?? null;
  }
  if (row < EMITTER_ROW0) return SPECIAL_RAMPS[row - SPECIAL_ROW0] ?? null;
  return EMITTER_RAMPS[row - EMITTER_ROW0] ?? null;
}

export interface SectionTables {
  /** RAMP_STOPS x SECTION_ROWS RGBA8, sRGB stops (alpha 255). */
  ramp: Uint8Array;
  /** 2 x SECTION_ROWS RGBA8 linear params: (style, scale, layering, clasts) (specular, emission, cover, warp). */
  param: Uint8Array;
}

const byte = (v: number) => Math.max(0, Math.min(255, Math.round(v * 255)));

/** Builds the ramp and parameter tables from the look table (pure, deterministic). */
export function buildSectionTables(): SectionTables {
  const ramp = new Uint8Array(RAMP_STOPS * SECTION_ROWS * 4);
  const param = new Uint8Array(2 * SECTION_ROWS * 4);
  for (let row = 0; row < SECTION_ROWS; row++) {
    const s = slotLookOfRow(row) ?? { stops: [0x202020, 0x303030, 0x404040, 0x505050, 0x606060], style: 'strata' as const };
    for (let i = 0; i < RAMP_STOPS; i++) {
      const hex = s.stops[i];
      const o = (row * RAMP_STOPS + i) * 4;
      ramp[o] = (hex >> 16) & 255;
      ramp[o + 1] = (hex >> 8) & 255;
      ramp[o + 2] = hex & 255;
      ramp[o + 3] = 255;
    }
    const p = row * 2 * 4;
    param[p] = SECTION_STYLE[s.style];
    param[p + 1] = byte((s.scale ?? 1) / 4);
    param[p + 2] = byte(s.layering ?? 0.5);
    param[p + 3] = byte(s.clasts ?? 0.3);
    param[p + 4] = byte(s.spec ?? 0);
    param[p + 5] = byte(s.emit ?? 0);
    param[p + 6] = byte(s.cover ?? 0.5);
    param[p + 7] = byte(s.warp ?? 0.5);
  }
  return { ramp, param };
}

export interface SectionUniforms {
  [name: string]: THREE.IUniform;
  uSecRamp: THREE.IUniform<THREE.DataTexture>;
  uSecParam: THREE.IUniform<THREE.DataTexture>;
  uSecNoise: THREE.IUniform<THREE.Data3DTexture>;
  /** 64 x 160 R8 ring: the block id of every cut-plane voxel (SectionIds), when bound. */
  uSecIds: THREE.IUniform<THREE.DataTexture>;
  /** 1 once a SectionIds texture is bound; 0: ids are guessed from the layer and depth (uSecFallback). */
  uSecIdsOn: THREE.IUniform<number>;
  /** Fallback biome: x the biome above the boundary, y the one below, z the boundary's world y. */
  uSecFallback: THREE.IUniform<THREE.Vector4>;
  /** Echo strata: hue rotation (radians) of ore, gem and glow rows. */
  uSecHue: THREE.IUniform<number>;
}

let shared: SectionUniforms | null = null;

/** The 32^3 RGBA tiling value-noise lattice (the terrain's uNoise; trilinear + repeat). */
export function makeNoise3D(): THREE.Data3DTexture {
  const n = 32;
  const data = new Uint8Array(n * n * n * 4);
  const rng = new Rng(424242);
  for (let i = 0; i < data.length; i++) data[i] = Math.floor(rng.next() * 256);
  const t = new THREE.Data3DTexture(data, n, n, n);
  t.format = THREE.RGBAFormat;
  t.type = THREE.UnsignedByteType;
  t.minFilter = t.magFilter = THREE.LinearFilter;
  t.wrapS = t.wrapT = t.wrapR = THREE.RepeatWrapping;
  t.generateMipmaps = false;
  t.unpackAlignment = 1;
  t.needsUpdate = true;
  return t;
}

/** The shared section uniforms (one set for the terrain and every shard material). */
export function sectionUniforms(): SectionUniforms {
  if (shared) return shared;
  const tables = buildSectionTables();
  const ramp = new THREE.DataTexture(tables.ramp, RAMP_STOPS, SECTION_ROWS, THREE.RGBAFormat, THREE.UnsignedByteType);
  ramp.colorSpace = THREE.SRGBColorSpace;
  ramp.minFilter = ramp.magFilter = THREE.LinearFilter;
  ramp.wrapS = ramp.wrapT = THREE.ClampToEdgeWrapping;
  ramp.generateMipmaps = false;
  ramp.needsUpdate = true;
  const param = new THREE.DataTexture(tables.param, 2, SECTION_ROWS, THREE.RGBAFormat, THREE.UnsignedByteType);
  param.minFilter = param.magFilter = THREE.NearestFilter;
  param.generateMipmaps = false;
  param.needsUpdate = true;
  const ids = new THREE.DataTexture(new Uint8Array(4), 1, 1, THREE.RedFormat, THREE.UnsignedByteType);
  ids.needsUpdate = true;
  shared = {
    uSecRamp: { value: ramp },
    uSecParam: { value: param },
    uSecNoise: { value: makeNoise3D() },
    uSecIds: { value: ids },
    uSecIdsOn: { value: 0 },
    uSecFallback: { value: new THREE.Vector4(0, 0, -1e9, 0) },
    uSecHue: { value: 0 },
  };
  return shared;
}

/**
 * The live look for self-lit materials (Vista layers, light cones, set pieces): fog colours, the accent and
 * a clock. BiomeLook.update() writes it every frame.
 */
export interface LookShared {
  [name: string]: THREE.IUniform;
  uLookFog: THREE.IUniform<THREE.Color>;
  uLookFogLow: THREE.IUniform<THREE.Color>;
  uLookAccent: THREE.IUniform<THREE.Color>;
  uLookTime: THREE.IUniform<number>;
  /** Haze density (1/m) and the distance it starts at (the glass plane). */
  uLookFogK: THREE.IUniform<THREE.Vector2>;
  /** The grade pair for the composite: x and y the biome indices (their LUTs), z the blend toward y. */
  uLookGrade: THREE.IUniform<THREE.Vector3>;
}

let sharedLook: LookShared | null = null;

export function lookShared(): LookShared {
  if (sharedLook) return sharedLook;
  sharedLook = {
    uLookFog: { value: new THREE.Color(0.02, 0.02, 0.025) },
    uLookFogLow: { value: new THREE.Color(0.01, 0.01, 0.012) },
    uLookAccent: { value: new THREE.Color(1, 0.7, 0.36) },
    uLookTime: { value: 0 },
    uLookFogK: { value: new THREE.Vector2(0.0267, 15) },
    uLookGrade: { value: new THREE.Vector3(0, 0, 0) },
  };
  return sharedLook;
}

/** GLSL for lookShared(): the haze of the current look at a distance (matches lighting.ts fogFactor). */
export const LOOK_FOG_GLSL = /* glsl */ `
uniform vec3 uLookFog;
uniform vec3 uLookFogLow;
uniform vec3 uLookAccent;
uniform float uLookTime;
uniform vec2 uLookFogK;
float lookFogAmount(float dist) {
  float f = max(dist - uLookFogK.y, 0.0) * uLookFogK.x;
  return 1.0 - exp(-f * f * 0.6 - f * 0.4);
}
`;

/** Ring size of the cut plane (RingWorld: 64 x 160). */
const IDS_W = 64;
const IDS_H = 160;
/** The cut plane's voxel layer (section faces are the +z faces of z = 59, at z = 60). */
const CUT_LAYER = 59;

/**
 * The block id of every cut-plane voxel as a 64 x 160 R8 ring texture, so the section shader paints each
 * face with its own biome's ramp (the ragged biome boundaries included). Construct it with the RingWorld's
 * block array and call `update()` once per frame: it compares the cut layer with its copy (10 KB) and
 * uploads when anything changed. Binding it switches the shared uniforms from the fallback to exact ids.
 */
export class SectionIds {
  readonly texture: THREE.DataTexture;
  private readonly data = new Uint8Array(IDS_W * IDS_H);

  constructor(private readonly blocks: Uint8Array) {
    this.texture = new THREE.DataTexture(this.data, IDS_W, IDS_H, THREE.RedFormat, THREE.UnsignedByteType);
    this.texture.minFilter = this.texture.magFilter = THREE.NearestFilter;
    this.texture.generateMipmaps = false;
    this.texture.unpackAlignment = 1;
    const u = sectionUniforms();
    u.uSecIds.value = this.texture;
    u.uSecIdsOn.value = 1;
    this.update();
    this.texture.needsUpdate = true;
  }

  /** Copy the cut layer if it changed (about 10k byte compares). Returns true when it uploads. */
  update(): boolean {
    const b = this.blocks;
    const d = this.data;
    const base = IDS_W * IDS_H * CUT_LAYER;
    let changed = false;
    for (let i = 0; i < d.length; i++) {
      const v = b[base + i];
      if (d[i] !== v) {
        d[i] = v;
        changed = true;
      }
    }
    if (changed) this.texture.needsUpdate = true;
    return changed;
  }

  dispose(): void {
    const u = sectionUniforms();
    if (u.uSecIds.value === this.texture) u.uSecIdsOn.value = 0;
    this.texture.dispose();
  }
}

/** Pattern style codes (GLSL `SEC_*`). */
const S = SECTION_STYLE;

export const SECTION_SHADE_GLSL = /* glsl */ `
uniform sampler2D uSecRamp;
uniform sampler2D uSecParam;
uniform highp sampler3D uSecNoise;
uniform highp sampler2D uSecIds;
uniform float uSecIdsOn;
uniform vec4 uSecFallback;
uniform float uSecHue;

struct SecTexel { vec3 albedo; float h; float spec; float emit; };

float sectionRow(float id) {
  if (id >= 63.5 && id < 175.5) return id - 64.0;
  if (id >= 40.5 && id < 56.5) return ${SPECIAL_ROW0}.0 + id - 41.0;
  if (id >= 175.5 && id < 191.5) return ${EMITTER_ROW0}.0 + id - 176.0;
  return -1.0;
}

// The section id of a cut-plane voxel from the SectionIds ring (exact), or -1 when none is bound.
float sectionIdAt(ivec2 cell) {
  if (uSecIdsOn < 0.5) return -1.0;
  int sy = ((cell.y % 160) + 160) % 160;
  return floor(texelFetch(uSecIds, ivec2(clamp(cell.x, 0, 63), sy), 0).r * 255.0 + 0.5);
}

float secH(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
// Value noise from the 32^3 lattice: p in lattice cells, z picks a slice.
vec4 secN(vec2 p, float z) { return textureLod(uSecNoise, vec3(p * (1.0 / 32.0), z), 0.0); }
vec3 secRamp(float row, float t) {
  return texture(uSecRamp, vec2((clamp(t, 0.0, 1.0) * ${RAMP_STOPS - 1}.0 + 0.5) / ${RAMP_STOPS}.0, (row + 0.5) / ${SECTION_ROWS}.0)).rgb;
}
vec3 secHueRotate(vec3 c, float a) {
  if (abs(a) < 1e-3) return c;
  const vec3 k = vec3(0.57735);
  float ca = cos(a);
  return c * ca + cross(k, c) * sin(a) + k * dot(k, c) * (1.0 - ca);
}

// ALU value noise (crisp fine scales the 32^3 lattice cannot reach): p in cells.
float secVN(vec2 p) {
  vec2 i = floor(p);
  vec2 f = p - i;
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(secH(i), secH(i + vec2(1.0, 0.0)), f.x), mix(secH(i + vec2(0.0, 1.0)), secH(i + 1.0), f.x), f.y);
}

// A field of rounded clasts on a jittered grid of cell size c (metres): x mask, y dome height, z hash, w the
// normalised distance from the clast's centre (1 at its outline).
vec4 secClasts(vec2 p, float c, float density, float aa, float seed) {
  vec2 q = p / c;
  vec2 i = floor(q);
  vec2 f = q - i;
  float h = secH(i + seed * 17.0);
  if (h > density) return vec4(0.0, 0.0, h, 9.0);
  vec2 ctr = 0.5 + (vec2(secH(i + 3.1 + seed), secH(i + 7.7 + seed)) - 0.5) * 0.3;
  float rad = 0.2 + 0.14 * secH(i + 11.3 + seed);
  float ang = secH(i + 2.3 + seed) * 3.1416;
  vec2 d = f - ctr;
  d = vec2(d.x * cos(ang) - d.y * sin(ang), d.x * sin(ang) + d.y * cos(ang)) * vec2(1.0, 1.25 + 0.5 * secH(i + 5.9));
  // A slightly lumpy outline, so pebbles are stones, not discs.
  float r = length(d) / rad * (1.0 + 0.12 * sin(atan(d.y, d.x) * 3.0 + h * 20.0));
  float m = 1.0 - smoothstep(1.0 - aa / (rad * c), 1.0, r);
  return vec4(m, sqrt(max(0.0, 1.0 - r * r)), fract(h * 13.7), r);
}

// Ridged iso-lines of two noise octaves: thin, jagged cracks (x) with a lit lip beside them (y).
vec2 secCracks(vec2 p, float freq, float width, float z) {
  float n = secN(p * freq, z).g * 0.88 + secVN(p * freq * 4.0) * 0.12;
  float d = abs(n - 0.5);
  // Cracks run in places and fade out between (a second, slower noise), never as an even net.
  float on = smoothstep(0.45, 0.65, secN(p * freq * 0.31, z + 0.53).r);
  float w = width * (0.5 + 0.9 * secN(p * freq * 0.37, z + 0.31).b) * on;
  return vec2(1.0 - smoothstep(0.0, w + 1e-4, d), (1.0 - smoothstep(w, w * 2.4 + 1e-4, d)) * step(0.5, n) * on);
}

// Faceted mineral grains (ore crystals, nuggets): octagons on a jittered grid, each with a lit facet (x mask,
// y dome, z hash, w normalised octagon distance).
vec4 secGrains(vec2 p, float c, float density, float aa, float seed) {
  vec2 q = p / c;
  vec2 i = floor(q);
  vec2 f = q - i;
  float h = secH(i + seed * 13.0);
  if (h > density) return vec4(0.0, 0.0, h, 9.0);
  vec2 ctr = 0.5 + (vec2(secH(i + 1.7 + seed), secH(i + 5.3 + seed)) - 0.5) * 0.36;
  float rad = 0.22 + 0.2 * secH(i + 8.1 + seed);
  float ang = secH(i + 3.9 + seed) * 0.785;
  vec2 d = f - ctr;
  d = abs(vec2(d.x * cos(ang) - d.y * sin(ang), d.x * sin(ang) + d.y * cos(ang))) * vec2(1.0, 1.0 + 0.6 * secH(i + 2.2));
  float r = max(max(d.x, d.y), (d.x + d.y) * 0.7071) / rad;
  float m = 1.0 - smoothstep(1.0 - aa / (rad * c), 1.0, r);
  return vec4(m, 1.0 - r, fract(h * 7.31), r);
}

// Large flat facets (crystal, glass, ice): a Voronoi whose cells each carry a planar gradient (a reflection
// sliding across the facet), so the face reads as cut glass. x tone 0..1, y edge 0..1, z facet hash.
vec3 secFacets(vec2 p, float cells, float aa) {
  vec2 q = p * cells;
  vec2 i = floor(q);
  vec2 f = q - i;
  float d1 = 9.0, d2 = 9.0;
  vec2 best = vec2(0.0);
  vec2 bc = vec2(0.0);
  for (int y = -1; y <= 1; y++)
    for (int x = -1; x <= 1; x++) {
      vec2 g = vec2(float(x), float(y));
      vec2 c = g + vec2(secH(i + g), secH(i + g + 9.1));
      float d = length(c - f);
      if (d < d1) { d2 = d1; d1 = d; best = i + g; bc = c; }
      else if (d < d2) d2 = d;
    }
  float id = secH(best + 4.4);
  float ang = id * 6.2832;
  float grad = dot(f - bc, vec2(cos(ang), sin(ang)));
  float edge = 1.0 - smoothstep(0.0, 0.05 + aa * cells, d2 - d1);
  return vec3(clamp(0.25 + 0.5 * id + grad * 0.6, 0.0, 1.0), edge, id);
}

SecTexel sectionTexel(vec2 p, float row) {
  SecTexel o;
  vec4 P0 = texelFetch(uSecParam, ivec2(0, int(row)), 0);
  vec4 P1 = texelFetch(uSecParam, ivec2(1, int(row)), 0);
  int style = int(P0.r * 255.0 + 0.5);
  float scale = max(P0.g * 4.0, 0.25);
  float layering = P0.b;
  float clastD = P0.a;
  float spec = P1.r;
  float emit = P1.g;
  float cover = P1.b;
  float warpK = P1.a;
  p = mod(p, 512.0);
  // Pixels per metre on screen, so detail finer than about 2 px fades instead of shimmering.
  float ppm = 1.0 / max(length(fwidth(p)), 1e-4);
  float aa = 1.6 / ppm;
  // Scene pixels per metre: about 57 at DPR 2 x 0.65 (Balanced), 64 at DPR 3; fine detail needs >= 2 px.
  float fineK = smoothstep(22.0, 50.0, ppm);
  vec4 nL = secN(p * 0.45, 0.13);
  vec4 nM = secN(p * 1.9 * scale, 0.47);
  vec4 nS = secN(p * 7.0 * scale, 0.81);
  float grain = (secH(floor(p * 96.0)) - 0.5) * fineK;
  float t = 0.5;
  float h = 0.5;
  o.spec = 0.0;
  o.emit = 0.0;
  // Bedding: beds 0.5-0.8 m thick that undulate through the section (warped in world space, no fixed dip).
  float yb = p.y + (nL.r - 0.5) * 1.8 * warpK + (nM.g - 0.5) * 0.14;
  float sand = (secVN(p * 26.0 * scale) - 0.5) * fineK;
  if (style == ${S.strata} || style == ${S.soft} || style == ${S.hard} || style == ${S.ore} || style == ${S.glow}) {
    float lf = (style == ${S.soft} ? 1.25 : 1.75) * scale;
    float lam = yb * lf;
    float band = floor(lam);
    float dm = (lam - band) / lf;
    t = 0.5 + (secH(vec2(band, 3.0)) - 0.5) * 0.38 * layering + (nM.r - 0.5) * 0.36 + (nS.g - 0.5) * 0.12 + sand * 0.12 + grain * 0.05;
    // Fine laminae inside each bed, and a crisp dark parting at its base with a lit lip below it.
    t -= (1.0 - smoothstep(0.0, 0.008 + aa, abs(fract(yb * 7.0 * scale + nS.b * 0.6) - 0.5) / (7.0 * scale))) * 0.07 * layering * fineK;
    // Partings come and go along the bed (they pinch out), so no line runs straight across the screen.
    float run = smoothstep(0.35, 0.6, secN(vec2(p.x * 0.6, band * 3.7), 0.91).a);
    float part = (1.0 - smoothstep(0.01 + aa * 0.5, 0.018 + aa, dm)) * layering * run;
    float lip = smoothstep(0.018 + aa, 0.028 + aa, dm) * (1.0 - smoothstep(0.032 + aa, 0.065 + aa, dm)) * layering * run;
    t += lip * 0.1 - part * 0.3;
    h = 0.5 + (nM.r - 0.5) * 0.35 + sand * 0.2 - part * 0.45 + lip * 0.15;
    if (style == ${S.soft}) t = mix(t, 0.5 + (nM.r - 0.5) * 0.4 + sand * 0.3, 0.35);
    if (style == ${S.hard}) {
      vec2 cr = secCracks(p, 1.1 * scale, 0.012 + aa * 0.6, 0.29);
      t = t * 0.85 - cr.x * 0.45 + cr.y * 0.14;
      h -= cr.x * 0.5 - cr.y * 0.15;
    }
    // Clasts: pebbles and grains standing out of the matrix, each with a dark rim and lit from the top left.
    if (clastD > 0.01) {
      vec4 c1 = secClasts(p, 0.24 / scale, clastD, aa, 1.0);
      vec4 c2 = secClasts(p + 0.37, 0.12 / scale, clastD * 0.85, aa, 2.0);
      bool big = c1.x >= c2.x * fineK;
      vec4 c = big ? c1 : c2;
      float cm = big ? c1.x : c2.x * fineK;
      float rim = smoothstep(0.7, 0.98, c.w);
      t = mix(t, 0.3 + 0.6 * c.z - rim * 0.3 + sand * 0.15, cm);
      h = mix(h, 0.55 + 0.45 * c.y, cm);
    }
    if (style == ${S.ore} || style == ${S.glow}) {
      // Ore: a dark matrix shot through with thin veins and faceted grains of the mineral, each grain lit on
      // its top-left facet and rimmed dark, so a cell reads as a fistful of metal or crystal, not a stain.
      t = 0.48 + (nM.r - 0.5) * 0.16 + sand * 0.14 - part * 0.1;
      h = 0.35 + sand * 0.2;
      float vn = secN(p * 1.2 * scale, 0.61).g * 0.8 + secVN(p * 6.0 * scale) * 0.2;
      float vd = abs(vn - 0.5);
      float vw = 0.018 + cover * 0.035;
      float vein = 1.0 - smoothstep(vw - aa * 0.6, vw + aa * 0.6, vd);
      vec4 g1 = secGrains(p + 1.3, 0.3 / scale, cover, aa, 3.0);
      vec4 g2 = secGrains(p + 0.71, 0.16 / scale, cover * 0.9, aa, 4.0);
      bool big = g1.x >= g2.x * fineK;
      vec4 g = big ? g1 : g2;
      float gm = big ? g1.x : g2.x * fineK;
      float m = max(vein * 0.9, gm);
      // The lit facet: the grain's top-left half is brighter than its bottom-right (a cut gem in the lamp).
      vec2 gq = fract((p + (big ? 1.3 : 0.71)) / (big ? 0.3 / scale : 0.16 / scale)) - 0.5;
      float facet = 0.5 + 0.5 * clamp(dot(gq, vec2(-0.7, 0.7)) * 3.0, -1.0, 1.0);
      float rim = smoothstep(0.72, 1.0, g.w) * gm;
      float tone = mix(0.62 + 0.3 * (1.0 - vd / max(vw, 1e-3)), 0.5 + 0.45 * facet + 0.1 * g.z, gm);
      t = mix(t, tone - rim * 0.35, m);
      h = mix(h, 0.55 + 0.45 * g.y, m);
      o.spec = spec * m * (0.35 + 0.65 * facet);
      o.emit = emit * m * (0.45 + 0.55 * facet);
    }
  } else if (style == ${S.gem}) {
    // Facets: a Voronoi of flat planes, each with its own value, bright edges and a glowing core.
    vec2 q = p * 5.5 * scale;
    vec2 i = floor(q);
    vec2 f = q - i;
    float d1 = 9.0, d2 = 9.0;
    float id = 0.0;
    for (int y = -1; y <= 1; y++)
      for (int x = -1; x <= 1; x++) {
        vec2 g = vec2(float(x), float(y));
        vec2 c = g + vec2(secH(i + g), secH(i + g + 9.1));
        float d = length(c - f);
        if (d < d1) { d2 = d1; d1 = d; id = secH(i + g + 4.4); }
        else if (d < d2) d2 = d;
      }
    float edge = 1.0 - smoothstep(0.0, 0.06 + aa * 5.5 * scale, d2 - d1);
    // Facet values centred on the mid stop (the gem's saturated colour), so a cell reads as its hue, not as pale glare.
    t = 0.24 + 0.46 * id + edge * 0.26 + (nS.r - 0.5) * 0.1;
    h = 0.4 + 0.5 * id + edge * 0.2;
    o.spec = spec * (0.5 + 0.5 * id);
    o.emit = emit * (0.55 + 0.45 * smoothstep(0.6, 0.0, d1)) + edge * emit * 0.3;
  } else if (style == ${S.wood}) {
    float yw = p.y + (nM.r - 0.5) * 0.35;
    float ring = fract(yw * 7.0 * scale + nL.g * 2.0);
    float knot = smoothstep(0.82, 0.95, nM.g) * 0.4;
    t = 0.32 + 0.35 * smoothstep(0.0, 0.7, ring) * (1.0 - smoothstep(0.7, 1.0, ring)) + (nS.r - 0.5) * 0.25 - knot + grain * 0.1;
    float plank = fract(p.y * 2.0 * scale);
    t -= (1.0 - smoothstep(0.0, 0.03 + aa * 2.0 * scale, plank)) * 0.25 * layering;
    h = t;
  } else if (style == ${S.chest}) {
    // A chest front in its cell: timber planks, a brass frame and lid band, corner rivets, a lock plate with
    // a keyhole, so the promise of treasure reads at a glance (V11).
    vec2 fr = fract(p);
    float plank = fract(fr.y * 5.0);
    float seam = 1.0 - smoothstep(0.0, 0.05 + aa * 5.0, min(plank, 1.0 - plank));
    float wood = 0.36 + 0.16 * secH(vec2(floor(fr.y * 5.0), floor(p.x) * 7.0 + floor(p.y))) + (nS.r - 0.5) * 0.2 + sand * 0.1;
    float e = min(min(fr.x, 1.0 - fr.x), min(fr.y, 1.0 - fr.y));
    float frame = 1.0 - smoothstep(0.075, 0.075 + aa * 1.5, e);
    float lid = 1.0 - smoothstep(0.035, 0.035 + aa * 1.5, abs(fr.y - 0.66));
    vec2 lq = abs(fr - vec2(0.5, 0.56));
    float plate = 1.0 - smoothstep(0.0, aa * 1.5, max(lq.x - 0.09, lq.y - 0.12));
    float key = 1.0 - smoothstep(0.0, aa * 1.5, max(abs(fr.x - 0.5) - 0.018, abs(fr.y - 0.53) - 0.045));
    vec2 rq = vec2(min(fr.x, 1.0 - fr.x), min(fr.y, 1.0 - fr.y)) - 0.075;
    float rivet = 1.0 - smoothstep(0.02, 0.02 + aa * 1.5, length(rq));
    float metal = max(max(frame, lid), plate);
    t = mix(wood - seam * 0.18, 0.78 + 0.18 * (nS.g - 0.5) + rivet * 0.2, metal);
    t = mix(t, 0.04, key);
    h = 0.5 + metal * 0.35 - seam * 0.2 + rivet * 0.2;
    o.spec = spec * metal;
    o.emit = emit * metal * (1.0 - key);
  } else if (style == ${S.masonry}) {
    float ch = 0.5 / scale;
    float course = floor(p.y / ch);
    float bl = 0.85 / scale;
    float off = fract(course * 0.5) * bl + secH(vec2(course, 1.0)) * 0.3;
    float bx = (p.x + off) / bl;
    vec2 cid = vec2(floor(bx), course);
    vec2 fr = vec2(fract(bx) * bl, fract(p.y / ch) * ch);
    float jw = 0.035 + aa;
    float joint = 1.0 - smoothstep(jw * 0.4, jw, min(min(fr.x, bl - fr.x), min(fr.y, ch - fr.y)));
    float chip = smoothstep(0.62, 0.8, nS.g) * smoothstep(jw * 3.0, 0.0, min(fr.x, fr.y));
    t = 0.42 + (secH(cid) - 0.5) * 0.36 + (nM.r - 0.5) * 0.25 + grain * 0.08 + sand * 0.08;
    t = mix(t, 0.08, max(joint, chip * 0.7));
    h = 0.7 - joint * 0.6 - chip * 0.4 + (nS.r - 0.5) * 0.15;
  } else if (style == ${S.glass}) {
    // Facet strength follows the layering param: host glass (obsidian, resin, ice) is calm, crystal lenses sparkle.
    vec3 fc = secFacets(p, 2.2 * scale, aa);
    vec2 cr = secCracks(p, 1.6 * scale, 0.008 + aa * 0.6, 0.57);
    float fk = layering * 2.0;
    t = mix(0.45 + (nL.g - 0.5) * 0.35, fc.x, 0.85 * min(1.0, fk)) + fc.y * 0.3 * fk + cr.x * 0.25 + (nM.g - 0.5) * 0.12;
    h = 0.45 + (fc.x * 0.3 + fc.y * 0.25) * min(1.0, fk);
    o.spec = spec * (0.6 + 0.4 * fc.z);
    o.emit = emit * (0.35 + 0.65 * fc.y + cr.x * 0.5);
  } else if (style == ${S.metal}) {
    float plateY = fract(p.y * 1.0 * scale);
    float plateX = fract((p.x + floor(p.y * scale) * 0.37) * 0.66 * scale);
    float seam = 1.0 - smoothstep(0.0, 0.02 + aa * scale, min(min(plateY, 1.0 - plateY), min(plateX, 1.0 - plateX) * 1.5));
    float brush = (secH(vec2(floor(p.y * 80.0), 1.0)) - 0.5) * fineK;
    vec2 rq = vec2(fract(plateX * 4.0) - 0.5, plateY - 0.12);
    float riv = 1.0 - smoothstep(0.05, 0.08 + aa * 4.0, length(rq * vec2(1.0, 4.0)) * 0.5);
    t = 0.55 + (nM.r - 0.5) * 0.3 + brush * 0.12 - seam * 0.4 + riv * 0.3 - smoothstep(0.7, 0.9, nL.b) * 0.25;
    h = 0.6 - seam * 0.5 + riv * 0.4;
    o.spec = spec * (1.0 - seam) * (0.7 + 0.3 * nS.r);
  } else if (style == ${S.bone}) {
    float rings = fract((yb + nM.g * 0.6) * 4.0 * scale);
    vec4 pore = secClasts(p, 0.06 / scale, 0.45 * clastD, aa, 5.0);
    t = 0.55 + (nM.r - 0.5) * 0.3 + smoothstep(0.85, 1.0, rings) * -0.18 - pore.x * 0.35 * fineK + grain * 0.06;
    h = 0.6 + (nM.r - 0.5) * 0.3 - pore.x * 0.4;
    o.spec = spec * 0.4;
  } else if (style == ${S.organic}) {
    vec4 c1 = secClasts(p, 0.32 / scale, 0.85, aa, 6.0);
    vec4 c2 = secClasts(p + 0.5, 0.19 / scale, 0.75, aa, 7.0);
    float cm = max(c1.x, c2.x);
    float dome = max(c1.y * c1.x, c2.y * c2.x);
    t = mix(0.18 + (nM.r - 0.5) * 0.2, 0.42 + 0.5 * dome, cm);
    h = 0.3 + 0.6 * dome;
    o.emit = emit * dome * dome;
    o.spec = spec * dome;
  } else {
    // Fibrous (mycelium, light threads): wandering bright strands on a dark matrix.
    float f1 = abs(fract(yb * 9.0 * scale + nM.g * 3.0) - 0.5);
    float f2 = abs(fract((p.x * 0.4 + yb) * 6.0 * scale + nM.b * 2.0) - 0.5);
    float w = 0.06 + aa * 9.0 * scale;
    float strand = max(1.0 - smoothstep(0.0, w, f1), (1.0 - smoothstep(0.0, w, f2)) * 0.7);
    t = 0.2 + (nM.r - 0.5) * 0.2 + strand * 0.65;
    h = 0.3 + strand * 0.5;
    o.emit = emit * strand;
  }
  vec3 a = secRamp(row, t);
  if (o.emit > 0.0 || style == ${S.gem}) a = secHueRotate(a, uSecHue);
  o.albedo = a;
  o.h = clamp(h, 0.0, 1.0);
  return o;
}

// The lit colour of a section texel without its emission: albedo x diffuse x the emboss, plus the lantern's
// glint on ore, gem and metal (CRITIQUE B SHOULD 3: Blinn-Phong on the emboss normal).
vec3 sectionLight(SecTexel s, vec2 p, vec3 diffuse, vec3 lantern, vec3 worldPos) {
  // Emboss: the height's screen gradient as a normal (the cut faces the camera), lit from the top left.
  float ppm = 1.0 / max(length(fwidth(p)), 1e-4);
  vec2 g = vec2(dFdx(s.h), -dFdy(s.h)) * ppm * 0.022;
  float emb = clamp(1.0 + dot(g, vec2(-0.55, 0.83)), 0.6, 1.45);
  vec3 col = s.albedo * diffuse * emb;
  if (s.spec > 0.01) {
    vec3 nn = normalize(vec3(-g * 2.5, 1.0));
    vec3 l = normalize(uLanternPos - worldPos);
    vec3 v = normalize(cameraPosition - worldPos);
    float sp = pow(max(dot(nn, normalize(l + v)), 0.0), 40.0);
    // A soft knee on the highlight: glints far from the flame keep their punch, the mirror right behind it
    // (glass back walls 2-4 m from the lantern) cannot burn the stage white.
    vec3 hi = lantern * (s.spec * sp * 2.2);
    col += hi / (1.0 + 0.6 * max(hi.r, max(hi.g, hi.b))) + s.albedo * lantern * s.spec * 0.35;
  }
  return col;
}

// Emission of a section texel (the terrain adds it after the fog of rock, so treasure glows through).
vec3 sectionEmission(SecTexel s) { return s.albedo * s.emit * 1.0; }

// Value class of a ramp row (0 rock, 1 ore, 2 rich, 3 gem or chest): glints, the pulse, the shine sweep.
float sectionValue(float row) {
  if (row < ${SPECIAL_ROW0}.0) {
    float slot = mod(row, 8.0);
    return slot > 3.5 && slot < 6.5 ? slot - 3.0 : 0.0;
  }
  if (row < ${EMITTER_ROW0}.0) {
    float k = row - ${SPECIAL_ROW0}.0;
    return k < 0.5 ? 3.0 : abs(k - 3.0) < 0.5 ? 2.0 : abs(k - 4.0) < 0.5 ? 3.0 : abs(k - 5.0) < 0.5 ? 2.0 : 0.0;
  }
  return 0.0;
}

vec3 sectionShade(vec2 p, float blockId, vec3 diffuse, vec3 lantern, vec3 worldPos) {
  float row = sectionRow(blockId);
  if (row < 0.0) return vec3(0.0);
  SecTexel s = sectionTexel(p, row);
  return sectionLight(s, p, diffuse, lantern, worldPos) + sectionEmission(s);
}
`;
