import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { B } from '../../src/config/blocks';
import { EventBus, type GameEvents } from '../../src/core/events';
import { AudioSystem, SFX_VOICES, type AudioWorldState } from '../../src/audio/AudioSystem';
import { MUSIC_PRIORITY, MUSIC_VOICES } from '../../src/audio/MusicPlayer';
import { MusicScheduler, type MusicNote } from '../../src/audio/MusicScheduler';
import { VoiceLimiter } from '../../src/audio/voices';

// A minimal stand-in for the Web Audio API, strict where browsers are strict (non-finite
// values throw, sources start once), so the AudioSystem runs its real graph code in Node.

class FakeParam {
  private v: number;

  constructor(v: number) {
    this.v = v;
  }

  get value(): number {
    return this.v;
  }

  set value(x: number) {
    this.v = finite(x);
  }

  setValueAtTime(v: number, t: number): this {
    finite(v, t);
    return this;
  }

  linearRampToValueAtTime(v: number, t: number): this {
    finite(v, t);
    return this;
  }

  exponentialRampToValueAtTime(v: number, t: number): this {
    if (finite(v, t) === 0) throw new RangeError('exponential ramp to zero');
    return this;
  }

  setTargetAtTime(v: number, t: number, tc: number): this {
    finite(v, t, tc);
    return this;
  }

  cancelScheduledValues(t: number): this {
    finite(t);
    return this;
  }
}

function finite(...xs: number[]): number {
  for (const x of xs) if (!Number.isFinite(x)) throw new TypeError(`non-finite value ${x}`);
  return xs[0];
}

class FakeNode {
  readonly gain = new FakeParam(1);
  readonly frequency = new FakeParam(350);
  readonly Q = new FakeParam(1);
  readonly pan = new FakeParam(0);
  readonly playbackRate = new FakeParam(1);
  readonly threshold = new FakeParam(-24);
  readonly knee = new FakeParam(30);
  readonly ratio = new FakeParam(12);
  readonly attack = new FakeParam(0.003);
  readonly release = new FakeParam(0.25);
  type = '';
  buffer: unknown = null;
  loop = false;
  fftSize = 2048;
  onended: (() => void) | null = null;
  connected = false;
  started = false;

  connect<T>(dest: T): T {
    this.connected = true;
    return dest;
  }

  disconnect(): void {
    this.connected = false;
  }

  start(): void {
    if (this.started) throw new Error('InvalidStateError: start() called twice');
    this.started = true;
  }

  stop(): void {
    if (!this.started) throw new Error('InvalidStateError: stop() before start()');
  }

  getFloatTimeDomainData(): void {}
}

class FakeAudioContext {
  /** Whether the page may start audio (user activation in a real browser). */
  static allowed = true;
  static last: FakeAudioContext | null = null;
  state: 'suspended' | 'running' | 'closed';
  currentTime = 0;
  readonly sampleRate = 8000;
  readonly destination = new FakeNode();
  readonly nodes: FakeNode[] = [];
  resumeCalls = 0;

  constructor() {
    this.state = FakeAudioContext.allowed ? 'running' : 'suspended';
    FakeAudioContext.last = this;
  }

  resume(): Promise<void> {
    this.resumeCalls++;
    // Web Audio spec: a context that is not allowed to start leaves the promise pending.
    if (!FakeAudioContext.allowed) return new Promise(() => {});
    this.state = 'running';
    return Promise.resolve();
  }

  suspend(): Promise<void> {
    this.state = 'suspended';
    return Promise.resolve();
  }

  close(): Promise<void> {
    this.state = 'closed';
    return Promise.resolve();
  }

  createBuffer(channels: number, length: number, sampleRate: number) {
    const data = Array.from({ length: channels }, () => new Float32Array(length));
    return { numberOfChannels: channels, length, sampleRate, duration: length / sampleRate, getChannelData: (c: number) => data[c] };
  }

  private node(): FakeNode {
    const n = new FakeNode();
    this.nodes.push(n);
    return n;
  }

  createGain = () => this.node();
  createBiquadFilter = () => this.node();
  createOscillator = () => this.node();
  createBufferSource = () => this.node();
  createStereoPanner = () => this.node();
  createConvolver = () => this.node();
  createDynamicsCompressor = () => this.node();
  createAnalyser = () => this.node();
}

const STATE: AudioWorldState = {
  depth: 95, atCamp: false, openness: 0.6, lanternFuel: 0.12, lanternLit: true,
  nearCrystal: 0.4, nearFire: 0.3, playerSpeed: 3, inMenu: false,
};

const at = { x: 0, y: 0, z: 0 };
const EVENTS: Array<[keyof GameEvents, unknown]> = [
  ['block:hit', { ...at, block: B.SLATE, progress: 0.3 }], ['block:hit', { ...at, block: B.IRON_ORE, progress: 0.6 }],
  ['block:broken', { ...at, block: B.CRYSTAL }], ['block:tooHard', { ...at, block: B.BEDROCK, requiredTier: 99 }],
  ['prop:hit', { ...at, propId: 'c', progress: 0.5 }], ['prop:broken', { ...at, propId: 'c' }], ['tool:swing', { tier: 2 }],
  ['item:picked', { item: 'copperOre', count: 1 }], ['item:rejected', { item: 'stone' }],
  ['items:banked', { total: 5, items: { stone: 5 } }], ['craft:done', { recipe: 'copperPickaxe' }],
  ['craft:failed', { recipe: 'copperPickaxe', reason: 'x' }], ['discovery', { id: 'hollow' }],
  ['player:footstep', { block: B.PLANK, speed: 4 }], ['player:jump', {}], ['player:land', { fallSpeed: 12, block: B.SOIL }],
  ['player:damaged', { amount: 15, cause: 'fall' }], ['player:died', { lost: {} }], ['player:respawned', {}],
  ['camp:entered', {}], ['lantern:low', {}], ['lantern:empty', {}], ['lantern:refueled', {}], ['game:saved', { reason: 't' }],
];

describe('AudioSystem on a (fake) Web Audio context', () => {
  let warn: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    FakeAudioContext.allowed = true;
    FakeAudioContext.last = null;
    vi.stubGlobal('AudioContext', FakeAudioContext);
    vi.stubGlobal('navigator', { userActivation: { isActive: false, hasBeenActive: false } });
    warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    warn.mockRestore();
  });

  const activate = () => vi.stubGlobal('navigator', { userActivation: { isActive: true, hasBeenActive: true } });

  it('asks the browser to resume on every gesture until playback is allowed', async () => {
    // Android: the first tap's pointerdown is not a user activation, so that resume() stays pending.
    FakeAudioContext.allowed = false;
    const audio = new AudioSystem(new EventBus());
    void audio.unlock();
    const ctx = FakeAudioContext.last!;
    expect(ctx.state).toBe('suspended');
    expect(audio.unlocked).toBe(false);
    void audio.unlock();
    expect(ctx.resumeCalls).toBe(2);
    FakeAudioContext.allowed = true;
    await audio.unlock();
    expect(audio.unlocked).toBe(true);
    audio.dispose();
  });

  it('finishes unlocking in the frames after the activating tap ends', () => {
    FakeAudioContext.allowed = false;
    const audio = new AudioSystem(new EventBus());
    void audio.unlock();
    const ctx = FakeAudioContext.last!;
    // No activation yet: frames do not retry (each refused resume logs a browser warning).
    for (let i = 0; i < 60; i++) audio.update(1 / 60, STATE);
    expect(ctx.resumeCalls).toBe(1);
    // pointerup activates the page; no further unlock() call is needed.
    FakeAudioContext.allowed = true;
    activate();
    audio.update(1 / 60, STATE);
    expect(audio.unlocked).toBe(true);
    audio.dispose();
  });

  it('never resumes a context the app suspended for backgrounding', () => {
    const audio = new AudioSystem(new EventBus());
    void audio.unlock();
    const ctx = FakeAudioContext.last!;
    activate();
    audio.suspend();
    for (let i = 0; i < 120; i++) audio.update(1 / 60, STATE);
    expect(ctx.state).toBe('suspended');
    audio.resume();
    expect(ctx.state).toBe('running');
    audio.dispose();
  });

  it('plays every event within the voice cap and releases every node of finished sounds', () => {
    const bus = new EventBus<GameEvents>();
    const audio = new AudioSystem(bus);
    void audio.unlock();
    const ctx = FakeAudioContext.last!;
    const baseline = ctx.nodes.length;
    for (const [type, payload] of EVENTS) {
      bus.emit(type, payload as never);
      ctx.currentTime += 0.2;
    }
    for (let i = 0; i < 100; i++) {
      bus.emit('block:hit', { ...at, block: i % 2 ? B.SLATE : B.CRYSTAL, progress: (i % 10) / 10 });
      ctx.currentTime += 0.03;
      expect(audio.stats().sfxVoices).toBeLessThanOrEqual(SFX_VOICES);
    }
    expect(warn).not.toHaveBeenCalled();
    const voiceNodes = ctx.nodes.slice(baseline);
    expect(voiceNodes.length).toBeGreaterThan(500);
    for (const n of voiceNodes) n.onended?.();
    expect(voiceNodes.filter((n) => n.connected)).toHaveLength(0);
    audio.dispose();
    expect(ctx.state).toBe('closed');
  });

  it('runs the layers and the score, and shrugs off non-finite input without throwing or warning', () => {
    const audio = new AudioSystem(new EventBus());
    void audio.unlock();
    const ctx = FakeAudioContext.last!;
    for (let i = 0; i < 600; i++) {
      ctx.currentTime += 1 / 60;
      audio.update(1 / 60, { ...STATE, atCamp: i > 300 });
    }
    expect(audio.stats().mood).toBe('camp');
    expect(audio.stats().musicVoices).toBeGreaterThan(0);
    // Walk away from the fire and the crystals long enough for both layers to be torn down.
    for (let i = 0; i < 240; i++) {
      ctx.currentTime += 1 / 60;
      audio.update(1 / 60, { ...STATE, nearFire: 0, nearCrystal: 0 });
    }
    const bad = { ...STATE, depth: Number.NaN, openness: Number.NaN, lanternFuel: Number.POSITIVE_INFINITY, nearFire: Number.NaN };
    for (let i = 0; i < 30; i++) {
      ctx.currentTime += 1 / 60;
      audio.update(i % 2 ? Number.NaN : 1 / 60, bad);
    }
    expect(() => audio.setVolumes({ master: Number.NaN, music: 0.5, sfx: Number.POSITIVE_INFINITY, ambience: 0.5 })).not.toThrow();
    audio.setPaused(true);
    audio.update(1 / 60, STATE);
    audio.setPaused(false);
    // Layers keep updating after the bad frames (a NaN dt must not freeze the control clock):
    // walking back to the fire builds the campfire loop again.
    const runningLoops = () => ctx.nodes.filter((n) => n.loop && n.connected).length;
    const before = runningLoops();
    for (let i = 0; i < 120; i++) {
      ctx.currentTime += 1 / 60;
      audio.update(1 / 60, { ...STATE, nearFire: 1, nearCrystal: 1 });
    }
    expect(runningLoops()).toBeGreaterThan(before);
    expect(warn).not.toHaveBeenCalled();
    audio.dispose();
  });
});

describe('music polyphony', () => {
  it('lets plucks steal old plucks, never the pad chord under them', () => {
    let padsStolen = 0;
    let pads = 0;
    for (let seed = 1; seed <= 6; seed++) {
      const scheduler = new MusicScheduler(seed);
      const voices = new VoiceLimiter<MusicNote>(MUSIC_VOICES, (n) => n.voice === 'pad' && padsStolen++);
      const out: MusicNote[] = [];
      for (let t = 0; t < 600; t += 1 / 30) {
        const n = scheduler.advance(t, t + 0.35, 'camp', out);
        for (let i = 0; i < n; i++) {
          const note = out[i];
          const priority = MUSIC_PRIORITY[note.voice];
          if (note.voice === 'pad') pads++;
          if (!voices.admit(t, priority)) continue;
          // Pads ring through their 3 s release; plucks decay over their duration.
          voices.add(note, note.time, note.time + note.duration + (note.voice === 'pad' ? 3.05 : 0.05), priority);
        }
      }
    }
    expect(pads).toBeGreaterThan(100);
    expect(padsStolen / pads).toBeLessThan(0.01);
  });
});
