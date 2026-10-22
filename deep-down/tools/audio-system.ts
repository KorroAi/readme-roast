// The real AudioSystem on the Web Audio emulator, driven by scripted scenes through the real probe
// (src/audio/sim/system.ts): the dense combat mix, a biome walk with a border, a descent, the finale.
// Prints peaks (sample and true), loudness, clipping, NaN, voices, per second and per scene.
// Usage: node tools/run-ts.mjs tools/audio-system.ts [--rate 16000] [--only dense,walk,descent,finale] [--wav dir]
import { mkdirSync, writeFileSync } from 'node:fs';
import { integratedLoudness, mixStats, phoneFilter, truePeakOf } from '../src/audio/analysis';
import { SFX_VOICES } from '../src/audio/AudioSystem';
import { MUSIC_VOICES } from '../src/audio/MusicPlayer';
import { CATEGORY_CAP } from '../src/audio/mixer';
import { DEFAULT_VOLUMES } from '../src/audio/sim/scenes';
import { SYSTEM_SCENES, systemRig, type SystemRig } from '../src/audio/sim/system';

function wav(path: string, ch: [Float32Array, Float32Array], sr: number): void {
  const n = ch[0].length;
  const buf = Buffer.alloc(44 + n * 4);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + n * 4, 4);
  buf.write('WAVEfmt ', 8);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(2, 22);
  buf.writeUInt32LE(sr, 24);
  buf.writeUInt32LE(sr * 4, 28);
  buf.writeUInt16LE(4, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(n * 4, 40);
  for (let i = 0; i < n; i++) for (let c = 0; c < 2; c++) buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, ch[c][i] || 0)) * 32767), 44 + i * 4 + c * 2);
  writeFileSync(path, buf);
}

const f = (v: number, d = 1) => (Number.isFinite(v) ? v.toFixed(d) : String(v));

/** Each bus alone in a scene (the others at 0): its loudness, full range and through a phone, at the default levels. */
function balance(rate: number, names: string[]): void {
  const buses = { all: DEFAULT_VOLUMES, music: { ...DEFAULT_VOLUMES, sfx: 0, ambience: 0 }, ambience: { ...DEFAULT_VOLUMES, music: 0, sfx: 0 }, sfx: { ...DEFAULT_VOLUMES, music: 0, ambience: 0 } };
  console.log(`\nThe balance of the buses (default volumes), integrated LUFS full / phone (300 Hz high-pass):\n`);
  for (const name of names) {
    const cells: string[] = [];
    for (const [bus, volumes] of Object.entries(buses)) {
      const rig = systemRig({ sampleRate: rate, volumes });
      try {
        SYSTEM_SCENES[name].run(rig);
        const ch = rig.take();
        const phone = integratedLoudness([phoneFilter(ch[0], rate), phoneFilter(ch[1], rate)], rate);
        cells.push(`${bus} ${f(integratedLoudness(ch, rate))} / ${f(phone)}`);
      } finally {
        rig.close();
      }
    }
    console.log(`  ${name.padEnd(8)} ${cells.join(' | ')}`);
  }
}

export default async function main(args: string[]): Promise<void> {
  const opt: Record<string, string> = { rate: '16000', only: '', wav: '', balance: '' };
  for (let i = 0; i < args.length; i++) if (args[i].startsWith('--')) opt[args[i].slice(2)] = args[++i];
  const rate = Number(opt.rate);
  if (opt.balance) {
    balance(rate, opt.balance.split(','));
    return;
  }
  const names = opt.only ? opt.only.split(',') : Object.keys(SYSTEM_SCENES);
  if (opt.wav) mkdirSync(opt.wav, { recursive: true });
  console.log(`\nThe AudioSystem on the emulator at ${rate} Hz, default volumes (master 0.8, music 0.55, sfx 0.8, ambience 0.6); caps: ${SFX_VOICES} one-shots, ${MUSIC_VOICES} score voices.\n`);
  for (const name of names) {
    const scene = SYSTEM_SCENES[name];
    if (!scene) continue;
    const rig: SystemRig = systemRig({ sampleRate: rate });
    const t0 = performance.now();
    const marks: Array<{ at: number; label: string }> = [];
    try {
      scene.run(rig, (label) => marks.push({ at: rig.ctx.currentTime, label }));
      const ms = performance.now() - t0;
      const ch = rig.take();
      const m = mixStats(ch, rate);
      const phone = integratedLoudness([phoneFilter(ch[0], rate), phoneFilter(ch[1], rate)], rate);
      console.log(`${name}: ${scene.title}`);
      console.log(`  ${f(m.seconds, 1)} s in ${f(ms / 1000, 1)} s | peak ${f(m.peak, 3)} | true peak ${f(m.truePeak, 3)} | clipped ${m.clipped} | NaN ${m.nonFinite} | LUFS ${f(m.lufs)} (phone ${f(phone)}) | short-term max ${f(m.shortTermMax)} | DC ${m.dc.toExponential(1)}`);
      const p = rig.peaks;
      const caps = Object.entries(p.categories).map(([k, n]) => `${k} ${n}/${CATEGORY_CAP[k as keyof typeof CATEGORY_CAP]}`).join(', ');
      console.log(`  voices: one-shots max ${p.sfx}/${SFX_VOICES}, score max ${p.music}/${MUSIC_VOICES}, decks max ${p.decks}, emulator sources max ${p.sources} | per category: ${caps}`);
      // Per second: peak and loudness, to see the arc of the scene.
      const sec: string[] = [];
      for (let s = 0; s + 1 <= m.seconds; s++) {
        const a = Math.round(s * rate);
        const b = Math.round((s + 1) * rate);
        const l = ch[0].subarray(a, b);
        const r = ch[1].subarray(a, b);
        const lufs = integratedLoudness([l, r], rate);
        sec.push(`${s}:${f(lufs, 0)}/${f(Math.max(truePeakOf(l), truePeakOf(r)), 2)}`);
      }
      console.log(`  per second (LUFS/true peak): ${sec.join(' ')}`);
      if (marks.length) console.log(`  marks: ${marks.map((x) => `${f(x.at - 0.4, 1)}s ${x.label}`).join(' | ')}`);
      if (opt.wav) wav(`${opt.wav}/system-${name}.wav`, ch, rate);
    } finally {
      rig.close();
    }
  }
}
