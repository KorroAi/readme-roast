import { generateStratum } from '../src/world/gen/strata/generateStratum';
import { standable } from '../src/world/analysis/reachability';
export default function probe(): void {
  let inside = 0, total = 0;
  const rows: string[] = [];
  for (let i = 0; i < 40; i++) {
    const seed = 2000 + i * 7919;
    const l = generateStratum(seed, 1) as any;
    const w = l.world;
    const f = l.campSite.fire as number[];
    const c = l.camp;
    const near = (x: number, y: number, z: number) => {
      for (let r = 0; r <= 4; r++) for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) for (let dy = -3; dy <= 3; dy++) {
        const xx = Math.floor(x) + dx, yy = Math.floor(y) + dy, zz = Math.floor(z) + dz;
        if (standable(w, xx, yy, zz)) return [xx + 0.5, yy, zz + 0.5];
      }
      return null;
    };
    let s: number[] | null = null;
    outer: for (let d = 18; d < 50; d += 4) for (let a = 0; a < 12; a++) { s = near(f[0] + Math.sin(a) * d, f[1], f[2] + Math.cos(a) * d); if (s) break outer; }
    if (!s) continue;
    total++;
    // The spec stands it at s + 0.5 (a corner); the camp box test as Game.inRegion does (feet y).
    const p = [s[0] + 0.5, s[1], s[2] + 0.5];
    const inBox = p[0] >= c.min[0] && p[0] <= c.max[0] && p[1] >= c.min[1] && p[1] <= c.max[1] && p[2] >= c.min[2] && p[2] <= c.max[2];
    if (inBox) inside++;
    if (rows.length < 12) rows.push(`seed ${seed}: fire ${f.map((v: number) => v.toFixed(0))} camp x ${c.min[0]}..${c.max[0]} y ${c.min[1]}..${c.max[1]} z ${c.min[2]}..${c.max[2]} spot ${p.map((v) => v.toFixed(1))} ${inBox ? 'IN the camp' : 'out'}`);
  }
  console.log(`${inside} of ${total} spots the spec takes as "away from the camp" are inside the camp's box`);
  for (const r of rows) console.log(' ', r);
}
