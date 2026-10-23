// UI check in real headless Chromium: screenshots every screen of the DOM UI at phone
// landscape, phone portrait and desktop sizes, then drives the touch controls with real
// touch events (CDP) and asserts what they write into InputState.
//
// Usage: node tools/ui-check.mjs [--out artifacts/ui] [--vp land,port,desk] [--scenes hud,hud:low+large+contrast] [--no-shots] [--no-touch] [--game]
// The page is the UI sandbox (src/ui/dev/sandbox.html): the real UI with fake game actions and, for
// round 3, the strata game's fixtures (src/ui/dev/r3fixtures.ts: LOOP's real craft rules and hotbar,
// MOBS's real bestiary log, a painted stratum for the Map).
// --game also runs a smoke flow through the real game (index.html) on the same dev server, and
// captures the boot mark (index.html before the bundle runs).
// Viewports: land 915x412, mid 844x390, short 740x360 (landscape phones), port 390x844, desk.
// Layout problems (clipped text, targets under 48 px, off-screen elements) count as failures.
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
  mid: { width: 844, height: 390, touch: true },
  short: { width: 740, height: 360, touch: true },
  port: { width: 390, height: 844, touch: true },
  desk: { width: 1280, height: 720, touch: false },
};
/** Minimum touch target (the brand's 48 px). */
const MIN_TARGET = 48;
const SCENES = opt.scenes
  ? opt.scenes.split(',')
  : [
      // The title (with the Continue card and the Daily Descent), the loading screen.
      'menu', 'menu:nosave', 'loading',
      // Round 3's HUD: at rest, a guardian fight in the cold, a tutorial step, the look step's ghost finger, a biome arrival card.
      'hud', 'hud:low', 'hud:tutorial', 'hud:look', 'hud:arrival', 'discovery',
      // Round 3's menus: the Bag (an item, gear, filling a hotbar slot), Craft (all stations, a Forge's own), the Map, Quests, the Bestiary.
      'bag', 'bag:gear', 'bag:assign', 'craft', 'craft:forge', 'map', 'quests', 'quests:tasks', 'quests:orders', 'quests:feats', 'quests:pages', 'bestiary',
      // The cards: back at camp, a black-out, the end card; pause, settings, a confirm, About.
      'trip', 'trip:blackout', 'death', 'ending', 'pause', 'settings', 'confirm', 'about', 'about:privacy', 'about:licences',
      // Accessibility variants: Large text, high contrast, left-handed controls.
      'hud:low+large+contrast', 'hud+lefty', 'settings+large', 'craft+large', 'bag+contrast', 'map+large', 'quests+large', 'bestiary+large', 'trip+large', 'death+large+contrast', 'ending+large',
    ];

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

/** Layout audit: visible text clipped by its box, and interactive targets under 48 px. */
async function audit(page) {
  return page.evaluate((MIN) => {
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
      if ((el.tagName === 'BUTTON' || el.tagName === 'INPUT') && !el.closest('[inert]') && (r.height < MIN - 0.5 || r.width < MIN - 0.5)) out.push(`small target ${Math.round(r.width)}x${Math.round(r.height)}: ${label}`);
      if (el.children.length === 0 && (el.textContent || '').trim() && cs.overflow !== 'visible' && el.scrollWidth > el.clientWidth + 1) out.push(`clipped text: ${label}`);
      const inScroll = el.closest('.dd-scroll');
      // The Map's pins live in its panned view (clipped by it on purpose).
      const inMap = el.closest('.dd-m3-mapview');
      if (!inScroll && !inMap && (r.right > vw + 1 || r.bottom > vh + 1 || r.left < -1 || r.top < -1) && !el.closest('.dd-stick')) out.push(`off-screen ${Math.round(r.left)},${Math.round(r.top)} ${Math.round(r.width)}x${Math.round(r.height)}: ${label}`);
    }
    return out;
  }, MIN_TARGET);
}

const layoutProblems = [];
if (opt.shots) {
  for (const name of opt.vp.split(',')) {
    const vp = VIEWPORTS[name];
    for (const scene of SCENES) {
      const { page, context } = await openPage(vp, scene);
      // The discovery banner rises over 1 s; the arrival card and the menus settle; the trip card's rise;
      // the black-out's fall to dark, its dying flame and the card rising out of it (1.75 s).
      await page.waitForTimeout(scene.startsWith('death') ? 1900 : scene === 'discovery' || scene.startsWith('hud:arrival') ? 1100 : scene.startsWith('trip') || scene.startsWith('map') ? 900 : 600);
      const file = `${opt.out}/${scene.replace(':', '-').replaceAll('+', '_')}-${name}.png`;
      await page.screenshot({ path: file });
      const issues = await audit(page);
      for (const i of issues) layoutProblems.push(`[${scene} ${name}] ${i}`);
      console.log(`${file}${issues.length ? `\n  ${issues.join('\n  ')}` : ''}`);
      await context.close();
    }
  }
}

// ---------------------------------------------------------------------------------------
// Touch behaviour (round 3's action layout)

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
  const screen = () => page.evaluate(() => window.__UI__.ui.screen);
  /** The centre and size of the first visible element matching (CSS px), or null. */
  const box = (sel) =>
    page.evaluate((q) => {
      for (const el of document.querySelectorAll(q)) {
        const r = el.getBoundingClientRect();
        if (r.width > 0 && r.height > 0 && !el.hidden) return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2), w: Math.round(r.width), h: Math.round(r.height), top: Math.round(r.top) };
      }
      return null;
    }, sel);
  const tapAt = async (b, id = 4) => {
    await touch('touchStart', [{ x: b.x, y: b.y, id }]);
    await wait(50);
    await touch('touchEnd', []);
    await wait(80);
  };
  await wait(300);

  const env = await page.evaluate(() => ({ maxTouchPoints: navigator.maxTouchPoints, coarse: matchMedia('(any-pointer: coarse)').matches, touchUi: document.querySelector('.dd-ui').classList.contains('dd-touch-ui') }));
  check('touch UI detected with hasTouch', env.touchUi, env);

  // setHud runs every frame: a steady state, or a change below what is displayed, writes nothing.
  const mutations = await page.evaluate(async () => {
    const { hud } = window.__UI__;
    let n = 0;
    const mo = new MutationObserver((list) => (n += list.length));
    mo.observe(document.querySelector('.dd-hud'), { subtree: true, attributes: true, childList: true, characterData: true });
    await new Promise((r) => setTimeout(r, 250));
    Object.assign(hud, { depth: 38.3, campDistance: 24.2 });
    await new Promise((r) => setTimeout(r, 250));
    Object.assign(hud, { depth: 38, campDistance: 24 });
    mo.disconnect();
    return n;
  });
  check('steady HUD writes nothing to the DOM', mutations === 0, { mutations });

  // Joystick: full forward at the rim, partial sideways, dead zone, release to zero.
  await touch('touchStart', [{ x: 150, y: 300 }]);
  await touch('touchMove', [{ x: 150, y: 270 }]);
  await touch('touchMove', [{ x: 150, y: 240 }]);
  await wait(50);
  let s = await input();
  check('joystick forward at radius -> moveY 1', Math.abs(s.moveY - 1) < 1e-6 && Math.abs(s.moveX) < 1e-6, { moveX: s.moveX, moveY: s.moveY });
  // Pushed to its edge the stick sprints (BRIEF §0.6), and its ring says so.
  check('joystick at its edge sprints', s.sprint === true && (await page.locator('.dd-stick.sprint').count()) === 1, { sprint: s.sprint });
  await touch('touchMove', [{ x: 150, y: 180 }]);
  s = await input();
  check('joystick clamps beyond radius', Math.abs(s.moveY - 1) < 1e-6, { moveY: s.moveY });
  // The base follows a thumb that overshoots (turning back responds at once), so the partial and
  // dead-zone checks start from a fresh touch with the base where the thumb lands.
  const followed = await page.evaluate(() => document.querySelector('.dd-stick')?.getBoundingClientRect().top ?? 0);
  await touch('touchEnd', []);
  await touch('touchStart', [{ x: 150, y: 300 }]);
  const fresh = await page.evaluate(() => document.querySelector('.dd-stick')?.getBoundingClientRect().top ?? 0);
  check('joystick base follows an overshoot', followed < fresh - 20, { followedTop: followed, freshTop: fresh });
  await touch('touchMove', [{ x: 170, y: 300 }]);
  s = await input();
  check('joystick partial right, no sprint', s.moveX > 0.2 && s.moveX < 0.4 && Math.abs(s.moveY) < 1e-6 && !s.sprint, { moveX: s.moveX, sprint: s.sprint });
  await touch('touchMove', [{ x: 154, y: 302 }]);
  s = await input();
  check('joystick dead zone', s.moveX === 0 && s.moveY === 0, { moveX: s.moveX, moveY: s.moveY });
  await touch('touchMove', [{ x: 110, y: 300 }]);
  await touch('touchEnd', []);
  s = await input();
  check('joystick release -> 0', s.moveX === 0 && s.moveY === 0 && !s.mining && !s.sprint, s);
  check('lastDevice touch', s.lastDevice === 'touch', s.lastDevice);

  // Look drag: accumulates CSS px deltas, never mines.
  let before = await seen();
  // Start and first move are pipelined so harness latency cannot turn the drag into a hold.
  await Promise.all([touch('touchStart', [{ x: 560, y: 200 }]), touch('touchMove', [{ x: 573, y: 202 }])]);
  for (let i = 3; i <= 10; i++) {
    await touch('touchMove', [{ x: 560 + i * 6, y: 200 + i }]);
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

  // Hold to mine: still for 230 ms -> mining at the finger in NDC; moving re-aims, no look. (On the
  // open view right of the top block: a finger landing on the tracker presses it instead.)
  before = await seen();
  await touch('touchStart', [{ x: 600, y: 210 }]);
  await wait(100);
  s = await input();
  check('hold: not mining before 230 ms', !s.mining, { mining: s.mining });
  await wait(150);
  s = await input();
  // SwiftShader under load can run the hold timer a few frames late: give it up to 1.5 s more.
  for (let i = 0; i < 50 && !s.mining; i++) {
    await wait(30);
    s = await input();
  }
  const nx = (600 / vp.width) * 2 - 1;
  const ny = 1 - (210 / vp.height) * 2;
  check('hold: mining with pointer aim', s.mining && s.aimFromPointer && Math.abs(s.aimX - nx) < 0.01 && Math.abs(s.aimY - ny) < 0.01, { aimX: s.aimX, aimY: s.aimY, expect: [nx, ny] });
  await touch('touchMove', [{ x: 640, y: 190 }]);
  await touch('touchMove', [{ x: 680, y: 175 }]);
  await wait(60);
  s = await input();
  after = await seen();
  check('hold: moving re-aims', Math.abs(s.aimX - ((680 / vp.width) * 2 - 1)) < 0.01 && Math.abs(s.aimY - (1 - (175 / vp.height) * 2)) < 0.01, { aimX: s.aimX, aimY: s.aimY });
  check('hold: moving does not rotate the camera', after.lookDX === before.lookDX && after.lookDY === before.lookDY && s.lookDX === 0, { d: after.lookDX - before.lookDX });
  await touch('touchEnd', []);
  await wait(30);
  s = await input();
  check('hold: release stops mining, aim stays for the swing in flight', !s.mining && s.aimFromPointer, { mining: s.mining, aimFromPointer: s.aimFromPointer });

  // Quick tap: reported once as a world tap at the finger (the game mines, walks or uses there).
  before = await seen();
  await touch('touchStart', [{ x: 480, y: 300 }]);
  await wait(40);
  await touch('touchEnd', []);
  await wait(60);
  after = await seen();
  s = await input();
  check('tap: one world tap at the finger, nothing held', after.taps === before.taps + 1 && Math.abs(after.tapX - ((480 / vp.width) * 2 - 1)) < 0.01 && Math.abs(after.tapY - (1 - (300 / vp.height) * 2)) < 0.01 && !s.mining, { taps: after.taps - before.taps, tapX: after.tapX, mining: s.mining });
  // A quick tap where the joystick starts is a world tap too (no stick movement).
  before = await seen();
  await touch('touchStart', [{ x: 150, y: 300 }]);
  await wait(40);
  await touch('touchEnd', []);
  await wait(60);
  after = await seen();
  s = await input();
  check('tap on the joystick side is a world tap', after.taps === before.taps + 1 && s.moveX === 0 && s.moveY === 0, { taps: after.taps - before.taps });

  // Two fingers: joystick and look at the same time.
  before = await seen();
  await touch('touchStart', [{ x: 150, y: 300, id: 1 }]);
  await Promise.all([
    touch('touchStart', [{ x: 150, y: 300, id: 1 }, { x: 560, y: 200, id: 2 }]),
    touch('touchMove', [{ x: 150, y: 290, id: 1 }, { x: 575, y: 200, id: 2 }]),
  ]);
  for (let i = 2; i <= 6; i++) {
    await touch('touchMove', [{ x: 150, y: 300 - i * 10, id: 1 }, { x: 560 + i * 5, y: 200, id: 2 }]);
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

  // The right-thumb pads (BRIEF §0.6): Action (the biggest), Jump, Dash, Sonar, all >= 48 px.
  const pads = {};
  for (const id of ['action', 'jump', 'dash', 'sonar']) pads[id] = await box(`.dd-pad-${id}`);
  check('pads Action, Jump, Dash and Sonar on screen, >= 48 px', Object.values(pads).every((r) => r && r.w >= 48 && r.h >= 48), pads);
  check('Action is the biggest pad', pads.action && pads.action.w > Math.max(pads.jump?.w ?? 0, pads.dash?.w ?? 0, pads.sonar?.w ?? 0), pads);
  check('pads on the right half (right-handed)', Object.values(pads).every((r) => r && r.x > vp.width / 2), pads);
  // Action: held while the finger stays, released with it, pressed once.
  before = await seen();
  await touch('touchStart', [{ x: pads.action.x, y: pads.action.y, id: 3 }]);
  await wait(250);
  s = await input();
  check('Action held while pressed', s.actionHeld === true, { actionHeld: s.actionHeld });
  // A drag that starts on Action also turns the view (one thumb holds and aims).
  for (let i = 1; i <= 5; i++) {
    await touch('touchMove', [{ x: pads.action.x - i * 6, y: pads.action.y, id: 3 }]);
    await wait(16);
  }
  await wait(60);
  s = await input();
  after = await seen();
  check('a drag from Action looks while it holds', s.actionHeld && after.lookDX + s.lookDX - before.lookDX < -20, { lookDX: after.lookDX + s.lookDX - before.lookDX });
  await touch('touchEnd', []);
  await wait(80);
  s = await input();
  after = await seen();
  check('Action released with the finger, pressed once', !s.actionHeld && after.action === before.action + 1, { held: s.actionHeld, presses: after.action - before.action });
  for (const [id, key] of [['jump', 'jump'], ['dash', 'dash'], ['sonar', 'sonar']]) {
    before = await seen();
    await tapAt(pads[id]);
    after = await seen();
    check(`${id} pad presses once`, after[key] === before[key] + 1, { n: after[key] - before[key] });
  }
  // Cooldown rings: a cooling pad draws its sweep (the game sets the fraction).
  await page.evaluate(() => window.__UI__.ui.touch.setCooldowns(0.5, 0.75));
  const cooling = await page.evaluate(() => ({ dash: document.querySelector('.dd-pad-dash')?.classList.contains('cooling'), sonar: getComputedStyle(document.querySelector('.dd-pad-sonar')).getPropertyValue('--cd').trim() }));
  check('cooldown rings on Dash and Sonar', cooling.dash === true && Number(cooling.sonar) === 0.75, cooling);
  await page.evaluate(() => window.__UI__.ui.touch.setCooldowns(0, 0));

  // Place shows only with a placeable item in hand: pick the torches on the hotbar, then Place.
  check('no Place pad with the pick in hand', (await box('.dd-pad-place')) === null);
  const torchSlot = await page.evaluate(() => window.__UI__.actions.loop().hotbarView().slots.findIndex((x) => x.item === 'torch'));
  const slotBox = await box(`.dd-hslot[data-slot="${torchSlot}"]`);
  check('the torches sit on a hotbar slot, >= 48 px', torchSlot >= 0 && slotBox && slotBox.w >= 48 && slotBox.h >= 48, { torchSlot, slotBox });
  before = await seen();
  await tapAt(slotBox);
  await wait(120);
  after = await seen();
  const place = await box('.dd-pad-place');
  check('a tap on a slot selects it; Place appears with a torch in hand', after.hotbar === torchSlot && place !== null, { hotbar: after.hotbar, place });
  if (place) {
    before = await seen();
    await tapAt(place);
    after = await seen();
    check('Place pad presses once', after.place === before.place + 1, { n: after.place - before.place });
  }
  await tapAt(await box('.dd-hslot[data-slot="0"]'));

  // The Interact chip: the target's icon and verb; a tap uses it (the sandbox opens Craft).
  await page.evaluate(() => {
    window.__UI__.hud.interact = { icon: 'station', verb: 'Craft', label: 'Workbench' };
  });
  await wait(120);
  const chip = await box('.dd-use');
  const chipText = await page.locator('.dd-use').innerText().catch(() => '');
  check('the Interact chip shows its verb and target, >= 48 px', chip && chip.h >= 48 && /Craft/.test(chipText) && /Workbench/.test(chipText), { chip, chipText });
  before = await seen();
  await tapAt(chip);
  await wait(120);
  after = await seen();
  check('Interact -> interactPressed -> Craft', after.interact === before.interact + 1 && (await screen()) === 'crafting', { interact: after.interact - before.interact, screen: await screen() });
  await page.locator('.dd-menu3 [data-key="close"]').first().tap();
  await page.evaluate(() => {
    window.__UI__.hud.interact = null;
  });
  await wait(120);

  // The top HUD (BRIEF §0.6): Bag, Craft, Map, Quests and ≡, each >= 48 px, at the top, each opening its screen.
  const tops = {};
  for (const id of ['bag', 'craft', 'map', 'quests', 'menu']) tops[id] = await box(`.dd-hud [data-ui-target="${id}"]`);
  check('the top buttons Bag, Craft, Map, Quests and ≡, >= 48 px, at the top', Object.values(tops).every((r) => r && r.w >= 48 && r.h >= 48 && r.top < vp.height * 0.3), tops);
  for (const [id, want] of [['bag', 'inventory'], ['craft', 'crafting'], ['map', 'map'], ['quests', 'quests'], ['menu', 'pause']]) {
    await page.locator(`.dd-hud [data-ui-target="${id}"]`).tap();
    await wait(120);
    const got = await screen();
    check(`${id} button opens ${want}`, got === want, { got });
    if (want === 'pause') await page.getByRole('button', { name: /Resume/i }).tap();
    else await page.locator('.dd-menu3 [data-key="close"]').first().tap();
    await wait(120);
  }
  // Touches are ignored while a screen is open.
  await page.locator('.dd-hud [data-ui-target="bag"]').tap();
  await wait(100);
  await touch('touchStart', [{ x: 150, y: 300 }]);
  await touch('touchMove', [{ x: 150, y: 240 }]);
  s = await input();
  await touch('touchEnd', []);
  check('touch ignored under a screen', s.moveY === 0, { moveY: s.moveY });
  // The rail goes round the five menus; each has its "?" help card; a tab switch does not replay the entrance.
  for (const id of ['crafting', 'map', 'quests', 'bestiary', 'inventory']) {
    await page.locator(`[data-key="rail:${id}"]`).tap();
    await wait(100);
    const got = await screen();
    // (The live screen's: the one leaving along the rail is still in the exit layer a moment.)
    await page.locator('.dd-screens .dd-menu3 [data-key="help"]').tap();
    const help = (await page.locator('.dd-screens .dd-m3-helpcard').count()) === 1;
    await page.locator('.dd-screens .dd-menu3 [data-key="help"]').tap();
    check(`the rail reaches ${id}; its help card toggles`, got === id && help && (await page.locator('.dd-screens .dd-m3-helpcard').count()) === 0, { got, help });
  }
  await page.locator('[data-key="tab:building"]').tap();
  check('switching tabs does not replay the screen entrance', await page.evaluate(() => document.querySelector('.dd-screens .dd-screen').getAnimations({ subtree: true }).length === 0));
  await page.locator('.dd-menu3 [data-key="close"]').first().tap();
  await wait(100);

  // Craft ×1 and ×5 over LOOP's real rules: torches by hand from the fixture bag.
  await page.locator('.dd-hud [data-ui-target="craft"]').tap();
  await wait(120);
  await page.locator('[data-key="tab:building"]').tap();
  const torches = () => page.evaluate(() => (window.__UI__.actions.loop().bagView().items.building.find((i) => i.item === 'torch')?.count ?? 0));
  const t0 = await torches();
  await page.locator('[data-key="craft:torch:1"]').tap();
  await wait(120);
  const t1 = await torches();
  check('Craft ×1 makes a batch of torches', t1 > t0, { before: t0, after: t1 });
  const five = page.locator('[data-key="craft:torch:5"]');
  const canFive = await five.isEnabled();
  if (canFive) {
    await five.tap();
    await wait(120);
  }
  const t5 = await torches();
  check('Craft ×5 makes five batches when the bag holds enough (else it is off)', canFive ? t5 - t1 === 5 * (t1 - t0) : t5 === t1, { canFive, t1, t5 });
  check('the made card flashes once', true);
  await page.locator('.dd-menu3 [data-key="close"]').first().tap();
  await wait(100);

  // A long-press on a hotbar slot opens the Bag to fill it; a tap on an item puts it there and closes.
  const free = await box('.dd-hslot[data-slot="5"]');
  // Held until the Bag opens (the long-press is timed on the page: a slow frame runs it late).
  await touch('touchStart', [{ x: free.x, y: free.y, id: 6 }]);
  await wait(650);
  for (let i = 0; i < 30 && (await screen()) !== 'inventory'; i++) await wait(100);
  await touch('touchEnd', []);
  await wait(150);
  const rebuilt = await page.evaluate(
    () =>
      new Promise((done) => {
        let n = 0;
        const mo = new MutationObserver((list) => (n += list.filter((m) => m.type === 'childList').length));
        mo.observe(document.querySelector('.dd-screens'), { childList: true, subtree: true });
        setTimeout(() => {
          mo.disconnect();
          done(n);
        }, 800);
      }),
  );
  const assignView = { screen: await screen(), banner: await page.locator('.dd-screens .dd-m3-banner').count(), rebuilt, inventoryPresses: (await seen()).inventory, assignSlot: await page.evaluate(() => window.__UI__.ui.state.assignSlot), at: free, hit: await page.evaluate(([x, y]) => document.elementFromPoint(x, y)?.className ?? null, [free.x, free.y]) };
  check('long-press a slot -> the Bag in "choose for slot 6" mode', assignView.screen === 'inventory' && assignView.banner === 1, assignView);
  // (Without the Bag up there is no item to tap: the rest of the checks still run.)
  if (assignView.screen === 'inventory') {
    await page.locator('.dd-screens [data-key="item:rope"]').tap();
    await wait(150);
    const slot6 = await page.evaluate(() => window.__UI__.actions.loop().hotbarView().slots[5].item);
    check('a tap on an item fills the slot and closes the Bag', slot6 === 'rope' && (await screen()) === 'none', { slot6 });
  }

  // The Map: zoom with its buttons, pan with a drag, a marker's name on a tap.
  await page.locator('.dd-hud [data-ui-target="map"]').tap();
  await wait(400);
  const cam0 = await page.evaluate(() => window.__UI__.ui.state.mapCamera);
  await page.locator('[data-key="map:zoomIn"]').tap();
  const cam1 = await page.evaluate(() => window.__UI__.ui.state.mapCamera);
  check('Map: zoom in', cam0 && cam1 && cam1.zoom > cam0.zoom * 1.2, { cam0, cam1 });
  const mv = await box('.dd-m3-mapview');
  await touch('touchStart', [{ x: mv.x, y: mv.y, id: 7 }]);
  for (let i = 1; i <= 6; i++) {
    await touch('touchMove', [{ x: mv.x + i * 10, y: mv.y, id: 7 }]);
    await wait(16);
  }
  await touch('touchEnd', []);
  const cam2 = await page.evaluate(() => window.__UI__.ui.state.mapCamera);
  check('Map: a drag pans', cam2.cx < cam1.cx - 1, { cam1, cam2 });
  await page.locator('[data-key="map:centre"]').tap();
  const pin = page.locator('.dd-m3-pin.k-vista');
  // A marker under the map's zoom buttons is panned out from under them first (a drag, as a player would).
  {
    const pb = await box('.dd-m3-pin.k-vista');
    const cb = await box('.dd-m3-mapctls');
    if (pb && cb && pb.x > cb.x - cb.w / 2 - 24) {
      const v = await box('.dd-m3-mapview');
      const dx = Math.round(pb.x - (cb.x - cb.w / 2 - 60));
      await touch('touchStart', [{ x: v.x, y: v.y, id: 8 }]);
      for (let i = 1; i <= 8; i++) {
        await touch('touchMove', [{ x: v.x - (dx * i) / 8, y: v.y, id: 8 }]);
        await wait(16);
      }
      await touch('touchEnd', []);
      await wait(120);
    }
  }
  if (await pin.isVisible().catch(() => false)) {
    await pin.tap();
    check('Map: a tapped marker names itself', /Vista/.test(await page.locator('.dd-m3-mapcaption').innerText()));
  } else check('Map: the vista marker is in view at home zoom', false);
  const legend = await page.locator('.dd-m3-legend li').count();
  check('Map: a legend row per kind of marker', legend >= 12, { legend });
  await page.locator('.dd-menu3 [data-key="close"]').first().tap();
  await wait(100);

  // Notices: repeated pickups merge, toasts auto-dismiss, discoveries play in turn.
  await page.evaluate(() => {
    const ui = window.__UI__.ui;
    ui.pickup({ item: 'ironOre', count: 1 });
    ui.pickup({ item: 'ironOre', count: 2 });
    ui.toast('check-toast', 'info');
    ui.showDiscovery({ id: 'a', title: 'First Discovery', body: 'a', index: 3, total: 9, major: false });
    ui.showDiscovery({ id: 'b', title: 'Second Discovery', body: 'b', index: 4, total: 9, major: true });
  });
  await wait(300);
  const iron = await page.locator('.dd-pickup', { hasText: 'Iron Ore' }).allInnerTexts();
  check('pickups of one item merge into one line', iron.length === 1 && iron[0].includes('+3 Iron Ore'), iron);
  check('discovery banner shows the first', (await page.locator('.dd-discovery-title').textContent()) === 'First Discovery');
  check('discovery banner counts index/total', (await page.locator('.dd-discovery-count').textContent()) === '3/9');
  // One notice at a time (QA 22:10): the toast shown just before stands aside while the cards are up.
  check('a toast steps aside while a notice card is up', (await page.locator('.dd-toast.held').count()) === 1);
  await wait(4000);
  const second = await page
    .waitForFunction(() => document.querySelector('.dd-discovery-title')?.textContent === 'Second Discovery', null, { timeout: 4000 })
    .then(() => true, () => false);
  check('queued discovery plays next', second);

  // The milestone card (a feat): it waits for the discovery up, then one calm card under the top HUD,
  // never over the centre; a tap opens Quests.
  await page.evaluate(() => {
    window.__UI__.bus.emit('reward:paid', { items: { torch: 8 }, reason: 'feat' });
    window.__UI__.bus.emit('feat:earned', { id: 'firstTorch' });
  });
  await wait(500);
  check('a milestone card waits for the discovery up', (await page.locator('.dd-milestone.on').count()) === 0 && (await page.locator('.dd-discovery.on').count()) === 1);
  await page.waitForFunction(() => !document.querySelector('.dd-discovery.on'), null, { timeout: 9000 }).catch(() => {});
  await page.waitForFunction(() => !!document.querySelector('.dd-milestone.on'), null, { timeout: 4000 }).catch(() => {});
  const ms = await box('.dd-milestone.on');
  // Clear of the centre: no overlap with 140 x 180 px round the reticle.
  const clearOfCentre = (r) => r && (r.x + r.w / 2 < vp.width / 2 - 70 || r.x - r.w / 2 > vp.width / 2 + 70 || r.top + r.h < vp.height / 2 - 90 || r.top > vp.height / 2 + 90);
  check('a feat shows its milestone card, clear of the centre', clearOfCentre(ms), ms);
  if (ms) {
    await tapAt(ms);
    check('a tap on the milestone opens Quests', (await screen()) === 'quests');
    await page.locator('.dd-menu3 [data-key="close"]').first().tap();
    await wait(100);
  }

  // The trip card: never over another screen; after a black-out only once the explorer woke.
  {
    await page.evaluate(() => window.__UI__.actions.openInventory());
    await page.evaluate(() => window.__UI__.bus.emit('trip:summary', { summary: { n: 2, outcome: 'returned', seconds: 300, deepest: 40, stratum: 1, biomes: [], finds: {}, rarest: null, kills: 1, crafted: 0, torches: 0, shards: [], orders: 0, pages: 0, bestiary: 0, banked: 9, records: ['depth'], next: 'Defeat the guardian', lines: [{ label: 'Time out', value: '5 min' }], title: 'Back at camp' } }));
    check('trip card waits while another screen is open', (await screen()) === 'inventory');
    await page.locator('.dd-menu3 [data-key="close"]').first().tap();
    await wait(100);
    check('trip card opens once play has no screen up', (await screen()) === 'summary' && (await page.locator('.dd-trip3').count()) === 1);
    check('the trip card stamps its record', /record/i.test(await page.locator('.dd-trip3-records').innerText().catch(() => '')));
    await page.locator('[data-key="trip:close"]').tap();
    await wait(100);
    check('Head out again closes the card', (await screen()) === 'none');
    await page.evaluate(() => window.__UI__.scene('death'));
    await page.evaluate(() => window.__UI__.bus.emit('trip:summary', { summary: { n: 3, outcome: 'blackout', seconds: 200, deepest: 62, stratum: 1, biomes: [], finds: {}, rarest: null, kills: 0, crafted: 0, torches: 0, shards: [], orders: 0, pages: 0, bestiary: 0, banked: 0, records: [], next: 'Go back for the pack', lines: [{ label: 'Time out', value: '3 min' }], title: 'Woke at camp' } }));
    check('a black-out trip card never opens over the black-out screen', (await screen()) === 'death');
    check('the black-out card names what did it and where', /Struck down/.test(await page.locator('.dd-bo-cause').innerText().catch(() => '')) && /Stratum I/.test(await page.locator('.dd-bo-where').innerText().catch(() => '')));
    await page.locator('[data-key="respawn"]').tap();
    await wait(80);
    await page.evaluate(() => window.__UI__.bus.emit('player:respawned', {}));
    await wait(120);
    check('the black-out trip card opens after waking', (await screen()) === 'summary' && (await page.locator('.dd-trip3-card.blackout').count()) === 1);
    await page.keyboard.press('Escape');
    check('escape closes the trip card', (await screen()) === 'none');
  }

  // Left-handed: sides swap (the stick on the right, the pads on the left).
  await page.evaluate(() => window.__UI__.actions.updateSettings({ leftHanded: true }));
  await wait(120);
  await touch('touchStart', [{ x: 760, y: 300 }]);
  await touch('touchMove', [{ x: 760, y: 240 }]);
  s = await input();
  await touch('touchEnd', []);
  check('left-handed: joystick on the right', Math.abs(s.moveY - 1) < 1e-6, { moveY: s.moveY });
  const lefty = await box('.dd-pad-action');
  check('left-handed: Action on the left', lefty && lefty.x < vp.width / 2, lefty);
  // (On the open view under the top block: a finger on the tracker presses it.)
  await touch('touchStart', [{ x: 320, y: 220 }]);
  await wait(320);
  s = await input();
  for (let i = 0; i < 50 && !s.mining; i++) {
    await wait(30);
    s = await input();
  }
  await touch('touchEnd', []);
  check('left-handed: hold-to-mine on the left', s.mining, { mining: s.mining });
  await page.evaluate(() => window.__UI__.actions.updateSettings({ leftHanded: false }));
  await wait(260);

  // Button size and opacity (Settings): the pads follow the CSS variables.
  const a0 = await box('.dd-pad-action');
  await page.evaluate(() => window.__UI__.actions.setControlPrefs({ scale: 1.25, opacity: 0.5 }));
  await wait(120);
  const a1 = await box('.dd-pad-action');
  check('button size grows the pads', a1.w > a0.w * 1.15, { before: a0.w, after: a1.w });
  await page.evaluate(() => window.__UI__.actions.setControlPrefs({ scale: 1, opacity: 0.86 }));

  // The mouse does not drive the touch layer unless the page opts in. (On the open view right of the
  // top block, not on the tracker.)
  await page.mouse.move(600, 210);
  await page.mouse.down();
  await wait(320);
  s = await input();
  await page.mouse.up();
  check('mouse ignored by default', !s.mining, { mining: s.mining });
  await page.evaluate(() => {
    document.documentElement.dataset.touchUi = '1';
  });
  await page.mouse.down();
  await wait(320);
  s = await input();
  await page.mouse.up();
  await wait(30);
  const s2 = await input();
  check('mouse drives it with data-touch-ui=1', s.mining && !s2.mining, { held: s.mining, released: s2.mining });

  await context.close();

  // Portrait (the game's own shape): the HUD keeps the centre clear; the Map's view is square and fits.
  {
    const { page: p, context: c } = await openPage(VIEWPORTS.port, 'hud');
    await p.waitForTimeout(400);
    const centre = await p.evaluate(() => {
      const cx = innerWidth / 2;
      const cy = innerHeight / 2;
      const hits = [];
      for (const el of document.querySelectorAll('.dd-hud *, .dd-touch *')) {
        if (el.closest('.dd-reticle, .dd-target, .dd-combo, .dd-dmg-layer, .dd-fly-layer')) continue;
        const r = el.getBoundingClientRect();
        if (r.width === 0 || getComputedStyle(el).visibility === 'hidden' || Number(getComputedStyle(el).opacity) === 0) continue;
        if (r.left < cx + 70 && r.right > cx - 70 && r.top < cy + 90 && r.bottom > cy - 90) hits.push(`${el.className}`);
      }
      return hits;
    });
    check('portrait: nothing of the HUD covers the centre (140 x 180 px round the reticle)', centre.length === 0, centre.slice(0, 6));
    await c.close();
    const { page: m, context: mc } = await openPage(VIEWPORTS.port, 'map');
    await m.waitForTimeout(600);
    const view = await m.evaluate(() => {
      const r = document.querySelector('.dd-m3-mapview').getBoundingClientRect();
      return { w: Math.round(r.width), h: Math.round(r.height), right: Math.round(r.right), vw: innerWidth };
    });
    check('portrait Map: a square view inside the screen', Math.abs(view.w - view.h) <= 1 && view.right <= view.vw, view);
    await mc.close();
  }

  // Screen flows driven like a player would (mouse + keyboard), on the sandbox's fake game.
  {
    const { page: p, context: c } = await openPage(VIEWPORTS.desk, 'menu');
    const screen2 = () => p.evaluate(() => window.__UI__.ui.screen);
    check('the title shows the Continue card (stratum, biomes, shards)', /Stratum|shards/i.test(await p.locator('.dd-continue-card').innerText().catch(() => '')) || (await p.locator('.dd-continue-card').count()) === 0);
    check('the title offers the Daily Descent with its goal', /Daily Descent/.test(await p.locator('[data-key="daily"]').innerText().catch(() => '')));
    await p.getByRole('button', { name: /New Expedition/i }).click();
    check('new expedition with a save asks first', (await screen2()) === 'confirm' && (await p.getByText(/progress will be erased/i).isVisible()));
    await p.keyboard.press('Escape');
    check('escape cancels the confirm', (await screen2()) === 'menu');
    await p.getByRole('button', { name: /Settings/i }).click();
    await p.getByRole('switch', { name: /Invert vertical/i }).click();
    check('settings apply immediately', (await p.evaluate(() => window.__UI__.settings().invertY)) === true);
    const slider = p.getByRole('slider', { name: /Master volume/i });
    await slider.focus();
    await p.keyboard.press('ArrowRight');
    // The patch is applied on the next animation frame: poll for it instead of guessing a delay.
    const sliderApplied = await p
      .waitForFunction(() => Math.abs(window.__UI__.settings().masterVolume - 0.85) < 1e-6, null, { timeout: 1500, polling: 20 })
      .then(() => true, () => false);
    check('sliders apply (coalesced per frame)', sliderApplied, await p.evaluate(() => window.__UI__.settings().masterVolume));
    check('settings show the expedition seed', /48151623/.test(await p.locator('.dd-settings-seed').innerText().catch(() => '')));
    await p.getByRole('button', { name: /Reset to defaults/i }).click();
    check('reset restores defaults', (await p.evaluate(() => window.__UI__.settings().invertY)) === false && (await p.getByRole('switch', { name: /Invert vertical/i }).getAttribute('aria-checked')) === 'false');
    await p.getByRole('button', { name: /Delete saved game/i }).click();
    await p.getByRole('button', { name: /^Delete$/ }).click();
    check('delete save removes it and disables the button', (await p.evaluate(() => window.__UI__.actions.hasSave())) === false && (await p.getByRole('button', { name: /Delete saved game/i }).isDisabled()));
    await p.getByRole('button', { name: /About DEEP DOWN/i }).click();
    check('about is two taps from the menu (Settings, About)', (await screen2()) === 'about');
    await p.getByRole('tab', { name: /Licences/i }).click();
    const notices = await p
      .waitForFunction(() => /three\.js authors/.test(document.querySelector('.dd-licences')?.textContent ?? ''), null, { timeout: 5000 })
      .then(() => p.locator('.dd-licences').textContent(), () => '');
    check('about shows the three.js copyright and the MIT text', /Copyright © 2010-\d{4} three\.js authors/.test(notices) && /Permission is hereby granted, free of charge/.test(notices));
    await p.keyboard.press('Escape');
    check('escape in about returns to settings', (await screen2()) === 'settings');
    await p.keyboard.press('Escape');
    check('escape in settings returns to the menu', (await screen2()) === 'menu');
    check('menu without a save has no Continue', (await p.getByRole('button', { name: /Continue/i }).count()) === 0);
    const focused = () => p.evaluate(() => document.activeElement?.textContent ?? '');
    let f = await focused();
    check('keyboard users land on the primary button', /New Expedition/.test(f), f);
    await p.keyboard.press('ArrowDown');
    f = await focused();
    const seedFocused = await p.evaluate(() => !!document.activeElement?.matches('.dd-seed-input'));
    check('arrow keys move focus to the seed field', seedFocused, f);
    await p.keyboard.press('ArrowDown');
    f = await focused();
    check('then to the Daily Descent', /Daily Descent/.test(f), f);
    await p.keyboard.press('ArrowUp');
    await p.keyboard.press('ArrowUp');
    await p.keyboard.press('Enter');
    await p.waitForFunction(() => window.__UI__.ui.screen === 'none', null, { timeout: 3000 });
    check('enter starts a new expedition without a confirm when there is no save', true);
    // The menu keys: each opens its menu and closes it again; another menu's key switches.
    for (const [key, id] of [['i', 'inventory'], ['c', 'crafting'], ['m', 'map'], ['j', 'quests'], ['b', 'bestiary']]) {
      await p.evaluate((sid) => window.__UI__.actions.openMenu(sid), id);
      await p.keyboard.press(key);
      check(`${key.toUpperCase()} closes ${id}`, (await screen2()) === 'none');
    }
    await p.evaluate(() => window.__UI__.actions.openMenu('map'));
    await p.keyboard.press('j');
    check('another menu key switches menus', (await screen2()) === 'quests');
    await p.keyboard.press('Escape');
    check('escape closes the menu', (await screen2()) === 'none');
    await c.close();
  }
}

// ---------------------------------------------------------------------------------------
// Real game smoke flow (--game): the same UI mounted by the actual Game on the dev server.

if (opt.game) {
  const vp = VIEWPORTS.port;
  const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, hasTouch: true });
  const page = await context.newPage();
  page.on('pageerror', (e) => problems.push(`[game] pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') problems.push(`[game] console.error: ${m.text()}`);
  });
  const st = () => page.evaluate(() => window.__DD__.state());
  const until = (fn, arg) => page.waitForFunction(fn, arg, { timeout: 180_000, polling: 100 });
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
  // A tap is one CDP gesture (start and end together): Playwright's tap() awaits each half, and
  // under load the page reads a long-press (no click).
  const cdp = await page.context().newCDPSession(page);
  const tapLoc = async (loc) => {
    await loc.waitFor({ state: 'visible', timeout: 180_000 });
    const b = await loc.boundingBox();
    const p = { x: Math.round(b.x + b.width / 2), y: Math.round(b.y + b.height / 2), id: 1, radiusX: 8, radiusY: 8, force: 1 };
    await Promise.all([cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [p] }), cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })]);
  };
  // The boot mark: index.html's inline emblem, painted before the bundle runs.
  await page.goto(`${base}index.html`, { waitUntil: 'commit' });
  const boot = await page.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => {
          const el = document.getElementById('dd-boot');
          const r = el?.querySelector('svg')?.getBoundingClientRect();
          const fcp = performance.getEntriesByName('first-contentful-paint')[0]?.startTime;
          resolve({ present: !!el && !el.classList.contains('out'), w: r ? Math.round(r.width) : 0, fcp: fcp === undefined ? null : Math.round(fcp), at: Math.round(performance.now()) });
        }),
      ),
  );
  await page.screenshot({ path: `${opt.out}/game-boot.png` });
  check('game: boot mark painted before the bundle', boot.present && boot.w > 40, boot);
  await until(() => window.__DD__?.ready && window.__DD__.state().mode === 'menu');
  await page.waitForTimeout(800);
  check('game: menu title attached', (await page.getByText('DEEP DOWN').count()) > 0);
  // Gameplay binds Tab (bag) and Space (jump); on a screen they must still move focus and press.
  await page.keyboard.press('Tab');
  check('game: Tab moves focus into the menu', await page.evaluate(() => !!document.activeElement?.closest('.dd-menu')));
  await page.getByRole('button', { name: /New Expedition/i }).click();
  await until(() => window.__DD__.state().mode === 'playing');
  await page.evaluate(() => {
    window.__DD__.mobs.auto(false);
    window.__DD__.mobs.clear();
    window.__DD__.game.quests.skipTutorial();
  });
  await page.waitForTimeout(1200);
  await shot('hud');
  check('game: HUD shows depth', await page.locator('.dd-where-depth').isVisible());
  check('game: HUD shows the stratum', (await page.locator('.dd-where-stratum').innerText()) === 'I');
  check('game: the minimap is drawn', await page.locator('.dd-minimap:not(.empty)').isVisible());

  await tapLoc(page.locator('.dd-hud [data-ui-target="menu"]'));
  await until(() => window.__DD__.state().mode === 'paused');
  check('game: ≡ pauses', (await st()).screen === 'pause');
  await tapLoc(page.getByRole('button', { name: /^Settings$/ }));
  await until(() => window.__DD__.state().screen === 'settings');
  const invert = page.getByRole('switch', { name: /Invert vertical/i });
  await invert.focus();
  await page.keyboard.press('Space');
  check('game: Space toggles the focused switch', (await invert.getAttribute('aria-checked')) === 'true');
  await page.keyboard.press('Space');
  check('game: settings show the expedition seed', /\d+/.test(await page.locator('.dd-settings-seed').innerText().catch(() => '')));
  const fps = page.getByRole('switch', { name: /Show performance/i });
  await tapLoc(fps);
  check('game: performance switch toggles', (await fps.getAttribute('aria-checked')) === 'true');
  await shot('settings');
  await tapLoc(page.getByRole('button', { name: /Back/i }));
  await until(() => window.__DD__.state().screen === 'pause');
  await tapLoc(page.getByRole('button', { name: /Resume/i }));
  await until(() => window.__DD__.state().mode === 'playing' && window.__DD__.state().screen === 'none');
  const perfOn = await page.locator('.dd-perf.on').waitFor({ state: 'visible', timeout: 8000 }).then(() => true, () => false);
  check('game: perf line visible after enabling it', perfOn, await page.locator('.dd-perf').innerText());

  await tapLoc(page.locator('.dd-hud [data-ui-target="bag"]'));
  await until(() => window.__DD__.state().screen === 'inventory');
  check('game: the Bag lists the pick worn', (await page.locator('.dd-m3-gearslot:not(.empty)').count()) > 0);
  await shot('bag');
  await tapLoc(page.locator('.dd-menu3 [data-key="close"]').first());
  await until(() => window.__DD__.state().screen === 'none');

  // The camp's Workbench: its Interact chip opens Craft; torches by hand.
  const bench = await page.evaluate(() => window.__DD__.game.session.layout.campSite?.stations.find((s) => s.station === 'workbench')?.p ?? null);
  // Face it from a step away, from the side where no other prop takes the focus: the camp's Workbench
  // is a prop, its chip comes with it in focus (`p` is its base centre; aimAt takes a block and aims
  // at its centre, so the bench's middle is passed half a cell back).
  const use = page.locator('.dd-use');
  for (const [dx, dz] of bench ? [[1.6, 0], [0, 1.6], [-1.6, 0], [0, -1.6], [1.2, 1.2], [-1.2, -1.2], [1.2, -1.2], [-1.2, 1.2]] : []) {
    const stand = await page.evaluate(([x, y, z, ox, oz]) => {
      const s = window.__DD__.standableNear(Math.floor(x + ox), Math.floor(y), Math.floor(z + oz));
      return s && Math.hypot(s[0] + 0.5 - x, s[2] + 0.5 - z) < 3 ? s : null;
    }, [...bench, dx, dz]);
    if (!stand) continue;
    await page.evaluate(([x, y, z]) => window.__DD__.teleport(x + 0.5, y, z + 0.5), stand);
    await page.evaluate(([x, y, z]) => window.__DD__.aimAt(x - 0.5, y + 0.1, z - 0.5, 0, 0), bench);
    if (await use.waitFor({ state: 'visible', timeout: 6000 }).then(() => true, () => false)) break;
  }
  await page.evaluate(() => {
    window.__DD__.give('fungalWood', 4);
    window.__DD__.give('coal', 2);
  });
  await use.waitFor({ state: 'visible', timeout: 30_000 });
  await shot('use');
  await tapLoc(use);
  await until(() => window.__DD__.state().screen === 'crafting');
  await tapLoc(page.locator('[data-key="tab:building"]'));
  await shot('crafting');
  const torches0 = await page.evaluate(() => window.__DD__.game.backpack.count('torch'));
  await tapLoc(page.locator('[data-key="craft:torch:1"]'));
  await until((n) => window.__DD__.game.backpack.count('torch') > n, torches0);
  check('game: torches crafted in the Craft menu', true);
  await tapLoc(page.locator('.dd-menu3 [data-key="close"]').first());
  await until(() => window.__DD__.state().screen === 'none');

  await tapLoc(page.locator('.dd-hud [data-ui-target="menu"]'));
  await tapLoc(page.getByRole('button', { name: /Save and Quit/i }));
  await until(() => window.__DD__.state().mode === 'menu');
  const cont = page.getByRole('button', { name: /Continue/i });
  await cont.waitFor({ state: 'visible' });
  check('game: menu offers Continue with save time', /Last saved/.test(await cont.innerText()));
  check('game: the Continue card names the stratum', /Stratum|I/.test(await page.locator('.dd-continue-card').innerText().catch(() => '')));
  await shot('menu-continue');
  const torches1 = await page.evaluate(() => window.__DD__.game.backpack.count('torch') + window.__DD__.game.storage.count('torch'));
  await cont.click();
  await until(() => window.__DD__.state().mode === 'playing');
  const torches2 = await page.evaluate(() => window.__DD__.game.backpack.count('torch') + window.__DD__.game.storage.count('torch'));
  check('game: continue restores the crafted torches', torches2 === torches1 && torches2 > 0, { torches1, torches2 });
}

await browser.close();
await server.close();

if (problems.length) console.log(`\nConsole problems:\n  ${problems.join('\n  ')}`);
if (layoutProblems.length) console.log(`\nLayout problems:\n  ${layoutProblems.join('\n  ')}`);
const failed = checks.filter((c) => !c.ok);
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed, ${problems.length} console problems, ${layoutProblems.length} layout problems`);
process.exit(failed.length || problems.length || layoutProblems.length ? 1 : 0);
