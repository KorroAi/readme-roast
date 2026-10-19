import * as THREE from 'three';
import type { VoxelWorld } from '../world/VoxelWorld';
import { ChunkMeshData, OFFSET_RANGE, PADDED_VOXELS, VERTEX_BYTES, copyPadded, meshChunk } from './mesher';
import { MeshPool, meshBuildOnWorkers, meshWorkerCount, spawnMeshWorker, type MeshJob, type MeshResult, type WorkerLike } from './meshPool';

export interface ChunkStats {
  chunks: number;
  meshedChunks: number;
  vertices: number;
  triangles: number;
  /** GPU bytes of all terrain vertex and index buffers. */
  bytes: number;
  /** Main-thread ms of the last chunk update in play (not buildAll) and the largest one: the whole
   *  mesh when meshing on the main thread; with workers, the copy + post of its voxels or the
   *  upload of its result. */
  lastRebuildMs: number;
  maxRebuildMs: number;
  /** Mesh workers in use; 0 = meshing on the main thread (not started yet, none, or failed). */
  workers: number;
  /** Warm-up jobs not answered yet (edits go to the workers once this is 0). */
  warmUpLeft: number;
  /** Why the workers were given up (null while they work, or when none were started). */
  workerFallback: string | null;
  /** Cumulative main-thread ms in update() and in applying worker results. */
  mainMs: number;
  /** Worker jobs whose mesh is not applied yet. */
  pending: number;
  /** Chunk meshes applied from workers / made on the main thread (cumulative). */
  workerMeshes: number;
  syncMeshes: number;
  /** Worker results dropped because a newer mesh of the chunk had been requested or made. */
  staleResults: number;
  /** Worker-side mesh ms, last and largest. */
  lastWorkerMs: number;
  maxWorkerMs: number;
  /** In play (not buildAll): post-to-applied ms of the last applied job and the largest, and the
   *  same in frames (1 = drawn in the frame after the one that posted it). */
  lastRoundTripMs: number;
  maxRoundTripMs: number;
  lastLatencyFrames: number;
  maxLatencyFrames: number;
}

export interface ChunkRendererOptions {
  /** Mesh workers: 'auto' (default; meshWorkerCount()), or a count, 0 = main thread only. */
  workers?: number | 'auto';
  /** Worker factory (unit tests). */
  spawn?: () => WorkerLike;
  /** Let the workers share buildAll with the main thread (default: `?meshbuild=pool`; off). */
  buildOnWorkers?: boolean;
  /** Real chunks each worker meshes before it takes edits (default 48; 0 = none). */
  warmUp?: number;
  /** Frames (update() calls) after the first build before the workers start (default 30; 0 = at
   *  once), so they do not compete with the rest of loading. */
  workerStartFrames?: number;
}

interface Job {
  id: number;
  chunk: number;
  cx: number;
  cy: number;
  cz: number;
  /** World revision of the voxel snapshot. */
  rev: number;
  t: number;
  frame: number;
  build: boolean;
  batch: Batch | null;
  result: MeshResult | null;
}

/** Jobs posted together (one update): applied together, in posting order, so chunks dirtied by
 *  one edit switch to their new meshes in the same frame. */
interface Batch {
  jobs: Job[];
  pending: number;
}

interface BuildState {
  /** Chunks without a mesh from this build yet, and the per-chunk flags behind that count. */
  remaining: number;
  built: Uint8Array;
  /** Build jobs in posting order: once the queue is empty the main thread steals the newest. */
  posted: Job[];
  /** Chunks of build jobs a failed worker lost (meshed on the main thread). */
  lost: number[];
}

/** Gameplay: jobs in flight per worker (an edit waits behind at most this many). */
const JOBS_PER_WORKER = 4;
/** buildAll: jobs in flight per worker (a few ms of work: enough to cover a main-thread slice,
 *  few enough that little is meshed twice when the main thread steals the tail), per message. */
const BUILD_JOBS_PER_WORKER = 16;
const BUILD_BATCH = 8;
/** buildAll with workers: the main thread meshes from the back of the queue in slices this long. */
const BUILD_MAIN_SLICE_MS = 6;
/** Warm-up after the first build: real chunks per worker (in a measured warm-up curve V8
 *  optimised the mesher after ~10 meshes and re-optimised it around the 25th). */
const WARM_UP_CHUNKS = 48;
/** Frames after the first build before the workers start (once the menu is drawing). */
const WORKER_START_FRAMES = 30;
/** A job not back after this long (and, in play, this many frames) means the workers are stuck. */
const WATCHDOG_MS = 8000;
const WATCHDOG_FRAMES = 60;

const now = () => performance.now();

// A task-sized yield without setTimeout's 4 ms clamp on nested timers (browsers only: in Node a
// MessagePort would keep the process alive).
let yieldPort: MessagePort | null = null;
const yielded: Array<() => void> = [];
function yieldTask(): Promise<void> {
  if (typeof MessageChannel === 'undefined' || typeof document === 'undefined') return new Promise((r) => setTimeout(r, 0));
  if (!yieldPort) {
    const ch = new MessageChannel();
    ch.port1.onmessage = () => yielded.shift()?.();
    yieldPort = ch.port2;
  }
  return new Promise((r) => {
    yielded.push(r);
    yieldPort!.postMessage(null);
  });
}

/**
 * Owns one THREE.Mesh per non-empty chunk and remeshes dirty chunks nearest-first. Chunks beyond
 * the fog distance are hidden to save fill rate and draw calls.
 *
 * In play, remeshing runs in a small pool of module workers (meshPool.ts): the main thread copies
 * the chunk's padded voxel block (8000 bytes), posts it, and uploads the result. A chunk keeps its
 * old mesh until the new one arrives; at most one job per chunk is in flight (an edit during it
 * re-queues the chunk), and a result whose job is no longer the chunk's latest request is
 * dropped, so an older mesh never replaces a newer one. Whole-zone builds stay on the main thread
 * (buildAll). Without workers (Node, old WebViews, a worker that failed) the same mesher runs on
 * the main thread within the per-frame budget.
 */
export class ChunkRenderer {
  readonly group = new THREE.Group();
  readonly stats: ChunkStats = {
    chunks: 0, meshedChunks: 0, vertices: 0, triangles: 0, bytes: 0, lastRebuildMs: 0, maxRebuildMs: 0, workers: 0, warmUpLeft: 0, workerFallback: null, mainMs: 0,
    pending: 0, workerMeshes: 0, syncMeshes: 0, staleResults: 0, lastWorkerMs: 0, maxWorkerMs: 0, lastRoundTripMs: 0, maxRoundTripMs: 0, lastLatencyFrames: 0, maxLatencyFrames: 0,
  };
  private readonly meshes: Array<THREE.Mesh | null>;
  private readonly world: VoxelWorld;
  private readonly material: THREE.Material;
  private readonly vertexCounts: Int32Array;
  private readonly byteCounts: Int32Array;
  /** Per chunk: seam hashes of its last mesh (27 slots) and the world revision it was meshed at. */
  private readonly seams: Uint32Array;
  private readonly meshRevision: Float64Array;
  /** Per chunk: id of the latest mesh request (worker job or main-thread mesh). */
  private readonly latest: Float64Array;
  /** Per chunk: world revision of the latest voxel snapshot requested (-1 = never). */
  private readonly snapRevision: Float64Array;
  /** Per chunk: 1 while its latest worker job has not been applied. */
  private readonly inFlight: Uint8Array;
  private pool: MeshPool | null = null;
  private readonly jobs = new Map<number, Job>();
  private readonly batches: Batch[] = [];
  private pendingJobs = 0;
  private readonly freeVoxels: Uint8Array[] = [];
  /** Scratch: squared distance of each dirty chunk to the focus. */
  private readonly dist: Float64Array;
  private readonly focus = new THREE.Vector3();
  private jobSeq = 0;
  private frame = 0;
  private building = false;
  private build: BuildState | null = null;
  private buildChain: Promise<void> = Promise.resolve();
  private settleWaiters: Array<() => void> = [];
  private disposed = false;
  private readonly buildOnWorkers: boolean;
  private readonly workerCount: number;
  private readonly spawn: () => WorkerLike;
  private workersStarted = false;
  private readonly workerStartFrames: number;
  /** Frame at which the workers start (-1 = not scheduled). */
  private startAtFrame = -1;
  private readonly warmUpChunks: number;
  /** Warm-up after the first build: chunks to mesh (densest first, cycled), jobs left, job ids. */
  private warmOrder: number[] = [];
  private warmLeft = -1;
  private readonly warmIds = new Set<number>();
  viewDistance = 96;

  constructor(world: VoxelWorld, material: THREE.Material, options: ChunkRendererOptions = {}) {
    this.world = world;
    this.material = material;
    const n = world.cx * world.cy * world.cz;
    this.meshes = new Array(n).fill(null);
    this.vertexCounts = new Int32Array(n);
    this.byteCounts = new Int32Array(n);
    this.seams = new Uint32Array(n * 27);
    this.meshRevision = new Float64Array(n).fill(-1);
    this.latest = new Float64Array(n);
    this.snapRevision = new Float64Array(n).fill(-1);
    this.inFlight = new Uint8Array(n);
    this.dist = new Float64Array(n);
    this.stats.chunks = n;
    this.group.name = 'terrain';
    this.group.matrixAutoUpdate = false;
    this.buildOnWorkers = options.buildOnWorkers ?? meshBuildOnWorkers();
    this.warmUpChunks = options.warmUp ?? WARM_UP_CHUNKS;
    this.workerStartFrames = options.workerStartFrames ?? WORKER_START_FRAMES;
    this.workerCount = options.workers === undefined || options.workers === 'auto' ? meshWorkerCount() : options.workers;
    this.spawn = options.spawn ?? spawnMeshWorker;
    // The workers start after the first build (nothing competes with loading), or now to share it.
    if (this.buildOnWorkers) this.startWorkers();
  }

  private startWorkers(): void {
    if (this.workersStarted || this.disposed) return;
    this.workersStarted = true;
    if (this.workerCount <= 0) return;
    try {
      this.pool = new MeshPool(this.workerCount, this.spawn, (r) => this.receive(r), (reason) => this.dropPool(reason));
      this.stats.workers = this.pool.size;
    } catch (err) {
      this.stats.workerFallback = `mesh workers could not start: ${String(err)}`;
      console.warn('[deep-down] mesh workers unavailable, meshing on the main thread', err);
    }
  }

  /**
   * Mesh every chunk, yielding to the browser periodically. Progress in [0, 1]. Runs on the main
   * thread in time slices, as before the workers existed (a pooled build was not faster on a
   * loaded CPU, see meshBuildOnWorkers). The mesh workers start `workerStartFrames` frames after
   * the first build and warm up on real chunks (warmUp); until then (and without workers)
   * update() meshes on the main thread.
   */
  buildAll(onProgress?: (p: number) => void, sliceMs = 24): Promise<void> {
    // One build at a time (their bookkeeping is shared).
    const run = this.buildChain.then(() => this.runBuild(onProgress, sliceMs));
    this.buildChain = run.catch(() => undefined);
    return run;
  }

  private async runBuild(onProgress: ((p: number) => void) | undefined, sliceMs: number): Promise<void> {
    if (this.disposed) return;
    const w = this.world;
    const total = w.cx * w.cy * w.cz;
    const build: BuildState = { remaining: total, built: new Uint8Array(total), posted: [], lost: [] };
    this.building = true;
    this.build = build;
    // Alone, the main thread meshes in index order. With buildOnWorkers, the workers take chunks
    // from the front and the main thread from the back; once the queue is empty the main thread
    // steals the jobs the workers have not answered, newest first, so a slow or still-cold worker
    // never holds the build up (its late results are dropped).
    let head = 0;
    let tail = total;
    const pooled = (): MeshPool | null => (this.buildOnWorkers ? this.pool : null);
    const nextForMain = (): number => {
      while (build.lost.length) {
        const i = build.lost.pop()!;
        if (!build.built[i]) return i;
      }
      if (head < tail) return pooled() ? --tail : head++;
      for (const answered of [false, true])
        for (let k = build.posted.length - 1; k >= 0; k--) {
          const job = build.posted[k];
          if (!build.built[job.chunk] && this.latest[job.chunk] === job.id && !!job.result === answered) return job.chunk;
        }
      return -1;
    };
    try {
      while (build.remaining > 0) {
        const pool = pooled();
        if (pool) {
          while (head < tail && pool.inFlight < pool.size * BUILD_JOBS_PER_WORKER) {
            const jobs: Job[] = [];
            const voxels: Uint8Array[] = [];
            for (let k = 0; k < BUILD_BATCH && head < tail; k++) {
              const v = this.takeVoxels();
              jobs.push(this.makeJob(head++, true, v));
              voxels.push(v);
            }
            build.posted.push(...jobs);
            this.postBatch(jobs, voxels);
          }
        }
        const sliceEnd = now() + (pool ? Math.min(sliceMs, BUILD_MAIN_SLICE_MS) : sliceMs);
        let meshed = 0;
        for (let i = nextForMain(); i >= 0; i = now() < sliceEnd ? nextForMain() : -1) {
          this.rebuildIndex(i);
          this.markBuilt(i);
          meshed++;
        }
        if (build.remaining <= 0) break;
        onProgress?.((total - build.remaining) / total);
        if (pooled()) {
          this.checkPool(true);
          // Nothing this thread can take (should not happen): wait for the workers.
          if (!meshed) await this.nextResults(250);
          else await yieldTask();
        } else await new Promise((r) => setTimeout(r, 0));
        if (this.disposed) return;
      }
    } finally {
      this.building = false;
      this.build = null;
    }
    w.dirty.fill(0);
    if (this.warmLeft < 0) {
      this.warmLeft = 0;
      if (this.workersStarted || this.workerStartFrames <= 0) this.startWarmUp();
      else this.startAtFrame = this.frame + this.workerStartFrames;
    }
    onProgress?.(1);
  }

  /** The workers take edits only once started and warm; until then update() meshes on the main
   *  thread, exactly as without workers. */
  private get poolReady(): boolean {
    return this.pool !== null && this.warmLeft === 0 && this.warmIds.size === 0;
  }

  /**
   * Start the workers and warm them up. A fresh worker isolate needs ~10 meshes at 15-90 ms each
   * before V8's optimised mesher runs at ~1 ms, and it re-optimises on data it has not seen
   * (synthetic blocks were not enough: real jobs still took up to ~100 ms). So each worker first
   * meshes the zone's densest chunks once, one job per worker at a time, and the results are
   * dropped; edits stay on the main thread until that is done. Skipped when the workers already
   * took part in the build.
   */
  private startWarmUp(): void {
    this.startWorkers();
    this.warmLeft = 0;
    const pool = this.pool;
    if (!pool || this.buildOnWorkers || this.warmUpChunks <= 0) return;
    const order: number[] = [];
    for (let i = 0; i < this.vertexCounts.length; i++) if (this.vertexCounts[i] > 0) order.push(i);
    if (!order.length) return;
    order.sort((a, b) => this.vertexCounts[b] - this.vertexCounts[a]);
    this.warmOrder = order.slice(0, this.warmUpChunks);
    this.warmLeft = this.warmUpChunks * pool.size;
    this.stats.warmUpLeft = this.warmLeft;
    for (let k = 0; k < pool.size; k++) this.postWarmJob();
  }

  private postWarmJob(): void {
    const pool = this.pool;
    if (!pool || this.warmLeft <= 0 || this.disposed) return;
    const i = this.warmOrder[--this.warmLeft % this.warmOrder.length];
    const [cx, cy, cz] = this.coords(i);
    const id = ++this.jobSeq;
    this.warmIds.add(id);
    pool.post([{ id, cx, cy, cz, voxels: copyPadded(this.world, cx, cy, cz, this.takeVoxels()) }]);
  }

  private markBuilt(i: number): void {
    const b = this.build;
    if (b && !b.built[i]) {
      b.built[i] = 1;
      b.remaining--;
    }
  }

  /** Remesh dirty chunks nearest the focus first, within `budgetMs` of main-thread time.
   *  Returns how many chunks were meshed (or, with workers, posted). */
  update(focus: THREE.Vector3, budgetMs = 4): number {
    const t0 = now();
    this.frame++;
    this.focus.copy(focus);
    if (this.startAtFrame >= 0 && this.frame >= this.startAtFrame) {
      this.startAtFrame = -1;
      this.startWarmUp();
    }
    let n: number;
    if (this.poolReady) {
      this.checkPool(false);
      n = this.poolReady ? this.pump(budgetMs, false) : this.updateSync(focus, budgetMs);
    } else n = this.updateSync(focus, budgetMs);
    this.cull(focus);
    this.stats.mainMs += now() - t0;
    return n;
  }

  /**
   * Mesh every dirty chunk now (ignoring the frame budget) and resolve once all of them, and the
   * neighbours their seams pull in, are applied. For tests, tools and the debug API.
   */
  async flush(): Promise<void> {
    for (let pass = 0; pass < 32 && !this.disposed; pass++) {
      await this.buildChain;
      if (!this.poolReady) {
        this.updateSync(this.focus, Infinity);
        if (!this.world.dirty.includes(1)) return;
        continue;
      }
      this.pump(Infinity, true);
      if (this.pendingJobs === 0) {
        if (!this.world.dirty.includes(1)) return;
        continue;
      }
      await this.settled();
    }
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

  /** Mesh one chunk on the main thread now (supersedes any worker job in flight for it). */
  rebuild(cx: number, cy: number, cz: number): void {
    this.rebuildIndex(this.world.chunkIndex(cx, cy, cz));
  }

  /**
   * Debug check: chunks whose GPU vertex/index data differs from a fresh main-thread mesh of the
   * current world (call after flush()).
   */
  verify(): { checked: number; mismatched: number[] } {
    const w = this.world;
    const mismatched: number[] = [];
    let checked = 0;
    for (let i = 0; i < this.meshes.length; i++) {
      const [cx, cy, cz] = this.coords(i);
      const fresh = meshChunk(w, cx, cy, cz);
      const m = this.meshes[i];
      checked++;
      if (!m) {
        if (fresh.faceCount) mismatched.push(i);
        continue;
      }
      const v = (m.geometry.getAttribute('aGeo') as THREE.InterleavedBufferAttribute).data.array as Uint8Array;
      const idx = m.geometry.index!.array;
      if (!sameBytes(v, fresh.vertices) || idx.length !== fresh.indices.length || !sameBytes(new Uint8Array(idx.buffer, idx.byteOffset, idx.byteLength), new Uint8Array(fresh.indices.buffer, 0, fresh.indices.byteLength))) mismatched.push(i);
    }
    return { checked, mismatched };
  }

  dispose(): void {
    this.disposed = true;
    this.pool?.terminate();
    this.pool = null;
    this.stats.workers = 0;
    this.jobs.clear();
    this.batches.length = 0;
    this.pendingJobs = 0;
    this.stats.pending = 0;
    this.warmIds.clear();
    this.warmLeft = 0;
    this.stats.warmUpLeft = 0;
    this.wakeSettled();
    for (const m of this.meshes) m?.geometry.dispose();
    this.meshes.fill(null);
    this.group.clear();
  }

  // ---------------------------------------------------------------------------------------------
  // Main-thread meshing

  private updateSync(focus: THREE.Vector3, budgetMs: number): number {
    const w = this.world;
    const cs = w.chunkSize;
    const dirty: number[] = [];
    for (let i = 0; i < w.dirty.length; i++) if (w.dirty[i]) dirty.push(i);
    if (dirty.length > 1) {
      const cxy = w.cx * w.cy;
      const dist = (i: number) => {
        const cz = Math.floor(i / cxy);
        const cy = Math.floor((i - cz * cxy) / w.cx);
        const cx = i - cz * cxy - cy * w.cx;
        return (cx * cs + 8 - focus.x) ** 2 + (cy * cs + 8 - focus.y) ** 2 + (cz * cs + 8 - focus.z) ** 2;
      };
      dirty.sort((a, b) => dist(a) - dist(b));
    }
    const start = now();
    let rebuilt = 0;
    for (const i of dirty) {
      // Always rebuild at least the nearest chunk so edits are never left invisible.
      if (rebuilt > 0 && now() - start > budgetMs) break;
      this.rebuildIndex(i);
      rebuilt++;
    }
    return rebuilt;
  }

  private rebuildIndex(i: number): void {
    const w = this.world;
    const [cx, cy, cz] = this.coords(i);
    const t0 = now();
    // Supersede any worker job in flight for this chunk: its result will be dropped.
    this.latest[i] = ++this.jobSeq;
    this.inFlight[i] = 0;
    this.snapRevision[i] = w.revision;
    w.dirty[i] = 0;
    this.applyMesh(i, cx, cy, cz, meshChunk(w, cx, cy, cz), w.revision);
    this.stats.syncMeshes++;
    if (!this.building) this.noteRebuild(now() - t0);
  }

  // ---------------------------------------------------------------------------------------------
  // Worker meshing

  /** Post dirty chunks (nearest first) up to the workers' free capacity. Returns jobs posted. */
  private pump(budgetMs: number, uncapped: boolean): number {
    const pool = this.pool;
    if (!pool || this.building || this.disposed) return 0;
    const free = uncapped ? Infinity : pool.size * JOBS_PER_WORKER - pool.inFlight;
    if (free <= 0) return 0;
    const w = this.world;
    const dirty: number[] = [];
    for (let i = 0; i < w.dirty.length; i++) if (w.dirty[i] && !this.inFlight[i]) dirty.push(i);
    if (!dirty.length) return 0;
    if (dirty.length > 1) {
      const cs = w.chunkSize;
      const f = this.focus;
      const d = this.dist;
      for (const i of dirty) {
        const [cx, cy, cz] = this.coords(i);
        d[i] = (cx * cs + 8 - f.x) ** 2 + (cy * cs + 8 - f.y) ** 2 + (cz * cs + 8 - f.z) ** 2;
      }
      dirty.sort((a, b) => d[a] - d[b]);
    }
    const start = now();
    const jobs: Job[] = [];
    const voxels: Uint8Array[] = [];
    for (const i of dirty) {
      if (jobs.length >= free) break;
      // Always post at least the nearest chunk so edits are never left invisible.
      if (jobs.length > 0 && now() - start > budgetMs) break;
      const v = this.takeVoxels();
      jobs.push(this.makeJob(i, false, v));
      voxels.push(v);
    }
    this.postBatch(jobs, voxels);
    const ms = (now() - start) / jobs.length;
    for (let k = 0; k < jobs.length; k++) this.noteRebuild(ms);
    return jobs.length;
  }

  private takeVoxels(): Uint8Array {
    return this.freeVoxels.pop() ?? new Uint8Array(PADDED_VOXELS);
  }

  private makeJob(i: number, build: boolean, voxels: Uint8Array): Job {
    const w = this.world;
    const [cx, cy, cz] = this.coords(i);
    copyPadded(w, cx, cy, cz, voxels);
    const id = ++this.jobSeq;
    this.latest[i] = id;
    this.inFlight[i] = 1;
    this.snapRevision[i] = w.revision;
    w.dirty[i] = 0;
    return { id, chunk: i, cx, cy, cz, rev: w.revision, t: now(), frame: this.frame, build, batch: null, result: null };
  }

  private postBatch(jobs: Job[], voxels: Uint8Array[]): void {
    if (!jobs.length || !this.pool) return;
    const batch: Batch = { jobs, pending: jobs.length };
    const msgs: MeshJob[] = [];
    for (let k = 0; k < jobs.length; k++) {
      const j = jobs[k];
      j.batch = batch;
      this.jobs.set(j.id, j);
      msgs.push({ id: j.id, cx: j.cx, cy: j.cy, cz: j.cz, voxels: voxels[k] });
    }
    this.batches.push(batch);
    this.pendingJobs += jobs.length;
    this.stats.pending = this.pendingJobs;
    this.pool.post(msgs);
  }

  /** Worker results: complete their batches and apply finished batches in posting order. */
  private receive(results: MeshResult[]): void {
    if (this.disposed) return;
    const t0 = now();
    for (const r of results) {
      if (this.freeVoxels.length < 64 && r.voxels.byteLength === PADDED_VOXELS) this.freeVoxels.push(r.voxels);
      if (this.warmIds.delete(r.id)) {
        this.stats.warmUpLeft--;
        this.postWarmJob();
        continue;
      }
      const job = this.jobs.get(r.id);
      if (!job) continue;
      this.jobs.delete(r.id);
      job.result = r;
      job.batch!.pending--;
      this.stats.lastWorkerMs = r.ms;
      if (r.ms > this.stats.maxWorkerMs) this.stats.maxWorkerMs = r.ms;
    }
    while (this.batches.length && this.batches[0].pending === 0) this.applyBatch(this.batches.shift()!);
    // Refill the workers at once (a seam change may have queued a neighbour).
    if (!this.building && this.poolReady) this.pump(4, false);
    this.stats.mainMs += now() - t0;
    if (this.pendingJobs === 0 || this.building) this.wakeSettled();
  }

  private applyBatch(batch: Batch): void {
    this.pendingJobs -= batch.jobs.length;
    this.stats.pending = this.pendingJobs;
    for (const job of batch.jobs) {
      const i = job.chunk;
      if (job.id !== this.latest[i]) {
        // A newer request (or a main-thread mesh) owns this chunk now.
        this.stats.staleResults++;
        continue;
      }
      this.inFlight[i] = 0;
      const r = job.result!;
      const t0 = now();
      this.applyMesh(i, job.cx, job.cy, job.cz, new ChunkMeshData(r.vertices, r.indices, r.vertexCount, r.faceCount, r.seams), job.rev);
      this.stats.workerMeshes++;
      if (job.build) this.markBuilt(i);
      else {
        this.noteRebuild(now() - t0);
        const s = this.stats;
        s.lastRoundTripMs = now() - job.t;
        s.lastLatencyFrames = this.frame - job.frame + 1;
        if (s.lastRoundTripMs > s.maxRoundTripMs) s.maxRoundTripMs = s.lastRoundTripMs;
        if (s.lastLatencyFrames > s.maxLatencyFrames) s.maxLatencyFrames = s.lastLatencyFrames;
      }
    }
  }

  /** Give up the workers: everything they still owed is meshed on the main thread instead. */
  private dropPool(reason: string): void {
    const pool = this.pool;
    if (!pool) return;
    this.pool = null;
    pool.terminate();
    this.stats.workers = 0;
    this.stats.workerFallback = reason;
    console.warn('[deep-down] mesh workers failed, meshing on the main thread:', reason);
    for (const batch of this.batches)
      for (const job of batch.jobs) {
        if (job.id !== this.latest[job.chunk]) continue;
        this.inFlight[job.chunk] = 0;
        if (job.build && this.build) this.build.lost.push(job.chunk);
        else this.world.dirty[job.chunk] = 1;
      }
    this.jobs.clear();
    this.batches.length = 0;
    this.pendingJobs = 0;
    this.stats.pending = 0;
    this.warmIds.clear();
    this.warmLeft = 0;
    this.stats.warmUpLeft = 0;
    this.wakeSettled();
  }

  /** Workers that stop answering (a WebView that never starts them) count as failed. */
  private checkPool(ignoreFrames: boolean): void {
    const oldest = this.batches[0]?.jobs[0];
    if (!oldest || !this.pool) return;
    if (now() - oldest.t > WATCHDOG_MS && (ignoreFrames || this.frame - oldest.frame > WATCHDOG_FRAMES)) this.dropPool('mesh workers stopped answering');
  }

  private settled(): Promise<void> {
    if (this.pendingJobs === 0) return Promise.resolve();
    return new Promise((resolve) => {
      this.settleWaiters.push(resolve);
      // Guard against workers that stop answering while nobody calls update().
      const tick = () => {
        if (!this.settleWaiters.includes(resolve)) return;
        this.checkPool(true);
        setTimeout(tick, 500);
      };
      setTimeout(tick, 500);
    });
  }

  /** Resolves on the next worker results (or after `ms`). */
  private nextResults(ms: number): Promise<void> {
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.settleWaiters = this.settleWaiters.filter((r) => r !== done);
        resolve();
      }, ms);
      const done = () => {
        clearTimeout(timer);
        resolve();
      };
      this.settleWaiters.push(done);
    });
  }

  private wakeSettled(): void {
    const waiters = this.settleWaiters;
    this.settleWaiters = [];
    for (const r of waiters) r();
  }

  // ---------------------------------------------------------------------------------------------
  // GPU side

  private applyMesh(i: number, cx: number, cy: number, cz: number, data: ChunkMeshData, rev: number): void {
    const w = this.world;
    this.propagateSeams(i, cx, cy, cz, data.seams, rev);
    let mesh = this.meshes[i];
    this.stats.vertices -= this.vertexCounts[i];
    this.stats.triangles -= this.vertexCounts[i] / 2;
    this.stats.bytes -= this.byteCounts[i];
    this.byteCounts[i] = 0;
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
    // One interleaved 16-byte vertex (see mesher.ts): aGeo overlaps 'position' (kept for
    // three.js bookkeeping; the terrain shader reads aGeo).
    const geo = new THREE.BufferGeometry();
    const ib = new THREE.InterleavedBuffer(data.vertices, VERTEX_BYTES);
    geo.setAttribute('position', new THREE.InterleavedBufferAttribute(ib, 3, 0));
    geo.setAttribute('aGeo', new THREE.InterleavedBufferAttribute(ib, 4, 0));
    geo.setAttribute('aData', new THREE.InterleavedBufferAttribute(ib, 4, 4));
    geo.setAttribute('aNb', new THREE.InterleavedBufferAttribute(ib, 4, 8));
    geo.setAttribute('aShape', new THREE.InterleavedBufferAttribute(ib, 4, 12));
    geo.setIndex(new THREE.BufferAttribute(data.indices, 1));
    const cs = w.chunkSize;
    // Sculpted vertices move at most OFFSET_RANGE per axis.
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(cs / 2, cs / 2, cs / 2), (cs * Math.sqrt(3)) / 2 + OFFSET_RANGE * Math.sqrt(3));
    geo.boundingBox = new THREE.Box3(new THREE.Vector3(-OFFSET_RANGE, -OFFSET_RANGE, -OFFSET_RANGE), new THREE.Vector3(cs + OFFSET_RANGE, cs + OFFSET_RANGE, cs + OFFSET_RANGE));
    if (mesh) {
      // The old mesh stays drawn until this moment: swap the geometry, no frame without it.
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
    this.byteCounts[i] = data.vertices.byteLength + data.indices.byteLength;
    this.stats.bytes += this.byteCounts[i];
    this.stats.vertices += data.vertexCount;
    this.stats.triangles += data.vertexCount / 2;
  }

  /**
   * The mesher's smooth normals and AO read two voxels around a corner, one more than
   * VoxelWorld's dirty marking covers: when the data on a seam changed, re-mesh the neighbour
   * that shares it unless its latest mesh (applied or in flight) already saw this state.
   */
  private propagateSeams(i: number, cx: number, cy: number, cz: number, seams: Uint32Array, rev: number): void {
    const w = this.world;
    const prev = this.seams;
    const first = this.meshRevision[i] < 0;
    for (let k = 0; k < 27; k++) {
      if (k === 13) continue;
      const changed = prev[i * 27 + k] !== seams[k];
      prev[i * 27 + k] = seams[k];
      if (!changed || first || this.building) continue;
      const nx = cx + (k % 3) - 1;
      const ny = cy + (((k / 3) | 0) % 3) - 1;
      const nz = cz + ((k / 9) | 0) - 1;
      if (nx < 0 || ny < 0 || nz < 0 || nx >= w.cx || ny >= w.cy || nz >= w.cz) continue;
      const j = w.chunkIndex(nx, ny, nz);
      if (this.snapRevision[j] < rev) w.markDirty(nx, ny, nz);
    }
    this.meshRevision[i] = rev;
  }

  private noteRebuild(ms: number): void {
    this.stats.lastRebuildMs = ms;
    if (ms > this.stats.maxRebuildMs) this.stats.maxRebuildMs = ms;
  }

  private coords(i: number): [number, number, number] {
    const w = this.world;
    const cxy = w.cx * w.cy;
    const cz = Math.floor(i / cxy);
    const cy = Math.floor((i - cz * cxy) / w.cx);
    return [i - cz * cxy - cy * w.cx, cy, cz];
  }
}

function sameBytes(a: ArrayLike<number>, b: ArrayLike<number>): boolean {
  if (a.length !== b.length) return false;
  for (let k = 0; k < a.length; k++) if (a[k] !== b[k]) return false;
  return true;
}
