import { describe, expect, it } from 'vitest';
import { createIdleBus } from '../../../src/idle/bus';
import { biomeStart } from '../../../src/idle/config/biomes';
import { tapEntityResult, widgetTap } from '../../../src/idle/model/entities';
import { SEAL, sealView, weakId } from '../../../src/idle/model/seals';
import { CELL } from '../../../src/idle/model/state';
import { STEP_DT, stepIdle } from '../../../src/idle/model/step';
import { strikePos } from '../../../src/idle/model/widgets';
import type { StrikeWidget } from '../../../src/idle/model/state';
import { play, stateAt } from './w2fixture';

/** A state 0 rows above the never-opened seal of biome k (the floor is the slab). */
function atSeal(k: number, seed: number) {
  const d = biomeStart(k);
  const s = stateAt(d, seed, { pick: Math.floor(d / 3), lines: [Math.floor(d / 4), Math.floor(d / 8)], open: false });
  for (let b = 1; b < k; b++) s.meta.sealsOpened.push(b);
  return s;
}

describe('seals as mechanisms (hybrid SPEC §5.5, E21)', () => {
  it('E21: an active player at 4 taps/s breaks a first-time seal on the first try in ≥ 90 % of seeds; the crew alone cannot', () => {
    let wins = 0;
    let crewWins = 0;
    const n = 20;
    for (let seed = 1; seed <= n; seed++) {
      for (const crewOnly of [false, true]) {
        const s = atSeal(2, seed);
        const bus = createIdleBus();
        let broke = false;
        let failed = false;
        bus.on('seal:break', () => (broke = true));
        bus.on('seal:fail', () => (failed = true));
        stepIdle(s, STEP_DT, [], bus);
        expect(s.seal).not.toBeNull();
        // 4 taps/s on the slab, a tap on the weak point whenever it lights, the finisher stopped as it comes.
        for (let t = 0; t < 32 && !broke && !failed; t += STEP_DT) {
          const taps = [] as Array<{ col: number; kind: 'tap'; entity?: string }>;
          if (!crewOnly && Math.floor(t * 4) !== Math.floor((t - STEP_DT) * 4)) {
            const w = weakId(s);
            taps.push(w ? { col: -1, kind: 'tap', entity: w } : { col: 3, kind: 'tap' });
          }
          stepIdle(s, STEP_DT, taps, bus);
          const v = sealView(s);
          if (!crewOnly && v?.finisher) {
            const w = s.widgets.find((x) => x.id === v.finisher) as StrikeWidget | undefined;
            if (w && !w.done && Math.abs(strikePos(w, s.time) - w.zone) < 0.1) widgetTap(s, v.finisher, 0, bus);
          }
        }
        if (crewOnly) crewWins += broke ? 1 : 0;
        else wins += broke ? 1 : 0;
      }
    }
    expect(wins / n).toBeGreaterThanOrEqual(0.9);
    expect(crewWins).toBe(0);
  }, 60000);

  it('the weak point lights every 5 s for 1 s and a tap on it hits ×5', () => {
    const s = atSeal(2, 3);
    const bus = createIdleBus();
    stepIdle(s, STEP_DT, [], bus);
    const lit: number[] = [];
    bus.on('seal:weak', (e) => {
      if (e.lit) lit.push(s.time);
    });
    play(s, 11.5, 0, bus);
    expect(lit.length).toBe(2);
    expect(lit[1] - lit[0]).toBeCloseTo(SEAL.weakEvery, 1);
    // While lit: a plain hit and a weak-point hit.
    const before = s.seal!.left;
    stepIdle(s, STEP_DT, [{ col: 3, kind: 'tap' }], bus);
    const plain = before - s.seal!.left;
    // Wait for the next lighting, then hit the weak point.
    while (!weakId(s)) stepIdle(s, STEP_DT, [], bus);
    const b2 = s.seal!.left;
    const r = tapEntityResult(s, weakId(s), bus);
    expect(r.ok).toBe(true);
    const weak = b2 - s.seal!.left;
    expect(weak / plain).toBeGreaterThan(3);
  });

  it('a fail keeps half the damage, waits for a tap, takes nothing away (L11)', () => {
    const s = atSeal(3, 5);
    const bus = createIdleBus();
    stepIdle(s, STEP_DT, [], bus);
    const gold = s.run.gold.clone();
    const pick = s.run.pick;
    let failed = 0;
    bus.on('seal:fail', () => failed++);
    play(s, 4, 2, bus);
    // The crew keeps helping for 2 s after the last tap, then stops (first sight is the player's).
    play(s, 2.5, 0, bus);
    const dealt = 1 - s.seal!.left;
    play(s, 30, 0, bus);
    expect(failed).toBe(1);
    expect(s.seal!.phase).toBe('held');
    expect(1 - s.seal!.left).toBeCloseTo(dealt * SEAL.kept, 6);
    expect(s.run.gold.gte(gold)).toBe(true);
    expect(s.run.pick).toBe(pick);
    // The crew alone never restarts it; a tap does.
    play(s, 3, 0, bus);
    expect(s.seal!.phase).toBe('held');
    stepIdle(s, STEP_DT, [{ col: 2, kind: 'tap' }], bus);
    expect(s.seal!.phase).toBe('fight');
  });

  it('the Strike finisher appears at 25 % and a perfect stop is a ×10 hit; the win pays its rewards', () => {
    const s = atSeal(2, 9);
    const bus = createIdleBus();
    let finisher = '';
    bus.on('seal:finisher', (e) => (finisher = e.widget));
    let broke: { gems?: number; relic?: string } | null = null;
    bus.on('seal:break', (e) => (broke = e));
    const opened: string[] = [];
    bus.on('chest:open', (e) => opened.push(e.source));
    stepIdle(s, STEP_DT, [], bus);
    s.seal!.left = 0.26;
    for (let i = 0; i < 20 && !finisher; i++) stepIdle(s, STEP_DT, [{ col: 3, kind: 'tap' }], bus);
    expect(finisher).not.toBe('');
    const w = s.widgets.find((x) => x.id === finisher) as StrikeWidget;
    // Stop the needle in the perfect zone.
    while (Math.abs(strikePos(w, s.time) - w.zone) > w.perfect / 2) stepIdle(s, 1 / 240, [], bus);
    const before = s.seal?.left ?? 0;
    widgetTap(s, finisher, 0, bus);
    expect(w.grades[0]).toBe('perfect');
    expect(s.seal === null || s.seal.left < before).toBe(true);
    // Finish it.
    play(s, 20, 5, bus);
    expect(broke).not.toBeNull();
    expect(broke!.gems).toBe(SEAL.gems);
    expect(opened).toContain('seal');
    expect(s.meta.finds['find:1:5']).toBeGreaterThanOrEqual(1); // the seal's own relic (slot 5: the Root Crown)
    expect(s.meta.lore).toContain('lore:1:seal');
    expect(s.shaft.rows[0].kinds[0]).not.toBe(CELL.SEAL);
  });

  it('charted gates: a later run crosses an opened gate as a hard row, with its split; the second gate of a run deals a facet hand', () => {
    const s = stateAt(118, 4, { pick: 60, lines: [60, 40, 20] });
    s.meta.sealsOpened = [1, 2, 3];
    const bus = createIdleBus();
    const gates: number[] = [];
    bus.on('gate:break', (e) => gates.push(e.biome));
    let hands = 0;
    bus.on('facet:offer', () => hands++);
    s.run.sealsBroken = 1;
    play(s, 30, 5, bus);
    expect(gates).toContain(2);
    expect(hands).toBeGreaterThanOrEqual(1);
    expect(s.hand).not.toBeNull();
  });
});
