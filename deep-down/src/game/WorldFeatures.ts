import * as THREE from 'three';
import { B, SOLID, isEmitter } from '../config/blocks';
import { MOTHS, RIDES, WORLD } from '../config/balance';
import { ITEMS, type ItemId } from '../config/items';
import { BLOOM, BREATHE_BELOW_Y } from '../config/livingRock';
import { dampAngle } from '../core/math';
import { discoveryNumbering } from '../gameplay/discoveries';
import { t, type TextKey } from '../i18n';
import type { PlayerFrameEvents } from './PlayerController';
import { createEntityMaterial } from '../render/entityMaterial';
import { HOIST_CAGE_HOOK, hoistCageGeometry, hoistRopeGeometry } from '../render/props/featureModels';
import { applyLiving, bloomSiteFor, rollLiving } from '../world/gen/features/living';
import type { FeatureLayout, FeatureLink, RuneDoorDef, V3 } from '../world/gen/features/types';
import type { PropSpec } from '../world/gen/types';
import { LumenMoths } from './effects/LumenMoths';
import type { Game } from './Game';
import { MothFlock, type MothAnchor } from './moths';
import { createRide, rideEdges, rideEnd, stepRide, type Ride, type RideStep } from './ropeRide';
import { doorIsOpen, doorRows, wakeStep, type DoorState, type DoorWake } from './runeDoor';

/** A live renewal site for rumours and compass targets (the Survey Table, W3). */
export interface LiveSite {
  kind: 'living' | 'bloom';
  /** Living site id (haldenFace, riftWalls) or the bloom's prop id (bloom_e<epoch>). */
  id: string;
  /** Area id: its name is the i18n key `area.<area>`. */
  area: string;
  x: number;
  y: number;
  z: number;
  /** The expedition (epoch) this site's state belongs to. */
  epoch: number;
  /** Ore grown this epoch (block ids and counts) for living sites; glimmer for the bloom. */
  ore: Array<{ block: number; count: number }>;
  /** False once the bloom has been mined (living sites are always present). */
  present: boolean;
}

interface ActiveRide {
  link: FeatureLink;
  ride: Ride;
  /** Hold the ride still (debug captures of a mid-ride frame). */
  hold: boolean;
  face: number;
}

interface DoorRun {
  def: RuneDoorDef;
  wake: DoorWake;
  rows: Array<Array<[number, number, number]>>;
  /** Next row to sink and the time to it, while the door is opening. */
  sinking: { row: number; timer: number } | null;
  emitTimer: number;
  hinted: DoorState;
}

/** Light rebuilt round a cell that grows back (m): it closed a hole in a wall, with rock behind it. */
const REGROW_LIGHT_R = 4;

/** The rift floor: standing here (not falling through it) is the 'undercroft' discovery. */
const UNDERCROFT = { min: [112, 5, 116] as V3, max: [137, 14, 147] as V3 };

/**
 * The runtime of the world-variety places (world/gen/features): rides on the hoist and the rope,
 * the rune doors, the Halden logs, the relics, the black stone, the lumen moths, and the deep that
 * breathes (the living rock and the glimmer bloom, once per expedition into the Hollow).
 *
 * Game owns the frame loop; it calls attach() when a world is loaded, update() each playing frame,
 * updateRide() instead of the player controller while a ride runs, and the interaction methods
 * through Progression for props with interact 'feature'. Everything that must persist is derived
 * from the world delta (doors, living cells, the bloom's light), the journal (logs, the hoist's
 * release, the stone) and SaveData.progression.day (the epoch).
 */
export class WorldFeatures {
  readonly layout: FeatureLayout | null;
  readonly flock: MothFlock;
  readonly moths: LumenMoths;
  /** The hoist's cage and its rope (they move with the ride). */
  readonly cage: THREE.Group;
  /** Key items the relics give, once progression defines them (W3): relic id -> item. */
  relicItems: Partial<Record<string, string>> = { reliquary: 'bearerLens', gallery: 'firstLamp', glowroot: 'relicGlowroot', choir: 'relicChoir', ember: 'relicEmber' };
  /** The finale (W3) sets this once the stone should wake: then a touch is left to it. */
  stoneAwake: () => boolean = () => false;
  private active: ActiveRide | null = null;
  private readonly rideOut: RideStep = { x: 0, y: 0, z: 0, done: false };
  private doors: DoorRun[] = [];
  private bloomId: string | null = null;
  private cageY: number;
  private readonly rope: THREE.Mesh;
  private readonly sheaveY = 91.72;
  private readonly lanternState = { x: 0, y: 0, z: 0, lit: false, fuelFrac: 0 };
  private quality = '';
  private readonly stats = { mothMs: 0, regrowMs: 0, bloomMs: 0, moths: 0, drawn: 0 };
  /** The bloom of a breath just taken grows a frame later, so no one frame carries both. */
  private pendingBloom: { epoch: number; frames: number } | null = null;
  private readonly isOpen: (x: number, y: number, z: number) => boolean;

  constructor(private readonly game: Game) {
    const s = game.session;
    this.layout = s.layout.features ?? null;
    const w = s.world;
    this.isOpen = (x, y, z) => !SOLID[w.get(x, y, z)];
    this.flock = new MothFlock(this.anchors(0), WORLD.seed ^ 0x307a5, MOTHS.cap.high);
    this.moths = new LumenMoths(s.rig.uniforms, this.flock);
    const mat = createEntityMaterial(s.rig.uniforms);
    this.cage = new THREE.Group();
    this.cage.name = 'hoistCage';
    const body = new THREE.Mesh(hoistCageGeometry(), mat);
    this.rope = new THREE.Mesh(hoistRopeGeometry(), mat);
    this.cage.add(body, this.rope);
    const hoist = this.link('hoist');
    this.cageY = hoist ? hoist.path[2][1] : 0;
    this.cage.visible = !!hoist;
    this.placeCage();
    game.bus.on('block:hit', (e) => this.startle(e.x, e.y, e.z));
  }

  // ------------------------------------------------------------------------------------
  // Lifecycle

  /**
   * A world was loaded (New Expedition, Continue): rebuild the door states, put the epoch's bloom
   * where it belongs (unless its id is in `removed`, the save's mined props), give the walking
   * fields the ride edges, and reset the moths.
   */
  attach(removed: readonly string[]): void {
    const L = this.layout;
    this.active = null;
    this.pendingBloom = null;
    if (!L) return;
    const w = this.game.session.world;
    this.doors = L.runeDoors.map((def) => ({
      def,
      wake: { progress: doorIsOpen(w, def) ? 1 : 0, state: doorIsOpen(w, def) ? 'open' : 'idle' },
      rows: doorRows(def),
      sinking: null,
      emitTimer: 0,
      hinted: 'idle',
    }));
    const gone = new Set(removed);
    for (const id of removed) if (id.startsWith('bloom_e')) this.game.session.removedProps.add(id);
    this.bloomId = null;
    this.placeBloom(this.epoch, gone);
    this.flock.setAnchors(this.anchors(this.epoch));
    this.cageY = this.link('hoist')?.path[2][1] ?? 0;
    this.placeCage();
    this.syncEdges();
    // Warm the roll once (its first call compiles), so the camp entry that breathes stays short.
    for (const site of L.living) rollLiving(site, WORLD.seed, this.epoch + 1);
  }

  /** The expedition counter the deep breathes by (SaveData.progression.day). */
  get epoch(): number {
    return this.game.progression.day;
  }

  get riding(): boolean {
    return this.active !== null;
  }

  /** Stop a ride where it is (a black-out, a respawn, the menu): no end event, no teleport. */
  cancelRide(): void {
    this.active = null;
  }

  /** Feet position to save while a ride runs (its end stand: a reload never wakes mid-air). */
  get rideSavePosition(): V3 | null {
    return this.active ? rideEnd(this.active.ride) : null;
  }

  /** Camp entry after a trip: if it went into the Hollow, the deep breathes (a new epoch). */
  onCampEntered(tripDeepest: number): void {
    if (!this.layout) return;
    if (tripDeepest < WORLD.depthOffset - BREATHE_BELOW_Y) return;
    this.game.progression.day = this.epoch + 1;
    this.breathe(this.epoch);
    this.game.ui.toast(t('toast.deepBreathes'), 'info');
  }

  // ------------------------------------------------------------------------------------
  // Frame

  /** One playing frame (after the discoveries): doors, the rift floor, moths. */
  update(dt: number): void {
    if (!this.layout) return;
    const g = this.game;
    const p = g.player;
    this.updateDoors(dt);
    if (this.pendingBloom && --this.pendingBloom.frames < 0) this.growBloom();
    if (!g.journal.has('undercroft') && p.grounded && !this.active && inBox(p.x, p.y, p.z, UNDERCROFT)) g.discover('undercroft');
    this.updateMoths(dt);
  }

  /**
   * One frame of a ride, in place of PlayerController.update: the explorer follows the ride.
   * @returns the player's frame events, cleared (no steps, no landing).
   */
  updateRide(dt: number): PlayerFrameEvents {
    const g = this.game;
    const p = g.player;
    const a = this.active!;
    const out = stepRide(a.ride, a.hold ? 0 : dt, this.rideOut);
    p.x = out.x;
    p.y = out.y;
    p.z = out.z;
    p.vx = p.vy = p.vz = 0;
    p.grounded = true;
    p.yaw = dampAngle(p.yaw, a.face, 10, dt);
    // Turn the view to look along the wall the ride passes (unless the player is looking around).
    if (g.input.lookDX === 0 && g.input.lookDY === 0) g.cameraRig.yaw = dampAngle(g.cameraRig.yaw, a.face + Math.PI, 2.2, dt);
    if (a.link.kind === 'hoist') {
      const path = a.link.path;
      this.cageY = Math.max(path[2][1], Math.min(path[1][1], out.y));
      this.placeCage();
    }
    if (out.done && !a.hold) this.endRide();
    const ev = p.events;
    ev.jumped = false;
    ev.landedSpeed = 0;
    ev.footstep = false;
    ev.rescued = false;
    return ev;
  }

  // ------------------------------------------------------------------------------------
  // Interaction (props with interact 'feature', through Progression)

  label(spec: PropSpec): string {
    const f = spec.feature;
    if (!f) return t('hud.interact');
    switch (f.kind) {
      case 'note':
        return t('hint.interactNote');
      case 'relic':
        return t('hint.takeRelic');
      case 'monolith':
        return t('hint.touchStone');
      case 'rope':
        return t(f.end === 'top' ? 'hint.ropeDown' : 'hint.ropeUp');
      case 'hoist':
        return t(f.end === 'bottom' && !this.hoistReleased ? 'hint.hoistRelease' : 'hint.hoistRide');
      case 'cache':
        return t(spec.kind === 'crate' || spec.kind === 'barrel' ? 'hint.openCrate' : 'hint.openCache');
    }
  }

  /** How far the explorer may stand from this prop's use point (m). */
  focusRange(spec: PropSpec): number {
    const k = spec.feature?.kind;
    return k === 'rope' || k === 'hoist' ? RIDES.standRange : k === 'monolith' ? RIDES.stoneRange : 2.4;
  }

  /** Distance from the explorer's feet to this prop's use point: the stand for rides, the stone's faces for the stone. */
  focusDistance(spec: PropSpec, px: number, py: number, pz: number): number {
    const f = spec.feature;
    if (!f) return Infinity;
    if (this.active) return Infinity;
    if (f.kind === 'rope' || f.kind === 'hoist') {
      const l = this.link(f.id);
      if (!l) return Infinity;
      const s = f.end === 'top' ? l.top : l.bottom;
      return Math.hypot(s[0] - px, (s[1] - py) * 0.7, s[2] - pz);
    }
    // An opened cache is scenery: no focus, no use button.
    if (f.kind === 'cache' && this.game.progression.looted(spec.id)) return Infinity;
    if (f.kind === 'monolith') {
      // Outside the shaft's faces (half-width 4.9 at the foot), within 3 m above the plinth.
      const dx = Math.max(0, Math.abs(px - spec.x) - 4.9);
      const dz = Math.max(0, Math.abs(pz - spec.z) - 4.9);
      return py - spec.y > 4 ? Infinity : Math.hypot(dx, dz);
    }
    return Math.hypot(spec.x - px, (spec.y - py) * 0.7, spec.z - pz);
  }

  interact(spec: PropSpec): void {
    const f = spec.feature;
    if (!f || this.active) return;
    switch (f.kind) {
      case 'note':
        this.readNote(f.id);
        break;
      case 'relic':
        this.takeRelic(spec, f.id);
        break;
      case 'monolith':
        this.touchStone(spec);
        break;
      case 'rope': {
        const l = this.link(f.id);
        if (l) this.startRide(l, f.end === 'top' ? 'down' : 'up');
        break;
      }
      case 'hoist':
        this.useHoist(f.end ?? 'bottom');
        break;
      case 'cache':
        this.game.progression.openCache(spec);
        break;
    }
  }

  get hoistReleased(): boolean {
    return this.game.journal.has('hoist');
  }

  /** Open a rune door now (the sinking sequence), whatever the lantern: for scripted unlocks. */
  openDoor(id: string): boolean {
    const d = this.doors.find((r) => r.def.id === id);
    if (!d || d.wake.state === 'open') return false;
    d.wake.progress = 1;
    d.wake.state = 'open';
    this.beginSinking(d);
    return true;
  }

  // ------------------------------------------------------------------------------------
  // The deep breathes

  /**
   * Re-roll the living rock for `epoch`; its bloom grows a frame later (growBloom: the previous
   * one, if still unmined, is gone). Mined cells grow back, intact ones may change ore; never
   * within 1.5 m of a drop or the pack left behind, and only where the generated world is solid.
   * Light is rebuilt in small boxes round regrown holes only.
   * @returns main-thread milliseconds of this frame's part (the rock).
   */
  breathe(epoch: number): number {
    const L = this.layout;
    if (!L) return 0;
    const t0 = performance.now();
    const g = this.game;
    const s = g.session;
    const w = s.world;
    const light = s.light;
    const skip: Array<[number, number, number]> = [];
    const c = g.progression.cache;
    if (c) skip.push([c.x, c.y + 0.3, c.z]);
    for (const m of g.drops.group.children) skip.push([m.position.x, m.position.y, m.position.z]);
    let cells = 0;
    let regrown = 0;
    for (const site of L.living) {
      const ids = rollLiving(site, WORLD.seed, epoch);
      // Rock and ore swapping in a wall changes no light. A cell that grows back closes a hole the
      // pick made in the wall, so only the light round that hole changes (behind it is rock): those
      // are rebuilt in small boxes, one per 8 m bin of regrown cells. A crystal (an emitter)
      // appearing or going inside the rock updates incrementally.
      const bins = new Map<number, { x0: number; y0: number; z0: number; x1: number; y1: number; z1: number }>();
      const glints: Array<[number, number, number, number]> = [];
      const res = applyLiving(w.blocks, s.generated, w, site, ids, (i, id) => {
        const x = i % w.sx;
        const y = Math.floor(i / w.sx) % w.sy;
        const z = Math.floor(i / (w.sx * w.sy));
        const old = w.blocks[i];
        w.set(x, y, z, id);
        if (!SOLID[old]) {
          light.data[i * 4 + 3] = 0;
          const key = (x >> 3) + 32 * ((y >> 3) + 32 * (z >> 3));
          const b = bins.get(key);
          if (!b) bins.set(key, { x0: x, y0: y, z0: z, x1: x, y1: y, z1: z });
          else {
            b.x0 = Math.min(b.x0, x);
            b.y0 = Math.min(b.y0, y);
            b.z0 = Math.min(b.z0, z);
            b.x1 = Math.max(b.x1, x);
            b.y1 = Math.max(b.y1, y);
            b.z1 = Math.max(b.z1, z);
          }
        } else if (isEmitter(old) || isEmitter(id)) glints.push([x, y, z, old]);
      }, skip);
      for (const b of bins.values()) {
        const r = REGROW_LIGHT_R;
        const box = { x0: Math.max(0, b.x0 - r), y0: Math.max(0, b.y0 - r), z0: Math.max(0, b.z0 - r), x1: Math.min(w.sx - 1, b.x1 + r), y1: Math.min(w.sy - 1, b.y1 + r), z1: Math.min(w.sz - 1, b.z1 + r) };
        light.recomputeBox(box);
        s.rig.markLightDirty(box);
      }
      for (const [x, y, z, old] of glints) s.rig.markLightDirty(light.onBlockChanged(x, y, z, old));
      cells += res.changed;
      regrown += res.regrown;
    }
    g.progression.fieldsChanged();
    g.markHalosDirty();
    g.bus.emit('world:regrow', { epoch, cells, regrown });
    this.pendingBloom = { epoch, frames: 1 };
    this.stats.regrowMs = performance.now() - t0;
    return this.stats.regrowMs;
  }

  /** The second part of a breath: the bloom of the pending epoch, and the moths that follow it. @returns ms. */
  private growBloom(): number {
    const pending = this.pendingBloom;
    this.pendingBloom = null;
    if (!pending || !this.layout) return 0;
    const t0 = performance.now();
    const g = this.game;
    const { epoch } = pending;
    this.placeBloom(epoch, new Set());
    this.flock.setAnchors(this.anchors(epoch));
    g.markHalosDirty();
    const b = this.bloomSite(epoch);
    if (b) g.bus.emit('world:bloom', { epoch, site: b.id, area: b.area, x: b.p[0], y: b.p[1], z: b.p[2] });
    this.stats.bloomMs = performance.now() - t0;
    return this.stats.bloomMs;
  }

  /** The renewal sites as they stand now (W3 builds rumours and compass targets from them). */
  sites(): LiveSite[] {
    const L = this.layout;
    if (!L) return [];
    const w = this.game.session.world;
    const out: LiveSite[] = [];
    const e = this.epoch;
    for (const site of L.living) {
      let x = 0;
      let y = 0;
      let z = 0;
      for (const i of site.cells) {
        x += i % w.sx;
        y += Math.floor(i / w.sx) % w.sy;
        z += Math.floor(i / (w.sx * w.sy));
      }
      const n = Math.max(1, site.cells.length);
      out.push({ kind: 'living', id: site.id, area: site.area, x: x / n + 0.5, y: y / n, z: z / n + 0.5, epoch: e, ore: site.table.map((r) => ({ ...r })), present: true });
    }
    const b = this.bloomSite(e);
    if (b) {
      const id = `bloom_e${e}`;
      out.push({ kind: 'bloom', id, area: b.area, x: b.p[0], y: b.p[1], z: b.p[2], epoch: e, ore: [{ block: B.CRYSTAL, count: BLOOM.glimmerMax }], present: this.game.session.liveProps.has(id) });
    }
    return out;
  }

  // ------------------------------------------------------------------------------------
  // Debug (window.__DD__.features)

  /** Start a ride; with `at` (0..1 of its duration) it holds still there (mid-ride captures). */
  debugRide(id: string, dir: 'up' | 'down', at?: number): boolean {
    const l = this.link(id);
    if (!l) return false;
    if (this.active) this.endRide();
    this.startRide(l, dir, true);
    const a = this.active as ActiveRide | null;
    if (a && at !== undefined) {
      a.ride.t = Math.max(0, Math.min(1, at)) * a.ride.duration;
      a.hold = true;
    }
    return true;
  }

  /** Release a held debug ride (it runs on to its end). */
  debugRelease(): void {
    if (this.active) this.active.hold = false;
  }

  /**
   * Jump to an epoch: re-roll the living rock and grow the bloom as a camp entry would (both parts
   * at once here). @returns the larger part's ms (a camp entry spends them in separate frames).
   */
  debugSetEpoch(n: number): number {
    this.game.progression.day = Math.max(0, Math.floor(n));
    const rock = this.breathe(this.epoch);
    return Math.max(rock, this.growBloom());
  }

  /** Wake a door as if the lantern held long enough (it then sinks). */
  debugWake(id: string): boolean {
    return this.openDoor(id);
  }

  debugState() {
    const w = this.game.session.world;
    return {
      epoch: this.epoch,
      riding: this.active ? { id: this.active.link.id, dir: this.active.ride.dir, t: this.active.ride.t, duration: this.active.ride.duration } : null,
      hoistReleased: this.hoistReleased,
      doors: this.doors.map((d) => ({ id: d.def.id, state: d.wake.state, progress: d.wake.progress, open: doorIsOpen(w, d.def) })),
      bloom: this.bloomId,
      moths: { active: this.flock.active, drawn: this.stats.drawn, ms: Math.round(this.stats.mothMs * 1000) / 1000 },
      regrowMs: Math.round(this.stats.regrowMs * 10) / 10,
      bloomMs: Math.round(this.stats.bloomMs * 10) / 10,
      sites: this.sites(),
    };
  }

  /** Per-frame costs for __DD__.report(). */
  report(): { mothMs: number; moths: number; drawn: number; regrowMs: number; bloomMs: number } {
    return { ...this.stats };
  }

  dispose(): void {
    this.moths.dispose();
    for (const m of this.cage.children) {
      const mesh = m as THREE.Mesh;
      mesh.geometry.dispose();
    }
    (this.rope.material as THREE.Material).dispose();
  }

  // ------------------------------------------------------------------------------------
  // Internals

  private link(id: string): FeatureLink | null {
    return this.layout?.links.find((l) => l.id === id) ?? null;
  }

  private useHoist(end: 'top' | 'bottom'): void {
    const l = this.link('hoist');
    if (!l) return;
    const g = this.game;
    if (end === 'top') {
      if (!this.hoistReleased) {
        g.ui.hint(t('hint.hoistChained'), 3000);
        return;
      }
      this.startRide(l, 'down');
      return;
    }
    if (!this.hoistReleased) {
      g.discover('hoist');
      g.bus.emit('world:hoistReleased', {});
      this.syncEdges();
    }
    this.startRide(l, 'up');
  }

  private startRide(link: FeatureLink, dir: 'up' | 'down', debug = false): void {
    const g = this.game;
    const ride = createRide(link, dir);
    // The ride faces the wall it runs along (both run up the face of a ledge on its +x side).
    this.active = { link, ride, hold: false, face: Math.PI / 2 };
    g.mining.cancel();
    g.input.mining = false;
    g.clearFocus();
    const s = ride.pts[0];
    g.player.teleport(s[0], s[1], s[2]);
    g.player.grounded = true;
    if (!debug) g.cameraRig.pitch = dir === 'down' ? -0.35 : 0.12;
    g.bus.emit('world:ride', { id: link.id, kind: link.kind, dir, phase: 'start' });
  }

  private endRide(): void {
    const a = this.active;
    if (!a) return;
    const g = this.game;
    const end = rideEnd(a.ride);
    this.active = null;
    g.player.teleport(end[0], end[1], end[2], a.face);
    g.player.grounded = true;
    if (a.link.kind === 'hoist') {
      this.cageY = a.ride.dir === 'up' ? a.link.path[1][1] : a.link.path[2][1];
      this.placeCage();
    }
    g.bus.emit('world:ride', { id: a.link.id, kind: a.link.kind, dir: a.ride.dir, phase: 'end' });
  }

  /** Ride edges for the walking fields (see rideEdges). */
  private syncEdges(): void {
    if (!this.layout) return;
    this.game.progression.setRides(rideEdges(this.layout.links, this.hoistReleased, RIDES.stepsPerSecond));
  }

  private placeCage(): void {
    const l = this.link('hoist');
    if (!l) return;
    const x = l.path[1][0];
    const z = l.path[1][2];
    this.cage.position.set(x, this.cageY, z);
    const len = Math.max(0.1, this.sheaveY - (this.cageY + HOIST_CAGE_HOOK));
    this.rope.position.set(0, HOIST_CAGE_HOOK, 0);
    this.rope.scale.set(1, len, 1);
  }

  private readNote(id: string): void {
    const g = this.game;
    const key = `note.${id}`;
    const first = !g.journal.has(key);
    if (first) g.discover(key);
    else {
      const n = discoveryNumbering(key, g.journal.discoveries);
      g.ui.showDiscovery({ id: key, title: t(`discovery.${key}.title` as TextKey), body: t(`discovery.${key}.body` as TextKey), index: n.index, total: n.total, major: n.major });
    }
    g.bus.emit('world:note', { id, first });
  }

  private takeRelic(spec: PropSpec, id: string): void {
    const g = this.game;
    const item = this.relicItems[id];
    if (item && item in ITEMS) {
      g.grant(item as ItemId, 1);
      g.ui.toast(t('toast.relic', { name: t(ITEMS[item as ItemId].name) }), 'good');
    }
    g.session.removeProp(spec.id);
    g.clearFocus();
    g.markHalosDirty();
    // The rooms behind the rune doors are discoveries; the relics beyond the rift are found with their caverns.
    if (id === 'reliquary') g.discover('reliquary');
    else if (id === 'gallery') g.discover('lampGallery');
  }

  private touchStone(spec: PropSpec): void {
    const g = this.game;
    const first = !g.journal.has('monolith');
    if (first) {
      g.discover('monolith');
      // The stone stays cold and silent; the moths answer it all the same.
      this.flock.spiral(spec.x, spec.y + 4, spec.z, MOTHS.spiralRadius, MOTHS.spiralSeconds);
    } else if (!this.stoneAwake()) g.ui.hint(t('hint.stoneSilent'), 2600);
    g.bus.emit('world:monolith', { first });
  }

  private updateDoors(dt: number): void {
    const g = this.game;
    const p = g.player;
    const tier = g.equipment.tiers.lantern;
    for (const d of this.doors) {
      if (d.sinking) {
        this.stepSinking(d, dt);
        continue;
      }
      if (d.wake.state === 'open') continue;
      const before = d.wake.state;
      wakeStep(d.def, d.wake, dt, { px: p.x, py: p.y, pz: p.z, lanternLit: g.lanternFuel.lit, lanternTier: tier });
      const st = d.wake.state as DoorState;
      if (st === 'open') {
        this.beginSinking(d);
        continue;
      }
      if (st === 'waking') {
        d.emitTimer -= dt;
        if (d.emitTimer <= 0) {
          d.emitTimer = 0.25;
          g.bus.emit('world:runeWake', { id: d.def.id, progress: d.wake.progress });
        }
      }
      // One hint per approach and state.
      if (st !== before && st !== 'idle' && st !== d.hinted) {
        d.hinted = st;
        g.ui.hint(t(st === 'waking' ? 'hint.runesWake' : st === 'dark' ? 'hint.runesDark' : 'hint.runesWeak'), 2600);
      }
      if (st === 'idle' && d.wake.progress === 0) d.hinted = 'idle';
    }
  }

  private beginSinking(d: DoorRun): void {
    d.sinking = { row: 0, timer: 0 };
    const g = this.game;
    g.bus.emit('world:runeOpen', { id: d.def.id, cells: d.def.cells.length });
    g.cameraRig.addTrauma(0.18);
  }

  private stepSinking(d: DoorRun, dt: number): void {
    const s = d.sinking!;
    s.timer -= dt;
    if (s.timer > 0) return;
    const g = this.game;
    const sess = g.session;
    const row = d.rows[s.row];
    for (const [x, y, z] of row) {
      if (!SOLID[sess.world.get(x, y, z)]) continue;
      sess.setBlock(x, y, z, B.AIR);
      g.debris.burst(x + 0.5, y + 0.5, z + 0.5, [0x535a6a, 0x434957, 0x2e3440], g.rng, { count: 6, speed: 2.2, size: [0.06, 0.16], spread: 0.4 });
      g.particles.dust(x + 0.5, y + 0.3, z + 0.5, 0x535a6a, 6, g.rng, 0.6);
    }
    s.row++;
    s.timer = RIDES.doorRowSeconds;
    if (s.row >= d.rows.length) {
      d.sinking = null;
      g.progression.fieldsChanged();
    }
  }

  private updateMoths(dt: number): void {
    const g = this.game;
    const q = g.renderer.quality;
    if (q !== this.quality) {
      this.quality = q;
      this.flock.setLimit(MOTHS.cap[q]);
    }
    const t0 = performance.now();
    const u = g.session.rig.uniforms;
    const ls = this.lanternState;
    ls.x = u.uLanternPos.value.x;
    ls.y = u.uLanternPos.value.y;
    ls.z = u.uLanternPos.value.z;
    ls.lit = g.lanternFuel.lit;
    ls.fuelFrac = g.lanternFuel.fraction;
    const p = g.player;
    this.stats.drawn = this.flock.step(dt, ls, p.x, p.y + 1, p.z, this.isOpen);
    this.stats.moths = this.flock.active;
    this.stats.mothMs = this.stats.mothMs * 0.9 + (performance.now() - t0) * 0.1;
    this.moths.sync();
    this.moths.setPixelScale(g.renderer.canvas.height, g.cameraRig.camera.fov);
  }

  /** A mining hit: scatter the moths near it. */
  startle(x: number, y: number, z: number): void {
    const n = this.flock.startle(x + 0.5, y + 0.5, z + 0.5);
    if (n > 0) this.game.bus.emit('moths:startled', { x, y, z, count: n });
  }

  private anchors(epoch: number): MothAnchor[] {
    const L = this.layout;
    if (!L) return [];
    const out: MothAnchor[] = L.mothAnchors.map((a) => ({ id: a.id, x: a.p[0], y: a.p[1], z: a.p[2], count: a.count, radius: a.radius, secret: a.secret }));
    // The tunnel's first crystals and the Glimmerfall's edge: life where the light already is.
    out.push({ id: 'firstCrystals', x: 77, y: 97.5, z: 55, count: 4, radius: 1.1 });
    out.push({ id: 'glimmerfall', x: 112, y: 43.2, z: 121, count: 6, radius: 1.6 });
    const b = this.bloomSite(epoch);
    if (b && this.game.session.liveProps.has(`bloom_e${epoch}`)) out.push({ id: `bloom_e${epoch}`, x: b.p[0], y: b.p[1] + 1.2, z: b.p[2], count: BLOOM.moths, radius: 1.3 });
    return out;
  }

  private bloomSite(epoch: number) {
    const L = this.layout;
    if (!L || !L.blooms.length) return null;
    const first = Math.max(0, L.blooms.findIndex((b) => b.id === 'chasmEast'));
    return L.blooms[bloomSiteFor(epoch, L.blooms.length, WORLD.seed, first)];
  }

  /** Remove any other bloom and grow this epoch's (unless it was mined: id in `removed`). */
  private placeBloom(epoch: number, removed: ReadonlySet<string>): void {
    const s = this.game.session;
    const id = `bloom_e${epoch}`;
    for (const k of [...s.liveProps.keys()]) if (k.startsWith('bloom_e') && k !== id) s.removeProp(k);
    this.bloomId = null;
    const site = this.bloomSite(epoch);
    if (!site || removed.has(id) || s.removedProps.has(id)) return;
    if (!s.liveProps.has(id)) {
      const [x, y, z] = site.p;
      const cx = Math.floor(x);
      const cz = Math.floor(z);
      const spec: PropSpec = {
        id,
        kind: 'crystalCluster',
        x,
        y,
        z,
        rotY: site.rotY,
        scale: BLOOM.scale,
        anchor: [cx, Math.floor(y) - 1, cz],
        emitters: [[cx, Math.floor(y), cz]],
        minable: { hardness: BLOOM.hardness, tier: 1, drop: 'glimmerShard', min: BLOOM.glimmerMin, max: BLOOM.glimmerMax },
        seed: 0x6b10 + epoch * 7919,
      };
      if (s.world.get(cx, Math.floor(y), cz) === B.AIR) s.setBlock(cx, Math.floor(y), cz, B.LIGHT_CYAN);
      s.liveProps.set(id, spec);
      s.props.add(spec);
      // Its floor may have been mined (this epoch before a reload, or an earlier visit to the
      // site): drop it onto the rock like any settled prop, so one light remains and nothing floats.
      s.settleProps(cx, Math.floor(y) - 1, cz);
    }
    this.bloomId = id;
  }
}

function inBox(x: number, y: number, z: number, b: { min: V3; max: V3 }): boolean {
  return x >= b.min[0] && x <= b.max[0] && y >= b.min[1] && y <= b.max[1] && z >= b.min[2] && z <= b.max[2];
}
