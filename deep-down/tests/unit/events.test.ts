import { describe, expect, it } from 'vitest';
import { EVENTS } from '../../src/config/events';
import { EVENT_KINDS, EventSchedule, type Placer } from '../../src/game/events/schedule';
import type { EventKind, GameEvent } from '../../src/game/events/types';

/**
 * The events director's clock (round 2, ROUND2 §0.7): something every 2–4 minutes of exploration,
 * one at a time, never at the camp, the clock stopped while busy; kinds drawn by MOBS stay off until
 * MOBS handles them; a kind that cannot be placed is skipped.
 */
const anywhere: Placer = () => ({ anchor: [0, 0, 0], radius: 2 });

/** Run `seconds` of play at 30 fps; `exploring(t)` says whether the explorer is out exploring. */
function simulate(s: EventSchedule, seconds: number, exploring: (t: number) => boolean, place: Placer = anywhere, depth = 120) {
  const starts: GameEvent[] = [];
  let overlap = 0;
  let startedAway = 0;
  for (let k = 0; k < seconds * 30; k++) {
    const tt = k / 30;
    const ex = exploring(tt);
    const was = s.current;
    const ev = s.step(1 / 30, ex, depth, place);
    if (ev) {
      if (was && was !== ev && s.current === ev && was.end > s.clock) overlap++;
      if (!ex) startedAway++;
      starts.push(ev);
    }
  }
  return { starts, overlap, startedAway };
}

describe('the events director schedule', () => {
  it('starts something every 2–4 minutes of exploration, one at a time', () => {
    const s = new EventSchedule(7);
    const { starts, overlap } = simulate(s, 60 * 60, () => true);
    expect(overlap).toBe(0);
    expect(starts[0].start).toBeCloseTo(EVENTS.firstAfter, 0);
    for (let k = 1; k < starts.length; k++) {
      const prev = starts[k - 1];
      // The gap runs from the end of the last one.
      const gap = starts[k].start - prev.end;
      expect(gap, `gap ${k}`).toBeGreaterThanOrEqual(EVENTS.gapMin - 0.05);
      expect(gap, `gap ${k}`).toBeLessThanOrEqual(EVENTS.gapMax + 0.05);
      expect(starts[k].start, 'no overlap').toBeGreaterThanOrEqual(prev.end - 1e-6);
      expect(starts[k].kind, 'never the same kind twice in a row').not.toBe(prev.kind);
    }
    // An hour of exploring: 12 to 24 events (with their own durations between the gaps).
    expect(starts.length).toBeGreaterThanOrEqual(12);
    expect(starts.length).toBeLessThanOrEqual(26);
    // Variety: at least five different kinds in an hour.
    expect(new Set(starts.map((e) => e.kind)).size).toBeGreaterThanOrEqual(5);
  });

  it('stops the clock at camp and while busy: nothing starts there, and the time there does not count', () => {
    const s = new EventSchedule(3);
    // Ten minutes out, ten at camp, ten out again.
    const { starts, startedAway } = simulate(s, 30 * 60, (tt) => tt < 600 || tt >= 1200);
    expect(startedAway).toBe(0);
    for (const e of starts) expect(e.start <= 600 + 1e-6 || e.start >= 600, e.id).toBe(true);
    // The clock is exploration time: 20 minutes of it.
    expect(s.clock).toBeCloseTo(1200, 0);
  });

  it('leaves the kinds MOBS draws off until MOBS handles them, and skips what cannot be placed here', () => {
    const s = new EventSchedule(11);
    const seen = new Set<EventKind>();
    const onlySome: Placer = (k) => (k === 'tremor' || k === 'bloom' || k === 'migration' ? { anchor: [0, 0, 0], radius: 2 } : null);
    for (const e of simulate(s, 3 * 60 * 60, () => true, onlySome).starts) seen.add(e.kind);
    expect([...seen].sort()).toEqual(['bloom', 'tremor']);
    s.handled.add('migration');
    for (const e of simulate(s, 3 * 60 * 60, () => true, onlySome).starts) seen.add(e.kind);
    expect(seen.has('migration')).toBe(true);
    // Nothing placeable: it looks again a few seconds later, and never starts.
    const none = new EventSchedule(5);
    expect(simulate(none, 15 * 60, () => true, () => null).starts.length).toBe(0);
    expect(none.untilNext).toBeLessThanOrEqual(EVENTS.retry);
  });

  it('keeps the deeper kinds for the depths', () => {
    const s = new EventSchedule(13);
    const shallow = simulate(s, 2 * 60 * 60, () => true, anywhere, 10).starts;
    for (const e of shallow) expect(EVENTS.minDepth[e.kind], e.kind).toBeLessThanOrEqual(10);
    expect(EVENT_KINDS.length).toBe(8);
  });

  it('can end an event early (the player lit the brazier) and then waits a full gap', () => {
    const s = new EventSchedule(17);
    const ev = s.start('gust', { anchor: [0, 0, 0], radius: 4 });
    s.step(5, true, 100, anywhere);
    expect(s.current).toBe(ev);
    expect(s.end()).toBe(ev);
    expect(s.current).toBeNull();
    expect(s.untilNext).toBeGreaterThanOrEqual(EVENTS.gapMin);
    expect(s.untilNext).toBeLessThanOrEqual(EVENTS.gapMax);
  });
});
