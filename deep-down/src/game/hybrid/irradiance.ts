// 1B's LightField (the voxel light of the ring: rgb emitted light, a openness) as 1E's irradiance volume (W1-LEAD §4.3,
// §5: "the voxel LightField becomes an irradiance volume, sampled trilinearly with a normal offset"): one RGBA8 3D
// texture over the 64 × 96 × 64 m ring window, the y axis wrapping like the ring's storage rows, and the light rows the
// world changed uploaded once a frame (the whole texture only on a prime). Glue between the shell's DeepWorld and the
// scene's IrradianceSource; no light is computed here.

import * as THREE from 'three';
import type { IrradianceSource } from '../../render/light/rig';
import { RING_SX, RING_SY, RING_SZ, VOXEL } from '../../world/hybrid/grid';

export class IrradianceVolume {
  readonly texture: THREE.Data3DTexture;
  readonly source: IrradianceSource;
  /** Frames that uploaded light rows (tests and the perf surface). */
  uploads = 0;

  constructor(data: Uint8Array) {
    const t = new THREE.Data3DTexture(data, RING_SX, RING_SY, RING_SZ);
    t.format = THREE.RGBAFormat;
    t.type = THREE.UnsignedByteType;
    t.minFilter = THREE.LinearFilter;
    t.magFilter = THREE.LinearFilter;
    t.wrapS = THREE.ClampToEdgeWrapping;
    // The ring wraps in y: world y → storage row (y / 0.5) mod RING_SY, so the texture repeats in y.
    t.wrapT = THREE.RepeatWrapping;
    t.wrapR = THREE.ClampToEdgeWrapping;
    t.unpackAlignment = 1;
    t.generateMipmaps = false;
    t.needsUpdate = true;
    this.texture = t;
    this.source = {
      texture: t,
      origin: { x: 0, y: 0, z: 0 },
      size: { x: RING_SX * VOXEL, y: RING_SY * VOXEL, z: RING_SZ * VOXEL },
    };
  }

  /**
   * Upload what the world changed: the whole texture after a prime ('all'), or only the dirty storage rows: one
   * texSubImage3D per contiguous run of rows, addressing the rows inside the full array through the unpack row length,
   * image height and skip rows (no copy). Falls back to a whole upload when the GL texture is not live yet.
   */
  apply(rows: Uint8Array | 'all' | null, gl?: THREE.WebGLRenderer): void {
    if (!rows) return;
    this.uploads++;
    const props = gl ? (gl.properties.get(this.texture) as { __webglTexture?: WebGLTexture; __version?: number }) : null;
    const handle = props?.__webglTexture;
    if (rows === 'all' || !gl || !handle || this.texture.version === 0 || props?.__version !== this.texture.version) {
      this.texture.needsUpdate = true;
      return;
    }
    const ctx = gl.getContext() as WebGL2RenderingContext;
    const data = this.texture.image.data as Uint8Array;
    gl.state.activeTexture(ctx.TEXTURE0 + 15);
    gl.state.bindTexture(ctx.TEXTURE_3D, handle);
    ctx.pixelStorei(ctx.UNPACK_ALIGNMENT, 1);
    ctx.pixelStorei(ctx.UNPACK_ROW_LENGTH, RING_SX);
    ctx.pixelStorei(ctx.UNPACK_IMAGE_HEIGHT, RING_SY);
    for (let r = 0; r < RING_SY; ) {
      if (!rows[r]) {
        r++;
        continue;
      }
      let e = r;
      while (e < RING_SY && rows[e]) e++;
      ctx.pixelStorei(ctx.UNPACK_SKIP_ROWS, r);
      ctx.texSubImage3D(ctx.TEXTURE_3D, 0, 0, r, 0, RING_SX, e - r, RING_SZ, ctx.RGBA, ctx.UNSIGNED_BYTE, data);
      r = e;
    }
    ctx.pixelStorei(ctx.UNPACK_SKIP_ROWS, 0);
    ctx.pixelStorei(ctx.UNPACK_ROW_LENGTH, 0);
    ctx.pixelStorei(ctx.UNPACK_IMAGE_HEIGHT, 0);
    gl.state.bindTexture(ctx.TEXTURE_3D, null as unknown as WebGLTexture);
  }

  dispose(): void {
    this.texture.dispose();
  }
}
