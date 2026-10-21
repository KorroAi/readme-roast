// The chamber builder: one template's Explore cavern carved into a local voxel grid, then its sockets, stands, dressing
// and lights placed against the carved rock (W1-LEAD §3: real caverns you walk through, multi-level, with ledges,
// stairs, bridges, side passages, alcoves, secrets, lamps, veins, gems and chests). Pure and deterministic: geometry is
// lifetime-seeded, dressing run-seeded (SPEC §4.1). The layout transforms the result into world metres; nodeStamp copies
// the voxels into slabs.

import { B, BIOME_BLOCK_BASE, EMITTER, SLOT, SOLID, biomeBlock } from '../../../config/blocks';
import { VOXEL } from '../grid';
import { NavGrid, type VoxelReader } from '../nav';
import type { Dress, DressKind, ExitType, Mount, SecretKind, SocketKind, SubZone, TemplateId } from '../kits/types';
import { SKIN_CELLS, SOCKET_PLAN, TEMPLATE_SPECS, type TemplateSpec } from '../kits/templates';
import { LocalGrid, Rng, fbm, h01, l3, vnoise, type L3 } from './local';
import { RECIPES } from './recipes';

/** What the layout tells the builder about where the chamber sits. */
export interface BuildInput {
  id: TemplateId;
  /** Actual plan size (m): w across (v), d along (u). */
  w: number;
  d: number;
  /** The arrival: the entry opening's centre on the u = 0 wall (v), floor at local y 0. */
  entryV: number;
  /** The exit: where the Way Down leaves (local u, v; floor dy). `through`: the exit passage continues out through the
   *  v = w wall (the ladder hole lies beyond it); otherwise the hole is at (u, v) inside the room. */
  exit: { u: number; v: number; dy: number; through: boolean; type: ExitType };
  /** The Threshold: the hatch above the balcony (local u, v). */
  fromAbove?: { u: number; v: number };
  /** Local y of the world surface (y = 0) when it is within reach above (the Root Cellar's sky shaft reaches it). */
  surfaceDy?: number;
  /** The chamber above (the Threshold under the Lift Bottom): the local y of its lowest open voxel over a column
   *  (Infinity where it has none); the roof keeps 1 m of rock under it. */
  above?: { floorAt(u: number, v: number): number };
  biome: number;
  subZone: SubZone;
  lifeSeed: number;
  runSeed: number;
  node: number;
}

/** A socket in local metres (see placement.ts SocketPlaced). */
export interface SocketLocal {
  id: string;
  kind: SocketKind;
  mount: Mount;
  level: number;
  pos: L3;
  normal: L3;
  bound: L3;
  approach: L3;
  hidden?: boolean;
  lit?: boolean;
  rich?: boolean;
  secret?: { kind: SecretKind; cells: Array<[number, number, number]>; reveals: string[] };
  cell?: [number, number, number];
}

export interface DressLocal extends Omit<Dress, 'pos' | 'to' | 'normal' | 'rotY' | 'size'> {
  pos: L3;
  /** Width, height, depth (m) in the piece's own frame. */
  size?: L3;
  to?: L3;
  normal?: L3;
  /** Facing direction in the local frame (u, v); the layout turns it into a world yaw. */
  face?: { u: number; v: number };
}

export interface LightLocal {
  id: string;
  kind: 'lamp' | 'crew' | 'sky' | 'crystal' | 'glowroot' | 'leak' | 'camp';
  pos: L3;
  color: [number, number, number];
  radius: number;
  cold?: boolean;
  socket?: string;
}

export interface StandLocal {
  id: string;
  feet: L3;
  /** Look direction (local, horizontal) and pitch (rad). */
  look: { u: number; v: number };
  pitch: number;
  facings: Array<{ u: number; v: number; pitch: number }>;
  reachSockets: string[];
}

export interface ChamberGeom {
  grid: LocalGrid;
  sockets: SocketLocal[];
  stands: StandLocal[];
  dressing: DressLocal[];
  lights: LightLocal[];
  shafts: Array<{ id: string; from: L3; to: L3; radius: number; color: [number, number, number] }>;
  links: Array<{ a: L3; b: L3; kind: 'ladder' | 'rope' | 'step' }>;
  blockers: Array<{ pos: L3; r: number }>;
  exitTap: L3;
  exitApproach: L3;
  /** Special anchors the render keys set pieces on: 'hatch', 'otherLantern', 'knot', 'cage', 'skyShaft', 'wonder'. */
  anchors: Record<string, L3>;
  fill: number;
  /** Walkable cells reachable from the arrival (local feet points), for the tests and fill-scan. */
  reachable: L3[];
  /** 1 for grid voxels within 2 steps of open air (the rock shell nodeStamp writes; the rest is base strata). */
  shell: Uint8Array;
}

/** The host rock of a biome by slot. */
export const host = (biome: number, slot: number): number => biomeBlock(biome, slot);
export const isHostRock = (id: number): boolean => id >= BIOME_BLOCK_BASE && id < BIOME_BLOCK_BASE + 8 * 14 && [0, 1, 3, 7].includes((id - BIOME_BLOCK_BASE) % 8);

/**
 * The builder's working state, handed to the template recipes: the grid, the floor and ceiling heightmaps, the plan
 * shape, the RNGs, and the lists the recipe fills.
 */
export class Shaper {
  readonly grid: LocalGrid;
  /** Floor surface (local y) per column; NaN = no floor set (solid). */
  readonly F: Float32Array;
  /** Ceiling (local y) per column. */
  readonly C: Float32Array;
  /** Plan signed distance per column (< 0 inside). */
  readonly SD: Float32Array;
  readonly geo: Rng;
  readonly run: Rng;
  readonly spec: TemplateSpec;
  readonly dressing: DressLocal[] = [];
  readonly lights: LightLocal[] = [];
  readonly shafts: ChamberGeom['shafts'] = [];
  readonly links: ChamberGeom['links'] = [];
  readonly blockers: ChamberGeom['blockers'] = [];
  readonly anchors: Record<string, L3> = {};
  /** Recipe-placed sockets (authored spots); the generic placer fills the rest. */
  readonly sockets: SocketLocal[] = [];
  /** Zones that must hold some sockets of a kind (placed first): the Threshold's far ledge gets its veins. */
  readonly zones: Array<{ kind: SocketKind; n: number; test: (p: L3) => boolean }> = [];
  /** Zones the generic placer prefers per socket kind: predicates on (u, y, v) and the wall normal. */
  readonly prefer: Partial<Record<SocketKind, (p: L3, n: L3) => number>> = {};
  /** Columns reserved from dressing (paths, the arrival, the exit approach). */
  readonly keepClear: Array<{ u: number; v: number; r: number }> = [];
  /** Extra air carved after the heightmap (alcoves, passages, shafts). */
  readonly carves: Array<() => void> = [];
  wallAmp = 0.9;
  ledgeAmp = 0.45;
  /** The entry mouth (the window composition): the room narrows to the breach over its first metres. Recipes may
   *  turn it off or reshape it. */
  mouth: { len: number; half: number; flare: number } | null = { len: 5, half: 2.4, flare: 0.85 };
  /** The arrival's look direction (local u, v), when not straight along +u. */
  lookFrom: { u: number; v: number } | null = null;
  hostA: number;
  hostB: number;
  soft: number;
  hard: number;
  ore: number;
  rich: number;
  gem: number;
  special: number;

  constructor(readonly input: BuildInput) {
    this.spec = TEMPLATE_SPECS[input.id];
    const { w, d } = input;
    const y0 = Math.min(this.spec.lowDy, input.exit.dy) - 1.5;
    const y1 = Math.max(this.spec.topDy, 3) + (input.surfaceDy !== undefined ? Math.max(0, input.surfaceDy - this.spec.topDy) + 1.5 : 1.5);
    const b = input.biome;
    this.hostA = host(b, SLOT.HOST_A);
    this.hostB = host(b, SLOT.HOST_B);
    this.soft = host(b, SLOT.SOFT);
    this.hard = host(b, SLOT.HARD);
    this.ore = host(b, SLOT.ORE);
    this.rich = host(b, SLOT.RICH);
    this.gem = host(b, SLOT.GEM);
    this.special = host(b, SLOT.SPECIAL);
    // The grid reaches 1.5 m past the outer walls (the footprint's margin) and 3 m past the inner right wall, so
    // secrets have rock to hide their caches in; the entry side stays tight (the arriving drift runs there).
    this.grid = new LocalGrid(-1, d + 1.5, Math.floor(y0 * 2) / 2, Math.ceil(y1 * 2) / 2, -1.5, w + 3, this.hostA);
    const n = this.grid.nu * this.grid.nv;
    this.F = new Float32Array(n).fill(0);
    this.C = new Float32Array(n).fill(0);
    this.SD = new Float32Array(n).fill(1);
    this.geo = new Rng((input.lifeSeed ^ Math.imul(input.node + 1, 0x9e3779b1)) >>> 0);
    this.run = new Rng((input.runSeed ^ Math.imul(input.node + 7, 0x85ebca77)) >>> 0);
  }

  col(i: number, k: number): number {
    return i + this.grid.nu * k;
  }

  /** Visit every column with its centre (u, v). */
  columns(f: (i: number, k: number, u: number, v: number, c: number) => void): void {
    const g = this.grid;
    for (let k = 0; k < g.nv; k++) for (let i = 0; i < g.nu; i++) f(i, k, g.cu(i), g.cv(k), this.col(i, k));
  }

  /** The plan: a noisy rounded rectangle inset from the box, with authored bulges (`extra` < 0 inside). */
  plan(inset = 0.6, round = 3, extra?: (u: number, v: number) => number): void {
    const { w, d } = this.input;
    const seed = this.input.lifeSeed ^ (this.input.node * 0x2f1);
    const hu = d / 2 - inset;
    const hv = w / 2 - inset;
    this.columns((_i, _k, u, v, c) => {
      const qx = Math.abs(u - d / 2) - (hu - round);
      const qz = Math.abs(v - w / 2) - (hv - round);
      const out = Math.hypot(Math.max(qx, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qz), 0) - round;
      let sd = out + this.wallAmp * fbm(seed, u / 3.2, 0.5, v / 3.2);
      if (extra) sd = Math.min(sd, extra(u, v));
      this.SD[c] = sd;
    });
  }

  /** Intersect the plan with a shape (sd < 0 inside): keep the room inside it. */
  clip(f: (u: number, v: number) => number): void {
    this.columns((_i, _k, u, v, c) => {
      this.SD[c] = Math.max(this.SD[c], f(u, v));
    });
  }

  /** The nave: the room's main hall along the arrival axis (deep and tall rather than wide, SPEC §3.4), v in
   *  [E − left, E + right], with noisy walls. Bays added afterwards reach beyond it. */
  nave(left: number, right: number): void {
    const E = this.input.entryV;
    const seed = this.input.lifeSeed ^ (this.input.node * 0x3b9);
    this.clip((u, v) => Math.max(E - left - v, v - (E + right)) + 0.7 * fbm(seed, u / 2.6, 1.5, v / 2.6));
  }

  /** Union a disc or a capsule into the plan (a side bay, a passage). */
  bay(u: number, v: number, r: number): void {
    this.columns((_i, _k, cu, cv, c) => {
      this.SD[c] = Math.min(this.SD[c], Math.hypot(cu - u, cv - v) - r);
    });
  }

  capsule(ua: number, va: number, ub: number, vb: number, r: number): void {
    this.columns((_i, _k, cu, cv, c) => {
      this.SD[c] = Math.min(this.SD[c], segDist(cu, cv, ua, va, ub, vb) - r);
    });
  }

  /** Cut the plan away (a solid rock spur or a pillar mass). */
  cut(u: number, v: number, r: number): void {
    this.columns((_i, _k, cu, cv, c) => {
      this.SD[c] = Math.max(this.SD[c], r - Math.hypot(cu - u, cv - v));
    });
  }

  /** Set the floor (local y, snapped to 0.5) where `where(u, v)`. */
  floor(h: number, where: (u: number, v: number) => boolean): void {
    const hq = Math.round(h * 2) / 2;
    this.columns((_i, _k, u, v, c) => {
      if (where(u, v)) this.F[c] = hq;
    });
  }

  /** A stair strip from (ua, va) at height ha to (ub, vb) at hb, `width` wide: the floor ramps in 0.5 m steps. */
  stair(ua: number, va: number, ha: number, ub: number, vb: number, hb: number, width: number): void {
    const L = Math.hypot(ub - ua, vb - va);
    const du = (ub - ua) / L;
    const dv = (vb - va) / L;
    this.columns((_i, _k, u, v, c) => {
      const t = (u - ua) * du + (v - va) * dv;
      const s = Math.abs(-(u - ua) * dv + (v - va) * du);
      if (t < -0.25 || t > L + 0.25 || s > width / 2) return;
      const f = Math.min(1, Math.max(0, t / L));
      this.F[c] = Math.round((ha + (hb - ha) * f) * 2) / 2;
    });
    this.keepClear.push({ u: (ua + ub) / 2, v: (va + vb) / 2, r: Math.max(width / 2 + 0.5, L / 2) });
  }

  /** The ceiling: a dome rising from `edge` m at the walls to `top` m in the middle (above local 0), with noise. */
  dome(top: number, edge: number, noise = 0.8): void {
    const { w, d } = this.input;
    const seed = this.input.lifeSeed ^ (this.input.node * 0x51b);
    this.columns((_i, _k, u, v, c) => {
      const ru = (u - d / 2) / (d / 2);
      const rv = (v - w / 2) / (w / 2);
      const r2 = Math.min(1, ru * ru * 0.8 + rv * rv * 0.8);
      const inward = Math.min(1, Math.max(0, -this.SD[c] / 3));
      const hgt = edge + (top - edge) * (1 - r2) * (0.55 + 0.45 * inward);
      this.C[c] = hgt + noise * fbm(seed, u / 4.5, 2.5, v / 4.5);
    });
  }

  /** Raise the ceiling locally (a chimney, the sky shaft's mouth, a tall bay). */
  lift(u: number, v: number, r: number, to: number): void {
    this.columns((_i, _k, cu, cv, c) => {
      const q = Math.hypot(cu - u, cv - v) / r;
      if (q < 1) this.C[c] = Math.max(this.C[c], this.C[c] + (to - this.C[c]) * (1 - q * q));
    });
  }

  /** Carve the heightmapped hall: air above the floor and below the ceiling inside the plan, ledges on the walls by
   *  stratum bands (the plan boundary shifts per 1 m band: real 0.5 m ledges). Rock below is stratified host rock. */
  carve(): void {
    const g = this.grid;
    const seed = this.input.lifeSeed ^ (this.input.node * 0x7f4a7c15);
    // The entry mouth: near walls that frame the arrival's view (the dark window around a lit room).
    const m = this.mouth;
    if (m && !this.input.fromAbove) {
      const E = this.input.entryV;
      this.columns((_i, _k, u, v, c) => {
        if (u > m.len) return;
        const lim = m.half + m.flare * Math.max(0, u - 0.5);
        this.SD[c] = Math.max(this.SD[c], Math.abs(v - E) - lim);
      });
    }
    // Near the surface the roof keeps 1.5 m of rock (the sky shaft is carved through it afterwards).
    if (this.input.surfaceDy !== undefined) {
      const roof = this.input.surfaceDy - 1.5;
      for (let c = 0; c < this.C.length; c++) this.C[c] = Math.min(this.C[c], roof);
    }
    const ab = this.input.above;
    if (ab)
      this.columns((_i, _k, u, v, c) => {
        let lo = Infinity;
        for (const [du, dv] of [[0, 0], [-0.5, 0], [0.5, 0], [0, -0.5], [0, 0.5]]) lo = Math.min(lo, ab.floorAt(u + du, v + dv));
        if (lo < Infinity) this.C[c] = Math.min(this.C[c], lo - 1.0);
      });
    // Strata: host A/B by dipping bands, a hard marker bed.
    const dip = 0.12 * (h01(seed, 1) - 0.5);
    const bandId = new Map<number, number>();
    const idOfBand = (band: number) => {
      let id = bandId.get(band);
      if (id === undefined) {
        id = h01(seed, band, 7) < 0.55 ? this.hostA : h01(seed, band, 9) < 0.18 ? this.hard : this.hostB;
        bandId.set(band, id);
      }
      return id;
    };
    for (let k = 0; k < g.nv; k++)
      for (let i = 0; i < g.nu; i++) {
        const u = g.cu(i);
        const warp = 0.45 * vnoise(seed, u / 6, 0.5, g.cv(k) / 6) + dip * u;
        for (let j = 0; j < g.ny; j++) g.data[g.idx(i, j, k)] = idOfBand(Math.floor((g.cy(j) + warp) / 1.25));
      }
    for (let k = 0; k < g.nv; k++)
      for (let i = 0; i < g.nu; i++) {
        const c = this.col(i, k);
        const sd0 = this.SD[c];
        if (sd0 > 1.2) continue;
        const f = this.F[c];
        const top = Math.max(this.C[c], f + 2.6);
        for (let j = 0; j < g.ny; j++) {
          const y = g.cy(j);
          if (y < f || y > top) continue;
          const band = Math.floor((y + 0.37) / 1.0);
          const off = this.ledgeAmp * (h01(seed, band, 3) - 0.35) + 0.25 * Math.max(0, (y - f - 2.2) / 3);
          if (sd0 + off < 0) g.data[g.idx(i, j, k)] = B.AIR;
        }
      }
    for (const f of this.carves) f();
  }

  // ------------------------------------------------------------------------------------------- built and extra shapes

  /** Air in a local box (metres). */
  air(ua: number, ya: number, va: number, ub: number, yb: number, vb: number): void {
    this.grid.carveBox(ua, ya, va, ub, yb, vb);
  }

  /** Solid in a local box. */
  solid(ua: number, ya: number, va: number, ub: number, yb: number, vb: number, id: number): void {
    this.grid.box(ua, ya, va, ub, yb, vb, id);
  }

  /** An ellipsoid of air (a bay, an alcove's rounded back). */
  blob(u: number, y: number, v: number, ru: number, ry: number, rv: number, id: number = B.AIR, floorY?: number): void {
    const g = this.grid;
    g.eachIn(u - ru, y - ry, v - rv, u + ru, y + ry, v + rv, (i, j, k, cu, cy, cv) => {
      if (floorY !== undefined && cy < floorY) return;
      const e = ((cu - u) / ru) ** 2 + ((cy - y) / ry) ** 2 + ((cv - v) / rv) ** 2;
      if (e <= 1) g.data[g.idx(i, j, k)] = id;
    });
  }

  /** An octagonal column (v1's `column()` shaft) of masonry from y0 to y1. */
  column(u: number, v: number, r: number, y0: number, y1: number, id: number = B.MASONRY): void {
    const g = this.grid;
    g.eachIn(u - r, y0, v - r, u + r, y1, v + r, (i, j, k, cu, _cy, cv) => {
      const du = Math.abs(cu - u);
      const dv = Math.abs(cv - v);
      if (du <= r && dv <= r && du + dv <= r * 1.42) g.data[g.idx(i, j, k)] = id;
    });
  }

  /** A walkable deck (bridge, balcony, root bridge) from (ua, va) to (ub, vb) at floor height h, `width` wide. */
  deck(ua: number, va: number, ub: number, vb: number, h: number, width: number, id: number = B.DECK, thick = 0.5): void {
    const g = this.grid;
    const L = Math.hypot(ub - ua, vb - va);
    const du = (ub - ua) / L;
    const dv = (vb - va) / L;
    g.eachIn(Math.min(ua, ub) - width, h - thick, Math.min(va, vb) - width, Math.max(ua, ub) + width, h, Math.max(va, vb) + width, (i, j, k, cu, _cy, cv) => {
      const t = (cu - ua) * du + (cv - va) * dv;
      const s = Math.abs(-(cu - ua) * dv + (cv - va) * du);
      if (t >= -0.25 && t <= L + 0.25 && s <= width / 2) g.data[g.idx(i, j, k)] = id;
    });
    // Head room over the deck.
    g.eachIn(Math.min(ua, ub) - width, h, Math.min(va, vb) - width, Math.max(ua, ub) + width, h + 2.5, Math.max(va, vb) + width, (i, j, k, cu, _cy, cv) => {
      const t = (cu - ua) * du + (cv - va) * dv;
      const s = Math.abs(-(cu - ua) * dv + (cv - va) * du);
      if (t >= -0.25 && t <= L + 0.25 && s <= width / 2 && g.data[g.idx(i, j, k)] !== B.AIR && SOLID[g.data[g.idx(i, j, k)]]) {
        // keep rock that is the deck's own anchoring wall beyond the ends
        if (t > 0.25 && t < L - 0.25) g.data[g.idx(i, j, k)] = B.AIR;
      }
    });
  }

  /** A masonry wall (Halden built) along a segment, from y0 up `h`, `thick` thick. */
  wall(ua: number, va: number, ub: number, vb: number, y0: number, h: number, thick = 0.5, id: number = B.MASONRY): void {
    const g = this.grid;
    const L = Math.hypot(ub - ua, vb - va);
    const du = (ub - ua) / L;
    const dv = (vb - va) / L;
    g.eachIn(Math.min(ua, ub) - thick, y0, Math.min(va, vb) - thick, Math.max(ua, ub) + thick, y0 + h, Math.max(va, vb) + thick, (i, j, k, cu, _cy, cv) => {
      const t = (cu - ua) * du + (cv - va) * dv;
      const s = Math.abs(-(cu - ua) * dv + (cv - va) * du);
      if (t >= 0 && t <= L && s <= thick / 2 + 0.01) g.data[g.idx(i, j, k)] = id;
    });
  }

  /** Emitter voxels (glowroot seams, crystal glow) on rock surfaces near (u, y, v) within r: `count` of them. */
  seam(u: number, y: number, v: number, r: number, count: number, id: number = EMITTER.GLOWROOT): void {
    const g = this.grid;
    const cand: number[] = [];
    g.eachIn(u - r, y - r, v - r, u + r, y + r, v + r, (i, j, k) => {
      if (!g.solid(i, j, k)) return;
      if (!isHostRock(g.get(i, j, k))) return;
      if (!g.solid(i + 1, j, k) || !g.solid(i - 1, j, k) || !g.solid(i, j + 1, k) || !g.solid(i, j - 1, k) || !g.solid(i, j, k + 1) || !g.solid(i, j, k - 1)) cand.push(g.idx(i, j, k));
    });
    for (let n = 0; n < count && cand.length; n++) {
      const pick = Math.floor(this.geo.next() * cand.length);
      g.data[cand[pick]] = id;
      cand.splice(pick, 1);
    }
  }

  /** A dressing piece. */
  dress(kind: DressKind, pos: L3, opts: Partial<Omit<DressLocal, 'kind' | 'pos'>> = {}): void {
    this.dressing.push({ kind, pos, scale: opts.scale ?? 1, seed: opts.seed ?? Math.floor(this.run.next() * 0x7fffffff), ...opts });
  }

  light(l: LightLocal): void {
    this.lights.push(l);
  }

  /** An authored socket (its approach is resolved after the carve). */
  socket(s: Omit<SocketLocal, 'approach' | 'bound'> & { bound?: L3 }): void {
    this.sockets.push({ bound: s.bound ?? l3(0.3, 0.3, 0.3), approach: s.pos, ...s });
  }
}

function segDist(px: number, pz: number, ax: number, az: number, bx: number, bz: number): number {
  const dx = bx - ax;
  const dz = bz - az;
  const L2 = dx * dx + dz * dz;
  const t = L2 > 0 ? Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / L2)) : 0;
  return Math.hypot(px - (ax + dx * t), pz - (az + dz * t));
}

/** A VoxelReader over a local grid: x = iu, j = iy, z = iv (nav's world-voxel convention). */
export function localReader(g: LocalGrid): VoxelReader {
  return { get: (x, j, z) => g.get(x, j, z) };
}

/** Local metres ↔ the local nav's metres (nav works in "voxel·0.5" space anchored at the grid's corner). */
export const toNav = (g: LocalGrid, p: L3) => ({ x: p.u - g.u0, y: p.y - g.y0, z: p.v - g.v0 });
export const fromNav = (g: LocalGrid, p: { x: number; y: number; z: number }): L3 => ({ u: p.x + g.u0, y: p.y + g.y0, v: p.z + g.v0 });

/** The recipe signature: shape the hall (plan, floors, stairs, ceiling, built parts), add authored sockets and set pieces. */
export type Recipe = (s: Shaper) => void;

/**
 * Build a chamber: the recipe shapes it, the carve cuts it, the entry and exit are guaranteed open, then the generic
 * placer resolves every socket's spot and approach, the skin cells, the stands, the dressing and the fill.
 */
export const BUILD_TIMES: Record<string, number> = {};
const tick = (k: string, t0: number) => {
  BUILD_TIMES[k] = (BUILD_TIMES[k] ?? 0) + (now() - t0);
  return now();
};
const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

export function buildChamber(input: BuildInput): ChamberGeom {
  let t = now();
  const s = new Shaper(input);
  const recipe = RECIPES[input.id];
  recipe(s);
  t = tick('recipe', t);
  s.carve();
  t = tick('carve', t);
  openEntryExit(s);
  const out = finish(s);
  tick('finish', t);
  return out;
}

/** The arrival landing and the exit area always open and walkable (the layout's connectors meet them). */
function openEntryExit(s: Shaper): void {
  const { entryV, exit, fromAbove } = s.input;
  const g = s.grid;
  if (!fromAbove) {
    // The breach: a 3.5 m wide, 3 m tall opening through the u = 0 wall onto a 3 x 4 m landing at floor 0.
    // (u ≥ 0: the breach slice itself, behind the entry wall, is the face plug's, and stays plug until it falls.)
    s.air(0, 0, entryV - 1.75, 1.5, 3.0, entryV + 1.75);
    s.air(1.5, 0, entryV - 2, 4, 3.0, entryV + 2);
    s.solid(0, -1.5, entryV - 1.75, 4, 0, entryV + 1.75, s.hostA);
  }
  // The exit area at floor exit.dy: a 3 x 3 m pad around (u, v); when the exit goes through the v = w wall, a 3.5 m
  // wide passage start through it.
  const e = exit;
  if (e.type === 'hatch') {
    // The Halden Hatch: a 3 x 3 m plank slab in the floor (HATCH, drawn by the SealRenderer) in a masonry frame, open
    // air above it; the Threshold's balcony lies 3 m below.
    s.air(e.u - 2.5, e.dy, e.v - 2.5, e.u + 2.5, e.dy + 3.5, e.v + 2.5);
    s.solid(e.u - 2.5, e.dy - 1, e.v - 2.5, e.u + 2.5, e.dy, e.v + 2.5, B.MASONRY);
    s.solid(e.u - 1.5, e.dy - 1, e.v - 1.5, e.u + 1.5, e.dy, e.v + 1.5, B.HATCH);
    return;
  }
  if (e.type === 'closed') {
    s.air(e.u - 2, e.dy, e.v - 2, e.u + 2, e.dy + 3.0, Math.min(e.v + 1.5, s.input.w));
    s.solid(e.u - 2, e.dy - 1, e.v - 2, e.u + 2, e.dy, Math.min(e.v + 1.5, s.input.w), s.hostB);
    return;
  }
  const v1 = Math.min(e.v + 1.5, e.through ? s.input.w + 1 : e.v + 1.5);
  s.air(e.u - 1.75, e.dy, e.v - 1.5, e.u + 1.75, e.dy + 3.0, v1);
  s.solid(e.u - 1.75, e.dy - 1, e.v - 1.5, e.u + 1.75, e.dy, v1, s.hostB);
  void g;
}

// ------------------------------------------------------------------------------------------------- the generic placer

interface Cell {
  i: number;
  j: number;
  k: number;
}

function finish(s: Shaper): ChamberGeom {
  const g = s.grid;
  const input = s.input;
  const reader = localReader(g);
  const nav = new NavGrid(reader, { x0: 0, x1: g.nu, j0: 1, j1: g.ny - 1, z0: 0, z1: g.nv }, { links: s.links.map((l) => ({ a: toNav(g, l.a), b: toNav(g, l.b), kind: l.kind })), blockers: [] });
  const arrival = input.fromAbove ? l3(input.fromAbove.u, 0, input.fromAbove.v) : l3(1.0, 0, input.entryV);
  const reach: L3[] = nav.reachableFrom(toNav(g, arrival)).map((p) => fromNav(g, p));
  const freeOfBlockers = (q: L3) => s.blockers.every((b) => Math.hypot(q.u - b.pos.u, q.v - b.pos.v) > b.r + 0.45 || Math.abs(q.y - b.pos.y) > 1.2);
  const reachFree = reach.filter(freeOfBlockers);
  const reachMask = new Uint8Array(g.nu * g.ny * g.nv);
  const cellKey = (i: number, j: number, k: number) => i + g.nu * (j + g.ny * k);
  for (const p of reach) reachMask[cellKey(g.iu(p.u), Math.round((p.y - g.y0) / VOXEL), g.iv(p.v))] = 1;
  const isReach = (i: number, j: number, k: number) => i >= 0 && j >= 0 && k >= 0 && i < g.nu && j < g.ny && k < g.nv && reachMask[cellKey(i, j, k)] === 1;
  // Columns with any reachable cell (the wall search skips the rest).
  const colReach = new Uint8Array(g.nu * g.nv);
  for (const p of reach) colReach[g.iu(p.u) + g.nu * g.iv(p.v)] = 1;
  const nearReachCol = (i: number, k: number) => {
    for (let dk = -3; dk <= 3; dk++)
      for (let di = -3; di <= 3; di++) {
        const a = i + di;
        const b = k + dk;
        if (a >= 0 && b >= 0 && a < g.nu && b < g.nv && colReach[a + g.nu * b]) return true;
      }
    return false;
  };

  // Wall candidates: a solid host voxel with an open horizontal neighbour whose column has a reachable floor 0–2.2 m
  // below the voxel's centre.
  interface WallSpot {
    pos: L3;
    normal: L3;
    cell: Cell;
    floor: L3;
    hAbove: number;
  }
  const walls: WallSpot[] = [];
  const dirs: Array<[number, number]> = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ];
  for (let k = 1; k < g.nv - 1; k++)
    for (let i = 1; i < g.nu - 1; i++) {
      if (!nearReachCol(i, k)) continue;
      for (let j = 1; j < g.ny - 1; j++) {
        const id = g.get(i, j, k);
        if (!SOLID[id] || !(isHostRock(id) || id === B.MASONRY)) continue;
        for (const [di, dk] of dirs) {
          if (g.solid(i + di, j, k + dk)) continue;
          // The reachable floor: search the open column at (i+di, k+dk) and one more step out.
          let found: L3 | null = null;
          for (let step = 1; step <= 3 && !found; step++) {
            const ci = i + di * step;
            const ck = k + dk * step;
            for (let jj = j; jj >= Math.max(1, j - 5); jj--) {
              if (isReach(ci, jj, ck)) {
                found = l3(g.cu(ci), g.fy(jj), g.cv(ck));
                break;
              }
            }
          }
          if (!found || !freeOfBlockers(found)) continue;
          const pos = l3(g.cu(i) + di * VOXEL * 0.5, g.cy(j), g.cv(k) + dk * VOXEL * 0.5);
          walls.push({ pos, normal: l3(di, 0, dk), cell: { i, j, k }, floor: found, hAbove: pos.y - found.y });
          break;
        }
      }
    }

  const used: L3[] = [];
  const farFromUsed = (p: L3, r: number) => used.every((q) => Math.hypot(p.u - q.u, p.y - q.y, p.v - q.v) >= r);
  const keepOut = (p: L3) => {
    // Not on the arrival landing, not in the exit pad.
    if (!input.fromAbove && p.u < 3.0 && Math.abs(p.v - input.entryV) < 2.2) return true;
    if (Math.hypot(p.u - input.exit.u, p.v - input.exit.v) < 2.0) return true;
    // The exit passage and the Way Down beyond the right wall are carved by the layout's connectors.
    if (input.exit.through && Math.abs(p.u - input.exit.u) < 2.8 && p.v > input.exit.v - 1.0) return true;
    return false;
  };
  // Where the layout's connectors carve (approaches never lie there: the world's floor differs from this grid's).
  const keepOutWalk = (p: L3) => input.exit.through && Math.abs(p.u - input.exit.u) < 2.8 && p.v > input.exit.v - 1.0;
  const sockets: SocketLocal[] = [];
  const byId = new Map<string, SocketLocal>();
  placedLamps.length = 0;
  for (const a of s.sockets) {
    // Authored sockets: resolve the approach (nearest reachable floor clear of the props, within 2.6 m).
    const ap = nearestReach(reachFree, a.pos, 2.6) ?? nearestReach(reach, a.pos, 2.6) ?? a.pos;
    const full: SocketLocal = { ...a, approach: ap };
    sockets.push(full);
    byId.set(a.id, full);
    used.push(a.pos);
  }

  const viewCount: Partial<Record<SocketKind, number>> = {};
  const viewQuota = (k: SocketKind) => (k === 'vein' ? 5 : k === 'gem' ? 1 : k === 'stash' ? 1 : 2);
  const levelOf = (y: number) => {
    const lv = [0, s.spec.exitDy, s.spec.lowDy, s.spec.topDy > 6 ? 2.5 : 99];
    let best = 0;
    let bd = Infinity;
    lv.forEach((h, n) => {
      if (Math.abs(y - h) < bd) {
        bd = Math.abs(y - h);
        best = n === 0 ? 0 : n === 3 ? 2 : 1;
      }
    });
    return best;
  };

  // The arrival's view (the narrow portrait frustum, hFOV 52°): things placed in it are seen on first light.
  const look = s.lookFrom ?? (input.fromAbove ? { u: -1, v: 0 } : { u: 1, v: 0 });
  const eye0 = input.fromAbove ? l3(input.fromAbove.u, 1.6, input.fromAbove.v) : l3(1.0, 1.6, input.entryV);
  const inArrivalView = (p: L3): number => {
    const du = p.u - eye0.u;
    const dv = p.v - eye0.v;
    const fwd = du * look.u + dv * look.v;
    if (fwd < 1.8 || fwd > 16) return 0;
    const lat = Math.abs(-du * look.v + dv * look.u);
    if (lat > 0.4 * fwd) return 0;
    const up = p.y - eye0.y;
    if (up < -0.42 * fwd || up > 0.65 * fwd) return 0;
    return 1;
  };
  const viewBias = (kind: SocketKind) => (kind === 'vein' || kind === 'gem' || kind === 'lamp' || kind === 'stash' ? 1.8 : kind === 'feature' ? 1.2 : 0);
  const zoneLeft = s.zones.map((z) => z.n);
  const pickWall = (kind: SocketKind, hLo: number, hHi: number, spacing: number): WallSpot | null => {
    const pref = s.prefer[kind];
    let best: WallSpot | null = null;
    let bs = -Infinity;
    // A zone of this kind still owed sockets is served first.
    const zi = s.zones.findIndex((z, n) => z.kind === kind && zoneLeft[n] > 0);
    const zone = zi >= 0 ? s.zones[zi] : null;
    for (const wsp of walls) {
      if (zone && !zone.test(wsp.pos)) continue;
      if (wsp.hAbove < hLo || wsp.hAbove > hHi) continue;
      if (keepOut(wsp.floor) || !freeOfBlockers(wsp.floor)) continue;
      if (!farFromUsed(wsp.pos, spacing)) continue;
      const dist = Math.hypot(wsp.pos.u - wsp.floor.u, wsp.pos.v - wsp.floor.v);
      if (dist > 2.0) continue;
      // Half the veins and gems favour the arrival's view (first light shows treasure), the rest spread out.
      const vb = viewCount[kind] === undefined || viewCount[kind]! < viewQuota(kind) ? viewBias(kind) * inArrivalView(wsp.pos) : 0;
      let score = (pref ? pref(wsp.pos, wsp.normal) : 0) + vb + 0.35 * h01(input.lifeSeed ^ 0x1d, wsp.cell.i, wsp.cell.j, wsp.cell.k);
      score -= 0.15 * Math.abs(wsp.hAbove - (hLo + hHi) / 2);
      if (score > bs) {
        bs = score;
        best = wsp;
      }
    }
    if (zone) {
      zoneLeft[zi]--;
      if (!best) return pickWall(kind, hLo, hHi, spacing);
    }
    return best;
  };

  // Placement order: the features and lamps first (they need floor room by a wall), then secrets, gems, veins, stash.
  const ORDER = ['feature', 'lamp', 'secret', 'gem', 'vein', 'stash', 'cache'];
  const plan = SOCKET_PLAN.slice().sort((a, b) => ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind));
  for (const p of plan) {
    for (let j = 0; j < p.n; j++) {
      const id = `${p.prefix}${j}`;
      if (byId.has(id)) continue;
      if (p.kind === 'cache') continue; // caches come with their secrets
      let sock: SocketLocal | null = null;
      if (p.kind === 'vein' || p.kind === 'stash') {
        const wsp = pickWall(p.kind, p.kind === 'vein' ? 0.6 : 0.5, p.kind === 'vein' ? 2.0 : 1.4, p.kind === 'vein' ? 1.6 : 1.4);
        if (wsp) {
          if (inArrivalView(wsp.pos)) viewCount[p.kind] = (viewCount[p.kind] ?? 0) + 1;
          sock = { id, kind: p.kind, mount: 'wall', level: levelOf(wsp.floor.y), pos: wsp.pos, normal: wsp.normal, bound: l3(0.45, 0.45, 0.45), approach: wsp.floor, cell: [wsp.cell.i, wsp.cell.j, wsp.cell.k] };
          if (p.kind === 'vein') paintVein(s, wsp.cell, wsp.normal);
          if (p.kind === 'stash') g.set(wsp.cell.i, wsp.cell.j, wsp.cell.k, B.MASONRY);
        }
      } else if (p.kind === 'gem') {
        const wsp = pickWall('gem', 0.5, 1.6, 2.0);
        if (wsp && inArrivalView(wsp.pos)) viewCount.gem = (viewCount.gem ?? 0) + 1;
        if (wsp) sock = { id, kind: 'gem', mount: 'ledge', level: levelOf(wsp.floor.y), pos: wsp.pos, normal: wsp.normal, bound: l3(0.4, 0.45, 0.4), approach: wsp.floor };
      } else if (p.kind === 'lamp') {
        sock = placeFloorThing(s, reach, used, 'lamp', id, keepOut);
      } else if (p.kind === 'feature') {
        sock = placeFloorThing(s, reach, used, 'feature', id, keepOut);
      } else if (p.kind === 'secret') {
        const sec = placeSecret(s, walls, used, id, j, keepOut, levelOf);
        if (sec) {
          sock = sec.sock;
          sockets.push(sec.cache);
          byId.set(sec.cache.id, sec.cache);
        }
      }
      if (sock) {
        sockets.push(sock);
        byId.set(id, sock);
        used.push(sock.pos);
      }
    }
  }

  // Skin: SKIN_CELLS loose-rock cells on reachable walls 0.4–2.0 m up, spread out, never on a socket.
  let skinN = 0;
  const skinUsed: L3[] = [];
  const order = walls
    .map((w0, n) => ({ w0, r: h01(input.lifeSeed ^ 0x5c1, n, w0.cell.i, w0.cell.k) }))
    .sort((a, b) => a.r - b.r)
    .map((x) => x.w0);
  for (const wsp of order) {
    if (skinN >= SKIN_CELLS) break;
    if (wsp.hAbove < 0.4 || wsp.hAbove > 2.0) continue;
    if (!farFromUsed(wsp.pos, 1.0) || !freeOfBlockers(wsp.floor) || keepOut(wsp.floor)) continue;
    if (!skinUsed.every((q) => Math.hypot(wsp.pos.u - q.u, wsp.pos.y - q.y, wsp.pos.v - q.v) >= 1.1)) continue;
    const was = g.get(wsp.cell.i, wsp.cell.j, wsp.cell.k);
    if (!isHostRock(was) && was !== B.MASONRY) continue;
    // Loose rock in natural walls, loose bricks in Halden masonry.
    g.set(wsp.cell.i, wsp.cell.j, wsp.cell.k, was === B.MASONRY ? B.CRUMBLING_BRICK : s.soft);
    const id = `k${skinN++}`;
    sockets.push({ id, kind: 'skin', mount: 'wall', level: levelOf(wsp.floor.y), pos: wsp.pos, normal: wsp.normal, bound: l3(0.25, 0.25, 0.25), approach: wsp.floor, cell: [wsp.cell.i, wsp.cell.j, wsp.cell.k] });
    skinUsed.push(wsp.pos);
  }

  // The props now stand where they stand: walk the grid again with their blockers, and give every socket an approach
  // the player can really reach (or drop it when none is within reach).
  const nav2 = new NavGrid(reader, { x0: 0, x1: g.nu, j0: 1, j1: g.ny - 1, z0: 0, z1: g.nv }, {
    links: s.links.map((l) => ({ a: toNav(g, l.a), b: toNav(g, l.b), kind: l.kind })),
    blockers: s.blockers.map((b) => ({ pos: toNav(g, b.pos), r: b.r })),
  });
  const reach2 = nav2.reachableFrom(toNav(g, arrival)).map((p) => fromNav(g, p));
  const reach2In = reach2.filter((q) => !keepOutWalk(q));
  const lost: SocketLocal[] = [];
  const key2 = new Set(reach2.map((p) => `${g.iu(p.u)},${Math.round((p.y - g.y0) / VOXEL)},${g.iv(p.v)}`));
  const inReach2 = (p: L3) => key2.has(`${g.iu(p.u)},${Math.round((p.y - g.y0) / VOXEL)},${g.iv(p.v)}`);
  for (let n = sockets.length - 1; n >= 0; n--) {
    const sk = sockets[n];
    if (inReach2(sk.approach) && !keepOutWalk(sk.approach)) continue;
    const lim = sk.kind === 'feature' || sk.kind === 'cache' ? 3.6 : sk.kind === 'lamp' ? 2.2 : 2.6;
    // Floor things are used from their own floor (never from a ledge above or below).
    const base = sk.pos.y - (sk.mount === 'crate' ? 0.75 : sk.mount === 'plinth' ? 1.1 : 0);
    const pool = sk.kind === 'feature' ? reach2In.filter((q) => Math.abs(q.y - base) <= 0.25) : sk.kind === 'lamp' || sk.kind === 'cache' ? reach2In.filter((q) => Math.abs(q.y - base) <= 0.5) : reach2In;
    const alt = nearestReach(pool, sk.pos, lim);
    if (alt) sk.approach = alt;
    else if (!sk.secret && sk.kind !== 'cache') {
      sockets.splice(n, 1);
      byId.delete(sk.id);
      if (sk.kind === 'lamp' || sk.kind === 'feature') lost.push(sk);
    }
  }
  // Lamps and features that lost their floor are placed again on the floor that is really reachable.
  for (const sk of lost) {
    const again = placeFloorThing(s, reach2, sockets.map((q) => q.pos), sk.kind as 'lamp' | 'feature', sk.id, keepOut);
    if (again) {
      sockets.push(again);
      byId.set(again.id, again);
    }
  }
  reach.length = 0;
  reach.push(...reach2);

  // Stands: the arrival, then one per extra stand at the centroid of its sockets' approaches.
  const stands: StandLocal[] = [];
  const spec = s.spec;
  spec.stands.forEach((st, n) => {
    if (n === 0) {
      const feet = nearestReach(reach, arrival, 2) ?? arrival;
      stands.push({ id: st.id, feet, look: s.lookFrom ?? (input.fromAbove ? { u: -1, v: 0 } : { u: 1, v: 0 }), pitch: input.fromAbove ? -0.12 : 0, facings: [], reachSockets: st.reachSockets });
      return;
    }
    const pts = st.reachSockets.map((id) => byId.get(id)).filter((x): x is SocketLocal => !!x).map((x) => x.approach);
    if (!pts.length) return;
    const c = l3(pts.reduce((a, p) => a + p.u, 0) / pts.length, pts.reduce((a, p) => a + p.y, 0) / pts.length, pts.reduce((a, p) => a + p.v, 0) / pts.length);
    const feet = nearestReach(reach, c, 6) ?? pts[0];
    const tgt = st.reachSockets.map((id) => byId.get(id)).find((x) => !!x);
    const look = tgt ? { u: tgt.pos.u - feet.u, v: tgt.pos.v - feet.v } : { u: 1, v: 0 };
    stands.push({ id: st.id, feet, look, pitch: 0, facings: [], reachSockets: st.reachSockets });
  });

  // The exit tap point and its approach.
  const e = input.exit;
  const exitTap = l3(e.u, e.dy + 1.2, e.through ? Math.min(e.v + 1.0, input.w + 0.5) : e.v);
  const exitApproach = nearestReach(reach, l3(e.u, e.dy, e.through ? e.v - 0.5 : e.v - 1.5), 3) ?? l3(e.u, e.dy, e.v - 1.5);

  dressGeneric(s, reach, walls.map((w0) => ({ pos: w0.pos, normal: w0.normal, floor: w0.floor })), used);
  snapDressing(s);
  // Loose dressing never lies where the layout's connectors carve (the exit passage and its Way Down).
  for (let n = s.dressing.length - 1; n >= 0; n--) {
    const d = s.dressing[n];
    if ((d.kind === 'pebbles' || d.kind === 'rubble' || d.kind === 'boulder' || d.kind === 'dripstone' || d.kind === 'hangingRoots') && keepOutWalk(d.pos)) s.dressing.splice(n, 1);
  }

  // First-light fill target: the mean openness of the reachable floor (0..1), how far you can see from it.
  const fill = Math.max(0.2, Math.min(1, reach.length / ((input.w * input.d) / (VOXEL * VOXEL)) / 0.6));

  return {
    shell: shellMask(g),
    grid: g,
    sockets,
    stands,
    dressing: s.dressing,
    lights: s.lights,
    shafts: s.shafts,
    links: s.links,
    blockers: s.blockers,
    exitTap,
    exitApproach,
    anchors: s.anchors,
    fill,
    reachable: reach,
  };
}

const CEILING_KINDS = new Set<DressKind>(['hangingRoots', 'dripstone', 'chain', 'rootCurtain', 'cobweb']);
const FREE_KINDS = new Set<DressKind>(['rail', 'beam', 'puddle', 'plaque', 'rune', 'chalkArrow', 'stairFlight', 'timberSet', 'hangingLamp', 'chandelier']);
/** Floor pieces that are dropped (not lifted) when their base is inside rock. */
const STANDING_KINDS = new Set<DressKind>(['timberPost', 'lampPost', 'crate', 'crateStack', 'barrel', 'shelf', 'cart', 'brokenCart', 'hoistCage', 'winch', 'signpost', 'survey', 'tools']);

/** Wall pieces (a plaque, a rune, a chalk arrow) lie on the wall face behind them. */
const WALL_KINDS = new Set<DressKind>(['plaque', 'rune', 'chalkArrow']);

/** Ceiling pieces hang from the rock above them, floor pieces stand on the floor below them, wall pieces lie on the
 *  wall face behind them; a piece with nothing to rest on within reach is dropped (nothing floats, SPEC §4.11). Linear
 *  pieces keep their length. Standing and hanging pieces sit on voxel centres, so a piece never straddles a 0.5 m step
 *  (half on the step, half over the floor below it). */
function snapDressing(s: Shaper): void {
  const g = s.grid;
  const keep: DressLocal[] = [];
  for (const d of s.dressing) {
    if (WALL_KINDS.has(d.kind) && d.normal && Math.abs(d.normal.y) < 0.5) {
      const n = d.normal;
      const at = (t: number) => l3(d.pos.u - n.u * t, d.pos.y, d.pos.v - n.v * t);
      const solidAt = (t: number) => g.solidM(at(t).u, d.pos.y, at(t).v);
      let face = -1;
      if (solidAt(0)) {
        // Inside the rock: out along the normal to the first open air.
        for (let t = 0; t >= -1.5; t -= 0.05) if (!solidAt(t)) { face = t; break; }
      } else {
        for (let t = 0; t <= 2.0; t += 0.05) if (solidAt(t + 0.05)) { face = t; break; }
      }
      if (face === -1 || !solidAt(face + 0.5)) continue;
      keep.push({ ...d, pos: at(face - 0.02) });
      continue;
    }
    if (FREE_KINDS.has(d.kind)) {
      keep.push(d);
      continue;
    }
    const i = g.iu(d.pos.u);
    const k = g.iv(d.pos.v);
    if (!g.inside(i, 0, k)) continue;
    const j0 = Math.max(0, Math.min(g.ny - 1, g.iy(d.pos.y)));
    if (CEILING_KINDS.has(d.kind)) {
      let j = j0;
      while (j < g.ny - 1 && !g.solid(i, j, k)) j++;
      if (!g.solid(i, j, k) || j - j0 > 6) continue;
      // If it started inside rock, go down to the first open voxel.
      if (j === j0) {
        let jj = j0;
        while (jj > 0 && g.solid(i, jj, k)) jj--;
        if (j0 - jj > 6) continue;
        j = jj + 1;
      }
      const y = g.fy(j);
      const len = d.to ? d.pos.y - d.to.y : 0;
      const free = y - floorUnder(g, i, k, j);
      const ln = Math.min(len, Math.max(0.3, free - 2.4));
      // A chain keeps its authored line (it holds something: the lift's cage, a lamp).
      const du = d.kind === 'chain' ? 0 : g.cu(i) - d.pos.u;
      const dv = d.kind === 'chain' ? 0 : g.cv(k) - d.pos.v;
      keep.push({ ...d, pos: l3(d.pos.u + du, y, d.pos.v + dv), to: d.to ? l3(d.to.u + du, y - ln, d.to.v + dv) : undefined });
    } else {
      let j = j0;
      if (g.solid(i, j, k)) {
        if (STANDING_KINDS.has(d.kind) && g.solid(i, j + 1, k)) continue;
        while (j < g.ny - 1 && g.solid(i, j, k)) j++;
        if (j - j0 > 4) continue;
      } else {
        while (j > 0 && !g.solid(i, j - 1, k)) j--;
        if (j0 - j > 6) continue;
      }
      keep.push({ ...d, pos: l3(g.cu(i), g.fy(j), g.cv(k)) });
    }
  }
  s.dressing.length = 0;
  s.dressing.push(...keep);
}

function floorUnder(g: LocalGrid, i: number, k: number, j: number): number {
  let jj = j - 1;
  while (jj > 0 && !g.solid(i, jj, k)) jj--;
  return g.fy(jj + 1);
}

/** Voxels within 2 face steps of a non-solid voxel. */
function shellMask(g: LocalGrid): Uint8Array {
  const n = g.data.length;
  let cur = new Uint8Array(n);
  for (let i = 0; i < n; i++) if (!SOLID[g.data[i]]) cur[i] = 1;
  const nu = g.nu;
  const nuy = g.nu * g.ny;
  for (let pass = 0; pass < 2; pass++) {
    const next = cur.slice();
    for (let k = 0; k < g.nv; k++)
      for (let j = 0; j < g.ny; j++)
        for (let i = 0; i < g.nu; i++) {
          const q = i + nu * (j + g.ny * k);
          if (cur[q]) continue;
          if ((i > 0 && cur[q - 1]) || (i < g.nu - 1 && cur[q + 1]) || (j > 0 && cur[q - nu]) || (j < g.ny - 1 && cur[q + nu]) || (k > 0 && cur[q - nuy]) || (k < g.nv - 1 && cur[q + nuy])) next[q] = 1;
        }
    cur = next;
  }
  return cur;
}

function nearestReach(reach: ReadonlyArray<L3>, p: L3, maxR: number): L3 | null {
  let best: L3 | null = null;
  let bd = Infinity;
  for (const q of reach) {
    const d = Math.hypot(q.u - p.u, (q.y - p.y) * 1.5, q.v - p.v);
    if (d < bd) {
      bd = d;
      best = q;
    }
  }
  return bd <= maxR ? best : null;
}

/** A vein: a 3–5 voxel patch of the ore slot around the socket's wall cell (the nuggets are 3D, the rock a seam). */
function paintVein(s: Shaper, c: Cell, n: L3): void {
  const g = s.grid;
  const pts: Array<[number, number, number]> = [
    [0, 0, 0],
    [0, 1, 0],
    [0, -1, 0],
  ];
  if (n.u === 0) pts.push([1, 0, 0], [-1, 0, 0]);
  else pts.push([0, 0, 1], [0, 0, -1]);
  for (const [a, b, d] of pts) {
    const id = g.get(c.i + a, c.j + b, c.k + d);
    if (isHostRock(id)) g.set(c.i + a, c.j + b, c.k + d, s.ore);
  }
}

/** Lamps placed by the generic placer in the current build (spacing between lamps). */
const placedLamps: L3[] = [];

/** A floor thing (a lamp post, a feature on a crate): a reachable floor cell next to a wall, spread out, with its
 *  approach 1–2 m away. */
function placeFloorThing(s: Shaper, reach: ReadonlyArray<L3>, used: L3[], kind: 'lamp' | 'feature', id: string, keepOut: (p: L3) => boolean): SocketLocal | null {
  return placeFloorThingWith(s, reach, used, kind, id, keepOut, 2.0, 4.5) ?? placeFloorThingWith(s, reach, used, kind, id, keepOut, 1.2, 2.8);
}

function placeFloorThingWith(s: Shaper, reach: ReadonlyArray<L3>, used: L3[], kind: 'lamp' | 'feature', id: string, keepOut: (p: L3) => boolean, gap: number, lampGap: number): SocketLocal | null {
  const g = s.grid;
  const lamps = s.sockets.filter((q) => q.kind === 'lamp').map((q) => q.pos).concat(placedLamps);
  const pref = s.prefer[kind];
  let best: SocketLocal | null = null;
  let bs = -Infinity;
  for (const q of reach) {
    if (keepOut(q)) continue;
    const i = g.iu(q.u);
    const k = g.iv(q.v);
    const j = Math.round((q.y - g.y0) / VOXEL);
    // Find the open side cell next to the wall strip: the thing stands in the wall strip (never walked: clearance).
    for (const [di, dk] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as Array<[number, number]>) {
      const si = i + di;
      const sk = k + dk;
      if (!g.standable(si, j, sk)) continue;
      // Wall right behind the strip cell.
      if (!g.solid(si + di, j + 1, sk + dk)) continue;
      const pos = l3(g.cu(si), g.fy(j), g.cv(sk));
      if (!used.every((p) => Math.hypot(p.u - pos.u, p.y - pos.y, p.v - pos.v) >= gap)) continue;
      if (kind === 'lamp' && !lamps.every((p) => Math.hypot(p.u - pos.u, p.y - pos.y, p.v - pos.v) >= lampGap)) continue;
      const score = (pref ? pref(pos, l3(-di, 0, -dk)) : 0) + 0.3 * h01(s.input.lifeSeed ^ 0x77, si, j, sk);
      if (score > bs) {
        bs = score;
        best = {
          id,
          kind,
          mount: kind === 'lamp' ? 'post' : 'crate',
          level: 0,
          pos: kind === 'feature' ? l3(pos.u, pos.y + 0.75, pos.v) : pos,
          normal: l3(-di, 0, -dk),
          bound: kind === 'lamp' ? l3(0.3, 0.9, 0.3) : l3(0.45, 0.4, 0.35),
          approach: q,
        };
      }
    }
  }
  if (best && kind === 'feature') {
    const base = l3(best.pos.u, best.pos.y - 0.75, best.pos.v);
    s.blockers.push({ pos: base, r: 0.5 });
    // The approach one step farther out, clear of the crate.
    const out = reach.filter((q) => Math.hypot(q.u - base.u, q.v - base.v) > 0.95 && Math.abs(q.y - base.y) < 0.6);
    const ap = nearestReach(out, base, 2.6);
    if (ap) best.approach = ap;
  }
  if (best && kind === 'lamp') placedLamps.push(best.pos);
  return best;
}

/** A secret: a cracked wall door (1.5 × 2 m) into a cache alcove carved behind a wall spot, or a loose brick niche. */
function placeSecret(s: Shaper, walls: ReadonlyArray<{ pos: L3; normal: L3; cell: Cell; floor: L3; hAbove: number }>, used: L3[], id: string, j: number, keepOut: (p: L3) => boolean, levelOf: (y: number) => number): { sock: SocketLocal; cache: SocketLocal } | null {
  return placeSecretWith(s, walls, used, id, j, keepOut, levelOf, 3) ?? placeSecretWith(s, walls, used, id, j, keepOut, levelOf, 1.5);
}

function placeSecretWith(s: Shaper, walls: ReadonlyArray<{ pos: L3; normal: L3; cell: Cell; floor: L3; hAbove: number }>, used: L3[], id: string, j: number, keepOut: (p: L3) => boolean, levelOf: (y: number) => number, spacing: number): { sock: SocketLocal; cache: SocketLocal } | null {
  const g = s.grid;
  const pref = s.prefer.secret;
  let best: (typeof walls)[number] | null = null;
  let bs = -Infinity;
  for (const w0 of walls) {
    if (w0.hAbove < 0.6 || w0.hAbove > 1.4 || keepOut(w0.floor) || !s.blockers.every((b) => Math.hypot(w0.floor.u - b.pos.u, w0.floor.v - b.pos.v) > b.r + 0.45)) continue;
    if (!used.every((p) => Math.hypot(p.u - w0.pos.u, p.y - w0.pos.y, p.v - w0.pos.v) >= spacing)) continue;
    // Room behind: solid rock behind the wall spot, and over it up to 1 m above the alcove's roof (no walkway above is
    // undermined), and a real wall (rock 2.5 m above the spot: never a terrace's edge).
    let ok = g.solid(w0.cell.i, w0.cell.j + 4, w0.cell.k) && g.solid(w0.cell.i, w0.cell.j + 5, w0.cell.k);
    for (let dd = 1; dd <= 5 && ok; dd++)
      for (let h = -2; h <= 6 && ok; h++)
        for (let side = -2; side <= 2 && ok; side++) {
          const ci = w0.cell.i - w0.normal.u * dd + (w0.normal.u === 0 ? side : 0);
          const ck = w0.cell.k - w0.normal.v * dd + (w0.normal.v === 0 ? side : 0);
          if (!g.inside(ci, w0.cell.j + h, ck) || !g.solid(ci, w0.cell.j + h, ck)) ok = false;
        }
    if (!ok) continue;
    const score = (pref ? pref(w0.pos, w0.normal) : 0) + 0.3 * h01(s.input.lifeSeed ^ 0x3c, w0.cell.i, w0.cell.j, w0.cell.k);
    if (score > bs) {
      bs = score;
      best = w0;
    }
  }
  if (!best) return null;
  const kind: SecretKind = j === 0 ? 'crack' : 'brick';
  const n = best.normal;
  const floorJ = Math.round((best.floor.y - g.y0) / VOXEL);
  const cells: Array<[number, number, number]> = [];
  // The door: 3 voxels wide (crack) or 1 (brick), 4 tall (crack) or 1 (brick), 1 thick, in the wall plane.
  const wide = kind === 'crack' ? 1 : 0;
  const tall = kind === 'crack' ? [0, 1, 2, 3] : [Math.max(0, best.cell.j - floorJ)];
  for (let side = -wide; side <= wide; side++)
    for (const h of tall) {
      const ci = best.cell.i + (n.u === 0 ? side : 0);
      const ck = best.cell.k + (n.v === 0 ? side : 0);
      const cj = floorJ + h;
      g.set(ci, cj, ck, B.CRACK);
      cells.push([ci, cj, ck]);
    }
  // The cache alcove behind: 2 m deep, 2 m wide, 2.5 m tall (crack) or a 1 m niche (brick).
  const depth = kind === 'crack' ? 4 : 2;
  const half = kind === 'crack' ? 2 : 1;
  const hgt = kind === 'crack' ? 5 : 2;
  const base = kind === 'crack' ? floorJ : floorJ + tall[0];
  for (let dd = 1; dd <= depth; dd++)
    for (let side = -half; side <= half; side++)
      for (let h = 0; h < hgt; h++) {
        const ci = best.cell.i - n.u * dd + (n.u === 0 ? side : 0);
        const ck = best.cell.k - n.v * dd + (n.v === 0 ? side : 0);
        if (Math.abs(side) === half && (h === hgt - 1 || dd === depth)) continue;
        g.set(ci, base + h, ck, B.AIR);
      }
  const doorPos = l3(best.pos.u, g.fy(floorJ) + (kind === 'crack' ? 1.0 : best.hAbove), best.pos.v);
  const cachePos = l3(best.pos.u - n.u * (depth * VOXEL * 0.6), g.fy(base) + (kind === 'brick' ? 0 : 0.0), best.pos.v - n.v * (depth * VOXEL * 0.6));
  const cache: SocketLocal = {
    id: `c${j}`,
    kind: 'cache',
    mount: kind === 'brick' ? 'niche' : 'floor',
    level: levelOf(best.floor.y),
    pos: cachePos,
    normal: n,
    bound: l3(0.4, 0.35, 0.4),
    approach: best.floor,
    hidden: true,
  };
  if (kind === 'crack') s.dress('rubble', l3(best.floor.u, best.floor.y, best.floor.v), { scale: 0.6 });
  const sock: SocketLocal = {
    id,
    kind: 'secret',
    mount: 'wall',
    level: levelOf(best.floor.y),
    pos: doorPos,
    normal: n,
    bound: kind === 'crack' ? l3(0.8, 1.0, 0.8) : l3(0.3, 0.3, 0.3),
    approach: best.floor,
    secret: { kind, cells, reveals: [`c${j}`] },
  };
  return { sock, cache };
}

/** Generic dressing: rubble and pebbles at wall feet, dripstone and roots from high ceilings, flowstone, puddles. */
function dressGeneric(s: Shaper, reach: ReadonlyArray<L3>, walls: ReadonlyArray<{ pos: L3; normal: L3; floor: L3 }>, used: ReadonlyArray<L3>): void {
  const g = s.grid;
  const r = s.run;
  const biome = s.input.biome;
  const clearOf = (p: L3, d: number) => used.every((q) => Math.hypot(q.u - p.u, q.v - p.v) >= d) && s.keepClear.every((c) => Math.hypot(c.u - p.u, c.v - p.v) >= c.r);
  // Wall feet: the wall strip cell (never walked) next to reachable floor.
  let n = 0;
  for (const w0 of walls) {
    if (Math.abs(w0.pos.y - w0.floor.y - 0.25) > 0.3) continue;
    if (h01(s.input.runSeed ^ 0x9a, Math.floor(w0.pos.u * 2), Math.floor(w0.pos.v * 2)) > 0.22) continue;
    const foot = l3(w0.pos.u + w0.normal.u * 0.3, w0.floor.y, w0.pos.v + w0.normal.v * 0.3);
    if (!clearOf(foot, 0.9)) continue;
    s.dress(r.next() < 0.55 ? 'pebbles' : 'rubble', foot, { scale: 0.6 + 0.6 * r.next(), normal: w0.normal });
    if (++n > 60) break;
  }
  // Floor scatter: pebbles and small rubble on the open floor (decor; the floor never reads as an empty plane), on a
  // jittered 2.4 m grid, clear of the walk keep-outs and of the sockets.
  const taken = new Set<string>();
  let fsN = 0;
  for (const q of reach) {
    const cu = Math.floor(q.u / 2.4);
    const cv = Math.floor(q.v / 2.4);
    const key = `${cu},${cv},${Math.round(q.y)}`;
    if (taken.has(key)) continue;
    if (h01(s.input.runSeed ^ 0x2f, cu, cv, Math.round(q.y)) > 0.55) {
      taken.add(key);
      continue;
    }
    const ju = (h01(s.input.runSeed ^ 0x31, cu, cv) - 0.5) * 1.6;
    const jv = (h01(s.input.runSeed ^ 0x37, cu, cv) - 0.5) * 1.6;
    const p = l3(q.u + ju, q.y, q.v + jv);
    if (!clearOf(p, 1.3)) continue;
    // Stay on this floor: the jittered spot must have rock right under it and air right over it.
    if (!g.solidM(p.u, p.y - 0.25, p.v) || g.solidM(p.u, p.y + 0.25, p.v)) continue;
    taken.add(key);
    const k2 = r.next();
    s.dress(k2 < 0.7 ? 'pebbles' : 'rubble', p, { scale: 0.35 + 0.35 * r.next() });
    if (++fsN > 90) break;
  }
  // Ceiling pieces: dripstone (tapered, never cube stacks) and hanging roots (Topsoil, Glowroot).
  let m = 0;
  for (let k = 2; k < g.nv - 2; k += 2)
    for (let i = 2; i < g.nu - 2; i += 2) {
      if (h01(s.input.runSeed ^ 0x51, i, k) > 0.06) continue;
      // The ceiling above a reachable floor column.
      let top = -1;
      for (let j = g.ny - 2; j > 2; j--) if (!g.solid(i, j, k) && g.solid(i, j + 1, k)) {
        top = j;
        break;
      }
      if (top < 0) continue;
      let fl = -1;
      for (let j = top; j > 1; j--) if (g.solid(i, j - 1, k)) {
        fl = j;
        break;
      }
      if (fl < 0 || top - fl < 7) continue;
      const p = l3(g.cu(i), g.fy(top + 1), g.cv(k));
      const kind: DressKind = biome <= 1 && r.next() < 0.5 ? 'hangingRoots' : 'dripstone';
      s.dress(kind, p, { scale: 0.6 + 0.8 * r.next(), to: l3(p.u, p.y - (0.5 + 1.2 * r.next()), p.v) });
      if (++m > 18) break;
    }
  void reach;
}

/** Re-exported for recipes. */
export { l3 } from './local';
export type { L3 } from './local';
