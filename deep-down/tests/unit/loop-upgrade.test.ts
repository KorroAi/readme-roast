import { describe, expect, it } from 'vitest';
import { PLAYER, WORLD, lanternForTier, packForTier } from '../../src/config/balance';
import { ITEMS, type ItemId } from '../../src/config/items';
import { STARTER_KIT } from '../../src/config/quests';
import { EventBus, type GameEvents } from '../../src/core/events';
import { Loop } from '../../src/game/craft/Loop';
import type { Game } from '../../src/game/Game';
import { Progression } from '../../src/game/Progression';
import { CHANGED_GIFT, freshFromOld } from '../../src/game/StratumFlow';
import { Equipment } from '../../src/gameplay/Equipment';
import { Health } from '../../src/gameplay/Health';
import { Backpack } from '../../src/gameplay/Inventory';
import { Journal } from '../../src/gameplay/Journal';
import { Lantern } from '../../src/gameplay/Lantern';
import { CampStorage } from '../../src/gameplay/Storage';
import { MemoryStore, SAVE_KEYS, SaveSystem, checksum, createNewSave } from '../../src/save/SaveSystem';
import type { SaveData } from '../../src/save/types';
import type { PropSpec } from '../../src/world/gen/types';

/**
 * Round 3 (LOOP, QA 00:55): a 1.x explorer's save, begun anew from the "deep has changed" card, gets
 * the camp's gift once. WORLD's freshFromOld puts CHANGED_GIFT in the new pack; the loop, finding no
 * slice of its own in that save, starts with the tutorial and its starter kit only (it used to add a
 * second gift: 24 torches, 4 oil flasks, 7 bandages).
 */
function storeWith(data: unknown): MemoryStore {
  const json = JSON.stringify(data);
  const s = new MemoryStore();
  s.setItem(SAVE_KEYS.slotA, JSON.stringify({ checksum: checksum(json), json }));
  s.setItem(SAVE_KEYS.active, 'a');
  return s;
}

/** A 1.x (v3) save of the old world: a pack and a camp chest, feats and records earned. */
function v3Save(): Record<string, unknown> {
  const d = createNewSave({ x: 34.5, y: 101, z: 43.2, yaw: 1 }, WORLD.seed, 1_700_000_000_000) as unknown as Record<string, unknown> & SaveData;
  d.version = 3;
  d.playTime = 5400;
  d.backpack[0] = { item: 'copperOre', count: 9 };
  d.storage = { stone: 80 };
  d.progression.feats = ['firstStone', 'firstCopper'];
  return d;
}

/** The parts of the game the progression and the loop read, around a restored pack. */
function gameWith(pack: Backpack) {
  const props = new Map<string, PropSpec>();
  const game = {
    bus: new EventBus<GameEvents>(),
    backpack: pack,
    storage: new CampStorage(),
    equipment: new Equipment(),
    health: new Health(PLAYER.maxHealth),
    lanternFuel: new Lantern(lanternForTier(1).fuelSeconds),
    journal: new Journal(),
    inCamp: true,
    player: { x: 0, y: 10, z: 0 },
    strata: null,
    session: { layout: { props: [] as PropSpec[] }, props: { add: (s: PropSpec) => props.set(s.id, s), remove: (id: string) => props.delete(id), has: (id: string) => props.has(id) } },
    markHalosDirty: () => undefined,
  } as Record<string, unknown>;
  const loop = new Loop(game as never);
  game.loop = loop;
  loop.wire();
  const progression = new Progression(game as unknown as Game);
  return { game, loop, progression };
}

describe('the 1.x explorer\'s gift is given once (QA 00:55)', () => {
  it('a v3 save migrates; Begin gives the camp\'s gift and the tutorial\'s starter kit, each once, with exact counts', () => {
    const d = new SaveSystem(storeWith(v3Save())).load().data!;
    expect(d.changed).toBe(true);
    const fresh = freshFromOld(d);
    expect((fresh.progression as { loop?: unknown }).loop).toBeUndefined();
    // The game restores the new pack from the save, then the progression starts the loop.
    const pack = Backpack.fromJSON(fresh.backpack, packForTier(1).slots);
    const { game, loop, progression } = gameWith(pack);
    progression.fromSave(fresh.progression);
    expect(loop.quests.tutorialDone).toBe(false);
    const want: Partial<Record<ItemId, number>> = {};
    for (const [id, n] of Object.entries(CHANGED_GIFT) as Array<[ItemId, number]>) want[id] = (want[id] ?? 0) + Math.min(n, ITEMS[id].stackSize);
    for (const [id, n] of Object.entries(STARTER_KIT) as Array<[ItemId, number]>) want[id] = (want[id] ?? 0) + n;
    expect((game.backpack as Backpack).totals()).toEqual(want);
    // In numbers: 12 torches, 2 oil flasks, 5 bandages (3 of the gift, 2 of the kit): one gift.
    expect(want).toEqual({ torch: 12, bandage: 5, oilFlask: 2, flare: 2, healingDraught: 1, fungalWood: 3, coal: 2, glowcap: 2 });
    // Nothing of the old world comes along.
    expect((game.backpack as Backpack).count('copperOre')).toBe(0);
  });
});
