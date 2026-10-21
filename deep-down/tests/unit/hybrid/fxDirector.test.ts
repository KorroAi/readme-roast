// U-FX1–U-FX3 (SPEC §8.7, §13.1): the FX director's counters hold the beat and ceremony caps through a scripted 10-minute
// run; camera motion from FX is 0 except the three allowed shakes; one ceremony at a time, within its length, skippable.
import { describe, expect, it } from 'vitest';
import { Rng } from '../../../src/core/rng';
import { BUDGET, CEREMONIES, CUES, FxDirector } from '../../../src/game/hybrid/FxDirector';

const make = (preset: 'battery' | 'balanced' | 'high' = 'balanced', motion: 'full' | 'reduced' | 'off' = 'full', shake = 1) =>
  new FxDirector({ preset: () => preset, motion: () => motion, shake: () => shake });

describe('U-FX1: the counters never exceed the caps (a scripted 10-minute run)', () => {
  for (const preset of ['battery', 'balanced', 'high'] as const) {
    it(`${preset}: ≤ 3 foreground, ≤ 2 ambient, particles ≤ cap, ≤ 6 % area, ≤ 1 number, ≤ 1 loop`, () => {
      const fx = make(preset);
      const rng = new Rng(9);
      let granted = 0;
      // 10 minutes at 60 fps: taps at up to 8/s, breaks every 1–4 taps, loot, crew bar, motes, hauls, card pings, a
      // ceremony every ~40 s.
      for (let f = 0; f < 36_000; f++) {
        const now = f * (1000 / 60);
        fx.frame(now, null);
        if (rng.next() < 8 / 60) {
          for (const c of ['tool.swing', 'strike.chips']) granted += fx.request(c) ? 1 : 0;
          if (rng.next() < 0.4) for (const c of ['break.shards', 'loot.stream']) granted += fx.request(c) ? 1 : 0;
        }
        if (f % 54 === 0) fx.request('crew.bar');
        if (f % 60 === 0) fx.request('ambient.motes');
        if (f % 360 === 0) fx.request('works.haul');
        if (f % 180 === 0) fx.request('card.ping');
        if (rng.next() < 1 / 2400) fx.ceremonyStart('chest', undefined, () => fx.request('chest.open'));
        const c = fx.counts();
        const cap = fx.caps();
        expect(c.fg).toBeLessThanOrEqual(cap.fg);
        expect(c.ambient).toBeLessThanOrEqual(cap.ambient);
        expect(c.particles).toBeLessThanOrEqual(cap.particles);
        expect(c.area).toBeLessThanOrEqual(cap.area + 1e-9);
        expect(c.number).toBeLessThanOrEqual(1);
        expect(c.loop).toBeLessThanOrEqual(1);
      }
      expect(granted).toBeGreaterThan(1000);
      const scale = BUDGET.preset[preset];
      expect(fx.peak.particles).toBeLessThanOrEqual(Math.floor(BUDGET.ceremony.particles * scale));
      expect(fx.peak.fg).toBeLessThanOrEqual(3);
      expect(fx.peak.ambient).toBeLessThanOrEqual(2);
    });
  }
  it('a cue over budget is refused and counted, never queued', () => {
    const fx = make();
    fx.frame(0, { fg: 3, ambient: 0, particles: 0, shards: 0, area: 0 });
    expect(fx.request('break.shards')).toBe(false);
    expect(fx.refused['break.shards']).toBe(1);
    fx.frame(1000, { fg: 0, ambient: 0, particles: 0, shards: 0, area: 0 });
    expect(fx.request('break.shards')).toBe(true);
  });
  it('ceremony cues (T3+) only inside their ceremony', () => {
    const fx = make();
    fx.frame(0);
    expect(fx.request('chest.open')).toBe(false);
    fx.ceremonyStart('chest');
    expect(fx.request('chest.open')).toBe(true);
  });
  it('taps are T1, breaks T2, T3+ only for a chest, a seal or a reveal', () => {
    expect(CUES['strike.chips'].tier).toBeLessThanOrEqual(1);
    expect(CUES['tool.swing'].tier).toBeLessThanOrEqual(1);
    expect(CUES['break.shards'].tier).toBe(2);
    for (const [k, c] of Object.entries(CUES)) if (c.tier >= 3) expect(['breakthrough.wall', 'chest.open', 'dynamite.blast', 'seal.split', 'reveal.title']).toContain(k);
  });
});

describe('U-FX2: camera motion from FX', () => {
  it('no shake for a strike, a break, a breakthrough or the crew; ≤ 0.4° / 120 ms for a seal, Dynamite, a vault', () => {
    const fx = make();
    for (const c of ['strike', 'break', 'breakthrough', 'crew', 'other'] as const) expect(fx.shake(c)).toBeNull();
    for (const c of ['seal', 'dynamite', 'vault'] as const) {
      const s = fx.shake(c, 3, 900)!;
      expect(s.deg).toBeLessThanOrEqual(0.4);
      expect(s.ms).toBeLessThanOrEqual(120);
    }
    expect(fx.shakes.map((s) => s.cause)).toEqual(['seal', 'dynamite', 'vault']);
  });
  it('the shake slider scales it and reduced motion removes it', () => {
    expect(make('balanced', 'full', 0.5).shake('seal')!.deg).toBeCloseTo(0.2, 6);
    expect(make('balanced', 'full', 0).shake('seal')).toBeNull();
    expect(make('balanced', 'reduced', 1).shake('seal')).toBeNull();
  });
  it('a hit-stop only for a seal or a vault, 50–70 ms; the FX clock stops, nothing else', () => {
    const fx = make();
    fx.frame(1000);
    expect(fx.hitStop('strike')).toBe(0);
    expect(fx.hitStop('breakthrough')).toBe(0);
    expect(fx.hitStop('seal', 200)).toBe(70);
    expect(fx.fxDt(0.016)).toBe(0);
    fx.frame(1080);
    expect(fx.fxDt(0.016)).toBe(0.016);
  });
});

describe('U-FX3: one ceremony at a time, within its length, skippable', () => {
  it('a second ceremony waits for the first; each ends within its §8.7 length', () => {
    const fx = make();
    let t = 0;
    fx.frame(t);
    expect(fx.ceremonyStart('seal')).toBe(true);
    let revealStarted = false;
    expect(fx.ceremonyStart('reveal', 5000, () => (revealStarted = true))).toBe(false);
    for (; t < 10_000; t += 16) {
      fx.frame(t);
      expect(fx.ceremony === '' || fx.ceremony === 'seal' || fx.ceremony === 'reveal').toBe(true);
    }
    expect(revealStarted).toBe(true);
    expect(fx.played.map((p) => p.id)).toEqual(['seal', 'reveal']);
    for (const p of fx.played) expect(p.ms).toBeLessThanOrEqual(CEREMONIES[p.id]);
  });
  it('every ceremony is skippable by a tap', () => {
    for (const id of Object.keys(CEREMONIES)) {
      const fx = make();
      fx.frame(0);
      fx.ceremonyStart(id);
      fx.frame(100);
      expect(fx.skipCeremony()).toBe(true);
      expect(fx.ceremony).toBe('');
      expect(fx.played[0]).toMatchObject({ id, skipped: true });
    }
  });
  it('the lengths are those of SPEC §8.7', () => {
    expect(CEREMONIES.breakthrough).toBeLessThanOrEqual(1200);
    expect(CEREMONIES.chest).toBeLessThanOrEqual(1200);
    expect(CEREMONIES.toolForm).toBeLessThanOrEqual(1200);
    expect(CEREMONIES.seal).toBeLessThanOrEqual(1200);
    expect(CEREMONIES.reveal).toBeLessThanOrEqual(3000);
    expect(CEREMONIES.return).toBeLessThanOrEqual(3000);
    expect(CEREMONIES.star).toBeLessThanOrEqual(600);
  });
});
