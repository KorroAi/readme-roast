// Free-rock map (WORLD round 2): for each 16 m storey, a top-down PNG of the open cells (white),
// so new caverns can be carved where the generated world is still solid rock.
// Usage: node tools/run-ts.mjs tools/space-map.ts outPrefix
import { writeFileSync } from 'node:fs';
import { SOLID } from '../src/config/blocks';
import { generateWorld } from '../src/world/gen/generateWorld';
// @ts-expect-error untyped tool module
import { encodePng } from './png.mjs';

export default function spaceMap(args: string[]): void {
  const prefix = args[0] ?? 'space';
  const S = 3;
  const { world: w } = generateWorld();
  for (let band = 0; band < w.sy / 16; band++) {
    const W = w.sx * S, H = w.sz * S;
    const img = new Uint8Array(W * H * 4);
    for (let z = 0; z < w.sz; z++) for (let x = 0; x < w.sx; x++) {
      let open = 0;
      for (let y = band * 16; y < band * 16 + 16; y++) if (!SOLID[w.get(x, y, z)]) open++;
      const v = open === 0 ? 20 : 80 + Math.round((open / 16) * 175);
      const grid = x % 10 === 0 || z % 10 === 0;
      for (let a = 0; a < S; a++) for (let b = 0; b < S; b++) {
        const i = ((z * S + b) * W + x * S + a) * 4;
        img[i] = grid ? Math.min(255, v + 40) : v; img[i + 1] = v; img[i + 2] = open === 0 ? 30 : v; img[i + 3] = 255;
      }
    }
    writeFileSync(`${prefix}-y${band * 16}.png`, encodePng(W, H, img));
  }
}
