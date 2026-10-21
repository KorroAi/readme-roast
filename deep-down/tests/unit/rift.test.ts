import { beforeAll, describe, expect, it } from 'vitest';
import { GEAR, PLAYER, WORLD } from '../../src/config/balance';
import { B } from '../../src/config/blocks';
import { Health } from '../../src/gameplay/Health';
import { reachableCells, standable } from '../../src/world/analysis/reachability';
import { generateWorld } from '../../src/world/gen/generateWorld';
import type { WorldLayout } from '../../src/world/gen/types';
import type { LiveSite } from '../../src/game/WorldFeatures';

/** The rift floor (the world's 'undercroft' region): standing here is "the Rift reached". */
const RIFT = { min: [112, 5, 116], max: [137, 14, 147] } as const;

let layout: WorldLayout;
beforeAll(() => {
  layout = generateWorld();
}, 60_000);

type Opts = { open?: number[]; rope: boolean; boots: boolean };
function reach(o: Opts): Uint8Array {
  const w = layout.world;
  const saved = w.blocks.slice();
  const open = new Set(o.open ?? []);
  for (let i = 0; i < w.blocks.length; i++) if (open.has(w.blocks[i])) w.blocks[i] = B.AIR;
  for (const d of layout.features!.runeDoors) for (const [x, y, z] of d.cells) w.blocks[w.index(x, y, z)] = B.AIR;
  const sp = layout.spawn;
  const links = layout.features!.links.filter((l) => o.rope || l.id !== 'riftRope');
  // The Grip Boots: a 2-block jump, a 7 m safe drop.
  const s = reachableCells(w, Math.floor(sp.x), Math.floor(sp.y) + 1, Math.floor(sp.z), o.boots ? 7 : 3, links, o.boots ? 2 : 1);
  w.blocks.set(saved);
  return s;
}

function countIn(seen: Uint8Array, box: { min: readonly number[]; max: readonly number[] }): number {
  const w = layout.world;
  let n = 0;
  for (let z = box.min[2]; z <= box.max[2]; z++) for (let y = box.min[1]; y <= box.max[1]; y++) for (let x = box.min[0]; x <= box.max[0]; x++) if (seen[w.index(x, y, z)]) n++;
  return n;
}

describe('the rift (reached by the world\'s rope)', () => {
  const ALL = [B.CRUMBLING_BRICK, B.HARDENED_SLATE, B.IRONBOUND];

  it('the rift floor stays apart from the main walk, with or without the Grip Boots, until the rope', () => {
    expect(countIn(reach({ open: ALL, rope: false, boots: false }), RIFT)).toBe(0);
    expect(countIn(reach({ open: ALL, rope: false, boots: true }), RIFT)).toBe(0);
    expect(countIn(reach({ open: ALL, rope: true, boots: false }), RIFT)).toBeGreaterThan(200);
  });

  it('the rope: both stands walkable, the top on the main walk, the bottom on the rift floor', () => {
    const rope = layout.features!.links.find((l) => l.id === 'riftRope')!;
    const w = layout.world;
    const cell = (p: readonly number[]) => [Math.floor(p[0]), Math.floor(p[1]), Math.floor(p[2])] as const;
    const [tx, ty, tz] = cell(rope.top);
    const [bx, by, bz] = cell(rope.bottom);
    expect(standable(w, tx, ty, tz)).toBe(true);
    expect(standable(w, bx, by, bz)).toBe(true);
    const main = reach({ open: [B.CRUMBLING_BRICK, B.HARDENED_SLATE], rope: false, boots: false });
    expect(main[w.index(tx, ty, tz)]).toBe(1);
    expect(main[w.index(bx, by, bz)]).toBe(0);
    const inBox = bx >= RIFT.min[0] && bx <= RIFT.max[0] && by >= RIFT.min[1] && by <= RIFT.max[1] && bz >= RIFT.min[2] && bz <= RIFT.max[2];
    expect(inBox).toBe(true);
  });

  it('the Grip Boots do not get round the seal', () => {
    const w = layout.world;
    const tier1 = reach({ open: [B.CRUMBLING_BRICK], rope: true, boots: true });
    // The corridor beyond the seal, the balcony, the rift floor.
    for (const [x, y, z] of [[141, 42, 100], [136, 25, 127], [124, 6, 128]]) expect(tier1[w.index(x, y, z)], `${x},${y},${z}`).toBe(0);
  });

  it('the depth record can reach 144 m on the rift floor, 146 m in the Choir and 148 m in the Ember Deep', () => {
    const w = layout.world;
    const lowest = (open: number[]) => {
      const seen = reach({ open, rope: true, boots: false });
      let low = Infinity;
      for (let i = 0; i < seen.length; i++) if (seen[i]) low = Math.min(low, Math.floor(i / w.sx) % w.sy);
      return WORLD.depthOffset - low;
    };
    // Beyond the rift (content): the Glowroot's floor is a little lower than the rift's; the seals
    // (Ironbound, then ember glass) open the deeper floors.
    expect(lowest([B.CRUMBLING_BRICK, B.HARDENED_SLATE])).toBe(146);
    expect(lowest(ALL)).toBe(146);
    expect(lowest([...ALL, B.EMBER_GLASS])).toBe(148);
    // The rift floor itself is still 144 m.
    const seen = reach({ open: ALL, rope: true, boots: false });
    let riftLow = Infinity;
    for (let i = 0; i < seen.length; i++) {
      if (!seen[i]) continue;
      const x = i % w.sx;
      const y = Math.floor(i / w.sx) % w.sy;
      const z = Math.floor(i / (w.sx * w.sy));
      if (x >= 114 && x <= 144 && z >= 112 && z <= 152) riftLow = Math.min(riftLow, y);
    }
    expect(WORLD.depthOffset - riftLow).toBe(144);
  });

  it('Echo crystal grows only on the rift floor side (the rope and an iron pick)', () => {
    const w = layout.world;
    const main = reach({ open: ALL, rope: false, boots: true });
    let echo = 0;
    for (let i = 0; i < w.blocks.length; i++) {
      if (w.blocks[i] !== B.ECHO_CRYSTAL) continue;
      echo++;
      const z = Math.floor(i / (w.sx * w.sy));
      const y = Math.floor(i / w.sx) % w.sy;
      const x = i % w.sx;
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) for (let dy = -2; dy <= 1; dy++) expect(main[w.index(x + dx, y + dy, z + dz)], `echo ${x},${y},${z}`).toBe(0);
    }
    expect(echo).toBeGreaterThanOrEqual(12);
    for (const id of layout.progression!.echoClusters) {
      const p = layout.props.find((q) => q.id === id)!;
      expect(p.minable).toMatchObject({ drop: 'echoShard', tier: 3, min: 2, max: 3 });
    }
  });

  it('the Grip Boots: jump 2.1 m and a 7 m drop without harm (3.5 m without)', () => {
    const height = (v: number) => (v * v) / (2 * PLAYER.gravity);
    expect(height(PLAYER.jumpVelocity)).toBeCloseTo(1.14, 1);
    expect(height(GEAR.gripBoots.jumpVelocity)).toBeCloseTo(2.1, 1);
    const landing = (drop: number) => Math.sqrt(2 * PLAYER.gravity * drop);
    expect(Health.fallDamage(landing(7), GEAR.gripBoots.safeFallSpeed)).toBe(0);
    expect(Health.fallDamage(landing(7.5), GEAR.gripBoots.safeFallSpeed)).toBeGreaterThan(0);
    expect(Health.fallDamage(landing(3.5))).toBe(0);
    expect(Health.fallDamage(landing(7))).toBeGreaterThan(0);
    // The Miner's Coat: 7 hearts.
    expect(Health.maxFor(['minersCoat'])).toBe(140);
    expect(Health.maxFor([])).toBe(PLAYER.maxHealth);
  });
});

describe('rumours (the Survey Table) from the living rock and the bloom', () => {
  it('every site has a name, a line and a walk from camp (the rift by the rope)', async () => {
    const { HomeField } = await import('../../src/world/analysis/homeField');
    const { rideEdges } = await import('../../src/game/ropeRide');
    const { RIDES } = await import('../../src/config/balance');
    const { buildRumours, focusRumour } = await import('../../src/game/Survey');
    // The seal broken (beyond it no walk reaches until then: those rumours have no distance).
    const w = layout.world;
    const saved = w.blocks.slice();
    // ...and the ember glass (the Ember Deep's walls breathe too, behind it).
    for (let i = 0; i < w.blocks.length; i++) if (w.blocks[i] === B.HARDENED_SLATE || w.blocks[i] === B.EMBER_GLASS) w.blocks[i] = B.AIR;
    const home = new HomeField(layout.world);
    for (const e of rideEdges(layout.features!.links, true, RIDES.stepsPerSecond)) home.addEdge(e.from, e.to, e.cost);
    home.computeToRegion(layout.camp);
    w.blocks.set(saved);
    const sites: LiveSite[] = layout.features!.living.map((s) => {
      let x = 0, y = 0, z = 0;
      for (const i of s.cells) {
        x += i % w.sx;
        y += Math.floor(i / w.sx) % w.sy;
        z += Math.floor(i / (w.sx * w.sy));
      }
      const n = s.cells.length;
      return { kind: 'living', id: s.id as string, area: s.area, x: x / n + 0.5, y: y / n, z: z / n + 0.5, epoch: 0, ore: s.table.map((r) => ({ ...r })), present: true };
    });
    const b = layout.features!.blooms[0];
    sites.push({ kind: 'bloom', id: 'bloom_e0', area: b.area, x: b.p[0], y: b.p[1], z: b.p[2], epoch: 0, ore: [{ block: B.CRYSTAL, count: 3 }], present: true });
    const rumours = buildRumours(sites, home, 'riftWalls');
    expect(rumours.length).toBe(4);
    expect(rumours[0].kind).toBe('bloom'); // the bloom first
    for (const r of rumours) {
      expect(r.distance, r.id).not.toBeNull();
      expect(r.distance!, r.id).toBeGreaterThan(20);
      expect(r.text, r.id).toMatch(/ — \d+ m$/);
      expect(r.areaName.length).toBeGreaterThan(0);
    }
    const rift = rumours.find((r) => r.id === 'riftWalls')!;
    expect(rift.target).toBe(true);
    expect(rift.ore.map((o) => o.item)).toEqual(expect.arrayContaining(['ironOre']));
    expect(focusRumour(rumours, 'riftWalls')!.id).toBe('riftWalls');
    expect(focusRumour(rumours, null)!.kind).toBe('bloom');
  });
});
