import * as THREE from 'three';
import { LIGHTING_GLSL, type LightingUniforms } from '../../render/lighting';
import { BIOME_LOOKS, isLookBiome, type BiomeFx } from '../../render/biomeLook';

/**
 * Round 3 (VIS): each biome's motes in the air round the explorer: amber dust in the lantern light,
 * teal and magenta spores rising in the Mushroom Forest, green-gold fireflies in the Root Galleries,
 * cold mist over the Flooded Grottoes, ice glints falling in the Frost Caverns, embers rising over
 * the Magma Veins, gold rune motes in the Sunken City, violet void motes, the Heart's rose motes.
 *
 * One draw call: a field of points that wraps round the camera in a 22 m box, so each mote stays put
 * in the world (drifting at its own pace) while the explorer walks; the box only decides which are
 * drawn. Positions, drift, wobble and twinkle are all in the vertex shader: nothing is uploaded per
 * frame but a few uniforms. Two styles at once (the two strongest of the biome mix: BiomeLook's
 * weights, the biome's first effect counting most), so crossing a border fades one population into
 * the next over ~25 m. Motes inside rock are simply hidden by the depth test: they show in real air
 * only. Calm: small, slow, sparse, nothing strobes (twinkles take 2 s or more).
 */

/** A mote population's look (linear colours). */
export interface MoteStyle {
  /** null = the biome's own light colour (BiomeLookDef.light). */
  color: readonly [number, number, number] | null;
  /** A second hue for a share of the motes. */
  color2?: readonly [number, number, number];
  share2?: number;
  /** Diameter (m). */
  size: number;
  /** Drift (m/s). */
  vel: readonly [number, number, number];
  /** Wander amplitude (m) and rate (Hz). */
  wobble: number;
  wobbleRate: number;
  /** Brightness modulation depth (0..1) and rate (Hz, at most 0.5: calm). */
  twinkle: number;
  twinkleRate: number;
  /** 0: lit by the lantern and the world's lights only; 1: glows by itself. */
  glow: number;
  /** Share of the pool drawn (0..1). */
  density: number;
  alpha: number;
}

/** The styles of BiomeFx (drips are Ambience's: anchored under real ceilings). */
export const MOTE_STYLES: Readonly<Record<Exclude<BiomeFx, 'drips'>, MoteStyle>> = {
  dust: { color: [1.0, 0.84, 0.62], size: 0.022, vel: [0.025, 0.006, -0.015], wobble: 0.22, wobbleRate: 0.05, twinkle: 0.2, twinkleRate: 0.2, glow: 0, density: 0.6, alpha: 0.65 },
  spores: { color: [0.28, 1.0, 0.86], color2: [1.0, 0.34, 0.88], share2: 0.4, size: 0.03, vel: [0.004, 0.045, 0.003], wobble: 0.35, wobbleRate: 0.06, twinkle: 0.45, twinkleRate: 0.22, glow: 0.92, density: 0.6, alpha: 0.85 },
  fireflies: { color: [0.82, 1.0, 0.32], size: 0.034, vel: [0.012, 0.004, 0.01], wobble: 1.1, wobbleRate: 0.07, twinkle: 0.95, twinkleRate: 0.2, glow: 1.0, density: 0.22, alpha: 0.95 },
  mist: { color: [0.62, 0.8, 1.0], size: 0.024, vel: [0.018, -0.004, 0.012], wobble: 0.3, wobbleRate: 0.04, twinkle: 0.3, twinkleRate: 0.25, glow: 0.18, density: 0.6, alpha: 0.5 },
  bubbles: { color: null, size: 0.02, vel: [0.0, 0.07, 0.0], wobble: 0.12, wobbleRate: 0.25, twinkle: 0.3, twinkleRate: 0.3, glow: 0.45, density: 0.4, alpha: 0.55 },
  snow: { color: [0.86, 0.94, 1.0], size: 0.022, vel: [0.03, -0.16, 0.02], wobble: 0.25, wobbleRate: 0.1, twinkle: 0.6, twinkleRate: 0.45, glow: 0.15, density: 0.7, alpha: 0.8 },
  embers: { color: [1.0, 0.42, 0.1], color2: [1.0, 0.72, 0.28], share2: 0.3, size: 0.022, vel: [0.02, 0.32, 0.01], wobble: 0.3, wobbleRate: 0.2, twinkle: 0.6, twinkleRate: 0.5, glow: 1.0, density: 0.45, alpha: 0.95 },
  motes: { color: null, size: 0.02, vel: [0.006, 0.012, -0.004], wobble: 0.25, wobbleRate: 0.05, twinkle: 0.85, twinkleRate: 0.35, glow: 0.88, density: 0.42, alpha: 0.85 },
  ash: { color: [0.56, 0.53, 0.5], size: 0.028, vel: [0.02, -0.07, 0.015], wobble: 0.35, wobbleRate: 0.08, twinkle: 0.1, twinkleRate: 0.1, glow: 0, density: 0.5, alpha: 0.6 },
  runeMotes: { color: [1.0, 0.78, 0.32], size: 0.028, vel: [0.0, 0.035, 0.0], wobble: 0.5, wobbleRate: 0.04, twinkle: 0.7, twinkleRate: 0.16, glow: 1.0, density: 0.3, alpha: 0.9 },
  voidMotes: { color: [0.58, 0.38, 1.0], color2: [0.32, 0.16, 0.7], share2: 0.4, size: 0.03, vel: [0.0, -0.03, 0.0], wobble: 0.6, wobbleRate: 0.03, twinkle: 0.6, twinkleRate: 0.14, glow: 0.92, density: 0.45, alpha: 0.85 },
  heartMotes: { color: [1.0, 0.46, 0.42], color2: [1.0, 0.8, 0.56], share2: 0.35, size: 0.032, vel: [0.0, 0.08, 0.0], wobble: 0.4, wobbleRate: 0.05, twinkle: 0.5, twinkleRate: 0.28, glow: 1.0, density: 0.5, alpha: 0.9 },
};

export type MoteStyleId = keyof typeof MOTE_STYLES;

/** Weight of a biome's first, second and third effect in the mix. */
const FX_RANK = [1, 0.55, 0.35];

/** A style chosen for the field: the style, its colour and its weight. */
export interface MotePick {
  style: MoteStyleId;
  color: [number, number, number];
  weight: number;
}

/**
 * The two strongest mote styles of a biome mix (pure; unit-tested). A generic style ('motes',
 * 'bubbles') takes the colour of the biome that gives it the most weight.
 */
export function pickMotes(weights: ReadonlyMap<string, number>): MotePick[] {
  const acc = new Map<MoteStyleId, { w: number; colorFrom: string; best: number }>();
  for (const [b, w] of weights) {
    if (!isLookBiome(b) || w <= 0) continue;
    const fx = BIOME_LOOKS[b].fx.filter((f): f is MoteStyleId => f !== 'drips');
    fx.forEach((f, i) => {
      const add = w * (FX_RANK[i] ?? 0.25);
      const e = acc.get(f);
      if (!e) acc.set(f, { w: add, colorFrom: b, best: add });
      else {
        e.w += add;
        if (add > e.best) {
          e.best = add;
          e.colorFrom = b;
        }
      }
    });
  }
  return [...acc.entries()]
    .sort((a, b) => b[1].w - a[1].w)
    .slice(0, 2)
    .map(([style, e]) => {
      const s = MOTE_STYLES[style];
      const light = isLookBiome(e.colorFrom) ? BIOME_LOOKS[e.colorFrom].light : [1, 1, 1];
      return { style, color: [...(s.color ?? light)] as [number, number, number], weight: Math.min(1, e.w) };
    });
}

/** Motes in the pool (two styles share it). */
export const MOTE_COUNT = 720;
/** The box round the camera (m): motes fade out from 7 m and wrap at 11 m. */
const BOX = 22;

const vert = /* glsl */ `
in vec4 aSeed;
uniform float uTime;
uniform vec3 uCam;
uniform float uBox;
uniform float uPixelScale;
uniform vec4 uStyleA[5];
uniform vec4 uStyleB[5];
uniform vec2 uMix; // x: share of the pool in style B, y: unused
out vec3 vColor;
out float vAlpha;
out float vGlow;
out vec3 vWorldPos;
out float vDepth;
void main() {
  float r1 = fract(aSeed.w * 17.31 + 0.13);
  float r2 = fract(aSeed.w * 41.73 + 0.31);
  float r3 = fract(aSeed.w * 7.913 + 0.57);
  bool useB = aSeed.w < uMix.x;
  // Packing: [0] colour.rgb, size; [1] vel.xyz, wobble; [2] colour2.rgb, share2;
  // [3] twinkle, twinkleRate, glow, density (x weight); [4] alpha, wobbleRate, -, -.
  vec4 s0 = useB ? uStyleB[0] : uStyleA[0];
  vec4 s1 = useB ? uStyleB[1] : uStyleA[1];
  vec4 s2 = useB ? uStyleB[2] : uStyleA[2];
  vec4 s3 = useB ? uStyleB[3] : uStyleA[3];
  vec4 s4 = useB ? uStyleB[4] : uStyleA[4];
  vAlpha = 0.0;
  vColor = vec3(0.0);
  vGlow = 0.0;
  vWorldPos = vec3(0.0);
  vDepth = 0.0;
  if (r1 >= s3.w) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    gl_PointSize = 0.0;
    return;
  }
  vec3 hb = vec3(uBox * 0.5);
  vec3 base = aSeed.xyz * uBox + s1.xyz * uTime * (0.6 + 0.8 * r2);
  vec3 p = uCam - hb + mod(base - (uCam - hb), uBox);
  float wr = s4.y * (0.7 + 0.6 * r3) * 6.2832;
  p += vec3(sin(uTime * wr + r1 * 40.0), sin(uTime * wr * 0.7 + r2 * 30.0) * 0.6, cos(uTime * wr * 0.83 + r3 * 17.0)) * s1.w;
  float dist = distance(p, uCam);
  float fade = smoothstep(0.4, 1.3, dist) * (1.0 - smoothstep(uBox * 0.3, uBox * 0.48, dist));
  float tw = 1.0 - s3.x * (0.5 + 0.5 * sin(uTime * s3.y * 6.2832 + r2 * 50.0));
  vColor = r3 < s2.w ? s2.rgb : s0.rgb;
  vGlow = s3.z;
  vec4 mv = viewMatrix * vec4(p, 1.0);
  float size = s0.w * (0.6 + 0.8 * r1);
  float px = size * uPixelScale / max(0.1, -mv.z);
  gl_PointSize = clamp(px, 1.0, 40.0);
  // Sub-pixel motes fade instead of shimmering at one pixel.
  vAlpha = s4.x * fade * tw * clamp(px / 1.6, 0.0, 1.0);
  vWorldPos = p;
  vDepth = length(mv.xyz);
  gl_Position = projectionMatrix * mv;
}
`;

const frag = /* glsl */ `
precision highp float;
${LIGHTING_GLSL}
uniform float uGlowGain;
in vec3 vColor;
in float vAlpha;
in float vGlow;
in vec3 vWorldPos;
in float vDepth;
layout(location = 0) out highp vec4 fragColor;
void main() {
  if (vAlpha < 0.004) discard;
  vec2 c = gl_PointCoord - 0.5;
  float d = dot(c, c) * 4.0;
  if (d > 1.0) discard;
  float soft = mix((1.0 - d) * (1.0 - d), exp(-d * 2.6) * (1.0 - d), vGlow);
  vec4 ls = lightSample(vWorldPos);
  vec3 lit = ambientFrom(ls) * 0.7 + lanternLight(vWorldPos, vWorldPos, normalize(uLanternPos - vWorldPos), 0.5, 1.2) * 0.9;
  vec3 col = vColor * mix(lit, vec3(uGlowGain), vGlow);
  vec4 atm = atmosphere(vWorldPos, vDepth, ls.rgb);
  float a = vAlpha * soft * (1.0 - atm.a);
  // Glowing motes add light (almost no cover); lit ones cover a little like dust does.
  fragColor = vec4(sceneOut(col) * a, a * (1.0 - vGlow * 0.85));
}
`;

const packStyle = (out: THREE.Vector4[], s: MoteStyle, color: readonly [number, number, number], weight: number): void => {
  const c2 = s.color2 ?? color;
  out[0].set(color[0], color[1], color[2], s.size);
  out[1].set(s.vel[0], s.vel[1], s.vel[2], s.wobble);
  out[2].set(c2[0], c2[1], c2[2], s.color2 ? (s.share2 ?? 0) : 0);
  out[3].set(s.twinkle, Math.min(0.5, s.twinkleRate), s.glow, s.density * Math.min(1, weight));
  out[4].set(s.alpha, s.wobbleRate, 0, 0);
};

export class BiomeMotes {
  readonly points: THREE.Points;
  private readonly material: THREE.ShaderMaterial;
  private readonly styleA = Array.from({ length: 5 }, () => new THREE.Vector4());
  private readonly styleB = Array.from({ length: 5 }, () => new THREE.Vector4());
  /** The styles drawn now (debug report, tests). */
  picks: MotePick[] = [];
  /** Scales every population (the quality preset, the reduced-motion setting). */
  intensity = 1;

  constructor(lighting: LightingUniforms) {
    const seeds = new Float32Array(MOTE_COUNT * 4);
    // A low-discrepancy spread (no clumps): R3 sequence for xyz, a hash for w.
    const g = 1.2207440846;
    const a1 = 1 / g, a2 = 1 / (g * g), a3 = 1 / (g * g * g);
    for (let i = 0; i < MOTE_COUNT; i++) {
      seeds[i * 4] = (0.5 + a1 * i) % 1;
      seeds[i * 4 + 1] = (0.5 + a2 * i) % 1;
      seeds[i * 4 + 2] = (0.5 + a3 * i) % 1;
      seeds[i * 4 + 3] = ((Math.sin(i * 12.9898) * 43758.5453) % 1 + 1) % 1;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(MOTE_COUNT * 3), 3));
    geo.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 4));
    this.material = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      uniforms: {
        ...lighting,
        uCam: { value: new THREE.Vector3() },
        uBox: { value: BOX },
        uPixelScale: { value: 800 },
        uStyleA: { value: this.styleA },
        uStyleB: { value: this.styleB },
        uMix: { value: new THREE.Vector2(0, 0) },
        uGlowGain: { value: 2.4 },
      },
      vertexShader: vert,
      fragmentShader: frag,
      transparent: true,
      depthWrite: false,
      blending: THREE.CustomBlending,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneMinusSrcAlphaFactor,
    });
    this.points = new THREE.Points(geo, this.material);
    this.points.name = 'biomeMotes';
    this.points.frustumCulled = false;
    this.points.renderOrder = 7;
    this.points.visible = false;
    const size = new THREE.Vector2();
    this.points.onBeforeRender = (r, _s, cam) => {
      const fov = (cam as THREE.PerspectiveCamera).fov ?? 72;
      this.material.uniforms.uPixelScale.value = r.getDrawingBufferSize(size).y / (2 * Math.tan((fov * Math.PI) / 360));
    };
  }

  /**
   * Draw one given style at `weight` (0 hides it) round the camera: the weather's own population
   * (game/effects/WeatherFx), not the biome mix.
   */
  updateFixed(style: MoteStyle, color: readonly [number, number, number], weight: number, camera: THREE.Vector3): void {
    const on = weight > 0.01;
    this.points.visible = on;
    if (!on) return;
    (this.material.uniforms.uCam.value as THREE.Vector3).copy(camera);
    packStyle(this.styleA, style, color, Math.min(1, weight));
    (this.material.uniforms.uMix.value as THREE.Vector2).set(0, 0);
  }

  /** Follow the biome mix (BiomeLook.weights) and the camera. */
  update(weights: ReadonlyMap<string, number>, camera: THREE.Vector3): void {
    this.picks = pickMotes(weights);
    const [a, b] = this.picks;
    const on = !!a && this.intensity > 0.01;
    this.points.visible = on;
    if (!on) return;
    const u = this.material.uniforms;
    (u.uCam.value as THREE.Vector3).copy(camera);
    // Style B takes its share of the pool by weight; both thin out together where the mix is weak
    // (the border of a biome without motes).
    const total = a.weight + (b?.weight ?? 0);
    const k = Math.min(1, total) * this.intensity;
    packStyle(this.styleA, MOTE_STYLES[a.style], a.color, k);
    if (b) packStyle(this.styleB, MOTE_STYLES[b.style], b.color, k);
    (u.uMix.value as THREE.Vector2).set(b ? b.weight / total : 0, 0);
  }

  dispose(): void {
    this.points.geometry.dispose();
    this.material.dispose();
  }
}
