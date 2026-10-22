// WORLD probe: the voxels round a trapped pocket, slice by slice (z rows), the trapped cells marked.
// Usage: node tools/run-ts.mjs tools/strata-trap-look.ts seed stratum x,y,z [half-width]
// Legend: '.' air, '#' solid, 'H' ladder, '|' rope, '~' lava/water/pool, '+' other non-solid, 'T' trapped state (as carved).
import { B, BLOCKS } from '../src/config/blocks';
import { generateStratum } from '../src/world/gen/strata/generateStratum';
import { measureTraps } from './strata-traps';

export default function look(args: string[]): void {
  const l = generateStratum(Number(args[0]), Number(args[1]));
  const [px, py, pz] = args[2].split(',').map(Number);
  const R = Number(args[3] ?? 6);
  const w = l.world;
  const m = measureTraps(l, false);
  const trapped = new Set<number>();
  for (const p of m.pockets) for (const i of p.cells) trapped.add(i);
  console.log(`trapped ${m.trapped} in ${m.pockets.length} pockets`);
  for (let z = pz - 3; z <= pz + 3; z++) {
    console.log(`z=${z}  x ${px - R}..${px + R}`);
    for (let y = py + 6; y >= py - 6; y--) {
      let row = '';
      for (let x = px - R; x <= px + R; x++) {
        const id = w.get(x, y, z);
        const i = w.index(x, y, z);
        row += trapped.has(i) ? 'T' : id === B.AIR ? '.' : id === B.LADDER ? 'H' : id === B.ROPE ? '|' : id === B.LAVA || id === B.TOXIC_POOL ? '~' : BLOCKS[id].solid ? '#' : '+';
      }
      console.log(String(y).padStart(4), row);
    }
  }
  console.log('props near:', l.props.filter((p) => Math.hypot(p.x - px, p.z - pz) < R + 2 && Math.abs(p.y - py) < 8).map((p) => `${p.kind}@${p.x},${p.y},${p.z}`).join(' '));
}
