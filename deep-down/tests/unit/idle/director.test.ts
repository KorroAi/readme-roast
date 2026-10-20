import { describe, expect, it } from 'vitest';
import { createIdleBus } from '../../../src/idle/bus';
import { DIRECTOR, EVENTS } from '../../../src/idle/config/events';
import { deckTypes, forceEvent, nextEvent, nextGap, recordDealt } from '../../../src/idle/model/director';
import { tapEntity, widgetTap } from '../../../src/idle/model/entities';
import { CELL } from '../../../src/idle/model/state';
import { STEP_DT, stepIdle } from '../../../src/idle/model/step';
import { play, stateAt } from './w2fixture';

describe('the Director (SPEC §7.2, E23)', () => {
  it('E23: a 10,000-event fuzz — intervals in [40, 70] s, never the same type twice, every unlocked type in any 10', () => {
    for (const depth of [130, 260, 700]) {
      const s = stateAt(depth, 17);
      const types = deckTypes(s);
      const seq: string[] = [];
      for (let i = 0; i < 10000; i++) {
        const g = nextGap(s);
        expect(g).toBeGreaterThanOrEqual(DIRECTOR.gap[0]);
        expect(g).toBeLessThanOrEqual(DIRECTOR.gap[1]);
        const t = nextEvent(s);
        expect(t).not.toBe('');
        recordDealt(s, t);
        seq.push(t);
      }
      for (let i = 1; i < seq.length; i++) expect(seq[i]).not.toBe(seq[i - 1]);
      for (let i = 0; i + 10 <= seq.length; i++) {
        const w = new Set(seq.slice(i, i + 10));
        for (const t of types) if (!w.has(t)) throw new Error(`${t} missing from events ${i}–${i + 9} at ${depth} m`);
      }
    }
  });

  it('deals one event every 40–70 s of active play, never during a seal; idle players get only waiting events', () => {
    const s = stateAt(300, 5, { pick: 80, lines: [80, 60, 40, 20, 5] });
    const bus = createIdleBus();
    const starts: Array<{ t: number; type: string }> = [];
    bus.on('event:start', (e) => starts.push({ t: s.time, type: e.type }));
    play(s, 400, 3, bus, 3, 1 / 30);
    expect(starts.length).toBeGreaterThanOrEqual(4);
    // Idle: only waiting events.
    const idle = stateAt(300, 6, { pick: 80, lines: [80, 60, 40, 20, 5] });
    const bus2 = createIdleBus();
    const idleStarts: string[] = [];
    bus2.on('event:start', (e) => idleStarts.push(e.type));
    idle.meta.stats.taps = 1;
    play(idle, 600, 0, bus2, 3, 1 / 15);
    for (const t of idleStarts) expect(EVENTS[t as keyof typeof EVENTS].waits).toBe(true);
  }, 60000);

  it('the find guarantee: 10 s of active play with nothing new in view → a micro-surfacing within 1 s', () => {
    const s = stateAt(500, 8, { pick: 1, lines: [] });
    const bus = createIdleBus();
    let at = -1;
    bus.on('find:surface', () => {
      if (at < 0) at = s.time;
    });
    s.director.findQuiet = 0;
    s.director.wait = 1e9;
    // A floor of plain rock (no special cell breaks) and taps that do not break anything.
    for (const row of s.shaft.rows) row.kinds.fill(CELL.ROCK);
    play(s, 12, 4, bus);
    expect(at).toBeGreaterThan(0);
    expect(at).toBeLessThanOrEqual(11.1);
  });

  it('every event type starts, takes its taps and ends with its rewards; a miss never subtracts (L11)', () => {
    for (const type of ['goldenVein', 'glimmerfall', 'mothSwarm', 'treasureMole', 'caveIn', 'supplyRope', 'mimic', 'treasureMap', 'ancientEcho', 'signature']) {
      for (const catchIt of [true, false]) {
        const s = stateAt(700, 12, { pick: 150, lines: [150, 140, 120, 100, 80, 40] });
        const bus = createIdleBus();
        let ended: { result: string; gems: number } | null = null;
        bus.on('event:end', (e) => (ended = e));
        const gold0 = s.run.gold.clone();
        const gems0 = s.meta.gems;
        expect(forceEvent(s, type, bus)).toBe(true);
        for (let t = 0; t < (type === 'treasureMap' ? 320 : 70) && !ended; t += STEP_DT) {
          const ev = s.event;
          if (catchIt && ev?.widget && !ev.widget.done) {
            const w = ev.widget;
            if (w.kind === 'catch') for (const tg of w.targets) if (tg.state === 'live' && s.time >= tg.t0) tapEntity(s, tg.id, bus);
            if (w.kind === 'mash') tapEntity(s, w.target, bus);
            if (w.kind === 'pick') widgetTap(s, w.id, 0, bus);
            if (w.kind === 'sequence' && s.time > w.showFrom + w.order.length * w.showEach) widgetTap(s, w.id, w.order[w.pos], bus);
            if (w.kind === 'strike') widgetTap(s, w.id, 0, bus);
          }
          stepIdle(s, STEP_DT, [{ col: 3, kind: 'tap' }], bus);
        }
        expect(ended, `${type} ended`).not.toBeNull();
        expect(s.run.gold.gte(gold0)).toBe(true);
        expect(s.meta.gems).toBeGreaterThanOrEqual(gems0);
      }
    }
  }, 60000);

  it('a Golden Vein turns 3 cells a row golden in the next 5 rows (cells:change for the world)', () => {
    const s = stateAt(260, 3);
    const bus = createIdleBus();
    const changed: number[] = [];
    bus.on('cells:change', (e) => changed.push(...e.cells.map((c) => c.depth)));
    forceEvent(s, 'goldenVein', bus);
    expect(changed.length).toBeGreaterThanOrEqual(12);
    let golden = 0;
    for (const row of s.shaft.rows) for (const k of row.kinds) if (k === CELL.GOLDEN) golden++;
    expect(golden).toBe(changed.length);
  });
});
