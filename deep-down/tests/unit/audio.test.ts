import { describe, expect, it } from 'vitest';
import { B, BLOCKS, type SoundKind } from '../../src/config/blocks';
import { ITEM_IDS, ITEMS } from '../../src/config/items';
import { RECIPES } from '../../src/config/recipes';
import { EventBus, type GameEvents } from '../../src/core/events';
import { Rng } from '../../src/core/rng';
import { activeDuration, peakOf, rmsOf, spectralCentroid } from '../../src/audio/analysis';
import { AudioSystem, LISTENED_EVENTS, renderSfxOffline, type AudioWorldState } from '../../src/audio/AudioSystem';
import { brownNoise, crackleTexture, crumbleTexture, impulseResponse, pinkNoise } from '../../src/audio/buffers';
import { AUDIBLE_EVENTS, MOMENT_STEPS, REWARD_MOMENTS, SILENT_EVENTS, VOICED_ELSEWHERE, sfxForEvent, stepKindOf } from '../../src/audio/eventMap';
import { CALM_MIX, MusicScheduler, type LayerMix, type MusicNote } from '../../src/audio/MusicScheduler';
import { TIMBRES } from '../../src/audio/instruments';
import { BIOME_SCORES, SCORES, SCORE_IDS, guardianScoreFor } from '../../src/audio/scores';
import { SFX, SFX_NAMES, isSfxName, type StepKind } from '../../src/audio/sfx';
import { KEYED, majorKeyOf, shiftTo } from '../../src/audio/harmony';
import { MODES, MOODS, degreeToMidi, inMode, midiToHz, moodFor, volumeToGain } from '../../src/audio/theory';
import { RateGate, VoiceLimiter } from '../../src/audio/voices';

/** A realistic sample of every bus event, the optional ones too (`-?`): a new event fails to compile here until it has one. */
const SAMPLE_PAYLOADS: { [K in keyof GameEvents]-?: NonNullable<GameEvents[K]> } = {
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
  // WORLD (round 2): the world events (src/game/events/types.ts augments GameEvents).
  'world:event': { event: { id: 'tremor-1', kind: 'tremor', start: 0, end: 6, anchor: [0, 0, 0], radius: 4 }, phase: 'start' },
  'world:rockfall': { x: 0, y: 0, z: 0, hit: false },
  'world:pocket': { x: 0, y: 0, z: 0, cells: 12 },
  // WORLD (round 3): the strata.
  'world:stratum': { stratum: 2, from: 1, biomes: ['rootGalleries', 'floodedGrottoes'] },
  'world:biome': { biome: 'mushroomForest', from: 'amberHollows', stratum: 1, first: true },
  'world:lairRevealed': { id: 'lair_amberHollows', biome: 'amberHollows', how: 'page' },
  'world:gateOpened': { stratum: 1 },
  'world:site': { id: 'vista_1', kind: 'vista', name: 'amberVista', biome: 'amberHollows', stratum: 1 },
  'world:lever': { id: 'works_3', k: 1, set: 2, total: 3 },
  'world:plate': { k: 0, set: 1, total: 4, ok: true },
  'world:worksOpened': { id: 'works_3' },
  // FP (round 2): the feel events (src/game/fp/events.ts augments GameEvents).
  'block:tunk': { x: 1, y: 2, z: 3, block: B.SLATE, px: 1.5, py: 2.5, pz: 3 },
  'weapon:swing': { weapon: 'machete', ranged: false },
  'weapon:hit': { weapon: 'machete', mob: 1, kind: 'crawler', killed: false, x: 0, y: 0, z: 0 },
  'weapon:flash': { x: 0, y: 0, z: 0, radius: 6, count: 2 },
  // MOBS (round 2): the creatures (src/game/mobs/MobDirector.ts augments GameEvents).
  'mob:spawned': { id: 1, kind: 'crawler' },
  'mob:telegraph': { id: 1, kind: 'crawler', pan: 0.2, gain: 0.8 },
  'mob:attack': { id: 1, kind: 'crawler', damage: 9, landed: true },
  'mob:hit': { id: 1, kind: 'crawler', damage: 2, killed: false, armoured: false, pan: 0, gain: 1 },
  'mob:died': { id: 1, kind: 'crawler', pan: 0, gain: 1 },
  'mob:interact': { id: 2, kind: 'glimmerkin', action: 'caught' },
  'mob:cue': { kind: 'gnasher', cue: 'breath', pan: -0.3, gain: 0.6 },
  'mob:shot': { phase: 'hit', pan: 0, gain: 1 },
  'mob:met': { kind: 'stalker' },
  // Round 3 (MOBS): guardians, the bestiary, the creatures' sounds by name.
  'mob:sfx': { name: 'mob.chitter', pan: 0, gain: 0.8 },
  'mob:guardianAwake': { id: 9, kind: 'amberMatriarch', biome: 'amberHollows' },
  'mob:guardianPhase': { id: 9, kind: 'amberMatriarch', biome: 'amberHollows', phase: 2 },
  'mob:guardianReset': { id: 9, kind: 'amberMatriarch', biome: 'amberHollows' },
  'mob:guardianOpen': { id: 9, kind: 'amberMatriarch', biome: 'amberHollows', seconds: 1.6 },
  'mob:guardianDefeated': { id: 9, kind: 'amberMatriarch', biome: 'amberHollows', shard: 'amberHollows', x: 0, y: 0, z: 0 },
  'mob:scanned': { id: 3, kind: 'capSpitter', first: true },
  'mob:bestiary': { kind: 'capSpitter', page: 'new', found: 1, total: 61 },
  'mob:elite': { id: 4, kind: 'gritBoar', affixes: ['swift'], name: 'Swift Grit Boar' },
  'companion:trust': { kind: 'lampling', trust: 1, need: 3 },
  'companion:tamed': { kind: 'lampling', name: 'Lampling' },
  'companion:fed': { kind: 'lampling', xp: 3, total: 3, next: 5 },
  'companion:level': { kind: 'lampling', level: 2 },
  'companion:ore': { x: 1, y: 2, z: 3, block: B.COPPER_ORE, rarity: 'rare' },
  'companion:zap': { target: 4, kind: 'amberTick', damage: 2, killed: true },
  // UI (round 3): the action layout's events (game/fp/events).
  'ui:used': { control: 'sonar' },
  'ui:opened': { screen: 'map' },
  'player:dash': { x: 0, y: 0, z: 0, iframes: 0.25 },
  'player:sonar': { x: 0, y: 0, z: 0, radius: 24, seconds: 2 },
  'player:placed': { item: 'torch', block: 0, x: 1, y: 2, z: 3 },
  'hotbar:selected': { slot: 3, item: 'torch' },
  'mine:combo': { count: 2, x: 0, y: 0, z: 0 },
  'player:travelled': { to: 'camp', stratum: 1 },
  // LOOP (round 3): crafting, gear, stations, quests, guidance, hazards, rewards.
  'craft:made': { recipe: 'torch', item: 'torch', times: 1, count: 4 },
  'item:used': { item: 'bandage' },
  'gear:equipped': { item: 'copperPick', slot: 'pick' },
  'recipe:unlocked': { recipe: 'torch', item: 'torch' },
  'station:placed': { station: 'furnace', x: 1, y: 2, z: 3, stratum: 1 },
  'quest:step': { id: 'main:s1.lairs', kind: 'main', text: 'Find the lairs' },
  'quest:done': { id: 'task:amberHollows.mine', kind: 'biome', reward: '+2 Bandage' },
  'tutorial:step': { id: 'mine', highlight: 'action', line: 'Mine' },
  'quest:shard': { biome: 'amberHollows', count: 1 },
  'quest:page': { n: 1, first: true },
  'guide:hint': { id: 'flame', text: 'Low flame', target: 'flame' },
  'guide:arrival': { card: { biome: 'amberHollows', name: 'Amber Hollows', line: '', stratum: 1, hazard: null, counter: null, rumour: '', first: true } },
  'quest:heartLit': {},
  'quest:ending': {},
  'order:paid': { id: 'order:1', reward: '+4 Torch' },
  'bestiary:reward': { kind: 'crawler', text: '+2 Chitin' },
  'hazard:changed': { kind: 'cold', level: 0.5 },
  'reward:paid': { items: { glowcap: 3 }, reason: 'garden' },
  // LOOP (round 3 stretch, declared optional): the camp, the trader, sockets, the trip, the companion's treats, the daily.
  'camp:upgraded': { id: 'tents', level: 1 },
  'trade:done': { id: 'trade:1', times: 1, item: 'torch', recipe: null },
  'gem:socketed': { gem: 'gem', item: 'sword', socket: 0 },
  'trip:summary': {
    summary: {
      n: 1, outcome: 'returned', seconds: 600, deepest: 80, stratum: 1, biomes: ['amberHollows'], finds: { common: 9, uncommon: 2, rare: 1, epic: 0, legendary: 0 },
      rarest: 'amber', kills: 3, crafted: 2, torches: 4, shards: [], orders: 1, pages: 1, bestiary: 2, banked: 12, records: [], next: 'Find the lairs', lines: [], title: 'Trip 1',
    },
  },
  'companion:lure': { x: 1, y: 2, z: 3, radius: 6 },
  'companion:feed': { item: 'glowcap', xp: 2, heal: 10 },
  'daily:done': { day: 3, goal: 'depth', seconds: 900, best: true },
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
    for (const [name, steps] of Object.entries(MODES)) expect(steps.length, name).toBe(name === 'wholeTone' ? 6 : 7);
    expect(degreeToMidi(60, 'wholeTone', 6)).toBe(72);
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
function run(s: MusicScheduler, from: number, to: number, mix: (t: number) => LayerMix = () => CALM_MIX, lookahead = 0.35) {
  const out: MusicNote[] = [];
  const got: Array<{ note: MusicNote; at: number }> = [];
  for (let t = from; t < to; t += 1 / 60) {
    const n = s.advance(t, t + lookahead, mix(t), out);
    for (let i = 0; i < n; i++) got.push({ note: out[i], at: t });
  }
  return got;
}

const TENSE: LayerMix = { bed: 0.8, motif: 0.5, tension: 1, combat: 0 };
const FIGHT: LayerMix = { bed: 0.65, motif: 0.75, tension: 0.7, combat: 1 };
const pitched = (n: MusicNote) => TIMBRES[n.voice].family !== 'drum';

describe('MusicScheduler (the biome scores)', () => {
  it('hands out every note once, inside the lookahead window, in time order, for every score', () => {
    for (const id of SCORE_IDS) {
      const got = run(new MusicScheduler(id, 7), 0, 120, () => (id.startsWith('guardian') || id === 'heartBoss' ? FIGHT : CALM_MIX));
      expect(got.length, id).toBeGreaterThan(10);
      expect(new Set(got.map((g) => g.note)).size, id).toBe(got.length);
      for (const g of got) {
        expect(g.note.time, id).toBeGreaterThanOrEqual(g.at - 0.05);
        expect(g.note.time, id).toBeLessThan(g.at + 0.35 + 1e-9);
        expect(Number.isFinite(g.note.midi) && Number.isFinite(g.note.velocity) && g.note.velocity > 0 && g.note.velocity <= 1, id).toBe(true);
      }
      for (let i = 1; i < got.length; i++) expect(got[i].note.time, id).toBeGreaterThanOrEqual(got[i - 1].note.time);
    }
  });

  it('keeps each biome in its own mode (every pitched note while exploring)', () => {
    for (const id of BIOME_SCORES) {
      const { tonic, mode } = SCORES[id];
      const got = run(new MusicScheduler(id, 3), 0, 240);
      for (const g of got) if (pitched(g.note)) expect(inMode(g.note.midi, tonic, mode), `${id} ${g.note.midi}`).toBe(true);
    }
  });

  it('gives every biome its own identity (mode, tempo, metre, timbres and motif together)', () => {
    const keys = BIOME_SCORES.map((id) => {
      const s = SCORES[id];
      return `${s.mode}|${s.bpm}|${s.meter}x${s.sub}|${s.bed}|${s.lead}|${s.motif.map((m) => m.d).join(',')}`;
    });
    expect(new Set(keys).size).toBe(BIOME_SCORES.length);
    // No two biomes share the same lead and bed pair, nor the same motif contour.
    expect(new Set(BIOME_SCORES.map((id) => `${SCORES[id].lead}+${SCORES[id].bed}`)).size).toBe(BIOME_SCORES.length);
    expect(new Set(BIOME_SCORES.map((id) => SCORES[id].motif.map((m) => m.d).join(','))).size).toBeGreaterThanOrEqual(BIOME_SCORES.length - 1);
  });

  it('states the motif plainly first, on the lead, then varies it', () => {
    for (const id of BIOME_SCORES) {
      const s = SCORES[id];
      const got = run(new MusicScheduler(id, 5), 0, 200).filter((g) => g.note.layer === 'motif' && g.note.voice === s.lead);
      expect(got.length, id).toBeGreaterThanOrEqual(s.motif.length);
      const first = got.slice(0, s.motif.length).map((g) => g.note.midi);
      const base = s.tonic + 12 * (s.leadOctave ?? 0);
      const expected = s.motif.map((m) => {
        let midi = degreeToMidi(base, s.mode, m.d);
        while (midi > 88) midi -= 12;
        while (midi < 55) midi += 12;
        return midi;
      });
      expect(first, id).toEqual(expected);
    }
  });

  it('is deterministic per seed', () => {
    const a = run(new MusicScheduler('crystalGeode', 11), 0, 120).map((g) => [g.note.time, g.note.midi]);
    const b = run(new MusicScheduler('crystalGeode', 11), 0, 120).map((g) => [g.note.time, g.note.midi]);
    const c = run(new MusicScheduler('crystalGeode', 12), 0, 120).map((g) => [g.note.time, g.note.midi]);
    expect(a).toEqual(b);
    expect(a).not.toEqual(c);
  });

  it('follows the danger: tension within a beat of monsters coming near, drums within a beat of a fight', () => {
    for (const id of BIOME_SCORES) {
      const s = new MusicScheduler(id, 9);
      const beat = s.beatDur;
      const got = run(s, 0, 90, (t) => (t < 30 ? CALM_MIX : t < 60 ? TENSE : FIGHT));
      const calm = got.filter((g) => g.at < 30);
      expect(calm.some((g) => g.note.layer === 'tension' || g.note.layer === 'combat'), id).toBe(false);
      const firstTension = got.find((g) => g.note.layer === 'tension');
      expect(firstTension, id).toBeDefined();
      expect(firstTension!.note.time - 30, id).toBeLessThan(beat * 1.05 + 0.36);
      expect(got.some((g) => g.at >= 30 && g.at < 60 && g.note.layer === 'combat'), id).toBe(false);
      const firstDrum = got.find((g) => g.note.layer === 'combat');
      expect(firstDrum, id).toBeDefined();
      expect(firstDrum!.note.time - 60, id).toBeLessThan(beat * 1.05 + 0.36);
    }
  });

  it('breathes while exploring: rests between phrases and longer silences now and then', () => {
    const s = new MusicScheduler('amberHollows', 3);
    const got = run(s, 0, 900).filter((g) => g.note.layer === 'bed' || g.note.layer === 'motif');
    const onsets = got.map((g) => g.note.time);
    const gaps = onsets.slice(1).map((t, i) => t - onsets[i]);
    expect(Math.max(...gaps)).toBeGreaterThan(18);
    expect(s.phraseCount).toBeGreaterThan(20);
  });

  it('never plays a burst of stale notes after a stall', () => {
    const s = new MusicScheduler('mushroomForest', 9);
    run(s, 0, 30);
    const out: MusicNote[] = [];
    const n = s.advance(500, 500.35, CALM_MIX, out);
    for (let i = 0; i < n; i++) expect(out[i].time).toBeGreaterThanOrEqual(500 - 0.05);
    expect(s.nextBeatTime).toBeGreaterThan(499.9);
  });

  it('plays stingers in the score\'s key and holds the motif until they end', () => {
    const s = new MusicScheduler('frostCaverns', 4);
    run(s, 0, 10);
    const len = s.sting('arrival', 10.2);
    expect(len).toBeCloseTo(s.barDur * 2, 5);
    const got = run(s, 10, 30);
    const sting = got.filter((g) => g.note.layer === 'sting');
    expect(sting.filter((g) => g.note.voice === SCORES.frostCaverns.lead)).toHaveLength(SCORES.frostCaverns.motif.length);
    const motif = got.filter((g) => g.note.layer === 'motif' && g.note.voice === SCORES.frostCaverns.lead);
    if (motif.length) expect(motif[0].note.time).toBeGreaterThanOrEqual(10.2 + len - 1e-6);
    for (const kind of ['victory', 'heartLit', 'descent', 'phase'] as const) expect(new MusicScheduler('guardian3', 1).sting(kind, 0)).toBeGreaterThan(1);
  });

  it('names a guardian theme per stratum and the Heart\'s boss', () => {
    expect([1, 2, 3, 4, 5, 6].map((n) => guardianScoreFor(n))).toEqual(['guardian1', 'guardian2', 'guardian3', 'guardian4', 'guardian5', 'guardian6']);
    expect(guardianScoreFor(6, true)).toBe('heartBoss');
    const keys = [1, 2, 3, 4, 5, 6].map((n) => SCORES[guardianScoreFor(n)]).map((g) => `${g.tonic}|${g.mode}|${g.bpm}|${g.bed}|${g.lead}`);
    expect(new Set(keys).size).toBe(6);
    // The same motif in every lair: the guardians are related.
    for (let n = 2; n <= 6; n++) expect(SCORES[guardianScoreFor(n)].motif).toBe(SCORES.guardian1.motif);
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

describe('every event heard once, on purpose', () => {
  const name = <K extends keyof GameEvents>(type: K, p: GameEvents[K]) => sfxForEvent(type, p)?.name ?? null;

  it('classifies every bus event exactly once: its own sound, heard through another, or silent by design', () => {
    const all = Object.keys(SAMPLE_PAYLOADS) as Array<keyof GameEvents>;
    expect(all.length).toBeGreaterThan(115);
    for (const type of all) {
      const classes = [AUDIBLE_EVENTS.includes(type), type in VOICED_ELSEWHERE, type in SILENT_EVENTS].filter(Boolean).length;
      expect(classes, type).toBe(1);
    }
    // The lists name only real events, each with its reason.
    for (const [type, why] of [...Object.entries(VOICED_ELSEWHERE), ...Object.entries(SILENT_EVENTS)]) {
      expect(type in SAMPLE_PAYLOADS, type).toBe(true);
      expect((why ?? '').length, type).toBeGreaterThan(12);
    }
    // Every mapped event, on its realistic sample, makes a registered sound (or a deliberate nothing).
    for (const type of AUDIBLE_EVENTS) {
      const req = sfxForEvent(type, SAMPLE_PAYLOADS[type] as never);
      if (req) expect(isSfxName(req.name), `${type} -> ${req.name}`).toBe(true);
    }
  });

  it('hears the companion once: MOBS voices its moments in stereo, the map adds the treat and the zap', () => {
    for (const type of ['companion:trust', 'companion:tamed', 'companion:level', 'companion:ore', 'companion:lure', 'companion:feed'] as const) {
      expect(AUDIBLE_EVENTS.includes(type), type).toBe(false);
      expect(sfxForEvent(type, SAMPLE_PAYLOADS[type] as never), type).toBeNull();
    }
    expect(name('companion:fed', SAMPLE_PAYLOADS['companion:fed'])).toBe('companion.eat');
    expect(name('companion:zap', SAMPLE_PAYLOADS['companion:zap'])).toBe('companion.zap');
    for (const voice of ['companion.chirp', 'companion.happy', 'companion.alert', 'companion.levelup', 'companion.hurt']) {
      const req = sfxForEvent('mob:sfx', { name: voice, pan: -0.4, gain: 0.7 });
      expect(req?.name, voice).toBe(voice);
      expect(req?.params.pan).toBe(-0.4);
    }
    expect(name('item:used', { item: 'lamplingLure' })).toBe('use.lure');
    expect(name('item:used', { item: 'glowTreat' })).toBe('companion.eat');
  });

  it('hears a reward through its moment, never twice', () => {
    for (const reason of REWARD_MOMENTS) expect(name('reward:paid', { items: { torch: 2 }, reason }), reason).toBeNull();
    // The tutorial's pay comes with its own end chime ('quest:done' main:tutorial).
    expect(REWARD_MOMENTS.has('tutorial')).toBe(true);
    expect(name('reward:paid', { items: { glowcap: 3 }, reason: 'garden' })).toBe('reward.pouch');
    expect(name('order:paid', { id: 'order:3', reward: '+4 Torch' })).toBe('loop.order');
    expect(name('quest:done', { id: 'order:3', kind: 'order', reward: '+4 Torch' })).toBeNull();
    for (const id of ['main:guardian.frostCaverns', 'main:heart', 'main:s3.gate']) {
      expect(MOMENT_STEPS.test(id), id).toBe(true);
      expect(name('quest:done', { id, kind: 'main', reward: null }), id).toBeNull();
    }
    expect(MOMENT_STEPS.test('main:s3.lairs')).toBe(false);
    expect(name('quest:done', { id: 'task:frostCaverns.hunt', kind: 'biome', reward: '+1 Gem' })).toBe('quest.done');
    expect(name('quest:done', { id: 'main:tutorial', kind: 'tutorial', reward: null })).toBe('quest.done');
    expect(name('mob:bestiary', { kind: 'gritBoar', page: 'new', found: 2, total: 61 })).toBe('bestiary.page');
    expect(name('mob:bestiary', { kind: 'gritBoar', page: 'complete', found: 2, total: 61 })).toBe('bestiary.complete');
    expect(name('bestiary:reward', SAMPLE_PAYLOADS['bestiary:reward'])).toBeNull();
    // The Heart's two acts: the shards kindling, then the deep relit (the ending's theme follows).
    expect(name('quest:heartLit', {})).toBe('loop.heart');
    expect(name('quest:ending', {})).toBe('finale.relight');
  });

  it('plays a sound for every round-3 action', () => {
    // Sprint footsteps per floor: each biome's ground its own material, a sprint heavier and louder.
    const floors: Array<[number, StepKind]> = [
      [B.AMBER_FLOOR, 'sand'], [B.MYCEL_FLOOR, 'fungus'], [B.ROOT_FLOOR, 'root'], [B.FLOOD_FLOOR, 'water'], [B.GEODE_FLOOR, 'crystal'],
      [B.MINE_FLOOR, 'soil'], [B.FROST_SNOW, 'snow'], [B.FROST_ICE, 'ice'], [B.JUNGLE_MOSS, 'moss'], [B.BOG_CRUST, 'mud'], [B.CITY_TILE, 'ancient'],
      [B.ASH_FLOOR, 'ash'], [B.OBSIDIAN_FLOOR, 'glass'], [B.GATE_SEAL, 'metal'], [B.BUILT_PLANK, 'wood'], [B.LADDER, 'wood'],
    ];
    for (const [block, kind] of floors) {
      expect(stepKindOf(block), String(block)).toBe(kind);
      expect(isSfxName(`step.${kind}`)).toBe(true);
    }
    const walk = sfxForEvent('player:footstep', { block: B.FROST_SNOW, speed: 4.2 })!.params;
    const sprint = sfxForEvent('player:footstep', { block: B.FROST_SNOW, speed: 6.5 })!.params;
    expect(sprint.intensity!).toBeGreaterThan(walk.intensity! + 0.3);
    expect(sprint.gain!).toBeGreaterThan(walk.gain!);
    // Dash, jump, landing on the biome's floor.
    expect(name('player:dash', SAMPLE_PAYLOADS['player:dash'])).toBe('act.dash');
    expect(name('player:jump', {})).toBe('jump');
    expect(sfxForEvent('player:land', { fallSpeed: 12, block: B.FROST_ICE })!.params.material).toBe('ice');
    // The sonar's pulse (its echoes: AudioSystem, from what VIS revealed).
    expect(name('player:sonar', SAMPLE_PAYLOADS['player:sonar'])).toBe('sonar.pulse');
    // Placing each placeable.
    const placed = (item: string) => name('player:placed', { item, block: 0, x: 0, y: 0, z: 0 });
    expect([placed('torch'), placed('ladder'), placed('rope'), placed('door'), placed('brick'), placed('plank'), placed('outpostKit'), placed('furnace')])
      .toEqual(['place.torch', 'place.ladder', 'place.rope', 'place.door', 'place.block', 'place.plank', 'place.outpost', 'place.station']);
    // Crafting per station (a recipe of each), camp upgrades and the trader.
    for (const [station, sound] of [['workbench', 'craft.workbench'], ['furnace', 'craft.furnace'], ['forge', 'craft.forge'], ['alchemy', 'craft.alchemy'], ['hand', 'craft.hand']] as const) {
      const recipe = RECIPES.find((r) => r.station === station);
      expect(recipe, station).toBeDefined();
      expect(name('craft:made', { recipe: recipe!.id, item: recipe!.output.item as never, times: 1, count: 1 }), station).toBe(sound);
    }
    expect(name('craft:made', { recipe: 'camp:tents', item: 'plank', times: 1, count: 1 })).toBe('camp.upgrade');
    expect(name('camp:upgraded', { id: 'tents', level: 1 })).toBe('camp.upgrade');
    expect(name('trade:done', SAMPLE_PAYLOADS['trade:done'])).toBe('craft.trader');
    expect(name('gem:socketed', SAMPLE_PAYLOADS['gem:socketed'])).toBe('gem.socket');
    // Equip, consume and eat.
    expect(['head', 'chest', 'feet', 'weapon', 'lantern', 'pick'].map((slot) => name('gear:equipped', { item: 'copperPick', slot: slot as never })))
      .toEqual(['equip.armour', 'equip.armour', 'equip.armour', 'equip.weapon', 'equip.lantern', 'equip.tool']);
    expect(['bandage', 'roastCap', 'healingDraught', 'oilFlask', 'warmingTonic', 'flare'].map((item) => name('item:used', { item: item as never })))
      .toEqual(['use.bandage', 'use.eat', 'use.drink', 'use.oil', 'use.ward', 'use.flare']);
    // Bombs and flares thrown from the hotbar: a heavier whoosh, then a blast or the flare catching.
    expect(sfxForEvent('weapon:swing', { weapon: 'bomb', ranged: true })!.params.pitch).toBeLessThan(1);
    expect(name('weapon:flash', { x: 0, y: 0, z: 0, radius: 4, count: 2 })).toBe('act.bomb');
    expect(name('weapon:flash', { x: 0, y: 0, z: 0, radius: 6, count: 0 })).toBe('weapon.flash');
    // Quest beats, shards, the gate, descent and ascent, fast travel, the tutorial.
    expect(name('quest:step', SAMPLE_PAYLOADS['quest:step'])).toBe('quest.step');
    expect(name('quest:shard', SAMPLE_PAYLOADS['quest:shard'])).toBe('loop.shard');
    expect(name('world:gateOpened', SAMPLE_PAYLOADS['world:gateOpened'])).toBe('loop.gate');
    expect(name('world:stratum', { stratum: 3, from: 2, biomes: ['crystalGeode', 'haldenMines'] })).toBe('world.descent');
    expect(name('world:stratum', { stratum: 2, from: 3, biomes: ['rootGalleries', 'floodedGrottoes'] })).toBe('world.ascent');
    expect(name('world:stratum', { stratum: 1, from: null, biomes: ['amberHollows', 'mushroomForest'] })).toBeNull();
    expect(name('player:travelled', SAMPLE_PAYLOADS['player:travelled'])).toBe('travel.whoosh');
    expect(name('tutorial:step', SAMPLE_PAYLOADS['tutorial:step'])).toBe('tutorial.step');
    expect(name('tutorial:step', { id: null, highlight: null, line: null })).toBeNull();
    // Hazard onsets (and the AudioSystem's warnings from the meter).
    for (const kind of ['cold', 'gas', 'heat', 'dark'] as const) expect(name('hazard:changed', { kind, level: 0.6 })).toBe(`loop.hazard.${kind}`);
    // LOOP's hazard warnings speak in the hazard's own voice; other hints with the hint's.
    expect(['cold', 'chill', 'gas', 'lava', 'dark', 'void'].map((k) => name('guide:hint', { id: `hazard:${k}`, text: '', target: null })))
      .toEqual(['hazard.cold', 'hazard.cold', 'hazard.gas', 'hazard.heat', 'hazard.dark', 'hazard.dark']);
    expect(name('guide:hint', { id: 'flame', text: '', target: 'flame' })).toBe('ui.hint');
    // A hazard zone walked into: a low cue (lower for the heavier dangers); an elemental blow: its hit says it; the rumour's arrow: "this way".
    const zones = ['falls', 'rockfall', 'chill', 'gas', 'lava'].map((k) => sfxForEvent('guide:hint', { id: `zone:${k}`, text: '', target: null })!);
    for (const z of zones) expect(z.name).toBe('zone.enter');
    expect(zones[4].params.pitch!).toBeLessThan(zones[0].params.pitch!);
    expect(name('guide:hint', { id: 'element:frost', text: '', target: null })).toBeNull();
    expect(name('guide:hint', { id: 'stuck:lairs', text: '', target: 'tracker' })).toBe('guide.way');
    // UI's thrown things say what they are.
    expect(name('weapon:flash', { x: 0, y: 0, z: 0, radius: 6, count: 0, kind: 'flare' })).toBe('use.flare');
    expect(name('weapon:flash', { x: 0, y: 0, z: 0, radius: 6, count: 2, kind: 'bomb' })).toBe('act.bomb');
    expect(name('weapon:flash', { x: 0, y: 0, z: 0, radius: 4, count: 2, kind: 'flash' })).toBe('weapon.flash');
    expect(name('hazard:changed', { kind: null, level: 0 })).toBeNull();
    // The Halden works: levers, plates in order (a rising tone), a wrong plate (they all spring back), the vault.
    expect(name('world:lever', SAMPLE_PAYLOADS['world:lever'])).toBe('world.lever');
    const plates = [1, 2, 3].map((set) => sfxForEvent('world:plate', { k: set - 1, set, total: 3, ok: true })!.params.pitch!);
    expect(plates[1]).toBeGreaterThan(plates[0]);
    expect(plates[2]).toBeGreaterThan(plates[1]);
    expect(name('world:plate', { k: 1, set: 0, total: 3, ok: false })).toBe('world.plateReset');
    expect(name('world:worksOpened', SAMPLE_PAYLOADS['world:worksOpened'])).toBe('world.worksOpened');
    // Menus, page turns and the hotbar (its tick climbs with the slot), feats.
    expect(['map', 'quests', 'bestiary', 'crafting', 'inventory', 'settings'].map((screen) => name('ui:opened', { screen })))
      .toEqual(['ui.page', 'ui.page', 'ui.page', 'ui.page', 'ui.bag', 'ui.open']);
    const ticks = [0, 1, 2, 3, 4, 5].map((slot) => sfxForEvent('hotbar:selected', { slot, item: null })!.params.pitch!);
    for (let i = 1; i < ticks.length; i++) expect(ticks[i]).toBeGreaterThan(ticks[i - 1]);
    expect(name('feat:earned', { id: 'deep3' })).toBe('feat.fanfare');
    expect(name('daily:done', SAMPLE_PAYLOADS['daily:done'])).toBe('feat.fanfare');
    // The world: sites, lairs marked (not by the sonar: its echo says it), elites, moths.
    expect(name('world:site', { id: 'river_1', kind: 'river', name: 'x', biome: 'amberHollows', stratum: 1 })).toBe('site.found');
    expect(name('world:site', { id: 'vista_1', kind: 'vista', name: 'x', biome: 'amberHollows', stratum: 1 })).toBe('discovery');
    expect(name('world:lairRevealed', { id: 'l', biome: 'amberHollows', how: 'page' })).toBe('lair.revealed');
    expect(name('world:lairRevealed', { id: 'l', biome: 'amberHollows', how: 'sonar' })).toBeNull();
    expect(name('mob:elite', SAMPLE_PAYLOADS['mob:elite'])).toBe('elite.alert');
    expect(name('moths:startled', SAMPLE_PAYLOADS['moths:startled'])).toBe('amb.moth');
  });
});

describe('the cues follow the music\'s key', () => {
  const D_MAJOR = MODES.ionian;

  it('finds the major key that holds each score\'s mode, and every scale note lands in it', () => {
    for (const id of SCORE_IDS) {
      const s = SCORES[id];
      const key = majorKeyOf(s);
      if (s.mode === 'wholeTone' || s.mode === 'phrygianDominant' || s.mode === 'harmonicMinor') continue;
      for (const step of MODES[s.mode]) expect(inMode(s.tonic + step, key, 'ionian'), `${id} ${s.tonic + step}`).toBe(true);
    }
    expect(majorKeyOf({ tonic: 67, mode: 'mixolydian' }) % 12).toBe(0); // G mixolydian: C major
    expect(majorKeyOf({ tonic: 61, mode: 'aeolian' }) % 12).toBe(4); // C# minor: E major
    expect(majorKeyOf({ tonic: 64, mode: 'lydian' }) % 12).toBe(11); // E lydian: B major
  });

  it('moves a D-major cue by the smallest interval, and its notes stay in the target key', () => {
    for (let key = 50; key < 80; key++) {
      const shift = shiftTo(key);
      expect(shift).toBeGreaterThanOrEqual(-6);
      expect(shift).toBeLessThanOrEqual(5);
      for (const step of D_MAJOR) expect(inMode(62 + step + shift, key, 'ionian')).toBe(true);
    }
    expect(shiftTo(62)).toBe(0);
    expect(shiftTo(74)).toBe(0);
    expect(shiftTo(Number.NaN)).toBe(0);
  });

  it('keys only registered, tonal cues (no footsteps, clicks, creatures or warnings)', () => {
    for (const n of KEYED) expect(isSfxName(n), n).toBe(true);
    for (const n of ['ui.click', 'ui.error', 'hazard.cold', 'step.stone', 'mob.chitter', 'act.dash', 'damaged', 'reward.pouch']) expect(KEYED.has(n), n).toBe(false);
    for (const n of ['quest.done', 'feat.fanfare', 'discovery', 'pickup.rare', 'sonar.ping', 'craft.forge', 'loop.shard', 'guardian.fall']) expect(KEYED.has(n), n).toBe(true);
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
    expect(bus.subscribed).toBe(LISTENED_EVENTS.length);
    expect(LISTENED_EVENTS.length).toBeGreaterThanOrEqual(AUDIBLE_EVENTS.length);
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
