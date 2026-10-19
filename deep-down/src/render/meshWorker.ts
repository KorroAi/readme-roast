/// <reference lib="webworker" />
import { MESH_OPTIONS, meshPadded } from './mesher';
import { warmUpMesher } from './meshWarmup';
import type { MeshRequest, MeshResponse, MeshResult, WorkerRequest } from './meshPool';

/**
 * Chunk mesh worker (loaded by meshPool.ts). Each request carries padded voxel blocks
 * (copyPadded: the chunk plus its 2-voxel border, 8000 bytes, transferred); the worker runs the
 * same pure mesher and transfers the vertex, index and seam buffers back, plus the voxel block
 * for reuse. The world itself stays on the main thread.
 */
export function handleMeshRequest(req: MeshRequest): { response: MeshResponse; transfer: Transferable[] } {
  // Debug viewer flags (sculpt, wide, relax, AO) are set on the main thread: mirror them.
  if (req.options) Object.assign(MESH_OPTIONS, req.options);
  const results: MeshResult[] = [];
  const transfer: Transferable[] = [];
  for (const job of req.jobs) {
    const t0 = performance.now();
    const m = meshPadded(job.voxels, job.cx, job.cy, job.cz);
    const ms = performance.now() - t0;
    results.push({ id: job.id, vertices: m.vertices, indices: m.indices, vertexCount: m.vertexCount, faceCount: m.faceCount, seams: m.seams, voxels: job.voxels, ms });
    transfer.push(m.vertices.buffer, m.indices.buffer, m.seams.buffer, job.voxels.buffer);
  }
  return { response: { type: 'meshed', results }, transfer };
}

// Only register when running as a worker (unit tests import handleMeshRequest directly).
const scope = globalThis as unknown as { WorkerGlobalScope?: unknown };
if (typeof scope.WorkerGlobalScope === 'function' && globalThis instanceof (scope.WorkerGlobalScope as typeof WorkerGlobalScope)) {
  const ctx = globalThis as unknown as DedicatedWorkerGlobalScope;
  ctx.onmessage = (e: MessageEvent<WorkerRequest>) => {
    try {
      if (e.data.type === 'warm') {
        ctx.postMessage({ type: 'warm', ms: warmUpMesher() } satisfies MeshResponse);
        return;
      }
      const { response, transfer } = handleMeshRequest(e.data);
      ctx.postMessage(response, transfer);
    } catch (err) {
      ctx.postMessage({ type: 'error', message: String((err as Error)?.stack ?? err) } satisfies MeshResponse);
    }
  };
  ctx.postMessage({ type: 'ready' } satisfies MeshResponse);
}
