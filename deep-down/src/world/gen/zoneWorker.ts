/// <reference lib="webworker" />
import { generateWorld } from './generateWorld';
import { LightField } from '../light';
import type { ZoneRequest, ZoneResponse } from './zoneLoader';

// Builds a zone off the main thread: voxels + full light, then transfers the buffers back.
self.onmessage = (e: MessageEvent<ZoneRequest>) => {
  try {
    const t0 = performance.now();
    const layout = generateWorld(e.data.seed);
    const t1 = performance.now();
    (self as unknown as Worker).postMessage({ type: 'progress', phase: 'light' } satisfies ZoneResponse);
    const light = new LightField(layout.world);
    light.computeAll();
    const t2 = performance.now();
    const { world, timings, ...rest } = layout;
    const msg: ZoneResponse = {
      type: 'done',
      layout: rest,
      size: [world.sx, world.sy, world.sz, world.chunkSize],
      blocks: world.blocks,
      light: light.data,
      timings: { generateMs: Math.round(t1 - t0), lightMs: Math.round(t2 - t1), genPhases: timings.phases },
    };
    (self as unknown as Worker).postMessage(msg, [world.blocks.buffer, light.data.buffer]);
  } catch (err) {
    (self as unknown as Worker).postMessage({ type: 'error', message: String((err as Error)?.stack ?? err) } satisfies ZoneResponse);
  }
};
