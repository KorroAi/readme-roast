import { beforeAll, describe, expect, it } from 'vitest';
import { WORLD } from '../../src/config/balance';
import { generateWorld } from '../../src/world/gen/generateWorld';
import { worldFingerprint } from '../../src/world/analysis/fingerprint';
import type { WorldLayout } from '../../src/world/gen/types';

/**
 * The world generator's fingerprint for each WORLD.genVersion. Recorded on the round-4 world
 * (lighting and lens committed, ee3c11e). When this test fails, the generated world changed:
 * bump WORLD.genVersion and add the new fingerprint here (saves from the old version then keep
 * everything but their world edits, and wake at camp).
 */
const RECORDED: Record<number, string> = {
  1: '9cbb0a10',
  // Final pass W2 (world variety): the feature pass, the black stone's collision, the living rock.
  2: '865cc3b6',
  // Final pass W3 (tree and runes): camp plots, rune stones and Ironbound niches, Echo crystal,
  // iron for a tier.
  3: 'b30a78bd',
  // Finished game (content): the deep beyond the rift (the Glowroot, the Crystal Choir, the Ember
  // Deep) and the content pass (finds on every stretch of floor, secret alcoves, lanternstone).
  4: 'a3013d11',
  // Polish: focal points (features/focal) in the seal hall, on the black stone's step, at the
  // Glowroot's heart and the Ember hearth; the Choir's dais kerb in dressed stone.
  5: 'a5516cc4',
};

let layout: WorldLayout;

beforeAll(() => {
  layout = generateWorld();
});

describe('world generator version', () => {
  it('the generated world matches the fingerprint recorded for WORLD.genVersion', () => {
    const fp = worldFingerprint(layout);
    expect(RECORDED[WORLD.genVersion], `no fingerprint recorded for genVersion ${WORLD.genVersion}`).toBeDefined();
    expect(fp, `the world changed: bump WORLD.genVersion (now ${WORLD.genVersion}) and record ${fp}`).toBe(RECORDED[WORLD.genVersion]);
  });

  it('one changed block changes the fingerprint', () => {
    const before = worldFingerprint(layout);
    const w = layout.world;
    const i = w.index(80, 60, 80);
    const old = w.blocks[i];
    w.blocks[i] = old === 0 ? 1 : 0;
    const after = worldFingerprint(layout);
    w.blocks[i] = old;
    expect(after).not.toBe(before);
    expect(worldFingerprint(layout)).toBe(before);
  });

  it('a changed prop id changes the fingerprint', () => {
    const before = worldFingerprint(layout);
    const props = layout.props.map((p, k) => (k === 3 ? { ...p, id: p.id + 'x' } : p));
    expect(worldFingerprint({ world: layout.world, props })).not.toBe(before);
  });
});
