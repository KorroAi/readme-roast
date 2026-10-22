// WORLD proof (round 3): density per biome against the old hand-made world (BRIEF §0.1): ore veins and
// ore blocks per 1000 m² of walkable floor, chests per 25 m of tunnel, props and lights, and the largest
// gap along every tunnel between two "things" (a find, a prop, a light, a creature spot or a fork).
// Usage: node tools/run-ts.mjs tools/strata-density.ts [seed] [strata e.g. 1,2,3,4,5,6]
import { SOLID, isEmitter } from '../src/config/blocks';
import { allOres } from '../src/config/biomes';
import { generateWorld } from '../src/world/gen/generateWorld';
import { generateStratum } from '../src/world/gen/strata/generateStratum';
import { standableAt, walkBfs } from '../src/world/gen/strata/content';
import { edgePath, planStratum } from '../src/world/gen/strata/plan';
import type { VoxelWorld } from '../src/world/VoxelWorld';
import { B } from '../src/config/blocks';

const ORE = new Uint8Array(256);
for (const o of allOres()) ORE[o.block] = 1;
for (const id of [B.COPPER_ORE, B.IRON_ORE, B.CRYSTAL, B.ECHO_CRYSTAL, B.GEM_ORE, B.LANTERNSTONE]) ORE[id] = 1;

/** Ore blocks, veins (6-connected groups) and walkable floor cells (all, and reachable from `from`). */
function count(w: VoxelWorld, from: [number, number, number] | null): { oreBlocks: number; veins: number; floor: number; reach: number } {
  const { sx, sy, sz } = w;
  let oreBlocks = 0;
  let veins = 0;
  const seenOre = new Uint8Array(sx * sy * sz);
  const stack: number[] = [];
  for (let i = 0; i < w.blocks.length; i++) {
    if (!ORE[w.blocks[i]] || seenOre[i]) continue;
    veins++;
    stack.push(i);
    seenOre[i] = 1;
    while (stack.length) {
      const j = stack.pop()!;
      oreBlocks++;
      for (const d of [1, -1, sx, -sx, sx * sy, -sx * sy]) {
        const k = j + d;
        if (k >= 0 && k < w.blocks.length && !seenOre[k] && ORE[w.blocks[k]]) {
          seenOre[k] = 1;
          stack.push(k);
        }
      }
    }
  }
  let floor = 0;
  let reach = 0;
  const seen = from ? walkBfs({ world: w }, from) : null;
  for (let z = 1; z < sz - 1; z++) for (let y = 1; y < sy - 2; y++) for (let x = 1; x < sx - 1; x++) {
    if (!standableAt(w.blocks, sx, sy, x, y, z)) continue;
    floor++;
    if (seen && seen[x + sx * (y + sy * z)]) reach++;
  }
  return { oreBlocks, veins, floor, reach };
}

export default function density(args: string[]): void {
  const seed = Number(args[0] ?? 12345);
  const list = (args[1] ?? '1,2,3,4,5,6').split(',').map(Number);
  const old = generateWorld();
  const o = count(old.world, [old.spawn.x, old.spawn.y, old.spawn.z]);
  const oldVeinsPerK = (o.veins / o.reach) * 1000;
  const oldOrePerK = (o.oreBlocks / o.reach) * 1000;
  const oldChests = old.props.filter((p) => p.feature?.kind === 'cache' || p.kind === 'chest').length;
  console.log(`old world: ${o.veins} veins, ${o.oreBlocks} ore blocks over ${o.reach} reachable floor m² -> ${oldVeinsPerK.toFixed(2)} veins and ${oldOrePerK.toFixed(1)} ore blocks per 1000 m²; ${oldChests} chests and caches, ${old.props.length} props`);
  for (const n of list) {
    const l = generateStratum(seed, n);
    const w = l.world;
    const c = count(w, [l.arrival.x, l.arrival.y, l.arrival.z]);
    const veinsPerK = (c.veins / c.reach) * 1000;
    const orePerK = (c.oreBlocks / c.reach) * 1000;
    // The largest gap along the tunnels between two things.
    const things: Array<[number, number, number]> = [];
    for (const p of l.props) things.push([p.x, p.y, p.z]);
    for (const sp of l.spawnPoints) things.push(sp.p);
    for (let i = 0; i < w.blocks.length; i++) if (isEmitter(w.blocks[i])) things.push([i % w.sx, Math.floor(i / w.sx) % w.sy, Math.floor(i / (w.sx * w.sy))]);
    const grid = new Map<number, Array<[number, number, number]>>();
    for (const t of things) {
      const k = Math.floor(t[0] / 8) + Math.floor(t[2] / 8) * 64;
      (grid.get(k) ?? grid.set(k, []).get(k)!).push(t);
    }
    const nearest = (x: number, y: number, z: number) => {
      let best = Infinity;
      for (let a = -2; a <= 2; a++) for (let b = -2; b <= 2; b++) for (const t of grid.get(Math.floor(x / 8) + a + (Math.floor(z / 8) + b) * 64) ?? []) {
        const d = Math.hypot(t[0] - x, (t[1] - y) * 0.5, t[2] - z);
        if (d < best) best = d;
      }
      return best;
    };
    // The plan is rebuilt from the layout's own seed (layout.seed is the attempt's seed).
    const plan = planStratum(l.seed, l.stratum, l.biomes, w.sx, w.sz);
    let samples = 0;
    let within75 = 0;
    let worst = 0;
    for (const e of plan.edges) {
      for (const [x, y, z] of edgePath(plan, e, 1)) {
        samples++;
        const d = nearest(x, y, z);
        if (d <= 7.5) within75++;
        worst = Math.max(worst, Math.min(d, 99));
      }
    }
    const tunnelM = Object.values(l.stats).reduce((a, s) => a + (s.tunnelMetres ?? 0), 0);
    const chests = l.chests.length;
    console.log(
      `stratum ${n} ${l.biomes.join('+')}: ${c.veins} veins, ${c.oreBlocks} ore blocks over ${c.reach} reachable m² -> ${veinsPerK.toFixed(2)} veins (${(veinsPerK / oldVeinsPerK).toFixed(1)}x the old world) and ${orePerK.toFixed(1)} ore blocks (${(orePerK / oldOrePerK).toFixed(1)}x) per 1000 m²; ` +
        `${chests} chests over ${tunnelM} m of tunnel = ${((chests / tunnelM) * 25).toFixed(2)} per 25 m; ${l.props.length} props; along the tunnels ${((within75 / samples) * 100).toFixed(1)}% of metres have a thing within 7.5 m (every 15 m), the worst gap ${worst.toFixed(1)} m`,
    );
    for (const [b, s] of Object.entries(l.stats)) console.log(`  ${b}: floor ${s.floorCells} m², ${s.oreVeins} veins, ${s.oreBlocks} ore blocks, ${s.chests} chests (${s.chestsPer25m} per 25 m along its tunnels), ${s.props} props, ${s.lights} light pockets, ${s.caverns} great caverns`);
  }
  void SOLID;
}
