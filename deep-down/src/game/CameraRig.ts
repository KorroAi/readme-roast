import * as THREE from 'three';
import { clamp, damp, dampAngle } from '../core/math';
import type { VoxelWorld } from '../world/VoxelWorld';
import { raycastVoxels } from '../world/raycast';
import { segmentClear } from '../world/light';

/**
 * Third-person over-the-shoulder camera with voxel collision.
 *
 * Yaw/pitch come from look input. The camera sits behind and slightly right of a pivot at
 * the explorer's upper chest, and is pulled in (quickly) when rock is in the way and eases
 * back out (slowly) when space opens up, so tight tunnels never put rock between the
 * camera and the explorer.
 */
export class CameraRig {
  readonly camera: THREE.PerspectiveCamera;
  yaw = 0;
  pitch = -0.18;
  /** Smoothed current boom length. */
  distance = 3.8;
  maxDistance = 3.8;
  shoulder = 0.7;
  sensitivity = 1;
  invertY = false;
  shakeScale = 1;
  /** Shoulder side, smoothed: +1 right, -1 left (switches when the right side is walled in). */
  private side = 1;
  private trauma = 0;
  private shakeTime = 0;
  private readonly pivot = new THREE.Vector3();
  private readonly pivotTarget = new THREE.Vector3();
  private initialized = false;
  private readonly tmp = new THREE.Vector3();
  private readonly dir = new THREE.Vector3();

  constructor(private readonly world: VoxelWorld, fov = 62) {
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

    const cy = Math.cos(this.pitch);
    // Backward vector (camera looks along -back).
    this.dir.set(Math.sin(this.yaw) * cy, -Math.sin(this.pitch), Math.cos(this.yaw) * cy);
    const right = this.tmp.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));

    // 1) Shoulder offset, shortened if a wall is right beside the explorer. When the right side
    //    is walled in and the left is open, swap shoulders so the explorer never sits on the
    //    crosshair in a narrow tunnel.
    const reach = this.shoulder + 0.3;
    const hitR = raycastVoxels(this.world, this.pivot.x, this.pivot.y, this.pivot.z, right.x, 0, right.z, reach);
    const hitL = raycastVoxels(this.world, this.pivot.x, this.pivot.y, this.pivot.z, -right.x, 0, -right.z, reach);
    const roomR = hitR ? Math.max(0, hitR.distance - 0.3) : this.shoulder;
    const roomL = hitL ? Math.max(0, hitL.distance - 0.3) : this.shoulder;
    // Hysteresis: once on the left, return only when the right is clearly open again.
    const want = this.side < 0
      ? roomR >= this.shoulder * 0.9 || roomR > roomL + 0.2 ? 1 : -1
      : roomR >= this.shoulder * 0.5 || roomR >= roomL ? 1 : -1;
    this.side = damp(this.side, want, 5, dt);
    const lateral = this.side >= 0 ? Math.min(this.shoulder * this.side, roomR) : -Math.min(-this.shoulder * this.side, roomL);
    const ox = this.pivot.x + right.x * lateral;
    const oy = this.pivot.y;
    const oz = this.pivot.z + right.z * lateral;

    // 2) Boom: cast a small bundle of rays back from the (open) shoulder point.
    let allowed = this.maxDistance;
    for (const off of [0, 0.2, -0.2]) {
      for (const offY of [0, 0.18, -0.12]) {
        const hit = raycastVoxels(this.world, ox + right.x * off, oy + offY, oz + right.z * off, this.dir.x, this.dir.y, this.dir.z, this.maxDistance + 0.4);
        if (hit) allowed = Math.min(allowed, hit.distance - 0.3);
      }
    }
    allowed = Math.max(0, allowed);
    // Snap in at once (never let rock come between camera and explorer); ease back out slowly.
    this.distance = allowed < this.distance ? allowed : damp(this.distance, allowed, 3, dt);

    const cam = this.camera;
    cam.position.set(ox + this.dir.x * this.distance, oy + this.dir.y * this.distance, oz + this.dir.z * this.distance);
    // 3) Last guard: pull in while the lens is inside rock (a ray grazed a corner) or rock hides
    //    the explorer (the straight pivot-to-lens line is not one of the rays). At distance 0 the
    //    lens is the shoulder point, whose line from the pivot was ray-checked in step 1.
    const p = this.pivot;
    for (
      let i = 0;
      i < 26 && this.distance > 0 && (this.world.isSolidAt(cam.position.x, cam.position.y, cam.position.z) || !segmentClear(this.world, p.x, p.y, p.z, cam.position.x, cam.position.y, cam.position.z));
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
    cam.aspect = aspect;
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld();
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
