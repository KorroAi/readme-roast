import { describe, expect, it } from 'vitest';
import { FLASH, JuiceBudget, TIER_CAPS, TRAUMA_CAP, isRed, type Tier } from '../../../src/game/fx/juiceBudget';

const calm = { breakRate: 1, holding: false, surge: false };

describe('hit-stop rules (SPEC §10.9)', () => {
  it('never stops on T0 or T1, and caps a stop by its tier', () => {
    const b = new JuiceBudget();
    expect(b.requestStop(30, 1, 0, calm)).toBe(0);
    expect(b.requestStop(500, 2, 1000, calm)).toBe(TIER_CAPS[2].hitStop);
    expect(b.timeScale(1010)).toBe(0);
    expect(b.timeScale(1000 + TIER_CAPS[2].hitStop)).toBe(1);
  });

  it('keeps 300 ms between stops, and overlapping stops take the max', () => {
    const b = new JuiceBudget();
    expect(b.requestStop(30, 2, 0, calm)).toBe(30);
    expect(b.requestStop(40, 2, 10, calm)).toBe(40); // overlaps: extends to 50
    expect(b.stopped(45)).toBe(true);
    expect(b.requestStop(30, 2, 100, calm)).toBe(0); // 50 ms after the end
    expect(b.requestStop(30, 2, 351, calm)).toBe(30);
  });

  it('never stops while breaks run at 3/s or more, while holding, or in a Surge', () => {
    const b = new JuiceBudget();
    expect(b.requestStop(30, 2, 0, { ...calm, breakRate: 3 })).toBe(0);
    expect(b.requestStop(30, 2, 0, { ...calm, holding: true })).toBe(0);
    expect(b.requestStop(30, 3, 0, { ...calm, surge: true })).toBe(0);
    // A ceremony keeps its stop.
    expect(b.requestStop(80, 4, 0, { ...calm, breakRate: 9 }, true)).toBe(80);
    expect(b.timeScale(10)).toBeCloseTo(0.05, 6);
  });

  it('a tap ends a stop in that frame', () => {
    const b = new JuiceBudget();
    b.requestStop(120, 4, 0, calm);
    expect(b.stopped(30)).toBe(true);
    b.onPointerDown(30);
    expect(b.stopped(30)).toBe(false);
    expect(b.timeScale(30)).toBe(1);
  });

  it('no stop at all under Reduced or Off motion', () => {
    const b = new JuiceBudget();
    b.motion = 'reduced';
    expect(b.requestStop(120, 4, 0, calm)).toBe(0);
    b.motion = 'off';
    expect(b.requestStop(120, 5, 0, calm)).toBe(0);
  });
});

describe('the flash limiter (F8, L12)', () => {
  it('allows at most 2 full-screen flashes a second, 500 ms apart', () => {
    const b = new JuiceBudget();
    let granted = 0;
    for (let t = 0; t < 1000; t += 50) if (b.requestFlash(0.3, 4, t) > 0) granted++;
    expect(granted).toBe(2);
    expect(b.recentFlashes(999).length).toBeLessThanOrEqual(2);
    // Over 10 s of requests every 16 ms: never more than 2 in any window.
    const c = new JuiceBudget();
    const times: number[] = [];
    for (let t = 0; t < 10_000; t += 16) if (c.requestFlash(0.2, 4, t) > 0) times.push(t);
    for (let i = 2; i < times.length; i++) expect(times[i] - times[i - 2]).toBeGreaterThanOrEqual(1000);
  });

  it('caps the intensity by tier, by setting, and never flashes red', () => {
    const b = new JuiceBudget();
    expect(b.requestFlash(1, 5, 0)).toBe(FLASH.max);
    expect(b.requestFlash(1, 3, 1000)).toBe(TIER_CAPS[3].flash);
    expect(b.requestFlash(1, 2, 2000)).toBe(0);
    expect(b.requestFlash(0.3, 4, 3000, [1, 0.1, 0.05])).toBe(0);
    expect(b.requestFlash(1, 5, 4000, [1, 1, 1], true)).toBe(FLASH.rekindle);
    b.motion = 'reduced';
    expect(b.requestFlash(1, 5, 5000)).toBe(FLASH.reduced);
    b.motion = 'full';
    b.flashes = 'soft';
    expect(b.requestFlash(0.3, 4, 6000)).toBeCloseTo(0.15, 6);
    b.flashes = 'off';
    expect(b.requestFlash(0.3, 4, 7000)).toBe(0);
  });

  it('knows red from amber and white', () => {
    expect(isRed(1, 0.2, 0.1)).toBe(true);
    expect(isRed(1, 0.7, 0.36)).toBe(false); // amber
    expect(isRed(1, 1, 1)).toBe(false);
    expect(isRed(0.55, 0.85, 1)).toBe(false); // rune cyan
  });
});

describe('trauma, kick and tiers', () => {
  it('caps trauma by tier and globally, and scales by the shake setting', () => {
    const b = new JuiceBudget();
    expect(b.trauma(0.9, 2, 0)).toBe(TIER_CAPS[2].trauma);
    expect(b.trauma(0.9, 5, 0)).toBe(TRAUMA_CAP);
    expect(b.trauma(0.9, 5, 0, true)).toBe(0.7);
    expect(b.trauma(0.3, 4, 0.45)).toBeCloseTo(0.05, 9);
    b.shake = 0.5;
    expect(b.trauma(0.2, 3, 0)).toBeCloseTo(0.1, 9);
  });

  it('gives no shake or kick under Reduced motion (the camera at rest)', () => {
    const b = new JuiceBudget();
    b.motion = 'reduced';
    expect(b.trauma(0.3, 3, 0)).toBe(0);
    expect(b.kick(2.9)).toBe(0);
  });

  it('every tier cap grows with the tier (the more frequent, the smaller)', () => {
    const tiers: Tier[] = [1, 2, 3, 4, 5];
    for (let i = 1; i < tiers.length; i++) {
      expect(TIER_CAPS[tiers[i]].maxMs).toBeGreaterThan(TIER_CAPS[tiers[i - 1]].maxMs);
      expect(TIER_CAPS[tiers[i]].trauma).toBeGreaterThan(TIER_CAPS[tiers[i - 1]].trauma);
    }
    // L9: anything faster than 1/s (T1, T2) stays at most 0.25 trauma... T1 adds none.
    expect(TIER_CAPS[1].trauma).toBe(0);
  });

  it('merges T3 bursts inside 1.5 s', () => {
    const b = new JuiceBudget();
    expect(b.admitT3(0)).toBe(0);
    expect(b.admitT3(500)).toBe(1);
    expect(b.admitT3(900)).toBe(2);
    expect(b.admitT3(1600)).toBe(0);
  });

  it('runs one exclusive ceremony at a time and halves particles under it', () => {
    const b = new JuiceBudget();
    expect(b.beginExclusive(1600, 0)).toBe(true);
    expect(b.beginExclusive(1000, 100)).toBe(false);
    expect(b.particles(16, 'balanced', 100)).toBe(8);
    b.endExclusive(400);
    expect(b.beginExclusive(1000, 401)).toBe(true);
  });

  it('damps a repeated cue by 15 % per repeat to at least 50 %', () => {
    const b = new JuiceBudget();
    expect(b.freshness('break', 0)).toBe(1);
    expect(b.freshness('break', 300)).toBeCloseTo(0.85, 9);
    expect(b.freshness('break', 600)).toBeCloseTo(0.7, 9);
    for (let t = 900; t < 3000; t += 300) b.freshness('break', t);
    expect(b.freshness('break', 3100)).toBe(0.5);
    expect(b.freshness('break', 6000)).toBe(1);
  });

  it('scales particles by preset and motion, ≤ 20 per event when motion is Off', () => {
    const b = new JuiceBudget();
    expect(b.particles(16, 'high', 0)).toBe(26);
    expect(b.particles(16, 'battery', 0)).toBe(6);
    b.motion = 'reduced';
    expect(b.particles(100, 'balanced', 0)).toBe(60);
    b.motion = 'off';
    expect(b.particles(400, 'high', 0)).toBeLessThanOrEqual(20);
  });
});
