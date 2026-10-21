// U-W5 and U-W6 (SPEC §13.1, §4.11, §4.12; W1-LEAD §3): the fill contract holds from 200 walkable points of every W1
// chamber (tappables on arrival, a reward in view everywhere, a warm practical and an accent, the wonder, a full floor,
// nothing floating, wall cover), a new face feature every ≤ 8 slices, no template within 4 chambers, a landmark
// every ≤ 6.
import { describe, expect, it } from 'vitest';
import { CELL } from '../../../src/idle/model/state';
import { rowKinds } from '../../../src/idle/model/shaft';
import { nodeAt, nodeOfDepth } from '../../../src/idle/model/chart';
import { DeepWorld } from '../../../src/world/hybrid/DeepWorld';
import { scanChamber } from '../../../src/world/hybrid/fill';
import { templateSequence } from '../../../src/world/hybrid/kits/templates';

const SEED = 12345;
const RUN = 7;
/** Generating and scanning six chambers takes ~15 s alone, longer on a loaded machine. */
const HEAVY = 180_000;

describe('the fill contract from walkable points (U-W5)', () => {
  const world = new DeepWorld({ lifeSeed: SEED, runSeed: RUN, worker: false });
  const groups = [
    [0, 1, 2, 3, 4, 5],
    [6, 7, 8, 9, 10, 11],
    [12, 13, 14, 15, 16, 17],
  ];
  for (const nodes of groups)
    it(`chambers ${nodes[0]}–${nodes[nodes.length - 1]} pass every rule from 200 walkable points`, () => {
      for (const i of nodes) {
        const p = world.placement(i);
        world.prime(p.chamber.floorY, p.depthTop + p.K, []);
        const r = scanChamber(world, i, 200);
        expect(r.samples, `node ${i}`).toBeGreaterThanOrEqual(150);
        expect(r.pass, `node ${i} ${p.chamber.template}: ${r.lines.filter((l) => l.startsWith('✗')).join('; ')}`).toBe(true);
      }
    }, HEAVY);

  // A second life seed over the chambers that failed on it before (the Threshold's far gulf corner had no reward in
  // view; a Root Hall crate straddled a 0.5 m step and a chalk arrow hung off its wall).
  it('seed 1: chambers 6–9 pass every rule from 200 walkable points', () => {
    const w1 = new DeepWorld({ lifeSeed: 1, runSeed: RUN, worker: false });
    for (const i of [6, 7, 8, 9]) {
      const p = w1.placement(i);
      w1.prime(p.chamber.floorY, p.depthTop + p.K, []);
      const r = scanChamber(w1, i, 200);
      expect(r.pass, `seed 1 node ${i} ${p.chamber.template}: ${r.lines.filter((l) => l.startsWith('✗')).join('; ')}`).toBe(true);
    }
  }, HEAVY);

  it('a new face feature every ≤ 8 slices over the first two biomes', () => {
    let last = 0;
    for (let d = 0; d < 120; d++) {
      const kinds = rowKinds(RUN, d);
      let special = false;
      for (let c = 0; c < kinds.length; c++) if (kinds[c] !== CELL.ROCK && kinds[c] !== CELL.AIR && kinds[c] !== CELL.TOPSOIL) special = true;
      // The last 3 slices before every breach leak the promise (SPEC §4.2: a breach tell is a face feature too).
      const t = nodeOfDepth(SEED, d);
      if (special || t.breach - d <= 2) last = d;
      expect(d - last, `rows ${last}–${d}`).toBeLessThanOrEqual(8);
    }
  });
});

describe('anti-repetition (U-W6)', () => {
  it('no template repeats within 4 chambers and a landmark comes every ≤ 6 chambers, over 120 nodes and 4 seeds', () => {
    for (const seed of [SEED, 1, 77, 0xbeef]) {
      const seq = templateSequence(seed, 120, (i) => nodeAt(seed, i));
      for (let i = 0; i < seq.length; i++)
        for (let j = i + 1; j < Math.min(seq.length, i + 4); j++) expect(seq[j], `seed ${seed}: nodes ${i} and ${j}`).not.toBe(seq[i]);
      let lastLandmark = 0;
      for (let i = 0; i < 120; i++) {
        const t = nodeAt(seed, i);
        if (t.landmark || t.kind !== 'chamber') lastLandmark = i;
        expect(i - lastLandmark, `seed ${seed}: node ${i}`).toBeLessThanOrEqual(6);
      }
    }
  });
});
