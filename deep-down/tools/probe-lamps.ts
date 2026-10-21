import { generateWorld } from '../src/world/gen/generateWorld';
import { BLOCKS } from '../src/config/blocks';
export default function probe(): void {
  const l = generateWorld();
  for (const p of l.props.filter((p) => p.emitters.length)) {
    console.log(p.id, p.kind, [p.x, p.y, p.z].join(','), 'anchor', p.anchor?.join(','), p.emitters.map((e) => e.join(',') + '=' + BLOCKS[l.world.get(...e)].name).join(' '));
  }
}
