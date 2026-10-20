import * as THREE from 'three';
import type { EventPath } from '../../idle/bus';
import { createEntityMaterial } from '../../render/entityMaterial';
import type { LightingUniforms } from '../../render/lighting';
import { RigidBatch } from '../../render/fx/rigidBatch';
import { chestModel, targetModel, type ModelParts } from '../../render/props/descentModels';

/**
 * Event entities in 3D (BUILD W2 MUST 5): the targets the Director deals (SPEC §7.2) drawn in the world and
 * moving along the model's path (`event:target`: a quadratic Bézier in shaft coordinates relative to the floor
 * at spawn, t0..t1 in model seconds), chests popped out of chest cells, the find guarantee's micro-surfacings and
 * the Lucky Moth. Each is tappable by its id (entity first, SPEC §3.1; C's DOM orb, if any, sits on the same
 * point: both evaluate the same path). They sit just in front of the cut (z 60.25) so their screen position
 * matches the shaft's columns; runes hang on the back wall. All of them draw as one mesh (RigidBatch).
 *
 * Kinds: 'moth' (the Lucky Moth), 'swarm' (Moth Swarm), 'crystal' (Glimmerfall), 'boulder' (Cave-in), 'mole',
 * 'crate' (Supply Rope), 'mimic', 'rune' (Ancient Echo), 'bubble', 'star', 'meteor', 'spore', 'gem', 'critter',
 * 'pebble', 'chest', and any other kind as a glowing target orb.
 */
export interface EventTargetSpec {
  id: string;
  kind: string;
  /** Model seconds of the path's ends. */
  t0: number;
  t1: number;
  path: EventPath;
  /** The floor depth at spawn (the path's y origin). */
  floor: number;
  taps: number;
}

export interface EntityView {
  id: string;
  kind: string;
  x: number;
  y: number;
  z: number;
  radius: number;
  taps: number;
}

interface Entity {
  spec: EventTargetSpec;
  root: THREE.Group;
  part: THREE.Group | null;
  model: ModelParts;
  view: EntityView;
  /** Hit shake 0..1, the open lid 0..1, removal (s left, caught or not). */
  shake: number;
  lid: number;
  leaving: number;
  caught: boolean;
  born: number;
  /** A chest's rest point (world) and its landing time. */
  rest?: THREE.Vector3;
}

const SHAFT_X0 = 28;
const ENTITY_Z = 60.25;
const BACK_Z = 57.05;

export class EventEntities {
  readonly group = new THREE.Group();
  private readonly material: THREE.ShaderMaterial;
  private readonly list = new Map<string, Entity>();
  private readonly models = new Map<string, ModelParts>();
  private readonly live: EntityView[] = [];
  private batch: RigidBatch;
  private dirty = false;
  /** Biome now and its accent (crystals take the biome's colour). */
  biome = 0;
  accent = 0x6fe8ff;
  private time = 0;

  constructor(lighting: LightingUniforms) {
    this.group.name = 'eventEntities';
    this.material = createEntityMaterial(lighting, { emissiveScale: 2.6 });
    // A hidden template so the batch (and its program) exists from the start.
    const seed = new THREE.Mesh(chestModel('wood').body, this.material);
    seed.visible = false;
    this.group.add(seed);
    this.batch = new RigidBatch(this.group, this.material);
  }

  private model(kind: string, tier = ''): ModelParts {
    const key = kind === 'chest' ? `chest:${tier}` : `${kind}:${kind === 'crystal' ? this.accent : ''}:${kind === 'rune' ? this.biome % 8 : ''}`;
    let m = this.models.get(key);
    if (!m) {
      m = kind === 'chest' ? chestModel(tier) : targetModel(kind, this.biome, this.accent);
      this.models.set(key, m);
    }
    return m;
  }

  private add(spec: EventTargetSpec, model: ModelParts): Entity {
    this.remove(spec.id, false, true);
    const root = new THREE.Group();
    root.name = spec.id;
    root.add(new THREE.Mesh(model.body, this.material));
    let part: THREE.Group | null = null;
    if (model.part) {
      part = new THREE.Group();
      const [px, py, pz] = model.pivot ?? [0, 0, 0];
      part.position.set(px, py, pz);
      const pm = new THREE.Mesh(model.part, this.material);
      pm.position.set(-px, -py, -pz);
      part.add(pm);
      root.add(part);
    }
    this.group.add(root);
    const e: Entity = { spec, root, part, model, view: { id: spec.id, kind: spec.kind, x: 0, y: 0, z: ENTITY_Z, radius: model.radius, taps: spec.taps }, shake: 0, lid: 0, leaving: -1, caught: false, born: this.time };
    this.list.set(spec.id, e);
    this.dirty = true;
    return e;
  }

  spawn(spec: EventTargetSpec): void {
    this.add(spec, this.model(spec.kind));
  }

  /** A chest popped out of its cell (`chest:<n>`), resting on the floor ledge at (col, depth). */
  chest(id: string, col: number, depth: number, tier: string): void {
    const e = this.add({ id, kind: 'chest', t0: 0, t1: 0, floor: depth, taps: 1, path: { x0: col, y0: 0, cx: col, cy: 0, x1: col, y1: 0 } }, this.model('chest', tier));
    // It pops toward the camera and lands on the ledge of the row below the broken cell (SPEC §10.8).
    e.rest = new THREE.Vector3(SHAFT_X0 + col + 0.5, -depth - 1, 59.2);
  }

  /** A hit on an entity (`left` taps still needed). */
  hit(id: string, left: number): void {
    const e = this.list.get(id);
    if (!e) return;
    e.shake = 1;
    e.view.taps = Math.max(0, left);
  }

  /** A chest opened: its lid swings up before it fades. */
  open(id: string): void {
    const e = this.list.get(id);
    if (!e) return;
    e.lid = 0.001;
    e.leaving = 1.4;
    e.caught = true;
  }

  /** Remove an entity: `caught` bursts it (the scene's sparks), otherwise it leaves (flies off, hides, shatters). */
  remove(id: string, caught: boolean, now = false): void {
    const e = this.list.get(id);
    if (!e) return;
    if (now) {
      this.group.remove(e.root);
      this.list.delete(id);
      this.dirty = true;
      return;
    }
    if (e.leaving < 0) {
      e.leaving = caught ? 0.12 : 0.45;
      e.caught = caught;
    }
  }

  has(id: string): boolean {
    const e = this.list.get(id);
    return !!e && e.leaving < 0;
  }

  /** World position of an entity now (null when gone). */
  where(id: string): EntityView | null {
    return this.list.get(id)?.view ?? null;
  }

  views(): readonly EntityView[] {
    return this.live;
  }

  /** `time` is the model clock (paths are in model seconds). */
  update(dt: number, time: number): void {
    this.time += dt;
    this.live.length = 0;
    const gone: string[] = [];
    for (const e of this.list.values()) {
      const s = e.spec;
      const r = e.root;
      const age = this.time - e.born;
      let x: number;
      let y: number;
      let z = ENTITY_Z;
      if (e.rest) {
        // Chests: a pop toward the camera, a landing squash and two small bounces, then the seam breathes.
        const t = Math.min(1, age / 0.45);
        x = e.rest.x;
        const hop = age < 0.45 ? Math.sin(t * Math.PI) * 0.9 : age < 0.7 ? Math.sin(((age - 0.45) / 0.25) * Math.PI) * 0.25 : age < 0.85 ? Math.sin(((age - 0.7) / 0.15) * Math.PI) * 0.08 : 0;
        y = e.rest.y + 0.5 * (1 - t) + hop;
        z = e.rest.z;
        const squash = age > 0.45 && age < 0.6 ? 0.82 + (age - 0.45) / 0.15 * 0.18 : 1;
        r.scale.set(1 / Math.sqrt(squash), squash, 1 / Math.sqrt(squash));
        if (e.part) e.part.rotation.x = -2.0 * Math.min(1, e.lid);
        if (e.lid > 0) e.lid = Math.min(1, e.lid + dt / 0.18);
      } else {
        const span = Math.max(1e-3, s.t1 - s.t0);
        const u = (time - s.t0) / span;
        const p = pathPoint(s.path, s.floor, u);
        x = p.x;
        y = p.y;
        if (s.kind === 'rune') z = BACK_Z;
        const k = s.kind;
        if (k === 'moth' || k === 'swarm') {
          if (e.part) e.part.scale.x = 0.35 + 0.65 * Math.abs(Math.sin(this.time * 18 + age));
          r.rotation.z = Math.sin(this.time * 3 + age) * 0.2;
        } else if (k === 'crystal' || k === 'boulder' || k === 'meteor') r.rotation.set(this.time * 2.2, this.time * 3.1, 0);
        else if (k === 'mole') r.scale.y = 0.6 + 0.4 * Math.abs(Math.sin(this.time * 4));
        else if (k === 'mimic') {
          y += Math.abs(Math.sin(this.time * 6)) * 0.3;
          if (e.part) e.part.rotation.x = -0.4 - 0.4 * Math.abs(Math.sin(this.time * 12));
        } else if (e.part) e.part.rotation.z = this.time * 1.5;
        if (k !== 'mole') r.scale.setScalar(Math.min(1, age / 0.18));
      }
      if (e.shake > 0) {
        x += Math.sin(this.time * 70) * 0.06 * e.shake;
        e.shake = Math.max(0, e.shake - dt * 6);
      }
      if (e.leaving >= 0) {
        e.leaving -= dt;
        const k = Math.max(0, e.leaving) / (e.rest && e.caught ? 1.4 : e.caught ? 0.12 : 0.45);
        if (!e.rest) {
          if (e.caught) r.scale.setScalar(1 + (1 - k) * 0.6);
          else {
            r.scale.setScalar(k);
            y += (1 - k) * 1.2;
          }
        } else if (e.leaving < 0.4) r.scale.setScalar(Math.max(0.01, e.leaving / 0.4));
        if (e.leaving <= 0) gone.push(s.id);
      }
      r.position.set(x, y, z);
      e.view.x = x;
      e.view.y = y + e.model.height * 0.4;
      e.view.z = z;
      if (e.leaving < 0) this.live.push(e.view);
    }
    for (const id of gone) this.remove(id, false, true);
    if (this.dirty) {
      this.dirty = false;
      this.batch.rebuild();
    } else this.batch.update();
  }
}

/** The world point of an event path (bus.ts EventPath; x in columns from the left cell's centre, y rows below the floor). */
export function pathPoint(path: EventPath, floor: number, u: number): { x: number; y: number } {
  const t = Math.min(1, Math.max(0, u));
  const a = (1 - t) * (1 - t);
  const b = 2 * (1 - t) * t;
  const c = t * t;
  return { x: SHAFT_X0 + 0.5 + a * path.x0 + b * path.cx + c * path.x1, y: -floor - (a * path.y0 + b * path.cy + c * path.y1) };
}
