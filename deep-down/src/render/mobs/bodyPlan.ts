import { SPECIES } from '../../game/mobs/species';
import type { MobKind } from '../../game/mobs/types';
import { block, boulder as boulderRaw, crystal, ellipsoid as ellipsoidRaw, fin, lathe as latheRaw, limb as limbRaw, merge, ModelBuilder, place, type PartLook } from './rig';
import type { MobLook } from './mobMaterial';
import type { MobModel } from './models';

/**
 * The modular body builder (round 3, MOBS; BRIEF §0.5): the rosters' creatures are composed from a
 * kit of sculpted parts (segmented bodies, heads with mandibles, maws or beaks, jointed legs,
 * arms with fists, claws, scythes or pincers, bat and insect wings, tails, shells, plates, crystal
 * spines, tendrils, glowing eyes and veins), each skinned per biome. One geometry per kind, every
 * part bound to a named bone the generic poser (poses.ts `poseGeneric`) animates by archetype:
 * legs walk (bones 'u' and 'l' per leg), wings flap ('w', 'wt'), arms raise and slam ('ua', 'fa'),
 * jaws open ('jaw'), tails, segments and tendrils sway ('t', 'seg', 'tn'), lids lift ('lid', as the Gnasher's).
 *
 * Model space: +z forward, +y up, the origin the creature's position; a walker's feet are at
 * y = -lift (its species' lift), so the drawn body matches the simulated capsule.
 */
type P3 = [number, number, number];

/**
 * Detail by size: a tiny swarmer seen in packs needs far fewer facets than a guardian (the
 * triangle budget, BRIEF §4: 30+ creatures in view). Set per plan by `bodyPlanModel`; the
 * primitives below scale their segment counts by it (never under a floor that keeps them round).
 */
let DETAIL = 1;
const DETAIL_BY_SIZE: Record<string, number> = { tiny: 0.5, small: 0.68, medium: 0.85, large: 1, huge: 1 };
const seg = (n: number, floor: number) => Math.max(floor, Math.round(n * DETAIL));
function ellipsoid(rx: number, ry: number, rz: number, at: P3 = [0, 0, 0], n = 18, lump = 0, seed = 1) {
  return ellipsoidRaw(rx, ry, rz, at, seg(n, 6), lump, seed);
}
function limb(a: P3, b: P3, ra: number, rb: number, n = 8) {
  return limbRaw(a, b, ra, rb, seg(n, 4));
}
function lathe(profile: Array<[number, number]>, n = 20, at: P3 = [0, 0, 0]) {
  return latheRaw(profile, seg(n, 8), at);
}
function boulder(r: number, seedN: number, amp = 0.22, detail = 4, squash = 0.82) {
  return boulderRaw(r, seedN, amp, DETAIL < 0.75 ? Math.max(1, detail - 1) : detail, squash);
}

interface Skin {
  /** Base, top (back) and belly colours; accent (horns, claws, plates); glow (eyes, veins, sacs). */
  c: number;
  t?: number;
  a: number;
  g: number;
  /** Glow strength 0..1 of the glowing parts. */
  e?: number;
  gloss?: number;
  sss?: number;
  rim?: number;
  look?: MobLook;
}

const L = (s: Skin, y0: number, y1: number, extra: Partial<PartLook> = {}): PartLook => ({ color: s.c, top: s.t ?? s.c, y0, y1, gloss: s.gloss ?? 0.5, sss: s.sss ?? 0.4, rim: s.rim ?? 0.55, ...extra });
const A = (s: Skin, extra: Partial<PartLook> = {}): PartLook => ({ color: s.a, gloss: 0.7, rim: 0.6, ...extra });
const G = (s: Skin, k = 1): PartLook => ({ color: s.g, emit: Math.min(1, (s.e ?? 0.6) * k) });

function eyes(b: ModelBuilder, bone: string, at: P3, n: number, r: number, spread: number, s: Skin): void {
  for (let i = 0; i < n; i++) {
    const k = n === 1 ? 0 : (i / (n - 1) - 0.5) * 2;
    const x = at[0] + k * spread;
    const y = at[1] + (n > 2 ? Math.abs(k) * -r * 0.8 : 0);
    b.add(ellipsoid(r, r, r * 0.8, [x, y, at[2]], 8), bone, G(s, 1.2));
  }
}

function spines(b: ModelBuilder, bone: string | number, from: P3, to: P3, n: number, len: number, r: number, look: PartLook, tilt = -0.35): void {
  for (let i = 0; i < n; i++) {
    const k = n === 1 ? 0.5 : i / (n - 1);
    const p: P3 = [from[0] + (to[0] - from[0]) * k, from[1] + (to[1] - from[1]) * k, from[2] + (to[2] - from[2]) * k];
    const l = len * (0.7 + 0.3 * Math.sin(k * Math.PI));
    b.add(crystal(l, r, p, [0, 1, tilt], 0, 5), bone, { ...look, flat: true });
  }
}

/** A pair of jointed legs: upper bone `u{i}{s}`, lower `l{i}{s}`, hip -> knee -> foot. */
function leg(b: ModelBuilder, parent: string, i: number, side: number, hip: P3, knee: P3, foot: P3, r: number, up: PartLook, lo: PartLook): void {
  const u = b.bone(`u${i}${side}`, parent, hip);
  const l = b.bone(`l${i}${side}`, u, knee);
  b.add(limb(hip, knee, r, r * 0.75, 7), u, up);
  b.add(limb(knee, foot, r * 0.75, r * 0.3, 7), l, lo);
  b.add(ellipsoid(r * 0.85, r * 0.85, r * 0.85, knee, 7), l, up);
}

// ---------------------------------------------------------------------------------------
// Templates

interface BugP {
  len: number;
  w: number;
  h: number;
  segs: number;
  pairs: number;
  legLen: number;
  head: number;
  shell?: boolean;
  spines?: number;
  eyes?: number;
  slug?: boolean;
  tailSpike?: boolean;
  /** A weevil's long rostrum (m). */
  snout?: number;
  /** Antennae with glowing tips (m). */
  antennae?: number;
}

/** Swarmers: a segmented body, a head with mandibles, insect legs; shells, spines; or a legless slug. */
function bug(lift: number, p: BugP, s: Skin): MobModel {
  const b = new ModelBuilder();
  const F = -lift;
  b.bone('body', -1, [0, 0, 0]);
  b.bone('head', 'body', [0, 0.02, p.len * 0.45]);
  b.bone('tail', 'body', [0, 0, -p.len * 0.35]);
  for (let i = 0; i < p.segs; i++) {
    const z = p.len * (0.3 - (i / Math.max(1, p.segs - 1)) * 0.7);
    const k = 1 - Math.abs(i / Math.max(1, p.segs - 1) - 0.35) * 0.5;
    b.add(ellipsoid(p.w * k, p.h * k, p.len / p.segs * 0.75, [0, 0, z], 16, 0.05, i + 2), i > p.segs * 0.6 ? 'tail' : 'body', L(s, -p.h, p.h));
    if (p.shell) b.add(ellipsoid(p.w * k * 1.05, p.h * k * 0.55, p.len / p.segs * 0.7, [0, p.h * k * 0.55, z], 14), i > p.segs * 0.6 ? 'tail' : 'body', A(s, { gloss: 0.9, top: s.t ?? s.a, y0: 0, y1: p.h }));
  }
  if (p.spines) spines(b, 'body', [0, p.h * 0.9, p.len * 0.25], [0, p.h * 0.8, -p.len * 0.3], p.spines, p.h * 0.9, p.w * 0.14, A(s));
  if (p.tailSpike) b.add(crystal(p.len * 0.35, p.w * 0.18, [0, 0, -p.len * 0.42], [0, 0.3, -1], 0, 5), 'tail', A(s, { flat: true }));
  // The head and its mandibles.
  const hz = p.len * 0.5;
  b.add(ellipsoid(p.head, p.head * 0.8, p.head * 1.1, [0, 0.01, hz], 16, 0.03, 9), 'head', L(s, -p.head, p.head, { gloss: 0.7 }));
  eyes(b, 'head', [0, p.head * 0.35, hz + p.head * 0.85], p.eyes ?? 2, p.head * 0.18, p.head * 0.45, s);
  if (p.snout) b.add(limb([0, -p.head * 0.05, hz + p.head * 0.75], [0, -p.head * 0.75, hz + p.head * 0.8 + p.snout], p.head * 0.24, p.head * 0.09, 7), 'head', L(s, -p.head, p.head, { gloss: 0.85 }));
  if (p.antennae) {
    for (const side of [-1, 1]) {
      const tip: P3 = [p.head * 0.95 * side, p.head * 0.55 + p.antennae * 0.55, hz + p.head * 0.7 + p.antennae * 0.65];
      b.add(limb([p.head * 0.3 * side, p.head * 0.5, hz + p.head * 0.65], tip, p.head * 0.07, p.head * 0.035, 4), 'head', A(s));
      b.add(ellipsoid(p.head * 0.13, p.head * 0.13, p.head * 0.13, tip, 6), 'head', G(s, 1.2));
    }
  }
  for (const side of [-1, 1]) {
    b.bone(`jaw${side}`, 'head', [p.head * 0.4 * side, -p.head * 0.3, hz + p.head * 0.8]);
    b.add(merge([limb([p.head * 0.4 * side, -p.head * 0.3, hz + p.head * 0.8], [p.head * 0.75 * side, -p.head * 0.45, hz + p.head * 1.4], p.head * 0.16, p.head * 0.1, 6), limb([p.head * 0.75 * side, -p.head * 0.45, hz + p.head * 1.4], [p.head * 0.3 * side, -p.head * 0.5, hz + p.head * 1.8], p.head * 0.1, p.head * 0.03, 6)]), `jaw${side}`, A(s));
  }
  if (!p.slug) {
    for (let i = 0; i < p.pairs; i++) {
      const z = p.len * (0.22 - (i / Math.max(1, p.pairs - 1)) * 0.42);
      for (const side of [-1, 1]) {
        const hip: P3 = [p.w * 0.7 * side, -p.h * 0.2, z];
        const knee: P3 = [(p.w + p.legLen * 0.55) * side, p.h * 0.7, z + (i - (p.pairs - 1) / 2) * 0.04];
        const foot: P3 = [(p.w + p.legLen) * side, F, z + (i - (p.pairs - 1) / 2) * 0.09];
        leg(b, 'body', i, side, hip, knee, foot, Math.max(0.012, p.w * 0.13), L(s, -p.h, p.h), A(s));
      }
    }
  } else {
    // A slug's foot: a flattened skirt, and a glowing seam along its flank.
    b.add(ellipsoid(p.w * 1.15, p.h * 0.35, p.len * 0.5, [0, F + p.h * 0.3, 0], 18), 'body', L(s, F, 0, { sss: 0.8, gloss: 0.9 }));
    for (const side of [-1, 1]) b.add(limb([p.w * 0.85 * side, 0, p.len * 0.3], [p.w * 0.8 * side, -p.h * 0.1, -p.len * 0.35], p.w * 0.05, p.w * 0.04, 5), 'body', G(s, 0.6));
  }
  return { ...b.build(), look: { bump: 0.006, bumpFreq: 34, sssTint: 0xff8c78, glowTint: s.g, pulse: 1.2, ...s.look } };
}

interface QuadP {
  len: number;
  w: number;
  h: number;
  legLen: number;
  head: number;
  snout: number;
  ears?: 'none' | 'pointy' | 'round';
  horns?: number;
  back?: 'none' | 'thorns' | 'crystals' | 'fur' | 'cracks';
  tail: number;
  tailTip?: 'none' | 'tuft' | 'flame' | 'club';
  loot?: boolean;
  /** Tusks curving up from the jaw's corners (a boar), their length (m). */
  tusks?: number;
}

/** Chargers and small beasts: four legs, a long body, a snouted head with a jaw, ears, horns, a tail. */
function quad(lift: number, p: QuadP, s: Skin): MobModel {
  const b = new ModelBuilder();
  const F = -lift;
  b.bone('body', -1, [0, 0, 0]);
  b.bone('head', 'body', [0, p.h * 0.35, p.len * 0.45]);
  b.bone('jaw', 'head', [0, p.h * 0.15, p.len * 0.5 + p.head * 0.4]);
  b.add(ellipsoid(p.w, p.h, p.len * 0.55, [0, 0, 0], 20, 0.05, 3), 'body', L(s, -p.h, p.h));
  b.add(ellipsoid(p.w * 0.95, p.h * 0.9, p.len * 0.3, [0, p.h * 0.12, p.len * 0.25], 16), 'body', L(s, -p.h, p.h));
  // Head.
  const hz = p.len * 0.55;
  const hy = p.h * 0.45;
  b.add(ellipsoid(p.head, p.head * 0.85, p.head, [0, hy, hz], 16, 0.04, 7), 'head', L(s, hy - p.head, hy + p.head));
  b.add(ellipsoid(p.head * 0.55, p.head * 0.45, p.snout, [0, hy - p.head * 0.15, hz + p.head * 0.6 + p.snout * 0.5], 12), 'head', L(s, hy - p.head, hy + p.head));
  b.add(ellipsoid(p.head * 0.5, p.head * 0.22, p.snout * 0.9, [0, hy - p.head * 0.55, hz + p.head * 0.5 + p.snout * 0.45], 12), 'jaw', L(s, hy - p.head, hy, { color: s.a }));
  for (let i = 0; i < 4; i++) {
    for (const side of [-1, 1]) b.add(crystal(p.head * 0.22, p.head * 0.05, [p.head * 0.18 * side + i * 0.002, hy - p.head * 0.3, hz + p.head * 0.5 + p.snout * (0.3 + i * 0.18)], [0, -1, 0.15], 0, 4), 'head', { color: 0xf0e8d8, gloss: 0.8, flat: true });
  }
  eyes(b, 'head', [0, hy + p.head * 0.3, hz + p.head * 0.7], 2, p.head * 0.13, p.head * 0.5, s);
  if (p.ears && p.ears !== 'none') {
    for (const side of [-1, 1]) {
      b.bone(`ear${side}`, 'head', [p.head * 0.55 * side, hy + p.head * 0.6, hz - p.head * 0.1]);
      const g = p.ears === 'pointy' ? crystal(p.head * 0.7, p.head * 0.22, [p.head * 0.55 * side, hy + p.head * 0.6, hz - p.head * 0.1], [0.4 * side, 1, -0.3], 0, 4) : ellipsoid(p.head * 0.3, p.head * 0.35, p.head * 0.1, [p.head * 0.65 * side, hy + p.head * 0.75, hz - p.head * 0.1], 10);
      b.add(g, `ear${side}`, L(s, hy, hy + p.head * 1.5));
    }
  }
  if (p.tusks) {
    for (const side of [-1, 1]) {
      const root: P3 = [p.head * 0.42 * side, hy - p.head * 0.42, hz + p.head * 0.55 + p.snout * 0.55];
      b.add(merge([limb(root, [root[0] + p.tusks * 0.25 * side, root[1] + p.tusks * 0.35, root[2] + p.tusks * 0.45], p.head * 0.07, p.head * 0.05, 6), crystal(p.tusks * 0.55, p.head * 0.05, [root[0] + p.tusks * 0.25 * side, root[1] + p.tusks * 0.35, root[2] + p.tusks * 0.45], [0.2 * side, 1, 0.25], 0, 5)]), 'jaw', { color: 0xf2e6cc, gloss: 0.8, rim: 0.6, flat: true });
    }
  }
  for (let i = 0; i < (p.horns ?? 0); i++) {
    for (const side of [-1, 1]) b.add(crystal(p.head * (1.1 - i * 0.3), p.head * 0.16, [p.head * (0.35 + i * 0.12) * side, hy + p.head * 0.55, hz + p.head * (0.2 - i * 0.25)], [0.6 * side, 0.8, 0.5 - i * 0.4], 0, 5), 'head', A(s, { flat: true }));
  }
  // Back.
  if (p.back === 'thorns') spines(b, 'body', [0, p.h * 0.9, p.len * 0.3], [0, p.h * 0.7, -p.len * 0.45], 7, p.h * 0.8, p.w * 0.1, A(s), -0.6);
  else if (p.back === 'crystals') spines(b, 'body', [0, p.h * 0.85, p.len * 0.3], [0, p.h * 0.7, -p.len * 0.4], 6, p.h * 0.9, p.w * 0.13, A(s, { emit: 0.25 }), -0.4);
  else if (p.back === 'fur') for (let i = 0; i < 6; i++) b.add(ellipsoid(p.w * 0.7, p.h * 0.25, p.len * 0.12, [0, p.h * 0.85, p.len * (0.3 - i * 0.13)], 12, 0.15, i), 'body', A(s, { sss: 0.6, gloss: 0.2 }));
  else if (p.back === 'cracks') for (let i = 0; i < 5; i++) b.add(limb([p.w * 0.6 * (i % 2 ? 1 : -1), p.h * 0.5, p.len * (0.3 - i * 0.15)], [p.w * 0.2 * (i % 2 ? -1 : 1), p.h * 0.95, p.len * (0.22 - i * 0.15)], p.w * 0.05, p.w * 0.03, 5), 'body', G(s, 0.9));
  // Legs.
  for (const [i, z] of [[0, p.len * 0.35], [1, -p.len * 0.35]] as const) {
    for (const side of [-1, 1]) {
      const hip: P3 = [p.w * 0.7 * side, -p.h * 0.1, z];
      const knee: P3 = [p.w * 0.85 * side, F + p.legLen * 0.5, z + (i === 0 ? -0.04 : 0.05)];
      const foot: P3 = [p.w * 0.85 * side, F, z + (i === 0 ? 0.03 : -0.02)];
      leg(b, 'body', i, side, hip, knee, foot, Math.max(0.03, p.w * 0.28), L(s, F, p.h), L(s, F, p.h, { color: s.a }));
    }
  }
  // Tail.
  let parent = 'body';
  for (let i = 0; i < 3; i++) {
    const z0 = -p.len * 0.5 - (i * p.tail) / 3;
    const bone = b.bone(`t${i}`, parent, [0, p.h * 0.2, z0]);
    b.add(limb([0, p.h * 0.2, z0], [0, p.h * 0.2 + i * 0.02, z0 - p.tail / 3], p.w * 0.22 * (1 - i * 0.25), p.w * 0.18 * (1 - i * 0.28), 6), bone, L(s, -p.h, p.h));
    parent = `t${i}`;
  }
  const tz = -p.len * 0.5 - p.tail;
  if (p.tailTip === 'tuft') b.add(ellipsoid(p.w * 0.25, p.w * 0.25, p.w * 0.4, [0, p.h * 0.25, tz], 10, 0.2), 't2', A(s));
  else if (p.tailTip === 'flame') b.add(ellipsoid(p.w * 0.22, p.w * 0.22, p.w * 0.45, [0, p.h * 0.25, tz], 10), 't2', G(s, 1.2));
  else if (p.tailTip === 'club') b.add(boulder(p.w * 0.32, 4, 0.2, 2), 't2', A(s, { flat: true }));
  if (p.loot) {
    b.bone('loot', 'head', [0, hy - p.head * 0.4, hz + p.head * 0.6 + p.snout]);
    b.add(crystal(p.head * 0.5, p.head * 0.22, [0, hy - p.head * 0.5, hz + p.head * 0.6 + p.snout], [0, 1, 0.3], 0, 6), 'loot', G(s, 1));
  }
  return { ...b.build(), look: { bump: 0.008, bumpFreq: 26, sssTint: 0xff9a7a, glowTint: s.g, pulse: 1.3, ...s.look } };
}

interface UprightP {
  body: number;
  h: number;
  head: number;
  arms: number;
  armR: number;
  hand: 'fist' | 'claw' | 'scythe' | 'pincer' | 'none';
  legs: number;
  legR: number;
  kind: 'golem' | 'mantis' | 'crab' | 'statue' | 'mushroom' | 'robot';
  extra?: 'crystals' | 'cap' | 'runes' | 'lava' | 'boiler' | 'crown' | 'plates';
}

/** Brutes, the mantis, statues, the crab and the big walkers: a torso, a head, two arms, legs. */
function upright(lift: number, p: UprightP, s: Skin): MobModel {
  const b = new ModelBuilder();
  const F = -lift;
  const W = p.body;
  const H = p.h;
  b.bone('body', -1, [0, 0, 0]);
  b.bone('chest', 'body', [0, H * 0.2, 0]);
  b.bone('head', 'chest', [0, H * 0.75, W * 0.15]);
  const torsoLook = L(s, -H, H, { flat: p.kind === 'golem' || p.kind === 'statue' || p.kind === 'robot' });
  if (p.kind === 'golem') {
    b.add(boulder(W, 11, 0.3, 3), 'chest', torsoLook);
    b.add(boulder(W * 0.75, 13, 0.25, 2), 'body', torsoLook);
  } else if (p.kind === 'statue' || p.kind === 'robot') {
    b.add(block(W * 1.6, H * 0.9, W * 1.1, [0, H * 0.35, 0], 0.08), 'chest', torsoLook);
    b.add(block(W * 1.2, H * 0.5, W * 0.9, [0, -H * 0.25, 0], 0.06), 'body', torsoLook);
  } else if (p.kind === 'crab') {
    b.add(ellipsoid(W * 1.6, H * 0.45, W * 1.1, [0, 0, 0], 22, 0.06, 4), 'chest', A(s, { top: s.t ?? s.a, y0: -H, y1: H, gloss: 0.85 }));
    b.add(ellipsoid(W * 1.3, H * 0.35, W * 0.95, [0, -H * 0.2, 0], 18), 'body', L(s, -H, 0));
  } else if (p.kind === 'mantis') {
    b.add(ellipsoid(W * 0.45, H * 0.5, W * 0.45, [0, H * 0.35, 0.05], 14), 'chest', torsoLook);
    b.add(ellipsoid(W * 0.55, W * 0.5, W * 1.4, [0, -H * 0.05, -W * 1.2], 16, 0.04), 'body', torsoLook);
  } else if (p.kind === 'mushroom') {
    b.add(lathe([[0.01, -H * 0.5], [W * 0.55, -H * 0.45], [W * 0.5, H * 0.2], [W * 0.38, H * 0.6], [0.01, H * 0.62]], 18), 'chest', L(s, -H, H, { color: s.a }));
  }
  // The head.
  const hy = H * 0.85;
  if (p.kind === 'mushroom') {
    b.add(lathe([[0.01, hy + p.head * 0.7], [p.head * 1.6, hy + p.head * 0.2], [p.head * 1.9, hy - p.head * 0.15], [p.head * 0.4, hy - p.head * 0.05]], 24), 'head', L(s, hy - p.head, hy + p.head));
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2;
      b.add(ellipsoid(p.head * 0.2, p.head * 0.12, p.head * 0.2, [Math.sin(a) * p.head * 1.1, hy + p.head * 0.42, Math.cos(a) * p.head * 1.1], 8), 'head', G(s, 0.8));
    }
    eyes(b, 'head', [0, hy - p.head * 0.2, p.head * 0.42], 2, p.head * 0.13, p.head * 0.25, s);
  } else if (p.kind === 'crab') {
    for (const side of [-1, 1]) {
      b.add(limb([W * 0.3 * side, H * 0.3, W * 0.9], [W * 0.38 * side, H * 0.75, W * 1.05], W * 0.06, W * 0.05, 6), 'head', A(s));
      b.add(ellipsoid(W * 0.12, W * 0.12, W * 0.12, [W * 0.38 * side, H * 0.8, W * 1.05], 8), 'head', G(s, 1.1));
    }
  } else {
    const hl = p.kind === 'mantis' ? 1.4 : 1;
    if (p.kind === 'statue' || p.kind === 'robot') b.add(block(p.head * 1.6, p.head * 1.4, p.head * 1.5, [0, hy + p.head * 0.5, W * 0.2], 0.05), 'head', A(s, { flat: true }));
    else b.add(ellipsoid(p.head, p.head * 0.9, p.head * hl, [0, hy + p.head * 0.5, W * 0.25], 16, 0.05, 6), 'head', L(s, hy, hy + p.head * 2, { flat: p.kind === 'golem' }));
    eyes(b, 'head', [0, hy + p.head * 0.6, W * 0.25 + p.head * hl * 0.92], p.kind === 'robot' ? 1 : 2, p.head * (p.kind === 'robot' ? 0.32 : 0.16), p.head * 0.4, s);
    if (p.kind === 'mantis') for (const side of [-1, 1]) b.add(limb([p.head * 0.3 * side, hy + p.head * 1.2, W * 0.4], [p.head * 1.6 * side, hy + p.head * 3, W * 0.9], p.head * 0.05, p.head * 0.02, 4), 'head', A(s));
  }
  if (p.extra === 'crystals') spines(b, 'chest', [-W * 0.6, H * 0.6, -W * 0.3], [W * 0.6, H * 0.6, -W * 0.3], 5, H * 0.6, W * 0.16, A(s, { emit: 0.35 }), -0.5);
  if (p.extra === 'crown') for (let i = 0; i < 5; i++) b.add(crystal(p.head * 0.7, p.head * 0.12, [(i - 2) * p.head * 0.35, hy + p.head * 1.3, W * 0.2], [(i - 2) * 0.2, 1, 0], 0, 4), 'head', G(s, 0.8));
  if (p.extra === 'runes') for (let i = 0; i < 4; i++) b.add(block(W * 0.25, H * 0.08, 0.02, [(i - 1.5) * W * 0.35, H * 0.5, W * 0.56], 0.01), 'chest', G(s, 1));
  if (p.extra === 'lava') for (let i = 0; i < 6; i++) b.add(limb([W * (i % 2 ? 0.7 : -0.7), H * (0.1 + i * 0.12), W * 0.5], [W * (i % 2 ? -0.2 : 0.2), H * (0.25 + i * 0.12), W * 0.75], W * 0.06, W * 0.04, 5), 'chest', G(s, 1));
  if (p.extra === 'boiler') {
    b.add(lathe([[0.01, -H * 0.2], [W * 0.5, -H * 0.15], [W * 0.5, H * 0.6], [0.01, H * 0.7]], 16, [0, H * 0.3, -W * 0.75]), 'chest', A(s, { gloss: 0.8 }));
    b.add(ellipsoid(W * 0.25, W * 0.25, W * 0.08, [0, H * 0.35, W * 0.58], 12), 'chest', G(s, 1.2));
    for (const side of [-1, 1]) b.add(limb([W * 0.35 * side, H * 0.9, -W * 0.7], [W * 0.38 * side, H * 1.5, -W * 0.75], W * 0.09, W * 0.08, 8), 'chest', A(s));
  }
  if (p.extra === 'plates') for (let i = 0; i < 4; i++) b.add(block(W * 1.7, H * 0.12, W * 1.2, [0, H * (0.0 + i * 0.22), -W * 0.05], 0.03), 'chest', A(s, { flat: true, gloss: 0.8 }));
  // Arms.
  for (const side of [-1, 1]) {
    const sh: P3 = [W * (p.kind === 'crab' ? 1.3 : 1.05) * side, H * (p.kind === 'crab' ? 0.1 : 0.55), W * (p.kind === 'crab' ? 0.6 : 0.1)];
    const el: P3 = [sh[0] + W * 0.25 * side, sh[1] - p.arms * 0.45, sh[2] + p.arms * 0.15];
    const wr: P3 = [el[0], el[1] - p.arms * 0.2, el[2] + p.arms * 0.45];
    const ua = b.bone(`ua${side}`, 'chest', sh);
    const fa = b.bone(`fa${side}`, ua, el);
    b.add(limb(sh, el, p.armR, p.armR * 0.85, 8), ua, L(s, -H, H));
    b.add(limb(el, wr, p.armR * 0.85, p.armR * 0.75, 8), fa, L(s, -H, H, { color: s.a }));
    if (p.hand === 'fist') b.add(p.kind === 'golem' ? boulder(p.armR * 1.5, 5 + side, 0.2, 2) : block(p.armR * 2.4, p.armR * 2.2, p.armR * 2.4, wr, 0.05), fa, A(s, { flat: true }));
    else if (p.hand === 'claw') for (let k = 0; k < 3; k++) b.add(crystal(p.armR * 2.2, p.armR * 0.35, wr, [(k - 1) * 0.4, -0.6, 1], 0, 4), fa, A(s, { flat: true }));
    else if (p.hand === 'scythe') b.add(merge([limb(wr, [wr[0], wr[1] + p.arms * 0.35, wr[2] + p.arms * 0.2], p.armR * 0.6, p.armR * 0.4, 5), crystal(p.arms * 0.9, p.armR * 0.5, [wr[0], wr[1] + p.arms * 0.35, wr[2] + p.arms * 0.2], [0, -1, 0.35], 0, 3)]), fa, A(s, { flat: true, emit: 0.2 }));
    else if (p.hand === 'pincer') {
      b.add(ellipsoid(p.armR * 1.6, p.armR * 1.1, p.armR * 1.8, wr, 12), fa, A(s, { gloss: 0.85 }));
      b.add(crystal(p.armR * 2.6, p.armR * 0.6, [wr[0] + p.armR * 0.5 * side, wr[1] + p.armR * 0.6, wr[2] + p.armR], [0, 0.3, 1], 0, 4), fa, A(s, { flat: true }));
      b.add(crystal(p.armR * 2.2, p.armR * 0.5, [wr[0] + p.armR * 0.5 * side, wr[1] - p.armR * 0.5, wr[2] + p.armR], [0, -0.3, 1], 0, 4), fa, A(s, { flat: true }));
    }
  }
  // Legs.
  const pairs = p.kind === 'crab' ? 3 : p.kind === 'mantis' ? 2 : 1;
  for (let i = 0; i < pairs; i++) {
    for (const side of [-1, 1]) {
      const z = pairs === 1 ? 0 : (0.5 - i / (pairs - 1)) * W * (p.kind === 'mantis' ? 2 : 1.3) - (p.kind === 'mantis' ? W * 0.9 : 0);
      const hip: P3 = [W * (p.kind === 'crab' ? 1.1 : 0.55) * side, -H * 0.3, z];
      const knee: P3 = [hip[0] + (p.kind === 'crab' || p.kind === 'mantis' ? p.legs * 0.6 * side : 0.02 * side), p.kind === 'crab' || p.kind === 'mantis' ? hip[1] + p.legs * 0.2 : (hip[1] + F) / 2, z + 0.04];
      const foot: P3 = [hip[0] + (p.kind === 'crab' || p.kind === 'mantis' ? p.legs * 0.9 * side : 0), F, z];
      leg(b, 'body', i, side, hip, knee, foot, p.legR, L(s, F, 0), A(s));
    }
  }
  return { ...b.build(), look: { bump: 0.012, bumpFreq: 16, sssTint: 0xffa07a, glowTint: s.g, pulse: 1.0, ...s.look } };
}

interface BlobP {
  r: number;
  squash: number;
  kind: 'toad' | 'cap' | 'newt' | 'lizard' | 'eye' | 'sentry';
  legs: number;
  mouth: number;
}

/** Spitters: a body with a glowing throat sac and a wide mouth (a toad, a walking cap, a newt, a lizard, a floating eye, a sentry). */
function spitter(lift: number, p: BlobP, s: Skin): MobModel {
  const b = new ModelBuilder();
  const F = -lift;
  const R = p.r;
  b.bone('body', -1, [0, 0, 0]);
  b.bone('head', 'body', [0, R * 0.3, R * 0.6]);
  b.bone('jaw', 'head', [0, R * 0.05, R * 0.75]);
  if (p.kind === 'eye') {
    b.add(ellipsoid(R, R, R, [0, 0, 0], 24, 0.03), 'body', L(s, -R, R, { gloss: 0.95, sss: 0.7 }));
    b.add(ellipsoid(R * 0.55, R * 0.55, R * 0.2, [0, 0, R * 0.88], 18), 'head', G(s, 1.3));
    b.add(ellipsoid(R * 0.22, R * 0.22, R * 0.1, [0, 0, R * 1.02], 12), 'head', { color: 0x050208 });
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2;
      b.bone(`tn${k}`, 'body', [Math.sin(a) * R * 0.5, -R * 0.6, Math.cos(a) * R * 0.5 - R * 0.2]);
      b.add(limb([Math.sin(a) * R * 0.5, -R * 0.6, Math.cos(a) * R * 0.5 - R * 0.2], [Math.sin(a) * R * 0.9, -R * 1.8, Math.cos(a) * R * 0.9 - R * 0.4], R * 0.1, R * 0.02, 5), `tn${k}`, L(s, -R * 2, 0));
    }
    for (let k = 0; k < 5; k++) b.add(crystal(R * 0.7, R * 0.12, [Math.sin(k * 1.25) * R * 0.6, R * 0.75, Math.cos(k * 1.25) * R * 0.6 - R * 0.2], [Math.sin(k * 1.25) * 0.5, 1, Math.cos(k * 1.25) * 0.5], 0, 4), 'body', A(s, { flat: true }));
    return { ...b.build(), look: { bump: 0.004, bumpFreq: 30, sssTint: s.g, glowTint: s.g, pulse: 1.8, ...s.look } };
  }
  if (p.kind === 'sentry') {
    b.add(block(R * 1.4, R * 2.2, R * 1.2, [0, 0, 0], 0.06), 'body', L(s, -R, R, { flat: true }));
    b.add(block(R * 1.1, R * 0.9, R * 1.0, [0, R * 1.5, R * 0.1], 0.05), 'head', A(s, { flat: true }));
    b.add(ellipsoid(R * 0.3, R * 0.3, R * 0.08, [0, R * 1.5, R * 0.62], 12), 'jaw', G(s, 1.2));
    for (let i = 0; i < 5; i++) b.add(block(R * 0.9, R * 0.08, 0.02, [0, -R * 0.6 + i * R * 0.28, R * 0.61], 0.01), 'body', G(s, 0.9));
    for (const side of [-1, 1]) {
      b.bone(`ua${side}`, 'body', [R * 0.8 * side, R * 0.7, 0]);
      b.add(block(R * 0.4, R * 1.4, R * 0.5, [R * 0.95 * side, R * 0.1, 0], 0.04), `ua${side}`, L(s, -R, R, { flat: true }));
      leg(b, 'body', 0, side, [R * 0.4 * side, -R * 1.05, 0], [R * 0.45 * side, (F - R) / 2, 0.03], [R * 0.45 * side, F, 0], R * 0.22, L(s, F, 0, { flat: true }), A(s, { flat: true }));
    }
    return { ...b.build(), look: { bump: 0.01, bumpFreq: 12, glowTint: s.g, pulse: 2.0, ...s.look } };
  }
  // Toad-like bodies.
  const sq = p.squash;
  if (p.kind === 'cap') {
    b.add(lathe([[0.01, -R * 0.6], [R * 0.45, -R * 0.55], [R * 0.4, R * 0.25], [0.01, R * 0.3]], 16), 'body', L(s, -R, R, { color: s.a }));
    b.add(lathe([[0.01, R * 1.1], [R * 1.05, R * 0.55], [R * 1.25, R * 0.25], [R * 0.3, R * 0.35]], 22), 'head', L(s, R * 0.2, R * 1.1));
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2;
      b.add(ellipsoid(R * 0.14, R * 0.08, R * 0.14, [Math.sin(a) * R * 0.7, R * 0.82, Math.cos(a) * R * 0.7], 8), 'head', G(s, 0.9));
    }
    b.add(ellipsoid(R * 0.28, R * 0.2, R * 0.12, [0, -R * 0.05, R * 0.38], 12), 'jaw', G(s, 1.1));
    eyes(b, 'body', [0, R * 0.12, R * 0.4], 2, R * 0.08, R * 0.16, s);
  } else {
    const long = p.kind === 'newt' || p.kind === 'lizard';
    b.add(ellipsoid(R * (long ? 0.6 : 1), R * sq, R * (long ? 1.4 : 1.05), [0, 0, 0], 22, 0.05, 2), 'body', L(s, -R * sq, R * sq, { gloss: p.kind === 'newt' ? 0.9 : 0.6, sss: 0.6 }));
    b.add(ellipsoid(R * (long ? 0.42 : 0.75), R * sq * 0.6, R * 0.6, [0, R * 0.15, R * (long ? 1.25 : 0.7)], 18, 0.03), 'head', L(s, -R * sq, R * sq));
    b.add(ellipsoid(R * (long ? 0.38 : 0.7), R * sq * 0.25, R * 0.55, [0, -R * 0.08, R * (long ? 1.3 : 0.78)], 16), 'jaw', L(s, -R, 0, { color: s.a }));
    // The glowing throat sac (it swells before the spit).
    b.bone('sac', 'body', [0, -R * sq * 0.5, R * (long ? 0.9 : 0.55)]);
    b.add(ellipsoid(R * 0.45, R * 0.35, R * 0.4, [0, -R * sq * 0.5, R * (long ? 0.9 : 0.55)], 14), 'sac', { color: s.g, emit: (s.e ?? 0.6) * 0.8, sss: 1, gloss: 0.9 });
    eyes(b, 'head', [0, R * (0.15 + sq * 0.5), R * (long ? 1.45 : 1.0)], 2, R * 0.14, R * (long ? 0.32 : 0.5), s);
    if (p.kind === 'lizard') spines(b, 'body', [0, R * sq * 0.95, R * 0.9], [0, R * sq * 0.8, -R * 1.1], 7, R * 0.5, R * 0.08, A(s), -0.5);
    if (long) {
      let parent = 'body';
      for (let i = 0; i < 3; i++) {
        const z0 = -R * 1.3 - i * R * 0.6;
        const bone = b.bone(`t${i}`, parent, [0, 0, z0]);
        b.add(limb([0, 0, z0], [0, 0, z0 - R * 0.6], R * 0.28 * (1 - i * 0.28), R * 0.22 * (1 - i * 0.3), 6), bone, L(s, -R, R));
        parent = `t${i}`;
      }
    }
  }
  const pairs = p.kind === 'cap' ? 2 : 2;
  for (let i = 0; i < pairs; i++) {
    for (const side of [-1, 1]) {
      const z = (p.kind === 'newt' || p.kind === 'lizard' ? 0.8 : 0.45) * R * (i === 0 ? 1 : -1);
      const hip: P3 = [R * (p.kind === 'cap' ? 0.3 : 0.6) * side, -R * 0.2, z];
      const knee: P3 = [R * (p.kind === 'cap' ? 0.45 : 1.0) * side, (hip[1] + F) / 2 + R * 0.15, z + 0.03];
      const foot: P3 = [R * (p.kind === 'cap' ? 0.5 : 1.05) * side, F, z + (i === 0 ? 0.05 : -0.03)];
      leg(b, 'body', i, side, hip, knee, foot, Math.max(0.025, R * p.legs), L(s, F, 0), L(s, F, 0, { color: s.a }));
    }
  }
  return { ...b.build(), look: { bump: 0.007, bumpFreq: 22, sssTint: s.g, glowTint: s.g, pulse: 1.5, ...s.look } };
}

interface BatP {
  body: number;
  span: number;
  ears: number;
  kind: 'bat' | 'wraith' | 'fish' | 'wasp';
  crystals?: boolean;
}

/** Divers: a small body, a head with ears and fangs, two big wings in two bones each. */
function bat(p: BatP, s: Skin): MobModel {
  const b = new ModelBuilder();
  const B = p.body;
  b.bone('body', -1, [0, 0, 0]);
  b.bone('head', 'body', [0, B * 0.3, B * 0.7]);
  if (p.kind === 'wraith') {
    b.add(lathe([[0.01, -B * 2.4], [B * 0.55, -B * 1.4], [B * 0.65, -B * 0.2], [B * 0.5, B * 0.5], [0.01, B * 0.7]], 14), 'body', L(s, -B * 2.4, B, { sss: 0.6, gloss: 0.95, flat: true }));
    b.add(ellipsoid(B * 0.45, B * 0.55, B * 0.45, [0, B * 0.95, B * 0.15], 14), 'head', L(s, 0, B * 1.5, { gloss: 0.95 }));
    eyes(b, 'head', [0, B * 1.0, B * 0.55], 2, B * 0.1, B * 0.18, s);
    for (let i = 0; i < 5; i++) b.add(crystal(B * 0.9, B * 0.1, [(i - 2) * B * 0.18, B * 1.25, 0], [(i - 2) * 0.25, 1, -0.2], 0, 3), 'head', A(s, { flat: true, emit: 0.3 }));
  } else if (p.kind === 'fish') {
    // A flying fish: a long glassy body, a big-eyed head, a forked tail; its wings are its fins.
    b.add(ellipsoid(B * 0.45, B * 0.5, B * 1.45, [0, 0, 0], 18, 0.05, 3), 'body', L(s, -B, B, { sss: 0.85, gloss: 0.95 }));
    b.add(ellipsoid(B * 0.42, B * 0.44, B * 0.55, [0, B * 0.05, B * 1.25], 14), 'head', L(s, -B, B, { gloss: 0.95 }));
    eyes(b, 'head', [0, B * 0.22, B * 1.5], 2, B * 0.13, B * 0.32, s);
    b.bone('t0', 'body', [0, 0, -B * 1.3]);
    b.add(crystal(B * 1.0, B * 0.14, [0, 0, -B * 1.3], [0, 0.75, -1], 0, 4), 't0', A(s, { sss: 0.9, flat: true }));
    b.add(crystal(B * 1.0, B * 0.14, [0, 0, -B * 1.3], [0, -0.75, -1], 0, 4), 't0', A(s, { sss: 0.9, flat: true }));
    for (let i = 0; i < 5; i++) b.add(ellipsoid(B * 0.06, B * 0.06, B * 0.06, [B * 0.4 * (i % 2 ? 1 : -1), B * 0.15, B * (0.8 - i * 0.4)], 6), 'body', G(s, 0.9));
  } else if (p.kind === 'wasp') {
    // A wasp: a thorax, a striped abdomen with a glowing sting, a head with antennae, legs hanging.
    b.add(ellipsoid(B * 0.45, B * 0.45, B * 0.55, [0, 0, 0], 14), 'body', L(s, -B, B, { gloss: 0.8 }));
    b.bone('t0', 'body', [0, 0, -B * 0.45]);
    for (let i = 0; i < 4; i++) b.add(ellipsoid(B * (0.52 - i * 0.07), B * (0.5 - i * 0.07), B * 0.34, [0, -B * 0.12 * i, -B * (0.75 + i * 0.42)], 12), 't0', i % 2 ? L(s, -B, B, { gloss: 0.9 }) : A(s, { gloss: 0.9 }));
    b.add(crystal(B * 0.55, B * 0.07, [0, -B * 0.5, -B * 2.25], [0, -0.45, -1], 0, 4), 't0', G(s, 1.1));
    b.add(ellipsoid(B * 0.36, B * 0.36, B * 0.34, [0, B * 0.12, B * 0.58], 12), 'head', L(s, -B, B, { gloss: 0.8 }));
    eyes(b, 'head', [0, B * 0.22, B * 0.8], 2, B * 0.13, B * 0.22, s);
    for (const side of [-1, 1]) b.add(limb([B * 0.12 * side, B * 0.4, B * 0.78], [B * 0.4 * side, B * 0.95, B * 1.15], B * 0.03, B * 0.015, 4), 'head', A(s));
    for (let i = 0; i < 3; i++) for (const side of [-1, 1]) b.add(limb([B * 0.3 * side, -B * 0.3, B * (0.25 - i * 0.25)], [B * 0.55 * side, -B * 1.0, B * (0.3 - i * 0.3)], B * 0.04, B * 0.02, 4), 'body', A(s));
  } else {
    b.add(ellipsoid(B * 0.55, B * 0.5, B * 0.8, [0, 0, 0], 16, 0.12, 3), 'body', L(s, -B, B, { sss: 0.5, gloss: 0.3 }));
    b.add(ellipsoid(B * 0.42, B * 0.4, B * 0.4, [0, B * 0.3, B * 0.75], 14, 0.05), 'head', L(s, 0, B, {}));
    for (const side of [-1, 1]) b.add(crystal(B * p.ears, B * 0.16, [B * 0.2 * side, B * 0.55, B * 0.7], [0.35 * side, 1, -0.1], 0, 3), 'head', L(s, 0, B * 2, { flat: true }));
    eyes(b, 'head', [0, B * 0.38, B * 1.1], 2, B * 0.08, B * 0.17, s);
    for (const side of [-1, 1]) b.add(crystal(B * 0.18, B * 0.03, [B * 0.08 * side, B * 0.12, B * 1.08], [0, -1, 0.2], 0, 3), 'head', { color: 0xf0e8e0, flat: true });
    if (p.crystals) spines(b, 'body', [0, B * 0.45, B * 0.3], [0, B * 0.4, -B * 0.6], 4, B * 0.5, B * 0.08, A(s, { emit: 0.4 }), -0.6);
  }
  // Wings: an inner and an outer panel per side (w{s}, wt{s}).
  for (const side of [-1, 1]) {
    const root: P3 = [B * 0.35 * side, B * 0.2, B * 0.1];
    const mid: P3 = [B * 0.35 * side + p.span * 0.45 * side, B * 0.35, B * 0.05];
    b.bone(`w${side}`, 'body', root);
    b.bone(`wt${side}`, `w${side}`, mid);
    // A wasp's wings are narrow blades; a fish's, broad rounded fins; a bat's, membranes.
    const narrow = p.kind === 'wasp';
    const inner = narrow
      ? fin([[0, 0.04], [p.span * 0.45, 0.08], [p.span * 0.48, -0.05], [0, -B * 0.25]].map(([x, z]) => [x * side, z] as [number, number]), 0.02)
      : fin([[0, 0.12], [p.span * 0.45, 0.18], [p.span * 0.45, -p.span * 0.3], [0, -B * 0.6]].map(([x, z]) => [x * side, z] as [number, number]), 0.05);
    const outer = narrow
      ? fin([[0, 0.08], [p.span * 0.5, 0.02], [p.span * 0.45, -0.07], [0, -0.05]].map(([x, z]) => [x * side, z] as [number, number]), 0.02)
      : fin([[0, 0.18], [p.span * 0.55, 0.05], [p.span * 0.4, -p.span * 0.18], [p.span * 0.2, -p.span * 0.22], [0, -p.span * 0.3]].map(([x, z]) => [x * side, z] as [number, number]), 0.05);
    b.add(place(inner, root), `w${side}`, A(s, { sss: 0.9, gloss: 0.4, rim: 0.8, flat: p.kind === 'wraith' }));
    b.add(place(outer, mid), `wt${side}`, A(s, { sss: 0.9, gloss: 0.4, rim: 0.8, flat: p.kind === 'wraith' }));
    b.add(limb(root, mid, B * 0.06, B * 0.04, 5), `w${side}`, L(s, -B, B));
    b.add(limb(mid, [mid[0] + p.span * 0.55 * side, mid[1], mid[2] + 0.05], B * 0.04, B * 0.015, 5), `wt${side}`, L(s, -B, B));
  }
  return { ...b.build(), look: { bump: 0.006, bumpFreq: 30, sssTint: 0xff9070, glowTint: s.g, pulse: 2.2, doubleSided: true, ...s.look } };
}

interface PuffP {
  r: number;
  kind: 'puffball' | 'cluster' | 'beetle' | 'bladder';
  legs: number;
}

/** Exploders: a swollen, glowing body that blinks before it bursts (a puffball, a crystal cluster, a beetle, a floating bladder). */
function puff(lift: number, p: PuffP, s: Skin): MobModel {
  const b = new ModelBuilder();
  const F = -lift;
  const R = p.r;
  b.bone('body', -1, [0, 0, 0]);
  b.bone('sac', 'body', [0, R * 0.1, 0]);
  b.bone('head', 'body', [0, 0, R * 0.8]);
  if (p.kind === 'puffball') {
    b.add(ellipsoid(R, R * 0.9, R, [0, R * 0.1, 0], 20, 0.12, 5), 'sac', L(s, -R, R, { sss: 0.7 }));
    for (let i = 0; i < 14; i++) {
      const a = i * 2.39996;
      const y = 1 - (i / 13) * 1.6;
      const rr = Math.sqrt(Math.max(0, 1 - y * y));
      b.add(ellipsoid(R * 0.12, R * 0.12, R * 0.12, [Math.sin(a) * rr * R * 0.95, y * R * 0.85 + R * 0.1, Math.cos(a) * rr * R * 0.95], 8), 'sac', G(s, 0.9));
    }
    eyes(b, 'head', [0, R * 0.25, R * 0.92], 2, R * 0.1, R * 0.25, s);
  } else if (p.kind === 'cluster') {
    for (let i = 0; i < 9; i++) {
      const a = i * 2.39996;
      b.add(crystal(R * (1.1 + (i % 3) * 0.25), R * 0.22, [Math.sin(a) * R * 0.25, -R * 0.4, Math.cos(a) * R * 0.25], [Math.sin(a) * 0.6, 1, Math.cos(a) * 0.6], 0, 6), 'sac', { color: s.a, emit: 0.25, gloss: 0.95, sss: 0.8, flat: true });
    }
    b.add(ellipsoid(R * 0.4, R * 0.35, R * 0.4, [0, -R * 0.2, 0], 12), 'sac', G(s, 1));
    eyes(b, 'head', [0, -R * 0.25, R * 0.45], 2, R * 0.09, R * 0.2, s);
  } else if (p.kind === 'beetle') {
    b.add(ellipsoid(R * 0.8, R * 0.55, R * 1.1, [0, 0, -R * 0.2], 18, 0.04), 'sac', G(s, 0.75));
    b.add(ellipsoid(R * 0.85, R * 0.4, R * 0.75, [0, R * 0.25, 0], 16), 'body', A(s, { gloss: 0.9, top: s.t ?? s.a, y0: 0, y1: R }));
    b.add(ellipsoid(R * 0.4, R * 0.35, R * 0.4, [0, R * 0.05, R * 0.85], 12), 'head', L(s, -R, R));
    for (const side of [-1, 1]) b.add(limb([R * 0.15 * side, R * 0.3, R * 1.1], [R * 0.5 * side, R * 0.8, R * 1.6], R * 0.04, R * 0.015, 4), 'head', A(s));
    eyes(b, 'head', [0, R * 0.2, R * 1.18], 2, R * 0.08, R * 0.2, s);
  } else {
    b.add(ellipsoid(R, R * 0.85, R, [0, 0, 0], 22, 0.06, 7), 'sac', { color: s.c, top: s.t, y0: -R, y1: R, sss: 1, gloss: 0.95, emit: 0.15 });
    b.add(ellipsoid(R * 0.55, R * 0.5, R * 0.55, [0, -R * 0.1, 0], 14), 'sac', G(s, 0.7));
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2;
      b.bone(`tn${k}`, 'body', [Math.sin(a) * R * 0.5, -R * 0.7, Math.cos(a) * R * 0.5]);
      b.add(limb([Math.sin(a) * R * 0.5, -R * 0.7, Math.cos(a) * R * 0.5], [Math.sin(a) * R * 0.7, -R * 2.2, Math.cos(a) * R * 0.7], R * 0.08, R * 0.02, 5), `tn${k}`, L(s, -R * 2, 0, { sss: 0.8 }));
    }
    eyes(b, 'head', [0, R * 0.1, R * 0.95], 3, R * 0.08, R * 0.28, s);
    return { ...b.build(), look: { bump: 0.004, bumpFreq: 18, sssTint: s.g, glowTint: s.g, pulse: 2.4, ...s.look } };
  }
  for (let i = 0; i < p.legs; i++) {
    for (const side of [-1, 1]) {
      const z = p.legs === 1 ? 0 : R * (0.4 - (i / (p.legs - 1)) * 0.8);
      const hip: P3 = [R * 0.5 * side, -R * 0.35, z];
      const knee: P3 = [R * 0.95 * side, (hip[1] + F) / 2 + R * 0.2, z];
      const foot: P3 = [R * 1.05 * side, F, z];
      leg(b, 'body', i, side, hip, knee, foot, Math.max(0.02, R * 0.1), L(s, F, 0, { color: s.a }), A(s));
    }
  }
  return { ...b.build(), look: { bump: 0.007, bumpFreq: 20, sssTint: s.g, glowTint: s.g, pulse: 2.0, ...s.look } };
}

interface HangP {
  r: number;
  tendrils: number;
  len: number;
  kind: 'roots' | 'ice' | 'gills';
}

/** Ceiling droppers: a knot (of roots, of ice) with tendrils hanging below its belly (drawn hugging its rock). */
function hanger(lift: number, p: HangP, s: Skin): MobModel {
  const b = new ModelBuilder();
  void lift;
  const R = p.r;
  b.bone('body', -1, [0, 0, 0]);
  b.bone('head', 'body', [0, R * 0.2, R * 0.5]);
  if (p.kind === 'roots') {
    b.add(boulder(R, 21, 0.35, 3, 0.7), 'body', L(s, -R, R, { gloss: 0.2, flat: false }));
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      b.add(limb([Math.sin(a) * R * 0.5, R * 0.1, Math.cos(a) * R * 0.5], [Math.sin(a) * R * 1.3, -R * 0.1, Math.cos(a) * R * 1.3], R * 0.12, R * 0.05, 5), 'body', L(s, -R, R));
    }
  } else if (p.kind === 'gills') {
    // A cap turned over on the rock: its dome against the ceiling (model -y), the gills, the stem and the
    // glowing tendrils toward the room (+y).
    b.add(lathe([[0.01, -R * 0.62], [R * 0.85, -R * 0.4], [R * 1.15, -R * 0.06], [R * 1.08, R * 0.08], [0.01, R * 0.05]], 22), 'body', L(s, -R, R * 0.1));
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * Math.PI * 2;
      b.add(limb([Math.sin(a) * R * 0.2, R * 0.08, Math.cos(a) * R * 0.2], [Math.sin(a) * R * 1.0, R * 0.1, Math.cos(a) * R * 1.0], R * 0.04, R * 0.015, 3), 'body', A(s, { sss: 0.8, gloss: 0.3 }));
    }
    for (let i = 0; i < 8; i++) {
      const a = i * 2.39996;
      b.add(ellipsoid(R * 0.13, R * 0.06, R * 0.13, [Math.sin(a) * R * 0.75, -R * 0.38, Math.cos(a) * R * 0.75], 8), 'body', G(s, 0.8));
    }
    b.add(limb([0, R * 0.05, 0], [0, R * 0.5, 0], R * 0.24, R * 0.17, 8), 'body', L(s, 0, R, { color: s.a }));
  } else {
    for (let i = 0; i < 7; i++) {
      const a = i * 2.39996;
      b.add(crystal(R * (1.1 + (i % 3) * 0.3), R * 0.2, [Math.sin(a) * R * 0.35, -R * 0.1, Math.cos(a) * R * 0.35], [Math.sin(a) * 0.3, 1, Math.cos(a) * 0.3], 0, 6), 'body', { color: s.a, emit: 0.1, gloss: 0.95, sss: 0.9, flat: true });
    }
    b.add(ellipsoid(R * 0.7, R * 0.5, R * 0.7, [0, R * 0.1, 0], 16), 'body', L(s, -R, R, { sss: 0.9, gloss: 0.95 }));
  }
  eyes(b, 'head', [0, R * 0.55, R * 0.55], 3, R * 0.11, R * 0.3, s);
  b.add(ellipsoid(R * 0.32, R * 0.12, R * 0.2, [0, R * 0.3, R * 0.72], 10), 'head', G(s, 1));
  // Tendrils from its "belly" (up in model space: the body is turned over on the ceiling).
  for (let k = 0; k < p.tendrils; k++) {
    const a = (k / p.tendrils) * Math.PI * 2;
    const x0 = Math.sin(a) * R * 0.45;
    const z0 = Math.cos(a) * R * 0.45;
    b.bone(`tn${k}`, 'body', [x0, R * 0.5, z0]);
    b.add(limb([x0, R * 0.5, z0], [x0 * 1.6, R * 0.5 + p.len, z0 * 1.6], R * 0.1, R * 0.02, 5), `tn${k}`, k % 3 === 0 ? G(s, 0.6) : L(s, 0, R + p.len));
  }
  return { ...b.build(), look: { bump: 0.01, bumpFreq: 18, sssTint: s.g, glowTint: s.g, pulse: 1.4, ...s.look } };
}

interface GrubP {
  r: number;
  segs: number;
  len: number;
  teeth: number;
  plates?: boolean;
}

/** Burrowers: a long segmented body, a round maw ringed with teeth, little legs. */
function grub(lift: number, p: GrubP, s: Skin): MobModel {
  const b = new ModelBuilder();
  const F = -lift;
  const R = p.r;
  b.bone('body', -1, [0, 0, 0]);
  b.bone('head', 'body', [0, 0, p.len * 0.45]);
  let parent = 'body';
  for (let i = 0; i < p.segs; i++) {
    const z = p.len * 0.35 - (i * p.len) / p.segs;
    const k = 1 - (i / p.segs) * 0.45;
    const bone = i === 0 ? 'body' : b.bone(`seg${i}`, parent, [0, 0, z + p.len / p.segs * 0.5]);
    b.add(ellipsoid(R * k, R * k * 0.85, p.len / p.segs * 0.65, [0, F + R * k * 0.85, z], 16, 0.05, i), bone, L(s, F, F + R * 2, { sss: 0.7, gloss: 0.7 }));
    if (p.plates) b.add(ellipsoid(R * k * 1.05, R * k * 0.4, p.len / p.segs * 0.5, [0, F + R * k * 1.5, z], 12), bone, A(s, { gloss: 0.9 }));
    if (i < p.segs - 1) for (const side of [-1, 1]) b.add(limb([R * k * 0.8 * side, F + R * 0.6, z], [R * k * 1.15 * side, F, z + 0.05], R * 0.08, R * 0.04, 4), bone, A(s));
    parent = i === 0 ? 'body' : `seg${i}`;
  }
  const hz = p.len * 0.45;
  b.add(ellipsoid(R * 1.05, R * 0.95, R * 0.6, [0, F + R, hz], 18), 'head', L(s, F, F + R * 2));
  b.bone('jaw', 'head', [0, F + R, hz + R * 0.4]);
  b.add(ellipsoid(R * 0.7, R * 0.65, R * 0.15, [0, F + R, hz + R * 0.5], 16), 'jaw', { color: 0x200808, gloss: 0.8 });
  b.add(ellipsoid(R * 0.3, R * 0.3, R * 0.1, [0, F + R, hz + R * 0.45], 10), 'jaw', G(s, 1));
  for (let i = 0; i < p.teeth; i++) {
    const a = (i / p.teeth) * Math.PI * 2;
    b.add(crystal(R * 0.35, R * 0.07, [Math.sin(a) * R * 0.72, F + R + Math.cos(a) * R * 0.66, hz + R * 0.5], [-Math.sin(a), -Math.cos(a), 0.6], 0, 4), 'jaw', { color: 0xe8e0d0, gloss: 0.8, flat: true });
  }
  return { ...b.build(), look: { bump: 0.008, bumpFreq: 24, sssTint: 0xff8a70, glowTint: s.g, pulse: 1.2, ...s.look } };
}

interface MimicP {
  r: number;
  kind: 'flower' | 'chest' | 'cart';
}

/** Mimics (the Gnasher's bones: base, lid, maw): an orchid bud, a chest. */
function mimic(lift: number, p: MimicP, s: Skin): MobModel {
  const b = new ModelBuilder();
  const R = p.r;
  const F = -lift;
  b.bone('base', -1, [0, 0, 0]);
  b.bone('lid', 'base', [0, 0.02, -R * 0.7]);
  b.bone('maw', 'base', [0, -0.05, 0]);
  if (p.kind === 'cart') {
    // A rusted ore cart on iron wheels; its "lid" is the heap of ore it carries, lifting off its teeth.
    b.add(block(R * 1.55, R * 0.72, R * 1.05, [0, F + R * 0.62, 0], 0.04), 'base', L(s, F, 0, { flat: true }));
    b.add(block(R * 1.68, R * 0.1, R * 1.15, [0, F + R * 0.98, 0], 0.02), 'base', A(s, { flat: true, gloss: 0.8 }));
    for (const x of [-0.6, 0.6]) b.add(block(R * 0.09, R * 0.74, R * 1.08, [x * R, F + R * 0.62, 0], 0.01), 'base', A(s, { flat: true, gloss: 0.85 }));
    for (const [x, z] of [[-0.82, -0.38], [0.82, -0.38], [-0.82, 0.38], [0.82, 0.38]] as const) {
      b.add(ellipsoid(R * 0.07, R * 0.24, R * 0.24, [x * R, F + R * 0.24, z * R], 12), 'base', A(s, { gloss: 0.9 }));
      b.add(ellipsoid(R * 0.09, R * 0.07, R * 0.07, [x * R, F + R * 0.24, z * R], 6), 'base', { color: 0x2a2420, gloss: 0.6 });
    }
    for (let i = 0; i < 7; i++) {
      const a = i * 2.39996;
      b.add(place(boulder(R * (0.26 + (i % 3) * 0.05), 3 + i, 0.3, 2), [Math.sin(a) * R * 0.42, F + R * 1.12 + (i % 2) * R * 0.1, Math.cos(a) * R * 0.3]), 'lid', i % 3 === 0 ? G(s, 0.7) : L(s, 0, R * 1.5, { color: s.t ?? s.c, flat: true }));
    }
    for (let i = 0; i < 12; i++) {
      const x = (i / 11 - 0.5) * R * 1.4;
      b.add(crystal(R * 0.2, R * 0.05, [x, F + R * 0.98, R * 0.5], [0, 1, 0.1], 0, 4), 'base', { color: 0xe8e0d0, gloss: 0.8, flat: true });
    }
    b.add(ellipsoid(R * 0.6, R * 0.12, R * 0.4, [0, F + R * 0.95, 0.05], 12), 'maw', { color: 0x7a1a22, gloss: 0.9, sss: 0.8 });
    eyes(b, 'lid', [0, F + R * 1.3, R * 0.45], 2, R * 0.08, R * 0.32, s);
  } else if (p.kind === 'chest') {
    b.add(block(R * 1.7, R * 0.8, R * 1.2, [0, F + R * 0.4, 0], 0.04), 'base', L(s, F, 0, { flat: true }));
    b.add(block(R * 1.75, R * 0.45, R * 1.25, [0, F + R * 1.02, 0], 0.05), 'lid', L(s, 0, R, { flat: true }));
    for (const x of [-0.75, 0, 0.75]) b.add(block(R * 0.12, R * 1.3, R * 1.28, [x * R, F + R * 0.6, 0], 0.02), x === 0 ? 'lid' : 'base', A(s, { flat: true, gloss: 0.9 }));
    b.add(block(R * 0.3, R * 0.3, R * 0.1, [0, F + R * 0.82, R * 0.63], 0.02), 'lid', G(s, 0.8));
    for (let i = 0; i < 12; i++) {
      const x = (i / 11 - 0.5) * R * 1.5;
      b.add(crystal(R * 0.22, R * 0.05, [x, F + R * 0.8, R * 0.55], [0, 1, 0], 0, 4), 'base', { color: 0xf0e6d0, gloss: 0.8, flat: true });
      b.add(crystal(R * 0.2, R * 0.05, [x, F + R * 0.82, R * 0.55], [0, -1, 0], 0, 4), 'lid', { color: 0xf0e6d0, gloss: 0.8, flat: true });
    }
    b.add(ellipsoid(R * 0.6, R * 0.12, R * 0.4, [0, F + R * 0.8, 0.05], 12), 'maw', { color: 0x8a1a2a, gloss: 0.9, sss: 0.8 });
    eyes(b, 'lid', [0, F + R * 1.05, R * 0.6], 2, R * 0.08, R * 0.4, s);
  } else {
    b.add(lathe([[0.01, F], [R * 0.5, F + R * 0.1], [R * 0.95, F + R * 0.55], [R * 0.9, F + R * 0.85], [0.01, F + R * 0.85]], 20), 'base', L(s, F, 0));
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      b.add(place(fin([[0, 0], [R * 0.45, R * 0.4], [0, R * 1.2], [-R * 0.45, R * 0.4]], 0.25), [Math.sin(a) * R * 0.3, F + R * 0.85, Math.cos(a) * R * 0.3], [-1.2, a, 0]), 'lid', A(s, { sss: 0.8, flat: false, top: s.t ?? s.a, y0: 0, y1: R }));
    }
    b.add(lathe([[0.01, F + R * 1.6], [R * 0.85, F + R * 1.1], [R * 0.95, F + R * 0.9], [0.01, F + R * 0.88]], 20), 'lid', L(s, 0, R * 2));
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      b.add(crystal(R * 0.25, R * 0.05, [Math.sin(a) * R * 0.75, F + R * 0.86, Math.cos(a) * R * 0.75], [-Math.sin(a) * 0.5, 1, -Math.cos(a) * 0.5], 0, 4), 'base', { color: 0xf8f0e0, gloss: 0.8, flat: true });
    }
    b.add(ellipsoid(R * 0.35, R * 0.12, R * 0.35, [0, F + R * 0.8, 0], 12), 'maw', G(s, 1));
  }
  return { ...b.build(), look: { bump: 0.01, bumpFreq: 14, sssTint: s.g, glowTint: s.g, pulse: 1.1, ...s.look } };
}

interface SpriteP {
  r: number;
  kind: 'ember' | 'star';
}

/** Follower beings (the Lampling's bones: armL, armR, tail, cap): an ember sprite, a little star. */
function sprite(p: SpriteP, s: Skin): MobModel {
  const b = new ModelBuilder();
  const R = p.r;
  b.bone('body', -1, [0, 0, 0]);
  b.bone('cap', 'body', [0, R * 0.8, 0]);
  b.bone('armL', 'body', [-R * 0.7, 0, 0]);
  b.bone('armR', 'body', [R * 0.7, 0, 0]);
  b.bone('tail', 'body', [0, -R * 0.7, -R * 0.2]);
  if (p.kind === 'ember') {
    b.add(ellipsoid(R, R * 0.95, R, [0, 0, 0], 18, 0.08, 3), 'body', { color: s.c, emit: 0.55, sss: 1, gloss: 0.4 });
    b.add(ellipsoid(R * 0.55, R * 0.55, R * 0.55, [0, 0, R * 0.2], 12), 'body', G(s, 1.2));
    for (let i = 0; i < 4; i++) b.add(crystal(R * (0.9 - i * 0.15), R * 0.25, [(i - 1.5) * R * 0.25, R * 0.7, 0], [(i - 1.5) * 0.3, 1, -0.2], 0, 5), 'cap', G(s, 1));
  } else {
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      b.add(crystal(R * 1.1, R * 0.28, [0, 0, 0], [Math.sin(a), Math.cos(a), 0.1], 0, 4), 'body', { color: s.c, emit: 0.8, flat: true });
    }
    b.add(ellipsoid(R * 0.5, R * 0.5, R * 0.5, [0, 0, 0], 12), 'body', G(s, 1.3));
    b.add(ellipsoid(R * 0.2, R * 0.2, R * 0.2, [0, R * 0.9, 0], 8), 'cap', G(s, 1));
  }
  eyes(b, 'body', [0, R * 0.15, R * 0.88], 2, R * 0.12, R * 0.3, { ...s, g: 0x2a1408, e: 0.05 });
  b.add(limb([-R * 0.7, 0, 0], [-R * 1.3, -R * 0.3, R * 0.2], R * 0.12, R * 0.08, 5), 'armL', { color: s.c, emit: 0.4 });
  b.add(limb([R * 0.7, 0, 0], [R * 1.3, -R * 0.3, R * 0.2], R * 0.12, R * 0.08, 5), 'armR', { color: s.c, emit: 0.4 });
  b.add(crystal(R * 0.9, R * 0.25, [0, -R * 0.7, -R * 0.2], [0, -1, -0.4], 0, 5), 'tail', G(s, 0.8));
  return { ...b.build(), look: { bump: 0.002, bumpFreq: 10, glowTint: s.g, pulse: 3, ...s.look } };
}

interface GrazerP {
  r: number;
  kind: 'bell' | 'turtle';
}

/** Grazer beings (the Shellback's bones: head, stalk±1, shell, cr0..3): a vinebell, a relic turtle. */
function grazer(lift: number, p: GrazerP, s: Skin): MobModel {
  const b = new ModelBuilder();
  const F = -lift;
  const R = p.r;
  b.bone('body', -1, [0, 0, 0]);
  b.bone('shell', 'body', [0, 0, 0]);
  b.bone('head', 'body', [0, 0, R * 0.8]);
  for (const side of [-1, 1]) b.bone(`stalk${side}`, 'head', [R * 0.15 * side, R * 0.2, R * 0.95]);
  if (p.kind === 'turtle') {
    b.add(ellipsoid(R, R * 0.6, R * 1.1, [0, F + R * 0.9, 0], 22, 0.05), 'shell', A(s, { top: s.t ?? s.a, y0: F, y1: F + R * 1.6, gloss: 0.6 }));
    for (let i = 0; i < 6; i++) b.add(block(R * 0.45, R * 0.12, R * 0.45, [((i % 3) - 1) * R * 0.5, F + R * 1.42, (Math.floor(i / 3) - 0.5) * R * 0.6], 0.04), 'shell', L(s, F, F + R * 2, { flat: true }));
    b.add(ellipsoid(R * 0.32, R * 0.28, R * 0.4, [0, F + R * 0.7, R * 1.15], 14), 'head', L(s, F, F + R, { color: s.c }));
    eyes(b, 'head', [0, F + R * 0.8, R * 1.45], 2, R * 0.05, R * 0.17, { ...s, g: 0x101010, e: 0 });
    for (const [i, z] of [[0, R * 0.6], [1, -R * 0.6]] as const)
      for (const side of [-1, 1]) leg(b, 'body', i, side, [R * 0.7 * side, F + R * 0.6, z], [R * 0.9 * side, F + R * 0.3, z], [R * 0.95 * side, F, z], R * 0.13, L(s, F, F + R), L(s, F, F + R));
    for (let c = 0; c < 4; c++) {
      const bone = b.bone(`cr${c}`, 'shell', [((c % 2) - 0.5) * R * 0.8, F + R * 1.45, (Math.floor(c / 2) - 0.5) * R * 0.7]);
      b.add(crystal(R * 0.5, R * 0.14, [((c % 2) - 0.5) * R * 0.8, F + R * 1.45, (Math.floor(c / 2) - 0.5) * R * 0.7], [0, 1, 0], 0, 6), bone, G(s, 0.9));
    }
  } else {
    // A bell flower hanging from a curved stalk rooted in the floor; nectar pods round its rim.
    b.add(limb([0, F, -R * 0.4], [0, F + R * 1.6, -R * 0.2], R * 0.12, R * 0.08, 6), 'body', L(s, F, F + R * 2, { color: s.a }));
    b.add(limb([0, F + R * 1.6, -R * 0.2], [0, F + R * 1.9, R * 0.4], R * 0.08, R * 0.07, 6), 'body', L(s, F, F + R * 2, { color: s.a }));
    b.add(lathe([[0.01, R * 0.2], [R * 0.55, 0], [R * 0.8, -R * 0.55], [R * 0.95, -R * 0.75]], 18, [0, F + R * 1.9, R * 0.6]), 'shell', { color: s.c, top: s.t, y0: F + R, y1: F + R * 2, sss: 0.9, gloss: 0.4 });
    b.add(ellipsoid(R * 0.3, R * 0.3, R * 0.3, [0, F + R * 1.4, R * 0.6], 12), 'shell', G(s, 1));
    for (const side of [-1, 1]) b.add(limb([R * 0.15 * side, F + R * 1.3, R * 0.6], [R * 0.25 * side, F + R * 0.9, R * 0.65], R * 0.03, R * 0.02, 4), `stalk${side}`, G(s, 0.6));
    for (const side of [-1, 1]) b.add(place(fin([[0, 0], [R * 0.6, R * 0.2], [R * 0.9, -R * 0.2], [R * 0.2, -R * 0.3]], 0.2), [0, F + R * 0.2, -R * 0.3], [0, side > 0 ? 0 : Math.PI, 0.3 * side]), 'body', A(s, { sss: 0.8 }));
    for (let c = 0; c < 4; c++) {
      const a = (c / 4) * Math.PI * 2;
      const at: P3 = [Math.sin(a) * R * 0.85, F + R * 1.1, R * 0.6 + Math.cos(a) * R * 0.85];
      const bone = b.bone(`cr${c}`, 'shell', at);
      b.add(ellipsoid(R * 0.16, R * 0.22, R * 0.16, at, 10), bone, G(s, 1));
    }
  }
  return { ...b.build(), look: { bump: 0.008, bumpFreq: 18, sssTint: s.g, glowTint: s.g, pulse: 1.0, ...s.look } };
}

interface SerpentP {
  r: number;
  segs: number;
  len: number;
  span: number;
}

/** The flying guardians' serpent (the Rime Wyrm): a chain of segments (seg*), a horned head, two wings. */
function serpent(p: SerpentP, s: Skin): MobModel {
  const b = new ModelBuilder();
  const R = p.r;
  b.bone('body', -1, [0, 0, 0]);
  b.bone('head', 'body', [0, 0, R * 1.2]);
  b.bone('jaw', 'head', [0, -R * 0.2, R * 1.8]);
  b.add(ellipsoid(R, R * 0.85, R * 1.4, [0, 0, 0], 18, 0.04), 'body', L(s, -R, R, { gloss: 0.7 }));
  spines(b, 'body', [0, R * 0.8, R * 0.8], [0, R * 0.8, -R * 1.0], 4, R * 0.7, R * 0.12, A(s, { emit: 0.3 }), -0.6);
  let parent = 'body';
  for (let i = 1; i < p.segs; i++) {
    const z = -R * 1.2 - ((i - 1) * p.len) / p.segs;
    const k = 1 - (i / p.segs) * 0.7;
    const bone = b.bone(`seg${i}`, parent, [0, 0, z + R * 0.3]);
    b.add(ellipsoid(R * k, R * k * 0.85, (p.len / p.segs) * 0.7, [0, 0, z], 14, 0.03, i), bone, L(s, -R, R, { gloss: 0.7 }));
    if (i % 2) spines(b, bone, [0, R * k * 0.8, z], [0, R * k * 0.8, z - 0.1], 1, R * 0.6 * k, R * 0.1, A(s, { emit: 0.3 }), -0.7);
    parent = `seg${i}`;
  }
  b.add(ellipsoid(R * 0.7, R * 0.55, R * 1.0, [0, R * 0.1, R * 1.9], 16, 0.04), 'head', L(s, -R, R));
  b.add(ellipsoid(R * 0.6, R * 0.22, R * 0.9, [0, -R * 0.3, R * 2.05], 14), 'jaw', A(s));
  for (const side of [-1, 1]) b.add(crystal(R * 1.4, R * 0.15, [R * 0.35 * side, R * 0.5, R * 1.6], [0.4 * side, 0.7, -0.8], 0, 5), 'head', A(s, { flat: true, emit: 0.2 }));
  eyes(b, 'head', [0, R * 0.35, R * 2.6], 2, R * 0.12, R * 0.4, s);
  for (const side of [-1, 1]) {
    const root: P3 = [R * 0.7 * side, R * 0.4, R * 0.3];
    const mid: P3 = [root[0] + p.span * 0.45 * side, R * 0.6, 0];
    b.bone(`w${side}`, 'body', root);
    b.bone(`wt${side}`, `w${side}`, mid);
    b.add(place(fin([[0, 0.3], [p.span * 0.45, 0.4], [p.span * 0.45, -p.span * 0.35], [0, -R * 1.2]].map(([x, z]) => [x * side, z] as [number, number]), 0.04), root), `w${side}`, A(s, { sss: 0.9, gloss: 0.6 }));
    b.add(place(fin([[0, 0.4], [p.span * 0.55, 0.1], [p.span * 0.35, -p.span * 0.25], [0, -p.span * 0.35]].map(([x, z]) => [x * side, z] as [number, number]), 0.04), mid), `wt${side}`, A(s, { sss: 0.9, gloss: 0.6 }));
    b.add(limb(root, mid, R * 0.14, R * 0.1, 6), `w${side}`, L(s, -R, R));
  }
  return { ...b.build(), look: { bump: 0.006, bumpFreq: 20, sssTint: s.g, glowTint: s.g, pulse: 1.4, doubleSided: true, ...s.look } };
}

interface HeraldP {
  r: number;
  kind: 'herald' | 'heart';
}

/** The Void Herald (a robed, haloed wraith with wings) and the Dark Heart (a faceted heart of crystal, veins and orbiting shards). */
function herald(p: HeraldP, s: Skin): MobModel {
  const b = new ModelBuilder();
  const R = p.r;
  b.bone('body', -1, [0, 0, 0]);
  b.bone('head', 'body', [0, R * 0.9, 0]);
  if (p.kind === 'heart') {
    b.bone('sac', 'body', [0, 0, 0]);
    b.add(boulder(R, 31, 0.18, 2, 1.0), 'sac', { color: s.c, top: s.t, y0: -R, y1: R, gloss: 0.95, sss: 0.6, flat: true, emit: 0.12 });
    // Its glowing veins and its core on bones of their own: the phases push them out through the
    // shell (poses.ts heartPhases): hidden in the closed shell, then splitting it, then blazing through.
    b.bone('veins', 'sac', [0, 0, 0]);
    for (let i = 0; i < 10; i++) {
      const a = i * 2.39996;
      const y = 1 - (i / 9) * 2;
      const rr = Math.sqrt(Math.max(0, 1 - y * y));
      b.add(limb([Math.sin(a) * rr * R * 0.7, y * R * 0.7, Math.cos(a) * rr * R * 0.7], [Math.sin(a + 0.6) * rr * R * 1.02, y * R * 0.95, Math.cos(a + 0.6) * rr * R * 1.02], R * 0.05, R * 0.03, 5), 'veins', G(s, 1));
    }
    b.bone('core', 'sac', [0, 0, 0]);
    b.add(ellipsoid(R * 0.5, R * 0.5, R * 0.5, [0, 0, 0], 14), 'core', G(s, 1.2));
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2;
      b.bone(`tn${k}`, 'body', [0, 0, 0]);
      b.add(crystal(R * 0.7, R * 0.18, [Math.sin(a) * R * 1.7, Math.sin(a * 2) * R * 0.3, Math.cos(a) * R * 1.7], [Math.sin(a) * 0.3, 1, Math.cos(a) * 0.3], 0, 4), `tn${k}`, { color: s.a, emit: 0.5, flat: true, gloss: 0.9 });
    }
    for (let i = 0; i < 4; i++) b.add(limb([((i % 2) - 0.5) * R * 0.6, R * 0.6, (Math.floor(i / 2) - 0.5) * R * 0.5], [((i % 2) - 0.5) * R * 1.1, R * 1.7, (Math.floor(i / 2) - 0.5) * R * 0.9], R * 0.16, R * 0.07, 7), 'head', L(s, 0, R * 2, { color: s.a }));
    return { ...b.build(), look: { bump: 0.004, bumpFreq: 8, sssTint: s.g, glowTint: s.g, pulse: 1.1, ...s.look } };
  }
  b.add(lathe([[0.01, -R * 2.2], [R * 0.9, -R * 1.9], [R * 0.75, -R * 0.6], [R * 0.55, R * 0.5], [R * 0.3, R * 0.85], [0.01, R * 0.9]], 18), 'body', L(s, -R * 2.2, R, { sss: 0.4, gloss: 0.5 }));
  b.add(ellipsoid(R * 0.35, R * 0.4, R * 0.35, [0, R * 1.15, R * 0.05], 14), 'head', L(s, R, R * 1.6, { color: s.a }));
  eyes(b, 'head', [0, R * 1.2, R * 0.36], 2, R * 0.07, R * 0.14, s);
  b.bone('cap', 'head', [0, R * 1.6, -R * 0.2]);
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    b.add(crystal(R * 0.4, R * 0.06, [Math.sin(a) * R * 0.6, R * 1.65 + Math.cos(a) * R * 0.6, -R * 0.25], [Math.sin(a), Math.cos(a), 0], 0, 3), 'cap', G(s, 1));
  }
  for (const side of [-1, 1]) {
    const sh: P3 = [R * 0.55 * side, R * 0.55, 0];
    const el: P3 = [R * 1.0 * side, R * 0.0, R * 0.25];
    b.bone(`ua${side}`, 'body', sh);
    b.bone(`fa${side}`, `ua${side}`, el);
    b.add(limb(sh, el, R * 0.13, R * 0.1, 6), `ua${side}`, L(s, -R, R));
    b.add(merge([limb(el, [el[0], -R * 0.4, R * 0.6], R * 0.1, R * 0.06, 6), crystal(R * 0.6, R * 0.07, [el[0], -R * 0.4, R * 0.6], [0, -0.3, 1], 0, 3)]), `fa${side}`, A(s, { flat: true }));
    const root: P3 = [R * 0.35 * side, R * 0.6, -R * 0.35];
    const mid: P3 = [R * 1.8 * side, R * 1.2, -R * 0.6];
    b.bone(`w${side}`, 'body', root);
    b.bone(`wt${side}`, `w${side}`, mid);
    b.add(place(fin([[0, 0.2], [R * 1.5, R * 0.7], [R * 1.4, -R * 1.2], [0, -R * 0.9]].map(([x, z]) => [x * side, z] as [number, number]), 0.05), root, [-1.2, 0, 0]), `w${side}`, A(s, { sss: 0.8, flat: true, emit: 0.1 }));
    b.add(place(fin([[0, 0.2], [R * 1.4, -R * 0.2], [R * 0.9, -R * 1.4], [0, -R * 1.1]].map(([x, z]) => [x * side, z] as [number, number]), 0.05), mid, [-1.2, 0, 0]), `wt${side}`, A(s, { sss: 0.8, flat: true, emit: 0.1 }));
  }
  return { ...b.build(), look: { bump: 0.006, bumpFreq: 14, sssTint: s.g, glowTint: s.g, pulse: 1.3, doubleSided: true, ...s.look } };
}

// ---------------------------------------------------------------------------------------
// The plans (size from the species' capsule; skins per biome)

const lift = (k: MobKind) => SPECIES[k].lift;

const PLANS: Partial<Record<MobKind, () => MobModel>> = {
  // I Amber Hollows / Mushroom Forest
  amberTick: () => bug(lift('amberTick'), { len: 0.34, w: 0.14, h: 0.1, segs: 2, pairs: 3, legLen: 0.16, head: 0.07, shell: true, eyes: 2 }, { c: 0x8a5a2a, t: 0xd89a3a, a: 0xffb347, g: 0xffd070, e: 0.6, gloss: 0.9 }),
  sporeling: () => puff(lift('sporeling'), { r: 0.3, kind: 'puffball', legs: 2 }, { c: 0xd8c8e8, t: 0xf0e0ff, a: 0x7a6a8a, g: 0x6df0d8, e: 0.7 }),
  gritBoar: () => quad(lift('gritBoar'), { len: 0.78, w: 0.27, h: 0.25, legLen: 0.2, head: 0.19, snout: 0.15, ears: 'pointy', back: 'fur', tail: 0.16, tailTip: 'tuft', tusks: 0.16 }, { c: 0x6a4a2e, t: 0x9a7244, a: 0x3a2a1c, g: 0xffc070, e: 0.55, gloss: 0.25, sss: 0.45 }),
  gillhanger: () => hanger(lift('gillhanger'), { r: 0.4, tendrils: 8, len: 0.5, kind: 'gills' }, { c: 0xa83a92, t: 0xe060c8, a: 0xe8d8e8, g: 0x6df0d8, e: 0.85 }),
  capSpitter: () => spitter(lift('capSpitter'), { r: 0.42, squash: 0.8, kind: 'cap', legs: 0.09, mouth: 0.3 }, { c: 0xb03a9a, t: 0xe060c8, a: 0xe8dcc8, g: 0x6df0d8, e: 0.8 }),
  // II Root Galleries / Flooded Grottoes
  rootLasher: () => hanger(lift('rootLasher'), { r: 0.42, tendrils: 7, len: 0.7, kind: 'roots' }, { c: 0x5a3e24, t: 0x8a6a3a, a: 0xa8c84a, g: 0xd8f060, e: 0.6 }),
  tunnelGrub: () => grub(lift('tunnelGrub'), { r: 0.42, segs: 5, len: 1.5, teeth: 10 }, { c: 0xc8a888, t: 0xe0c8a8, a: 0x7a5a3a, g: 0xff9a50, e: 0.6, sss: 0.8 }),
  thornback: () => quad(lift('thornback'), { len: 1.2, w: 0.42, h: 0.36, legLen: 0.32, head: 0.28, snout: 0.22, ears: 'pointy', horns: 1, back: 'thorns', tail: 0.4, tailTip: 'tuft' }, { c: 0x4a3a22, t: 0x6a5a2a, a: 0xc8d26a, g: 0xffd070, e: 0.5 }),
  rootWeevil: () => bug(lift('rootWeevil'), { len: 0.38, w: 0.15, h: 0.11, segs: 2, pairs: 3, legLen: 0.17, head: 0.07, shell: true, eyes: 2, snout: 0.16 }, { c: 0x3a3020, t: 0x6a5a2a, a: 0xa8c84a, g: 0xd8f060, e: 0.5, gloss: 0.85 }),
  mistwing: () => bat({ body: 0.22, span: 0.72, ears: 0, kind: 'fish' }, { c: 0xa8d0e0, t: 0xe0f4ff, a: 0x8acaea, g: 0x7fd0ff, e: 0.8, sss: 0.9, gloss: 0.9 }),
  brineLeech: () => bug(lift('brineLeech'), { len: 0.55, w: 0.16, h: 0.11, segs: 4, pairs: 0, legLen: 0, head: 0.08, slug: true, eyes: 0 }, { c: 0x2a4a5a, t: 0x4a7a8a, a: 0x8acaea, g: 0x7fd0ff, e: 0.6, gloss: 0.95, sss: 0.8 }),
  spitNewt: () => spitter(lift('spitNewt'), { r: 0.26, squash: 0.55, kind: 'newt', legs: 0.12, mouth: 0.3 }, { c: 0xc8d8e0, t: 0x8ab0c8, a: 0xf0e8f0, g: 0x7fd0ff, e: 0.8, gloss: 0.95, sss: 0.9 }),
  clatterclaw: () => upright(lift('clatterclaw'), { body: 0.55, h: 0.55, head: 0.2, arms: 0.7, armR: 0.11, hand: 'pincer', legs: 0.7, legR: 0.06, kind: 'crab' }, { c: 0x3a5a6a, t: 0x5a8aa0, a: 0x2a7a9a, g: 0x7fd0ff, e: 0.7 }),
  // III Crystal Geode / Old Halden Mines
  shardling: () => puff(lift('shardling'), { r: 0.32, kind: 'cluster', legs: 2 }, { c: 0x3a6a8a, a: 0x52e8f5, g: 0xc29cff, e: 0.8 }),
  prismBat: () => bat({ body: 0.2, span: 0.55, ears: 0.9, kind: 'bat', crystals: true }, { c: 0x4a3a6a, t: 0x6a5a9a, a: 0x9a7ae0, g: 0x52e8f5, e: 0.8 }),
  geodeGolem: () => upright(lift('geodeGolem'), { body: 0.62, h: 0.95, head: 0.24, arms: 0.9, armR: 0.17, hand: 'fist', legs: 0.6, legR: 0.18, kind: 'golem', extra: 'crystals' }, { c: 0x5a5a66, t: 0x7a7a88, a: 0x8fe8ff, g: 0xc29cff, e: 0.7 }),
  quartzRam: () => quad(lift('quartzRam'), { len: 1.15, w: 0.38, h: 0.36, legLen: 0.34, head: 0.27, snout: 0.2, ears: 'pointy', horns: 2, back: 'crystals', tail: 0.25, tailTip: 'tuft' }, { c: 0x5a5a70, t: 0x8a8aa8, a: 0x9a7ae0, g: 0x52e8f5, e: 0.75 }),
  cartMimic: () => mimic(lift('cartMimic'), { r: 0.6, kind: 'cart' }, { c: 0x4a3a2a, t: 0x7a6a5a, a: 0x8a6a4a, g: 0xffb04a, e: 0.75 }),
  rustMite: () => bug(lift('rustMite'), { len: 0.38, w: 0.15, h: 0.1, segs: 3, pairs: 3, legLen: 0.18, head: 0.08, spines: 3, eyes: 2 }, { c: 0x6a3a22, t: 0xa85a2a, a: 0xd8783a, g: 0xffb04a, e: 0.6 }),
  fuseBeetle: () => puff(lift('fuseBeetle'), { r: 0.34, kind: 'beetle', legs: 3 }, { c: 0x2a2220, t: 0x4a3a30, a: 0x3a2a22, g: 0xff9a3a, e: 0.9, gloss: 0.9 }),
  // IV Frost Caverns / Glowroot Jungle
  icefang: () => quad(lift('icefang'), { len: 1.1, w: 0.36, h: 0.34, legLen: 0.36, head: 0.26, snout: 0.26, ears: 'pointy', back: 'fur', tail: 0.55, tailTip: 'tuft' }, { c: 0xc8d8e8, t: 0xf0f6ff, a: 0x8ab0d8, g: 0x7fd8ff, e: 0.8, sss: 0.6 }),
  frostBat: () => bat({ body: 0.22, span: 0.6, ears: 0.8, kind: 'bat' }, { c: 0xa8c8e0, t: 0xe0f0ff, a: 0x6a9ac8, g: 0xbfeaff, e: 0.8 }),
  shiverDrip: () => hanger(lift('shiverDrip'), { r: 0.4, tendrils: 6, len: 0.55, kind: 'ice' }, { c: 0x8ac8f0, t: 0xd8f4ff, a: 0xc8ecff, g: 0x7fd8ff, e: 0.7 }),
  rimeHulk: () => upright(lift('rimeHulk'), { body: 0.62, h: 0.95, head: 0.22, arms: 0.95, armR: 0.18, hand: 'fist', legs: 0.6, legR: 0.18, kind: 'golem', extra: 'crystals' }, { c: 0x9ab8d0, t: 0xd8ecff, a: 0xbfeaff, g: 0x7fd8ff, e: 0.75, sss: 0.7, gloss: 0.8 }),
  glowMantis: () => upright(lift('glowMantis'), { body: 0.32, h: 0.75, head: 0.14, arms: 0.75, armR: 0.05, hand: 'scythe', legs: 0.55, legR: 0.04, kind: 'mantis' }, { c: 0x2a6a3a, t: 0x4aa85a, a: 0x8cff6a, g: 0x8cff6a, e: 0.8 }),
  bloatToad: () => spitter(lift('bloatToad'), { r: 0.55, squash: 0.75, kind: 'toad', legs: 0.11, mouth: 0.4 }, { c: 0x4a6a2a, t: 0x6a8a3a, a: 0xd8e0a0, g: 0xb6ff4a, e: 0.8 }),
  snapjaw: () => mimic(lift('snapjaw'), { r: 0.65, kind: 'flower' }, { c: 0x2a5a2a, t: 0x4a8a3a, a: 0xff5aa8, g: 0xff8ad0, e: 0.7 }),
  glowAnt: () => bug(lift('glowAnt'), { len: 0.42, w: 0.14, h: 0.1, segs: 3, pairs: 3, legLen: 0.2, head: 0.08, eyes: 2, antennae: 0.22 }, { c: 0x1a3a1a, t: 0x2a5a2a, a: 0x3a6a2a, g: 0x9aff6a, e: 0.9, gloss: 0.8 }),
  // V Sulphur Bog / Sunken City
  gasbag: () => puff(lift('gasbag'), { r: 0.5, kind: 'bladder', legs: 0 }, { c: 0xa8b040, t: 0xd8e060, a: 0x6a7020, g: 0xe8ff5a, e: 0.6 }),
  sulphurSpitter: () => spitter(lift('sulphurSpitter'), { r: 0.36, squash: 0.6, kind: 'lizard', legs: 0.12, mouth: 0.3 }, { c: 0x6a6a22, t: 0xa8a83a, a: 0xd8c040, g: 0xe0ff3a, e: 0.8 }),
  mireLurker: () => grub(lift('mireLurker'), { r: 0.52, segs: 6, len: 2.2, teeth: 12, plates: true }, { c: 0x4a4a2a, t: 0x6a6a3a, a: 0x3a3a22, g: 0xe8ff5a, e: 0.6 }),
  fumeWasp: () => bat({ body: 0.2, span: 0.56, ears: 0, kind: 'wasp' }, { c: 0x2a2a10, t: 0x6a6a20, a: 0xe0d860, g: 0xe0ff3a, e: 0.85, gloss: 0.8 }),
  gildedScarab: () => bug(lift('gildedScarab'), { len: 0.42, w: 0.18, h: 0.12, segs: 2, pairs: 3, legLen: 0.17, head: 0.08, shell: true, eyes: 2 }, { c: 0x3a2a10, t: 0xe0b040, a: 0xffd24a, g: 0x52e8f5, e: 0.6, gloss: 0.95 }),
  runeSentry: () => spitter(lift('runeSentry'), { r: 0.45, squash: 1, kind: 'sentry', legs: 0.1, mouth: 0.2 }, { c: 0x6a6050, t: 0x8a8070, a: 0xa89060, g: 0xffd76a, e: 0.9 }),
  chestMimic: () => mimic(lift('chestMimic'), { r: 0.6, kind: 'chest' }, { c: 0x5a3a1a, t: 0x7a5a2a, a: 0xd8a040, g: 0xffc24a, e: 0.6 }),
  drownedKnight: () => upright(lift('drownedKnight'), { body: 0.55, h: 0.95, head: 0.2, arms: 0.85, armR: 0.13, hand: 'scythe', legs: 0.65, legR: 0.15, kind: 'statue', extra: 'plates' }, { c: 0x46584a, t: 0x6a8a6a, a: 0xa89060, g: 0xffd76a, e: 0.8, gloss: 0.7 }),
  // VI Magma Veins / Obsidian Abyss
  cinderHound: () => quad(lift('cinderHound'), { len: 1.1, w: 0.36, h: 0.34, legLen: 0.36, head: 0.27, snout: 0.25, ears: 'pointy', horns: 2, back: 'cracks', tail: 0.5, tailTip: 'flame' }, { c: 0x2a1a16, t: 0x3a2420, a: 0x1a1210, g: 0xff6a2a, e: 0.9 }),
  emberMite: () => bug(lift('emberMite'), { len: 0.42, w: 0.17, h: 0.11, segs: 3, pairs: 3, legLen: 0.2, head: 0.09, spines: 4, eyes: 3 }, { c: 0x2a1a14, t: 0x4a2a1a, a: 0x1a1210, g: 0xff7a2a, e: 0.9 }),
  magmaBrute: () => upright(lift('magmaBrute'), { body: 0.72, h: 1.05, head: 0.26, arms: 1.0, armR: 0.2, hand: 'fist', legs: 0.6, legR: 0.21, kind: 'golem', extra: 'lava' }, { c: 0x2a2220, t: 0x3a2a26, a: 0x1a1414, g: 0xff5a1a, e: 1 }),
  lavaToad: () => spitter(lift('lavaToad'), { r: 0.55, squash: 0.75, kind: 'toad', legs: 0.11, mouth: 0.4 }, { c: 0x2a1a14, t: 0x4a2418, a: 0x1a1210, g: 0xff6a2a, e: 1 }),
  nullCrawler: () => bug(lift('nullCrawler'), { len: 0.6, w: 0.17, h: 0.12, segs: 4, pairs: 4, legLen: 0.32, head: 0.09, spines: 5, eyes: 0 }, { c: 0x0e0c14, t: 0x1e1a2a, a: 0x302840, g: 0xa070ff, e: 0.8, gloss: 0.95 }),
  voidEye: () => spitter(lift('voidEye'), { r: 0.48, squash: 1, kind: 'eye', legs: 0, mouth: 0 }, { c: 0x1a1426, t: 0x2a2040, a: 0x0a0814, g: 0xa070ff, e: 0.9 }),
  glassWraith: () => bat({ body: 0.32, span: 0.8, ears: 0, kind: 'wraith' }, { c: 0x16121e, t: 0x2a2236, a: 0x302840, g: 0xd8c8ff, e: 0.8, gloss: 0.95 }),
  // Beings
  hearthmite: () => sprite({ r: 0.18, kind: 'ember' }, { c: 0xff9a4a, a: 0xffd070, g: 0xffd070, e: 1 }),
  vinebell: () => grazer(lift('vinebell'), { r: 0.5, kind: 'bell' }, { c: 0xe8f0c8, t: 0xa8f070, a: 0x4a8a3a, g: 0x9aff7a, e: 0.9 }),
  mudpup: () => quad(lift('mudpup'), { len: 0.42, w: 0.17, h: 0.15, legLen: 0.12, head: 0.14, snout: 0.08, ears: 'round', back: 'none', tail: 0.15, tailTip: 'tuft' }, { c: 0x6a5a3a, t: 0x8a7a4a, a: 0xd8c898, g: 0xd8e070, e: 0.5 }),
  relicTurtle: () => grazer(lift('relicTurtle'), { r: 0.55, kind: 'turtle' }, { c: 0x5a6a4a, t: 0x8a9a6a, a: 0x6a5a3a, g: 0xffd24a, e: 0.9 }),
  salamander: () => quad(lift('salamander'), { len: 0.5, w: 0.13, h: 0.09, legLen: 0.09, head: 0.1, snout: 0.08, ears: 'none', back: 'cracks', tail: 0.35, tailTip: 'flame', loot: true }, { c: 0xc84a1a, t: 0xff7a2a, a: 0x4a1a0a, g: 0xffd070, e: 0.9 }),
  starmote: () => sprite({ r: 0.16, kind: 'star' }, { c: 0xd8c8ff, a: 0xffffff, g: 0xf0e8ff, e: 1 }),
  // Guardians
  amberMatriarch: () => bug(lift('amberMatriarch'), { len: 2.6, w: 0.95, h: 0.62, segs: 5, pairs: 4, legLen: 1.1, head: 0.46, shell: true, spines: 6, eyes: 4, tailSpike: true }, { c: 0x6a4a2a, t: 0xc8883a, a: 0xffb347, g: 0xffd070, e: 0.8, gloss: 0.9 }),
  mycelord: () => upright(lift('mycelord'), { body: 0.9, h: 1.6, head: 0.8, arms: 1.4, armR: 0.2, hand: 'claw', legs: 0.9, legR: 0.24, kind: 'mushroom' }, { c: 0x9a2a8a, t: 0xe060c8, a: 0xe8dcc8, g: 0x6df0d8, e: 0.9 }),
  elderTaproot: () => grub(lift('elderTaproot'), { r: 1.1, segs: 7, len: 5, teeth: 16, plates: true }, { c: 0x4a3420, t: 0x6a4a2a, a: 0x8a6a3a, g: 0xd8f060, e: 0.8 }),
  tideWarden: () => upright(lift('tideWarden'), { body: 1.2, h: 1.0, head: 0.4, arms: 1.6, armR: 0.25, hand: 'pincer', legs: 1.4, legR: 0.13, kind: 'crab', extra: 'crystals' }, { c: 0x2a4a5a, t: 0x3a6a80, a: 0x1a5a7a, g: 0x7fd0ff, e: 0.8 }),
  quartzTitan: () => upright(lift('quartzTitan'), { body: 1.1, h: 1.8, head: 0.4, arms: 1.7, armR: 0.3, hand: 'fist', legs: 1.1, legR: 0.32, kind: 'golem', extra: 'crystals' }, { c: 0x4a5a70, t: 0x8aa8c8, a: 0x52e8f5, g: 0xc29cff, e: 0.9 }),
  foremanEngine: () => upright(lift('foremanEngine'), { body: 0.95, h: 1.6, head: 0.36, arms: 1.5, armR: 0.24, hand: 'fist', legs: 1.0, legR: 0.26, kind: 'robot', extra: 'boiler' }, { c: 0x6a4a2a, t: 0x8a6a3a, a: 0xb08a4a, g: 0xffb04a, e: 1, gloss: 0.8 }),
  rimeWyrm: () => serpent({ r: 0.75, segs: 8, len: 6, span: 2.8 }, { c: 0x8ab0d0, t: 0xd8ecff, a: 0xbfeaff, g: 0x7fd8ff, e: 0.9 }),
  thornmother: () => mimicQueen(),
  miasmaKing: () => spitter(lift('miasmaKing'), { r: 1.5, squash: 0.75, kind: 'toad', legs: 0.13, mouth: 0.5 }, { c: 0x5a5a22, t: 0x8a8a2a, a: 0xd8c040, g: 0xe8ff5a, e: 0.8 }),
  gildedColossus: () => upright(lift('gildedColossus'), { body: 1.0, h: 2.0, head: 0.42, arms: 1.7, armR: 0.28, hand: 'fist', legs: 1.2, legR: 0.3, kind: 'statue', extra: 'runes' }, { c: 0x8a6a2a, t: 0xe0b040, a: 0xffd24a, g: 0xffe08a, e: 1, gloss: 0.9 }),
  magmaBehemoth: () => quad(lift('magmaBehemoth'), { len: 4.2, w: 1.5, h: 1.35, legLen: 1.2, head: 0.9, snout: 0.6, ears: 'none', horns: 2, back: 'cracks', tail: 1.6, tailTip: 'club' }, { c: 0x2a1e1a, t: 0x3a2620, a: 0x1a1210, g: 0xff5a1a, e: 1 }),
  voidHerald: () => herald({ r: 1.0, kind: 'herald' }, { c: 0x1a1426, t: 0x2a2040, a: 0x3a2a50, g: 0xa070ff, e: 1 }),
  heartOfDark: () => herald({ r: 1.8, kind: 'heart' }, { c: 0x2a0a1a, t: 0x5a1430, a: 0x1a0a14, g: 0xff6aa0, e: 1, gloss: 0.95 }),
};

/** The Thornmother: a vast bud on a root mass, thorn spines and a crown of petals (mimic bones). */
function mimicQueen(): MobModel {
  const m = mimic(lift('thornmother'), { r: 1.6, kind: 'flower' }, { c: 0x2a4a22, t: 0x4a7a3a, a: 0x8cff6a, g: 0xb6ff4a, e: 0.9 });
  return m;
}

const cache = new Map<string, MobModel>();

/** The model of a roster kind (built once). */
export function bodyPlanModel(kind: MobKind, variant = 0): MobModel {
  const key = `${kind}:${variant}`;
  let m = cache.get(key);
  if (m) return m;
  const plan = PLANS[kind];
  DETAIL = DETAIL_BY_SIZE[SPECIES[kind].size] ?? 1;
  try {
    if (plan) m = plan();
  } finally {
    DETAIL = 1;
  }
  if (!m) {
    // Never shown to players: every roster kind has a plan (tests check it).
    const b = new ModelBuilder();
    b.bone('body', -1, [0, 0, 0]);
    b.add(ellipsoid(SPECIES[kind].radius, SPECIES[kind].radius * 0.8, SPECIES[kind].radius), 'body', { color: 0x808080 });
    m = { ...b.build(), look: {} };
  }
  cache.set(key, m);
  return m;
}

/** The kinds the builder makes (tests: every roster kind not hand-made in models.ts has a plan). */
export const PLANNED_KINDS = Object.keys(PLANS) as MobKind[];
