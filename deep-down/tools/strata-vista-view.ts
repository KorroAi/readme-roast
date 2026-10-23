// WORLD proof (round 3, QA 01:19): what the explorer sees of the vista's hall where its card shows.
// From the eye (feet + 1.62) at the lookout (the card's centre), at the card's edge on the way in
// (its radius back toward the balcony), and at the balcony's middle (the card's old centre): the share of
// the lake's surface (the lava lake in the fire stratum) in clear sight (no voxel on the line), and
// whether the island's lit tip shows.
// Usage: node tools/run-ts.mjs tools/strata-vista-view.ts [seeds e.g. 12345,7,777] [strata e.g. 1,2,3]
import { B, SOLID } from '../src/config/blocks';
import { generateStratum } from '../src/world/gen/strata/generateStratum';
import type { StratumIndex } from '../src/config/biomes';
import type { StratumLayout } from '../src/world/gen/strata/types';

/** The vista's lake cells (x, surface y, z): its water mask, or the lava under the hall's floor in VI. */
export function vistaLakeCells(l: StratumLayout): Array<[number, number, number]> {
  const V = l.vista!;
  const out: Array<[number, number, number]> = [];
  const lake = l.features?.lakes?.find((k) => k.id.startsWith('vista_lake_'));
  if (lake) {
    const w = lake.max[0] - lake.min[0] + 1;
    for (let z = lake.min[1]; z <= lake.max[1]; z++) for (let x = lake.min[0]; x <= lake.max[0]; x++) if (lake.mask[(z - lake.min[1]) * w + (x - lake.min[0])]) out.push([x + 0.5, lake.level + 0.05, z + 0.5]);
    return out;
  }
  const R = Math.ceil(V.radius);
  for (let dz = -R; dz <= R; dz++) for (let dx = -R; dx <= R; dx++) {
    const x = Math.floor(V.centre[0]) + dx;
    const z = Math.floor(V.centre[2]) + dz;
    for (const y of [V.centre[1] - 2, V.centre[1] - 1]) if (l.world.get(x, y, z) === B.LAVA && !SOLID[l.world.get(x, y + 1, z)]) {
      out.push([x + 0.5, y + 1.02, z + 0.5]);
      break;
    }
  }
  return out;
}

/** Is the line from the eye to p clear of voxels (p's own cell excepted)? */
export function clearLine(l: StratumLayout, e: readonly number[], p: readonly number[]): boolean {
  const d = [p[0] - e[0], p[1] - e[1], p[2] - e[2]];
  const len = Math.hypot(d[0], d[1], d[2]);
  for (let s = 0.3; s < len - 0.6; s += 0.25) {
    const x = Math.floor(e[0] + (d[0] / len) * s);
    const y = Math.floor(e[1] + (d[1] / len) * s);
    const z = Math.floor(e[2] + (d[2] / len) * s);
    if (SOLID[l.world.get(x, y, z)]) return false;
  }
  return true;
}

/** The share of the lake in sight from feet f (eye 1.62 up), and the island's tip. */
export function vistaSight(l: StratumLayout, f: readonly number[]): { lake: number; island: boolean } {
  const e = [f[0], f[1] + 1.62, f[2]];
  const cells = vistaLakeCells(l);
  let seen = 0;
  for (const c of cells) if (clearLine(l, e, c)) seen++;
  const isl = l.vista?.island;
  return { lake: cells.length ? seen / cells.length : 0, island: !!isl && clearLine(l, e, [isl[0], isl[1] + 0.5, isl[2]]) };
}

/** The card's edge on the way in: its radius from the lookout back toward the balcony's middle. */
export function cardEdge(l: StratumLayout): [number, number, number] {
  const V = l.vista!;
  const site = l.sites.find((x) => x.kind === 'vista')!;
  const lo = site.centre;
  const ux = V.balcony[0] - lo[0];
  const uz = V.balcony[2] - lo[2];
  const n = Math.hypot(ux, uz) || 1;
  const r = Math.max(0, site.radius - 0.05);
  return [lo[0] + (ux / n) * r, lo[1], lo[2] + (uz / n) * r];
}

export default function view(args: string[]): void {
  const seeds = (args[0] ?? '12345,7,777').split(',').map(Number);
  const strata = (args[1] ?? '1,2,3,4,5,6').split(',').map(Number) as StratumIndex[];
  let worstEdge = 1;
  let worstLook = 1;
  for (const seed of seeds) for (const s of strata) {
    const l = generateStratum(seed, s);
    const V = l.vista;
    if (!V) {
      console.log(`seed ${seed} stratum ${s}: no vista`);
      continue;
    }
    const site = l.sites.find((x) => x.kind === 'vista')!;
    const atLook = vistaSight(l, V.lookout ?? V.balcony);
    const atEdge = vistaSight(l, cardEdge(l));
    const atMiddle = vistaSight(l, V.balcony);
    worstEdge = Math.min(worstEdge, atEdge.lake);
    worstLook = Math.min(worstLook, atLook.lake);
    const pct = (v: number) => `${Math.round(v * 100)} %`;
    console.log(`seed ${seed} stratum ${s} ${V.name}: card at ${site.centre.map((v) => +v.toFixed(1)).join(',')} r ${site.radius}; lake in sight from the lookout ${pct(atLook.lake)} (island ${atLook.island ? 'yes' : 'no'}), from the card's edge ${pct(atEdge.lake)} (island ${atEdge.island ? 'yes' : 'no'}), from the balcony's middle ${pct(atMiddle.lake)}`);
  }
  console.log(`worst: lookout ${Math.round(worstLook * 100)} %, card's edge ${Math.round(worstEdge * 100)} %`);
}
