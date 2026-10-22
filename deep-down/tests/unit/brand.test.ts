import { describe, expect, it } from 'vitest';
import { t } from '../../src/i18n';
import { area, bootMarkSvg, emblemBounds, emblemLayers, emblemSvg, lanternLayers } from '../../src/ui/brand/emblem.mjs';
import { buildLintelFont, FU } from '../../src/ui/brand/lintelFont';
import { DURATION, playDuration, REDUCED_MAX_MS } from '../../src/ui/brand/motion';
import { LINTEL_ACCENT, LINTEL_CHARS, LINTEL_H, LINTEL_REQUIRED, layoutLintel, lintelGlyph, signedArea } from '../../src/ui/brand/strokeFont';
import { COLOR, contrast, cssVar, RARITY, resolve, TEXT_PAIRS, type ColorToken } from '../../src/ui/brand/tokens';
import { lanternPosition, wordmarkLayout, wordmarkSvg } from '../../src/ui/brand/wordmark';

// The stylesheets as text (node:fs through a string specifier: the project has no Node types).
const NODE_FS: string = 'node:fs';
const fs = (await import(/* @vite-ignore */ NODE_FS)) as { readFileSync(path: URL, encoding: 'utf8'): string };
const uiCss = fs.readFileSync(new URL('../../src/ui/ui.css', import.meta.url), 'utf8');
const stylesCss = fs.readFileSync(new URL('../../src/ui/styles.css', import.meta.url), 'utf8');

describe('brand tokens', () => {
  it('every text token reads at WCAG AA (4.5:1) on its surface', () => {
    for (const [text, surface, use] of TEXT_PAIRS) {
      const ratio = contrast(resolve(text), resolve(surface));
      expect(ratio, `${text} on ${surface} (${use}): ${ratio.toFixed(2)}`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('matches the measured ratios of the identity spec on the panel (#0c1118)', () => {
    const on = (c: ColorToken | string) => contrast(c.startsWith('#') ? c : COLOR[c as ColorToken], COLOR.slate900);
    const spec: Array<[ColorToken, number]> = [
      ['bone100', 15.4],
      ['bone300', 10.4],
      ['bone500', 5.6],
      ['brass300', 10.1],
      ['rune200', 13.0],
      ['deep300', 8.7],
      ['danger400', 6.8],
      ['verdigris300', 9.6],
    ];
    for (const [token, ratio] of spec) expect(on(token), token).toBeCloseTo(ratio, 0);
    for (const c of Object.values(RARITY)) expect(on(c)).toBeGreaterThanOrEqual(4.5);
  });

  it('ui.css declares exactly the tokens.ts colours on .dd-ui', () => {
    const block = uiCss.slice(uiCss.indexOf('.dd-ui {'), uiCss.indexOf('}', uiCss.indexOf('.dd-ui {')));
    for (const [token, value] of Object.entries(COLOR) as Array<[ColorToken, string]>) {
      const m = block.match(new RegExp(`${cssVar(token)}:\\s*(#[0-9a-f]{6})`, 'i'));
      expect(m?.[1]?.toLowerCase(), `${cssVar(token)} in ui.css`).toBe(value);
    }
  });

  it('has no neon cyan, no backdrop blur and no pill radii in the UI stylesheets', () => {
    for (const [name, css] of [['ui.css', uiCss], ['styles.css', stylesCss]] as const) {
      expect(css.toLowerCase(), name).not.toContain('#5ff0ff');
      expect(css, name).not.toMatch(/backdrop-filter/);
      for (const m of css.matchAll(/border-radius:\s*([^;]+);/g)) {
        const v = m[1].trim();
        // The one listed exception: the joystick base, a round brass bezel (50%).
        if (v === '50%') continue;
        const px = Number.parseFloat(v);
        expect(px, `${name}: border-radius ${v}`).toBeLessThan(11);
      }
    }
    expect([...uiCss.matchAll(/border-radius:\s*50%/g)].length).toBe(1);
  });

  it('never sets text below the 12 px floor', () => {
    for (const [name, css] of [['ui.css', uiCss], ['styles.css', stylesCss]] as const) {
      const sizes = [...css.matchAll(/font-size:\s*(?:calc\()?(\d+(?:\.\d+)?)px/g), ...css.matchAll(/font:\s*\d{3}\s+(?:calc\()?(\d+(?:\.\d+)?)px/g)].map((m) => Number(m[1]));
      expect(sizes.length, name).toBeGreaterThan(0);
      for (const px of sizes) expect(px, name).toBeGreaterThanOrEqual(12);
    }
  });
});

describe('Lintel stroke face', () => {
  it('covers A-Z, 0-9 and the marks, each glyph on the 4 x 7 grid (M and W take 5)', () => {
    for (const ch of LINTEL_REQUIRED) {
      const g = lintelGlyph(ch);
      expect(g, ch).not.toBeNull();
      expect(g!.width, ch).toBeLessThanOrEqual('MW'.includes(ch) ? 5 : 4);
    }
    expect(lintelGlyph('m')).toBe(lintelGlyph('M'));
  });

  it('draws strokes in the eight compass directions only, as same-wound polygons', () => {
    for (const ch of LINTEL_CHARS) {
      const g = lintelGlyph(ch)!;
      for (const line of g.strokes)
        for (let i = 1; i < line.length; i++) {
          const dx = Math.abs(line[i][0] - line[i - 1][0]);
          const dy = Math.abs(line[i][1] - line[i - 1][1]);
          expect(dx === 0 || dy === 0 || Math.abs(dx - dy) < 1e-9, `${ch} segment ${i}`).toBe(true);
        }
      for (const p of g.polygons) expect(signedArea(p), ch).toBeGreaterThan(0);
    }
  });

  it('carves French: the accented capitals (lower case maps to them), accents half a unit clear of the cap', () => {
    for (const ch of 'ÉÈÊËÀÂÇÎÏÔÛÙÜŒ’') {
      expect(lintelGlyph(ch), ch).not.toBeNull();
      expect(lintelGlyph(ch.toLowerCase()), ch.toLowerCase()).toBe(lintelGlyph(ch));
    }
    expect(layoutLintel('Forêt des champignons').missing).toEqual([]);
    const ys = (ch: string) => lintelGlyph(ch)!.polygons.flatMap((p) => p.map(([, y]) => y));
    expect(Math.min(...ys('É'))).toBeCloseTo(-LINTEL_ACCENT);
    // Between the accent and the E's top stroke (0..1) there is a clear band.
    const accent = lintelGlyph('É')!.polygons.filter((p) => Math.max(...p.map(([, y]) => y)) < 0);
    expect(accent.length).toBeGreaterThan(0);
    for (const p of accent) expect(Math.max(...p.map(([, y]) => y))).toBeLessThanOrEqual(-0.5 + 1e-9);
    // The cedilla stays inside the descent (2.4 units under the baseline).
    expect(Math.max(...ys('Ç'))).toBeLessThanOrEqual(LINTEL_H + 2.4);
  });

  it('keeps the 1-unit stroke: a vertical stem is exactly one unit wide', () => {
    const l = lintelGlyph('L')!;
    const xs = l.polygons.flatMap((p) => p.map(([x]) => x)).filter((x) => x < 1.01);
    expect(Math.min(...xs)).toBeCloseTo(0);
    expect(Math.max(...xs)).toBeCloseTo(1);
  });
});

describe('runtime Lintel font', () => {
  const font = buildLintelFont();
  const view = new DataView(font.buffer, font.byteOffset, font.byteLength);
  const tables = new Map<string, { offset: number; length: number; sum: number }>();
  const n = view.getUint16(4);
  for (let i = 0; i < n; i++) {
    const o = 12 + i * 16;
    const tag = String.fromCharCode(...font.slice(o, o + 4));
    tables.set(tag, { sum: view.getUint32(o + 4), offset: view.getUint32(o + 8), length: view.getUint32(o + 12) });
  }
  const sum = (from: number, len: number) => {
    let s = 0;
    for (let i = 0; i < len; i += 4) s = (s + (((font[from + i] << 24) | ((font[from + i + 1] ?? 0) << 16) | ((font[from + i + 2] ?? 0) << 8) | (font[from + i + 3] ?? 0)) >>> 0)) >>> 0;
    return s;
  };

  it('is a TrueType font with every required table and valid checksums', () => {
    expect(view.getUint32(0)).toBe(0x00010000);
    for (const tag of ['OS/2', 'cmap', 'glyf', 'head', 'hhea', 'hmtx', 'loca', 'maxp', 'name', 'post']) expect(tables.has(tag), tag).toBe(true);
    for (const [tag, tb] of tables) if (tag !== 'head') expect(sum(tb.offset, tb.length), tag).toBe(tb.sum);
    const head = tables.get('head')!;
    expect(view.getUint32(head.offset + 12)).toBe(0x5f0f3cf5);
    // The whole-font checksum, with checkSumAdjustment applied, is the magic 0xB1B0AFBA.
    expect(sum(0, font.length)).toBe(0xb1b0afba);
  });

  it('holds a glyph per covered character, a 700-unit cap height and tabular digits', () => {
    const maxp = tables.get('maxp')!;
    const glyphs = view.getUint16(maxp.offset + 4);
    expect(glyphs).toBe(LINTEL_CHARS.length + 2);
    const hmtx = tables.get('hmtx')!;
    const adv = (gid: number) => view.getUint16(hmtx.offset + gid * 4);
    const digits = [...'0123456789'].map((d) => adv(LINTEL_CHARS.indexOf(d) + 2));
    expect(new Set(digits).size).toBe(1);
    expect(digits[0]).toBe(5 * FU);
    const headT = tables.get('head')!;
    // yMax: the accents over the capitals; the cap height itself stays 700 (OS/2 sCapHeight).
    expect(view.getInt16(headT.offset + 42)).toBe((LINTEL_H + LINTEL_ACCENT) * FU);
    const os2 = tables.get('OS/2')!;
    expect(view.getInt16(os2.offset + 88)).toBe(LINTEL_H * FU);
  });
});

describe('wordmark', () => {
  it('is an accessible image in every lockup', () => {
    for (const lockup of ['line', 'stack', 'emblem'] as const) {
      const svg = wordmarkSvg(lockup, { id: `t-${lockup}` });
      expect(svg).toContain('role="img"');
      expect(svg).toContain(`aria-label="${t('game.title')}"`);
    }
  });

  it('stays legible from 200 to 520 px wide (letters at least 24 px tall, strokes 3 px)', () => {
    const L = wordmarkLayout('line');
    for (const px of [200, 330, 520]) {
      const k = px / L.width;
      expect(LINTEL_H * k, `${px} px`).toBeGreaterThanOrEqual(24);
      expect(k, `${px} px stroke`).toBeGreaterThanOrEqual(3);
    }
    // The portrait stack at 250 px.
    const S = wordmarkLayout('stack');
    expect(LINTEL_H * (250 / S.width)).toBeGreaterThanOrEqual(50);
  });

  it('lays out the line wider than tall and the stack taller than the line', () => {
    const line = wordmarkLayout('line');
    const stack = wordmarkLayout('stack');
    expect(line.width / line.height).toBeGreaterThan(4);
    expect(stack.height).toBeGreaterThan(line.height * 1.8);
    expect(stack.width).toBeLessThan(line.width * 0.6);
    expect(layoutLintel('DEEP').missing).toEqual([]);
  });

  it('keeps DEEP cold: the warm light is only applied to DOWN', () => {
    const svg = wordmarkSvg('line', { id: 'w' });
    const warm = [...svg.matchAll(/<path class="dd-wm-light" d="([^"]+)" fill="url\(#w-warm\)"/g)].map((m) => m[1]);
    expect(warm.length).toBe(2); // the beam over DOWN and the letters D, W, N
    // Every warm-lit point lies right of where DEEP's lintel ends.
    const deepEnd = wordmarkLayout('line').words[0].x + wordmarkLayout('line').words[0].width + 1.5;
    for (const d of warm) for (const m of d.matchAll(/[ML]([\d.]+) /g)) expect(Number(m[1])).toBeGreaterThan(deepEnd);
    const deep = layoutLintel('DEEP');
    expect(deep.glyphs.length).toBe(4);
    const pos = lanternPosition('line');
    const words = wordmarkLayout('line').words;
    expect(pos.x).toBeGreaterThan(words[1].x);
  });

  it('can carry the optional subtitle line for the title decision', () => {
    const plain = wordmarkLayout('line');
    const sub = wordmarkLayout('line', { subtitle: t('brand.subtitle') });
    expect(sub.subtitle?.text).toBe('LANTERN HOLLOW');
    expect(sub.height).toBeGreaterThan(plain.height);
    expect(sub.subtitle!.width).toBeLessThan(sub.width);
  });
});

describe('emblem', () => {
  it('builds closed, consistently wound shapes', () => {
    for (const l of [...emblemLayers(), ...lanternLayers()]) for (const c of l.contours) expect(Math.abs(area(c)), l.role).toBeGreaterThan(0.01);
    const b = emblemBounds();
    expect(b.x1 - b.x0).toBeGreaterThan(8);
    expect(b.y1 - b.y0).toBeGreaterThan(7);
  });

  it('fits the boot mark in about a kilobyte of inline SVG, with the breathing core', () => {
    const svg = bootMarkSvg();
    expect(svg.length).toBeLessThan(1100);
    expect(svg).toContain('class="dd-boot-core"');
    expect(emblemSvg({ glow: false })).toContain('<svg');
  });
});

describe('motion tokens', () => {
  it('keeps exits shorter than enters, and reduced motion at 150 ms or less', () => {
    expect(DURATION.exit).toBeLessThan(DURATION.medium);
    expect(playDuration(DURATION.long, true)).toBeLessThanOrEqual(REDUCED_MAX_MS);
    expect(playDuration(DURATION.short, false)).toBe(DURATION.short);
  });
});
