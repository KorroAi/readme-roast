import * as THREE from 'three';
import { createEntityMaterial } from '../entityMaterial';
import type { LightingUniforms } from '../lighting';
import { RigidBatch } from '../fx/rigidBatch';
import { CREATURE_LOOKS, creatureModel, type CreatureLook, type ModelParts } from '../props/descentModels';

/**
 * Creatures (SPEC §6.9, BUILD W2 MUST 5): 4 rigs (crawler, flyer, swimmer, floater) × a part grammar give the 42
 * kinds of SPEC §6.5 (3 per biome; props/descentModels.ts CREATURE_LOOKS); one mesh for all of them (RigidBatch),
 * animated from a per-creature phase (legs, wings, fins, skirts), tappable (bounds for picking). They wander near
 * their anchor (a cavern floor or alcove the slab generator chose), never inside the dig rectangle; only those
 * inside the reach band (±4 m of the floor, CRITIQUE MUST 8) are offered as tappables. Tapped: it flinches and
 * scurries faster; after its third tap the model emits `entity:done` and the scene pops it. Ids:
 * `creature:<kind>:<n>` (n stable per run seed and slab). At most 12 in the band at once (SPEC §6.9).
 */
export type CreatureRig = CreatureLook['rig'];

export interface CreatureSpec {
  /** `creature:<kind>:<n>`. */
  id: string;
  /** Creature id from src/idle/config/biomes.ts (e.g. 'rootGrub'). */
  kind: string;
  biome: number;
  /** Anchor (world): where it lives; it wanders within `range` m in x. */
  x: number;
  y: number;
  z: number;
  range: number;
}

export interface CreatureView {
  id: string;
  kind: string;
  x: number;
  y: number;
  z: number;
  /** Radius of its tap bound (m). */
  radius: number;
}

interface Live {
  spec: CreatureSpec;
  look: CreatureLook;
  model: ModelParts;
  root: THREE.Group;
  part: THREE.Group | null;
  phase: number;
  dir: number;
  speed: number;
  x: number;
  flee: number;
  leaving: number;
  view: CreatureView;
}

/** Solo creatures offered at once (Balanced). */
export const CREATURES_IN_BAND = 12;
const REACH = 4;

export class Creatures {
  readonly group = new THREE.Group();
  private readonly material: THREE.ShaderMaterial;
  private readonly list = new Map<string, Live>();
  private readonly models = new Map<string, ModelParts>();
  private readonly live: CreatureView[] = [];
  private readonly batch: RigidBatch;
  private dirty = false;
  private time = 0;
  /** The floor (rows): the reach band follows it. */
  floor = 0;

  constructor(lighting: LightingUniforms) {
    this.group.name = 'creatures';
    this.material = createEntityMaterial(lighting, { emissiveScale: 2.4 });
    const seed = new THREE.Mesh(creatureModel(CREATURE_LOOKS.rootGrub).body, this.material);
    seed.visible = false;
    this.group.add(seed);
    this.batch = new RigidBatch(this.group, this.material);
  }

  add(spec: CreatureSpec): void {
    if (this.list.has(spec.id)) return;
    const look = CREATURE_LOOKS[spec.kind] ?? CREATURE_LOOKS.rootGrub;
    let model = this.models.get(spec.kind);
    if (!model) {
      model = creatureModel(look);
      this.models.set(spec.kind, model);
    }
    const root = new THREE.Group();
    root.name = spec.id;
    root.add(new THREE.Mesh(model.body, this.material));
    let part: THREE.Group | null = null;
    if (model.part) {
      part = new THREE.Group();
      const [px, py, pz] = model.pivot ?? [0, 0, 0];
      part.position.set(px, py, pz);
      const m = new THREE.Mesh(model.part, this.material);
      m.position.set(-px, -py, -pz);
      part.add(m);
      root.add(part);
    }
    this.group.add(root);
    const h = hash(spec.id);
    this.list.set(spec.id, { spec, look, model, root, part, phase: h * 6.28, dir: h < 0.5 ? -1 : 1, speed: 0.25 + 0.3 * h, x: spec.x, flee: 0, leaving: -1, view: { id: spec.id, kind: spec.kind, x: spec.x, y: spec.y, z: spec.z, radius: model.radius } });
    this.dirty = true;
  }

  remove(id: string, caught: boolean): void {
    const c = this.list.get(id);
    if (!c) return;
    if (!caught) {
      this.group.remove(c.root);
      this.list.delete(id);
      this.dirty = true;
      return;
    }
    if (c.leaving < 0) c.leaving = 0.18;
  }

  /** Drop every creature whose id is in `ids` (their slab left the window). */
  removeMany(ids: readonly string[]): void {
    for (const id of ids) this.remove(id, false);
  }

  /** A tap landed on creature `id`: it flinches and scurries. */
  hit(id: string): void {
    const c = this.list.get(id);
    if (!c) return;
    c.flee = 1;
    c.dir = -c.dir;
  }

  /** Creatures in the reach band (world positions this frame), at most CREATURES_IN_BAND. */
  views(): readonly CreatureView[] {
    return this.live;
  }

  /** Every creature alive (debug). */
  get count(): number {
    return this.list.size;
  }

  update(dt: number, time: number): void {
    void time;
    this.time += dt;
    this.live.length = 0;
    const gone: string[] = [];
    const t = this.time;
    for (const c of this.list.values()) {
      const s = c.spec;
      const near = Math.abs(-s.y - this.floor) < 14;
      c.root.visible = near;
      if (!near) continue;
      const sp = c.speed * (1 + 3 * c.flee);
      c.flee = Math.max(0, c.flee - dt * 0.5);
      c.x += c.dir * sp * dt;
      if (c.x > s.x + s.range) c.dir = -1;
      if (c.x < s.x - s.range) c.dir = 1;
      let y = s.y;
      const ph = t * (2 + 4 * c.flee) + c.phase;
      if (c.look.rig === 'flyer') y += 1.0 + Math.sin(ph * 0.7) * 0.35;
      else if (c.look.rig === 'floater') y += 0.8 + Math.sin(ph * 0.5) * 0.25;
      else if (c.look.rig === 'swimmer') y += 0.6 + Math.sin(ph * 0.4) * 0.2;
      const r = c.root;
      r.position.set(c.x, y, s.z);
      r.rotation.y = c.dir > 0 ? Math.PI / 2 - 0.5 : -Math.PI / 2 + 0.5;
      if (c.part) {
        if (c.look.rig === 'flyer') c.part.scale.x = 0.3 + 0.7 * Math.abs(Math.sin(ph * 6));
        else if (c.look.rig === 'crawler') c.part.rotation.x = Math.sin(ph * 5) * 0.4;
        else if (c.look.rig === 'swimmer') c.part.rotation.y = Math.sin(ph * 3) * 0.5;
        else c.part.rotation.y = ph * 0.6;
      }
      if (c.leaving >= 0) {
        c.leaving -= dt;
        r.scale.setScalar(1 + (0.18 - Math.max(0, c.leaving)) * 4);
        if (c.leaving <= 0) gone.push(s.id);
        continue;
      }
      r.scale.setScalar(1);
      c.view.x = c.x;
      c.view.y = y + c.model.height * 0.5;
      c.view.z = s.z;
      if (Math.abs(-c.view.y - this.floor) <= REACH && this.live.length < CREATURES_IN_BAND) this.live.push(c.view);
    }
    for (const id of gone) this.remove(id, false);
    if (this.dirty) {
      this.dirty = false;
      this.batch.rebuild();
    } else this.batch.update();
  }
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return ((h >>> 0) % 10000) / 10000;
}
