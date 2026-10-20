import * as THREE from 'three';
import { B, BLOCKS, SOLID } from '../../config/blocks';
import { LightField, LanternField } from '../../world/light';
import { DEAD, RING_SX, RING_SY, RING_SZ, RingWorld, SLAB_ROWS, SLOTS, slotOfSlab, storageRow } from '../../world/descent/RingWorld';
import { SlabLoader } from '../../world/descent/slabLoader';
import { CONTEXT_ROWS, OPEN_CONTEXT_ROWS } from '../../world/descent/slabLight';
import type { SlabResult } from '../../world/descent/slabWorker';
import type { SlabData, VistaSpot } from '../../world/descent/slab';
import { CELL_Z0, CELL_Z1, SHAFT_X0, cellBlock, isHost } from '../../world/descent/slab';
import { kitOf } from '../../world/descent/biomeKits';
import { baseBiome, biomeAt } from '../../idle/config/biomes';
import type { PropSpec } from '../props/types';
import { ChunkRenderer } from '../ChunkRenderer';
import { LightingRig } from '../lighting';
import { TerrainRig } from '../terrainRig';
import { createTerrainMaterial, createTileTexture } from '../terrainMaterial';
import { generateTiles } from '../textures';
import { PropRenderer } from '../props/PropRenderer';
import { CavernProps } from './CavernProps';

/** The shaft cell kinds of slab k (16 rows x 7, CELL values; AIR where dug or broken). */
export type KindsFor = (k: number) => Uint8Array;

const LIGHT_REACH_ROWS = 20;
const SLAB_BYTES = RING_SX * SLAB_ROWS * RING_SZ;

/**
 * The streamed voxel world of the descent: the RingWorld, its light (ring LightField + the dig lantern),
 * terrain meshes, props, and the slab stream (SPEC §6.2). It keeps 9 slabs live around the floor (2 above,
 * the floor's, 6 below) with one dead slot as the light barrier, applies at most one finished slab per frame,
 * and keeps light exactly equal to a fresh compute (`lightCheck`).
 */
export class DescentWorld {
  readonly ring = new RingWorld();
  readonly light: LightField;
  readonly lantern: LanternField;
  readonly rig: LightingRig;
  readonly terrain: TerrainRig;
  readonly material: THREE.ShaderMaterial;
  readonly chunks: ChunkRenderer;
  readonly props: PropRenderer;
  /** Static dressing merged per slab (2 draws a slab, P1). */
  readonly cavernProps: CavernProps;
  readonly loader: SlabLoader;
  readonly group = new THREE.Group();
  /** Live props by id, and per slab. */
  readonly liveProps = new Map<string, PropSpec>();
  private readonly slabProps = new Map<number, string[]>();
  /** Each live slab's generated extras (creatures, motes, liquids, vistas). */
  readonly slabData = new Map<number, SlabData>();
  /** A slab's extras arrived / left (DescentScene adds and drops its creatures and liquids). */
  onSlab: (k: number, slab: SlabData) => void = () => {};
  onDrop: (k: number, slab: SlabData | undefined) => void = () => {};
  private readonly openVistas = new Set<string>();
  private runSeed = 1;
  private first = 0;
  private last = -1;
  /** Slabs requested and not applied yet. */
  private readonly requested = new Set<number>();
  private kindsFor: KindsFor = () => new Uint8Array(SLAB_ROWS * 7);
  stats = { applied: 0, lastApplyMs: 0, maxApplyMs: 0, lastKillMs: 0, maxKillMs: 0, lightMs: 0, slabMs: 0 };

  constructor() {
    this.light = new LightField(this.ring, undefined, { wrapY: true });
    this.lantern = new LanternField(this.ring);
    this.rig = new LightingRig(this.light, this.lantern, RING_SX, RING_SY, RING_SZ);
    this.rig.lightTex.wrapT = THREE.RepeatWrapping;
    this.terrain = new TerrainRig();
    const tiles = createTileTexture(generateTiles());
    this.material = createTerrainMaterial(this.rig.uniforms, tiles, this.terrain.uniforms);
    this.chunks = new ChunkRenderer(this.ring, this.material);
    this.chunks.viewDistance = 400;
    this.props = new PropRenderer(this.rig.uniforms);
    this.props.viewDistance = 120;
    this.cavernProps = new CavernProps(this.rig.uniforms);
    this.loader = new SlabLoader();
    this.group.name = 'world';
    this.group.add(this.chunks.group, this.props.group, this.cavernProps.group);
  }

  get window(): { first: number; last: number } {
    return { first: this.first, last: this.last };
  }

  get pendingSlabs(): number {
    return this.requested.size + this.deferred.length;
  }

  /** Build the window around `floor` now (boot, setDepth, a new run): slabs, light and meshes. */
  async build(runSeed: number, floor: number, kindsFor: KindsFor): Promise<void> {
    this.runSeed = runSeed;
    this.kindsFor = kindsFor;
    this.loader.cancelAll();
    this.requested.clear();
    this.deferred.length = 0;
    this.backlog.length = 0;
    for (let s = 0; s < SLOTS; s++) if (this.ring.slotSlab[s] !== DEAD) this.dropSlab(this.ring.slotSlab[s], false);
    this.ring.blocks.fill(B.BEDROCK);
    const { first, last } = RingWorld.windowFor(floor);
    this.first = first;
    this.last = last;
    const t0 = performance.now();
    for (let k = first; k <= last; k++) {
      const r = this.loader.buildNow(runSeed, k, kindsFor(k), new Uint8Array(SLAB_BYTES * 2));
      this.ring.writeSlab(k, r.slab.blocks, r.slab.openBack);
      this.addProps(k, r.slab.props);
      this.addExtras(k, r.slab);
    }
    this.stats.slabMs = performance.now() - t0;
    const t1 = performance.now();
    this.light.computeAll();
    this.stats.lightMs = performance.now() - t1;
    this.rig.lightTex.needsUpdate = true;
    this.light.clearChangedRows();
    this.ring.markAllDirty();
    await this.chunks.buildAll();
  }

  /**
   * Stream toward `floor`: kill the slabs that left the window, request the new ones, apply at most one
   * finished slab, remesh dirty chunks near the focus, upload light.
   */
  update(floor: number, focus: THREE.Vector3, renderer: THREE.WebGLRenderer): void {
    const { first, last } = RingWorld.windowFor(floor);
    if (first !== this.first || last !== this.last) {
      if (Math.abs(first - this.first) > SLOTS - 2) {
        // A jump beyond the window: the caller rebuilds (build()); keep drawing what we have.
        this.first = first;
        this.last = last;
      } else {
        for (let k = this.first; k < first; k++) this.dropSlab(k, true);
        for (let k = last + 1; k <= this.last; k++) this.dropSlab(k, true);
        this.first = first;
        this.last = last;
      }
    }
    for (let k = this.first; k <= this.last; k++) {
      if (this.ring.hasSlab(k) || this.requested.has(k)) continue;
      // The slab's slot must be dead (its old slab dropped above).
      if (this.ring.slotSlab[slotOfSlab(k)] !== DEAD) continue;
      this.requested.add(k);
      this.loader.request(this.runSeed, k, this.kindsFor(k), this.context(k));
    }
    const later = this.deferred.shift();
    if (later) later();
    const done = later ? [] : this.loader.poll();
    let applied = 0;
    for (const r of done) {
      if (!this.requested.has(r.slab.k) || r.slab.k < this.first || r.slab.k > this.last) continue;
      if (applied > 0) {
        // One slab per frame: keep the rest for the next frames.
        this.backlog.push(r);
        continue;
      }
      this.applySlab(r);
      applied++;
    }
    if (!applied && !later && this.backlog.length) {
      const r = this.backlog.shift()!;
      if (this.requested.has(r.slab.k) && r.slab.k >= this.first && r.slab.k <= this.last) this.applySlab(r);
    }
    this.chunks.update(focus);
    this.uploadLight(renderer);
  }

  private readonly backlog: SlabResult[] = [];
  /** Work split off a slab apply, one item per frame. */
  private readonly deferred: Array<() => void> = [];

  /** The 32 rows above slab k as they are in the ring now (the worker's light context). */
  private context(k: number): Uint8Array {
    const out = new Uint8Array(SLAB_BYTES * 2);
    const tmp = new Uint8Array(SLAB_BYTES);
    for (let j = 0; j < 2; j++) {
      const s = k - 2 + j;
      if (s < 0) tmp.fill(B.AIR);
      else if (this.ring.hasSlab(s)) this.ring.readSlab(s, tmp);
      else tmp.fill(B.BEDROCK);
      // Context layout: x + 64 (r + 32 z), r = 0 the topmost (depth 16k - 32).
      for (let z = 0; z < RING_SZ; z++)
        for (let r = 0; r < SLAB_ROWS; r++)
          out.set(tmp.subarray(RING_SX * (r + SLAB_ROWS * z), RING_SX * (r + SLAB_ROWS * z) + RING_SX), RING_SX * (j * SLAB_ROWS + r + CONTEXT_ROWS * z));
    }
    return out;
  }

  private applySlab(r: SlabResult): void {
    const t0 = performance.now();
    const k = r.slab.k;
    this.requested.delete(k);
    const slot = slotOfSlab(k);
    if (this.ring.slotSlab[slot] !== DEAD) return;
    this.ring.writeSlab(k, r.slab.blocks, r.slab.openBack);
    this.chunks.markStale(slot);
    const y0 = slot * SLAB_ROWS;
    this.light.writeRows(r.light, y0, SLAB_ROWS);
    this.light.mergeMaxRows(r.contextLight, y0 + SLAB_ROWS, CONTEXT_ROWS);
    // The openness band came from the worker (exact when the slot below is the dead bedrock slot, as it is for
    // the window's newest slab); otherwise it is recomputed on a later frame (the slab apply budget, P4).
    if (this.ring.slotSlab[slotOfSlab(k + 1)] === DEAD) this.light.writeOpenRows(r.contextOpen, y0 + SLAB_ROWS, OPEN_CONTEXT_ROWS);
    else this.deferred.push(() => this.light.computeOpennessRows(y0 - 8, SLAB_ROWS + 16));
    this.deferred.push(() => {
      if (this.ring.hasSlab(k)) {
        this.addProps(k, r.slab.props);
        this.addExtras(k, r.slab);
      }
    });
    const ms = performance.now() - t0;
    this.stats.applied++;
    this.stats.lastApplyMs = ms;
    this.stats.maxApplyMs = Math.max(this.stats.maxApplyMs, ms);
  }

  /** Forget slab k: its slot becomes the bedrock barrier, the light below it is rebuilt. */
  private dropSlab(k: number, relight: boolean): void {
    this.requested.delete(k);
    const slot = slotOfSlab(k);
    for (const id of this.slabProps.get(k) ?? []) {
      this.props.remove(id);
      this.liveProps.delete(id);
    }
    this.slabProps.delete(k);
    this.cavernProps.dropSlab(k);
    this.cavernProps.drop(`t${k}`);
    this.slabTaps.delete(k);
    const data = this.slabData.get(k);
    this.slabData.delete(k);
    this.onDrop(k, data);
    if (this.ring.slotSlab[slot] !== k) return;
    const t0 = performance.now();
    this.ring.killSlot(slot);
    this.chunks.markStale(slot);
    if (relight) {
      this.light.clearRows(slot * SLAB_ROWS, SLAB_ROWS);
      // The world rows below the dead slot (lower storage rows) may have held its light.
      this.light.recomputeRows(slot * SLAB_ROWS - LIGHT_REACH_ROWS, LIGHT_REACH_ROWS);
      // ...and the rows above it, when a slab is dropped at the bottom (a jump up).
      this.light.recomputeRows(slot * SLAB_ROWS + SLAB_ROWS, LIGHT_REACH_ROWS);
      this.light.computeOpennessRows(slot * SLAB_ROWS - 8, SLAB_ROWS + 16);
    }
    const ms = performance.now() - t0;
    this.stats.lastKillMs = ms;
    this.stats.maxKillMs = Math.max(this.stats.maxKillMs, ms);
  }

  /** Taken harvests (tappables already used this run): a regenerated slab skips them. */
  taken: (id: string) => boolean = () => false;

  /** Each slab's live tappables (their own batch, rebuilt when one is used up). */
  private readonly slabTaps = new Map<number, PropSpec[]>();

  private addProps(k: number, specs: readonly PropSpec[]): void {
    const ids: string[] = [];
    const batch: PropSpec[] = [];
    const taps: PropSpec[] = [];
    for (const spec of specs) {
      if (CavernProps.batchable(spec)) {
        batch.push(spec);
        continue;
      }
      if (this.taken(spec.id)) continue;
      this.liveProps.set(spec.id, spec);
      taps.push(spec);
      ids.push(spec.id);
    }
    // Tappables are batched too (2 draws a slab, P1); the batch is rebuilt when one leaves.
    this.cavernProps.setSlab(k, batch);
    this.cavernProps.setBatch(`t${k}`, taps);
    this.slabTaps.set(k, taps);
    this.slabProps.set(k, ids);
  }

  private addExtras(k: number, slab: SlabData): void {
    this.slabData.set(k, slab);
    this.onSlab(k, slab);
  }

  /**
   * The Vistas and Reveal Halls whose rows are near the floor: `cb(o, true)` once as one comes within 30 m, `cb(o,
   * false)` once it is 40 m behind (W2.md §3.3: 2D's VistaBackdrop shows its layers behind the opened back wall).
   */
  vistaCheck(floor: number, cb: (o: { id: string; biome: number; y0: number; y1: number; x0: number; x1: number }, enter: boolean) => void, inside?: (id: string) => void): void {
    if (inside)
      for (const data of this.slabData.values()) for (const v of data.vistas) if (floor >= v.top + 2 && floor <= v.bottom - 4) inside(v.id);
    for (const data of this.slabData.values())
      for (const v of data.vistas) {
        const near = floor >= v.top - 30 && floor <= v.bottom + 40;
        if (near && !this.openVistas.has(v.id)) {
          this.openVistas.add(v.id);
          cb(vistaOpening(v), true);
        }
      }
    for (const id of [...this.openVistas]) {
      let v: VistaSpot | null = null;
      for (const data of this.slabData.values()) for (const w of data.vistas) if (w.id === id) v = w;
      if (!v || floor < v.top - 30 || floor > v.bottom + 40) {
        this.openVistas.delete(id);
        cb(v ? vistaOpening(v) : { id, biome: 0, y0: 0, y1: 0, x0: 0, x1: 0 }, false);
      }
    }
  }

  /** Repaint shaft cells the model changed (`cells:change`): their voxels take the new kind's block. @returns any changed. */
  repaintCells(cells: ReadonlyArray<{ depth: number; col: number; kind: number }>): boolean {
    let any = false;
    for (const c of cells) {
      const x = SHAFT_X0 + c.col;
      const y = -c.depth - 1;
      const kit = kitOf(baseBiome(biomeAt(c.depth)));
      for (let z = CELL_Z0; z <= CELL_Z1; z++) {
        const old = this.ring.get(x, y, z);
        if (old === B.AIR) continue;
        const id = cellBlock(c.kind, isHost(old) ? old : kit.hostA, kit);
        if (id === B.AIR || id === old) continue;
        this.setVoxel(x, y, z, id);
        any = true;
      }
    }
    return any;
  }

  /** Remove a prop (a tappable used up). Its emitters go dark. */
  removeProp(id: string): void {
    const spec = this.liveProps.get(id);
    if (!spec) return;
    this.liveProps.delete(id);
    this.props.remove(id);
    for (const [k, taps] of this.slabTaps) {
      const i = taps.indexOf(spec);
      if (i < 0) continue;
      taps.splice(i, 1);
      this.cavernProps.setBatch(`t${k}`, taps);
      break;
    }
    for (const [x, y, z] of spec.emitters) if (this.ring.get(x, y, z) === B.LIGHT_LAMP) this.setVoxel(x, y, z, B.AIR);
  }

  /** Upload the light rows changed since the last frame. */
  uploadLight(renderer: THREE.WebGLRenderer): void {
    this.rig.markLightRows(this.light.changedRows, null);
    this.light.clearChangedRows();
    this.rig.flush(renderer);
  }

  /** Set one voxel (world y) with its light update. @returns the old id. */
  setVoxel(x: number, y: number, z: number, id: number): number {
    const old = this.ring.get(x, y, z);
    if (!this.ring.set(x, y, z, id)) return old;
    this.light.onBlockChanged(x, storageRow(y), z, old);
    return old;
  }

  /**
   * Break shaft cells: their 3 voxels go to air (one light pass for all of them when there are many).
   * @returns the block id each cell's front voxel had (debris colours).
   */
  breakCells(cells: ReadonlyArray<{ row: number; col: number }>): number[] {
    const ids: number[] = [];
    const opened: number[] = [];
    for (const c of cells) {
      const x = SHAFT_X0 + c.col;
      const y = -c.row - 1;
      ids.push(this.ring.get(x, y, CELL_Z1));
      for (let z = CELL_Z0; z <= CELL_Z1; z++) {
        const old = this.ring.get(x, y, z);
        if (old === B.AIR || !this.ring.set(x, y, z, B.AIR)) continue;
        if (SOLID[old] && !isEmitter(old)) opened.push(this.ring.indexW(x, y, z));
        else this.light.onBlockChanged(x, storageRow(y), z, old);
      }
    }
    if (opened.length > 24) this.light.openMany(opened);
    else
      for (const i of opened) {
        const z = Math.floor(i / (RING_SX * RING_SY));
        const rem = i - z * RING_SX * RING_SY;
        const sy = Math.floor(rem / RING_SX);
        this.light.onBlockChanged(rem - sy * RING_SX, sy, z, B.SLATE);
      }
    // Openness equals a fresh compute after every break (W2 MUST 0): an exact local recompute around the cells.
    if (cells.length) {
      let r0 = Infinity;
      let r1 = -Infinity;
      let c0 = 7;
      let c1 = -1;
      for (const c of cells) {
        r0 = Math.min(r0, c.row);
        r1 = Math.max(r1, c.row);
        c0 = Math.min(c0, c.col);
        c1 = Math.max(c1, c.col);
      }
      if (r1 - r0 < 48) {
        const yTop = storageRow(-r0 - 1 + 7);
        this.light.computeOpennessBox(SHAFT_X0 + c0 - 7, SHAFT_X0 + c1 + 7, yTop - (r1 - r0) - 14, yTop, CELL_Z0 - 7, RING_SZ - 1);
      }
    }
    return ids;
  }

  /** Chunks of the slabs around the floor (the frustum: the floor's slab and its neighbours) that have no
   *  mesh since their slab was written. */
  missingNear(floor: number): number {
    const k = Math.floor(floor / SLAB_ROWS);
    const rows: number[] = [];
    for (const j of [k - 1, k, k + 1]) if (j >= 0 && this.ring.hasSlab(j)) rows.push(slotOfSlab(j));
    return this.chunks.missing(rows);
  }

  /** Debug: light texels (RGB) and openness texels (A) that differ from a fresh compute of the live window. */
  lightCheck(): { checked: number; mismatched: number; maxDiff: number; openMismatched: number; openMaxDiff: number } {
    const fresh = new LightField(this.ring, undefined, { wrapY: true });
    fresh.computeAll();
    const a = this.light.data;
    const b = fresh.data;
    let mismatched = 0;
    let maxDiff = 0;
    let openMismatched = 0;
    let openMaxDiff = 0;
    for (let i = 0; i < a.length; i += 4) {
      const d = Math.max(Math.abs(a[i] - b[i]), Math.abs(a[i + 1] - b[i + 1]), Math.abs(a[i + 2] - b[i + 2]));
      if (d) {
        mismatched++;
        if (d > maxDiff) maxDiff = d;
      }
      const o = Math.abs(a[i + 3] - b[i + 3]);
      if (o) {
        openMismatched++;
        if (o > openMaxDiff) openMaxDiff = o;
      }
    }
    return { checked: a.length / 4, mismatched, maxDiff, openMismatched, openMaxDiff };
  }

  dispose(): void {
    this.loader.dispose();
    this.chunks.dispose();
    this.props.dispose();
    this.cavernProps.dispose();
    this.rig.dispose();
    this.terrain.dispose();
    this.material.dispose();
  }
}

const isEmitter = (id: number) => BLOCKS[id]?.emission != null;

const vistaOpening = (v: VistaSpot) => ({ id: v.id, biome: v.biome, y0: -v.top, y1: -v.bottom - 1, x0: v.x0, x1: v.x1 + 1 });
