// The score's rhythm layers (SPEC §10.10): a drum kit that enters at combo ≥ 25, during a Surge, events and the
// Plunge, and a boss pulse under a Warden fight. Hits are scheduled ahead on the audio clock at the biome's tempo
// (sample-accurate, like the melody), and each layer's level crossfades over 4 s, so nothing ever cuts in or out.
// Pure apart from the `hit` callback (it plays a recipe at a time): unit-testable with a fake clock.

/** Layer crossfade time (s): the biome boundary crossfade too. */
export const LAYER_FADE_S = 4;
const LOOKAHEAD = 0.3;

export type DrumHit = 'drum.kick' | 'drum.snare' | 'drum.hat' | 'boss.pulse';

export class RhythmLayers {
  /** Current levels 0..1 (smoothed toward the targets). */
  drums = 0;
  boss = 0;
  private nextBeat = Number.NaN;
  private beat = 0;

  constructor(private readonly hit: (name: DrumHit, t: number, gain: number) => void) {}

  /**
   * Advance to audio time `now` with the targets (0..1) and the tempo. `dt` the frame's seconds. Hits within the
   * lookahead are scheduled; a stalled clock re-anchors instead of bursting.
   */
  update(now: number, dt: number, bpm: number, drumsTarget: number, bossTarget: number): void {
    const k = Math.min(1, dt / LAYER_FADE_S);
    this.drums += (drumsTarget - this.drums) * (drumsTarget > this.drums ? Math.min(1, k * 4) : k);
    this.boss += (bossTarget - this.boss) * Math.min(1, k * 2);
    if (this.drums < 0.02 && this.boss < 0.02) {
      this.nextBeat = Number.NaN;
      return;
    }
    const spb = 60 / Math.max(40, Math.min(200, bpm));
    if (Number.isNaN(this.nextBeat) || this.nextBeat < now - 0.1) {
      // Enter on the next beat of the bar's grid.
      this.nextBeat = Math.ceil(now / spb) * spb;
      this.beat = Math.round(this.nextBeat / spb) % 4;
    }
    while (this.nextBeat < now + LOOKAHEAD) {
      const t = this.nextBeat;
      const b = this.beat;
      if (this.drums >= 0.02) {
        if (b === 0 || b === 2) this.hit('drum.kick', t, this.drums);
        if (b === 1 || b === 3) this.hit('drum.snare', t, this.drums * 0.8);
        this.hit('drum.hat', t, this.drums * 0.6);
        this.hit('drum.hat', t + spb / 2, this.drums * 0.4);
      }
      if (this.boss >= 0.02 && (b === 0 || b === 2)) this.hit('boss.pulse', t, this.boss);
      this.nextBeat += spb;
      this.beat = (b + 1) % 4;
    }
  }
}
