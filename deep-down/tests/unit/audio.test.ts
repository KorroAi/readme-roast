import { describe, expect, it } from 'vitest';
import { B, BLOCKS, type SoundKind } from '../../src/config/blocks';
import { ITEM_IDS, ITEMS } from '../../src/config/items';
import { EventBus, type GameEvents } from '../../src/core/events';
import { Rng } from '../../src/core/rng';
import { activeDuration, peakOf, rmsOf, spectralCentroid } from '../../src/audio/analysis';
import { AudioSystem, renderSfxOffline, type AudioWorldState } from '../../src/audio/AudioSystem';
import { brownNoise, crackleTexture, crumbleTexture, impulseResponse, pinkNoise } from '../../src/audio/buffers';
import { AUDIBLE_EVENTS, sfxForEvent, stepKindOf } from '../../src/audio/eventMap';
import { MusicScheduler, type MusicNote } from '../../src/audio/MusicScheduler';
import { SFX, SFX_NAMES, isSfxName } from '../../src/audio/sfx';
import { MODES, MOODS, degreeToMidi, inMode, midiToHz, moodFor, volumeToGain, type MoodName } from '../../src/audio/theory';
import { RateGate, VoiceLimiter } from '../../src/audio/voices';

const SAMPLE_PAYLOADS: { [K in keyof GameEvents]: GameEvents[K] } = {
  'block:hit': { x: 1, y: 2, z: 3, block: B.SLATE, progress: 0.4 },
  'block:broken': { x: 1, y: 2, z: 3, block: B.COPPER_ORE },
  'block:tooHard': { x: 1, y: 2, z: 3, block: B.ANCIENT_BRICK, requiredTier: 99 },
  'prop:hit': { propId: 'crystalCluster_3', progress: 0.5, x: 0, y: 0, z: 0 },
  'prop:broken': { propId: 'crystalCluster_3', x: 0, y: 0, z: 0 },
  'tool:swing': { tier: 1 },
  'item:picked': { item: 'glimmerShard', count: 2 },
  'item:rejected': { item: 'stone' },
  'inventory:changed': {},
  'items:banked': { total: 9, items: { stone: 6, copperOre: 3 } },
  'craft:done': { recipe: 'copperPickaxe' },
  'craft:failed': { recipe: 'copperLantern', reason: 'missing' },
  discovery: { id: 'hollow' },
  'objective:changed': { id: 'mineCopper' },
  'player:footstep': { block: B.SOIL, speed: 4.6 },
  'player:jump': {},
  'player:land': { fallSpeed: 14, block: B.SLATE },
  'player:damaged': { amount: 12, cause: 'fall' },
  'player:died': { lost: { stone: 3 } },
  'player:respawned': {},
  'camp:entered': {},
  'camp:left': {},
  'lantern:low': {},
  'lantern:empty': {},
  'lantern:refueled': {},
  'game:saved': { reason: 'camp' },
  'game:saveFailed': { reason: 'quota' },
  toast: { text: 'hello' },
  'expedition:started': { n: 1 },
  'expedition:ended': {
    report: {
      n: 1, outcome: 'returned', duration: 200, deepest: 60, newBest: true, previousBest: 0, mined: 30, found: { stone: 20 }, banked: { stone: 20 },
      bankedTotal: 20, cached: null, cacheDepth: null, lostCount: 0, damage: 0, fuelLeft: 100, discoveries: [], runes: [], records: ['deepest'], show: true,
    },
  },
  'cache:created': { x: 1, y: 2, z: 3, count: 12, replaced: 0 },
  'cache:recovered': { count: 12, left: 0 },
  'lantern:turnBack': { seconds: 40 },
  'player:cold': { damage: 10 },
  'record:depth': { depth: 60 },
  'world:ride': { id: 'hoist', kind: 'hoist', dir: 'up', phase: 'start' },
  'world:runeWake': { id: 'reliquary', progress: 0.5 },
  'world:runeOpen': { id: 'reliquary', cells: 9 },
  'world:hoistReleased': {},
  'world:note': { id: 'office', first: true },
  'world:monolith': { first: true },
  'world:regrow': { epoch: 2, cells: 40, regrown: 6 },
  'world:bloom': { epoch: 2, site: 'adit', area: 'adit', x: 1, y: 2, z: 3 },
  'moths:startled': { x: 1, y: 2, z: 3, count: 4 },
  'station:built': { id: 'forge', x: 42, y: 101, z: 33 },
  'relic:found': { id: 'runeEye', count: 2, total: 8 },
  'finale:reached': {},
  'feat:earned': { id: 'firstCopper' },
};

const WORLD_STATE: AudioWorldState = {
  depth: 90, atCamp: false, openness: 0.7, lanternFuel: 0.1, lanternLit: true,
  nearCrystal: 0.5, nearFire: 0, playerSpeed: 3, inMenu: false,
};

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
  it('maps every audible event to a registered sound', () => {
    for (const type of AUDIBLE_EVENTS) {
      const req = sfxForEvent(type, SAMPLE_PAYLOADS[type] as never);
      expect(req, type).not.toBeNull();
      expect(isSfxName(req!.name), `${type} -> ${req!.name}`).toBe(true);
    }
    expect(sfxForEvent('toast', SAMPLE_PAYLOADS.toast)).toBeNull();
    expect(sfxForEvent('inventory:changed', {})).toBeNull();
  });

  it('chooses hit and break sounds from the block material', () => {
    const kinds = new Set<SoundKind>(BLOCKS.filter(Boolean).map((b) => b.sound));
    for (const k of kinds) {
      expect(isSfxName(`hit.${k}`)).toBe(true);
      expect(isSfxName(`break.${k}`)).toBe(true);
    }
    const hit = (block: number) => sfxForEvent('block:hit', { x: 0, y: 0, z: 0, block, progress: 0 })!.name;
    expect(hit(B.SLATE)).toBe('hit.stone');
    expect(hit(B.COPPER_ORE)).toBe('hit.metal');
    expect(hit(B.IRON_ORE)).toBe('hit.metal');
    expect(hit(B.CRYSTAL)).toBe('hit.crystal');
    expect(hit(B.SOIL)).toBe('hit.soil');
    expect(hit(B.ANCIENT_BRICK)).toBe('hit.ancient');
    expect(hit(B.PLANK)).toBe('hit.wood');
    expect(sfxForEvent('block:hit', SAMPLE_PAYLOADS['block:hit'])!.params.progress).toBe(0.4);
    expect(sfxForEvent('block:broken', { x: 0, y: 0, z: 0, block: B.CRYSTAL })!.name).toBe('break.crystal');
    expect(sfxForEvent('prop:broken', SAMPLE_PAYLOADS['prop:broken'])!.name).toBe('break.crystal');
  });

  it('brightens pickups with rarity', () => {
    for (const id of ITEM_IDS) {
      expect(sfxForEvent('item:picked', { item: id, count: 1 })!.name).toBe(`pickup.${ITEMS[id].rarity}`);
    }
    expect(SFX['pickup.relic'].length).toBeGreaterThan(SFX['pickup.common'].length);
    expect(SFX['pickup.relic'].wet).toBeGreaterThan(SFX['pickup.common'].wet);
  });

  it('picks footstep materials and scales landings with fall speed', () => {
    expect(stepKindOf(B.SLATE)).toBe('stone');
    expect(stepKindOf(B.COPPER_ORE)).toBe('stone');
    expect(stepKindOf(B.GRAVEL)).toBe('soil');
    expect(stepKindOf(B.PLANK)).toBe('wood');
    expect(stepKindOf(B.ANCIENT_TILE)).toBe('ancient');
    const soft = sfxForEvent('player:land', { fallSpeed: 5, block: B.SLATE })!.params.intensity!;
    const hard = sfxForEvent('player:land', { fallSpeed: 20, block: B.SLATE })!.params.intensity!;
    expect(hard).toBeGreaterThan(soft);
    expect(hard).toBeLessThanOrEqual(1);
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
    expect(SFX.discovery.priority).toBe(4);
    expect(SFX.discovery.wet).toBeGreaterThan(0.6);
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
  class CountingBus extends EventBus<GameEvents> {
    subscribed = 0;
    override on<K extends keyof GameEvents>(type: K, fn: (payload: GameEvents[K]) => void): () => void {
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
    for (const type of Object.keys(SAMPLE_PAYLOADS) as Array<keyof GameEvents>) {
      expect(() => bus.emit(type, SAMPLE_PAYLOADS[type] as never)).not.toThrow();
    }
    for (const name of ['click', 'open', 'close', 'error', 'craft', 'confirm'] as const) audio.ui(name);
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
    const out = await renderSfxOffline('hit.stone');
    expect(out).toBeInstanceOf(Float32Array);
    expect(out.length).toBe(0);
  });
});
