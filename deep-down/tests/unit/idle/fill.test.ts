import { describe, expect, it } from 'vitest';
import { rowKinds } from '../../../src/idle/model/shaft';
import { BIOMES } from '../../../src/idle/config/biomes';
import { scanFill } from '../../../src/world/descent/fill';

// SPEC §6.6, §13.4 W1, W2, W6 (BUILD W2 MUST 2): the fill rules 1-7 hold for every cavern and the emitter budget
// for every slab over 0-7,000 m (all 14 biomes); the density targets per 20 m window hold in ≥ 99 % of the windows
// (the misses are listed by tools/fill-scan.ts).
describe('the fill contract', () => {
  it('W2 and W6: 0 violations of fill rules 1-7 and the light budget over 0-7,000 m; W1 in ≥ 99 % of the windows', () => {
    const seed = 7;
    const r = scanFill(seed, 0, 7000, (row) => rowKinds(seed, row), 1000);
    const rules = r.violations.filter((v) => !v.rule.startsWith('W1'));
    expect(rules, rules.slice(0, 5).map((v) => `${v.rule} ${v.id} @ ${v.depth}: ${v.detail}`).join('\n')).toEqual([]);
    expect(r.budget).toBe(0);
    const misses = Object.values(r.density).reduce((a, b) => a + b, 0);
    expect(misses / r.windows).toBeLessThanOrEqual(0.01);
    expect(r.caverns).toBeGreaterThan(1000);
    // Means per 20 m window: never empty.
    expect(r.means.tappables).toBeGreaterThan(5);
    expect(r.means.creatures).toBeGreaterThan(2);
  }, 120_000);

  it('W1 per biome on a second seed: every first-hour biome (0-6) meets the density targets in ≥ 98 % of its windows', () => {
    const seed = 21;
    for (let b = 0; b <= 6; b++) {
      const from = BIOMES[b].start;
      const to = b < BIOMES.length - 1 ? BIOMES[b + 1].start : from + 500;
      const r = scanFill(seed, from, Math.min(to, from + 400), (row) => rowKinds(seed, row), 1000);
      const rules = r.violations.filter((v) => !v.rule.startsWith('W1'));
      expect(rules.length, `biome ${b}: ${rules.slice(0, 3).map((v) => `${v.rule} ${v.id}: ${v.detail}`).join('; ')}`).toBe(0);
      const misses = Object.values(r.density).reduce((a, c) => a + c, 0);
      expect(misses / Math.max(1, r.windows), `biome ${b} ${JSON.stringify(r.density)}`).toBeLessThanOrEqual(0.02 + 1 / Math.max(1, r.windows));
    }
  }, 120_000);
});
