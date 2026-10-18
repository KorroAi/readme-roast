import * as THREE from 'three';
import type { LightingUniforms } from '../../render/lighting';
import { createEntityMaterial } from '../../render/entityMaterial';
import { clamp, lerp, saturate } from '../../core/math';
import { ExplorerAnimator, type ExplorerAnimState } from './pose';
import {
  RIG,
  buildForearm,
  buildHead,
  buildHips,
  buildPack,
  buildShin,
  buildThigh,
  buildToolLantern,
  buildToolPickaxe,
  buildTorso,
  buildUpperArm,
} from './parts';

export type { ExplorerAnimState } from './pose';

interface Arm {
  shoulder: THREE.Group;
  elbow: THREE.Group;
  grip: THREE.Object3D;
}

interface Leg {
  hip: THREE.Group;
  knee: THREE.Group;
}

/** Pendulum length of the hand lantern (grip to the lantern's center of mass), in meters. */
const LANTERN_ARM = 0.2;
/**
 * The fist grips the carry ring, so the lantern is not a free pendulum: only part of the fist's
 * acceleration reaches it and the grip adds a restoring stiffness (1/s^2). That keeps the swing
 * slight when the explorer starts, stops or turns at full acceleration, and lifts the natural
 * frequency (~1.6 Hz) clear of the 1 Hz arm swing so walking never pumps it up.
 */
const LANTERN_COUPLING = 0.2;
const LANTERN_STIFFNESS = 50;
/** Damping (1/s): about half of critical, so a swing rocks back once and settles in ~0.5 s. */
const LANTERN_DAMPING = 11;
const LANTERN_MAX_ANGLE = 0.7;
/** Ignore pivot accelerations above this (teleports, respawns). */
const MAX_ACCEL = 60;

/**
 * The explorer: a jointed voxel character (hips -> torso -> head/arms, hips -> legs) with one
 * geometry per rigid part and one shared material. The root's origin is the feet center on the
 * ground and the model faces local +Z; the caller positions and rotates `root`.
 *
 * The hand lantern hangs from the left fist on a damped pendulum driven by the fist's real
 * motion in world space, so it swings when the explorer starts, stops, turns or lands.
 */
export class ExplorerModel {
  readonly root = new THREE.Group();
  private readonly material: THREE.ShaderMaterial;
  private readonly animator = new ExplorerAnimator();
  private readonly geometries: THREE.BufferGeometry[] = [];
  private readonly body = new THREE.Group();
  private readonly hips = new THREE.Group();
  private readonly torso = new THREE.Group();
  private readonly head = new THREE.Group();
  private readonly pack = new THREE.Group();
  private readonly armL: Arm;
  private readonly armR: Arm;
  private readonly legL: Leg;
  private readonly legR: Leg;
  private readonly wrist = new THREE.Group();
  private readonly pickaxe: THREE.Mesh;
  private readonly pickTip = new THREE.Object3D();
  private readonly lanternPivot = new THREE.Group();
  private readonly lantern: THREE.Mesh;
  private readonly flame = new THREE.Object3D();
  private readonly pickaxes = new Map<number, { geometry: THREE.BufferGeometry; tip: THREE.Vector3 }>();
  private readonly lanterns = new Map<number, ReturnType<typeof buildToolLantern>>();
  private pickaxeTier = 0;
  private lanternTier = 0;
  // Lantern pendulum state (angles about the root's X and Z axes).
  private swingX = 0;
  private swingZ = 0;
  private swingVX = 0;
  private swingVZ = 0;
  private readonly gripPos = new THREE.Vector3();
  private readonly gripVel = new THREE.Vector3();
  private hasGrip = false;
  private readonly tmpV = new THREE.Vector3();
  private readonly tmpA = new THREE.Vector3();
  private readonly tmpB = new THREE.Vector3();
  private readonly tmpQ = new THREE.Quaternion();

  constructor(lighting: LightingUniforms) {
    this.material = createEntityMaterial(lighting, { emissiveScale: 2, fade: true });
    this.root.name = 'explorer';
    this.root.add(this.body, this.lanternPivot);
    const mesh = (geometry: THREE.BufferGeometry, parent: THREE.Object3D) => {
      this.geometries.push(geometry);
      const m = new THREE.Mesh(geometry, this.material);
      m.matrixAutoUpdate = false;
      parent.add(m);
      return m;
    };

    this.hips.position.y = RIG.hipY;
    this.body.add(this.hips);
    mesh(buildHips(), this.hips);
    this.torso.position.y = RIG.waist;
    this.hips.add(this.torso);
    mesh(buildTorso(), this.torso);
    this.head.position.y = RIG.neck;
    this.torso.add(this.head);
    mesh(buildHead(), this.head);
    this.pack.position.set(0, RIG.packY, RIG.packZ);
    this.torso.add(this.pack);
    mesh(buildPack(), this.pack);

    // Mirrored limbs share one geometry per segment.
    const upperArm = buildUpperArm();
    const forearm = buildForearm();
    const thigh = buildThigh();
    const shin = buildShin();
    this.geometries.push(upperArm, forearm, thigh, shin);
    const shared = (geometry: THREE.BufferGeometry, parent: THREE.Object3D) => {
      const m = new THREE.Mesh(geometry, this.material);
      m.matrixAutoUpdate = false;
      parent.add(m);
    };
    const makeArm = (side: number): Arm => {
      const shoulder = new THREE.Group();
      shoulder.position.set(side * RIG.shoulderX, RIG.shoulderY, 0);
      this.torso.add(shoulder);
      shared(upperArm, shoulder);
      const elbow = new THREE.Group();
      elbow.position.y = -RIG.upperArm;
      shoulder.add(elbow);
      shared(forearm, elbow);
      const grip = new THREE.Object3D();
      grip.name = side > 0 ? 'handL' : 'handR';
      grip.position.y = -RIG.forearm;
      elbow.add(grip);
      return { shoulder, elbow, grip };
    };
    const makeLeg = (side: number): Leg => {
      const hip = new THREE.Group();
      hip.position.x = side * RIG.hipX;
      this.hips.add(hip);
      shared(thigh, hip);
      const knee = new THREE.Group();
      knee.position.y = -RIG.thigh;
      hip.add(knee);
      shared(shin, knee);
      return { hip, knee };
    };
    this.armL = makeArm(1);
    this.armR = makeArm(-1);
    this.legL = makeLeg(1);
    this.legR = makeLeg(-1);

    this.armR.grip.add(this.wrist);
    this.pickaxe = new THREE.Mesh(undefined, this.material);
    this.pickaxe.matrixAutoUpdate = false;
    this.wrist.add(this.pickaxe);
    this.pickaxe.add(this.pickTip);
    this.pickTip.name = 'pickTip';
    this.lanternPivot.name = 'lanternPivot';
    this.flame.name = 'lanternFlame';
    this.lantern = new THREE.Mesh(undefined, this.material);
    this.lanternPivot.add(this.lantern);
    this.lantern.add(this.flame);

    this.setEquipment(1, 1);
    this.setLantern(1, true);
    this.update(0, { speed: 0, grounded: true, verticalVelocity: 0, aimPitch: 0, time: 0 });
  }

  get swinging(): boolean {
    return this.animator.swinging;
  }

  setEquipment(pickaxeTier: number, lanternTier: number): void {
    const pt = Math.max(1, Math.round(pickaxeTier));
    if (pt !== this.pickaxeTier) {
      this.pickaxeTier = pt;
      let tool = this.pickaxes.get(pt);
      if (!tool) {
        tool = buildToolPickaxe(pt);
        this.pickaxes.set(pt, tool);
      }
      this.pickaxe.geometry = tool.geometry;
      this.pickTip.position.copy(tool.tip);
    }
    const lt = Math.max(1, Math.round(lanternTier));
    if (lt !== this.lanternTier) {
      this.lanternTier = lt;
      let lamp = this.lanterns.get(lt);
      if (!lamp) {
        lamp = buildToolLantern(lt);
        this.lanterns.set(lt, lamp);
      }
      this.lantern.geometry = lamp.geometry;
      // Hang from the carry ring, which sits in the fist.
      this.lantern.position.y = -lamp.shape.top + 0.02;
      this.flame.position.y = lamp.shape.flameY;
    }
  }

  /** Glass brightness follows the fuel; an unlit lantern keeps a dim ember. */
  setLantern(fuel01: number, lit: boolean): void {
    this.material.uniforms.uEmissiveScale.value = lit ? lerp(0.9, 2.3, saturate(fuel01)) : 0.28;
  }

  /** Start one pickaxe swing lasting `duration` seconds; the impact pose lands at 55%. */
  swing(duration: number): void {
    this.animator.startSwing(duration);
  }

  update(dt: number, s: ExplorerAnimState): void {
    const p = this.animator.update(dt, s);
    this.body.position.y = p.bodyY;
    this.body.scale.set(p.squashXZ, p.squashY, p.squashXZ);
    this.hips.rotation.set(0, p.hipsYaw, p.hipsRoll);
    this.torso.position.y = RIG.waist + p.torsoLift;
    this.torso.rotation.set(p.torsoPitch, p.torsoYaw, p.torsoRoll, 'YXZ');
    this.head.rotation.set(p.headPitch, p.headYaw, p.headRoll, 'YXZ');
    this.pack.rotation.x = p.packPitch;
    this.armL.shoulder.rotation.set(p.shoulderL, 0, p.rollL);
    this.armL.elbow.rotation.x = p.elbowL;
    this.armR.shoulder.rotation.set(p.shoulderR, 0, p.rollR);
    this.armR.elbow.rotation.x = p.elbowR;
    this.wrist.rotation.x = p.wristR;
    this.legL.hip.rotation.x = p.thighL;
    this.legL.knee.rotation.x = p.kneeL;
    this.legR.hip.rotation.x = p.thighR;
    this.legR.knee.rotation.x = p.kneeR;
    this.root.updateMatrixWorld(true);
    this.updateLantern(dt);
  }

  /** World position of the lantern flame (valid after update). */
  getLanternWorldPosition(out: THREE.Vector3): THREE.Vector3 {
    this.flame.updateWorldMatrix(true, false);
    return out.setFromMatrixPosition(this.flame.matrixWorld);
  }

  getPickaxeTipWorldPosition(out: THREE.Vector3): THREE.Vector3 {
    this.pickTip.updateWorldMatrix(true, false);
    return out.setFromMatrixPosition(this.pickTip.matrixWorld);
  }

  /** Screen-door fade (0..1) used when the camera is very close. */
  setFade(alpha: number): void {
    const a = saturate(alpha);
    this.material.uniforms.uFade.value = a;
    this.body.visible = this.lanternPivot.visible = a > 0.01;
  }

  dispose(): void {
    for (const g of this.geometries) g.dispose();
    for (const t of this.pickaxes.values()) t.geometry.dispose();
    for (const l of this.lanterns.values()) l.geometry.dispose();
    this.pickaxes.clear();
    this.lanterns.clear();
    this.material.dispose();
    this.root.removeFromParent();
  }

  /**
   * Hang the lantern from the left fist. The pivot follows the fist; its orientation is a damped
   * pendulum in the root's frame, driven by the fist's world acceleration (and gravity), so the
   * lantern always hangs down regardless of the arm angle.
   */
  private updateLantern(dt: number): void {
    const world = this.armL.grip.getWorldPosition(this.tmpV);
    const teleported = this.hasGrip && this.gripPos.distanceToSquared(world) > 4;
    if (!this.hasGrip || teleported) {
      this.gripVel.set(0, 0, 0);
    } else if (dt > 0) {
      const vel = this.tmpA.copy(world).sub(this.gripPos).divideScalar(dt);
      const acc = this.tmpB.copy(vel).sub(this.gripVel).divideScalar(dt);
      this.gripVel.copy(vel);
      if (acc.lengthSq() > MAX_ACCEL * MAX_ACCEL) acc.setLength(MAX_ACCEL);
      // Into the root's frame: the pendulum angles are about the root's own axes.
      acc.applyQuaternion(this.root.getWorldQuaternion(this.tmpQ).invert()).multiplyScalar(LANTERN_COUPLING);
      const g = Math.max(2, 9.8 + acc.y);
      // Integrate at 120 Hz; a long hitch only simulates its last 0.1 s.
      const span = Math.min(dt, 0.1);
      const steps = Math.ceil(span * 120);
      const h = span / steps;
      for (let i = 0; i < steps; i++) {
        const ax = (-g * Math.sin(this.swingX) + acc.z * Math.cos(this.swingX)) / LANTERN_ARM - LANTERN_STIFFNESS * this.swingX - LANTERN_DAMPING * this.swingVX;
        const az = (-g * Math.sin(this.swingZ) - acc.x * Math.cos(this.swingZ)) / LANTERN_ARM - LANTERN_STIFFNESS * this.swingZ - LANTERN_DAMPING * this.swingVZ;
        this.swingVX += ax * h;
        this.swingVZ += az * h;
        this.swingX = clamp(this.swingX + this.swingVX * h, -LANTERN_MAX_ANGLE, LANTERN_MAX_ANGLE);
        this.swingZ = clamp(this.swingZ + this.swingVZ * h, -LANTERN_MAX_ANGLE, LANTERN_MAX_ANGLE);
      }
    }
    this.gripPos.copy(world);
    this.hasGrip = true;
    this.lanternPivot.position.copy(this.root.worldToLocal(this.tmpV.copy(world)));
    this.lanternPivot.rotation.set(this.swingX, 0, this.swingZ);
    this.lanternPivot.updateMatrixWorld(true);
  }
}
