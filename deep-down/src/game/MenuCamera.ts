import type * as THREE from 'three';
import { lockedVerticalFov } from './CameraRig';
import type { VoxelWorld } from '../world/VoxelWorld';
import { raycastVoxels } from '../world/raycast';

/**
 * The title screen's camera and the explorer's pose behind it.
 *
 * The camera drifts slowly just past the ledge rim: pillars, the Glimmerfall, the stairs and the
 * sealed gate below. Its lens matches the gameplay lens (a locked horizontal field of view), so
 * a wide phone sees the same width of the Hollow as in play instead of a stretched 112 degrees.
 * The explorer waits on the very lip of the ledge with the lantern lit. While the menu shows,
 * the frame loop runs at MENU_FPS to spare the battery.
 */

/** Horizontal field of view of the menu lens, degrees (gameplay uses 90). */
export const MENU_HFOV = 94;
/** Frame cap while the title screen is up. */
export const MENU_FPS = 30;
/** Explorer heading on the ledge: body forward is (sin(yaw), cos(yaw)), looking across the chamber. */
export const MENU_EXPLORER_YAW = 0.98;

export interface MenuPose {
  x: number;
  y: number;
  z: number;
  /** Euler angles, order YXZ. */
  pitch: number;
  yaw: number;
}

/** The camera pose `t` seconds into the menu, around the ledge landmark. */
export function menuPose(t: number, ledge: readonly [number, number, number], out: MenuPose = { x: 0, y: 0, z: 0, pitch: 0, yaw: 0 }): MenuPose {
  out.x = ledge[0] + 5 + Math.sin(t * 0.05) * 1.2;
  out.y = ledge[1] + 3.5 + Math.sin(t * 0.08) * 0.4;
  out.z = ledge[2] + 6 + Math.cos(t * 0.05) * 1.2;
  out.pitch = -0.5 + Math.sin(t * 0.06) * 0.04;
  out.yaw = -2.2 + Math.sin(t * 0.045) * 0.16;
  return out;
}

/** Vertical field of view (degrees) of the menu lens on a screen of `aspect` (width / height). */
export function menuFov(aspect: number): number {
  return lockedVerticalFov(aspect, MENU_HFOV);
}

/** Walk out from the ledge landmark to its very edge, facing MENU_EXPLORER_YAW: the explorer's title pose. */
export function menuExplorerPose(world: Pick<VoxelWorld, 'isSolid'>, ledge: readonly [number, number, number]): { x: number; y: number; z: number; yaw: number } {
  const yaw = MENU_EXPLORER_YAW;
  let ex = ledge[0] + 0.5;
  let ez = ledge[2] + 0.5;
  for (let i = 0; i < 40; i++) {
    const nx = ex + Math.sin(yaw) * 0.25;
    const nz = ez + Math.cos(yaw) * 0.25;
    if (!world.isSolid(Math.floor(nx + Math.sin(yaw) * 0.9), Math.floor(ledge[1]) - 1, Math.floor(nz + Math.cos(yaw) * 0.9))) break;
    ex = nx;
    ez = nz;
  }
  return { x: ex, y: ledge[1], z: ez, yaw };
}

/**
 * Round 3: the title shot over a live stratum (the camp's hall of stratum I): where the camera
 * stands and what it looks at, found from the voxels round a centre (the camp fire). The hall's
 * longest open line of sight is the view; the camera backs up against the far side with room to
 * spare and looks across the fire down that line.
 */
export interface MenuShot {
  /** Camera position. */
  x: number;
  y: number;
  z: number;
  /** The base view (radians; forward = (-sin yaw, -cos yaw)) and the side vector for the drift. */
  yaw: number;
  pitch: number;
  /** How far (m) the camera may sway to each side and bob. */
  sway: number;
  /** Where the explorer (the menu's lantern) waits: on the floor just ahead of the camera. */
  explorer: { x: number; y: number; z: number; yaw: number };
}

/** Find the title shot round `centre` (feet level of the hall). Pure over the voxels (unit-tested). */
export function findMenuShot(world: Pick<VoxelWorld, 'get' | 'isSolid'> & VoxelWorld, centre: readonly [number, number, number]): MenuShot {
  const ox = centre[0] + 0.5;
  const oy = centre[1] + 2.2;
  const oz = centre[2] + 0.5;
  const N = 32;
  const reach = new Array<number>(N);
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2;
    const hit = raycastVoxels(world, ox, oy, oz, Math.sin(a), 0, Math.cos(a), 48);
    reach[i] = hit ? hit.distance : 48;
  }
  // The longest view, smoothed over its neighbours (a corridor beats a crack).
  let best = 0;
  let bestV = -1;
  for (let i = 0; i < N; i++) {
    const v = reach[i] * 0.5 + (reach[(i + 1) % N] + reach[(i + N - 1) % N]) * 0.25;
    if (v > bestV) {
      bestV = v;
      best = i;
    }
  }
  const a = (best / N) * Math.PI * 2;
  const dx = Math.sin(a);
  const dz = Math.cos(a);
  // Back up behind the centre (away from the view), keeping 1.6 m from the wall there.
  const behind = reach[(best + N / 2) % N];
  const back = Math.max(0, Math.min(7, behind - 1.6));
  // Raise the eye a little if the hall allows (at most 2.4 m over the base height).
  let lift = 0;
  for (let k = 1; k <= 3; k++) if (!world.isSolid(Math.floor(ox - dx * back), Math.floor(oy + k * 0.8), Math.floor(oz - dz * back))) lift = k * 0.8;
  const x = ox - dx * back;
  const z = oz - dz * back;
  const y = oy + Math.min(2.4, lift);
  // Look along the line, a little down (about 8 degrees over a 16 m view): the hall's depth fills the
  // frame behind the title and the fire, a few metres ahead and below, sits low in the frame (under
  // an upright phone's buttons) instead of the floor filling it.
  const far = Math.min(reach[best], 30);
  const tx = ox + dx * far * 0.55;
  const tz = oz + dz * far * 0.55;
  const ty = centre[1] + 2.4;
  const yaw = Math.atan2(-(tx - x), -(tz - z));
  const pitch = Math.max(-0.3, Math.min(0.05, Math.atan2(ty - y, Math.hypot(tx - x, tz - z))));
  // Side room for the drift.
  const sx = Math.cos(a);
  const sz = -Math.sin(a);
  const l = raycastVoxels(world, x, y, z, sx, 0, sz, 4)?.distance ?? 4;
  const r = raycastVoxels(world, x, y, z, -sx, 0, -sz, 4)?.distance ?? 4;
  const sway = Math.max(0.2, Math.min(1.4, Math.min(l, r) - 0.8));
  // The explorer stands on the floor a step ahead of the camera, facing the view.
  return { x, y, z, yaw, pitch, sway, explorer: { x: x + dx * 1.2, y: centre[1], z: z + dz * 1.2, yaw: a } };
}

/** The camera pose `t` seconds into the title over a stratum: a slow sway, a bob and a glance. */
export function shotPose(t: number, s: MenuShot, out: MenuPose = { x: 0, y: 0, z: 0, pitch: 0, yaw: 0 }): MenuPose {
  const sx = -Math.cos(s.yaw);
  const sz = Math.sin(s.yaw);
  const k = Math.sin(t * 0.07);
  out.x = s.x + sx * s.sway * k;
  out.z = s.z + sz * s.sway * k;
  out.y = s.y + Math.sin(t * 0.11) * 0.18;
  out.yaw = s.yaw - k * 0.09 + Math.sin(t * 0.031) * 0.05;
  out.pitch = s.pitch + Math.sin(t * 0.05) * 0.03;
  return out;
}

/** Drives a camera with the menu pose. */
export class MenuCamera {
  private t = 0;
  private readonly pose: MenuPose = { x: 0, y: 0, z: 0, pitch: 0, yaw: 0 };
  /** Round 3: the shot over a stratum (null: the first version's ledge drift). */
  shot: MenuShot | null = null;

  constructor(private readonly ledge: readonly [number, number, number]) {}

  get time(): number {
    return this.t;
  }

  reset(): void {
    this.t = 0;
  }

  update(dt: number, cam: THREE.PerspectiveCamera, aspect: number): void {
    this.t += dt;
    const p = this.shot ? shotPose(this.t, this.shot, this.pose) : menuPose(this.t, this.ledge, this.pose);
    cam.position.set(p.x, p.y, p.z);
    cam.rotation.order = 'YXZ';
    cam.rotation.set(p.pitch, p.yaw, 0);
    cam.fov = menuFov(aspect);
    cam.aspect = aspect;
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld();
  }
}
