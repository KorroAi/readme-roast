// WORLD probe: a prop model's radial extent by height band (metres at scale 1), to size footprints.
// Usage: node tools/run-ts.mjs tools/strata-prop-shape.ts kind [bands]
import { buildPropModel } from '../src/render/props/models';
import type { PropKind } from '../src/world/gen/types';
export default function shape(args: string[]): void {
  const kind = args[0] ?? 'abyssMonolith';
  const bands = Number(args[1] ?? 10);
  const model = buildPropModel(kind as PropKind, { variant: 0, hangHeight: 1.6 });
  const pts: Array<[number, number, number]> = [];
  for (const g of [model.body, model.glow]) {
    if (!g) continue;
    const pos = g.getAttribute('position');
    for (let i = 0; i < pos.count; i++) pts.push([pos.getX(i), pos.getY(i), pos.getZ(i)]);
  }
  let hi = 0;
  for (const p of pts) hi = Math.max(hi, p[1]);
  for (let b = 0; b < bands; b++) {
    const y0 = (hi * b) / bands, y1 = (hi * (b + 1)) / bands;
    let r = 0, xm = 0, zm = 0, n = 0;
    for (const [x, y, z] of pts) if (y >= y0 && y <= y1) { r = Math.max(r, Math.hypot(x, z)); xm = Math.max(xm, Math.abs(x)); zm = Math.max(zm, Math.abs(z)); n++; }
    console.log(`${kind} y ${y0.toFixed(2)}-${y1.toFixed(2)}: radius ${r.toFixed(2)} (|x| ${xm.toFixed(2)}, |z| ${zm.toFixed(2)}), ${n} vertices`);
  }
}
