// The crew rigs at the face (SPEC §3.4, BUILD §3.3 MUST 6): the Shovel Hand in the lower-right nook, the Pick Crew on
// the upper-right scaffold plank, the Mine Cart on the floor-band rail, all on the shared 0.9 s bar so the screen and
// the numbers agree. People are built in the bevel language (helmet lamps lit, faces never in view); no rig pixel enters
// a live block's tap bound (they stand outside the 2-3-2 bond's rectangle, C8). One merged geometry per rig pose part.

import * as THREE from 'three';
import { LAYER } from '../lantern/layers';
import { BRASS, IRON, OLD_WOOD, PropBuilder, WOOD, type Finish } from '../lantern/props';
import { TINT, type PropMaterials } from '../lantern/propSurface';
import { BLOCK_H, BLOCK_W, type FaceRenderer } from './FaceRenderer';

const BAR = 0.9;
const CLOTH: Finish = { layer: LAYER.timber, tint: TINT.rope };
const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

/** A crouched miner (body, head with a helmet and lamp) and its arm + tool as a separate swinging part. */
function miner(tool: 'shovel' | 'pick'): { body: THREE.BufferGeometry; arm: THREE.BufferGeometry; lamp: THREE.BufferGeometry } {
  const b = new PropBuilder(), a = new PropBuilder(), l = new PropBuilder();
  const q = new THREE.Quaternion();
  b.box(V(0, 0.35, 0), V(0.16, 0.35, 0.11), q, CLOTH, 0.2, 0.05); // legs
  b.box(V(0, 0.9, 0.02), V(0.2, 0.26, 0.13), q.clone().setFromAxisAngle(V(1, 0, 0), 0.25), CLOTH, 0.6, 0.06); // torso, leaning in
  b.box(V(0, 1.27, 0.1), V(0.11, 0.12, 0.11), q, { layer: LAYER.timber, tint: TINT.oldWood }, 0.3, 0.04); // head (from behind: hair/cap)
  b.box(V(0, 1.38, 0.1), V(0.14, 0.04, 0.14), q, BRASS, 0.4, 0.02); // helmet brim
  b.box(V(0, 1.43, 0.1), V(0.11, 0.05, 0.11), q, BRASS, 0.5, 0.03);
  l.box(V(0, 1.42, 0.23), V(0.03, 0.03, 0.015), q, { layer: 0, glow: 1 }, 0.5, 0.008);
  // Arm + tool (pivot at the shoulder, model space origin there).
  a.box(V(0, -0.22, 0.05), V(0.06, 0.22, 0.06), q, CLOTH, 0.4, 0.03);
  a.cylinder(V(0, -0.4, -0.1), V(0, -0.35, 0.65), 0.018, 0.018, OLD_WOOD, 6, 0.3);
  if (tool === 'shovel') a.box(V(0, -0.34, 0.75), V(0.11, 0.015, 0.13), q, IRON, 0.3, 0.006);
  else {
    a.box(V(0, -0.32, 0.67), V(0.02, 0.025, 0.2), q, IRON, 0.3, 0.006);
  }
  return { body: b.build(), arm: a.build(), lamp: l.build() };
}

function cartGeo(): THREE.BufferGeometry {
  const pb = new PropBuilder();
  const q = new THREE.Quaternion();
  pb.box(V(0, 0.42, 0), V(0.3, 0.2, 0.42), q, OLD_WOOD, 0.4, 0.02);
  for (const z of [-0.36, 0.36]) pb.box(V(0, 0.42, z), V(0.31, 0.21, 0.02), q, IRON, 0.3, 0.005);
  for (const sx of [-1, 1])
    for (const sz of [-0.28, 0.28]) {
      const w = new THREE.CylinderGeometry(0.11, 0.11, 0.05, 10);
      w.rotateZ(Math.PI / 2);
      pb.geometry(w, new THREE.Matrix4().makeTranslation(sx * 0.27, 0.11, sz), IRON, 0.3, 0.4);
      w.dispose();
    }
  // A heap of ore in the cart.
  const g = new THREE.DodecahedronGeometry(0.22, 0);
  pb.geometry(g, new THREE.Matrix4().compose(V(0, 0.6, 0), new THREE.Quaternion(), V(1.2, 0.5, 1.6)), { layer: LAYER.slate }, 0.4, 0.5);
  g.dispose();
  return pb.build();
}

interface Rig {
  root: THREE.Group;
  arm: THREE.Object3D | null;
  phase: number;
}

export class NodeCrew {
  readonly group = new THREE.Group();
  private readonly rigs: Rig[] = [];
  private lines: number[] = [0, 0, 0];
  private readonly lampMat: THREE.Material;

  constructor(mats: PropMaterials) {
    this.group.name = 'crew';
    this.lampMat = mats.glow;
    void WOOD;
    const mk = (tool: 'shovel' | 'pick', phase: number): Rig => {
      const m = miner(tool);
      const root = new THREE.Group();
      root.add(new THREE.Mesh(m.body, mats.prop), new THREE.Mesh(m.lamp, this.lampMat));
      const arm = new THREE.Group();
      arm.position.set(0.22, 1.12, 0.05);
      arm.add(new THREE.Mesh(m.arm, mats.prop));
      root.add(arm);
      root.traverse((o) => (o.userData.noShadow = true));
      return { root, arm, phase };
    };
    this.rigs.push(mk('shovel', 0));
    // The Pick Crew: two miners on a plank (the scaffold), alternating swings.
    const crew = new THREE.Group();
    const a = mk('pick', 0), b = mk('pick', 0.5);
    b.root.position.set(-0.55, 0, 0.1);
    crew.add(a.root, b.root);
    const plank = new PropBuilder();
    plank.box(V(-0.3, -0.04, 0.05), V(0.6, 0.04, 0.22), new THREE.Quaternion(), OLD_WOOD, 0.5, 0.012);
    crew.add(new THREE.Mesh(plank.build(), mats.prop));
    this.rigs.push({ root: crew, arm: a.arm, phase: 0 });
    this.rigs.push({ root: b.root, arm: b.arm, phase: 0.5 });
    const cart = new THREE.Group();
    cart.add(new THREE.Mesh(cartGeo(), mats.prop));
    this.rigs.push({ root: cart, arm: null, phase: 0 });
    for (const r of [this.rigs[0], this.rigs[1], this.rigs[3]]) {
      r.root.visible = false;
      this.group.add(r.root);
    }
    void BRASS;
  }

  setLines(lines: ArrayLike<number>): void {
    this.lines = [lines[0] ?? 0, lines[1] ?? 0, lines[2] ?? 0];
  }

  /** Any rig visible and moving (the ambient group of the FX budget). */
  get active(): boolean {
    return this.lines.some((l) => l > 0) && this.rigs[0].root.parent !== null;
  }

  /** Place the rigs at the face (outside the bond's tap bounds) and swing them on the 0.9 s bar of the model clock. */
  update(lines: ArrayLike<number>, time: number, face: FaceRenderer): void {
    this.setLines(lines);
    const F = face.frameAxes;
    const has = face.draws > 0;
    const yaw = Math.atan2(-F.d.x, -F.d.z);
    const place = (r: Rig, u: number, v: number, along: number, on: boolean) => {
      r.root.visible = has && on;
      if (!r.root.visible) return;
      r.root.position.copy(F.o).addScaledVector(F.r, u).addScaledVector(F.u, v).addScaledVector(F.d, along);
      r.root.rotation.set(0, yaw + Math.PI, 0);
    };
    // Shovel Hand: lower-right nook, beside the bottom row, a little toward the viewer.
    place(this.rigs[0], BLOCK_W * 1.45, 0, -0.55, this.lines[0] > 0);
    // Pick Crew: upper-right scaffold (above the middle row's right block, outside the top row's bounds).
    place(this.rigs[1], BLOCK_W * 1.55, BLOCK_H * 2 + 0.1, -0.6, this.lines[1] > 0);
    // Mine Cart: the floor-band rail, nearer the viewer, sliding on its bar.
    const cartT = (time % (BAR * 4)) / (BAR * 4);
    place(this.rigs[3], -BLOCK_W * 1.1, 0, -1.6 - 0.5 * Math.sin(cartT * Math.PI * 2), this.lines[2] > 0);
    // Swings on the bar: strike at phase 0 (the impact frame), back-swing over the rest.
    for (const r of this.rigs) {
      if (!r.arm) continue;
      const ph = ((time / BAR + r.phase) % 1 + 1) % 1;
      const swing = ph < 0.15 ? 1 - ph / 0.15 : (ph - 0.15) / 0.85;
      r.arm.rotation.set(-0.3 - 1.2 * swing * swing, 0, 0);
    }
  }

  dispose(): void {
    this.group.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
  }
}
