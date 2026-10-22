import * as THREE from 'three';
import { RARITY_HEX, type Rarity } from '../config/rarity';
import { hexToLinear } from '../core/math';
import { SCENE_ENCODE } from './lighting';

/**
 * Round 3 (VIS): marks seen through the rock (the sonar's reveal, HighlightSystem.reveal).
 *
 * Each revealed thing gets a small screen-sized mark drawn over everything (no depth test), in its
 * colour: an ore vein a diamond in its rarity colour (bigger for a bigger vein), a chest a square
 * with a lid line, a lair a ring with four teeth (red), the gate a double ring (gold), a journal page
 * a small upright sheet, a cracked wall a broken square, an outpost a lantern drop. A mark fades in
 * when the sonar's shell reaches it (its delay), holds, and fades out over its last 0.6 s. One draw
 * call for every mark (instanced), at most MAX_MARKS.
 */

export type RevealKind = 'ore' | 'chest' | 'lair' | 'gate' | 'page' | 'secret' | 'outpost' | 'creature';

export interface RevealCell {
  x: number;
  y: number;
  z: number;
  /** What it is (the mark's shape); default 'ore'. */
  kind?: RevealKind;
  /** Rarity colour (ores, chests); lairs, gates, pages and outposts have their own colours. */
  rarity?: Rarity | null;
  /** Seconds before it appears (the sonar shell's travel time to it). */
  delay?: number;
  /** Relative size (an ore vein's cell count makes it larger): 1 = a single cell. */
  size?: number;
}

export const MAX_MARKS = 96;

const KIND_CODE: Record<RevealKind, number> = { ore: 0, chest: 1, lair: 2, gate: 3, page: 4, secret: 5, outpost: 6, creature: 7 };
const KIND_HEX: Partial<Record<RevealKind, number>> = { lair: 0xff6b5e, gate: 0xffd26a, page: 0xefe7d8, secret: 0xc9bfae, outpost: 0xffb35c, creature: 0xff8a6a };

const vert = /* glsl */ `
in vec3 aPos;
in vec3 aCol;
in vec4 aInfo; // x kind, y size, z start time, w end time
uniform float uTime;
uniform vec2 uViewport;
out vec2 vQ;
out vec3 vCol;
out float vKind;
out float vAlpha;
void main() {
  vQ = position.xy * 2.0;
  vCol = aCol;
  vKind = aInfo.x;
  float t0 = aInfo.z;
  float t1 = aInfo.w;
  float a = smoothstep(t0, t0 + 0.15, uTime) * (1.0 - smoothstep(t1 - 0.6, t1, uTime));
  vec4 c = projectionMatrix * viewMatrix * vec4(aPos, 1.0);
  if (a <= 0.001 || c.w <= 0.05) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); vAlpha = 0.0; return; }
  float d = c.w;
  // Screen size: 11-26 css px by kind and vein size, a little smaller far away.
  float px = clamp(aInfo.y, 1.0, 2.4) * mix(13.0, 9.0, smoothstep(6.0, 28.0, d));
  // A pop on arrival (scale 1.35 -> 1 over 0.25 s), then still.
  px *= 1.0 + 0.35 * (1.0 - smoothstep(t0, t0 + 0.25, uTime));
  c.xy += position.xy * 2.0 * (px * 2.0 / uViewport) * c.w;
  c.z = -c.w * 0.999;
  gl_Position = c;
  vAlpha = a * mix(1.0, 0.7, smoothstep(10.0, 30.0, d));
}
`;

const frag = /* glsl */ `
precision highp float;
uniform float uSceneEncode;
in vec2 vQ;
in vec3 vCol;
in float vKind;
in float vAlpha;
layout(location = 0) out highp vec4 fragColor;
float stroke(float d, float w, float aa) { return 1.0 - smoothstep(w - aa, w + aa, abs(d)); }
void main() {
  vec2 q = vQ;
  float aa = fwidth(q.x) * 1.2 + 1e-4;
  int k = int(vKind + 0.5);
  float line = 0.0;
  float fill = 0.0;
  if (k == 0) { // ore: a diamond
    float d = abs(q.x) + abs(q.y) - 0.72;
    line = stroke(d, 0.07, aa);
    fill = (1.0 - smoothstep(-0.02, 0.02, d)) * 0.35;
  } else if (k == 1) { // chest: a square with a lid line
    vec2 a = abs(q) - vec2(0.62, 0.5);
    float d = max(a.x, a.y);
    line = max(stroke(d, 0.07, aa), stroke(q.y - 0.12, 0.05, aa) * step(abs(q.x), 0.62));
    fill = (1.0 - smoothstep(-0.02, 0.02, d)) * 0.25;
  } else if (k == 2) { // lair: a ring with four teeth
    float r = length(q);
    float ang = atan(q.y, q.x);
    float teeth = smoothstep(0.75, 0.95, cos(ang * 4.0 + 0.785)) * 0.22;
    line = stroke(r - 0.6 - teeth, 0.08, aa);
    fill = (1.0 - smoothstep(0.2, 0.26, r)) * 0.9;
  } else if (k == 3) { // gate: a double ring
    float r = length(q);
    line = max(stroke(r - 0.78, 0.06, aa), stroke(r - 0.5, 0.06, aa));
    fill = (1.0 - smoothstep(0.16, 0.22, r));
  } else if (k == 4) { // page: an upright sheet with two text lines
    vec2 a = abs(q) - vec2(0.42, 0.62);
    float d = max(a.x, a.y);
    line = max(stroke(d, 0.06, aa), max(stroke(q.y - 0.15, 0.04, aa), stroke(q.y + 0.15, 0.04, aa)) * step(abs(q.x), 0.3));
  } else if (k == 5) { // a cracked wall: a broken square
    vec2 a = abs(q) - vec2(0.6);
    float d = max(a.x, a.y);
    float gap = step(0.18, abs(q.x - q.y * 0.4 - 0.1));
    line = max(stroke(d, 0.07, aa) * gap, stroke(q.x - q.y * 0.4 - 0.1, 0.04, aa) * step(max(abs(q.x), abs(q.y)), 0.6));
  } else if (k == 6) { // outpost: a lantern drop
    vec2 p = q - vec2(0.0, -0.1);
    float d = length(p * vec2(1.0, 0.8)) - 0.52 + max(0.0, q.y) * 0.4;
    line = stroke(d, 0.07, aa);
    fill = (1.0 - smoothstep(-0.02, 0.02, d)) * 0.5;
  } else { // creature: a chevron
    float d = abs(q.x) * 0.9 - q.y - 0.25;
    line = stroke(d, 0.08, aa) * step(abs(q.x), 0.7) * step(q.y, 0.55);
  }
  float glow = exp(-dot(q, q) * 2.6) * 0.22;
  float a = clamp(max(line, fill) + glow, 0.0, 1.0) * vAlpha;
  if (a < 0.004) discard;
  vec3 c = vCol * (line * 1.6 + fill * 0.9 + glow * 1.2);
  c = uSceneEncode > 0.5 ? sqrt(c / (1.0 + c)) : c;
  fragColor = vec4(c * vAlpha, a);
}
`;

export class RevealMarkers {
  readonly mesh: THREE.Mesh<THREE.InstancedBufferGeometry, THREE.ShaderMaterial>;
  private readonly pos: Float32Array;
  private readonly col: Float32Array;
  private readonly info: Float32Array;
  private readonly marks: Array<{ x: number; y: number; z: number; end: number }> = [];
  private time = 0;
  private readonly viewport = new THREE.Vector2(1, 1);

  constructor() {
    const g = new THREE.InstancedBufferGeometry();
    const quad = new THREE.PlaneGeometry(1, 1);
    g.index = quad.index;
    g.setAttribute('position', quad.getAttribute('position'));
    this.pos = new Float32Array(MAX_MARKS * 3);
    this.col = new Float32Array(MAX_MARKS * 3);
    this.info = new Float32Array(MAX_MARKS * 4);
    g.setAttribute('aPos', new THREE.InstancedBufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aCol', new THREE.InstancedBufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aInfo', new THREE.InstancedBufferAttribute(this.info, 4).setUsage(THREE.DynamicDrawUsage));
    g.instanceCount = 0;
    const mat = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      uniforms: { uTime: { value: 0 }, uViewport: { value: this.viewport }, uSceneEncode: SCENE_ENCODE },
      vertexShader: vert,
      fragmentShader: frag,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      blending: THREE.CustomBlending,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneMinusSrcAlphaFactor,
    });
    this.mesh = new THREE.Mesh(g, mat);
    this.mesh.name = 'reveal-marks';
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 870; // over the world, under the progress ring (880) and the viewmodel
    this.mesh.visible = false;
    this.mesh.onBeforeRender = (r) => r.getDrawingBufferSize(this.viewport);
  }

  /** Marks currently shown or pending (for tests and the debug API). */
  get count(): number {
    return this.marks.length;
  }

  /** Show `cells` for `seconds` after each one's delay. Replaces marks still showing. */
  reveal(cells: readonly RevealCell[], seconds: number): void {
    this.marks.length = 0;
    const n = Math.min(MAX_MARKS, cells.length);
    for (let i = 0; i < n; i++) {
      const c = cells[i];
      const kind = c.kind ?? 'ore';
      const hex = KIND_HEX[kind] ?? RARITY_HEX[c.rarity ?? 'common'];
      const [r, g, b] = hexToLinear(hex);
      const start = this.time + Math.max(0, c.delay ?? 0);
      const end = start + Math.max(0.3, seconds);
      this.pos.set([c.x, c.y, c.z], i * 3);
      this.col.set([r, g, b], i * 3);
      const size = kind === 'ore' ? 1 + Math.min(1, Math.log2(Math.max(1, c.size ?? 1)) * 0.25) : kind === 'lair' || kind === 'gate' ? 2.1 : kind === 'chest' ? 1.4 : 1.25;
      this.info.set([KIND_CODE[kind], size, start, end], i * 4);
      this.marks.push({ x: c.x, y: c.y, z: c.z, end });
    }
    const g = this.mesh.geometry;
    g.instanceCount = n;
    for (const name of ['aPos', 'aCol', 'aInfo']) (g.getAttribute(name) as THREE.InstancedBufferAttribute).needsUpdate = true;
    this.mesh.visible = n > 0;
  }

  /** Hide every mark at once (a stratum change, the menu). */
  clear(): void {
    this.marks.length = 0;
    this.mesh.geometry.instanceCount = 0;
    this.mesh.visible = false;
  }

  update(time: number): void {
    this.time = time;
    this.mesh.material.uniforms.uTime.value = time;
    if (this.marks.length && this.marks.every((m) => m.end < time)) this.clear();
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
  }
}
