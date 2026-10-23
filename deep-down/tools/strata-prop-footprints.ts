// WORLD probe: the footprint of every prop kind a stratum places (VIS's models at scale 1): the radius
// of the model's lowest band (what stands on the floor) and its overall radius, max over variants.
// Usage: node tools/run-ts.mjs tools/strata-prop-footprints.ts [seed]
import { generateStratum } from '../src/world/gen/strata/generateStratum';
import { buildPropModel } from '../src/render/props/models';
import { HANGING_KINDS } from '../src/render/props/biomeModels';
import type { PropKind } from '../src/world/gen/types';
export default function footprints(args: string[]): void {
  const seed = Number(args[0] ?? 12345);
  const kinds = new Map<string, number>();
  for (let s = 1; s <= 6; s++) for (const p of generateStratum(seed, s as 1).props) kinds.set(p.kind, Math.max(kinds.get(p.kind) ?? 0, p.scale));
  const rows: string[] = [];
  for (const [kind, maxScale] of [...kinds].sort()) {
    let base = 0;
    let all = 0;
    let h = 0;
    for (let variant = 0; variant < 3; variant++) {
      const model = buildPropModel(kind as PropKind, { variant, hangHeight: 1.6 });
      const pts: Array<[number, number, number]> = [];
      for (const g of [model.body, model.glow]) {
        if (!g) continue;
        const pos = g.getAttribute('position');
        for (let i = 0; i < pos.count; i++) pts.push([pos.getX(i), pos.getY(i), pos.getZ(i)]);
      }
      if (!pts.length) continue;
      let lo = Infinity;
      let hi = -Infinity;
      for (const p of pts) {
        lo = Math.min(lo, p[1]);
        hi = Math.max(hi, p[1]);
      }
      const band = Math.min(0.15, Math.max(0.04, (hi - lo) * 0.12));
      for (const [x, y, z] of pts) {
        const r = Math.hypot(x, z);
        all = Math.max(all, r);
        if (y <= lo + band) base = Math.max(base, r);
      }
      h = Math.max(h, hi - lo);
    }
    rows.push(`${kind.padEnd(18)} base ${base.toFixed(2)} all ${all.toFixed(2)} h ${h.toFixed(2)} maxScale ${maxScale.toFixed(2)}${HANGING_KINDS.has(kind) ? ' hanging' : ''}`);
  }
  for (const r of rows) console.log(r);
}
