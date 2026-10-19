import * as THREE from 'three';
import type { LightingUniforms } from '../../render/lighting';
import { createEntityMaterial } from '../../render/entityMaterial';
import { clamp, lerp, saturate } from '../../core/math';
import { ExplorerAnimator, type ExplorerAnimState, type ExplorerPose } from './pose';
import { CoatTails, MotionProbe, Pendulum } from './secondary';
import {
  RIG,
  buildCharm,
  buildCoatTail,
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
 * The ember vial on its short cord: a lighter, livelier pendulum than the lantern, so it sways
 * with the stride and swings out on starts, stops and turns, but stays clear of resonance with
 * the ~1.7 Hz stride (natural frequency ~2.3 Hz) and settles within a second.
 */
const CHARM = { length: 0.11, coupling: 0.15, stiffness: 110, damping: 8, maxAngle: 0.8 };

/** Render order of the explorer while it fades: after every opaque surface it blends over. */
export const FADE_RENDER_ORDER = 1000;

/**
 * Depth-only pass of the faded explorer. Pushed back a hair (polygon offset) so the colour pass,
 * a different program, always passes LEQUAL on the surface that wrote the depth.
 */
function createFadeDepthMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    glslVersion: THREE.GLSL3,
    vertexShader: /* glsl */ `
void main() {
  gl_Position = projectionMatrix * (viewMatrix * (modelMatrix * vec4(position, 1.0)));
}`,
    fragmentShader: /* glsl */ `
layout(location = 0) out highp vec4 fragColor;
void main() {
  fragColor = vec4(0.0);
}`,
    colorWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: 1,
    polygonOffsetUnits: 1,
  });
}

/**
 * The colour pass blends with a constant alpha (gl.blendColor), so the shader needs no alpha
 * output and no discard: the screen-door define is removed (tile GPUs keep early depth tests).
 * Opaque draws use NoBlending; NoBlending and CustomBlending compile the same program.
 */
function configureFade(m: THREE.ShaderMaterial): void {
  delete m.defines.USE_FADE;
  m.blending = THREE.NoBlending;
  m.blendEquation = THREE.AddEquation;
  m.blendSrc = THREE.ConstantAlphaFactor;
  m.blendDst = THREE.OneMinusConstantAlphaFactor;
  m.blendSrcAlpha = THREE.ZeroFactor;
  m.blendDstAlpha = THREE.OneFactor;
  m.blendAlpha = 1;
}

/** Two draw groups over the whole geometry: 0 = depth pass, 1 = colour pass. */
function ensureFadeGroups(g: THREE.BufferGeometry): void {
  if (g.groups.length === 2 && g.groups[1].materialIndex === 1) return;
  g.clearGroups();
  g.addGroup(0, Infinity, 0);
  g.addGroup(0, Infinity, 1);
}

/**
 * The explorer: a jointed voxel character (hips -> torso -> head/arms/pack, hips -> legs and coat
 * tails) with one geometry per rigid part and one shared material. The root's origin is the feet
 * center on the ground and the model faces local +Z; the caller positions and rotates `root`.
 *
 * The hand lantern hangs from the left fist on a damped pendulum driven by the fist's real
 * motion in world space, so it swings when the explorer starts, stops, turns or lands. The same
 * kind of secondary motion drives the ember vial hanging from the pack frame and the coat tails,
 * which are also pushed back by the thighs so the stride never passes through them.
 */
export class ExplorerModel {
  readonly root = new THREE.Group();
  private readonly material: THREE.ShaderMaterial;
  /** Near-camera fade: depth-only pass, the [depth, colour] pair the parts use while fading. */
  private readonly fadeDepth: THREE.ShaderMaterial;
  private readonly fadePasses: THREE.Material[];
  private fading = false;
  private readonly animator = new ExplorerAnimator();
  private readonly geometries: THREE.BufferGeometry[] = [];
  private readonly body = new THREE.Group();
  private readonly hips = new THREE.Group();
  private readonly torso = new THREE.Group();
  private readonly head = new THREE.Group();
  private readonly pack = new THREE.Group();
  private readonly tailL = new THREE.Group();
  private readonly tailR = new THREE.Group();
  private readonly hook = new THREE.Object3D();
  private readonly charmPivot = new THREE.Group();
  private readonly tails = new CoatTails();
  private readonly charm = new Pendulum(CHARM);
  private readonly hipsProbe = new MotionProbe();
  private readonly hookProbe = new MotionProbe();
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
    // The depth pass is created first: its lower material id makes it draw before the colour
    // pass within the fade's render order (three sorts by renderOrder, then material id).
    this.fadeDepth = createFadeDepthMaterial();
    this.material = createEntityMaterial(lighting, { emissiveScale: 2, fade: true });
    configureFade(this.material);
    this.fadePasses = [this.fadeDepth, this.material];
    this.root.name = 'explorer';
    this.root.add(this.body, this.lanternPivot, this.charmPivot);
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
    // Coat tails hang from the back of the hips on their own joints.
    for (const [tail, side] of [
      [this.tailL, 1],
      [this.tailR, -1],
    ] as const) {
      tail.name = side > 0 ? 'coatTailL' : 'coatTailR';
      tail.position.set(side * RIG.tailX, RIG.tailY, RIG.tailZ);
      this.hips.add(tail);
      mesh(buildCoatTail(side), tail);
    }
    // The ember vial hangs from the frame's peg; like the lantern its pivot lives in the root's
    // frame so it always hangs straight down.
    this.hook.name = 'charmHook';
    this.hook.position.set(RIG.hookX, RIG.hookY, RIG.hookZ);
    this.pack.add(this.hook);
    this.charmPivot.name = 'charmPivot';
    mesh(buildCharm(), this.charmPivot);

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
    this.updateSecondary(dt, s, p);
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

  /**
   * Near-camera fade (opacity 0..1) used when the camera is very close. A real alpha fade that
   * prints no pattern over the scene: while fading, every part first writes its depth (no
   * colour), then the colour pass blends at a constant alpha (CONSTANT_ALPHA blending, so the
   * shader is unchanged) where it matches that depth, so only the explorer's nearest surface
   * shows, never a limb through the coat. Both passes draw after every opaque surface. At full
   * opacity the parts are ordinary opaque draws (no blending, no extra pass).
   */
  setFade(alpha: number): void {
    const a = saturate(alpha);
    this.material.uniforms.uFade.value = a;
    const visible = a > 0.01;
    this.body.visible = this.lanternPivot.visible = this.charmPivot.visible = visible;
    const fading = visible && a < 0.999;
    if (fading !== this.fading) {
      this.fading = fading;
      this.material.blending = fading ? THREE.CustomBlending : THREE.NoBlending;
      this.root.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh || (m.material !== this.material && m.material !== this.fadePasses)) return;
        m.material = fading ? this.fadePasses : this.material;
        m.renderOrder = fading ? FADE_RENDER_ORDER : 0;
      });
    }
    if (!fading) return;
    // Smoothstep: nearly opaque while the camera is merely near (the request falls from 1 at a
    // 2 m camera distance), see-through only when it is genuinely close (a 0.25 request draws at
    // 0.16 opacity, so the faint ghost of the pack does not sit over what the player looks at).
    this.material.blendAlpha = a * a * (3 - 2 * a);
    // Tool geometry changes with the tier: every drawn geometry needs the two fade groups.
    this.root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh && m.material === this.fadePasses) ensureFadeGroups(m.geometry);
    });
  }

  dispose(): void {
    for (const g of this.geometries) g.dispose();
    for (const t of this.pickaxes.values()) t.geometry.dispose();
    for (const l of this.lanterns.values()) l.geometry.dispose();
    this.pickaxes.clear();
    this.lanterns.clear();
    this.material.dispose();
    this.fadeDepth.dispose();
    this.root.removeFromParent();
  }

  /** Coat tails and the ember vial, after the body's matrices are up to date. */
  private updateSecondary(dt: number, s: ExplorerAnimState, p: ExplorerPose): void {
    const rootInverse = this.root.getWorldQuaternion(this.tmpQ).invert();
    const tailRoot = this.hips.localToWorld(this.tmpV.set(0, RIG.tailY, RIG.tailZ));
    this.tails.step(dt, this.hipsProbe.sample(tailRoot, dt, rootInverse), s, p);
    this.tailL.rotation.set(this.tails.left, 0, this.tails.roll);
    this.tailR.rotation.set(this.tails.right, 0, this.tails.roll);
    this.tailL.updateMatrixWorld(true);
    this.tailR.updateMatrixWorld(true);
    const hook = this.hook.getWorldPosition(this.tmpV);
    this.charm.step(dt, this.hookProbe.sample(hook, dt, rootInverse));
    this.charmPivot.position.copy(this.root.worldToLocal(hook));
    this.charmPivot.rotation.set(this.charm.x, 0, this.charm.z);
    this.charmPivot.updateMatrixWorld(true);
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
