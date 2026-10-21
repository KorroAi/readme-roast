// The W1 chamber templates as pure data (BUILD §2 `templateFor`), and the pick for a node: Topsoil's six authored rooms,
// the Glowroot Threshold, the Glowroot mini-kit (4 templates × 2 sub-zones, never the same template within 4 chambers),
// the Root Knot hall. The geometry of each lives in ./caverns (built once per node into a local grid).

import { nodeAt, type NodeTopo } from '../../../idle/model/chart';
import { GLOWROOT_KIT, type ExitType, type SocketInfo, type SocketKind, type StandInfo, type SubZone, type TemplateId, type TemplateInfo, type TemplateKind, type TopoLike } from './types';

/** Skin cells per chamber (SPEC §4.7: about 40). */
export const SKIN_CELLS = 40;

/** The socket ids every template carries (the model fills what its plan needs; the rest stay empty). */
export const SOCKET_PLAN: ReadonlyArray<{ kind: SocketKind; prefix: string; n: number }> = [
  { kind: 'vein', prefix: 'v', n: 9 },
  { kind: 'gem', prefix: 'g', n: 2 },
  { kind: 'stash', prefix: 's', n: 3 },
  { kind: 'lamp', prefix: 'l', n: 4 },
  { kind: 'feature', prefix: 'f', n: 2 },
  { kind: 'secret', prefix: 'x', n: 2 },
  { kind: 'cache', prefix: 'c', n: 2 },
];

/** The geometric spec of a template (sizes in metres; the builder in ./caverns honours them). */
export interface TemplateSpec {
  id: TemplateId;
  biome: number;
  kind: TemplateKind;
  label: string;
  /** Plan size: w across the entry (the template's v axis), d along the arrival direction (u), h the tallest clear. */
  w: number;
  d: number;
  h: number;
  levels: number;
  /** The exit floor relative to the entry floor (m, ≤ 0: the room descends to its exit). */
  exitDy: number;
  /** The lowest floor relative to the entry floor (m) and the highest ceiling above the entry floor (m). */
  lowDy: number;
  topDy: number;
  /** Way Down type out of this room ('closed' for the Root Knot in W1; 'hatch' for the Lift Bottom's seal). */
  exit: ExitType;
  /** Stands (arrival first) and which sockets each serves. */
  stands: StandInfo[];
  /** Arrives from above through a hatch (the Threshold under the Lift Bottom). */
  fromAbove?: boolean;
}

const all = (prefixes: string[]): string[] => {
  const out: string[] = [];
  for (const p of SOCKET_PLAN) if (prefixes.includes(p.prefix)) for (let j = 0; j < p.n; j++) out.push(`${p.prefix}${j}`);
  return out;
};

/** The specs. Sizes fit the spiral (layout.ts: across + K + along ≤ 54 m per side); heights fit the lap gap. */
export const TEMPLATE_SPECS: Readonly<Record<TemplateId, TemplateSpec>> = {
  'topsoil.rootCellar': {
    id: 'topsoil.rootCellar', biome: 0, kind: 'authored', label: 'The Root Cellar: a sky shaft through hanging roots onto Halden shelves',
    w: 18, d: 20, h: 7.5, levels: 2, exitDy: -3, lowDy: -3, topDy: 4.5, exit: 'ladder',
    stands: [{ id: 'st0', reachSockets: all(['f', 'v', 's']) }, { id: 'st1', reachSockets: all(['l', 'x', 'g']) }],
  },
  'topsoil.copperLode': {
    id: 'topsoil.copperLode', biome: 0, kind: 'authored', label: 'The Copper Lode: a broad copper vein across the right wall, a gem ledge, the cart platform',
    w: 20, d: 22, h: 11, levels: 3, exitDy: -3, lowDy: -3, topDy: 8, exit: 'cart',
    stands: [{ id: 'st0', reachSockets: all(['v']) }, { id: 'st1', reachSockets: all(['g', 'l', 's']) }],
  },
  'topsoil.lampRoom': {
    id: 'topsoil.lampRoom', biome: 0, kind: 'authored', label: 'The Halden Lamp Room: a lamp still burning on a crate, a note under it, two cold lamps',
    w: 18, d: 20, h: 9, levels: 2, exitDy: -2.5, lowDy: -2.5, topDy: 6.5, exit: 'ladder',
    stands: [{ id: 'st0', reachSockets: all(['f', 'l']) }, { id: 'st1', reachSockets: all(['l', 'v', 'x']) }],
  },
  'topsoil.reliquary': {
    id: 'topsoil.reliquary', biome: 0, kind: 'authored', label: 'The Reliquary niche: a relic on a plinth in a cyan-lit alcove up a stair',
    w: 16, d: 18, h: 10, levels: 2, exitDy: -2, lowDy: -2, topDy: 8, exit: 'stair',
    stands: [{ id: 'st0', reachSockets: all(['v', 's']) }, { id: 'st1', reachSockets: all(['f', 'l']) }],
  },
  'topsoil.cache': {
    id: 'topsoil.cache', biome: 0, kind: 'authored', label: 'The Cache: a chest among collapsed crates, green light leaking through floor cracks',
    w: 18, d: 18, h: 9, levels: 2, exitDy: -2, lowDy: -2, topDy: 7, exit: 'ladder',
    stands: [{ id: 'st0', reachSockets: all(['f', 'v']) }, { id: 'st1', reachSockets: all(['l', 'x', 's']) }],
  },
  'topsoil.liftBottom': {
    id: 'topsoil.liftBottom', biome: 0, kind: 'authored', label: 'The Lift Bottom: the dead hoist cage, chains, the Halden Hatch in the floor',
    w: 18, d: 18, h: 12, levels: 2, exitDy: 0, lowDy: -1.5, topDy: 10, exit: 'hatch',
    stands: [{ id: 'st0', reachSockets: all(['v', 's']) }, { id: 'st1', reachSockets: all(['f', 'l']) }],
  },
  'glowroot.threshold': {
    id: 'glowroot.threshold', biome: 1, kind: 'threshold', label: 'The Glowroot Threshold: a root balcony over a glowing gulf, the Other Lantern far below',
    w: 22, d: 26, h: 21, levels: 3, exitDy: -5, lowDy: -12, topDy: 9, exit: 'chute', fromAbove: true,
    stands: [{ id: 'st0', reachSockets: all(['l', 'v']) }, { id: 'st1', reachSockets: all(['g', 's', 'f']) }],
  },
  'glowroot.rootHall': {
    id: 'glowroot.rootHall', biome: 1, kind: 'trunk', label: 'A Root Hall: a tall rounded hall, a root chandelier, a second stand up a root stair',
    w: 20, d: 22, h: 13, levels: 3, exitDy: -3, lowDy: -3, topDy: 10, exit: 'chute',
    stands: [{ id: 'st0', reachSockets: all(['v', 's']) }, { id: 'st1', reachSockets: all(['g', 'l', 'f']) }, { id: 'st2', reachSockets: all(['x']) }],
  },
  'glowroot.glowGallery': {
    id: 'glowroot.glowGallery', biome: 1, kind: 'trunk', label: 'A Glow Gallery: a long gallery with glowroot seams and a ledge walk',
    w: 16, d: 24, h: 10, levels: 2, exitDy: -2.5, lowDy: -2.5, topDy: 7.5, exit: 'chute',
    stands: [{ id: 'st0', reachSockets: all(['v', 'l']) }, { id: 'st1', reachSockets: all(['g', 'f', 's']) }],
  },
  'glowroot.mirrorPool': {
    id: 'glowroot.mirrorPool', biome: 1, kind: 'trunk', label: 'A Mirror Pool: a dark pool under a root bridge, an island shrine',
    w: 20, d: 20, h: 11, levels: 2, exitDy: -2, lowDy: -3, topDy: 8, exit: 'chute',
    stands: [{ id: 'st0', reachSockets: all(['v', 'l']) }, { id: 'st1', reachSockets: all(['f', 'g', 's']) }],
  },
  'glowroot.curtainRift': {
    id: 'glowroot.curtainRift', biome: 1, kind: 'trunk', label: 'A Curtain Rift: a narrow tall rift behind root curtains, side alcoves',
    w: 16, d: 22, h: 14, levels: 3, exitDy: -3.5, lowDy: -3.5, topDy: 10, exit: 'chute',
    stands: [{ id: 'st0', reachSockets: all(['v', 's']) }, { id: 'st1', reachSockets: all(['l', 'g', 'f']) }],
  },
  'glowroot.rootKnot': {
    id: 'glowroot.rootKnot', biome: 1, kind: 'sealHall', label: 'The Root Knot hall: three amber knots in a root wall (opens in the next build)',
    w: 20, d: 20, h: 12, levels: 2, exitDy: 0, lowDy: -1.5, topDy: 10, exit: 'closed',
    stands: [{ id: 'st0', reachSockets: all(['v', 'l']) }, { id: 'st1', reachSockets: all(['f', 'g', 's']) }],
  },
};

/** Ids of every socket of a template, in a stable order, with their default mounts and levels (the builder places them). */
function socketsOf(): SocketInfo[] {
  const out: SocketInfo[] = [];
  for (const p of SOCKET_PLAN)
    for (let j = 0; j < p.n; j++) {
      const id = `${p.prefix}${j}`;
      const mount = p.kind === 'vein' || p.kind === 'skin' ? 'wall' : p.kind === 'lamp' ? 'post' : p.kind === 'feature' ? 'crate' : p.kind === 'gem' ? 'ledge' : p.kind === 'secret' ? 'wall' : p.kind === 'cache' ? 'niche' : 'wall';
      const s: SocketInfo = { id, kind: p.kind, mount, level: 0 };
      if (p.kind === 'secret') {
        s.reveals = [`c${j}`];
        s.secretKind = j === 0 ? 'crack' : 'brick';
      }
      if (p.kind === 'cache') {
        s.hidden = true;
        s.reveals = [`x${j}`];
      }
      out.push(s);
    }
  return out;
}

/** The TemplateInfo of a template id (pure data; the geometry is ./caverns'). */
export function templateInfo(id: TemplateId, subZone: SubZone = 'authored'): TemplateInfo {
  const spec = TEMPLATE_SPECS[id];
  const allS = socketsOf();
  const pick = (k: SocketKind) => allS.filter((s) => s.kind === k).map((s) => s.id);
  const skin = Array.from({ length: SKIN_CELLS }, (_, j) => `k${j}`);
  return {
    id,
    biome: spec.biome,
    kind: spec.kind,
    subZone,
    all: allS,
    sockets: {
      veins: pick('vein'),
      gems: pick('gem'),
      lamps: pick('lamp'),
      feature: pick('feature'),
      stash: pick('stash'),
      keystone: [],
      secret: pick('secret'),
      cache: pick('cache'),
      skin,
      note: [],
    },
    stands: spec.stands.map((s) => ({ id: s.id, reachSockets: [...s.reachSockets] })),
    exits: [{ id: 'e0', type: spec.exit, to: spec.exit === 'closed' ? -1 : -2 }],
    size: { w: spec.w, d: spec.d, h: spec.h },
    levels: spec.levels,
    label: spec.label,
  };
}

const hash = (a: number, b: number, c: number): number => {
  let h = (a ^ 0x2545f491) >>> 0;
  h = Math.imul(h ^ (b | 0), 0x9e3779b1) >>> 0;
  h = Math.imul(h ^ (c | 0), 0x85ebca77) >>> 0;
  h ^= h >>> 15;
  h = Math.imul(h, 0xc2b2ae3d) >>> 0;
  return (h ^ (h >>> 13)) >>> 0;
};

/** The topology fields templateFor reads (1A's NodeTopo passes as is). */
export type TopoForTemplate = TopoLike & Partial<Pick<NodeTopo, 'fixed' | 'zone' | 'inBiome'>>;

const pickMemo = new Map<number, TemplateId[]>();

/**
 * The template of a node (BUILD §2, pure, lifetime-seeded): the authored room for Topsoil, the Threshold and the Seal
 * hall of Glowroot, else a mini-kit template that did not appear in the 3 chambers before it (U-W6), preferring the
 * Root Hall for landmarks and the Vista slot. `prev` lists the template ids of the preceding nodes (for the
 * anti-repetition), newest last; the layout passes it, a lone call recomputes it from `topoAt`.
 */
export function templateFor(lifeSeed: number, topo: TopoForTemplate, prev?: ReadonlyArray<TemplateId>): TemplateInfo {
  const id = prev ? templateIdFor(lifeSeed, topo, prev) : templateSequence(lifeSeed, topo.i + 1, (i) => (i === topo.i ? topo : nodeAt(lifeSeed, i)))[topo.i];
  const zone: SubZone = topo.biome === 0 ? 'authored' : (topo.zone ?? 0) >= 1 ? 'galleries' : 'cellars';
  return templateInfo(id, zone);
}

/** The template id of a node (see templateFor). */
export function templateIdFor(lifeSeed: number, topo: TopoForTemplate, prev: ReadonlyArray<TemplateId> = []): TemplateId {
  if (topo.fixed && topo.fixed in TEMPLATE_SPECS) return topo.fixed as TemplateId;
  if (topo.biome === 0) {
    const order: TemplateId[] = ['topsoil.rootCellar', 'topsoil.copperLode', 'topsoil.lampRoom', 'topsoil.reliquary', 'topsoil.cache', 'topsoil.liftBottom'];
    return order[Math.min(order.length - 1, Math.max(0, topo.inBiome ?? topo.i))];
  }
  if (topo.kind === 'threshold') return 'glowroot.threshold';
  if (topo.kind === 'sealHall') return 'glowroot.rootKnot';
  const recent = prev.slice(-3);
  const allowed = GLOWROOT_KIT.filter((t) => !recent.includes(t));
  const pool = allowed.length ? allowed : GLOWROOT_KIT.slice();
  if ((topo.kind === 'landmark' || topo.kind === 'vista') && pool.includes('glowroot.rootHall')) return 'glowroot.rootHall';
  const ranked = pool.slice().sort((a, b) => hash(lifeSeed, topo.i, GLOWROOT_KIT.indexOf(a)) - hash(lifeSeed, topo.i, GLOWROOT_KIT.indexOf(b)));
  return ranked[0];
}

/** Template ids for nodes 0..n−1 (memoised per life seed): the layout's and the tests' sequence. */
export function templateSequence(lifeSeed: number, n: number, topoAt: (i: number) => TopoForTemplate): TemplateId[] {
  let seq = pickMemo.get(lifeSeed >>> 0);
  if (!seq) {
    seq = [];
    pickMemo.set(lifeSeed >>> 0, seq);
    if (pickMemo.size > 8) pickMemo.delete(pickMemo.keys().next().value as number);
  }
  while (seq.length < n) seq.push(templateIdFor(lifeSeed, topoAt(seq.length), seq));
  return seq.slice(0, n);
}
