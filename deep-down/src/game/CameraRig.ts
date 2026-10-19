import * as THREE from 'three';
import { clamp, damp, dampAngle, lerp, saturate } from '../core/math';
import type { VoxelWorld } from '../world/VoxelWorld';
import { raycastVoxels } from '../world/raycast';
import { segmentClear } from '../world/light';

/** Boom ray bundle: sideways and vertical offsets from the shoulder point (m). */
const BUNDLE_SIDE = [0, 0.2, -0.2];
const BUNDLE_UP = [0, 0.18, -0.12];
/**
 * Shares of the shoulder tried when the boom is cut short, and how they are scored: boom length
 * counts up to SLIDE_COMFORT metres, and each unit of shoulder share is worth SLIDE_PREFER metres.
 */
const SLIDES = [0.7, 0.4];
const SLIDE_COMFORT = 3.6;
const SLIDE_PREFER = 2;
/** Time scale of a shoulder swap (s): critically damped, about 1 s from one side to the other. */
const SIDE_SMOOTH_TIME = 0.32;

/**
 * Third-person over-the-shoulder camera with voxel collision.
 *
 * Yaw/pitch come from look input and set the lens direction (the crosshair). The camera sits
 * behind and to the right of a pivot at the explorer's upper chest: a sideways shoulder offset
 * plus a boom that is turned a little against the lens (`frameYaw`, `framePitch`), so the
 * explorer stands low and left of the crosshair and the route ahead stays in view. Because the
 * framing is an angle, it shrinks with the boom: when rock pulls the boom in, the camera comes
 * closer and lower on its own. The boom is pulled in (at once) when rock is in the way and eases
 * back out (slowly) when space opens up, so tight tunnels never put rock between the camera and
 * the explorer.
 */
export class CameraRig {
  readonly camera: THREE.PerspectiveCamera;
  yaw = 0;
  pitch = -0.18;
  /** Smoothed current boom length. */
  distance = 4.8;
  /** Boom length in open space. */
  maxDistance = 4.8;
  /** Sideways shoulder offset in landscape (m); cast first and shortened against walls. */
  shoulder = 1.15;
  /**
   * Boom turned against the lens (rad): the lens looks this far above the line from the camera
   * to the pivot (at the full boom its aim passes 0.8 m over the chest, half a metre over the
   * hat), so the explorer stands in the lower third and the floor ahead shows above the hat.
   */
  framePitch = 0.17;
  /** ... and this far to the right of it (on top of the shoulder), so the explorer stands left. */
  frameYaw = 0.06;
  /** Vertical field of view (deg) in landscape; narrow screens (portrait) get a little more. */
  fov = 67;
  sensitivity = 1;
  invertY = false;
  shakeScale = 1;
  /** Shoulder side, smoothed: +1 right, -1 left (switches when the right side is walled in). */
  private side = 1;
  /** Sideways room for the shoulder, smoothed: shrinks at once, grows back slowly (no jitter). */
  private roomR = 0;
  private roomL = 0;
  /** Share of the shoulder in use, smoothed (1, or one of SLIDES while a post blocks the boom). */
  private shoulderUse = 1;
  private sideVel = 0;
  private trauma = 0;
  private shakeTime = 0;
  private readonly pivot = new THREE.Vector3();
  private readonly pivotTarget = new THREE.Vector3();
  private initialized = false;
  private readonly tmp = new THREE.Vector3();
  private readonly dir = new THREE.Vector3();

  constructor(private readonly world: VoxelWorld, fov = 67) {
    this.fov = fov;
    this.camera = new THREE.PerspectiveCamera(fov, 1, 0.05, 320);
    this.camera.rotation.order = 'YXZ';
  }

  /** Apply look input in CSS pixels. */
  look(dxPx: number, dyPx: number): void {
    const k = 0.0042 * this.sensitivity;
    this.yaw -= dxPx * k;
    this.pitch -= dyPx * k * (this.invertY ? -1 : 1);
    this.pitch = clamp(this.pitch, -1.2, 0.85);
  }

  /** Add camera shake (0..1), e.g. on impacts and landings. */
  addTrauma(amount: number): void {
    this.trauma = Math.min(1, this.trauma + amount * this.shakeScale);
  }

  snapTo(px: number, py: number, pz: number): void {
    this.pivotTarget.set(px, py, pz);
    this.pivot.copy(this.pivotTarget);
    this.distance = this.maxDistance;
    this.side = 1;
    this.sideVel = 0;
    this.roomR = this.roomL = this.shoulder;
    this.shoulderUse = 1;
    this.initialized = true;
  }

  /** Gently rotate the camera behind the explorer when walking without touching look. */
  autoFollow(bodyYaw: number, moving: boolean, dt: number): void {
    if (!moving) return;
    // Camera yaw that looks along the body's forward vector (sin(yaw), cos(yaw)).
    const behind = bodyYaw + Math.PI;
    this.yaw = dampAngle(this.yaw, behind, 0.6, dt);
  }

  update(dt: number, px: number, py: number, pz: number, aspect: number): void {
    this.pivotTarget.set(px, py, pz);
    if (!this.initialized) this.snapTo(px, py, pz);
    // Follow the pivot tightly horizontally, a little softer vertically (smooths steps/jumps).
    this.pivot.x = damp(this.pivot.x, this.pivotTarget.x, 22, dt);
    this.pivot.z = damp(this.pivot.z, this.pivotTarget.z, 22, dt);
    this.pivot.y = damp(this.pivot.y, this.pivotTarget.y, 14, dt);

    // Framing follows the screen shape: on a narrow (portrait) screen the landscape shoulder would
    // push the explorer off the left edge, so the shoulder and the yaw framing shrink and the
    // lens widens a little. 1 from 16:9 up, 0 at 4:5.
    const wide = saturate((aspect - 0.8) / 0.9);
    const shoulder = this.shoulder * lerp(0.45, 1, wide);
    const frameYaw = this.frameYaw * wide;

    // Boom (lens to pivot, backwards), turned against the lens direction by the framing angles.
    const bp = this.pitch - this.framePitch;
    const by = this.yaw + frameYaw;
    const cy = Math.cos(bp);
    this.dir.set(Math.sin(by) * cy, -Math.sin(bp), Math.cos(by) * cy);
    const right = this.tmp.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));

    // 1) Shoulder offset, shortened if a wall is right beside the explorer. When the right side
    //    is walled in and the left is open, swap shoulders so the explorer never sits on the
    //    crosshair in a narrow tunnel.
    const reach = shoulder + 0.3;
    const hitR = raycastVoxels(this.world, this.pivot.x, this.pivot.y, this.pivot.z, right.x, 0, right.z, reach);
    const hitL = raycastVoxels(this.world, this.pivot.x, this.pivot.y, this.pivot.z, -right.x, 0, -right.z, reach);
    const roomR = hitR ? Math.max(0, hitR.distance - 0.3) : shoulder;
    const roomL = hitL ? Math.max(0, hitL.distance - 0.3) : shoulder;
    // The offset uses the room smoothed: it shrinks at once (the shoulder point must stay out of
    // rock) but grows back slowly, so walking along a rough wall does not jerk the camera sideways.
    // It never exceeds this frame's room.
    this.roomR = roomR < this.roomR ? roomR : damp(this.roomR, roomR, 4, dt);
    this.roomL = roomL < this.roomL ? roomL : damp(this.roomL, roomL, 4, dt);
    // Hysteresis: once on the left, return only when the right is clearly open again.
    const want = this.side < 0
      ? roomR >= shoulder * 0.9 || roomR > roomL + 0.2 ? 1 : -1
      : roomR >= shoulder * 0.5 || roomR >= roomL ? 1 : -1;
    // Critically damped, so a swap starts and ends gently (no jolt) and never overshoots.
    this.side = this.smoothSide(want, dt);
    const full = this.side >= 0 ? Math.min(shoulder * this.side, this.roomR) : -Math.min(-shoulder * this.side, this.roomL);

    // 2) Boom: a small bundle of rays cast back from the (open) shoulder point. If a post or a
    //    corner behind the shoulder cuts the boom short while a point nearer the explorer's back
    //    sees clearly further, the shoulder slides in (smoothly) instead of the camera
    //    crowding the explorer; it slides back out once the full shoulder is clear. Candidates
    //    are judged at fixed offsets, so the choice does not feed back on itself.
    const fullRoom = this.boomRoom(right, full);
    let use = 1;
    if (fullRoom < this.maxDistance - 0.4) {
      // Score: boom length up to a comfortable one, plus a preference for the wide shoulder.
      let best = Math.min(fullRoom, SLIDE_COMFORT) + SLIDE_PREFER;
      for (const u of SLIDES) {
        const score = Math.min(this.boomRoom(right, full * u), SLIDE_COMFORT) + SLIDE_PREFER * u;
        if (score > best + 0.05) {
          best = score;
          use = u;
        }
      }
    }
    this.shoulderUse = damp(this.shoulderUse, use, 2.5, dt);
    const lateral = full * this.shoulderUse;
    const ox = this.pivot.x + right.x * lateral;
    const oy = this.pivot.y;
    const oz = this.pivot.z + right.z * lateral;
    const allowed = this.shoulderUse > 0.999 ? fullRoom : this.boomRoom(right, lateral);
    // Snap in at once (never let rock come between camera and explorer); ease back out slowly.
    this.distance = allowed < this.distance ? allowed : damp(this.distance, allowed, 3, dt);

    const cam = this.camera;
    cam.position.set(ox + this.dir.x * this.distance, oy + this.dir.y * this.distance, oz + this.dir.z * this.distance);
    // 3) Last guard: pull in while the lens is inside rock (a ray grazed a corner) or rock hides
    //    the explorer (the straight pivot-to-lens line is not one of the rays). At distance 0 the
    //    lens is the shoulder point, whose line from the pivot was ray-checked in step 1.
    const p = this.pivot;
    const steps = Math.ceil(this.maxDistance / 0.15) + 1;
    for (
      let i = 0;
      i < steps && this.distance > 0 && (this.world.isSolidAt(cam.position.x, cam.position.y, cam.position.z) || !segmentClear(this.world, p.x, p.y, p.z, cam.position.x, cam.position.y, cam.position.z));
      i++
    ) {
      this.distance = Math.max(0, this.distance - 0.15);
      cam.position.set(ox + this.dir.x * this.distance, oy + this.dir.y * this.distance, oz + this.dir.z * this.distance);
    }

    // Shake (decaying trauma, smooth noise-like offsets).
    this.shakeTime += dt;
    this.trauma = Math.max(0, this.trauma - dt * 1.8);
    const s = this.trauma * this.trauma;
    const t = this.shakeTime * 34;
    const shakeYaw = s * 0.018 * (Math.sin(t * 1.1) + Math.sin(t * 2.3 + 1.7) * 0.5);
    const shakePitch = s * 0.018 * (Math.sin(t * 1.3 + 0.5) + Math.sin(t * 2.9 + 2.1) * 0.5);
    cam.rotation.set(this.pitch + shakePitch, this.yaw + shakeYaw, 0);
    // The rig owns the lens in play (the menu sets its own and does not run the rig).
    cam.fov = lerp(this.fov + 5, this.fov, wide);
    cam.aspect = aspect;
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld();
  }

  /** One step of a critically damped spring toward `target` (stable at any dt; ~1 s to settle). */
  private smoothSide(target: number, dt: number): number {
    const omega = 2 / SIDE_SMOOTH_TIME;
    const x = omega * dt;
    const k = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
    const change = this.side - target;
    const temp = (this.sideVel + omega * change) * dt;
    this.sideVel = (this.sideVel - omega * temp) * k;
    let out = target + (change + temp) * k;
    // No overshoot past the target.
    if ((target - this.side > 0) === (out > target)) {
      out = target;
      this.sideVel = 0;
    }
    return clamp(out, -1, 1);
  }

  /** Boom length the rock allows from the shoulder point at `lateral` metres along `right`. */
  private boomRoom(right: THREE.Vector3, lateral: number): number {
    const ox = this.pivot.x + right.x * lateral;
    const oy = this.pivot.y;
    const oz = this.pivot.z + right.z * lateral;
    let allowed = this.maxDistance;
    for (const off of BUNDLE_SIDE) {
      for (const offY of BUNDLE_UP) {
        const hit = raycastVoxels(this.world, ox + right.x * off, oy + offY, oz + right.z * off, this.dir.x, this.dir.y, this.dir.z, this.maxDistance + 0.4);
        if (hit) allowed = Math.min(allowed, hit.distance - 0.3);
      }
    }
    return Math.max(0, allowed);
  }

  /** Camera forward direction in the horizontal plane (for movement). */
  get moveYaw(): number {
    return this.yaw;
  }

  /** World-space ray through normalized device coordinates. */
  rayThrough(ndcX: number, ndcY: number, outOrigin: THREE.Vector3, outDir: THREE.Vector3): void {
    outOrigin.copy(this.camera.position);
    outDir.set(ndcX, ndcY, 0.5).unproject(this.camera).sub(outOrigin).normalize();
  }
}
