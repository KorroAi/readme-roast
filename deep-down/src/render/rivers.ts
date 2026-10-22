import * as THREE from 'three';
import { LIGHTING_GLSL, type LightingUniforms } from './lighting';

/**
 * Round 3 (VIS): the strata's underground rivers (WORLD's `layout.rivers[]`), drawn as flowing
 * ribbons over the one-block channel WORLD carves from the spring to the vista's balcony.
 *
 * - Water: the biome's water (the lakes' tint, eased by VisDirector) flowing downstream: ripples
 *   advected along the channel (they follow its bends), foam along the banks and on the steps where
 *   the river drops a block, the lantern's glint, the lit cave mirrored in it, the biome's
 *   bioluminescent specks carried by the current and the sonar's glowing wave.
 * - Lava (stratum VI): a crust of dark plates drifting downstream on a molten flow, bright seams
 *   opening between them, hottest along the middle, breathing slowly. It lights nothing itself (the
 *   lava blocks under it are the light); it is the flow you see.
 * One merged mesh per kind (one draw call each), nothing writes depth (the drawn rock stays the
 * depth truth, so the ribbon's banks tuck into the channel walls). The river breaks where WORLD's
 * channel breaks (a rock bridge, a tunnel alongside): the ribbon ends there, fading over a metre.
 */

/** A river as WORLD gives it (structural: src/world/gen/strata/structures.ts RiverSite). */
export interface RiverView {
  kind: 'water' | 'lava' | string;
  /** Centre line, spring to mouth: x, surface y, z (about every metre). */
  points: ReadonlyArray<readonly number[]>;
  width: number;
}

/** How far past WORLD's half width the ribbon reaches (m): its banks tuck into the channel's walls. */
const BANK = 0.45;
/** A larger step between two points breaks the ribbon (m, horizontal and vertical). */
const GAP_XZ = 2.6;
const GAP_Y = 1.6;
/** The lava's surface under WORLD's water line (the lava blocks' top, one cell below). */
export const LAVA_DROP = 0.66;

/**
 * The ribbons of every river of one kind, merged (pure; unit-tested). Per vertex: the position,
 * `aFlow` (metres from the run's start, along the flow), `aAcross` (-1 left bank .. 1 right bank),
 * `aSlope` (how steeply the bed falls there, 0 flat .. 1 a step), `aEnds` (metres to the nearest
 * end of the run: the ends fade) and `aDir` (the flow's direction, xz). Null when there is nothing
 * to draw.
 */
export function riverGeometry(rivers: readonly RiverView[], kind: 'water' | 'lava', skip?: (x: number, y: number, z: number) => boolean): THREE.BufferGeometry | null {
  const pos: number[] = [];
  const flow: number[] = [];
  const across: number[] = [];
  const slope: number[] = [];
  const ends: number[] = [];
  const dir: number[] = [];
  const index: number[] = [];
  for (const r of rivers) {
    if (!r || (r.kind === 'lava') !== (kind === 'lava') || !Array.isArray(r.points)) continue;
    const half = Math.max(0.6, (r.width || 2.2) / 2) + BANK;
    const drop = kind === 'lava' ? LAVA_DROP : 0;
    // Split into runs where the channel is continuous.
    const runs: Array<Array<readonly number[]>> = [];
    let run: Array<readonly number[]> = [];
    for (const p of r.points) {
      if (!p || p.length < 3 || !p.every((n: number) => Number.isFinite(n))) continue;
      // Where the river runs through a pool the pool's own surface is the water (no second sheet
      // on it): the run ends there and starts again past it.
      if (skip?.(p[0], p[1], p[2])) {
        runs.push(run);
        run = [];
        continue;
      }
      const q = run[run.length - 1];
      if (q && (Math.hypot(p[0] - q[0], p[2] - q[2]) > GAP_XZ || Math.abs(p[1] - q[1]) > GAP_Y)) {
        runs.push(run);
        run = [];
      }
      run.push(p);
    }
    runs.push(run);
    for (const pts of runs) {
      if (pts.length < 3) continue;
      // Distance along the run, and its total.
      const s: number[] = [0];
      for (let i = 1; i < pts.length; i++) s.push(s[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][2] - pts[i - 1][2]));
      const total = s[s.length - 1];
      if (total < 2) continue;
      const v0 = pos.length / 3;
      for (let i = 0; i < pts.length; i++) {
        // A smoothed tangent (two points either side) so the banks do not kink at every cell.
        const a = pts[Math.max(0, i - 2)];
        const b = pts[Math.min(pts.length - 1, i + 2)];
        let tx = b[0] - a[0];
        let tz = b[2] - a[2];
        const tl = Math.hypot(tx, tz) || 1;
        tx /= tl;
        tz /= tl;
        // Left of the flow: (-tz, tx) is the left normal seen from above (+y up, flow along t).
        const nx = -tz;
        const nz = tx;
        // The bed's fall here (m per m over the neighbours), 1 at a full step.
        const fall = Math.max(0, (a[1] - b[1]) / Math.max(0.5, Math.hypot(b[0] - a[0], b[2] - a[2])));
        // The surface eases between neighbours, so a step reads as a short rapid, not a cliff.
        const y = (pts[Math.max(0, i - 1)][1] + pts[i][1] * 2 + pts[Math.min(pts.length - 1, i + 1)][1]) / 4 - drop;
        const p = pts[i];
        for (const side of [-1, 1]) {
          pos.push(p[0] + nx * half * -side, y, p[2] + nz * half * -side);
          flow.push(s[i]);
          across.push(side);
          slope.push(Math.min(1, fall));
          ends.push(Math.min(s[i], total - s[i]));
          dir.push(tx, tz);
        }
      }
      for (let i = 0; i + 1 < pts.length; i++) {
        const k = v0 + i * 2;
        // (left, right) at i and i + 1; counter-clockwise seen from above.
        index.push(k, k + 2, k + 1, k + 1, k + 2, k + 3);
      }
    }
  }
  if (!index.length) return null;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aFlow', new THREE.Float32BufferAttribute(flow, 1));
  g.setAttribute('aAcross', new THREE.Float32BufferAttribute(across, 1));
  g.setAttribute('aSlope', new THREE.Float32BufferAttribute(slope, 1));
  g.setAttribute('aEnds', new THREE.Float32BufferAttribute(ends, 1));
  g.setAttribute('aDir', new THREE.Float32BufferAttribute(dir, 2));
  g.setIndex(index);
  g.computeBoundingBox();
  g.computeBoundingSphere();
  return g;
}

const vert = /* glsl */ `
in float aFlow;
in float aAcross;
in float aSlope;
in float aEnds;
in vec2 aDir;
out vec3 vWorldPos;
out vec2 vDir;
out float vFlow;
out float vAcross;
out float vSlope;
out float vEnds;
out float vDepth;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorldPos = wp.xyz;
  vFlow = aFlow;
  vAcross = aAcross;
  vSlope = aSlope;
  vEnds = aEnds;
  vDir = aDir;
  vec4 mv = viewMatrix * wp;
  vDepth = length(mv.xyz);
  gl_Position = projectionMatrix * mv;
}
`;

const NOISE = /* glsl */ `
float rh(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float rn(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(rh(i), rh(i + vec2(1, 0)), u.x), mix(rh(i + vec2(0, 1)), rh(i + vec2(1, 1)), u.x), u.y);
}
`;

const waterFrag = /* glsl */ `
precision highp float;
${LIGHTING_GLSL}
uniform vec3 uWaterDeep;
uniform vec3 uWaterShallow;
uniform vec4 uWaterSky;
uniform vec4 uWaterGlow;
uniform vec4 uSonar;
uniform vec4 uSonarFx;
uniform float uFlowSpeed;
in vec3 vWorldPos;
in float vFlow;
in float vAcross;
in float vSlope;
in float vEnds;
in float vDepth;
in vec2 vDir;
layout(location = 0) out highp vec4 fragColor;
${NOISE}
float luma3(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }

// The surface height in the river's own frame (u across in metres, s along the flow): ripples
// stretched along the current and advected downstream, faster in the middle than by the banks.
float surf(vec2 q, float t, float speed) {
  float s = q.y - t * speed;
  return rn(vec2(q.x * 1.6, s * 0.55)) * 0.55 + rn(vec2(q.x * 3.6 + 7.0, s * 1.3 - t * 0.2)) * 0.3 + rn(vec2(q.x * 8.0, s * 3.2)) * 0.15;
}

void main() {
  float t = uTime;
  float edge = abs(vAcross);
  // Slower by the banks (a parabolic current), faster down a step.
  float speed = uFlowSpeed * (0.55 + 0.45 * (1.0 - edge * edge)) * (1.0 + 1.8 * vSlope);
  vec2 q = vec2(vAcross * 1.5, vFlow);
  float h0 = surf(q, t, speed);
  float e = 0.08;
  float hu = surf(q + vec2(e, 0.0), t, speed);
  float hs = surf(q + vec2(0.0, e), t, speed);
  // The frame's axes in the world: along the flow, and across it (the way vAcross grows).
  vec3 along = length(vDir) > 1e-4 ? normalize(vec3(vDir.x, 0.0, vDir.y)) : vec3(0.0, 0.0, 1.0);
  vec3 side = vec3(along.z, 0.0, -along.x);
  float amp = 0.07 + 0.12 * vSlope;
  vec3 n = normalize(vec3(0.0, 1.0, 0.0) - side * ((hu - h0) / e) * amp - along * ((hs - h0) / e) * amp);
  vec3 v = normalize(cameraPosition - vWorldPos);
  float ndv = max(dot(n, v), 0.0);
  float fres = 0.02 + 0.98 * pow(1.0 - ndv, 5.0);
  vec3 sp = vWorldPos + vec3(0.0, 0.5, 0.0);
  vec4 ls = lightSample(sp);
  // The cave above, mirrored (as the lakes do: the first rock along the reflected ray, lit).
  vec3 r = reflect(-v, n);
  vec3 sky = uWaterSky.rgb;
  if (uWaterSky.a > 0.5) {
    float tt = 0.8;
    for (int i = 0; i < 4; i++) {
      vec4 lr = lightSample(vWorldPos + r * tt + vec3(0.0, 0.2, 0.0));
      vec3 lit = (uAmbient + uOpenAmbient * lr.a * lr.a + lr.rgb) * 0.075;
      if (lr.a < 0.18) { sky = mix(sky, lit, 0.85); break; }
      sky = mix(sky, lit * 0.6 + uWaterSky.rgb * 0.4, 0.3);
      tt *= 1.9;
    }
  } else {
    vec3 air = mix(uFogLow, uFogColor, 0.5);
    sky = mix(vec3(luma3(air)), air, 0.5) * 0.24;
  }
  vec3 l1 = lightSample(vWorldPos + r * 3.0 + vec3(0.0, 0.3, 0.0)).rgb;
  vec3 hot = max(l1 - ls.rgb * 0.85, 0.0);
  vec3 refl = sky + hot / (1.0 + luma3(hot)) * 0.35;
  vec3 lantern = lanternLight(sp, vWorldPos, n, ls.a);
  vec3 spec = lanternSpec(n, v, 0.08, vec3(0.02)) * 1.3 + lanternSpec(n, v, 0.3, vec3(0.02)) * 0.3;
  // The body: a shallow channel (about 0.75 m): the stone bed shows through, tinted.
  vec3 body = mix(uWaterShallow, uWaterDeep, 0.35) * (0.6 + 0.4 * ls.a) + lantern * uWaterShallow * 0.4;
  // Foam: streaks along the banks and white water down the steps, carried by the current; lit
  // like the water's matter (the lantern, the placed lights, the cool fill), never self-lit.
  float s = vFlow - t * speed * 1.15;
  float streak = smoothstep(0.55, 0.85, rn(vec2(vAcross * 5.0 + 11.0, s * 0.9)) * 0.6 + rn(vec2(vAcross * 11.0, s * 2.4)) * 0.4);
  float bank = smoothstep(0.62, 0.92, edge);
  float foam = clamp(streak * (bank * 0.75 + vSlope * 1.4) + vSlope * 0.35 * rn(vec2(vAcross * 3.0, s * 1.7)), 0.0, 1.0);
  vec3 foamLit = (ambientFrom(ls) * 0.5 + lantern * 0.7) * vec3(0.55, 0.62, 0.66);
  // Bioluminescence carried by the current (the biome's glow), and the sonar's wave.
  vec3 glow = vec3(0.0);
  if (uWaterGlow.a > 0.001) {
    float speck = smoothstep(0.84, 0.97, rn(vec2(vAcross * 2.4 + 3.0, (vFlow - t * speed * 0.9) * 1.1))) * (0.55 + 0.45 * sin(t * 1.3 + rh(floor(q * 2.0)) * 6.28));
    float wave = 0.0;
    if (uSonarFx.y > 0.001) {
      float sd = distance(vWorldPos, uSonar.xyz);
      float ahead = (sd - uSonar.w) / 2.2;
      float trail = step(sd, uSonar.w) * exp(-(uSonar.w - sd) * 0.1) * uSonarFx.w * smoothstep(0.5, 0.9, rn(q * 2.6 - t * 0.3));
      wave = (exp(-ahead * ahead) * 1.2 + trail) * uSonarFx.y * step(sd, uSonarFx.z * 1.1);
    }
    glow = uWaterGlow.rgb * uWaterGlow.a * (speck * 0.3 + wave * 1.3);
  }
  float cover = mix(0.62, 0.9, fres);
  vec3 color = mix(body * cover + refl * fres + spec, foamLit, foam * 0.85) + glow;
  // The ribbon dissolves at the ends of its run (where the river goes under a bridge or the floor)
  // and softens into its banks.
  float alpha = mix(cover, 0.92, foam) * smoothstep(0.0, 1.2, vEnds) * (1.0 - smoothstep(0.9, 1.0, edge) * 0.6);
  color *= smoothstep(0.0, 1.2, vEnds);
  vec4 atm = atmosphere(vWorldPos, vDepth, ls.rgb);
  color = mix(color, atm.rgb * alpha, atm.a);
  fragColor = vec4(sceneOut(color), clamp(alpha, 0.0, 1.0));
}
`;

const lavaFrag = /* glsl */ `
precision highp float;
${LIGHTING_GLSL}
uniform float uFlowSpeed;
in vec3 vWorldPos;
in float vFlow;
in float vAcross;
in float vSlope;
in float vEnds;
in float vDepth;
layout(location = 0) out highp vec4 fragColor;
${NOISE}

// Cellular plates: (distance to the nearest cell point, to the second nearest).
vec2 cells(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  float d1 = 8.0, d2 = 8.0;
  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
    vec2 g = vec2(float(x), float(y));
    vec2 o = vec2(rh(i + g), rh(i + g + 17.3));
    float d = length(g + o - f);
    if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d;
  }
  return vec2(d1, d2);
}

void main() {
  float t = uTime;
  float edge = abs(vAcross);
  // The crust drifts slower than the molten core and piles up along the banks.
  float speed = uFlowSpeed * (0.35 + 0.65 * (1.0 - edge * edge)) * (1.0 + 1.2 * vSlope);
  vec2 q = vec2(vAcross * 1.7, (vFlow - t * speed) * 0.62);
  vec2 c = cells(q * 1.25);
  float seam = 1.0 - smoothstep(0.0, 0.16 + 0.1 * rn(q * 2.0 + t * 0.1), c.y - c.x);
  // Heat: the middle of the flow, the seams, a slow pulse running down it; cooler, crusted banks.
  float core = 1.0 - smoothstep(0.15, 0.95, edge);
  float pulse = 0.75 + 0.25 * sin(vFlow * 0.45 - t * 1.1 + rn(q) * 2.0);
  float heat = clamp(seam * (0.55 + 0.6 * core) * pulse + core * 0.18 + vSlope * 0.4, 0.0, 1.0);
  vec3 crust = mix(vec3(0.018, 0.008, 0.006), vec3(0.09, 0.025, 0.01), rn(q * 3.0) * 0.6 + core * 0.4);
  vec3 molten = mix(vec3(1.6, 0.32, 0.05), vec3(3.2, 1.35, 0.32), smoothstep(0.55, 1.0, heat));
  vec3 col = mix(crust, molten, smoothstep(0.08, 0.7, heat)) * uAtmos.w;
  // The lantern still touches the crust (it is rock): a little, so the plates have form up close.
  vec4 ls = lightSample(vWorldPos + vec3(0.0, 0.5, 0.0));
  vec3 n = vec3(0.0, 1.0, 0.0);
  col += lanternLight(vWorldPos + vec3(0.0, 0.5, 0.0), vWorldPos, n, ls.a) * crust * 3.0 * (1.0 - heat);
  float alpha = smoothstep(0.0, 1.0, vEnds) * (1.0 - smoothstep(0.86, 1.0, edge));
  // The haze takes it like any emission (the zone's absorb share), and veils it in its own colour.
  vec4 atm = atmosphere(vWorldPos, vDepth, ls.rgb);
  col = col * (1.0 - atm.a * uAtmos.z) + atm.rgb * atm.a * 0.5;
  fragColor = vec4(sceneOut(col * alpha), alpha);
}
`;

/** The rivers of a stratum: one ribbon mesh per kind (water, lava). */
export class RiverRibbons {
  readonly group = new THREE.Group();
  private readonly water: THREE.ShaderMaterial;
  private readonly lava: THREE.ShaderMaterial;
  private meshes: THREE.Mesh[] = [];
  /** The biome water's uniforms (shared with the lakes: VisDirector sets them once). */
  readonly uniforms: Record<string, THREE.IUniform>;

  constructor(lighting: LightingUniforms, water: Record<string, THREE.IUniform>) {
    this.group.name = 'rivers';
    this.uniforms = water;
    const blend = { transparent: true, depthWrite: false, blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor } as const;
    this.water = new THREE.ShaderMaterial({ glslVersion: THREE.GLSL3, uniforms: { ...lighting, ...water, uFlowSpeed: { value: 1.5 } }, vertexShader: vert, fragmentShader: waterFrag, ...blend });
    this.lava = new THREE.ShaderMaterial({ glslVersion: THREE.GLSL3, uniforms: { ...lighting, uFlowSpeed: { value: 0.42 } }, vertexShader: vert, fragmentShader: lavaFrag, ...blend });
  }

  /**
   * Replace the rivers (a stratum switch); none: nothing drawn. `lakes`: the still pools the river
   * runs through (their surface is the water there).
   */
  set(rivers: readonly RiverView[], lakes: ReadonlyArray<{ level: number; min: readonly number[]; max: readonly number[]; mask: ArrayLike<number> }> = []): void {
    this.clear();
    const inPool = (x: number, y: number, z: number): boolean => {
      const cx = Math.floor(x);
      const cz = Math.floor(z);
      for (const l of lakes) {
        if (Math.abs(l.level - y) > 0.6 || cx < l.min[0] || cz < l.min[1] || cx > l.max[0] || cz > l.max[1]) continue;
        if (l.mask[(cz - l.min[1]) * (l.max[0] - l.min[0] + 1) + (cx - l.min[0])] === 1) return true;
      }
      return false;
    };
    for (const kind of ['water', 'lava'] as const) {
      const g = riverGeometry(rivers, kind, kind === 'water' && lakes.length ? inPool : undefined);
      if (!g) continue;
      const m = new THREE.Mesh(g, kind === 'water' ? this.water : this.lava);
      m.name = `river:${kind}`;
      m.renderOrder = 5;
      m.matrixAutoUpdate = false;
      this.meshes.push(m);
      this.group.add(m);
    }
  }

  /** Share the terrain's sonar uniforms (the glowing wave rides the same shell). */
  setSonar(sonar: THREE.IUniform<THREE.Vector4>, fx: THREE.IUniform<THREE.Vector4>): void {
    this.water.uniforms.uSonar = sonar;
    this.water.uniforms.uSonarFx = fx;
  }

  /** Ribbon quads drawn (tests, the debug report). */
  get quads(): number {
    let n = 0;
    for (const m of this.meshes) n += (m.geometry.index?.count ?? 0) / 6;
    return n;
  }

  private clear(): void {
    for (const m of this.meshes) {
      this.group.remove(m);
      m.geometry.dispose();
    }
    this.meshes = [];
  }

  dispose(): void {
    this.clear();
    this.water.dispose();
    this.lava.dispose();
  }
}
