// The shell's adapter between the model (1A: IdleState, nodeView, chamberView), the world layout (1B: NodePlacement,
// CampPlacement) and the scene (1C: DepthSource). Every method is cheap and pure over the state; placements are
// memoised per node by the world provider.
//
// Ids: the model keys a chamber's things by the template's local socket ids ('v0', 'l1', 'f0'); the scene and the
// picks use B's global ids (`${node}:${local}`), so two chambers on screen never share an id. `localId` maps back.

import type { IdleState } from '../../idle/model/state';
import { chamberView, contentsOf, nodeView, rideOf } from '../../idle/model/nodes';
import { nodeAt } from '../../idle/model/chart';
import { rowAt } from '../../idle/model/shaft';
import { COLS } from '../../idle/model/state';
import { biomeAt } from '../../idle/config/biomes';
import { cooldownLeft } from '../../idle/model/skills';
import type { ChamberView, DepthSource, FaceRow, FaceView } from '../../render/hybrid/source';
import type { PromiseClass, TappableKind } from '../../render/hybrid/types';
import type { CampPlacement, NodePlacement } from '../../world/hybrid/placement';

/** Where the world's placements come from (1B's layout; a test layout in Node). */
export interface WorldProvider {
  /** Node i placed (null when out of range or not generated). */
  placement(i: number): NodePlacement | null;
  /** The surface camp. */
  camp(): CampPlacement | null;
}

/** `${node}:${local}` (or the scene's nav form `n${node}:${local}`) → local (ids without a node prefix pass through). */
export function localId(id: string): string {
  const k = id.indexOf(':');
  if (k < 0) return id;
  const head = id.slice(0, k);
  return /^n?\d+$/.test(head) ? id.slice(k + 1) : id;
}

/** The node of a global id (-1 when it has none). */
export function nodeOfId(id: string): number {
  const k = id.indexOf(':');
  if (k < 0) return -1;
  const head = id.slice(0, k);
  return /^n?\d+$/.test(head) ? Number(head.replace(/^n/, '')) : -1;
}

export const globalId = (node: number, local: string): string => `${node}:${local}`;

/** The model's content kinds → the scene's tappable kinds ('rich' is a vein, a lamp is not a tappable). */
function tappableKindOf(kind: string): TappableKind | 'lamp' | 'litLamp' | 'skin' | null {
  switch (kind) {
    case 'vein':
    case 'rich':
      return 'vein';
    case 'gem':
      return 'gem';
    case 'geode':
      return 'geode';
    case 'stash':
      return 'stash';
    case 'secret':
      return 'secret';
    case 'chest':
      return 'chest';
    case 'relic':
      return 'relic';
    case 'note':
      return 'note';
    case 'mural':
      return 'mural';
    case 'keystone':
      return 'keystone';
    case 'depot':
      return 'depot';
    case 'lamp':
      return 'lamp';
    case 'litLamp':
      return 'litLamp';
    default:
      return null;
  }
}

export interface SourceDeps {
  state: () => IdleState;
  world: WorldProvider;
  /** The player is in the mine cart (the ride's kind is 'cart'). */
  inCart: () => boolean;
  /** The seal fight's HP and its weak point (null outside a seal). */
  seal: () => { left: number; weakLit: boolean } | null;
  /** The voxel ring to draw and pick and its light as the irradiance volume (null before the world exists). */
  voxels?: () => ReturnType<NonNullable<DepthSource['world']>>;
}

/** Build the scene's DepthSource over the live state. */
export function makeSource(d: SourceDeps): DepthSource {
  const rowsScratch: FaceRow[] = [];
  const chamberCache = new Map<number, { state: IdleState; view: ChamberView }>();
  const face = (): FaceView | null => {
    const s = d.state();
    const v = nodeView(s);
    if (!v.on || (v.phase !== 'dig' && v.phase !== 'camp')) return null;
    const p = d.world.placement(v.node);
    if (!p) return null;
    const t = v.topo;
    rowsScratch.length = 0;
    // The live rows from the front: the model's window (kinds and remaining fractions), up to 8 slices.
    for (let k = 0; k < 8; k++) {
      const depth = s.run.depth + k;
      if (depth >= t.depthTop + t.K) break;
      const r = rowAt(s, depth);
      if (!r) break;
      rowsScratch.push({ depth, kinds: r.kinds, left: r.left });
    }
    const con = contentsOf(s, Math.min(v.node, v.node));
    return {
      node: v.node,
      biome: t.biome,
      frame: p.drift.faceFrame,
      depth0: t.depthTop,
      K: t.K,
      rows: rowsScratch,
      promise: (con.promise as PromiseClass) ?? 'dull',
    };
  };
  const chamber = (i: number): ChamberView | null => {
    const s = d.state();
    const p = d.world.placement(i);
    if (!p) return null;
    const cached = chamberCache.get(i);
    if (cached && cached.state === s) return cached.view;
    const c = p.chamber;
    const model = () => chamberView(d.state(), i);
    const view: ChamberView = {
      node: i,
      biome: p.biome,
      template: c.template,
      box: c.box,
      stands: c.stands.map((st) => ({ id: st.id, pos: st.pos, yaw: st.yaw, pitch: st.pitch })),
      exits: c.exits.map((e) => ({ id: e.id, pos: e.pos, plate: e.plate, ride: e.ride, type: e.type })),
      sockets: c.sockets.map((so) => ({ id: so.id, kind: so.kind, pos: so.pos, normal: so.normal, bound: so.bound })),
      content: (id) => {
        // An empty socket answers 'sign' (drawn as nothing), not null: ChamberProps.build reads null as "no model" and
        // falls back to the placement's default (a vein, a lamp…), which drew props the model holds empty, so taps on
        // them did nothing (L2). 1C is asked to treat null as empty; until then 'sign' is the safe "nothing here".
        const m = model();
        const local = localId(id);
        if (!m) {
          // Closed (not yet broken into): what the run's contents will hold, so a dark mouth shows its silhouettes.
          const con = contentsOf(d.state(), i);
          const sc = con.sockets[local];
          return (sc ? tappableKindOf(sc.kind) : null) ?? 'sign';
        }
        const k = m.content(local);
        if (k === 'empty') return 'sign';
        return tappableKindOf(k) ?? 'sign';
      },
      left: (id) => {
        const m = model();
        return m ? m.left(localId(id)) : 1;
      },
      lit: (id) => {
        const m = model();
        return m ? m.lampLit(localId(id)) : false;
      },
      get seen() {
        return model()?.seen ?? false;
      },
      get charted() {
        return model()?.charted ?? false;
      },
    };
    chamberCache.set(i, { state: s, view });
    return view;
  };
  return {
    lifeSeed: () => d.state().seed,
    runSeed: () => d.state().runSeed,
    time: () => d.state().time,
    node: () => {
      const n = d.state().node;
      return { index: n.node, phase: n.phase === 'dig' ? 'drift' : n.phase, stand: n.stand };
    },
    face,
    chamber,
    crew: () => d.state().run.lines,
    pickLevel: () => d.state().run.pick,
    deepestBiome: () => biomeAt(d.state().run.dmax),
    combo: () => d.state().tap.combo,
    record: () => d.state().meta.record,
    fortune: () => {
      const g = d.state().meta.lifetime.gold;
      return g.isZero() ? 1 : Math.max(1, Math.floor(g.log10()) + 1);
    },
    dynamite: () => {
      const s = d.state();
      const left = cooldownLeft(s, 'dynamite');
      if (!Number.isFinite(left)) return null;
      return left <= 0 ? 1 : Math.max(0, 1 - left / 60);
    },
    glints: () => {
      const s = d.state();
      const r = s.node.ride;
      if (!r) return [];
      const p = d.world.placement(r.from);
      const exit = p?.chamber.exits[0];
      const mined = s.node.chambers[r.from]?.glints ?? [];
      const targets = rideOf(s, r.from);
      return targets.map((g, j) => {
        const pb = exit?.passBys?.[j];
        return { id: g.id, kind: g.kind === 'gem' ? ('crystal' as const) : ('ore' as const), pos: pb?.pos ?? { x: 0, y: 0, z: 0 }, left: mined.includes(g.id) ? 0 : 1 };
      });
    },
    inCart: () => d.inCart(),
    seal: () => d.seal(),
    placement: (i) => d.world.placement(i),
    camp: () => d.world.camp(),
    world: () => (d.voxels ? d.voxels() : null),
  };
}

/** The face's live row kinds for the debug surface (model order, the snake map's columns). */
export function frontRow(s: IdleState): { kinds: number[]; left: number[] } | null {
  const r = rowAt(s, s.run.depth);
  if (!r) return null;
  const kinds: number[] = [];
  const left: number[] = [];
  for (let c = 0; c < COLS; c++) {
    kinds.push(r.kinds[c]);
    left.push(r.left[c]);
  }
  return { kinds, left };
}

/** The player's node topology (re-exported for the shell). */
export const topoOf = (s: IdleState, i: number) => nodeAt(s.seed, i);
