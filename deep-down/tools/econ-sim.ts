// The economy sim (SPEC §5.12, BUILD §2.1): prints the first-run table against its targets, the taps per
// cell, the reward gaps, E20 and the Pick's slot-1 check (CRITIQUE MUST 2), and the tutorial's step times
// at 5 and 3 taps/s (CRITIQUE MUST 9). `days N [seed]` runs the session sim (BUILD §3.1 MUST 8: the real model with
// every W2 system on, a 40-minute first session then 6 minutes every 2 h) and prints the E-metrics it measures.
// `nodes [seed]` runs the node-paced bot (hybrid SPEC §5.12, BUILD §3.1 MUST 8): the crawl from the first launch to the
// closed Root Knot, with the glide, ride and ceremony times of SPEC §3, against the table's bands for 0–120 m; `tutorial`
// prints the six steps and the lessons as the same bot meets them.
// Usage: node tools/run-ts.mjs tools/econ-sim.ts [first|human|hold|tutorial|nodes [seed]|all|days N [seed]]
import { FIRST_RUN_TARGETS, simFirstRun } from '../src/idle/sim/pacing';
import { daysReport, simDays } from '../src/idle/sim/days';
import { NODE_TARGETS, simNodes, type NodeBotResult } from '../src/idle/sim/nodeBot';
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
  for (const taps of [4, 3]) {
    const r = simNodes({ taps });
    console.log(`\n== the six steps and the lessons at ${taps} taps/s (node-paced bot): prompt start times`);
    for (const [id, t] of r.prompts) console.log(`  ${id.padEnd(16)} ${fmt(t).padStart(6)}  (${t.toFixed(1)} s)`);
    console.log(`  first breakthrough ${fmt(r.firstBreach)} · the Hatch broken ${fmt(r.hatch)}`);
  }
}

function nodesTable(r: NodeBotResult, label: string): void {
  console.log(`\n== node-paced bot · ${label} · ended by ${r.end} at ${fmt(r.t)} (${r.state.run.depth} m, node ${r.state.node.node})`);
  console.log('milestone                               | band          | bot     |');
  for (const [k, name, lo, hi] of NODE_TARGETS) {
    const v = r[k] as number;
    const ok = v >= lo && v <= hi ? 'in band' : v < lo ? 'EARLY' : 'LATE';
    console.log(`${name.padEnd(40)}| ${fmt(lo).padStart(5)}–${fmt(hi).padEnd(7)}| ${fmt(v).padStart(7)} | ${ok}`);
  }
  const share = r.chamberShare;
  console.log(`${'taps per block p50 (first 45 min)'.padEnd(40)}| ≤ 4          | ${String(r.tpb[1]).padStart(7)} | ${r.tpb[1] <= 4 ? 'in band' : 'OUT'}  (p10/p50/p90 ${r.tpb.join('/')}, mean ${r.tpbMean.toFixed(2)})`);
  console.log(`${'longest gap between completions (30 min)'.padEnd(40)}| ≤ 30 s       | ${(r.goalGap.toFixed(1) + ' s').padStart(7)} | ${r.goalGap <= 30 ? 'in band' : 'OUT'}  (any reward ${r.rewardGap.toFixed(1)} s)`);
  console.log(`${'chamber gold share of run gold'.padEnd(40)}| 25–35 %      | ${((share * 100).toFixed(1) + ' %').padStart(7)} | ${share >= 0.25 && share <= 0.35 ? 'in band' : 'OUT'}`);
  console.log(`depth marks: ${Object.entries(r.reach).map(([m, t]) => `${m} m ${fmt(t)}`).join(' · ')}`);
  console.log(`time by phase: ${Object.entries(r.phaseSecs).map(([p, t]) => `${p} ${t.toFixed(0)} s`).join(' · ')}`);
  console.log('chambers: node · depth · kind · arrived · opened by');
  for (const c of r.chambers) console.log(`  ${String(c.node).padStart(3)} ${String(c.depth).padStart(4)} m  ${(c.fixed || c.kind).padEnd(22)} ${fmt(c.at).padStart(6)}  ${c.by}`);
}

function nodes(seed: number): void {
  const t0 = Date.now();
  const r = simNodes({ seed });
  nodesTable(r, `seed ${seed}, 4 taps/s, walk 1.0 s per target (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
  // Sensitivity: the mean walk per chamber target is the bot's least certain input (a phone test measures it).
  for (const walk of [2, 3]) nodesTable(simNodes({ seed, walk }), `seed ${seed}, 4 taps/s, walk ${walk.toFixed(1)} s per target`);
}

function days(n: number, seed: number): void {
  console.log(`\n== session sim · ${n} days · seed ${seed} (a 40-minute first session, then 6 minutes every 2 h, 08:00–24:00)`);
  const r = simDays({ days: n, seed, log: (l) => console.log(`  ${l}`) });
  for (const line of daysReport(r)) console.log(line);
}

export default function main(args: string[]): void {
  const mode = args[0] ?? 'first';
  if (mode === 'nodes') {
    nodes(Number(args[1] ?? 7) || 7);
    return;
  }
  if (mode === 'days') {
    days(Math.max(1, Number(args[1] ?? 3) || 3), Number(args[2] ?? 2026) || 2026);
    return;
  }
  if (mode === 'first' || mode === 'all') {
    first('bot', 5);
    first('bot', 3);
  }
  if (mode === 'human' || mode === 'all') first('human', 3);
  if (mode === 'hold' || mode === 'all') first('hold', 5);
  if (mode === 'tutorial' || mode === 'all') tutorial();
  if (mode === 'all') nodes(7);
}
