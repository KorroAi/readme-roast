import { describe, expect, it } from 'vitest';
import { pickaxeForTier } from '../../src/config/balance';
import { B, BLOCKS, UNBREAKABLE_TIER } from '../../src/config/blocks';
import { Rng } from '../../src/core/rng';
import { MINING, MiningProgress, miningBlockReason, rollDrop, type DropSpec } from '../../src/gameplay/Mining';

const RUSTY = pickaxeForTier(1);
const COPPER = pickaxeForTier(2);

/** Hits needed to break `blockId` with `pick`, or -1 if it never breaks within 100 hits. */
function hitsToBreak(blockId: number, pick = RUSTY): number {
  const m = new MiningProgress();
  const d = BLOCKS[blockId];
  for (let i = 1; i <= 100; i++) {
    const r = m.hit('k', d.hardness, d.tier, pick, d.protectedReason);
    if (r.blocked) return -1;
    if (r.broken) return i;
  }
  return -1;
}

describe('MiningProgress', () => {
  it('accumulates damage and breaks at the block hardness', () => {
    const m = new MiningProgress();
    const slate = BLOCKS[B.COPPER_ORE]; // hardness 4 (round 2: plain slate is no longer minable), rusty power 1
    const r1 = m.hit('1,2,3', slate.hardness, slate.tier, RUSTY);
    expect(r1).toEqual({ progress: 1 / 4, broken: false, blocked: false, reason: null });
    expect(m.progress).toBeCloseTo(1 / 4, 9);
    expect(m.targetKey).toBe('1,2,3');
    m.hit('1,2,3', slate.hardness, slate.tier, RUSTY);
    m.hit('1,2,3', slate.hardness, slate.tier, RUSTY);
    const r3 = m.hit('1,2,3', slate.hardness, slate.tier, RUSTY);
    expect(r3.broken).toBe(true);
    expect(r3.progress).toBe(1);
    // Breaking clears the target so the next block starts fresh.
    expect(m.targetKey).toBeNull();
    expect(m.progress).toBe(0);
  });

  it('breaks on accumulated float damage that only approximates the hardness', () => {
    const m = new MiningProgress();
    const pick = { ...RUSTY, power: 0.1 };
    let hits = 0;
    let broken = false;
    while (!broken && hits < 20) {
      broken = m.hit('a', 1, 1, pick).broken;
      hits++;
    }
    expect(hits).toBe(10);
  });

  it('the copper pickaxe mines measurably faster', () => {
    for (const id of [B.COPPER_ORE, B.CRYSTAL, B.LANTERNSTONE]) {
      expect(hitsToBreak(id, COPPER)).toBeLessThan(hitsToBreak(id, RUSTY));
    }
    expect(hitsToBreak(B.COPPER_ORE, RUSTY)).toBe(4);
    expect(hitsToBreak(B.COPPER_ORE, COPPER)).toBe(3);
    // Rubble and roots go fast with any pick (2 and 1 hits with the rusty one).
    expect(hitsToBreak(B.RUBBLE, RUSTY)).toBe(2);
    expect(hitsToBreak(B.ROOTS, RUSTY)).toBe(1);
    // Round 2: plain rock never yields.
    for (const id of [B.SLATE, B.DEEP_SLATE, B.UMBER, B.SOIL, B.GRAVEL, B.MOSS]) expect(hitsToBreak(id, COPPER)).toBe(-1);
  });

  it('switching target resets progress', () => {
    const m = new MiningProgress();
    m.hit('a', 4, 1, RUSTY);
    m.hit('a', 4, 1, RUSTY);
    expect(m.progress).toBeCloseTo(0.5, 9);
    const r = m.hit('b', 4, 1, RUSTY);
    expect(r.progress).toBeCloseTo(0.25, 9);
    expect(m.targetKey).toBe('b');
  });

  it('blocks blocks above the pickaxe tier until upgraded', () => {
    const iron = BLOCKS[B.IRON_ORE];
    const m = new MiningProgress();
    const r = m.hit('iron', iron.hardness, iron.tier, RUSTY);
    expect(r).toEqual({ progress: 0, broken: false, blocked: true, reason: 'tier' });
    expect(hitsToBreak(B.HARDENED_SLATE, RUSTY)).toBe(-1);
    expect(hitsToBreak(B.IRON_ORE, COPPER)).toBeGreaterThan(0);
    expect(hitsToBreak(B.HARDENED_SLATE, COPPER)).toBeGreaterThan(0);
  });

  it('unbreakable and protected blocks are blocked with their reason', () => {
    const m = new MiningProgress();
    const brick = BLOCKS[B.ANCIENT_BRICK];
    const plank = BLOCKS[B.PLANK];
    expect(m.hit('b', brick.hardness, brick.tier, COPPER, brick.protectedReason).reason).toBe('unbreakable');
    expect(m.hit('p', plank.hardness, plank.tier, COPPER, plank.protectedReason).reason).toBe('protected');
    // Without a protectedReason, the unbreakable tier alone still blocks.
    expect(m.hit('x', 999, UNBREAKABLE_TIER, { ...COPPER, tier: 500 }).reason).toBe('unbreakable');
    expect(hitsToBreak(B.BEDROCK, COPPER)).toBe(-1);
  });

  it('a blocked hit does not damage', () => {
    const m = new MiningProgress();
    for (let i = 0; i < 10; i++) m.hit('h', 7, 2, RUSTY);
    expect(m.progress).toBe(0);
  });

  it('damage holds briefly, then decays back to 0 by 1.5 s without hits', () => {
    const m = new MiningProgress();
    m.hit('a', 4, 1, RUSTY);
    m.hit('a', 4, 1, RUSTY);
    m.update(MINING.holdSeconds - 0.01);
    expect(m.progress).toBeCloseTo(0.5, 9);
    m.update(0.25); // 0.24 s into the fade at a full bar per 0.5 s
    expect(m.progress).toBeLessThan(0.5);
    expect(m.progress).toBeGreaterThan(0);
    m.update(0.3); // total idle 1.54 s
    expect(m.progress).toBe(0);
    expect(m.targetKey).toBeNull();
  });

  it('reaches exactly 0 at 1.5 s idle even in small frame steps', () => {
    const m = new MiningProgress();
    m.hit('a', 10, 1, RUSTY);
    for (let i = 0; i < 89; i++) m.update(1 / 60); // 1.483 s
    expect(m.targetKey).toBe('a');
    for (let i = 0; i < 2; i++) m.update(1 / 60); // 1.517 s
    expect(m.progress).toBe(0);
    expect(m.targetKey).toBeNull();
    expect(MINING.holdSeconds + MINING.fadeSeconds).toBe(1.5);
  });

  it('a hit restarts the hold timer', () => {
    const m = new MiningProgress();
    m.hit('a', 10, 1, RUSTY);
    for (let i = 0; i < 10; i++) {
      m.update(0.42);
      m.hit('a', 100, 1, { ...RUSTY, power: 0 });
    }
    expect(m.progress).toBeGreaterThan(0);
    expect(m.targetKey).toBe('a');
  });

  it('zero hardness breaks on the first hit', () => {
    expect(new MiningProgress().hit('air', 0, 0, RUSTY).broken).toBe(true);
  });

  it('miningBlockReason covers each case', () => {
    expect(miningBlockReason(1, 1)).toBeNull();
    expect(miningBlockReason(2, 1)).toBe('tier');
    expect(miningBlockReason(2, 2)).toBeNull();
    expect(miningBlockReason(UNBREAKABLE_TIER, 2)).toBe('unbreakable');
    expect(miningBlockReason(1, 2, 'protected')).toBe('protected');
  });
});

describe('rollDrop', () => {
  const copper: DropSpec = { item: 'copperOre', min: 1, max: 2, chance: 1 };

  it('is deterministic for the same seed', () => {
    const a = new Rng(42);
    const b = new Rng(42);
    const ra = Array.from({ length: 50 }, () => rollDrop(copper, a));
    const rb = Array.from({ length: 50 }, () => rollDrop(copper, b));
    expect(ra).toEqual(rb);
  });

  it('stays within [min, max] and hits both ends', () => {
    const rng = new Rng(7);
    const seen = new Set<number>();
    for (let i = 0; i < 400; i++) {
      const n = rollDrop(copper, rng);
      expect(n).toBeGreaterThanOrEqual(1);
      expect(n).toBeLessThanOrEqual(2);
      seen.add(n);
    }
    expect([...seen].sort()).toEqual([1, 2]);
  });

  it('respects the drop chance', () => {
    const rng = new Rng(99);
    const gravel = { item: 'stone' as const, min: 1, max: 1, chance: 0.5 }; // 50% stone
    let drops = 0;
    const N = 4000;
    for (let i = 0; i < N; i++) drops += rollDrop(gravel, rng) > 0 ? 1 : 0;
    expect(drops / N).toBeGreaterThan(0.45);
    expect(drops / N).toBeLessThan(0.55);
    expect(rollDrop({ item: 'stone', min: 1, max: 1, chance: 0 }, rng)).toBe(0);
  });

  it('always consumes exactly two draws, whatever the outcome', () => {
    const rng = new Rng(5);
    const ref = new Rng(5);
    rollDrop({ item: 'stone', min: 1, max: 1, chance: 0 }, rng);
    rollDrop(copper, rng);
    for (let i = 0; i < 4; i++) ref.next();
    expect(rng.next()).toBe(ref.next());
  });

  it('handles no drop and swapped bounds', () => {
    const rng = new Rng(1);
    expect(rollDrop(null, rng)).toBe(0);
    for (let i = 0; i < 50; i++) {
      const n = rollDrop({ item: 'stone', min: 3, max: 1, chance: 1 }, rng);
      expect(n).toBeGreaterThanOrEqual(1);
      expect(n).toBeLessThanOrEqual(3);
    }
  });

  it('every block drop spec in the config yields counts within its bounds', () => {
    const rng = new Rng(3);
    for (const d of BLOCKS) {
      if (!d?.drop) continue;
      for (let i = 0; i < 20; i++) {
        const n = rollDrop(d.drop, rng);
        expect(n === 0 || (n >= d.drop.min && n <= d.drop.max)).toBe(true);
      }
    }
  });
});
