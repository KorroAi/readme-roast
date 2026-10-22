// WORLD probe: what a camera ray meets in a stratum (the first solid block and its distance), to check
// a capture's view. Usage: node tools/run-ts.mjs tools/strata-ray.ts seed stratum eyeX,eyeY,eyeZ lookX,lookY,lookZ
import { BLOCKS, SOLID } from '../src/config/blocks';
import { generateStratum } from '../src/world/gen/strata/generateStratum';

export default function ray(args: string[]): void {
  const l = generateStratum(Number(args[0]), Number(args[1]));
  const e = args[2].split(',').map(Number);
  const t = args[3].split(',').map(Number);
  const w = l.world;
  const fan = [[0, 0], [-0.3, 0], [0.3, 0], [0, -0.25], [0, 0.25]];
  const d0 = [t[0] - e[0], t[1] - e[1], t[2] - e[2]];
  const len = Math.hypot(d0[0], d0[1], d0[2]);
  const yaw = Math.atan2(d0[2], d0[0]);
  const pitch = Math.asin(d0[1] / len);
  for (const [dy, dp] of fan) {
    const a = yaw + dy;
    const p = pitch + dp;
    const dir = [Math.cos(p) * Math.cos(a), Math.sin(p), Math.cos(p) * Math.sin(a)];
    let hit = '';
    let lights = 0;
    for (let s = 0.2; s < 80; s += 0.2) {
      const x = Math.floor(e[0] + dir[0] * s), y = Math.floor(e[1] + dir[1] * s), z = Math.floor(e[2] + dir[2] * s);
      const id = w.get(x, y, z);
      if (!SOLID[id] && BLOCKS[id].emission) lights++;
      if (SOLID[id]) {
        hit = `${BLOCKS[id].name} at ${s.toFixed(1)} m (${x},${y},${z})`;
        break;
      }
    }
    console.log(`yaw ${dy >= 0 ? '+' : ''}${dy} pitch ${dp >= 0 ? '+' : ''}${dp}: ${hit || 'nothing within 80 m'}; light cells passed ${lights}`);
  }
  const V = l.vista;
  if (V) console.log('vista', V.name, 'centre', V.centre.map((v) => +v.toFixed(1)), 'radius', V.radius.toFixed(1), 'island', V.island, 'rampFoot', V.rampFoot.map((v) => +v.toFixed(1)), 'balcony', V.balcony.map((v) => +v.toFixed(1)));
}
