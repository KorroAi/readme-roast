// The Lintel face as a real font, built in code at startup: a minimal TrueType (glyf outlines)
// assembled from the same polygons as the wordmark, registered with FontFace. CSS can then
// set titles, the depth numerals and report numbers in the face while they stay plain text
// (accessible, selectable, readable by tests, and every class hook untouched). No font file
// ships: the bytes exist only in memory. Characters the face lacks fall back per character to
// the system stack declared after it (font-family: var(--font-lintel)).
import { LINTEL_CHARS, LINTEL_GAP, LINTEL_SPACE, lintelGlyph, type Polygon } from './strokeFont';

export const LINTEL_FAMILY = 'Lintel';
/** Font units per em, and per grid unit of the face (cap height = 7 units = 700). */
export const UPM = 1000;
export const FU = 100;
const ASCENT = 860;
const DESCENT = 240;

interface Built {
  advance: number;
  contours: Array<Array<[number, number]>>;
}

/** Unicode code points for each covered character (letters also map from lower case). */
function codepoints(): Array<[code: number, ch: string]> {
  const out: Array<[number, string]> = [];
  for (const ch of LINTEL_CHARS) {
    out.push([ch.codePointAt(0)!, ch]);
    // Letters (A-Z and the accented capitals) also map from lower case.
    const lower = ch.toLowerCase();
    if (lower !== ch && lower.length === 1) out.push([lower.codePointAt(0)!, ch]);
  }
  return out.sort((a, b) => a[0] - b[0]);
}

/** y-down unit polygons -> y-up font units, clockwise (TrueType's filled direction). */
function toContour(p: Polygon, dx: number): Array<[number, number]> {
  const pts = p.map(([x, y]) => [Math.round((x + dx) * FU), Math.round((7 - y) * FU)] as [number, number]);
  // Flipping y reversed the winding: reverse back so every contour is clockwise in y-up.
  return pts.reverse();
}

class Writer {
  private buf: number[] = [];
  u8(v: number) {
    this.buf.push(v & 255);
  }
  u16(v: number) {
    this.buf.push((v >> 8) & 255, v & 255);
  }
  i16(v: number) {
    this.u16(v < 0 ? v + 65536 : v);
  }
  u32(v: number) {
    this.buf.push((v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255);
  }
  tag(s: string) {
    for (let i = 0; i < 4; i++) this.u8(s.charCodeAt(i));
  }
  bytes(b: ArrayLike<number>) {
    for (let i = 0; i < b.length; i++) this.buf.push(b[i]);
  }
  pad4() {
    while (this.buf.length % 4) this.buf.push(0);
  }
  get length() {
    return this.buf.length;
  }
  out(): Uint8Array {
    return Uint8Array.from(this.buf);
  }
}

function checksum(b: Uint8Array): number {
  let sum = 0;
  for (let i = 0; i < b.length; i += 4) sum = (sum + (((b[i] << 24) | ((b[i + 1] ?? 0) << 16) | ((b[i + 2] ?? 0) << 8) | (b[i + 3] ?? 0)) >>> 0)) >>> 0;
  return sum;
}

let cached: Uint8Array | null = null;

/** The complete TrueType font (bytes). Deterministic; built once. */
export function buildLintelFont(): Uint8Array {
  if (cached) return cached;
  const map = codepoints();
  const chars = LINTEL_CHARS.slice();
  // Glyph 0 .notdef (empty), 1 space, then the face.
  const glyphs: Built[] = [
    { advance: Math.round((LINTEL_SPACE + LINTEL_GAP) * FU), contours: [] },
    { advance: Math.round((LINTEL_SPACE + LINTEL_GAP) * FU), contours: [] },
  ];
  const gid = new Map<string, number>();
  for (const ch of chars) {
    const g = lintelGlyph(ch)!;
    gid.set(ch, glyphs.length);
    // Digits are tabular (the narrow 1 is centred in a full cell), so numbers never jitter.
    const cell = /[0-9]/.test(ch) ? Math.max(4, g.width) : g.width;
    const dx = LINTEL_GAP / 2 + (cell - g.width) / 2;
    glyphs.push({ advance: Math.round((cell + LINTEL_GAP) * FU), contours: g.polygons.map((p) => toContour(p, dx)) });
  }
  const cmapEntries: Array<[number, number]> = [[32, 1] as [number, number], ...map.map(([code, ch]) => [code, gid.get(ch)!] as [number, number])].sort((a, b) => a[0] - b[0]);

  // glyf + loca
  const glyf = new Writer();
  const loca: number[] = [];
  let xMin = 0, yMin = 0, xMax = 0, yMax = 0, maxPoints = 0, maxContours = 0;
  const lsb: number[] = [];
  for (const g of glyphs) {
    loca.push(glyf.length);
    if (!g.contours.length) {
      lsb.push(0);
      continue;
    }
    const pts: Array<[number, number]> = ([] as Array<[number, number]>).concat(...g.contours);
    const bx0 = Math.min(...pts.map((p) => p[0]));
    const by0 = Math.min(...pts.map((p) => p[1]));
    const bx1 = Math.max(...pts.map((p) => p[0]));
    const by1 = Math.max(...pts.map((p) => p[1]));
    xMin = Math.min(xMin, bx0);
    yMin = Math.min(yMin, by0);
    xMax = Math.max(xMax, bx1);
    yMax = Math.max(yMax, by1);
    maxPoints = Math.max(maxPoints, pts.length);
    maxContours = Math.max(maxContours, g.contours.length);
    lsb.push(bx0);
    glyf.i16(g.contours.length);
    glyf.i16(bx0);
    glyf.i16(by0);
    glyf.i16(bx1);
    glyf.i16(by1);
    let end = -1;
    for (const c of g.contours) {
      end += c.length;
      glyf.u16(end);
    }
    glyf.u16(0); // no instructions
    // Flags: on-curve, 16-bit signed deltas; the first carries OVERLAP_SIMPLE (contours overlap).
    pts.forEach((_, i) => glyf.u8(i === 0 ? 0x41 : 0x01));
    let px = 0;
    for (const [x] of pts) {
      glyf.i16(x - px);
      px = x;
    }
    let py = 0;
    for (const [, y] of pts) {
      glyf.i16(y - py);
      py = y;
    }
    glyf.pad4();
  }
  loca.push(glyf.length);

  const n = glyphs.length;
  const advMax = Math.max(...glyphs.map((g) => g.advance));

  const head = new Writer();
  head.u32(0x00010000);
  head.u32(0x00010000);
  head.u32(0); // checkSumAdjustment, patched below
  head.u32(0x5f0f3cf5);
  head.u16(0x0003);
  head.u16(UPM);
  for (let i = 0; i < 4; i++) head.u32(0); // created, modified (1904 epoch: zero is fine)
  head.i16(xMin);
  head.i16(yMin);
  head.i16(xMax);
  head.i16(yMax);
  head.u16(0);
  head.u16(8);
  head.i16(2);
  head.i16(1); // long loca
  head.i16(0);

  const hhea = new Writer();
  hhea.u32(0x00010000);
  hhea.i16(ASCENT);
  hhea.i16(-DESCENT);
  hhea.i16(0);
  hhea.u16(advMax);
  hhea.i16(Math.min(...lsb.filter((_, i) => glyphs[i].contours.length)));
  hhea.i16(Math.min(...glyphs.filter((g) => g.contours.length).map((g) => g.advance - Math.max(...g.contours.flat().map((p) => p[0])))));
  hhea.i16(xMax);
  hhea.i16(1);
  hhea.i16(0);
  hhea.i16(0);
  for (let i = 0; i < 4; i++) hhea.i16(0);
  hhea.i16(0);
  hhea.u16(n);

  const hmtx = new Writer();
  glyphs.forEach((g, i) => {
    hmtx.u16(g.advance);
    hmtx.i16(lsb[i]);
  });

  const maxp = new Writer();
  maxp.u32(0x00010000);
  maxp.u16(n);
  maxp.u16(maxPoints);
  maxp.u16(maxContours);
  maxp.u16(0);
  maxp.u16(0);
  maxp.u16(2);
  for (let i = 0; i < 8; i++) maxp.u16(0);

  const locaW = new Writer();
  for (const o of loca) locaW.u32(o);

  // cmap: format 4, one segment per code point, then the 0xFFFF terminator.
  const segs = [...cmapEntries.map(([c, g]) => ({ start: c, end: c, delta: (g - c + 65536) % 65536 })), { start: 0xffff, end: 0xffff, delta: 1 }];
  const segX2 = segs.length * 2;
  const es = Math.floor(Math.log2(segs.length));
  const sr = 2 * 2 ** es;
  const sub = new Writer();
  sub.u16(4);
  sub.u16(16 + segs.length * 8);
  sub.u16(0);
  sub.u16(segX2);
  sub.u16(sr);
  sub.u16(es);
  sub.u16(segX2 - sr);
  for (const s of segs) sub.u16(s.end);
  sub.u16(0);
  for (const s of segs) sub.u16(s.start);
  for (const s of segs) sub.u16(s.delta);
  for (let i = 0; i < segs.length; i++) sub.u16(0);
  const cmap = new Writer();
  cmap.u16(0);
  cmap.u16(1);
  cmap.u16(3);
  cmap.u16(1);
  cmap.u32(12);
  cmap.bytes(sub.out());

  const names: Array<[number, string]> = [
    [1, LINTEL_FAMILY],
    [2, 'Regular'],
    [3, 'DeepDown:Lintel:1.0'],
    [4, `${LINTEL_FAMILY} Regular`],
    [5, 'Version 1.0'],
    [6, 'Lintel-Regular'],
  ];
  const strings = new Writer();
  const records: Array<[number, number, number]> = [];
  for (const [id, text] of names) {
    const off = strings.length;
    for (const ch of text) strings.u16(ch.charCodeAt(0));
    records.push([id, strings.length - off, off]);
  }
  const name = new Writer();
  name.u16(0);
  name.u16(records.length);
  name.u16(6 + records.length * 12);
  for (const [id, len, off] of records) {
    name.u16(3);
    name.u16(1);
    name.u16(0x409);
    name.u16(id);
    name.u16(len);
    name.u16(off);
  }
  name.bytes(strings.out());

  const os2 = new Writer();
  const avg = Math.round(glyphs.slice(2).reduce((a, g) => a + g.advance, 0) / Math.max(1, n - 2));
  os2.u16(4);
  os2.i16(avg);
  os2.u16(500);
  os2.u16(5);
  os2.u16(0);
  for (const v of [650, 600, 0, 75, 650, 600, 0, 350, 50, 300]) os2.i16(v); // sub/superscript, strikeout
  os2.i16(0);
  os2.bytes([2, 11, 6, 9, 3, 0, 0, 0, 0, 0]); // PANOSE: sans, monoline
  os2.u32(0x80000007); // Basic Latin, Latin-1, Latin Extended-A (Œ), General Punctuation
  os2.u32(1 << 6);
  os2.u32(0);
  os2.u32(0);
  os2.tag('DDWN');
  os2.u16(0x0040);
  os2.u16(cmapEntries[0][0]);
  os2.u16(Math.min(0xffff, cmapEntries[cmapEntries.length - 1][0]));
  os2.i16(ASCENT);
  os2.i16(-DESCENT);
  os2.i16(0);
  os2.u16(ASCENT);
  os2.u16(DESCENT);
  os2.u32(1);
  os2.u32(0);
  os2.i16(700);
  os2.i16(700);
  os2.u16(0);
  os2.u16(32);
  os2.u16(1);

  const post = new Writer();
  post.u32(0x00030000);
  post.u32(0);
  post.i16(-100);
  post.i16(50);
  for (let i = 0; i < 5; i++) post.u32(0);

  const tables: Array<[string, Uint8Array]> = (
    [
      ['OS/2', os2.out()],
      ['cmap', cmap.out()],
      ['glyf', glyf.out()],
      ['head', head.out()],
      ['hhea', hhea.out()],
      ['hmtx', hmtx.out()],
      ['loca', locaW.out()],
      ['maxp', maxp.out()],
      ['name', name.out()],
      ['post', post.out()],
    ] as Array<[string, Uint8Array]>
  ).sort((a, b) => (a[0] < b[0] ? -1 : 1));

  const font = new Writer();
  const num = tables.length;
  const tes = Math.floor(Math.log2(num));
  const tsr = 16 * 2 ** tes;
  font.u32(0x00010000);
  font.u16(num);
  font.u16(tsr);
  font.u16(tes);
  font.u16(num * 16 - tsr);
  let offset = 12 + num * 16;
  const placed: Array<[string, Uint8Array, number]> = [];
  for (const [tag, data] of tables) {
    placed.push([tag, data, offset]);
    offset += Math.ceil(data.length / 4) * 4;
  }
  for (const [tag, data, off] of placed) {
    font.tag(tag);
    font.u32(checksum(data));
    font.u32(off);
    font.u32(data.length);
  }
  for (const [, data] of placed) {
    font.bytes(data);
    font.pad4();
  }
  const bytes = font.out();
  // head.checkSumAdjustment = 0xB1B0AFBA - checksum(whole font).
  const headOff = placed.find((p) => p[0] === 'head')![2];
  const adj = (0xb1b0afba - checksum(bytes)) >>> 0;
  bytes[headOff + 8] = adj >>> 24;
  bytes[headOff + 9] = (adj >>> 16) & 255;
  bytes[headOff + 10] = (adj >>> 8) & 255;
  bytes[headOff + 11] = adj & 255;
  cached = bytes;
  return bytes;
}

let installed: Promise<boolean> | null = null;

/**
 * Register the face with the document (idempotent). Resolves true once usable; false where
 * FontFace is missing or rejects the bytes (CSS then shows the system stack).
 */
export function installLintelFont(): Promise<boolean> {
  if (installed) return installed;
  installed = (async () => {
    try {
      if (typeof FontFace === 'undefined' || typeof document === 'undefined' || !document.fonts) return false;
      const bytes = buildLintelFont();
      const face = new FontFace(LINTEL_FAMILY, bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer, { display: 'block' });
      document.fonts.add(face);
      await face.load();
      return true;
    } catch (e) {
      console.warn('[deep-down] Lintel face unavailable, using the system font', e);
      return false;
    }
  })();
  return installed;
}
