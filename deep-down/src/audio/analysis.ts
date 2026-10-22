// Signal measurements for audio verification (offline renders in tests and tools).

export function peakOf(x: Float32Array): number {
  let p = 0;
  for (let i = 0; i < x.length; i++) {
    const a = Math.abs(x[i]);
    if (a > p) p = a;
  }
  return p;
}

/** Seconds until the signal last exceeds `floorDb` below its peak (audible length). */
export function activeDuration(x: Float32Array, sampleRate: number, floorDb = -50): number {
  const limit = peakOf(x) * Math.pow(10, floorDb / 20);
  for (let i = x.length - 1; i >= 0; i--) if (Math.abs(x[i]) > limit) return (i + 1) / sampleRate;
  return 0;
}

/** RMS over the audible part of the signal. */
export function rmsOf(x: Float32Array, sampleRate: number): number {
  const n = Math.max(1, Math.round(activeDuration(x, sampleRate) * sampleRate));
  let s = 0;
  for (let i = 0; i < n && i < x.length; i++) s += x[i] * x[i];
  return Math.sqrt(s / n);
}

/** In-place iterative radix-2 FFT. `re.length` must be a power of two. */
export function fft(re: Float64Array, im: Float64Array): void {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      const tr = re[i];
      re[i] = re[j];
      re[j] = tr;
      const ti = im[i];
      im[i] = im[j];
      im[j] = ti;
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wr = Math.cos(ang);
    const wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1;
      let ci = 0;
      for (let k = 0; k < len >> 1; k++) {
        const a = i + k;
        const b = a + (len >> 1);
        const tr = re[b] * cr - im[b] * ci;
        const ti = re[b] * ci + im[b] * cr;
        re[b] = re[a] - tr;
        im[b] = im[a] - ti;
        re[a] += tr;
        im[a] += ti;
        const nr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = nr;
      }
    }
  }
}

/**
 * Spectral centroid in Hz: the magnitude-weighted mean frequency of Hann-windowed frames,
 * averaged with each frame weighted by its energy (quiet tails count little).
 */
export function spectralCentroid(x: Float32Array, sampleRate: number, frameSize = 2048): number {
  const re = new Float64Array(frameSize);
  const im = new Float64Array(frameSize);
  const hop = frameSize >> 1;
  let weighted = 0;
  let energyTotal = 0;
  for (let start = 0; start + frameSize <= Math.max(x.length, frameSize); start += hop) {
    let energy = 0;
    for (let i = 0; i < frameSize; i++) {
      const s = start + i < x.length ? x[start + i] : 0;
      const w = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (frameSize - 1));
      re[i] = s * w;
      im[i] = 0;
      energy += s * s;
    }
    if (energy === 0) continue;
    fft(re, im);
    let num = 0;
    let den = 0;
    for (let k = 1; k < frameSize >> 1; k++) {
      const mag = Math.hypot(re[k], im[k]);
      num += mag * ((k * sampleRate) / frameSize);
      den += mag;
    }
    if (den > 0) {
      weighted += (num / den) * energy;
      energyTotal += energy;
    }
  }
  return energyTotal > 0 ? weighted / energyTotal : 0;
}

export interface SignalStats {
  duration: number;
  peak: number;
  rms: number;
  centroid: number;
}

export function analyzeSignal(x: Float32Array, sampleRate: number): SignalStats {
  return { duration: activeDuration(x, sampleRate), peak: peakOf(x), rms: rmsOf(x, sampleRate), centroid: spectralCentroid(x, sampleRate) };
}

// ---------------------------------------------------------------------------------------
// Loudness (ITU-R BS.1770-4): K-weighting, gated integrated loudness, short-term maxima and
// true peak. Used on the offline renders of the score, the beds and the mixes.

interface Biquad {
  b0: number;
  b1: number;
  b2: number;
  a1: number;
  a2: number;
}

/** The two K-weighting stages at any sample rate (the BS.1770 analogue prototypes, as pyloudnorm). */
function kWeighting(sr: number): [Biquad, Biquad] {
  const shelf = (() => {
    const G = 3.99984385397;
    const Q = 0.7071752369554193;
    const fc = 1681.974450955533;
    const A = Math.pow(10, G / 40);
    const w0 = (2 * Math.PI * fc) / sr;
    const alpha = Math.sin(w0) / (2 * Q);
    const c = Math.cos(w0);
    const a0 = A + 1 - (A - 1) * c + 2 * Math.sqrt(A) * alpha;
    return {
      b0: (A * (A + 1 + (A - 1) * c + 2 * Math.sqrt(A) * alpha)) / a0,
      b1: (-2 * A * (A - 1 + (A + 1) * c)) / a0,
      b2: (A * (A + 1 + (A - 1) * c - 2 * Math.sqrt(A) * alpha)) / a0,
      a1: (2 * (A - 1 - (A + 1) * c)) / a0,
      a2: (A + 1 - (A - 1) * c - 2 * Math.sqrt(A) * alpha) / a0,
    };
  })();
  const highpass = (() => {
    const Q = 0.5003270373253953;
    const fc = 38.13547087613982;
    const w0 = (2 * Math.PI * fc) / sr;
    const alpha = Math.sin(w0) / (2 * Q);
    const c = Math.cos(w0);
    const a0 = 1 + alpha;
    return { b0: (1 + c) / 2 / a0, b1: -(1 + c) / a0, b2: (1 + c) / 2 / a0, a1: (-2 * c) / a0, a2: (1 - alpha) / a0 };
  })();
  return [shelf, highpass];
}

function filterInPlace(x: Float64Array, f: Biquad): void {
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const v = x[i];
    const y = f.b0 * v + f.b1 * x1 + f.b2 * x2 - f.a1 * y1 - f.a2 * y2;
    x2 = x1;
    x1 = v;
    y2 = y1;
    y1 = y;
    x[i] = y;
  }
}

/** Mean square of the K-weighted signal per block (`block` s long, `hop` apart), summed over channels. */
function blockPowers(channels: readonly Float32Array[], sr: number, block: number, hop: number): number[] {
  const [shelf, hp] = kWeighting(sr);
  const weighted = channels.map((c) => {
    const x = Float64Array.from(c);
    filterInPlace(x, shelf);
    filterInPlace(x, hp);
    return x;
  });
  const n = Math.round(block * sr);
  const step = Math.round(hop * sr);
  const len = channels[0]?.length ?? 0;
  const out: number[] = [];
  for (let start = 0; start + n <= len; start += step) {
    let z = 0;
    for (const x of weighted) {
      let s = 0;
      for (let i = start; i < start + n; i++) s += x[i] * x[i];
      z += s / n;
    }
    out.push(z);
  }
  return out;
}

const lufsOf = (power: number): number => -0.691 + 10 * Math.log10(Math.max(power, 1e-20));

/**
 * Integrated loudness in LUFS (400 ms blocks, 75 % overlap, the -70 LUFS absolute and -10 LU
 * relative gates). Mono renders count as one channel (a phone speaker plays the sum). -Infinity
 * when everything is gated (silence).
 */
export function integratedLoudness(channels: readonly Float32Array[], sr: number): number {
  const powers = blockPowers(channels, sr, 0.4, 0.1);
  const abs = powers.filter((p) => lufsOf(p) > -70);
  if (abs.length === 0) return Number.NEGATIVE_INFINITY;
  const mean = abs.reduce((a, b) => a + b, 0) / abs.length;
  const rel = lufsOf(mean) - 10;
  const gated = abs.filter((p) => lufsOf(p) > rel);
  if (gated.length === 0) return Number.NEGATIVE_INFINITY;
  return lufsOf(gated.reduce((a, b) => a + b, 0) / gated.length);
}

/**
 * What a phone speaker plays of a signal: a 2nd-order highpass at 300 Hz (small speakers roll off
 * below it), used for "phone loudness" (LUFS of the high-passed signal) in the calibration.
 */
export function phoneFilter(x: Float32Array, sr: number): Float32Array {
  const w0 = (2 * Math.PI * 300) / sr;
  const alpha = Math.sin(w0) / (2 * Math.SQRT1_2);
  const c = Math.cos(w0);
  const a0 = 1 + alpha;
  const f = { b0: (1 + c) / 2 / a0, b1: -(1 + c) / a0, b2: (1 + c) / 2 / a0, a1: (-2 * c) / a0, a2: (1 - alpha) / a0 };
  const y = Float64Array.from(x);
  filterInPlace(y, f);
  return Float32Array.from(y);
}

/** The loudest 400 ms window (momentary loudness maximum), LUFS: how loud a one-shot sounds. */
export function maxMomentaryLoudness(channels: readonly Float32Array[], sr: number): number {
  const powers = blockPowers(channels, sr, 0.4, 0.05);
  if (powers.length === 0) return Number.NEGATIVE_INFINITY;
  return lufsOf(Math.max(...powers));
}

/** Energy shares below 250 Hz, 250 Hz to 2 kHz and above 2 kHz (a phone speaker plays little of the first). */
export function bandShares(x: Float32Array, sr: number): [number, number, number] {
  const n = 2048;
  const re = new Float64Array(n);
  const im = new Float64Array(n);
  const e = [0, 0, 0];
  for (let s = 0; s + n <= x.length; s += n) {
    for (let i = 0; i < n; i++) {
      re[i] = x[s + i] * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1)));
      im[i] = 0;
    }
    fft(re, im);
    for (let k = 1; k < n / 2; k++) {
      const f = (k * sr) / n;
      e[f < 250 ? 0 : f < 2000 ? 1 : 2] += re[k] * re[k] + im[k] * im[k];
    }
  }
  const tot = e[0] + e[1] + e[2] || 1;
  return [e[0] / tot, e[1] / tot, e[2] / tot];
}

/** The loudest 3 s window (short-term loudness maximum), LUFS. */
export function maxShortTermLoudness(channels: readonly Float32Array[], sr: number): number {
  const powers = blockPowers(channels, sr, 3, 0.5);
  if (powers.length === 0) return integratedLoudness(channels, sr);
  return lufsOf(Math.max(...powers));
}

/**
 * True peak (4x oversampled with a windowed-sinc interpolator, BS.1770-4 Annex 2 style), linear.
 * Catches inter-sample peaks a sample peak misses (what a DAC or a phone's resampler would clip).
 */
export function truePeakOf(x: Float32Array): number {
  const taps = 12;
  const os = 4;
  let peak = peakOf(x);
  const kernel: number[][] = [];
  for (let p = 1; p < os; p++) {
    const k: number[] = [];
    for (let i = -taps + 1; i <= taps; i++) {
      const t = i - p / os;
      const sinc = Math.sin(Math.PI * t) / (Math.PI * t);
      const w = 0.5 + 0.5 * Math.cos((Math.PI * t) / taps);
      k.push(sinc * w);
    }
    kernel.push(k);
  }
  for (let n = taps; n < x.length - taps; n++) {
    // Only look between samples near the top (cheap: most of a signal is far below its peak).
    if (Math.abs(x[n]) < peak * 0.7 && Math.abs(x[n + 1]) < peak * 0.7) continue;
    for (let p = 0; p < os - 1; p++) {
      const k = kernel[p];
      let s = 0;
      for (let i = 0; i < k.length; i++) s += x[n - taps + 1 + i] * k[i];
      const a = Math.abs(s);
      if (a > peak) peak = a;
    }
  }
  return peak;
}

export interface MixStats {
  seconds: number;
  /** Sample peak and true peak over every channel, linear. */
  peak: number;
  truePeak: number;
  /** Samples at or beyond full scale, and non-finite samples. */
  clipped: number;
  nonFinite: number;
  /** Integrated and max short-term loudness (LUFS) of the stereo signal. */
  lufs: number;
  shortTermMax: number;
  /** RMS over the whole render (dBFS), the DC offset, the spectral centroid of the mono sum. */
  rmsDb: number;
  dc: number;
  centroid: number;
}

/** Everything the audio proofs report about one render. */
export function mixStats(channels: readonly Float32Array[], sr: number): MixStats {
  let clipped = 0;
  let nonFinite = 0;
  let peak = 0;
  let truePeak = 0;
  let sum = 0;
  let sq = 0;
  let n = 0;
  for (const c of channels) {
    for (let i = 0; i < c.length; i++) {
      const v = c[i];
      if (!Number.isFinite(v)) {
        nonFinite++;
        continue;
      }
      const a = Math.abs(v);
      if (a >= 1) clipped++;
      if (a > peak) peak = a;
      sum += v;
      sq += v * v;
      n++;
    }
    truePeak = Math.max(truePeak, truePeakOf(c));
  }
  const len = channels[0]?.length ?? 0;
  const mono = new Float32Array(len);
  for (const c of channels) for (let i = 0; i < len; i++) mono[i] += (Number.isFinite(c[i]) ? c[i] : 0) / channels.length;
  const clean = channels.map((c) => Float32Array.from(c, (v) => (Number.isFinite(v) ? v : 0)));
  return {
    seconds: len / sr,
    peak,
    truePeak,
    clipped,
    nonFinite,
    lufs: integratedLoudness(clean, sr),
    shortTermMax: maxShortTermLoudness(clean, sr),
    rmsDb: 20 * Math.log10(Math.max(1e-12, Math.sqrt(sq / Math.max(1, n)))),
    dc: sum / Math.max(1, n),
    centroid: spectralCentroid(mono, sr, 1024),
  };
}
