// The world of the first-person hybrid, as one object (BUILD §3.2; W1-LEAD §3 and §5): the voxel ring of 0.5 m
// voxels, its light volume (the irradiance source 1E samples), the slab stream (generated and lit in a worker ahead of
// the player), the placed nodes and the camp, the walkability grids Explore walks on, and the runtime edits (a drift
// slice dug, a secret broken open, a skin cell mined, the hatch split, a relit lamp baked into the light).
//
// No Three.js: DepthScene (1C) meshes `ring` (dirty chunks) and uploads `light` (consumeLightRows), HybridGame (1D)
// walks `nav(i)` with `findPath`, both read `placement(i)` and `camp()`.
//
// CONTRACT (W1, 1B, published at 0:45).

import { B } from '../../config/blocks';
import { nodeOfDepth } from '../../idle/model/chart';
import { LightField } from '../light';
import { LIGHT_VOLUME, LIVE_ABOVE, LIVE_BELOW, RING_SX, RING_SY, RING_SZ, SLAB_ROWS, SLOTS, VOXEL, slabOfY, slotOfSlab, storageRow, vox, type LightVolumeInfo, type V3 } from './grid';
import { campFrame, chamberGeom, nodeFrame, placeCamp, placeNode, worldCell, templateOfNode } from './layout';
import { NavGrid } from './nav';
import type { CampPlacement, NodePlacement } from './placement';
import { DEAD_SLAB } from './ringConsts';
import { SlabLoader } from './slabLoader';
import { generateSlab } from './slab';
import { CONTEXT_ROWS, LIGHT_OPTIONS, OPEN_CONTEXT_ROWS } from './slabLight';
import type { SlabResult } from './slabWorker';
import { VoxelRing } from './VoxelRing';
import type { TemplateInfo } from './kits/types';

export interface DeepWorldOptions {
  lifeSeed: number;
  runSeed: number;
  /** Generate slabs in a module worker (default: when Workers exist and `?slabworker=0` is absent). */
  worker?: boolean;
}

/** What one update did (DepthScene remeshes `ring.dirty` chunks and uploads the light rows it consumes). */
export interface WorldUpdate {
  /** Slabs written into the ring this call. */
  applied: number[];
  /** Slabs dropped from the ring this call. */
  dropped: number[];
}

const SLAB_BYTES = RING_SX * SLAB_ROWS * RING_SZ;
const LIGHT_REACH_ROWS = 40;

export class DeepWorld {
  readonly ring = new VoxelRing();
  readonly light: LightField;
  /** The light volume's origin, scale and size (1E's irradiance sampling; grid.ts LIGHT_VOLUME). */
  readonly lightInfo: LightVolumeInfo = LIGHT_VOLUME;
  readonly loader: SlabLoader;
  lifeSeed: number;
  runSeed: number;
  /** Model depth dug so far (drift slices above it are open). */
  dugTo = 0;
  /** Socket ids opened this run (secrets, skin, hatches): regenerated slabs keep them open. */
  readonly opened = new Set<string>();
  private first = 0;
  private last = -1;
  private readonly requested = new Set<number>();
  private readonly backlog: SlabResult[] = [];
  private readonly navs = new Map<number, NavGrid>();
  private campNavGrid: NavGrid | null = null;
  /** Light rows changed since the last consumeLightRows (storage rows). */
  private readonly lightRows = new Uint8Array(RING_SY);
  private lightDirtyAll = false;
  stats = { applied: 0, lastApplyMs: 0, maxApplyMs: 0, workerMs: 0 };

  constructor(opts: DeepWorldOptions) {
    this.lifeSeed = opts.lifeSeed >>> 0;
    this.runSeed = opts.runSeed >>> 0;
    this.light = new LightField(this.ring, undefined, LIGHT_OPTIONS);
    this.loader = opts.worker === false ? new SlabLoader(false) : new SlabLoader();
  }

  // ------------------------------------------------------------------------------------------------ streaming

  /** The live slab window [first, last]. */
  get window(): { first: number; last: number } {
    return { first: this.first, last: this.last };
  }

  /** Slabs requested and not applied. */
  get pending(): number {
    return this.requested.size + this.backlog.length;
  }

  /** True when the slab holding world y (m) is in the ring. */
  ready(y: number): boolean {
    return this.ring.hasSlab(Math.max(0, slabOfY(y)));
  }

  /**
   * Build the window around world y now, on this thread (boot, a new run, a jump): every slab, the full light, every
   * chunk dirty. `dugTo` is the model's dig front; `opened` the socket ids opened this run.
   */
  prime(focusY: number, dugTo: number = this.dugTo, opened: Iterable<string> = this.opened, opts: { sync?: number } = {}): void {
    this.dugTo = dugTo;
    if (opened !== this.opened) {
      this.opened.clear();
      for (const id of opened) this.opened.add(id);
    }
    this.loader.cancelAll();
    this.requested.clear();
    this.backlog.length = 0;
    for (let s = 0; s < SLOTS; s++) if (this.ring.slotSlab[s] !== DEAD_SLAB) this.ring.killSlot(s);
    this.ring.blocks.fill(B.BEDROCK);
    const focus = Math.max(0, slabOfY(focusY));
    const { first, last } = VoxelRing.windowFor(focus, LIVE_ABOVE, LIVE_BELOW);
    this.first = first;
    this.last = last;
    // Blocks only (one light pass for what is built here, not one per slab). With `sync`, only the slabs from the one
    // above the focus to `sync` - 1 below it are built now; update() streams the rest through the worker.
    const syncLast = opts.sync === undefined ? last : Math.min(last, focus + Math.max(0, opts.sync - 1));
    for (let k = first; k <= syncLast; k++) this.ring.writeSlab(k, generateSlab({ lifeSeed: this.lifeSeed, runSeed: this.runSeed, k, dugTo: this.dugTo, opened: [...this.opened] }).blocks);
    this.light.computeAll();
    this.lightDirtyAll = true;
    this.navs.clear();
    this.campNavGrid = null;
    this.ring.markAllDirty();
  }

  /** Stream toward world y: drop slabs that left the window, request new ones, apply at most one finished slab. */
  update(focusY: number): WorldUpdate {
    const out: WorldUpdate = { applied: [], dropped: [] };
    const focus = Math.max(0, slabOfY(focusY));
    const { first, last } = VoxelRing.windowFor(focus, LIVE_ABOVE, LIVE_BELOW);
    if (first !== this.first || last !== this.last) {
      if (Math.abs(first - this.first) > SLOTS - 2) {
        this.prime(focusY);
        for (let k = this.first; k <= this.last; k++) out.applied.push(k);
        return out;
      }
      for (let k = this.first; k < first; k++) if (this.dropSlab(k)) out.dropped.push(k);
      for (let k = last + 1; k <= this.last; k++) if (this.dropSlab(k)) out.dropped.push(k);
      this.first = first;
      this.last = last;
    }
    // Nearest first: the focus slab, then below, then above.
    const order: number[] = [];
    for (let k = focus; k <= this.last; k++) order.push(k);
    for (let k = focus - 1; k >= this.first; k--) order.push(k);
    for (const k of order) {
      if (this.ring.hasSlab(k) || this.requested.has(k)) continue;
      if (this.ring.slotSlab[slotOfSlab(k)] !== DEAD_SLAB) continue;
      this.requested.add(k);
      this.loader.request(this.lifeSeed, this.runSeed, k, this.dugTo, [...this.opened], this.context(k));
    }
    for (const r of this.loader.poll()) this.backlog.push(r);
    // One slab per frame.
    while (this.backlog.length) {
      const r = this.backlog.shift()!;
      if (!this.requested.has(r.k) || r.k < this.first || r.k > this.last) continue;
      this.applySlab(r);
      out.applied.push(r.k);
      break;
    }
    return out;
  }

  /** The CONTEXT_ROWS rows above slab k as they are in the ring now (the worker's light context). */
  private context(k: number): Uint8Array {
    const out = new Uint8Array(RING_SX * CONTEXT_ROWS * RING_SZ);
    const tmp = new Uint8Array(SLAB_BYTES);
    const per = CONTEXT_ROWS / SLAB_ROWS;
    for (let jn = 0; jn < per; jn++) {
      const s = k - per + jn;
      if (s < 0) tmp.fill(B.AIR);
      else if (this.ring.hasSlab(s)) this.ring.readSlab(s, tmp);
      else tmp.fill(B.BEDROCK);
      for (let z = 0; z < RING_SZ; z++)
        for (let r = 0; r < SLAB_ROWS; r++)
          out.set(tmp.subarray(RING_SX * (r + SLAB_ROWS * z), RING_SX * (r + SLAB_ROWS * z) + RING_SX), RING_SX * (jn * SLAB_ROWS + r + CONTEXT_ROWS * z));
    }
    return out;
  }

  private applySlab(r: SlabResult): void {
    const t0 = now();
    const k = r.k;
    this.requested.delete(k);
    const slot = slotOfSlab(k);
    if (this.ring.slotSlab[slot] !== DEAD_SLAB) return;
    this.ring.writeSlab(k, r.blocks);
    const y0 = slot * SLAB_ROWS;
    this.light.writeRows(r.light, y0, SLAB_ROWS);
    this.light.mergeMaxRows(r.contextLight, y0 + SLAB_ROWS, CONTEXT_ROWS);
    if (this.ring.slotSlab[slotOfSlab(k + 1)] === DEAD_SLAB) this.light.writeOpenRows(r.contextOpen, y0 + SLAB_ROWS, OPEN_CONTEXT_ROWS);
    else this.light.computeOpennessRows(y0 - 8, SLAB_ROWS + 16);
    this.takeLightRows();
    for (const [i] of this.navs) this.navs.delete(i);
    const ms = now() - t0;
    this.stats.applied++;
    this.stats.lastApplyMs = ms;
    this.stats.maxApplyMs = Math.max(this.stats.maxApplyMs, ms);
    this.stats.workerMs = r.ms;
  }

  private dropSlab(k: number): boolean {
    this.requested.delete(k);
    const slot = slotOfSlab(k);
    if (this.ring.slotSlab[slot] !== k) return false;
    this.ring.killSlot(slot);
    this.light.clearRows(slot * SLAB_ROWS, SLAB_ROWS);
    this.light.recomputeRows(slot * SLAB_ROWS - LIGHT_REACH_ROWS, LIGHT_REACH_ROWS);
    this.light.recomputeRows(slot * SLAB_ROWS + SLAB_ROWS, LIGHT_REACH_ROWS);
    this.light.computeOpennessRows(slot * SLAB_ROWS - 8, SLAB_ROWS + 16);
    this.takeLightRows();
    this.navs.clear();
    return true;
  }

  private takeLightRows(): void {
    const c = this.light.changedRows;
    for (let i = 0; i < c.length; i++) if (c[i]) this.lightRows[i] = 1;
    this.light.clearChangedRows();
  }

  /**
   * The light rows changed since the last call (storage rows: 1 = upload that row of the 3D texture), or 'all' after a
   * prime. The light volume's layout is grid.ts LIGHT_VOLUME (RGBA8, x + 128 (row + 192 z)).
   */
  consumeLightRows(): Uint8Array | 'all' | null {
    this.takeLightRows();
    if (this.lightDirtyAll) {
      this.lightDirtyAll = false;
      this.lightRows.fill(0);
      return 'all';
    }
    let any = false;
    for (let i = 0; i < this.lightRows.length && !any; i++) if (this.lightRows[i]) any = true;
    if (!any) return null;
    const out = this.lightRows.slice();
    this.lightRows.fill(0);
    return out;
  }

  // ------------------------------------------------------------------------------------------------ the layout

  /** Node i placed in the world (pure, memoised). */
  placement(i: number): NodePlacement {
    return placeNode(this.lifeSeed, { i }, undefined, this.runSeed);
  }

  /** Node i's template (pure data). */
  template(i: number): TemplateInfo {
    return templateOfNode(this.lifeSeed, i);
  }

  /** The surface camp. */
  camp(): CampPlacement {
    return placeCamp(this.lifeSeed, this.runSeed);
  }

  /** The node whose drift holds model depth d. */
  nodeOfDepth(d: number): number {
    return nodeOfDepth(this.lifeSeed, d).i;
  }

  /** A new run (or a new life): forget everything run-seeded and rebuild around world y. */
  reseed(lifeSeed: number, runSeed: number, focusY: number, dugTo = 0, opened: Iterable<string> = []): void {
    this.lifeSeed = lifeSeed >>> 0;
    this.runSeed = runSeed >>> 0;
    this.opened.clear();
    this.prime(focusY, dugTo, opened);
  }

  // ------------------------------------------------------------------------------------------------ walking

  /**
   * The walkability grid of node i (W1-LEAD §3): its chamber with the exit passage and Way Down head, its own drift
   * stub (where you arrive from the previous Way Down) and the next node's stub. Built from the ring's voxels, cached,
   * rebuilt after an edit in it. Null when its slabs are not in the ring yet.
   */
  nav(i: number): NavGrid | null {
    const hit = this.navs.get(i);
    if (hit) return hit;
    const p = this.placement(i);
    const box = p.chamber.box;
    const pts: V3[] = [box.min, box.max, p.drift.stub.min, p.drift.stub.max, ...p.chamber.exits.flatMap((e) => e.ride)];
    let x0 = Infinity;
    let y0 = Infinity;
    let z0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    let z1 = -Infinity;
    for (const q of pts) {
      x0 = Math.min(x0, q.x);
      y0 = Math.min(y0, q.y);
      z0 = Math.min(z0, q.z);
      x1 = Math.max(x1, q.x);
      y1 = Math.max(y1, q.y);
      z1 = Math.max(z1, q.z);
    }
    if (!this.ready(y0 - 1) || !this.ready(Math.min(-0.01, y1))) return null;
    const pad = 2;
    const nav = new NavGrid(
      this.ring,
      { x0: Math.max(0, vox(x0 - pad)), x1: Math.min(RING_SX, vox(x1 + pad) + 1), j0: vox(y0 - pad), j1: vox(y1 + pad) + 1, z0: Math.max(0, vox(z0 - pad)), z1: Math.min(RING_SZ, vox(z1 + pad) + 1) },
      { links: p.chamber.links, blockers: p.chamber.blockers },
    );
    this.navs.set(i, nav);
    return nav;
  }

  /** The camp's walkability grid (the quarry floor and the adit). */
  campNav(): NavGrid | null {
    if (this.campNavGrid) return this.campNavGrid;
    if (!this.ready(-1)) return null;
    const c = this.camp();
    const st = this.placement(0).drift.stub;
    this.campNavGrid = new NavGrid(
      this.ring,
      { x0: Math.max(0, vox(Math.min(c.box.min.x, st.min.x) - 1)), x1: Math.min(RING_SX, vox(Math.max(c.box.max.x, st.max.x) + 1) + 1), j0: vox(c.floorY - 2), j1: vox(c.floorY + 6), z0: Math.max(0, vox(Math.min(c.box.min.z, st.min.z) - 1)), z1: Math.min(RING_SZ, vox(Math.max(c.box.max.z, st.max.z) + 1) + 1) },
      { links: c.links, blockers: c.blockers },
    );
    return this.campNavGrid;
  }

  // ------------------------------------------------------------------------------------------------ runtime edits

  /** One voxel with its light update. @returns the old id. */
  setVoxel(x: number, j: number, z: number, id: number): number {
    const old = this.ring.get(x, j, z);
    if (!this.ring.set(x, j, z, id)) return old;
    this.light.onBlockChanged(x, storageRow(j), z, old);
    this.takeLightRows();
    return old;
  }

  /** Open many voxels to AIR with one light pass. */
  private openCells(cells: ReadonlyArray<readonly [number, number, number]>): void {
    const opened: number[] = [];
    for (const [x, j, z] of cells) {
      const old = this.ring.get(x, j, z);
      if (old === B.AIR) continue;
      if (!this.ring.set(x, j, z, B.AIR)) continue;
      opened.push(x + RING_SX * (storageRow(j) + RING_SY * z));
    }
    if (!opened.length) return;
    this.light.openMany(opened);
    let x0 = Infinity;
    let x1 = -Infinity;
    let j0 = Infinity;
    let j1 = -Infinity;
    let z0 = Infinity;
    let z1 = -Infinity;
    for (const [x, j, z] of cells) {
      x0 = Math.min(x0, x);
      x1 = Math.max(x1, x);
      j0 = Math.min(j0, j);
      j1 = Math.max(j1, j);
      z0 = Math.min(z0, z);
      z1 = Math.max(z1, z);
    }
    const s0 = storageRow(j0);
    const s1 = storageRow(j1);
    if (s0 <= s1) this.light.computeOpennessBox(x0 - 7, x1 + 7, s0 - 7, s1 + 7, z0 - 7, z1 + 7);
    else this.light.computeOpennessRows(0, RING_SY);
    this.takeLightRows();
    for (const nav of this.navs.values()) nav.rebuild({ x0: x0 - 2, x1: x1 + 3, j0: j0 - 5, j1: j1 + 3, z0: z0 - 2, z1: z1 + 3 });
    this.campNavGrid?.rebuild({ x0: x0 - 2, x1: x1 + 3, j0: j0 - 5, j1: j1 + 3, z0: z0 - 2, z1: z1 + 3 });
  }

  /** The face plug voxels of model row `depth` (its slice) open: the drift tube extends by 1 m. */
  digRow(depth: number): void {
    const topo = nodeOfDepth(this.lifeSeed, depth);
    const p = this.placement(topo.i);
    const slice = depth - topo.depthTop;
    const b = p.drift.slices[slice];
    if (!b) return;
    const cells: Array<[number, number, number]> = [];
    for (let z = vox(b.min.z); z < vox(b.max.z - 1e-6) + 1; z++)
      for (let x = vox(b.min.x); x < vox(b.max.x - 1e-6) + 1; x++)
        for (let j = vox(b.min.y); j < vox(b.max.y - 1e-6) + 1; j++) if (this.ring.get(x, j, z) === B.FACE_PLUG) cells.push([x, j, z]);
    this.openCells(cells);
    this.dugTo = Math.max(this.dugTo, depth + 1);
  }

  /** Every row up to `depth` (exclusive) dug: a jump, a crew that dug ahead, Dynamite. */
  digTo(depth: number): void {
    for (let d = Math.max(0, this.dugTo); d < depth; d++) this.digRow(d);
    this.dugTo = Math.max(this.dugTo, depth);
  }

  /** A secret (`<node>:x0`) breaks open: its crack voxels become air and its cache shows. */
  openSecret(socketId: string): void {
    const [node, local] = splitId(socketId);
    const g = chamberGeom(this.lifeSeed, this.runSeed, node);
    const s = g.sockets.find((q) => q.id === local);
    if (!s?.secret) return;
    const F = nodeFrame(this.lifeSeed, node, this.runSeed).frame;
    this.opened.add(socketId);
    this.openCells(s.secret.cells.map((c) => worldCell(F, g, c)));
  }

  /** A wall-skin cell (`<node>:k12`) is mined out (the deeper rock behind it shows). */
  breakSkin(socketId: string): void {
    const [node, local] = splitId(socketId);
    const g = chamberGeom(this.lifeSeed, this.runSeed, node);
    const s = g.sockets.find((q) => q.id === local);
    if (!s?.cell) return;
    const F = nodeFrame(this.lifeSeed, node, this.runSeed).frame;
    this.opened.add(socketId);
    this.openCells([worldCell(F, g, s.cell)]);
  }

  /** The Halden Hatch of node `node` (the Lift Bottom) splits: its planks are gone, the Threshold opens below. */
  openHatch(node: number): void {
    const g = chamberGeom(this.lifeSeed, this.runSeed, node);
    const F = nodeFrame(this.lifeSeed, node, this.runSeed).frame;
    const cells: Array<[number, number, number]> = [];
    const gr = g.grid;
    for (let k = 0; k < gr.nv; k++)
      for (let j = 0; j < gr.ny; j++)
        for (let i = 0; i < gr.nu; i++) if (gr.data[gr.idx(i, j, k)] === B.HATCH) cells.push(worldCell(F, g, [i, j, k]));
    this.opened.add(`${node}:hatch`);
    this.openCells(cells);
  }

  /** A relit lamp is written into the light volume (after you leave its chamber, SPEC §4.6): an emitter at its head. */
  bakeLamp(socketId: string): void {
    const [node] = splitId(socketId);
    const p = this.placement(node);
    const l = p.chamber.lights.find((q) => q.socket === socketId);
    if (!l) return;
    // Regenerated slabs bake it again (generateSlab reads relit lamp sockets from the opened ids).
    this.opened.add(socketId);
    const x = vox(l.pos.x);
    const j = vox(l.pos.y);
    const z = vox(l.pos.z);
    if (this.ring.get(x, j, z) === B.AIR) this.setVoxel(x, j, z, B.LIGHT_LAMP);
  }

  /** Socket ids opened this run (for the save and regenerated slabs). */
  openedIds(): string[] {
    return [...this.opened];
  }

  dispose(): void {
    this.loader.dispose();
  }
}

function splitId(id: string): [number, string] {
  const i = id.indexOf(':');
  return [Number(id.slice(0, i)), id.slice(i + 1)];
}

function now(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

/** The world voxel holding a point (tests, picking helpers). */
export function voxelOf(p: V3): [number, number, number] {
  return [Math.floor(p.x / VOXEL), Math.floor(p.y / VOXEL), Math.floor(p.z / VOXEL)];
}

void campFrame;
