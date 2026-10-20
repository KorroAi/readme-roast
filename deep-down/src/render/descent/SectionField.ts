import * as THREE from 'three';
import { SOLID } from '../../config/blocks';
import { RING_SX, RING_SY, RingWorld } from '../../world/descent/RingWorld';

/** The cut plane's voxel layer (the section faces are their +z faces, at z = 60). */
const CUT_LAYER = 59;
const MAX_CELLS = 16;

/**
 * SectionField (SPEC §11.4, W1 version): for every voxel of the cut plane, the distance in cells to the
 * nearest open voxel of the cut (a chamfer transform over the 64 x 160 ring, recomputed whole when the cut
 * changes: about 20k steps), uploaded as an R8 ring texture. The section shader turns it into the depth key:
 * rock near the shaft and caverns glows, the mass between them goes dark.
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
    const D = Math.SQRT2;
    // Two passes of the 3x3 chamfer (y wraps: the ring is continuous through the live window).
    for (let pass = 0; pass < 2; pass++) {
      for (let y = 0; y < sy; y++) {
        const ym = (y + sy - 1) % sy;
        for (let x = 0; x < sx; x++) {
          const i = x + y * sx;
          let v = d[i];
          if (x > 0) v = Math.min(v, d[i - 1] + 1, d[x - 1 + ym * sx] + D);
          v = Math.min(v, d[x + ym * sx] + 1);
          if (x < sx - 1) v = Math.min(v, d[x + 1 + ym * sx] + D);
          d[i] = v;
        }
      }
      for (let y = sy - 1; y >= 0; y--) {
        const yp = (y + 1) % sy;
        for (let x = sx - 1; x >= 0; x--) {
          const i = x + y * sx;
          let v = d[i];
          if (x < sx - 1) v = Math.min(v, d[i + 1] + 1, d[x + 1 + yp * sx] + D);
          v = Math.min(v, d[x + yp * sx] + 1);
          if (x > 0) v = Math.min(v, d[x - 1 + yp * sx] + D);
          d[i] = v;
        }
      }
    }
    for (let i = 0; i < d.length; i++) this.data[i] = Math.min(255, Math.round((d[i] * 255) / MAX_CELLS));
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
