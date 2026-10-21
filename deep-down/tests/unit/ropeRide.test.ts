import { beforeAll, describe, expect, it } from 'vitest';
import { RIDES } from '../../src/config/balance';
import { createRide, rideDistance, rideDuration, rideEdges, rideEnd, stepRide } from '../../src/game/ropeRide';
import { PlayerController } from '../../src/game/PlayerController';
import { generateWorld } from '../../src/world/gen/generateWorld';
import type { WorldLayout } from '../../src/world/gen/types';

let layout: WorldLayout;

beforeAll(() => {
  layout = generateWorld();
});

describe('rides (the hoist, the rift rope)', () => {
  it('moves continuously along the path, its arc length never running backwards', () => {
    for (const link of layout.features!.links)
      for (const dir of ['up', 'down'] as const) {
        const r = createRide(link, dir);
        let prev = { ...stepRide(r, 0) };
        let prevS = 0;
        let maxStep = 0;
        for (let k = 0; k < 2000 && !prev.done; k++) {
          const cur = { ...stepRide(r, 1 / 60) };
          const s = rideDistance(r, r.t);
          expect(s, `${link.id} ${dir} arc`).toBeGreaterThanOrEqual(prevS - 1e-9);
          maxStep = Math.max(maxStep, Math.hypot(cur.x - prev.x, cur.y - prev.y, cur.z - prev.z));
          prev = cur;
          prevS = s;
        }
        expect(prev.done).toBe(true);
        // Never faster than the cruise speed (no jumps between frames).
        expect(maxStep, `${link.id} ${dir} step`).toBeLessThanOrEqual(r.speed / 60 + 1e-6);
        const end = rideEnd(r);
        expect(Math.hypot(prev.x - end[0], prev.y - end[1], prev.z - end[2])).toBeLessThan(1e-6);
      }
  });

  it('takes the analytic time (within 5 %), never more than 7 s', () => {
    for (const link of layout.features!.links)
      for (const dir of ['up', 'down'] as const) {
        const r = createRide(link, dir);
        let t = 0;
        while (!stepRide(r, 1 / 60).done && t < 30) t += 1 / 60;
        t += 1 / 60;
        const analytic = rideDuration(r.length, r.speed);
        expect(Math.abs(t - analytic) / analytic, `${link.id} ${dir}`).toBeLessThan(0.05);
        expect(t, `${link.id} ${dir} seconds`).toBeLessThanOrEqual(7);
      }
  });

  it('eases in and out: slow at both ends, at cruise speed in the middle', () => {
    const r = createRide(layout.features!.links.find((l) => l.id === 'hoist')!, 'up');
    const v = (t: number) => (rideDistance(r, t + 0.01) - rideDistance(r, t)) / 0.01;
    expect(v(0.02)).toBeLessThan(r.speed * 0.25);
    expect(v(r.duration / 2)).toBeCloseTo(r.speed, 3);
    expect(v(r.duration - 0.03)).toBeLessThan(r.speed * 0.25);
  });

  it('ends standing on the end cell: no landing, no fall damage, over 30 frames', () => {
    for (const link of layout.features!.links)
      for (const dir of ['up', 'down'] as const) {
        const end = rideEnd(createRide(link, dir));
        const p = new PlayerController(layout.world);
        p.teleport(end[0], end[1], end[2]);
        p.grounded = true;
        for (let k = 0; k < 30; k++) {
          const ev = p.update(1 / 60, 0, 0, false, 0, false);
          expect(ev.landedSpeed, `${link.id} ${dir} frame ${k}`).toBe(0);
        }
        expect(Math.abs(p.y - end[1])).toBeLessThan(0.02);
        expect(p.grounded).toBe(true);
      }
  });

  it('becomes walking-field edges: the rope both ways, the hoist up until released', () => {
    const links = layout.features!.links;
    const chained = rideEdges(links, false, RIDES.stepsPerSecond);
    const released = rideEdges(links, true, RIDES.stepsPerSecond);
    // Every ride both ways once released; a chained one (the hoist) not down until then. Round 2's
    // world adds ropes and shafts, so the counts follow the layout's links.
    expect(released.length).toBe(2 * links.length);
    expect(chained.length).toBe(released.length - links.filter((l) => l.lock).length);
    expect(links.some((l) => l.id === 'hoist' && l.lock)).toBe(true);
    const hoist = links.find((l) => l.id === 'hoist')!;
    const up = chained.find((e) => e.to[1] === Math.floor(hoist.top[1]))!;
    expect(up.from).toEqual([Math.floor(hoist.bottom[0]), hoist.bottom[1], Math.floor(hoist.bottom[2])]);
    // A ride's cost is its seconds in walking steps.
    expect(up.cost).toBeCloseTo(createRide(hoist, 'up').duration * RIDES.stepsPerSecond, 6);
  });
});
