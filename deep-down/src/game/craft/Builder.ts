import { B, SOLID } from '../../config/blocks';
import type { StationId } from '../../config/stations';
import type { PropKind, PropSpec } from '../../world/gen/types';
import { PROP_KINDS } from '../../render/props/models';

/**
 * What the player builds, shown in the world (round 3, LOOP): a placed Furnace, Forge or Alchemy
 * Table, and an Outpost, rise out of the floor where they are set down (the 1.x camp stations' way,
 * game/Stations), keep a small glow (an ember voxel by the Furnace and the Forge, a lamp at an
 * outpost), and answer Interact: a station opens the Craft menu (its recipes are in reach), an
 * outpost is a place to rest (bed, bank, oil: game/Progression 'rest').
 *
 * Loop keeps the records per stratum (stations, outposts) and asks the Builder to show the current
 * stratum's; the props are re-added whenever a stratum is entered or restored (WORLD resets the
 * session's props from the layout on a switch).
 */
export interface BuilderSession {
  readonly liveProps: Map<string, PropSpec>;
  readonly props: { add(spec: PropSpec): void; remove(id: string): void; has(id: string): boolean; setLift(id: string, lift: number): void };
  readonly world: { get(x: number, y: number, z: number): number };
  setBlock(x: number, y: number, z: number, id: number): void;
  removeProp(id: string, updateLight?: boolean): unknown;
}

export interface BuilderHost {
  readonly session?: BuilderSession | null;
  markHalosDirty?(): void;
}

export interface BuiltThing {
  /** The prop id (stable: saves and the removal use it). */
  id: string;
  /** A station, an outpost, or 'decor' (the camp's upgrades: tents, lamps, trophies, the trader). */
  kind: StationId | 'outpost' | 'decor';
  x: number;
  y: number;
  z: number;
  rotY: number;
  /** Decor: the model and the one VIS already draws until it models `prop`. */
  prop?: string;
  fallback?: string;
  /** Decor: how it is used (none: ambient). */
  interact?: PropSpec['interact'];
  scale?: number;
  variant?: number;
  /** Decor: an emitter voxel (a lamp's light). */
  glow?: number;
  /** Find the floor near (x, y, z) first (decor placed by plan, not by the Place ray). */
  settle?: boolean;
}

/** The prop kind VIS models for each thing (render/props). */
export const BUILT_PROP: Record<Exclude<BuiltThing['kind'], 'decor'>, PropKind> = {
  hand: 'crate' as PropKind,
  workbench: 'workbench' as PropKind,
  furnace: 'furnace' as PropKind,
  forge: 'forge' as PropKind,
  alchemy: 'alchemyTable' as PropKind,
  // VIS models the trader's cart (19:57); the broken cart until a build without it.
  trader: 'traderCart' as PropKind,
  outpost: 'outpost' as PropKind,
};

/** How it is used (PropSpec.interact). */
const INTERACT: Record<Exclude<BuiltThing['kind'], 'decor'>, PropSpec['interact']> = {
  hand: 'craft',
  workbench: 'craft',
  furnace: 'craft',
  forge: 'craft',
  alchemy: 'craft',
  trader: 'craft',
  outpost: 'rest',
};

/** The glow each keeps: an emitter voxel in a free cell beside it. */
const GLOW: Partial<Record<BuiltThing['kind'], number>> = { furnace: B.LIGHT_EMBER, forge: B.LIGHT_EMBER, outpost: B.LIGHT_AMBER };

const MODELLED = new Set<string>(PROP_KINDS as string[]);

/** The model to draw: the wanted one once VIS models it, else its fallback (never a stand-in crate). */
export function modelOf(prop: string, fallback?: string): PropKind {
  return (MODELLED.has(prop) || !fallback ? prop : fallback) as PropKind;
}

/** Seconds a placed thing takes to rise out of the floor, and how deep it starts. */
const RISE_SECONDS = 0.9;
const RISE_DEPTH = 1.1;

export class Builder {
  /** Props rising: id → seconds left. */
  private readonly rising = new Map<string, number>();
  /** The props this builder put in the session (to take them out on a resync). */
  private readonly shown = new Set<string>();

  constructor(private readonly host: BuilderHost) {}

  /** Show one thing (`rise`: it comes up out of the floor). Idempotent per id. */
  show(thing: BuiltThing, rise = false): void {
    let t = thing;
    const s = this.host.session;
    if (!s) return;
    if (s.liveProps.has(t.id)) {
      this.shown.add(t.id);
      return;
    }
    if (t.settle) {
      const y = this.floorNear(s, t.x, t.y, t.z);
      if (y === null) return;
      t = { ...t, y };
    }
    const emitters: Array<[number, number, number]> = [];
    const glow = t.glow ?? GLOW[t.kind];
    if (glow !== undefined) {
      const cell = this.glowCell(s, t);
      if (cell) {
        emitters.push(cell);
        if (s.world.get(cell[0], cell[1], cell[2]) !== glow) s.setBlock(cell[0], cell[1], cell[2], glow);
      }
    }
    const decor = t.kind === 'decor';
    const spec: PropSpec = {
      id: t.id,
      kind: decor ? modelOf(t.prop ?? 'crate', t.fallback) : t.kind === 'trader' ? modelOf('traderCart', 'brokenCart') : BUILT_PROP[t.kind as Exclude<BuiltThing['kind'], 'decor'>],
      x: t.x,
      y: t.y,
      z: t.z,
      rotY: t.rotY,
      scale: t.scale ?? (t.kind === 'outpost' ? 1 : 0.9),
      // Built in place: it never settles when the floor round it is mined.
      anchor: null,
      emitters,
      ...(decor ? (t.interact ? { interact: t.interact } : {}) : { interact: INTERACT[t.kind as Exclude<BuiltThing['kind'], 'decor'>] }),
      seed: hashId(t.id),
      ...(t.variant !== undefined ? { modelVariant: t.variant } : {}),
    };
    s.liveProps.set(t.id, spec);
    s.props.add(spec);
    this.shown.add(t.id);
    if (rise) {
      s.props.setLift(t.id, -RISE_DEPTH);
      this.rising.set(t.id, RISE_SECONDS);
    }
    this.host.markHalosDirty?.();
  }

  /** Take a thing out of the world (packed up, or a resync). */
  hide(id: string): void {
    const s = this.host.session;
    this.rising.delete(id);
    this.shown.delete(id);
    if (s?.liveProps.has(id)) s.removeProp(id);
    this.host.markHalosDirty?.();
  }

  /** Show exactly these things (the current stratum's), taking out the ones this builder showed before. */
  sync(things: readonly BuiltThing[]): void {
    const want = new Set(things.map((t) => t.id));
    for (const id of [...this.shown]) if (!want.has(id)) this.hide(id);
    for (const t of things) this.show(t, false);
  }

  /** The rising animation. */
  update(dt: number): void {
    if (this.rising.size === 0 || !(dt > 0)) return;
    const s = this.host.session;
    for (const [id, left] of [...this.rising]) {
      const next = left - dt;
      if (next <= 0 || !s) {
        this.rising.delete(id);
        s?.props.setLift(id, 0);
        continue;
      }
      this.rising.set(id, next);
      const k = 1 - next / RISE_SECONDS;
      // Ease out: quick at first, settling softly.
      s.props.setLift(id, -RISE_DEPTH * (1 - k) * (1 - k));
    }
  }

  /** The standing height nearest y at (x, z): a free cell over a solid one, within 3 m (null: none). */
  private floorNear(s: BuilderSession, x: number, y: number, z: number): number | null {
    const cx = Math.floor(x);
    const cz = Math.floor(z);
    const y0 = Math.floor(y);
    for (const dy of [0, 1, -1, 2, -2, 3, -3]) {
      const yy = y0 + dy;
      if (!SOLID[s.world.get(cx, yy, cz)] && !SOLID[s.world.get(cx, yy + 1, cz)] && SOLID[s.world.get(cx, yy - 1, cz)]) return yy;
    }
    return null;
  }

  /** A free (non-solid, air) cell beside the thing for its glow voxel. */
  private glowCell(s: BuilderSession, t: BuiltThing): [number, number, number] | null {
    const x = Math.floor(t.x);
    const y = Math.floor(t.y);
    const z = Math.floor(t.z);
    const around: Array<[number, number]> = [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]];
    for (const dy of [1, 0]) {
      for (const [dx, dz] of around) {
        const id = s.world.get(x + dx, y + dy, z + dz);
        if (id === B.AIR && !SOLID[id]) return [x + dx, y + dy, z + dz];
      }
    }
    return null;
  }
}

function hashId(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return h >>> 0;
}
