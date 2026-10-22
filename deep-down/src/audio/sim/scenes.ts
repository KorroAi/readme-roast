import { Rng } from '../../core/rng';
import { DEFAULT_SETTINGS } from '../../save/types';
import { mixStats, type MixStats } from '../analysis';
import { busTarget, createMixGraph, type MixGraph } from '../graph';
import { MusicPlayer } from '../MusicPlayer';
import type { LayerMix } from '../MusicScheduler';
import type { ScoreId } from '../scores';
import { volumeToGain } from '../theory';
import type { AudioVolumes } from '../types';
import { SimAudioContext } from './webAudioSim';

// Scripted scenes rendered on the Web Audio emulator: the proofs of the score, the beds and the
// mixes (tests/unit/audio*.test.ts and tools/audio-scenes.ts). Each drives the game's real classes
// with a frame clock like the game's (updates at `fps`), so what is measured is what plays.

export const DEFAULT_VOLUMES: AudioVolumes = {
  master: DEFAULT_SETTINGS.masterVolume,
  music: DEFAULT_SETTINGS.musicVolume,
  sfx: DEFAULT_SETTINGS.sfxVolume,
  ambience: DEFAULT_SETTINGS.ambienceVolume,
};

export interface SceneStage {
  seconds: number;
  /** A label for the report. */
  name: string;
  mix?: LayerMix;
  score?: ScoreId;
  /** Called once when the stage begins (stingers, events, a guardian's phase). */
  enter?: (now: number, player: MusicPlayer) => void;
}

export interface StageReport extends MixStats {
  name: string;
  /** Most score voices sounding at once during the stage. */
  maxVoices: number;
}

export interface SceneResult {
  sampleRate: number;
  stages: StageReport[];
  whole: MixStats;
  maxVoices: number;
  maxDecks: number;
  /** Decks alive when the scene ends (a faded deck is released once rung out). */
  finalDecks: number;
  /** Notes started per layer. */
  played: Record<string, number>;
  channels: [Float32Array, Float32Array];
}

/** A live graph on the emulator with the game's volumes applied (master, music, sfx, ambience). */
export function simGraph(sampleRate = 24000, volumes: AudioVolumes = DEFAULT_VOLUMES): { ctx: SimAudioContext; graph: MixGraph } {
  const ctx = new SimAudioContext({ sampleRate });
  const graph = createMixGraph(ctx as unknown as BaseAudioContext, ctx.destination as unknown as AudioNode, 0xdeedd0);
  graph.master.gain.value = volumeToGain(volumes.master);
  for (const bus of ['music', 'sfx', 'ambience'] as const) {
    graph.buses[bus].input.gain.value = volumeToGain(volumes[bus]);
    graph.buses[bus].wet.gain.value = volumeToGain(volumes[bus]);
  }
  return { ctx, graph };
}

/** Render a score through the stages (each with its layer mix, optionally switching scores). */
export function renderMusicScene(first: ScoreId, stages: readonly SceneStage[], opts: { sampleRate?: number; fps?: number; seed?: number } = {}): SceneResult {
  const sampleRate = opts.sampleRate ?? 24000;
  const fps = opts.fps ?? 30;
  const { ctx, graph } = simGraph(sampleRate);
  const rng = new Rng(opts.seed ?? 7);
  const player = new MusicPlayer(busTarget(graph, 'music', () => rng.next()), opts.seed ?? 7);
  // Let the master limiter settle (it starts cold in a browser too).
  ctx.render(0.4);
  ctx.take();
  player.play(first, ctx.currentTime);
  const reports: StageReport[] = [];
  const all: [Float32Array[], Float32Array[]] = [[], []];
  let maxVoices = 0;
  let maxDecks = 0;
  for (const st of stages) {
    if (st.score) player.play(st.score, ctx.currentTime, { fadeIn: 1.5, fadeOut: 2.5 });
    st.enter?.(ctx.currentTime, player);
    let stageVoices = 0;
    const frames = Math.round(st.seconds * fps);
    for (let f = 0; f < frames; f++) {
      player.update(ctx.currentTime, st.mix ?? { bed: 1, motif: 1, tension: 0, combat: 0 });
      ctx.render(1 / fps);
      stageVoices = Math.max(stageVoices, player.activeVoices);
      maxDecks = Math.max(maxDecks, player.deckCount);
    }
    const [l, r] = ctx.take();
    all[0].push(l);
    all[1].push(r);
    reports.push({ name: st.name, maxVoices: stageVoices, ...mixStats([l, r], sampleRate) });
    maxVoices = Math.max(maxVoices, stageVoices);
  }
  const join = (parts: Float32Array[]) => {
    const out = new Float32Array(parts.reduce((n, p) => n + p.length, 0));
    let at = 0;
    for (const p of parts) {
      out.set(p, at);
      at += p.length;
    }
    return out;
  };
  const channels: [Float32Array, Float32Array] = [join(all[0]), join(all[1])];
  return { sampleRate, stages: reports, whole: mixStats(channels, sampleRate), maxVoices, maxDecks, finalDecks: player.deckCount, played: { ...player.played }, channels };
}

export const CALM: LayerMix = { bed: 1, motif: 1, tension: 0, combat: 0 };
export const TENSION: LayerMix = { bed: 0.8, motif: 0.5, tension: 1, combat: 0 };
export const COMBAT: LayerMix = { bed: 0.65, motif: 0.75, tension: 0.7, combat: 1 };

/** The standard biome proof: exploring, monsters near, a fight, then calm again. */
export const BIOME_ARC: readonly SceneStage[] = [
  { name: 'explore', seconds: 24, mix: CALM },
  { name: 'tension', seconds: 14, mix: TENSION },
  { name: 'combat', seconds: 18, mix: COMBAT },
  { name: 'after', seconds: 8, mix: CALM },
];
