import type * as THREE from 'three';
import { Rng } from '../../core/rng';
import { VoxBuilder } from '../voxModel';
import { runePixels } from './runes';
import { shade } from './shapes';

/**
 * The descent's procedural models (W2): event targets, chests popped out of cells, creatures (4 rigs × a part
 * grammar), the 14 Wardens and the lanterns. Every model stands on y = 0 (or hangs about its centre for flyers),
 * faces +z (toward the camera), is built from VoxBuilder boxes and crystals with per-vertex sRGB colour and an
 * emissive accent, and keeps to the asset checklist (CRITIQUE B17): a silhouette that reads at 44 px per metre,
 * three value steps or more, one emissive accent, and a part that moves (returned separately so the caller can
 * animate it).
 */
export interface ModelParts {
  body: THREE.BufferGeometry;
  /** A moving part (wings, a claw, a clapper, a lid), pivoting at `pivot` in model space. */
  part?: THREE.BufferGeometry;
  pivot?: [number, number, number];
  /** Radius of the tap bound (m) and the model's height (m). */
  radius: number;
  height: number;
}

const build = (b: VoxBuilder, p?: VoxBuilder, pivot?: [number, number, number], radius = 0.4, height = 0.6): ModelParts => ({
  body: b.build(),
  part: p && p.vertexCount > 0 ? p.build() : undefined,
  pivot,
  radius,
  height,
});

// ---- event targets -----------------------------------------------------------------------------------------

export const CHEST_TIER_GLOW: Record<string, number> = { wood: 0xffb35c, copper: 0xff8a4a, crystal: 0x6fe8ff, reliquary: 0xc49bff, lintel: 0xfff1c2 };

/** A chest popped out of its cell, its seam glowing in its tier colour; the lid is the moving part. */
export function chestModel(tier: string): ModelParts {
  const b = new VoxBuilder();
  const lid = new VoxBuilder();
  const wood = tier === 'lintel' ? 0x3a2a4a : tier === 'reliquary' ? 0x3c2f52 : 0x6a4428;
  const band = tier === 'crystal' ? 0x9fe6f0 : tier === 'lintel' ? 0xffe2a0 : tier === 'reliquary' ? 0xd8c0ff : 0xc89848;
  const glow = CHEST_TIER_GLOW[tier] ?? 0xffb35c;
  b.box(-0.36, 0, -0.24, 0.36, 0.34, 0.24, wood);
  b.box(-0.37, 0.02, -0.25, 0.37, 0.07, 0.25, shade(wood, 0.7));
  for (const x of [-0.26, 0.26]) b.box(x - 0.035, 0, -0.255, x + 0.035, 0.35, 0.255, band);
  // The seam: the light inside leaking out (the tier colour).
  b.box(-0.35, 0.33, -0.23, 0.35, 0.36, 0.23, glow, 1);
  lid.box(-0.37, 0, -0.25, 0.37, 0.16, 0.25, shade(wood, 1.12));
  lid.box(-0.3, 0.16, -0.2, 0.3, 0.22, 0.2, shade(wood, 1.2));
  for (const x of [-0.26, 0.26]) lid.box(x - 0.035, 0, -0.255, x + 0.035, 0.225, 0.255, band);
  lid.box(-0.06, -0.08, 0.24, 0.06, 0.06, 0.29, band);
  lid.box(-0.03, -0.05, 0.285, 0.03, 0.02, 0.3, glow, 1);
  return build(b, lid, [0, 0.36, -0.25], 0.45, 0.6);
}

/** The Lucky Moth: a gold-dusted moth whose wings beat (the part). */
export function mothModel(gold = true): ModelParts {
  const b = new VoxBuilder();
  const w = new VoxBuilder();
  b.scale(0.75);
  w.scale(0.75);
  const body = gold ? 0x6a4a20 : 0x3a5a48;
  const wing = gold ? 0xffd060 : 0x9be7a8;
  b.box(-0.05, -0.18, -0.05, 0.05, 0.14, 0.05, body);
  b.box(-0.06, 0.12, -0.06, 0.06, 0.2, 0.06, shade(body, 1.3));
  b.box(-0.08, 0.2, 0.0, -0.06, 0.32, 0.02, shade(body, 1.6));
  b.box(0.06, 0.2, 0.0, 0.08, 0.32, 0.02, shade(body, 1.6));
  for (const s of [-1, 1]) {
    w.push().scale(s, 1, 1);
    w.box(0.05, -0.02, -0.01, 0.42, 0.26, 0.01, wing, 0.85);
    w.box(0.05, -0.2, -0.01, 0.3, -0.02, 0.01, shade(wing, 0.85), 0.7);
    w.box(0.22, 0.08, -0.012, 0.3, 0.16, 0.012, 0xffffff, 1);
    w.pop();
  }
  return build(b, w, [0, 0, 0], 0.45, 0.5);
}

export function crystalTarget(color = 0x6fe8ff): ModelParts {
  const b = new VoxBuilder();
  b.push().translate(0, 0, 0).crystal(0.1, 0.42, 0.18, 6, color, shade(color, 0.45), 0.9).pop();
  b.push().translate(0.08, 0, 0.02).rotateZ(-0.5).crystal(0.05, 0.22, 0.09, 5, shade(color, 1.2), shade(color, 0.5), 0.8).pop();
  b.push().translate(-0.07, 0, -0.02).rotateZ(0.45).crystal(0.05, 0.2, 0.08, 5, color, shade(color, 0.5), 0.8).pop();
  return build(b, undefined, undefined, 0.4, 0.5);
}

export function boulderModel(): ModelParts {
  const b = new VoxBuilder();
  const rng = new Rng(77);
  for (let i = 0; i < 7; i++) {
    const s = 0.22 + rng.next() * 0.18;
    const x = (rng.next() - 0.5) * 0.4;
    const y = 0.15 + rng.next() * 0.35;
    const z = (rng.next() - 0.5) * 0.3;
    b.push().translate(x, y, z).rotateY(rng.next() * 3).rotateX(rng.next());
    b.box(-s, -s, -s, s, s, s, shade(0x7a6a5a, 0.75 + rng.next() * 0.4));
    b.pop();
  }
  b.box(-0.06, 0.55, 0.18, 0.06, 0.6, 0.3, 0xffc070, 0.6);
  return build(b, undefined, undefined, 0.55, 0.8);
}

export function moleModel(): ModelParts {
  const b = new VoxBuilder();
  const claw = new VoxBuilder();
  const fur = 0x5a4434;
  b.box(-0.24, 0, -0.2, 0.24, 0.34, 0.22, fur);
  b.box(-0.18, 0.06, 0.18, 0.18, 0.3, 0.34, shade(fur, 1.15));
  b.box(-0.06, 0.12, 0.34, 0.06, 0.2, 0.42, 0xe08a8a);
  b.box(-0.13, 0.22, 0.3, -0.07, 0.27, 0.35, 0x101010);
  b.box(0.07, 0.22, 0.3, 0.13, 0.27, 0.35, 0x101010);
  // A miner's lamp on its head: the Treasure Mole stole it.
  b.box(-0.07, 0.34, 0.05, 0.07, 0.42, 0.18, 0xc89848);
  b.box(-0.04, 0.35, 0.18, 0.04, 0.41, 0.21, 0xfff0c0, 1);
  for (const s of [-1, 1]) claw.box(s * 0.28 - 0.06, 0.02, 0.18, s * 0.28 + 0.06, 0.1, 0.34, 0xd8c8b0);
  return build(b, claw, [0, 0.06, 0.2], 0.5, 0.5);
}

export function crateModel(): ModelParts {
  const b = new VoxBuilder();
  b.box(-0.32, 0, -0.32, 0.32, 0.6, 0.32, 0x8a6038);
  for (const y of [0.04, 0.52]) b.box(-0.33, y, -0.33, 0.33, y + 0.06, 0.33, 0x5a3c20);
  b.box(-0.05, 0.6, -0.05, 0.05, 4.5, 0.05, 0xb89a68);
  b.box(-0.2, 0.25, 0.32, 0.2, 0.36, 0.34, 0xffd060, 0.8);
  return build(b, undefined, undefined, 0.5, 0.7);
}

export function mimicModel(): ModelParts {
  const p = chestModel('crystal');
  const b = new VoxBuilder();
  b.box(-0.36, 0, -0.24, 0.36, 0.34, 0.24, 0x3c2f52);
  for (let i = 0; i < 6; i++) b.box(-0.3 + i * 0.12, 0.28, 0.22, -0.26 + i * 0.12, 0.36, 0.26, 0xf0e8d8);
  b.box(-0.2, 0.18, 0.24, -0.1, 0.26, 0.26, 0xc49bff, 1);
  b.box(0.1, 0.18, 0.24, 0.2, 0.26, 0.26, 0xc49bff, 1);
  return { ...build(b), part: p.part, pivot: p.pivot, radius: 0.48, height: 0.6 };
}

export function runeModel(glyph = 0): ModelParts {
  const b = new VoxBuilder();
  b.box(-0.42, -0.42, -0.04, 0.42, 0.42, 0.02, 0x2a3440);
  b.box(-0.38, -0.38, 0.02, 0.38, 0.38, 0.03, 0x1a2430);
  for (const [x, y] of runePixels(glyph)) b.box(-0.36 + x * 0.045, 0.36 - y * 0.045, 0.03, -0.31 + x * 0.045, 0.31 - y * 0.045, 0.06, 0x8fe3ee, 1);
  return build(b, undefined, undefined, 0.45, 0.85);
}

export function orbModel(color: number, size = 0.22, ring = false): ModelParts {
  const b = new VoxBuilder();
  b.push().rotateY(0.78).rotateX(0.6);
  b.box(-size, -size, -size, size, size, size, color, 1);
  b.pop();
  b.push().rotateY(0.2).rotateZ(0.78);
  b.box(-size * 0.8, -size * 0.8, -size * 0.8, size * 0.8, size * 0.8, size * 0.8, shade(color, 1.25), 1);
  b.pop();
  const r = new VoxBuilder();
  if (ring) for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    r.push().translate(Math.cos(a) * size * 2, Math.sin(a) * size * 2, 0).rotateZ(a);
    r.box(-0.02, -size * 0.5, -0.02, 0.02, size * 0.5, 0.02, shade(color, 0.9), 0.9);
    r.pop();
  }
  return build(b, r, [0, 0, 0], Math.max(0.35, size * 1.8), size * 2);
}

export function critterModel(color = 0x6a5038, accent = 0xffd060): ModelParts {
  const b = new VoxBuilder();
  b.box(-0.12, 0, -0.16, 0.12, 0.12, 0.14, color);
  b.box(-0.08, 0.02, 0.14, 0.08, 0.1, 0.22, shade(color, 1.2));
  b.box(-0.06, 0.12, -0.12, 0.06, 0.15, 0.08, accent, 0.9);
  for (const s of [-1, 1]) for (const z of [-0.1, 0, 0.1]) b.box(s * 0.12, 0, z - 0.015, s * 0.17, 0.03, z + 0.015, shade(color, 0.6));
  return build(b, undefined, undefined, 0.35, 0.2);
}

export function pebbleModel(): ModelParts {
  const b = new VoxBuilder();
  b.push().rotateY(0.5).rotateX(0.3).box(-0.12, 0, -0.1, 0.12, 0.16, 0.1, 0x8a7a68).pop();
  b.box(-0.03, 0.12, 0.06, 0.04, 0.17, 0.11, 0xffd060, 1);
  return build(b, undefined, undefined, 0.35, 0.2);
}

/** The model of an event target kind (bus.ts `event:target` kinds and the find guarantee's). */
export function targetModel(kind: string, biome: number, accent: number): ModelParts {
  switch (kind) {
    case 'moth':
    case 'swarm':
      return mothModel(kind === 'moth');
    case 'crystal':
      return crystalTarget(accent);
    case 'gem':
      return crystalTarget(0xc49bff);
    case 'boulder':
      return boulderModel();
    case 'mole':
      return moleModel();
    case 'crate':
      return crateModel();
    case 'mimic':
      return mimicModel();
    case 'rune':
      return runeModel(biome % 8);
    case 'bubble':
      return orbModel(0x9fe6ff, 0.16, true);
    case 'star':
    case 'meteor':
      return orbModel(0xfff1c2, kind === 'meteor' ? 0.3 : 0.18, true);
    case 'spore':
      return orbModel(0xc58cff, 0.18);
    case 'critter':
      return critterModel();
    case 'pebble':
      return pebbleModel();
    default:
      return orbModel(accent, 0.26, true);
  }
}

// ---- creatures: 4 rigs and a part grammar --------------------------------------------------------------------

export type CreatureRig = 'crawler' | 'flyer' | 'swimmer' | 'floater';

export interface CreatureLook {
  rig: CreatureRig;
  /** Body and accent colours (the accent glows). */
  body: number;
  accent: number;
  /** Size scale (1 ≈ a 0.5 m creature). */
  size: number;
  /** Part swap: 0 plain, 1 shell / horns, 2 lamp, 3 spikes. */
  part: number;
}

/** The 42 creatures of SPEC §6.5 (ids from src/idle/config/biomes.ts) as rig, colours, size and a part. */
export const CREATURE_LOOKS: Readonly<Record<string, CreatureLook>> = {
  rootGrub: { rig: 'crawler', body: 0xc8a888, accent: 0xffb35c, size: 0.8, part: 0 },
  burrowBeetle: { rig: 'crawler', body: 0x4a3a2a, accent: 0xffa04a, size: 0.9, part: 1 },
  lampBeetle: { rig: 'crawler', body: 0x3a3428, accent: 0xffd060, size: 0.8, part: 2 },
  glowMoth: { rig: 'flyer', body: 0x3a5a48, accent: 0x9be7a8, size: 0.9, part: 0 },
  rootCrawler: { rig: 'crawler', body: 0x5a4a32, accent: 0x9be7a8, size: 1.1, part: 3 },
  glowToad: { rig: 'crawler', body: 0x3a6a48, accent: 0xb8ff9a, size: 1.0, part: 2 },
  echoBat: { rig: 'flyer', body: 0x2a3048, accent: 0x8fe3ee, size: 1.0, part: 1 },
  crystalCrab: { rig: 'crawler', body: 0x3a4a6a, accent: 0x6fe8ff, size: 1.0, part: 3 },
  shardHermit: { rig: 'crawler', body: 0x4a4a5a, accent: 0x8fe3ee, size: 0.9, part: 1 },
  railRat: { rig: 'crawler', body: 0x6a5a4a, accent: 0xffa04a, size: 0.8, part: 0 },
  cartGhost: { rig: 'floater', body: 0x8a9aa8, accent: 0xffd8a0, size: 1.2, part: 2 },
  steamWisp: { rig: 'floater', body: 0xc8c0b8, accent: 0xffffff, size: 0.9, part: 0 },
  sporeToad: { rig: 'crawler', body: 0x5a3a6a, accent: 0xc58cff, size: 1.1, part: 3 },
  capSnail: { rig: 'crawler', body: 0x7a5a3a, accent: 0xa8ff6a, size: 0.9, part: 1 },
  puffcap: { rig: 'floater', body: 0x8a5a9a, accent: 0xff9aff, size: 1.0, part: 1 },
  glassEel: { rig: 'swimmer', body: 0x4a7a9a, accent: 0x5fb7ff, size: 1.2, part: 0 },
  lampFish: { rig: 'swimmer', body: 0x2a4a6a, accent: 0xffd060, size: 1.0, part: 2 },
  glassJelly: { rig: 'floater', body: 0x7ab8d8, accent: 0x9fe6ff, size: 1.0, part: 0 },
  salamander: { rig: 'crawler', body: 0x8a3a1a, accent: 0xff7a2e, size: 1.1, part: 3 },
  ashBeetle: { rig: 'crawler', body: 0x3a3030, accent: 0xff7a2e, size: 0.9, part: 1 },
  emberNewt: { rig: 'crawler', body: 0x6a2a1a, accent: 0xffb347, size: 0.8, part: 2 },
  fossilCrab: { rig: 'crawler', body: 0xc8b898, accent: 0xffb000, size: 1.1, part: 3 },
  boneWyrm: { rig: 'swimmer', body: 0xd8ccb0, accent: 0xd0c8ff, size: 1.4, part: 3 },
  marrowWorm: { rig: 'crawler', body: 0xb89878, accent: 0xffb000, size: 0.9, part: 0 },
  iceMoth: { rig: 'flyer', body: 0x8ab8d8, accent: 0x7fd8ff, size: 0.9, part: 0 },
  frostFox: { rig: 'crawler', body: 0xd8e8f0, accent: 0x9dffd8, size: 1.2, part: 1 },
  iceWyrmling: { rig: 'swimmer', body: 0x8ac8e8, accent: 0x7fd8ff, size: 1.2, part: 3 },
  threadSpider: { rig: 'crawler', body: 0x3a3450, accent: 0xb9a2ff, size: 1.0, part: 3 },
  archivistWisp: { rig: 'floater', body: 0xe8e0c8, accent: 0xfff4d0, size: 1.0, part: 2 },
  loomMoth: { rig: 'flyer', body: 0x5a4a7a, accent: 0xfff4d0, size: 1.0, part: 1 },
  ironMite: { rig: 'crawler', body: 0x5a6070, accent: 0x8fb8ff, size: 0.8, part: 1 },
  coreRay: { rig: 'swimmer', body: 0x3a4050, accent: 0xff7a2a, size: 1.3, part: 0 },
  clockworkBeetle: { rig: 'crawler', body: 0x8a7040, accent: 0x8fb8ff, size: 1.0, part: 3 },
  starSprite: { rig: 'floater', body: 0xfff1c2, accent: 0xffffff, size: 0.8, part: 0 },
  novaMoth: { rig: 'flyer', body: 0x8a6020, accent: 0xffb040, size: 1.1, part: 2 },
  starJelly: { rig: 'floater', body: 0xe8c890, accent: 0xfff1c2, size: 1.1, part: 1 },
  voidRay: { rig: 'swimmer', body: 0x2a2048, accent: 0x6a5cff, size: 1.4, part: 0 },
  driftJelly: { rig: 'floater', body: 0x4a3a8a, accent: 0xd8e0ff, size: 1.0, part: 0 },
  watcherEye: { rig: 'floater', body: 0x1a1430, accent: 0xb9a2ff, size: 1.6, part: 2 },
  gatekeeper: { rig: 'floater', body: 0x4a3a5a, accent: 0x8fe3ee, size: 1.3, part: 3 },
  echoOfYou: { rig: 'crawler', body: 0x8a7a9a, accent: 0xffb35c, size: 1.2, part: 2 },
  runeMoth: { rig: 'flyer', body: 0x3a3a5a, accent: 0x8fe3ee, size: 1.0, part: 0 },
};

/** A creature's model from its look: the rig's body, its part swap, and the moving part (legs, wings, fins, skirt). */
export function creatureModel(look: CreatureLook): ModelParts {
  const b = new VoxBuilder();
  const m = new VoxBuilder();
  const c = look.body;
  const a = look.accent;
  const s = 0.5 * look.size;
  const dark = shade(c, 0.6);
  const light = shade(c, 1.3);
  let pivot: [number, number, number] = [0, 0, 0];
  if (look.rig === 'crawler') {
    b.box(-0.35 * s, 0.08 * s, -0.45 * s, 0.35 * s, 0.42 * s, 0.4 * s, c);
    b.box(-0.25 * s, 0.12 * s, 0.38 * s, 0.25 * s, 0.38 * s, 0.62 * s, light);
    b.box(-0.18 * s, 0.26 * s, 0.6 * s, -0.08 * s, 0.34 * s, 0.64 * s, a, 1);
    b.box(0.08 * s, 0.26 * s, 0.6 * s, 0.18 * s, 0.34 * s, 0.64 * s, a, 1);
    if (look.part === 1) b.box(-0.4 * s, 0.38 * s, -0.5 * s, 0.4 * s, 0.56 * s, 0.32 * s, dark);
    if (look.part === 2) b.box(-0.08 * s, 0.42 * s, 0.2 * s, 0.08 * s, 0.56 * s, 0.36 * s, a, 1);
    if (look.part === 3) for (let i = 0; i < 4; i++) b.box(-0.05 * s + (i - 1.5) * 0.18 * s, 0.42 * s, -0.3 * s, 0.05 * s + (i - 1.5) * 0.18 * s, 0.68 * s, -0.18 * s, shade(a, 0.8), 0.6);
    for (const side of [-1, 1]) for (const z of [-0.3, 0, 0.3]) m.box(side * 0.35 * s, 0, z * s - 0.04 * s, side * 0.52 * s, 0.1 * s, z * s + 0.04 * s, dark);
    pivot = [0, 0.05 * s, 0];
  } else if (look.rig === 'flyer') {
    b.box(-0.08 * s, -0.3 * s, -0.08 * s, 0.08 * s, 0.25 * s, 0.08 * s, c);
    b.box(-0.1 * s, 0.22 * s, -0.08 * s, 0.1 * s, 0.38 * s, 0.1 * s, light);
    b.box(-0.06 * s, 0.28 * s, 0.1 * s, 0.06 * s, 0.33 * s, 0.13 * s, a, 1);
    for (const side of [-1, 1]) {
      m.push().scale(side, 1, 1);
      m.box(0.08 * s, -0.05 * s, -0.01, 0.8 * s, 0.45 * s, 0.01, shade(c, 1.15), look.part === 2 ? 0.4 : 0.15);
      m.box(0.4 * s, 0.1 * s, -0.012, 0.6 * s, 0.3 * s, 0.012, a, 1);
      m.pop();
    }
  } else if (look.rig === 'swimmer') {
    for (let i = 0; i < 5; i++) {
      const w = (0.3 - i * 0.04) * s;
      b.box(-w, -w * 0.8, -0.5 * s + i * 0.25 * s, w, w * 0.8, -0.25 * s + i * 0.25 * s, i % 2 ? c : light);
    }
    b.box(-0.08 * s, 0.05 * s, 0.75 * s, 0.08 * s, 0.15 * s, 0.82 * s, a, 1);
    if (look.part === 2) b.box(-0.04 * s, 0.25 * s, 0.6 * s, 0.04 * s, 0.6 * s, 0.68 * s, a, 1);
    if (look.part === 3) for (let i = 0; i < 4; i++) b.box(-0.03 * s, 0.25 * s, -0.4 * s + i * 0.25 * s, 0.03 * s, 0.45 * s, -0.3 * s + i * 0.25 * s, shade(a, 0.7), 0.5);
    m.box(-0.35 * s, -0.04 * s, -0.75 * s, 0.35 * s, 0.04 * s, -0.5 * s, shade(c, 0.9), 0.2);
    pivot = [0, 0, -0.5 * s];
  } else {
    // Floater: a bell or a wisp with a glowing core and a trailing skirt.
    b.box(-0.35 * s, 0.1 * s, -0.35 * s, 0.35 * s, 0.45 * s, 0.35 * s, c, 0.25);
    b.box(-0.25 * s, 0.45 * s, -0.25 * s, 0.25 * s, 0.58 * s, 0.25 * s, light, 0.25);
    b.box(-0.14 * s, 0.18 * s, -0.14 * s, 0.14 * s, 0.4 * s, 0.4 * s, a, 1);
    if (look.part === 1) b.box(-0.42 * s, 0.08 * s, -0.42 * s, 0.42 * s, 0.16 * s, 0.42 * s, dark);
    if (look.part === 3) for (const side of [-1, 1]) b.box(side * 0.35 * s, 0.3 * s, -0.05 * s, side * 0.6 * s, 0.38 * s, 0.05 * s, shade(a, 0.8), 0.7);
    for (let i = 0; i < 6; i++) {
      const ang = (i / 6) * Math.PI * 2;
      m.box(Math.cos(ang) * 0.25 * s - 0.03 * s, -0.4 * s, Math.sin(ang) * 0.25 * s - 0.03 * s, Math.cos(ang) * 0.25 * s + 0.03 * s, 0.12 * s, Math.sin(ang) * 0.25 * s + 0.03 * s, shade(a, 0.9), 0.7);
    }
    pivot = [0, 0.12 * s, 0];
  }
  return build(b, m, pivot, Math.max(0.3, 0.55 * s + 0.1), look.rig === 'flyer' ? 0.7 * s : 0.6 * s);
}

// ---- Wardens (SPEC §6.5: the seal's keeper at each biome's exit) ----------------------------------------------

export interface WardenModel extends ModelParts {
  /** The three weak points in model space (the Warden faces +z; y up from the seal's top). */
  weak: Array<[number, number, number]>;
  /** The weak point's glow colour. */
  weakColor: number;
}

/** The Warden of the seal that opens biome `opens` (1..13; 14+ reuse their base): ≤ 5 m tall, ≤ 7 m wide. */
export function wardenModel(opens: number): WardenModel {
  const b = new VoxBuilder();
  const p = new VoxBuilder();
  const rng = new Rng(0x3a7 + opens * 31);
  const k = ((opens - 1) % 13) + 1;
  let weak: Array<[number, number, number]> = [[-1.2, 0.9, 0.5], [0, 1.4, 0.6], [1.2, 0.9, 0.5]];
  let weakColor = 0xffd060;
  let pivot: [number, number, number] = [0, 0, 0];
  const chainLink = (x0: number, y0: number, x1: number, y1: number) => {
    const n = 7;
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      b.push().translate(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t - Math.sin(t * Math.PI) * 0.3, 0.3).rotateZ(Math.atan2(y1 - y0, x1 - x0) + (i % 2) * 0.6);
      b.box(-0.09, -0.04, -0.04, 0.09, 0.04, 0.04, 0x5a5c62);
      b.pop();
    }
  };
  switch (k) {
    case 1: {
      // The Halden Hatch: a timber hatch with iron bands, two chains and a padlock (the weak point).
      b.box(-3.3, 0, -0.25, 3.3, 0.35, 0.2, 0x6a4a2c);
      for (let x = -3; x <= 3; x += 1.5) b.box(x - 0.08, 0, -0.26, x + 0.08, 0.37, 0.22, 0x3a3a40);
      chainLink(-3.2, 0.3, -1.0, 3.2);
      chainLink(3.2, 0.3, 1.0, 3.2);
      b.box(-0.3, 0.3, 0.15, 0.3, 0.85, 0.35, 0x8a7040);
      b.box(-0.18, 0.85, 0.2, 0.18, 1.15, 0.3, 0x5a5c62);
      p.box(-0.08, 0.45, 0.35, 0.08, 0.6, 0.38, 0xffb35c, 1);
      weak = [[0, 0.55, 0.4], [-2.2, 0.25, 0.25], [2.2, 0.25, 0.25]];
      weakColor = 0xffb35c;
      break;
    }
    case 2: {
      // The Root Knot: a tangle of roots with an amber heart and three knots.
      for (let i = 0; i < 16; i++) {
        const a = rng.next() * Math.PI;
        const len = 1.2 + rng.next() * 1.8;
        b.push().translate((rng.next() - 0.5) * 3.4, 0.3 + rng.next() * 2.4, (rng.next() - 0.5) * 0.6).rotateZ(a).rotateY(rng.next());
        b.box(-len / 2, -0.12, -0.12, len / 2, 0.12, 0.12, shade(0x5a4030, 0.8 + rng.next() * 0.4));
        b.pop();
      }
      b.box(-0.45, 1.0, -0.2, 0.45, 1.9, 0.45, 0x4a3020);
      p.box(-0.3, 1.15, 0.2, 0.3, 1.75, 0.55, 0xffb000, 1);
      pivot = [0, 1.45, 0.35];
      weak = [[-1.3, 0.8, 0.5], [0, 2.3, 0.5], [1.3, 1.2, 0.5]];
      weakColor = 0xffb000;
      break;
    }
    case 3: {
      // The Prism Warden: a crystal golem.
      b.box(-0.8, 0, -0.4, 0.8, 1.6, 0.4, 0x3a4a6a);
      b.box(-0.55, 1.6, -0.35, 0.55, 2.5, 0.35, 0x4a5a7a);
      for (const s of [-1, 1]) {
        b.box(s * 0.8, 0.6, -0.3, s * 1.5, 1.5, 0.3, 0x3a4a6a);
        b.push().translate(s * 1.15, 1.5, 0).crystal(0.18, 1.0, 0.3, 6, 0x6fe8ff, 0x2a5a7a, 0.7).pop();
      }
      for (let i = 0; i < 6; i++) b.push().translate((rng.next() - 0.5) * 1.2, 2.3, (rng.next() - 0.5) * 0.4).rotateZ((rng.next() - 0.5) * 0.8).crystal(0.12, 0.7 + rng.next() * 0.8, 0.2, 5, 0x8fe3ee, 0x2a5a7a, 0.8).pop();
      p.box(-0.3, 1.95, 0.33, 0.3, 2.15, 0.38, 0x8fe3ee, 1);
      weak = [[-1.15, 1.1, 0.45], [0, 2.05, 0.45], [1.15, 1.1, 0.45]];
      weakColor = 0x8fe3ee;
      break;
    }
    case 4: {
      // The Crusher: a Halden ore crusher with a boiler and the pressure valve.
      b.box(-2.2, 0, -0.5, 2.2, 1.4, 0.4, 0x4a4038);
      b.box(-1.8, 1.4, -0.4, 1.8, 2.0, 0.3, 0x6a5a48);
      b.box(1.0, 2.0, -0.4, 2.0, 3.6, 0.4, 0x8a6a3a);
      for (let x = -1.8; x <= 1.8; x += 0.6) b.box(x - 0.15, 0.2, 0.4, x + 0.15, 1.2, 0.55, 0x8a8c92);
      p.push().translate(1.5, 3.0, 0.45);
      for (let i = 0; i < 6; i++) p.push().rotateZ((i / 6) * Math.PI).box(-0.4, -0.05, -0.04, 0.4, 0.05, 0.04, 0xd8b064).pop();
      p.box(-0.12, -0.12, 0.0, 0.12, 0.12, 0.12, 0xff7a2a, 1);
      p.pop();
      pivot = [1.5, 3.0, 0.45];
      weak = [[1.5, 3.0, 0.6], [-1.2, 0.8, 0.6], [0.2, 1.7, 0.4]];
      weakColor = 0xff9a48;
      break;
    }
    case 5: {
      // The Mother Spore: a giant puffcap with spore sacs.
      b.box(-0.5, 0, -0.5, 0.5, 1.6, 0.5, 0xd8c8b0);
      for (let i = 0; i < 4; i++) {
        const w = 2.4 - i * 0.5;
        b.box(-w, 1.6 + i * 0.35, -w * 0.5, w, 1.95 + i * 0.35, w * 0.5, shade(0x8a4a9a, 1 - i * 0.08));
      }
      for (let i = 0; i < 12; i++) b.box(-2.2 + i * 0.4, 1.55, -0.2, -2.05 + i * 0.4, 1.6, 0.6, 0xc58cff, 0.8);
      p.box(-0.35, 2.1, 1.0, 0.35, 2.5, 1.3, 0xff9aff, 1);
      weak = [[-1.6, 1.85, 1.1], [0, 2.4, 1.2], [1.6, 1.85, 1.1]];
      weakColor = 0xff9aff;
      break;
    }
    case 6: {
      // The Drowned Bell: a bronze bell with its clapper (the moving part).
      for (let i = 0; i < 6; i++) {
        const w = 0.7 + i * 0.25;
        b.box(-w, 3.2 - i * 0.5, -w * 0.6, w, 3.7 - i * 0.5, w * 0.6, shade(0x8a6a3a, 1.1 - i * 0.05));
      }
      b.box(-2.1, 0.45, -1.2, 2.1, 0.7, 1.2, 0xb8904a);
      b.box(-0.15, 3.7, -0.15, 0.15, 4.4, 0.15, 0x5a5c62);
      p.box(-0.18, -1.6, -0.18, 0.18, 0, 0.18, 0x3a3020);
      p.box(-0.3, -2.0, -0.3, 0.3, -1.6, 0.3, 0x5fb7ff, 1);
      pivot = [0, 3.4, 0];
      weak = [[0, 1.6, 1.0], [-1.6, 1.0, 0.9], [1.6, 1.0, 0.9]];
      weakColor = 0x5fb7ff;
      break;
    }
    case 7: {
      // The Forge-Heart: a magma heart in an obsidian cage.
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        b.push().translate(Math.cos(a) * 1.5, 1.6, Math.sin(a) * 0.5).rotateY(-a);
        b.box(-0.12, -1.6, -0.12, 0.12, 1.6, 0.12, 0x1a1418);
        b.pop();
      }
      b.box(-1.8, 0, -0.7, 1.8, 0.3, 0.7, 0x2a2024);
      b.box(-1.8, 3.1, -0.7, 1.8, 3.4, 0.7, 0x2a2024);
      p.push().rotateY(0.78).rotateX(0.6).box(-0.8, -0.8, -0.8, 0.8, 0.8, 0.8, 0xff7a2e, 1).pop();
      pivot = [0, 1.6, 0];
      weak = [[-0.7, 1.1, 0.95], [0, 2.1, 0.95], [0.7, 1.1, 0.95]];
      weakColor = 0xffb347;
      break;
    }
    default: {
      // Biomes 8-13 share a regal frame: a carved arch with the biome's emblem at its heart.
      const accents = [0xffb000, 0x7fd8ff, 0xb9a2ff, 0x8fb8ff, 0xfff1c2, 0x6a5cff, 0x8fe3ee];
      const acc = accents[(k - 8) % accents.length];
      const stone = [0xd8ccb0, 0xa8c4e0, 0xb0a888, 0x5a6070, 0xc8a050, 0x2a2048, 0x4a3a5a][(k - 8) % 7];
      b.box(-2.6, 0, -0.5, -1.8, 4.2, 0.5, stone);
      b.box(1.8, 0, -0.5, 2.6, 4.2, 0.5, stone);
      b.box(-2.6, 3.6, -0.5, 2.6, 4.4, 0.5, shade(stone, 1.15));
      for (let i = 0; i < 9; i++) b.box(-2.4 + i * 0.6, 3.95, 0.5, -2.2 + i * 0.6, 4.15, 0.55, acc, 1);
      p.push().translate(0, 2.0, 0.2);
      if (k === 10 || k === 11) for (let i = 0; i < 12; i++) p.push().rotateZ((i / 12) * Math.PI * 2).box(-0.1, 1.0, -0.1, 0.1, 1.4, 0.1, shade(acc, 0.8), 0.6).pop();
      p.push().rotateZ(0.78).box(-0.7, -0.7, -0.15, 0.7, 0.7, 0.15, shade(stone, 0.7)).pop();
      p.box(-0.35, -0.35, 0.15, 0.35, 0.35, 0.3, acc, 1);
      p.pop();
      pivot = [0, 2.0, 0.2];
      weak = [[0, 2.0, 0.55], [-2.2, 1.6, 0.6], [2.2, 1.6, 0.6]];
      weakColor = acc;
    }
  }
  const out = build(b, p, pivot, 2.5, 4.4);
  return { ...out, weak, weakColor };
}

// ---- lanterns -------------------------------------------------------------------------------------------------

/** A planted lantern on its stake (the trail of your past selves), or the pale blue ghost lantern. */
export function lanternModel(ghost = false): ModelParts {
  const b = new VoxBuilder();
  const frame = ghost ? 0x6a8aa8 : 0x5a4a3a;
  const glow = ghost ? 0x9fd0ff : 0xffb35c;
  if (!ghost) b.box(-0.03, 0, -0.03, 0.03, 0.7, 0.03, 0x3a3028);
  b.box(-0.12, 0.7, -0.12, 0.12, 0.74, 0.12, frame);
  b.box(-0.1, 0.74, -0.1, 0.1, 0.98, 0.1, glow, ghost ? 0.85 : 1);
  for (const [x, z] of [[-0.11, -0.11], [0.11, -0.11], [-0.11, 0.11], [0.11, 0.11]]) b.box(x - 0.015, 0.74, z - 0.015, x + 0.015, 0.98, z + 0.015, frame);
  b.box(-0.12, 0.98, -0.12, 0.12, 1.02, 0.12, frame);
  b.box(-0.04, 1.02, -0.04, 0.04, 1.1, 0.04, frame);
  return build(b, undefined, undefined, 0.35, 1.1);
}
