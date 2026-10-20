import type { CDPSession, Page } from '@playwright/test';

/** Real touch input through the Chrome DevTools Protocol (Playwright only offers taps). Every e2e tap is one of these. */
export class Touch {
  private constructor(private readonly cdp: CDPSession, private readonly page: Page) {}

  static async attach(page: Page): Promise<Touch> {
    return new Touch(await page.context().newCDPSession(page), page);
  }

  private async send(type: 'touchStart' | 'touchMove' | 'touchEnd', points: Array<{ x: number; y: number; id: number }>): Promise<void> {
    await this.cdp.send('Input.dispatchTouchEvent', {
      type,
      touchPoints: points.map((p) => ({ x: p.x, y: p.y, id: p.id, radiusX: 8, radiusY: 8, force: 1 })),
    });
  }

  /** Press at a point, slide to another, hold there for `holdMs`, release. */
  async drag(from: { x: number; y: number }, to: { x: number; y: number }, holdMs: number, id = 1): Promise<void> {
    await this.send('touchStart', [{ ...from, id }]);
    const steps = 8;
    for (let i = 1; i <= steps; i++) {
      await this.send('touchMove', [{ x: from.x + ((to.x - from.x) * i) / steps, y: from.y + ((to.y - from.y) * i) / steps, id }]);
      await this.page.waitForTimeout(16);
    }
    await this.page.waitForTimeout(holdMs);
    await this.send('touchEnd', []);
  }

  /** Press and hold without moving (hold-to-mine). */
  async hold(at: { x: number; y: number }, ms: number, id = 2): Promise<void> {
    await this.send('touchStart', [{ ...at, id }]);
    await this.page.waitForTimeout(ms);
    await this.send('touchEnd', []);
  }

  /** Finger down (for holds that end on a condition). */
  async down(at: { x: number; y: number }, id = 2): Promise<void> {
    await this.send('touchStart', [{ ...at, id }]);
  }

  async up(): Promise<void> {
    await this.send('touchEnd', []);
  }

  async tap(at: { x: number; y: number }): Promise<void> {
    await this.hold(at, 60, 3);
  }

  // ----- the idle game (SPEC §3.1): the floor's 7 columns come from __DD__.idle.columns() -----------------

  /** A quick tap at (x, y): down and up with no wait between (the CDP round trip is the press). */
  async tapAt(x: number, y: number, id = 4): Promise<void> {
    await this.send('touchStart', [{ x, y, id }]);
    await this.send('touchEnd', []);
  }

  /** The centre of column `c` (0..6) at the floor row, `dy` px below the floor line (inside the floor cell). */
  async columnPoint(c: number, dy = 18): Promise<{ x: number; y: number }> {
    const cols = await this.page.evaluate(() => (window as unknown as { __DD__: { idle: { columns(): { strips: Array<{ left: number; right: number }>; floorY: number } } } }).__DD__.idle.columns());
    const s = cols.strips[Math.max(0, Math.min(6, c))];
    return { x: (s.left + s.right) / 2, y: cols.floorY + dy };
  }

  /** Tap column `c` at the floor. */
  async tapColumn(c: number): Promise<void> {
    const p = await this.columnPoint(c);
    await this.tapAt(p.x, p.y);
  }

  /** Hold column `c` for `ms` (the hold stream starts after 250 ms). */
  async holdColumn(c: number, ms: number): Promise<void> {
    const p = await this.columnPoint(c);
    await this.hold(p, ms, 5);
  }

  /** Swipe along the floor from column c0 to column c1 over `ms`, in ~16 ms moves. */
  async swipe(c0: number, c1: number, ms: number): Promise<void> {
    const a = await this.columnPoint(c0);
    const b = await this.columnPoint(c1);
    const steps = Math.max(4, Math.round(ms / 16));
    const t0 = Date.now();
    await this.send('touchStart', [{ ...a, id: 6 }]);
    for (let i = 1; i <= steps; i++) {
      const f = i / steps;
      await this.send('touchMove', [{ x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f, id: 6 }]);
      const wait = t0 + f * ms - Date.now();
      if (wait > 0) await this.page.waitForTimeout(wait);
    }
    await this.send('touchEnd', []);
  }
}
