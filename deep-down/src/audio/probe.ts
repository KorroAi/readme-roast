import type { BiomeId } from '../config/biomes';
import { B } from '../config/blocks';

/**
 * What the audio reads from the game (round 3, AUDIO), once per control tick (15 Hz): the biome and
 * stratum (the score and the beds), the danger around the explorer (the score's layers), a guardian
 * fight, the hazard meter, sound emitters near the listener (waterfalls, vents, lava, fires, torches),
 * what the sonar revealed (its echo pings), and the screen and mode (menus, the title, death).
 *
 * `gameAudioProbe(game)` reads the game by shape (game.strata, game.mobs, game.loop, game.vis,
 * game.ui, game.cameraRig, game.session, game.mode), lazily, so it never imports the hub and every
 * field it cannot find just reads as nothing. Game.ts attaches it in one marked AUDIO line.
 */

export type HazardName = 'cold' | 'gas' | 'heat' | 'dark';
export type EmitterKind = 'waterfall' | 'gasVent' | 'emberVent' | 'bubbles' | 'lava' | 'fire' | 'torch' | 'crystal';

export interface Emitter {
  kind: EmitterKind;
  x: number;
  y: number;
  z: number;
  /** Audible range (m): silent beyond it, full at a metre. */
  range: number;
  /** 0..1 */
  strength: number;
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
  /** Emitters within their range of the listener, the nearest (relative to range) first. */
  emitters: Emitter[];
  /** Sonar pings sent so far and what the last one revealed. */
  sonarPings: number;
  sonar: readonly SonarReveal[];
}

export type AudioProbe = () => AudioScene | null;

/** An empty scene (no game attached, or the title before a world exists). */
export function emptyScene(): AudioScene {
  return {
    mode: 'menu', screen: 'none', biome: null, stratum: 1, loading: false, lx: 0, ly: 0, lz: 0, rx: 1, rz: 0,
    danger: 0, engaged: 0, guardian: null, hazard: null, hazardLevel: 0, emitters: [], sonarPings: 0, sonar: [],
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

/** Which props sound, and how. */
const PROP_EMITTERS: Record<string, { kind: EmitterKind; range: number; strength: number }> = {
  waterfall: { kind: 'waterfall', range: 30, strength: 1 },
  gasVent: { kind: 'gasVent', range: 14, strength: 0.8 },
  emberVent: { kind: 'emberVent', range: 14, strength: 0.8 },
  bogBubble: { kind: 'bubbles', range: 12, strength: 0.7 },
  lavaGlow: { kind: 'lava', range: 22, strength: 0.75 },
  campfire: { kind: 'fire', range: 12, strength: 1 },
  crystalSpire: { kind: 'crystal', range: 9, strength: 0.6 },
  crystalCluster: { kind: 'crystal', range: 8, strength: 0.45 },
  geodeShards: { kind: 'crystal', range: 7, strength: 0.4 },
};

const CELL = 16;

/** A grid of the stratum's emitters (built once per layout), queried round the listener. */
export class EmitterIndex {
  private readonly cells = new Map<number, Emitter[]>();
  readonly count: number;

  constructor(props: readonly PropLike[], hazards: readonly HazardZoneLike[] = []) {
    let n = 0;
    const add = (e: Emitter) => {
      const key = cellKey(Math.floor(e.x / CELL), Math.floor(e.z / CELL));
      let list = this.cells.get(key);
      if (!list) this.cells.set(key, (list = []));
      list.push(e);
      n++;
    };
    for (const p of props) {
      const d = PROP_EMITTERS[p.kind];
      if (d) add({ kind: d.kind, x: p.x, y: p.y + 0.5, z: p.z, range: d.range, strength: d.strength });
    }
    for (const h of hazards) {
      if (h.kind === 'lava') add({ kind: 'lava', x: h.centre[0], y: h.centre[1], z: h.centre[2], range: h.radius + 14, strength: 0.6 + 0.4 * h.strength });
      else if (h.kind === 'gas') add({ kind: 'bubbles', x: h.centre[0], y: h.centre[1], z: h.centre[2], range: h.radius + 6, strength: 0.4 + 0.4 * h.strength });
    }
    this.count = n;
  }

  /** Emitters within their range of (x, y, z), nearest relative to range first, at most `max`. */
  near(x: number, y: number, z: number, max = 8, out: Emitter[] = []): Emitter[] {
    out.length = 0;
    const cx = Math.floor(x / CELL);
    const cz = Math.floor(z / CELL);
    for (let dz = -2; dz <= 2; dz++) {
      for (let dx = -2; dx <= 2; dx++) {
        const list = this.cells.get(cellKey(cx + dx, cz + dz));
        if (!list) continue;
        for (const e of list) if (Math.hypot(e.x - x, (e.y - y) * 1.3, e.z - z) < e.range) out.push(e);
      }
    }
    const rel = (e: Emitter) => Math.hypot(e.x - x, (e.y - y) * 1.3, e.z - z) / e.range;
    out.sort((a, b) => rel(a) - rel(b));
    if (out.length > max) out.length = max;
    return out;
  }
}

const cellKey = (cx: number, cz: number): number => (cx + 512) * 4096 + (cz + 512);

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

// ---------------------------------------------------------------------------------------
// The game, by shape

interface GameShape {
  mode?: string;
  ui?: { screen?: string };
  strata?: { current?: number; biomeHere?: BiomeId | null; busy?: boolean; layout?: { props?: readonly PropLike[]; hazards?: readonly HazardZoneLike[] } | null };
  mobs?: { list?: () => readonly MobLike[]; activeGuardian?: () => { kind?: string; phase?: number; phases?: number; hp?: number; max?: number } | null };
  loop?: { hazards?: { active?: HazardName | null; meter?: number } };
  vis?: { sonarState?: { pings?: number; last?: ReadonlyArray<{ x: number; y: number; z: number; kind?: string; rarity?: string | null; delay?: number }> } | null };
  cameraRig?: { camera?: { position?: { x: number; y: number; z: number }; matrixWorld?: { elements?: ArrayLike<number> } } };
  player?: { x: number; y: number; z: number };
  session?: { world?: { get(x: number, y: number, z: number): number }; layout?: { props?: readonly PropLike[] } };
}

/** The probe of a running Game (read by shape; see the file comment). */
export function gameAudioProbe(gameRef: unknown): AudioProbe {
  const scene = emptyScene();
  let index: EmitterIndex | null = null;
  let indexOf: unknown = null;
  let scanAt = 0;
  let scanned: Emitter[] = [];
  let tick = 0;
  const near: Emitter[] = [];
  return () => {
    const g = gameRef as GameShape;
    tick++;
    scene.mode = g.mode ?? 'boot';
    scene.screen = g.ui?.screen ?? 'none';
    const st = g.strata;
    scene.biome = st?.biomeHere ?? null;
    scene.stratum = st?.current ?? 1;
    scene.loading = st?.busy === true;
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
    // Hazards.
    const hz = g.loop?.hazards;
    scene.hazard = hz?.active ?? null;
    scene.hazardLevel = Number.isFinite(hz?.meter) ? Math.max(0, Math.min(1, hz!.meter!)) : 0;
    // Emitters: the stratum's props and pockets, plus torches and lava found in the voxels.
    const layout = st?.layout ?? g.session?.layout ?? null;
    if (layout !== indexOf) {
      indexOf = layout;
      index = layout ? new EmitterIndex(layout.props ?? [], (layout as { hazards?: readonly HazardZoneLike[] }).hazards ?? []) : null;
    }
    const world = g.session?.world;
    if (world && tick >= scanAt) {
      scanAt = tick + 8;
      scanned = scanVoxels((x, y, z) => world.get(x, y, z), scene.lx, scene.ly - 1, scene.lz);
    }
    index?.near(scene.lx, scene.ly, scene.lz, 8, near);
    if (!index) near.length = 0;
    for (const s of scanned) if (Math.hypot(s.x - scene.lx, s.y - scene.ly, s.z - scene.lz) < s.range) near.push(s);
    scene.emitters = near;
    // The sonar's last reveal.
    const sonar = g.vis?.sonarState;
    scene.sonarPings = sonar?.pings ?? 0;
    scene.sonar = (sonar?.last ?? []) as readonly SonarReveal[];
    return scene;
  };
}
