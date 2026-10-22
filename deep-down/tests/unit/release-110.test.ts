import { beforeAll, describe, expect, it } from 'vitest';
import { B, EVENT_LIGHT, SOLID } from '../../src/config/blocks';
import { CACHE, WORLD } from '../../src/config/balance';
import { NODES } from '../../src/config/recipes';
import { EventBus, type GameEvents } from '../../src/core/events';
import type { Game } from '../../src/game/Game';
import { Progression } from '../../src/game/Progression';
import { WorldFeatures } from '../../src/game/WorldFeatures';
import { WorldSession } from '../../src/game/WorldSession';
import { PitWatch } from '../../src/gameplay/CacheSpot';
import { Equipment } from '../../src/gameplay/Equipment';
import { newFeats } from '../../src/gameplay/Feats';
import { Journal } from '../../src/gameplay/Journal';
import { en } from '../../src/i18n/en';
import { createNewSave } from '../../src/save/SaveSystem';
import { shiftWorldIfNeeded } from '../../src/save/saveData';
import type { PropSpec } from '../../src/world/gen/types';

/**
 * Regression tests for the 1.1.0 release fixes: opened caches after a world shift, the 'tree'
 * feat, relics after a world shift, a passing light in a mined cell, and the climb back out of a
 * pit. Real code throughout; the game around it is a stand-in where the whole Game is not needed.
 */
const SPAWN = { x: 34.5, y: 101, z: 43.2, yaw: Math.PI / 2 };

// WorldSession builds Three.js objects but never touches WebGL until rendering (session.test.ts).
// These are the 1.1.0 release's fixes: they run in the old hand-made world they were made for (round 3
// boots the strata; the relics and the Ancient Tablet are that world's).
let session: WorldSession;

beforeAll(async () => {
  session = await WorldSession.create(() => undefined, WORLD.seed, 1, 'legacy');
}, 60_000);

describe('a world shift and the opened caches (save/saveData)', () => {
  it('closes every cache again in another world, and keeps them opened in a compatible one', () => {
    const d = createNewSave(SPAWN, WORLD.seed, 1);
    d.progression.looted = ['c_chest_0', 'c_coffer_3'];
    // Another generator: the same ids name other caches there.
    const shifted = shiftWorldIfNeeded({ ...d, genVersion: WORLD.genVersion + 7 }, SPAWN);
    expect(shifted.shifted).toBe(true);
    expect(shifted.data.progression.looted).toEqual([]);
    // A compatible older generator lays the same cells and props: the opened caches stay opened.
    const old = WORLD.genCompatible[0];
    expect(old).toBeDefined();
    const compatible = shiftWorldIfNeeded({ ...d, genVersion: old }, SPAWN);
    expect(compatible.shifted).toBe(false);
    expect(compatible.data.progression.looted).toEqual(['c_chest_0', 'c_coffer_3']);
  });
});

/** A small stand-in for Game: what Progression's constructor and featSnapshot read. */
function progressionFor(skip: string | null = null) {
  const equipment = new Equipment();
  const game = { bus: new EventBus<GameEvents>(), equipment, journal: new Journal(), session: { layout: { props: [] as PropSpec[] } } };
  const p = new Progression(game as unknown as Game);
  // Every node there is to own, as a save at the end of the tree has it (the repeatable one cannot be owned).
  for (const n of Object.values(NODES)) {
    if (n.repeat || n.id === skip) continue;
    const r = n.result;
    if (r.kind === 'equip') equipment.upgrade(r.slot, r.tier);
    else if (r.kind === 'station') p.extra.stations.push(n.id);
    else p.extra.gear.push(n.id);
  }
  return p;
}

describe("the 'tree' feat (Progression.featSnapshot)", () => {
  it('is earned once every upgrade is owned: the repeatable Flash Charges do not count', () => {
    const repeatable = Object.values(NODES).filter((n) => n.repeat);
    expect(repeatable.map((n) => n.id)).toContain('flashCharges');
    const s = progressionFor().featSnapshot();
    expect(s.treeTotal).toBe(Object.keys(NODES).length - repeatable.length);
    expect(s.treeBuilt).toBe(s.treeTotal);
    expect(newFeats(new Set(), s).map((f) => f.id)).toContain('tree');
  });

  it('is not earned while one upgrade is missing', () => {
    for (const id of ['minersCoat', 'glimmerPickaxe', 'forge']) {
      const s = progressionFor(id).featSnapshot();
      expect(s.treeBuilt, id).toBe(s.treeTotal - 1);
      expect(newFeats(new Set(), s).map((f) => f.id), id).not.toContain('tree');
    }
  });
});

describe("the secrets after a world shift (Progression.secretsFound, the 'secretsAll' feat)", () => {
  it('counts the alcoves opened in this world only; the lifetime count may hold an older world\'s', () => {
    const p = progressionFor();
    const props = (p as unknown as { game: { session: { layout: { props: PropSpec[] } } } }).game.session.layout.props;
    for (const id of ['s0', 's1', 's2']) props.push({ id, kind: 'chest', x: 0, y: 0, z: 0, secret: true } as unknown as PropSpec);
    props.push({ id: 'c0', kind: 'crate', x: 0, y: 0, z: 0 } as unknown as PropSpec);
    // Five secrets found in the old world (lifetime), its ids cleared by the shift; two found here, and a plain crate.
    p.extra.life.secrets = 7;
    p.extra.looted.push('s0', 's1', 'c0');
    let s = p.featSnapshot();
    expect([s.secretsFound, s.secretsTotal]).toEqual([2, 3]);
    expect(newFeats(new Set(), s).map((f) => f.id)).not.toContain('secretsAll');
    p.extra.looted.push('s2');
    s = p.featSnapshot();
    expect(s.secretsFound).toBe(3);
    expect(newFeats(new Set(), s).map((f) => f.id)).toContain('secretsAll');
  });
});

/** A small stand-in for Game around the real session: what WorldFeatures' constructor and attach read. */
function featuresFor(journal: Journal) {
  const game = { session, bus: new EventBus<GameEvents>(), journal, progression: { day: 0, setRides: () => undefined } };
  return new WorldFeatures(game as unknown as Game);
}

describe('relics after a world shift (WorldFeatures.attach)', () => {
  it('leaves the relics and the Ancient Tablet in the journal out of the regenerated world', async () => {
    // A shifted save: no world edits, no removed props (save/saveData), the key items kept.
    await session.restore([], []);
    const relics = [...session.liveProps.values()].filter((p) => p.feature?.kind === 'relic');
    const tablet = [...session.liveProps.values()].find((p) => p.interact === 'relic');
    const byId = (id: string) => relics.find((p) => p.feature!.id === id)!;
    expect(relics.map((p) => p.feature!.id)).toEqual(expect.arrayContaining(['reliquary', 'gallery', 'ember']));
    expect(tablet).toBeDefined();
    const taken = [byId('reliquary').id, byId('ember').id, tablet!.id];
    const journal = new Journal();
    for (const item of ['bearerLens', 'relicEmber', 'ancientTablet']) journal.addKeyItem(item);
    featuresFor(journal).attach([]);
    for (const id of taken) {
      expect(session.liveProps.has(id), id).toBe(false);
      // In removedProps, so the next save keeps them taken.
      expect(session.removedProps.has(id), id).toBe(true);
    }
    // A relic not in the journal is still there to take.
    expect(session.liveProps.has(byId('gallery').id)).toBe(true);
    await session.reset();
  });

  it('removes nothing for an explorer with an empty journal', async () => {
    await session.restore([], []);
    const relics = [...session.liveProps.values()].filter((p) => p.feature?.kind === 'relic' || p.interact === 'relic').map((p) => p.id);
    expect(relics.length).toBeGreaterThan(1);
    featuresFor(new Journal()).attach([]);
    for (const id of relics) expect(session.liveProps.has(id), id).toBe(true);
    await session.reset();
  });
});

describe('a passing light in a mined cell (WorldSession.worldEdits)', () => {
  it('saves as the air it stands in: the cell stays mined on reload, and the light is never saved', async () => {
    await session.reset();
    const w = session.world;
    const anchored = (x: number, y: number, z: number) => [...session.liveProps.values()].some((p) => p.anchor && p.anchor[0] === x && p.anchor[1] === y && p.anchor[2] === z);
    // A generated solid cell under the ledge (nothing hangs from it), and an open cell above it.
    const ledge = session.layout.landmarks.ledge;
    let mined: [number, number, number] | null = null;
    for (let i = 0; i < 8 && !mined; i++) {
      const c: [number, number, number] = [Math.floor(ledge[0]) + i, Math.floor(ledge[1]) - 1, Math.floor(ledge[2])];
      if (SOLID[w.get(...c)] && !anchored(...c) && w.get(c[0], c[1] + 1, c[2]) === B.AIR) mined = c;
    }
    expect(mined, 'a solid cell under the ledge').not.toBeNull();
    const [x, y, z] = mined!;
    const open: [number, number, number] = [x, y + 1, z];
    session.setBlock(x, y, z, B.AIR);
    // The events director's lights (game/events): one passes through the mined cell, one through open air.
    session.setBlock(x, y, z, B.LIGHT_EVENT);
    session.setBlock(...open, B.LIGHT_EVENT_GOLD);
    expect(EVENT_LIGHT[w.get(x, y, z)] && EVENT_LIGHT[w.get(...open)]).toBe(1);
    const edits = session.worldEdits();
    const pairs = new Map<number, number>();
    for (let k = 0; k + 1 < edits.length; k += 2) pairs.set(edits[k], edits[k + 1]);
    expect(pairs.get(w.index(x, y, z))).toBe(B.AIR);
    expect(pairs.has(w.index(...open))).toBe(false);
    for (const id of pairs.values()) expect(EVENT_LIGHT[id]).toBe(0);
    // Continue: the mined cell is open, no light is left.
    await session.restore(edits, [...session.removedProps]);
    expect(w.get(x, y, z)).toBe(B.AIR);
    expect(w.get(...open)).toBe(B.AIR);
    await session.reset();
    expect(SOLID[w.get(x, y, z)]).toBe(1);
  });
});

describe('the climb back out of a pit (gameplay/CacheSpot PitWatch)', () => {
  const DT = 0.25;
  /** Frames of `dt` grounded, off the home field, with a fresh field, until the watch fires. */
  const framesToLift = (pit: PitWatch, max = 100) => {
    for (let k = 1; k <= max; k++) if (pit.update(DT, true, false, true)) return k;
    return -1;
  };

  it('waits CACHE.pitSeconds (2.5 s), and has a line for the toast', () => {
    expect(CACHE.pitSeconds).toBe(2.5);
    expect(en['toast.climbedBack'].length).toBeGreaterThan(0);
  });

  it('does nothing until armed by a long fall', () => {
    const pit = new PitWatch();
    expect(framesToLift(pit)).toBe(-1);
  });

  it('fires once, after 2.5 s grounded off the walk-home field, then disarms', () => {
    const pit = new PitWatch();
    pit.arm();
    expect(framesToLift(pit)).toBe(CACHE.pitSeconds / DT);
    expect(framesToLift(pit)).toBe(-1);
  });

  it('counts only while grounded on a fresh field (a jump or a stale field pauses it)', () => {
    const pit = new PitWatch();
    pit.arm();
    for (let k = 0; k < 8; k++) expect(pit.update(DT, true, false, true)).toBe(false); // 2 s
    expect(pit.update(30, false, false, true)).toBe(false); // airborne
    expect(pit.update(30, true, false, false)).toBe(false); // the field is being rebuilt
    expect(pit.update(-5, true, false, true)).toBe(false); // a bad dt never counts back
    expect(pit.update(DT, true, false, true)).toBe(false); // 2.25 s
    expect(pit.update(DT, true, false, true)).toBe(true); // 2.5 s
  });

  it('stands down on the walk-home field: a long fall onto a ledge with a way home is left alone', () => {
    const pit = new PitWatch();
    pit.arm();
    for (let k = 0; k < 8; k++) pit.update(DT, true, false, true);
    // Mid-air or on the ground, fresh field or not: back on the field, the watch ends.
    expect(pit.update(DT, false, true, false)).toBe(false);
    expect(framesToLift(pit)).toBe(-1);
    pit.arm();
    expect(pit.update(10, true, true, true)).toBe(false);
    expect(framesToLift(pit)).toBe(-1);
  });

  it('disarm (camp) ends the watch; arming again starts the count over', () => {
    const pit = new PitWatch();
    pit.arm();
    for (let k = 0; k < 8; k++) pit.update(DT, true, false, true);
    pit.disarm();
    expect(framesToLift(pit)).toBe(-1);
    pit.arm();
    for (let k = 0; k < 8; k++) pit.update(DT, true, false, true);
    pit.arm(); // another long fall in the pit
    expect(framesToLift(pit)).toBe(CACHE.pitSeconds / DT);
  });
});
