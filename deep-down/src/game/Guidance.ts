import { angleDelta } from '../core/math';

/**
 * Compass helpers. The HUD compass follows the walk-home field (world/analysis/homeField, via
 * game/Progression): it aims a few steps down the field's steepest descent and shows walking
 * metres. bearing() turns that aim point into the needle angle. next() is the older breadcrumb
 * guide along a marked polyline (path[0] is the camp end), kept for tools and tests.
 */
export class Guidance {
  constructor(private readonly path: ReadonlyArray<readonly [number, number, number]>) {}

  /** Target point toward camp for a player at (x,y,z). path[0] is the camp end. */
  next(x: number, y: number, z: number): readonly [number, number, number] {
    const p = this.path;
    let best = 0;
    let bestD = Infinity;
    for (let i = 0; i < p.length; i++) {
      const d = (p[i][0] - x) ** 2 + ((p[i][1] - y) * 1.5) ** 2 + (p[i][2] - z) ** 2;
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    // Aim one step closer to camp once we are near the nearest point.
    if (best > 0 && bestD < 16) return p[best - 1];
    return p[best];
  }

  /**
   * Bearing of a world point relative to the camera, radians: 0 = ahead, + = right.
   * Camera forward = (-sin(yaw), 0, -cos(yaw)).
   */
  static bearing(camYaw: number, fromX: number, fromZ: number, toX: number, toZ: number): number {
    const forward = Math.atan2(-Math.sin(camYaw), -Math.cos(camYaw));
    const target = Math.atan2(toX - fromX, toZ - fromZ);
    return -angleDelta(forward, target);
  }
}
