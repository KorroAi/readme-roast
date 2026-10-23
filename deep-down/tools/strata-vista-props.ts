// WORLD probe: the props round each vista (VIS 01:05: draw calls): crystal clusters, chests and all,
// inside the hall (its radius) and within 60 m of the balcony.
// Usage: node tools/run-ts.mjs tools/strata-vista-props.ts [seed]
import { generateStratum } from '../src/world/gen/strata/generateStratum';
export default function vistaProps(args: string[]): void {
  const seed = Number(args[0] ?? 7);
  for (let s = 1; s <= 6; s++) {
    const l = generateStratum(seed, s as 1);
    const V = l.vista;
    if (!V) continue;
    const inHall = l.props.filter((p) => Math.hypot(p.x - V.centre[0], p.z - V.centre[2]) < V.radius && p.y >= V.centre[1] - 2 && p.y <= V.centre[1] + 30);
    const near = l.props.filter((p) => Math.hypot(p.x - V.balcony[0], p.y - V.balcony[1], p.z - V.balcony[2]) < 60);
    const count = (list: typeof l.props, k: string) => list.filter((p) => p.kind === k).length;
    console.log(`stratum ${s} ${V.name}: in the hall ${inHall.length} props (crystal clusters ${count(inHall, 'crystalCluster')}, chests ${count(inHall, 'chest')}); within 60 m of the balcony ${near.length} (crystal clusters ${count(near, 'crystalCluster')}, chests ${count(near, 'chest')})`);
  }
}
