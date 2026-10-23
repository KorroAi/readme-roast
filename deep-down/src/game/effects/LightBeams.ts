import * as THREE from 'three';
import { LIGHTING_GLSL, type AnchorZone, type LightingUniforms } from '../../render/lighting';

/**
 * Light beams: the only volumetric light in the game, and only where a real beam is (the rift's
 * violet light rising past the monolith, the Spindle's uplight in the Hollow, the light falling on
 * the shrine's tablet, the heat over the Ember Deep's hearth). Clear air everywhere else (the finished-game visual rules: no global haze).
 *
 * Each beam is an open cone, additive, no depth write, drawn in one merged mesh (one draw call).
 * The glow is brightest along the axis and fades softly at the rim (by the angle between the view
 * and the surface, so the cone has no hard outline), at both ends, near the lens and into the
 * zone's haze; a slow world-space noise drifts through it like dust in the light. Calm: the drift
 * is the only motion, at well under a metre per second.
 */
export interface BeamSpec {
  /** Bottom centre (world). */
  from: readonly [number, number, number];
  /** Top centre (world). */
  to: readonly [number, number, number];
  /** Radius at `from` and at `to` (m). */
  r0: number;
  r1: number;
  /** Linear HDR colour of the glow on the axis. */
  color: readonly [number, number, number];
  /**
   * Round 3 (QA 01:50): a shaft falling from a roof to the floor at `to` (strataBeams). Its dust thins
   * out over the last metres above the floor and what it adds is capped, so its foot is a soft glow
   * the cave shows through, never a white cloud; `pool` (m) lays a faint round glow on the floor
   * under it (a flat floor only: strataBeams checks).
   */
  fall?: boolean;
  pool?: number;
}

const vert = /* glsl */ `
in float aT;
in float aFoot;
in vec3 aColor;
out vec3 vWorldPos;
out vec3 vNormal;
out float vT;
out float vFoot;
out vec3 vColor;
out float vDepth;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorldPos = wp.xyz;
  vNormal = normalize(mat3(modelMatrix) * normal);
  vT = aT;
  vFoot = aFoot;
  vColor = aColor;
  vec4 mv = viewMatrix * wp;
  vDepth = length(mv.xyz);
  gl_Position = projectionMatrix * mv;
}
`;

const frag = /* glsl */ `
precision highp float;
precision highp sampler3D;
${LIGHTING_GLSL}
uniform sampler3D uNoise;
uniform float uIntensity;
in vec3 vWorldPos;
in vec3 vNormal;
in float vT;
in float vFoot;
in vec3 vColor;
in float vDepth;
layout(location = 0) out highp vec4 fragColor;
void main() {
  vec3 v = normalize(cameraPosition - vWorldPos);
  float near = smoothstep(1.5, 5.0, vDepth);
  float fog = atmosphere(vWorldPos, vDepth, vec3(0.0)).a;
  vec3 col;
  if (vT < -0.5) {
    // The pool under a shaft (QA 01:50): a faint round glow on the floor (vT -1 at its centre, -2 at
    // its rim), softer still at a grazing angle.
    float rf = clamp(-vT - 1.0, 0.0, 1.0);
    float pool = (1.0 - rf * rf) * (1.0 - rf * rf);
    col = vColor * pool * (0.3 + 0.7 * abs(v.y)) * 0.5 * near * (1.0 - 0.7 * fog) * uAtmos.w * uIntensity;
  } else {
    // Facing the view: the axis of the cone (soft core); grazing: its rim (fades to nothing).
    float f = abs(dot(normalize(vNormal), v));
    float core = f * f * f;
    float ends = smoothstep(0.0, 0.18, vT) * (1.0 - smoothstep(0.65, 1.0, vT));
    // A falling shaft thins out over its last 4 m above the floor (vFoot: metres above it; 100 for
    // the beams that rise): its foot is the pool's soft glow, the cave seen through it (QA 01:50:
    // the Frost Caverns' foot read as a white cloud filling the middle of the view).
    ends *= smoothstep(0.4, 4.0, vFoot) * (vFoot < 50.0 ? 1.0 - 0.45 * smoothstep(0.35, 0.9, vT) : 1.0);
    // Dust drifting up through the light: two slow, broad octaves of the world noise, kept faint (a
    // finer, stronger dust read as a marbled slab at 390 x 844 @2 in the Crystal Geode).
    vec3 q = vWorldPos * vec3(0.26, 0.1, 0.26) + vec3(0.0, -uTime * 0.06, 0.0);
    float dust = textureLod(uNoise, q, 0.0).r * 0.7 + textureLod(uNoise, q * 2.1 + 0.37, 0.0).g * 0.3;
    col = vColor * core * ends * (0.8 + 0.4 * dust) * near * (1.0 - 0.7 * fog) * uAtmos.w * uIntensity;
  }
  // A falling shaft never adds more than a veil (two surfaces, the cone's front and back, at most
  // ~0.1 linear between them), so what is behind it always shows through.
  if (vFoot < 50.0) col *= min(1.0, 0.05 / max(dot(col, vec3(0.2126, 0.7152, 0.0722)), 1e-5));
  // Additive over the scene: on the 8-bit fallback the target holds sqrt(x / (1 + x)), where a
  // faint glow added as sceneOut(col) would be strongly amplified; its slope at a dark scene (~1.4)
  // keeps the beam as faint there as on HDR targets.
  fragColor = vec4(uSceneEncode > 0.5 ? col * 1.4 : col, 1.0);
}
`;

export class LightBeams {
  readonly mesh: THREE.Mesh;
  private readonly material: THREE.ShaderMaterial;

  constructor(lighting: LightingUniforms, noise: THREE.Texture, beams: readonly BeamSpec[]) {
    const pos: number[] = [];
    const nrm: number[] = [];
    const ts: number[] = [];
    const foot: number[] = [];
    const col: number[] = [];
    const idx: number[] = [];
    const SEG = 18;
    const RINGS = 6;
    const a = new THREE.Vector3();
    const b = new THREE.Vector3();
    const axis = new THREE.Vector3();
    const u = new THREE.Vector3();
    const w = new THREE.Vector3();
    for (const s of beams) {
      a.set(...s.from);
      b.set(...s.to);
      axis.subVectors(b, a);
      const len = axis.length();
      axis.normalize();
      u.set(Math.abs(axis.y) < 0.9 ? 0 : 1, Math.abs(axis.y) < 0.9 ? 1 : 0, 0).cross(axis).normalize();
      w.crossVectors(axis, u);
      const base = pos.length / 3;
      const slope = (s.r0 - s.r1) / len;
      for (let r = 0; r <= RINGS; r++) {
        const t = r / RINGS;
        const rad = s.r0 + (s.r1 - s.r0) * t;
        for (let k = 0; k <= SEG; k++) {
          const ang = (k / SEG) * Math.PI * 2;
          const c = Math.cos(ang);
          const sn = Math.sin(ang);
          pos.push(a.x + axis.x * len * t + (u.x * c + w.x * sn) * rad, a.y + axis.y * len * t + (u.y * c + w.y * sn) * rad, a.z + axis.z * len * t + (u.z * c + w.z * sn) * rad);
          const nx = u.x * c + w.x * sn + axis.x * slope;
          const ny = u.y * c + w.y * sn + axis.y * slope;
          const nz = u.z * c + w.z * sn + axis.z * slope;
          const nl = Math.hypot(nx, ny, nz) || 1;
          nrm.push(nx / nl, ny / nl, nz / nl);
          ts.push(t);
          // Metres above the floor the shaft falls to (its height there, linear along it).
          foot.push(s.fall ? Math.max(0, (s.from[1] - s.to[1]) * (1 - t)) : 100);
          col.push(...s.color);
        }
      }
      for (let r = 0; r < RINGS; r++)
        for (let k = 0; k < SEG; k++) {
          const i0 = base + r * (SEG + 1) + k;
          const i1 = i0 + SEG + 1;
          idx.push(i0, i1, i0 + 1, i0 + 1, i1, i1 + 1);
        }
      // The pool on the floor: a fan just over the floor (`to` is 0.3 m above it), aT -1 at its
      // centre to -2 at its rim.
      if (s.fall && s.pool && s.pool > 0) {
        const c0 = pos.length / 3;
        const y = s.to[1] - 0.26;
        pos.push(s.to[0], y, s.to[2]);
        nrm.push(0, 1, 0);
        ts.push(-1);
        foot.push(0);
        col.push(...s.color);
        for (let k = 0; k <= SEG; k++) {
          const ang = (k / SEG) * Math.PI * 2;
          pos.push(s.to[0] + Math.cos(ang) * s.pool, y, s.to[2] + Math.sin(ang) * s.pool);
          nrm.push(0, 1, 0);
          ts.push(-2);
          foot.push(0);
          col.push(...s.color);
        }
        for (let k = 0; k < SEG; k++) idx.push(c0, c0 + 1 + k + 1, c0 + 1 + k);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
    g.setAttribute('aT', new THREE.Float32BufferAttribute(ts, 1));
    g.setAttribute('aFoot', new THREE.Float32BufferAttribute(foot, 1));
    g.setAttribute('aColor', new THREE.Float32BufferAttribute(col, 3));
    g.setIndex(idx);
    g.computeBoundingSphere();
    this.material = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      uniforms: { ...lighting, uNoise: { value: noise }, uIntensity: { value: 1 } },
      vertexShader: vert,
      fragmentShader: frag,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    });
    this.mesh = new THREE.Mesh(g, this.material);
    this.mesh.renderOrder = 8;
    this.mesh.name = 'lightBeams';
    this.mesh.visible = beams.length > 0;
  }

  /** Round 3: the beams' brightness (1 as built; the Heart's column rises with the relighting). */
  set intensity(v: number) {
    this.material.uniforms.uIntensity.value = v;
    this.mesh.visible = v > 0.001 && (this.mesh.geometry.index?.count ?? 0) > 0;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.material.dispose();
  }
}

type Landmarks = Readonly<Record<string, readonly number[] | undefined>>;

/** The beams of the zone, from its landmarks (a landmark the world lacks gives no beam). */
export function beamsFor(lm: Landmarks): BeamSpec[] {
  const out: BeamSpec[] = [];
  const m = lm.monolith;
  // The rift's violet light rising past the monolith toward the bridge.
  if (m) out.push({ from: [m[0], m[1] - 0.5, m[2]], to: [m[0], m[1] + 26, m[2]], r0: 1.5, r1: 3.2, color: [0.09, 0.05, 0.21] });
  const sp = lm.spindle;
  // The Spindle's uplight: a pale cold column along the stone.
  if (sp) out.push({ from: [sp[0], sp[1] - 0.2, sp[2]], to: [sp[0], sp[1] + 18, sp[2]], r0: 1.1, r1: 2.0, color: [0.035, 0.075, 0.1] });
  const tb = lm.tablet;
  // Light falling on the shrine's tablet from the vault: a narrow warm-white cone.
  if (tb) out.push({ from: [tb[0], tb[1] - 0.1, tb[2]], to: [tb[0], tb[1] + 6.5, tb[2]], r0: 0.8, r1: 0.4, color: [0.022, 0.02, 0.016] });
  const ed = lm.emberDeep;
  // The Ember Deep's hearth: heat rising off the bed of lanternstone, a low wide warm column (the
  // cavern's focal point).
  if (ed) out.push({ from: [ed[0], ed[1] - 0.6, ed[2]], to: [ed[0], ed[1] + 5.5, ed[2]], r0: 1.1, r1: 1.7, color: [0.035, 0.012, 0.003] });
  return out;
}

/** The deep zones' own air (LightingRig.setZoneAnchors), from their landmarks. */
export function zoneAnchorsFor(lm: Landmarks): Array<{ zone: AnchorZone; at: [number, number, number]; radius: number }> {
  const out: Array<{ zone: AnchorZone; at: [number, number, number]; radius: number }> = [];
  // Polish 2: the Lantern Vault's floor keeps clear air (its balcony lights read from below).
  const v = lm.vault;
  if (v) out.push({ zone: 'vault', at: [v[0], v[1], v[2]], radius: 22 });
  const g = lm.glowroot;
  if (g) out.push({ zone: 'glowroot', at: [g[0], g[1], g[2]], radius: 20 });
  const e = lm.emberDeep;
  if (e) out.push({ zone: 'ember', at: [e[0], e[1], e[2]], radius: 20 });
  return out;
}
