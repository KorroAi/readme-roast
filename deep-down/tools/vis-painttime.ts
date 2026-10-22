import { generateMaterials, MATERIAL_NAMES } from '../src/render/materials';
export default async function () {
  for (let k = 0; k < 3; k++) {
    const t0 = performance.now();
    const a = generateMaterials();
    console.log('layers', a.layers, 'ms', Math.round(performance.now() - t0), MATERIAL_NAMES.length);
  }
}
