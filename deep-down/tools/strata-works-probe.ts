// WORLD probe (round 3): an ASCII plan of the Halden works of one attempt (floor level), with the walk BFS.
// Usage: node tools/run-ts.mjs tools/strata-works-probe.ts seed stratum attempt
import { B, SOLID } from '../src/config/blocks';
import { attemptStratum } from '../src/world/gen/strata/generateStratum';
import { walkBfs } from '../src/world/gen/strata/content';

export default function probe(args: string[]): void {
  const l = attemptStratum(Number(args[0]), Number(args[1]) as 1, Number(args[2] ?? 0));
  const w = l.world;
  const d = l.dungeon;
  console.log('failed', l.failed, 'works', d ? { entry: d.entry, vault: d.vault, puzzle: d.puzzle } : null);
  if (!d) return;
  const open = new Set([...l.gate.seal, ...d.door].map(([x, y, z]) => w.index(x, y, z)));
  const seen = walkBfs({ world: w }, [l.arrival.x, l.arrival.y, l.arrival.z], open);
  const y = Math.floor(d.entry[1]);
  const xs = [...d.door.map((c) => c[0]), d.entry[0], d.vault[0]];
  const zs = [...d.door.map((c) => c[2]), d.entry[2], d.vault[2]];
  const x0 = Math.floor(Math.min(...xs)) - 22;
  const x1 = Math.ceil(Math.max(...xs)) + 22;
  const z0 = Math.floor(Math.min(...zs)) - 22;
  const z1 = Math.ceil(Math.max(...zs)) + 22;
  for (const dy of [0, 1]) {
    console.log(`--- y = ${y + dy} (feet level ${y}); # rock, . air, o reachable feet, D door, P plate below, E entry, V vault`);
    for (let z = z0; z <= z1; z++) {
      let row = '';
      for (let x = x0; x <= x1; x++) {
        const id = w.get(x, y + dy, z);
        const isE = Math.floor(d.entry[0]) === x && Math.floor(d.entry[2]) === z;
        const isV = Math.floor(d.vault[0]) === x && Math.floor(d.vault[2]) === z;
        row += isE ? 'E' : isV ? 'V' : id === B.HALDEN_DOOR ? 'D' : seen[w.index(x, y, z)] ? 'o' : SOLID[id] ? '#' : w.get(x, y - 1, z) === B.PRESSURE_PLATE ? 'P' : '.';
      }
      console.log(row);
    }
  }
}
