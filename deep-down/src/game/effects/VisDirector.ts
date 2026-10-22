import * as THREE from 'three';
import type { EventBus, GameEvents } from '../../core/events';
import type { PropSpec, WorldLayout } from '../../world/gen/types';
import type { VoxelWorld } from '../../world/VoxelWorld';
import type { LightingRig } from '../../render/lighting';
import type { TerrainRig } from '../../render/terrainRig';
import type { ChunkRenderer } from '../../render/ChunkRenderer';
import type { HighlightSystem } from '../../render/highlight';
import { BiomeLook, waterTintFor, type BiomeSampler, type GradeTarget, type LookBiomeId } from '../../render/biomeLook';
import { BiomeMotes } from './BiomeMotes';
import { Ambience, type AmbientAnchor } from './Ambience';
import { dripAnchors } from './stratumAmbience';
import { HazardFx, type HazardReading, type HazardZoneView } from './HazardFx';
import { HeartFinale } from './HeartFinale';
import { WeatherFx, type CavernView } from './WeatherFx';
import { BIOME_LOOKS, isLookBiome } from '../../render/biomeLook';
import { SONAR, SonarPulse, type SonarMark } from '../../render/sonar';
import { TorchLights } from '../../render/torches';
import { Climbables } from '../../render/climbables';
import type { RevealCell } from '../../render/reveal';
import { WaterSurfaces } from '../../render/water';
import type { LakeDef } from '../../world/gen/features/types';
import type { PropRenderer } from '../../render/props/PropRenderer';
import { findPockets, pocketDrop, pocketKind, pocketProps, type Pocket } from '../../render/props/pocketModels';
import { HaloSystem, type HaloSource } from './Halos';
import { B, SOLID } from '../../config/blocks';

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
  readonly props: PropRenderer;
}

export interface VisDirectorOptions {
  bus: EventBus<GameEvents>;
  session: () => VisSession;
  highlight: () => HighlightSystem;
  grade: GradeTarget | null;
  /** A prop with nothing left to give (an opened chest) is not revealed by the sonar. */
  usable?: (spec: PropSpec) => boolean;
  /** The biomes whose guardian has fallen (their arenas' runes go cold). */
  beaten?: () => readonly string[];
  /** The hazard meter (LOOP's gameplay/Hazards): its kind and level 0..1. */
  hazard?: () => HazardReading | null;
  /** Is the Heart already relit (LOOP's quests)? A loaded stratum VI then starts lit. */
  heartLit?: () => boolean;
  /** The companion's glow (MOBS: a tame Lampling): where it is and how bright (0..1); null: none. */
  companion?: () => { x: number; y: number; z: number; glow: number } | null;
}

/** WORLD's strata layout, read structurally (src/world/gen/strata/types.ts StratumLayout). */
interface StrataView {
  biomeAt?: BiomeSampler;
  lairs?: ReadonlyArray<Record<string, unknown>>;
  gate?: Record<string, unknown> | null;
  pages?: ReadonlyArray<Record<string, unknown>>;
  outpostSites?: ReadonlyArray<Record<string, unknown>>;
  hazards?: ReadonlyArray<HazardZoneView>;
  heart?: { centre: readonly number[] } | null;
  caverns?: ReadonlyArray<CavernView>;
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
  /** Ladders and ropes (B.LADDER, B.ROPE cells). */
  readonly climbables: Climbables;
  /** Still water over the layout's lakes (rebuilt when the layout changes: a stratum switch). */
  readonly water: WaterSurfaces;
  /** The biome's motes in the air round the explorer (dust, spores, fireflies, embers...). */
  readonly motes: BiomeMotes;
  /** The hazards made visible (gas veils, the breath, the screen-edge levels). */
  readonly hazards: HazardFx;
  /** The Heart over its chamber, and its relighting (the finale). */
  readonly heart: HeartFinale;
  /** The calm weather of some caverns (spore drift, ice fog, ember rain). */
  readonly weather: WeatherFx;
  private readonly tint = waterTintFor(new Map());
  /** Drips, glow caps and the deep glows of the layout (rebuilt with it). */
  private ambience: Ambience | null = null;
  /** The strata's light pockets: what glows there (decor props) and their halos. */
  private pockets: Pocket[] = [];
  private readonly pocketIds: string[] = [];
  private pocketProps: PropRenderer | null = null;
  private readonly pocketHalos: HaloSystem;
  /** The arenas' floor runes (decor props), per lair biome. */
  private readonly runeIds = new Map<string, string[]>();
  private look: BiomeLook | null = null;
  private attachedLayout: WorldLayout | null = null;
  private layoutChanged = false;
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
    this.climbables = new Climbables(s.rig.uniforms);
    this.group.add(this.climbables.group);
    this.water = new WaterSurfaces(s.rig.uniforms, s.world, []);
    this.group.add(this.water.group);
    this.motes = new BiomeMotes(s.rig.uniforms);
    this.group.add(this.motes.points);
    this.hazards = new HazardFx(s.rig.uniforms);
    this.group.add(this.hazards.group);
    this.heart = new HeartFinale(s.rig.uniforms);
    this.group.add(this.heart.group);
    this.weather = new WeatherFx(s.rig.uniforms);
    this.group.add(this.weather.group);
    this.pocketHalos = new HaloSystem(s.rig.uniforms, []);
    this.pocketHalos.mesh.name = 'pocketHalos';
    const size = new THREE.Vector2();
    this.pocketHalos.mesh.onBeforeRender = (r, _s, cam) => {
      this.pocketHalos.setPixelScale(r.getDrawingBufferSize(size).y, (cam as THREE.PerspectiveCamera).fov ?? 72);
    };
    this.group.add(this.pocketHalos.mesh);
    this.attach(s);
    this.off.push(
      o.bus.on('player:sonar', (e) => {
        this.sonar({ x: e.x, y: e.y, z: e.z }, e.radius > 0 ? e.radius : SONAR.radius);
      }),
      // A guardian falls: its arena's runes go cold.
      o.bus.on('mob:guardianDefeated', (e) => this.dressLair(this.o.session(), e.biome, true)),
      // The twelve shards relight the Heart: the finale.
      o.bus.on('quest:heartLit', () => {
        this.sonarPulse?.cancel();
        this.heart.start();
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
    // The Heart's great ring owns the shell while it sweeps the stratum.
    if (this.heart.playing) return [];
    return this.sonarPulse?.ping(origin, radius) ?? [];
  }

  /**
   * Each frame, before LightingRig.updateAtmosphere: follows the session, blends the biome look
   * around (x, y, z) (the explorer's feet), runs the sonar and the torches.
   */
  update(dt: number, time: number, camera: THREE.Camera, x: number, y: number, z: number): void {
    const s = this.o.session();
    if (s.world !== this.attachedWorld) this.attach(s);
    else if (s.layout !== this.attachedLayout) this.onLayout(s);
    const strata = s.layout as unknown as StrataView;
    this.look?.update(dt, x, y, z, typeof strata.biomeAt === 'function' ? strata.biomeAt.bind(strata) : null);
    if (!this.heart.playing) this.sonarPulse?.update(dt);
    this.heart.update(dt, time, s.terrain, this.o.grade as unknown as { flash: number; flashColor: THREE.Color } | null);
    this.motes.intensity = this.heart.moteBoost;
    this.weather.update(dt, s.world, camera);
    this.torches.update(dt, time, camera.position);
    this.climbables.update(camera.position);
    const weights = this.look?.weights ?? EMPTY;
    this.motes.update(weights, camera.position);
    this.water.setTint(waterTintFor(weights, this.tint));
    this.hazards.update(dt, camera, weights, this.o.hazard?.() ?? null);
    // The companion's own light moves with it (lighting.ts glowLight: terrain and props take it).
    const comp = this.o.companion?.() ?? null;
    const gl = s.rig.uniforms.uGlowLight as THREE.IUniform<THREE.Vector4> | undefined;
    const gc = s.rig.uniforms.uGlowColor as THREE.IUniform<THREE.Color> | undefined;
    if (gl && gc) {
      if (comp) {
        const k = 0.55 + 0.6 * Math.max(0, Math.min(1, comp.glow));
        gl.value.set(comp.x, comp.y, comp.z, 2.6 + 2.4 * k);
        gc.value.setRGB(1.0 * k * 1.6, 0.74 * k * 1.6, 0.4 * k * 1.6);
      } else gl.value.w = 0;
    }
    (this.o.grade as { hazard?: THREE.Vector4 } | null)?.hazard?.copy(this.hazards.levels);
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
    this.climbables.attach(s.world);
    this.water.setSonar(s.terrain.uniforms.uSonar, s.terrain.uniforms.uSonarFx);
    s.props.decor.setSonar(s.terrain.uniforms.uSonar, s.terrain.uniforms.uSonarFx);
    // Props and the decor follow the terrain's cave culling (nothing drawn behind the rock).
    const chunks = s.chunks;
    s.props.chunkDrawn = (x, y, z) => chunks.chunkDrawnAt(x, y, z);
    this.onLayout(s);
  }

  /** A new layout on the same world (a stratum switch swaps it in place): the water and the decor follow. */
  private onLayout(s: VisSession): void {
    this.attachedLayout = s.layout;
    this.layoutChanged = true;
    const lakes = (s.layout.features as { lakes?: readonly LakeDef[] } | undefined)?.lakes ?? [];
    this.water.set(s.world, lakes);
    // Ambient wonder: the old world lists its anchors; a stratum's drips are read from its roofs in
    // the biomes whose look drips.
    if (this.ambience) {
      this.group.remove(this.ambience.group);
      this.ambience.dispose();
    }
    const strata = s.layout as unknown as StrataView;
    const landmarks = (s.layout.landmarks ?? {}) as Record<string, readonly number[] | undefined>;
    let anchors: readonly AmbientAnchor[] = (s.layout as { content?: { ambient?: readonly AmbientAnchor[] } }).content?.ambient ?? [];
    if (typeof strata.biomeAt === 'function') {
      const at = strata.biomeAt.bind(strata);
      anchors = dripAnchors(s.world, (x, y, z) => {
        const b = at(x, y, z);
        return isLookBiome(b) && BIOME_LOOKS[b].fx.includes('drips');
      }, { seed: s.layout.seed ?? 1 });
    }
    this.ambience = new Ambience(s.rig.uniforms, s.world, anchors, landmarks, typeof strata.biomeAt !== 'function');
    this.hazards.setZones(strata.hazards ?? []);
    this.heart.setHeart(strata.heart ?? null, this.o.heartLit?.() ?? false);
    this.weather.setCaverns(strata.caverns ?? []);
    this.group.add(this.ambience.group);
    this.dressPockets(s, strata);
    for (const ids of this.runeIds.values()) for (const id of ids) s.props.remove(id);
    this.runeIds.clear();
    const beaten = new Set(this.o.beaten?.() ?? []);
    for (const l of strata.lairs ?? []) {
      const b = typeof l.biome === 'string' ? l.biome : null;
      if (b) this.dressLair(s, b, beaten.has(b));
    }
  }

  /**
   * A guardian's arena: a ring of inlaid floor stones round it, between WORLD's pillars and braziers,
   * each with a glyph glowing rose while the guardian lives and a cold ash-gold once it has fallen.
   */
  private dressLair(s: VisSession, biome: string, spent: boolean): void {
    const strata = s.layout as unknown as StrataView;
    const lair = (strata.lairs ?? []).find((l) => l.biome === biome);
    const c = pointOf(lair ?? null);
    const radius = typeof lair?.radius === 'number' ? lair.radius : 0;
    for (const id of this.runeIds.get(biome) ?? []) s.props.remove(id);
    this.runeIds.delete(biome);
    if (!c || radius < 4) return;
    const w = s.world;
    const solid = (x: number, y: number, z: number) => SOLID[w.get(x, y, z)] === 1;
    const ids: string[] = [];
    const n = 16;
    const r = radius - 1.5;
    for (let k = 0; k < n; k++) {
      const a = ((k + 0.5) / n) * Math.PI * 2 + 0.3;
      const x = Math.floor(c[0] + Math.cos(a) * r);
      const z = Math.floor(c[2] + Math.sin(a) * r);
      let floor = -1;
      for (let y = Math.floor(c[1]) + 3; y >= Math.floor(c[1]) - 6; y--) {
        if (!solid(x, y, z) && !solid(x, y + 1, z) && solid(x, y - 1, z)) {
          floor = y;
          break;
        }
      }
      if (floor < 0) continue;
      const id = `lairRune_${biome}_${k}`;
      s.props.add({ id, kind: 'lairRune' as PropSpec['kind'], x: x + 0.5, y: floor, z: z + 0.5, rotY: a + Math.PI / 2, scale: 1, anchor: [x, floor - 1, z], emitters: [], seed: k * 977 + radius, modelVariant: spent ? 1 : 0 });
      ids.push(id);
    }
    this.runeIds.set(biome, ids);
  }

  /**
   * The strata's light pockets (WORLD's biome lights in the air under the roof): the thing that glows
   * there hangs from the roof over each (decor, baked per cell), and a soft halo breathes round it
   * (a brighter one round a light floating in open air, which has no roof to hang from).
   */
  private dressPockets(s: VisSession, strata: StrataView): void {
    if (this.pocketProps) for (const id of this.pocketIds) this.pocketProps.remove(id);
    if (this.pocketProps) for (const ids of this.runeIds.values()) for (const id of ids) this.pocketProps.remove(id);
    this.pocketIds.length = 0;
    this.pockets = [];
    this.pocketProps = s.props;
    if (typeof strata.biomeAt !== 'function') {
      this.pocketHalos.setSources([]);
      return;
    }
    const w = s.world;
    const owned = new Set<number>();
    for (const p of s.layout.props) for (const [x, y, z] of p.emitters) owned.add(w.index(x, y, z));
    this.pockets = findPockets(w, strata.biomeAt.bind(strata), owned);
    for (const spec of pocketProps(this.pockets, s.layout.seed)) {
      s.props.add(spec);
      this.pocketIds.push(spec.id);
    }
    const halos: HaloSource[] = [];
    for (const p of this.pockets) {
      const look = isLookBiome(p.biome) ? BIOME_LOOKS[p.biome] : null;
      if (!look) continue;
      const [r, g, b] = look.light;
      // Right under its roof the light is the hanging thing's: a faint wide breath round it. A light
      // well below a high roof (its worms, crystals or ice up there) glows as a soft mote of its own.
      const kind = pocketKind(p.biome, p.id) ?? '';
      const onLine = /^(glowCaps|mineLamp|runeLamp)/.test(kind);
      const floating = p.roof === null || (!onLine && pocketDrop(p) > 1.5);
      const k = floating ? 0.5 : 0.3;
      halos.push({ x: p.x, y: p.y, z: p.z, id: B.LIGHT_EMBER, color: [r * k, g * k, b * k], size: floating ? 0.85 : 1.7, lift: floating ? 0.5 : 0.25 });
    }
    this.pocketHalos.setSources(halos);
  }

  /** The light pockets of the loaded stratum (debug report, tests). */
  get pocketCount(): number {
    return this.pockets.length;
  }

  /**
   * True once after the layout changed (Game's VIS block then refreshes what it built from the old
   * layout: the halos).
   */
  takeLayoutChange(): boolean {
    const c = this.layoutChanged;
    this.layoutChanged = false;
    return c;
  }

  private onChunk(cx: number, cy: number, cz: number): void {
    const w = this.attachedWorld;
    if (!w) return;
    this.torches.notifyChunk(cx, cy, cz, w.chunkSize);
    this.climbables.notifyChunk(cx, cy, cz, w.chunkSize);
  }

  private onRebuilt(): void {
    const w = this.attachedWorld;
    if (w) {
      this.torches.attach(w);
      this.climbables.attach(w);
    }
  }

  /** For the debug API and tests. */
  report(): { biome: string | null; weights: Record<string, number>; torches: number; torchesDrawn: number; climbables: number; sonarPings: number; revealed: number; motes: string[]; pockets: number; hazard: number[]; veils: number; weather: string | null; waterQuads: number } {
    const weights: Record<string, number> = {};
    for (const [k, v] of this.look?.weights ?? []) weights[k] = Math.round(v * 1000) / 1000;
    return {
      biome: this.biome,
      weights,
      torches: this.torches.count,
      torchesDrawn: this.torches.drawn,
      climbables: this.climbables.count,
      sonarPings: this.sonarPulse?.pings ?? 0,
      revealed: this.o.highlight().marks.count,
      motes: this.motes.picks.map((p) => `${p.style}:${p.weight.toFixed(2)}`),
      pockets: this.pockets.length,
      hazard: this.hazards.levels.toArray().map((v) => Math.round(v * 100) / 100),
      veils: this.hazards.veilCount,
      weather: this.weather.kind ? `${this.weather.kind}:${this.weather.level.toFixed(2)}` : null,
      waterQuads: this.water.quads,
    };
  }

  dispose(): void {
    for (const f of this.off) f();
    this.off.length = 0;
    this.look?.detach();
    this.sonarPulse?.cancel();
    this.torches.dispose();
    this.climbables.dispose();
    this.water.dispose();
    this.motes.dispose();
    this.hazards.dispose();
    this.heart.dispose();
    this.weather.dispose();
    this.ambience?.dispose();
    this.pocketHalos.dispose();
    if (this.pocketProps) {
      for (const id of this.pocketIds) this.pocketProps.remove(id);
      for (const ids of this.runeIds.values()) for (const id of ids) this.pocketProps.remove(id);
    }
  }
}

const EMPTY: ReadonlyMap<string, number> = new Map();
