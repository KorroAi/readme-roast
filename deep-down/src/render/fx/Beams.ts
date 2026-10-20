import * as THREE from 'three';

/**
 * Beams (SPEC §11.4): additive light shapes in one draw: beam cones (a chest opening, in the tier colour), the
 * column pillar of an E3 burst (HDR amber ×4, 180 ms), crack lines down a pierced column (E2, a 120 ms ribbon)
 * and rays. Each is a camera-facing ribbon between two points with a width at each end, a colour, an HDR
 * intensity and a life; it grows over `grow` ms (outExpo) and fades over the rest. Stateless in the shader
 * (per-instance spawn data, the FX clock), like GpuParticles.
 */
export type BeamKind = 'cone' | 'pillar' | 'crack' | 'ray';

export interface BeamSpec {
  kind: BeamKind;
  /** World points: from (the base) to (the tip). */
  from: [number, number, number];
  to: [number, number, number];
  /** Width at the base and the tip (m). */
  width: [number, number];
  color: number;
  /** HDR intensity. */
  intensity: number;
  /** Life (ms); the shape grows over `grow` ms (outExpo) and fades over the rest. */
  life: number;
  grow?: number;
}

const CAP = 24;

const vert = /* glsl */ `
in vec4 aFrom;  // xyz, birth (s)
in vec4 aTo;    // xyz, life (s)
in vec4 aShape; // w0, w1, intensity, grow (s)
in vec4 aColor; // rgb, kind
uniform float uFxTime;
out vec2 vUv;
out vec3 vColor;
out float vA;
out float vKind;
void main() {
  float age = uFxTime - aFrom.w;
  float life = aTo.w;
  vUv = position.xy;
  vColor = aColor.rgb * aShape.z;
  vKind = aColor.w;
  if (age < 0.0 || age >= life) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); vA = 0.0; return; }
  float g = aShape.w > 0.0 ? 1.0 - pow(2.0, -10.0 * clamp(age / aShape.w, 0.0, 1.0)) : 1.0;
  vA = 1.0 - smoothstep(aShape.w, life, age);
  vec3 a = aFrom.xyz;
  vec3 b = mix(a, aTo.xyz, g);
  float t = position.y;
  vec3 p = mix(a, b, t);
  vec4 va = viewMatrix * vec4(a, 1.0);
  vec4 vb = viewMatrix * vec4(b, 1.0);
  vec2 d = normalize((vb.xy - va.xy) + vec2(1e-5, 0.0));
  vec2 side = vec2(-d.y, d.x);
  vec4 mv = viewMatrix * vec4(p, 1.0);
  mv.xy += side * position.x * mix(aShape.x, aShape.y, t) * 0.5;
  gl_Position = projectionMatrix * mv;
}
`;

const frag = /* glsl */ `
precision highp float;
in vec2 vUv;
in vec3 vColor;
in float vA;
in float vKind;
layout(location = 0) out highp vec4 fragColor;
void main() {
  float across = 1.0 - abs(vUv.x) * 2.0;
  float soft = smoothstep(0.0, 1.0, across);
  float along = vKind < 0.5 ? (1.0 - vUv.y) * 0.85 + 0.15 : 1.0 - 0.5 * vUv.y;
  float core = pow(max(across, 0.0), 6.0);
  float a = vA * (soft * along * 0.6 + core * 0.8);
  fragColor = vec4(vColor * a, 0.0);
}
`;

export class Beams {
  readonly mesh: THREE.Mesh;
  private readonly attrs: THREE.InstancedBufferAttribute[];
  private readonly deathAt = new Float32Array(CAP).fill(-1);
  private next = 0;
  private time = 0;
  private readonly material: THREE.ShaderMaterial;

  constructor() {
    const geo = new THREE.InstancedBufferGeometry();
    // A ribbon: x across (-0.5..0.5), y along (0..1), 4 segments along.
    const pos: number[] = [];
    const idx: number[] = [];
    for (let i = 0; i <= 4; i++) pos.push(-0.5, i / 4, 0, 0.5, i / 4, 0);
    for (let i = 0; i < 4; i++) idx.push(i * 2, i * 2 + 1, i * 2 + 3, i * 2, i * 2 + 3, i * 2 + 2);
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setIndex(idx);
    this.attrs = ['aFrom', 'aTo', 'aShape', 'aColor'].map((n) => {
      const a = new THREE.InstancedBufferAttribute(new Float32Array(CAP * 4), 4);
      a.setUsage(THREE.DynamicDrawUsage);
      geo.setAttribute(n, a);
      return a;
    });
    for (let i = 0; i < CAP; i++) this.attrs[0].array[i * 4 + 3] = -1e6;
    geo.instanceCount = CAP;
    this.material = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: vert,
      fragmentShader: frag,
      uniforms: { uFxTime: { value: 0 } },
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.CustomBlending,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneMinusSrcAlphaFactor,
    });
    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.name = 'beams';
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 31;
  }

  add(spec: BeamSpec): void {
    let slot = -1;
    for (let k = 0; k < CAP; k++) {
      const j = (this.next + k) % CAP;
      if (this.deathAt[j] <= this.time) {
        slot = j;
        break;
      }
    }
    if (slot < 0) slot = this.next;
    this.next = (slot + 1) % CAP;
    const c = new THREE.Color(spec.color);
    const life = spec.life / 1000;
    const v = [
      [spec.from[0], spec.from[1], spec.from[2], this.time],
      [spec.to[0], spec.to[1], spec.to[2], life],
      [spec.width[0], spec.width[1], spec.intensity, (spec.grow ?? Math.min(120, spec.life * 0.3)) / 1000],
      [c.r, c.g, c.b, spec.kind === 'cone' ? 0 : 1],
    ];
    for (let i = 0; i < 4; i++) {
      const a = this.attrs[i];
      (a.array as Float32Array).set(v[i], slot * 4);
      a.clearUpdateRanges();
      a.addUpdateRange(0, CAP * 4);
      a.needsUpdate = true;
    }
    this.deathAt[slot] = this.time + life;
  }

  update(dtMs: number, camera: THREE.Camera): void {
    void camera;
    this.time += Math.max(0, dtMs) / 1000;
    this.material.uniforms.uFxTime.value = this.time;
  }

  get live(): number {
    let n = 0;
    for (const d of this.deathAt) if (d > this.time) n++;
    return n;
  }
}
