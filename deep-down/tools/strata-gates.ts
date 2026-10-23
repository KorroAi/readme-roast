// WORLD probe: where each stratum's gate monolith stands (its offset from the gate's stand and its scale).
// Usage: node tools/run-ts.mjs tools/strata-gates.ts [seeds e.g. 12345,7]
import { generateStratum } from '../src/world/gen/strata/generateStratum';
export default function gates(args: string[]): void {
  for (const seed of (args[0] ?? '12345').split(',').map(Number)) {
    const row: string[] = [];
    for (let s = 1; s <= 6; s++) {
      const l = generateStratum(seed, s as 1);
      const m = l.props.find((p) => p.id === `gate_${s}`);
      if (!m) {
        row.push(`${s}: none`);
        continue;
      }
      const st = l.gate.stand;
      row.push(`${s}: x${(m.x - st[0]).toFixed(1)} y${(m.y - st[1]).toFixed(0)} z${(m.z - st[2]).toFixed(1)} scale ${m.scale}`);
    }
    console.log(`seed ${seed}: ${row.join(' | ')}`);
  }
}
