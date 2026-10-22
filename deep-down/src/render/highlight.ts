import * as THREE from 'three';
import { SOLID } from '../config/blocks';
import { RARITIES, RARITY_CODE, RARITY_HEX, RARITY_RANK, rarityOf, type Rarity } from '../config/rarity';
import type { PropSpec } from '../world/gen/types';
import type { VoxelWorld } from '../world/VoxelWorld';
import { hexToLinear } from '../core/math';
import { HI_SIZE, type TerrainRig } from './terrainRig';
import { SCENE_ENCODE } from './lighting';
import type { PropRenderer } from './props/PropRenderer';
import { RevealMarkers, type RevealCell } from './reveal';

export type { RevealCell, RevealKind } from './reveal';

/**
 * Rarity highlights and the selection (ROUND2 §0.3-§0.4, the VIS seam).
 *
 * What the player sees:
 * - **Ambient:** every minable or collectable thing within ~14 m of the eye wears its rarity colour
 *   (common warm white, uncommon green, rare blue, epic violet, legendary gold with a slow shimmer):
 *   a crisp thin rim plus a faint inner glow, breathing once every 3 s (never faster than 2.5 s).
 *   - Blocks (ore veins, rubble, roots, gem pockets, seals): drawn by the terrain shader from a
 *     32^3 byte volume around the eye (terrainRig uHiTex), so the rim runs along the vein's outline
 *     on the sculpted surface (not a block grid) at no draw-call cost. Found automatically from the
 *     voxels and config/rarity.
 *   - Props (crates, chests, caches, crystal clusters, relics, notes): a rim light and inner glow in
 *     the prop's own material (no extra draw call). Found automatically from the live props and
 *     rarityOf(spec), filtered by `usable` (an opened cache stops glowing).
 *   - Anything else (mobs: a catchable Glimmerkin, a Shellback's crystals): pass it to setTargets
 *     as an 'object' target. Its meshes' materials take the rim when they expose `uHiColor` (vec3)
 *     and `uHi` (vec2: x ambient, y selected) uniforms (createEntityMaterial has them); otherwise
 *     only the selection outline below is drawn for it.
 * - **Selected** (select()): the target's outline in its rarity colour, brighter and steady. A block
 *   is outlined on its own (every edge it shares with other stone); a prop or an object gets a crisp
 *   screen-constant silhouette outline (an inverted hull that follows its animation) plus a
 *   stronger rim. Too hard (opts.blocked): the outline turns a muted red.
 * - **Progress** (progress()): a small ring anchored on the target in the world (on the struck
 *   point when given), filling clockwise from the top in the rarity colour over a dark track. It
 *   never sits at the screen centre unless the target does.
 *
 * Usage (Game.ts, the VIS hook): construct once per session, add `group` to the scene, call
 * `update()` every frame. FP's selection calls `select()` and `progress()`; MOBS (or FP) passes the
 * mobs in reach to `setTargets()`.
 */

export type { Rarity };

export type HighlightTarget =
  /** A voxel. `point`: where the tap or the mining ray struck it (the ring sits there). */
  | { kind: 'block'; x: number; y: number; z: number; rarity?: Rarity | null; point?: { x: number; y: number; z: number } | null }
  /** A world prop by id (PropRenderer). */
  | { kind: 'prop'; id: string; rarity?: Rarity | null; point?: { x: number; y: number; z: number } | null }
  /** Any other object (a mob): its meshes are highlighted. `id` must be stable while it lives. */
  | { kind: 'object'; id: string; object: THREE.Object3D; rarity: Rarity; point?: { x: number; y: number; z: number } | null };

export interface HighlightOptions {
  terrain: TerrainRig;
  props: PropRenderer;
  /** The live world (a getter: the session may swap it). */
  world: () => VoxelWorld;
  /** The live prop specs (for the automatic prop highlights). */
  liveProps?: () => Iterable<PropSpec>;
  /** A prop with nothing left to give (an opened cache) returns false and stops glowing. */
  usable?: (spec: PropSpec) => boolean;
  /** The live mobs (MobSystem.list()): the ones with a rarity and a render object get its rim. */
  mobs?: () => Iterable<HighlightMob>;
}

/** What the highlights need from a mob (structural: game/mobs/types.ts Mob satisfies it). */
export interface HighlightMob {
  readonly id: number;
  readonly position: { x: number; y: number; z: number };
  rarity?: Rarity;
  tappable?: boolean;
  object?: THREE.Object3D;
}

/** Highlight range (m) and the slow breath (s per pulse; the brief's floor is 2.5 s). */
export const HIGHLIGHT_RANGE = 14;
export const HIGHLIGHT_PULSE_S = 3;
/** Progress ring radius in CSS pixels. */
const RING_PX = 17;

const RARITY_LINEAR: Record<Rarity, THREE.Vector3> = Object.fromEntries(
  RARITIES.map((r) => {
    const c = hexToLinear(RARITY_HEX[r]);
    return [r, new THREE.Vector3(c[0], c[1], c[2])];
  }),
) as Record<Rarity, THREE.Vector3>;

/** Linear rgb of a rarity colour (for materials that draw their own highlight). */
export function rarityLinear(r: Rarity): THREE.Vector3 {
  return RARITY_LINEAR[r];
}

const sameTarget = (a: HighlightTarget | null, b: HighlightTarget | null): boolean => {
  if (!a || !b) return a === b;
  if (a.kind !== b.kind) return false;
  if (a.kind === 'block' && b.kind === 'block') return a.x === b.x && a.y === b.y && a.z === b.z;
  return (a as { id: string }).id === (b as { id: string }).id;
};

// --- the selection outline (inverted hull, screen-constant width) -------------------------------

const hullVert = /* glsl */ `
uniform float uWidth;
uniform vec2 uViewport;
in vec3 aHullN;
void main() {
  vec4 clip = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  vec3 nv = normalize(normalMatrix * aHullN);
  vec2 dir = (projectionMatrix * vec4(nv, 0.0)).xy;
  float l = length(dir);
  dir = l > 1e-5 ? dir / l : vec2(0.0);
  clip.xy += dir * (uWidth * 2.0 / uViewport) * clip.w;
  gl_Position = clip;
}
`;
const hullFrag = /* glsl */ `
precision highp float;
uniform vec3 uColor;
uniform float uSceneEncode;
layout(location = 0) out highp vec4 fragColor;
void main() {
  vec3 c = uColor;
  fragColor = vec4(uSceneEncode > 0.5 ? sqrt(c / (1.0 + c)) : c, 1.0);
}
`;

/** Smooth expansion normals per geometry (flat-shaded props would split at their corners). */
const hullGeometries = new WeakMap<THREE.BufferGeometry, THREE.BufferGeometry>();
function hullGeometry(g: THREE.BufferGeometry): THREE.BufferGeometry {
  let h = hullGeometries.get(g);
  if (h) return h;
  const pos = g.getAttribute('position') as THREE.BufferAttribute;
  const nrm = g.getAttribute('normal') as THREE.BufferAttribute | undefined;
  const n = pos.count;
  const acc = new Map<string, [number, number, number]>();
  const keys: string[] = new Array(n);
  for (let i = 0; i < n; i++) {
    const k = `${Math.round(pos.getX(i) * 500)},${Math.round(pos.getY(i) * 500)},${Math.round(pos.getZ(i) * 500)}`;
    keys[i] = k;
    let a = acc.get(k);
    if (!a) acc.set(k, (a = [0, 0, 0]));
    if (nrm) {
      a[0] += nrm.getX(i);
      a[1] += nrm.getY(i);
      a[2] += nrm.getZ(i);
    }
  }
  const out = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const a = acc.get(keys[i])!;
    const l = Math.hypot(a[0], a[1], a[2]) || 1;
    out[i * 3] = a[0] / l;
    out[i * 3 + 1] = a[1] / l;
    out[i * 3 + 2] = a[2] / l;
  }
  h = new THREE.BufferGeometry();
  h.setAttribute('position', pos);
  h.setAttribute('aHullN', new THREE.BufferAttribute(out, 3));
  if (g.index) h.setIndex(g.index);
  h.boundingSphere = g.boundingSphere;
  h.boundingBox = g.boundingBox;
  hullGeometries.set(g, h);
  return h;
}

// --- the progress ring ---------------------------------------------------------------------------

const ringVert = /* glsl */ `
uniform vec3 uCenter;
uniform float uRadius;
uniform vec2 uViewport;
out vec2 vQ;
void main() {
  vQ = position.xy * 2.0;
  vec4 c = projectionMatrix * viewMatrix * vec4(uCenter, 1.0);
  if (c.w <= 0.05) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
  c.xy += position.xy * 2.0 * (uRadius * 2.0 / uViewport) * c.w;
  c.z = -c.w * 0.999; // in front of the world, behind the viewmodel's own pass order
  gl_Position = c;
}
`;
const ringFrag = /* glsl */ `
precision highp float;
uniform vec3 uColor;
uniform float uProgress;
uniform float uAlpha;
uniform float uSceneEncode;
in vec2 vQ;
layout(location = 0) out highp vec4 fragColor;
void main() {
  float r = length(vQ);
  float aa = fwidth(r) * 1.2;
  // A thin ring (about 2.5 px at 17 px radius) on a slightly wider dark track.
  float band = smoothstep(0.80 - aa, 0.80, r) * (1.0 - smoothstep(0.93, 0.93 + aa, r));
  float track = smoothstep(0.74 - aa, 0.74, r) * (1.0 - smoothstep(1.0 - aa, 1.0, r));
  // Clockwise from the top.
  float ang = atan(vQ.x, vQ.y);
  float f = fract(ang / 6.28318 + 1.0);
  float on = 1.0 - smoothstep(uProgress - 0.004, uProgress + 0.004, f);
  vec3 c = mix(vec3(0.0), uColor * 1.15, on * band);
  float a = max(track * 0.42, band * on) * uAlpha;
  if (a < 0.004) discard;
  c = uSceneEncode > 0.5 ? sqrt(c / (1.0 + c)) : c;
  fragColor = vec4(c * a, a);
}
`;

interface ObjectState {
  target: Extract<HighlightTarget, { kind: 'object' }>;
  /** Materials with highlight uniforms, and their own previous values. */
  mats: THREE.ShaderMaterial[];
}

interface HullState {
  key: string;
  meshes: THREE.Mesh[];
}

export class HighlightSystem {
  /** World-space overlays (the progress ring). Add once to the scene. */
  readonly group = new THREE.Group();
  /** Ambient highlights on (the player's setting, or off in captures). */
  enabled = true;

  private readonly opts: HighlightOptions;
  private readonly volume: Uint8Array;
  private readonly tex: THREE.Data3DTexture;
  private origin = new THREE.Vector3(Number.NaN, 0, 0);
  private revision = -1;
  private worldRef: VoxelWorld | null = null;
  private time = 0;

  private explicit: HighlightTarget[] = [];
  private selected: HighlightTarget | null = null;
  /** The prop the use focus selected (cleared by the focus only if it is still the selection). */
  private focusSel: string | null = null;
  private blocked = false;
  private selStrength = 0;
  private progressValue = 0;
  private progressShown = 0;
  private progressTarget: HighlightTarget | null = null;

  /** Props lit now: id -> [rank, ambient, selected]. */
  private readonly propFx = new Map<string, { rarity: Rarity; amb: number; sel: number }>();
  private readonly objects = new Map<string, ObjectState>();
  private hull: HullState | null = null;
  private readonly hullMats = new Map<string, THREE.ShaderMaterial>();

  private readonly ring: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  /** Round 3: marks seen through the rock (the sonar's reveal). */
  readonly marks = new RevealMarkers();
  private readonly viewport = new THREE.Vector2(1, 1);
  private readonly tmp = new THREE.Vector3();
  private readonly tmpBox = new THREE.Box3();

  constructor(opts: HighlightOptions) {
    this.opts = opts;
    const u = opts.terrain.uniforms;
    this.tex = u.uHiTex.value;
    this.volume = this.tex.image.data as Uint8Array;
    RARITIES.forEach((r, i) => u.uHiCol.value[i].copy(RARITY_LINEAR[r]));
    this.group.name = 'highlights';
    const ringMat = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      uniforms: {
        uCenter: { value: new THREE.Vector3() },
        uRadius: { value: RING_PX * 2 },
        uViewport: { value: this.viewport },
        uColor: { value: new THREE.Vector3(1, 1, 1) },
        uProgress: { value: 0 },
        uAlpha: { value: 0 },
        uSceneEncode: SCENE_ENCODE,
      },
      vertexShader: ringVert,
      fragmentShader: ringFrag,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      blending: THREE.CustomBlending,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneMinusSrcAlphaFactor,
    });
    this.ring = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), ringMat);
    this.ring.frustumCulled = false;
    this.ring.renderOrder = 880; // after the world and its transparents, before the viewmodel (900+)
    this.ring.visible = false;
    this.ring.onBeforeRender = (r) => {
      r.getDrawingBufferSize(this.viewport);
      ringMat.uniforms.uRadius.value = RING_PX * r.getPixelRatio();
    };
    this.group.add(this.ring);
    this.group.add(this.marks.mesh);
    // The focused interactable (the game's use focus) wears the selection outline when it is a find.
    // Only a selection the focus made is cleared by it: a prop the game selected itself (FP's
    // select while opening a chest) keeps its outline when the use focus moves on.
    opts.props.onFocus = (id) => {
      const cur = this.selected;
      const mine = !!cur && cur.kind === 'prop' && cur.id === this.focusSel;
      if (id) {
        const t: HighlightTarget = { kind: 'prop', id };
        if (this.rarityOf(t) && (!cur || mine)) {
          this.select(t);
          this.focusSel = id;
        }
      } else if (mine) {
        this.select(null);
        this.focusSel = null;
      }
    };
  }

  /** Where the live mobs come from (MOBS' hook: `highlight.setMobSource(() => mobs.list())`). */
  setMobSource(fn: (() => Iterable<HighlightMob>) | null): void {
    this.opts.mobs = fn ?? undefined;
  }

  /**
   * Extra ambient targets near the player (mobs, or blocks and props the automatic scan does not
   * know). Replaces the previous list; call it when the set changes (each frame is fine).
   */
  setTargets(list: readonly HighlightTarget[]): void {
    this.explicit = list.slice();
  }

  /**
   * Round 3 (the sonar seam): show `cells` through the rock for `seconds` (each after its own
   * `delay`): ore veins as diamonds in their rarity colour, chests, lairs, the gate, journal pages,
   * cracked walls and outposts as their own marks (render/reveal.ts). Replaces the previous reveal.
   * SonarPulse.ping builds the list from the world and calls this; anyone may call it directly.
   */
  reveal(cells: readonly RevealCell[], seconds = 2): void {
    this.marks.reveal(cells, seconds);
  }

  /** The selected target (null: none). `blocked`: the pick is too weak for it (a muted red outline). */
  select(target: HighlightTarget | null, opts: { blocked?: boolean } = {}): void {
    if (!sameTarget(target, this.selected)) this.selStrength = target && this.selected ? 0.6 : 0;
    this.selected = target ? { ...target } : null;
    this.blocked = !!opts.blocked;
  }

  /** Mining or use progress on a target, 0..1 (<= 0 hides the ring). */
  progress(target: HighlightTarget | null, p: number): void {
    this.progressTarget = target && p > 0 ? { ...target } : null;
    this.progressValue = target ? Math.max(0, Math.min(1, p)) : 0;
  }

  /** The current selection (for tests and the debug API). */
  get selection(): HighlightTarget | null {
    return this.selected;
  }

  /**
   * Every highlighted thing near the eye, for FP's generous hit-test (snap to the nearest find
   * within 56 px, higher rarity first): exposed find blocks (a face open to the air) within
   * `range` m, rarity props, and the mobs with a rarity. Each carries a world point to project.
   */
  targetsNear(eye: { x: number; y: number; z: number }, range = HIGHLIGHT_RANGE): Array<HighlightTarget & { rarity: Rarity; at: { x: number; y: number; z: number } }> {
    const out: Array<HighlightTarget & { rarity: Rarity; at: { x: number; y: number; z: number } }> = [];
    const o = this.origin;
    if (!Number.isNaN(o.x)) {
      const v = this.volume;
      const N = HI_SIZE;
      const r2 = range * range;
      for (let z = 1; z < N - 1; z++)
        for (let y = 1; y < N - 1; y++)
          for (let x = 1; x < N - 1; x++) {
            const i = x + N * (y + N * z);
            const c = v[i];
            if (c < 2) continue;
            const wx = o.x + x;
            const wy = o.y + y;
            const wz = o.z + z;
            const dx = wx + 0.5 - eye.x;
            const dy = wy + 0.5 - eye.y;
            const dz = wz + 0.5 - eye.z;
            if (dx * dx + dy * dy + dz * dz > r2) continue;
            if (v[i - 1] && v[i + 1] && v[i - N] && v[i + N] && v[i - N * N] && v[i + N * N]) continue; // buried
            out.push({ kind: 'block', x: wx, y: wy, z: wz, rarity: RARITIES[c - 2], at: { x: wx + 0.5, y: wy + 0.5, z: wz + 0.5 } });
          }
    }
    for (const spec of this.opts.liveProps?.() ?? []) {
      if (Math.hypot(spec.x - eye.x, spec.y - eye.y, spec.z - eye.z) > range) continue;
      const r = rarityOf(spec);
      if (!r || (this.opts.usable && !this.opts.usable(spec))) continue;
      const b = this.opts.props.bounds(spec.id);
      const at = b ? b.getCenter(new THREE.Vector3()) : new THREE.Vector3(spec.x, spec.y + 0.4, spec.z);
      out.push({ kind: 'prop', id: spec.id, rarity: r, at: { x: at.x, y: at.y, z: at.z } });
    }
    const seen = new Set<string>();
    for (const t of this.explicit) {
      if (t.kind !== 'object') continue;
      const p = t.object.getWorldPosition(new THREE.Vector3());
      if (p.distanceTo(this.tmp.set(eye.x, eye.y, eye.z)) > range) continue;
      seen.add(t.id);
      out.push({ ...t, at: { x: p.x, y: p.y, z: p.z } });
    }
    for (const m of this.opts.mobs?.() ?? []) {
      if (!m.rarity || !m.object || m.tappable === false || seen.has(`mob-${m.id}`)) continue;
      const p = m.position;
      if (Math.hypot(p.x - eye.x, p.y - eye.y, p.z - eye.z) > range) continue;
      out.push({ kind: 'object', id: `mob-${m.id}`, object: m.object, rarity: m.rarity, at: { x: p.x, y: p.y, z: p.z } });
    }
    return out;
  }

  /** Whether the current selection is marked too hard. */
  get selectionBlocked(): boolean {
    return this.blocked;
  }

  /** The rarity a target shows (its own, or the block's / prop's from config/rarity). */
  rarityOf(t: HighlightTarget): Rarity | null {
    if (t.rarity) return t.rarity;
    if (t.kind === 'block') {
      const code = RARITY_CODE[this.opts.world().get(t.x, t.y, t.z)];
      return code ? RARITIES[code - 1] : null;
    }
    if (t.kind === 'prop') {
      for (const s of this.opts.liveProps?.() ?? []) if (s.id === t.id) return rarityOf(s);
      return null;
    }
    return null;
  }

  update(dt: number, time: number, camera: THREE.Camera): void {
    this.time = time;
    const u = this.opts.terrain.uniforms;
    const eye = camera.position;
    this.selStrength = Math.min(1, this.selStrength + dt * 9);
    // --- blocks: the volume around the eye
    this.refreshVolume(eye);
    const sel = this.selected;
    const selRarity = sel ? this.rarityOf(sel) : null;
    // Plain rock has no rarity and is never outlined (a tap on it is only a soft "tunk").
    if (sel && sel.kind === 'block' && selRarity) u.uHiSel.value.set(sel.x, sel.y, sel.z, RARITY_RANK[selRarity] + 2);
    else u.uHiSel.value.set(-9999, -9999, -9999, 0);
    u.uHiFx.value.set(time % 3600, this.selStrength, this.blocked ? 1 : 0, this.enabled ? 1 : 0);
    // Polish 2: the lens' focal factor, so the terrain's outlines stay off cells that fill the view.
    const pm = (camera as THREE.PerspectiveCamera).projectionMatrix;
    if (pm && Number.isFinite(pm.elements[5]) && pm.elements[5] > 0) u.uHiView.value.x = pm.elements[5] * 0.5;
    // --- props and objects
    this.updateProps(eye, sel, selRarity);
    this.updateObjects(eye, sel);
    this.updateHull(sel, selRarity);
    this.updateRing(dt, eye);
    this.marks.update(time);
  }

  dispose(): void {
    if (this.opts.props.onFocus) this.opts.props.onFocus = null;
    this.clearHull();
    for (const id of [...this.propFx.keys()]) this.opts.props.setRarityGlow(id, null, 0, 0, false);
    this.propFx.clear();
    for (const o of this.objects.values()) for (const m of o.mats) setHi(m, null, 0, 0);
    this.objects.clear();
    for (const m of this.hullMats.values()) m.dispose();
    this.ring.geometry.dispose();
    this.ring.material.dispose();
    this.marks.dispose();
    this.opts.terrain.uniforms.uHiOrigin.value.w = 0;
  }

  // ------------------------------------------------------------------------------------------

  /** Rebuild the 32^3 cell-code volume when the eye moves 4+ cells off its centre or the world changes. */
  private refreshVolume(eye: THREE.Vector3): void {
    const w = this.opts.world();
    const half = HI_SIZE / 2;
    const cx = Math.floor(eye.x);
    const cy = Math.floor(eye.y);
    const cz = Math.floor(eye.z);
    const o = this.origin;
    const moved = Number.isNaN(o.x) || Math.abs(cx - (o.x + half)) > 4 || Math.abs(cy - (o.y + half)) > 4 || Math.abs(cz - (o.z + half)) > 4;
    if (!moved && w === this.worldRef && w.revision === this.revision) return;
    this.worldRef = w;
    this.revision = w.revision;
    if (moved) o.set(cx - half, cy - half, cz - half);
    const v = this.volume;
    const blocks = w.blocks;
    const sx = w.sx;
    const sy = w.sy;
    const sz = w.sz;
    let i = 0;
    for (let z = 0; z < HI_SIZE; z++) {
      const wz = o.z + z;
      for (let y = 0; y < HI_SIZE; y++) {
        const wy = o.y + y;
        const inYZ = wy >= 0 && wy < sy && wz >= 0 && wz < sz;
        const base = sx * (wy + sy * wz);
        for (let x = 0; x < HI_SIZE; x++, i++) {
          const wx = o.x + x;
          if (!inYZ || wx < 0 || wx >= sx) {
            v[i] = 1; // outside the world: bedrock
            continue;
          }
          const id = blocks[base + wx];
          v[i] = SOLID[id] ? RARITY_CODE[id] + 1 : 0;
        }
      }
    }
    this.tex.needsUpdate = true;
    this.opts.terrain.uniforms.uHiOrigin.value.set(o.x, o.y, o.z, 1);
  }

  private updateProps(eye: THREE.Vector3, sel: HighlightTarget | null, selRarity: Rarity | null): void {
    const props = this.opts.props;
    const want = new Map<string, { rarity: Rarity; amb: number; sel: number }>();
    const breath = 0.84 + 0.16 * Math.sin((this.time * Math.PI * 2) / HIGHLIGHT_PULSE_S);
    if (this.enabled && this.opts.liveProps) {
      for (const spec of this.opts.liveProps()) {
        const d = Math.hypot(spec.x - eye.x, spec.y + 0.4 - eye.y, spec.z - eye.z);
        if (d > HIGHLIGHT_RANGE) continue;
        const r = rarityOf(spec);
        if (!r || (this.opts.usable && !this.opts.usable(spec))) continue;
        want.set(spec.id, { rarity: r, amb: fadeAt(d) * breath, sel: 0 });
      }
    }
    for (const t of this.explicit) {
      if (t.kind !== 'prop') continue;
      const r = this.rarityOf(t);
      if (r) want.set(t.id, { rarity: r, amb: breath, sel: 0 });
    }
    if (sel && sel.kind === 'prop' && selRarity) {
      want.set(sel.id, { rarity: selRarity, amb: 0, sel: this.selStrength });
    }
    for (const id of this.propFx.keys()) if (!want.has(id)) props.setRarityGlow(id, null, 0, 0);
    for (const [id, fx] of want) props.setRarityGlow(id, RARITY_LINEAR[fx.rarity], fx.amb, fx.sel, fx.rarity === 'legendary');
    this.propFx.clear();
    for (const [id, fx] of want) this.propFx.set(id, fx);
  }

  private updateObjects(eye: THREE.Vector3, sel: HighlightTarget | null): void {
    const live = new Set<string>();
    const breath = 0.84 + 0.16 * Math.sin((this.time * Math.PI * 2) / HIGHLIGHT_PULSE_S);
    const list = this.explicit.filter((t): t is Extract<HighlightTarget, { kind: 'object' }> => t.kind === 'object');
    if (this.opts.mobs) {
      for (const m of this.opts.mobs()) {
        if (!m.rarity || !m.object || m.tappable === false) continue;
        const p = m.position;
        if (Math.hypot(p.x - eye.x, p.y - eye.y, p.z - eye.z) > HIGHLIGHT_RANGE) continue;
        const id = `mob-${m.id}`;
        if (!list.some((t) => t.id === id)) list.push({ kind: 'object', id, object: m.object, rarity: m.rarity });
      }
    }
    // The selected creature may come under another id than its ambient entry (the game's
    // `mob:<id>` and MOBS' `mob-<id>`): the same object is one entry, matched by identity.
    const selObj = sel && sel.kind === 'object' ? sel : null;
    const isSel = (t: Extract<HighlightTarget, { kind: 'object' }>) => !!selObj && (selObj.id === t.id || selObj.object === t.object);
    if (selObj && !list.some(isSel)) list.push(selObj);
    for (const t of list) {
      live.add(t.id);
      let st = this.objects.get(t.id);
      if (!st || st.target.object !== t.object) {
        if (st) for (const m of st.mats) setHi(m, null, 0, 0);
        st = { target: t, mats: hiMaterials(t.object) };
        this.objects.set(t.id, st);
      }
      st.target = t;
      t.object.getWorldPosition(this.tmp);
      const amb = this.enabled ? fadeAt(this.tmp.distanceTo(eye)) * breath : 0;
      const s = isSel(t) ? this.selStrength : 0;
      for (const m of st.mats) {
        setHi(m, RARITY_LINEAR[t.rarity], s > 0 ? 0 : amb, s);
        if (m.uniforms.uHiShimmer) m.uniforms.uHiShimmer.value = t.rarity === 'legendary' ? 1 : 0;
      }
    }
    for (const [id, st] of this.objects) {
      if (live.has(id)) continue;
      for (const m of st.mats) setHi(m, null, 0, 0);
      this.objects.delete(id);
    }
  }

  /** The crisp silhouette outline of a selected prop or object (blocks are outlined by the terrain shader). */
  private updateHull(sel: HighlightTarget | null, rarity: Rarity | null): void {
    const meshes = sel && rarity ? this.meshesOf(sel) : null;
    const key = sel && meshes ? `${sel.kind}:${(sel as { id?: string }).id}` : '';
    if (!meshes || !rarity) {
      this.clearHull();
      return;
    }
    if (this.hull && this.hull.key !== key) this.clearHull();
    const mat = this.hullMaterial(rarity, this.blocked);
    mat.uniforms.uWidth.value = 1.6 * (globalThis.devicePixelRatio ? Math.min(2, globalThis.devicePixelRatio) : 1) * (0.5 + 0.5 * this.selStrength);
    if (!this.hull) {
      const hulls: THREE.Mesh[] = [];
      for (const m of meshes) {
        if (!m.geometry.getAttribute('position')) continue;
        const h = new THREE.Mesh(hullGeometry(m.geometry), mat);
        h.name = 'selection-outline';
        h.renderOrder = 40;
        h.frustumCulled = false;
        h.matrixAutoUpdate = false;
        h.userData.highlightHull = true;
        h.onBeforeRender = (r) => r.getDrawingBufferSize(mat.uniforms.uViewport.value as THREE.Vector2);
        m.add(h);
        h.updateMatrixWorld(true);
        hulls.push(h);
      }
      this.hull = { key, meshes: hulls };
    }
    for (const h of this.hull.meshes) h.material = mat;
  }

  private clearHull(): void {
    if (!this.hull) return;
    for (const h of this.hull.meshes) h.parent?.remove(h);
    this.hull = null;
  }

  private hullMaterial(r: Rarity, blocked: boolean): THREE.ShaderMaterial {
    const key = `${r}:${blocked ? 1 : 0}`;
    let m = this.hullMats.get(key);
    if (m) return m;
    const c = RARITY_LINEAR[r].clone();
    if (blocked) {
      const l = c.x * 0.2126 + c.y * 0.7152 + c.z * 0.0722;
      c.set(l, l, l).lerp(new THREE.Vector3(1, 0.32, 0.26), 0.55);
    }
    c.multiplyScalar(1.25);
    m = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      uniforms: {
        uColor: { value: c },
        uWidth: { value: 1.6 },
        uViewport: { value: new THREE.Vector2(1, 1) },
        uSceneEncode: SCENE_ENCODE,
      },
      vertexShader: hullVert,
      fragmentShader: hullFrag,
      side: THREE.BackSide,
      depthWrite: false,
    });
    this.hullMats.set(key, m);
    return m;
  }

  private meshesOf(t: HighlightTarget): THREE.Mesh[] | null {
    if (t.kind === 'block') return null;
    if (t.kind === 'prop') return this.opts.props.meshesOf(t.id);
    // An object whose materials draw the highlight (a skinned mob: its own hull follows its bones).
    if (this.objects.get(t.id)?.mats.length || hiMaterials(t.object).length) return null;
    const out: THREE.Mesh[] = [];
    t.object.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh && !m.userData.highlightHull && !(m as unknown as THREE.Points).isPoints) out.push(m);
    });
    return out.length ? out : null;
  }

  private updateRing(dt: number, eye: THREE.Vector3): void {
    const t = this.progressTarget;
    const target = this.progressValue > 0 && t ? t : null;
    // Ease the fill (the mining steps come in hits) and fade in and out.
    this.progressShown = target ? this.progressShown + (this.progressValue - this.progressShown) * Math.min(1, dt * 16) : 0;
    const mat = this.ring.material;
    const a = mat.uniforms.uAlpha.value as number;
    mat.uniforms.uAlpha.value = target ? Math.min(1, a + dt * 8) : Math.max(0, a - dt * 6);
    this.ring.visible = (mat.uniforms.uAlpha.value as number) > 0.01;
    if (!target) return;
    const c = mat.uniforms.uCenter.value as THREE.Vector3;
    if (!this.anchorOf(target, c)) {
      this.ring.visible = false;
      return;
    }
    // Lift it a little toward the eye so it sits on the surface, not in it.
    this.tmp.copy(eye).sub(c);
    const l = this.tmp.length();
    if (l > 1e-3) c.addScaledVector(this.tmp, Math.min(0.12, l * 0.1) / l);
    const r = this.rarityOf(target);
    (mat.uniforms.uColor.value as THREE.Vector3).copy(r ? RARITY_LINEAR[r] : RARITY_LINEAR.common);
    if (this.blocked && sameTarget(target, this.selected)) (mat.uniforms.uColor.value as THREE.Vector3).set(1, 0.36, 0.3);
    mat.uniforms.uProgress.value = this.progressShown;
  }

  /** Where a target's ring sits: the struck point, else the middle of its visible side. */
  private anchorOf(t: HighlightTarget, out: THREE.Vector3): boolean {
    if (t.point) {
      out.set(t.point.x, t.point.y, t.point.z);
      return true;
    }
    if (t.kind === 'block') {
      out.set(t.x + 0.5, t.y + 0.5, t.z + 0.5);
      return true;
    }
    if (t.kind === 'prop') {
      const b = this.opts.props.bounds(t.id);
      if (!b) return false;
      b.getCenter(out);
      return true;
    }
    this.tmpBox.setFromObject(t.object);
    if (this.tmpBox.isEmpty()) t.object.getWorldPosition(out);
    else this.tmpBox.getCenter(out);
    return true;
  }
}

function fadeAt(d: number): number {
  return 1 - smoothstep(HIGHLIGHT_RANGE - 4, HIGHLIGHT_RANGE, d);
}

function smoothstep(a: number, b: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/** Materials under an object that draw the highlight themselves (uHiColor + uHi uniforms). */
function hiMaterials(o: THREE.Object3D): THREE.ShaderMaterial[] {
  const out = new Set<THREE.ShaderMaterial>();
  o.traverse((c) => {
    const m = (c as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
    for (const mm of Array.isArray(m) ? m : m ? [m] : []) {
      const sm = mm as THREE.ShaderMaterial;
      if (sm.uniforms && 'uHiColor' in sm.uniforms && 'uHi' in sm.uniforms) out.add(sm);
    }
  });
  return [...out];
}

/** Drive a material's highlight uniforms (entityMaterial's uHiColor / uHi). */
export function setHi(m: THREE.ShaderMaterial, color: THREE.Vector3 | null, amb: number, sel: number): void {
  const u = m.uniforms;
  if (!u.uHiColor || !u.uHi) return;
  if (color) (u.uHiColor.value as THREE.Vector3 | THREE.Color).set?.(color.x, color.y, color.z);
  (u.uHi.value as THREE.Vector2).set(color ? amb : 0, color ? sel : 0);
}
