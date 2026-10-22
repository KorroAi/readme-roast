import { describe, expect, it } from 'vitest';
import { EventBus, type GameEvents } from '../../src/core/events';
import type { Game } from '../../src/game/Game';
import { Progression } from '../../src/game/Progression';
import { Equipment } from '../../src/gameplay/Equipment';
import { Journal } from '../../src/gameplay/Journal';
import { replaceCache, type CacheState } from '../../src/gameplay/Expedition';
import type { PropSpec } from '../../src/world/gen/types';

/**
 * Round 3 (LOOP): the pack a black-out leaves lies in one stratum. It is shown, guided to and picked
 * up only there (it used to reappear at the same coordinates in whatever stratum was loaded), and it
 * carries its stratum for the Map (UI).
 */
function standIn(current: number | null) {
  const props = new Map<string, PropSpec>();
  const game = {
    bus: new EventBus<GameEvents>(),
    equipment: new Equipment(),
    journal: new Journal(),
    session: { layout: { props: [] as PropSpec[] }, props: { add: (s: PropSpec) => props.set(s.id, s), remove: (id: string) => props.delete(id), has: (id: string) => props.has(id) } },
    strata: current === null ? null : { current, layout: {} },
    markHalosDirty: () => undefined,
    player: { x: 10, y: 20, z: 30 },
  };
  const p = new Progression(game as unknown as Game);
  return { game, p, props };
}

const cacheAt = (stratum?: number): CacheState => replaceCache(null, { copperOre: 5 }, { x: 10, y: 20, z: 30, depth: 40, ...(stratum !== undefined ? { stratum } : {}) }).cache!;

describe('the black-out pack knows its stratum', () => {
  it('replaceCache keeps the stratum it was given', () => {
    expect(cacheAt(3).stratum).toBe(3);
    expect('stratum' in cacheAt()).toBe(false);
  });

  it('its satchel shows only in its own stratum (always in the old world and for older saves)', () => {
    const here = standIn(3);
    (here.p as unknown as { setCache(c: CacheState | null): void }).setCache(cacheAt(3));
    expect(here.props.size).toBe(1);
    const there = standIn(2);
    (there.p as unknown as { setCache(c: CacheState | null): void }).setCache(cacheAt(3));
    expect(there.props.size).toBe(0);
    const old = standIn(2);
    (old.p as unknown as { setCache(c: CacheState | null): void }).setCache(cacheAt());
    expect(old.props.size).toBe(1);
    const legacy = standIn(null);
    (legacy.p as unknown as { setCache(c: CacheState | null): void }).setCache(cacheAt(3));
    expect(legacy.props.size).toBe(1);
  });
});
