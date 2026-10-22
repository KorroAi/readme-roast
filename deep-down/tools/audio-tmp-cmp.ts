import { readFileSync } from 'node:fs';
import { maxMomentaryLoudness } from '../src/audio/analysis';
import { renderSfxOfflineChannels } from '../src/audio/offline';
import { SFX_NAMES } from '../src/audio/sfx';
import { installSimAudio } from '../src/audio/sim/webAudioSim';
export default async function main(): Promise<void> {
  const rate = 24000;
  const chrome = new Map<string, number>();
  for (const line of readFileSync(process.env.CHECK!, 'utf8').split('\n')) {
    const m = line.match(/^(\S+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)/);
    if (m) chrome.set(m[1], Number(m[5]));
  }
  const sim = installSimAudio(rate);
  const d: Array<{ name: string; d: number }> = [];
  for (const name of SFX_NAMES) {
    if (!chrome.has(name)) continue;
    const ch = await renderSfxOfflineChannels(name, rate);
    d.push({ name, d: maxMomentaryLoudness(ch, rate) - chrome.get(name)! });
  }
  sim.restore();
  const abs = d.map((x) => Math.abs(x.d)).sort((a, b) => a - b);
  const q = (p: number) => abs[Math.min(abs.length - 1, Math.floor(p * abs.length))];
  console.log(`${d.length} sounds: median |d| ${q(0.5).toFixed(2)} dB, 90th ${q(0.9).toFixed(2)}, max ${abs[abs.length - 1].toFixed(2)}`);
  console.log('worst:', d.sort((a, b) => Math.abs(b.d) - Math.abs(a.d)).slice(0, 12).map((x) => `${x.name} ${x.d.toFixed(1)}`).join(', '));
}
