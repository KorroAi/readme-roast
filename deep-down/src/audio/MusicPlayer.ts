import { TIMBRES } from './instruments';
import { CALM_MIX, MUSIC_LAYERS, MusicScheduler, type LayerMix, type MusicLayer, type MusicNote, type StingKind } from './MusicScheduler';
import { SCORES, type ScoreId } from './scores';
import { playMusicNote } from './sfx';
import type { SynthTarget, Voice } from './synth';
import { VoiceLimiter } from './voices';

/** How far ahead of the audio clock notes are scheduled. Covers frame hitches at 30 fps. */
const LOOKAHEAD = 0.35;
/** The widest the window grows on a slow device (s): its notes are handed out before the next frame. */
const MAX_LOOKAHEAD = 1.2;
/**
 * Score polyphony: a chord (and the one ringing out under it), the lead and its counter, the
 * ostinato and a few short drum hits. Beyond it new notes steal by priority.
 */
export const MUSIC_VOICES = 22;
/**
 * Stealing priority: a stinger and the held chord and the lead outrank the bass, which outranks
 * drums and counter-lines (short or decaying: stealing their tail is inaudible). A fading deck's
 * voices drop to 0 and go first.
 */
export const MUSIC_PRIORITY = { sting: 4, bed: 3, lead: 3, bass: 2, counter: 1, drum: 1, fading: 0 } as const;

/** A score note's stealing priority (MUSIC_PRIORITY), given the score's lead timbre. */
export function musicPriority(note: MusicNote, lead: string): number {
  if (note.layer === 'sting') return MUSIC_PRIORITY.sting;
  if (note.prio !== undefined) return note.prio;
  const family = TIMBRES[note.voice]?.family ?? 'lead';
  if (family === 'drum') return MUSIC_PRIORITY.drum;
  if (note.layer === 'bed') return MUSIC_PRIORITY.bed;
  if (family === 'bass') return MUSIC_PRIORITY.bass;
  if (note.layer === 'motif') return note.voice === lead ? MUSIC_PRIORITY.lead : MUSIC_PRIORITY.counter;
  return MUSIC_PRIORITY.counter;
}

/**
 * The layers' balance (stem gain at a mix weight of 1), set from the offline renders through a phone
 * speaker: the lead a few LU over the bed, the tension a little under the lead, a fight on a par.
 */
export const LAYER_GAIN: Record<MusicLayer, number> = { bed: 1, motif: 1, tension: 1.3, combat: 1.05, sting: 1.1 };
/**
 * The score's overall level against the effects and the beds (deck gain). Round 3: +1.5 dB (1.35 ->
 * 1.6) so the calm music is present on a phone at the default volumes (the walk measured -30.5 LUFS
 * for the score alone, the limiter idle); in a fight the score still sits under the effects.
 */
export const MUSIC_LEVEL = 1.6;

/** Stem fades (time constants, s): danger rises fast, ebbs slowly; a fight arrives on the beat. */
const RISE: Record<MusicLayer, number> = { bed: 1.2, motif: 1.0, tension: 0.6, combat: 0.25, sting: 0.05 };
const FALL: Record<MusicLayer, number> = { bed: 1.6, motif: 1.4, tension: 1.8, combat: 2.2, sting: 0.05 };

interface Stem {
  dry: GainNode;
  wet: GainNode | null;
  target: SynthTarget;
  level: number;
}

interface Deck {
  id: ScoreId;
  scheduler: MusicScheduler;
  dry: GainNode;
  wet: GainNode | null;
  stems: Record<MusicLayer, Stem>;
  level: number;
  fading: boolean;
  /** When the deck's nodes can be released (its fade done, its notes rung out). */
  disposeAt: number;
  /** Notes it has started (diagnostics: a fading deck starts none). */
  started: number;
}

export interface PlayOptions {
  /** Fade-in time constant (s) of the new deck, and the fade-out of the one it replaces. */
  fadeIn?: number;
  fadeOut?: number;
  /** Seconds before the new score's first beat. */
  delay?: number;
}

/** Plays the scores: decks that crossfade, each with a stem per layer that follows the danger. */
export class MusicPlayer {
  private readonly voices: VoiceLimiter<{ v: Voice; deck: Deck }>;
  private readonly batch: MusicNote[] = [];
  private decks: Deck[] = [];
  private current: Deck | null = null;
  private now = 0;
  /** The audio clock at the last update, and the widest gap between updates lately (s). */
  private lastUpdate = Number.NaN;
  private span = 0;
  private seed: number;
  private mix: LayerMix = { ...CALM_MIX };
  private stingUntil = 0;
  /** Notes started per layer (diagnostics and tests). */
  readonly played: Record<MusicLayer, number> = { bed: 0, motif: 0, tension: 0, combat: 0, sting: 0 };

  constructor(private readonly target: SynthTarget, seed: number) {
    this.seed = seed;
    this.voices = new VoiceLimiter(MUSIC_VOICES, (e) => e.v.kill(this.now, 0.6));
  }

  get activeVoices(): number {
    return this.voices.size;
  }

  /** The score playing now (null: none). */
  get score(): ScoreId | null {
    return this.current?.id ?? null;
  }

  /** Decks alive (the current one and any still fading out). */
  get deckCount(): number {
    return this.decks.length;
  }

  /** Every live deck: its score, whether it is fading out, and how many notes it has started (tests, debug). */
  deckInfo(): Array<{ id: ScoreId; fading: boolean; started: number }> {
    return this.decks.map((d) => ({ id: d.id, fading: d.fading, started: d.started }));
  }

  /** The current deck's composer (tests, debug). */
  get scheduler(): MusicScheduler | null {
    return this.current?.scheduler ?? null;
  }

  /** The stems' target levels of the current deck (debug). */
  levels(): Record<MusicLayer, number> | null {
    const d = this.current;
    if (!d) return null;
    return { bed: d.stems.bed.level, motif: d.stems.motif.level, tension: d.stems.tension.level, combat: d.stems.combat.level, sting: d.stems.sting.level };
  }

  /** Switch to `id` (crossfade), or keep playing when it is already the current score. */
  play(id: ScoreId | null, now: number, opts: PlayOptions = {}): void {
    if ((this.current?.id ?? null) === id) return;
    const fadeOut = opts.fadeOut ?? 2.5;
    if (this.current) this.fadeOut(this.current, now, fadeOut);
    this.current = null;
    if (id === null) return;
    const ctx = this.target.ctx;
    const score = SCORES[id];
    const level = (score.level ?? 1) * MUSIC_LEVEL;
    const dry = ctx.createGain();
    dry.gain.value = 0;
    dry.connect(this.target.out);
    let wet: GainNode | null = null;
    if (this.target.wet) {
      wet = ctx.createGain();
      wet.gain.value = 0;
      wet.connect(this.target.wet);
    }
    const stems = {} as Record<MusicLayer, Stem>;
    for (const layer of MUSIC_LAYERS) {
      const sd = ctx.createGain();
      sd.connect(dry);
      let sw: GainNode | null = null;
      if (wet) {
        sw = ctx.createGain();
        sw.connect(wet);
      }
      const start = layer === 'sting' ? 1 : this.mix[layer as keyof LayerMix];
      sd.gain.value = start * LAYER_GAIN[layer];
      if (sw) sw.gain.value = start * LAYER_GAIN[layer];
      stems[layer] = { dry: sd, wet: sw, target: { ...this.target, out: sd, wet: sw }, level: start };
    }
    const fadeIn = opts.fadeIn ?? 1.2;
    dry.gain.setTargetAtTime(level, now, fadeIn);
    wet?.gain.setTargetAtTime(level, now, fadeIn);
    this.seed = (this.seed * 1103515245 + 12345) >>> 0;
    const deck: Deck = { id, scheduler: new MusicScheduler(score, this.seed, opts.delay ?? 0.6), dry, wet, stems, level, fading: false, disposeAt: Infinity, started: 0 };
    this.decks.push(deck);
    this.current = deck;
  }

  /** The danger's layer mix for the current deck (targets; the stems fade to them). */
  setMix(mix: Readonly<LayerMix>, now: number): void {
    this.mix.bed = mix.bed;
    this.mix.motif = mix.motif;
    this.mix.tension = mix.tension;
    this.mix.combat = mix.combat;
    const d = this.current;
    if (!d) return;
    // While a stinger speaks, the bed and the motif step back.
    const duck = now < this.stingUntil ? 0.45 : 1;
    this.stem(d, 'bed', mix.bed * duck, now);
    this.stem(d, 'motif', mix.motif * duck, now);
    this.stem(d, 'tension', mix.tension, now);
    this.stem(d, 'combat', mix.combat, now);
  }

  /** A guardian fight's phase for the current deck (MusicScheduler.setPhase); a new deck starts at 1. */
  setPhase(phase: number, phases?: number): void {
    this.current?.scheduler.setPhase(phase, phases);
  }

  /** A stinger on the current deck (its key and tempo). Returns its length in seconds. */
  sting(kind: StingKind, now: number): number {
    const d = this.current;
    if (!d) return 0;
    const len = d.scheduler.sting(kind, now + 0.08);
    this.stingUntil = Math.max(this.stingUntil, now + len);
    this.setMix(this.mix, now);
    return len;
  }

  /** How far ahead the notes are handed out now (s): wider while the frames come slowly. */
  get lookahead(): number {
    return Math.min(MAX_LOOKAHEAD, Math.max(LOOKAHEAD, this.span * 1.5 + 0.05));
  }

  update(now: number, mix: Readonly<LayerMix> = this.mix): void {
    // A slow device (or a stalled frame) widens the window so no note falls between two frames; it
    // eases back once the frames come quickly again.
    const gap = Number.isFinite(this.lastUpdate) ? Math.max(0, now - this.lastUpdate) : 0;
    this.lastUpdate = now;
    this.span = gap > this.span ? Math.min(gap, 2) : this.span + (gap - this.span) * 0.02;
    this.now = now;
    if (mix !== this.mix) this.setMix(mix, now);
    else if (this.stingUntil > 0 && now >= this.stingUntil) {
      this.stingUntil = 0;
      this.setMix(this.mix, now);
    }
    const d = this.current;
    if (d) {
      const n = d.scheduler.advance(now, now + this.lookahead, this.mix, this.batch);
      for (let i = 0; i < n; i++) this.start(d, this.batch[i], now);
    }
    // Release decks that have faded and rung out.
    if (this.decks.length > 1 || (this.decks.length === 1 && this.decks[0] !== this.current)) {
      const keep: Deck[] = [];
      for (const deck of this.decks) {
        if (deck !== this.current && now >= deck.disposeAt) this.release(deck);
        else keep.push(deck);
      }
      this.decks = keep;
    }
  }

  /** Fade out everything that is sounding or already scheduled. */
  stop(now: number): void {
    for (const deck of this.decks) this.fadeOut(deck, now, 0.15);
    this.current = null;
    this.voices.clear((e) => e.v.kill(now, 0.5));
  }

  // -------------------------------------------------------------------------------------

  private start(deck: Deck, note: MusicNote, now: number): void {
    const priority = this.priorityOf(deck, note);
    if (!this.voices.admit(now, priority)) return;
    const v = playMusicNote(deck.stems[note.layer].target, note);
    this.voices.add({ v, deck }, note.time, v.end, priority);
    this.played[note.layer]++;
    deck.started++;
  }

  private priorityOf(deck: Deck, note: MusicNote): number {
    return musicPriority(note, deck.scheduler.score.lead);
  }

  private stem(d: Deck, layer: MusicLayer, value: number, now: number): void {
    const s = d.stems[layer];
    if (Math.abs(value - s.level) < 0.01) return;
    const tc = value > s.level ? RISE[layer] : FALL[layer];
    s.level = value;
    s.dry.gain.setTargetAtTime(value * LAYER_GAIN[layer], now, tc);
    s.wet?.gain.setTargetAtTime(value * LAYER_GAIN[layer], now, tc);
  }

  private fadeOut(deck: Deck, now: number, tc: number): void {
    if (deck.fading) return;
    deck.fading = true;
    deck.scheduler.clear();
    deck.dry.gain.cancelScheduledValues(now);
    deck.dry.gain.setTargetAtTime(0, now, tc);
    deck.wet?.gain.cancelScheduledValues(now);
    deck.wet?.gain.setTargetAtTime(0, now, tc);
    // Its voices are the first to be stolen from now on.
    this.voices.reprioritize((e) => e.deck === deck, MUSIC_PRIORITY.fading);
    deck.disposeAt = now + tc * 6 + 1;
  }

  private release(deck: Deck): void {
    // Anything of it still ringing is silent by now (its deck faded out): cut it and free the nodes.
    this.voices.removeWhere((e) => e.deck === deck, (e) => e.v.kill(this.now, 0.05));
    for (const s of Object.values(deck.stems)) {
      s.dry.disconnect();
      s.wet?.disconnect();
    }
    deck.dry.disconnect();
    deck.wet?.disconnect();
  }
}
