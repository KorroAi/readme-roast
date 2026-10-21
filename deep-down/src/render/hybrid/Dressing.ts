// The dressing of a node in the Lantern Voxel bevel language (W1-LEAD §4 "a huge improvement in visual detail"): every
// `Dress` piece 1B places (rubble and pebbles at wall feet, roots, tapered dripstone, timber sets with grain and iron
// straps, rails with spikes, rope and chains, crystal clusters with inner light, wet puddles, cobwebs, Halden plaques,
// carved runes, chalk arrows, carts, crates, the hoist cage...) merged into three draws per node: the prop surface, the
// crystals and the glow (lit lamp glass). Decoration only: it never takes a tap.

import * as THREE from 'three';
import type { Dress } from '../../world/hybrid/kits/types';
import type { WorldLight } from '../../world/hybrid/kits/types';
import { LAYER } from '../lantern/layers';
import {
  BRASS,
  CHALK,
  CrystalBuilder,
  IRON,
  MASONRY,
  OLD_WOOD,
  PropBuilder,
  ROOT,
  RUNE,
  STONE,
  WOOD,
  chain,
  chest,
  cobweb,
  dripstone,
  haldenLamp,
  pebbles,
  plaque,
  rails,
  rng,
  rope,
  roots,
  timberSet,
  type Finish,
} from '../lantern/props';
import { TINT, type PropMaterials } from '../lantern/propSurface';

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const qY = (a: number) => new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), a);
const BONE: Finish = { layer: LAYER.masonry, tint: TINT.bone };
const WATER: Finish = { layer: LAYER.slate, tint: TINT.water };
const GLOWROOT: Finish = { layer: LAYER.rootwood, glow: 3 };

/** A small mine cart: an iron-banded timber box on four iron wheels (local: centre of the floor contact, along z). */
export function cart(pb: PropBuilder, at: THREE.Vector3, yaw: number, broken: boolean, seed: number): void {
  const q = qY(yaw);
  const r = rng(seed);
  const L = (x: number, y: number, z: number) => V(x, y, z).applyQuaternion(q).add(at);
  const tilt = broken ? new THREE.Quaternion().setFromAxisAngle(V(0, 0, 1).applyQuaternion(q), 0.35) : new THREE.Quaternion();
  const body = tilt.clone().multiply(q);
  pb.box(L(0, 0.42, 0), V(0.34, 0.22, 0.5), body, OLD_WOOD, r(), 0.02);
  for (const z of [-0.42, 0, 0.42]) pb.box(L(0, 0.42, z), V(0.355, 0.235, 0.025), body, IRON, r(), 0.006);
  pb.box(L(0, 0.64, 0), V(0.36, 0.02, 0.52), body, IRON, r(), 0.006);
  for (const sx of [-1, 1])
    for (const sz of [-0.32, 0.32]) {
      if (broken && sx > 0 && sz > 0) continue;
      const w = new THREE.CylinderGeometry(0.12, 0.12, 0.05, 10);
      w.rotateZ(Math.PI / 2);
      pb.geometry(w, new THREE.Matrix4().compose(L(sx * 0.3, 0.12, sz), q, V(1, 1, 1)), IRON, r(), 0.4);
      w.dispose();
    }
}

/** A crate (bevelled planks, two iron bands) of side `s`. */
function crate(pb: PropBuilder, at: THREE.Vector3, yaw: number, s: number, seed: number): void {
  const q = qY(yaw);
  const r = rng(seed);
  const L = (x: number, y: number, z: number) => V(x, y, z).applyQuaternion(q).add(at);
  pb.box(L(0, s / 2, 0), V(s / 2, s / 2, s / 2), q, WOOD, r(), 0.02);
  for (const sz of [-1, 1]) {
    pb.box(L(0, s * 0.85, sz * (s / 2 + 0.004)), V(s / 2 + 0.004, 0.02, 0.006), q, IRON, r(), 0.004);
    pb.box(L(0, s * 0.15, sz * (s / 2 + 0.004)), V(s / 2 + 0.004, 0.02, 0.006), q, IRON, r(), 0.004);
  }
  // Corner battens.
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) pb.box(L(sx * (s / 2 - 0.02), s / 2, sz * (s / 2 - 0.02)), V(0.028, s / 2 + 0.003, 0.028), q, OLD_WOOD, r(), 0.006);
}

function barrel(pb: PropBuilder, at: THREE.Vector3, seed: number): void {
  const pts: THREE.Vector2[] = [];
  for (let i = 0; i <= 8; i++) {
    const t = i / 8;
    pts.push(new THREE.Vector2(0.24 + 0.05 * Math.sin(t * Math.PI), t * 0.8));
  }
  const g = new THREE.LatheGeometry(pts, 12);
  pb.geometry(g, new THREE.Matrix4().compose(at, qY(seed * 6), V(1, 1, 1)), OLD_WOOD, seed, 1);
  g.dispose();
  for (const y of [0.12, 0.68]) pb.cylinder(at.clone().add(V(0, y - 0.02, 0)), at.clone().add(V(0, y + 0.02, 0)), 0.265, 0.265, IRON, 12, seed);
  const lid = new THREE.CylinderGeometry(0.235, 0.235, 0.02, 12);
  pb.geometry(lid, new THREE.Matrix4().makeTranslation(at.x, at.y + 0.79, at.z), WOOD, seed, 1);
  lid.dispose();
}

/** A wooden ladder from a (bottom) to b (top): two rails, rungs every 0.3 m. */
function ladder(pb: PropBuilder, a: THREE.Vector3, b: THREE.Vector3, ropeLadder: boolean, seed: number): void {
  const up = b.clone().sub(a);
  const len = up.length();
  up.normalize();
  const side = new THREE.Vector3().crossVectors(up, Math.abs(up.y) > 0.9 ? V(1, 0, 0) : V(0, 1, 0)).normalize();
  if (Math.abs(up.y) > 0.9) side.set(1, 0, 0);
  const rail = ropeLadder ? null : OLD_WOOD;
  for (const s of [-0.22, 0.22]) {
    const o = side.clone().multiplyScalar(s);
    if (rail) pb.cylinder(a.clone().add(o), b.clone().add(o), 0.03, 0.03, rail, 6, seed);
    else rope(pb, a.clone().add(o), b.clone().add(o), 0.0, 0.016);
  }
  for (let d = 0.25; d < len; d += 0.3) {
    const c = a.clone().addScaledVector(up, d);
    pb.cylinder(c.clone().addScaledVector(side, -0.24), c.clone().addScaledVector(side, 0.24), 0.02, 0.02, WOOD, 6, (seed + d) % 1);
  }
}

/** Draw one dress piece. */
function dress(pb: PropBuilder, cb: CrystalBuilder, glow: PropBuilder, d: Dress): void {
  const p = V(d.pos.x, d.pos.y, d.pos.z);
  const to = d.to ? V(d.to.x, d.to.y, d.to.z) : null;
  const s = d.scale || 1;
  const r = rng(d.seed * 7919 + 13);
  const q = qY(d.rotY);
  switch (d.kind) {
    case 'pebbles': {
      const spots: Array<[THREE.Vector3, number]> = [];
      for (let i = 0; i < 10; i++) spots.push([p.clone().add(V((r() - 0.5) * 1.4 * s, 0, (r() - 0.5) * 1.4 * s)), 0.04 + r() * r() * 0.1]);
      pebbles(pb, spots, d.seed);
      break;
    }
    case 'rubble': {
      const spots: Array<[THREE.Vector3, number]> = [];
      for (let i = 0; i < 7; i++) spots.push([p.clone().add(V((r() - 0.5) * 1.0 * s, 0, (r() - 0.5) * 1.0 * s)), 0.1 + r() * 0.18]);
      pebbles(pb, spots, d.seed);
      break;
    }
    case 'boulder':
      pebbles(pb, [[p, 0.5 * s + r() * 0.3]], d.seed);
      break;
    case 'root':
    case 'hangingRoots':
    case 'rootCurtain': {
      const n = d.kind === 'rootCurtain' ? 7 : d.kind === 'hangingRoots' ? 4 : 1;
      const anchors: Array<[THREE.Vector3, number]> = [];
      const len = to ? p.distanceTo(to) : 1.6 * s;
      for (let i = 0; i < n; i++) anchors.push([p.clone().add(V((r() - 0.5) * 1.6 * (n > 1 ? 1 : 0), 0, (r() - 0.5) * 0.8 * (n > 1 ? 1 : 0))).applyQuaternion(new THREE.Quaternion()), len * (0.6 + r() * 0.5)]);
      roots(pb, anchors, d.seed, ROOT);
      break;
    }
    case 'glowroot': {
      const anchors: Array<[THREE.Vector3, number]> = [];
      for (let i = 0; i < 3; i++) anchors.push([p.clone().add(V((r() - 0.5) * 0.8, 0, (r() - 0.5) * 0.8)), (1 + r()) * s]);
      roots(pb, anchors, d.seed, GLOWROOT);
      break;
    }
    case 'dripstone':
      dripstone(pb, p, (0.6 + r() * 0.9) * s, (0.1 + r() * 0.08) * s, false, d.seed);
      if (r() < 0.6) dripstone(pb, p.clone().add(V(0.2 * (r() - 0.5), 0, 0.2 * (r() - 0.5))), 0.4 * s, 0.06 * s, false, d.seed + 1);
      break;
    case 'stalagmite':
      dripstone(pb, p, (0.5 + r() * 0.8) * s, (0.14 + r() * 0.1) * s, true, d.seed);
      break;
    case 'flowstone': {
      const spots: Array<[THREE.Vector3, number]> = [];
      for (let i = 0; i < 5; i++) spots.push([p.clone().add(V((r() - 0.5) * 0.6, i * 0.12, (r() - 0.5) * 0.3)), 0.25 - i * 0.03]);
      pebbles(pb, spots, d.seed, { layer: LAYER.umber });
      break;
    }
    case 'timberSet': {
      const w = d.size?.x ?? 2.6, h = d.size?.y ?? 2.6;
      timberSet(pb, p, d.rotY, w, h, d.seed);
      break;
    }
    case 'timberPost':
      pb.box(p.clone().add(V(0, (d.size?.y ?? 2.4) / 2, 0)), V(0.06, (d.size?.y ?? 2.4) / 2, 0.06), q, OLD_WOOD, r(), 0.016);
      break;
    case 'beam':
    case 'plank': {
      if (!to) break;
      const mid = p.clone().add(to).multiplyScalar(0.5);
      const len = p.distanceTo(to);
      const dir = to.clone().sub(p).normalize();
      const bq = new THREE.Quaternion().setFromUnitVectors(V(0, 0, 1), dir);
      const t = d.kind === 'beam' ? 0.09 : 0.03;
      pb.box(mid, V(d.kind === 'beam' ? 0.09 : 0.14, t, len / 2), bq, OLD_WOOD, r(), d.kind === 'beam' ? 0.016 : 0.006);
      break;
    }
    case 'rail':
    case 'sleeper':
      if (to) rails(pb, p, to, d.seed);
      else pb.box(p.clone().add(V(0, 0.035, 0)), V(0.5, 0.035, 0.08), q, OLD_WOOD, r(), 0.01);
      break;
    case 'railBuffer':
      pb.box(p.clone().add(V(0, 0.3, 0)), V(0.4, 0.3, 0.08), q, OLD_WOOD, r(), 0.016);
      pb.box(p.clone().add(V(0, 0.3, 0.09)), V(0.42, 0.04, 0.02), q, IRON, r(), 0.005);
      break;
    case 'cart':
    case 'brokenCart':
      cart(pb, p, d.rotY, d.kind === 'brokenCart', d.seed);
      break;
    case 'crate':
      crate(pb, p, d.rotY, 0.5 * s, d.seed);
      break;
    case 'crateStack': {
      const n = 2 + Math.floor(r() * 3);
      for (let i = 0; i < n; i++) {
        const lvl = i < 2 ? 0 : 1;
        crate(pb, p.clone().add(V((i % 2) * 0.56 - 0.28, lvl * 0.5, lvl * 0.05).applyQuaternion(q)), d.rotY + (r() - 0.5) * 0.3, 0.5, d.seed + i);
      }
      break;
    }
    case 'barrel':
      barrel(pb, p, r());
      break;
    case 'shelf': {
      const w = d.size?.x ?? 1.2;
      for (const y of [0.45, 0.95, 1.45]) pb.box(p.clone().add(V(0, y, 0)), V(w / 2, 0.025, 0.16), q, WOOD, r(), 0.008);
      for (const sx of [-1, 1]) pb.box(p.clone().add(V(sx * (w / 2 - 0.03), 0.75, 0).applyQuaternion(q)), V(0.03, 0.75, 0.16), q, OLD_WOOD, r(), 0.008);
      break;
    }
    case 'chain':
      if (to) chain(pb, p, to, 0.08 * p.distanceTo(to));
      break;
    case 'rope':
      if (to) rope(pb, p, to, 0.06 * p.distanceTo(to));
      break;
    case 'ladder':
    case 'ropeLadder':
      if (to) ladder(pb, p, to, d.kind === 'ropeLadder', d.seed);
      break;
    case 'stairFlight': {
      if (!to) break;
      const steps = Math.max(2, Math.round(Math.abs(to.y - p.y) / 0.25));
      const w = d.size?.x ?? 1.2;
      for (let i = 0; i < steps; i++) {
        const t = (i + 0.5) / steps;
        const c = p.clone().lerp(to, t);
        pb.box(c, V(w / 2, 0.04, 0.17), qY(d.rotY), OLD_WOOD, r(), 0.01);
      }
      break;
    }
    case 'cobweb': {
      const u = V(1, 0, 0).applyQuaternion(q), v = V(0, -1, 0);
      cobweb(pb, p, u, v, 0.45 * s, d.seed);
      break;
    }
    case 'plaque': {
      const n = V(0, 0, 1).applyQuaternion(q);
      plaque(pb, p, n, 0.22 * s, d.seed);
      break;
    }
    case 'rune': {
      const n = V(0, 0, 1).applyQuaternion(q);
      const t1 = new THREE.Vector3().crossVectors(V(0, 1, 0), n).normalize();
      for (let i = 0; i < 5; i++) {
        const c = p.clone().addScaledVector(t1, (r() - 0.5) * 0.5 * s).add(V(0, (r() - 0.5) * 0.5 * s, 0)).addScaledVector(n, 0.01);
        const bq = new THREE.Quaternion().setFromUnitVectors(V(0, 0, 1), n).multiply(new THREE.Quaternion().setFromAxisAngle(V(0, 0, 1), r() * Math.PI));
        pb.box(c, V(0.08 + r() * 0.1, 0.012, 0.006), bq, RUNE, r(), 0.002);
      }
      break;
    }
    case 'chalkArrow': {
      const n = V(0, 0, 1).applyQuaternion(q);
      const t1 = new THREE.Vector3().crossVectors(V(0, 1, 0), n).normalize();
      const bq = new THREE.Quaternion().setFromUnitVectors(V(0, 0, 1), n);
      const c = p.clone().addScaledVector(n, 0.012);
      pb.box(c, V(0.22, 0.012, 0.004), bq, CHALK, r(), 0.002);
      for (const sg of [-1, 1]) {
        const hq = bq.clone().multiply(new THREE.Quaternion().setFromAxisAngle(V(0, 0, 1), sg * 0.7));
        pb.box(c.clone().addScaledVector(t1, 0.17).add(V(0, sg * 0.05, 0)), V(0.08, 0.012, 0.004), hq, CHALK, r(), 0.002);
      }
      break;
    }
    case 'puddle': {
      const shape = new THREE.Shape();
      const n = 10;
      for (let i = 0; i <= n; i++) {
        const a = (i / n) * Math.PI * 2;
        const rr = (0.5 + 0.25 * Math.sin(a * 3 + d.seed) + 0.1 * r()) * s;
        if (i === 0) shape.moveTo(Math.cos(a) * rr, Math.sin(a) * rr * 0.7);
        else shape.lineTo(Math.cos(a) * rr, Math.sin(a) * rr * 0.7);
      }
      const g = new THREE.ShapeGeometry(shape);
      g.rotateX(-Math.PI / 2);
      pb.geometry(g, new THREE.Matrix4().compose(p.clone().add(V(0, 0.012, 0)), q, V(1, 1, 1)), WATER, r(), 1);
      g.dispose();
      break;
    }
    case 'crystalDecor':
      cb.cluster(p, to ? to.clone().sub(p).normalize() : V(0, 1, 0), 5 + Math.floor(r() * 4), (0.35 + r() * 0.4) * s, 0.55, r() < 0.7 ? 0 : 1, d.seed);
      break;
    case 'hoistCage': {
      const h = 2.4, w = 1.3;
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) pb.box(p.clone().add(V(sx * w / 2, h / 2, sz * w / 2).applyQuaternion(q)), V(0.035, h / 2, 0.035), q, IRON, r(), 0.006);
      for (const y of [0.05, h * 0.5, h])
        for (const [dx, dz, hx, hz] of [[0, w / 2, w / 2, 0.025], [0, -w / 2, w / 2, 0.025], [w / 2, 0, 0.025, w / 2], [-w / 2, 0, 0.025, w / 2]] as const)
          pb.box(p.clone().add(V(dx, y, dz).applyQuaternion(q)), V(hx, 0.025, hz), q, IRON, r(), 0.004);
      for (let i = -3; i <= 3; i++) pb.box(p.clone().add(V(i * 0.18, h * 0.5, w / 2).applyQuaternion(q)), V(0.012, h / 2, 0.012), q, IRON, r(), 0.003);
      pb.box(p.clone().add(V(0, 0.06, 0)), V(w / 2 - 0.03, 0.03, w / 2 - 0.03), q, OLD_WOOD, r(), 0.01);
      chain(pb, p.clone().add(V(0, h, 0)), p.clone().add(V(0, h + 3, 0)), 0.0);
      break;
    }
    case 'winch': {
      for (const sx of [-1, 1]) pb.box(p.clone().add(V(sx * 0.45, 0.45, 0).applyQuaternion(q)), V(0.05, 0.45, 0.25), q, OLD_WOOD, r(), 0.012);
      const ax = V(1, 0, 0).applyQuaternion(q);
      pb.cylinder(p.clone().add(V(0, 0.75, 0)).addScaledVector(ax, -0.4), p.clone().add(V(0, 0.75, 0)).addScaledVector(ax, 0.4), 0.14, 0.14, OLD_WOOD, 10, r());
      for (const t of [-0.25, 0, 0.25]) pb.cylinder(p.clone().add(V(0, 0.75, 0)).addScaledVector(ax, t - 0.02), p.clone().add(V(0, 0.75, 0)).addScaledVector(ax, t + 0.02), 0.155, 0.155, ROOT, 10, r());
      break;
    }
    case 'signpost':
      pb.box(p.clone().add(V(0, 0.8, 0)), V(0.05, 0.8, 0.05), q, OLD_WOOD, r(), 0.014);
      pb.box(p.clone().add(V(0.25, 1.45, 0).applyQuaternion(q)), V(0.32, 0.09, 0.025), q, WOOD, r(), 0.008);
      pb.box(p.clone().add(V(0.25, 1.45, 0.028).applyQuaternion(q)), V(0.2, 0.012, 0.004), q, CHALK, r(), 0.002);
      break;
    case 'bones': {
      for (let i = 0; i < 4; i++) {
        const a = p.clone().add(V((r() - 0.5) * 0.6, 0.03, (r() - 0.5) * 0.6));
        const b = a.clone().add(V((r() - 0.5) * 0.5, 0, (r() - 0.5) * 0.5));
        pb.cylinder(a, b, 0.025, 0.02, BONE, 6, r());
      }
      break;
    }
    case 'lampPost':
    case 'crewLamp':
      haldenLamp(pb, glow, p, d.rotY, d.kind === 'lampPost', r());
      break;
    case 'survey': {
      const ring = new THREE.TorusGeometry(0.42 * s, 0.03, 4, 8);
      ring.rotateX(Math.PI / 2);
      ring.rotateY(Math.PI / 8);
      pb.geometry(ring, new THREE.Matrix4().makeTranslation(p.x, p.y + 0.02, p.z), BRASS, r(), 1);
      ring.dispose();
      break;
    }
    case 'tools': {
      // A shovel and a pick leaning on the wall.
      const lean = V(0, 1, 0).applyAxisAngle(V(1, 0, 0).applyQuaternion(q), -0.25);
      pb.cylinder(p, p.clone().addScaledVector(lean, 1.1), 0.018, 0.018, OLD_WOOD, 6, r());
      pb.box(p.clone().add(V(0, 0.15, 0)), V(0.12, 0.16, 0.012), q, IRON, r(), 0.004);
      const p2 = p.clone().add(V(0.35, 0, 0).applyQuaternion(q));
      pb.cylinder(p2, p2.clone().addScaledVector(lean, 0.95), 0.018, 0.018, OLD_WOOD, 6, r());
      pb.box(p2.clone().addScaledVector(lean, 0.95), V(0.2, 0.02, 0.02), q, IRON, r(), 0.004);
      break;
    }
    case 'hatch':
      // Drawn by the seal renderer (the Halden Hatch is a mechanism, SPEC §5.5).
      break;
  }
}

/** The merged dressing of one node: three meshes (prop, crystal, glow) and the lit-lamp practicals it carries. */
export class NodeDressing {
  readonly group = new THREE.Group();
  readonly lamps: Array<{ id: string; pos: THREE.Vector3; color: number; radius: number }> = [];
  constructor(dressing: ReadonlyArray<Dress>, lights: ReadonlyArray<WorldLight>, mats: PropMaterials) {
    const pb = new PropBuilder(), cb = new CrystalBuilder(), glow = new PropBuilder();
    for (const d of dressing) {
      try {
        dress(pb, cb, glow, d);
      } catch {
        // A malformed piece never stops the rest of the room.
      }
    }
    if (pb.vertexCount) this.group.add(new THREE.Mesh(pb.build(), mats.prop));
    if (cb.pos.length) this.group.add(new THREE.Mesh(cb.build(), mats.crystal));
    if (glow.vertexCount) this.group.add(new THREE.Mesh(glow.build(), mats.glow));
    for (const m of this.group.children as THREE.Mesh[]) {
      m.matrixAutoUpdate = false;
      m.updateMatrix();
    }
    // Lit practicals: crew lamps and burning Halden lamps (cold lamps are the player's to relight: ChamberProps).
    for (const l of lights) {
      if (l.cold) continue;
      if (l.kind !== 'lamp' && l.kind !== 'crew' && l.kind !== 'camp') continue;
      const c = new THREE.Color(l.color[0], l.color[1], l.color[2]);
      this.lamps.push({ id: l.id, pos: V(l.pos.x, l.pos.y, l.pos.z), color: c.getHex(THREE.SRGBColorSpace), radius: l.radius });
    }
  }
  /** Triangles (stats). */
  get tris(): number {
    let n = 0;
    for (const m of this.group.children as THREE.Mesh[]) n += (m.geometry.index ? m.geometry.index.count : m.geometry.getAttribute('position').count) / 3;
    return n;
  }
  dispose(): void {
    for (const m of this.group.children as THREE.Mesh[]) m.geometry.dispose();
  }
}

export { chest, MASONRY, STONE };
