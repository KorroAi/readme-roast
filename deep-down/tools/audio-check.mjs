// Verify the synthesized audio in headless Chromium (real Web Audio).
//
// 1. Renders every registered sound with OfflineAudioContext through the game's mix graph and
//    reports duration, peak, RMS and spectral centroid. Fails unless every peak is in
//    (0.05, 1.0] and mining hits are timbrally distinct: centroid crystal > metal > stone.
//    Pickups must get brighter (higher centroid) with item rarity.
// 2. Runs the realtime AudioSystem for a few seconds (ambience, music, every game event, a
//    burst of hits) and checks it plays, stays under the voice cap and never clips.
//
// Usage: node tools/audio-check.mjs [--rate 48000] [--realtime 1] [--only hit.stone,hit.metal]
import { chromium } from '@playwright/test';
import { createServer } from 'vite';

const args = process.argv.slice(2);
const opt = { rate: '48000', realtime: '1', only: '' };
for (let i = 0; i < args.length; i++) if (args[i].startsWith('--')) opt[args[i].slice(2)] = args[++i];
const rate = Number(opt.rate);

const server = await createServer({ server: { port: 5198, strictPort: false, hmr: false }, logLevel: 'error' });
await server.listen();
const url = server.resolvedUrls?.local?.[0] ?? `http://localhost:${server.config.server.port}/`;
const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
const failures = [];
const fail = (msg) => failures.push(msg);

try {
  const page = await browser.newPage();
  const logs = [];
  page.on('console', (m) => (m.type() === 'error' || m.type() === 'warning') && logs.push(`[${m.type()}] ${m.text()}`));
  page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
  // A blank page on the Vite origin, so modules under /src can be imported directly.
  await page.route('**/__audio_check__', (route) =>
    route.fulfill({ contentType: 'text/html', body: '<!doctype html><meta charset="utf-8"><title>audio check</title>' }),
  );
  await page.goto(`${url}__audio_check__`);

  // ---------------------------------------------------------------------------------------
  // Offline renders
  const offline = await page.evaluate(async ({ sampleRate, only }) => {
    const { renderSfxOffline, renderSfxOfflineChannels } = await import('/src/audio/offline.ts');
    const { analyzeSignal, peakOf } = await import('/src/audio/analysis.ts');
    const { SFX_NAMES } = await import('/src/audio/sfx.ts');
    const rows = [];
    for (const name of only.length ? SFX_NAMES.filter((n) => only.includes(n)) : SFX_NAMES) {
      const t0 = performance.now();
      const mono = await renderSfxOffline(name, sampleRate);
      const ms = performance.now() - t0;
      const channels = await renderSfxOfflineChannels(name, sampleRate);
      const s = analyzeSignal(mono, sampleRate);
      rows.push({ name, ...s, truePeak: Math.max(...channels.map(peakOf)), renderMs: ms });
    }
    const a = await renderSfxOffline('hit.stone', sampleRate);
    const b = await renderSfxOffline('hit.stone', sampleRate);
    let maxDiff = a.length === b.length ? 0 : Infinity;
    for (let i = 0; i < a.length && i < b.length; i++) maxDiff = Math.max(maxDiff, Math.abs(a[i] - b[i]));
    return { rows, maxDiff, hasOffline: typeof OfflineAudioContext === 'function' };
  }, { sampleRate: rate, only: opt.only ? opt.only.split(',') : [] });

  if (!offline.hasOffline) fail('OfflineAudioContext missing in Chromium');
  const pad = (s, n) => String(s).padEnd(n);
  const num = (v, d, n) => v.toFixed(d).padStart(n);
  console.log(`\nOffline renders at ${rate} Hz (mono = (L+R)/2; true peak = max over both channels)\n`);
  console.log(`${pad('sound', 18)}${'dur s'.padStart(7)}${'peak'.padStart(8)}${'truePk'.padStart(8)}${'rms'.padStart(8)}${'centroid'.padStart(10)}${'ms'.padStart(7)}`);
  for (const r of offline.rows) {
    console.log(`${pad(r.name, 18)}${num(r.duration, 2, 7)}${num(r.peak, 3, 8)}${num(r.truePeak, 3, 8)}${num(r.rms, 4, 8)}${num(r.centroid, 0, 10)}${num(r.renderMs, 0, 7)}`);
    if (!(r.peak > 0.05)) fail(`${r.name}: peak ${r.peak.toFixed(3)} is not above 0.05`);
    if (!(r.truePeak <= 1.0)) fail(`${r.name}: true peak ${r.truePeak.toFixed(3)} exceeds 1.0`);
    if (!(r.duration > 0)) fail(`${r.name}: silent render`);
  }
  console.log(`\nRepeat render of hit.stone: max sample difference ${offline.maxDiff.toExponential(2)}`);
  if (!(offline.maxDiff < 1e-3)) fail('offline renders are not repeatable');
  const c = Object.fromEntries(offline.rows.map((r) => [r.name, r.centroid]));
  const stone = c['hit.stone'];
  const metal = c['hit.metal'];
  const crystal = c['hit.crystal'];
  if (stone && metal && crystal) {
    console.log(`Hit centroids: stone ${stone.toFixed(0)} Hz, metal ${metal.toFixed(0)} Hz, crystal ${crystal.toFixed(0)} Hz` +
      ` (metal/stone x${(metal / stone).toFixed(2)}, crystal/metal x${(crystal / metal).toFixed(2)})`);
    if (!(metal > stone * 1.25)) fail('metal hit is not clearly brighter than stone');
    if (!(crystal > metal * 1.25)) fail('crystal hit is not clearly brighter than metal');
  }
  const pickups = ['common', 'uncommon', 'rare', 'relic'].map((r) => c[`pickup.${r}`]);
  if (pickups.every(Boolean)) {
    console.log(`Pickup centroids by rarity (common, uncommon, rare, relic): ${pickups.map((v) => v.toFixed(0)).join(' < ')} Hz`);
    if (pickups.some((v, i) => i > 0 && !(v > pickups[i - 1]))) fail('pickups do not get brighter with rarity');
  }

  // ---------------------------------------------------------------------------------------
  // CPU estimate: a busy 10 s mining scene (every continuous layer, the score, a hit per
  // swing, footsteps, drips) rendered offline. Render time / audio time ~ audio-thread load.
  const scene = await page.evaluate(async (sampleRate) => {
    const { createMixGraph, busTarget } = await import('/src/audio/graph.ts');
    const { CampfireLoop, CaveBed, CrystalHum, LanternLoop } = await import('/src/audio/layers.ts');
    const { MusicPlayer } = await import('/src/audio/MusicPlayer.ts');
    const { playSfx } = await import('/src/audio/sfx.ts');
    const { peakOf } = await import('/src/audio/analysis.ts');
    const seconds = 10;
    const ctx = new OfflineAudioContext(2, seconds * sampleRate, sampleRate);
    const g = createMixGraph(ctx, ctx.destination, 1);
    let seed = 1;
    const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const t = (bus) => busTarget(g, bus, rand);
    new CaveBed(ctx, g.noise, g.buses.ambience.input).setLevel(0.5, 0, 0);
    new LanternLoop(ctx, g.noise, g.buses.sfx.input).setLevel(0.08, 0, 0);
    new CampfireLoop(ctx, g.noise, g.buses.ambience.input).setLevel(0.3, 0, 0);
    new CrystalHum(ctx, g.noise, g.buses.ambience.input).setLevel(0.05, 0, 0);
    const music = new MusicPlayer(t('music'), 3);
    for (let now = 0; now < seconds; now += 0.1) music.update(now, 'mid');
    let voices = 0;
    for (let at = 0.5; at < seconds - 1; at += 0.42, voices++) playSfx(t('sfx'), voices % 3 ? 'hit.stone' : 'hit.metal', { progress: (voices % 8) / 8 }, at);
    for (let at = 0.3; at < seconds - 1; at += 0.4) playSfx(t('sfx'), 'step.stone', {}, at);
    for (let at = 1; at < seconds - 1; at += 2.7) playSfx(t('ambience'), 'amb.drip', { pan: 0.5 }, at);
    const t0 = performance.now();
    const buf = await ctx.startRendering();
    const ms = performance.now() - t0;
    return { seconds, ms, factor: (ms / 1000) / seconds, peak: Math.max(peakOf(buf.getChannelData(0)), peakOf(buf.getChannelData(1))) };
  }, rate);
  console.log(`\nBusy scene: ${scene.seconds} s rendered in ${scene.ms.toFixed(0)} ms ` +
    `(${(scene.factor * 100).toFixed(1)} % of real time on this CPU), peak ${scene.peak.toFixed(3)}`);
  if (!(scene.peak <= 1.0)) fail('busy scene clipped');

  // ---------------------------------------------------------------------------------------
  // Realtime system
  if (opt.realtime !== '0') {
    const live = await page.evaluate(async () => {
      const { EventBus } = await import('/src/core/events.ts');
      const { AudioSystem, SFX_VOICES } = await import('/src/audio/AudioSystem.ts');
      const { B } = await import('/src/config/blocks.ts');
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
      const bus = new EventBus();
      const audio = new AudioSystem(bus);
      await audio.unlock();
      const state = { depth: 100, atCamp: false, openness: 0.8, lanternFuel: 0.15, lanternLit: true, nearCrystal: 0.6, nearFire: 0.5, playerSpeed: 3, inMenu: false };
      const out = { unlocked: audio.unlocked, contextState: audio.stats().state, ambientPeak: 0, eventPeak: 0, burstPeak: 0, maxVoices: 0, maxMusicVoices: 0, moods: [] };
      let last = performance.now();
      const frames = async (seconds, onFrame) => {
        const end = performance.now() + seconds * 1000;
        while (performance.now() < end) {
          const now = performance.now();
          audio.update((now - last) / 1000, state);
          last = now;
          const m = audio.meter();
          const s = audio.stats();
          out.maxVoices = Math.max(out.maxVoices, s.sfxVoices);
          out.maxMusicVoices = Math.max(out.maxMusicVoices, s.musicVoices);
          if (s.mood && !out.moods.includes(s.mood)) out.moods.push(s.mood);
          onFrame?.(m);
          await sleep(16);
        }
      };
      // Ambience, lantern sputter, campfire, crystal hum and the first music phrase.
      await frames(3, (m) => (out.ambientPeak = Math.max(out.ambientPeak, m)));
      const at = { x: 0, y: 0, z: 0 };
      const events = [
        ['block:hit', { ...at, block: B.SLATE, progress: 0.2 }], ['block:hit', { ...at, block: B.COPPER_ORE, progress: 0.5 }],
        ['block:hit', { ...at, block: B.CRYSTAL, progress: 0.8 }], ['block:broken', { ...at, block: B.SLATE }],
        ['block:tooHard', { ...at, block: B.ANCIENT_BRICK, requiredTier: 99 }], ['tool:swing', { tier: 1 }],
        ['item:picked', { item: 'stone', count: 1 }], ['item:picked', { item: 'ancientTablet', count: 1 }],
        ['items:banked', { total: 12, items: { stone: 12 } }], ['craft:done', { recipe: 'copperPickaxe' }], ['discovery', { id: 'hollow' }],
        ['player:footstep', { block: B.SLATE, speed: 4 }], ['player:land', { fallSpeed: 18, block: B.SOIL }],
        ['player:damaged', { amount: 20, cause: 'fall' }], ['lantern:empty', {}], ['lantern:refueled', {}], ['camp:entered', {}], ['game:saved', { reason: 'test' }],
      ];
      for (const [type, payload] of events) {
        bus.emit(type, payload);
        await frames(0.12, (m) => (out.eventPeak = Math.max(out.eventPeak, m)));
      }
      audio.ui('click');
      // Stress: far more hits than the voice cap in one second.
      for (let i = 0; i < 60; i++) {
        bus.emit('block:hit', { ...at, block: i % 2 ? B.SLATE : B.COPPER_ORE, progress: (i % 10) / 10 });
        await frames(0.016, (m) => (out.burstPeak = Math.max(out.burstPeak, m)));
      }
      state.atCamp = true;
      state.depth = 49;
      await frames(2.5);
      audio.setPaused(true);
      await frames(0.5);
      out.voiceCap = SFX_VOICES;
      out.final = audio.stats();
      audio.dispose();
      await sleep(100);
      return out;
    });
    console.log('\nRealtime AudioSystem:', JSON.stringify(live));
    if (!live.unlocked) fail(`realtime context did not start (state ${live.contextState})`);
    if (!(live.ambientPeak > 0.002)) fail('no ambience output in realtime');
    if (!(live.eventPeak > 0.05)) fail('event sounds produced no realtime output');
    if (!(Math.max(live.ambientPeak, live.eventPeak, live.burstPeak) <= 1.0)) fail('realtime output clipped');
    if (live.maxVoices > live.voiceCap) fail(`voice cap exceeded: ${live.maxVoices} > ${live.voiceCap}`);
    if (!live.moods.includes('camp') || !live.moods.includes('mid')) fail(`music moods did not follow the world: ${live.moods}`);
  }

  const relevant = logs.filter((l) => !l.includes('favicon'));
  if (relevant.length) {
    console.log('\nBrowser console:\n' + relevant.slice(0, 20).join('\n'));
    fail(`${relevant.length} browser errors/warnings`);
  }
} finally {
  await browser.close();
  await server.close();
}

if (failures.length) {
  console.log('\nFAILED:\n- ' + failures.join('\n- '));
  process.exit(1);
}
console.log('\nAll audio checks passed.');
