import { Rng } from '../core/rng';

// Sample generators for the few AudioBuffers the synth reuses for everything: noise colors,
// granular debris, flame crackle and the cave impulse response. The generators are pure
// (Float32Array in, Float32Array out) so they are unit tested without Web Audio.

/** Make a looped buffer seamless by crossfading the overshoot tail into the head. */
function seamless(src: Float32Array, length: number): Float32Array {
  const fade = src.length - length;
  const out = src.subarray(0, length);
  for (let i = 0; i < fade; i++) {
    const t = i / fade;
    out[i] = out[i] * t + src[length + i] * (1 - t);
  }
  return out;
}

function normalizePeak(out: Float32Array, target: number): Float32Array {
  let peak = 0;
  for (let i = 0; i < out.length; i++) peak = Math.max(peak, Math.abs(out[i]));
  if (peak > 0) {
    const k = target / peak;
    for (let i = 0; i < out.length; i++) out[i] *= k;
  }
  return out;
}

export function whiteNoise(length: number, rng: Rng): Float32Array {
  const out = new Float32Array(length);
  for (let i = 0; i < length; i++) out[i] = rng.next() * 2 - 1;
  return out;
}

/** Pink (1/f) noise, Paul Kellet's economy filter. Loops seamlessly. */
export function pinkNoise(length: number, rng: Rng): Float32Array {
  const fade = Math.min(2048, length >> 2);
  const src = new Float32Array(length + fade);
  let b0 = 0, b1 = 0, b2 = 0;
  for (let i = 0; i < src.length; i++) {
    const w = rng.next() * 2 - 1;
    b0 = 0.99765 * b0 + w * 0.099046;
    b1 = 0.963 * b1 + w * 0.2965164;
    b2 = 0.57 * b2 + w * 1.0526913;
    src[i] = b0 + b1 + b2 + w * 0.1848;
  }
  return normalizePeak(seamless(src, length), 0.9);
}

/** Brown (1/f^2) noise: leaky integrated white noise with DC removed. Loops seamlessly. */
export function brownNoise(length: number, rng: Rng): Float32Array {
  const fade = Math.min(4096, length >> 2);
  const src = new Float32Array(length + fade);
  let b = 0;
  let dc = 0;
  for (let i = 0; i < src.length; i++) {
    b = (b + 0.02 * (rng.next() * 2 - 1)) / 1.02;
    dc += (b - dc) * 0.0005;
    src[i] = b - dc;
  }
  return normalizePeak(seamless(src, length), 0.9);
}

/**
 * Granular debris: a dense cluster of tiny noise grains at the start (the break) thinning
 * out into scattered pebbles. One buffer serves every crumble, crunch and clatter, varied by
 * playback rate, offset and filtering.
 */
export function crumbleTexture(length: number, sampleRate: number, rng: Rng): Float32Array {
  const out = new Float32Array(length);
  const seconds = length / sampleRate;
  let t = 0;
  while (t < seconds) {
    const progress = t / seconds;
    const start = Math.floor(t * sampleRate);
    const grainLen = Math.floor(sampleRate * (0.003 + rng.next() * 0.022 * (1 - progress * 0.5)));
    const amp = (0.25 + rng.next() * 0.75) * Math.pow(1 - progress, 1.6);
    const decay = 4 / grainLen;
    for (let i = 0; i < grainLen && start + i < length; i++) out[start + i] += (rng.next() * 2 - 1) * amp * Math.exp(-i * decay);
    // Grain spacing widens over time: ~2 ms apart at the impact, tens of ms in the tail.
    t += 0.002 + rng.next() * (0.004 + progress * progress * 0.09);
  }
  return normalizePeak(out, 0.95);
}

/**
 * Flame crackle: sparse pops of random size over silence, with occasional bigger snaps.
 * Pops never cross the loop point, so the buffer loops without a seam.
 */
export function crackleTexture(length: number, sampleRate: number, rng: Rng): Float32Array {
  const out = new Float32Array(length);
  const margin = Math.floor(sampleRate * 0.012);
  let i = Math.floor(rng.next() * sampleRate * 0.05);
  while (i < length - margin) {
    const big = rng.chance(0.08);
    const amp = big ? 0.6 + rng.next() * 0.4 : Math.pow(rng.next(), 2.2) * 0.55;
    const len = Math.floor(sampleRate * (big ? 0.004 + rng.next() * 0.006 : 0.0006 + rng.next() * 0.0025));
    const decay = 5 / len;
    for (let k = 0; k < len && i + k < length - 1; k++) out[i + k] += (rng.next() * 2 - 1) * amp * Math.exp(-k * decay);
    // Poisson-ish spacing, ~22 pops per second on average.
    i += Math.floor(sampleRate * -Math.log(1 - rng.next() * 0.999) / 22);
  }
  return normalizePeak(out, 0.95);
}

/**
 * Cave impulse response: a few early reflections, then exponentially decaying stereo noise
 * whose tail is progressively low-passed (stone absorbs highs faster than lows).
 */
export function impulseResponse(sampleRate: number, seconds: number, rng: Rng): [Float32Array, Float32Array] {
  const length = Math.floor(sampleRate * seconds);
  const channels: [Float32Array, Float32Array] = [new Float32Array(length), new Float32Array(length)];
  const preDelay = Math.floor(sampleRate * 0.012);
  const tau = seconds / 6.9; // -60 dB at the end of the buffer
  for (const ch of channels) {
    let lp = 0;
    for (let i = preDelay; i < length; i++) {
      const t = (i - preDelay) / sampleRate;
      const x = t / seconds;
      const coeff = 0.7 - 0.5 * Math.sqrt(x); // one-pole lowpass closing over the tail
      lp += coeff * (rng.next() * 2 - 1 - lp);
      ch[i] = lp * Math.exp(-t / tau);
    }
    for (let r = 0; r < 6; r++) {
      const dt = 0.008 + rng.next() * 0.07;
      const at = preDelay + Math.floor(sampleRate * dt);
      ch[at] += (rng.chance(0.5) ? 1 : -1) * (0.3 + rng.next() * 0.3) * Math.exp(-dt / tau);
    }
    normalizePeak(ch, 0.9);
  }
  return channels;
}

export interface NoiseBank {
  white: AudioBuffer;
  pink: AudioBuffer;
  brown: AudioBuffer;
  crumble: readonly AudioBuffer[];
  crackle: AudioBuffer;
}

function toBuffer(ctx: BaseAudioContext, ...channels: Float32Array[]): AudioBuffer {
  const buf = ctx.createBuffer(channels.length, channels[0].length, ctx.sampleRate);
  // getChannelData().set() rather than copyToChannel(), which older WebKit lacks.
  channels.forEach((data, i) => buf.getChannelData(i).set(data));
  return buf;
}

/** Create the shared buffers once per context (~3 MB at 48 kHz). */
export function createNoiseBank(ctx: BaseAudioContext, seed: number): NoiseBank {
  const sr = ctx.sampleRate;
  const rng = new Rng(seed);
  return {
    white: toBuffer(ctx, whiteNoise(Math.floor(sr * 1.5), rng)),
    pink: toBuffer(ctx, pinkNoise(Math.floor(sr * 2.5), rng)),
    brown: toBuffer(ctx, brownNoise(Math.floor(sr * 3), rng)),
    crumble: [0, 1, 2].map(() => toBuffer(ctx, crumbleTexture(Math.floor(sr * 0.8), sr, rng))),
    crackle: toBuffer(ctx, crackleTexture(Math.floor(sr * 4), sr, rng)),
  };
}

export const REVERB_SECONDS = 2.5;

export function createImpulseBuffer(ctx: BaseAudioContext, seed: number): AudioBuffer {
  const [l, r] = impulseResponse(ctx.sampleRate, REVERB_SECONDS, new Rng(seed ^ 0x2e7));
  return toBuffer(ctx, l, r);
}
