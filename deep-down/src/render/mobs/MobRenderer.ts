import * as THREE from 'three';
import { LIGHTING_GLSL, type LightingUniforms } from '../lighting';
import type { MobSim, SimMob } from '../../game/mobs/MobSim';
import type { MobKind } from '../../game/mobs/types';
import { mobModel, type MobModel } from './models';
import { createMobHull, createMobMaterial } from './mobMaterial';
import { pose, poseWorm, type PoseOut } from './poses';
import { ellipsoid, fin, limb, merge, place, Rig } from './rig';

/**
 * Draws the creatures (round 2, MOBS): one skinned mesh per creature (plus a translucent shell for
 * the jelly's bell and the lamplings' glass), its selection outline (shown only while VIS selects
 * it), the lumen moths as one instanced swarm, and soft additive glows (lamplings, light shards,
 * spores, the Sentinel's core) as one instanced draw. About 1-2 draw calls per creature.
 */
interface View {
  mob: SimMob;
  model: MobModel;
  root: THREE.Group;
  body: THREE.Mesh;
  shell: THREE.Mesh | null;
  hull: THREE.Mesh;
  mat: THREE.ShaderMaterial;
  shellMat: THREE.ShaderMaterial | null;
  rig: Rig;
}

const GLOW_MAX = 64;
const MOTH_MAX = 48;

export class MobRenderer {
  readonly group = new THREE.Group();
  private readonly views = new Map<number, View>();
  private readonly glows: GlowSprites;
  private readonly moths: MothSwarm;
  private readonly out: PoseOut = { glow: 1, lift: 0, sx: 1, sy: 1, sz: 1, pitch: 0, roll: 0 };
  private readonly basis = new THREE.Matrix4();
  private readonly vUp = new THREE.Vector3();
  private readonly vF = new THREE.Vector3();
  private readonly vR = new THREE.Vector3();
  private readonly q = new THREE.Quaternion();
  private readonly q2 = new THREE.Quaternion();
  private readonly e = new THREE.Euler();

  constructor(private readonly lighting: LightingUniforms) {
    this.group.name = 'mobs';
    this.glows = new GlowSprites(lighting);
    this.moths = new MothSwarm(lighting);
    this.group.add(this.glows.mesh, this.moths.mesh);
    // Build every creature's geometry ahead of the first meeting, one per tick (never one long stall).
    const todo: Array<[MobKind, number]> = [['crawler', 0], ['wisp', 0], ['gnasher', 0], ['glimmerkin', 0], ['lampling', 0], ['jelly', 0], ['burrower', 0], ['shellback', 0], ['stalker', 0], ['sentinel', 0], ['worm', 0], ['burrower', 1]];
    const next = () => {
      const k = todo.shift();
      if (!k) return;
      mobModel(k[0], k[1]);
      setTimeout(next, 30);
    };
    if (typeof setTimeout === 'function') setTimeout(next, 500);
  }

  /** Build the view of a new creature (models are built once per kind). */
  private viewOf(m: SimMob): View | null {
    let v = this.views.get(m.id);
    if (v) return v;
    if (m.kind === 'moth') return null;
    const model = mobModel(m.kind, m.kind === 'burrower' && m.treasure ? 1 : 0);
    const rig = new Rig(model.bones);
    const mat = createMobMaterial(this.lighting, rig.matrices, model.look, m.seed);
    const body = new THREE.Mesh(model.geometry, mat);
    body.frustumCulled = m.kind !== 'worm';
    body.userData.highlightHull = true;
    body.renderOrder = model.look.smoke ? 8 : 0;
    const root = new THREE.Group();
    root.name = `mob:${m.kind}:${m.id}`;
    root.add(body);
    let shell: THREE.Mesh | null = null;
    let shellMat: THREE.ShaderMaterial | null = null;
    if (model.shell) {
      shellMat = createMobMaterial(this.lighting, rig.matrices, model.shell.look, m.seed);
      // The shell shares the body's highlight and fade.
      shellMat.uniforms.uHiColor = mat.uniforms.uHiColor;
      shellMat.uniforms.uHi = mat.uniforms.uHi;
      shell = new THREE.Mesh(model.shell.model.geometry, shellMat);
      shell.renderOrder = 7;
      shell.userData.highlightHull = true;
      root.add(shell);
    }
    const hullMat = createMobHull(mat);
    const hull = new THREE.Mesh(model.geometry, hullMat);
    hull.renderOrder = 41;
    hull.userData.highlightHull = true;
    hull.visible = false;
    hull.onBeforeRender = (r) => r.getDrawingBufferSize(hullMat.uniforms.uViewport.value as THREE.Vector2);
    root.add(hull);
    this.group.add(root);
    m.object = root;
    v = { mob: m, model, root, body, shell, hull, mat, shellMat, rig };
    this.views.set(m.id, v);
    return v;
  }

  /** A creature left the world. */
  drop(m: SimMob): void {
    const v = this.views.get(m.id);
    if (!v) return;
    this.group.remove(v.root);
    v.mat.dispose();
    v.shellMat?.dispose();
    (v.hull.material as THREE.Material).dispose();
    this.views.delete(m.id);
    m.object = undefined;
  }

  /** Pose and place every creature for this frame. */
  sync(sim: MobSim, time: number, camera: THREE.Camera, pixelHeight: number, fov: number): void {
    const g = this.glows;
    g.begin();
    this.moths.begin();
    for (const m of sim.mobs) {
      if (m.kind === 'moth') {
        this.moths.push(m, time);
        continue;
      }
      const v = this.viewOf(m);
      if (!v) continue;
      const o = this.out;
      if (m.kind === 'worm') {
        poseWorm(m, v.model, v.rig);
        v.root.position.set(0, 0, 0);
        v.root.quaternion.identity();
        v.root.scale.setScalar(1);
      } else {
        pose(m, v.model, v.rig, time, o);
        v.rig.update();
        this.place(m, v, o);
      }
      const u = v.mat.uniforms;
      u.uFlash.value = m.flash;
      u.uFade.value = m.fade;
      u.uGlow.value = o.glow;
      if (v.shellMat) {
        v.shellMat.uniforms.uFade.value = m.fade;
        v.shellMat.uniforms.uFlash.value = m.flash * 0.6;
        v.shellMat.uniforms.uGlow.value = o.glow;
      }
      v.hull.visible = (u.uHi.value as THREE.Vector2).y > 0.01 && m.fade > 0.5;
      // Glows: what carries its own light.
      const p = m.position;
      if (m.kind === 'lampling') g.push(p.x, p.y, p.z, 1.0, 0.62, 0.28, 0.4 * m.fade * o.glow);
      else if (m.kind === 'jelly') g.push(p.x, p.y + 0.1, p.z, 0.35, 0.75, 1.0, 1.6 * m.fade * (m.tappable ? 1 : 0.5));
      else if (m.kind === 'sentinel' && m.open > 0.3) {
        this.vF.set(0, -0.05, 0.38).applyQuaternion(v.root.quaternion).multiplyScalar(v.root.scale.x).add(p);
        g.push(this.vF.x, this.vF.y, this.vF.z, 1.0, 0.75, 0.35, 1.1 * m.open * m.fade);
      } else if (m.kind === 'gnasher' && m.open > 0.2) g.push(p.x, p.y + 0.05, p.z, 1.0, 0.35, 0.15, 0.9 * m.open * m.fade);
      else if (m.kind === 'burrower' && m.treasure) g.push(p.x, p.y + 0.05, p.z, 1.0, 0.8, 0.3, 0.5 * m.fade);
    }
    // Light shards in flight (and where they fell, fading).
    for (const s of sim.shots) {
      if (s.landed < 0) g.push(s.p.x, s.p.y, s.p.z, 1.0, 0.92, 0.7, 0.55);
      else g.push(s.p.x, s.p.y, s.p.z, 1.0, 0.85, 0.55, 1.4 * Math.max(0, 1 - s.landed / 2.5));
    }
    for (const sp of this.spores) g.push(sp.x, sp.y, sp.z, 0.55, 0.95, 1.0, 0.16 * Math.max(0, sp.life));
    g.end(pixelHeight, fov);
    this.moths.end(pixelHeight, fov);
    void camera;
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

  private place(m: SimMob, v: View, o: PoseOut): void {
    const r = v.root;
    const sc = m.scale;
    if (m.kind === 'crawler') {
      // On the rock: up is the surface normal, forward the heading projected on it.
      const up = this.vUp.copy(m.up);
      const f = this.vF.set(Math.sin(m.yaw), 0, Math.cos(m.yaw));
      f.addScaledVector(up, -f.dot(up));
      if (f.lengthSq() < 1e-4) f.set(1, 0, 0).addScaledVector(up, -up.x);
      f.normalize();
      const right = this.vR.crossVectors(up, f).normalize();
      this.basis.makeBasis(right, up, f);
      r.quaternion.setFromRotationMatrix(this.basis);
      this.q2.setFromEuler(this.e.set(o.pitch, 0, o.roll));
      r.quaternion.multiply(this.q2);
      r.position.copy(m.position).addScaledVector(up, o.lift * sc);
    } else {
      this.q.setFromEuler(this.e.set(o.pitch, m.yaw, o.roll, 'YXZ'));
      r.quaternion.copy(this.q);
      r.position.copy(m.position);
      r.position.y += o.lift * sc;
    }
    r.scale.set(sc * o.sx, sc * o.sy, sc * o.sz);
  }

  get drawn(): number {
    return this.views.size;
  }

  dispose(): void {
    for (const v of this.views.values()) this.drop(v.mob);
    this.glows.dispose();
    this.moths.dispose();
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
