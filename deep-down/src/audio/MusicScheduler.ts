import { Rng } from '../core/rng';
import { MOODS, degreeToMidi, type MoodName } from './theory';

export interface MusicNote {
  /** Start time on the audio clock, seconds. */
  time: number;
  /** Sustain length in seconds (pads add their own release tail). */
  duration: number;
  midi: number;
  velocity: number;
  voice: 'pad' | 'pluck';
  /** Pad lowpass cutoff in Hz. */
  brightness: number;
}

/** Notes older than this when the scheduler gets to them are dropped instead of played late. */
const LATE = 0.05;
/** Delay before the first phrase, and before a new phrase after entering or leaving camp. */
const FIRST_PHRASE = 1.5;
const MOOD_SWITCH = 1.2;

/**
 * Generative composer + lookahead scheduler, driven by an external clock (the AudioContext
 * time in the game, a fake clock in tests). Each call to advance() hands out the notes that
 * start before `until`, so the caller schedules them sample-accurately on the audio clock
 * instead of using a timer per note.
 *
 * The score is phrase based: a pad chord (sometimes none), a few sparse plucks wandering
 * through the mode, then a long silence. Phrase length, rest length and density vary.
 * Entering or leaving camp interrupts the current phrase (warmth changes quickly); depth
 * changes take effect at the next phrase.
 */
export class MusicScheduler {
  private readonly rng: Rng;
  private readonly pending: MusicNote[] = [];
  private head = 0;
  private nextPhraseAt = Number.NaN;
  private phraseMood: MoodName | null = null;
  private chordDegree = -1;
  /** Incremented whenever the current phrase is abandoned; players release older voices. */
  generation = 0;

  constructor(seed = 1) {
    this.rng = new Rng(seed);
  }

  /** Mood of the phrase currently playing (null before the first phrase). */
  get mood(): MoodName | null {
    return this.phraseMood;
  }

  /** Time the next phrase is due on the scheduler clock. */
  get nextPhraseTime(): number {
    return this.nextPhraseAt;
  }

  /** Fill `out` with notes starting in [now, until); returns how many. Reuses `out`. */
  advance(now: number, until: number, mood: MoodName, out: MusicNote[]): number {
    out.length = 0;
    if (Number.isNaN(this.nextPhraseAt)) this.nextPhraseAt = now + FIRST_PHRASE;

    const campSwitch = this.phraseMood !== null && mood !== this.phraseMood && (mood === 'camp' || this.phraseMood === 'camp');
    if (campSwitch) {
      this.head = this.pending.length;
      this.phraseMood = null;
      this.nextPhraseAt = Math.min(this.nextPhraseAt, now + MOOD_SWITCH);
      this.generation++;
    }

    // After a stall (pause, backgrounding) skip what is already late and re-anchor the score.
    while (this.head < this.pending.length && this.pending[this.head].time < now - LATE) this.head++;
    if (this.head >= this.pending.length && this.nextPhraseAt < now - LATE) this.nextPhraseAt = now + 0.5;

    if (this.head >= this.pending.length && this.nextPhraseAt < until) this.compose(this.nextPhraseAt, mood);
    while (this.head < this.pending.length && this.pending[this.head].time < until) out.push(this.pending[this.head++]);
    return out.length;
  }

  private compose(start: number, mood: MoodName): void {
    const m = MOODS[mood];
    const rng = this.rng;
    this.pending.length = 0;
    this.head = 0;
    this.phraseMood = mood;

    const len = rng.range(m.phrase[0], m.phrase[1]);
    let degree = rng.pick(m.progression);
    if (degree === this.chordDegree) degree = rng.pick(m.progression);
    this.chordDegree = degree;

    if (!rng.chance(m.sparse)) {
      const padTonic = m.tonic - 12;
      let offset = 0;
      for (const v of m.voicing) {
        this.pending.push({
          time: start + offset,
          duration: len - offset,
          midi: degreeToMidi(padTonic, m.mode, degree + v),
          velocity: rng.range(0.55, 0.75),
          voice: 'pad',
          brightness: m.brightness * rng.range(0.85, 1.15),
        });
        offset += rng.range(0.05, 0.45);
      }
    }

    const plucks = rng.int(m.plucks[0], m.plucks[1]);
    const beat = rng.range(0.6, 1.1);
    let t = start + rng.range(1, 2.5);
    let step = degree + rng.pick([0, 2, 4]);
    for (let i = 0; i < plucks && t < start + len - 1; i++) {
      const midi = degreeToMidi(m.tonic, m.mode, step);
      const velocity = rng.range(0.35, 0.75);
      this.pending.push({ time: t, duration: rng.range(1.6, 2.8), midi, velocity, voice: 'pluck', brightness: m.brightness });
      // A soft octave echo now and then, like a tine ringing in the dark.
      if (rng.chance(0.25)) {
        this.pending.push({ time: t + beat * 0.5, duration: 1.4, midi: midi + 12, velocity: velocity * 0.4, voice: 'pluck', brightness: m.brightness });
      }
      t += beat * rng.pick([1, 1, 2, 3, 1.5]);
      step = Math.max(degree - 3, Math.min(degree + 9, step + rng.pick([-2, -1, 1, 1, 2, 3])));
    }

    this.pending.sort((a, b) => a.time - b.time);
    this.nextPhraseAt = start + len + rng.range(m.rest[0], m.rest[1]);
  }
}
