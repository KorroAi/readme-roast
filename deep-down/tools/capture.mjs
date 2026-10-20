// Capture real WebGL screenshots of the idle game in headless Chromium (SwiftShader), portrait by default.
//
// Usage:
//   node tools/capture.mjs [--page index.html] [--out artifacts/idle/w1] [--size 390x844] [--dpr 2] [--wait 1500]
//                          [--prefix w1-c-] scene|name=query [...]
//
// A bare word runs a built-in scene (below): a scripted path through the game with REAL touches (CDP) and the
// __DD__.idle surface only for setting up a state (gold, a depth, the clock). `name=query` loads `${page}?${query}`
// and shoots once the first frame drew. Scenes: first-launch, first-coin, hud-20m, dig-sheet, quickbuy-states, star,
// return-feast, legacy-notice; `all` runs every scene, then hud-20m at 360x740 and 412x915.
import { chromium } from '@playwright/test';
import { createServer } from 'vite';
import { mkdirSync } from 'node:fs';

const args = process.argv.slice(2);
const opt = { page: 'index.html', out: 'artifacts/idle/w1', size: '390x844', wait: '1500', dpr: '2', timeout: '180000', prefix: 'w1-c-' };
const shots = [];
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a.startsWith('--')) opt[a.slice(2)] = args[++i];
  else {
    const eq = a.indexOf('=');
    shots.push(eq > 0 ? { name: a.slice(0, eq), query: a.slice(eq + 1) } : { scene: a });
  }
}
if (!shots.length) shots.push({ scene: 'first-launch' });
mkdirSync(opt.out, { recursive: true });
const size = (s) => s.split('x').map(Number);

// ---------------------------------------------------------------------------------------------------------------
// Real touches through CDP (the same as tests/e2e/touch.ts).

class Touch {
  constructor(cdp, page) {
    this.cdp = cdp;
    this.page = page;
  }
  static async attach(page) {
    return new Touch(await page.context().newCDPSession(page), page);
  }
  async send(type, pts) {
    await this.cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map((p) => ({ x: p.x, y: p.y, id: p.id ?? 1, radiusX: 8, radiusY: 8, force: 1 })) });
  }
  async tap(x, y) {
    await this.send('touchStart', [{ x, y, id: 3 }]);
    await this.page.waitForTimeout(40);
    await this.send('touchEnd', []);
  }
  async hold(x, y, ms) {
    await this.send('touchStart', [{ x, y, id: 5 }]);
    await this.page.waitForTimeout(ms);
    await this.send('touchEnd', []);
  }
  async rect(key) {
    const r = await this.page.evaluate((k) => window.__DD__.idle.hud().rects[k], key);
    if (!r || !r.visible) throw new Error(`no visible ${key}`);
    return r;
  }
  async tapRect(key) {
    const r = await this.rect(key);
    await this.tap(r.x + r.w / 2, r.y + r.h / 2);
  }
  async tapColumn(c) {
    const p = await this.page.evaluate((col) => {
      const cs = window.__DD__.idle.columns();
      const s = cs.strips[col];
      return { x: (s.left + s.right) / 2, y: cs.floorY + 18 };
    }, c);
    await this.tap(p.x, p.y);
  }
}

const frames = (page) => page.evaluate(() => window.__DD__.idle.frame());
async function waitFrames(page, n) {
  const f0 = await frames(page);
  await page.waitForFunction((t) => window.__DD__.idle.frame() >= t, f0 + n, { timeout: Number(opt.timeout), polling: 50 });
}
async function ready(page) {
  await page.waitForFunction(() => window.__DD__?.idle?.ready === true, null, { timeout: Number(opt.timeout), polling: 250 });
}
async function mode(page, m) {
  await page.waitForFunction((x) => window.__DD__?.idle?.ready === true && window.__DD__.idle.mode() === x, m, { timeout: Number(opt.timeout), polling: 250 });
}

/** Dig with real taps until `done` (a page-side expression over d = __DD__.idle) holds. */
async function digUntil(page, touch, done, max = 400) {
  for (let i = 0; i < max; i++) {
    if (i % 4 === 0 && (await page.evaluate(`((d) => ${done})(window.__DD__.idle)`))) return;
    await touch.tapColumn(2 + (i % 3));
    await page.waitForTimeout(120);
    if (i % 6 === 5) await waitFrames(page, 1);
  }
}

/** The quick-buy card views (cost and BEST), from the game. */
const quickViews = (page) => page.evaluate(() => window.__DD__.internals.game.quick().map((v) => (v ? { id: v.id, cost: v.costLog10, best: v.best } : null)));

/** The common early game: the Pick and the Shovel Hand bought with taps, then a depth. */
async function earlyGame(page, touch, depth) {
  await digUntil(page, touch, "d.hud().quick[0].state === 'ready'");
  await touch.tapRect('quick:0');
  await page.evaluate(() => window.__DD__.idle.give({ gold: 60 }));
  await waitFrames(page, 2);
  await digUntil(page, touch, "d.hud().quick[2].state === 'ready'", 60);
  await touch.tapRect('quick:2');
  await waitFrames(page, 2);
  if (depth) {
    await page.evaluate((m) => window.__DD__.idle.setDepth(m), depth);
    await page.evaluate(() => window.__DD__.idle.give({ gold: 400 }));
    // The slabs and the crew settle at the new depth.
    for (let i = 0; i < 6; i++) {
      await touch.tapColumn(3);
      await page.waitForTimeout(150);
    }
    await waitFrames(page, 8);
  }
}

const SCENES = {
  /** The first frame of a new game: the shaft at the surface, the goal bar, the ghost hand on the rock. */
  async 'first-launch'(page) {
    await mode(page, 'playing');
    await page.waitForFunction(() => !!window.__DD__.idle.guidePoint(), null, { timeout: 60_000 });
    await waitFrames(page, 4);
    await page.waitForTimeout(600);
  },
  /** The first tap: a coin mid-flight with its trail (the FX clock held for the shot). */
  async 'first-coin'(page, touch) {
    await mode(page, 'playing');
    await waitFrames(page, 3);
    const p = await page.evaluate(() => window.__DD__.idle.guidePoint());
    // Freeze the FX clock in the first frame where a coin is past its pop and into the flight.
    await page.evaluate(() => {
      const fx = window.__DD__.internals.fx;
      const tick = () => {
        const f = window.__DD__.idle.fx().flights.find((x) => x.landed === 0);
        const now = performance.now();
        if (f && now - f.launched > 430 && now - f.launched < 640) {
          fx.frozenAt = now;
          return;
        }
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    for (let i = 0; i < 3; i++) {
      await touch.tap(p ? p.x : 195, p ? p.y + 6 : 600);
      await page.waitForTimeout(90);
    }
    await page.waitForFunction(() => window.__DD__.internals.fx.frozenAt !== null, null, { timeout: 60_000, polling: 30 });
    await waitFrames(page, 1);
    return async () => page.evaluate(() => (window.__DD__.internals.fx.frozenAt = null));
  },
  /** The HUD at 20 m: every W1 plate, the ruler, the quick-buy row, the crew digging. */
  async 'hud-20m'(page, touch) {
    await mode(page, 'playing');
    await earlyGame(page, touch, 20);
  },
  /** The Dig sheet open: the floor re-framed above it. */
  async 'dig-sheet'(page, touch) {
    await mode(page, 'playing');
    await earlyGame(page, touch, 20);
    await touch.tapRect('tab:dig');
    await page.waitForFunction(() => window.__DD__.idle.hud().sheet === 'dig', null, { timeout: 30_000 });
    await waitFrames(page, 6);
    await page.waitForTimeout(700);
  },
  /** Quick-buy states at once: one ready, BEST near (≥ 85 %), one not affordable. */
  async 'quickbuy-states'(page, touch) {
    await mode(page, 'playing');
    await earlyGame(page, touch, 12);
    for (let k = 0; k < 24; k++) {
      const v = (await quickViews(page)).filter(Boolean);
      const best = v.find((x) => x.best);
      const others = v.filter((x) => !x.best).sort((a, b) => a.cost - b.cost);
      if (best && others.length && others[0].cost < best.cost + Math.log10(0.86)) {
        const target = Math.max(others[0].cost, best.cost + Math.log10(0.9));
        const now = await page.evaluate(() => window.__DD__.idle.ledger().actualLog10);
        await page.evaluate((add) => window.__DD__.idle.give({ gold: add }), Math.max(0, Math.pow(10, target) - Math.pow(10, Number.isFinite(now) ? now : 0)) + 0.5);
        await waitFrames(page, 4);
        break;
      }
      // BEST is the cheapest: buy it once so the others become the cheaper ones.
      await page.evaluate((c) => window.__DD__.idle.give({ gold: Math.pow(10, c) + 1 }), best ? best.cost : 1);
      await waitFrames(page, 2);
      const slot = (await page.evaluate(() => window.__DD__.idle.hud().quick)).find((q) => q.best)?.slot ?? 0;
      await touch.tapRect(`quick:${slot}`);
      await waitFrames(page, 2);
    }
    await page.waitForTimeout(500);
  },
  /** The first ★: the Shovel Hand's 10th level, the stamp on screen. */
  async star(page, touch) {
    await mode(page, 'playing');
    await earlyGame(page, touch, 12);
    await page.evaluate(() => window.__DD__.idle.give({ gold: 1e5 }));
    await waitFrames(page, 2);
    for (let i = 0; i < 20; i++) {
      const lv = await page.evaluate(() => window.__DD__.internals.game.state.run.lines[0]);
      if (lv >= 10) break;
      await touch.tapRect('quick:2');
      await page.waitForTimeout(80);
      if (await page.evaluate(() => !!document.querySelector('.dd-stamp:not(.hide)'))) break;
    }
    await page.waitForFunction(() => !!document.querySelector('.dd-stamp:not(.hide)'), null, { timeout: 30_000, polling: 30 });
  },
  /** Back after two hours: the return feast's plate and count-up. */
  async 'return-feast'(page, touch) {
    await mode(page, 'playing');
    await earlyGame(page, touch, 14);
    const nav = page.waitForNavigation({ timeout: 60_000 }).catch(() => undefined);
    await page.evaluate(() => window.__DD__.idle.offline(2)).catch(() => undefined);
    await nav;
    await mode(page, 'menu');
    await waitFrames(page, 3);
    const r = await page.evaluate(() => {
      const b = document.querySelector('[data-key="continue"]');
      const q = b?.getBoundingClientRect();
      return q ? { x: q.left + q.width / 2, y: q.top + q.height / 2 } : null;
    });
    if (r) await touch.tap(r.x, r.y);
    await page.waitForFunction(() => window.__DD__.idle.hud().feast !== '', null, { timeout: 60_000 });
    await waitFrames(page, 6);
    await page.waitForTimeout(900);
  },
  /** A save of the old cave game: the one-line notice over a fresh descent. */
  async 'legacy-notice'(page) {
    await mode(page, 'playing');
    await page.waitForFunction(() => window.__DD__.idle.hud().legacyNotice, null, { timeout: 30_000 });
    await waitFrames(page, 3);
    await page.waitForTimeout(500);
  },
};

/** Init scripts per scene (before the page's own). */
const INIT = {
  'legacy-notice': () => {
    if (sessionStorage.getItem('planted')) return;
    sessionStorage.setItem('planted', '1');
    const v2 = JSON.stringify({ version: 2, genVersion: 3, savedAt: 1, worldSeed: 1, playTime: 900, player: { x: 1, y: 2, z: 3, yaw: 0, health: 100 }, backpack: [], storage: {} });
    let h = 0x811c9dc5;
    for (let i = 0; i < v2.length; i++) {
      h ^= v2.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    localStorage.setItem('deepdown.save.a', JSON.stringify({ checksum: (h >>> 0).toString(16).padStart(8, '0'), json: v2 }));
    localStorage.setItem('deepdown.save.active', 'a');
    localStorage.removeItem('deepdown.legacyNoticeShown');
  },
};

const plan = [];
for (const s of shots) {
  if (s.scene === 'all') {
    for (const k of Object.keys(SCENES)) plan.push({ scene: k, size: opt.size });
    plan.push({ scene: 'hud-20m', size: '360x740', name: '360x740' });
    plan.push({ scene: 'hud-20m', size: '412x915', name: '412x915' });
  } else plan.push({ ...s, size: opt.size });
}

const server = await createServer({ server: { port: 5199, strictPort: false, hmr: false }, logLevel: 'error' });
await server.listen();
const url = server.resolvedUrls?.local?.[0] ?? `http://localhost:${server.config.server.port ?? 5199}/`;
const browser = await chromium.launch({
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'],
});
let failed = 0;
try {
  for (const shot of plan) {
    const [width, height] = size(shot.size);
    const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: Number(opt.dpr), hasTouch: true });
    const page = await context.newPage();
    const logs = [];
    page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
    page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
    if (shot.scene && INIT[shot.scene]) await page.addInitScript(INIT[shot.scene]);
    const t0 = Date.now();
    const name = `${opt.prefix}${shot.name ?? shot.scene}`;
    try {
      await page.goto(`${url}${opt.page}${shot.query ? `?${shot.query}` : ''}`);
      await ready(page);
      let after = null;
      if (shot.scene) {
        const fn = SCENES[shot.scene];
        if (!fn) throw new Error(`unknown scene ${shot.scene} (${Object.keys(SCENES).join(', ')})`);
        after = await fn(page, await Touch.attach(page));
      } else await page.waitForTimeout(Number(opt.wait));
      const file = `${opt.out}/${name}.png`;
      await page.screenshot({ path: file });
      if (after) await after();
      const perf = await page.evaluate(() => window.__DD__.idle.perf());
      console.log(`[${name}] ${file} ${Date.now() - t0} ms (${perf.fps} fps)`);
    } catch (e) {
      failed++;
      console.log(`[${name}] FAILED: ${e.message}\n${logs.slice(-8).join('\n')}`);
    }
    const errs = logs.filter((l) => l.startsWith('[error]') || l.startsWith('[pageerror]'));
    if (errs.length) console.log(errs.slice(0, 8).join('\n'));
    await context.close();
  }
} finally {
  await browser.close();
  await server.close();
}
process.exit(failed ? 1 : 0);
