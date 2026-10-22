import * as THREE from 'three';
import { LIGHTING_GLSL, type LightingUniforms } from '../../render/lighting';
import type { Rng } from '../../core/rng';
import type { ParticleSystem } from './Particles';

// Three kinds of quads in one geometry (one draw call): 0 the falling sheet (two crossed
// ribbons), 1 mist (camera-facing, upright billboards at the foot), 2 the splash ring (flat on
// the pool at the foot).
const vert = /* glsl */ `
in float aKind;
in vec2 aCorner;
out vec2 vUv;
out vec3 vWorldPos;
out vec3 vViewPos;
flat out int vKind;
void main() {
  vUv = uv;
  vKind = int(aKind + 0.5);
  vec4 wp = modelMatrix * vec4(position, 1.0);
  if (vKind == 1) {
    // Upright billboard: turns about the vertical toward the camera.
    vec3 right = normalize(vec3(viewMatrix[0][0], 0.0, viewMatrix[2][0]) + vec3(1e-4, 0.0, 0.0));
    wp.xyz += right * aCorner.x + vec3(0.0, aCorner.y, 0.0);
  }
  vWorldPos = wp.xyz;
  vec4 mv = viewMatrix * wp;
  vViewPos = mv.xyz;
  gl_Position = projectionMatrix * mv;
}
`;

const frag = /* glsl */ `
precision highp float;
${LIGHTING_GLSL}
uniform float uHeight;
uniform vec3 uColor;
uniform vec3 uGlint;
uniform vec3 uMist;
uniform float uSelfLit; // 1: a lava fall (its own light: no dimming by the light volume)
uniform float uNatural; // 1: a strata fall: water lit by the cave round it (its own glow is the biome's only)
uniform vec3 uTone;     // the lit water's colour (a strata fall)
in vec2 vUv;
in vec3 vWorldPos;
in vec3 vViewPos;
flat in int vKind;
layout(location = 0) out highp vec4 fragColor;

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

// Smooth value noise (no pixel quantisation anywhere in the water).
float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash12(i);
  float b = hash12(i + vec2(1.0, 0.0));
  float c = hash12(i + vec2(0.0, 1.0));
  float d = hash12(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

void main() {
  float t = uTime;
  vec3 col;
  // How much water (matter that takes the cave's light) this fragment holds (a strata fall).
  float matter = 0.0;
  if (vKind == 0) {
    float fall = 1.0 - vUv.y; // 0 at the lip, 1 at the foot
    float h0 = vUv.y * uHeight; // metres above the foot
    // A rope of water at the lip that spreads as it falls and frays into a broken sheet. UV units
    // of the ribbon: 0.3 m wide at the lip, up to about 2.8 m at the foot; halfW + wander stays
    // under 0.5, so the water never touches the quad's edge.
    float spread = pow(smoothstep(0.0, 1.0, fall), 0.75);
    float halfW = mix(0.06, 0.42, spread);
    float wander = (sin(h0 * 0.07 + t * 0.5) * 0.04 + sin(h0 * 0.23 - t * 0.9) * 0.015) * smoothstep(0.05, 0.6, fall);
    // The width breathes along the fall (gusts squeeze and spread the water).
    halfW *= 0.75 + 0.5 * vnoise(vec2(h0 * 0.06 + t * 0.4, 2.0));
    float x = (vUv.x - 0.5 - wander) / halfW; // -1..1 across the water
    float y = h0 + t * 7.5; // scrolls down with the water (metres)
    // Soft, ragged edges that wander along the fall (each side its own).
    float ragN = vnoise(vec2(y * 0.45, x < 0.0 ? 3.0 : 17.0));
    float edge = 1.0 - smoothstep(0.3 + 0.45 * ragN, 1.05, abs(x));
    // Threads: smooth noise across the sheet, long along the fall, with dark gaps between them.
    float s1 = vnoise(vec2(x * 4.0 + 11.0, y * 0.16));
    float s2 = vnoise(vec2(x * 10.0 + 3.0, y * 0.4));
    float streak = smoothstep(0.42, 0.9, s1 * 0.55 + s2 * 0.45);
    // From a few metres below the lip the water falls in packets: gaps run down with it, and it
    // frays into spray (more holes) further down.
    float pk = vnoise(vec2(x * 1.6 + 5.0, y * 0.22)) * 0.6 + vnoise(vec2(x * 5.0, y * 0.55)) * 0.4;
    float holes = mix(0.3, 0.56, smoothstep(0.3, 1.0, fall));
    float sheet = mix(1.0, smoothstep(holes - 0.08, holes + 0.12, pk), smoothstep(0.06, 0.3, fall));
    // Sparse glints that travel with the water (small, soft, never a pixel column).
    vec2 gq = vec2(x * 9.0, y * 1.3);
    float gh = hash12(floor(gq));
    vec2 gf = fract(gq) - 0.5;
    float glint = step(0.97, gh) * (1.0 - smoothstep(0.05, 0.35, length(gf * vec2(1.0, 0.4))));
    // It emerges from the dark under the dome and thins into the mist at the foot. The two
    // ribbons add up where they cross, so the middle is not made brighter than the edges.
    float lip = smoothstep(0.0, 0.15, fall);
    float foot = 1.0 - smoothstep(0.9, 1.0, fall) * 0.7;
    float body = (0.12 + 0.88 * streak) * (0.55 + 0.45 * smoothstep(1.0, 0.4, abs(x))) * sheet * edge;
    col = (uColor * body * 0.8 + uGlint * glint * sheet * edge * 0.45) * lip * foot;
    matter = (body * 0.9 + glint * sheet * edge * 0.6) * lip * foot;
  } else if (vKind == 1) {
    // Mist: a soft cloud rising off the foot, churning slowly.
    vec2 q = vUv * 2.0 - 1.0;
    float n = vnoise(q * 2.2 + vec2(t * 0.12, -t * 0.3) + vWorldPos.xz * 0.05) * 0.6 + vnoise(q * 5.0 - vec2(0.0, t * 0.5)) * 0.4;
    float r = length(q * vec2(1.0, 1.25));
    float a = (1.0 - smoothstep(0.15, 1.0, r)) * smoothstep(-1.0, -0.55, q.y);
    col = uMist * a * (0.45 + 0.75 * n);
    matter = a * (0.45 + 0.75 * n) * 0.22;
  } else {
    // Splash ring on the pool: ripples running out from where the water lands.
    vec2 q = vUv * 2.0 - 1.0;
    float r = length(q);
    float ripples = 0.0;
    for (int k = 0; k < 3; k++) {
      float ph = fract(r * 2.2 - t * 0.45 + float(k) / 3.0);
      ripples += smoothstep(0.0, 0.08, ph) * (1.0 - smoothstep(0.08, 0.3, ph));
    }
    float churn = vnoise(q * 6.0 + vec2(t * 0.7, t * 0.4));
    float a = (1.0 - smoothstep(0.1, 1.0, r));
    col = uMist * a * (ripples * 0.35 + (1.0 - smoothstep(0.0, 0.35, r)) * (0.5 + 0.5 * churn));
    matter = a * (ripples * 0.35 + (1.0 - smoothstep(0.0, 0.35, r)) * (0.5 + 0.5 * churn)) * 0.3;
  }
  // A faint glimmer of its own; it brightens a little where lamps or crystals light the air.
  vec4 ls = lightSample(vWorldPos);
  col *= mix(0.6 + 0.5 * min(dot(ls.rgb, vec3(0.3, 0.5, 0.2)), 1.0), 1.0 + 0.25 * sin(uTime * 1.3 + vWorldPos.y * 0.4), uSelfLit);
  float depth = length(vViewPos);
  // The haze absorbs it like any emission (the zone's absorb share, uAtmos.z), so from the ledge
  // it still reads as the Hollow's cold landmark; fade right in front of the lens so it never blinds.
  float fog = atmosphere(vWorldPos, depth, ls.rgb).a;
  col *= (1.0 - fog * uAtmos.z) * smoothstep(1.0, 6.0, depth) * uAtmos.w;
  // Round 3: a strata fall is water lit by the cave round it (the lantern, the placed lights, the cool
  // fill): pale where a lamp lights it, a dim veil in the dark; spray catches the same light.
  if (uNatural > 0.5) {
    vec3 env = ambientFrom(ls) + lanternLight(vWorldPos, vWorldPos, normalize(uLanternPos - vWorldPos), 0.5, 1.0) * 0.55;
    col += env * uTone * matter * (1.0 - fog) * smoothstep(1.0, 6.0, depth);
  }
  fragColor = vec4(sceneOut(col), 1.0); // additive blending
}
`;

/**
 * The Glimmerfall: a thin stream of luminous water falling from the dome into the rift. A rope at
 * the lip that spreads and frays as it falls into a broken, streaked sheet with soft ragged edges
 * (two crossed additive ribbons, readable from every angle), a cloud of mist and a ring of
 * ripples at the foot, and a few particles of spray. All of it is shaped in one shader with
 * smooth noise (no pixel columns), dimly self-lit (brighter where the light volume is lit), and
 * the zone haze takes it at distance. It stays below the bloom threshold: it is scenery, not a
 * light source competing with the path. One draw call.
 */
/**
 * The colours of a fall (linear, additive): the water's cold luminous sheet, or round 3's lava fall
 * (stratum VI's vista): a glowing molten sheet with smoke-red haze at its foot, lit by itself.
 */
const FALL_LOOK = {
  water: { color: [0.06, 0.2, 0.27], glint: [0.3, 0.85, 1.0], mist: [0.045, 0.12, 0.155], selfLit: 0 },
  lava: { color: [1.1, 0.3, 0.05], glint: [1.6, 0.9, 0.35], mist: [0.16, 0.035, 0.012], selfLit: 1 },
} as const;

export type FallKind = keyof typeof FALL_LOOK;

/** A strata fall's look (VisDirector, from its biome): lit by the cave, its glow the biome's water glow. */
export interface FallTone {
  /** The bioluminescence of the biome's water (linear rgb x amount; 0 = none). */
  glow: readonly [number, number, number];
}

export class Waterfall {
  readonly group = new THREE.Group();
  private readonly material: THREE.ShaderMaterial;
  private readonly geometry: THREE.BufferGeometry;
  private mistTimer = 0;
  readonly kind: FallKind;

  constructor(
    lighting: LightingUniforms,
    top: THREE.Vector3,
    private readonly bottom: THREE.Vector3,
    width = 3.4,
    kind: FallKind = 'water',
    tone: FallTone | null = null,
  ) {
    const height = top.y - bottom.y;
    this.kind = kind;
    const base = FALL_LOOK[kind] ?? FALL_LOOK.water;
    // Round 3: a strata water fall glows only with its biome's bioluminescence; the cave lights it.
    const natural = kind === 'water' && tone !== null;
    const tg = tone?.glow ?? [0, 0, 0];
    const look = natural
      ? { color: [0.008 + tg[0] * 0.07, 0.012 + tg[1] * 0.07, 0.014 + tg[2] * 0.07], glint: [0.12 + tg[0] * 0.5, 0.18 + tg[1] * 0.5, 0.2 + tg[2] * 0.5], mist: [0.004 + tg[0] * 0.03, 0.006 + tg[1] * 0.03, 0.008 + tg[2] * 0.03], selfLit: 0 }
      : base;
    this.material = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      uniforms: {
        ...lighting,
        uHeight: { value: height },
        uColor: { value: new THREE.Color(...look.color) },
        uGlint: { value: new THREE.Color(...look.glint) },
        uMist: { value: new THREE.Color(...look.mist) },
        uSelfLit: { value: look.selfLit },
        uNatural: { value: natural ? 1 : 0 },
        uTone: { value: new THREE.Color(0.34, 0.4, 0.44) },
      },
      vertexShader: vert,
      fragmentShader: frag,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    const pos: number[] = [];
    const uv: number[] = [];
    const kinds: number[] = [];
    const corner: number[] = [];
    const index: number[] = [];
    const quad = (p: number[][], k: number, c: number[][] = [[0, 0], [0, 0], [0, 0], [0, 0]]) => {
      const v0 = pos.length / 3;
      const uvs = [[0, 0], [1, 0], [1, 1], [0, 1]];
      for (let i = 0; i < 4; i++) {
        pos.push(...p[i]);
        uv.push(...uvs[i]);
        kinds.push(k);
        corner.push(...c[i]);
      }
      index.push(v0, v0 + 1, v0 + 2, v0, v0 + 2, v0 + 3);
    };
    // The falling sheet: two crossed vertical ribbons through the fall's axis.
    for (let i = 0; i < 2; i++) {
      const a = i * (Math.PI / 2) + 0.4;
      const dx = Math.cos(a) * (width / 2);
      const dz = -Math.sin(a) * (width / 2);
      quad([[top.x - dx, bottom.y, top.z - dz], [top.x + dx, bottom.y, top.z + dz], [top.x + dx, top.y, top.z + dz], [top.x - dx, top.y, top.z - dz]], 0);
    }
    // Mist: three billboards of different sizes rising off the foot.
    // A strata fall's spray is smaller (it is lit by the cave, not a glowing cloud).
    const ms = natural ? 0.62 : 1;
    for (const [r0, h0, ox, oz] of [[4.5, 5.5, 0, 0], [3.2, 4, 1.2, -0.8], [3.6, 7, -1, 0.9]]) {
      const r = r0 * ms;
      const h = h0 * ms;
      const c = [bottom.x + ox, bottom.y + 0.2, bottom.z + oz];
      quad([c, c, c, c], 1, [[-r, 0], [r, 0], [r, h], [-r, h]]);
    }
    // The splash ring, flat just over the foot.
    const R = 4.5;
    const y = bottom.y + 0.08;
    quad([[bottom.x - R, y, bottom.z + R], [bottom.x + R, y, bottom.z + R], [bottom.x + R, y, bottom.z - R], [bottom.x - R, y, bottom.z - R]], 2);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setAttribute('aKind', new THREE.Float32BufferAttribute(kinds, 1));
    g.setAttribute('aCorner', new THREE.Float32BufferAttribute(corner, 2));
    g.setIndex(index);
    g.computeBoundingSphere();
    // The billboards grow out of their centre point: widen the bounds so they are not culled.
    if (g.boundingSphere) g.boundingSphere.radius += 8;
    this.geometry = g;
    const mesh = new THREE.Mesh(g, this.material);
    mesh.renderOrder = 9;
    this.group.add(mesh);
  }

  update(dt: number, particles: ParticleSystem, rng: Rng, cameraPos: THREE.Vector3): void {
    // Spray only when the impact point could plausibly be seen (saves particles elsewhere).
    if (cameraPos.distanceTo(this.bottom) > 70) return;
    this.mistTimer -= dt;
    if (this.mistTimer <= 0) {
      this.mistTimer = this.kind === 'lava' ? 0.2 : 0.12;
      if (this.kind === 'lava') {
        // Embers spat from where the lava lands, and a little dark smoke.
        particles.sparkle(this.bottom.x, this.bottom.y + 0.4, this.bottom.z, 0xffa040, 1, rng, 1.6);
        particles.dust(this.bottom.x, this.bottom.y + 0.6, this.bottom.z, 0x3a2420, 1, rng, 1.4);
      } else {
        particles.sparkle(this.bottom.x, this.bottom.y + 0.5, this.bottom.z, 0x7ff0ff, 1, rng, 1.2);
        particles.dust(this.bottom.x, this.bottom.y + 0.4, this.bottom.z, 0x8fc4d8, 2, rng, 1.0);
      }
    }
  }

  dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
  }
}
