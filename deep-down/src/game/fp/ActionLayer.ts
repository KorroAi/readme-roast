/**
 * Round 3 (UI): the action layout's game side, run by Game every frame (BRIEF §0.6). It turns the
 * InputState the buttons and keys write (ui/hud/actions) into play: the Action button (mine or
 * strike what the reticle is on, hold to go on; throw a bomb or flare from the hotbar), Dash (a dodge
 * with i-frames), Sonar (the lantern pulse: VIS draws it on 'player:sonar', MOBS scans, WORLD
 * reveals lairs), Place (LOOP resolves what the held item puts down; it lands on the face under the
 * reticle), the hotbar and the menu keys. It also fills the round 3 HUD fields (the reticle, the
 * hotbar, cooldowns, the tracker and the arrow, the guardian's bar, the biome and stratum, the
 * tutorial step) and the minimap and Map views, reading LOOP's, WORLD's and MOBS's seams.
 *
 * The other owners' systems are read by duck typing (`game.loop`, `game.quests`, `game.strata`,
 * `game.mobs.activeGuardian`), so this works before, during and after they land in Game.ts.
 */
import * as THREE from 'three';
import { B, BLOCKS, HAZARD_OF, SOLID } from '../../config/blocks';
import { BIOMES, STRATA, type BiomeId } from '../../config/biomes';
import { ITEMS, type ItemId } from '../../config/items';
import { WEAPONS } from '../../config/weapons';
import { isBreakable, rarityOf } from '../../config/rarity';
import { PLAYER } from '../../config/balance';
import { OUTPOST, STATIONS, type StationId } from '../../config/stations';
import { hasText, t, type TextKey } from '../../i18n';
import { raycastVoxels } from '../../world/raycast';
import type { HudState, InteractView, MapMarker, MapSource, MapView, ReticleKind, TrackerLine } from '../../ui/types';
import type { MenuScreen, UiControl } from '../../ui/hud/actions';
import type { LoopActions, PlaceRequest, HotbarView } from '../craft/types';
import type { QuestSystem, QuestStepView } from '../quests/types';
import { inSentence } from '../quests/Quests';
import type { PropSpec } from '../../world/gen/types';
import { DashAbility, SonarAbility, dashDirection, sonarScan } from './abilities';
import { LEVELS as LEVEL_XP } from '../mobs/companion';
import { PLACE_REACH, REACH, SONAR_RADIUS, SONAR_REVEAL } from './constants';
import type { Game } from '../Game';
import './events';

/** LOOP's hub as Game holds it (`game.loop`): the menu actions plus what Place and Throw need. */
export interface LoopLike extends LoopActions {
  placeRequest?(blocks: Partial<Record<'BUILT_PLANK' | 'BUILT_BRICK' | 'TORCH' | 'LADDER' | 'ROPE' | 'DOOR', number>>): PlaceRequest | null;
  consumePlaced?(item: ItemId): void;
  consumeThrown?(item: ItemId): boolean;
  placeStation?(station: string, at: { x: number; y: number; z: number }): unknown;
  placeOutpost?(at: { x: number; y: number; z: number }): { id: string } | null;
  hudSlots?(): HudState['hotbar'];
  bankHere?(): boolean;
  outposts?: ReadonlyArray<{ id: string; stratum: number; x: number; y: number; z: number }>;
  /** Stations placed in the world (the Furnace, Forge and Alchemy Table items). */
  stations?: ReadonlyArray<{ station: StationId; stratum: number; x: number; y: number; z: number }>;
}

/** What the Interact button acts on: a usable prop, else a placed station or an outpost in reach. */
export type InteractTarget =
  | { kind: 'prop'; spec: PropSpec }
  | { kind: 'station'; station: StationId; x: number; y: number; z: number }
  | { kind: 'outpost'; id: string; x: number; y: number; z: number };

/** WORLD's StratumManager as Game holds it (`game.strata`). */
export interface StrataLike {
  current: number;
  seed: number;
  readonly layout: {
    stratum: number;
    biomes: [BiomeId, BiomeId];
    lairs: Array<{ id: string; biome: BiomeId; centre: [number, number, number] }>;
    gate: { centre: [number, number, number] };
    pages: Array<{ id: string; p: [number, number, number]; prop: string }>;
    chests: Array<{ id: string; p: [number, number, number]; prop: string }>;
    outpostSites: Array<{ id: string; p: [number, number, number] }>;
    campSite: { fire: [number, number, number] } | null;
    arrival: { x: number; y: number; z: number };
    regionMap: Uint8Array;
    biomeAt(x: number, y: number, z: number): BiomeId;
    // WORLD's §6 places (read by shape; absent in older layouts).
    vista?: { id: string; name: string; balcony: [number, number, number] } | null;
    rivers?: Array<{ id: string; kind: 'water' | 'lava'; points: Array<[number, number, number]>; spring: [number, number, number] }>;
    dungeon?: { id: string; entry: [number, number, number] } | null;
    secrets?: Array<{ id: string; centre: [number, number, number]; chest: string }>;
    ravines?: Array<{ id: string; top: [number, number, number] }>;
    nests?: Array<{ id: string; p: [number, number, number] }>;
    caverns?: Array<{ centre: [number, number, number] }>;
  } | null;
  readonly map: { sx: number; sz: number; revision: number; has(x: number, z: number): boolean; heightAt(x: number, z: number): number; fraction(): number } | null;
  readonly biomeHere: BiomeId | null;
  depth?(y: number): number;
  isRevealed(id: string): boolean;
  /** Named places (vista, river, works, set pieces, secrets) and whether each was reached. */
  namedSites?(): ReadonlyArray<{ id: string; kind: string; name?: string; centre: [number, number, number] }>;
  isFound?(id: string): boolean;
  readonly works?: { isOpen(): boolean } | null;
  reveal?(id: string, how: 'sonar' | 'page' | 'near' | 'debug'): boolean;
  readonly outposts: ReadonlyArray<{ id: string; stratum: number; x: number; y: number; z: number; biome: BiomeId }>;
  travelTo?(id: string): Promise<boolean>;
  addOutpost?(id: string, x: number, y: number, z: number): unknown;
  enter?(n: number, at?: [number, number, number] | 'lift' | 'arrival'): Promise<void>;
  readonly busy?: boolean;
}

/** The fast-travel id of the camp (stratum I). */
export const CAMP_TRAVEL_ID = 'camp';

interface Seams {
  loop: LoopLike | null;
  quests: QuestSystem | null;
  strata: StrataLike | null;
}

const PLACE_BLOCKS = { BUILT_PLANK: B.BUILT_PLANK, BUILT_BRICK: B.BUILT_BRICK, TORCH: B.TORCH, LADDER: B.LADDER, ROPE: B.ROPE, DOOR: B.DOOR };
/** A ladder item climbs this many cells up the wall; a rope unrolls down at most this far. */
export const LADDER_CELLS = 4;
export const ROPE_CELLS = 16;
const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI'];
/** 'look' and 'move' are reported at most this often (s). */
const USED_EVERY = 0.25;
/** A thrown bomb or flare flies at this speed (m/s), at most this far (m). */
const THROW_SPEED = 16;
const THROW_RANGE = 18;

/** Bearing (radians, + = right) of a horizontal offset (dx, dz) from a camera with this yaw (forward = (-sin, -cos)). */
export function bearingTo(yaw: number, dx: number, dz: number): number {
  const right = dx * Math.cos(yaw) - dz * Math.sin(yaw);
  const fwd = -dx * Math.sin(yaw) - dz * Math.cos(yaw);
  return Math.atan2(right, fwd);
}

const hex = (rgb: readonly number[]) => (Math.round(Math.min(1, rgb[0]) * 255) << 16) | (Math.round(Math.min(1, rgb[1]) * 255) << 8) | Math.round(Math.min(1, rgb[2]) * 255);

/**
 * The span of floor heights a stratum's Map tints and contours over (feet y, low to high), from
 * where its finds and halls stand (chests, pages, lairs, caverns, the gate, the arrival), padded.
 */
export function heightRangeOf(layout: { chests: Array<{ p: readonly number[] }>; pages: Array<{ p: readonly number[] }>; lairs: Array<{ centre: readonly number[] }>; gate: { centre: readonly number[] }; arrival: { y: number }; caverns?: Array<{ centre: readonly number[] }> }): [number, number] {
  let lo = layout.arrival.y;
  let hi = layout.arrival.y;
  const add = (y: number) => {
    if (!Number.isFinite(y)) return;
    if (y < lo) lo = y;
    if (y > hi) hi = y;
  };
  for (const c of layout.chests) add(c.p[1]);
  for (const p of layout.pages) add(p.p[1]);
  for (const l of layout.lairs) add(l.centre[1]);
  for (const c of layout.caverns ?? []) add(c.centre[1]);
  add(layout.gate.centre[1]);
  return [Math.floor(lo - 4), Math.ceil(hi + 4)];
}

interface Throw {
  item: ItemId;
  /** What bursts where it lands: a Blast Bomb, a Flash Charge (its use names the weapon), or a flare. */
  kind: 'bomb' | 'flash' | 'flare';
  x: number;
  y: number;
  z: number;
  t: number;
}

/**
 * The black-out line for a creature (QA 00:03): a name with its own article ("The Amber Matriarch",
 * "La Matriarche…") keeps it, lowered in the sentence ("Struck down by the Amber Matriarch"); any
 * other takes the language's own (English "a Grit Boar", "an Amber Tick": the templates hold the
 * article, so French and others place the name as their line wants it). Null: an unnamed creature.
 */
export function causeByName(name: string | null): string {
  if (!name) return t('bo3.cause.creature');
  if (/^(The|Le|La|Les)\s/.test(name) || /^L['’]/.test(name)) return t('bo3.cause.named', { name: inSentence(name) });
  return t(/^[AEIOU]/i.test(name) ? 'bo3.cause.mobAn' : 'bo3.cause.mob', { name });
}

export class ActionLayer {
  readonly dash = new DashAbility();
  readonly sonar = new SonarAbility();
  /** The Action press chose a creature: holding goes on striking it (and mines nothing). */
  private actionOnMob = false;
  /** This layer set input.mining for a held Action (and must release it). */
  private actionMining = false;
  private lookAt = -1;
  private moveAt = -1;
  private time = 0;
  private reticleKind: ReticleKind = 'none';
  private reticleProgress = 0;
  private reticleName: string | null = null;
  private probeFrame = 0;
  private probeMob: 'attack' | 'use' | null = null;
  private sonarHintAt = -10;
  private throws: Throw[] = [];
  private readonly dir = { x: 0, z: 0 };
  private readonly origin = new THREE.Vector3();
  private readonly ray = new THREE.Vector3();
  /** The minimap's source, rebuilt when the stratum, its layout or its explored map is a new object. */
  private mapCache: { rev: number; map: object; layout: object; src: MapSource; cacheKey: string; found: number } | null = null;
  /** The stratum a black-out left the pack in (the cache itself records only x, y, z). */
  private cacheStratum: number | null = null;
  private readonly markers: MapMarker[] = [];
  private tipShown = new Set<string>();

  /** What hurt the explorer last (the black-out card names it). */
  private lastHurt: { what: 'mob' | 'fall' | 'hazard' | 'cold'; kind?: string; hazard?: string; at: number } | null = null;
  private hazardKind: string | null = null;

  /** Bumped by the events that change the places on the Map (see foundCount). */
  private placesRev = 0;
  private wasSprint = false;

  constructor(private readonly game: Game) {
    const bus = game.bus;
    const placesMoved = () => {
      this.placesRev++;
    };
    bus.on('world:site', placesMoved);
    bus.on('world:lairRevealed', placesMoved);
    bus.on('world:worksOpened', placesMoved);
    bus.on('mob:guardianDefeated', placesMoved);
    // The pack a black-out leaves lies in this stratum (the Map marks it there only).
    bus.on('player:died', () => {
      const { strata } = this.seams();
      this.cacheStratum = strata?.layout ? strata.current : null;
      this.placesRev++;
    });
    bus.on('cache:recovered', placesMoved);
    bus.on('mob:attack', (e) => {
      if (e.landed) this.lastHurt = { what: 'mob', kind: e.kind, at: this.time };
    });
    bus.on('hazard:changed', (e) => {
      this.hazardKind = e.kind;
    });
    bus.on('player:damaged', (e) => {
      // A creature's blow also reports 'hazard': the creature (this very frame) stays the cause.
      if (this.lastHurt?.what === 'mob' && this.time - this.lastHurt.at < 0.05) return;
      this.lastHurt = e.cause === 'fall' ? { what: 'fall', at: this.time } : e.cause === 'cold' ? { what: 'cold', at: this.time } : { what: 'hazard', hazard: this.hazardKind ?? undefined, at: this.time };
    });
  }

  /** Where a black-out wakes the explorer (the card's last line): an outpost's bed, the camp, the lift. */
  wakeLine(): string {
    const { loop, strata } = this.seams();
    const spot = (loop as unknown as { respawnSpot?(): { x: number; y: number; z: number } | null } | null)?.respawnSpot?.() ?? null;
    if (spot && strata?.layout) return t('bo3.wakeOutpost', { biome: t(BIOMES[strata.layout.biomeAt(spot.x, spot.y, spot.z)].name) });
    if (strata?.layout && strata.current > 1) return t('bo3.wakeLift');
    return t('bo3.wakeCamp');
  }

  /** The black-out card's line of what did it (causeByName for a creature). */
  blackoutCause(): string {
    const h = this.lastHurt;
    if (!h) return t('bo3.cause.unknown');
    if (h.what === 'mob') {
      const name = (this.game.mobs as unknown as { bestiaryView?(): { entries: Array<{ kind: string; name: string }> } }).bestiaryView?.().entries.find((e) => e.kind === h.kind)?.name;
      return causeByName(name ?? null);
    }
    if (h.what === 'fall') return t('bo3.cause.fall');
    if (h.what === 'cold' || h.hazard === 'cold') return t('bo3.cause.cold');
    if (h.hazard === 'gas') return t('bo3.cause.gas');
    if (h.hazard === 'heat') return t('bo3.cause.heat');
    if (h.hazard === 'dark') return t('bo3.cause.dark');
    return t('bo3.cause.unknown');
  }

  /** The other owners' seams on Game, read by shape (null until they exist). */
  seams(): Seams {
    const g = this.game as unknown as { loop?: LoopLike; quests?: QuestSystem; strata?: StrataLike };
    return { loop: g.loop ?? null, quests: g.quests ?? null, strata: g.strata ?? null };
  }

  /** Seconds of invulnerability left (a dash). */
  get invulnerable(): number {
    return this.dash.iframes;
  }

  /** @param session a new session (the title screen): also forget where the last pack was left. */
  reset(session = false): void {
    if (session) this.cacheStratum = null;
    this.lastHurt = null;
    this.dash.reset();
    this.sonar.cooldown.reset();
    this.actionOnMob = false;
    this.actionMining = false;
    this.throws = [];
  }

  /** A control was used (the tutorial and first-time tips listen). */
  private used(control: UiControl, extra?: { screen?: string; slot?: number }): void {
    this.game.bus.emit('ui:used', { control, ...extra });
  }

  /**
   * Run the frame's actions. Call after the tap and combat updates and before the mining update
   * (the Action button feeds input.mining), with `blocked` (a screen is open) and `riding`.
   */
  update(dt: number, blocked: boolean, riding: boolean): void {
    const g = this.game;
    const input = g.input;
    this.time += dt;
    this.dash.update(dt);
    this.sonar.update(dt);
    this.updateThrows(dt);
    const p = g.player;
    p.sprint = !blocked && !riding && input.sprint;
    p.jumpHeld = !blocked && input.jumpHeld;
    // A sprint's start: the lens widens a touch (speed felt, no shake).
    if (p.sprint && !this.wasSprint) g.cameraRig.kickFov(3);
    this.wasSprint = p.sprint;

    // Report look and move for the tutorial (a few times a second).
    if (!blocked && (input.lookDX !== 0 || input.lookDY !== 0) && this.time - this.lookAt > USED_EVERY) {
      this.lookAt = this.time;
      this.used('look');
    }
    if (!blocked && (input.moveX !== 0 || input.moveY !== 0) && this.time - this.moveAt > USED_EVERY) {
      this.moveAt = this.time;
      this.used(input.sprint ? 'sprint' : 'move');
    }
    if (blocked) {
      this.releaseAction();
      return;
    }
    // Menus from the keys and the HUD buttons.
    if (input.openRequest) {
      const screen = input.openRequest;
      this.used('open', { screen });
      g.openMenu(screen);
      return;
    }
    const { loop } = this.seams();
    if (input.hotbarPressed >= 0) {
      const slot = input.hotbarPressed;
      loop?.selectHotbar(slot);
      this.used('hotbar', { slot });
    }
    if (riding) {
      this.releaseAction();
      return;
    }
    if (input.jumpPressed) this.used('jump');
    if (input.interactPressed) {
      this.used('interact');
      // A placed station or an outpost (no prop of its own): Game uses a focused prop itself.
      const it = g.focusTarget() ? null : this.interactTarget();
      if (it && it.kind !== 'prop') this.useTarget(it);
    }

    // Dash: along the stick (or back), invulnerable for a moment.
    if (input.dashPressed) {
      if (this.dash.tryDash()) {
        dashDirection(input.moveX || input.autoMoveX, input.moveY || input.autoMoveY, g.cameraRig.moveYaw, this.dir);
        p.dash(this.dir.x, this.dir.z);
        // The burst reads as speed: the lens widens a little and eases back (no shake).
        g.cameraRig.kickFov(6);
        g.bus.emit('player:dash', { x: p.x, y: p.y, z: p.z, iframes: this.dash.iframes });
        g.tapStop();
        this.used('dash');
      }
    }
    // Sonar: the lantern pulse.
    if (input.sonarPressed) this.pulse();

    // The Action button: a creature under the reticle is struck; else the held item acts.
    const mode = loop?.hotbarView().mode ?? 'mine';
    if (input.actionPressed) {
      this.used('action');
      if (g.combat.tap(0, 0)) this.actionOnMob = true;
      else if (mode === 'throw') this.throwHeld(loop);
      else if (mode === 'place') this.place();
      else if (mode === 'use') {
        const held = loop?.hotbarView().held;
        if (held && loop && !loop.use(held)) g.ui.hint(t('bag3.cantUse'), 1600);
      } else if (this.reticleKind === 'use' && g.focusTarget()) g.interact(g.focusTarget()!);
    }
    if (!input.actionHeld) this.releaseAction();
    else if (!this.actionOnMob && (mode === 'mine' || mode === 'attack' || mode === 'none')) {
      // Hold to mine what the reticle is on (the centre ray), like the mouse with the pointer captured.
      input.mining = true;
      input.aimFromPointer = false;
      input.aimX = 0;
      input.aimY = 0;
      this.actionMining = true;
    }
    g.combat.holding = g.combat.holding || (this.actionOnMob && input.actionHeld);
    // Place (the button, the right mouse button).
    if (input.placePressed) this.place();
  }

  private releaseAction(): void {
    if (this.actionMining) {
      this.game.input.mining = false;
      this.actionMining = false;
    }
    this.actionOnMob = false;
  }

  /** The sonar pulse (BRIEF §0.6): 2 s of finds through rock, on a cooldown. */
  pulse(): boolean {
    const g = this.game;
    if (!this.sonar.tryPulse()) {
      if (this.time - this.sonarHintAt > 3) {
        this.sonarHintAt = this.time;
        g.ui.hint(t('ctl.sonarCharging', { seconds: Math.ceil(this.sonar.cooldown.left) }), 1600);
      }
      return false;
    }
    const e = g.eyePosition();
    const radius = SONAR_RADIUS;
    g.bus.emit('player:sonar', { x: e.x, y: e.y, z: e.z, radius, seconds: SONAR_REVEAL });
    // MOBS: every creature in range gets scanned (a bestiary page).
    const mobs = g.mobs as unknown as { scan?(x: number, y: number, z: number, r: number): number } | undefined;
    mobs?.scan?.(e.x, e.y, e.z, radius);
    // WORLD: a lair within the pulse is revealed on the map.
    const { strata } = this.seams();
    for (const lair of strata?.layout?.lairs ?? []) {
      if (Math.hypot(lair.centre[0] - e.x, lair.centre[1] - e.y, lair.centre[2] - e.z) <= radius * 1.5) strata?.reveal?.(lair.id, 'sonar');
    }
    this.used('sonar');
    return true;
  }

  /** How many finds a pulse here would show (for tests and the debug API; VIS draws the real ones). */
  scanCount(radius = SONAR_RADIUS): number {
    const g = this.game;
    const e = g.eyePosition();
    return sonarScan(g.session.world, e.x, e.y, e.z, radius, (id) => id !== 0 && isBreakable(id) && rarityOf(id) !== null).length;
  }

  /**
   * Place the held item on the face under the reticle: a block, torch, ladder or rope goes into the
   * open cell in front of the face (never into the explorer); a station or an outpost on the floor
   * there. @returns true when something was placed.
   */
  place(): boolean {
    const g = this.game;
    const { loop } = this.seams();
    const req = loop?.placeRequest?.(PLACE_BLOCKS) ?? null;
    if (!loop || !req) {
      if (loop) g.ui.hint(t('ctl.placeNothing'), 1800);
      return false;
    }
    const kind = req.kind;
    const cells = this.placeCells(kind);
    if (!cells) {
      g.ui.hint(t(kind === 'station' || kind === 'outpost' ? 'ctl.placeNoFloor' : 'ctl.placeNoRoom'), 1800);
      return false;
    }
    const [x, y, z] = cells[0];
    if (req.kind === 'station' || req.kind === 'outpost') {
      const at = { x: x + 0.5, y, z: z + 0.5 };
      if (req.kind === 'station') loop.placeStation?.(req.station, at);
      else {
        // LOOP registers the outpost with WORLD's strata itself (fast travel, the map).
        const o = loop.placeOutpost?.(at);
        if (!o) {
          g.ui.hint(t('ctl.outpostMax'), 2200);
          return false;
        }
      }
      loop.consumePlaced?.(req.item);
      g.bus.emit('player:placed', { item: req.item, block: 0, x, y, z });
      this.used('place');
      return true;
    }
    // A ladder climbs the wall up to LADDER_CELLS; a rope unrolls down to the floor (one item each).
    const w = g.session.world;
    for (const [cx, cy, cz] of cells) {
      const old = w.get(cx, cy, cz);
      g.session.setBlock(cx, cy, cz, req.block);
      g.onPlaced(cx, cy, cz, old);
    }
    loop.consumePlaced?.(req.item);
    g.bus.emit('player:placed', { item: req.item, block: req.block, x, y, z });
    this.used('place');
    return true;
  }

  /** The face under the reticle within reach, and the open cell in front of it (or null). */
  placeTarget(): { cell: [number, number, number]; n: [number, number, number] } | null {
    const g = this.game;
    g.cameraRig.rayThrough(0, 0, this.origin, this.ray);
    const w = g.session.world;
    const hit = raycastVoxels(w, this.origin.x, this.origin.y, this.origin.z, this.ray.x, this.ray.y, this.ray.z, PLACE_REACH + 1.5);
    if (!hit) return null;
    const x = hit.x + hit.nx;
    const y = hit.y + hit.ny;
    const z = hit.z + hit.nz;
    const eye = g.eyePosition();
    if (Math.hypot(x + 0.5 - eye.x, y + 0.5 - eye.y, z + 0.5 - eye.z) > PLACE_REACH + 0.5) return null;
    return { cell: [x, y, z], n: [hit.nx, hit.ny, hit.nz] };
  }

  /**
   * The cells the Place action fills for an item `kind` (null: no room):
   * - a block or a door: the open cell in front of the face, never inside the explorer;
   * - a torch: that cell, on any face;
   * - a ladder: a column up from it while the cells are open, up to LADDER_CELLS;
   * - a rope: a column down from it to the floor, up to ROPE_CELLS;
   * - a station or an outpost: the floor under that cell (within 3 m down), with room to stand.
   */
  placeCells(kind: PlaceRequest['kind']): Array<[number, number, number]> | null {
    const tgt = this.placeTarget();
    if (!tgt) return null;
    const w = this.game.session.world;
    // Only open air takes a placed thing (never water, a torch already there, or a ladder).
    const open = (x: number, y: number, z: number) => w.get(x, y, z) === B.AIR;
    const [x, y, z] = tgt.cell;
    if (!open(x, y, z)) return null;
    if (kind === 'block' || kind === 'door') return this.overlapsExplorer(x, y, z) ? null : [[x, y, z]];
    if (kind === 'torch') return [[x, y, z]];
    if (kind === 'ladder') {
      const out: Array<[number, number, number]> = [[x, y, z]];
      for (let k = 1; k < LADDER_CELLS && open(x, y + k, z); k++) out.push([x, y + k, z]);
      return out;
    }
    if (kind === 'rope') {
      const out: Array<[number, number, number]> = [[x, y, z]];
      for (let k = 1; k < ROPE_CELLS && open(x, y - k, z); k++) out.push([x, y - k, z]);
      return out;
    }
    // A station or an outpost stands on the floor below the aimed cell, with two cells of room.
    for (let k = 0; k <= 3; k++) {
      const fy = y - k;
      if (!open(x, fy, z)) return null;
      if (SOLID[w.get(x, fy - 1, z)]) return open(x, fy + 1, z) && !this.overlapsExplorer(x, fy, z) ? [[x, fy, z]] : null;
    }
    return null;
  }

  private overlapsExplorer(x: number, y: number, z: number): boolean {
    const p = this.game.player;
    const hw = PLAYER.width / 2;
    return x + 1 > p.x - hw && x < p.x + hw && z + 1 > p.z - hw && z < p.z + hw && y + 1 > p.y && y < p.y + PLAYER.height;
  }

  /** The first cell Place would fill (the reticle's "place" mark), or null. */
  placeCell(solid: boolean): [number, number, number] | null {
    return this.placeCells(solid ? 'block' : 'torch')?.[0] ?? null;
  }

  /** Throw the held bomb or flare along the view: it lands where the ray meets rock (or at range). */
  private throwHeld(loop: LoopLike | null): void {
    const g = this.game;
    const held = loop?.hotbarView().held ?? null;
    const use = held ? ITEMS[held].use : undefined;
    if (!loop || !held || (use?.kind !== 'bomb' && use?.kind !== 'flare')) return;
    if (!loop.consumeThrown?.(held)) return;
    g.cameraRig.rayThrough(0, 0, this.origin, this.ray);
    const hit = raycastVoxels(g.session.world, this.origin.x, this.origin.y, this.origin.z, this.ray.x, this.ray.y, this.ray.z, THROW_RANGE);
    const d = hit ? Math.max(0.5, hit.distance - 0.3) : THROW_RANGE;
    // A bomb's use names its weapon (the Flash Charge scares and dazzles, the Blast Bomb blasts).
    const kind: Throw['kind'] = use.kind === 'flare' ? 'flare' : use.weapon === 'flash' ? 'flash' : 'bomb';
    this.throws.push({ item: held, kind, x: this.origin.x + this.ray.x * d, y: this.origin.y + this.ray.y * d, z: this.origin.z + this.ray.z * d, t: d / THROW_SPEED + 0.15 });
    g.bus.emit('weapon:swing', { weapon: kind, ranged: true });
  }

  private updateThrows(dt: number): void {
    if (!this.throws.length) return;
    const g = this.game;
    for (let i = this.throws.length - 1; i >= 0; i--) {
      const th = this.throws[i];
      th.t -= dt;
      if (th.t > 0) continue;
      this.throws.splice(i, 1);
      const mobs = g.mobs as unknown as { blast?(x: number, y: number, z: number, r: number, dmg: number): number; flash(x: number, y: number, z: number, r: number, dmg?: number): number } | undefined;
      // The Blast Bomb blasts (WEAPONS.bomb); the Flash Charge dazzles and scares (WEAPONS.flash, its
      // own damage); a flare only scares.
      const w = (WEAPONS as Record<string, { damage: number; area?: number } | undefined>)[th.kind === 'bomb' ? 'bomb' : 'flash'];
      const radius = w?.area ?? (th.kind === 'bomb' ? 3.5 : 6);
      const count = th.kind === 'bomb' ? mobs?.blast?.(th.x, th.y, th.z, radius, w?.damage ?? 30) ?? 0 : mobs?.flash(th.x, th.y, th.z, radius, th.kind === 'flash' ? w?.damage ?? 0 : 0) ?? 0;
      g.particles.sparkle(th.x, th.y, th.z, th.kind === 'bomb' ? 0xffa45a : 0xfff1c4, th.kind === 'bomb' ? 18 : 12, g.rng, 2.4);
      g.bus.emit('weapon:flash', { x: th.x, y: th.y, z: th.z, radius, count, kind: th.kind });
    }
  }

  // ------------------------------------------------------------------------------------
  // The HUD

  /** The reticle: what Action would do on what the centre of the view is on. */
  private updateReticle(blocked: boolean): void {
    const g = this.game;
    this.reticleName = null;
    if (blocked || g.isRiding()) {
      this.reticleKind = 'none';
      this.reticleProgress = 0;
      return;
    }
    const { loop } = this.seams();
    const mode = loop?.hotbarView().mode ?? 'mine';
    // The mob probe (a screen-space search) runs every other frame.
    if (++this.probeFrame % 2 === 0) {
      const mob = g.combat.pickMob(0, 0);
      this.probeMob = mob && mob.position.distanceTo(g.eyePosition()) < 12 ? (mob.hostile ? 'attack' : 'use') : null;
    }
    if (this.probeMob) {
      this.reticleKind = this.probeMob;
      this.reticleProgress = 0;
      return;
    }
    if (mode === 'place') {
      this.reticleKind = this.placeCell(false) ? 'place' : 'none';
      this.reticleProgress = 0;
      return;
    }
    const hand = g.eyePosition();
    const { target } = g.mining.pick(0, 0, hand.x, hand.y, hand.z, REACH + 2);
    if (target && target.inReach && (target.kind === 'prop' || isBreakable(target.block))) {
      const tooHard = target.tier > g.equipment.tiers.pickaxe || target.protectedReason !== null;
      this.reticleKind = tooHard ? 'blocked' : 'mine';
      this.reticleProgress = g.miningRules.targetKey === target.key ? g.miningRules.progress : 0;
      this.reticleName = target.name || null;
      return;
    }
    this.reticleKind = g.focusTarget() ? 'use' : 'none';
    this.reticleProgress = 0;
  }

  /** Fill the round 3 HUD fields (one object, in place). */
  fillHud(h: HudState, blocked: boolean): void {
    const g = this.game;
    this.updateReticle(blocked);
    h.reticle = this.reticleKind;
    h.reticleProgress = this.reticleProgress;
    // A find mined at the finger (a tap, a hold) names itself too while it cracks.
    h.reticleName = this.reticleName ?? (h.target && h.target.progress > 0 ? h.target.name : null);
    h.dashCooldown = this.dash.cooldown.fraction;
    h.sonarCooldown = this.sonar.cooldown.fraction;
    h.sprinting = g.input.sprint;
    const { loop, quests, strata } = this.seams();
    // The hotbar.
    if (loop) {
      const v: HotbarView = loop.hotbarView();
      if (loop.hudSlots) h.hotbar = loop.hudSlots();
      h.hotbarSelected = v.selected;
      h.canPlace = v.mode === 'place';
    }
    // Where: the stratum and the biome.
    const biome = strata?.biomeHere ?? null;
    h.stratum = strata?.layout ? strata.current : 1;
    h.biomeName = biome ? t(BIOMES[biome].name) : '';
    if (strata?.layout && strata.depth) h.depth = Math.max(0, Math.round(strata.depth(g.player.y)));
    // The tracker, the arrow and the tutorial (LOOP's quests).
    if (quests) {
      const main = quests.main();
      h.tracker.main = this.line(main, h.tracker.main);
      const side = quests.side();
      h.tracker.side = side ? this.line(side, h.tracker.side) : null;
      const tgt = main.target;
      if (tgt && (!strata?.layout || tgt.stratum === strata.current)) {
        const p = g.player;
        const dx = tgt.x - p.x;
        const dz = tgt.z - p.z;
        h.objectiveArrow = { bearing: bearingTo(g.cameraRig.yaw, dx, dz), distance: Math.hypot(dx, tgt.y - p.y, dz), vertical: tgt.y - p.y > 4 ? 1 : tgt.y - p.y < -4 ? -1 : 0 };
      } else h.objectiveArrow = null;
      const tut = quests.tutorial();
      h.tutorial = tut ? { target: tut.highlight, line: tut.line, step: tut.index, total: tut.total } : null;
    }
    // The hazard meter (LOOP's hazards: cold, gas, heat, dark).
    const lh = (loop as unknown as { hud?(yaw: number): { hazard: { kind: 'cold' | 'gas' | 'heat' | 'dark' | null; level: number; warded: number } } } | null)?.hud?.(g.cameraRig.yaw);
    const hz = lh?.hazard;
    h.hazard = hz && hz.kind && (hz.level > 0.02 || hz.warded > 0) ? { kind: hz.kind, level: hz.level, warded: hz.warded } : null;
    // The guardian's bar (MOBS).
    const mobs = g.mobs as unknown as { activeGuardian?(): { name: string; hp: number; max: number; phase: number; phases: number; vulnerable?: boolean; window?: number; telegraph?: string | null } | null } | undefined;
    const gs = mobs?.activeGuardian?.() ?? null;
    if (gs) {
      // The open guard (a closing window) and the wind-up's plain line (MOBS's text key).
      const gb = h.guardian ?? { name: '', hp: 0, max: 1, phase: 1, phases: 1, open: null, telegraph: null };
      gb.name = gs.name;
      gb.hp = gs.hp;
      gb.max = gs.max;
      gb.phase = gs.phase;
      gb.phases = gs.phases;
      gb.open = gs.vulnerable ? Math.max(0, Math.min(1, gs.window ?? 1)) : null;
      gb.telegraph = gs.telegraph && hasText(gs.telegraph) ? t(gs.telegraph as TextKey) : null;
      h.guardian = gb;
    } else h.guardian = null;
    // The companion's chip (MOBS: a tamed Lampling).
    const cv = (g.mobs as unknown as { companion?(): { name: string; level: number; xp: number; next: number | null; state: 'follow' | 'scout' | 'fight'; glow: number } | null } | undefined)?.companion?.() ?? null;
    if (cv) {
      const from = LEVEL_XP[Math.max(0, cv.level - 1)] ?? 0;
      const progress = cv.next === null ? 1 : Math.max(0, Math.min(1, (cv.xp - from) / Math.max(1, cv.next - from)));
      const c = h.companion ?? { name: '', level: 0, progress: 0, state: 'follow', glow: 0 };
      c.name = cv.name;
      c.level = cv.level;
      c.progress = progress;
      c.state = cv.state;
      c.glow = cv.glow;
      h.companion = c;
    } else h.companion = null;
    // The Interact chip: the prop in focus, else a placed station or an outpost in reach.
    const it = blocked ? null : this.interactTarget();
    h.interact = it ? this.viewOf(it) : null;
    g.ui.touch.setInteract?.(h.interact);
    // First-time tooltips for the contextual buttons.
    if (h.canPlace) this.tipOnce('place', 'place', 'tip.place');
    if (h.interact) this.tipOnce('interact', 'interact', 'tip.interact');
  }

  private tipOnce(id: string, target: 'place' | 'interact' | 'sonar' | 'dash', key: TextKey): void {
    if (this.tipShown.has(id)) return;
    this.tipShown.add(id);
    this.game.ui.tip?.(`tip:${id}`, target, t(key));
  }

  /** A tracker line from a quest step (reusing the last object when nothing changed). */
  private line(s: QuestStepView, prev: TrackerLine | null): TrackerLine {
    const have = s.progress?.have;
    const need = s.progress?.need;
    if (prev && prev.id === s.id && prev.text === s.text && prev.have === have && prev.need === need) return prev;
    return { id: s.id, text: s.text, have, need };
  }

  /** What Interact would act on now (null: nothing in reach). */
  interactTarget(): InteractTarget | null {
    const g = this.game;
    const focus = g.focusTarget();
    if (focus) return { kind: 'prop', spec: focus };
    const { loop, strata } = this.seams();
    if (!loop) return null;
    const p = g.player;
    const here = strata?.layout ? strata.current : 1;
    let best: InteractTarget | null = null;
    let bd = Infinity;
    for (const st of loop.stations ?? []) {
      if (st.stratum !== here) continue;
      const d = Math.hypot(st.x - p.x, (st.y - p.y) * 0.7, st.z - p.z);
      if (d <= Math.min(STATIONS[st.station]?.reach ?? 4.5, 4.5) && d < bd) {
        bd = d;
        best = { kind: 'station', station: st.station, x: st.x, y: st.y, z: st.z };
      }
    }
    for (const o of loop.outposts ?? []) {
      if (o.stratum !== here) continue;
      const d = Math.hypot(o.x - p.x, (o.y - p.y) * 0.7, o.z - p.z);
      if (d <= OUTPOST.useRadius && d < bd) {
        bd = d;
        best = { kind: 'outpost', id: o.id, x: o.x, y: o.y, z: o.z };
      }
    }
    return best;
  }

  /** The chip's icon, verb and label for a target. */
  private viewOf(it: InteractTarget): InteractView {
    if (it.kind === 'prop') return this.interactView(it.spec);
    if (it.kind === 'station') return { icon: 'station', verb: t('ctl.verb.craft'), label: t(STATIONS[it.station].name) };
    return { icon: 'outpost', verb: t('ctl.verb.bank'), label: t('m3.map.m.outpost') };
  }

  /** Use a placed station (Craft opens on its recipes) or an outpost (the Bag opens on its bank). */
  private useTarget(it: InteractTarget): void {
    const g = this.game;
    if (it.kind === 'prop') {
      g.interact(it.spec);
      return;
    }
    if (it.kind === 'station') {
      g.ui.focusCraft?.(it.station);
      g.openMenu('crafting');
      return;
    }
    g.openMenu('inventory');
  }

  /** The Interact chip's icon and verb for a usable prop. */
  interactView(spec: PropSpec): InteractView {
    const g = this.game;
    const label = g.interactLabelOf(spec);
    const kind = spec.kind as string;
    const feature = (spec as { feature?: { kind?: string } }).feature?.kind;
    let icon: InteractView['icon'] = 'other';
    let verb: TextKey = 'ctl.verb.use';
    if (feature === 'cache' || kind === 'chest' || kind === 'crate') [icon, verb] = ['chest', 'ctl.verb.open'];
    else if (feature === 'note' || kind === 'haldenNote') [icon, verb] = ['page', 'ctl.verb.read'];
    else if (feature === 'rope' || feature === 'hoist') [icon, verb] = ['rope', 'ctl.verb.ride'];
    else if (kind === 'workbench' || kind === 'forge' || kind === 'furnace' || kind === 'alchemy' || kind === 'alchemyTable' || kind === 'station' || spec.interact === 'craft') [icon, verb] = ['station', 'ctl.verb.craft'];
    else if (kind === 'gate' || feature === 'gate') [icon, verb] = ['gate', 'ctl.verb.use'];
    else if (kind === 'outpost' || feature === 'outpost') [icon, verb] = ['outpost', 'ctl.verb.rest'];
    else if (spec.interact === 'rest') [icon, verb] = ['bed', 'ctl.verb.rest'];
    else if (kind === 'bedroll') [icon, verb] = ['bed', 'ctl.verb.rest'];
    else if (kind === 'door') [icon, verb] = ['door', 'ctl.verb.open'];
    return { icon, verb: t(verb), label };
  }

  // ------------------------------------------------------------------------------------
  // The minimap and the Map

  /** The explored stratum for the minimap and the Map (null in the first version's world). */
  mapSource(): MapSource | null {
    const g = this.game;
    const { strata, loop } = this.seams();
    const map = strata?.map;
    const layout = strata?.layout;
    if (!strata || !map || !layout) return null;
    const p = g.player;
    let c = this.mapCache;
    // A new game or a stratum switch brings a new layout and a new explored map: never draw a stale one.
    if (!c || c.map !== map || c.layout !== layout) {
      const world = g.session.world;
      const biomes = layout.biomes;
      const colors = [hex(BIOMES[biomes[0]].light), hex(BIOMES[biomes[1]].light), 0xff5a3a];
      const sx = map.sx;
      const src: MapSource = {
        width: map.sx,
        depth: map.sz,
        originX: 0,
        originZ: 0,
        revision: 0,
        cell: (x, z) => {
          if (!map.has(x, z)) return 0;
          const y = map.heightAt(x, z);
          const below = world.get(Math.floor(x), y - 1, Math.floor(z));
          if (HAZARD_OF[below]) return 4;
          return SOLID[world.get(Math.floor(x), y, Math.floor(z))] ? 1 : 2;
        },
        biome: (x, z) => layout.regionMap[Math.floor(x) + Math.floor(z) * sx] ?? 0,
        height: (x, z) => map.heightAt(x, z),
        biomeColors: colors,
        markers: this.markers,
        heightRange: heightRangeOf(layout),
        playerX: p.x,
        playerZ: p.z,
        yaw: g.cameraRig.yaw,
      };
      this.markers.length = 0;
      c = this.mapCache = { rev: -1, map, layout, src, cacheKey: '', found: -1 };
    }
    const src = c.src;
    src.playerX = p.x;
    src.playerZ = p.z;
    src.yaw = g.cameraRig.yaw;
    // Markers: rebuilt when the explored map changed (pages and chests show once their column is seen),
    // when a named place is reached, or when the pack left behind appears or goes.
    const cache = this.cacheHere();
    const cacheKey = cache ? `${Math.round(cache.x)},${Math.round(cache.z)}` : '';
    const found = this.foundCount();
    if (c.rev !== map.revision || this.markers.length === 0 || c.cacheKey !== cacheKey || c.found !== found) {
      c.rev = map.revision;
      c.cacheKey = cacheKey;
      c.found = found;
      const m = this.markers;
      m.length = 0;
      const seen = (x: number, z: number) => map.has(x, z);
      const isFound = (id: string) => strata.isFound?.(id) ?? false;
      const siteTitle = (name: string | undefined) => (name && hasText(`site.${name}.title`) ? t(`site.${name}.title` as TextKey) : undefined);
      // The camp (stratum I: its fire), or this stratum's arrival (the lift landing).
      const fire = layout.campSite?.fire;
      if (fire) m.push({ kind: 'camp', x: fire[0] + 0.5, z: fire[2] + 0.5 });
      else m.push({ kind: 'camp', x: layout.arrival.x, z: layout.arrival.z, label: t('m3.map.lift') });
      for (const l of layout.lairs) if (strata.isRevealed(l.id)) m.push({ kind: 'lair', x: l.centre[0], z: l.centre[2], id: l.id, label: t(BIOMES[l.biome].name), done: this.guardianBeaten(l.biome) });
      if (seen(layout.gate.centre[0], layout.gate.centre[2])) m.push({ kind: 'gate', x: layout.gate.centre[0], z: layout.gate.centre[2] });
      const live = g.session.liveProps;
      for (const pg of layout.pages) if (seen(pg.p[0], pg.p[2])) m.push({ kind: 'page', x: pg.p[0], z: pg.p[2], id: pg.id, done: !live.has(pg.prop) });
      for (const ch of layout.chests) if (seen(ch.p[0], ch.p[2])) m.push({ kind: 'chest', x: ch.p[0], z: ch.p[2], id: ch.id, done: !live.has(ch.prop) });
      for (const o of strata.outposts) if (o.stratum === strata.current) m.push({ kind: 'outpost', x: o.x, z: o.z, id: o.id });
      // WORLD's places: the vista's balcony, the river's spring, the works, set pieces and secrets once
      // reached (the vista and the works also once their spot is seen), ravines and nests once seen.
      const sites = strata.namedSites?.() ?? [];
      const vista = layout.vista;
      if (vista && (isFound(vista.id) || seen(vista.balcony[0], vista.balcony[2]))) m.push({ kind: 'vista', x: vista.balcony[0], z: vista.balcony[2], id: vista.id, label: siteTitle(vista.name) });
      for (const rv of layout.rivers ?? []) {
        const site = sites.find((s) => s.id === rv.id);
        if (isFound(rv.id) || seen(rv.spring[0], rv.spring[2])) m.push({ kind: 'river', x: rv.spring[0], z: rv.spring[2], id: rv.id, label: siteTitle(site?.name ?? (rv.kind === 'lava' ? 'lavaRiver' : 'river')) });
      }
      const works = layout.dungeon;
      if (works && (isFound(works.id) || seen(works.entry[0], works.entry[2]))) m.push({ kind: 'works', x: works.entry[0], z: works.entry[2], id: works.id, label: siteTitle('works'), done: strata.works?.isOpen() ?? false });
      for (const sp of sites) if (sp.kind === 'setPiece' && isFound(sp.id)) m.push({ kind: 'place', x: sp.centre[0], z: sp.centre[2], id: sp.id, label: siteTitle(sp.name) });
      for (const sc of layout.secrets ?? []) if (isFound(sc.id)) m.push({ kind: 'secret', x: sc.centre[0], z: sc.centre[2], id: sc.id, label: siteTitle('secret'), done: !live.has(sc.chest) });
      for (const rv of layout.ravines ?? []) if (seen(rv.top[0], rv.top[2])) m.push({ kind: 'ravine', x: rv.top[0], z: rv.top[2], id: rv.id });
      for (const ne of layout.nests ?? []) if (seen(ne.p[0], ne.p[2])) m.push({ kind: 'nest', x: ne.p[0], z: ne.p[2], id: ne.id });
      // The pack a black-out left (its stratum's map only).
      if (cache) m.push({ kind: 'cache', x: cache.x, z: cache.z, id: 'cache', label: t('m3.map.cacheLabel', { count: cache.count }) });
      // The river's explored stretches.
      src.lines = this.riverLines(layout.rivers ?? [], seen);
      void loop;
      src.revision++;
    }
    // The quest's target (an objective marker), refreshed every call (it moves with the quest).
    const q = this.seams().quests?.main().target;
    const i = this.markers.findIndex((x) => x.kind === 'objective');
    if (q && q.stratum === strata.current) {
      if (i >= 0) {
        if (this.markers[i].x !== q.x || this.markers[i].z !== q.z) {
          this.markers[i] = { kind: 'objective', x: q.x, z: q.z };
          src.revision++;
        }
      } else {
        this.markers.push({ kind: 'objective', x: q.x, z: q.z });
        src.revision++;
      }
    } else if (i >= 0) {
      this.markers.splice(i, 1);
      src.revision++;
    }
    return src;
  }

  /** The pack a black-out left, when it lies in the loaded stratum (null otherwise). */
  private cacheHere(): { x: number; z: number; count: number } | null {
    const c = this.game.progression.cache;
    if (!c) {
      this.cacheStratum = null;
      return null;
    }
    const { strata } = this.seams();
    const at = (c as { stratum?: number }).stratum ?? this.cacheStratum ?? strata?.current ?? 1;
    if (strata?.layout && at !== strata.current) return null;
    let count = 0;
    for (const k in c.items) count += c.items[k as ItemId] ?? 0;
    return { x: c.x, z: c.z, count };
  }

  /** Bumps when a place is reached, a lair revealed, the works opened or a guardian beaten (the markers follow). */
  private foundCount(): number {
    return this.placesRev;
  }

  private guardianBeaten(biome: BiomeId): boolean {
    const mobs = this.game.mobs as unknown as { guardiansBeaten?(): readonly string[] } | undefined;
    return mobs?.guardiansBeaten?.().includes(biome) ?? false;
  }

  /** The river's explored stretches as polylines (a run breaks where the column is unexplored). */
  private riverLines(rivers: NonNullable<NonNullable<StrataLike['layout']>['rivers']>, seen: (x: number, z: number) => boolean): MapSource['lines'] {
    const out: Array<{ kind: 'water' | 'lava'; runs: number[][] }> = [];
    for (const rv of rivers) {
      const runs: number[][] = [];
      let run: number[] | null = null;
      for (const p of rv.points) {
        if (seen(p[0], p[2])) {
          if (!run) runs.push((run = []));
          run.push(p[0], p[2]);
        } else run = null;
      }
      const kept = runs.filter((r) => r.length >= 4);
      if (kept.length) out.push({ kind: rv.kind, runs: kept });
    }
    return out;
  }

  /** The Map screen's view (null in the first version's world). */
  mapView(): MapView | null {
    const src = this.mapSource();
    const { strata } = this.seams();
    if (!src || !strata?.layout || !strata.map) return null;
    const layout = strata.layout;
    const map = strata.map;
    // Explored share per biome (a sampled count: every 4th column).
    const tot = [0, 0];
    const exp = [0, 0];
    for (let z = 0; z < map.sz; z += 4)
      for (let x = 0; x < map.sx; x += 4) {
        const b = layout.regionMap[x + z * map.sx] ?? 0;
        if (b > 1) continue;
        tot[b]++;
        if (map.has(x, z)) exp[b]++;
      }
    const travel = this.travelList();
    const def = STRATA[(layout.stratum - 1) | 0];
    const named = strata.namedSites?.() ?? [];
    return {
      source: src,
      stratum: layout.stratum,
      stratumName: `${def ? t(def.name) : `${ROMAN[layout.stratum] ?? layout.stratum}`} · ${layout.biomes.map((b) => t(BIOMES[b].name)).join(' & ')}`,
      biomes: layout.biomes.map((b, i) => ({ name: t(BIOMES[b].name), color: src.biomeColors[i], explored: tot[i] ? exp[i] / tot[i] : 0 })),
      travel,
      seed: String(strata.seed),
      places: named.length ? { found: named.filter((s) => strata.isFound?.(s.id)).length, total: named.length } : undefined,
    };
  }

  /**
   * The fast-travel list (BRIEF §0.4: between outposts): the camp, then every outpost of every
   * stratum visited. A trip starts from the camp or an outpost (standing at one); the place the
   * explorer stands at is marked "here".
   */
  travelList(): MapView['travel'] {
    const g = this.game;
    const { strata } = this.seams();
    const out: MapView['travel'] = [];
    if (!strata?.layout) return out;
    const p = g.player;
    const cur = strata.current;
    const near = (o: { stratum: number; x: number; z: number }) => o.stratum === cur && Math.hypot(o.x - p.x, o.z - p.z) <= OUTPOST.useRadius + 2;
    const atOutpost = strata.outposts.find(near) ?? null;
    const atCamp = cur === 1 && g.inCamp;
    const from = atCamp || atOutpost !== null;
    const reason = from ? null : t('m3.map.travelNeed');
    const spawn = g.session.layout.spawn;
    out.push({ id: CAMP_TRAVEL_ID, name: t('m3.map.campName'), x: cur === 1 ? spawn.x : 0, z: cur === 1 ? spawn.z : 0, here: atCamp, can: from && !atCamp, reason: atCamp ? null : reason, stratum: 1 });
    const list = [...strata.outposts].sort((a, b) => a.stratum - b.stratum);
    for (const o of list) {
      const here = atOutpost?.id === o.id;
      out.push({ id: o.id, name: t('m3.map.outpostIn', { biome: t(BIOMES[o.biome].name) }), x: o.x, z: o.z, here, can: from && !here, reason: here ? null : reason, stratum: o.stratum });
    }
    return out;
  }

  /** Fast travel to an outpost (any stratum visited: WORLD's travelTo) or to the camp. */
  async travel(id: string): Promise<boolean> {
    const g = this.game;
    const { strata } = this.seams();
    if (!strata?.layout || strata.busy) return false;
    const row = this.travelList().find((r) => r.id === id);
    if (!row || !row.can) {
      if (row?.reason) g.ui.hint(row.reason, 2400);
      return false;
    }
    let ok = false;
    if (id === CAMP_TRAVEL_ID) {
      if (strata.current === 1) {
        const s = g.session.layout.spawn;
        g.player.teleport(s.x, s.y, s.z, s.yaw);
        g.cameraRig.yaw = s.yaw + Math.PI;
        g.cameraRig.snapTo(s.x, s.y + 1.62, s.z);
        ok = true;
      } else if (strata.enter) {
        await strata.enter(1, 'arrival');
        ok = true;
      }
    } else if (strata.travelTo) ok = await strata.travelTo(id);
    if (ok) {
      g.tapStop();
      g.bus.emit('player:travelled', { to: id, stratum: strata.current });
      g.bus.emit('toast', { text: t('ctl.travelled'), tone: 'good' });
    }
    return ok;
  }

  /** The menu a key or a HUD button opens, for screens Game does not open itself. */
  static isMenu(s: string): s is MenuScreen {
    return s === 'inventory' || s === 'crafting' || s === 'map' || s === 'quests' || s === 'bestiary' || s === 'settings' || s === 'pause';
  }

  /** What a block shows its name as (for the debug API). */
  static blockName(id: number): string {
    return BLOCKS[id] ? t(BLOCKS[id].name) : String(id);
  }
}
