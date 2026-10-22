import { describe, expect, it } from 'vitest';
import { peakOf } from '../../src/audio/analysis';
import { SimAudioContext, SimOfflineAudioContext, normalizationScale, type SimAudioBuffer } from '../../src/audio/sim/webAudioSim';

// The Node Web Audio emulator (src/audio/sim) the audio proofs run on: checked here against the
// closed forms of the Web Audio spec, so its measurements of the game's sounds can be trusted.

const SR = 24000;
const rms = (x: Float32Array, from = 0, to = x.length) => {
  let s = 0;
  for (let i = from; i < to; i++) s += x[i] * x[i];
  return Math.sqrt(s / Math.max(1, to - from));
};

async function render(seconds: number, build: (ctx: SimOfflineAudioContext) => void, channels = 1): Promise<SimAudioBuffer> {
  const ctx = new SimOfflineAudioContext(channels, Math.round(seconds * SR), SR);
  build(ctx);
  return ctx.startRendering();
}

describe('Web Audio emulator: sources and params', () => {
  it('plays a sine at its level and pitch, only between start and stop', async () => {
    const buf = await render(1, (ctx) => {
      const o = ctx.createOscillator();
      o.frequency.value = 500;
      o.connect(ctx.destination);
      o.start(0.25);
      o.stop(0.75);
    });
    const x = buf.getChannelData(0);
    expect(peakOf(x.subarray(0, Math.round(0.25 * SR) - 1))).toBe(0);
    expect(peakOf(x.subarray(Math.round(0.75 * SR) + 1))).toBe(0);
    expect(rms(x, Math.round(0.3 * SR), Math.round(0.7 * SR))).toBeCloseTo(Math.SQRT1_2, 2);
    let crossings = 0;
    for (let i = Math.round(0.3 * SR); i < Math.round(0.7 * SR); i++) if (x[i - 1] < 0 && x[i] >= 0) crossings++;
    expect(crossings).toBeGreaterThanOrEqual(199);
    expect(crossings).toBeLessThanOrEqual(201);
  });

  it('follows the automation curves of the spec', async () => {
    const buf = await render(1, (ctx) => {
      const c = ctx.createConstantSource();
      c.offset.setValueAtTime(0, 0);
      c.offset.linearRampToValueAtTime(1, 0.2);
      c.offset.exponentialRampToValueAtTime(0.01, 0.4);
      c.offset.setTargetAtTime(0.5, 0.5, 0.1);
      c.connect(ctx.destination);
      c.start(0);
    });
    const x = buf.getChannelData(0);
    const at = (t: number) => x[Math.round(t * SR)];
    expect(at(0.1)).toBeCloseTo(0.5, 2);
    expect(at(0.3)).toBeCloseTo(Math.sqrt(0.01), 2);
    expect(at(0.45)).toBeCloseTo(0.01, 3);
    expect(at(0.6)).toBeCloseTo(0.5 + (0.01 - 0.5) * Math.exp(-1), 2);
    expect(at(0.99)).toBeCloseTo(0.5 + (0.01 - 0.5) * Math.exp(-4.9), 2);
  });

  it('sums audio-rate modulation into a param (an LFO on a gain)', async () => {
    const buf = await render(1, (ctx) => {
      const c = ctx.createConstantSource();
      const g = ctx.createGain();
      g.gain.value = 0.5;
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 4;
      const depth = ctx.createGain();
      depth.gain.value = 0.25;
      lfo.connect(depth).connect(g.gain);
      c.connect(g).connect(ctx.destination);
      c.start(0);
      lfo.start(0);
    });
    const x = buf.getChannelData(0);
    expect(Math.max(...x)).toBeCloseTo(0.75, 2);
    expect(Math.min(...x.subarray(10))).toBeCloseTo(0.25, 2);
  });

  it('loops buffers and honours the playback rate', async () => {
    const buf = await render(0.5, (ctx) => {
      const b = ctx.createBuffer(1, 100, SR);
      b.getChannelData(0).fill(0.5);
      const s = ctx.createBufferSource();
      s.buffer = b;
      s.loop = true;
      s.playbackRate.value = 2;
      s.connect(ctx.destination);
      s.start(0);
    });
    expect(rms(buf.getChannelData(0))).toBeCloseTo(0.5, 3);
  });

  it('fires ended after the stop time and only once', () => {
    const ctx = new SimAudioContext({ sampleRate: SR });
    const o = ctx.createOscillator();
    o.connect(ctx.destination);
    let ended = 0;
    o.onended = () => ended++;
    o.start(0);
    o.stop(0.1);
    ctx.render(0.05);
    expect(ended).toBe(0);
    ctx.render(0.2);
    expect(ended).toBe(1);
    o.stop(0.5);
    ctx.render(0.5);
    expect(ended).toBe(1);
    expect(() => o.start(1)).toThrow();
  });

  it('rejects non-finite values and ramps to zero like a browser', () => {
    const ctx = new SimAudioContext({ sampleRate: SR });
    const g = ctx.createGain();
    expect(() => g.gain.setValueAtTime(Number.NaN, 0)).toThrow(TypeError);
    expect(() => g.gain.exponentialRampToValueAtTime(0, 1)).toThrow(RangeError);
    expect(() => {
      g.gain.value = Number.POSITIVE_INFINITY;
    }).toThrow(TypeError);
  });
});

describe('Web Audio emulator: processing nodes', () => {
  const toneThrough = async (freq: number, setup: (ctx: SimOfflineAudioContext) => AudioNodeLike) => {
    const buf = await render(0.5, (ctx) => {
      const o = ctx.createOscillator();
      o.frequency.value = freq;
      const n = setup(ctx);
      o.connect(n as never);
      (n as { connect(d: unknown): unknown }).connect(ctx.destination);
      o.start(0);
    });
    return rms(buf.getChannelData(0), SR * 0.2, SR * 0.5) / Math.SQRT1_2;
  };
  type AudioNodeLike = object;

  it('filters with the biquad formulas (Q in dB for lowpass)', async () => {
    const lp = (qDb: number) => (ctx: SimOfflineAudioContext) => {
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = 1000;
      f.Q.value = qDb;
      return f;
    };
    // Q in dB: -3.01 dB is a Butterworth (-3 dB at the cutoff); 0 dB peaks to unity there.
    const butterworth = 20 * Math.log10(Math.SQRT1_2);
    expect(20 * Math.log10(await toneThrough(1000, lp(butterworth)))).toBeCloseTo(-3, 0);
    expect(20 * Math.log10(await toneThrough(1000, lp(0)))).toBeCloseTo(0, 0);
    // Two octaves above: 12 dB per octave.
    expect(20 * Math.log10(await toneThrough(4000, lp(butterworth)))).toBeLessThan(-22);
    expect(await toneThrough(100, lp(butterworth))).toBeCloseTo(1, 1);
    const bp = (ctx: SimOfflineAudioContext) => {
      const f = ctx.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.value = 1000;
      f.Q.value = 4;
      return f;
    };
    expect(await toneThrough(1000, bp)).toBeCloseTo(1, 1);
    expect(await toneThrough(250, bp)).toBeLessThan(0.1);
  });

  it('pans a mono source with equal power', async () => {
    const buf = await render(0.3, (ctx) => {
      const c = ctx.createConstantSource();
      const p = ctx.createStereoPanner();
      p.pan.value = 0;
      c.connect(p).connect(ctx.destination);
      c.start(0);
    }, 2);
    expect(buf.getChannelData(0)[500]).toBeCloseTo(Math.SQRT1_2, 3);
    expect(buf.getChannelData(1)[500]).toBeCloseTo(Math.SQRT1_2, 3);
  });

  it('convolves exactly (an impulse response in, the same response out) and normalises like the spec', async () => {
    const ir = new Float32Array(5000);
    for (let i = 0; i < ir.length; i++) ir[i] = Math.exp(-i / 800) * Math.sin(i * 0.37);
    const buf = await render(0.5, (ctx) => {
      const b = ctx.createBuffer(1, ir.length, SR);
      b.getChannelData(0).set(ir);
      const conv = ctx.createConvolver();
      conv.normalize = false;
      conv.buffer = b;
      const imp = ctx.createBuffer(1, 1, SR);
      imp.getChannelData(0)[0] = 1;
      const s = ctx.createBufferSource();
      s.buffer = imp;
      s.connect(conv).connect(ctx.destination);
      s.start(0.1);
    });
    const y = buf.getChannelData(0);
    const off = Math.round(0.1 * SR);
    let err = 0;
    for (let i = 0; i < ir.length; i++) err = Math.max(err, Math.abs(y[off + i] - ir[i]));
    expect(err).toBeLessThan(1e-5);
    const flat = { numberOfChannels: 1, length: 4, sampleRate: 44100, getChannelData: () => new Float32Array([1, 1, 1, 1]) };
    expect(normalizationScale(flat)).toBeCloseTo(0.00125, 6);
  });

  it('compresses with the kernel curve, its makeup gain and its pre-delay', async () => {
    // A steady full-scale tone through threshold -6 dB, knee 6, ratio 12 (the game's master).
    const buf = await render(2, (ctx) => {
      const o = ctx.createOscillator();
      o.frequency.value = 220;
      const c = ctx.createDynamicsCompressor();
      c.threshold.value = -6;
      c.knee.value = 6;
      c.ratio.value = 12;
      c.attack.value = 0.002;
      c.release.value = 0.2;
      o.connect(c).connect(ctx.destination);
      o.start(0);
    });
    const x = buf.getChannelData(0);
    const outPeakDb = 20 * Math.log10(peakOf(x.subarray(SR, 2 * SR)));
    // Static curve: ~-5.5 dB at 0 dBFS in, plus (1/fullRangeGain)^0.6 makeup: about -2 dBFS out.
    expect(outPeakDb).toBeLessThan(-1);
    expect(outPeakDb).toBeGreaterThan(-4);
    // Quiet signals pass with the makeup gain only.
    const quiet = await render(1, (ctx) => {
      const o = ctx.createOscillator();
      o.frequency.value = 220;
      const g = ctx.createGain();
      g.gain.value = 0.05;
      const c = ctx.createDynamicsCompressor();
      c.threshold.value = -6;
      c.knee.value = 6;
      c.ratio.value = 12;
      o.connect(g).connect(c).connect(ctx.destination);
      o.start(0);
    });
    const gainDb = 20 * Math.log10(peakOf(quiet.getChannelData(0).subarray(SR / 2)) / 0.05);
    expect(gainDb).toBeGreaterThan(2);
    expect(gainDb).toBeLessThan(4.5);
  });
});
