import { B, BIOME_BLOCKS, EMITTER, EMIT_B, EMIT_G, EMIT_R, SOLID } from '../../config/blocks';
import { hash32 } from '../../core/math';
import { Noise } from '../../core/noise';
import { CELL } from '../../idle/model/state';
import { baseBiome, biomeAt, biomeStart, nextBiomeStart } from '../../idle/config/biomes';
import type { PropKind, PropSpec, PropTap } from '../../render/props/types';
import { RING_SX, RING_SZ, SLAB_ROWS } from './RingWorld';
import { kitOf, type BiomeKit } from './biomeKits';
import { TUTORIAL_ROWS, tutorialFeatures } from './tutorialRows';
import { breakthroughs } from '../../idle/model/shaft';

/**
 * One slab of the descent (SPEC §6.4): 64 x 16 x 64 voxels for depth rows 16k..16k+15, a pure function of
 * (runSeed, k) and the shaft's cell kinds (the model's table; the world never invents a shaft cell).
 *
 * Layout: index x + 64 (r + 16 z), r = 0 the slab's top row (depth 16k). Storage z: the cut plane is z = 60
 * (voxels 60..63 the light apron, always air); the 7 shaft cells are x 28..34, z 57..59 (3 m deep); the
 * shaft's back wall is z = 56; caverns lie behind it.
 *
 * Passes (W1): 1 biome per voxel with ragged boundaries, 2 strata (dipping beds, lenses, marker beds),
 * 3 veins, 4 the shaft cells, 5 alcoves, pockets and chambers (with their props and lights), the tutorial
 * rows, 8 the seal frame, 9 the glow below, 10 the light budget and the shaft guarantee.
 */

export const SHAFT_X0 = 28;
export const SHAFT_X1 = 34;
/** Cell voxels z 57..59 (front to back: 59 is the face on the cut plane). */
export const CELL_Z0 = 57;
export const CELL_Z1 = 59;
export const BACK_Z = 56;
export const CUT = 60;
export const SLAB_VOXELS = RING_SX * SLAB_ROWS * RING_SZ;

export interface SlabInput {
  runSeed: number;
  k: number;
  /** Shaft cell kinds for the slab's 16 rows (row-major, 7 per row; CELL values). AIR = dug or open. */
  kinds: Uint8Array;
}

/** A cavern the generator placed (fill-scan, Depth Ruler icons, harvest ids). */
export interface CavernSpec {
  id: string;
  kind: 'alcove' | 'pocket' | 'chamber' | 'grotto' | 'hall';
  /** Depth rows [top, bottom] and the box. */
  top: number;
  bottom: number;
  x0: number;
  x1: number;
  z0: number;
  z1: number;
}

export interface SlabData {
  k: number;
  blocks: Uint8Array;
  props: PropSpec[];
  caverns: CavernSpec[];
  /** Emitter voxels in the slab (W6 light budget). */
  emitters: number;
}

const idx = (x: number, r: number, z: number) => x + RING_SX * (r + SLAB_ROWS * z);
const h01 = (a: number, b: number, c: number, seed: number) => hash32(hash32(hash32(a ^ seed) ^ (b * 0x9e3779b1)) ^ (c * 0x85ebca6b)) / 4294967296;

let noiseSeed = -1;
let noise: Noise;
let noise2: Noise;
function noises(seed: number): void {
  if (seed === noiseSeed) return;
  noiseSeed = seed;
  noise = new Noise(seed ^ 0x51ab);
  noise2 = new Noise(seed ^ 0x7c3d);
}

/** The emitter budget per slab for a biome (SPEC §11.2), [min, max]. */
export const EMITTER_BUDGET: ReadonlyArray<[number, number]> = [
  [4, 8], [6, 10], [10, 18], [8, 14], [18, 30], [14, 24], [20, 34], [12, 20], [14, 24], [28, 48], [16, 28], [24, 40], [16, 30], [24, 40],
];

/** The block a shaft cell of `kind` is drawn with, given the host rock at that voxel. */
export function cellBlock(kind: number, host: number, kit: BiomeKit): number {
  switch (kind) {
    case CELL.AIR:
      return B.AIR;
    case CELL.ORE:
      return kit.ore;
    case CELL.RICH:
      return kit.rich;
    case CELL.GEM:
      return kit.gem;
    case CELL.FOSSIL:
      return B.FOSSIL;
    case CELL.GEODE:
      return B.GEODE;
    case CELL.CHEST:
      return B.CHEST_SHELL;
    case CELL.GOLDEN:
      return B.GOLDEN;
    case CELL.GATE:
      return B.GATE_STONE;
    case CELL.BOULDER:
      return B.BOULDER;
    case CELL.SEAL:
      return B.SEAL_STONE;
    case CELL.TOPSOIL:
      return B.TOPSOIL;
    default:
      return host;
  }
}

/** Generate slab k (pure). */
export function generateSlab(input: SlabInput): SlabData {
  const { runSeed, k } = input;
  const blocks = new Uint8Array(SLAB_VOXELS);
  const out: SlabData = { k, blocks, props: [], caverns: [], emitters: 0 };
  if (k < 0) return out; // the sky
  noises(runSeed);
  const d0 = k * SLAB_ROWS;
  // ---- passes 1-3: biome, strata, veins ---------------------------------------------------------
  for (let z = 0; z < CUT; z++) for (let x = 0; x < RING_SX; x++) WARP[x + z * RING_SX] = 1.6 * noise2.noise3(x / 14, z / 14, 0.5);
  for (let r = 0; r < SLAB_ROWS; r++) {
    const d = d0 + r;
    const b0 = biomeAt(d);
    const next = nextBiomeStart(d);
    const prevStart = biomeStart(b0);
    for (let z = 0; z < CUT; z++)
      for (let x = 0; x < RING_SX; x++) {
        // Ragged boundaries: across the 8 rows around a boundary each voxel picks a side by a hash
        // against its position in the blend.
        let b = b0;
        if (next - d <= 4) {
          const t = (d - (next - 4)) / 8 + 0.15 * noise.noise3(x * 0.25, d * 0.5, z * 0.25);
          if (h01(x, d, z, runSeed) < t) b = biomeAt(next);
        } else if (d - prevStart < 4 && b0 > 0) {
          const t = 0.5 - (d - prevStart) / 8 + 0.15 * noise.noise3(x * 0.25, d * 0.5, z * 0.25);
          if (h01(x, d, z, runSeed) < t) b = b0 - 1;
        }
        const kit = kitOf(baseBiome(b));
        blocks[idx(x, r, z)] = hostAt(kit, x, d, z, runSeed);
      }
  }
  // ---- pass 4: the shaft cells --------------------------------------------------------------------
  for (let r = 0; r < SLAB_ROWS; r++) {
    const d = d0 + r;
    const kit = kitOf(baseBiome(biomeAt(d)));
    for (let c = 0; c < 7; c++) {
      const kind = input.kinds[r * 7 + c];
      const x = SHAFT_X0 + c;
      for (let z = CELL_Z0; z <= CELL_Z1; z++) {
        const host = blocks[idx(x, r, z)];
        blocks[idx(x, r, z)] = cellBlock(kind, isHost(host) ? host : kit.hostA, kit);
      }
    }
  }
  // ---- pass 5: caverns and their contents -------------------------------------------------------
  const ctx: Ctx = { input, out, d0, kitAt: (d) => kitOf(baseBiome(biomeAt(d))) };
  if (d0 < TUTORIAL_ROWS) tutorialFeatures(ctx);
  carveGrottos(ctx);
  carveAlcoves(ctx);
  carvePockets(ctx);
  carveChambers(ctx);
  // ---- pass 8: the seal frame at each biome start ---------------------------------------------------
  for (let r = 0; r < SLAB_ROWS; r++) {
    const d = d0 + r;
    const s = biomeStart(biomeAt(d));
    if (s === 0 || d < s - 1 || d > s + 2) continue;
    for (const x of [SHAFT_X0 - 1, SHAFT_X1 + 1])
      for (let z = CELL_Z0 - 1; z < CUT; z++) set(blocks, x, r, z, B.GATE_STONE);
    if (d === s - 1) for (let x = SHAFT_X0 - 1; x <= SHAFT_X1 + 1; x++) for (let z = CELL_Z0 - 1; z < BACK_Z; z++) set(blocks, x, r, z, B.GATE_STONE);
  }
  // ---- pass 9: the glow below: the next biome's key colour in hairline fissures of the cut face ------
  for (let r = 0; r < SLAB_ROWS; r++) {
    const d = d0 + r;
    const s = nextBiomeStart(d);
    const toGo = s - d;
    if (toGo > 40 || toGo < 2) continue;
    const kitNext = kitOf(baseBiome(biomeAt(s)));
    // Denser toward the seal: about 4-8 per slab.
    const p = 0.025 + 0.06 * (1 - toGo / 40);
    for (const x of [SHAFT_X0 - 2, SHAFT_X0 - 1, SHAFT_X1 + 1, SHAFT_X1 + 2]) {
      if (h01(x, d, 3, runSeed) >= p) continue;
      // A hairline: 2-3 voxels on a diagonal into the face.
      const len = 2 + (hash32(d * 7 + x) % 2);
      for (let i = 0; i < len; i++) {
        const rr = r + i;
        if (rr >= SLAB_ROWS) break;
        const xx = x + (x < SHAFT_X0 ? -i : i) * (i % 2);
        if (SOLID[get(blocks, xx, rr, CUT - 1)]) set(blocks, xx, rr, CUT - 1, kitNext.emitter);
      }
    }
  }
  // ---- pass 10: light budget and the shaft guarantee -------------------------------------------------
  budgetEmitters(ctx);
  for (let r = 0; r < SLAB_ROWS; r++)
    for (let c = 0; c < 7; c++)
      for (let z = CELL_Z0; z <= CELL_Z1; z++) {
        const kit = kitOf(baseBiome(biomeAt(d0 + r)));
        const id = get(blocks, SHAFT_X0 + c, r, z);
        const kind = input.kinds[r * 7 + c];
        if (!shaftAllowed(id, kind, kit)) set(blocks, SHAFT_X0 + c, r, z, cellBlock(kind, kit.hostA, kit));
      }
  // The apron is always air.
  for (let z = CUT; z < RING_SZ; z++) for (let r = 0; r < SLAB_ROWS; r++) blocks.fill(B.AIR, idx(0, r, z), idx(0, r, z) + RING_SX);
  let n = 0;
  for (let i = 0; i < blocks.length; i++) if ((EMIT_R[blocks[i]] | EMIT_G[blocks[i]] | EMIT_B[blocks[i]]) !== 0) n++;
  out.emitters = n;
  return out;
}

/** True when a shaft footprint voxel holds what the model's cell kind says (W5: never an unbreakable or
 *  decorative voxel in the footprint). */
export function shaftAllowed(id: number, kind: number, kit: BiomeKit): boolean {
  if (kind === CELL.AIR) return id === B.AIR;
  if (kind === CELL.ROCK) return isHost(id);
  const want = cellBlock(kind, kit.hostA, kit);
  // Ragged biome boundaries may draw a neighbour biome's version of the same kind: any biome block of that slot.
  if (want >= 64 && want < 64 + 8 * BIOME_BLOCKS) return id >= 64 && id < 64 + 8 * BIOME_BLOCKS && (id - 64) % 8 === (want - 64) % 8;
  return id === want;
}

/** Biome host rock blocks (any biome's hostA, hostB, soft, hard, special) and the topsoil turf. */
export function isHost(id: number): boolean {
  if (id < 64 || id >= 64 + 8 * BIOME_BLOCKS) return false;
  const slot = (id - 64) % 8;
  return slot <= 3 || slot === 7;
}

const WARP = new Float32Array(RING_SX * RING_SZ);
/** Lenses and veins are drawn in the front of the slab only (what the camera can see through the cut, the
 *  shaft and the caverns); the back is plain beds. */
const DETAIL_Z = 30;

function hostAt(kit: BiomeKit, x: number, d: number, z: number, seed: number): number {
  // Dipping beds: 3-9 m thick, dipping across x, warped by a slow 2D noise.
  const dip = Math.tan((kit.dip * Math.PI) / 180);
  const warp = WARP[x + z * RING_SX];
  const thick = (kit.beds[0] + kit.beds[1]) / 2;
  const t = (d + dip * (x - 32) + warp) / thick;
  const bed = Math.floor(t);
  const fam = h01(bed, 17, 3, seed);
  // Marker bed every 50 m: a thin hard band.
  if (d % 50 === 0 && d > 0) return kit.hard;
  if (z < DETAIL_Z) return fam < 0.6 ? kit.hostA : kit.hostB;
  // Lenses (look only).
  const lens = noise.noise3(x / 4.5, d / 2.6, z / 4.5);
  if (lens > 0.52) return kit.soft;
  if (lens < -0.6) return kit.hard;
  // Veins of the decorative rock (the shaft's own cells come from the model).
  const v = noise2.noise3(x / 4.2, d / 2.4, z / 4.2);
  if (v > 0.6) return v > 0.74 ? kit.rich : kit.ore;
  if (h01(x, d, z, seed ^ 0x77) < 0.0015) return kit.gem;
  return fam < 0.6 ? kit.hostA : kit.hostB;
}

export interface Ctx {
  input: SlabInput;
  out: SlabData;
  d0: number;
  kitAt(d: number): BiomeKit;
}

export function get(blocks: Uint8Array, x: number, r: number, z: number): number {
  if (x < 0 || x >= RING_SX || r < 0 || r >= SLAB_ROWS || z < 0 || z >= RING_SZ) return B.BEDROCK;
  return blocks[idx(x, r, z)];
}

export function set(blocks: Uint8Array, x: number, r: number, z: number, id: number): void {
  if (x < 0 || x >= RING_SX || r < 0 || r >= SLAB_ROWS || z < 0 || z >= RING_SZ) return;
  blocks[idx(x, r, z)] = id;
}

/** Inside the shaft footprint (the 7 cells, 3 deep): only the model's cells live there. */
export const inFootprint = (x: number, z: number): boolean => x >= SHAFT_X0 && x <= SHAFT_X1 && z >= CELL_Z0;

/**
 * Carve a box of air for depth rows [top, bottom] (inclusive), x0..x1, z0..z1, clipped to this slab, never
 * the shaft footprint or the apron. Returns false when nothing of it lies in this slab.
 */
export function carve(ctx: Ctx, top: number, bottom: number, x0: number, x1: number, z0: number, z1: number, round = 0): boolean {
  const { d0, out } = ctx;
  let any = false;
  const cx = (x0 + x1) / 2;
  const cy = (top + bottom) / 2;
  const cz = (z0 + z1) / 2;
  const rx = (x1 - x0) / 2 + 0.5;
  const ry = (bottom - top) / 2 + 0.5;
  const rz = (z1 - z0) / 2 + 0.5;
  for (let d = Math.max(top, d0); d <= Math.min(bottom, d0 + SLAB_ROWS - 1); d++)
    for (let z = Math.max(0, z0); z <= Math.min(CUT - 1, z1); z++)
      for (let x = Math.max(0, x0); x <= Math.min(RING_SX - 1, x1); x++) {
        if (inFootprint(x, z)) continue;
        if (round > 0) {
          // A cavern that reaches the cut stays open at it (its mouth shows in the section); deeper, it rounds.
          const zt = z1 >= CUT - 1 ? 0.5 * ((z1 - z) / (z1 - z0 + 1)) ** 2 : ((z - cz) / rz) ** 2;
          const e = ((x - cx) / rx) ** 2 + ((d - cy) / ry) ** 2 + zt;
          if (e > 1 + round * 0.35 * noise.noise3(x * 0.3, d * 0.3, z * 0.3)) continue;
        }
        out.blocks[idx(x, d - d0, z)] = B.AIR;
        any = true;
      }
  return any;
}

let propSeq = 0;
/** Add a prop standing on the floor of depth row `floorRow` (its base at world y = -floorRow). */
export function addProp(ctx: Ctx, kind: PropKind, x: number, floorRow: number, z: number, opts: { tap?: PropTap; taps?: number; rotY?: number; scale?: number; emitter?: [number, number, number] } = {}): PropSpec | null {
  const { d0, out } = ctx;
  // Props belong to the slab holding their floor row's air (the row above the floor).
  const row = floorRow - 1;
  if (row < d0 || row >= d0 + SLAB_ROWS) return null;
  const seed = hash32(ctx.input.runSeed ^ hash32(Math.floor(x * 7) + floorRow * 131 + Math.floor(z * 13) * 7919));
  const spec: PropSpec = {
    id: `s${ctx.input.k}:${out.props.length}`,
    kind,
    x,
    y: -floorRow,
    z,
    rotY: opts.rotY ?? (seed % 628) / 100,
    scale: opts.scale ?? 1,
    anchor: [Math.floor(x), -floorRow - 1, Math.floor(z)],
    emitters: [],
    seed,
  };
  if (opts.tap) spec.tap = opts.tap;
  if (opts.taps) spec.taps = opts.taps;
  if (opts.emitter) {
    const [ex, ey, ez] = opts.emitter;
    const r = -ey - 1 - d0;
    if (r >= 0 && r < SLAB_ROWS && get(out.blocks, ex, r, ez) === B.AIR) {
      set(out.blocks, ex, r, ez, B.LIGHT_LAMP);
      spec.emitters.push([ex, ey, ez]);
    }
  }
  out.props.push(spec);
  propSeq++;
  return spec;
}

function pickProp(kit: BiomeKit, h: number): PropKind {
  let total = 0;
  for (const [, w] of kit.props) total += w;
  let t = h * total;
  for (const [kind, w] of kit.props) {
    t -= w;
    if (t <= 0) return kind;
  }
  return kit.props[0][0];
}

/** Put a biome emitter voxel into rock touching air near (x, row, z). */
function embedEmitter(ctx: Ctx, x: number, row: number, z: number, id: number): boolean {
  const { out, d0 } = ctx;
  const r = row - d0;
  if (r < 0 || r >= SLAB_ROWS || inFootprint(x, z)) return false;
  if (!SOLID[get(out.blocks, x, r, z)]) return false;
  set(out.blocks, x, r, z, id);
  return true;
}

// ---- alcoves: back-wall dioramas every 6-8 m, alternating sides ----------------------------------------

function carveAlcoves(ctx: Ctx): void {
  const { d0, input } = ctx;
  const seed = input.runSeed ^ 0xa1c0;
  const n0 = Math.max(0, Math.floor((d0 - 14) / 7));
  const n1 = Math.ceil((d0 + SLAB_ROWS + 2) / 7);
  for (let n = n0; n <= n1; n++) {
    const top = 6 + 7 * n + Math.floor(h01(n, 1, 0, seed) * 3) - 1;
    if (top < TUTORIAL_ROWS && top !== 30) continue; // the tutorial authors its own (the creature alcove at 30)
    const h = 2 + Math.floor(h01(n, 2, 0, seed) * 3);
    const bottom = top + h - 1;
    if (bottom < d0 - 1 || top > d0 + SLAB_ROWS) continue;
    // Never across a seal frame.
    const s = nextBiomeStart(top);
    if (bottom >= s - 2 && top <= s + 3) continue;
    const left = n % 2 === 0;
    const w = 3 + Math.floor(h01(n, 3, 0, seed) * 2);
    const x0 = left ? SHAFT_X0 + Math.floor(h01(n, 4, 0, seed) * 2) : SHAFT_X1 - w + 1 - Math.floor(h01(n, 4, 0, seed) * 2);
    const x1 = x0 + w - 1;
    const depth = 3 + Math.floor(h01(n, 5, 0, seed) * 4);
    const z1 = BACK_Z;
    const z0 = BACK_Z - depth + 1;
    carve(ctx, top, bottom, x0, x1, z0, z1);
    ctx.out.caverns.push({ id: `a${n}`, kind: 'alcove', top, bottom, x0, x1, z0, z1 });
    const kit = ctx.kitAt(top);
    const floor = bottom + 1;
    // 2-4 props on its floor, one maybe tappable (a crate, 20 %).
    const count = 2 + Math.floor(h01(n, 6, 0, seed) * 3);
    for (let i = 0; i < count; i++) {
      const px = x0 + 0.5 + ((i + 0.5) / count) * (w - 1);
      const pz = z0 + 0.6 + h01(n, 7, i, seed) * Math.max(0.2, depth - 1.6);
      const tap = i === 0 && h01(n, 8, 0, seed) < 0.2;
      addProp(ctx, tap ? 'crate' : pickProp(kit, h01(n, 9, i, seed)), px, floor, pz, tap ? { tap: 'crate', taps: 1 } : {});
    }
    // Its light: a hanging lantern (people) or the biome's own glow in its back wall.
    if (kit.alcoveLight === 'lantern') {
      const lx = Math.floor((x0 + x1) / 2);
      addProp(ctx, 'hangingLantern', lx + 0.5, floor, z0 + 0.5, { emitter: [lx, -top - 1, z0 + 1] });
    } else {
      embedEmitter(ctx, Math.floor((x0 + x1) / 2), top + 1, z0 - 1, kit.emitter);
      embedEmitter(ctx, x0 - 1, bottom, z0 + 1, kit.emitter);
    }
  }
}

// ---- pockets: beside the shaft, cutting the cut plane (the promise in the section) --------------------

function carvePockets(ctx: Ctx): void {
  const { d0, input } = ctx;
  const seed = input.runSeed ^ 0x90c7;
  const m0 = Math.max(0, Math.floor((d0 - 20) / 12));
  const m1 = Math.ceil((d0 + SLAB_ROWS + 2) / 12);
  for (let m = m0; m <= m1; m++) {
    const top = 11 + 12 * m + Math.floor(h01(m, 1, 0, seed) * 5) - 2;
    if (top < TUTORIAL_ROWS) continue;
    const h = 3 + Math.floor(h01(m, 2, 0, seed) * 3);
    const bottom = top + h - 1;
    if (bottom < d0 - 1 || top > d0 + SLAB_ROWS) continue;
    const s = nextBiomeStart(top);
    if (bottom >= s - 2 && top <= s + 3) continue;
    const left = m % 2 === 1;
    const w = 3 + Math.floor(h01(m, 3, 0, seed) * 3);
    const x0 = left ? SHAFT_X0 - w : SHAFT_X1 + 1;
    const x1 = x0 + w - 1;
    const depth = 3 + Math.floor(h01(m, 4, 0, seed) * 4);
    const z1 = CUT - 1;
    const z0 = CUT - depth;
    carve(ctx, top, bottom, x0, x1, z0, z1, 1);
    ctx.out.caverns.push({ id: `p${m}`, kind: 'pocket', top, bottom, x0, x1, z0, z1 });
    const kit = ctx.kitAt(top);
    const floor = bottom + 1;
    // The hero tappable: chest 40 %, gem cluster 40 %, fossil 20 %, near the shaft side so it is in view.
    const hx = left ? x1 - 0.2 : x0 + 0.2;
    const roll = h01(m, 5, 0, seed);
    if (roll < 0.4) addProp(ctx, 'chest', hx, floor, CUT - 1.2, { tap: 'chest', taps: 1, rotY: left ? 0.6 : -0.6 });
    else if (roll < 0.8) addProp(ctx, 'crystalCluster', hx, floor, CUT - 1.1, { tap: 'gem', taps: 3, scale: 0.8 });
    else addProp(ctx, 'tablet', hx, floor, CUT - 1.3, { tap: 'fossil', taps: 5, rotY: left ? 0.4 : -0.4 });
    addProp(ctx, pickProp(kit, h01(m, 6, 0, seed)), (x0 + x1) / 2 + 0.5, floor, z0 + 1.2);
    embedEmitter(ctx, left ? x0 - 1 : x1 + 1, top + 1, CUT - 2, kit.emitter);
  }
}

// ---- grottos: where the model opens the shaft (a breakthrough), a lit cavern around it ---------------------

function carveGrottos(ctx: Ctx): void {
  const { d0, input } = ctx;
  for (const g of breakthroughs(input.runSeed, d0 - 14, d0 + SLAB_ROWS + 2)) {
    if (g.top < TUTORIAL_ROWS) continue; // the tutorial's crossing is authored (tutorialRows)
    const seed = input.runSeed ^ (g.top * 2654435761);
    const w = 12 + Math.floor(h01(g.top, 1, 0, seed) * 9);
    const x0 = 31 - (w >> 1);
    const x1 = x0 + w;
    // Open at the cut, so the section shows the cavern mouth below the floor before the floor falls in.
    chamber(ctx, `b${g.top}`, 'grotto', g.top - 1, g.bottom, x0, x1, BACK_Z - 10 - Math.floor(h01(g.top, 2, 0, seed) * 10), CUT - 1, seed);
  }
}

// ---- chambers: a grotto behind the shaft every 25-40 m, opened to it (and the Reveal Hall under a seal) --

function carveChambers(ctx: Ctx): void {
  const { d0, input } = ctx;
  const seed = input.runSeed ^ 0xc4a3;
  const g0 = Math.max(0, Math.floor((d0 - 60) / 32));
  const g1 = Math.ceil((d0 + SLAB_ROWS + 2) / 25);
  for (let g = g0; g <= g1; g++) {
    const top = 48 + 32 * g + Math.floor(h01(g, 1, 0, seed) * 15) - 7;
    const h = 6 + Math.floor(h01(g, 2, 0, seed) * 6);
    const bottom = top + h - 1;
    if (bottom < d0 - 1 || top > d0 + SLAB_ROWS + 1) continue;
    const s = nextBiomeStart(top);
    if (bottom >= s - 2 && top <= s + 3) continue;
    const w = 12 + Math.floor(h01(g, 3, 0, seed) * 12);
    const cx = 31 + Math.floor((h01(g, 4, 0, seed) - 0.5) * 8);
    const x0 = cx - (w >> 1);
    const x1 = x0 + w - 1;
    const depth = 10 + Math.floor(h01(g, 5, 0, seed) * 16);
    const z1 = BACK_Z;
    const z0 = BACK_Z - depth;
    chamber(ctx, `g${g}`, 'chamber', top, bottom, x0, x1, z0, z1, seed ^ g);
  }
  // The Reveal Hall under every biome's seal (CRITIQUE B10): the first rows of the biome open onto a hall.
  for (let r = 0; r < SLAB_ROWS + 18; r++) {
    const s = biomeStart(biomeAt(d0 + r));
    if (s === 0 || s + 3 !== d0 + r) continue;
    const top = s + 3;
    const bottom = top + 13;
    chamber(ctx, `h${s}`, 'hall', top, bottom, 15, 48, 16, BACK_Z, seed ^ (s * 31));
  }
}

function chamber(ctx: Ctx, id: string, kind: CavernSpec['kind'], top: number, bottom: number, x0: number, x1: number, z0: number, z1: number, seed: number): void {
  const { d0 } = ctx;
  if (bottom < d0 - 1 || top > d0 + SLAB_ROWS) return;
  const kit = ctx.kitAt(top);
  carve(ctx, top, bottom, x0, x1, z0, z1, 1);
  ctx.out.caverns.push({ id, kind, top, bottom, x0, x1, z0, z1 });
  // Stalactites and stalagmites: cones of rock left standing.
  const cones = 6 + Math.floor(h01(1, 2, 3, seed) * 8);
  for (let i = 0; i < cones; i++) {
    const x = x0 + 1 + Math.floor(h01(i, 1, 0, seed) * (x1 - x0 - 1));
    const z = z0 + 1 + Math.floor(h01(i, 2, 0, seed) * (z1 - z0 - 2));
    if (Math.abs(x - 31) < 6 && z > BACK_Z - 4) continue; // keep the view from the shaft clear
    const len = 1 + Math.floor(h01(i, 3, 0, seed) * 3);
    const up = i % 2 === 0;
    for (let j = 0; j < len; j++) {
      const d = up ? top + j : bottom - j;
      const r = d - d0;
      if (r < 0 || r >= SLAB_ROWS) continue;
      if (j < len - 1 || h01(i, 4, j, seed) < 0.5) set(ctx.out.blocks, x, r, z, kit.hostB);
    }
  }
  // Floor props (instanced dressing in W2): 4-8 medium props and 2-3 tappable clusters, never in front of
  // the shaft window (clear air within 1.5 m of the dig face).
  const floor = bottom + 1;
  const n = kind === 'hall' ? 10 : 4 + Math.floor(h01(5, 5, 5, seed) * 5);
  for (let i = 0; i < n; i++) {
    const x = x0 + 1 + h01(i, 7, 1, seed) * (x1 - x0 - 2);
    const z = z0 + 1 + h01(i, 8, 1, seed) * (z1 - z0 - 3);
    if (Math.abs(x - 31.5) < 5 && z > BACK_Z - 5) continue;
    const tap = i < 3;
    addProp(ctx, tap ? 'crystalCluster' : pickProp(kit, h01(i, 9, 1, seed)), x, floor, z, tap ? { tap: 'crystal', taps: 2 + (i % 3), scale: 1.1 + 0.5 * h01(i, 10, 1, seed) } : { scale: 1 + 0.4 * h01(i, 11, 1, seed) });
  }
  // Warm human light: hanging lanterns left by the Halden crews (the hall gets three), so no cavern is a void.
  const lamps = kind === 'hall' ? 3 : 1;
  for (let i = 0; i < lamps; i++) {
    const lx = x0 + 2 + Math.floor(h01(i, 21, 3, seed) * Math.max(1, x1 - x0 - 4));
    const lz = z0 + 2 + Math.floor(h01(i, 22, 3, seed) * Math.max(1, z1 - z0 - 4));
    if (Math.abs(lx - 31.5) < 4 && lz > BACK_Z - 4) continue;
    addProp(ctx, 'hangingLantern', lx + 0.5, floor, lz + 0.5, { emitter: [lx, -top - 1 - Math.min(2, bottom - top), lz] });
  }
  // 2-3 emitters in the walls in the key colour, one lamp if people worked here.
  const e = kind === 'hall' ? 8 : 2 + Math.floor(h01(6, 6, 6, seed) * 2);
  for (let i = 0; i < e; i++) {
    const x = h01(i, 12, 2, seed) < 0.5 ? x0 - 1 : x1 + 1;
    const d = top + Math.floor(h01(i, 13, 2, seed) * (bottom - top + 1));
    const z = z0 + 1 + Math.floor(h01(i, 14, 2, seed) * (z1 - z0 - 1));
    embedEmitter(ctx, x, d, z, kit.emitter);
    embedEmitter(ctx, x0 + Math.floor(h01(i, 15, 2, seed) * (x1 - x0)), top - 1, z, kit.emitter);
    embedEmitter(ctx, x0 + Math.floor(h01(i, 16, 2, seed) * (x1 - x0)), d, z0 - 1, kit.emitter);
  }
}

/** Keep the emitter count inside the biome's budget: add fissures in visible rock, drop the excess. */
function budgetEmitters(ctx: Ctx): void {
  const { out, d0 } = ctx;
  const b = baseBiome(biomeAt(d0 + 8));
  const [lo, hi] = EMITTER_BUDGET[Math.min(EMITTER_BUDGET.length - 1, b)];
  const blocks = out.blocks;
  let n = 0;
  const footprint = (i: number) => {
    const z = Math.floor(i / (RING_SX * SLAB_ROWS));
    const x = i % RING_SX;
    return inFootprint(x, z);
  };
  for (let i = 0; i < blocks.length; i++) if (isEmitterId(blocks[i]) && !footprint(i)) n++;
  const kit = ctx.kitAt(d0 + 8);
  // Add: hairline fissures in the cut face beside the shaft and in the back wall.
  let tries = 0;
  while (n < lo && tries++ < 400) {
    const r = Math.floor(h01(tries, 1, d0, ctx.input.runSeed) * SLAB_ROWS);
    const side = h01(tries, 2, d0, ctx.input.runSeed) < 0.5;
    const x = side ? SHAFT_X0 - 1 - Math.floor(h01(tries, 3, d0, ctx.input.runSeed) * 3) : SHAFT_X1 + 1 + Math.floor(h01(tries, 3, d0, ctx.input.runSeed) * 3);
    const z = h01(tries, 4, d0, ctx.input.runSeed) < 0.6 ? CUT - 1 : BACK_Z;
    const xx = z === BACK_Z ? SHAFT_X0 + Math.floor(h01(tries, 5, d0, ctx.input.runSeed) * 7) : x;
    const id = get(blocks, xx, r, z);
    if (!SOLID[id] || isEmitterId(id) || inFootprint(xx, z)) continue;
    set(blocks, xx, r, z, kit.emitter);
    n++;
  }
  // Drop the excess, furthest from the cut first (index grows with z: the back of the slab comes first).
  for (let i = 0; i < blocks.length && n > hi; i++) {
    if (!isEmitterId(blocks[i]) || blocks[i] === B.LIGHT_LAMP || footprint(i)) continue;
    blocks[i] = kit.hostA;
    n--;
  }
}

const isEmitterId = (id: number) => (EMIT_R[id] | EMIT_G[id] | EMIT_B[id]) !== 0;

/** For tests: the shaft footprint voxels of row r and column c, front to back. */
export function cellVoxels(slab: SlabData, r: number, c: number): number[] {
  return [CELL_Z1, CELL_Z1 - 1, CELL_Z0].map((z) => slab.blocks[idx(SHAFT_X0 + c, r, z)]);
}

export { EMITTER };
