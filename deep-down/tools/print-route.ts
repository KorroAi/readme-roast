// Print the generated route waypoints, the camp box and the feature boxes (WORLD round 2 helper).
import { generateWorld } from '../src/world/gen/generateWorld';
export default function printRoute(): void {
  const l = generateWorld();
  console.log('camp', JSON.stringify(l.camp));
  console.log('spawn', JSON.stringify(l.spawn));
  console.log('route', JSON.stringify(l.route.map((p) => p.map((n) => Math.round(n)))));
  for (const b of l.features?.boxes ?? []) console.log('box', b.id, b.min.join(','), b.max.join(','));
  for (const d of l.discoveries) console.log('disc', d.id, d.min.join(','), d.max.join(','));
  for (const a of l.features?.areas ?? []) console.log('area', a.id, a.p.join(','), a.r);
}
