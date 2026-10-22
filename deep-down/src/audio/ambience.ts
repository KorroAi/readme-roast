import type { BiomeId } from '../config/biomes';
import type { NoiseBank } from './buffers';
import { CampfireLoop, CaveBed, CrystalHum, LazyLayer, LoopGraph, ParamTarget, type LayerSend } from './layers';
import type { EmitterKind, HazardName } from './probe';
import type { SfxName } from './sfx';
import type { MoodName } from './theory';

/**
 * The beds (round 3, AUDIO): each biome's sound of the cave, built from a few looping layers (the
 * room tone, wind, a fungal or void hum, water, a lava roar, insects...) and a pool of one-shots
 * (drips, ice cracks, timber creaks, crystal chimes, bubbles, distant city echoes...); positional
 * loops near features (waterfalls, vents, lava, fires, torches, crystals); and the hazard layer that
 * follows the hazard meter (cold wind, gas hiss, heat roar, the dark's drone). Beds crossfade as the
 * explorer crosses between biomes. Everything is synthesized from the shared noise buffers and
 * oscillators, built only while audible (LazyLayer).
 */

export type BedLayerKind = 'wind' | 'hum' | 'water' | 'gloop' | 'roar' | 'insects' | 'drone' | 'hiss' | 'shimmer';

export interface BedLayerDef {
  kind: BedLayerKind;
  level: number;
  /** The layer's main frequency (Hz): wind band, hum fundamental, water cutoff, roar cutoff. */
  tone: number;
  /** Its slow motion (Hz): gusts, breathing, lapping. */
  rate?: number;
  /**
   * A drone's harmonics above its third, which a phone speaker plays (its fundamental and octave sit
   * under a phone's range): ratios of the tone, chosen in the biome score's scale.
   */
  upper?: readonly number[];
}

export interface BedShot {
  name: SfxName;
  /** Mean seconds between plays (exponential spread, never a quick repeat). */
  every: number;
  gain: readonly [number, number];
  pitch?: readonly [number, number];
  /** Stereo spread (0 centred .. 1 anywhere). */
  pan?: number;
}

export interface BedRecipe {
  /** The room tone: the cave bed's cutoff, air band, sub and level. */
  room: { level: number; cutoff: number; air: number; sub: number };
  /** The space's reverb (a scale of the reverb return): carved halls and crystal ring on, earth and fungi swallow. */
  space?: number;
  layers: readonly BedLayerDef[];
  shots: readonly BedShot[];
}

const drip = (every: number, lo = 0.85, hi = 1.15): BedShot => ({ name: 'amb.drip', every, gain: [0.45, 0.9], pitch: [lo, hi], pan: 0.85 });
const rumble = (every: number): BedShot => ({ name: 'amb.rumble', every, gain: [0.5, 0.9], pan: 0.7 });

/** Each biome's bed (keyed by BIOMES[b].ambience = 'amb.<biome>'). */
export const BEDS: Record<BiomeId, BedRecipe> = {
  amberHollows: {
    space: 1.0,
    room: { level: 0.42, cutoff: 320, air: 0.08, sub: 0.03 },
    layers: [{ kind: 'wind', level: 0.2, tone: 520, rate: 0.05 }],
    shots: [drip(4.5, 0.95, 1.2), { name: 'amb.trickle', every: 24, gain: [0.4, 0.7], pan: 0.8 }, rumble(70)],
  },
  mushroomForest: {
    space: 0.8,
    room: { level: 0.36, cutoff: 300, air: 0.06, sub: 0.02 },
    layers: [{ kind: 'hum', level: 0.1, tone: 196, rate: 0.11 }, { kind: 'shimmer', level: 0.04, tone: 1318, rate: 0.2 }],
    shots: [{ name: 'amb.spore', every: 9, gain: [0.4, 0.8], pitch: [0.85, 1.2], pan: 0.9 }, drip(8, 1, 1.3), { name: 'amb.moth', every: 26, gain: [0.4, 0.7], pan: 0.8 }],
  },
  rootGalleries: {
    space: 0.75,
    room: { level: 0.4, cutoff: 280, air: 0.05, sub: 0.04 },
    layers: [{ kind: 'wind', level: 0.19, tone: 380, rate: 0.04 }],
    shots: [{ name: 'amb.root', every: 14, gain: [0.5, 0.9], pitch: [0.85, 1.15], pan: 0.85 }, { name: 'amb.trickle', every: 18, gain: [0.4, 0.8], pan: 0.8 }, drip(10, 0.85, 1)],
  },
  floodedGrottoes: {
    space: 1.2,
    room: { level: 0.34, cutoff: 360, air: 0.1, sub: 0.03 },
    layers: [{ kind: 'water', level: 0.2, tone: 900, rate: 0.18 }],
    shots: [drip(2.6, 0.9, 1.3), { name: 'amb.splash', every: 16, gain: [0.4, 0.8], pitch: [0.8, 1.2], pan: 0.85 }],
  },
  crystalGeode: {
    space: 1.3,
    room: { level: 0.32, cutoff: 340, air: 0.12, sub: 0.02 },
    layers: [{ kind: 'shimmer', level: 0.05, tone: 1760, rate: 0.17 }, { kind: 'wind', level: 0.03, tone: 900, rate: 0.06 }],
    shots: [{ name: 'amb.chime', every: 7, gain: [0.35, 0.8], pitch: [0.85, 1.25], pan: 0.9 }, drip(6, 1.1, 1.4)],
  },
  haldenMines: {
    space: 0.85,
    room: { level: 0.4, cutoff: 300, air: 0.06, sub: 0.03 },
    layers: [{ kind: 'wind', level: 0.18, tone: 450, rate: 0.05 }],
    shots: [{ name: 'amb.creak', every: 12, gain: [0.5, 0.9], pitch: [0.85, 1.15], pan: 0.85 }, { name: 'amb.pick', every: 30, gain: [0.35, 0.6], pan: 0.9 }, { name: 'amb.rail', every: 45, gain: [0.35, 0.6], pan: 0.9 }, drip(9)],
  },
  frostCaverns: {
    space: 1.2,
    room: { level: 0.3, cutoff: 400, air: 0.14, sub: 0.02 },
    layers: [{ kind: 'wind', level: 0.21, tone: 760, rate: 0.07 }],
    shots: [{ name: 'amb.ice', every: 11, gain: [0.45, 0.9], pitch: [0.8, 1.2], pan: 0.9 }, { name: 'amb.iceCrack', every: 26, gain: [0.4, 0.8], pan: 0.9 }, drip(12, 1.2, 1.5)],
  },
  glowrootJungle: {
    space: 0.8,
    room: { level: 0.34, cutoff: 320, air: 0.08, sub: 0.02 },
    layers: [{ kind: 'insects', level: 0.04, tone: 4200, rate: 0.12 }, { kind: 'hum', level: 0.07, tone: 220, rate: 0.09 }],
    shots: [{ name: 'amb.bird', every: 13, gain: [0.35, 0.75], pitch: [0.85, 1.2], pan: 0.9 }, { name: 'amb.frog', every: 15, gain: [0.4, 0.8], pitch: [0.85, 1.15], pan: 0.85 }, drip(5)],
  },
  sulphurBog: {
    space: 0.9,
    room: { level: 0.36, cutoff: 260, air: 0.06, sub: 0.04 },
    layers: [{ kind: 'gloop', level: 0.27, tone: 380, rate: 0.35 }, { kind: 'hiss', level: 0.035, tone: 2600, rate: 0.13 }],
    shots: [{ name: 'amb.bubble', every: 3.2, gain: [0.4, 0.9], pitch: [0.75, 1.3], pan: 0.85 }, { name: 'amb.hiss', every: 20, gain: [0.35, 0.6], pan: 0.8 }],
  },
  sunkenCity: {
    space: 1.35,
    room: { level: 0.36, cutoff: 300, air: 0.11, sub: 0.03 },
    layers: [{ kind: 'wind', level: 0.2, tone: 620, rate: 0.035 }],
    shots: [{ name: 'amb.cityEcho', every: 17, gain: [0.4, 0.75], pitch: [0.85, 1.1], pan: 0.9 }, { name: 'amb.farBell', every: 40, gain: [0.35, 0.6], pitch: [0.9, 1.1], pan: 0.9 }, drip(11)],
  },
  magmaVeins: {
    space: 0.95,
    room: { level: 0.4, cutoff: 240, air: 0.05, sub: 0.05 },
    layers: [{ kind: 'roar', level: 0.36, tone: 260, rate: 0.07 }],
    shots: [{ name: 'amb.lavaPop', every: 5.5, gain: [0.4, 0.85], pitch: [0.8, 1.2], pan: 0.85 }, { name: 'amb.hiss', every: 14, gain: [0.35, 0.65], pan: 0.8 }, rumble(35)],
  },
  obsidianAbyss: {
    space: 1.3,
    room: { level: 0.32, cutoff: 220, air: 0.1, sub: 0.04 },
    layers: [{ kind: 'drone', level: 0.1, tone: 110, rate: 0.05, upper: [4, 5] }, { kind: 'wind', level: 0.14, tone: 300, rate: 0.03 }],
    shots: [{ name: 'amb.voidWhisper', every: 19, gain: [0.35, 0.7], pan: 0.95 }, { name: 'amb.voidTone', every: 23, gain: [0.35, 0.7], pitch: [0.8, 1.2], pan: 0.9 }],
  },
  heart: {
    space: 1.35,
    room: { level: 0.34, cutoff: 220, air: 0.06, sub: 0.06 },
    layers: [{ kind: 'drone', level: 0.12, tone: 73.4, rate: 0.04, upper: [4, 6] }, { kind: 'hum', level: 0.1, tone: 146.8, rate: 0.05 }],
    shots: [{ name: 'amb.heartbeat', every: 2.6, gain: [0.55, 0.75], pan: 0.1 }, { name: 'amb.voidWhisper', every: 28, gain: [0.3, 0.55], pan: 0.95 }],
  },
};

/** The camp's bed: the fire carries it; a quiet room and the odd drip. */
export const CAMP_BED: BedRecipe = {
  space: 0.8,
  room: { level: 0.22, cutoff: 300, air: 0.04, sub: 0.02 },
  layers: [],
  shots: [drip(12)],
};

/** The bed for a key: 'camp', a biome, or (the old world, no biome) the depth mood's nearest biome. */
export function bedRecipeOf(key: string, mood: MoodName | null): BedRecipe {
  if (key === 'camp') return CAMP_BED;
  if (Object.prototype.hasOwnProperty.call(BEDS, key)) return BEDS[key as BiomeId];
  return BEDS[mood === 'deep' ? 'obsidianAbyss' : mood === 'mid' ? 'crystalGeode' : 'amberHollows'];
}

// ---------------------------------------------------------------------------------------
// The bed layers

/** Wind through the passages: a wandering band of noise, slow gusts, a faint whistle above it. */
export class WindLayer extends LazyLayer {
  constructor(ctx: BaseAudioContext, noise: NoiseBank, dest: AudioNode, private readonly tone: number, private readonly rate: number, positional = false) {
    super(ctx, noise, dest, 0.8, null, positional);
  }

  protected build(g: LoopGraph): void {
    const band = g.filter('bandpass', this.tone, 1.4);
    const gust = g.gain(0.7);
    g.loop(this.noise.pink).connect(band).connect(gust).connect(g.out);
    g.lfo(band.frequency, this.rate * 1.3, this.tone * 0.35);
    g.lfo(gust.gain, this.rate, 0.3);
    const whistle = g.filter('bandpass', this.tone * 3.1, 9);
    const wg = g.gain(0.12);
    g.loop(this.noise.white, 0.5).connect(whistle).connect(wg).connect(g.out);
    g.lfo(whistle.frequency, this.rate * 0.7, this.tone * 0.6);
    g.lfo(wg.gain, this.rate * 0.5, 0.1);
  }
}

/** A hum: a few sine partials beating slowly, breathing (fungi, roots, the Heart's chamber). */
export class HumLayer extends LazyLayer {
  constructor(ctx: BaseAudioContext, noise: NoiseBank, dest: AudioNode, private readonly tone: number, private readonly rate: number, send: LayerSend | null = null) {
    super(ctx, noise, dest, 1.0, send);
  }

  protected build(g: LoopGraph): void {
    const breath = g.gain(0.75);
    breath.connect(g.out);
    g.lfo(breath.gain, this.rate, 0.25);
    const f = this.tone;
    for (const [r, a] of [[1, 0.35], [1.0057, 0.3], [2.0, 0.22], [3.01, 0.12], [4.02, 0.06]] as const) g.osc('sine', f * r).connect(g.gain(a)).connect(breath);
  }
}

/**
 * Water: lapping (low-passed noise under a quick, uneven flutter) and a trickle band above it. A
 * fall (`splash` > 0.3) gets a bright splash band and, by `roar`, a broad roar under it.
 */
export class WaterLayer extends LazyLayer {
  private readonly splash: number;
  private readonly roar: number;

  constructor(ctx: BaseAudioContext, noise: NoiseBank, dest: AudioNode, private readonly tone: number, private readonly rate: number, positional = false, bright: boolean | { splash: number; roar: number } = false) {
    super(ctx, noise, dest, 0.6, null, positional);
    const b = typeof bright === 'object' ? bright : bright ? { splash: 0.5, roar: 0.6 } : { splash: 0.18, roar: 0 };
    this.splash = b.splash;
    this.roar = b.roar;
  }

  protected build(g: LoopGraph): void {
    const lp = g.filter('lowpass', this.tone, 0);
    const lap = g.gain(0.6);
    g.loop(this.noise.pink).connect(lp).connect(lap).connect(g.out);
    g.lfo(lap.gain, 3.1 * (this.rate / 0.18), 0.22);
    g.lfo(lap.gain, 4.7 * (this.rate / 0.18), 0.15);
    const fall = this.splash > 0.3;
    const trickle = g.filter('bandpass', fall ? 3200 : 2400, fall ? 1.2 : 3);
    const tg = g.gain(this.splash);
    g.loop(this.noise.white).connect(trickle).connect(tg).connect(g.out);
    g.lfo(trickle.frequency, 0.9, fall ? 600 : 400);
    // A fall's weight: a broad roar under the splash.
    if (this.roar > 0) g.loop(this.noise.brown).connect(g.filter('lowpass', 700, 0)).connect(g.gain(this.roar)).connect(g.out);
  }
}

/**
 * A river babbling over stones: two narrow bands of noise whose centres and levels wander at
 * unrelated rates (the bubbling of water round rocks), over a low flow and a little sparkle.
 */
export class RiverLayer extends LazyLayer {
  constructor(ctx: BaseAudioContext, noise: NoiseBank, dest: AudioNode, positional = true) {
    super(ctx, noise, dest, 0.7, null, positional);
  }

  protected build(g: LoopGraph): void {
    g.loop(this.noise.brown).connect(g.filter('lowpass', 520, 0)).connect(g.gain(0.45)).connect(g.out);
    for (const [f, q, a, r1, r2, r3] of [[880, 4, 0.5, 2.3, 5.1, 3.7], [1650, 5, 0.32, 3.1, 6.7, 4.3]] as const) {
      const band = g.filter('bandpass', f, q);
      const bubble = g.gain(a);
      g.loop(this.noise.pink, 0.9).connect(band).connect(bubble).connect(g.out);
      g.lfo(band.frequency, r1, f * 0.3);
      g.lfo(band.frequency, r2, f * 0.18);
      g.lfo(bubble.gain, r3, a * 0.6);
    }
    g.loop(this.noise.white, 0.7).connect(g.filter('bandpass', 3800, 1.5)).connect(g.gain(0.06)).connect(g.out);
  }
}

/** The void's spires: low sines beating against near twins, a phone-audible fifth above, a slow swell. */
export class VoidHumLayer extends LazyLayer {
  constructor(ctx: BaseAudioContext, noise: NoiseBank, dest: AudioNode, private readonly tone = 98) {
    super(ctx, noise, dest, 1.2, null, true);
  }

  protected build(g: LoopGraph): void {
    const am = g.gain(0.7);
    am.connect(g.out);
    g.lfo(am.gain, 0.11, 0.3);
    const f = this.tone;
    for (const [r, a] of [[1, 0.35], [1.006, 0.3], [2.003, 0.25], [3.0, 0.16], [4.24, 0.06]] as const) g.osc('sine', f * r).connect(g.gain(a)).connect(am);
  }
}

/** An oil lamp or a lantern post: a soft breath of flame and the odd small crackle. */
export class LampLoop extends LazyLayer {
  constructor(ctx: BaseAudioContext, noise: NoiseBank, dest: AudioNode) {
    super(ctx, noise, dest, 0.4, null, true);
  }

  protected build(g: LoopGraph): void {
    g.loop(this.noise.pink).connect(g.filter('bandpass', 640, 0.8)).connect(g.gain(0.4)).connect(g.out);
    g.loop(this.noise.crackle, 1.4).connect(g.filter('highpass', 1400, 0)).connect(g.gain(0.22)).connect(g.out);
  }
}

/** The bog's slow gloop: thick, low noise in slow pulses (bubbles come as one-shots). */
export class GloopLayer extends LazyLayer {
  constructor(ctx: BaseAudioContext, noise: NoiseBank, dest: AudioNode, private readonly tone: number, private readonly rate: number, positional = false) {
    super(ctx, noise, dest, 0.6, null, positional);
  }

  protected build(g: LoopGraph): void {
    const lp = g.filter('lowpass', this.tone, 4);
    const pulse = g.gain(0.55);
    g.loop(this.noise.brown).connect(lp).connect(pulse).connect(g.out);
    g.lfo(pulse.gain, this.rate, 0.4, 'triangle');
    g.lfo(lp.frequency, this.rate * 0.6, this.tone * 0.4);
    const mid = g.filter('bandpass', this.tone * 1.8, 2);
    g.loop(this.noise.pink).connect(mid).connect(g.gain(0.25)).connect(pulse);
  }
}

/** A lava roar: a low rumble that swells, its mid growl, and embers crackling. */
export class RoarLayer extends LazyLayer {
  constructor(ctx: BaseAudioContext, noise: NoiseBank, dest: AudioNode, private readonly tone: number, private readonly rate: number, positional = false) {
    super(ctx, noise, dest, 0.8, null, positional);
  }

  protected build(g: LoopGraph): void {
    const swell = g.gain(0.7);
    swell.connect(g.out);
    g.lfo(swell.gain, this.rate, 0.3);
    g.loop(this.noise.brown).connect(g.filter('lowpass', this.tone, 1)).connect(g.gain(0.8)).connect(swell);
    g.loop(this.noise.pink, 0.8).connect(g.filter('bandpass', 650, 1.2)).connect(g.gain(0.28)).connect(swell);
    g.loop(this.noise.crackle, 0.6).connect(g.filter('highpass', 1200, 0)).connect(g.gain(0.35)).connect(g.out);
  }
}

/** Insects in the vines: a soft high chirr that comes and goes (never constant: it would tire). */
export class InsectLayer extends LazyLayer {
  constructor(ctx: BaseAudioContext, noise: NoiseBank, dest: AudioNode, private readonly tone: number, private readonly rate: number) {
    super(ctx, noise, dest, 1.2);
  }

  protected build(g: LoopGraph): void {
    const band = g.filter('bandpass', this.tone, 10);
    const chirr = g.gain(0.5);
    const gate = g.gain(0.4);
    g.loop(this.noise.white).connect(band).connect(chirr).connect(gate).connect(g.out);
    g.lfo(chirr.gain, 27, 0.45, 'square');
    g.lfo(gate.gain, this.rate, 0.42);
  }
}

/** A dark drone (the abyss, the Heart): a filtered saw and its octave, beating, barely moving. */
export class DroneLayer extends LazyLayer {
  constructor(ctx: BaseAudioContext, noise: NoiseBank, dest: AudioNode, private readonly tone: number, private readonly rate: number, private readonly upper: readonly number[] = []) {
    super(ctx, noise, dest, 1.5);
  }

  protected build(g: LoopGraph): void {
    const lp = g.filter('lowpass', 520, 2);
    const breath = g.gain(0.7);
    lp.connect(breath).connect(g.out);
    g.lfo(lp.frequency, this.rate, 220);
    g.lfo(breath.gain, this.rate * 1.7, 0.2);
    g.osc('sawtooth', this.tone).connect(g.gain(0.4)).connect(lp);
    g.osc('sawtooth', this.tone * 1.006).connect(g.gain(0.35)).connect(lp);
    g.osc('triangle', this.tone * 2.01).connect(g.gain(0.4)).connect(lp);
    g.osc('sine', this.tone * 3).connect(g.gain(0.12)).connect(breath);
    // The harmonics a phone plays, faint and slowly breathing apart (never a steady whine).
    this.upper.forEach((r, i) => {
      const partial = g.gain(0.07 / (i + 1));
      g.lfo(partial.gain, this.rate * (2.3 + i * 1.1), 0.04 / (i + 1));
      g.osc('sine', this.tone * r * (1 + 0.0015 * (i + 1))).connect(partial).connect(breath);
    });
  }
}

/** A hiss (gas, steam): noise through a band, in irregular breaths. */
export class HissLayer extends LazyLayer {
  constructor(ctx: BaseAudioContext, noise: NoiseBank, dest: AudioNode, private readonly tone: number, private readonly rate: number, positional = false) {
    super(ctx, noise, dest, 0.4, null, positional);
  }

  protected build(g: LoopGraph): void {
    const band = g.filter('bandpass', this.tone, 1.1);
    const breath = g.gain(0.6);
    g.loop(this.noise.white).connect(band).connect(breath).connect(g.out);
    g.lfo(breath.gain, this.rate, 0.35);
    g.lfo(breath.gain, this.rate * 2.3, 0.15);
    g.lfo(band.frequency, this.rate * 0.8, this.tone * 0.2);
  }
}

/** A placed torch near the ear: small, close crackles and a soft breath of flame. */
export class TorchLoop extends LazyLayer {
  constructor(ctx: BaseAudioContext, noise: NoiseBank, dest: AudioNode) {
    super(ctx, noise, dest, 0.3, null, true);
  }

  protected build(g: LoopGraph): void {
    g.loop(this.noise.crackle, 1.15).connect(g.filter('highpass', 900, 0)).connect(g.gain(0.5)).connect(g.out);
    g.loop(this.noise.pink).connect(g.filter('bandpass', 700, 0.9)).connect(g.gain(0.22)).connect(g.out);
  }
}

/** A campfire you can place in space (the camp's, positional). */
class PositionalFire extends CampfireLoop {
  constructor(ctx: BaseAudioContext, noise: NoiseBank, dest: AudioNode) {
    super(ctx, noise, dest, 0.25, null, true);
  }
}

/** A crystal formation's ring, placed in space. */
class PositionalCrystal extends CrystalHum {
  constructor(ctx: BaseAudioContext, noise: NoiseBank, dest: AudioNode, send: LayerSend | null) {
    super(ctx, noise, dest, 0.6, send, true);
  }
}

function bedLayer(ctx: BaseAudioContext, noise: NoiseBank, dest: AudioNode, def: BedLayerDef, send: LayerSend | null): LazyLayer {
  const rate = def.rate ?? 0.1;
  switch (def.kind) {
    case 'wind':
      return new WindLayer(ctx, noise, dest, def.tone, rate);
    case 'hum':
      return new HumLayer(ctx, noise, dest, def.tone, rate, send);
    case 'water':
      return new WaterLayer(ctx, noise, dest, def.tone, rate);
    case 'gloop':
      return new GloopLayer(ctx, noise, dest, def.tone, rate);
    case 'roar':
      return new RoarLayer(ctx, noise, dest, def.tone, rate);
    case 'insects':
      return new InsectLayer(ctx, noise, dest, def.tone, rate);
    case 'drone':
      return new DroneLayer(ctx, noise, dest, def.tone, rate, def.upper);
    case 'hiss':
      return new HissLayer(ctx, noise, dest, def.tone, rate);
    case 'shimmer':
      return new HumLayer(ctx, noise, dest, def.tone, rate, send);
  }
}

/** One biome's (or the camp's) bed: its room tone and layers at a crossfade weight. */
export class BiomeBed {
  readonly room: CaveBed;
  readonly layers: Array<{ layer: LazyLayer; level: number }>;
  /** 0..1 crossfade weight (eased toward its target by the AudioSystem). */
  weight = 0;
  target = 0;

  constructor(ctx: BaseAudioContext, noise: NoiseBank, dest: AudioNode, readonly recipe: BedRecipe, send: LayerSend | null) {
    this.room = new CaveBed(ctx, noise, dest, 1.5);
    this.layers = recipe.layers.map((def) => ({ layer: bedLayer(ctx, noise, dest, def, send), level: def.level }));
  }

  /** Push levels (called at control rate). `scale`: the bed's overall level (camp, menus); `open`: 0..1 space. */
  update(now: number, dt: number, scale: number, depth01: number, open: number): void {
    const w = this.weight * scale;
    const r = this.recipe.room;
    this.room.setLevel(r.level * w, now, dt);
    this.room.shape(r.cutoff * (1 - 0.25 * depth01), (r.air + 0.12 * open) * (1 - 0.3 * depth01), r.sub + 0.04 * depth01, now);
    for (const l of this.layers) l.layer.setLevel(l.level * w, now, dt);
  }

  get audible(): boolean {
    return this.weight > 0.002 || this.room.live || this.layers.some((l) => l.layer.live);
  }

  stop(): void {
    this.room.stop();
    for (const l of this.layers) l.layer.stop();
  }
}

// ---------------------------------------------------------------------------------------
// Positional loops and the hazard layer

/** How a feature sounds: its loop's level at full strength a metre away (0: one-shots only), and its one-shots. */
export interface EmitterDef {
  level: number;
  /** One-shots placed with it: mean seconds apart, and their gain at full strength. */
  shot?: { name: SfxName; every: number; gain: number };
}

export const EMITTERS: Record<EmitterKind, EmitterDef> = {
  // Water: the vista's great fall, the small cascades off ledges, the river babbling down its tunnel.
  waterfall: { level: 0.5, shot: { name: 'amb.splash', every: 6, gain: 0.7 } },
  cascade: { level: 0.28 },
  river: { level: 0.26, shot: { name: 'amb.splash', every: 14, gain: 0.45 } },
  // Vents, pools and lava.
  gasVent: { level: 0.16, shot: { name: 'amb.hiss', every: 5, gain: 0.7 } },
  emberVent: { level: 0.18, shot: { name: 'amb.lavaPop', every: 4, gain: 0.6 } },
  bubbles: { level: 0.3, shot: { name: 'amb.bubble', every: 1.6, gain: 0.8 } },
  lava: { level: 0.32, shot: { name: 'amb.lavaPop', every: 3, gain: 0.8 } },
  lavaFall: { level: 0.45, shot: { name: 'amb.lavaPop', every: 2, gain: 0.85 } },
  // Fire and light: the camp's fire, a lair's braziers and placed forges, lamps, torches.
  fire: { level: 0.45 },
  brazier: { level: 0.22 },
  lamp: { level: 0.08 },
  torch: { level: 0.16 },
  // Crystals ring (and chime now and then), the void's spires hum and call.
  crystal: { level: 0.07, shot: { name: 'amb.chime', every: 9, gain: 0.45 } },
  void: { level: 0.12, shot: { name: 'amb.voidTone', every: 13, gain: 0.5 } },
  // A ravine's updraft.
  draft: { level: 0.14 },
  // One-shots only: resin dripping, spore puffs, icicles knocking, the mines' timbers, rubble.
  drips: { level: 0, shot: { name: 'amb.drip', every: 2.2, gain: 0.7 } },
  spores: { level: 0, shot: { name: 'amb.spore', every: 6, gain: 0.7 } },
  ice: { level: 0, shot: { name: 'amb.iceTink', every: 5, gain: 0.6 } },
  timber: { level: 0, shot: { name: 'amb.creak', every: 9, gain: 0.6 } },
  rubble: { level: 0, shot: { name: 'amb.trickle', every: 7, gain: 0.7 } },
};

/** A feature's loop (built only while audible), or null for one-shot-only kinds. */
export function emitterLayer(kind: EmitterKind, ctx: BaseAudioContext, noise: NoiseBank, dest: AudioNode, send: LayerSend | null): LazyLayer | null {
  switch (kind) {
    case 'waterfall':
      return new WaterLayer(ctx, noise, dest, 1600, 0.3, true, { splash: 0.5, roar: 0.6 });
    case 'cascade':
      return new WaterLayer(ctx, noise, dest, 1300, 0.45, true, { splash: 0.42, roar: 0.12 });
    case 'river':
      return new RiverLayer(ctx, noise, dest);
    case 'gasVent':
      return new HissLayer(ctx, noise, dest, 2400, 0.4, true);
    case 'emberVent':
      return new HissLayer(ctx, noise, dest, 1500, 0.3, true);
    case 'bubbles':
      return new GloopLayer(ctx, noise, dest, 450, 0.6, true);
    case 'lava':
      return new RoarLayer(ctx, noise, dest, 320, 0.12, true);
    case 'lavaFall':
      return new RoarLayer(ctx, noise, dest, 240, 0.09, true);
    case 'fire':
    case 'brazier':
      return new PositionalFire(ctx, noise, dest);
    case 'lamp':
      return new LampLoop(ctx, noise, dest);
    case 'torch':
      return new TorchLoop(ctx, noise, dest);
    case 'crystal':
      return new PositionalCrystal(ctx, noise, dest, send);
    case 'void':
      return new VoidHumLayer(ctx, noise, dest);
    case 'draft':
      return new WindLayer(ctx, noise, dest, 420, 0.08, true);
    case 'drips':
    case 'spores':
    case 'ice':
    case 'timber':
    case 'rubble':
      return null;
  }
}

/** The hazard layer: what the meter's build-up sounds like (cold wind, gas hiss, heat roar, the dark). */
export class HazardLayer {
  private readonly layers: Record<HazardName, LazyLayer>;
  private readonly levels: Record<HazardName, ParamTarget | null> = { cold: null, gas: null, heat: null, dark: null };

  constructor(ctx: BaseAudioContext, noise: NoiseBank, dest: AudioNode) {
    this.layers = {
      cold: new WindLayer(ctx, noise, dest, 1300, 0.12),
      gas: new HissLayer(ctx, noise, dest, 2200, 0.5),
      heat: new RoarLayer(ctx, noise, dest, 380, 0.2),
      dark: new DroneLayer(ctx, noise, dest, 98, 0.09),
    };
  }

  update(kind: HazardName | null, level: number, now: number, dt: number): void {
    const peak: Record<HazardName, number> = { cold: 0.3, gas: 0.18, heat: 0.3, dark: 0.12 };
    for (const k of ['cold', 'gas', 'heat', 'dark'] as const) {
      const l = k === kind ? peak[k] * Math.pow(Math.max(0, Math.min(1, level)), 1.3) : 0;
      this.layers[k].setLevel(l, now, dt);
    }
    void this.levels;
  }

  stop(): void {
    for (const l of Object.values(this.layers)) l.stop();
  }
}
