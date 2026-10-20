import { SOLID } from '../../../config/blocks';
import { hash32 } from '../../../core/math';
import { Rng } from '../../../core/rng';
import type { LivingSite } from './types';

/**
 * "The deep breathes": the Halden Face and the rift walls grow new ore every expedition.
 *
 * Each living site is a fixed list of wall cells with an exact table of ores per expedition
 * (config/livingRock.ts). rollLiving() deals the table out over the cells for one epoch (the
 * expedition number); the generator applies epoch 0, and the game applies each new epoch when the
 * explorer comes back to camp from the Hollow (game/WorldFeatures).
 *
 * Every cell gets a stable random key; epoch e ranks the cells by frac(key + e * phi) and gives
 * the first `count` of them the first ore, the next ones the second, and so on. The ranking window
 * slides by the golden ratio each epoch, so the ores of one expedition land on different cells
 * from the last one's (no overlap while the ores fill at most 38 % of a site) and, over many
 * expeditions, every cell of the wall takes its turn.
 */
const PHI = 0.6180339887498949;

/** Block id for every cell of `site` at `epoch` (host rock where the table has no ore). */
export function rollLiving(site: Pick<LivingSite, 'cells' | 'host' | 'table'>, seed: number, epoch: number): Uint8Array {
  const n = site.cells.length;
  const keys = new Float64Array(n);
  const shift = (epoch * PHI) % 1;
  for (let k = 0; k < n; k++) {
    const key = hash32(seed ^ Math.imul(site.cells[k], 0x9e37)) / 4294967296;
    keys[k] = (key + shift) % 1;
  }
  const order = Array.from({ length: n }, (_, k) => k).sort((a, b) => keys[a] - keys[b] || a - b);
  const out = site.host.slice();
  let at = 0;
  for (const row of site.table) {
    for (let c = 0; c < row.count && at < n; c++, at++) out[order[at]] = row.block;
  }
  return out;
}

export interface ApplyResult {
  /** Cells whose block changed. */
  changed: number;
  /** Of those, cells that had been mined out and grew back. */
  regrown: number;
  /** Bounding box of the changed cells (empty: x1 < x0). */
  box: { x0: number; y0: number; z0: number; x1: number; y1: number; z1: number };
}

/**
 * Write one epoch's roll into the world. Cells are only ever restored where the generated world is
 * solid (so no walk can be closed that the generated world left open), and never within `skipR`
 * of the given points (drops lying on the floor, the pack left behind).
 * @param set writes a cell (the game uses VoxelWorld.set so chunks remesh; the generator writes the array).
 */
export function applyLiving(
  blocks: Uint8Array,
  generated: Uint8Array,
  dims: { sx: number; sy: number },
  site: Pick<LivingSite, 'cells'>,
  ids: Uint8Array,
  set: (index: number, id: number) => void,
  skip: ReadonlyArray<readonly [number, number, number]> = [],
  skipR = 1.5,
): ApplyResult {
  const { sx, sy } = dims;
  const res: ApplyResult = { changed: 0, regrown: 0, box: { x0: Infinity, y0: Infinity, z0: Infinity, x1: -Infinity, y1: -Infinity, z1: -Infinity } };
  for (let k = 0; k < site.cells.length; k++) {
    const i = site.cells[k];
    if (!SOLID[generated[i]]) continue;
    const target = ids[k];
    const cur = blocks[i];
    if (cur === target) continue;
    const x = i % sx;
    const y = Math.floor(i / sx) % sy;
    const z = Math.floor(i / (sx * sy));
    let near = false;
    for (const p of skip) {
      if (Math.hypot(x + 0.5 - p[0], y + 0.5 - p[1], z + 0.5 - p[2]) < skipR) {
        near = true;
        break;
      }
    }
    if (near) continue;
    if (!SOLID[cur]) res.regrown++;
    set(i, target);
    res.changed++;
    const b = res.box;
    b.x0 = Math.min(b.x0, x);
    b.y0 = Math.min(b.y0, y);
    b.z0 = Math.min(b.z0, z);
    b.x1 = Math.max(b.x1, x);
    b.y1 = Math.max(b.y1, y);
    b.z1 = Math.max(b.z1, z);
  }
  return res;
}

/**
 * The bloom site (index into FeatureLayout.blooms) of each epoch: every run of `n` expeditions
 * visits every site once in a shuffled order, epoch 0 starts at `first`, and no site comes twice
 * in a row (also across runs).
 */
export function bloomSiteFor(epoch: number, n: number, seed: number, first = 0): number {
  if (n <= 1) return 0;
  const e = Math.max(0, Math.floor(epoch));
  const c = Math.floor(e / n);
  const perm = basePerm(c, n, seed, first);
  if (c > 0 && n > 2) {
    const prevLast = basePerm(c - 1, n, seed, first)[n - 1];
    if (perm[0] === prevLast) [perm[0], perm[1]] = [perm[1], perm[0]];
  }
  return perm[e % n];
}

function basePerm(c: number, n: number, seed: number, first: number): number[] {
  const rng = new Rng(seed ^ Math.imul(c + 1, 0x2545f491));
  const p = Array.from({ length: n }, (_, k) => k);
  for (let k = n - 1; k > 0; k--) {
    const j = rng.int(0, k);
    [p[k], p[j]] = [p[j], p[k]];
  }
  if (c === 0) {
    const at = p.indexOf(first);
    [p[0], p[at]] = [p[at], p[0]];
  }
  return p;
}
