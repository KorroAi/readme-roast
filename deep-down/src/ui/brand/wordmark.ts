// The DEEP DOWN wordmark, carved in the Lintel face. Each word hangs from its own headline (a
// lintel with a pendant tick at each end); the O of DOWN is the builders' lantern rune hanging
// from that lintel on its stem: cyan ink, an amber flame inside. Stone letters have a carved
// #04070b outline and a top-left highlight; the flame's warm light reaches D, W and N, and DEEP
// stays cold.
//
// Pure: the lockups are SVG strings (role="img", aria-label) so tests run in Node. Lockups:
// 'line' (landscape, 330-420 px), 'stack' (portrait, 250 px), 'emblem' (lintel + lantern), and an
// optional subtitle line for the title decision (plan §11, trademark).
import { emblemSvg, flameCenter, lanternBottom, lanternHalfWidth, lanternLayers, offset, pathData, PALETTE, ringCenterY, type Layer } from './emblem.mjs';
import { layoutLintel, LINTEL_H, lintelPath, polygonsPath, type LintelLayout, type Polygon } from './strokeFont';

export type Lockup = 'line' | 'stack' | 'emblem';

/** Wordmark proportions, units of the Lintel face. */
export const WM = {
  /** Space between letters (the face's gap, opened up a little for display). */
  tracking: 0.35,
  /** The lintel over each word. */
  lintelThick: 0.95,
  lintelGap: 0.7,
  overhang: 1.5,
  tickWidth: 0.5,
  tickLength: 1.5,
  chamfer: 0.35,
  /** Gap between the two words (line) and between the lines (stack). */
  wordGap: 2.4,
  lineGap: 2.2,
  /** The lantern's cell: its width plus a margin each side. */
  lanternMargin: 0.15,
  /** Carved outline, units (half shows outside the letter). */
  carve: 0.5,
  pad: 0.8,
} as const;

export interface WordLayout {
  word: string;
  x: number;
  y: number;
  /** Letter layout (the lantern O is skipped in it and drawn on its own). */
  letters: LintelLayout;
  width: number;
  /** The lantern rune, when this word holds the O: its centre x and hanging point y. */
  lantern: { x: number; hangY: number } | null;
}

export interface WordmarkLayout {
  lockup: Lockup;
  width: number;
  height: number;
  words: WordLayout[];
  subtitle: { text: string; x: number; y: number; scale: number; width: number } | null;
}

const LANTERN_W = () => lanternHalfWidth() * 2 + WM.lanternMargin * 2;

/** One word: letters on the face's grid, the O of DOWN replaced by a lantern-sized cell. */
function layoutWord(word: string, x: number, y: number): WordLayout {
  const oAt = word === 'DOWN' ? 1 : -1;
  const glyphs: LintelLayout['glyphs'] = [];
  const missing: string[] = [];
  let cx = 0;
  let lantern: WordLayout['lantern'] = null;
  const chars = [...word];
  chars.forEach((ch, i) => {
    if (i > 0) cx += 1 + WM.tracking;
    if (i === oAt) {
      const w = LANTERN_W();
      lantern = { x: x + cx + w / 2, hangY: y - WM.lintelGap };
      cx += w;
      return;
    }
    const one = layoutLintel(ch);
    missing.push(...one.missing);
    for (const g of one.glyphs) glyphs.push({ ...g, x: cx });
    cx += one.width;
  });
  return { word, x, y, letters: { width: cx, height: LINTEL_H, glyphs, missing }, width: cx, lantern };
}

/** Lay out a lockup in units (origin top-left of the padded box). */
export function wordmarkLayout(lockup: Lockup, opts: { subtitle?: string } = {}): WordmarkLayout {
  const top = WM.pad + WM.lintelThick + WM.lintelGap;
  // The lantern hangs from the lintel; if it reaches below the letters, the box grows.
  const descent = Math.max(0, lanternBottom(false) - WM.lintelGap - LINTEL_H) + 0.4;
  const words: WordLayout[] = [];
  let width: number;
  let height: number;
  if (lockup === 'emblem') {
    return { lockup, width: 0, height: 0, words, subtitle: null };
  }
  const deep = layoutWord('DEEP', 0, 0);
  const down = layoutWord('DOWN', 0, 0);
  const left = WM.pad + WM.overhang;
  if (lockup === 'line') {
    words.push(layoutWord('DEEP', left, top));
    const x2 = left + deep.width + WM.overhang * 2 + WM.wordGap;
    words.push(layoutWord('DOWN', x2, top));
    width = x2 + down.width + WM.overhang + WM.pad;
    height = top + LINTEL_H + descent + WM.pad;
  } else {
    const w = Math.max(deep.width, down.width);
    words.push(layoutWord('DEEP', left + (w - deep.width) / 2, top));
    const top2 = top + LINTEL_H + WM.lineGap + WM.lintelThick + WM.lintelGap;
    words.push(layoutWord('DOWN', left + (w - down.width) / 2, top2));
    width = left + w + WM.overhang + WM.pad;
    height = top2 + LINTEL_H + descent + WM.pad;
  }
  let subtitle: WordmarkLayout['subtitle'] = null;
  if (opts.subtitle) {
    const scale = 0.42;
    const sub = layoutLintel(opts.subtitle, { tracking: 0.9 });
    const sw = sub.width * scale;
    const y = height - WM.pad + 0.9;
    subtitle = { text: opts.subtitle, x: (width - sw) / 2, y, scale, width: sw };
    height = y + LINTEL_H * scale + WM.pad;
  }
  return { lockup, width, height, words, subtitle };
}

/** The headline a word hangs from: a beam with a pendant tick at each end. */
export function headlinePolygon(x0: number, x1: number, yBottom: number): Polygon {
  const { lintelThick: T, chamfer: c, tickWidth: tw, tickLength: tl } = WM;
  const c2 = Math.min(c, tw * 0.5);
  const t = yBottom - T;
  return [
    [x0 + c, t],
    [x1 - c, t],
    [x1, t + c],
    [x1, yBottom + tl - c2],
    [x1 - c2, yBottom + tl],
    [x1 - tw, yBottom + tl],
    [x1 - tw, yBottom],
    [x0 + tw, yBottom],
    [x0 + tw, yBottom + tl],
    [x0 + c2, yBottom + tl],
    [x0, yBottom + tl - c2],
    [x0, t + c],
  ];
}

const n2 = (v: number) => String(Math.round(v * 100) / 100);

function paintAttr(l: Layer, defs: string[], id: string): string {
  if (l.paint.solid) return l.paint.solid;
  const [x0, y0, x1, y1, stops] = l.paint.linear!;
  defs.push(
    `<linearGradient id="${id}" x1="${n2(x0)}" y1="${n2(y0)}" x2="${n2(x1)}" y2="${n2(y1)}" gradientUnits="userSpaceOnUse">${stops.map(([o, c]) => `<stop offset="${o}" stop-color="${c}"/>`).join('')}</linearGradient>`,
  );
  return `url(#${id})`;
}

export interface WordmarkOptions {
  /** Rendered width in CSS px (height follows the lockup's aspect). */
  width?: number;
  /** Unique prefix for SVG ids (several wordmarks can share a page). */
  id?: string;
  subtitle?: string;
  label?: string;
  className?: string;
}

/** The wordmark as an SVG string. */
export function wordmarkSvg(lockup: Lockup, o: WordmarkOptions = {}): string {
  const label = o.label ?? 'DEEP DOWN';
  const p = o.id ?? `ddwm-${lockup}`;
  const cls = `dd-wordmark dd-wordmark-${lockup}${o.className ? ` ${o.className}` : ''}`;
  if (lockup === 'emblem') {
    return emblemSvg({ size: o.width ?? 96, idPrefix: p, attrs: ` class="${cls}" role="img" aria-label="${label}"` });
  }
  const L = wordmarkLayout(lockup, { subtitle: o.subtitle });
  const defs: string[] = [];
  const back: string[] = [];
  const lintels: string[] = [];
  const warmBeam: string[] = [];
  const cold: string[] = [];
  const warm: string[] = [];
  const lanterns: string[] = [];
  for (const w of L.words) {
    const yb = w.y - WM.lintelGap;
    const head = headlinePolygon(w.x - WM.overhang, w.x + w.width + WM.overhang, yb);
    lintels.push(polygonsPath([head]));
    if (w.lantern) warmBeam.push(polygonsPath([head]));
    const d = lintelPath(w.letters, 1, w.x, w.y);
    (w.lantern ? warm : cold).push(d);
    if (w.lantern) {
      const { x, hangY } = w.lantern;
      const [fx, fy] = flameCenter();
      back.push(`<circle class="dd-wm-glow" cx="${n2(x + fx)}" cy="${n2(hangY + fy)}" r="${n2(lanternHalfWidth() * 2.1)}" fill="url(#${p}-glow)"/>`);
      defs.push(
        `<radialGradient id="${p}-glow" cx="${n2(x + fx)}" cy="${n2(hangY + fy)}" r="${n2(lanternHalfWidth() * 2.1)}" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="${PALETTE.glow}" stop-opacity=".55"/><stop offset=".5" stop-color="${PALETTE.glow}" stop-opacity=".16"/><stop offset="1" stop-color="${PALETTE.glow}" stop-opacity="0"/></radialGradient>`,
        // The flame's light on D, W, N and on the underside of the lintel above it.
        `<radialGradient id="${p}-warm" cx="${n2(x + fx)}" cy="${n2(hangY + fy)}" r="7.2" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#ffc785" stop-opacity=".95"/><stop offset=".45" stop-color="#f39c45" stop-opacity=".5"/><stop offset="1" stop-color="#d8722a" stop-opacity="0"/></radialGradient>`,
      );
      const layers = lanternLayers(x, hangY, 0.25, { foot: false });
      layers.forEach((l, i) => {
        const fill = paintAttr(l, defs, `${p}-l${i}`);
        const rule = l.rule === 'evenodd' ? ' fill-rule="evenodd"' : '';
        const cls = l.role === 'flame' || l.role === 'core' ? ' class="dd-wm-flame"' : '';
        lanterns.push(`<path${cls}${rule} fill="${fill}" d="${pathData(l.contours, 1, 0, 0, 2)}"/>`);
      });
    }
  }
  const stoneCold = `${p}-cold`;
  const stoneWarm = `${p}-stone`;
  defs.push(
    `<linearGradient id="${stoneCold}" x1="0" y1="0" x2=".35" y2="1"><stop offset="0" stop-color="#e3e8ee"/><stop offset=".55" stop-color="#aeb6c1"/><stop offset="1" stop-color="#6f7a88"/></linearGradient>`,
    `<linearGradient id="${stoneWarm}" x1="0" y1="0" x2=".35" y2="1"><stop offset="0" stop-color="#e6e6e4"/><stop offset=".55" stop-color="#b0b4b9"/><stop offset="1" stop-color="#737a84"/></linearGradient>`,
    `<linearGradient id="${p}-beam" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7d8794"/><stop offset="1" stop-color="#3a4452"/></linearGradient>`,
  );
  const carve = `stroke="${PALETTE.carve}" stroke-width="${WM.carve}" stroke-linejoin="round"`;
  const letters = (d: string[], fill: string) =>
    d.length
      ? `<path d="${d.join('')}" fill="${PALETTE.carve}" ${carve}/><path d="${d.join('')}" fill="#fff" fill-opacity=".55" transform="translate(-.13 -.13)"/><path d="${d.join('')}" fill="url(#${fill})"/>`
      : '';
  const beam = lintels.join('');
  let sub = '';
  if (L.subtitle) {
    const s = L.subtitle;
    const lay = layoutLintel(s.text, { tracking: 0.9 });
    const ruleY = s.y + (LINTEL_H * s.scale) / 2;
    const rw = 2.2;
    sub =
      `<path d="M${n2(s.x - rw - 0.8)} ${n2(ruleY)}h${rw}M${n2(s.x + s.width + 0.8)} ${n2(ruleY)}h${rw}" stroke="${PALETTE.brass500}" stroke-width=".22"/>` +
      `<path d="${lintelPath(lay, s.scale, s.x, s.y)}" fill="#c9bfae"/>`;
  }
  const outlineBeam = polygonsPath(L.words.map((w) => offset(headlinePolygon(w.x - WM.overhang, w.x + w.width + WM.overhang, w.y - WM.lintelGap).map(([x, y]) => [x, y] as [number, number]), 0.25)));
  const grooves = L.words
    .map((w) => {
      const y = w.y - WM.lintelGap - WM.lintelThick * 0.5;
      return `M${n2(w.x - WM.overhang + WM.chamfer + 0.3)} ${n2(y)}H${n2(w.x + w.width + WM.overhang - WM.chamfer - 0.3)}`;
    })
    .join('');
  const width = o.width ?? 360;
  const height = Math.round((width * L.height) / L.width);
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" class="${cls}" role="img" aria-label="${label}" viewBox="0 0 ${n2(L.width)} ${n2(L.height)}" width="${width}" height="${height}" overflow="visible">` +
    `<defs>${defs.join('')}</defs>` +
    back.join('') +
    `<path d="${outlineBeam}" fill="${PALETTE.carve}"/><path d="${beam}" fill="url(#${p}-beam)"/>` +
    `<path d="${grooves}" stroke="${PALETTE.carve}" stroke-width=".2" stroke-opacity=".85"/>` +
    // The lantern's light on the beam above it.
    (warmBeam.length ? `<path class="dd-wm-light" d="${warmBeam.join('')}" fill="url(#${p}-warm)" fill-opacity=".8"/>` : '') +
    letters(cold, stoneCold) +
    letters(warm, stoneWarm) +
    (warm.length ? `<path class="dd-wm-light" d="${warm.join('')}" fill="url(#${p}-warm)"/>` : '') +
    lanterns.join('') +
    sub +
    `</svg>`
  );
}

/** Where the lantern O sits in a lockup (units), for tests and for lining up effects. */
export function lanternPosition(lockup: Exclude<Lockup, 'emblem'>): { x: number; y: number; wordIndex: number; letterIndex: number } {
  const L = wordmarkLayout(lockup);
  const i = L.words.findIndex((w) => w.lantern);
  const w = L.words[i];
  return { x: w.lantern!.x, y: w.lantern!.hangY + ringCenterY(), wordIndex: i, letterIndex: 1 };
}
