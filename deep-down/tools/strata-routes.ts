// WORLD proof (round 3): the walk of each stratum, camp (or lift) -> every lair -> the gate (BRIEF §3:
// reachability with tier-appropriate gear). Shortest walking routes (walk, 1-block auto-step, drops of
// up to 3), their length and time at 4.2 m/s, the time spent in each hazard zone on the way (cold, gas,
// lava, dark, void, chill, falls, rockfall: what the gear answers), and the pick tier the stratum's ores
// ask for. No route needs a pick: every key place is walkable.
// Usage: node tools/run-ts.mjs tools/strata-routes.ts [seed] [strata e.g. 1,2,3,4,5,6]
import { B, SOLID } from '../src/config/blocks';
import { BIOMES } from '../src/config/biomes';
import { generateStratum } from '../src/world/gen/strata/generateStratum';
import { standableAt } from '../src/world/gen/strata/content';
import type { StratumLayout, V3 } from '../src/world/gen/strata/types';

const WALK = 4.2;

/** BFS with parents (the same moves as the generator's walk BFS). */
function bfs(l: StratumLayout, from: V3, open: ReadonlySet<number>): Int32Array {
  const w = l.world;
  const { sx, sy, sz } = w;
  const blocks = w.blocks.slice();
  for (const i of open) blocks[i] = B.AIR;
  const parent = new Int32Array(sx * sy * sz).fill(-1);
  const q = new Int32Array(1 << 23);
  let head = 0;
  let tail = 0;
  let x0 = Math.floor(from[0]);
  let y0 = Math.floor(from[1]);
  const z0 = Math.floor(from[2]);
  for (let k = 0; k < 6 && !standableAt(blocks, sx, sy, x0, y0, z0); k++) y0--;
  void x0;
  const start = x0 + sx * (y0 + sy * z0);
  parent[start] = start;
  q[tail++] = start;
  const sxy = sx * sy;
  while (head < tail) {
    const i = q[head++];
    const z = (i / sxy) | 0;
    const y = ((i - z * sxy) / sx) | 0;
    const x = i - z * sxy - y * sx;
    for (let d = 0; d < 4; d++) {
      const nx = d === 0 ? x + 1 : d === 1 ? x - 1 : x;
      const nz = d === 2 ? z + 1 : d === 3 ? z - 1 : z;
      if (nx < 1 || nz < 1 || nx >= sx - 1 || nz >= sz - 1) continue;
      let to = -1;
      if (standableAt(blocks, sx, sy, nx, y, nz)) to = nx + sx * (y + sy * nz);
      else if (!SOLID[blocks[x + sx * (y + 2 + sy * z)]] && standableAt(blocks, sx, sy, nx, y + 1, nz)) to = nx + sx * (y + 1 + sy * nz);
      else {
        const ni = nx + sx * (y + sy * nz);
        if (!SOLID[blocks[ni]] && !SOLID[blocks[ni + sx]]) {
          for (let dd = 1; dd <= 3 && to < 0; dd++) {
            if (y - dd < 1 || SOLID[blocks[ni - dd * sx]]) break;
            if (standableAt(blocks, sx, sy, nx, y - dd, nz)) to = nx + sx * (y - dd + sy * nz);
          }
        }
      }
      if (to >= 0 && parent[to] < 0) {
        parent[to] = i;
        q[tail++] = to;
      }
    }
  }
  return parent;
}

/** The route (cell indices) to the reached cell nearest p, or null. */
function routeTo(l: StratumLayout, parent: Int32Array, p: readonly number[]): number[] | null {
  const w = l.world;
  let best = -1;
  let bd = Infinity;
  for (let dy = -3; dy <= 3; dy++) for (let dz = -4; dz <= 4; dz++) for (let dx = -4; dx <= 4; dx++) {
    const x = Math.floor(p[0]) + dx;
    const y = Math.floor(p[1]) + dy;
    const z = Math.floor(p[2]) + dz;
    if (!w.inBounds(x, y, z)) continue;
    const i = w.index(x, y, z);
    if (parent[i] < 0) continue;
    const d = dx * dx + dz * dz + dy * dy * 2;
    if (d < bd) {
      bd = d;
      best = i;
    }
  }
  if (best < 0) return null;
  const out: number[] = [];
  for (let i = best; ; i = parent[i]) {
    out.push(i);
    if (parent[i] === i) break;
  }
  return out.reverse();
}

export default function routes(args: string[]): void {
  const seed = Number(args[0] ?? 12345);
  const list = (args[1] ?? '1,2,3,4,5,6').split(',').map(Number);
  for (const n of list) {
    const l = generateStratum(seed, n);
    const w = l.world;
    const open = new Set([...l.gate.seal, ...(l.dungeon?.door ?? [])].map(([x, y, z]) => w.index(x, y, z)));
    const cell = (i: number): V3 => [i % w.sx, Math.floor(i / w.sx) % w.sy, Math.floor(i / (w.sx * w.sy))];
    const describe = (route: number[] | null) => {
      if (!route) return 'UNREACHABLE';
      const m = route.length;
      const haz: Record<string, number> = {};
      for (const i of route) {
        const [x, y, z] = cell(i);
        for (const h of l.hazards) if (Math.hypot(x - h.centre[0], (y - h.centre[1]) * 1.5, z - h.centre[2]) < h.radius) haz[h.kind] = (haz[h.kind] ?? 0) + 1 / WALK;
      }
      const hz = Object.entries(haz).map(([k, s]) => `${k} ${s.toFixed(0)} s`).join(', ') || 'no hazard';
      return `${m} m, ${(m / WALK).toFixed(0)} s walking (${hz})`;
    };
    const a: V3 = [l.arrival.x, l.arrival.y, l.arrival.z];
    const fromArrival = bfs(l, a, open);
    const tierNeeded = Math.max(...l.biomes.flatMap((b) => BIOMES[b].ores.map((o) => o.tier)));
    console.log(`stratum ${n} (${l.biomes.join(' + ')}), ores need pick tier <= ${tierNeeded} (the stratum's own: ${n}):`);
    for (const lair of l.lairs) {
      console.log(`  ${n === 1 ? 'camp' : 'lift'} -> ${lair.id}: ${describe(routeTo(l, fromArrival, lair.centre))}`);
      const fromLair = bfs(l, lair.centre, open);
      console.log(`  ${lair.id} -> gate: ${describe(routeTo(l, fromLair, l.gate.stand))}`);
    }
    console.log(`  ${n === 1 ? 'camp' : 'lift'} -> gate: ${describe(routeTo(l, fromArrival, l.gate.stand))}`);
    if (l.heart) console.log(`  gate -> the Heart: ${describe(routeTo(l, bfs(l, l.gate.stand, open), l.heart.centre))}`);
    if (l.dungeon) console.log(`  ${n === 1 ? 'camp' : 'lift'} -> the works' vault: ${describe(routeTo(l, fromArrival, l.dungeon.vault))}`);
    if (l.vista) console.log(`  ${n === 1 ? 'camp' : 'lift'} -> the vista's balcony: ${describe(routeTo(l, fromArrival, l.vista.balcony))}`);
  }
}
