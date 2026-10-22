// WORLD probe: the river's spring fall and the blocks under its foot.
import { BLOCKS } from '../src/config/blocks';
import { generateStratum } from '../src/world/gen/strata/generateStratum';
export default function spring(args: string[]): void {
  const l = generateStratum(Number(args[0] ?? 12345), Number(args[1] ?? 5));
  for (const f of l.falls) {
    const x = Math.floor(f.bottom[0]);
    const z = Math.floor(f.bottom[2]);
    const y = Math.round(f.bottom[1] + 0.25);
    const col: string[] = [];
    for (let yy = y - 2; yy <= y + 5; yy++) col.push(`${yy}:${BLOCKS[l.world.get(x, yy, z)].name.replace('block.', '')}`);
    console.log(f.id, f.kind, 'top', f.top.map((v) => v.toFixed(1)).join(','), 'bottom', f.bottom.map((v) => v.toFixed(1)).join(','), col.join(' '));
  }
  console.log('river spring', l.rivers[0]?.spring, 'lakes', l.features.lakes.map((k) => k.id).join(' '));
}
