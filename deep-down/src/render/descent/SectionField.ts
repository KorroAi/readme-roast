import * as THREE from 'three';
import { SOLID } from '../../config/blocks';
import { RING_SX, RING_SY, RingWorld } from '../../world/descent/RingWorld';

/** The cut plane's voxel layer (the section faces are their +z faces, at z = 60). */
export const CUT_LAYER = 59;
const MAX_CELLS = 16;

/**
 * SectionField (SPEC §11.4): for every voxel of the cut plane, the distance in cells to the nearest open voxel
 * of the cut (a 3 x 3 chamfer transform, weights 1 and √2, capped at 16 cells, over the 64 x 160 ring), uploaded
 * as an R8 ring texture. The section shader turns it into the depth key: rock near the shaft and caverns glows,
 * the mass between them goes dark. A streamed slab or a repaint recomputes it whole (about 40k steps); a break
 * only opens cells, so distances only fall and `open` relaxes the box within 16 cells of them (W2: the
 * incremental transform equals a full one; tests/unit/idle/sectionField.test.ts).
 */
export class SectionField {
  readonly texture: THREE.DataTexture;
  private readonly data = new Uint8Array(RING_SX * RING_SY);
  private readonly dist = new Float32Array(RING_SX * RING_SY);
  private dirty = true;

  constructor(private readonly ring: RingWorld) {
    this.texture = new THREE.DataTexture(this.data, RING_SX, RING_SY, THREE.RedFormat, THREE.UnsignedByteType);
    this.texture.minFilter = this.texture.magFilter = THREE.LinearFilter;
    this.texture.wrapS = THREE.ClampToEdgeWrapping;
    this.texture.wrapT = THREE.RepeatWrapping;
    this.texture.unpackAlignment = 1;
    this.texture.generateMipmaps = false;
    this.texture.needsUpdate = true;
  }

  markDirty(): void {
    this.dirty = true;
  }

  /** Recompute if the cut changed (call once per frame). */
  update(): void {
    if (!this.dirty) return;
    this.dirty = false;
    const d = this.dist;
    const b = this.ring.blocks;
    const sx = RING_SX;
    const sy = RING_SY;
    for (let y = 0; y < sy; y++)
      for (let x = 0; x < sx; x++) d[x + y * sx] = SOLID[b[x + sx * (y + sy * CUT_LAYER)]] ? MAX_CELLS : 0;
    // Two rounds (y wraps: the ring is continuous through the live window).
    this.relax(0, sx - 1, 0, sy, 2);
    this.write(0, sy);
  }

  /** Recomputes since boot (whole) and incremental opens, for tests and the debug panel. */
  full = 0;
  partial = 0;

  /**
   * Cut voxels `[x, storage row]` turned to air (a break). Distances only fall and the new ones reach at most
   * 16 cells, so the two chamfer passes over the box within 16 cells of them give the same field as a full
   * transform (cells outside keep their exact distance; paths have no obstacles, so 2 raster passes are exact).
   */
  open(cells: ReadonlyArray<readonly [number, number]>): void {
    if (!cells.length) return;
    if (this.dirty) return this.update();
    const sx = RING_SX;
    const sy = RING_SY;
    let x0 = sx;
    let x1 = -1;
    // Rows as offsets from the first cell (wrapping); the box spans [lo, hi].
    const base = cells[0][1];
    let lo = 0;
    let hi = 0;
    for (const [x, y] of cells) {
      x0 = Math.min(x0, x);
      x1 = Math.max(x1, x);
      let o = (((y - base) % sy) + sy) % sy;
      if (o > sy / 2) o -= sy;
      lo = Math.min(lo, o);
      hi = Math.max(hi, o);
      this.dist[x + (((y % sy) + sy) % sy) * sx] = 0;
    }
    const m = MAX_CELLS + 1;
    const h = hi - lo + 1 + 2 * m;
    if (h >= sy) {
      this.dirty = true;
      return this.update();
    }
    const y0 = (((base + lo - m) % sy) + sy) % sy;
    this.relax(Math.max(0, x0 - m), Math.min(sx - 1, x1 + m), y0, h, 1);
    this.write(y0, h);
    this.partial++;
  }

  /** `rounds` of the forward and backward 3 x 3 chamfer passes over columns x0..x1 and `h` rows from y0 (wrapping). */
  private relax(x0: number, x1: number, y0: number, h: number, rounds: number): void {
    const d = this.dist;
    const sx = RING_SX;
    const sy = RING_SY;
    const D = Math.SQRT2;
    const whole = h >= sy;
    if (whole) this.full++;
    for (let pass = 0; pass < rounds; pass++) {
      for (let j = 0; j < h; j++) {
        const y = (y0 + j) % sy;
        // The row above the box (or the wrapped one) holds exact values the new seeds cannot lower.
        const ym = (y + sy - 1) % sy;
        for (let x = x0; x <= x1; x++) {
          const i = x + y * sx;
          let v = d[i];
          if (x > 0) v = Math.min(v, d[i - 1] + 1, d[x - 1 + ym * sx] + D);
          v = Math.min(v, d[x + ym * sx] + 1);
          if (x < sx - 1) v = Math.min(v, d[x + 1 + ym * sx] + D);
          d[i] = v;
        }
      }
      for (let j = h - 1; j >= 0; j--) {
        const y = (y0 + j) % sy;
        const yp = (y + 1) % sy;
        for (let x = x1; x >= x0; x--) {
          const i = x + y * sx;
          let v = d[i];
          if (x < sx - 1) v = Math.min(v, d[i + 1] + 1, d[x + 1 + yp * sx] + D);
          v = Math.min(v, d[x + yp * sx] + 1);
          if (x > 0) v = Math.min(v, d[x - 1 + yp * sx] + D);
          d[i] = v;
        }
      }
    }
  }

  private write(y0: number, h: number): void {
    const sx = RING_SX;
    const sy = RING_SY;
    for (let j = 0; j < Math.min(h, sy); j++) {
      const y = (y0 + j) % sy;
      for (let x = 0; x < sx; x++) {
        const i = x + y * sx;
        this.data[i] = Math.min(255, Math.round((this.dist[i] * 255) / MAX_CELLS));
      }
    }
    this.texture.needsUpdate = true;
  }

  /** Distance (cells) at a cut voxel, for tests. */
  at(x: number, y: number): number {
    const sy = ((y % RING_SY) + RING_SY) % RING_SY;
    return this.dist[x + sy * RING_SX];
  }

  dispose(): void {
    this.texture.dispose();
  }
}
