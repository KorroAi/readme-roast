import { describe, expect, it } from 'vitest';
import { B, SOLID } from '../../src/config/blocks';
import { WorldFeatures } from '../../src/game/WorldFeatures';
import { WorldSession } from '../../src/game/WorldSession';
import { encodeWorldEdits } from '../../src/save/worldDelta';
import { generateWorld } from '../../src/world/gen/generateWorld';

// A glimmer bloom whose floor was mined, saved and reloaded must sit on the rock with one light,
// and leave no light behind once it is mined (review finding, wave 2). Real WorldSession and
// WorldFeatures methods on a session with no renderer.
describe('glimmer bloom after its floor is mined', () => {
  it('settles on reload: one light, a solid anchor, nothing left after mining it', async () => {
    const layout = generateWorld();
    const w = layout.world;
    const generated = w.blocks.slice();
    const noop = () => {};
    const S = Object.create(WorldSession.prototype) as WorldSession & Record<string, unknown>;
    Object.assign(S, {
      layout,
      generated,
      liveProps: new Map(),
      removedProps: new Set<string>(),
      props: { add: noop, remove: noop, flash: noop, setHighlight: noop, dispose: noop },
      light: { onBlockChanged: () => ({ x0: 0, y0: 0, z0: 0, x1: 0, y1: 0, z1: 0 }), computeAll: noop },
      rig: { markLightDirty: noop, lightTex: {} },
      chunks: { buildAll: async () => {} },
    });
    Object.defineProperty(S, 'world', { get: () => layout.world });
    const game = { session: S, progression: { day: 0 }, bus: { on: noop, emit: noop }, journal: { has: () => false } };
    const F = Object.create(WorldFeatures.prototype) as { placeBloom(e: number, r: ReadonlySet<string>): void } & Record<string, unknown>;
    Object.assign(F, { game, layout: layout.features, bloomId: null });
    const extraCyan = () => {
      let n = 0;
      for (let i = 0; i < w.blocks.length; i++) if (w.blocks[i] === B.LIGHT_CYAN && generated[i] !== B.LIGHT_CYAN) n++;
      return n;
    };

    (S as unknown as { resetProps(): void }).resetProps();
    F.placeBloom(0, new Set());
    const first = S.liveProps.get('bloom_e0')!;
    expect(extraCyan()).toBe(1);
    const [ax, ay, az] = first.anchor!;
    S.setBlock(ax, ay, az, B.AIR); // mine the floor under it: it drops one cell
    const removed = [...S.removedProps];
    await S.restore(encodeWorldEdits(generated, w.blocks), removed);
    F.placeBloom(0, new Set(removed));
    const after = S.liveProps.get('bloom_e0')!;
    expect(SOLID[w.get(...after.anchor!)]).toBe(1);
    expect(extraCyan()).toBe(1);
    S.removeProp('bloom_e0');
    expect(extraCyan()).toBe(0);
  });
});
