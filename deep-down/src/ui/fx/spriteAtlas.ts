// Sprites for the FX canvas (SPEC §10.6, §11.4): glyphs of the Lintel face rasterised at device size with a carve
// outline (one atlas per size bucket and style, built lazily, rebuilt when the DPR or the font changes), and the
// coin, gem and spark sprites. Drawing a number is then one drawImage per character: crisp at any DPR (V10).

import { COLOR } from '../brand/tokens';

export type GlyphStyle = 'tap' | 'crit' | 'gem' | 'crew' | 'gold' | 'xp';

/** Size buckets (CSS px of the cap height's em). */
export const SIZE_BUCKETS = [14, 18, 22, 26, 30, 34, 38, 48] as const;

/** Rasterised at this much above the bucket so the jelly peak (×1.18) never upsamples. */
const OVERSCALE = 1.2;

const STYLE: Record<GlyphStyle, { fill: string; stroke: string; glow?: string; alpha: number }> = {
  tap: { fill: COLOR.bone100, stroke: COLOR.carve, alpha: 1 },
  crit: { fill: COLOR.amber300, stroke: COLOR.carve, glow: 'rgba(255,179,92,0.30)', alpha: 1 },
  gem: { fill: COLOR.rune200, stroke: COLOR.carve, alpha: 1 },
  crew: { fill: COLOR.bone500, stroke: COLOR.carve, alpha: 0.7 },
  gold: { fill: '#ffd56b', stroke: COLOR.carve, alpha: 1 },
  xp: { fill: COLOR.deep300, stroke: COLOR.carve, alpha: 1 },
};

const FONT_STACK = `Lintel, system-ui, -apple-system, 'Segoe UI', Roboto, Arial, sans-serif`;

export interface Glyph {
  /** Source rect in the atlas (device px). */
  sx: number;
  sy: number;
  sw: number;
  sh: number;
  /** Advance in CSS px at scale 1 (without the outline). */
  advance: number;
}

interface Atlas {
  canvas: HTMLCanvasElement | OffscreenCanvas;
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
  glyphs: Map<string, Glyph>;
  x: number;
  y: number;
  rowH: number;
  /** Device px per CSS px the glyphs were drawn at (bucket × OVERSCALE × dpr ÷ bucket). */
  k: number;
}

function makeCanvas(w: number, h: number): HTMLCanvasElement | OffscreenCanvas {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

/** The bucket a CSS size falls in (the smallest bucket ≥ it, or the largest). */
export function bucketOf(px: number): number {
  for (const b of SIZE_BUCKETS) if (b >= px) return b;
  return SIZE_BUCKETS[SIZE_BUCKETS.length - 1];
}

export class SpriteAtlas {
  private readonly atlases = new Map<string, Atlas>();
  private dpr = 1;
  private sprites = new Map<string, HTMLCanvasElement | OffscreenCanvas>();
  /** Glyph rasterisations so far (a steady frame adds none). */
  rasterised = 0;

  constructor(dpr = 1) {
    this.setDpr(dpr);
  }

  /** The device pixel ratio changed (or the Lintel font loaded): every sprite is rebuilt lazily. */
  setDpr(dpr: number): void {
    this.dpr = Math.max(1, Math.min(3, dpr));
    this.atlases.clear();
    this.sprites.clear();
  }

  reset(): void {
    this.atlases.clear();
    this.sprites.clear();
  }

  get pixelRatio(): number {
    return this.dpr;
  }

  private atlas(bucket: number, style: GlyphStyle): Atlas {
    const key = `${bucket}|${style}`;
    let a = this.atlases.get(key);
    if (!a) {
      const k = OVERSCALE * this.dpr;
      const size = Math.ceil(bucket * k);
      const w = Math.min(2048, size * 16);
      const h = Math.min(1024, size * 5);
      const canvas = makeCanvas(w, h);
      const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
      a = { canvas, ctx, glyphs: new Map(), x: 0, y: 0, rowH: 0, k };
      this.atlases.set(key, a);
    }
    return a;
  }

  /** A glyph (rasterised on first use). */
  glyph(ch: string, bucket: number, style: GlyphStyle): { atlas: HTMLCanvasElement | OffscreenCanvas; g: Glyph; k: number } {
    const a = this.atlas(bucket, style);
    let g = a.glyphs.get(ch);
    if (!g) {
      g = this.rasterise(a, ch, bucket, style);
      a.glyphs.set(ch, g);
    }
    return { atlas: a.canvas, g, k: a.k };
  }

  private rasterise(a: Atlas, ch: string, bucket: number, style: GlyphStyle): Glyph {
    this.rasterised++;
    const s = STYLE[style];
    const k = a.k;
    const px = bucket * k;
    const pad = Math.ceil(4 * k);
    const ctx = a.ctx;
    ctx.font = `700 ${px}px ${FONT_STACK}`;
    const adv = ch === ' ' ? px * 0.3 : ctx.measureText(ch).width;
    const sw = Math.ceil(adv + pad * 2);
    const sh = Math.ceil(px * 1.25 + pad * 2);
    if (a.x + sw > (a.canvas.width as number)) {
      a.x = 0;
      a.y += a.rowH;
      a.rowH = 0;
    }
    if (a.y + sh > (a.canvas.height as number)) {
      // Full: start over (rare: the cache only holds digits, suffix letters and signs).
      ctx.clearRect(0, 0, a.canvas.width as number, a.canvas.height as number);
      a.glyphs.clear();
      a.x = 0;
      a.y = 0;
      a.rowH = 0;
    }
    const x = a.x;
    const y = a.y;
    a.x += sw;
    a.rowH = Math.max(a.rowH, sh);
    const bx = x + pad;
    const by = y + pad + px;
    ctx.save();
    ctx.globalAlpha = s.alpha;
    ctx.lineJoin = 'miter';
    ctx.miterLimit = 2;
    ctx.font = `700 ${px}px ${FONT_STACK}`;
    ctx.textBaseline = 'alphabetic';
    if (s.glow) {
      ctx.strokeStyle = s.glow;
      ctx.lineWidth = 8 * k;
      ctx.strokeText(ch, bx, by);
    }
    ctx.strokeStyle = s.stroke;
    ctx.lineWidth = 3 * k;
    ctx.strokeText(ch, bx, by);
    ctx.fillStyle = s.fill;
    ctx.fillText(ch, bx, by);
    ctx.restore();
    return { sx: x, sy: y, sw, sh, advance: adv / k };
  }

  /** Width (CSS px at scale 1) of a string in a bucket. */
  measure(text: string, bucket: number, style: GlyphStyle): number {
    let w = 0;
    for (let i = 0; i < text.length; i++) w += this.glyph(text[i], bucket, style).g.advance;
    return w;
  }

  /** A named round sprite (coin, gem, spark, ring dot), drawn once per DPR. Size in CSS px. */
  sprite(name: 'coin' | 'gem' | 'spark' | 'star' | 'glow', size: number): HTMLCanvasElement | OffscreenCanvas {
    const key = `${name}|${size}`;
    let c = this.sprites.get(key);
    if (c) return c;
    const n = Math.ceil(size * this.dpr);
    c = makeCanvas(n, n);
    const ctx = c.getContext('2d') as CanvasRenderingContext2D;
    const r = n / 2;
    if (name === 'coin') {
      // A brass-gold coin: a dark rim, a warm face, a highlight crescent and a carved diamond.
      ctx.fillStyle = '#5e3a12';
      ctx.beginPath();
      ctx.arc(r, r, r * 0.96, 0, Math.PI * 2);
      ctx.fill();
      const g = ctx.createRadialGradient(r * 0.75, r * 0.7, r * 0.1, r, r, r * 0.86);
      g.addColorStop(0, '#fff3c4');
      g.addColorStop(0.45, '#ffcf5a');
      g.addColorStop(1, '#c9821f');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(r, r, r * 0.82, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(94,58,18,0.65)';
      ctx.lineWidth = Math.max(1, n * 0.06);
      ctx.beginPath();
      ctx.moveTo(r, r * 0.52);
      ctx.lineTo(r * 1.36, r);
      ctx.lineTo(r, r * 1.48);
      ctx.lineTo(r * 0.64, r);
      ctx.closePath();
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ctx.beginPath();
      ctx.ellipse(r * 0.72, r * 0.6, r * 0.22, r * 0.12, -0.6, 0, Math.PI * 2);
      ctx.fill();
    } else if (name === 'gem') {
      ctx.fillStyle = COLOR.carve;
      diamond(ctx, r, r, r * 0.98, r * 0.98);
      ctx.fill();
      const g = ctx.createLinearGradient(0, 0, n, n);
      g.addColorStop(0, '#e9fdff');
      g.addColorStop(0.5, COLOR.rune200);
      g.addColorStop(1, COLOR.rune400);
      ctx.fillStyle = g;
      diamond(ctx, r, r, r * 0.8, r * 0.8);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      diamond(ctx, r * 0.8, r * 0.75, r * 0.2, r * 0.25);
      ctx.fill();
    } else if (name === 'spark') {
      const g = ctx.createRadialGradient(r, r, 0, r, r, r);
      g.addColorStop(0, 'rgba(255,248,224,1)');
      g.addColorStop(0.35, 'rgba(255,200,110,0.9)');
      g.addColorStop(1, 'rgba(255,150,60,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, n, n);
    } else if (name === 'star') {
      ctx.fillStyle = '#fff6d8';
      ctx.beginPath();
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        const rr = i % 2 === 0 ? r : r * 0.28;
        ctx.lineTo(r + Math.cos(a) * rr, r + Math.sin(a) * rr);
      }
      ctx.closePath();
      ctx.fill();
    } else {
      const g = ctx.createRadialGradient(r, r, 0, r, r, r);
      g.addColorStop(0, 'rgba(255,214,140,0.85)');
      g.addColorStop(1, 'rgba(255,170,80,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, n, n);
    }
    this.sprites.set(key, c);
    return c;
  }
}

function diamond(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number): void {
  ctx.beginPath();
  ctx.moveTo(x, y - ry);
  ctx.lineTo(x + rx, y);
  ctx.lineTo(x, y + ry);
  ctx.lineTo(x - rx, y);
  ctx.closePath();
}
