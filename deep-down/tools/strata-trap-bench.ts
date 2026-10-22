// WORLD bench: the trap searches, repeated (min of N).
import { SOLID } from '../src/config/blocks';
import { generateStratum } from '../src/world/gen/strata/generateStratum';
import { TrapScratch, homewardStates, homewardStatesByProbe, isState, walkStates } from '../src/world/gen/strata/traps';
export default function bench(args: string[]): void {
  const l = generateStratum(Number(args[0] ?? 12345), Number(args[1] ?? 1));
  const w = l.world;
  const d = { sx: w.sx, sy: w.sy, sz: w.sz };
  const sc = new TrapScratch(d);
  const t: number[] = [];
  const c = l.camp;
  for (let z = Math.ceil(c.min[2]); z <= Math.floor(c.max[2]); z++) for (let y = Math.max(1, Math.ceil(c.min[1])); y <= Math.floor(c.max[1]); y++) for (let x = Math.ceil(c.min[0]); x <= Math.floor(c.max[0]); x++) if (isState(w.blocks, SOLID, w.sx, w.index(x, y, z))) t.push(w.index(x, y, z));
  const best = { walk: Infinity, fast: Infinity, probe: Infinity, fill: Infinity };
  for (let k = 0; k < 8; k++) {
    let t0 = performance.now();
    sc.a.fill(0);
    best.fill = Math.min(best.fill, performance.now() - t0);
    t0 = performance.now();
    walkStates(w.blocks, SOLID, d, [l.arrival.x, l.arrival.y, l.arrival.z], sc.a, sc.q);
    best.walk = Math.min(best.walk, performance.now() - t0);
    t0 = performance.now();
    homewardStates(w.blocks, SOLID, d, t, sc.b, sc.q);
    best.fast = Math.min(best.fast, performance.now() - t0);
    t0 = performance.now();
    homewardStatesByProbe(w.blocks, SOLID, d, t, sc.b, sc.q);
    best.probe = Math.min(best.probe, performance.now() - t0);
  }
  console.log(JSON.stringify(Object.fromEntries(Object.entries(best).map(([k, v]) => [k, +v.toFixed(1)]))));
}
