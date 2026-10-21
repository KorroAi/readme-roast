// VIS glitch probe: props that float (no solid support under their footprint) or sink into rock
// (their model's bounds overlap solid voxels well inside). Run: node tools/run-ts.mjs tools/vis-props.ts
import * as THREE from 'three';
import { generateWorld } from '../src/world/gen/generateWorld';
import { SOLID } from '../src/config/blocks';
import { buildPropModel, propVariant, PROP_VARIANTS } from '../src/render/props/models';

/** Kinds that hang from the roof or stand in the air by design. */
const AIRBORNE = new Set(['hangingLantern', 'rope', 'banner', 'chain', 'hoistWinch']);

export default function probe(): void {
  const layout = generateWorld();
  const w = layout.world;
  const solid = (x: number, y: number, z: number) => SOLID[w.get(Math.floor(x), Math.floor(y), Math.floor(z))] === 1;
  const floating: string[] = [];
  const sunk: string[] = [];
  const box = new THREE.Box3();
  const m = new THREE.Matrix4();
  for (const p of layout.props) {
    const variant = p.modelVariant !== undefined ? p.modelVariant % PROP_VARIANTS[p.kind] : propVariant(p.kind, p.seed);
    let model;
    try {
      model = buildPropModel(p.kind, { variant });
    } catch {
      continue;
    }
    m.compose(new THREE.Vector3(p.x, p.y, p.z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), p.rotY), new THREE.Vector3(p.scale, p.scale, p.scale));
    box.copy(model.bounds).applyMatrix4(m);
    const sx = box.max.x - box.min.x;
    const sz = box.max.z - box.min.z;
    if (!AIRBORNE.has(p.kind) && !model.sway) {
      // Support: sample a 3x3 grid of the footprint (inset 15 %) 5 cm under the base.
      let supported = 0;
      let n = 0;
      for (let i = 0; i < 3; i++)
        for (let k = 0; k < 3; k++) {
          const x = box.min.x + sx * (0.15 + 0.35 * i);
          const z = box.min.z + sz * (0.15 + 0.35 * k);
          n++;
          if (solid(x, box.min.y - 0.22, z)) supported++;
        }
      if (supported < Math.ceil(n * 0.34)) floating.push(`${p.id} (${p.kind}) at ${p.x.toFixed(1)},${p.y.toFixed(1)},${p.z.toFixed(1)}: ${supported}/${n} footprint supported`);
    }
    // Sunk: solid voxels well inside the model's bounds (inset 20 %, from 15 cm above its base).
    let inside = 0;
    let tests = 0;
    const sy = box.max.y - box.min.y;
    for (let i = 0; i < 3; i++)
      for (let j = 0; j < 3; j++)
        for (let k = 0; k < 3; k++) {
          const x = box.min.x + sx * (0.2 + 0.3 * i);
          const y = box.min.y + Math.min(0.15 + sy * 0.3 * j, sy * 0.8);
          const z = box.min.z + sz * (0.2 + 0.3 * k);
          tests++;
          if (solid(x, y, z)) inside++;
        }
    if (inside >= 4 && !AIRBORNE.has(p.kind)) sunk.push(`${p.id} (${p.kind}) at ${p.x.toFixed(1)},${p.y.toFixed(1)},${p.z.toFixed(1)}: ${inside}/${tests} samples in rock`);
  }
  for (const p of layout.props) if (p.kind === 'runeStone' || p.interact === 'rune') console.log('RUNE', p.id, p.x, p.y, p.z, 'below', w.get(Math.floor(p.x), Math.floor(p.y) - 1, Math.floor(p.z)));
  console.log(`props ${layout.props.length}; floating ${floating.length}; sunk ${sunk.length}`);
  for (const s of floating) console.log('FLOAT', s);
  for (const s of sunk) console.log('SUNK ', s);
}
