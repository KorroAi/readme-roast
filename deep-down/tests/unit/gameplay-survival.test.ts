import { describe, expect, it } from 'vitest';
import { PLAYER, lanternForTier } from '../../src/config/balance';
import { Health } from '../../src/gameplay/Health';
import { Lantern } from '../../src/gameplay/Lantern';

const OIL = lanternForTier(1); // 300 s
const COPPER = lanternForTier(2); // 600 s

describe('Lantern', () => {
  it('starts full and burns one second per second outside camp', () => {
    const l = new Lantern(OIL.fuelSeconds);
    expect(l.fraction).toBe(1);
    l.update(10, false, OIL);
    expect(l.fuel).toBeCloseTo(OIL.fuelSeconds - 10, 9);
    expect(l.lit).toBe(true);
    expect(l.radiusFactor).toBe(1);
  });

  it('flags becameLow exactly once when crossing the low threshold', () => {
    const lowAt = OIL.fuelSeconds * PLAYER.lanternLowFraction;
    const l = new Lantern(OIL.fuelSeconds, lowAt + 1);
    expect(l.low).toBe(false);
    expect(l.update(0.5, false, OIL).becameLow).toBe(false);
    const e = l.update(1, false, OIL);
    expect(e.becameLow).toBe(true);
    expect(e.becameEmpty).toBe(false);
    expect(l.low).toBe(true);
    expect(l.update(1, false, OIL).becameLow).toBe(false);
  });

  it('flags becameEmpty once and dims to an ember', () => {
    const l = new Lantern(OIL.fuelSeconds, 2);
    expect(l.update(1, false, OIL).becameEmpty).toBe(false);
    expect(l.update(5, false, OIL).becameEmpty).toBe(true);
    expect(l.fuel).toBe(0);
    expect(l.lit).toBe(false);
    expect(l.radiusFactor).toBe(PLAYER.emptyLanternFactor);
    expect(l.update(5, false, OIL).becameEmpty).toBe(false);
  });

  it('reports both edges when one big step crosses low and empty', () => {
    const l = new Lantern(OIL.fuelSeconds);
    const e = l.update(OIL.fuelSeconds + 5, false, OIL);
    expect(e.becameLow).toBe(true);
    expect(e.becameEmpty).toBe(true);
  });

  it('a lantern loaded already low does not re-announce it', () => {
    const l = new Lantern(OIL.fuelSeconds, 5);
    expect(l.update(1, false, OIL).becameLow).toBe(false);
  });

  it('refills at camp and announces it once', () => {
    const l = new Lantern(OIL.fuelSeconds, 0);
    const e = l.update(0.016, true, OIL);
    expect(e.refueled).toBe(true);
    expect(l.fraction).toBe(1);
    expect(l.update(0.016, true, OIL).refueled).toBe(false);
  });

  it('does not burn while at camp, and a full lantern is not "refueled"', () => {
    const l = new Lantern(OIL.fuelSeconds);
    expect(l.update(100, true, OIL).refueled).toBe(false);
    expect(l.fuel).toBe(OIL.fuelSeconds);
  });

  it('re-arms the low warning after a refill', () => {
    const l = new Lantern(OIL.fuelSeconds, 10);
    l.update(0.1, true, OIL);
    expect(l.update(OIL.fuelSeconds * 0.85, false, OIL).becameLow).toBe(true);
  });

  it('reuses the edges object (no per-frame allocation)', () => {
    const l = new Lantern(OIL.fuelSeconds);
    expect(l.update(0.1, false, OIL)).toBe(l.update(0.1, false, OIL));
  });

  it('follows the equipped lantern capacity and refills to the new size', () => {
    const l = new Lantern(OIL.fuelSeconds);
    l.update(0, false, COPPER);
    expect(l.capacity).toBe(COPPER.fuelSeconds);
    expect(l.fraction).toBeCloseTo(0.5, 9);
    expect(l.refill(COPPER)).toBe(true);
    expect(l.fuel).toBe(COPPER.fuelSeconds);
    expect(l.refill()).toBe(false);
  });

  it('clamps loaded fuel and ignores negative time', () => {
    expect(new Lantern(OIL.fuelSeconds, 9999).fuel).toBe(OIL.fuelSeconds);
    expect(new Lantern(OIL.fuelSeconds, -3).fuel).toBe(0);
    expect(new Lantern(OIL.fuelSeconds, Number.NaN).fuel).toBe(OIL.fuelSeconds);
    const l = new Lantern(OIL.fuelSeconds, 50);
    l.update(-10, false, OIL);
    expect(l.fuel).toBe(50);
  });
});

describe('Health', () => {
  it('clamps damage and reports what was dealt', () => {
    const h = new Health(100);
    expect(h.damage(30)).toBe(30);
    expect(h.current).toBe(70);
    expect(h.damage(500)).toBe(70);
    expect(h.current).toBe(0);
    expect(h.dead).toBe(true);
    expect(h.damage(10)).toBe(0);
  });

  it('ignores negative and NaN damage', () => {
    const h = new Health(100);
    expect(h.damage(-20)).toBe(0);
    expect(h.damage(Number.NaN)).toBe(0);
    expect(h.current).toBe(100);
  });

  it('heals up to max and never revives the dead', () => {
    const h = new Health(100, 40);
    expect(h.heal(25)).toBe(25);
    expect(h.heal(1000)).toBe(35);
    expect(h.current).toBe(100);
    expect(h.heal(-5)).toBe(0);
    h.damage(100);
    expect(h.heal(50)).toBe(0);
    expect(h.dead).toBe(true);
  });

  it('clamps the loaded current value', () => {
    expect(new Health(100, 250).current).toBe(100);
    expect(new Health(100, -5).current).toBe(0);
    expect(new Health(100, Number.NaN).current).toBe(100);
    expect(new Health(100, 50).fraction).toBe(0.5);
  });

  it('fall damage is zero up to the safe speed and linear beyond it', () => {
    const safe = PLAYER.safeFallSpeed;
    const k = PLAYER.fallDamagePerSpeed;
    expect(Health.fallDamage(0)).toBe(0);
    expect(Health.fallDamage(safe - 0.01)).toBe(0);
    expect(Health.fallDamage(safe)).toBe(0);
    expect(Health.fallDamage(safe + 1)).toBe(Math.round(k));
    expect(Health.fallDamage(safe + 2.5)).toBe(Math.round(2.5 * k));
    expect(Health.fallDamage(PLAYER.maxFallSpeed)).toBe(Math.round((PLAYER.maxFallSpeed - safe) * k));
    expect(Health.fallDamage(Number.NaN)).toBe(0);
  });

  it('fall damage rounds to whole points', () => {
    const d = Health.fallDamage(PLAYER.safeFallSpeed + 0.3);
    expect(Number.isInteger(d)).toBe(true);
    expect(d).toBe(Math.round(0.3 * PLAYER.fallDamagePerSpeed));
  });
});
