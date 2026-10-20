// UI check of the idle HUD in real headless Chromium (SPEC §13.3 U1–U4, F10's steady frame), at the three phone
// sizes. Two parts:
//  1. The HUD sandbox (src/ui/dev/sandbox.html: the real HUD and the pure model over a painted backdrop, no WebGL):
//     every preset (fresh, early, mid, the Dig and Crew sheets, the return feast, Large text, left-handed) is
//     screenshotted and checked: touch targets ≥ 48 px (U1), text ≥ 12 px (U2), no overlap between the top bar,
//     the goal bar, the skill row, the quick-buy row, the tabs and an open sheet, and no horizontal scroll (U3),
//     every control but the top-bar plates, the goal bar and ≡ in the bottom 45 % (U4), and no DOM write in a
//     steady frame / no element created while the crew digs (F10).
//  2. The real game (index.html, WebGL): the floor line lies inside the world region with and without a sheet
//     (U3), with the Dig sheet opened by a real tap.
//
// Usage: node tools/ui-check.mjs [--out artifacts/idle/ui] [--vp 360x740,390x844,412x915] [--no-shots] [--no-game]
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
const opt = { out: 'artifacts/idle/ui', vp: '360x740,390x844,412x915', shots: true, game: true };
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
/** Presets: sandbox state, then actions (sheet:<id>, large, lefty). */
const SCENES = ['fresh', 'early', 'mid', 'mid+sheet:dig', 'mid+sheet:crew', 'feast', 'mid+large', 'mid+lefty', 'mid+sheet:dig+large'];

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
  const name = (el) => el.dataset.hud ?? el.dataset.tab ?? el.dataset.card ?? el.dataset.mode ?? el.dataset.skill ?? el.dataset.key ?? el.getAttribute('aria-label') ?? `${el.tagName.toLowerCase()}.${[...el.classList].join('.')}`;
  const out = { small: [], tinyText: [], overlaps: [], thumb: [], hscroll: 0, controls: 0 };
  const controls = [...document.querySelectorAll('#ui button, #ui [role="button"], #ui [data-tab], #ui .dd-card, #ui [data-mode], #ui [data-skill], #ui input, #ui select')];
  const seen = new Set();
  const free = new Set(['gold', 'depth', 'gems', 'menu', 'goal']);
  for (const el of controls) {
    if (seen.has(el)) continue;
    seen.add(el);
    const r = vis(el);
    if (!r) continue;
    out.controls++;
    if (r.width < minTarget - 0.5 || r.height < minTarget - 0.5) out.small.push(`${name(el)} ${r.width.toFixed(0)}×${r.height.toFixed(0)}`);
    // U4: in play, every control but the top-bar plates, the goal bar and ≡ sits in the bottom 45 %.
    const inTop = el.closest('[data-hud="gold"], [data-hud="depth"], [data-hud="gems"], [data-hud="menu"], [data-hud="goal"]');
    // A sheet's scrolled list is exempt: SPEC §9.4 puts the sheet's top edge at 42 %, and scrolling moves any row
    // anywhere; the sheet's own fixed controls (the buy modes, close) are checked.
    const inModal = el.closest('.dd-screen, .dd-feast, .dd-modal, .dd-firsttime, .dd-toast, .dd-sheet-scroll');
    if (!inTop && !inModal && !free.has(el.dataset.hud ?? '') && r.top + r.height / 2 < innerHeight * 0.55) out.thumb.push(`${name(el)} at y ${(r.top + r.height / 2).toFixed(0)}`);
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
    top: ['[data-hud="gold"]', '[data-hud="depth"]', '[data-hud="gems"]', '[data-hud="menu"]'],
    goal: ['[data-hud="goal"]'],
    skills: ['[data-hud="skillrow"]'],
    quick: ['.dd-quick .dd-card'],
    tabs: ['.dd-tabs-bar'],
    sheet: ['.dd-sheet'],
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
      const q = flags.filter((f) => !f.startsWith('sheet:')).map((f) => `&${f}=1`).join('');
      await page.goto(`${base}src/ui/dev/sandbox.html?state=${preset}${q}`);
      await page.waitForFunction(() => !!window.__SANDBOX__, null, { timeout: 60_000 });
      await page.waitForTimeout(500);
      for (const f of flags) {
        if (!f.startsWith('sheet:')) continue;
        const id = f.slice(6);
        const r = await page.evaluate((k) => {
          const el = document.querySelector(`[data-tab="${k}"]`);
          const q = el?.getBoundingClientRect();
          return q && q.width > 0 ? { x: q.left + q.width / 2, y: q.top + q.height / 2 } : null;
        }, id);
        if (!r) fail(where, `no ${id} tab to tap`);
        else await page.touchscreen.tap(r.x, r.y);
        await page.waitForTimeout(700);
      }
      // A steady frame first (fresh: nothing moves), then the measurements.
      if (preset === 'fresh') {
        // Past the reveal springs and the goal bar's first morph.
        await page.waitForTimeout(1500);
        const c = await churn(page, 1500);
        checks++;
        if (c.writes) fail(where, `F10: ${c.writes} DOM writes in 1.5 s of steady frames (${c.what.join(', ')})`);
      }
      if (preset === 'mid' && flags.length === 0) {
        const c = await churn(page, 3000);
        checks++;
        if (c.created.length) fail(where, `F10: ${c.created.length} elements created while the crew digs: ${[...new Set(c.created)].slice(0, 5).join(', ')}`);
      }
      const m = await page.evaluate(measure, { minTarget: MIN_TARGET, minText: MIN_TEXT });
      checks += 5;
      if (m.small.length) fail(where, `U1 targets under ${MIN_TARGET} px: ${m.small.join(', ')}`);
      if (m.tinyText.length) fail(where, `U2 text under ${MIN_TEXT} px: ${m.tinyText.slice(0, 8).join(', ')}`);
      if (m.overlaps.length) fail(where, `U3 overlap: ${m.overlaps.slice(0, 6).join('; ')}`);
      if (m.hscroll) fail(where, `U3 horizontal scroll ${m.hscroll} px`);
      if (m.thumb.length && preset !== 'feast') fail(where, `U4 controls above the thumb zone: ${m.thumb.join(', ')}`);
      if (opt.shots) await page.screenshot({ path: `${opt.out}/${vp.name}-${scene.replace(/[:+]/g, '_')}.png` });
      // HUD weight during play (no sheet, no feast): the same scene over a white world.
      let weight = '';
      if (preset !== 'feast' && !flags.some((f) => f.startsWith('sheet:'))) {
        const white = await context.newPage();
        await white.goto(`${base}src/ui/dev/sandbox.html?state=${preset}${q}&white=1`);
        await white.waitForFunction(() => !!window.__SANDBOX__, null, { timeout: 60_000 });
        await white.waitForTimeout(preset === 'fresh' ? 2000 : 900);
        const w = hudWeight(await white.screenshot());
        checks++;
        weight = `, HUD weight ${(w * 100).toFixed(1)} %`;
        if (w > HUD_WEIGHT_MAX) fail(where, `HUD weight ${(w * 100).toFixed(1)} % of the screen at alpha ≥ 0.5 (max ${HUD_WEIGHT_MAX * 100} %)`);
        await white.close();
      }
      console.log(`${where}: ${m.controls} controls, ${m.small.length + m.tinyText.length + m.overlaps.length + (m.hscroll ? 1 : 0) + (preset === 'feast' ? 0 : m.thumb.length)} issues${weight}`);
      await context.close();
    }
  }

  // ----- 2. The real game: the floor inside the world region, with and without a sheet ------------------------------
  if (opt.game) {
    for (const vp of VIEWPORTS) {
      const where = `${vp.name} game`;
      const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: 1, hasTouch: true });
      const page = await context.newPage();
      page.on('pageerror', (e) => fail(where, `pageerror: ${e.message}`));
      await page.goto(`${base}index.html`);
      await page.waitForFunction(() => window.__DD__?.idle?.ready && window.__DD__.idle.mode() === 'playing', null, { timeout: 180_000, polling: 250 });
      await page.evaluate(() => window.__DD__.idle.settings({ quality: 'battery', renderScale: 0.5 }));
      const floor = () => page.evaluate(() => {
        const c = window.__DD__.idle.columns();
        const sheet = document.querySelector('.dd-sheet');
        const st = sheet ? sheet.getBoundingClientRect().top : innerHeight;
        return { floorY: c.floorY, top: c.region.top, bottom: c.region.bottom, sheetTop: window.__DD__.idle.hud().sheet ? st : null };
      });
      const f0 = await floor();
      checks++;
      if (!(f0.floorY > f0.top && f0.floorY < f0.bottom)) fail(where, `U3 floor y ${f0.floorY.toFixed(0)} outside the region ${f0.top}–${f0.bottom}`);
      // Reveal the Dig tab the way a player does: real taps on the floor (the Pick step arrives at 30 gold and brings
      // the tab), then open the sheet with a real tap.
      for (let i = 0; i < 120; i++) {
        if (await page.evaluate(() => window.__DD__.idle.hud().rects['tab:dig']?.visible === true)) break;
        const p = await page.evaluate(() => {
          const c = window.__DD__.idle.columns();
          const s = c.strips[2 + (Math.floor(Math.random() * 3))];
          return { x: (s.left + s.right) / 2, y: c.floorY + 18 };
        });
        await page.touchscreen.tap(p.x, p.y);
        await page.waitForTimeout(150);
        if (i === 30) await page.evaluate(() => window.__DD__.idle.give({ gold: 40 }));
      }
      await page.waitForFunction(() => window.__DD__.idle.hud().rects['tab:dig']?.visible, null, { timeout: 60_000, polling: 250 });
      const tab = await page.evaluate(() => window.__DD__.idle.hud().rects['tab:dig']);
      await page.touchscreen.tap(tab.x + tab.w / 2, tab.y + tab.h / 2);
      await page.waitForFunction(() => window.__DD__.idle.hud().sheet === 'dig', null, { timeout: 30_000, polling: 100 });
      await page.waitForTimeout(900);
      const f1 = await floor();
      checks++;
      if (!(f1.floorY > f1.top && f1.sheetTop !== null && f1.floorY < f1.sheetTop)) fail(where, `U3 with the sheet open the floor y ${f1.floorY.toFixed(0)} is not between ${f1.top} and the sheet top ${f1.sheetTop}`);
      if (opt.shots) await page.screenshot({ path: `${opt.out}/${vp.name}-game-sheet.png` });
      console.log(`${where}: floor ${f0.floorY.toFixed(0)} in ${f0.top}–${f0.bottom}; with the sheet ${f1.floorY.toFixed(0)} above ${f1.sheetTop?.toFixed(0)}`);
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
