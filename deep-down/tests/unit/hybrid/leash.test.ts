// The leash (hybrid SPEC §5.3, §13.1 U-M6; BUILD §3.1 MUST 4). The offline closed form with the leash: offlineLeash.test.ts.
import { describe, expect, it } from 'vitest';
import { LEASH } from '../../../src/idle/config/chart';
import { nodeAt } from '../../../src/idle/model/chart';
import { crewStopDepth, frontNode, isSeen, leashL, leashOpen, setPlayerNode } from '../../../src/idle/model/nodes';
import { advanceIdle } from '../../../src/idle/model/offline';
import { sealPending } from '../../../src/idle/model/shaft';
import type { IdleState } from '../../../src/idle/model/state';
import { createHybrid } from '../../../src/idle/model/step';

const SEED = 7;

/** A player standing in chamber i of a lifetime whose Hatch is open and whose Topsoil is seen. */
function at(i: number, seed = SEED): IdleState {
  const s = createHybrid(seed, 0);
  s.meta.sealsOpened = [1];
  for (let k = 0; k < 7; k++) if (!s.meta.seen.includes(k)) s.meta.seen.push(k);
  setPlayerNode(s, i, 'explore');
  // A working crew (the Shovel Hand and the Pick Crew), so the crew digs while the player is away.
  s.run.lines = [40, 20];
  return s;
}

/** The first Glowroot chamber after the Threshold, and the biome's unseen first sight (its Vista). */
function glowroot(seed = SEED): { first: number; vista: number; hall: number } {
  let first = -1;
  let vista = -1;
  let hall = -1;
  for (let i = 0; i < 40; i++) {
    const t = nodeAt(seed, i);
    if (t.biome !== 1) continue;
    if (t.kind !== 'threshold' && first < 0) first = i;
    if (t.kind === 'vista' && vista < 0) vista = i;
    if (t.exitSeal && hall < 0) hall = i;
  }
  return { first, vista, hall };
}

describe('U-M6 the leash', () => {
  it('L = 0 in Topsoil, 3 from Glowroot, +1 per Survey Lamps level, at most 8', () => {
    expect(LEASH).toEqual({ topsoil: 0, base: 3, max: 8 });
    expect(leashL(at(2))).toBe(0);
    const g = at(glowroot().first);
    expect(leashL(g)).toBe(3);
    g.run.ups.survey = 2;
    expect(leashL(g)).toBe(5);
    g.run.ups.survey = 40;
    expect(leashL(g)).toBe(8);
  });

  it('Topsoil: the crew digs the next drift but stops one slice short of its breach (first light is yours)', () => {
    // A first lifetime: nothing past the player's chamber has been seen.
    const s = createHybrid(SEED, 0);
    setPlayerNode(s, 1, 'explore');
    s.run.lines = [40, 20];
    advanceIdle(s, 6 * 3600);
    const next = nodeAt(SEED, 2);
    expect(s.run.depth).toBe(next.breach);
    expect(s.node.chambers[2]).toBeUndefined();
    expect(leashOpen(s)).toBe(0);
  });

  for (const seed of [7, 11, 23]) {
    it(`Glowroot (seed ${seed}): at most L unseen chambers open ahead, never an unseen first sight, never a seal`, () => {
      const g = glowroot(seed);
      const s = at(g.first, seed);
      advanceIdle(s, 24 * 3600);
      const front = frontNode(s);
      expect(front - s.node.node - 1).toBeLessThanOrEqual(leashL(s));
      expect(leashOpen(s)).toBeLessThanOrEqual(3);
      for (let i = s.node.node + 1; i < front; i++) {
        const t = nodeAt(seed, i);
        expect(t.firstSight && !isSeen(s, i), `node ${i} is an unseen first sight`).toBe(false);
        expect(s.node.chambers[i]?.lit ?? false, `node ${i} was lit by the crew`).toBe(false);
      }
      // Never past a pending seal row.
      for (let i = 0; i <= front; i++) {
        const t = nodeAt(seed, i);
        if (t.seal && sealPending(s, t.depthTop)) expect(s.run.depth).toBeLessThanOrEqual(t.depthTop);
      }
    });
  }

  it('the Vista is a first sight: the crew stops at its breach even with leash to spare', () => {
    const g = glowroot();
    const s = at(g.vista - 1);
    s.run.ups.survey = 5;
    advanceIdle(s, 24 * 3600);
    expect(s.run.depth).toBe(nodeAt(SEED, g.vista).breach);
  });

  it('seen ground is unleashed: the crew digs on through chambers already seen, to the next pending seal', () => {
    const g = glowroot();
    const s = at(g.first);
    for (let i = 0; i <= g.hall + 1; i++) if (!s.meta.seen.includes(i)) s.meta.seen.push(i);
    advanceIdle(s, 24 * 3600);
    const knot = nodeAt(SEED, g.hall + 1);
    expect(knot.seal).toBe(true);
    expect(knot.closed).toBe(true);
    expect(s.run.depth).toBe(knot.depthTop);
    expect(crewStopDepth(s)).toBe(knot.depthTop);
  });
});
