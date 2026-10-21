// Node placement on the square spiral (SPEC §4.10, W1-LEAD §3; BUILD §2 `placeNode(lifeSeed, topo, template)`).
//
// The trunk turns at every chamber: chambers sit at the four corners of the 64 × 64 m footprint (corner c's arriving
// heading is H[c]; its exit leaves along H[c + 1], to the viewer's right), drifts run along the sides on a ring 8 m
// inside the footprint's edge, and a lap is 4 nodes. A drift's stub (where you stand to dig) lies under the previous
// chamber's exit; the Way Down (ladder, stair, chute, the Copper Lode's cart run) drops 5–9 m to it, as much as the lap
// gap needs: every volume keeps ≥ 12 m of rock above anything of an earlier lap below it. The Glowroot Threshold sits
// under the Lift Bottom's hatch at the same corner. Pure and memoised per life seed.

import { SOLID } from '../../config/blocks';
import { nodeAt, type NodeTopo } from '../../idle/model/chart';
import { VOXEL, mid, v3, type Box3, type V3 } from './grid';
import type { Dress, ExitType, TemplateId, WorldLight } from './kits/types';
import { TEMPLATE_SPECS, templateInfo, templateSequence, type TemplateSpec } from './kits/templates';
import { buildChamber, type BuildInput, type ChamberGeom } from './caverns/build';
import type { L3 } from './caverns/local';
import type { CampPlacement, ChamberPlacement, DriftPlacement, ExitPlaced, NodePlacement, SocketPlaced, StandPlaced } from './placement';
import { cartRun, type CartRun } from './rails';

/** Footprint margin (m): chambers keep this much rock to the footprint's edge. */
export const MARGIN = 1.5;
/** The drift ring: drifts run this far (m) from the chambers' outer walls (8 m from the footprint's edge). */
export const RING_E = 6.5;
/** Tube size (m). */
export const TUBE_W = 3.5;
export const TUBE_H = 3.0;
/** The Dig pose: eye 1.6 m, 3.0 m from the face, pitch −8° (SPEC §3.1). */
export const EYE = 1.6;
export const STANDOFF = 3.0;
export const DIG_PITCH = (-8 * Math.PI) / 180;
/** The stub behind the Dig pose (m): the Way Down lands here. */
export const STUB = 4.0;
/** Rock between laps (SPEC §4.10). */
export const LAP_GAP = 12;
/** The camp quarry floor (m). */
export const CAMP_FLOOR = -6;

/** Arriving headings per corner (the trunk turns right at every chamber). */
export const HEADINGS: ReadonlyArray<V3> = [v3(1, 0, 0), v3(0, 0, 1), v3(-1, 0, 0), v3(0, 0, -1)];

/** The Way Down's minimum drop per type (m). */
const MIN_DROP: Record<ExitType, number> = { ladder: 5, rope: 5, stair: 5, chute: 5, cart: 7, hatch: 3.5, closed: 5 };

/** The frame of a corner: local (u, v, y) → world. */
export interface CornerFrame {
  corner: number;
  f: V3;
  r: V3;
  /** World position of local (0, 0, 0) (its y is the entry floor). */
  o: V3;
}

export function toWorld(fr: CornerFrame, p: L3): V3 {
  return { x: fr.o.x + p.u * fr.f.x + p.v * fr.r.x, y: fr.o.y + p.y, z: fr.o.z + p.u * fr.f.z + p.v * fr.r.z };
}

export function dirWorld(fr: CornerFrame, d: { u: number; v: number; y?: number }): V3 {
  return { x: d.u * fr.f.x + d.v * fr.r.x, y: d.y ?? 0, z: d.u * fr.f.z + d.v * fr.r.z };
}

/** Yaw of a world direction (render/hybrid/types.ts CameraPose: yaw 0 looks along −z, +yaw turns toward −x). */
export function yawOf(d: { x: number; z: number }): number {
  return Math.atan2(-d.x, -d.z);
}

/** The corner frame of a chamber with plan size (w, d): outer walls on the footprint's margins. */
export function cornerFrame(corner: number, w: number, d: number, floorY: number): CornerFrame {
  const f = HEADINGS[corner & 3];
  const r = HEADINGS[(corner + 1) & 3];
  const axis = (dir: V3, along: number, isF: boolean) => {
    // isF: u = d lies on the far margin; else v = 0 lies on the near (outer) margin.
    const s = dir.x !== 0 ? dir.x : dir.z;
    if (isF) return s > 0 ? 64 - MARGIN - along : MARGIN + along;
    return s > 0 ? MARGIN : 64 - MARGIN;
  };
  const o = { x: 0, y: floorY, z: 0 };
  if (f.x !== 0) o.x = axis(f, d, true);
  else o.z = axis(f, d, true);
  if (r.x !== 0) o.x = axis(r, w, false);
  else o.z = axis(r, w, false);
  return { corner: corner & 3, f, r, o };
}

const boxOf = (pts: ReadonlyArray<V3>, pad = 0): Box3 => {
  const min = v3(Infinity, Infinity, Infinity);
  const max = v3(-Infinity, -Infinity, -Infinity);
  for (const p of pts) {
    min.x = Math.min(min.x, p.x);
    min.y = Math.min(min.y, p.y);
    min.z = Math.min(min.z, p.z);
    max.x = Math.max(max.x, p.x);
    max.y = Math.max(max.y, p.y);
    max.z = Math.max(max.z, p.z);
  }
  return { min: v3(min.x - pad, min.y - pad, min.z - pad), max: v3(max.x + pad, max.y + pad, max.z + pad) };
};

/** A world box from a local one in a frame. */
export function localBox(fr: CornerFrame, a: L3, b: L3): Box3 {
  return boxOf([toWorld(fr, a), toWorld(fr, b)]);
}

/** Plan (x, z) overlap of two boxes, inflated by `pad`. */
export function planOverlap(a: Box3, b: Box3, pad = 0): boolean {
  return a.min.x < b.max.x + pad && b.min.x < a.max.x + pad && a.min.z < b.max.z + pad && b.min.z < a.max.z + pad;
}

/** What the layout decided for a node before the chamber geometry is built. */
export interface NodeFrame {
  node: number;
  topo: NodeTopo;
  template: TemplateId;
  spec: TemplateSpec;
  corner: number;
  lap: number;
  w: number;
  d: number;
  /** The chamber's frame (local y 0 = its entry floor). */
  frame: CornerFrame;
  /** The drift: stub back (landing), face start (slice 0's front plane centre on the floor), direction. */
  landing: V3;
  face: V3;
  dir: V3;
  /** The exit in the chamber's local frame (set when the next node is placed). */
  exit: BuildInput['exit'];
  /** The Way Down: the next node's landing (world) and the drop. */
  drop: number;
  /** Volumes for the overlap and lap-gap rules (world boxes). */
  volumes: Box3[];
  /** Entry from above (the Threshold) at local (u, v). */
  fromAbove?: { u: number; v: number };
  /** The local v of the Way Down's top (the ladder hole, the stair head): inside the room, or beyond its right wall at
   *  the end of the exit passage. */
  holeV: number;
  /** The Copper Lode's cart run (exit type 'cart'). */
  cart?: CartRun;
}

interface LayoutState {
  frames: NodeFrame[];
  templates: TemplateId[];
  camp: CampPlacement | null;
  campFrame: CornerFrame;
  campW: number;
  campD: number;
  geoms: Map<number, ChamberGeom>;
  placed: Map<number, NodePlacement>;
}

const states = new Map<string, LayoutState>();

function stateFor(lifeSeed: number, runSeed: number): LayoutState {
  const key = `${lifeSeed >>> 0}:${runSeed >>> 0}`;
  let s = states.get(key);
  if (!s) {
    const campW = 32;
    const campD = 22;
    s = { frames: [], templates: [], camp: null, campFrame: cornerFrame(3, campW, campD, CAMP_FLOOR), campW, campD, geoms: new Map(), placed: new Map() };
    states.set(key, s);
    if (states.size > 6) states.delete(states.keys().next().value as string);
  }
  return s;
}

/** Forget memoised layouts (tests). */
export function clearLayoutCache(): void {
  states.clear();
}

/** The template of the stretch from `prev` (its across width) to `next` (its depth): fit the side (w + K + d ≤ 61). */
function sizeFor(spec: TemplateSpec): { w: number; d: number } {
  return { w: spec.w, d: spec.d };
}

/** The frames of nodes 0..i, the exit of node i settled (it needs node i + 1). Lifetime: no run seed involved. */
function frameAt(lifeSeed: number, s: LayoutState, i: number): NodeFrame {
  buildFrames(lifeSeed, s, i + 1);
  return s.frames[i];
}

function buildFrames(lifeSeed: number, s: LayoutState, upTo: number): void {
  while (s.frames.length <= upTo) {
    const n = s.frames.length;
    const topo = nodeAt(lifeSeed, n);
    if (s.templates.length <= n) s.templates = templateSequence(lifeSeed, n + 8, (k) => nodeAt(lifeSeed, k));
    const tid = s.templates[n];
    const spec = TEMPLATE_SPECS[tid];
    const prev = s.frames[n - 1];
    const { w, d } = sizeFor(spec);
    let corner: number;
    let lap: number;
    if (n === 0) {
      corner = 0;
      lap = 0;
    } else if (spec.fromAbove && prev && prev.spec.exit === 'hatch') {
      corner = prev.corner;
      lap = prev.lap;
    } else {
      corner = (prev.corner + 1) & 3;
      lap = prev.lap + (corner === 0 ? 1 : 0);
    }
    const f = HEADINGS[corner];
    const fr0 = cornerFrame(corner, w, d, 0);
    const entry = toWorld(fr0, { u: 0, y: 0, v: RING_E });
    let landing: V3;
    let face: V3;
    let fromAbove: { u: number; v: number } | undefined;
    if (spec.fromAbove && prev && prev.spec.exit === 'hatch') {
      const hatch = toWorld(prev.frame, { u: prev.exit.u, y: prev.exit.dy, v: prev.exit.v });
      fromAbove = { u: (hatch.x - fr0.o.x) * fr0.f.x + (hatch.z - fr0.o.z) * fr0.f.z, v: (hatch.x - fr0.o.x) * fr0.r.x + (hatch.z - fr0.o.z) * fr0.r.z };
      face = { ...hatch };
      landing = { ...hatch };
    } else {
      face = { x: entry.x - f.x * topo.K, y: 0, z: entry.z - f.z * topo.K };
      landing = { x: face.x - f.x * STUB, y: 0, z: face.z - f.z * STUB };
    }
    let entryFloor = CAMP_FLOOR;
    if (n > 0) {
      const pf = prev.frame;
      const exitType = prev.spec.exit;
      const prevExitY = pf.o.y + (exitType === 'hatch' ? prev.exit.dy : prev.spec.exitDy);
      let drop = fromAbove ? 3.5 : MIN_DROP[exitType];
      const vols = volumesFor(spec, fr0, landing, face, topo.K, fromAbove);
      for (let guard = 0; guard < 60; guard++) {
        const y = prevExitY - drop;
        let need = 0;
        const test = (ov: Box3) => {
          for (const v of vols) {
            const lo = v.min.y + y;
            const hi = v.max.y + y;
            if (!planOverlap(v, ov, 0.5)) continue;
            if (lo >= ov.max.y + LAP_GAP) continue; // far above (cannot happen going down, but keep it exact)
            if (hi <= ov.min.y - LAP_GAP) continue;
            need = Math.max(need, hi - (ov.min.y - LAP_GAP));
          }
        };
        for (let k = 0; k < n - 1; k++) for (const ov of s.frames[k].volumes) test(ov);
        if (lap === 0 || (lap === 1 && corner === 3) || n < 8) test({ min: v3(MARGIN, CAMP_FLOOR - 1, MARGIN), max: v3(MARGIN + s.campW, 0, MARGIN + s.campD) });
        if (need <= 1e-6) break;
        drop += Math.max(0.5, Math.ceil(need * 2) / 2);
      }
      prev.drop = drop;
      entryFloor = Math.round((prevExitY - drop) * 2) / 2;
      if (exitType !== 'hatch') {
        // The previous chamber's exit: the top of the Way Down. A ladder (rope, cart platform) drops straight down onto
        // the landing; a stair or chute runs down 45° toward it, so its top lies `drop` m further back.
        const run = exitType === 'stair' || exitType === 'chute' ? drop : 0;
        let top = { x: landing.x - f.x * run, z: landing.z - f.z * run };
        if (exitType === 'cart') {
          // The cart platform just outside the room's right wall, on the next drift's line.
          const wall = { x: pf.o.x + pf.r.x * (prev.w + 0.5), z: pf.o.z + pf.r.z * (prev.w + 0.5) };
          top = { x: f.x !== 0 ? wall.x : landing.x, z: f.z !== 0 ? wall.z : landing.z };
        }
        const lu = (top.x - pf.o.x) * pf.f.x + (top.z - pf.o.z) * pf.f.z;
        const lv = (top.x - pf.o.x) * pf.r.x + (top.z - pf.o.z) * pf.r.z;
        if (exitType === 'cart') {
          const ef = Math.round((prevExitY - drop) * 2) / 2;
          prev.cart = cartRun(prev.node, { x: top.x, y: prevExitY, z: top.z }, { x: landing.x, y: ef, z: landing.z }, { x: 32, z: 32 });
          prev.volumes.push(prev.cart.volume);
        }
        const inside = lv <= prev.w - 2.0;
        prev.exit = { u: lu, v: inside ? lv : prev.w - 1.75, dy: prev.spec.exitDy, through: !inside, type: exitType };
        prev.holeV = lv;
        // The exit passage and the Way Down join the previous node's volumes (later laps keep their gap to them).
        const exitTop = prev.spec.exitDy;
        const bottomY = entryFloor - pf.o.y;
        prev.volumes.push(localBox(pf, { u: lu - 2, y: bottomY - 0.5, v: Math.min(lv, prev.w - 2.5) - 1 }, { u: lu + 2, y: exitTop + 3.5, v: lv + 1.5 }));
      }
    }
    const fr = cornerFrame(corner, w, d, entryFloor);
    landing = { ...landing, y: entryFloor };
    face = { ...face, y: entryFloor };
    const volumes = volumesFor(spec, fr0, landing, face, topo.K, fromAbove).map((b) => ({ min: { ...b.min, y: b.min.y + entryFloor }, max: { ...b.max, y: b.max.y + entryFloor } }));
    // A default exit until the next node settles it (a hatch is the room's own: under the middle of the room).
    const exit: BuildInput['exit'] =
      spec.exit === 'hatch'
        ? { u: d * 0.62, v: w * 0.45, dy: 0, through: false, type: 'hatch' }
        : { u: d - RING_E, v: w - 1.75, dy: spec.exitDy, through: true, type: spec.exit };
    s.frames.push({ node: n, topo, template: tid, spec, corner, lap, w, d, frame: fr, landing, face, dir: { ...f }, exit, drop: MIN_DROP[spec.exit], volumes, fromAbove, holeV: exit.v });
  }
}

/** The volumes of a node relative to its entry floor (y 0): chamber box, stub and slices, the sky shaft. */
function volumesFor(spec: TemplateSpec, fr: CornerFrame, landing: V3, face: V3, K: number, fromAbove?: { u: number; v: number }): Box3[] {
  const out: Box3[] = [];
  // The chamber's grid reaches 1 m behind the entry wall, 1.5 m past the outer walls and 3 m past the right wall
  // (caverns/build.ts): its volume is the grid's, so secrets and alcoves keep the lap gap too.
  out.push(localBox(fr, { u: -0.5, y: spec.lowDy - 1.5, v: -1.5 }, { u: spec.d + 1.5, y: spec.topDy + 1.5, v: spec.w + 3 }));
  if (!fromAbove) {
    const f = { x: Math.sign(face.x - landing.x), z: Math.sign(face.z - landing.z) };
    const half = TUBE_W / 2;
    const ends = [
      { x: landing.x, y: -0.5, z: landing.z },
      { x: face.x + f.x * K, y: TUBE_H + 0.5, z: face.z + f.z * K },
    ];
    const side = { x: f.z !== 0 ? half : 0, z: f.x !== 0 ? half : 0 };
    out.push(boxOf([
      { x: ends[0].x - side.x, y: ends[0].y, z: ends[0].z - side.z },
      { x: ends[1].x + side.x, y: ends[1].y, z: ends[1].z + side.z },
    ]));
  }
  if (spec.id === 'topsoil.rootCellar') {
    // The sky shaft to the surface.
    const c = toWorld(fr, { u: spec.d * 0.62, y: 0, v: spec.w * 0.52 });
    out.push({ min: v3(c.x - 1.5, spec.topDy, c.z - 1.5), max: v3(c.x + 1.5, 40, c.z + 1.5) });
  }
  return out;
}

// ------------------------------------------------------------------------------------------------- placement

/** The chamber geometry of node i (built once per life/run seed pair). */
export function chamberGeom(lifeSeed: number, runSeed: number, i: number): ChamberGeom {
  const s = stateFor(lifeSeed, runSeed);
  let g = s.geoms.get(i);
  if (!g) {
    const fr = frameAt(lifeSeed, s, i);
    g = buildChamber(buildInputFor(fr, lifeSeed, runSeed, i > 0 ? s.frames[i - 1] : undefined));
    s.geoms.set(i, g);
  }
  return g;
}

/** The builder input of a node frame. */
export function buildInputFor(fr: NodeFrame, lifeSeed: number, runSeed: number, prev?: NodeFrame): BuildInput {
  const surfaceDy = fr.frame.o.y > -20 ? -fr.frame.o.y : undefined;
  let above: BuildInput['above'];
  if (fr.fromAbove && prev) {
    const pg = chamberGeom(lifeSeed, runSeed, prev.node);
    const g = pg.grid;
    above = {
      floorAt: (u: number, v: number) => {
        const p = toWorld(fr.frame, { u, y: 0, v });
        const pu = (p.x - prev.frame.o.x) * prev.frame.f.x + (p.z - prev.frame.o.z) * prev.frame.f.z;
        const pv = (p.x - prev.frame.o.x) * prev.frame.r.x + (p.z - prev.frame.o.z) * prev.frame.r.z;
        let lo = Infinity;
        // The previous node's drift (its stub and slices) runs in above too.
        const tube = { min: { x: 0, y: 0, z: 0 }, max: { x: 0, y: 0, z: 0 } };
        const half = TUBE_W / 2 + 0.5;
        const fx = prev.dir;
        const a0 = { x: prev.landing.x - fx.x * 0.5, z: prev.landing.z - fx.z * 0.5 };
        const a1 = { x: prev.face.x + fx.x * (prev.topo.K + 0.5), z: prev.face.z + fx.z * (prev.topo.K + 0.5) };
        tube.min.x = Math.min(a0.x, a1.x) - (fx.z !== 0 ? half : 0);
        tube.max.x = Math.max(a0.x, a1.x) + (fx.z !== 0 ? half : 0);
        tube.min.z = Math.min(a0.z, a1.z) - (fx.x !== 0 ? half : 0);
        tube.max.z = Math.max(a0.z, a1.z) + (fx.x !== 0 ? half : 0);
        if (p.x >= tube.min.x && p.x <= tube.max.x && p.z >= tube.min.z && p.z <= tube.max.z) lo = prev.landing.y - 1.0 - fr.frame.o.y;
        const i = g.iu(pu);
        const k = g.iv(pv);
        if (!g.inside(i, 0, k)) return lo;
        for (let j = 0; j < g.ny; j++) if (!SOLID[g.get(i, j, k)]) return Math.min(lo, prev.frame.o.y + g.fy(j) - fr.frame.o.y);
        return lo;
      },
    };
  }
  return {
    id: fr.template,
    w: fr.w,
    d: fr.d,
    entryV: RING_E,
    exit: fr.exit,
    fromAbove: fr.fromAbove,
    surfaceDy,
    above,
    biome: fr.spec.biome === 0 ? 0 : Math.max(1, fr.topo.biome),
    subZone: fr.spec.biome === 0 ? 'authored' : fr.topo.zone >= 1 ? 'galleries' : 'cellars',
    lifeSeed,
    runSeed,
    node: fr.node,
  };
}

/** The frame of node i (lifetime layout; tests and the stamp read it). */
export function nodeFrame(lifeSeed: number, i: number, runSeed = 0): NodeFrame {
  return frameAt(lifeSeed, stateFor(lifeSeed, runSeed), i);
}

/**
 * BUILD §2: the placed node: the drift (its stub, slices and face frame, the Dig pose), the chamber (its box,
 * volumes, stands, exits with their rides, sockets, dressing, lights, links, blockers). `topo` and `template` are the
 * chart's and templateFor's (the layout recomputes both from the seed and checks they agree).
 */
export function placeNode(lifeSeed: number, topo: Pick<NodeTopo, 'i'>, _template?: unknown, runSeed = 0): NodePlacement {
  const s = stateFor(lifeSeed, runSeed);
  const hit = s.placed.get(topo.i);
  if (hit) return hit;
  const fr = frameAt(lifeSeed, s, topo.i);
  const g = chamberGeom(lifeSeed, runSeed, topo.i);
  const next = frameAt(lifeSeed, s, topo.i + 1);
  const p = assemble(fr, g, next, lifeSeed, runSeed);
  s.placed.set(topo.i, p);
  return p;
}

function assemble(fr: NodeFrame, g: ChamberGeom, next: NodeFrame, lifeSeed: number, runSeed: number): NodePlacement {
  const F = fr.frame;
  const W = (p: L3) => toWorld(F, p);
  const N = (n: L3) => dirWorld(F, { u: n.u, v: n.v, y: n.y });
  const node = fr.node;
  // ---- the drift
  const f = fr.dir;
  const up = v3(0, 1, 0);
  const isSealDrift = !!fr.fromAbove;
  const standEye = isSealDrift ? v3(fr.face.x - 2.4, fr.face.y + 3.5 + EYE, fr.face.z) : v3(fr.face.x - f.x * STANDOFF, fr.face.y + EYE, fr.face.z - f.z * STANDOFF);
  const half = TUBE_W / 2;
  const side = v3(f.z !== 0 ? half : 0, 0, f.x !== 0 ? half : 0);
  const slices: Box3[] = [];
  for (let k = 0; k < fr.topo.K && !isSealDrift; k++) {
    const a = v3(fr.face.x + f.x * k, fr.face.y, fr.face.z + f.z * k);
    const b = v3(fr.face.x + f.x * (k + 1), fr.face.y + TUBE_H, fr.face.z + f.z * (k + 1));
    slices.push(boxOf([v3(a.x - side.x, a.y, a.z - side.z), v3(b.x + side.x, b.y, b.z + side.z)]));
  }
  const stub = boxOf([v3(fr.landing.x - side.x, fr.landing.y, fr.landing.z - side.z), v3(fr.face.x + side.x, fr.face.y + TUBE_H, fr.face.z + side.z)]);
  const driftDress: Dress[] = [];
  const driftLights: WorldLight[] = [];
  if (!isSealDrift) {
    const total = STUB + fr.topo.K;
    for (let t = 0.6; t < total; t += 2.5) {
      const p = v3(fr.landing.x + f.x * t, fr.landing.y, fr.landing.z + f.z * t);
      driftDress.push({ kind: 'timberSet', pos: p, rotY: yawOf(f), scale: 1, seed: (node * 131 + Math.round(t * 10)) | 0, size: v3(TUBE_W - 0.2, TUBE_H, 0.35) });
    }
    for (let t = 0.3; t < total; t += 0.6) driftDress.push({ kind: 'sleeper', pos: v3(fr.landing.x + f.x * t, fr.landing.y, fr.landing.z + f.z * t), rotY: yawOf(f), scale: 1, seed: (node * 977 + Math.round(t * 10)) | 0 });
    for (const sgn of [-1, 1])
      driftDress.push({ kind: 'rail', pos: v3(fr.landing.x + side.x * 0.34 * sgn, fr.landing.y, fr.landing.z + side.z * 0.34 * sgn), to: v3(fr.face.x + f.x * fr.topo.K + side.x * 0.34 * sgn, fr.face.y, fr.face.z + f.z * fr.topo.K + side.z * 0.34 * sgn), rotY: yawOf(f), scale: 1, seed: node * 7 + sgn });
    // The crew's lamp behind you, hung on the stub's first set.
    const lp = v3(fr.landing.x + f.x * 0.6 + side.x * 0.8, fr.landing.y + 2.4, fr.landing.z + f.z * 0.6 + side.z * 0.8);
    driftDress.push({ kind: 'crewLamp', pos: lp, rotY: yawOf(f), scale: 1, seed: node });
    driftLights.push({ id: `${node}:crew`, kind: 'crew', pos: lp, color: [1.0, 0.7, 0.36], radius: 6 });
  }
  const drift: DriftPlacement = {
    origin: { ...fr.landing },
    dir: isSealDrift ? v3(0, -1, 0) : { ...f },
    up: isSealDrift ? { ...F.f } : up,
    length: fr.topo.K,
    faceFrame: { origin: { ...fr.face }, dir: isSealDrift ? v3(0, -1, 0) : { ...f }, up: isSealDrift ? { ...F.f } : up },
    stand: { pos: standEye, yaw: isSealDrift ? yawOf(F.f) : yawOf(f), pitch: isSealDrift ? (-35 * Math.PI) / 180 : DIG_PITCH },
    stub,
    slices,
    width: TUBE_W,
    height: TUBE_H,
    dressing: driftDress,
    lights: driftLights,
  };
  // ---- the chamber
  const sockets: SocketPlaced[] = g.sockets.map((sk) => ({
    id: `${node}:${sk.id}`,
    local: sk.id,
    kind: sk.kind,
    mount: sk.mount,
    pos: W(sk.pos),
    normal: N(sk.normal),
    bound: { x: sk.bound.u, y: sk.bound.y, z: sk.bound.v },
    level: sk.level,
    approach: W(sk.approach),
    hidden: sk.hidden,
    lit: sk.lit,
    rich: sk.rich,
    secret: sk.secret ? { kind: sk.secret.kind, cells: sk.secret.cells.map((c) => worldCell(F, g, c)), reveals: sk.secret.reveals.map((r) => `${node}:${r}`) } : undefined,
    cell: sk.cell ? worldCell(F, g, sk.cell) : undefined,
  }));
  const stands: StandPlaced[] = g.stands.map((st) => {
    const feet = W(st.feet);
    const look = dirWorld(F, st.look);
    return { id: st.id, pos: v3(feet.x, feet.y + EYE, feet.z), yaw: yawOf(look), pitch: st.pitch, feet, facings: st.facings.map((fc) => ({ yaw: yawOf(dirWorld(F, fc)), pitch: fc.pitch })), reachSockets: st.reachSockets.map((id) => `${node}:${id}`) };
  });
  const exits: ExitPlaced[] = [exitPlaced(fr, g, next)];
  const lights: WorldLight[] = g.lights.map((l) => ({ id: `${node}:${l.id}`, kind: l.kind, pos: W(l.pos), color: l.color, radius: l.radius, cold: l.cold, socket: l.socket ? `${node}:${l.socket}` : undefined }));
  for (const sk of sockets) if (sk.kind === 'lamp') lights.push({ id: `${sk.id}:light`, kind: 'lamp', pos: v3(sk.pos.x, sk.pos.y + (sk.mount === 'post' ? 1.75 : 0.45), sk.pos.z), color: [1.0, 0.72, 0.42], radius: 7.5, cold: !sk.lit, socket: sk.id });
  const dressing: Dress[] = g.dressing.map((dl) => ({
    kind: dl.kind,
    pos: W(dl.pos),
    to: dl.to ? W(dl.to) : undefined,
    normal: dl.normal ? N(dl.normal) : undefined,
    size: dl.size ? { x: dl.size.u, y: dl.size.y, z: dl.size.v } : undefined,
    rotY: dl.face ? yawOf(dirWorld(F, dl.face)) : (dl.seed % 628) / 100,
    scale: dl.scale,
    seed: dl.seed,
  }));
  if (fr.cart) {
    // The run's rails, sleepers, timber sets and two crew lamps.
    const rl = fr.cart.rail;
    for (let k = 0; k + 1 < rl.length; k += 3) {
      const a = rl[k];
      const b = rl[Math.min(rl.length - 1, k + 3)];
      const tx = b.x - a.x;
      const tz = b.z - a.z;
      const tl = Math.hypot(tx, tz) || 1;
      const sx = -tz / tl;
      const sz = tx / tl;
      for (const sg of [-0.6, 0.6]) dressing.push({ kind: 'rail', pos: v3(a.x + sx * sg, a.y, a.z + sz * sg), to: v3(b.x + sx * sg, b.y, b.z + sz * sg), rotY: yawOf({ x: tx, z: tz }), scale: 1, seed: node * 1000 + k });
      dressing.push({ kind: 'sleeper', pos: { ...a }, rotY: yawOf({ x: tx, z: tz }), scale: 1, seed: node * 1000 + k + 1 });
      if (k % 9 === 0) dressing.push({ kind: 'timberSet', pos: { ...a }, rotY: yawOf({ x: tx, z: tz }), scale: 1, seed: node * 1000 + k + 2, size: v3(3.0, 3.4, 0.35) });
    }
    const g0 = fr.cart.grotto.centre;
    lights.push({ id: `${node}:cartGrotto`, kind: 'crystal', pos: v3(g0.x, g0.y + 2.5, g0.z), color: [0.9, 0.62, 0.26], radius: 6 });
    lights.push({ id: `${node}:cartLamp`, kind: 'crew', pos: v3(rl[Math.floor(rl.length * 0.2)].x, rl[Math.floor(rl.length * 0.2)].y + 2.6, rl[Math.floor(rl.length * 0.2)].z), color: [1.0, 0.7, 0.36], radius: 6 });
  }
  // The box of the chamber's carved air (its alcoves and secrets included).
  const gg = g.grid;
  let a0 = { u: Infinity, y: Infinity, v: Infinity };
  let a1 = { u: -Infinity, y: -Infinity, v: -Infinity };
  for (let k = 0; k < gg.nv; k++)
    for (let j = 0; j < gg.ny; j++)
      for (let i = 0; i < gg.nu; i++) {
        if (SOLID[gg.data[gg.idx(i, j, k)]]) continue;
        const u = gg.cu(i);
        const y = gg.cy(j);
        const v = gg.cv(k);
        a0 = { u: Math.min(a0.u, u - 0.25), y: Math.min(a0.y, y - 0.25), v: Math.min(a0.v, v - 0.25) };
        a1 = { u: Math.max(a1.u, u + 0.25), y: Math.max(a1.y, y + 0.25), v: Math.max(a1.v, v + 0.25) };
      }
  const boxPts: V3[] = [W(a0), W(a1)];
  const chamber: ChamberPlacement = {
    template: fr.template,
    box: boxOf(boxPts),
    volumes: fr.volumes,
    entry: isSealDrift ? W({ u: fr.fromAbove!.u, y: 0, v: fr.fromAbove!.v }) : W({ u: 0, y: 0, v: RING_E }),
    floorY: F.o.y,
    stands,
    exits,
    sockets,
    dressing,
    lights,
    shafts: g.shafts.map((sh) => ({ id: `${node}:${sh.id}`, from: W(sh.from), to: W(sh.to), radius: sh.radius, color: sh.color })),
    links: g.links.map((l) => ({ a: W(l.a), b: W(l.b), kind: l.kind })),
    blockers: g.blockers.map((b) => ({ pos: W(b.pos), r: b.r })),
    fill: g.fill,
    anchors: Object.fromEntries(Object.entries(g.anchors).map(([k, a]) => [k, W(a)])),
  };
  void lifeSeed;
  void runSeed;
  return { node, biome: fr.topo.biome, lap: fr.lap, corner: fr.corner, depthTop: fr.topo.depthTop, K: fr.topo.K, drift, chamber };
}

/** World voxel of a local grid cell. */
export function worldCell(F: CornerFrame, g: ChamberGeom, c: [number, number, number]): [number, number, number] {
  const p = toWorld(F, { u: g.grid.cu(c[0]), y: g.grid.cy(c[1]), v: g.grid.cv(c[2]) });
  return [Math.floor(p.x / VOXEL), Math.floor(p.y / VOXEL), Math.floor(p.z / VOXEL)];
}

/** The exit and its Way Down ride: from the exit's approach to the next node's Dig pose. */
function exitPlaced(fr: NodeFrame, g: ChamberGeom, next: NodeFrame): ExitPlaced {
  const F = fr.frame;
  const e = fr.exit;
  const node = fr.node;
  const tap = toWorld(F, g.exitTap);
  const approach = toWorld(F, g.exitApproach);
  const plate = toWorld(F, { u: e.u, y: e.dy + 2.7, v: e.through ? fr.w - 0.4 : e.v + 1.6 });
  const to = fr.spec.exit === 'closed' ? -1 : node + 1;
  const ride: V3[] = [];
  const eye = (p: V3) => v3(p.x, p.y + EYE, p.z);
  ride.push(eye(approach));
  if (fr.spec.exit === 'hatch') {
    // The drop through the hatch onto the Threshold's balcony.
    const h = toWorld(F, { u: e.u, y: e.dy, v: e.v });
    ride.push(eye(h));
    ride.push(v3(h.x, next.frame.o.y + EYE, h.z));
  } else if (fr.spec.exit !== 'closed') {
    const holeTop = toWorld(F, { u: e.u, y: e.dy, v: e.through ? holeV(fr) : e.v });
    ride.push(eye(holeTop));
    const nf = next.dir;
    const bottom = v3(next.landing.x, next.landing.y, next.landing.z);
    if (fr.cart) {
      for (const q of fr.cart.ride) ride.push({ ...q });
    } else if (fr.spec.exit === 'stair' || fr.spec.exit === 'chute') {
      // A slope down to the landing (the stairwell is carved along the next drift's line).
      ride.push(eye(bottom));
    } else {
      ride.push(eye(v3(holeTop.x, bottom.y, holeTop.z)));
    }
    ride.push(v3(next.face.x - nf.x * STANDOFF, next.face.y + EYE, next.face.z - nf.z * STANDOFF));
  }
  const passBys = fr.cart ? fr.cart.passBys.map((q) => ({ ...q })) : undefined;
  return { id: `${node}:e0`, type: fr.spec.exit, pos: tap, plate, approach, yaw: yawOf(next.dir), ride, to, passBys };
}

/** The local v of the Way Down's top (inside the room, or at the passage's end beyond the right wall). */
export function holeV(fr: NodeFrame): number {
  return fr.holeV;
}

// ------------------------------------------------------------------------------------------------- the camp

/** The surface camp at dusk (lap 0, corner 3's region): the quarry floor, the adit into node 0's drift, the stations. */
export function placeCamp(lifeSeed: number, runSeed = 0): CampPlacement {
  const s = stateFor(lifeSeed, runSeed);
  if (s.camp) return s.camp;
  const n0 = frameAt(lifeSeed, s, 0);
  const fr = s.campFrame;
  const W = (u: number, y: number, v: number) => toWorld(fr, { u, y, v });
  // Camp frame: corner 3 (f = −z, r = +x); the adit is on its v = campW wall (east), at u where node 0's drift runs.
  const aditU = (n0.landing.z - fr.o.z) * fr.f.z;
  const adit = W(aditU, 0, s.campW - 1.5);
  const board = W(aditU - 4, 0, s.campW - 6);
  const lantern = W(aditU - 9, 0, s.campW - 10);
  const arrivalFeet = W(aditU, 0, s.campW - 12);
  const look = (from: V3, to: V3) => yawOf({ x: to.x - from.x, z: to.z - from.z });
  const dressing: Dress[] = [];
  const add = (kind: Dress['kind'], p: V3, yaw = 0, size?: V3) => dressing.push({ kind, pos: p, rotY: yaw, scale: 1, seed: dressing.length * 7919 + 13, size });
  add('timberSet', W(aditU, 0, s.campW - 0.5), look(arrivalFeet, adit), v3(3.6, 3.2, 0.5));
  add('signpost', W(aditU - 2.6, 0, s.campW - 2.5), 0);
  add('crateStack', W(aditU + 3, 0, s.campW - 3), 0, v3(1.4, 1.6, 1.2));
  add('barrel', W(aditU - 3.2, 0, s.campW - 4), 0);
  add('cart', W(aditU, 0, s.campW - 4.5), look(arrivalFeet, adit));
  add('lampPost', W(aditU + 2.4, 0, s.campW - 1.8), 0);
  const camp: CampPlacement = {
    box: localBox(fr, { u: 0, y: -1, v: 0 }, { u: s.campD, y: 8, v: s.campW }),
    floorY: CAMP_FLOOR,
    stations: [
      { id: 'adit', pos: v3(adit.x, adit.y + EYE, adit.z), feet: adit, yaw: look(arrivalFeet, adit), pitch: 0 },
      { id: 'board', pos: v3(board.x, board.y + EYE, board.z), feet: board, yaw: look(board, adit), pitch: 0 },
      { id: 'lantern', pos: v3(lantern.x, lantern.y + EYE, lantern.z), feet: lantern, yaw: look(lantern, adit), pitch: 0 },
    ],
    arrival: { pos: v3(arrivalFeet.x, arrivalFeet.y + EYE, arrivalFeet.z), yaw: look(arrivalFeet, adit), pitch: (4 * Math.PI) / 180 },
    dressing,
    lights: [{ id: 'camp:lamp', kind: 'camp', pos: W(aditU + 2.4, 2.4, s.campW - 1.8), color: [1.0, 0.72, 0.42], radius: 9 }],
    links: [],
    blockers: [],
  };
  s.camp = camp;
  return camp;
}

/** The camp's frame and size (nodeStamp carves the quarry). */
export function campFrame(lifeSeed: number, runSeed = 0): { frame: CornerFrame; w: number; d: number; aditU: number } {
  const s = stateFor(lifeSeed, runSeed);
  const n0 = frameAt(lifeSeed, s, 0);
  const fr = s.campFrame;
  return { frame: fr, w: s.campW, d: s.campD, aditU: (n0.landing.z - fr.o.z) * fr.f.z };
}

/** Nodes whose volumes intersect a world y band [y0, y1) (the slab generator's query). */
export function nodesInBand(lifeSeed: number, y0: number, y1: number, runSeed = 0, maxNode = 400): number[] {
  const s = stateFor(lifeSeed, runSeed);
  const out: number[] = [];
  for (let i = 0; i < maxNode; i++) {
    const fr = frameAt(lifeSeed, s, i);
    let lo = Infinity;
    let hi = -Infinity;
    for (const v of fr.volumes) {
      lo = Math.min(lo, v.min.y);
      hi = Math.max(hi, v.max.y);
    }
    // Include the Way Down down to the next node's landing.
    lo = Math.min(lo, fr.frame.o.y + fr.spec.exitDy - fr.drop - 1);
    if (hi >= y0 - 2 && lo < y1 + 2) out.push(i);
    if (hi < y0 - 80) break;
  }
  return out;
}

/** The template info of node i (pure data). */
export function templateOfNode(lifeSeed: number, i: number) {
  const fr = nodeFrame(lifeSeed, i);
  return templateInfo(fr.template, fr.spec.biome === 0 ? 'authored' : fr.topo.zone >= 1 ? 'galleries' : 'cellars');
}

/** A cell centre in metres (tests). */
export const cellMid = (i: number) => mid(i);

/**
 * Roads [W2] (SPEC §4.5, §4.10): the layout keeps room for the shared-node fallback (a second exit carved off the same
 * chamber, merging at a shared Way Down) rather than a parallel branch 12 m beside the trunk. This names it.
 */
export const ROAD_FALLBACK = 'sharedNode' as const;

/** The free bay a W2 second exit would use: 6 m beyond the chamber's inner (right) wall, near its entry end. */
export function roadBay(lifeSeed: number, i: number): Box3 {
  const fr = nodeFrame(lifeSeed, i);
  return localBox(fr.frame, { u: 1, y: Math.min(0, fr.spec.exitDy) - 0.5, v: fr.w + 0.5 }, { u: 7, y: 3.5, v: fr.w + 6 });
}
