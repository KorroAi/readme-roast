import type { LayerMix } from './MusicScheduler';

/**
 * The score's intensity (round 3, AUDIO): from the danger around the explorer and the blows of a
 * fight, which layers play. Pure and deterministic, so its hysteresis is unit tested.
 *
 * - calm: the bed and the motif (exploring);
 * - tension: monsters near or a wind-up heard: the ostinato and the pulse come in, the motif thins;
 * - combat: blows exchanged: drums and a driving bass, the motif hurries.
 *
 * Heat is the fight's memory: every telegraph, attack, hit and hurt adds to it; it holds a few
 * seconds after the last blow, then cools. States change with hysteresis and minimum stays, so the
 * music never flickers between layers at a threshold.
 */
export type IntensityState = 'calm' | 'tension' | 'combat';

export type CombatImpulse = 'telegraph' | 'attack' | 'hurt' | 'hit' | 'kill' | 'shot';

/** Heat each kind of blow adds. */
export const IMPULSE: Record<CombatImpulse, number> = { telegraph: 0.22, attack: 0.3, hurt: 0.45, hit: 0.28, kill: 0.12, shot: 0.12 };

export const INTENSITY = {
  /** Heat cap, its hold after the last blow, and its cooling per second. */
  heatMax: 1.5,
  hold: 4,
  cool: 0.11,
  /** Danger smoothing (s): it rises quickly and ebbs slowly. */
  dangerRise: 0.8,
  dangerFall: 3,
  /** Thresholds with hysteresis. */
  tensionOn: 0.3,
  tensionOff: 0.12,
  combatOn: 0.5,
  combatOff: 0.22,
  /** Minimum stays (s) before a step down. */
  minCombat: 8,
  minTension: 5,
} as const;

export const MIXES: Record<IntensityState, Readonly<LayerMix>> = {
  calm: { bed: 1, motif: 1, tension: 0, combat: 0 },
  tension: { bed: 0.8, motif: 0.5, tension: 1, combat: 0 },
  combat: { bed: 0.65, motif: 0.75, tension: 0.7, combat: 1 },
};

export class IntensityTracker {
  state: IntensityState = 'calm';
  /** Seconds in the current state. */
  stateTime = 0;
  heat = 0;
  danger = 0;
  private sinceBlow = Infinity;
  private readonly mix: LayerMix = { ...MIXES.calm };

  /** A blow of the fight (heat), scaled (a distant telegraph counts less). */
  impulse(kind: CombatImpulse, scale = 1): void {
    const s = Number.isFinite(scale) ? Math.max(0, Math.min(1, scale)) : 1;
    this.heat = Math.min(INTENSITY.heatMax, this.heat + IMPULSE[kind] * s);
    this.sinceBlow = 0;
  }

  /** Forget the fight (a black-out, a stratum switch, the camp). */
  reset(): void {
    this.state = 'calm';
    this.stateTime = 0;
    this.heat = 0;
    this.danger = 0;
    this.sinceBlow = Infinity;
  }

  /** Step the tracker by `dt` with the probe's danger (0..1); returns the state. */
  update(dt: number, danger: number): IntensityState {
    const step = Number.isFinite(dt) ? Math.max(0, Math.min(0.5, dt)) : 0;
    const target = Number.isFinite(danger) ? Math.max(0, Math.min(1, danger)) : 0;
    const tc = target > this.danger ? INTENSITY.dangerRise : INTENSITY.dangerFall;
    this.danger += (target - this.danger) * (1 - Math.exp(-step / tc));
    this.sinceBlow += step;
    if (this.sinceBlow > INTENSITY.hold) this.heat = Math.max(0, this.heat - INTENSITY.cool * step);
    this.stateTime += step;
    const I = INTENSITY;
    const pressure = Math.max(this.danger, this.heat * 0.8);
    let next = this.state;
    if (this.state === 'calm') {
      if (this.heat >= I.combatOn) next = 'combat';
      else if (pressure >= I.tensionOn) next = 'tension';
    } else if (this.state === 'tension') {
      if (this.heat >= I.combatOn) next = 'combat';
      else if (pressure < I.tensionOff && this.stateTime >= I.minTension) next = 'calm';
    } else if (this.heat < I.combatOff && this.stateTime >= I.minCombat) {
      next = pressure >= I.tensionOff ? 'tension' : 'calm';
    }
    if (next !== this.state) {
      this.state = next;
      this.stateTime = 0;
    }
    return this.state;
  }

  /** The layer mix for the state, with the tension layer following the danger a little. */
  layerMix(): Readonly<LayerMix> {
    const m = MIXES[this.state];
    this.mix.bed = m.bed;
    this.mix.motif = m.motif;
    this.mix.tension = this.state === 'tension' ? 0.7 + 0.3 * Math.min(1, this.danger / 0.6) : m.tension;
    this.mix.combat = m.combat;
    return this.mix;
  }
}
