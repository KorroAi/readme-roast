// Pure math and state rules behind the touch controls. No DOM, unit tested in Node.

/** Floating joystick base radius in CSS px; the knob is clamped to it. */
export const JOYSTICK_RADIUS = 60;
/** Fraction of the radius that produces no movement (thumb rest jitter). */
export const JOYSTICK_DEAD_ZONE = 0.12;
/** Deflection (fraction of the radius) that already means full speed, so the edge is not a wall. */
export const JOYSTICK_FULL = 0.9;

/** A look-side touch becomes a mine touch after staying this still for this long. */
export const HOLD_TO_MINE_MS = 140;
export const HOLD_SLOP_PX = 12;
/** A quick tap mines a single hit: mining stays held this long. */
export const TAP_MINE_MS = 200;

export interface StickOutput {
  /** Movement intent in [-1, 1]; +x right, +y forward (screen up). */
  x: number;
  y: number;
  /** Knob offset from the base center in CSS px, clamped to the radius. */
  knobX: number;
  knobY: number;
}

/**
 * Joystick response for a thumb offset (dx, dy) in screen px from the base center.
 * Radial dead zone, then a linear ramp that reaches 1 slightly before the rim, so the
 * output is continuous everywhere (no jump at the dead-zone edge) and keeps its direction.
 */
export function joystick(dx: number, dy: number, out: StickOutput, radius = JOYSTICK_RADIUS, deadZone = JOYSTICK_DEAD_ZONE): StickOutput {
  const len = Math.hypot(dx, dy);
  const clampScale = len > radius ? radius / len : 1;
  out.knobX = dx * clampScale;
  out.knobY = dy * clampScale;
  const m = len / radius;
  if (m <= deadZone || len === 0) {
    out.x = 0;
    out.y = 0;
    return out;
  }
  const strength = Math.min(1, (m - deadZone) / (JOYSTICK_FULL - deadZone));
  out.x = (dx / len) * strength;
  out.y = (-dy / len) * strength;
  return out;
}

/** Screen point (CSS px) to normalized device coordinates: x -1 left..1 right, y 1 top..-1 bottom. */
export function toNdc(x: number, y: number, width: number, height: number, out: { x: number; y: number }): { x: number; y: number } {
  out.x = width > 0 ? Math.max(-1, Math.min(1, (x / width) * 2 - 1)) : 0;
  out.y = height > 0 ? Math.max(-1, Math.min(1, 1 - (y / height) * 2)) : 0;
  return out;
}

/** Keep a joystick base fully on screen so the knob can travel in every direction. */
export function clampBase(x: number, y: number, width: number, height: number, radius = JOYSTICK_RADIUS): [number, number] {
  const m = radius + 8;
  return [Math.max(m, Math.min(width - m, x)), Math.max(m, Math.min(height - m, y))];
}

/**
 * Which side a touch starts on. The move side is the left half (right half when left-handed).
 */
export function touchSide(x: number, width: number, leftHanded: boolean): 'move' | 'look' {
  const left = x < width * 0.5;
  return left !== leftHanded ? 'move' : 'look';
}

/**
 * Look-side touch lifecycle:
 *   pending  just landed; could still become a camera drag or a hold-to-mine
 *   look     moved beyond the slop first: drags rotate the camera
 *   mine     stayed still for HOLD_TO_MINE_MS: mining at the finger, moves re-aim only
 */
export type LookPhase = 'pending' | 'look' | 'mine';

/**
 * Advance a look touch given its offset from the landing point and the time held.
 * Called on every move and once by the hold timer. A pending touch that is evaluated after
 * the hold time stayed within the slop for the whole window (earlier moves would have
 * turned it into a look), so it becomes a mine touch even if this move is large.
 */
export function advanceLookPhase(phase: LookPhase, dx: number, dy: number, heldMs: number): LookPhase {
  if (phase !== 'pending') return phase;
  if (heldMs >= HOLD_TO_MINE_MS) return 'mine';
  return dx * dx + dy * dy > HOLD_SLOP_PX * HOLD_SLOP_PX ? 'look' : 'pending';
}

/** What lifting a look-side finger does: a tap mines one hit, a mine touch stops mining. */
export function releaseLook(phase: LookPhase): 'tapMine' | 'endMine' | 'none' {
  return phase === 'pending' ? 'tapMine' : phase === 'mine' ? 'endMine' : 'none';
}
