// The master cue table, W1 rows (SPEC §10.3): what each moment plays, on every channel, inside its tier's caps.
// Particle counts are Balanced (High ×1.6, Battery ×0.4, applied by JuiceBudget). Pure data, read by JuiceDirector.

import type { HapticKind } from '../../ui/haptics';
import type { Tier } from './juiceBudget';

export interface Cue {
  tier: Tier;
  /** Hit-stop ms (granted only under the rules of §10.9). */
  stop?: number;
  /** Trauma added. */
  trauma?: number;
  /** Cell flash 0..1 (the terrain shader's uCellFx) and face pop (1 = the 1.08 pop; crits 1.75 = 1.14). */
  flash?: number;
  pop?: number;
  /** A bloom pulse: +strength over ms. */
  bloom?: readonly [number, number];
  /** A full-screen flash (intensity, decay ms). */
  full?: readonly [number, number];
  /** World particles: dust, sparks, glints (the scene's bursts). */
  dust?: number;
  sparks?: number;
  glints?: number;
  /** FX-canvas sparks at the UI point. */
  fxSparks?: number;
  haptic?: HapticKind;
}

export const CUES = {
  tap: { tier: 1, flash: 0.6, pop: 1, dust: 4, sparks: 2, haptic: 'tap' },
  crit: { tier: 2, stop: 30, trauma: 0.25, flash: 0.9, pop: 1.75, bloom: [0.15, 100], dust: 4, sparks: 10, glints: 4, haptic: 'crit' },
  break: { tier: 2, trauma: 0.18, dust: 16, sparks: 6, haptic: 'break' },
  ore: { tier: 2, stop: 30, trauma: 0.2, bloom: [0.2, 120], dust: 16, sparks: 8, glints: 10, haptic: 'ore' },
  gem: { tier: 2, stop: 40, trauma: 0.22, bloom: [0.25, 150], dust: 16, sparks: 8, glints: 18, haptic: 'gem' },
  pierce: { tier: 2, trauma: 0.04, dust: 6, sparks: 4 },
  column: { tier: 3, stop: 30, trauma: 0.3, bloom: [0.2, 150], dust: 24, sparks: 16, glints: 6, haptic: 'row' },
  rowWipe: { tier: 3, stop: 50, trauma: 0.4, bloom: [0.3, 200], dust: 48, sparks: 24, haptic: 'row' },
  rowClear: { tier: 2, trauma: 0.12, dust: 32, haptic: 'row' },
  crumble: { tier: 2, dust: 8 },
  purchase: { tier: 2, fxSparks: 14, haptic: 'purchase' },
  ready: { tier: 2, haptic: 'ready' },
  star: { tier: 3, stop: 50, trauma: 0.15, bloom: [0.2, 200], fxSparks: 24, glints: 30, haptic: 'star' },
  crown: { tier: 3, stop: 50, trauma: 0.2, bloom: [0.25, 300], fxSparks: 40, glints: 40, haptic: 'crown' },
  pickTier: { tier: 4, stop: 80, trauma: 0.55, bloom: [0.4, 400], full: [0.3, 120], fxSparks: 40, glints: 120, haptic: 'pickTier' },
  comboTier: { tier: 3, trauma: 0.15, bloom: [0.1, 200], fxSparks: 24, haptic: 'combo' },
  chestExposed: { tier: 2, haptic: 'chestStep' },
  chestOpen: { tier: 3, stop: 40, trauma: 0.1, bloom: [0.2, 300], fxSparks: 30, haptic: 'chestOpen' },
  sealAppear: { tier: 3, trauma: 0.2, dust: 24, haptic: 'seal' },
  sealHit: { tier: 1, flash: 0.5, pop: 0.6 },
  sealBreak: { tier: 4, stop: 120, trauma: 0.7, full: [0.35, 600], dust: 64, sparks: 40, haptic: 'seal' },
  reveal: { tier: 5, trauma: 0.7, bloom: [0.5, 1400], haptic: 'biome' },
  breakthrough: { tier: 3, trauma: 0.35, dust: 64 },
  moth: { tier: 3, stop: 40, trauma: 0.2, bloom: [0.2, 200], fxSparks: 30, haptic: 'gem' },
  dynamite: { tier: 3, stop: 60, trauma: 0.45, bloom: [0.3, 150], dust: 40, sparks: 80, haptic: 'dynamite' },
  feast: { tier: 5, haptic: 'feast' },
  // Wave 2 (SPEC §10.3)
  quake: { tier: 3, stop: 60, trauma: 0.6, bloom: [0.3, 150], dust: 80, sparks: 40, haptic: 'dynamite' },
  skill: { tier: 3, trauma: 0.12, bloom: [0.2, 300], glints: 30, haptic: 'skill' },
  cataclysm: { tier: 4, stop: 80, trauma: 0.55, full: [0.3, 160], glints: 120, haptic: 'cataclysm' },
  surge: { tier: 3, stop: 60, trauma: 0.35, full: [0.12, 200], bloom: [0.2, 600], sparks: 60, haptic: 'surge' },
  creature: { tier: 2, stop: 40, trauma: 0.12, bloom: [0.1, 100], sparks: 12, glints: 12, haptic: 'creature' },
  perfect: { tier: 3, stop: 40, trauma: 0.25, bloom: [0.3, 300], glints: 40, haptic: 'perfect' },
  weak: { tier: 2, stop: 30, trauma: 0.2, bloom: [0.2, 150], sparks: 16, glints: 10, haptic: 'weak' },
  facet: { tier: 2, bloom: [0.15, 200], glints: 24, haptic: 'facet' },
} as const satisfies Record<string, Cue>;

export type CueId = keyof typeof CUES;

/** Tokens per break (SPEC §10.6): clamp(1 + floor(log2(2 × value / median)), 1, 6). Values as log10. */
export function tokensFor(valueLog10: number, medianLog10: number): number {
  if (!Number.isFinite(valueLog10)) return 1;
  const ratio = (valueLog10 - (Number.isFinite(medianLog10) ? medianLog10 : valueLog10)) / Math.log10(2);
  return Math.max(1, Math.min(6, 1 + Math.floor(1 + ratio)));
}

/** A damage number's size (CSS px): 18 px, +4 px per decade over the biome median, cap 38; crits ×1.35 (max 48). */
export function numberSize(dmgLog10: number, medianLog10: number, crit: boolean): number {
  const over = Number.isFinite(medianLog10) ? Math.max(0, dmgLog10 - medianLog10) : 0;
  const base = Math.min(38, 18 + 4 * over);
  return crit ? Math.min(48, base * 1.35) : base;
}

/** The VFX escalation tier of a tap from the cells it broke (SPEC §3.3): E0 crack … E4 row wipe. */
export function escalation(cells: number, clearedRow: boolean): 0 | 1 | 2 | 3 | 4 {
  if (cells >= 8 || (clearedRow && cells >= 2)) return 4;
  if (cells >= 4) return 3;
  if (cells >= 2) return 2;
  if (cells >= 1) return 1;
  return 0;
}
