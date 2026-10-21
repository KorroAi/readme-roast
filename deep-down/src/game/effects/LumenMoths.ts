import * as THREE from 'three';
import { MOTHS } from '../../config/balance';
import { LIGHTING_GLSL, type LightingUniforms } from '../../render/lighting';
import type { MothFlock } from '../moths';

const vert = /* glsl */ `
in vec2 aCorner;
in vec3 iOffset;
in float iPhase;
in float iGlow;
uniform float uSpan;
uniform float uPixelScale;
out vec2 vUv;
out float vGlow;
out float vDepth;
out vec3 vWorldPos;
out float vNear;
void main() {
  vec4 mv = viewMatrix * vec4(iOffset, 1.0);
  vWorldPos = iOffset;
  vDepth = length(mv.xyz);
  float z = max(0.1, -mv.z);
  // The wing beat: the span opens and closes with |sin|; never thinner than a pixel and a half.
  float flap = abs(sin(iPhase * 6.2831853));
  float span = max(uSpan, 1.5 * z / uPixelScale);
  mv.x += aCorner.x * span * 0.5 * (0.25 + 0.75 * flap);
  mv.y += aCorner.y * span * 0.34;
  gl_Position = projectionMatrix * mv;
  vUv = aCorner;
  vGlow = iGlow;
  // A moth right in front of the lens would be a big pale blot: fade it out.
  vNear = smoothstep(0.9, 2.6, vDepth);
}
`;

const frag = /* glsl */ `
precision highp float;
${LIGHTING_GLSL}
uniform vec3 uMothColor;
in vec2 vUv;
in float vGlow;
in float vDepth;
in vec3 vWorldPos;
in float vNear;
layout(location = 0) out highp vec4 fragColor;
void main() {
  // Two wing lobes either side of a thin body, drawn procedurally (no texture).
  vec2 p = vUv;
  vec2 l = vec2((abs(p.x) - 0.52) / 0.5, (p.y - 0.12) / 0.86);
  float wing = 1.0 - smoothstep(0.75, 1.0, dot(l, l));
  float body = (1.0 - smoothstep(0.06, 0.12, abs(p.x))) * (1.0 - smoothstep(0.55, 0.8, abs(p.y + 0.1)));
  float a = max(wing * 0.85, body);
  if (a < 0.02) discard;
  // Far moths fade into the haze like everything else.
  float fog = atmosphere(vWorldPos, vDepth, vec3(0.0)).a;
  vec3 col = uMothColor * vGlow * a * vNear * (1.0 - fog * 0.85);
  fragColor = vec4(sceneOut(col), 1.0);
}
`;

/**
 * Draws the lumen moths: one instanced camera-facing quad per moth with procedural wings, additive,
 * no depth write, fading with the zone's haze. One draw call; the instance buffers are the
 * flock's own typed arrays, uploaded each frame up to the active count.
 */
export class LumenMoths {
  readonly mesh: THREE.Mesh;
  private readonly geometry: THREE.InstancedBufferGeometry;
  private readonly material: THREE.ShaderMaterial;
  private readonly attrs: THREE.InstancedBufferAttribute[];

  constructor(lighting: LightingUniforms, private readonly flock: MothFlock) {
    const g = new THREE.InstancedBufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(12), 3));
    g.setAttribute('aCorner', new THREE.BufferAttribute(new Float32Array([-1, -1, 1, -1, 1, 1, -1, 1]), 2));
    g.setIndex([0, 1, 2, 0, 2, 3]);
    const off = new THREE.InstancedBufferAttribute(flock.positions, 3).setUsage(THREE.DynamicDrawUsage);
    const phase = new THREE.InstancedBufferAttribute(flock.phases, 1).setUsage(THREE.DynamicDrawUsage);
    const glow = new THREE.InstancedBufferAttribute(flock.glow, 1).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('iOffset', off);
    g.setAttribute('iPhase', phase);
    g.setAttribute('iGlow', glow);
    g.instanceCount = 0;
    this.attrs = [off, phase, glow];
    this.geometry = g;
    const [r, gg, b] = MOTHS.color;
    this.material = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      uniforms: { ...lighting, uSpan: { value: MOTHS.wingspan }, uPixelScale: { value: 600 }, uMothColor: { value: new THREE.Vector3(r * MOTHS.intensity, gg * MOTHS.intensity, b * MOTHS.intensity) } },
      vertexShader: vert,
      fragmentShader: frag,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.mesh = new THREE.Mesh(g, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 9;
    this.mesh.name = 'lumenMoths';
  }

  /** Upload this frame's moths. */
  sync(): void {
    const n = this.flock.active;
    this.geometry.instanceCount = n;
    this.mesh.visible = n > 0;
    if (n === 0) return;
    const sizes = [3, 1, 1];
    this.attrs.forEach((a, k) => {
      a.clearUpdateRanges();
      a.addUpdateRange(0, n * sizes[k]);
      a.needsUpdate = true;
    });
  }

  setPixelScale(heightPx: number, fovDeg: number): void {
    this.material.uniforms.uPixelScale.value = heightPx / (2 * Math.tan((fovDeg * Math.PI) / 360));
  }

  dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
  }
}
