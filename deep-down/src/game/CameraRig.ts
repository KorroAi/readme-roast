import * as THREE from 'three';
import { clamp, damp, dampAngle, lerp, saturate, smoothstep } from '../core/math';
import type { VoxelWorld } from '../world/VoxelWorld';
import { raycastVoxels } from '../world/raycast';
import { segmentClear } from '../world/light';

/** Boom ray bundle: sideways and vertical offsets from the shoulder point (m). */
const BUNDLE_SIDE = [0, 0.2, -0.2];
const BUNDLE_UP = [0, 0.18, -0.12];
/**
 * Distance kept from voxel hits. The mesher sculpts natural rock up to ~0.36 m into voxels the
 * rays treat as open (bevels, relief), so the lens keeps 0.4 m: it never clips a rendered bevel.
 */
const ROCK_MARGIN = 0.4;
/** Shares of the shoulder offset and of the boom kept when looking straight down (see update). */
const LOOK_DOWN_SHOULDER = 0.55;
const LOOK_DOWN_BOOM = 0.62;
/**
 * Shares of the shoulder tried when the boom is cut short, and how they are scored: boom length
 * counts up to SLIDE_COMFORT metres, and each unit of shoulder share is worth SLIDE_PREFER metres.
 */
const SLIDES = [0.7, 0.4];
const SLIDE_COMFORT = 5.4;
const SLIDE_PREFER = 2.6;
/**
 * Shoulder step: when no framing on this shoulder gets a boom of STEP_ROOM metres and the other
 * shoulder's boom is STEP_GAIN metres longer, the rig steps over; it steps back once the first
 * side has STEP_ROOM + STEP_BACK metres, or is within STEP_BACK of the other (hysteresis).
 */
const STEP_ROOM = 4.4;
const STEP_GAIN = 2.0;
const STEP_BACK = 0.4;
/** Time scale of a shoulder swap (s): critically damped, about 1 s from one side to the other. */
const SIDE_SMOOTH_TIME = 0.32;
/**
 * Close lens: while rock holds the boom short, the horizontal field of view opens from `hfov`
 * toward HFOV_CLOSE (deg), fully at CLOSE_BOOM[0] metres and not at all from CLOSE_BOOM[1], so the
 * explorer does not swell to fill the frame in tight spots. Driven by the eased boom (LENS_RATE),
 * so the lens drifts instead of popping when the boom snaps in.
 */
const HFOV_CLOSE = 106;
const CLOSE_BOOM: readonly [number, number] = [2.4, 5.8];
const LENS_RATE = 3;
/**
 * Looking up, the boom would dive into the floor behind the explorer and drag the lens in to a
 * huge foreground figure. Past LOW_BOOM rad below the pivot only LOW_BOOM_SHARE of the extra
 * pitch tips the boom further down: the lens stays back (the explorer drops low in the frame,
 * out of the way of what is above).
 */
const LOW_BOOM = 0.08;
/**
 * Facing rock: probes straight ahead of the explorer at these heights above the pivot (waist,
 * chest, head). Rock within NEAR_FULL metres (fading out by NEAR_NONE) narrows the yaw framing to
 * NEAR_YAW of itself, so the crosshair line comes back toward the explorer where there is work to
 * do (a face to mine) and no route ahead to show: from a long boom, a wide framing would look at
 * the face from far off to the side, where its neighbours hide it.
 */
const NEAR_HEIGHTS = [-0.9, 0, 0.7];
const NEAR_FULL = 2.2;
const NEAR_NONE = 3.8;
const NEAR_YAW = 0;
const NEAR_RATE = 3;
const LOW_BOOM_SHARE = 0.15;
const DEG = Math.PI / 180;

/**
 * Third-person over-the-shoulder camera with voxel collision.
 *
 * Yaw/pitch come from look input and set the lens direction (the crosshair). The camera sits
 * behind and to the right of a pivot at the explorer's upper chest: a sideways shoulder offset
 * plus a boom that is turned a little against the lens (`frameYaw`, `framePitch`), so the
 * explorer stands low and left of the crosshair and the route ahead stays in view. The lens
 * keeps a fixed horizontal field of view on landscape screens (no stretched edges on a wide
 * phone). When rock pulls the boom in, the yaw framing gives back what the shorter boom adds
 * (the explorer keeps its place on screen, clear of the left thumb), the lens opens a little,
 * and if the other shoulder sees clearly further the rig steps over to it. The boom is pulled in
 * (at once) when rock is in the way and eases back out (slowly) when space opens up, so tight
 * tunnels never put rock between the camera and the explorer.
 */
export class CameraRig {
  readonly camera: THREE.PerspectiveCamera;
  yaw = 0;
  pitch = -0.18;
  /** Smoothed current boom length. */
  distance = 8;
  /**
   * Boom length in open space: with the 90 degree lens it keeps the explorer about 100 px tall
   * on a 412 px high phone screen (the round-3 4.8 m boom had a 111 degree lens).
   */
  maxDistance = 8;
  /** Sideways shoulder offset in landscape (m); cast first and shortened against walls. */
  shoulder = 1.0;
  /**
   * Boom turned against the lens (rad): the lens looks this far above the line from the camera
   * to the pivot, so the explorer stands in the lower third and the floor ahead shows above the
   * hat.
   */
  framePitch = 0.14;
  /**
   * ... and this far to the side of it at the full boom (on top of the shoulder), so the explorer
   * stands left of the crosshair (right of it on the left shoulder), at about a third of the width.
   */
  frameYaw = 0.21;
  /** Horizontal field of view (deg) on landscape screens: locked to the screen's width. */
  hfov = 90;
  /** Upper limit of the vertical field of view (deg): narrow (portrait) screens keep this. */
  maxVfov = 72;
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
  /** Side the boom check stepped to (+1/-1), 0 when the sideways rule decides. */
  private stepped = 0;
  /** Boom length allowed this frame: maxDistance, shorter when looking down. */
  private boomLen = 8;
  /** Rock straight ahead (0..1, eased): narrows the yaw framing (NEAR_*). */
  private near = 0;
  /** Boom eased both ways (LENS_RATE): drives the close lens and the yaw framing give-back. */
  private lensDist = 8;
  private trauma = 0;
  private shakeTime = 0;
  private readonly pivot = new THREE.Vector3();
  private readonly pivotTarget = new THREE.Vector3();
  private initialized = false;
  private readonly tmp = new THREE.Vector3();
  private readonly dir = new THREE.Vector3();
  private readonly probeDir = new THREE.Vector3();

  constructor(private readonly world: VoxelWorld, hfov = 90) {
    this.hfov = hfov;
    this.camera = new THREE.PerspectiveCamera(50, 1, 0.05, 320);
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
    this.lensDist = this.maxDistance;
    this.near = -1;
    this.side = 1;
    this.sideVel = 0;
    this.stepped = 0;
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
    // push the explorer off the left edge, so the shoulder and the yaw framing shrink. 1 from
    // 16:9 up, 0 at 4:5.
    const wide = saturate((aspect - 0.8) / 0.9);
    // Looking down (to mine at the feet) the framing eases toward a classic over-the-shoulder
    // view: the pitch tilt fades out and the shoulder comes in, so the aim line comes back to the
    // explorer (with the full framing, ground right in front of the boots would need the lens to
    // pitch past its limit). Full framing down to -0.3 rad, none from -1.0, smoothly, so the
    // camera never swings faster than the look input.
    const d0 = saturate((-this.pitch - 0.3) / 0.7);
    const down = d0 * d0 * (3 - 2 * d0);
    const shoulder = this.shoulder * lerp(0.45, 1, wide) * lerp(1, LOOK_DOWN_SHOULDER, down);
    // ... and the boom comes in (to 62 %), so the boots are not seen from a lens 6 m overhead.
    this.boomLen = this.maxDistance * lerp(1, LOOK_DOWN_BOOM, down);
    // Rock right in front: narrow the yaw framing (eased, so walking up to a face glides).
    const fx = -Math.sin(this.yaw);
    const fz = -Math.cos(this.yaw);
    let near = 0;
    for (const h of NEAR_HEIGHTS) {
      const hit = raycastVoxels(this.world, this.pivot.x, this.pivot.y + h, this.pivot.z, fx, 0, fz, NEAR_NONE);
      if (hit) near = Math.max(near, 1 - smoothstep(NEAR_FULL, NEAR_NONE, hit.distance));
    }
    this.near = this.near < 0 ? near : damp(this.near, near, NEAR_RATE, dt);
    const yawFull = this.frameYaw * wide * (1 - down) * lerp(1, NEAR_YAW, this.near);
    const bpRaw = this.pitch - this.framePitch * (1 - down);
    const bp = bpRaw > LOW_BOOM ? LOW_BOOM + (bpRaw - LOW_BOOM) * LOW_BOOM_SHARE : bpRaw;
    const right = this.tmp.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));

    // 1) Shoulder offset, shortened if a wall is right beside the explorer. When the right side
    //    is walled in and the left is open, swap shoulders so the explorer never sits on the
    //    crosshair in a narrow tunnel.
    const reach = shoulder + ROCK_MARGIN;
    const hitR = raycastVoxels(this.world, this.pivot.x, this.pivot.y, this.pivot.z, right.x, 0, right.z, reach);
    const hitL = raycastVoxels(this.world, this.pivot.x, this.pivot.y, this.pivot.z, -right.x, 0, -right.z, reach);
    const roomR = hitR ? Math.max(0, hitR.distance - ROCK_MARGIN) : shoulder;
    const roomL = hitL ? Math.max(0, hitL.distance - ROCK_MARGIN) : shoulder;
    // The offset uses the room smoothed: it shrinks at once (the shoulder point must stay out of
    // rock) but grows back slowly, so walking along a rough wall does not jerk the camera sideways.
    // It never exceeds this frame's room.
    this.roomR = roomR < this.roomR ? roomR : damp(this.roomR, roomR, 4, dt);
    this.roomL = roomL < this.roomL ? roomL : damp(this.roomL, roomL, 4, dt);
    // Hysteresis: once on the left, return only when the right is clearly open again.
    const natural = this.side < 0
      ? roomR >= shoulder * 0.9 || roomR > roomL + 0.2 ? 1 : -1
      : roomR >= shoulder * 0.5 || roomR >= roomL ? 1 : -1;
    if (this.stepped === natural) this.stepped = 0;
    const want = this.stepped || natural;
    // Critically damped, so a swap starts and ends gently (no jolt) and never overshoots. A swap
    // at a long boom carries the lens further, so it takes a little longer.
    this.side = this.smoothSide(want, dt, lerp(1, 1.6, saturate((this.lensDist - 4.8) / 3.2)));
    const full = this.side >= 0 ? Math.min(shoulder * this.side, this.roomR) : -Math.min(-shoulder * this.side, this.roomL);
    // Yaw framing: the explorer's angle off the lens is the shoulder's angle at this boom plus the
    // frame yaw. Set for the full boom, it would grow as rock pulls the boom in and push the
    // explorer toward the left edge (the thumb), so the frame yaw gives back what the shoulder
    // adds (down to none), from the eased boom: the explorer keeps its place on screen for any
    // boom down to about shoulder / tan(angle), 2.8 m. It follows the shoulder side (on the left
    // shoulder the explorer stands right of the crosshair).
    const angle = Math.atan2(shoulder, this.maxDistance) + yawFull;
    const frameYaw = clamp(angle - Math.atan2(Math.abs(full), Math.max(0.05, this.lensDist)), 0, yawFull) * this.side;

    // 2) Boom: a small bundle of rays cast back from the (open) shoulder point, turned against
    //    the lens by the framing angles. If a post, a corner or a wall beside the route cuts the
    //    boom short while a framing nearer the explorer's back sees clearly further, the framing
    //    slides in (shoulder and yaw framing together, smoothly) instead of the camera crowding
    //    the explorer; it slides back out once the full framing is clear. Candidates are judged at
    //    fixed offsets, so the choice does not feed back on itself.
    const fullRoom = this.boomRoom(right, full, this.boomDir(this.dir, bp, this.yaw + frameYaw));
    const cut = fullRoom < this.boomLen - 0.4;
    let use = 1;
    let score = Math.min(fullRoom, SLIDE_COMFORT) + SLIDE_PREFER;
    let bestRoom = fullRoom;
    if (cut) {
      // Score: boom length up to a comfortable one, plus a preference for the full framing.
      for (const u of SLIDES) {
        const room = this.boomRoom(right, full * u, this.boomDir(this.probeDir, bp, this.yaw + frameYaw * u));
        bestRoom = Math.max(bestRoom, room);
        const s = Math.min(room, SLIDE_COMFORT) + SLIDE_PREFER * u;
        if (s > score + 0.05) {
          score = s;
          use = u;
        }
      }
    }
    this.shoulderUse = damp(this.shoulderUse, use, 2.5, dt);
    const lateral = full * this.shoulderUse;
    const ox = this.pivot.x + right.x * lateral;
    const oy = this.pivot.y;
    const oz = this.pivot.z + right.z * lateral;
    let allowed = fullRoom;
    if (this.shoulderUse < 0.999) allowed = this.boomRoom(right, lateral, this.boomDir(this.dir, bp, this.yaw + frameYaw * this.shoulderUse));
    // Snap in at once (never let rock come between camera and explorer); ease back out slowly.
    this.distance = allowed < this.distance ? allowed : damp(this.distance, allowed, 3, dt);
    this.lensDist = damp(this.lensDist, this.distance, LENS_RATE, dt);

    // 3) Shoulder step (decided for the next frame): when no framing on this side gets even a
    //    medium boom, judge the other shoulder at its settled offsets; step over when it sees
    //    clearly further, and back once this side has room again (or about as much). A side with
    //    little sideways room is never stepped to (the lens would sit behind the explorer's head).
    if ((cut && bestRoom < STEP_ROOM) || this.stepped !== 0) {
      const cur = want;
      const yawAt = Math.abs(frameYaw) / Math.max(1e-3, Math.abs(this.side));
      const curRoom = Math.abs(this.side - cur) < 1e-3 ? bestRoom : this.sideRoom(cur, cur > 0 ? roomR : roomL, shoulder, bp, yawAt, right);
      const other = -cur;
      const otherWidth = Math.min(shoulder, other > 0 ? roomR : roomL);
      const otherRoom = this.sideRoom(other, otherWidth, shoulder, bp, yawAt, right);
      if (this.stepped !== 0) {
        // Stepped over (`other` is the side the sideways rule picks): return once it has room.
        if (otherRoom >= Math.min(STEP_ROOM + STEP_BACK, curRoom - STEP_BACK)) this.stepped = 0;
      } else if (otherWidth >= shoulder * 0.5 && otherRoom > curRoom + STEP_GAIN) this.stepped = other;
    }

    const cam = this.camera;
    cam.position.set(ox + this.dir.x * this.distance, oy + this.dir.y * this.distance, oz + this.dir.z * this.distance);
    // 4) Last guard: pull in while the lens is inside rock (a ray grazed a corner) or rock hides
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
    // The rig owns the lens in play (the menu sets its own and does not run the rig): the
    // horizontal field of view is locked, so a wider phone sees more of the cave instead of a
    // stretched image; narrow screens keep at most maxVfov vertically. The close lens opens both
    // by the same factor.
    const close = 1 - smoothstep(CLOSE_BOOM[0], CLOSE_BOOM[1], this.lensDist);
    const tanH = Math.tan(this.hfov * 0.5 * DEG);
    const open = lerp(1, Math.tan(HFOV_CLOSE * 0.5 * DEG) / tanH, close);
    cam.fov = (2 * Math.atan(Math.min(tanH / aspect, Math.tan(this.maxVfov * 0.5 * DEG)) * open)) / DEG;
    cam.aspect = aspect;
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld();
  }

  /** Horizontal field of view (deg) the lens has now. */
  get horizontalFov(): number {
    const c = this.camera;
    return (2 * Math.atan(Math.tan(c.fov * 0.5 * DEG) * c.aspect)) / DEG;
  }

  /** Boom direction (pivot to lens) for boom pitch `bp` and boom yaw `by`. */
  private boomDir(out: THREE.Vector3, bp: number, by: number): THREE.Vector3 {
    const cy = Math.cos(bp);
    return out.set(Math.sin(by) * cy, -Math.sin(bp), Math.cos(by) * cy);
  }

  /** Longest boom shoulder side `sgn` gets once settled, over its framings (full and slides). */
  private sideRoom(sgn: number, width: number, shoulder: number, bp: number, frameYaw: number, right: THREE.Vector3): number {
    const w = Math.min(shoulder, width);
    let best = 0;
    for (const u of [1, ...SLIDES]) {
      best = Math.max(best, this.boomRoom(right, sgn * w * u, this.boomDir(this.probeDir, bp, this.yaw + frameYaw * sgn * u)));
      if (best >= this.boomLen) break;
    }
    return best;
  }

  /** One step of a critically damped spring toward `target` (stable at any dt; ~1 s to settle). */
  private smoothSide(target: number, dt: number, slow = 1): number {
    const omega = 2 / (SIDE_SMOOTH_TIME * slow);
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

  /** Boom length the rock allows along `dir` from the shoulder point at `lateral` metres along `right`. */
  private boomRoom(right: THREE.Vector3, lateral: number, dir: THREE.Vector3): number {
    const ox = this.pivot.x + right.x * lateral;
    const oy = this.pivot.y;
    const oz = this.pivot.z + right.z * lateral;
    let allowed = this.boomLen;
    for (const off of BUNDLE_SIDE) {
      for (const offY of BUNDLE_UP) {
        const hit = raycastVoxels(this.world, ox + right.x * off, oy + offY, oz + right.z * off, dir.x, dir.y, dir.z, this.boomLen + 0.4);
        if (hit) allowed = Math.min(allowed, hit.distance - ROCK_MARGIN);
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
