// WORLD probe: the bounds of VIS's prop models (metres at scale 1, before the prop's own scale), to
// size placement footprints. Usage: node tools/run-ts.mjs tools/strata-prop-bounds.ts kind[,kind...]
import * as THREE from 'three';
import { buildPropModel } from '../src/render/props/models';
import type { PropKind } from '../src/world/gen/types';
export default function bounds(args: string[]): void {
  for (const kind of (args[0] ?? 'abyssMonolith').split(',')) {
    for (let variant = 0; variant < 2; variant++) {
      const model = buildPropModel(kind as PropKind, { variant, hangHeight: 1.6 });
      const box = new THREE.Box3();
      for (const g of [model.body, model.glow]) {
        if (!g) continue;
        g.computeBoundingBox();
        if (g.boundingBox) box.union(g.boundingBox);
      }
      console.log(kind, 'variant', variant, 'min', box.min.toArray().map((v) => v.toFixed(2)).join(','), 'max', box.max.toArray().map((v) => v.toFixed(2)).join(','));
    }
  }
}
