// MOBS: the creatures' voices rendered offline (AUDIO's Web Audio emulator), their peak and phone
// loudness, and a NaN check. Usage: node tools/run-ts.mjs tools/mob-voices.ts [names,...]
import { maxMomentaryLoudness, phoneFilter } from '../src/audio/analysis';
import { renderSfxOfflineChannels } from '../src/audio/offline';
import { installSimAudio } from '../src/audio/sim/webAudioSim';
import type { SfxName } from '../src/audio/sfx';

export default async function main(args: string[]): Promise<void> {
  const names = (args[0] ?? 'guardian.open,guardian.heartbeat,guardian.tell.slam,guardian.tell.ring,guardian.tell.charge,guardian.tell.line,guardian.tell.dive,guardian.roar,guardian.call,mob.hiss,mob.thud').split(',');
  const rate = 24000;
  const sim = installSimAudio(rate);
  try {
    for (const name of names) {
      const ch = await renderSfxOfflineChannels(name as SfxName, rate);
      let peak = 0;
      let nan = false;
      let sum = 0;
      let n = 0;
      for (const c of ch) for (const v of c) {
        if (!Number.isFinite(v)) nan = true;
        peak = Math.max(peak, Math.abs(v));
        sum += v * v;
        n++;
      }
      const phone = maxMomentaryLoudness(ch.map((c) => phoneFilter(c, rate)), rate);
      console.log(`${name.padEnd(22)} ${(ch[0].length / rate).toFixed(2)} s  peak ${peak.toFixed(3)}  rms ${Math.sqrt(sum / Math.max(1, n)).toFixed(4)}  phone ${phone.toFixed(1)} LUFS-ish${nan ? '  NaN!' : ''}`);
    }
  } finally {
    sim.restore();
  }
}
