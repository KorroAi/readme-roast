import * as THREE from 'three';
import type { VoxelWorld } from '../world/VoxelWorld';
import { meshChunk } from './mesher';

export interface ChunkStats {
  chunks: number;
  meshedChunks: number;
  vertices: number;
  triangles: number;
  lastRebuildMs: number;
  maxRebuildMs: number;
}

/**
 * Owns one THREE.Mesh per non-empty chunk and rebuilds dirty chunks within a per-frame
 * time budget. Chunks beyond the fog distance are hidden to save fill rate and draw calls.
 */
export class ChunkRenderer {
  readonly group = new THREE.Group();
  readonly stats: ChunkStats = { chunks: 0, meshedChunks: 0, vertices: 0, triangles: 0, lastRebuildMs: 0, maxRebuildMs: 0 };
  private readonly meshes: Array<THREE.Mesh | null>;
  private readonly world: VoxelWorld;
  private readonly material: THREE.Material;
  private readonly vertexCounts: Int32Array;
  viewDistance = 96;

  constructor(world: VoxelWorld, material: THREE.Material) {
    this.world = world;
    this.material = material;
    const n = world.cx * world.cy * world.cz;
    this.meshes = new Array(n).fill(null);
    this.vertexCounts = new Int32Array(n);
    this.stats.chunks = n;
    this.group.name = 'terrain';
    this.group.matrixAutoUpdate = false;
  }

  /** Build every chunk, yielding to the browser periodically. Progress in [0, 1]. */
  async buildAll(onProgress?: (p: number) => void, sliceMs = 24): Promise<void> {
    const w = this.world;
    const total = w.cx * w.cy * w.cz;
    let done = 0;
    let sliceStart = performance.now();
    for (let cz = 0; cz < w.cz; cz++)
      for (let cy = 0; cy < w.cy; cy++)
        for (let cx = 0; cx < w.cx; cx++) {
          this.rebuild(cx, cy, cz);
          done++;
          if (performance.now() - sliceStart > sliceMs) {
            onProgress?.(done / total);
            await new Promise((r) => setTimeout(r, 0));
            sliceStart = performance.now();
          }
        }
    w.dirty.fill(0);
    onProgress?.(1);
  }

  /** Rebuild dirty chunks nearest the focus first, within `budgetMs`. Returns chunks rebuilt. */
  update(focus: THREE.Vector3, budgetMs = 4): number {
    const w = this.world;
    const cs = w.chunkSize;
    const dirty: number[] = [];
    for (let i = 0; i < w.dirty.length; i++) if (w.dirty[i]) dirty.push(i);
    if (dirty.length) {
      const cxy = w.cx * w.cy;
      const dist = (i: number) => {
        const cz = Math.floor(i / cxy);
        const cy = Math.floor((i - cz * cxy) / w.cx);
        const cx = i - cz * cxy - cy * w.cx;
        return (cx * cs + 8 - focus.x) ** 2 + (cy * cs + 8 - focus.y) ** 2 + (cz * cs + 8 - focus.z) ** 2;
      };
      dirty.sort((a, b) => dist(a) - dist(b));
    }
    const start = performance.now();
    let rebuilt = 0;
    for (const i of dirty) {
      // Always rebuild at least the nearest chunk so edits are never left invisible.
      if (rebuilt > 0 && performance.now() - start > budgetMs) break;
      const cxy = w.cx * w.cy;
      const cz = Math.floor(i / cxy);
      const cy = Math.floor((i - cz * cxy) / w.cx);
      const cx = i - cz * cxy - cy * w.cx;
      const t0 = performance.now();
      this.rebuild(cx, cy, cz);
      const ms = performance.now() - t0;
      this.stats.lastRebuildMs = ms;
      this.stats.maxRebuildMs = Math.max(this.stats.maxRebuildMs, ms);
      w.dirty[i] = 0;
      rebuilt++;
    }
    this.cull(focus);
    return rebuilt;
  }

  /** Hide chunks far beyond the fog. */
  cull(focus: THREE.Vector3): void {
    const cs = this.world.chunkSize;
    const maxD2 = (this.viewDistance + cs) ** 2;
    for (const m of this.meshes) {
      if (!m) continue;
      const c = m.userData.center as THREE.Vector3;
      m.visible = c.distanceToSquared(focus) < maxD2;
    }
  }

  rebuild(cx: number, cy: number, cz: number): void {
    const w = this.world;
    const i = w.chunkIndex(cx, cy, cz);
    const data = meshChunk(w, cx, cy, cz);
    let mesh = this.meshes[i];
    this.stats.vertices -= this.vertexCounts[i];
    this.stats.triangles -= this.vertexCounts[i] / 2;
    if (data.faceCount === 0) {
      if (mesh) {
        this.group.remove(mesh);
        mesh.geometry.dispose();
        this.meshes[i] = null;
        this.stats.meshedChunks--;
      }
      this.vertexCounts[i] = 0;
      return;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(data.positions, 3));
    geo.setAttribute('aData', new THREE.BufferAttribute(data.data, 4));
    geo.setAttribute('aNb', new THREE.BufferAttribute(data.nb, 4));
    geo.setIndex(new THREE.BufferAttribute(data.indices, 1));
    const cs = w.chunkSize;
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(cs / 2, cs / 2, cs / 2), (cs * Math.sqrt(3)) / 2 + 0.5);
    geo.boundingBox = new THREE.Box3(new THREE.Vector3(0, 0, 0), new THREE.Vector3(cs, cs, cs));
    if (mesh) {
      mesh.geometry.dispose();
      mesh.geometry = geo;
    } else {
      mesh = new THREE.Mesh(geo, this.material);
      mesh.position.set(cx * cs, cy * cs, cz * cs);
      mesh.matrixAutoUpdate = false;
      mesh.updateMatrix();
      mesh.userData.center = new THREE.Vector3(cx * cs + cs / 2, cy * cs + cs / 2, cz * cs + cs / 2);
      mesh.name = `chunk_${cx}_${cy}_${cz}`;
      this.group.add(mesh);
      this.meshes[i] = mesh;
      this.stats.meshedChunks++;
    }
    this.vertexCounts[i] = data.vertexCount;
    this.stats.vertices += data.vertexCount;
    this.stats.triangles += data.vertexCount / 2;
  }

  dispose(): void {
    for (const m of this.meshes) m?.geometry.dispose();
    this.group.clear();
  }
}
