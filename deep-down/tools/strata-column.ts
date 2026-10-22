// WORLD probe: one column (x, z) of a stratum after each generator phase (# solid, . air).
// Usage: node tools/run-ts.mjs tools/strata-column.ts seed stratum attempt x z [y0 y1]
import { BLOCKS } from '../src/config/blocks';
import { attemptStratum, genDebug } from '../src/world/gen/strata/generateStratum';
export default function col(args: string[]): void {
  const [seed, n, a, x, z] = args.map(Number);
  const y0 = Number(args[5] ?? 20);
  const y1 = Number(args[6] ?? 45);
  genDebug.phaseHook = (name, w) => {
    let s = '';
    for (let y = y0; y <= y1; y++) s += BLOCKS[w.get(x, y, z)].solid ? '#' : '.';
    console.log(name.padEnd(12), `y${y0}..${y1}`, s);
  };
  attemptStratum(seed, n as 1, a);
}
