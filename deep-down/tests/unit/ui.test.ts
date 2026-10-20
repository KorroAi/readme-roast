import { describe, expect, it } from 'vitest';
import { Big } from '../../src/core/big';
import { t } from '../../src/i18n';
import type { CardView } from '../../src/idle/model/run';
import { escalation, numberSize, tokensFor } from '../../src/game/fx/juice';
import { formatRelativeTime } from '../../src/ui/format';
import { hasLintelGlyph, layoutLintel, LINTEL_H, LINTEL_REQUIRED, LINTEL_SPACE } from '../../src/ui/brand/strokeFont';
import { lanternPosition, wordmarkLayout } from '../../src/ui/brand/wordmark';
import { rollStep, scriptedMs } from '../../src/ui/fx/Ticker';
import { cardFill, cardState, pipArcs } from '../../src/ui/idle/Card';
import { rulerY } from '../../src/ui/idle/DepthRuler';
import { hudLayout } from '../../src/ui/idle/layout';
import { SPECIMENS, scaleNearest, specimenRaster, sprite } from '../../src/ui/sprites';

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

describe('the portrait HUD layout (SPEC §9.1–§9.2)', () => {
  const views: Array<[number, number, number, number]> = [
    [360, 740, 24, 16],
    [390, 844, 47, 34],
    [412, 915, 40, 24],
  ];
  it('matches the 390 × 844 table: goal bar 125–173 (48 px for U1; the table says 44), world region 177–610, quick-buy 674, tabs 754', () => {
    const l = hudLayout(390, 844, 47, 34);
    expect(l.goal.y).toBe(125);
    expect(l.goal.y + l.goal.h).toBe(173);
    expect(l.region.top).toBe(177);
    expect(l.region.bottom).toBe(610);
    expect(l.skill.y).toBe(614);
    expect(l.quick[0].y).toBe(674);
    expect(l.tabs.y).toBe(754);
    expect(l.quick.map((r) => r.w)).toEqual([119, 119, 119]);
  });

  it('never overlaps the bands, keeps the column inside the screen and the controls under the thumb', () => {
    for (const [w, hgt, st, sb] of views) {
      for (const large of [false, true]) {
        const l = hudLayout(w, hgt, st, sb, large);
        expect(l.gold.y + l.gold.h, `${w}x${hgt}`).toBeLessThanOrEqual(l.goal.y);
        expect(l.goal.y + l.goal.h).toBeLessThan(l.region.top);
        expect(l.region.bottom).toBeLessThan(l.skill.y);
        expect(l.skill.y + l.skill.h).toBeLessThan(l.quick[0].y);
        expect(l.quick[0].y + l.quick[0].h).toBeLessThan(l.tabs.y);
        expect(l.tabs.y + l.tabs.h).toBeLessThanOrEqual(hgt - sb);
        // U4: every control except the top plates, the goal bar and the menu sits in the bottom 45 %.
        for (const r of [l.skill, ...l.quick, l.tabs]) expect(r.y, `${w}x${hgt}`).toBeGreaterThanOrEqual(hgt * 0.55);
        // U1: targets of at least 48 px (cards, tabs; the menu has a 48 px hit area).
        for (const r of l.quick) expect(Math.min(r.w, r.h)).toBeGreaterThanOrEqual(48);
        expect(l.goal.h).toBeGreaterThanOrEqual(48);
        expect(Math.min(l.menu.w, l.menu.h)).toBeGreaterThanOrEqual(48);
        // The world region keeps at least 5 m of dig view at 44 px per metre.
        expect(l.region.bottom - l.region.top).toBeGreaterThan(5 * 44);
        for (const r of [l.gold, l.depth, l.menu, l.goal, ...l.quick]) {
          expect(r.x).toBeGreaterThanOrEqual(0);
          expect(r.x + r.w).toBeLessThanOrEqual(w + 1);
        }
      }
    }
  });

  it('centres a 9:19.5 column on a tablet', () => {
    const l = hudLayout(1024, 768, 0, 0);
    expect(l.column.w).toBeGreaterThanOrEqual(360);
    expect(l.column.x).toBeGreaterThan(0);
    expect(l.column.x * 2 + l.column.w).toBe(1024);
  });
});

describe('rolling counters (SPEC §10.6)', () => {
  it('approach the target in log space and never change by more than ×1.5 a frame', () => {
    let shown = 2; // 100
    const target = 6; // 1e6
    for (let i = 0; i < 400 && shown !== target; i++) {
      const next = rollStep(shown, target, 1 / 60);
      expect(next - shown).toBeLessThanOrEqual(Math.log10(1.5) + 1e-12);
      expect(next).toBeGreaterThanOrEqual(shown);
      shown = next;
    }
    expect(shown).toBe(target);
  });
  it('roll down when spending, and down to zero without a jump', () => {
    let shown = 3;
    for (let i = 0; i < 45; i++) shown = rollStep(shown, 2, 1 / 60);
    expect(shown).toBe(2);
    let z = 0.5;
    const steps: number[] = [];
    for (let i = 0; i < 10 && Number.isFinite(z); i++) {
      z = rollStep(z, -Infinity, 1 / 60);
      steps.push(z);
    }
    expect(z).toBe(-Infinity);
  });
  it('time a scripted count as clamp(500 + 220·log10(T/D), 500, 2000)', () => {
    expect(scriptedMs(2, 3)).toBe(720);
    expect(scriptedMs(2, 2.5)).toBe(610);
    expect(scriptedMs(0, 100)).toBe(2000);
    expect(scriptedMs(5, 5)).toBe(500);
  });
});

describe('card states (SPEC §10.7)', () => {
  const view = (o: Partial<CardView> = {}): CardView => ({
    id: 'crew:0', kind: 'crew', nameKey: '', nameParams: {}, descKey: '', descParams: {}, level: 3, levels: 1, maxed: false, locked: false,
    unlockDepth: 0, cost: Big.from(100), costLog10: 2, affordable: false, delta: 0.2, after: Big.from(10), unit: 'dps',
    pips: { filled: 3, total: 10 }, next: { kind: 'star', level: 10 }, best: false, payback: 10, fresh: false, ...o,
  });
  it('reads the shown gold, not the actual: ready the moment the coin lands', () => {
    expect(cardState(view(), Math.log10(99))).toBe('poor');
    expect(cardState(view(), 2)).toBe('ready');
    expect(cardState(view({ best: true }), Math.log10(86))).toBe('near');
    expect(cardState(view(), Math.log10(86))).toBe('poor');
    expect(cardState(view({ locked: true }), 9)).toBe('locked');
    expect(cardState(view({ maxed: true }), 9)).toBe('maxed');
    expect(cardState(null, 9)).toBe('hidden');
  });
  it('fills as shown gold over cost', () => {
    expect(cardFill(view(), 1)).toBeCloseTo(0.1, 9);
    expect(cardFill(view(), 3)).toBe(1);
    expect(cardFill(view(), -Infinity)).toBe(0);
    expect(cardFill(view({ locked: true }), 3)).toBe(0);
  });
  it('draws 10 pips for a line and 25 for the pick in 5 groups', () => {
    expect(pipArcs(10)).toHaveLength(10);
    expect(pipArcs(25)).toHaveLength(25);
    for (const d of pipArcs(25)) expect(d).toMatch(/^M [\d.]+ [\d.]+ A 20 20 0 0 1 [\d.]+ [\d.]+$/);
  });
});

describe('juice sizing (SPEC §10.5–§10.6)', () => {
  it('launches 1–6 tokens a break by value over the median', () => {
    expect(tokensFor(2, 2)).toBe(2);
    expect(tokensFor(1, 2)).toBe(1);
    expect(tokensFor(2 + Math.log10(4), 2)).toBe(4);
    expect(tokensFor(9, 2)).toBe(6);
  });
  it('grows numbers 4 px a decade over the median, capped (crits ×1.35)', () => {
    expect(numberSize(2, 2, false)).toBe(18);
    expect(numberSize(4, 2, false)).toBe(26);
    expect(numberSize(20, 2, false)).toBe(38);
    expect(numberSize(20, 2, true)).toBe(48);
    expect(numberSize(2, 2, true)).toBeCloseTo(24.3, 6);
  });
  it('escalates by the cells a tap broke (E0–E4)', () => {
    expect(escalation(0, false)).toBe(0);
    expect(escalation(1, false)).toBe(1);
    expect(escalation(3, false)).toBe(2);
    expect(escalation(5, false)).toBe(3);
    expect(escalation(9, false)).toBe(4);
    expect(escalation(2, true)).toBe(4);
  });
});

describe('the Depth Ruler scale', () => {
  it('puts the floor on its notch, 10 m above at the top and 80 m below at the bottom, monotone', () => {
    const top = 181;
    const bottom = 606;
    const floorY = 400;
    expect(rulerY(50, 50, floorY, top, bottom)).toBe(floorY);
    expect(rulerY(40, 50, floorY, top, bottom)).toBeCloseTo(top, 9);
    expect(rulerY(130, 50, floorY, top, bottom)).toBeCloseTo(bottom, 9);
    let prev = -Infinity;
    for (let d = 40; d <= 130; d += 0.5) {
      const y = rulerY(d, 50, floorY, top, bottom);
      expect(y).toBeGreaterThan(prev);
      prev = y;
    }
    // The next 10 m get more room than the 10 m after 60 m.
    expect(rulerY(60, 50, floorY, top, bottom) - floorY).toBeGreaterThan(rulerY(130, 50, floorY, top, bottom) - rulerY(120, 50, floorY, top, bottom));
  });
});

describe('specimen rasters', () => {
  it('draws every specimen as a shape (not empty, not a square), and a pebble for ids without art', () => {
    const seen = new Set<string>();
    for (const id of [...Object.keys(SPECIMENS), 'tin']) {
      const r = specimenRaster(id, 32);
      expect(r.size).toBe(32);
      let opaque = 0;
      for (let i = 3; i < r.data.length; i += 4) if (r.data[i] > 0) opaque++;
      expect(opaque / (32 * 32), id).toBeGreaterThan(0.15);
      expect(opaque / (32 * 32), id).toBeLessThan(0.92);
      expect(r.data[3], `${id} corner`).toBe(0);
      seen.add(Array.from(r.data).join(','));
    }
    expect(seen.size).toBeGreaterThanOrEqual(8);
    for (const def of Object.values(SPECIMENS)) for (const row of def.rows) expect(row.length).toBe(16);
  });

  it('builds sprites from ASCII rows and scales them crisply', () => {
    const s = sprite(['ab', 'ba'], { a: 0xff0000, b: 0x0000ff });
    expect(s.size).toBe(2);
    const big = scaleNearest(s, 8);
    expect([...big.data.slice(0, 4)]).toEqual([255, 0, 0, 255]);
    expect([...big.data.slice(3 * 4, 3 * 4 + 4)]).toEqual([255, 0, 0, 255]);
    expect([...big.data.slice(4 * 4, 4 * 4 + 4)]).toEqual([0, 0, 255, 255]);
  });
});

import { tr } from '../../src/ui/idle/Card';

describe('model texts (tr)', () => {
  it('reads a parameter that names a key as its text, and shows nothing for a missing key', () => {
    const s = tr('idle.goal.seal', { warden: 'idle.warden.haldenHatch', m: 28 });
    expect(s).toContain('Halden Hatch');
    expect(s).not.toContain('idle.');
    expect(tr('idle.no.such.key')).toBe('');
    // A plain string parameter stays as it is.
    expect(tr('idle.goal.seal', { warden: 'the old gate', m: 3 })).toContain('the old gate');
  });
});
