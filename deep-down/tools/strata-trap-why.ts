// WORLD probe (round 3): what the worst-case trapped pockets are made of (real air vs breakable
// blocks), and the breakable blocks around their entries.
// Usage: node tools/run-ts.mjs tools/strata-trap-why.ts seed stratum
import { B, BLOCKS } from '../src/config/blocks';
import { generateStratum } from '../src/world/gen/strata/generateStratum';
import { OPENABLE } from '../src/world/gen/strata/traps';
import { measureTraps } from './strata-traps';

export default function why(args: string[]): void {
  const l = generateStratum(Number(args[0] ?? 12345), Number(args[1] ?? 3));
  const w = l.world;
  for (const worst of [false, true]) {
    const r = measureTraps(l, worst);
    console.log(worst ? 'WORST' : 'AS-IS', 'trapped', r.trapped);
    for (const p of r.pockets.slice(0, 6)) {
      const kinds: Record<string, number> = {};
      const around: Record<string, number> = {};
      for (const c of p.cells) {
        const id = w.blocks[c];
        kinds[BLOCKS[id].name] = (kinds[BLOCKS[id].name] ?? 0) + 1;
        const x = c % w.sx;
        const y = Math.floor(c / w.sx) % w.sy;
        const z = Math.floor(c / (w.sx * w.sy));
        for (let dz = -2; dz <= 2; dz++) for (let dy = -1; dy <= 4; dy++) for (let dx = -2; dx <= 2; dx++) {
          const id2 = w.get(x + dx, y + dy, z + dz);
          if (OPENABLE[id2]) around[BLOCKS[id2].name] = (around[BLOCKS[id2].name] ?? 0) + 1;
        }
      }
      console.log(`  pocket ${p.cells.length} at (${p.centre.map((v) => Math.round(v)).join(',')}) y${p.minY}-${p.maxY} cells: ${JSON.stringify(kinds)} openable near: ${JSON.stringify(around)} biome ${l.biomeAt(p.centre[0], p.centre[1], p.centre[2])}`);
    }
  }
  void B;
}
