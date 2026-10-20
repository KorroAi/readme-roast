import type { Rng } from '../../core/rng';
import type { ModelBuilder } from './models';
import { shade, vary } from './shapes';

/**
 * The biome dressing kinds of SPEC §11.3 (W2): mushrooms, stalagmites, roots, urns, coral, bones and ribs, gears,
 * ice spires, sunstone shards, null-glass shards and pebble scatter. Low-poly (the cavern batches merge dozens of
 * them per slab), each with one emissive accent so caverns glow in their biome's colour. Every model stands on y = 0.
 */

export function mushroom(m: ModelBuilder, rng: Rng): void {
  const b = m.body;
  const g = m.glow;
  const big = rng.next() < 0.4;
  const h = big ? rng.range(1.2, 1.8) : rng.range(0.35, 0.7);
  const w = big ? rng.range(0.7, 1.0) : rng.range(0.22, 0.38);
  b.box(-w * 0.16, 0, -w * 0.16, w * 0.16, h, w * 0.16, vary(0xd8c8b0, rng, 0.06));
  const cap = rng.pick([0x8a4a9a, 0x6a3a8a, 0xa85a6a, 0x5a7a3a]);
  b.box(-w * 0.55, h, -w * 0.55, w * 0.55, h + w * 0.18, w * 0.55, cap);
  b.box(-w * 0.4, h + w * 0.18, -w * 0.4, w * 0.4, h + w * 0.3, w * 0.4, shade(cap, 1.15));
  // The gills glow (the biome's light pools under every cap).
  g.box(-w * 0.5, h - 0.03, -w * 0.5, w * 0.5, h, w * 0.5, rng.pick([0xc58cff, 0xa8ff6a, 0xff9aff]), 0.9);
  for (let i = 0; i < 3; i++) g.box(-w * 0.3 + i * w * 0.25, h + w * 0.2, w * 0.38, -w * 0.25 + i * w * 0.25, h + w * 0.26, w * 0.42, 0xffffff, 0.7);
  m.glowScale = 1.6;
}

export function stalagmite(m: ModelBuilder, rng: Rng): void {
  const b = m.body;
  const h = rng.range(0.8, 2.2);
  const base = rng.pick([0x6a6a72, 0x5a5048, 0x3a3436, 0x7a7a82]);
  const steps = 4;
  for (let i = 0; i < steps; i++) {
    const w = (0.38 * (steps - i)) / steps + 0.05;
    b.box(-w, (h * i) / steps, -w, w, (h * (i + 1)) / steps, w, shade(base, 0.85 + i * 0.08));
  }
  m.glow.box(-0.05, h * 0.3, 0.12, 0.05, h * 0.6, 0.2, 0x8fe3ee, 0.6);
}

export function root(m: ModelBuilder, rng: Rng): void {
  const b = m.body;
  const n = rng.int(3, 5);
  for (let i = 0; i < n; i++) {
    const len = rng.range(0.8, 1.8);
    b.push().translate(rng.range(-0.4, 0.4), 0.12 + rng.range(0, 0.3), rng.range(-0.3, 0.3)).rotateY(rng.range(0, 3)).rotateZ(rng.range(-0.9, 0.9));
    b.box(-0.06, 0, -0.06, 0.06, len, 0.06, vary(0x5a4030, rng, 0.12));
    b.pop();
  }
  m.glow.box(-0.08, 0.05, -0.08, 0.08, 0.16, 0.08, 0x9be7a8, 0.8);
}

export function urn(m: ModelBuilder, rng: Rng): void {
  const b = m.body;
  const c = rng.pick([0x7a5a3a, 0x5a6a7a, 0x8a6a4a]);
  b.box(-0.16, 0, -0.16, 0.16, 0.08, 0.16, shade(c, 0.8));
  b.box(-0.26, 0.08, -0.26, 0.26, 0.5, 0.26, c);
  b.box(-0.2, 0.5, -0.2, 0.2, 0.62, 0.2, shade(c, 1.1));
  b.box(-0.13, 0.62, -0.13, 0.13, 0.72, 0.13, shade(c, 0.9));
  m.glow.box(-0.27, 0.28, -0.27, 0.27, 0.32, 0.27, 0xe2b673, 0.6);
}

export function coral(m: ModelBuilder, rng: Rng): void {
  const g = m.glow;
  const b = m.body;
  b.box(-0.2, 0, -0.2, 0.2, 0.1, 0.2, 0x5a5a6a);
  const n = rng.int(4, 7);
  const c = rng.pick([0xff7aa0, 0x5fb7ff, 0xffa060]);
  for (let i = 0; i < n; i++) {
    g.push().translate(rng.range(-0.15, 0.15), 0.08, rng.range(-0.15, 0.15)).rotateZ(rng.range(-0.6, 0.6)).rotateX(rng.range(-0.4, 0.4));
    g.box(-0.035, 0, -0.035, 0.035, rng.range(0.3, 0.8), 0.035, vary(c, rng, 0.1), 0.6);
    g.pop();
  }
  m.glowScale = 1.4;
}

export function bone(m: ModelBuilder, rng: Rng): void {
  const b = m.body;
  const n = rng.int(2, 4);
  for (let i = 0; i < n; i++) {
    b.push().translate(rng.range(-0.3, 0.3), 0.08 + i * 0.017, rng.range(-0.25, 0.25)).rotateY(rng.range(0, 3) + i * 0.7);
    b.box(-0.45, -0.05, -0.05, 0.45, 0.05, 0.05, vary(0xd8ccb0, rng, 0.06));
    b.box(-0.5, -0.08, -0.08, -0.4, 0.08, 0.08, 0xe8dcc0);
    b.box(0.4, -0.08, -0.08, 0.5, 0.08, 0.08, 0xe8dcc0);
    b.pop();
  }
  m.glow.box(-0.06, 0.0, -0.06, 0.06, 0.08, 0.06, 0xffb000, 0.8);
}

export function rib(m: ModelBuilder, rng: Rng): void {
  const b = m.body;
  const h = rng.range(1.6, 2.6);
  const segs = 6;
  for (let i = 0; i < segs; i++) {
    const t0 = i / segs;
    const x = Math.sin(t0 * Math.PI * 0.6) * 0.8;
    b.push().translate(x, h * t0, 0).rotateZ(-t0 * 1.2);
    const zt = 0.05 + (i % 2) * 0.012;
    b.box(-0.07 + (i % 2) * 0.01, 0, -zt, 0.07 - (i % 2) * 0.01, h / segs + 0.05, zt, shade(0xd8ccb0, 0.9 + t0 * 0.15));
    b.pop();
  }
  m.glow.box(-0.05, 0, -0.05, 0.05, 0.1, 0.05, 0xd0c8ff, 0.7);
}

export function gear(m: ModelBuilder, rng: Rng): void {
  const b = m.body;
  const r = rng.range(0.5, 0.9);
  const c = rng.pick([0x8a7040, 0x6a7080, 0x9a8048]);
  b.push().translate(0, r, 0);
  b.box(-r * 0.7, -r * 0.7, -0.06, r * 0.7, r * 0.7, 0.06, c);
  b.push().rotateZ(0.785).box(-r * 0.7, -r * 0.7, -0.05, r * 0.7, r * 0.7, 0.05, shade(c, 0.9)).pop();
  for (let i = 0; i < 10; i++) b.push().rotateZ((i / 10) * Math.PI * 2).box(-0.07, r * 0.72, -0.07, 0.07, r * 0.95, 0.07, shade(c, 1.1)).pop();
  m.glow.push().translate(0, r, 0.06).box(-0.1, -0.1, 0, 0.1, 0.1, 0.03, 0x8fb8ff, 0.8).pop();
  b.pop();
}

export function iceSpire(m: ModelBuilder, rng: Rng): void {
  const g = m.glow;
  const h = rng.range(1.0, 2.4);
  g.push().translate(0, 0.06, 0).crystal(rng.range(0.14, 0.22), h, 0.35, 6, 0xbfe8ff, 0x5a8aaa, 0.35).pop();
  g.push().translate(0.2, 0.08, 0.05).rotateZ(-0.3).crystal(0.08, h * 0.5, 0.18, 5, 0xd8f4ff, 0x6a9aba, 0.3).pop();
  m.body.box(-0.25, 0, -0.25, 0.25, 0.08, 0.25, 0xa8c4e0);
  m.glowScale = 1.2;
}

export function sunshard(m: ModelBuilder, rng: Rng): void {
  const g = m.glow;
  const h = rng.range(0.6, 1.5);
  g.push().translate(0, 0.07, 0).rotateZ(rng.range(-0.3, 0.3)).crystal(rng.range(0.1, 0.18), h, 0.25, 5, 0xfff1c2, 0xc89040, 0.95).pop();
  g.push().translate(-0.18, 0.1, 0.08).rotateZ(0.5).crystal(0.07, h * 0.45, 0.12, 5, 0xffd080, 0xa87030, 0.9).pop();
  m.body.box(-0.22, 0, -0.22, 0.22, 0.06, 0.22, 0x5a4a30);
  m.glowScale = 2.4;
  m.anim = 'crystal';
}

export function nullShard(m: ModelBuilder, rng: Rng): void {
  const g = m.glow;
  const h = rng.range(0.7, 1.8);
  g.push().translate(0, 0.07, 0).rotateZ(rng.range(-0.25, 0.25)).crystal(rng.range(0.12, 0.2), h, 0.3, 4, 0x8a7aff, 0x1a1440, 0.7).pop();
  g.push().translate(0.2, 0.12, -0.06).rotateZ(-0.6).crystal(0.07, h * 0.5, 0.14, 4, 0xd8e0ff, 0x2a2060, 0.6).pop();
  m.body.box(-0.2, 0, -0.2, 0.2, 0.05, 0.2, 0x1a1428);
  m.glowScale = 2;
}

export function pebbles(m: ModelBuilder, rng: Rng): void {
  const b = m.body;
  const n = rng.int(3, 6);
  const c = rng.pick([0x7a6a5a, 0x6a6a72, 0x5a5048, 0x8a7a68]);
  for (let i = 0; i < n; i++) {
    const s = rng.range(0.05, 0.14);
    b.push().translate(rng.range(-0.35, 0.35), 0, rng.range(-0.35, 0.35)).rotateY(rng.range(0, 3));
    b.box(-s, 0, -s * 0.8, s, s * 1.2, s * 0.8, vary(c, rng, 0.12));
    b.pop();
  }
  if (rng.next() < 0.35) m.glow.box(-0.03, 0, -0.03, 0.03, 0.05, 0.03, rng.pick([0xffd060, 0x8fe3ee, 0xc58cff]), 0.9);
}
