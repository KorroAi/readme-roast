// WORLD probe: generate strata (for the profiler).
import { generateStratum } from '../src/world/gen/strata/generateStratum';
export default function gen(args: string[]): void {
  for (const n of (args[1] ?? '3').split(',').map(Number)) generateStratum(Number(args[0] ?? 12345), n);
}
