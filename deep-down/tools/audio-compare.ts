// The emulator against Chromium (round 3, AUDIO): re-renders every sound on the Node Web Audio
// emulator (src/audio/sim) and compares its momentary loudness with a Chromium cross-check's table
// (tools/audio-check.mjs output), so a change to the emulator or to the sounds can be checked against
// the last browser run without a browser. Sounds changed since that run show up as the largest gaps.
// Usage: node tools/run-ts.mjs tools/audio-compare.ts <audio-check output file> [--rate 24000]
import { readFileSync } from 'node:fs';
import { maxMomentaryLoudness } from '../src/audio/analysis';
import { renderSfxOfflineChannels } from '../src/audio/offline';
import { SFX_NAMES } from '../src/audio/sfx';
import { installSimAudio } from '../src/audio/sim/webAudioSim';

export default async function main(args: string[]): Promise<void> {
  const file = args.find((a) => !a.startsWith('--') && a !== args[args.indexOf('--rate') + 1]);
  if (!file) throw new Error('usage: tools/audio-compare.ts <audio-check output> [--rate 24000]');
  const rate = Number(args.includes('--rate') ? args[args.indexOf('--rate') + 1] : 24000);
  // The cross-check's table: name, duration, peak, true peak, momentary LUFS (Chromium), ...
  const chrome = new Map<string, number>();
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^(\S+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)/);
    if (m) chrome.set(m[1], Number(m[5]));
  }
  const sim = installSimAudio(rate);
  const d: Array<{ name: string; d: number }> = [];
  try {
    for (const name of SFX_NAMES) {
      if (!chrome.has(name)) continue;
      const ch = await renderSfxOfflineChannels(name, rate);
      d.push({ name, d: maxMomentaryLoudness(ch, rate) - chrome.get(name)! });
    }
  } finally {
    sim.restore();
  }
  if (!d.length) throw new Error(`no sound of ${file} found`);
  const abs = d.map((x) => Math.abs(x.d)).sort((a, b) => a - b);
  const q = (p: number) => abs[Math.min(abs.length - 1, Math.floor(p * abs.length))];
  console.log(`${d.length} sounds at ${rate} Hz, emulator minus Chromium: median |d| ${q(0.5).toFixed(2)} dB, 90th ${q(0.9).toFixed(2)} dB, max ${abs[abs.length - 1].toFixed(2)} dB`);
  console.log('largest:', d.sort((a, b) => Math.abs(b.d) - Math.abs(a.d)).slice(0, 12).map((x) => `${x.name} ${x.d.toFixed(1)}`).join(', '));
}
