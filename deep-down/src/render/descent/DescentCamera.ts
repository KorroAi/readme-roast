import * as THREE from 'three';

/**
 * The portrait camera of the descent (SPEC §6.3): pure math, unit-tested (tests/unit/idle/descentCamera.test.ts).
 *
 * The cut plane (the drawn geological section) is the storage plane z = CUT_Z = 60; the voxels z 60..63 in front
 * of it are the light apron (4 voxels of permanent air, CRITIQUE B1), and the rock and caverns lie behind it at
 * z < 60 (SPEC's "z behind the cut" s maps to storage voxel CUT_Z - 1 - s). The camera looks straight down -z
 * (pitch 0, three.js's own orientation, so +x is screen right) from CAM_DIST in front of the cut, with an
 * off-axis vertical shift so the floor's front edge sits at 52 % of
 * the world region. The visible width at the cut is locked so 1 m = 44 CSS px from 360 to 422 px wide, so the
 * 7 dig cells are 44 px wide on every phone and verticals stay parallel.
 *
 * Springs are integrated in closed form (no per-frame allocation, frame-rate independent). Shake and the tap
 * kick move the frustum window only (screen space): light, picking and `columns()` use the rest pose.
 */

/** CSS px per metre at the cut plane (the width lock target). */
export const PX_PER_M = 44;
/** The visible width at the cut is clamp(cssWidth / 44, 8.2, 9.6) m. */
export const MIN_VIEW_W = 8.2;
export const MAX_VIEW_W = 9.6;
/** Camera distance in front of the cut plane, metres. */
export const CAM_DIST = 12.6;
/** Eye height above the floor row's top edge, metres. */
export const EYE_ABOVE_FLOOR = 3.0;
/** The floor's front edge sits at this fraction of the world region (from its top). */
export const FLOOR_FRACTION = 0.52;
/** With a sheet open, the floor sits at this fraction of the strip still visible above it. */
export const SHEET_FLOOR_FRACTION = 0.6;
/** A sheet's top edge, as a fraction of the screen height (SPEC §9.4). */
export const SHEET_TOP_FRACTION = 0.42;
/** Storage z of the cut plane: section faces lie on z = CUT_Z facing +z; voxels z >= CUT_Z are the apron (air). */
export const CUT_Z = 60;
/** Storage voxel z of SPEC's depth s behind the cut (s = 0 is a cell's front voxel; the back wall is s = 3). */
export const behindCut = (s: number): number => CUT_Z - 1 - s;
/** The shaft: 7 cells of 1 m at storage x 28..34. */
export const SHAFT_X0 = 28;
export const SHAFT_COLS = 7;
export const SHAFT_CX = SHAFT_X0 + SHAFT_COLS / 2;
export const NEAR = 2;
export const FAR = 420;

/** Springs of SPEC §10.4 used by the camera. */
export const SPRINGS = {
  follow: { omega: 9, zeta: 0.7 },
  kick: { omega: 40, zeta: 0.45 },
  soft: { omega: 16, zeta: 0.85 },
} as const;

/** Tap kick impulse (m/s) toward the tapped cell; a crit doubles it. Offsets are capped at 6 px. */
export const KICK_IMPULSE = 2.9;
export const KICK_CAP_PX = 6;
/** Trauma: offset 0.40 m T², roll 1.2° T², 22 Hz noise, linear decay 1.6 / s. */
export const SHAKE_OFFSET_M = 0.4;
export const SHAKE_ROLL_DEG = 1.2;
export const SHAKE_HZ = 22;
export const TRAUMA_DECAY = 1.6;
/** Life: a slow yaw sway and bob keep the parallax of deep caverns alive. */
export const SWAY_DEG = 0.6;
export const SWAY_PERIOD = 23;
export const BOB_M = 0.12;
export const BOB_PERIOD = 9;
/** Reduced motion: the follow becomes outCubic over this long, with no overshoot. */
export const REDUCED_FOLLOW_S = 0.22;
/** Surface and menu: the eye 6 m above the ground, the shaft mouth at 62 % of the screen height. */
export const MENU_EYE = 6;
export const MENU_MOUTH_FRACTION = 0.62;

/** A damped spring toward `target`, stepped exactly for an underdamped oscillator (ζ < 1). */
export class Spring {
  x: number;
  v = 0;
  target: number;
  constructor(value = 0, readonly omega = 9, readonly zeta = 0.7) {
    this.x = value;
    this.target = value;
  }
  /** Jump to a value at rest. */
  snap(value: number): void {
    this.x = value;
    this.target = value;
    this.v = 0;
  }
  step(dt: number): void {
    if (dt <= 0) return;
    const w = this.omega;
    const z = this.zeta;
    const x0 = this.x - this.target;
    const v0 = this.v;
    if (Math.abs(x0) < 1e-9 && Math.abs(v0) < 1e-9) {
      this.x = this.target;
      this.v = 0;
      return;
    }
    const wd = w * Math.sqrt(1 - z * z);
    const e = Math.exp(-z * w * dt);
    const c = Math.cos(wd * dt);
    const s = Math.sin(wd * dt);
    const a = x0;
    const b = (v0 + z * w * x0) / wd;
    this.x = this.target + e * (a * c + b * s);
    this.v = e * ((b * wd - z * w * a) * c - (a * wd + z * w * b) * s);
  }
}

export interface CameraLayout {
  /** Viewport in CSS px (the world canvas is full-bleed). */
  width: number;
  height: number;
  /** The world region (taps dig there): from the goal bar's bottom + 4 px to the skill row's top. */
  regionTop: number;
  regionBottom: number;
}

export interface CameraMotion {
  /** Reduced motion (or Motion Off): no kick, no shake, no life; the follow is outCubic 220 ms. */
  reduced: boolean;
  /** The yaw sway and bob (off on Battery and in Reduced). */
  life: boolean;
  /** The Camera Shake setting, 0..1. */
  shake: number;
}

/** Default world region for a viewport (SPEC §9.2), used until the HUD reports its layout. */
export function defaultLayout(width: number, height: number): CameraLayout {
  // Interpolated over the three reference viewports: 360x740 (138-540), 390x844 (173-610), 412x915 (166-691).
  if (height <= 740) return { width, height, regionTop: 138 * (height / 740), regionBottom: 540 * (height / 740) };
  if (height <= 844) {
    const t = (height - 740) / 104;
    return { width, height, regionTop: 138 + t * 35, regionBottom: 540 + t * 70 };
  }
  return { width, height, regionTop: 166, regionBottom: height - (915 - 691) };
}

/** Visible width at the cut plane (m) for a viewport width (CSS px). */
export function viewWidth(cssWidth: number): number {
  return Math.min(MAX_VIEW_W, Math.max(MIN_VIEW_W, cssWidth / PX_PER_M));
}

/** Gradient noise in [-1, 1] (1D, smooth), for the shake. */
function noise1(t: number, seed: number): number {
  const i = Math.floor(t);
  const f = t - i;
  const g = (k: number) => {
    let h = Math.imul(k ^ seed, 0x27d4eb2d) ^ 0x165667b1;
    h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
    h ^= h >>> 13;
    return ((h >>> 0) / 4294967295) * 2 - 1;
  };
  const u = f * f * (3 - 2 * f);
  return (g(i) * f) * (1 - u) + g(i + 1) * (f - 1) * u;
}

export interface ColumnStripsPx {
  left: number;
  right: number;
  floorY: number;
}

/**
 * The descent camera rig. Drive it with `setFloor(depth)` when the floor row changes, `kick()` on taps,
 * `addTrauma()` from the juice, `setSheet()` when a sheet opens, then `update(dt)` and `apply(camera)`
 * once per frame.
 */
export class DescentCamera {
  layout: CameraLayout;
  motion: CameraMotion = { reduced: false, life: true, shake: 1 };
  /** The floor row being followed (metres; the floor's top edge is at world y = -depth). */
  private depth = 0;
  /** The followed floor's world y (the follow spring; the eye is EYE_ABOVE_FLOOR above it). */
  private readonly follow = new Spring(0, SPRINGS.follow.omega, SPRINGS.follow.zeta);
  /** Reduced motion: an outCubic tween instead of the spring. */
  private tweenFrom = 0;
  private tweenT = 1;
  private readonly kickX = new Spring(0, SPRINGS.kick.omega, SPRINGS.kick.zeta);
  private readonly kickY = new Spring(0, SPRINGS.kick.omega, SPRINGS.kick.zeta);
  private readonly sheet = new Spring(0, SPRINGS.soft.omega, SPRINGS.soft.zeta);
  private readonly menu = new Spring(0, SPRINGS.soft.omega, SPRINGS.soft.zeta);
  private trauma = 0;
  private time = 0;
  /** Shake now (screen-space metres at the cut, and roll radians). */
  private shakeX = 0;
  private shakeY = 0;
  private roll = 0;
  private yaw = 0;
  private bob = 0;
  private readonly tmp = new THREE.Vector3();
  private readonly rest = new THREE.PerspectiveCamera();
  private restDirty = true;

  constructor(layout: CameraLayout) {
    this.layout = { ...layout };
    this.rest.matrixAutoUpdate = false;
  }

  setLayout(layout: CameraLayout): void {
    this.layout = { ...layout };
    this.restDirty = true;
  }

  /** The floor row changed (a row cleared, a jump). `snap` places the camera at rest at once. */
  setFloor(depth: number, snap = false): void {
    if (depth === this.depth && !snap) return;
    this.depth = depth;
    const y = -depth;
    if (snap) {
      this.follow.snap(y);
      this.tweenT = 1;
    } else if (this.motion.reduced) {
      this.tweenFrom = this.follow.x;
      this.tweenT = 0;
      this.follow.target = y;
    } else this.follow.target = y;
    this.restDirty = true;
  }

  get floorDepth(): number {
    return this.depth;
  }

  /** The followed floor's world y right now (the spring's value). */
  get followY(): number {
    return this.follow.x;
  }

  /**
   * A tap kick: the image jolts along screen direction (dx, dy) (CSS px, y down; any length, normalised),
   * peaking at 2 px about 31 ms later; `crit` doubles the impulse. Taps never add trauma.
   */
  kick(dx: number, dy: number, crit = false): void {
    if (this.motion.reduced) return;
    const l = Math.hypot(dx, dy) || 1;
    const v = KICK_IMPULSE * (crit ? 2 : 1);
    this.kickX.v += (dx / l) * v;
    this.kickY.v -= (dy / l) * v;
  }

  /** Add trauma (0..1; it saturates at 1). */
  addTrauma(t: number): void {
    if (this.motion.reduced) return;
    this.trauma = Math.min(1, this.trauma + Math.max(0, t));
  }

  get traumaNow(): number {
    return this.trauma;
  }

  /** The kick offset now, in CSS px (0 under Reduced motion). */
  get kickPx(): number {
    return Math.hypot(this.kickX.x, this.kickY.x) * this.pxPerMetre();
  }

  /** How far a sheet is open (0 closed, 1 at its full height): the floor re-frames above it. */
  setSheet(fraction: number): void {
    this.sheet.target = Math.min(1, Math.max(0, fraction));
    if (this.motion.reduced) this.sheet.snap(this.sheet.target);
  }

  /** The surface/menu framing (camera 6 m above the ground) instead of the dig framing. */
  setMenu(on: boolean, snap = false): void {
    this.menu.target = on ? 1 : 0;
    if (snap || this.motion.reduced) this.menu.snap(this.menu.target);
    this.restDirty = true;
  }

  update(dt: number): void {
    const step = Math.min(0.1, Math.max(0, dt));
    this.time += step;
    if (this.motion.reduced) {
      if (this.tweenT < 1) {
        this.tweenT = Math.min(1, this.tweenT + step / REDUCED_FOLLOW_S);
        const u = 1 - (1 - this.tweenT) ** 3;
        this.follow.x = this.tweenFrom + (this.follow.target - this.tweenFrom) * u;
      } else this.follow.x = this.follow.target;
      this.follow.v = 0;
      this.kickX.snap(0);
      this.kickY.snap(0);
      this.trauma = 0;
      this.sheet.snap(this.sheet.target);
      this.menu.snap(this.menu.target);
    } else {
      this.follow.step(step);
      this.kickX.step(step);
      this.kickY.step(step);
      this.sheet.step(step);
      this.menu.step(step);
      // Kick offsets superpose but stay within KICK_CAP_PX.
      const cap = KICK_CAP_PX / this.pxPerMetre();
      const k = Math.hypot(this.kickX.x, this.kickY.x);
      if (k > cap) {
        this.kickX.x *= cap / k;
        this.kickY.x *= cap / k;
      }
      this.trauma = Math.max(0, this.trauma - TRAUMA_DECAY * step);
    }
    const t2 = this.trauma * this.trauma * this.motion.shake;
    if (t2 > 0) {
      const f = this.time * SHAKE_HZ;
      this.shakeX = SHAKE_OFFSET_M * t2 * noise1(f, 0x51);
      this.shakeY = SHAKE_OFFSET_M * t2 * noise1(f, 0xa3);
      this.roll = ((SHAKE_ROLL_DEG * Math.PI) / 180) * t2 * noise1(f, 0x7c);
    } else this.shakeX = this.shakeY = this.roll = 0;
    const life = this.motion.life && !this.motion.reduced;
    this.yaw = life ? ((SWAY_DEG * Math.PI) / 180) * Math.sin((this.time * 2 * Math.PI) / SWAY_PERIOD) : 0;
    this.bob = life ? BOB_M * Math.sin((this.time * 2 * Math.PI) / BOB_PERIOD + 1.3) : 0;
    this.restDirty = true;
  }

  pxPerMetre(): number {
    return this.layout.width / viewWidth(this.layout.width);
  }

  /** Screen y (CSS px) where the floor's front edge sits at rest, given the sheet and the menu framing. */
  floorTargetPx(): number {
    const { regionTop, regionBottom, height } = this.layout;
    const play = regionTop + FLOOR_FRACTION * (regionBottom - regionTop);
    const sheetTop = Math.min(regionBottom, SHEET_TOP_FRACTION * height);
    const withSheet = regionTop + SHEET_FLOOR_FRACTION * Math.max(0, sheetTop - regionTop);
    const s = this.sheet.x;
    return play + (withSheet - play) * s;
  }

  /** The eye's world position and its screen line (CSS px) for the current state. */
  private eye(out: THREE.Vector3): number {
    const m = Math.min(1, Math.max(0, this.menu.x));
    const ppm = this.pxPerMetre();
    // Play: the eye 3 m above the followed floor; the floor edge at floorTargetPx.
    const playEyeY = this.follow.x + EYE_ABOVE_FLOOR + this.bob;
    const playLine = this.floorTargetPx() - EYE_ABOVE_FLOOR * ppm;
    // Menu: the eye 6 m above the ground (y = 0), the shaft mouth at 62 % of the screen height.
    const menuEyeY = MENU_EYE + this.bob;
    const menuLine = MENU_MOUTH_FRACTION * this.layout.height - MENU_EYE * ppm;
    out.set(SHAFT_CX, playEyeY + (menuEyeY - playEyeY) * m, CUT_Z + CAM_DIST);
    return playLine + (menuLine - playLine) * m;
  }

  /**
   * Write the camera: position, yaw sway and shake roll, and the off-axis projection. `shaken` false gives
   * the rest pose (what picking and the column strips use).
   */
  apply(cam: THREE.PerspectiveCamera, shaken = true): void {
    const line = this.eye(cam.position);
    const { width, height } = this.layout;
    const ppm = this.pxPerMetre();
    // The window at the cut plane, in metres relative to the eye (+y up), shifted by kick and shake.
    let ox = 0;
    let oy = 0;
    if (shaken) {
      ox = this.kickX.x + this.shakeX;
      oy = this.kickY.x + this.shakeY;
    }
    const halfW = width / ppm / 2;
    const top = line / ppm;
    const bottom = -(height - line) / ppm;
    // The world image moves by (ox, oy): the window moves the other way.
    const k = NEAR / CAM_DIST;
    cam.near = NEAR;
    cam.far = FAR;
    cam.aspect = width / height;
    cam.rotation.set(0, this.yaw, shaken ? this.roll : 0, 'YXZ');
    cam.updateMatrix();
    cam.updateMatrixWorld(true);
    cam.projectionMatrix.makePerspective((-halfW - ox) * k, (halfW - ox) * k, (top - oy) * k, (bottom - oy) * k, NEAR, FAR);
    cam.projectionMatrixInverse.copy(cam.projectionMatrix).invert();
  }

  /** The rest-pose camera (no kick, no shake), refreshed lazily. */
  restCamera(): THREE.PerspectiveCamera {
    if (this.restDirty) {
      this.apply(this.rest, false);
      this.restDirty = false;
    }
    return this.rest;
  }

  /** Project a world point to CSS px on the rest pose. `out.z` is the NDC depth (> 1 behind the far plane). */
  project(x: number, y: number, z: number, out: THREE.Vector3 = new THREE.Vector3()): THREE.Vector3 {
    const cam = this.restCamera();
    out.set(x, y, z).project(cam);
    const { width, height } = this.layout;
    out.x = (out.x * 0.5 + 0.5) * width;
    out.y = (0.5 - out.y * 0.5) * height;
    return out;
  }

  /** The 7 column strips at the floor row: the projected shaft walls at the floor's front edge. */
  columns(out: ColumnStripsPx = { left: 0, right: 0, floorY: 0 }): ColumnStripsPx {
    const y = -this.depth;
    const a = this.project(SHAFT_X0, y, CUT_Z, this.tmp);
    out.left = a.x;
    out.floorY = a.y;
    const b = this.project(SHAFT_X0 + SHAFT_COLS, y, CUT_Z, this.tmp);
    out.right = b.x;
    return out;
  }

  /** Screen y (CSS px) of the floor's front edge now (it moves with the follow spring). */
  floorScreenY(): number {
    return this.project(SHAFT_CX, -this.depth, CUT_Z, this.tmp).y;
  }

  /** Screen centre (CSS px) of the front face of cell (row, col). */
  screenOf(row: number, col: number, out: THREE.Vector3 = new THREE.Vector3()): THREE.Vector3 {
    return this.project(SHAFT_X0 + col + 0.5, -row - 0.5, CUT_Z, out);
  }

  /** True when the camera is at its rest pose (Reduced motion: every frame). */
  atRest(): boolean {
    return this.trauma === 0 && this.kickX.x === 0 && this.kickY.x === 0 && this.yaw === 0 && this.roll === 0 && this.follow.x === this.follow.target;
  }
}
