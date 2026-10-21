// The first-person camera (SPEC §3): the lens, the motion law and the five shots. Pure maths plus one `apply()` onto a
// THREE.PerspectiveCamera; nothing else in the game moves the world camera.
//
// The motion law (§3.2), asserted by `checkMove` and the unit tests (U-CAM1–U-CAM6):
// 1. translation ≤ 2.5 m/s in 3D, vertical ≤ 2.0 m/s, on a trapezoid profile (0.2–0.3 s ramps);
// 2. rotation only in a rotate phase, before or after a translation, ≤ 90°/s; a translation carries ≤ 2° of rotation;
// 3. FOV constant (the horizontal 52° is locked), roll 0, no bob, no sway, no breathing, nothing on a strike (L7);
// 4. rides and glides follow polylines (ropeRide.ts) whose arc length never runs backwards;
// 5. any move longer than 1 s is skippable by a tap (a 0.15 s cross-fade to its end);
// 6. reduced motion: every glide and ride is a 0.25 s cross-fade, the creep a 0.18 s cross-fade, no reveal pitch.
//
// Where an authored number of the SPEC cannot meet the law (a 35° chalk turn in 0.35 s is 100°/s; a breakthrough glide
// longer than 3.2 m in 1.6 s), the law wins and the move takes the time it needs (`durationFor`).
//
// Conventions: world metres, y up. Yaw turns about +y and yaw 0 looks toward −z (three.js 'YXZ' Euler); pitch > 0 looks
// up. Angles are radians in poses and degrees in the authored constants.

import { DEG, HFOV_DEG, NEAR, PITCH, verticalFov } from './lens';
import { durationFor, makePath, pathPoint, trapezoid, trapezoidPeak, type Path, type V3 } from './ropeRide';

export type { V3 } from './ropeRide';

/** Where the camera is and where it looks. Roll is always 0 and the horizontal FOV always 52°. */
export interface CameraPose {
  x: number;
  y: number;
  z: number;
  /** Radians about +y; 0 looks toward −z. */
  yaw: number;
  /** Radians; > 0 looks up. */
  pitch: number;
  /** Always 0. */
  roll: number;
  /** Horizontal field of view (degrees), always 52. */
  hfov: number;
}

/**
 * The shots (U-CAM2). SPEC §3.3's five authored shots, plus the three W1-LEAD §3 phases that hand the view to the
 * player: Explore (tap-to-walk and drag-look in a chamber), Ride (the cart run and other on-rails Way Downs) and Camp
 * (the surface at dusk). The cross-fade is a phase any shot may use, not a shot of its own.
 */
export const SHOT_KINDS = ['drift', 'breakthrough', 'stand', 'wayDown', 'reveal', 'explore', 'ride', 'camp'] as const;
export type ShotKind = (typeof SHOT_KINDS)[number];
/** The authored shots of SPEC §3.3 (the five whose moves `checkMove` validates phase by phase). */
export const AUTHORED_SHOTS: readonly ShotKind[] = ['drift', 'breakthrough', 'stand', 'wayDown', 'reveal'];

/** Every authored move, by name (the camera log and the tests read these). */
export type MoveName =
  | 'creep'
  | 'breakthrough'
  | 'stepIn'
  | 'surveyGlide'
  | 'chalkTurn'
  | 'wayDown'
  | 'catchUp'
  | 'glimpses'
  | 'reveal'
  | 'revealLower'
  | 'crossFade'
  | 'place'
  /** Explore: a walk along a planned path (W1-LEAD §3). */
  | 'walk'
  /** The Ride phase: the cart run, a rope or a stair ridden on rails. */
  | 'ride';

export type MotionLevel = 'full' | 'reduced' | 'off';
/** The creep variants (SPEC §3.6): A the step (default), B the track. C (the fade) is what reduced motion uses. */
export type CreepVariant = 'A' | 'B';

/** A target orientation (radians). */
export interface Look {
  yaw: number;
  pitch: number;
}

export type Phase =
  | { k: 'hold'; dur: number }
  /** Turn to an absolute yaw and pitch (radians) on a trapezoid angular profile. `lift`: the Reveal's pitch-up. */
  | { k: 'rotate'; yaw: number; pitch: number; dur: number; lift?: boolean }
  /** Follow a polyline; `yaw`/`pitch` (optional) may differ from the start by ≤ 2° (the residual rotation). */
  | { k: 'translate'; path: Path; dur: number; ramp: number; yaw?: number; pitch?: number }
  /** The cross-fade: the frame dips toward the scene's dark and the pose cuts to `to` at the midpoint. */
  | { k: 'cut'; to: CameraPose; dur: number };

export interface Move {
  shot: ShotKind;
  name: MoveName;
  phases: Phase[];
}

/** One logged frame of the camera (the tests and `__DD__.hybrid.camera()` read these). */
export interface CameraSample {
  /** Camera clock (s). */
  t: number;
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
  roll: number;
  hfov: number;
  shot: ShotKind;
  move: MoveName | '';
  phase: Phase['k'] | 'creep' | 'walk' | 'ride' | 'look' | '';
  /** The cross-fade's dip, 0..1. */
  fade: number;
  /** Explore: a drag moved the view this frame (the player's own look is exempt from the turn cap). */
  drag?: boolean;
}

// ------------------------------------------------------------------------------------------------------------------
// The law's numbers

export const LAW = {
  /** m/s, 3D and vertical. */
  maxSpeed: 2.5,
  maxVertical: 2.0,
  /** Rotation, °/s, in rotate phases only. */
  maxTurnDeg: 90,
  /** A translation may carry this much rotation (°). */
  residualDeg: 2,
  /** Translation ramps (s). */
  ramp: 0.25,
  rampMin: 0.2,
  rampMax: 0.3,
  /** Rotation ramps (s). */
  turnRamp: 0.04,
  /** Moves longer than this (s) are skippable by a tap. */
  skippableOver: 1,
  /** The skip's cross-fade, the reduced-motion cross-fade for glides and rides, the creep's (s). */
  skipFade: 0.15,
  reducedFade: 0.25,
  creepFade: 0.18,
} as const;

/** Creep A (SPEC §3.6): 0.15 s for the debris, then 1 m in 0.6 s with 0.2 s ramps (peak 2.5 m/s); steps merge. */
export const CREEP_A = { wait: 0.15, ramp: 0.2, vmax: 2.5 } as const;
/**
 * Creep B: the target follows the dig progress through a critically damped spring capped at 1.2 m/s. Its standoff band
 * is 2.8–3.2 m (not the SPEC's 3.4: at 3.4 m a block is 87 px at 360 px, under the 92 px rest floor of C7).
 */
export const CREEP_B = { vmax: 1.2, omega: 7, near: 2.8, far: 3.2 } as const;

/**
 * Explore and Ride (W1-LEAD §3): walking follows the motion law at ≤ 2.5 m/s with eased starts and stops; the camera
 * turns toward the walk direction at ≤ 90°/s, blended with the player's look (a drag during a walk wins); drag-look has
 * free yaw, pitch within ±55°, a light damping that settles in ≤ 120 ms, and never any roll; no bob; steps up to 0.5 m
 * are climbed smoothly; ladders and ropes are path links ridden on rails; a walk that ends in an action stops 0.9 m short.
 */
export const EXPLORE = {
  /** Cruise speed (m/s) and the eased start and stop (s from rest to cruise). */
  walkSpeed: 2.3,
  rampS: 0.3,
  /** Vertical speed on ladders and ropes (m/s, ≤ the law's 2.0). */
  climbSpeed: 1.4,
  /** The auto-turn toward the walk direction (°/s) and how far ahead on the path it looks (m). */
  turnDeg: 90,
  lookAheadM: 0.8,
  /** After a drag, the auto-turn yields to the player's look for this long (s). */
  dragYieldS: 1.5,
  /** Drag-look sensitivity (° per CSS px) and the pitch limit (°). */
  degPerPx: 0.22,
  pitchLimitDeg: 55,
  /** The look's damping time constant (s): 1 − e^(−0.12/0.028) ≈ 98.6 % settled at 120 ms. */
  lookTau: 0.028,
  /** A walk that ends in an action stops this far (m, horizontal) short of the target. */
  stopShortM: 0.9,
  /** On arrival the view turns to face the target (°/s, ≤ the law). */
  faceTurnDeg: 90,
  /** The walking pitch the view eases toward when the player has not looked up or down on their own (°). */
  walkPitchDeg: -6,
  walkPitchRateDeg: 30,
  /** The cart run's cruise (m/s). */
  rideSpeed: 2.5,
} as const;

/** What a walk or a ride is for, and what it calls on arrival. */
export interface WalkOpts {
  /** Turn to face this world point on arrival (an action's target). */
  face?: V3;
  /** 'walk' (Explore, the player may look around) or 'ride' (on rails, the view follows the track). */
  kind?: 'walk' | 'ride';
  /** Cruise speed override (m/s, capped by the law). */
  speed?: number;
  /** Called once when the walk ends (true) or is replaced or stopped (false). */
  done?: (arrived: boolean) => void;
  /** The shot to report while it runs (default 'explore', or 'ride'). */
  shot?: ShotKind;
}

const TAU = Math.PI * 2;
/** Shortest signed difference b − a of two angles (radians). */
export function angleDelta(a: number, b: number): number {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
}

export function makePose(x: number, y: number, z: number, yaw = 0, pitch = 0): CameraPose {
  return { x, y, z, yaw, pitch, roll: 0, hfov: HFOV_DEG };
}

export function clonePose(p: CameraPose, out: CameraPose = makePose(0, 0, 0)): CameraPose {
  out.x = p.x;
  out.y = p.y;
  out.z = p.z;
  out.yaw = p.yaw;
  out.pitch = p.pitch;
  out.roll = 0;
  out.hfov = HFOV_DEG;
  return out;
}

/** The unit view direction of a yaw and pitch. */
export function forward(yaw: number, pitch: number, out: V3 = { x: 0, y: 0, z: 0 }): V3 {
  const c = Math.cos(pitch);
  out.x = -Math.sin(yaw) * c;
  out.y = Math.sin(pitch);
  out.z = -Math.cos(yaw) * c;
  return out;
}

/** The yaw that looks along a horizontal direction (dx, dz). */
export function yawOf(dx: number, dz: number): number {
  return Math.atan2(-dx, -dz);
}

/** Total duration of a move (s). */
export function moveDuration(m: Move): number {
  let d = 0;
  for (const p of m.phases) d += p.dur;
  return d;
}

/** The pose a move ends on, from `from`. */
export function moveEnd(m: Move, from: CameraPose): CameraPose {
  const p = clonePose(from);
  for (const ph of m.phases) endOf(ph, p);
  return p;
}

function endOf(ph: Phase, p: CameraPose): void {
  if (ph.k === 'rotate') {
    p.yaw = ph.yaw;
    p.pitch = ph.pitch;
  } else if (ph.k === 'translate') {
    const e = ph.path.pts[ph.path.pts.length - 1];
    p.x = e.x;
    p.y = e.y;
    p.z = e.z;
    if (ph.yaw !== undefined) p.yaw = ph.yaw;
    if (ph.pitch !== undefined) p.pitch = ph.pitch;
  } else if (ph.k === 'cut') clonePose(ph.to, p);
}

// ------------------------------------------------------------------------------------------------------------------
// Validation (U-CAM3)

export interface LawReport {
  ok: boolean;
  issues: string[];
  peakSpeed: number;
  peakVertical: number;
  peakTurnDeg: number;
  duration: number;
}

/** Check a move from `from` against the motion law (§3.2). */
export function checkMove(m: Move, from: CameraPose): LawReport {
  const issues: string[] = [];
  let peakSpeed = 0;
  let peakVertical = 0;
  let peakTurn = 0;
  const p = clonePose(from);
  for (const ph of m.phases) {
    if (!(ph.dur >= 0) || !Number.isFinite(ph.dur)) issues.push(`${m.name}: bad duration ${ph.dur}`);
    if (ph.k === 'rotate') {
      const ang = Math.max(Math.abs(angleDelta(p.yaw, ph.yaw)), Math.abs(ph.pitch - p.pitch)) / DEG;
      const rate = ang > 1e-6 ? trapezoidPeak(ang, ph.dur, LAW.turnRamp) : 0;
      peakTurn = Math.max(peakTurn, rate);
      if (rate > LAW.maxTurnDeg + 1e-6) issues.push(`${m.name}: turn ${rate.toFixed(1)}°/s > ${LAW.maxTurnDeg}`);
    } else if (ph.k === 'translate') {
      const v = ph.path.length > 1e-9 ? trapezoidPeak(ph.path.length, ph.dur, ph.ramp) : 0;
      const vz = v * ph.path.maxSin;
      peakSpeed = Math.max(peakSpeed, v);
      peakVertical = Math.max(peakVertical, vz);
      if (v > LAW.maxSpeed + 1e-6) issues.push(`${m.name}: speed ${v.toFixed(2)} m/s > ${LAW.maxSpeed}`);
      if (vz > LAW.maxVertical + 1e-6) issues.push(`${m.name}: vertical ${vz.toFixed(2)} m/s > ${LAW.maxVertical}`);
      if (ph.path.length > 1e-9 && (ph.ramp < LAW.rampMin - 1e-9 || ph.ramp > LAW.rampMax + 1e-9) && ph.dur > 2 * LAW.rampMin)
        issues.push(`${m.name}: ramp ${ph.ramp} s outside 0.2–0.3`);
      const ry = ph.yaw !== undefined ? Math.abs(angleDelta(p.yaw, ph.yaw)) / DEG : 0;
      const rp = ph.pitch !== undefined ? Math.abs(ph.pitch - p.pitch) / DEG : 0;
      if (Math.max(ry, rp) > LAW.residualDeg + 1e-6) issues.push(`${m.name}: ${Math.max(ry, rp).toFixed(1)}° of rotation during a translation`);
    }
    endOf(ph, p);
  }
  return { ok: issues.length === 0, issues, peakSpeed, peakVertical, peakTurnDeg: peakTurn, duration: moveDuration(m) };
}

// ------------------------------------------------------------------------------------------------------------------
// Builders for the five shots. Each takes the pose the move starts from and returns a move that holds the law.

function rotatePhase(from: Look, to: Look, want: number, lift = false): Phase | null {
  const ang = Math.max(Math.abs(angleDelta(from.yaw, to.yaw)), Math.abs(to.pitch - from.pitch)) / DEG;
  if (ang < 1e-4) return null;
  const dur = Math.max(want, ang / LAW.maxTurnDeg + LAW.turnRamp, 2 * LAW.turnRamp);
  return { k: 'rotate', yaw: from.yaw + angleDelta(from.yaw, to.yaw), pitch: to.pitch, dur, lift };
}

function translatePhase(points: readonly V3[], want: number, ramp: number = LAW.ramp, vmax: number = LAW.maxSpeed): Phase | null {
  const path = makePath(points);
  if (path.length < 1e-6) return null;
  const cap = Math.min(vmax, path.maxSin > 1e-9 ? LAW.maxVertical / path.maxSin : Infinity) * 0.999;
  const dur = durationFor(path.length, want, ramp, cap);
  return { k: 'translate', path, dur, ramp };
}

const push = (out: Phase[], p: Phase | null) => {
  if (p) out.push(p);
};

/**
 * Breakthrough (§3.3): the wall falls inward (the camera still), a 0.25 s hold, a turn to the stand's look, then the
 * glide to stand 1 (≤ 3.2 m in 1.6 s when the stand is that close; the law sets the time beyond). First light rises
 * during the glide (the game drives the uniform from the move's progress).
 */
export function breakthroughMove(from: CameraPose, stand: CameraPose, opts: { wallFall?: number; path?: V3[] } = {}): Move {
  const ph: Phase[] = [{ k: 'hold', dur: (opts.wallFall ?? 0.6) + 0.25 }];
  push(ph, rotatePhase(from, stand, 0.15));
  push(ph, translatePhase(opts.path ?? [from, stand], 1.6, 0.3));
  return { shot: 'breakthrough', name: 'breakthrough', phases: ph };
}

/** The Gallery step-in (§3.3): 1.6 m in 1.0 s toward the stand, then the rest at the law's pace if it is further. */
export function stepInMove(from: CameraPose, stand: CameraPose): Move {
  const ph: Phase[] = [{ k: 'hold', dur: 0.25 }];
  push(ph, rotatePhase(from, stand, 0.15));
  push(ph, translatePhase([from, stand], 1.0, 0.25));
  return { shot: 'breakthrough', name: 'stepIn', phases: ph };
}

/** A survey ring (§3.3): turn toward the ring's stand if needed, glide (≤ 1.2 s at the law's pace), turn to its look. */
export function surveyGlideMove(from: CameraPose, stand: CameraPose): Move {
  const ph: Phase[] = [];
  const dx = stand.x - from.x;
  const dz = stand.z - from.z;
  const heading = Math.hypot(dx, dz) > 0.4 ? yawOf(dx, dz) : from.yaw;
  // Face the way you go when the stand is behind or beside you; otherwise glide straight.
  const turnFirst = Math.abs(angleDelta(from.yaw, heading)) > 40 * DEG;
  const mid: Look = turnFirst ? { yaw: heading, pitch: from.pitch } : from;
  if (turnFirst) push(ph, rotatePhase(from, mid, 0.2));
  push(ph, translatePhase([from, stand], 1.2, 0.25));
  push(ph, rotatePhase(mid, stand, 0.2));
  return { shot: 'stand', name: 'surveyGlide', phases: ph };
}

/** A chalk arrow (§3.3): turn ≤ 35° yaw or ≤ 20° pitch, in ≤ 0.35 s where the law allows (≤ 26°), else at 90°/s. */
export function chalkTurnMove(from: CameraPose, dyawDeg: number, dpitchDeg = 0): Move {
  const yaw = Math.max(-35, Math.min(35, dyawDeg)) * DEG;
  const pitch = Math.max(-20, Math.min(20, dpitchDeg)) * DEG;
  const ph: Phase[] = [];
  push(ph, rotatePhase(from, { yaw: from.yaw + yaw, pitch: from.pitch + pitch }, 0.3));
  return { shot: 'stand', name: 'chalkTurn', phases: ph };
}

/**
 * The Way Down (§3.3): rotate to −20° (≤ 0.3 s) toward the path, ride 3–5 m of polyline (1.6–2.6 s), rotate to the
 * next drift's look (−8°, ≤ 0.25 s).
 */
export function wayDownMove(from: CameraPose, path: readonly V3[], end: Look): Move {
  const pts = path.length ? [from, ...path] : [from];
  const a = pts[0];
  const b = pts[Math.min(pts.length - 1, 1)];
  const heading = Math.hypot(b.x - a.x, b.z - a.z) > 0.2 ? yawOf(b.x - a.x, b.z - a.z) : end.yaw;
  const down: Look = { yaw: heading, pitch: PITCH.wayDown * DEG };
  const ph: Phase[] = [];
  push(ph, rotatePhase(from, down, 0.3));
  push(ph, translatePhase(pts, 1.6, 0.3));
  push(ph, rotatePhase(down, end, 0.25));
  return { shot: 'wayDown', name: 'wayDown', phases: ph };
}

/** The catch-up track (§3.3): straight down a drift the crew dug, 2.5 m/s cruise, skippable. */
export function catchUpMove(from: CameraPose, to: CameraPose): Move {
  const ph: Phase[] = [];
  push(ph, rotatePhase(from, to, 0.2));
  push(ph, translatePhase([from, to], 0, 0.3));
  return { shot: 'wayDown', name: 'catchUp', phases: ph };
}

/**
 * The return glimpses (§5.3): a 0.24 s fade in, up to 3 glimpses (each a slow 0.7 s dolly) joined by 0.25 s cross-fades,
 * then the mouth of the first dark chamber. ≤ 3 s in all.
 */
export function glimpsesMove(glimpses: ReadonlyArray<{ pose: CameraPose; dolly?: V3 }>, mouth: CameraPose): Move {
  const ph: Phase[] = [];
  const n = Math.min(3, glimpses.length);
  for (let i = 0; i < n; i++) {
    const g = glimpses[i];
    ph.push({ k: 'cut', to: clonePose(g.pose), dur: i === 0 ? 0.24 : 0.25 });
    const last = i === n - 1;
    const dur = last ? 0.6 : 0.7;
    if (g.dolly) {
      const p = makePath([g.pose, g.dolly]);
      // A slow dolly: at most 0.35 m (0.6 m/s peak) so the glimpse reads as a look, not a ride.
      const len = Math.min(0.35, p.length);
      const end = pathPoint(p, len);
      ph.push({ k: 'translate', path: makePath([g.pose, end]), dur, ramp: 0.2 });
    } else ph.push({ k: 'hold', dur });
  }
  ph.push({ k: 'cut', to: clonePose(mouth), dur: 0.25 });
  return { shot: 'wayDown', name: 'glimpses', phases: ph };
}

/**
 * The Reveal (§3.3): the drop onto the Threshold's stand (vertical ≤ 2.0 m/s), then the only slow pitch-up (+12° over
 * 1.2 s, 10°/s). ≤ 3 s in all for a drop of up to 3 m. The lift is lowered by `revealLowerMove` on the next tap.
 */
export function revealMove(from: CameraPose, stand: CameraPose, path?: readonly V3[]): Move {
  const ph: Phase[] = [];
  push(ph, rotatePhase(from, stand, 0.2));
  push(ph, translatePhase(path ? [from, ...path, stand] : [from, stand], 1.4, 0.3));
  push(ph, rotatePhase(stand, { yaw: stand.yaw, pitch: stand.pitch + PITCH.revealLift * DEG }, 1.2, true));
  return { shot: 'reveal', name: 'reveal', phases: ph };
}

export function revealLowerMove(from: CameraPose, pitch: number): Move {
  const ph: Phase[] = [];
  push(ph, rotatePhase(from, { yaw: from.yaw, pitch }, 0.25));
  return { shot: 'stand', name: 'revealLower', phases: ph };
}

/** A plain cross-fade to a pose in any shot (the universal fallback: skips, the Head Start, Rekindle…). */
export function crossFadeMove(shot: ShotKind, to: CameraPose, dur: number = LAW.reducedFade): Move {
  return { shot, name: 'crossFade', phases: [{ k: 'cut', to: clonePose(to), dur }] };
}

/** Reduced motion (§3.2 rule 6): the same move as one cross-fade to where it ends, with no Reveal lift. */
export function reducedMove(m: Move, from: CameraPose): Move {
  const phases = m.phases.filter((p) => !(p.k === 'rotate' && p.lift));
  const end = moveEnd({ ...m, phases }, from);
  return { shot: m.shot, name: m.name, phases: [{ k: 'cut', to: end, dur: LAW.reducedFade }] };
}

// ------------------------------------------------------------------------------------------------------------------
// The drift rail and the creep

/** The drift the camera stands in: its eye line (origin = the eye at the drift's first slice, dir = unit along it). */
export interface DriftRail {
  origin: V3;
  dir: V3;
  yaw: number;
  pitch: number;
}

const LOG_SIZE = 2048;

/** The camera. One per game; `update(dt)` once a frame, `apply()` onto the scene's camera. */
export class FirstPersonCamera {
  motion: MotionLevel = 'full';
  creepVariant: CreepVariant = 'A';
  private readonly cur = makePose(0, 1.6, 0, 0, PITCH.drift * DEG);
  private shotNow: ShotKind = 'drift';
  private clock = 0;
  // The running move.
  private move: Move | null = null;
  private moveName: MoveName | '' = '';
  private phaseIdx = 0;
  private phaseT = 0;
  private readonly phaseFrom = makePose(0, 0, 0);
  private moveT = 0;
  private moveDur = 0;
  private fadeNow = 0;
  private onDone: (() => void) | null = null;
  // The creep along the drift rail.
  private rail: DriftRail | null = null;
  private s = 0;
  private sTarget = 0;
  private v = 0;
  private wait = 0;
  private resting = true;
  private readonly samples: CameraSample[] = [];
  private head = 0;
  private readonly tmp: V3 = { x: 0, y: 0, z: 0 };
  private readonly tmp2: V3 = { x: 0, y: 0, z: 0 };
  /** Moves started, by name (tests and the debug surface). */
  readonly started: MoveName[] = [];
  // Explore: the walk (or ride) along a path, and the look the pose follows.
  private exploreOn = false;
  private walkP: Path | null = null;
  private walkCaps: number[] = [];
  private walkS = 0;
  private walkV = 0;
  private walkOpts: WalkOpts = {};
  private walkSpeed: number = EXPLORE.walkSpeed;
  private faceAt: V3 | null = null;
  private lookYaw = 0;
  private lookPitch = PITCH.drift * DEG;
  private lastDragClock = -1e9;
  private dragThisFrame = false;
  /** The player pitched the view by hand since the last walk began (the walk then leaves the pitch alone). */
  private pitchOwned = false;

  /** The pose now (a live object: copy what you keep). */
  pose(): CameraPose {
    return this.cur;
  }

  get shot(): ShotKind {
    return this.shotNow;
  }

  /** A move, the creep, a walk, a ride or the look's settle is moving the camera. */
  get moving(): boolean {
    return this.move !== null || !this.resting || this.walkP !== null || this.faceAt !== null || (this.exploreOn && this.lookUnsettled());
  }

  /** Explore is on: the player walks by tap and looks by drag (W1-LEAD §3). */
  get exploring(): boolean {
    return this.exploreOn;
  }

  /** A walk or a ride is running. */
  get walking(): boolean {
    return this.walkP !== null;
  }

  /** The running walk's kind ('' when none). */
  get walkKind(): 'walk' | 'ride' | '' {
    return this.walkP ? this.walkOpts.kind ?? 'walk' : '';
  }

  /** Where the running walk ends (eye point), or null. */
  walkEnd(): V3 | null {
    const p = this.walkP;
    return p ? { ...p.pts[p.pts.length - 1] } : null;
  }

  /** The running walk's progress 0..1 (1 when none). */
  get walkProgress(): number {
    return this.walkP && this.walkP.length > 0 ? Math.min(1, this.walkS / this.walkP.length) : 1;
  }

  /** The walking speed now (m/s). */
  get speed(): number {
    return this.walkP ? this.walkV : 0;
  }

  /** The running move's name ('' when none). */
  get running(): MoveName | '' {
    return this.move ? this.moveName : '';
  }

  /** The running move's progress 0..1 (1 when none). */
  get progress(): number {
    return this.move && this.moveDur > 0 ? Math.min(1, this.moveT / this.moveDur) : 1;
  }

  /** The cross-fade's dip now, 0..1 (the shell draws it under the HUD). */
  get fade(): number {
    return this.fadeNow;
  }

  /** Whether a tap now would skip the running move (> 1 s long, not already skipping), or the running ride. */
  get skippable(): boolean {
    if (!this.move && this.walkP && this.walkOpts.kind === 'ride') return this.walkP.length - this.walkS > 1.5;
    return !!this.move && this.moveDur > LAW.skippableOver && this.moveName !== 'crossFade' && this.moveT < this.moveDur - LAW.skipFade;
  }

  /** Place the camera without motion (boot, a loaded save, a debug jump). Ends any move. */
  place(p: Pick<CameraPose, 'x' | 'y' | 'z' | 'yaw' | 'pitch'>, shot: ShotKind): void {
    this.cur.x = p.x;
    this.cur.y = p.y;
    this.cur.z = p.z;
    this.cur.yaw = p.yaw;
    this.cur.pitch = p.pitch;
    this.shotNow = shot;
    this.move = null;
    this.moveName = '';
    this.fadeNow = 0;
    this.v = 0;
    this.resting = true;
    this.cancelWalk();
    this.faceAt = null;
    if (this.rail) this.syncRail();
    this.lookYaw = this.cur.yaw;
    this.lookPitch = this.cur.pitch;
    this.sample('', '');
  }

  // ----------------------------------------------------------------------------------------------------------------
  // Explore (W1-LEAD §3): tap-to-walk and drag-look

  /** Hand the view to the player (a chamber after its first light, the camp). Leaves any drift rail. */
  enterExplore(shot: ShotKind = 'explore'): void {
    this.exploreOn = true;
    this.clearRail();
    this.lookYaw = this.cur.yaw;
    this.lookPitch = clampPitch(this.cur.pitch);
    this.pitchOwned = false;
    if (!this.move) this.shotNow = shot;
  }

  /** Take the view back (a Way Down, a ride, the seal). A running walk stops where it is. */
  exitExplore(): void {
    this.exploreOn = false;
    this.cancelWalk();
    this.faceAt = null;
  }

  /**
   * Drag-look: `dx`, `dy` CSS px of finger travel this frame. Yaw is free, pitch stays within ±55°, never any roll.
   * Dragging right looks right, dragging up looks up. A drag during a walk wins over the walk's auto-turn.
   */
  look(dx: number, dy: number): void {
    if (!this.exploreOn || this.move) return;
    if (this.walkP && this.walkOpts.kind === 'ride') return;
    const k = EXPLORE.degPerPx * DEG;
    this.lookYaw -= dx * k;
    this.lookPitch = clampPitch(this.lookPitch - dy * k);
    this.lastDragClock = this.clock;
    this.dragThisFrame = true;
    if (Math.abs(dy) > 0.5) this.pitchOwned = true;
    // A drag cancels the arrival's face turn: the player looks where they want.
    this.faceAt = null;
  }

  /** Turn to face a world point at ≤ 90°/s (an action in reach, the objective's target). */
  faceTo(p: V3): void {
    if (!this.exploreOn) return;
    this.faceAt = { ...p };
  }

  /**
   * Walk (or ride) along `points` (eye positions, world m) from where the camera is. The speed eases in and out over
   * 0.3 s, never above 2.5 m/s (vertical ≤ 2.0, ladders 1.4); the view turns toward the walk direction at ≤ 90°/s
   * unless the player dragged in the last 1.5 s. A new walk replaces the running one and keeps its speed.
   */
  walk(points: readonly V3[], opts: WalkOpts = {}): void {
    const prevDone = this.walkP ? this.walkOpts.done : undefined;
    const keepV = this.walkP ? this.walkV : 0;
    this.walkP = null;
    prevDone?.(false);
    if (this.move) this.finishCallback();
    this.move = null;
    this.moveName = '';
    const pts: V3[] = [{ x: this.cur.x, y: this.cur.y, z: this.cur.z }];
    for (const p of points) {
      const l = pts[pts.length - 1];
      if (Math.hypot(p.x - l.x, p.y - l.y, p.z - l.z) > 1e-4) pts.push({ x: p.x, y: p.y, z: p.z });
    }
    this.walkOpts = opts;
    this.faceAt = null;
    if (opts.kind !== 'ride') this.pitchOwned = false;
    const path = makePath(pts);
    if (path.length < 0.02) {
      if (opts.face) this.faceAt = { ...opts.face };
      opts.done?.(true);
      return;
    }
    const kind = opts.kind ?? 'walk';
    if (this.motion !== 'full') {
      // Reduced motion (§3.2 rule 6): a walk or a ride is one 0.25 s cross-fade to where it ends (a comfort teleport).
      const e = path.pts[path.pts.length - 1];
      const to = clonePose(this.cur);
      to.x = e.x;
      to.y = e.y;
      to.z = e.z;
      if (opts.face) {
        const dx = opts.face.x - e.x;
        const dz = opts.face.z - e.z;
        if (Math.hypot(dx, dz) > 0.05) to.yaw = yawOf(dx, dz);
        to.pitch = clampPitch(Math.atan2(opts.face.y - e.y, Math.max(0.05, Math.hypot(dx, dz))));
      } else if (kind === 'ride') {
        const b = path.pts[path.pts.length - 2];
        if (Math.hypot(e.x - b.x, e.z - b.z) > 0.05) to.yaw = yawOf(e.x - b.x, e.z - b.z);
      }
      const shot = opts.shot ?? (kind === 'ride' ? 'ride' : 'explore');
      this.started.push(kind);
      this.play({ shot, name: 'crossFade', phases: [{ k: 'cut', to, dur: LAW.reducedFade }] }, () => {
        if (this.exploreOn) this.shotNow = 'explore';
        opts.done?.(true);
      });
      return;
    }
    this.walkSpeed = Math.min(LAW.maxSpeed * 0.999, opts.speed ?? (kind === 'ride' ? EXPLORE.rideSpeed * 0.999 : EXPLORE.walkSpeed));
    this.walkCaps = [];
    for (let k = 1; k < path.pts.length; k++) {
      const a = path.pts[k - 1];
      const b = path.pts[k];
      const d = path.cum[k] - path.cum[k - 1];
      const sin = d > 1e-9 ? Math.abs(b.y - a.y) / d : 0;
      const vert = sin > 0.6 ? EXPLORE.climbSpeed : LAW.maxVertical * 0.98;
      this.walkCaps.push(Math.min(this.walkSpeed, sin > 1e-6 ? vert / sin : Infinity));
    }
    this.walkP = path;
    this.walkS = 0;
    this.walkV = Math.min(keepV, this.walkCaps[0] ?? keepV);
    this.started.push(kind);
    if (this.started.length > 256) this.started.shift();
    this.shotNow = opts.shot ?? (kind === 'ride' ? 'ride' : 'explore');
    this.clearRail();
  }

  /** Stop the running walk with an eased stop (the remaining braking distance), never a jolt. */
  stopWalk(): void {
    const p = this.walkP;
    if (!p) return;
    const a = this.walkSpeed / EXPLORE.rampS;
    const brake = (this.walkV * this.walkV) / (2 * a);
    const end = Math.min(p.length, this.walkS + brake);
    const pts: V3[] = [];
    const n = Math.max(2, Math.ceil((end - this.walkS) / 0.25) + 1);
    for (let i = 0; i < n; i++) pts.push(pathPoint(p, this.walkS + ((end - this.walkS) * i) / (n - 1)));
    const done = this.walkOpts.done;
    this.walkOpts = { ...this.walkOpts, face: undefined, done: undefined };
    done?.(false);
    const v = this.walkV;
    const opts = this.walkOpts;
    this.walkP = null;
    this.walk(pts.slice(1), opts);
    this.walkV = Math.min(v, this.walkSpeed);
  }

  private cancelWalk(): void {
    if (!this.walkP) return;
    const done = this.walkOpts.done;
    this.walkP = null;
    this.walkV = 0;
    this.walkOpts = {};
    done?.(false);
  }

  private lookUnsettled(): boolean {
    return Math.abs(angleDelta(this.cur.yaw, this.lookYaw)) > 1e-4 || Math.abs(this.cur.pitch - this.lookPitch) > 1e-4;
  }

  private stepWalk(dt: number): void {
    const p = this.walkP!;
    const kind = this.walkOpts.kind ?? 'walk';
    const vmax = this.walkSpeed;
    const a = vmax / EXPLORE.rampS;
    const n = Math.max(1, Math.ceil(dt / (1 / 240)));
    const h = dt / n;
    let arrived = false;
    for (let i = 0; i < n; i++) {
      // The speed allowed here: the cruise, each segment's cap ahead within braking distance, and the stop at the end.
      let seg = 1;
      while (seg < p.pts.length - 1 && p.cum[seg] <= this.walkS) seg++;
      let allow = Math.min(vmax, this.walkCaps[seg - 1] ?? vmax, Math.sqrt(Math.max(0, 2 * a * (p.length - this.walkS))));
      for (let k = seg; k < this.walkCaps.length; k++) {
        const dist = p.cum[k] - this.walkS;
        if (dist > (vmax * vmax) / (2 * a) + 0.05) break;
        allow = Math.min(allow, Math.sqrt(this.walkCaps[k] * this.walkCaps[k] + 2 * a * Math.max(0, dist)));
      }
      if (this.walkV < allow) this.walkV = Math.min(allow, this.walkV + a * h);
      else this.walkV = Math.max(allow, this.walkV - a * h);
      // A segment's own cap is hard (a ladder entered from a standstill mid-walk).
      this.walkV = Math.min(this.walkV, this.walkCaps[seg - 1] ?? vmax);
      // Never stall short of the end: creep the last centimetres at the ramp's floor speed.
      const v = Math.max(this.walkV, p.length - this.walkS < 0.05 ? a * h : 0);
      this.walkS = Math.min(p.length, this.walkS + v * h);
      if (p.length - this.walkS < 1e-4) {
        this.walkS = p.length;
        arrived = true;
        break;
      }
    }
    pathPoint(p, this.walkS, this.tmp);
    this.cur.x = this.tmp.x;
    this.cur.y = this.tmp.y;
    this.cur.z = this.tmp.z;
    // The auto-turn toward the walk direction (≤ 90°/s), unless the player looked around in the last 1.5 s.
    const yielded = kind === 'walk' && this.clock - this.lastDragClock < EXPLORE.dragYieldS;
    if (!yielded) {
      pathPoint(p, Math.min(p.length, this.walkS + EXPLORE.lookAheadM), this.tmp2);
      const hx = this.tmp2.x - this.tmp.x;
      const hz = this.tmp2.z - this.tmp.z;
      if (Math.hypot(hx, hz) > 0.08) this.lookYaw = turnToward(this.lookYaw, yawOf(hx, hz), EXPLORE.turnDeg * DEG, dt);
      if (kind === 'ride') {
        const hy = this.tmp2.y - this.tmp.y;
        const slope = Math.atan2(hy, Math.max(1e-6, Math.hypot(hx, hz)));
        this.lookPitch = turnToward(this.lookPitch, clampPitch(slope * 0.5 + EXPLORE.walkPitchDeg * DEG), EXPLORE.walkPitchRateDeg * DEG, dt);
      }
    }
    if (kind === 'walk' && !this.pitchOwned) this.lookPitch = turnToward(this.lookPitch, EXPLORE.walkPitchDeg * DEG, EXPLORE.walkPitchRateDeg * DEG, dt);
    if (arrived) {
      const done = this.walkOpts.done;
      const face = this.walkOpts.face;
      this.walkP = null;
      this.walkV = 0;
      this.walkOpts = {};
      if (face) this.faceAt = { ...face };
      if (this.exploreOn) this.shotNow = 'explore';
      done?.(true);
    }
  }

  /** The look: the arrival's face turn, then the pose follows the look target with a ≤ 120 ms settle. */
  private stepLook(dt: number): void {
    if (this.faceAt) {
      const f = this.faceAt;
      const dx = f.x - this.cur.x;
      const dy = f.y - this.cur.y;
      const dz = f.z - this.cur.z;
      const hd = Math.hypot(dx, dz);
      const wantYaw = hd > 0.05 ? yawOf(dx, dz) : this.lookYaw;
      const wantPitch = clampPitch(Math.atan2(dy, Math.max(0.05, hd)));
      const r = EXPLORE.faceTurnDeg * DEG;
      this.lookYaw = turnToward(this.lookYaw, wantYaw, r, dt);
      this.lookPitch = turnToward(this.lookPitch, wantPitch, r, dt);
      if (Math.abs(angleDelta(this.lookYaw, wantYaw)) < 0.3 * DEG && Math.abs(this.lookPitch - wantPitch) < 0.3 * DEG) this.faceAt = null;
    }
    const k = 1 - Math.exp(-dt / EXPLORE.lookTau);
    const dyaw = angleDelta(this.cur.yaw, this.lookYaw);
    const dp = this.lookPitch - this.cur.pitch;
    this.cur.yaw = Math.abs(dyaw) < 1e-5 ? this.lookYaw : this.cur.yaw + dyaw * k;
    this.cur.pitch = Math.abs(dp) < 1e-5 ? this.lookPitch : this.cur.pitch + dp * k;
  }

  /**
   * Play an authored move from the current pose. Reduced motion turns it into a cross-fade (U-CAM4). A running move
   * is replaced (its end is not applied: the new move starts where the camera is). `done` fires when it ends.
   */
  play(m: Move, done?: () => void): void {
    const mv = this.motion === 'full' ? m : reducedMove(m, this.cur);
    this.cancelWalk();
    this.faceAt = null;
    this.finishCallback();
    this.move = mv;
    this.moveName = mv.name;
    this.shotNow = mv.shot;
    this.phaseIdx = 0;
    this.phaseT = 0;
    this.moveT = 0;
    this.moveDur = moveDuration(mv);
    clonePose(this.cur, this.phaseFrom);
    this.onDone = done ?? null;
    this.v = 0;
    this.resting = true;
    this.started.push(mv.name);
    if (this.started.length > 256) this.started.shift();
    if (mv.phases.length === 0) this.endMove();
  }

  /** Skip the running move (or ride) to its end with a 0.15 s cross-fade (§3.2 rule 5). @returns false when nothing to skip. */
  skip(): boolean {
    if (!this.move && this.walkP && this.walkOpts.kind === 'ride') {
      const p = this.walkP;
      const end = clonePose(this.cur);
      const e = p.pts[p.pts.length - 1];
      end.x = e.x;
      end.y = e.y;
      end.z = e.z;
      const done = this.walkOpts.done;
      const shot = this.shotNow;
      this.walkP = null;
      this.walkV = 0;
      this.walkOpts = {};
      this.play({ shot, name: 'crossFade', phases: [{ k: 'cut', to: end, dur: LAW.skipFade }] }, () => done?.(true));
      return true;
    }
    if (!this.skippable || !this.move) return false;
    const rest: Move = { ...this.move, phases: this.move.phases.slice(this.phaseIdx) };
    const end = moveEnd(rest, this.cur);
    const done = this.onDone;
    this.onDone = null;
    const shot = this.move.shot;
    this.move = { shot, name: 'crossFade', phases: [{ k: 'cut', to: end, dur: LAW.skipFade }] };
    this.moveName = 'crossFade';
    this.phaseIdx = 0;
    this.phaseT = 0;
    this.moveT = 0;
    this.moveDur = LAW.skipFade;
    clonePose(this.cur, this.phaseFrom);
    this.onDone = done;
    this.started.push('crossFade');
    return true;
  }

  /** Stand in a drift: the creep moves along this rail. `s` is the distance from the rail origin (m). */
  setRail(rail: DriftRail, s: number): void {
    this.rail = { origin: { ...rail.origin }, dir: norm(rail.dir), yaw: rail.yaw, pitch: rail.pitch };
    this.s = s;
    this.sTarget = s;
    this.v = 0;
    this.wait = 0;
    this.resting = true;
    if (!this.move) {
      this.shotNow = 'drift';
      this.syncRail();
    }
  }

  clearRail(): void {
    this.rail = null;
    this.resting = true;
    this.v = 0;
  }

  get railS(): number {
    return this.s;
  }

  get creepTarget(): number {
    return this.sTarget;
  }

  /**
   * The creep (§3.6): move the target along the rail. A: after a slice falls (`step`), 0.15 s, then a trapezoid step;
   * a step that arrives mid-step merges into one constant-speed track. B: the target follows the dig progress (called
   * every frame). Reduced motion: a 0.18 s cross-fade step.
   */
  creepTo(s: number): void {
    if (!this.rail) return;
    if (Math.abs(s - this.sTarget) < 1e-9) return;
    const wasResting = this.resting && Math.abs(this.v) < 1e-9;
    this.sTarget = s;
    if (this.motion !== 'full') {
      const to = clonePose(this.cur);
      this.railPoint(s, to);
      this.s = s;
      this.play({ shot: 'drift', name: 'creep', phases: [{ k: 'cut', to, dur: LAW.creepFade }] });
      return;
    }
    if (this.creepVariant === 'A' && wasResting) this.wait = CREEP_A.wait;
    this.resting = false;
  }

  /** Advance by `dt` seconds (the frame's dt; the camera never runs on the FX clock: hit-stops do not freeze it). */
  update(dt: number): void {
    const d = Math.max(0, Math.min(0.25, dt));
    this.clock += d;
    if (this.move) this.stepMove(d);
    else if (this.walkP) this.stepWalk(d);
    else if (this.rail && !this.resting) this.stepCreep(d);
    if (!this.move && (this.exploreOn || this.walkP)) this.stepLook(d);
    else if (this.move) {
      this.lookYaw = this.cur.yaw;
      this.lookPitch = this.cur.pitch;
    }
    const wk = this.walkKind;
    const move: MoveName | '' = this.move ? this.moveName : wk ? wk : this.resting ? '' : 'creep';
    const phase: CameraSample['phase'] = this.move ? this.move.phases[this.phaseIdx]?.k ?? '' : wk ? wk : !this.resting ? 'creep' : this.exploreOn && (this.dragThisFrame || this.faceAt || this.lookUnsettled()) ? 'look' : '';
    this.sample(move, phase);
    this.dragThisFrame = false;
  }

  /** The camera log, oldest first (≤ 2,048 frames). */
  log(): CameraSample[] {
    const n = this.samples.length;
    if (n < LOG_SIZE) return this.samples.slice();
    return [...this.samples.slice(this.head), ...this.samples.slice(0, this.head)];
  }

  clearLog(): void {
    this.samples.length = 0;
    this.head = 0;
  }

  /**
   * Write the pose onto a three.js camera: position, 'YXZ' rotation (roll 0), the vertical FOV that keeps the horizontal
   * one at 52° for this aspect, the near plane. The only impure call of the camera.
   */
  apply(cam: { position: { set(x: number, y: number, z: number): unknown }; rotation: { set(x: number, y: number, z: number, order?: string): unknown }; fov: number; aspect: number; near: number; updateProjectionMatrix(): void; updateMatrixWorld(force?: boolean): void }, aspect: number): void {
    cam.position.set(this.cur.x, this.cur.y, this.cur.z);
    cam.rotation.set(this.cur.pitch, this.cur.yaw, 0, 'YXZ');
    const fov = verticalFov(aspect);
    if (cam.fov !== fov || cam.aspect !== aspect || cam.near !== NEAR) {
      cam.fov = fov;
      cam.aspect = aspect;
      cam.near = NEAR;
      cam.updateProjectionMatrix();
    }
    cam.updateMatrixWorld(true);
  }

  // ----------------------------------------------------------------------------------------------------------------

  private stepMove(dt: number): void {
    let left = dt;
    const m = this.move!;
    this.fadeNow = 0;
    while (this.move === m && left >= 0) {
      const ph = m.phases[this.phaseIdx];
      if (!ph) {
        this.endMove();
        return;
      }
      const room = ph.dur - this.phaseT;
      const use = Math.min(room, left);
      this.phaseT += use;
      this.moveT += use;
      left -= use;
      this.evalPhase(ph, this.phaseT);
      if (this.phaseT >= ph.dur - 1e-9) {
        endOf(ph, this.cur);
        this.phaseIdx++;
        this.phaseT = 0;
        clonePose(this.cur, this.phaseFrom);
        if (this.phaseIdx >= m.phases.length) {
          this.fadeNow = 0;
          this.endMove();
          return;
        }
        if (left <= 1e-12) return;
      } else return;
    }
  }

  private evalPhase(ph: Phase, t: number): void {
    const f = this.phaseFrom;
    const c = this.cur;
    if (ph.k === 'hold') return;
    if (ph.k === 'rotate') {
      const dy = angleDelta(f.yaw, ph.yaw);
      const dp = ph.pitch - f.pitch;
      const ang = Math.max(Math.abs(dy), Math.abs(dp));
      const u = ang > 1e-9 ? trapezoid(ang, ph.dur, LAW.turnRamp, t) / ang : 1;
      c.yaw = f.yaw + dy * u;
      c.pitch = f.pitch + dp * u;
      return;
    }
    if (ph.k === 'translate') {
      const s = trapezoid(ph.path.length, ph.dur, ph.ramp, t);
      pathPoint(ph.path, s, this.tmp);
      c.x = this.tmp.x;
      c.y = this.tmp.y;
      c.z = this.tmp.z;
      const u = ph.path.length > 1e-9 ? s / ph.path.length : 1;
      if (ph.yaw !== undefined) c.yaw = f.yaw + angleDelta(f.yaw, ph.yaw) * u;
      if (ph.pitch !== undefined) c.pitch = f.pitch + (ph.pitch - f.pitch) * u;
      return;
    }
    // The cut: a dip that peaks at the midpoint, where the pose jumps.
    const u = ph.dur > 0 ? t / ph.dur : 1;
    this.fadeNow = u < 0.5 ? u * 2 : Math.max(0, 2 - u * 2);
    if (u >= 0.5) {
      c.x = ph.to.x;
      c.y = ph.to.y;
      c.z = ph.to.z;
      c.yaw = ph.to.yaw;
      c.pitch = ph.to.pitch;
    }
  }

  private endMove(): void {
    this.move = null;
    this.moveName = '';
    this.fadeNow = 0;
    if (this.rail) {
      // Back on the rail: the creep resumes from where the rail point nearest the camera is.
      const r = this.rail;
      const s = (this.cur.x - r.origin.x) * r.dir.x + (this.cur.y - r.origin.y) * r.dir.y + (this.cur.z - r.origin.z) * r.dir.z;
      const off = Math.hypot(this.cur.x - (r.origin.x + r.dir.x * s), this.cur.y - (r.origin.y + r.dir.y * s), this.cur.z - (r.origin.z + r.dir.z * s));
      if (off < 0.05) {
        this.s = s;
        if (Math.abs(this.sTarget - s) > 1e-6) this.resting = false;
      }
    }
    this.finishCallback();
  }

  private finishCallback(): void {
    const cb = this.onDone;
    this.onDone = null;
    cb?.();
  }

  private stepCreep(dt: number): void {
    const r = this.rail!;
    if (this.creepVariant === 'A') {
      if (this.wait > 0) {
        const w = Math.min(this.wait, dt);
        this.wait -= w;
        dt -= w;
        if (dt <= 0) return;
      }
      // Bang-coast-bang along the rail: accelerate at vmax/ramp to vmax, brake to stop exactly on the target.
      const a = CREEP_A.vmax / CREEP_A.ramp;
      const n = Math.max(1, Math.ceil(dt / (1 / 240)));
      const h = dt / n;
      for (let i = 0; i < n; i++) {
        const rem = this.sTarget - this.s;
        const dir = Math.sign(rem);
        if (Math.abs(rem) < 1e-6 && Math.abs(this.v) < a * h + 1e-6) {
          this.s = this.sTarget;
          this.v = 0;
          this.resting = true;
          break;
        }
        const brake = (this.v * this.v) / (2 * a);
        let acc: number;
        if (dir !== 0 && Math.sign(this.v) !== -dir && brake >= Math.abs(rem) - 1e-9) acc = -Math.sign(this.v) * a;
        else acc = dir * a;
        let v2 = this.v + acc * h;
        if (Math.abs(v2) > CREEP_A.vmax) v2 = Math.sign(v2) * CREEP_A.vmax;
        let s2 = this.s + 0.5 * (this.v + v2) * h;
        // Never overshoot the target.
        if ((dir > 0 && s2 > this.sTarget) || (dir < 0 && s2 < this.sTarget)) {
          s2 = this.sTarget;
          v2 = 0;
        }
        this.s = s2;
        this.v = v2;
      }
    } else {
      // B: a critically damped spring on s, speed capped.
      const w = CREEP_B.omega;
      const n = Math.max(1, Math.ceil(dt / (1 / 240)));
      const h = dt / n;
      for (let i = 0; i < n; i++) {
        const acc = w * w * (this.sTarget - this.s) - 2 * w * this.v;
        this.v += acc * h;
        if (Math.abs(this.v) > CREEP_B.vmax) this.v = Math.sign(this.v) * CREEP_B.vmax;
        this.s += this.v * h;
      }
      if (Math.abs(this.sTarget - this.s) < 1e-4 && Math.abs(this.v) < 1e-3) {
        this.s = this.sTarget;
        this.v = 0;
        this.resting = true;
      }
    }
    this.syncRail();
    void r;
  }

  private syncRail(): void {
    if (!this.rail) return;
    this.railPoint(this.s, this.cur);
    this.cur.yaw = this.rail.yaw;
    this.cur.pitch = this.rail.pitch;
  }

  private railPoint(s: number, out: CameraPose): void {
    const r = this.rail!;
    out.x = r.origin.x + r.dir.x * s;
    out.y = r.origin.y + r.dir.y * s;
    out.z = r.origin.z + r.dir.z * s;
  }

  private sample(move: MoveName | '', phase: CameraSample['phase']): void {
    const c = this.cur;
    // A drag, or the settle that follows it, is the player's own look: exempt from the turn cap (U-CAM3 explore).
    const drag = this.dragThisFrame || (this.clock - this.lastDragClock < 0.2 && !this.walkP);
    const e: CameraSample = { t: this.clock, x: c.x, y: c.y, z: c.z, yaw: c.yaw, pitch: c.pitch, roll: 0, hfov: c.hfov, shot: this.shotNow, move, phase, fade: this.fadeNow, drag };
    if (this.samples.length < LOG_SIZE) this.samples.push(e);
    else {
      this.samples[this.head] = e;
      this.head = (this.head + 1) % LOG_SIZE;
    }
  }
}

function norm(v: V3): V3 {
  const l = Math.hypot(v.x, v.y, v.z) || 1;
  return { x: v.x / l, y: v.y / l, z: v.z / l };
}

/** Clamp a pitch (radians) to Explore's ±55°. */
export function clampPitch(p: number): number {
  const lim = EXPLORE.pitchLimitDeg * DEG;
  return p > lim ? lim : p < -lim ? -lim : p;
}

/**
 * Turn angle `a` toward `b` (radians) at ≤ `rate` rad/s with an ease-out near the target (proportional, 6/s), so the
 * turn starts at once and settles without overshoot.
 */
export function turnToward(a: number, b: number, rate: number, dt: number): number {
  const d = angleDelta(a, b);
  const step = Math.min(Math.abs(d), rate * dt, Math.abs(d) * Math.min(1, 6 * dt) + 1e-4);
  return a + Math.sign(d) * Math.min(Math.abs(d), step);
}

/** What `checkLog` found in a camera log (U-CAM3 for Explore and Ride, and the e2e camera checks). */
export interface LogReport {
  ok: boolean;
  issues: string[];
  peakSpeed: number;
  peakVertical: number;
  /** The fastest turn not driven by a drag (°/s). */
  peakAutoTurnDeg: number;
  peakRoll: number;
}

/**
 * Check a sampled camera log against the motion law: speed ≤ 2.5 m/s, vertical ≤ 2.0 m/s, FOV 52°, roll 0, and every
 * turn the player did not drag ≤ 90°/s. Cuts (the cross-fade's jump) are exempt. Frames closer than 4 ms are merged.
 */
export function checkLog(log: readonly CameraSample[]): LogReport {
  const issues: string[] = [];
  let peakSpeed = 0;
  let peakVertical = 0;
  let peakTurn = 0;
  let peakRoll = 0;
  for (let i = 1; i < log.length; i++) {
    const a = log[i - 1];
    const b = log[i];
    peakRoll = Math.max(peakRoll, Math.abs(b.roll));
    if (b.hfov !== HFOV_DEG) issues.push(`fov ${b.hfov} at ${b.t.toFixed(3)}`);
    const dt = b.t - a.t;
    if (!(dt > 0.004)) continue;
    if (b.phase === 'cut' || a.phase === 'cut' || b.fade > 0 || a.fade > 0) continue;
    const v = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z) / dt;
    const vz = Math.abs(b.y - a.y) / dt;
    peakSpeed = Math.max(peakSpeed, v);
    peakVertical = Math.max(peakVertical, vz);
    if (!b.drag && !a.drag) {
      const w = Math.max(Math.abs(angleDelta(a.yaw, b.yaw)), Math.abs(b.pitch - a.pitch)) / DEG / dt;
      peakTurn = Math.max(peakTurn, w);
    }
  }
  // One frame of discretisation slack on the caps.
  if (peakSpeed > LAW.maxSpeed * 1.02) issues.push(`speed ${peakSpeed.toFixed(2)} m/s`);
  if (peakVertical > LAW.maxVertical * 1.02) issues.push(`vertical ${peakVertical.toFixed(2)} m/s`);
  if (peakTurn > LAW.maxTurnDeg * 1.05) issues.push(`turn ${peakTurn.toFixed(1)}°/s`);
  if (peakRoll > 0) issues.push(`roll ${peakRoll}`);
  return { ok: issues.length === 0, issues, peakSpeed, peakVertical, peakAutoTurnDeg: peakTurn, peakRoll };
}
