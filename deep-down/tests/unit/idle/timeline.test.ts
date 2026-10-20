// The ceremony timeline (SPEC §10.8): fixed-time states, skip() from 400 ms reaches the end state, the capture hook
// (seek) holds a fixed frame, tracks land on their end state.
import { describe, expect, it } from 'vitest';
import { Timeline } from '../../../src/game/fx/Timeline';

function make() {
  const fired: number[] = [];
  const track: Array<[number, number]> = [];
  const tl = new Timeline(
    [0, 100, 700, 900, 1300].map((at) => ({ at, run: () => fired.push(at) })),
    1600,
    1300,
    [{ from: 0, to: 160, run: (u, t) => track.push([u, t]) }],
  );
  return { tl, fired, track };
}

describe('Timeline', () => {
  it('fires each step once, in order, at its time', () => {
    const { tl, fired } = make();
    tl.start(1000);
    tl.update(1000);
    expect(fired).toEqual([0]);
    tl.update(1099);
    expect(fired).toEqual([0]);
    tl.update(1100);
    tl.update(1150);
    expect(fired).toEqual([0, 100]);
    tl.update(2000);
    expect(fired).toEqual([0, 100, 700, 900]);
    tl.update(2400);
    expect(fired).toEqual([0, 100, 700, 900, 1300]);
    expect(tl.done).toBe(false);
    tl.update(2600);
    expect(tl.done).toBe(true);
    tl.update(3000);
    expect(fired).toHaveLength(5);
  });

  it('a tap before 400 ms does not skip; from 400 ms it jumps to the end state with every step fired', () => {
    const { tl, fired } = make();
    tl.start(0);
    tl.update(0);
    expect(tl.skip(399)).toBe(false);
    expect(fired).toEqual([0]);
    expect(tl.skip(400)).toBe(true);
    expect(fired).toEqual([0, 100, 700, 900, 1300]);
    expect(tl.skipped).toBe(true);
    // It runs out its tail (1,300 → 1,600) and ends.
    tl.update(400 + 300);
    expect(tl.done).toBe(true);
  });

  it('tracks land exactly on their end state when a frame jumps past them', () => {
    const { tl, track } = make();
    tl.start(0);
    tl.update(0);
    tl.update(80);
    tl.update(1000);
    expect(track[0]).toEqual([0, 0]);
    expect(track[1][0]).toBeCloseTo(0.5, 5);
    expect(track[track.length - 1]).toEqual([1, 160]);
  });

  it('the capture hook holds a fixed frame and releases to run on', () => {
    const { tl, fired } = make();
    tl.seek(750, 5000);
    expect(fired).toEqual([0, 100, 700]);
    expect(tl.frozen).toBe(true);
    // Held: time passes, nothing else fires, it never ends.
    tl.update(99_999);
    expect(fired).toEqual([0, 100, 700]);
    expect(tl.elapsed(99_999)).toBe(750);
    expect(tl.skip(99_999)).toBe(false);
    tl.release(10_000);
    tl.update(10_200);
    expect(fired).toEqual([0, 100, 700, 900]);
    tl.update(20_000);
    expect(tl.done).toBe(true);
  });

  it('finish() reaches the end state from anywhere', () => {
    const { tl, fired } = make();
    tl.finish(0);
    expect(fired).toEqual([0, 100, 700, 900, 1300]);
    expect(tl.done).toBe(true);
  });
});
