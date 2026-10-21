import * as THREE from 'three';
import { clamp, lerp, saturate } from '../../core/math';
import type { ExplorerAnimState, ExplorerPose } from './pose';
import { RIG } from './parts';

/** Ignore pivot accelerations above this (teleports, respawns). */
const MAX_ACCEL = 60;
/** Integration rate of the secondary springs; a long hitch only simulates its last 0.1 s. */
const RATE = 120;
const MAX_SPAN = 0.1;

/**
 * Follows one point's world position and reports its acceleration in the root's frame. The
 * first sample, a zero frame time and a jump of more than 2 m (a teleport) report no
 * acceleration, so springs never get kicked by a respawn.
 */
export class MotionProbe {
  readonly acc = new THREE.Vector3();
  private readonly pos = new THREE.Vector3();
  private readonly vel = new THREE.Vector3();
  private readonly tmp = new THREE.Vector3();
  private has = false;

  sample(world: THREE.Vector3, dt: number, rootInverse: THREE.Quaternion): THREE.Vector3 {
    const teleported = this.has && this.pos.distanceToSquared(world) > 4;
    if (!this.has || teleported) {
      this.vel.set(0, 0, 0);
      this.acc.set(0, 0, 0);
    } else if (dt > 0) {
      const v = this.tmp.copy(world).sub(this.pos).divideScalar(dt);
      this.acc.copy(v).sub(this.vel).divideScalar(dt);
      this.vel.copy(v);
      if (this.acc.lengthSq() > MAX_ACCEL * MAX_ACCEL) this.acc.setLength(MAX_ACCEL);
      this.acc.applyQuaternion(rootInverse);
    } else {
      this.acc.set(0, 0, 0);
    }
    this.pos.copy(world);
    this.has = true;
    return this.acc;
  }
}

export interface PendulumOptions {
  /** Pivot to center of mass, in meters. */
  length: number;
  /** Fraction of the pivot's acceleration that reaches the bob. */
  coupling: number;
  /** Restoring stiffness on top of gravity (1/s^2). */
  stiffness: number;
  /** Damping (1/s). */
  damping: number;
  maxAngle: number;
}

/**
 * A damped pendulum hanging in the root's frame: angle `x` about the root's X axis (+ swings the
 * bob backward) and `z` about its Z axis (+ swings it toward +X). Driven by the pivot's
 * acceleration (from a MotionProbe) and gravity.
 */
export class Pendulum {
  x = 0;
  z = 0;
  private vx = 0;
  private vz = 0;

  constructor(private readonly o: PendulumOptions) {}

  step(dt: number, pivotAcc: THREE.Vector3): void {
    if (dt <= 0) return;
    const o = this.o;
    const ax = pivotAcc.x * o.coupling;
    const az = pivotAcc.z * o.coupling;
    const g = Math.max(2, 9.8 + pivotAcc.y * o.coupling);
    const span = Math.min(dt, MAX_SPAN);
    const steps = Math.ceil(span * RATE);
    const h = span / steps;
    for (let i = 0; i < steps; i++) {
      const accX = (-g * Math.sin(this.x) + az * Math.cos(this.x)) / o.length - o.stiffness * this.x - o.damping * this.vx;
      const accZ = (-g * Math.sin(this.z) - ax * Math.cos(this.z)) / o.length - o.stiffness * this.z - o.damping * this.vz;
      this.vx += accX * h;
      this.vz += accZ * h;
      this.x = clamp(this.x + this.vx * h, -o.maxAngle, o.maxAngle);
      this.z = clamp(this.z + this.vz * h, -o.maxAngle, o.maxAngle);
    }
  }
}

/** Coat tail rest angle: a slight backward flare so the tails read apart from the legs. */
const TAIL_REST = 0.06;
const TAIL_MAX = 1.2;
/** Lowest a tail may swing forward (into the space the legs vacate). */
const TAIL_MIN = -0.12;
/** Spring toward the target angle (1/s^2) and damping (1/s): ~1.9 Hz, rocks once and settles. */
const TAIL_K = 140;
const TAIL_D = 8;
/** Angular acceleration (rad/s^2) per m/s^2 of the hips' acceleration. */
const TAIL_DRIVE = 1.1;
const ROLL_K = 90;
const ROLL_D = 8;
const ROLL_DRIVE = 0.8;
const ROLL_MAX = 0.35;
/** Clearance kept between a tail and the leg behind which it hangs (radians). */
const TAIL_CLEARANCE = 0.035;

/** Rotate (y, z) about the X axis by `a`, as three.js does (+ swings a hanging point to -Z). */
function rotYZ(y: number, z: number, a: number, out: { y: number; z: number }): void {
  const c = Math.cos(a);
  const s = Math.sin(a);
  out.y = y * c - z * s;
  out.z = y * s + z * c;
}

const tmpP = { y: 0, z: 0 };
const tmpK = { y: 0, z: 0 };
/** Depths below the knee at which the back of the boot shaft is checked. */
const SHIN_PROBES = [0.12, 0.22] as const;

/** Backward angle (from straight down) of a point seen from the tail joint, or -Infinity if out of reach. */
function angleFromTail(y: number, z: number): number {
  const dy = y - RIG.tailY;
  const dz = z - RIG.tailZ;
  if (dy >= 0 || dy * dy + dz * dz > (RIG.tailLength + 0.03) ** 2) return -Infinity;
  return Math.atan2(-dz, -dy);
}

/**
 * Smallest pitch a coat tail may have so that the back of the thigh (and the top of the shin)
 * behind which it hangs stays in front of it. Thigh and knee are the pose angles.
 */
export function tailFloor(thigh: number, knee: number): number {
  // Back-bottom corner of the thigh.
  rotYZ(-RIG.thigh - 0.02, -0.1, thigh, tmpP);
  let floor = angleFromTail(tmpP.y, tmpP.z);
  // Back of the shin (the boot shaft) below the knee.
  rotYZ(-RIG.thigh, 0, thigh, tmpK);
  for (const d of SHIN_PROBES) {
    rotYZ(-d, -0.105, thigh + knee, tmpP);
    floor = Math.max(floor, angleFromTail(tmpK.y + tmpP.y, tmpK.z + tmpP.z));
  }
  return Math.max(TAIL_MIN, floor + TAIL_CLEARANCE);
}

/**
 * Secondary motion of the two coat tails: each is a damped spring in pitch that is pushed back by
 * its own thigh (never passing through the leg), flares with speed, lifts like a cape while
 * falling, and lags behind the hips' acceleration (starts, stops, landings). Both share a roll
 * spring that swings them out when the explorer turns or sidesteps.
 */
export class CoatTails {
  left = TAIL_REST;
  right = TAIL_REST;
  roll = 0;
  private vl = 0;
  private vr = 0;
  private vroll = 0;
  private floorL = TAIL_MIN;
  private floorR = TAIL_MIN;
  private started = false;

  step(dt: number, hipsAcc: THREE.Vector3, s: ExplorerAnimState, p: ExplorerPose): void {
    const fl = tailFloor(p.thighL, p.kneeL);
    const fr = tailFloor(p.thighR, p.kneeR);
    if (!this.started) {
      this.started = true;
      this.floorL = fl;
      this.floorR = fr;
      this.left = Math.max(this.left, fl);
      this.right = Math.max(this.right, fr);
    }
    if (dt <= 0) return;
    const speed = saturate(Math.max(0, s.speed) / 4.6);
    const fall = s.grounded ? 0 : saturate(-s.verticalVelocity / 9);
    const rise = s.grounded ? 0 : saturate(s.verticalVelocity / 7);
    const target = TAIL_REST + 0.16 * speed + 0.85 * fall - 0.05 * rise;
    const span = Math.min(dt, MAX_SPAN);
    const steps = Math.ceil(span * RATE);
    const h = span / steps;
    const pitchDrive = TAIL_DRIVE * hipsAcc.z;
    const rollDrive = -ROLL_DRIVE * hipsAcc.x;
    const floorVelL = (fl - this.floorL) / span;
    const floorVelR = (fr - this.floorR) / span;
    for (let i = 1; i <= steps; i++) {
      const u = i / steps;
      this.vl += (TAIL_K * (target - this.left) - TAIL_D * this.vl + pitchDrive) * h;
      this.vr += (TAIL_K * (target - this.right) - TAIL_D * this.vr + pitchDrive) * h;
      this.left += this.vl * h;
      this.right += this.vr * h;
      const floorL = lerp(this.floorL, fl, u);
      const floorR = lerp(this.floorR, fr, u);
      if (this.left < floorL) {
        this.left = floorL;
        this.vl = Math.max(this.vl, floorVelL);
      }
      if (this.right < floorR) {
        this.right = floorR;
        this.vr = Math.max(this.vr, floorVelR);
      }
      if (this.left > TAIL_MAX) {
        this.left = TAIL_MAX;
        this.vl = Math.min(this.vl, 0);
      }
      if (this.right > TAIL_MAX) {
        this.right = TAIL_MAX;
        this.vr = Math.min(this.vr, 0);
      }
      this.vroll += (-ROLL_K * this.roll - ROLL_D * this.vroll + rollDrive) * h;
      this.roll = clamp(this.roll + this.vroll * h, -ROLL_MAX, ROLL_MAX);
    }
    this.floorL = fl;
    this.floorR = fr;
  }
}
