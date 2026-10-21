// The shared uniform set of the light chunk (owner 1E): one module singleton, so materials created before the Renderer
// still bind to the objects the LightRig writes. Split from chunk.ts so the rig and the chunk import it without a cycle.

import * as THREE from 'three';

/** Most practicals evaluated per pixel per frame (W1-LEAD §4.6); the rest stay baked into the LightField. */
export const MAX_PRACTICALS = 8;

/** The uniform set every lit material spreads into its own uniforms (shared objects: one write lights every material). */
export interface LightingUniformSet {
  [name: string]: THREE.IUniform;
  /** xyz the flame this frame (with its 2–4 cm wobble), w 1 = on. */
  uL_Lantern: THREE.IUniform<THREE.Vector4>;
  /** rgb linear colour × intensity × flicker (core), w range (m). */
  uL_LanternColor: THREE.IUniform<THREE.Vector4>;
  /** x soft radius (m) of the inverse-square, y tank shade (0..1), z specular cap, w amber shift distance (m). */
  uL_LanternShape: THREE.IUniform<THREE.Vector4>;
  /** The amber the core deepens to with distance (linear, luminance-normalised in the shader). */
  uL_LanternDeep: THREE.IUniform<THREE.Color>;
  uL_ShadowA: THREE.IUniform<THREE.Texture | null>;
  /** The lantern cube's render origin (xyz) and far (w; 0 = no shadow). */
  uL_ShadowAPos: THREE.IUniform<THREE.Vector4>;
  /** x texel angle (2 / resolution), y light size (m), z PCF taps (8 or 16), w normal-offset scale (texels). */
  uL_ShadowAParams: THREE.IUniform<THREE.Vector4>;
  /** The flame wobble (xyz, m) applied to the shadow lookups so shadows breathe without a re-render. */
  uL_Wobble: THREE.IUniform<THREE.Vector3>;
  uL_ShadowB: THREE.IUniform<THREE.Texture | null>;
  uL_ShadowBPos: THREE.IUniform<THREE.Vector4>;
  uL_ShadowBParams: THREE.IUniform<THREE.Vector4>;
  /** Practicals: xyz, w range (m). */
  uL_PracPos: THREE.IUniform<THREE.Vector4[]>;
  /** rgb linear × intensity, w 1 = this one uses shadow B. */
  uL_PracCol: THREE.IUniform<THREE.Vector4[]>;
  uL_PracCount: THREE.IUniform<number>;
  /** Lantern Raise spot: xyz, w radius (0 = off); colour × intensity in uL_SpotColor. */
  uL_Spot: THREE.IUniform<THREE.Vector4>;
  uL_SpotColor: THREE.IUniform<THREE.Color>;
  /** The irradiance volume (1B's LightField: rgb emitter light, a openness). */
  uL_Irr: THREE.IUniform<THREE.Data3DTexture | null>;
  uL_IrrOrigin: THREE.IUniform<THREE.Vector3>;
  uL_IrrInvSize: THREE.IUniform<THREE.Vector3>;
  /** x gain, y decode exponent, z normal offset (m), w 1 = on. */
  uL_IrrParams: THREE.IUniform<THREE.Vector4>;
  /** The ambient probe (L1 SH as irradiance: E(n) = c0 + c1 n.x + c2 n.y + c3 n.z). */
  uL_SH: THREE.IUniform<THREE.Vector3[]>;
  /** x first-light fill (0.6 → 1), y openness weight, z unused, w specular ambient gain. */
  uL_Ambient: THREE.IUniform<THREE.Vector4>;
  /** The rim (one per space, SPEC §8.3): xyz direction toward the far light, w 1 = on. */
  uL_Rim: THREE.IUniform<THREE.Vector4>;
  uL_RimColor: THREE.IUniform<THREE.Color>;
  /** The chamber's reflection probe (captured once on first light). */
  uL_Probe: THREE.IUniform<THREE.Texture | null>;
  /** x 1 = on, y max mip, z intensity, w 1 = box-projected. */
  uL_ProbeParams: THREE.IUniform<THREE.Vector4>;
  uL_ProbePos: THREE.IUniform<THREE.Vector3>;
  uL_ProbeBoxMin: THREE.IUniform<THREE.Vector3>;
  uL_ProbeBoxMax: THREE.IUniform<THREE.Vector3>;
  /** Light shafts (a sky shaft through a roof opening, the Reveal's far light): up to 2. xyz the top of the axis, w radius. */
  uL_Shaft: THREE.IUniform<THREE.Vector4[]>;
  /** xyz the unit direction the light travels, w the length of the shaft (m). */
  uL_ShaftDir: THREE.IUniform<THREE.Vector4[]>;
  /** rgb linear radiance at normal incidence, w edge softness (0..1 of the radius). */
  uL_ShaftCol: THREE.IUniform<THREE.Vector4[]>;
  uL_ShaftCount: THREE.IUniform<number>;
  /** Hued fog colour (linear). */
  uL_FogColor: THREE.IUniform<THREE.Color>;
  /** x density (1/m), y height-fog base (world y), z height falloff (1/m), w height-fog density (1/m). */
  uL_Fog: THREE.IUniform<THREE.Vector4>;
  /** x time (s), y 1 = the volumetric pass applies the fog (materials skip theirs), z debug view, w frame index. */
  uL_Frame: THREE.IUniform<THREE.Vector4>;
  /** Shared with lighting.ts: 1 = the 8-bit fallback encoding. */
  uSceneEncode: THREE.IUniform<number>;
}

/**
 * How lit materials write the scene target (one object, set by PostFX): 0 = linear HDR (half-float target); 1 = the 8-bit
 * fallback, where colours are stored as sqrt(x / (1 + x)) so values above 1 survive the clamp. The post chain decodes it.
 */
export const SCENE_ENCODE: THREE.IUniform<number> = { value: 0 };

/** The luminance of the hued dark floor added before the tone map: AgX maps it to ≈ 0.045 display (tonemap.ts). */
export const DARK_LIFT = 0.008;

const v4 = (x = 0, y = 0, z = 0, w = 0) => ({ value: new THREE.Vector4(x, y, z, w) });
const lin = (hex: number) => new THREE.Color().setHex(hex, THREE.SRGBColorSpace);

/** The one shared uniform set (module singleton: materials created before the Renderer still bind to it). */
const SHARED: LightingUniformSet = {
  uL_Lantern: v4(0, 0, 0, 0),
  uL_LanternColor: v4(0, 0, 0, 9),
  uL_LanternShape: v4(1.1, 0.85, 2.5, 2.6),
  uL_LanternDeep: { value: lin(0xffb35c) },
  uL_ShadowA: { value: null },
  uL_ShadowAPos: v4(0, 0, 0, 0),
  uL_ShadowAParams: v4(2 / 256, 0.09, 8, 1.5),
  uL_Wobble: { value: new THREE.Vector3() },
  uL_ShadowB: { value: null },
  uL_ShadowBPos: v4(0, 0, 0, 0),
  uL_ShadowBParams: v4(2 / 256, 0.12, 8, 1.5),
  uL_PracPos: { value: Array.from({ length: MAX_PRACTICALS }, () => new THREE.Vector4()) },
  uL_PracCol: { value: Array.from({ length: MAX_PRACTICALS }, () => new THREE.Vector4()) },
  uL_PracCount: { value: 0 },
  uL_Spot: v4(0, 0, 0, 0),
  uL_SpotColor: { value: new THREE.Color(0, 0, 0) },
  uL_Irr: { value: null },
  uL_IrrOrigin: { value: new THREE.Vector3() },
  uL_IrrInvSize: { value: new THREE.Vector3(1, 1, 1) },
  uL_IrrParams: v4(3.6, 1.55, 0.5, 0),
  uL_SH: { value: [new THREE.Vector3(0.02, 0.025, 0.03), new THREE.Vector3(), new THREE.Vector3(0.008, 0.01, 0.012), new THREE.Vector3()] },
  uL_Ambient: v4(1, 0.6, 0, 1),
  uL_Rim: v4(0, 0, -1, 0),
  uL_RimColor: { value: new THREE.Color(0, 0, 0) },
  uL_Probe: { value: null },
  uL_ProbeParams: v4(0, 6, 1, 0),
  uL_ProbePos: { value: new THREE.Vector3() },
  uL_ProbeBoxMin: { value: new THREE.Vector3(-1e4, -1e4, -1e4) },
  uL_ProbeBoxMax: { value: new THREE.Vector3(1e4, 1e4, 1e4) },
  uL_Shaft: { value: [new THREE.Vector4(), new THREE.Vector4()] },
  uL_ShaftDir: { value: [new THREE.Vector4(0, -1, 0, 0), new THREE.Vector4(0, -1, 0, 0)] },
  uL_ShaftCol: { value: [new THREE.Vector4(), new THREE.Vector4()] },
  uL_ShaftCount: { value: 0 },
  uL_FogColor: { value: lin(0x101418) },
  uL_Fog: v4(0.035, -1e4, 0.5, 0),
  uL_Frame: v4(0, 0, 0, 0),
  uSceneEncode: SCENE_ENCODE,
};

/**
 * The shared lighting uniforms, to spread into a material's uniforms: `{ ...lightingUniforms(), ...own }`. Every call
 * returns the same IUniform objects (a new outer object), so the LightRig's writes reach every material.
 */
export function lightingUniforms(): LightingUniformSet {
  return { ...SHARED };
}

/** The singleton itself (the rig and the passes write it). */
export const LIGHT_UNIFORMS: LightingUniformSet = SHARED;

