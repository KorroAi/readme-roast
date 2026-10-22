import * as THREE from 'three';
import { ITEMS, type ItemId } from '../config/items';
import { SOLID } from '../config/blocks';
import { DROPS, PLAYER } from '../config/balance';
import type { LightingUniforms } from '../render/lighting';
import { createEntityMaterial } from '../render/entityMaterial';
import { VoxBuilder } from '../render/voxModel';
import type { TileAtlas } from '../render/textures';
import { TILE_SIZE } from '../config/tiles';
import type { Rng } from '../core/rng';
import type { VoxelWorld } from '../world/VoxelWorld';

interface Drop {
  item: ItemId;
  count: number;
  mesh: THREE.Mesh;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  age: number;
  spin: number;
  magnet: boolean;
  rejectedNotified: boolean;
  /** Last position known to be in open space. */
  freeX: number;
  freeY: number;
  freeZ: number;
}

/**
 * Resource drops: miniature blocks (painted from the same pixel tiles as the terrain) or
 * glowing shards that pop out of a broken block, settle, then fly into the explorer's
 * backpack when it has room. Drops that cannot fit stay on the ground for DROPS.lifeSeconds,
 * shrinking away over the last DROPS.dimSeconds (a black-out takes them into the cache).
 */
export class DropSystem {
  readonly group = new THREE.Group();
  private readonly drops: Drop[] = [];
  private readonly geometries = new Map<ItemId, THREE.BufferGeometry>();
  private readonly material: THREE.ShaderMaterial;
  private readonly maxDrops = 48;

  constructor(private readonly world: VoxelWorld, lighting: LightingUniforms, private readonly atlas: TileAtlas) {
    this.material = createEntityMaterial(lighting, { emissiveScale: 2.4 });
  }

  get count(): number {
    return this.drops.length;
  }

  private geometryFor(item: ItemId): THREE.BufferGeometry {
    let g = this.geometries.get(item);
    if (g) return g;
    const def = ITEMS[item];
    const b = new VoxBuilder();
    const k = def.icon.kind;
    const c = def.color;
    const dark = shade(c, 0.55);
    if (k === 'cube') {
      miniBlock(b, this.atlas, def.icon.tile, 0.3);
    } else if (k === 'shard' || k === 'gem') {
      // Round 3 (LOOP): a crystal in the item's own colour.
      b.push().translate(0, -0.18, 0).crystal(0.08, 0.28, 0.12, 6, c, dark, 0.85).pop();
      b.push().translate(0.07, -0.18, 0.03).rotateZ(-0.5).crystal(0.05, 0.16, 0.08, 5, shade(c, 1.2), dark, 0.85).pop();
    } else if (k === 'ore') {
      // A lump of host rock with nuggets of the ore's colour.
      b.cube(0, 0, 0, 0.26, 0.22, 0.24, 0x4a4e57);
      b.cube(0.06, 0.07, 0.11, 0.09, 0.08, 0.04, c, 1, false);
      b.cube(-0.07, -0.02, 0.11, 0.07, 0.07, 0.04, c, 1, false);
      b.cube(0.12, -0.04, 0.02, 0.04, 0.08, 0.08, c, 1, false);
    } else if (k === 'ingot') {
      b.cube(0, 0, 0, 0.32, 0.1, 0.16, c);
      b.cube(0, 0.06, 0, 0.26, 0.03, 0.12, shade(c, 1.2), 1, false);
    } else if (k === 'potion') {
      b.cube(0, -0.04, 0, 0.16, 0.2, 0.16, c);
      b.cube(0, 0.1, 0, 0.06, 0.08, 0.06, 0xd8d0c0);
    } else if (k === 'food') {
      b.cube(0, -0.06, 0, 0.06, 0.14, 0.06, 0xe8e0d0);
      b.cube(0, 0.04, 0, 0.24, 0.08, 0.24, c);
    } else if (k === 'tablet' || k === 'page' || k === 'heart') {
      b.cube(0, 0, 0, 0.3, 0.36, 0.08, 0x59616f);
      b.cube(0, 0.02, 0.045, 0.16, 0.2, 0.01, k === 'heart' ? c : 0x48d6ea, 1, false);
    } else {
      // Parts, wood, building items and gear: a small block in the item's colour.
      b.cube(0, 0, 0, 0.24, 0.2, 0.24, c);
      b.cube(0, 0.11, 0, 0.18, 0.02, 0.18, shade(c, 1.15), 1, false);
    }
    g = b.build();
    this.geometries.set(item, g);
    return g;
  }

  spawn(item: ItemId, count: number, x: number, y: number, z: number, rng: Rng): void {
    if (count <= 0) return;
    if (this.drops.length >= this.maxDrops) {
      // Merge into the oldest drop of the same item rather than losing it.
      const same = this.drops.find((d) => d.item === item);
      if (same) {
        same.count += count;
        return;
      }
    }
    const mesh = new THREE.Mesh(this.geometryFor(item), this.material);
    mesh.frustumCulled = false;
    this.group.add(mesh);
    const a = rng.range(0, Math.PI * 2);
    const sp = rng.range(0.8, 1.8);
    this.drops.push({
      item, count, mesh, x, y, z,
      vx: Math.cos(a) * sp, vy: rng.range(3, 5), vz: Math.sin(a) * sp,
      age: 0, spin: rng.range(1.5, 3) * (rng.chance(0.5) ? 1 : -1), magnet: false, rejectedNotified: false,
      freeX: x, freeY: y, freeZ: z,
    });
  }

  /**
   * @param collect called when a drop reaches the explorer (with where it was); returns how many were accepted.
   * @param onRejected called once per drop when the backpack cannot take it.
   */
  update(
    dt: number,
    time: number,
    px: number,
    py: number,
    pz: number,
    canAccept: (item: ItemId) => boolean,
    collect: (item: ItemId, count: number, x: number, y: number, z: number) => number,
    onRejected: (item: ItemId) => void,
  ): void {
    const w = this.world;
    for (let i = this.drops.length - 1; i >= 0; i--) {
      const d = this.drops[i];
      d.age += dt;
      const tx = px;
      const ty = py + 1.0;
      const tz = pz;
      const dx = tx - d.x;
      const dy = ty - d.y;
      const dz = tz - d.z;
      const dist = Math.hypot(dx, dy, dz);
      if (d.age > 0.35 && dist < PLAYER.pickupRadius) {
        if (canAccept(d.item)) d.magnet = true;
        else if (!d.rejectedNotified) {
          d.rejectedNotified = true;
          onRejected(d.item);
        }
      } else if (dist > PLAYER.pickupRadius * 1.6) {
        d.magnet = false;
        d.rejectedNotified = false;
      }
      if (d.magnet) {
        // Accelerate toward the chest; faster the closer it gets.
        const pull = 22 + 30 / Math.max(0.3, dist);
        d.vx += (dx / dist) * pull * dt;
        d.vy += (dy / dist) * pull * dt;
        d.vz += (dz / dist) * pull * dt;
        d.vx *= 1 - 6 * dt;
        d.vy *= 1 - 6 * dt;
        d.vz *= 1 - 6 * dt;
        d.x += d.vx * dt;
        d.y += d.vy * dt;
        d.z += d.vz * dt;
        if (dist < 0.45) {
          const taken = collect(d.item, d.count, d.x, d.y, d.z);
          d.count -= taken;
          if (d.count <= 0) {
            this.remove(i);
            continue;
          }
          d.magnet = false;
          d.vy = 2;
        }
      } else {
        d.vy -= 18 * dt;
        const ny = d.y + d.vy * dt;
        const fx = Math.floor(d.x);
        const fz = Math.floor(d.z);
        if (d.vy > 0 && SOLID[w.get(fx, Math.floor(ny + 0.15), fz)]) {
          // Ceiling: stop rising just below it (drops pop out of walls and ceilings constantly).
          d.vy = 0;
          d.y = Math.min(d.y, Math.floor(ny + 0.15) - 0.16);
        } else if (d.vy <= 0 && SOLID[w.get(fx, Math.floor(ny - 0.15), fz)]) {
          d.vy = Math.abs(d.vy) > 2 ? -d.vy * 0.3 : 0;
          d.vx *= 0.5;
          d.vz *= 0.5;
          d.y = Math.floor(ny - 0.15) + 1 + 0.15;
        } else d.y = ny;
        const nx = d.x + d.vx * dt;
        const nz = d.z + d.vz * dt;
        if (!SOLID[w.get(Math.floor(nx), Math.floor(d.y), Math.floor(d.z))]) d.x = nx;
        else d.vx = 0;
        if (!SOLID[w.get(Math.floor(d.x), Math.floor(d.y), Math.floor(nz))]) d.z = nz;
        else d.vz = 0;
        // Never let a drop get lost inside rock: fall back to the last open position it had.
        if (SOLID[w.get(Math.floor(d.x), Math.floor(d.y), Math.floor(d.z))]) {
          d.x = d.freeX;
          d.y = d.freeY;
          d.z = d.freeZ;
          d.vx = d.vy = d.vz = 0;
        } else {
          d.freeX = d.x;
          d.freeY = d.y;
          d.freeZ = d.z;
        }
      }
      // Uncollected drops fade: they shrink over their last seconds, then are gone.
      const left = DROPS.lifeSeconds - d.age;
      if (!d.magnet && left <= 0) {
        this.remove(i);
        continue;
      }
      const fade = d.magnet ? 1 : Math.max(0.15, Math.min(1, left / DROPS.dimSeconds));
      const bob = d.magnet ? 0 : Math.sin(time * 3 + i) * 0.04;
      d.mesh.position.set(d.x, d.y + bob, d.z);
      d.mesh.rotation.y += d.spin * dt;
      const appear = Math.min(1, d.age * 8);
      // In first person the eye is 1.62 m up: a drop passing the lens shrinks away instead of filling the screen.
      const eye = Math.hypot(d.x - px, d.y - (py + 1.62), d.z - pz);
      const nearEye = Math.max(0, Math.min(1, (eye - 0.35) / 0.55));
      d.mesh.scale.setScalar(appear * fade * nearEye * (d.magnet ? Math.max(0.4, Math.min(1, dist)) : 1));
    }
  }

  private remove(i: number): void {
    const d = this.drops[i];
    this.group.remove(d.mesh);
    this.drops.splice(i, 1);
  }

  /** Remove all drops (e.g. on respawn). Returns what was on the ground. */
  clear(): Partial<Record<ItemId, number>> {
    const lost: Partial<Record<ItemId, number>> = {};
    for (const d of this.drops) {
      lost[d.item] = (lost[d.item] ?? 0) + d.count;
      this.group.remove(d.mesh);
    }
    this.drops.length = 0;
    return lost;
  }

  dispose(): void {
    this.clear();
    for (const g of this.geometries.values()) g.dispose();
    this.material.dispose();
  }
}

/** A tiny block whose faces are the tile downsampled to 4x4 pixel clusters. */
export function miniBlock(b: VoxBuilder, atlas: TileAtlas, tile: number, size: number): void {
  const N = 4;
  const S = TILE_SIZE;
  const step = S / N;
  const sample = (u: number, v: number): number[] => {
    let r = 0;
    let g = 0;
    let bl = 0;
    for (let y = 0; y < step; y++)
      for (let x = 0; x < step; x++) {
        const px = u * step + x;
        const py = v * step + y;
        const o = (tile * S * S + py * S + px) * 4;
        r += atlas.data[o];
        g += atlas.data[o + 1];
        bl += atlas.data[o + 2];
      }
    const n = step * step;
    return [r / n, g / n, bl / n];
  };
  const h = size / 2;
  const cell = size / N;
  // Each face: origin corner, u axis, v axis, normal, brightness.
  const faces: Array<{ o: [number, number, number]; u: [number, number, number]; v: [number, number, number]; n: [number, number, number]; f: number }> = [
    { o: [-h, h, h], u: [1, 0, 0], v: [0, 0, -1], n: [0, 1, 0], f: 1.25 },
    { o: [-h, -h, -h], u: [1, 0, 0], v: [0, 0, 1], n: [0, -1, 0], f: 0.6 },
    { o: [-h, h, h], u: [1, 0, 0], v: [0, -1, 0], n: [0, 0, 1], f: 1.0 },
    { o: [h, h, -h], u: [-1, 0, 0], v: [0, -1, 0], n: [0, 0, -1], f: 0.85 },
    { o: [h, h, h], u: [0, 0, -1], v: [0, -1, 0], n: [1, 0, 0], f: 0.92 },
    { o: [-h, h, -h], u: [0, 0, 1], v: [0, -1, 0], n: [-1, 0, 0], f: 0.8 },
  ];
  for (const face of faces) {
    const [ux, uy, uz] = face.u;
    const [vx, vy, vz] = face.v;
    const cross = [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx];
    const ccw = cross[0] * face.n[0] + cross[1] * face.n[1] + cross[2] * face.n[2] > 0;
    for (let j = 0; j < N; j++)
      for (let i = 0; i < N; i++) {
        const c = sample(i, j).map((x) => Math.min(255, x * face.f));
        const p = (a: number, bb: number): [number, number, number] => [
          face.o[0] + face.u[0] * a * cell + face.v[0] * bb * cell,
          face.o[1] + face.u[1] * a * cell + face.v[1] * bb * cell,
          face.o[2] + face.u[2] * a * cell + face.v[2] * bb * cell,
        ];
        // Wind counter-clockwise seen from outside whichever way u and v point.
        if (ccw) b.quad([p(i, j), p(i + 1, j), p(i + 1, j + 1), p(i, j + 1)], face.n, c, 0);
        else b.quad([p(i, j + 1), p(i + 1, j + 1), p(i + 1, j), p(i, j)], face.n, c, 0);
      }
  }
}

/** Scale an sRGB colour's channels (clamped). */
function shade(c: number, f: number): number {
  const r = Math.min(255, Math.round(((c >> 16) & 255) * f));
  const g = Math.min(255, Math.round(((c >> 8) & 255) * f));
  const b = Math.min(255, Math.round((c & 255) * f));
  return (r << 16) | (g << 8) | b;
}
