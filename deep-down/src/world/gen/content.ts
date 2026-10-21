import { B, SOLID, RAMP, isEmitter } from '../../config/blocks';
import { hash32 } from '../../core/math';
import { Rng } from '../../core/rng';
import { reachableCells } from '../analysis/reachability';
import { VoxelWorld } from '../VoxelWorld';
import type { FeatureLayout, V3 } from './features/types';
import type { PropSpec, WorldLayout } from './types';

/**
 * The content pass (finished game): no walkable floor is left with nothing to find nearby.
 *
 * After every other pass, it walks the reachable floor (with every barrier open and the rides on),
 * finds the stretches farthest from anything worth seeing, and puts something there, until no
 * floor is more than CONTENT_GAP metres from a find. What it puts depends on the place:
 *
 * - against a wall: an ore vein of the depth's tier (copper high up, copper and iron in the Hollow,
 *   iron and lanternstone in the deep), or a secret alcove: a pocket in the rock behind a patch of
 *   loose masonry, with a Halden cache and a warm lamp inside (the light stays in until it opens);
 * - on open floor: a Halden supply crate or barrel, a Halden cache chest, or a glimmer cluster.
 *
 * Caches carry deterministic loot (PropSpec.loot) and open with a tap (game/Progression). Nothing is
 * placed in camp, on stairs or built floors, on living rock, on a rune door, or within 2 m of a prop.
 * No cold light is added (the Hollow's cyan budget): clusters here have no emitter. Own random stream;
 * prop ids c_<kind>_<n>.
 */
export const CONTENT_GAP = 7.5;
/** Secret alcoves wanted, and their spacing (m). */
export const SECRETS = { perBand: { roots: 3, hollow: 4, deep: 3 } as Record<Band, number>, spacing: 14 };

export interface ContentLayout {
  /** Points of interest placed (the spacing tools count them). */
  pois: Array<{ id: string; p: V3; kind: 'ore' | 'cache' | 'crate' | 'cluster' | 'secret' | 'lanternstone' }>;
  /** Secret alcoves: the mouth cells (loose masonry) and the cache prop inside. */
  secrets: Array<{ id: string; mouth: V3[]; prop: string }>;
  /**
   * Ambient wonder for the renderer (no gameplay): drips fall from `p` (a roof point over walkable
   * floor, `drop` metres to the floor); glow caps (fungi) grow on the floor at `p` against a wall,
   * in clumps of `n`.
   */
  ambient: Array<{ kind: 'drip'; p: V3; drop: number } | { kind: 'fungus'; p: V3; n: number }>;
}

const HOST = new Set<number>([B.SLATE, B.DEEP_SLATE, B.UMBER, B.GRAVEL, B.SOIL, B.MOSS]);
const FLOOR_OK = new Set<number>([B.SLATE, B.DEEP_SLATE, B.UMBER, B.GRAVEL, B.SOIL, B.MOSS, B.COPPER_ORE, B.IRON_ORE]);
const DIRS: V3[] = [[1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1]];

type Band = 'roots' | 'hollow' | 'deep';
const bandOf = (y: number): Band => (y >= 86 ? 'roots' : y >= 36 ? 'hollow' : 'deep');

type Loot = NonNullable<PropSpec['loot']>;

/** Loot of a container, deterministic from its id: a little for crates, more for caches and secrets. */
export function lootFor(id: string, band: Band, kind: 'crate' | 'cache' | 'secret'): Loot {
  const h = hash32(id.split('').reduce((a, c) => Math.imul(a ^ c.charCodeAt(0), 16777619), 2166136261));
  const r = (k: number, lo: number, hi: number) => lo + (((h >>> (k * 4)) & 15) % (hi - lo + 1));
  const out: Loot = {};
  const add = (item: keyof Loot, n: number) => {
    if (n > 0) out[item] = (out[item] ?? 0) + n;
  };
  if (band === 'roots') {
    add('copperOre', r(0, 1, 2));
    add(r(1, 0, 1) ? 'rootFibre' : 'stone', r(2, 2, 3));
  } else if (band === 'hollow') {
    add('copperOre', r(0, 1, 2));
    add(r(1, 0, 2) === 0 ? 'ironOre' : 'rootFibre', r(2, 1, 2));
  } else {
    add('ironOre', r(0, 1, 2));
    add(r(1, 0, 2) === 0 ? 'echoShard' : 'copperOre', r(2, 1, 2));
  }
  if (kind !== 'crate') add('glimmerShard', r(3, 1, 2));
  if (kind === 'secret') {
    if (band === 'deep') add('echoShard', 1);
    else if (band === 'hollow') add('ironOre', r(4, 1, 2));
    else add('copperOre', 2);
  }
  return out;
}

export interface ContentCtx {
  world: VoxelWorld;
  seed: number;
  layout: Pick<WorldLayout, 'props' | 'landmarks' | 'structures' | 'camp' | 'spawn'>;
  features?: FeatureLayout;
}

export function placeContent(ctx: ContentCtx): ContentLayout {
  const { world: w, layout, features } = ctx;
  const rng = new Rng(ctx.seed ^ 0xc047e47);
  const out: ContentLayout = { pois: [], secrets: [], ambient: [] };
  const sxy = w.sx * w.sy;
  const seq = new Map<string, number>();
  const nextId = (kind: string) => {
    const n = seq.get(kind) ?? 0;
    seq.set(kind, n + 1);
    return `c_${kind}_${n}`;
  };

  // Cells nobody else may lose: living rock, rune doors, prop anchors and emitters.
  const keep = new Set<number>();
  for (const s of features?.living ?? []) for (const i of s.cells) keep.add(i);
  for (const d of features?.runeDoors ?? []) for (const [x, y, z] of [...d.cells, ...d.lintel]) keep.add(w.index(x, y, z));
  for (const p of layout.props) {
    if (p.anchor) keep.add(w.index(p.anchor[0], p.anchor[1], p.anchor[2]));
    for (const [x, y, z] of p.emitters) keep.add(w.index(x, y, z));
  }
  const host = (x: number, y: number, z: number) => w.inBounds(x, y, z) && HOST.has(w.get(x, y, z)) && !keep.has(w.index(x, y, z));

  // The reachable floor with every barrier open (a copy: the real world keeps its seals).
  const open = new VoxelWorld(w.sx, w.sy, w.sz, w.chunkSize);
  open.blocks.set(w.blocks);
  // A lookup table, not property reads per voxel (3.3 M of them).
  const barrier = new Uint8Array(256);
  for (const id of [B.CRUMBLING_BRICK, B.HARDENED_SLATE, B.IRONBOUND, B.EMBER_GLASS]) barrier[id] = 1;
  const ob = open.blocks;
  for (let i = 0; i < ob.length; i++) if (barrier[ob[i]]) ob[i] = 0;
  for (const d of features?.runeDoors ?? []) for (const [x, y, z] of d.cells) open.blocks[open.index(x, y, z)] = B.AIR;
  const sp = layout.spawn;
  const seen = reachableCells(open, Math.floor(sp.x), Math.floor(sp.y) + 1, Math.floor(sp.z), 3, features?.links ?? []);

  // Floor columns: the lowest reachable stand in each (x, z), outside camp, on natural ground.
  const camp = layout.camp;
  const cols: Array<[number, number, number]> = [];
  const colSeen = new Set<number>();
  for (let i = 0; i < seen.length; i++) {
    if (!seen[i]) continue;
    const x = i % w.sx;
    const y = Math.floor(i / w.sx) % w.sy;
    const z = Math.floor(i / sxy);
    // One entry per column and 16 m storey (the Hollow's floor and the deep under it are separate).
    const k2 = (x + z * w.sx) * 8 + Math.floor(y / 16);
    if (colSeen.has(k2)) continue;
    colSeen.add(k2);
    if (x >= camp.min[0] - 2 && x <= camp.max[0] + 2 && z >= camp.min[2] - 2 && z <= camp.max[2] + 2 && y >= camp.min[1] - 2) continue;
    cols.push([x, y, z]);
  }

  // Everything already worth seeing.
  const things: V3[] = [];
  for (const p of layout.props) things.push([p.x, p.y, p.z]);
  for (const v of Object.values(layout.landmarks)) things.push([v[0], v[1], v[2]]);
  for (const st of layout.structures) {
    if ('x' in st && 'y' in st && 'z' in st && typeof st.x === 'number' && typeof st.y === 'number' && typeof st.z === 'number') things.push([st.x, st.y, st.z]);
    else if (st.kind === 'beam') things.push([(st.a[0] + st.b[0]) / 2, (st.a[1] + st.b[1]) / 2, (st.a[2] + st.b[2]) / 2]);
    else if (st.kind === 'stairFlight') things.push([st.x0, st.top, st.z0]);
    else if (st.kind === 'deck') things.push([(st.x0 + st.x1) / 2, st.y, (st.z0 + st.z1) / 2]);
  }
  for (const f of features?.pois ?? []) things.push(f.p);
  // Squared distances (Math.hypot is slow in a loop this size).
  const n = cols.length;
  const cx = new Float32Array(n);
  const cy = new Float32Array(n);
  const cz = new Float32Array(n);
  cols.forEach(([x, y, z], k) => ((cx[k] = x + 0.5), (cy[k] = y), (cz[k] = z + 0.5)));
  const dist = new Float32Array(n).fill(Infinity);
  const near = (c: V3) => {
    for (let k = 0; k < n; k++) {
      const dx = cx[k] - c[0];
      const dz = cz[k] - c[2];
      if (dx > 40 || dx < -40 || dz > 40 || dz < -40) continue;
      const dy = (cy[k] - c[1]) * 1.6;
      const d = dx * dx + dy * dy + dz * dz;
      if (d < dist[k]) dist[k] = d;
    }
  };
  for (const t of things) near(t);
  const propsAt: V3[] = layout.props.map((p) => [p.x, p.y, p.z]);
  const clearOfProps = (x: number, y: number, z: number, r = 2) => propsAt.every((p) => Math.hypot(p[0] - x, (p[1] - y) * 1.5, p[2] - z) >= r);

  const counts = { cache: 0, crate: 0, cluster: 0, secret: 0, ore: 0, lanternstone: 0 };
  const failed = new Uint8Array(cols.length);
  for (let guard = 0; guard < 400; guard++) {
    // The column farthest from anything.
    let best = -1;
    let bd = CONTENT_GAP * CONTENT_GAP;
    for (let k = 0; k < n; k++) if (dist[k] > bd && !failed[k]) ((bd = dist[k]), (best = k));
    if (best < 0) break;
    const [x, y, z] = cols[best];
    const band = bandOf(y);
    const placed = place(x, y, z, band);
    if (!placed) {
      failed[best] = 1;
      continue;
    }
    near(placed);
  }
  // Secrets: spread over the whole descent, at least SECRETS.spacing apart, each behind a wall
  // beside a walkable floor (in a shuffled order so they do not all gather at one end).
  const order = Array.from({ length: n }, (_, k) => k);
  for (let k = n - 1; k > 0; k--) {
    const j = rng.int(0, k);
    [order[k], order[j]] = [order[j], order[k]];
  }
  const secretAt = out.secrets.map((s) => s.mouth[0]);
  const inBand: Record<Band, number> = { roots: 0, hollow: 0, deep: 0 };
  for (const p of secretAt) inBand[bandOf(p[1])]++;
  for (const k of order) {
    const [x, y, z] = cols[k];
    const band = bandOf(y);
    if (inBand[band] >= SECRETS.perBand[band]) continue;
    if (secretAt.some((p) => Math.hypot(p[0] - x, (p[1] - y) * 1.5, p[2] - z) < SECRETS.spacing)) continue;
    const low = wallNear(x, y, z, 0);
    if (!low) continue;
    if (alcove(low, band)) {
      secretAt.push(low.cell);
      inBand[band]++;
    }
  }
  // Loose stone and roots first: the drips and glow caps then stand on the floors as they are.
  scree(order);
  ambientWonder(order);
  return out;

  /**
   * Round 2 (WORLD): plain rock no longer yields, so the stone the recipes need comes from heaps
   * of loose stone at the foot of the walls along every route, and root fibre from root tangles in
   * the walls of the high caves and the Glowroot. Heaps are one course high with two open cells
   * over them (a step, never a wall), never on a ride's stand, a door or a prop.
   */
  function scree(shuffled: number[]): void {
    const heaps: V3[] = [];
    const rootsAt: V3[] = [];
    const stands = (features?.links ?? []).flatMap((l) => [l.top, l.bottom]);
    const clearOfStands = (x: number, y: number, z: number) => stands.every((s) => Math.hypot(s[0] - x - 0.5, (s[1] - y) * 1.5, s[2] - z - 0.5) >= 2.2);
    const free = (x: number, y: number, z: number) =>
      FLOOR_OK.has(w.get(x, y - 1, z)) && !RAMP[w.get(x, y - 1, z)] && !SOLID[w.get(x, y, z)] && !SOLID[w.get(x, y + 1, z)] && !SOLID[w.get(x, y + 2, z)] && !isEmitter(w.get(x, y, z)) && !keep.has(w.index(x, y - 1, z));
    for (const k of shuffled) {
      const [x, y, z] = cols[k];
      if (heaps.length < 46 && heaps.every((p) => Math.hypot(p[0] - x, (p[1] - y) * 0.7, p[2] - z) >= 7)) {
        const wall = wallNear(x, y, z, 0);
        if (wall) {
          // The heap sits against the wall, in the open cell in front of it.
          const hx = wall.cell[0] + wall.out[0];
          const hz = wall.cell[2] + wall.out[2];
          if (free(hx, y, hz) && clearOfProps(hx + 0.5, y, hz + 0.5, 1.4) && clearOfStands(hx, y, hz)) {
            w.blocks[w.index(hx, y, hz)] = B.RUBBLE;
            // One or two more stones along the wall.
            const px = Math.abs(wall.out[2]);
            const pz = Math.abs(wall.out[0]);
            for (const side of [1, -1]) {
              const sx2 = hx + px * side;
              const sz2 = hz + pz * side;
              if (rng.chance(0.7) && free(sx2, y, sz2) && clearOfProps(sx2 + 0.5, y, sz2 + 0.5, 1.4) && clearOfStands(sx2, y, sz2)) w.blocks[w.index(sx2, y, sz2)] = B.RUBBLE;
            }
            heaps.push([x, y, z]);
            poi(`c_rubble_${hx}_${y}_${hz}`, [hx + 0.5, y + 0.5, hz + 0.5], 'ore');
          }
        }
      }
      const rooty = y >= 86 || (x >= 67 && x <= 99 && z >= 119 && y < 20);
      if (rooty && rootsAt.length < 18 && rootsAt.every((p) => Math.hypot(p[0] - x, (p[1] - y) * 0.7, p[2] - z) >= 9)) {
        const wall = wallNear(x, y, z, 1);
        // Roots in the wall at head height (never a floor cell: no pits).
        if (wall && host(wall.cell[0], wall.cell[1] + 1, wall.cell[2])) {
          const at = { cell: [wall.cell[0], wall.cell[1] + 1, wall.cell[2]] as V3, out: wall.out };
          const v = vein(at, B.ROOTS, 2 + rng.int(0, 2));
          if (v) rootsAt.push([x, y, z]);
        }
      }
      if (heaps.length >= 46 && rootsAt.length >= 18) break;
    }
  }

  // ------------------------------------------------------------------------------------

  /**
   * Drips and glow caps, spread out (12 m and 6 m apart): drips under roofs 3-9 m up, more of them
   * by damp stone and in the deep; glow caps against walls, most of them below the Hollow's floor.
   */
  function ambientWonder(shuffled: number[]): void {
    const drips: V3[] = [];
    const caps: V3[] = [];
    for (const k of shuffled) {
      const [x, y, z] = cols[k];
      if (drips.length < 28 && drips.every((p) => Math.hypot(p[0] - x, (p[1] - y) * 0.5, p[2] - z) >= 12)) {
        let roof = y + 2;
        while (roof < y + 12 && !SOLID[w.get(x, roof, z)]) roof++;
        const drop = roof - y;
        if (drop >= 3 && drop <= 9 && SOLID[w.get(x, roof, z)] && !RAMP[w.get(x, y - 1, z)]) {
          drips.push([x, y, z]);
          out.ambient.push({ kind: 'drip', p: [x + 0.5, roof, z + 0.5], drop });
        }
      }
      if (caps.length < 36 && (y < 36 || rng.chance(0.35)) && caps.every((p) => Math.hypot(p[0] - x, (p[1] - y) * 0.5, p[2] - z) >= 6)) {
        const wall = wallNear(x, y, z, 0);
        if (wall && FLOOR_OK.has(w.get(x, y - 1, z)) && !SOLID[w.get(x, y, z)] && clearOfProps(x + 0.5, y, z + 0.5, 1.2)) {
          caps.push([x, y, z]);
          const fx = x + 0.5 + (wall.cell[0] - x) * 0.35;
          const fz = z + 0.5 + (wall.cell[2] - z) * 0.35;
          // The clump's own cell must stand on rock (a wall cell two away can pull it over a step).
          if (SOLID[w.get(Math.floor(fx), y - 1, Math.floor(fz))] && !SOLID[w.get(Math.floor(fx), y, Math.floor(fz))]) out.ambient.push({ kind: 'fungus', p: [fx, y, fz], n: 3 + rng.int(0, 4) });
        }
      }
      if (drips.length >= 28 && caps.length >= 36) break;
    }
  }

  /** Put one find at or near the floor cell (x, feet y, z). @returns where, or null. */
  function place(x: number, y: number, z: number, band: Band): V3 | null {
    const wall = wallNear(x, y, z, 1);
    const roll = rng.next();
    if (wall) {
      if (roll < 0.45 && counts.secret < 6) {
        const low = wallNear(x, y, z, 0);
        const s = low ? alcove(low, band) : null;
        if (s) return s;
      }
      if (band === 'deep' && roll < 0.4) {
        const v = vein(wall, B.LANTERNSTONE, 2);
        if (v) return (counts.lanternstone++, v);
      }
      if (roll < 0.72) {
        const ore = band === 'roots' ? B.COPPER_ORE : band === 'hollow' ? (rng.chance(0.55) ? B.COPPER_ORE : B.IRON_ORE) : rng.chance(0.7) ? B.IRON_ORE : B.COPPER_ORE;
        const v = vein(wall, ore, 3 + rng.int(0, 2));
        if (v) return (counts.ore++, v);
      }
    }
    if (!FLOOR_OK.has(w.get(x, y - 1, z)) || RAMP[w.get(x, y - 1, z)] || !clearOfProps(x + 0.5, y, z + 0.5)) return null;
    if (SOLID[w.get(x, y, z)] || SOLID[w.get(x, y + 1, z)] || isEmitter(w.get(x, y, z))) return null;
    const px = x + 0.5 + rng.range(-0.2, 0.2);
    const pz = z + 0.5 + rng.range(-0.2, 0.2);
    const r2 = rng.next();
    if (r2 < 0.3 && counts.cluster < 16) {
      const id = nextId('crystalCluster');
      addProp({ id, kind: 'crystalCluster', x: px, y, z: pz, rotY: rng.range(0, Math.PI * 2), scale: rng.range(0.7, 1.05), anchor: [x, y - 1, z], emitters: [], seed: rng.int(0, 1 << 30), minable: { hardness: 2.5, tier: 1, drop: 'glimmerShard', min: 1, max: 2 } });
      counts.cluster++;
      return poi(id, [px, y + 0.5, pz], 'cluster');
    }
    const cache = r2 > 0.78 && counts.cache < 10;
    const kind = cache ? 'chest' : rng.chance(0.65) ? 'crate' : 'barrel';
    const id = nextId(kind);
    addProp({ id, kind, x: px, y, z: pz, rotY: rng.range(0, Math.PI * 2), scale: kind === 'chest' ? 0.9 : rng.range(0.8, 1), anchor: [x, y - 1, z], emitters: [], seed: rng.int(0, 1 << 30), interact: 'feature', feature: { kind: 'cache', id }, loot: lootFor(id, band, cache ? 'cache' : 'crate') });
    if (cache) counts.cache++;
    else counts.crate++;
    return poi(id, [px, y + 0.6, pz], cache ? 'cache' : 'crate');
  }

  /** An exposed host cell of a wall within 2.5 m at knee to head height, with the open cell in front. */
  function wallNear(x: number, y: number, z: number, maxDy: number): { cell: V3; out: V3 } | null {
    let best: { cell: V3; out: V3 } | null = null;
    let bd = Infinity;
    for (let dz = -3; dz <= 3; dz++)
      for (let dx = -3; dx <= 3; dx++)
        for (let dy = 0; dy <= maxDy; dy++) {
          const cx = x + dx;
          const cy = y + dy;
          const cz = z + dz;
          if (!host(cx, cy, cz)) continue;
          for (const d of DIRS) {
            const ox = cx + d[0];
            const oz = cz + d[2];
            if (SOLID[w.get(ox, cy, oz)]) continue;
            const dd = Math.hypot(dx, dz);
            if (dd < bd && dd <= 2.6) {
              bd = dd;
              best = { cell: [cx, cy, cz], out: d };
            }
          }
        }
    return best;
  }

  /** Grow a vein of `ore` from the wall cell along the wall face. @returns the vein's first cell centre. */
  function vein(wall: { cell: V3; out: V3 }, ore: number, size: number): V3 | null {
    let cur = wall.cell;
    let n = 0;
    for (let k = 0; k < size * 3 && n < size; k++) {
      if (host(...cur)) {
        w.blocks[w.index(...cur)] = ore;
        n++;
      }
      const opts: V3[] = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]
        .map(([a, b, c]) => [cur[0] + a, cur[1] + b, cur[2] + c] as V3)
        .filter((c) => host(...c) && DIRS.some((d) => !SOLID[w.get(c[0] + d[0], c[1], c[2] + d[2])]));
      if (!opts.length) break;
      cur = opts[rng.int(0, opts.length - 1)];
    }
    if (n === 0) return null;
    const c: V3 = [wall.cell[0] + 0.5, wall.cell[1] + 0.5, wall.cell[2] + 0.5];
    poi(`c_${ore === B.LANTERNSTONE ? 'lanternstone' : 'ore'}_${wall.cell.join('_')}`, c, ore === B.LANTERNSTONE ? 'lanternstone' : 'ore');
    return c;
  }

  /**
   * A secret alcove behind the wall cell: a 3 x 2 x 2 pocket in solid rock, its 1 x 2 mouth closed by
   * loose masonry, a Halden cache and a warm lamp inside. Every cell round the pocket must be rock.
   */
  function alcove(wall: { cell: V3; out: V3 }, band: Band): V3 | null {
    const [mx, my, mz] = wall.cell;
    const [ox, , oz] = wall.out;
    const ix = -ox;
    const iz = -oz;
    // Perpendicular along the wall.
    const px = Math.abs(oz);
    const pz = Math.abs(ox);
    const pocket: V3[] = [];
    for (let depth = 1; depth <= 2; depth++)
      for (let side = -1; side <= 1; side++)
        for (let h = 0; h <= 1; h++) pocket.push([mx + ix * depth + px * side, my + h, mz + iz * depth + pz * side]);
    const mouth: V3[] = [[mx, my, mz], [mx, my + 1, mz]];
    // The mouth must be rock with open air in front at both heights, the floor in front solid.
    for (const [x, y, z] of mouth) if (!host(x, y, z) || SOLID[w.get(x + ox, y, z + oz)]) return null;
    if (!SOLID[w.get(mx + ox, my - 1, mz + oz)]) return null;
    // The pocket and a shell of one cell round it (except the mouth) must be solid host rock.
    const inPocket = new Set(pocket.map((c) => c.join(',')));
    const isMouth = new Set(mouth.map((c) => c.join(',')));
    // Faces only: light and walking go through faces, so a 6-neighbour shell keeps it sealed.
    const SIX: V3[] = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
    for (const [x, y, z] of pocket) {
      if (!host(x, y, z)) return null;
      for (const [dx, dy, dz] of SIX) {
        const k = `${x + dx},${y + dy},${z + dz}`;
        if (inPocket.has(k) || isMouth.has(k)) continue;
        const id = w.get(x + dx, y + dy, z + dz);
        if (!SOLID[id] || isEmitter(id) || RAMP[id] || keep.has(w.index(x + dx, y + dy, z + dz))) return null;
      }
    }
    for (const [x, y, z] of pocket) w.blocks[w.index(x, y, z)] = B.AIR;
    for (const [x, y, z] of mouth) w.blocks[w.index(x, y, z)] = B.CRUMBLING_BRICK;
    // The cache at the back, a warm lamp over it.
    const bx = mx + ix * 2 + 0.5;
    const bz = mz + iz * 2 + 0.5;
    const id = nextId('chest');
    addProp({ id, kind: 'chest', x: bx, y: my, z: bz, rotY: Math.atan2(ox, oz), scale: 0.8, anchor: [mx + ix * 2, my - 1, mz + iz * 2], emitters: [], seed: rng.int(0, 1 << 30), interact: 'feature', feature: { kind: 'cache', id }, loot: lootFor(id, band, 'secret'), secret: id });
    const lx = mx + ix + px;
    const lz = mz + iz + pz;
    w.blocks[w.index(lx, my + 1, lz)] = B.LIGHT_LAMP;
    out.secrets.push({ id, mouth, prop: id });
    counts.secret++;
    // A few glow spores drift at the loose stones (they gather where the air moves).
    features?.mothAnchors.push({ id: `secret.${id}`, p: [mx + ox + 0.5, my + 1.2, mz + oz + 0.5], count: 3, radius: 0.7 });
    return poi(id, [mx + 0.5, my + 1, mz + 0.5], 'secret');
  }

  function addProp(p: PropSpec): void {
    layout.props.push(p);
    propsAt.push([p.x, p.y, p.z]);
  }

  function poi(id: string, p: V3, kind: ContentLayout['pois'][number]['kind']): V3 {
    out.pois.push({ id, p, kind });
    return p;
  }
}
