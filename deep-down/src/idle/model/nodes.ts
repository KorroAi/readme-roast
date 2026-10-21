// The node crawl (hybrid SPEC §2.1, §4.1–§4.7, §5.1–§5.3, §12.3 items 1–2; BUILD §2, §3.1 MUST 3; W1-LEAD §3).
//
// The player alternates phases, all in first person and all one-thumb (W1-LEAD §3):
//   camp → dig (a drift face of K slices) → explore (a real cavern, walked by tap) → ride (the Way Down) → dig …
//   and at a biome boundary: explore (the Seal hall) → seal (the mechanism) → explore (the next biome's Threshold).
//
// Two positions (SPEC §12.3 item 2): the **dig front** is the model's existing depth (`run.depth`, the floor row the crew
// and the player strike); the **player's node** is where the player is. The crew digs ahead of the player up to the
// **leash**: it may break into at most L unseen chambers ahead (L = 0 in Topsoil, 3 from Glowroot, +1 per Survey Lamps
// [W2], max 8), never an unopened seal, never an unseen first sight (a Threshold or a Vista). Past the leash its damage
// becomes **Works haul** (gold at the face's average gold per damage, first from the leftover chamber tappables).
//
// A chamber holds the model entities of its contents (chart.ts `contents`): strike tappables (veins, rich veins, gem
// clusters, stash bricks, geodes, secrets) with an HP budget of CHAMBER_EQ cell-equivalents and an honest gold per damage
// (L6); wall-skin cells (one cell of host rock, 0.6× gold, 12 % pockets); cold lamps (relight them all: charted); focus
// objects (chests through chests.ts with the honest roll-up, relics through the ring's grades, notes to the Codex). When
// the player leaves, the leftovers join the Works, skipped chests and relics go to the Chest Rack: nothing is lost (L11).
//
// Every touch becomes one `NodeAction` (D's NodeController resolves the hit-test order); actions enter through
// `stepIdle(state, dt, taps, actions, bus)`. Pure: no Three.js, no DOM; the world's template comes in through
// `setTemplateSource` (B's `templateFor`) and defaults to `defaultTemplate()` for the sims.

import { Big } from '../../core/big';
import type { HitSource, IdleBus, NodePhaseName } from '../bus';
import { biomeAt } from '../config/biomes';
import { SOIL_ROWS } from '../config/cells';
import { CHARTED, GOLD_X, LEASH, NODE_XP, RACK_MAX_ITEMS, RELIC_GRADES, RELIC_RING, RIDE_SECONDS, SKIN, SKIN_HP_EQ, WORKS_DELIVERY_S } from '../config/chart';
import { goldPerHp, KAPPA } from '../config/curves';
import { CHEST_TIERS, openChest } from './chests';
import {
  contents,
  defaultTemplate,
  FOCUS_CONTENT,
  isHiddenCache,
  nodeAt,
  nodeOfDepth,
  sealClosed,
  STRIKE_CONTENT,
  type ContentKind,
  type NodeContents,
  type NodeTopo,
  type RideTarget,
  type TemplateLike,
} from './chart';
import { addLore, awardFind, currentPage, rollFind } from './codex';
import { addXp, creditGems, creditGold } from './gain';
import { cellHpLog10, crackStage, goldMultLog10, resetWindow, sealPending } from './shaft';
import { useSkill } from './skills';
import { CELL, type ChamberRun, type IdleState, type NodePhase } from './state';
import { finishTap, prepareTap, resolveTap, type TapKind } from './tap';
import { tapWeak, weakId } from './seals';
import { tapEntity } from './entities';

const L10 = Math.log10;

export type { NodePhase } from './state';
export type { NodeTopo, NodeContents, RideTarget, TemplateLike } from './chart';

// ----- actions ----------------------------------------------------------------------------------------------------

/** What a strike lands on (NodeController's StrikeTarget, plus the seal and a ride glint). */
export type StrikeRef =
  /** A face block: the model column (snake map, SPEC §3.5). */
  | { kind: 'face'; col: number }
  /** A strike-type chamber tappable (vein, rich vein, gem cluster, stash brick, geode shell, secret) by socket id. */
  | { kind: 'tappable'; id: string }
  /** A wall-skin cell (any stable id from the scene's pick, e.g. `skin:x,y,z`). */
  | { kind: 'skin'; id: string }
  /** A pass-by glint during the ride (`ride:<node>:<j>`). */
  | { kind: 'glint'; id: string }
  /** The seal: its lit weak point (×5), or its body. */
  | { kind: 'seal'; weak: boolean };

/**
 * Every touch resolves to one of these (BUILD §2; W1-LEAD §3). Walking and looking are the shell's; the model only
 * keeps the pose for the save. `via` says how the strike was made (a tap, a hold stream, a sweep, a desktop key).
 */
export type NodeAction =
  | { type: 'strike'; target: StrikeRef; via?: 'tap' | 'hold' | 'sweep' | 'key' }
  | { type: 'relight'; lampId: string }
  /** Open the focus pop on a focus-type object (chest, relic, note, mural, geode once cracked, a secret's cache, a chest popped from the face). */
  | { type: 'focus'; id: string }
  /** Inside the focus pop: tap (open a chest, read a note), hold and release (the relic ring), close. */
  | { type: 'resolve'; id: string; input: 'tap' | 'hold' | 'release' | 'close' }
  /** Take an exit (the Way Down; a Seal hall's exit is the seal). */
  | { type: 'exit'; exitId: string }
  /** Glide in from the breach or a dark mouth: first light (any other chamber action also enters). */
  | { type: 'enter' }
  /** The Way Down's camera finished (or was skipped). */
  | { type: 'rideEnd'; skipped?: boolean }
  /** Reached a stand (the arrival pose or an objective auto-walk target). */
  | { type: 'stand'; stand: number }
  /** Walked somewhere in the chamber (W1-LEAD §3 tap-to-walk): the pose the save keeps. */
  | { type: 'walk'; x: number; y: number; z: number; yaw: number; pitch: number }
  /** Lantern Raise toward a far point. */
  | { type: 'raise'; x: number; y: number; z: number }
  /** Deep rock in reach: the tunk (`hint` the tappable to rim). */
  | { type: 'tunk'; hint: string }
  /** A rack tool (Dynamite). */
  | { type: 'skill'; id: string }
  /** The camp: go down the adit (resume the descent). */
  | { type: 'descend' }
  /** [W2] the Lantern Pulse; [W2] choose a road. Accepted and ignored in W1. */
  | { type: 'pulse' }
  | { type: 'road'; id: string };

// ----- the template source (B) ---------------------------------------------------------------------------------------

type TemplateSource = (lifeSeed: number, topo: NodeTopo) => TemplateLike | null | undefined;

let templateSource: TemplateSource | null = null;

/** The shell registers B's `templateFor(lifeSeed, topo)` once; the model falls back to `defaultTemplate`. */
export function setTemplateSource(fn: TemplateSource | null): void {
  templateSource = fn;
  contentsCache.clear();
}

/** The template of node i (B's, or the default). */
export function templateOf(s: IdleState, topo: NodeTopo): TemplateLike {
  return (templateSource && templateSource(s.seed, topo)) || defaultTemplate(topo);
}

const contentsCache = new Map<string, NodeContents>();

/** Node i's contents this run (memoised; pure in the seeds and the template). */
export function contentsOf(s: IdleState, i: number): NodeContents {
  const topo = nodeAt(s.seed, i);
  const tpl = templateOf(s, topo);
  const key = `${s.runSeed}:${s.seed}:${i}:${tpl.id}`;
  let c = contentsCache.get(key);
  if (!c) {
    c = contents(s.runSeed, s.seed, topo, tpl);
    contentsCache.set(key, c);
    if (contentsCache.size > 96) contentsCache.delete(contentsCache.keys().next().value as string);
  }
  return c;
}

// ----- turning the layer on -------------------------------------------------------------------------------------------

/** Turn the node layer on at the dig front's node (the hybrid game's new game; the node bot). */
export function enableNodes(s: IdleState): void {
  const n = s.node;
  n.on = true;
  const t = nodeOfDepth(s.seed, s.run.depth);
  n.node = t.i;
  n.phase = 'dig';
  n.resume = 'dig';
}

// ----- positions, the leash ----------------------------------------------------------------------------------------

/** The node whose drift holds the dig front (the crew's face). */
export function frontNode(s: IdleState): number {
  return nodeOfDepth(s.seed, s.run.depth).i;
}

export function isSeen(s: IdleState, i: number): boolean {
  return s.meta.seen.includes(i);
}

export function isCharted(s: IdleState, i: number): boolean {
  return s.meta.charted.includes(i);
}

/** The leash L for the chamber the crew would open next (0 in Topsoil, 3 from Glowroot; Survey Lamps [W2]). */
export function leashL(s: IdleState): number {
  const t = nodeOfDepth(s.seed, s.run.depth);
  if (t.biome === 0) return LEASH.topsoil;
  const survey = s.run.ups.survey ?? 0;
  return Math.min(LEASH.max, LEASH.base + survey);
}

/** Unseen chambers the crew opened ahead of the player (they wait dark). */
export function leashOpen(s: IdleState): number {
  const front = frontNode(s);
  let n = 0;
  for (let i = s.node.node + 1; i < front; i++) if (!isSeen(s, i)) n++;
  return n;
}

/** Chambers the crew opened ahead of the player, seen or not ("2 dug" on the exit plate). */
export function darkAhead(s: IdleState): number {
  return Math.max(0, frontNode(s) - s.node.node - 1);
}

/**
 * The first row the crew may not touch (Infinity: none within 64 nodes): an unopened seal row, or the breach of the first
 * unseen chamber past the leash, or of an unseen first sight. The crew digs up to it and stops one slice short.
 */
export function crewStopDepth(s: IdleState): number {
  if (!s.node.on) return Infinity;
  const front = frontNode(s);
  let allowed = leashL(s) - leashOpen(s);
  for (let i = front; i < front + 64; i++) {
    const t = nodeAt(s.seed, i);
    if (t.seal && sealPending(s, t.depthTop)) return t.depthTop;
    if (!isSeen(s, i)) {
      if (t.firstSight || allowed <= 0) return Math.max(t.breach, s.run.depth);
      allowed--;
    }
  }
  return Infinity;
}

/** The first row the player's strikes may not touch: past the breach of the drift being dug (Infinity when off). */
export function playerStopDepth(s: IdleState): number {
  if (!s.node.on) return Infinity;
  const t = nodeOfDepth(s.seed, s.run.depth);
  return t.breach + 1;
}

/** Rows a hit from `source` may not touch (shaft.applyHit and analyticRows read it). */
export function stopDepthFor(s: IdleState, source: HitSource): number {
  if (!s.node.on) return Infinity;
  if (source === 'crew' || source === 'analytic') return crewStopDepth(s);
  if (source === 'crumble') return Infinity;
  return playerStopDepth(s);
}

// ----- the Works --------------------------------------------------------------------------------------------------

/** log10 of the haul's gold per damage once the leftovers are mined (the face's average: G / κ). */
function haulGoldPerDmgLog10(s: IdleState): number {
  return L10((goldPerHp() * GOLD_X.works) / KAPPA) + goldMultLog10(s);
}

/**
 * Crew damage the leash turned into Works haul (SPEC §5.3): first the leftover chamber value behind the player (at its
 * own gold per damage), then the face's average. Credited on the next cart delivery (every ≈ 6 s).
 */
export function crewHaul(s: IdleState, dmgLog10: number): void {
  if (dmgLog10 === -Infinity) return;
  const n = s.node;
  let dmg = Big.fromLog10(dmgLog10);
  if (!n.worksHp.isZero()) {
    if (dmg.gte(n.worksHp)) {
      n.haulPending.addIn(n.worksGold);
      dmg = dmg.sub(n.worksHp);
      n.worksHp = Big.zero();
      n.worksGold = Big.zero();
      n.haulFromLeftovers = true;
    } else {
      const f = Math.pow(10, dmg.log10() - n.worksHp.log10());
      const g = Big.fromLog10(n.worksGold.log10() + L10(f));
      n.haulPending.addIn(g);
      n.worksGold = n.worksGold.sub(g).floorZeroIn();
      n.worksHp = n.worksHp.sub(dmg).floorZeroIn();
      n.haulFromLeftovers = true;
      return;
    }
  }
  if (dmg.isZero()) return;
  n.haulPending.addIn(Big.fromLog10(dmg.log10() + haulGoldPerDmgLog10(s)));
}

/**
 * log10 of the gold `workLog10` of crew damage hauls (the offline closed form): the leftover pool first at its own rate,
 * then the face's average. `apply` takes the mined part out of the pool.
 */
export function haulGoldLog10(s: IdleState, workLog10: number, apply: boolean): number {
  if (workLog10 === -Infinity) return -Infinity;
  const n = s.node;
  const work = Big.fromLog10(workLog10);
  if (n.worksHp.isZero()) return workLog10 + haulGoldPerDmgLog10(s);
  if (work.gte(n.worksHp)) {
    const rest = work.sub(n.worksHp);
    const g = n.worksGold.clone();
    if (!rest.isZero()) g.addIn(Big.fromLog10(rest.log10() + haulGoldPerDmgLog10(s)));
    if (apply) {
      n.worksHp = Big.zero();
      n.worksGold = Big.zero();
    }
    return g.log10();
  }
  const f = Math.pow(10, workLog10 - n.worksHp.log10());
  const gl = n.worksGold.log10() + L10(f);
  if (apply) {
    n.worksGold = n.worksGold.sub(Big.fromLog10(gl)).floorZeroIn();
    n.worksHp = n.worksHp.sub(work).floorZeroIn();
  }
  return gl;
}

function deliverHaul(s: IdleState, bus?: IdleBus): void {
  const n = s.node;
  if (s.time < n.nextHaul) return;
  n.nextHaul = s.time + WORKS_DELIVERY_S;
  if (n.haulPending.isZero()) return;
  const g = n.haulPending;
  n.haulPending = Big.zero();
  creditGold(s, g, 'works', bus);
  bus?.emit('works:haul', { gold: g.clone(), cart: (s.run.lines[2] ?? 0) > 0, fromLeftovers: n.haulFromLeftovers });
  n.haulFromLeftovers = false;
}

/** The leash edge (emits `leash:full` once each time the crew reaches it). */
export function noteLeash(s: IdleState, full: boolean, bus?: IdleBus): void {
  if (full && !s.node.leashFull) bus?.emit('leash:full', { open: leashOpen(s), L: leashL(s), depth: s.run.depth });
  s.node.leashFull = full;
}

// ----- chambers ----------------------------------------------------------------------------------------------------

function newChamber(node: number, by: ChamberRun['by']): ChamberRun {
  return { node, by, lit: false, left: {}, resolved: [], lamps: [], skin: {}, secrets: [], glints: [] };
}

/** The chamber run state of node i (null while its breach holds). */
export function chamberRun(s: IdleState, i: number): ChamberRun | null {
  return s.node.chambers[i] ?? null;
}

/** log10 of the host rock's HP at a chamber (one cell-equivalent). */
export function chamberCellHpLog10(topo: NodeTopo): number {
  return cellHpLog10(topo.depth < SOIL_ROWS ? CELL.SOIL : CELL.ROCK, topo.depth);
}

/** log10 of the full HP and gold of a strike tappable (cell-equivalents × host HP; gold = HP × G × goldX × mults). */
export function tappableValueLog10(s: IdleState, topo: NodeTopo, hpEq: number, goldX: number): { hp: number; gold: number } {
  const hp = chamberCellHpLog10(topo) + L10(Math.max(1e-12, hpEq));
  return { hp, gold: goldX > 0 ? hp + L10(goldPerHp() * goldX) + goldMultLog10(s) : -Infinity };
}

function phaseTo(s: IdleState, to: NodePhase, bus?: IdleBus): void {
  const from = s.node.phase;
  if (from === to) return;
  s.node.phase = to;
  bus?.emit('phase:change', { from: from as NodePhaseName, to: to as NodePhaseName, node: s.node.node });
}

/** First light of the player's chamber (L10: always the player's). */
function firstLight(s: IdleState, i: number, bus?: IdleBus): void {
  const c = s.node.chambers[i];
  if (!c || c.lit) return;
  c.lit = true;
  const first = !isSeen(s, i);
  if (first) {
    s.meta.seen.push(i);
    addXp(s, NODE_XP.firstLight);
  }
  if (c.by === 'crew' && !s.meta.firstTime.includes('lit:crew')) s.meta.firstTime.push('lit:crew');
  // The Lamp Room's burning lamp and any lamp already lit count from the start; a chamber with no cold lamp is charted.
  bus?.emit('node:firstLight', { node: i, first, biome: nodeAt(s.seed, i).biome });
  checkCharted(s, i, bus);
}

/**
 * The dig front moved from row `from` to `to` (shaft.settleFloor, analyticRows, a seal's break, offline): open every
 * chamber whose breach was crossed, move the player's drift on, and send the player in when their own strike broke it.
 */
export function onFrontMoved(s: IdleState, from: number, to: number, source: HitSource, bus?: IdleBus): void {
  const n = s.node;
  if (!n.on || to <= from) return;
  const player = source !== 'crew' && source !== 'analytic' && source !== 'crumble';
  let t = nodeOfDepth(s.seed, from);
  for (let guard = 0; guard < 4096 && t.breach < to; guard++) {
    const i = t.i;
    if (!n.chambers[i]) {
      // Who broke it: the player's strike on their own face (or their seal), else the crew.
      const own = (player || source === 'crumble') && n.node === i && n.phase === 'dig';
      const seal = t.seal && n.phase === 'seal' && n.node === i - 1;
      const by = own || seal ? 'player' : 'crew';
      n.chambers[i] = newChamber(i, by);
      const c = contentsOf(s, i);
      bus?.emit('node:breach', { node: i, by, promise: c.promise, depth: t.depth });
      if (by === 'player') s.meta.nodeStats.breaches++;
      if (seal) {
        // The seal broke: the player steps onto the Threshold (the reveal is the first sight).
        n.node = i;
        n.stand = 0;
        n.pose = null;
        phaseTo(s, 'explore', bus);
        firstLight(s, i, bus);
      } else if (n.node === i && n.phase === 'dig') {
        n.stand = 0;
        n.pose = null;
        phaseTo(s, 'explore', bus);
        if (by === 'player') firstLight(s, i, bus);
      }
    }
    t = nodeAt(s.seed, i + 1);
  }
  // The player's drift: slices fell in front of them.
  if (n.phase === 'dig') {
    const cur = nodeOfDepth(s.seed, s.run.depth);
    if (cur.i === n.node) {
      const slice = s.run.depth - cur.depthTop;
      const fromSlice = Math.max(0, from - cur.depthTop);
      if (slice > fromSlice) {
        bus?.emit('drift:slice', { node: n.node, slice, K: cur.K, depth: s.run.depth });
        bus?.emit('drift:creep', { node: n.node, slices: slice - fromSlice });
      }
    }
  }
  // Chambers far behind the player are dropped (their leftovers joined the Works when the player left).
  for (const k of Object.keys(n.chambers)) if (Number(k) < n.node - 1) delete n.chambers[Number(k)];
}

/** Every cold lamp of chamber i lit: charted (lifetime), +20 XP and +1 gem the first time ever. */
function checkCharted(s: IdleState, i: number, bus?: IdleBus): void {
  const c = s.node.chambers[i];
  if (!c || !c.lit) return;
  const con = contentsOf(s, i);
  if (con.lamps.some((id) => !c.lamps.includes(id))) return;
  if (con.lamps.length === 0 && con.litLamps.length === 0) return;
  const first = !isCharted(s, i);
  if (!first) return;
  s.meta.charted.push(i);
  s.meta.nodeStats.charted++;
  addXp(s, CHARTED.xp);
  creditGems(s, CHARTED.gems, 'record', bus);
  bus?.emit('chamber:charted', { node: i, first, gems: CHARTED.gems });
}

/** The player leaves chamber i: leftovers to the Works (chipped parts are credited), skipped chests and relics to the rack. */
function leaveChamber(s: IdleState, i: number, bus?: IdleBus): void {
  const c = s.node.chambers[i];
  if (!c) return;
  const topo = nodeAt(s.seed, i);
  const con = contentsOf(s, i);
  const worksGold = Big.zero();
  let racked = 0;
  for (const id of con.strike) {
    const sc = con.sockets[id];
    const left = c.left[id] ?? 1;
    if (left <= 0) continue;
    if (sc.kind === 'secret' && !c.secrets.includes(id)) {
      // An unfound secret stays a secret (re-rolled next run); its cache is not lost: nothing was found yet.
      continue;
    }
    const v = tappableValueLog10(s, topo, sc.hpEq, sc.goldX);
    // The chipped part pays now; the rest joins the Works (HP and gold at its own rate).
    if (left < 1) creditGold(s, Big.fromLog10(v.gold + L10(1 - left)), 'tappable', bus);
    const hp = Big.fromLog10(v.hp + L10(left));
    const g = Big.fromLog10(v.gold + L10(left));
    s.node.worksHp.addIn(hp);
    s.node.worksGold.addIn(g);
    worksGold.addIn(g);
    c.left[id] = 0;
  }
  // Focus objects not resolved: chests and relics to the rack; notes are credited to the Codex unread.
  const focusIds = [...con.focus, ...c.secrets.map((x) => con.caches[x]).filter(Boolean)];
  for (const id of focusIds) {
    if (c.resolved.includes(id)) continue;
    const f = focusContent(s, i, id);
    if (!f) continue;
    if (f.kind === 'chest') {
      rackAdd(s, 'chest', id, f.floor, '', bus);
      racked++;
    } else if (f.kind === 'relic') {
      rackAdd(s, 'relic', id, 0, f.relic, bus);
      racked++;
    } else if (f.kind === 'note' && f.lore) addLore(s, f.lore, bus);
    else if (f.kind === 'geode') {
      if ((c.left[id] ?? 1) <= 0) {
        rackAdd(s, 'chest', id, 1, '', bus);
        racked++;
      }
    } else if (f.kind === 'gems') creditGems(s, f.gems, 'secret', bus);
    c.resolved.push(id);
  }
  if (s.node.focus) s.node.focus = null;
  bus?.emit('node:leave', { node: i, works: worksGold, racked });
}

function rackCount(s: IdleState): number {
  return s.run.rack.length + s.node.rackRelics.length;
}

function rackAdd(s: IdleState, kind: 'chest' | 'relic', id: string, floor: number, relic: string, bus?: IdleBus): void {
  if (rackCount(s) < RACK_MAX_ITEMS) {
    if (kind === 'chest') s.run.rack.push(floor);
    else s.node.rackRelics.push(relic);
    bus?.emit('rack:add', { kind, id, count: rackCount(s) });
    bus?.emit('chest:rack', { count: rackCount(s) });
    return;
  }
  // A full rack: a chest pays its value in gold; a relic is still the Find (graded Worn).
  if (kind === 'chest') openChest(s, `rack:${s.nextId++}`, floor, 'rack', bus);
  else gradeRelic(s, -1, id, relic, 0, -1, bus);
}

/** Open the next item on the rack (one tap each on return): relics first are graded Sound (no ring), then chests. */
export function openRackItem(s: IdleState, bus?: IdleBus): boolean {
  const r = s.node.rackRelics.shift();
  if (r !== undefined) {
    gradeRelic(s, -1, `rack:${s.nextId++}`, r, 1, -1, bus);
    bus?.emit('chest:rack', { count: rackCount(s) });
    return true;
  }
  const floor = s.run.rack.shift();
  if (floor === undefined) return false;
  openChest(s, `rack:${s.nextId++}`, floor, 'rack', bus);
  bus?.emit('chest:rack', { count: rackCount(s) });
  return true;
}

// ----- focus objects -------------------------------------------------------------------------------------------------

/** What a focus id holds in chamber i: a socket's content, or a secret's revealed cache. */
interface FocusContent {
  kind: ContentKind | 'gems';
  floor: number;
  scripted: boolean;
  lore: string;
  relic: string;
  gems: number;
}

function focusContent(s: IdleState, i: number, id: string): FocusContent | null {
  const con = contentsOf(s, i);
  if (id.endsWith(':cache') && !con.sockets[id]) {
    const sid = id.slice(0, -':cache'.length);
    const sc = con.sockets[sid];
    if (!sc || sc.kind !== 'secret') return null;
    const [what, arg] = sc.reveals.split(':');
    if (what === 'chest') return { kind: 'chest', floor: Number(arg) || 0, scripted: false, lore: '', relic: '', gems: 0 };
    if (what === 'note') return { kind: 'note', floor: 0, scripted: false, lore: sc.reveals.slice(5), relic: '', gems: 0 };
    return { kind: 'gems', floor: 0, scripted: false, lore: '', relic: '', gems: Number(arg) || 3 };
  }
  const sc = con.sockets[id];
  if (!sc) return null;
  if (!FOCUS_CONTENT.has(sc.kind) && sc.kind !== 'geode') return null;
  return { kind: sc.kind, floor: sc.floor, scripted: sc.scripted, lore: sc.lore, relic: sc.relic, gems: sc.gems };
}

/** The relic ring's grade for a release `held` seconds after the hold began (SPEC §5.7). 0 worn … 4 perfect. */
export function ringGrade(held: number): { grade: number; u: number } {
  const u = held / RELIC_RING.close;
  if (held < 0 || held > RELIC_RING.worn) return { grade: 0, u };
  if (u >= RELIC_RING.perfect && held <= RELIC_RING.close + RELIC_RING.grace) return { grade: 4, u };
  if (u > 1) return { grade: 1, u };
  if (u >= RELIC_RING.pristine) return { grade: 3, u };
  if (u >= RELIC_RING.fine) return { grade: 2, u };
  return { grade: 1, u };
}

/** Grade a relic (or a geode's find): the Find, gems by grade, the best grade kept (+1 % per step, via the Find's level). */
function gradeRelic(s: IdleState, node: number, id: string, relic: string, grade: number, u: number, bus?: IdleBus): void {
  const g = Math.max(0, Math.min(4, grade));
  if (relic) awardFind(s, relic, bus);
  const prev = relic ? s.meta.relicGrades[relic] ?? -1 : -1;
  const better = relic !== '' && g > prev;
  if (better) s.meta.relicGrades[relic] = g;
  const gems = RELIC_RING.gems[g];
  creditGems(s, gems, 'relic', bus);
  if (g === 4) s.meta.stats.perfects++;
  bus?.emit('relic:grade', { node, id, relic, grade: RELIC_GRADES[g], u, gems, better });
}

// ----- the actions ----------------------------------------------------------------------------------------------------

/** Apply one action. @returns false when it did nothing in this state (the shell logs it; L2 is NodeController's). */
export function applyNodeAction(s: IdleState, a: NodeAction, bus?: IdleBus): boolean {
  const n = s.node;
  if (!n.on) return false;
  switch (a.type) {
    case 'strike':
      return strike(s, a.target, viaKind(a.via), bus);
    case 'relight':
      return relight(s, a.lampId, bus);
    case 'focus':
      return focusOpen(s, a.id, bus);
    case 'resolve':
      return resolveFocus(s, a.id, a.input, bus);
    case 'exit':
      return takeExit(s, a.exitId, bus);
    case 'enter':
      return enter(s, bus);
    case 'rideEnd':
      return endRide(s, !!a.skipped, bus);
    case 'stand':
      if (n.phase !== 'explore') return false;
      enter(s, bus);
      n.stand = Math.max(0, Math.floor(a.stand));
      bus?.emit('stand:move', { node: n.node, stand: n.stand });
      return true;
    case 'walk':
      if (n.phase !== 'explore') return false;
      enter(s, bus);
      n.pose = { x: a.x, y: a.y, z: a.z, yaw: a.yaw, pitch: a.pitch };
      return true;
    case 'raise':
      bus?.emit('lantern:raise', { node: n.node, x: a.x, y: a.y, z: a.z });
      return true;
    case 'tunk':
      bus?.emit('rock:tunk', { node: n.node, hint: a.hint });
      return true;
    case 'skill':
      if (n.phase !== 'dig') return false;
      return useSkill(s, a.id, bus);
    case 'descend':
      if (n.phase !== 'camp') return false;
      phaseTo(s, n.resume === 'camp' ? 'dig' : n.resume, bus);
      bus?.emit('camp:descend', { node: n.node });
      return true;
    case 'pulse':
    case 'road':
      return false;
  }
  return false;
}

function viaKind(v: 'tap' | 'hold' | 'sweep' | 'key' | undefined): TapKind {
  return v === 'hold' || v === 'sweep' ? 'hold' : v === 'key' ? 'key' : 'tap';
}

/** The camp (the menu at dusk): the descent waits; `descend` resumes it. */
export function enterCamp(s: IdleState, bus?: IdleBus): void {
  const n = s.node;
  if (n.phase === 'camp') return;
  n.resume = n.phase === 'ride' || n.phase === 'seal' ? 'explore' : n.phase;
  if (n.phase === 'ride') endRide(s, true, bus);
  phaseTo(s, 'camp', bus);
  bus?.emit('camp:enter', { node: n.node });
}

function strike(s: IdleState, t: StrikeRef, kind: TapKind, bus?: IdleBus): boolean {
  const n = s.node;
  switch (t.kind) {
    case 'face':
      if (n.phase !== 'dig') return false;
      resolveTap(s, t.col, kind, bus);
      return true;
    case 'seal': {
      if (n.phase !== 'seal' || !s.seal) return false;
      if (t.weak) {
        const id = weakId(s);
        if (id) {
          const r = prepareTap(s, kind);
          tapWeak(s, id, r.d, bus);
          finishTap(s, kind, r.crit, r.surge, r.d, 0, bus);
          return true;
        }
      }
      resolveTap(s, 3, kind, bus);
      return true;
    }
    case 'tappable':
      return strikeTappable(s, t.id, kind, bus);
    case 'skin':
      return strikeSkin(s, t.id, kind, bus);
    case 'glint':
      return strikeGlint(s, t.id, kind, bus);
  }
  return false;
}

function strikeTappable(s: IdleState, id: string, kind: TapKind, bus?: IdleBus): boolean {
  const n = s.node;
  if (n.phase !== 'explore') return false;
  const i = n.node;
  const c = n.chambers[i];
  if (!c) return false;
  enter(s, bus);
  const con = contentsOf(s, i);
  const sc = con.sockets[id];
  if (!sc || !STRIKE_CONTENT.has(sc.kind)) return false;
  const left = c.left[id] ?? 1;
  if (left <= 0) return false;
  const topo = nodeAt(s.seed, i);
  const r = prepareTap(s, kind);
  const v = tappableValueLog10(s, topo, sc.hpEq, sc.goldX);
  const need = v.hp + L10(left);
  if (r.d < need) {
    const nl = Math.max(1e-12, left - Math.pow(10, r.d - v.hp));
    c.left[id] = nl;
    bus?.emit('tappable:hit', { node: i, id, kind: sc.kind, left: nl, stage: crackStage(nl), dmg: Big.fromLog10(r.d), crit: r.crit });
    finishTap(s, kind, r.crit, r.surge, r.d, 0, bus);
    return true;
  }
  c.left[id] = 0;
  // The whole value pays on the break (the face's rule; a chipped leftover pays its part on leave).
  const gold = v.gold > -Infinity ? Big.fromLog10(v.gold) : Big.zero();
  if (!gold.isZero()) creditGold(s, gold, 'tappable', bus);
  if (sc.gems > 0) creditGems(s, sc.gems, 'tappable', bus);
  if (sc.kind === 'geode' || sc.kind === 'gem') rollFind(s, 'rare', currentPage(s), bus);
  s.meta.stats.cells++;
  s.meta.stats.ores++;
  s.meta.lastUsed.ore = s.playTime;
  addXp(s, 3);
  bus?.emit('chamber:harvest', { node: i, id, kind: sc.kind, gold: gold.clone(), gems: sc.gems, crit: r.crit });
  if (sc.kind === 'secret') {
    c.secrets.push(id);
    s.meta.nodeStats.secrets++;
    addXp(s, NODE_XP.secret);
    if (!s.meta.secrets.includes(`node:${i}`)) s.meta.secrets.push(`node:${i}`);
    bus?.emit('secret:found', { node: i, id, cache: con.caches[id] ?? `${id}:cache`, reveals: sc.reveals });
    // The first secret of a lifetime: its card (tutorial.ts's firstTime, inlined to keep the import graph acyclic).
    if (!s.meta.firstTime.includes('ft:secret')) {
      s.meta.firstTime.push('ft:secret');
      bus?.emit('firsttime', { id: 'secret' });
    }
  }
  finishTap(s, kind, r.crit, r.surge, r.d, 1, bus);
  return true;
}

function strikeSkin(s: IdleState, id: string, kind: TapKind, bus?: IdleBus): boolean {
  const n = s.node;
  if (n.phase !== 'explore' || !id) return false;
  const i = n.node;
  const c = n.chambers[i];
  if (!c) return false;
  enter(s, bus);
  const left = c.skin[id] ?? 1;
  if (left <= 0) return false;
  const con = contentsOf(s, i);
  const broken = Object.values(c.skin).filter((x) => x <= 0).length;
  if (broken >= con.skin.cells) return false;
  const topo = nodeAt(s.seed, i);
  const r = prepareTap(s, kind);
  const v = tappableValueLog10(s, topo, SKIN_HP_EQ, GOLD_X.skin);
  const need = v.hp + L10(left);
  if (r.d < need) {
    const nl = Math.max(1e-12, left - Math.pow(10, r.d - v.hp));
    c.skin[id] = nl;
    bus?.emit('skin:strike', { node: i, id, broke: false, left: nl, gold: Big.zero() });
    finishTap(s, kind, r.crit, r.surge, r.d, 0, bus);
    return true;
  }
  c.skin[id] = 0;
  const gold = Big.fromLog10(v.gold);
  creditGold(s, gold, 'skin', bus);
  s.meta.nodeStats.skins++;
  bus?.emit('skin:strike', { node: i, id, broke: true, left: 0, gold: gold.clone() });
  // A pocket (12 %): a nugget (×4 of the cell's value), a gem, or a Halden scrap (a Find roll).
  const u = hashU(s.runSeed, i, id);
  if (u < con.skin.pocket) {
    const w = u / con.skin.pocket;
    if (w < SKIN.nugget) {
      const g = Big.fromLog10(v.hp + L10(goldPerHp() * GOLD_X.nugget) + goldMultLog10(s));
      creditGold(s, g, 'pocket', bus);
      bus?.emit('skin:pocket', { node: i, id, kind: 'nugget', gold: g.clone(), gems: 0, find: '' });
    } else if (w < SKIN.nugget + SKIN.gem) {
      creditGems(s, 1, 'pocket', bus);
      bus?.emit('skin:pocket', { node: i, id, kind: 'gem', gold: Big.zero(), gems: 1, find: '' });
    } else {
      const f = rollFind(s, 'relic', currentPage(s), bus, 40);
      bus?.emit('skin:pocket', { node: i, id, kind: 'scrap', gold: Big.zero(), gems: 0, find: f });
    }
  }
  finishTap(s, kind, r.crit, r.surge, r.d, 1, bus);
  return true;
}

function hashU(seed: number, i: number, id: string): number {
  let h = (seed ^ 0x2545f491 ^ Math.imul(i + 1, 0x9e3779b1)) >>> 0;
  for (let k = 0; k < id.length; k++) h = Math.imul(h ^ id.charCodeAt(k), 0x01000193) >>> 0;
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d) >>> 0;
  h ^= h >>> 12;
  return (h >>> 0) / 4294967296;
}

function strikeGlint(s: IdleState, id: string, kind: TapKind, bus?: IdleBus): boolean {
  const n = s.node;
  const ride = n.ride;
  if (n.phase !== 'ride' || !ride) return false;
  const c = n.chambers[ride.from];
  if (!c || c.glints.includes(id)) return false;
  const g = rideOf(s, ride.from).find((x) => x.id === id);
  if (!g) return false;
  const topo = nodeAt(s.seed, ride.from);
  const r = prepareTap(s, kind);
  const v = tappableValueLog10(s, topo, g.hpEq, g.goldX);
  // Each tap mines one: it pays for the HP the tap really took (L6), never more than the glint holds.
  const took = Math.min(v.hp, r.d);
  const gold = Big.fromLog10(took + L10(goldPerHp() * g.goldX) + goldMultLog10(s));
  c.glints.push(id);
  creditGold(s, gold, 'ride', bus);
  if (g.gems > 0) creditGems(s, g.gems, 'ride', bus);
  s.meta.nodeStats.glints++;
  bus?.emit('ride:glint', { node: ride.from, id, kind: g.kind, gold: gold.clone(), gems: g.gems });
  finishTap(s, kind, r.crit, r.surge, r.d, 1, bus);
  return true;
}

/** The pass-by glints of the ride out of chamber i. */
export function rideOf(s: IdleState, i: number): RideTarget[] {
  return contentsOf(s, i).ride;
}

function relight(s: IdleState, lampId: string, bus?: IdleBus): boolean {
  const n = s.node;
  if (n.phase !== 'explore') return false;
  const i = n.node;
  const c = n.chambers[i];
  if (!c) return false;
  enter(s, bus);
  const con = contentsOf(s, i);
  if (!con.lamps.includes(lampId) || c.lamps.includes(lampId)) return false;
  c.lamps.push(lampId);
  s.meta.nodeStats.lamps++;
  addXp(s, NODE_XP.lamp);
  s.meta.lastUsed.lamp = s.playTime;
  bus?.emit('lamp:relight', { node: i, id: lampId, lit: c.lamps.length, of: con.lamps.length });
  checkCharted(s, i, bus);
  return true;
}

function focusOpen(s: IdleState, id: string, bus?: IdleBus): boolean {
  const n = s.node;
  // A chest popped out of the face (a chest cell): it opens at once, wherever the player is.
  if (s.chests.some((c) => c.id === id)) return tapEntity(s, id, bus);
  if (n.phase !== 'explore') return false;
  const i = n.node;
  const c = n.chambers[i];
  if (!c) return false;
  enter(s, bus);
  if (c.resolved.includes(id)) return false;
  if (isHiddenCache(contentsOf(s, i), id, c.secrets)) return false;
  const f = focusContent(s, i, id);
  if (!f) return false;
  // A geode is struck first (its shell); once cracked it opens in the focus pop.
  if (f.kind === 'geode' && (c.left[id] ?? 1) > 0) return false;
  if (n.focus && n.focus.id !== id) focusClose(s, bus);
  n.focus = { node: i, id, kind: f.kind, holdAt: -1 };
  bus?.emit('focus:open', { node: i, id, kind: f.kind });
  return true;
}

function focusClose(s: IdleState, bus?: IdleBus): void {
  const f = s.node.focus;
  if (!f) return;
  s.node.focus = null;
  const c = s.node.chambers[f.node];
  bus?.emit('focus:close', { node: f.node, id: f.id, resolved: !!c && c.resolved.includes(f.id) });
}

function resolveFocus(s: IdleState, id: string, input: 'tap' | 'hold' | 'release' | 'close', bus?: IdleBus): boolean {
  const n = s.node;
  const f = n.focus;
  if (!f || f.id !== id) {
    // A tap on an unopened object opens it first (one tap less for a chest in reach).
    if (input === 'tap' && focusOpen(s, id, bus)) return resolveFocus(s, id, 'tap', bus);
    return false;
  }
  if (input === 'close') {
    focusClose(s, bus);
    return true;
  }
  const c = n.chambers[f.node];
  if (!c || c.resolved.includes(id)) return false;
  const fc = focusContent(s, f.node, id);
  if (!fc) return false;
  if (fc.kind === 'chest') {
    if (input !== 'tap') return false;
    c.resolved.push(id);
    openChest(s, `${f.node}:${id}`, fc.floor, 'tappable', bus, fc.scripted);
    return true;
  }
  if (fc.kind === 'note' || fc.kind === 'mural') {
    if (input !== 'tap') return false;
    c.resolved.push(id);
    if (fc.lore) addLore(s, fc.lore, bus);
    bus?.emit('note:read', { node: f.node, id, lore: fc.lore });
    return true;
  }
  if (fc.kind === 'gems') {
    if (input !== 'tap') return false;
    c.resolved.push(id);
    creditGems(s, fc.gems, 'secret', bus);
    return true;
  }
  if (fc.kind === 'relic' || fc.kind === 'geode') {
    if (input === 'hold') {
      f.holdAt = s.time;
      return true;
    }
    if (input === 'release' && f.holdAt >= 0) {
      const g = ringGrade(s.time - f.holdAt);
      c.resolved.push(id);
      const relic = fc.kind === 'relic' ? fc.relic : '';
      if (fc.kind === 'geode') {
        // A geode: gems by grade and a Find roll (a mineral).
        rollFind(s, 'rare', currentPage(s), bus, 4);
      }
      gradeRelic(s, f.node, id, relic, g.grade, g.u, bus);
      return true;
    }
    return false;
  }
  return false;
}

/** The ring's hold ran past 2 s without a release: Worn (SPEC §5.7). Called by tickNodes. */
function tickRing(s: IdleState, bus?: IdleBus): void {
  const f = s.node.focus;
  if (!f || f.holdAt < 0) return;
  if (s.time - f.holdAt > RELIC_RING.worn) resolveFocus(s, f.id, 'release', bus);
}

function enter(s: IdleState, bus?: IdleBus): boolean {
  const n = s.node;
  if (n.phase !== 'explore') return false;
  const c = n.chambers[n.node];
  if (!c || c.lit) return false;
  firstLight(s, n.node, bus);
  return true;
}

function takeExit(s: IdleState, exitId: string, bus?: IdleBus): boolean {
  const n = s.node;
  if (n.phase !== 'explore') return false;
  const i = n.node;
  if (!n.chambers[i]) return false;
  enter(s, bus);
  const topo = nodeAt(s.seed, i);
  const next = nodeAt(s.seed, i + 1);
  if (topo.exitSeal && next.seal && sealPending(s, next.depthTop)) {
    if (next.closed || sealClosed(next.biome)) {
      bus?.emit('seal:closed', { biome: next.biome, node: i });
      return false;
    }
    if (s.run.depth !== next.depthTop) return false;
    focusClose(s, bus);
    phaseTo(s, 'seal', bus);
    return true;
  }
  focusClose(s, bus);
  leaveChamber(s, i, bus);
  const kind = topo.wayDown;
  const seconds = RIDE_SECONDS[kind] ?? 2;
  n.ride = { from: i, to: i + 1, kind, t0: s.time, seconds };
  phaseTo(s, 'ride', bus);
  bus?.emit('ride:start', { node: i, to: i + 1, kind, targets: rideOf(s, i).map((g) => g.id), seconds });
  void exitId;
  return true;
}

function endRide(s: IdleState, skipped: boolean, bus?: IdleBus): boolean {
  const n = s.node;
  const r = n.ride;
  if (!r) return false;
  n.ride = null;
  arrive(s, r.to, bus);
  bus?.emit('ride:end', { node: r.from, to: r.to, skipped });
  return true;
}

/** Put the player at node i: its face when the dig front is in its drift, else the mouth of its (open) chamber. */
function arrive(s: IdleState, i: number, bus?: IdleBus): void {
  const n = s.node;
  n.node = i;
  n.stand = 0;
  n.pose = null;
  const front = frontNode(s);
  const t = nodeAt(s.seed, i);
  if (front <= i) {
    phaseTo(s, 'dig', bus);
    bus?.emit('node:arrive', { node: i, phase: 'dig', biome: t.biome, depth: t.depth, dark: false, dug: Math.max(0, s.run.depth - t.depthTop) });
  } else {
    if (!n.chambers[i]) n.chambers[i] = newChamber(i, 'crew');
    phaseTo(s, 'explore', bus);
    bus?.emit('node:arrive', { node: i, phase: 'explore', biome: t.biome, depth: t.depth, dark: !n.chambers[i].lit, dug: t.K });
  }
}

/**
 * After a load (save v4): a ride in progress lands at its end (the camera does not resume mid-ride), and a phase the dig
 * front no longer agrees with is repaired (no events: the shell reads the state).
 */
export function resumeAfterLoad(s: IdleState): void {
  const n = s.node;
  if (!n.on) return;
  const front = frontNode(s);
  if (n.node > front) n.node = front;
  if (n.phase === 'ride') {
    n.ride = null;
    arrive(s, Math.min(front, n.node + 1));
    return;
  }
  if (n.phase === 'dig' && n.node < front) {
    arrive(s, n.node);
    return;
  }
  if (n.phase === 'explore' && !n.chambers[n.node]) {
    if (n.node < front) n.chambers[n.node] = newChamber(n.node, 'crew');
    else n.phase = 'dig';
  }
  if (n.phase === 'seal' && s.shaft.rows[0].kinds[0] !== CELL.SEAL) n.phase = 'explore';
  if (n.phase === 'camp' && n.resume === 'camp') n.resume = 'dig';
}

// ----- the step -------------------------------------------------------------------------------------------------------

/** Per-step upkeep: the cart deliveries, the ride's guard, the relic ring's Worn timeout. */
export function tickNodes(s: IdleState, bus?: IdleBus): void {
  const n = s.node;
  if (!n.on) return;
  deliverHaul(s, bus);
  if (n.ride && s.time - n.ride.t0 > Math.max(30, n.ride.seconds * 4)) endRide(s, true, bus);
  tickRing(s, bus);
}

/**
 * The offline return moved the dig front: the player arrives at the mouth of the first dark chamber the crew opened
 * (SPEC §5.3), leaving their chamber (leftovers to the Works, skipped items to the rack). Returns the chambers opened.
 */
export function returnToFront(s: IdleState, from: number, bus?: IdleBus): number[] {
  const n = s.node;
  if (!n.on) return [];
  const before = nodeOfDepth(s.seed, from).i;
  const after = frontNode(s);
  const opened: number[] = [];
  for (let i = before; i < after; i++) opened.push(i);
  if (opened.length === 0) return opened;
  // Where the player stands: in their own drift whose breach the crew broke → its mouth; in a chamber → the next one.
  const target = n.phase === 'dig' ? n.node : n.node + 1;
  if (target < after && target !== n.node) {
    if (n.phase === 'explore') leaveChamber(s, n.node, bus);
    if (n.ride) n.ride = null;
    n.node = target;
    n.stand = 0;
    n.pose = null;
    if (!n.chambers[target]) n.chambers[target] = newChamber(target, 'crew');
    phaseTo(s, 'explore', bus);
  } else if (n.phase === 'dig' && target < after) {
    n.stand = 0;
    n.pose = null;
    phaseTo(s, 'explore', bus);
  }
  return opened.filter((i) => i >= target);
}

// ----- the views -----------------------------------------------------------------------------------------------------

/** What D's shell and HUD read every frame (BUILD §2 `nodeView`). */
export interface NodeView {
  on: boolean;
  node: number;
  phase: NodePhase;
  stand: number;
  topo: NodeTopo;
  /** Slices of the player's drift cleared (dig) and K. */
  sliceIndex: number;
  K: number;
  /** The crew's front node and depth; dark chambers waiting ahead (unseen and all). */
  frontNode: number;
  digDepth: number;
  leashOpen: number;
  L: number;
  dug: number;
  /** The player's chamber: open, lit (first light this run), seen and charted (lifetime), lamps lit / cold lamps. */
  open: boolean;
  lit: boolean;
  seen: boolean;
  charted: boolean;
  lamps: [number, number];
  /** Strike HP harvested in the player's chamber (0..1 of its budget) and what is left to do there. */
  harvested: number;
  left: { strike: number; lamps: number; focus: number; secrets: number };
  /** The focus pop ('' closed), the ride (null none). */
  focus: string;
  ride: { from: number; to: number; kind: string; glints: number; mined: number } | null;
  /** The Root Knot is closed in this build: true when the player stands in a Seal hall whose seal is closed. */
  sealClosed: boolean;
  /** Items on the Chest Rack. */
  rack: number;
}

export function nodeView(s: IdleState): NodeView {
  const n = s.node;
  const topo = nodeAt(s.seed, n.node);
  const c = n.chambers[n.node];
  const front = frontNode(s);
  let lamps: [number, number] = [0, 0];
  let harvested = 0;
  const left = { strike: 0, lamps: 0, focus: 0, secrets: 0 };
  if (c) {
    const con = contentsOf(s, n.node);
    lamps = [con.lamps.filter((id) => c.lamps.includes(id)).length, con.lamps.length];
    left.lamps = lamps[1] - lamps[0];
    let tot = 0;
    let got = 0;
    for (const id of con.strike) {
      const sc = con.sockets[id];
      if (sc.kind === 'secret') {
        if (!c.secrets.includes(id)) left.secrets++;
        continue;
      }
      tot += sc.hpEq;
      const l = c.left[id] ?? 1;
      got += sc.hpEq * (1 - l);
      if (l > 0) left.strike++;
    }
    harvested = tot > 0 ? got / tot : 1;
    for (const id of [...con.focus, ...c.secrets.map((x) => con.caches[x]).filter(Boolean)]) if (!c.resolved.includes(id)) left.focus++;
  }
  const next = nodeAt(s.seed, n.node + 1);
  return {
    on: n.on,
    node: n.node,
    phase: n.phase,
    stand: n.stand,
    topo,
    sliceIndex: n.phase === 'dig' ? Math.max(0, Math.min(topo.K, s.run.depth - topo.depthTop)) : topo.K,
    K: topo.K,
    frontNode: front,
    digDepth: s.run.depth,
    leashOpen: leashOpen(s),
    L: leashL(s),
    dug: darkAhead(s),
    open: !!c,
    lit: !!c && c.lit,
    seen: isSeen(s, n.node),
    charted: isCharted(s, n.node),
    lamps,
    harvested,
    left,
    focus: n.focus?.id ?? '',
    ride: n.ride ? { from: n.ride.from, to: n.ride.to, kind: n.ride.kind, glints: rideOf(s, n.ride.from).length, mined: n.chambers[n.ride.from]?.glints.length ?? 0 } : null,
    sealClosed: topo.exitSeal && (next.closed || sealClosed(next.biome)) && sealPending(s, next.depthTop),
    rack: rackCount(s),
  };
}

/** One chamber's model state for the scene and the HUD (C's ChamberView adapter reads this; null while closed). */
export interface ChamberModelView {
  node: number;
  topo: NodeTopo;
  contents: NodeContents;
  open: boolean;
  by: ChamberRun['by'];
  lit: boolean;
  seen: boolean;
  charted: boolean;
  /** What a socket shows now: its content kind, 'litLamp' once relit, 'empty' once harvested or resolved. */
  content(id: string): ContentKind;
  /** Remaining HP fraction of a strike type (0 harvested); focus types 1 until resolved, then 0. */
  left(id: string): number;
  lampLit(id: string): boolean;
  /** A wall-skin cell's remaining fraction (1 untouched, 0 broken). */
  skin(id: string): number;
  /** Secrets broken open (their caches' focus ids are `contents.caches[secretId]`). */
  secrets: readonly string[];
  /** A secret's cache not yet revealed (draw nothing there; it takes no tap). */
  hidden(id: string): boolean;
}

export function chamberView(s: IdleState, i: number): ChamberModelView | null {
  const c = s.node.chambers[i];
  if (!c) return null;
  const con = contentsOf(s, i);
  return {
    node: i,
    topo: nodeAt(s.seed, i),
    contents: con,
    open: true,
    by: c.by,
    lit: c.lit,
    seen: isSeen(s, i),
    charted: isCharted(s, i),
    content(id: string): ContentKind {
      const sc = con.sockets[id];
      if (!sc || isHiddenCache(con, id, c.secrets)) return 'empty';
      if (sc.kind === 'lamp') return c.lamps.includes(id) ? 'litLamp' : 'lamp';
      if (STRIKE_CONTENT.has(sc.kind) && (c.left[id] ?? 1) <= 0 && sc.kind !== 'geode') return 'empty';
      if ((FOCUS_CONTENT.has(sc.kind) || sc.kind === 'geode') && c.resolved.includes(id)) return 'empty';
      return sc.kind;
    },
    left(id: string): number {
      const sc = con.sockets[id];
      if (!sc) return 0;
      if (STRIKE_CONTENT.has(sc.kind)) return c.left[id] ?? 1;
      return c.resolved.includes(id) ? 0 : 1;
    },
    lampLit(id: string): boolean {
      return con.litLamps.includes(id) || c.lamps.includes(id);
    },
    skin(id: string): number {
      return c.skin[id] ?? 1;
    },
    secrets: c.secrets,
    hidden(id: string): boolean {
      return isHiddenCache(con, id, c.secrets);
    },
  };
}

/** The chest tier names (for the HUD's rack and the focus panel). */
export const TIER_NAMES = CHEST_TIERS;

/** Debug and tests: put the player at node i (its face, or its chamber opened by the player and lit). */
export function setPlayerNode(s: IdleState, i: number, at: 'dig' | 'explore' | 'breach' = 'dig', bus?: IdleBus): void {
  const n = s.node;
  n.on = true;
  const t = nodeAt(s.seed, i);
  n.chambers = {};
  n.ride = null;
  n.focus = null;
  n.node = i;
  n.stand = 0;
  n.pose = null;
  if (at === 'explore') {
    resetFront(s, t.depth);
    n.chambers[i] = newChamber(i, 'player');
    n.phase = 'explore';
    firstLight(s, i, bus);
  } else {
    resetFront(s, at === 'breach' ? t.breach : t.depthTop);
    n.phase = 'dig';
  }
}

function resetFront(s: IdleState, d: number): void {
  resetWindow(s, d);
  if (d > s.run.dmax) s.run.dmax = d;
}

/** Biome of the player's node (the HUD's depth plate). */
export function playerBiome(s: IdleState): number {
  return nodeAt(s.seed, s.node.node).biome;
}

/** The player's display depth: the face's depth in a drift, the chamber's in a chamber (SPEC §4.1). */
export function playerDepth(s: IdleState): number {
  const n = s.node;
  if (!n.on) return s.run.depth;
  const t = nodeAt(s.seed, n.node);
  return n.phase === 'dig' ? s.run.depth : t.depth;
}

/** Re-export for the bot. */
export { biomeAt };
