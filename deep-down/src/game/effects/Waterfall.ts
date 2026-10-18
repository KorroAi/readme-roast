import * as THREE from 'three';
import { LIGHTING_GLSL, type LightingUniforms } from '../../render/lighting';
import type { Rng } from '../../core/rng';
import type { ParticleSystem } from './Particles';

const vert = /* glsl */ `
out vec2 vUv;
out vec3 vWorldPos;
out float vDepth;
void main() {
  vUv = uv;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorldPos = wp.xyz;
  vec4 mv = viewMatrix * wp;
  vDepth = length(mv.xyz);
  gl_Position = projectionMatrix * mv;
}
`;

const frag = /* glsl */ `
precision highp float;
${LIGHTING_GLSL}
uniform float uHeight;
uniform vec3 uColor;
in vec2 vUv;
in vec3 vWorldPos;
in float vDepth;
layout(location = 0) out highp vec4 fragColor;

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

void main() {
  // Pixel-quantized streaks scrolling downward: a voxel-friendly look for falling light.
  float cols = 10.0;
  float cx = floor(vUv.x * cols);
  float speed = 9.0 + hash12(vec2(cx, 3.0)) * 6.0;
  float v = vUv.y * uHeight + uTime * speed;
  float cell = floor(v * 1.5);
  float streak = step(0.45, hash12(vec2(cx, cell)));
  float core = 1.0 - abs(vUv.x - 0.5) * 2.0;
  core = smoothstep(0.0, 0.6, core);
  float shimmer = 0.75 + 0.25 * sin(uTime * 3.0 + cx * 1.7);
  float topFade = smoothstep(0.0, 0.06, 1.0 - vUv.y);
  float a = (0.18 + 0.62 * streak) * core * shimmer * topFade;
  float fog = fogFactor(vDepth);
  // Fade out right in front of the lens so falling past it never blinds the screen.
  float nearFade = smoothstep(1.0, 6.0, vDepth);
  vec3 col = uColor * a * (1.0 - fog * 0.65) * nearFade;
  fragColor = vec4(col, 1.0); // additive blending scales by source alpha
}
`;

/**
 * The Glimmerfall: a thin stream of luminous water falling from the dome into the rift.
 * Two crossed additive ribbons (cheap, readable from every angle) plus mist at the impact.
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
      uniforms: { ...lighting, uHeight: { value: height }, uColor: { value: new THREE.Color(0.55, 1.6, 2.0) } },
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
      particles.sparkle(this.bottom.x, this.bottom.y + 0.5, this.bottom.z, 0x7ff0ff, 2, rng, 1.4);
      particles.dust(this.bottom.x, this.bottom.y + 0.4, this.bottom.z, 0x9fdfff, 1, rng, 0.8);
    }
  }

  dispose(): void {
    for (const c of this.group.children) (c as THREE.Mesh).geometry.dispose();
    this.material.dispose();
  }
}
