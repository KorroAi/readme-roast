// UI check in real headless Chromium: screenshots every screen of the DOM UI at phone
// landscape, phone portrait and desktop sizes, then drives the touch controls with real
// touch events (CDP) and asserts what they write into InputState.
//
// Usage: node tools/ui-check.mjs [--out artifacts/ui] [--vp land,port,desk] [--scenes hud,hud:low+large+contrast] [--no-shots] [--no-touch] [--game]
// The page is the UI sandbox (src/ui/dev/sandbox.html): the real UI with fake game actions.
// --game also runs a smoke flow through the real game (index.html) on the same dev server.
import { chromium } from '@playwright/test';
import { createServer } from 'vite';
import { mkdirSync } from 'node:fs';

const args = process.argv.slice(2);
const opt = { out: 'artifacts/ui', vp: 'land,port,desk', scenes: '', shots: true, touch: true, game: false };
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === '--no-shots') opt.shots = false;
  else if (a === '--game') opt.game = true;
  else if (a === '--no-touch') opt.touch = false;
  else if (a.startsWith('--')) opt[a.slice(2)] = args[++i];
}

const VIEWPORTS = {
  land: { width: 915, height: 412, touch: true },
  port: { width: 390, height: 844, touch: true },
  desk: { width: 1280, height: 720, touch: false },
};
const SCENES = opt.scenes
  ? opt.scenes.split(',')
  : ['menu', 'menu:nosave', 'loading', 'hud', 'hud:low', 'discovery', 'inventory:backpack', 'inventory:storage', 'inventory:equipment', 'inventory:journal', 'crafting', 'settings', 'pause', 'confirm', 'death',
     // Accessibility variants: Large text, high contrast, left-handed controls.
     'hud:low+large+contrast', 'settings+large', 'crafting+large', 'inventory:backpack+contrast', 'hud+lefty'];

mkdirSync(opt.out, { recursive: true });
const server = await createServer({ server: { port: 5197, strictPort: false, hmr: false }, logLevel: 'error' });
await server.listen();
const base = server.resolvedUrls?.local?.[0] ?? 'http://localhost:5197/';
// "scene+flag+flag": flags are sandbox query switches (large, contrast, lefty).
const pageUrl = (scene) => {
  const [name, ...flags] = scene.split('+');
  return `${base}src/ui/dev/sandbox.html?scene=${encodeURIComponent(name)}${flags.map((f) => `&${f}=1`).join('')}`;
};
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const problems = [];

async function openPage(vp, scene) {
  const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: 1, hasTouch: vp.touch, isMobile: false });
  const page = await context.newPage();
  page.on('pageerror', (e) => problems.push(`[${scene}] pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') problems.push(`[${scene}] console.${m.type()}: ${m.text()}`);
  });
  await page.goto(pageUrl(scene));
  await page.waitForFunction(() => window.__UI__ !== undefined);
  return { page, context };
}

/** Layout audit: visible text clipped by its box, and interactive targets under 44 px. */
async function audit(page) {
  return page.evaluate(() => {
    const out = [];
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    for (const el of document.querySelectorAll('.dd-ui *:not(.dd-sr)')) {
      const cs = getComputedStyle(el);
      if (cs.visibility === 'hidden' || cs.display === 'none' || Number(cs.opacity) === 0) continue;
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      let hidden = false;
      for (let p = el; p && p !== document.body; p = p.parentElement) {
        const ps = getComputedStyle(p);
        if (ps.visibility === 'hidden' || ps.display === 'none' || Number(ps.opacity) === 0) hidden = true;
      }
      if (hidden) continue;
      const label = `${el.tagName.toLowerCase()}.${String(el.className).split(' ')[0]} "${(el.textContent || '').trim().slice(0, 30)}"`;
      if ((el.tagName === 'BUTTON' || el.tagName === 'INPUT') && !el.closest('[inert]') && (r.height < 44 || r.width < 44)) out.push(`small target ${Math.round(r.width)}x${Math.round(r.height)}: ${label}`);
      if (el.children.length === 0 && (el.textContent || '').trim() && cs.overflow !== 'visible' && el.scrollWidth > el.clientWidth + 1) out.push(`clipped text: ${label}`);
      const inScroll = el.closest('.dd-scroll');
      if (!inScroll && (r.right > vw + 1 || r.bottom > vh + 1 || r.left < -1 || r.top < -1) && !el.closest('.dd-stick')) out.push(`off-screen ${Math.round(r.left)},${Math.round(r.top)} ${Math.round(r.width)}x${Math.round(r.height)}: ${label}`);
    }
    return out;
  });
}

if (opt.shots) {
  for (const name of opt.vp.split(',')) {
    const vp = VIEWPORTS[name];
    for (const scene of SCENES) {
      const { page, context } = await openPage(vp, scene);
      await page.waitForTimeout(scene === 'discovery' ? 1100 : 600);
      const file = `${opt.out}/${scene.replace(':', '-').replaceAll('+', '_')}-${name}.png`;
      await page.screenshot({ path: file });
      const issues = await audit(page);
      console.log(`${file}${issues.length ? `\n  ${issues.join('\n  ')}` : ''}`);
      await context.close();
    }
  }
}

// ---------------------------------------------------------------------------------------
// Touch behaviour

const checks = [];
const check = (name, ok, detail) => {
  checks.push({ name, ok: !!ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail !== undefined ? ` ${JSON.stringify(detail)}` : ''}`);
};

if (opt.touch) {
  const vp = VIEWPORTS.land;
  const { page, context } = await openPage(vp, 'hud');
  const cdp = await context.newCDPSession(page);
  const touch = (type, points) =>
    cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points.map((p, i) => ({ x: p.x, y: p.y, id: p.id ?? i + 1, radiusX: 6, radiusY: 6, force: 1 })) });
  const input = () => page.evaluate(() => ({ ...window.__UI__.input }));
  const seen = () => page.evaluate(() => ({ ...window.__UI__.seen }));
  const wait = (ms) => page.waitForTimeout(ms);
  await wait(300);

  const env = await page.evaluate(() => ({ maxTouchPoints: navigator.maxTouchPoints, coarse: matchMedia('(any-pointer: coarse)').matches, touchUi: document.querySelector('.dd-ui').classList.contains('dd-touch-ui') }));
  check('touch UI detected with hasTouch', env.touchUi, env);

  // Joystick: full forward at the rim, partial sideways, dead zone, release to zero.
  await touch('touchStart', [{ x: 150, y: 300 }]);
  await touch('touchMove', [{ x: 150, y: 270 }]);
  await touch('touchMove', [{ x: 150, y: 240 }]);
  await wait(50);
  let s = await input();
  check('joystick forward at radius -> moveY 1', Math.abs(s.moveY - 1) < 1e-6 && Math.abs(s.moveX) < 1e-6, { moveX: s.moveX, moveY: s.moveY });
  await touch('touchMove', [{ x: 150, y: 180 }]);
  s = await input();
  check('joystick clamps beyond radius', Math.abs(s.moveY - 1) < 1e-6, { moveY: s.moveY });
  await touch('touchMove', [{ x: 170, y: 300 }]);
  s = await input();
  check('joystick partial right', s.moveX > 0.2 && s.moveX < 0.4 && Math.abs(s.moveY) < 1e-6, { moveX: s.moveX });
  await touch('touchMove', [{ x: 154, y: 302 }]);
  s = await input();
  check('joystick dead zone', s.moveX === 0 && s.moveY === 0, { moveX: s.moveX, moveY: s.moveY });
  await touch('touchMove', [{ x: 110, y: 300 }]);
  await touch('touchEnd', []);
  s = await input();
  check('joystick release -> 0', s.moveX === 0 && s.moveY === 0 && !s.mining, s);
  check('lastDevice touch', s.lastDevice === 'touch', s.lastDevice);

  // Look drag: accumulates CSS px deltas, never mines.
  let before = await seen();
  // Start and first move are pipelined so harness latency cannot turn the drag into a hold.
  await Promise.all([touch('touchStart', [{ x: 650, y: 200 }]), touch('touchMove', [{ x: 663, y: 202 }])]);
  for (let i = 3; i <= 10; i++) {
    await touch('touchMove', [{ x: 650 + i * 6, y: 200 + i }]);
    await wait(16);
  }
  await wait(250);
  s = await input();
  await touch('touchEnd', []);
  await wait(50);
  let after = await seen();
  const ldx = after.lookDX + s.lookDX - before.lookDX;
  const ldy = after.lookDY + s.lookDY - before.lookDY;
  check('look drag -> lookDX/lookDY', Math.abs(ldx - 60) < 1.5 && Math.abs(ldy - 10) < 1.5, { lookDX: ldx, lookDY: ldy });
  check('look drag never mines', after.miningFrames === before.miningFrames && !s.mining, { miningFrames: after.miningFrames - before.miningFrames });

  // Hold to mine: still for 140 ms -> mining at the finger in NDC; moving re-aims, no look.
  before = await seen();
  await touch('touchStart', [{ x: 600, y: 150 }]);
  await wait(100);
  s = await input();
  check('hold: not mining before 140 ms', !s.mining, { mining: s.mining });
  await wait(150);
  s = await input();
  const nx = (600 / vp.width) * 2 - 1;
  const ny = 1 - (150 / vp.height) * 2;
  check('hold: mining with pointer aim', s.mining && s.aimFromPointer && Math.abs(s.aimX - nx) < 0.01 && Math.abs(s.aimY - ny) < 0.01, { aimX: s.aimX, aimY: s.aimY, expect: [nx, ny] });
  await touch('touchMove', [{ x: 640, y: 120 }]);
  await touch('touchMove', [{ x: 700, y: 100 }]);
  await wait(60);
  s = await input();
  after = await seen();
  check('hold: moving re-aims', Math.abs(s.aimX - ((700 / vp.width) * 2 - 1)) < 0.01 && Math.abs(s.aimY - (1 - (100 / vp.height) * 2)) < 0.01, { aimX: s.aimX, aimY: s.aimY });
  check('hold: moving does not rotate the camera', after.lookDX === before.lookDX && after.lookDY === before.lookDY && s.lookDX === 0, { d: after.lookDX - before.lookDX });
  await touch('touchEnd', []);
  await wait(30);
  s = await input();
  check('hold: release stops mining, aim stays for the swing in flight', !s.mining && s.aimFromPointer, { mining: s.mining, aimFromPointer: s.aimFromPointer });

  // Quick tap: one short mining pulse at the tap point.
  await touch('touchStart', [{ x: 500, y: 300 }]);
  await wait(40);
  await touch('touchEnd', []);
  s = await input();
  check('tap: mining pulse starts', s.mining && Math.abs(s.aimX - ((500 / vp.width) * 2 - 1)) < 0.01, { mining: s.mining, aimX: s.aimX });
  await wait(320);
  s = await input();
  check('tap: pulse ends', !s.mining, { mining: s.mining });

  // Two fingers: joystick and look at the same time.
  before = await seen();
  await touch('touchStart', [{ x: 150, y: 300, id: 1 }]);
  await Promise.all([
    touch('touchStart', [{ x: 150, y: 300, id: 1 }, { x: 650, y: 200, id: 2 }]),
    touch('touchMove', [{ x: 150, y: 290, id: 1 }, { x: 665, y: 200, id: 2 }]),
  ]);
  for (let i = 2; i <= 6; i++) {
    await touch('touchMove', [{ x: 150, y: 300 - i * 10, id: 1 }, { x: 650 + i * 5, y: 200, id: 2 }]);
    await wait(16);
  }
  await wait(60);
  s = await input();
  await touch('touchEnd', []);
  await wait(40);
  after = await seen();
  check('multi-touch: move and look together', Math.abs(s.moveY - 1) < 1e-6 && Math.abs(after.lookDX + s.lookDX - before.lookDX - 30) < 1.5, { moveY: s.moveY, lookDX: after.lookDX - before.lookDX });
  s = await input();
  check('multi-touch: all released', s.moveY === 0 && !s.mining, s);

  // Jump button: edge + hold, and it never looks or mines.
  const jump = await page.locator('.dd-jump').boundingBox();
  before = await seen();
  await touch('touchStart', [{ x: jump.x + jump.width / 2, y: jump.y + jump.height / 2 }]);
  await wait(250);
  s = await input();
  check('jump held while pressed', s.jumpHeld && !s.mining, { jumpHeld: s.jumpHeld, mining: s.mining });
  await touch('touchEnd', []);
  await wait(40);
  s = await input();
  after = await seen();
  check('jump pressed once, released', after.jump === before.jump + 1 && !s.jumpHeld && after.lookDX === before.lookDX && after.miningFrames === before.miningFrames, { jumps: after.jump - before.jump });

  // Bag and Pause buttons open their screens; touches are ignored while a screen is open.
  await page.locator('.dd-tb-bag').tap();
  await wait(80);
  check('bag button opens inventory', (await page.evaluate(() => window.__UI__.ui.screen)) === 'inventory');
  await touch('touchStart', [{ x: 150, y: 300 }]);
  await touch('touchMove', [{ x: 150, y: 240 }]);
  s = await input();
  await touch('touchEnd', []);
  check('touch ignored under a screen', s.moveY === 0, { moveY: s.moveY });
  await page.getByRole('button', { name: /Close/i }).first().tap();
  await wait(80);
  await page.locator('.dd-tb-pause').tap();
  await wait(80);
  check('pause button opens pause', (await page.evaluate(() => window.__UI__.ui.screen)) === 'pause');
  await page.getByRole('button', { name: /Resume/i }).tap();
  await wait(80);

  // Use button appears with its label and triggers interact.
  await page.evaluate(() => {
    window.__UI__.hud.interactLabel = 'Workbench';
  });
  const use = page.getByRole('button', { name: /Workbench/i }).first();
  await use.waitFor({ state: 'visible', timeout: 2000 });
  before = await seen();
  await use.tap();
  await wait(100);
  after = await seen();
  check('use button -> interactPressed -> crafting', after.interact === before.interact + 1 && (await page.evaluate(() => window.__UI__.ui.screen)) === 'crafting', { interact: after.interact - before.interact });
  const craft = page.getByRole('button', { name: /^Craft/ }).first();
  check('crafting has a Craft button', await craft.isVisible());
  await page.getByRole('button', { name: /Close/i }).first().tap();
  await page.evaluate(() => {
    window.__UI__.hud.interactLabel = null;
  });
  await wait(80);

  // Notices: repeated pickups merge, toasts auto-dismiss, discoveries play in turn.
  await page.evaluate(() => {
    const ui = window.__UI__.ui;
    ui.pickup({ item: 'ironOre', count: 1 });
    ui.pickup({ item: 'ironOre', count: 2 });
    ui.toast('check-toast', 'info');
    ui.showDiscovery({ id: 'a', title: 'First Discovery', body: 'a' });
    ui.showDiscovery({ id: 'b', title: 'Second Discovery', body: 'b' });
  });
  await wait(300);
  const iron = await page.locator('.dd-pickup', { hasText: 'Iron Ore' }).allInnerTexts();
  check('pickups of one item merge into one line', iron.length === 1 && iron[0].includes('+3 Iron Ore'), iron);
  check('discovery banner shows the first', (await page.locator('.dd-discovery-title').textContent()) === 'First Discovery');
  await wait(4000);
  check('toast auto-dismisses', (await page.getByText('check-toast').count()) === 0);
  const second = await page
    .waitForFunction(() => document.querySelector('.dd-discovery-title')?.textContent === 'Second Discovery', null, { timeout: 4000 })
    .then(() => true, () => false);
  check('queued discovery plays next', second);

  // Left-handed: sides swap.
  await page.evaluate(() => window.__UI__.actions.updateSettings({ leftHanded: true }));
  await touch('touchStart', [{ x: 760, y: 300 }]);
  await touch('touchMove', [{ x: 760, y: 240 }]);
  s = await input();
  await touch('touchEnd', []);
  check('left-handed: joystick on the right', Math.abs(s.moveY - 1) < 1e-6, { moveY: s.moveY });
  await touch('touchStart', [{ x: 200, y: 150 }]);
  await wait(220);
  s = await input();
  await touch('touchEnd', []);
  check('left-handed: hold-to-mine on the left', s.mining, { mining: s.mining });
  await page.evaluate(() => window.__UI__.actions.updateSettings({ leftHanded: false }));
  await wait(260);

  // The mouse does not drive the touch layer unless the page opts in.
  await page.mouse.move(600, 150);
  await page.mouse.down();
  await wait(220);
  s = await input();
  await page.mouse.up();
  check('mouse ignored by default', !s.mining, { mining: s.mining });
  await page.evaluate(() => {
    document.documentElement.dataset.touchUi = '1';
  });
  await page.mouse.down();
  await wait(220);
  s = await input();
  await page.mouse.up();
  await wait(30);
  const s2 = await input();
  check('mouse drives it with data-touch-ui=1', s.mining && !s2.mining, { held: s.mining, released: s2.mining });

  await context.close();

  // Screen flows driven like a player would (mouse + keyboard), on the sandbox's fake game.
  {
    const { page: p, context: c } = await openPage(VIEWPORTS.desk, 'menu');
    const screen = () => p.evaluate(() => window.__UI__.ui.screen);
    await p.getByRole('button', { name: /New Expedition/i }).click();
    check('new expedition with a save asks first', (await screen()) === 'confirm' && (await p.getByText(/progress will be erased/i).isVisible()));
    await p.keyboard.press('Escape');
    check('escape cancels the confirm', (await screen()) === 'menu');
    await p.getByRole('button', { name: /Settings/i }).click();
    await p.getByRole('switch', { name: /Invert vertical/i }).click();
    check('settings apply immediately', (await p.evaluate(() => window.__UI__.settings().invertY)) === true);
    const slider = p.getByRole('slider', { name: /Master volume/i });
    await slider.focus();
    await p.keyboard.press('ArrowRight');
    await p.waitForTimeout(80);
    check('sliders apply (coalesced per frame)', Math.abs((await p.evaluate(() => window.__UI__.settings().masterVolume)) - 0.85) < 1e-6, await p.evaluate(() => window.__UI__.settings().masterVolume));
    await p.getByRole('button', { name: /Reset to defaults/i }).click();
    check('reset restores defaults', (await p.evaluate(() => window.__UI__.settings().invertY)) === false && (await p.getByRole('switch', { name: /Invert vertical/i }).getAttribute('aria-checked')) === 'false');
    await p.getByRole('button', { name: /Delete saved game/i }).click();
    await p.getByRole('button', { name: /^Delete$/ }).click();
    check('delete save removes it and disables the button', (await p.evaluate(() => window.__UI__.actions.hasSave())) === false && (await p.getByRole('button', { name: /Delete saved game/i }).isDisabled()));
    await p.keyboard.press('Escape');
    check('escape in settings returns to the menu', (await screen()) === 'menu');
    check('menu without a save has no Continue', (await p.getByRole('button', { name: /Continue/i }).count()) === 0);
    await p.keyboard.press('ArrowDown');
    const focused = await p.evaluate(() => document.activeElement?.textContent);
    check('arrow keys move focus through the menu', /New Expedition/.test(focused ?? ''), focused);
    await p.keyboard.press('Enter');
    await p.waitForFunction(() => window.__UI__.ui.screen === 'none', null, { timeout: 3000 });
    check('enter starts a new expedition without a confirm when there is no save', true);
    await c.close();
  }
}

// ---------------------------------------------------------------------------------------
// Real game smoke flow (--game): the same UI mounted by the actual Game on the dev server.

if (opt.game) {
  const vp = VIEWPORTS.land;
  const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, hasTouch: true });
  const page = await context.newPage();
  page.on('pageerror', (e) => problems.push(`[game] pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') problems.push(`[game] console.error: ${m.text()}`);
  });
  const st = () => page.evaluate(() => window.__DD__.state());
  const until = (fn, arg) => page.waitForFunction(fn, arg, { timeout: 120_000, polling: 100 });
  // Let screen fade-ins finish (SwiftShader frames are slow) before capturing.
  const shot = async (name) => {
    await page.waitForTimeout(700);
    await page.screenshot({ path: `${opt.out}/game-${name}.png` });
  };
  try {
    await gameFlow(page, st, until, shot);
  } catch (e) {
    await page.screenshot({ path: `${opt.out}/game-failure.png` });
    check('game: flow completed', false, String(e.message).split('\n')[0]);
  }
  await context.close();
}

async function gameFlow(page, st, until, shot) {
  await page.goto(`${base}index.html`);
  await until(() => window.__DD__?.ready && window.__DD__.state().mode === 'menu');
  await page.waitForTimeout(800);
  check('game: menu title attached', (await page.getByText('DEEP DOWN').count()) > 0);
  await page.getByRole('button', { name: /New Expedition/i }).click();
  await until(() => window.__DD__.state().mode === 'playing');
  await page.waitForTimeout(1200);
  await shot('hud');
  check('game: HUD shows depth', await page.getByText(/-\d+ m/).first().isVisible());

  await page.locator('.dd-tb-pause').tap();
  await until(() => window.__DD__.state().mode === 'paused');
  check('game: pause button pauses', (await st()).screen === 'pause');
  await page.getByRole('button', { name: /^Settings$/ }).tap();
  await until(() => window.__DD__.state().screen === 'settings');
  const fps = page.getByRole('switch', { name: /Show performance/i });
  await fps.tap();
  check('game: performance switch toggles', (await fps.getAttribute('aria-checked')) === 'true');
  await shot('settings');
  await page.getByRole('button', { name: /Back/i }).tap();
  await until(() => window.__DD__.state().screen === 'pause');
  check('game: settings back returns to pause', true);
  await page.getByRole('button', { name: /Resume/i }).tap();
  await until(() => window.__DD__.state().mode === 'playing' && window.__DD__.state().screen === 'none');
  // SwiftShader frames are slow; wait for the HUD to fade back in rather than sampling once.
  const perfOn = await page.locator('.dd-perf.on').waitFor({ state: 'visible', timeout: 5000 }).then(() => true, () => false);
  check('game: perf line visible after enabling it', perfOn, await page.locator('.dd-perf').innerText());

  await page.locator('.dd-tb-bag').tap();
  await until(() => window.__DD__.state().screen === 'inventory');
  await page.getByRole('tab', { name: /Equipment/i }).tap();
  check('game: equipment tab lists the rusty pickaxe', await page.getByText('Rusty Pickaxe').isVisible());
  await page.getByRole('button', { name: /Close/i }).tap();
  await until(() => window.__DD__.state().screen === 'none');

  const lm = await page.evaluate(() => window.__DD__.landmarks());
  const bench = await page.evaluate(([x, y, z]) => window.__DD__.standableNear(x, y, z + 1.6), lm.workbench);
  await page.evaluate(([x, y, z]) => window.__DD__.teleport(x, y, z), bench);
  await page.evaluate(() => {
    window.__DD__.give('copperOre', 8);
    window.__DD__.give('stone', 12);
  });
  const use = page.getByRole('button', { name: /Workbench/i }).first();
  await use.waitFor({ state: 'visible', timeout: 15_000 });
  await page.waitForTimeout(400);
  await shot('use');
  await use.tap();
  await until(() => window.__DD__.state().screen === 'crafting');
  await shot('crafting');
  await page.getByRole('button', { name: /^Craft/ }).first().tap();
  await until(() => window.__DD__.state().equipment.pickaxe === 2);
  check('game: crafting the copper pickaxe', true);
  check('game: craft button now reads Owned', await page.getByRole('button', { name: /Owned/ }).first().isVisible());
  await page.getByRole('button', { name: /Close/i }).first().tap();
  await until(() => window.__DD__.state().screen === 'none');

  await page.locator('.dd-tb-pause').tap();
  await page.getByRole('button', { name: /Save and Quit/i }).tap();
  await until(() => window.__DD__.state().mode === 'menu');
  const cont = page.getByRole('button', { name: /Continue/i });
  await cont.waitFor({ state: 'visible' });
  check('game: menu offers Continue with save time', /Last saved/.test(await cont.innerText()));
  await shot('menu-continue');
  await cont.click();
  await until(() => window.__DD__.state().mode === 'playing');
  check('game: continue restores the crafted pickaxe', (await st()).equipment.pickaxe === 2);
}

await browser.close();
await server.close();

if (problems.length) console.log(`\nConsole problems:\n  ${problems.join('\n  ')}`);
const failed = checks.filter((c) => !c.ok);
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed, ${problems.length} console problems`);
process.exit(failed.length || problems.length ? 1 : 0);
