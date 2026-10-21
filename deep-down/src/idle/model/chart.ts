// The chart (SPEC §4.1–§4.4, §4.12, BUILD §2; W1-LEAD §3): the pure topology of the descent and what each chamber holds.
//
// Two layers, two seeds:
// - **Topology** (`nodeAt(lifeSeed, i)`): node index ↔ depth, K, the fixed rooms (Threshold, Vista, Seal hall, landmarks),
//   the Way Down kind, the closed seal of this build. Seeded by the lifetime world seed: the same every run.
// - **Contents** (`contents(runSeed, lifeSeed, topo, template)`): the contents class of an ordinary chamber, which
//   sockets hold lamps, the strike tappables and their HP and gold law, the feature, the secret, the ride's pass-by
//   glints. Re-rolled every run, with pity floors.
//
// Depth accounting (SPEC §4.1): 1 slice = 1 model row = 1 m. A node = a drift of K rows [depthTop, depthTop + K) ending
// in a breach (row depthTop + K − 1), then a chamber "at" depth depthTop + K (chambers add no depth), then the Way Down
// to the next drift. Topsoil is authored (5, 6, 7, 7, 7, 8 → C1 at 5 m … C6 at 40 m). From Glowroot on each biome
// starts with its **Threshold** node, whose one-row "drift" is the biome's seal row (biomeStart(k)): the seal is fought
// from the previous biome's Seal hall and its break is the Threshold's breach. The biome's generated drifts fill the rows
// up to the next seal, and the last one's chamber is that biome's Seal hall.
//
// Nothing here imports Three.js, the DOM or the world: B passes its template (`TemplateLike`) in, and the sims use
// `defaultTemplate()`.

import { AUTHORED_BIOMES, biomeAt, biomeStart } from '../config/biomes';
import {
  CHAMBER_EQ,
  CLASS_ON,
  CLASS_SHARES,
  CLOSED_SEALS,
  GLINT_HP_EQ,
  GOLD_X,
  HP_WEIGHT,
  kOf,
  LAMPS,
  LANDMARK_GAP,
  PER_BIOME_MIN,
  PITY_APART,
  RIDE_GLINTS,
  SECRET,
  SECRET_HP_EQ,
  SKIN,
  STRIKES,
  TOPSOIL_K,
  VISTA_AT,
  type OrdinaryClass,
} from '../config/chart';

// ----- types ----------------------------------------------------------------------------------------------------

/** What kind of room a node's chamber is (lifetime). Ordinary chambers get their contents class per run. */
export type NodeKind = 'chamber' | 'authored' | 'threshold' | 'vista' | 'sealHall' | 'landmark';

/** The contents class of a chamber this run (SPEC §4.4), or the fixed room's own. */
export type ContentsClass = OrdinaryClass | 'threshold' | 'vista' | 'sealHall';

/** The Way Down out of a chamber (W1-LEAD §3 Ride): what B builds and the camera rides. */
export type RideKind = 'ladder' | 'rope' | 'stair' | 'chute' | 'cart' | 'cage' | 'drop' | 'none';

/** The breach promise (SPEC §8.4 node colour language). Same strings as render/hybrid/types.ts `PromiseClass`. */
export type NodePromise = 'dull' | 'treasure' | 'builders' | 'works' | 'sealed' | 'far';

/** One node of the descent (pure, lifetime). */
export interface NodeTopo {
  /** Node index along the trunk (0 = the adit plug at the camp). */
  i: number;
  /** Biome of the chamber (and of the drift; a Threshold's drift is the seal row of its own biome). */
  biome: number;
  /** First row of the drift (model depth). */
  depthTop: number;
  /** Slices in the drift. A Threshold has K = 1: its one row is the seal. */
  K: number;
  /** The breach row (the drift's last slice) = depthTop + K − 1. */
  breach: number;
  /** The chamber's depth ("at" this many metres) = depthTop + K. */
  depth: number;
  kind: NodeKind;
  /** The authored room's id ('topsoil.rootCellar', …) or '' for a generated one. B keys its template on it. */
  fixed: string;
  /** The drift is the biome's seal row (Thresholds after a seal). */
  seal: boolean;
  /** The chamber's exit is the next biome's seal (a Seal hall). */
  exitSeal: boolean;
  /** A first sight (a Threshold or a Vista): the crew never opens its breach while it is unseen (L10). */
  firstSight: boolean;
  /** Shown closed in this build (the Root Knot: "Opens in the next build"): the seal phase is refused. */
  closed: boolean;
  /** An authored landmark (counts for "a landmark every ≤ 6 chambers", U-W6). */
  landmark: boolean;
  /** The Way Down out of this chamber. */
  wayDown: RideKind;
  /** Sub-zone of the biome kit (0..3), from the node's place in its biome. */
  zone: number;
  /** Index of the node inside its biome (the Threshold is 0 from Glowroot on) and the biome's node count. */
  inBiome: number;
  biomeNodes: number;
  /** [W2] a fork after this chamber; [W2] the road this node belongs to; [W2] a keystone slot. */
  fork: null;
  road: null;
  keystone: boolean;
}

/** A socket of B's template, as a string id or an object with an id. */
export type SocketRef = string | { id: string };

/**
 * The part of B's `TemplateInfo` (src/world/hybrid/kits/types.ts) the model reads: socket ids per socket kind. Any object
 * with these fields passes (structural typing), so B's richer type is accepted as is.
 */
export interface TemplateLike {
  id: string;
  sockets: {
    veins?: readonly SocketRef[];
    gems?: readonly SocketRef[];
    lamps?: readonly SocketRef[];
    feature?: readonly SocketRef[];
    stash?: readonly SocketRef[];
    keystone?: readonly SocketRef[];
    secret?: readonly SocketRef[];
    /** The caches secrets reveal (hidden until their secret breaks). */
    cache?: readonly SocketRef[];
    /** Halden notes and plaques (focus: lore). */
    note?: readonly SocketRef[];
    /** Skin cells: a count, or the cell ids. */
    skin?: number | readonly SocketRef[];
  };
  /**
   * Per-socket facts (B's `SocketInfo`): an authored burning lamp (`lit`), a rich vein (`rich`), the cache sockets a
   * secret reveals (`reveals`).
   */
  all?: ReadonlyArray<{ id: string; kind?: string; lit?: boolean; rich?: boolean; reveals?: readonly string[]; hidden?: boolean }>;
}

/** What a socket holds this run. */
export type ContentKind =
  | 'vein' | 'rich' | 'gem' | 'geode' | 'stash' | 'secret' // strike types
  | 'chest' | 'relic' | 'note' | 'mural' | 'depot' | 'keystone' | 'gems' // focus types ('gems': a secret's cache of gems)
  | 'lamp' | 'litLamp' // cold lamp (relight it), lamp already burning (the Lamp Room's)
  | 'empty';

export const STRIKE_CONTENT: ReadonlySet<ContentKind> = new Set<ContentKind>(['vein', 'rich', 'gem', 'geode', 'stash', 'secret']);
export const FOCUS_CONTENT: ReadonlySet<ContentKind> = new Set<ContentKind>(['chest', 'relic', 'note', 'mural', 'depot', 'keystone', 'gems']);

export interface SocketContent {
  /** The socket id (B's). */
  id: string;
  kind: ContentKind;
  /** Strike types: HP in cell-equivalents of the chamber depth's host rock (0 for focus types and lamps). */
  hpEq: number;
  /** Strike types: gold per damage as a multiple of the face's gold per HP (L6). */
  goldX: number;
  /** Gems on break (gem clusters). */
  gems: number;
  /** Chests: the floor tier 0 wood … 4 lintel; `scripted` forces the tutorial's one honest step (Wood → Copper). */
  floor: number;
  scripted: boolean;
  /** Notes: the lore id; relics: the Find id. */
  lore: string;
  relic: string;
  /** A secret: what breaking it reveals ('chest:<floor>', 'gems:<n>', 'note:<loreId>'); its cache's focus id is `caches[id]`. */
  reveals: string;
}

/** A ride's pass-by glint (W1-LEAD §3 Ride): each tap mines one. `at` is where along the ride it passes (0..1). */
export interface RideTarget {
  id: string;
  kind: 'ore' | 'rich' | 'gem';
  at: number;
  hpEq: number;
  goldX: number;
  gems: number;
}

/** A chamber's contents this run (pure: the same for the same seeds and template). */
export interface NodeContents {
  node: number;
  cls: ContentsClass;
  promise: NodePromise;
  template: string;
  /** Socket id → content (every socket of the template, empty ones as 'empty'). */
  sockets: Record<string, SocketContent>;
  /** Ids by role, in socket order. */
  strike: string[];
  focus: string[];
  lamps: string[];
  litLamps: string[];
  secrets: string[];
  /** Wall skin: cells and the pocket odds (SPEC §4.7). */
  skin: { cells: number; pocket: number };
  /** The pass-by glints of the Way Down out of this chamber. */
  ride: RideTarget[];
  /** The lore ids of the notes this chamber holds (also in `sockets`). */
  notes: string[];
  /**
   * Secret id → the focus id of the cache it reveals: B's cache socket when the template names one (`reveals`), else the
   * virtual id `<secretId>:cache`. Caches are hidden (not tappable, not counted) until their secret breaks.
   */
  caches: Record<string, string>;
}

// ----- seeds ------------------------------------------------------------------------------------------------------

function hash(seed: number, a: number, b: number): number {
  let h = (seed ^ 0x3c6ef372) >>> 0;
  h = Math.imul(h ^ (a | 0), 0x9e3779b1) >>> 0;
  h = Math.imul(h ^ (b | 0), 0x85ebca77) >>> 0;
  h ^= h >>> 15;
  h = Math.imul(h, 0xc2b2ae3d) >>> 0;
  h ^= h >>> 13;
  return h >>> 0;
}

function u01(seed: number, a: number, b: number): number {
  return hash(seed, a, b) / 4294967296;
}

// ----- Topsoil: the six authored nodes ------------------------------------------------------------------------------

/** One authored Topsoil node (SPEC §7; BUILD §3.1 MUST 2). */
export interface AuthoredNode {
  fixed: string;
  K: number;
  cls: ContentsClass;
  wayDown: RideKind;
  /** What the room holds (in socket roles): strike counts, the feature, lamps (cold, burning), notes, the secret. */
  veins: number;
  rich: number;
  gems: number;
  stash: number;
  feature: '' | 'chest' | 'relic' | 'note';
  chestFloor: number;
  scripted: boolean;
  relic: string;
  coldLamps: number;
  litLamps: number;
  notes: string[];
  secret: '' | string;
  exitSeal: boolean;
}

/** The six Topsoil nodes (drifts 5, 6, 7, 7, 7, 8). Lore ids are `lore:0:note0..2` (texts in i18n idleLore.ts). */
export const TOPSOIL_NODES: readonly AuthoredNode[] = [
  // C1 the Root Cellar (5 m): the sky shaft, the scripted Wood chest in the lantern pool, three root-knot veins, two lamps.
  {
    fixed: 'topsoil.rootCellar', K: TOPSOIL_K[0], cls: 'cache', wayDown: 'ladder',
    veins: 3, rich: 0, gems: 0, stash: 3, feature: 'chest', chestFloor: 0, scripted: true, relic: '',
    coldLamps: 2, litLamps: 0, notes: [], secret: 'gems:3', exitSeal: false,
  },
  // C2 the Copper Lode (11 m): a broad copper vein across the right wall, the first gem cluster on a ledge, the cart run down.
  {
    fixed: 'topsoil.copperLode', K: TOPSOIL_K[1], cls: 'lode', wayDown: 'cart',
    veins: 3, rich: 4, gems: 1, stash: 1, feature: '', chestFloor: 0, scripted: false, relic: '',
    coldLamps: 2, litLamps: 0, notes: [], secret: '', exitSeal: false,
  },
  // C3 the Halden Lamp Room (18 m): a lamp still burning on a crate, the "Day 40" note under it, two cold lamps.
  {
    fixed: 'topsoil.lampRoom', K: TOPSOIL_K[2], cls: 'haldenCamp', wayDown: 'ladder',
    veins: 4, rich: 1, gems: 1, stash: 1, feature: 'note', chestFloor: 0, scripted: false, relic: '',
    coldLamps: 2, litLamps: 1, notes: ['lore:0:note0'], secret: 'chest:0', exitSeal: false,
  },
  // C4 the Reliquary niche (25 m): a relic on a plinth in a cyan-lit alcove (the Halden Compass).
  {
    fixed: 'topsoil.reliquary', K: TOPSOIL_K[3], cls: 'reliquary', wayDown: 'stair',
    veins: 4, rich: 2, gems: 1, stash: 1, feature: 'relic', chestFloor: 0, scripted: false, relic: 'find:0:4',
    coldLamps: 2, litLamps: 0, notes: [], secret: '', exitSeal: false,
  },
  // C5 the Cache (32 m): a Copper-floor chest among collapsed crates; green light leaks through the floor; a crate manifest.
  {
    fixed: 'topsoil.cache', K: TOPSOIL_K[4], cls: 'cache', wayDown: 'ladder',
    veins: 4, rich: 2, gems: 1, stash: 2, feature: 'chest', chestFloor: 1, scripted: false, relic: '',
    coldLamps: 3, litLamps: 0, notes: ['lore:0:note1'], secret: 'gems:4', exitSeal: false,
  },
  // C6 the Lift Bottom (40 m): the dead hoist cage, chains, the Halden Hatch in the floor (the seal), the hoist log.
  {
    fixed: 'topsoil.liftBottom', K: TOPSOIL_K[5], cls: 'sealHall', wayDown: 'drop',
    veins: 4, rich: 2, gems: 1, stash: 1, feature: 'note', chestFloor: 0, scripted: false, relic: '',
    coldLamps: 2, litLamps: 0, notes: ['lore:0:note2'], secret: '', exitSeal: true,
  },
];

// ----- the biome layout (lifetime) -----------------------------------------------------------------------------------

interface BiomeLayout {
  biome: number;
  /** First node index of the biome (its Threshold from Glowroot on). */
  first: number;
  /** Node count (Threshold + drifts). */
  count: number;
  /** depthTop of each node of the biome, and K. */
  tops: number[];
  ks: number[];
  /** Index inside the biome of the Vista and the landmarks. */
  vista: number;
  landmarks: Set<number>;
}

const layoutCache = new Map<number, BiomeLayout[]>();

function layoutsFor(lifeSeed: number): BiomeLayout[] {
  let l = layoutCache.get(lifeSeed >>> 0);
  if (!l) {
    l = [];
    layoutCache.set(lifeSeed >>> 0, l);
    if (layoutCache.size > 8) layoutCache.delete(layoutCache.keys().next().value as number);
  }
  return l;
}

function layoutOf(lifeSeed: number, k: number): BiomeLayout {
  const arr = layoutsFor(lifeSeed);
  while (arr.length <= k) arr.push(buildLayout(lifeSeed, arr.length, arr[arr.length - 1]));
  return arr[k];
}

function buildLayout(lifeSeed: number, k: number, prev: BiomeLayout | undefined): BiomeLayout {
  const first = prev ? prev.first + prev.count : 0;
  if (k === 0) {
    const tops: number[] = [];
    let d = 0;
    for (const n of TOPSOIL_NODES) {
      tops.push(d);
      d += n.K;
    }
    return { biome: 0, first: 0, count: TOPSOIL_NODES.length, tops, ks: TOPSOIL_NODES.map((n) => n.K), vista: -1, landmarks: new Set() };
  }
  const start = biomeStart(k);
  const end = biomeStart(k + 1);
  // The Threshold's drift is the seal row; the drifts fill [start + 1, end).
  const rows = end - start - 1;
  const K = kOf(k);
  const n = Math.max(1, Math.round(rows / K));
  const base = Math.floor(rows / n);
  const extra = rows - base * n;
  // Which drifts take one more row (lifetime-seeded, deterministic).
  const order = Array.from({ length: n }, (_, j) => j).sort((a, b) => hash(lifeSeed, k * 131 + a, 0x6b) - hash(lifeSeed, k * 131 + b, 0x6b) || a - b);
  const plus = new Set(order.slice(0, extra));
  const tops = [start];
  const ks = [1];
  let d = start + 1;
  for (let j = 0; j < n; j++) {
    const kk = base + (plus.has(j) ? 1 : 0);
    tops.push(d);
    ks.push(kk);
    d += kk;
  }
  // Fixed rooms inside the biome: index 0 the Threshold, n the Seal hall (the last drift's chamber), the Vista at ~35 %
  // of the trunk, and a landmark in every gap wider than LANDMARK_GAP.
  const count = n + 1;
  const vista = n >= 4 ? 1 + Math.round(VISTA_AT * (n - 1)) : -1;
  const fixed = [0, ...(vista > 0 ? [vista] : []), count - 1].sort((a, b) => a - b);
  const landmarks = new Set<number>();
  for (let f = 0; f + 1 < fixed.length; f++) {
    const a = fixed[f];
    const b = fixed[f + 1];
    if (b - a > LANDMARK_GAP) {
      const parts = Math.ceil((b - a) / LANDMARK_GAP);
      for (let p = 1; p < parts; p++) landmarks.add(a + Math.round(((b - a) * p) / parts));
    }
  }
  return { biome: k, first, count, tops, ks, vista, landmarks };
}

/** The biome a node index belongs to (its chamber's biome). */
function biomeOfNode(lifeSeed: number, i: number): number {
  let k = 0;
  for (;;) {
    const l = layoutOf(lifeSeed, k);
    if (i < l.first + l.count) return k;
    k++;
    if (k > 100000) return k;
  }
}

const RIDE_BY_BIOME: readonly RideKind[] = ['ladder', 'chute', 'stair', 'cage', 'stair', 'stair', 'stair', 'stair', 'stair', 'stair', 'cage', 'drop', 'drop', 'stair'];

/** The topology of node i (pure, lifetime-seeded). */
export function nodeAt(lifeSeed: number, i: number): NodeTopo {
  const idx = Math.max(0, Math.floor(i));
  const k = biomeOfNode(lifeSeed, idx);
  const l = layoutOf(lifeSeed, k);
  const j = idx - l.first;
  const depthTop = l.tops[j];
  const K = l.ks[j];
  const breach = depthTop + K - 1;
  const depth = depthTop + K;
  if (k === 0) {
    const a = TOPSOIL_NODES[j];
    return {
      i: idx, biome: 0, depthTop, K, breach, depth, kind: 'authored', fixed: a.fixed, seal: false, exitSeal: a.exitSeal,
      firstSight: false, closed: false, landmark: j === TOPSOIL_NODES.length - 1, wayDown: a.wayDown, zone: Math.min(1, Math.floor(j / 3)),
      inBiome: j, biomeNodes: l.count, fork: null, road: null, keystone: false,
    };
  }
  const isThreshold = j === 0;
  const isSealHall = j === l.count - 1;
  const isVista = j === l.vista;
  const isLandmark = l.landmarks.has(j);
  const kind: NodeKind = isThreshold ? 'threshold' : isSealHall ? 'sealHall' : isVista ? 'vista' : isLandmark ? 'landmark' : 'chamber';
  const zones = k < AUTHORED_BIOMES ? 2 : 4;
  return {
    i: idx,
    biome: k,
    depthTop,
    K,
    breach,
    depth,
    kind,
    fixed: '',
    seal: isThreshold,
    exitSeal: isSealHall,
    firstSight: isThreshold || isVista,
    closed: isThreshold && CLOSED_SEALS.includes(k),
    landmark: kind !== 'chamber',
    wayDown: isSealHall ? 'drop' : RIDE_BY_BIOME[Math.min(RIDE_BY_BIOME.length - 1, k % 14)],
    zone: Math.min(zones - 1, Math.floor((j / Math.max(1, l.count)) * zones)),
    inBiome: j,
    biomeNodes: l.count,
    fork: null,
    road: null,
    keystone: false,
  };
}

/** The node whose drift holds row d (the Threshold for a seal row). */
export function nodeOfDepth(lifeSeed: number, d: number): NodeTopo {
  const depth = Math.max(0, Math.floor(d));
  const k = biomeAt(depth);
  const l = layoutOf(lifeSeed, k);
  // Binary search the biome's tops.
  let lo = 0;
  let hi = l.count - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (l.tops[mid] <= depth) lo = mid;
    else hi = mid - 1;
  }
  return nodeAt(lifeSeed, l.first + lo);
}

/** The first node of biome k (its Threshold from Glowroot on, node 0 for Topsoil). */
export function firstNodeOfBiome(lifeSeed: number, k: number): number {
  return layoutOf(lifeSeed, Math.max(0, k)).first;
}

/** Node count of biome k. */
export function nodesInBiome(lifeSeed: number, k: number): number {
  return layoutOf(lifeSeed, Math.max(0, k)).count;
}

/** True when row d is the breach (last slice) of its node's drift. */
export function isBreachRow(lifeSeed: number, d: number): boolean {
  const t = nodeOfDepth(lifeSeed, d);
  return t.breach === d;
}

// ----- contents classes (per run, with pity) ------------------------------------------------------------------------

interface ClassMemo {
  cls: ContentsClass[];
  /** Secret used, per node. */
  secret: boolean[];
}

const classCache = new Map<string, ClassMemo>();

function memoFor(runSeed: number, lifeSeed: number): ClassMemo {
  const key = `${runSeed >>> 0}:${lifeSeed >>> 0}`;
  let m = classCache.get(key);
  if (!m) {
    m = { cls: [], secret: [] };
    classCache.set(key, m);
    if (classCache.size > 8) classCache.delete(classCache.keys().next().value as string);
  }
  return m;
}

const ORDINARY: readonly OrdinaryClass[] = (Object.keys(CLASS_SHARES) as OrdinaryClass[]).filter((c) => CLASS_ON[c]);
const SHARE_TOTAL = ORDINARY.reduce((a, c) => a + CLASS_SHARES[c], 0) + (Object.keys(CLASS_SHARES) as OrdinaryClass[]).filter((c) => !CLASS_ON[c]).reduce((a, c) => a + CLASS_SHARES[c], 0);

/** The contents class of node i this run (pure: a forward scan with the pity floors, memoised per seed pair). */
export function contentsClass(runSeed: number, lifeSeed: number, i: number): ContentsClass {
  const m = memoFor(runSeed, lifeSeed);
  while (m.cls.length <= i) {
    const n = m.cls.length;
    m.cls.push(rollClass(runSeed, lifeSeed, n, m));
    m.secret.push(rollSecret(runSeed, n, m));
  }
  return m.cls[i];
}

/** Whether node i's secret slot is used this run (about 1 in 2, never more than SECRET.apart chambers apart). */
export function secretUsed(runSeed: number, lifeSeed: number, i: number): boolean {
  contentsClass(runSeed, lifeSeed, i);
  return memoFor(runSeed, lifeSeed).secret[i];
}

function rollSecret(runSeed: number, n: number, m: ClassMemo): boolean {
  let since = 0;
  for (let j = n - 1; j >= 0 && !m.secret[j]; j--) since++;
  if (since >= SECRET.apart - 1 && n >= SECRET.apart - 1) return true;
  return u01(runSeed, n, 0x5ec) < SECRET.chance;
}

function rollClass(runSeed: number, lifeSeed: number, n: number, m: ClassMemo): ContentsClass {
  const t = nodeAt(lifeSeed, n);
  if (t.biome === 0) return TOPSOIL_NODES[t.inBiome].cls;
  if (t.kind === 'threshold') return 'threshold';
  if (t.kind === 'vista') return 'vista';
  if (t.kind === 'sealHall') return 'sealHall';
  // Pity: chambers since the last of a class (ordinary rooms only), and the biome's minimums.
  const since = (c: ContentsClass): number => {
    let d = 0;
    for (let j = n - 1; j >= 0; j--) {
      if (m.cls[j] === c) return d;
      const tj = nodeAt(lifeSeed, j);
      if (tj.kind === 'chamber' || tj.kind === 'landmark' || tj.biome === 0) d++;
    }
    return d;
  };
  const inBiome = (c: ContentsClass): number => {
    let x = 0;
    for (let j = n - 1; j >= 0; j--) {
      const tj = nodeAt(lifeSeed, j);
      if (tj.biome !== t.biome) break;
      if (m.cls[j] === c) x++;
    }
    return x;
  };
  // This chamber's place among the biome's ordinary chambers (the Threshold, the Vista and the Seal hall are not ordinary).
  let idx = 0;
  let total = 0;
  for (let j = 0; j < t.biomeNodes; j++) {
    const tj = nodeAt(lifeSeed, t.i + (j - t.inBiome));
    if (tj.kind !== 'chamber' && tj.kind !== 'landmark') continue;
    if (j < t.inBiome) idx++;
    total++;
  }
  // Every floor is a job with a deadline (the slots it may still wait, 0 = now): the pity floors (at most N − 1 ordinary
  // chambers without the class), and the biome's minimums spread evenly over its ordinary chambers (the j-th note by
  // ⌊(j + 1)·N / 3⌋ − 1, so the notes never bunch up before the Seal hall). Earliest deadline first: when any k-th
  // tightest job has a deadline ≤ k, the tightest is placed now, so no floor is ever broken by another one.
  const jobs: Array<{ c: ContentsClass; slack: number }> = [];
  for (const c of ['cache', 'reliquary', 'geode'] as const) jobs.push({ c, slack: PITY_APART[c] - 1 - since(c) });
  const spread = (c: ContentsClass, min: number): void => {
    for (let j = inBiome(c); j < min; j++) jobs.push({ c, slack: Math.floor(((j + 1) * total) / min) - 1 - idx });
  };
  spread('haldenCamp', PER_BIOME_MIN.notes);
  spread('reliquary', PER_BIOME_MIN.reliquary);
  jobs.sort((a, b) => a.slack - b.slack);
  if (jobs.some((jb, k) => jb.slack <= k)) return jobs[0].c;
  // The roll (W2 classes fold into Gallery).
  let u = u01(runSeed, n, 0xc1a5) * SHARE_TOTAL;
  for (const c of Object.keys(CLASS_SHARES) as OrdinaryClass[]) {
    u -= CLASS_SHARES[c];
    if (u < 0) return CLASS_ON[c] ? c : 'gallery';
  }
  return 'gallery';
}

/** The breach promise of a contents class (SPEC §4.4 "Breach leak", §8.4). */
export function promiseOf(cls: ContentsClass): NodePromise {
  switch (cls) {
    case 'lode':
    case 'cache':
    case 'lampHall':
      return 'treasure';
    case 'reliquary':
    case 'haldenCamp':
    case 'geode':
      return 'builders';
    case 'depot':
      return 'works';
    case 'threshold':
    case 'vista':
      return 'far';
    case 'sealHall':
      return 'sealed';
    default:
      return 'dull';
  }
}

// ----- templates ----------------------------------------------------------------------------------------------------

function ids(list: readonly SocketRef[] | undefined): string[] {
  return (list ?? []).map((x) => (typeof x === 'string' ? x : x.id));
}

/**
 * A synthetic template for the sims and the tests (and the fallback when B gives none): socket ids by role, enough for
 * every class (14 strike sockets, 4 lamp sockets, 2 feature sockets, 2 secret sockets, 40 skin cells).
 */
export function defaultTemplate(topo: NodeTopo): TemplateLike {
  const mk = (p: string, n: number) => Array.from({ length: n }, (_, j) => `${p}${j}`);
  return {
    id: topo.fixed || `gen.${topo.biome}.${topo.kind}`,
    sockets: {
      veins: mk('v', 10), gems: mk('g', 2), lamps: mk('l', 4), feature: mk('f', 2), stash: mk('s', 2), keystone: mk('k', 1), secret: mk('x', 2),
      cache: mk('c', 2), note: mk('n', 1), skin: SKIN.cells,
    },
    all: [
      { id: 'x0', kind: 'secret', reveals: ['c0'] },
      { id: 'x1', kind: 'secret', reveals: ['c1'] },
      { id: 'c0', kind: 'cache', hidden: true },
      { id: 'c1', kind: 'cache', hidden: true },
    ],
  };
}

// ----- contents ------------------------------------------------------------------------------------------------------

function empty(id: string): SocketContent {
  return { id, kind: 'empty', hpEq: 0, goldX: 0, gems: 0, floor: 0, scripted: false, lore: '', relic: '', reveals: '' };
}

/** What a Glowroot (or later) class puts in its sockets: strike counts by kind, the feature, lamps. */
function plan(cls: ContentsClass, topo: NodeTopo, rnd: (a: number) => number): AuthoredNode {
  const r = (a: number, lo: number, hi: number) => lo + Math.floor(rnd(a) * (hi - lo + 1));
  const base: AuthoredNode = {
    fixed: '', K: topo.K, cls, wayDown: topo.wayDown, veins: r(1, 4, 6), rich: r(2, 1, 2), gems: r(3, 0, 1), stash: r(4, 1, 2), feature: '',
    chestFloor: 0, scripted: false, relic: '', coldLamps: r(5, LAMPS.min, LAMPS.max - 1), litLamps: 0, notes: [], secret: '', exitSeal: topo.exitSeal,
  };
  const page = Math.min(AUTHORED_BIOMES - 1, topo.biome);
  switch (cls) {
    case 'lode':
      return { ...base, veins: r(1, 3, 4), rich: r(2, 3, 5), gems: r(3, 0, 1) };
    case 'cache':
      return { ...base, feature: 'chest', chestFloor: rnd(6) < 0.35 ? 1 : 0 };
    case 'reliquary':
      return { ...base, feature: 'relic', relic: `find:${page}:${rnd(7) < 0.5 ? 4 : 5}` };
    case 'geode':
      return { ...base, gems: r(3, 1, 2) };
    case 'haldenCamp':
      return { ...base, feature: 'note', litLamps: 1, coldLamps: Math.max(LAMPS.min, base.coldLamps - 1) };
    case 'collapse':
      return { ...base, veins: r(1, 3, 4), rich: 1, stash: r(4, 2, 3) };
    case 'threshold':
      return { ...base, veins: r(1, 4, 5), rich: r(2, 1, 2), gems: 1, coldLamps: 2 };
    case 'vista':
      return { ...base, feature: 'relic', relic: `find:${page}:5`, gems: r(3, 1, 2), coldLamps: 3 };
    case 'sealHall':
      return { ...base, coldLamps: 2 };
    default:
      return base;
  }
}

/** The biome's note ids in the order they are found (3 per biome; Topsoil's are authored). */
export function noteIds(biome: number): string[] {
  const b = Math.min(AUTHORED_BIOMES - 1, Math.max(0, biome));
  return [`lore:${b}:note0`, `lore:${b}:note1`, `lore:${b}:note2`];
}

/**
 * Node i's contents this run (pure). `template` is B's template for this node (or `defaultTemplate(topo)`). Every socket
 * of the template gets an entry; sockets the plan does not use stay 'empty' (B draws them as plain dressing).
 */
export function contents(runSeed: number, lifeSeed: number, topo: NodeTopo, template: TemplateLike = defaultTemplate(topo)): NodeContents {
  const i = topo.i;
  const cls = contentsClass(runSeed, lifeSeed, i);
  const rnd = (a: number) => u01(runSeed ^ 0x51ed, i * 97 + a, 0x77);
  const p: AuthoredNode = topo.biome === 0 ? TOPSOIL_NODES[topo.inBiome] : plan(cls, topo, rnd);
  const sk = template.sockets;
  const facts = new Map((template.all ?? []).map((f) => [f.id, f] as const));
  const out: NodeContents = {
    node: i, cls, promise: promiseOf(cls), template: template.id, sockets: {}, strike: [], focus: [], lamps: [], litLamps: [], secrets: [],
    skin: { cells: typeof sk.skin === 'number' ? sk.skin : sk.skin && sk.skin.length > 0 ? sk.skin.length : SKIN.cells, pocket: SKIN.pocket },
    ride: [], notes: [], caches: {},
  };
  const all = [...ids(sk.veins), ...ids(sk.gems), ...ids(sk.lamps), ...ids(sk.feature), ...ids(sk.stash), ...ids(sk.keystone), ...ids(sk.secret), ...ids(sk.cache), ...ids(sk.note)];
  for (const id of all) out.sockets[id] = empty(id);
  // Strike tappables: veins sockets take rich veins first (B's `rich` flags, then by the plan), then veins; gem sockets
  // the clusters; stash sockets the bricks. A template with fewer sockets just holds fewer (the HP budget is spread over
  // what exists).
  const veinIds = ids(sk.veins);
  const flagged = veinIds.filter((id) => facts.get(id)?.rich);
  const rest = shuffled(veinIds.filter((id) => !facts.get(id)?.rich), runSeed, i, 1);
  const order = [...flagged, ...rest];
  const want = Math.max(0, Math.min(STRIKES.max, p.veins + p.rich));
  const nRich = Math.max(flagged.length, Math.min(p.rich, want));
  for (let j = 0; j < Math.min(Math.max(want, flagged.length), order.length); j++) put(out, order[j], j < nRich ? 'rich' : 'vein');
  const gemIds = ids(sk.gems);
  for (let j = 0; j < Math.min(p.gems, gemIds.length); j++) put(out, gemIds[j], 'gem');
  const stashIds = ids(sk.stash);
  for (let j = 0; j < Math.min(p.stash, stashIds.length); j++) put(out, stashIds[j], 'stash');
  // The feature (a geode sits in a feature socket and is struck first, then focused).
  const feat = ids(sk.feature);
  const noteSockets = ids(sk.note);
  let featUsed = 0;
  if (cls === 'geode' && feat.length > 0) {
    put(out, feat[0], 'geode');
    featUsed = 1;
  } else if ((p.feature === 'chest' || p.feature === 'relic') && feat.length > 0) {
    const c = put(out, feat[0], p.feature);
    if (p.feature === 'chest') {
      c.floor = p.chestFloor;
      c.scripted = p.scripted;
    } else c.relic = p.relic;
    featUsed = 1;
  }
  // Notes: the authored ones (Topsoil), or a Halden camp's note. On note sockets first, else the next feature socket.
  const notes = topo.biome === 0 ? p.notes : p.feature === 'note' ? [noteFor(lifeSeed, runSeed, topo)] : [];
  for (let j = 0; j < notes.length; j++) {
    const sid = j < noteSockets.length ? noteSockets[j] : feat[featUsed++];
    if (!sid) break;
    const c = put(out, sid, 'note');
    c.lore = notes[j];
    out.notes.push(notes[j]);
  }
  // Lamps: B's authored burning lamps stay burning; which other lamp sockets hold cold lamps re-rolls per run (SPEC §4.1).
  const lampIds = ids(sk.lamps);
  const burning = lampIds.filter((id) => facts.get(id)?.lit);
  const others = shuffled(lampIds.filter((id) => !facts.get(id)?.lit), runSeed, i, 2);
  const extraLit = Math.max(0, Math.min(p.litLamps - burning.length, others.length));
  for (const id of burning) put(out, id, 'litLamp');
  for (let j = 0; j < extraLit; j++) put(out, others[j], 'litLamp');
  const nCold = Math.min(others.length - extraLit, Math.max(LAMPS.min, Math.min(LAMPS.max, p.coldLamps)));
  for (let j = 0; j < nCold; j++) put(out, others[extraLit + j], 'lamp');
  // The secret: a cracked wall, a hollow floor or a loose brick hiding a cache (W1-LEAD §3).
  const secIds = ids(sk.secret);
  const useSecret = topo.biome === 0 ? !!p.secret : secretUsed(runSeed, lifeSeed, i);
  if (useSecret && secIds.length > 0) {
    const sid = secIds[Math.floor(rnd(9) * secIds.length) % secIds.length];
    const c = put(out, sid, 'secret');
    c.reveals = p.secret || (rnd(10) < 0.55 ? `chest:${rnd(11) < 0.3 ? 1 : 0}` : `gems:${3 + Math.floor(rnd(12) * 3)}`);
    const named = facts.get(sid)?.reveals?.find((x) => out.sockets[x] !== undefined);
    const cacheId = named ?? `${sid}:cache`;
    out.caches[sid] = cacheId;
    if (named) {
      const [what, arg] = c.reveals.split(':');
      const cc = out.sockets[named];
      cc.kind = what === 'chest' ? 'chest' : what === 'note' ? 'note' : 'gems';
      cc.floor = what === 'chest' ? Number(arg) || 0 : 0;
      cc.gems = what === 'gems' ? Number(arg) || 3 : 0;
      cc.lore = what === 'note' ? c.reveals.slice(5) : '';
    }
  }
  // The HP budget over the strike tappables (secrets are on top of it; geodes are in it).
  let wsum = 0;
  for (const id of out.strike) {
    const c = out.sockets[id];
    if (c.kind !== 'secret') wsum += weightOf(c.kind);
  }
  for (const id of out.strike) {
    const c = out.sockets[id];
    if (c.kind === 'secret') {
      c.hpEq = SECRET_HP_EQ;
      c.goldX = GOLD_X.secret;
    } else {
      c.hpEq = wsum > 0 ? (CHAMBER_EQ * weightOf(c.kind)) / wsum : 0;
      c.goldX = c.kind === 'rich' ? GOLD_X.rich : c.kind === 'gem' || c.kind === 'geode' ? GOLD_X.gem : c.kind === 'stash' ? GOLD_X.stash : GOLD_X.vein;
      c.gems = c.kind === 'gem' ? 1 : 0;
    }
  }
  out.ride = rideTargets(runSeed, topo);
  return out;
}

/** True when a focus id is a secret's cache not yet revealed (`found` the secrets broken open this run). */
export function isHiddenCache(c: NodeContents, id: string, found: readonly string[]): boolean {
  for (const [sid, cid] of Object.entries(c.caches)) if (cid === id) return !found.includes(sid);
  return false;
}

function weightOf(k: ContentKind): number {
  return k === 'rich' ? HP_WEIGHT.rich : k === 'gem' ? HP_WEIGHT.gem : k === 'stash' ? HP_WEIGHT.stash : k === 'geode' ? HP_WEIGHT.geode : HP_WEIGHT.vein;
}

function put(out: NodeContents, id: string, kind: ContentKind): SocketContent {
  const c = out.sockets[id] ?? empty(id);
  c.kind = kind;
  out.sockets[id] = c;
  if (STRIKE_CONTENT.has(kind)) out.strike.push(id);
  else if (FOCUS_CONTENT.has(kind)) out.focus.push(id);
  else if (kind === 'lamp') out.lamps.push(id);
  else if (kind === 'litLamp') out.litLamps.push(id);
  if (kind === 'secret') out.secrets.push(id);
  return c;
}

function shuffled(list: string[], seed: number, i: number, salt: number): string[] {
  return list
    .map((id, j) => ({ id, k: hash(seed ^ (salt * 0x1f3d), i * 61 + j, salt) }))
    .sort((a, b) => a.k - b.k || 0)
    .map((x) => x.id);
}

/** The note a generated Halden camp holds: the biome's notes in order, by how many camps came before it this run. */
function noteFor(lifeSeed: number, runSeed: number, topo: NodeTopo): string {
  let n = 0;
  for (let j = topo.i - 1; j >= 0; j--) {
    const tj = nodeAt(lifeSeed, j);
    if (tj.biome !== topo.biome) break;
    if (contentsClass(runSeed, lifeSeed, j) === 'haldenCamp') n++;
  }
  const notes = noteIds(topo.biome);
  return notes[n % notes.length];
}

/** The pass-by glints of node i's Way Down (W1-LEAD §3 Ride). Pure; `kind` overrides the topology's when B built another. */
export function rideTargets(runSeed: number, topo: NodeTopo, kind: RideKind = topo.wayDown): RideTarget[] {
  const n = RIDE_GLINTS[kind] ?? 0;
  const out: RideTarget[] = [];
  for (let j = 0; j < n; j++) {
    const u = u01(runSeed ^ 0x9117, topo.i * 13 + j, 0x21);
    const k: RideTarget['kind'] = u < 0.12 ? 'gem' : u < 0.42 ? 'rich' : 'ore';
    out.push({
      id: `ride:${topo.i}:${j}`,
      kind: k,
      at: (j + 0.5 + (u01(runSeed, topo.i, j) - 0.5) * 0.4) / n,
      hpEq: GLINT_HP_EQ,
      goldX: k === 'gem' ? GOLD_X.glintGem : k === 'rich' ? GOLD_X.glintRich : GOLD_X.glintOre,
      gems: k === 'gem' ? 1 : 0,
    });
  }
  return out;
}

/** True when the seal opening biome k is closed in this build (the Root Knot in W1). */
export function sealClosed(k: number): boolean {
  return CLOSED_SEALS.includes(k);
}

/** Test and tool hook: forget the memoised layouts and classes (a different K table in a sweep). */
export function clearChartCaches(): void {
  layoutCache.clear();
  classCache.clear();
}
