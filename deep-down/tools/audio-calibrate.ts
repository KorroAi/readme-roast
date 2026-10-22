// The instruments' calibration: each timbre's phone loudness at its reference note against its
// target (instruments.ts CALIBRATION), and the gain that would hit it.
// Usage: node tools/run-ts.mjs tools/audio-calibrate.ts [--rate 24000]
import { maxMomentaryLoudness, phoneFilter } from '../src/audio/analysis';
import { CALIBRATION, TIMBRES, TIMBRE_NAMES } from '../src/audio/instruments';
import { renderSfxOfflineChannels } from '../src/audio/offline';
import { installSimAudio } from '../src/audio/sim/webAudioSim';

export async function measureTimbres(rate = 24000): Promise<Array<{ name: string; phone: number; target: number; gain: number; suggested: number }>> {
  const sim = installSimAudio(rate);
  const rows: Array<{ name: string; phone: number; target: number; gain: number; suggested: number }> = [];
  try {
    for (const name of TIMBRE_NAMES) {
      const ch = await renderSfxOfflineChannels(`music.${name}`, rate);
      const phone = maxMomentaryLoudness(ch.map((c) => phoneFilter(c, rate)), rate);
      const target = CALIBRATION[name].target;
      const gain = TIMBRES[name].gain;
      rows.push({ name, phone, target, gain, suggested: gain * Math.pow(10, (target - phone) / 20) });
    }
  } finally {
    sim.restore();
  }
  return rows;
}

export default async function main(args: string[]): Promise<void> {
  const rate = Number(args[args.indexOf('--rate') + 1] || 24000);
  const rows = await measureTimbres(rate);
  for (const r of rows) console.log(`${r.name.padEnd(12)} phone ${r.phone.toFixed(1).padStart(6)}  target ${String(r.target).padStart(4)}  gain ${r.gain.toFixed(3)} -> ${r.suggested.toFixed(3)}`);
}
