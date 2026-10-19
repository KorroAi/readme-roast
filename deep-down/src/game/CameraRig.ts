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
const CLOSE_BOOM: readonly [number, number] = [3, 7.8];
const LENS_RATE = 1.6;
/** Fastest the boom grows back (m/s): an 8.3 m boom easing out at its rate alone would rush. */
const BOOM_OUT_SPEED = 5;
/**
 * Passages: a roof (rock straight above the pivot, or 2 m or 4 m back along the boom) within
 * ROOF_LOW metres, fading out by ROOF_HIGH, and walls around (the mean free length of FREE_DIRS
 * level probes of FREE_PROBE metres, two a frame in turn) within FREE_LOW, fading out by
 * FREE_HIGH, make a tunnel; either one open (a ledge under an overhang facing the Hollow, a
 * hall) makes open cave. In a tunnel the boom is TUNNEL_BOOM (eased at ROOF_RATE): an 8.3 m boom
 * would back the lens round the last bend, where the near wall fills the frame and the way on is
 * lost.
 */
const ROOF_LOW = 4;
const ROOF_HIGH = 6.5;
const FREE_DIRS = 8;
const FREE_PROBE = 7;
const FREE_LOW = 3.8;
const FREE_HIGH = 6;
const ROOF_RATE = 1.5;
const TUNNEL_BOOM = 5.4;
/**
 * Route ahead: the lens must see the point LOOK_AHEAD metres in front of the explorer (at
 * LOOK_DROP below the pivot) whenever the explorer does. Backing round a bend, the inside wall
 * of the bend would come between the lens and the way on and fill half the frame, so the boom
 * comes in (eased, as for open space) to the longest of these shares of itself that sees it,
 * never below LOOK_MIN metres (if none does, it stays).
 */
const LOOK_AHEAD = 3.5;
const LOOK_DROP = 0.6;
const LOOK_SHARES = [0.82, 0.66, 0.52];
const LOOK_MIN = 2.6;
/**
 * Looking up, the boom would dive into the floor behind the explorer and drag the lens in to a
 * huge foreground figure. Past LOW_BOOM rad below the pivot only LOW_BOOM_SHARE of the extra
 * pitch tips the boom further down: the lens stays back (the explorer drops low in the frame,
 * out of the way of what is above).
 */
const LOW_BOOM = 0.08;
const LOW_BOOM_SHARE = 0.15;
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
const DEG = Math.PI / 180;

/**
 * Vertical field of view (deg) that spans `hfov` degrees across a screen of `aspect` (width /
 * height), at most `maxVfov` vertically: a locked horizontal lens on landscape screens, a capped
 * vertical one on narrow (portrait) screens. At 915 x 412 a 90 degree lens is 48.5 degrees tall.
 */
export function lockedVerticalFov(aspect: number, hfov = 90, maxVfov = 72): number {
  return (2 * Math.atan(Math.min(Math.tan(hfov * 0.5 * DEG) / aspect, Math.tan(maxVfov * 0.5 * DEG)))) / DEG;
}

/**
 * Third-person over-the-shoulder camera with voxel collision.
 *
 * Yaw/pitch come from look input and set the lens direction (the crosshair). The camera sits
 * behind and to the right of a pivot at the explorer's upper chest: a sideways shoulder offset
 * plus a boom that is turned a little against the lens (`frameYaw`, `framePitch`), so the
 * explorer stands low in the left third of the frame and the route ahead stays in view. The lens
 * keeps a fixed 90 degree horizontal field of view on landscape screens (no stretched edges on a
 * wide phone), so the boom is long (8.3 m) to keep the explorer about 100 px tall.
 *
 * The space shapes the framing: in a passage the boom is shorter (TUNNEL_BOOM) and it comes in
 * until the lens sees the way on (LOOK_*); facing rock, the yaw framing narrows so the crosshair
 * line comes back toward the explorer (NEAR_*); looking down the boom and shoulder come in;
 * looking up the boom stays above the floor (LOW_BOOM). When rock pulls the boom in, the yaw
 * framing gives back what the shorter boom adds (the explorer keeps its place on screen, clear of
 * the left thumb), the lens opens a little (HFOV_CLOSE), the framing slides in past posts, and
 * if the other shoulder sees clearly further the rig steps over to it (STEP_*). The boom is
 * pulled in at once when rock is in the way and eases back out (slowly) when space opens up, so
 * rock never comes between the camera and the explorer.
 */
export class CameraRig {
  readonly camera: THREE.PerspectiveCamera;
  yaw = 0;
  pitch = -0.18;
  /** Smoothed current boom length. */
  distance = 8.3;
  /**
   * Boom length in open space: with the 90 degree lens it keeps the explorer 90-110 px tall on a
   * 412 px high phone screen, by pitch (the round-3 4.8 m boom had a 111 degree lens).
   */
  maxDistance = 8.3;
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
  /** Boom length allowed this frame: maxDistance (TUNNEL_BOOM in a passage), shorter when looking down. */
  private boomLen = 8.3;
  /** Open cave (1) or passage (0), eased (-1: snap at the next update). */
  private openness = -1;
  /** Free length of each level probe (m), and the next one to cast. */
  private readonly free = new Float32Array(FREE_DIRS).fill(FREE_PROBE);
  private freeNext = 0;
  /** Rock straight ahead (0..1, eased): narrows the yaw framing (NEAR_*). */
  private near = 0;
  /** Boom eased both ways (LENS_RATE): drives the close lens and the yaw framing give-back. */
  private lensDist = 8.3;
  private trauma = 0;
  private shakeTime = 0;
  private readonly pivot = new THREE.Vector3();
  private readonly pivotTarget = new THREE.Vector3();
  private initialized = false;
  private readonly tmp = new THREE.Vector3();
  private readonly dir = new THREE.Vector3();
  private readonly probeDir = new THREE.Vector3();
  private readonly lookPoint = new THREE.Vector3();

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
    this.openness = -1;
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
    // In a passage (ROOF_*) the boom is shorter.
    let roof = ROOF_HIGH;
    for (const back of [0, 2, 4]) {
      const hit = raycastVoxels(this.world, this.pivot.x + Math.sin(this.yaw) * back, this.pivot.y, this.pivot.z + Math.cos(this.yaw) * back, 0, 1, 0, ROOF_HIGH);
      if (hit) roof = Math.min(roof, hit.distance);
    }
    const snapRoom = this.openness < 0;
    let free = 0;
    for (let k = 0; k < (snapRoom ? FREE_DIRS : 2); k++) {
      const i = this.freeNext;
      this.freeNext = (i + 1) % FREE_DIRS;
      const a = (i / FREE_DIRS) * Math.PI * 2;
      const hit = raycastVoxels(this.world, this.pivot.x, this.pivot.y, this.pivot.z, Math.cos(a), 0, Math.sin(a), FREE_PROBE);
      this.free[i] = hit ? hit.distance : FREE_PROBE;
    }
    for (let i = 0; i < FREE_DIRS; i++) free += this.free[i];
    const passage = (1 - smoothstep(ROOF_LOW, ROOF_HIGH, roof)) * (1 - smoothstep(FREE_LOW, FREE_HIGH, free / FREE_DIRS));
    this.openness = snapRoom ? 1 - passage : damp(this.openness, 1 - passage, ROOF_RATE, dt);
    this.boomLen = lerp(Math.min(TUNNEL_BOOM, this.maxDistance), this.maxDistance, this.openness) * lerp(1, LOOK_DOWN_BOOM, down);
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
    const angle = Math.atan2(shoulder, this.boomLen) + yawFull;
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
    // Route ahead (LOOK_*): the longest boom that also sees the way on, if the explorer sees it.
    const look = this.lookPoint.set(this.pivot.x + fx * LOOK_AHEAD, this.pivot.y - LOOK_DROP, this.pivot.z + fz * LOOK_AHEAD);
    let target = allowed;
    const route = segmentClear(this.world, this.pivot.x, this.pivot.y, this.pivot.z, look.x, look.y, look.z);
    if (route && allowed > LOOK_MIN && !this.seesFrom(ox, oy, oz, allowed, look)) {
      for (const k of LOOK_SHARES) {
        if (allowed * k > LOOK_MIN && this.seesFrom(ox, oy, oz, allowed * k, look)) {
          target = allowed * k;
          break;
        }
      }
    }
    // Snap in at once when rock is in the way (never let it come between camera and explorer);
    // ease back out slowly, and ease in toward a boom that sees the route ahead.
    if (allowed < this.distance) this.distance = allowed;
    else {
      const eased = damp(this.distance, target, 3, dt);
      this.distance = eased > this.distance ? Math.min(eased, this.distance + BOOM_OUT_SPEED * dt) : eased;
    }
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
    // Looking up, the explorer drops out of the bottom of the frame instead of swelling, and a
    // wider lens would only steepen the converging verticals: the close lens fades out.
    const close = (1 - smoothstep(CLOSE_BOOM[0], CLOSE_BOOM[1], this.lensDist)) * (1 - smoothstep(0.1, 0.4, this.pitch));
    const open = lerp(1, Math.tan(HFOV_CLOSE * 0.5 * DEG) / Math.tan(this.hfov * 0.5 * DEG), close);
    cam.fov = (2 * Math.atan(Math.tan(lockedVerticalFov(aspect, this.hfov, this.maxVfov) * 0.5 * DEG) * open)) / DEG;
    cam.aspect = aspect;
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld();
  }

  /** True when the lens at `d` metres along the boom from (ox, oy, oz) has a clear line to `p`. */
  private seesFrom(ox: number, oy: number, oz: number, d: number, p: THREE.Vector3): boolean {
    const dir = this.dir;
    return segmentClear(this.world, ox + dir.x * d, oy + dir.y * d, oz + dir.z * d, p.x, p.y, p.z);
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
