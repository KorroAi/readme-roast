// The fill contract of SPEC §4.11, measured from WALKABLE POINTS (W1-LEAD §3: "the fill contract holds from every
// walkable point, not only from stands"). Pure over a DeepWorld whose ring holds the chamber (tools/fill-scan.ts and
// tests/unit/hybrid/fillStands.test.ts run it).

import { EMIT_B, EMIT_G, EMIT_R, SOLID, SLOT } from '../../config/blocks';
import type { DeepWorld } from './DeepWorld';
import { VOXEL, type V3 } from './grid';
import type { NodePlacement, SocketPlaced } from './placement';
import { REACH } from './kits/reach';

export interface FillReport {
  node: number;
  pass: boolean;
  lines: string[];
  /** The measured values (tests assert on them). */
  arrivalInFrame: number;
  rewardShare: number;
  warm: number;
  accent: number;
  wonderTop: boolean;
  emptyFloor: number;
  floating: number;
  wallCover: number;
  samples: number;
}

/** Strike and focus objects a player can act on (empty sockets are dressing; hidden caches wait for their secret). */
export function actable(p: NodePlacement): SocketPlaced[] {
  return p.chamber.sockets.filter((s) => !s.hidden && s.kind !== 'skin' && s.kind !== 'cache');
}

const HFOV = (52 * Math.PI) / 180;

/** Is p inside the portrait frustum of a pose (hFOV 52°, 390 × 844) within `maxD`, and in line of sight? */
export function inView(world: DeepWorld, eye: V3, yaw: number, pitch: number, p: V3, maxD = 20, normal?: V3): { x: number; y: number } | null {
  const cy = Math.cos(yaw);
  const sy = Math.sin(yaw);
  const cp = Math.cos(pitch);
  const sp = Math.sin(pitch);
  const fwd = { x: -sy * cp, y: sp, z: -cy * cp };
  const right = { x: cy, y: 0, z: -sy };
  const up = { x: right.y * fwd.z - right.z * fwd.y, y: right.z * fwd.x - right.x * fwd.z, z: right.x * fwd.y - right.y * fwd.x };
  const v = { x: p.x - eye.x, y: p.y - eye.y, z: p.z - eye.z };
  const d = Math.hypot(v.x, v.y, v.z);
  if (d > maxD) return null;
  const zf = v.x * fwd.x + v.y * fwd.y + v.z * fwd.z;
  if (zf <= 0.2) return null;
  const tx = Math.tan(HFOV / 2);
  const ty = tx * (844 / 390);
  const xr = (v.x * right.x + v.y * right.y + v.z * right.z) / zf / tx;
  const yu = (v.x * up.x + v.y * up.y + v.z * up.z) / zf / ty;
  if (Math.abs(xr) > 0.94 || yu > 0.7 || yu < -0.44) return null;
  if (!lineOfSight(world, eye, p, normal)) return null;
  return { x: (xr + 1) / 2, y: (1 - yu) / 2 };
}

/** No solid voxel between the eye and a point (the last 0.45 m in front of the surface is ignored). */
export function lineOfSight(world: DeepWorld, a: V3, p: V3, normal?: V3): boolean {
  const n = normal ?? { x: 0, y: 0, z: 0 };
  const b = { x: p.x + n.x * 0.35, y: p.y + n.y * 0.35, z: p.z + n.z * 0.35 };
  const d = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
  const steps = Math.ceil(d / (VOXEL * 0.5));
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    if (t * d > d - 0.45) break;
    const x = a.x + (b.x - a.x) * t;
    const y = a.y + (b.y - a.y) * t;
    const z = a.z + (b.z - a.z) * t;
    if (world.ring.solidAtM(x, y, z)) return false;
  }
  return true;
}

/** Scan one chamber (its slabs must be in the world's ring). */
export function scanChamber(world: DeepWorld, i: number, samples = 200): FillReport {
  const p = world.placement(i);
  const nav = world.nav(i);
  const lines: string[] = [];
  const rep: FillReport = { node: i, pass: true, lines, arrivalInFrame: 0, rewardShare: 0, warm: 0, accent: 0, wonderTop: false, emptyFloor: 1, floating: 0, wallCover: 0, samples: 0 };
  const check = (ok: boolean, s: string) => {
    if (!ok) rep.pass = false;
    lines.push(ok ? s : `✗ ${s}`);
  };
  const fail = (s: string) => check(false, s);
  if (!nav) {
    fail('slabs not loaded');
    return rep;
  }
  const things = actable(p);
  const counts: Record<string, number> = {};
  for (const s0 of p.chamber.sockets) counts[s0.kind] = (counts[s0.kind] ?? 0) + 1;
  lines.push(`sockets ${Object.entries(counts).map(([k, n]) => `${k} ${n}`).join(', ')}`);
  // A lamp post is tapped at its head, 1.2 m above its foot.
  const targets: Array<{ pos: V3; normal?: V3 }> = [...things.map((s) => ({ pos: s.mount === 'post' ? { x: s.pos.x, y: s.pos.y + 1.2, z: s.pos.z } : s.pos, normal: s.normal })), ...p.chamber.exits.map((e) => ({ pos: e.pos }))];
  // 1. Tappables in frame on arrival ≥ 4.
  const a = p.chamber.stands[0];
  rep.arrivalInFrame = targets.filter((t) => inView(world, a.pos, a.yaw, a.pitch, t.pos, 20, t.normal)).length;
  check(rep.arrivalInFrame >= 4, `arrival tappables ${rep.arrivalInFrame} (≥ 4)`);
  // 2. From every walkable point: a reward in view (the player looks around freely: one of 8 headings, 45° apart so
  //    the 52° frusta overlap, sees a tappable within 12 m).
  // The chamber's own walkable floor (the drift tubes and the exit passage beyond the walls are corridors).
  const bx = p.chamber.box;
  const cells = nav.reachableFrom(a.feet).filter((c) => c.x >= bx.min.x && c.x <= bx.max.x && c.z >= bx.min.z && c.z <= bx.max.z);
  const pick = cells.length <= samples ? cells : Array.from({ length: samples }, (_, k) => cells[Math.floor(((k + 0.5) * cells.length) / samples)]);
  let ok = 0;
  for (const c of pick) {
    const eye = { x: c.x, y: c.y + 1.6, z: c.z };
    let seen = false;
    for (let h = 0; h < 8 && !seen; h++) {
      const yaw = a.yaw + (h * Math.PI) / 4;
      for (const t of targets) if (inView(world, eye, yaw, 0, t.pos, 12, t.normal)) {
        seen = true;
        break;
      }
    }
    if (seen) ok++;
  }
  rep.samples = pick.length;
  rep.rewardShare = pick.length ? ok / pick.length : 0;
  check(rep.rewardShare >= 0.95, `reward in view from ${(rep.rewardShare * 100).toFixed(0)} % of ${pick.length} walkable points (≥ 95 %)`);
  // 3. Light: ≥ 1 warm practical and ≥ 1 accent emitter.
  rep.warm = p.chamber.lights.filter((l) => l.kind === 'lamp' || l.kind === 'crew' || l.kind === 'camp').length;
  rep.accent = p.chamber.lights.filter((l) => l.kind === 'sky' || l.kind === 'crystal' || l.kind === 'glowroot' || l.kind === 'leak').length;
  check(rep.warm >= 1 && rep.accent >= 1, `light warm ${rep.warm} accent ${rep.accent}`);
  // 4. Wonder: the hero feature in the top third of the arrival frame or of a stand's.
  const wonder = p.chamber.anchors.wonder ?? wonderOf(p);
  // A Threshold's Reveal is the window composition instead (SPEC §3.3: a dark arch over a lit middle ground and the
  // biome's glowing far plane): its wonder must be in the arrival's frame, not in the top third.
  const reveal = p.chamber.template === 'glowroot.threshold';
  if (wonder) {
    for (const st of p.chamber.stands) {
      for (const dp of [0, 0.35]) {
        const v = inView(world, st.pos, st.yaw, st.pitch + dp, wonder, 30);
        if (v && v.y <= (reveal ? 0.75 : 0.4)) rep.wonderTop = true;
      }
    }
  }
  check(rep.wonderTop, reveal ? `reveal: the far plane in the arrival frame ${rep.wonderTop ? 'yes' : 'no'}` : `wonder in the top third ${rep.wonderTop ? 'yes' : 'no'}`);
  // 5. Floor: ≤ 35 % of the floor within 6 m of the arrival farther than 2 m from any prop, tappable or dressing piece.
  const stuff: V3[] = [...p.chamber.sockets.filter((s) => !s.hidden).map((s) => s.pos), ...p.chamber.dressing.map((d) => d.pos), ...p.chamber.exits.map((e) => e.pos)];
  const near = cells.filter((c) => Math.hypot(c.x - a.feet.x, c.z - a.feet.z) <= 6);
  const empty = near.filter((c) => stuff.every((s) => Math.hypot(s.x - c.x, s.z - c.z) > 2 || Math.abs(s.y - c.y) > 3)).length;
  rep.emptyFloor = near.length ? empty / near.length : 0;
  check(rep.emptyFloor <= 0.35, `empty floor near arrival ${(rep.emptyFloor * 100).toFixed(0)} % (≤ 35 %)`);
  const floaters: string[] = [];
  // 6. Nothing floats: floor dressing rests on rock, wall dressing has rock behind, ceiling dressing rock above.
  for (const d of p.chamber.dressing) {
    const wall = d.normal && Math.abs(d.normal.y) < 0.5 && (d.kind === 'plaque' || d.kind === 'rune' || d.kind === 'chalkArrow' || d.kind === 'cobweb');
    const ceiling = d.kind === 'hangingRoots' || d.kind === 'dripstone' || d.kind === 'chain' || d.kind === 'rootCurtain' || d.kind === 'hangingLamp' || d.kind === 'chandelier';
    let ok2: boolean;
    if (wall && d.normal) ok2 = world.ring.solidAtM(d.pos.x - d.normal.x * 0.4, d.pos.y, d.pos.z - d.normal.z * 0.4);
    else if (ceiling) ok2 = world.ring.solidAtM(d.pos.x, d.pos.y + 0.3, d.pos.z) || world.ring.solidAtM(d.pos.x, d.pos.y + 0.8, d.pos.z);
    else if (d.kind === 'rail' || d.kind === 'sleeper' || d.kind === 'beam' || d.kind === 'timberSet' || d.kind === 'puddle') ok2 = true;
    else ok2 = world.ring.solidAtM(d.pos.x, d.pos.y - 0.25, d.pos.z) && !world.ring.solidAtM(d.pos.x, d.pos.y + 0.25, d.pos.z);
    if (!ok2) {
      rep.floating++;
      floaters.push(d.kind);
    }
  }
  check(rep.floating === 0, `floating dressing ${rep.floating}${floaters.length ? ' (' + floaters.slice(0, 4).join(', ') + ')' : ''}`);
  // 7. Wall cover: veins, crystals, glow seams and loose skin on ≥ 8 % of the wall faces beside the walkable floor.
  let wallFaces = 0;
  let covered = 0;
  const seen = new Set<string>();
  for (const c of cells) {
    for (const [dx, dz] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      for (let h = 0.25; h < 2.5; h += 0.5) {
        const x = c.x + dx * 0.5;
        const z = c.z + dz * 0.5;
        const y = c.y + h;
        const key = `${Math.floor(x / VOXEL)},${Math.floor(y / VOXEL)},${Math.floor(z / VOXEL)}`;
        if (seen.has(key)) continue;
        const id = world.ring.getM(x, y, z);
        if (!SOLID[id]) continue;
        seen.add(key);
        wallFaces++;
        const slot = id >= 64 && id < 176 ? (id - 64) % 8 : -1;
        if (slot === SLOT.ORE || slot === SLOT.RICH || slot === SLOT.GEM || slot === SLOT.SOFT || (EMIT_R[id] | EMIT_G[id] | EMIT_B[id]) !== 0) covered++;
      }
    }
  }
  for (const s of things) if (s.kind === 'vein' || s.kind === 'gem') covered += 4;
  rep.wallCover = wallFaces ? covered / wallFaces : 0;
  check(rep.wallCover >= 0.08, `wall cover ${(rep.wallCover * 100).toFixed(1)} % (≥ 8 %)`);
  void REACH;
  return rep;
}

/** The chamber's wonder: its tallest hero point (a dressing piece of the ceiling or an anchor), as recorded. */
function wonderOf(p: NodePlacement): V3 | null {
  const w = p.chamber.dressing.filter((d) => d.kind === 'hangingRoots' || d.kind === 'rootCurtain' || d.kind === 'hoistCage' || d.kind === 'dripstone');
  if (!w.length) return null;
  return w.reduce((a, b) => (b.pos.y > a.pos.y ? b : a)).pos;
}
