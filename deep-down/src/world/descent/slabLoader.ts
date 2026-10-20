import { buildSlab, type SlabRequest, type SlabResponse, type SlabResult } from './slabWorker';

/**
 * Slabs off the main thread (SPEC §6.2): one module worker generates a slab and its light; without module
 * workers (Node, old WebViews), or if the worker fails or stops answering, the same code runs on the main
 * thread at most once per frame. Results come back through `poll()` in request order.
 */
export class SlabLoader {
  private worker: Worker | null = null;
  private ready = false;
  private failed: string | null = null;
  private readonly queue: Array<Omit<SlabRequest, 'type'>> = [];
  private readonly posted = new Map<number, { req: Omit<SlabRequest, 'type'>; t: number }>();
  private readonly done: SlabResult[] = [];
  private seq = 0;
  /** Results of slabs built on the main thread (the fallback). */
  syncBuilds = 0;
  workerBuilds = 0;
  lastMs = 0;

  constructor(useWorker = typeof Worker !== 'undefined' && !/[?&]slabworker=0/.test(globalThis.location?.search ?? '')) {
    if (!useWorker) return;
    try {
      this.worker = new Worker(new URL('./slabWorker.ts', import.meta.url), { type: 'module' });
      this.worker.onmessage = (e: MessageEvent<SlabResponse>) => this.receive(e.data);
      this.worker.onerror = (e) => this.fail(`slab worker error: ${e.message}`);
    } catch (err) {
      this.fail(`slab worker could not start: ${String(err)}`);
    }
  }

  get usingWorker(): boolean {
    return this.worker !== null && this.failed === null;
  }

  get pending(): number {
    return this.queue.length + this.posted.size;
  }

  /** Queue slab k. @returns the request id. */
  request(runSeed: number, k: number, kinds: Uint8Array, context: Uint8Array): number {
    const id = ++this.seq;
    this.queue.push({ id, runSeed, k, kinds, context });
    this.pump();
    return id;
  }

  /** Drop everything queued or in flight (a jump regenerates the window). */
  cancelAll(): void {
    this.queue.length = 0;
    this.posted.clear();
    this.done.length = 0;
  }

  /** Finished slabs (oldest first). Builds one queued slab on the main thread when there is no worker. */
  poll(): SlabResult[] {
    if (!this.usingWorker && this.queue.length) {
      const req = this.queue.shift()!;
      const r = buildSlab(req);
      this.syncBuilds++;
      this.lastMs = r.ms;
      this.done.push(r);
    } else {
      // A worker that stops answering for 8 s is given up.
      const now = performance.now();
      for (const [, p] of this.posted) if (now - p.t > 8000) this.fail('slab worker stopped answering');
    }
    if (!this.done.length) return [];
    return this.done.splice(0, this.done.length);
  }

  /** Build a slab now on this thread (boot, jumps). */
  buildNow(runSeed: number, k: number, kinds: Uint8Array, context: Uint8Array): SlabResult {
    this.syncBuilds++;
    return buildSlab({ id: ++this.seq, runSeed, k, kinds, context });
  }

  dispose(): void {
    this.worker?.terminate();
    this.worker = null;
  }

  private pump(): void {
    if (!this.usingWorker || !this.ready) return;
    while (this.queue.length && this.posted.size < 2) {
      const req = this.queue.shift()!;
      this.posted.set(req.id, { req, t: performance.now() });
      const msg: SlabRequest = { type: 'slab', ...req };
      this.worker!.postMessage(msg);
    }
  }

  private receive(msg: SlabResponse): void {
    if (msg.type === 'ready') {
      this.ready = true;
      this.pump();
      return;
    }
    if (msg.type === 'error') {
      this.fail(msg.message);
      return;
    }
    const p = this.posted.get(msg.result.id);
    if (!p) return; // cancelled
    this.posted.delete(msg.result.id);
    this.workerBuilds++;
    this.lastMs = msg.result.ms;
    this.done.push(msg.result);
    this.pump();
  }

  private fail(reason: string): void {
    if (this.failed) return;
    this.failed = reason;
    console.warn('[deep-down] slabs on the main thread:', reason);
    this.worker?.terminate();
    this.worker = null;
    // What the worker owed goes back to the queue (built here, one per frame).
    for (const [, p] of this.posted) this.queue.unshift(p.req);
    this.posted.clear();
  }
}
