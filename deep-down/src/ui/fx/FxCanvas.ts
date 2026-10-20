// The FX layer (SPEC §9.3 z 5, §10.5–§10.6): one Canvas 2D at native DPR over the HUD, pointer-events none.
// Damage numbers (a pool of 48, accumulating per column within 350 ms), loot tokens (pop, then a Bézier flight to
// their counter socket with a trail; the counter credits each token as it lands), sparks and rings. Everything
// is pooled: a tap allocates nothing. Hidden after 300 ms with nothing to draw.

import { Big } from '../../core/big';
import { EASE } from '../../core/ease';
import { springResponse, SPRINGS } from '../../core/spring';
import { SpriteAtlas, bucketOf, type GlyphStyle } from './spriteAtlas';
import type { MotionLevel } from './waapi';

export const FX_CAPS = { numbers: 48, tokens: 32, sparks: 384, rings: 24 } as const;
/** Tokens in flight before new ones merge into bundles (Balanced; SPEC §11.5). */
export const TOKENS_IN_FLIGHT = { battery: 16, balanced: 24, high: 32 } as const;

export type TokenKind = 'coin' | 'gem';
export type SparkKind = 'brass' | 'gold' | 'rune' | 'white' | 'amber' | 'grey';

const SPARK_RGB: Record<SparkKind, string> = {
  brass: '226,182,115',
  gold: '255,213,107',
  rune: '143,227,238',
  white: '255,250,235',
  amber: '255,179,92',
  grey: '170,165,155',
};

interface NumberFx {
  live: boolean;
  col: number;
  x: number;
  y: number;
  t0: number;
  last: number;
  life: number;
  value: Big;
  text: string;
  style: GlyphStyle;
  size: number;
  bumpAt: number;
  prefix: string;
}

interface TokenFx {
  live: boolean;
  kind: TokenKind;
  socket: string;
  x0: number;
  y0: number;
  /** Pop velocity (px/s). */
  vx: number;
  vy: number;
  t0: number;
  pop: number;
  flight: number;
  side: number;
  /** Where the flight starts (the end of the pop). */
  fx: number;
  fy: number;
  hx: Float32Array;
  hy: Float32Array;
  hn: number;
  hLast: number;
  ids: number[];
  count: number;
  size: number;
  /** Bundle size shown as ×n (1: a single token). */
  bundle: number;
  /** Its slot in the flight log (the debug surface's F4 timing). */
  rec: number;
}

/** One token's schedule and its landing (ms, performance.now()): the e2e F4 check reads these, not frames. */
export interface FlightRecord {
  kind: TokenKind;
  launched: number;
  /** When the schedule says it reaches the socket (launch + pop + flight). */
  due: number;
  /** The frame time it landed (0: still flying). */
  landed: number;
}

const FLIGHT_LOG = 32;

interface SparkFx {
  live: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  t0: number;
  life: number;
  size: number;
  kind: SparkKind;
  drag: number;
  gravity: number;
  sprite: 'spark' | 'star';
}

interface RingFx {
  live: boolean;
  x: number;
  y: number;
  r0: number;
  r1: number;
  t0: number;
  ms: number;
  rgb: string;
  width: number;
}

export interface Socket {
  x: number;
  y: number;
}

/** A token landed: credit `ids` in the ledger (the counter shows it now), at the socket. */
export type LandHandler = (kind: TokenKind, ids: readonly number[], count: number, socket: string, index: number) => void;

export class FxCanvas {
  readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  readonly atlas: SpriteAtlas;
  private readonly numbers: NumberFx[] = [];
  private readonly tokens: TokenFx[] = [];
  private readonly sparks: SparkFx[] = [];
  private readonly rings: RingFx[] = [];
  private readonly sockets = new Map<string, Socket>();
  private w = 1;
  private h = 1;
  private dpr = 1;
  private lastDraw = 0;
  private visible = true;
  private side = 1;
  /** Landings within the last 600 ms (the tick's pitch climbs +1 semitone per landing). */
  private landStreak = 0;
  private lastLand = -Infinity;
  motion: MotionLevel = 'full';
  tokenCap: number = TOKENS_IN_FLIGHT.balanced;
  onLand: LandHandler | null = null;
  /** Format a number for display (the notation setting). */
  format: (b: Big) => string = (b) => b.toString();
  /** drawImage calls in the last frame (budget ≤ 150). */
  draws = 0;

  constructor(parent: HTMLElement) {
    this.canvas = document.createElement('canvas');
    this.canvas.id = 'dd-fx';
    this.canvas.setAttribute('aria-hidden', 'true');
    parent.appendChild(this.canvas);
    this.ctx = this.canvas.getContext('2d')!;
    this.atlas = new SpriteAtlas(window.devicePixelRatio || 1);
    for (let i = 0; i < FX_CAPS.numbers; i++)
      this.numbers.push({ live: false, col: 0, x: 0, y: 0, t0: 0, last: 0, life: 0, value: Big.zero(), text: '', style: 'tap', size: 18, bumpAt: -1e9, prefix: '' });
    for (let i = 0; i < FX_CAPS.tokens; i++)
      this.tokens.push({
        live: false, kind: 'coin', socket: 'gold', x0: 0, y0: 0, vx: 0, vy: 0, t0: 0, pop: 0, flight: 0, side: 1, fx: 0, fy: 0,
        hx: new Float32Array(6), hy: new Float32Array(6), hn: 0, hLast: 0, ids: [0, 0, 0, 0, 0, 0, 0, 0], count: 0, size: 26, bundle: 1, rec: -1,
      });
    for (let i = 0; i < FLIGHT_LOG; i++) this.flightLog.push({ kind: 'coin', launched: 0, due: 0, landed: 0 });
    for (let i = 0; i < FX_CAPS.sparks; i++) this.sparks.push({ live: false, x: 0, y: 0, vx: 0, vy: 0, t0: 0, life: 0, size: 6, kind: 'brass', drag: 4, gravity: 600, sprite: 'spark' });
    for (let i = 0; i < FX_CAPS.rings; i++) this.rings.push({ live: false, x: 0, y: 0, r0: 0, r1: 0, t0: 0, ms: 0, rgb: '255,210,154', width: 2 });
    this.resize();
  }

  resize(): void {
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    const w = window.innerWidth;
    const h = window.innerHeight;
    if (w === this.w && h === this.h && dpr === this.dpr) return;
    this.w = w;
    this.h = h;
    if (dpr !== this.dpr) this.atlas.setDpr(dpr);
    this.dpr = dpr;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
  }

  /** The Lintel font finished loading: glyphs are rasterised again. */
  fontLoaded(): void {
    this.atlas.reset();
  }

  setSocket(name: string, x: number, y: number): void {
    const s = this.sockets.get(name);
    if (s) {
      s.x = x;
      s.y = y;
    } else this.sockets.set(name, { x, y });
  }

  socket(name: string): Socket | undefined {
    return this.sockets.get(name);
  }

  // ----- counts (the debug surface, F12) ------------------------------------------------------------

  /** The last flights (oldest first; pre-allocated ring, no garbage). */
  private readonly flightLog: FlightRecord[] = [];
  private flightHead = 0;
  private flightCount = 0;

  flights(): FlightRecord[] {
    const out: FlightRecord[] = [];
    for (let i = 0; i < this.flightCount; i++) out.push({ ...this.flightLog[(this.flightHead - this.flightCount + i + FLIGHT_LOG) % FLIGHT_LOG] });
    return out;
  }

  get liveNumbers(): number {
    let n = 0;
    for (const x of this.numbers) if (x.live) n++;
    return n;
  }

  get liveTokens(): number {
    let n = 0;
    for (const x of this.tokens) if (x.live) n++;
    return n;
  }

  get liveSparks(): number {
    let n = 0;
    for (const x of this.sparks) if (x.live) n++;
    return n;
  }

  // ----- numbers ----------------------------------------------------------------------------------------

  /**
   * A damage number at (x, y). Hits on the same column within 350 ms add into the live number (it bumps and lives
   * 200 ms longer, up to 1.6 s), so the screen keeps ≤ 7 numbers at 8 taps/s and the sum climbs like a score.
   */
  number(col: number, x: number, y: number, value: Big, style: GlyphStyle, size: number, now: number, prefix = ''): void {
    for (const n of this.numbers) {
      if (n.live && n.col === col && n.style === style && now - n.last <= 350 && col >= 0) {
        n.value.addIn(value);
        n.text = prefix + this.format(n.value);
        n.last = now;
        n.bumpAt = now;
        n.size = Math.max(n.size, size);
        n.life = Math.min(1600, now - n.t0 + 940);
        return;
      }
    }
    const n = this.free(this.numbers) ?? this.oldestNumber();
    n.live = true;
    n.col = col;
    n.x = x;
    n.y = y;
    n.t0 = now;
    n.last = now;
    n.life = this.motion === 'off' ? 600 : 940;
    n.value.set(value);
    n.prefix = prefix;
    n.text = prefix + this.format(n.value);
    n.style = style;
    n.size = size;
    n.bumpAt = -1e9;
    this.wake(now);
  }

  /** A text label number ("×3", "+1 m") that does not accumulate. */
  label(x: number, y: number, text: string, style: GlyphStyle, size: number, now: number): void {
    const n = this.free(this.numbers) ?? this.oldestNumber();
    n.live = true;
    n.col = -1;
    n.x = x;
    n.y = y;
    n.t0 = now;
    n.last = now;
    n.life = this.motion === 'off' ? 600 : 900;
    n.value.setNum(0);
    n.prefix = '';
    n.text = text;
    n.style = style;
    n.size = size;
    n.bumpAt = -1e9;
    this.wake(now);
  }

  private oldestNumber(): NumberFx {
    let o = this.numbers[0];
    for (const n of this.numbers) if (n.t0 < o.t0) o = n;
    return o;
  }

  // ----- tokens -----------------------------------------------------------------------------------------

  /**
   * Launch a token from (x, y) to `socket`, carrying ledger id `id` (0: nothing to credit). `index` is its place in
   * its burst (≤ 6: the flight is 420 + 40 × index ms). Over the in-flight cap the token merges into the newest
   * one still popping (a bundle "×n"). @returns false when it could not fly (Motion Off): credit it at once.
   */
  token(kind: TokenKind, x: number, y: number, socket: string, id: number, index: number, now: number): boolean {
    if (this.motion === 'off' || !this.sockets.has(socket)) return false;
    let live = 0;
    let newest: TokenFx | null = null;
    for (const t of this.tokens) {
      if (!t.live) continue;
      live++;
      if (t.kind === kind && t.socket === socket && now - t.t0 < t.pop && t.count < t.ids.length && (!newest || t.t0 > newest.t0)) newest = t;
    }
    if (live >= this.tokenCap || live >= FX_CAPS.tokens) {
      if (newest) {
        newest.ids[newest.count++] = id;
        newest.bundle++;
        return true;
      }
      return false;
    }
    const t = this.free(this.tokens);
    if (!t) return false;
    const reduced = this.motion === 'reduced';
    this.side = -this.side;
    t.live = true;
    t.kind = kind;
    t.socket = socket;
    t.x0 = x;
    t.y0 = y;
    // The pop: up and out, ±1.5 m/s sideways and 4.5 m/s up at 44 px/m.
    t.vx = (this.side * (0.4 + ((index * 37) % 11) / 10)) * 66;
    t.vy = -4.5 * 44;
    t.t0 = now;
    t.pop = reduced ? 0 : 320;
    t.flight = reduced ? 300 : 420 + 40 * Math.min(6, index);
    t.side = this.side;
    t.fx = x;
    t.fy = y;
    t.hn = 0;
    t.hLast = now;
    t.ids[0] = id;
    t.count = 1;
    t.size = kind === 'gem' ? 22 : 26;
    t.bundle = 1;
    const r = this.flightLog[this.flightHead];
    r.kind = kind;
    r.launched = now;
    r.due = now + t.pop + t.flight;
    r.landed = 0;
    t.rec = this.flightHead;
    this.flightHead = (this.flightHead + 1) % FLIGHT_LOG;
    this.flightCount = Math.min(FLIGHT_LOG, this.flightCount + 1);
    this.wake(now);
    return true;
  }

  // ----- sparks and rings -------------------------------------------------------------------------------

  /** `n` sparks from (x, y) at speeds in [v0, v1] px/s over an angle range (radians; default all around). */
  sparksAt(x: number, y: number, n: number, kind: SparkKind, now: number, v0 = 180, v1 = 420, life = 450, a0 = 0, a1 = Math.PI * 2, gravity = 600, sprite: 'spark' | 'star' = 'spark'): void {
    if (this.motion === 'off') n = Math.min(n, 6);
    for (let i = 0; i < n; i++) {
      const s = this.free(this.sparks);
      if (!s) return;
      const a = a0 + (a1 - a0) * ((i + 0.5 + 0.35 * Math.sin(i * 12.9898 + now)) / n);
      const v = v0 + (v1 - v0) * (0.5 + 0.5 * Math.sin(i * 78.233 + now * 0.37));
      s.live = true;
      s.x = x;
      s.y = y;
      s.vx = Math.cos(a) * v;
      s.vy = Math.sin(a) * v;
      s.t0 = now;
      s.life = life * (0.75 + 0.25 * Math.abs(Math.sin(i * 3.7)));
      s.size = sprite === 'star' ? 9 : 6;
      s.kind = kind;
      s.drag = 4;
      s.gravity = gravity;
      s.sprite = sprite;
    }
    this.wake(now);
  }

  ring(x: number, y: number, r0: number, r1: number, ms: number, rgb: string, now: number, width = 2): void {
    if (this.motion === 'off') return;
    const r = this.free(this.rings);
    if (!r) return;
    r.live = true;
    r.x = x;
    r.y = y;
    r.r0 = r0;
    r.r1 = r1;
    r.t0 = now;
    r.ms = this.motion === 'reduced' ? ms * 0.6 : ms;
    r.rgb = rgb;
    r.width = width;
    this.wake(now);
  }

  /** Drop everything in flight (scene change). Tokens are reported as landed so the ledger settles. */
  clear(): void {
    for (const t of this.tokens) {
      if (t.live) this.onLand?.(t.kind, t.ids, t.count, t.socket, 0);
      t.live = false;
    }
    for (const n of this.numbers) n.live = false;
    for (const s of this.sparks) s.live = false;
    for (const r of this.rings) r.live = false;
  }

  private free<T extends { live: boolean }>(pool: T[]): T | null {
    for (const x of pool) if (!x.live) return x;
    return null;
  }

  private wake(now: number): void {
    this.lastDraw = now;
    if (!this.visible) {
      this.visible = true;
      this.canvas.style.visibility = '';
    }
  }

  // ----- the frame --------------------------------------------------------------------------------------

  /** Advance and draw (`now` in ms on the UI clock; FX here run on real time: tokens never freeze in a hit-stop). */
  /** Captures only (tools/capture.mjs through __DD__.internals.fx): hold the FX clock at this time (null: live). */
  frozenAt: number | null = null;

  frame(now: number, dt: number): void {
    if (this.frozenAt !== null) {
      now = this.frozenAt;
      dt = 0;
    }
    const ctx = this.ctx;
    const any = this.anyLive();
    if (!any) {
      if (this.visible && now - this.lastDraw > 300) {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.visible = false;
        this.canvas.style.visibility = 'hidden';
      }
      this.draws = 0;
      return;
    }
    this.lastDraw = now;
    this.draws = 0;
    const k = this.dpr;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.setTransform(k, 0, 0, k, 0, 0);
    this.drawRings(now);
    this.drawSparks(now, dt);
    this.drawTokens(now);
    this.drawNumbers(now);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  private anyLive(): boolean {
    for (const x of this.numbers) if (x.live) return true;
    for (const x of this.tokens) if (x.live) return true;
    for (const x of this.sparks) if (x.live) return true;
    for (const x of this.rings) if (x.live) return true;
    return false;
  }

  private drawNumbers(now: number): void {
    const reduced = this.motion !== 'full';
    for (const n of this.numbers) {
      if (!n.live) continue;
      const t = now - n.t0;
      if (t >= n.life) {
        n.live = false;
        continue;
      }
      let s = 1;
      let rise = 0;
      if (this.motion === 'full') {
        s = 0.6 + 0.4 * springResponse(SPRINGS.jelly, t / 1000);
        const bt = (now - n.bumpAt) / 1000;
        if (bt >= 0 && bt < 0.45) s *= 1 + 0.18 * Math.exp(-bt * 9) * Math.cos(bt * 32);
        const rt = Math.max(0, t - 320) / 620;
        rise = 46 * EASE.outCubic(Math.min(1, rt));
      } else if (this.motion === 'reduced') {
        rise = 20 * Math.min(1, t / n.life);
      }
      const fade = Math.min(1, (n.life - t) / 200);
      const alpha = reduced ? Math.min(1, t / 80) * fade : fade;
      this.drawText(n.text, n.x, n.y - rise, n.size * s, n.style, alpha);
    }
  }

  /** Draw a centred string of glyph sprites at a CSS size. */
  private drawText(text: string, cx: number, cy: number, size: number, style: GlyphStyle, alpha: number): void {
    const ctx = this.ctx;
    const bucket = bucketOf(Math.min(48, size));
    const scale = size / bucket;
    let w = 0;
    for (let i = 0; i < text.length; i++) w += this.atlas.glyph(text[i], bucket, style).g.advance;
    let x = cx - (w * scale) / 2;
    ctx.globalAlpha = alpha;
    for (let i = 0; i < text.length; i++) {
      const { atlas, g, k } = this.atlas.glyph(text[i], bucket, style);
      const dw = (g.sw / k) * scale;
      const dh = (g.sh / k) * scale;
      const pad = (4 * scale);
      ctx.drawImage(atlas as CanvasImageSource, g.sx, g.sy, g.sw, g.sh, x - pad, cy - dh * 0.62, dw, dh);
      this.draws++;
      x += g.advance * scale;
    }
  }

  private drawTokens(now: number): void {
    const ctx = this.ctx;
    for (const t of this.tokens) {
      if (!t.live) continue;
      const age = now - t.t0;
      const sock = this.sockets.get(t.socket);
      if (!sock) {
        this.land(t, now);
        continue;
      }
      let x: number;
      let y: number;
      let scale = 1;
      let stretch = 1;
      let angle = 0;
      if (age < t.pop) {
        const s = age / 1000;
        x = t.x0 + t.vx * s;
        y = t.y0 + t.vy * s + 0.5 * 1400 * s * s;
        scale = Math.min(1, springResponse(SPRINGS.bounce, s) * 1.0);
        t.fx = x;
        t.fy = y;
      } else {
        const u = Math.min(1, (age - t.pop) / t.flight);
        if (u >= 1) {
          this.land(t, now);
          continue;
        }
        const p = this.motion === 'reduced' ? EASE.inQuad(u) : Math.pow(u, 2.2);
        const cx = t.fx + t.side * 120;
        const cy = t.fy - 160;
        const a = 1 - p;
        x = a * a * t.fx + 2 * a * p * cx + p * p * sock.x;
        y = a * a * t.fy + 2 * a * p * cy + p * p * sock.y;
        // Velocity for the stretch (derivative of the Bézier × dp/dt).
        const dx = 2 * a * (cx - t.fx) + 2 * p * (sock.x - cx);
        const dy = 2 * a * (cy - t.fy) + 2 * p * (sock.y - cy);
        const dpdt = (2.2 * Math.pow(Math.max(u, 1e-3), 1.2)) / (t.flight / 1000);
        const speed = Math.hypot(dx, dy) * dpdt;
        stretch = 1 + Math.min(0.35, speed / 2400);
        angle = Math.atan2(dy, dx);
        const remain = (1 - u) * t.flight;
        if (remain < 120) scale = 0.7 + 0.3 * (remain / 120);
      }
      // Trail: 6 ghosts 16 ms apart (coins), `lighter` in the tier colour.
      if (now - t.hLast >= 16) {
        t.hLast = now;
        for (let i = t.hx.length - 1; i > 0; i--) {
          t.hx[i] = t.hx[i - 1];
          t.hy[i] = t.hy[i - 1];
        }
        t.hx[0] = x;
        t.hy[0] = y;
        t.hn = Math.min(t.hx.length, t.hn + 1);
      }
      const sprite = this.atlas.sprite(t.kind, t.size);
      const size = t.size * (t.bundle > 1 ? 1 + 0.15 * Math.log2(t.bundle) : 1);
      if (this.motion === 'full' && age >= t.pop) {
        ctx.globalCompositeOperation = 'lighter';
        const glow = this.atlas.sprite('glow', 32);
        for (let i = 1; i < t.hn; i++) {
          const f = i / t.hx.length;
          ctx.globalAlpha = 0.45 * (1 - f) + 0.05;
          const gs = size * (0.9 - 0.5 * f);
          ctx.drawImage(glow as CanvasImageSource, t.hx[i] - gs / 2, t.hy[i] - gs / 2, gs, gs);
          this.draws++;
        }
        ctx.globalCompositeOperation = 'source-over';
      }
      ctx.globalAlpha = 1;
      const sx = size * scale * stretch;
      const sy = (size * scale) / Math.sqrt(stretch);
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(angle);
      ctx.drawImage(sprite as CanvasImageSource, -sx / 2, -sy / 2, sx, sy);
      ctx.restore();
      this.draws++;
      if (t.bundle > 1) this.drawText(`×${t.bundle}`, x + size * 0.7, y - size * 0.4, 14, 'tap', 1);
    }
  }

  private land(t: TokenFx, now: number): void {
    t.live = false;
    if (t.rec >= 0) {
      this.flightLog[t.rec].landed = now;
      t.rec = -1;
    }
    if (now - this.lastLand > 600) this.landStreak = 0;
    this.landStreak = Math.min(12, this.landStreak + 1);
    this.lastLand = now;
    const sock = this.sockets.get(t.socket);
    if (sock && this.motion !== 'off') this.sparksAt(sock.x, sock.y, 4 + (this.landStreak % 3), t.kind === 'gem' ? 'rune' : 'gold', now, 60, 160, 260, 0, Math.PI * 2, 0, 'star');
    this.onLand?.(t.kind, t.ids, t.count, t.socket, this.landStreak);
  }

  private drawSparks(now: number, dt: number): void {
    const ctx = this.ctx;
    ctx.globalCompositeOperation = 'lighter';
    const step = Math.min(0.05, dt);
    for (const s of this.sparks) {
      if (!s.live) continue;
      const age = now - s.t0;
      if (age >= s.life) {
        s.live = false;
        continue;
      }
      const damp = Math.exp(-s.drag * step);
      s.vx *= damp;
      s.vy = s.vy * damp + s.gravity * step;
      s.x += s.vx * step;
      s.y += s.vy * step;
      const f = age / s.life;
      ctx.globalAlpha = (1 - f) * (1 - f);
      const size = s.size * (1 - 0.5 * f);
      ctx.drawImage(this.atlas.sprite(s.sprite, s.sprite === 'star' ? 12 : 8) as CanvasImageSource, s.x - size / 2, s.y - size / 2, size, size);
      this.draws++;
    }
    ctx.globalCompositeOperation = 'source-over';
    void SPARK_RGB;
  }

  private drawRings(now: number): void {
    const ctx = this.ctx;
    for (const r of this.rings) {
      if (!r.live) continue;
      const u = (now - r.t0) / r.ms;
      if (u >= 1) {
        r.live = false;
        continue;
      }
      const e = EASE.outExpo(u);
      ctx.globalAlpha = (1 - u) * 0.9;
      ctx.strokeStyle = `rgb(${r.rgb})`;
      ctx.lineWidth = r.width * (1 - 0.5 * u);
      ctx.beginPath();
      ctx.arc(r.x, r.y, r.r0 + (r.r1 - r.r0) * e, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
}

export { SPARK_RGB };
