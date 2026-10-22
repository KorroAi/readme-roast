// WORLD probe: time the trap searches on one stratum.
import { SOLID } from '../src/config/blocks';
import { generateStratum } from '../src/world/gen/strata/generateStratum';
import { TrapScratch, homewardStates, isState, walkStates, trapPockets } from '../src/world/gen/strata/traps';
export default function prof(args: string[]): void {
  const l = generateStratum(Number(args[0] ?? 12345), Number(args[1] ?? 1));
  const w = l.world;
  const d = { sx: w.sx, sy: w.sy, sz: w.sz };
  const sc = new TrapScratch(d);
  for (let k = 0; k < 3; k++) {
    const t0 = performance.now();
    const n = walkStates(w.blocks, SOLID, d, [l.arrival.x, l.arrival.y, l.arrival.z], sc.a, sc.q); const keepList = sc.q.slice(0, n);
    const t1 = performance.now();
    const targets: number[] = [];
    const c = l.camp;
    for (let z = Math.ceil(c.min[2]); z <= Math.floor(c.max[2]); z++) for (let y = Math.max(1, Math.ceil(c.min[1])); y <= Math.floor(c.max[1]); y++) for (let x = Math.ceil(c.min[0]); x <= Math.floor(c.max[0]); x++) if (isState(w.blocks, SOLID, w.sx, w.index(x, y, z))) targets.push(w.index(x, y, z));
    const m = homewardStates(w.blocks, SOLID, d, targets, sc.b, sc.q);
    const t2 = performance.now();
    sc.list.set(keepList); const p = trapPockets(sc.list, n, sc.b, d);
    const t3 = performance.now();
    console.log(`walk ${n} states ${(t1 - t0).toFixed(0)} ms, home ${m} states ${(t2 - t1).toFixed(0)} ms, pockets ${p.length} ${(t3 - t2).toFixed(0)} ms, gen ${(l as unknown as { timings: { totalMs: number; phases: Record<string, number> } }).timings.totalMs} ms ${JSON.stringify((l as unknown as { timings: { phases: Record<string, number> } }).timings.phases)}`);
  }
}
