import { beforeAll, describe, expect, it } from 'vitest';
import { B, BLOCKS, isEmitter, SOLID } from '../../src/config/blocks';
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

  it('keeps the light budget: little cyan, warm lamps at every navigation point', () => {
    // Cyan is reserved for crystal and the builders' inscriptions (ART_DIRECTION.md); warm lamps
    // mark the way. Measured with tools/emission-budget.ts: 98 cyan/violet emitter voxels (86 plus
    // the 12 round-3 key lights: Spindle uplight, seal, frieze, shrine dais, chasm), lamps <= 6.3 m.
    // The 120 cap is unchanged.
    const w = layout.world;
    let cyan = 0;
    const warm: [number, number, number][] = [];
    for (let y = 0; y < w.sy; y++)
      for (let z = 0; z < w.sz; z++)
        for (let x = 0; x < w.sx; x++) {
          const e = BLOCKS[w.get(x, y, z)]?.emission;
          if (!e) continue;
          if (e[2] > e[0]) cyan++;
          else warm.push([x + 0.5, y + 0.5, z + 0.5]);
        }
    expect(cyan).toBeLessThanOrEqual(120);
    const L = layout.landmarks;
    for (const name of ['campfire', 'ledge', 'stairsTop', 'landing', 'stairsBottom', 'bridge', 'seal', 'balcony', 'shrineDoor', 'oldCamp'] as const) {
      const p = L[name];
      const near = Math.min(...warm.map((c) => Math.hypot(c[0] - p[0], c[1] - p[1], c[2] - p[2])));
      expect(near, `warm light near ${name}`).toBeLessThanOrEqual(7);
    }
  });

  it('gives each space its key light: the Spindle, the seal, the frieze, the shrine dais and the chasm', () => {
    // One motivated light per space (ART_DIRECTION.md, composition rules), authored in
    // generateWorld's key-light pass: a cold emitter near each landmark, violet low in the chasm.
    const w = layout.world;
    const nearest = (p: readonly number[], id: number, r: number) => {
      let best = Infinity;
      for (let z = Math.floor(p[2] - r); z <= p[2] + r; z++)
        for (let y = Math.floor(p[1] - r); y <= p[1] + r; y++)
          for (let x = Math.floor(p[0] - r); x <= p[0] + r; x++)
            if (w.get(x, y, z) === id) best = Math.min(best, Math.hypot(x + 0.5 - p[0], y + 0.5 - p[1], z + 0.5 - p[2]));
      return best;
    };
    const L = layout.landmarks;
    expect(nearest(L.spindle!, B.LIGHT_CYAN, 12), 'Spindle uplight').toBeLessThanOrEqual(11);
    expect(nearest(L.seal!, B.LIGHT_CYAN, 4), 'seal underglow').toBeLessThanOrEqual(2.5);
    expect(nearest([134.5, 51.5, 100.5], B.LIGHT_CYAN, 5), 'frieze light').toBeLessThanOrEqual(3.5);
    expect(nearest(L.tablet!, B.LIGHT_CYAN, 6), 'shrine dais light').toBeLessThanOrEqual(5.5);
    expect(nearest([122.5, 35, 128.5], B.LIGHT_ABYSS, 14), 'violet low in the chasm').toBeLessThanOrEqual(8);
  });
});
