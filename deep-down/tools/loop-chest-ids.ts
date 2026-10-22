// LOOP tool (round 3): are chest prop ids unique across the strata of an expedition (the looted list is one)?
// Usage: node tools/run-ts.mjs tools/loop-chest-ids.ts [seed]
import { generateStratum } from '../src/world/gen/strata/generateStratum';

export default function main(args: string[]): void {
  const seed = Number(args[0] ?? 12345);
  const seen = new Map<string, number>();
  let dup = 0;
  for (const n of [1, 2, 3, 4, 5, 6]) {
    const l = generateStratum(seed, n);
    const ids = l.props.filter((p) => p.feature?.kind === 'cache').map((p) => p.id);
    for (const id of ids) {
      if (seen.has(id)) dup++;
      seen.set(id, n);
    }
    console.log(`S${n}: ${ids.length} chests, e.g. ${ids.slice(0, 3).join(', ')}`);
  }
  console.log(`duplicate ids across strata: ${dup}`);
}
