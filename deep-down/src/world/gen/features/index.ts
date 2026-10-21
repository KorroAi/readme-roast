import { B, SOLID, isEmitter } from '../../../config/blocks';
import { hash32 } from '../../../core/math';
import { Noise } from '../../../core/noise';
import { Rng } from '../../../core/rng';
import type { VoxelWorld } from '../../VoxelWorld';
import type { PropSpec, Region, StructureSpec } from '../types';
import { buildExpanse, untrapFeatures } from './expanse';
import { buildPlaces } from './places';
import type { FeatureLayout, MothAnchorDef, V3 } from './types';

export type { FeatureLayout } from './types';

/**
 * What the feature pass gets from generateWorld: the world and the layout lists it appends to,
 * plus a few of the generator's deterministic helpers (they read noise, never the layout's rng).
 */
export interface FeatureCtx {
  world: VoxelWorld;
  seed: number;
  props: PropSpec[];
  structures: StructureSpec[];
  discoveries: Region[];
  landmarks: Record<string, V3>;
  /** Cells within r of c (with the generator's noisy edge). */
  blob(c: V3, r: number, fn: (x: number, y: number, z: number) => void): void;
  /** Host rock along a..b facing open space becomes crystal (at most `max` cells). */
  crystalSeam(a: V3, b: V3, r: number, max: number): number;
  /** Top of the ground at (x, z) near height y. */
  groundAt(x: number, z: number, y: number): number;
  /** Round 2 (WORLD): the spawn and the camp box, for the trap pass (expanse: untrapFeatures). */
  spawn?: { x: number; y: number; z: number };
  camp?: Region;
}

/**
 * The feature pass (final pass W2, world variety): the Halden Survey Office, the Moth Grotto, the
 * Halden Yard and its hoist, the Reliquary and the Lamp Gallery behind their rune doors, the rope
 * down to the rift floor and the black stone, the landing's survey post, and the living rock.
 *
 * It runs in generateWorld after the key-light pass and before the bedrock re-assert, with its own
 * random stream (seed ^ 0xfea70001), so nothing the generator placed before it moves: no existing
 * prop id, position or random draw changes, and it writes voxels only inside the boxes it declares
 * (tests/unit/worldFeatures.test.ts compares the world with and without it).
 */
export function buildFeatures(ctx: FeatureCtx): FeatureLayout {
  const b = new FeatureBuilder(ctx);
  buildPlaces(b);
  // Round 2 (WORLD): the vast, non-linear world round the first version's route.
  buildExpanse(b);
  // Then no pit may hold a player now that the pick cannot dig a way out (inside its own boxes).
  untrapFeatures(b);
  return b.layout;
}

/** Collects one pass's output and wraps the voxel and prop writes it needs. */
export class FeatureBuilder {
  readonly w: VoxelWorld;
  readonly rng: Rng;
  readonly noise: Noise;
  readonly layout: FeatureLayout = {
    boxes: [],
    pois: [],
    links: [],
    runeDoors: [],
    mothAnchors: [],
    living: [],
    blooms: [],
    areas: [],
    sockets: { fossil: [] },
    eventSites: [],
  };
  private readonly seq = new Map<string, number>();

  constructor(readonly ctx: FeatureCtx) {
    this.w = ctx.world;
    this.rng = new Rng(ctx.seed ^ 0xfea70001);
    this.noise = new Noise(ctx.seed ^ 0xfea7);
  }

  // ------------------------------------------------------------------------------------
  // Voxels

  interior(x: number, y: number, z: number): boolean {
    const w = this.w;
    return x > 0 && y > 0 && z > 0 && x < w.sx - 1 && y < w.sy - 1 && z < w.sz - 1;
  }

  get(x: number, y: number, z: number): number {
    return this.w.get(x, y, z);
  }

  isAir(x: number, y: number, z: number): boolean {
    return !SOLID[this.w.get(x, y, z)];
  }

  solid(x: number, y: number, z: number): boolean {
    return SOLID[this.w.get(x, y, z)] === 1;
  }

  /** Open a cell (never erasing a light another feature placed there). */
  carve(x: number, y: number, z: number): void {
    if (!this.interior(x, y, z)) return;
    const i = this.w.index(x, y, z);
    const cur = this.w.blocks[i];
    if (!SOLID[cur] && isEmitter(cur)) return;
    this.w.blocks[i] = B.AIR;
  }

  put(x: number, y: number, z: number, id: number): void {
    if (this.interior(x, y, z)) this.w.blocks[this.w.index(x, y, z)] = id;
  }

  /** Put an emitter in the open cell nearest (x, y, z) (radius 2), never over another light. */
  keyLight(x: number, y: number, z: number, id: number): V3 | null {
    for (let r = 0; r <= 2; r++)
      for (let dy = -r; dy <= r; dy++)
        for (let dz = -r; dz <= r; dz++)
          for (let dx = -r; dx <= r; dx++) {
            if (Math.max(Math.abs(dx), Math.abs(dy), Math.abs(dz)) !== r) continue;
            const cx = x + dx;
            const cy = y + dy;
            const cz = z + dz;
            const id0 = this.get(cx, cy, cz);
            if (SOLID[id0] || isEmitter(id0) || !this.interior(cx, cy, cz)) continue;
            this.put(cx, cy, cz, id);
            return [cx, cy, cz];
          }
    return null;
  }

  // ------------------------------------------------------------------------------------
  // Layout records

  box(id: string, min: V3, max: V3): void {
    this.layout.boxes.push({ id, min, max });
  }

  poi(id: string, p: V3, kind: 'sight' | 'pickup' | 'landmark', mustReach = true): void {
    this.layout.pois.push({ id, p, kind, mustReach });
  }

  landmark(name: string, p: V3): void {
    this.ctx.landmarks[name] = p;
  }

  moths(id: string, p: V3, count: number, radius = 1.1, secret = false): void {
    const a: MothAnchorDef = { id, p, count, radius };
    if (secret) a.secret = true;
    this.layout.mothAnchors.push(a);
  }

  discovery(id: string, min: V3, max: V3): void {
    this.ctx.discoveries.push({ id, min, max });
  }

  /** A prop with an id in the feature namespace (f_<place>_<n>) and a seed from this pass's stream. */
  prop(place: string, p: Omit<PropSpec, 'id' | 'seed' | 'emitters' | 'rotY' | 'scale' | 'anchor'> & Partial<PropSpec> & { variant?: [number, number]; light?: number }): PropSpec {
    const n = this.seq.get(place) ?? 0;
    this.seq.set(place, n + 1);
    let seed = this.rng.int(0, 1 << 30);
    // A chosen variant (index, count): step the seed until the renderer's pick (hash32(seed) % count) matches.
    if (p.variant) while (hash32(seed) % p.variant[1] !== p.variant[0]) seed++;
    const { variant: _v, light, ...rest } = p;
    const spec: PropSpec = {
      id: `f_${place}_${n}`,
      rotY: 0,
      scale: 1,
      anchor: [Math.floor(p.x), Math.floor(p.y) - 1, Math.floor(p.z)],
      emitters: [],
      seed,
      ...rest,
    };
    for (const [ex, ey, ez] of spec.emitters) {
      if (this.isAir(ex, ey, ez)) this.put(ex, ey, ez, light ?? B.LIGHT_AMBER);
    }
    this.ctx.props.push(spec);
    return spec;
  }

  /** A lantern post on the floor at or below (x, y, z) (or exactly at y), with its emitter. */
  lamp(place: string, x: number, y: number, z: number, rotY: number, light: number = B.LIGHT_LAMP, exact = false): PropSpec | null {
    const ex = Math.floor(x);
    const ez = Math.floor(z);
    let fy = exact ? y : Math.floor(y) + 3;
    if (!exact) {
      while (fy > Math.floor(y) - 4 && !(this.isAir(ex, fy, ez) && !this.isAir(ex, fy - 1, ez))) fy--;
      if (fy <= Math.floor(y) - 4) return null;
    }
    const ey = Math.floor(fy) + 1;
    return this.prop(place, { kind: 'lanternPost', x, y: fy, z, rotY, emitters: this.isAir(ex, ey, ez) ? [[ex, ey, ez]] : [], light });
  }

  structure(s: StructureSpec): void {
    this.ctx.structures.push(s);
  }

  beam(id: string, a: V3, bb: V3, w: number, h: number, splinter: 0 | 1 | 2 = 0, roll = 0): void {
    this.structure({ kind: 'beam', id, a, b: bb, w, h, splinter, roll, seed: this.rng.int(0, 1 << 30) });
  }

  /** A prop kind's base height on the floor under (x, z) near y. */
  ground(x: number, z: number, y: number): number {
    return this.ctx.groundAt(Math.floor(x), Math.floor(z), y);
  }
}
