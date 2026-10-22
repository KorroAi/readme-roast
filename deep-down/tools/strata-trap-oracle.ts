// WORLD check: the fast homeward search equals the probe oracle on real strata (both modes).
import { SOLID } from '../src/config/blocks';
import { generateStratum } from '../src/world/gen/strata/generateStratum';
import { TrapScratch, WORST_SOLID, homewardStates, homewardStatesByProbe, isState } from '../src/world/gen/strata/traps';
export default function oracle(args: string[]): void {
  for (const n of (args[1] ?? '1,2').split(',').map(Number)) {
    const l = generateStratum(Number(args[0] ?? 12345), n);
    const w = l.world;
    const d = { sx: w.sx, sy: w.sy, sz: w.sz };
    const sc = new TrapScratch(d);
    for (const S of [SOLID, WORST_SOLID]) {
      const t: number[] = [];
      const c = l.camp;
      for (let z = Math.ceil(c.min[2]); z <= Math.floor(c.max[2]); z++) for (let y = Math.max(1, Math.ceil(c.min[1])); y <= Math.floor(c.max[1]); y++) for (let x = Math.ceil(c.min[0]); x <= Math.floor(c.max[0]); x++) if (isState(w.blocks, S, w.sx, w.index(x, y, z))) t.push(w.index(x, y, z));
      const t0 = performance.now();
      const a = homewardStates(w.blocks, S, d, t, sc.a, sc.q);
      const t1 = performance.now();
      const b = homewardStatesByProbe(w.blocks, S, d, t, sc.b, sc.q);
      const t2 = performance.now();
      let diff = 0;
      for (let i = 0; i < sc.a.length; i++) if (sc.a[i] !== sc.b[i]) diff++;
      console.log(`stratum ${n} ${S === SOLID ? 'as-is' : 'worst'}: fast ${a} (${(t1 - t0).toFixed(0)} ms) probe ${b} (${(t2 - t1).toFixed(0)} ms) differ ${diff}`);
    }
  }
}
