// Offline renders of the score per biome (explore, tension, combat, after) and of the guardian themes
// through their phases, on the Web Audio emulator in Node (the full mixes: tools/audio-system.ts).
// Usage: node tools/run-ts.mjs tools/audio-scenes.ts [--rate 24000] [--only amberHollows,guardian3] [--wav dir]
import { mkdirSync, writeFileSync } from 'node:fs';
import { bandShares, integratedLoudness, phoneFilter } from '../src/audio/analysis';
import { BIOME_ARC, COMBAT, renderMusicScene, type SceneResult } from '../src/audio/sim/scenes';
import { SCORE_IDS, isGuardianScore, type ScoreId } from '../src/audio/scores';

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
  for (let i = 0; i < n; i++) {
    for (let c = 0; c < 2; c++) {
      const v = Math.max(-1, Math.min(1, ch[c][i] || 0));
      buf.writeInt16LE(Math.round(v * 32767), 44 + i * 4 + c * 2);
    }
  }
  writeFileSync(path, buf);
}

const f = (v: number, d = 1) => (Number.isFinite(v) ? v.toFixed(d) : String(v));

/** Each layer soloed: its loudness through a phone speaker, full-range, and its low/mid/high shares. */
function layers(ids: ScoreId[], rate: number, seconds: number): void {
  const solos = [
    ['bed', { bed: 1, motif: 0, tension: 0, combat: 0 }],
    ['motif', { bed: 0, motif: 1, tension: 0, combat: 0 }],
    ['tension', { bed: 0, motif: 0, tension: 1, combat: 0 }],
    ['combat', { bed: 0, motif: 0, tension: 0, combat: 1 }],
  ] as const;
  console.log(`\nLayers soloed (${seconds} s each): phone LUFS / full LUFS / low-mid-high %\n`);
  console.log(`${'score'.padEnd(16)}${solos.map(([n]) => n.padStart(26)).join('')}`);
  for (const id of ids) {
    const cells: string[] = [];
    for (const [name, mix] of solos) {
      const r = renderMusicScene(id, [{ name, seconds, mix }], { sampleRate: rate });
      const [l, rr] = r.channels;
      const mono = new Float32Array(l.length);
      for (let i = 0; i < l.length; i++) mono[i] = (l[i] + rr[i]) / 2;
      const phone = integratedLoudness([phoneFilter(l, rate), phoneFilter(rr, rate)], rate);
      const b = bandShares(mono, rate);
      cells.push(`${f(phone)} / ${f(r.whole.lufs)} / ${b.map((v) => Math.round(v * 100)).join('-')}`.padStart(26));
    }
    console.log(`${id.padEnd(16)}${cells.join('')}`);
  }
}

export default async function main(args: string[]): Promise<void> {
  const opt: Record<string, string> = { rate: '24000', only: '', wav: '', layers: '' };
  for (let i = 0; i < args.length; i++) if (args[i].startsWith('--')) opt[args[i].slice(2)] = args[++i];
  const rate = Number(opt.rate);
  const ids = (opt.only ? opt.only.split(',') : SCORE_IDS) as ScoreId[];
  if (opt.layers) {
    layers(ids, rate, Number(opt.layers));
    return;
  }
  if (opt.wav) mkdirSync(opt.wav, { recursive: true });
  console.log(`\nScores at ${rate} Hz on the emulator (default volumes: master 0.8, music 0.55). LUFS integrated per stage; peaks are true peaks of the final output.\n`);
  console.log(`${'score'.padEnd(16)}${'explore|p1'.padStart(11)}${'tension|p2'.padStart(11)}${'combat|p3'.padStart(11)}${'after'.padStart(9)}${'tPeak'.padStart(8)}${'clip'.padStart(6)}${'NaN'.padStart(5)}${'voices'.padStart(8)}${'cent'.padStart(7)}${'ms'.padStart(8)}`);
  const results: Array<{ id: ScoreId; r: SceneResult }> = [];
  for (const id of ids) {
    const t0 = performance.now();
    // A guardian's fight through its phases (the Dark Heart's three: the last sings the game's theme).
    const guardianStages = [
      { name: 'phase 1', seconds: 16, mix: COMBAT },
      { name: 'phase 2', seconds: 16, mix: COMBAT, enter: (_now: number, p: { setPhase(n: number, of?: number): void }) => p.setPhase(2, id === 'heartBoss' ? 3 : 2) },
      ...(id === 'heartBoss' ? [{ name: 'phase 3', seconds: 16, mix: COMBAT, enter: (_now: number, p: { setPhase(n: number, of?: number): void }) => p.setPhase(3, 3) }] : []),
    ];
    const stages = isGuardianScore(id) ? guardianStages : BIOME_ARC;
    const r = renderMusicScene(id, stages, { sampleRate: rate });
    const ms = performance.now() - t0;
    results.push({ id, r });
    const st = (name: string) => r.stages.find((s) => s.name === name);
    const cols = isGuardianScore(id) ? ['phase 1', 'phase 2', id === 'heartBoss' ? 'phase 3' : '', ''] : ['explore', 'tension', 'combat', 'after'];
    console.log(`${id.padEnd(16)}${cols.map((c, i) => (c ? f(st(c)!.lufs) : '-').padStart(i < 3 ? 11 : 9)).join('')}${f(r.whole.truePeak, 3).padStart(8)}${String(r.whole.clipped).padStart(6)}${String(r.whole.nonFinite).padStart(5)}${String(r.maxVoices).padStart(8)}${f(r.whole.centroid, 0).padStart(7)}${f(ms, 0).padStart(8)}`);
    if (opt.wav) wav(`${opt.wav}/${id}.wav`, r.channels, rate);
  }
  const worst = results.reduce((a, b) => (b.r.whole.truePeak > a.r.whole.truePeak ? b : a));
  console.log(`\nloudest true peak: ${worst.id} ${f(worst.r.whole.truePeak, 3)}; any clipped samples: ${results.some((x) => x.r.whole.clipped > 0)}; any NaN: ${results.some((x) => x.r.whole.nonFinite > 0)}`);
}
