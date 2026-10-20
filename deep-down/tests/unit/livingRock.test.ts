import { beforeAll, describe, expect, it } from 'vitest';
import { B, BLOCKS, SOLID } from '../../src/config/blocks';
import { LIVING_TABLES } from '../../src/config/livingRock';
import { WORLD } from '../../src/config/balance';
import { applyLiving, bloomSiteFor, rollLiving } from '../../src/world/gen/features/living';
import { generateWorld } from '../../src/world/gen/generateWorld';
import { nearReachable, reachableCells } from '../../src/world/analysis/reachability';
import type { WorldLayout } from '../../src/world/gen/types';
import { openWorld } from '../../tools/poi-density';

let layout: WorldLayout;
let generated: Uint8Array;

beforeAll(() => {
  layout = generateWorld();
  generated = layout.world.blocks.slice();
});

const ORE = new Set<number>([B.COPPER_ORE, B.IRON_ORE, B.CRYSTAL]);
const orePositions = (ids: Uint8Array) => new Set([...ids.keys()].filter((k) => ORE.has(ids[k])));

describe('the living rock ("the deep breathes")', () => {
  it('has two sites of the expected size, and the generated world is epoch 0', () => {
    const L = layout.features!.living;
    expect(L.map((s) => s.id).sort()).toEqual(['haldenFace', 'riftWalls']);
    const face = L.find((s) => s.id === 'haldenFace')!;
    const rift = L.find((s) => s.id === 'riftWalls')!;
    expect(face.cells.length).toBeGreaterThanOrEqual(45);
    expect(face.cells.length).toBeLessThanOrEqual(63);
    expect(rift.cells.length).toBeGreaterThanOrEqual(100);
    expect(rift.cells.length).toBeLessThanOrEqual(160);
    for (const s of L) {
      const ids = rollLiving(s, WORLD.seed, 0);
      s.cells.forEach((i, k) => expect(layout.world.blocks[i]).toBe(ids[k]));
    }
  });

  it('deals exact counts every epoch, deterministically, moving at least half the ore each time', () => {
    for (const s of layout.features!.living) {
      let prev: Uint8Array | null = null;
      for (let e = 0; e <= 20; e++) {
        const ids = rollLiving(s, WORLD.seed, e);
        expect(Array.from(rollLiving(s, WORLD.seed, e))).toEqual(Array.from(ids));
        for (const row of LIVING_TABLES[s.id]) expect(ids.filter((v) => v === row.block).length, `${s.id} e${e} ${row.block}`).toBe(row.count);
        // Everything else is the cell's own host rock.
        ids.forEach((v, k) => {
          if (!ORE.has(v)) expect(v).toBe(s.host[k]);
        });
        if (prev) {
          const a = orePositions(prev);
          const b = orePositions(ids);
          const moved = [...b].filter((k) => !a.has(k)).length / b.size;
          expect(moved, `${s.id} e${e - 1} -> e${e}`).toBeGreaterThanOrEqual(0.5);
        }
        prev = ids;
      }
    }
  });

  it('changes only its own cells, regrows mined ones, and never near a drop or the pack', () => {
    const w = layout.world;
    const s = layout.features!.living.find((x) => x.id === 'haldenFace')!;
    const blocks = w.blocks.slice();
    // The player mined three cells of the face, far apart; a drop lies next to the third.
    const xyz = (i: number) => [i % w.sx, Math.floor(i / w.sx) % w.sy, Math.floor(i / (w.sx * w.sy))];
    const apart = (a: number, b: number) => Math.hypot(...xyz(a).map((v, k) => v - xyz(b)[k])) > 3;
    const third = s.cells[Math.floor(s.cells.length / 2)];
    const mined = [s.cells.find((i) => apart(i, third))!, [...s.cells].reverse().find((i) => apart(i, third))!, third];
    for (const i of mined) blocks[i] = B.AIR;
    const [dx, dy, dz] = xyz(mined[2]);
    const before = blocks.slice();
    const res = applyLiving(blocks, generated, w, s, rollLiving(s, WORLD.seed, 3), (i, id) => (blocks[i] = id), [[dx + 0.5, dy + 0.5, dz + 0.5]]);
    expect(res.changed).toBeGreaterThan(0);
    const listed = new Set(s.cells);
    for (let i = 0; i < blocks.length; i++) if (blocks[i] !== before[i]) expect(listed.has(i), `cell ${i} is not living`).toBe(true);
    expect(SOLID[blocks[mined[0]]]).toBe(1);
    expect(SOLID[blocks[mined[1]]]).toBe(1);
    expect(blocks[mined[2]], 'no regrowth under a drop').toBe(B.AIR);
    expect(res.regrown).toBe(2);
  });

  it('only ever restores cells the generated world has solid', () => {
    const w = layout.world;
    const s = layout.features!.living.find((x) => x.id === 'riftWalls')!;
    const fakeGenerated = generated.slice();
    fakeGenerated[s.cells[0]] = B.AIR;
    const blocks = generated.slice();
    blocks[s.cells[0]] = B.AIR;
    applyLiving(blocks, fakeGenerated, w, s, rollLiving(s, WORLD.seed, 1), (i, id) => (blocks[i] = id));
    expect(blocks[s.cells[0]]).toBe(B.AIR);
  });

  it('keeps the cyan budget at every epoch (the bloom included)', () => {
    const w = layout.world;
    const cyanIn = (b: Uint8Array) => {
      let n = 0;
      for (let i = 0; i < b.length; i++) {
        const e = BLOCKS[b[i]]?.emission;
        if (e && e[2] > e[0]) n++;
      }
      return n;
    };
    const base = cyanIn(generated);
    for (let e = 0; e <= 20; e++) {
      const blocks = generated.slice();
      for (const s of layout.features!.living) applyLiving(blocks, generated, w, s, rollLiving(s, WORLD.seed, e), (i, id) => (blocks[i] = id));
      // One bloom: one cyan light.
      expect(cyanIn(blocks) + 1, `epoch ${e}`).toBeLessThanOrEqual(120);
      expect(Math.abs(cyanIn(blocks) - base), `epoch ${e} drift`).toBe(0);
    }
  });

  it('grows the bloom at a new site every expedition (never twice in a row), each standable and reachable', () => {
    const F = layout.features!;
    const n = F.blooms.length;
    expect(n).toBe(6);
    const first = F.blooms.findIndex((b) => b.id === 'chasmEast');
    expect(bloomSiteFor(0, n, WORLD.seed, first)).toBe(first);
    const seen = new Set<number>();
    for (let e = 1; e <= 300; e++) {
      const a = bloomSiteFor(e - 1, n, WORLD.seed, first);
      const b = bloomSiteFor(e, n, WORLD.seed, first);
      expect(b, `epoch ${e}`).not.toBe(a);
      seen.add(b);
    }
    expect(seen.size).toBe(n);
    const w = openWorld(layout);
    const s = layout.spawn;
    const reach = reachableCells(w, Math.floor(s.x), Math.floor(s.y) + 1, Math.floor(s.z), 3, F.links);
    for (const b of F.blooms) {
      const [x, y, z] = b.p;
      expect(!SOLID[w.get(Math.floor(x), y, Math.floor(z))] && SOLID[w.get(Math.floor(x), y - 1, Math.floor(z))] === 1, `${b.id} standable`).toBe(true);
      expect(nearReachable(w, reach, x, y, z, 1, 1), `${b.id} reachable`).toBe(true);
    }
  });
});
