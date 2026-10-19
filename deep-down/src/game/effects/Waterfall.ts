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
  if (vKind == 0) {
    float fall = 1.0 - vUv.y; // 0 at the lip, 1 at the foot
    float h0 = vUv.y * uHeight; // metres above the foot
    // A rope of water at the lip that spreads as it falls and frays into a broken sheet. UV units
    // of the ribbon: 0.3 m wide at the lip, up to about 2.8 m at the foot; halfW + wander stays
    // under 0.5, so the water never touches the quad's edge.
    float spread = pow(smoothstep(0.0, 1.0, fall), 0.75);
    float halfW = mix(0.05, 0.4, spread);
    float wander = (sin(h0 * 0.07 + t * 0.5) * 0.04 + sin(h0 * 0.23 - t * 0.9) * 0.015) * smoothstep(0.05, 0.6, fall);
    float x = (vUv.x - 0.5 - wander) / halfW; // -1..1 across the water
    float y = h0 + t * 7.5; // scrolls down with the water (metres)
    // Soft, ragged edges that wander along the fall (each side its own).
    float ragN = vnoise(vec2(y * 0.3, x < 0.0 ? 3.0 : 17.0));
    float edge = 1.0 - smoothstep(0.35 + 0.4 * ragN, 1.05, abs(x));
    // Streaks: smooth noise across the sheet, long along the fall, a few dozen threads at most.
    float s1 = vnoise(vec2(x * 4.5 + 11.0, y * 0.18));
    float s2 = vnoise(vec2(x * 11.0 + 3.0, y * 0.45));
    float streak = smoothstep(0.3, 0.85, s1 * 0.6 + s2 * 0.4);
    // Lower down the sheet breaks into packets and spray: holes open in the water.
    float brk = vnoise(vec2(x * 2.2 + 5.0, y * 0.09)) * 0.65 + vnoise(vec2(x * 6.0, y * 0.3)) * 0.35;
    float sheet = mix(1.0, smoothstep(0.28, 0.62, brk), smoothstep(0.25, 0.85, fall));
    float core = 1.0 - min(x * x, 1.0);
    // Sparse glints that travel with the water (small, soft, never a pixel column).
    vec2 gq = vec2(x * 9.0, y * 1.3);
    float gh = hash12(floor(gq));
    vec2 gf = fract(gq) - 0.5;
    float glint = step(0.965, gh) * (1.0 - smoothstep(0.05, 0.35, length(gf * vec2(1.0, 0.4))));
    // It emerges from the dark under the dome and thins into the mist at the foot.
    float lip = smoothstep(0.0, 0.15, fall);
    float foot = 1.0 - smoothstep(0.9, 1.0, fall) * 0.7;
    float body = (0.22 + 0.78 * streak) * (0.3 + 0.7 * core) * sheet * edge;
    col = (uColor * body + uGlint * glint * core * sheet * 0.5) * lip * foot;
  } else if (vKind == 1) {
    // Mist: a soft cloud rising off the foot, churning slowly.
    vec2 q = vUv * 2.0 - 1.0;
    float n = vnoise(q * 2.2 + vec2(t * 0.12, -t * 0.3) + vWorldPos.xz * 0.05) * 0.6 + vnoise(q * 5.0 - vec2(0.0, t * 0.5)) * 0.4;
    float r = length(q * vec2(1.0, 1.25));
    float a = (1.0 - smoothstep(0.15, 1.0, r)) * smoothstep(-1.0, -0.55, q.y);
    col = uMist * a * (0.45 + 0.75 * n);
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
  }
  // A faint glimmer of its own; it brightens a little where lamps or crystals light the air.
  vec4 ls = lightSample(vWorldPos);
  col *= 0.6 + 0.5 * min(dot(ls.rgb, vec3(0.3, 0.5, 0.2)), 1.0);
  float depth = length(vViewPos);
  // The haze absorbs it like any emission (the zone's absorb share, uAtmos.z), so from the ledge
  // it still reads as the Hollow's cold landmark; fade right in front of the lens so it never blinds.
  float fog = atmosphere(vWorldPos, depth, ls.rgb).a;
  col *= (1.0 - fog * uAtmos.z) * smoothstep(1.0, 6.0, depth);
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
export class Waterfall {
  readonly group = new THREE.Group();
  private readonly material: THREE.ShaderMaterial;
  private readonly geometry: THREE.BufferGeometry;
  private mistTimer = 0;

  constructor(
    lighting: LightingUniforms,
    top: THREE.Vector3,
    private readonly bottom: THREE.Vector3,
    width = 3.4,
  ) {
    const height = top.y - bottom.y;
    this.material = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      uniforms: {
        ...lighting,
        uHeight: { value: height },
        uColor: { value: new THREE.Color(0.06, 0.2, 0.27) },
        uGlint: { value: new THREE.Color(0.3, 0.85, 1.0) },
        uMist: { value: new THREE.Color(0.045, 0.12, 0.155) },
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
    const kind: number[] = [];
    const corner: number[] = [];
    const index: number[] = [];
    const quad = (p: number[][], k: number, c: number[][] = [[0, 0], [0, 0], [0, 0], [0, 0]]) => {
      const v0 = pos.length / 3;
      const uvs = [[0, 0], [1, 0], [1, 1], [0, 1]];
      for (let i = 0; i < 4; i++) {
        pos.push(...p[i]);
        uv.push(...uvs[i]);
        kind.push(k);
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
    for (const [r, h, ox, oz] of [[4.5, 5.5, 0, 0], [3.2, 4, 1.2, -0.8], [3.6, 7, -1, 0.9]]) {
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
    g.setAttribute('aKind', new THREE.Float32BufferAttribute(kind, 1));
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
      this.mistTimer = 0.12;
      particles.sparkle(this.bottom.x, this.bottom.y + 0.5, this.bottom.z, 0x7ff0ff, 1, rng, 1.2);
      particles.dust(this.bottom.x, this.bottom.y + 0.4, this.bottom.z, 0x8fc4d8, 2, rng, 1.0);
    }
  }

  dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
  }
}
