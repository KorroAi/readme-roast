// Pure math and state rules behind the touch controls. No DOM, unit tested in Node.

/** Floating joystick base radius in CSS px; the knob is clamped to it. */
export const JOYSTICK_RADIUS = 60;
/** Fraction of the radius that produces no movement (thumb rest jitter). */
export const JOYSTICK_DEAD_ZONE = 0.12;
/** Deflection (fraction of the radius) that already means full speed, so the edge is not a wall. */
export const JOYSTICK_FULL = 0.9;

/**
 * A look-side touch becomes a mine touch after staying this still for this long. Long enough
 * that a thumb resting before a camera drag does not start mining (the Mine button is the
 * main way to mine on a phone; holding on a block aims at that exact block).
 */
export const HOLD_TO_MINE_MS = 230;
export const HOLD_SLOP_PX = 14;
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

/**
 * Joystick radius for a screen: about 15 % of its short side, so the stick feels the same on a
 * small phone and a large one (54-72 px). Tablets keep the large-phone size.
 */
export function joystickRadiusFor(width: number, height: number): number {
  return Math.round(Math.max(54, Math.min(72, Math.min(width, height) * 0.15)));
}

/** How far the thumb may go past the rim before the base follows it (fraction of the radius). */
export const JOYSTICK_FOLLOW = 1.2;

/**
 * Floating joystick that follows the thumb: when the thumb travels beyond JOYSTICK_FOLLOW x the
 * radius, the base slides after it so the stick is never "lost" and reversing is instant.
 * @returns the new base position.
 */
export function followBase(baseX: number, baseY: number, x: number, y: number, radius: number): [number, number] {
  const dx = x - baseX;
  const dy = y - baseY;
  const len = Math.hypot(dx, dy);
  const max = radius * JOYSTICK_FOLLOW;
  if (len <= max) return [baseX, baseY];
  const k = (len - max) / len;
  return [baseX + dx * k, baseY + dy * k];
}

/** Keep a joystick base fully on screen so the knob can travel in every direction. */
export function clampBase(x: number, y: number, width: number, height: number, radius = JOYSTICK_RADIUS): [number, number] {
  const m = radius + 8;
  return [Math.max(m, Math.min(width - m, x)), Math.max(m, Math.min(height - m, y))];
}

/**
 * Which kind of touch starts at a point. The optional joystick lives in the outer third of the
 * screen on the move side (left; right when left-handed), in its lower part (from
 * PORTRAIT_STICK_TOP of the height upright, LANDSCAPE_STICK_TOP on a wide screen); everywhere else
 * a touch looks, taps or holds. (A quick tap in the joystick zone still counts as a world tap.)
 */
export function touchSide(x: number, width: number, leftHanded: boolean, y?: number, height?: number): 'move' | 'look' {
  const inThird = leftHanded ? x > width * (1 - STICK_ZONE) : x < width * STICK_ZONE;
  if (!inThird) return 'look';
  if (y !== undefined && height !== undefined) {
    const top = height > width ? PORTRAIT_STICK_TOP : LANDSCAPE_STICK_TOP;
    if (y < height * top) return 'look';
  }
  return 'move';
}

/** The joystick zone: this share of the width on the move side ... */
export const STICK_ZONE = 1 / 3;
/** ... from this far down the screen (fraction of the height) upright, and on a wide screen. */
export const PORTRAIT_STICK_TOP = 0.5;
export const LANDSCAPE_STICK_TOP = 0.3;

/** A touch released within this time, without moving past the slop, is a tap. */
export const TAP_MAX_MS = 300;

/** A quick, still press: a tap (tap to mine / walk / use), wherever it lands. */
export function isTap(durationMs: number, maxOffsetPx: number): boolean {
  return durationMs <= TAP_MAX_MS && maxOffsetPx <= HOLD_SLOP_PX;
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

/**
 * What a touch may do from where it lands (gate 03:32: a drag that started on the biome arrival card
 * never looked, a dead zone over the upper view for the card's seconds): on a control ('own': a
 * button, a field, a screen) it is the control's; on a notice card ('card': the arrival card, a
 * milestone card, the tutorial's bubble) a drag still looks while its tap and hold stay the card's;
 * anywhere else it is the world's (look, tap, hold to mine).
 */
export function touchStart(onOwn: boolean, onCard: boolean): 'own' | 'card' | 'world' {
  if (onCard) return 'card';
  return onOwn ? 'own' : 'world';
}

/** advanceLookPhase for a touch that may have started on a card: a card's touch never mines by holding. */
export function advanceTouchPhase(phase: LookPhase, dx: number, dy: number, heldMs: number, card: boolean): LookPhase {
  return advanceLookPhase(phase, dx, dy, card ? 0 : heldMs);
}

/** releaseLook for a touch that may have started on a card: a card's tap is its own (its click), never the world's. */
export function releaseTouch(phase: LookPhase, card: boolean): 'tapMine' | 'endMine' | 'none' {
  const a = releaseLook(phase);
  return card && a === 'tapMine' ? 'none' : a;
}
