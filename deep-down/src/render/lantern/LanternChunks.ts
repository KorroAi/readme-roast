// The chunk path of the Lantern Voxel surface (W1-LEAD §1.1): one mesh per non-empty 16³ world chunk, remeshed from the
// world's dirty flags nearest-first, in up to two module workers (the main thread meshes only when no worker exists,
// within a per-frame budget). A chunk keeps its old mesh until the new one arrives; a result older than the chunk's
// latest request is dropped. Ring worlds (RingWorld) work through copyPadded/worldChunkY: meshes sit at world y.

import * as THREE from 'three';
import { SOLID, VISIBLE } from '../../config/blocks';
import type { VoxelWorld } from '../../world/VoxelWorld';
import { PADDED_VOXELS, copyPadded, worldChunkY } from '../mesher';
import { meshLantern, type LanternMesh } from './mesher';
import { CELL } from './cells';

export interface LanternChunkStats {
  chunks: number;
  meshed: number;
  /** Triangles of the meshes drawn last frame (after culling) and of every mesh. */
  visibleTris: number;
  totalTris: number;
  drawn: number;
  /** Worker / main-thread meshes so far, last and largest worker mesh ms. */
  workerMeshes: number;
  syncMeshes: number;
  lastMs: number;
  maxMs: number;
  pending: number;
  workers: number;
}

interface WorkerResult {
  id: number;
  ms: number;
  mesh: LanternMesh;
  pad: Uint8Array;
}

/** Called when a chunk's mesh changes: its world origin (m) and its exposed ore faces (for the nugget dressing). */
export type NuggetSink = (chunk: number, origin: THREE.Vector3, nuggets: Float32Array) => void;

export class LanternChunks {
  readonly group = new THREE.Group();
  readonly stats: LanternChunkStats = { chunks: 0, meshed: 0, visibleTris: 0, totalTris: 0, drawn: 0, workerMeshes: 0, syncMeshes: 0, lastMs: 0, maxMs: 0, pending: 0, workers: 0 };
  /** Chunks farther than this (m, from the camera to the chunk's box) are not drawn. */
  viewDistance = 72;
  /** Chunks nearer than this (m, to the chunk's box) draw the bevelled near mesh; the rest one quad per face. */
  lodNear = 13;
  onNuggets: NuggetSink = () => {};
  private readonly meshes: Array<THREE.Mesh | null>;
  private readonly tris: Int32Array;
  private readonly trisFar: Int32Array;
  private readonly lodIdx: Array<{ near: THREE.BufferAttribute; far: THREE.BufferAttribute; isNear: boolean } | null>;
  private readonly latest: Float64Array;
  private readonly inFlight: Uint8Array;
  private readonly workers: Worker[] = [];
  private readonly busy: number[] = [];
  private readonly jobs = new Map<number, { chunk: number; wcy: number; worker: number }>();
  private readonly freePads: Uint8Array[] = [];
  private seq = 0;
  private readonly frustum = new THREE.Frustum();
  private readonly pm = new THREE.Matrix4();
  private readonly tmp = new THREE.Vector3();
  private settle: Array<() => void> = [];

  constructor(
    readonly world: VoxelWorld,
    readonly material: THREE.Material,
    opts: { workers?: number } = {},
  ) {
    const n = world.cx * world.cy * world.cz;
    this.meshes = new Array(n).fill(null);
    this.tris = new Int32Array(n);
    this.trisFar = new Int32Array(n);
    this.lodIdx = new Array(n).fill(null);
    this.latest = new Float64Array(n);
    this.inFlight = new Uint8Array(n);
    this.stats.chunks = n;
    this.group.name = 'lanternChunks';
    const want = opts.workers ?? (typeof Worker !== 'undefined' && typeof window !== 'undefined' ? 2 : 0);
    for (let i = 0; i < want; i++) {
      try {
        const w = new Worker(new URL('./lanternWorker.ts', import.meta.url), { type: 'module' });
        w.onmessage = (e: MessageEvent<WorkerResult>) => this.onResult(i, e.data);
        w.onerror = () => {
          // A failed worker: its jobs are re-queued on the main thread.
          for (const [id, j] of this.jobs) if (j.worker === i) {
            this.jobs.delete(id);
            this.inFlight[j.chunk] = 0;
            this.world.dirty[j.chunk] = 1;
          }
          this.busy[i] = 1e9;
        };
        this.workers.push(w);
        this.busy.push(0);
      } catch {
        break;
      }
    }
    this.stats.workers = this.workers.length;
  }

  private chunkXYZ(i: number): [number, number, number] {
    const w = this.world;
    return [i % w.cx, Math.floor(i / w.cx) % w.cy, Math.floor(i / (w.cx * w.cy))];
  }

  /** True when the padded block has both a visible solid and an air cell (else it has no faces). */
  private static mixed(pad: Uint8Array): boolean {
    let air = false, vis = false;
    for (let i = 0; i < pad.length; i++) {
      const b = pad[i];
      if (!SOLID[b]) air = true;
      else if (VISIBLE[b]) vis = true;
      if (air && vis) return true;
    }
    return false;
  }

  /** Mesh every chunk now (workers in parallel when present). Resolves when all are applied. */
  async buildAll(): Promise<void> {
    const n = this.meshes.length;
    for (let i = 0; i < n; i++) this.world.dirty[i] = 1;
    this.update(new THREE.Vector3(), Infinity);
    await this.flush();
  }

  /** Wait until no job is pending (tests, captures, the first frame). */
  flush(): Promise<void> {
    if (!this.jobs.size && !this.world.dirty.some((d) => d === 1)) return Promise.resolve();
    return new Promise((r) => {
      this.settle.push(r);
      this.update(new THREE.Vector3(), Infinity);
    });
  }

  /** Remesh dirty chunks, nearest to `focus` first. `budgetMs` bounds main-thread meshing (no workers). */
  update(focus: THREE.Vector3, budgetMs = 4): void {
    const w = this.world;
    const cs = w.chunkSize;
    const order: Array<[number, number]> = [];
    for (let i = 0; i < w.dirty.length; i++) {
      if (!w.dirty[i] || this.inFlight[i]) continue;
      const [cx, cy, cz] = this.chunkXYZ(i);
      const wy = worldChunkY(w, cy);
      if (wy === null) {
        w.dirty[i] = 0;
        this.setMesh(i, null, 0);
        continue;
      }
      const h = cs * CELL;
      const dx = (cx + 0.5) * h - focus.x, dy = (wy + 0.5) * h - focus.y, dz = (cz + 0.5) * h - focus.z;
      order.push([i, dx * dx + dy * dy + dz * dz]);
    }
    order.sort((a, b) => a[1] - b[1]);
    const t0 = performance.now();
    for (const [i] of order) {
      const [cx, cy, cz] = this.chunkXYZ(i);
      const wcy = worldChunkY(w, cy);
      if (wcy === null) continue;
      const pad = copyPadded(w, cx, cy, cz, this.freePads.pop() ?? new Uint8Array(PADDED_VOXELS));
      w.dirty[i] = 0;
      if (!LanternChunks.mixed(pad)) {
        this.freePads.push(pad);
        this.setMesh(i, null, wcy);
        continue;
      }
      const id = ++this.seq;
      this.latest[i] = id;
      if (this.workers.length) {
        // The least busy live worker.
        let wi = 0;
        for (let k = 1; k < this.workers.length; k++) if (this.busy[k] < this.busy[wi]) wi = k;
        if (this.busy[wi] < 1e8) {
          this.busy[wi]++;
          this.inFlight[i] = 1;
          this.jobs.set(id, { chunk: i, wcy, worker: wi });
          this.workers[wi].postMessage({ id, pad, ox: cx * cs, oy: wcy * cs, oz: cz * cs }, [pad.buffer]);
          continue;
        }
      }
      if (performance.now() - t0 > budgetMs) {
        w.dirty[i] = 1;
        this.freePads.push(pad);
        break;
      }
      const ts = performance.now();
      const m = meshLantern(pad, cx * cs, wcy * cs, cz * cs);
      this.freePads.push(pad);
      this.stats.syncMeshes++;
      this.note(performance.now() - ts);
      this.setMesh(i, m, wcy);
    }
    this.stats.pending = this.jobs.size;
    this.maybeSettle();
  }

  private note(ms: number): void {
    this.stats.lastMs = ms;
    this.stats.maxMs = Math.max(this.stats.maxMs, ms);
  }

  private onResult(wi: number, r: WorkerResult): void {
    this.busy[wi] = Math.max(0, this.busy[wi] - 1);
    const job = this.jobs.get(r.id);
    this.jobs.delete(r.id);
    if (r.pad && r.pad.byteLength === PADDED_VOXELS) this.freePads.push(r.pad);
    if (!job) return;
    this.inFlight[job.chunk] = 0;
    this.stats.workerMeshes++;
    this.note(r.ms);
    if (this.latest[job.chunk] === r.id) this.setMesh(job.chunk, r.mesh, job.wcy);
    this.stats.pending = this.jobs.size;
    this.maybeSettle();
  }

  private maybeSettle(): void {
    if (this.jobs.size || !this.settle.length) return;
    if (this.world.dirty.some((d) => d === 1)) {
      this.update(new THREE.Vector3(), Infinity);
      if (this.jobs.size) return;
    }
    const s = this.settle;
    this.settle = [];
    for (const r of s) r();
  }

  private setMesh(i: number, m: LanternMesh | null, wcy: number): void {
    const old = this.meshes[i];
    if (old) {
      this.group.remove(old);
      old.geometry.dispose();
      this.meshes[i] = null;
      this.stats.totalTris -= this.tris[i];
      this.tris[i] = 0;
      this.lodIdx[i] = null;
      this.stats.meshed--;
    }
    const cs = this.world.chunkSize;
    const [cx, , cz] = this.chunkXYZ(i);
    const origin = new THREE.Vector3(cx * cs * CELL, wcy * cs * CELL, cz * cs * CELL);
    const sz = cs * CELL;
    if (!m || !m.faceCount) {
      this.onNuggets(i, origin, new Float32Array(0));
      return;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(m.positions, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(m.normals, 4, true));
    g.setAttribute('aMat', new THREE.BufferAttribute(m.mat, 4, false));
    g.setAttribute('aMat2', new THREE.BufferAttribute(m.mat2, 4, false));
    const near = new THREE.BufferAttribute(m.indices, 1);
    const far = new THREE.BufferAttribute(m.indicesFar, 1);
    g.setIndex(near);
    this.lodIdx[i] = { near, far, isNear: true };
    g.boundingBox = new THREE.Box3(new THREE.Vector3(-0.1, -0.1, -0.1), new THREE.Vector3(sz + 0.1, sz + 0.1, sz + 0.1));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(sz / 2, sz / 2, sz / 2), (sz * Math.sqrt(3)) / 2 + 0.2);
    const mesh = new THREE.Mesh(g, this.material);
    mesh.position.copy(origin);
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();
    mesh.name = `chunk${i}`;
    mesh.userData.chunk = i;
    this.group.add(mesh);
    this.meshes[i] = mesh;
    this.tris[i] = m.indices.length / 3;
    this.trisFar[i] = m.indicesFar.length / 3;
    this.stats.totalTris += this.tris[i];
    this.stats.meshed++;
    this.onNuggets(i, origin, m.nuggets);
  }

  /** Frustum and distance culling for this frame's camera; returns the triangles drawn. */
  cull(camera: THREE.Camera): number {
    this.pm.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(this.pm);
    const cam = camera.getWorldPosition(this.tmp);
    const cs = this.world.chunkSize * CELL;
    let tris = 0, drawn = 0;
    const box = new THREE.Box3();
    for (let i = 0; i < this.meshes.length; i++) {
      const m = this.meshes[i];
      if (!m) continue;
      box.min.set(m.position.x - 0.1, m.position.y - 0.1, m.position.z - 0.1);
      box.max.set(m.position.x + cs + 0.1, m.position.y + cs + 0.1, m.position.z + cs + 0.1);
      const d = box.distanceToPoint(cam);
      const vis = d < this.viewDistance && this.frustum.intersectsBox(box);
      m.visible = vis;
      m.frustumCulled = false;
      if (vis) {
        const lod = this.lodIdx[i];
        const near = d < this.lodNear;
        if (lod && lod.isNear !== near) {
          m.geometry.setIndex(near ? lod.near : lod.far);
          lod.isNear = near;
        }
        tris += near ? this.tris[i] : this.trisFar[i];
        drawn++;
      }
    }
    this.stats.visibleTris = tris;
    this.stats.drawn = drawn;
    return tris;
  }

  /** The chunk meshes (picking, ID buffer, shadow passes). */
  get list(): ReadonlyArray<THREE.Mesh> {
    return this.meshes.filter((m): m is THREE.Mesh => m !== null);
  }

  dispose(): void {
    for (const w of this.workers) w.terminate();
    for (let i = 0; i < this.meshes.length; i++) this.setMesh(i, null, 0);
  }
}
