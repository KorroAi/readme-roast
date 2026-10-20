import { describe, expect, it } from 'vitest';
import { createIdleBus } from '../../../src/idle/bus';
import { createIdle } from '../../../src/idle/model/step';
import { WIDGET, close, expire, gradeMult, mashTap, mashTier, openMash, openSequence, openStrike, sequenceShowing, sequenceTap, strikeGrade, strikePos, strikeStop } from '../../../src/idle/model/widgets';

describe('the five widgets (SPEC §7.3)', () => {
  it('Strike: the needle sweeps there and back in 0.9 s; perfect 8 % (×5, ×10 for a finisher), good 25 % (×2), else ×1', () => {
    const s = createIdle(1, 0);
    const w = openStrike(s, 'test', 10, 3, 0.5);
    expect(strikePos(w, s.time)).toBeCloseTo(0, 6);
    expect(strikePos(w, s.time + WIDGET.strikePeriod)).toBeCloseTo(1, 6);
    expect(strikePos(w, s.time + 2 * WIDGET.strikePeriod)).toBeCloseTo(0, 6);
    expect(strikeGrade(w, 0.5)).toBe('perfect');
    expect(strikeGrade(w, 0.5 + 0.039)).toBe('perfect');
    expect(strikeGrade(w, 0.5 + 0.05)).toBe('good');
    expect(strikeGrade(w, 0.5 - 0.12)).toBe('good');
    expect(strikeGrade(w, 0.5 + 0.13)).toBe('miss');
    expect(gradeMult('perfect')).toBe(5);
    expect(gradeMult('perfect', true)).toBe(10);
    expect(gradeMult('good')).toBe(2);
    expect(gradeMult('miss')).toBe(1);
    // Three needles, then it closes.
    for (let i = 0; i < 3; i++) {
      s.time += 0.45;
      strikeStop(s, w);
    }
    expect(w.done).toBe(true);
    expect(w.grades.length).toBe(3);
  });

  it('Sequence: marks show 0.5 s each, input waits for the show, a wrong tap restarts once, a second ends it', () => {
    const s = createIdle(2, 0);
    const bus = createIdleBus();
    const w = openSequence(s, 'test', 6, 6, [2, 4, 1], bus);
    expect(sequenceShowing(w, s.time)).toBe(true);
    expect(sequenceTap(s, w, 2, bus)).toBe('wait');
    s.time = w.showFrom + 3 * w.showEach + 0.01;
    expect(sequenceTap(s, w, 2, bus)).toBe('ok');
    expect(sequenceTap(s, w, 5, bus)).toBe('wrong');
    expect(w.pos).toBe(0);
    expect(sequenceShowing(w, s.time)).toBe(true);
    s.time = w.showFrom + 3 * w.showEach + 0.01;
    expect(sequenceTap(s, w, 2, bus)).toBe('ok');
    expect(sequenceTap(s, w, 4, bus)).toBe('ok');
    expect(sequenceTap(s, w, 3, bus)).toBe('done');
    expect(w.result).toBe('partial');
    const w2 = openSequence(s, 'test', 6, 6, [0, 1, 2]);
    s.time = w2.showFrom + 3 * w2.showEach + 0.01;
    for (const m of [0, 1, 2]) sequenceTap(s, w2, m);
    expect(w2.result).toBe('done');
  });

  it('Mash: tiers at 15 / 25 / 40 taps; the window closing keeps the tier reached', () => {
    const s = createIdle(3, 0);
    const w = openMash(s, 'test', 5, 'event:1:0');
    for (let i = 0; i < 26; i++) mashTap(w);
    expect(mashTier(w)).toBe(2);
    s.time += 5.01;
    expect(expire(s, w)).toBe(true);
    expect(w.result).toBe('done');
    const empty = openMash(s, 'test', 5, 'event:2:0');
    s.time += 5.01;
    expire(s, empty);
    expect(empty.result).toBe('missed');
  });

  it('every widget is skippable and closes once', () => {
    const s = createIdle(4, 0);
    const bus = createIdleBus();
    const ends: string[] = [];
    bus.on('widget:end', (e) => ends.push(e.result));
    const w = openStrike(s, 'test', 10, 1, 0.5, bus);
    close(w, 'skipped', bus);
    close(w, 'done', bus);
    expect(ends).toEqual(['skipped']);
  });
});
