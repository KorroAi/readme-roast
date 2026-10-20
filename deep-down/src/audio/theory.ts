// Pure music theory for the generative score: modes, note frequencies and the moods that
// map the player's situation (camp, depth) to a key, a mode and a pacing.

/** Scale steps in semitones above the tonic. */
export const MODES = {
  ionian: [0, 2, 4, 5, 7, 9, 11],
  lydian: [0, 2, 4, 6, 7, 9, 11],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  aeolian: [0, 2, 3, 5, 7, 8, 10],
  phrygian: [0, 1, 3, 5, 7, 8, 10],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
  pentatonic: [0, 2, 4, 7, 9],
  wholeTone: [0, 2, 4, 6, 8, 10],
} as const satisfies Record<string, readonly number[]>;

export type ModeName = keyof typeof MODES;

/** Equal-tempered frequency of a MIDI note (A4 = 69 = 440 Hz). */
export const midiToHz = (midi: number): number => 440 * Math.pow(2, (midi - 69) / 12);

/** MIDI note of a scale degree. Degree 0 is the tonic; degrees outside 0..6 move by octaves. */
export function degreeToMidi(tonic: number, mode: ModeName, degree: number): number {
  const steps = MODES[mode];
  const octave = Math.floor(degree / steps.length);
  return tonic + octave * 12 + steps[degree - octave * steps.length];
}

/** True when the MIDI note belongs to the mode built on `tonic` (any octave). */
export function inMode(midi: number, tonic: number, mode: ModeName): boolean {
  const pc = (((midi - tonic) % 12) + 12) % 12;
  return (MODES[mode] as readonly number[]).includes(pc);
}

/** Perceptual volume curve: sliders feel linear in loudness when gain grows with the square. */
export const volumeToGain = (v: number): number => {
  const c = v < 0 ? 0 : v > 1 ? 1 : v;
  return c * c;
};

/** The score's moods: the surface camp, the old depth bands, and one per biome (`b0` … `b13`, SPEC §6.5, §10.10). */
export type MoodName = 'camp' | 'shallow' | 'mid' | 'deep' | `b${number}`;

export interface MoodDef {
  /** MIDI tonic of the melody register; pads sit an octave lower. */
  tonic: number;
  mode: ModeName;
  /** Chord roots (scale degrees) the harmony wanders between. */
  progression: readonly number[];
  /** Chord voicing as scale-degree offsets above the chord root (open, spread voicings). */
  voicing: readonly number[];
  /** Pad lowpass cutoff in Hz: warm and open at camp, dark in the depths. */
  brightness: number;
  phrase: readonly [number, number];
  /** Silence after each phrase, in seconds. Long silences are part of the score. */
  rest: readonly [number, number];
  plucks: readonly [number, number];
  /** Probability that a phrase is plucks only, with no pad underneath. */
  sparse: number;
}

// D ionian with add9 voicings at camp (warm, major-ish); D dorian in the upper tunnels;
// A aeolian in the Hollow; A phrygian with bare fifths in the deep.
export const MOODS: Record<string, MoodDef> = {
  camp: {
    tonic: 62, mode: 'ionian', progression: [0, 3, 4, 5], voicing: [0, 4, 8, 9],
    brightness: 1500, phrase: [9, 14], rest: [3, 8], plucks: [2, 6], sparse: 0,
  },
  shallow: {
    tonic: 62, mode: 'dorian', progression: [0, 3, 6, 2], voicing: [0, 4, 9],
    brightness: 1100, phrase: [10, 16], rest: [5, 12], plucks: [1, 5], sparse: 0.15,
  },
  mid: {
    tonic: 57, mode: 'aeolian', progression: [0, 5, 3, 6], voicing: [0, 4, 7, 9],
    brightness: 850, phrase: [11, 18], rest: [7, 16], plucks: [1, 4], sparse: 0.2,
  },
  deep: {
    tonic: 57, mode: 'phrygian', progression: [0, 1, 6, 3], voicing: [0, 4, 7],
    brightness: 600, phrase: [12, 20], rest: [9, 22], plucks: [0, 3], sparse: 0.3,
  },
};

/** Depth thresholds (meters) between moods: upper tunnels | Lantern Hollow | the deep. */
export const MOOD_DEPTHS = { mid: 80, deep: 118 } as const;
const HYSTERESIS = 4;

/**
 * Mood for the player's situation (called every frame, allocation-free). `current` adds
 * hysteresis so standing on a depth threshold never flips the score back and forth.
 */
export function moodFor(depth: number, atCamp: boolean, current: MoodName | null = null): MoodName {
  if (atCamp) return 'camp';
  if (current === null || current === 'camp') {
    return depth >= MOOD_DEPTHS.deep ? 'deep' : depth >= MOOD_DEPTHS.mid ? 'mid' : 'shallow';
  }
  const rank = current === 'mid' ? 1 : current === 'deep' ? 2 : 0;
  const midAt = MOOD_DEPTHS.mid + (rank >= 1 ? -HYSTERESIS : HYSTERESIS);
  const deepAt = MOOD_DEPTHS.deep + (rank >= 2 ? -HYSTERESIS : HYSTERESIS);
  return depth >= deepAt ? 'deep' : depth >= midAt ? 'mid' : 'shallow';
}

/** A biome's music (config/biomes.ts `music`): its mode name, root and tempo. */
export interface BiomeMusic {
  mode: string;
  root: string;
  bpm: number;
}

const ROOTS: Record<string, number> = { C: 60, 'C#': 61, Db: 61, D: 62, 'D#': 63, Eb: 63, E: 64, F: 65, 'F#': 66, Gb: 66, G: 55, 'G#': 56, Ab: 56, A: 57, 'A#': 58, Bb: 58, B: 59 };
const MODE_OF: Record<string, ModeName> = {
  majorPentatonic: 'pentatonic', major: 'ionian', minor: 'aeolian', dorian: 'dorian', lydian: 'lydian', mixolydian: 'mixolydian',
  aeolian: 'aeolian', phrygian: 'phrygian', wholeTone: 'wholeTone', runes: 'dorian', ionian: 'ionian',
};

/** The mood of biome `k` from its music (registered once in MOODS as `b<k>`). Deeper biomes darken and slow. */
export function biomeMood(k: number, m: BiomeMusic): MoodName {
  const id = `b${k}` as const;
  if (!MOODS[id]) {
    const mode = MODE_OF[m.mode] ?? 'dorian';
    const tonic = ROOTS[m.root] ?? 62;
    const beat = 60 / Math.max(40, m.bpm);
    MOODS[id] = {
      tonic,
      mode,
      progression: mode === 'wholeTone' ? [0, 1, 3, 2] : [0, 3, 5, 4],
      voicing: mode === 'pentatonic' ? [0, 2, 4] : [0, 4, 7, 9],
      brightness: Math.max(650, 1500 - 70 * k),
      phrase: [beat * 12, beat * 20],
      rest: [beat * 4, beat * 10],
      plucks: [2, 6],
      sparse: 0.1,
    };
  }
  return id;
}
