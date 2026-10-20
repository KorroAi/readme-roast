import { describe, expect, it } from 'vitest';
import { DigController } from '../../../src/game/DigController';
import { createIdleBus } from '../../../src/idle/bus';
import { createIdle } from '../../../src/idle/model/step';
import type { DescentScene, PickedEntity } from '../../../src/render/descent/DescentScene';
import type { TapInput } from '../../../src/ui/idle/TapSurface';

// DigController (SPEC §3.1): entity first inside the 4 m reach band (CRITIQUE MUST 8), then the column under the
// thumb with the vertical position ignored; one 8/s cap over every pointer (MUST 1), over-cap hits only flash; the
// scene's crystal clusters take their taps and become the model's `crystal:<n>`; other props never swallow a dig.

const STRIPS = { left: 41, right: 349, floorY: 400 };

function fakeScene(props: PickedEntity[] = []) {
  const log: string[] = [];
  const scene = {
    columns: () => STRIPS,
    pickEntity: (x: number, y: number) => props.find((p) => Math.hypot(p.x - x, p.y - y) <= p.radius) ?? null,
    cellFx: (row: number, col: number) => log.push(`fx ${row},${col}`),
    burst: (kind: string) => log.push(`burst ${kind}`),
    removeEntity: (id: string) => log.push(`remove ${id}`),
    applyBreaks: () => undefined,
  };
  return { scene: scene as unknown as DescentScene, log };
}

const tap = (x: number, y: number, t: number): TapInput => ({ x, y, id: 1, t, kind: 'tap' });

describe('DigController', () => {
  it('maps a tap anywhere in a column (any height) to that column', () => {
    const s = createIdle(7, 0);
    const { scene } = fakeScene();
    const d = new DigController(createIdleBus(), scene, () => s);
    d.begin();
    const cols = [60, 105, 150, 195, 240, 285, 330].map((x, i) => d.input(tap(x, i % 2 ? 200 : 700, i * 200), i, i * 200));
    expect(cols).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(d.taps.map((t) => t.col)).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  it('counts at most 8 hits a second; over the cap a hit only flashes', () => {
    const s = createIdle(7, 0);
    const { scene, log } = fakeScene();
    const d = new DigController(createIdleBus(), scene, () => s);
    d.begin();
    for (let i = 0; i < 12; i++) d.input(tap(195, 420, i * 50), 0, i * 50);
    expect(d.taps.length).toBe(8);
    expect(d.capped).toBe(4);
    expect(log.filter((l) => l.startsWith('fx')).length).toBe(4);
    expect(d.records.filter((r) => !r.counted).length).toBe(4);
  });

  it('takes entities first only inside the reach band', () => {
    const s = createIdle(7, 0);
    const { scene } = fakeScene();
    const d = new DigController(createIdleBus(), scene, () => s);
    d.entities = () => [{ id: 'chest:1', x: 195, y: 430, r: 24 }, { id: 'chest:2', x: 195, y: 400 + 5 * 44, r: 24 }];
    d.begin();
    expect(d.input(tap(198, 432, 0), 0, 0)).toBe(-1);
    expect(d.taps.at(-1)).toMatchObject({ col: -1, entity: 'chest:1' });
    // 5 m below the floor is out of reach: the tap digs its column instead.
    expect(d.input(tap(195, 400 + 5 * 44, 200), 0, 200)).toBe(3);
  });

  it('turns a crystal cluster into the model’s crystal:<n> on its last tap, and never lets other props swallow a dig', () => {
    const s = createIdle(7, 0);
    const crystal: PickedEntity = { id: 's1:4', kind: 'crystal', x: 300, y: 420, radius: 30, row: 2, taps: 2 };
    const crate: PickedEntity = { id: 's1:5', kind: 'crate', x: 100, y: 420, radius: 30, row: 2, taps: 1 };
    const { scene, log } = fakeScene([crystal, crate]);
    const d = new DigController(createIdleBus(), scene, () => s);
    d.begin();
    expect(d.input(tap(300, 420, 0), 0, 0)).toBe(-1);
    expect(d.taps.length).toBe(0);
    expect(log).toContain('burst gem');
    d.input(tap(300, 420, 200), 0, 200);
    expect(d.taps.at(-1)).toMatchObject({ col: -1, entity: 'crystal:0' });
    expect(log).toContain('remove s1:4');
    // The crate has no use in W1: the tap digs the column under it.
    expect(d.input(tap(100, 420, 400), 0, 400)).toBe(1);
    expect(d.taps.at(-1)).toMatchObject({ col: 1 });
  });
});
