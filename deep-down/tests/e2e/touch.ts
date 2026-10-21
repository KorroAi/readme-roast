import type { CDPSession, Page } from '@playwright/test';

/**
 * Real touch input through the Chrome DevTools Protocol (Playwright only offers taps). Every e2e touch is one of these.
 *
 * Each gesture stamps its events with the time the finger made them (CDP `timestamp`), so the game measures a tap's
 * 60 ms, a hold's 250 ms and a drag's travel at the finger even when SwiftShader renders a frame in 100–700 ms and
 * CDP delivers the events late (the game reads `event.timeStamp`, src/ui/hybrid/TapSurface.ts).
 */
export class Touch {
  private constructor(private readonly cdp: CDPSession, private readonly page: Page) {}

  static async attach(page: Page): Promise<Touch> {
    return new Touch(await page.context().newCDPSession(page), page);
  }

  private async send(type: 'touchStart' | 'touchMove' | 'touchEnd', points: Array<{ x: number; y: number; id: number }>, at?: number): Promise<void> {
    await this.cdp.send('Input.dispatchTouchEvent', {
      type,
      touchPoints: points.map((p) => ({ x: p.x, y: p.y, id: p.id, radiusX: 8, radiusY: 8, force: 1 })),
      ...(at !== undefined ? { timestamp: at / 1000 } : {}),
    });
  }

  /**
   * A gesture with the finger's own times: `path` points with `t` ms after the press (the first is the press, the last
   * the release point). The events are sent as fast as the page takes them, each stamped with its intended time.
   */
  async gesture(path: ReadonlyArray<{ x: number; y: number; t: number }>, id = 1): Promise<void> {
    const t0 = Date.now();
    const first = path[0];
    await this.send('touchStart', [{ x: first.x, y: first.y, id }], t0);
    for (let i = 1; i < path.length - 1; i++) {
      const p = path[i];
      const wait = t0 + p.t - Date.now();
      if (wait > 0) await this.page.waitForTimeout(wait);
      await this.send('touchMove', [{ x: p.x, y: p.y, id }], t0 + p.t);
    }
    const last = path[path.length - 1];
    if (path.length > 1) {
      const wait = t0 + last.t - Date.now();
      if (wait > 0) await this.page.waitForTimeout(wait);
      if (last.x !== path[path.length - 2]?.x || last.y !== path[path.length - 2]?.y) await this.send('touchMove', [{ x: last.x, y: last.y, id }], t0 + last.t);
    }
    await this.send('touchEnd', [], t0 + (path.length > 1 ? last.t : 60));
  }

  /** A quick tap (down and up 60 ms apart by the finger's clock). */
  async tap(at: { x: number; y: number }, ms = 60): Promise<void> {
    await this.gesture([{ ...at, t: 0 }, { ...at, t: ms }], 3);
  }

  /** A quick tap at (x, y). */
  async tapAt(x: number, y: number, id = 4): Promise<void> {
    await this.gesture([{ x, y, t: 0 }, { x, y, t: 60 }], id);
  }

  /** Press and hold without moving for `ms` (the hold stream starts after 250 ms). */
  async hold(at: { x: number; y: number }, ms: number, id = 2): Promise<void> {
    const t0 = Date.now();
    await this.send('touchStart', [{ ...at, id }], t0);
    await this.page.waitForTimeout(ms);
    await this.send('touchEnd', [], t0 + ms);
  }

  /**
   * A drag (Explore's look): from a point by (dx, dy) over `ms`, in `steps` moves, then release. The first move already
   * leaves the 12 px slop (a real swipe does within a frame), so a long SwiftShader frame never shows a still finger.
   */
  async drag(from: { x: number; y: number }, dx: number, dy: number, ms = 300, steps = Math.max(1, Math.min(10, Math.floor(Math.hypot(dx, dy) / 16))), id = 1): Promise<void> {
    const path = [{ ...from, t: 0 }];
    for (let i = 1; i <= steps; i++) path.push({ x: from.x + (dx * i) / steps, y: from.y + (dy * i) / steps, t: (ms * i) / steps });
    path.push({ x: from.x + dx, y: from.y + dy, t: ms + 16 });
    await this.gesture(path, id);
  }

  /** Finger down (for holds that end on a condition). */
  async down(at: { x: number; y: number }, id = 2): Promise<void> {
    await this.send('touchStart', [{ ...at, id }], Date.now());
  }

  async up(): Promise<void> {
    await this.send('touchEnd', [], Date.now());
  }
}
