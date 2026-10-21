import { describe, expect, it } from 'vitest';
import { Records, normalizeRecords, normalizeTrip } from '../../src/gameplay/Records';

describe('Records and the trip tracker', () => {
  it('tracks one expedition and reports it', () => {
    const r = new Records();
    expect(r.start(10, 49)).toBe(1);
    r.depth(58.4);
    r.depth(55);
    r.picked('stone', 12);
    r.picked('copperOre', 3);
    r.picked('stone', 4);
    r.picked('runeDescent', 1);
    r.mined();
    r.mined();
    r.damaged(18);
    r.discovered('crystals');
    r.discovered('crystals');
    const rep = r.end({ outcome: 'returned', now: 250, banked: { stone: 16, copperOre: 3 }, fuelLeft: 61 })!;
    expect(rep).toMatchObject({
      n: 1,
      outcome: 'returned',
      duration: 240,
      deepest: 58,
      newBest: true,
      previousBest: 0,
      mined: 2,
      found: { stone: 16, copperOre: 3 },
      bankedTotal: 19,
      cached: null,
      cacheDepth: null,
      damage: 18,
      fuelLeft: 61,
      discoveries: ['crystals'],
      runes: ['runeDescent'],
      show: true,
    });
    expect(rep.records).toEqual(['deepest', 'bestStreak', 'biggestHaul']);
    expect(r.records).toMatchObject({ deepest: 58, biggestHaul: 19, expeditions: 1, blackouts: 0, bestStreak: 1, streak: 1 });
    expect(r.trip).toBeNull();
    expect(r.report).toEqual(rep);
    r.dismissReport();
    expect(r.report).toBeNull();
  });

  it('records only go up; a black-out resets the streak but never the best', () => {
    const r = new Records();
    for (let i = 0; i < 3; i++) {
      r.start(i * 100, 49);
      r.depth(70);
      r.end({ outcome: 'returned', now: i * 100 + 60, banked: { stone: 5 }, fuelLeft: 10 });
    }
    expect(r.records).toMatchObject({ bestStreak: 3, streak: 3, biggestHaul: 5, deepest: 70, expeditions: 3 });
    r.start(400, 49);
    r.depth(64);
    const black = r.end({ outcome: 'blackout', now: 460, cached: { stone: 8 }, cacheDepth: 64, lostCount: 2, fuelLeft: 0 })!;
    expect(black).toMatchObject({ outcome: 'blackout', newBest: false, cached: { stone: 8 }, cacheDepth: 64, lostCount: 2, records: [] });
    expect(r.records).toMatchObject({ bestStreak: 3, streak: 0, blackouts: 1, deepest: 70, biggestHaul: 5, expeditions: 4 });
  });

  it('announces depth records in 10 m steps, beyond the old best only', () => {
    const r = new Records({ deepest: 58 });
    r.start(0, 49);
    const marks: number[] = [];
    for (let d = 49; d <= 96; d += 0.5) {
      const m = r.depth(d);
      if (m) marks.push(m);
    }
    expect(marks).toEqual([60, 70, 80, 90]);
    expect(r.records.deepest).toBe(96);
    expect(r.newBest).toBe(true);
    // Going back up and down again announces nothing new.
    expect(r.depth(91)).toBe(0);
    expect(r.depth(96)).toBe(0);
  });

  it('a trip that banked nothing, found nothing and was short has no report screen', () => {
    const r = new Records();
    r.start(0, 49);
    expect(r.end({ outcome: 'returned', now: 20, fuelLeft: 280 })!.show).toBe(false);
    r.start(30, 49);
    expect(r.end({ outcome: 'returned', now: 80, fuelLeft: 250 })!.show).toBe(true); // >= 45 s
  });

  it('a trip in progress survives a save, and a running trip is not restarted', () => {
    const r = new Records();
    r.start(5, 49);
    r.picked('copperOre', 2);
    const json = JSON.parse(JSON.stringify(r.toJSON()));
    const back = new Records(json.records, json.trip);
    expect(back.trip).toMatchObject({ n: 1, t0: 5, found: { copperOre: 2 } });
    expect(back.start(99, 49)).toBe(1);
    expect(back.trip!.t0).toBe(5);
  });

  it('a reload mid-trip keeps the NEW BEST the trip has already earned', () => {
    const r = new Records();
    r.start(0, 49);
    r.depth(60);
    r.end({ outcome: 'returned', now: 100, fuelLeft: 200 });
    r.start(120, 49);
    r.depth(90); // raises the live record to 90 during the trip
    expect(r.newBest).toBe(true);
    const json = JSON.parse(JSON.stringify(r.toJSON()));
    expect(json.records.deepest).toBe(90);
    const back = new Records(json.records, json.trip);
    expect(back.newBest).toBe(true);
    const rep = back.end({ outcome: 'returned', now: 300, fuelLeft: 100 })!;
    expect(rep).toMatchObject({ newBest: true, previousBest: 60 });
    expect(rep.records).toContain('deepest');
  });

  it('a saved trip from before best0 existed is not a false NEW BEST', () => {
    const back = new Records({ deepest: 90, biggestHaul: 0, expeditions: 1, blackouts: 0, streak: 1, bestStreak: 1 } as never, { n: 2, t0: 0, deepest: 70, found: {}, mined: 0, damage: 0, discoveries: [], runes: [] });
    expect(back.newBest).toBe(false);
    expect(normalizeTrip({ n: 2, deepest: 70 })!.best0).toBeUndefined();
  });

  it('normalizes damaged data', () => {
    expect(normalizeRecords({ deepest: -3, biggestHaul: 'x', expeditions: 2.7 })).toMatchObject({ deepest: 0, biggestHaul: 0, expeditions: 2 });
    expect(normalizeTrip({ n: 0 })).toBeNull();
    expect(normalizeTrip(null)).toBeNull();
    expect(normalizeTrip({ n: 2, found: { stone: 3, fooOre: 4 }, discoveries: ['a', 3] })).toMatchObject({ n: 2, found: { stone: 3 }, discoveries: ['a'] });
  });
});
