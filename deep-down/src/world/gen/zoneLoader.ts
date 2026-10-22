import { generateWorld } from './generateWorld';
import type { WorldLayout } from './types';
import { VoxelWorld } from '../VoxelWorld';
import { LightField } from '../light';
import { generateMaterials, type MaterialAtlas } from '../../render/materials';
import { generateStratum } from './strata/generateStratum';
import { withBiomeAt, type StratumLayout } from './strata/types';
import { worldGen } from '../../config/balance';
import { stratumDef } from '../../config/biomes';

/**
 * `stratum` set: one stratum of the strata generator (round 3), seeded by (seed, stratum).
 * `materials: false` skips painting the terrain materials (a stratum switch reuses them).
 */
export interface ZoneRequest {
  seed: number;
  stratum?: number;
  materials?: boolean;
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
      materials: MaterialAtlas | null;
      timings: { generateMs: number; lightMs: number; materialsMs: number; genPhases: Record<string, number> };
    };

export interface LoadedZone {
  layout: WorldLayout;
  light: LightField;
  /** Painted terrain material layers (see render/materials); null when the request skipped them. */
  materials: MaterialAtlas | null;
  timings: Record<string, number>;
  usedWorker: boolean;
}

/**
 * The terrain materials a request paints: none (`materials: false`), every layer (the old world), or a
 * stratum's own (its two biomes' layers, plus the Heart's in VI; VIS's generateMaterials({ biomes })):
 * about 0.8 s instead of 2-3 s, and a stratum switch repaints for the new stratum.
 */
export function materialsFor(req: ZoneRequest): MaterialAtlas | null {
  if (req.materials === false) return null;
  if (!req.stratum) return generateMaterials();
  const biomes: string[] = [...stratumDef(req.stratum).biomes];
  if (req.stratum === 6) biomes.push('heart');
  return generateMaterials({ biomes });
}

/** The layout of a request: a stratum, or the old hand-made world. */
export function generateFor(req: ZoneRequest): WorldLayout & { timings: { phases: Record<string, number> } } {
  return req.stratum ? generateStratum(req.seed, req.stratum) : generateWorld(req.seed);
}

/**
 * Generate a zone and its light. Prefers a module Web Worker so the loading screen stays
 * responsive on phones; falls back to the main thread where workers are unavailable
 * (Node tests, very old WebViews) or fail.
 */
export async function loadZone(seed: number, onPhase: (phase: 'carve' | 'light') => void, stratum?: number, materials = true): Promise<LoadedZone> {
  const req: ZoneRequest = { seed, stratum, materials };
  if (typeof Worker !== 'undefined') {
    try {
      return await loadInWorker(req, onPhase);
    } catch (err) {
      console.warn('[deep-down] zone worker unavailable, generating on the main thread', err);
    }
  }
  onPhase('carve');
  const t0 = performance.now();
  const layout = generateFor(req);
  const t1 = performance.now();
  onPhase('light');
  await new Promise((r) => setTimeout(r, 0));
  const light = new LightField(layout.world);
  light.computeAll();
  const t2 = performance.now();
  const mats = materialsFor(req);
  if (stratum) withBiomeAt(layout as unknown as StratumLayout);
  return { layout, light, materials: mats, timings: { generateMs: Math.round(t1 - t0), lightMs: Math.round(t2 - t1), materialsMs: Math.round(performance.now() - t2) }, usedWorker: false };
}

/**
 * Round 3: the zone the game boots into. WORLD_GEN 'strata' (the default) loads stratum `stratum` of the
 * expedition `seed`; 'legacy' (`?gen=legacy`, or `gen` for tests) the old hand-made world.
 */
export function loadBootZone(seed: number, stratum: number, onPhase: (phase: 'carve' | 'light') => void, gen: 'legacy' | 'strata' = worldGen()): Promise<LoadedZone> {
  return gen === 'strata' ? loadZone(seed, onPhase, stratum, true) : loadZone(seed, onPhase);
}

/** A stratum switch: its voxels, light and its own material layers (painted in the worker). `onProgress` 0..1. */
export function loadStratumZone(seed: number, stratum: number, onProgress: (p: number) => void): Promise<LoadedZone> {
  return loadZone(seed, (phase) => onProgress(phase === 'carve' ? 0.1 : 0.7), stratum, true);
}

function loadInWorker(req: ZoneRequest, onPhase: (phase: 'carve' | 'light') => void): Promise<LoadedZone> {
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
      if (req.stratum) withBiomeAt(layout as StratumLayout);
      const light = new LightField(world, m.light);
      resolve({ layout, light, materials: m.materials, timings: { generateMs: m.timings.generateMs, lightMs: m.timings.lightMs, materialsMs: m.timings.materialsMs }, usedWorker: true });
    };
    worker.postMessage(req satisfies ZoneRequest);
  });
}
