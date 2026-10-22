import { B, SOLID } from '../config/blocks';
import { RARITIES, RARITY_CODE, RARITY_RANK, rarityOf, type Rarity } from '../config/rarity';
import type { PropSpec } from '../world/gen/types';
import type { VoxelWorld } from '../world/VoxelWorld';
import type { HighlightSystem } from './highlight';
import type { RevealCell, RevealKind } from './reveal';
import type { TerrainRig } from './terrainRig';

/**
 * Round 3 (VIS seam): the sonar, the lantern's pulse.
 *
 * `ping(origin, radius)` sends a ring of pale-gold light out from the lantern over the rock (the
 * terrain shader draws the shell where it crosses a surface: uSonar / uSonarFx), and as the shell
 * reaches them, the ore veins, chests, lairs, the gate, journal pages, cracked walls and outposts
 * within the radius show through the rock for SONAR.seconds (HighlightSystem.reveal). It returns
 * what it revealed, so callers can mark lairs on the map (WORLD) or count a scan (LOOP).
 *
 * The cooldown and the button are UI's (src/ui/hud/actions.ts `sonar`); this is the effect.
 *
 * Wiring (Game.ts VIS block): `const sonar = new SonarPulse({ terrain, highlight, world, liveProps,
 * usable, marks })`; `sonar.update(dt, time)` each frame; `sonar.ping(eye, SONAR.radius)` on
 * 'player:sonar'.
 */

export const SONAR = {
  /** Reach (m). */
  radius: 24,
  /** Speed of the shell (m/s): the edge reaches 24 m in under a second. */
  speed: 28,
  /** How long a find stays visible once the shell has reached it (s). */
  seconds: 2,
  /** Width of the bright line (m). */
  band: 1.3,
  /** At most this many marks (the rarest and nearest first). */
  maxMarks: 64,
  /** How long glowing things keep the wave's light after the sweep (s). */
  afterglow: 2.4,
} as const;

/** Something the sonar finds that is not a voxel or a prop (WORLD's lairs, the gate, pages, outposts). */
export interface SonarMark {
  x: number;
  y: number;
  z: number;
  kind: RevealKind;
  rarity?: Rarity | null;
}

export interface SonarOptions {
  terrain: TerrainRig;
  highlight: HighlightSystem;
  world: () => VoxelWorld;
  liveProps?: () => Iterable<PropSpec>;
  /** A prop with nothing left to give (an opened chest) returns false and is not revealed. */
  usable?: (spec: PropSpec) => boolean;
  marks?: () => Iterable<SonarMark>;
}

/** Common filler finds that do not need the sonar (rubble, roots, vines, mushroom caps). */
const FILLER = new Uint8Array(256);
const bByName = B as unknown as Record<string, number>;
for (const k of ['RUBBLE', 'ROOTS', 'GLOW_VINE', 'MUSHROOM_CAP_TEAL', 'MUSHROOM_CAP_MAGENTA']) if (bByName[k] !== undefined) FILLER[bByName[k]] = 1;
/** Cracked walls hide vaults: a secret mark. */
const SECRET = new Uint8Array(256);
if (bByName.CRACKED_WALL !== undefined) SECRET[bByName.CRACKED_WALL] = 1;

/** The prop kinds that read as a chest, a page or an outpost. */
function propKind(spec: PropSpec): RevealKind | null {
  const k = spec.kind as string;
  if (k === 'chest' || k === 'crate' || spec.interact === 'storage' || spec.feature?.kind === 'cache') return 'chest';
  if (k === 'haldenNote' || k === 'journalPage' || spec.feature?.kind === 'note') return 'page';
  if (k === 'outpost' || k === 'outpostKit') return 'outpost';
  return null;
}

/**
 * The finds in a sphere (pure; unit-tested): one mark per connected vein (same block, 6-connected,
 * at its centroid, sized by its cell count) plus cracked walls, nearest-and-rarest first.
 */
export function scanFinds(world: VoxelWorld, ox: number, oy: number, oz: number, radius: number, max: number = SONAR.maxMarks): RevealCell[] {
  const r = Math.max(1, Math.ceil(radius));
  const n = 2 * r + 1;
  const x0 = Math.floor(ox) - r;
  const y0 = Math.floor(oy) - r;
  const z0 = Math.floor(oz) - r;
  const seen = new Uint8Array(n * n * n);
  const r2 = radius * radius;
  const out: Array<RevealCell & { rank: number; d: number }> = [];
  const stack: number[] = [];
  const blocks = world.blocks;
  const { sx, sy, sz } = world;
  const idAt = (lx: number, ly: number, lz: number): number => {
    const wx = x0 + lx;
    const wy = y0 + ly;
    const wz = z0 + lz;
    if (wx < 0 || wy < 0 || wz < 0 || wx >= sx || wy >= sy || wz >= sz) return -1;
    return blocks[wx + sx * (wy + sy * wz)];
  };
  for (let lz = 0; lz < n; lz++)
    for (let ly = 0; ly < n; ly++)
      for (let lx = 0; lx < n; lx++) {
        const li = lx + n * (ly + n * lz);
        if (seen[li]) continue;
        const id = idAt(lx, ly, lz);
        if (id < 0 || !SOLID[id]) continue;
        const code = RARITY_CODE[id];
        const secret = SECRET[id] === 1;
        if ((!code || FILLER[id]) && !secret) continue;
        const dx = x0 + lx + 0.5 - ox;
        const dy = y0 + ly + 0.5 - oy;
        const dz = z0 + lz + 0.5 - oz;
        if (dx * dx + dy * dy + dz * dz > r2) continue;
        // Flood the vein (same block id, inside the sphere's cube).
        let cx = 0, cy = 0, cz = 0, count = 0;
        stack.length = 0;
        stack.push(li);
        seen[li] = 1;
        while (stack.length) {
          const c = stack.pop()!;
          const px = c % n;
          const py = Math.floor(c / n) % n;
          const pz = Math.floor(c / (n * n));
          cx += px;
          cy += py;
          cz += pz;
          count++;
          if (count > 400) continue; // a huge body: enough cells for its centroid
          for (let k = 0; k < 6; k++) {
            const qx = px + (k === 0 ? 1 : k === 1 ? -1 : 0);
            const qy = py + (k === 2 ? 1 : k === 3 ? -1 : 0);
            const qz = pz + (k === 4 ? 1 : k === 5 ? -1 : 0);
            if (qx < 0 || qy < 0 || qz < 0 || qx >= n || qy >= n || qz >= n) continue;
            const qi = qx + n * (qy + n * qz);
            if (seen[qi] || idAt(qx, qy, qz) !== id) continue;
            seen[qi] = 1;
            stack.push(qi);
          }
        }
        const mx = x0 + cx / count + 0.5;
        const my = y0 + cy / count + 0.5;
        const mz = z0 + cz / count + 0.5;
        const rarity = code ? RARITIES[code - 1] : null;
        out.push({ x: mx, y: my, z: mz, kind: secret ? 'secret' : 'ore', rarity, size: count, rank: secret ? 2.5 : RARITY_RANK[rarity!], d: Math.hypot(mx - ox, my - oy, mz - oz) });
      }
  out.sort((a, b) => b.rank - a.rank || a.d - b.d);
  return out.slice(0, max).map(({ rank: _r, d: _d, ...c }) => c);
}

export class SonarPulse {
  private readonly o: SonarOptions;
  private t = -1;
  private radius: number = SONAR.radius;
  /** What the last ping revealed (the debug API and tests read it). */
  last: RevealCell[] = [];
  /** Pings sent this session. */
  pings = 0;

  constructor(o: SonarOptions) {
    this.o = o;
  }

  /** The shell is still sweeping out. */
  get active(): boolean {
    return this.t >= 0 && this.t * SONAR.speed <= this.radius * 1.15;
  }

  /** The sweep or its afterglow (the bioluminescence it wakes) is still on. */
  get glowing(): boolean {
    return this.t >= 0;
  }

  /**
   * Send a pulse from `origin` (the lantern, or the eye) out to `radius` m. Reveals what it finds
   * (veins, cracked walls, chests, pages, outposts, and the extra marks: lairs, the gate) as the
   * shell reaches each, for SONAR.seconds. Returns the revealed list (nearest-and-rarest first).
   */
  ping(origin: { x: number; y: number; z: number }, radius: number = SONAR.radius): RevealCell[] {
    const u = this.o.terrain.uniforms;
    this.radius = Math.max(4, radius);
    u.uSonar.value.set(origin.x, origin.y, origin.z, 0);
    u.uSonarFx.value.set(SONAR.band, 1, this.radius, 1);
    this.t = 0;
    this.pings++;
    const cells = scanFinds(this.o.world(), origin.x, origin.y, origin.z, this.radius);
    const r2 = this.radius * this.radius;
    const near = (p: { x: number; y: number; z: number }) => (p.x - origin.x) ** 2 + (p.y - origin.y) ** 2 + (p.z - origin.z) ** 2 <= r2;
    for (const spec of this.o.liveProps?.() ?? []) {
      const kind = propKind(spec);
      if (!kind || !near(spec) || (this.o.usable && !this.o.usable(spec))) continue;
      cells.unshift({ x: spec.x, y: spec.y + 0.45, z: spec.z, kind, rarity: rarityOf(spec) ?? 'uncommon' });
    }
    // Lairs, the gate and the like show at any distance up to twice the reach (they matter most).
    const far = 4 * r2;
    for (const m of this.o.marks?.() ?? []) {
      const d2 = (m.x - origin.x) ** 2 + (m.y - origin.y) ** 2 + (m.z - origin.z) ** 2;
      if (d2 > far) continue;
      cells.unshift({ x: m.x, y: m.y, z: m.z, kind: m.kind, rarity: m.rarity ?? null });
    }
    for (const c of cells) c.delay = Math.min(this.radius, Math.hypot(c.x - origin.x, c.y - origin.y, c.z - origin.z)) / SONAR.speed;
    const list = cells.slice(0, SONAR.maxMarks + 8);
    this.o.highlight.reveal(list, SONAR.seconds);
    this.last = list;
    return list;
  }

  update(dt: number): void {
    if (this.t < 0) return;
    this.t += dt;
    const u = this.o.terrain.uniforms;
    const r = this.t * SONAR.speed;
    u.uSonar.value.w = r;
    // Round 3: after the sweep, what glows by itself keeps the wave's light a little while
    // (uSonarFx.w, 1 -> 0 over SONAR.afterglow s: the bioluminescence the pulse wakes). The rock's
    // ring is gone by then (the terrain fades it with the shell's reach).
    const sweep = (this.radius * 1.15) / SONAR.speed;
    const k = (this.t - sweep) / SONAR.afterglow;
    u.uSonarFx.value.w = k <= 0 ? 1 : Math.max(0, 1 - k * k * (3 - 2 * Math.min(1, k)));
    if (this.t > sweep + SONAR.afterglow) {
      this.t = -1;
      u.uSonarFx.value.y = 0;
      u.uSonarFx.value.w = 0;
    }
  }

  /** Stop at once (a stratum change). */
  cancel(): void {
    this.t = -1;
    this.o.terrain.uniforms.uSonarFx.value.y = 0;
    this.o.highlight.marks.clear();
  }
}
