import type { BiomeId } from '../../config/biomes';
import { B } from '../../config/blocks';
import { EventBus, type GameEvents } from '../../core/events';
import { Rng } from '../../core/rng';
import { mixStats, type MixStats } from '../analysis';
import { AudioSystem } from '../AudioSystem';
import { gameAudioProbe, type HazardName, type SoundingLayout } from '../probe';
import type { AudioVolumes, AudioWorldState } from '../types';
import { DEFAULT_VOLUMES } from './scenes';
import { installSimAudio, type SimAudioContext } from './webAudioSim';

/**
 * The real AudioSystem on the Web Audio emulator, attached through the real probe to a scripted
 * stand-in for the Game (round 3, AUDIO): what the tests and tools/audio-scenes.ts measure is what
 * the game plays for the same events and the same scene. Never imported by the game.
 */

/** A creature as the probe reads it (game.mobs.list()). */
export interface SceneMob {
  hostile: boolean;
  state: string;
  rank?: string;
  position: { x: number; y: number; z: number };
}

/** The Game's shape the probe reads (gameAudioProbe), with everything a script moves. */
export class SceneGame {
  mode = 'playing';
  readonly ui = { screen: 'none' };
  readonly strata: { current: number; biomeHere: BiomeId | null; busy: boolean; layout: SoundingLayout | null } = {
    current: 1, biomeHere: 'amberHollows', busy: false, layout: { props: [], hazards: [], falls: [], rivers: [] },
  };
  creatures: SceneMob[] = [];
  guardian: { kind: string; phase: number; phases: number; hp: number; max: number } | null = null;
  readonly mobs = { list: () => this.creatures, activeGuardian: () => this.guardian };
  readonly hazards: { active: HazardName | null; meter: number } = { active: null, meter: 0 };
  readonly loop = { hazards: this.hazards };
  readonly sonar: { pings: number; last: Array<{ x: number; y: number; z: number; kind: string; rarity: string | null; delay: number }> } = { pings: 0, last: [] };
  readonly vis = { sonarState: this.sonar };
  readonly camera = { position: { x: 128, y: 41.6, z: 128 }, matrixWorld: { elements: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1] } };
  /** The explorer's feet (the probe reads its climbing state; the ear is the camera). */
  readonly player = { x: 128, y: 40, z: 128, climbing: false, vy: 0 };
  readonly health = { fraction: 1 };
  readonly cameraRig = { camera: this.camera };
  /** The voxels round the listener (air everywhere unless a script says otherwise). */
  voxel: (x: number, y: number, z: number) => number = () => B.AIR;
  readonly session = { world: { get: (x: number, y: number, z: number) => this.voxel(x, y, z) } };

  /** Face along +x (yaw 0 looks down -z in three.js; the probe only needs the right vector). */
  face(rx: number, rz: number): void {
    const l = Math.hypot(rx, rz) || 1;
    this.camera.matrixWorld.elements[0] = rx / l;
    this.camera.matrixWorld.elements[2] = rz / l;
  }
}

export interface RigPeaks {
  sfx: number;
  music: number;
  decks: number;
  categories: Record<string, number>;
  /** The emulator's sources alive at once (every oscillator and buffer of every voice and loop). */
  sources: number;
}

export interface SystemRig {
  readonly ctx: SimAudioContext;
  readonly audio: AudioSystem;
  readonly bus: EventBus<GameEvents>;
  readonly game: SceneGame;
  /** The per-frame world state Game.audioState() would give. */
  readonly state: AudioWorldState;
  readonly sampleRate: number;
  readonly peaks: RigPeaks;
  /** Called after every frame's update (tests keep a timeline of the AudioSystem's stats here). */
  onFrame: ((time: number) => void) | null;
  /** Advance `seconds` in frames, calling `each(time, dt)` first in every frame (the script). */
  run(seconds: number, each?: (time: number, dt: number) => void): void;
  /** What was rendered since the last take, both channels. */
  take(): [Float32Array, Float32Array];
  /** Measure what was rendered since the last take. */
  measure(): MixStats & { channels: [Float32Array, Float32Array] };
  emit<K extends keyof GameEvents>(type: K, payload: GameEvents[K]): void;
  close(): void;
}

/** Build the rig: the emulator installed as AudioContext, the AudioSystem unlocked on it, the limiter settled. */
export function systemRig(opts: { sampleRate?: number; volumes?: AudioVolumes; fps?: number } = {}): SystemRig {
  const sampleRate = opts.sampleRate ?? 16000;
  const sim = installSimAudio(sampleRate);
  const bus = new EventBus<GameEvents>();
  const audio = new AudioSystem(bus);
  const game = new SceneGame();
  audio.attach(gameAudioProbe(game));
  audio.setVolumes(opts.volumes ?? DEFAULT_VOLUMES);
  void audio.unlock();
  const ctx = sim.contexts[0];
  if (!ctx) {
    sim.restore();
    throw new Error('the emulator did not start');
  }
  // Frames of whole render quanta, near the game's 30 fps.
  const quanta = Math.max(1, Math.round(sampleRate / ((opts.fps ?? 30) * 128)));
  const dt = (quanta * 128) / sampleRate;
  const state: AudioWorldState = { depth: 40, atCamp: false, openness: 0.4, lanternFuel: 0.9, lanternLit: true, nearCrystal: 0, nearFire: 0, playerSpeed: 0, inMenu: false };
  const peaks: RigPeaks = { sfx: 0, music: 0, decks: 0, categories: {}, sources: 0 };
  let frame = 0;
  const rig: SystemRig = {
    ctx, audio, bus, game, state, sampleRate, peaks, onFrame: null,
    run(seconds, each) {
      const frames = Math.round(seconds / dt);
      for (let f = 0; f < frames; f++) {
        each?.(ctx.currentTime, dt);
        audio.update(dt, state);
        ctx.render(dt);
        rig.onFrame?.(ctx.currentTime);
        if (++frame % 3 === 0) {
          const s = audio.stats();
          peaks.sfx = Math.max(peaks.sfx, s.sfxVoices);
          peaks.music = Math.max(peaks.music, s.musicVoices);
          peaks.decks = Math.max(peaks.decks, s.decks);
          for (const [k, n] of Object.entries(s.categories)) peaks.categories[k] = Math.max(peaks.categories[k] ?? 0, n);
        }
        peaks.sources = Math.max(peaks.sources, ctx.activeSources);
      }
    },
    take: () => ctx.take(),
    measure() {
      const channels = ctx.take();
      return { ...mixStats(channels, sampleRate), channels };
    },
    emit: (type, payload) => bus.emit(type, payload),
    close() {
      audio.dispose();
      sim.restore();
    },
  };
  // The master limiter starts cold (as in a browser); a moment of silence settles it.
  rig.run(0.4);
  rig.take();
  return rig;
}

// ---------------------------------------------------------------------------------------
// Scripted scenes

/** The round-3 creatures' voices a fight is made of (MOBS' registry). */
const FIGHT_VOICES = ['mob.chitter', 'mob.snarl', 'mob.screech', 'mob.hiss', 'mob.spit', 'mob.stomp', 'mob.rush', 'mob.buzz', 'mob.thud', 'mob.croak'];
const TELEGRAPH_KINDS = ['crawler', 'gnasher', 'amberTick', 'gritBoar', 'rimeHulk', 'glowAnt', 'fumeWasp', 'lavaToad'] as const;

/** A scene's timeline marks (the tests snapshot the AudioSystem there; the tool prints them). */
export type Mark = (label: string) => void;

export interface SystemScene {
  title: string;
  run(rig: SystemRig, mark?: Mark): void;
}

/**
 * The densest fight the game makes, on purpose: eight monsters closing in, wind-ups, voices and blows
 * every few tenths of a second, the explorer sprinting, dashing, striking, hurt, a sonar pulse, a blast
 * bomb, pickups, the companion zapping; then a guardian wakes, turns its second phase, and falls.
 * `seconds` total (at least 20); the guardian wakes at 40 % and falls at 85 %.
 */
export function denseCombat(rig: SystemRig, seconds = 24, seed = 11, mark: Mark = () => {}): void {
  const rng = new Rng(seed);
  const g = rig.game;
  g.strata.current = 4;
  g.strata.biomeHere = 'frostCaverns';
  rig.state.depth = 300;
  const p = g.camera.position;
  const wake = seconds * 0.4;
  const phase2 = seconds * 0.6;
  const fall = seconds * 0.85;
  let t = 0;
  let next = 1.5;
  let step = 0;
  let awake = false;
  let turned = false;
  let fallen = false;
  rig.run(seconds, (_time, dt) => {
    t += dt;
    // The pack closes in from 2 s.
    if (t > 2 && g.creatures.length === 0 && !fallen) {
      mark('pack');
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        const r = 4 + (i % 3) * 3;
        g.creatures.push({ hostile: true, state: i % 2 ? 'stalk' : 'windup', position: { x: p.x + Math.cos(a) * r, y: p.y - 1.2, z: p.z + Math.sin(a) * r } });
      }
    }
    // Sprinting footsteps on ice.
    step -= dt;
    if (t > 1 && step <= 0) {
      step = 0.31;
      rig.emit('player:footstep', { block: B.FROST_ICE, speed: 6.5 });
    }
    if (t >= next && t > 2 && !fallen) {
      next = t + rng.range(0.12, 0.3);
      const pan = rng.range(-1, 1);
      const gain = rng.range(0.5, 1);
      const roll = rng.next();
      if (roll < 0.22) rig.emit('mob:telegraph', { id: rng.int(1, 8), kind: rng.pick(TELEGRAPH_KINDS), pan, gain });
      else if (roll < 0.47) rig.emit('mob:sfx', { name: rng.pick(FIGHT_VOICES), pan, gain });
      else if (roll < 0.57) rig.emit('mob:attack', { id: rng.int(1, 8), kind: 'crawler', damage: 6, landed: rng.chance(0.4) });
      else if (roll < 0.74) {
        rig.emit('weapon:swing', { weapon: 'sword', ranged: false });
        rig.emit('weapon:hit', { weapon: 'sword', mob: rng.int(1, 8), kind: 'rimeHulk', killed: false, x: p.x + 2, y: p.y, z: p.z });
        rig.emit('mob:hit', { id: rng.int(1, 8), kind: 'rimeHulk', damage: 12, killed: false, armoured: rng.chance(0.3), pan, gain, weak: rng.chance(0.15) });
      } else if (roll < 0.8) rig.emit('player:damaged', { amount: rng.range(5, 18), cause: 'hazard' });
      else if (roll < 0.86) rig.emit('mob:died', { id: rng.int(1, 8), kind: 'crawler', pan, gain });
      else if (roll < 0.9) rig.emit('player:dash', { x: p.x, y: p.y, z: p.z, iframes: 0.25 });
      else if (roll < 0.94) rig.emit('item:picked', { item: rng.pick(['frostCrystal', 'rimeIron', 'frostFur'] as const), count: 1 });
      else if (roll < 0.97) rig.emit('companion:zap', { target: 3, kind: 'crawler', damage: 2, killed: false });
      else rig.emit('mob:shot', { phase: rng.pick(['fly', 'hit'] as const), pan, gain });
    }
    // A sonar pulse with what it found, and a blast bomb landing.
    if (t > seconds * 0.3 && g.sonar.pings === 0) {
      rig.emit('player:sonar', { x: p.x, y: p.y, z: p.z, radius: 24, seconds: 2 });
      g.sonar.last = [0, 1, 2, 3, 4, 5, 6, 7, 8].map((i) => ({ x: p.x + Math.cos(i) * 12, y: p.y - 2, z: p.z + Math.sin(i) * 12, kind: i === 0 ? 'lair' : i === 1 ? 'chest' : 'ore', rarity: ['common', 'rare', 'epic', 'legendary'][i % 4], delay: 0.1 + i * 0.12 }));
      g.sonar.pings = 1;
    }
    if (t > seconds * 0.5 && t - dt <= seconds * 0.5) rig.emit('weapon:flash', { x: p.x + 7, y: p.y - 1, z: p.z + 2, radius: 4, count: 3 });
    // The guardian.
    if (!awake && t >= wake) {
      awake = true;
      mark('guardian awake');
      g.guardian = { kind: 'rimeWyrm', phase: 1, phases: 2, hp: 900, max: 900 };
      rig.emit('mob:guardianAwake', { id: 90, kind: 'rimeWyrm', biome: 'frostCaverns' });
      rig.emit('mob:sfx', { name: 'guardian.roar', pan: 0, gain: 1 });
    }
    if (awake && !turned && t >= phase2) {
      turned = true;
      mark('phase 2');
      g.guardian = { kind: 'rimeWyrm', phase: 2, phases: 2, hp: 400, max: 900 };
      rig.emit('mob:guardianPhase', { id: 90, kind: 'rimeWyrm', biome: 'frostCaverns', phase: 2 });
      rig.emit('mob:sfx', { name: 'guardian.phase', pan: 0, gain: 1 });
    }
    if (awake && !fallen && t >= fall) {
      fallen = true;
      mark('guardian falls');
      g.guardian = null;
      g.creatures = [];
      rig.emit('mob:sfx', { name: 'guardian.fall', pan: 0, gain: 1 });
      rig.emit('mob:guardianDefeated', { id: 90, kind: 'rimeWyrm', biome: 'frostCaverns', shard: 'frostCaverns', x: p.x, y: p.y, z: p.z });
      rig.emit('quest:shard', { biome: 'frostCaverns', count: 7 });
      rig.emit('quest:done', { id: 'main:guardian.frostCaverns', kind: 'main', reward: '+1 Gem' });
      rig.emit('reward:paid', { items: { gem: 1 }, reason: 'guardian' });
    }
  });
}

/** The camera moves to (x, z) facing along (rx, rz)'s left-hand forward (the probe pans by the right vector). */
function place(g: SceneGame, x: number, z: number, y = 41.6): void {
  g.camera.position.x = x;
  g.camera.position.y = y;
  g.camera.position.z = z;
}

/** A small stratum layout with what sounds: a river, the vista's fall, cascades, drips, spore puffs, a campfire. */
function walkLayout(): SoundingLayout {
  const river: number[][] = [];
  for (let x = 60; x <= 200; x += 1.2) river.push([x, 40, 120 + Math.sin(x / 15) * 3]);
  const props = [
    ...[0, 1, 2, 3, 4, 5].map((i) => ({ kind: 'amberDrip', x: 70 + i * 6, y: 44, z: 117 })),
    ...[0, 1, 2, 3].map((i) => ({ kind: 'sporePuff', x: 150 + i * 5, y: 40, z: 126 })),
    { kind: 'waterfall', x: 120, y: 44, z: 128 },
    { kind: 'crystalCluster', x: 96, y: 41, z: 118 },
  ];
  return { props, hazards: [], falls: [{ kind: 'water', top: [190, 58, 132], bottom: [190, 42, 132], width: 2.4 }], rivers: [{ kind: 'water', points: river }] };
}

/**
 * A walk through stratum I: along the river among amber drips, over the border into the Mushroom
 * Forest (the biome flickers at the border, then holds), past spore puffs to the vista's fall, a short
 * excursion back over the border (the score does not ping-pong), monsters drawing near, then calm.
 */
export function biomeWalk(rig: SystemRig, mark: Mark = () => {}): void {
  const g = rig.game;
  g.strata.current = 1;
  g.strata.biomeHere = 'amberHollows';
  g.strata.layout = walkLayout();
  rig.state.depth = 40;
  rig.state.playerSpeed = 4.2;
  let t = 0;
  let step = 0;
  const marks = new Set<string>();
  const once = (label: string) => {
    if (!marks.has(label)) {
      marks.add(label);
      mark(label);
    }
  };
  rig.run(50, (_time, dt) => {
    t += dt;
    // Walking east along the river at 4.2 m/s, on toward the fall (it stands at x = 190).
    const x = 64 + Math.min(t, 30) * 4.2;
    place(g, Math.min(x, 186), 121);
    g.face(0, 1);
    step -= dt;
    if (step <= 0) {
      step = 0.42;
      rig.emit('player:footstep', { block: g.strata.biomeHere === 'mushroomForest' ? B.MYCEL_FLOOR : B.AMBER_FLOOR, speed: 4.2 });
    }
    if (t < 1) once('river');
    let here: BiomeId = 'amberHollows';
    if (t >= 12 && t < 13.5) {
      // The border: the biome under the feet flickers for 1.5 s.
      once('border flicker');
      here = Math.floor(t * 4) % 2 ? 'mushroomForest' : 'amberHollows';
    } else if (t >= 13.5 && t < 22) here = 'mushroomForest';
    else if (t >= 22 && t < 25) {
      // A short excursion back, a few seconds after the score changed: it does not turn back.
      once('excursion back');
      here = 'amberHollows';
    } else if (t >= 25 && t < 41.5) here = 'mushroomForest';
    else if (t >= 41.5) {
      // A real return, long after the last change: the score follows after the usual settle.
      once('return');
      here = 'amberHollows';
    }
    if (here !== g.strata.biomeHere) rig.emit('world:biome', { biome: here, from: g.strata.biomeHere, stratum: 1, first: here === 'mushroomForest' && !marks.has('mushroomForest held') });
    g.strata.biomeHere = here;
    if (t >= 16.5) once('mushroomForest held');
    if (t >= 28) once('near the fall');
    // Monsters stalk closer, then go.
    if (t >= 34 && t < 38) {
      once('monsters near');
      const p = g.camera.position;
      g.creatures = [0, 1, 2].map((i) => ({ hostile: true, state: 'stalk', position: { x: p.x + 5 + i * 2, y: p.y - 1.4, z: p.z + 3 } }));
    } else if (t >= 38) {
      g.creatures = [];
      once('calm');
    }
  });
}

/**
 * A descent: the gate of stratum II opens, the explorer steps in, the stratum loads (the score falls
 * silent under the loading screen), stratum III swaps in (a frame with no biome under the feet), and
 * the Crystal Geode's score comes in with its motif on the first visit.
 */
export function descent(rig: SystemRig, mark: Mark = () => {}): void {
  const g = rig.game;
  g.strata.current = 2;
  g.strata.biomeHere = 'rootGalleries';
  rig.state.depth = 150;
  rig.run(10);
  mark('gate opens');
  rig.emit('world:gateOpened', { stratum: 2 });
  rig.run(5);
  mark('loading');
  g.strata.busy = true;
  rig.run(3);
  // The swap: the new stratum, its biome unknown for a frame, then under the feet.
  g.strata.busy = false;
  g.strata.current = 3;
  g.strata.biomeHere = null;
  g.strata.layout = { props: [], hazards: [], falls: [], rivers: [] };
  rig.emit('world:stratum', { stratum: 3, from: 2, biomes: ['crystalGeode', 'haldenMines'] });
  mark('arrival');
  rig.run(0.07);
  g.strata.biomeHere = 'crystalGeode';
  rig.emit('world:biome', { biome: 'crystalGeode', from: null, stratum: 3, first: true });
  rig.state.depth = 200;
  rig.run(14);
  mark('settled');
  rig.run(1);
}

/**
 * The finale: the Heart's chamber with the twelve shards; the Heart relit (its major chord before the
 * Dark Heart answers); the Dark Heart's three phases (the last sings the game's theme above the
 * guardian motif); its fall; the ending's theme after the victory's chord has spoken.
 */
export function finale(rig: SystemRig, mark: Mark = () => {}): void {
  const g = rig.game;
  g.strata.current = 6;
  g.strata.biomeHere = 'heart';
  rig.state.depth = 535;
  rig.run(9);
  mark('heart lit');
  rig.emit('quest:heartLit', {});
  rig.run(0.5);
  g.guardian = { kind: 'heartOfDark', phase: 1, phases: 3, hp: 3000, max: 3000 };
  rig.emit('mob:guardianAwake', { id: 99, kind: 'heartOfDark', biome: 'heart' });
  mark('the Dark Heart wakes');
  rig.run(12);
  g.guardian = { kind: 'heartOfDark', phase: 2, phases: 3, hp: 2000, max: 3000 };
  rig.emit('mob:guardianPhase', { id: 99, kind: 'heartOfDark', biome: 'heart', phase: 2 });
  mark('phase 2');
  rig.run(10);
  g.guardian = { kind: 'heartOfDark', phase: 3, phases: 3, hp: 1000, max: 3000 };
  rig.emit('mob:guardianPhase', { id: 99, kind: 'heartOfDark', biome: 'heart', phase: 3 });
  mark('phase 3');
  rig.run(12);
  g.guardian = null;
  rig.emit('mob:sfx', { name: 'guardian.fall', pan: 0, gain: 1 });
  rig.emit('mob:guardianDefeated', { id: 99, kind: 'heartOfDark', biome: 'heart', shard: 'heart', x: 0, y: 0, z: 0 });
  rig.emit('quest:done', { id: 'main:heart', kind: 'main', reward: '+1 Heartstone' });
  rig.emit('quest:ending', {});
  mark('the Dark Heart falls');
  rig.run(3);
  mark('victory');
  rig.run(9);
  mark('ending');
  rig.run(6);
}

export const SYSTEM_SCENES: Record<string, SystemScene> = {
  dense: { title: 'the densest fight: eight monsters, the explorer, a guardian waking, its second phase and its fall (Frost Caverns)', run: (rig, mark) => denseCombat(rig, 24, 11, mark) },
  walk: { title: 'a walk in stratum I: the river, a border, the vista\'s fall, an excursion back, monsters near', run: (rig, mark) => biomeWalk(rig, mark) },
  descent: { title: 'a descent: the gate, the loading screen, stratum III\'s arrival', run: (rig, mark) => descent(rig, mark) },
  finale: { title: 'the finale: the Heart relit, the Dark Heart\'s three phases, its fall, the ending', run: (rig, mark) => finale(rig, mark) },
};
