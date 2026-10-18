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
