import { beforeAll, describe, expect, it } from 'vitest';
import { B, isEmitter } from '../../src/config/blocks';
import { WorldSession } from '../../src/game/WorldSession';

// WorldSession builds Three.js objects but never touches WebGL until rendering, so the
// world-edit, light and prop bookkeeping can be verified in Node.
let session: WorldSession;

beforeAll(async () => {
  session = await WorldSession.create(() => undefined);
}, 60_000);

describe('WorldSession', () => {
  it('round-trips world edits through a save delta', async () => {
    const w = session.world;
    const ledge = session.layout.landmarks.ledge;
    const edits: Array<[number, number, number]> = [];
    for (let i = 0; i < 5; i++) {
      const x = Math.floor(ledge[0]) + i;
      const y = Math.floor(ledge[1]) - 1;
      const z = Math.floor(ledge[2]);
      if (w.isSolid(x, y, z)) {
        session.setBlock(x, y, z, B.AIR);
        edits.push([x, y, z]);
      }
    }
    expect(edits.length).toBeGreaterThan(0);
    const delta = session.worldEdits();
    expect(delta.length).toBe(edits.length * 2);
    await session.reset();
    for (const [x, y, z] of edits) expect(w.isSolid(x, y, z)).toBe(true);
    await session.applySave(delta, []);
    for (const [x, y, z] of edits) expect(w.get(x, y, z)).toBe(B.AIR);
    await session.reset();
  });

  it('ignores corrupt delta entries', async () => {
    await session.applySave([-5, 3, 1e12, 2, 10, 300, 1.5, 2], []);
    expect(session.worldEdits().length).toBe(0);
  });

  it('lets a lamp settle when the block under it is mined, moving its light', async () => {
    await session.reset();
    const lamp = [...session.liveProps.values()].find((p) => p.kind === 'lanternPost' && p.anchor && p.emitters.length)!;
    const [ax, ay, az] = lamp.anchor!;
    const [ex, ey, ez] = lamp.emitters[0];
    expect(isEmitter(session.world.get(ex, ey, ez))).toBe(true);
    // Remove the support and the block below it so the lamp has to drop two blocks.
    session.setBlock(ax, ay - 1, az, B.AIR);
    session.setBlock(ax, ay, az, B.AIR);
    const moved = session.liveProps.get(lamp.id)!;
    expect(moved.anchor![1]).toBeLessThan(ay);
    expect(moved.emitters[0][1]).toBeLessThan(ey);
    expect(isEmitter(session.world.get(...moved.emitters[0]))).toBe(true);
    expect(session.world.get(ex, ey, ez)).toBe(B.AIR);
    await session.reset();
  });

  it('breaks a hanging prop when the voxel it hangs from is mined, and its light goes out', async () => {
    await session.reset();
    const w = session.world;
    // A real hanging prop from the generated layout: anchored above its base, carrying a light.
    const lamp = [...session.liveProps.values()].find((p) => p.anchor && p.anchor[1] > p.y && p.emitters.length > 0);
    expect(lamp, 'the layout has a hanging prop with a light').toBeDefined();
    const id = lamp!.id;
    const [ax, ay, az] = lamp!.anchor!;
    const emitters = lamp!.emitters.map((e) => [...e] as [number, number, number]);
    expect(w.isSolid(ax, ay, az)).toBe(true);
    for (const e of emitters) expect(isEmitter(w.get(...e))).toBe(true);
    const lightAt = ([x, y, z]: [number, number, number]) => {
      const i = w.index(x, y, z) * 4;
      return session.light.data[i] + session.light.data[i + 1] + session.light.data[i + 2];
    };
    const litBefore = lightAt(emitters[0]);
    expect(litBefore).toBeGreaterThan(0);

    // Control: mining a solid neighbour of the anchor (anchoring nothing) leaves the prop hanging.
    const neighbour = ([[1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1], [0, 1, 0]] as const)
      .map(([dx, dy, dz]) => [ax + dx, ay + dy, az + dz] as [number, number, number])
      .find(([x, y, z]) => w.isSolid(x, y, z) && ![...session.liveProps.values()].some((p) => p.anchor && p.anchor[0] === x && p.anchor[1] === y && p.anchor[2] === z));
    expect(neighbour, 'a solid voxel next to the anchor').toBeDefined();
    session.setBlock(...neighbour!, B.AIR);
    expect(session.liveProps.has(id)).toBe(true);
    for (const e of emitters) expect(isEmitter(w.get(...e))).toBe(true);

    // Mining the anchor itself: the prop breaks (it is not moved or dropped), its emitters go.
    session.setBlock(ax, ay, az, B.AIR);
    expect(session.liveProps.has(id)).toBe(false);
    expect(session.removedProps.has(id)).toBe(true);
    for (const e of emitters) expect(isEmitter(w.get(...e))).toBe(false);
    expect(lightAt(emitters[0])).toBeLessThan(litBefore);

    await session.reset();
    expect(session.liveProps.has(id)).toBe(true);
    for (const e of emitters) expect(isEmitter(w.get(...e))).toBe(true);
  });

  it('removes a prop together with its light emitters', async () => {
    await session.reset();
    const fire = [...session.liveProps.values()].find((p) => p.kind === 'campfire')!;
    const [ex, ey, ez] = fire.emitters[0];
    const lit = session.light.data[session.world.index(ex + 1, ey, ez) * 4];
    expect(lit).toBeGreaterThan(100);
    session.removeProp(fire.id);
    expect(session.removedProps.has(fire.id)).toBe(true);
    expect(session.world.get(ex, ey, ez)).toBe(B.AIR);
    const after = session.light.data[session.world.index(ex + 1, ey, ez) * 4];
    expect(after).toBeLessThan(lit);
    await session.reset();
    expect(session.liveProps.has(fire.id)).toBe(true);
    expect(isEmitter(session.world.get(ex, ey, ez))).toBe(true);
  });

  it('restores removed props on reset and re-removes them from a save', async () => {
    const id = [...session.liveProps.keys()].find((k) => k.startsWith('crystalCluster'))!;
    await session.applySave([], [id]);
    expect(session.liveProps.has(id)).toBe(false);
    await session.reset();
    expect(session.liveProps.has(id)).toBe(true);
  });
});
