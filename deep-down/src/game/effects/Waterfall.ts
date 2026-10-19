import * as THREE from 'three';
import { LIGHTING_GLSL, type LightingUniforms } from '../../render/lighting';
import type { Rng } from '../../core/rng';
import type { ParticleSystem } from './Particles';

const vert = /* glsl */ `
out vec2 vUv;
out vec3 vWorldPos;
out vec3 vViewPos;
void main() {
  vUv = uv;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorldPos = wp.xyz;
  vec4 mv = viewMatrix * wp;
  // The ribbon is one tall quad: interpolate the view position, take its length per pixel.
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
in vec2 vUv;
in vec3 vWorldPos;
in vec3 vViewPos;
layout(location = 0) out highp vec4 fragColor;

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

void main() {
  float fall = 1.0 - vUv.y; // 0 at the lip, 1 at the impact
  // The water leaves the lip as a narrow rope and spreads into broken sheets as it falls.
  float halfW = mix(0.16, 0.42, smoothstep(0.0, 0.8, fall));
  // Drafts make the stream waver: a slow sideways drift that grows with the fall.
  float h0 = vUv.y * uHeight;
  float wander = (sin(h0 * 0.11 + uTime * 0.6) * 0.06 + sin(h0 * 0.37 - uTime * 1.1) * 0.025) * smoothstep(0.05, 0.6, fall);
  float x = (vUv.x - 0.5 - wander) / halfW; // -1..1 across the stream
  float drop = h0 + uTime * 6.0;
  // Ragged edges: every 1.6 m of the fall has its own edge on each side, scrolling with the water.
  float band = floor(drop / 1.6);
  float rag = hash12(vec2(band, x < 0.0 ? 7.0 : 11.0));
  float edge = 1.0 - smoothstep(0.35 + 0.5 * rag, 1.0, abs(x));
  // Lower down the stream breaks into separate falling packets (gaps between sheets of water).
  float packet = hash12(vec2(floor(drop / 3.1), 5.0));
  float gaps = mix(1.0, 0.35 + 0.65 * step(0.3, packet), smoothstep(0.25, 0.8, fall));
  // Falling threads: pixel-quantised columns scrolling down at their own speed, a few glints.
  float cols = 12.0;
  float cx = floor(clamp(x * 0.5 + 0.5, 0.0, 0.999) * cols);
  float speed = 8.0 + hash12(vec2(cx, 3.0)) * 6.0;
  float cell = floor((vUv.y * uHeight + uTime * speed) * 1.4);
  float h = hash12(vec2(cx, cell));
  float thread = step(0.55, h);
  float glint = step(0.94, h);
  float core = 1.0 - min(abs(x), 1.0);
  // It emerges from the dark below the lip (long fade-in) and thins into spray at the foot.
  float lip = smoothstep(0.0, 0.3, fall);
  float foot = 1.0 - smoothstep(0.88, 1.0, fall);
  // A faint glimmer of its own; it brightens a little where lamps or crystals light the air.
  vec4 ls = lightSample(vWorldPos);
  float lit = 0.6 + 0.5 * min(dot(ls.rgb, vec3(0.3, 0.5, 0.2)), 1.0);
  vec3 col = uColor * (0.2 + 0.8 * core * core) * (0.3 + 0.7 * thread) + uGlint * (glint * core);
  col *= edge * gaps * lip * foot * lit;
  float depth = length(vViewPos);
  // The haze takes it fully at distance; fade right in front of the lens so it never blinds.
  float fog = atmosphere(vWorldPos, depth, ls.rgb).a;
  col *= (1.0 - fog) * smoothstep(1.0, 6.0, depth);
  fragColor = vec4(sceneOut(col), 1.0); // additive blending
}
`;

/**
 * The Glimmerfall: a thin stream of luminous water falling from the dome into the rift.
 * Two crossed additive ribbons (cheap, readable from every angle) plus mist at the impact. The
 * stream is shaped in the shader: a narrow rope at the lip that spreads into ragged sheets, a dim
 * glimmer of its own (brighter where the light volume is lit), a long fade-in from the dark
 * under the dome, and the zone haze takes it completely at distance. It stays below the bloom
 * threshold: it is scenery, not a light source competing with the path.
 */
export class Waterfall {
  readonly group = new THREE.Group();
  private readonly material: THREE.ShaderMaterial;
  private mistTimer = 0;

  constructor(
    lighting: LightingUniforms,
    top: THREE.Vector3,
    private readonly bottom: THREE.Vector3,
    width = 2.8,
  ) {
    const height = top.y - bottom.y;
    this.material = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      uniforms: { ...lighting, uHeight: { value: height }, uColor: { value: new THREE.Color(0.06, 0.2, 0.27) }, uGlint: { value: new THREE.Color(0.3, 0.85, 1.0) } },
      vertexShader: vert,
      fragmentShader: frag,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    for (let i = 0; i < 2; i++) {
      const geo = new THREE.PlaneGeometry(width, height, 1, 1);
      const mesh = new THREE.Mesh(geo, this.material);
      mesh.position.set(top.x, bottom.y + height / 2, top.z);
      mesh.rotation.y = i * (Math.PI / 2) + 0.4;
      mesh.renderOrder = 9;
      this.group.add(mesh);
    }
  }

  update(dt: number, particles: ParticleSystem, rng: Rng, cameraPos: THREE.Vector3): void {
    // Mist only when the impact point could plausibly be seen (saves particles elsewhere).
    if (cameraPos.distanceTo(this.bottom) > 70) return;
    this.mistTimer -= dt;
    if (this.mistTimer <= 0) {
      this.mistTimer = 0.12;
      particles.sparkle(this.bottom.x, this.bottom.y + 0.5, this.bottom.z, 0x7ff0ff, 1, rng, 1.2);
      particles.dust(this.bottom.x, this.bottom.y + 0.4, this.bottom.z, 0x8fc4d8, 2, rng, 1.0);
    }
  }

  dispose(): void {
    for (const c of this.group.children) (c as THREE.Mesh).geometry.dispose();
    this.material.dispose();
  }
}
