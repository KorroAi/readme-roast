import { MESH_OPTIONS } from './mesher';

/** One chunk to mesh: its padded voxel block (copyPadded, transferred to the worker). */
export interface MeshJob {
  id: number;
  cx: number;
  cy: number;
  cz: number;
  voxels: Uint8Array;
}

export interface MeshRequest {
  type: 'mesh';
  jobs: MeshJob[];
  /** Mesher options, sent when they changed since the last request to this worker. */
  options?: typeof MESH_OPTIONS;
}

/** A finished chunk mesh (the fields of ChunkMeshData), plus the voxel block handed back for reuse. */
export interface MeshResult {
  id: number;
  vertices: Uint8Array;
  indices: Uint16Array | Uint32Array;
  vertexCount: number;
  faceCount: number;
  seams: Uint32Array;
  voxels: Uint8Array;
  /** Worker-side mesh time, ms. */
  ms: number;
}

/** Asks a fresh worker to compile the mesher on synthetic chunks (meshWarmup.ts). */
export interface WarmRequest {
  type: 'warm';
}

export type WorkerRequest = MeshRequest | WarmRequest;

export type MeshResponse = { type: 'ready' } | { type: 'warm'; ms: number } | { type: 'meshed'; results: MeshResult[] } | { type: 'error'; message: string };

/** The part of a Worker the pool uses (unit tests pass a fake). */
export interface WorkerLike {
  onmessage: ((e: MessageEvent) => unknown) | null;
  onerror: ((e: ErrorEvent) => unknown) | null;
  onmessageerror: ((e: MessageEvent) => unknown) | null;
  postMessage(message: unknown, transfer: Transferable[]): void;
  terminate(): void;
}

/** The module worker, bundled by Vite as its own file (dist/assets/meshWorker-*.js). */
function createMeshWorker(): Worker {
  return new Worker(new URL('./meshWorker.ts', import.meta.url), { type: 'module' });
}

/** Workers started ahead of time by prewarmMeshWorkers, with the error they hit, if any. */
const spares: Array<{ worker: Worker; failed: string | null }> = [];

/**
 * Start the mesh workers early (the game calls this before generating the zone) and let them
 * compile the mesher on synthetic chunks, so the zone's first meshing runs at full speed instead
 * of paying V8's warm-up in every fresh isolate. The next pool adopts them. Skipped below four
 * hardware threads, where the warm-up would take CPU from the zone worker (the pool then starts
 * its workers cold, and buildAll's work stealing keeps that from slowing the build).
 */
export function prewarmMeshWorkers(count = meshWorkerCount()): void {
  if (typeof navigator === 'undefined' || (navigator.hardwareConcurrency || 2) < 4) return;
  for (let k = spares.length; k < count; k++) {
    let worker: Worker;
    try {
      worker = createMeshWorker();
    } catch {
      return; // the pool will find out (and fall back) on its own
    }
    const spare = { worker, failed: null as string | null };
    worker.onerror = (e) => {
      e.preventDefault(); // handled: the pool falls back to the main thread
      spare.failed = e.message || 'failed to load or run';
    };
    worker.onmessageerror = () => (spare.failed = 'message could not be deserialized');
    worker.onmessage = (e: MessageEvent<MeshResponse>) => {
      if (e.data.type === 'error') spare.failed = e.data.message;
    };
    worker.postMessage({ type: 'warm' } satisfies WarmRequest);
    spares.push(spare);
  }
}

/** A prewarmed worker if one is waiting, else a new one. Throws if it cannot run. */
export function spawnMeshWorker(): WorkerLike {
  const spare = spares.shift();
  if (!spare) return createMeshWorker();
  if (spare.failed) {
    spare.worker.terminate();
    throw new Error(`mesh worker failed to start: ${spare.failed}`);
  }
  return spare.worker;
}

/**
 * How many mesh workers to start: 0 where module workers are unavailable (Node, very old
 * WebViews), else 2 with three or more hardware threads and 1 below that (the main thread uploads
 * and renders). `?meshworkers=N` overrides it (0 = mesh on the main thread, for A/B and fallback
 * checks).
 */
export function meshWorkerCount(): number {
  if (typeof Worker === 'undefined') return 0;
  let flag: string | null = null;
  try {
    flag = new URLSearchParams(globalThis.location?.search ?? '').get('meshworkers');
  } catch {
    flag = null;
  }
  if (flag !== null && flag !== '') {
    const n = Math.floor(Number(flag));
    return Number.isFinite(n) ? Math.max(0, Math.min(4, n)) : 0;
  }
  const hc = typeof navigator !== 'undefined' && navigator.hardwareConcurrency ? navigator.hardwareConcurrency : 2;
  return hc >= 3 ? 2 : 1;
}

interface Slot {
  worker: WorkerLike;
  /** Jobs posted to this worker whose results have not come back. */
  jobs: number;
  /** Job count of each request in flight, oldest first (a worker answers its requests in order). */
  requests: number[];
  /** MESH_OPTIONS as last sent to this worker. */
  options: string;
}

/**
 * A small pool of mesh workers. Jobs go to the least-loaded worker; results come back through
 * `onResults` in the order each worker received them. Any error (the worker failed to load or
 * start, a job threw, a message could not be cloned) terminates every worker and calls
 * `onFailure` once; the owner then meshes on the main thread.
 */
export class MeshPool {
  readonly size: number;
  /** Why the pool stopped (null while it works). */
  failed: string | null = null;
  private readonly slots: Slot[] = [];
  private closed = false;

  /** Throws if a worker cannot be constructed (the caller falls back to the main thread). */
  constructor(
    count: number,
    spawn: () => WorkerLike,
    private readonly onResults: (results: MeshResult[]) => void,
    private readonly onFailure: (reason: string) => void,
  ) {
    try {
      for (let k = 0; k < count; k++) {
        const slot: Slot = { worker: spawn(), jobs: 0, requests: [], options: '' };
        slot.worker.onmessage = (e) => this.receive(slot, e.data as MeshResponse);
        slot.worker.onerror = (e) => {
          e?.preventDefault?.(); // handled: the owner falls back to the main thread
          this.fail(`mesh worker error: ${e?.message || 'failed to load or run'}`);
        };
        slot.worker.onmessageerror = () => this.fail('mesh worker message could not be deserialized');
        this.slots.push(slot);
      }
    } catch (err) {
      this.terminate();
      throw err;
    }
    this.size = this.slots.length;
  }

  /** Jobs posted whose results have not come back yet. */
  get inFlight(): number {
    let n = 0;
    for (const s of this.slots) n += s.jobs;
    return n;
  }

  /** Post jobs, spread over the workers by load. Their voxel buffers are transferred (detached here). */
  post(jobs: MeshJob[]): void {
    if (this.closed || !jobs.length) return;
    const options = JSON.stringify(MESH_OPTIONS);
    const per: MeshJob[][] = this.slots.map(() => []);
    const load = this.slots.map((s) => s.jobs);
    for (const job of jobs) {
      let best = 0;
      for (let k = 1; k < load.length; k++) if (load[k] < load[best]) best = k;
      per[best].push(job);
      load[best]++;
    }
    for (let k = 0; k < this.slots.length; k++) {
      const part = per[k];
      if (!part.length) continue;
      const slot = this.slots[k];
      const msg: MeshRequest = { type: 'mesh', jobs: part };
      if (slot.options !== options) {
        msg.options = { ...MESH_OPTIONS };
        slot.options = options;
      }
      try {
        slot.worker.postMessage(msg, part.map((j) => j.voxels.buffer));
      } catch (err) {
        this.fail(`mesh worker post failed: ${String(err)}`);
        return;
      }
      slot.jobs += part.length;
      slot.requests.push(part.length);
    }
  }

  terminate(): void {
    this.closed = true;
    for (const s of this.slots) {
      s.worker.onmessage = null;
      s.worker.onerror = null;
      s.worker.onmessageerror = null;
      s.worker.terminate();
      s.jobs = 0;
      s.requests.length = 0;
    }
  }

  private receive(slot: Slot, m: MeshResponse): void {
    if (this.closed) return;
    if (m.type === 'ready' || m.type === 'warm') return;
    if (m.type === 'error') {
      this.fail(`mesh worker job failed: ${m.message}`);
      return;
    }
    slot.jobs -= slot.requests.shift() ?? m.results.length;
    this.onResults(m.results);
  }

  private fail(reason: string): void {
    if (this.closed) return;
    this.failed = reason;
    this.terminate();
    this.onFailure(reason);
  }
}
