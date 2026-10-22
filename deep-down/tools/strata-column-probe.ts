// WORLD probe (round 3): one column of an attempt, bottom to top, after each pass name (debug aid).
// Usage: node tools/run-ts.mjs tools/strata-column-probe.ts seed stratum attempt x z
import { BLOCKS } from '../src/config/blocks';
import { attemptStratum } from '../src/world/gen/strata/generateStratum';

export default function probe(args: string[]): void {
  const [seed, n, attempt, x, z] = args.map(Number);
  const l = attemptStratum(seed, n as 1, attempt);
  const w = l.world;
  let out = '';
  for (let y = 20; y < 60; y++) out += `${y}:${BLOCKS[w.get(x, y, z)].name.replace('block.', '')} `;
  console.log(out);
}
