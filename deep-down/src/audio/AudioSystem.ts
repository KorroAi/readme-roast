import { PLAYER } from '../config/balance';
import type { BiomeId } from '../config/biomes';
import type { EventBus, GameEvents } from '../core/events';
import { lerp, saturate, smoothstep } from '../core/math';
import { Rng } from '../core/rng';
import { DEFAULT_SETTINGS } from '../save/types';
import { BEDS, BiomeBed, CAMP_BED, EMITTER_LEVEL, HazardLayer, emitterLayer, type BedRecipe } from './ambience';
import { AUDIBLE_EVENTS, sfxForEvent } from './eventMap';
import { busTarget, createMixGraph, type MixGraph } from './graph';
import { IntensityTracker, type CombatImpulse, type IntensityState } from './intensity';
import { LanternLoop, ParamTarget, type LazyLayer } from './layers';
import { CATEGORY_CAP, DUCKS, Ducker, categoryOf, type VoiceCategory } from './mixer';
import { MusicPlayer } from './MusicPlayer';
import type { AudioProbe, AudioScene, EmitterKind, HazardName, SonarReveal } from './probe';
import { guardianScoreFor, type ScoreId } from './scores';
import { SFX, playSfx, type BusName, type SfxName, type SfxParams } from './sfx';
import type { SynthTarget, Voice } from './synth';
import { moodFor, volumeToGain, type MoodName } from './theory';
import type { AudioVolumes, AudioWorldState, UiSound } from './types';
import { RateGate, VoiceLimiter } from './voices';

export type { AudioVolumes, AudioWorldState, UiSound } from './types';
export { renderSfxOffline } from './offline';
export { gameAudioProbe } from './probe';

/** One-shot polyphony (effects + ambience one-shots); the score adds MUSIC_VOICES on top. */
export const SFX_VOICES = 18;
/** Layer levels, the score's direction and the beds are pushed at this rate, not every frame. */
const CONTROL_PERIOD = 1 / 15;
const SEED = 0xdeedd0;

const LANTERN_LEVEL = 0.1;

// Category ducking (pause, menus, death).
const PAUSE_MUSIC = 0.45;
const PAUSE_AMBIENCE = 0.3;
const MENU_AMBIENCE = 0.5;
const DEATH_MUSIC = 0.25;

/** Longest frame step the timers accept, so a long hitch does not fire everything at once. */
const MAX_STEP = 0.25;
/** Spacing of resume retries from update() while the page holds a fresh user activation. */
const RESUME_RETRY = 0.5;
/** A new biome must hold this long under the feet before the score and the bed follow it. */
const BIOME_SETTLE = 2;
/** At most this many positional loops (waterfalls, vents, lava, fires...) at once. */
const EMITTER_SLOTS = 4;
/** Sonar echoes per pulse (the rarest and the lairs first). */
const SONAR_ECHOES = 7;
/** The ending theme plays this long after 'quest:ending', then free play's scores return. */
const ENDING_SECONDS = 150;

/** Without a biome (the title, the old world): a score per depth mood. */
const MOOD_SCORE: Record<MoodName, ScoreId> = { camp: 'camp', shallow: 'amberHollows', mid: 'crystalGeode', deep: 'obsidianAbyss' };
const MENU_SCREENS = new Set(['inventory', 'crafting', 'map', 'quests', 'bestiary', 'journal', 'board', 'settings', 'pause', 'summary']);
const RARITY_PITCH: Record<string, number> = { common: 1, uncommon: 1.122, rare: 1.26, epic: 1.335, legendary: 1.498 };
const RARITY_RANK: Record<string, number> = { common: 0, uncommon: 1, rare: 2, epic: 3, legendary: 4 };

/** One-shots near features (bubbles at a bog pool, sparks over lava, a vent's hiss). */
const EMITTER_SHOTS: Partial<Record<EmitterKind, { name: SfxName; every: number }>> = {
  bubbles: { name: 'amb.bubble', every: 1.6 },
  lava: { name: 'amb.lavaPop', every: 3 },
  gasVent: { name: 'amb.hiss', every: 5 },
  emberVent: { name: 'amb.lavaPop', every: 4 },
};

const NO_PARAMS: SfxParams = {};
const RESOLVED: Promise<void> = Promise.resolve();
const noop = (): void => {};
const finiteOr = (v: number, fallback: number): number => (Number.isFinite(v) ? v : fallback);

type AudioContextClass = typeof AudioContext;

function audioContextClass(): AudioContextClass | null {
  const g = globalThis as { AudioContext?: AudioContextClass; webkitAudioContext?: AudioContextClass };
  return g.AudioContext ?? g.webkitAudioContext ?? null;
}

/** True while the page holds transient user activation (browsers without the API: false). */
function hasTransientActivation(): boolean {
  const nav = (globalThis as { navigator?: { userActivation?: { isActive?: boolean } } }).navigator;
  return nav?.userActivation?.isActive === true;
}

/** The events the score and the mix listen to besides the sounds (eventMap). */
const DIRECTOR_EVENTS: ReadonlyArray<keyof GameEvents> = [
  'mob:telegraph', 'mob:attack', 'mob:hit', 'mob:died', 'mob:shot', 'mob:guardianAwake', 'mob:guardianPhase', 'mob:guardianReset',
  'mob:guardianDefeated', 'world:biome', 'world:stratum', 'quest:ending', 'player:died', 'player:damaged', 'camp:entered', 'player:respawned',
];

/** Every event the AudioSystem subscribes to (once each). */
export const LISTENED_EVENTS: ReadonlyArray<keyof GameEvents> = [...new Set([...AUDIBLE_EVENTS, ...DIRECTOR_EVENTS])];

interface SfxVoice {
  v: Voice;
  cat: VoiceCategory;
}

/** Everything that exists only once an AudioContext has been created. */
interface Live {
  ctx: AudioContext;
  graph: MixGraph;
  targets: Record<BusName, SynthTarget>;
  music: MusicPlayer;
  lantern: LanternLoop;
  beds: Map<string, BiomeBed>;
  emitters: Map<EmitterKind, LazyLayer>;
  hazard: HazardLayer;
  reverb: ParamTarget;
  ducks: Record<'music' | 'ambience', DuckParam>;
  meter: { node: AnalyserNode; data: Float32Array<ArrayBuffer> } | null;
}

/** A bus's duck gains (dry and reverb send): quick to dip under a cue, slow to come back. */
class DuckParam {
  private last = 1;

  constructor(private readonly dry: AudioParam, private readonly wet: AudioParam) {}

  set(value: number, now: number): void {
    if (!Number.isFinite(value) || Math.abs(value - this.last) < 0.01) return;
    const tc = value < this.last ? 0.06 : 0.55;
    this.last = value;
    this.dry.setTargetAtTime(value, now, tc);
    this.wet.setTargetAtTime(value, now, tc);
  }
}

/** A bed's one-shot clock. */
interface ShotClock {
  name: SfxName;
  next: number;
}

/**
 * The game's audio, fully synthesized with Web Audio (round 3, AUDIO):
 * - the score: a layered generative score per biome (MusicPlayer, MusicScheduler, scores.ts) whose
 *   layers follow the danger and the fights (IntensityTracker), crossfading between biomes and
 *   strata, a guardian theme per stratum in the lairs, the Heart's boss and the ending, the camp's
 *   sparse bed and the title's theme; stingers on arrival, victory and a guardian's new phase;
 * - the beds: each biome's ambience (ambience.ts), crossfading at borders; positional loops near
 *   waterfalls, vents, lava, fires and torches; the hazard layer; the lantern;
 * - every event's sound (eventMap.ts), the sonar's echoes from what it found, hazard warnings;
 * - the mix: ducking for story beats, per-category voice budgets inside the global cap, priorities,
 *   a limiter and a soft clipper; the volume sliders on every bus.
 *
 * The game's state comes in two ways: the per-frame AudioWorldState (Game.audioState) and, when
 * attached, the probe (probe.ts) read at control rate for the biome, the danger, the guardian, the
 * hazard meter, nearby emitters and the sonar. Nothing exists until unlock() is called from a user
 * gesture (mobile autoplay policy); before that, and wherever Web Audio is missing, every method is
 * a safe no-op.
 */
export class AudioSystem {
  private live: Live | null = null;
  private readonly offs: Array<() => void> = [];
  private readonly rng = new Rng(SEED ^ 0xa0d10);
  private readonly rand = (): number => this.rng.next();
  private readonly voices = new VoiceLimiter<SfxVoice>(SFX_VOICES, (e) => e.v.kill(this.live?.ctx.currentTime ?? 0));
  private readonly gate = new RateGate();
  private readonly intensity = new IntensityTracker();
  private readonly ducker = new Ducker();
  private probe: AudioProbe | null = null;
  private scene: AudioScene | null = null;
  private volumes: AudioVolumes = {
    master: DEFAULT_SETTINGS.masterVolume,
    music: DEFAULT_SETTINGS.musicVolume,
    sfx: DEFAULT_SETTINGS.sfxVolume,
    ambience: DEFAULT_SETTINGS.ambienceVolume,
  };
  /** Last good world state: a non-finite field in a frame keeps its previous value. */
  private readonly world: AudioWorldState = {
    depth: 0, atCamp: false, openness: 0, lanternFuel: 1, lanternLit: false, nearCrystal: 0, nearFire: 0, playerSpeed: 0, inMenu: false,
  };
  private paused = false;
  private inMenu = false;
  private backgrounded = false;
  private disposed = false;
  /** Context creation failed; later gestures do not retry (and warn) again. */
  private unavailable = false;
  private wantsRunning = false;
  private resuming: Promise<void> | null = null;
  private resumeRetryIn = 0;
  private mood: MoodName | null = null;
  private control = CONTROL_PERIOD;
  private flickerIn = 0;
  private flickering = false;
  private musicDuckUntil = 0;
  // The score's direction.
  private biome: BiomeId | null = null;
  private candidate: BiomeId | null = null;
  private candidateFor = 0;
  private stratum = 1;
  private pendingArrival: BiomeId | null = null;
  private endingUntil = 0;
  private holdScoreUntil = 0;
  private quietAfterVictory = 0;
  private guardianEvent: { kind: string; heart: boolean } | null = null;
  private wasLoading = false;
  // The beds and the features.
  private bedKey = '';
  private clocks: ShotClock[] = [];
  private emitterClocks = new Map<EmitterKind, number>();
  private warned: Record<HazardName, number> = { cold: 0, gas: 0, heat: 0, dark: 0 };
  private sonarSeen = 0;
  private readonly echoes: Array<{ at: number; name: SfxName; params: SfxParams }> = [];
  private lastScreen = 'none';

  constructor(private readonly bus: EventBus<GameEvents>) {
    for (const type of LISTENED_EVENTS) this.listen(type);
  }

  /** True once the AudioContext exists and is running. */
  get unlocked(): boolean {
    return this.live !== null && this.live.ctx.state === 'running';
  }

  /** Read the game at control rate through `probe` (Game.ts attaches gameAudioProbe(this) once). */
  attach(probe: AudioProbe | null): void {
    this.probe = probe;
  }

  /**
   * Create (first call) and resume the AudioContext. Call from every user gesture until
   * `unlocked` is true; extra calls cost nothing.
   */
  unlock(): Promise<void> {
    if (this.disposed || this.unavailable) return RESOLVED;
    if (!this.live && !this.create()) {
      this.unavailable = true;
      return RESOLVED;
    }
    const ctx = this.live!.ctx;
    this.wantsRunning = true;
    if (ctx.state === 'running' || this.backgrounded) return RESOLVED;
    try {
      // iOS only unlocks output when a source starts inside the gesture itself.
      const prime = ctx.createBufferSource();
      prime.buffer = ctx.createBuffer(1, 1, ctx.sampleRate);
      prime.connect(ctx.destination);
      prime.onended = () => prime.disconnect();
      prime.start();
      // Ask again on every gesture: a resume() requested before the page had user activation
      // (Android's touch pointerdown is not one) stays pending and never starts output.
      return this.requestResume(ctx);
    } catch (err) {
      console.warn('[audio] resume failed', err);
      return RESOLVED;
    }
  }

  setVolumes(v: AudioVolumes): void {
    const p = this.volumes;
    const level = (x: number, prev: number) => saturate(finiteOr(x, prev));
    this.volumes = { master: level(v.master, p.master), music: level(v.music, p.music), sfx: level(v.sfx, p.sfx), ambience: level(v.ambience, p.ambience) };
    this.applyGains(0.08);
  }

  update(frameDt: number, state: AudioWorldState): void {
    try {
      const dt = Math.min(Math.max(finiteOr(frameDt, 0), 0), MAX_STEP);
      const s = this.accept(state);
      if (s.inMenu !== this.inMenu) {
        this.inMenu = s.inMenu;
        this.applyGains(0.3);
      }
      const live = this.live;
      if (!live) return;
      if (live.ctx.state !== 'running') {
        this.retryResume(live.ctx, dt);
        return;
      }
      const now = live.ctx.currentTime;
      if (this.musicDuckUntil > 0 && now >= this.musicDuckUntil) {
        this.musicDuckUntil = 0;
        this.applyGains(0.8);
      }
      this.sputter(live, dt, now, s);
      this.control += dt;
      if (this.control >= CONTROL_PERIOD) {
        this.controlTick(live, now, this.control, s);
        this.control = 0;
      }
      live.music.update(now);
      this.playEchoes(now);
      if (!this.paused && !s.inMenu) this.ambientOneShots(dt, s);
    } catch (err) {
      console.warn('[audio] update failed', err);
    }
  }

  ui(name: UiSound): void {
    this.play(`ui.${name}`, NO_PARAMS);
  }

  /** Duck music and ambience, silence the lantern and ignore footsteps while paused. */
  setPaused(paused: boolean): void {
    if (paused === this.paused) return;
    this.paused = paused;
    this.applyGains(0.15);
    const live = this.live;
    if (live && paused) live.lantern.setLevel(0, live.ctx.currentTime, 0);
  }

  /** App backgrounded (visibilitychange): stop the audio clock and all output. */
  suspend(): void {
    this.backgrounded = true;
    this.live?.ctx.suspend().catch(noop);
  }

  /** App foregrounded: restart output if the player had unlocked audio before. */
  resume(): void {
    this.backgrounded = false;
    if (this.live && this.wantsRunning && this.live.ctx.state !== 'running') this.live.ctx.resume().catch(noop);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const off of this.offs) off();
    this.offs.length = 0;
    const live = this.live;
    this.live = null;
    if (!live) return;
    try {
      const now = live.ctx.currentTime;
      live.music.stop(now);
      this.voices.clear((e) => e.v.kill(now));
      live.lantern.stop();
      for (const b of live.beds.values()) b.stop();
      for (const l of live.emitters.values()) l.stop();
      live.hazard.stop();
    } finally {
      live.ctx.close().catch(noop);
    }
  }

  /** Debug/test snapshot. */
  stats(): {
    state: string; sfxVoices: number; musicVoices: number; mood: MoodName | null; time: number;
    score: ScoreId | null; intensity: IntensityState; danger: number; heat: number; biome: BiomeId | null; bed: string; beds: number; emitters: number; decks: number;
  } {
    const live = this.live;
    return {
      state: live?.ctx.state ?? 'none',
      sfxVoices: this.voices.size,
      musicVoices: live?.music.activeVoices ?? 0,
      mood: this.mood,
      time: live?.ctx.currentTime ?? 0,
      score: live?.music.score ?? null,
      intensity: this.intensity.state,
      danger: this.intensity.danger,
      heat: this.intensity.heat,
      biome: this.biome,
      bed: this.bedKey,
      beds: live?.beds.size ?? 0,
      emitters: live ? [...live.emitters.values()].filter((l) => l.live).length : 0,
      decks: live?.music.deckCount ?? 0,
    };
  }

  /** Current output peak in [0, 1] (debug/tests). Taps the final output on first use. */
  meter(): number {
    const live = this.live;
    if (!live) return 0;
    if (!live.meter) {
      const node = live.ctx.createAnalyser();
      node.fftSize = 2048;
      live.graph.output.connect(node);
      live.meter = { node, data: new Float32Array(node.fftSize) };
    }
    const { node, data } = live.meter;
    node.getFloatTimeDomainData(data);
    let peak = 0;
    for (let i = 0; i < data.length; i++) peak = Math.max(peak, Math.abs(data[i]));
    return peak;
  }

  // -------------------------------------------------------------------------------------

  private requestResume(ctx: AudioContext): Promise<void> {
    const pending: Promise<void> = ctx.resume().then(noop, noop).finally(() => {
      if (this.resuming === pending) this.resuming = null;
    });
    this.resuming = pending;
    return pending;
  }

  /**
   * A tap only activates the page on pointerup, after the game's pointerdown unlock() was
   * refused. Retry from the frame loop while that activation is fresh, so the first tap
   * already starts the audio. Never while backgrounded: that suspension is ours.
   */
  private retryResume(ctx: AudioContext, dt: number): void {
    if (!this.wantsRunning || this.backgrounded || ctx.state === 'closed') return;
    this.resumeRetryIn -= dt;
    if (this.resumeRetryIn > 0 || !hasTransientActivation()) return;
    this.resumeRetryIn = RESUME_RETRY;
    this.requestResume(ctx);
  }

  /** Copy the frame's world state into `this.world`, keeping the last good value of any non-finite field. */
  private accept(s: AudioWorldState): AudioWorldState {
    const w = this.world;
    w.depth = finiteOr(s.depth, w.depth);
    w.openness = finiteOr(s.openness, w.openness);
    w.lanternFuel = finiteOr(s.lanternFuel, w.lanternFuel);
    w.nearCrystal = finiteOr(s.nearCrystal, w.nearCrystal);
    w.nearFire = finiteOr(s.nearFire, w.nearFire);
    w.playerSpeed = finiteOr(s.playerSpeed, w.playerSpeed);
    w.atCamp = s.atCamp;
    w.lanternLit = s.lanternLit;
    w.inMenu = s.inMenu;
    return w;
  }

  private create(): boolean {
    const Ctx = audioContextClass();
    if (!Ctx) return false;
    let ctx: AudioContext;
    try {
      ctx = new Ctx({ latencyHint: 'interactive' });
    } catch (err) {
      console.warn('[audio] AudioContext unavailable', err);
      return false;
    }
    try {
      const graph = createMixGraph(ctx, ctx.destination, SEED);
      const targets: Record<BusName, SynthTarget> = {
        music: busTarget(graph, 'music', this.rand),
        sfx: busTarget(graph, 'sfx', this.rand),
        ambience: busTarget(graph, 'ambience', this.rand),
      };
      const { noise, buses } = graph;
      const duck = (b: 'music' | 'ambience') => new DuckParam(buses[b].duck.gain, buses[b].duckWet.gain);
      this.live = {
        ctx,
        graph,
        targets,
        music: new MusicPlayer(targets.music, SEED),
        lantern: new LanternLoop(ctx, noise, buses.sfx.input),
        beds: new Map(),
        emitters: new Map(),
        hazard: new HazardLayer(ctx, noise, buses.ambience.input),
        reverb: new ParamTarget(graph.reverbReturn.gain, 0.5, 0.01),
        ducks: { music: duck('music'), ambience: duck('ambience') },
        meter: null,
      };
      this.applyGains(0);
      return true;
    } catch (err) {
      console.warn('[audio] graph setup failed', err);
      this.live = null;
      ctx.close().catch(noop);
      return false;
    }
  }

  /** Push category volumes x ducking to the buses. `tc` = 0 sets them instantly. */
  private applyGains(tc: number): void {
    const live = this.live;
    if (!live) return;
    const t = live.ctx.currentTime;
    const v = this.volumes;
    const music = volumeToGain(v.music) * (this.paused ? PAUSE_MUSIC : 1) * (this.musicDuckUntil > 0 ? DEATH_MUSIC : 1);
    const ambience = volumeToGain(v.ambience) * (this.paused ? PAUSE_AMBIENCE : this.inMenu ? MENU_AMBIENCE : 1);
    const set = (param: AudioParam, value: number) => {
      param.cancelScheduledValues(t);
      if (tc > 0) param.setTargetAtTime(value, t, tc);
      else param.setValueAtTime(value, t);
    };
    set(live.graph.master.gain, volumeToGain(v.master));
    const levels: Record<BusName, number> = { music, sfx: volumeToGain(v.sfx), ambience };
    for (const name of ['music', 'sfx', 'ambience'] as const) {
      set(live.graph.buses[name].input.gain, levels[name]);
      set(live.graph.buses[name].wet.gain, levels[name]);
    }
  }

  private listen<K extends keyof GameEvents>(type: K): void {
    this.offs.push(this.bus.on(type, (payload) => this.onEvent(type, payload)));
  }

  private onEvent<K extends keyof GameEvents>(type: K, payload: GameEvents[K]): void {
    try {
      this.direct(type, payload);
      if (!this.live) return;
      if (this.paused && type === 'player:footstep') return;
      const req = sfxForEvent(type, payload);
      if (req) this.play(req.name, this.placed(type, payload, req.params));
      if (type === 'player:damaged') this.muffle(req?.params.intensity ?? 0.5);
      if (type === 'player:died') this.duckMusic(4);
    } catch (err) {
      console.warn(`[audio] "${String(type)}" handler failed`, err);
    }
  }

  /** Events with a world position and no stereo of their own are placed round the listener. */
  private placed<K extends keyof GameEvents>(type: K, payload: GameEvents[K], params: SfxParams): SfxParams {
    if (params.pan !== undefined || (type !== 'companion:ore' && type !== 'world:lever' && type !== 'world:rockfall')) return params;
    const p = payload as unknown as { x?: number; y?: number; z?: number };
    const sc = this.scene;
    if (!sc || !Number.isFinite(p.x) || !Number.isFinite(p.z)) return params;
    const dx = p.x! - sc.lx;
    const dz = p.z! - sc.lz;
    const d = Math.hypot(dx, dz);
    return d > 0.5 ? { ...params, pan: Math.max(-1, Math.min(1, (dx * sc.rx + dz * sc.rz) / d)) * 0.8 } : params;
  }

  /** What events do to the score: blows heat the fight, guardians, biomes, the ending. */
  private direct<K extends keyof GameEvents>(type: K, payload: GameEvents[K]): void {
    const now = this.live?.ctx.currentTime ?? 0;
    const p = payload as Record<string, unknown>;
    const heat = (kind: CombatImpulse, scale = 1) => this.intensity.impulse(kind, scale);
    switch (type) {
      case 'mob:telegraph':
        heat('telegraph', 0.4 + 0.6 * saturate(Number(p.gain) || 0));
        break;
      case 'mob:attack':
        heat(p.landed ? 'hurt' : 'attack');
        break;
      case 'mob:hit':
        heat('hit');
        break;
      case 'mob:died':
        if (p.rank !== 'guardian' && p.rank !== 'boss') heat('kill');
        break;
      case 'mob:shot':
        if (p.phase === 'fly') heat('shot', saturate(Number(p.gain) || 0));
        break;
      case 'mob:guardianAwake':
        this.guardianEvent = { kind: String(p.kind), heart: p.kind === 'heartOfDark' };
        break;
      case 'mob:guardianPhase':
        this.live?.music.sting('phase', now);
        break;
      case 'mob:guardianReset':
        this.guardianEvent = null;
        break;
      case 'mob:guardianDefeated':
        this.guardianEvent = null;
        // The lair falls quiet on a major chord; the biome's score returns after a breath.
        if (this.live) {
          const len = this.live.music.sting('victory', now);
          this.holdScoreUntil = now + Math.max(4, len);
          this.quietAfterVictory = now + len + 3;
        }
        this.intensity.reset();
        break;
      case 'world:biome':
        if (p.first) this.pendingArrival = p.biome as BiomeId;
        break;
      case 'world:stratum':
        this.stratum = Number(p.stratum) || this.stratum;
        this.intensity.reset();
        break;
      case 'quest:ending':
        this.endingUntil = now + ENDING_SECONDS;
        this.holdScoreUntil = 0;
        break;
      case 'player:died':
      case 'player:respawned':
      case 'camp:entered':
        this.intensity.reset();
        break;
    }
  }

  private play(name: SfxName, params: SfxParams, at?: number): void {
    const live = this.live;
    if (!live || this.backgrounded) return;
    // While the first gesture is resuming the context, only the UI sound that caused it may queue.
    if (live.ctx.state !== 'running' && !(this.resuming && name.startsWith('ui.'))) return;
    const d = SFX[name];
    const now = live.ctx.currentTime;
    if (!this.gate.allow(name, now, d.minGap)) return;
    // Too far to matter (a creature at the edge of hearing).
    if ((params.gain ?? 1) < 0.02) return;
    // A category's own budget: past it, the category's oldest voice makes way (or this one drops).
    const cat = categoryOf(name);
    if (this.voices.count(now, (e) => e.cat === cat) >= CATEGORY_CAP[cat]) {
      const old = this.voices.oldest(now, (e) => e.cat === cat);
      if (!old) return;
      old.v.kill(now, 0.05);
      this.voices.remove(old);
    }
    if (!this.voices.admit(now, d.priority)) return;
    try {
      const v = playSfx(live.targets[d.bus], name, params, Math.max(now + 0.005, at ?? 0));
      this.voices.add({ v, cat }, now, v.end, d.priority);
      const duck = DUCKS[name] ?? (d.priority >= 4 && d.bus === 'sfx' ? { music: 0.5, ambience: 0.6, hold: Math.min(3, d.length * 0.7) } : null);
      if (duck) this.ducker.add(duck, now);
    } catch (err) {
      console.warn(`[audio] failed to play "${name}"`, err);
    }
  }

  /** Taking damage briefly muffles the whole mix, like a blow to the head. */
  private muffle(intensity: number): void {
    const live = this.live;
    if (!live) return;
    const t = live.ctx.currentTime;
    const f = live.graph.muffle.frequency;
    f.cancelScheduledValues(t);
    f.setValueAtTime(f.value, t);
    f.exponentialRampToValueAtTime(lerp(1400, 600, saturate(intensity)), t + 0.03);
    f.setTargetAtTime(20000, t + 0.15, 0.35);
  }

  private duckMusic(seconds: number): void {
    const live = this.live;
    if (!live) return;
    this.musicDuckUntil = live.ctx.currentTime + seconds;
    this.applyGains(0.3);
  }

  /** Control rate: the probe, the intensity, the score, the beds, the features, the hazards, the mix. */
  private controlTick(live: Live, now: number, dt: number, s: AudioWorldState): void {
    const scene = this.probe ? this.probe() : null;
    this.scene = scene;
    const menuMode = scene ? scene.mode === 'menu' : false;
    // The intensity: the danger round the explorer, heated by the fight's blows.
    if (s.atCamp || menuMode) this.intensity.reset();
    this.intensity.update(dt, scene && !s.atCamp ? scene.danger : 0);
    // The biome under the feet, once it has settled.
    this.followBiome(scene, dt);
    this.directScore(live, now, s, scene);
    live.music.setMix(this.intensity.layerMix(), now);
    // Ducking.
    for (const b of ['music', 'ambience'] as const) live.ducks[b].set(this.ducker.target(b, now), now);
    // The lantern.
    const lanternOn = s.lanternLit && !this.paused && !s.inMenu;
    live.lantern.setLevel(lanternOn ? LANTERN_LEVEL * (0.35 + 0.65 * Math.sqrt(saturate(s.lanternFuel))) : 0, now, dt);
    // The beds: the camp's, the biome's (crossfading), or a cave bed by depth without a probe.
    this.beds(live, now, dt, s, scene);
    this.features(live, now, dt, scene);
    this.hazards(live, now, dt, scene);
    this.sonar(now, scene);
    this.menus(scene);
    live.reverb.set(0.3 + 0.9 * saturate(s.openness), now);
  }

  private followBiome(scene: AudioScene | null, dt: number): void {
    const here = scene?.biome ?? null;
    if (here === this.biome) {
      this.candidate = null;
      return;
    }
    if (here !== this.candidate) {
      this.candidate = here;
      this.candidateFor = 0;
    }
    this.candidateFor += dt;
    // The first biome of a stratum (or after a load) is taken at once; borders must settle.
    if (this.biome === null || this.candidateFor >= BIOME_SETTLE || here === null) {
      this.biome = here;
      this.candidate = null;
    }
  }

  /** Which score plays now, and how it comes in. */
  private directScore(live: Live, now: number, s: AudioWorldState, scene: AudioScene | null): void {
    const music = live.music;
    if (now < this.holdScoreUntil) return;
    const loading = scene?.loading === true;
    if (loading) {
      // A stratum is being generated: the score falls silent under the loading screen.
      music.play(null, now, { fadeOut: 0.8 });
      this.wasLoading = true;
      return;
    }
    let id: ScoreId | null;
    let fade = { fadeIn: 2, fadeOut: 2.5, delay: 1 };
    const fight = scene ? scene.guardian : this.guardianEvent;
    if (now < this.endingUntil) {
      id = 'ending';
      fade = { fadeIn: 2.5, fadeOut: 2, delay: 1.5 };
    } else if (scene?.mode === 'menu') {
      id = 'menu';
      fade = { fadeIn: 1.5, fadeOut: 1.2, delay: 0.8 };
    } else if (fight) {
      const heart = 'heart' in fight ? fight.heart : fight.kind === 'heartOfDark';
      id = guardianScoreFor(scene?.stratum ?? this.stratum, heart);
      fade = { fadeIn: 0.35, fadeOut: 0.7, delay: 0.25 };
    } else if (s.atCamp) {
      id = 'camp';
      fade = { fadeIn: 2.5, fadeOut: 1.8, delay: 1.5 };
    } else if (this.biome) {
      id = this.biome;
    } else if (!scene) {
      this.mood = moodFor(s.depth, s.atCamp, this.mood);
      id = MOOD_SCORE[this.mood];
    } else id = 'amberHollows';
    if (this.wasLoading) {
      fade = { fadeIn: 1.2, fadeOut: 0.5, delay: 0.8 };
      this.wasLoading = false;
    }
    if (now < this.quietAfterVictory && id !== music.score) fade = { ...fade, delay: Math.max(fade.delay, this.quietAfterVictory - now) };
    if (id !== music.score) music.play(id, now, fade);
    // A biome's first visit: its motif stated plainly once the deck is in.
    if (this.pendingArrival && music.score === this.pendingArrival) {
      music.sting('arrival', now + fade.delay);
      this.pendingArrival = null;
    } else if (this.pendingArrival && (s.atCamp || fight)) this.pendingArrival = null;
  }

  private beds(live: Live, now: number, dt: number, s: AudioWorldState, scene: AudioScene | null): void {
    const menuMode = scene?.mode === 'menu';
    const key = s.atCamp || menuMode ? 'camp' : this.biome ?? (scene ? 'amberHollows' : `depth`);
    const recipe: BedRecipe = key === 'camp' ? CAMP_BED : key === 'depth' ? BEDS[this.mood === 'deep' ? 'obsidianAbyss' : this.mood === 'mid' ? 'crystalGeode' : 'amberHollows'] : BEDS[key as BiomeId];
    if (key !== this.bedKey) {
      this.bedKey = key;
      this.clocks = recipe.shots.map((shot) => ({ name: shot.name, next: this.interval(shot.every) * 0.5 }));
    }
    if (!live.beds.has(key)) live.beds.set(key, new BiomeBed(live.ctx, live.graph.noise, live.graph.buses.ambience.input, recipe, { to: live.graph.buses.ambience.wet, amount: 0.35 }));
    const depth01 = smoothstep(45, 145, s.depth % 90 + 45);
    const k = 1 - Math.exp(-dt / 2.2);
    for (const [bk, bed] of live.beds) {
      bed.target = bk === key ? 1 : 0;
      bed.weight += (bed.target - bed.weight) * k;
      if (bed.target === 0 && bed.weight < 0.002) bed.weight = 0;
      bed.update(now, dt, 1, depth01, saturate(s.openness));
      if (bed.target === 0 && bed.weight === 0 && !bed.audible) {
        bed.stop();
        live.beds.delete(bk);
      }
    }
  }

  /** Positional loops near the listener: the nearest few emitters, panned, by distance. */
  private features(live: Live, now: number, dt: number, scene: AudioScene | null): void {
    const want = new Map<EmitterKind, { level: number; pan: number }>();
    if (scene && !this.paused) {
      for (const e of scene.emitters) {
        if (want.size >= EMITTER_SLOTS && !want.has(e.kind)) continue;
        if (want.has(e.kind)) continue;
        const dx = e.x - scene.lx;
        const dz = e.z - scene.lz;
        const d = Math.hypot(dx, (e.y - scene.ly) * 1.3, dz);
        const near = Math.max(0, 1 - d / e.range);
        if (near <= 0) continue;
        const level = EMITTER_LEVEL[e.kind] * e.strength * Math.pow(near, 1.5);
        const pan = Math.hypot(dx, dz) > 0.5 ? ((dx * scene.rx + dz * scene.rz) / Math.hypot(dx, dz)) * 0.85 : 0;
        want.set(e.kind, { level, pan });
      }
    } else if (!scene) {
      // No probe: the campfire by the old landmark distance.
      const fire = this.world.nearFire;
      if (fire > 0) want.set('fire', { level: 0.45 * Math.pow(saturate(fire), 1.4), pan: 0 });
    }
    for (const [kind, w] of want) {
      let layer = live.emitters.get(kind);
      if (!layer) {
        layer = emitterLayer(kind, live.ctx, live.graph.noise, live.graph.buses.ambience.input, { to: live.graph.buses.ambience.wet, amount: 0.5 });
        live.emitters.set(kind, layer);
      }
      layer.setLevel(w.level, now, dt);
      layer.setPan(w.pan, now);
      // Its one-shots, placed with it.
      const shot = EMITTER_SHOTS[kind];
      if (shot && w.level > 0.03) {
        const next = (this.emitterClocks.get(kind) ?? 0) - dt;
        if (next <= 0) {
          this.play(shot.name, { pan: w.pan, gain: Math.min(1, 0.4 + w.level * 2), pitch: this.rng.range(0.85, 1.2) });
          this.emitterClocks.set(kind, this.interval(shot.every));
        } else this.emitterClocks.set(kind, next);
      }
    }
    for (const [kind, layer] of live.emitters) {
      if (want.has(kind)) continue;
      layer.setLevel(0, now, dt);
      if (!layer.live) live.emitters.delete(kind);
    }
  }

  /** The hazard layer follows the meter; warnings as it passes half and nearly full. */
  private hazards(live: Live, now: number, dt: number, scene: AudioScene | null): void {
    const kind = scene?.hazard ?? null;
    const level = scene?.hazardLevel ?? 0;
    live.hazard.update(this.paused ? null : kind, level, now, dt);
    for (const k of ['cold', 'gas', 'heat', 'dark'] as const) {
      const l = k === kind ? level : 0;
      const step = l >= 0.85 ? 2 : l >= 0.5 ? 1 : 0;
      if (step > this.warned[k]) this.play(`hazard.${k}`, { intensity: step === 2 ? 1 : 0.5 });
      if (step > this.warned[k] || l < 0.35) this.warned[k] = l < 0.35 ? 0 : Math.max(this.warned[k], step);
    }
  }

  /** The sonar's echoes: what it found answers as the shell reaches it, from where it is. */
  private sonar(now: number, scene: AudioScene | null): void {
    if (!scene || scene.sonarPings <= this.sonarSeen) return;
    this.sonarSeen = scene.sonarPings;
    const finds = [...scene.sonar] as SonarReveal[];
    const weight = (c: SonarReveal) => (c.kind === 'lair' ? 10 : c.kind === 'gate' ? 9 : c.kind === 'chest' || c.kind === 'secret' ? 5 : c.kind === 'page' || c.kind === 'outpost' ? 4 : RARITY_RANK[c.rarity ?? 'common'] ?? 0);
    finds.sort((a, b) => weight(b) - weight(a));
    let n = 0;
    for (const c of finds) {
      if (n >= SONAR_ECHOES) break;
      const dx = c.x - scene.lx;
      const dz = c.z - scene.lz;
      const d = Math.hypot(dx, c.y - scene.ly, dz);
      const pan = Math.hypot(dx, dz) > 0.5 ? ((dx * scene.rx + dz * scene.rz) / Math.hypot(dx, dz)) * 0.8 : 0;
      const gain = 0.55 + 0.45 * Math.max(0, 1 - d / 48);
      const rarity = c.rarity ?? 'common';
      const name: SfxName = c.kind === 'lair' ? 'sonar.lair' : c.kind === 'gate' ? 'sonar.gate' : c.kind === 'chest' || c.kind === 'page' || c.kind === 'outpost' || c.kind === 'secret' ? 'sonar.chest' : RARITY_RANK[rarity] >= 3 ? 'sonar.rare' : 'sonar.ping';
      const pitch = name === 'sonar.ping' || name === 'sonar.rare' ? RARITY_PITCH[rarity] ?? 1 : 1;
      const at = now + 0.12 + Math.min(1.4, Math.max(0, finiteOr(c.delay, d / 28))) + n * 0.03;
      this.echoes.push({ at, name, params: { pan, gain, pitch } });
      n++;
    }
  }

  private playEchoes(now: number): void {
    for (let i = this.echoes.length - 1; i >= 0; i--) {
      const e = this.echoes[i];
      if (e.at > now + 0.02) continue;
      this.echoes.splice(i, 1);
      if (e.at > now - 0.5) this.play(e.name, e.params);
    }
  }

  /** A menu closing (a screen back to the game) clicks shut. */
  private menus(scene: AudioScene | null): void {
    const screen = scene?.screen ?? 'none';
    if (screen !== this.lastScreen) {
      if (MENU_SCREENS.has(this.lastScreen) && screen === 'none' && scene?.mode === 'playing') this.play('ui.close', { gain: 0.8 });
      this.lastScreen = screen;
    }
  }

  /** Irregular flame dips while the lantern is low on fuel; deeper and more frequent near empty. */
  private sputter(live: Live, dt: number, now: number, s: AudioWorldState): void {
    const low = s.lanternLit && s.lanternFuel < PLAYER.lanternLowFraction && !this.paused;
    if (!low) {
      if (this.flickering) live.lantern.flicker(1, now);
      this.flickering = false;
      return;
    }
    this.flickering = true;
    this.flickerIn -= dt;
    if (this.flickerIn > 0) return;
    const severity = 1 - saturate(s.lanternFuel / PLAYER.lanternLowFraction);
    this.flickerIn = this.rng.range(0.04, 0.14);
    const dip = this.rng.chance(0.25 + 0.45 * severity);
    live.lantern.flicker(dip ? this.rng.range(0.1, 0.5) : this.rng.range(0.75, 1.1), now);
  }

  /** The bed's one-shots, each on its own clock. */
  private ambientOneShots(dt: number, s: AudioWorldState): void {
    const recipe = this.bedKey === 'camp' ? CAMP_BED : BEDS[this.bedKey as BiomeId];
    if (!recipe) return;
    for (let i = 0; i < this.clocks.length; i++) {
      const c = this.clocks[i];
      c.next -= dt;
      if (c.next > 0) continue;
      const shot = recipe.shots[i];
      if (!shot) continue;
      c.next = this.interval(shot.every * (s.atCamp ? 1.5 : 1));
      const pitch = shot.pitch ? this.rng.range(shot.pitch[0], shot.pitch[1]) : 1;
      this.play(shot.name, { pan: this.rng.range(-1, 1) * (shot.pan ?? 0.7), gain: this.rng.range(shot.gain[0], shot.gain[1]), pitch });
    }
  }

  /** Random wait around `mean` seconds: exponential spread, but never a rapid-fire repeat. */
  private interval(mean: number): number {
    return mean * (0.4 - 0.6 * Math.log(1 - this.rng.next()));
  }
}

