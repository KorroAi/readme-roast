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
import { t, type TextKey } from '../../i18n';
import { raycastVoxels } from '../../world/raycast';
import type { HudState, InteractView, MapMarker, MapSource, MapView, ReticleKind, TrackerLine } from '../../ui/types';
import type { MenuScreen, UiControl } from '../../ui/hud/actions';
import type { LoopActions, PlaceRequest, HotbarView } from '../craft/types';
import type { QuestSystem, QuestStepView } from '../quests/types';
import type { PropSpec } from '../../world/gen/types';
import { DashAbility, SonarAbility, dashDirection, sonarScan } from './abilities';
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
}

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
    campSite: { centre?: [number, number, number] } | null;
    arrival: { x: number; y: number; z: number };
    regionMap: Uint8Array;
    biomeAt(x: number, y: number, z: number): BiomeId;
  } | null;
  readonly map: { sx: number; sz: number; revision: number; has(x: number, z: number): boolean; heightAt(x: number, z: number): number; fraction(): number } | null;
  readonly biomeHere: BiomeId | null;
  depth?(y: number): number;
  isRevealed(id: string): boolean;
  reveal?(id: string, how: 'sonar' | 'page' | 'near' | 'debug'): boolean;
  readonly outposts: ReadonlyArray<{ id: string; stratum: number; x: number; y: number; z: number; biome: BiomeId }>;
  travelTo?(id: string): Promise<boolean>;
  addOutpost?(id: string, x: number, y: number, z: number): unknown;
}

interface Seams {
  loop: LoopLike | null;
  quests: QuestSystem | null;
  strata: StrataLike | null;
}

const PLACE_BLOCKS = { BUILT_PLANK: B.BUILT_PLANK, BUILT_BRICK: B.BUILT_BRICK, TORCH: B.TORCH, LADDER: B.LADDER, ROPE: B.ROPE, DOOR: B.DOOR };
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

interface Throw {
  item: ItemId;
  kind: 'bomb' | 'flare';
  x: number;
  y: number;
  z: number;
  t: number;
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
  private probeFrame = 0;
  private probeMob: 'attack' | 'use' | null = null;
  private sonarHintAt = -10;
  private throws: Throw[] = [];
  private readonly dir = { x: 0, z: 0 };
  private readonly origin = new THREE.Vector3();
  private readonly ray = new THREE.Vector3();
  private mapCache: { rev: number; stratum: number; src: MapSource } | null = null;
  private readonly markers: MapMarker[] = [];
  private tipShown = new Set<string>();

  constructor(private readonly game: Game) {}

  /** The other owners' seams on Game, read by shape (null until they exist). */
  seams(): Seams {
    const g = this.game as unknown as { loop?: LoopLike; quests?: QuestSystem; strata?: StrataLike };
    return { loop: g.loop ?? null, quests: g.quests ?? null, strata: g.strata ?? null };
  }

  /** Seconds of invulnerability left (a dash). */
  get invulnerable(): number {
    return this.dash.iframes;
  }

  reset(): void {
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
    if (input.interactPressed) this.used('interact');

    // Dash: along the stick (or back), invulnerable for a moment.
    if (input.dashPressed) {
      if (this.dash.tryDash()) {
        dashDirection(input.moveX || input.autoMoveX, input.moveY || input.autoMoveY, g.cameraRig.moveYaw, this.dir);
        p.dash(this.dir.x, this.dir.z);
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
    const { loop, strata } = this.seams();
    const req = loop?.placeRequest?.(PLACE_BLOCKS) ?? null;
    if (!loop || !req) {
      if (loop) g.ui.hint(t('ctl.placeNothing'), 1800);
      return false;
    }
    const cell = this.placeCell(req.kind === 'block' || req.kind === 'door');
    if (!cell) {
      g.ui.hint(t('ctl.placeNoRoom'), 1800);
      return false;
    }
    const [x, y, z] = cell;
    if (req.kind === 'station' || req.kind === 'outpost') {
      const at = { x: x + 0.5, y, z: z + 0.5 };
      if (req.kind === 'station') loop.placeStation?.(req.station, at);
      else {
        const o = loop.placeOutpost?.(at);
        if (!o) {
          g.ui.hint(t('ctl.outpostMax'), 2200);
          return false;
        }
        strata?.addOutpost?.(o.id, at.x, at.y, at.z);
      }
      loop.consumePlaced?.(req.item);
      g.bus.emit('player:placed', { item: req.item, block: 0, x, y, z });
      this.used('place');
      return true;
    }
    const old = g.session.world.get(x, y, z);
    g.session.setBlock(x, y, z, req.block);
    g.onPlaced(x, y, z, old);
    loop.consumePlaced?.(req.item);
    g.bus.emit('player:placed', { item: req.item, block: req.block, x, y, z });
    this.used('place');
    return true;
  }

  /**
   * The open cell the Place action fills: the cell in front of the face the centre ray hits within
   * PLACE_REACH. A solid block must not overlap the explorer's body; a torch, ladder or rope may.
   */
  placeCell(solid: boolean): [number, number, number] | null {
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
    const here = w.get(x, y, z);
    if (here !== B.AIR && SOLID[here]) return null;
    if (here !== B.AIR && here !== B.TORCH) return null;
    if (solid) {
      const p = g.player;
      const hw = PLAYER.width / 2;
      if (x + 1 > p.x - hw && x < p.x + hw && z + 1 > p.z - hw && z < p.z + hw && y + 1 > p.y && y < p.y + PLAYER.height) return null;
    }
    return [x, y, z];
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
    this.throws.push({ item: held, kind: use.kind, x: this.origin.x + this.ray.x * d, y: this.origin.y + this.ray.y * d, z: this.origin.z + this.ray.z * d, t: d / THROW_SPEED + 0.15 });
    g.bus.emit('weapon:swing', { weapon: use.kind, ranged: true });
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
      const w = (WEAPONS as Record<string, { damage: number; area?: number } | undefined>)[th.kind === 'bomb' ? 'bomb' : 'flash'];
      const radius = w?.area ?? (th.kind === 'bomb' ? 3.5 : 6);
      const count = th.kind === 'bomb' ? mobs?.blast?.(th.x, th.y, th.z, radius, w?.damage ?? 30) ?? 0 : mobs?.flash(th.x, th.y, th.z, radius, 0) ?? 0;
      g.particles.sparkle(th.x, th.y, th.z, th.kind === 'bomb' ? 0xffa45a : 0xfff1c4, th.kind === 'bomb' ? 18 : 12, g.rng, 2.4);
      g.bus.emit('weapon:flash', { x: th.x, y: th.y, z: th.z, radius, count });
    }
  }

  // ------------------------------------------------------------------------------------
  // The HUD

  /** The reticle: what Action would do on what the centre of the view is on. */
  private updateReticle(blocked: boolean): void {
    const g = this.game;
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
    const mobs = g.mobs as unknown as { activeGuardian?(): { name: string; hp: number; max: number; phase: number; phases: number } | null } | undefined;
    const gs = mobs?.activeGuardian?.() ?? null;
    h.guardian = gs ? { name: gs.name, hp: gs.hp, max: gs.max, phase: gs.phase, phases: gs.phases } : null;
    // The Interact chip.
    const focus = g.focusTarget();
    h.interact = focus ? this.interactView(focus) : null;
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
    else if (kind === 'workbench' || kind === 'forge' || kind === 'furnace' || kind === 'alchemy' || kind === 'station') [icon, verb] = ['station', 'ctl.verb.craft'];
    else if (kind === 'gate' || feature === 'gate') [icon, verb] = ['gate', 'ctl.verb.use'];
    else if (kind === 'outpost' || feature === 'outpost') [icon, verb] = ['outpost', 'ctl.verb.rest'];
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
    if (!c || c.stratum !== layout.stratum) {
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
        biomeColors: colors,
        markers: this.markers,
        playerX: p.x,
        playerZ: p.z,
        yaw: g.cameraRig.yaw,
      };
      c = this.mapCache = { rev: -1, stratum: layout.stratum, src };
    }
    const src = c.src;
    src.playerX = p.x;
    src.playerZ = p.z;
    src.yaw = g.cameraRig.yaw;
    // Markers: rebuilt when the explored map changed (pages and chests show once their column is seen).
    if (c.rev !== map.revision || this.markers.length === 0) {
      c.rev = map.revision;
      const m = this.markers;
      m.length = 0;
      const seen = (x: number, z: number) => map.has(x, z);
      const camp = layout.campSite?.centre;
      if (camp) m.push({ kind: 'camp', x: camp[0], z: camp[2], label: t('hud.camp') });
      else m.push({ kind: 'camp', x: layout.arrival.x, z: layout.arrival.z, label: t('m3.map.m.camp') });
      for (const l of layout.lairs) if (strata.isRevealed(l.id)) m.push({ kind: 'lair', x: l.centre[0], z: l.centre[2], id: l.id, label: t(BIOMES[l.biome].name) });
      if (seen(layout.gate.centre[0], layout.gate.centre[2])) m.push({ kind: 'gate', x: layout.gate.centre[0], z: layout.gate.centre[2] });
      const live = g.session.liveProps;
      for (const pg of layout.pages) if (seen(pg.p[0], pg.p[2])) m.push({ kind: 'page', x: pg.p[0], z: pg.p[2], id: pg.id, done: !live.has(pg.prop) });
      for (const ch of layout.chests) if (seen(ch.p[0], ch.p[2])) m.push({ kind: 'chest', x: ch.p[0], z: ch.p[2], id: ch.id, done: !live.has(ch.prop) });
      for (const o of strata.outposts) if (o.stratum === strata.current) m.push({ kind: 'outpost', x: o.x, z: o.z, id: o.id });
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

  /** The Map screen's view (null in the first version's world). */
  mapView(): MapView | null {
    const src = this.mapSource();
    const { strata } = this.seams();
    if (!src || !strata?.layout || !strata.map) return null;
    const layout = strata.layout;
    const map = strata.map;
    const p = this.game.player;
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
    const travel: MapView['travel'] = [];
    const here = (x: number, z: number) => Math.hypot(x - p.x, z - p.z) < 6;
    for (const o of strata.outposts) {
      if (o.stratum !== strata.current) continue;
      travel.push({ id: o.id, name: t('m3.map.outpostIn', { biome: t(BIOMES[o.biome].name) }), x: o.x, z: o.z, here: here(o.x, o.z), can: true, reason: null });
    }
    const def = STRATA[(layout.stratum - 1) | 0];
    return {
      source: src,
      stratum: layout.stratum,
      stratumName: def ? `${ROMAN[layout.stratum] ?? layout.stratum} · ${t(def.name)}` : String(layout.stratum),
      biomes: layout.biomes.map((b, i) => ({ name: t(BIOMES[b].name), color: src.biomeColors[i], explored: tot[i] ? exp[i] / tot[i] : 0 })),
      travel,
      seed: String(strata.seed),
    };
  }

  /** Fast travel to an outpost of this stratum (WORLD's travelTo). */
  async travel(id: string): Promise<boolean> {
    const { strata } = this.seams();
    if (!strata?.travelTo) return false;
    const ok = await strata.travelTo(id);
    if (ok) this.game.bus.emit('toast', { text: t('ctl.travelled'), tone: 'good' });
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
