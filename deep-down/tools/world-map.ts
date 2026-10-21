// Top-down map of the generated world (WORLD round 2): standable floor cells coloured by height,
// reachable cells (barriers open, rides on) bright, unreachable floor dim, props and pois marked.
// Usage: node tools/run-ts.mjs tools/world-map.ts out.png [scale]
import { writeFileSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/generateWorld';
import { reachableCells, standable } from '../src/world/analysis/reachability';
import { openWorld } from './poi-density';
// @ts-expect-error untyped tool module
import { encodePng } from './png.mjs';

export default function worldMap(args: string[]): void {
  const out = args[0] ?? 'world-map.png';
  const S = Number(args[1] ?? 4);
  const layout = generateWorld();
  const w = openWorld(layout);
  const links = layout.features?.links ?? [];
  const sp = layout.spawn;
  const seen = reachableCells(w, Math.floor(sp.x), Math.floor(sp.y), Math.floor(sp.z), 3, links);
  const W = w.sx * S, H = w.sz * S;
  const img = new Uint8Array(W * H * 4);
  let reach = 0, floor = 0;
  const top = new Int16Array(w.sx * w.sz).fill(-1);
  const rch = new Uint8Array(w.sx * w.sz);
  for (let z = 0; z < w.sz; z++) for (let x = 0; x < w.sx; x++) {
    for (let y = w.sy - 2; y > 0; y--) {
      if (!standable(w, x, y, z)) continue;
      floor++;
      const r = seen[w.index(x, y, z)];
      if (r) reach++;
      if (r && !rch[x + z * w.sx]) { rch[x + z * w.sx] = 1; top[x + z * w.sx] = y; }
      else if (top[x + z * w.sx] < 0) top[x + z * w.sx] = y;
    }
  }
  const px = (x: number, z: number, c: [number, number, number]) => {
    for (let a = 0; a < S; a++) for (let b = 0; b < S; b++) {
      const i = ((z * S + b) * W + x * S + a) * 4;
      img[i] = c[0]; img[i + 1] = c[1]; img[i + 2] = c[2]; img[i + 3] = 255;
    }
  };
  for (let z = 0; z < w.sz; z++) for (let x = 0; x < w.sx; x++) {
    const y = top[x + z * w.sx];
    if (y < 0) { px(x, z, [12, 12, 16]); continue; }
    const t = y / w.sy;
    const c: [number, number, number] = [Math.round(60 + 190 * t), Math.round(90 + 80 * (1 - Math.abs(t - 0.5) * 2)), Math.round(240 - 190 * t)];
    if (!rch[x + z * w.sx]) px(x, z, [c[0] * 0.3, c[1] * 0.3, c[2] * 0.3]);
    else px(x, z, c);
  }
  for (const p of layout.props) {
    const x = Math.floor(p.x), z = Math.floor(p.z);
    if (x >= 0 && z >= 0 && x < w.sx && z < w.sz) px(x, z, p.kind === 'crystalCluster' ? [120, 255, 255] : [255, 255, 255]);
  }
  writeFileSync(out, encodePng(W, H, img));
  console.log(JSON.stringify({ floor, reach, unreached: floor - reach, props: layout.props.length, size: [w.sx, w.sy, w.sz] }));
}
