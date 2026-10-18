import { generateWorld } from './generateWorld';
import type { WorldLayout } from './types';
import { VoxelWorld } from '../VoxelWorld';
import { LightField } from '../light';

export interface ZoneRequest {
  seed: number;
}

export type ZoneResponse =
  | { type: 'progress'; phase: 'light' }
  | { type: 'error'; message: string }
  | {
      type: 'done';
      layout: Omit<WorldLayout, 'world'>;
      size: [number, number, number, number];
      blocks: Uint8Array;
      light: Uint8Array;
      timings: { generateMs: number; lightMs: number; genPhases: Record<string, number> };
    };

export interface LoadedZone {
  layout: WorldLayout;
  light: LightField;
  timings: Record<string, number>;
  usedWorker: boolean;
}

/**
 * Generate a zone and its light. Prefers a module Web Worker so the loading screen stays
 * responsive on phones; falls back to the main thread where workers are unavailable
 * (Node tests, very old WebViews) or fail.
 */
export async function loadZone(seed: number, onPhase: (phase: 'carve' | 'light') => void): Promise<LoadedZone> {
  if (typeof Worker !== 'undefined') {
    try {
      return await loadInWorker(seed, onPhase);
    } catch (err) {
      console.warn('[deep-down] zone worker unavailable, generating on the main thread', err);
    }
  }
  onPhase('carve');
  const t0 = performance.now();
  const layout = generateWorld(seed);
  const t1 = performance.now();
  onPhase('light');
  await new Promise((r) => setTimeout(r, 0));
  const light = new LightField(layout.world);
  light.computeAll();
  return { layout, light, timings: { generateMs: Math.round(t1 - t0), lightMs: Math.round(performance.now() - t1) }, usedWorker: false };
}

function loadInWorker(seed: number, onPhase: (phase: 'carve' | 'light') => void): Promise<LoadedZone> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./zoneWorker.ts', import.meta.url), { type: 'module' });
    const timeout = setTimeout(() => {
      worker.terminate();
      reject(new Error('zone worker timed out'));
    }, 60_000);
    onPhase('carve');
    worker.onerror = (e) => {
      clearTimeout(timeout);
      worker.terminate();
      reject(new Error(e.message || 'zone worker failed'));
    };
    worker.onmessage = (e: MessageEvent<ZoneResponse>) => {
      const m = e.data;
      if (m.type === 'progress') {
        onPhase(m.phase);
        return;
      }
      clearTimeout(timeout);
      worker.terminate();
      if (m.type === 'error') {
        reject(new Error(m.message));
        return;
      }
      const [sx, sy, sz, cs] = m.size;
      const world = new VoxelWorld(sx, sy, sz, cs, m.blocks);
      const layout = { ...m.layout, world } as WorldLayout;
      const light = new LightField(world, m.light);
      resolve({ layout, light, timings: { generateMs: m.timings.generateMs, lightMs: m.timings.lightMs }, usedWorker: true });
    };
    worker.postMessage({ seed } satisfies ZoneRequest);
  });
}
