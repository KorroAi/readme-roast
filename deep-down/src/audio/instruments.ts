import { SILENT, type NoiseColor, type Voice } from './synth';
import { midiToHz } from './theory';

/**
 * The score's instruments (round 3, AUDIO): every timbre the biome scores, the guardian themes, the
 * camp and the ending are played with, synthesized from oscillators, the shared noise buffers,
 * filters and envelopes like every other sound (sfx.ts registers each one as 'music.<timbre>' so it
 * renders offline in the tests).
 *
 * Built for a phone speaker first: the identity of each instrument sits between 250 Hz and 4 kHz
 * (a phone plays little below 300 Hz), so every low drum carries a mid "knock" and every bass has
 * harmonics a small speaker can reproduce; nothing is bright and sustained at once (pads are
 * low-passed, bright tones are percussive), so long sessions do not tire the ear.
 */
export type Timbre =
  // The bed: pads and drones.
  | 'warm' | 'glassPad' | 'choirPad' | 'organ' | 'drone' | 'murk' | 'voidPad' | 'shimmer' | 'reedPad' | 'tremolo'
  // The motif and the counter-lines.
  | 'kalimba' | 'harp' | 'celesta' | 'musicBox' | 'bell' | 'marimba' | 'flute' | 'panFlute' | 'glass' | 'reed' | 'horn'
  | 'brass' | 'choir' | 'pluck' | 'whistle'
  // Bass.
  | 'pluckBass' | 'subBass' | 'bowed' | 'sawBass'
  // Percussion (the midi note tunes it).
  | 'taiko' | 'tom' | 'frame' | 'shaker' | 'rim' | 'clap' | 'anvil' | 'gong' | 'snap' | 'boom' | 'drop' | 'heartbeat';

export type TimbreFamily = 'pad' | 'lead' | 'bass' | 'drum';

export interface NoteShape {
  /** Sustain length in seconds (pads add their own release; percussion ignores it). */
  duration: number;
  /** 0..1 */
  velocity: number;
  /** Tone colour: the pad's lowpass in Hz (other families scale their brightness from it). */
  brightness: number;
}

export interface TimbreDef {
  family: TimbreFamily;
  /** Output level (calibrated with the offline renders: leads near -24 LUFS momentary at velocity 0.7). */
  gain: number;
  /** Reverb send on top of the music bus's base send. */
  wet: number;
  /** Seconds the voice rings after its duration (release tails), for the voice limiter. */
  tail: number;
  build: (v: Voice, t: number, f: number, n: NoteShape) => void;
}

// ---------------------------------------------------------------------------------------
// Envelopes and small building blocks

/** Attack, decay to a sustain level, hold for `dur`, release: one gain stage. */
function adsr(v: Voice, t: number, a: number, d: number, s: number, dur: number, r: number, peak: number): GainNode {
  const g = v.gain(0);
  const p = g.gain;
  const hold = Math.max(t + a + d, t + dur);
  p.setValueAtTime(SILENT, t);
  p.linearRampToValueAtTime(peak, t + a);
  p.exponentialRampToValueAtTime(Math.max(SILENT * 2, peak * s), t + a + d);
  p.setValueAtTime(Math.max(SILENT * 2, peak * s), hold);
  p.exponentialRampToValueAtTime(SILENT, hold + r);
  return g;
}

/** Struck partials: each sine its own ratio, amplitude and decay (bells, bars, tines). */
function partials(v: Voice, t: number, f: number, ratios: readonly number[], amps: readonly number[], decays: readonly number[], peak: number, dest: AudioNode = v.out): void {
  const nyq = v.ctx.sampleRate * 0.45;
  for (let i = 0; i < ratios.length; i++) {
    const fr = f * ratios[i];
    if (fr >= nyq) continue;
    const d = decays[i] * v.vary(0.06);
    v.osc('sine', fr * v.vary(0.0015), t, t + d + 0.05).connect(v.perc(t, 0.002, amps[i] * peak, d)).connect(dest);
  }
}

/** A short filtered noise burst (mallet clicks, breath chiffs, drum skins). */
function tick(v: Voice, t: number, color: NoiseColor, type: BiquadFilterType, freq: number, q: number, peak: number, decay: number, dest: AudioNode = v.out): void {
  const f = v.filter(type, freq, q);
  v.noise(color, t, t + decay + 0.03).connect(f).connect(v.perc(t, 0.001, peak, decay)).connect(dest);
}

/** A sine (or other wave) whose pitch falls fast: drum bodies. */
function body(v: Voice, t: number, f0: number, f1: number, peak: number, decay: number, type: OscillatorType = 'sine', dest: AudioNode = v.out): void {
  const o = v.osc(type, f0, t, t + decay + 0.05);
  o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + decay * 0.6);
  o.connect(v.perc(t, 0.002, peak, decay)).connect(dest);
}

/** Gentle vibrato that starts after `delay` (a held note's life). */
function vibrato(v: Voice, o: OscillatorNode, f: number, t: number, end: number, rate = 5, depth = 0.004, delay = 0.25): void {
  const lfoGain = v.gain(0);
  lfoGain.gain.setValueAtTime(0, t);
  lfoGain.gain.linearRampToValueAtTime(f * depth, t + delay + 0.4);
  v.osc('sine', rate * v.vary(0.08), t, end).connect(lfoGain).connect(o.frequency);
}

const end = (t: number, n: NoteShape, release: number) => t + n.duration + release + 0.05;

// ---------------------------------------------------------------------------------------
// Pads

const PADS = {
  /** Round 1's pad: a detuned saw and a triangle through a slowly opening lowpass. */
  warm(v: Voice, t: number, f: number, n: NoteShape) {
    const a = Math.min(2.5, n.duration * 0.3);
    const r = 3;
    const b = n.brightness;
    const lp = v.filter('lowpass', b * 0.6, 0.6);
    lp.frequency.setValueAtTime(b * 0.6, t);
    lp.frequency.linearRampToValueAtTime(b, t + a);
    lp.frequency.linearRampToValueAtTime(b * 0.7, t + n.duration + r);
    lp.connect(v.swell(t, a, n.velocity, Math.max(0, n.duration - a), r)).connect(v.out);
    const stop = end(t, n, r);
    v.osc('sawtooth', f * 0.997, t, stop).connect(lp);
    v.osc('triangle', f * 1.003, t, stop).connect(v.gain(1.6)).connect(lp);
  },
  /** Glass harmonica pad: beating sine pairs and a soft octave, a slow tremolo. */
  glassPad(v: Voice, t: number, f: number, n: NoteShape) {
    const a = Math.min(2, n.duration * 0.35);
    const r = 2.5;
    const env = v.swell(t, a, n.velocity, Math.max(0, n.duration - a), r);
    const trem = v.gain(1);
    trem.connect(env).connect(v.out);
    const stop = end(t, n, r);
    v.lfo(trem.gain, 0.6 * v.vary(0.2), 0.18, t, stop);
    v.osc('sine', f * 0.9985, t, stop).connect(trem);
    v.osc('sine', f * 1.0015, t, stop).connect(trem);
    v.osc('triangle', f * 2.003, t, stop).connect(v.gain(0.22)).connect(trem);
  },
  /** A wordless choir: two saws through vowel formants, a slow vibrato. */
  choirPad(v: Voice, t: number, f: number, n: NoteShape) {
    const a = Math.min(1.8, n.duration * 0.35);
    const r = 2.6;
    const env = v.swell(t, a, n.velocity, Math.max(0, n.duration - a), r);
    const lp = v.filter('lowpass', Math.min(3200, n.brightness * 2.2), 0);
    lp.connect(env).connect(v.out);
    const stop = end(t, n, r);
    const src = v.gain(1);
    for (const [fr, q, g] of [[650, 4, 1], [1080, 5, 0.6], [2450, 6, 0.25]] as const) src.connect(v.filter('bandpass', fr * v.vary(0.03), q)).connect(v.gain(g)).connect(lp);
    for (const d of [0.996, 1.004]) {
      const o = v.osc('sawtooth', f * d, t, stop);
      vibrato(v, o, f, t, stop, 4.6, 0.005, 0.5);
      o.connect(src);
    }
  },
  /** A reed organ (harmonium): square, its octave and twelfth, a gentle tremolo. */
  organ(v: Voice, t: number, f: number, n: NoteShape) {
    const r = 0.9;
    const env = adsr(v, t, 0.18, 0.3, 0.85, n.duration, r, n.velocity);
    const lp = v.filter('lowpass', n.brightness * 1.4, 0);
    const trem = v.gain(1);
    lp.connect(trem).connect(env).connect(v.out);
    const stop = end(t, n, r);
    v.lfo(trem.gain, 5.2, 0.08, t, stop);
    v.osc('square', f, t, stop).connect(v.gain(0.55)).connect(lp);
    v.osc('triangle', f * 2, t, stop).connect(v.gain(0.5)).connect(lp);
    v.osc('sine', f * 3, t, stop).connect(v.gain(0.2)).connect(lp);
  },
  /** A dark drone: a saw and its fifth under a lowpass that breathes very slowly. */
  drone(v: Voice, t: number, f: number, n: NoteShape) {
    const a = Math.min(3, n.duration * 0.4);
    const r = 3.5;
    const lp = v.filter('lowpass', n.brightness * 0.7, 2);
    const stop = end(t, n, r);
    v.lfo(lp.frequency, 0.07 * v.vary(0.3), n.brightness * 0.3, t, stop);
    lp.connect(v.swell(t, a, n.velocity, Math.max(0, n.duration - a), r)).connect(v.out);
    v.osc('sawtooth', f, t, stop).connect(lp);
    v.osc('sawtooth', f * 1.4983, t, stop).connect(v.gain(0.6)).connect(lp);
    v.osc('triangle', f * 2.002, t, stop).connect(v.gain(0.5)).connect(lp);
  },
  /** The bog's murk: wide-detuned saws, a wobbling low cutoff, a sour hiss. */
  murk(v: Voice, t: number, f: number, n: NoteShape) {
    const a = Math.min(2.5, n.duration * 0.4);
    const r = 3;
    const lp = v.filter('lowpass', n.brightness * 0.8, 3);
    const stop = end(t, n, r);
    v.lfo(lp.frequency, 0.23 * v.vary(0.2), n.brightness * 0.35, t, stop, 'triangle');
    lp.connect(v.swell(t, a, n.velocity, Math.max(0, n.duration - a), r)).connect(v.out);
    v.osc('sawtooth', f * 0.992, t, stop).connect(lp);
    v.osc('sawtooth', f * 1.009, t, stop).connect(lp);
    const hiss = v.filter('bandpass', f * 4, 6);
    v.noise('pink', t, stop).connect(hiss).connect(v.gain(0.35)).connect(lp);
  },
  /** The void: sines beating against near-unison twins and a tritone partial, barely moving. */
  voidPad(v: Voice, t: number, f: number, n: NoteShape) {
    const a = Math.min(3.5, n.duration * 0.45);
    const r = 4;
    const env = v.swell(t, a, n.velocity, Math.max(0, n.duration - a), r);
    const am = v.gain(1);
    am.connect(env).connect(v.out);
    const stop = end(t, n, r);
    v.lfo(am.gain, 0.17 * v.vary(0.3), 0.3, t, stop);
    for (const [ratio, g] of [[1, 0.5], [1.0047, 0.45], [2.0, 0.3], [2.83, 0.12]] as const) v.osc('sine', f * ratio, t, stop).connect(v.gain(g)).connect(am);
    v.osc('triangle', f * 0.5, t, stop).connect(v.gain(0.25)).connect(am);
  },
  /** The geode's shimmer: the glass pad with a high, slowly sweeping sparkle. */
  shimmer(v: Voice, t: number, f: number, n: NoteShape) {
    PADS.glassPad(v, t, f, n);
    const stop = end(t, n, 2.5);
    const sparkle = v.gain(0);
    sparkle.gain.setValueAtTime(0, t);
    sparkle.gain.linearRampToValueAtTime(0.07 * n.velocity, t + Math.min(3, n.duration * 0.6));
    sparkle.gain.linearRampToValueAtTime(0, stop - 0.1);
    const trem = v.gain(0.5);
    v.lfo(trem.gain, 3.1, 0.5, t, stop);
    v.osc('sine', f * 4.004, t, stop).connect(trem).connect(sparkle).connect(v.out);
    v.osc('sine', f * 6.01, t, stop).connect(v.gain(0.4)).connect(trem);
  },
  /** A woody reed pad (the root galleries' harmonium). */
  reedPad(v: Voice, t: number, f: number, n: NoteShape) {
    const a = Math.min(1.2, n.duration * 0.3);
    const r = 1.8;
    const bp = v.filter('bandpass', Math.min(1400, f * 3), 1.2);
    const lp = v.filter('lowpass', n.brightness * 1.2, 0);
    bp.connect(lp).connect(v.swell(t, a, n.velocity, Math.max(0, n.duration - a), r)).connect(v.out);
    const stop = end(t, n, r);
    v.osc('square', f * 0.998, t, stop).connect(bp);
    v.osc('sawtooth', f * 1.002, t, stop).connect(v.gain(0.6)).connect(bp);
    v.osc('triangle', f, t, stop).connect(v.gain(0.8)).connect(lp);
  },
  /** Strings in tremolo (the tension layer): a bowed saw under a fast amplitude flutter. */
  tremolo(v: Voice, t: number, f: number, n: NoteShape) {
    const r = 0.8;
    const env = adsr(v, t, 0.35, 0.4, 0.8, n.duration, r, n.velocity);
    const lp = v.filter('lowpass', Math.min(2400, n.brightness * 1.6), 1);
    const trem = v.gain(0.6);
    lp.connect(trem).connect(env).connect(v.out);
    const stop = end(t, n, r);
    v.lfo(trem.gain, 11 * v.vary(0.05), 0.4, t, stop);
    for (const d of [0.997, 1.003]) v.osc('sawtooth', f * d, t, stop).connect(lp);
  },
} satisfies Record<string, TimbreDef['build']>;

// ---------------------------------------------------------------------------------------
// Leads

const LEADS = {
  /** A kalimba tine: sine fundamental, a brief high tine partial, a soft body. */
  kalimba(v: Voice, t: number, f: number, n: NoteShape) {
    const d = Math.min(2.8, Math.max(0.9, n.duration));
    v.osc('sine', f, t, t + d + 0.05).connect(v.perc(t, 0.003, n.velocity, d)).connect(v.out);
    if (f * 5.95 < v.ctx.sampleRate * 0.45) v.osc('sine', f * 5.95, t, t + 0.12).connect(v.perc(t, 0.001, n.velocity * 0.2, 0.07)).connect(v.out);
    v.osc('triangle', f * 2, t, t + 0.35).connect(v.perc(t, 0.002, n.velocity * 0.14, 0.25)).connect(v.out);
  },
  /** A harp string: triangle fundamental with fading upper partials, a soft pluck. */
  harp(v: Voice, t: number, f: number, n: NoteShape) {
    const d = Math.min(3, Math.max(1.2, n.duration * 1.5));
    const lp = v.filter('lowpass', Math.min(5000, f * 6), 0);
    lp.connect(v.out);
    v.osc('triangle', f, t, t + d + 0.05).connect(v.perc(t, 0.002, n.velocity, d)).connect(lp);
    v.osc('sine', f * 2, t, t + d * 0.5 + 0.05).connect(v.perc(t, 0.002, n.velocity * 0.35, d * 0.45)).connect(lp);
    v.osc('sine', f * 3.01, t, t + d * 0.25 + 0.05).connect(v.perc(t, 0.002, n.velocity * 0.15, d * 0.22)).connect(lp);
    tick(v, t, 'white', 'bandpass', Math.min(6000, f * 4), 2, n.velocity * 0.05, 0.012);
  },
  /** A celesta: a pure tone and its double octave, quick to fade. */
  celesta(v: Voice, t: number, f: number, n: NoteShape) {
    partials(v, t, f, [1, 4.0, 10.1], [1, 0.22, 0.05], [1.4, 0.35, 0.1], n.velocity);
    tick(v, t, 'white', 'highpass', 5000, 0, n.velocity * 0.04, 0.008);
  },
  /** A music-box comb: bright, glassy, a little detuned. */
  musicBox(v: Voice, t: number, f: number, n: NoteShape) {
    partials(v, t, f, [1, 1.003, 3.02, 5.6], [0.7, 0.4, 0.18, 0.06], [1.8, 1.6, 0.5, 0.18], n.velocity);
  },
  /** A temple bell: inharmonic partials with long decays. */
  bell(v: Voice, t: number, f: number, n: NoteShape) {
    partials(v, t, f, [0.5, 1, 1.19, 1.56, 2.0, 2.66, 3.01], [0.25, 1, 0.3, 0.35, 0.28, 0.14, 0.08], [3.6, 3.0, 2.2, 1.8, 1.4, 0.9, 0.6], n.velocity);
  },
  /** A marimba bar: the fundamental, its tuned 4th partial, a soft mallet. */
  marimba(v: Voice, t: number, f: number, n: NoteShape) {
    const d = Math.min(1.2, 0.45 + 120 / f);
    partials(v, t, f, [1, 3.93, 9.2], [1, 0.25, 0.04], [d, 0.12, 0.04], n.velocity);
    tick(v, t, 'pink', 'bandpass', Math.min(3000, f * 2.5), 1.5, n.velocity * 0.12, 0.015);
  },
  /** A flute: a near-sine tone, breath in the attack, vibrato as it holds. */
  flute(v: Voice, t: number, f: number, n: NoteShape) {
    const r = 0.25;
    const stop = end(t, n, r);
    const env = adsr(v, t, 0.07, 0.2, 0.8, n.duration, r, n.velocity);
    env.connect(v.out);
    const o = v.osc('sine', f, t, stop);
    vibrato(v, o, f, t, stop, 5.2, 0.005, 0.3);
    o.connect(env);
    v.osc('triangle', f * 2, t, stop).connect(v.gain(0.08)).connect(env);
    const breath = v.filter('bandpass', Math.min(8000, f * 2), 3);
    v.noise('pink', t, stop).connect(breath).connect(v.gain(0.35)).connect(env);
    tick(v, t, 'pink', 'bandpass', Math.min(7000, f * 3), 2, n.velocity * 0.12, 0.05);
  },
  /** A pan flute: breathier, a chiff on every note. */
  panFlute(v: Voice, t: number, f: number, n: NoteShape) {
    const r = 0.3;
    const stop = end(t, n, r);
    const env = adsr(v, t, 0.04, 0.25, 0.65, n.duration, r, n.velocity);
    env.connect(v.out);
    const o = v.osc('sine', f, t, stop);
    vibrato(v, o, f, t, stop, 4.8, 0.004, 0.4);
    o.connect(env);
    const breath = v.filter('bandpass', Math.min(8000, f * 1.5), 2);
    v.noise('pink', t, stop).connect(breath).connect(v.gain(0.6)).connect(env);
    tick(v, t, 'white', 'bandpass', Math.min(8000, f * 4), 1.5, n.velocity * 0.18, 0.04);
  },
  /** A glass harmonica: a rubbed rim, slow to speak, ringing on. */
  glass(v: Voice, t: number, f: number, n: NoteShape) {
    const r = 1.6;
    const stop = end(t, n, r);
    const env = adsr(v, t, 0.22, 0.4, 0.7, n.duration, r, n.velocity);
    env.connect(v.out);
    v.osc('sine', f, t, stop).connect(env);
    v.osc('sine', f * 1.0025, t, stop).connect(v.gain(0.6)).connect(env);
    v.osc('sine', f * 2.0, t, stop).connect(v.gain(0.12)).connect(env);
  },
  /** A nasal reed (a shawm): square and saw through a vowel band. */
  reed(v: Voice, t: number, f: number, n: NoteShape) {
    const r = 0.2;
    const stop = end(t, n, r);
    const env = adsr(v, t, 0.05, 0.15, 0.75, n.duration, r, n.velocity);
    const bp = v.filter('bandpass', Math.min(2200, Math.max(700, f * 2.2)), 1.6);
    const lp = v.filter('lowpass', 3000, 0);
    bp.connect(lp).connect(env).connect(v.out);
    const o = v.osc('square', f, t, stop);
    vibrato(v, o, f, t, stop, 5.5, 0.006, 0.2);
    o.connect(bp);
    v.osc('sawtooth', f * 1.003, t, stop).connect(v.gain(0.5)).connect(bp);
  },
  /** A soft horn: a saw whose lowpass opens with the breath, then settles. */
  horn(v: Voice, t: number, f: number, n: NoteShape) {
    const r = 0.45;
    const stop = end(t, n, r);
    const env = adsr(v, t, 0.09, 0.3, 0.75, n.duration, r, n.velocity);
    const lp = v.filter('lowpass', 300, 1);
    const top = Math.min(2600, 500 + f * 3 * (0.6 + n.velocity));
    lp.frequency.setValueAtTime(300, t);
    lp.frequency.linearRampToValueAtTime(top, t + 0.12);
    lp.frequency.exponentialRampToValueAtTime(top * 0.6, t + 0.6);
    lp.connect(env).connect(v.out);
    const o = v.osc('sawtooth', f, t, stop);
    vibrato(v, o, f, t, stop, 4.5, 0.003, 0.4);
    o.connect(lp);
    v.osc('sawtooth', f * 0.5, t, stop).connect(v.gain(0.25)).connect(lp);
  },
  /** Brass: two saws, a brighter, quicker swell (guardian themes). */
  brass(v: Voice, t: number, f: number, n: NoteShape) {
    const r = 0.35;
    const stop = end(t, n, r);
    const env = adsr(v, t, 0.05, 0.25, 0.7, n.duration, r, n.velocity);
    const lp = v.filter('lowpass', 400, 2);
    const top = Math.min(3400, 700 + f * 4 * (0.6 + n.velocity));
    lp.frequency.setValueAtTime(400, t);
    lp.frequency.linearRampToValueAtTime(top, t + 0.06);
    lp.frequency.exponentialRampToValueAtTime(top * 0.55, t + 0.5);
    lp.connect(env).connect(v.out);
    for (const d of [0.996, 1.004]) v.osc('sawtooth', f * d, t, stop).connect(lp);
  },
  /** A choir voice ("ooh"), quicker to speak than the pad. */
  choir(v: Voice, t: number, f: number, n: NoteShape) {
    PADS.choirPad(v, t, f, { ...n, duration: Math.max(0.6, n.duration) });
  },
  /** A plucked string (banjo, oud): a bright saw whose lowpass closes fast. */
  pluck(v: Voice, t: number, f: number, n: NoteShape) {
    const d = Math.min(2, Math.max(0.6, n.duration));
    const lp = v.filter('lowpass', Math.min(5000, f * 8), 1);
    lp.frequency.setValueAtTime(Math.min(5000, f * 8), t);
    lp.frequency.exponentialRampToValueAtTime(Math.max(200, f * 1.2), t + 0.35);
    lp.connect(v.perc(t, 0.002, n.velocity, d)).connect(v.out);
    v.osc('sawtooth', f, t, t + d + 0.05).connect(lp);
    v.osc('triangle', f * 1.002, t, t + d + 0.05).connect(v.gain(0.7)).connect(lp);
  },
  /** A whistle: a pure tone with a breath and a lively vibrato. */
  whistle(v: Voice, t: number, f: number, n: NoteShape) {
    const r = 0.15;
    const stop = end(t, n, r);
    const env = adsr(v, t, 0.03, 0.1, 0.85, n.duration, r, n.velocity);
    env.connect(v.out);
    const o = v.osc('sine', f, t, stop);
    vibrato(v, o, f, t, stop, 6, 0.007, 0.15);
    o.connect(env);
    const breath = v.filter('highpass', Math.min(8000, f * 3), 0);
    v.noise('white', t, stop).connect(breath).connect(v.gain(0.05)).connect(env);
  },
} satisfies Record<string, TimbreDef['build']>;

// ---------------------------------------------------------------------------------------
// Bass

const BASS = {
  /** A plucked bass: a saw and a triangle whose lowpass closes after the pluck (its harmonics carry it on a phone). */
  pluckBass(v: Voice, t: number, f: number, n: NoteShape) {
    const d = Math.min(1.4, Math.max(0.35, n.duration));
    const lp = v.filter('lowpass', 1200, 3);
    lp.frequency.setValueAtTime(Math.min(2400, f * 14), t);
    lp.frequency.exponentialRampToValueAtTime(Math.min(1100, f * 6), t + 0.25);
    lp.connect(v.perc(t, 0.004, n.velocity, d)).connect(v.out);
    v.osc('sawtooth', f, t, t + d + 0.05).connect(lp);
    v.osc('triangle', f, t, t + d + 0.05).connect(v.gain(0.6)).connect(lp);
  },
  /** A round bass: its fundamental for headphones, a soft saw's harmonics for the phone. */
  subBass(v: Voice, t: number, f: number, n: NoteShape) {
    const r = 0.3;
    const stop = end(t, n, r);
    const env = adsr(v, t, 0.02, 0.25, 0.75, n.duration, r, n.velocity);
    const lp = v.filter('lowpass', Math.min(1300, f * 8), 0);
    lp.connect(env).connect(v.out);
    v.osc('sine', f, t, stop).connect(v.gain(0.7)).connect(lp);
    v.osc('sawtooth', f, t, stop).connect(v.gain(0.5)).connect(lp);
    v.osc('triangle', f * 2, t, stop).connect(v.gain(0.35)).connect(lp);
  },
  /** A bowed low string (cello, double bass). */
  bowed(v: Voice, t: number, f: number, n: NoteShape) {
    const r = 0.5;
    const stop = end(t, n, r);
    const env = adsr(v, t, 0.12, 0.3, 0.8, n.duration, r, n.velocity);
    const lp = v.filter('lowpass', Math.min(1800, f * 10), 1);
    lp.connect(env).connect(v.out);
    const o = v.osc('sawtooth', f, t, stop);
    vibrato(v, o, f, t, stop, 5, 0.004, 0.35);
    o.connect(lp);
    v.osc('triangle', f * 2.001, t, stop).connect(v.gain(0.3)).connect(lp);
  },
  /** A tight saw bass with a filter thump (combat). */
  sawBass(v: Voice, t: number, f: number, n: NoteShape) {
    const d = Math.min(1.2, Math.max(0.2, n.duration));
    const lp = v.filter('lowpass', 700, 4);
    lp.frequency.setValueAtTime(2200, t);
    lp.frequency.exponentialRampToValueAtTime(Math.min(900, f * 6), t + 0.18);
    lp.connect(v.perc(t, 0.003, n.velocity, d)).connect(v.out);
    v.osc('sawtooth', f, t, t + d + 0.05).connect(lp);
    v.osc('square', f * 0.5, t, t + d + 0.05).connect(v.gain(0.35)).connect(lp);
  },
} satisfies Record<string, TimbreDef['build']>;

// ---------------------------------------------------------------------------------------
// Percussion (each carries a mid "knock" so its rhythm survives a phone speaker)

const DRUMS = {
  /**
   * A taiko: a deep skin falling in pitch (felt on headphones), and what a phone speaker plays of it:
   * the skin's hollow tone near 300 Hz and the slap of the stick.
   */
  taiko(v: Voice, t: number, f: number, n: NoteShape) {
    const k = n.velocity;
    body(v, t, Math.max(90, f * 1.2), Math.max(40, f * 0.42), k * 0.55, 0.5);
    body(v, t, 330 * v.vary(0.03), 190, k * 0.75, 0.18, 'triangle');
    body(v, t, 520 * v.vary(0.03), 330, k * 0.25, 0.08);
    tick(v, t, 'pink', 'bandpass', 900 * v.vary(0.1), 1.1, k, 0.07);
  },
  /** A tom: a tuned skin (its second mode carries it on a phone) and a stick. */
  tom(v: Voice, t: number, f: number, n: NoteShape) {
    const k = n.velocity;
    const f0 = Math.max(150, f * 1.3);
    body(v, t, f0, f0 * 0.6, k * 0.7, 0.26);
    body(v, t, f0 * 2.3, f0 * 1.5, k * 0.5, 0.1, 'triangle');
    tick(v, t, 'pink', 'bandpass', 1200, 1, k * 0.6, 0.04);
  },
  /** A frame drum: a soft skin, a finger's knock and its jingles. */
  frame(v: Voice, t: number, f: number, n: NoteShape) {
    const k = n.velocity;
    body(v, t, Math.max(200, f * 1.5), Math.max(140, f), k * 0.6, 0.16);
    tick(v, t, 'pink', 'bandpass', 700, 1.2, k * 0.8, 0.06);
    tick(v, t + 0.006, 'white', 'highpass', 6000, 0, k * 0.3, 0.12);
  },
  /** A shaker: a short, soft hiss. */
  shaker(v: Voice, t: number, _f: number, n: NoteShape) {
    const hp = v.filter('highpass', 5200, 0);
    v.noise('white', t, t + 0.12).connect(hp).connect(v.swell(t, 0.018, n.velocity, 0.01, 0.05)).connect(v.out);
  },
  /** A woodblock rim. */
  rim(v: Voice, t: number, f: number, n: NoteShape) {
    const k = n.velocity;
    const base = Math.max(700, Math.min(1600, f * 4));
    v.osc('sine', base, t, t + 0.08).connect(v.perc(t, 0.001, k, 0.05)).connect(v.out);
    v.osc('sine', base * 1.53, t, t + 0.05).connect(v.perc(t, 0.001, k * 0.4, 0.025)).connect(v.out);
    tick(v, t, 'white', 'highpass', 3000, 0, k * 0.2, 0.006);
  },
  /** A hand clap: three quick bursts and a short tail. */
  clap(v: Voice, t: number, _f: number, n: NoteShape) {
    for (let i = 0; i < 3; i++) tick(v, t + i * 0.011, 'white', 'bandpass', 1300, 1.2, n.velocity * (i === 2 ? 1 : 0.7), i === 2 ? 0.09 : 0.012);
  },
  /** An anvil (the mines): a short bright clang. */
  anvil(v: Voice, t: number, f: number, n: NoteShape) {
    const base = Math.max(700, Math.min(1800, f * 2));
    partials(v, t, base, [1, 2.76, 5.4], [1, 0.45, 0.15], [0.45, 0.22, 0.1], n.velocity);
    tick(v, t, 'white', 'highpass', 3500, 0, n.velocity * 0.25, 0.012);
  },
  /** A gong: low inharmonic partials blooming, a wash of noise. */
  gong(v: Voice, t: number, f: number, n: NoteShape) {
    const k = n.velocity;
    const base = Math.max(90, f);
    const out = v.swell(t, 0.25, 1, 0.3, 3.6);
    out.connect(v.out);
    for (const [r, a] of [[1, 0.5], [1.48, 0.35], [2.0, 0.3], [2.66, 0.2], [3.32, 0.12], [4.1, 0.06]] as const) v.osc('sine', base * r * v.vary(0.003), t, t + 4.4).connect(v.gain(a * k)).connect(out);
    const wash = v.filter('bandpass', 1800, 0.8);
    v.noise('pink', t, t + 3).connect(wash).connect(v.swell(t, 0.4, k * 0.12, 0.3, 2)).connect(v.out);
    body(v, t, base * 1.5, base, k * 0.5, 0.4);
  },
  /** Ice cracking: a sharp snap and a glassy chirp. */
  snap(v: Voice, t: number, f: number, n: NoteShape) {
    const k = n.velocity;
    tick(v, t, 'white', 'highpass', 2500, 0, k, 0.025);
    const o = v.osc('sine', Math.min(5000, f * 6), t, t + 0.12);
    o.frequency.setValueAtTime(Math.min(5000, f * 6), t);
    o.frequency.exponentialRampToValueAtTime(Math.min(2500, f * 3), t + 0.08);
    o.connect(v.perc(t, 0.001, k * 0.3, 0.08)).connect(v.out);
    body(v, t, 260, 160, k * 0.4, 0.07, 'triangle');
  },
  /** A deep boom (the void, the magma): very low, and the thud a phone can play. */
  boom(v: Voice, t: number, f: number, n: NoteShape) {
    const k = n.velocity;
    body(v, t, Math.max(55, f), Math.max(30, f * 0.55), k * 0.6, 1.0);
    body(v, t, 280, 160, k * 0.8, 0.3, 'triangle');
    tick(v, t, 'pink', 'bandpass', 600, 0.9, k * 0.7, 0.16);
    tick(v, t, 'brown', 'lowpass', 700, 0, k * 0.4, 0.5);
  },
  /** A tuned water drop (the grottoes): a bubble whose pitch jumps up. */
  drop(v: Voice, t: number, f: number, n: NoteShape) {
    const o = v.osc('sine', f, t, t + 0.2);
    o.frequency.setValueAtTime(f, t);
    o.frequency.exponentialRampToValueAtTime(f * 1.6, t + 0.04);
    o.connect(v.perc(t, 0.001, n.velocity, 0.12)).connect(v.out);
  },
  /** A heartbeat (lub-dub): the tension's pulse, felt low and heard as a muffled thud near 300 Hz. */
  heartbeat(v: Voice, t: number, _f: number, n: NoteShape) {
    const k = n.velocity;
    for (const [at, g] of [[0, 1], [0.17, 0.7]] as const) {
      body(v, t + at, 85, 48, k * g * 0.6, 0.2);
      body(v, t + at, 300, 170, k * g * 0.8, 0.1, 'triangle');
      tick(v, t + at, 'pink', 'bandpass', 520, 1.3, k * g * 0.7, 0.06);
    }
  },
} satisfies Record<string, TimbreDef['build']>;

const pad = (build: TimbreDef['build'], gain: number, wet: number, tail: number): TimbreDef => ({ family: 'pad', gain, wet, tail, build });
const lead = (build: TimbreDef['build'], gain: number, wet: number, tail: number): TimbreDef => ({ family: 'lead', gain, wet, tail, build });
const bass = (build: TimbreDef['build'], gain: number, wet: number, tail: number): TimbreDef => ({ family: 'bass', gain, wet, tail, build });
/** Drum recipes are written at a calm level; their skins are driven 2.5x (their gains stay under 1). */
const DRUM_DRIVE = 2.5;
const drum = (build: TimbreDef['build'], gain: number, wet: number, tail: number): TimbreDef => ({
  family: 'drum', gain, wet, tail, build: (v, t, f, n) => build(v, t, f, { ...n, velocity: n.velocity * DRUM_DRIVE }),
});

/** Every timbre with its family, level, reverb send and tail. Levels are set from the offline renders. */
export const TIMBRES: Record<Timbre, TimbreDef> = {
  warm: pad(PADS.warm, 0.039, 0.5, 3),
  glassPad: pad(PADS.glassPad, 0.032, 0.6, 2.5),
  choirPad: pad(PADS.choirPad, 0.098, 0.6, 2.6),
  organ: pad(PADS.organ, 0.078, 0.45, 0.9),
  drone: pad(PADS.drone, 0.049, 0.5, 3.5),
  murk: pad(PADS.murk, 0.056, 0.45, 3),
  voidPad: pad(PADS.voidPad, 0.071, 0.7, 4),
  shimmer: pad(PADS.shimmer, 0.031, 0.7, 2.5),
  reedPad: pad(PADS.reedPad, 0.065, 0.45, 1.8),
  tremolo: pad(PADS.tremolo, 0.077, 0.4, 0.8),
  kalimba: lead(LEADS.kalimba, 0.319, 0.55, 2.8),
  harp: lead(LEADS.harp, 0.306, 0.5, 3),
  celesta: lead(LEADS.celesta, 0.291, 0.6, 1.4),
  musicBox: lead(LEADS.musicBox, 0.234, 0.6, 1.8),
  bell: lead(LEADS.bell, 0.16, 0.7, 3.6),
  marimba: lead(LEADS.marimba, 0.405, 0.4, 1.2),
  flute: lead(LEADS.flute, 0.152, 0.5, 0.3),
  panFlute: lead(LEADS.panFlute, 0.171, 0.5, 0.35),
  glass: lead(LEADS.glass, 0.111, 0.65, 1.6),
  reed: lead(LEADS.reed, 0.273, 0.4, 0.25),
  horn: lead(LEADS.horn, 0.213, 0.45, 0.5),
  brass: lead(LEADS.brass, 0.143, 0.4, 0.4),
  choir: lead(LEADS.choir, 0.183, 0.6, 2.6),
  pluck: lead(LEADS.pluck, 0.268, 0.35, 2),
  whistle: lead(LEADS.whistle, 0.147, 0.45, 0.2),
  pluckBass: bass(BASS.pluckBass, 0.46, 0.15, 1.4),
  subBass: bass(BASS.subBass, 0.419, 0.1, 0.3),
  bowed: bass(BASS.bowed, 0.219, 0.3, 0.5),
  sawBass: bass(BASS.sawBass, 0.421, 0.15, 1.2),
  taiko: drum(DRUMS.taiko, 0.812, 0.35, 0.6),
  tom: drum(DRUMS.tom, 0.665, 0.3, 0.35),
  frame: drum(DRUMS.frame, 0.415, 0.3, 0.2),
  shaker: drum(DRUMS.shaker, 0.0525, 0.2, 0.1),
  rim: drum(DRUMS.rim, 0.179, 0.3, 0.08),
  clap: drum(DRUMS.clap, 0.422, 0.35, 0.12),
  anvil: drum(DRUMS.anvil, 0.073, 0.4, 0.5),
  gong: drum(DRUMS.gong, 0.145, 0.6, 4.4),
  snap: drum(DRUMS.snap, 0.206, 0.4, 0.12),
  boom: drum(DRUMS.boom, 0.42, 0.45, 1.1),
  drop: drum(DRUMS.drop, 0.151, 0.6, 0.2),
  heartbeat: drum(DRUMS.heartbeat, 0.611, 0.2, 0.4),
};

export const TIMBRE_NAMES = Object.keys(TIMBRES) as Timbre[];

/**
 * The calibration of the instruments: each one's reference note (where the scores play it) and its
 * target loudness through a phone speaker (the momentary maximum, LUFS, of the offline render
 * high-passed at 300 Hz, at unity volumes). TIMBRES' gains are set from these renders, and a test
 * holds every instrument within 2 dB of its target, so the layers keep their balance: the lead
 * stands out, a chord note sits under it, the drums and the bass are heard on a phone.
 */
export const CALIBRATION: Record<Timbre, { midi: number; duration: number; target: number }> = (() => {
  const fam = { pad: { midi: 64, duration: 4, target: -27 }, lead: { midi: 72, duration: 1, target: -20 }, bass: { midi: 45, duration: 1, target: -25 }, drum: { midi: 48, duration: 0.3, target: -24 } };
  const out = {} as Record<Timbre, { midi: number; duration: number; target: number }>;
  for (const name of TIMBRE_NAMES) out[name] = { ...fam[TIMBRES[name].family] };
  const drum = (name: Timbre, midi: number, target: number) => (out[name] = { midi, duration: 0.3, target });
  drum('taiko', 43, -21);
  drum('boom', 36, -23);
  drum('tom', 50, -23);
  drum('frame', 52, -25);
  drum('heartbeat', 48, -23);
  drum('gong', 45, -22);
  drum('anvil', 64, -27);
  drum('rim', 64, -28);
  drum('clap', 48, -27);
  drum('snap', 72, -28);
  drum('shaker', 48, -32);
  drum('drop', 79, -27);
  // The tremolo is a tension bed, a quiet one; the choir lead blooms slowly.
  out.tremolo.target = -29;
  return out;
})();

/** Round 1's two score voices by their old names. */
export const LEGACY_VOICES = { pad: 'warm', pluck: 'kalimba' } as const satisfies Record<string, Timbre>;

export function timbreOf(voice: string): Timbre {
  return (LEGACY_VOICES as Record<string, Timbre>)[voice] ?? (voice as Timbre);
}

/** Build one note of `timbre` on a voice at `t` (frequency from the midi note). */
export function buildTimbre(v: Voice, timbre: Timbre, t: number, midi: number, n: NoteShape): void {
  TIMBRES[timbre].build(v, t, midiToHz(midi), n);
}
