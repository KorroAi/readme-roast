import { generateWorld } from '../src/world/gen/generateWorld';
import { standable } from '../src/world/analysis/reachability';
import { SOLID } from '../src/config/blocks';

/** Prints a top-down map: digit = (standable y - base) mod 10, '#' = solid column at all levels, '.' = no floor. */
export default function slice(args: string[]): void {
  const [x0, x1, z0, z1, y0, y1] = args.map(Number);
  const w = generateWorld().world;
  console.log(`x ${x0}..${x1} (cols), z ${z0}..${z1} (rows), y ${y0}..${y1}; digit = highest standable y - ${y0}`);
  for (let z = z0; z <= z1; z++) {
    let row = String(z).padStart(4) + ' ';
    for (let x = x0; x <= x1; x++) {
      let ch = '.';
      let allSolid = true;
      for (let y = y1; y >= y0; y--) {
        if (!SOLID[w.get(x, y, z)]) allSolid = false;
        if (standable(w, x, y, z)) { ch = String((y - y0) % 10); break; }
      }
      if (ch === '.' && allSolid) ch = '#';
      row += ch;
    }
    console.log(row);
  }
}
