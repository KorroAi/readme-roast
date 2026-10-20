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
  /** Per layer: 0 rock, 1 ore, 2 rich, 3 gem or chest (glints, the shine sweep, the pulse). */
  uMatValue: THREE.IUniform<number[]>;
  /** The descent's section path (SPEC §11.2): on (x), the floor's top world y (y), the camera x (z). */
  uSection: THREE.IUniform<THREE.Vector4>;
  uSectionKey: THREE.IUniform<THREE.Color>;
  uRimColor: THREE.IUniform<THREE.Color>;
  uCamFill: THREE.IUniform<THREE.Color>;
  uDeepTint: THREE.IUniform<THREE.Color>;
  /** 64 x 160 R8 ring: distance (cells x 16) from each cut-plane voxel to the nearest open one. */
  uSectionField: THREE.IUniform<THREE.Texture>;
  /** Up to 8 hit cells: x, world y of the cell's bottom, flash 0..1, crack 0..1. */
  uCellFx: THREE.IUniform<THREE.Vector4[]>;
  /** Their face pops (8 values: 1 = the full pop, scale 1.08). */
  uCellPop: THREE.IUniform<THREE.Vector4[]>;
  /** Transient impact lights (CRITIQUE B14): position + radius, colour + intensity. */
  uImpactPos: THREE.IUniform<THREE.Vector4[]>;
  uImpactCol: THREE.IUniform<THREE.Vector4[]>;
}

export const NOISE_SIZE = 32;

const DUMMY_FIELD = (() => {
  const t = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
  t.needsUpdate = true;
  return t;
})();

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
      uMatValue: { value: new Array(MATERIAL_NAMES.length).fill(0) },
      uSection: { value: new THREE.Vector4(0, 0, 0, 0) },
      uSectionKey: { value: new THREE.Color(0.3, 0.32, 0.36) },
      uRimColor: { value: new THREE.Color(1, 0.7, 0.36) },
      uCamFill: { value: new THREE.Color(0.06, 0.07, 0.08) },
      uDeepTint: { value: new THREE.Color(0.01, 0.01, 0.012) },
      uSectionField: { value: DUMMY_FIELD },
      uCellFx: { value: Array.from({ length: 8 }, () => new THREE.Vector4(-999, -999, 0, 0)) },
      uCellPop: { value: [new THREE.Vector4(), new THREE.Vector4()] },
      uImpactPos: { value: Array.from({ length: 4 }, () => new THREE.Vector4(0, 0, 0, 0)) },
      uImpactCol: { value: Array.from({ length: 4 }, () => new THREE.Vector4(0, 0, 0, 0)) },
    };
  }

  /** Mark material layers as valuables (ore 1, rich 2, gem 3). */
  setValues(values: ArrayLike<number>): void {
    const v = this.uniforms.uMatValue.value;
    for (let i = 0; i < v.length; i++) v[i] = values[i] ?? 0;
  }

  dispose(): void {
    this.materialTex.dispose();
    this.noiseTex.dispose();
  }
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
