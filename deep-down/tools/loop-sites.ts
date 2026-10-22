// LOOP tool (round 3): the named places of each stratum (WORLD's layout.sites with a name), per
// biome and kind: the "places" biome task counts them.
// Usage: node tools/run-ts.mjs tools/loop-sites.ts [seed]
import { generateStratum } from '../src/world/gen/strata/generateStratum';

export default function main(args: string[]): void {
  const seed = Number(args[0] ?? 12345);
  for (const n of [1, 2, 3, 4, 5, 6]) {
    const l = generateStratum(seed, n);
    const named = l.sites.filter((s) => !!s.name);
    const by: Record<string, string[]> = {};
    for (const s of named) (by[s.biome] ??= []).push(`${s.kind}:${s.name}`);
    console.log(`S${n} ${named.length} named: ${Object.entries(by).map(([b, v]) => `${b} [${v.join(', ')}]`).join(' | ')}; secrets ${l.secrets.length}, ravines ${l.ravines.length}, dungeon ${l.dungeon ? l.dungeon.biome : '-'}`);
  }
}
