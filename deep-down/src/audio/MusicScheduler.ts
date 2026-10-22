import { Rng } from '../core/rng';
import type { Timbre } from './instruments';
import { SCORES, stepsPerBar, type MotifNote, type Pattern, type ScoreDef, type ScoreId } from './scores';
import { degreeToMidi, MODES } from './theory';

/** The score's layers: the bed (pads), the motif (lead and counter), tension, combat, and stingers. */
export type MusicLayer = 'bed' | 'motif' | 'tension' | 'combat' | 'sting';
export const MUSIC_LAYERS: readonly MusicLayer[] = ['bed', 'motif', 'tension', 'combat', 'sting'];

export interface MusicNote {
  /** Start time on the audio clock, seconds. */
  time: number;
  /** Sustain length in seconds (pads add their own release tail). */
  duration: number;
  midi: number;
  velocity: number;
  /** The timbre (instruments.ts). */
  voice: Timbre;
  /** Pad lowpass cutoff in Hz (tone colour). */
  brightness: number;
  layer: MusicLayer;
  /** Stereo position (counter-lines sit a little off centre). */
  pan?: number;
}

/** How much of each layer the danger asks for (0..1 targets; MusicPlayer fades the stems to them). */
export interface LayerMix {
  bed: number;
  motif: number;
  tension: number;
  combat: number;
}

export const CALM_MIX: Readonly<LayerMix> = { bed: 1, motif: 1, tension: 0, combat: 0 };

export type StingKind = 'arrival' | 'victory' | 'heartLit' | 'descent' | 'phase';

/** Notes older than this when the scheduler reaches them are dropped instead of played late. */
const LATE = 0.05;
/** A layer is composed while its target is above this. */
const ACTIVE = 0.05;
/** Calm music plays in movements, then breathes (the ambience carries the cave). */
const MOVEMENT: readonly [number, number] = [100, 200];
const BREATHER: readonly [number, number] = [22, 48];
/** Lead register limits (MIDI): a phone speaker's sweet spot, never shrill. */
const LEAD_LO = 55;
const LEAD_HI = 88;

const STEP_VEL: Record<string, number> = { x: 1, o: 0.72, g: 0.36 };
const BASS_DEGREE: Record<string, number> = { '1': 0, '3': 2, '4': 3, '5': 4, '7': 6, '8': 7 };

type Variation = 'plain' | 'sequence' | 'octave' | 'fragment' | 'diminution';

/**
 * The generative composer for one score (round 3, AUDIO) plus its lookahead scheduler, driven by an
 * external clock (the AudioContext time in the game, a fake clock in tests). Each `advance()` hands
 * out the notes that start before `until`, so they are scheduled sample-accurately.
 *
 * Bars are composed at their downbeat (the bed's chord, the motif's phrase, the counter-line and the
 * far percussion); tension and combat are composed beat by beat, so drums and the ostinato answer a
 * fight within one beat. The phrase machine states the motif plainly first, then varies it
 * (sequenced on the chord, an octave up, fragmented under tension, in diminution in a fight) with
 * bars of rest between phrases; calm music plays in movements of a few minutes and then breathes.
 */
export class MusicScheduler {
  readonly score: ScoreDef;
  readonly beatDur: number;
  readonly barDur: number;
  private readonly rng: Rng;
  private readonly pending: MusicNote[] = [];
  private head = 0;
  /** Time of beat 0 (set by the first advance). */
  private origin = Number.NaN;
  /** The next beat to compose (global index). */
  private beat = 0;
  private readonly startDelay: number;
  private chord = 0;
  private restBars = 1;
  private phraseBarsLeft = 0;
  private phrases = 0;
  private phraseNotes: MusicNote[] = [];
  private justPhrased = false;
  private calmMusic = 0;
  private movement: number;
  private breatherUntil = -Infinity;
  /** A sting was played: the motif waits so the two never overlap. */
  private holdMotifUntil = -Infinity;
  /** Were tension and combat composing on the last beat (an entry hit marks their arrival)? */
  private wasTense = false;
  private wasFighting = false;

  constructor(score: ScoreId | ScoreDef, seed = 1, startDelay = 1) {
    this.score = typeof score === 'string' ? SCORES[score] : score;
    this.rng = new Rng(seed ^ hashId(this.score.id));
    this.beatDur = 60 / this.score.bpm;
    this.barDur = this.beatDur * this.score.meter;
    this.startDelay = startDelay;
    this.movement = this.rng.range(MOVEMENT[0], MOVEMENT[1]);
  }

  /** Time the next beat is due (NaN before the first advance). */
  get nextBeatTime(): number {
    return this.origin + this.beat * this.beatDur;
  }

  /** The bar being composed now. */
  get bar(): number {
    return Math.floor(Math.max(0, this.beat - 1) / this.score.meter);
  }

  /** The chord root (scale degree) of the current bar. */
  get chordDegree(): number {
    return this.chord;
  }

  /** In a breather (calm music resting), until this time. */
  get restingUntil(): number {
    return this.breatherUntil;
  }

  /** Phrases of the motif begun so far. */
  get phraseCount(): number {
    return this.phrases;
  }

  /** Fill `out` with notes starting in [now, until); returns how many. Reuses `out`. */
  advance(now: number, until: number, mix: Readonly<LayerMix>, out: MusicNote[]): number {
    out.length = 0;
    if (Number.isNaN(this.origin)) this.origin = now + this.startDelay;
    // After a stall (pause, backgrounding) skip what is late and resume on the next downbeat.
    if (this.nextBeatTime < now - LATE) {
      const meter = this.score.meter;
      const beatsLate = Math.ceil((now - this.origin) / this.beatDur);
      this.beat = Math.ceil(beatsLate / meter) * meter;
      if (this.nextBeatTime < now) this.beat += meter;
    }
    while (this.head < this.pending.length && this.pending[this.head].time < now - LATE) this.head++;
    while (this.nextBeatTime < until) this.composeBeat(mix);
    while (this.head < this.pending.length && this.pending[this.head].time < until) out.push(this.pending[this.head++]);
    if (this.head > 64) {
      this.pending.splice(0, this.head);
      this.head = 0;
    }
    return out.length;
  }

  /** Drop everything not yet handed out (the deck is cut). */
  clear(): void {
    this.pending.length = 0;
    this.head = 0;
  }

  /**
   * A stinger in this score's key and tempo, starting at `at`: the arrival statement of the motif,
   * a guardian's defeat, the Heart relit, a descent, a guardian's new phase. Returns its length (s).
   */
  sting(kind: StingKind, at: number): number {
    const s = this.score;
    const notes: MusicNote[] = [];
    const b = this.beatDur;
    const lead = this.leadBase();
    const pad = s.tonic - 12;
    const push = (n: Omit<MusicNote, 'layer' | 'brightness'> & { brightness?: number }) => notes.push({ brightness: s.brightness, ...n, layer: 'sting' });
    let length = 0;
    if (kind === 'arrival') {
      for (const m of s.motif) push({ time: at + m.at * b, duration: m.len * b * 0.95, midi: this.fold(degreeToMidi(lead, s.mode, m.d)), velocity: 0.82 * (m.vel ?? 1), voice: s.lead });
      for (const v of s.voicing) push({ time: at + this.rng.range(0, 0.2), duration: s.motifBars * s.meter * b, midi: this.foldPad(degreeToMidi(pad, s.mode, v)), velocity: 0.6, voice: s.bed });
      length = s.motifBars * s.meter * b;
    } else if (kind === 'victory' || kind === 'heartLit') {
      // A major resolution even in a minor key (a Picardy third): the lair falls quiet, the light returns.
      const root = kind === 'heartLit' ? 62 : s.tonic;
      const major = [0, 4, 7, 12, 16];
      const brass: Timbre = kind === 'heartLit' ? 'horn' : s.lead;
      major.forEach((iv, i) => push({ time: at + i * b * 0.5, duration: b * (i === major.length - 1 ? 4 : 1), midi: this.fold(root + iv), velocity: 0.75, voice: brass }));
      for (const iv of [0, 7, 16, 19]) push({ time: at + this.rng.range(0, 0.15), duration: b * 6, midi: this.foldPad(root - 12 + iv), velocity: 0.65, voice: kind === 'heartLit' ? 'choirPad' : s.bed });
      push({ time: at, duration: 1, midi: 43, velocity: 0.9, voice: 'taiko' });
      push({ time: at + b * 2, duration: 1, midi: 45, velocity: 0.35, voice: 'gong' });
      if (kind === 'heartLit') for (let i = 0; i < 4; i++) push({ time: at + b * (3 + i), duration: 2, midi: 74 + [0, 4, 7, 12][i], velocity: 0.4, voice: 'bell' });
      length = b * 7;
    } else if (kind === 'descent') {
      push({ time: at, duration: 1, midi: 40, velocity: 0.45, voice: 'gong' });
      [7, 4, 2, 0].forEach((d, i) => push({ time: at + i * b, duration: b * 1.2, midi: this.foldBass(degreeToMidi(s.tonic - 24, s.mode, d)), velocity: 0.55, voice: 'bowed' }));
      for (const v of [0, 4, 7]) push({ time: at + 0.1, duration: b * 4, midi: this.foldPad(degreeToMidi(pad, s.mode, v)), velocity: 0.5, voice: s.bed });
      length = b * 5;
    } else {
      // A guardian's new phase: a drum roll into a brass stab.
      for (let i = 0; i < 6; i++) push({ time: at + i * b * 0.25, duration: 0.3, midi: 45, velocity: 0.45 + i * 0.08, voice: 'tom' });
      for (const v of [0, 4, 7]) push({ time: at + b * 1.5, duration: b * 0.6, midi: this.fold(degreeToMidi(lead, s.mode, v)), velocity: 0.8, voice: 'brass' });
      push({ time: at + b * 1.5, duration: 1, midi: 43, velocity: 1, voice: 'taiko' });
      length = b * 3;
    }
    // What was already composed for the bed and the motif after the sting's start makes way.
    const kept = this.pending.slice(this.head).filter((n) => n.time < at || (n.layer !== 'motif' && n.layer !== 'bed'));
    this.pending.length = this.head;
    for (const n of kept) this.pending.push(n);
    this.insert(notes);
    // The motif waits until the sting has spoken.
    this.holdMotifUntil = at + length;
    this.phraseBarsLeft = 0;
    this.restBars = 0;
    return length;
  }

  // -------------------------------------------------------------------------------------

  private composeBeat(mix: Readonly<LayerMix>): void {
    const s = this.score;
    const beatInBar = this.beat % s.meter;
    const bar = Math.floor(this.beat / s.meter);
    const t = this.nextBeatTime;
    const notes: MusicNote[] = [];
    if (beatInBar === 0) this.composeBar(bar, t, mix, notes);
    const fighting = mix.combat > ACTIVE;
    const tense = mix.tension > ACTIVE;
    if (tense) this.composeSteps(s.tension.bass, null, 'tension', t, beatInBar, s.bass, notes, fighting);
    if (tense && s.tension.pulse) this.composeSteps(null, s.tension.pulse, 'tension', t, beatInBar, s.tension.pulse.timbre, notes, false);
    if (fighting) {
      this.composeSteps(s.combat.bass, null, 'combat', t, beatInBar, s.bass, notes, false);
      for (const p of s.combat.drums) if (bar % (p.every ?? 1) === 0) this.composeSteps(null, p, 'combat', t, beatInBar, p.timbre, notes, false);
    }
    // The music answers at once: the beat danger arrives gets a low root (and the pulse), the beat a
    // fight starts gets an accent, whatever the pattern holds there.
    if (tense && !this.wasTense && !fighting) this.entry('tension', t, notes);
    if (fighting && !this.wasFighting) this.entry('combat', t, notes);
    this.wasTense = tense;
    this.wasFighting = fighting;
    this.insert(notes);
    this.beat++;
  }

  private entry(layer: 'tension' | 'combat', t: number, notes: MusicNote[]): void {
    const s = this.score;
    if (notes.some((n) => n.layer === layer && n.time < t + 0.01)) return;
    const root = this.foldBass(degreeToMidi(s.tonic - 24, s.mode, this.chord));
    notes.push({ time: t, duration: this.beatDur * 1.5, midi: root, velocity: 0.75, voice: s.bass, brightness: s.brightness, layer });
    const hit = layer === 'tension' ? s.tension.pulse : s.combat.drums[0];
    if (hit) notes.push({ time: t, duration: 0.3, midi: hit.midi ?? 48, velocity: Math.min(1, hit.vel * (layer === 'combat' ? 1 : 0.8)), voice: hit.timbre, brightness: s.brightness, layer });
  }

  private composeBar(bar: number, t: number, mix: Readonly<LayerMix>, notes: MusicNote[]): void {
    const s = this.score;
    const rng = this.rng;
    const calm = mix.tension <= ACTIVE && mix.combat <= ACTIVE;
    // The chord: the progression, now and then a substitution from it.
    if (bar % s.chordBars === 0) {
      const idx = Math.floor(bar / s.chordBars) % s.progression.length;
      this.chord = rng.chance(0.12) ? rng.pick(s.progression) : s.progression[idx];
    }
    // Calm music plays in movements, then rests a while (never in a fight).
    if (calm) {
      this.calmMusic += this.barDur;
      if (this.calmMusic > this.movement && t >= this.breatherUntil) {
        this.breatherUntil = t + rng.range(BREATHER[0], BREATHER[1]);
        this.calmMusic = 0;
        this.movement = rng.range(MOVEMENT[0], MOVEMENT[1]);
      }
    } else this.breatherUntil = -Infinity;
    const resting = t < this.breatherUntil;

    // The bed.
    if (!resting && mix.bed > ACTIVE && bar % s.chordBars === 0 && !(s.bedRest && rng.chance(s.bedRest))) {
      const pad = s.tonic - 12;
      const duration = s.chordBars * this.barDur + 0.25;
      let strum = 0;
      for (const v of s.voicing) {
        notes.push({
          time: t + strum, duration, midi: this.foldPad(degreeToMidi(pad, s.mode, this.chord + v)),
          velocity: rng.range(0.55, 0.72), voice: s.bed, brightness: s.brightness * rng.range(0.88, 1.12), layer: 'bed',
        });
        strum += rng.range(0.02, 0.12);
      }
    }

    // A shiver over the tension: a quiet high note a semitone above the chord root.
    if (mix.tension > ACTIVE && mix.combat <= ACTIVE && s.tension.shiver && bar % 2 === 0) {
      const root = this.fold(degreeToMidi(this.leadBase(), s.mode, this.chord));
      notes.push({ time: t, duration: this.barDur * 2, midi: this.fold(root + 13), velocity: 0.16, voice: s.tension.shiver, brightness: s.brightness, layer: 'tension' });
    }

    // The motif's phrase machine.
    if (mix.motif > ACTIVE && !resting && t >= this.holdMotifUntil) this.phraseMachine(t, mix, calm, notes);
    else if (this.phraseBarsLeft > 0) this.phraseBarsLeft--;

    // Far percussion while exploring.
    if (!resting && s.explore && mix.combat <= ACTIVE) {
      for (const p of s.explore) {
        if (bar % (p.every ?? 1) !== 0) continue;
        for (let beat = 0; beat < s.meter; beat++) this.composeSteps(null, p, 'motif', t + beat * this.beatDur, beat, p.timbre, notes, false);
      }
    }
  }

  private phraseMachine(t: number, mix: Readonly<LayerMix>, calm: boolean, notes: MusicNote[]): void {
    const s = this.score;
    const rng = this.rng;
    if (this.phraseBarsLeft > 0) {
      // Mid-phrase: its notes were placed at the phrase's start.
      this.phraseBarsLeft--;
      if (this.phraseBarsLeft === 0) this.afterPhrase(calm, mix, notes);
      return;
    }
    if (this.restBars > 0) {
      this.restBars--;
      this.counterInRest(t, notes);
      return;
    }
    const fighting = mix.combat > ACTIVE;
    const tense = mix.tension > ACTIVE && !fighting;
    const p = fighting ? 0.9 : tense ? 0.5 : s.density;
    if (this.phrases > 0 && !rng.chance(p)) {
      this.restBars = 1;
      this.counterInRest(t, notes);
      return;
    }
    // Choose the variation: the first statement is plain; tension fragments; a fight hurries it.
    let variation: Variation = 'plain';
    if (this.phrases > 0) {
      if (fighting) variation = rng.chance(0.6) ? 'diminution' : 'plain';
      else if (tense) variation = 'fragment';
      else {
        const r = rng.next();
        variation = r < 0.5 ? 'plain' : r < 0.72 ? 'sequence' : r < 0.86 ? 'octave' : 'fragment';
      }
    }
    this.phraseNotes = this.phraseOf(variation, t, fighting);
    for (const n of this.phraseNotes) notes.push(n);
    this.echo(notes);
    this.phrases++;
    this.phraseBarsLeft = s.motifBars - 1;
    this.justPhrased = true;
    if (this.phraseBarsLeft === 0) this.afterPhrase(calm, mix, notes);
    // The counter's arpeggios sometimes run under a phrase too (softly).
    if (s.counterStyle === 'arp' && s.counter && rng.chance(fighting ? 0.5 : 0.3)) this.arpeggio(t, 0.28, notes);
  }

  private afterPhrase(calm: boolean, mix: Readonly<LayerMix>, _notes: MusicNote[]): void {
    const s = this.score;
    const rng = this.rng;
    const fighting = mix.combat > ACTIVE;
    this.restBars = fighting ? 0 : calm ? rng.int(s.rest[0], s.rest[1]) : rng.int(0, 1);
  }

  /** The echo: the phrase's last two notes an octave up, a beat later (planned with the phrase). */
  private echo(notes: MusicNote[]): void {
    const s = this.score;
    const rng = this.rng;
    if (s.counterStyle !== 'echo' || !s.counter || this.phraseNotes.length < 2 || !rng.chance(0.7)) return;
    const tail = this.phraseNotes.slice(-2);
    const shift = tail[0].midi + 12 <= LEAD_HI ? 12 : 0;
    const pan = rng.range(-0.35, 0.35);
    for (const n of tail) notes.push({ ...n, time: n.time + this.beatDur, midi: n.midi + shift, velocity: n.velocity * 0.42, voice: s.counter, layer: 'motif', pan });
  }

  /** In a rest bar after a phrase: the answer (a fragment up a fifth) or an arpeggio. */
  private counterInRest(t: number, notes: MusicNote[]): void {
    const s = this.score;
    const rng = this.rng;
    if (!s.counter || !this.justPhrased) return;
    this.justPhrased = false;
    if (s.counterStyle === 'answer' && rng.chance(0.75)) {
      const base = this.leadBase();
      const frag = s.motif.slice(0, Math.min(4, s.motif.length));
      const start = frag[0].at;
      const pan = rng.range(-0.3, 0.3);
      for (const m of frag) {
        if (m.at - start >= s.meter) break;
        notes.push({
          time: t + (m.at - start) * this.beatDur, duration: m.len * this.beatDur, midi: this.fold(degreeToMidi(base, s.mode, m.d + 4)),
          velocity: 0.4 * (m.vel ?? 1), voice: s.counter, brightness: s.brightness, layer: 'motif', pan,
        });
      }
    } else if (s.counterStyle === 'arp' && rng.chance(0.65)) this.arpeggio(t, 0.38, notes);
  }

  /** A bar of chord-tone arpeggio on the counter timbre (8ths, or triplets on a compound grid). */
  private arpeggio(t: number, vel: number, notes: MusicNote[]): void {
    const s = this.score;
    const rng = this.rng;
    if (!s.counter) return;
    const steps = stepsPerBar(s);
    const step = this.barDur / steps;
    const shape = rng.pick([[0, 2, 4, 7], [0, 4, 2, 4], [7, 4, 2, 0], [0, 4, 7, 9]]);
    const base = this.leadBase() - 12;
    const pan = rng.range(-0.4, 0.4);
    for (let i = 0; i < steps; i++) {
      if (s.sub === 2 && i % 2 === 1 && rng.chance(0.3)) continue;
      notes.push({
        time: t + i * step + this.swingOf(i, step), duration: step * 1.8, midi: this.fold(degreeToMidi(base, s.mode, this.chord + shape[i % shape.length])),
        velocity: vel * rng.range(0.8, 1.1) * (i % s.sub === 0 ? 1 : 0.8), voice: s.counter, brightness: s.brightness, layer: 'motif', pan,
      });
    }
  }

  /** The motif as notes from `t`, varied. */
  private phraseOf(variation: Variation, t: number, fighting: boolean): MusicNote[] {
    const s = this.score;
    const rng = this.rng;
    const base = this.leadBase();
    let motif: readonly MotifNote[] = s.motif;
    let shift = 0;
    let timeScale = 1;
    let repeat = 1;
    if (variation === 'sequence') shift = this.chord;
    else if (variation === 'octave') shift = MODES[s.mode].length;
    else if (variation === 'fragment') motif = s.motif.slice(0, Math.max(2, Math.ceil(s.motif.length / 2)));
    else if (variation === 'diminution') {
      timeScale = 0.5;
      repeat = 2;
    }
    const span = s.motifBars * s.meter * timeScale;
    const out: MusicNote[] = [];
    for (let r = 0; r < repeat; r++) {
      for (const m of motif) {
        const at = (m.at * timeScale + r * span) * this.beatDur;
        const jitter = fighting ? 0 : rng.range(-0.008, 0.008);
        out.push({
          time: t + Math.max(0, at + jitter), duration: m.len * timeScale * this.beatDur * 0.95,
          midi: this.fold(degreeToMidi(base, s.mode, m.d + shift)),
          velocity: Math.min(1, (m.vel ?? 0.8) * rng.range(0.85, 1.05) * (r === 1 ? 0.9 : 1)),
          voice: s.lead, brightness: s.brightness, layer: 'motif',
        });
      }
    }
    return out;
  }

  /** Pattern steps of one beat (drums, or a bass line when `line` is given). */
  private composeSteps(line: string | null, p: Pattern | null, layer: MusicLayer, t: number, beatInBar: number, timbre: Timbre, notes: MusicNote[], skipBass: boolean): void {
    const s = this.score;
    const steps = line ?? p!.steps;
    const per = s.sub;
    const step = this.beatDur / per;
    const rng = this.rng;
    for (let k = 0; k < per; k++) {
      const i = beatInBar * per + k;
      const c = steps[i % steps.length];
      if (!c || c === '.' || c === '-') continue;
      const at = t + k * step + this.swingOf(i, step);
      if (line !== null) {
        if (skipBass) continue;
        const deg = BASS_DEGREE[c];
        if (deg === undefined) continue;
        let len = 1;
        while (steps[(i + len) % steps.length] === '-' && len < steps.length) len++;
        notes.push({
          time: at, duration: Math.max(0.12, len * step * 0.9), midi: this.foldBass(degreeToMidi(s.tonic - 24, s.mode, this.chord + deg)),
          velocity: (k === 0 ? 0.8 : 0.65) * rng.range(0.9, 1.05), voice: timbre, brightness: s.brightness, layer,
        });
      } else {
        const v = STEP_VEL[c];
        if (v === undefined) continue;
        notes.push({ time: at, duration: 0.25, midi: p!.midi ?? 48, velocity: Math.min(1, v * p!.vel * rng.range(0.9, 1.06)), voice: timbre, brightness: s.brightness, layer, pan: timbre === 'shaker' ? 0.2 : undefined });
      }
    }
  }

  private swingOf(i: number, step: number): number {
    const sw = this.score.swing ?? 0;
    return this.score.sub === 2 && i % 2 === 1 ? sw * step : 0;
  }

  private leadBase(): number {
    return this.score.tonic + 12 * (this.score.leadOctave ?? 0);
  }

  /** Keep a lead note in the phone's sweet spot (octave folding). */
  private fold(midi: number): number {
    let m = midi;
    while (m > LEAD_HI) m -= 12;
    while (m < LEAD_LO) m += 12;
    return m;
  }

  /** Pads between D3 and G5: low enough to be a bed, high enough for a phone to play its fundamental. */
  private foldPad(midi: number): number {
    let m = midi;
    while (m > 79) m -= 12;
    while (m < 50) m += 12;
    return m;
  }

  /** Bass between E2 and A3 (its harmonics, not its fundamental, carry it on a phone). */
  private foldBass(midi: number): number {
    let m = midi;
    while (m > 57) m -= 12;
    while (m < 40) m += 12;
    return m;
  }

  private insert(notes: MusicNote[]): void {
    if (notes.length === 0) return;
    for (const n of notes) this.pending.push(n);
    // Keep the unread part in time order (a few notes per beat: insertion is cheap).
    const tail = this.pending.slice(this.head).sort((a, b) => a.time - b.time);
    this.pending.length = this.head;
    for (const n of tail) this.pending.push(n);
  }
}

function hashId(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
