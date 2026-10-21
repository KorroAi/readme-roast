import { describe, expect, it } from 'vitest';
import { COLD, PLAYER } from '../../src/config/balance';
import { Cold, type ColdInput } from '../../src/gameplay/Cold';
import { Health } from '../../src/gameplay/Health';

const DARK: ColdInput = { lit: false, atCamp: false, immune: false, factor: 1 };
const DT = 1 / 60;

/** Step the cold in the dark from the moment the flame dies; returns damage and tick times. */
function run(seconds: number, input: ColdInput = DARK, health?: Health) {
  const cold = new Cold();
  let t = 0;
  let total = 0;
  let firstDamageAt = -1;
  let deadAt = -1;
  const ticks: number[] = [];
  const steps = Math.round(seconds / DT);
  for (let i = 0; i < steps; i++) {
    t = (i + 1) * DT;
    const r = cold.update(DT, input);
    if (r.damage > 0 && firstDamageAt < 0) firstDamageAt = t;
    total += r.damage;
    if (r.tick) ticks.push(t);
    if (health) {
      health.damage(r.damage);
      if (health.dead && deadAt < 0) deadAt = t;
    }
  }
  return { total, firstDamageAt, deadAt, ticks, cold };
}

describe('Cold', () => {
  it('bites first exactly 8 s after the flame dies', () => {
    const r = run(20);
    // No damage through the grace: the first damaging step is the one that ends just after 8 s.
    expect(r.firstDamageAt).toBeGreaterThan(COLD.graceSeconds);
    expect(r.firstDamageAt).toBeLessThanOrEqual(COLD.graceSeconds + DT + 1e-9);
    expect(run(COLD.graceSeconds).total).toBe(0);
  });

  it('takes 10 hp every 5 s once it bites', () => {
    const r = run(COLD.graceSeconds + 5 * 4);
    expect(r.total).toBeCloseTo(40, 6);
    // One tick (the heartbeat moment) per full interval of cold.
    expect(r.ticks.length).toBe(4);
    r.ticks.forEach((at, i) => expect(at).toBeCloseTo(COLD.graceSeconds + 5 * (i + 1), 1));
  });

  it('blacks out a healthy explorer 58 s after the flame dies', () => {
    const r = run(70, DARK, new Health(PLAYER.maxHealth));
    expect(r.deadAt).toBeGreaterThan(58 - DT - 1e-6);
    expect(r.deadAt).toBeLessThanOrEqual(58 + DT + 1e-6);
  });

  it('with the Miner’s Coat (140 hp, half damage) the black-out comes at 148 s', () => {
    const r = run(160, { ...DARK, factor: COLD.coatFactor }, new Health(140));
    expect(r.deadAt).toBeGreaterThan(148 - DT - 1e-6);
    expect(r.deadAt).toBeLessThanOrEqual(148 + DT + 1e-6);
    expect(run(COLD.graceSeconds + 5, { ...DARK, factor: COLD.coatFactor }).total).toBeCloseTo(5, 6);
  });

  it('never hurts while lit, at camp, or with the Attuned Lantern', () => {
    expect(run(120, { ...DARK, lit: true }).total).toBe(0);
    expect(run(120, { ...DARK, atCamp: true }).total).toBe(0);
    expect(run(120, { ...DARK, immune: true }).total).toBe(0);
  });

  it('lets go when the light returns, and the grace starts over', () => {
    const cold = new Cold();
    for (let t = 0; t < 12; t += DT) cold.update(DT, DARK);
    expect(cold.biting).toBe(true);
    expect(cold.level).toBe(1);
    cold.update(DT, { ...DARK, lit: true });
    expect(cold.darkSeconds).toBe(0);
    expect(cold.level).toBe(0);
    let hurt = 0;
    for (let t = 0; t < COLD.graceSeconds - 0.1; t += DT) hurt += cold.update(DT, DARK).damage;
    expect(hurt).toBe(0);
  });

  it('frost creeps in over the grace', () => {
    const cold = new Cold();
    for (let t = 0; t < COLD.graceSeconds / 2; t += DT) cold.update(DT, DARK);
    expect(cold.level).toBeGreaterThan(0.4);
    expect(cold.level).toBeLessThan(0.6);
  });

  it('ignores bad time steps', () => {
    const cold = new Cold();
    expect(cold.update(Number.NaN, DARK).damage).toBe(0);
    expect(cold.update(-5, DARK).damage).toBe(0);
    expect(cold.darkSeconds).toBe(0);
  });
});
