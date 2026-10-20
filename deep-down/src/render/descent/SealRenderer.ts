import * as THREE from 'three';
import { createEntityMaterial } from '../entityMaterial';
import type { LightingUniforms } from '../lighting';
import { RigidBatch } from '../fx/rigidBatch';
import { orbModel, wardenModel, type WardenModel } from '../props/descentModels';

/**
 * The seal at a biome boundary (SPEC §7.1, BUILD W2 MUST 3): the carved slab across the 7 cells is the seal row's
 * own voxels (SEAL_STONE); this draws the biome's Warden bound to it (≤ 5 m tall, anchored on the shaft's back wall
 * above the slab, CRITIQUE B11: behind the foreman, never over the dig row's front), its chains, and its three weak
 * points (tappable ids `weak:<sealId>:<i>`, sealId = the biome the seal opens). Phases: 'closed' (in view below,
 * breathing), 'fighting' (the timer runs: it strains and its emblem pulses), 'held' (the timer ran out: it slumps,
 * dim), 'broken' (gone: the scene shatters the slab and floods the light), 'none'. One mesh (RigidBatch).
 */
export type SealPhase = 'closed' | 'fighting' | 'held' | 'broken' | 'none';

export interface WeakPointView {
  id: string;
  point: number;
  /** World position of the point's centre. */
  x: number;
  y: number;
  z: number;
  lit: boolean;
}

const WALL_Z = 57.05;
const CENTRE_X = 31.5;

export class SealRenderer {
  readonly group = new THREE.Group();
  /** The biome the seal opens (−1: none shown). */
  biome = -1;
  /** Depth row of the seal slab. */
  depth = 0;
  phase: SealPhase = 'none';
  /** HP left 0..1. */
  left = 1;
  private readonly material: THREE.ShaderMaterial;
  private readonly root = new THREE.Group();
  private model: WardenModel | null = null;
  private part: THREE.Group | null = null;
  private readonly weakMeshes: THREE.Mesh[] = [];
  private readonly lit = [false, false, false];
  private readonly views: WeakPointView[] = [];
  private readonly batch: RigidBatch;
  private shown = -2;
  private flinch = 0;
  private time = 0;

  constructor(lighting: LightingUniforms) {
    this.group.name = 'seal';
    this.material = createEntityMaterial(lighting, { emissiveScale: 2.6 });
    this.group.add(this.root);
    const orb = orbModel(0xffd060, 0.2);
    for (let i = 0; i < 3; i++) {
      const m = new THREE.Mesh(orb.body, this.material);
      m.visible = false;
      this.weakMeshes.push(m);
      this.root.add(m);
    }
    this.batch = new RigidBatch(this.group, this.material);
    this.group.visible = false;
    for (let i = 0; i < 3; i++) this.views.push({ id: '', point: i, x: 0, y: 0, z: 0, lit: false });
  }

  /** Show the seal of biome `biome` (the one it opens) at depth row `depth` in `phase`. */
  set(biome: number, depth: number, phase: SealPhase, left = 1): void {
    if (phase === 'none' || biome < 1) {
      this.phase = 'none';
      this.group.visible = false;
      return;
    }
    if (phase === 'broken' && this.phase === 'none') return;
    this.depth = depth;
    this.left = left;
    if (biome !== this.shown) this.build(biome);
    this.biome = biome;
    if (phase === 'broken' && this.phase !== 'broken') this.lit.fill(false);
    this.phase = phase;
    this.group.visible = phase !== 'broken';
  }

  private build(biome: number): void {
    this.shown = biome;
    for (const c of [...this.root.children]) if (!this.weakMeshes.includes(c as THREE.Mesh)) this.root.remove(c);
    const m = wardenModel(biome);
    this.model = m;
    this.root.add(new THREE.Mesh(m.body, this.material));
    this.part = null;
    if (m.part) {
      this.part = new THREE.Group();
      const [px, py, pz] = m.pivot ?? [0, 0, 0];
      this.part.position.set(px, py, pz);
      const pm = new THREE.Mesh(m.part, this.material);
      pm.position.set(-px, -py, -pz);
      this.part.add(pm);
      this.root.add(this.part);
    }
    const weakOrb = orbModel(m.weakColor, 0.2);
    for (let i = 0; i < 3; i++) {
      const [x, y, z] = m.weak[i];
      this.weakMeshes[i].geometry = weakOrb.body;
      this.weakMeshes[i].position.set(x, y, z);
    }
    this.batch.rebuild();
  }

  /** Light (or darken) weak point `point` (0..2). */
  setWeak(point: number, lit: boolean): void {
    if (point >= 0 && point < 3) this.lit[point] = lit;
  }

  /** The three weak points (world space) while a Warden is shown; `lit` marks the tappable one. */
  weakPoints(): readonly WeakPointView[] {
    return this.phase === 'fighting' ? this.views : [];
  }

  /** The weak points' glow colour. */
  get weakColor(): number {
    return this.model?.weakColor ?? 0xffd060;
  }

  /** A hit landed on the seal (the Warden flinches). */
  hit(weak: boolean): void {
    this.flinch = weak ? 1 : 0.5;
  }

  /** World centre of the Warden (the light that floods up on the break). */
  centre(out: THREE.Vector3): THREE.Vector3 {
    return out.set(CENTRE_X, -this.depth + 1.6, WALL_Z + 0.5);
  }

  update(dt: number, time: number): void {
    void time;
    this.time += dt;
    if (!this.group.visible) return;
    const t = this.time;
    const fighting = this.phase === 'fighting';
    const held = this.phase === 'held';
    // It stands on the seal's top (world y = -depth), against the back wall; it breathes, strains when fighting.
    const breathe = 1 + Math.sin(t * (fighting ? 3.2 : 1.1)) * (fighting ? 0.025 : 0.012);
    this.flinch = Math.max(0, this.flinch - dt * 5);
    const shake = this.flinch * Math.sin(t * 60) * 0.06;
    this.root.position.set(CENTRE_X + shake, -this.depth - (held ? 0.15 : 0), WALL_Z);
    this.root.scale.set(1, breathe * (held ? 0.94 : 1), 1);
    if (this.part) this.part.rotation.z = Math.sin(t * (fighting ? 2.4 : 0.6)) * (fighting ? 0.25 : 0.08);
    for (let i = 0; i < 3; i++) {
      const m = this.weakMeshes[i];
      const on = fighting && this.lit[i];
      m.visible = fighting;
      m.scale.setScalar(on ? 1.5 + 0.25 * Math.sin(t * 14) : 0.55);
      const v = this.views[i];
      v.id = `weak:${this.biome}:${i}`;
      v.lit = on;
      v.x = this.root.position.x + m.position.x;
      v.y = this.root.position.y + m.position.y * this.root.scale.y;
      v.z = this.root.position.z + m.position.z;
    }
    this.batch.update();
  }
}
