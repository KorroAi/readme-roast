// WORLD probe: details of one stratum's ravines and of a trapped pocket's surroundings.
import { BLOCKS } from '../src/config/blocks';
import { generateStratum } from '../src/world/gen/strata/generateStratum';
export default function dbg(args: string[]): void {
  const l = generateStratum(Number(args[0] ?? 12345), Number(args[1] ?? 6));
  for (const r of l.ravines) console.log(r.id, 'top', r.top, 'bottom', r.bottom.map((v) => Math.round(v * 10) / 10), 'rope', r.rope.length, r.rope[0], r.rope[r.rope.length - 1]);
  const [px, py, pz] = (args[2] ?? '15,22,86').split(',').map(Number);
  const w = l.world;
  // A vertical slice through the pocket along x.
  for (let y = py + 12; y >= py - 3; y--) {
    let row = '';
    for (let x = px - 14; x <= px + 14; x++) {
      const id = w.get(x, y, pz);
      row += id === 0 ? '.' : BLOCKS[id].name === 'block.rope' ? '|' : BLOCKS[id].name === 'block.ladder' ? 'H' : BLOCKS[id].solid ? '#' : '+';
    }
    console.log(String(y).padStart(3), row);
  }
  console.log('props near:', l.props.filter((p) => Math.hypot(p.x - px, p.z - pz) < 12).map((p) => `${p.kind}@${Math.round(p.x)},${Math.round(p.y)},${Math.round(p.z)}`).join(' '));
}
