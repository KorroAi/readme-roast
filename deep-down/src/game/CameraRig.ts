import * as THREE from 'three';
import { clamp, damp, dampAngle } from '../core/math';
import type { VoxelWorld } from '../world/VoxelWorld';
import { raycastVoxels } from '../world/raycast';

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
  shoulder = 0.55;
  sensitivity = 1;
  invertY = false;
  shakeScale = 1;
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
    const shoulderX = right.x * this.shoulder;
    const shoulderZ = right.z * this.shoulder;

    // Collision: cast from the pivot (shifted to the shoulder) toward the desired position.
    const ox = this.pivot.x + shoulderX * 0.6;
    const oy = this.pivot.y;
    const oz = this.pivot.z + shoulderZ * 0.6;
    let allowed = this.maxDistance;
    const offsets = [0, 0.18, -0.18];
    for (const off of offsets) {
      for (const offY of [0, 0.15]) {
        const sx = ox + right.x * off;
        const sz = oz + right.z * off;
        const hit = raycastVoxels(this.world, sx, oy + offY, sz, this.dir.x, this.dir.y, this.dir.z, this.maxDistance + 0.4);
        if (hit) allowed = Math.min(allowed, hit.distance - 0.3);
      }
    }
    allowed = Math.max(0.35, allowed);
    // Pull in fast, ease out slowly.
    this.distance = allowed < this.distance ? damp(this.distance, allowed, 30, dt) : damp(this.distance, allowed, 3, dt);

    const shoulderFactor = clamp((this.distance - 0.6) / 2.5, 0, 1);
    const cam = this.camera;
    cam.position.set(
      ox + shoulderX * 0.4 * shoulderFactor + this.dir.x * this.distance,
      oy + this.dir.y * this.distance,
      oz + shoulderZ * 0.4 * shoulderFactor + this.dir.z * this.distance,
    );

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
