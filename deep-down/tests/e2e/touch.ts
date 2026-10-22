import type { CDPSession, Page } from '@playwright/test';

/**
 * Real touch input through the Chrome DevTools Protocol (Playwright only offers taps).
 *
 * Under load SwiftShader acks a CDP touch event in seconds, so a gesture whose events are awaited one
 * by one reaches the page stretched (a tap reads as a long-press, a drag's first move as a hold): a
 * tap sends its start and end together, and a drag its start with its moves (QA, 20:36).
 */
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
    await this.press(from, to, id, 8);
    await this.page.waitForTimeout(holdMs);
    await this.send('touchEnd', []);
  }

  /**
   * Press at a point and slide to another, staying down (end it with up()). The start and every move
   * go out together: each event is acked in seconds under load, and the page coalesces the moves
   * into the frames it draws, so the slide arrives whole whatever the harness latency.
   */
  async press(from: { x: number; y: number }, to: { x: number; y: number }, id = 1, steps = 4): Promise<void> {
    const at = (i: number) => ({ x: from.x + ((to.x - from.x) * i) / steps, y: from.y + ((to.y - from.y) * i) / steps, id });
    // Sent in order (the start first): each send goes out when called, the awaits come after.
    const sent: Array<Promise<void>> = [this.send('touchStart', [{ ...from, id }])];
    for (let i = 1; i <= steps; i++) sent.push(this.send('touchMove', [at(i)]));
    await Promise.all(sent);
  }

  /** Slide a finger that is down from one point to another (its moves pipelined, see press). */
  async slide(from: { x: number; y: number }, to: { x: number; y: number }, id = 1, steps = 4): Promise<void> {
    const sent: Array<Promise<void>> = [];
    for (let i = 1; i <= steps; i++) sent.push(this.send('touchMove', [{ x: from.x + ((to.x - from.x) * i) / steps, y: from.y + ((to.y - from.y) * i) / steps, id }]));
    await Promise.all(sent);
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

  /** A quick tap: the start and the end sent together (a tap, never a long-press, whatever the load). */
  async tap(at: { x: number; y: number }): Promise<void> {
    await Promise.all([this.send('touchStart', [{ ...at, id: 3 }]), this.send('touchEnd', [])]);
  }
}
