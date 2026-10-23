// WORLD probe: one cell's block after each generator phase (who changed it?).
// Usage: node tools/run-ts.mjs tools/strata-cell-phases.ts seed stratum x,y,z[;x,y,z...]
import { BLOCKS } from '../src/config/blocks';
import { genDebug, generateStratum } from '../src/world/gen/strata/generateStratum';
export default function phases(args: string[]): void {
  const cells = args[2].split(';').map((c) => c.split(',').map(Number));
  let last = '';
  genDebug.phaseHook = (name: string, w?: { get(x: number, y: number, z: number): number }) => {
    if (!w) return;
    const now = cells.map(([x, y, z]) => BLOCKS[w.get(x, y, z)].name.replace('block.', '')).join(' ');
    if (now !== last) console.log(`after ${name}: ${now}`);
    last = now;
  };
  const l = generateStratum(Number(args[0]), Number(args[1]));
  console.log('final:', cells.map(([x, y, z]) => BLOCKS[l.world.get(x, y, z)].name.replace('block.', '')).join(' '));
}
