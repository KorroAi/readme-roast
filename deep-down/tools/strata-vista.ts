// WORLD probe (round 3): the landmark vista of each stratum: its size, its lights (in the hall, round
// the fall), the ramp's lamp posts, the island's spire and the dome's stalactites.
// Usage: node tools/run-ts.mjs tools/strata-vista.ts [seed] [strata e.g. 1,2,3]
import { BLOCKS, SOLID } from '../src/config/blocks';
import { generateStratum } from '../src/world/gen/strata/generateStratum';
import type { StratumIndex } from '../src/config/biomes';

export default function vista(args: string[]): void {
  const seed = Number(args[0] ?? 12345);
  const strata = (args[1] ?? '1,2,3,4,5,6').split(',').map(Number) as StratumIndex[];
  for (const s of strata) {
    const l = generateStratum(seed, s);
    const V = l.vista;
    if (!V) {
      console.log(`stratum ${s}: no vista`);
      continue;
    }
    const w = l.world;
    const lit = (x: number, y: number, z: number) => {
      const id = w.get(x, y, z);
      return !SOLID[id] && BLOCKS[id].emission !== null;
    };
    let hall = 0;
    let top = 0;
    const R = Math.ceil(V.radius);
    for (let dz = -R; dz <= R; dz++) for (let dx = -R; dx <= R; dx++) {
      if (dx * dx + dz * dz > R * R) continue;
      for (let y = V.centre[1] - 1; y < V.centre[1] + 40; y++) {
        const x = Math.floor(V.centre[0]) + dx;
        const z = Math.floor(V.centre[2]) + dz;
        if (lit(x, y, z)) hall++;
        if (!SOLID[w.get(x, y, z)]) top = Math.max(top, y - V.centre[1]);
      }
    }
    const f = l.falls[0];
    let nearFall = 0;
    for (let dz = -4; dz <= 4; dz++) for (let dx = -4; dx <= 4; dx++) for (let y = Math.floor(f.bottom[1]); y <= Math.ceil(f.top[1]) + 2; y++) if (lit(Math.floor(f.top[0]) + dx, y, Math.floor(f.top[2]) + dz)) nearFall++;
    const lamps = (V.lamps ?? []).filter((lp) => l.props.some((p) => p.kind === 'lanternPost' && Math.hypot(p.x - lp[0], p.z - lp[2]) < 1 && Math.abs(p.y - lp[1]) < 1)).length;
    console.log(`stratum ${s} ${V.biome} ${V.name}: radius ${V.radius.toFixed(1)}, open ${top} m up; lights in the hall ${hall}, round the fall ${nearFall} (${f.id} ${(f.top[1] - f.bottom[1]).toFixed(1)} m ${f.kind}); ramp lamps ${lamps}/${V.lamps?.length ?? 0}; island spire tip ${V.island ? (V.island[1] - V.centre[1]) : '-'} m up; stalactites ${V.stalactites ?? '-'}`);
  }
}
