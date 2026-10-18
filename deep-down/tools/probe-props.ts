import { generateWorld } from '../src/world/gen/generateWorld';
import { BLOCKS } from '../src/config/blocks';

export default function probe(): void {
  const layout = generateWorld();
  const w = layout.world;
  for (const p of layout.props.filter((p) => p.kind === 'lanternPost')) {
    const e = p.emitters.map(([x, y, z]) => `${x},${y},${z}=${BLOCKS[w.get(x, y, z)].name}#${w.get(x, y, z)}`).join(' ');
    console.log(p.id, p.x, p.y, p.z, 'below', BLOCKS[w.get(Math.floor(p.x), p.y - 1, Math.floor(p.z))].name, 'emitters', e);
  }
}
