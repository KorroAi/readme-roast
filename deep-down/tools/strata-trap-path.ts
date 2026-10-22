// WORLD probe: how the walk gets into a trapped pocket: the forward walk's path from the arrival to a
// pocket cell, the last cell with a way home on it, and the moves after it.
import { B, BLOCKS, CLIMB, SOLID } from '../src/config/blocks';
import { generateStratum } from '../src/world/gen/strata/generateStratum';
import { TrapScratch, WORST_SOLID, forEachMove, homewardStates, isState, standsAt, hangsAt } from '../src/world/gen/strata/traps';
export default function path(args: string[]): void {
  const l = generateStratum(Number(args[0]), Number(args[1]));
  const [tx, ty, tz] = args[2].split(',').map(Number);
  const worst = args[3] === 'worst';
  const w = l.world;
  const d = { sx: w.sx, sy: w.sy, sz: w.sz };
  const b = w.blocks.slice();
  for (const [x, y, z] of [...(l.dungeon?.door ?? []), ...(l.stratum === 6 ? l.gate.seal : [])]) b[w.index(x, y, z)] = B.AIR;
  for (let i = 0; i < b.length; i++) if (b[i] === B.CRACKED_WALL) b[i] = B.AIR;
  const S = worst ? WORST_SOLID : SOLID;
  const sxy = w.sx * w.sy;
  // Forward BFS with parents.
  const parent = new Int32Array(b.length).fill(-1);
  const q: number[] = [];
  let y0 = Math.floor(l.arrival.y);
  const x0 = Math.floor(l.arrival.x);
  const z0 = Math.floor(l.arrival.z);
  while (!isState(b, S, w.sx, w.index(x0, y0, z0)) && y0 > 1) y0--;
  const s0 = w.index(x0, y0, z0);
  parent[s0] = s0;
  q.push(s0);
  for (let h = 0; h < q.length; h++) {
    const i = q[h];
    const z = (i / sxy) | 0;
    const r = i - z * sxy;
    const y = (r / w.sx) | 0;
    forEachMove(b, S, d, i, r - y * w.sx, y, z, 3, (j) => {
      if (parent[j] < 0) {
        parent[j] = i;
        q.push(j);
      }
    });
  }
  const sc = new TrapScratch(d);
  const t: number[] = [];
  const c = l.camp;
  for (let z = Math.ceil(c.min[2]); z <= Math.floor(c.max[2]); z++) for (let y = Math.max(1, Math.ceil(c.min[1])); y <= Math.floor(c.max[1]); y++) for (let x = Math.ceil(c.min[0]); x <= Math.floor(c.max[0]); x++) if (isState(b, S, w.sx, w.index(x, y, z))) t.push(w.index(x, y, z));
  homewardStates(b, S, d, t, sc.b, sc.q);
  // The trapped cell nearest the target.
  let best = -1;
  let bd = Infinity;
  for (const i of q) {
    if (sc.b[i]) continue;
    const z = (i / sxy) | 0;
    const y = ((i - z * sxy) / w.sx) | 0;
    const x = i - z * sxy - y * w.sx;
    const dd = Math.hypot(x - tx, (y - ty) * 2, z - tz);
    if (dd < bd) {
      bd = dd;
      best = i;
    }
  }
  if (best < 0) return console.log('no trapped cell');
  const chain: number[] = [];
  for (let i = best; ; i = parent[i]) {
    chain.push(i);
    if (parent[i] === i) break;
  }
  chain.reverse();
  const desc = (i: number) => {
    const z = (i / sxy) | 0;
    const y = ((i - z * sxy) / w.sx) | 0;
    const x = i - z * sxy - y * w.sx;
    return `(${x},${y},${z}) ${sc.b[i] ? 'HOME' : 'trap'} ${standsAt(b, S, w.sx, i) ? 'stand' : hangsAt(b, S, w.sx, i) ? 'hang' : '?'} cell=${BLOCKS[b[i]].name} below=${BLOCKS[b[i - w.sx]].name}${CLIMB[b[i]] ? ' CLIMB' : ''}`;
  };
  const k0 = chain.findIndex((i) => !sc.b[i]);
  for (let k = Math.max(0, k0 - 3); k < Math.min(chain.length, k0 + 6); k++) console.log(k === k0 ? '>>' : '  ', desc(chain[k]));
}
