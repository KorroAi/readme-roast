// The chamber's tappables (SPEC §2.3, §4.6–§4.7, §8.5; W1-LEAD §3 Explore): veins as real 3D nuggets half-sunk in the
// wall, gem and crystal clusters with inner light, cold and relit Halden lamps (a relit lamp becomes a practical),
// bevelled chests on crates, relics on plinths, notes, loose stash bricks, secret caches, the exits' carved octagon
// plates, the Ride's pass-by glints. Each object is one instanced mesh per material (count 1) so it carries its own
// state (aInst: rim, remaining fraction) without a program per object; the single amber rim marks the suggestion.

import * as THREE from 'three';
import type { ExitPlaced, SocketPlaced } from '../../world/hybrid/placement';
import { LAYER } from '../lantern/layers';
import { BRASS, CrystalBuilder, GOLD, IRON, MASONRY, OLD_WOOD, PropBuilder, WOOD, chest, haldenLamp, nuggets, rng, type Finish } from '../lantern/props';
import { TINT, type PropMaterials } from '../lantern/propSurface';
import type { ChamberView } from './source';
import { FOCUS_KINDS, HIT_MIN_PX, REACH_FOCUS_M, REACH_STRIKE_M, type ScreenTarget, type TappableKind } from './types';

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const qY = (a: number) => new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), a);

export interface PropObject {
  id: string;
  /** What it is for the hit test. */
  type: 'tappable' | 'lamp' | 'nav';
  kind: TappableKind | 'lamp' | 'exit' | 'plate';
  group: THREE.Group;
  /** World bound (picking, screen rects). */
  box: THREE.Box3;
  centre: THREE.Vector3;
  /** Lamp: the flame (a practical when lit). */
  flame?: THREE.Vector3;
  lit?: boolean;
  /** Remaining fraction (strike types), 1 = untouched. */
  left: number;
  hidden: boolean;
  /** The focus pop: home position and the lift 0..1. */
  pop: number;
  popTarget: number;
}

function instanced(g: THREE.BufferGeometry, mat: THREE.Material): THREE.InstancedMesh {
  g.setAttribute('aInst', new THREE.InstancedBufferAttribute(new Float32Array([0, 1, 0, 0]), 4));
  const m = new THREE.InstancedMesh(g, mat, 1);
  m.setMatrixAt(0, new THREE.Matrix4());
  m.frustumCulled = false;
  return m;
}

/** Palette index of gem crystals per biome (Topsoil rose and amber, Glowroot jade and cyan). */
const GEM_PAL = (biome: number, k: number) => (biome <= 0 ? (k % 2 ? 3 : 2) : k % 2 ? 0 : 4);

export class ChamberProps {
  readonly group = new THREE.Group();
  readonly objects = new Map<string, PropObject>();
  private rimId: string | null = null;
  private hintId: string | null = null;
  private hintT = 0;
  private readonly tmp = new THREE.Vector3();

  constructor(private readonly mats: PropMaterials) {
    this.group.name = 'chamberProps';
  }

  /** Rebuild the props of a chamber (its placement and this run's contents). */
  build(node: number, sockets: ReadonlyArray<SocketPlaced>, exits: ReadonlyArray<ExitPlaced>, view: ChamberView | null, biome: number): void {
    // Drop this node's old objects.
    for (const [id, o] of this.objects) {
      if (!id.startsWith(`${node}:`) && !id.startsWith(`n${node}:`)) continue;
      this.group.remove(o.group);
      o.group.traverse((m) => (m as THREE.Mesh).geometry?.dispose());
      this.objects.delete(id);
    }
    for (const s of sockets) {
      const content = view?.content(s.id) ?? defaultContent(s);
      if (!content || content === 'skin' || content === 'sign') continue;
      const o = this.makeSocket(s, content, biome);
      if (!o) continue;
      o.left = view ? view.left(s.id) : 1;
      o.lit = content === 'litLamp' || (view ? view.lit(s.id) : !!s.lit);
      o.hidden = !!s.hidden;
      this.objects.set(o.id, o);
      this.group.add(o.group);
      this.applyState(o);
    }
    for (const e of exits) {
      const o = this.makePlate(node, e);
      this.objects.set(o.id, o);
      this.group.add(o.group);
    }
  }

  /** Drop a node's objects (it left the window). */
  drop(node: number): void {
    for (const [id, o] of this.objects) {
      if (!id.startsWith(`${node}:`) && !id.startsWith(`n${node}:`)) continue;
      this.group.remove(o.group);
      o.group.traverse((m) => (m as THREE.Mesh).geometry?.dispose());
      this.objects.delete(id);
    }
  }

  private makeSocket(s: SocketPlaced, content: string, biome: number): PropObject | null {
    const pb = new PropBuilder(), cb = new CrystalBuilder(), glow = new PropBuilder();
    const p = V(s.pos.x, s.pos.y, s.pos.z);
    const n = V(s.normal.x, s.normal.y, s.normal.z).normalize();
    const yaw = Math.atan2(n.x, n.z);
    const r = rng(hashStr(s.id));
    let flame: THREE.Vector3 | undefined;
    let type: PropObject['type'] = 'tappable';
    let kind: PropObject['kind'] = content as TappableKind;
    switch (content) {
      case 'vein': {
        const rich = !!s.rich;
        const tint = rich ? TINT.oreAmber : biome <= 0 ? TINT.oreCopper : TINT.oreTin;
        const spread = Math.max(0.25, Math.min(0.6, Math.max(s.bound.x, s.bound.y, s.bound.z)));
        // A crust patch (darker stone) and 6–12 nuggets half-sunk.
        nuggets(pb, p, n, spread, rich ? 12 : 8, tint, r() * 1000);
        if (rich) nuggets(pb, p.clone().addScaledVector(n, 0.02), n, spread * 0.5, 4, TINT.gold, r() * 1000);
        break;
      }
      case 'gem':
      case 'geode': {
        const axis = s.mount === 'wall' ? n.clone().add(V(0, 0.6, 0)).normalize() : V(0, 1, 0);
        cb.cluster(p, axis, 5 + Math.floor(r() * 4), 0.42 + r() * 0.2, 0.5, (i) => GEM_PAL(biome, i), Math.floor(r() * 1000));
        break;
      }
      case 'glint': {
        // A Ride pass-by: an ore knot on the wall within reach.
        nuggets(pb, p, n, 0.25, 6, TINT.oreCopper, r() * 1000);
        break;
      }
      case 'stash': {
        const q = qY(yaw);
        pb.box(p.clone().addScaledVector(n, 0.12), V(0.22, 0.11, 0.14), q, MASONRY, r(), 0.02);
        pb.box(p.clone().addScaledVector(n, 0.27).add(V(0, 0.02, 0)), V(0.05, 0.02, 0.01), q, BRASS, r(), 0.004);
        break;
      }
      case 'lamp':
      case 'litLamp': {
        type = 'lamp';
        kind = 'lamp';
        const post = s.mount === 'post' || s.mount === 'floor';
        flame = haldenLamp(pb, glow, p, yaw, post, r());
        break;
      }
      case 'chest':
      case 'cache': {
        const onCrate = s.mount === 'crate';
        const base = p.clone();
        if (onCrate) {
          const q = qY(yaw + 0.2);
          pb.box(base.clone().add(V(0, 0.27, 0)), V(0.45, 0.27, 0.4), q, OLD_WOOD, r(), 0.02);
          base.y += 0.54;
        }
        chest(pb, base, yaw + (r() - 0.5) * 0.4, 0, content === 'cache' ? BRASS : IRON);
        kind = 'chest';
        break;
      }
      case 'relic': {
        // A plinth (bevelled masonry) and a brass compass relic on a velvet cushion.
        const q = qY(yaw);
        if (s.mount === 'plinth' || s.mount === 'floor') {
          pb.box(p.clone().add(V(0, 0.45, 0)), V(0.22, 0.45, 0.22), q, MASONRY, r(), 0.03);
          pb.box(p.clone().add(V(0, 0.92, 0)), V(0.26, 0.03, 0.26), q, MASONRY, r(), 0.012);
          p.y += 0.95;
        }
        pb.box(p.clone().add(V(0, 0.03, 0)), V(0.12, 0.03, 0.1), q, { layer: LAYER.timber, tint: TINT.rope }, r(), 0.02);
        const ring = new THREE.TorusGeometry(0.075, 0.014, 6, 16);
        ring.rotateX(Math.PI / 2 - 0.5);
        pb.geometry(ring, new THREE.Matrix4().makeTranslation(p.x, p.y + 0.1, p.z), GOLD, r(), 0.3);
        ring.dispose();
        const disc = new THREE.CylinderGeometry(0.065, 0.065, 0.01, 16);
        disc.rotateX(-0.5);
        pb.geometry(disc, new THREE.Matrix4().makeTranslation(p.x, p.y + 0.1, p.z), { layer: LAYER.masonry, tint: TINT.rune }, r(), 0.3);
        disc.dispose();
        break;
      }
      case 'note':
      case 'mural': {
        const q = qY(yaw);
        // A folded parchment with a brass clasp, or a carved panel for a mural.
        if (content === 'mural') pb.box(p.clone().addScaledVector(n, 0.04), V(0.5, 0.35, 0.04), q, { layer: LAYER.masonry, tint: TINT.rune }, r(), 0.02);
        else {
          pb.box(p.clone().add(V(0, 0.012, 0)), V(0.15, 0.012, 0.11), qY(yaw + 0.3), { layer: LAYER.masonry, tint: TINT.chalk }, r(), 0.006);
          pb.box(p.clone().add(V(0, 0.028, 0)), V(0.025, 0.006, 0.03), qY(yaw + 0.3), BRASS, r(), 0.003);
        }
        break;
      }
      case 'keystone': {
        const q = qY(yaw);
        pb.box(p.clone().addScaledVector(n, 0.1), V(0.15, 0.2, 0.1), q, { layer: LAYER.masonry, tint: TINT.rune }, r(), 0.02);
        break;
      }
      case 'secret': {
        // The cracked wall itself is world voxels (B.CRACK); a few loose chips at its foot mark it.
        nuggets(pb, p.clone().addScaledVector(n, 0.05).add(V(0, -0.4, 0)), V(0, 1, 0), 0.4, 5, TINT.none, r() * 1000);
        break;
      }
      default:
        return null;
    }
    const group = new THREE.Group();
    group.name = s.id;
    if (pb.vertexCount) group.add(instanced(pb.build(), this.mats.prop));
    if (cb.pos.length) group.add(instanced(cb.build(), this.mats.crystal));
    if (glow.vertexCount) group.add(instanced(glow.build(), this.mats.glow));
    const box = new THREE.Box3();
    for (const m of group.children as THREE.Mesh[]) {
      m.geometry.computeBoundingBox();
      box.union(m.geometry.boundingBox!);
    }
    if (box.isEmpty()) box.setFromCenterAndSize(p, V(0.4, 0.4, 0.4));
    const centre = box.getCenter(new THREE.Vector3());
    return { id: s.id, type, kind, group, box, centre, flame, left: 1, hidden: false, pop: 0, popTarget: 0 };
  }

  /** The exit's carved octagon plate: masonry, a brass rim, the rune-cyan arrow carved in it (a nav target). */
  private makePlate(node: number, e: ExitPlaced): PropObject {
    const pb = new PropBuilder();
    const p = V(e.plate.x, e.plate.y, e.plate.z);
    const q = qY(e.yaw + Math.PI);
    const oct = new THREE.CylinderGeometry(0.32, 0.32, 0.06, 8);
    oct.rotateX(Math.PI / 2);
    oct.rotateZ(Math.PI / 8);
    pb.geometry(oct, new THREE.Matrix4().compose(p, q, V(1, 1, 1)), MASONRY, 0.4, 1);
    oct.dispose();
    const rim = new THREE.TorusGeometry(0.31, 0.02, 4, 8);
    rim.rotateZ(Math.PI / 8);
    pb.geometry(rim, new THREE.Matrix4().compose(p.clone().add(V(0, 0, 0)), q, V(1, 1, 1)), BRASS, 0.3, 1);
    rim.dispose();
    // A carved down-arrow (the Way Down), lit rune cyan in its groove.
    const fwd = V(0, 0, 1).applyQuaternion(q);
    const arrow: Finish = { layer: LAYER.masonry, tint: TINT.rune };
    pb.box(p.clone().addScaledVector(fwd, 0.035).add(V(0, 0.04, 0)), V(0.025, 0.12, 0.006), q, arrow, 0.5, 0.003);
    for (const sg of [-1, 1]) {
      const hq = q.clone().multiply(new THREE.Quaternion().setFromAxisAngle(V(0, 0, 1), sg * 0.75));
      pb.box(p.clone().addScaledVector(fwd, 0.035).add(V(sg * 0.055, -0.09, 0)), V(0.022, 0.08, 0.006), hq, arrow, 0.5, 0.003);
    }
    const group = new THREE.Group();
    group.add(instanced(pb.build(), this.mats.prop));
    const box = new THREE.Box3().setFromCenterAndSize(p, V(0.8, 0.8, 0.8)).expandByPoint(V(e.pos.x, e.pos.y, e.pos.z));
    return { id: `n${node}:${e.id}`, type: 'nav', kind: 'exit', group, box, centre: p, left: 1, hidden: false, pop: 0, popTarget: 0 };
  }

  private applyState(o: PropObject): void {
    const rim = o.id === this.rimId ? 1 : o.id === this.hintId && this.hintT > 0 ? 0.55 : 0;
    const strike = o.type === 'tappable' && !FOCUS_KINDS.has(o.kind as TappableKind);
    o.group.visible = !o.hidden && !(strike && o.left <= 0 && o.kind !== 'gem');
    for (const m of o.group.children as THREE.InstancedMesh[]) {
      const a = m.geometry.getAttribute('aInst') as THREE.InstancedBufferAttribute;
      // Glow meshes read y as "lit"; crystals read y as remaining (w = 1 enables the dimming).
      const isGlow = m.material === this.mats.glow;
      a.setXYZW(0, rim, isGlow ? (o.lit ? 1 : 0.0) : o.kind === 'gem' ? Math.max(0.15, o.left) : 1, 0, o.kind === 'gem' ? 1 : 0);
      a.needsUpdate = true;
    }
  }

  /**
   * The Ride's pass-by glints (W1-LEAD §3 Ride; source.glints()): an ore knot (copper nuggets in a dark crust) or a
   * crystal knot on the wall within reach of the rails, keyed by the model's glint id (`ride:<node>:<j>`). Built when a
   * run starts, dropped when it ends; a mined glint hides.
   */
  glints(list: ReadonlyArray<{ id: string; kind: 'ore' | 'crystal'; pos: THREE.Vector3; normal: THREE.Vector3; left: number }>, biome: number): void {
    for (const [id, o] of this.objects) {
      if (o.kind !== 'glint' || list.some((g) => g.id === id)) continue;
      this.group.remove(o.group);
      o.group.traverse((m) => (m as THREE.Mesh).geometry?.dispose());
      this.objects.delete(id);
    }
    for (const g of list) {
      let o = this.objects.get(g.id);
      if (!o) {
        o = this.makeGlint(g.id, g.kind, g.pos, g.normal, biome);
        this.objects.set(o.id, o);
        this.group.add(o.group);
        this.applyState(o);
      }
      if (o.left !== g.left) {
        o.left = g.left;
        this.applyState(o);
      }
    }
  }

  private makeGlint(id: string, kind: 'ore' | 'crystal', p: THREE.Vector3, normal: THREE.Vector3, biome: number): PropObject {
    const pb = new PropBuilder(), cb = new CrystalBuilder();
    const n = normal.clone().normalize();
    const r = rng(hashStr(id));
    if (kind === 'crystal') {
      cb.cluster(p, n.clone().add(V(0, 0.5, 0)).normalize(), 4 + Math.floor(r() * 3), 0.3 + r() * 0.12, 0.35, (i) => GEM_PAL(biome, i), Math.floor(r() * 1000));
      nuggets(pb, p, n, 0.3, 4, TINT.trimStone, r() * 1000);
    } else {
      nuggets(pb, p, n, 0.3, 9, biome <= 0 ? TINT.oreCopper : TINT.oreTin, r() * 1000);
      nuggets(pb, p.clone().addScaledVector(n, 0.015), n, 0.16, 3, TINT.gold, r() * 1000);
    }
    const group = new THREE.Group();
    group.name = id;
    if (pb.vertexCount) group.add(instanced(pb.build(), this.mats.prop));
    if (cb.pos.length) group.add(instanced(cb.build(), this.mats.crystal));
    const box = new THREE.Box3();
    for (const m of group.children as THREE.Mesh[]) {
      m.geometry.computeBoundingBox();
      box.union(m.geometry.boundingBox!);
    }
    if (box.isEmpty()) box.setFromCenterAndSize(p, V(0.5, 0.5, 0.5));
    return { id, type: 'tappable', kind: 'glint', group, box, centre: box.getCenter(new THREE.Vector3()), left: 1, hidden: false, pop: 0, popTarget: 0 };
  }

  /** The model's state for every object of a chamber (cheap: only changed objects write). */
  sync(view: ChamberView | null): void {
    if (!view) return;
    for (const o of this.objects.values()) {
      if (o.type === 'nav' || o.kind === 'glint') continue;
      const left = view.left(o.id);
      const lit = o.type === 'lamp' ? view.lit(o.id) || view.content(o.id) === 'litLamp' : false;
      if (left !== o.left || lit !== !!o.lit) {
        o.left = left;
        o.lit = lit;
        this.applyState(o);
      }
    }
  }

  setLit(id: string, lit: boolean): void {
    const o = this.objects.get(id);
    if (!o) return;
    o.lit = lit;
    this.applyState(o);
  }

  setLeft(id: string, left: number): void {
    const o = this.objects.get(id);
    if (!o) return;
    o.left = left;
    this.applyState(o);
  }

  reveal(id: string): void {
    const o = this.objects.get(id);
    if (!o) return;
    o.hidden = false;
    this.applyState(o);
  }

  /** The single amber rim (null = none); a dim hint rim for 0.6 s after a tunk. */
  rim(id: string | null): void {
    const prev = this.rimId;
    this.rimId = id;
    for (const k of [prev, id]) {
      const o = k ? this.objects.get(k) : undefined;
      if (o) this.applyState(o);
    }
  }

  hint(id: string): void {
    const prev = this.hintId;
    this.hintId = id;
    this.hintT = 0.6;
    for (const k of [prev, id]) {
      const o = k ? this.objects.get(k) : undefined;
      if (o) this.applyState(o);
    }
  }

  /** Lit lamps as practicals for the rig (id, flame, colour). */
  litLamps(out: Array<{ id: string; pos: THREE.Vector3; color: number; intensity: number; range: number; shadow: boolean }>): void {
    for (const o of this.objects.values()) if (o.type === 'lamp' && o.lit && o.flame) out.push({ id: o.id, pos: o.flame, color: 0xffb066, intensity: 1.4, range: 5.5, shadow: true });
  }

  /** The focus pop: the object rises toward `target` (1.8 m ahead, eye height − 0.2) in 0.3 s; off returns it. */
  focus(id: string, on: boolean): void {
    const o = this.objects.get(id);
    if (o) o.popTarget = on ? 1 : 0;
  }

  update(dt: number, camera: THREE.Camera): void {
    if (this.hintT > 0) {
      this.hintT -= dt;
      if (this.hintT <= 0 && this.hintId) {
        const o = this.objects.get(this.hintId);
        this.hintId = null;
        if (o) this.applyState(o);
      }
    }
    for (const o of this.objects.values()) {
      if (o.pop === o.popTarget) continue;
      o.pop = o.popTarget > o.pop ? Math.min(1, o.pop + dt / 0.3) : Math.max(0, o.pop - dt / 0.3);
      const e = o.pop * o.pop * (3 - 2 * o.pop);
      const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
      const target = camera.getWorldPosition(new THREE.Vector3()).addScaledVector(fwd, 1.8).add(V(0, -0.25, 0));
      const delta = target.sub(o.centre).multiplyScalar(e);
      o.group.position.copy(delta);
      o.group.rotation.y = e * 0.4;
    }
  }

  /** Nearest object the ray hits (visible ones). */
  raycast(ray: THREE.Ray, maxT: number): { o: PropObject; t: number; point: THREE.Vector3 } | null {
    let best: { o: PropObject; t: number; point: THREE.Vector3 } | null = null;
    const hit = new THREE.Vector3();
    for (const o of this.objects.values()) {
      if (!o.group.visible) continue;
      const box = o.box.clone().expandByScalar(0.06).translate(o.group.position);
      if (!ray.intersectBox(box, hit)) continue;
      const t = hit.distanceTo(ray.origin);
      if (t > maxT) continue;
      if (!best || t < best.t) best = { o, t, point: hit.clone() };
    }
    return best;
  }

  /** Screen targets (CSS px): drawn rect, hit rect padded to ≥ 88 px, distance, visibility (`occluded` tests rock). */
  targets(camera: THREE.Camera, w: number, h: number, occluded: (from: THREE.Vector3, to: THREE.Vector3) => boolean): ScreenTarget[] {
    const out: ScreenTarget[] = [];
    const eye = camera.getWorldPosition(new THREE.Vector3());
    const c = new THREE.Vector3();
    for (const o of this.objects.values()) {
      if (!o.group.visible) continue;
      const box = o.box.clone().translate(o.group.position);
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, behind = false;
      for (let i = 0; i < 8; i++) {
        c.set(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z).project(camera);
        if (c.z > 1) behind = true;
        const x = (c.x * 0.5 + 0.5) * w, y = (-c.y * 0.5 + 0.5) * h;
        x0 = Math.min(x0, x);
        y0 = Math.min(y0, y);
        x1 = Math.max(x1, x);
        y1 = Math.max(y1, y);
      }
      const centre = box.getCenter(new THREE.Vector3());
      const dist = centre.distanceTo(eye);
      const onScreen = !behind && x1 > 0 && y1 > 0 && x0 < w && y0 < h;
      const visible = onScreen && !occluded(eye, centre);
      const drawn = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
      const hw = Math.max(drawn.w, HIT_MIN_PX), hh = Math.max(drawn.h, HIT_MIN_PX);
      const hit = { x: drawn.x + (drawn.w - hw) / 2, y: drawn.y + (drawn.h - hh) / 2, w: hw, h: hh };
      const kind = o.kind;
      out.push({ id: o.id, type: o.type, kind, drawn, hit, dist, visible, state: o.type === 'lamp' ? (o.lit ? 1 : 0) : 1 - o.left });
    }
    return out;
  }

  reachOf(o: PropObject): number {
    return o.type === 'tappable' && FOCUS_KINDS.has(o.kind as TappableKind) ? REACH_FOCUS_M : REACH_STRIKE_M;
  }

  /** Draw calls (stats). */
  get draws(): number {
    let n = 0;
    for (const o of this.objects.values()) if (o.group.visible) n += o.group.children.length;
    return n;
  }

  get tris(): number {
    let n = 0;
    for (const o of this.objects.values()) if (o.group.visible) for (const m of o.group.children as THREE.Mesh[]) n += (m.geometry.index?.count ?? m.geometry.getAttribute('position').count) / 3;
    return n;
  }

  dispose(): void {
    for (const o of this.objects.values()) o.group.traverse((m) => (m as THREE.Mesh).geometry?.dispose());
    this.objects.clear();
  }

  /** Scratch for callers. */
  get scratch(): THREE.Vector3 {
    return this.tmp;
  }
}

/** What a socket holds when the model gives no contents (the lab, captures). */
function defaultContent(s: SocketPlaced): string | null {
  switch (s.kind) {
    case 'vein':
      return 'vein';
    case 'gem':
      return 'gem';
    case 'lamp':
      return s.lit ? 'litLamp' : 'lamp';
    case 'feature':
      return 'chest';
    case 'stash':
      return 'stash';
    case 'secret':
      return 'secret';
    case 'cache':
      return 'cache';
    case 'note':
      return 'note';
    case 'keystone':
      return null;
    default:
      return null;
  }
}

function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

export { WOOD };
