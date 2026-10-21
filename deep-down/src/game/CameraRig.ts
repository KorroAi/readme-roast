import * as THREE from 'three';
import { RAMP, SOLID } from '../config/blocks';
import { clamp, damp, dampAngle } from '../core/math';
import type { VoxelWorld } from '../world/VoxelWorld';
import { EYE_CLEARANCE, FP_HFOV, FP_VFOV, LOOK_PER_PX, LOOK_RATE, NEAR, PITCH_LIMIT } from './fp/constants';

const DEG = Math.PI / 180;
/** Largest distance the clearance guard may move the eye from the body's eye point (m). */
const MAX_GUARD = 0.32;

/**
 * Vertical field of view (deg) that spans `hfov` degrees across a screen of `aspect` (width /
 * height), at most `maxVfov` vertically: a locked horizontal lens on landscape screens, a capped
 * vertical one on narrow (portrait) screens.
 */
export function lockedVerticalFov(aspect: number, hfov = 90, maxVfov = 72): number {
  return (2 * Math.atan(Math.min(Math.tan(hfov * 0.5 * DEG) / aspect, Math.tan(maxVfov * 0.5 * DEG)))) / DEG;
}

/** The first-person lens: 78 degrees tall on an upright phone, 90 degrees wide on wide screens. */
export function fpVerticalFov(aspect: number): number {
  return lockedVerticalFov(aspect, FP_HFOV, FP_VFOV);
}

/**
 * Push a point out of the solid voxels around it until it keeps `radius` metres from every one
 * (sphere against boxes, two passes), moving it at most MAX_GUARD in all. Writes `out`.
 * @returns how far the point moved (m).
 */
export function clearOfRock(world: Pick<VoxelWorld, 'get'>, x: number, y: number, z: number, radius: number, out: THREE.Vector3): number {
  let px = x;
  let py = y;
  let pz = z;
  for (let pass = 0; pass < 2; pass++) {
    let mx = 0;
    let my = 0;
    let mz = 0;
    const x0 = Math.floor(px - radius);
    const x1 = Math.floor(px + radius);
    const y0 = Math.floor(py - radius);
    const y1 = Math.floor(py + radius);
    const z0 = Math.floor(pz - radius);
    const z1 = Math.floor(pz + radius);
    for (let cy = y0; cy <= y1; cy++)
      for (let cz = z0; cz <= z1; cz++)
        for (let cx = x0; cx <= x1; cx++) {
          const id = world.get(cx, cy, cz);
          // Stair flights are drawn as sloped steps below their plane (the feet ride on it): only
          // whole rock counts, or climbing a flight would push the eye about at every step.
          if (!SOLID[id] || RAMP[id]) continue;
          // Closest point of the cell to the eye.
          const qx = clamp(px, cx, cx + 1);
          const qy = clamp(py, cy, cy + 1);
          const qz = clamp(pz, cz, cz + 1);
          const dx = px - qx;
          const dy = py - qy;
          const dz = pz - qz;
          const d = Math.hypot(dx, dy, dz);
          if (d >= radius) continue;
          if (d < 1e-6) continue; // inside a cell: the body handles that (the rescue)
          const push = (radius - d) / d;
          // Keep the strongest push per axis direction (two walls on one side do not add up).
          const ox = dx * push;
          const oy = dy * push;
          const oz = dz * push;
          if (Math.abs(ox) > Math.abs(mx)) mx = ox;
          if (Math.abs(oy) > Math.abs(my)) my = oy;
          if (Math.abs(oz) > Math.abs(mz)) mz = oz;
        }
    if (mx === 0 && my === 0 && mz === 0) break;
    px += mx;
    py += my;
    pz += mz;
  }
  let ddx = px - x;
  let ddy = py - y;
  let ddz = pz - z;
  const moved = Math.hypot(ddx, ddy, ddz);
  if (moved > MAX_GUARD) {
    const k = MAX_GUARD / moved;
    ddx *= k;
    ddy *= k;
    ddz *= k;
  }
  out.set(x + ddx, y + ddy, z + ddz);
  return Math.min(moved, MAX_GUARD);
}

/**
 * First-person camera at the explorer's eye.
 *
 * `yaw` / `pitch` are where the player is looking (look input, rides and aim helpers write them);
 * the lens follows them with a short critically-damped ease (LOOK_RATE), so a drag never jitters
 * and nothing feels late. Forward is (-sin yaw, 0, -cos yaw), the body faces yaw + PI. Pitch is
 * held within +-75 degrees and the lens never rolls.
 *
 * The eye sits at the body's eye point, moved off rock by a clearance guard (EYE_CLEARANCE, with
 * the 5 cm near plane) so a wall, a low roof or a sculpted bevel never slices into view, even with
 * the explorer pressed against it. A landing (addTrauma) dips the view slightly and recovers; there
 * is no head bob and no shake while mining.
 */
export class CameraRig {
  readonly camera: THREE.PerspectiveCamera;
  /** Look direction (target): the lens eases toward it. */
  yaw = 0;
  pitch = -0.1;
  sensitivity = 1;
  invertY = false;
  shakeScale = 1;
  /** The eye this frame (after the clearance guard). */
  readonly eye = new THREE.Vector3();
  /** Lens yaw / pitch this frame (eased). */
  private viewYaw = 0;
  private viewPitch = -0.1;
  private trauma = 0;
  private dip = 0;
  private dipVel = 0;
  private initialized = false;
  private readonly guarded = new THREE.Vector3();
  private readonly guardOffset = new THREE.Vector3();
  private readonly tmp = new THREE.Vector3();

  constructor(private readonly world: VoxelWorld) {
    this.camera = new THREE.PerspectiveCamera(FP_VFOV, 1, NEAR, 320);
    this.camera.rotation.order = 'YXZ';
  }

  /** Apply look input in CSS pixels. */
  look(dxPx: number, dyPx: number): void {
    if (dxPx === 0 && dyPx === 0) return;
    const k = LOOK_PER_PX * this.sensitivity;
    this.yaw -= dxPx * k;
    this.pitch = clamp(this.pitch - dyPx * k * (this.invertY ? -1 : 1), -PITCH_LIMIT, PITCH_LIMIT);
  }

  /** A jolt (0..1): a landing or a heavy door. The view dips a little and recovers; no roll. */
  addTrauma(amount: number): void {
    const a = Math.min(1, amount * this.shakeScale);
    this.trauma = Math.min(1, this.trauma + a);
    this.dipVel -= a * 0.9;
  }

  /** Jump the lens to the look direction and the eye to (x, y, z) now (teleports, respawn). */
  snapTo(x: number, y: number, z: number): void {
    this.pitch = clamp(this.pitch, -PITCH_LIMIT, PITCH_LIMIT);
    this.viewYaw = this.yaw;
    this.viewPitch = this.pitch;
    this.guardOffset.set(0, 0, 0);
    this.dip = this.dipVel = this.trauma = 0;
    clearOfRock(this.world, x, y, z, EYE_CLEARANCE, this.guarded);
    this.guardOffset.subVectors(this.guarded, this.tmp.set(x, y, z));
    this.eye.copy(this.guarded);
    this.initialized = true;
  }

  /**
   * Turn the look toward a world point at `rate` (1/s), only while it is more than `minDeg`
   * degrees off the centre of view (a target at the edge of the screen comes in; one near the
   * middle stays where it is).
   */
  faceToward(x: number, y: number, z: number, dt: number, rate = 4, minDeg = 14): void {
    const dx = x - this.eye.x;
    const dy = y - this.eye.y;
    const dz = z - this.eye.z;
    const flat = Math.hypot(dx, dz);
    if (flat < 0.05 && Math.abs(dy) < 0.05) return;
    const wantYaw = Math.atan2(-dx, -dz);
    const wantPitch = clamp(Math.atan2(dy, flat), -PITCH_LIMIT, PITCH_LIMIT);
    const yawErr = Math.atan2(Math.sin(wantYaw - this.yaw), Math.cos(wantYaw - this.yaw));
    const off = Math.hypot(yawErr, wantPitch - this.pitch);
    if (off < minDeg * DEG) return;
    this.yaw = dampAngle(this.yaw, wantYaw, rate, dt);
    this.pitch = damp(this.pitch, wantPitch, rate, dt);
  }

  /** Turn a share of the way toward a screen point (NDC): a tap on empty dark looks that way. */
  turnToward(ndcX: number, ndcY: number, share: number): void {
    const c = this.camera;
    const halfV = c.fov * 0.5 * DEG;
    const halfH = Math.atan(Math.tan(halfV) * c.aspect);
    this.yaw -= Math.atan(ndcX * Math.tan(halfH)) * share;
    this.pitch = clamp(this.pitch + Math.atan(ndcY * Math.tan(halfV)) * share, -PITCH_LIMIT, PITCH_LIMIT);
  }

  /** Place the lens at the eye point (x, y, z) of the body this frame. */
  update(dt: number, x: number, y: number, z: number, aspect: number): void {
    if (!this.initialized) this.snapTo(x, y, z);
    this.pitch = clamp(this.pitch, -PITCH_LIMIT, PITCH_LIMIT);
    this.viewYaw = dt > 0 ? dampAngle(this.viewYaw, this.yaw, LOOK_RATE, dt) : this.viewYaw;
    this.viewPitch = dt > 0 ? damp(this.viewPitch, this.pitch, LOOK_RATE, dt) : this.viewPitch;
    // Clearance: a deeper push applies at once (rock must never be in view); easing back out is
    // gentle, so brushing along a rough wall does not jerk the eye.
    clearOfRock(this.world, x, y, z, EYE_CLEARANCE, this.guarded);
    const want = this.tmp.subVectors(this.guarded, this.tmp.set(x, y, z));
    const go = this.guardOffset;
    if (want.lengthSq() >= go.lengthSq() || dt <= 0) go.copy(want);
    else {
      go.x = damp(go.x, want.x, 12, dt);
      go.y = damp(go.y, want.y, 12, dt);
      go.z = damp(go.z, want.z, 12, dt);
    }
    this.eye.set(x + go.x, y + go.y, z + go.z);
    // The landing dip: a damped spring back to level (about 0.3 s).
    if (dt > 0) {
      const k = 120;
      const c = 2 * Math.sqrt(k);
      this.dipVel += (-k * this.dip - c * this.dipVel) * dt;
      this.dip += this.dipVel * dt;
      this.trauma = Math.max(0, this.trauma - dt * 2);
    }
    const cam = this.camera;
    cam.position.copy(this.eye);
    cam.rotation.set(clamp(this.viewPitch + this.dip * 0.05, -PITCH_LIMIT - 0.05, PITCH_LIMIT + 0.05), this.viewYaw, 0);
    cam.fov = fpVerticalFov(aspect);
    cam.aspect = aspect;
    cam.near = NEAR;
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld();
  }

  /** Horizontal field of view (deg) the lens has now. */
  get horizontalFov(): number {
    const c = this.camera;
    return (2 * Math.atan(Math.tan(c.fov * 0.5 * DEG) * c.aspect)) / DEG;
  }

  /** The lens yaw this frame (movement is relative to what the player sees). */
  get moveYaw(): number {
    return this.viewYaw;
  }

  /** Lens pitch this frame. */
  get lensPitch(): number {
    return this.viewPitch;
  }

  /** World-space ray through normalized device coordinates. */
  rayThrough(ndcX: number, ndcY: number, outOrigin: THREE.Vector3, outDir: THREE.Vector3): void {
    outOrigin.copy(this.camera.position);
    outDir.set(ndcX, ndcY, 0.5).unproject(this.camera).sub(outOrigin).normalize();
  }
}
