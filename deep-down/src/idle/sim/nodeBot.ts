// The node-paced bot (hybrid SPEC §5.12; BUILD §3.1 MUST 8). The real model at 60 Hz with the node layer on, played the way
// a first-time player plays the crawl:
//   - at a face it taps 4/s on the weakest live block (and holds 2 s when the hold step asks), uses Dynamite when ready;
//   - in a chamber it harvests to about 80 %: every strike special and lamp, every chest, relic and note, half the skin,
//     half the secrets (a player does not find them all), and takes a second stand half the time;
//   - on a ride it taps the pass-by glints as they pass; at a seal it taps 4/s and hits the weak point when it glows;
//   - it buys BEST when affordable (the Pick and the Shovel Hand before BEST exists), one purchase per 0.5 s;
//   - it models the times of SPEC §3: the breakthrough (0.6 s of shards, then the 1.6 s glide), the glide in from a dark
//     mouth (1.6 s), each Way Down (`RIDE_SECONDS`), a chest's roll-up (1.2 s), the biome reveal (3 s), a seal's break (1.2 s),
//     the tool-form ceremony (1.2 s), the focus pop (0.3 s), reading a note (2.5 s), the relic ring (released at 0.8 s),
//     a survey glide (1.2 s), and a walk to each target in a chamber (`walk`, mean, s);
//   - the leash and the Works run as the game runs them (the crew keeps digging while the player explores).
// One session: from the first launch until `maxSecs` or the closed Root Knot (W1's end). It reports the milestones of
// §5.12's table for 0–120 m. Pure: no DOM, no timers; deterministic per seed.

import { createIdleBus, type IdleEvents } from '../bus';
import { RIDE_SECONDS } from '../config/chart';
import { nodeAt } from '../model/chart';
import { applyNodeAction, contentsOf, type NodeAction } from '../model/nodes';
import { best, buy, defaultMode, price } from '../model/run';
import { cooldownLeft } from '../model/skills';
import type { IdleState } from '../model/state';
import { createHybrid, STEP_DT, stepIdle } from '../model/step';
import { activePrompt } from '../model/tutorial';

export interface NodeBotOpts {
  seed: number;
  /** Taps per second at a face, a tappable, a seal. */
  taps: number;
  /** Mean walk to each chamber target (s): half are in reach (0 s), the rest 2–5 m away at ≤ 2.5 m/s, eased. */
  walk: number;
  /** Share of the secrets the player finds, and of second stands taken. */
  secrets: number;
  stands: number;
  /** Share of a chamber's skin cells struck. */
  skin: number;
  /** Seconds of play to simulate at most. */
  maxSecs: number;
  /** Optional trace of the objective line (goal changes and completions), for tuning. */
  trace?: (line: string) => void;
  /** Called after every model step (tests check invariants with it). */
  probe?: (s: IdleState) => void;
  /** Keep the clock running at the closed Root Knot until `maxSecs` (the player idles there: W1 ends at 119 m). */
  idleAtEnd?: boolean;
}

export const NODE_BOT_DEFAULT: NodeBotOpts = { seed: 7, taps: 4, walk: 1.0, secrets: 0.5, stands: 0.5, skin: 0.5, maxSecs: 2400 };

/** SPEC §3 times the bot waits through (s). */
export const BOT_TIMES = {
  breach: 0.6 + 1.6,
  enterDark: 1.6,
  chest: 1.2,
  reveal: 3,
  sealBreak: 1.2,
  toolForm: 1.2,
  focus: 0.3,
  note: 2.5,
  ringRelease: 0.8,
  survey: 1.2,
  hold: 2,
  buyEvery: 0.5,
} as const;

export interface NodeMilestone {
  id: string;
  /** Seconds of play. */
  t: number;
  depth: number;
}

export interface NodeBotResult {
  milestones: NodeMilestone[];
  /** Arrival in each chamber (node index → s) and its depth. */
  chambers: Array<{ node: number; depth: number; kind: string; fixed: string; at: number; by: string; left: number }>;
  firstBuy: number;
  firstHire: number;
  firstBreach: number;
  hatch: number;
  vista: number;
  rootKnot: number;
  /** First time the dig front reached each depth mark (m → s). */
  reach: Record<number, number>;
  /** Taps per block (face blocks the player broke with a direct tap) p10/p50/p90 in the first 45 min, and the mean. */
  tpb: [number, number, number];
  tpbMean: number;
  /** Longest gap between objective completions (goal:done) in the first 30 min (s), and between rewards of any kind. */
  goalGap: number;
  rewardGap: number;
  /** Gold by source (log10 of the sum), the chamber share of run gold. */
  goldBy: Record<string, number>;
  chamberShare: number;
  /** Tutorial steps and lessons: [id, start s]. */
  prompts: Array<[string, number]>;
  /** Seconds spent in each phase (dig, explore, ride, seal, camp). */
  phaseSecs: Record<string, number>;
  /** What ended the run: 'rootKnot' (W1's closed seal), 'time'. */
  end: string;
  t: number;
  state: IdleState;
}

/** Sources that count as chamber gold (SPEC §5.12 "chamber gold share of run gold"). */
export const CHAMBER_SOURCES: ReadonlySet<string> = new Set(['tappable', 'skin', 'pocket', 'ride', 'secret', 'relic']);

function rngOf(seed: number): () => number {
  let x = (seed ^ 0x9e3779b9) >>> 0 || 1;
  return () => {
    x ^= x << 13;
    x >>>= 0;
    x ^= x >>> 17;
    x ^= x << 5;
    x >>>= 0;
    return x / 4294967296;
  };
}

function quantiles(xs: number[]): [number, number, number] {
  if (xs.length === 0) return [0, 0, 0];
  const a = [...xs].sort((p, q) => p - q);
  const at = (q: number) => a[Math.min(a.length - 1, Math.floor(q * a.length))];
  return [at(0.1), at(0.5), at(0.9)];
}

function affordable(s: IdleState, id: string, mode: Parameters<typeof price>[2] = 'x1'): boolean {
  return price(s, id, mode).costLog10 <= s.run.gold.log10() + 1e-9;
}

/** The player's BEST habit (the humanBuy profile, with the bus so the tutorial and the stats see it). */
function buyBest(s: IdleState, bus: ReturnType<typeof createIdleBus>): string | null {
  // A tutorial prompt that names a card wins: the player buys what the rim points at, and saves for it.
  const prompt = activePrompt(s);
  const asked = prompt === 'tut:buyPick' ? 'pick' : prompt === 'tut:hire' ? 'crew:0' : '';
  if (asked) return affordable(s, asked) && buy(s, asked, 'x1', bus).ok ? asked : null;
  const b = best(s);
  if (!b) {
    for (const id of ['pick', 'crew:0']) if (affordable(s, id)) return buy(s, id, 'x1', bus).ok ? id : null;
    return null;
  }
  const mode = defaultMode(s);
  if (affordable(s, b, mode)) return buy(s, b, mode, bus).ok ? b : null;
  if (!affordable(s, b)) return null;
  return buy(s, b, 'x1', bus).ok ? b : null;
}

/** A step of the chamber plan: what to do, and the time it costs before the next (s). */
type Plan =
  | { do: 'strike'; id: string }
  | { do: 'skin'; id: string }
  | { do: 'relight'; id: string }
  | { do: 'focus'; id: string; kind: string }
  | { do: 'wait'; s: number }
  | { do: 'exit' };

/**
 * The chamber plan, in the objective line's order (goals.ts item 5): the focus objects (chests, relics, notes), the lamps,
 * the strike specials (half the secrets), a second stand half the time, half the skin, the exit. A walk before each target.
 */
function planChamber(s: IdleState, i: number, o: NodeBotOpts, rnd: () => number): Plan[] {
  const con = contentsOf(s, i);
  const c = s.node.chambers[i];
  const out: Plan[] = [];
  const walk = () => out.push({ do: 'wait', s: o.walk });
  for (const id of con.focus) {
    if (c?.resolved.includes(id)) continue;
    walk();
    out.push({ do: 'focus', id, kind: con.sockets[id]?.kind ?? 'chest' });
  }
  for (const id of con.lamps) {
    if (c?.lamps.includes(id)) continue;
    walk();
    out.push({ do: 'relight', id });
  }
  for (const id of con.strike) {
    const sc = con.sockets[id];
    if ((c?.left[id] ?? 1) <= 0) continue;
    if (sc.kind === 'secret' && rnd() >= o.secrets) continue;
    walk();
    out.push({ do: 'strike', id });
  }
  if (rnd() < o.stands) out.push({ do: 'wait', s: BOT_TIMES.survey });
  const skin = Math.round(con.skin.cells * o.skin);
  for (let k = 0; k < skin; k++) out.push({ do: 'skin', id: `skin:bot:${k}` });
  walk();
  out.push({ do: 'exit' });
  return out;
}

/** Run the node-paced bot for one session. */
export function simNodes(partial: Partial<NodeBotOpts> = {}): NodeBotResult {
  const o: NodeBotOpts = { ...NODE_BOT_DEFAULT, ...partial };
  const s = createHybrid(o.seed, 0);
  const bus = createIdleBus();
  const rnd = rngOf(o.seed);
  const milestones: NodeMilestone[] = [];
  const mark = (id: string) => milestones.push({ id, t: s.time, depth: s.run.depth });
  const chambers: NodeBotResult['chambers'] = [];
  const reach: Record<number, number> = {};
  const goldBy: Record<string, number> = {};
  const prompts: Array<[string, number]> = [];
  let firstBuy = Infinity;
  let firstHire = Infinity;
  let firstBreach = Infinity;
  let hatch = Infinity;
  let vista = Infinity;
  let rootKnot = Infinity;
  let end = 'time';
  // Waits: the bot acts again at `busyUntil` (glides, ceremonies, walks).
  let busyUntil = 0;
  const wait = (secs: number) => {
    busyUntil = Math.max(busyUntil, s.time) + secs;
  };
  // Completions and rewards (for the gap metrics).
  const goals: number[] = [0];
  const rewards: number[] = [0];
  // Taps per block.
  const hits = new Map<string, number>();
  const tpb: number[] = [];
  let faceTaps45 = 0;
  let faceBlocks45 = 0;

  bus.on('buy:done', (e) => {
    if (firstBuy === Infinity) firstBuy = s.time;
    if (e.id.startsWith('crew:') && firstHire === Infinity) firstHire = s.time;
    rewards.push(s.time);
  });
  bus.on('goal:done', (e) => {
    goals.push(s.time);
    o.trace?.(`${s.time.toFixed(1)} done ${e.id}`);
  });
  bus.on('goal:change', (e) => o.trace?.(`${s.time.toFixed(1)} show ${e.id} (${s.node.phase} node ${s.node.node})`));
  bus.on('path:done', () => rewards.push(s.time));
  bus.on('tutorial:step', (e) => prompts.push([e.id, s.time]));
  bus.on('node:breach', (e: IdleEvents['node:breach']) => {
    if (e.by === 'player') {
      if (firstBreach === Infinity) firstBreach = s.time;
      wait(BOT_TIMES.breach);
    }
    rewards.push(s.time);
  });
  bus.on('node:firstLight', () => rewards.push(s.time));
  bus.on('chest:open', () => {
    wait(BOT_TIMES.chest);
    rewards.push(s.time);
  });
  bus.on('chamber:harvest', () => rewards.push(s.time));
  bus.on('lamp:relight', () => rewards.push(s.time));
  bus.on('biome:reveal', () => wait(BOT_TIMES.reveal));
  bus.on('tool:form', () => wait(BOT_TIMES.toolForm));
  bus.on('seal:break', (e) => {
    wait(BOT_TIMES.sealBreak);
    if (e.biome === 1 && hatch === Infinity) {
      hatch = s.time;
      mark('hatch');
    }
    rewards.push(s.time);
  });
  bus.on('seal:closed', () => {
    if (rootKnot === Infinity) {
      rootKnot = s.time;
      mark('rootKnot');
    }
  });
  bus.on('gold:gain', (e) => {
    const l = e.amount.log10();
    if (!Number.isFinite(l)) return;
    const prev = goldBy[e.source] ?? -Infinity;
    goldBy[e.source] = prev === -Infinity ? l : Math.max(prev, l) + Math.log10(1 + Math.pow(10, -Math.abs(prev - l)));
  });
  bus.on('cell:hit', (e) => {
    if (e.source !== 'tap' && e.source !== 'hold') return;
    const k = `${e.depth}:${e.col}`;
    hits.set(k, (hits.get(k) ?? 0) + 1);
  });
  bus.on('cell:break', (e) => {
    const k = `${e.depth}:${e.col}`;
    const h = hits.get(k) ?? 0;
    hits.delete(k);
    if (s.time > 2700) return;
    if (e.source === 'tap' || e.source === 'hold') {
      tpb.push(h + 1);
      faceBlocks45++;
    } else if (e.source === 'splash') faceBlocks45++;
  });
  bus.on('node:arrive', (e) => {
    if (e.phase === 'explore') onChamber(e.node, e.dark ? 'crew' : 'player');
  });
  bus.on('node:firstLight', (e) => {
    if (!chambers.some((c) => c.node === e.node)) onChamber(e.node, 'player');
  });

  function onChamber(i: number, by: string): void {
    if (chambers.some((c) => c.node === i)) return;
    const t = nodeAt(s.seed, i);
    chambers.push({ node: i, depth: t.depth, kind: t.kind, fixed: t.fixed, at: s.time, by, left: 0 });
    if (t.kind === 'vista' && vista === Infinity) {
      vista = s.time;
      mark('vista');
    }
  }

  let plan: Plan[] = [];
  let planFor = -1;
  let nextTap = 0.4; // a human's first tap lands a beat after the screen appears
  let nextBuy = 0;
  let holdUntil = -1;
  let glintQueue: string[] = [];
  let nextGlint = 0;
  let rideDoneAt = -1;
  let ringPending = '';
  const phaseSecs: Record<string, number> = {};
  const actions: NodeAction[] = [];
  const interval = 1 / o.taps;

  for (; s.time < o.maxSecs && (end === 'time' || o.idleAtEnd); ) {
    actions.length = 0;
    const n = s.node;
    for (const m of [5, 10, 20, 40, 60, 80, 100, 119, 120]) if (reach[m] === undefined && s.run.depth >= m) reach[m] = s.time;
    if (s.time >= nextBuy) {
      nextBuy = s.time + BOT_TIMES.buyEvery;
      buyBest(s, bus);
    }
    if (n.phase === 'camp') actions.push({ type: 'descend' });
    else if (s.time >= busyUntil) {
      if (n.phase === 'dig') {
        if (activePrompt(s) === 'tut:hold' && holdUntil < 0) holdUntil = s.time + BOT_TIMES.hold;
        const holding = holdUntil >= 0 && s.time < holdUntil;
        if (holdUntil >= 0 && s.time >= holdUntil) holdUntil = -1;
        if (s.time >= nextTap) {
          nextTap = s.time + (holding ? 1 / 3 : interval);
          const row = s.shaft.rows[0];
          let col = 3;
          let lo = Infinity;
          for (let c = 0; c < 7; c++) if (row.left[c] > 0 && row.left[c] < lo) {
            lo = row.left[c];
            col = c;
          }
          actions.push({ type: 'strike', target: { kind: 'face', col }, via: holding ? 'hold' : 'tap' });
          if (s.time <= 2700) faceTaps45++;
        }
        if (s.run.skills.dynamite && cooldownLeft(s, 'dynamite') === 0) actions.push({ type: 'skill', id: 'dynamite' });
      } else if (n.phase === 'explore') {
        const c = n.chambers[n.node];
        if (ringPending) {
          // The ring closes over 0.9 s: let go near the gold.
          applyNodeAction(s, { type: 'resolve', id: ringPending, input: 'release' }, bus);
          applyNodeAction(s, { type: 'resolve', id: ringPending, input: 'close' }, bus);
          ringPending = '';
          wait(BOT_TIMES.focus);
        } else if (c && !c.lit) {
          actions.push({ type: 'enter' });
          wait(BOT_TIMES.enterDark);
        } else if (planFor !== n.node) {
          planFor = n.node;
          plan = planChamber(s, n.node, o, rnd);
        } else if (plan.length > 0 && s.time >= nextTap) {
          const p = plan[0];
          switch (p.do) {
            case 'wait':
              plan.shift();
              wait(p.s);
              break;
            case 'strike':
            case 'skin': {
              nextTap = s.time + interval;
              const target = p.do === 'strike' ? { kind: 'tappable' as const, id: p.id } : { kind: 'skin' as const, id: p.id };
              const ok = applyNodeAction(s, { type: 'strike', target, via: 'tap' }, bus);
              const left = p.do === 'strike' ? (c?.left[p.id] ?? 1) : (c?.skin[p.id] ?? 1);
              if (!ok || left <= 0) {
                plan.shift();
                // A broken secret reveals its cache, a cracked geode opens in the focus pop: do it next.
                const con = contentsOf(s, n.node);
                if (p.do === 'strike' && c?.secrets.includes(p.id)) {
                  const cache = con.caches[p.id];
                  if (cache) plan.unshift({ do: 'wait', s: o.walk / 2 }, { do: 'focus', id: cache, kind: 'cache' });
                } else if (p.do === 'strike' && con.sockets[p.id]?.kind === 'geode' && !c?.resolved.includes(p.id)) {
                  plan.unshift({ do: 'focus', id: p.id, kind: 'geode' });
                }
              }
              break;
            }
            case 'relight':
              plan.shift();
              actions.push({ type: 'relight', lampId: p.id });
              wait(0.5);
              break;
            case 'focus': {
              plan.shift();
              const isRing = p.kind === 'relic' || p.kind === 'geode';
              if (p.kind === 'geode' && (c?.left[p.id] ?? 1) > 0) break;
              applyNodeAction(s, { type: 'focus', id: p.id }, bus);
              if (isRing) {
                applyNodeAction(s, { type: 'resolve', id: p.id, input: 'hold' }, bus);
                ringPending = p.id;
                wait(BOT_TIMES.ringRelease);
              } else {
                applyNodeAction(s, { type: 'resolve', id: p.id, input: 'tap' }, bus);
                wait(BOT_TIMES.focus + (p.kind === 'note' || p.kind === 'mural' ? BOT_TIMES.note : 0));
                applyNodeAction(s, { type: 'resolve', id: p.id, input: 'close' }, bus);
              }
              break;
            }
            case 'exit': {
              plan.shift();
              const before = n.phase;
              const ok = applyNodeAction(s, { type: 'exit', exitId: 'bot' }, bus);
              if (!ok && before === 'explore') {
                const next = nodeAt(s.seed, n.node + 1);
                if (next.closed && rootKnot < Infinity) {
                  end = 'rootKnot';
                  if (o.idleAtEnd) plan.push({ do: 'wait', s: 60 }, { do: 'exit' });
                } else plan.push({ do: 'wait', s: 1 }, { do: 'exit' }); // the seal row is not reached yet: wait for the crew
              }
              break;
            }
          }
        }
      } else if (n.phase === 'ride' && n.ride) {
        if (rideDoneAt < 0) {
          const secs = n.ride.seconds || RIDE_SECONDS[n.ride.kind] || 2;
          rideDoneAt = s.time + secs;
          glintQueue = contentsOf(s, n.ride.from).ride.map((g) => g.id);
          nextGlint = s.time + secs / (glintQueue.length + 1);
        }
        if (glintQueue.length > 0 && s.time >= nextGlint) {
          const id = glintQueue.shift() as string;
          actions.push({ type: 'strike', target: { kind: 'glint', id }, via: 'tap' });
          nextGlint = s.time + (rideDoneAt - s.time) / (glintQueue.length + 1);
        }
        if (s.time >= rideDoneAt) {
          actions.push({ type: 'rideEnd' });
          rideDoneAt = -1;
        }
      } else if (n.phase === 'seal' && s.seal) {
        if (s.time >= nextTap) {
          nextTap = s.time + interval;
          const weak = s.seal.phase === 'fight' && s.seal.weakUntil > s.time;
          actions.push({ type: 'strike', target: { kind: 'seal', weak }, via: 'tap' });
        }
      }
    }
    if (n.phase !== 'ride') rideDoneAt = -1;
    phaseSecs[n.phase] = (phaseSecs[n.phase] ?? 0) + STEP_DT;
    stepIdle(s, STEP_DT, [], actions, bus);
    o.probe?.(s);
  }
  if (end === 'time' && rootKnot < Infinity) end = 'rootKnot';

  const gap = (xs: number[]) => {
    let m = 0;
    const a = [...xs].sort((p, q) => p - q).filter((t) => t <= 1800);
    for (let k = 1; k < a.length; k++) m = Math.max(m, a[k] - a[k - 1]);
    return m;
  };
  // The chamber share, in log space relative to the largest source (no overflow at any depth).
  const top = Math.max(-Infinity, ...Object.values(goldBy));
  let total = 0;
  let chamber = 0;
  for (const [src, l] of Object.entries(goldBy)) {
    const v = Math.pow(10, l - top);
    total += v;
    if (CHAMBER_SOURCES.has(src)) chamber += v;
  }
  return {
    milestones,
    chambers,
    firstBuy,
    firstHire,
    firstBreach,
    hatch,
    vista,
    rootKnot,
    reach,
    tpb: quantiles(tpb),
    tpbMean: faceBlocks45 > 0 ? faceTaps45 / faceBlocks45 : 0,
    goalGap: gap(goals),
    rewardGap: gap(rewards),
    goldBy,
    chamberShare: total > 0 ? chamber / total : 0,
    prompts,
    phaseSecs,
    end,
    t: s.time,
    state: s,
  };
}

/** SPEC §5.12's targets for 0–120 m: [id, label, lo s, hi s]. */
export const NODE_TARGETS: ReadonlyArray<[keyof NodeBotResult, string, number, number]> = [
  ['firstBuy', 'first purchase', 0, 15],
  ['firstHire', 'first hire', 0, 40],
  ['firstBreach', 'first breakthrough (Root Cellar, 5 m)', 35, 55],
  ['hatch', 'the Halden Hatch (40 m)', 330, 405],
  ['vista', 'the Glowroot Vista', 660, 840],
  ['rootKnot', 'the Root Knot hall (120 m)', 900, 1140],
];
