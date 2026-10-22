import { bandShares, integratedLoudness, phoneFilter, truePeakOf } from '../src/audio/analysis';
import { systemRig } from '../src/audio/sim/system';
import { BIOME_SCORES } from '../src/audio/scores';
export default async function main(): Promise<void> {
  const rate = 8000;
  for (const biome of [...BIOME_SCORES, 'camp']) {
    const rig = systemRig({ sampleRate: rate, volumes: { master: 0.8, music: 0, sfx: 0, ambience: 0.6 } });
    try {
      if (biome === 'camp') rig.state.atCamp = true;
      else rig.game.strata.biomeHere = biome as never;
      rig.run(4);
      rig.take();
      rig.run(12);
      const [l, r] = rig.take();
      const mono = new Float32Array(l.length);
      for (let i = 0; i < l.length; i++) mono[i] = (l[i] + r[i]) / 2;
      const [lo, mid, hi] = bandShares(mono, rate);
      console.log(biome.padEnd(15), `LUFS ${integratedLoudness([l, r], rate).toFixed(1)}  phone ${integratedLoudness([phoneFilter(l, rate), phoneFilter(r, rate)], rate).toFixed(1)}  tp ${Math.max(truePeakOf(l), truePeakOf(r)).toFixed(2)}  bands <250 ${(lo * 100).toFixed(0)}% mid ${(mid * 100).toFixed(0)}% >2k ${(hi * 100).toFixed(0)}%  shots ${Object.entries(rig.audio.stats().played).filter(([k]) => k.startsWith('amb.')).map(([k, n]) => `${k.slice(4)}×${n}`).join(' ')}`);
    } finally {
      rig.close();
    }
  }
}
