import { beforeAll, describe, expect, it } from 'vitest';
import { B, SOLID } from '../../src/config/blocks';
import { CACHE } from '../../src/config/balance';
import { Rng } from '../../src/core/rng';
import { PlayerController } from '../../src/game/PlayerController';
import { CacheSpot, type SpotFields } from '../../src/gameplay/CacheSpot';
import { cacheFits, makeCache, recoverCache, replaceCache, type CacheState } from '../../src/gameplay/Expedition';
import { Health } from '../../src/gameplay/Health';
import { Backpack } from '../../src/gameplay/Inventory';
import { HomeField, ReachSet } from '../../src/world/analysis/homeField';
import { reachableCells, standable } from '../../src/world/analysis/reachability';
import { generateWorld } from '../../src/world/gen/generateWorld';
import type { WorldLayout } from '../../src/world/gen/types';

describe('the pack left behind', () => {
  it('holds the pack minus the Sealed Pouch, plus loose drops (never key items)', () => {
    const b = new Backpack(10, 2);
    for (let i = 0; i < 8; i++) b.add('stone', 30);
    b.add('copperOre', 15); // slot 8: inside the pouch
    b.add('glimmerShard', 4); // slot 9: inside the pouch
    const cached = makeCache(b, { ironOre: 2, ancientTablet: 1, stone: 3 });
    expect(cached).toEqual({ stone: 243, ironOre: 2 });
    expect(b.toJSON().slice(0, 8).every((s) => s === null)).toBe(true);
    expect(b.totals()).toEqual({ copperOre: 15, glimmerShard: 4 });
  });

  it('walking up to it returns everything that fits; the rest stays in the cache', () => {
    const cache: CacheState = { x: 1, y: 2, z: 3, depth: 60, items: { stone: 40, copperOre: 6 } };
    const b = new Backpack(2);
    expect(cacheFits(cache, b)).toBe(true);
    const r = recoverCache(cache, b);
    // Two slots: the 40 stone fill both (30 + 10); the copper does not fit and stays.
    expect(r).toEqual({ taken: { stone: 40 }, count: 40, left: 6 });
    expect(b.count('stone')).toBe(40);
    expect(cache.items).toEqual({ copperOre: 6 });
    expect(cacheFits(cache, b)).toBe(false);
    // Make room (bank at camp) and come back: the overflow is still there.
    b.takeAll();
    const again = recoverCache(cache, b);
    expect(again).toEqual({ taken: { copperOre: 6 }, count: 6, left: 0 });
    expect(cache.items).toEqual({});
  });

  it('a second black-out replaces the first cache, which reports how many items were lost', () => {
    const b = new Backpack(6);
    b.add('stone', 12);
    b.add('copperOre', 3);
    const one = replaceCache(null, makeCache(b), { x: 10.5, y: 42, z: 20.5, depth: 108 });
    expect(one).toEqual({ cache: { x: 10.5, y: 42, z: 20.5, depth: 108, items: { stone: 12, copperOre: 3 } }, replaced: 0 });
    b.add('ironOre', 2);
    const two = replaceCache(one.cache, makeCache(b), { x: 30.5, y: 25, z: 40.5, depth: 125 });
    expect(two.replaced).toBe(15);
    expect(two.cache).toEqual({ x: 30.5, y: 25, z: 40.5, depth: 125, items: { ironOre: 2 } });
    // A black-out with an empty pack still destroys the older cache.
    const three = replaceCache(two.cache, makeCache(b), { x: 0, y: 0, z: 0, depth: 0 });
    expect(three).toEqual({ cache: null, replaced: 2 });
  });
});

// ---------------------------------------------------------------------------------------
// Where the pack lands: 200 lethal falls.

let layout: WorldLayout;

function fieldsFor(l: WorldLayout): { fields: SpotFields; home: HomeField; boot: Uint8Array } {
  const w = l.world;
  const home = new HomeField(w);
  home.computeToRegion(l.camp);
  const reach = new ReachSet(w);
  const s = l.spawn;
  reach.computeFrom(Math.floor(s.x), Math.floor(s.y) + 1, Math.floor(s.z));
  const boot = reachableCells(w, Math.floor(s.x), Math.floor(s.y) + 1, Math.floor(s.z));
  const fields: SpotFields = {
    cellAt: (x, y, z) => {
      const c = home.cellNear(x, y, z);
      return c >= 0 ? home.cellXYZ(c) : null;
    },
    reachable: (x, y, z) => reach.has(x, y, z),
    homeSteps: (x, y, z) => home.at(x, y, z),
  };
  return { fields, home, boot };
}

/** Reachable cells next to a column that drops at least `minDrop` blocks (a lethal fall). */
function lethalEdges(l: WorldLayout, boot: Uint8Array, minDrop: number, near?: [number, number, number], radius = Infinity) {
  const w = l.world;
  const out: Array<{ from: [number, number, number]; dir: [number, number] }> = [];
  for (let i = 0; i < boot.length; i++) {
    if (!boot[i]) continue;
    const z = Math.floor(i / (w.sx * w.sy));
    const y = Math.floor(i / w.sx) % w.sy;
    const x = i % w.sx;
    if (near && Math.hypot(x - near[0], y - near[1], z - near[2]) > radius) continue;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const nx = x + dx;
      const nz = z + dz;
      if (SOLID[w.get(nx, y, nz)] || SOLID[w.get(nx, y + 1, nz)]) continue;
      let d = 1;
      while (y - d > 0 && !SOLID[w.get(nx, y - d, nz)]) d++;
      if (d - 1 >= minDrop && standable(w, x, y, z)) out.push({ from: [x, y, z], dir: [dx, dz] });
    }
  }
  return out;
}

/** Stand on `from` a moment, then walk off the edge. @returns the cache cell if the fall was lethal. */
function fallFrom(l: WorldLayout, fields: SpotFields, from: [number, number, number], dir: [number, number]) {
  const p = new PlayerController(l.world);
  const spot = new CacheSpot();
  const dt = 1 / 60;
  p.teleport(from[0] + 0.5 - dir[0] * 0.2, from[1], from[2] + 0.5 - dir[1] * 0.2, Math.atan2(dir[0], dir[1]));
  const camYaw = Math.atan2(-dir[0], -dir[1]);
  for (let i = 0; i < 360; i++) {
    const walking = i >= 30; // half a second still first, as a player does before stepping off
    const ev = p.update(dt, 0, walking ? 1 : 0, false, camYaw, true);
    // As in the game: the fatal landing blacks out in the same frame, so it is never stood on.
    if (ev.landedSpeed > 0 && Health.fallDamage(ev.landedSpeed) >= 100) return { lethal: true, cell: spot.place(p.x, p.y, p.z, fields) };
    spot.update(dt, p.grounded, p.x, p.y, p.z, fields);
  }
  return { lethal: false, cell: spot.cell };
}

beforeAll(() => {
  layout = generateWorld();
});

describe('cache placement (fuzz)', () => {
  it('200 lethal falls (the chasm and the 20 m rift drop among them) leave every cache on the boot reachable set', () => {
    const rng = new Rng(0xcac4e);
    const results: string[] = [];
    let lethal = 0;
    let pitStarts = 0;
    const check = (l: WorldLayout, f: ReturnType<typeof fieldsFor>, edges: ReturnType<typeof lethalEdges>, want: number, label: string) => {
      let got = 0;
      let tries = 0;
      while (got < want && tries < want * 12 && edges.length) {
        tries++;
        const e = edges[rng.int(0, edges.length - 1)];
        const r = fallFrom(l, f.fields, e.from, e.dir);
        if (!r.lethal) continue;
        got++;
        if (!r.cell) {
          results.push(`${label}: no cache cell after a fall from ${e.from}`);
          continue;
        }
        const i = l.world.index(...r.cell);
        if (!f.boot[i]) results.push(`${label}: cache at ${r.cell} (fall from ${e.from}) is off the reachable set`);
        if (f.home.dist[i] < 0) results.push(`${label}: cache at ${r.cell} has no walk home`);
        // From a safe brink the cache lies at the brink, not at the bottom. (A few edges are pit
        // cells with no walk home: their cache goes to the nearest cell that has one.)
        const start = l.world.index(...e.from);
        if (f.home.dist[start] >= 0 && (Math.hypot(r.cell[0] - e.from[0], r.cell[2] - e.from[2]) > 2 || Math.abs(r.cell[1] - e.from[1]) > 1)) results.push(`${label}: cache at ${r.cell} far from the brink ${e.from}`);
        if (f.home.dist[start] < 0) pitStarts++;
      }
      lethal += got;
      return got;
    };

    const f = fieldsFor(layout);
    const all = lethalEdges(layout, f.boot, 14);
    const chasm = lethalEdges(layout, f.boot, 14, layout.landmarks.bridge, 14);
    expect(chasm.length, 'lethal edges at the chasm by the bridge').toBeGreaterThan(0);
    const chasmFalls = check(layout, f, chasm, 30, 'chasm');
    const anyFalls = check(layout, f, all, 150, 'hollow');

    // The rift: break the seal (as the player does), then step off the balcony into the 20 m drop.
    const opened = generateWorld();
    const w = opened.world;
    for (let i = 0; i < w.blocks.length; i++) if (w.blocks[i] === B.HARDENED_SLATE) w.blocks[i] = B.AIR;
    const f2 = fieldsFor(opened);
    const rift = lethalEdges(opened, f2.boot, 16, opened.landmarks.balcony, 10);
    expect(rift.length, 'lethal edges on the balcony over the rift').toBeGreaterThan(0);
    const riftFalls = check(opened, f2, rift, 20, 'rift');

    console.log(`[cache] lethal falls: ${lethal} (chasm ${chasmFalls}, hollow ${anyFalls}, rift ${riftFalls}; ${pitStarts} from pit cells); grounded threshold ${CACHE.groundedSeconds} s`);
    expect(results).toEqual([]);
    expect(lethal).toBeGreaterThanOrEqual(200);
    expect(chasmFalls).toBeGreaterThan(0);
    expect(riftFalls).toBeGreaterThan(0);
  });

  it('no cell is recorded mid-air or after a moment that was too short', () => {
    const f = fieldsFor(layout);
    const spot = new CacheSpot();
    const lm = layout.landmarks.ledge;
    const [x, y, z] = [Math.floor(lm[0]), Math.floor(lm[1]), Math.floor(lm[2])];
    spot.update(0.2, true, x + 0.5, y, z + 0.5, f.fields);
    expect(spot.cell).toBeNull();
    spot.update(0.2, false, x + 0.5, y, z + 0.5, f.fields);
    spot.update(0.2, true, x + 0.5, y, z + 0.5, f.fields);
    expect(spot.cell).toBeNull();
    spot.update(0.15, true, x + 0.5, y, z + 0.5, f.fields);
    expect(spot.cell).not.toBeNull();
  });
});
