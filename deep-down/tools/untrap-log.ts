// Print what the trap pass fills after the content pass (WORLD round 2 helper).
import { generateWorld } from '../src/world/gen/generateWorld';
export default function run(): void {
  generateWorld(undefined, { log: true });
}
