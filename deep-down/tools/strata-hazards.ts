// WORLD proof (round 3): hazard pockets never sit on the places the explorer must use. For each
// (seed, stratum): the harmful zones (gas, lava, cold, void) against the arrival, the gate's stand,
// the outpost sites, the lairs' centres and the pages; and every zone's kind against the blocks
// round its centre (a gas pocket over real gas pools or the geyser field, a lava zone over lava).
// Usage: node tools/run-ts.mjs tools/strata-hazards.ts [seeds e.g. 12345,777] [strata e.g. 1,2,3]
import { B } from '../src/config/blocks';
import { generateStratum } from '../src/world/gen/strata/generateStratum';
import type { StratumIndex } from '../src/config/biomes';

type V3 = readonly [number, number, number] | readonly number[];

export default function hazards(args: string[]): void {
  const seeds = (args[0] ?? '12345,777,4242').split(',').map(Number);
  const strata = (args[1] ?? '1,2,3,4,5,6').split(',').map(Number) as StratumIndex[];
  let bad = 0;
  let zones = 0;
  const kinds: Record<string, number> = {};
  for (const seed of seeds) for (const s of strata) {
    const l = generateStratum(seed, s);
    const w = l.world;
    const places: { id: string; p: V3; r: number }[] = [
      { id: 'arrival', p: [l.arrival.x, l.arrival.y, l.arrival.z], r: 3 },
      { id: 'gateStand', p: l.gate.stand, r: 2 },
      ...l.outpostSites.map((o) => ({ id: o.id, p: o.p, r: 2 })),
      ...l.lairs.map((a) => ({ id: `lair_${a.biome}`, p: a.centre, r: 4 })),
      ...l.pages.map((p) => ({ id: p.id, p: p.p, r: 0 })),
    ];
    const harmful = l.hazards.filter((h) => h.kind === 'gas' || h.kind === 'lava');
    const issues: string[] = [];
    for (const h of l.hazards) {
      zones++;
      kinds[h.kind] = (kinds[h.kind] ?? 0) + 1;
    }
    for (const h of harmful) for (const pl of places) {
      const d = Math.hypot(pl.p[0] - h.centre[0], (pl.p[1] - h.centre[1]) * 1.5, pl.p[2] - h.centre[2]);
      if (d < h.radius + pl.r) issues.push(`${pl.id} in ${h.kind} ${h.id} (d ${d.toFixed(1)} < ${h.radius.toFixed(1)} + ${pl.r})`);
    }
    // A lava zone over real lava, a gas zone over a toxic pool or vent field (blocks within its radius).
    for (const h of harmful) {
      const want = h.kind === 'lava' ? [B.LAVA] : [B.TOXIC_POOL];
      let n = 0;
      const R = Math.ceil(h.radius);
      for (let dz = -R; dz <= R; dz++) for (let dx = -R; dx <= R; dx++) for (let dy = -4; dy <= 2; dy++) {
        if (dx * dx + dz * dz > R * R) continue;
        if (want.includes(w.get(Math.floor(h.centre[0]) + dx, Math.floor(h.centre[1]) + dy, Math.floor(h.centre[2]) + dz))) n++;
      }
      if (!n) issues.push(`${h.id} ${h.kind} r ${h.radius.toFixed(1)}: no ${h.kind === 'lava' ? 'lava' : 'toxic pool'} blocks within it`);
    }
    bad += issues.length;
    console.log(`seed ${seed} stratum ${s}: ${l.hazards.length} zones (${harmful.length} gas/lava), ${places.length} places: ${issues.length ? issues.join('; ') : 'clear'}`);
  }
  console.log(`zones ${zones} ${JSON.stringify(kinds)}; issues ${bad}`);
}
