import { beforeAll, describe, expect, it } from 'vitest';
import { B, EVENT_LIGHT, SOLID } from '../../src/config/blocks';
import { EVENTS } from '../../src/config/events';
import { EventBus, type GameEvents } from '../../src/core/events';
import { Rng } from '../../src/core/rng';
import { EventDirector } from '../../src/game/events/EventDirector';
import type { EventContext, EventKind } from '../../src/game/events/types';
import type { Game } from '../../src/game/Game';
import { Health } from '../../src/gameplay/Health';
import { Lantern } from '../../src/gameplay/Lantern';
import { standable } from '../../src/world/analysis/reachability';
import { generateWorld } from '../../src/world/gen/generateWorld';
import type { PropSpec, WorldLayout } from '../../src/world/gen/types';

/**
 * The events director's world side (round 2) on the real generated world, with a stand-in for the
 * game: each kind can be placed where it makes sense and does what it says, its passing lights go
 * when it ends, and nothing it leaves behind can wall the explorer in.
 */
let layout: WorldLayout;

beforeAll(() => {
  layout = generateWorld();
}, 120_000);

function fakeGame() {
  const world = layout.world;
  const generated = world.blocks.slice();
  const bus = new EventBus<GameEvents>();
  const liveProps = new Map<string, PropSpec>(layout.props.map((p) => [p.id, p]));
  const toasts: string[] = [];
  const g = {
    session: { world, layout, liveProps, setBlock: (x: number, y: number, z: number, id: number) => world.set(x, y, z, id) },
    bus,
    particles: { dust() {}, sparkle() {} },
    debris: { burst() {} },
    drops: { spawn() {} },
    ui: { toast: (s: string) => toasts.push(s) },
    rng: new Rng(4),
    lanternFuel: new Lantern(300, 200),
    health: new Health(100),
  };
  const restore = () => world.blocks.set(generated);
  return { g, game: g as unknown as Game, toasts, restore };
}

const ctxAt = (p: readonly number[], o: Partial<EventContext> = {}): EventContext => ({ x: p[0], y: p[1], z: p[2], inCamp: false, busy: false, lit: true, depth: 150 - p[1], ...o });

/** A standable feet position near a landmark. */
function standNear(p: readonly number[]): [number, number, number] {
  const w = layout.world;
  for (let r = 0; r <= 4; r++)
    for (let dy = -3; dy <= 3; dy++)
      for (let dz = -r; dz <= r; dz++)
        for (let dx = -r; dx <= r; dx++) {
          const x = Math.floor(p[0]) + dx;
          const y = Math.floor(p[1]) + dy;
          const z = Math.floor(p[2]) + dz;
          if (standable(w, x, y, z)) return [x + 0.5, y, z + 0.5];
        }
  throw new Error(`no stand near ${p.join(',')}`);
}

describe('the world events in the generated world', () => {
  it('a tremor opens a hidden pocket behind loose stone, with a find in its back wall', () => {
    const { game, restore } = fakeGame();
    const d = new EventDirector(game);
    const at = standNear(layout.landmarks.galleries);
    const pockets: Array<GameEvents['world:pocket']> = [];
    game.bus.on('world:pocket', (e) => pockets.push(e));
    const ev = d.force('tremor', ctxAt(at));
    expect(ev?.kind).toBe('tremor');
    expect(pockets.length).toBe(1);
    const w = layout.world;
    const [x, y, z] = [Math.floor(ev!.anchor[0]), Math.floor(ev!.anchor[1]), Math.floor(ev!.anchor[2])];
    expect(w.get(x, y, z)).toBe(B.RUBBLE);
    expect(w.get(x, y + 1, z)).toBe(B.RUBBLE);
    const ix = Math.sign(Math.floor(ev!.target![0]) - x);
    const iz = Math.sign(Math.floor(ev!.target![2]) - z);
    expect(SOLID[w.get(x + ix, y, z + iz)]).toBe(0);
    expect([B.IRON_ORE, B.COPPER_ORE, B.GEM_ORE]).toContain(w.get(x + ix * 3, y, z + iz * 3));
    restore();
  });

  it('a bloom lights the crystals nearby for its time, then its light goes', () => {
    const { game, restore } = fakeGame();
    const d = new EventDirector(game);
    const cluster = layout.props.find((p) => p.kind === 'crystalCluster' && p.y > 80)!;
    const at = standNear([cluster.x + 2, cluster.y, cluster.z]);
    const ev = d.force('bloom', ctxAt(at));
    expect(ev?.kind).toBe('bloom');
    const lit = () => layout.world.blocks.reduce((n, id) => n + (EVENT_LIGHT[id] ? 1 : 0), 0);
    expect(lit()).toBeGreaterThan(0);
    for (let k = 0; k < (EVENTS.duration.bloom + 1) * 10; k++) d.update(0.1, ctxAt(at));
    expect(d.current).toBeNull();
    expect(lit()).toBe(0);
    restore();
  });

  it('an echo light leads along the floor to a cracked wall, and ends there', () => {
    const { game, toasts, restore } = fakeGame();
    const d = new EventDirector(game);
    const at = standNear([layout.landmarks.shrineDoor[0] + 12, layout.landmarks.shrineDoor[1], layout.landmarks.shrineDoor[2]]);
    const ev = d.force('echo', ctxAt(at));
    expect(ev?.kind).toBe('echo');
    const end = ev!.target!;
    const w = layout.world;
    let crack = false;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) for (const dy of [0, 1]) if (w.get(Math.floor(end[0]) + dx, end[1] + dy, Math.floor(end[2]) + dz) === B.CRUMBLING_BRICK) crack = true;
    expect(crack).toBe(true);
    d.update(0.5, ctxAt(at));
    expect(d.live.light).toBeDefined();
    // Walk to the end: the light fades, the secret is found.
    d.update(0.1, ctxAt(end));
    expect(d.current).toBeNull();
    expect(toasts.at(-1)).toMatch(/echo light fades/);
    expect(layout.world.blocks.some((id) => EVENT_LIGHT[id])).toBe(false);
    restore();
  });

  it('a gust halves the flame until the explorer stands by a lamp', () => {
    const { g, game, restore } = fakeGame();
    const d = new EventDirector(game);
    const lamp = layout.props.find((p) => p.kind === 'lanternPost' && p.y < 50 && p.y > 40)!;
    const at = standNear([lamp.x + 8, lamp.y, lamp.z]);
    const ev = d.force('gust', ctxAt(at));
    expect(ev?.kind).toBe('gust');
    expect(g.lanternFuel.dim).toBe(EVENTS.gustDim);
    d.update(0.1, ctxAt([lamp.x + 0.8, lamp.y, lamp.z]));
    expect(d.current).toBeNull();
    expect(g.lanternFuel.dim).toBe(1);
    restore();
  });

  it('a spore geyser feeds the lantern of whoever stands in it', () => {
    const { g, game, restore } = fakeGame();
    const d = new EventDirector(game);
    const at = standNear(layout.landmarks.vault);
    const ev = d.force('geyser', ctxAt(at));
    expect(ev?.kind).toBe('geyser');
    const before = g.lanternFuel.fuel;
    for (let k = 0; k < 20; k++) d.update(0.1, ctxAt(ev!.anchor));
    expect(g.lanternFuel.fuel).toBeGreaterThan(before - 3);
    expect(g.lanternFuel.fuel - (before - 2)).toBeGreaterThanOrEqual(EVENTS.geyserFuel - 0.01);
    restore();
  });

  it('falling rocks warn first, knock gently (never lethally), and leave loose stone that walls nobody in', () => {
    const { g, game, restore } = fakeGame();
    const d = new EventDirector(game);
    const at = standNear(layout.landmarks.galleries);
    const ev = d.force('rockfall', ctxAt(at));
    expect(ev?.kind).toBe('rockfall');
    const w = layout.world;
    const count = () => w.blocks.reduce((n, id) => n + (id === B.RUBBLE ? 1 : 0), 0);
    const heaps = count();
    // During the warning nothing falls.
    for (let k = 0; k < Math.floor(EVENTS.rockWarn * 10) - 1; k++) d.update(0.1, ctxAt(at));
    expect(count()).toBe(heaps);
    g.health = new Health(5);
    for (let k = 0; k < 6; k++) d.update(0.1, ctxAt(at));
    expect(count()).toBeGreaterThan(heaps);
    expect(g.health.current).toBe(1);
    // The explorer's own cell stays open, and every new stone is a step (two open cells over it).
    expect(standable(w, Math.floor(at[0]), at[1], Math.floor(at[2]))).toBe(true);
    for (let i = 0; i < w.blocks.length; i++) {
      if (w.blocks[i] !== B.RUBBLE) continue;
      const x = i % w.sx;
      const y = Math.floor(i / w.sx) % w.sy;
      const z = Math.floor(i / (w.sx * w.sy));
      if (Math.hypot(x + 0.5 - at[0], z + 0.5 - at[2]) > 2.5 || Math.abs(y - at[1]) > 2) continue;
      expect(SOLID[w.get(x, y + 1, z)] === 0 || w.get(x, y + 1, z) === B.RUBBLE, `${x},${y},${z}`).toBe(true);
    }
    restore();
  });

  it('never starts at camp, and the kinds MOBS draws wait for MOBS', () => {
    const { game, restore } = fakeGame();
    const d = new EventDirector(game);
    const camp = [layout.spawn.x, layout.spawn.y, layout.spawn.z];
    for (let k = 0; k < 20 * 60 * 10; k++) d.update(0.1, ctxAt(camp, { inCamp: true }));
    expect(d.current).toBeNull();
    for (const kind of ['tremor', 'geyser', 'rockfall'] as EventKind[]) expect(d.force(kind, ctxAt(camp)), kind).toBeNull();
    expect(d.schedule.allowed('migration', 100)).toBe(false);
    d.handle('migration');
    expect(d.schedule.allowed('migration', 100)).toBe(true);
    restore();
  });
});
