import type * as THREE from 'three';
import { lockedVerticalFov } from './CameraRig';
import type { VoxelWorld } from '../world/VoxelWorld';

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

/** Drives a camera with the menu pose. */
export class MenuCamera {
  private t = 0;
  private readonly pose: MenuPose = { x: 0, y: 0, z: 0, pitch: 0, yaw: 0 };

  constructor(private readonly ledge: readonly [number, number, number]) {}

  get time(): number {
    return this.t;
  }

  reset(): void {
    this.t = 0;
  }

  update(dt: number, cam: THREE.PerspectiveCamera, aspect: number): void {
    this.t += dt;
    const p = menuPose(this.t, this.ledge, this.pose);
    cam.position.set(p.x, p.y, p.z);
    cam.rotation.order = 'YXZ';
    cam.rotation.set(p.pitch, p.yaw, 0);
    cam.fov = menuFov(aspect);
    cam.aspect = aspect;
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld();
  }
}
