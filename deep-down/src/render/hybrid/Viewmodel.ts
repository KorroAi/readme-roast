// The first-person viewmodel (SPEC §3.7): the lantern lower left and the tool lower right, drawn in their own pass with
// their own camera (vertical FOV 58°, depth cleared) after the world and before the HUD. Perfectly still at rest and in
// glides; a strike shows the contact pose on frame 0 (no wind-up), solved so the head lands toward the tapped point with
// a ≤ 0.1 m lunge, then recovers over 220 ms. Mirrored for the left hand.
//
// CONTRACT (W1, 1C): the API below is stable; the body grows.

import * as THREE from 'three';
import type { Rect, Vec3 } from './types';
import { DEFAULT_VIEWMODEL, type ViewmodelState } from './viewmodelState';

export const VIEWMODEL_VFOV = 58;

export class Viewmodel {
  /** The viewmodel's own scene and camera (DepthScene draws them after the world). */
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(VIEWMODEL_VFOV, 390 / 844, 0.02, 4);
  readonly state: ViewmodelState = { ...DEFAULT_VIEWMODEL };
  /** Seconds since the last strike (≥ 0.22 = at rest). */
  protected sinceStrike = 1e9;
  protected sinceRaise = 1e9;

  /** Set any of the state fields (form, temper, heat, mirror, lanternLevel). */
  set(patch: Partial<ViewmodelState>): void {
    Object.assign(this.state, patch);
  }

  /**
   * A strike lands now: the contact pose aims the tool head toward `contact` (world point; null = straight ahead).
   * `worldCamera` is the world camera of this frame (to bring the point into the viewmodel's space).
   */
  strike(contact: Vec3 | null, worldCamera: THREE.Camera, crit = false): void {
    void contact;
    void worldCamera;
    void crit;
    this.sinceStrike = 0;
  }

  /** Lantern Raise toward a world point (SPEC §2.2): lifts in 0.2 s, holds 1.4 s, eases back. */
  raise(point: Vec3, worldCamera: THREE.Camera): void {
    void point;
    void worldCamera;
    this.sinceRaise = 0;
  }

  /** Advance the strike recovery and the raise (FX clock seconds). */
  update(dt: number): void {
    this.sinceStrike += dt;
    this.sinceRaise += dt;
  }

  /** True while the tool is moving (an FX group for the budget). */
  get moving(): boolean {
    return this.sinceStrike < 0.22 || this.sinceRaise < 2.0;
  }

  /** The lantern's and the tool's screen bounds (CSS px) for a viewport (the Pulse's deliberate gesture, C8, E19). */
  bounds(width: number, height: number): { lantern: Rect; tool: Rect } {
    const lw = 0.26 * width;
    const lh = 0.17 * height;
    const left: Rect = { x: 0.02 * width, y: 0.74 * height, w: lw, h: lh };
    const right: Rect = { x: width - 0.02 * width - lw, y: 0.74 * height, w: lw, h: lh };
    return this.state.mirror ? { lantern: right, tool: left } : { lantern: left, tool: right };
  }

  /** Where the lantern flame is in world space this frame (the key light). */
  flameWorld(worldCamera: THREE.Camera, out: THREE.Vector3): THREE.Vector3 {
    const x = this.state.mirror ? 0.3 : -0.3;
    return out.set(x, -0.45, -0.35).applyMatrix4(worldCamera.matrixWorld);
  }

  dispose(): void {}
}
