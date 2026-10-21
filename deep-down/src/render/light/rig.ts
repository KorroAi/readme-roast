// The light rig (W1-LEAD §4; owner 1E): the lantern, the practicals, the shadow cubes, the ambient probe, the
// irradiance volume, the reflection probe and the fog, all written into the one shared uniform set of chunk.ts.
//
// Per frame (DepthScene, 1C):
//   rig.update(camera, lantern, lamps, time)     the flame (flicker, wobble), the 8 practicals chosen, shadow cadence
//   renderer.render(scene, camera, time, overlay) the Renderer runs the rig's passes (shadow cubes, probe faces) first
// On events:
//   rig.invalidateShadows()                      a block broke or a static prop moved within the shadow range
//   rig.setAmbient({...}) / setFog({...})        the chamber's biome fill and haze (cross-fades over `seconds`)
//   rig.setIrradiance({ texture, origin, size }) 1B's LightField as the irradiance volume
//   rig.setFill(0.6 → 1)                         first light (SPEC §4.6), a uniform, no propagation
//   rig.captureProbe(centre, box)                once on first light (6 faces over 6 frames, no long task)
//   rig.raise(point)                             the Lantern Raise spot (1.4 s)
// Objects that move every frame (crew rigs, carts, shards, particles) set `userData.noShadow = true`: they never enter
// the shadow cubes, so the cubes stay valid at rest (zero cost) and only refresh when the lantern or the world moves.

import * as THREE from 'three';
import { LIGHT_UNIFORMS, MAX_PRACTICALS, type LightingUniformSet } from './uniforms';
import { FLAME, LANTERN_GAIN, LANTERN_SOFT, flicker, wobble } from './flame';
import { LIGHT_PRESETS, type LightFeatures } from './presets';
import { newSelectState, selectLights, type LightCandidate } from './select';
import { shAddDirectional, shAddHemisphere, shZero, type Rgb, type ShIrradiance } from './sh';
import { CubeShadow } from './shadows';
import { ProbeCapture } from './probe';

export interface LanternInput {
  /** The flame's world position (the viewmodel lantern, held low and left). */
  pos: THREE.Vector3Like;
  /** Core colour, sRGB hex (default #ffe6c6; it deepens to amber #ffb35c with distance). */
  color?: number;
  /** Intensity multiplier (1 = the W1 lantern; the Lantern Raise lift, a dying flame). */
  intensity?: number;
  /** Range in metres (SPEC §8.3: 9 + 0.6 per lantern tier). */
  range?: number;
  on?: boolean;
}

export interface LampInput {
  id: string;
  pos: THREE.Vector3Like;
  /** sRGB hex. */
  color: number;
  /** 0 = cold. A relit lamp passed with intensity > 0 is lit in this frame. */
  intensity: number;
  /** Range in metres (a Halden lamp: about 5). */
  range: number;
  /** May take the second shadow cube (High). */
  shadow?: boolean;
}

export interface AmbientInput {
  /** Irradiance from above and below (sRGB hex × gain): the biome's cool fill. */
  sky: number;
  ground: number;
  gain?: number;
  /** The rim: one per space, the next space's accent from the far opening (direction toward it). */
  rim?: { dir: THREE.Vector3Like; color: number; gain: number } | null;
  /** Extra soft lobes (a sky shaft's bounce): direction toward the light, sRGB hex, gain. */
  lobes?: ReadonlyArray<{ dir: THREE.Vector3Like; color: number; gain: number }>;
  /** How much enclosed spaces (low LightField openness) lose of the fill (0..1). */
  openWeight?: number;
  /** Specular ambient gain (the probe or SH glint). */
  specGain?: number;
}

export interface FogInput {
  /** sRGB hex of the haze (hued, never grey-brown). */
  color: number;
  /** Distance density (1/m). */
  density: number;
  /** Height fog: the pool's base (world y), its falloff (1/m) and its extra density (1/m). */
  heightBase?: number;
  heightFalloff?: number;
  heightDensity?: number;
  /** In-scatter strength of the volumetric pass (1 = physical). */
  scatter?: number;
  /** The phase function's anisotropy (Henyey-Greenstein g, 0..0.6). */
  anisotropy?: number;
}

/**
 * A light shaft: daylight through a roof opening (the Root Cellar), the far light of a Reveal. It lights the surfaces in
 * its cylinder (a directional light, no shadow: place it in open air) and the air along it (the volumetric pass).
 */
export interface ShaftInput {
  /** The top of the axis (the opening), world m. */
  top: THREE.Vector3Like;
  /** The direction the light travels (normalised here), default straight down. */
  dir?: THREE.Vector3Like;
  /** Radius (m) and length (m) of the beam. */
  radius: number;
  length: number;
  /** sRGB hex and intensity (radiance at normal incidence; 1.5–3 reads as daylight against the lantern). */
  color: number;
  intensity: number;
  /** Edge softness, a fraction of the radius (default 0.45). */
  softness?: number;
}

/** 1B's LightField as the irradiance volume: an RGBA8 3D texture over a world box. */
export interface IrradianceSource {
  texture: THREE.Data3DTexture;
  /** World position of texel (0,0,0)'s corner, and the world size the texture spans (m). */
  origin: THREE.Vector3Like;
  size: THREE.Vector3Like;
  /** Decode: rgb = pow(texel, exponent) × gain (the LightField's encoding; defaults 1.55 and 3.6). */
  exponent?: number;
  gain?: number;
}

const lin = (hex: number, k = 1) => new THREE.Color().setHex(hex, THREE.SRGBColorSpace).multiplyScalar(k);
const LUMA = (c: THREE.Color) => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;

export interface RigStats {
  practicals: number;
  /** Draw calls and triangles the shadow cubes and the probe face added to the last frame (0 at rest). */
  passCalls: number;
  passTris: number;
  /** Draw calls and casters of the last lantern-cube render (all six faces). */
  lastShadowCalls: number;
  lastShadowCasters: number;
  shadowRenders: number;
  shadowFaces: number;
  probeFaces: number;
  lastShadowFrame: number;
}

export class LightRig {
  readonly uniforms: LightingUniformSet = LIGHT_UNIFORMS;
  /** The features in force (the Renderer sets them from the preset and the governor's ladder). */
  features: LightFeatures = { ...LIGHT_PRESETS.balanced };
  /** The whole stack off (the "before" captures): lantern unshadowed, no AO, volumetrics, probes. */
  stackOff = false;
  /** Freeze the flame (captures and stillness tests): no flicker, no wobble. */
  flameFrozen = false;
  /** The lantern's soft radius (m) and gain (tuning; the defaults are calibrated in model.ts). */
  lanternSoft = LANTERN_SOFT;
  lanternGain = LANTERN_GAIN;
  /** Fog parameters the volumetric pass reads. */
  readonly fog = { scatter: 1, anisotropy: 0.35 };
  readonly shadowA = new CubeShadow('lantern');
  readonly shadowB = new CubeShadow('practical');
  readonly probe = new ProbeCapture();
  readonly stats: RigStats = { practicals: 0, passCalls: 0, passTris: 0, lastShadowCalls: 0, lastShadowCasters: 0, shadowRenders: 0, shadowFaces: 0, probeFaces: 0, lastShadowFrame: -1 };
  private readonly select = newSelectState();
  private readonly cands: LightCandidate[] = [];
  private readonly lampColor = new THREE.Color();
  private readonly base = new THREE.Vector3();
  private readonly wob = [0, 0, 0];
  private readonly lanternCore = lin(0xffe6c6);
  private time = 0;
  private lastTime = Number.NaN;
  private frame = 0;
  private spotT = 99;
  private readonly spotPos = new THREE.Vector3();
  private fill = 1;
  private shadowBId: string | null = null;
  private readonly lastEye = new THREE.Vector3(1e9, 0, 0);
  private readonly shaftBase = [new THREE.Color(), new THREE.Color()];
  private shaftCount = 0;
  private restFrames = 0;

  /** Per frame: the flame, the practicals, the shadow cadence. `time` in seconds (the FX clock). */
  update(camera: THREE.Camera, lantern: LanternInput, lamps: ReadonlyArray<LampInput>, time = this.time + 1 / 60): void {
    const elapsed = Number.isFinite(this.lastTime) ? Math.max(0, time - this.lastTime) : 0;
    const dt = Math.min(0.25, elapsed);
    this.lastTime = time;
    this.time = time;
    this.frame++;
    const u = this.uniforms;
    const f = this.features;
    // ---- the lantern
    const on = lantern.on !== false;
    this.base.set(lantern.pos.x, lantern.pos.y, lantern.pos.z);
    const fl = this.flameFrozen ? 1 : flicker(time);
    if (this.flameFrozen) this.wob[0] = this.wob[1] = this.wob[2] = 0;
    else wobble(time, this.wob);
    u.uL_Lantern.value.set(this.base.x + this.wob[0], this.base.y + this.wob[1], this.base.z + this.wob[2], on ? 1 : 0);
    u.uL_Wobble.value.set(this.wob[0], this.wob[1], this.wob[2]);
    const core = lantern.color !== undefined ? lin(lantern.color) : this.lanternCore;
    const k = (lantern.intensity ?? 1) * fl * this.lanternGain;
    u.uL_LanternColor.value.set(core.r * k, core.g * k, core.b * k, lantern.range ?? 9);
    u.uL_LanternShape.value.x = this.lanternSoft;
    // ---- the shadow cubes: refresh when the lantern moved or the world changed (at rest: never).
    const shadows = f.shadows && !this.stackOff;
    this.shadowA.configure(shadows, f.shadowRes, f.shadowFar);
    if (shadows) this.shadowA.request(this.base, this.frame, f.shadowEveryFrames);
    u.uL_ShadowAParams.value.set(2 / Math.max(1, f.shadowRes), 0.09, f.shadowTaps, 1.5);
    // ---- practicals
    this.cands.length = 0;
    for (const l of lamps) {
      if (!(l.intensity > 0)) continue;
      this.lampColor.setHex(l.color, THREE.SRGBColorSpace);
      this.cands.push({ id: l.id, x: l.pos.x, y: l.pos.y, z: l.pos.z, power: LUMA(this.lampColor) * l.intensity, range: l.range });
    }
    const eye = camera.getWorldPosition(TMP);
    const max = this.stackOff ? Math.min(4, f.practicals) : f.practicals;
    const chosen = selectLights(this.cands, eye.x, eye.y, eye.z, this.select, dt, Math.min(MAX_PRACTICALS, max));
    // The second shadow (High): the nearest chosen lamp that may cast, refreshed only when it changes.
    let bId: string | null = null;
    if (f.secondShadow && shadows) {
      let best = Infinity;
      for (const e of chosen) {
        const src = lamps.find((l) => l.id === e.c.id);
        if (!src?.shadow) continue;
        const d = Math.hypot(e.c.x - eye.x, e.c.y - eye.y, e.c.z - eye.z);
        if (d < best) {
          best = d;
          bId = e.c.id;
        }
      }
    }
    if (bId !== this.shadowBId) this.shadowB.invalidate();
    this.shadowBId = bId;
    this.shadowB.configure(bId !== null, f.shadowRes, Math.min(10, f.shadowFar));
    const pos = u.uL_PracPos.value;
    const col = u.uL_PracCol.value;
    let n = 0;
    for (const e of chosen) {
      const src = lamps.find((l) => l.id === e.c.id);
      if (!src) continue;
      this.lampColor.setHex(src.color, THREE.SRGBColorSpace).multiplyScalar(src.intensity * e.w);
      pos[n].set(e.c.x, e.c.y, e.c.z, e.c.range);
      const usesB = bId === e.c.id ? 1 : 0;
      col[n].set(this.lampColor.r, this.lampColor.g, this.lampColor.b, usesB);
      // Refreshed when the chosen lamp changes (invalidate above), or at most every 30 frames if it moves.
      if (usesB) this.shadowB.request(TMP2.set(e.c.x, e.c.y, e.c.z), this.frame, 30);
      n++;
    }
    for (let i = n; i < MAX_PRACTICALS; i++) col[i].set(0, 0, 0, 0);
    u.uL_PracCount.value = n;
    this.stats.practicals = n;
    // ---- the Lantern Raise spot: up 0.2 s, hold, out by 1.4 s
    this.spotT += elapsed;
    const sp = this.spotT < 0.2 ? this.spotT / 0.2 : this.spotT < 1.0 ? 1 : Math.max(0, 1 - (this.spotT - 1.0) / 0.4);
    if (sp > 0) {
      u.uL_Spot.value.set(this.spotPos.x, this.spotPos.y, this.spotPos.z, 2.2);
      u.uL_SpotColor.value.copy(this.lanternCore).multiplyScalar(0.55 * sp * fl);
    } else u.uL_Spot.value.w = 0;
    // ---- the reflection probe: captured once per space, on its own when the eye has rested 0.5 s more than 6 m from
    // the last capture (first light, a stand, a drift face), unless the caller captured one explicitly.
    if (this.features.probes && !this.stackOff && !this.probe.pending) {
      const moved = this.lastEye.distanceTo(eye) > 0.002;
      this.lastEye.copy(eye);
      this.restFrames = moved ? 0 : this.restFrames + 1;
      const far = !this.probe.ready || this.probe.centre.distanceTo(eye) > 6;
      if (far && this.restFrames >= 30) this.probe.request(eye, null, this.features.probeRes);
    }
    // ---- frame flags
    u.uL_Frame.value.set(time, this.volumetricOn ? 1 : 0, u.uL_Frame.value.z, this.frame);
    u.uL_ProbeParams.value.x = this.probe.ready && f.probes && !this.stackOff ? 1 : 0;
    u.uL_Ambient.value.x = this.fill;
    // The shafts rise with first light, like the fill (a chamber waits dark); the "before" captures have none.
    u.uL_ShaftCount.value = this.stackOff ? 0 : this.shaftCount;
    const sf = Math.max(0, Math.min(1, (this.fill - 0.6) / 0.4));
    for (let i = 0; i < this.shaftCount; i++) {
      const c = this.shaftBase[i];
      const v = u.uL_ShaftCol.value[i];
      v.set(c.r * sf, c.g * sf, c.b * sf, v.w);
    }
  }

  /** True when the volumetric pass applies the fog this frame (materials then skip their analytic fog). */
  get volumetricOn(): boolean {
    return this.features.volumetric && !this.stackOff;
  }

  get aoOn(): boolean {
    return this.features.ao && !this.stackOff;
  }

  /** A block broke or a static prop changed within the shadow range: refresh the cubes on the next frame. */
  invalidateShadows(): void {
    this.shadowA.invalidate();
    this.shadowB.invalidate();
  }

  /** First light: the chamber's fill 0.6 → 1.0 (SPEC §4.6); 1 elsewhere. */
  setFill(fill: number): void {
    this.fill = Math.max(0, Math.min(1.5, fill));
    this.uniforms.uL_Ambient.value.x = this.fill;
  }

  /** The chamber's biome fill as an L1 SH probe, the rim and the specular ambient. */
  setAmbient(a: AmbientInput): void {
    const g = a.gain ?? 1;
    const sky = lin(a.sky, g);
    const ground = lin(a.ground, g);
    const sh: ShIrradiance = shZero();
    shAddHemisphere(sh, [sky.r, sky.g, sky.b], [ground.r, ground.g, ground.b]);
    for (const l of a.lobes ?? []) {
      const c = lin(l.color, l.gain);
      shAddDirectional(sh, [l.dir.x, l.dir.y, l.dir.z], [c.r, c.g, c.b]);
    }
    this.setSh(sh);
    const u = this.uniforms;
    u.uL_Ambient.value.y = a.openWeight ?? 0.6;
    u.uL_Ambient.value.w = a.specGain ?? 1;
    if (a.rim) {
      const d = TMP.set(a.rim.dir.x, a.rim.dir.y, a.rim.dir.z).normalize();
      u.uL_Rim.value.set(d.x, d.y, d.z, 1);
      u.uL_RimColor.value.copy(lin(a.rim.color, a.rim.gain));
    } else u.uL_Rim.value.w = 0;
  }

  /** Set the SH irradiance coefficients directly (tests, the lab). */
  setSh(sh: ShIrradiance): void {
    const v = this.uniforms.uL_SH.value;
    for (let i = 0; i < 4; i++) v[i].set(sh[i][0], sh[i][1], sh[i][2]);
  }

  /** The haze: hued colour, density, height fog, in-scatter. */
  setFog(f: FogInput): void {
    const u = this.uniforms;
    u.uL_FogColor.value.copy(lin(f.color));
    u.uL_Fog.value.set(f.density, f.heightBase ?? -1e4, f.heightFalloff ?? 0.5, f.heightDensity ?? 0);
    this.fog.scatter = f.scatter ?? 1;
    this.fog.anisotropy = Math.max(0, Math.min(0.6, f.anisotropy ?? 0.35));
  }

  /** 1B's LightField (rgb emitter light, a openness) as the irradiance volume; null = off. */
  setIrradiance(src: IrradianceSource | null): void {
    const u = this.uniforms;
    if (!src) {
      u.uL_Irr.value = null;
      u.uL_IrrParams.value.w = 0;
      return;
    }
    u.uL_Irr.value = src.texture;
    u.uL_IrrOrigin.value.set(src.origin.x, src.origin.y, src.origin.z);
    u.uL_IrrInvSize.value.set(1 / src.size.x, 1 / src.size.y, 1 / src.size.z);
    u.uL_IrrParams.value.set(src.gain ?? 3.6, src.exponent ?? 1.55, 0.5, 1);
  }

  /** The space's light shafts (≤ 2; [] = none). Set per chamber; first light scales them with the fill. */
  setShafts(shafts: ReadonlyArray<ShaftInput>): void {
    const u = this.uniforms;
    const n = Math.min(2, shafts.length);
    for (let i = 0; i < n; i++) {
      const sh = shafts[i];
      const d = TMP.set(sh.dir?.x ?? 0, sh.dir?.y ?? -1, sh.dir?.z ?? 0).normalize();
      u.uL_Shaft.value[i].set(sh.top.x, sh.top.y, sh.top.z, Math.max(0.05, sh.radius));
      u.uL_ShaftDir.value[i].set(d.x, d.y, d.z, Math.max(0.1, sh.length));
      const c = lin(sh.color, sh.intensity);
      u.uL_ShaftCol.value[i].set(c.r, c.g, c.b, sh.softness ?? 0.45);
      this.shaftBase[i].copy(c);
    }
    this.shaftCount = n;
    u.uL_ShaftCount.value = this.stackOff ? 0 : n;
  }

  /** The Lantern Raise: a soft spot of lantern light lands near `point` for 1.4 s. */
  raise(point: THREE.Vector3Like, normal?: THREE.Vector3Like): void {
    this.spotPos.set(point.x, point.y, point.z);
    if (normal) this.spotPos.addScaledVector(TMP.set(normal.x, normal.y, normal.z), 0.8);
    this.spotT = 0;
  }

  /** Capture the chamber's reflection probe (once, on first light): 6 faces over the next 6 frames. */
  captureProbe(centre: THREE.Vector3Like, box?: { min: THREE.Vector3Like; max: THREE.Vector3Like }): void {
    if (!this.features.probes) return;
    this.probe.request(centre, box ?? null, this.features.probeRes);
  }

  /** Forget the probe (leaving a chamber for a drift). */
  clearProbe(): void {
    this.probe.clear();
    this.uniforms.uL_ProbeParams.value.x = 0;
  }

  /** The rig's GPU work before the world pass: dirty shadow cubes, one probe face. The Renderer calls it. */
  renderPasses(gl: THREE.WebGLRenderer, scene: THREE.Scene): void {
    const u = this.uniforms;
    const calls0 = gl.info.render.calls;
    const tris0 = gl.info.render.triangles;
    const facesBefore = this.stats.shadowFaces;
    if (this.shadowA.render(gl, scene)) {
      this.stats.lastShadowCalls = gl.info.render.calls - calls0;
      this.stats.lastShadowCasters = this.shadowA.casters;
      this.stats.shadowRenders++;
      this.stats.shadowFaces += 6;
      this.stats.lastShadowFrame = this.frame;
    }
    if (this.shadowB.render(gl, scene)) {
      this.stats.shadowRenders++;
      this.stats.shadowFaces += 6;
    }
    void facesBefore;
    u.uL_ShadowA.value = this.shadowA.enabled ? this.shadowA.texture : null;
    const pa = this.shadowA.origin;
    u.uL_ShadowAPos.value.set(pa.x, pa.y, pa.z, this.shadowA.enabled && this.shadowA.valid ? this.shadowA.far : 0);
    u.uL_ShadowB.value = this.shadowB.enabled ? this.shadowB.texture : null;
    const pb = this.shadowB.origin;
    u.uL_ShadowBPos.value.set(pb.x, pb.y, pb.z, this.shadowB.enabled && this.shadowB.valid ? this.shadowB.far : 0);
    u.uL_ShadowBParams.value.set(2 / Math.max(1, this.shadowB.res), 0.14, this.features.shadowTaps, 1.5);
    if (this.probe.pending && this.features.probes && !this.stackOff) {
      // The probe sees the world without the lantern (its glints are the direct term's) and with analytic fog.
      const lantern = u.uL_Lantern.value.w;
      const vol = u.uL_Frame.value.y;
      u.uL_Lantern.value.w = 0;
      u.uL_Frame.value.y = 0;
      if (this.probe.renderFace(gl, scene)) this.stats.probeFaces++;
      u.uL_Lantern.value.w = lantern;
      u.uL_Frame.value.y = vol;
    }
    const pr = this.probe;
    if (pr.ready) {
      u.uL_Probe.value = pr.texture;
      u.uL_ProbePos.value.copy(pr.centre);
      u.uL_ProbeParams.value.y = pr.maxMip;
      u.uL_ProbeParams.value.w = pr.boxed ? 1 : 0;
      u.uL_ProbeBoxMin.value.copy(pr.boxMin);
      u.uL_ProbeBoxMax.value.copy(pr.boxMax);
    }
    u.uL_ProbeParams.value.x = pr.ready && this.features.probes && !this.stackOff ? 1 : 0;
    this.stats.passCalls = gl.info.render.calls - calls0;
    this.stats.passTris = gl.info.render.triangles - tris0;
  }

  /** The flame amplitudes (tests). */
  static readonly FLAME = FLAME;

  dispose(): void {
    this.shadowA.dispose();
    this.shadowB.dispose();
    this.probe.dispose();
  }
}

export { LANTERN_GAIN, LANTERN_SOFT };

const TMP = new THREE.Vector3();
const TMP2 = new THREE.Vector3();

export type { Rgb };
