import { Rng } from '../core/rng';
import { REVERB_SECONDS } from './buffers';
import { busTarget, createMixGraph } from './graph';
import { SFX, isSfxName, playSfx, type SfxParams } from './sfx';

/**
 * Silence rendered before the sound and trimmed from the result. The master compressor
 * starts from a cold state that squashes the first few hundred ms; in the game it has long
 * settled by the time anything plays, so renders give it the same head start.
 */
const LEAD_IN = 0.4;

/** Representative parameters for sounds whose character depends on gameplay values. */
const DEMO_PARAMS: Partial<Record<string, SfxParams>> = {
  land: { intensity: 0.6, material: 'stone' },
  banked: { count: 8 },
  damaged: { intensity: 0.5 },
};

/**
 * Render one registered sound through the same mix graph the game uses (bus, reverb,
 * master limiter) with an OfflineAudioContext. Repeatable for a given name and sample rate
 * (to float rounding). Returns no channels when offline rendering is unavailable or the
 * name is unknown.
 */
export async function renderSfxOfflineChannels(name: string, sampleRate = 48000, params?: SfxParams): Promise<Float32Array[]> {
  const Offline = (globalThis as { OfflineAudioContext?: typeof OfflineAudioContext }).OfflineAudioContext;
  if (!Offline || !isSfxName(name)) return [];
  const d = SFX[name];
  // Every voice has a reverb send (its category's base send plus its own), so always leave room for the tail.
  const seconds = LEAD_IN + d.length + REVERB_SECONDS * 0.8;
  const ctx = new Offline(2, Math.ceil(seconds * sampleRate), sampleRate);
  const graph = createMixGraph(ctx, ctx.destination, 0xdeedd0);
  const rng = new Rng(name.length * 7919 + sampleRate);
  playSfx(busTarget(graph, d.bus, () => rng.next()), name, params ?? DEMO_PARAMS[name] ?? { progress: 0.5 }, LEAD_IN);
  const rendered = await ctx.startRendering();
  const skip = Math.floor(LEAD_IN * sampleRate);
  const out: Float32Array[] = [];
  for (let c = 0; c < rendered.numberOfChannels; c++) out.push(rendered.getChannelData(c).slice(skip));
  return out;
}

/** Mono (L+R)/2 render of a registered sound; empty when offline rendering is unavailable. */
export async function renderSfxOffline(name: string, sampleRate = 48000, params?: SfxParams): Promise<Float32Array> {
  const channels = await renderSfxOfflineChannels(name, sampleRate, params);
  if (channels.length === 0) return new Float32Array(0);
  const [l, r = l] = channels;
  const mono = new Float32Array(l.length);
  for (let i = 0; i < l.length; i++) mono[i] = (l[i] + r[i]) * 0.5;
  return mono;
}
