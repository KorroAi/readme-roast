import * as THREE from 'three';
import { Rng } from '../core/rng';
import { MATERIAL_INFO, MATERIAL_NAMES, generateMaterials, type MaterialAtlas } from './materials';

/**
 * GPU data for the terrain material system (see terrainMaterial.ts):
 *
 *   uMat       seamless material layers (sRGB + height/emissive alpha), sampled in world space
 *   uNoise     32^3 RGBA tiling noise for sculpting, boundary wobble and macro variation
 *   uTarget    the block being mined (crack stage and highlight are drawn in the terrain
 *              shader so they follow the sculpted surface exactly)
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
}

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
    m.magFilter = THREE.NearestFilter;
    m.minFilter = THREE.NearestMipmapLinearFilter;
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
    };
  }

  /** Mining feedback drawn by the terrain shader. `crackLayer` < 0 hides the cracks. */
  setTarget(cell: { x: number; y: number; z: number } | null, crackLayer: number, flash: number, active: boolean, blocked: boolean): void {
    const t = this.uniforms.uTarget.value;
    if (!cell) t.set(-9999, -9999, -9999, -1);
    else t.set(cell.x, cell.y, cell.z, crackLayer);
    this.uniforms.uTargetFx.value.set(flash, active ? 1 : 0, blocked ? 1 : 0, 0);
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
