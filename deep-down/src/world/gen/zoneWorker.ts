/// <reference lib="webworker" />
import { LightField } from '../light';
import { generateFor, materialsFor, type ZoneRequest, type ZoneResponse } from './zoneLoader';

// Builds a zone off the main thread: voxels + full light, then transfers the buffers back.
self.onmessage = (e: MessageEvent<ZoneRequest>) => {
  try {
    const t0 = performance.now();
    const layout = generateFor(e.data);
    const t1 = performance.now();
    (self as unknown as Worker).postMessage({ type: 'progress', phase: 'light' } satisfies ZoneResponse);
    const light = new LightField(layout.world);
    light.computeAll();
    const t2 = performance.now();
    // Terrain materials: the old world's every layer, or a stratum's own (its biomes' layers), painted
    // here so the loading screen never stalls; a stratum switch paints the new stratum's.
    const materials = materialsFor(e.data);
    const t3 = performance.now();
    const { world, timings, ...rest } = layout;
    // A stratum's biomeAt is a function (not cloneable): the loader rebuilds it.
    delete (rest as { biomeAt?: unknown }).biomeAt;
    const msg: ZoneResponse = {
      type: 'done',
      layout: rest,
      size: [world.sx, world.sy, world.sz, world.chunkSize],
      blocks: world.blocks,
      light: light.data,
      materials,
      timings: { generateMs: Math.round(t1 - t0), lightMs: Math.round(t2 - t1), materialsMs: Math.round(t3 - t2), genPhases: timings.phases },
    };
    const transfer: Transferable[] = [world.blocks.buffer, light.data.buffer];
    if (materials) transfer.push(materials.data.buffer);
    (self as unknown as Worker).postMessage(msg, transfer);
  } catch (err) {
    (self as unknown as Worker).postMessage({ type: 'error', message: String((err as Error)?.stack ?? err) } satisfies ZoneResponse);
  }
};
