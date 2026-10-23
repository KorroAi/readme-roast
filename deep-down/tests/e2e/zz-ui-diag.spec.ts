import { test, type Page } from '@playwright/test';
import { untilGame } from './dd';
import { PHONE, boot, newExpedition, quiet } from './r3';

// UI diagnostic (gate 03:32, r3-tap:135 "yaw turned by a 120 px drag ... 0.000 rad"): what is under
// (280, 300) in the first seconds of a new expedition, and does a drag from there look? Temporary.

test.use({ viewport: PHONE });

const OWN = 'button, input, select, a, .dd-screen, .dd-modal, [data-touch-ignore]';

async function under(page: Page, x: number, y: number) {
  return page.evaluate(([px, py, own]) => {
    const el = document.elementFromPoint(px, py) as HTMLElement | null;
    const desc = (e: Element | null) => (e ? `${e.tagName.toLowerCase()}.${[...e.classList].join('.')}` : 'none');
    const g = window.__DD__.game;
    const on = (sel: string) => !!document.querySelector(sel);
    return {
      t: Math.round(g.playTime * 10) / 10,
      el: desc(el),
      own: desc(el?.closest(own) ?? null),
      arrival: on('.dd-arrival.on'),
      discovery: on('.dd-discovery.on'),
      milestone: on('.dd-milestone.on'),
      tut: on('.dd-tut.on'),
      tip: on('.dd-tip.on'),
      screen: window.__DD__.state().screen,
      lock: g.input.lock,
      yaw: Math.round(g.cameraRig.yaw * 1000) / 1000,
    };
  }, [x, y, OWN] as const);
}

async function dragNow(page: Page, from: { x: number; y: number }, to: { x: number; y: number }, id = 4): Promise<void> {
  const cdp = await page.context().newCDPSession(page);
  const send = (type: 'touchStart' | 'touchMove' | 'touchEnd', pts: Array<{ x: number; y: number }>) =>
    cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map((p) => ({ ...p, id, radiusX: 8, radiusY: 8, force: 1 })) });
  const at = (k: number) => ({ x: from.x + (to.x - from.x) * k, y: from.y + (to.y - from.y) * k });
  const sent = [send('touchStart', [from])];
  for (let i = 1; i <= 8; i++) sent.push(send('touchMove', [at(i / 8)]));
  await Promise.all(sent);
  await send('touchEnd', []);
  await cdp.detach();
}

test('diag: what a drag at (280, 300) lands on at the start of an expedition', async ({ page }) => {
  await boot(page);
  await newExpedition(page, { tutorial: false });
  await quiet(page);
  await page.evaluate(() => {
    const w = window as unknown as { __pd: string[] };
    w.__pd = [];
    window.addEventListener('pointerdown', (e) => {
      const el = e.target as Element | null;
      w.__pd.push(`${el ? `${el.tagName.toLowerCase()}.${[...el.classList].join('.')}` : 'none'} prevented=${e.defaultPrevented}`);
    }, true);
  });
  const samples = [];
  for (let i = 0; i < 4; i++) {
    samples.push(await under(page, 280, 300));
    await page.waitForTimeout(150);
  }
  const before = await under(page, 280, 300);
  await dragNow(page, { x: 280, y: 300 }, { x: 160, y: 300 });
  await untilGame(page, async () => false, 1.5);
  const after = await under(page, 280, 300);
  const pd = await page.evaluate(() => (window as unknown as { __pd: string[] }).__pd);
  console.log(`[diag] samples ${JSON.stringify(samples)}`);
  console.log(`[diag] before ${JSON.stringify(before)}`);
  console.log(`[diag] after ${JSON.stringify(after)} turned ${(after.yaw - before.yaw).toFixed(3)} pointerdown ${JSON.stringify(pd)}`);
});
