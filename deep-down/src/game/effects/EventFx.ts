import * as THREE from 'three';
import { LIGHTING_GLSL, type LightingUniforms } from '../../render/lighting';
import { B, SOLID } from '../../config/blocks';
import { hexToLinear } from '../../core/math';
import type { EventBus, GameEvents } from '../../core/events';
import type { VoxelWorld } from '../../world/VoxelWorld';
import type { EventLive, GameEvent } from '../events/types';

/**
 * The world events' own visuals (polish 2, VIS; the `world:event` kinds of game/events), small and
 * calm, one draw call for all of them:
 * - **rockfall:** grit and dust trickle down from the roof (`event.target`) onto the spot that will
 *   be hit (`event.anchor`), thickening until the stones land, then a low settling puff;
 * - **geyser:** glowing spores rise from the vent (`event.anchor`) in a slow, swirling column;
 * - **bloom:** a soft glow breathes on the blooming crystals (the exposed crystal faces round
 *   `event.anchor`), fading in and out with the event;
 * - **echo:** the Halden echo light is a drifting mote (`events.live.light`, eased so it glides
 *   between the cells it hops through), with a faint halo and a few trailing sparks.
 *
 * Dust is lit like the rock (light volume and lantern); spores, glows and the mote are emissive
 * (additive). Glows sit out from the face they light, so the wall never cuts them in half, and
 * every particle is depth-tested (nothing shows through rock).
 */

const MAX = 160;

const vert = /* glsl */ `
in float aSize;
in float aAlpha;
in vec3 aColor;
in float aGlow;
uniform float uPixelScale;
out float vAlpha;
out vec3 vColor;
out vec3 vWorldPos;
out float vDepth;
out float vGlow;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorldPos = wp.xyz;
  vec4 mv = viewMatrix * wp;
  vDepth = length(mv.xyz);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = clamp(aSize * uPixelScale / max(0.1, -mv.z), 1.0, 220.0);
  // Never a screen-filling disc at the lens.
  vAlpha = aAlpha * smoothstep(0.6, 1.8, -mv.z);
  vColor = aColor;
  vGlow = aGlow;
}
`;

const frag = /* glsl */ `
precision highp float;
${LIGHTING_GLSL}
in float vAlpha;
in vec3 vColor;
in vec3 vWorldPos;
in float vDepth;
in float vGlow;
layout(location = 0) out highp vec4 fragColor;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float d = dot(c, c) * 4.0;
  if (d > 1.0) discard;
  // glow 0: lit dust (a soft puff); 1: a small bright mote (crisp core, soft edge); 2: a wide
  // soft glow (a gaussian, no edge at all).
  float shape = vGlow < 0.5 ? (1.0 - d) * (1.0 - d) : vGlow < 1.5 ? smoothstep(1.0, 0.0, d) * (0.35 + 0.65 * smoothstep(0.35, 0.0, d)) : exp(-d * 3.2) * (1.0 - d);
  vec4 ls = lightSample(vWorldPos);
  vec3 col;
  float a;
  vec4 atm = atmosphere(vWorldPos, vDepth, ls.rgb);
  if (vGlow < 0.5) {
    vec3 light = ambientFrom(ls) + lanternLight(vWorldPos, vWorldPos, normalize(uLanternPos - vWorldPos), 0.5, 1.2) * 0.8;
    col = mix(vColor * light, atm.rgb, atm.a);
    a = vAlpha * shape * (1.0 - atm.a * 0.85);
    fragColor = vec4(sceneOut(col) * a, a);
  } else {
    // Emissive and additive (alpha 0 under the premultiplied blend), dimmed by the haze.
    col = vColor * vAlpha * shape * uAtmos.w * (1.0 - atm.a * 0.7);
    fragColor = vec4(sceneOut(col), 0.0);
  }
}
`;

interface Mote {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  max: number;
  size: number;
  alpha: number;
  r: number;
  g: number;
  b: number;
  glow: number;
  /** 'fall': grit under gravity; 'rise': a spore; 'drift': a spark easing to rest. */
  kind: 0 | 1 | 2;
  floor: number;
}

interface EventSource {
  readonly current: GameEvent | null;
  readonly live: EventLive;
}

const lin = (hex: number, k = 1): [number, number, number] => {
  const c = hexToLinear(hex);
  return [c[0] * k, c[1] * k, c[2] * k];
};
const DUST = lin(0x8f8a80, 1.6);
const SPORE_A = lin(0xd8f08a, 1.5);
const SPORE_B = lin(0x9ff0c8, 1.5);
const BLOOM = lin(0x8feeff, 0.55);
const ECHO_CORE = lin(0xfff0cc, 3.2);
const ECHO_HALO = lin(0xffd49a, 0.5);
const ECHO_SPARK = lin(0xffe2a8, 1.6);

const CRYSTALS = new Set<number>([B.CRYSTAL, B.ECHO_CRYSTAL, B.GEM_ORE]);
const FACES: ReadonlyArray<readonly [number, number, number]> = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];

export class EventFx {
  readonly group = new THREE.Group();
  private readonly material: THREE.ShaderMaterial;
  private readonly geo = new THREE.BufferGeometry();
  private readonly pos = new Float32Array(MAX * 3);
  private readonly size = new Float32Array(MAX);
  private readonly alpha = new Float32Array(MAX);
  private readonly color = new Float32Array(MAX * 3);
  private readonly glowA = new Float32Array(MAX);
  private readonly motes: Mote[] = [];
  /** The bloom's glows: a point out from each lit crystal face. */
  private blooms: Array<[number, number, number, number]> = [];
  private bloomFor: string | null = null;
  private bloomFade = 0;
  /** The echo mote, eased toward live.light. */
  private readonly echo = new THREE.Vector3(Number.NaN, 0, 0);
  private echoFade = 0;
  private landed: string | null = null;
  private spawnAcc = 0;
  private time = 0;
  private seed = 1;
  private readonly off: Array<() => void> = [];

  constructor(lighting: LightingUniforms, bus: EventBus<GameEvents>, private readonly source: () => EventSource | null, private readonly world: () => VoxelWorld) {
    this.material = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      uniforms: { ...lighting, uPixelScale: { value: 600 } },
      vertexShader: vert,
      fragmentShader: frag,
      transparent: true,
      depthWrite: false,
      blending: THREE.CustomBlending,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneMinusSrcAlphaFactor,
    });
    const attr = (a: Float32Array, n: number) => new THREE.BufferAttribute(a, n).setUsage(THREE.DynamicDrawUsage);
    this.geo.setAttribute('position', attr(this.pos, 3));
    this.geo.setAttribute('aSize', attr(this.size, 1));
    this.geo.setAttribute('aAlpha', attr(this.alpha, 1));
    this.geo.setAttribute('aColor', attr(this.color, 3));
    this.geo.setAttribute('aGlow', attr(this.glowA, 1));
    this.geo.setDrawRange(0, 0);
    const points = new THREE.Points(this.geo, this.material);
    points.frustumCulled = false;
    points.renderOrder = 9;
    points.name = 'event-fx';
    this.group.add(points);
    // The stones landed: the trickle stops and a low puff settles round the heap.
    const onRock = bus.on('world:rockfall', (e) => {
      this.landed = this.source()?.current?.id ?? 'landed';
      for (let i = 0; i < 10; i++) {
        const a = this.rand() * Math.PI * 2;
        const r = 0.3 + this.rand() * 1.1;
        this.spawn({ x: e.x + Math.cos(a) * r, y: e.y + 0.15 + this.rand() * 0.3, z: e.z + Math.sin(a) * r, vx: Math.cos(a) * 0.35, vy: 0.12 + this.rand() * 0.2, vz: Math.sin(a) * 0.35, life: 0, max: 1.6 + this.rand(), size: 0.35 + this.rand() * 0.3, alpha: 0.22, r: DUST[0], g: DUST[1], b: DUST[2], glow: 0, kind: 2, floor: -1e9 });
      }
    });
    this.off.push(onRock);
  }

  setPixelScale(heightPx: number, fovDeg: number): void {
    this.material.uniforms.uPixelScale.value = heightPx / (2 * Math.tan((fovDeg * Math.PI) / 360));
  }

  /** How many motes are alive (tests, the debug report). */
  get count(): number {
    return this.motes.length;
  }

  update(dt: number, time: number): void {
    this.time = time;
    const src = this.source();
    const ev = src?.current ?? null;
    this.emit(ev, src?.live ?? null, dt);
    this.step(dt);
    this.write();
  }

  dispose(): void {
    for (const f of this.off) f();
    this.geo.dispose();
    this.material.dispose();
  }

  // ------------------------------------------------------------------------------------------

  private rand(): number {
    // xorshift: deterministic, so captures are reproducible.
    let s = this.seed;
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    this.seed = s >>> 0 || 1;
    return (this.seed % 100000) / 100000;
  }

  private spawn(m: Mote): void {
    if (this.motes.length >= MAX - 12) this.motes.shift();
    m.life = m.max;
    this.motes.push(m);
  }

  private emit(ev: GameEvent | null, live: EventLive | null, dt: number): void {
    // --- the bloom's glows fade with the event
    const bloomOn = !!ev && ev.kind === 'bloom';
    if (bloomOn && this.bloomFor !== ev.id) {
      this.bloomFor = ev.id;
      this.blooms = this.findCrystals(ev);
    }
    this.bloomFade = bloomOn ? Math.min(1, this.bloomFade + dt / 2.5) : Math.max(0, this.bloomFade - dt / 3);
    if (!bloomOn && this.bloomFade <= 0) this.blooms = [];
    // --- the echo light glides
    const light = ev && ev.kind === 'echo' ? live?.light : undefined;
    if (light) {
      if (Number.isNaN(this.echo.x)) this.echo.set(light[0], light[1], light[2]);
      const k = 1 - Math.exp(-dt * 2.2);
      this.echo.x += (light[0] - this.echo.x) * k;
      this.echo.y += (light[1] - this.echo.y) * k;
      this.echo.z += (light[2] - this.echo.z) * k;
      this.echoFade = Math.min(1, this.echoFade + dt / 1.2);
    } else {
      this.echoFade = Math.max(0, this.echoFade - dt / 1.5);
      if (this.echoFade <= 0) this.echo.x = Number.NaN;
    }
    if (!ev) {
      this.spawnAcc = 0;
      return;
    }
    this.spawnAcc += dt;
    const [ax, ay, az] = ev.anchor;
    if (ev.kind === 'rockfall' && this.landed !== ev.id) {
      // Grit trickles from the roof over the spot, thickening as the fall nears.
      const roof = ev.target?.[1] ?? ay + 4;
      const rate = 10 + 22 * Math.min(1, live?.t ?? 0);
      while (this.spawnAcc > 1 / rate) {
        this.spawnAcc -= 1 / rate;
        const a = this.rand() * Math.PI * 2;
        const r = Math.sqrt(this.rand()) * Math.min(1.1, ev.radius * 0.6);
        const puff = this.rand() < 0.3;
        this.spawn({
          x: ax + Math.cos(a) * r, y: roof - 0.1 - this.rand() * 0.2, z: az + Math.sin(a) * r,
          vx: 0, vy: -0.2 - this.rand() * 0.4, vz: 0, life: 0, max: 3.2,
          size: puff ? 0.16 + this.rand() * 0.14 : 0.025 + this.rand() * 0.03, alpha: puff ? 0.26 : 0.8,
          r: DUST[0], g: DUST[1], b: DUST[2], glow: 0, kind: 0, floor: ay + 0.05,
        });
      }
    } else if (ev.kind === 'geyser') {
      // Spores rise from the vent in a slow column that swirls and spreads as it climbs.
      const rate = 16;
      while (this.spawnAcc > 1 / rate) {
        this.spawnAcc -= 1 / rate;
        const a = this.rand() * Math.PI * 2;
        const r = this.rand() * 0.28;
        const c = this.rand() < 0.6 ? SPORE_A : SPORE_B;
        this.spawn({
          x: ax + Math.cos(a) * r, y: ay + 0.1, z: az + Math.sin(a) * r,
          vx: Math.cos(a) * 0.12, vy: 1.1 + this.rand() * 0.9, vz: Math.sin(a) * 0.12, life: 0, max: 2.6 + this.rand() * 1.6,
          size: 0.035 + this.rand() * 0.035, alpha: 0.9, r: c[0], g: c[1], b: c[2], glow: 1, kind: 1, floor: -1e9,
        });
      }
    } else if (ev.kind === 'echo' && !Number.isNaN(this.echo.x)) {
      // A few sparks trail the mote and drift to rest.
      while (this.spawnAcc > 0.16) {
        this.spawnAcc -= 0.16;
        this.spawn({
          x: this.echo.x + (this.rand() - 0.5) * 0.12, y: this.echo.y + (this.rand() - 0.5) * 0.12, z: this.echo.z + (this.rand() - 0.5) * 0.12,
          vx: (this.rand() - 0.5) * 0.25, vy: -0.05 + this.rand() * 0.15, vz: (this.rand() - 0.5) * 0.25, life: 0, max: 1.1 + this.rand() * 0.6,
          size: 0.022 + this.rand() * 0.02, alpha: 0.8 * this.echoFade, r: ECHO_SPARK[0], g: ECHO_SPARK[1], b: ECHO_SPARK[2], glow: 1, kind: 2, floor: -1e9,
        });
      }
    } else this.spawnAcc = 0;
  }

  private step(dt: number): void {
    const t = this.time;
    for (let i = this.motes.length - 1; i >= 0; i--) {
      const m = this.motes[i];
      m.life -= dt;
      if (m.kind === 0) {
        // Grit: gravity against air drag (it falls at about 2 m/s, never a stream of bullets).
        m.vy -= 3.2 * dt;
        m.vy *= 1 - 1.4 * dt;
        if (m.y <= m.floor) m.life = Math.min(m.life, 0.0);
      } else if (m.kind === 1) {
        // A spore: buoyant, slowing as it rises, swirling round the column.
        m.vy *= 1 - 0.55 * dt;
        const sw = Math.sin(t * 1.3 + m.max * 9.0) * 0.18;
        m.vx += sw * dt;
        m.vz += Math.cos(t * 1.1 + m.max * 7.0) * 0.18 * dt;
      } else {
        m.vx *= 1 - 1.8 * dt;
        m.vy *= 1 - 1.8 * dt;
        m.vz *= 1 - 1.8 * dt;
      }
      m.x += m.vx * dt;
      m.y += m.vy * dt;
      m.z += m.vz * dt;
      if (m.life <= 0) this.motes.splice(i, 1);
    }
  }

  private write(): void {
    let n = 0;
    const put = (x: number, y: number, z: number, size: number, a: number, c: readonly number[], glow: number) => {
      if (n >= MAX || a <= 0.002) return;
      this.pos[n * 3] = x;
      this.pos[n * 3 + 1] = y;
      this.pos[n * 3 + 2] = z;
      this.size[n] = size;
      this.alpha[n] = a;
      this.color[n * 3] = c[0];
      this.color[n * 3 + 1] = c[1];
      this.color[n * 3 + 2] = c[2];
      this.glowA[n] = glow;
      n++;
    };
    for (const m of this.motes) {
      const u = m.life / m.max;
      // Ease in and out (no pop).
      const a = m.alpha * Math.min(1, (1 - u) * 6) * Math.min(1, u * 3);
      put(m.x, m.y, m.z, m.size * (m.kind === 2 && m.glow === 0 ? 1 + (1 - u) * 0.8 : 1), a, [m.r, m.g, m.b], m.glow);
    }
    // The bloom breathes slowly (one breath about every 4 s), never a flash.
    if (this.bloomFade > 0) {
      const breath = 0.78 + 0.22 * Math.sin(this.time * 1.55);
      for (const [x, y, z, s] of this.blooms) put(x, y, z, s, this.bloomFade * breath, BLOOM, 2);
    }
    if (this.echoFade > 0 && !Number.isNaN(this.echo.x)) {
      const bob = Math.sin(this.time * 1.8) * 0.06;
      const pulse = 0.9 + 0.1 * Math.sin(this.time * 3.1);
      put(this.echo.x, this.echo.y + bob, this.echo.z, 0.9, 0.5 * this.echoFade, ECHO_HALO, 2);
      put(this.echo.x, this.echo.y + bob, this.echo.z, 0.12, this.echoFade * pulse, ECHO_CORE, 1);
    }
    this.geo.setDrawRange(0, n);
    if (n > 0) for (const name of ['position', 'aSize', 'aAlpha', 'aColor', 'aGlow']) (this.geo.getAttribute(name) as THREE.BufferAttribute).needsUpdate = true;
  }

  /** The exposed crystal faces round a bloom (up to 7): a glow sits ~0.45 m out from each. */
  private findCrystals(ev: GameEvent): Array<[number, number, number, number]> {
    const w = this.world();
    const [ax, ay, az] = ev.anchor;
    const R = Math.ceil(ev.radius + 1.5);
    const found: Array<[number, number, number, number, number]> = [];
    for (let z = Math.floor(az) - R; z <= Math.floor(az) + R; z++)
      for (let y = Math.floor(ay) - 2; y <= Math.floor(ay) + R; y++)
        for (let x = Math.floor(ax) - R; x <= Math.floor(ax) + R; x++) {
          if (!CRYSTALS.has(w.get(x, y, z))) continue;
          for (const [fx, fy, fz] of FACES) {
            if (SOLID[w.get(x + fx, y + fy, z + fz)]) continue;
            const d = Math.hypot(x + 0.5 - ax, y + 0.5 - ay, z + 0.5 - az);
            found.push([x + 0.5 + fx * 0.95, y + 0.5 + fy * 0.95, z + 0.5 + fz * 0.95, 1.5, d]);
            break;
          }
        }
    found.sort((a, b) => a[4] - b[4]);
    // Spread them: skip a glow within 1.2 m of one already kept.
    const out: Array<[number, number, number, number]> = [];
    for (const f of found) {
      if (out.some((o) => Math.hypot(o[0] - f[0], o[1] - f[1], o[2] - f[2]) < 1.2)) continue;
      out.push([f[0], f[1], f[2], f[3]]);
      if (out.length >= 7) break;
    }
    if (!out.length) out.push([ax, ay + 0.7, az, 1.6]);
    return out;
  }
}
