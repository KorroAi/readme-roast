import type { BiomeId } from '../config/biomes';
import type { Timbre } from './instruments';
import type { ModeName } from './theory';

/**
 * The scores (round 3, AUDIO): one per biome, the Heart, the camp, the title, the ending, a guardian
 * theme per stratum and the Heart's boss. Pure data, read by the composer (MusicScheduler).
 *
 * Each biome is recognisable by four things at once: its mode, its tempo and metre, its timbres and
 * its motif (a two-bar melody stated plainly on arrival and recurring, varied, as you explore). The
 * layers follow the danger: the bed and the motif while exploring; a bass ostinato and a heartbeat
 * pulse when monsters are near (tension); drums and a driving bass in a fight (combat); and a
 * guardian theme in a lair. Exploration music breathes: phrases with bars of rest between them, and
 * longer silences now and then, so the ambience carries the cave too.
 */

export type GuardianScoreId = 'guardian1' | 'guardian2' | 'guardian3' | 'guardian4' | 'guardian5' | 'guardian6';
export type ScoreId = BiomeId | 'camp' | 'menu' | 'ending' | GuardianScoreId | 'heartBoss';

/** A motif note: scale degree from the tonic (negative: below), start and length in beats, velocity. */
export interface MotifNote {
  d: number;
  at: number;
  len: number;
  vel?: number;
}

/**
 * A rhythm on the score's grid (meter x sub steps per bar). Drums: 'x' accent, 'o' normal, 'g' ghost,
 * '.' rest. Bass lines: '1' root, '3' third, '4' fourth, '5' fifth, '7' seventh, '8' octave (chord
 * tones by scale degree), '-' holds the previous note, '.' rests.
 */
export interface Pattern {
  steps: string;
  timbre: Timbre;
  /** Velocity scale. */
  vel: number;
  /** MIDI pitch for tuned percussion (default 48 for drums). */
  midi?: number;
  /** Plays only on every n-th bar (1 = every bar). */
  every?: number;
}

export interface ScoreDef {
  id: ScoreId;
  /** MIDI tonic of the lead register; pads play an octave below, the bass two. */
  tonic: number;
  mode: ModeName;
  bpm: number;
  /** Beats per bar and grid steps per beat (3: a compound, rolling feel). */
  meter: number;
  sub: 2 | 3;
  /** Delay of the off-beat steps (0..0.3 of a step, straight grids only). */
  swing?: number;
  /** Chord roots (scale degrees), one every `chordBars` bars. */
  progression: readonly number[];
  chordBars: 1 | 2;
  /** Pad voicing: scale-degree offsets above the chord root (open, spread). */
  voicing: readonly number[];
  /** The biome's melody (beats from the phrase start), `motifBars` bars long. */
  motif: readonly MotifNote[];
  motifBars: 1 | 2;
  bed: Timbre;
  lead: Timbre;
  /** The second voice: arpeggios, an echo of the motif's tail, or an answer in the rests. */
  counter?: Timbre;
  counterStyle?: 'arp' | 'echo' | 'answer';
  bass: Timbre;
  /** Pad lowpass (Hz): warm and open up high, darker below. */
  brightness: number;
  /** Exploration: the chance a phrase plays the motif; bars of rest after each phrase. */
  density: number;
  rest: readonly [number, number];
  /** The chance a chord change rests the bed too (sparse scores). */
  bedRest?: number;
  /** Tension: a bass ostinato, a pulse, and a quiet high "shiver" note (a semitone above the root). */
  tension: { bass: string; pulse: Pattern | null; shiver?: Timbre };
  /** Combat: drums, a driving bass line, chord stabs on chord changes. */
  combat: { drums: readonly Pattern[]; bass: string; stab?: Timbre };
  /** Far-off percussion while exploring (the mines' anvil, the magma's slow drum). */
  explore?: readonly Pattern[];
  /** Deck level (1 = nominal). */
  level?: number;
  /** Lead octave shift (guardian horns sit lower). */
  leadOctave?: number;
}

// Shared drum kits (combat), by feel.
const kit = {
  frame: (low = 'x..x..x.', mid = '..o...o.', high = 'gogogogo'): Pattern[] => [
    { steps: low, timbre: 'frame', vel: 0.9, midi: 52 },
    { steps: mid, timbre: 'rim', vel: 0.6, midi: 60 },
    { steps: high, timbre: 'shaker', vel: 0.55 },
  ],
  taiko: (low = 'x..x..x.', mid = '..o...o.', high = 'gogogogo'): Pattern[] => [
    { steps: low, timbre: 'taiko', vel: 0.9, midi: 43 },
    { steps: mid, timbre: 'tom', vel: 0.65, midi: 50 },
    { steps: high, timbre: 'shaker', vel: 0.5 },
  ],
};

/** The game's theme (the lantern's): heard at the title, at camp in major, and in the Heart. */
const HEART_THEME: readonly MotifNote[] = [
  { d: 0, at: 0, len: 1 }, { d: 4, at: 1, len: 1 }, { d: 3, at: 2, len: 0.5 }, { d: 2, at: 2.5, len: 0.5 }, { d: 1, at: 3, len: 1 },
  { d: 2, at: 4, len: 1.5 }, { d: 1, at: 5.5, len: 0.5 }, { d: 0, at: 6, len: 2 },
];

/** The guardians' shared motif (every lair is related): a stubborn figure that climbs at the end. */
const GUARDIAN_MOTIF: readonly MotifNote[] = [
  { d: 0, at: 0, len: 0.5, vel: 1 }, { d: 0, at: 0.5, len: 0.5, vel: 0.7 }, { d: 1, at: 1, len: 0.5 }, { d: 0, at: 1.5, len: 0.5 },
  { d: -2, at: 2, len: 1 }, { d: -1, at: 3, len: 1 },
  { d: 0, at: 4, len: 0.5, vel: 1 }, { d: 0, at: 4.5, len: 0.5, vel: 0.7 }, { d: 1, at: 5, len: 0.5 }, { d: 2, at: 5.5, len: 0.5 },
  { d: 4, at: 6, len: 1, vel: 1 }, { d: 3, at: 7, len: 1 },
];

const biome = (d: Omit<ScoreDef, 'motifBars' | 'chordBars'> & Partial<Pick<ScoreDef, 'motifBars' | 'chordBars'>>): ScoreDef => ({ motifBars: 2, chordBars: 2, ...d });

export const SCORES: Record<ScoreId, ScoreDef> = {
  // ---- Stratum I
  /** Warm limestone, the starter: G mixolydian, a lilting kalimba tune over a warm pad, harp arpeggios. */
  amberHollows: biome({
    id: 'amberHollows', tonic: 67, mode: 'mixolydian', bpm: 88, meter: 4, sub: 2, swing: 0.12,
    progression: [0, 3, 6, 0], voicing: [0, 4, 7, 9],
    motif: [{ d: 0, at: 0, len: 0.75 }, { d: 2, at: 0.75, len: 0.75 }, { d: 4, at: 1.5, len: 1 }, { d: 5, at: 2.5, len: 0.5 }, { d: 4, at: 3, len: 1 },
      { d: 3, at: 4, len: 0.75 }, { d: 2, at: 4.75, len: 0.75 }, { d: 1, at: 5.5, len: 0.5 }, { d: 0, at: 6, len: 2 }],
    bed: 'warm', lead: 'kalimba', counter: 'harp', counterStyle: 'arp', bass: 'pluckBass', brightness: 1300, density: 0.6, rest: [1, 3],
    tension: { bass: '1..1..5.', pulse: { steps: 'x.......', timbre: 'heartbeat', vel: 0.5 } },
    combat: { drums: kit.frame(), bass: '1.1.5.1.' },
  }),
  /** Giant glowing fungi: E lydian in a slow waltz, a music box over a glass pad, a flute answering. */
  mushroomForest: biome({
    id: 'mushroomForest', tonic: 64, mode: 'lydian', bpm: 72, meter: 3, sub: 2,
    progression: [0, 1, 0, 5], voicing: [0, 2, 4, 6],
    motif: [{ d: 0, at: 0, len: 1 }, { d: 4, at: 1, len: 0.5 }, { d: 6, at: 1.5, len: 0.5 }, { d: 7, at: 2, len: 1 },
      { d: 6, at: 3, len: 0.5 }, { d: 4, at: 3.5, len: 0.5 }, { d: 3, at: 4, len: 1 }, { d: 2, at: 5, len: 1 }],
    bed: 'glassPad', lead: 'musicBox', counter: 'flute', counterStyle: 'answer', bass: 'subBass', brightness: 1100, density: 0.55, rest: [1, 3], bedRest: 0.15,
    tension: { bass: '1..5..', pulse: { steps: 'x.....', timbre: 'heartbeat', vel: 0.4 }, shiver: 'glass' },
    combat: { drums: [{ steps: 'x..o..', timbre: 'tom', vel: 0.85, midi: 52 }, { steps: 'o.o.o.', timbre: 'rim', vel: 0.5, midi: 64 }, { steps: 'gggggg', timbre: 'shaker', vel: 0.45 }], bass: '1.5.8.' },
  }),
  // ---- Stratum II
  /** Roots and earth: F dorian rolling in 12/8, a marimba over a reed pad, a bowed bass. */
  rootGalleries: biome({
    id: 'rootGalleries', tonic: 65, mode: 'dorian', bpm: 92, meter: 4, sub: 3,
    progression: [0, 3, 0, 6], voicing: [0, 2, 4, 7],
    motif: [{ d: 0, at: 0, len: 0.67 }, { d: 2, at: 0.67, len: 0.33 }, { d: 4, at: 1, len: 1 }, { d: 3, at: 2, len: 0.67 }, { d: 2, at: 2.67, len: 0.33 }, { d: 1, at: 3, len: 1 },
      { d: 2, at: 4, len: 0.67 }, { d: 0, at: 4.67, len: 0.33 }, { d: -1, at: 5, len: 0.67 }, { d: 0, at: 5.67, len: 2.33 }],
    bed: 'reedPad', lead: 'marimba', counter: 'pluck', counterStyle: 'echo', bass: 'bowed', brightness: 1200, density: 0.6, rest: [1, 2],
    tension: { bass: '1..1..5..1..', pulse: { steps: 'x.....x.....', timbre: 'heartbeat', vel: 0.45 } },
    combat: { drums: [{ steps: 'x..x..x..x.o', timbre: 'tom', vel: 0.85, midi: 48 }, { steps: '...o.....o..', timbre: 'frame', vel: 0.7, midi: 55 }, { steps: 'g.gg.gg.gg.g', timbre: 'shaker', vel: 0.45 }], bass: '1..5..1..8..' },
  }),
  /** Lakes and waterfalls: C# minor, a flute falling like a wave over flowing harp arpeggios. */
  floodedGrottoes: biome({
    id: 'floodedGrottoes', tonic: 61, mode: 'aeolian', bpm: 66, meter: 4, sub: 2,
    progression: [0, 5, 2, 6], voicing: [0, 4, 7, 9],
    motif: [{ d: 4, at: 0, len: 1.5 }, { d: 3, at: 1.5, len: 0.5 }, { d: 2, at: 2, len: 1 }, { d: 0, at: 3, len: 1 },
      { d: 1, at: 4, len: 0.5 }, { d: 2, at: 4.5, len: 0.5 }, { d: 4, at: 5, len: 1 }, { d: 3, at: 6, len: 2 }],
    bed: 'glassPad', lead: 'flute', counter: 'harp', counterStyle: 'arp', bass: 'subBass', brightness: 900, density: 0.55, rest: [1, 3],
    tension: { bass: '1...1.5.', pulse: { steps: 'x.......', timbre: 'heartbeat', vel: 0.4 }, shiver: 'glass' },
    combat: { drums: [{ steps: 'x...x..x', timbre: 'taiko', vel: 0.85, midi: 43 }, { steps: 'o.o..o.o', timbre: 'drop', vel: 0.5, midi: 79 }, { steps: 'g.g.g.g.', timbre: 'shaker', vel: 0.45 }], bass: '1.1.5.1.' },
    explore: [{ steps: '......g.', timbre: 'drop', vel: 0.35, midi: 84, every: 2 }],
  }),
  // ---- Stratum III
  /** Crystal forests: A lydian, a celesta chiming wide intervals over a shimmering pad. */
  crystalGeode: biome({
    id: 'crystalGeode', tonic: 69, mode: 'lydian', bpm: 76, meter: 4, sub: 2,
    progression: [0, 1, 5, 0], voicing: [0, 4, 7, 11],
    motif: [{ d: 0, at: 0, len: 0.5 }, { d: 4, at: 0.5, len: 0.5 }, { d: 8, at: 1, len: 1.5 }, { d: 7, at: 2.5, len: 0.5 }, { d: 6, at: 3, len: 1 },
      { d: 4, at: 4, len: 0.5 }, { d: 3, at: 4.5, len: 0.5 }, { d: 4, at: 5, len: 3 }],
    bed: 'shimmer', lead: 'celesta', counter: 'glass', counterStyle: 'echo', bass: 'subBass', brightness: 1300, density: 0.5, rest: [1, 3],
    tension: { bass: '1.......', pulse: { steps: 'x...x...', timbre: 'heartbeat', vel: 0.38 }, shiver: 'glass' },
    combat: { drums: [{ steps: 'x..x.x..', timbre: 'tom', vel: 0.85, midi: 50 }, { steps: 'o.....o.', timbre: 'anvil', vel: 0.4, midi: 76 }, { steps: 'gggggggg', timbre: 'shaker', vel: 0.4 }], bass: '1..1.5..' },
  }),
  /** Timber, rails, lamps: E dorian work song on a plucked string over a reed organ; a far anvil. */
  haldenMines: biome({
    id: 'haldenMines', tonic: 64, mode: 'dorian', bpm: 96, meter: 4, sub: 2, swing: 0.18,
    progression: [0, 3, 0, 4], voicing: [0, 2, 4, 7],
    motif: [{ d: 0, at: 0, len: 0.5 }, { d: 0, at: 0.5, len: 0.5 }, { d: 2, at: 1, len: 0.5 }, { d: 4, at: 1.5, len: 0.5 }, { d: 3, at: 2, len: 1 }, { d: 2, at: 3, len: 1 },
      { d: 1, at: 4, len: 0.5 }, { d: 2, at: 4.5, len: 0.5 }, { d: 1, at: 5, len: 0.5 }, { d: -1, at: 5.5, len: 0.5 }, { d: 0, at: 6, len: 2 }],
    bed: 'organ', lead: 'pluck', counter: 'whistle', counterStyle: 'answer', bass: 'pluckBass', brightness: 1100, density: 0.6, rest: [1, 2],
    tension: { bass: '1.1.1.1.', pulse: { steps: 'x...x...', timbre: 'heartbeat', vel: 0.4 } },
    combat: { drums: [{ steps: 'x..x..x.', timbre: 'tom', vel: 0.85, midi: 48 }, { steps: '..o...o.', timbre: 'anvil', vel: 0.5, midi: 64 }, { steps: 'gogogogo', timbre: 'shaker', vel: 0.45 }], bass: '1.1.5.15' },
    explore: [{ steps: 'o.......', timbre: 'anvil', vel: 0.2, midi: 62, every: 2 }],
  }),
  // ---- Stratum IV
  /** Blue ice: F# minor at its slowest and sparest, a glass harmonica, a celesta echo, long rests. */
  frostCaverns: biome({
    id: 'frostCaverns', tonic: 66, mode: 'aeolian', bpm: 60, meter: 4, sub: 2,
    progression: [0, 5, 3, 0], voicing: [0, 4, 9],
    motif: [{ d: 7, at: 0, len: 2 }, { d: 6, at: 2, len: 1 }, { d: 4, at: 3, len: 1 }, { d: 2, at: 4, len: 1 }, { d: 3, at: 5, len: 1 }, { d: 0, at: 6, len: 2 }],
    bed: 'glassPad', lead: 'glass', counter: 'celesta', counterStyle: 'echo', bass: 'subBass', brightness: 800, density: 0.45, rest: [2, 4], bedRest: 0.3,
    tension: { bass: '1.......', pulse: { steps: 'x.......', timbre: 'heartbeat', vel: 0.45 }, shiver: 'glass' },
    combat: { drums: [{ steps: 'x...x.x.', timbre: 'taiko', vel: 0.85, midi: 43 }, { steps: '..o...o.', timbre: 'snap', vel: 0.55, midi: 72 }, { steps: 'g.g.g.g.', timbre: 'shaker', vel: 0.4 }], bass: '1...5.1.' },
  }),
  /** Bioluminescent vines: A dorian at a lively tempo, a pan flute and kalimba, soft hand drums even exploring. */
  glowrootJungle: biome({
    id: 'glowrootJungle', tonic: 69, mode: 'dorian', bpm: 104, meter: 4, sub: 2,
    progression: [0, 2, 3, 0], voicing: [0, 4, 7, 9],
    motif: [{ d: 4, at: 0, len: 0.5 }, { d: 2, at: 0.75, len: 0.5 }, { d: 4, at: 1.5, len: 0.5 }, { d: 5, at: 2, len: 0.5 }, { d: 4, at: 2.5, len: 0.5 }, { d: 2, at: 3, len: 1 },
      { d: 0, at: 4, len: 0.5 }, { d: 2, at: 4.5, len: 0.25 }, { d: 3, at: 4.75, len: 0.75 }, { d: 2, at: 5.5, len: 0.5 }, { d: 0, at: 6, len: 0.5 }, { d: -1, at: 6.5, len: 1.5 }],
    bed: 'warm', lead: 'panFlute', counter: 'kalimba', counterStyle: 'arp', bass: 'pluckBass', brightness: 1500, density: 0.65, rest: [1, 2],
    tension: { bass: '1..1..1.', pulse: { steps: 'x...x...', timbre: 'heartbeat', vel: 0.35 } },
    combat: { drums: [{ steps: 'x..x..x.', timbre: 'tom', vel: 0.85, midi: 50 }, { steps: '..o...o.', timbre: 'clap', vel: 0.55 }, { steps: 'gogogogo', timbre: 'shaker', vel: 0.45 }], bass: '1.15.1.5' },
    explore: [{ steps: 'g..g..g.', timbre: 'shaker', vel: 0.22 }, { steps: '......o.', timbre: 'tom', vel: 0.2, midi: 55, every: 2 }],
  }),
  // ---- Stratum V
  /** Toxic pools: B-flat phrygian in an uneasy 5/4, a sour reed slithering over a murky pad, bubbles. */
  sulphurBog: biome({
    id: 'sulphurBog', tonic: 70, mode: 'phrygian', bpm: 70, meter: 5, sub: 2,
    progression: [0, 1, 0, 6], voicing: [0, 4, 7],
    motif: [{ d: 0, at: 0, len: 1 }, { d: 1, at: 1, len: 0.5 }, { d: 0, at: 1.5, len: 0.5 }, { d: -1, at: 2, len: 1 }, { d: 0, at: 3, len: 2 },
      { d: 3, at: 5, len: 0.5 }, { d: 2, at: 5.5, len: 0.5 }, { d: 1, at: 6, len: 1 }, { d: 0, at: 7, len: 3 }],
    bed: 'murk', lead: 'reed', bass: 'subBass', brightness: 700, density: 0.5, rest: [1, 3],
    tension: { bass: '1....1..5.', pulse: { steps: 'x....x....', timbre: 'heartbeat', vel: 0.4 } },
    combat: { drums: [{ steps: 'x..x..x.x.', timbre: 'tom', vel: 0.85, midi: 46 }, { steps: '.o...o..o.', timbre: 'rim', vel: 0.5, midi: 58 }, { steps: 'g.g.g.g.g.', timbre: 'shaker', vel: 0.4 }], bass: '1.1..5.1..' },
    explore: [{ steps: '.......g..', timbre: 'drop', vel: 0.3, midi: 58 }],
  }),
  /** Carved halls and gold runes: D phrygian dominant, a horn and temple bells over a choir; a far gong. */
  sunkenCity: biome({
    id: 'sunkenCity', tonic: 62, mode: 'phrygianDominant', bpm: 64, meter: 4, sub: 2,
    progression: [0, 1, 6, 0], voicing: [0, 2, 4, 7],
    motif: [{ d: 0, at: 0, len: 1 }, { d: 1, at: 1, len: 0.5 }, { d: 2, at: 1.5, len: 0.5 }, { d: 4, at: 2, len: 2 },
      { d: 5, at: 4, len: 0.5 }, { d: 4, at: 4.5, len: 0.5 }, { d: 2, at: 5, len: 1 }, { d: 1, at: 6, len: 0.5 }, { d: 0, at: 6.5, len: 1.5 }],
    bed: 'choirPad', lead: 'horn', counter: 'bell', counterStyle: 'answer', bass: 'bowed', brightness: 1000, density: 0.5, rest: [1, 3],
    tension: { bass: '1...1...', pulse: { steps: 'x...x...', timbre: 'heartbeat', vel: 0.4 } },
    combat: { drums: kit.taiko('x..x..x.', '..o..o.o', 'g.g.g.g.'), bass: '1.1.5.1.' },
    explore: [{ steps: 'o.......', timbre: 'gong', vel: 0.16, midi: 45, every: 8 }],
  }),
  // ---- Stratum VI
  /** Lava rivers: C phrygian, brass over a dark drone, the earth's slow drum even when calm. */
  magmaVeins: biome({
    id: 'magmaVeins', tonic: 60, mode: 'phrygian', bpm: 80, meter: 4, sub: 2,
    progression: [0, 1, 5, 0], voicing: [0, 4, 7],
    motif: [{ d: 0, at: 0, len: 1.5 }, { d: 1, at: 1.5, len: 0.5 }, { d: 0, at: 2, len: 1 }, { d: -2, at: 3, len: 1 }, { d: -1, at: 4, len: 1 }, { d: 0, at: 5, len: 1 }, { d: -3, at: 6, len: 2 }],
    bed: 'drone', lead: 'brass', bass: 'sawBass', brightness: 900, density: 0.55, rest: [1, 2],
    tension: { bass: '1.1.1.1.', pulse: { steps: 'x..x....', timbre: 'heartbeat', vel: 0.45 } },
    combat: { drums: [...kit.taiko(), { steps: 'x.......', timbre: 'boom', vel: 0.6, midi: 36, every: 2 }], bass: '1.1.1.15' },
    explore: [{ steps: 'x.......', timbre: 'taiko', vel: 0.28, midi: 40, every: 2 }],
    leadOctave: -1,
  }),
  /** Black glass and violet void: a whole-tone scale, a glass harmonica and bells over beating sines. */
  obsidianAbyss: biome({
    id: 'obsidianAbyss', tonic: 63, mode: 'wholeTone', bpm: 56, meter: 4, sub: 2,
    progression: [0, 1, 0, 3], voicing: [0, 2, 4],
    motif: [{ d: 0, at: 0, len: 1 }, { d: 3, at: 1, len: 1 }, { d: 2, at: 2, len: 2 }, { d: 4, at: 4, len: 1 }, { d: 1, at: 5, len: 1 }, { d: 0, at: 6, len: 2 }],
    bed: 'voidPad', lead: 'glass', counter: 'bell', counterStyle: 'echo', bass: 'subBass', brightness: 700, density: 0.4, rest: [2, 4], bedRest: 0.25,
    tension: { bass: '1.......', pulse: { steps: 'x.......', timbre: 'heartbeat', vel: 0.5 }, shiver: 'glass' },
    combat: { drums: [{ steps: 'x...x...', timbre: 'boom', vel: 0.8, midi: 38 }, { steps: '..o..o..', timbre: 'tom', vel: 0.6, midi: 46 }, { steps: 'g...g.g.', timbre: 'snap', vel: 0.4, midi: 70 }], bass: '1...1.5.' },
    explore: [{ steps: 'x.......', timbre: 'boom', vel: 0.2, midi: 36, every: 4 }],
  }),
  /** The Heart: the game's theme in D minor, a choir over an organ, bells answering. */
  heart: biome({
    id: 'heart', tonic: 62, mode: 'aeolian', bpm: 70, meter: 4, sub: 2,
    progression: [0, 5, 3, 4], voicing: [0, 2, 4, 7],
    motif: HEART_THEME,
    bed: 'organ', lead: 'choir', counter: 'bell', counterStyle: 'answer', bass: 'bowed', brightness: 1000, density: 0.55, rest: [1, 2],
    tension: { bass: '1...1...', pulse: { steps: 'x...x...', timbre: 'heartbeat', vel: 0.55 } },
    combat: { drums: kit.taiko(), bass: '1.1.5.1.' },
  }),

  // ---- Home, the title, the ending
  /** The camp: the theme in D major, a harp and a warm pad, mostly silence. */
  camp: biome({
    id: 'camp', tonic: 62, mode: 'ionian', bpm: 76, meter: 3, sub: 2,
    progression: [0, 3, 4, 0], voicing: [0, 4, 8, 9],
    motif: [{ d: 0, at: 0, len: 1 }, { d: 4, at: 1, len: 1 }, { d: 3, at: 2, len: 0.5 }, { d: 2, at: 2.5, len: 0.5 }, { d: 1, at: 3, len: 1 }, { d: 2, at: 4, len: 1 }, { d: 0, at: 5, len: 1 }],
    bed: 'warm', lead: 'harp', counter: 'kalimba', counterStyle: 'echo', bass: 'pluckBass', brightness: 1400, density: 0.4, rest: [2, 5], bedRest: 0.35,
    tension: { bass: '1.....', pulse: null },
    combat: { drums: [], bass: '1.....' },
    level: 0.7,
  }),
  /** The title: the theme in D minor on a harp over a glass pad, a celesta echo. */
  menu: biome({
    id: 'menu', tonic: 62, mode: 'aeolian', bpm: 66, meter: 4, sub: 2,
    progression: [0, 5, 3, 4], voicing: [0, 4, 7, 9],
    motif: HEART_THEME,
    bed: 'glassPad', lead: 'harp', counter: 'celesta', counterStyle: 'echo', bass: 'subBass', brightness: 1000, density: 0.75, rest: [1, 2],
    tension: { bass: '1.......', pulse: null },
    combat: { drums: [], bass: '1.......' },
    level: 0.85,
  }),
  /** The ending: the Heart relit, the theme in D major on a horn, a choir and harp arpeggios, a slow procession. */
  ending: biome({
    id: 'ending', tonic: 62, mode: 'ionian', bpm: 68, meter: 4, sub: 2,
    progression: [0, 5, 3, 4], voicing: [0, 2, 4, 7, 9],
    motif: HEART_THEME,
    bed: 'choirPad', lead: 'horn', counter: 'harp', counterStyle: 'arp', bass: 'bowed', brightness: 1500, density: 0.95, rest: [0, 1],
    tension: { bass: '1.......', pulse: null },
    combat: { drums: [], bass: '1.......' },
    explore: [{ steps: 'x.......', timbre: 'taiko', vel: 0.22, midi: 43, every: 2 }, { steps: 'o.......', timbre: 'gong', vel: 0.14, midi: 50, every: 8 }],
  }),

  // ---- Guardian themes, one per stratum (the same motif, each stratum's colour)
  guardian1: guardian('guardian1', 69, 'aeolian', 120, { bed: 'drone', lead: 'horn', counter: 'kalimba', bass: 'sawBass' }, kit.taiko()),
  guardian2: guardian('guardian2', 72, 'aeolian', 116, { bed: 'tremolo', lead: 'horn', counter: 'marimba', bass: 'bowed' },
    [{ steps: 'x..x..x.', timbre: 'tom', vel: 0.9, midi: 45 }, { steps: 'o.o..o.o', timbre: 'drop', vel: 0.5, midi: 76 }, { steps: 'gogogogo', timbre: 'shaker', vel: 0.5 }]),
  guardian3: guardian('guardian3', 67, 'phrygian', 124, { bed: 'organ', lead: 'brass', counter: 'bell', bass: 'sawBass' },
    [{ steps: 'x..x..x.', timbre: 'taiko', vel: 0.9, midi: 43 }, { steps: '..o...o.', timbre: 'anvil', vel: 0.55, midi: 66 }, { steps: 'gogogogo', timbre: 'shaker', vel: 0.5 }]),
  guardian4: guardian('guardian4', 64, 'aeolian', 128, { bed: 'tremolo', lead: 'brass', counter: 'celesta', bass: 'sawBass' },
    [{ steps: 'x..x..x.', timbre: 'taiko', vel: 0.9, midi: 43 }, { steps: '..o...o.', timbre: 'snap', vel: 0.55, midi: 72 }, { steps: 'gogogogo', timbre: 'shaker', vel: 0.5 }]),
  guardian5: guardian('guardian5', 65, 'phrygianDominant', 112, { bed: 'choirPad', lead: 'reed', counter: 'bell', bass: 'bowed' },
    [...kit.taiko('x..x..x.', '..o..o.o', 'g.g.g.g.'), { steps: 'o.......', timbre: 'gong', vel: 0.3, midi: 45, every: 4 }]),
  guardian6: guardian('guardian6', 62, 'phrygian', 132, { bed: 'organ', lead: 'brass', counter: 'choir', bass: 'sawBass' },
    [...kit.taiko(), { steps: 'x.......', timbre: 'boom', vel: 0.65, midi: 36, every: 2 }]),
  /** The Heart's boss: the guardian motif and, from its last phase, the game's theme above it. */
  heartBoss: {
    ...guardian('heartBoss', 62, 'phrygian', 120, { bed: 'organ', lead: 'brass', counter: 'choir', bass: 'sawBass' },
      [...kit.taiko(), { steps: 'x...x...', timbre: 'boom', vel: 0.6, midi: 36 }, { steps: 'o.......', timbre: 'gong', vel: 0.3, midi: 43, every: 4 }]),
    counterStyle: 'answer',
  },
};

function guardian(id: GuardianScoreId | 'heartBoss', tonic: number, mode: ModeName, bpm: number, t: { bed: Timbre; lead: Timbre; counter: Timbre; bass: Timbre }, drums: readonly Pattern[]): ScoreDef {
  return {
    id, tonic, mode, bpm, meter: 4, sub: 2,
    progression: [0, 5, 3, 4], chordBars: 2, voicing: [0, 4, 7],
    motif: GUARDIAN_MOTIF, motifBars: 2,
    bed: t.bed, lead: t.lead, counter: t.counter, counterStyle: 'echo', bass: t.bass,
    brightness: 1200, density: 1, rest: [0, 0],
    tension: { bass: '1.1.1.1.', pulse: null },
    combat: { drums, bass: '1.1.1.15', stab: 'brass' },
    leadOctave: -1,
  };
}

export const SCORE_IDS = Object.keys(SCORES) as ScoreId[];
export const BIOME_SCORES: readonly BiomeId[] = ['amberHollows', 'mushroomForest', 'rootGalleries', 'floodedGrottoes', 'crystalGeode', 'haldenMines', 'frostCaverns', 'glowrootJungle', 'sulphurBog', 'sunkenCity', 'magmaVeins', 'obsidianAbyss', 'heart'];

export const isGuardianScore = (id: ScoreId): boolean => id.startsWith('guardian') || id === 'heartBoss';

/** The guardian theme of a stratum (the Heart's boss for 'heartOfDark'). */
export function guardianScoreFor(stratum: number, heart = false): ScoreId {
  if (heart) return 'heartBoss';
  const s = Math.max(1, Math.min(6, Math.round(stratum || 1)));
  return `guardian${s}` as GuardianScoreId;
}

/** Steps per bar of a score's grid. */
export const stepsPerBar = (s: ScoreDef): number => s.meter * s.sub;
