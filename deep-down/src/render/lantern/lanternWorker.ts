// The Lantern Voxel mesh worker: runs meshLantern off the main thread (one padded chunk in, typed arrays out,
// transferred, never copied).

import { meshLantern } from './mesher';

interface Job {
  id: number;
  pad: Uint8Array;
  ox: number;
  oy: number;
  oz: number;
}

const ctx = self as unknown as { onmessage: ((e: MessageEvent<Job>) => void) | null; postMessage(m: unknown, t: Transferable[]): void };
ctx.onmessage = (e: MessageEvent<Job>) => {
  const j = e.data;
  const t0 = performance.now();
  const m = meshLantern(j.pad, j.ox, j.oy, j.oz);
  ctx.postMessage(
    { id: j.id, ms: performance.now() - t0, mesh: m, pad: j.pad },
    [m.positions.buffer, m.normals.buffer, m.mat.buffer, m.mat2.buffer, m.indices.buffer, m.indicesFar.buffer, m.nuggets.buffer, j.pad.buffer],
  );
};
