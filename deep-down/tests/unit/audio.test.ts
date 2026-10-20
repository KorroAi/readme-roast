import { describe, expect, it } from 'vitest';
import type { SoundKind } from '../../src/config/blocks';
import { Big } from '../../src/core/big';
import { EventBus } from '../../src/core/events';
import type { IdleEvents } from '../../src/idle/bus';
import { CELL } from '../../src/idle/model/state';
import { Rng } from '../../src/core/rng';
import { activeDuration, peakOf, rmsOf, spectralCentroid } from '../../src/audio/analysis';
import { AudioSystem, renderSfxOffline, type AudioWorldState } from '../../src/audio/AudioSystem';
import { brownNoise, crackleTexture, crumbleTexture, impulseResponse, pinkNoise } from '../../src/audio/buffers';
import { AUDIBLE_EVENTS, PENTATONIC, SoundCues, materialOf, semis } from '../../src/audio/eventMap';
import { MusicScheduler, type MusicNote } from '../../src/audio/MusicScheduler';
import { SFX, SFX_NAMES, isSfxName } from '../../src/audio/sfx';
import { MODES, MOODS, degreeToMidi, inMode, midiToHz, moodFor, volumeToGain, type MoodName } from '../../src/audio/theory';
import { RateGate, VoiceLimiter } from '../../src/audio/voices';

const G = (n: number) => Big.from(n);

/** One payload per event the audio listens to, plus a few it must ignore. */
const SAMPLES: Partial<{ [K in keyof IdleEvents]: IdleEvents[K] }> = {
  'tap:hit': { col: 3, depth: 4, kind: CELL.ROCK, source: 'tap', dmg: G(5), crit: false, combo: 12, comboMult: 1.1, cells: 0, chain: 1, surge: false },
  'cell:break': { col: 3, depth: 4, kind: CELL.ORE, source: 'tap', gold: G(9), gems: 0, chainIndex: 0, belowRecord: true, crit: false },
  'row:clear': { depth: 5, rows: 1, source: 'tap' },
  'row:crumble': { depth: 5, cols: [0, 6] },
  'buy:done': { id: 'pick', mode: 'x1', levels: 1, from: 1, to: 2, cost: G(30) },
  'buy:fail': { id: 'pick', reason: 'gold' },
  'crew:star': { line: 0, level: 10, stars: 1 },
  'crew:crown': { line: 0, level: 50, crowns: 1 },
  'pick:tier': { tier: 1, from: 0, tiers: 1, level: 25 },
  'combo:tier': { tier: 25, combo: 25 },
  'combo:lost': { combo: 14 },
  'chest:exposed': { id: 'chest:1', col: 3, depth: 20, floor: 'wood' },
  'chest:open': { id: 'chest:1', floor: 'wood', tier: 'copper', steps: 1, gold: G(400), gems: 1, source: 'tap' },
  'seal:start': { biome: 0, depth: 120, hp: G(5000), time: 30 },
  'seal:hit': { biome: 0, left: 0.6, dmg: G(50), weak: false },
  'seal:break': { biome: 0, depth: 120, time: 21 },
  'biome:reveal': { biome: 1 },
  'moth:catch': { id: 'moth:1', outcome: 'gold', gold: G(800), gems: 0 },
  'skill:dynamite': { from: 40, rows: 6, gold: G(900) },
  'offline:collect': { gold: G(12000), chests: 2 },
  // Silent: gains are the coin flights' business (the ledger ticks them), goals are the bar's.
  'gold:gain': { amount: G(9), source: 'cell', col: 3, depth: 4 },
  'goal:change': { id: 'pick5' },
  'ui:reveal': { id: 'gold' },
};

const WORLD_STATE: AudioWorldState = { depth: 90, openness: 0.7, nearCrystal: 0.5, nearFire: 0, inMenu: false };

describe('music theory', () => {
  it('converts MIDI notes to equal-tempered frequencies', () => {
    expect(midiToHz(69)).toBeCloseTo(440, 6);
    expect(midiToHz(81)).toBeCloseTo(880, 6);
    expect(midiToHz(60)).toBeCloseTo(261.6256, 3);
  });

  it('maps scale degrees across octaves', () => {
    // D dorian on D4 (62): D E F G A B C
    expect([0, 1, 2, 3, 4, 5, 6].map((d) => degreeToMidi(62, 'dorian', d))).toEqual([62, 64, 65, 67, 69, 71, 72]);
    expect(degreeToMidi(62, 'dorian', 7)).toBe(74);
    expect(degreeToMidi(62, 'dorian', -1)).toBe(60);
    expect(degreeToMidi(57, 'phrygian', 1)).toBe(58);
    expect(inMode(66, 62, 'ionian')).toBe(true); // F# in D major
    expect(inMode(65, 62, 'ionian')).toBe(false); // F natural
    for (const steps of Object.values(MODES)) expect(steps).toHaveLength(7);
  });

  it('uses a perceptual, clamped volume curve', () => {
    expect(volumeToGain(0)).toBe(0);
    expect(volumeToGain(1)).toBe(1);
    expect(volumeToGain(0.5)).toBeCloseTo(0.25);
    expect(volumeToGain(-1)).toBe(0);
    expect(volumeToGain(3)).toBe(1);
  });

  it('chooses moods by camp and depth, with hysteresis at thresholds', () => {
    expect(moodFor(49, true)).toBe('camp');
    expect(moodFor(60, false)).toBe('shallow');
    expect(moodFor(108, false)).toBe('mid');
    expect(moodFor(130, false)).toBe('deep');
    // Hovering just past a threshold does not flip the mood back and forth.
    expect(moodFor(81, false, 'shallow')).toBe('shallow');
    expect(moodFor(85, false, 'shallow')).toBe('mid');
    expect(moodFor(78, false, 'mid')).toBe('mid');
    expect(moodFor(75, false, 'mid')).toBe('shallow');
    expect(moodFor(116, false, 'deep')).toBe('deep');
  });

  it('keeps camp warm (major) and the depths minor', () => {
    expect(MOODS.camp.mode).toBe('ionian');
    expect(['aeolian', 'phrygian', 'dorian']).toContain(MOODS.deep.mode);
    expect(MOODS.deep.brightness).toBeLessThan(MOODS.camp.brightness);
    expect(MOODS.deep.rest[1]).toBeGreaterThan(MOODS.camp.rest[1]);
  });
});

describe('VoiceLimiter', () => {
  it('admits up to the cap, then steals the oldest lowest-priority voice', () => {
    const stolen: string[] = [];
    const lim = new VoiceLimiter<string>(3, (v) => stolen.push(v));
    for (const [id, start, prio] of [['a', 0, 2], ['b', 0.1, 1], ['c', 0.2, 1]] as const) {
      expect(lim.admit(start, prio)).toBe(true);
      lim.add(id, start, 10, prio);
    }
    expect(lim.size).toBe(3);
    expect(lim.admit(0.3, 2)).toBe(true);
    expect(stolen).toEqual(['b']);
    lim.add('d', 0.3, 10, 2);
    expect(lim.admit(0.4, 2)).toBe(true);
    expect(stolen).toEqual(['b', 'c']);
  });

  it('drops a new voice when every active voice matters more', () => {
    const lim = new VoiceLimiter<number>(2);
    lim.add(1, 0, 10, 4);
    lim.add(2, 0, 10, 3);
    expect(lim.admit(1, 2)).toBe(false);
    expect(lim.size).toBe(2);
  });

  it('frees slots when voices end and clears on demand', () => {
    const lim = new VoiceLimiter<number>(2);
    lim.add(1, 0, 1, 1);
    lim.add(2, 0, 2, 1);
    expect(lim.admit(1.5, 0)).toBe(true);
    expect(lim.size).toBe(1);
    const cleared: number[] = [];
    lim.clear((v) => cleared.push(v));
    expect(cleared).toEqual([2]);
    expect(lim.size).toBe(0);
  });

  it('rate-gates identical sounds', () => {
    const gate = new RateGate();
    expect(gate.allow('hit', 1, 0.05)).toBe(true);
    expect(gate.allow('hit', 1.02, 0.05)).toBe(false);
    expect(gate.allow('step', 1.02, 0.05)).toBe(true);
    expect(gate.allow('hit', 1.06, 0.05)).toBe(true);
  });
});

/** Drive a scheduler with a fake 60 fps clock, recording each note with the time it was handed out. */
function run(s: MusicScheduler, from: number, to: number, mood: (t: number) => MoodName, lookahead = 0.35) {
  const out: MusicNote[] = [];
  const got: Array<{ note: MusicNote; at: number; mood: MoodName }> = [];
  for (let t = from; t < to; t += 1 / 60) {
    const m = mood(t);
    const n = s.advance(t, t + lookahead, m, out);
    for (let i = 0; i < n; i++) got.push({ note: out[i], at: t, mood: m });
  }
  return got;
}

describe('MusicScheduler', () => {
  it('hands out every note once, inside the lookahead window, in time order', () => {
    const got = run(new MusicScheduler(7), 0, 400, () => 'shallow');
    expect(got.length).toBeGreaterThan(20);
    expect(new Set(got.map((g) => g.note)).size).toBe(got.length);
    for (const g of got) {
      expect(g.note.time).toBeGreaterThanOrEqual(g.at - 0.05);
      expect(g.note.time).toBeLessThan(g.at + 0.35 + 1e-9);
    }
    for (let i = 1; i < got.length; i++) expect(got[i].note.time).toBeGreaterThanOrEqual(got[i - 1].note.time);
  });

  it('stays in the mood mode and leaves long silences between varied phrases', () => {
    const got = run(new MusicScheduler(3), 0, 600, () => 'deep');
    const { tonic, mode } = MOODS.deep;
    for (const g of got) expect(inMode(g.note.midi, tonic, mode)).toBe(true);
    const onsets = got.map((g) => g.note.time);
    const gaps = onsets.slice(1).map((t, i) => t - onsets[i]);
    expect(gaps.filter((g) => g > 8).length).toBeGreaterThan(3);
    const pads = got.filter((g) => g.note.voice === 'pad').map((g) => g.note.duration.toFixed(2));
    expect(new Set(pads).size).toBeGreaterThan(5);
  });

  it('is deterministic per seed', () => {
    const a = run(new MusicScheduler(11), 0, 120, () => 'mid').map((g) => [g.note.time, g.note.midi]);
    const b = run(new MusicScheduler(11), 0, 120, () => 'mid').map((g) => [g.note.time, g.note.midi]);
    const c = run(new MusicScheduler(12), 0, 120, () => 'mid').map((g) => [g.note.time, g.note.midi]);
    expect(a).toEqual(b);
    expect(a).not.toEqual(c);
  });

  it('switches to the warm camp score quickly and abandons the old phrase', () => {
    const s = new MusicScheduler(5);
    const enterAt = 40;
    const got = run(s, 0, 120, (t) => (t < enterAt ? 'mid' : 'camp'));
    expect(s.generation).toBe(1);
    const after = got.filter((g) => g.at >= enterAt);
    expect(after.length).toBeGreaterThan(0);
    expect(after[0].note.time - enterAt).toBeLessThan(1.6);
    for (const g of after) expect(inMode(g.note.midi, MOODS.camp.tonic, MOODS.camp.mode)).toBe(true);
  });

  it('never plays a burst of stale notes after a stall', () => {
    const s = new MusicScheduler(9);
    run(s, 0, 30, () => 'shallow');
    const out: MusicNote[] = [];
    const n = s.advance(500, 500.35, 'shallow', out);
    for (let i = 0; i < n; i++) expect(out[i].time).toBeGreaterThanOrEqual(500 - 0.05);
    expect(s.nextPhraseTime).toBeGreaterThan(499);
  });
});

describe('event to sound mapping', () => {
  const ask = <K extends keyof IdleEvents>(cues: SoundCues, type: K, p: IdleEvents[K], now = 0) => cues.request(type, p, now, []);

  it('maps every audible event to a registered sound, and stays quiet for the rest', () => {
    for (const type of AUDIBLE_EVENTS) {
      const p = SAMPLES[type];
      expect(p, `sample for ${type}`).toBeDefined();
      const reqs = ask(new SoundCues(), type, p as never);
      expect(reqs.length, type).toBeGreaterThan(0);
      for (const r of reqs) expect(isSfxName(r.name), `${type} -> ${r.name}`).toBe(true);
    }
    for (const type of ['gold:gain', 'goal:change', 'ui:reveal'] as const) expect(ask(new SoundCues(), type, SAMPLES[type] as never), type).toEqual([]);
    // The leftover crumble's own breaks are covered by the crumble rumble, not a pluck each.
    expect(ask(new SoundCues(), 'cell:break', { ...SAMPLES['cell:break']!, source: 'crumble' })).toEqual([]);
  });

  it('chooses tap and break sounds from the cell and the biome', () => {
    const kinds = new Set<SoundKind>(['stone', 'metal', 'crystal', 'wood', 'soil', 'ancient']);
    for (const k of kinds) {
      expect(isSfxName(`tap.${k}`), k).toBe(true);
      expect(isSfxName(`break.${k}`), k).toBe(true);
    }
    expect(materialOf(CELL.ORE, 10)).toBe('metal');
    expect(materialOf(CELL.GEM, 10)).toBe('crystal');
    expect(materialOf(CELL.CHEST, 10)).toBe('wood');
    expect(materialOf(CELL.GATE, 10)).toBe('ancient');
    // Host rock sounds like its biome: soil near the surface, stone below.
    expect(materialOf(CELL.ROCK, 2)).toBe('soil');
    expect(materialOf(CELL.ROCK, 200)).not.toBe('soil');
    const r = ask(new SoundCues(), 'tap:hit', { ...SAMPLES['tap:hit']!, crit: true });
    expect(r.map((x) => x.name)).toEqual(['tap.soil', 'crit']);
  });

  it('raises the tap a semitone per 5 combo, capped at an octave', () => {
    const pitch = (combo: number) => ask(new SoundCues(), 'tap:hit', { ...SAMPLES['tap:hit']!, combo })[0].params.pitch!;
    expect(pitch(0)).toBeCloseTo(1, 6);
    expect(pitch(10)).toBeCloseTo(semis(2), 6);
    expect(pitch(500)).toBeCloseTo(semis(12), 6);
  });

  it('climbs the break pentatonic in a spree and resets after a second of quiet', () => {
    const cues = new SoundCues();
    const brk = { ...SAMPLES['cell:break']!, kind: CELL.ROCK };
    const pitches = [0, 0.2, 0.4, 0.6].map((t) => ask(cues, 'cell:break', brk, t)[0].params.pitch!);
    for (let i = 1; i < pitches.length; i++) expect(pitches[i]).toBeGreaterThan(pitches[i - 1]);
    expect(pitches[1] / pitches[0]).toBeCloseTo(semis(PENTATONIC[1]), 6);
    expect(ask(cues, 'cell:break', brk, 2)[0].params.pitch).toBeCloseTo(pitches[0], 6);
    // Ore adds its chime on top of the break.
    expect(ask(cues, 'cell:break', SAMPLES['cell:break']!, 2.1).map((x) => x.name)).toEqual(['break.metal', 'ore.chime']);
  });

  it('climbs the purchase arpeggio, jumps an octave on the 10th buy, and resets after 1.5 s', () => {
    const cues = new SoundCues();
    const buy = SAMPLES['buy:done']!;
    const p: number[] = [];
    for (let i = 0; i < 10; i++) p.push(ask(cues, 'buy:done', buy, i * 0.3)[0].params.pitch!);
    expect(p[1]).toBeGreaterThan(p[0]);
    expect(p[9] / p[4]).toBeCloseTo(2, 6);
    expect(ask(cues, 'buy:done', buy, 10)[0].params.pitch).toBeCloseTo(p[0], 6);
  });

  it('registers sane voice settings for every sound', () => {
    for (const name of SFX_NAMES) {
      const d = SFX[name];
      expect(d.length, name).toBeGreaterThan(0);
      expect(d.gain, name).toBeGreaterThan(0);
      expect(d.gain, name).toBeLessThanOrEqual(1);
      expect(d.wet, name).toBeGreaterThanOrEqual(0);
      expect(d.priority, name).toBeGreaterThanOrEqual(0);
      expect(d.priority, name).toBeLessThanOrEqual(4);
    }
    // Story beats outrank everything and ring out.
    expect(SFX['seal.break'].priority).toBe(4);
    expect(SFX['seal.break'].wet).toBeGreaterThan(0.4);
    expect(SFX['tap.stone'].length).toBeLessThan(SFX['seal.break'].length);
  });
});

describe('sample generators', () => {
  const sr = 8000;

  it('makes seamless loops of pink and brown noise', () => {
    for (const gen of [pinkNoise, brownNoise]) {
      const x = gen(sr * 2, new Rng(1));
      expect(peakOf(x)).toBeCloseTo(0.9, 5);
      // The jump across the loop point is no larger than an ordinary step between samples.
      let maxStep = 0;
      for (let i = 1; i < x.length; i++) maxStep = Math.max(maxStep, Math.abs(x[i] - x[i - 1]));
      expect(Math.abs(x[0] - x[x.length - 1])).toBeLessThanOrEqual(maxStep);
    }
  });

  it('builds debris that is dense at the impact and sparse in the tail', () => {
    const x = crumbleTexture(sr, sr, new Rng(2));
    const energy = (a: number, b: number) => x.subarray(a, b).reduce((s, v) => s + v * v, 0);
    expect(energy(0, sr / 4)).toBeGreaterThan(energy((sr * 3) / 4, sr) * 5);
  });

  it('builds sparse crackle that never crosses the loop point', () => {
    const x = crackleTexture(sr * 2, sr, new Rng(3));
    const quiet = x.filter((v) => Math.abs(v) < 0.01).length / x.length;
    expect(quiet).toBeGreaterThan(0.6);
    expect(peakOf(x.subarray(x.length - 40))).toBeLessThan(0.01);
  });

  it('builds a decaying, decorrelated stereo impulse response with a darker tail', () => {
    const [l, r] = impulseResponse(sr, 2.5, new Rng(4));
    expect(l.length).toBe(sr * 2.5);
    const seg = (x: Float32Array, a: number, b: number) => x.subarray(Math.floor(a * x.length), Math.floor(b * x.length));
    const rms = (x: Float32Array) => Math.sqrt(x.reduce((s, v) => s + v * v, 0) / x.length);
    expect(rms(seg(l, 0.9, 1))).toBeLessThan(rms(seg(l, 0.02, 0.12)) * 0.02);
    let corr = 0;
    for (let i = 0; i < l.length; i++) corr += l[i] * r[i];
    expect(Math.abs(corr) / (rms(l) * rms(r) * l.length)).toBeLessThan(0.2);
    // Darker tail: fewer zero crossings per sample late in the response.
    const zcr = (x: Float32Array) => {
      let n = 0;
      for (let i = 1; i < x.length; i++) if (x[i - 1] < 0 !== x[i] < 0) n++;
      return n / x.length;
    };
    expect(zcr(seg(l, 0.6, 0.8))).toBeLessThan(zcr(seg(l, 0.02, 0.2)));
  });
});

describe('signal analysis', () => {
  const sr = 48000;
  const sine = (f: number, seconds: number) => Float32Array.from({ length: Math.floor(sr * seconds) }, (_, i) => Math.sin((2 * Math.PI * f * i) / sr));

  it('estimates the spectral centroid of pure tones', () => {
    expect(spectralCentroid(sine(1000, 0.5), sr)).toBeGreaterThan(900);
    expect(spectralCentroid(sine(1000, 0.5), sr)).toBeLessThan(1150);
    expect(spectralCentroid(sine(4000, 0.5), sr)).toBeGreaterThan(spectralCentroid(sine(500, 0.5), sr) * 4);
  });

  it('measures peak, RMS and audible duration', () => {
    const x = new Float32Array(sr);
    x.set(sine(440, 0.25));
    expect(peakOf(x)).toBeCloseTo(1, 3);
    expect(activeDuration(x, sr)).toBeCloseTo(0.25, 2);
    expect(rmsOf(x, sr)).toBeCloseTo(Math.SQRT1_2, 2);
  });
});

describe('AudioSystem without Web Audio', () => {
  class CountingBus extends EventBus<IdleEvents> {
    subscribed = 0;
    override on<K extends keyof IdleEvents>(type: K, fn: (payload: IdleEvents[K]) => void): () => void {
      this.subscribed++;
      const off = super.on(type, fn);
      return () => {
        this.subscribed--;
        off();
      };
    }
  }

  it('constructs, handles every event and every call as a no-op without throwing', async () => {
    const bus = new CountingBus();
    const audio = new AudioSystem(bus);
    expect(bus.subscribed).toBe(AUDIBLE_EVENTS.length);
    expect(audio.unlocked).toBe(false);
    await expect(audio.unlock()).resolves.toBeUndefined();
    expect(audio.unlocked).toBe(false);
    audio.setVolumes({ master: 0.5, music: 2, sfx: -1, ambience: 0.3 });
    for (const type of Object.keys(SAMPLES) as Array<keyof IdleEvents>) {
      expect(() => bus.emit(type, SAMPLES[type] as never)).not.toThrow();
    }
    for (const name of ['tap', 'open', 'close', 'no'] as const) audio.ui(name);
    audio.play('coin.tick', { pitch: 1.2 });
    audio.duck(0.5);
    for (let i = 0; i < 120; i++) audio.update(1 / 60, { ...WORLD_STATE, inMenu: i > 60 });
    audio.setPaused(true);
    audio.update(1 / 60, WORLD_STATE);
    audio.setPaused(false);
    audio.suspend();
    audio.resume();
    expect(audio.stats()).toMatchObject({ state: 'none', sfxVoices: 0, musicVoices: 0 });
    expect(audio.meter()).toBe(0);
    audio.dispose();
    audio.dispose();
    expect(bus.subscribed).toBe(0);
    await expect(audio.unlock()).resolves.toBeUndefined();
  });

  it('returns an empty render when OfflineAudioContext is unavailable', async () => {
    const out = await renderSfxOffline('tap.stone');
    expect(out).toBeInstanceOf(Float32Array);
    expect(out.length).toBe(0);
  });
});
