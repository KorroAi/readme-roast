import * as THREE from 'three';
import type { LightField, LanternField, Box3i } from '../world/light';
import { LanternField as LanternFieldClass } from '../world/light';
import { hexToLinear } from '../core/math';

/**
 * The shared lighting rig. Every lit material in the game (terrain, character, props,
 * drops, debris) samples the same two volumes, so a crystal tints the explorer exactly as
 * it tints the rock beside them:
 *
 *   uLightTex   world-sized RGBA8 3D texture: colored emitter light + openness (A)
 *   uLanternTex 32^3 R8 3D texture: line-of-sight visibility of the player's lantern
 *
 * The lantern itself is the only dynamic light. Its falloff is computed per pixel from its
 * exact position, so it moves smoothly while the visibility volume prevents leaks.
 */

export interface LightingUniforms {
  [name: string]: THREE.IUniform;
  uLightTex: THREE.IUniform<THREE.Data3DTexture>;
  uLanternTex: THREE.IUniform<THREE.Data3DTexture>;
  uWorldSize: THREE.IUniform<THREE.Vector3>;
  uLanternOrigin: THREE.IUniform<THREE.Vector3>;
  uLanternPos: THREE.IUniform<THREE.Vector3>;
  uLanternColor: THREE.IUniform<THREE.Color>;
  uLanternRadius: THREE.IUniform<number>;
  uLanternIntensity: THREE.IUniform<number>;
  uAmbient: THREE.IUniform<THREE.Color>;
  uOpenAmbient: THREE.IUniform<THREE.Color>;
  uEmitGain: THREE.IUniform<number>;
  uFogColor: THREE.IUniform<THREE.Color>;
  uFogDensity: THREE.IUniform<number>;
  uTime: THREE.IUniform<number>;
  uDebug: THREE.IUniform<THREE.Vector3>;
}

export const LIGHTING_GLSL = /* glsl */ `
uniform highp sampler3D uLightTex;
uniform highp sampler3D uLanternTex;
uniform vec3 uWorldSize;
uniform vec3 uLanternOrigin;
uniform vec3 uLanternPos;
uniform vec3 uLanternColor;
uniform float uLanternRadius;
uniform float uLanternIntensity;
uniform vec3 uAmbient;
uniform vec3 uOpenAmbient;
uniform float uEmitGain;
uniform vec3 uFogColor;
uniform float uFogDensity;
uniform float uTime;
uniform vec3 uDebug; // x: fullbright amount, y: clip height (discard above), z: unused

// Emitter light + ambient at a sample point that lies in open space next to the surface.
vec3 worldLight(vec3 samplePos) {
  vec4 l = texture(uLightTex, samplePos / uWorldSize);
  vec3 emit = pow(l.rgb, vec3(1.35)) * uEmitGain;
  float open = l.a;
  return uAmbient + uOpenAmbient * (open * open) + emit;
}

float lanternVisibility(vec3 samplePos) {
  return texture(uLanternTex, (samplePos - uLanternOrigin) * (1.0 / 32.0)).r;
}

// Warm lantern light with a hot core, smooth edge and wrapped diffuse so voxels keep shape.
vec3 lanternLight(vec3 samplePos, vec3 fragPos, vec3 n) {
  vec3 d = uLanternPos - fragPos;
  float dist = length(d);
  float x = clamp(dist / uLanternRadius, 0.0, 1.0);
  float att = (1.0 - x * x);
  att *= att;
  att *= 1.0 + 0.9 / (1.0 + dist * dist * 0.35);
  float ndl = dot(n, d / max(dist, 1e-3));
  float wrap = clamp(ndl * 0.7 + 0.3, 0.0, 1.0);
  return uLanternColor * (uLanternIntensity * att * wrap * lanternVisibility(samplePos));
}

float fogFactor(float depth) {
  float f = depth * uFogDensity;
  return 1.0 - exp(-f * f * 0.6 - f * 0.4);
}

float hash13(vec3 p) {
  p = fract(p * 0.1031);
  p += dot(p, p.zyx + 31.32);
  return fract((p.x + p.y) * p.z);
}
`;

export class LightingRig {
  readonly uniforms: LightingUniforms;
  readonly lightTex: THREE.Data3DTexture;
  readonly lanternTex: THREE.Data3DTexture;
  private readonly field: LightField;
  private readonly sx: number;
  private readonly sy: number;
  private readonly sz: number;
  private pending: Box3i | null = null;

  constructor(field: LightField, lantern: LanternField, sx: number, sy: number, sz: number) {
    this.field = field;
    this.sx = sx;
    this.sy = sy;
    this.sz = sz;
    this.lightTex = new THREE.Data3DTexture(field.data, sx, sy, sz);
    this.lightTex.format = THREE.RGBAFormat;
    this.lightTex.type = THREE.UnsignedByteType;
    this.lightTex.minFilter = THREE.LinearFilter;
    this.lightTex.magFilter = THREE.LinearFilter;
    this.lightTex.wrapS = this.lightTex.wrapT = this.lightTex.wrapR = THREE.ClampToEdgeWrapping;
    this.lightTex.unpackAlignment = 1;
    this.lightTex.generateMipmaps = false;
    this.lightTex.needsUpdate = true;

    const L = LanternFieldClass.SIZE;
    this.lanternTex = new THREE.Data3DTexture(lantern.data, L, L, L);
    this.lanternTex.format = THREE.RedFormat;
    this.lanternTex.type = THREE.UnsignedByteType;
    this.lanternTex.minFilter = THREE.LinearFilter;
    this.lanternTex.magFilter = THREE.LinearFilter;
    this.lanternTex.wrapS = this.lanternTex.wrapT = this.lanternTex.wrapR = THREE.ClampToEdgeWrapping;
    this.lanternTex.unpackAlignment = 1;
    this.lanternTex.generateMipmaps = false;
    this.lanternTex.needsUpdate = true;

    this.uniforms = {
      uLightTex: { value: this.lightTex },
      uLanternTex: { value: this.lanternTex },
      uWorldSize: { value: new THREE.Vector3(sx, sy, sz) },
      uLanternOrigin: { value: new THREE.Vector3() },
      uLanternPos: { value: new THREE.Vector3() },
      uLanternColor: { value: new THREE.Color().setRGB(...hexToLinear(0xffd2a6)).multiplyScalar(1.6) },
      uLanternRadius: { value: 11 },
      uLanternIntensity: { value: 1 },
      uAmbient: { value: new THREE.Color().setRGB(...hexToLinear(0x0b1220)).multiplyScalar(0.55) },
      uOpenAmbient: { value: new THREE.Color().setRGB(...hexToLinear(0x2a4a6e)).multiplyScalar(1.0) },
      uEmitGain: { value: 2.6 },
      uFogColor: { value: new THREE.Color().setRGB(...hexToLinear(0x12263a)) },
      uFogDensity: { value: 0.02 },
      uTime: { value: 0 },
      uDebug: { value: new THREE.Vector3(0, 9999, 0) },
    };
  }

  /** Queue a sub-region of the world light texture for upload. */
  markLightDirty(box: Box3i): void {
    if (box.x1 < box.x0) return;
    if (!this.pending) {
      this.pending = { ...box };
      return;
    }
    const p = this.pending;
    p.x0 = Math.min(p.x0, box.x0);
    p.y0 = Math.min(p.y0, box.y0);
    p.z0 = Math.min(p.z0, box.z0);
    p.x1 = Math.max(p.x1, box.x1);
    p.y1 = Math.max(p.y1, box.y1);
    p.z1 = Math.max(p.z1, box.z1);
  }

  /** Mark the whole lantern volume for re-upload (it is tiny: 32 KB). */
  markLanternDirty(origin: THREE.Vector3Like): void {
    this.uniforms.uLanternOrigin.value.set(origin.x, origin.y, origin.z);
    this.lanternTex.needsUpdate = true;
  }

  /**
   * Upload pending light changes with texSubImage3D so mining a block never re-uploads the
   * whole world volume. Falls back to a full upload if the texture is not on the GPU yet.
   */
  flush(renderer: THREE.WebGLRenderer): void {
    const box = this.pending;
    if (!box) return;
    this.pending = null;
    const props = renderer.properties.get(this.lightTex) as { __webglTexture?: WebGLTexture };
    const glTex = props.__webglTexture;
    if (!glTex || this.lightTex.version === 0) {
      this.lightTex.needsUpdate = true;
      return;
    }
    const gl = renderer.getContext() as WebGL2RenderingContext;
    const state = renderer.state;
    const x0 = Math.max(0, box.x0);
    const y0 = Math.max(0, box.y0);
    const z0 = Math.max(0, box.z0);
    const w = Math.min(this.sx - 1, box.x1) - x0 + 1;
    const h = Math.min(this.sy - 1, box.y1) - y0 + 1;
    const d = Math.min(this.sz - 1, box.z1) - z0 + 1;
    if (w <= 0 || h <= 0 || d <= 0) return;
    state.activeTexture(gl.TEXTURE0);
    state.bindTexture(gl.TEXTURE_3D, glTex);
    state.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    state.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    state.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    state.pixelStorei(gl.UNPACK_ROW_LENGTH, this.sx);
    state.pixelStorei(gl.UNPACK_IMAGE_HEIGHT, this.sy);
    state.pixelStorei(gl.UNPACK_SKIP_PIXELS, x0);
    state.pixelStorei(gl.UNPACK_SKIP_ROWS, y0);
    state.pixelStorei(gl.UNPACK_SKIP_IMAGES, z0);
    gl.texSubImage3D(gl.TEXTURE_3D, 0, x0, y0, z0, w, h, d, gl.RGBA, gl.UNSIGNED_BYTE, this.field.data);
    state.pixelStorei(gl.UNPACK_ROW_LENGTH, 0);
    state.pixelStorei(gl.UNPACK_IMAGE_HEIGHT, 0);
    state.pixelStorei(gl.UNPACK_SKIP_PIXELS, 0);
    state.pixelStorei(gl.UNPACK_SKIP_ROWS, 0);
    state.pixelStorei(gl.UNPACK_SKIP_IMAGES, 0);
    state.unbindTexture();
  }

  dispose(): void {
    this.lightTex.dispose();
    this.lanternTex.dispose();
  }
}
