/**
 * Round 3 (UI): the action layout's abilities, pure and unit-tested: the dash (a short dodge with
 * invulnerability frames and a cooldown), the sonar (the lantern pulse on a cooldown, and the scan
 * of the finds it reveals through rock) and the vein combo (chaining blocks of the same vein speeds
 * the pick up). No Three.js, no DOM.
 */
import { COMBO_MAX, COMBO_REACH, COMBO_STEP, COMBO_WINDOW, DASH_COOLDOWN, DASH_IFRAMES, MINE_TEMPO, SONAR_COOLDOWN } from './constants';

/** A cooldown: `fire()` succeeds when ready and starts the wait; `fraction` is 1 just fired, 0 ready. */
export class Cooldown {
  left = 0;
  constructor(readonly period: number) {}

  get ready(): boolean {
    return this.left <= 0;
  }

  get fraction(): number {
    return this.period > 0 ? Math.max(0, Math.min(1, this.left / this.period)) : 0;
  }

  tick(dt: number): void {
    if (this.left > 0) this.left = Math.max(0, this.left - Math.max(0, dt));
  }

  fire(): boolean {
    if (!this.ready) return false;
    this.left = this.period;
    return true;
  }

  reset(): void {
    this.left = 0;
  }
}

/** The dash: invulnerable for DASH_IFRAMES after it starts, then DASH_COOLDOWN before the next. */
export class DashAbility {
  readonly cooldown = new Cooldown(DASH_COOLDOWN);
  /** Seconds of invulnerability left (Game exposes it as `invulnerable`). */
  iframes = 0;

  update(dt: number): void {
    this.cooldown.tick(dt);
    if (this.iframes > 0) this.iframes = Math.max(0, this.iframes - Math.max(0, dt));
  }

  /** @returns true when the dash goes (the caller moves the body). */
  tryDash(): boolean {
    if (!this.cooldown.fire()) return false;
    this.iframes = DASH_IFRAMES;
    return true;
  }

  reset(): void {
    this.cooldown.reset();
    this.iframes = 0;
  }
}

/**
 * The world direction of a dash for a stick input (camera-relative, +y forward) and the camera's
 * yaw (forward = (-sin, -cos)): along the stick, or straight back when the stick rests (a dodge
 * away from what is in front).
 */
export function dashDirection(moveX: number, moveY: number, camYaw: number, out: { x: number; z: number }): { x: number; z: number } {
  let mx = moveX;
  let my = moveY;
  if (Math.hypot(mx, my) < 0.2) {
    mx = 0;
    my = -1;
  }
  const fx = -Math.sin(camYaw);
  const fz = -Math.cos(camYaw);
  const rx = Math.cos(camYaw);
  const rz = -Math.sin(camYaw);
  const x = fx * my + rx * mx;
  const z = fz * my + rz * mx;
  const l = Math.hypot(x, z) || 1;
  out.x = x / l;
  out.z = z / l;
  return out;
}

/** The sonar pulse's cooldown (the reveal itself is VIS's: HighlightSystem.reveal, SonarPulse.ping). */
export class SonarAbility {
  readonly cooldown = new Cooldown(SONAR_COOLDOWN);
  pulses = 0;

  update(dt: number): void {
    this.cooldown.tick(dt);
  }

  tryPulse(): boolean {
    if (!this.cooldown.fire()) return false;
    this.pulses++;
    return true;
  }
}

/** A voxel reader (VoxelWorld.get). */
export interface VoxelReader {
  get(x: number, y: number, z: number): number;
}

/**
 * The cells the sonar reveals: every block within `radius` of the origin that `isFind` accepts
 * (ores, gems, crystals, chests), nearest first, at most `max`. A sphere scan of whole cells.
 */
export function sonarScan(world: VoxelReader, ox: number, oy: number, oz: number, radius: number, isFind: (id: number) => boolean, max = 900): Array<[number, number, number]> {
  const r = Math.max(0, radius);
  const r2 = r * r;
  const x0 = Math.floor(ox - r);
  const x1 = Math.floor(ox + r);
  const y0 = Math.floor(oy - r);
  const y1 = Math.floor(oy + r);
  const z0 = Math.floor(oz - r);
  const z1 = Math.floor(oz + r);
  const found: Array<{ c: [number, number, number]; d: number }> = [];
  for (let z = z0; z <= z1; z++) {
    const dz = z + 0.5 - oz;
    for (let y = y0; y <= y1; y++) {
      const dy = y + 0.5 - oy;
      const dyz = dy * dy + dz * dz;
      if (dyz > r2) continue;
      for (let x = x0; x <= x1; x++) {
        const dx = x + 0.5 - ox;
        const d = dx * dx + dyz;
        if (d > r2) continue;
        if (isFind(world.get(x, y, z))) found.push({ c: [x, y, z], d });
      }
    }
  }
  found.sort((a, b) => a.d - b.d);
  if (found.length > max) found.length = max;
  return found.map((f) => f.c);
}

/**
 * The vein combo: a block of the same kind broken within COMBO_WINDOW seconds and COMBO_REACH m of
 * the last one chains (up to COMBO_MAX); each link makes the next swing COMBO_STEP faster.
 */
export class VeinCombo {
  count = 0;
  private kind = -1;
  private at = -Infinity;
  private x = 0;
  private y = 0;
  private z = 0;

  /** A block broke at time `t`: @returns the combo count after it (0 = no chain). */
  onBreak(kind: number, x: number, y: number, z: number, t: number): number {
    const chained = kind === this.kind && t - this.at <= COMBO_WINDOW && Math.hypot(x - this.x, y - this.y, z - this.z) <= COMBO_REACH;
    this.count = chained ? Math.min(COMBO_MAX, this.count + 1) : 0;
    this.kind = kind;
    this.at = t;
    this.x = x;
    this.y = y;
    this.z = z;
    return this.count;
  }

  /** The live combo at time `t` (it lapses after the window). */
  live(t: number): number {
    return t - this.at <= COMBO_WINDOW ? this.count : 0;
  }

  /** The swing interval multiplier at time `t`: the base tempo, faster with each live link. */
  tempo(t: number): number {
    return MINE_TEMPO / (1 + COMBO_STEP * this.live(t));
  }

  reset(): void {
    this.count = 0;
    this.kind = -1;
    this.at = -Infinity;
  }
}
