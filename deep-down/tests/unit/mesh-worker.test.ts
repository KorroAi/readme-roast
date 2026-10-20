import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { B } from '../../src/config/blocks';
import { VoxelWorld } from '../../src/world/VoxelWorld';
import { ringAt } from './idle/ringFixture';
import { MESH_OPTIONS, PADDED_VOXELS, copyPadded, meshChunk, meshPadded, worldChunkY } from '../../src/render/mesher';
import { handleMeshRequest } from '../../src/render/meshWorker';
import type { MeshRequest, WorkerLike } from '../../src/render/meshPool';
import { ChunkRenderer } from '../../src/render/ChunkRenderer';

// Off-thread chunk meshing (meshWorker.ts, meshPool.ts, ChunkRenderer): the worker path must draw
// exactly what the synchronous mesher makes, never let an older mesh replace a newer one, and
// fall back to the main thread when workers fail.

/**
 * Stands in for a module worker: requests and responses go through structuredClone with their
 * transfer lists (so the sender's buffers are detached, as with a real worker) and are answered by
 * the real worker handler. `auto` answers on the next macrotask; otherwise `step()` answers one
 * request.
 */
class FakeWorker implements WorkerLike {
  onmessage: ((e: MessageEvent) => unknown) | null = null;
  onerror: ((e: ErrorEvent) => unknown) | null = null;
  onmessageerror: ((e: MessageEvent) => unknown) | null = null;
  readonly inbox: MeshRequest[] = [];
  /** Every request received, for inspection. */
  readonly log: MeshRequest[] = [];
  terminated = false;
  constructor(private readonly hub: Hub) {}
  postMessage(message: unknown, transfer: Transferable[]): void {
    if (this.terminated) return;
    const req = structuredClone(message, { transfer }) as MeshRequest;
    this.inbox.push(req);
    this.log.push(req);
    if (this.hub.auto) setTimeout(() => this.step(), 0);
  }
  step(): boolean {
    const req = this.inbox.shift();
    if (!req || this.terminated) return false;
    const { response, transfer } = handleMeshRequest(req);
    this.onmessage?.({ data: structuredClone(response, { transfer }) } as MessageEvent);
    return true;
  }
  terminate(): void {
    this.terminated = true;
    this.inbox.length = 0;
  }
}

class Hub {
  auto = true;
  readonly workers: FakeWorker[] = [];
  spawn = (): WorkerLike => {
    const w = new FakeWorker(this);
    this.workers.push(w);
    return w;
  };
  /** Answer every queued request (and the ones posted while answering). */
  drain(): void {
    while (this.workers.some((w) => w.step()));
  }
}

const focus = new THREE.Vector3(16, 8, 16);

/** Byte equality of two typed arrays (or ArrayBuffers). */
function sameBytes(a: ArrayBufferView | ArrayBufferLike, b: ArrayBufferView | ArrayBufferLike): boolean {
  const u = (x: ArrayBufferView | ArrayBufferLike) => (ArrayBuffer.isView(x) ? new Uint8Array(x.buffer, x.byteOffset, x.byteLength) : new Uint8Array(x));
  const ua = u(a);
  const ub = u(b);
  return ua.length === ub.length && ua.every((v, k) => v === ub[k]);
}

/** 48x32x48 world (18 chunks): rolling natural rock across seams, masonry, timber and crystal. */
function terrain(): VoxelWorld {
  const w = new VoxelWorld(48, 32, 48);
  for (let z = 0; z < 48; z++)
    for (let x = 0; x < 48; x++) {
      const h = 10 + Math.round(3 * Math.sin(x * 0.45) + 2 * Math.cos(z * 0.37 + x * 0.1));
      for (let y = 0; y < h; y++) w.setRaw(x, y, z, (x + z) % 7 === 0 ? B.UMBER : B.SLATE);
    }
  for (let y = 12; y < 22; y++) for (let x = 14; x < 18; x++) for (let z = 15; z < 17; z++) w.setRaw(x, y, z, B.DEEP_SLATE);
  for (let x = 3; x < 7; x++) for (let z = 3; z < 7; z++) for (let y = 14; y < 17; y++) w.setRaw(x, y, z, B.ANCIENT_BRICK);
  for (let x = 24; x < 29; x++) for (let z = 3; z < 6; z++) w.setRaw(x, 16, z, B.PLANK);
  for (let y = 6; y < 9; y++) w.setRaw(31, y, 20, B.CRYSTAL);
  return w;
}

const chunkMesh = (cr: ChunkRenderer, cx: number, cy: number, cz: number) => cr.group.children.find((c) => c.name === `chunk_${cx}_${cy}_${cz}`) as THREE.Mesh | undefined;
const gpuBytes = (m: THREE.Mesh) => Array.from((m.geometry.getAttribute('aGeo') as THREE.InterleavedBufferAttribute).data.array as Uint8Array);

async function built(hub: Hub, w = terrain(), workers = 2): Promise<{ w: VoxelWorld; cr: ChunkRenderer }> {
  // No warm-up here: these tests count the requests each worker receives.
  const cr = new ChunkRenderer(w, new THREE.MeshBasicMaterial(), { workers, spawn: hub.spawn, warmUp: 0, workerStartFrames: 0 });
  await cr.buildAll();
  // Jobs the main thread stole at the end of the build are still answered (and dropped).
  await cr.flush();
  expect(cr.stats.pending).toBe(0);
  hub.auto = false;
  return { w, cr };
}

/** A solid slate voxel on the surface of chunk (cx, 0, cz) of terrain(), away from its seams. */
function surfaceBlock(w: VoxelWorld, cx: number, cz: number): [number, number, number] {
  const x = cx * 16 + 8;
  const z = cz * 16 + 8;
  let y = 31;
  while (y > 0 && w.get(x, y, z) === B.AIR) y--;
  return [x, y, z];
}

let zone: VoxelWorld;
beforeAll(() => {
  // Fixtures from the descent: the ring window around 40 m (the tutorial's grotto, the hatch frame, the hall).
  zone = ringAt(7, 40);
}, 60_000);

afterEach(() => {
  vi.restoreAllMocks();
  MESH_OPTIONS.sculpt = true;
});

describe('mesh worker', () => {
  it('meshes a padded voxel block byte-identically to meshChunk, for every chunk of the generated zone', () => {
    let faces = 0;
    for (let cz = 0; cz < zone.cz; cz++)
      for (let cy = 0; cy < zone.cy; cy++)
        for (let cx = 0; cx < zone.cx; cx++) {
          const a = meshChunk(zone, cx, cy, cz);
          const b = meshPadded(copyPadded(zone, cx, cy, cz), cx, worldChunkY(zone, cy) ?? cy, cz);
          expect(b.faceCount).toBe(a.faceCount);
          expect(b.vertexCount).toBe(a.vertexCount);
          expect(b.indices.constructor).toBe(a.indices.constructor);
          expect(sameBytes(b.vertices, a.vertices), `vertices ${cx},${cy},${cz}`).toBe(true);
          expect(sameBytes(b.indices.buffer, a.indices.buffer), `indices ${cx},${cy},${cz}`).toBe(true);
          expect(Array.from(b.seams)).toEqual(Array.from(a.seams));
          faces += a.faceCount;
        }
    expect(faces).toBeGreaterThan(10_000);
  });

  it('transfers the meshes back through the worker handler and hands the voxel block back for reuse', () => {
    const w = terrain();
    const voxels = copyPadded(w, 1, 0, 1);
    const req = structuredClone({ type: 'mesh', jobs: [{ id: 7, cx: 1, cy: 0, cz: 1, voxels }] } satisfies MeshRequest, { transfer: [voxels.buffer] });
    expect(voxels.byteLength).toBe(0); // transferred, not copied
    const { response, transfer } = handleMeshRequest(req);
    const back = structuredClone(response, { transfer });
    expect(back.type).toBe('meshed');
    if (back.type !== 'meshed') return;
    const r = back.results[0];
    const fresh = meshChunk(w, 1, 0, 1);
    expect(r.id).toBe(7);
    expect(r.faceCount).toBe(fresh.faceCount);
    expect(sameBytes(r.vertices, fresh.vertices)).toBe(true);
    expect(Array.from(r.indices)).toEqual(Array.from(fresh.indices));
    expect(Array.from(r.seams)).toEqual(Array.from(fresh.seams));
    expect(r.voxels.byteLength).toBe(PADDED_VOXELS);
    // Mesher options travel with the request (debug viewer flags).
    const plain = copyPadded(w, 1, 0, 1);
    const flat = handleMeshRequest({ type: 'mesh', jobs: [{ id: 8, cx: 1, cy: 0, cz: 1, voxels: plain }], options: { ...MESH_OPTIONS, sculpt: false } });
    expect(MESH_OPTIONS.sculpt).toBe(false);
    const cubes = meshChunk(w, 1, 0, 1);
    if (flat.response.type !== 'meshed') throw new Error('expected meshes');
    expect(sameBytes(flat.response.results[0].vertices, cubes.vertices)).toBe(true);
    expect(sameBytes(cubes.vertices, fresh.vertices)).toBe(false);
  });
});

describe('ChunkRenderer with mesh workers', () => {
  it('builds on the main thread; the workers start 30 frames later and warm up before taking edits', async () => {
    const hub = new Hub();
    hub.auto = false;
    const w = terrain();
    const cr = new ChunkRenderer(w, new THREE.MeshBasicMaterial(), { workers: 2, spawn: hub.spawn, warmUp: 3 });
    await cr.buildAll();
    expect(cr.stats.workerMeshes).toBe(0);
    expect(cr.stats.syncMeshes).toBe(w.cx * w.cy * w.cz);
    expect(cr.verify().mismatched).toEqual([]);
    for (let k = 0; k < 29; k++) cr.update(focus);
    expect(hub.workers.length).toBe(0); // nothing competes with the rest of loading
    cr.update(focus);
    expect(cr.stats.workers).toBe(2);
    // One warm-up job (a real chunk) per worker at a time.
    expect(hub.workers.map((f) => f.inbox.length)).toEqual([1, 1]);
    // During the warm-up an edit is meshed on the main thread, at once.
    const [x, y, z] = surfaceBlock(w, 1, 1);
    w.set(x, y, z, B.AIR);
    expect(cr.update(focus)).toBe(1);
    expect(gpuBytes(chunkMesh(cr, 1, 0, 1)!)).toEqual(Array.from(meshChunk(w, 1, 0, 1).vertices));
    expect(hub.workers.map((f) => f.inbox.length)).toEqual([1, 1]);
    hub.drain();
    const log = hub.workers.flatMap((f) => f.log);
    expect(log.length).toBe(3 * 2);
    expect(log.every((r) => r.jobs.length === 1)).toBe(true);
    expect(cr.stats.workerMeshes).toBe(0); // warm-up results are dropped, nothing drawn from them
    // Warm: edits go to the workers.
    w.set(x, y - 1, z, B.AIR);
    expect(cr.update(focus)).toBe(1);
    expect(cr.stats.pending).toBe(1);
    hub.drain();
    expect(cr.stats.workerMeshes).toBe(1);
    expect(cr.stats.staleResults).toBe(0);
    expect(cr.verify().mismatched).toEqual([]);
    // A second build (New Game after edits) does not warm up again.
    await cr.buildAll();
    expect(hub.workers.every((f) => f.inbox.length === 0)).toBe(true);
    cr.dispose();
  });

  it('with buildOnWorkers, builds the whole zone through the workers and the main thread, exactly as the synchronous path', async () => {
    const hub = new Hub();
    const cr = new ChunkRenderer(zone, new THREE.MeshBasicMaterial(), { workers: 2, spawn: hub.spawn, buildOnWorkers: true });
    const progress: number[] = [];
    await cr.buildAll((p) => progress.push(p));
    expect(cr.stats.workers).toBe(2);
    expect(cr.stats.workerMeshes).toBeGreaterThan(100);
    // buildAll returns once every chunk has a mesh; jobs the main thread stole at the end are
    // still answered by the workers and dropped.
    const stale = cr.stats.staleResults;
    await cr.flush();
    expect(cr.stats.pending).toBe(0);
    expect(cr.stats.staleResults).toBeGreaterThanOrEqual(stale);
    expect(progress.at(-1)).toBe(1);
    for (let k = 1; k < progress.length; k++) expect(progress[k]).toBeGreaterThanOrEqual(progress[k - 1]);
    const sync = new ChunkRenderer(zone, new THREE.MeshBasicMaterial(), { workers: 0 });
    await sync.buildAll();
    expect(sync.stats.workerMeshes).toBe(0);
    expect(cr.stats.meshedChunks).toBe(sync.stats.meshedChunks);
    expect(cr.stats.vertices).toBe(sync.stats.vertices);
    expect(cr.stats.bytes).toBe(sync.stats.bytes);
    expect(cr.verify().mismatched).toEqual([]);
    expect(zone.dirty.every((d) => d === 0)).toBe(true);
    cr.dispose();
    sync.dispose();
  }, 60_000);

  it('keeps the old mesh visible until the worker result arrives, then draws a fresh mesh of the edit', async () => {
    const hub = new Hub();
    const { w, cr } = await built(hub);
    const [x, y, z] = surfaceBlock(w, 1, 1);
    const before = chunkMesh(cr, 1, 0, 1)!;
    const oldGeo = before.geometry;
    let disposed = false;
    oldGeo.addEventListener('dispose', () => (disposed = true));
    w.set(x, y, z, B.AIR);
    expect(cr.update(focus)).toBe(1);
    expect(cr.stats.pending).toBe(1);
    // In flight: the previous mesh is still the one drawn, intact.
    expect(chunkMesh(cr, 1, 0, 1)).toBe(before);
    expect(before.geometry).toBe(oldGeo);
    expect(disposed).toBe(false);
    hub.drain();
    expect(cr.stats.pending).toBe(0);
    expect(before.geometry).not.toBe(oldGeo);
    expect(disposed).toBe(true);
    expect(gpuBytes(before)).toEqual(Array.from(meshChunk(w, 1, 0, 1).vertices));
    // Posted in one update and applied before the next: drawn one frame later.
    expect(cr.stats.lastLatencyFrames).toBe(1);
    expect(cr.stats.workerMeshes).toBeGreaterThan(0);
    cr.dispose();
  });

  it('re-queues a chunk edited while its job is in flight, so the newer state always lands last', async () => {
    const hub = new Hub();
    const { w, cr } = await built(hub);
    const stale = cr.stats.staleResults;
    const [x, y, z] = surfaceBlock(w, 1, 1);
    w.set(x, y, z, B.AIR);
    cr.update(focus);
    w.set(x, y - 1, z, B.AIR); // second edit while the first job is in flight
    expect(cr.update(focus)).toBe(0); // one job per chunk at a time
    expect(cr.stats.pending).toBe(1);
    // The first result lands (it is the latest request), and the chunk is posted again at once.
    hub.workers.forEach((f) => f.step());
    expect(cr.stats.pending).toBe(1);
    hub.drain();
    expect(cr.stats.pending).toBe(0);
    expect(w.dirty.every((d) => d === 0)).toBe(true);
    expect(gpuBytes(chunkMesh(cr, 1, 0, 1)!)).toEqual(Array.from(meshChunk(w, 1, 0, 1).vertices));
    expect(cr.stats.staleResults).toBe(stale);
    cr.dispose();
  });

  it('drops a result that a newer mesh superseded', async () => {
    const hub = new Hub();
    const { w, cr } = await built(hub);
    const stale = cr.stats.staleResults;
    const [x, y, z] = surfaceBlock(w, 1, 1);
    w.set(x, y, z, B.AIR);
    cr.update(focus);
    w.set(x, y - 1, z, B.AIR);
    cr.rebuild(1, 0, 1); // main-thread mesh of the newer state
    const geo = chunkMesh(cr, 1, 0, 1)!.geometry;
    hub.drain();
    expect(cr.stats.staleResults).toBe(stale + 1);
    expect(chunkMesh(cr, 1, 0, 1)!.geometry).toBe(geo);
    expect(gpuBytes(chunkMesh(cr, 1, 0, 1)!)).toEqual(Array.from(meshChunk(w, 1, 0, 1).vertices));
    cr.dispose();
  });

  it('applies results in posting order, and the chunks of one edit together', async () => {
    const hub = new Hub();
    const { w, cr } = await built(hub);
    // An edit on the corner of four chunks (the x = 32 and z = 32 seams): all four switch in one go.
    let y = 31;
    while (y > 0 && w.get(32, y, 32) === B.AIR) y--;
    const cy = Math.floor(y / 16);
    const corner = [chunkMesh(cr, 1, cy, 1)!, chunkMesh(cr, 2, cy, 1)!, chunkMesh(cr, 1, cy, 2)!, chunkMesh(cr, 2, cy, 2)!];
    const geos = () => corner.map((m) => m.geometry);
    const g0 = geos();
    w.set(32, y, 32, B.AIR);
    // A generous budget: under CPU load four copies can exceed the 4 ms default, and the batch
    // (not the budget) is what this test is about.
    expect(cr.update(focus, 1000)).toBe(4);
    expect(hub.workers.every((f) => f.inbox.length === 1)).toBe(true); // split over both workers
    hub.workers[1].step();
    expect(geos()).toEqual(g0); // half the batch is not enough
    // A later edit elsewhere, answered first, still waits for the earlier batch.
    const [fx, fy, fz] = surfaceBlock(w, 0, 0);
    w.set(fx, fy, fz, B.AIR);
    const far = chunkMesh(cr, 0, 0, 0)!.geometry;
    expect(cr.update(focus)).toBe(1);
    expect(hub.workers[1].inbox.length).toBe(1); // the idle worker took it
    hub.workers[1].step();
    expect(chunkMesh(cr, 0, 0, 0)!.geometry).toBe(far);
    expect(geos()).toEqual(g0);
    hub.workers[0].step();
    const g1 = geos();
    for (let k = 0; k < 4; k++) expect(g1[k]).not.toBe(g0[k]);
    expect(chunkMesh(cr, 0, 0, 0)!.geometry).not.toBe(far);
    hub.drain();
    await cr.flush();
    expect(cr.verify().mismatched).toEqual([]);
    cr.dispose();
  });

  it('re-meshes a neighbour whose seam changed, from worker results', async () => {
    const hub = new Hub();
    const w = new VoxelWorld(32, 16, 16);
    for (let x = 0; x < 32; x++) for (let z = 0; z < 16; z++) for (let y = 0; y < 6; y++) w.setRaw(x, y, z, B.SLATE);
    for (let z = 4; z < 12; z++) for (let y = 6; y < 9; y++) w.setRaw(17, y, z, B.SLATE); // local x = 1 of chunk 1
    const { cr } = await built(hub, w);
    for (let z = 4; z < 12; z++) for (let y = 6; y < 9; y++) w.set(17, y, z, B.AIR);
    expect(w.dirty[w.chunkIndex(0, 0, 0)]).toBe(0);
    cr.update(new THREE.Vector3(16, 8, 8));
    expect(cr.stats.pending).toBe(1); // chunk 1 only
    hub.workers.forEach((f) => f.step());
    // Chunk 1's result showed its seam toward chunk 0 changed: chunk 0 was posted right away.
    expect(cr.stats.pending).toBe(1);
    hub.drain();
    expect(cr.stats.pending).toBe(0);
    expect(w.dirty.every((d) => d === 0)).toBe(true);
    expect(gpuBytes(chunkMesh(cr, 0, 0, 0)!)).toEqual(Array.from(meshChunk(w, 0, 0, 0).vertices));
    expect(cr.verify().mismatched).toEqual([]);
    cr.dispose();
  });

  it('removes the mesh of a chunk that becomes empty', async () => {
    const hub = new Hub();
    const w = new VoxelWorld(32, 16, 16);
    for (let x = 20; x < 24; x++) for (let y = 4; y < 8; y++) for (let z = 4; z < 8; z++) w.setRaw(x, y, z, B.SLATE);
    const { cr } = await built(hub, w);
    expect(cr.stats.meshedChunks).toBe(1);
    for (let x = 20; x < 24; x++) for (let y = 4; y < 8; y++) for (let z = 4; z < 8; z++) w.set(x, y, z, B.AIR);
    cr.update(focus);
    expect(chunkMesh(cr, 1, 0, 0)).toBeDefined(); // still drawn while in flight
    hub.drain();
    expect(chunkMesh(cr, 1, 0, 0)).toBeUndefined();
    expect(cr.stats.meshedChunks).toBe(0);
    expect(cr.stats.vertices).toBe(0);
    expect(cr.stats.bytes).toBe(0);
    cr.dispose();
  });

  it('falls back to the main thread when a worker fails, re-meshing what it owed', async () => {
    const hub = new Hub();
    const { w, cr } = await built(hub);
    const [x, y, z] = surfaceBlock(w, 1, 1);
    w.set(x, y, z, B.AIR);
    cr.update(focus);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    hub.workers[0].onerror?.({ message: 'boom' } as ErrorEvent);
    expect(cr.stats.workers).toBe(0);
    expect(cr.stats.workerFallback).toMatch(/boom/);
    expect(hub.workers.every((f) => f.terminated)).toBe(true);
    expect(w.dirty[w.chunkIndex(1, 0, 1)]).toBe(1); // the lost job is queued again
    cr.update(focus);
    expect(gpuBytes(chunkMesh(cr, 1, 0, 1)!)).toEqual(Array.from(meshChunk(w, 1, 0, 1).vertices));
    // Later edits mesh synchronously within the frame.
    w.set(x, y - 1, z, B.AIR);
    cr.update(focus);
    expect(gpuBytes(chunkMesh(cr, 1, 0, 1)!)).toEqual(Array.from(meshChunk(w, 1, 0, 1).vertices));
    cr.dispose();
  });

  it('falls back when a worker cannot be constructed, or a build loses its workers half way', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const w = terrain();
    const cr = new ChunkRenderer(w, new THREE.MeshBasicMaterial(), {
      workers: 2,
      workerStartFrames: 0,
      spawn: () => {
        throw new Error('no module workers');
      },
    });
    expect(cr.stats.workers).toBe(0);
    expect(cr.stats.workerFallback).toBeNull(); // workers start after the first build
    await cr.buildAll();
    expect(cr.stats.workers).toBe(0);
    expect(cr.stats.workerFallback).toMatch(/no module workers/);
    expect(cr.verify().mismatched).toEqual([]);
    const [x, y, z] = surfaceBlock(w, 1, 1);
    w.set(x, y, z, B.AIR);
    cr.update(focus); // meshed on the main thread within the frame
    expect(gpuBytes(chunkMesh(cr, 1, 0, 1)!)).toEqual(Array.from(meshChunk(w, 1, 0, 1).vertices));
    cr.dispose();
    // A worker that dies during buildAll: what it owed is meshed on the main thread.
    const hub = new Hub();
    hub.auto = false;
    const cr2 = new ChunkRenderer(w, new THREE.MeshBasicMaterial(), { workers: 2, spawn: hub.spawn, buildOnWorkers: true });
    const build = cr2.buildAll();
    await new Promise((r) => setTimeout(r, 0));
    expect(hub.workers.some((f) => f.inbox.length > 0)).toBe(true);
    hub.workers[1].onerror?.({ message: 'died' } as ErrorEvent);
    await build;
    expect(cr2.stats.workers).toBe(0);
    expect(cr2.verify().mismatched).toEqual([]);
    cr2.dispose();
  });

  it('gives up on workers that stop answering', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const hub = new Hub();
    const { w, cr } = await built(hub);
    const [x, y, z] = surfaceBlock(w, 1, 1);
    w.set(x, y, z, B.AIR);
    cr.update(focus);
    const t = performance.now();
    vi.spyOn(performance, 'now').mockImplementation(() => t + 9000);
    for (let k = 0; k < 70 && cr.stats.workers; k++) cr.update(focus);
    expect(cr.stats.workers).toBe(0);
    expect(cr.stats.workerFallback).toMatch(/stopped answering/);
    cr.update(focus);
    expect(gpuBytes(chunkMesh(cr, 1, 0, 1)!)).toEqual(Array.from(meshChunk(w, 1, 0, 1).vertices));
    cr.dispose();
  });

  it('flush() resolves once every dirty chunk and its seam neighbours are drawn', async () => {
    const hub = new Hub();
    const { w, cr } = await built(hub);
    hub.auto = true;
    for (let k = 0; k < 6; k++) {
      const [x, y, z] = surfaceBlock(w, k % 3, (k * 2) % 3);
      w.set(x, y, z, B.AIR);
      w.set(x + 7, y, z, B.AIR); // next to the x seam
    }
    await cr.flush();
    expect(cr.stats.pending).toBe(0);
    expect(w.dirty.every((d) => d === 0)).toBe(true);
    expect(cr.verify().mismatched).toEqual([]);
    cr.dispose();
  });

  it('sends the mesher options to the workers (debug viewer flags)', async () => {
    const hub = new Hub();
    MESH_OPTIONS.sculpt = false;
    const w = terrain();
    const cr = new ChunkRenderer(w, new THREE.MeshBasicMaterial(), { workers: 2, spawn: hub.spawn, buildOnWorkers: true });
    await cr.buildAll();
    expect(cr.stats.workerMeshes).toBeGreaterThan(0);
    // The first request to each worker carries the options; later ones only when they change.
    for (const f of hub.workers) {
      expect(f.log[0].options?.sculpt).toBe(false);
      expect(f.log.slice(1).every((r) => r.options === undefined)).toBe(true);
    }
    expect(cr.verify().mismatched).toEqual([]); // verify meshes with sculpt = false too
    MESH_OPTIONS.sculpt = true;
    expect(cr.verify().mismatched.length).toBeGreaterThan(0);
    const [x, y, z] = surfaceBlock(w, 1, 1);
    w.set(x, y, z, B.AIR);
    hub.auto = false;
    cr.update(focus);
    const sent = hub.workers.flatMap((f) => f.inbox);
    expect(sent.length).toBe(1);
    expect(sent[0].options?.sculpt).toBe(true);
    hub.drain();
    expect(gpuBytes(chunkMesh(cr, 1, 0, 1)!)).toEqual(Array.from(meshChunk(w, 1, 0, 1).vertices));
    cr.dispose();
  });

  it('dispose terminates the workers and ignores results still on their way', async () => {
    const hub = new Hub();
    const { w, cr } = await built(hub);
    const [x, y, z] = surfaceBlock(w, 1, 1);
    w.set(x, y, z, B.AIR);
    cr.update(focus);
    const late = hub.workers.map((f) => ({ f, req: f.inbox[0] }));
    cr.dispose();
    expect(hub.workers.every((f) => f.terminated)).toBe(true);
    expect(cr.group.children.length).toBe(0);
    for (const { f, req } of late) {
      if (!req) continue;
      // A message already queued before terminate() must not resurrect anything.
      expect(f.onmessage).toBeNull();
      const { response } = handleMeshRequest(req);
      expect(() => f.onmessage?.({ data: response } as MessageEvent)).not.toThrow();
    }
    expect(cr.group.children.length).toBe(0);
    await cr.flush(); // resolves at once
  });
});
