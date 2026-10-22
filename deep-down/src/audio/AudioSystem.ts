import { PLAYER } from '../config/balance';
import type { BiomeId } from '../config/biomes';
import type { EventBus, GameEvents } from '../core/events';
import { lerp, saturate, smoothstep } from '../core/math';
import { Rng } from '../core/rng';
import { DEFAULT_SETTINGS } from '../save/types';
import { BiomeBed, EMITTERS, HazardLayer, bedRecipeOf, emitterLayer, type BedRecipe } from './ambience';
import { AUDIBLE_EVENTS, sfxForEvent } from './eventMap';
import { busTarget, createMixGraph, type MixGraph } from './graph';
import { IntensityTracker, type CombatImpulse, type IntensityState } from './intensity';
import { LanternLoop, ParamTarget, type LazyLayer } from './layers';
import { CATEGORY_CAP, DUCKS, Ducker, categoryOf, densityDuck, type VoiceCategory } from './mixer';
import { MusicPlayer } from './MusicPlayer';
import type { LayerMix } from './MusicScheduler';
import type { AudioProbe, AudioScene, EmitterKind, HazardName, HeardEmitter, SonarReveal } from './probe';
import { BIOME_SCORES, SCORES, guardianScoreFor, isGuardianScore, type ScoreId } from './scores';
import { KEYED, majorKeyOf, shiftTo } from './harmony';
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
/** Health under this fraction: the explorer's heart is heard. */
const LOW_HEALTH = 0.3;
/** The beds' overall level (round 3: +1.6 dB, so a cave's air is felt on a phone under the score). */
const BED_LEVEL = 1.2;

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
/** At most this many positional loops (falls, the river, vents, lava, fires...) at once, and this many features' one-shots. */
const EMITTER_SLOTS = 4;
const SHOT_SLOTS = 3;
/** Sonar echoes per pulse (the rarest and the lairs first). */
const SONAR_ECHOES = 7;
/** The ending theme plays this long after 'quest:ending', then free play's scores return. */
const ENDING_SECONDS = 150;
/** A button's click and a specific UI sound within this many seconds are one gesture. */
const UI_PAIR = 0.12;
/**
 * The lesser cues a story beat (a guardian's fall, a gate, a descent, a discovery, the Heart...)
 * shadows: in the same moment they only blur it (the tracker shows the new step anyway). Shadowed for
 * STORY_SHADOW s after the beat, and cut if they began within STORY_PAIR s before it.
 */
const LESSER: ReadonlySet<string> = new Set(['quest.step', 'tutorial.step', 'loop.unlock', 'ui.hint', 'guide.way', 'bestiary.page', 'bestiary.complete', 'reward.pouch', 'ui.card']);
const STORY_SHADOW = 2.5;
const STORY_PAIR = 0.2;

/** Without a biome (the title, the old world): a score per depth mood. */
const MOOD_SCORE: Record<MoodName, ScoreId> = { camp: 'camp', shallow: 'amberHollows', mid: 'crystalGeode', deep: 'obsidianAbyss' };
const MENU_SCREENS = new Set(['inventory', 'crafting', 'map', 'quests', 'bestiary', 'journal', 'board', 'settings', 'pause', 'summary']);
/** The sonar echoes climb with rarity on E F# G A B (written in D major like every cue: audio/harmony). */
const RARITY_PITCH: Record<string, number> = { common: 1, uncommon: 1.122, rare: 1.189, epic: 1.335, legendary: 1.498 };
const RARITY_RANK: Record<string, number> = { common: 0, uncommon: 1, rare: 2, epic: 3, legendary: 4 };

const NO_PARAMS: SfxParams = {};
const RESOLVED: Promise<void> = Promise.resolve();
const noop = (): void => {};
const finiteOr = (v: number, fallback: number): number => (Number.isFinite(v) ? v : fallback);

/** Stereo position (-1..1, times `width`) of a source at (dx, dz) from the ear, given the ear's right vector. */
export function panOf(dx: number, dz: number, rx: number, rz: number, width = 0.8): number {
  const h = Math.hypot(dx, dz);
  return h > 0.5 ? Math.max(-1, Math.min(1, (dx * rx + dz * rz) / h)) * width : 0;
}

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
  'mob:guardianDefeated', 'world:biome', 'world:stratum', 'quest:heartLit', 'quest:ending', 'player:died', 'player:damaged', 'camp:entered',
  'player:respawned', 'hazard:changed', 'guide:hint',
];

/** A guardian's theme opens on its call (the ostinato and the horn, no drums) for this long, then the fight. */
const GUARDIAN_CALL = 3.2;
const GUARDIAN_CALL_MIX: Readonly<LayerMix> = { bed: 0.85, motif: 1, tension: 1, combat: 0 };
const GUARDIAN_FIGHT_MIX: Readonly<LayerMix> = { bed: 0.7, motif: 0.85, tension: 0.75, combat: 1 };
/** After a biome change, another one within this many seconds must hold longer (a border walk never ping-pongs the score). */
const BIOME_RECENT = 15;
const BIOME_SETTLE_RECENT = 6;
/** The Heart relit, then the Dark Heart: the major sting holds the score at most this long before the fight's theme. */
const HEART_LIT_HOLD = 5;
/** The 'heartLit' sting resolves to D major (MusicScheduler.sting). */
const HEART_LIT_KEY = 62;

/** Events with a world position and no stereo of their own: placed round the listener. */
const PLACED_EVENTS: ReadonlySet<keyof GameEvents> = new Set<keyof GameEvents>(['world:rockfall', 'moths:startled', 'station:placed', 'player:placed', 'weapon:flash']);

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
  /** The biome the score was in when the arrival became pending (its border settle is no reason to forget it). */
  private pendingFrom: BiomeId | null = null;
  /** The ending theme plays from `endingAt` (after the last victory's sting) until `endingUntil`. */
  private endingAt = 0;
  private endingUntil = 0;
  private holdScoreUntil = 0;
  private quietAfterVictory = 0;
  private guardianEvent: { kind: string; heart: boolean; phase: number } | null = null;
  /** When the current guardian theme began (its call, then the fight). */
  private guardianSince = -Infinity;
  /** When the score last followed the explorer into another biome. */
  private biomeChangedAt = -Infinity;
  private wasLoading = false;
  // The beds and the features.
  private bedKey = '';
  private bedRecipe: BedRecipe | null = null;
  private clocks: ShotClock[] = [];
  private emitterClocks = new Map<EmitterKind, number>();
  private readonly wantLoops = new Map<EmitterKind, { level: number; pan: number; occlusion: number }>();
  private readonly heardScratch: Array<{ e: HeardEmitter; near: number; through: number; loud: number }> = [];
  private warned: Record<HazardName, number> = { cold: 0, gas: 0, heat: 0, dark: 0 };
  /** When LOOP last marked a hazard starting to hurt ('hazard:changed'). */
  private onsetAt: Record<HazardName, number> = { cold: -Infinity, gas: -Infinity, heat: -Infinity, dark: -Infinity };
  private sonarSeen = 0;
  private readonly echoes: Array<{ at: number; name: SfxName; params: SfxParams }> = [];
  private lastScreen = 'none';
  /** The last generic button click (it gives way to a specific UI sound of the same gesture). */
  private lastClick: { e: SfxVoice; at: number } | null = null;
  private lastSpecificUi = -Infinity;
  /** The Dark Heart's last beat (MOBS' 'guardian.heartbeat'). */
  private darkHeartAt = -Infinity;
  /** The last story beat, the lesser cues just played, and how many were shadowed (debug). */
  private storyAt = -Infinity;
  private readonly lesser: Array<{ e: SfxVoice; at: number }> = [];
  private shadowed = 0;
  /** How many times each sound has started (debug, tests). */
  private readonly playedCount = new Map<string, number>();
  /** The low-health heartbeat's next beat, and the last hazard warning (its own heartbeat). */
  private beatIn = 0;
  private hazardWarnedAt = -Infinity;
  /** Climbing's rhythm: the next grab, and which hand. */
  private climbIn = 0;
  private climbHand = false;
  // The cues follow the music's key (audio/harmony): semitones from D, and a victory's tonic major for a while.
  private keyShift = 0;
  private victoryKey: number | null = null;
  private victoryKeyUntil = 0;
  /** A guardian fell this moment: its fall rings the shard, so LOOP's shard cue stays quiet. */
  private guardianFellAt = -Infinity;

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
    /** Semitones the keyed cues move now; the guardian fight's phase the score plays. */
    key: number; phase: number;
    /** Live one-shot voices per category, and the feature loops sounding (their kinds). */
    categories: Record<VoiceCategory, number>; loops: EmitterKind[];
    /** The current deck's stem levels (bed, motif, tension, combat, sting), null without a score. */
    stems: Record<string, number> | null;
    /** How many times each sound has started so far, the score's sting notes, the lesser cues shadowed by a story beat. */
    played: Record<string, number>;
    stingNotes: number;
    shadowed: number;
  } {
    const live = this.live;
    const now = live?.ctx.currentTime ?? 0;
    const categories = { step: 0, creature: 0, blow: 0, mining: 0, ambient: 0, ui: 0, pickup: 0, echo: 0, other: 0 } as Record<VoiceCategory, number>;
    for (const cat of Object.keys(categories) as VoiceCategory[]) categories[cat] = this.voices.count(now, (e) => e.cat === cat);
    return {
      state: live?.ctx.state ?? 'none',
      sfxVoices: this.voices.size,
      musicVoices: live?.music.activeVoices ?? 0,
      mood: this.mood,
      time: now,
      score: live?.music.score ?? null,
      intensity: this.intensity.state,
      danger: this.intensity.danger,
      heat: this.intensity.heat,
      biome: this.biome,
      bed: this.bedKey,
      beds: live?.beds.size ?? 0,
      emitters: live ? [...live.emitters.values()].filter((l) => l.live).length : 0,
      decks: live?.music.deckCount ?? 0,
      key: this.keyShift,
      phase: live?.music.scheduler?.phase ?? 1,
      categories,
      loops: live ? [...live.emitters.entries()].filter(([, l]) => l.live).map(([k]) => k) : [],
      stems: live?.music.levels() ?? null,
      played: Object.fromEntries(this.playedCount),
      stingNotes: live?.music.played.sting ?? 0,
      shadowed: this.shadowed,
    };
  }

  /**
   * The score's beat grid: seconds until its next beat and the beat's length (s), for a sound that
   * wants to fall on the music's beat (the Dark Heart's heartbeat); null without a running score.
   */
  nextBeat(): { in: number; beat: number; bpm: number } | null {
    const live = this.live;
    const s = live?.music.scheduler;
    if (!live || !s || live.ctx.state !== 'running') return null;
    const now = live.ctx.currentTime;
    const at = s.beatAfter(now);
    return Number.isFinite(at) ? { in: Math.max(0, at - now), beat: s.beatDur, bpm: s.score.bpm } : null;
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
      let req = sfxForEvent(type, payload);
      // A flash where a thrown thing landed, metres away, is a flare catching (a Flash Charge bursts at the explorer).
      if (type === 'weapon:flash' && req?.name === 'weapon.flash' && this.scene) {
        const p = payload as GameEvents['weapon:flash'] & { kind?: string };
        if (p.kind === undefined && Math.hypot(p.x - this.scene.lx, p.z - this.scene.lz) > 3) req = { name: 'use.flare', params: req.params };
      }
      // A guardian's fall rings its shard (MOBS' voice): the shard taken in the same moment stays quiet.
      const echoOfFall = req?.name === 'loop.shard' && (this.live.ctx.currentTime - this.guardianFellAt) < 1.5;
      if (req && !echoOfFall) this.play(req.name, this.placed(type, payload, req.params));
      if (type === 'player:damaged') this.muffle(req?.params.intensity ?? 0.5);
      if (type === 'player:died') this.duckMusic(4);
    } catch (err) {
      console.warn(`[audio] "${String(type)}" handler failed`, err);
    }
  }

  /** Events with a world position and no stereo of their own are placed round the listener. */
  private placed<K extends keyof GameEvents>(type: K, payload: GameEvents[K], params: SfxParams): SfxParams {
    if (params.pan !== undefined || !PLACED_EVENTS.has(type)) return params;
    const p = payload as unknown as { x?: number; y?: number; z?: number };
    const sc = this.scene;
    if (!sc || !Number.isFinite(p.x) || !Number.isFinite(p.z)) return params;
    const pan = panOf(p.x! - sc.lx, p.z! - sc.lz, sc.rx, sc.rz, 0.8);
    return pan !== 0 ? { ...params, pan } : params;
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
        this.guardianEvent = { kind: String(p.kind), heart: p.kind === 'heartOfDark', phase: 1 };
        break;
      case 'mob:guardianPhase': {
        // The fight tightens: a drum roll into a brass stab, and the theme's next phase from the next beat.
        const phase = Number(p.phase) || 1;
        if (this.guardianEvent) this.guardianEvent.phase = phase;
        this.live?.music.setPhase(phase);
        this.live?.music.sting('phase', now);
        break;
      }
      case 'mob:guardianReset':
        this.guardianEvent = null;
        break;
      case 'mob:guardianDefeated': {
        this.guardianEvent = null;
        // A guardian falls on a major chord; the Dark Heart on the Heart's own (the light comes back).
        // The biome's score returns after a breath.
        const heart = p.kind === 'heartOfDark' || p.shard === 'heart';
        this.guardianFellAt = now;
        if (this.live) {
          const score = this.live.music.score;
          const len = this.live.music.sting(heart ? 'heartLit' : 'victory', now);
          this.holdScoreUntil = now + Math.max(4, len);
          this.quietAfterVictory = now + len + 3;
          // The cues of this moment (the shard's ring, the rewards) sound in the victory's major key.
          this.victoryKey = heart ? HEART_LIT_KEY : score ? SCORES[score].tonic : null;
          this.victoryKeyUntil = this.quietAfterVictory;
          this.followKey(now);
        }
        this.intensity.reset();
        break;
      }
      case 'quest:heartLit':
        // The twelve shards relight the Heart: its major chord speaks before the Dark Heart answers.
        if (this.live) {
          const len = this.live.music.sting('heartLit', now);
          this.holdScoreUntil = now + Math.min(HEART_LIT_HOLD, Math.max(2, len));
          this.victoryKey = HEART_LIT_KEY;
          this.victoryKeyUntil = now + len + 2;
          this.followKey(now);
        }
        break;
      case 'world:biome':
        if (p.first) {
          this.pendingArrival = p.biome as BiomeId;
          this.pendingFrom = this.biome;
        }
        break;
      case 'world:stratum':
        this.stratum = Number(p.stratum) || this.stratum;
        this.intensity.reset();
        // The new stratum's first biome is taken at once, not after a border's settle.
        this.biome = null;
        this.candidate = null;
        this.biomeChangedAt = -Infinity;
        break;
      case 'quest:ending':
        // The ending's theme comes in once the last victory's sting has spoken.
        this.endingAt = Math.max(now, this.holdScoreUntil);
        this.endingUntil = this.endingAt + ENDING_SECONDS;
        break;
      case 'player:died':
      case 'player:respawned':
      case 'camp:entered':
        this.intensity.reset();
        break;
      case 'hazard:changed':
        if (p.kind === 'cold' || p.kind === 'gas' || p.kind === 'heat' || p.kind === 'dark') this.onsetAt[p.kind] = now;
        break;
      case 'guide:hint':
        if (typeof p.id === 'string' && p.id.startsWith('hazard:')) this.hazardWarnedAt = now;
        break;
    }
  }

  private play(name: SfxName, paramsIn: SfxParams, at?: number): void {
    const live = this.live;
    if (!live || this.backgrounded) return;
    // The cues written in D major sound in the music's key (audio/harmony).
    const params = this.keyShift !== 0 && paramsIn.transpose === undefined && KEYED.has(name) ? { ...paramsIn, transpose: this.keyShift } : paramsIn;
    // While the first gesture is resuming the context, only the UI sound that caused it may queue.
    if (live.ctx.state !== 'running' && !(this.resuming && name.startsWith('ui.'))) return;
    const d = SFX[name];
    const now = live.ctx.currentTime;
    // A button's generic click gives way to the specific sound of the same gesture (a page turned,
    // the bag, the hotbar), whichever of the two the page dispatches first.
    const specificUi = name.startsWith('ui.') && name !== 'ui.click' && name !== 'ui.error';
    if (name === 'ui.click' && now - this.lastSpecificUi < UI_PAIR) return;
    if (specificUi) {
      this.lastSpecificUi = now;
      const click = this.lastClick;
      if (click && now - click.at < UI_PAIR) {
        click.e.v.kill(now, 0.015);
        this.voices.remove(click.e);
        this.lastClick = null;
      }
    }
    if (LESSER.has(name) && now - this.storyAt < STORY_SHADOW) {
      this.shadowed++;
      return;
    }
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
      const entry: SfxVoice = { v, cat };
      this.voices.add(entry, now, v.end, d.priority);
      this.playedCount.set(name, (this.playedCount.get(name) ?? 0) + 1);
      if (name === 'guardian.heartbeat') this.darkHeartAt = now;
      if (name === 'ui.click') this.lastClick = { e: entry, at: now };
      if (LESSER.has(name)) {
        this.lesser.push({ e: entry, at: now });
        if (this.lesser.length > 4) this.lesser.shift();
      }
      if (d.priority >= 4 && d.bus === 'sfx') {
        // A story beat: the lesser cues of the same moment step aside.
        this.storyAt = now;
        for (const l of this.lesser) {
          if (now - l.at > STORY_PAIR) continue;
          l.e.v.kill(now, 0.04);
          this.voices.remove(l.e);
          this.shadowed++;
        }
        this.lesser.length = 0;
      }
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
    this.followBiome(scene, dt, now);
    this.directScore(live, now, s, scene);
    this.followKey(now);
    live.music.setMix(this.scoreMix(live, now, scene), now);
    // Ducking: story beats, and the score and beds easing back under a dense fight's voices.
    const dense = densityDuck(this.voices.count(now, (e) => e.cat === 'creature' || e.cat === 'blow'));
    live.ducks.music.set(Math.min(this.ducker.target('music', now), dense.music), now);
    live.ducks.ambience.set(Math.min(this.ducker.target('ambience', now), dense.ambience), now);
    // The lantern.
    const lanternOn = s.lanternLit && !this.paused && !s.inMenu;
    live.lantern.setLevel(lanternOn ? LANTERN_LEVEL * (0.35 + 0.65 * Math.sqrt(saturate(s.lanternFuel))) : 0, now, dt);
    // The beds: the camp's, the biome's (crossfading), or a cave bed by depth without a probe.
    this.beds(live, now, dt, s, scene);
    this.features(live, now, dt, scene);
    this.hazards(live, now, dt, scene);
    this.sonar(now, scene);
    this.climb(dt, scene);
    this.heartbeat(dt, now, s, scene);
    this.menus(scene);
    // The space: how open it is round the ear, and the biome's surfaces (halls ring, earth swallows).
    live.reverb.set((0.3 + 0.9 * saturate(s.openness)) * (this.bedRecipe?.space ?? 1), now);
  }

  private followBiome(scene: AudioScene | null, dt: number, now: number): void {
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
    // The first biome of a stratum (or after a load) is taken at once; borders must settle, longer
    // when the score changed only a moment ago (walking along a border never ping-pongs it).
    const settle = now - this.biomeChangedAt < BIOME_RECENT ? BIOME_SETTLE_RECENT : BIOME_SETTLE;
    if (this.biome === null || this.candidateFor >= settle || here === null) {
      if (this.biome !== null && here !== null) this.biomeChangedAt = now;
      this.biome = here;
      this.candidate = null;
    }
  }

  /** The key the cues follow: a victory's tonic major for a while, else the playing score's major key. */
  private followKey(now: number): void {
    const id = this.live?.music.score ?? null;
    if (this.victoryKey !== null && now < this.victoryKeyUntil) this.keyShift = shiftTo(this.victoryKey);
    else if (id) this.keyShift = shiftTo(majorKeyOf(SCORES[id]));
    // No score (a breather between decks, a load): the last key holds.
  }

  /** The layers the score plays: a guardian's call then its fight; otherwise the danger's mix. */
  private scoreMix(live: Live, now: number, scene: AudioScene | null): Readonly<LayerMix> {
    const id = live.music.score;
    const fighting = scene ? scene.guardian !== null : this.guardianEvent !== null;
    if (id && isGuardianScore(id) && fighting) return now - this.guardianSince < GUARDIAN_CALL ? GUARDIAN_CALL_MIX : GUARDIAN_FIGHT_MIX;
    return this.intensity.layerMix();
  }

  /** Which score plays now, and how it comes in. */
  private directScore(live: Live, now: number, s: AudioWorldState, scene: AudioScene | null): void {
    const music = live.music;
    // The depth mood: the old world's scores (and the stats) follow it.
    this.mood = moodFor(s.depth, s.atCamp, this.mood);
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
    if (now >= this.endingAt && now < this.endingUntil) {
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
    } else if (!scene || !scene.strata) {
      // The old hand-made world (or no game attached): a score per depth mood.
      id = MOOD_SCORE[this.mood];
    } else {
      // A stratum has just swapped in and its biome is not known yet: keep a biome score, else wait.
      id = music.score && (BIOME_SCORES as readonly string[]).includes(music.score) ? music.score : null;
    }
    if (this.wasLoading && id !== null) {
      fade = { fadeIn: 1.2, fadeOut: 0.5, delay: 0.8 };
      this.wasLoading = false;
    }
    // After a victory the lair falls quiet a breath before the biome's score; the ending rises out of the chord.
    if (id === 'ending' && now < this.quietAfterVictory) fade = { fadeIn: 1.8, fadeOut: 2, delay: 0.3 };
    else if (now < this.quietAfterVictory && id !== music.score) fade = { ...fade, delay: Math.max(fade.delay, this.quietAfterVictory - now) };
    if (id !== music.score) {
      music.play(id, now, fade);
      if (id && isGuardianScore(id)) this.guardianSince = now + fade.delay;
    }
    // A guardian's phase (the probe's GuardianState is authoritative; the events' copy otherwise).
    if (fight && id && isGuardianScore(id)) {
      if ('phases' in fight) music.setPhase(fight.phase, fight.phases);
      else music.setPhase(fight.phase);
    }
    // A biome's first visit: its motif stated plainly once its deck is in (after the camp, for the
    // starter biome the camp sits in); a fight or another biome first forgets it.
    if (this.pendingArrival && music.score === this.pendingArrival) {
      music.sting('arrival', now + fade.delay);
      this.pendingArrival = null;
    } else if (this.pendingArrival && (fight || (this.biome !== null && this.biome !== this.pendingArrival && this.biome !== this.pendingFrom))) this.pendingArrival = null;
  }

  private beds(live: Live, now: number, dt: number, s: AudioWorldState, scene: AudioScene | null): void {
    const menuMode = scene?.mode === 'menu';
    let key: string;
    // Under the loading screen the cave falls silent (the next one is another place).
    if (scene?.loading) key = '';
    else if (s.atCamp || menuMode) key = 'camp';
    else if (this.biome) key = this.biome;
    // A stratum has just swapped in and its biome comes on the next tick: the bed holds (or stays silent).
    else if (scene?.strata) key = this.bedKey;
    // The old world: a bed per depth mood.
    else key = 'depth';
    if (key !== this.bedKey) {
      this.bedKey = key;
      this.bedRecipe = key ? bedRecipeOf(key, this.mood) : null;
      this.clocks = this.bedRecipe ? this.bedRecipe.shots.map((shot) => ({ name: shot.name, next: this.interval(shot.every) * 0.5 })) : [];
    }
    const recipe = this.bedRecipe;
    if (key && recipe && !live.beds.has(key)) live.beds.set(key, new BiomeBed(live.ctx, live.graph.noise, live.graph.buses.ambience.input, recipe, { to: live.graph.buses.ambience.wet, amount: 0.35 }));
    const depth01 = smoothstep(45, 145, s.depth % 90 + 45);
    const k = 1 - Math.exp(-dt / 2.2);
    for (const [bk, bed] of live.beds) {
      bed.target = bk === key ? 1 : 0;
      bed.weight += (bed.target - bed.weight) * k;
      if (bed.target === 0 && bed.weight < 0.002) bed.weight = 0;
      bed.update(now, dt, BED_LEVEL, depth01, saturate(s.openness));
      if (bed.target === 0 && bed.weight === 0 && !bed.audible) {
        bed.stop();
        live.beds.delete(bk);
      }
    }
  }

  /** Positional loops near the listener: the nearest few emitters, panned, by distance. */
  private features(live: Live, now: number, dt: number, scene: AudioScene | null): void {
    const want = this.wantLoops;
    want.clear();
    if (scene && !this.paused && !scene.loading) {
      // The loudest first (four quiet crystals never take every slot from the river): the loops within
      // their slots, the one-shots within theirs.
      const heard = this.heardScratch;
      heard.length = 0;
      for (const e of scene.emitters) {
        const def = EMITTERS[e.kind];
        const near = Math.max(0, 1 - e.d / e.range);
        if (near <= 0) continue;
        // Behind rock a feature is quieter as well as darker.
        const through = 1 - 0.55 * saturate(e.occlusion);
        const loud = (def.level > 0 ? def.level : (def.shot?.gain ?? 0) * 0.25) * e.strength * Math.pow(near, 1.5) * through;
        heard.push({ e, near, through, loud });
      }
      heard.sort((a, b) => b.loud - a.loud);
      let loops = 0;
      let shots = 0;
      for (const { e, near, through } of heard) {
        const def = EMITTERS[e.kind];
        const pan = panOf(e.x - scene.lx, e.z - scene.lz, scene.rx, scene.rz, 0.85);
        if (def.level > 0 && loops < EMITTER_SLOTS) {
          loops++;
          want.set(e.kind, { level: def.level * e.strength * Math.pow(near, 1.5) * through, pan, occlusion: e.occlusion });
        }
        if (def.shot && shots < SHOT_SLOTS) {
          shots++;
          this.featureShot(e.kind, def.shot, Math.pow(near, 0.8) * e.strength * through, pan, dt);
        }
      }
    } else if (!scene) {
      // No probe: the campfire by the old landmark distance.
      const fire = this.world.nearFire;
      if (fire > 0) want.set('fire', { level: 0.45 * Math.pow(saturate(fire), 1.4), pan: 0, occlusion: 0 });
    }
    for (const [kind, w] of want) {
      let layer = live.emitters.get(kind);
      if (layer === undefined) {
        const made = emitterLayer(kind, live.ctx, live.graph.noise, live.graph.buses.ambience.input, { to: live.graph.buses.ambience.wet, amount: 0.5 });
        if (!made) continue;
        layer = made;
        live.emitters.set(kind, layer);
      }
      layer.setLevel(w.level, now, dt);
      layer.setPan(w.pan, now);
      layer.setOcclusion(w.occlusion, now);
    }
    for (const [kind, layer] of live.emitters) {
      if (want.has(kind)) continue;
      layer.setLevel(0, now, dt);
      if (!layer.live) live.emitters.delete(kind);
    }
  }

  /** A feature's one-shot on its own clock (`k` 0..1: how near and how strong), placed with it. */
  private featureShot(kind: EmitterKind, shot: { name: SfxName; every: number; gain: number }, k: number, pan: number, dt: number): void {
    if (k < 0.06) return;
    const next = (this.emitterClocks.get(kind) ?? this.interval(shot.every) * 0.3) - dt;
    if (next > 0) {
      this.emitterClocks.set(kind, next);
      return;
    }
    this.play(shot.name, { pan, gain: Math.min(1, shot.gain * k), pitch: this.rng.range(0.85, 1.2) });
    this.emitterClocks.set(kind, this.interval(shot.every));
  }

  /** The hazard layer follows the meter; warnings as it passes half and nearly full. */
  private hazards(live: Live, now: number, dt: number, scene: AudioScene | null): void {
    const kind = scene?.hazard ?? null;
    const level = scene?.hazardLevel ?? 0;
    live.hazard.update(this.paused ? null : kind, level, now, dt);
    // LOOP warns as a meter passes 40 % ('guide:hint', in the hazard's voice) and marks the onset of
    // the hurt ('hazard:changed'); the AudioSystem adds the strong warning near full (unless the onset
    // has just spoken), re-armed once the meter has eased below 35 %.
    for (const k of ['cold', 'gas', 'heat', 'dark'] as const) {
      const l = k === kind ? level : 0;
      if (l >= 0.85 && this.warned[k] === 0) {
        this.warned[k] = 2;
        if (now - this.onsetAt[k] > 1.2) {
          this.play(`hazard.${k}`, { intensity: 1 });
          this.hazardWarnedAt = now;
        }
      } else if (l < 0.35) this.warned[k] = 0;
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
      const pan = panOf(dx, dz, scene.rx, scene.rz, 0.8);
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

  /**
   * Climbing a ladder or a rope: a hand over hand about every metre of climb (faster climbing, quicker
   * grabs), up or down; nothing while the explorer hangs still.
   */
  private climb(dt: number, scene: AudioScene | null): void {
    const speed = Math.abs(scene?.climbSpeed ?? 0);
    if (!scene?.climbing || speed < 0.4 || this.paused) {
      this.climbIn = 0;
      return;
    }
    this.climbIn -= dt;
    if (this.climbIn > 0) return;
    this.climbIn = Math.max(0.28, Math.min(0.6, 1 / speed));
    // The two hands sound a little apart; climbing down is a shade lower.
    this.climbHand = !this.climbHand;
    const pitch = (this.climbHand ? 1.04 : 0.96) * (scene.climbSpeed < 0 ? 0.92 : 1);
    this.play(scene.climbing === 'rope' ? 'climb.rope' : 'climb.ladder', { pitch, gain: 0.7 + 0.3 * Math.min(1, speed / 3.2) });
  }

  /**
   * Low health (under 30 %): the explorer's heart, quickening from 66 to 104 beats a minute as it
   * drops; never at camp or in a menu, and quiet while a hazard warning (its own heartbeat) speaks.
   */
  private heartbeat(dt: number, now: number, s: AudioWorldState, scene: AudioScene | null): void {
    const hp = scene?.health ?? 1;
    if (!scene || hp >= LOW_HEALTH || hp <= 0 || s.atCamp || s.inMenu || this.paused || scene.mode !== 'playing' || now - this.hazardWarnedAt < 2.5) {
      this.beatIn = Math.min(this.beatIn, 0.3);
      return;
    }
    this.beatIn -= dt;
    if (this.beatIn > 0) return;
    const fear = 1 - hp / LOW_HEALTH;
    this.beatIn = 60 / (66 + 38 * fear);
    this.play('player.heartbeat', { intensity: fear, gain: 0.55 + 0.45 * fear });
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
    const recipe = this.bedRecipe;
    if (!recipe) return;
    for (let i = 0; i < this.clocks.length; i++) {
      const c = this.clocks[i];
      c.next -= dt;
      if (c.next > 0) continue;
      const shot = recipe.shots[i];
      if (!shot) continue;
      // The Heart's chamber: the Dark Heart's own beat (MOBS' voice) replaces the bed's.
      if (shot.name === 'amb.heartbeat' && (this.live?.ctx.currentTime ?? 0) - this.darkHeartAt < 4) continue;
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

