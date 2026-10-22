import * as THREE from 'three';
import { WEAPONS, bestWeapon, type Weapon } from '../../config/weapons';
import type { EventBus, GameEvents } from '../../core/events';
import { raycastVoxels } from '../../world/raycast';
import type { VoxelWorld } from '../../world/VoxelWorld';
import type { Mob, MobSystem } from '../mobs/types';
import { toolModel, type Viewmodel } from './Viewmodel';
import './events';

/**
 * Tap a creature (round 2, ROUND2 §0.10). A tap on a monster attacks it with the best weapon that
 * reaches (config/weapons bestWeapon: the spear, the machete, the pick; the sling beyond melee
 * reach), walking into reach first when no weapon reaches. A tap on ore always uses the pick
 * (game/TapController never asks here for blocks), so there is never a mode switch.
 *
 * Every attack has a wind-up (the weapon's own), lands at its contact frame through
 * MobSystem.hit (or fire, for the sling), and a hit holds the weapon still for the hit stop (40 ms)
 * while the monster flashes (MOBS: on the monster only, never the screen). Tapping again while a
 * blow is in flight queues one more. A small being is touched, caught or harvested instead.
 *
 * With a monster near, the right hand keeps the weapon up (a fight stance); a few seconds after the
 * last one, the pick comes back. Flash Charges are their own button (TouchControls) or F.
 */
export interface CombatHost {
  mobs(): MobSystem | null;
  readonly world: VoxelWorld;
  /** Weapons built (Progression.ownedWeapons()). */
  owned(): readonly string[];
  /**
   * Round 3: the weapon an attack at `distance` m uses (LOOP's `loop.weaponFor`: the equipped one
   * when it reaches, else the best owned). Without it the best owned weapon is picked here.
   */
  weaponFor?(distance: number): Weapon;
  camera(): THREE.PerspectiveCamera;
  /** The eye (reach is measured from it). */
  eye(): THREE.Vector3;
  viewport(): { width: number; height: number };
  /** Walk until within `within` m of a point (TapController); false when there is no way. */
  walkNear(x: number, y: number, z: number, within: number): boolean;
  stopWalk(): void;
  /** Flash Charges carried (and usable here). */
  flashCharges(): number;
  /** Spend one; false when there is none. */
  useFlashCharge(): boolean;
  hint(text: string): void;
  /** A tap into the dark at a creature too far to reach: the lantern is raised toward it. */
  nudge(ndcX: number, ndcY: number): void;
}

/** A creature within this many CSS px of the finger is the one tapped (the brief's 56 px). */
export const MOB_SNAP_PX = 56;
/** How close (m, eye to body surface) a small being must be to be caught, harvested or touched. */
export const TOUCH_REACH = 2.4;
/** Seconds the weapon stays up after the last monster near. */
const STANCE_HOLD = 3.5;
/** A monster within this range (m) keeps the weapon up. */
const STANCE_RANGE = 7;
/** Re-plan the walk toward a moving creature this often (s). */
const CHASE_EVERY = 0.5;

interface Pending {
  mob: Mob;
  weapon: Weapon;
  /** Seconds to the contact frame. */
  t: number;
  touch: boolean;
}

export class Combat {
  /** The creature the last tap chose (null: none). */
  target: Mob | null = null;
  /** A finger is held on the target: the blows repeat at the weapon's rate (config/weapons). */
  holding = false;
  /** A tap chose a creature this frame (cleared by update). */
  tapped = false;
  private pending: Pending | null = null;
  private flashIn = -1;
  private cooldown = 0;
  private queued = 0;
  private chaseT = 0;
  private stanceT = 0;
  private readonly origin = new THREE.Vector3();
  private readonly dir = new THREE.Vector3();
  private readonly tmp = new THREE.Vector3();
  private readonly ndc = new THREE.Vector3();

  constructor(private readonly host: CombatHost, private readonly vm: Viewmodel, private readonly bus: EventBus<GameEvents>) {}

  /** A tap at a screen point (NDC): true when it was on (or near) a creature, which is acted on. */
  tap(ndcX: number, ndcY: number): boolean {
    const mob = this.pickMob(ndcX, ndcY);
    if (!mob) return false;
    this.tapped = true;
    if (this.target !== mob) this.queued = 0;
    this.target = mob;
    this.queued = Math.min(2, this.queued + 1);
    this.chaseT = 0;
    return true;
  }

  /**
   * The creature a tap means: the one its ray passes through (with slack), else the nearest one on
   * screen within MOB_SNAP_PX of the finger that the eye can see.
   */
  pickMob(ndcX: number, ndcY: number): Mob | null {
    const sys = this.host.mobs();
    if (!sys) return null;
    const cam = this.host.camera();
    cam.updateMatrixWorld();
    this.origin.setFromMatrixPosition(cam.matrixWorld);
    this.dir.set(ndcX, ndcY, 0.5).unproject(cam).sub(this.origin).normalize();
    const o = this.origin;
    const d = this.dir;
    const hit = sys.pick({ ox: o.x, oy: o.y, oz: o.z, dx: d.x, dy: d.y, dz: d.z, maxDist: 30, slack: 0.3 });
    if (hit && this.visible(hit)) return hit;
    const { width, height } = this.host.viewport();
    if (width <= 0 || height <= 0) return null;
    let best: Mob | null = null;
    let bestPx = Infinity;
    for (const m of sys.list()) {
      if (!m.tappable || m.state === 'dying') continue;
      const p = this.ndc.copy(m.position).project(cam);
      if (p.z > 1 || p.z < -1) continue;
      const dist = m.position.distanceTo(o);
      if (dist > 30) continue;
      // Its radius on screen: a big creature is easy to hit anywhere on its body.
      const rPx = (m.bounds.radius / Math.max(0.3, dist)) * (height / 2) / Math.tan((cam.fov * Math.PI) / 360);
      const px = Math.hypot(((p.x - ndcX) * width) / 2, ((p.y - ndcY) * height) / 2) - rPx;
      // Monsters a little ahead of beings when both are near the finger.
      const score = px + (m.hostile ? 0 : 6);
      if (px <= MOB_SNAP_PX && score < bestPx && this.visible(m)) {
        bestPx = score;
        best = m;
      }
    }
    return best;
  }

  /** The eye sees the creature's body (no rock between). */
  private visible(m: Mob): boolean {
    const e = this.host.eye();
    const v = this.tmp.copy(m.position).sub(e);
    const len = v.length();
    if (len < 1e-3) return true;
    v.divideScalar(len);
    const hit = raycastVoxels(this.host.world, e.x, e.y, e.z, v.x, v.y, v.z, Math.max(0, len - m.bounds.radius));
    return !hit;
  }

  /** Eye to the creature's body surface (m). */
  private distanceTo(m: Mob): number {
    return Math.max(0, m.position.distanceTo(this.host.eye()) - m.bounds.radius);
  }

  /** Use a Flash Charge (the button, or F): a burst of light round the explorer. False: none left. */
  flash(): boolean {
    if (this.flashIn >= 0 || this.pending) return false;
    if (!this.host.useFlashCharge()) return false;
    const w = WEAPONS.flash;
    const dur = Math.max(0.5, w.windup + 0.3);
    this.vm.attack('flash', null, this.host.camera(), dur, w.windup / dur);
    this.flashIn = w.windup;
    this.bus.emit('weapon:swing', { weapon: 'flash', ranged: true });
    return true;
  }

  /** A strike, a throw or a pursuit is under way (the pick does not mine meanwhile). */
  get busy(): boolean {
    return this.pending !== null || this.flashIn >= 0 || (this.target !== null && this.queued > 0);
  }

  /** Whether a monster is near enough to want the Flash Charge button. */
  get threatNear(): boolean {
    return this.stanceT > STANCE_HOLD - 1.5;
  }

  /** Forget the target and anything in flight (menu, death, a ride). */
  reset(): void {
    this.target = null;
    this.pending = null;
    this.flashIn = -1;
    this.queued = 0;
  }

  update(dt: number, blocked: boolean): void {
    this.cooldown = Math.max(0, this.cooldown - dt);
    const sys = this.host.mobs();
    if (!sys) {
      this.reset();
      return;
    }
    if (this.pending) {
      this.pending.t -= dt;
      if (this.pending.t <= 0) this.land(sys, this.pending);
    }
    if (this.flashIn >= 0) {
      this.flashIn -= dt;
      if (this.flashIn < 0) {
        const e = this.host.eye();
        const w = WEAPONS.flash;
        const count = sys.flash(e.x, e.y - 0.3, e.z, w.area ?? 6, w.damage);
        this.bus.emit('weapon:flash', { x: e.x, y: e.y, z: e.z, radius: w.area ?? 6, count });
      }
    }
    const t = this.target;
    if (t && (t.state === 'dying' || !sys.list().includes(t))) {
      this.target = null;
      this.queued = 0;
    }
    if (this.holding && this.target) this.queued = Math.max(this.queued, 1);
    if (!blocked && this.target && this.queued > 0 && !this.pending && this.flashIn < 0) this.pursue(this.target, dt);
    this.stance(sys, dt);
    this.tapped = false;
  }

  /** Strike the target if something reaches, else walk toward it. */
  private pursue(mob: Mob, dt: number): void {
    const d = this.distanceTo(mob);
    if (mob.family === 'being') {
      if (d <= TOUCH_REACH) {
        if (this.cooldown > 0) return;
        this.host.stopWalk();
        this.queued--;
        // A shellback's crystals and a burrower's loot take the pick; the others a touch.
        const pickIt = mob.kind === 'shellback' || mob.kind === 'burrower';
        const w = WEAPONS.pick;
        if (pickIt) this.start(mob, w, false);
        else {
          this.vm.raise();
          this.pending = { mob, weapon: w, t: 0.12, touch: true };
          this.cooldown = 0.5;
        }
        return;
      }
      this.chase(mob, TOUCH_REACH * 0.8, dt);
      return;
    }
    const w = this.weaponAt(d);
    if (d <= w.reach) {
      if (this.cooldown > 0) return;
      this.host.stopWalk();
      this.queued--;
      this.start(mob, w, false);
      return;
    }
    this.chase(mob, Math.max(1.2, w.reach * 0.8), dt);
  }

  private chase(mob: Mob, within: number, dt: number): void {
    this.chaseT -= dt;
    if (this.chaseT > 0) return;
    this.chaseT = CHASE_EVERY;
    if (!this.host.walkNear(mob.position.x, mob.position.y, mob.position.z, within)) {
      // No way to it (across a chasm, up a wall): give up quietly with a look and a lifted lantern.
      const p = this.ndc.copy(mob.position).project(this.host.camera());
      this.host.nudge(p.x, p.y);
      this.target = null;
      this.queued = 0;
    }
  }

  private start(mob: Mob, w: Weapon, touch: boolean): void {
    const tool = w.id === 'pick' ? 'pick' : w.id;
    const dur = Math.max(w.rate * 0.9, w.windup + 0.2);
    this.vm.attack(tool, mob.position, this.host.camera(), dur, w.windup / dur);
    this.pending = { mob, weapon: w, t: w.windup, touch };
    this.cooldown = w.rate;
    this.stanceT = Math.max(this.stanceT, mob.hostile ? STANCE_HOLD : 0);
    this.bus.emit('weapon:swing', { weapon: w.id, ranged: !!w.ranged });
  }

  /** The contact frame: the blow lands (or the shard flies). */
  private land(sys: MobSystem, p: Pending): void {
    this.pending = null;
    const mob = p.mob;
    if (mob.state === 'dying' || !sys.list().includes(mob)) return;
    if (p.weapon.ranged) {
      const from = this.vm.toolWorld(this.tmp);
      sys.fire({ x: from.x, y: from.y, z: from.z }, mob, p.weapon.damage);
      return;
    }
    const reach = p.touch || mob.family === 'being' ? TOUCH_REACH : p.weapon.reach;
    // It moved away during the wind-up: the blow goes through air.
    if (this.distanceTo(mob) > reach + 0.6) return;
    const e = this.host.eye();
    const res = sys.hit(mob, mob.family === 'being' ? 0 : p.weapon.damage, { weapon: p.touch ? 'hand' : p.weapon.id, from: { x: e.x, y: e.y, z: e.z } });
    if (res.hit) {
      if (res.hitStop > 0 || mob.hostile) this.vm.hitStop(res.hitStop || p.weapon.hitStop);
      this.bus.emit('weapon:hit', { weapon: p.weapon.id, mob: mob.id, kind: mob.kind, killed: res.killed, x: mob.position.x, y: mob.position.y, z: mob.position.z });
    }
    if (res.killed && this.target === mob) {
      this.target = null;
      this.queued = 0;
    }
  }

  /** The fight stance: the best melee weapon up while a monster is near, the pick back after. */
  private stance(sys: MobSystem, dt: number): void {
    const e = this.host.eye();
    let near = false;
    for (const m of sys.list()) {
      if (!m.hostile || m.state === 'dying' || m.kind === 'worm') continue;
      if (m.position.distanceTo(e) - m.bounds.radius <= STANCE_RANGE) {
        near = true;
        break;
      }
    }
    this.stanceT = near ? STANCE_HOLD : Math.max(0, this.stanceT - dt);
    if (this.vm.swinging || this.pending || this.flashIn >= 0) return;
    const melee = this.weaponAt(0);
    const want = this.stanceT > 0 && melee.id !== 'pick' ? melee.id : 'pick';
    if (this.vm.rightHand !== toolModel(want)) this.vm.setRightHand(want);
  }

  /** The weapon for a blow at `d` m (LOOP's choice when it is there). */
  private weaponAt(d: number): Weapon {
    return this.host.weaponFor?.(d) ?? bestWeapon(this.host.owned(), d);
  }
}
