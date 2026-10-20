// The economy sim (SPEC §5.12, BUILD §2.1): prints the first-run table against its targets, the taps per
// cell, the reward gaps, E20 and the Pick's slot-1 check (CRITIQUE MUST 2), and the tutorial's step times
// at 5 and 3 taps/s (CRITIQUE MUST 9).
// Usage: node tools/run-ts.mjs tools/econ-sim.ts [first|human|hold|tutorial|all]
import { FIRST_RUN_TARGETS, simFirstRun } from '../src/idle/sim/pacing';
import { simTutorial } from '../src/idle/sim/tutorialSim';
import { formatTime } from '../src/idle/num/notation';

const fmt = (s: number) => (Number.isFinite(s) ? formatTime(s) : '—');

function first(profile: 'bot' | 'human' | 'hold', taps: number): void {
  const t0 = Date.now();
  const r = simFirstRun({ profile, taps, secs: profile === 'bot' ? 9000 : 7200 });
  console.log(`\n== first run · ${profile} · ${taps} taps/s (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
  console.log(`first purchase ${fmt(r.firstBuy)} · first crew ${fmt(r.firstCrew)} · longest reward gap (30 min) ${r.maxGap.toFixed(1)} s · purchases ${r.purchases}`);
  console.log(`taps per cell p10/p50/p90 ${r.tpc.map((x) => x.toFixed(1)).join(' / ')} · row s p10/p50/p90 (40 min) ${r.rowSec.map((x) => x.toFixed(1)).join(' / ')}`);
  console.log(`slot 1 (Pick) ≥ +1 %: ${(r.slot1Ok * 100).toFixed(1)} % of samples · E20 active/idle ${Object.entries(r.e20).map(([m, v]) => `${m} min ${v.toFixed(2)}`).join(', ')}`);
  console.log('depth  | target (sim) | band            | this sim | Δ vs sim');
  for (const [m, sim, lo, hi] of FIRST_RUN_TARGETS) {
    const got = r.reach[m];
    const d = Number.isFinite(got) ? `${(((got - sim) / sim) * 100).toFixed(1)} %` : '—';
    const inBand = got >= lo && got <= hi ? 'in band' : 'OUT';
    console.log(`${String(m).padStart(5)} m | ${fmt(sim).padStart(12)} | ${fmt(lo).padStart(6)}–${fmt(hi).padEnd(8)} | ${fmt(got).padStart(8)} | ${d.padStart(7)} ${inBand}`);
  }
  console.log('snapshots: t · depth · pick · edge · lines · gear · row s');
  for (const s of r.snapshots) console.log(`  ${fmt(s.t).padStart(7)} ${String(s.depth).padStart(5)} m  pick ${String(s.pick).padStart(3)}  edge ${(s.edge * 100).toFixed(0).padStart(2)} %  lines ${s.lines.join(',')}  gear ${s.gear}  row ${s.rowSec.toFixed(1)} s`);
}

function tutorial(): void {
  for (const taps of [5, 3]) {
    const r = simTutorial(taps);
    console.log(`\n== tutorial at ${taps} taps/s: step start times`);
    for (const [id, t] of r.steps) console.log(`  ${id.padEnd(12)} ${fmt(t).padStart(6)}  (${t.toFixed(1)} s)`);
    console.log(`  done at ${fmt(r.doneAt)} · Seal 1 broken at ${fmt(r.sealAt)} · first gear at ${fmt(r.gearAt)}`);
  }
}

export default function main(args: string[]): void {
  const mode = args[0] ?? 'first';
  if (mode === 'first' || mode === 'all') {
    first('bot', 5);
    first('bot', 3);
  }
  if (mode === 'human' || mode === 'all') first('human', 3);
  if (mode === 'hold' || mode === 'all') first('hold', 5);
  if (mode === 'tutorial' || mode === 'all') tutorial();
}
