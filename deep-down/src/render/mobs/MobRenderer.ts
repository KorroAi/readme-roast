import * as THREE from 'three';
import { LIGHTING_GLSL, type LightingUniforms } from '../lighting';
import type { Marker, MobSim, SimMob } from '../../game/mobs/MobSim';
import type { MobKind } from '../../game/mobs/types';
import { mobModel, type MobModel } from './models';
import { createInstancedMobMaterial } from './mobMaterial';
import { pose, poseWorm, type PoseOut } from './poses';
import { ellipsoid, fin, limb, merge, place, Rig, MAX_BONES } from './rig';

/**
 * Draws the creatures (rounds 2-3, MOBS), instanced: one draw call per creature kind in view
 * (and one more for a translucent shell, the jelly's bell and the lamplings' glass), however
 * many of that kind are about. Every creature's posed bones (world space) are a row of one float
 * texture; its flash, fade, glow, seed and highlight are instance attributes. The selected
 * creature's outline is one more instanced draw of its kind. The lumen moths are one instanced
 * swarm, the soft glows (lamplings, light shards, spits, cores) one instanced draw, and the
 * telegraph markers on the ground one more. 30+ creatures stay within a handful of draws.
 *
 * VIS's HighlightSystem drives a creature's rim and selection through `uHiColor` / `uHi` uniforms
 * on the materials under `mob.object`: each creature keeps a proxy object (an invisible box of its
 * size, at its body) whose material carries them, and its values are read into the instance.
 */
interface View {
  mob: SimMob;
  model: MobModel;
  root: THREE.Group;
  proxy: THREE.Mesh;
  hi: { uHiColor: { value: THREE.Vector3 }; uHi: { value: THREE.Vector2 } };
  rig: Rig;
}

/** Instances drawn at most at once (their bone rows). */
export const MOB_INSTANCES = 96;
const GLOW_MAX = 128;
const MOTH_MAX = 48;
const MARK_MAX = 48;
const ROW = MAX_BONES * 3;

class Batch {
  readonly mesh: THREE.Mesh;
  readonly geo: THREE.InstancedBufferGeometry;
  private readonly row: Float32Array;
  private readonly a: Float32Array;
  private readonly hi: Float32Array;
  private readonly sel: Float32Array;
  private readonly attrs: THREE.InstancedBufferAttribute[];
  n = 0;

  constructor(base: THREE.BufferGeometry, readonly mat: THREE.ShaderMaterial, name: string) {
    const g = new THREE.InstancedBufferGeometry();
    for (const k of ['position', 'normal', 'color', 'aBone', 'aMat']) g.setAttribute(k, base.getAttribute(k));
    g.setIndex(base.getIndex());
    this.row = new Float32Array(MOB_INSTANCES);
    this.a = new Float32Array(MOB_INSTANCES * 4);
    this.hi = new Float32Array(MOB_INSTANCES * 4);
    this.sel = new Float32Array(MOB_INSTANCES);
    const mk = (arr: Float32Array, k: number) => new THREE.InstancedBufferAttribute(arr, k).setUsage(THREE.DynamicDrawUsage);
    const ar = mk(this.row, 1);
    const aa = mk(this.a, 4);
    const ah = mk(this.hi, 4);
    const as = mk(this.sel, 1);
    g.setAttribute('iRow', ar);
    g.setAttribute('iA', aa);
    g.setAttribute('iHi', ah);
    g.setAttribute('iSel', as);
    this.attrs = [ar, aa, ah, as];
    g.instanceCount = 0;
    this.geo = g;
    this.mesh = new THREE.Mesh(g, mat);
    this.mesh.frustumCulled = false;
    this.mesh.name = name;
    this.mesh.userData.highlightHull = true;
    this.mesh.visible = false;
  }

  push(row: number, flash: number, fade: number, glow: number, seed: number, hc: THREE.Vector3, amb: number, sel: number): void {
    if (this.n >= MOB_INSTANCES) return;
    const i = this.n++;
    this.row[i] = row;
    this.a.set([flash, fade, glow, seed], i * 4);
    this.hi.set([hc.x, hc.y, hc.z, amb], i * 4);
    this.sel[i] = sel;
  }

  end(): void {
    this.geo.instanceCount = this.n;
    this.mesh.visible = this.n > 0;
    if (this.n === 0) return;
    const sizes = [1, 4, 4, 1];
    this.attrs.forEach((at, k) => {
      at.clearUpdateRanges();
      at.addUpdateRange(0, this.n * sizes[k]);
      at.needsUpdate = true;
    });
    this.n = 0;
  }

  dispose(): void {
    this.geo.dispose();
    this.mat.dispose();
  }
}

interface Batches {
  body: Batch;
  shell: Batch | null;
  hull: Batch;
}

const proxyBox = new THREE.BoxGeometry(2, 2, 2);

export class MobRenderer {
  readonly group = new THREE.Group();
  private readonly views = new Map<number, View>();
  private readonly batches = new Map<MobModel, Batches>();
  private readonly glows: GlowSprites;
  private readonly moths: MothSwarm;
  private readonly marks: MarkerDecals;
  private readonly bones: Float32Array;
  readonly boneTex: THREE.DataTexture;
  private readonly out: PoseOut = { glow: 1, lift: 0, sx: 1, sy: 1, sz: 1, pitch: 0, roll: 0 };
  private readonly basis = new THREE.Matrix4();
  private readonly world = new THREE.Matrix4();
  private readonly mtmp = new THREE.Matrix4();
  private readonly vUp = new THREE.Vector3();
  private readonly vF = new THREE.Vector3();
  private readonly vR = new THREE.Vector3();
  private readonly vP = new THREE.Vector3();
  private readonly vS = new THREE.Vector3();
  private readonly q = new THREE.Quaternion();
  private readonly q2 = new THREE.Quaternion();
  private readonly e = new THREE.Euler();
  private readonly frustum = new THREE.Frustum();
  private readonly sphere = new THREE.Sphere();
  private readonly viewport = new THREE.Vector2(1, 1);
  /** Creatures drawn last frame, and the draw calls they took. */
  drawnCount = 0;
  drawCalls = 0;

  constructor(private readonly lighting: LightingUniforms) {
    this.group.name = 'mobs';
    this.bones = new Float32Array(ROW * MOB_INSTANCES * 4);
    this.boneTex = new THREE.DataTexture(this.bones, ROW, MOB_INSTANCES, THREE.RGBAFormat, THREE.FloatType);
    this.boneTex.magFilter = THREE.NearestFilter;
    this.boneTex.minFilter = THREE.NearestFilter;
    this.boneTex.generateMipmaps = false;
    this.boneTex.needsUpdate = true;
    this.glows = new GlowSprites(lighting);
    this.moths = new MothSwarm(lighting);
    this.marks = new MarkerDecals(lighting);
    this.group.add(this.glows.mesh, this.moths.mesh, this.marks.mesh);
    // Build the first world's creatures' geometry ahead of the first meeting, one per tick (never one long stall).
    const todo: Array<[MobKind, number]> = [['crawler', 0], ['wisp', 0], ['gnasher', 0], ['glimmerkin', 0], ['lampling', 0], ['jelly', 0], ['burrower', 0], ['shellback', 0], ['stalker', 0], ['sentinel', 0], ['worm', 0], ['burrower', 1]];
    const next = () => {
      const k = todo.shift();
      if (!k) return;
      mobModel(k[0], k[1]);
      setTimeout(next, 30);
    };
    if (typeof setTimeout === 'function') setTimeout(next, 500);
  }

  /** Warm the models of a biome's roster (a stratum's arrival), one per tick. */
  prepare(kinds: readonly MobKind[]): void {
    const todo = [...kinds];
    const next = () => {
      const k = todo.shift();
      if (!k) return;
      if (k !== 'moth') this.batchesOf(mobModel(k, 0));
      setTimeout(next, 25);
    };
    if (typeof setTimeout === 'function') setTimeout(next, 50);
  }

  private batchesOf(model: MobModel): Batches {
    let b = this.batches.get(model);
    if (b) return b;
    const body = new Batch(model.geometry, createInstancedMobMaterial(this.lighting, this.boneTex, model.look), 'mobBatch');
    body.mesh.renderOrder = model.look.smoke ? 8 : 0;
    let shell: Batch | null = null;
    if (model.shell) {
      shell = new Batch(model.shell.model.geometry, createInstancedMobMaterial(this.lighting, this.boneTex, model.shell.look), 'mobShellBatch');
      shell.mesh.renderOrder = 7;
    }
    const hullMat = createInstancedMobMaterial(this.lighting, this.boneTex, model.look, true);
    const hull = new Batch(model.geometry, hullMat, 'mobHullBatch');
    hull.mesh.renderOrder = 41;
    hull.mesh.onBeforeRender = (r) => r.getDrawingBufferSize(hullMat.uniforms.uViewport.value as THREE.Vector2);
    this.group.add(body.mesh, hull.mesh);
    if (shell) this.group.add(shell.mesh);
    b = { body, shell, hull };
    this.batches.set(model, b);
    return b;
  }

  /** The view of a new creature: its proxy (for highlights and picking) and its rig. */
  private viewOf(m: SimMob): View | null {
    let v = this.views.get(m.id);
    if (v) return v;
    if (m.brain === 'moth') return null;
    const model = mobModel(m.kind, m.brain === 'thief' && m.treasure ? 1 : 0);
    const hi = { uHiColor: { value: new THREE.Vector3(1, 1, 1) }, uHi: { value: new THREE.Vector2(0, 0) } };
    const proxyMat = new THREE.ShaderMaterial({ uniforms: hi });
    const proxy = new THREE.Mesh(proxyBox, proxyMat);
    proxy.visible = false;
    proxy.userData.highlightHull = true;
    const root = new THREE.Group();
    root.name = `mob:${m.kind}:${m.id}`;
    root.add(proxy);
    this.group.add(root);
    m.object = root;
    v = { mob: m, model, root, proxy, hi, rig: new Rig(model.bones) };
    this.views.set(m.id, v);
    this.batchesOf(model);
    return v;
  }

  /** A creature left the world. */
  drop(m: SimMob): void {
    const v = this.views.get(m.id);
    if (!v) return;
    this.group.remove(v.root);
    (v.proxy.material as THREE.Material).dispose();
    this.views.delete(m.id);
    m.object = undefined;
  }

  /** Pose and place every creature for this frame, fill the instance batches. */
  sync(sim: MobSim, time: number, camera: THREE.Camera, pixelHeight: number, fov: number): void {
    const g = this.glows;
    g.begin();
    this.moths.begin();
    camera.updateMatrixWorld();
    this.mtmp.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(this.mtmp);
    let row = 0;
    let drawn = 0;
    for (const m of sim.mobs) {
      if (m.brain === 'moth') {
        this.moths.push(m, time);
        continue;
      }
      const v = this.viewOf(m);
      if (!v) continue;
      const o = this.out;
      if (m.brain === 'vista') {
        poseWorm(m, v.model, v.rig);
        this.world.identity();
        v.root.position.copy(m.position);
      } else {
        pose(m, v.model, v.rig, time, o);
        v.rig.update();
        this.place(m, o);
        v.root.position.copy(this.vP);
      }
      // The proxy: a box of the creature's size at its body.
      const sc = m.scale;
      v.root.scale.set(m.bounds.radius + 0.05, m.bounds.halfHeight + m.bounds.radius + 0.05, m.bounds.radius + 0.05);
      v.root.quaternion.identity();
      v.root.updateMatrixWorld();
      if (m.fade <= 0.01) continue;
      // Cull what is out of view (the worm is always drawn while it passes).
      if (m.brain !== 'vista') {
        this.sphere.center.copy(this.vP);
        this.sphere.radius = v.model.radius * sc * 1.4 + 0.6;
        if (!this.frustum.intersectsSphere(this.sphere)) continue;
      }
      if (row >= MOB_INSTANCES) continue;
      // Bones to the texture row (world = root x bone).
      const nb = v.model.bones.length;
      const base = row * ROW * 4;
      for (let i = 0; i < nb; i++) {
        const mm = m.brain === 'vista' ? v.rig.matrices[i] : this.mtmp.multiplyMatrices(this.world, v.rig.matrices[i]);
        const e = mm.elements;
        const k = base + i * 12;
        // Rows of the 3x4 (column-major elements).
        this.bones[k] = e[0];
        this.bones[k + 1] = e[4];
        this.bones[k + 2] = e[8];
        this.bones[k + 3] = e[12];
        this.bones[k + 4] = e[1];
        this.bones[k + 5] = e[5];
        this.bones[k + 6] = e[9];
        this.bones[k + 7] = e[13];
        this.bones[k + 8] = e[2];
        this.bones[k + 9] = e[6];
        this.bones[k + 10] = e[10];
        this.bones[k + 11] = e[14];
      }
      const bt = this.batches.get(v.model) ?? this.batchesOf(v.model);
      const hc = v.hi.uHiColor.value;
      const amb = v.hi.uHi.value.x;
      const sel = v.hi.uHi.value.y;
      bt.body.push(row, m.flash, m.fade, o.glow, m.seed, hc, amb, sel);
      if (bt.shell) bt.shell.push(row, m.flash * 0.6, m.fade, o.glow, m.seed, hc, amb, sel);
      if (sel > 0.01 && m.fade > 0.5) bt.hull.push(row, 0, m.fade, 0, m.seed, hc, 0, sel);
      row++;
      drawn++;
      this.glowsOf(m, o);
    }
    // Light shards in flight (and where they fell, fading).
    for (const s of sim.shots) {
      if (s.landed < 0) g.push(s.p.x, s.p.y, s.p.z, 1.0, 0.92, 0.7, 0.55);
      else g.push(s.p.x, s.p.y, s.p.z, 1.0, 0.85, 0.55, 1.4 * Math.max(0, 1 - s.landed / 2.5));
    }
    // Hostile spits: a bright core and a softer halo in their colour (they must be seen coming).
    for (const s of sim.spits) {
      const c = hexRgb(s.def.color);
      if (s.done < 0) {
        g.push(s.p.x, s.p.y, s.p.z, c[0], c[1], c[2], 1.1);
        g.push(s.p.x - s.v.x * 0.03, s.p.y - s.v.y * 0.03, s.p.z - s.v.z * 0.03, c[0], c[1], c[2], 0.5);
      } else g.push(s.p.x, s.p.y, s.p.z, c[0], c[1], c[2], 1.6 * Math.max(0, 1 - s.done / 0.6));
    }
    for (const sp of this.spores) g.push(sp.x, sp.y, sp.z, 0.55, 0.95, 1.0, 0.16 * Math.max(0, sp.life));
    if (row > 0) {
      this.boneTex.needsUpdate = true;
    }
    let calls = 0;
    for (const b of this.batches.values()) {
      for (const x of [b.body, b.shell, b.hull]) {
        if (!x) continue;
        if (x.n > 0) calls++;
        x.end();
      }
    }
    this.marks.sync(sim.markers, time);
    g.end(pixelHeight, fov);
    this.moths.end(pixelHeight, fov);
    this.drawnCount = drawn;
    this.drawCalls = calls + (this.glows.mesh.visible ? 1 : 0) + (this.moths.mesh.visible ? 1 : 0) + (this.marks.mesh.visible ? 1 : 0);
    void this.viewport;
  }

  /** What carries its own light. */
  private glowsOf(m: SimMob, o: PoseOut): void {
    const g = this.glows;
    const p = this.vP;
    if (m.brain === 'lamp') {
      const c = hexRgb(m.def.mote);
      g.push(p.x, p.y, p.z, c[0], c[1], c[2], 0.4 * m.fade * o.glow);
    } else if (m.brain === 'float') g.push(p.x, p.y + 0.1, p.z, 0.35, 0.75, 1.0, 1.6 * m.fade * (m.tappable ? 1 : 0.5));
    else if (m.kind === 'sentinel' && m.open > 0.3) {
      this.vF.set(0, -0.05, 0.38).applyQuaternion(this.q).multiplyScalar(m.scale).add(p);
      g.push(this.vF.x, this.vF.y, this.vF.z, 1.0, 0.75, 0.35, 1.1 * m.open * m.fade);
    } else if (m.brain === 'mimic' && m.open > 0.2) {
      const c = hexRgb(m.def.mote);
      g.push(p.x, p.y + 0.05, p.z, c[0], c[1], c[2], 0.9 * m.open * m.fade);
    } else if (m.brain === 'thief' && m.treasure) g.push(p.x, p.y + 0.05, p.z, 1.0, 0.8, 0.3, 0.5 * m.fade);
    else if (m.brain === 'fuse' && m.fused) {
      const c = hexRgb(m.def.mote);
      g.push(p.x, p.y, p.z, c[0], c[1], c[2], (0.6 + 0.6 * Math.sin(m.stateTime * 30)) * m.fade);
    } else if ((m.brain === 'spit' || m.guardian) && m.state === 'windup') {
      const c = hexRgb(m.def.shot?.color ?? m.def.mote);
      this.vF.set(0, 0, m.bounds.radius).applyQuaternion(this.q).add(p);
      g.push(this.vF.x, this.vF.y, this.vF.z, c[0], c[1], c[2], m.strike * (m.guardian ? 1.6 : 0.9));
    } else if (m.guardian && m.vulnerable) {
      const c = hexRgb(m.def.mote);
      g.push(p.x, p.y, p.z, c[0], c[1], c[2], 0.9 + 0.4 * Math.sin(m.stateTime * 9));
    }
  }

  /** Light spores (a drift jelly's gift): a short rising cloud of motes. */
  private readonly spores: Array<{ x: number; y: number; z: number; vx: number; vy: number; vz: number; life: number }> = [];
  burstSpores(x: number, y: number, z: number, n = 18): void {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.random();
      this.spores.push({ x, y, z, vx: Math.sin(a) * r * 1.2, vy: 0.3 + Math.random() * 0.9, vz: Math.cos(a) * r * 1.2, life: 1 + Math.random() * 1.2 });
    }
    if (this.spores.length > 40) this.spores.splice(0, this.spores.length - 40);
  }

  /** Advance the spores toward the eye (they feed the lantern). */
  step(dt: number, tx: number, ty: number, tz: number): void {
    for (let i = this.spores.length - 1; i >= 0; i--) {
      const s = this.spores[i];
      s.life -= dt * 0.7;
      if (s.life <= 0) {
        this.spores.splice(i, 1);
        continue;
      }
      const k = Math.min(1, dt * 1.4);
      s.vx += ((tx - s.x) * 1.2 - s.vx) * k * 0.5;
      s.vy += ((ty - s.y) * 1.2 - s.vy) * k * 0.5;
      s.vz += ((tz - s.z) * 1.2 - s.vz) * k * 0.5;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.z += s.vz * dt;
    }
  }

  /** The creature's root transform into `world` (and its position into vP, its rotation into q). */
  private place(m: SimMob, o: PoseOut): void {
    const sc = m.scale;
    if (m.def.locomotion === 'crawl') {
      // On the rock: up is the surface normal, forward the heading projected on it.
      const up = this.vUp.copy(m.up);
      const f = this.vF.set(Math.sin(m.yaw), 0, Math.cos(m.yaw));
      f.addScaledVector(up, -f.dot(up));
      if (f.lengthSq() < 1e-4) f.set(1, 0, 0).addScaledVector(up, -up.x);
      f.normalize();
      const right = this.vR.crossVectors(up, f).normalize();
      this.basis.makeBasis(right, up, f);
      this.q.setFromRotationMatrix(this.basis);
      this.q2.setFromEuler(this.e.set(o.pitch, 0, o.roll));
      this.q.multiply(this.q2);
      this.vP.copy(m.position).addScaledVector(up, o.lift * sc);
    } else {
      this.q.setFromEuler(this.e.set(o.pitch, m.yaw, o.roll, 'YXZ'));
      this.vP.copy(m.position);
      this.vP.y += o.lift * sc;
    }
    this.vS.set(sc * o.sx, sc * o.sy, sc * o.sz);
    this.world.compose(this.vP, this.q, this.vS);
  }

  get drawn(): number {
    return this.views.size;
  }

  dispose(): void {
    for (const v of [...this.views.values()]) this.drop(v.mob);
    for (const b of this.batches.values()) {
      b.body.dispose();
      b.shell?.dispose();
      b.hull.dispose();
    }
    this.batches.clear();
    this.boneTex.dispose();
    this.glows.dispose();
    this.moths.dispose();
    this.marks.dispose();
  }
}

const rgbCache = new Map<number, [number, number, number]>();
const col = new THREE.Color();
function hexRgb(hex: number): [number, number, number] {
  let c = rgbCache.get(hex);
  if (!c) {
    col.setHex(hex, THREE.SRGBColorSpace);
    c = [col.r, col.g, col.b];
    rgbCache.set(hex, c);
  }
  return c;
}

// ---------------------------------------------------------------------------------------
// The telegraphs on the ground: discs, lanes, targets, rolling waves and ripples, one draw.

const markVert = /* glsl */ `
in vec2 aCorner;
in vec4 iA;
in vec4 iB;
in vec4 iC;
out vec2 vUv;
out vec4 vB;
out vec4 vC;
out vec3 vWorldPos;
out float vDepth;
out float vLen;
void main() {
  // iA: centre xyz, radius; iB: dir x z, length, kind; iC: colour rgb, progress.
  vec3 c = iA.xyz;
  float r = iA.w;
  float kind = iB.w;
  vec2 d = normalize(iB.xy + vec2(0.0, 1e-5));
  vec2 side = vec2(d.y, -d.x);
  vec3 p;
  if (kind > 0.5 && kind < 1.5) {
    // A lane: from the centre along the direction, r wide each side.
    float along = (aCorner.y * 0.5 + 0.5) * iB.z;
    p = c + vec3(d.x * along + side.x * aCorner.x * r, 0.0, d.y * along + side.y * aCorner.x * r);
    vUv = vec2(aCorner.x, aCorner.y * 0.5 + 0.5);
    vLen = iB.z;
  } else {
    float ext = kind > 2.5 && kind < 3.5 ? r + 0.6 : r;
    p = c + vec3(aCorner.x * ext, 0.0, aCorner.y * ext);
    vUv = aCorner * ext / max(r, 0.01);
    vLen = r;
  }
  p.y += 0.06;
  vB = iB;
  vC = iC;
  vWorldPos = p;
  vec4 mv = viewMatrix * vec4(p, 1.0);
  vDepth = length(mv.xyz);
  gl_Position = projectionMatrix * mv;
}
`;

const markFrag = /* glsl */ `
precision highp float;
${LIGHTING_GLSL}
uniform float uTime;
in vec2 vUv;
in vec4 vB;
in vec4 vC;
in vec3 vWorldPos;
in float vDepth;
in float vLen;
layout(location = 0) out highp vec4 fragColor;
void main() {
  float kind = vB.w;
  float prog = clamp(vC.a, 0.0, 1.0);
  float a = 0.0;
  if (kind < 0.5) {
    // Disc: a crisp rim, a faint fill, and the fill growing from the centre as the blow comes.
    float d = length(vUv);
    if (d > 1.0) discard;
    float rim = smoothstep(0.86, 0.95, d) * (1.0 - smoothstep(0.97, 1.0, d));
    float fill = step(d, prog) * 0.32 + 0.08;
    a = rim * 0.95 + fill;
  } else if (kind < 1.5) {
    // Lane: edges and chevrons running along it; it fills up from the start.
    float x = abs(vUv.x);
    float edge = smoothstep(0.82, 0.95, x) * (1.0 - smoothstep(0.97, 1.0, x));
    float chev = step(0.5, fract(vUv.y * vLen * 0.6 - x * 0.6 - uTime * 2.0)) * 0.18;
    float fill = step(vUv.y, prog) * 0.28;
    a = edge * 0.9 + chev + fill + 0.05;
    a *= smoothstep(1.0, 0.92, vUv.y);
  } else if (kind < 2.5) {
    // Target: rings closing in on the spot.
    float d = length(vUv);
    if (d > 1.0) discard;
    float k = 1.0 - prog;
    float ring = smoothstep(0.08, 0.0, abs(d - (0.25 + k * 0.75)));
    float cross = (smoothstep(0.06, 0.0, abs(vUv.x)) + smoothstep(0.06, 0.0, abs(vUv.y))) * step(d, 0.35);
    a = ring + cross * 0.8 + smoothstep(0.98, 0.9, d) * smoothstep(0.85, 0.95, d) * 0.6;
  } else if (kind < 3.5) {
    // Wave: the band where it is now.
    float d = length(vUv) * vLen;
    float band = smoothstep(0.75, 0.0, abs(d - vLen + 0.35));
    a = band * 1.1;
  } else {
    // Ripple: dust over something moving under the floor.
    float d = length(vUv);
    if (d > 1.0) discard;
    float w = 0.5 + 0.5 * sin(d * 14.0 - uTime * 9.0);
    a = w * (1.0 - d) * 0.6;
  }
  vec4 atm = atmosphere(vWorldPos, vDepth, vec3(0.0));
  vec3 col = vC.rgb * a * (1.0 - atm.a * 0.7) * uAtmos.w * 1.6;
  fragColor = vec4(sceneOut(col), 1.0);
}
`;

const KIND_CODE: Record<Marker['kind'], number> = { disc: 0, line: 1, target: 2, wave: 3, ripple: 4 };

class MarkerDecals {
  readonly mesh: THREE.Mesh;
  private readonly geo: THREE.InstancedBufferGeometry;
  private readonly mat: THREE.ShaderMaterial;
  private readonly a = new Float32Array(MARK_MAX * 4);
  private readonly b = new Float32Array(MARK_MAX * 4);
  private readonly c = new Float32Array(MARK_MAX * 4);
  private readonly attrs: THREE.InstancedBufferAttribute[];

  constructor(lighting: LightingUniforms) {
    const g = new THREE.InstancedBufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(12), 3));
    g.setAttribute('aCorner', new THREE.BufferAttribute(new Float32Array([-1, -1, 1, -1, 1, 1, -1, 1]), 2));
    g.setIndex([0, 1, 2, 0, 2, 3]);
    const mk = (arr: Float32Array) => new THREE.InstancedBufferAttribute(arr, 4).setUsage(THREE.DynamicDrawUsage);
    this.attrs = [mk(this.a), mk(this.b), mk(this.c)];
    g.setAttribute('iA', this.attrs[0]);
    g.setAttribute('iB', this.attrs[1]);
    g.setAttribute('iC', this.attrs[2]);
    g.instanceCount = 0;
    this.geo = g;
    this.mat = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      uniforms: { ...lighting },
      vertexShader: markVert,
      fragmentShader: markFrag,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
    this.mesh = new THREE.Mesh(g, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 6;
    this.mesh.name = 'mobTelegraphs';
    this.mesh.userData.highlightHull = true;
    this.mesh.visible = false;
  }

  sync(markers: readonly Marker[], _time: number): void {
    let n = 0;
    for (const mk of markers) {
      if (n >= MARK_MAX) break;
      const c = hexRgb(mk.color);
      // Telegraphs read warm-bright whatever the creature's colour: mixed toward a warning amber.
      const w = 0.45;
      this.a.set([mk.x, mk.y, mk.z, mk.kind === 'wave' ? mk.r : mk.r], n * 4);
      this.b.set([mk.dx, mk.dz, mk.len, KIND_CODE[mk.kind]], n * 4);
      this.c.set([c[0] * (1 - w) + 1.0 * w, c[1] * (1 - w) + 0.55 * w, c[2] * (1 - w) + 0.25 * w, mk.progress], n * 4);
      n++;
    }
    this.geo.instanceCount = n;
    this.mesh.visible = n > 0;
    if (n === 0) return;
    for (const at of this.attrs) {
      at.clearUpdateRanges();
      at.addUpdateRange(0, n * 4);
      at.needsUpdate = true;
    }
  }

  dispose(): void {
    this.geo.dispose();
    this.mat.dispose();
  }
}

// ---------------------------------------------------------------------------------------

const glowVert = /* glsl */ `
in vec2 aCorner;
in vec3 iPos;
in vec4 iColor;
uniform float uPixelScale;
out vec2 vUv;
out vec4 vCol;
out vec3 vWorldPos;
out float vDepth;
void main() {
  vec4 mv = viewMatrix * vec4(iPos, 1.0);
  float z = max(0.1, -mv.z);
  float span = max(0.35 + iColor.a * 0.25, 5.0 * z / uPixelScale);
  mv.xy += aCorner * span;
  vUv = aCorner;
  vCol = iColor;
  vWorldPos = iPos;
  vDepth = length(mv.xyz);
  // A glow right at the lens would be a blot: fade it.
  vCol.a *= smoothstep(0.4, 1.2, vDepth);
  gl_Position = projectionMatrix * mv;
}
`;

const glowFrag = /* glsl */ `
precision highp float;
${LIGHTING_GLSL}
in vec2 vUv;
in vec4 vCol;
in vec3 vWorldPos;
in float vDepth;
layout(location = 0) out highp vec4 fragColor;
void main() {
  float d = dot(vUv, vUv);
  if (d > 1.0) discard;
  float a = exp(-d * 9.0) * 0.9 + exp(-d * 2.6) * 0.18;
  float fog = atmosphere(vWorldPos, vDepth, vec3(0.0)).a;
  fragColor = vec4(sceneOut(vCol.rgb * vCol.a * a * (1.0 - fog * 0.8) * uAtmos.w), 1.0);
}
`;

/** Soft additive glows, camera-facing, one draw call. */
class GlowSprites {
  readonly mesh: THREE.Mesh;
  private readonly pos = new Float32Array(GLOW_MAX * 3);
  private readonly col = new Float32Array(GLOW_MAX * 4);
  private readonly geo: THREE.InstancedBufferGeometry;
  private readonly mat: THREE.ShaderMaterial;
  private n = 0;
  private readonly aPos: THREE.InstancedBufferAttribute;
  private readonly aCol: THREE.InstancedBufferAttribute;

  constructor(lighting: LightingUniforms) {
    const g = new THREE.InstancedBufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(12), 3));
    g.setAttribute('aCorner', new THREE.BufferAttribute(new Float32Array([-1, -1, 1, -1, 1, 1, -1, 1]), 2));
    g.setIndex([0, 1, 2, 0, 2, 3]);
    this.aPos = new THREE.InstancedBufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage);
    this.aCol = new THREE.InstancedBufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('iPos', this.aPos);
    g.setAttribute('iColor', this.aCol);
    g.instanceCount = 0;
    this.geo = g;
    this.mat = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      uniforms: { ...lighting, uPixelScale: { value: 600 } },
      vertexShader: glowVert,
      fragmentShader: glowFrag,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.mesh = new THREE.Mesh(g, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 9;
    this.mesh.name = 'mobGlows';
  }

  begin(): void {
    this.n = 0;
  }

  push(x: number, y: number, z: number, r: number, g: number, b: number, a: number): void {
    if (this.n >= GLOW_MAX || a <= 0.002) return;
    this.pos.set([x, y, z], this.n * 3);
    this.col.set([r, g, b, a], this.n * 4);
    this.n++;
  }

  end(pixelHeight: number, fov: number): void {
    this.geo.instanceCount = this.n;
    this.mesh.visible = this.n > 0;
    this.mat.uniforms.uPixelScale.value = pixelHeight / (2 * Math.tan((fov * Math.PI) / 360));
    if (this.n === 0) return;
    for (const [a, k] of [[this.aPos, 3], [this.aCol, 4]] as const) {
      a.clearUpdateRanges();
      a.addUpdateRange(0, this.n * k);
      a.needsUpdate = true;
    }
  }

  dispose(): void {
    this.geo.dispose();
    this.mat.dispose();
  }
}

// ---------------------------------------------------------------------------------------

const mothVert = /* glsl */ `
in float aPart;
in vec3 iPos;
in vec4 iPrm;
out vec3 vWorldPos;
out vec3 vNormal;
out float vDepth;
out float vPart;
out vec2 vWing;
void main() {
  // iPrm: x yaw, y wing phase (radians), z scale, w glow.
  vec3 p = position;
  vec3 n = normal;
  // Wings (aPart 1: left, 2: right) flap round the body's long axis.
  if (aPart > 0.5) {
    float side = aPart < 1.5 ? -1.0 : 1.0;
    float a = sin(iPrm.y) * 1.05 + 0.25;
    float c = cos(a);
    float s = sin(a) * side;
    p = vec3(p.x * c - p.y * s, p.x * s + p.y * c, p.z);
    n = vec3(n.x * c - n.y * s, n.x * s + n.y * c, n.z);
  }
  vWing = position.xz;
  float cy = cos(iPrm.x);
  float sy = sin(iPrm.x);
  p = vec3(p.x * cy + p.z * sy, p.y, -p.x * sy + p.z * cy) * iPrm.z;
  n = vec3(n.x * cy + n.z * sy, n.y, -n.x * sy + n.z * cy);
  vec4 wp = vec4(iPos + p, 1.0);
  vWorldPos = wp.xyz;
  vNormal = n;
  vPart = aPart;
  vec4 mv = viewMatrix * wp;
  vDepth = length(mv.xyz);
  gl_Position = projectionMatrix * mv;
}
`;

const mothFrag = /* glsl */ `
precision highp float;
${LIGHTING_GLSL}
in vec3 vWorldPos;
in vec3 vNormal;
in float vDepth;
in float vPart;
in vec2 vWing;
layout(location = 0) out highp vec4 fragColor;
void main() {
  vec3 n = normalize(vNormal);
  if (!gl_FrontFacing) n = -n;
  vec4 ls = lightSample(vWorldPos + n * 0.2);
  vec3 lan = lanternLight(vWorldPos + n * 0.2, vWorldPos, n, max(ls.a, 0.4), 0.0);
  vec3 col;
  if (vPart < 0.5) {
    // The body: a soft pale-gold glow.
    col = vec3(1.0, 0.82, 0.5) * 1.6;
  } else {
    // Wings: pale dusty cream, an eye spot, a faintly glowing rim; light passes through them.
    float r = length(vWing * vec2(1.0, 1.4)) / 0.075;
    float spot = smoothstep(0.24, 0.18, length(vWing - vec2(sign(vWing.x) * 0.04, -0.01)) / 0.075 * 0.6);
    vec3 alb = mix(vec3(0.86, 0.8, 0.66), vec3(0.35, 0.28, 0.22), spot);
    col = alb * (ambientFrom(ls) * 1.2 + lan * 1.3);
    col += gLanternRad * alb * 0.25;
    col += vec3(1.0, 0.86, 0.55) * smoothstep(0.75, 1.0, r) * 0.55;
  }
  vec4 atm = atmosphere(vWorldPos, vDepth, ls.rgb);
  col = mix(col, atm.rgb, atm.a);
  fragColor = vec4(sceneOut(col), 1.0);
}
`;

/** The lumen moths: a body and four wings per moth, flapping in the vertex shader, one draw call. */
class MothSwarm {
  readonly mesh: THREE.Mesh;
  private readonly geo: THREE.InstancedBufferGeometry;
  private readonly mat: THREE.ShaderMaterial;
  private readonly pos = new Float32Array(MOTH_MAX * 3);
  private readonly prm = new Float32Array(MOTH_MAX * 4);
  private readonly aPos: THREE.InstancedBufferAttribute;
  private readonly aPrm: THREE.InstancedBufferAttribute;
  private n = 0;

  constructor(lighting: LightingUniforms) {
    const body = merge([ellipsoid(0.012, 0.011, 0.03, [0, 0, 0], 8), ellipsoid(0.009, 0.009, 0.01, [0, 0.002, 0.03], 6), limb([0.004, 0.006, 0.035], [0.02, 0.02, 0.06], 0.0015, 0.001, 3), limb([-0.004, 0.006, 0.035], [-0.02, 0.02, 0.06], 0.0015, 0.001, 3)]);
    const wingL = merge([fin([[0, 0.01], [-0.06, 0.03], [-0.075, -0.005], [-0.04, -0.02], [0, -0.005]], 2), place(fin([[0, -0.005], [-0.045, -0.02], [-0.05, -0.045], [-0.01, -0.03]], 2), [0, 0, 0])]);
    const wingR = wingL.clone().applyMatrix4(new THREE.Matrix4().makeScale(-1, 1, 1));
    const parts = [body, wingL, wingR];
    const geoms: THREE.BufferGeometry[] = [];
    const partAttr: number[] = [];
    parts.forEach((g, i) => {
      geoms.push(g);
      for (let k = 0; k < g.getAttribute('position').count; k++) partAttr.push(i);
    });
    const m = merge(geoms);
    const g = new THREE.InstancedBufferGeometry();
    g.setAttribute('position', m.getAttribute('position'));
    g.setAttribute('normal', m.getAttribute('normal'));
    g.setAttribute('aPart', new THREE.Float32BufferAttribute(partAttr, 1));
    g.setIndex(m.getIndex());
    this.aPos = new THREE.InstancedBufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage);
    this.aPrm = new THREE.InstancedBufferAttribute(this.prm, 4).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('iPos', this.aPos);
    g.setAttribute('iPrm', this.aPrm);
    g.instanceCount = 0;
    this.geo = g;
    this.mat = new THREE.ShaderMaterial({ glslVersion: THREE.GLSL3, uniforms: { ...lighting }, vertexShader: mothVert, fragmentShader: mothFrag, side: THREE.DoubleSide });
    this.mesh = new THREE.Mesh(g, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.name = 'lumenMothsSwarm';
  }

  begin(): void {
    this.n = 0;
  }

  push(m: SimMob, _t: number): void {
    if (this.n >= MOTH_MAX || m.fade <= 0.05) return;
    this.pos.set([m.position.x, m.position.y, m.position.z], this.n * 3);
    this.prm.set([m.yaw, m.gait, m.scale * 1.6 * m.fade, 1], this.n * 4);
    this.n++;
  }

  end(_h: number, _fov: number): void {
    this.geo.instanceCount = this.n;
    this.mesh.visible = this.n > 0;
    if (this.n === 0) return;
    for (const [a, k] of [[this.aPos, 3], [this.aPrm, 4]] as const) {
      a.clearUpdateRanges();
      a.addUpdateRange(0, this.n * k);
      a.needsUpdate = true;
    }
  }

  dispose(): void {
    this.geo.dispose();
    this.mat.dispose();
  }
}
