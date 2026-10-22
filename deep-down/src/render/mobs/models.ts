import * as THREE from 'three';
import type { MobKind } from '../../game/mobs/types';
import { block, boulder, crystal, ellipsoid, fin, lathe, limb, merge, ModelBuilder, place, type BuiltModel } from './rig';
import type { MobLook } from './mobMaterial';
import { bodyPlanModel } from './bodyPlan';

/**
 * The creatures, sculpted from smooth and bevelled primitives (round 2, MOBS). Model space: +z is
 * forward, +y up, the origin is the Mob's position (its body centre). One geometry per kind, built
 * once; every part is bound to a bone that render/mobs/poses animates.
 */
export interface MobModel extends BuiltModel {
  look: MobLook;
  /** Extra models drawn with the same bones (a translucent shell over an opaque body). */
  shell?: { model: BuiltModel; look: MobLook };
}

type P3 = [number, number, number];

const cache = new Map<string, MobModel>();

export function mobModel(kind: MobKind, variant = 0): MobModel {
  const key = `${kind}:${variant}`;
  let m = cache.get(key);
  if (!m) {
    const build = BUILDERS[kind];
    m = build ? build(variant) : bodyPlanModel(kind, variant);
    cache.set(key, m);
  }
  return m;
}

/** The moths are drawn by MobRenderer's instanced swarm; their entry here is never used. */
const BUILDERS: Partial<Record<MobKind, (variant: number) => MobModel>> = {
  crawler,
  gnasher,
  wisp,
  stalker,
  sentinel,
  worm,
  moth: lampling,
  lampling,
  glimmerkin,
  shellback,
  jelly,
  burrower,
};

// ---------------------------------------------------------------------------------------
// Monsters

/** Pale, eyeless, too many legs: a segmented bone-white body, ten long jointed legs, mandibles. */
function crawler(): MobModel {
  const b = new ModelBuilder();
  b.bone('body', -1, [0, 0, 0]);
  b.bone('head', 'body', [0, 0.02, 0.26]);
  b.bone('tail', 'body', [0, 0.02, -0.22]);
  const flesh = { color: 0x5d6266, top: 0x8f969b, y0: -0.12, y1: 0.12, sss: 0.6, gloss: 0.6, rim: 0.5 };
  // Thorax and abdomen: overlapping segments, a dorsal ridge of plates.
  b.add(ellipsoid(0.17, 0.11, 0.2, [0, 0, 0.06], 20, 0.06, 2), 'body', flesh);
  b.add(ellipsoid(0.15, 0.1, 0.14, [0, 0.01, -0.12], 18, 0.05, 5), 'body', flesh);
  for (let i = 0; i < 5; i++) {
    const z = 0.2 - i * 0.09;
    b.add(ellipsoid(0.12 - i * 0.012, 0.035, 0.05, [0, 0.095 - i * 0.004, z], 14), 'body', { color: 0x8a9096, gloss: 0.8, sss: 0.3, rim: 0.6 });
    b.add(crystal(0.07 - i * 0.008, 0.016, [0, 0.12 - i * 0.004, z - 0.01], [0, 1, -0.5], 0, 5), 'body', { color: 0x6f675c, gloss: 0.6, flat: true });
  }
  // A faint cold seam along the flanks (it lives where the light is not).
  b.add(limb([0.15, 0.01, 0.16], [0.13, 0.0, -0.2], 0.007, 0.005, 5), 'body', { color: 0x7ff0d0, emit: 0.25 });
  b.add(limb([-0.15, 0.01, 0.16], [-0.13, 0.0, -0.2], 0.007, 0.005, 5), 'body', { color: 0x7ff0d0, emit: 0.25 });
  b.add(ellipsoid(0.1, 0.075, 0.09, [0, 0.0, -0.27], 14, 0.04, 9), 'tail', flesh);
  b.add(crystal(0.12, 0.02, [0, 0.0, -0.33], [0, -0.2, -1], 0, 5), 'tail', { color: 0x7d7468, gloss: 0.8, flat: true });
  // The head: a smooth eyeless dome, pitted, a vertical slit mouth with a sickly inner glow.
  b.add(ellipsoid(0.1, 0.08, 0.13, [0, 0.02, 0.36], 20, 0.03, 11), 'head', { color: 0x9aa0a4, sss: 0.55, gloss: 0.75, rim: 0.6 });
  b.add(ellipsoid(0.008, 0.04, 0.008, [0, -0.01, 0.487], 8), 'head', { color: 0x9ff7dc, emit: 0.45 });
  for (const s of [-1, 1]) {
    // Mandibles: curved hooks either side of the slit.
    const m1 = limb([0.04 * s, -0.02, 0.44], [0.075 * s, -0.04, 0.52], 0.018, 0.012, 6);
    const m2 = limb([0.075 * s, -0.04, 0.52], [0.035 * s, -0.05, 0.585], 0.012, 0.003, 6);
    b.bone(`jaw${s}`, 'head', [0.04 * s, -0.02, 0.44]);
    b.add(merge([m1, m2]), `jaw${s}`, { color: 0x6e6252, gloss: 0.9, rim: 0.6 });
    // Feelers.
    b.add(limb([0.05 * s, 0.06, 0.4], [0.16 * s, 0.16, 0.58], 0.008, 0.002, 4), 'head', { color: 0x9c9284, sss: 0.5 });
  }
  // Ten legs: upper segment up and out to a high knee, lower segment down to the rock.
  for (let i = 0; i < 5; i++) {
    const z = 0.18 - i * 0.095;
    for (const s of [-1, 1]) {
      const hip: P3 = [0.12 * s, 0.0, z];
      const knee: P3 = [0.33 * s, 0.17, z + (i - 2) * 0.03];
      const foot: P3 = [0.46 * s, -0.2, z + (i - 2) * 0.07];
      const up = b.bone(`u${i}${s}`, 'body', hip);
      const lo = b.bone(`l${i}${s}`, up, knee);
      b.add(limb(hip, knee, 0.03, 0.02, 7), up, { color: 0x6c7175, top: 0x9299a0, y0: 0, y1: 0.17, sss: 0.6, gloss: 0.55, rim: 0.6 });
      b.add(limb(knee, foot, 0.02, 0.005, 7), lo, { color: 0x9aa1a6, top: 0x52575b, y0: 0.15, y1: -0.15, sss: 0.5, gloss: 0.65, rim: 0.6 });
      b.add(ellipsoid(0.028, 0.028, 0.028, knee, 8), lo, { color: 0x5e564c, gloss: 0.8 });
    }
  }
  return { ...b.build(), look: { bump: 0.006, bumpFreq: 38, sssTint: 0xff8c78, rimDark: [0.02, 0.026, 0.034], glowTint: 0x9ff7dc, pulse: 1.1 } };
}

/** A boulder that is not a boulder: a rock shell hinged at the back over a ring of crystal teeth. */
function gnasher(): MobModel {
  const b = new ModelBuilder();
  b.bone('base', -1, [0, 0, 0]);
  b.bone('lid', 'base', [0, 0.02, -0.42]);
  b.bone('maw', 'base', [0, -0.05, 0]);
  const rock = { color: 0x55534f, top: 0x77736b, y0: -0.4, y1: 0.4, gloss: 0.12, rim: 0.35, flat: true };
  // Lower shell (the bowl) and the lid: a split boulder.
  const whole = boulder(0.62, 3.3, 0.26, 2, 0.8);
  const { lower, upper } = splitY(whole, 0.02);
  b.add(lower, 'base', rock);
  b.add(upper, 'lid', rock);
  // The lips: dark flesh inside the shell rims.
  b.add(ellipsoid(0.5, 0.06, 0.5, [0, 0.01, 0], 22), 'maw', { color: 0x1d0b0b, sss: 0.3, gloss: 0.8 });
  b.add(ellipsoid(0.48, 0.05, 0.48, [0, 0.04, 0], 22), 'lid', { color: 0x170909, sss: 0.3, gloss: 0.8 });
  // The maw's glow, deep inside.
  b.add(ellipsoid(0.14, 0.07, 0.14, [0, -0.02, 0.04], 14), 'maw', { color: 0xff5a2e, emit: 0.7, sss: 1 });
  // A ring of crystal teeth on both lips, pointing in.
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2;
    const r = 0.44;
    const x = Math.sin(a) * r;
    const z = Math.cos(a) * r;
    const len = 0.13 + (i % 3) * 0.035;
    b.add(crystal(len, 0.035, [x, 0.0, z], [-x * 0.9, 1, -z * 0.9], a), 'base', { color: 0xb4dfe8, emit: 0.1, gloss: 1, sss: 0.4, flat: true });
    const a2 = a + Math.PI / 14;
    b.add(crystal(len * 0.9, 0.032, [Math.sin(a2) * r * 0.96, 0.05, Math.cos(a2) * r * 0.96], [-Math.sin(a2) * 0.9, -1, -Math.cos(a2) * 0.9], a2), 'lid', { color: 0xa9d4e0, emit: 0.08, gloss: 1, sss: 0.4, flat: true });
  }
  // The seam between the halves: a faint warm glow that breathes (the only tell).
  b.add(new THREE.TorusGeometry(0.55, 0.012, 6, 48).rotateX(Math.PI / 2).translate(0, 0.02, 0), 'base', { color: 0xff7a3a, emit: 0.22 });
  // Crystal tips poking out of its cracks: a boulder that is not a boulder.
  for (let i = 0; i < 6; i++) {
    const a = i * 1.07 + 0.3;
    const y = 0.15 + (i % 3) * 0.1;
    const r = Math.sqrt(Math.max(0.05, 0.6 * 0.6 - y * y));
    b.add(crystal(0.08 + (i % 2) * 0.04, 0.018, [Math.sin(a) * r * 0.97, y, Math.cos(a) * r * 0.97], [Math.sin(a), 0.6, Math.cos(a)], a), 'lid', { color: 0xb9f2ff, emit: 0.3, gloss: 1, flat: true });
  }
  // A few lichen flecks and pebbles on the lid (it has lain here a long time).
  for (let i = 0; i < 5; i++) {
    const a = i * 1.9 + 0.4;
    b.add(ellipsoid(0.05, 0.02, 0.05, [Math.sin(a) * 0.3, 0.42 - (i % 2) * 0.06, Math.cos(a) * 0.28], 8, 0.3, i), 'lid', { color: 0x7d8a5a, rim: 0.3 });
  }
  return { ...b.build(), look: { bump: 0.11, bumpFreq: 7, sssTint: 0xff5a3a, rimDark: [0.01, 0.012, 0.016], glowTint: 0xffffff, pulse: 0.9 } };
}

/** A drifting smoke shape: a hood over a torn veil of blobs, two pale embers for eyes. */
function wisp(): MobModel {
  const b = new ModelBuilder();
  b.bone('core', -1, [0, 0, 0]);
  const smoke = { color: 0x2d2638, alpha: 0.9, rim: 0.2 };
  const blobs: Array<[P3, P3]> = [
    [[0, 0.42, 0], [0.32, 0.34, 0.3]],
    [[0, 0.1, 0.02], [0.4, 0.38, 0.34]],
    [[0.12, -0.25, -0.04], [0.3, 0.36, 0.26]],
    [[-0.14, -0.3, 0.05], [0.26, 0.4, 0.24]],
    [[0.02, -0.62, -0.06], [0.18, 0.34, 0.16]],
    [[0.2, -0.75, 0.1], [0.08, 0.3, 0.08]],
    [[-0.18, -0.82, -0.04], [0.07, 0.34, 0.07]],
  ];
  blobs.forEach(([at, r], i) => {
    const bn = b.bone(`b${i}`, 'core', at);
    b.add(ellipsoid(r[0], r[1], r[2], at, 16, 0.18, i * 3.1), bn, smoke);
  });
  // The face: a deeper hollow under the hood, two cold embers.
  b.add(ellipsoid(0.17, 0.12, 0.06, [0, 0.36, 0.24], 12), 'b0', { color: 0x120e18, alpha: 1 });
  for (const s of [-1, 1]) b.add(ellipsoid(0.03, 0.022, 0.02, [0.07 * s, 0.38, 0.3], 10), 'b0', { color: 0xe4d6ff, emit: 1 });
  return { ...b.build(), look: { smoke: true, glowTint: 0xffffff, pulse: 2.2, bump: 0 } };
}

/** Thin and tall: long limbs, a ribbed torso, a pale featureless mask with a glowing slit. */
function stalker(): MobModel {
  const b = new ModelBuilder();
  const hipY = -0.15;
  b.bone('pelvis', -1, [0, hipY, 0]);
  b.bone('chest', 'pelvis', [0, 0.3, 0]);
  b.bone('head', 'chest', [0, 1.1, 0.04]);
  const skin = { color: 0x111317, top: 0x1b1e24, y0: -1.4, y1: 1.4, gloss: 0.55, sss: 0.1, rim: 0.8 };
  // Pelvis, a sunken waist, a long hunched ribcage (ribs as ridges under the skin), shoulders.
  b.add(ellipsoid(0.16, 0.12, 0.1, [0, hipY, 0], 16, 0.05, 1), 'pelvis', skin);
  b.add(ellipsoid(0.075, 0.24, 0.065, [0, 0.2, 0.0], 14, 0.04, 2), 'chest', skin);
  b.add(ellipsoid(0.15, 0.34, 0.11, [0, 0.72, 0.03], 20, 0.09, 3), 'chest', { ...skin, color: 0x221f1c, top: 0x302b26 });
  for (let i = 0; i < 4; i++) b.add(ellipsoid(0.13 - i * 0.012, 0.018, 0.1 - i * 0.008, [0, 0.58 + i * 0.09, 0.045], 14), 'chest', { color: 0x2b2722, gloss: 0.3, rim: 0.7 });
  b.add(ellipsoid(0.23, 0.065, 0.09, [0, 1.02, 0.0], 16, 0.05, 5), 'chest', skin);
  b.add(limb([0, 1.04, 0.0], [0, 1.2, 0.06], 0.045, 0.035, 8), 'chest', skin);
  // The head: a long skull, the mask a pale porcelain plate on its front, a vertical slit of cold light.
  b.add(ellipsoid(0.09, 0.17, 0.115, [0, 1.33, 0.03], 18, 0.03, 7), 'head', skin);
  b.add(ellipsoid(0.082, 0.165, 0.04, [0, 1.31, 0.115], 18, 0.02, 4), 'head', { color: 0xb4b0a8, gloss: 0.6, sss: 0.3, rim: 0.5 });
  b.add(ellipsoid(0.006, 0.065, 0.008, [0, 1.31, 0.153], 8), 'head', { color: 0xcfe9ff, emit: 0.8 });
  // A tattered shroud from the shoulders to below the knees (both faces, so it reads from any side).
  const prof: Array<[number, number]> = [];
  for (let i = 0; i <= 10; i++) {
    const k = i / 10;
    prof.push([0.12 + 0.15 * Math.sin(k * Math.PI * 0.5) + 0.12 * k * k, 1.08 - k * 1.85]);
  }
  const shroud = lathe(prof.slice().reverse(), 22);
  const sp = shroud.getAttribute('position');
  for (let i = 0; i < sp.count; i++) {
    const x = sp.getX(i);
    const z = sp.getZ(i);
    const y = sp.getY(i);
    const a2 = Math.atan2(x, z);
    // Torn hem: long ragged tails, and folds down its length.
    const hem = y < -0.5 ? (Math.sin(a2 * 7) * 0.5 + Math.sin(a2 * 13 + 1) * 0.3) * 0.18 * (-0.5 - y) * 3 : 0;
    const fold = 1 + Math.sin(a2 * 9 + y * 2) * 0.06 * Math.min(1, (1.1 - y) / 0.6);
    sp.setXYZ(i, x * fold, y + hem, z * fold);
  }
  shroud.computeVertexNormals();
  const inner = shroud.clone();
  const ip = inner.getIndex()!;
  const arr = ip.array as Uint16Array | Uint32Array;
  for (let i = 0; i < arr.length; i += 3) {
    const t2 = arr[i];
    arr[i] = arr[i + 2];
    arr[i + 2] = t2;
  }
  const inn = inner.getAttribute('normal');
  for (let i = 0; i < inn.count; i++) inn.setXYZ(i, -inn.getX(i), -inn.getY(i), -inn.getZ(i));
  const cloth = { color: 0x16171a, top: 0x23252a, y0: -0.8, y1: 1.1, gloss: 0.08, sss: 0.15, rim: 0.9 };
  b.add(shroud, 'chest', cloth);
  b.add(inner, 'chest', { ...cloth, color: 0x0c0d0f, top: 0x0c0d0f });
  for (const s of [-1, 1]) {
    // Arms to the knees, hands of three long fingers.
    const sh: P3 = [0.2 * s, 1.02, 0];
    const el: P3 = [0.27 * s, 0.42, 0.02];
    const wr: P3 = [0.3 * s, -0.2, 0.05];
    const ua = b.bone(`ua${s}`, 'chest', sh);
    const fa = b.bone(`fa${s}`, ua, el);
    const hd = b.bone(`hd${s}`, fa, wr);
    b.add(limb(sh, el, 0.045, 0.03, 8), ua, skin);
    b.add(limb(el, wr, 0.03, 0.022, 8), fa, skin);
    for (let f = -1; f <= 1; f++) b.add(limb(wr, [0.3 * s + f * 0.035, -0.55, 0.06 + f * 0.03], 0.012, 0.004, 5), hd, { color: 0x1e1c1a, gloss: 0.6, rim: 0.9 });
    // Legs: long thigh, longer shin, a narrow foot.
    const hp: P3 = [0.1 * s, hipY, 0];
    const kn: P3 = [0.12 * s, -0.78, 0.06];
    const an: P3 = [0.12 * s, -1.45, -0.02];
    const th = b.bone(`th${s}`, 'pelvis', hp);
    const sn = b.bone(`sn${s}`, th, kn);
    b.add(limb(hp, kn, 0.06, 0.04, 8), th, skin);
    b.add(limb(kn, an, 0.04, 0.025, 8), sn, skin);
    b.add(limb(an, [0.12 * s, -1.49, 0.16], 0.03, 0.015, 6), sn, skin);
  }
  return { ...b.build(), look: { bump: 0.008, bumpFreq: 26, sssTint: 0x8a6a60, rimDark: [0.028, 0.032, 0.042], glowTint: 0xcfe9ff, pulse: 0.7 } };
}

/** A Halden automaton: bevelled cut-stone blocks, glowing rune grooves, a core behind chest doors. */
function sentinel(): MobModel {
  const b = new ModelBuilder();
  b.bone('root', -1, [0, -0.9, 0]);
  b.bone('torso', 'root', [0, -0.3, 0]);
  b.bone('head', 'torso', [0, 0.85, 0]);
  b.bone('core', 'torso', [0, 0.25, 0.28]);
  b.bone('doorL', 'torso', [-0.32, 0.25, 0.42]);
  b.bone('doorR', 'torso', [0.32, 0.25, 0.42]);
  const stone = { color: 0x55514a, top: 0x6c665c, y0: -1.7, y1: 1.3, gloss: 0.25, rim: 0.45 };
  const dark = { color: 0x3e3a35, gloss: 0.2, rim: 0.45 };
  const rune = { color: 0x7fe9ff, emit: 0.55 };
  // Legs: two stout pillars on broad feet.
  for (const s of [-1, 1]) {
    const lg = b.bone(`leg${s}`, 'root', [0.34 * s, -0.55, 0]);
    b.add(block(0.4, 0.95, 0.44, [0.34 * s, -1.15, 0], 0.07), lg, stone);
    b.add(block(0.5, 0.22, 0.62, [0.34 * s, -1.63, 0.06], 0.06), lg, dark);
  }
  // Torso: a heavy plinth of courses, the chest wider, a rune band.
  b.add(block(0.9, 0.42, 0.62, [0, -0.38, 0], 0.08), 'torso', stone);
  b.add(block(1.3, 0.78, 0.8, [0, 0.28, 0], 0.09), 'torso', stone);
  b.add(block(1.32, 0.05, 0.82, [0, -0.05, 0], 0.02), 'torso', rune);
  b.add(block(0.08, 0.6, 0.02, [-0.5, 0.3, 0.41], 0.01), 'torso', rune);
  b.add(block(0.08, 0.6, 0.02, [0.5, 0.3, 0.41], 0.01), 'torso', rune);
  // The core behind the doors: a faceted lanternstone.
  b.add(place(new THREE.IcosahedronGeometry(0.2, 1), [0, 0.25, 0.3]), 'core', { color: 0xffd27a, emit: 1, flat: true, gloss: 1 });
  b.add(ellipsoid(0.27, 0.27, 0.12, [0, 0.25, 0.22], 16), 'torso', { color: 0x231c16, gloss: 0.3 });
  b.add(block(0.32, 0.62, 0.08, [-0.16, 0.25, 0.43], 0.03), 'doorL', dark);
  b.add(block(0.32, 0.62, 0.08, [0.16, 0.25, 0.43], 0.03), 'doorR', dark);
  // Shoulders, arms of two blocks, heavy fists.
  for (const s of [-1, 1]) {
    const sh = b.bone(`sh${s}`, 'torso', [0.78 * s, 0.5, 0]);
    const fa = b.bone(`fa${s}`, sh, [0.86 * s, -0.12, 0]);
    b.add(block(0.42, 0.4, 0.5, [0.8 * s, 0.52, 0], 0.08), sh, stone);
    b.add(block(0.3, 0.62, 0.34, [0.86 * s, 0.12, 0], 0.06), sh, stone);
    b.add(block(0.04, 0.5, 0.02, [0.86 * s, 0.12, 0.175], 0.01), sh, rune);
    b.add(block(0.32, 0.6, 0.36, [0.88 * s, -0.46, 0.02], 0.06), fa, stone);
    b.add(block(0.42, 0.38, 0.44, [0.9 * s, -0.92, 0.04], 0.08), fa, dark);
  }
  // Age: moss in the joints of its courses, a chipped corner, a ring of glyphs round the core.
  const moss = { color: 0x4f5a3a, top: 0x667248, y0: -0.2, y1: 0.2, rim: 0.3 };
  for (const [at, r] of [[[0.5, 0.66, 0.3], 0.12], [[-0.55, -0.1, 0.32], 0.1], [[0.2, -0.56, 0.3], 0.09], [[-0.62, 0.66, -0.2], 0.11]] as Array<[P3, number]>) b.add(ellipsoid(r, r * 0.35, r * 0.8, at, 10, 0.4, at[0] * 7), 'torso', moss);
  for (const s2 of [-1, 1]) b.add(ellipsoid(0.12, 0.05, 0.12, [0.34 * s2, -0.66, 0.2], 10, 0.4, s2 * 3), `leg${s2}`, moss);
  for (let k = 0; k < 10; k++) {
    const a2 = (k / 10) * Math.PI * 2;
    b.add(block(0.035, 0.07, 0.015, [Math.sin(a2) * 0.3, 0.25 + Math.cos(a2) * 0.3, 0.405], 0.005), 'torso', { color: 0x7fe9ff, emit: 0.35 });
  }
  // Head: a lintel block, an eye slit of light, a crest.
  b.add(block(0.56, 0.42, 0.5, [0, 0.98, 0.02], 0.07), 'head', stone);
  b.add(block(0.38, 0.05, 0.02, [0, 1.0, 0.27], 0.01), 'head', { color: 0x9ff6ff, emit: 1 });
  b.add(block(0.62, 0.1, 0.56, [0, 1.24, 0.02], 0.03), 'head', dark);
  return { ...b.build(), look: { bump: 0.016, bumpFreq: 11, sssTint: 0x000000, rimDark: [0.012, 0.014, 0.018], glowTint: 0xffffff, pulse: 1.6 } };
}

/** Huge: a ridged, plated body along +z (head at 0, tail at -30 m), glowing spots, a petal maw. */
function worm(): MobModel {
  const b = new ModelBuilder();
  const segs = 22;
  const len = 30;
  for (let i = 0; i < segs; i++) b.bone(`s${i}`, -1, [0, 0, -(i / (segs - 1)) * len]);
  const skin = { color: 0x2a272b, top: 0x3b3538, y0: -2, y1: 2, gloss: 0.6, sss: 0.25, rim: 0.7 };
  for (let i = 0; i < segs; i++) {
    const z = -(i / (segs - 1)) * len;
    const k = i / (segs - 1);
    const r = 2.2 * (k < 0.12 ? 0.75 + k * 2 : 1 - Math.pow(Math.max(0, k - 0.3) / 0.7, 1.6) * 0.82);
    b.add(ellipsoid(r, r * 0.92, len / (segs - 1) * 0.75, [0, 0, z], 18, 0.05, i), `s${i}`, skin);
    // A plate ridge per segment, and bioluminescent spots along the flanks.
    b.add(ellipsoid(r * 1.04, r * 0.5, len / (segs - 1) * 0.22, [0, r * 0.45, z - 0.3], 16), `s${i}`, { color: 0x403a3c, gloss: 0.8, rim: 0.8 });
    for (const s of [-1, 1]) b.add(ellipsoid(0.16, 0.16, 0.16, [r * 0.86 * s, -r * 0.1, z], 8), `s${i}`, { color: 0x6ff0d8, emit: 1 });
  }
  // The maw: petals around a dark throat.
  for (let p = 0; p < 6; p++) {
    const a = (p / 6) * Math.PI * 2;
    b.add(place(new THREE.ConeGeometry(0.8, 2.2, 6), [Math.sin(a) * 1.2, Math.cos(a) * 1.2, 1.4], [Math.PI / 2 - Math.cos(a) * 0.5, 0, -a]), 's0', { color: 0x4a3c3e, gloss: 0.7, sss: 0.4 });
  }
  b.add(ellipsoid(1.0, 1.0, 0.5, [0, 0, 1.0], 14), 's0', { color: 0xff7a4a, emit: 0.6 });
  return { ...b.build(), look: { bump: 0.03, bumpFreq: 3, sssTint: 0x8a4a40, rimDark: [0.02, 0.024, 0.03], glowTint: 0xffffff, pulse: 0.6 } };
}

// ---------------------------------------------------------------------------------------
// Beings

/** A little lantern-bodied sprite: a glass bulb with a flame inside, a brass cap, big dark eyes. */
function lampling(): MobModel {
  const b = new ModelBuilder();
  b.bone('body', -1, [0, 0, 0]);
  b.bone('cap', 'body', [0, 0.1, 0]);
  b.bone('tail', 'body', [0, -0.08, 0]);
  b.bone('armL', 'body', [-0.09, -0.01, 0]);
  b.bone('armR', 'body', [0.09, -0.01, 0]);
  // The flame core (opaque, bright) and the brass.
  b.add(ellipsoid(0.055, 0.075, 0.055, [0, -0.005, 0], 14), 'body', { color: 0xffb553, emit: 1 });
  b.add(ellipsoid(0.03, 0.05, 0.03, [0, 0.02, 0], 10), 'body', { color: 0xfff0c8, emit: 1 });
  b.add(lathe([[0.0, 0.12], [0.06, 0.115], [0.085, 0.095], [0.09, 0.085], [0.0, 0.085]], 16), 'cap', { color: 0xb58a4a, gloss: 0.9, rim: 0.6 });
  b.add(new THREE.TorusGeometry(0.03, 0.007, 6, 16).translate(0, 0.155, 0), 'cap', { color: 0xc49a55, gloss: 0.9 });
  b.add(lathe([[0.0, -0.1], [0.05, -0.095], [0.06, -0.085], [0.0, -0.082]], 14), 'body', { color: 0xa07a40, gloss: 0.9 });
  // Eyes on the glass: glossy black with a catchlight.
  for (const s of [-1, 1]) {
    b.add(ellipsoid(0.026, 0.032, 0.012, [0.035 * s, 0.015, 0.085], 12), 'body', { color: 0x0f0b0a, gloss: 1, rim: 0.2 });
    b.add(ellipsoid(0.006, 0.006, 0.004, [0.03 * s + 0.004, 0.026, 0.096], 6), 'body', { color: 0xffffff, emit: 1 });
  }
  // Leaf arms and a flame tail.
  b.add(place(fin([[0, 0], [-0.04, 0.02], [-0.07, 0.0], [-0.04, -0.015]], 0.6), [-0.08, -0.01, 0.0], [0, 0, 0.3]), 'armL', { color: 0xffcf8a, emit: 0.55, sss: 1 });
  b.add(place(fin([[0, 0], [0.04, 0.02], [0.07, 0.0], [0.04, -0.015]], 0.6), [0.08, -0.01, 0.0], [0, 0, -0.3]), 'armR', { color: 0xffcf8a, emit: 0.55, sss: 1 });
  b.add(place(new THREE.ConeGeometry(0.035, 0.12, 10), [0, -0.15, 0], [Math.PI, 0, 0]), 'tail', { color: 0xffa040, emit: 0.9 });
  const body = b.build();
  // The glass shell, translucent, drawn over the same bones.
  const g = new ModelBuilder();
  g.bone('body', -1, [0, 0, 0]);
  g.add(lathe([[0.0, -0.085], [0.06, -0.08], [0.095, -0.03], [0.1, 0.02], [0.085, 0.07], [0.055, 0.09], [0.0, 0.092]], 20), 'body', { color: 0xd8c8b0, alpha: 0.08, gloss: 1, rim: 0.5, sss: 0.2 });
  return { ...body, look: { bump: 0, glowTint: 0xffffff, pulse: 5.5, sssTint: 0xffb060 }, shell: { model: g.build(), look: { translucent: true, bump: 0, sssTint: 0xffc070, glowTint: 0xffffff } } };
}

/** A crystal-backed scurrier: a round soft body, big ears and eyes, violet shards on its back. */
function glimmerkin(): MobModel {
  const b = new ModelBuilder();
  b.bone('body', -1, [0, 0, 0]);
  b.bone('head', 'body', [0, 0.06, 0.12]);
  b.bone('tail', 'body', [0, 0.02, -0.16]);
  b.bone('back', 'body', [0, 0.14, -0.02]);
  const fur = { color: 0x5a5262, top: 0x7a7088, y0: -0.2, y1: 0.2, sss: 0.3, rim: 0.9, gloss: 0.05 };
  b.add(ellipsoid(0.17, 0.15, 0.19, [0, 0, -0.02], 22, 0.03, 1), 'body', fur);
  b.add(ellipsoid(0.12, 0.08, 0.13, [0, -0.06, 0.02], 16), 'body', { color: 0x9a90a4, sss: 0.4, rim: 0.8 });
  // Head with big ears, big glossy eyes, a pink nose.
  b.add(ellipsoid(0.12, 0.11, 0.11, [0, 0.09, 0.17], 20, 0.02, 3), 'head', fur);
  for (const s of [-1, 1]) {
    const ear = b.bone(`ear${s}`, 'head', [0.06 * s, 0.17, 0.14]);
    b.add(ellipsoid(0.05, 0.1, 0.018, [0.1 * s, 0.26, 0.13], 14), ear, { color: 0x655c70, sss: 0.6, rim: 1 });
    b.add(ellipsoid(0.034, 0.075, 0.008, [0.1 * s, 0.255, 0.142], 12), ear, { color: 0xb77f93, sss: 0.9 });
    b.add(ellipsoid(0.036, 0.042, 0.03, [0.055 * s, 0.11, 0.255], 16), 'head', { color: 0x0b0910, gloss: 1, rim: 0.3 });
    b.add(ellipsoid(0.009, 0.009, 0.006, [0.05 * s + 0.01, 0.125, 0.284], 6), 'head', { color: 0xffffff, emit: 1 });
    // Four short legs.
    for (const f of [1, -1]) {
      const lg = b.bone(`leg${s}${f}`, 'body', [0.09 * s, -0.08, 0.08 * f]);
      b.add(limb([0.09 * s, -0.08, 0.08 * f], [0.1 * s, -0.22, 0.09 * f], 0.035, 0.028, 8), lg, fur);
    }
  }
  b.add(ellipsoid(0.018, 0.014, 0.012, [0, 0.07, 0.28], 8), 'head', { color: 0xe08aa0, gloss: 0.7 });
  // A fluffy tail.
  b.add(ellipsoid(0.07, 0.07, 0.11, [0, 0.06, -0.27], 14, 0.12, 6), 'tail', fur);
  // The shards: a cluster of violet crystal on the back.
  const shards: Array<[P3, P3, number]> = [
    [[0, 0.13, -0.03], [0, 1, -0.15], 0.17],
    [[0.06, 0.11, 0.02], [0.5, 1, 0.1], 0.12],
    [[-0.06, 0.11, 0.0], [-0.5, 1, -0.1], 0.13],
    [[0.03, 0.1, -0.1], [0.3, 1, -0.5], 0.1],
    [[-0.04, 0.1, -0.11], [-0.3, 0.9, -0.6], 0.09],
    [[0, 0.12, 0.06], [0, 1, 0.5], 0.08],
  ];
  for (const [at, dir, len] of shards) b.add(crystal(len * 1.35, 0.036, at, dir, at[0] * 9), 'back', { color: 0xb48cff, emit: 0.4, gloss: 1, sss: 0.6, flat: true });
  return { ...b.build(), look: { bump: 0.004, bumpFreq: 90, sssTint: 0xffb0b8, rimDark: [0.03, 0.028, 0.04], glowTint: 0xffffff, pulse: 1.7 } };
}

/** A big gentle geode-shelled snail: a wet translucent body, eye stalks, crystals in its shell. */
function shellback(): MobModel {
  const b = new ModelBuilder();
  b.bone('body', -1, [0, 0, 0]);
  b.bone('head', 'body', [0, -0.15, 0.55]);
  b.bone('shell', 'body', [0, 0.1, -0.1]);
  const skin = { color: 0x56736f, top: 0x86a49c, y0: -0.6, y1: 0.0, sss: 0.7, gloss: 0.8, rim: 0.8 };
  // The foot: a long soft body hugging the floor.
  b.add(ellipsoid(0.42, 0.2, 0.95, [0, -0.42, 0.05], 26, 0.03, 2), 'body', skin);
  b.add(ellipsoid(0.46, 0.06, 1.0, [0, -0.56, 0.05], 22), 'body', { color: 0x6b8f8a, sss: 0.8, gloss: 0.6 });
  b.add(ellipsoid(0.26, 0.24, 0.32, [0, -0.2, 0.75], 20, 0.03, 4), 'head', skin);
  for (const s of [-1, 1]) {
    const st = b.bone(`stalk${s}`, 'head', [0.1 * s, -0.02, 0.85]);
    b.add(limb([0.1 * s, -0.02, 0.85], [0.17 * s, 0.38, 0.98], 0.035, 0.022, 8), st, skin);
    b.add(ellipsoid(0.05, 0.05, 0.05, [0.17 * s, 0.4, 0.99], 12), st, { color: 0xfff1c4, emit: 0.8, gloss: 1 });
    b.add(limb([0.08 * s, -0.3, 1.0], [0.12 * s, -0.42, 1.14], 0.02, 0.008, 6), 'head', skin);
  }
  // The geode: a stone shell broken open on top, crystals inside.
  const shell = boulder(0.6, 8.1, 0.2, 2, 0.92);
  b.add(place(shell, [0, 0.12, -0.12], [0.2, 0, 0], [1, 1, 1.1]), 'shell', { color: 0x524c47, top: 0x6f675e, y0: -0.3, y1: 0.6, gloss: 0.2, rim: 0.5, flat: true });
  b.add(ellipsoid(0.36, 0.1, 0.38, [0, 0.62, -0.1], 18), 'shell', { color: 0x2f3a40, gloss: 0.5 });
  for (let c = 0; c < 4; c++) {
    const a = c * 1.57 + 0.4;
    const at: P3 = [Math.sin(a) * 0.17, 0.6, -0.1 + Math.cos(a) * 0.17];
    const cb = b.bone(`cr${c}`, 'shell', at);
    for (let k = 0; k < 4; k++) {
      const ka = a + k * 1.3;
      b.add(crystal(0.16 + (k % 2) * 0.07, 0.035, [at[0] + Math.sin(ka) * 0.04, at[1], at[2] + Math.cos(ka) * 0.04], [Math.sin(ka) * 0.4, 1, Math.cos(ka) * 0.4], ka), cb, { color: 0x7ad8ff, emit: 0.6, gloss: 1, sss: 0.8, flat: true });
    }
  }
  return { ...b.build(), look: { bump: 0.008, bumpFreq: 42, sssTint: 0x9ff0e0, rimDark: [0.02, 0.03, 0.03], glowTint: 0xffffff, pulse: 1.2 } };
}

/** A translucent glowing jelly: a frilled bell, glowing organs, trailing tentacles. */
function jelly(): MobModel {
  const b = new ModelBuilder();
  b.bone('bell', -1, [0, 0, 0]);
  b.bone('inner', 'bell', [0, 0.1, 0]);
  // Inner organs (opaque, glowing), drawn in the body.
  b.add(new THREE.TorusGeometry(0.22, 0.05, 10, 24).rotateX(Math.PI / 2).translate(0, 0.08, 0), 'inner', { color: 0xb98cff, emit: 0.85 });
  b.add(ellipsoid(0.12, 0.1, 0.12, [0, 0.2, 0], 14), 'inner', { color: 0x7ff0ff, emit: 0.9 });
  for (let t = 0; t < 6; t++) {
    const a = (t / 6) * Math.PI * 2;
    const x0 = Math.sin(a) * 0.32;
    const z0 = Math.cos(a) * 0.32;
    let prev: P3 = [x0, -0.1, z0];
    let parent: number = 0;
    for (let s = 0; s < 3; s++) {
      const nx: P3 = [x0 * (1 - s * 0.12), -0.1 - (s + 1) * 0.55, z0 * (1 - s * 0.12)];
      const bn = b.bone(`t${t}${s}`, parent, prev);
      b.add(limb(prev, nx, 0.03 - s * 0.007, 0.022 - s * 0.006, 6), bn, { color: 0xbff2ff, emit: 0.35, sss: 1 });
      prev = nx;
      parent = bn;
    }
  }
  const body = b.build();
  const g = new ModelBuilder();
  g.bone('bell', -1, [0, 0, 0]);
  // The bell: a dome with a frilled, scalloped rim.
  const prof: Array<[number, number]> = [];
  for (let i = 0; i <= 12; i++) {
    const k = i / 12;
    prof.push([Math.sin(k * Math.PI * 0.5) * 0.6 * (1 + 0.04 * Math.sin(k * 20)), 0.45 - Math.pow(k, 1.6) * 0.6]);
  }
  const bell = lathe(prof, 28);
  const p = bell.getAttribute('position');
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const z = p.getZ(i);
    const y = p.getY(i);
    const a = Math.atan2(x, z);
    const frill = y < -0.05 ? Math.sin(a * 12) * 0.035 * (-0.05 - y) * 8 : 0;
    p.setY(i, y + frill);
  }
  bell.computeVertexNormals();
  g.add(bell, 'bell', { color: 0x9fe7ff, alpha: 0.32, sss: 1, gloss: 0.9, rim: 1, emit: 0.12 });
  return { ...body, look: { bump: 0, glowTint: 0xffffff, pulse: 1.3, sssTint: 0x9ff0ff }, shell: { model: g.build(), look: { translucent: true, bump: 0, sssTint: 0x9ff0ff, glowTint: 0xffffff, doubleSided: true } } };
}

/** A cheeky ore thief: velvet fur, a pointed snout, big pale digging claws, a nugget held tight. */
function burrower(variant: number): MobModel {
  const gold = variant === 1;
  const b = new ModelBuilder();
  b.bone('body', -1, [0, 0, 0]);
  b.bone('head', 'body', [0, 0.04, 0.12]);
  b.bone('tail', 'body', [0, 0, -0.18]);
  b.bone('loot', 'head', [0, -0.02, 0.26]);
  const fur = gold ? { color: 0xb08a3a, top: 0xd9b45a, y0: -0.2, y1: 0.2, sss: 0.4, rim: 1, gloss: 0.15 } : { color: 0x4f4038, top: 0x6e5a4c, y0: -0.2, y1: 0.2, sss: 0.4, rim: 1, gloss: 0.08 };
  b.add(ellipsoid(0.18, 0.15, 0.22, [0, 0, -0.03], 22, 0.04, 2), 'body', fur);
  b.add(ellipsoid(0.12, 0.11, 0.14, [0, 0.05, 0.16], 18, 0.03, 5), 'head', fur);
  b.add(limb([0, 0.04, 0.24], [0, 0.02, 0.32], 0.05, 0.022, 10), 'head', fur);
  b.add(ellipsoid(0.022, 0.018, 0.018, [0, 0.025, 0.335], 8), 'head', { color: 0x2a1c1a, gloss: 1 });
  for (const s of [-1, 1]) {
    b.add(ellipsoid(0.02, 0.022, 0.016, [0.06 * s, 0.1, 0.24], 10), 'head', { color: 0x0a0808, gloss: 1, rim: 0.2 });
    b.add(ellipsoid(0.006, 0.006, 0.004, [0.058 * s + 0.006, 0.108, 0.255], 6), 'head', { color: 0xffffff, emit: 1 });
    b.add(ellipsoid(0.03, 0.03, 0.012, [0.09 * s, 0.13, 0.12], 10), 'head', fur);
    // Big digging claws in front, short back legs.
    const cl = b.bone(`claw${s}`, 'body', [0.12 * s, -0.05, 0.1]);
    b.add(limb([0.12 * s, -0.05, 0.1], [0.16 * s, -0.17, 0.18], 0.04, 0.035, 8), cl, fur);
    for (let f = -1; f <= 1; f++) b.add(limb([0.16 * s + f * 0.018, -0.17, 0.18], [0.17 * s + f * 0.026, -0.22, 0.26], 0.012, 0.004, 5), cl, { color: 0xe8dcc8, gloss: 0.8, rim: 0.6 });
    const lg = b.bone(`leg${s}`, 'body', [0.1 * s, -0.08, -0.12]);
    b.add(limb([0.1 * s, -0.08, -0.12], [0.11 * s, -0.22, -0.1], 0.04, 0.03, 8), lg, fur);
  }
  b.add(limb([0, 0.0, -0.22], [0, 0.04, -0.34], 0.025, 0.008, 6), 'tail', fur);
  // The loot: a nugget held at the snout.
  b.add(place(new THREE.IcosahedronGeometry(0.045, 0), [0, -0.04, 0.33]), 'loot', gold ? { color: 0xffd36a, emit: 0.5, gloss: 1, flat: true } : { color: 0xd9824a, emit: 0.12, gloss: 1, flat: true });
  return { ...b.build(), look: { bump: 0.004, bumpFreq: 80, sssTint: 0xd08a70, rimDark: [0.03, 0.026, 0.024], glowTint: 0xffffff, pulse: 2 } };
}

/** Split a closed geometry at y = cut into a lower and an upper half (triangles by their centroid), each closed by a cap. */
function splitY(g: THREE.BufferGeometry, cut: number): { lower: THREE.BufferGeometry; upper: THREE.BufferGeometry } {
  const src = g.index ? g.toNonIndexed() : g;
  const P = src.getAttribute('position');
  const N = src.getAttribute('normal');
  const lo: number[] = [];
  const ln: number[] = [];
  const up: number[] = [];
  const un: number[] = [];
  for (let i = 0; i < P.count; i += 3) {
    const cy = (P.getY(i) + P.getY(i + 1) + P.getY(i + 2)) / 3;
    const [tp, tn] = cy < cut ? [lo, ln] : [up, un];
    for (let k = 0; k < 3; k++) {
      // Flatten the rim onto the cut so the halves meet on a clean lip.
      const y = P.getY(i + k);
      const yy = cy < cut ? Math.min(y, cut + 0.01) : Math.max(y, cut - 0.01);
      tp.push(P.getX(i + k), yy, P.getZ(i + k));
      tn.push(N.getX(i + k), N.getY(i + k), N.getZ(i + k));
    }
  }
  const mk = (p: number[], n: number[]) => {
    const o = new THREE.BufferGeometry();
    o.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
    o.setAttribute('normal', new THREE.Float32BufferAttribute(n, 3));
    return o;
  };
  return { lower: mk(lo, ln), upper: mk(up, un) };
}
