// The hybrid's fill contract and previews (SPEC §4.11 as amended by W1-LEAD §3: "the fill contract holds from every
// walkable point, not only from stands; fill-scan samples 200 walkable points per chamber").
//
//   node tools/run-ts.mjs tools/fill-scan.ts [--seed 12345] [--run 7] [--nodes 0-17] [--samples 200]
//   node tools/run-ts.mjs tools/fill-scan.ts --preview <dir> [--nodes 0-5] [--size 195x422]
//
// The scan prints, per chamber, the rules of src/world/hybrid/fill.ts measured from its walkable points and exits
// non-zero on a failure. --preview writes first-person software renders (the world's own check, not the game's look)
// from the arrival, every stand, the Dig pose and a few walkable points.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
// @ts-expect-error the PNG encoder is a plain .mjs tool module
import { encodePng } from './png.mjs';
import { DeepWorld } from '../src/world/hybrid/DeepWorld';
import { renderPlan, renderPreview } from '../src/world/hybrid/debug/preview';
import { chamberGeom } from '../src/world/hybrid/layout';
import { scanChamber, type FillReport } from '../src/world/hybrid/fill';

function arg(args: string[], name: string, dflt: string): string {
  const i = args.indexOf(name);
  return i >= 0 && i + 1 < args.length ? args[i + 1] : dflt;
}

export default function main(args: string[]): void {
  const seed = Number(arg(args, '--seed', '12345'));
  const run = Number(arg(args, '--run', '7'));
  const [n0, n1] = arg(args, '--nodes', '0-17').split('-').map(Number);
  const samples = Number(arg(args, '--samples', '200'));
  const preview = arg(args, '--preview', '');
  const [pw, ph] = arg(args, '--size', '195x422').split('x').map(Number);
  const world = new DeepWorld({ lifeSeed: seed, runSeed: run, worker: false });
  let fails = 0;
  const t0 = Date.now();
  if (preview) mkdirSync(preview, { recursive: true });
  for (let i = n0; i <= (n1 ?? n0); i++) {
    const p = world.placement(i);
    world.prime(p.chamber.floorY, p.depthTop + p.K, []);
    if (preview) {
      const shots: Array<{ name: string; pos: { x: number; y: number; z: number }; yaw: number; pitch: number }> = [];
      shots.push({ name: 'dig', pos: p.drift.stand.pos, yaw: p.drift.stand.yaw, pitch: p.drift.stand.pitch });
      for (const st of p.chamber.stands) shots.push({ name: st.id, pos: st.pos, yaw: st.yaw, pitch: st.pitch });
      const nav = world.nav(i);
      if (nav) {
        const cells = nav.reachableFrom(p.chamber.stands[0].feet);
        for (let k = 1; k <= 3 && cells.length; k++) {
          const c = cells[Math.floor((cells.length * k) / 4)];
          const st = p.chamber.stands[0];
          shots.push({ name: `walk${k}`, pos: { x: c.x, y: c.y + 1.6, z: c.z }, yaw: st.yaw + (k - 2) * 1.2, pitch: 0 });
        }
      }
      const plan = renderPlan(chamberGeom(seed, run, i));
      writeFileSync(join(preview, `n${String(i).padStart(2, '0')}-${p.chamber.template.replace('.', '-')}-plan.png`), encodePng(plan.width, plan.height, plan.rgba));
      for (const s of shots) {
        const r = renderPreview(world, s, { width: pw, height: ph, markers: [p] });
        const file = join(preview, `n${String(i).padStart(2, '0')}-${p.chamber.template.replace('.', '-')}-${s.name}.png`);
        writeFileSync(file, encodePng(r.width, r.height, r.rgba));
        const kinds: Record<string, number> = {};
        for (const f of r.inFrame) kinds[f.kind] = (kinds[f.kind] ?? 0) + 1;
        console.log(`${file}  in frame: ${JSON.stringify(kinds)}`);
      }
    }
    const rep: FillReport = scanChamber(world, i, samples);
    if (!rep.pass) fails++;
    console.log(`node ${i} ${p.chamber.template}: ${rep.pass ? 'PASS' : 'FAIL'} ${rep.lines.join(' | ')}`);
  }
  console.log(`fill-scan seed ${seed} run ${run} nodes ${n0}-${n1}: ${fails} failing chambers (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
  if (fails) process.exitCode = 1;
}
