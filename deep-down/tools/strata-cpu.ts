// WORLD proof (round 3): generation and light per stratum in CPU time (what a quiet core takes: the
// machine is shared, wall time under load is not the budget's measure) and wall time.
// Usage: node tools/run-ts.mjs tools/strata-cpu.ts [seeds] [strata]
import { generateStratum } from '../src/world/gen/strata/generateStratum';
import { LightField } from '../src/world/light';
import { materialsFor } from '../src/world/gen/zoneLoader';
export default function cpu(args: string[]): void {
  const seeds = (args[0] ?? '12345').split(',').map(Number);
  const strata = (args[1] ?? '1,2,3,4,5,6').split(',').map(Number);
  const ms = (u: NodeJS.CpuUsage) => (u.user + u.system) / 1000;
  let worst = 0;
  for (const seed of seeds) for (const n of strata) {
    const c0 = process.cpuUsage();
    const w0 = performance.now();
    const l = generateStratum(seed, n);
    const c1 = process.cpuUsage(c0);
    const w1 = performance.now();
    const light = new LightField(l.world);
    light.computeAll();
    const c2 = process.cpuUsage();
    const w2 = performance.now();
    const mats = materialsFor({ seed, stratum: n });
    const c3 = process.cpuUsage(c2);
    const w3 = performance.now();
    const lightCpu = ms(process.cpuUsage(c0)) - ms(c1) - ms(c3);
    const total = ms(c1) + lightCpu;
    worst = Math.max(worst, total);
    console.log(`seed ${seed} stratum ${n}: generate ${ms(c1).toFixed(0)} ms cpu (${(w1 - w0).toFixed(0)} wall, ${l.timings.attempts} attempt${l.timings.attempts > 1 ? 's' : ''}), light ${lightCpu.toFixed(0)} cpu (${(w2 - w1).toFixed(0)} wall), materials ${ms(c3).toFixed(0)} cpu (${(w3 - w2).toFixed(0)} wall)${mats ? '' : ''}`);
  }
  console.log(`worst generate + light: ${worst.toFixed(0)} ms cpu (budget 7000)`);
}
