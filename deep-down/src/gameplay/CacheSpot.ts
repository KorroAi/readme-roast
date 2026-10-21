import { CACHE } from '../config/balance';

/** The walking fields the spot is checked against (world/analysis/homeField). */
export interface SpotFields {
  /** The cell an explorer with feet at (x, y, z) stands in, or null. */
  cellAt(x: number, y: number, z: number): [number, number, number] | null;
  /** On the walkable set from the camp spawn (the pack can be walked to). */
  reachable(x: number, y: number, z: number): boolean;
  /** Walking steps home from the cell, or -1 when there is no walk home (a pit). */
  homeSteps(x: number, y: number, z: number): number;
}

/**
 * Where a black-out leaves the pack: the last cell the explorer stood on, grounded for at least
 * CACHE.groundedSeconds without a break, that can be walked to from camp and walked home from.
 * A fall never counts (the explorer is airborne), nor does the cell it ends on when the landing
 * is fatal (no time passes on the ground), so a chasm fall leaves the pack at the brink.
 */
export class CacheSpot {
  cell: [number, number, number] | null = null;
  private groundedFor = 0;

  update(dt: number, grounded: boolean, x: number, y: number, z: number, fields: SpotFields): void {
    if (!grounded) {
      this.groundedFor = 0;
      return;
    }
    this.groundedFor += dt > 0 ? dt : 0;
    if (this.groundedFor < CACHE.groundedSeconds) return;
    const c = fields.cellAt(x, y, z);
    if (!c) return;
    if (fields.reachable(c[0], c[1], c[2]) && fields.homeSteps(c[0], c[1], c[2]) >= 0) this.cell = c;
  }

  /**
   * Where the pack goes for a black-out with the explorer's feet at (x, y, z): the last safe
   * cell, else the nearest cell within `radius` that can be walked to and walked home from,
   * else null (the caller falls back to the camp).
   */
  place(x: number, y: number, z: number, fields: SpotFields, radius = 8): [number, number, number] | null {
    if (this.cell) return [...this.cell];
    const cx = Math.floor(x);
    const cy = Math.floor(y + 0.2);
    const cz = Math.floor(z);
    for (let r = 0; r <= radius; r++)
      for (let dy = -r; dy <= r; dy++)
        for (let dz = -r; dz <= r; dz++)
          for (let dx = -r; dx <= r; dx++) {
            if (Math.max(Math.abs(dx), Math.abs(dy), Math.abs(dz)) !== r) continue;
            const px = cx + dx;
            const py = cy + dy;
            const pz = cz + dz;
            if (fields.reachable(px, py, pz) && fields.homeSteps(px, py, pz) >= 0) return [px, py, pz];
          }
    return null;
  }

  reset(): void {
    this.cell = null;
    this.groundedFor = 0;
  }
}

/**
 * Round 2: plain rock no longer breaks, and a survivable fall (4-12 m, any height with the Grip
 * Boots and the Miner's Coat) can end on a ledge or a chasm floor with no walk home, which the
 * walk model of world/analysis/traps (drops of 3 m) never visits. Armed by a landing from higher
 * than a walk drops; once the explorer has stood CACHE.pitSeconds off the walk-home field (a fresh
 * one), update() returns true and the caller lifts them back to the last safe cell.
 */
export class PitWatch {
  private t = -1;

  arm(): void {
    this.t = 0;
  }

  disarm(): void {
    this.t = -1;
  }

  update(dt: number, grounded: boolean, onHomeField: boolean, fieldFresh: boolean): boolean {
    if (this.t < 0) return false;
    if (onHomeField) {
      this.t = -1;
      return false;
    }
    if (!grounded || !fieldFresh) return false;
    this.t += dt > 0 ? dt : 0;
    if (this.t < CACHE.pitSeconds) return false;
    this.t = -1;
    return true;
  }
}
