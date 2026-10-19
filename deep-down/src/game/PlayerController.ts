import { PLAYER } from '../config/balance';
import { RAMP, SOLID, rampPlane } from '../config/blocks';
import { damp, dampAngle } from '../core/math';

/** On a stair flight, how far (m) the box may overlap the top edge of a cube beside the feet. */
const STAIR_EDGE = 0.34;
import type { VoxelWorld } from '../world/VoxelWorld';

export interface PlayerFrameEvents {
  jumped: boolean;
  /** Downward speed at the moment of landing (0 if no landing this frame). */
  landedSpeed: number;
  /** Footsteps taken this frame (0 or 1), with the block under the feet. */
  footstep: boolean;
  footBlock: number;
  /** Player was rescued from an invalid position (stuck or outside the world). */
  rescued: boolean;
}

/**
 * Explorer movement: camera-relative walking, jumping with coyote time and buffering,
 * axis-separated AABB collision against voxels, automatic step-up onto 1-block ledges
 * (essential on touch screens), and a safety net that rescues the player if they ever
 * end up inside rock or outside the world.
 *
 * Stair flights (RAMP cells, config/blocks.ts) are walked as the plane of the flight under the
 * centre of the feet, not as 1 m voxel steps: a stair cell blocks only while the feet are below
 * that plane, walking up lifts the explorer onto it and walking down keeps the feet on it, so
 * the body glides along the 0.25 m risers of the stair mesh without hopping.
 */
export class PlayerController {
  /** Feet center position. */
  x = 0;
  y = 0;
  z = 0;
  vx = 0;
  vy = 0;
  vz = 0;
  grounded = false;
  /** Direction the body faces (radians); forward = (sin(yaw), 0, cos(yaw)). */
  yaw = 0;
  /** Visual-only vertical smoothing after auto-steps (subtract from y when rendering). */
  stepOffset = 0;
  /** Multiplier applied to walk speed (e.g. while mining). */
  speedFactor = 1;
  frozen = false;

  private coyote = 0;
  private jumpBuffer = 0;
  private stepDistance = 0;
  private safeX = 0;
  private safeY = 0;
  private safeZ = 0;
  private safeTimer = 0;
  private readonly hw = PLAYER.width / 2;
  /** Highest stair plane among the stair cells that blocked the last test() (see test()). */
  private rampTop = -Infinity;
  readonly events: PlayerFrameEvents = { jumped: false, landedSpeed: 0, footstep: false, footBlock: 0, rescued: false };

  constructor(private readonly world: VoxelWorld) {}

  teleport(x: number, y: number, z: number, yaw?: number): void {
    this.x = x;
    this.y = y;
    this.z = z;
    this.vx = this.vy = this.vz = 0;
    this.stepOffset = 0;
    if (yaw !== undefined) this.yaw = yaw;
    this.safeX = x;
    this.safeY = y;
    this.safeZ = z;
    this.grounded = false;
  }

  get speed(): number {
    return Math.hypot(this.vx, this.vz);
  }

  /** Face a world-space horizontal direction (e.g. toward a mining target). */
  faceToward(tx: number, tz: number, dt: number, rate = 14): void {
    const dx = tx - this.x;
    const dz = tz - this.z;
    if (dx * dx + dz * dz < 1e-4) return;
    this.yaw = dampAngle(this.yaw, Math.atan2(dx, dz), rate, dt);
  }

  /**
   * Advance one step.
   * @param moveX right intent [-1,1] relative to the camera
   * @param moveY forward intent [-1,1] relative to the camera
   * @param camYaw camera yaw; camera forward = (-sin(camYaw), 0, -cos(camYaw))
   * @param faceMovement rotate the body toward the movement direction
   */
  update(dt: number, moveX: number, moveY: number, jumpPressed: boolean, camYaw: number, faceMovement: boolean): PlayerFrameEvents {
    const ev = this.events;
    ev.jumped = false;
    ev.landedSpeed = 0;
    ev.footstep = false;
    ev.rescued = false;

    if (this.frozen) {
      this.vx = this.vz = 0;
      moveX = moveY = 0;
      jumpPressed = false;
    }

    // Camera-relative wish direction.
    const fx = -Math.sin(camYaw);
    const fz = -Math.cos(camYaw);
    const rx = Math.cos(camYaw);
    const rz = -Math.sin(camYaw);
    let wx = fx * moveY + rx * moveX;
    let wz = fz * moveY + rz * moveX;
    const wl = Math.hypot(wx, wz);
    if (wl > 1) {
      wx /= wl;
      wz /= wl;
    }
    const intent = Math.min(1, wl);
    const target = PLAYER.walkSpeed * this.speedFactor;
    const accel = PLAYER.accel * (this.grounded ? 1 : PLAYER.airControl);
    const tvx = wx * target;
    const tvz = wz * target;
    // Accelerate toward the target velocity (frame-rate independent, capped by accel).
    const dvx = tvx - this.vx;
    const dvz = tvz - this.vz;
    const dl = Math.hypot(dvx, dvz);
    const maxDv = accel * dt * (intent > 0.01 || this.grounded ? 1 : 0.2);
    if (dl > maxDv) {
      this.vx += (dvx / dl) * maxDv;
      this.vz += (dvz / dl) * maxDv;
    } else {
      this.vx = tvx;
      this.vz = tvz;
    }
    if (faceMovement && intent > 0.15) this.yaw = dampAngle(this.yaw, Math.atan2(wx, wz), 12, dt);

    // Jumping with coyote time and input buffering.
    this.coyote = this.grounded ? PLAYER.coyoteTime : Math.max(0, this.coyote - dt);
    this.jumpBuffer = jumpPressed ? PLAYER.jumpBuffer : Math.max(0, this.jumpBuffer - dt);
    if (this.jumpBuffer > 0 && this.coyote > 0) {
      this.vy = PLAYER.jumpVelocity;
      this.grounded = false;
      this.coyote = 0;
      this.jumpBuffer = 0;
      ev.jumped = true;
    }

    this.vy = Math.max(-PLAYER.maxFallSpeed, this.vy - PLAYER.gravity * dt);

    // Integrate with sub-steps so fast falls never tunnel through a block.
    const maxStep = 0.35;
    const travel = Math.max(Math.abs(this.vx), Math.abs(this.vy), Math.abs(this.vz)) * dt;
    const steps = Math.max(1, Math.ceil(travel / maxStep));
    const sdt = dt / steps;
    const wasGrounded = this.grounded;
    let landed = false;
    let landSpeed = 0;
    let groundedNow = false;
    for (let i = 0; i < steps; i++) {
      this.moveAxis(0, this.vx * sdt, wasGrounded || groundedNow);
      this.moveAxis(2, this.vz * sdt, wasGrounded || groundedNow);
      const fallSpeed = -this.vy;
      const hitGround = this.moveAxis(1, this.vy * sdt, false);
      if (hitGround) {
        if (this.vy < 0) {
          groundedNow = true;
          if (!wasGrounded && !landed) {
            landed = true;
            landSpeed = fallSpeed;
          }
        }
        this.vy = 0;
      }
    }
    // Walking down a stair flight: keep the feet on its plane instead of falling off every
    // step. A continuous descent needs no smoothing; a larger drop (stepping off a landing's
    // edge onto the flight) is eased like an auto-step.
    if (!groundedNow && wasGrounded && this.vy <= 0 && !ev.jumped) {
      const ry = this.rampBelow(this.x, this.y, this.z, 0.75);
      if (ry > -Infinity) {
        const drop = this.y - ry;
        if (drop > Math.hypot(this.vx, this.vz) * dt + 0.03) this.stepOffset -= drop;
        this.y = ry;
        this.vy = 0;
        groundedNow = true;
      }
    }
    // Floor within 5 cm below the feet: settle onto it. If we were airborne this is a landing,
    // so it must report the fall speed (otherwise fall damage would be skipped at random).
    if (!groundedNow && this.vy <= 0 && this.collides(this.x, this.y - 0.05, this.z)) {
      groundedNow = true;
      if (!wasGrounded && !landed) {
        landed = true;
        landSpeed = -this.vy;
      }
      const floorY = Math.floor(this.y - 0.05) + 1;
      if (floorY <= this.y + 1e-6 && !this.collides(this.x, floorY, this.z)) this.y = floorY;
      this.vy = 0;
    }
    this.grounded = groundedNow;
    if (landed) ev.landedSpeed = landSpeed;

    // Footsteps.
    if (this.grounded) {
      this.stepDistance += Math.hypot(this.vx, this.vz) * dt;
      if (this.stepDistance > 1.15) {
        this.stepDistance = 0;
        ev.footstep = true;
        ev.footBlock = this.world.get(Math.floor(this.x), Math.floor(this.y - 0.1), Math.floor(this.z));
      }
    }

    this.stepOffset = damp(this.stepOffset, 0, 16, dt);
    this.safety(dt);
    return ev;
  }

  /** True if the player box at feet position (x,y,z) overlaps a solid voxel. */
  collides(x: number, y: number, z: number): boolean {
    return this.test(x, y, z) !== 0;
  }

  /**
   * Overlap of the player box at feet position (x,y,z): 0 = free, 1 = a solid cube, 2 = only stair
   * cells whose plane (at the centre of the feet) is above the feet; the highest such plane is
   * left in `rampTop`.
   */
  private test(x: number, y: number, z: number): number {
    const hw = this.hw;
    const x0 = Math.floor(x - hw);
    const x1 = Math.floor(x + hw);
    const y0 = Math.floor(y);
    const y1 = Math.floor(y + PLAYER.height);
    const z0 = Math.floor(z - hw);
    const z1 = Math.floor(z + hw);
    // Feet over a stair flight: the box may overlap the edge of a landing (or of any cube) by up to
    // a third of a metre at its bottom, as the centre of the feet goes on down the flight's plane;
    // a flat-bottomed box would otherwise hang on the landing's edge and drop at once.
    const cx = Math.floor(x);
    const cz = Math.floor(z);
    let flight = -Infinity;
    for (let cy = Math.floor(y - 1e-4); cy >= Math.floor(y - 1e-4) - 1; cy--) {
      const rc = RAMP[this.world.get(cx, cy, cz)];
      if (!rc) continue;
      const pc = rampPlane(rc, cx, cy, cz, x, z);
      if (Math.abs(pc - y) < 0.5) flight = pc;
      break;
    }
    let hit = 0;
    let top = -Infinity;
    for (let yy = y0; yy <= y1; yy++)
      for (let zz = z0; zz <= z1; zz++)
        for (let xx = x0; xx <= x1; xx++) {
          const id = this.world.get(xx, yy, zz);
          if (!SOLID[id]) continue;
          const r = RAMP[id];
          if (!r) {
            if (yy + 1 <= flight + STAIR_EDGE && (xx !== cx || zz !== cz)) continue;
            this.rampTop = -Infinity;
            return 1;
          }
          const p = rampPlane(r, xx, yy, zz, x, z);
          if (y < p - 1e-5) {
            hit = 2;
            if (p > top) top = p;
          }
        }
    this.rampTop = top;
    return hit;
  }

  /**
   * Highest stair plane under the centre of the feet within `maxDrop` below them (-Infinity if
   * none), where the box fits.
   */
  private rampBelow(x: number, y: number, z: number, maxDrop: number): number {
    const cx = Math.floor(x);
    const cz = Math.floor(z);
    for (let cy = Math.floor(y); cy >= Math.floor(y - maxDrop) - 1; cy--) {
      const id = this.world.get(cx, cy, cz);
      if (!SOLID[id]) continue;
      const r = RAMP[id];
      // A floor comes first: ordinary falling and settling handle it, except the last few cm off
      // the foot of a flight onto its landing.
      if (!r) return y - (cy + 1) >= 0 && y - (cy + 1) <= 0.2 && this.test(x, cy + 1, z) === 0 ? cy + 1 : -Infinity;
      const p = rampPlane(r, cx, cy, cz, x, z);
      if (p > y + 1e-6 || p < y - maxDrop) return -Infinity;
      return this.test(x, p, z) === 0 ? p : -Infinity;
    }
    return -Infinity;
  }

  /** Move along one axis; returns true if blocked. Horizontal moves may auto-step up. */
  private moveAxis(axis: 0 | 1 | 2, d: number, canStep: boolean): boolean {
    if (d === 0) return false;
    const nx = axis === 0 ? this.x + d : this.x;
    const ny = axis === 1 ? this.y + d : this.y;
    const nz = axis === 2 ? this.z + d : this.z;
    const hit = this.test(nx, ny, nz);
    if (hit === 0) {
      this.x = nx;
      this.y = ny;
      this.z = nz;
      return false;
    }
    // Up a stair flight: onto its plane, continuously (no step smoothing needed).
    if (hit === 2 && axis !== 1 && canStep && this.vy <= 0.5) {
      const ry = this.rampTop;
      if (ry - this.y <= PLAYER.stepHeight && this.test(nx, ry, nz) === 0) {
        this.x = nx;
        this.z = nz;
        this.y = ry;
        this.vy = Math.max(0, this.vy);
        return false;
      }
    }
    // Falling onto a stair flight: land on its plane.
    if (hit === 2 && axis === 1 && d < 0) {
      const ry = this.rampTop;
      if (ry <= this.y + 1e-6 && ry >= ny && this.test(this.x, ry, this.z) === 0) this.y = ry;
      return true;
    }
    // Auto step-up onto a ledge at most PLAYER.stepHeight high.
    if (axis !== 1 && canStep && this.vy <= 0.5) {
      const stepY = Math.floor(this.y + 1e-3) + 1;
      const lift = stepY - this.y;
      if (lift > 0 && lift <= PLAYER.stepHeight && !this.collides(this.x, stepY, this.z) && !this.collides(nx, stepY, nz)) {
        this.x = nx;
        this.z = nz;
        this.y = stepY;
        this.stepOffset += lift;
        this.vy = Math.max(0, this.vy);
        return false;
      }
    }
    // Snap flush against the obstacle.
    const eps = 1e-4;
    if (axis === 0) {
      const snapped = d > 0 ? Math.floor(nx + this.hw) - this.hw - eps : Math.floor(nx - this.hw) + 1 + this.hw + eps;
      if (!this.collides(snapped, this.y, this.z) && Math.abs(snapped - this.x) <= Math.abs(d) + eps) this.x = snapped;
      this.vx = 0;
    } else if (axis === 2) {
      const snapped = d > 0 ? Math.floor(nz + this.hw) - this.hw - eps : Math.floor(nz - this.hw) + 1 + this.hw + eps;
      if (!this.collides(this.x, this.y, snapped) && Math.abs(snapped - this.z) <= Math.abs(d) + eps) this.z = snapped;
      this.vz = 0;
    } else {
      const snapped = d > 0 ? Math.floor(ny + PLAYER.height) - PLAYER.height - eps : Math.floor(ny) + 1;
      if (!this.collides(this.x, snapped, this.z) && Math.abs(snapped - this.y) <= Math.abs(d) + eps) this.y = snapped;
    }
    return true;
  }

  /** Rescue from invalid states: NaN, below the world, or embedded in rock. */
  private safety(dt: number): void {
    const w = this.world;
    const invalid = !Number.isFinite(this.x + this.y + this.z) || this.y < 1 || this.x < 0.5 || this.z < 0.5 || this.x > w.sx - 0.5 || this.z > w.sz - 0.5 || this.y > w.sy - 1;
    if (invalid) {
      this.teleport(this.safeX, this.safeY, this.safeZ);
      this.events.rescued = true;
      return;
    }
    if (this.collides(this.x, this.y, this.z)) {
      // Embedded (e.g. a block appeared): push up to 3 blocks, else return to the last safe spot.
      for (let k = 1; k <= 3; k++) {
        if (!this.collides(this.x, Math.floor(this.y) + k, this.z)) {
          this.y = Math.floor(this.y) + k;
          this.vy = 0;
          return;
        }
      }
      this.teleport(this.safeX, this.safeY, this.safeZ);
      this.events.rescued = true;
      return;
    }
    this.safeTimer -= dt;
    if (this.grounded && this.safeTimer <= 0) {
      this.safeTimer = 0.5;
      this.safeX = this.x;
      this.safeY = this.y;
      this.safeZ = this.z;
    }
  }

  /** Last known safe standing position (used for respawn fallbacks and tests). */
  get safePosition(): [number, number, number] {
    return [this.safeX, this.safeY, this.safeZ];
  }
}
