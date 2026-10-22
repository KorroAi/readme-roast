import { BIOMES, STRATUM_COUNT, depthAt, stratumDef, type BiomeId, type StratumIndex } from '../config/biomes';
import type { EventBus, GameEvents } from '../core/events';
import { t, type TextKey } from '../i18n';
import { ExploredMap, type ExploredMapData } from '../world/gen/strata/explored';
import { isStratumLayout, type StratumLayout, type V3 } from '../world/gen/strata/types';
import { loadStratumZone } from '../world/gen/zoneLoader';
import type { WorldSession } from './WorldSession';

/**
 * Round 3 (WORLD seam): the strata and the switch between them (docs/round3/BRIEF.md §0.1, §2).
 *
 * One stratum is loaded at a time. `enter(n, at)` saves the current stratum's edits into its slice,
 * shows the loading screen, generates the next one in the zone worker, swaps it into the same
 * WorldSession in place (same world size, so every buffer, renderer and controller keeps working),
 * places the explorer, and calls the `onEnter` listeners (VIS rebuilds the biome looks, MOBS clears
 * and respawns, LOOP recomputes its fields, UI redraws the map).
 *
 * The per-stratum save slice: the seed, the current stratum, each visited stratum's world edits,
 * removed props and explored map, and the outposts.
 */

declare module '../core/events' {
  interface GameEvents {
    /** A stratum was entered (after the swap, the explorer placed). `from` is null on boot and Continue. */
    'world:stratum': { stratum: StratumIndex; from: StratumIndex | null; biomes: [BiomeId, BiomeId] };
    /** The explorer walked into another biome (arrival cards, music beds, looks). `first`: never seen before. */
    'world:biome': { biome: BiomeId; from: BiomeId | null; stratum: StratumIndex; first: boolean };
    /** A guardian lair was revealed on the map (sonar, a journal page, or walking deep into its biome). */
    'world:lairRevealed': { id: string; biome: BiomeId; how: 'sonar' | 'page' | 'near' | 'debug' };
    /** The gate of a stratum opened (its seal turned to air). */
    'world:gateOpened': { stratum: StratumIndex };
  }
}

/** What the manager needs from the game (Game implements it in a WORLD block). */
export interface StratumHost {
  readonly session: WorldSession;
  readonly bus: EventBus<GameEvents>;
  /** Show the loading screen (p 0..1 and a label already through t()), or hide it (null). */
  loading(p: number | null, label?: string): void;
  /** Put the explorer's feet at (x, y, z), facing yaw, with no velocity. */
  placeExplorer(x: number, y: number, z: number, yaw: number): void;
}

/** A placed outpost (LOOP's Outpost Kit): a fast-travel node, a bank, a bedroll and a light. */
export interface OutpostRecord {
  id: string;
  stratum: StratumIndex;
  x: number;
  y: number;
  z: number;
  /** The biome it stands in (for the map and the travel list). */
  biome: BiomeId;
}

export interface StratumSlice {
  edits: number[];
  removedProps: string[];
  explored: ExploredMapData | null;
  /** Lairs revealed on the map, and gates opened. */
  revealed: string[];
  gateOpen: boolean;
  /** Biomes walked into (arrival cards show once). */
  seenBiomes: BiomeId[];
}

/** The Heart Shards won (one per biome whose guardian fell): what opens the gates. */
export type ShardSet = BiomeId[];

/** The save's world part (save v4): written by toSave, read by fromSave. */
export interface StrataSave {
  seed: number;
  current: StratumIndex;
  /** Deepest stratum entered (1..6). */
  deepest: StratumIndex;
  strata: Partial<Record<StratumIndex, StratumSlice>>;
  outposts: OutpostRecord[];
  /** Heart Shards won (biome ids). */
  shards: ShardSet;
}

type EnterListener = (e: { stratum: StratumIndex; from: StratumIndex | null; layout: StratumLayout }) => void;

const emptySlice = (): StratumSlice => ({ edits: [], removedProps: [], explored: null, revealed: [], gateOpen: false, seenBiomes: [] });

export class StratumManager {
  /** The stratum loaded now (1..6). */
  current: StratumIndex = 1;
  deepest: StratumIndex = 1;
  /** The expedition seed: every stratum derives from it. */
  seed: number;
  /** True while a switch runs (the game should not step the explorer). */
  busy = false;
  readonly outposts: OutpostRecord[] = [];
  /** Heart Shards won (biome ids): each guardian's defeat adds its biome ('mob:guardianDefeated'). */
  readonly shards = new Set<BiomeId>();
  private readonly slices = new Map<StratumIndex, StratumSlice>();
  private readonly listeners: EnterListener[] = [];
  private explored: ExploredMap | null = null;
  private biome: BiomeId | null = null;
  private revealed = new Set<string>();
  private exploreTimer = 0;

  constructor(private readonly host: StratumHost, seed: number) {
    this.seed = seed >>> 0;
    host.bus.on('mob:guardianDefeated', (e) => this.addShard(e.shard as BiomeId));
    // A biome's first journal page marks its guardian's lair on the map.
    host.bus.on('world:note', (e) => {
      const page = this.layout?.pages.find((p) => p.id === e.id);
      if (page?.revealsLair) this.reveal(page.revealsLair, 'page');
    });
  }

  /** A Heart Shard won (a guardian fell, or LOOP grants one). */
  addShard(biome: BiomeId): void {
    if (BIOMES[biome]) this.shards.add(biome);
  }

  /** Shards of the loaded stratum's biomes held now. */
  shardsHere(): number {
    const l = this.layout;
    return l ? l.gate.shards.filter((b) => this.shards.has(b)).length : 0;
  }

  /** The loaded stratum's gate can be unsealed (its shards are held). */
  canOpenGate(): boolean {
    const l = this.layout;
    return !!l && this.shardsHere() >= l.gate.shardsNeeded;
  }

  /** The loaded stratum's layout (null while the old hand-made world is loaded). */
  get layout(): StratumLayout | null {
    const l = this.host.session.layout;
    return isStratumLayout(l) ? l : null;
  }

  /** The explored map of the loaded stratum. */
  get map(): ExploredMap | null {
    return this.explored;
  }

  /** The biome the explorer is in now (null before the first update or in the old world). */
  get biomeHere(): BiomeId | null {
    return this.biome;
  }

  /** Displayed depth (m) at block height y in the loaded stratum. */
  depth(y: number): number {
    return depthAt(this.current, y);
  }

  /** Lairs revealed on the map in the loaded stratum. */
  isRevealed(lairId: string): boolean {
    return this.revealed.has(lairId);
  }

  /** Call after every stratum swap (VIS looks, MOBS spawns, LOOP fields, UI map). Returns an unsubscribe. */
  onEnter(cb: EnterListener): () => void {
    this.listeners.push(cb);
    return () => {
      const i = this.listeners.indexOf(cb);
      if (i >= 0) this.listeners.splice(i, 1);
    };
  }

  /**
   * Switch to stratum `n`: save this one's slice, generate and swap in the next, place the explorer at
   * `at` (feet), at the gate's lift ('lift': arriving from below), or at the stratum's arrival (default).
   */
  async enter(n: number, at?: V3 | 'lift' | 'arrival'): Promise<void> {
    const stratum = Math.max(1, Math.min(STRATUM_COUNT, Math.floor(n))) as StratumIndex;
    if (this.busy) return;
    this.busy = true;
    const from = this.layout ? this.current : null;
    try {
      if (this.layout) this.stash();
      const label = t(stratumDef(stratum).name);
      this.host.loading(0.02, label);
      const zone = await loadStratumZone(this.seed, stratum, (p) => this.host.loading(0.05 + p * 0.45, label));
      const slice = this.slices.get(stratum) ?? emptySlice();
      await this.host.session.swapZone(zone, slice.edits, slice.removedProps, (p) => this.host.loading(0.5 + p * 0.48, label));
      this.current = stratum;
      if (stratum > this.deepest) this.deepest = stratum;
      this.adopt(slice);
      const layout = this.layout!;
      const spot = at === 'lift' ? layout.gate.stand : Array.isArray(at) ? at : null;
      if (spot) this.host.placeExplorer(spot[0], spot[1], spot[2], layout.arrival.yaw);
      else this.host.placeExplorer(layout.arrival.x, layout.arrival.y, layout.arrival.z, layout.arrival.yaw);
      this.biome = null;
      for (const cb of [...this.listeners]) cb({ stratum, from, layout });
      this.host.bus.emit('world:stratum', { stratum, from, biomes: layout.biomes });
    } finally {
      this.host.loading(null);
      this.busy = false;
    }
  }

  /**
   * Per frame (cheap): marks the explored map round the explorer, follows the biome under the feet and
   * reveals a lair once the explorer is deep inside its biome.
   */
  update(dt: number, x: number, y: number, z: number): void {
    const l = this.layout;
    if (!l || this.busy) return;
    this.exploreTimer -= dt;
    if (this.exploreTimer <= 0) {
      this.exploreTimer = 0.25;
      this.explored?.markAround(x, z, 7, y);
    }
    const b = l.biomeAt(x, y, z);
    if (b !== this.biome) {
      const from = this.biome;
      this.biome = b;
      const slice = this.slices.get(this.current) ?? emptySlice();
      const first = !slice.seenBiomes.includes(b);
      if (first) slice.seenBiomes.push(b);
      this.slices.set(this.current, slice);
      this.host.bus.emit('world:biome', { biome: b, from, stratum: this.current, first });
    }
    for (const lair of l.lairs) {
      if (this.revealed.has(lair.id)) continue;
      if (Math.hypot(lair.centre[0] - x, lair.centre[2] - z) < lair.revealRadius) this.reveal(lair.id, 'near');
    }
  }

  /** Mark a lair on the map (sonar, a journal page, the debug hook). */
  reveal(lairId: string, how: 'sonar' | 'page' | 'near' | 'debug'): boolean {
    const lair = this.layout?.lairs.find((a) => a.id === lairId);
    if (!lair || this.revealed.has(lairId)) return false;
    this.revealed.add(lairId);
    this.host.bus.emit('world:lairRevealed', { id: lairId, biome: lair.biome, how });
    return true;
  }

  /** Open the loaded stratum's gate (LOOP calls it once the 2 shards are given). */
  openGate(): boolean {
    const l = this.layout;
    if (!l) return false;
    const s = this.host.session;
    let changed = false;
    for (const [x, y, z] of l.gate.seal) {
      if (s.world.get(x, y, z) !== 0) {
        s.setBlock(x, y, z, 0);
        changed = true;
      }
    }
    const slice = this.slices.get(this.current) ?? emptySlice();
    slice.gateOpen = true;
    this.slices.set(this.current, slice);
    if (changed) {
      this.host.bus.emit('world:gateOpened', { stratum: this.current });
      this.host.bus.emit('toast', { text: t('world.gate.opened' as string as TextKey), tone: 'good' });
    }
    return changed;
  }

  gateOpen(): boolean {
    const l = this.layout;
    if (!l) return false;
    return l.gate.seal.every(([x, y, z]) => this.host.session.world.get(x, y, z) === 0);
  }

  /** Descend through the open gate (the next stratum's arrival). */
  async descend(): Promise<boolean> {
    const l = this.layout;
    if (!l || !l.gate.next || !this.gateOpen()) return false;
    await this.enter(l.gate.next, 'arrival');
    return true;
  }

  /** Ride the lift back up (arrive at the gate of the stratum above). */
  async ascend(): Promise<boolean> {
    if (this.current <= 1) return false;
    await this.enter(this.current - 1, 'lift');
    return true;
  }

  /** Register an outpost placed by LOOP's Outpost Kit in the loaded stratum. */
  addOutpost(id: string, x: number, y: number, z: number): OutpostRecord | null {
    const l = this.layout;
    if (!l) return null;
    const rec: OutpostRecord = { id, stratum: this.current, x, y, z, biome: l.biomeAt(x, y, z) };
    const i = this.outposts.findIndex((o) => o.id === id);
    if (i >= 0) this.outposts[i] = rec;
    else this.outposts.push(rec);
    return rec;
  }

  removeOutpost(id: string): void {
    const i = this.outposts.findIndex((o) => o.id === id);
    if (i >= 0) this.outposts.splice(i, 1);
  }

  /** Fast travel to an outpost (any stratum already visited; a switch when it is another stratum). */
  async travelTo(outpostId: string): Promise<boolean> {
    const o = this.outposts.find((p) => p.id === outpostId);
    if (!o) return false;
    if (o.stratum === this.current && this.layout) {
      this.host.placeExplorer(o.x + 1, o.y, o.z, 0);
      return true;
    }
    await this.enter(o.stratum, [o.x + 1, o.y, o.z]);
    return true;
  }

  /** The save's world part (call before writing a save). */
  toSave(): StrataSave {
    if (this.layout) this.stash();
    const strata: Partial<Record<StratumIndex, StratumSlice>> = {};
    for (const [k, v] of this.slices) strata[k] = { ...v, edits: [...v.edits], removedProps: [...v.removedProps], revealed: [...v.revealed], seenBiomes: [...v.seenBiomes] };
    return { seed: this.seed, current: this.current, deepest: this.deepest, strata, outposts: this.outposts.map((o) => ({ ...o })), shards: [...this.shards] };
  }

  /** Read a save's world part (before `enter(save.current)`; nothing is loaded here). */
  fromSave(s: StrataSave): void {
    this.seed = s.seed >>> 0;
    this.current = s.current;
    this.deepest = s.deepest;
    this.slices.clear();
    for (const [k, v] of Object.entries(s.strata)) if (v) this.slices.set(Number(k) as StratumIndex, { ...emptySlice(), ...v });
    this.outposts.length = 0;
    this.outposts.push(...s.outposts);
    this.shards.clear();
    for (const b of s.shards ?? []) this.addShard(b);
  }

  /** A new expedition: forget every slice (the caller then enters stratum I). */
  reset(seed: number): void {
    this.seed = seed >>> 0;
    this.current = 1;
    this.deepest = 1;
    this.slices.clear();
    this.outposts.length = 0;
    this.shards.clear();
    this.revealed.clear();
    this.explored = null;
    this.biome = null;
  }

  /** The session booted straight into a stratum (no enter()): start its explored map and biome. */
  adoptBooted(): void {
    if (!this.layout) return;
    this.adopt(this.slices.get(this.current) ?? emptySlice());
    this.biome = null;
  }

  /** The loaded stratum's slice into the map (edits, removed props, the explored map). */
  private stash(): void {
    const s = this.host.session;
    const slice = this.slices.get(this.current) ?? emptySlice();
    slice.edits = s.worldEdits();
    slice.removedProps = [...s.removedProps];
    slice.explored = this.explored?.serialise() ?? null;
    slice.revealed = [...this.revealed];
    this.slices.set(this.current, slice);
  }

  private adopt(slice: StratumSlice): void {
    const w = this.host.session.world;
    this.explored = ExploredMap.deserialise(slice.explored, w.sx, w.sz);
    this.revealed = new Set(slice.revealed);
    this.slices.set(this.current, slice);
  }
}

/** The arrival card's text for a biome, through t() (UI shows it on 'world:biome' with first = true). */
export function arrivalCard(id: BiomeId): { name: string; desc: string; hazard: string; gear: string; rumour: string; stratum: StratumIndex } {
  const b = BIOMES[id];
  return { name: t(b.name), desc: t(b.desc), hazard: t(b.hazardText), gear: t(b.gearText), rumour: t(b.rumour), stratum: b.stratum };
}
