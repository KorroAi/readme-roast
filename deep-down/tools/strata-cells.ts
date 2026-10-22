// WORLD probe: the blocks round one cell, level by level (letters: A air, R rope, L ladder, # plain,
// o breakable, * light, other solids by initial).
import { BLOCKS, CLIMB, SOLID } from '../src/config/blocks';
import { generateStratum } from '../src/world/gen/strata/generateStratum';
import { OPENABLE } from '../src/world/gen/strata/traps';
export default function cells(args: string[]): void {
  const l = generateStratum(Number(args[0]), Number(args[1]));
  const [cx, cy, cz] = args[2].split(',').map(Number);
  const r = Number(args[3] ?? 4);
  const w = l.world;
  for (let y = cy + 3; y >= cy - 3; y--) {
    console.log(`y ${y}`);
    for (let z = cz - r; z <= cz + r; z++) {
      let row = '';
      for (let x = cx - r; x <= cx + r; x++) {
        const id = w.get(x, y, z);
        const name = BLOCKS[id].name;
        row += x === cx && z === cz ? '[' : ' ';
        row += id === 0 ? '.' : CLIMB[id] ? (name.includes('rope') ? 'R' : 'L') : !SOLID[id] ? '*' : OPENABLE[id] ? 'o' : '#';
      }
      console.log(row);
    }
  }
  console.log('props:', l.props.filter((p) => Math.abs(p.x - cx) < r && Math.abs(p.z - cz) < r && Math.abs(p.y - cy) < 4).map((p) => `${p.kind}@${p.x},${p.y},${p.z}`).join(' '));
}
