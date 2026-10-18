import type { CDPSession, Page } from '@playwright/test';

/** Real touch input through the Chrome DevTools Protocol (Playwright only offers taps). */
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

  async tap(at: { x: number; y: number }): Promise<void> {
    await this.hold(at, 60, 3);
  }
}
