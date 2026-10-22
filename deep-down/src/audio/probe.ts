import type { BiomeId } from '../config/biomes';
import { B, SOLID } from '../config/blocks';

/**
 * What the audio reads from the game (round 3, AUDIO), once per control tick (15 Hz): the biome and
 * stratum (the score and the beds), the danger around the explorer (the score's layers), a guardian
 * fight, the hazard meter, the sound features near the listener (the vista's fall, the river,
 * cascades, vents, lava, braziers, lamps, torches, crystals, drips, ice...), what the sonar revealed
 * (its echo pings), and the screen and mode (menus, the title, death).
 *
 * `gameAudioProbe(game)` reads the game by shape (game.strata, game.mobs, game.loop, game.vis,
 * game.ui, game.cameraRig, game.session, game.mode), lazily, so it never imports the hub and every
 * field it cannot find just reads as nothing. Game.ts attaches it in one marked AUDIO line.
 */

export type HazardName = 'cold' | 'gas' | 'heat' | 'dark';

/**
 * The features that sound. Loops (built while audible): falls, the river, vents, bubbling pools,
 * lava, fires, braziers, lamps, torches, crystals, the void's spires, a ravine's updraft. One-shots
 * only: drips, spore puffs, ice, mine timbers, rubble.
 */
export type EmitterKind =
  | 'waterfall' | 'cascade' | 'river' | 'gasVent' | 'emberVent' | 'bubbles' | 'lava' | 'lavaFall'
  | 'fire' | 'brazier' | 'lamp' | 'torch' | 'crystal' | 'void' | 'draft'
  | 'drips' | 'spores' | 'ice' | 'timber' | 'rubble';

export const EMITTER_KINDS: readonly EmitterKind[] = [
  'waterfall', 'cascade', 'river', 'gasVent', 'emberVent', 'bubbles', 'lava', 'lavaFall', 'fire', 'brazier', 'lamp', 'torch', 'crystal', 'void', 'draft',
  'drips', 'spores', 'ice', 'timber', 'rubble',
];

/** A sound source in the world: a point, or a segment (a fall: the sound comes from its nearest point). */
export interface Emitter {
  kind: EmitterKind;
  x: number;
  y: number;
  z: number;
  /** A segment's other end (falls). */
  x2?: number;
  y2?: number;
  z2?: number;
  /** Audible range (m): silent beyond it, full at a metre. */
  range: number;
  /** 0..1 */
  strength: number;
}

/** The nearest emitter of a kind as heard from the listener this tick. */
export interface HeardEmitter {
  kind: EmitterKind;
  /** The point it is heard from (a segment's nearest point). */
  x: number;
  y: number;
  z: number;
  /** Distance (m, height weighted) and its range. */
  d: number;
  range: number;
  strength: number;
  /** 0..1: how much rock lies on the line from the ear to it (muffled and quieter). */
  occlusion: number;
}

export interface SonarReveal {
  x: number;
  y: number;
  z: number;
  kind: string;
  rarity: string | null;
  /** Seconds after the ping that the shell reaches it. */
  delay: number;
}

export interface GuardianFight {
  kind: string;
  phase: number;
  phases: number;
  hp: number;
  max: number;
}

export interface AudioScene {
  /** Game mode: 'menu' (the title), 'playing', 'paused', 'dead', 'boot'... */
  mode: string;
  /** The open screen ('none' while playing freely). */
  screen: string;
  biome: BiomeId | null;
  stratum: number;
  /** The strata world is loaded (false: the old hand-made world, which has no biomes). */
  strata: boolean;
  /** A stratum switch is loading. */
  loading: boolean;
  /** The listener (the eye) and its right vector on the floor plane (for panning). */
  lx: number;
  ly: number;
  lz: number;
  rx: number;
  rz: number;
  /** 0..1: monsters near, weighted by distance and intent (a wind-up counts most). */
  danger: number;
  /** Monsters winding up, attacking or stalking within 10 m. */
  engaged: number;
  guardian: GuardianFight | null;
  hazard: HazardName | null;
  /** 0..1 the hazard meter's build-up. */
  hazardLevel: number;
  /** The nearest emitter of each kind in range, the most audible first. */
  emitters: HeardEmitter[];
  /** The explorer's health 0..1 (1 when unknown). */
  health: number;
  /** On a ladder or a rope (and how fast, m/s up or down), or null. */
  climbing: 'ladder' | 'rope' | null;
  climbSpeed: number;
  /** Sonar pings sent so far and what the last one revealed. */
  sonarPings: number;
  sonar: readonly SonarReveal[];
  /** VIS's sulphur geysers: the columns so far, and the one standing now (with how much rock is between). */
  geysers: number;
  geyser: { x: number; y: number; z: number; occlusion: number } | null;
}

export type AudioProbe = () => AudioScene | null;

/** An empty scene (no game attached, or the title before a world exists). */
export function emptyScene(): AudioScene {
  return {
    mode: 'menu', screen: 'none', biome: null, stratum: 1, strata: false, loading: false, lx: 0, ly: 0, lz: 0, rx: 1, rz: 0,
    danger: 0, engaged: 0, guardian: null, hazard: null, hazardLevel: 0, emitters: [], health: 1, climbing: null, climbSpeed: 0, sonarPings: 0, sonar: [],
    geysers: 0, geyser: null,
  };
}

// ---------------------------------------------------------------------------------------
// Danger

interface MobLike {
  hostile?: boolean;
  state?: string;
  rank?: string;
  position?: { x: number; y: number; z: number };
}

/** How much a mob's state says "it is coming for you". */
const INTENT: Record<string, number> = {
  windup: 1, attack: 1, stalk: 0.75, lurk: 0.4, burrow: 0.45, wake: 0.6, recoil: 0.3, flee: 0.15, stunned: 0.3,
  idle: 0.3, wander: 0.3, follow: 0, sleep: 0, caught: 0, harvested: 0, dying: 0,
};

/**
 * Danger 0..1 from the mobs around (x, y, z): a probabilistic OR of each hostile mob's intent times
 * its nearness (full inside 6 m, nothing beyond 24 m), and how many are engaged within 10 m.
 */
export function dangerOf(mobs: readonly MobLike[], x: number, y: number, z: number): { danger: number; engaged: number } {
  let calm = 1;
  let engaged = 0;
  for (const m of mobs) {
    if (!m.hostile || !m.position || m.rank === 'guardian' || m.rank === 'boss') continue;
    const intent = INTENT[m.state ?? 'idle'] ?? 0.3;
    if (intent <= 0) continue;
    const d = Math.hypot(m.position.x - x, (m.position.y - y) * 1.5, m.position.z - z);
    if (d >= 24) continue;
    const near = d <= 6 ? 1 : 1 - (d - 6) / 18;
    const w = Math.min(0.9, intent * near * near * (3 - 2 * near) * (near > 0 ? 1 : 0));
    calm *= 1 - w;
    if (d < 10 && intent >= 0.75) engaged++;
  }
  return { danger: 1 - calm, engaged };
}

// ---------------------------------------------------------------------------------------
// Emitters

interface PropLike {
  kind: string;
  x: number;
  y: number;
  z: number;
}

interface HazardZoneLike {
  kind: string;
  centre: readonly number[];
  radius: number;
  strength: number;
}

interface FallLike {
  kind: string;
  top: readonly number[];
  bottom: readonly number[];
  width?: number;
}

interface RiverLike {
  kind: string;
  points: ReadonlyArray<readonly number[]>;
}

/** What a stratum's layout offers the ear (read by shape). */
export interface SoundingLayout {
  props?: readonly PropLike[];
  hazards?: readonly HazardZoneLike[];
  falls?: readonly FallLike[];
  rivers?: readonly RiverLike[];
}

/** Which props sound, and how (WORLD's, LOOP's and VIS's prop kinds; anything else is silent). */
export const PROP_EMITTERS: Record<string, { kind: EmitterKind; range: number; strength: number }> = {
  // Water: a prop 'waterfall' is a small fall off a ledge (dozens in the grottoes); the vista's
  // great fall comes from layout.falls.
  waterfall: { kind: 'cascade', range: 13, strength: 0.6 },
  gasVent: { kind: 'gasVent', range: 14, strength: 0.8 },
  emberVent: { kind: 'emberVent', range: 14, strength: 0.8 },
  bogBubble: { kind: 'bubbles', range: 12, strength: 0.7 },
  lavaGlow: { kind: 'lava', range: 16, strength: 0.6 },
  // Fire: the camp's, a lair's braziers, the forges and furnaces placed; lamps and lanterns hiss.
  campfire: { kind: 'fire', range: 12, strength: 1 },
  lairBrazier: { kind: 'brazier', range: 9, strength: 0.6 },
  furnace: { kind: 'brazier', range: 7, strength: 0.45 },
  forge: { kind: 'brazier', range: 7, strength: 0.45 },
  lanternPost: { kind: 'lamp', range: 5, strength: 0.5 },
  hangingLantern: { kind: 'lamp', range: 5, strength: 0.4 },
  outpost: { kind: 'lamp', range: 6, strength: 0.55 },
  // Crystals ring, the void's spires hum.
  crystalSpire: { kind: 'crystal', range: 9, strength: 0.6 },
  crystalCluster: { kind: 'crystal', range: 8, strength: 0.45 },
  geodeShards: { kind: 'crystal', range: 7, strength: 0.4 },
  voidSpire: { kind: 'void', range: 10, strength: 0.5 },
  // One-shots: amber resin dripping, mushrooms puffing spores, icicles, the mines' timbers.
  amberDrip: { kind: 'drips', range: 7, strength: 0.8 },
  sporePuff: { kind: 'spores', range: 8, strength: 0.8 },
  icicle: { kind: 'ice', range: 8, strength: 0.7 },
  iceSpike: { kind: 'ice', range: 7, strength: 0.5 },
  timberProp: { kind: 'timber', range: 9, strength: 0.6 },
};

/** A river is heard from points this far apart along its course (the nearest one answers). */
const RIVER_STEP = 3.6;
const CELL = 16;

const cellKey = (cx: number, cz: number): number => (cx + 512) * 4096 + (cz + 512);

/** The nearest point of segment a-b to p (falls). */
function nearestOnSegment(e: Emitter, x: number, y: number, z: number): [number, number, number] {
  if (e.x2 === undefined || e.y2 === undefined || e.z2 === undefined) return [e.x, e.y, e.z];
  const dx = e.x2 - e.x;
  const dy = e.y2 - e.y;
  const dz = e.z2 - e.z;
  const len2 = dx * dx + dy * dy + dz * dz;
  const t = len2 > 1e-6 ? Math.max(0, Math.min(1, ((x - e.x) * dx + (y - e.y) * dy + (z - e.z) * dz) / len2)) : 0;
  return [e.x + dx * t, e.y + dy * t, e.z + dz * t];
}

/** Height counts a little more than plan distance (sound in a cave travels along it, not through floors). */
const earDistance = (x: number, y: number, z: number, px: number, py: number, pz: number): number => Math.hypot(px - x, (py - y) * 1.3, pz - z);

/**
 * A stratum's emitters (built once per layout): the props that sound, the falls (segments), the
 * rivers (points along their course), and the hazard zones (lava, gas pools, a ravine's updraft, the
 * mines' rubble, the void). Small ranges sit in a 16 m grid; the long-range ones in a list.
 */
export class EmitterIndex {
  private readonly cells = new Map<number, Emitter[]>();
  private readonly wide: Emitter[] = [];
  readonly count: number;
  readonly byKind: Partial<Record<EmitterKind, number>> = {};

  constructor(layoutOrProps: SoundingLayout | readonly PropLike[], hazards: readonly HazardZoneLike[] = []) {
    const layout: SoundingLayout = Array.isArray(layoutOrProps) ? { props: layoutOrProps as readonly PropLike[], hazards } : (layoutOrProps as SoundingLayout);
    let n = 0;
    const add = (e: Emitter) => {
      if (!Number.isFinite(e.x) || !Number.isFinite(e.z) || !(e.range > 0)) return;
      n++;
      this.byKind[e.kind] = (this.byKind[e.kind] ?? 0) + 1;
      if (e.range > CELL * 1.5 || e.x2 !== undefined) {
        this.wide.push(e);
        return;
      }
      const key = cellKey(Math.floor(e.x / CELL), Math.floor(e.z / CELL));
      let list = this.cells.get(key);
      if (!list) this.cells.set(key, (list = []));
      list.push(e);
    };
    for (const p of layout.props ?? []) {
      const d = PROP_EMITTERS[p.kind];
      if (d) add({ kind: d.kind, x: p.x, y: p.y + 0.5, z: p.z, range: d.range, strength: d.strength });
    }
    for (const f of layout.falls ?? []) {
      if (f.top.length < 3 || f.bottom.length < 3) continue;
      const lava = f.kind === 'lava';
      // A fall carries as far as it is tall: the vista's great fall (about 14 m) fills the hall, a 4-7 m
      // spring fall at a river's head (layout.falls ids spring_*) only its stretch of tunnel.
      const tall = Math.min(1, Math.max(0, f.top[1] - f.bottom[1]) / 14);
      add({ kind: lava ? 'lavaFall' : 'waterfall', x: f.top[0], y: f.top[1], z: f.top[2], x2: f.bottom[0], y2: f.bottom[1], z2: f.bottom[2], range: (lava ? 40 : 46) * (0.45 + 0.55 * tall), strength: 0.55 + 0.45 * tall });
    }
    for (const r of layout.rivers ?? []) {
      const lava = r.kind === 'lava';
      let since = Infinity;
      let prev: readonly number[] | null = null;
      for (const p of r.points) {
        if (p.length < 3) continue;
        if (prev) since += Math.hypot(p[0] - prev[0], p[2] - prev[2]);
        prev = p;
        if (since < RIVER_STEP) continue;
        since = 0;
        add({ kind: lava ? 'lava' : 'river', x: p[0], y: p[1] + 0.3, z: p[2], range: lava ? 18 : 15, strength: lava ? 0.75 : 0.7 });
      }
    }
    for (const h of layout.hazards ?? []) {
      if (h.centre.length < 3) continue;
      const [x, y, z] = h.centre;
      const s = Math.max(0, Math.min(1, h.strength));
      if (h.kind === 'lava') add({ kind: 'lava', x, y, z, range: h.radius + 14, strength: 0.6 + 0.4 * s });
      else if (h.kind === 'gas') add({ kind: 'bubbles', x, y, z, range: h.radius + 6, strength: 0.4 + 0.4 * s });
      else if (h.kind === 'falls') add({ kind: 'draft', x, y, z, range: h.radius + 12, strength: 0.6 });
      else if (h.kind === 'rockfall') add({ kind: 'rubble', x, y, z, range: h.radius + 6, strength: 0.7 });
      else if (h.kind === 'void') add({ kind: 'void', x, y, z, range: h.radius + 8, strength: 0.5 + 0.3 * s });
    }
    this.count = n;
  }

  /**
   * The nearest emitter of each kind within its range of (x, y, z) (relative to its range), as
   * heard from there, at most `max`, the nearest-relative first. `extra` (torches and lava found in
   * the voxels) joins in. Reuses `out`.
   */
  near(x: number, y: number, z: number, max = 12, out: HeardEmitter[] = [], extra: readonly Emitter[] = []): HeardEmitter[] {
    out.length = 0;
    const best = new Map<EmitterKind, { e: Emitter; rel: number; px: number; py: number; pz: number; d: number }>();
    const consider = (e: Emitter) => {
      const [px, py, pz] = nearestOnSegment(e, x, y, z);
      const d = earDistance(x, y, z, px, py, pz);
      if (d >= e.range) return;
      const rel = d / e.range;
      const b = best.get(e.kind);
      if (!b || rel < b.rel) best.set(e.kind, { e, rel, px, py, pz, d });
    };
    const cx = Math.floor(x / CELL);
    const cz = Math.floor(z / CELL);
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        const list = this.cells.get(cellKey(cx + dx, cz + dz));
        if (list) for (const e of list) consider(e);
      }
    }
    for (const e of this.wide) consider(e);
    for (const e of extra) consider(e);
    for (const [kind, b] of best) out.push({ kind, x: b.px, y: b.py, z: b.pz, d: b.d, range: b.e.range, strength: b.e.strength, occlusion: 0 });
    out.sort((a, b) => a.d / a.range - b.d / b.range);
    if (out.length > max) out.length = max;
    return out;
  }
}

/** The nearest placed torch and lava cell round (x, y, z), scanned in the voxels (cheap: twice a second). */
export function scanVoxels(get: (x: number, y: number, z: number) => number, x: number, y: number, z: number): Emitter[] {
  const out: Emitter[] = [];
  const fx = Math.floor(x);
  const fy = Math.floor(y);
  const fz = Math.floor(z);
  let torch: Emitter | null = null;
  let torchD = Infinity;
  for (let dy = -3; dy <= 4; dy++) {
    for (let dz = -6; dz <= 6; dz++) {
      for (let dx = -6; dx <= 6; dx++) {
        if (get(fx + dx, fy + dy, fz + dz) !== B.TORCH) continue;
        const d = Math.hypot(dx, dy, dz);
        if (d < torchD) {
          torchD = d;
          torch = { kind: 'torch', x: fx + dx + 0.5, y: fy + dy + 0.5, z: fz + dz + 0.5, range: 7, strength: 0.7 };
        }
      }
    }
  }
  if (torch) out.push(torch);
  let lava: Emitter | null = null;
  let lavaD = Infinity;
  for (let dy = -6; dy <= 3; dy += 1) {
    for (let dz = -14; dz <= 14; dz += 2) {
      for (let dx = -14; dx <= 14; dx += 2) {
        if (get(fx + dx, fy + dy, fz + dz) !== B.LAVA) continue;
        const d = Math.hypot(dx, dy, dz);
        if (d < lavaD) {
          lavaD = d;
          lava = { kind: 'lava', x: fx + dx + 0.5, y: fy + dy + 0.5, z: fz + dz + 0.5, range: 18, strength: 0.9 };
        }
      }
    }
  }
  if (lava) out.push(lava);
  return out;
}

/**
 * How much rock lies on the straight line from the ear to a source: the share of solid cells sampled
 * every metre between them (the last metre at each end skipped: a torch's own wall, the floor under
 * the ear). 0: in the open; 1: through solid rock.
 */
export function occlusionOf(get: (x: number, y: number, z: number) => number, ax: number, ay: number, az: number, bx: number, by: number, bz: number): number {
  const d = Math.hypot(bx - ax, by - ay, bz - az);
  const steps = Math.min(40, Math.floor(d));
  if (steps < 3) return 0;
  let solid = 0;
  let n = 0;
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    const b = get(Math.floor(ax + (bx - ax) * t), Math.floor(ay + (by - ay) * t), Math.floor(az + (bz - az) * t));
    n++;
    if (b > 0 && b < SOLID.length && SOLID[b]) solid++;
  }
  // Two metres of rock already muffle most of it; a thin rim of stone at a corner only a little.
  return n > 0 ? Math.min(1, solid / Math.max(2, n * 0.5)) : 0;
}

// ---------------------------------------------------------------------------------------
// The game, by shape

interface GameShape {
  mode?: string;
  ui?: { screen?: string };
  strata?: { current?: number; biomeHere?: BiomeId | null; busy?: boolean; layout?: SoundingLayout | null };
  mobs?: { list?: () => readonly MobLike[]; activeGuardian?: () => { kind?: string; phase?: number; phases?: number; hp?: number; max?: number } | null };
  loop?: { hazards?: { active?: HazardName | null; meter?: number } };
  vis?: {
    sonarState?: { pings?: number; last?: ReadonlyArray<{ x: number; y: number; z: number; kind?: string; rarity?: string | null; delay?: number }> } | null;
    geysers?: { active?: readonly number[] | null; eruptions?: number } | null;
  };
  cameraRig?: { camera?: { position?: { x: number; y: number; z: number }; matrixWorld?: { elements?: ArrayLike<number> } } };
  player?: { x: number; y: number; z: number; climbing?: boolean; vy?: number };
  health?: { fraction?: number };
  session?: { world?: { get(x: number, y: number, z: number): number }; layout?: SoundingLayout };
}

/** The probe of a running Game (read by shape; see the file comment). */
export function gameAudioProbe(gameRef: unknown): AudioProbe {
  const scene = emptyScene();
  let index: EmitterIndex | null = null;
  let indexOf: unknown = null;
  let scanAt = 0;
  let scanned: Emitter[] = [];
  let tick = 0;
  const heard: HeardEmitter[] = [];
  /** Each kind's occlusion, measured a few times a second (it changes as slowly as the explorer walks). */
  const occluded = new Map<EmitterKind, number>();
  let geyserCount = -1;
  return () => {
    const g = gameRef as GameShape;
    tick++;
    scene.mode = g.mode ?? 'boot';
    scene.screen = g.ui?.screen ?? 'none';
    const st = g.strata;
    scene.biome = st?.biomeHere ?? null;
    scene.stratum = st?.current ?? 1;
    scene.loading = st?.busy === true;
    scene.strata = !!st?.layout || scene.loading;
    const cam = g.cameraRig?.camera;
    const p = cam?.position ?? g.player;
    if (p && Number.isFinite(p.x)) {
      scene.lx = p.x;
      scene.ly = p.y;
      scene.lz = p.z;
    }
    const e = cam?.matrixWorld?.elements;
    if (e && Number.isFinite(e[0]) && Number.isFinite(e[2])) {
      const l = Math.hypot(e[0], e[2]) || 1;
      scene.rx = e[0] / l;
      scene.rz = e[2] / l;
    }
    // Danger and a guardian fight.
    const mobs = g.mobs?.list?.() ?? [];
    const d = dangerOf(mobs, scene.lx, scene.ly - 1.6, scene.lz);
    scene.danger = d.danger;
    scene.engaged = d.engaged;
    const gs = g.mobs?.activeGuardian?.() ?? null;
    scene.guardian = gs ? { kind: gs.kind ?? 'guardian', phase: gs.phase ?? 1, phases: gs.phases ?? 2, hp: gs.hp ?? 1, max: gs.max ?? 1 } : null;
    // Health.
    const hp = g.health?.fraction;
    scene.health = Number.isFinite(hp) ? Math.max(0, Math.min(1, hp!)) : 1;
    // Hazards.
    const hz = g.loop?.hazards;
    scene.hazard = hz?.active ?? null;
    scene.hazardLevel = Number.isFinite(hz?.meter) ? Math.max(0, Math.min(1, hz!.meter!)) : 0;
    // Emitters: the stratum's features, plus torches and lava found in the voxels.
    const layout = st?.layout ?? g.session?.layout ?? null;
    if (layout !== indexOf) {
      indexOf = layout;
      index = layout ? new EmitterIndex(layout) : null;
      occluded.clear();
    }
    const world = g.session?.world;
    if (world && tick >= scanAt) {
      scanAt = tick + 8;
      scanned = scanVoxels((x, y, z) => world.get(x, y, z), scene.lx, scene.ly - 1, scene.lz);
    }
    if (index) index.near(scene.lx, scene.ly, scene.lz, 12, heard, scanned);
    else heard.length = 0;
    if (world) {
      const fresh = tick % 4 === 0;
      for (const h of heard) {
        let o = occluded.get(h.kind);
        if (o === undefined || fresh) {
          o = occlusionOf((x, y, z) => world.get(x, y, z), scene.lx, scene.ly, scene.lz, h.x, h.y, h.z);
          occluded.set(h.kind, o);
        }
        h.occlusion = o;
      }
    }
    scene.emitters = heard;
    // Climbing: what the hands hold (the ladder or rope cell at the chest, else at the feet).
    const pl = g.player;
    scene.climbing = null;
    scene.climbSpeed = 0;
    if (pl?.climbing && world) {
      const at = (dy: number) => world.get(Math.floor(pl.x), Math.floor(pl.y + dy), Math.floor(pl.z));
      const b = at(1.1) === B.ROPE || at(0.2) === B.ROPE ? B.ROPE : at(1.1) === B.LADDER || at(0.2) === B.LADDER ? B.LADDER : B.AIR;
      scene.climbing = b === B.ROPE ? 'rope' : b === B.LADDER ? 'ladder' : null;
      scene.climbSpeed = Number.isFinite(pl.vy) ? pl.vy! : 0;
    }
    // The sonar's last reveal.
    const sonar = g.vis?.sonarState;
    scene.sonarPings = sonar?.pings ?? 0;
    scene.sonar = (sonar?.last ?? []) as readonly SonarReveal[];
    // VIS's geysers (the Sulphur Bog's vents): the column standing now, the rock before it measured once.
    const gy = g.vis?.geysers;
    const erupted = Number.isFinite(gy?.eruptions) ? gy!.eruptions! : 0;
    const vent = gy?.active;
    if (vent && vent.length >= 3 && Number.isFinite(vent[0]) && Number.isFinite(vent[1]) && Number.isFinite(vent[2])) {
      if (erupted !== geyserCount || !scene.geyser) {
        const [vx, vy, vz] = [vent[0], vent[1] + 0.5, vent[2]];
        scene.geyser = { x: vx, y: vy, z: vz, occlusion: world ? occlusionOf((x, y, z) => world.get(x, y, z), scene.lx, scene.ly, scene.lz, vx, vy, vz) : 0 };
      }
    } else scene.geyser = null;
    geyserCount = erupted;
    scene.geysers = erupted;
    return scene;
  };
}
