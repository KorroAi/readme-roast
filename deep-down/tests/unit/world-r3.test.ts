import { beforeAll, describe, expect, it } from 'vitest';
import { B } from '../../src/config/blocks';
import { BIOMES, BIOME_IDS, STRATA, type BiomeId } from '../../src/config/biomes';
import { EventBus, type GameEvents } from '../../src/core/events';
import { EventSchedule } from '../../src/game/events/schedule';
import { ROSTERS } from '../../src/game/mobs/rosters';
import { StratumManager, type StratumHost } from '../../src/game/Stratum';
import { installStratumDebug } from '../../src/game/StratumDebug';
import type { WorldSession } from '../../src/game/WorldSession';
import { t, type TextKey } from '../../src/i18n';
import { ExploredMap } from '../../src/world/gen/strata/explored';
import { nestKind } from '../../src/world/gen/strata/content';
import { generateStratum } from '../../src/world/gen/strata/generateStratum';
import type { StratumLayout } from '../../src/world/gen/strata/types';
import { VoxelWorld } from '../../src/world/VoxelWorld';

/**
 * Round 3 (WORLD, second pass): what the requests and the playtest asked of the world. The guardian
 * rumours hold on every seed (QA 20:20, MOBS and LOOP 20:23-20:31), nests breed their roster's kind
 * (MOBS 19:11), the Halden Mines' loose roofs drop stones (LOOP 20:23), the map shows what the
 * explorer saw (UI 18:25), and the open gate's shaft is the way down, never a pit.
 */
describe('the guardian rumours (arrival cards)', () => {
  const guardianName = (b: BiomeId) => t(`mob.${BIOMES[b].mobs.guardian}` as TextKey).replace(/^The /, '');

  it.each(BIOME_IDS.filter((b) => b !== 'heart'))('%s: names its real guardian, and no compass direction', (b) => {
    const r = t(BIOMES[b].rumour);
    expect(r.length).toBeGreaterThan(30);
    expect(r).toContain(guardianName(b));
    expect(r.toLowerCase()).not.toMatch(/\b(north|south|east|west)(ern)?\b/);
  });

  it('BIOMES[b].mobs is MOBS\' roster (the cards never name a creature that does not live there)', () => {
    for (const b of BIOME_IDS) {
      expect(BIOMES[b].mobs.monsters).toEqual(ROSTERS[b].monsters.map((e) => e.kind));
      expect(BIOMES[b].mobs.beings).toEqual(ROSTERS[b].beings.map((e) => e.kind));
      expect(BIOMES[b].mobs.guardian).toBe(ROSTERS[b].guardian);
    }
  });
});

describe('nests breed their roster\'s swarmers', () => {
  it('picks one of the biome\'s nest kinds by weight, every one of them over many nests', () => {
    for (const b of BIOME_IDS) {
      const nesting = ROSTERS[b].monsters.filter((e) => e.nest).map((e) => e.kind);
      const seen = new Set<string>();
      for (let h = 0; h < 4000; h++) {
        const k = nestKind(b, Math.imul(h + 1, 0x9e3779b1));
        if (!nesting.length) expect(k).toBeNull();
        else {
          expect(nesting).toContain(k);
          seen.add(k!);
        }
      }
      expect(seen.size).toBe(nesting.length);
    }
  });
});

describe('the events director in the Halden Mines\' rockfall zones', () => {
  it('draws a rockfall far more often where the roof is loose', () => {
    const count = (boost: boolean) => {
      const s = new EventSchedule(1234);
      s.nextAt = 0;
      let rock = 0;
      let all = 0;
      for (let i = 0; i < 400; i++) {
        const ev = s.step(1, true, 200, () => ({ anchor: [0, 0, 0], radius: 2 }), boost ? (k) => (k === 'rockfall' ? 3.5 : 1) : undefined);
        if (ev) {
          all++;
          if (ev.kind === 'rockfall') rock++;
          s.end();
          s.nextAt = s.clock;
        }
      }
      return rock / all;
    };
    const plain = count(false);
    const boosted = count(true);
    expect(boosted).toBeGreaterThan(plain * 2);
  });
});

describe('the explored map shows what the explorer sees', () => {
  it('maps an open hall to the view\'s reach and a tunnel to its walls, never through rock', () => {
    const w = new VoxelWorld(64, 32, 64, 16);
    w.blocks.fill(B.SLATE);
    // A hall 30 x 30 at feet 10, and beyond its east wall a tunnel the explorer cannot see into.
    for (let z = 10; z < 40; z++) for (let x = 10; x < 40; x++) for (let y = 10; y < 16; y++) w.setRaw(x, y, z, B.AIR);
    for (let x = 42; x < 60; x++) for (let y = 10; y < 13; y++) w.setRaw(x, y, 25, B.AIR);
    const m = new ExploredMap(64, 64);
    const solid = (x: number, y: number, z: number) => w.isSolid(x, y, z);
    m.markSight(solid, 25.5, 10, 25.5, 14);
    // Far across the open floor (12 m) is mapped; the old 7 m disc would not reach it.
    expect(m.has(37, 25)).toBe(true);
    expect(m.has(25, 13)).toBe(true);
    expect(m.heightAt(37, 25)).toBe(10);
    // The wall is mapped, the tunnel behind it is not.
    expect(m.has(50, 25)).toBe(false);
    // Coverage of the hall within the view's reach: most of it.
    let n = 0;
    let lit = 0;
    for (let z = 12; z < 38; z++) for (let x = 12; x < 38; x++) if (Math.hypot(x + 0.5 - 25.5, z + 0.5 - 25.5) < 13) {
      n++;
      if (m.has(x, z)) lit++;
    }
    expect(lit / n).toBeGreaterThan(0.9);
  });
});

describe('the open gate\'s shaft is the way down (stratum I)', () => {
  let layout: StratumLayout;
  beforeAll(() => {
    layout = generateStratum(4242, 1);
  }, 60_000);

  it('the debug goto(biome) lands on open ground of that biome, never in a lair (MOBS 21:42)', async () => {
    const g = globalThis as unknown as { window?: { __DD__?: Record<string, unknown> }; location?: { search: string } };
    const had = { window: g.window, location: g.location };
    g.window = { __DD__: {} };
    g.location = { search: '?debug=1' };
    try {
      const player = { x: 0, y: 0, z: 0 };
      const session = { layout, world: layout.world } as unknown as WorldSession;
      const strata = { layout, current: 1, enter: async () => {} } as unknown as StratumManager;
      installStratumDebug({ session, strata, player, teleport: (x, y, z) => Object.assign(player, { x, y, z }) });
      const goto = g.window.__DD__!.goto as (b: BiomeId) => Promise<[number, number, number] | null>;
      // The lairs' own caverns first (MOBS saw the lair come first on seed 7): the pick must pass them by.
      const inLair = (c: { centre: readonly number[] }) => layout.lairs.some((a) => Math.hypot(c.centre[0] - a.centre[0], c.centre[2] - a.centre[2]) < a.radius + 6);
      expect(layout.caverns.some(inLair)).toBe(true);
      layout.caverns.sort((a, b) => Number(inLair(b)) - Number(inLair(a)));
      for (const b of STRATA[0].biomes) {
        const p = await goto(b);
        expect(p, b).not.toBeNull();
        expect(layout.biomeAt(p![0], p![1], p![2])).toBe(b);
        for (const a of layout.lairs) expect(Math.hypot(p![0] - a.centre[0], p![2] - a.centre[2]) >= a.radius + 6 || Math.abs(p![1] - a.centre[1]) >= 12, `${b} in ${a.biome}'s lair`).toBe(true);
      }
    } finally {
      g.window = had.window;
      g.location = had.location;
    }
  });

  it('stepping into the open shaft descends; standing on its rim or by a sealed one does not', async () => {
    const bus = new EventBus<GameEvents>();
    const world = layout.world;
    const session = { layout, world, setBlock: (x: number, y: number, z: number, id: number) => world.set(x, y, z, id) } as unknown as WorldSession;
    const host: StratumHost = { session, bus, loading: () => {}, placeExplorer: () => {} };
    const m = new StratumManager(host, 4242);
    m.adoptBooted();
    let descended = 0;
    m.descend = async () => {
      descended++;
      return true;
    };
    const [gx, gy, gz] = layout.gate.centre;
    // Sealed: nothing happens even in the shaft's column.
    m.update(0.1, gx, gy - 2.5, gz);
    expect(descended).toBe(0);
    for (const [x, y, z] of layout.gate.seal) world.set(x, y, z, B.AIR);
    expect(m.gateOpen()).toBe(true);
    // On the hall floor beside it, and on the shaft's glyph rim: no.
    m.update(0.1, gx + 4, gy, gz);
    m.update(0.1, gx + 2, gy - 1, gz);
    expect(descended).toBe(0);
    // In the pit: down.
    m.update(0.1, gx, gy - 3, gz);
    expect(descended).toBe(1);
    expect(STRATA[0].index).toBe(1);
  });
});
