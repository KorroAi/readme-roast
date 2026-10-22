import * as THREE from 'three';
import { B, SOLID } from '../config/blocks';
import type { VoxelWorld } from '../world/VoxelWorld';
import { createEntityMaterial } from './entityMaterial';
import { FOG_CULL, type LightingUniforms } from './lighting';
import { IRON, ROPE, WOOD } from './props/palette';
import { VoxBuilder } from './voxModel';

/**
 * Round 3 (VIS): ladders and ropes.
 *
 * WORLD's `B.LADDER` and `B.ROPE` are invisible, non-solid, climbable cells (CLIMB), placed by the
 * player (LOOP's building items) or by the generator. This draws what is there, one segment per cell
 * so a column of cells reads as one ladder or one rope:
 * - a ladder stands flush against the first solid side of its cell (+x, -x, +z, -z; or in the middle
 *   of the cell when there is none): two rails and three rungs, pegged, the rails' feet on the floor;
 * - a rope hangs down the middle of its cell, toward the wall when it hangs down one, a knot at each
 *   metre, and the top of a rope has its iron ring bolt in the roof (or a stake on the ledge above).
 * Instanced: three draw calls for every ladder and rope in view. Nothing to save (the voxels are).
 *
 * Wiring (VisDirector): `attach(world)` on a new world, `notifyChunk` from ChunkRenderer's chunk
 * listeners, `update(eye)` each frame.
 */

export const LADDER_ID: number = (B as unknown as Record<string, number>).LADDER ?? -1;
export const ROPE_ID: number = (B as unknown as Record<string, number>).ROPE ?? -1;
/** Most segments drawn at once (the nearest). */
export const MAX_SEGMENTS = 384;
const FAR = 60;

export type ClimbKind = 'ladder' | 'rope';

export interface ClimbCell {
  x: number;
  y: number;
  z: number;
  kind: ClimbKind;
  /** The wall it leans on (unit x / z toward the wall), or [0, 0] when free-standing. */
  wall: [number, number];
  /** The top cell of its column (a rope's anchor). */
  top: boolean;
  /** For a rope's top: solid over it (a ring bolt in the roof) or not (a stake on the ledge). */
  roof: boolean;
}

const SIDES: ReadonlyArray<[number, number]> = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

/** How a ladder or rope in cell (x, y, z) is mounted (pure; unit-tested). */
export function climbMount(world: VoxelWorld, x: number, y: number, z: number): ClimbCell | null {
  const id = world.get(x, y, z);
  const kind: ClimbKind | null = id === LADDER_ID ? 'ladder' : id === ROPE_ID ? 'rope' : null;
  if (!kind) return null;
  let wall: [number, number] = [0, 0];
  for (const [dx, dz] of SIDES)
    if (SOLID[world.get(x + dx, y, z + dz)]) {
      wall = [dx, dz];
      break;
    }
  const above = world.get(x, y + 1, z);
  return { x, y, z, kind, wall, top: above !== id, roof: SOLID[above] === 1 };
}

/** One ladder cell: rails along y (0..1), rungs along x, the wall at +z (local). */
function ladderGeometry(): THREE.BufferGeometry {
  const b = new VoxBuilder();
  for (const s of [-1, 1]) {
    b.box(s * 0.2 - 0.035, 0, 0.36, s * 0.2 + 0.035, 1.0, 0.43, WOOD.mid);
    b.box(s * 0.2 - 0.025, 0, 0.355, s * 0.2 + 0.025, 1.0, 0.36, WOOD.light);
  }
  for (const y of [0.17, 0.5, 0.83]) {
    b.box(-0.23, y - 0.022, 0.375, 0.23, y + 0.022, 0.415, WOOD.pale);
    for (const s of [-1, 1]) b.box(s * 0.2 - 0.04, y - 0.012, 0.37, s * 0.2 + 0.04, y + 0.012, 0.42, IRON.dark);
  }
  return b.build();
}

/** One rope cell: a three-strand twist from y 0 to 1 at the origin, a knot at mid height. */
function ropeGeometry(): THREE.BufferGeometry {
  const b = new VoxBuilder();
  const steps = 8;
  for (let i = 0; i < steps; i++) {
    const y0 = i / steps;
    const y1 = (i + 1) / steps;
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * Math.PI * 2 + i * 0.7;
      const r = 0.012;
      b.push().translate(Math.cos(a) * r, 0, Math.sin(a) * r).rotateY(-a);
      b.box(-0.014, y0, -0.014, 0.014, y1 + 0.002, 0.014, k === 0 ? ROPE.light : k === 1 ? ROPE.mid : ROPE.dark);
      b.pop();
    }
  }
  b.box(-0.032, 0.46, -0.032, 0.032, 0.54, 0.032, ROPE.dark);
  b.box(-0.026, 0.44, -0.026, 0.026, 0.56, 0.026, ROPE.mid);
  return b.build();
}

/** A rope's top: an iron ring bolt (in the roof) or a stake with the rope tied round it (on a ledge). */
function anchorGeometry(): THREE.BufferGeometry {
  const b = new VoxBuilder();
  // Ring bolt under the roof (y 1 = the roof face).
  b.box(-0.03, 0.9, -0.03, 0.03, 1.0, 0.03, IRON.dark);
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2;
    b.push().translate(Math.cos(a) * 0.05, 0.86, 0).rotateZ(a);
    b.box(-0.012, -0.024, -0.012, 0.012, 0.024, 0.012, IRON.mid);
    b.pop();
  }
  b.box(-0.03, 0.78, -0.03, 0.03, 0.84, 0.03, ROPE.dark);
  return b.build();
}

function stakeGeometry(): THREE.BufferGeometry {
  const b = new VoxBuilder();
  // A stake driven into the ledge above (y 1 = the ledge's top), the rope tied at its foot.
  b.box(-0.03, 1.0, -0.03, 0.03, 1.32, 0.03, WOOD.dark);
  b.box(-0.04, 1.26, -0.04, 0.04, 1.34, 0.04, IRON.mid);
  b.box(-0.045, 1.02, -0.045, 0.045, 1.1, 0.045, ROPE.mid);
  b.box(-0.016, 0.98, -0.016, 0.016, 1.04, 0.016, ROPE.dark);
  return b.build();
}

export class Climbables {
  readonly group = new THREE.Group();
  private readonly all = new Map<number, ClimbCell>();
  private world: VoxelWorld | null = null;
  private readonly ladders: THREE.InstancedMesh;
  private readonly ropes: THREE.InstancedMesh;
  private readonly bolts: THREE.InstancedMesh;
  private readonly stakes: THREE.InstancedMesh;
  private dirty = true;
  private readonly lastEye = new THREE.Vector3(Number.NaN, 0, 0);
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly p = new THREE.Vector3();
  private readonly s = new THREE.Vector3(1, 1, 1);
  private readonly up = new THREE.Vector3(0, 1, 0);

  constructor(lighting: LightingUniforms) {
    this.group.name = 'climbables';
    const mat = createEntityMaterial(lighting);
    this.ladders = new THREE.InstancedMesh(ladderGeometry(), mat, MAX_SEGMENTS);
    this.ropes = new THREE.InstancedMesh(ropeGeometry(), mat, MAX_SEGMENTS);
    this.bolts = new THREE.InstancedMesh(anchorGeometry(), mat, 96);
    this.stakes = new THREE.InstancedMesh(stakeGeometry(), mat, 96);
    for (const im of [this.ladders, this.ropes, this.bolts, this.stakes]) {
      im.count = 0;
      im.frustumCulled = false;
      im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.group.add(im);
    }
  }

  /** Cells known / drawn (tests and the report). */
  get count(): number {
    return this.all.size;
  }

  get drawn(): number {
    return this.ladders.count + this.ropes.count;
  }

  at(x: number, y: number, z: number): ClimbCell | null {
    const w = this.world;
    return w ? (this.all.get(w.index(x, y, z)) ?? null) : null;
  }

  /** Find every ladder and rope of a world (one pass over the voxels). */
  attach(world: VoxelWorld): void {
    this.world = world;
    this.all.clear();
    if (LADDER_ID >= 0 || ROPE_ID >= 0) {
      const b = world.blocks;
      const { sx, sy } = world;
      for (let i = 0; i < b.length; i++) {
        const id = b[i];
        if (id !== LADDER_ID && id !== ROPE_ID) continue;
        const c = climbMount(world, i % sx, Math.floor(i / sx) % sy, Math.floor(i / (sx * sy)));
        if (c) this.all.set(i, c);
      }
    }
    this.dirty = true;
  }

  /** A chunk's voxels changed: rescan it and its rim (a new rung, a cut rope, its wall mined). */
  notifyChunk(cx: number, cy: number, cz: number, size: number): void {
    const w = this.world;
    if (!w) return;
    const x0 = Math.max(0, cx * size - 1);
    const y0 = Math.max(0, cy * size - 1);
    const z0 = Math.max(0, cz * size - 1);
    const x1 = Math.min(w.sx - 1, (cx + 1) * size);
    const y1 = Math.min(w.sy - 1, (cy + 1) * size);
    const z1 = Math.min(w.sz - 1, (cz + 1) * size);
    const b = w.blocks;
    for (let z = z0; z <= z1; z++)
      for (let y = y0; y <= y1; y++) {
        let i = w.index(x0, y, z);
        for (let x = x0; x <= x1; x++, i++) {
          const id = b[i];
          if (id === LADDER_ID || id === ROPE_ID) {
            const c = climbMount(w, x, y, z);
            if (c) this.all.set(i, c);
          } else if (this.all.has(i)) this.all.delete(i);
        }
      }
    this.dirty = true;
  }

  update(eye: THREE.Vector3): void {
    if (!this.dirty && this.lastEye.distanceToSquared(eye) < 4) return;
    this.dirty = false;
    this.lastEye.copy(eye);
    const far = Math.min(FAR, FOG_CULL.value);
    const near: Array<{ c: ClimbCell; d: number }> = [];
    for (const c of this.all.values()) {
      const d = Math.hypot(c.x + 0.5 - eye.x, c.y + 0.5 - eye.y, c.z + 0.5 - eye.z);
      if (d < far) near.push({ c, d });
    }
    near.sort((a, b) => a.d - b.d);
    let nl = 0;
    let nr = 0;
    let nb = 0;
    let ns = 0;
    for (const { c } of near) {
      if (c.kind === 'ladder' && nl >= MAX_SEGMENTS) continue;
      if (c.kind === 'rope' && nr >= MAX_SEGMENTS) continue;
      const [wx, wz] = c.wall;
      // Local +z faces the wall: turn it to the wall's direction.
      const ang = wx || wz ? Math.atan2(wx, wz) : (((c.x * 31 + c.z * 17) % 4) * Math.PI) / 2;
      this.q.setFromAxisAngle(this.up, ang);
      if (c.kind === 'ladder') {
        // Flush against the wall (free-standing: the rails through the middle of the cell).
        const free = !(wx || wz);
        const ox = free ? -Math.sin(ang) * 0.4 : wx * 0.07;
        const oz = free ? -Math.cos(ang) * 0.4 : wz * 0.07;
        this.p.set(c.x + 0.5 + ox, c.y, c.z + 0.5 + oz);
        this.ladders.setMatrixAt(nl++, this.m.compose(this.p, this.q, this.s));
      } else {
        // Down the middle, 0.3 m off the wall it hangs down.
        this.p.set(c.x + 0.5 + wx * 0.3, c.y, c.z + 0.5 + wz * 0.3);
        this.ropes.setMatrixAt(nr++, this.m.compose(this.p, this.q, this.s));
        if (c.top) {
          if (c.roof && nb < 96) this.bolts.setMatrixAt(nb++, this.m.compose(this.p, this.q, this.s));
          else if (!c.roof && ns < 96) this.stakes.setMatrixAt(ns++, this.m.compose(this.p, this.q, this.s));
        }
      }
    }
    this.ladders.count = nl;
    this.ropes.count = nr;
    this.bolts.count = nb;
    this.stakes.count = ns;
    for (const im of [this.ladders, this.ropes, this.bolts, this.stakes]) {
      im.instanceMatrix.needsUpdate = true;
      im.visible = im.count > 0;
    }
  }

  dispose(): void {
    for (const im of [this.ladders, this.ropes, this.bolts, this.stakes]) im.geometry.dispose();
    (this.ladders.material as THREE.Material).dispose();
  }
}
