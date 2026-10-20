import { B, EMIT_B, EMIT_G, EMIT_R, SOLID, VALUE_CLASS } from '../../config/blocks';
import { baseBiome, biomeAt } from '../../idle/config/biomes';
import { CELL } from '../../idle/model/state';
import type { PropSpec } from '../../render/props/types';
import { RING_SX, SLAB_ROWS } from './RingWorld';
import { kitOf } from './biomeKits';
import { nearDigFace } from './caverns';
import { BACK_Z, CELL_Z0, CUT, EMITTER_BUDGET, SHAFT_X0, SHAFT_X1, generateSlab, type CavernSpec, type SlabData } from './slab';

/**
 * The fill contract checker (SPEC §6.6, §13.4 W1, W2, W6; BUILD W2 MUST 2): generates consecutive slabs (pure, as
 * the worker does) and checks every cavern against fill rules 1-7, every 20 m window against the density targets,
 * and every slab against its biome's emitter budget. Used by tests/unit/idle/fill.test.ts and tools/fill-scan.ts.
 *
 * Rules (per cavern; geodes are sealed shells and exempt from 1-5):
 *   1 volume ≥ 27 m³ → ≥ 1 prop or tappable inside;      2 floor ≥ 9 m² → ≥ min(12, floor / 6) props;
 *   3 ≥ 1 emitter (key colour or lamp) and ≥ 1 tappable;  4 ore, gem or emitter on ≥ 8 % of the wall faces;
 *   5 volume ≥ 50 m³ → an ambient particle emitter;       6 (per 8 rows of the cut face) ≥ 1 find;
 *   7 nothing in the shaft footprint, nothing flush with the cut in the dig's view column.
 * Density (per 20 m window): ≥ 1 cavern or ≥ 3 alcoves; ≥ 2 light hues; ≥ 4 moving things; ≥ 8 interactive or
 * animated things; a special cell in every 4 rows; a tappable within 6 rows ahead at every floor; empty cavern
 * floor ≤ 35 %.
 */

export interface FillViolation {
  rule: string;
  id: string;
  depth: number;
  detail: string;
}

export interface FillReport {
  rows: [number, number];
  slabs: number;
  caverns: number;
  violations: FillViolation[];
  /** Density windows checked and failed (by target). */
  windows: number;
  density: Record<string, number>;
  /** Emitters per slab outside the biome's range (W6). */
  budget: number;
  /** Mean per 20 m window: caverns, tappables, creatures, motes. */
  means: Record<string, number>;
}

const isEmitter = (id: number) => (EMIT_R[id] | EMIT_G[id] | EMIT_B[id]) !== 0;
const SPECIAL = new Set<number>([CELL.ORE, CELL.RICH, CELL.GEM, CELL.CHEST, CELL.FOSSIL, CELL.GEODE, CELL.GOLDEN]);

/** The slabs' blocks as one readable volume (depth rows, storage x and z). */
class Window {
  readonly slabs = new Map<number, SlabData>();
  get(x: number, d: number, z: number): number {
    if (x < 0 || x >= RING_SX || z < 0 || z >= 64) return B.BEDROCK;
    if (z >= CUT) return B.AIR;
    const s = this.slabs.get(Math.floor(d / SLAB_ROWS));
    if (!s) return B.BEDROCK;
    return s.blocks[x + RING_SX * (d - s.k * SLAB_ROWS + SLAB_ROWS * z)];
  }
}

/**
 * Scan depth rows [from, to) for one run seed. `kinds(row)` gives the shaft's 7 cell kinds for a row (the model's
 * table, rowKinds()).
 */
export function scanFill(seed: number, from: number, to: number, kinds: (row: number) => ArrayLike<number>, maxViolations = 200): FillReport {
  const w = new Window();
  const k0 = Math.floor(from / SLAB_ROWS);
  const k1 = Math.ceil(to / SLAB_ROWS);
  const report: FillReport = { rows: [from, to], slabs: 0, caverns: 0, violations: [], windows: 0, density: {}, budget: 0, means: {} };
  const props: PropSpec[] = [];
  const caverns = new Map<string, CavernSpec>();
  const motes: Array<{ x: number; y: number; z: number }> = [];
  const creatures: Array<{ y: number }> = [];
  const liquids: Array<{ y: number; z1: number }> = [];
  const shaftKinds = new Map<number, ArrayLike<number>>();
  const add = (v: FillViolation) => {
    if (report.violations.length < maxViolations) report.violations.push(v);
  };
  for (let k = k0 - 1; k <= k1 + 1; k++) {
    if (k < 0) continue;
    const ks = new Uint8Array(SLAB_ROWS * 7);
    for (let r = 0; r < SLAB_ROWS; r++) {
      const row = kinds(k * SLAB_ROWS + r);
      shaftKinds.set(k * SLAB_ROWS + r, row);
      for (let c = 0; c < 7; c++) ks[r * 7 + c] = row[c];
    }
    const s = generateSlab({ runSeed: seed, k, kinds: ks });
    w.slabs.set(k, s);
    if (k < k0 || k >= k1) continue;
    report.slabs++;
    for (const p of s.props) props.push(p);
    for (const c of s.caverns) if (!caverns.has(c.id)) caverns.set(c.id, c);
    for (const m of s.motes) motes.push(m);
    for (const c of s.creatures) creatures.push(c);
    for (const l of s.liquids) liquids.push(l);
    // W6: the slab's emitters inside its biome's budget.
    const b = baseBiome(biomeAt(k * SLAB_ROWS + 8));
    const [lo, hi] = EMITTER_BUDGET[Math.min(EMITTER_BUDGET.length - 1, b)];
    if (s.emitters < lo || s.emitters > hi) {
      report.budget++;
      add({ rule: 'W6', id: `slab${k}`, depth: k * SLAB_ROWS, detail: `${s.emitters} emitters, budget ${lo}-${hi}` });
    }
    // Rule 7: nothing decorative in the footprint, nothing flush with the cut in the dig's view column.
    for (const p of s.props) {
      if (p.x >= SHAFT_X0 && p.x <= SHAFT_X1 + 1 && p.z >= CELL_Z0) add({ rule: '7', id: p.id, depth: -p.y, detail: `${p.kind} in the shaft footprint` });
      else if (nearDigFace(p.x, p.z)) add({ rule: '7', id: p.id, depth: -p.y, detail: `${p.kind} flush with the dig face` });
    }
  }
  // Per cavern: rules 1-5.
  const inside = (c: CavernSpec, x: number, d: number, z: number, pad = 0.6) => x >= c.x0 - pad && x <= c.x1 + 1 + pad && d >= c.top - 1 && d <= c.bottom + 1.5 && z >= c.z0 - pad && z <= c.z1 + 1 + pad;
  const emptyFloor: Array<{ d: number; floor: number; empty: number }> = [];
  const all = [...caverns.values()];
  // A small cavern swallowed by a bigger one (an alcove a chamber later carved through) is part of that room.
  const overlap = (a: CavernSpec, b: CavernSpec) => {
    const ix = Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0) + 1);
    const iy = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) + 1);
    const iz = Math.max(0, Math.min(a.z1, b.z1) - Math.max(a.z0, b.z0) + 1);
    return (ix * iy * iz) / ((a.x1 - a.x0 + 1) * (a.bottom - a.top + 1) * (a.z1 - a.z0 + 1));
  };
  const swallowed = (c: CavernSpec) => (c.kind === 'alcove' || c.kind === 'pocket') && all.some((o) => o !== c && o.kind !== 'alcove' && o.kind !== 'pocket' && o.kind !== 'geode' && overlap(c, o) >= 0.6);
  for (const c of caverns.values()) {
    if (c.bottom < from || c.top >= to || c.kind === 'geode' || swallowed(c)) continue;
    report.caverns++;
    const vol = (c.x1 - c.x0 + 1) * (c.bottom - c.top + 1) * (c.z1 - c.z0 + 1);
    const mine = props.filter((p) => inside(c, p.x, -p.y, p.z));
    const taps = mine.filter((p) => p.tap).length;
    if (vol >= 27 && mine.length === 0) add({ rule: '1', id: c.id, depth: c.top, detail: `${vol} m³ and nothing in it` });
    // The floor: per column, the lowest air voxel of the cavern above solid ground, outside the footprint.
    const floor: Array<[number, number]> = [];
    for (let z = Math.max(0, c.z0); z <= Math.min(CUT - 1, c.z1); z++)
      for (let x = Math.max(0, c.x0); x <= Math.min(RING_SX - 1, c.x1); x++) {
        if (x >= SHAFT_X0 && x <= SHAFT_X1 && z >= CELL_Z0) continue;
        for (let d = c.bottom; d >= c.top; d--) {
          if (w.get(x, d, z) !== B.AIR) continue;
          if (SOLID[w.get(x, d + 1, z)]) floor.push([x, z]);
          break;
        }
      }
    const need = Math.min(12, Math.ceil(floor.length / 6));
    if (floor.length >= 9 && mine.length < need) add({ rule: '2', id: c.id, depth: c.top, detail: `${mine.length} props on ${floor.length} m² (need ${need})` });
    // Rule 3: a light and a tappable.
    let lit = false;
    let walls = 0;
    let veined = 0;
    for (let d = c.top - 1; d <= c.bottom + 1; d++)
      for (let z = Math.max(0, c.z0 - 1); z <= Math.min(CUT - 1, c.z1 + 1); z++)
        for (let x = Math.max(0, c.x0 - 1); x <= Math.min(RING_SX - 1, c.x1 + 1); x++) {
          const id = w.get(x, d, z);
          if (id === B.LIGHT_LAMP || (isEmitter(id) && id !== B.AIR)) lit = true;
          if (!SOLID[id] || (x >= SHAFT_X0 && x <= SHAFT_X1 && z >= CELL_Z0)) continue;
          const open = w.get(x + 1, d, z) === B.AIR || w.get(x - 1, d, z) === B.AIR || w.get(x, d + 1, z) === B.AIR || w.get(x, d - 1, z) === B.AIR || w.get(x, d, z + 1) === B.AIR || w.get(x, d, z - 1) === B.AIR;
          if (!open) continue;
          walls++;
          if (isEmitter(id) || (VALUE_CLASS[id] ?? 0) >= 2 || id === B.GEODE) veined++;
        }
    for (const p of mine) if (p.emitters.length) lit = true;
    if (!lit) add({ rule: '3', id: c.id, depth: c.top, detail: 'no emitter' });
    if (taps === 0) add({ rule: '3', id: c.id, depth: c.top, detail: 'no tappable' });
    if (walls > 0 && veined / walls < 0.08) add({ rule: '4', id: c.id, depth: c.top, detail: `veins on ${((100 * veined) / walls).toFixed(1)} % of ${walls} wall faces` });
    if (vol >= 50 && !motes.some((m) => inside(c, m.x, -m.y, m.z, 1))) add({ rule: '5', id: c.id, depth: c.top, detail: `${vol} m³ without an ambient emitter` });
    // Empty floor: cells farther than 2 m from any prop or tappable.
    if (floor.length) {
      let empty = 0;
      for (const [x, z] of floor) if (!mine.some((p) => Math.hypot(p.x - (x + 0.5), p.z - (z + 0.5)) <= 2)) empty++;
      emptyFloor.push({ d: c.top, floor: floor.length, empty });
    }
  }
  // Rule 6: a find in every 8 rows of the cut face below the floor.
  const findRow = (d: number): boolean => {
    const ks = shaftKinds.get(d);
    if (ks) for (let c = 0; c < 7; c++) if (SPECIAL.has(ks[c])) return true;
    for (let x = SHAFT_X0 - 7; x <= SHAFT_X1 + 7; x++) {
      if (x >= SHAFT_X0 && x <= SHAFT_X1) continue;
      const id = w.get(x, d, CUT - 1);
      if (id === B.AIR || isEmitter(id) || (VALUE_CLASS[id] ?? 0) >= 2 || id === B.GEODE || id === B.FOSSIL) return true;
    }
    return false;
  };
  for (let d = Math.max(from, 1); d + 8 <= to; d += 4) {
    let ok = false;
    for (let r = d; r < d + 8 && !ok; r++) ok = findRow(r);
    if (!ok) add({ rule: '6', id: `cut${d}`, depth: d, detail: 'no find in 8 rows of the cut face' });
  }
  // Density per 20 m window.
  const fail = (t: string, d = 0) => {
    report.density[t] = (report.density[t] ?? 0) + 1;
    add({ rule: `W1:${t}`, id: `w${d}`, depth: d, detail: `the 20 m window at ${d} m misses '${t}'` });
  };
  const sum: Record<string, number> = { caverns: 0, tappables: 0, creatures: 0, motes: 0 };
  const tapRows = props.filter((p) => p.tap).map((p) => Math.round(-p.y - 0.5)).sort((a, b) => a - b);
  for (let d = Math.max(from, 0); d + 20 <= to; d += 10) {
    report.windows++;
    const e = d + 20;
    const cav = all.filter((c) => c.bottom >= d && c.top < e && !swallowed(c));
    const big = cav.filter((c) => c.kind !== 'alcove').length;
    const alcoves = cav.length - big;
    if (big < 1 && alcoves < 3) fail('caverns', d);
    // Light: the shaft's lamps (every 6 m, warm) plus a biome emitter of another hue in view.
    let hue = false;
    const key = kitOf(baseBiome(biomeAt(d + 10))).emitter;
    for (let r = d; r < e && !hue; r++)
      for (let z = 30; z < CUT && !hue; z++)
        for (let x = SHAFT_X0 - 8; x <= SHAFT_X1 + 8 && !hue; x++) {
          const id = w.get(x, r, z);
          if (isEmitter(id) && id !== B.LIGHT_LAMP && (id === key || id >= 176)) hue = true;
        }
    if (!hue) fail('light', d);
    const crs = creatures.filter((c) => -c.y >= d && -c.y < e).length;
    const mts = motes.filter((m) => -m.y >= d && -m.y < e).length;
    // Only pools a frontal camera can see count: those in caverns open at the cut (their front edge near it).
    const lqs = liquids.filter((l) => -l.y >= d && -l.y < e && l.z1 >= CUT - 2).length;
    if (crs + mts + lqs + 1 < 4) fail('moving', d);
    const taps = props.filter((p) => p.tap && -p.y >= d && -p.y < e).length;
    if (taps + crs + mts + 3 < 8) fail('interactive', d);
    sum.caverns += cav.length;
    sum.tappables += taps;
    sum.creatures += crs;
    sum.motes += mts;
    for (let r = d; r < e; r += 4) {
      let any = false;
      for (let q = r; q < r + 4 && !any; q++) any = findRow(q);
      if (!any) {
        fail('special', d);
        break;
      }
    }
    for (let f = d; f < e; f++)
      if (!tapRows.some((t) => t >= f - 5 && t <= f + 6)) {
        fail('tappable', d);
        break;
      }
    const ef = emptyFloor.filter((x) => x.d >= d && x.d < e);
    const fl = ef.reduce((a, x) => a + x.floor, 0);
    const em = ef.reduce((a, x) => a + x.empty, 0);
    if (fl > 0 && em / fl > 0.35) fail('emptyFloor', d);
  }
  for (const k of Object.keys(sum)) report.means[k] = report.windows ? sum[k] / report.windows : 0;
  void BACK_Z;
  return report;
}
