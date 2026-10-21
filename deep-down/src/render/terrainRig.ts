import * as THREE from 'three';
import { Rng } from '../core/rng';
import { MATERIAL_INFO, MATERIAL_NAMES, generateMaterials, type MaterialAtlas } from './materials';

/**
 * GPU data for the terrain material system (see terrainMaterial.ts):
 *
 *   uMat       seamless material layers (sRGB + height/emissive alpha), sampled in world space
 *   uNoise     32^3 RGBA tiling noise for sculpting, boundary wobble and macro variation
 *   uTarget    the block being mined (crack stage and highlight are drawn in the terrain
 *              shader so they follow the sculpted surface exactly); uTargetHit the point the
 *              mining ray strikes (w = 0: unknown, the shader takes the line of sight)
 *
 * Material layers are linear-filtered with mipmaps and 2x anisotropy: the shader snaps its
 * samples to the texel grid ("sharp bilinear", terrainMaterial.ts), so texels keep crisp pixel
 * edges at reading distance without nearest sampling's shimmer and staircase up close.
 *
 * Material boundaries need each face's in-plane neighbours; the mesher bakes those into the
 * vertex data, so no world-sized volume is needed here.
 */

export interface TerrainUniforms {
  [name: string]: THREE.IUniform;
  uMat: THREE.IUniform<THREE.DataArrayTexture>;
  uNoise: THREE.IUniform<THREE.Data3DTexture>;
  uMatGlow: THREE.IUniform<number[]>;
  uTarget: THREE.IUniform<THREE.Vector4>;
  uTargetFx: THREE.IUniform<THREE.Vector4>;
  uTargetHit: THREE.IUniform<THREE.Vector4>;
  /** Rarity highlights (render/highlight.ts): HI_SIZE^3 R8 volume of cell codes around the eye. */
  uHiTex: THREE.IUniform<THREE.Data3DTexture>;
  /** xyz: the volume's origin cell, w: 1 when the volume is live. */
  uHiOrigin: THREE.IUniform<THREE.Vector4>;
  /** xyz: the selected cell, w: its code (2..6 = common..legendary, 0 = nothing selected). */
  uHiSel: THREE.IUniform<THREE.Vector4>;
  /** x: time (s), y: selection strength 0..1, z: selection blocked (too hard), w: ambient strength. */
  uHiFx: THREE.IUniform<THREE.Vector4>;
  /** Linear rarity colours, common..legendary. */
  uHiCol: THREE.IUniform<THREE.Vector3[]>;
  /**
   * x: half the lens' vertical focal factor (projection[1][1] / 2): x / depth is the share of the
   * screen height a 1 m feature spans there, so outlines can stay off cells that fill the view.
   */
  uHiView: THREE.IUniform<THREE.Vector4>;
}

/** Edge of the highlight volume in cells (render/highlight.ts writes it). */
export const HI_SIZE = 32;

export const NOISE_SIZE = 32;

export class TerrainRig {
  readonly uniforms: TerrainUniforms;
  readonly materialTex: THREE.DataArrayTexture;
  readonly noiseTex: THREE.Data3DTexture;

  constructor(atlas: MaterialAtlas = generateMaterials()) {
    const m = new THREE.DataArrayTexture(atlas.data, atlas.size, atlas.size, atlas.layers);
    m.format = THREE.RGBAFormat;
    m.type = THREE.UnsignedByteType;
    m.colorSpace = THREE.SRGBColorSpace;
    m.magFilter = THREE.LinearFilter;
    m.minFilter = THREE.LinearMipmapLinearFilter;
    // Grazing floors keep their texture a little further (clamped to what the GPU supports). 2x:
    // anisotropic taps cost real bandwidth on mobile GPUs, unlike bilinear.
    m.anisotropy = 2;
    m.wrapS = m.wrapT = THREE.RepeatWrapping;
    m.generateMipmaps = true;
    m.unpackAlignment = 1;
    m.needsUpdate = true;
    this.materialTex = m;
    this.noiseTex = makeNoise3D();
    this.uniforms = {
      uMat: { value: m },
      uNoise: { value: this.noiseTex },
      uMatGlow: { value: MATERIAL_NAMES.map((n) => MATERIAL_INFO[n].glow) },
      uTarget: { value: new THREE.Vector4(-9999, -9999, -9999, -1) },
      uTargetFx: { value: new THREE.Vector4(0, 0, 0, 0) },
      uTargetHit: { value: new THREE.Vector4(0, 0, 0, 0) },
      uHiTex: { value: makeHighlightVolume() },
      uHiOrigin: { value: new THREE.Vector4(0, 0, 0, 0) },
      uHiSel: { value: new THREE.Vector4(-9999, -9999, -9999, 0) },
      uHiFx: { value: new THREE.Vector4(0, 0, 0, 1) },
      uHiCol: { value: [0, 1, 2, 3, 4].map(() => new THREE.Vector3()) },
      uHiView: { value: new THREE.Vector4(0.62, 0, 0, 0) },
    };
  }

  /**
   * Mining feedback drawn by the terrain shader. `crackLayer` < 0 hides the cracks. `hit`: where
   * the mining ray strikes the block, if known (the highlight and the fractures centre on it).
   */
  setTarget(cell: { x: number; y: number; z: number } | null, crackLayer: number, flash: number, active: boolean, blocked: boolean, hit: { x: number; y: number; z: number } | null = null): void {
    const t = this.uniforms.uTarget.value;
    if (!cell) t.set(-9999, -9999, -9999, -1);
    else t.set(cell.x, cell.y, cell.z, crackLayer);
    this.uniforms.uTargetFx.value.set(flash, active ? 1 : 0, blocked ? 1 : 0, 0);
    if (cell && hit) this.uniforms.uTargetHit.value.set(hit.x, hit.y, hit.z, 1);
    else this.uniforms.uTargetHit.value.set(0, 0, 0, 0);
  }

  dispose(): void {
    this.materialTex.dispose();
    this.noiseTex.dispose();
    this.uniforms.uHiTex.value.dispose();
  }
}

/** The rarity highlight volume: one byte per cell (0 air, 1 plain solid, 2..6 a rarity), nearest. */
function makeHighlightVolume(): THREE.Data3DTexture {
  const n = HI_SIZE;
  const t = new THREE.Data3DTexture(new Uint8Array(n * n * n), n, n, n);
  t.format = THREE.RedFormat;
  t.type = THREE.UnsignedByteType;
  t.minFilter = t.magFilter = THREE.NearestFilter;
  t.wrapS = t.wrapT = t.wrapR = THREE.ClampToEdgeWrapping;
  t.generateMipmaps = false;
  t.unpackAlignment = 1;
  t.needsUpdate = true;
  return t;
}

/** 32^3 RGBA random lattice; trilinear filtering + REPEAT turns it into smooth tiling value noise. */
function makeNoise3D(): THREE.Data3DTexture {
  const n = NOISE_SIZE;
  const data = new Uint8Array(n * n * n * 4);
  const rng = new Rng(424242);
  for (let i = 0; i < data.length; i++) data[i] = Math.floor(rng.next() * 256);
  const t = new THREE.Data3DTexture(data, n, n, n);
  t.format = THREE.RGBAFormat;
  t.type = THREE.UnsignedByteType;
  t.minFilter = t.magFilter = THREE.LinearFilter;
  t.wrapS = t.wrapT = t.wrapR = THREE.RepeatWrapping;
  t.generateMipmaps = false;
  t.unpackAlignment = 1;
  t.needsUpdate = true;
  return t;
}
