import { describe, expect, it } from 'vitest';
import { t } from '../../src/i18n';
import { formatRelativeTime } from '../../src/ui/format';
import { hasLintelGlyph, layoutLintel, LINTEL_H, LINTEL_REQUIRED, LINTEL_SPACE } from '../../src/ui/brand/strokeFont';
import { lanternPosition, wordmarkLayout } from '../../src/ui/brand/wordmark';
import { hybridLayout, plateArea } from '../../src/ui/hybrid/layout';

describe('Lintel face (title and display type)', () => {
  it('has a glyph for every character of the title, the alphabet, the digits and the marks', () => {
    for (const text of ['DEEP DOWN', t('game.title'), t('game.tagline'), 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789', LINTEL_REQUIRED]) {
      for (const ch of text) expect(hasLintelGlyph(ch), `glyph for "${ch}"`).toBe(true);
      expect(layoutLintel(text).missing).toEqual([]);
    }
  });

  it('lays out DEEP DOWN on the 4 x 7 grid: 4-unit letters, a 5-unit W, 1-unit gaps', () => {
    const l = layoutLintel('DEEP DOWN');
    // DEEP = 4 letters x 4 + 3 gaps; the space is 2 with a gap each side; DOWN = 4 + 4 + 5 + 4 + 3 gaps.
    expect(layoutLintel('DEEP').width).toBe(19);
    expect(layoutLintel('DOWN').width).toBe(20);
    expect(LINTEL_SPACE).toBe(2);
    expect(l.width).toBe(19 + 1 + LINTEL_SPACE + 1 + 20);
    expect(l.height).toBe(LINTEL_H);
    for (const g of l.glyphs)
      for (const p of g.glyph.polygons)
        for (const [x, y] of p) {
          expect(x).toBeGreaterThanOrEqual(-1e-9);
          expect(x).toBeLessThanOrEqual(g.glyph.width + 1e-9);
          expect(y).toBeGreaterThanOrEqual(-1e-9);
          expect(y).toBeLessThanOrEqual(LINTEL_H + 1e-9);
        }
  });

  it('puts the lantern-rune O second in DOWN, hanging from its lintel, in both lockups', () => {
    for (const lockup of ['line', 'stack'] as const) {
      const L = wordmarkLayout(lockup);
      const pos = lanternPosition(lockup);
      expect(pos.wordIndex).toBe(1);
      expect(L.words[1].word).toBe('DOWN');
      const down = L.words[1];
      // Between the D and the W: the D ends before the lantern cell, the W starts after it.
      const [d, w] = down.letters.glyphs;
      expect(d.ch).toBe('D');
      expect(w.ch).toBe('W');
      expect(pos.x).toBeGreaterThan(down.x + d.x + d.glyph.width);
      expect(pos.x).toBeLessThan(down.x + w.x);
      // It hangs from the lintel (above the letters) and its ring centre sits within the letter band.
      expect(down.lantern!.hangY).toBeLessThan(down.y);
      expect(pos.y).toBeGreaterThan(down.y + 1);
      expect(pos.y).toBeLessThan(down.y + LINTEL_H - 1);
    }
    expect(lanternPosition('line').x).toBeGreaterThan(wordmarkLayout('line').words[0].x + wordmarkLayout('line').words[0].width);
  });

  it('reports characters it cannot draw instead of failing', () => {
    expect(layoutLintel('A~B').missing).toEqual(['~']);
  });
});

describe('relative time', () => {
  const now = 1_700_000_000_000;
  const min = 60_000;
  it('formats past timestamps in words', () => {
    expect(formatRelativeTime(now, now)).toBe('just now');
    expect(formatRelativeTime(now - 59_000, now)).toBe('just now');
    expect(formatRelativeTime(now - min, now)).toBe('1 minute ago');
    expect(formatRelativeTime(now - 7 * min, now)).toBe('7 minutes ago');
    expect(formatRelativeTime(now - 60 * min, now)).toBe('1 hour ago');
    expect(formatRelativeTime(now - 5 * 60 * min, now)).toBe('5 hours ago');
    expect(formatRelativeTime(now - 24 * 60 * min, now)).toBe('yesterday');
    expect(formatRelativeTime(now - 3 * 24 * 60 * min, now)).toBe('3 days ago');
  });
  it('treats clock skew (future saves) as just now', () => {
    expect(formatRelativeTime(now + 10 * min, now)).toBe('just now');
  });
});

describe('the calm first-person HUD layout (SPEC §3.4, §8.9; E21)', () => {
  const sizes: Array<[number, number, number, number]> = [
    [390, 844, 47, 34],
    [360, 740, 24, 16],
    [412, 915, 32, 24],
    [390, 844, 0, 0],
  ];
  it('matches the 390 × 844 table: row A 47–87, the objective line 91–123, the world 127–742, the cards 746–810', () => {
    const l = hybridLayout(390, 844, 47, 34);
    expect(l.depth.y).toBe(47);
    expect(l.depth.h).toBe(40);
    expect(l.goal.y).toBe(91);
    expect(l.goal.h).toBe(32);
    expect(l.region.top).toBe(127);
    expect(l.cards[0].y).toBe(746);
    expect(l.cards[0].y + l.cards[0].h).toBe(810);
    expect(l.region.bottom).toBe(742);
  });
  for (const [w, h, st, sb] of sizes) {
    it(`${w} × ${h} (insets ${st}/${sb}): plates ≤ 17 % of the screen, no overlap, inside the screen`, () => {
      const l = hybridLayout(w, h, st, sb);
      expect(plateArea(l)).toBeLessThanOrEqual(0.17);
      const rects = [l.depth, l.gold, l.menu, l.goal, l.cards[0], l.cards[1]];
      for (const r of rects) {
        expect(r.x).toBeGreaterThanOrEqual(0);
        expect(r.y).toBeGreaterThanOrEqual(0);
        expect(r.x + r.w).toBeLessThanOrEqual(w);
        expect(r.y + r.h).toBeLessThanOrEqual(h);
      }
      for (let i = 0; i < rects.length; i++)
        for (let j = i + 1; j < rects.length; j++) {
          const a = rects[i];
          const b = rects[j];
          const overlap = a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
          expect(overlap, `plates ${i} and ${j}`).toBe(false);
        }
      // The world region lies between the objective line and the cards; ≥ 70 % of the height is world.
      expect(l.region.top).toBeGreaterThanOrEqual(l.goal.y + l.goal.h);
      expect(l.region.bottom).toBeLessThanOrEqual(l.cards[0].y);
      expect((l.region.bottom - l.region.top) / h).toBeGreaterThan(0.7);
      // ≡ and the cards are ≥ 40 px touch targets; the sheet covers at most the bottom 55 %.
      expect(l.menu.w).toBeGreaterThanOrEqual(38);
      expect(l.cards[0].h).toBeGreaterThanOrEqual(60);
      expect(l.sheetTop / h).toBeGreaterThanOrEqual(0.45);
    });
  }
  it('large text grows the rows and still keeps the plates under 17 % (also on the short 360 × 740 screen)', () => {
    const l = hybridLayout(390, 844, 47, 34, true);
    expect(l.goal.h).toBeGreaterThan(32);
    expect(plateArea(l)).toBeLessThanOrEqual(0.17);
    for (const [w, h] of [[360, 740], [412, 915]] as const) {
      const k = hybridLayout(w, h, 0, 0, true);
      expect(plateArea(k), `${w}×${h}`).toBeLessThanOrEqual(0.17);
      expect(k.goal.h).toBeGreaterThan(hybridLayout(w, h, 0, 0, false).goal.h);
    }
  });
});

describe('the shell reads model text keys (no raw key on screen)', () => {
  it('resolves a parameter that is itself a text key: "Break the Halden Hatch!"', async () => {
    const { tx } = await import('../../src/game/hybrid/text');
    expect(tx('idle.goal.sealFight', { seal: 'idle.mech.haldenHatch' })).toBe('Break the Halden Hatch!');
    expect(tx('idle.goal.seal', { seal: 'idle.mech.haldenHatch', m: 12 })).toBe('Break the Halden Hatch · 12 m');
    // Plain parameters pass through; an unknown key reads as '' (the caller falls back).
    expect(tx('idle.goal.seal', { seal: 'not a key', m: 3 })).toBe('Break the not a key · 3 m');
    expect(tx('no.such.key')).toBe('');
    expect(tx('')).toBe('');
  });
});
