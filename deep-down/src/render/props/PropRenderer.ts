import * as THREE from 'three';
import type { PropSpec } from './types';
import type { LightingUniforms } from '../lighting';
import { createEntityMaterial } from '../entityMaterial';
import { hash32 } from '../../core/math';
import { PROP_VARIANTS, buildPropModel, propVariant, type PropModel, type PropModelOptions, type PartMotion } from './models';

export interface PropHit {
  id: string;
  distance: number;
  point: THREE.Vector3;
}

interface CachedModel {
  model: PropModel;
  refs: number;
}

interface AnimatedPart {
  mesh: THREE.Mesh;
  motion: PartMotion;
  phase: number;
  /** Rest position of the part pivot (embers and the monolith core move away from it). */
  rest: THREE.Vector3;
}

interface PropEntry {
  spec: PropSpec;
  key: string;
  model: PropModel;
  root: THREE.Group;
  body: THREE.Mesh;
  /** Per-prop material for glowing parts so each prop flickers or pulses on its own. */
  glowMat: THREE.ShaderMaterial | null;
  /** Per-prop body material, created the first time the prop is highlighted or flashed. */
  fxMat: THREE.ShaderMaterial | null;
  /** The body currently uses fxMat (an effect is visible). */
  fxActive: boolean;
  parts: AnimatedPart[];
  pivot: THREE.Group | null;
  phase: number;
  flash: number;
  /** World-space bounding sphere for culling and early ray rejection. */
  center: THREE.Vector3;
  radius: number;
  /** World -> prop-local transform, for ray tests against the local hit boxes. */
  inverse: THREE.Matrix4;
}

/** How long a hit flash takes to fade, in seconds. */
const FLASH_TIME = 0.18;
const FLASH_PEAK = 0.85;
/** Highlight on the hovered interactable: a slight brightening plus a faint warm lift. */
const HIGHLIGHT_TINT = 1.28;
const HIGHLIGHT_LIFT = 0.035;
/** Props farther than this (beyond their radius) skip animation work entirely. */
const ANIMATE_DISTANCE = 48;

const _o = new THREE.Vector3();
const _d = new THREE.Vector3();
const _p = new THREE.Vector3();

/**
 * Renders world props (camp furniture, lanterns, crystals, relics, the abyss monolith) and
 * animates their glow. Props of the same kind and variant share geometry (reference counted);
 * static parts of every prop share one material. A prop gets its own glow material when it has
 * glowing parts; the first time it is highlighted or flashed it also gets a body material of its
 * own, which it uses only while that effect shows.
 *
 * The group is expected to stay at the scene origin: props are positioned in world units.
 */
export class PropRenderer {
  readonly group = new THREE.Group();
  /** Props beyond this distance from the camera (minus their radius) are hidden. */
  viewDistance = 96;
  private readonly lighting: LightingUniforms;
  private readonly solid: THREE.ShaderMaterial;
  private readonly cache = new Map<string, CachedModel>();
  private readonly entries = new Map<string, PropEntry>();
  /** Same entries as `entries`, as an array so per-frame loops allocate nothing. */
  private readonly list: PropEntry[] = [];
  private highlighted: PropEntry | null = null;
  /** The id last passed to setHighlight: a prop re-added under it (after settling) stays lit. */
  private highlightId: string | null = null;

  constructor(lighting: LightingUniforms) {
    this.lighting = lighting;
    this.solid = createEntityMaterial(lighting);
    this.group.name = 'props';
    this.group.matrixAutoUpdate = false;
  }

  add(spec: PropSpec): void {
    if (this.entries.has(spec.id)) this.remove(spec.id);
    const opts = modelOptions(spec);
    const key = `${spec.kind}:${opts.variant}:${opts.hangHeight ?? 0}`;
    let cached = this.cache.get(key);
    if (!cached) {
      cached = { model: buildPropModel(spec.kind, opts), refs: 0 };
      this.cache.set(key, cached);
    }
    cached.refs++;
    const model = cached.model;

    const root = new THREE.Group();
    root.name = spec.id;
    root.position.set(spec.x, spec.y, spec.z);
    root.rotation.y = spec.rotY;
    root.scale.setScalar(spec.scale);
    root.matrixAutoUpdate = false;
    root.updateMatrix();

    // Hanging props swing about their attachment point: everything hangs from a pivot group.
    let holder: THREE.Object3D = root;
    let pivot: THREE.Group | null = null;
    if (model.sway) {
      pivot = new THREE.Group();
      pivot.position.copy(model.sway);
      root.add(pivot);
      holder = new THREE.Group();
      holder.position.copy(model.sway).negate();
      holder.matrixAutoUpdate = false;
      holder.updateMatrix();
      pivot.add(holder);
    }

    const body = staticMesh(model.body, this.solid);
    holder.add(body);
    const glowMat = model.glow || model.parts.length ? createEntityMaterial(this.lighting, { emissiveScale: model.glowScale }) : null;
    if (model.glow && glowMat) holder.add(staticMesh(model.glow, glowMat));
    const parts: AnimatedPart[] = [];
    for (const p of model.parts) {
      const mesh = new THREE.Mesh(p.geometry, glowMat!);
      mesh.position.copy(p.origin);
      holder.add(mesh);
      parts.push({ mesh, motion: p.motion, phase: p.phase, rest: p.origin.clone() });
    }
    this.group.add(root);
    root.updateMatrixWorld(true);

    const sphere = model.bounds.getBoundingSphere(new THREE.Sphere());
    const entry: PropEntry = {
      spec,
      key,
      model,
      root,
      body,
      glowMat,
      fxMat: null,
      fxActive: false,
      parts,
      pivot,
      phase: (hash32(spec.seed ^ 0x51f0) / 4294967296) * Math.PI * 2,
      flash: 0,
      center: sphere.center.applyMatrix4(root.matrix),
      radius: sphere.radius * spec.scale,
      inverse: root.matrix.clone().invert(),
    };
    this.entries.set(spec.id, entry);
    this.list.push(entry);
    if (spec.id === this.highlightId) {
      this.highlighted = entry;
      this.applyFx(entry, 1);
    }
  }

  remove(id: string): void {
    const e = this.entries.get(id);
    if (!e) return;
    if (this.highlighted === e) this.highlighted = null;
    this.group.remove(e.root);
    e.glowMat?.dispose();
    e.fxMat?.dispose();
    this.entries.delete(id);
    this.list.splice(this.list.indexOf(e), 1);
    const cached = this.cache.get(e.key);
    if (cached && --cached.refs <= 0) {
      disposeModel(cached.model);
      this.cache.delete(e.key);
    }
  }

  has(id: string): boolean {
    return this.entries.has(id);
  }

  /**
   * Draw a prop `dy` metres off its spec position (a station rising out of the floor: dy < 0 sinks
   * it). Picking and culling follow. 0 puts it back.
   */
  setLift(id: string, dy: number): void {
    const e = this.entries.get(id);
    if (!e) return;
    const y = e.spec.y + dy;
    if (e.root.position.y === y) return;
    const before = e.root.position.y;
    e.root.position.y = y;
    e.root.updateMatrix();
    e.root.updateMatrixWorld(true);
    e.center.y += y - before;
    e.inverse.copy(e.root.matrix).invert();
  }

  /** Number of distinct geometry sets currently alive (shared between props of a kind/variant). */
  get modelCount(): number {
    return this.cache.size;
  }

  update(dt: number, time: number, cameraPos: THREE.Vector3): void {
    const highlightPulse = 0.75 + 0.25 * Math.sin(time * 4.2);
    for (const e of this.list) {
      const dist = cameraPos.distanceTo(e.center) - e.radius;
      e.root.visible = dist < this.viewDistance;
      if (e.flash > 0) e.flash = Math.max(0, e.flash - dt / FLASH_TIME);
      const lit = this.highlighted === e;
      if (lit || e.flash > 0 || e.fxActive) this.applyFx(e, lit ? highlightPulse : 0);
      if (!e.root.visible || (dist > ANIMATE_DISTANCE && e.model.anim !== 'monolith')) continue;
      animate(e, time, dt);
    }
  }

  /** Nearest prop hit by a ray (dir normalized) within maxDist, using per-prop oriented boxes. */
  raycast(origin: THREE.Vector3, dir: THREE.Vector3, maxDist: number): PropHit | null {
    let best: PropEntry | null = null;
    let bestT = maxDist;
    for (const e of this.list) {
      // Reject by bounding sphere first: most props are nowhere near the ray.
      _p.copy(e.center).sub(origin);
      const along = _p.dot(dir);
      if (along < -e.radius || along - e.radius > bestT) continue;
      if (_p.lengthSq() - along * along > e.radius * e.radius) continue;
      // Into prop-local space; the affine map keeps the ray parameter in world units.
      _o.copy(origin).applyMatrix4(e.inverse);
      _d.copy(origin).add(dir).applyMatrix4(e.inverse).sub(_o);
      for (const box of e.model.hitBoxes) {
        const t = rayBox(_o, _d, box, bestT);
        if (t !== null && t < bestT) {
          bestT = t;
          best = e;
        }
      }
    }
    if (!best) return null;
    return { id: best.spec.id, distance: bestT, point: origin.clone().addScaledVector(dir, bestT) };
  }

  bounds(id: string): THREE.Box3 | null {
    const e = this.entries.get(id);
    return e ? e.model.bounds.clone().applyMatrix4(e.root.matrix) : null;
  }

  setHighlight(id: string | null): void {
    this.highlightId = id;
    const e = id ? (this.entries.get(id) ?? null) : null;
    if (this.highlighted === e) return;
    const prev = this.highlighted;
    this.highlighted = e;
    if (prev) this.applyFx(prev, 0);
    if (e) this.applyFx(e, 1);
  }

  flash(id: string): void {
    const e = this.entries.get(id);
    if (!e) return;
    e.flash = 1;
    this.applyFx(e, this.highlighted === e ? 1 : 0);
  }

  dispose(): void {
    for (const e of [...this.list]) this.remove(e.spec.id);
    this.solid.dispose();
  }

  /**
   * Push highlight/flash state into the prop's materials. The body switches to its own material
   * only while an effect is visible and returns to the shared one afterwards.
   */
  private applyFx(e: PropEntry, highlight: number): void {
    const flash = FLASH_PEAK * e.flash * e.flash;
    const active = highlight > 0 || flash > 0;
    if (active && !e.fxMat) e.fxMat = createEntityMaterial(this.lighting);
    const tint = active ? HIGHLIGHT_TINT : 1;
    const lift = highlight * HIGHLIGHT_LIFT + flash;
    if (e.fxMat) setFx(e.fxMat, tint, lift);
    if (e.glowMat) setFx(e.glowMat, tint, lift);
    e.body.material = active && e.fxMat ? e.fxMat : this.solid;
    e.fxActive = active;
  }
}

function setFx(mat: THREE.ShaderMaterial, tint: number, lift: number): void {
  (mat.uniforms.uTint.value as THREE.Color).setScalar(tint);
  mat.uniforms.uFlash.value = lift;
}

function modelOptions(spec: PropSpec): PropModelOptions {
  // A chosen variant wins; the black stone sleeps (variant 0) unless the finale wakes it.
  const variant = spec.modelVariant !== undefined ? Math.max(0, Math.floor(spec.modelVariant)) % PROP_VARIANTS[spec.kind] : spec.kind === 'abyssMonolith' ? 0 : propVariant(spec.kind, spec.seed);
  if (spec.kind !== 'hangingLantern') return { variant };
  // Hang from the ceiling block this lantern is anchored to; quantized so lanterns share meshes.
  const above = spec.anchor && spec.anchor[1] > spec.y + 0.5 ? (spec.anchor[1] - spec.y) / spec.scale : 1.6;
  return { variant, hangHeight: Math.round(above * 16) / 16 };
}

function staticMesh(geometry: THREE.BufferGeometry, material: THREE.Material): THREE.Mesh {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.matrixAutoUpdate = false;
  return mesh;
}

function disposeModel(model: PropModel): void {
  model.body.dispose();
  model.glow?.dispose();
  for (const p of model.parts) p.geometry.dispose();
}

/** Smooth pseudo-random flicker in [-1, 1] from three incommensurate sines. */
function flicker(t: number, phase: number): number {
  return Math.sin(t * 13.1 + phase) * 0.45 + Math.sin(t * 7.3 + phase * 1.7) * 0.35 + Math.sin(t * 23.7 + phase * 2.3) * 0.2;
}

function animate(e: PropEntry, time: number, dt: number): void {
  const m = e.model;
  const glow = e.glowMat;
  const t = time + e.phase;
  switch (m.anim) {
    case 'fire':
      if (glow) glow.uniforms.uEmissiveScale.value = m.glowScale * (0.86 + 0.14 * flicker(t, 0));
      break;
    case 'lantern':
      if (glow) glow.uniforms.uEmissiveScale.value = m.glowScale * (0.93 + 0.07 * flicker(t * 0.8, 1.3));
      if (e.pivot) {
        // A slow pendulum with a second, slower axis so the sway never looks mechanical.
        e.pivot.rotation.x = Math.sin(t * 1.9) * 0.045 + Math.sin(t * 0.7) * 0.02;
        e.pivot.rotation.z = Math.sin(t * 1.4 + 1.1) * 0.035;
      }
      break;
    case 'crystal':
      if (glow) glow.uniforms.uEmissiveScale.value = m.glowScale * (0.82 + 0.18 * (0.5 + 0.5 * Math.sin(t * 1.3)));
      break;
    case 'glyph':
      if (glow) glow.uniforms.uEmissiveScale.value = m.glowScale * (0.78 + 0.22 * (0.5 + 0.5 * Math.sin(t * 0.9)));
      break;
    case 'monolith':
      // Slow breathing, about one breath every seven seconds.
      if (glow) glow.uniforms.uEmissiveScale.value = m.glowScale * (0.72 + 0.28 * (0.5 + 0.5 * Math.sin(time * 0.9)));
      break;
    case 'none':
      break;
  }
  for (const p of e.parts) animatePart(p, t, dt);
}

function animatePart(p: AnimatedPart, t: number, dt: number): void {
  const mesh = p.mesh;
  switch (p.motion) {
    case 'flame': {
      // Tongues stretch and narrow together (roughly volume-preserving) and twist a little.
      const f = flicker(t * 1.15, p.phase);
      const s = 1 + 0.16 * f;
      const w = 1 - 0.07 * f;
      mesh.scale.set(w, s, w);
      mesh.rotation.y = Math.sin(t * 2.3 + p.phase) * 0.25;
      break;
    }
    case 'ember': {
      // Embers rise, drift and shrink away, then start again at the flame tips.
      const cycle = (t * 0.6 + p.phase) % 1;
      mesh.position.set(p.rest.x, p.rest.y + cycle * 0.4, p.rest.z);
      mesh.scale.setScalar(Math.max(0.001, 1 - cycle));
      mesh.rotation.y += dt * 1.3;
      break;
    }
    case 'float':
      mesh.position.set(p.rest.x, p.rest.y + Math.sin(t * 0.8) * 0.15, p.rest.z);
      mesh.rotation.y = t * 0.3;
      break;
  }
}

/** Slab test. Returns the entry distance along the ray (0 if it starts inside), or null. */
function rayBox(o: THREE.Vector3, d: THREE.Vector3, box: THREE.Box3, maxT: number): number | null {
  let t0 = 0;
  let t1 = maxT;
  for (let axis = 0; axis < 3; axis++) {
    const oc = axis === 0 ? o.x : axis === 1 ? o.y : o.z;
    const dc = axis === 0 ? d.x : axis === 1 ? d.y : d.z;
    const lo = axis === 0 ? box.min.x : axis === 1 ? box.min.y : box.min.z;
    const hi = axis === 0 ? box.max.x : axis === 1 ? box.max.y : box.max.z;
    if (Math.abs(dc) < 1e-12) {
      if (oc < lo || oc > hi) return null;
      continue;
    }
    let ta = (lo - oc) / dc;
    let tb = (hi - oc) / dc;
    if (ta > tb) {
      const s = ta;
      ta = tb;
      tb = s;
    }
    if (ta > t0) t0 = ta;
    if (tb < t1) t1 = tb;
    if (t0 > t1) return null;
  }
  return t0;
}
