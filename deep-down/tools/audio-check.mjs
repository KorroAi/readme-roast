// The Chromium cross-check of the audio (round 3, AUDIO): real Web Audio in headless Chromium.
//
// 1. Renders every registered sound with Chromium's OfflineAudioContext through the game's mix graph
//    and checks it: audible, never past full scale (true peak), repeatable; mining hits timbrally
//    distinct (centroid crystal > metal > stone), pickups brighter with rarity.
// 2. Renders the same sounds on the Node Web Audio emulator (src/audio/sim, loaded into the same page)
//    and compares: the loudness (momentary max, LUFS) and the peak of each, so the proofs measured on
//    the emulator (tests/unit/audio*.test.ts, tools/audio-scenes.ts, tools/audio-system.ts) hold in a
//    browser.
// 3. A busy round-3 scene (a biome bed, feature loops, the score in a fight, hits, steps) rendered
//    offline: render time / audio time ~ the audio thread's load on this CPU.
// 4. The real AudioSystem, live, with the probe attached to a scripted game (src/audio/sim/system.ts
//    SceneGame): the camp, a biome, a fight, a guardian; it must start, play, follow the world, keep
//    its voice caps, never clip, and log no warning.
//
// Usage: node tools/audio-check.mjs [--rate 48000] [--realtime 1] [--only hit.stone,hit.metal] [--compare 1]
import { chromium } from '@playwright/test';
import { createServer } from 'vite';

const args = process.argv.slice(2);
const opt = { rate: '48000', realtime: '1', only: '', compare: '1' };
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
  // 1 + 2. Offline renders in Chromium, and the same on the emulator
  const offline = await page.evaluate(async ({ sampleRate, only, compare }) => {
    const { renderSfxOfflineChannels } = await import('/src/audio/offline.ts');
    const { analyzeSignal, maxMomentaryLoudness, peakOf, truePeakOf } = await import('/src/audio/analysis.ts');
    const { SFX, SFX_NAMES } = await import('/src/audio/sfx.ts');
    const { installSimAudio } = await import('/src/audio/sim/webAudioSim.ts');
    const mono = (ch) => {
      const [l, r = l] = ch;
      const m = new Float32Array(l.length);
      for (let i = 0; i < l.length; i++) m[i] = (l[i] + r[i]) * 0.5;
      return m;
    };
    const rows = [];
    for (const name of only.length ? SFX_NAMES.filter((n) => only.some((o) => n.startsWith(o))) : SFX_NAMES) {
      const t0 = performance.now();
      const ch = await renderSfxOfflineChannels(name, sampleRate);
      const ms = performance.now() - t0;
      const s = analyzeSignal(mono(ch), sampleRate);
      const row = { name, bus: SFX[name].bus, ...s, truePeak: Math.max(...ch.map(truePeakOf)), mom: maxMomentaryLoudness(ch, sampleRate), renderMs: ms };
      if (compare) {
        const sim = installSimAudio(sampleRate);
        try {
          const e = await renderSfxOfflineChannels(name, sampleRate);
          row.emuMom = maxMomentaryLoudness(e, sampleRate);
          row.emuPeak = Math.max(...e.map(peakOf));
        } finally {
          sim.restore();
        }
      }
      rows.push(row);
    }
    const a = mono(await renderSfxOfflineChannels('hit.stone', sampleRate));
    const b = mono(await renderSfxOfflineChannels('hit.stone', sampleRate));
    let maxDiff = a.length === b.length ? 0 : Infinity;
    for (let i = 0; i < a.length && i < b.length; i++) maxDiff = Math.max(maxDiff, Math.abs(a[i] - b[i]));
    return { rows, maxDiff, hasOffline: typeof OfflineAudioContext === 'function' };
  }, { sampleRate: rate, only: opt.only ? opt.only.split(',') : [], compare: opt.compare !== '0' });

  if (!offline.hasOffline) fail('OfflineAudioContext missing in Chromium');
  const pad = (s, n) => String(s).padEnd(n);
  const num = (v, d, n) => (Number.isFinite(v) ? v.toFixed(d) : String(v)).padStart(n);
  console.log(`\n${offline.rows.length} sounds rendered offline in Chromium at ${rate} Hz (mono = (L+R)/2; true peak = max over both channels)\n`);
  console.log(`${pad('sound', 22)}${'dur s'.padStart(7)}${'peak'.padStart(8)}${'truePk'.padStart(8)}${'momLU'.padStart(8)}${'emuLU'.padStart(8)}${'dLU'.padStart(7)}${'centroid'.padStart(10)}${'ms'.padStart(7)}`);
  const diffs = [];
  for (const r of offline.rows) {
    const d = Number.isFinite(r.emuMom) && Number.isFinite(r.mom) ? r.emuMom - r.mom : NaN;
    if (Number.isFinite(d)) diffs.push({ name: r.name, d });
    console.log(`${pad(r.name, 22)}${num(r.duration, 2, 7)}${num(r.peak, 3, 8)}${num(r.truePeak, 3, 8)}${num(r.mom, 1, 8)}${num(r.emuMom ?? NaN, 1, 8)}${num(d, 1, 7)}${num(r.centroid, 0, 10)}${num(r.renderMs, 0, 7)}`);
    // Ambience one-shots are heard far off through the reverb: their dry peak may sit lower.
    const floor = r.bus === 'ambience' ? 0.015 : 0.03;
    if (!(r.peak > floor)) fail(`${r.name}: peak ${r.peak.toFixed(3)} is not above ${floor}`);
    if (!(r.truePeak <= 1.0)) fail(`${r.name}: true peak ${r.truePeak.toFixed(3)} exceeds 1.0`);
    if (!(r.duration > 0)) fail(`${r.name}: silent render`);
  }
  console.log(`\nRepeat render of hit.stone: max sample difference ${offline.maxDiff.toExponential(2)}`);
  if (!(offline.maxDiff < 1e-3)) fail('offline renders are not repeatable');
  if (diffs.length) {
    const abs = diffs.map((x) => Math.abs(x.d)).sort((a, b) => a - b);
    const q = (p) => abs[Math.min(abs.length - 1, Math.floor(p * abs.length))];
    const worst = [...diffs].sort((a, b) => Math.abs(b.d) - Math.abs(a.d)).slice(0, 6);
    console.log(`Emulator vs Chromium, momentary loudness of ${diffs.length} sounds: median |d| ${q(0.5).toFixed(2)} dB, 90th ${q(0.9).toFixed(2)} dB, max ${abs[abs.length - 1].toFixed(2)} dB; worst ${worst.map((x) => `${x.name} ${x.d.toFixed(1)}`).join(', ')}`);
    if (!(q(0.5) < 1)) fail(`the emulator's loudness differs from Chromium's by a median ${q(0.5).toFixed(2)} dB`);
    if (!(q(0.9) < 3)) fail(`the emulator's loudness differs from Chromium's by ${q(0.9).toFixed(2)} dB at the 90th percentile`);
  }
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
  // 3. CPU estimate: a busy round-3 scene rendered offline (render time / audio time ~ audio-thread load).
  const scene = await page.evaluate(async (sampleRate) => {
    const { createMixGraph, busTarget } = await import('/src/audio/graph.ts');
    const { LanternLoop } = await import('/src/audio/layers.ts');
    const { BEDS, BiomeBed, emitterLayer } = await import('/src/audio/ambience.ts');
    const { MusicPlayer } = await import('/src/audio/MusicPlayer.ts');
    const { playSfx } = await import('/src/audio/sfx.ts');
    const { peakOf } = await import('/src/audio/analysis.ts');
    const seconds = 10;
    const ctx = new OfflineAudioContext(2, seconds * sampleRate, sampleRate);
    const g = createMixGraph(ctx, ctx.destination, 1);
    let seed = 1;
    const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const t = (bus) => busTarget(g, bus, rand);
    const bed = new BiomeBed(ctx, g.noise, g.buses.ambience.input, BEDS.floodedGrottoes, { to: g.buses.ambience.wet, amount: 0.35 });
    bed.weight = 1;
    bed.update(0, 0.1, 1.2, 0.5, 0.6);
    for (const kind of ['waterfall', 'river', 'crystal', 'torch']) emitterLayer(kind, ctx, g.noise, g.buses.ambience.input, null)?.setLevel(0.2, 0, 0);
    new LanternLoop(ctx, g.noise, g.buses.sfx.input).setLevel(0.08, 0, 0);
    const music = new MusicPlayer(t('music'), 3);
    music.play('floodedGrottoes', 0);
    const fight = { bed: 0.65, motif: 0.75, tension: 0.7, combat: 1 };
    for (let now = 0; now < seconds; now += 0.1) music.update(now, fight);
    let voices = 0;
    for (let at = 0.5; at < seconds - 1; at += 0.42, voices++) playSfx(t('sfx'), voices % 3 ? 'hit.stone' : 'mob.hit.flesh', { progress: (voices % 8) / 8 }, at);
    for (let at = 0.3; at < seconds - 1; at += 0.31) playSfx(t('sfx'), 'step.water', { intensity: 1 }, at);
    for (let at = 0.7; at < seconds - 1; at += 0.9) playSfx(t('sfx'), 'mob.chitter', { pan: 0.4 }, at);
    for (let at = 1; at < seconds - 1; at += 2.7) playSfx(t('ambience'), 'amb.drip', { pan: 0.5 }, at);
    const t0 = performance.now();
    const buf = await ctx.startRendering();
    const ms = performance.now() - t0;
    return { seconds, ms, factor: ms / 1000 / seconds, peak: Math.max(peakOf(buf.getChannelData(0)), peakOf(buf.getChannelData(1))) };
  }, rate);
  console.log(`\nBusy round-3 scene (a bed, four feature loops, the score in a fight, hits, steps, voices): ${scene.seconds} s rendered in ${scene.ms.toFixed(0)} ms ` +
    `(${(scene.factor * 100).toFixed(1)} % of real time on this CPU), peak ${scene.peak.toFixed(3)}`);
  if (!(scene.peak <= 1.0)) fail('busy scene clipped');

  // ---------------------------------------------------------------------------------------
  // 4. The real AudioSystem, live, with the probe on a scripted game
  if (opt.realtime !== '0') {
    const live = await page.evaluate(async () => {
      const { EventBus } = await import('/src/core/events.ts');
      const { AudioSystem, SFX_VOICES } = await import('/src/audio/AudioSystem.ts');
      const { MUSIC_VOICES } = await import('/src/audio/MusicPlayer.ts');
      const { gameAudioProbe } = await import('/src/audio/probe.ts');
      const { SceneGame } = await import('/src/audio/sim/system.ts');
      const { B } = await import('/src/config/blocks.ts');
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
      const bus = new EventBus();
      const audio = new AudioSystem(bus);
      const game = new SceneGame();
      audio.attach(gameAudioProbe(game));
      await audio.unlock();
      const state = { depth: 40, atCamp: true, openness: 0.6, lanternFuel: 0.8, lanternLit: true, nearCrystal: 0, nearFire: 0, playerSpeed: 3, inMenu: false };
      const out = { unlocked: audio.unlocked, contextState: audio.stats().state, peak: 0, maxVoices: 0, maxMusicVoices: 0, scores: [] };
      let last = performance.now();
      const frames = async (seconds) => {
        const end = performance.now() + seconds * 1000;
        while (performance.now() < end) {
          const now = performance.now();
          audio.update((now - last) / 1000, state);
          last = now;
          out.peak = Math.max(out.peak, audio.meter());
          const s = audio.stats();
          out.maxVoices = Math.max(out.maxVoices, s.sfxVoices);
          out.maxMusicVoices = Math.max(out.maxMusicVoices, s.musicVoices);
          if (s.score && !out.scores.includes(s.score)) out.scores.push(s.score);
          await sleep(16);
        }
      };
      // The camp, then out into Amber Hollows, steps and a few events.
      game.strata.biomeHere = 'amberHollows';
      await frames(3);
      state.atCamp = false;
      for (let i = 0; i < 12; i++) {
        bus.emit('player:footstep', { block: B.AMBER_FLOOR, speed: 6.5 });
        bus.emit(i % 3 ? 'block:hit' : 'block:broken', { x: 0, y: 0, z: 0, block: B.COPPER_ORE, progress: (i % 5) / 5 });
        await frames(0.3);
      }
      bus.emit('player:sonar', { x: 0, y: 0, z: 0, radius: 24, seconds: 2 });
      bus.emit('quest:done', { id: 'task:amberHollows.mine', kind: 'biome', reward: '+2' });
      // A fight: wind-ups, blows, a guardian waking.
      game.creatures = [0, 1, 2, 3].map((i) => ({ hostile: true, state: 'windup', position: { x: 130 + i, y: 40, z: 128 } }));
      for (let i = 0; i < 24; i++) {
        bus.emit('mob:telegraph', { id: i, kind: 'crawler', pan: 0.3, gain: 0.9 });
        bus.emit('mob:sfx', { name: 'mob.screech', pan: -0.5, gain: 0.8 });
        bus.emit('mob:hit', { id: i, kind: 'crawler', damage: 5, killed: false, armoured: false, pan: 0, gain: 1 });
        if (i % 4 === 0) bus.emit('player:damaged', { amount: 8, cause: 'hazard' });
        await frames(0.12);
      }
      game.guardian = { kind: 'amberMatriarch', phase: 1, phases: 2, hp: 300, max: 300 };
      bus.emit('mob:guardianAwake', { id: 50, kind: 'amberMatriarch', biome: 'amberHollows' });
      await frames(4);
      out.voiceCap = SFX_VOICES;
      out.musicCap = MUSIC_VOICES;
      out.final = audio.stats();
      audio.dispose();
      await sleep(100);
      return out;
    });
    const brief = { ...live, final: { score: live.final.score, phase: live.final.phase, key: live.final.key, intensity: live.final.intensity, sfxVoices: live.final.sfxVoices, musicVoices: live.final.musicVoices } };
    console.log('\nRealtime AudioSystem with the probe:', JSON.stringify(brief));
    if (!live.unlocked) fail(`realtime context did not start (state ${live.contextState})`);
    if (!(live.peak > 0.01)) fail('no realtime output');
    if (!(live.peak <= 1.0)) fail('realtime output clipped');
    if (live.maxVoices > live.voiceCap) fail(`voice cap exceeded: ${live.maxVoices} > ${live.voiceCap}`);
    if (live.maxMusicVoices > live.musicCap) fail(`score voice cap exceeded: ${live.maxMusicVoices} > ${live.musicCap}`);
    for (const id of ['camp', 'amberHollows', 'guardian1']) if (!live.scores.includes(id)) fail(`the score did not follow the world: ${live.scores.join(', ')} (missing ${id})`);
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
