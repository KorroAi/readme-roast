import * as THREE from 'three';
import { BIOME_PROPS } from './biomeModels';
import type { PropKind } from '../../world/gen/types';
import { Rng } from '../../core/rng';
import { hash32 } from '../../core/math';
import { VoxBuilder } from '../voxModel';
import { ASH, BARK, BRICK, CLOTH, COPPER, CYAN, FIRE, IRON, LEATHER, ROPE, RUST, SLATE, WOOD } from './palette';
import { CAMP_LANTERN, Layers, beam, buildLantern, buildPickaxe, disc, ring, shade, vary } from './shapes';
import { buildMonolith } from './monolith';
import { haldenNote, hoistWinch, satchel } from './featureModels';
import { forge, plotStake, relicShelf, runeStone, surveyTable } from './progressionModels';

/**
 * Procedural prop models. Every model stands on y = 0 centered on the origin and faces +Z.
 * Static parts go into `body` (one shared material for all props); glowing parts go into `glow`
 * so each prop can pulse or flicker on its own; `parts` are small glowing sub-meshes that move
 * (campfire flame tongues, embers, the monolith core).
 */

export type PropAnim = 'none' | 'fire' | 'lantern' | 'crystal' | 'glyph' | 'monolith';
export type PartMotion = 'flame' | 'ember' | 'float';

export interface PropPart {
  geometry: THREE.BufferGeometry;
  /** Local pivot of the part; its geometry is built relative to this point. */
  origin: THREE.Vector3;
  motion: PartMotion;
  /** Phase offset in radians so sibling parts never move in lockstep. */
  phase: number;
}

export interface PropModel {
  body: THREE.BufferGeometry;
  glow: THREE.BufferGeometry | null;
  parts: PropPart[];
  /** Local bounds of the whole model (unscaled). */
  bounds: THREE.Box3;
  /** Local boxes used for picking; one box for most props, a few for stepped shapes. */
  hitBoxes: THREE.Box3[];
  /** Hanging props swing about this local point. */
  sway: THREE.Vector3 | null;
  anim: PropAnim;
  /** Base emissive scale of the prop's glow material. */
  glowScale: number;
  /** Living flames (render/props/flame.ts): base point, width and height (model units); a magic flame's colour. */
  flames: Array<{ x: number; y: number; z: number; w: number; h: number; tint?: [number, number, number] }>;
}

export interface PropModelOptions {
  /** Variation index in [0, PROP_VARIANTS[kind]). */
  variant: number;
  /** Hanging lanterns: height of the ceiling attachment above the lantern base, in model units. */
  hangHeight?: number;
}

/**
 * Number of distinct meshes per kind. A prop's seed picks one, so repeated props (route lanterns,
 * crates) share geometry while still differing from their neighbours.
 */
const VARIANT_TABLE: Record<string, number> = {
  campfire: 1,
  workbench: 1,
  chest: 1,
  bedroll: 2,
  crate: 3,
  barrel: 3,
  lanternPost: 3,
  hangingLantern: 2,
  crystalCluster: 4,
  tablet: 2,
  pickaxeRack: 1,
  ropeCoil: 2,
  brokenCart: 1,
  // Variant 1: the stone awake (its niche cyan). Only ever chosen through PropSpec.variant.
  abyssMonolith: 2,
  // World variety (final pass W2, render/props/featureModels.ts). Append new kinds after these:
  // buildPropModel seeds each kind by its index in this table.
  haldenNote: 2,
  hoistWinch: 2,
  satchel: 1,
  // The tree and the runes (final pass W3, render/props/progressionModels.ts). A plot's variant is
  // its station's sketch, the shelf's the mask of lit sockets, a rune stone's its glyph (all set
  // through PropSpec.variant).
  plotStake: 3,
  forge: 1,
  surveyTable: 1,
  relicShelf: 256,
  runeStone: 8,
  // Round 3: the biomes' props and the new stations (render/props/biomeModels.ts).
  ...Object.fromEntries(Object.entries(BIOME_PROPS).map(([k, v]) => [k, v.variants])),
};

/**
 * Round 3: tolerant of kinds WORLD adds before VIS models them (one variant, the crate's model until
 * then), and of kinds it retires (their entries simply go unused), so PropKind can change without
 * breaking this table.
 */
export const PROP_VARIANTS: Readonly<Record<PropKind, number>> = new Proxy(VARIANT_TABLE, {
  get: (t, k) => (typeof k === 'string' && k in t ? t[k] : 1),
}) as unknown as Readonly<Record<PropKind, number>>;

/** The kinds this file models (every key of the table). */
export const PROP_KINDS = Object.keys(VARIANT_TABLE) as PropKind[];

/** Collects the layers of one model while it is being built. */
export class ModelBuilder {
  readonly body = new VoxBuilder();
  readonly glow = new VoxBuilder();
  readonly layers = new Layers(this.body, this.glow);
  anim: PropAnim = 'none';
  glowScale = 1.8;
  sway: THREE.Vector3 | null = null;
  hitBoxes: THREE.Box3[] | null = null;
  readonly flames: Array<{ x: number; y: number; z: number; w: number; h: number; tint?: [number, number, number] }> = [];
  private readonly partDefs: Array<{ builder: VoxBuilder; origin: THREE.Vector3; motion: PartMotion; phase: number }> = [];

  /** Start a moving glowing part pivoting at (x, y, z); build it relative to that point. */
  part(x: number, y: number, z: number, motion: PartMotion, phase: number): VoxBuilder {
    const builder = new VoxBuilder();
    this.partDefs.push({ builder, origin: new THREE.Vector3(x, y, z), motion, phase });
    return builder;
  }

  finish(): PropModel {
    const body = this.body.build();
    const glow = this.glow.vertexCount > 0 ? this.glow.build() : null;
    const parts: PropPart[] = this.partDefs
      .filter((p) => p.builder.vertexCount > 0)
      .map((p) => ({ geometry: p.builder.build(), origin: p.origin, motion: p.motion, phase: p.phase }));
    const bounds = body.boundingBox!.clone();
    if (glow) bounds.union(glow.boundingBox!);
    const tmp = new THREE.Box3();
    for (const p of parts) bounds.union(tmp.copy(p.geometry.boundingBox!).translate(p.origin));
    return {
      body,
      glow,
      parts,
      bounds,
      hitBoxes: this.hitBoxes ?? [bounds.clone()],
      sway: this.sway,
      anim: this.anim,
      glowScale: this.glowScale,
      flames: this.flames.slice(),
    };
  }
}

type KindBuilder = (m: ModelBuilder, rng: Rng, o: PropModelOptions) => void;

const BUILDERS: Record<string, KindBuilder> = {
  campfire,
  workbench,
  chest,
  bedroll,
  crate,
  barrel,
  lanternPost,
  hangingLantern,
  crystalCluster,
  tablet,
  pickaxeRack,
  ropeCoil,
  brokenCart,
  abyssMonolith: buildMonolith,
  haldenNote,
  hoistWinch,
  satchel,
  plotStake,
  forge,
  surveyTable,
  relicShelf,
  runeStone,
  ...Object.fromEntries(Object.entries(BIOME_PROPS).map(([k, v]) => [k, v.build])),
};

/** Variant index for a prop seed. */
export const propVariant = (kind: PropKind, seed: number): number => hash32(seed) % PROP_VARIANTS[kind];

/**
 * Kinds whose variant means something (a state, a biome's style, a guardian) and is only ever chosen
 * (PropSpec.modelVariant): without one they show variant 0, never a seeded pick.
 */
export const CHOSEN_VARIANT_KINDS: ReadonlySet<string> = new Set(['abyssMonolith', 'lairPillar', 'lairBrazier', 'lairRune', 'lever', 'guardianTrophy', 'trophyWall']);

/** The variant a prop shows: its chosen one, else 0 for a chosen-only kind, else its seed's pick. */
export function variantOf(spec: { kind: PropKind; seed: number; modelVariant?: number }): number {
  if (spec.modelVariant !== undefined) return Math.max(0, Math.floor(spec.modelVariant)) % PROP_VARIANTS[spec.kind];
  return CHOSEN_VARIANT_KINDS.has(spec.kind) ? 0 : propVariant(spec.kind, spec.seed);
}

/** Build the model for one kind and variant. Deterministic: same inputs, same geometry. */
export function buildPropModel(kind: PropKind, o: PropModelOptions): PropModel {
  const m = new ModelBuilder();
  (BUILDERS[kind] ?? BUILDERS.crate)(m, new Rng(hash32(PROP_KINDS.indexOf(kind) * 7919 + o.variant * 104729 + 17)), o);
  return m.finish();
}

// ---------------------------------------------------------------------------------------------
// Camp

function campfire(m: ModelBuilder, rng: Rng): void {
  const b = m.body;
  disc(b, 0.31, 0, 0.022, ASH.mid);
  disc(b, 0.2, 0.022, 0.03, ASH.dark);
  // Hearth stones with lighter caps so the ring reads from above.
  const stones = rng.int(10, 12);
  for (let i = 0; i < stones; i++) {
    const a = (i / stones) * Math.PI * 2 + rng.range(-0.08, 0.08);
    const r = 0.37 + rng.range(-0.02, 0.02);
    const w = rng.range(0.13, 0.18);
    const d = rng.range(0.11, 0.14);
    const h = rng.range(0.07, 0.12);
    const c = vary(SLATE[3 + (i % 3)], rng, 0.1);
    b.push().translate(Math.cos(a) * r, 0, Math.sin(a) * r).rotateY(-a + rng.range(-0.25, 0.25));
    b.box(-d / 2, 0, -w / 2, d / 2, h, w / 2, c);
    b.box(-d / 2 + 0.02, h, -w / 2 + 0.025, d / 2 - 0.02, h + 0.022, w / 2 - 0.03, shade(c, 1.2));
    b.pop();
  }
  // Two logs crossed flat under a teepee of four leaning logs, charred where they meet.
  const base = rng.range(0, Math.PI);
  [base + 0.4, base + 0.4 + Math.PI / 2].forEach((a, i) => {
    b.push().translate(0, 0.03 + i * 0.012, 0).rotateY(a);
    b.box(-0.27, 0, -0.042, 0.27, 0.075, 0.042, vary(BARK.dark, rng));
    b.box(-0.1, 0.075, -0.036, 0.1, 0.08, 0.036, WOOD.char);
    b.box(0.27, 0.005, -0.035, 0.29, 0.07, 0.035, WOOD.end);
    b.box(-0.29, 0.005, -0.035, -0.27, 0.07, 0.035, WOOD.end);
    b.pop();
  });
  // A low, open teepee of three logs so the flames show between them from every side.
  for (let i = 0; i < 3; i++) {
    const a = base + (i / 3) * Math.PI * 2 + rng.range(-0.12, 0.12);
    // Local +X runs from the inner, upper end to the outer end resting near the stones.
    b.push().translate(Math.cos(a) * 0.17, 0.16, Math.sin(a) * 0.17).rotateY(-a).rotateZ(-0.62 + rng.range(-0.06, 0.06));
    b.box(-0.13, -0.038, -0.038, 0.19, 0.038, 0.038, vary(BARK.mid, rng));
    b.box(-0.18, -0.034, -0.034, -0.13, 0.034, 0.034, WOOD.char);
    b.box(0.19, -0.032, -0.032, 0.212, 0.032, 0.032, WOOD.end);
    b.pop();
  }
  // Glowing coals on the ash bed (they pulse with the fire).
  const g = m.glow;
  for (let i = 0; i < 14; i++) {
    const a = rng.range(0, Math.PI * 2);
    const r = Math.sqrt(rng.next()) * 0.23;
    const s = rng.range(0.04, 0.07);
    const heat = rng.next();
    const c = heat > 0.65 ? FIRE.orange : heat > 0.3 ? FIRE.ember : FIRE.coal;
    g.cube(Math.cos(a) * r, 0.03 + s * 0.3, Math.sin(a) * r, s, s * 0.7, s, c, 0.5 + heat * 0.45);
  }
  // Round 2: the flame is alive (render/props/flame.ts): one tall licking flame over the logs and
  // two smaller ones in the gaps, drawn by a shader, not stacked boxes; the coals glow beneath.
  m.flames.push({ x: 0, y: 0.03, z: 0, w: 0.62, h: 0.9 });
  for (let i = 0; i < 2; i++) {
    const a = base + ((i + 0.5) / 3) * Math.PI * 2 + rng.range(-0.2, 0.2);
    m.flames.push({ x: Math.cos(a) * 0.13, y: 0.03, z: Math.sin(a) * 0.13, w: 0.34, h: rng.range(0.42, 0.55) });
  }
  const embers = m.part(0, 0.42, 0, 'ember', 0);
  for (let i = 0; i < 6; i++) {
    const a = rng.range(0, Math.PI * 2);
    const r = rng.range(0.03, 0.16);
    const s = rng.range(0.022, 0.034);
    embers.cube(Math.cos(a) * r, rng.range(0, 0.22), Math.sin(a) * r, s, s, s, i % 2 ? FIRE.yellow : FIRE.orange, 1);
  }
  m.anim = 'fire';
  m.glowScale = 1.7;
}

function workbench(m: ModelBuilder, rng: Rng): void {
  const b = m.body;
  const W = 0.8;
  const D = 0.36;
  const H = 0.9;
  const top = 0.075;
  // Tabletop: five planks with dark seams and nail heads at the ends.
  b.box(-W + 0.02, H - top - 0.004, -D + 0.01, W - 0.02, H - 0.012, D - 0.01, WOOD.dark);
  const planks = 5;
  const pd = (2 * D) / planks;
  for (let i = 0; i < planks; i++) {
    const z0 = -D + i * pd + 0.005;
    const z1 = -D + (i + 1) * pd - 0.005;
    const c = vary(WOOD.light, rng, 0.1);
    b.box(-W, H - top, z0, W, H, z1, c);
    b.box(-W - 0.004, H - top + 0.01, z0 + 0.01, -W, H - 0.01, z1 - 0.01, shade(c, 1.2));
    b.box(W, H - top + 0.01, z0 + 0.01, W + 0.004, H - 0.01, z1 - 0.01, shade(c, 1.2));
    for (const x of [-W + 0.06, W - 0.06]) b.box(x - 0.012, H, (z0 + z1) / 2 - 0.012, x + 0.012, H + 0.006, (z0 + z1) / 2 + 0.012, IRON.light);
  }
  // Apron, legs and a lower shelf.
  b.box(-W + 0.07, H - top - 0.1, -D + 0.05, W - 0.07, H - top, D - 0.05, WOOD.mid);
  for (const x of [-W + 0.1, W - 0.1])
    for (const z of [-D + 0.08, D - 0.08]) b.box(x - 0.055, 0, z - 0.055, x + 0.055, H - top, z + 0.055, vary(WOOD.mid, rng, 0.06));
  for (let i = 0; i < 3; i++) {
    const z0 = -D + 0.1 + i * 0.175;
    b.box(-W + 0.12, 0.16, z0, W - 0.12, 0.2, z0 + 0.165, vary(WOOD.mid, rng, 0.1));
  }
  // On the shelf: a canvas ore sack and a stone block.
  b.box(-0.5, 0.2, -0.16, -0.18, 0.42, 0.12, CLOTH.canvas);
  b.box(-0.47, 0.42, -0.13, -0.21, 0.46, 0.09, CLOTH.canvasDark);
  b.box(-0.37, 0.46, -0.05, -0.31, 0.5, 0.01, LEATHER.dark);
  b.box(0.1, 0.2, -0.18, 0.32, 0.4, 0.04, SLATE[3]);
  b.box(0.15, 0.4, -0.12, 0.2, 0.405, -0.07, COPPER.light);
  // Bench vise on the front edge, holding a copper bar between its jaws.
  const vx = W - 0.3;
  const vz = D;
  b.box(vx - 0.09, H, vz - 0.17, vx + 0.09, H + 0.045, vz - 0.03, IRON.dark);
  b.box(vx - 0.08, H + 0.045, vz - 0.16, vx + 0.08, H + 0.15, vz - 0.1, IRON.mid);
  b.box(vx - 0.08, H + 0.045, vz - 0.05, vx + 0.08, H + 0.15, vz + 0.01, IRON.mid);
  b.box(vx - 0.08, H + 0.135, vz - 0.105, vx + 0.08, H + 0.155, vz - 0.095, IRON.shine);
  b.box(vx - 0.08, H + 0.135, vz - 0.055, vx + 0.08, H + 0.155, vz - 0.045, IRON.shine);
  b.box(vx - 0.05, H + 0.07, vz - 0.092, vx + 0.05, H + 0.21, vz - 0.058, COPPER.mid);
  b.box(vx - 0.014, H + 0.08, vz + 0.01, vx + 0.014, H + 0.108, vz + 0.12, IRON.light);
  b.box(vx - 0.11, H + 0.084, vz + 0.1, vx + 0.11, H + 0.104, vz + 0.12, IRON.light);
  b.cube(vx - 0.115, H + 0.094, vz + 0.11, 0.03, 0.03, 0.03, IRON.dark);
  b.cube(vx + 0.115, H + 0.094, vz + 0.11, 0.03, 0.03, 0.03, IRON.dark);
  b.box(vx - 0.04, H - top - 0.09, vz - 0.08, vx + 0.04, H - top, vz - 0.03, IRON.dark);
  // Hammer and chisel lying on the top.
  b.push().translate(-0.12, H, 0.1).rotateY(rng.range(-0.4, 0.4));
  b.box(-0.17, 0, -0.016, 0.12, 0.03, 0.016, WOOD.pale);
  b.box(0.12, 0, -0.055, 0.17, 0.05, 0.055, IRON.mid);
  b.box(0.125, 0.05, -0.05, 0.165, 0.056, 0.05, IRON.shine);
  b.pop();
  b.push().translate(0.12, H, 0.16).rotateY(rng.range(-0.3, 0.3) + 0.4);
  b.box(-0.1, 0, -0.016, 0.0, 0.03, 0.016, WOOD.light);
  b.box(0.0, 0.006, -0.009, 0.09, 0.022, 0.009, IRON.light);
  b.pop();
  // A saw at the back edge.
  b.push().translate(0.1, H, -0.23).rotateY(0.08);
  b.box(-0.2, 0, -0.045, 0.16, 0.008, 0.045, IRON.light);
  b.box(-0.2, 0, -0.05, 0.16, 0.006, -0.045, IRON.dark);
  b.box(0.16, 0, -0.04, 0.27, 0.03, 0.04, WOOD.mid);
  b.pop();
  // Copper ingots, one stacked across the other two.
  const ingot = (x: number, y: number, z: number, rot: number) => {
    b.push().translate(x, y, z).rotateY(rot);
    b.box(-0.09, 0, -0.042, 0.09, 0.034, 0.042, COPPER.mid);
    b.box(-0.075, 0.034, -0.03, 0.075, 0.05, 0.03, COPPER.light);
    b.box(-0.05, 0.05, -0.016, 0.03, 0.053, 0.0, COPPER.shine);
    b.pop();
  };
  ingot(-0.55, H, -0.2, 0.05);
  ingot(-0.55, H, -0.1, -0.05);
  ingot(-0.55, H + 0.05, -0.15, Math.PI / 2 + rng.range(-0.2, 0.2));
  // A lump of copper ore waiting to be smelted.
  b.box(-0.38, H, -0.24, -0.26, H + 0.1, -0.12, SLATE[2]);
  b.box(-0.37, H + 0.06, -0.12, -0.33, H + 0.09, -0.118, COPPER.light);
  b.box(-0.3, H + 0.1, -0.2, -0.27, H + 0.102, -0.17, COPPER.mid);
}

function chest(m: ModelBuilder, rng: Rng): void {
  const b = m.body;
  const W = 0.45;
  const D = 0.3;
  const Hb = 0.4;
  const H = 0.6;
  // Body: three boards over a dark core that shows through as grooves.
  b.box(-W + 0.01, 0, -D + 0.01, W - 0.01, Hb, D - 0.01, WOOD.dark);
  for (let i = 0; i < 3; i++) {
    b.box(-W, i * (Hb / 3) + 0.006, -D, W, (i + 1) * (Hb / 3) - 0.006, D, vary(WOOD.mid, rng, 0.08));
  }
  // Lid with a stepped crown for a rounded profile.
  const lid = vary(WOOD.light, rng, 0.05);
  b.box(-W - 0.015, Hb + 0.004, -D - 0.015, W + 0.015, Hb + 0.13, D + 0.015, lid);
  b.box(-W - 0.005, Hb + 0.13, -D + 0.05, W + 0.005, H, D - 0.05, shade(lid, 1.06));
  // Iron bands, corner caps and side handles.
  for (const x of [-0.28, 0.28]) {
    b.box(x - 0.035, 0, -D - 0.012, x + 0.035, Hb, D + 0.012, IRON.dark);
    b.box(x - 0.035, Hb + 0.004, -D - 0.027, x + 0.035, Hb + 0.135, D + 0.027, IRON.dark);
    b.box(x - 0.035, Hb + 0.13, -D + 0.04, x + 0.035, H + 0.012, D - 0.04, IRON.dark);
    for (const y of [0.07, 0.2, 0.33, Hb + 0.07]) {
      const zf = y > Hb ? D + 0.027 : D + 0.012;
      b.box(x - 0.012, y - 0.012, zf, x + 0.012, y + 0.012, zf + 0.01, IRON.shine);
    }
  }
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      const x0 = sx > 0 ? W - 0.05 : -W - 0.012;
      const z0 = sz > 0 ? D - 0.05 : -D - 0.012;
      b.box(x0, 0, z0, x0 + 0.062, 0.1, z0 + 0.062, IRON.mid);
      b.box(x0, Hb - 0.1, z0, x0 + 0.062, Hb, z0 + 0.062, IRON.mid);
    }
  for (const sx of [-1, 1]) {
    const x0 = sx * (W + 0.012);
    const x1 = sx * (W + 0.04);
    b.box(Math.min(x0, x1), 0.25, -0.09, Math.max(x0, x1), 0.27, 0.09, IRON.light);
    b.box(Math.min(sx * W, x0), 0.24, -0.1, Math.max(sx * W, x0), 0.3, -0.07, IRON.dark);
    b.box(Math.min(sx * W, x0), 0.24, 0.07, Math.max(sx * W, x0), 0.3, 0.1, IRON.dark);
  }
  // Copper latch plate, hasp and a small padlock.
  b.box(-0.065, Hb - 0.1, D + 0.006, 0.065, Hb + 0.012, D + 0.02, COPPER.mid);
  b.box(-0.035, Hb - 0.05, D + 0.02, 0.035, Hb + 0.1, D + 0.034, COPPER.mid);
  b.box(-0.032, Hb - 0.13, D + 0.034, 0.032, Hb - 0.07, D + 0.064, IRON.mid);
  b.box(-0.022, Hb - 0.07, D + 0.044, -0.012, Hb - 0.035, D + 0.054, IRON.light);
  b.box(0.012, Hb - 0.07, D + 0.044, 0.022, Hb - 0.035, D + 0.054, IRON.light);
  b.box(-0.022, Hb - 0.04, D + 0.044, 0.022, Hb - 0.03, D + 0.054, IRON.light);
  b.box(-0.006, Hb - 0.11, D + 0.064, 0.006, Hb - 0.09, D + 0.068, IRON.dark);
}

function bedroll(m: ModelBuilder, rng: Rng, o: PropModelOptions): void {
  const b = m.body;
  const W = 0.36;
  const z0 = -0.95;
  const z1 = 0.85;
  const blanket = o.variant === 1 ? CLOTH.canvas : CLOTH.red;
  const blanketDark = o.variant === 1 ? CLOTH.canvasDark : CLOTH.redDark;
  // Felt mat with woven stripes.
  for (let z = z0, i = 0; z < z1 - 1e-6; i++) {
    const ze = Math.min(z1, z + (i % 2 === 0 ? 0.22 : 0.05));
    b.box(-W, 0, z, W, 0.04, ze, i % 2 === 0 ? vary(CLOTH.felt, rng, 0.05) : CLOTH.feltLight);
    z = ze;
  }
  // Wool blanket over the lower part with a cream turned-down edge and a wrinkle.
  b.box(-W + 0.03, 0.04, z0 + 0.2, W - 0.03, 0.085, 0.33, blanket);
  b.box(-W + 0.02, 0.04, 0.33, W - 0.02, 0.1, 0.46, CLOTH.cream);
  b.box(-W + 0.05, 0.085, -0.38, W - 0.05, 0.1, -0.3, blanketDark);
  b.box(-W + 0.028, 0.04, -0.6, -W + 0.03, 0.085, 0.33, blanketDark);
  // Rolled foot end, strapped.
  b.push().translate(0, 0.1, z0 + 0.11).rotateZ(Math.PI / 2);
  disc(b, 0.1, -0.34, 0.34, blanket);
  disc(b, 0.075, -0.35, -0.34, CLOTH.cream);
  disc(b, 0.075, 0.34, 0.35, CLOTH.cream);
  disc(b, 0.03, -0.355, -0.35, blanketDark);
  disc(b, 0.03, 0.35, 0.355, blanketDark);
  disc(b, 0.106, -0.22, -0.18, LEATHER.dark);
  disc(b, 0.106, 0.18, 0.22, LEATHER.dark);
  b.pop();
  // Pillow.
  const pillow = shade(CLOTH.cream, 0.92);
  b.box(-0.22, 0.04, 0.56, 0.22, 0.13, 0.81, pillow);
  b.box(-0.19, 0.13, 0.59, 0.19, 0.155, 0.78, CLOTH.cream);
  b.box(-0.225, 0.07, 0.6, 0.225, 0.1, 0.77, CLOTH.creamDark);
  if (o.variant === 0) {
    // A tin cup left by the pillow.
    b.push().translate(0.47, 0, 0.62);
    disc(b, 0.045, 0, 0.09, IRON.light);
    disc(b, 0.034, 0.09, 0.092, IRON.dark);
    b.box(0.04, 0.025, -0.008, 0.07, 0.07, 0.008, IRON.mid);
    b.pop();
  }
}

function crate(m: ModelBuilder, rng: Rng, o: PropModelOptions): void {
  const b = m.body;
  const h = 0.4;
  const t = 0.07;
  b.box(-h + 0.03, 0.03, -h + 0.03, h - 0.03, 2 * h - 0.03, h - 0.03, WOOD.dark);
  // Side panels: three planks each, with a diagonal brace.
  for (let f = 0; f < 4; f++) {
    b.push().rotateY((f * Math.PI) / 2);
    for (let i = 0; i < 3; i++) {
      const y0 = t + i * 0.22 + 0.006;
      b.box(-h + t, y0, h - 0.04, h - t, y0 + 0.208, h - 0.02, vary(WOOD.mid, rng, 0.1));
    }
    const dir = (o.variant + f) % 2 === 0 ? 1 : -1;
    b.push().translate(0, h, h - 0.016).rotateZ((dir * Math.PI) / 4);
    b.box(-0.42, -0.04, -0.012, 0.42, 0.04, 0.012, vary(WOOD.light, rng, 0.06));
    b.pop();
    b.pop();
  }
  // Frame battens on all twelve edges.
  const frame = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number) =>
    b.box(x0, y0, z0, x1, y1, z1, vary(WOOD.light, rng, 0.07));
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      const x0 = sx > 0 ? h - t : -h;
      const z0 = sz > 0 ? h - t : -h;
      frame(x0, 0, z0, x0 + t, 2 * h, z0 + t);
    }
  for (const y0 of [0, 2 * h - t])
    for (const s of [-1, 1]) {
      const a = s > 0 ? h - t : -h;
      frame(-h + t, y0, a, h - t, y0 + t, a + t);
      frame(a, y0, -h + t, a + t, y0 + t, h - t);
    }
  // Lid planks, recessed between the top battens. Variant 2 has one pried off, showing straw.
  for (let i = 0; i < 3; i++) {
    if (o.variant === 2 && i === 1) continue;
    const z0 = -h + t + i * 0.22 + 0.005;
    b.box(-h + t, 2 * h - 0.045, z0, h - t, 2 * h - 0.02, z0 + 0.21, vary(WOOD.mid, rng, 0.1));
  }
  if (o.variant === 2) {
    b.box(-h + t, 2 * h - 0.03, -0.11, h - t, 2 * h - 0.024, 0.11, 0xb39651);
    b.box(-0.2, 2 * h - 0.024, -0.06, 0.05, 2 * h - 0.01, 0.02, 0xc9ad62);
  }
  // Nail heads where the braces meet the frame.
  for (let f = 0; f < 4; f++) {
    b.push().rotateY((f * Math.PI) / 2);
    for (const x of [-h + 0.035, h - 0.035]) for (const y of [0.035, 2 * h - 0.035]) b.box(x - 0.01, y - 0.01, h, x + 0.01, y + 0.01, h + 0.006, IRON.light);
    b.pop();
  }
}

function barrel(m: ModelBuilder, rng: Rng, o: PropModelOptions): void {
  const b = m.body;
  const n = 12;
  const H = 0.95;
  const wood = o.variant === 2 ? WOOD.dark : WOOD.mid;
  const staves = Array.from({ length: n }, () => vary(wood, rng, 0.12));
  // Three bands of staves at different radii give the bulge.
  const segs = [
    { y0: 0, y1: 0.24, r: 0.27 },
    { y0: 0.24, y1: 0.71, r: 0.295 },
    { y0: 0.71, y1: H, r: 0.27 },
  ];
  for (const s of segs) ring(b, { sides: n, radius: s.r, thickness: 0.05, y0: s.y0, y1: s.y1, color: (i) => staves[i] });
  // Iron hoops proud of the staves.
  for (const [y, r] of [[0.06, 0.27], [0.27, 0.295], [0.64, 0.295], [0.85, 0.27]]) {
    ring(b, { sides: n, radius: r + 0.03, thickness: 0.026, y0: y, y1: y + 0.05, color: (i) => (i % 3 === 0 ? IRON.mid : IRON.dark) });
  }
  // Recessed lid with plank seams and a bung.
  disc(b, 0.25, H - 0.05, H - 0.02, WOOD.light);
  for (const z of [-0.08, 0.08]) b.box(-0.22, H - 0.02, z - 0.005, 0.22, H - 0.016, z + 0.005, WOOD.dark);
  b.box(0.09, H - 0.02, -0.03, 0.15, H - 0.005, 0.03, WOOD.char);
  disc(b, 0.25, 0, 0.02, WOOD.dark);
  if (o.variant === 1) {
    // A wooden tap near the bottom with a dark drip stain under it.
    b.box(-0.03, 0.16, 0.31, 0.03, 0.22, 0.4, WOOD.light);
    b.box(-0.015, 0.12, 0.37, 0.015, 0.16, 0.4, WOOD.light);
    b.box(-0.05, 0.0, 0.33, 0.05, 0.004, 0.45, 0x1a1512);
  } else if (o.variant === 2) {
    ring(b, { sides: n, radius: 0.33, thickness: 0.03, y0: 0.44, y1: 0.48, color: (i) => (i % 2 ? ROPE.mid : ROPE.light) });
  }
}

// ---------------------------------------------------------------------------------------------
// Lanterns

function lanternPost(m: ModelBuilder, rng: Rng, o: PropModelOptions): void {
  const b = m.body;
  const H = 1.4 + (o.variant - 1) * 0.04;
  if (o.variant === 2) {
    // Post driven into a pile of stones.
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2 + rng.range(-0.2, 0.2);
      const r = rng.range(0.1, 0.16);
      const s = rng.range(0.1, 0.15);
      b.push().translate(Math.cos(a) * r, 0, Math.sin(a) * r).rotateY(rng.range(0, Math.PI));
      b.box(-s / 2, 0, -s / 2, s / 2, rng.range(0.06, 0.12), s / 2, vary(SLATE[3], rng, 0.12));
      b.pop();
    }
  } else {
    // Cross feet with four short braces.
    b.box(-0.24, 0, -0.045, 0.24, 0.07, 0.045, WOOD.mid);
    b.box(-0.045, 0, -0.24, 0.045, 0.076, 0.24, WOOD.dark);
    for (const [x, z] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) beam(b, x * 0.19, 0.06, z * 0.19, x * 0.055, 0.25, z * 0.055, 0.04, 0.04, WOOD.mid);
  }
  b.box(-0.06, 0, -0.06, 0.06, H, 0.06, vary(WOOD.mid, rng, 0.05));
  b.box(-0.063, 0, -0.063, 0.063, 0.16, 0.063, WOOD.dark);
  b.box(0.035, 0.2, 0.06, 0.06, H - 0.12, 0.064, WOOD.light);
  b.box(-0.08, H, -0.08, 0.08, H + 0.04, 0.08, WOOD.light);
  // Arm toward +Z with a diagonal brace and an iron hook.
  b.box(-0.035, H - 0.1, 0.05, 0.035, H - 0.03, 0.38, WOOD.light);
  beam(b, 0, H - 0.36, 0.06, 0, H - 0.08, 0.26, 0.045, 0.045, WOOD.mid);
  b.box(-0.01, H - 0.16, 0.31, 0.01, H - 0.1, 0.33, IRON.mid);
  if (o.variant === 0) {
    // A red route ribbon tied under the arm.
    b.box(-0.04, H - 0.14, 0.12, 0.04, H - 0.1, 0.16, CLOTH.red);
    b.box(-0.006, H - 0.33, 0.13, 0.006, H - 0.14, 0.15, CLOTH.red);
    b.box(0.0, H - 0.3, 0.15, 0.006, H - 0.14, 0.17, CLOTH.redDark);
  } else if (o.variant === 1) {
    ring(b, { sides: 8, radius: 0.075, thickness: 0.03, y0: 0.82, y1: 0.86, color: () => ROPE.mid });
    ring(b, { sides: 8, radius: 0.075, thickness: 0.03, y0: 0.87, y1: 0.91, color: () => ROPE.light, phase: 0.4 });
  }
  const lantern = m.layers.push().translate(0, H - 0.16 - CAMP_LANTERN.size * 0.334, 0.32);
  buildLantern(lantern, CAMP_LANTERN);
  lantern.pop();
  m.anim = 'lantern';
  m.glowScale = 1.9;
}

function hangingLantern(m: ModelBuilder, _rng: Rng, o: PropModelOptions): void {
  const b = m.body;
  const top = Math.max(0.6, o.hangHeight ?? 1.6);
  const shape = buildLantern(m.layers, { ...CAMP_LANTERN, size: 1.15 });
  const y0 = shape.top - 0.02;
  if (o.variant === 0) {
    // Open chain links in alternating planes.
    const link = 0.07;
    const n = Math.max(1, Math.floor((top - 0.03 - y0) / link));
    for (let i = 0; i < n; i++) {
      const y = y0 + i * link;
      const yt = i === n - 1 ? top - 0.03 : y + link + 0.012;
      b.push().rotateY(i % 2 === 0 ? 0 : Math.PI / 2);
      // Side bars run between the end bars (not through them) so their faces never overlap.
      b.box(-0.024, y + 0.012, -0.007, -0.012, yt - 0.012, 0.007, IRON.mid);
      b.box(0.012, y + 0.012, -0.007, 0.024, yt - 0.012, 0.007, IRON.mid);
      b.box(-0.024, y, -0.007, 0.024, y + 0.012, 0.007, IRON.light);
      b.box(-0.024, yt - 0.012, -0.007, 0.024, yt, 0.007, IRON.light);
      b.pop();
    }
  } else {
    // A twisted rope with a knot above the lantern.
    for (let y = y0, i = 0; y < top - 0.03; y += 0.05, i++) {
      b.box(-0.016, y, -0.016, 0.016, Math.min(top - 0.03, y + 0.05), 0.016, i % 2 ? ROPE.mid : ROPE.light);
    }
    b.box(-0.03, y0 + 0.04, -0.03, 0.03, y0 + 0.1, 0.03, ROPE.dark);
  }
  b.box(-0.07, top - 0.03, -0.07, 0.07, top, 0.07, IRON.dark);
  m.sway = new THREE.Vector3(0, top, 0);
  m.anim = 'lantern';
  m.glowScale = 1.9;
}

// ---------------------------------------------------------------------------------------------
// Mystery

function crystalCluster(m: ModelBuilder, rng: Rng): void {
  const b = m.body;
  const g = m.glow;
  // Rocky base: a central mass with a ring of smaller stones.
  b.box(-0.16, 0, -0.16, 0.16, 0.13, 0.16, SLATE[2]);
  const rocks = rng.int(5, 7);
  for (let i = 0; i < rocks; i++) {
    const a = (i / rocks) * Math.PI * 2 + rng.range(-0.3, 0.3);
    const r = rng.range(0.12, 0.28);
    const s = rng.range(0.13, 0.24);
    b.push().translate(Math.cos(a) * r, 0, Math.sin(a) * r).rotateY(rng.range(0, Math.PI));
    b.box(-s / 2, 0, -s / 2, s / 2, rng.range(0.07, 0.18), s / 2, vary(SLATE[1 + rng.int(0, 2)], rng, 0.08));
    b.pop();
  }
  // Shards: one tall leader and a spray of smaller tilted ones.
  const count = rng.int(5, 9);
  for (let i = 0; i < count; i++) {
    const main = i === 0;
    const a = rng.range(0, Math.PI * 2);
    const r = main ? rng.range(0, 0.04) : rng.range(0.07, 0.24);
    const height = main ? rng.range(0.55, 0.78) : rng.range(0.16, 0.48);
    const radius = main ? rng.range(0.09, 0.12) : rng.range(0.04, 0.08);
    const tilt = main ? rng.range(0.02, 0.15) : rng.range(0.25, 0.75);
    const pale = rng.chance(0.3);
    g.push().translate(Math.cos(a) * r, 0.07, Math.sin(a) * r).rotateY(-a).rotateZ(-tilt).rotateY(rng.range(0, 1.2));
    g.crystal(radius, height, radius * rng.range(1.4, 2.2), rng.pick([5, 6]), pale ? CYAN.light : CYAN.mid, CYAN.dark, main ? 0.62 : rng.range(0.45, 0.6));
    g.pop();
  }
  // Chips of crystal in the gravel.
  for (let i = 0; i < 4; i++) {
    const a = rng.range(0, Math.PI * 2);
    const r = rng.range(0.28, 0.36);
    g.push().translate(Math.cos(a) * r, 0.012, Math.sin(a) * r).rotateY(-a).rotateZ(-0.5);
    g.crystal(0.025, 0.05, 0.04, 4, CYAN.mid, CYAN.dark, 0.5);
    g.pop();
  }
  m.anim = 'crystal';
  // Lead 01:17 (the geode's crystals pop): 1.8 -> 2.0.
  m.glowScale = 2.0;
}

function tablet(m: ModelBuilder, rng: Rng, o: PropModelOptions): void {
  const b = m.body;
  const g = m.glow;
  // Stepped pedestal with a glyph band.
  b.box(-0.32, 0, -0.24, 0.32, 0.1, 0.24, BRICK.base);
  b.box(-0.27, 0.1, -0.19, 0.27, 0.22, 0.19, BRICK.mid);
  b.box(-0.3, 0.22, -0.21, 0.3, 0.28, 0.21, BRICK.light);
  b.box(-0.33, 0.096, -0.25, 0.33, 0.104, 0.25, BRICK.mortar);
  for (let x = -0.22; x < 0.2; x += 0.09) g.box(x, 0.15, 0.19, x + 0.05, 0.166, 0.196, CYAN.dark, 0.7);
  // Slab, leaning back slightly, with a raised border and a stepped top.
  const L = m.layers.push().translate(0, 0.28, -0.03).rotateX(-0.06);
  b.box(-0.22, 0, -0.06, 0.22, 0.62, 0.05, BRICK.light);
  b.box(-0.185, 0.035, 0.05, 0.185, 0.585, 0.056, BRICK.base);
  b.box(-0.17, 0.62, -0.055, 0.17, 0.68, 0.045, BRICK.light);
  b.box(-0.1, 0.68, -0.05, 0.1, 0.72, 0.04, BRICK.mid);
  // A crack across one corner.
  for (let i = 0; i < 4; i++) b.box(0.12 + i * 0.02, 0.5 - i * 0.03, 0.056, 0.14 + i * 0.02, 0.53 - i * 0.03, 0.06, BRICK.mortar);
  // Glyph script: rows of strokes with ticks, under a ringed sigil.
  const zf = 0.056;
  for (let row = 0; row < 6; row++) {
    const y = 0.08 + row * 0.07;
    let x = -0.155;
    while (x < 0.13) {
      const len = rng.range(0.03, 0.08);
      const x1 = Math.min(0.155, x + len);
      const bright = rng.chance(0.25);
      const c = bright ? CYAN.light : CYAN.mid;
      g.box(x, y, zf, x1, y + 0.016, zf + 0.006, c, bright ? 0.95 : 0.8);
      if (rng.chance(0.45)) {
        const tx = rng.chance(0.5) ? x : x1 - 0.016;
        const up = rng.chance(0.5);
        g.box(tx, up ? y : y - 0.03, zf, tx + 0.016, up ? y + 0.046 : y + 0.016, zf + 0.006, c, bright ? 0.95 : 0.8);
      }
      x = x1 + rng.range(0.02, 0.035);
    }
  }
  const sigilY = 0.53;
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    g.cube(Math.cos(a) * 0.05, sigilY + Math.sin(a) * 0.05, zf + 0.003, 0.022, 0.022, 0.006, CYAN.mid, 0.85);
  }
  g.cube(0, sigilY, zf + 0.003, 0.026, 0.026, 0.006, o.variant === 1 ? CYAN.white : CYAN.light, 1);
  L.pop();
  // Rubble at the foot of the pedestal.
  for (let i = 0; i < 4; i++) {
    const a = rng.range(0, Math.PI * 2);
    const s = rng.range(0.04, 0.08);
    b.cube(Math.cos(a) * 0.4, s / 2, Math.sin(a) * 0.32, s, s, s, vary(BRICK.mid, rng, 0.1));
  }
  m.anim = 'glyph';
  m.glowScale = 1.6;
}

// ---------------------------------------------------------------------------------------------
// Clutter

const RUSTY_PICK = { head: RUST.mid, headDark: RUST.dark, headLight: RUST.light, handle: WOOD.light, grip: LEATHER.dark, rust: RUST.spot };

function pickaxeRack(m: ModelBuilder): void {
  const b = m.body;
  // Two uprights on feet, a top rail with pegs and a lower rail.
  for (const x of [-0.36, 0.36]) {
    b.box(x - 0.04, 0, -0.22, x + 0.04, 0.06, 0.18, WOOD.mid);
    b.box(x - 0.035, 0.06, -0.135, x + 0.035, 1.1, -0.065, WOOD.light);
    beam(b, x, 0.06, 0.13, x, 0.46, -0.08, 0.045, 0.045, WOOD.mid);
  }
  b.box(-0.44, 1.02, -0.145, 0.44, 1.09, -0.055, WOOD.light);
  b.box(-0.4, 0.4, -0.13, 0.4, 0.45, -0.07, WOOD.mid);
  b.box(-0.166, 0.94, -0.06, -0.134, 0.975, 0.05, WOOD.end);
  // The old pickaxe hangs by its head from a peg: a clear T against the open frame.
  b.push().translate(-0.15, 0.428, 0.01).rotateY(Math.PI / 2);
  buildPickaxe(b, { ...RUSTY_PICK, handle: WOOD.pale }, 0.6);
  b.pop();
  // A shovel leans on the lower rail beside it.
  b.push().translate(0.15, 0.035, 0.2).rotateX(-0.58);
  b.box(-0.1, 0, -0.012, 0.1, 0.24, 0.012, IRON.mid);
  b.box(-0.075, -0.03, -0.012, 0.075, 0, 0.012, IRON.light);
  b.box(-0.105, 0.04, -0.017, -0.09, 0.24, 0.017, IRON.dark);
  b.box(0.09, 0.04, -0.017, 0.105, 0.24, 0.017, IRON.dark);
  b.box(-0.03, 0.24, -0.02, 0.03, 0.32, 0.02, IRON.dark);
  b.box(-0.018, 0.32, -0.018, 0.018, 0.8, 0.018, WOOD.pale);
  b.box(-0.07, 0.8, -0.022, 0.07, 0.84, 0.022, WOOD.light);
  b.pop();
  // A loop of rope hanging from a peg on the right upright.
  b.box(0.344, 0.7, -0.065, 0.376, 0.73, 0.03, WOOD.end);
  b.push().translate(0.36, 0.6, 0.0).rotateX(Math.PI / 2);
  ring(b, { sides: 10, radius: 0.1, thickness: 0.03, y0: -0.015, y1: 0.015, color: (i) => (i % 2 ? ROPE.mid : ROPE.light) });
  b.pop();
}

function ropeCoil(m: ModelBuilder, rng: Rng, o: PropModelOptions): void {
  const b = m.body;
  const turns = o.variant === 1 ? 3 : 4;
  for (let t = 0; t < turns; t++) {
    ring(b, {
      sides: 12,
      radius: 0.2 - t * 0.012,
      thickness: 0.055,
      y0: t * 0.046,
      y1: t * 0.046 + 0.05,
      color: (i) => ((i + t) % 2 === 0 ? ROPE.mid : ROPE.light),
      phase: (t * Math.PI) / 12,
    });
  }
  ring(b, { sides: 10, radius: 0.12, thickness: 0.05, y0: 0, y1: 0.04, color: (i) => (i % 2 ? ROPE.dark : ROPE.mid) });
  // Loose end trailing across the floor.
  let x = 0.2;
  let z = 0.02;
  let a = 0.35;
  for (let i = 0; i < 6; i++) {
    const nx = x + Math.cos(a) * 0.08;
    const nz = z + Math.sin(a) * 0.08;
    // Alternate segments are a hair thicker so the overlapping joints never share a plane.
    beam(b, x, 0.024, z, nx, 0.024, nz, 0.05, i % 2 ? 0.046 : 0.0476, i % 2 ? ROPE.mid : ROPE.light);
    x = nx;
    z = nz;
    a += rng.range(-0.5, 0.5);
  }
  if (o.variant === 1) {
    // An iron grappling hook on the end.
    b.box(x - 0.025, 0, z - 0.025, x + 0.025, 0.05, z + 0.025, IRON.dark);
    for (const d of [0, Math.PI / 2, Math.PI, Math.PI * 1.5]) beam(b, x, 0.02, z, x + Math.cos(d) * 0.09, 0.03, z + Math.sin(d) * 0.09, 0.02, 0.02, IRON.mid);
  }
}

function brokenCart(m: ModelBuilder, rng: Rng): void {
  const b = m.body;
  // Upright cart frame: long axis X, flared bucket on a chassis over four spoked wheels.
  const floor = 0.17;
  const wallH = 0.5;
  const hx0 = 0.4;
  const hz0 = 0.27;
  const flareZ = 0.12;
  const flareX = 0.14;
  const hx1 = hx0 + Math.tan(flareX) * wallH;
  // The front-right wheel broke: the cart slumped onto that corner and rolled onto its side,
  // spilling ore. Lift it so the lowest corner rests on the floor.
  const lean = 0.62;
  const slump = -0.32;
  const pose = new THREE.Matrix4().makeRotationZ(slump).multiply(new THREE.Matrix4().makeRotationX(lean));
  const corner = new THREE.Vector3();
  let lift = 0;
  for (const x of [-hx1, hx1]) for (const y of [0, floor + wallH + 0.02]) for (const z of [-0.37, 0.37]) lift = Math.max(lift, -corner.set(x, y, z).applyMatrix4(pose).y);
  b.push().translate(0, lift, -0.12).rotateZ(slump).rotateX(lean);
  b.box(-hx0, floor, -hz0, hx0, floor + 0.05, hz0, WOOD.dark);
  for (const sz of [-1, 1]) {
    // Long walls lean outward from the floor edge, three planks with an iron rim.
    b.push().translate(0, floor, sz * hz0).rotateX(sz * flareZ);
    const z0 = sz > 0 ? -0.05 : 0;
    for (let i = 0; i < 3; i++) {
      const y0 = i * (wallH / 3) + 0.004;
      b.box(-hx1, y0, z0, hx1, y0 + wallH / 3 - 0.008, z0 + 0.05, vary(WOOD.mid, rng, 0.1));
    }
    b.box(-hx1 - 0.012, wallH - 0.05, z0 - 0.012, hx1 + 0.012, wallH + 0.012, z0 + 0.062, IRON.mid);
    for (const x of [-hx1 + 0.03, 0, hx1 - 0.03]) b.box(x - 0.03, 0, sz > 0 ? 0 : -0.012, x + 0.03, wallH - 0.05, sz > 0 ? 0.012 : 0, IRON.dark);
    b.pop();
  }
  for (const sx of [-1, 1]) {
    // End walls with an iron plate and a coupling hook.
    b.push().translate(sx * hx0, floor, 0).rotateZ(-sx * flareX);
    const x0 = sx > 0 ? -0.05 : 0;
    b.box(x0, 0, -hz0 - 0.02, x0 + 0.05, wallH, hz0 + 0.02, vary(WOOD.mid, rng, 0.1));
    const xo = sx > 0 ? 0 : -0.012;
    b.box(xo, 0.1, -0.12, xo + 0.012, 0.38, 0.12, IRON.mid);
    for (const z of [-0.09, 0.09]) for (const y of [0.13, 0.35]) b.box(sx > 0 ? 0.012 : -0.02, y - 0.012, z - 0.012, sx > 0 ? 0.02 : -0.012, y + 0.012, z + 0.012, IRON.shine);
    b.box(sx > 0 ? 0.012 : -0.08, 0.04, -0.025, sx > 0 ? 0.08 : -0.012, 0.07, 0.025, IRON.dark);
    b.pop();
  }
  // Chassis beams and axles.
  for (const z of [-0.17, 0.17]) b.box(-0.42, 0.11, z - 0.04, 0.42, floor, z + 0.04, IRON.dark);
  for (const x of [-0.25, 0.25]) b.box(x - 0.02, 0.1, -0.37, x + 0.02, 0.14, 0.37, IRON.light);
  // Spoked wheels; one has broken off, leaving a bare axle end.
  for (const [x, z] of [[-0.25, 0.32], [-0.25, -0.32], [0.25, -0.32]]) {
    b.push().translate(x, 0.12, z).rotateX(Math.PI / 2);
    ring(b, { sides: 8, radius: 0.105, thickness: 0.03, y0: -0.024, y1: 0.024, color: (i) => (i % 2 ? IRON.dark : IRON.mid) });
    b.box(-0.1, -0.012, -0.014, 0.1, 0.012, 0.014, IRON.mid);
    b.box(-0.014, -0.012, -0.1, 0.014, 0.012, 0.1, IRON.mid);
    disc(b, 0.035, -0.034, 0.034, IRON.light);
    b.pop();
  }
  b.pop();
  // The broken wheel lies on the floor: half a rim and a spoke.
  b.push().translate(0.7, 0, 0.3).rotateY(0.6);
  for (let i = 0; i < 4; i++) {
    const a0 = (i / 8) * Math.PI * 2;
    const a1 = ((i + 1) / 8) * Math.PI * 2;
    beam(b, Math.cos(a0) * 0.105, 0.02, Math.sin(a0) * 0.105, Math.cos(a1) * 0.105, 0.02, Math.sin(a1) * 0.105, 0.03, 0.04, IRON.dark);
  }
  b.box(-0.035, 0, -0.035, 0.035, 0.05, 0.035, IRON.light);
  beam(b, 0, 0.02, 0, 0.0, 0.02, 0.105, 0.024, 0.028, IRON.mid);
  b.pop();
  // Spilled ore and rubble in front of the opening.
  for (let i = 0; i < 7; i++) {
    const s = rng.range(0.06, 0.12);
    const x = rng.range(-0.3, 0.5);
    const z = rng.range(0.42, 0.7);
    const copper = i % 3 === 0;
    b.push().translate(x, 0, z).rotateY(rng.range(0, Math.PI));
    b.box(-s / 2, 0, -s / 2, s / 2, s * 0.8, s / 2, vary(SLATE[2 + (i % 2)], rng, 0.1));
    if (copper) b.box(-s / 4, s * 0.8, -s / 4, s / 6, s * 0.8 + 0.006, s / 6, COPPER.light);
    b.pop();
  }
  // A cracked rail sleeper.
  b.push().translate(-0.55, 0, 0.35).rotateY(1.2);
  b.box(-0.3, 0, -0.06, 0.12, 0.05, 0.06, WOOD.dark);
  b.box(0.15, 0, -0.06, 0.32, 0.045, 0.06, WOOD.dark);
  b.pop();
}
