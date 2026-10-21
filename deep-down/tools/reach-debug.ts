import { generateWorld } from '../src/world/gen/generateWorld';
import { reachableCells, nearReachable, standable } from '../src/world/analysis/reachability';
import { B } from '../src/config/blocks';

export default function reachDebug(): void {
  const layout = generateWorld();
  const w = layout.world;
  const s = layout.spawn;
  const seen = reachableCells(w, Math.floor(s.x), Math.floor(s.y) + 1, Math.floor(s.z));
  let total = 0, minY = 999;
  for (let i = 0; i < seen.length; i++) if (seen[i]) { total++; minY = Math.min(minY, Math.floor(i / w.sx) % w.sy); }
  console.log('reachable cells', total, 'minY', minY);
  for (const [k, [x, y, z]] of Object.entries(layout.landmarks)) {
    console.log(k, [x, y, z].map((v) => +v.toFixed(1)).join(','), 'reach=', nearReachable(w, seen, x, y, z, 3, 3), 'standable here', standable(w, Math.floor(x), Math.floor(y), Math.floor(z)), 'block', w.get(Math.floor(x), Math.floor(y), Math.floor(z)), 'below', w.get(Math.floor(x), Math.floor(y) - 1, Math.floor(z)));
  }
  // Route: each route point
  for (const [x, y, z] of layout.route) console.log('route', x, y, z, nearReachable(w, seen, x, y, z, 2, 2));
  // reachable cells by y-level histogram in the Hollow
  const hist: Record<number, number> = {};
  for (let i = 0; i < seen.length; i++) if (seen[i]) { const y = Math.floor(i / w.sx) % w.sy; hist[y] = (hist[y] ?? 0) + 1; }
  console.log(JSON.stringify(hist));
  void B;
}
