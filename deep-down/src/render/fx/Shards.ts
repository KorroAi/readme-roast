import * as THREE from 'three';
import type { LightingUniforms } from '../lighting';
import { shardSets } from './fracture';
import { SHARD_BLOCKS, createShardMaterial, type ShardUniforms } from './shardMaterial';

/**
 * Shards (SPEC §10.5, §11.4; BUILD W2 MUST 4): a broken cell's front metre becomes one BSP-fractured set of
 * 9-12 convex shards in the frame of the break, which fly at 2.5-4.5 m/s, land on the floor ledge and bounce,
 * and dissolve with an ember rim. One draw for every live shard: the geometry is a static pool of
 * SHARD_BLOCKS blocks (block j holds a copy of set j mod 3), and a break only writes its block's uniforms.
 *
 * The preset cap (live shards: Battery 72, Balanced 192, High 320) limits the blocks in use; the aggregation
 * rule (SPEC §10.12) scales a burst by min(1, 40 / breaks per second), so a row wipe shatters a few cells and
 * dusts the rest.
 */
export interface ShardBreak {
  /** World centre of the cell's front metre. */
  x: number;
  y: number;
  z: number;
  /** The cell's block id (the section look's row) and its material layer (MAT_SIDE[id], the fallback). */
  blockId: number;
  layer: number;
  /** World y of the ledge the shards land on (the top of the row below); -1e4 when open below. */
  floorY: number;
  /** The tap came from this side (-1 left, 1 right, 0 straight). */
  side?: number;
  /** Heat glow at birth (0..1: ore and crits glow). */
  heat?: number;
  /** A leftover crumble: the shards sink instead of flying. */
  crumble?: boolean;
  /** Speed scale (1 = 2.5-4.5 m/s). */
  speed?: number;
}

export class Shards {
  readonly mesh: THREE.Mesh;
  readonly uniforms: ShardUniforms;
  /** Shards per block, by block index (its set's size). */
  readonly perBlock: number[] = [];
  /** Live-shard cap (the preset's). */
  cap: number;
  /** FX clock (s). */
  time = 0;
  spawned = 0;
  refused = 0;
  private readonly deathAt = new Float32Array(SHARD_BLOCKS).fill(-1);
  private next = 0;
  /** Breaks in the last second (the aggregation rule). */
  private readonly recent: number[] = [];

  constructor(lighting: LightingUniforms, matTex: THREE.Texture | null, section: { uSectionKey: THREE.IUniform<THREE.Color>; uCamFill: THREE.IUniform<THREE.Color> }, cap = 192) {
    this.cap = cap;
    const sets = shardSets();
    let verts = 0;
    for (let b = 0; b < SHARD_BLOCKS; b++) for (const s of sets[b % sets.length]) verts += s.positions.length / 3;
    const pos = new Float32Array(verts * 3);
    const nor = new Float32Array(verts * 3);
    const shard = new Float32Array(verts * 4);
    const spin = new Float32Array(verts * 4);
    let o = 0;
    let seed = 0x2545f491;
    const rnd = () => {
      seed ^= seed << 13;
      seed ^= seed >>> 17;
      seed ^= seed << 5;
      return ((seed >>> 0) % 100000) / 100000;
    };
    for (let b = 0; b < SHARD_BLOCKS; b++) {
      const set = sets[b % sets.length];
      this.perBlock.push(set.length);
      for (const s of set) {
        const ax = [rnd() * 2 - 1, rnd() * 2 - 1, rnd() * 2 - 1];
        const rate = (4 + rnd() * 5) * (rnd() < 0.5 ? -1 : 1);
        const n = s.positions.length / 3;
        for (let i = 0; i < n; i++, o++) {
          pos.set(s.positions.subarray(i * 3, i * 3 + 3), o * 3);
          nor.set(s.normals.subarray(i * 3, i * 3 + 3), o * 3);
          shard[o * 4] = s.centroid[0];
          shard[o * 4 + 1] = s.centroid[1];
          shard[o * 4 + 2] = s.centroid[2];
          shard[o * 4 + 3] = b;
          spin[o * 4] = ax[0];
          spin[o * 4 + 1] = ax[1];
          spin[o * 4 + 2] = ax[2] + 0.001;
          spin[o * 4 + 3] = rate;
        }
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    geo.setAttribute('aShard', new THREE.BufferAttribute(shard, 4));
    geo.setAttribute('aSpin', new THREE.BufferAttribute(spin, 4));
    const { material, uniforms } = createShardMaterial(lighting, matTex, section);
    this.uniforms = uniforms;
    this.mesh = new THREE.Mesh(geo, material);
    this.mesh.name = 'shards';
    this.mesh.frustumCulled = false;
  }

  /** Live shards now. */
  get live(): number {
    let n = 0;
    for (let b = 0; b < SHARD_BLOCKS; b++) if (this.deathAt[b] > this.time) n += this.perBlock[b];
    return n;
  }

  /** Breaks per second over the last second (FX clock). */
  get rate(): number {
    while (this.recent.length && this.recent[0] < this.time - 1) this.recent.shift();
    return this.recent.length;
  }

  /**
   * Shatter a cell's front metre now. Under the aggregation rule some breaks of a burst get no shards (dust
   * only); @returns the shards spawned (0 when refused).
   */
  shatter(b: ShardBreak): number {
    this.recent.push(this.time);
    const rate = this.rate;
    // Aggregation: keep min(1, 40 / breaks per second) of the bursts (deterministically: every k-th).
    const keep = Math.min(1, 40 / Math.max(1, rate));
    if (keep < 1 && (this.spawned + this.refused) % Math.round(1 / keep) !== 0) {
      this.refused++;
      return 0;
    }
    // A free block within the cap.
    let block = -1;
    for (let k = 0; k < SHARD_BLOCKS; k++) {
      const j = (this.next + k) % SHARD_BLOCKS;
      if (this.deathAt[j] <= this.time) {
        block = j;
        break;
      }
    }
    if (block < 0 || this.live + this.perBlock[block] > this.cap) {
      this.refused++;
      return 0;
    }
    this.next = (block + 1) % SHARD_BLOCKS;
    const life = b.crumble ? 0.9 : 1.0;
    const u = this.uniforms;
    u.uBlockA.value[block].set(b.x, b.y, b.z, this.time);
    u.uBlockB.value[block].set(b.blockId, b.floorY, b.side ?? 0, b.heat ?? 0);
    u.uBlockC.value[block].set(b.speed ?? 1, life, b.crumble ? 1 : 0, b.layer);
    this.deathAt[block] = this.time + life;
    this.spawned++;
    return this.perBlock[block];
  }

  update(fxDt: number): void {
    this.time += Math.max(0, fxDt);
    this.uniforms.uFxTime.value = this.time;
    this.mesh.visible = this.deathAt.some((d) => d > this.time);
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }
}
