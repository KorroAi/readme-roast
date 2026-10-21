import * as THREE from 'three';
import { SOLID } from '../../config/blocks';
import type { LightingUniforms } from '../../render/lighting';
import { createEntityMaterial } from '../../render/entityMaterial';
import { VoxBuilder } from '../../render/voxModel';
import type { VoxelWorld } from '../../world/VoxelWorld';
import type { Rng } from '../../core/rng';

interface Chunk {
  active: boolean;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  size: number;
  life: number;
  maxLife: number;
  rx: number;
  ry: number;
  spin: number;
  color: THREE.Color;
  glow: boolean;
}

export interface BurstOptions {
  count: number;
  speed: number;
  size: [number, number];
  /** Bias direction (e.g. the mined face normal). */
  dir?: [number, number, number];
  life?: [number, number];
  glow?: boolean;
  /** Spawn spread inside the block (0 = at the point). */
  spread?: number;
}

/** Most chunks one burst may throw (a block's break crumbles into a handful, never a fountain). */
export const CRUMBLE_MAX = 9;

/**
 * Cubic debris with simple voxel collision: chips on each impact, chunks when a block
 * breaks. Two instanced meshes (lit and glowing) keep it to two draw calls. Capped by the
 * quality preset's particle budget; oldest particles are recycled first.
 */
export class DebrisSystem {
  readonly group = new THREE.Group();
  private readonly pool: Chunk[] = [];
  private readonly lit: THREE.InstancedMesh;
  private readonly glow: THREE.InstancedMesh;
  private next = 0;
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly e = new THREE.Euler();
  private readonly s = new THREE.Vector3();
  private readonly p = new THREE.Vector3();
  activeCount = 0;

  constructor(private readonly world: VoxelWorld, lighting: LightingUniforms, private budget: number) {
    const geo = new VoxBuilder().cube(0, 0, 0, 1, 1, 1, 0xffffff, 0, true).build();
    const glowGeo = new VoxBuilder().cube(0, 0, 0, 1, 1, 1, 0xffffff, 1, false).build();
    const max = 400;
    this.lit = new THREE.InstancedMesh(geo, createEntityMaterial(lighting), max);
    this.glow = new THREE.InstancedMesh(glowGeo, createEntityMaterial(lighting, { emissiveScale: 2.6 }), max);
    for (const mesh of [this.lit, this.glow]) {
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3);
      mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
      mesh.count = 0;
      mesh.frustumCulled = false;
      this.group.add(mesh);
    }
    for (let i = 0; i < max; i++) {
      this.pool.push({ active: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, size: 0.1, life: 0, maxLife: 1, rx: 0, ry: 0, spin: 0, color: new THREE.Color(), glow: false });
    }
  }

  setBudget(n: number): void {
    this.budget = Math.max(1, Math.min(this.pool.length, n));
    // Chunks past the new budget are never updated again: retire them now, not on a later raise.
    for (let i = this.budget; i < this.pool.length; i++) this.pool[i].active = false;
    if (this.next >= this.budget) this.next = 0;
  }

  burst(x: number, y: number, z: number, colors: readonly number[], rng: Rng, o: BurstOptions): void {
    // Calm FX (finished-game rules): a crumble is at most CRUMBLE_MAX chunks, whatever the caller asks.
    const count = Math.min(o.count, CRUMBLE_MAX, this.budget);
    for (let i = 0; i < count; i++) {
      const c = this.pool[this.next];
      this.next = (this.next + 1) % this.budget;
      const spread = o.spread ?? 0;
      c.active = true;
      c.x = x + rng.range(-spread, spread);
      c.y = y + rng.range(-spread, spread);
      c.z = z + rng.range(-spread, spread);
      let dx = rng.range(-1, 1);
      let dy = rng.range(0.2, 1.2);
      let dz = rng.range(-1, 1);
      if (o.dir) {
        dx = dx * 0.6 + o.dir[0] * 1.1;
        dy = dy * 0.6 + o.dir[1] * 1.1 + 0.3;
        dz = dz * 0.6 + o.dir[2] * 1.1;
      }
      const l = Math.hypot(dx, dy, dz) || 1;
      const sp = o.speed * rng.range(0.55, 1.1);
      c.vx = (dx / l) * sp;
      c.vy = (dy / l) * sp;
      c.vz = (dz / l) * sp;
      c.size = rng.range(o.size[0], o.size[1]);
      c.maxLife = c.life = o.life ? rng.range(o.life[0], o.life[1]) : rng.range(0.9, 1.6);
      c.rx = rng.range(0, Math.PI * 2);
      c.ry = rng.range(0, Math.PI * 2);
      c.spin = rng.range(-9, 9);
      c.color.setHex(colors[Math.floor(rng.next() * colors.length)]);
      c.glow = !!o.glow;
    }
  }

  update(dt: number): void {
    let nLit = 0;
    let nGlow = 0;
    const w = this.world;
    for (let i = 0; i < this.budget; i++) {
      const c = this.pool[i];
      if (!c.active) continue;
      c.life -= dt;
      if (c.life <= 0) {
        c.active = false;
        continue;
      }
      c.vy -= 20 * dt;
      const nx = c.x + c.vx * dt;
      const ny = c.y + c.vy * dt;
      const nz = c.z + c.vz * dt;
      const r = c.size * 0.5;
      if (SOLID[w.get(Math.floor(c.x), Math.floor(ny - r), Math.floor(c.z))]) {
        c.vy = Math.abs(c.vy) > 1.5 ? -c.vy * 0.32 : 0;
        c.vx *= 0.62;
        c.vz *= 0.62;
        c.spin *= 0.6;
      } else c.y = ny;
      if (SOLID[w.get(Math.floor(nx + Math.sign(c.vx) * r), Math.floor(c.y), Math.floor(c.z))]) c.vx *= -0.3;
      else c.x = nx;
      if (SOLID[w.get(Math.floor(c.x), Math.floor(c.y), Math.floor(nz + Math.sign(c.vz) * r))]) c.vz *= -0.3;
      else c.z = nz;
      c.rx += c.spin * dt;
      c.ry += c.spin * 0.7 * dt;
      // Shrink away during the last third of life.
      const t = c.life / c.maxLife;
      const size = c.size * Math.min(1, t * 3);
      this.e.set(c.rx, c.ry, 0);
      this.q.setFromEuler(this.e);
      this.s.setScalar(size);
      this.p.set(c.x, c.y, c.z);
      this.m.compose(this.p, this.q, this.s);
      const mesh = c.glow ? this.glow : this.lit;
      const n = c.glow ? nGlow++ : nLit++;
      mesh.setMatrixAt(n, this.m);
      mesh.setColorAt(n, c.color);
    }
    this.lit.count = nLit;
    this.glow.count = nGlow;
    this.activeCount = nLit + nGlow;
    for (const mesh of [this.lit, this.glow]) {
      if (mesh.count > 0) {
        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      }
    }
  }

  dispose(): void {
    for (const mesh of [this.lit, this.glow]) {
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
    }
  }
}
