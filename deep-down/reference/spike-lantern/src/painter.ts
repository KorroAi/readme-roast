// Procedural block textures, painted once at load on the GPU (one full-screen pass per layer and channel set),
// read back and packed into two 512 x 512 texture arrays with mipmaps:
//   albedo (sRGB) + height,   tangent normal (from the height, on the CPU) + roughness + mask (metal or glow).
// Every pattern is periodic over the tile so per-block offsets and rotations never show a seam.
// The look is "painted stone": a few big chiselled facets per block face, soft tonal variation, sparse detail.

import * as THREE from 'three';
import { LAYER_COUNT } from './grid';

export const TEX = 512;

/** Layer -> [material id in the shader, seed, normal strength]. Order matches grid.ts LAYER. */
const LAYERS: Array<[number, number, number]> = [
  [0, 1, 1.0], [0, 2, 1.0], [0, 3, 1.0], [0, 4, 1.0], // rock
  [1, 5, 0.8], [1, 6, 0.8], // floor
  [2, 7, 1.0], [2, 8, 1.0], // ore
  [3, 9, 1.0], // gem host
  [4, 10, 0.9], // soil
  [5, 11, 1.0], [5, 12, 1.0], // grotto
  [6, 13, 0.8], // grotto floor
  [7, 14, 1.0], [7, 15, 1.0], // basalt
  [8, 16, 1.0], [8, 17, 1.0], // magma
  [9, 18, 0.7], // wood
  [10, 19, 0.6], // iron
  [11, 20, 0.7], // ash
];

const GLSL = /* glsl */ `
uniform int uMat;
uniform float uSeed;
uniform int uPass;
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
  for (int i = 0; i < 7; i++) {
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

// ---------------------------------------------------------------------------------------------------- stone base
// A block face of chiselled stone: 4-5 big facets with creases, smaller chisel planes, a hairline crack.
struct Stone { float h; float tone; float crease; float rim; float facet; vec2 id; };
Stone stone(vec2 uv, float bigP, float slope, float crackAmt) {
  Stone s;
  vec2 w = vec2(fbm(uv + 3.1, 3., 3), fbm(uv + 8.7, 3., 3)) * .09;
  vec2 rel;
  vec4 v = voro((uv + w) * bigP, bigP, 1., rel);
  vec2 sl = (h22(v.zw + 3.7) - .5) * slope;
  float fh = dot(-rel, sl) + (h12(v.zw + 1.3) - .5) * .16;
  // Facet borders are soft ridges/valleys (a change of slope), not drawn lines.
  float cr = smoothstep(.0, .05, v.y);
  vec2 rel2;
  vec4 v2 = voro((uv + w * 1.3) * (bigP * 3.), bigP * 3., 1., rel2);
  vec2 sl2 = (h22(v2.zw + 5.1) - .5) * slope * .35;
  float fh2 = dot(-rel2, sl2);
  float lo = fbm(uv + 5.3, 2., 4);
  float grain = fbm(uv, 32., 2);
  // One meandering hairline crack on some faces, with a pale lip on one side.
  float cf = gnoise((uv + w * 2.) * 2., 2.) + .3 * gnoise(uv * 5., 5.);
  float cw = .0045 + .004 * (.5 + .5 * gnoise(uv * 4. + 2., 4.));
  float on = smoothstep(.1, .3, gnoise(uv * 2. + 9. + uSeed, 2.)) * crackAmt;
  float crack = (1. - smoothstep(cw * .35, cw, abs(cf))) * on;
  float lip = (smoothstep(cw, cw * 2.2, cf) - smoothstep(cw * 2.2, cw * 4., cf)) * on;
  s.h = .5 + .62 * fh + .2 * fh2 - (1. - cr) * .05 + lo * .12 + grain * .03 - crack * .25;
  s.crease = cr;
  s.rim = lip;
  s.facet = h12(v.zw + 9.1);
  s.tone = .5 + .5 * lo + (s.facet - .5) * .2 + fh * .28 + grain * .06 - crack * .55 + lip * .12;
  s.id = v.zw;
  return s;
}

void paint(int mat, vec2 uv, out vec3 alb, out float h, out float rough, out float mask) {
  mask = 0.;
  rough = .82;
  if (mat == 0 || mat == 2 || mat == 3) {
    // Slate: blue-grey with cool green shadows, warm-grey lights.
    Stone s = stone(uv, 2., .95, mat == 0 ? 1. : .6);
    vec3 dark = srgb(50., 58., 68.), mid = srgb(90., 100., 110.), lite = srgb(136., 142., 146.);
    alb = ramp3(dark, mid, lite, clamp(s.tone, 0., 1.));
    alb *= mix(vec3(1.), vec3(1.07, 1.0, .93), step(.7, s.facet)); // a few warmer facets
    alb *= mix(.88, 1., s.crease);
    // Sparse mica flecks.
    vec2 mr;
    vec4 mv = voro(uv * 22., 22., 1., mr);
    float mica = (1. - smoothstep(.04, .09, mv.x)) * step(.86, h12(mv.zw + 3.));
    alb = mix(alb, lite * 1.5, mica * .5);
    h = s.h;
    rough = .8 - mica * .4;
    if (mat == 2) {
      // Copper ore: a seam of chunky native-copper nuggets across the face, grey-green crust around them.
      float yc = .5 + .14 * sin(6.2832 * uv.x + uSeed) + .05 * sin(12.566 * uv.x + 2. * uSeed);
      float band = abs(uv.y - yc);
      float bf = 1. - smoothstep(.08, .3, band);
      vec2 rel;
      vec2 wp = uv + vec2(fbm(uv + 1.7, 4., 2), fbm(uv + 4.2, 4., 2)) * .05;
      vec4 v = voro(wp * 3., 3., .8, rel);
      float pick = step(.3, h12(v.zw + 7.7) * .5 + bf * .7);
      float r = (.3 + .14 * h12(v.zw + 2.2)) * smoothstep(.2, .7, bf + .1) * pick;
      float d = v.x * (1. + .22 * gnoise(wp * 12., 12.));
      float nug = 1. - smoothstep(r * .86, r, d);
      float q = clamp(d / max(r, 1e-3), 0., 1.);
      float dome = sqrt(max(0., 1. - q * q));
      // Faceted, hammered metal: a few flat planes on each nugget.
      vec2 rr;
      vec4 fv = voro(wp * 14., 14., 1., rr);
      float fac = h12(fv.zw + 3.3);
      float halo = (1. - smoothstep(r, r * 1.5 + .05, d)) * (1. - nug) * step(.01, r);
      vec3 cu = ramp3(srgb(96., 42., 20.), srgb(188., 98., 46.), srgb(246., 178., 110.), clamp(dome * .75 + fac * .25, 0., 1.));
      alb *= 1. - bf * .2;
      alb = mix(alb, srgb(52., 74., 64.) * (.8 + .4 * s.tone), halo * .55);
      alb = mix(alb, cu, nug);
      h = mix(h, .6 + dome * .3 + fac * .04, nug) - halo * .05;
      rough = mix(rough, .4, nug);
      mask = nug;
    } else if (mat == 3) {
      // Gem host: violet crystal shards set in darker rock.
      alb *= .78;
      vec2 rel;
      vec4 v = voro(uv * 5., 5., .8, rel);
      float on = step(.9, h12(v.zw + 4.4));
      float ang = h12(v.zw + 8.8) * 3.1416;
      vec2 q = mat2(cos(ang), -sin(ang), sin(ang), cos(ang)) * rel;
      float sh = max(abs(q.x) * 1.6, abs(q.y)) ;
      float r = .2 + .12 * h12(v.zw + 1.1);
      float g = (1. - smoothstep(r * .85, r, sh)) * on;
      float facet = step(0., q.x) * .25 + step(0., q.y) * .15;
      alb = mix(alb, ramp3(srgb(48., 18., 78.), srgb(132., 70., 200.), srgb(214., 170., 255.), .35 + facet + .3 * (1. - sh / r)), g);
      h = mix(h, .7 + .2 * (1. - sh / r), g);
      rough = mix(rough, .2, g);
      mask = g * (.4 + .6 * (1. - sh / r));
    }
  } else if (mat == 1) {
    // Floor: the same slate, flatter and worn, dust in the joints, scattered gravel.
    Stone s = stone(uv, 2., .55, .5);
    vec3 dark = srgb(70., 66., 62.), mid = srgb(112., 104., 96.), lite = srgb(154., 144., 130.);
    alb = ramp3(dark, mid, lite, clamp(s.tone * .9 + .05, 0., 1.));
    vec2 rel;
    vec4 pv = voro(uv * 10., 10., .9, rel);
    float pr = .22 + .14 * h12(pv.zw);
    float peb = (1. - smoothstep(pr * .7, pr, pv.x)) * step(.8, h12(pv.zw + 3.3));
    float dust = smoothstep(.0, .5, fbm(uv + 7.7, 3., 4) + .1) * .5 + (1. - s.crease) * .6;
    alb = mix(alb, srgb(138., 130., 120.), clamp(dust, 0., 1.) * .5);
    alb = mix(alb, ramp3(dark, mid, lite, h12(pv.zw + 6.) * .4 + .5), peb * .7);
    h = s.h * .85 + peb * .06 * sqrt(max(0., 1. - pv.x / pr)) - (1. - s.crease) * .02;
    rough = .86;
  } else if (mat == 4) {
    // Soil: dark warm earth, clumps, pebbles, pale root fibres.
    vec2 rel;
    vec4 v = voro(uv * 6., 6., .9, rel);
    float clump = sqrt(max(0., 1. - v.x * 1.4));
    float n = fbm(uv + 2.2, 3., 5);
    vec3 dark = srgb(30., 26., 26.), mid = srgb(56., 46., 42.), lite = srgb(84., 70., 60.);
    alb = ramp3(dark, mid, lite, clamp(.45 + n * .6 + clump * .15 + (h12(v.zw) - .5) * .2, 0., 1.));
    vec2 w = vec2(fbm(uv + 5., 2., 3), fbm(uv + 9., 2., 3)) * .2;
    float fib = 1. - smoothstep(.004, .012, abs(gnoise((uv + w) * 3., 3.)));
    fib *= smoothstep(-.1, .2, gnoise(uv * 4. + 3., 4.));
    alb = mix(alb, srgb(104., 84., 64.), fib * .45);
    h = .45 + clump * .3 + n * .2 + fib * .1;
    rough = .92;
  } else if (mat == 5 || mat == 6) {
    // Grotto stone: deep blue-violet, glassy creases with pale mineral crust, rare cyan flecks.
    Stone s = stone(uv, 2., mat == 5 ? 1.1 : .5, .4);
    vec3 dark = srgb(34., 36., 62.), mid = srgb(62., 66., 104.), lite = srgb(102., 108., 146.);
    if (mat == 6) { dark = srgb(56., 56., 80.); mid = srgb(96., 96., 124.); lite = srgb(140., 140., 162.); }
    alb = ramp3(dark, mid, lite, clamp(s.tone, 0., 1.));
    float crust = (mat == 6 ? smoothstep(.1, .5, fbm(uv + 4., 3., 4)) * .5 : 0.) + (1. - s.crease) * .3;
    alb = mix(alb, srgb(130., 150., 190.), clamp(crust, 0., 1.) * .22);
    vec2 rel;
    vec4 fv = voro(uv * 9., 9., .9, rel);
    float fl = (1. - smoothstep(.035, .07, fv.x)) * step(mat == 6 ? 2. : .975, h12(fv.zw + 2.));
    alb = mix(alb, srgb(120., 230., 240.), fl);
    h = s.h + fl * .08;
    rough = .55 + .2 * s.crease;
    mask = fl;
  } else if (mat == 7 || mat == 8 || mat == 11) {
    // Basalt: near-black warm violet-grey, polygonal joints, vesicles. Magma: glowing veins along the joints.
    vec2 w = vec2(fbm(uv + 2.4, 2., 3), fbm(uv + 6.1, 2., 3)) * (mat == 8 ? .12 : .05);
    vec2 rel;
    vec4 v = voro((uv + w) * 3., 3., .55, rel);
    float j = smoothstep(.0, .07, v.y);
    vec2 rel2;
    vec4 pv = voro(uv * 14., 14., .9, rel2);
    float pit = (1. - smoothstep(.06, .13, pv.x)) * step(.55, h12(pv.zw));
    float n = fbm(uv + 3.3, 3., 5);
    vec3 dark = srgb(22., 20., 26.), mid = srgb(44., 40., 50.), lite = srgb(74., 68., 80.);
    float t = clamp(.45 + n * .55 + (h12(v.zw) - .5) * .3, 0., 1.);
    if (mat == 11) { dark = srgb(36., 34., 38.); mid = srgb(62., 58.,64.); lite = srgb(92., 88., 92.); }
    alb = ramp3(dark, mid, lite, t) * mix(.55, 1., j);
    alb *= 1. - pit * .45;
    vec2 sl = (h22(v.zw + 1.) - .5) * .5;
    h = .55 + dot(-rel, sl) * j - (1. - j) * .25 - pit * .12 + n * .06;
    rough = .7 - .1 * j;
    if (mat == 8) {
      float wv = .045 + .035 * (.5 + .5 * gnoise(uv * 5., 5.));
      float glow = 1. - smoothstep(.0, wv, v.y);
      float core = 1. - smoothstep(.0, wv * .45, v.y);
      float crust = (1. - smoothstep(wv, wv * 2.4, v.y)) * (1. - glow);
      alb = mix(alb, srgb(60., 18., 10.), crust * .8);
      alb = mix(alb, srgb(255., 120., 40.), glow);
      h -= glow * .2;
      mask = glow * .55 + core * .45;
      rough = mix(rough, .9, glow);
    }
  } else if (mat == 9) {
    // Wood: four planks per tile along u, warm brown, grain and a knot.
    float pl = fract(uv.y * 4.);
    float pid = floor(uv.y * 4.);
    float gap = smoothstep(.0, .045, pl) * smoothstep(1., .955, pl);
    float wv = fbm(vec2(uv.x, uv.y * 4.) + pid * 3.1, 2., 3);
    float grain = .5 + .5 * sin((pl * 9. + wv * 6. + uv.x * .5) * 6.2832);
    float n = fbm(uv * vec2(1., 4.) + pid, 4., 3);
    vec3 dark = srgb(58., 40., 28.), mid = srgb(104., 74., 50.), lite = srgb(146., 110., 78.);
    alb = ramp3(dark, mid, lite, clamp(.48 + n * .4 + grain * .14 + (h12(vec2(pid, uSeed)) - .5) * .3, 0., 1.));
    alb *= mix(.35, 1., gap);
    h = .5 + grain * .05 + n * .1 - (1. - gap) * .35;
    rough = .72;
  } else if (mat == 10) {
    // Iron: hammered dark metal with rivets (tinted gold for the lock).
    vec2 rel;
    vec4 v = voro(uv * 8., 8., .9, rel);
    float ham = sqrt(max(0., 1. - v.x * 1.3));
    vec2 rc = vec2(fract(uv.x * 4.) - .5, uv.y - .5);
    float rv = length(rc * vec2(1., 1.)) ;
    float rivet = 1. - smoothstep(.09, .12, rv);
    float n = fbm(uv + 1.1, 4., 4);
    alb = mix(srgb(70., 70., 76.), srgb(120., 120., 128.), clamp(.5 + n * .5 + ham * .1, 0., 1.));
    alb = mix(alb, srgb(150., 150., 156.), rivet);
    h = .5 + ham * .06 + rivet * .35 * sqrt(max(0., 1. - rv / .12));
    rough = .42 - rivet * .1;
    mask = 1.;
  }
  h = clamp(h, 0., 1.);
}

void main() {
  vec3 alb; float h, rough, mask;
  paint(uMat, vUv, alb, h, rough, mask);
  if (uPass == 0) {
    // sRGB OETF (the array is uploaded as SRGB8_ALPHA8 and decoded by the hardware).
    vec3 c = clamp(alb, 0., 1.);
    vec3 s = mix(c * 12.92, 1.055 * pow(c, vec3(1. / 2.4)) - .055, step(.0031308, c));
    gl_FragColor = vec4(s, h);
  } else {
    gl_FragColor = vec4(rough, mask, 0., 1.);
  }
}
`;

export interface BlockTextures {
  albedo: THREE.DataArrayTexture;
  normal: THREE.DataArrayTexture;
  ms: number;
}

export function paintTextures(renderer: THREE.WebGLRenderer): BlockTextures {
  const t0 = performance.now();
  const rt = new THREE.WebGLRenderTarget(TEX, TEX, { type: THREE.UnsignedByteType, depthBuffer: false, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter });
  const mat = new THREE.ShaderMaterial({
    uniforms: { uMat: { value: 0 }, uSeed: { value: 0 }, uPass: { value: 0 } },
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0., 1.); }',
    fragmentShader: GLSL,
    depthTest: false,
    depthWrite: false,
  });
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat);
  quad.frustumCulled = false;
  const scene = new THREE.Scene();
  scene.add(quad);
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const N = TEX * TEX;
  const A = new Uint8Array(N * 4 * LAYER_COUNT);
  const Bn = new Uint8Array(N * 4 * LAYER_COUNT);
  const buf = new Uint8Array(N * 4);
  const prevTarget = renderer.getRenderTarget();
  for (let l = 0; l < LAYER_COUNT; l++) {
    const [m, seed, strength] = LAYERS[l];
    mat.uniforms.uMat.value = m;
    mat.uniforms.uSeed.value = seed;
    for (let pass = 0; pass < 2; pass++) {
      mat.uniforms.uPass.value = pass;
      renderer.setRenderTarget(rt);
      renderer.render(scene, cam);
      renderer.readRenderTargetPixels(rt, 0, 0, TEX, TEX, buf);
      if (pass === 0) A.set(buf, l * N * 4);
      else {
        // Normal from the height (alpha of pass 0), periodic Sobel; relief scale per material.
        const o = l * N * 4;
        const hgt = (x: number, y: number) => A[o + (((y + TEX) % TEX) * TEX + ((x + TEX) % TEX)) * 4 + 3] / 255;
        const k = 5.2 * strength;
        for (let y = 0; y < TEX; y++)
          for (let x = 0; x < TEX; x++) {
            const dx = hgt(x + 1, y - 1) + 2 * hgt(x + 1, y) + hgt(x + 1, y + 1) - hgt(x - 1, y - 1) - 2 * hgt(x - 1, y) - hgt(x - 1, y + 1);
            const dy = hgt(x - 1, y + 1) + 2 * hgt(x, y + 1) + hgt(x + 1, y + 1) - hgt(x - 1, y - 1) - 2 * hgt(x, y - 1) - hgt(x + 1, y - 1);
            let nx = -dx * k, ny = -dy * k;
            const nz = 1;
            const len = Math.hypot(nx, ny, nz);
            nx /= len;
            ny /= len;
            const i = (y * TEX + x) * 4;
            Bn[o + i] = Math.round((nx * 0.5 + 0.5) * 255);
            Bn[o + i + 1] = Math.round((ny * 0.5 + 0.5) * 255);
            Bn[o + i + 2] = buf[i];
            Bn[o + i + 3] = buf[i + 1];
          }
      }
    }
  }
  renderer.setRenderTarget(prevTarget);
  rt.dispose();
  mat.dispose();
  quad.geometry.dispose();
  const mk = (data: Uint8Array, srgb: boolean) => {
    const t = new THREE.DataArrayTexture(data, TEX, TEX, LAYER_COUNT);
    t.format = THREE.RGBAFormat;
    t.type = THREE.UnsignedByteType;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    t.magFilter = THREE.LinearFilter;
    t.generateMipmaps = true;
    t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    t.needsUpdate = true;
    return t;
  };
  return { albedo: mk(A, true), normal: mk(Bn, false), ms: performance.now() - t0 };
}
