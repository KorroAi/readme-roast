// The few moving effects (SPEC §8.7, BUILD §3.3 MUST 7): block breaks (6–9 shards), the breakthrough wall-fall
// (10–16 large shards), lit chips, the Dynamite blast, a secret opening. One instanced draw for every shard and chip,
// lit by 1E's shade() through the prop surface (they are stone, never sprites); every count goes to stats().
// Calm by law (SPEC §8.7): shards are darker than the face, live 0.6 s, never more than 36 at once (60 in a ceremony);
// chips ≤ 40 live.

import * as THREE from 'three';
import { LAYER } from '../lantern/layers';
import { PropBuilder, rng } from '../lantern/props';
import type { PropMaterials } from '../lantern/propSurface';

/** Live shard caps: a drift or chamber beat, and a ceremony (a seal, Dynamite). */
export const SHARD_CAP = 36;
export const SHARD_CAP_CEREMONY = 60;
/** Live chip cap (the strike's lit chips). */
export const CHIP_CAP = 40;
const MAX = SHARD_CAP_CEREMONY + CHIP_CAP;
const LIFE = 0.6;
const G = 9.8;

interface Shard {
  p: THREE.Vector3;
  v: THREE.Vector3;
  q: THREE.Quaternion;
  w: THREE.Vector3;
  s: number;
  t: number;
  life: number;
  floor: number;
  chip: boolean;
}

export class Fx {
  readonly group = new THREE.Group();
  private readonly mesh: THREE.InstancedMesh;
  private readonly live: Shard[] = [];
  private readonly m = new THREE.Matrix4();
  private readonly dq = new THREE.Quaternion();
  private seed = 1;
  /** Seconds left at the ceremony cap. */
  private ceremonyT = 0;

  constructor(mats: PropMaterials) {
    const pb = new PropBuilder();
    // An irregular chunk: a dodecahedron with its vertices pushed about (one shape; rotation and scale vary it).
    const g = new THREE.DodecahedronGeometry(1, 0);
    const p = g.getAttribute('position');
    const r = rng(9);
    for (let i = 0; i < p.count; i++) p.setXYZ(i, p.getX(i) * (0.75 + r() * 0.5), p.getY(i) * (0.6 + r() * 0.4), p.getZ(i) * (0.75 + r() * 0.5));
    g.computeVertexNormals();
    pb.geometry(g, new THREE.Matrix4(), { layer: LAYER.slate }, 0.5, 0.5);
    g.dispose();
    const geo = pb.build();
    geo.setAttribute('aInst', new THREE.InstancedBufferAttribute(new Float32Array(MAX * 4).fill(0).map((_, i) => (i % 4 === 1 ? 1 : 0)), 4));
    this.mesh = new THREE.InstancedMesh(geo, mats.prop, MAX);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.userData.noShadow = true;
    this.group.add(this.mesh);
    this.group.name = 'fx';
  }

  /** Holds the ceremony shard cap (60) for `seconds` (a seal, Dynamite); otherwise 36. */
  ceremony(seconds: number): void {
    this.ceremonyT = Math.max(this.ceremonyT, seconds);
  }

  private spawn(c: THREE.Vector3, v: THREE.Vector3, s: number, floor: number, chip: boolean): void {
    // Over the cap the oldest of the same kind goes (it is the one nearest the floor, already fading).
    const cap = chip ? CHIP_CAP : this.ceremonyT > 0 ? SHARD_CAP_CEREMONY : SHARD_CAP;
    let same = 0;
    for (const l of this.live) if (l.chip === chip) same++;
    if (same >= cap) {
      const i = this.live.findIndex((l) => l.chip === chip);
      if (i >= 0) this.live.splice(i, 1);
    }
    const r = rng(this.seed++ * 7919);
    this.live.push({
      p: c.clone(),
      v,
      q: new THREE.Quaternion().setFromEuler(new THREE.Euler(r() * 6, r() * 6, r() * 6)),
      w: new THREE.Vector3(r() - 0.5, r() - 0.5, r() - 0.5).multiplyScalar(8),
      s,
      t: 0,
      life: chip ? 0.45 : LIFE + r() * 0.15,
      floor,
      chip,
    });
  }

  /** A block breaks: `n` shards (6–9) fall out of its front toward the viewer and settle on the floor. */
  blockBreak(centre: THREE.Vector3, into: THREE.Vector3, kind: number, n: number): void {
    void kind;
    const r = rng(this.seed++ * 31);
    const out = into.clone().negate().setY(0).normalize();
    const floor = centre.y - 1.4;
    for (let i = 0; i < n; i++) {
      const c = centre.clone().add(new THREE.Vector3((r() - 0.5) * 0.5, (r() - 0.5) * 0.5, (r() - 0.5) * 0.5)).addScaledVector(out, 0.4);
      // They tumble out of the face and drop: a short push toward the viewer, spread sideways, gravity does the rest.
      const v = out.clone().multiplyScalar(0.4 + r() * 0.7).add(new THREE.Vector3((r() - 0.5) * 1.4, 0.2 + r() * 0.9, (r() - 0.5) * 1.4));
      this.spawn(c, v, 0.045 + r() * 0.055, floor, false);
    }
  }

  /** The breakthrough wall-fall (10–16 large shards) or a secret opening: they fall inward, away from the viewer. */
  wallFall(centre: THREE.Vector3, into: THREE.Vector3, right: THREE.Vector3, n: number): void {
    const r = rng(this.seed++ * 17);
    const floor = centre.y - 1.6;
    for (let i = 0; i < Math.min(16, n); i++) {
      const c = centre.clone().addScaledVector(right, (r() - 0.5) * 2.2).add(new THREE.Vector3(0, (r() - 0.5) * 2.0, 0));
      const v = into.clone().multiplyScalar(0.6 + r() * 1.4).add(new THREE.Vector3(0, r() * 0.4, 0));
      this.spawn(c, v, 0.14 + r() * 0.12, floor, false);
    }
  }

  /** Lit chips at a strike point (2 dark ones for a tunk). */
  chips(at: THREE.Vector3, eye: THREE.Vector3, n: number, dark: boolean): void {
    const r = rng(this.seed++ * 13);
    const out = eye.clone().sub(at).normalize();
    for (let i = 0; i < n; i++) {
      const v = out.clone().multiplyScalar(0.8 + r()).add(new THREE.Vector3((r() - 0.5) * 1.4, 0.4 + r(), (r() - 0.5) * 1.4));
      this.spawn(at.clone().addScaledVector(out, 0.05), v, dark ? 0.02 : 0.025 + r() * 0.015, at.y - 1.6, true);
    }
  }

  /** A warm glow where a chest opens (W1: the roll-up is the HUD's; the light is the chest's seam). */
  glow(at: THREE.Vector3, color: number): void {
    void at;
    void color;
  }

  update(dt: number): void {
    this.ceremonyT = Math.max(0, this.ceremonyT - dt);
    if (!this.live.length) {
      this.mesh.count = 0;
      return;
    }
    for (const s of this.live) {
      s.t += dt;
      for (let k = 0; k < 3; k++) {
        const h = dt / 3;
        s.v.y -= G * h;
        s.p.addScaledVector(s.v, h);
        if (s.p.y < s.floor + s.s * 0.5) {
          s.p.y = s.floor + s.s * 0.5;
          s.v.y = Math.abs(s.v.y) * 0.2;
          s.v.x *= 0.5;
          s.v.z *= 0.5;
          s.w.multiplyScalar(0.5);
        }
      }
      const wl = s.w.length();
      if (wl > 1e-4) {
        this.dq.setFromAxisAngle(s.w.clone().divideScalar(wl), wl * dt);
        s.q.premultiply(this.dq);
      }
    }
    for (let i = this.live.length - 1; i >= 0; i--) if (this.live[i].t > this.live[i].life) this.live.splice(i, 1);
    let n = 0;
    for (const s of this.live) {
      const fade = s.t < s.life - 0.15 ? 1 : Math.max(0, (s.life - s.t) / 0.15);
      this.m.compose(s.p, s.q, new THREE.Vector3(s.s, s.s * 0.8, s.s).multiplyScalar(fade));
      this.mesh.setMatrixAt(n++, this.m);
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  /** Moving FX groups (a debris burst counts once). */
  get groups(): number {
    return this.live.length ? 1 : 0;
  }
  get shards(): number {
    return this.live.filter((s) => !s.chip).length;
  }
  get particles(): number {
    return this.live.filter((s) => s.chip).length;
  }

  /** Screen area fraction covered by live shards and chips: the sum of their projected discs (overlaps counted twice,
   *  so an upper bound). A shard is a jittered dodecahedron squashed 0.8 in y: its silhouette's radius is ~0.85 × its
   *  scale, times its fade. */
  area(camera: THREE.PerspectiveCamera): number {
    if (!this.live.length) return 0;
    const eye = camera.position;
    const f = 1 / Math.tan((camera.fov * Math.PI) / 360);
    let a = 0;
    for (const s of this.live) {
      const d = Math.max(0.2, s.p.distanceTo(eye));
      const fade = s.t < s.life - 0.15 ? 1 : Math.max(0, (s.life - s.t) / 0.15);
      const r = ((0.85 * s.s * fade) / d) * f; // radius in NDC half-heights
      a += (Math.PI * r * r) / (4 * camera.aspect);
    }
    return Math.min(1, a);
  }

  dispose(): void {
    this.mesh.geometry.dispose();
  }
}
