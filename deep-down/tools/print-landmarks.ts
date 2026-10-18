import { generateWorld } from '../src/world/gen/generateWorld';
export default function printLandmarks(): void {
  const l = generateWorld().landmarks;
  for (const [k, v] of Object.entries(l)) console.log(k, v.map((n) => +n.toFixed(1)).join(','));
}
