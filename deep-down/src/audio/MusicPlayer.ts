import { MusicScheduler, type MusicNote } from './MusicScheduler';
import { playMusicNote } from './sfx';
import type { Voice, SynthTarget } from './synth';
import type { MoodName } from './theory';
import { VoiceLimiter } from './voices';

/** How far ahead of the audio clock notes are scheduled. Covers frame hitches at 30 fps. */
const LOOKAHEAD = 0.35;
/** Score polyphony: a four-note pad, its release tail and a couple of plucks. */
export const MUSIC_VOICES = 6;
/**
 * Stealing priority per voice. The pad chord outranks plucks: when the score is full, a new
 * pluck replaces the oldest (already decaying) pluck instead of cutting a chord tone.
 */
export const MUSIC_PRIORITY = { pad: 2, pluck: 1 } as const;

/** Plays the generative score: pulls notes from the scheduler and starts them on the audio clock. */
export class MusicPlayer {
  private readonly scheduler: MusicScheduler;
  private readonly voices: VoiceLimiter<Voice>;
  private readonly batch: MusicNote[] = [];
  private generation = 0;
  private now = 0;
  /** The pluck melody plays only while there was a tap in the last 5 s (SPEC §10.10); the pad always. */
  plucks = true;

  constructor(private readonly target: SynthTarget, seed: number) {
    this.scheduler = new MusicScheduler(seed);
    this.voices = new VoiceLimiter<Voice>(MUSIC_VOICES, (v) => v.kill(this.now, 0.8));
  }

  get activeVoices(): number {
    return this.voices.size;
  }

  get mood(): MoodName | null {
    return this.scheduler.mood;
  }

  update(now: number, mood: MoodName): void {
    this.now = now;
    const n = this.scheduler.advance(now, now + LOOKAHEAD, mood, this.batch);
    if (this.scheduler.generation !== this.generation) {
      // Entering or leaving camp: let the old harmony dissolve instead of cutting it.
      this.generation = this.scheduler.generation;
      this.voices.clear((v) => v.kill(now, 1.8));
    }
    for (let i = 0; i < n; i++) {
      const note = this.batch[i];
      if (note.voice === 'pluck' && !this.plucks) continue;
      const priority = MUSIC_PRIORITY[note.voice];
      if (!this.voices.admit(now, priority)) continue;
      const v = playMusicNote(this.target, note);
      this.voices.add(v, note.time, v.end, priority);
    }
  }

  /** Fade out everything that is sounding or already scheduled. */
  stop(now: number): void {
    this.voices.clear((v) => v.kill(now, 0.5));
  }
}
