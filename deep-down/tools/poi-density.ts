// Spacing of the things worth seeing along the walked routes (final pass W2, world variety).
// Usage: node tools/run-ts.mjs tools/poi-density.ts            (prints every leg and the empty floor)
// tests/unit/worldFeatures.test.ts imports measureSpacing() and emptyFloor() and holds the thresholds.
//
// Method: the barriers a player opens (crumbling masonry, hardened slate, the rune doors, the
// grotto's plug) are opened, then each leg is walked as the shortest path over standable cells
// (walk, step up 1, drop up to 3, plus the rides), and every point of interest is "seen" the first
// time it is within its range of the eye (1.5 m over the path cell) with a clear line of sight:
// 12 m for sights and pickups, 30 m for landmarks, 25 m for columns, 6 m for ore. A leg's gap is the
// longest stretch of walking between two fresh sights (not seen on an earlier leg; lamps do not
// count); a ride counts as 4 m of walking.
import { B, SOLID } from '../src/config/blocks';
import { generateWorld } from '../src/world/gen/generateWorld';
import type { WorldLayout } from '../src/world/gen/types';
import type { VoxelWorld } from '../src/world/VoxelWorld';

type P = [number, number, number];
type Cat = 'lamp' | 'prop' | 'landmark' | 'column' | 'sight' | 'pickup' | 'ore';

export interface Poi {
  name: string;
  cat: Cat;
  p: P;
}

export interface LegResult {
  name: string;
  /** Walking metres (rides count 4 m). */
  length: number;
  fresh: number;
  /** Longest stretch without a fresh sight (ore not counted), and with ore counted. */
  maxSightGap: number;
  maxGap: number;
  events: string[];
}

const RANGE: Record<Cat, number> = { lamp: 12, prop: 12, sight: 12, pickup: 12, landmark: 30, column: 25, ore: 6 };

/** A copy of the world with every barrier a player opens taken away. */
export function openWorld(layout: WorldLayout): VoxelWorld {
  const w = layout.world;
  const copy = Object.create(Object.getPrototypeOf(w)) as VoxelWorld;
  Object.assign(copy, w, { blocks: w.blocks.slice() });
  const b = copy.blocks;
  for (let i = 0; i < b.length; i++) if (b[i] === B.CRUMBLING_BRICK || b[i] === B.HARDENED_SLATE) b[i] = B.AIR;
  const F = layout.features;
  if (F) {
    for (const d of F.runeDoors) for (const [x, y, z] of d.cells) b[copy.index(x, y, z)] = B.AIR;
    b[copy.index(70, 94, 61)] = B.AIR;
    b[copy.index(70, 95, 61)] = B.AIR;
  }
  return copy;
}

function standable(w: VoxelWorld, x: number, y: number, z: number): boolean {
  return !SOLID[w.get(x, y, z)] && !SOLID[w.get(x, y + 1, z)] && SOLID[w.get(x, y - 1, z)] === 1;
}

/** Breadth-first parents from a start cell (-2: unvisited, -1: the start), with ride links. */
export function walkParents(w: VoxelWorld, s: P, links: ReadonlyArray<{ top: readonly number[]; bottom: readonly number[] }> = []): Int32Array {
  const N = w.sx * w.sy * w.sz;
  const par = new Int32Array(N).fill(-2);
  const q = new Int32Array(N);
  let h = 0;
  let t = 0;
  let y0 = Math.floor(s[1]) + 2;
  while (y0 > 1 && !standable(w, Math.floor(s[0]), y0, Math.floor(s[2]))) y0--;
  const push = (i: number, from: number) => {
    if (par[i] !== -2) return;
    par[i] = from;
    q[t++] = i;
  };
  push(w.index(Math.floor(s[0]), y0, Math.floor(s[2])), -1);
  const jump = new Map<number, number[]>();
  for (const l of links) {
    const a = w.index(Math.floor(l.top[0]), Math.floor(l.top[1]), Math.floor(l.top[2]));
    const b = w.index(Math.floor(l.bottom[0]), Math.floor(l.bottom[1]), Math.floor(l.bottom[2]));
    jump.set(a, [...(jump.get(a) ?? []), b]);
    jump.set(b, [...(jump.get(b) ?? []), a]);
  }
  const sxy = w.sx * w.sy;
  while (h < t) {
    const i = q[h++];
    const z = Math.floor(i / sxy);
    const y = Math.floor(i / w.sx) % w.sy;
    const x = i % w.sx;
    for (const j of jump.get(i) ?? []) push(j, i);
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx;
      const nz = z + dz;
      if (standable(w, nx, y, nz)) push(w.index(nx, y, nz), i);
      if (!SOLID[w.get(x, y + 2, z)] && standable(w, nx, y + 1, nz)) push(w.index(nx, y + 1, nz), i);
      if (!SOLID[w.get(nx, y, nz)] && !SOLID[w.get(nx, y + 1, nz)])
        for (let d = 1; d <= 3; d++) {
          if (SOLID[w.get(nx, y - d, nz)]) break;
          if (standable(w, nx, y - d, nz)) {
            push(w.index(nx, y - d, nz), i);
            break;
          }
        }
    }
  }
  return par;
}

/** The walked path (cells) to the reached cell nearest a target, or [] when none is near. */
export function pathTo(w: VoxelWorld, par: Int32Array, tgt: readonly number[], r = 3): P[] {
  let best = -1;
  let bd = Infinity;
  for (let dy = -3; dy <= 3; dy++)
    for (let dz = -r; dz <= r; dz++)
      for (let dx = -r; dx <= r; dx++) {
        const x = Math.floor(tgt[0]) + dx;
        const y = Math.floor(tgt[1]) + dy;
        const z = Math.floor(tgt[2]) + dz;
        if (!w.inBounds(x, y, z)) continue;
        const i = w.index(x, y, z);
        if (par[i] === -2) continue;
        const d = Math.hypot(dx, dy * 1.5, dz);
        if (d < bd) {
          bd = d;
          best = i;
        }
      }
  if (best < 0) return [];
  const out: P[] = [];
  const sxy = w.sx * w.sy;
  for (let i = best; i >= 0; i = par[i]) out.push([i % w.sx, Math.floor(i / w.sx) % w.sy, Math.floor(i / sxy)]);
  return out.reverse();
}

function los(w: VoxelWorld, a: P, b: P): boolean {
  const d = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  const n = Math.ceil(d * 3);
  for (let k = 1; k < n; k++) {
    const t = k / n;
    const x = a[0] + (b[0] - a[0]) * t;
    const y = a[1] + (b[1] - a[1]) * t;
    const z = a[2] + (b[2] - a[2]) * t;
    if (SOLID[w.get(Math.floor(x), Math.floor(y), Math.floor(z))]) return Math.hypot(b[0] - x, b[1] - y, b[2] - z) < 1.2;
  }
  return true;
}

/** Every point of interest: props, landmarks, columns, the feature pass's points, ore (one per 3 m cluster). */
export function collectPois(layout: WorldLayout, w: VoxelWorld): Poi[] {
  const pois: Poi[] = [];
  for (const pr of layout.props) pois.push({ name: pr.id, cat: pr.kind === 'lanternPost' || pr.kind === 'hangingLantern' ? 'lamp' : pr.kind === 'crystalCluster' ? 'pickup' : 'prop', p: [pr.x, pr.y + 0.6, pr.z] });
  for (const [k, v] of Object.entries(layout.landmarks)) pois.push({ name: 'L:' + k, cat: 'landmark', p: [v[0], v[1] + 1, v[2]] });
  for (const s of layout.structures) if (s.kind === 'column') pois.push({ name: s.id, cat: 'column', p: [s.x, s.y + 3, s.z] });
  for (const f of layout.features?.pois ?? []) pois.push({ name: f.id, cat: f.kind, p: f.p });
  const seen: P[] = [];
  for (let z = 1; z < w.sz - 1; z++)
    for (let y = 1; y < w.sy - 1; y++)
      for (let x = 1; x < w.sx - 1; x++) {
        const id = w.get(x, y, z);
        if (id !== B.COPPER_ORE && id !== B.IRON_ORE && id !== B.CRYSTAL) continue;
        if (SOLID[w.get(x + 1, y, z)] && SOLID[w.get(x - 1, y, z)] && SOLID[w.get(x, y + 1, z)] && SOLID[w.get(x, y, z + 1)] && SOLID[w.get(x, y, z - 1)]) continue;
        const c: P = [x + 0.5, y + 0.5, z + 0.5];
        if (seen.some((q) => Math.hypot(q[0] - c[0], q[1] - c[1], q[2] - c[2]) < 3)) continue;
        seen.push(c);
        pois.push({ name: `ore${x}_${y}_${z}`, cat: 'ore', p: c });
      }
  return pois;
}

/** The legs the world-variety acceptance names, in walking order. */
export function legsOf(layout: WorldLayout): Array<[string, P, P]> {
  const L = layout.landmarks;
  const sp: P = [Math.floor(layout.spawn.x), Math.floor(layout.spawn.y), Math.floor(layout.spawn.z)];
  const seal: P = [L.seal[0] - 2, L.seal[1], L.seal[2]];
  const yard: P = [92, 41, 85];
  return [
    ['camp->ledge', sp, L.ledge],
    ['ledge->stairsBottom', L.ledge, L.stairsBottom],
    ['seal->balcony', seal, L.balcony],
    ['balcony->stone', L.balcony, L.stonePortal ?? L.monolith],
    ['stairsBottom->reliquary', L.stairsBottom, L.reliquary ?? [122.5, 42, 137]],
    ['ledge->yard', L.ledge, yard],
    ['yard->adit', yard, L.haldenFace ?? [103, 43, 56]],
  ];
}

/** Walk every leg and measure its gaps. */
export function measureSpacing(layout: WorldLayout): LegResult[] {
  const w = openWorld(layout);
  const pois = collectPois(layout, w);
  const links = layout.features?.links ?? [];
  const seen = new Set<string>();
  const out: LegResult[] = [];
  for (const [name, a, b] of legsOf(layout)) {
    const path = pathTo(w, walkParents(w, a, links), b);
    let dist = 0;
    const cum = [0];
    for (let k = 1; k < path.length; k++) {
      const st = Math.hypot(path[k][0] - path[k - 1][0], path[k][1] - path[k - 1][1], path[k][2] - path[k - 1][2]);
      dist += st > 3 ? 4 : st;
      cum.push(dist);
    }
    const ev: Array<{ d: number; n: string; c: Cat }> = [];
    const legSeen = new Set<string>();
    for (let k = 0; k < path.length; k++) {
      const eye: P = [path[k][0] + 0.5, path[k][1] + 1.5, path[k][2] + 0.5];
      for (const poi of pois) {
        if (legSeen.has(poi.name)) continue;
        if (Math.hypot(poi.p[0] - eye[0], poi.p[1] - eye[1], poi.p[2] - eye[2]) > RANGE[poi.cat]) continue;
        if (!los(w, eye, poi.p)) continue;
        legSeen.add(poi.name);
        ev.push({ d: cum[k], n: poi.name, c: poi.cat });
      }
    }
    const fresh = ev.filter((e) => e.c !== 'lamp' && !seen.has(e.n));
    const gap = (list: typeof fresh) => {
      const ds = [0, ...list.map((e) => e.d), dist].sort((x, y) => x - y);
      let g = 0;
      for (let k = 1; k < ds.length; k++) g = Math.max(g, ds[k] - ds[k - 1]);
      return g;
    };
    for (const e of ev) seen.add(e.n);
    out.push({
      name,
      length: Math.round(dist * 10) / 10,
      fresh: fresh.length,
      maxSightGap: Math.round(gap(fresh.filter((e) => e.c !== 'ore')) * 10) / 10,
      maxGap: Math.round(gap(fresh) * 10) / 10,
      events: fresh.map((e) => `${e.d.toFixed(0)}:${e.n}`),
    });
  }
  return out;
}

/**
 * Reachable floor (with barriers open and the rides) that lies far from anything to look at:
 * columns whose nearest prop, structure, landmark or feature point is over 10 m (and over 15 m).
 */
export function emptyFloor(layout: WorldLayout): { columns: number; over10: number; over15: number; share10: number } {
  const w = openWorld(layout);
  const s = layout.spawn;
  const par = walkParents(w, [Math.floor(s.x), Math.floor(s.y), Math.floor(s.z)], layout.features?.links ?? []);
  const things: P[] = [];
  for (const p of layout.props) things.push([p.x, p.y, p.z]);
  for (const v of Object.values(layout.landmarks)) things.push([v[0], v[1], v[2]]);
  for (const st of layout.structures) {
    if ('x' in st && 'y' in st && 'z' in st && typeof st.x === 'number' && typeof st.y === 'number' && typeof st.z === 'number') things.push([st.x, st.y, st.z]);
    else if (st.kind === 'beam') things.push([(st.a[0] + st.b[0]) / 2, (st.a[1] + st.b[1]) / 2, (st.a[2] + st.b[2]) / 2]);
    else if (st.kind === 'stairFlight') things.push([st.x0, st.top, st.z0]);
    else if (st.kind === 'deck') things.push([(st.x0 + st.x1) / 2, st.y, (st.z0 + st.z1) / 2]);
  }
  for (const f of layout.features?.pois ?? []) things.push(f.p);
  const cols = new Map<number, number>();
  const sxy = w.sx * w.sy;
  for (let i = 0; i < par.length; i++) {
    if (par[i] === -2) continue;
    const x = i % w.sx;
    const z = Math.floor(i / sxy);
    const y = Math.floor(i / w.sx) % w.sy;
    const key = x + z * w.sx;
    if (!cols.has(key)) cols.set(key, y);
  }
  let over10 = 0;
  let over15 = 0;
  for (const [key, y] of cols) {
    const x = (key % w.sx) + 0.5;
    const z = Math.floor(key / w.sx) + 0.5;
    let best = Infinity;
    for (const t of things) {
      const d = Math.hypot(t[0] - x, (t[1] - y) * 0.5, t[2] - z);
      if (d < best) best = d;
    }
    if (best > 10) over10++;
    if (best > 15) over15++;
  }
  return { columns: cols.size, over10, over15, share10: Math.round((over10 / Math.max(1, cols.size)) * 1000) / 1000 };
}

export default function poiDensity(args: string[] = []): void {
  const layout = generateWorld(undefined, { features: args[0] !== 'before' });
  for (const r of measureSpacing(layout)) {
    const { events, ...rest } = r;
    console.log(JSON.stringify(rest));
    if (args.includes('-v')) console.log('   ', events.join(' '));
  }
  console.log('empty floor', JSON.stringify(emptyFloor(layout)));
}
