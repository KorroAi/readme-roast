// Offline report of every registered sound, rendered in Node through the game's real mix graph on
// the Web Audio emulator (src/audio/sim): duration, sample and true peak, loudness, centroid.
// Usage: node tools/run-ts.mjs tools/audio-report.ts [--rate 24000] [--only a,b] [--json out.json]
import { writeFileSync } from 'node:fs';
import { analyzeSignal, bandShares, maxMomentaryLoudness, mixStats, phoneFilter } from '../src/audio/analysis';
import { renderSfxOfflineChannels } from '../src/audio/offline';
import { SFX, SFX_NAMES } from '../src/audio/sfx';
import { installSimAudio } from '../src/audio/sim/webAudioSim';

export default async function main(args: string[]): Promise<void> {
  const opt: Record<string, string> = { rate: '24000', only: '', json: '' };
  for (let i = 0; i < args.length; i++) if (args[i].startsWith('--')) opt[args[i].slice(2)] = args[++i];
  const rate = Number(opt.rate);
  const sim = installSimAudio(rate);
  const only = opt.only ? opt.only.split(',') : [];
  const rows: Array<Record<string, number | string>> = [];
  const t0 = performance.now();
  try {
    for (const name of only.length ? SFX_NAMES.filter((n) => only.some((o) => n.startsWith(o))) : SFX_NAMES) {
      const t = performance.now();
      const ch = await renderSfxOfflineChannels(name, rate);
      const ms = performance.now() - t;
      const mono = new Float32Array(ch[0].length);
      for (let i = 0; i < mono.length; i++) mono[i] = (ch[0][i] + ch[1][i]) * 0.5;
      const s = analyzeSignal(mono, rate);
      const m = mixStats(ch, rate);
      const d = SFX[name];
      const b = bandShares(mono, rate);
      rows.push({ name, bus: d.bus, prio: d.priority, dur: s.duration, peak: m.peak, truePeak: m.truePeak, lufs: m.lufs, mom: maxMomentaryLoudness(ch, rate), phone: maxMomentaryLoudness(ch.map((c) => phoneFilter(c, rate)), rate), low: b[0], mid: b[1], high: b[2], centroid: s.centroid, nonFinite: m.nonFinite, ms });
    }
  } finally {
    sim.restore();
  }
  const pad = (v: string | number, n: number) => String(v).padEnd(n);
  const num = (v: number, d: number, n: number) => (Number.isFinite(v) ? v.toFixed(d) : String(v)).padStart(n);
  console.log(`\n${rows.length} sounds at ${rate} Hz in ${((performance.now() - t0) / 1000).toFixed(1)} s (emulated Web Audio, the game's mix graph)\n`);
  console.log(`${pad('sound', 24)}${pad('bus', 9)}${'pri'.padStart(4)}${'dur s'.padStart(7)}${'peak'.padStart(7)}${'tPeak'.padStart(7)}${'LUFS'.padStart(7)}${'momLU'.padStart(7)}${'phone'.padStart(7)}${'low%'.padStart(6)}${'mid%'.padStart(6)}${'cent'.padStart(7)}`);
  for (const r of rows) {
    console.log(`${pad(r.name, 24)}${pad(r.bus, 9)}${num(r.prio as number, 0, 4)}${num(r.dur as number, 2, 7)}${num(r.peak as number, 3, 7)}${num(r.truePeak as number, 3, 7)}${num(r.lufs as number, 1, 7)}${num(r.mom as number, 1, 7)}${num(r.phone as number, 1, 7)}${num((r.low as number) * 100, 0, 6)}${num((r.mid as number) * 100, 0, 6)}${num(r.centroid as number, 0, 7)}`);
  }
  const bad = rows.filter((r) => (r.nonFinite as number) > 0 || !((r.truePeak as number) <= 1) || !((r.peak as number) > 0.01));
  console.log(`\nproblems: ${bad.length ? bad.map((r) => r.name).join(', ') : 'none'} (non-finite, true peak > 1, or silent)`);
  if (opt.json) writeFileSync(opt.json, JSON.stringify(rows, null, 1));
}
