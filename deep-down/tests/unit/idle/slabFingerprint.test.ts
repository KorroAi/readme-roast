import { describe, expect, it } from 'vitest';
import { generateSlab } from '../../../src/world/descent/slab';
import { fingerprintSlab } from '../../../src/world/descent/fingerprint';

/** Fixed shaft kinds (independent of the model's row table, which its owner tunes): rock with an ore every
 *  5th cell and a chest in the centre every 25 rows. */
function fixedKinds(k: number): Uint8Array {
  const out = new Uint8Array(16 * 7);
  for (let r = 0; r < 16; r++) for (let c = 0; c < 7; c++) out[r * 7 + c] = (k * 16 + r) % 25 === 24 && c === 3 ? 7 : (r * 7 + c) % 5 === 0 ? 2 : 1;
  return out;
}

/**
 * The slab generator's output is pinned (replaces genVersion.test.ts): a change to what a run's world looks
 * like must be deliberate. When the generator changes on purpose, update the pins below in the same change.
 * The shaft kinds are fixed here; the pins still depend on the biome ladder and the model's breakthrough rows
 * (src/idle/config/biomes.ts, src/idle/model/shaft.ts), which the slab generator reads.
 */
const PINS: Record<number, number> = { 0: 1245615803, 1: 2858774509, 2: 1871048694, 5: 1108612413, 9: 3878239221, 15: 3329501831, 25: 586711926 };

describe('slab fingerprint', () => {
  it('matches the pinned slabs of run seed 7', () => {
    for (const [k, pin] of Object.entries(PINS)) expect(fingerprintSlab(generateSlab({ runSeed: 7, k: Number(k), kinds: fixedKinds(Number(k)) })), `slab ${k}`).toBe(pin);
  });
});
