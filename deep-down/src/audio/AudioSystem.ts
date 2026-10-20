import type { EventBus } from '../core/events';
import type { IdleEvents } from '../idle/bus';
import { lerp, saturate, smoothstep } from '../core/math';
import { Rng } from '../core/rng';
import { DEFAULT_SETTINGS } from '../save/types';
import { AUDIBLE_EVENTS, SoundCues, type SfxRequest } from './eventMap';
import { busTarget, createMixGraph, type MixGraph } from './graph';
import { CampfireLoop, CaveBed, CrystalHum, LanternLoop, ParamTarget } from './layers';
import { MusicPlayer } from './MusicPlayer';
import { SFX, playSfx, type BusName, type SfxName, type SfxParams } from './sfx';
import type { SynthTarget, Voice } from './synth';
import { biomeMood, moodFor, volumeToGain, type MoodName } from './theory';
import { RhythmLayers } from './drums';
import type { AudioVolumes, AudioWorldState, UiSound } from './types';
import { RateGate, VoiceLimiter } from './voices';

export type { AudioVolumes, AudioWorldState, UiSound } from './types';
export { renderSfxOffline } from './offline';

/** One-shot polyphony (effects + ambience one-shots); the score adds MUSIC_VOICES on top. */
export const SFX_VOICES = 18;
/** Layer levels and filters are pushed at this rate, not every frame. */
const CONTROL_PERIOD = 1 / 15;
const SEED = 0xdeedd0;

// Mix levels of the continuous layers (before category volume).
const LANTERN_LEVEL = 0.1;
const CAMPFIRE_LEVEL = 0.45;
const CRYSTAL_LEVEL = 0.07;

// Category ducking.
const PAUSE_MUSIC = 0.45;
const PAUSE_AMBIENCE = 0.3;
const MENU_AMBIENCE = 0.5;
const DEATH_MUSIC = 0.25;

/** Longest frame step the timers accept, so a long hitch does not fire everything at once. */
const MAX_STEP = 0.25;
/** Spacing of resume retries from update() while the page holds a fresh user activation. */
const RESUME_RETRY = 0.5;

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

/** Everything that exists only once an AudioContext has been created. */
interface Live {
  ctx: AudioContext;
  graph: MixGraph;
  targets: Record<BusName, SynthTarget>;
  music: MusicPlayer;
  rhythm: RhythmLayers;
  lantern: LanternLoop;
  campfire: CampfireLoop;
  cave: CaveBed;
  crystal: CrystalHum;
  reverb: ParamTarget;
  meter: { node: AnalyserNode; data: Float32Array<ArrayBuffer> } | null;
}

/**
 * The game's audio, fully synthesized with Web Audio: IdleEvent-driven effects on musical ladders,
 * continuous layers (lantern, camp fire at the surface, cave bed, crystal hum, drips, rumbles) and a
 * generative score.
 *
 * Nothing exists until unlock() is called from a user gesture (mobile autoplay policy).
 * Before that, and wherever Web Audio is missing, every method is a safe no-op.
 */
export class AudioSystem {
  private live: Live | null = null;
  private readonly offs: Array<() => void> = [];
  private readonly rng = new Rng(SEED ^ 0xa0d10);
  private readonly rand = (): number => this.rng.next();
  private readonly voices = new VoiceLimiter<Voice>(SFX_VOICES, (v) => v.kill(this.live?.ctx.currentTime ?? 0));
  private readonly gate = new RateGate();
  private volumes: AudioVolumes = {
    master: DEFAULT_SETTINGS.masterVolume,
    music: DEFAULT_SETTINGS.musicVolume,
    sfx: DEFAULT_SETTINGS.sfxVolume,
    ambience: DEFAULT_SETTINGS.ambienceVolume,
  };
  /** Last good world state: a non-finite field in a frame keeps its previous value. */
  private readonly world: AudioWorldState = { depth: 0, openness: 0.3, nearCrystal: 0, nearFire: 0, inMenu: false };
  /** The ladders (break pentatonic, purchase arpeggio, combo steps). */
  private readonly cues = new SoundCues();
  private readonly reqs: SfxRequest[] = [];
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
  private dripIn = 3;
  private rumbleIn = 30;
  private musicDuckUntil = 0;

  constructor(private readonly bus: EventBus<IdleEvents>) {
    for (const type of AUDIBLE_EVENTS) this.listen(type);
  }

  /** True once the AudioContext exists and is running. */
  get unlocked(): boolean {
    return this.live !== null && this.live.ctx.state === 'running';
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

      this.mood = s.music && s.biome !== undefined && s.depth >= 4 ? biomeMood(s.biome, s.music) : moodFor(s.depth, s.depth < 4, this.mood);
      live.music.plucks = s.plucks ?? true;
      live.music.update(now, this.mood);
      if (!this.paused && !s.inMenu) live.rhythm.update(now, dt, s.music?.bpm ?? 84, s.drums ?? 0, s.boss ?? 0);
      else live.rhythm.update(now, dt, s.music?.bpm ?? 84, 0, 0);
      if (this.musicDuckUntil > 0 && now >= this.musicDuckUntil) {
        this.musicDuckUntil = 0;
        this.applyGains(0.8);
      }
      this.control += dt;
      if (this.control >= CONTROL_PERIOD) {
        this.controlLayers(live, now, this.control, s);
        this.control = 0;
      }
      if (!this.paused && !s.inMenu) this.ambientOneShots(dt, s);
    } catch (err) {
      console.warn('[audio] update failed', err);
    }
  }

  ui(name: UiSound): void {
    this.play(`ui.${name}`, NO_PARAMS);
  }

  /** Play a one-shot now (cues the event map does not cover: coin landings, ready pings). */
  play(name: SfxName, params: SfxParams = NO_PARAMS): void {
    this.start(name, params);
  }

  /** Duck the music for `seconds` under a stinger (−4 dB) or a T3+ moment. */
  duck(seconds: number): void {
    this.duckMusic(seconds);
  }

  /** Duck music and ambience and silence the lantern while paused. */
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
      this.voices.clear((v) => v.kill(now));
      for (const layer of [live.lantern, live.campfire, live.cave, live.crystal]) layer.stop();
    } finally {
      live.ctx.close().catch(noop);
    }
  }

  /** Debug/test snapshot. */
  stats(): { state: string; sfxVoices: number; musicVoices: number; mood: MoodName | null; time: number } {
    const live = this.live;
    return {
      state: live?.ctx.state ?? 'none',
      sfxVoices: this.voices.size,
      musicVoices: live?.music.activeVoices ?? 0,
      mood: this.mood,
      time: live?.ctx.currentTime ?? 0,
    };
  }

  /** Current output peak in [0, 1] (debug/tests). Taps the master output on first use. */
  meter(): number {
    const live = this.live;
    if (!live) return 0;
    if (!live.meter) {
      const node = live.ctx.createAnalyser();
      node.fftSize = 2048;
      live.graph.compressor.connect(node);
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
    w.nearCrystal = finiteOr(s.nearCrystal, w.nearCrystal);
    w.nearFire = finiteOr(s.nearFire, w.nearFire);
    w.inMenu = s.inMenu;
    w.biome = s.biome;
    w.music = s.music;
    w.drums = finiteOr(s.drums ?? 0, 0);
    w.boss = finiteOr(s.boss ?? 0, 0);
    w.plucks = s.plucks;
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
      this.live = {
        ctx,
        graph,
        targets,
        music: new MusicPlayer(targets.music, SEED),
        rhythm: new RhythmLayers((name, t, gain) => {
          try {
            playSfx(targets.music, name, { gain }, t);
          } catch (err) {
            console.warn('[audio] rhythm', err);
          }
        }),
        lantern: new LanternLoop(ctx, noise, buses.sfx.input),
        campfire: new CampfireLoop(ctx, noise, buses.ambience.input),
        cave: new CaveBed(ctx, noise, buses.ambience.input, 1.5),
        // The hum is the one bed that gets reverb: it should ring in the chamber.
        crystal: new CrystalHum(ctx, noise, buses.ambience.input, 0.6, { to: buses.ambience.wet, amount: 0.5 }),
        reverb: new ParamTarget(graph.reverbReturn.gain, 0.5, 0.01),
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

  private listen<K extends keyof IdleEvents>(type: K): void {
    this.offs.push(this.bus.on(type, (payload) => this.onEvent(type, payload)));
  }

  private onEvent<K extends keyof IdleEvents>(type: K, payload: IdleEvents[K]): void {
    if (!this.live) return;
    try {
      for (const r of this.cues.request(type, payload, this.live.ctx.currentTime, this.reqs)) this.start(r.name, r.params);
      // Stingers duck the music (SPEC §10.10: −4 dB under stingers).
      if (type === 'biome:reveal' || type === 'seal:break') this.duckMusic(3);
    } catch (err) {
      console.warn(`[audio] "${String(type)}" handler failed`, err);
    }
  }

  private start(name: SfxName, params: SfxParams): void {
    const live = this.live;
    if (!live || this.backgrounded) return;
    // While the first gesture is resuming the context, only the UI sound that caused it may queue.
    if (live.ctx.state !== 'running' && !(this.resuming && name.startsWith('ui.'))) return;
    const d = SFX[name];
    const now = live.ctx.currentTime;
    if (!this.gate.allow(name, now, d.minGap)) return;
    if (!this.voices.admit(now, d.priority)) return;
    try {
      const v = playSfx(live.targets[d.bus], name, params, now + 0.005);
      this.voices.add(v, now, v.end, d.priority);
    } catch (err) {
      console.warn(`[audio] failed to play "${name}"`, err);
    }
  }

  private duckMusic(seconds: number): void {
    const live = this.live;
    if (!live) return;
    this.musicDuckUntil = live.ctx.currentTime + seconds;
    this.applyGains(0.3);
  }

  private controlLayers(live: Live, now: number, dt: number, s: AudioWorldState): void {
    const depth01 = smoothstep(45, 145, s.depth);
    const open = saturate(s.openness);
    const lanternOn = !this.paused && !s.inMenu;
    live.lantern.setLevel(lanternOn ? LANTERN_LEVEL : 0, now, dt);
    live.campfire.setLevel(CAMPFIRE_LEVEL * Math.pow(saturate(s.nearFire), 1.4), now, dt);
    live.crystal.setLevel(CRYSTAL_LEVEL * Math.pow(saturate(s.nearCrystal), 1.5), now, dt);
    // The cave bed gets darker (lower cutoff), deeper (more sub) and a touch louder with depth;
    // the air band follows how open the space is.
    live.cave.setLevel(lerp(0.35, 0.55, depth01) * (s.depth < 4 ? 0.6 : 1), now, dt);
    live.cave.shape(lerp(340, 130, depth01), (0.03 + 0.2 * open) * (1 - 0.3 * depth01), 0.02 + 0.1 * depth01, now);
    live.reverb.set(0.3 + 0.9 * open, now);
  }

  private ambientOneShots(dt: number, s: AudioWorldState): void {
    const depth01 = smoothstep(45, 145, s.depth);
    this.dripIn -= dt;
    if (this.dripIn <= 0) {
      this.dripIn = this.interval(s.depth < 4 ? 10 : lerp(6.5, 3.2, saturate(s.openness)));
      this.play('amb.drip', { pan: this.rng.range(-0.85, 0.85), pitch: lerp(1.1, 0.75, depth01), gain: this.rng.range(0.5, 1) });
    }
    this.rumbleIn -= dt;
    if (this.rumbleIn <= 0) {
      this.rumbleIn = this.interval(lerp(90, 35, depth01));
      if (s.depth >= 4) this.play('amb.rumble', { pan: this.rng.range(-0.7, 0.7), gain: lerp(0.6, 1, depth01) });
    }
  }

  /** Random wait around `mean` seconds: exponential spread, but never a rapid-fire repeat. */
  private interval(mean: number): number {
    return mean * (0.4 - 0.6 * Math.log(1 - this.rng.next()));
  }
}
