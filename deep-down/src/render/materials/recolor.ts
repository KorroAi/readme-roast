import type { MatCanvas, Rng } from './paint';
import type { MaterialPainter } from './painters';

/**
 * A new material from an existing painter's structure in another palette (the descent's ores, gems and
 * fittings until W2's own painters): the base painting's luminance, normalised over its range, is mapped
 * through `ramp` (sRGB stops, dark to light). Alpha (height or emissive mask) is kept, so boundaries,
 * glints and glow behave as the base's do. `lift` brightens the result (valuables must read at
 * >= 1.6:1 against their host rock, CRITIQUE B6).
 */
export function recolor(base: MaterialPainter, ramp: readonly number[], lift = 1): MaterialPainter {
  return (c: MatCanvas, rng: Rng) => {
    base(c, rng);
    const n = c.size * c.size;
    let lo = Infinity;
    let hi = -Infinity;
    const lum = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const l = 0.2126 * c.rgb[i * 3] + 0.7152 * c.rgb[i * 3 + 1] + 0.0722 * c.rgb[i * 3 + 2];
      lum[i] = l;
      if (l < lo) lo = l;
      if (l > hi) hi = l;
    }
    const span = Math.max(1, hi - lo);
    const last = ramp.length - 1;
    for (let i = 0; i < n; i++) {
      const t = Math.min(1, Math.max(0, (lum[i] - lo) / span)) * last;
      const k = Math.min(last - 1, Math.floor(t));
      const f = t - k;
      const a = ramp[k];
      const b = ramp[k + 1];
      c.rgb[i * 3] = Math.min(255, (((a >> 16) & 255) * (1 - f) + ((b >> 16) & 255) * f) * lift);
      c.rgb[i * 3 + 1] = Math.min(255, (((a >> 8) & 255) * (1 - f) + ((b >> 8) & 255) * f) * lift);
      c.rgb[i * 3 + 2] = Math.min(255, ((a & 255) * (1 - f) + (b & 255) * f) * lift);
    }
  };
}
