import { generateWorld } from '../src/world/gen/generateWorld';
import { rarityOf } from '../src/config/rarity';
export default function run(): void {
  const l = generateWorld();
  const counts: Record<string, number> = {};
  for (const p of l.props) {
    const r = rarityOf(p);
    if (!r) continue;
    counts[r] = (counts[r] ?? 0) + 1;
    if (Math.hypot(p.x - 60, p.z - 40) < 25 || r === 'legendary') console.log(r, p.id, p.kind, p.x.toFixed(1), p.y.toFixed(1), p.z.toFixed(1));
  }
  console.log(counts);
}
