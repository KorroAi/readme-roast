// WORLD probe: a top-down ASCII map of the cells around a trapped pocket, level by level, in the
// worst case (every breakable block mined): P pocket state, h home state, L ladder, o breakable block
// (real), # plain rock, . air.
import { B, CLIMB, SOLID } from '../src/config/blocks';
import { generateStratum } from '../src/world/gen/strata/generateStratum';
import { OPENABLE, TrapScratch, WORST_SOLID, homewardStates, isState, walkStates } from '../src/world/gen/strata/traps';
export default function m(args: string[]): void {
  const l = generateStratum(Number(args[0]), Number(args[1]));
  const [cx, cy, cz] = args[2].split(',').map(Number);
  const worst = args[3] !== 'asis';
  const w = l.world;
  const d = { sx: w.sx, sy: w.sy, sz: w.sz };
  const b = w.blocks.slice();
  for (const [x, y, z] of [...(l.dungeon?.door ?? []), ...(l.stratum === 6 ? l.gate.seal : [])]) b[w.index(x, y, z)] = B.AIR;
  for (let i = 0; i < b.length; i++) if (b[i] === B.CRACKED_WALL) b[i] = B.AIR;
  const S = worst ? WORST_SOLID : SOLID;
  const sc = new TrapScratch(d);
  walkStates(b, S, d, [l.arrival.x, l.arrival.y, l.arrival.z], sc.a, sc.q);
  const t: number[] = [];
  const c = l.camp;
  for (let z = Math.ceil(c.min[2]); z <= Math.floor(c.max[2]); z++) for (let y = Math.max(1, Math.ceil(c.min[1])); y <= Math.floor(c.max[1]); y++) for (let x = Math.ceil(c.min[0]); x <= Math.floor(c.max[0]); x++) if (isState(b, S, w.sx, w.index(x, y, z))) t.push(w.index(x, y, z));
  homewardStates(b, S, d, t, sc.b, sc.q);
  for (let y = cy + 5; y >= cy - 5; y--) {
    console.log(`y ${y}`);
    for (let z = cz - 9; z <= cz + 9; z++) {
      let row = '';
      for (let x = cx - 14; x <= cx + 14; x++) {
        if (!w.inBounds(x, y, z)) { row += ' '; continue; }
        const i = w.index(x, y, z);
        const id = w.blocks[i];
        row += sc.a[i] && !sc.b[i] ? 'P' : sc.b[i] ? 'h' : CLIMB[id] ? 'L' : OPENABLE[id] ? 'o' : SOLID[id] ? '#' : '.';
      }
      console.log(row);
    }
  }
}
