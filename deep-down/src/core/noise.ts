import { hash32 } from './math';

/**
 * Seeded 3D/2D gradient noise (improved Perlin) with fractal helpers.
 * Output of noise3/noise2 is roughly in [-1, 1].
 */
export class Noise {
  private readonly perm = new Uint8Array(512);

  constructor(seed: number) {
    const p = new Uint8Array(256);
    for (let i = 0; i < 256; i++) p[i] = i;
    let s = hash32(seed);
    for (let i = 255; i > 0; i--) {
      s = hash32(s + i);
      const j = s % (i + 1);
      const t = p[i];
      p[i] = p[j];
      p[j] = t;
    }
    for (let i = 0; i < 512; i++) this.perm[i] = p[i & 255];
  }

  noise3(x: number, y: number, z: number): number {
    const p = this.perm;
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const zi = Math.floor(z);
    const X = xi & 255;
    const Y = yi & 255;
    const Z = zi & 255;
    x -= xi;
    y -= yi;
    z -= zi;
    const u = fade(x);
    const v = fade(y);
    const w = fade(z);
    const A = p[X] + Y;
    const AA = p[A] + Z;
    const AB = p[A + 1] + Z;
    const B = p[X + 1] + Y;
    const BA = p[B] + Z;
    const BB = p[B + 1] + Z;
    return lerp(
      w,
      lerp(
        v,
        lerp(u, grad3(p[AA], x, y, z), grad3(p[BA], x - 1, y, z)),
        lerp(u, grad3(p[AB], x, y - 1, z), grad3(p[BB], x - 1, y - 1, z)),
      ),
      lerp(
        v,
        lerp(u, grad3(p[AA + 1], x, y, z - 1), grad3(p[BA + 1], x - 1, y, z - 1)),
        lerp(u, grad3(p[AB + 1], x, y - 1, z - 1), grad3(p[BB + 1], x - 1, y - 1, z - 1)),
      ),
    );
  }

  noise2(x: number, y: number): number {
    return this.noise3(x, y, 0.5);
  }

  /** Fractal Brownian motion, normalized to roughly [-1, 1]. */
  fbm3(x: number, y: number, z: number, octaves = 3, lacunarity = 2, gain = 0.5): number {
    let amp = 1;
    let freq = 1;
    let sum = 0;
    let norm = 0;
    for (let o = 0; o < octaves; o++) {
      sum += amp * this.noise3(x * freq, y * freq, z * freq);
      norm += amp;
      amp *= gain;
      freq *= lacunarity;
    }
    return sum / norm;
  }

  fbm2(x: number, y: number, octaves = 3): number {
    return this.fbm3(x, y, 0.37, octaves);
  }

  /** Ridged noise in [0, 1]; sharp crests useful for veins and cracks. */
  ridged3(x: number, y: number, z: number): number {
    return 1 - Math.abs(this.noise3(x, y, z));
  }
}

function fade(t: number): number {
  return t * t * t * (t * (t * 6 - 15) + 10);
}

function lerp(t: number, a: number, b: number): number {
  return a + t * (b - a);
}

function grad3(hash: number, x: number, y: number, z: number): number {
  const h = hash & 15;
  const u = h < 8 ? x : y;
  const v = h < 4 ? y : h === 12 || h === 14 ? x : z;
  return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
}
