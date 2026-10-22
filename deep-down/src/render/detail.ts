import * as THREE from 'three';

/**
 * HD stone: the close-up surface detail of the terrain (and the structures), painted once per
 * renderer on the GPU into one texture array (no read-back, no CPU pass; ported from the Lantern
 * Voxel painter of the hybrid snapshot, reference/spike-lantern).
 *
 * The material layers (render/materials) carry each material's colour and identity at 16 texels per
 * metre: right for reading distance, but in first person a wall at arm's length shows a texel as a
 * 60 px block. The detail layers carry the form at 256 texels per metre: chiselled facets with soft
 * creases, flagstones worn smooth, soil clumps and pebbles, tooled faces of dressed stone, timber
 * grain and crystal fractures. The terrain shader samples them in world space (biplanar on natural
 * rock, per face on cut stone), bends its shading normal by them, darkens the creases (cavity) and
 * keeps the material colour from the material layer, now sampled smooth near the lens.
 *
 * Layout (linear RGBA8, mipmapped, repeat): rg tangent-space normal xy (0.5 = flat), b height,
 * a tone (0.5 = neutral; albedo multiplier 0.5 + tone).
 */

/** Texels per layer edge and world size of one tile (m): 512 / 2 m = 256 texels per metre. */
export const DETAIL_RES = 512;
export const DETAIL_TILE = 2.0;

/** Detail layers. */
export const DETAIL = { rock: 0, floor: 1, earth: 2, dressed: 3, timber: 4, crystal: 5 } as const;
export const DETAIL_LAYERS = 6;
/** Normal strength per layer (Sobel gain). */
const STRENGTH = [4.2, 3.0, 2.6, 1.5, 1.6, 2.4];

const PAINT_GLSL = /* glsl */ `
precision highp float;
uniform int uLayer;
uniform float uSeed;
in vec2 vUv;

float h12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
vec2 h22(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * vec3(.1031, .1030, .0973)); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.xx + p3.yz) * p3.zy); }
vec2 wid(vec2 i, float P) { return mod(i, P) + uSeed * vec2(13.17, 7.31); }
// Periodic gradient noise (period P cells over the tile).
float gnoise(vec2 p, float P) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * f * (f * (f * 6. - 15.) + 10.);
  vec2 ga = h22(wid(i, P)) * 2. - 1.;
  vec2 gb = h22(wid(i + vec2(1, 0), P)) * 2. - 1.;
  vec2 gc = h22(wid(i + vec2(0, 1), P)) * 2. - 1.;
  vec2 gd = h22(wid(i + vec2(1, 1), P)) * 2. - 1.;
  float va = dot(ga, f), vb = dot(gb, f - vec2(1, 0)), vc = dot(gc, f - vec2(0, 1)), vd = dot(gd, f - vec2(1, 1));
  return mix(mix(va, vb, u.x), mix(vc, vd, u.x), u.y);
}
float fbm(vec2 uv, float P, int oct) {
  float s = 0., a = .5, w = 0., per = P;
  for (int i = 0; i < 6; i++) {
    if (i >= oct) break;
    s += a * gnoise(uv * per, per);
    w += a;
    a *= .5;
    per *= 2.;
  }
  return s / w;
}
// Periodic Voronoi: x = F1, y = distance to the cell border, zw = wrapped cell id; rel = feature point - p.
vec4 voro(vec2 p, float P, float jit, out vec2 rel) {
  vec2 n = floor(p), f = fract(p);
  float md = 8.;
  vec2 mr = vec2(0.), mg = vec2(0.);
  for (int j = -1; j <= 1; j++)
    for (int i = -1; i <= 1; i++) {
      vec2 g = vec2(float(i), float(j));
      vec2 o = .5 + (h22(wid(n + g, P)) - .5) * jit;
      vec2 r = g + o - f;
      float d = dot(r, r);
      if (d < md) { md = d; mr = r; mg = g; }
    }
  float ed = 8.;
  for (int j = -2; j <= 2; j++)
    for (int i = -2; i <= 2; i++) {
      vec2 g = mg + vec2(float(i), float(j));
      vec2 o = .5 + (h22(wid(n + g, P)) - .5) * jit;
      vec2 r = g + o - f;
      if (dot(mr - r, mr - r) > 1e-5) ed = min(ed, dot(.5 * (mr + r), normalize(r - mr)));
    }
  rel = mr;
  return vec4(sqrt(md), ed, mod(n + mg, P));
}

// Chiselled stone: big facets (each its own tilted plane) with soft creases, smaller chisel planes
// inside them, a hairline crack here and there, low-frequency swell and a fine grain.
void stone(vec2 uv, float bigP, float slope, float crackAmt, float creaseW, out float h, out float tone) {
  vec2 w = vec2(fbm(uv + 3.1, 3., 3), fbm(uv + 8.7, 3., 3)) * .07;
  vec2 rel;
  vec4 v = voro((uv + w) * bigP, bigP, 1., rel);
  vec2 sl = (h22(v.zw + 3.7) - .5) * slope;
  float fh = dot(-rel, sl) + (h12(v.zw + 1.3) - .5) * .16;
  float cr = smoothstep(.0, creaseW, v.y);
  vec2 rel2;
  vec4 v2 = voro((uv + w * 1.3) * (bigP * 3.), bigP * 3., 1., rel2);
  vec2 sl2 = (h22(v2.zw + 5.1) - .5) * slope * .35;
  float fh2 = dot(-rel2, sl2) * smoothstep(0., .05, v2.y);
  float lo = fbm(uv + 5.3, 2., 4);
  float grain = fbm(uv, 32., 2);
  float cf = gnoise((uv + w * 2.) * 3., 3.) + .3 * gnoise(uv * 6., 6.);
  float cw = .0035 + .003 * (.5 + .5 * gnoise(uv * 5. + 2., 5.));
  float on = smoothstep(.1, .3, gnoise(uv * 2. + 9. + uSeed, 2.)) * crackAmt;
  float crack = (1. - smoothstep(cw * .35, cw, abs(cf))) * on;
  float lip = (smoothstep(cw, cw * 2.2, cf) - smoothstep(cw * 2.2, cw * 4., cf)) * on;
  float facet = h12(v.zw + 9.1);
  // Not every border is a joint: along some the stone is one piece and the crease fades out, so
  // the face reads as a few stones with weathered planes, not as crazy paving.
  float joint = .25 + .75 * smoothstep(-.15, .25, gnoise((uv + w) * 4. + 3.3, 4.));
  cr = 1. - (1. - cr) * joint;
  // Bevelled plates: the height rounds off toward each facet's border (a chamfer the light catches).
  float bev = smoothstep(0., creaseW * 2.4, v.y);
  h = .5 + .6 * fh + .2 * fh2 - (1. - bev) * .14 - (1. - cr) * .08 + lo * .12 + grain * .03 - crack * .25;
  tone = .5 + .12 * lo + (facet - .5) * .36 + fh * .3 + grain * .05 - (1. - cr) * .3 - (1. - bev) * .06 - crack * .32 + lip * .06;
}

void paint(int layer, vec2 uv, out float h, out float tone) {
  if (layer == 0) {
    // Rock walls: chunky facets about 0.4 m across.
    stone(uv, 5., .9, 1., .07, h, tone);
  } else if (layer == 1) {
    // Worn floor: flatter, larger plates, dust in the joints, a few pebbles.
    stone(uv, 4., .45, .5, .06, h, tone);
    vec2 rel;
    vec4 pv = voro(uv * 22., 22., .9, rel);
    float pr = .22 + .14 * h12(pv.zw);
    float peb = (1. - smoothstep(pr * .7, pr, pv.x)) * step(.82, h12(pv.zw + 3.3));
    float dust = smoothstep(.0, .5, fbm(uv + 7.7, 3., 4) + .1);
    tone = mix(tone, .5, dust * .25);
    h = h * .8 + peb * .08 * sqrt(max(0., 1. - pv.x / pr));
    tone += peb * .06;
  } else if (layer == 2) {
    // Soil and gravel (round 2): packed earth broken into irregular flat-topped cakes by fine dry
    // crevices (not round domes, which read as hammered metal up close), a coarse grit, a few
    // half-buried pebbles and root fibres.
    vec2 w = vec2(fbm(uv + 5., 3., 3), fbm(uv + 9., 3., 3)) * .2;
    vec2 rel;
    vec4 v = voro((uv + w * .6) * 9., 9., .95, rel);
    float cake = smoothstep(.0, .06 + .04 * h12(v.zw), v.y);
    // Not every border has opened: along some the earth is still one piece (no giraffe net).
    float open = .2 + .8 * smoothstep(-.1, .3, gnoise((uv + w) * 4. + 1.7, 4.));
    cake = 1. - (1. - cake) * open;
    float tilt = dot(-rel, (h22(v.zw + 2.1) - .5) * .5);
    float n = fbm(uv + 2.2, 4., 5);
    float grit = fbm(uv + 1.3, 40., 2);
    vec2 rp;
    vec4 pv = voro(uv * 18., 18., .9, rp);
    float pr = .1 + .08 * h12(pv.zw + 4.1);
    float peb = (1. - smoothstep(pr * .6, pr, pv.x)) * step(.74, h12(pv.zw + 1.7));
    float fib = (1. - smoothstep(.003, .009, abs(gnoise((uv + w) * 5., 5.)))) * smoothstep(-.1, .2, gnoise(uv * 6. + 3., 6.));
    h = .42 + cake * .2 + tilt * .12 + n * .2 + (grit - .5) * .1 + fib * .05 + peb * .16 * sqrt(max(0., 1. - pv.x / pr));
    tone = .5 + n * .18 + (h12(v.zw + 6.3) - .5) * .14 - (1. - cake) * .2 + (grit - .5) * .12 + peb * .14 + fib * .08;
  } else if (layer == 3) {
    // Dressed stone: tooled faces (short parallel chisel strokes in patches), pitting, soft swell.
    float lo = fbm(uv + 1.7, 3., 4);
    vec2 rel;
    vec4 pv = voro(uv * 30., 30., .9, rel);
    float pit = (1. - smoothstep(.05, .14, pv.x)) * step(.78, h12(pv.zw));
    vec2 rc;
    vec4 pat = voro(uv * 6., 6., .8, rc);
    float ang = h12(pat.zw) * 3.14159;
    vec2 dir = vec2(cos(ang), sin(ang));
    // Broad tool planes, no fine strokes (a 2 cm stroke pattern moirés on floors at a few metres).
    float tool = gnoise(vec2(dot(uv, dir), dot(uv, vec2(-dir.y, dir.x))) * vec2(18., 4.), 4.) * smoothstep(.0, .06, pat.y);
    float grain = fbm(uv, 48., 2);
    h = .5 + lo * .18 + tool * .06 - pit * .12 + grain * .03 - (1. - smoothstep(0., .03, pat.y)) * .02;
    // Round 2: a little more tooling, wear and pitting in the tone, so dressed floors and walls at
    // arm's length read as worked stone, not smooth plaster.
    tone = .5 + lo * .17 + tool * .05 - pit * .3 + grain * .07 + (h12(pat.zw + 2.) - .5) * .09;
  } else if (layer == 4) {
    // Timber: grain along u, a few checks (splits) and knots.
    float wv = fbm(uv * vec2(1., 6.), 3., 3);
    float grain = .5 + .5 * sin((uv.y * 40. + wv * 5. + uv.x * .7) * 6.2832);
    float fine = fbm(uv * vec2(2., 24.), 4., 3);
    float chk = (1. - smoothstep(.002, .006, abs(gnoise(vec2(uv.x * 3., uv.y * 22.), 3.) * .1 + fract(uv.y * 11.) - .5))) * step(.6, h12(vec2(floor(uv.y * 11.), 1.)));
    vec2 kr;
    vec4 kv = voro(uv * vec2(4., 8.), 4., .8, kr);
    float knot = (1. - smoothstep(.05, .14, kv.x)) * step(.86, h12(kv.zw));
    h = .5 + grain * .08 + fine * .1 - chk * .3 - knot * .1;
    tone = .5 + grain * .07 + fine * .12 - chk * .3 - knot * .25;
  } else {
    // Crystal: a few large fracture planes with sharp edges and inner veils.
    vec2 rel;
    vec4 v = voro(uv * 3., 3., 1., rel);
    vec2 sl = (h22(v.zw + 1.1) - .5) * 1.6;
    float edge = smoothstep(0., .015, v.y);
    float veil = fbm(uv + 4.4, 4., 4);
    h = .5 + dot(-rel, sl) * .5 - (1. - edge) * .1;
    tone = .5 + veil * .2 + (h12(v.zw) - .5) * .2 - (1. - edge) * .15;
  }
  h = clamp(h, 0., 1.);
  tone = clamp(tone, 0., 1.);
}
`;

const PAINT_FRAG = /* glsl */ `
${PAINT_GLSL}
layout(location = 0) out highp vec4 fragColor;
void main() {
  float h, tone;
  paint(uLayer, vUv, h, tone);
  fragColor = vec4(h, tone, 0., 1.);
}
`;

// Normal from the painted height: a periodic Sobel on the GPU.
const NORMAL_FRAG = /* glsl */ `
precision highp float;
precision highp sampler2DArray;
uniform sampler2DArray tH;
uniform float uLayerF;
uniform float uStrength;
in vec2 vUv;
layout(location = 0) out highp vec4 fragColor;
float hgt(vec2 o) { return texture(tH, vec3(fract(vUv + o / ${DETAIL_RES}.), uLayerF)).r; }
void main() {
  float dx = hgt(vec2(1., -1.)) + 2. * hgt(vec2(1., 0.)) + hgt(vec2(1., 1.)) - hgt(vec2(-1., -1.)) - 2. * hgt(vec2(-1., 0.)) - hgt(vec2(-1., 1.));
  float dy = hgt(vec2(-1., 1.)) + 2. * hgt(vec2(0., 1.)) + hgt(vec2(1., 1.)) - hgt(vec2(-1., -1.)) - 2. * hgt(vec2(0., -1.)) - hgt(vec2(1., -1.));
  vec3 n = normalize(vec3(-dx * uStrength, -dy * uStrength, 1.));
  vec4 c = texture(tH, vec3(vUv, uLayerF));
  fragColor = vec4(n.xy * .5 + .5, c.r, c.g);
}
`;

const VERT = /* glsl */ `
out vec2 vUv;
void main() { vUv = position.xy * 0.5 + 0.5; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

function placeholder(): THREE.DataArrayTexture {
  // Flat normal, mid height, neutral tone: until the renderer paints, or without a GPU (unit tests).
  const t = new THREE.DataArrayTexture(new Uint8Array(DETAIL_LAYERS * 4).fill(128), 1, 1, DETAIL_LAYERS);
  t.format = THREE.RGBAFormat;
  t.type = THREE.UnsignedByteType;
  t.needsUpdate = true;
  return t;
}

/**
 * The shared detail uniform: every terrain and structure material holds this one object, so the
 * painted array reaches them all once `paintDetail` has run (Renderer's constructor runs it).
 */
export const DETAIL_UNIFORM: THREE.IUniform<THREE.Texture> = { value: placeholder() };

let painted: { renderer: THREE.WebGLRenderer; target: THREE.WebGLArrayRenderTarget; ms: number } | null = null;

/** Paint the detail layers (once per renderer) and publish them through DETAIL_UNIFORM. @returns ms */
export function paintDetail(renderer: THREE.WebGLRenderer): number {
  if (painted && painted.renderer === renderer) return painted.ms;
  const t0 = performance.now();
  const mk = (mips: boolean) => {
    const rt = new THREE.WebGLArrayRenderTarget(DETAIL_RES, DETAIL_RES, DETAIL_LAYERS, { depthBuffer: false, type: THREE.UnsignedByteType });
    const t = rt.texture;
    t.format = THREE.RGBAFormat;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.magFilter = THREE.LinearFilter;
    t.minFilter = mips ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter;
    t.generateMipmaps = mips;
    t.colorSpace = THREE.NoColorSpace;
    if (mips) t.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
    return rt;
  };
  const rtH = mk(false);
  const rtD = mk(true);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
  const matH = new THREE.ShaderMaterial({ glslVersion: THREE.GLSL3, vertexShader: VERT, fragmentShader: PAINT_FRAG, uniforms: { uLayer: { value: 0 }, uSeed: { value: 0 } }, depthTest: false, depthWrite: false });
  const matN = new THREE.ShaderMaterial({
    glslVersion: THREE.GLSL3,
    vertexShader: VERT,
    fragmentShader: NORMAL_FRAG,
    uniforms: { tH: { value: rtH.texture }, uLayerF: { value: 0 }, uStrength: { value: 1 } },
    depthTest: false,
    depthWrite: false,
  });
  const quad = new THREE.Mesh(geo, matH);
  quad.frustumCulled = false;
  const scene = new THREE.Scene();
  scene.add(quad);
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const prev = renderer.getRenderTarget();
  for (let l = 0; l < DETAIL_LAYERS; l++) {
    matH.uniforms.uLayer.value = l;
    matH.uniforms.uSeed.value = l + 1;
    quad.material = matH;
    renderer.setRenderTarget(rtH, l);
    renderer.render(scene, cam);
  }
  for (let l = 0; l < DETAIL_LAYERS; l++) {
    matN.uniforms.uLayerF.value = l;
    matN.uniforms.uStrength.value = STRENGTH[l];
    quad.material = matN;
    renderer.setRenderTarget(rtD, l);
    renderer.render(scene, cam);
  }
  renderer.setRenderTarget(prev);
  matH.dispose();
  matN.dispose();
  geo.dispose();
  rtH.dispose();
  DETAIL_UNIFORM.value = rtD.texture;
  painted = { renderer, target: rtD, ms: performance.now() - t0 };
  return painted.ms;
}

/** Release the painted array (Renderer.dispose). */
export function disposeDetail(renderer: THREE.WebGLRenderer): void {
  if (!painted || painted.renderer !== renderer) return;
  painted.target.dispose();
  painted = null;
  DETAIL_UNIFORM.value = placeholder();
}

/** Detail layer, strength (0..~1.2) and roughness of a material layer (by name; unknown names get rock). */
export function detailOf(name: string): { layer: number; k: number; rough: number } {
  // Round 3: the biome layers (materials/strata.ts).
  if (name === 'frostIce') return { layer: DETAIL.crystal, k: 0.4, rough: 0.12 };
  if (name === 'obsidian' || name === 'obsidianFloor') return { layer: DETAIL.crystal, k: 0.5, rough: 0.12 };
  if (/^(sporeQuartz|amethyst|iceCrystal|verdite|mireOpal|emberite|voidshard)$/.test(name)) return { layer: DETAIL.crystal, k: 0.7, rough: 0.16 };
  if (name === 'lava' || name === 'magmaCore') return { layer: DETAIL.rock, k: 0.6, rough: 0.8 };
  if (name === 'toxicPool') return { layer: DETAIL.earth, k: 0.4, rough: 0.18 };
  if (/^(mushroomStem|thickRoot|glowVine)$/.test(name)) return { layer: DETAIL.timber, k: 0.6, rough: 0.7 };
  if (/^cap(Teal|Magenta)$/.test(name)) return { layer: DETAIL.earth, k: 0.5, rough: 0.6 };
  if (/^(frostSnow|sporeLoam|mycelFloor|rootEarthTop|rootEarthSide|rootFloor|jungleLoam|jungleMoss|bogMud|bogCrust|ashFloor|amberFloor|floodFloor|geodeFloor|mineFloor)$/.test(name)) return { layer: DETAIL.earth, k: name === 'frostSnow' ? 0.6 : 1, rough: name === 'floodFloor' ? 0.4 : 0.9 };
  if (/^(cityStone|cityBrick|gateSeal)$/.test(name)) return { layer: DETAIL.dressed, k: 1, rough: 0.6 };
  if (name === 'cityTile') return { layer: DETAIL.dressed, k: 1.2, rough: 0.55 };
  if (/^(goldVein|silverVein|frostIron|orichalcum|starsteel|runegold|pearlOre|amberOre|sapAmber|coalSeam|sulphurOre)$/.test(name)) return { layer: DETAIL.rock, k: 1, rough: 0.45 };
  if (/^flood/.test(name)) return { layer: /Top$/.test(name) ? DETAIL.floor : DETAIL.rock, k: 1, rough: 0.36 };
  if (/crystal/i.test(name)) return { layer: DETAIL.crystal, k: 0.7, rough: 0.18 };
  if (name === 'gemOre') return { layer: DETAIL.crystal, k: 0.7, rough: 0.16 };
  if (name === 'roots') return { layer: DETAIL.timber, k: 0.7, rough: 0.7 };
  if (name === 'rubble') return { layer: DETAIL.rock, k: 1.1, rough: 0.7 };
  if (/^(plank|beam)/.test(name)) return { layer: DETAIL.timber, k: name === 'beamEnd' ? 0.5 : 0.8, rough: 0.66 };
  if (/^(soil|gravel)/.test(name)) return { layer: DETAIL.earth, k: 1, rough: 0.92 };
  if (name === 'floorSlab') return { layer: DETAIL.dressed, k: 1.25, rough: 0.6 };
  if (/^(masonry|floorSlab|hearth|script)/.test(name)) return { layer: DETAIL.dressed, k: 1, rough: 0.62 };
  if (/^crumbling/.test(name)) return { layer: DETAIL.dressed, k: 1.1, rough: 0.7 };
  const damp = /^damp/.test(name);
  const rough = damp ? 0.36 : /^(copper|iron)/.test(name) ? 0.5 : 0.62;
  if (/Top$/.test(name)) return { layer: DETAIL.floor, k: 1, rough: rough + 0.08 };
  return { layer: DETAIL.rock, k: name === 'bedrock' ? 1.15 : 1, rough };
}

/** GLSL tables of detailOf for a material list: DETAIL_L (int), DETAIL_K and DETAIL_R (float). */
export function detailGlsl(names: readonly string[]): string {
  const d = names.map(detailOf);
  return /* glsl */ `
const int DETAIL_L[${d.length}] = int[](${d.map((x) => x.layer).join(', ')});
const float DETAIL_K[${d.length}] = float[](${d.map((x) => x.k.toFixed(2)).join(', ')});
const float DETAIL_R[${d.length}] = float[](${d.map((x) => x.rough.toFixed(2)).join(', ')});
const float DETAIL_INV = ${(1 / DETAIL_TILE).toFixed(4)};
`;
}
