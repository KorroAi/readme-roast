import { beforeAll, describe, expect, it } from 'vitest';
import { B, isEmitter, SOLID } from '../../src/config/blocks';
import { generateWorld } from '../../src/world/gen/generateWorld';
import { minableCount, nearReachable, reachableCells } from '../../src/world/analysis/reachability';
import type { WorldLayout } from '../../src/world/gen/types';
import { hash32 } from '../../src/core/math';

let layout: WorldLayout;
let seen: Uint8Array;

function digest(a: Uint8Array): number {
  let h = 0;
  for (let i = 0; i < a.length; i += 7) h = hash32(h ^ (a[i] + i));
  return h;
}

beforeAll(() => {
  layout = generateWorld();
  const s = layout.spawn;
  seen = reachableCells(layout.world, Math.floor(s.x), Math.floor(s.y) + 1, Math.floor(s.z));
});

describe('world generation', () => {
  it('is deterministic for the same seed', () => {
    const again = generateWorld();
    expect(digest(again.world.blocks)).toBe(digest(layout.world.blocks));
    expect(again.props.map((p) => p.id)).toEqual(layout.props.map((p) => p.id));
  });

  it('keeps an intact bedrock shell', () => {
    const w = layout.world;
    for (let z = 0; z < w.sz; z += 3)
      for (let x = 0; x < w.sx; x += 3) {
        expect(w.get(x, 0, z)).toBe(B.BEDROCK);
        expect(w.get(x, w.sy - 1, z)).toBe(B.BEDROCK);
      }
    for (let y = 0; y < w.sy; y += 3)
      for (let i = 0; i < w.sx; i += 3) {
        expect(w.get(0, y, i)).toBe(B.BEDROCK);
        expect(w.get(w.sx - 1, y, i)).toBe(B.BEDROCK);
        expect(w.get(i, y, 0)).toBe(B.BEDROCK);
        expect(w.get(i, y, w.sz - 1)).toBe(B.BEDROCK);
      }
  });

  it('spawns the player standing inside the camp', () => {
    const { spawn, camp } = layout;
    expect(spawn.x).toBeGreaterThan(camp.min[0]);
    expect(spawn.x).toBeLessThan(camp.max[0]);
    expect(nearReachable(layout.world, seen, spawn.x, spawn.y, spawn.z, 0, 1)).toBe(true);
  });

  it('connects the camp to every critical location on foot', () => {
    const L = layout.landmarks;
    for (const key of ['workbench', 'campfire', 'ledge', 'stairsBottom', 'bridge', 'firstCrystals', 'hollowCrystals']) {
      const [x, y, z] = L[key];
      expect(nearReachable(layout.world, seen, x, y, z, 3, 3), `landmark ${key} unreachable`).toBe(true);
    }
    // The shrine door and the temple seal must be reachable from the front.
    const [dx, dy, dz] = L.shrineDoor;
    expect(nearReachable(layout.world, seen, dx + 1, dy, dz, 2, 1), 'shrine door').toBe(true);
    const [sx, sy, sz] = L.seal;
    expect(nearReachable(layout.world, seen, sx - 1, sy, sz, 2, 1), 'temple seal').toBe(true);
  });

  it('opens the shrine and the deep gate once their barriers are mined', () => {
    const w = layout.world;
    const copy = { ...w, blocks: w.blocks.slice() } as typeof w;
    Object.setPrototypeOf(copy, Object.getPrototypeOf(w));
    for (let i = 0; i < copy.blocks.length; i++) {
      if (copy.blocks[i] === B.CRUMBLING_BRICK || copy.blocks[i] === B.HARDENED_SLATE) copy.blocks[i] = B.AIR;
    }
    const s = layout.spawn;
    const open = reachableCells(copy, Math.floor(s.x), Math.floor(s.y) + 1, Math.floor(s.z));
    const [tx, ty, tz] = layout.landmarks.tablet;
    expect(nearReachable(copy, open, tx, ty, tz, 2, 1), 'tablet').toBe(true);
    const [bx, by, bz] = layout.landmarks.balcony;
    expect(nearReachable(copy, open, bx, by, bz, 2, 1), 'balcony').toBe(true);
    // ...but they are sealed before that.
    expect(nearReachable(w, seen, tx, ty, tz, 2, 1), 'tablet sealed').toBe(false);
    expect(nearReachable(w, seen, bx, by, bz, 2, 1), 'balcony sealed').toBe(false);
  });

  it('provides enough reachable copper and stone for the first upgrades', () => {
    const copper = minableCount(layout.world, seen, B.COPPER_ORE);
    // Copper Pickaxe 8 + Sturdy Pack 4 + Copper Lantern 6 = 18 ore; veins drop 1-2 each.
    expect(copper).toBeGreaterThanOrEqual(30);
    expect(minableCount(layout.world, seen, B.SLATE)).toBeGreaterThan(200);
    expect(minableCount(layout.world, seen, B.CRYSTAL)).toBeGreaterThan(10);
  });

  it('places the camp interactables on the camp floor', () => {
    const craft = layout.props.find((p) => p.interact === 'craft');
    const storage = layout.props.find((p) => p.interact === 'storage');
    const relic = layout.props.find((p) => p.interact === 'relic');
    expect(craft && storage && relic).toBeTruthy();
    for (const p of [craft!, storage!]) {
      expect(layout.world.isSolid(Math.floor(p.x), Math.floor(p.y) - 1, Math.floor(p.z))).toBe(true);
      expect(layout.world.isSolid(Math.floor(p.x), Math.floor(p.y), Math.floor(p.z))).toBe(false);
    }
  });

  it('gives every prop light a real emitter voxel and props a solid support', () => {
    const w = layout.world;
    for (const p of layout.props) {
      for (const e of p.emitters) {
        const id = w.get(e[0], e[1], e[2]);
        expect(isEmitter(id) && !SOLID[id], `${p.id} emitter at ${e.join(',')}`).toBe(true);
      }
      if (p.anchor) expect(SOLID[w.get(...p.anchor)], `${p.id} anchor`).toBe(1);
    }
  });
});
