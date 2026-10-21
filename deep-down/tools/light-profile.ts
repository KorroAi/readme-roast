import { generateWorld } from '../src/world/gen/generateWorld';
import { LightField } from '../src/world/light';

export default function lightProfile(): void {
  const layout = generateWorld();
  const l = new LightField(layout.world);
  for (let run = 0; run < 3; run++) {
    const t0 = performance.now();
    l.computeAll();
    const t1 = performance.now();
    l.computeOpenness();
    const t2 = performance.now();
    console.log(`computeAll ${(t1 - t0).toFixed(0)} ms (incl. openness); openness alone ${(t2 - t1).toFixed(0)} ms`);
  }
}
