// The fill contract over a depth range (SPEC §6.6, §13.4 W1, W2, W6; BUILD W2 MUST 2):
//   node tools/run-ts.mjs tools/fill-scan.ts [from=0] [to=7000] [seed=7]
// Prints the violations of fill rules 1-7, the density windows that missed a target, the emitter budget, and the
// means per 20 m window. Exits non-zero when anything failed.
import { rowKinds } from '../src/idle/model/shaft';
import { BIOMES } from '../src/idle/config/biomes';
import { scanFill } from '../src/world/descent/fill';

export default function main(args: string[]): void {
  const from = Number(args[0] ?? 0);
  const to = Number(args[1] ?? 7000);
  const seed = Number(args[2] ?? 7);
  const t0 = Date.now();
  const r = scanFill(seed, from, to, (row) => rowKinds(seed, row), 400);
  const byRule: Record<string, number> = {};
  for (const v of r.violations) byRule[v.rule] = (byRule[v.rule] ?? 0) + 1;
  console.log(`fill-scan rows ${from}-${to} seed ${seed}: ${r.slabs} slabs, ${r.caverns} caverns, ${r.windows} windows (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
  console.log(`  rule violations: ${r.violations.length} ${JSON.stringify(byRule)}`);
  console.log(`  density misses: ${JSON.stringify(r.density)}`);
  console.log(`  emitter budget misses (W6): ${r.budget}`);
  console.log(`  per 20 m window: ${Object.entries(r.means).map(([k, v]) => `${k} ${v.toFixed(1)}`).join(', ')}`);
  const shown: Record<string, number> = {};
  for (const v of r.violations) {
    shown[v.rule] = (shown[v.rule] ?? 0) + 1;
    if (shown[v.rule] > 4) continue;
    const b = BIOMES.findIndex((x, i) => v.depth >= x.start && (i === BIOMES.length - 1 || v.depth < BIOMES[i + 1].start));
    console.log(`  [${v.rule}] ${v.id} @ ${v.depth} m (biome ${b}): ${v.detail}`);
  }
  if (r.violations.length || Object.keys(r.density).length) process.exitCode = 1;
}
