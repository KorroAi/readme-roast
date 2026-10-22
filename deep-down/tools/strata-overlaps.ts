// WORLD probe: chambers of the plan whose ellipses overlap (centre distance vs the two radii), per attempt.
import { stratumDef } from '../src/config/biomes';
import { hash32 } from '../src/core/math';
import { planStratum } from '../src/world/gen/strata/plan';
import { stratumSeed } from '../src/world/gen/strata/generateStratum';
export default function probe(args: string[]): void {
  const seed = Number(args[0]);
  const n = Number(args[1]);
  const attempt = Number(args[2] ?? 0);
  const s = hash32(stratumSeed(seed, n) + attempt * 0x1f123bb5) >>> 0;
  const plan = planStratum(s, n as 1, stratumDef(n).biomes, 256, 256);
  const big = plan.nodes.filter((nd) => nd.kind !== 'overlook');
  let count = 0;
  for (let i = 0; i < big.length; i++) for (let j = i + 1; j < big.length; j++) {
    const a = big[i];
    const b = big[j];
    const d = Math.hypot(a.x - b.x, a.z - b.z);
    const need = 1.16 * (Math.max(a.rx, a.rz) + Math.max(b.rx, b.rz));
    if (d < need) {
      count++;
      if (count <= 12) console.log(`${a.kind}#${a.id} (r ${Math.max(a.rx, a.rz).toFixed(0)}, y ${a.y}) and ${b.kind}#${b.id} (r ${Math.max(b.rx, b.rz).toFixed(0)}, y ${b.y}): ${d.toFixed(1)} m apart, need ${need.toFixed(1)}; dy ${Math.abs(a.y - b.y)}`);
    }
  }
  console.log('overlapping pairs', count, 'of nodes', big.length);
}
