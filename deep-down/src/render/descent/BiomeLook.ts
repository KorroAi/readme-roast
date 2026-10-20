import * as THREE from 'three';
import { BIOME_LOOKS, LOOK_BLEND_ROWS, type BiomeLookDef } from '../../idle/config/biomeLooks';
import { baseBiome, biomeAt, biomeStart, echoNumber } from '../../idle/config/biomes';
import { hexToLinear } from '../../core/math';

/** The look values the renderer consumes, in linear colour (blended between two biomes). */
export interface LookMix {
  accent: THREE.Color;
  accent2: THREE.Color;
  fog: THREE.Color;
  fogLow: THREE.Color;
  open: THREE.Color;
  deepTint: THREE.Color;
  exposure: number;
  bloomThreshold: number;
  bloomStrength: number;
  saturation: number;
  /** Biome index at the camera depth and the blend toward the next one (0..1). */
  biome: number;
  next: number;
  blend: number;
}

const lin = (hex: number, out: THREE.Color) => out.setRGB(...hexToLinear(hex));

/** Look of biome index k (Echo strata: the base look, hue rotated +37 deg x n, exposure and bloom ramps). */
function lookOf(k: number): BiomeLookDef {
  const base = BIOME_LOOKS[Math.min(BIOME_LOOKS.length - 1, baseBiome(k))];
  const n = echoNumber(k);
  if (!n) return base;
  return {
    ...base,
    exposure: Math.min(3, base.exposure + 0.05 * n),
    bloomThreshold: base.bloomThreshold - 0.02 * n,
    bloomStrength: Math.min(1, base.bloomStrength + 0.05 * n),
    saturation: base.saturation + 0.03 * n,
    accent: rotateHue(base.accent, 37 * n),
    accent2: rotateHue(base.accent2, 37 * n),
  };
}

function rotateHue(hex: number, deg: number): number {
  const c = new THREE.Color(hex);
  const hsl = { h: 0, s: 0, l: 0 };
  c.getHSL(hsl);
  c.setHSL((hsl.h + deg / 360) % 1, hsl.s, hsl.l);
  return c.getHex();
}

/**
 * Blends the two biome looks nearest the camera depth (SPEC §11.2): a look holds inside its biome and
 * crosses to the next over the 40 rows around the boundary, eased in time over 1.6 s so a jump never pops.
 */
export class BiomeLook {
  readonly mix: LookMix = {
    accent: new THREE.Color(), accent2: new THREE.Color(), fog: new THREE.Color(), fogLow: new THREE.Color(), open: new THREE.Color(), deepTint: new THREE.Color(),
    exposure: 2, bloomThreshold: 1, bloomStrength: 0.5, saturation: 1, biome: 0, next: 0, blend: 0,
  };
  /** Forced biome (the Biome Lab), -1 = by depth. */
  forced = -1;
  private target = 0;
  private shown = -1;
  private readonly a = new THREE.Color();
  private readonly b = new THREE.Color();

  /** @param dt 0 snaps (boot, jumps). */
  update(depth: number, dt: number): LookMix {
    let k = this.forced >= 0 ? this.forced : biomeAt(Math.max(0, depth));
    let next = k + 1;
    let t = 0;
    if (this.forced < 0) {
      const s = biomeStart(k + 1);
      const p = biomeStart(k);
      const half = LOOK_BLEND_ROWS / 2;
      if (s - depth < half) t = 0.5 * (1 - (s - depth) / half);
      else if (depth - p < half && k > 0) {
        // Past the boundary: finish the blend from the previous biome.
        next = k;
        k = k - 1;
        t = 0.5 + 0.5 * ((depth - p) / half);
      }
    }
    // A continuous position along the ladder, eased in time.
    const pos = k + t;
    if (this.shown < 0 || dt <= 0 || Math.abs(pos - this.shown) > 1.5) this.shown = pos;
    else this.shown += (pos - this.shown) * (1 - Math.exp(-dt / 0.55));
    this.target = pos;
    const k0 = Math.floor(this.shown);
    const f = this.shown - k0;
    const L0 = lookOf(Math.max(0, k0));
    const L1 = lookOf(Math.max(0, k0 + 1));
    const m = this.mix;
    const c = (h0: number, h1: number, out: THREE.Color) => out.copy(lin(h0, this.a)).lerp(lin(h1, this.b), f);
    c(L0.accent, L1.accent, m.accent);
    c(L0.accent2, L1.accent2, m.accent2);
    c(L0.fog, L1.fog, m.fog);
    c(L0.fogLow, L1.fogLow, m.fogLow);
    c(L0.open, L1.open, m.open);
    c(L0.deepTint, L1.deepTint, m.deepTint);
    m.exposure = L0.exposure + (L1.exposure - L0.exposure) * f;
    m.bloomThreshold = L0.bloomThreshold + (L1.bloomThreshold - L0.bloomThreshold) * f;
    m.bloomStrength = L0.bloomStrength + (L1.bloomStrength - L0.bloomStrength) * f;
    m.saturation = L0.saturation + (L1.saturation - L0.saturation) * f;
    m.biome = Math.max(0, k0);
    m.next = Math.max(0, k0 + 1);
    m.blend = f;
    void next;
    return m;
  }

  get position(): number {
    return this.target;
  }
}
