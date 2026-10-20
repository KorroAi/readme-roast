// F8 over a 30-minute event stream (BUILD §3.3): every full-screen flash any cue or ceremony asks for goes through the
// photosensitivity limiter: ≤ 2 in any second, ≥ 500 ms apart, ≤ 0.35 (the Rekindle's 0.40 with its ramp), never red.
// The stream mixes the master cue table's flashes with the ceremonies' (pick tier 0.30, chest opens by tier with a
// Lintel chest, seal break 0.35, a biome reveal, charted gates 0.12, a Cataclysm 0.30 and a Rekindle 0.40).
import { describe, expect, it } from 'vitest';
import { FLASH, JuiceBudget, isRed } from '../../../src/game/fx/juiceBudget';
import { CUES } from '../../../src/game/fx/juice';
import { OPEN_FLASH } from '../../../src/game/fx/ceremonies/Chest';

type Req = { t: number; v: number; tier: 3 | 4 | 5; rgb: [number, number, number]; rekindle?: boolean };

function stream(): Req[] {
  const out: Req[] = [];
  let seed = 7;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 4294967296);
  const minutes = 30;
  for (let t = 0; t < minutes * 60_000; t += 250) {
    const r = rnd();
    // Surges and Cataclysms (cue table), chests of every tier, gates, pick tiers.
    if (r < 0.02) out.push({ t, v: CUES.surge.full[0], tier: 3, rgb: [1, 0.85, 0.6] });
    else if (r < 0.025) out.push({ t, v: CUES.cataclysm.full[0], tier: 4, rgb: [1, 1, 1] });
    else if (r < 0.06) out.push({ t, v: OPEN_FLASH[Math.floor(rnd() * 5)], tier: 3, rgb: [0.85, 1, 1] });
    else if (r < 0.07) out.push({ t, v: 0.12, tier: 3, rgb: [1, 1, 1] });
    else if (r < 0.075) out.push({ t, v: 0.3, tier: 4, rgb: [1, 0.96, 0.88] });
    // Bursts: several asks in the same 100 ms (a chest opening during a Surge start).
    if (r > 0.995) for (let k = 0; k < 4; k++) out.push({ t: t + 20 * k, v: 0.35, tier: 4, rgb: [1, 1, 1] });
  }
  // The scripted beats: a Lintel chest, a seal break with its biome reveal, a Rekindle, and a red request.
  out.push({ t: 600_000, v: OPEN_FLASH[4], tier: 4, rgb: [1, 0.9, 0.6] });
  out.push({ t: 900_000, v: 0.35, tier: 4, rgb: [1, 1, 1] });
  out.push({ t: 900_400, v: 0.35, tier: 5, rgb: [0.9, 0.7, 0.6] });
  out.push({ t: 1_200_000, v: 0.4, tier: 5, rgb: [0.85, 0.75, 1], rekindle: true });
  out.push({ t: 1_500_000, v: 0.3, tier: 4, rgb: [1, 0.1, 0.1] });
  return out.sort((a, b) => a.t - b.t);
}

describe('flash budget over 30 minutes (F8)', () => {
  for (const flashes of ['on', 'soft'] as const) {
    it(`flashes ${flashes}: ≤ 2 a second, ≥ 500 ms apart, ≤ 0.35 (Rekindle 0.40), never red`, () => {
      const b = new JuiceBudget();
      b.flashes = flashes;
      const granted: Array<{ t: number; v: number; rgb: [number, number, number] }> = [];
      for (const q of stream()) {
        const v = b.requestFlash(q.v, q.tier, q.t, q.rgb, q.rekindle);
        if (v > 0) granted.push({ t: q.t, v, rgb: q.rgb });
      }
      expect(granted.length).toBeGreaterThan(50);
      for (let i = 0; i < granted.length; i++) {
        const g = granted[i];
        expect(g.v).toBeLessThanOrEqual(g.v > FLASH.max ? FLASH.rekindle : FLASH.max);
        expect(isRed(g.rgb[0], g.rgb[1], g.rgb[2])).toBe(false);
        if (i > 0) expect(g.t - granted[i - 1].t).toBeGreaterThanOrEqual(FLASH.minGap);
        const inSecond = granted.filter((x) => x.t > g.t - 1000 && x.t <= g.t).length;
        expect(inSecond).toBeLessThanOrEqual(FLASH.perSecond);
      }
      // Only the Rekindle may pass 0.35.
      expect(granted.filter((g) => g.v > FLASH.max).length).toBeLessThanOrEqual(1);
    });
  }

  it('Reduced motion caps every flash at 0.15; Off and Flashes Off give none', () => {
    const red = new JuiceBudget();
    red.motion = 'reduced';
    const off = new JuiceBudget();
    off.motion = 'off';
    const noFlash = new JuiceBudget();
    noFlash.flashes = 'off';
    for (const q of stream()) {
      expect(red.requestFlash(q.v, q.tier, q.t, q.rgb, q.rekindle)).toBeLessThanOrEqual(FLASH.reduced);
      expect(off.requestFlash(q.v, q.tier, q.t, q.rgb, q.rekindle)).toBe(0);
      expect(noFlash.requestFlash(q.v, q.tier, q.t, q.rgb, q.rekindle)).toBe(0);
    }
  });
});
