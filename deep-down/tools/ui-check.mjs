// UI check of the first-person HUD in real headless Chromium (SPEC §13.3 U1–U4, E21, F10's steady frame), at the
// three phone sizes. Two parts:
//  1. The HUD sandbox (src/ui/dev/sandbox.html: the real HUD over a painted backdrop, no WebGL): every preset (fresh,
//     play, the ride's Skip, the focus panel, the return plate, the Dig / Crew / Settings sheets, Large text,
//     left-handed, high contrast) is screenshotted and checked: touch targets ≥ 48 px (U1), text ≥ 12 px (U2), no
//     overlap between row A (depth, gold, ≡), the objective line, the cards, the Skip plate, the note, the focus
//     panel and an open sheet, and no horizontal scroll (U3), every control but row A and the objective line in the
//     bottom 45 % (U4), the plates ≤ 17 % of the screen and ≤ 5 persistent numbers (E21), the HUD weight over a white
//     world ≤ 35 %, and no DOM write in a steady frame (F10).
//  2. The real game (index.html, WebGL): the plug face's blocks clear every plate (U3), and with the sheet opened by a
//     real tap on ≡ the sheet clears row A and the objective line and blocks are still tappable above it.
//
// Usage: node tools/ui-check.mjs [--out artifacts/hybrid/ui] [--vp 360x740,390x844,412x915] [--no-shots] [--no-game]
// Exit code 1 when any check fails (each failure is printed).
import { chromium } from '@playwright/test';
import { createServer } from 'vite';
import { mkdirSync } from 'node:fs';
import { inflateSync } from 'node:zlib';

/** Decode an 8-bit RGB/RGBA PNG (Playwright's screenshots) to { width, height, rgba }. */
function decodePng(buf) {
  let p = 8;
  let width = 0;
  let height = 0;
  let type = 6;
  const idat = [];
  while (p < buf.length) {
    const len = buf.readUInt32BE(p);
    const kind = buf.toString('ascii', p + 4, p + 8);
    const data = buf.subarray(p + 8, p + 8 + len);
    if (kind === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      type = data[9];
    } else if (kind === 'IDAT') idat.push(data);
    p += 12 + len;
  }
  const bpp = type === 6 ? 4 : 3;
  const raw = inflateSync(Buffer.concat(idat));
  const out = new Uint8Array(width * height * 4);
  const stride = width * bpp;
  const prev = new Uint8Array(stride);
  const cur = new Uint8Array(stride);
  for (let y = 0; y < height; y++) {
    const f = raw[y * (stride + 1)];
    const row = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? cur[i - bpp] : 0;
      const b = prev[i];
      const c = i >= bpp ? prev[i - bpp] : 0;
      let v = row[i];
      if (f === 1) v += a;
      else if (f === 2) v += b;
      else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) {
        const pp = a + b - c;
        const pa = Math.abs(pp - a);
        const pb = Math.abs(pp - b);
        const pc = Math.abs(pp - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      cur[i] = v & 255;
    }
    for (let x = 0; x < width; x++) {
      out[(y * width + x) * 4] = cur[x * bpp];
      out[(y * width + x) * 4 + 1] = cur[x * bpp + 1];
      out[(y * width + x) * 4 + 2] = cur[x * bpp + 2];
      out[(y * width + x) * 4 + 3] = bpp === 4 ? cur[x * bpp + 3] : 255;
    }
    prev.set(cur);
  }
  return { width, height, rgba: out };
}

/**
 * HUD weight (W2.md §4, CRITIQUE SHOULD 10): over a white world, the share of the screen the HUD darkens to below
 * 50 % luminance, i.e. covers at alpha ≥ 0.5 with its near-black plates and scrims. Must stay ≤ 35 % in play.
 */
const HUD_WEIGHT_MAX = 0.35;
function hudWeight(png) {
  const { width, height, rgba } = decodePng(png);
  let heavy = 0;
  for (let i = 0; i < width * height; i++) {
    const r = rgba[i * 4] / 255;
    const g = rgba[i * 4 + 1] / 255;
    const b = rgba[i * 4 + 2] / 255;
    if (0.2126 * r + 0.7152 * g + 0.0722 * b < 0.5) heavy++;
  }
  return heavy / (width * height);
}

const args = process.argv.slice(2);
const opt = { out: 'artifacts/hybrid/ui', vp: '360x740,390x844,412x915', shots: true, game: true };
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === '--no-shots') opt.shots = false;
  else if (a === '--no-game') opt.game = false;
  else if (a.startsWith('--')) opt[a.slice(2)] = args[++i];
}
const VIEWPORTS = opt.vp.split(',').map((s) => {
  const [width, height] = s.split('x').map(Number);
  return { name: s, width, height };
});
const MIN_TARGET = 48;
const MIN_TEXT = 12;
/** Presets: the sandbox state, then flags (large, lefty, contrast). */
const SCENES = ['fresh', 'play', 'ride', 'focus', 'return', 'sheet-dig', 'sheet-crew', 'sheet-settings', 'play+large', 'play+lefty', 'play+contrast', 'sheet-dig+large'];
const PLATE_MAX = 0.17;
const NUMBERS_MAX = 5;

mkdirSync(opt.out, { recursive: true });
const server = await createServer({ server: { port: 5197, strictPort: false, hmr: false }, logLevel: 'error' });
await server.listen();
const base = server.resolvedUrls?.local?.[0] ?? 'http://localhost:5197/';
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const problems = [];
let checks = 0;
const fail = (where, what) => problems.push(`[${where}] ${what}`);

/** In the page: measure the HUD (rects, text sizes, overlaps, the thumb rule). */
function measure({ minTarget, minText }) {
  const vis = (el) => {
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return null;
    for (let e = el; e && e !== document.body; e = e.parentElement) {
      const cs = getComputedStyle(e);
      if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) < 0.05 || e.classList.contains('hide')) return null;
    }
    if (r.bottom <= 0 || r.top >= innerHeight || r.right <= 0 || r.left >= innerWidth) return null;
    return r;
  };
  const name = (el) => el.dataset.hud ?? el.dataset.tab ?? el.dataset.row ?? el.getAttribute('aria-label') ?? `${el.tagName.toLowerCase()}.${[...el.classList].join('.')}`;
  const out = { small: [], tinyText: [], overlaps: [], thumb: [], hscroll: 0, controls: 0 };
  const controls = [...document.querySelectorAll('#ui button, #ui [role="button"], #ui input, #ui select')];
  const seen = new Set();
  for (const el of controls) {
    if (seen.has(el)) continue;
    seen.add(el);
    const r = vis(el);
    if (!r) continue;
    out.controls++;
    // The objective line is SPEC §3.4's 32 px band across the whole width (30 px on a short screen): a wide target.
    const isGoal = el.dataset.hud === 'goal';
    if (isGoal ? r.width < minTarget || r.height < 29.5 : r.width < minTarget - 0.5 || r.height < minTarget - 0.5) out.small.push(`${name(el)} ${r.width.toFixed(0)}×${r.height.toFixed(0)}`);
    // U4: every control but row A and the objective line sits in the bottom 45 %. A sheet's rows and the return
    // plate's Collect are exempt (the sheet scrolls any row anywhere; the return plate is a dialog over a still world).
    const inTop = el.closest('[data-hud="gold"], [data-hud="depth"], [data-hud="menu"], [data-hud="goal"]');
    // Exempt: the sheet's own tab bar (its top edge is SPEC-fixed at ~42 %), the Skip plate (any press skips a skippable
    // move: the plate is a label over a world that is all skip target), the return plate (a dialog), toasts.
    const inModal = el.closest('.hy-sheet-body, .hy-tabs, [data-hud="skip"], [data-hud="return"], .dd-toast');
    if (!inTop && !inModal && r.top + r.height / 2 < innerHeight * 0.55) out.thumb.push(`${name(el)} at y ${(r.top + r.height / 2).toFixed(0)}`);
  }
  // U2: every visible text ≥ 12 px.
  const walker = document.createTreeWalker(document.getElementById('ui'), NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (!n.textContent.trim()) continue;
    const el = n.parentElement;
    if (!el || !vis(el)) continue;
    const px = parseFloat(getComputedStyle(el).fontSize);
    if (px < minText - 0.01) out.tinyText.push(`"${n.textContent.trim().slice(0, 24)}" ${px}px`);
  }
  // U3: the bands never overlap.
  const groups = {
    rowA: ['[data-hud="gold"]', '[data-hud="depth"]', '[data-hud="menu"]'],
    goal: ['[data-hud="goal"]'],
    cards: ['[data-hud="card-pick"]', '[data-hud="card-best"]'],
    skip: ['[data-hud="skip"]'],
    note: ['[data-hud="note"]'],
    focus: ['[data-hud="focus"]'],
    sheet: ['[data-hud="sheet"]'],
  };
  const rects = {};
  for (const [g, sels] of Object.entries(groups)) {
    rects[g] = [];
    for (const sel of sels) for (const el of document.querySelectorAll(sel)) {
      const r = vis(el);
      if (r) rects[g].push({ r, n: name(el) });
    }
  }
  const keys = Object.keys(rects);
  for (let i = 0; i < keys.length; i++)
    for (let j = i + 1; j < keys.length; j++)
      for (const a of rects[keys[i]])
        for (const b of rects[keys[j]]) {
          const w = Math.min(a.r.right, b.r.right) - Math.max(a.r.left, b.r.left);
          const h = Math.min(a.r.bottom, b.r.bottom) - Math.max(a.r.top, b.r.top);
          if (w > 1 && h > 1) out.overlaps.push(`${keys[i]}:${a.n} × ${keys[j]}:${b.n} (${w.toFixed(0)}×${h.toFixed(0)})`);
        }
  out.hscroll = Math.max(0, document.documentElement.scrollWidth - innerWidth);
  return out;
}

/** Count DOM mutations in the page over `ms`: element creations and any write (attributes, text, children). */
async function churn(page, ms) {
  return page.evaluate(async (wait) => {
    const res = { created: [], writes: 0, what: [] };
    const mo = new MutationObserver((recs) => {
      for (const r of recs) {
        res.writes++;
        const t = r.target.nodeType === 1 ? r.target : r.target.parentElement;
        if (res.what.length < 6) res.what.push(`${r.type}${r.attributeName ? `:${r.attributeName}` : ''} on .${t?.className ?? '?'}`);
        for (const n of r.addedNodes) if (n.nodeType === 1) res.created.push(`${n.tagName}.${n.className}`);
      }
    });
    mo.observe(document.getElementById('ui'), { subtree: true, childList: true, attributes: true, characterData: true });
    await new Promise((r) => setTimeout(r, wait));
    mo.disconnect();
    return res;
  }, ms);
}

try {
  // ----- 1. The sandbox -------------------------------------------------------------------------------------------
  for (const vp of VIEWPORTS) {
    for (const scene of SCENES) {
      const [preset, ...flags] = scene.split('+');
      const where = `${vp.name} ${scene}`;
      const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: 1, hasTouch: true });
      const page = await context.newPage();
      page.on('pageerror', (e) => fail(where, `pageerror: ${e.message}`));
      page.on('console', (m) => m.type() === 'error' && fail(where, `console.error: ${m.text()}`));
      const q = flags.map((f) => `&${f}=1`).join('');
      await page.goto(`${base}src/ui/dev/sandbox.html?state=${preset}${q}`);
      await page.waitForFunction(() => !!window.__SANDBOX__, null, { timeout: 60_000 });
      // Past the plates' entrance and the first-time note's slide.
      await page.waitForTimeout(preset === 'play' ? 3200 : 900);
      // F10: a steady frame writes nothing to the DOM (the HUD diff-writes only changed text).
      if (flags.length === 0 && (preset === 'fresh' || preset === 'play' || preset === 'sheet-dig')) {
        const c = await churn(page, 1500);
        checks++;
        if (c.writes) fail(where, `F10: ${c.writes} DOM writes in 1.5 s of steady frames (${c.what.join(', ')})`);
      }
      const m = await page.evaluate(measure, { minTarget: MIN_TARGET, minText: MIN_TEXT });
      const e21 = await page.evaluate(() => ({ area: window.__SANDBOX__.plateArea(), numbers: window.__SANDBOX__.numbers().persistent.length }));
      checks += 7;
      if (m.small.length) fail(where, `U1 targets under ${MIN_TARGET} px: ${m.small.join(', ')}`);
      if (m.tinyText.length) fail(where, `U2 text under ${MIN_TEXT} px: ${m.tinyText.slice(0, 8).join(', ')}`);
      if (m.overlaps.length) fail(where, `U3 overlap: ${m.overlaps.slice(0, 6).join('; ')}`);
      if (m.hscroll) fail(where, `U3 horizontal scroll ${m.hscroll} px`);
      if (m.thumb.length) fail(where, `U4 controls above the thumb zone: ${m.thumb.join(', ')}`);
      if (e21.area > PLATE_MAX) fail(where, `E21 plates cover ${(e21.area * 100).toFixed(1)} % (max ${PLATE_MAX * 100} %)`);
      if (e21.numbers > NUMBERS_MAX) fail(where, `E21 ${e21.numbers} persistent numbers (max ${NUMBERS_MAX})`);
      if (opt.shots) await page.screenshot({ path: `${opt.out}/${vp.name}-${scene.replace(/[:+]/g, '_')}.png` });
      // HUD weight during play (no sheet, no dialog): the same scene over a white world.
      let weight = '';
      if (!preset.startsWith('sheet-') && preset !== 'return') {
        const white = await context.newPage();
        await white.goto(`${base}src/ui/dev/sandbox.html?state=${preset}${q}&white=1`);
        await white.waitForFunction(() => !!window.__SANDBOX__, null, { timeout: 60_000 });
        await white.waitForTimeout(preset === 'play' ? 3200 : 900);
        const w = hudWeight(await white.screenshot());
        checks++;
        weight = `, HUD weight ${(w * 100).toFixed(1)} %`;
        if (w > HUD_WEIGHT_MAX) fail(where, `HUD weight ${(w * 100).toFixed(1)} % of the screen at alpha ≥ 0.5 (max ${HUD_WEIGHT_MAX * 100} %)`);
        await white.close();
      }
      console.log(`${where}: ${m.controls} controls, ${m.small.length + m.tinyText.length + m.overlaps.length + (m.hscroll ? 1 : 0) + m.thumb.length} issues, plates ${(e21.area * 100).toFixed(1)} %, ${e21.numbers} numbers${weight}`);
      await context.close();
    }
  }

  // ----- 2. The real game: the face clears the plates; the sheet clears row A and the goal ---------------------------
  if (opt.game) {
    const overlap = (a, b) => Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x) > 1 && Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y) > 1;
    for (const vp of VIEWPORTS) {
      const where = `${vp.name} game`;
      const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: 1, hasTouch: true });
      const page = await context.newPage();
      page.on('pageerror', (e) => fail(where, `pageerror: ${e.message}`));
      // SwiftShader: the Battery preset at half render scale keeps frames short (layout does not depend on it).
      await page.addInitScript(() => {
        if (!localStorage.getItem('deepdown.settings')) localStorage.setItem('deepdown.settings', JSON.stringify({ quality: 'battery', autoQuality: false }));
      });
      await page.goto(`${base}index.html?rscale=0.5`);
      await page.waitForFunction(() => window.__DD__?.hybrid?.ready && window.__DD__.hybrid.mode() === 'playing', null, { timeout: 180_000, polling: 250 });
      await page.waitForFunction(() => window.__DD__.hybrid.faceCells().length > 0 && !window.__DD__.hybrid.camera().moving, null, { timeout: 120_000, polling: 250 });
      const read = () => page.evaluate(() => ({ cells: window.__DD__.hybrid.faceCells(), hud: window.__DD__.hybrid.hud() }));
      const r0 = await read();
      const plates = Object.entries(r0.hud.rects).filter(([k, r]) => r.visible && ['depth', 'gold', 'menu', 'goal', 'card-pick', 'card-best'].includes(k));
      const hits = [];
      for (const c of r0.cells) for (const [k, r] of plates) if (overlap(c.rect, r)) hits.push(`col ${c.col} × ${k}`);
      checks++;
      if (hits.length) fail(where, `U3 face blocks under plates: ${hits.slice(0, 6).join(', ')}`);
      // Open the sheet with a real tap on ≡.
      const menu = r0.hud.rects.menu;
      const cdp = await context.newCDPSession(page);
      const t = Date.now();
      const pt = [{ x: menu.x + menu.w / 2, y: menu.y + menu.h / 2, id: 1, radiusX: 8, radiusY: 8, force: 1 }];
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pt, timestamp: t / 1000 });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [], timestamp: (t + 60) / 1000 });
      const opened = await page.waitForFunction(() => window.__DD__.hybrid.hud().sheet !== '', null, { timeout: 30_000, polling: 100 }).then(() => true, () => false);
      await page.waitForTimeout(600);
      const r1 = await read();
      const sheet = r1.hud.rects.sheet;
      checks += 2;
      if (!opened || !sheet?.visible) fail(where, 'a real tap on ≡ did not open the sheet');
      else {
        const under = ['depth', 'gold', 'menu', 'goal'].filter((k) => r1.hud.rects[k]?.visible && overlap(r1.hud.rects[k], sheet));
        if (under.length) fail(where, `U3 the sheet covers ${under.join(', ')}`);
        const above = r1.cells.filter((c) => c.rect.y + c.rect.h / 2 < sheet.y).length;
        if (!above) fail(where, 'U3 with the sheet open no face block is left to tap above it');
      }
      if (opt.shots) await page.screenshot({ path: `${opt.out}/${vp.name}-game-sheet.png` });
      console.log(`${where}: ${r0.cells.length} blocks clear of ${plates.length} plates; sheet ${opened ? `top ${sheet?.y.toFixed(0)}` : 'not opened'}`);
      await context.close();
    }
  }
} finally {
  await browser.close();
  await server.close();
}
console.log(`\n${checks} checks, ${problems.length} problems`);
for (const p of problems) console.log(`  ${p}`);
process.exit(problems.length ? 1 : 0);
