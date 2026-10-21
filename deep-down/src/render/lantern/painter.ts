// The Lantern Voxel stone painter (W1-LEAD §1, §4; ported from reference/spike-lantern/src/painter.ts).
//
// Paints the material layers of layers.ts once at load, on the GPU, straight into two texture arrays (no read-back,
// no CPU pass; the spike's 10.5 s paint becomes tens of milliseconds):
//   A (sRGB): albedo rgb + height a;
//   B (linear): tangent-space normal xy (from the height, Sobel on the GPU) + roughness z + mask w (metal or glow).
// Each layer is one world-space tile of TILE_M metres, periodic, sampled biplanar in the surface shader at two scales
// and with per-block variation, so it never repeats visibly within 8 m. The fine detail (grain, pits, micro-normal)
// lives in the surface shader, resolution-free, so the base resolution stays low (memory ≈ 4.6 MB with mips).

import * as THREE from 'three';
import { LAYER_COUNT, LAYER_FINISH } from './layers';

/** Texels per layer edge, and the world size of one tile (m): 256 / 1.6 m = 160 texels per metre. */
export const PAINT_RES = 256;
export const TILE_M = 1.6;

const PAINT_GLSL = /* glsl */ `
precision highp float;
uniform int uMat;
uniform float uSeed;
varying vec2 vUv;

float h12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
vec2 h22(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * vec3(.1031, .1030, .0973)); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.xx + p3.yz) * p3.zy); }
vec2 wid(vec2 i, float P) { return mod(i, P) + uSeed * vec2(13.17, 7.31); }
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
vec3 srgb(float r, float g, float b) { return pow(vec3(r, g, b) / 255., vec3(2.2)); }
vec3 ramp3(vec3 a, vec3 b, vec3 c, float t) { return t < .5 ? mix(a, b, t * 2.) : mix(b, c, t * 2. - 1.); }

// A face of chiselled stone: big facets with soft creases, smaller chisel planes, a hairline crack.
struct Stone { float h; float tone; float crease; float rim; float facet; };
Stone stone(vec2 uv, float bigP, float slope, float crackAmt) {
  Stone s;
  vec2 w = vec2(fbm(uv + 3.1, 3., 3), fbm(uv + 8.7, 3., 3)) * .07;
  vec2 rel;
  vec4 v = voro((uv + w) * bigP, bigP, 1., rel);
  vec2 sl = (h22(v.zw + 3.7) - .5) * slope;
  float fh = dot(-rel, sl) + (h12(v.zw + 1.3) - .5) * .16;
  float cr = smoothstep(.0, .06, v.y);
  vec2 rel2;
  vec4 v2 = voro((uv + w * 1.3) * (bigP * 3.), bigP * 3., 1., rel2);
  vec2 sl2 = (h22(v2.zw + 5.1) - .5) * slope * .35;
  float fh2 = dot(-rel2, sl2);
  float lo = fbm(uv + 5.3, 2., 4);
  float grain = fbm(uv, 32., 2);
  float cf = gnoise((uv + w * 2.) * 3., 3.) + .3 * gnoise(uv * 6., 6.);
  float cw = .0035 + .003 * (.5 + .5 * gnoise(uv * 5. + 2., 5.));
  float on = smoothstep(.1, .3, gnoise(uv * 2. + 9. + uSeed, 2.)) * crackAmt;
  float crack = (1. - smoothstep(cw * .35, cw, abs(cf))) * on;
  float lip = (smoothstep(cw, cw * 2.2, cf) - smoothstep(cw * 2.2, cw * 4., cf)) * on;
  s.h = .5 + .6 * fh + .2 * fh2 - (1. - cr) * .06 + lo * .12 + grain * .03 - crack * .25;
  s.crease = cr;
  s.rim = lip;
  s.facet = h12(v.zw + 9.1);
  s.tone = .5 + .35 * lo + (s.facet - .5) * .26 + fh * .3 + grain * .08 - crack * .55 + lip * .12;
  return s;
}

void paint(int mat, vec2 uv, out vec3 alb, out float h, out float rough, out float mask) {
  mask = 0.;
  rough = .82;
  if (mat == 0 || mat == 3 || mat == 4) {
    // Slate (0): blue-grey with cool green shadows; umber (3): warm grey-brown; moss stone (4): green-grey.
    Stone s = stone(uv, 8., .9, 1.);
    vec3 dark = srgb(40., 50., 62.), mid = srgb(78., 90., 102.), lite = srgb(122., 132., 142.);
    if (mat == 3) { dark = srgb(56., 48., 44.); mid = srgb(102., 90., 80.); lite = srgb(146., 132., 116.); }
    if (mat == 4) { dark = srgb(40., 52., 50.); mid = srgb(74., 92., 86.); lite = srgb(112., 128., 118.); }
    alb = ramp3(dark, mid, lite, clamp(s.tone, 0., 1.));
    alb *= mix(vec3(1.), vec3(1.07, 1.0, .93), step(.72, s.facet));
    alb *= mix(.86, 1., s.crease);
    vec2 mr;
    vec4 mv = voro(uv * 44., 44., 1., mr);
    float mica = (1. - smoothstep(.04, .09, mv.x)) * step(.88, h12(mv.zw + 3.));
    alb = mix(alb, lite * 1.4, mica * .4);
    if (mat == 4) {
      // Moss in the creases and on the upper rims of facets.
      float moss = smoothstep(.15, .6, fbm(uv + 2.2, 4., 4) * .5 + .5 - s.h * .4) * .7 + (1. - s.crease) * .3;
      alb = mix(alb, srgb(58., 88., 52.) * (.8 + .4 * s.tone), clamp(moss, 0., 1.) * .55);
    }
    h = s.h;
    rough = .78 - mica * .35;
  } else if (mat == 1 || mat == 5) {
    // Worn floor: flatter slate, dust in the joints, gravel; mossFloor (5): root litter and moss.
    Stone s = stone(uv, 7., .5, .5);
    vec3 dark = srgb(56., 56., 58.), mid = srgb(92., 90., 88.), lite = srgb(130., 126., 118.);
    if (mat == 5) { dark = srgb(44., 50., 40.); mid = srgb(76., 84., 66.); lite = srgb(110., 116., 92.); }
    alb = ramp3(dark, mid, lite, clamp(s.tone * .9 + .05, 0., 1.));
    vec2 rel;
    vec4 pv = voro(uv * 22., 22., .9, rel);
    float pr = .22 + .14 * h12(pv.zw);
    float peb = (1. - smoothstep(pr * .7, pr, pv.x)) * step(.8, h12(pv.zw + 3.3));
    float dust = smoothstep(.0, .5, fbm(uv + 7.7, 3., 4) + .1) * .5 + (1. - s.crease) * .6;
    alb = mix(alb, mat == 5 ? srgb(70., 64., 48.) : srgb(132., 124., 114.), clamp(dust, 0., 1.) * .45);
    alb = mix(alb, ramp3(dark, mid, lite, h12(pv.zw + 6.) * .4 + .5), peb * .7);
    if (mat == 5) {
      float twig = 1. - smoothstep(.004, .011, abs(gnoise(uv * 7. + 3., 7.)));
      twig *= smoothstep(-.1, .25, gnoise(uv * 9. + 1., 9.));
      alb = mix(alb, srgb(92., 70., 48.), twig * .5);
    }
    h = s.h * .8 + peb * .07 * sqrt(max(0., 1. - pv.x / pr)) - (1. - s.crease) * .02;
    rough = .86;
  } else if (mat == 2) {
    // Soil: dark warm earth, clumps, pebbles, pale root fibres.
    vec2 rel;
    vec4 v = voro(uv * 12., 12., .9, rel);
    float clump = sqrt(max(0., 1. - v.x * 1.4));
    float n = fbm(uv + 2.2, 4., 5);
    vec3 dark = srgb(34., 28., 26.), mid = srgb(62., 50., 44.), lite = srgb(92., 76., 62.);
    alb = ramp3(dark, mid, lite, clamp(.45 + n * .6 + clump * .15 + (h12(v.zw) - .5) * .2, 0., 1.));
    vec2 w = vec2(fbm(uv + 5., 3., 3), fbm(uv + 9., 3., 3)) * .2;
    float fib = 1. - smoothstep(.003, .009, abs(gnoise((uv + w) * 5., 5.)));
    fib *= smoothstep(-.1, .2, gnoise(uv * 6. + 3., 6.));
    alb = mix(alb, srgb(112., 90., 66.), fib * .45);
    vec2 rp;
    vec4 pv = voro(uv * 18., 18., .9, rp);
    float peb = (1. - smoothstep(.12, .2, pv.x)) * step(.82, h12(pv.zw + 1.7));
    alb = mix(alb, srgb(96., 96., 98.) * (.7 + .5 * h12(pv.zw)), peb * .8);
    h = .45 + clump * .3 + n * .2 + fib * .1 + peb * .15;
    rough = .93;
  } else if (mat == 6) {
    // Grotto stone: deep blue-violet, glassy creases with pale mineral crust, rare cyan flecks.
    Stone s = stone(uv, 5., 1.1, .4);
    vec3 dark = srgb(34., 36., 62.), mid = srgb(62., 66., 104.), lite = srgb(102., 108., 146.);
    alb = ramp3(dark, mid, lite, clamp(s.tone, 0., 1.));
    alb = mix(alb, srgb(130., 150., 190.), (1. - s.crease) * .08);
    vec2 rel;
    vec4 fv = voro(uv * 18., 18., .9, rel);
    float fl = (1. - smoothstep(.035, .07, fv.x)) * step(.975, h12(fv.zw + 2.));
    alb = mix(alb, srgb(120., 230., 240.), fl);
    h = s.h + fl * .08;
    rough = .55 + .2 * s.crease;
    mask = fl;
  } else if (mat == 7) {
    // Basalt: near-black violet-grey, polygonal joints, vesicles.
    vec2 w = vec2(fbm(uv + 2.4, 2., 3), fbm(uv + 6.1, 2., 3)) * .05;
    vec2 rel;
    vec4 v = voro((uv + w) * 5., 5., .55, rel);
    float j = smoothstep(.0, .07, v.y);
    vec2 rel2;
    vec4 pv = voro(uv * 24., 24., .9, rel2);
    float pit = (1. - smoothstep(.06, .13, pv.x)) * step(.55, h12(pv.zw));
    float n = fbm(uv + 3.3, 3., 5);
    vec3 dark = srgb(24., 22., 28.), mid = srgb(46., 42., 52.), lite = srgb(76., 70., 82.);
    alb = ramp3(dark, mid, lite, clamp(.45 + n * .55 + (h12(v.zw) - .5) * .3, 0., 1.)) * mix(.55, 1., j);
    alb *= 1. - pit * .45;
    vec2 sl = (h22(v.zw + 1.) - .5) * .5;
    h = .55 + dot(-rel, sl) * j - (1. - j) * .25 - pit * .12 + n * .06;
    rough = .7 - .1 * j;
  } else if (mat == 8) {
    // Halden masonry: courses of dressed blocks (0.4 m, staggered), tooled faces, mortar.
    float rows = 4.;
    float r = uv.y * rows;
    float ri = floor(r);
    float cols = 2. + step(.5, h12(vec2(ri, 3.)));
    float c = uv.x * cols + .5 * mod(ri, 2.);
    float ci = floor(c);
    vec2 f = vec2(fract(c), fract(r));
    float jx = min(f.x, 1. - f.x) / cols, jy = min(f.y, 1. - f.y) / rows;
    float joint = min(jx * 1.6, jy);
    float mortar = 1. - smoothstep(.006, .014, joint);
    float bevel = smoothstep(.006, .03, joint);
    float id = h12(vec2(mod(ci, cols * 4.), ri) + uSeed);
    float tool = fbm(uv * vec2(1., 1.) + id * 7., 12., 3);
    vec3 dark = srgb(70., 70., 72.), mid = srgb(112., 108., 102.), lite = srgb(152., 146., 134.);
    alb = ramp3(dark, mid, lite, clamp(.5 + (id - .5) * .35 + tool * .3, 0., 1.));
    alb = mix(alb, srgb(54., 50., 46.), mortar * .85);
    h = .62 * bevel + .3 + tool * .06 - mortar * .25;
    rough = .82;
  } else if (mat == 9) {
    // Timber: planks along u with grain, knots and dark gaps.
    float pl = fract(uv.y * 8.);
    float pid = floor(uv.y * 8.);
    float gap = smoothstep(.0, .05, pl) * smoothstep(1., .95, pl);
    float wv = fbm(vec2(uv.x, uv.y * 8.) + pid * 3.1, 3., 3);
    float grain = .5 + .5 * sin((pl * 9. + wv * 6. + uv.x * 1.5) * 6.2832);
    float n = fbm(uv * vec2(2., 8.) + pid, 4., 3);
    vec2 kr;
    vec4 kv = voro(uv * vec2(6., 8.), 6., .8, kr);
    float knot = (1. - smoothstep(.05, .14, kv.x)) * step(.84, h12(kv.zw + pid));
    vec3 dark = srgb(56., 38., 26.), mid = srgb(104., 74., 50.), lite = srgb(146., 110., 78.);
    alb = ramp3(dark, mid, lite, clamp(.48 + n * .4 + grain * .14 + (h12(vec2(pid, uSeed)) - .5) * .3 - knot * .4, 0., 1.));
    alb *= mix(.35, 1., gap);
    h = .5 + grain * .05 + n * .1 - (1. - gap) * .35 - knot * .08;
    rough = .72;
  } else if (mat == 10 || mat == 11) {
    // Iron (10): hammered dark metal with rivets. Brass (11): warm worn brass with a darker patina.
    vec2 rel;
    vec4 v = voro(uv * 14., 14., .9, rel);
    float ham = sqrt(max(0., 1. - v.x * 1.3));
    vec2 rc = vec2(fract(uv.x * 6.) - .5, fract(uv.y * 3.) - .5);
    float rv = length(rc * vec2(1., 2.));
    float rivet = (1. - smoothstep(.09, .12, rv)) * step(.86, fract(uv.y * 3.) * 0. + .9);
    float n = fbm(uv + 1.1, 6., 4);
    if (mat == 10) alb = mix(srgb(60., 60., 66.), srgb(112., 112., 120.), clamp(.5 + n * .5 + ham * .1, 0., 1.));
    else alb = mix(srgb(120., 84., 34.), srgb(214., 168., 92.), clamp(.55 + n * .5 + ham * .1, 0., 1.));
    float patina = smoothstep(.2, .7, fbm(uv + 4.4, 3., 4) * .5 + .5);
    alb = mix(alb, mat == 10 ? srgb(84., 48., 34.) : srgb(80., 92., 70.), patina * .35);
    alb = mix(alb, alb * 1.25, rivet);
    h = .5 + ham * .06 + rivet * .35 * sqrt(max(0., 1. - rv / .12));
    rough = mix(.42, .7, patina) - rivet * .1;
    mask = 1. - patina * .6;
  } else if (mat == 12) {
    // Root bark: long fibrous ridges, dark grooves.
    vec2 w = vec2(fbm(uv + 1.3, 3., 3), 0.) * .12;
    float ridge = .5 + .5 * sin((uv.x + w.x) * 6.2832 * 14.);
    float n = fbm(uv * vec2(4., 1.), 4., 4);
    vec3 dark = srgb(36., 26., 20.), mid = srgb(76., 56., 40.), lite = srgb(118., 92., 66.);
    alb = ramp3(dark, mid, lite, clamp(.4 + ridge * .3 + n * .4, 0., 1.));
    h = .4 + ridge * .3 + n * .2;
    rough = .86;
  } else {
    // Crystal host (13): dark glassy rock with luminous seams (the mask carries the glow).
    Stone s = stone(uv, 4., 1.2, .2);
    vec3 dark = srgb(20., 24., 34.), mid = srgb(40., 46., 62.), lite = srgb(70., 80., 98.);
    alb = ramp3(dark, mid, lite, clamp(s.tone, 0., 1.));
    float seam = 1. - smoothstep(0., .05, abs(gnoise(uv * 3. + 1., 3.) + .3 * gnoise(uv * 7., 7.)));
    alb = mix(alb, srgb(150., 210., 220.), seam * .5);
    h = s.h - seam * .1;
    rough = mix(.45, .2, seam);
    mask = seam;
  }
  h = clamp(h, 0., 1.);
}
`;

const PAINT_FRAG = /* glsl */ `
${PAINT_GLSL}
void main() {
  vec3 alb; float h, rough, mask;
  paint(uMat, vUv, alb, h, rough, mask);
  // Linear albedo: the array is SRGB8_ALPHA8, so the hardware encodes on write and decodes on sampling (exact 8-bit
  // sRGB storage, no double encoding). The height in alpha stays linear.
  gl_FragColor = vec4(clamp(alb, 0., 1.), h);
}
`;

// Normal + roughness + mask from the painted height (pass 2): a periodic Sobel on the GPU. Roughness and mask are
// recomputed by the same paint function (cheap at 256²) so they line up texel for texel.
const NORMAL_FRAG = /* glsl */ `
${PAINT_GLSL}
uniform highp sampler2DArray tA;
uniform float uLayer;
uniform float uStrength;
float hgt(vec2 o) { return texture(tA, vec3(fract(vUv + o / ${PAINT_RES}.), uLayer)).a; }
void main() {
  float dx = hgt(vec2(1., -1.)) + 2. * hgt(vec2(1., 0.)) + hgt(vec2(1., 1.)) - hgt(vec2(-1., -1.)) - 2. * hgt(vec2(-1., 0.)) - hgt(vec2(-1., 1.));
  float dy = hgt(vec2(-1., 1.)) + 2. * hgt(vec2(0., 1.)) + hgt(vec2(1., 1.)) - hgt(vec2(-1., -1.)) - 2. * hgt(vec2(0., -1.)) - hgt(vec2(1., -1.));
  vec3 n = normalize(vec3(-dx * uStrength, -dy * uStrength, 1.));
  vec3 alb; float h, rough, mask;
  paint(uMat, vUv, alb, h, rough, mask);
  gl_FragColor = vec4(n.xy * .5 + .5, rough, mask);
}
`;

export interface StoneTextures {
  albedo: THREE.Texture;
  normal: THREE.Texture;
  /** Paint time (ms, CPU side of the GPU passes). */
  ms: number;
}

let cached: StoneTextures | null = null;
let cachedFor: THREE.WebGLRenderer | null = null;

/** Paint (once per renderer) and return the two layer arrays. */
export function stoneTextures(renderer: THREE.WebGLRenderer): StoneTextures {
  if (cached && cachedFor === renderer) return cached;
  const t0 = performance.now();
  const mk = (srgb: boolean) => {
    const rt = new THREE.WebGLArrayRenderTarget(PAINT_RES, PAINT_RES, LAYER_COUNT, { depthBuffer: false, type: THREE.UnsignedByteType });
    const t = rt.texture;
    t.format = THREE.RGBAFormat;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    t.magFilter = THREE.LinearFilter;
    t.generateMipmaps = false;
    t.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    return rt;
  };
  const rtA = mk(true);
  const rtB = mk(false);
  const vert = 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0., 1.); }';
  const matA = new THREE.ShaderMaterial({ vertexShader: vert, fragmentShader: PAINT_FRAG, uniforms: { uMat: { value: 0 }, uSeed: { value: 0 } }, depthTest: false, depthWrite: false });
  const matB = new THREE.ShaderMaterial({
    vertexShader: vert,
    fragmentShader: NORMAL_FRAG,
    uniforms: { uMat: { value: 0 }, uSeed: { value: 0 }, tA: { value: rtA.texture }, uLayer: { value: 0 }, uStrength: { value: 4 } },
    depthTest: false,
    depthWrite: false,
  });
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), matA);
  quad.frustumCulled = false;
  const scene = new THREE.Scene();
  scene.add(quad);
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const prev = renderer.getRenderTarget();
  const prevAuto = renderer.autoClear;
  renderer.autoClear = false;
  for (let l = 0; l < LAYER_COUNT; l++) {
    matA.uniforms.uMat.value = l;
    matA.uniforms.uSeed.value = l + 1;
    quad.material = matA;
    renderer.setRenderTarget(rtA, l);
    renderer.render(scene, cam);
  }
  for (let l = 0; l < LAYER_COUNT; l++) {
    matB.uniforms.uMat.value = l;
    matB.uniforms.uSeed.value = l + 1;
    matB.uniforms.uLayer.value = l;
    matB.uniforms.uStrength.value = 4.4 * LAYER_FINISH[l].normal;
    quad.material = matB;
    renderer.setRenderTarget(rtB, l);
    renderer.render(scene, cam);
  }
  renderer.setRenderTarget(prev);
  renderer.autoClear = prevAuto;
  // Mipmaps for both arrays (the textures are sampled minified at distance).
  const gl = renderer.getContext() as WebGL2RenderingContext;
  for (const rt of [rtA, rtB]) {
    const props = renderer.properties.get(rt.texture) as { __webglTexture?: WebGLTexture };
    if (props.__webglTexture) {
      gl.bindTexture(gl.TEXTURE_2D_ARRAY, props.__webglTexture);
      gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
      gl.generateMipmap(gl.TEXTURE_2D_ARRAY);
      gl.bindTexture(gl.TEXTURE_2D_ARRAY, null);
    }
  }
  matA.dispose();
  matB.dispose();
  quad.geometry.dispose();
  cached = { albedo: rtA.texture, normal: rtB.texture, ms: performance.now() - t0 };
  cachedFor = renderer;
  return cached;
}
