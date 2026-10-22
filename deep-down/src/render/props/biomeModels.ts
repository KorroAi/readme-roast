import type { Rng } from '../../core/rng';
import type { VoxBuilder } from '../voxModel';
import type { ModelBuilder, PropModelOptions } from './models';
import { beam, disc, ring, shade, vary } from './shapes';
import { CLOTH, IRON, ROPE, WOOD, FIRE, ASH } from './palette';

/**
 * Round 3 (VIS): the twelve biomes' ambient props and the new stations (WORLD's BIOMES[b].props and
 * LOOP's stations), in the props' crafted-box style (1/16-1/4 m parts, chamfered by crossed boxes,
 * lit by the light volume; glow only on what really glows). Ground props stand on y = 0; the hanging
 * ones (icicle, hangingRoots, vineCurtain, amberDrip) hang down from y = 0, where they meet the roof
 * (WORLD places them under the ceiling cell, anchored to it).
 *
 * Most of them have nothing to do, so PropRenderer bakes them into its per-cell decor meshes.
 */

type Build = (m: ModelBuilder, rng: Rng, o: PropModelOptions) => void;

const BONE = { light: 0x8c8474, mid: 0x6e675a, dark: 0x4a4439, char: 0x1c1816 } as const;
const STONE = [0x22252b, 0x2c3037, 0x373b43, 0x43474f, 0x50545c] as const;
const LIME = [0x3a3024, 0x4a3d2e, 0x5a4b39, 0x6a5944] as const;
const TEAL = { dark: 0x0a3a36, mid: 0x1a8a7e, glow: 0x5af0dc } as const;
const MAGENTA = { dark: 0x3a0a36, mid: 0x8a2a82, glow: 0xf06ae0 } as const;
const STEMC = { dark: 0x5a5448, mid: 0x7a7262, light: 0x958c7a } as const;
const ICE = { deep: 0x1e4a6a, mid: 0x4a8ab4, light: 0x9ad0ec, white: 0xd8f0fa } as const;
const LEAF = { dark: 0x14301a, mid: 0x24502a, light: 0x3a7a3a, glow: 0x8aff6a } as const;
const SULPH = { dark: 0x4a4a14, mid: 0x8a8a22, light: 0xc8c43a, glow: 0xe0f04a } as const;
const GOLD = { dark: 0x6a4a12, mid: 0xa8801e, light: 0xd8a838, glow: 0xffd060 } as const;
const CITY = [0x3a3324, 0x4a412e, 0x5a4f39, 0x6b5e45, 0x7a6c50] as const;
const BASALTC = [0x1a181a, 0x242124, 0x2e2a2e, 0x393539] as const;
const OBS = { black: 0x0c0a12, dark: 0x16121e, edge: 0x6a4aa8, glow: 0xa070ff } as const;
const BARKC = { dark: 0x2a1e14, mid: 0x3e2c1c, light: 0x5a4430 } as const;

/** A tapered strand hanging from (0,0,0) down `len` m, swaying a little (roots, vines). */
function strand(b: VoxBuilder, rng: Rng, x: number, z: number, len: number, w: number, col: number, glow?: { col: number; every: number; amount: number }): void {
  let px = x;
  let pz = z;
  let py = 0;
  const steps = Math.max(2, Math.round(len / 0.22));
  let dx = 0;
  let dz = 0;
  for (let i = 0; i < steps; i++) {
    dx = dx * 0.6 + rng.range(-0.05, 0.05);
    dz = dz * 0.6 + rng.range(-0.05, 0.05);
    const nx = px + dx;
    const nz = pz + dz;
    const ny = py - len / steps;
    const t = 1 - i / steps;
    beam(b, px, py, pz, nx, ny, nz, w * (0.45 + 0.55 * t), w * (0.45 + 0.55 * t), vary(col, rng, 0.1));
    if (glow && i % glow.every === glow.every - 1) b.cube(nx, ny, nz, w * 2.2, w * 2.6, w * 2.2, glow.col, glow.amount);
    px = nx;
    pz = nz;
    py = ny;
  }
}

/** A bone (shaft with knobbed ends) lying along +x at the current transform. */
function bone(b: VoxBuilder, rng: Rng, len: number, col: number): void {
  const w = 0.035 + len * 0.04;
  b.box(-len / 2, 0, -w / 2, len / 2, w, w / 2, col);
  for (const s of [-1, 1]) {
    b.box(s * len / 2 - w * 0.9, 0, -w, s * len / 2 + w * 0.9, w * 1.5, w, shade(col, 1.05));
  }
  if (rng.chance(0.5)) b.box(-len * 0.2, w, -w * 0.3, len * 0.1, w * 1.15, w * 0.3, shade(col, 0.85));
}

/** A small skull (cranium, brow, sockets, jaw). */
function skull(b: VoxBuilder, col: number, dark: number): void {
  b.box(-0.09, 0, -0.08, 0.09, 0.14, 0.1, col);
  b.box(-0.07, 0.02, 0.1, 0.07, 0.11, 0.15, shade(col, 0.95));
  b.box(-0.06, 0.07, 0.148, -0.015, 0.1, 0.152, dark);
  b.box(0.015, 0.07, 0.148, 0.06, 0.1, 0.152, dark);
  b.box(-0.05, 0, 0.1, 0.05, 0.03, 0.17, shade(col, 0.85));
}

function bonesWith(col: { light: number; mid: number; dark: number }, extra?: (m: ModelBuilder, rng: Rng) => void): Build {
  return (m, rng) => {
    const b = m.body;
    // A ribcage arcing out of the ground, a few long bones, and a skull.
    const rot = rng.range(0, Math.PI);
    b.push().rotateY(rot);
    for (let i = 0; i < 5; i++) {
      const x = -0.2 + i * 0.1;
      for (const s of [-1, 1]) {
        const h = 0.22 - Math.abs(i - 2) * 0.035;
        beam(b, x, 0.02, 0, x + 0.02, h, s * 0.13, 0.025, 0.025, vary(col.mid, rng, 0.08));
        beam(b, x + 0.02, h, s * 0.13, x + 0.03, h + 0.04, s * 0.02, 0.022, 0.022, vary(col.light, rng, 0.08));
      }
    }
    b.box(-0.28, 0, -0.025, 0.28, 0.0525, 0.025, col.light);
    b.pop();
    for (let k = 0; k < rng.int(2, 4); k++) {
      b.push().translate(rng.range(-0.45, 0.45), 0, rng.range(-0.45, 0.45)).rotateY(rng.range(0, Math.PI));
      bone(b, rng, rng.range(0.25, 0.5), vary(col.light, rng, 0.1));
      b.pop();
    }
    b.push().translate(rng.range(0.2, 0.4), 0, rng.range(-0.3, 0.3)).rotateY(rng.range(0, Math.PI * 2));
    skull(b, col.light, col.dark);
    b.pop();
    extra?.(m, rng);
  };
}

const bones: Build = bonesWith(BONE);
const charredBones: Build = bonesWith({ light: 0x3a302a, mid: 0x2a221e, dark: 0x0e0a08 }, (m, rng) => {
  for (let i = 0; i < 7; i++) m.glow.cube(rng.range(-0.4, 0.4), 0.02 + i * 0.003, rng.range(-0.4, 0.4), 0.05, 0.03, 0.05, rng.chance(0.5) ? FIRE.ember : FIRE.coal, 0.7);
});
const frozenBones: Build = bonesWith({ light: 0xa0aab4, mid: 0x7e8a96, dark: 0x3a4656 }, (m, rng) => {
  // Rime: pale crystals grown on the bones.
  for (let i = 0; i < 6; i++) {
    m.glow.push().translate(rng.range(-0.3, 0.3), 0.05, rng.range(-0.25, 0.25)).rotateZ(rng.range(-0.6, 0.6));
    m.glow.crystal(0.025, rng.range(0.06, 0.14), 0.04, 4, ICE.light, ICE.mid, 0.25);
    m.glow.pop();
  }
});

/** Stacked tapering rock: a stalagmite (up) or a stalactite (down). */
function dripstone(b: VoxBuilder, rng: Rng, height: number, base: number, pal: readonly number[], down: boolean): void {
  const tiers = Math.max(3, Math.round(height / 0.22));
  for (let i = 0; i < tiers; i++) {
    const t0 = i / tiers;
    const t1 = (i + 1) / tiers;
    const r = base * (1 - t0 * 0.85);
    const y0 = height * t0;
    const y1 = height * t1;
    const col = vary(pal[Math.min(pal.length - 1, 1 + Math.floor(t0 * (pal.length - 1)))], rng, 0.06);
    b.push().rotateY(rng.range(0, Math.PI / 4)).translate(rng.range(-0.01, 0.01), 0, rng.range(-0.01, 0.01));
    if (down) disc(b, r, -y1, -y0, col);
    else disc(b, r, y0, y1, col);
    b.pop();
  }
}

const stalagmite: Build = (m, rng, o) => {
  const h = [0.7, 1.2, 1.8][o.variant % 3] * rng.range(0.85, 1.1);
  dripstone(m.body, rng, h, 0.16 + h * 0.08, LIME, false);
  // A shorter twin and the flowstone skirt at its foot.
  m.body.push().translate(rng.range(0.18, 0.28), 0, rng.range(-0.15, 0.15));
  dripstone(m.body, rng, h * 0.45, 0.1, LIME, false);
  m.body.pop();
  disc(m.body, 0.3 + h * 0.1, 0, 0.05, LIME[0]);
};

const amberDrip: Build = (m, rng) => {
  // A dripstone of amber resin under the roof: dark crust above, the resin glowing toward the tip.
  const h = rng.range(0.5, 0.9);
  dripstone(m.body, rng, h * 0.45, 0.16, LIME, true);
  for (let i = 0; i < 4; i++) {
    const y0 = -h * 0.4 - i * h * 0.15;
    disc(m.glow, 0.09 * (1 - i * 0.2), y0 - h * 0.15, y0, i < 2 ? 0xb8660e : 0xf0a032, 0.45 + i * 0.12);
  }
  m.glow.cube(0, -h - 0.03, 0, 0.04, 0.06, 0.04, 0xffd07a, 0.9);
  m.glowScale = 1.5;
};

/** A mushroom: stem and cap with glowing gills (and spots) in its colour. */
function mushroom(m: ModelBuilder, rng: Rng, x: number, z: number, h: number, r: number, col: { dark: number; mid: number; glow: number }): void {
  const b = m.body;
  const lean = rng.range(-0.15, 0.15);
  b.push().translate(x, 0, z).rotateZ(lean).rotateY(rng.range(0, Math.PI));
  disc(b, r * 0.22, 0.004, h + 0.01, vary(STEMC.mid, rng, 0.08));
  disc(b, r * 0.3, -0.002, h * 0.12, STEMC.dark);
  // Cap: two tiers, dark velvet top (the upper tier sinks a little into the lower: no shared plane).
  const capCol = vary(col.dark, rng, 0.1);
  disc(b, r, h, h + r * 0.22, capCol);
  disc(b, r * 0.7, h + r * 0.2, h + r * 0.38, shade(capCol, 1.06));
  // Gills underneath glow.
  disc(m.glow, r * 0.92, h - 0.012, h + 0.004, col.mid, 0.7);
  // Spots on top.
  for (let i = 0; i < 4; i++) {
    const a = rng.range(0, Math.PI * 2);
    const rr = rng.range(0.2, 0.75) * r;
    m.glow.cube(Math.cos(a) * rr, h + r * 0.24, Math.sin(a) * rr, r * 0.12, 0.012, r * 0.12, col.glow, 0.85);
  }
  b.pop();
}

const mushroomSmall: Build = (m, rng, o) => {
  const pick = o.variant % 3;
  const n = rng.int(1, 3);
  for (let i = 0; i < n; i++) {
    const col = pick === 0 ? TEAL : pick === 1 ? MAGENTA : i % 2 ? TEAL : MAGENTA;
    mushroom(m, rng, rng.range(-0.15, 0.15), rng.range(-0.15, 0.15), rng.range(0.12, 0.3), rng.range(0.07, 0.13), col);
  }
  m.glowScale = 1.6;
};

const mushroomCluster: Build = (m, rng, o) => {
  const col = o.variant % 2 === 0 ? TEAL : MAGENTA;
  const n = rng.int(4, 7);
  for (let i = 0; i < n; i++) {
    const main = i === 0;
    const a = rng.range(0, Math.PI * 2);
    const rr = main ? 0 : rng.range(0.2, 0.5);
    mushroom(m, rng, Math.cos(a) * rr, Math.sin(a) * rr, main ? rng.range(0.9, 1.4) : rng.range(0.2, 0.6), main ? rng.range(0.3, 0.42) : rng.range(0.08, 0.18), i % 3 === 2 ? (col === TEAL ? MAGENTA : TEAL) : col);
  }
  m.glowScale = 1.7;
};

const sporePuff: Build = (m, rng) => {
  // A round puffball on a short foot, pale spore-spots glowing.
  const b = m.body;
  disc(b, 0.12, 0, 0.06, STEMC.dark);
  for (const [r, y0, y1] of [[0.2, 0.05, 0.12], [0.26, 0.12, 0.3], [0.22, 0.3, 0.4], [0.13, 0.4, 0.45]] as const) disc(b, r, y0, y1, vary(0x4a3a5a, rng, 0.08));
  for (let i = 0; i < 12; i++) {
    const a = rng.range(0, Math.PI * 2);
    const y = rng.range(0.12, 0.42);
    const rr = y < 0.3 ? 0.265 : 0.22;
    m.glow.cube(Math.cos(a) * rr, y, Math.sin(a) * rr, 0.035, 0.035, 0.035, rng.chance(0.5) ? TEAL.glow : MAGENTA.glow, 0.8);
  }
  m.glowScale = 1.5;
};

const hangingRoots: Build = (m, rng) => {
  // A knot of roots under the roof and strands hanging 0.8-2.4 m.
  disc(m.body, 0.25, -0.12, 0, BARKC.dark);
  const n = rng.int(5, 9);
  for (let i = 0; i < n; i++) strand(m.body, rng, rng.range(-0.25, 0.25), rng.range(-0.25, 0.25), rng.range(0.8, 2.4), rng.range(0.03, 0.06), rng.chance(0.5) ? BARKC.mid : BARKC.light);
};

const rootKnot: Build = (m, rng) => {
  // Roots breaking out of the floor and diving back in: arcs of thick bark.
  const b = m.body;
  for (let k = 0; k < rng.int(3, 5); k++) {
    const a = rng.range(0, Math.PI * 2);
    const len = rng.range(0.6, 1.2);
    const h = rng.range(0.15, 0.4);
    const x0 = Math.cos(a) * -len / 2;
    const z0 = Math.sin(a) * -len / 2;
    const x1 = -x0;
    const z1 = -z0;
    const w = rng.range(0.07, 0.13);
    const j = k * 0.004;
    beam(b, x0, -0.05 + j, z0, x0 * 0.3, h + j, z0 * 0.3, w, w * 1.04, vary(BARKC.mid, rng, 0.1));
    beam(b, x0 * 0.3, h + j, z0 * 0.3, x1 * 0.4, h * 0.8 + j, z1 * 0.4, w * 0.96, w, vary(BARKC.light, rng, 0.1));
    beam(b, x1 * 0.4, h * 0.8 + j, z1 * 0.4, x1, -0.05 + j, z1, w * 0.8, w * 0.82, vary(BARKC.dark, rng, 0.1));
  }
  disc(b, 0.2, 0, 0.12, BARKC.dark);
};

const reeds: Build = (m, rng) => {
  const b = m.body;
  for (let i = 0; i < rng.int(10, 16); i++) {
    const x = rng.range(-0.3, 0.3);
    const z = rng.range(-0.3, 0.3);
    const h = rng.range(0.4, 1.0);
    const lx = x + rng.range(-0.12, 0.12);
    const lz = z + rng.range(-0.12, 0.12);
    beam(b, x, 0, z, lx, h, lz, 0.018, 0.018, vary(0x4a5a46, rng, 0.12));
    if (rng.chance(0.4)) beam(b, lx, h, lz, lx + (lx - x) * 0.1, h + 0.12, lz + (lz - z) * 0.1, 0.035, 0.035, 0x2e261c);
  }
  disc(b, 0.3, 0, 0.03, 0x1e2420);
};

const shells: Build = (m, rng) => {
  const b = m.body;
  for (let i = 0; i < rng.int(5, 9); i++) {
    const s = rng.range(0.04, 0.1);
    b.push().translate(rng.range(-0.35, 0.35), 0, rng.range(-0.35, 0.35)).rotateY(rng.range(0, Math.PI * 2));
    // A coiled shell: stacked shrinking discs, nacre lip.
    for (let k = 0; k < 4; k++) disc(b, s * (1 - k * 0.2), k * s * 0.35, (k + 1) * s * 0.35, vary(k % 2 ? 0x8a8478 : 0x6e6a62, rng, 0.06));
    m.glow.box(-s, 0, s * 0.6, s, s * 0.4, s * 0.8, 0xb8c8d8, 0.12);
    b.pop();
  }
  for (let i = 0; i < 5; i++) b.cube(rng.range(-0.4, 0.4), 0.02, rng.range(-0.4, 0.4), 0.06, 0.04, 0.05, STONE[rng.int(1, 3)]);
};

const driftwood: Build = (m, rng) => {
  const b = m.body;
  const len = rng.range(1.2, 2);
  const silver = 0x6e675e;
  b.push().rotateY(rng.range(0, Math.PI)).translate(0, 0.08, 0);
  beam(b, -len / 2, 0, 0, len / 2, 0.04, 0, 0.16, 0.14, silver);
  beam(b, -len / 2, 0.06, 0, len / 2, 0.1, 0, 0.12, 0.04, shade(silver, 1.12));
  for (let k = 0; k < 3; k++) {
    const x = rng.range(-len / 2, len / 2);
    beam(b, x, 0.04, 0, x + rng.range(-0.2, 0.2), rng.range(0.25, 0.5), rng.range(-0.3, 0.3), 0.05, 0.05, shade(silver, 0.95));
  }
  b.pop();
};

const waterfall: Build = (m, rng) => {
  // The lip of a fall: wet mossy stones, glinting.
  const b = m.body;
  for (let i = 0; i < 7; i++) {
    const s = rng.range(0.14, 0.3);
    b.push().translate(rng.range(-0.5, 0.5), 0, rng.range(-0.4, 0.4)).rotateY(rng.range(0, Math.PI));
    b.box(-s / 2, 0, -s / 2, s / 2, s * rng.range(0.5, 0.9), s / 2, vary(0x1e2a32, rng, 0.1));
    b.box(-s / 2 + 0.01, s * 0.5, -s / 2 + 0.01, s / 2 - 0.01, s * 0.55, s / 2 - 0.01, 0x24402e);
    b.pop();
  }
  for (let i = 0; i < 6; i++) m.glow.cube(rng.range(-0.4, 0.4), 0.05, rng.range(-0.3, 0.3), 0.08, 0.02, 0.05, 0x9ac8e0, 0.2);
};

/** Crystal points for spires, shards and ice. */
function crystals(g: VoxBuilder, rng: Rng, n: number, hMin: number, hMax: number, rMax: number, a: number, bcol: number, emissive: number, down = false): void {
  for (let i = 0; i < n; i++) {
    const main = i === 0;
    const ang = rng.range(0, Math.PI * 2);
    const r = main ? 0 : rng.range(0.06, rMax);
    const h = main ? hMax : rng.range(hMin, hMax * 0.6);
    const rad = main ? 0.07 + hMax * 0.05 : rng.range(0.03, 0.07);
    g.push().translate(Math.cos(ang) * r, (down ? -1 : 1) * i * 0.003, Math.sin(ang) * r);
    if (down) g.rotateX(Math.PI);
    g.rotateY(-ang).rotateZ(main ? rng.range(-0.08, 0.08) : -rng.range(0.15, 0.6)).rotateY(rng.range(0, 1.2));
    g.crystal(rad, h, rad * rng.range(1.4, 2.6), rng.pick([5, 6]), a, bcol, main ? emissive : emissive * 0.85);
    g.pop();
  }
}

const crystalSpire: Build = (m, rng, o) => {
  const violet = o.variant % 2 === 0;
  for (let i = 0; i < 6; i++) m.body.cube(rng.range(-0.25, 0.25) + i * 0.0031, 0.05 + i * 0.004, rng.range(-0.25, 0.25) - i * 0.0027, rng.range(0.12, 0.22) + i * 0.0043, 0.1 + i * 0.006, rng.range(0.12, 0.22) + i * 0.0037, STONE[rng.int(0, 2)]);
  crystals(m.glow, rng, rng.int(5, 8), 0.3, rng.range(1.6, 2.8), 0.32, violet ? 0x9a6aff : 0x6ae0f0, violet ? 0x4a2a9a : 0x1a6a8a, 0.55);
  m.anim = 'crystal';
  m.glowScale = 1.6;
};

const geodeShards: Build = (m, rng) => {
  for (let i = 0; i < rng.int(6, 10); i++) {
    const a = rng.range(0, Math.PI * 2);
    const r = rng.range(0.05, 0.45);
    m.glow.push().translate(Math.cos(a) * r, 0, Math.sin(a) * r).rotateY(-a).rotateZ(-rng.range(0.2, 1.2));
    m.glow.crystal(rng.range(0.02, 0.05), rng.range(0.06, 0.22), 0.05, 4, 0x9a6aff, 0x4a2a9a, 0.5);
    m.glow.pop();
  }
  m.glowScale = 1.5;
};

const rail: Build = (m, rng) => {
  // Two metres of mine track along x: sleepers and two worn iron rails, a bent one in places.
  const b = m.body;
  for (let x = -0.9; x <= 0.91; x += 0.3) b.box(x - 0.07, 0, -0.42, x + 0.07, 0.06, 0.42, vary(WOOD.dark, rng, 0.12));
  for (const z of [-0.3, 0.3]) {
    b.box(-1, 0.06, z - 0.025, 1, 0.12, z + 0.025, IRON.mid);
    b.box(-1, 0.115, z - 0.03, 1, 0.13, z + 0.03, IRON.light);
    for (let x = -0.9; x <= 0.91; x += 0.3) b.box(x - 0.02, 0.06, z - 0.05, x + 0.02, 0.075, z + 0.05, IRON.dark);
  }
};

const timberProp: Build = (m, rng) => {
  // A mine set: two posts and a cap beam with wedges, 2.2 m high, 1.9 m across.
  const b = m.body;
  for (const s of [-1, 1]) {
    b.push().translate(s * 0.9, 0, 0).rotateZ(s * 0.06);
    b.box(-0.09, 0, -0.09, 0.09, 2.2, 0.09, vary(WOOD.mid, rng, 0.1));
    b.box(-0.1, -0.002, -0.1, 0.1, 0.15, 0.1, WOOD.dark);
    b.pop();
  }
  b.box(-1.15, 2.15, -0.11, 1.15, 2.37, 0.11, vary(WOOD.dark, rng, 0.08));
  for (const s of [-1, 1]) b.box(s * 0.9 - 0.12, 2.08, -0.05, s * 0.9 + 0.12, 2.155, 0.05, WOOD.light);
  // A nail-board with a faded mark.
  b.box(-0.2, 1.7, 0.11, 0.2, 1.95, 0.13, WOOD.light);
  b.box(-0.12, 1.78, 0.126, 0.12, 1.86, 0.135, 0x2a1a10);
};

const icicle: Build = (m, rng) => {
  disc(m.body, 0.2, -0.06, 0, 0x5a6a80);
  crystals(m.glow, rng, rng.int(5, 9), 0.2, rng.range(0.6, 1.3), 0.22, ICE.light, ICE.mid, 0.22, true);
  m.glowScale = 1.2;
};

const iceSpike: Build = (m, rng) => {
  disc(m.body, 0.3, 0, 0.06, 0x6a7c92);
  crystals(m.glow, rng, rng.int(4, 7), 0.25, rng.range(0.8, 1.7), 0.3, ICE.white, ICE.mid, 0.22);
  m.glowScale = 1.2;
};

const vineCurtain: Build = (m, rng) => {
  for (let i = 0; i < rng.int(7, 12); i++) strand(m.body, rng, rng.range(-0.6, 0.6), rng.range(-0.15, 0.15), rng.range(1.2, 2.8), 0.025, LEAF.mid, { col: LEAF.glow, every: 3, amount: 0.8 });
  // The glowing bulbs ride in the body here: bake them into the glow layer too.
  m.glowScale = 1.4;
};

const fern: Build = (m, rng) => {
  const b = m.body;
  const n = rng.int(6, 9);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + rng.range(-0.2, 0.2);
    const len = rng.range(0.4, 0.7);
    b.push().rotateY(-a).rotateZ(-rng.range(0.5, 0.9));
    b.box(0, -0.01, -0.012, len, 0.01, 0.012, LEAF.dark);
    for (let k = 1; k < 6; k++) {
      const x = (k / 6) * len;
      const w = 0.08 * (1 - k / 7);
      b.box(x - 0.02, -0.006, -w, x + 0.02, 0.006, w, vary(LEAF.mid, rng, 0.1));
    }
    m.glow.cube(len, 0, 0, 0.025, 0.02, 0.025, LEAF.glow, 0.6);
    b.pop();
  }
  m.glowScale = 1.3;
};

const glowBulb: Build = (m, rng) => {
  const b = m.body;
  const h = rng.range(0.4, 0.8);
  beam(b, 0, 0, 0, rng.range(-0.05, 0.05), h, rng.range(-0.05, 0.05), 0.03, 0.03, LEAF.dark);
  for (let i = 0; i < 3; i++) {
    const a = rng.range(0, Math.PI * 2);
    b.push().translate(0, 0.05, 0).rotateY(a).rotateZ(-0.9);
    b.box(0, -0.01, -0.03, 0.25, 0.01, 0.03, LEAF.mid);
    b.pop();
  }
  disc(m.glow, 0.07, h - 0.02, h + 0.1, 0x6af0a0, 0.85);
  disc(m.glow, 0.05, h + 0.1, h + 0.15, 0xb0ffd0, 0.95);
  m.glowScale = 1.8;
};

const gasVent: Build = (m, rng) => {
  const b = m.body;
  for (const [r, y0, y1, c] of [[0.5, 0, 0.08, SULPH.dark], [0.36, 0.08, 0.18, SULPH.mid], [0.22, 0.18, 0.24, SULPH.light]] as const) disc(b, r, y0, y1, vary(c, rng, 0.06));
  disc(b, 0.1, 0.2, 0.245, 0x0c0c06);
  for (let i = 0; i < 6; i++) {
    const a = rng.range(0, Math.PI * 2);
    m.glow.cube(Math.cos(a) * 0.2, 0.23, Math.sin(a) * 0.2, 0.04, 0.02, 0.04, SULPH.glow, 0.5);
  }
  m.glowScale = 1.3;
};

const bogBubble: Build = (m, rng) => {
  disc(m.body, 0.4, 0, 0.06, 0x2a2a14);
  disc(m.body, 0.28, 0.06, 0.1, 0x343418);
  for (const [r, y0, y1] of [[0.14, 0.08, 0.16], [0.18, 0.16, 0.26], [0.13, 0.26, 0.32]] as const) disc(m.glow, r, y0, y1, 0x8ad04a, 0.45);
  m.glow.cube(0.06 + rng.range(-0.03, 0.03), 0.3, 0.04, 0.05, 0.03, 0.04, 0xd8ff8a, 0.8);
  m.glowScale = 1.3;
};

const deadTree: Build = (m, rng) => {
  const b = m.body;
  const h = rng.range(1.8, 2.6);
  const grey = 0x3a3830;
  // A petrified trunk, flaring at its roots, with three bare branches.
  disc(b, 0.24, 0, 0.18, shade(grey, 0.8));
  beam(b, 0, 0.1, 0, rng.range(-0.1, 0.1), h, rng.range(-0.1, 0.1), 0.18, 0.18, grey);
  for (let k = 0; k < 4; k++) {
    const y = h * rng.range(0.45, 0.95);
    const a = rng.range(0, Math.PI * 2);
    const l = rng.range(0.4, 0.9);
    const x1 = Math.cos(a) * l;
    const z1 = Math.sin(a) * l;
    beam(b, 0, y, 0, x1, y + l * 0.6, z1, 0.07, 0.07, shade(grey, 1.08));
    beam(b, x1, y + l * 0.6, z1, x1 * 1.3, y + l * 0.9, z1 * 1.3 + 0.1, 0.035, 0.035, shade(grey, 1.15));
  }
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2 + rng.range(-0.3, 0.3);
    beam(b, 0, 0.12, 0, Math.cos(a) * 0.45, -0.02, Math.sin(a) * 0.45, 0.08, 0.06, shade(grey, 0.9));
  }
};

const statue: Build = (m, rng) => {
  // A robed figure of the old city on a plinth, worn smooth, a gold band at the hem.
  const b = m.body;
  b.box(-0.4, 0, -0.4, 0.4, 0.3, 0.4, CITY[1]);
  b.box(-0.44, 0.3, -0.44, 0.44, 0.36, 0.44, CITY[2]);
  for (const [r, y0, y1, c] of [[0.3, 0.36, 0.9, CITY[2]], [0.25, 0.9, 1.4, CITY[3]], [0.2, 1.4, 1.62, CITY[3]], [0.14, 1.62, 1.86, CITY[4]]] as const) disc(b, r, y0, y1, vary(c, rng, 0.05));
  // Head bowed, hands folded on the chest.
  b.box(-0.1, 1.86, -0.08, 0.1, 2.08, 0.12, CITY[3]);
  b.box(-0.16, 1.2, 0.18, 0.16, 1.32, 0.28, CITY[4]);
  m.glow.push();
  ring(m.glow, { sides: 8, radius: 0.31, thickness: 0.02, y0: 0.4, y1: 0.45, color: () => GOLD.light, emissive: 0.45 });
  m.glow.pop();
  if (rng.chance(0.5)) b.box(0.18, 0.36, -0.2, 0.4, 0.5, 0.1, CITY[0]); // a fallen fragment
};

const urn: Build = (m, rng, o) => {
  const b = m.body;
  const prof: Array<[number, number, number]> = [[0.12, 0, 0.06], [0.22, 0.06, 0.2], [0.27, 0.2, 0.42], [0.22, 0.42, 0.55], [0.12, 0.55, 0.66], [0.16, 0.66, 0.72]];
  prof.forEach(([r, y0, y1], i) => disc(b, r, y0, y1, vary(i % 2 ? CITY[2] : CITY[3], rng, 0.05)));
  m.glow.push();
  ring(m.glow, { sides: 8, radius: 0.27, thickness: 0.015, y0: 0.29, y1: 0.33, color: () => GOLD.mid, emissive: 0.4 });
  m.glow.pop();
  if (o.variant === 1) for (let i = 0; i < 5; i++) b.cube(rng.range(-0.35, 0.35), 0.03, rng.range(-0.35, 0.35), 0.08, 0.05, 0.1, CITY[2]);
};

const brokenColumn: Build = (m, rng) => {
  const b = m.body;
  b.box(-0.45, 0, -0.45, 0.45, 0.2, 0.45, CITY[1]);
  const drums = rng.int(1, 3);
  for (let i = 0; i < drums; i++) {
    b.push().translate(0, 0.2 + i * 0.5, 0).rotateY(rng.range(-0.1, 0.1));
    disc(b, 0.3, 0, 0.48, vary(CITY[2 + (i % 2)], rng, 0.05));
    for (let k = 0; k < 8; k++) b.push().rotateY((k / 8) * Math.PI * 2).box(0.27, 0.02, -0.02, 0.31, 0.46, 0.02, CITY[1]).pop();
    b.pop();
  }
  // A fallen drum on its side.
  b.push().translate(rng.range(0.6, 0.9), 0.28, rng.range(-0.3, 0.3)).rotateY(rng.range(0, Math.PI)).rotateZ(Math.PI / 2);
  disc(b, 0.28, -0.22, 0.22, CITY[2]);
  b.pop();
};

const emberVent: Build = (m, rng) => {
  const b = m.body;
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    b.push().translate(Math.cos(a) * 0.28, 0, Math.sin(a) * 0.28).rotateY(-a);
    b.box(-0.14, 0, -0.1, 0.14, rng.range(0.15, 0.35), 0.1, BASALTC[rng.int(0, 3)]);
    b.pop();
  }
  disc(m.glow, 0.2, 0.02, 0.1, FIRE.orange, 0.9);
  disc(m.glow, 0.1, 0.1, 0.14, FIRE.yellow, 1);
  m.glowScale = 1.9;
};

const basaltColumn: Build = (m, rng) => {
  const b = m.body;
  const n = rng.int(3, 6);
  for (let i = 0; i < n; i++) {
    const h = i === 0 ? rng.range(1.6, 2.6) : rng.range(0.4, 1.6);
    const x = i === 0 ? 0 : rng.range(-0.5, 0.5);
    const z = i === 0 ? 0 : rng.range(-0.5, 0.5);
    b.push().translate(x, 0, z).rotateY(rng.range(0, 1));
    ring(b, { sides: 6, radius: 0.16, thickness: 0.17, y0: 0, y1: h, color: (k) => BASALTC[k % 4] });
    disc(b, 0.18, h, h + 0.03, BASALTC[3]);
    b.pop();
  }
};

const lavaGlow: Build = (m, rng) => {
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + rng.range(-0.2, 0.2);
    m.body.cube(Math.cos(a) * 0.48, 0.06, Math.sin(a) * 0.48, rng.range(0.15, 0.25), rng.range(0.08, 0.16), rng.range(0.15, 0.25), BASALTC[rng.int(0, 3)]);
  }
  disc(m.glow, 0.42, 0, 0.04, 0xd8501a, 0.85);
  for (let i = 0; i < 6; i++) m.glow.cube(rng.range(-0.25, 0.25), 0.045, rng.range(-0.25, 0.25), rng.range(0.08, 0.14), 0.02, rng.range(0.08, 0.14), 0x3a1408, 0.15);
  m.glowScale = 2;
};

const glassShard: Build = (m, rng) => {
  for (let i = 0; i < rng.int(4, 7); i++) {
    const a = rng.range(0, Math.PI * 2);
    const r = rng.range(0, 0.35);
    m.body.push().translate(Math.cos(a) * r, 0, Math.sin(a) * r).rotateY(-a).rotateZ(-rng.range(0.1, 0.7));
    m.body.crystal(rng.range(0.05, 0.12), rng.range(0.2, 0.9), rng.range(0.08, 0.2), 4, OBS.dark, OBS.black, 0);
    m.body.pop();
  }
  for (let i = 0; i < 3; i++) m.glow.cube(rng.range(-0.25, 0.25), rng.range(0.1, 0.5), rng.range(-0.25, 0.25), 0.02, 0.15, 0.02, OBS.edge, 0.5);
  m.glowScale = 1.5;
};

const voidSpire: Build = (m, rng) => {
  const b = m.body;
  const h = rng.range(2, 3.2);
  b.crystal(0.32, h, 0.6, 6, OBS.dark, OBS.black, 0);
  for (let i = 0; i < 5; i++) {
    const y = rng.range(0.3, h);
    const a = rng.range(0, Math.PI * 2);
    const r = 0.3 * (1 - (y / (h + 0.6)) * 0.3);
    m.glow.push().rotateY(-a).translate(r, y, 0);
    m.glow.box(0, -0.12, -0.012, 0.02, 0.12, 0.012, OBS.glow, 0.9);
    m.glow.pop();
  }
  crystals(m.body, rng, 4, 0.3, 0.8, 0.5, OBS.dark, OBS.black, 0);
  m.glowScale = 1.7;
};

const furnace: Build = (m, rng) => {
  // A squat stone furnace: firebox with a glowing mouth, a hood and a chimney, a coal bin.
  const b = m.body;
  b.box(-0.55, 0, -0.45, 0.55, 0.9, 0.45, STONE[2]);
  for (let y = 0.15; y < 0.9; y += 0.2) b.box(-0.56, y, -0.46, 0.56, y + 0.012, 0.46, STONE[0]);
  b.box(-0.6, 0.9, -0.5, 0.6, 1.02, 0.5, STONE[3]);
  b.box(-0.2, 1.02, -0.2, 0.2, 1.9, 0.2, STONE[1]);
  b.box(-0.24, 1.9, -0.24, 0.24, 1.98, 0.24, STONE[3]);
  b.box(-0.28, 0.12, 0.44, 0.28, 0.5, 0.47, 0x0c0908);
  m.glow.box(-0.24, 0.14, 0.46, 0.24, 0.44, 0.48, FIRE.orange, 0.9);
  m.glow.box(-0.16, 0.16, 0.475, 0.16, 0.28, 0.485, FIRE.yellow, 1);
  b.box(-0.3, 0.5, 0.45, 0.3, 0.56, 0.5, IRON.mid);
  b.box(0.65, 0, -0.3, 1.05, 0.3, 0.3, vary(WOOD.dark, rng, 0.1));
  for (let i = 0; i < 6; i++) b.cube(rng.range(0.72, 0.98), 0.32, rng.range(-0.22, 0.22), 0.09, 0.06, 0.09, 0x141418);
  m.glowScale = 2;
};

const alchemyTable: Build = (m, rng) => {
  const b = m.body;
  b.box(-0.6, 0.72, -0.35, 0.6, 0.8, 0.35, WOOD.mid);
  for (const [x, z] of [[-0.52, -0.27], [0.52, -0.27], [-0.52, 0.27], [0.52, 0.27]]) b.box(x - 0.04, 0, z - 0.04, x + 0.04, 0.72, z + 0.04, WOOD.dark);
  b.box(-0.55, 0.2, -0.3, 0.55, 0.24, 0.3, WOOD.dark);
  // Flasks with glowing liquids, a mortar, a brass burner.
  const cols = [0x6af0a0, 0xf06ae0, 0x6ac0ff, 0xffb04a];
  for (let i = 0; i < 4; i++) {
    const x = -0.4 + i * 0.22;
    const z = rng.range(-0.15, 0.1);
    m.glow.push().translate(x, 0.8, z);
    disc(m.glow, 0.06, 0, 0.08, cols[i], 0.75);
    m.glow.pop();
    b.push().translate(x, 0.8, z);
    disc(b, 0.025, 0.08, 0.2, 0x8a9aa8);
    b.pop();
  }
  b.push().translate(0.45, 0.8, 0.15);
  disc(b, 0.08, 0, 0.08, STONE[3]);
  b.pop();
  b.box(0.05, 0.8, 0.12, 0.25, 0.86, 0.3, 0x8a6a2a);
  m.glowScale = 1.6;
};

const outpost: Build = (m) => {
  // A small expedition outpost: an A-frame tent, a lamp post, a bedroll and a chest.
  const b = m.body;
  for (const s of [-1, 1]) {
    b.push().translate(0, 0, -0.2).rotateZ(s * 0.72);
    b.box(-0.02, 0, s > 0 ? -0.75 : -0.752, s * 0.9, 0.03, s > 0 ? 0.75 : 0.752, CLOTH.canvas);
    b.pop();
  }
  b.box(-0.04, 0, -1.0, 0.04, 1.32, -0.92, WOOD.dark);
  b.box(-0.04, 0, 0.52, 0.04, 1.32, 0.6, WOOD.dark);
  beam(b, 0, 1.3, -0.96, 0, 1.3, 0.56, 0.05, 0.05, WOOD.mid);
  // Bedroll inside, a chest beside.
  b.box(-0.3, 0, -0.6, 0.3, 0.1, 0.3, CLOTH.cream);
  b.box(0.95, 0, -0.25, 1.45, 0.36, 0.1, WOOD.mid);
  b.box(0.94, 0.355, -0.26, 1.46, 0.42, 0.11, IRON.mid);
  // The lamp post with its warm lamp.
  b.box(-1.2, 0, 0.3, -1.12, 1.7, 0.38, WOOD.dark);
  b.box(-1.195, 1.62, 0.305, -0.9, 1.68, 0.375, WOOD.mid);
  b.box(-0.99, 1.38, 0.29, -0.89, 1.52, 0.39, IRON.dark);
  m.glow.box(-0.97, 1.4, 0.31, -0.91, 1.5, 0.37, FIRE.yellow, 1);
  // Rope and stakes.
  beam(b, -1.16, 1.6, 0.34, -0.04, 1.28, 0.55, 0.015, 0.015, ROPE.mid);
  m.glowScale = 2;
};

const lairPillar: Build = (m, rng) => {
  // A guardian's standing stone: a rough monolith ringed with a rune band that glows red-rose.
  const b = m.body;
  const h = rng.range(2.2, 3.2);
  b.box(-0.35, 0, -0.3, 0.35, h * 0.9, 0.3, vary(STONE[1], rng, 0.08));
  b.box(-0.28, h * 0.9, -0.24, 0.28, h, 0.24, STONE[2]);
  b.box(-0.45, 0, -0.4, 0.45, 0.2, 0.4, STONE[0]);
  for (const y of [h * 0.55, h * 0.62]) m.glow.box(-0.36, y, -0.31, 0.36, y + 0.04, 0.31, 0xd8486a, 0.75);
  for (let i = 0; i < 3; i++) m.glow.box(-0.08 + i * 0.08 - 0.02, h * 0.66, 0.305, -0.08 + i * 0.08 + 0.02, h * 0.74, 0.31, 0xff6a8a, 0.9);
  for (let i = 0; i < 4; i++) bone(b, rng, rng.range(0.25, 0.4), BONE.light);
  m.glowScale = 1.8;
};

const lairBrazier: Build = (m) => {
  // An iron brazier on three legs, coals burning in it: the arena's warm light.
  const b = m.body;
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    beam(b, Math.cos(a) * 0.3, 0, Math.sin(a) * 0.3, Math.cos(a) * 0.15, 0.8, Math.sin(a) * 0.15, 0.04, 0.04, IRON.dark);
  }
  disc(b, 0.3, 0.8, 0.86, IRON.mid);
  ring(b, { sides: 8, radius: 0.31, thickness: 0.04, y0: 0.855, y1: 1.0, color: (k) => (k % 2 ? IRON.dark : IRON.mid) });
  for (let i = 0; i < 9; i++) m.glow.cube(Math.cos(i) * 0.15, 0.9 + i * 0.004, Math.sin(i * 1.7) * 0.15, 0.08, 0.06, 0.08, i % 3 ? FIRE.ember : FIRE.coal, 0.7);
  disc(m.glow, 0.22, 0.86, 0.9, ASH.light, 0.1);
  m.flames.push({ x: 0, y: 0.9, z: 0, w: 0.5, h: 0.7 });
  m.anim = 'fire';
  m.glowScale = 2.2;
};

/** Round 3 kinds: builder and variant count (models.ts merges them into its tables). */
export const BIOME_PROPS: Record<string, { build: Build; variants: number }> = {
  bones: { build: bones, variants: 3 },
  charredBones: { build: charredBones, variants: 2 },
  frozenBones: { build: frozenBones, variants: 2 },
  stalagmite: { build: stalagmite, variants: 3 },
  amberDrip: { build: amberDrip, variants: 2 },
  mushroomSmall: { build: mushroomSmall, variants: 3 },
  mushroomCluster: { build: mushroomCluster, variants: 2 },
  sporePuff: { build: sporePuff, variants: 2 },
  hangingRoots: { build: hangingRoots, variants: 3 },
  rootKnot: { build: rootKnot, variants: 2 },
  reeds: { build: reeds, variants: 2 },
  shells: { build: shells, variants: 2 },
  driftwood: { build: driftwood, variants: 2 },
  waterfall: { build: waterfall, variants: 1 },
  crystalSpire: { build: crystalSpire, variants: 2 },
  geodeShards: { build: geodeShards, variants: 2 },
  rail: { build: rail, variants: 1 },
  timberProp: { build: timberProp, variants: 1 },
  icicle: { build: icicle, variants: 3 },
  iceSpike: { build: iceSpike, variants: 2 },
  vineCurtain: { build: vineCurtain, variants: 2 },
  fern: { build: fern, variants: 2 },
  glowBulb: { build: glowBulb, variants: 2 },
  gasVent: { build: gasVent, variants: 1 },
  bogBubble: { build: bogBubble, variants: 1 },
  deadTree: { build: deadTree, variants: 2 },
  statue: { build: statue, variants: 2 },
  urn: { build: urn, variants: 2 },
  brokenColumn: { build: brokenColumn, variants: 2 },
  emberVent: { build: emberVent, variants: 1 },
  basaltColumn: { build: basaltColumn, variants: 2 },
  lavaGlow: { build: lavaGlow, variants: 1 },
  glassShard: { build: glassShard, variants: 2 },
  voidSpire: { build: voidSpire, variants: 2 },
  furnace: { build: furnace, variants: 1 },
  alchemyTable: { build: alchemyTable, variants: 1 },
  outpost: { build: outpost, variants: 1 },
  lairPillar: { build: lairPillar, variants: 2 },
  lairBrazier: { build: lairBrazier, variants: 1 },
};

/** Kinds built hanging down from y = 0 (WORLD anchors them to the ceiling cell). */
export const HANGING_KINDS: ReadonlySet<string> = new Set(['icicle', 'hangingRoots', 'vineCurtain', 'amberDrip']);

