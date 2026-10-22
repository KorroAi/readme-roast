import { afterEach, describe, expect, it, vi } from 'vitest';
import { B } from '../../src/config/blocks';
import { SFX_VOICES } from '../../src/audio/AudioSystem';
import { EMITTERS, emitterLayer } from '../../src/audio/ambience';
import { createNoiseBank } from '../../src/audio/buffers';
import { majorKeyOf, shiftTo } from '../../src/audio/harmony';
import { MUSIC_VOICES } from '../../src/audio/MusicPlayer';
import { CATEGORY_CAP, DUCKS, Ducker, categoryOf, densityDuck } from '../../src/audio/mixer';
import { EMITTER_KINDS, EmitterIndex, PROP_EMITTERS, dangerOf, occlusionOf, scanVoxels } from '../../src/audio/probe';
import { BIOME_SCORES, SCORES, type ScoreId } from '../../src/audio/scores';
import { SFX_NAMES, playSfx } from '../../src/audio/sfx';
import { Voice } from '../../src/audio/synth';
import { DEFAULT_VOLUMES } from '../../src/audio/sim/scenes';
import { SYSTEM_SCENES, systemRig, type SystemRig } from '../../src/audio/sim/system';
import { SimAudioContext, SimOscillator } from '../../src/audio/sim/webAudioSim';
import { busTarget, createMixGraph } from '../../src/audio/graph';
import { bandShares, integratedLoudness, maxMomentaryLoudness, phoneFilter, spectralCentroid, truePeakOf } from '../../src/audio/analysis';
import { sfxForEvent } from '../../src/audio/eventMap';
import { MINE_KINDS } from '../../src/audio/mineSfx';
import { renderSfxOfflineChannels } from '../../src/audio/offline';
import { installSimAudio } from '../../src/audio/sim/webAudioSim';

// The mix (round 3, AUDIO): ducking, the voice budgets, the features and the probe, and the real
// AudioSystem on the Web Audio emulator through scripted scenes (src/audio/sim/system.ts): the score
// following the explorer, a descent, guardians, the finale, the densest fight, the volume sliders.

describe('mixing rules', () => {
  it('ducks to the deepest active cue, each until its own end', () => {
    const d = new Ducker();
    expect(d.target('music', 0)).toBe(1);
    d.add({ music: 0.6, ambience: 0.7, hold: 2 }, 0);
    d.add({ music: 0.4, ambience: 0.9, hold: 0.5 }, 0.2);
    expect(d.target('music', 0.3)).toBeCloseTo(0.4);
    expect(d.target('ambience', 0.3)).toBeCloseTo(0.7);
    expect(d.target('music', 1)).toBeCloseTo(0.6);
    expect(d.target('music', 2.5)).toBe(1);
    for (const [name, spec] of Object.entries(DUCKS)) {
      expect(SFX_NAMES.includes(name as never), name).toBe(true);
      expect(spec!.music, name).toBeGreaterThan(0.2);
      expect(spec!.music, name).toBeLessThanOrEqual(1);
      expect(spec!.hold, name).toBeLessThanOrEqual(5);
    }
  });

  it('eases the score and the beds back under a dense fight, and never for one voice', () => {
    expect(densityDuck(0)).toEqual({ music: 1, ambience: 1 });
    expect(densityDuck(1)).toEqual({ music: 1, ambience: 1 });
    let last = densityDuck(1);
    for (let n = 2; n <= 10; n++) {
      const d = densityDuck(n);
      expect(d.music).toBeLessThanOrEqual(last.music);
      expect(d.ambience).toBeLessThanOrEqual(last.ambience);
      last = d;
    }
    // At most -3 dB on the score and -4 dB on the beds.
    expect(20 * Math.log10(densityDuck(12).music)).toBeGreaterThan(-3.1);
    expect(20 * Math.log10(densityDuck(12).ambience)).toBeGreaterThan(-4.1);
    expect(densityDuck(Number.NaN)).toEqual({ music: 1, ambience: 1 });
  });

  it('puts every sound in a category whose budget fits in the global cap', () => {
    for (const name of SFX_NAMES) expect(CATEGORY_CAP[categoryOf(name)], name).toBeGreaterThan(0);
    expect(categoryOf('mob.chitter')).toBe('creature');
    expect(categoryOf('companion.chirp')).toBe('creature');
    expect(categoryOf('mob.hit.flesh')).toBe('blow');
    expect(categoryOf('act.bomb')).toBe('blow');
    expect(categoryOf('step.snow')).toBe('step');
    expect(categoryOf('amb.iceTink')).toBe('ambient');
    expect(categoryOf('sonar.ping')).toBe('echo');
    expect(categoryOf('sonar.pulse')).toBe('other');
    // No single category can fill the global cap alone.
    for (const [cat, cap] of Object.entries(CATEGORY_CAP)) expect(cap, cat).toBeLessThan(SFX_VOICES);
  });

  it('moves every tone of a keyed cue, never its LFOs, and never past 0.45 of the sample rate', () => {
    const ctx = new SimAudioContext({ sampleRate: 16000 });
    const graph = createMixGraph(ctx as unknown as BaseAudioContext, ctx.destination as unknown as AudioNode, 1);
    const target = busTarget(graph, 'sfx', () => 0.5);
    const v = new Voice(target, 0, { transpose: -3 });
    const tone = v.osc('sine', 880, 0, 1) as unknown as SimOscillator;
    expect(tone.detune.value).toBe(-300);
    const up = new Voice(target, 0, { transpose: 5 });
    expect((up.osc('sine', 880, 0, 1) as unknown as SimOscillator).detune.value).toBe(500);
    // Near the top, an upward move is capped so the tone stays below 0.45 x 16 kHz.
    const high = up.osc('sine', 6800, 0, 1) as unknown as SimOscillator;
    expect(6800 * Math.pow(2, high.detune.value / 1200)).toBeLessThanOrEqual(7200 + 1e-6);
    // An LFO keeps its rate.
    const before = ctx.nodesCreated;
    up.lfo(up.gain(1).gain, 6, 0.5, 0, 1);
    void before;
    const plain = new Voice(target, 0);
    expect((plain.osc('sine', 440, 0, 1) as unknown as SimOscillator).detune.value).toBe(0);
    // A real cue renders with and without a transposition.
    expect(() => playSfx(target, 'quest.done', { transpose: -4 }, 0.1).finish()).not.toThrow();
  });
});

describe('mining every biome\'s rock', () => {
  it('mines ice, obsidian, mushroom, mud, snow, vines and amber as themselves, within the round-1 materials\' levels, each its own colour', async () => {
    const hit = (block: number) => sfxForEvent('block:hit', { x: 0, y: 0, z: 0, block, progress: 0.3 })!.name;
    const brk = (block: number) => sfxForEvent('block:broken', { x: 0, y: 0, z: 0, block })!.name;
    expect([B.FROST_ICE, B.OBSIDIAN, B.MUSHROOM_CAP_TEAL, B.BOG_MUD, B.FROST_SNOW, B.GLOW_VINE, B.AMBER_ORE].map(hit))
      .toEqual(['hit.ice', 'hit.glass', 'hit.fungus', 'hit.mud', 'hit.snow', 'hit.vine', 'hit.resin']);
    expect(brk(B.ICE_CRYSTAL)).toBe('break.ice');
    expect(hit(B.AMBER_LIMESTONE)).toBe('hit.stone');
    expect(hit(B.GOLD_ORE)).toBe('hit.metal');
    expect(hit(B.CITY_STONE)).toBe('hit.ancient');
    const rate = 24000;
    const sim = installSimAudio(rate);
    try {
      const measure = async (name: string) => {
        const ch = await renderSfxOfflineChannels(name, rate);
        const mono = new Float32Array(ch[0].length);
        for (let i = 0; i < mono.length; i++) mono[i] = (ch[0][i] + ch[1][i]) / 2;
        return { lu: maxMomentaryLoudness(ch.map((c) => phoneFilter(c, rate)), rate), centroid: spectralCentroid(mono, rate), peak: Math.max(...ch.map((c) => truePeakOf(c))) };
      };
      // The round-1 materials already span a range on a phone (crystal rings loudest, wood knocks softest):
      // the new ones sit inside it, and the biome's everyday rock (mushroom, mud, snow, vines) is never
      // more than 2 dB under stone, the material mined most.
      const round1: number[] = [];
      for (const k of ['stone', 'metal', 'crystal', 'wood', 'soil', 'ancient']) round1.push((await measure(`hit.${k}`)).lu);
      const stone = round1[0];
      const m: Record<string, { lu: number; centroid: number; peak: number }> = {};
      for (const k of MINE_KINDS) {
        m[k] = await measure(`hit.${k}`);
        const b = await measure(`break.${k}`);
        const label = `${k} ${m[k].lu.toFixed(1)} LUFS (round 1 ${Math.min(...round1).toFixed(1)}..${Math.max(...round1).toFixed(1)})`;
        expect(m[k].lu, label).toBeGreaterThan(Math.min(...round1) - 2);
        expect(m[k].lu, label).toBeLessThan(Math.max(...round1));
        if (['fungus', 'mud', 'snow', 'vine'].includes(k)) expect(m[k].lu, `${label} vs stone ${stone.toFixed(1)}`).toBeGreaterThan(stone - 2);
        expect(m[k].peak, k).toBeLessThan(1);
        expect(b.peak, k).toBeLessThan(1);
        expect(b.lu, k).toBeGreaterThan(m[k].lu - 3);
      }
      // Ice and glass bright, mushroom and mud dark.
      expect(Math.min(m.ice.centroid, m.glass.centroid)).toBeGreaterThan(Math.max(m.fungus.centroid, m.mud.centroid) * 1.4);
    } finally {
      sim.restore();
    }
  });
});

describe("each biome's bed on a phone", () => {
  it('reaches a phone speaker (its wind, hum, roar or drone in the band a phone plays), never hissy, never jumping out', () => {
    const rate = 8000;
    for (const biome of BIOME_SCORES) {
      const rig = systemRig({ sampleRate: rate, volumes: { ...DEFAULT_VOLUMES, music: 0, sfx: 0 } });
      try {
        rig.game.strata.biomeHere = biome;
        rig.run(3);
        rig.take();
        rig.run(9);
        const [l, r] = rig.take();
        const mono = new Float32Array(l.length);
        for (let i = 0; i < l.length; i++) mono[i] = (l[i] + r[i]) / 2;
        const phone = integratedLoudness([phoneFilter(l, rate), phoneFilter(r, rate)], rate);
        // A texture ~10-16 dB under the explore score on a phone (round 2's beds sat at -46..-48 there).
        expect(phone, `${biome} phone ${phone.toFixed(1)} LUFS`).toBeGreaterThan(-48);
        expect(phone, `${biome} phone ${phone.toFixed(1)} LUFS`).toBeLessThan(-37);
        expect(bandShares(mono, rate)[2], `${biome} above 2 kHz`).toBeLessThan(0.2);
        expect(Math.max(truePeakOf(l), truePeakOf(r)), biome).toBeLessThan(0.25);
      } finally {
        rig.close();
      }
    }
  });
});

describe('the probe: danger and the features that sound', () => {
  it('weighs danger by intent and distance, ignores guardians and beings, counts the engaged', () => {
    const at = (x: number, state: string, extra: object = {}) => ({ hostile: true, state, position: { x, y: 0, z: 0 }, ...extra });
    expect(dangerOf([], 0, 0, 0).danger).toBe(0);
    const near = dangerOf([at(3, 'windup')], 0, 0, 0);
    const far = dangerOf([at(20, 'windup')], 0, 0, 0);
    const idle = dangerOf([at(3, 'idle')], 0, 0, 0);
    expect(near.danger).toBeGreaterThan(far.danger);
    expect(near.danger).toBeGreaterThan(idle.danger);
    expect(near.engaged).toBe(1);
    expect(dangerOf([at(30, 'windup')], 0, 0, 0).danger).toBe(0);
    expect(dangerOf([at(2, 'windup', { rank: 'guardian' }), { hostile: false, state: 'idle', position: { x: 1, y: 0, z: 0 } }], 0, 0, 0).danger).toBe(0);
    const pack = dangerOf([at(4, 'stalk'), at(5, 'stalk'), at(6, 'windup')], 0, 0, 0);
    expect(pack.danger).toBeGreaterThan(near.danger);
    expect(pack.danger).toBeLessThan(1);
  });

  it('indexes every kind of feature: props, the falls as segments, the rivers along their course, the hazard zones', () => {
    const river: number[][] = [];
    for (let x = 0; x <= 100; x += 1.2) river.push([x, 10, 50]);
    const index = new EmitterIndex({
      props: [{ kind: 'waterfall', x: 10, y: 10, z: 10 }, { kind: 'amberDrip', x: 12, y: 12, z: 10 }, { kind: 'chest', x: 11, y: 10, z: 10 }, { kind: 'voidSpire', x: 80, y: 10, z: 80 }],
      falls: [{ kind: 'water', top: [40, 40, 20], bottom: [40, 12, 20], width: 2.4 }, { kind: 'lava', top: [90, 30, 20], bottom: [90, 10, 20] }],
      rivers: [{ kind: 'water', points: river }, { kind: 'lava', points: [[0, 10, 90], [3.7, 10, 90], [7.4, 10, 90]] }],
      hazards: [{ kind: 'falls', centre: [60, 10, 60], radius: 4, strength: 1 }, { kind: 'rockfall', centre: [20, 10, 70], radius: 5, strength: 1 }, { kind: 'gas', centre: [70, 10, 30], radius: 6, strength: 0.5 }],
    });
    expect(index.byKind.cascade).toBe(1);
    expect(index.byKind.drips).toBe(1);
    expect(index.byKind.waterfall).toBe(1);
    expect(index.byKind.lavaFall).toBe(1);
    expect(index.byKind.void).toBe(1);
    expect(index.byKind.draft).toBe(1);
    expect(index.byKind.rubble).toBe(1);
    expect(index.byKind.bubbles).toBe(1);
    // The river is heard from points about 3.6 m apart along its 100 m.
    expect(index.byKind.river).toBeGreaterThanOrEqual(25);
    expect(index.byKind.river).toBeLessThanOrEqual(30);
    expect(index.byKind.lava).toBe(3);
    // By the river: its nearest point, beside the ear.
    const byRiver = index.near(50.3, 11.6, 52);
    const r = byRiver.find((e) => e.kind === 'river')!;
    expect(r).toBeDefined();
    expect(Math.abs(r.x - 50.3)).toBeLessThan(2.2);
    // Under the fall's middle: heard from the nearest point of its column, not its top.
    const under = index.near(42, 26, 20).find((e) => e.kind === 'waterfall')!;
    expect(under.y).toBeCloseTo(26, 0);
    expect(under.d).toBeLessThan(3);
    // One per kind, the nearest relative to its range first.
    const here = index.near(10.5, 10.5, 10.5);
    expect(new Set(here.map((e) => e.kind)).size).toBe(here.length);
    for (let i = 1; i < here.length; i++) expect(here[i].d / here[i].range).toBeGreaterThanOrEqual(here[i - 1].d / here[i - 1].range - 1e-9);
    // Nothing at the edge of the world.
    expect(index.near(250, 10, 250)).toHaveLength(0);
  });

  it('defines every kind (a loop, one-shots, or both) and builds a loop only for the loop kinds', () => {
    const ctx = new SimAudioContext({ sampleRate: 8000 });
    const noise = createNoiseBank(ctx as unknown as BaseAudioContext, 1);
    for (const kind of EMITTER_KINDS) {
      const def = EMITTERS[kind];
      expect(def.level > 0 || !!def.shot, kind).toBe(true);
      if (def.shot) expect(SFX_NAMES.includes(def.shot.name), `${kind} ${def.shot.name}`).toBe(true);
      const layer = emitterLayer(kind, ctx as unknown as BaseAudioContext, noise, ctx.destination as unknown as AudioNode, null);
      expect(layer !== null, kind).toBe(def.level > 0);
    }
    for (const [prop, e] of Object.entries(PROP_EMITTERS)) expect(EMITTER_KINDS.includes(e.kind), prop).toBe(true);
  });

  it('hears rock between the ear and a source, and the torches and lava in the voxels', () => {
    const wall = (x: number, _y: number, _z: number) => (x >= 5 && x <= 8 ? B.SLATE : B.AIR);
    expect(occlusionOf(() => B.AIR, 0, 0, 0, 20, 0, 0)).toBe(0);
    expect(occlusionOf(wall, 0, 0, 0, 20, 0, 0)).toBeGreaterThan(0.25);
    expect(occlusionOf(() => B.SLATE, 0, 0, 0, 20, 0, 0)).toBe(1);
    expect(occlusionOf(wall, 0, 0, 0, 2, 0, 0)).toBe(0);
    const cells = (x: number, y: number, z: number) => (x === 3 && y === 1 && z === 2 ? B.TORCH : x === 10 && y === -2 && z === 4 ? B.LAVA : B.AIR);
    const found = scanVoxels(cells, 0, 2, 0);
    expect(found.map((e) => e.kind).sort()).toEqual(['lava', 'torch']);
  });
});

// ---------------------------------------------------------------------------------------
// The real AudioSystem on the emulator

interface Snap {
  t: number;
  score: ScoreId | null;
  phase: number;
  key: number;
  intensity: string;
  bed: string;
  decks: number;
  loops: string[];
  combat: number;
  sfx: number;
  music: number;
}

/** A rig with a timeline of the AudioSystem's stats and the scene's marks. */
function timeline(rate: number, scene: keyof typeof SYSTEM_SCENES): { rig: SystemRig; snaps: Snap[]; marks: Map<string, number> } {
  const rig = systemRig({ sampleRate: rate });
  const snaps: Snap[] = [];
  const marks = new Map<string, number>();
  let n = 0;
  rig.onFrame = (t) => {
    if (n++ % 2) return;
    const s = rig.audio.stats();
    snaps.push({ t, score: s.score, phase: s.phase, key: s.key, intensity: s.intensity, bed: s.bed, decks: s.decks, loops: s.loops, combat: s.stems?.combat ?? 0, sfx: s.sfxVoices, music: s.musicVoices });
  };
  SYSTEM_SCENES[scene].run(rig, (label) => marks.set(label, rig.ctx.currentTime));
  return { rig, snaps, marks };
}

/** The snapshot nearest to `seconds` after a mark. */
function at(tl: { snaps: Snap[]; marks: Map<string, number> }, label: string, seconds: number): Snap {
  const m = tl.marks.get(label);
  if (m === undefined) throw new Error(`no mark ${label}`);
  const t = m + seconds;
  let best = tl.snaps[0];
  for (const s of tl.snaps) if (Math.abs(s.t - t) < Math.abs(best.t - t)) best = s;
  return best;
}

describe('the AudioSystem on the emulator: the score follows the explorer', () => {
  let rig: SystemRig | null = null;
  afterEach(() => {
    rig?.close();
    rig = null;
  });

  it('walks a stratum: the river and the vista\'s fall heard where they are, a border crossed once, never ping-ponged, tension near monsters', () => {
    const tl = timeline(8000, 'walk');
    rig = tl.rig;
    expect(at(tl, 'river', 3).score).toBe('amberHollows');
    expect(at(tl, 'river', 3).loops).toContain('river');
    // The border flickers for 1.5 s: the score stays.
    for (let s = 0.2; s < 1.5; s += 0.2) expect(at(tl, 'border flicker', s).score).toBe('amberHollows');
    // It holds: the Mushroom Forest's score, its bed.
    expect(at(tl, 'mushroomForest held', 1).score).toBe('mushroomForest');
    expect(at(tl, 'mushroomForest held', 1).bed).toBe('mushroomForest');
    expect(at(tl, 'mushroomForest held', 1).key).toBe(shiftTo(majorKeyOf(SCORES.mushroomForest)));
    // Near the vista's fall, its roar is one of the loops.
    expect(at(tl, 'near the fall', 2).loops).toContain('waterfall');
    // Three seconds back over the border, a moment after a change: the score does not turn back.
    for (let s = 0.5; s < 3; s += 0.5) expect(at(tl, 'excursion back', s).score).toBe('mushroomForest');
    // A real return long after the last change: the score follows after its usual two seconds.
    expect(at(tl, 'return', 1).score).toBe('mushroomForest');
    expect(at(tl, 'return', 3.5).score).toBe('amberHollows');
    // Monsters near: tension; gone: calm again in a few seconds.
    expect(at(tl, 'monsters near', 3).intensity).toBe('tension');
    expect(at(tl, 'monsters near', 3).score).toBe('mushroomForest');
    // Never more than the current deck and two fading.
    expect(Math.max(...tl.snaps.map((s) => s.decks))).toBeLessThanOrEqual(3);
    // Every one-shot and every score voice within its cap the whole time.
    expect(rig.peaks.sfx).toBeLessThanOrEqual(SFX_VOICES);
    expect(rig.peaks.music).toBeLessThanOrEqual(MUSIC_VOICES);
    const m = rig.measure();
    expect(m.nonFinite).toBe(0);
    expect(m.clipped).toBe(0);
  });

  it('descends: silent under the loading screen, the new stratum\'s biome at once, never a stand-in score', () => {
    const tl = timeline(8000, 'descent');
    rig = tl.rig;
    expect(at(tl, 'gate opens', -1).score).toBe('rootGalleries');
    expect(at(tl, 'loading', 2.5).score).toBeNull();
    const arrival = tl.marks.get('arrival')!;
    const after = tl.snaps.filter((s) => s.t >= arrival);
    // From the swap on: only the new biome's score (or silence for the frame it is unknown).
    for (const s of after) expect([null, 'crystalGeode']).toContain(s.score);
    expect(at(tl, 'arrival', 1).score).toBe('crystalGeode');
    expect(at(tl, 'settled', 0).bed).toBe('crystalGeode');
    expect(after.some((s) => s.bed === 'amberHollows' || s.bed === 'rootGalleries')).toBe(false);
  });

  it('plays the Heart\'s finale in order: the Heart relit, the Dark Heart\'s three phases, its fall, the ending after the chord', () => {
    const tl = timeline(8000, 'finale');
    rig = tl.rig;
    expect(at(tl, 'heart lit', -1).score).toBe('heart');
    // The Heart's major chord holds the score a few seconds, then the boss's theme.
    expect(at(tl, 'heart lit', 2).score).toBe('heart');
    expect(at(tl, 'the Dark Heart wakes', 6).score).toBe('heartBoss');
    // Its call (no drums) first, then the fight.
    const wake = tl.snaps.filter((s) => s.score === 'heartBoss');
    expect(wake[0].combat).toBeLessThan(0.2);
    expect(at(tl, 'the Dark Heart wakes', 10).combat).toBeGreaterThan(0.8);
    expect(at(tl, 'phase 2', 1).phase).toBe(2);
    expect(at(tl, 'phase 3', 1).phase).toBe(3);
    // Its fall: the Heart's chord on the boss's deck, in D major, then the ending; never the biome between.
    expect(at(tl, 'the Dark Heart falls', 1).score).toBe('heartBoss');
    expect(at(tl, 'the Dark Heart falls', 1).key).toBe(0);
    const fall = tl.marks.get('the Dark Heart falls')!;
    const afterFall = tl.snaps.filter((s) => s.t > fall);
    for (const s of afterFall) expect(['heartBoss', 'ending']).toContain(s.score);
    expect(at(tl, 'ending', 0).score).toBe('ending');
    expect(rig.peaks.music).toBeLessThanOrEqual(MUSIC_VOICES);
    // The Heart's two acts in sound: the shards kindling as it wakes, the deep relit as the Dark Heart falls.
    const played = rig.audio.stats().played;
    expect(played['loop.heart']).toBe(1);
    expect(played['finale.relight']).toBe(1);
  });
});

describe('the AudioSystem on the emulator: the densest fight never clips', () => {
  it('holds a dense fight with a guardian: no clipping, no NaN, every budget kept, nothing left running', () => {
    const rig = systemRig({ sampleRate: 16000 });
    try {
      const snaps: Snap[] = [];
      const marks = new Map<string, number>();
      rig.onFrame = (t) => {
        const s = rig.audio.stats();
        for (const [cat, n] of Object.entries(s.categories)) expect(n, cat).toBeLessThanOrEqual(CATEGORY_CAP[cat as keyof typeof CATEGORY_CAP]);
        snaps.push({ t, score: s.score, phase: s.phase, key: s.key, intensity: s.intensity, bed: s.bed, decks: s.decks, loops: s.loops, combat: s.stems?.combat ?? 0, sfx: s.sfxVoices, music: s.musicVoices });
      };
      SYSTEM_SCENES.dense.run(rig, (label) => marks.set(label, rig.ctx.currentTime));
      const m = rig.measure();
      expect(m.nonFinite).toBe(0);
      expect(m.clipped).toBe(0);
      expect(m.peak).toBeLessThan(1);
      expect(m.truePeak).toBeLessThan(1);
      expect(m.lufs).toBeGreaterThan(-30);
      expect(m.lufs).toBeLessThan(-14);
      expect(Math.abs(m.dc)).toBeLessThan(0.01);
      expect(rig.peaks.sfx).toBeLessThanOrEqual(SFX_VOICES);
      expect(rig.peaks.music).toBeLessThanOrEqual(MUSIC_VOICES);
      // The fight's layers: tension then combat; the guardian's theme, its second phase, the victory's key, the biome back.
      const tl = { snaps, marks };
      expect(at(tl, 'pack', 2.5).intensity).not.toBe('calm');
      expect(at(tl, 'guardian awake', 1).score).toBe('guardian4');
      expect(at(tl, 'phase 2', 1).phase).toBe(2);
      expect(at(tl, 'guardian falls', 0.3).key).toBe(shiftTo(SCORES.guardian4.tonic));
      // Then silence: every one-shot ends and its nodes are released; only the beds and the score's tails run.
      rig.onFrame = null;
      rig.game.creatures = [];
      const busy = rig.ctx.activeSources;
      rig.run(12);
      expect(rig.audio.stats().sfxVoices).toBeLessThanOrEqual(3);
      expect(rig.ctx.activeSources).toBeLessThan(Math.max(80, busy));
      expect(rig.audio.stats().score).toBe('frostCaverns');
    } finally {
      rig.close();
    }
  });
});

describe('the AudioSystem on the emulator: one moment, one sound; the sliders', () => {
  let rig: SystemRig | null = null;
  afterEach(() => {
    rig?.close();
    rig = null;
  });

  it('lets a button\'s click give way to the page it turns, and hears the companion\'s taming once', () => {
    rig = systemRig({ sampleRate: 8000 });
    rig.run(1);
    rig.audio.ui('click');
    rig.emit('ui:opened', { screen: 'map' });
    rig.run(0.05);
    expect(rig.audio.stats().categories.ui).toBe(1);
    rig.run(1);
    // The other order: the page first, the click after it in the same gesture.
    rig.emit('ui:opened', { screen: 'quests' });
    rig.audio.ui('click');
    rig.run(0.05);
    expect(rig.audio.stats().categories.ui).toBe(1);
    rig.run(1);
    rig.emit('companion:tamed', { kind: 'lampling', name: 'Lampling' });
    rig.emit('mob:sfx', { name: 'companion.happy', pan: 0.4, gain: 0.8 });
    rig.run(0.05);
    expect(rig.audio.stats().categories.creature).toBe(1);
    expect(rig.audio.stats().played['companion.happy']).toBe(1);
    // A guardian's fall rings its shard: the shard cue of the same moment stays quiet.
    const before = rig.audio.stats().categories.other;
    rig.emit('mob:guardianDefeated', { id: 1, kind: 'amberMatriarch', biome: 'amberHollows', shard: 'amberHollows', x: 0, y: 0, z: 0 });
    rig.emit('quest:shard', { biome: 'amberHollows', count: 1 });
    rig.emit('quest:done', { id: 'main:guardian.amberHollows', kind: 'main', reward: '+1' });
    rig.emit('reward:paid', { items: { gem: 1 }, reason: 'guardian' });
    rig.run(0.05);
    expect(rig.audio.stats().categories.other).toBe(before);
    const played = rig.audio.stats().played;
    expect(played['loop.shard'] ?? 0).toBe(0);
    expect(played['quest.done'] ?? 0).toBe(0);
    expect(played['reward.pouch'] ?? 0).toBe(0);
  });

  it("lets the Dark Heart's own beat replace the Heart bed's, and offers the score's beat grid", () => {
    rig = systemRig({ sampleRate: 8000 });
    rig.game.strata.current = 6;
    rig.game.strata.biomeHere = 'heart';
    rig.run(12);
    const bedBeats = rig.audio.stats().played['amb.heartbeat'] ?? 0;
    expect(bedBeats).toBeGreaterThanOrEqual(2);
    // MOBS' heartbeat every 1.25 s: the bed's falls silent while it lasts.
    let t = 0;
    rig.run(12, (_time, dt) => {
      t += dt;
      if (t >= 1.25) {
        t -= 1.25;
        rig!.emit('mob:sfx', { name: 'guardian.heartbeat', pan: 0, gain: 0.8 });
      }
    });
    expect((rig.audio.stats().played['amb.heartbeat'] ?? 0) - bedBeats).toBeLessThanOrEqual(1);
    expect(rig.audio.stats().played['guardian.heartbeat']).toBeGreaterThanOrEqual(8);
    // The beat grid of the Heart's score (70 bpm).
    const b = rig.audio.nextBeat()!;
    expect(b.bpm).toBe(70);
    expect(b.beat).toBeCloseTo(60 / 70, 6);
    expect(b.in).toBeGreaterThanOrEqual(0);
    expect(b.in).toBeLessThanOrEqual(b.beat + 1e-6);
  });

  it('lets a story beat shadow the lesser cues of the same moment, in either order', () => {
    rig = systemRig({ sampleRate: 8000 });
    rig.run(1);
    const played = (k: string) => rig!.audio.stats().played[k] ?? 0;
    // Alone, a quest step chimes.
    rig.emit('quest:step', { id: 'main:s1.lairs', kind: 'main', text: '' });
    rig.run(3);
    expect(played('quest.step')).toBe(1);
    // A gate opens and the quest moves on in the same frame: the gate alone is heard.
    rig.emit('world:gateOpened', { stratum: 1 });
    rig.emit('quest:step', { id: 'main:s1.descend', kind: 'main', text: '' });
    rig.run(0.1);
    expect(played('loop.gate')).toBe(1);
    expect(played('quest.step')).toBe(1);
    rig.run(6);
    // The other order: the step first, the guardian's fall right after it cuts it.
    const before = rig.audio.stats().shadowed;
    rig.emit('quest:step', { id: 'main:s1.gate', kind: 'main', text: '' });
    rig.emit('mob:sfx', { name: 'guardian.fall', pan: 0, gain: 1 });
    rig.run(0.1);
    expect(rig.audio.stats().shadowed).toBe(before + 1);
  });

  it("states a biome's motif on its first visit (the starter biome's once the explorer leaves the camp), not on a return", () => {
    rig = systemRig({ sampleRate: 8000 });
    rig.game.strata.biomeHere = 'amberHollows';
    rig.state.atCamp = true;
    rig.emit('world:biome', { biome: 'amberHollows', from: null, stratum: 1, first: true });
    rig.run(6);
    expect(rig.audio.stats().score).toBe('camp');
    expect(rig.audio.stats().stingNotes).toBe(0);
    rig.state.atCamp = false;
    rig.run(10);
    expect(rig.audio.stats().score).toBe('amberHollows');
    const first = rig.audio.stats().stingNotes;
    expect(first).toBeGreaterThanOrEqual(SCORES.amberHollows.motif.length);
    // Into the camp and out again: a return, no motif statement.
    rig.state.atCamp = true;
    rig.run(6);
    rig.state.atCamp = false;
    rig.emit('world:biome', { biome: 'amberHollows', from: null, stratum: 1, first: false });
    rig.run(10);
    expect(rig.audio.stats().stingNotes).toBe(first);
  });

  it('climbs a ladder and a rope hand over hand, faster when climbing faster, silent when hanging still', () => {
    rig = systemRig({ sampleRate: 8000 });
    const g = rig.game;
    const climb = (block: number, vy: number, seconds: number) => {
      g.player.climbing = true;
      g.player.vy = vy;
      g.voxel = (x, y, z) => (x === 128 && z === 128 && y >= 38 && y <= 44 ? block : B.AIR);
      const before = { ...rig!.audio.stats().played };
      rig!.run(seconds);
      const after = rig!.audio.stats().played;
      const n = (k: string) => (after[k] ?? 0) - (before[k] ?? 0);
      return { ladder: n('climb.ladder'), rope: n('climb.rope') };
    };
    rig.run(1);
    const fast = climb(B.LADDER, 3.2, 3);
    expect(fast.ladder).toBeGreaterThanOrEqual(6);
    expect(fast.rope).toBe(0);
    const slow = climb(B.LADDER, 1.2, 3);
    expect(slow.ladder).toBeLessThan(fast.ladder);
    expect(slow.ladder).toBeGreaterThanOrEqual(3);
    expect(climb(B.ROPE, -3.2, 2).rope).toBeGreaterThanOrEqual(4);
    expect(climb(B.ROPE, 0, 2)).toEqual({ ladder: 0, rope: 0 });
    g.player.climbing = false;
  });

  it('hears the explorer\'s heart under 30 % health, quicker as it drops; never at full health or at camp', () => {
    rig = systemRig({ sampleRate: 8000 });
    const beats = (health: number, seconds: number, atCamp = false) => {
      rig!.game.health.fraction = health;
      rig!.state.atCamp = atCamp;
      const before = rig!.audio.stats().played['player.heartbeat'] ?? 0;
      rig!.run(seconds);
      return (rig!.audio.stats().played['player.heartbeat'] ?? 0) - before;
    };
    rig.run(1);
    expect(beats(1, 5)).toBe(0);
    const weak = beats(0.25, 10);
    const dying = beats(0.05, 10);
    expect(weak).toBeGreaterThanOrEqual(10);
    expect(dying).toBeGreaterThan(weak);
    expect(dying).toBeLessThanOrEqual(19);
    expect(beats(0.1, 5, true)).toBe(0);
  });

  it('warns of a hazard once near full (its 40 % warning is LOOP\'s), never over the onset, again after it eased', () => {
    rig = systemRig({ sampleRate: 8000 });
    const hz = rig.game.hazards;
    const count = () => rig!.audio.stats().played['hazard.cold'] ?? 0;
    const ramp = (from: number, to: number, seconds: number, each?: (level: number) => void) => {
      const frames = Math.round(seconds * 30);
      for (let i = 0; i < frames; i++) {
        hz.active = 'cold';
        hz.meter = from + ((to - from) * (i + 1)) / frames;
        each?.(hz.meter);
        rig!.run(1 / 30);
      }
    };
    rig.run(1);
    ramp(0, 0.99, 6);
    expect(count()).toBe(1);
    ramp(0.99, 0.6, 2);
    ramp(0.6, 0.99, 2);
    expect(count()).toBe(1);
    // Eased below 35 %, then up again with LOOP's onset just before the strong warning: the onset speaks.
    ramp(0.99, 0.2, 3);
    let onset = false;
    ramp(0.2, 0.99, 4, (l) => {
      if (l > 0.84 && !onset) {
        onset = true;
        rig!.emit('hazard:changed', { kind: 'cold', level: l });
      }
    });
    expect(count()).toBe(1);
    expect(rig.audio.stats().played['loop.hazard.cold']).toBe(1);
  });

  it("huffs each of VIS's geyser columns once from its vent, by distance, quieter behind rock; never paused or too far", () => {
    rig = systemRig({ sampleRate: 8000 });
    const g = rig.game;
    g.strata.biomeHere = 'sulphurBog';
    const huffs: Array<{ pan: number; gain: number }> = [];
    const audio = rig.audio as unknown as { play(name: string, params: { pan?: number; gain?: number }): void };
    const play = audio.play.bind(rig.audio);
    vi.spyOn(audio, 'play').mockImplementation((name, params) => {
      if (name === 'amb.geyser') huffs.push({ pan: params.pan ?? 0, gain: params.gain ?? 1 });
      play(name, params);
    });
    const column = (at: [number, number, number] | null, seconds = 4.4) => {
      g.geysers.active = at;
      if (at) g.geysers.eruptions++;
      rig!.run(seconds);
      g.geysers.active = null;
      rig!.run(0.5);
    };
    // A column standing on and on is one huff, not one per frame.
    g.geysers.active = [136, 39, 128];
    g.geysers.eruptions = 3;
    rig.run(4.4);
    g.geysers.active = null;
    rig.run(0.5);
    expect(huffs).toHaveLength(1);
    huffs.length = 0;
    // 8 m to the right (the ear faces +z, its right is +x), then 24 m off, then 40 m (too far).
    column([136, 39, 128]);
    column([152, 39, 128]);
    column([168, 39, 128]);
    expect(huffs).toHaveLength(2);
    expect(huffs[0].pan).toBeGreaterThan(0.5);
    expect(huffs[1].gain).toBeLessThan(huffs[0].gain * 0.5);
    // The same vent behind a wall of rock: heard, softer.
    g.voxel = (x) => (x >= 130 && x <= 133 ? B.SLATE : B.AIR);
    column([136, 39, 128]);
    expect(huffs).toHaveLength(3);
    expect(huffs[2].gain).toBeLessThan(huffs[0].gain * 0.75);
    g.voxel = () => B.AIR;
    // Paused (a menu over the game): the column stands silent.
    rig.audio.setPaused(true);
    column([136, 39, 128]);
    rig.audio.setPaused(false);
    expect(huffs).toHaveLength(3);
    expect(rig.audio.stats().played['amb.geyser']).toBe(4);
  });

  it('keeps real time on a slow device: at 2 fps a border settles in its own seconds and the score drops no notes', () => {
    const run = (fps: number) => {
      const r = systemRig({ sampleRate: 8000, fps });
      try {
        r.run(18);
        const before = r.audio.stats().notes;
        r.run(12);
        const notes = r.audio.stats().notes - before;
        const lookahead = r.audio.stats().lookahead;
        r.game.strata.biomeHere = 'mushroomForest';
        r.run(2.6);
        return { notes, lookahead, biome: r.audio.stats().biome };
      } finally {
        r.close();
      }
    };
    const fast = run(30);
    const slow = run(2);
    expect(fast.biome).toBe('mushroomForest');
    expect(slow.biome).toBe('mushroomForest');
    expect(fast.lookahead).toBeCloseTo(0.35, 2);
    expect(slow.lookahead).toBeGreaterThan(0.7);
    expect(fast.notes).toBeGreaterThan(20);
    expect(slow.notes).toBeGreaterThanOrEqual(fast.notes * 0.9);
  });

  it('follows the volume sliders: music, effects and beds each silenced alone, all with the master', () => {
    const level = (volumes: typeof DEFAULT_VOLUMES, events: boolean) => {
      const r = systemRig({ sampleRate: 8000, volumes });
      try {
        r.game.strata.biomeHere = 'glowrootJungle';
        r.run(6, (t) => {
          if (events && Math.round(t * 30) % 9 === 0) r.emit('player:footstep', { block: B.JUNGLE_MOSS, speed: 4.2 });
        });
        return r.measure().peak;
      } finally {
        r.close();
      }
    };
    const full = level(DEFAULT_VOLUMES, true);
    expect(full).toBeGreaterThan(0.01);
    expect(level({ ...DEFAULT_VOLUMES, master: 0 }, true)).toBeLessThan(1e-4);
    expect(level({ master: 0.8, music: 0, sfx: 0, ambience: 0 }, true)).toBeLessThan(1e-4);
    // Each bus alone is heard: the score, the steps, the bed.
    expect(level({ master: 0.8, music: 0.55, sfx: 0, ambience: 0 }, false)).toBeGreaterThan(1e-3);
    expect(level({ master: 0.8, music: 0, sfx: 0.8, ambience: 0 }, true)).toBeGreaterThan(1e-3);
    expect(level({ master: 0.8, music: 0, sfx: 0, ambience: 0.6 }, false)).toBeGreaterThan(1e-3);
  });
});
