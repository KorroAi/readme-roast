/// <reference lib="webworker" />
import { generateSlab, type SlabData } from './slab';
import { slabLight } from './slabLight';

/** A slab request: the generator input plus the ring's current rows above it (light context). */
export interface SlabRequest {
  type: 'slab';
  id: number;
  runSeed: number;
  k: number;
  kinds: Uint8Array;
  context: Uint8Array;
}

export interface SlabResult {
  id: number;
  slab: SlabData;
  light: Uint8Array;
  contextLight: Uint8Array;
  ms: number;
}

export type SlabResponse = { type: 'ready' } | { type: 'slab'; result: SlabResult } | { type: 'error'; id: number; message: string };

/** The work of one request (the worker and the main-thread fallback run the same code). */
export function buildSlab(req: Omit<SlabRequest, 'type'>): SlabResult {
  const t0 = typeof performance !== 'undefined' ? performance.now() : 0;
  const slab = generateSlab({ runSeed: req.runSeed, k: req.k, kinds: req.kinds });
  const light = slabLight(slab.blocks, req.context);
  const ms = (typeof performance !== 'undefined' ? performance.now() : 0) - t0;
  return { id: req.id, slab, light: light.slab, contextLight: light.context, ms };
}

const scope = globalThis as unknown as { WorkerGlobalScope?: unknown };
if (typeof scope.WorkerGlobalScope === 'function' && globalThis instanceof (scope.WorkerGlobalScope as typeof WorkerGlobalScope)) {
  const ctx = globalThis as unknown as DedicatedWorkerGlobalScope;
  ctx.onmessage = (e: MessageEvent<SlabRequest>) => {
    const req = e.data;
    try {
      const result = buildSlab(req);
      ctx.postMessage({ type: 'slab', result } satisfies SlabResponse, [result.slab.blocks.buffer, result.light.buffer, result.contextLight.buffer]);
    } catch (err) {
      ctx.postMessage({ type: 'error', id: req.id, message: String((err as Error)?.stack ?? err) } satisfies SlabResponse);
    }
  };
  ctx.postMessage({ type: 'ready' } satisfies SlabResponse);
}
