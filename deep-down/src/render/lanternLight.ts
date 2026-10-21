import * as THREE from 'three';
import { hexToLinear } from '../core/math';
import type { LightingUniforms } from './lighting';

/**
 * The lantern's light (ROUND2 §0.5, VIS): what the flame does to the world each frame.
 *
 * - **A gentle flicker**, not a sine: three octaves of smooth value noise (about 2, 5 and 12 Hz)
 *   give a soft breathing of +-4 %, with a rare slow gutter (a dip of ~8 % over half a second when
 *   the slow octave peaks). Below 20 % oil the flame sputters a little more, never a strobe.
 * - **The oil reads in the world**: the pool shrinks as the oil drains (radius 100 % full, about
 *   78 % at a quarter, 68 % near empty) and the flame dims and deepens toward red-amber; an empty
 *   lantern is an ember (the tier's ember radius).
 * - **Lantern upgrades change the light**: the oil lantern is amber, the copper lantern a richer
 *   gold, the attuned lantern a pale gold (with the radius and intensity of config LANTERNS).
 * - `flame` (0..~1.1) is the size of the flame for the lantern model (FP): fuel times flicker.
 *
 * Shadows stay soft: the line-of-sight volume (world/light.ts LanternField) widens their edges
 * with distance, and the light's position is smoothed by the caller, so walking never shimmers.
 */

export interface LanternLightInput {
  dt: number;
  time: number;
  /** Fuel left, 0..1. */
  fuel: number;
  lit: boolean;
  /** Equipped lantern tier (1..3). */
  tier: number;
  /** The tier's radius (m) and intensity (config LANTERNS). */
  radius: number;
  intensity: number;
  /** Radius factor once the oil is gone (the tier's ember). */
  ember: number;
  /** Title screen: always a full, calm flame. */
  menu?: boolean;
  /** 0..1 while the lantern is raised to look (FP): the flame opens up a little. */
  raised?: number;
  /**
   * The flame's own flicker (fp/flame.ts lanternFlicker), so the drawn flame and its light breathe
   * together. Without it the light uses its own noise flicker.
   */
  flicker?: number;
}

/** sRGB colour of each tier's flame (index tier - 1). */
// Round 2: a touch more gold than the old amber 0xffb878, so lantern-lit wood and stone read warm, not
// one saturated orange (the camp and the workbench were monochrome orange).
const TIER_COLOR = [0xffc28a, 0xffca94, 0xffd9ac] as const;
/** Deep red-amber the flame leans toward as the oil runs out. */
const LOW_COLOR = 0xff9a5c;
/** The rig's base lantern gain (lighting.ts LightingRig: hexToLinear(0xffb878) x 1.1). */
const BASE_GAIN = 1.1;

function hashF(i: number): number {
  const s = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

/** Smooth 1-D value noise in 0..1. */
function noise1(t: number): number {
  const i = Math.floor(t);
  const f = t - i;
  const u = f * f * (3 - 2 * f);
  return hashF(i) * (1 - u) + hashF(i + 1) * u;
}

export class LanternLight {
  /** Current light multiplier from the flicker (around 1). */
  flicker = 1;
  /** Size of the flame for the model: fuel x flicker (0.25 as an ember). */
  flame = 1;
  /** The radius written this frame (m). */
  radius = 11;
  private readonly color = new THREE.Color();
  private readonly tmp = new THREE.Color();
  private shownFuel = -1;

  /** Compute the light for this frame and write uLanternRadius, uLanternIntensity, uLanternColor. */
  update(u: LightingUniforms, inp: LanternLightInput): number {
    const t = inp.time;
    const menu = !!inp.menu;
    // The pool follows the oil smoothly (a refill swells it back over ~0.4 s, no pop).
    const fuel = menu ? 1 : Math.max(0, Math.min(1, inp.fuel));
    this.shownFuel = this.shownFuel < 0 ? fuel : this.shownFuel + (fuel - this.shownFuel) * Math.min(1, inp.dt * 5);
    const f = this.shownFuel;
    const lit = menu || inp.lit;
    // Flicker: three octaves of smooth noise, a rare gutter, more sputter when low.
    const n = noise1(t * 2.1) * 0.55 + noise1(t * 5.3 + 17) * 0.3 + noise1(t * 11.7 + 41) * 0.15;
    const slow = noise1(t * 0.45 + 7);
    const gutter = Math.max(0, slow - 0.82) / 0.18;
    const low = lit && !menu && f < 0.2 ? (0.2 - f) / 0.2 : 0;
    const sputter = low > 0 ? (noise1(t * 9.5 + 3) - 0.5) * 0.16 * low : 0;
    this.flicker = inp.flicker ?? 1 + (n - 0.5) * 0.08 - gutter * gutter * 0.08 + sputter;
    // The oil: the pool shrinks and dims as it drains (an ember when out).
    const fuelRadius = 0.66 + 0.34 * Math.sqrt(f);
    const fuelGain = 0.72 + 0.28 * Math.sqrt(f);
    const raised = Math.max(0, Math.min(1, inp.raised ?? 0));
    const radius = inp.radius * (lit ? fuelRadius * (1 + 0.08 * raised) : inp.ember);
    const intensity = inp.intensity * (lit ? fuelGain * (1 + 0.06 * raised) : 0.45) * this.flicker;
    this.radius = radius;
    this.flame = lit ? (0.62 + 0.38 * Math.sqrt(f)) * this.flicker : 0.25;
    // Colour: the tier's flame, deepening toward red-amber below a third of the oil.
    const tier = Math.max(1, Math.min(TIER_COLOR.length, Math.round(inp.tier)));
    const c = hexToLinear(TIER_COLOR[tier - 1]);
    this.color.setRGB(c[0], c[1], c[2]);
    const deep = lit ? Math.max(0, (0.33 - f) / 0.33) * 0.6 : 0.8;
    if (deep > 0) {
      const l = hexToLinear(LOW_COLOR);
      this.color.lerp(this.tmp.setRGB(l[0], l[1], l[2]), deep);
    }
    this.color.multiplyScalar(BASE_GAIN);
    u.uLanternRadius.value = radius;
    u.uLanternIntensity.value = intensity;
    u.uLanternColor.value.copy(this.color);
    return radius;
  }
}
