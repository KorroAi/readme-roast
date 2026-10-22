import * as THREE from 'three';
import type { EventBus, GameEvents } from '../../core/events';
import type { PropSpec, WorldLayout } from '../../world/gen/types';
import type { VoxelWorld } from '../../world/VoxelWorld';
import type { LightingRig } from '../../render/lighting';
import type { TerrainRig } from '../../render/terrainRig';
import type { ChunkRenderer } from '../../render/ChunkRenderer';
import type { HighlightSystem } from '../../render/highlight';
import { BiomeLook, type BiomeSampler, type GradeTarget, type LookBiomeId } from '../../render/biomeLook';
import { SONAR, SonarPulse, type SonarMark } from '../../render/sonar';
import { TorchLights } from '../../render/torches';
import type { RevealCell } from '../../render/reveal';

/**
 * Round 3 (VIS): one place that runs the round's visuals, so the hub (Game.ts) needs a few one-line
 * calls only: the biome looks and their blend, the sonar pulse and reveal, placed torches, and (as
 * they land) the biome decor, hazard visuals and the guardian arenas.
 *
 * It follows the session itself: a new world (a stratum switch, a restore) is attached on the next
 * update; torches and decor follow chunk changes through ChunkRenderer's listeners; the sonar answers
 * the 'player:sonar' event (UI's trigger) on the bus.
 */

/** What the director reads from the live session (structural: WorldSession satisfies it). */
export interface VisSession {
  readonly world: VoxelWorld;
  readonly layout: WorldLayout;
  readonly rig: LightingRig;
  readonly terrain: TerrainRig;
  readonly chunks: ChunkRenderer;
  readonly liveProps: Map<string, PropSpec>;
}

export interface VisDirectorOptions {
  bus: EventBus<GameEvents>;
  session: () => VisSession;
  highlight: () => HighlightSystem;
  grade: GradeTarget | null;
  /** A prop with nothing left to give (an opened chest) is not revealed by the sonar. */
  usable?: (spec: PropSpec) => boolean;
}

/** WORLD's strata layout, read structurally (src/world/gen/strata/types.ts StratumLayout). */
interface StrataView {
  biomeAt?: BiomeSampler;
  lairs?: ReadonlyArray<Record<string, unknown>>;
  gate?: Record<string, unknown> | null;
  pages?: ReadonlyArray<Record<string, unknown>>;
  outpostSites?: ReadonlyArray<Record<string, unknown>>;
}

/** A point from WORLD's records, whatever the field is called (centre, center, at, position, x/y/z). */
function pointOf(r: Record<string, unknown> | null | undefined): [number, number, number] | null {
  if (!r) return null;
  for (const k of ['centre', 'center', 'at', 'position', 'pos', 'spawn']) {
    const v = r[k];
    if (Array.isArray(v) && v.length >= 3 && v.every((n) => typeof n === 'number')) return [v[0], v[1], v[2]];
    if (v && typeof v === 'object' && typeof (v as { x?: unknown }).x === 'number') {
      const o = v as { x: number; y: number; z: number };
      return [o.x, o.y, o.z];
    }
  }
  if (typeof r.x === 'number' && typeof r.y === 'number' && typeof r.z === 'number') return [r.x, r.y as number, r.z as number];
  return null;
}

export class VisDirector {
  readonly group = new THREE.Group();
  readonly torches: TorchLights;
  private look: BiomeLook | null = null;
  private sonarPulse: SonarPulse | null = null;
  private attachedWorld: VoxelWorld | null = null;
  private attachedChunks: ChunkRenderer | null = null;
  private readonly chunkListener = (cx: number, cy: number, cz: number) => this.onChunk(cx, cy, cz);
  private readonly rebuildListener = () => this.onRebuilt();
  private readonly o: VisDirectorOptions;
  private readonly off: Array<() => void> = [];

  constructor(o: VisDirectorOptions) {
    this.o = o;
    this.group.name = 'vis';
    const s = o.session();
    this.torches = new TorchLights(s.rig.uniforms);
    this.group.add(this.torches.group);
    this.attach(s);
    this.off.push(
      o.bus.on('player:sonar', (e) => {
        this.sonar({ x: e.x, y: e.y, z: e.z }, e.radius > 0 ? e.radius : SONAR.radius);
      }),
    );
  }

  /** The dominant biome around the explorer (null until one is known: the old world). */
  get biome(): LookBiomeId | null {
    return this.look?.current ?? null;
  }

  /** The biome look (applyBiomeLook for captures and the Lab). */
  get biomeLook(): BiomeLook | null {
    return this.look;
  }

  get sonarState(): SonarPulse | null {
    return this.sonarPulse;
  }

  /** Send the sonar pulse from `origin` (UI's trigger emits 'player:sonar'; this is also callable directly). */
  sonar(origin: { x: number; y: number; z: number }, radius: number = SONAR.radius): RevealCell[] {
    return this.sonarPulse?.ping(origin, radius) ?? [];
  }

  /**
   * Each frame, before LightingRig.updateAtmosphere: follows the session, blends the biome look
   * around (x, y, z) (the explorer's feet), runs the sonar and the torches.
   */
  update(dt: number, time: number, camera: THREE.Camera, x: number, y: number, z: number): void {
    const s = this.o.session();
    if (s.world !== this.attachedWorld) this.attach(s);
    const strata = s.layout as unknown as StrataView;
    this.look?.update(dt, x, y, z, typeof strata.biomeAt === 'function' ? strata.biomeAt.bind(strata) : null);
    this.sonarPulse?.update(dt);
    this.torches.update(dt, time, camera.position);
  }

  /** The lairs, the gate, pages and outposts the sonar shows (from WORLD's strata layout). */
  private marks(): SonarMark[] {
    const L = this.o.session().layout as unknown as StrataView;
    const out: SonarMark[] = [];
    for (const l of L.lairs ?? []) {
      const p = pointOf(l);
      if (p) out.push({ x: p[0], y: p[1] + 1, z: p[2], kind: 'lair' });
    }
    const g = pointOf(L.gate ?? null);
    if (g) out.push({ x: g[0], y: g[1] + 1, z: g[2], kind: 'gate' });
    for (const pg of L.pages ?? []) {
      const p = pointOf(pg);
      if (p) out.push({ x: p[0], y: p[1] + 0.5, z: p[2], kind: 'page' });
    }
    for (const op of L.outpostSites ?? []) {
      const p = pointOf(op);
      if (p) out.push({ x: p[0], y: p[1] + 0.8, z: p[2], kind: 'outpost' });
    }
    return out;
  }

  private attach(s: VisSession): void {
    if (this.attachedChunks) {
      const c = this.attachedChunks;
      c.chunkListeners.splice(c.chunkListeners.indexOf(this.chunkListener) >>> 0, 1);
      c.rebuildListeners.splice(c.rebuildListeners.indexOf(this.rebuildListener) >>> 0, 1);
    }
    this.attachedWorld = s.world;
    this.attachedChunks = s.chunks;
    s.chunks.chunkListeners.push(this.chunkListener);
    s.chunks.rebuildListeners.push(this.rebuildListener);
    this.look?.detach();
    this.look = new BiomeLook(s.rig, this.o.grade);
    this.sonarPulse?.cancel();
    this.sonarPulse = new SonarPulse({
      terrain: s.terrain,
      highlight: this.o.highlight(),
      world: () => this.o.session().world,
      liveProps: () => this.o.session().liveProps.values(),
      usable: this.o.usable,
      marks: () => this.marks(),
    });
    this.torches.attach(s.world);
  }

  private onChunk(cx: number, cy: number, cz: number): void {
    const w = this.attachedWorld;
    if (!w) return;
    this.torches.notifyChunk(cx, cy, cz, w.chunkSize);
  }

  private onRebuilt(): void {
    const w = this.attachedWorld;
    if (w) this.torches.attach(w);
  }

  /** For the debug API and tests. */
  report(): { biome: string | null; weights: Record<string, number>; torches: number; torchesDrawn: number; sonarPings: number; revealed: number } {
    const weights: Record<string, number> = {};
    for (const [k, v] of this.look?.weights ?? []) weights[k] = Math.round(v * 1000) / 1000;
    return {
      biome: this.biome,
      weights,
      torches: this.torches.count,
      torchesDrawn: this.torches.drawn,
      sonarPings: this.sonarPulse?.pings ?? 0,
      revealed: this.o.highlight().marks.count,
    };
  }

  dispose(): void {
    for (const f of this.off) f();
    this.off.length = 0;
    this.look?.detach();
    this.sonarPulse?.cancel();
    this.torches.dispose();
  }
}
