import { B, BIOME_BLOCKS, EMITTER, EMIT_B, EMIT_G, EMIT_R, SOLID, VALUE_CLASS } from '../../config/blocks';
import { hash32 } from '../../core/math';
import { Noise } from '../../core/noise';
import { CELL } from '../../idle/model/state';
import { baseBiome, biomeAt, biomeStart, nextBiomeStart } from '../../idle/config/biomes';
import type { PropKind, PropSpec, PropTap } from '../../render/props/types';
import { RING_SX, RING_SZ, SLAB_ROWS } from './RingWorld';
import { kitOf, type BiomeKit } from './biomeKits';
import { TUTORIAL_ROWS, tutorialFeatures } from './tutorialRows';
import { breakthroughs } from '../../idle/model/shaft';
import { carveGeodes, carveVista, dressCavern, finishCavern, inBigRoom, ledges, sealNiche, vistasNear } from './caverns';

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
  kind: 'alcove' | 'pocket' | 'chamber' | 'grotto' | 'hall' | 'vista' | 'geode';
  /** Depth rows [top, bottom] and the box. */
  top: number;
  bottom: number;
  x0: number;
  x1: number;
  z0: number;
  z1: number;
  /** The carve's rounding (carve()'s `round`): with it, `carvedAt` tells which voxels of the box are open. */
  round?: number;
}

/** A creature living in this slab (Creatures.ts draws it; id `creature:<kind>:<n>`). */
export interface CreatureAnchor {
  id: string;
  kind: string;
  biome: number;
  x: number;
  y: number;
  z: number;
  range: number;
}

/** An ambient particle emitter (fill rule 5: every cavern ≥ 50 m³ has one). */
export interface MoteEmitter {
  x: number;
  y: number;
  z: number;
  /** Half extents of the emitting box. */
  rx: number;
  ry: number;
  rz: number;
  kind: 'dust' | 'spore' | 'ember' | 'bubble' | 'snow' | 'glint' | 'thread';
  color: number;
}

/** A liquid surface on a cavern floor (LiquidPlane draws it). */
export interface LiquidSpot {
  id: string;
  kind: 'water' | 'lava' | 'brass' | 'ice' | 'spore';
  y: number;
  x0: number;
  x1: number;
  z0: number;
  z1: number;
}

/** A Vista or Reveal Hall opening onto the backdrop layers (W2.md §3.3). World y0 > y1. */
export interface VistaSpot {
  id: string;
  biome: number;
  top: number;
  bottom: number;
  x0: number;
  x1: number;
}

export interface SlabData {
  k: number;
  blocks: Uint8Array;
  props: PropSpec[];
  caverns: CavernSpec[];
  /** Emitter voxels in the slab (W6 light budget). */
  emitters: number;
  creatures: CreatureAnchor[];
  motes: MoteEmitter[];
  liquids: LiquidSpot[];
  vistas: VistaSpot[];
  /** Rows (0..15) whose back is open onto the backdrops (a Vista, a Reveal Hall): the ring reads AIR behind z = 0. */
  openBack: Uint8Array;
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
  const out: SlabData = { k, blocks, props: [], caverns: [], emitters: 0, creatures: [], motes: [], liquids: [], vistas: [], openBack: new Uint8Array(SLAB_ROWS) };
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
  // ---- pass 3b: a find on the cut face in every 4 rows (fill rule 6, the density's special cells): a 2-row seam in
  // every 3-row block that has none, so no 4 consecutive rows lack one --------------------------------------------
  for (let r0 = 0; r0 < SLAB_ROWS; r0 += 3) {
    let any = false;
    for (let r = r0; r < Math.min(SLAB_ROWS, r0 + 3) && !any; r++)
      for (let x = SHAFT_X0 - 6; x <= SHAFT_X1 + 6 && !any; x++) {
        if (x >= SHAFT_X0 - 1 && x <= SHAFT_X1 + 1) continue;
        const id = blocks[idx(x, r, CUT - 1)];
        if (id >= 64 && id < 176 && ((id - 64) % 8 === 4 || (id - 64) % 8 === 5 || (id - 64) % 8 === 6)) any = true;
      }
    if (any) continue;
    // A short seam of the biome's ore, angled into the face beside the shaft (2 m clear of the shaft walls).
    const r = r0 + Math.min(1, Math.floor(h01(r0, 7, d0, runSeed) * 2));
    const d = d0 + r;
    const kit = kitOf(baseBiome(biomeAt(d)));
    const left = h01(r0, 8, d0, runSeed) < 0.5;
    const x = left ? SHAFT_X0 - 2 - Math.floor(h01(r0, 9, d0, runSeed) * 4) : SHAFT_X1 + 2 + Math.floor(h01(r0, 9, d0, runSeed) * 4);
    const rich = h01(r0, 10, d0, runSeed) < 0.25;
    for (let i = 0; i < 3; i++) {
      const rr = r + (i === 2 ? 1 : 0);
      const xx = x + (left ? -i : i);
      if (rr < SLAB_ROWS) for (let z = CUT - 2; z < CUT; z++) blocks[idx(xx, rr, z)] = rich && i === 1 ? kit.rich : kit.ore;
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
  const ctx: Ctx = { input, out, d0, kitAt: (d) => kitOf(baseBiome(biomeAt(d))), protect: new Set() };
  if (d0 < TUTORIAL_ROWS) tutorialFeatures(ctx);
  for (const v of vistasNear(d0 - 2, d0 + SLAB_ROWS + 1)) carveVista(ctx, v, kitOf(v.biome), runSeed ^ (v.biome * 0x2f1));
  carveGrottos(ctx);
  carveAlcoves(ctx);
  carvePockets(ctx);
  carveChambers(ctx);
  carveGeodes(ctx, runSeed ^ 0x6e0de);
  for (let d = d0 - 8; d < d0 + SLAB_ROWS + 8; d++) {
    const s = nextBiomeStart(Math.max(0, d));
    if (s - 7 === d) sealNiche(ctx, s, kitOf(baseBiome(biomeAt(s))), kitOf(baseBiome(biomeAt(d))));
  }
  fillTapGaps(ctx);
  fillMoving(ctx);
  for (const v of out.vistas) for (let d = Math.max(v.top, d0); d <= Math.min(v.bottom, d0 + SLAB_ROWS - 1); d++) out.openBack[d - d0] = 1;
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
  /** Emitter voxels that light a cavern (the budget drops them last). */
  protect: Set<number>;
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
  const box = { top, bottom, x0, x1, z0, z1, round };
  for (let d = Math.max(top, d0); d <= Math.min(bottom, d0 + SLAB_ROWS - 1); d++)
    for (let z = Math.max(0, z0); z <= Math.min(CUT - 1, z1); z++)
      for (let x = Math.max(0, x0); x <= Math.min(RING_SX - 1, x1); x++) {
        if (inFootprint(x, z) || (round > 0 && !carvedAt(box, x, d, z))) continue;
        out.blocks[idx(x, d - d0, z)] = B.AIR;
        any = true;
      }
  return any;
}

/** Does carve() open voxel (x, d, z) of this box (any slab: the test is pure, so a slab can ask about its neighbour's rows)? */
export function carvedAt(c: { top: number; bottom: number; x0: number; x1: number; z0: number; z1: number; round?: number }, x: number, d: number, z: number): boolean {
  if (d < c.top || d > c.bottom || x < c.x0 || x > c.x1 || z < c.z0 || z > c.z1) return false;
  const round = c.round ?? 0;
  if (round <= 0) return true;
  const cx = (c.x0 + c.x1) / 2;
  const cy = (c.top + c.bottom) / 2;
  const cz = (c.z0 + c.z1) / 2;
  const rx = (c.x1 - c.x0) / 2 + 0.5;
  const ry = (c.bottom - c.top) / 2 + 0.5;
  const rz = (c.z1 - c.z0) / 2 + 0.5;
  // A cavern that reaches the cut stays open at it (its mouth shows in the section); deeper, it rounds.
  const zt = c.z1 >= CUT - 1 ? 0.5 * ((c.z1 - z) / (c.z1 - c.z0 + 1)) ** 2 : ((z - cz) / rz) ** 2;
  const e = ((x - cx) / rx) ** 2 + ((d - cy) / ry) ** 2 + zt;
  return e <= 1 + round * 0.35 * noise.noise3(x * 0.3, d * 0.3, z * 0.3);
}

let propSeq = 0;
/** Add a prop standing on the floor of depth row `floorRow` (its base at world y = -floorRow). */
export function addProp(ctx: Ctx, kind: PropKind, x: number, floorRow: number, z: number, opts: { tap?: PropTap; taps?: number; rotY?: number; scale?: number; emitter?: [number, number, number] } = {}): PropSpec | null {
  const { d0, out } = ctx;
  // Props belong to the slab holding their floor row's air (the row above the floor).
  const row = floorRow - 1;
  if (row < d0 || row >= d0 + SLAB_ROWS) return null;
  const seed = hash32(ctx.input.runSeed ^ hash32(Math.floor(x * 7) + floorRow * 131 + Math.floor(z * 13) * 7919));
  // Tappables carry the model's ids (W2.md §3.5): `<kind>:<n>`, n stable per run seed and slab (k·100 + its index
  // among the slab's tappables); dressing keeps a slab-local id.
  const tapIndex = opts.tap ? out.props.filter((p) => p.tap).length : 0;
  const spec: PropSpec = {
    id: opts.tap ? `${opts.tap}:${ctx.input.k * 100 + tapIndex}` : `s${ctx.input.k}:${out.props.length}`,
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
  ctx.protect.add(idx(x, r, z));
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
    // Never across a seal frame, a Reveal Hall or a Vista.
    const s = nextBiomeStart(top);
    if (bottom >= s - 2 && top <= s + 3) continue;
    if (inBigRoom(top, bottom)) continue;
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
    // 2-6 props on its floor (≥ 1 per 6 m², rule 2); its first is the biome's tappable (rule 3).
    const count = Math.min(6, Math.max(2 + Math.floor(h01(n, 6, 0, seed) * 3), Math.ceil((w * depth) / 6)));
    for (let i = 0; i < count; i++) {
      const px = x0 + 0.5 + ((i + 0.5) / count) * (w - 1);
      const pz = z0 + 0.6 + h01(n, 7, i, seed) * Math.max(0.2, depth - 1.6);
      const [tk, tap, taps] = kit.tappable;
      if (i === 0) addProp(ctx, tk, px, floor, pz, { tap, taps, scale: tk === 'crystalCluster' ? 0.9 : 0.85 });
      else addProp(ctx, pickProp(kit, h01(n, 9, i, seed)), px, floor, pz);
    }
    // A creature in half of them (SPEC §6.6 asks 30 %: the density target of 4 moving things wants more).
    if (h01(n, 10, 0, seed) < 0.5 && bottom >= ctx.d0 && bottom < ctx.d0 + SLAB_ROWS) {
      const kind = kit.creatures[Math.floor(h01(n, 11, 0, seed) * kit.creatures.length)];
      ctx.out.creatures.push({ id: `creature:${kind}:${ctx.input.k * 100 + ctx.out.creatures.length}`, kind, biome: baseBiome(biomeAt(top)), x: (x0 + x1 + 1) / 2, y: -floor, z: z0 + 1 + depth / 2, range: Math.max(0.5, w / 2 - 1) });
    }
    // Its light: the biome's glow in its back wall (any of its rows in this slab), and a lantern where people worked.
    const lx = Math.floor((x0 + x1) / 2);
    let lit = false;
    for (let d = top; d <= bottom && !lit; d++) lit = embedEmitter(ctx, lx, d, z0 - 1, kit.emitter) || embedEmitter(ctx, x0 - 1, d, z0 + 1, kit.emitter) || embedEmitter(ctx, x1 + 1, d, z0 + 1, kit.emitter);
    if (!lit) lit = embedEmitter(ctx, lx, top - 1, z0 + 1, kit.emitter) || embedEmitter(ctx, lx, bottom + 1, z0 + 1, kit.emitter);
    if (kit.alcoveLight === 'lantern') addProp(ctx, 'hangingLantern', lx + 0.5, floor, z0 + 0.5, { emitter: [lx, -top - 1, z0 + 1] });
    finishCavern(ctx, ctx.out.caverns[ctx.out.caverns.length - 1], kit, seed ^ n);
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
    if (inBigRoom(top, bottom)) continue;
    const left = m % 2 === 1;
    const w = 3 + Math.floor(h01(m, 3, 0, seed) * 3);
    const x0 = left ? SHAFT_X0 - w : SHAFT_X1 + 1;
    const x1 = x0 + w - 1;
    const depth = 3 + Math.floor(h01(m, 4, 0, seed) * 4);
    const z1 = CUT - 1;
    const z0 = CUT - depth;
    carve(ctx, top, bottom, x0, x1, z0, z1, 1);
    ctx.out.caverns.push({ id: `p${m}`, kind: 'pocket', top, bottom, x0, x1, z0, z1, round: 1 });
    const kit = ctx.kitAt(top);
    const floor = bottom + 1;
    // The hero tappable: chest 40 %, gem cluster 40 %, fossil 20 %, near the shaft side so it is in view.
    const hx = left ? x1 - 0.2 : x0 + 0.2;
    const roll = h01(m, 5, 0, seed);
    if (roll < 0.4) addProp(ctx, 'chest', hx, floor, CUT - 1.2, { tap: 'cache', taps: 1, rotY: left ? 0.6 : -0.6 });
    else if (roll < 0.8) addProp(ctx, 'crystalCluster', hx, floor, CUT - 1.1, { tap: 'gem', taps: 3, scale: 0.8 });
    else addProp(ctx, 'tablet', hx, floor, CUT - 1.3, { tap: 'fossil', taps: 5, rotY: left ? 0.4 : -0.4 });
    addProp(ctx, pickProp(kit, h01(m, 6, 0, seed)), (x0 + x1) / 2 + 0.5, floor, z0 + 1.2);
    for (let d = top; d <= bottom; d++) if (embedEmitter(ctx, left ? x0 - 1 : x1 + 1, d, CUT - 2, kit.emitter)) break;
    if (h01(m, 12, 0, seed) < 0.3 && bottom >= ctx.d0 && bottom < ctx.d0 + SLAB_ROWS) {
      const kind = kit.creatures[Math.floor(h01(m, 13, 0, seed) * kit.creatures.length)];
      ctx.out.creatures.push({ id: `creature:${kind}:${ctx.input.k * 100 + ctx.out.creatures.length}`, kind, biome: baseBiome(biomeAt(top)), x: (x0 + x1 + 1) / 2, y: -floor, z: CUT - depth / 2, range: Math.max(0.4, w / 2 - 1) });
    }
    finishCavern(ctx, ctx.out.caverns[ctx.out.caverns.length - 1], kit, seed ^ m);
  }
}

// ---- nooks: the tappable guarantee (W1: a tappable within 6 rows ahead at every floor) -------------------

/**
 * The slab's floor rows fall in three blocks (d0+1..6, 7..12, 13..16); a block with no tappable gets a nook: a
 * 2 × 2 × 2 hollow in the cut face beside the shaft holding a gem cluster and a biome light, so consecutive
 * tappables are never more than 11 rows apart, inside a slab or across a slab boundary. Deterministic per slab.
 */
function fillTapGaps(ctx: Ctx): void {
  const { d0, out, input } = ctx;
  const seed = input.runSeed ^ 0x7a9;
  const blocks: Array<[number, number]> = [[d0 + 1, d0 + 6], [d0 + 7, d0 + 12], [d0 + 13, d0 + 16]];
  for (const [b0, b1] of blocks) {
    if (out.props.some((p) => p.tap && -p.y >= b0 && -p.y <= b1)) continue;
    const first = h01(b0, 1, 0, seed) < 0.5;
    let done = false;
    for (let f = Math.min(b1, d0 + SLAB_ROWS - 1); f >= Math.max(b0, d0 + 2) && !done; f--) {
      if (f - 2 < TUTORIAL_ROWS) break;
      const s0 = biomeStart(biomeAt(f));
      if ((s0 > 0 && f - s0 <= 4) || nextBiomeStart(f) - f <= 8) continue;
      for (const left of first ? [true, false] : [false, true]) {
        const x1 = left ? SHAFT_X0 - 2 : SHAFT_X1 + 3;
        const x0 = x1 - 1;
        let ok = true;
        for (let d = f - 2; d <= f && ok; d++)
          for (let z = CUT - 3; z <= CUT - 1 && ok; z++)
            for (let x = x0 - 1; x <= x1 + 1 && ok; x++) {
              const id = get(out.blocks, x, d - d0, z);
              if (!SOLID[id] || isEmitterId(id) || id === B.GATE_STONE || ctx.protect.has(idx(x, d - d0, z))) ok = false;
            }
        if (!ok) continue;
        carve(ctx, f - 2, f - 1, x0, x1, CUT - 2, CUT - 1);
        const cav: CavernSpec = { id: `n${f}`, kind: 'pocket', top: f - 2, bottom: f - 1, x0, x1, z0: CUT - 2, z1: CUT - 1 };
        out.caverns.push(cav);
        const kit = ctx.kitAt(f - 1);
        addProp(ctx, 'crystalCluster', (x0 + x1 + 1) / 2, f, CUT - 1.3, { tap: 'gem', taps: 3, scale: 0.55 });
        embedEmitter(ctx, left ? x0 - 1 : x1 + 1, f - 1, CUT - 2, kit.emitter);
        finishCavern(ctx, cav, kit, seed ^ f);
        done = true;
        break;
      }
    }
  }
}

// ---- the moving guarantee (W1: ≥ 4 animated things a screen) ------------------------------------------------

/**
 * Each half slab (8 rows) carries at least 2 moving things (creatures and ambient motes), so every 20 m window has
 * at least 4 of its own. A short half gets a mote volume in the cavern that overlaps it most (its rows inside the
 * half), else drifting dust in the shaft's own rows (lamp-lit motes over the dug cells).
 */
function fillMoving(ctx: Ctx): void {
  const { d0, out } = ctx;
  for (const h0 of [d0, d0 + 8]) {
    const h1 = h0 + 7;
    const inHalf = (y: number) => -y >= h0 && -y < h1 + 1;
    let n = out.creatures.filter((c) => inHalf(c.y)).length + out.motes.filter((m) => inHalf(m.y)).length;
    if (n >= 2) continue;
    const kit = ctx.kitAt(h0);
    const over = out.caverns
      .filter((c) => c.kind !== 'geode' && c.bottom >= h0 && c.top <= h1)
      .map((c) => ({ c, rows: Math.min(c.bottom, h1) - Math.max(c.top, h0) + 1 }))
      .sort((a, b) => b.rows * (b.c.x1 - b.c.x0 + 1) - a.rows * (a.c.x1 - a.c.x0 + 1));
    for (const { c } of over) {
      if (n >= 2) break;
      const top = Math.max(c.top, h0);
      const bottom = Math.min(c.bottom, h1);
      const y = -(top + bottom + 1) / 2;
      if (out.motes.some((m) => Math.abs(m.y - y) < 1 && Math.abs(m.x - (c.x0 + c.x1 + 1) / 2) < 1)) continue;
      out.motes.push({ x: (c.x0 + c.x1 + 1) / 2, y, z: (c.z0 + c.z1 + 1) / 2, rx: (c.x1 - c.x0) / 2, ry: (bottom - top + 1) / 2, rz: (c.z1 - c.z0) / 2, kind: kit.mote, color: kit.moteColor });
      n++;
    }
    while (n < 2) {
      // Dust in the shaft: over the cells (seen once they are dug, lit by the shaft's lamps).
      out.motes.push({ x: (SHAFT_X0 + SHAFT_X1 + 1) / 2, y: -(h0 + 4 + (n % 2) * 0.5), z: (CELL_Z0 + CUT) / 2, rx: 3.2, ry: 3.6, rz: 1.4, kind: 'dust', color: 0xcab89a });
      n++;
    }
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
    if (inBigRoom(top, bottom)) continue;
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
  // (Every slab the hall overlaps carves its rows: its top row s + 3 lies within 14 rows above this slab or in it.)
  for (let r = -14; r < SLAB_ROWS; r++) {
    if (d0 + r < 0) continue;
    const s = biomeStart(biomeAt(d0 + r));
    if (s === 0 || s + 3 !== d0 + r) continue;
    const top = s + 3;
    const bottom = top + 13;
    // Its back opens onto the backdrop layers (CRITIQUE B10): the biome reveal's dive lands here.
    chamber(ctx, `h${s}`, 'hall', top, bottom, 15, 48, 0, BACK_Z, seed ^ (s * 31));
    if (bottom >= d0 - 1 && top <= d0 + SLAB_ROWS) ctx.out.vistas.push({ id: `hall:${s}`, biome: biomeAt(s), top, bottom, x0: 15, x1: 48 });
  }
}

function chamber(ctx: Ctx, id: string, kind: CavernSpec['kind'], top: number, bottom: number, x0: number, x1: number, z0: number, z1: number, seed: number): void {
  const { d0 } = ctx;
  if (bottom < d0 - 1 || top > d0 + SLAB_ROWS) return;
  const kit = ctx.kitAt(top);
  carve(ctx, top, bottom, x0, x1, z0, z1, 1);
  ctx.out.caverns.push({ id, kind, top, bottom, x0, x1, z0, z1, round: 1 });
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
  // The fill (caverns.ts): medium props by floor area, the small scatter, tappables, creatures, lights, motes, a
  // liquid in 30 % of them, veins on the walls; the Reveal Hall gets three tappables and three lamps.
  const hall = kind === 'hall';
  const spec = ctx.out.caverns[ctx.out.caverns.length - 1];
  dressCavern(ctx, spec, kit, baseBiome(biomeAt(top)), seed, {
    medium: hall ? 10 : 5,
    tappables: hall ? 3 : 2 + Math.floor(h01(5, 6, 7, seed) * 2),
    creatures: hall ? 3 : 1 + Math.floor(h01(5, 6, 8, seed) * 3),
    lamps: hall ? 3 : 1,
    emitters: hall ? 4 : 2,
    liquid: h01(5, 6, 9, seed) < 0.3,
    hero: hall || kind === 'grotto' || h01(5, 6, 10, seed) < 0.5,
  });
  if (hall) ledges(ctx, spec, kit, 5, seed);
}

/** Keep the emitter count inside the biome's budget: add fissures in visible rock, drop the excess. */
function budgetEmitters(ctx: Ctx): void {
  const { out, d0 } = ctx;
  const b = baseBiome(biomeAt(d0 + 8));
  const [lo, hi] = EMITTER_BUDGET[Math.min(EMITTER_BUDGET.length - 1, b)];
  const blocks = out.blocks;
  // The budget counts the biome's glowing stone outside the footprint; lamps (props' light) have their own count.
  // Glowing valuables (ore, gem: their own glint) are not light fixtures: the budget leaves them alone.
  const counted = (i: number) => isEmitterId(blocks[i]) && blocks[i] !== B.LIGHT_LAMP && (VALUE_CLASS[blocks[i]] ?? 0) < 2 && !inFootprint(i % RING_SX, Math.floor(i / (RING_SX * SLAB_ROWS)));
  let n = 0;
  for (let i = 0; i < blocks.length; i++) if (counted(i)) n++;
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
  // A slab mostly carved away (a Vista) has little face left beside the shaft: glow in any wall touching air.
  for (let t = 0; n < lo && t < 3000; t++) {
    const r = Math.floor(h01(t, 11, d0, ctx.input.runSeed) * SLAB_ROWS);
    const x = 8 + Math.floor(h01(t, 12, d0, ctx.input.runSeed) * 48);
    const z = 30 + Math.floor(h01(t, 13, d0, ctx.input.runSeed) * (CUT - 30));
    const id = get(blocks, x, r, z);
    if (!SOLID[id] || isEmitterId(id) || inFootprint(x, z)) continue;
    if (get(blocks, x + 1, r, z) && get(blocks, x - 1, r, z) && get(blocks, x, r + 1, z) && get(blocks, x, r - 1, z) && get(blocks, x, r, z + 1) && get(blocks, x, r, z - 1)) continue;
    set(blocks, x, r, z, kit.emitter);
    n++;
  }
  // Drop the excess: glowing stone that lights no cavern (veins, the back of the slab before the front); a cavern's
  // own lights stay (fill rule 3), so a slab of many caverns may sit above the range (fill-scan reports it).
  for (let i = 0; i < blocks.length && n > hi; i++) {
    if (!counted(i) || ctx.protect.has(i)) continue;
    blocks[i] = kit.hostA;
    n--;
  }
  out.emitters = n;
}

const isEmitterId = (id: number) => (EMIT_R[id] | EMIT_G[id] | EMIT_B[id]) !== 0;

/** For tests: the shaft footprint voxels of row r and column c, front to back. */
export function cellVoxels(slab: SlabData, r: number, c: number): number[] {
  return [CELL_Z1, CELL_Z1 - 1, CELL_Z0].map((z) => slab.blocks[idx(SHAFT_X0 + c, r, z)]);
}

export { EMITTER };
