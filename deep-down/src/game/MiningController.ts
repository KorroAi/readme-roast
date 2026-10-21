import * as THREE from 'three';
import { B, BLOCKS, blockDef, isEmitter, SOLID, UNBREAKABLE_TIER } from '../config/blocks';
import type { PickaxeDef } from '../config/balance';
import { REACH } from './fp/constants';
import { PlainRockHint } from './fp/plainRockHint';
import { isBreakable } from '../config/rarity';
import './fp/events';
import type { EventBus, GameEvents } from '../core/events';
import type { Rng } from '../core/rng';
import { t, type TextKey } from '../i18n';
import type { InputState, MineLock } from '../input/types';
import { raycastVoxels, type VoxelHit as RaycastHit } from '../world/raycast';
import { assistTarget } from './aimAssist';
import type { VoxelWorld } from '../world/VoxelWorld';
import type { PropSpec } from '../world/gen/types';
import type { CameraRig } from './CameraRig';
import type { DebrisSystem } from './effects/Debris';
import type { ParticleSystem } from './effects/Particles';
import type { TargetMarker } from './effects/TargetMarker';
import type { DropSystem } from './Drops';

const FACES: ReadonlyArray<readonly [number, number, number]> = [
  [1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1],
];

export interface MiningTarget {
  kind: 'block' | 'prop';
  key: string;
  /** Block voxel coordinates, or the prop base position. */
  x: number;
  y: number;
  z: number;
  /** Face normal at the hit (blocks only; props use the reverse ray). */
  nx: number;
  ny: number;
  nz: number;
  point: THREE.Vector3;
  block: number;
  prop: PropSpec | null;
  name: string;
  hardness: number;
  tier: number;
  protectedReason: 'unbreakable' | 'protected' | null;
  inReach: boolean;
}

/** Narrow interface to the pure mining rules (gameplay/Mining.ts). */
export interface MiningRules {
  hit(targetKey: string, hardness: number, tier: number, pickaxe: PickaxeDef, protectedReason?: 'unbreakable' | 'protected' | null): { progress: number; broken: boolean; blocked: boolean };
  update(dt: number): void;
  readonly progress: number;
  readonly targetKey: string | null;
}

export interface MiningHooks {
  /** Called after a block has been removed from the world (light/props/objectives). */
  blockBroken(x: number, y: number, z: number, oldId: number): void;
  propBroken(spec: PropSpec): void;
  rollDrop(drop: NonNullable<ReturnType<typeof blockDef>['drop']>): number;
  pickaxe(): PickaxeDef;
  /**
   * Start the pickaxe swing (duration in seconds); the head meets the rock at `contact` of it
   * (the impact frame), at `point`.
   */
  swing(duration: number, contact: number, point: THREE.Vector3): void;
  /** Turn the view toward the target (first person: only when it is off to the side). */
  face(x: number, y: number, z: number, dt: number): void;
  hint(text: string): void;
  propRaycast(origin: THREE.Vector3, dir: THREE.Vector3, maxDist: number): { id: string; distance: number; point: THREE.Vector3 } | null;
  propById(id: string): PropSpec | null;
  propFlash(id: string): void;
}

/**
 * Turns "mining is held at this screen point" into swings, impacts, cracks and breaks.
 * Damage lands at the strike frame of the swing animation, so sound, crack, debris and
 * camera kick all happen together.
 */
export class MiningController {
  target: MiningTarget | null = null;
  private swingTimer = 0;
  private impactPending = false;
  private impactAt = 0;
  private swingKey: string | null = null;
  private lastBlockedHint = 0;
  /** Polish 2: the tunk on plain rock says why, once in a while (fp/plainRockHint). */
  private readonly plainRockHint = new PlainRockHint();
  private time = 0;
  private readonly origin = new THREE.Vector3();
  private readonly dir = new THREE.Vector3();
  private readonly tmp = new THREE.Vector3();

  constructor(
    private readonly world: VoxelWorld,
    private readonly bus: EventBus<GameEvents>,
    private readonly rules: MiningRules,
    private readonly hooks: MiningHooks,
    private readonly marker: TargetMarker,
    private readonly debris: DebrisSystem,
    private readonly particles: ParticleSystem,
    private readonly drops: DropSystem,
    private readonly cameraRig: CameraRig,
    private readonly rng: Rng,
  ) {}

  /**
   * Find what the aim ray hits (block or minable prop) and whether it is within reach. On a
   * touch screen with no finger on the world (the Mine button, or idle), the centre ray is
   * kept when it lands on something minable in reach; otherwise aim assist picks the exposed
   * minable block the explorer is facing.
   */
  findTarget(input: InputState, handX: number, handY: number, handZ: number): MiningTarget | null {
    // Tap to mine: a locked block stays the target until it breaks (game/TapController).
    if (input.lock) return this.lockedTarget(input.lock, handX, handY, handZ);
    const direct = this.rayTarget(input, handX, handY, handZ);
    // Holding on a vein: after a break, the next block of the same kind (the vein's next block
    // beside the one that broke, then anything of that kind near the thumb).
    if (input.mining && input.aimFromPointer && this.heldKind !== null && (!direct || !direct.inReach || direct.block !== this.heldKind)) {
      const thumb = this.dirTmp.copy(this.dir);
      const same = this.veinNext(this.heldKind, handX, handY, handZ, thumb) ?? this.sameKindNear(input.aimX, input.aimY, handX, handY, handZ, this.heldKind);
      if (same) return same;
    }
    if (!input.mining) this.heldKind = null;
    // First person: what the dot (or the finger) is on, never a guess elsewhere in the view.
    if (input.aimFromPointer || input.lastDevice !== 'touch' || !this.assist) return direct;
    if (direct && direct.inReach && direct.protectedReason === null) return direct;
    return this.assisted(handX, handY, handZ) ?? direct;
  }

  /** Touch aim assist (the third-person Mine button's helper): off in first person. */
  assist = false;

  /** The kind of block a held finger broke last (the vein it is following), or null. */
  private heldKind: number | null = null;
  /** Where that block was. */
  private readonly heldAt = { x: 0, y: 0, z: 0 };
  private readonly dirTmp = new THREE.Vector3();

  /**
   * The vein's next block: a block of `kind` touching the one that broke (26 neighbours), in reach
   * with a clear line from the hand, the one nearest the thumb's ray.
   */
  private veinNext(kind: number, hx: number, hy: number, hz: number, thumb: THREE.Vector3): MiningTarget | null {
    let best: MiningTarget | null = null;
    let bestDot = -Infinity;
    const { x: bx, y: by, z: bz } = this.heldAt;
    for (let dz = -1; dz <= 1; dz++)
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy && !dz) continue;
          const x = bx + dx;
          const y = by + dy;
          const z = bz + dz;
          if (this.world.get(x, y, z) !== kind) continue;
          const tg = this.lockedTarget({ kind: 'block', x, y, z }, hx, hy, hz);
          if (!tg || !tg.inReach || tg.protectedReason !== null) continue;
          const vx = x + 0.5 - hx;
          const vy = y + 0.5 - hy;
          const vz = z + 0.5 - hz;
          const dot = (vx * thumb.x + vy * thumb.y + vz * thumb.z) / (Math.hypot(vx, vy, vz) || 1);
          if (dot > bestDot) {
            bestDot = dot;
            best = tg;
          }
        }
    return best;
  }

  /** The minable block of `kind` in reach nearest a screen point (two rings round it), or null. */
  private sameKindNear(ndcX: number, ndcY: number, hx: number, hy: number, hz: number, kind: number): MiningTarget | null {
    const aspect = this.cameraRig.camera.aspect || 1;
    let best: MiningTarget | null = null;
    let bestD = Infinity;
    for (const ring of [0.07, 0.14, 0.22]) {
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2;
        const r = this.pick(ndcX + Math.cos(a) * ring, ndcY + Math.sin(a) * ring * Math.min(1, aspect * 1.2), hx, hy, hz, REACH + 1.5).target;
        if (!r || r.kind !== 'block' || r.block !== kind || !r.inReach || r.protectedReason !== null) continue;
        const d = Math.hypot(r.point.x - hx, r.point.y - hy, r.point.z - hz) + ring * 4;
        if (d < bestD) {
          bestD = d;
          best = r;
        }
      }
      if (best) return best;
    }
    return null;
  }

  /** Aim assist (touch): see findTarget. Uses the centre ray direction computed by rayTarget. */
  private assisted(handX: number, handY: number, handZ: number): MiningTarget | null {
    const tier = this.hooks.pickaxe().tier;
    const a = assistTarget(this.world, handX, handY, handZ, this.dir.x, this.dir.y, this.dir.z, REACH, (id) => {
      const def = BLOCKS[id];
      if (!def?.visible || def.protectedReason) return null;
      // Prefer what the pick can break; a too-hard block is still shown (it tells the player why).
      return def.tier > tier ? -1.5 : 0;
    });
    if (!a) return null;
    const def = BLOCKS[a.block];
    const point = new THREE.Vector3(a.x + 0.5 + a.nx * 0.5, a.y + 0.5 + a.ny * 0.5, a.z + 0.5 + a.nz * 0.5);
    return {
      kind: 'block', key: `${a.x},${a.y},${a.z}`, x: a.x, y: a.y, z: a.z, nx: a.nx, ny: a.ny, nz: a.nz, point,
      block: a.block, prop: null, name: t(def.name), hardness: def.hardness, tier: def.tier,
      protectedReason: null, inReach: true,
    };
  }

  /**
   * What a screen point (NDC) shows, up to `maxDist` from the camera: the minable target with its
   * reach from the hand, the prop hit first (any kind, for tap to use) and the raw block hit.
   */
  pick(ndcX: number, ndcY: number, handX: number, handY: number, handZ: number, maxDist: number): { target: MiningTarget | null; prop: PropSpec | null; hit: RaycastHit | null } {
    this.cameraRig.rayThrough(ndcX, ndcY, this.origin, this.dir);
    return this.cast(handX, handY, handZ, maxDist);
  }

  /** The locked target (tap to mine), with its face toward the hand; null once it is gone. */
  private lockedTarget(lock: MineLock, hx: number, hy: number, hz: number): MiningTarget | null {
    const hand = this.tmp.set(hx, hy, hz);
    if (lock.kind === 'prop') {
      const spec = this.hooks.propById(lock.id);
      if (!spec?.minable) return null;
      const m = spec.minable;
      const point = new THREE.Vector3(spec.x, spec.y + 0.4, spec.z);
      return {
        kind: 'prop', key: `prop:${spec.id}`, x: spec.x, y: spec.y, z: spec.z, nx: 0, ny: 1, nz: 0, point,
        block: B.CRYSTAL, prop: spec, name: t('block.crystal'), hardness: m.hardness, tier: m.tier,
        protectedReason: null, inReach: point.distanceTo(hand) <= REACH,
      };
    }
    const { x, y, z } = lock;
    const id = this.world.get(x, y, z);
    if (!SOLID[id]) return null;
    const def = BLOCKS[id];
    // The open face that looks most toward the hand (as aim assist does).
    let best = -1;
    let bestDot = -Infinity;
    for (let f = 0; f < 6; f++) {
      const [fx, fy, fz] = FACES[f];
      if (SOLID[this.world.get(x + fx, y + fy, z + fz)]) continue;
      const dot = fx * (hx - x - 0.5) + fy * (hy - y - 0.5) + fz * (hz - z - 0.5);
      if (dot > bestDot) {
        bestDot = dot;
        best = f;
      }
    }
    if (best < 0) return null;
    const [nx, ny, nz] = FACES[best];
    const point = new THREE.Vector3(x + 0.5 + nx * 0.5, y + 0.5 + ny * 0.5, z + 0.5 + nz * 0.5);
    const d = Math.hypot(x + 0.5 - hx, y + 0.5 - hy, z + 0.5 - hz);
    let inReach = d <= REACH;
    if (inReach) {
      // A clear line from the hand: the first solid cell toward the face must be this block.
      const tx = point.x - hx;
      const ty = point.y - hy;
      const tz = point.z - hz;
      const len = Math.hypot(tx, ty, tz) || 1;
      const hit = raycastVoxels(this.world, hx, hy, hz, tx / len, ty / len, tz / len, len + 0.6);
      inReach = !!hit && hit.x === x && hit.y === y && hit.z === z;
    }
    return {
      kind: 'block', key: `${x},${y},${z}`, x, y, z, nx, ny, nz, point, block: id, prop: null, name: t(def.name),
      hardness: def.hardness, tier: def.tier, protectedReason: def.protectedReason ?? null, inReach,
    };
  }

  /** What the aim ray (crosshair, or the pointer when aiming from it) hits. */
  private rayTarget(input: InputState, handX: number, handY: number, handZ: number): MiningTarget | null {
    const ndcX = input.aimFromPointer ? input.aimX : 0;
    const ndcY = input.aimFromPointer ? input.aimY : 0;
    this.cameraRig.rayThrough(ndcX, ndcY, this.origin, this.dir);
    const camToHand = this.origin.distanceTo(this.tmp.set(handX, handY, handZ));
    return this.cast(handX, handY, handZ, camToHand + REACH + 1.5).target;
  }

  /** Cast the ray in origin/dir: see pick(). */
  private cast(handX: number, handY: number, handZ: number, maxDist: number): { target: MiningTarget | null; prop: PropSpec | null; hit: RaycastHit | null } {
    const hit = raycastVoxels(this.world, this.origin.x, this.origin.y, this.origin.z, this.dir.x, this.dir.y, this.dir.z, maxDist);
    const propHit = this.hooks.propRaycast(this.origin, this.dir, maxDist);
    const propSpec = propHit ? this.hooks.propById(propHit.id) : null;
    const propFirst = propHit && propSpec && (!hit || propHit.distance < hit.distance) ? propSpec : null;
    const useProp = propHit && propSpec?.minable && (!hit || propHit.distance < hit.distance);
    if (useProp && propSpec && propHit) {
      const m = propSpec.minable!;
      const d = propHit.point.distanceTo(this.tmp.set(handX, handY, handZ));
      const target: MiningTarget = {
        kind: 'prop', key: `prop:${propSpec.id}`, x: propSpec.x, y: propSpec.y, z: propSpec.z, nx: -this.dir.x, ny: -this.dir.y, nz: -this.dir.z,
        point: propHit.point.clone(), block: B.CRYSTAL, prop: propSpec, name: t('block.crystal'), hardness: m.hardness, tier: m.tier,
        protectedReason: null, inReach: d <= REACH,
      };
      return { target, prop: propSpec, hit };
    }
    if (!hit) return { target: null, prop: propFirst, hit: null };
    const def = BLOCKS[hit.block];
    const cx = hit.x + 0.5;
    const cy = hit.y + 0.5;
    const cz = hit.z + 0.5;
    const d = Math.hypot(cx - handX, cy - handY, cz - handZ);
    const point = new THREE.Vector3(this.origin.x + this.dir.x * hit.distance, this.origin.y + this.dir.y * hit.distance, this.origin.z + this.dir.z * hit.distance);
    const target: MiningTarget = {
      kind: 'block', key: `${hit.x},${hit.y},${hit.z}`, x: hit.x, y: hit.y, z: hit.z, nx: hit.nx, ny: hit.ny, nz: hit.nz, point,
      block: hit.block, prop: null, name: t(def.name), hardness: def.hardness, tier: def.tier,
      protectedReason: def.protectedReason ?? null, inReach: d <= REACH,
    };
    return { target, prop: propFirst, hit };
  }

  /** The plain block the held press has already tunked on (no second strike until it lets go). */
  private tunkedKey: string | null = null;

  /** The last update ran with a finger held on the world (hold to mine, not a tap lock). */
  private heldByFinger = false;

  /** @returns true while a swing is in progress (used to slow movement). */
  update(dt: number, input: InputState, active: boolean, handX: number, handY: number, handZ: number): boolean {
    this.time += dt;
    this.heldByFinger = input.mining && input.aimFromPointer && input.lastDevice === 'touch';
    if (!this.heldByFinger) this.heldKind = null;
    this.rules.update(dt);
    // Held (button, finger, mouse) or locked by a tap (mined until it breaks).
    const wantsMine = active && (input.mining || input.lock !== null);
    // The crosshair (desktop) or the aim-assisted block (touch) is shown even when not mining,
    // so the player sees what the next swing will hit.
    // On touch nothing is shown until a tap or a finger acts (there is no dot to aim with).
    const showHover = active && (wantsMine || (!input.aimFromPointer && input.lastDevice !== 'touch'));
    this.target = showHover ? this.findTarget(input, handX, handY, handZ) : null;
    const tgt = this.target && this.target.inReach ? this.target : null;

    // Ordinary rock answers a press once (one tunk), not with a tunk every swing while it is held.
    if (!input.mining || !tgt || tgt.key !== this.tunkedKey) this.tunkedKey = null;
    const tunkDone = !!tgt && tgt.key === this.tunkedKey;
    if (wantsMine && tgt && this.swingTimer <= 0 && !tunkDone) {
      const pick = this.hooks.pickaxe();
      this.swingTimer = pick.swingInterval;
      this.impactPending = true;
      this.impactAt = pick.swingInterval * 0.55;
      this.swingKey = tgt.key;
      this.hooks.swing(pick.swingInterval, 0.55, tgt.point);
      this.bus.emit('tool:swing', { tier: pick.tier });
    }
    if (tgt && wantsMine) this.hooks.face(tgt.point.x, tgt.point.y, tgt.point.z, dt);

    if (this.swingTimer > 0) {
      const before = this.swingTimer;
      this.swingTimer -= dt;
      const elapsedBefore = this.hooks.pickaxe().swingInterval - before;
      const elapsedAfter = elapsedBefore + dt;
      if (this.impactPending && elapsedAfter >= this.impactAt) {
        this.impactPending = false;
        // Re-acquire the target at the strike frame; it may have changed during the wind-up.
        const now = this.findTarget(input, handX, handY, handZ);
        if (now && now.inReach && (now.key === this.swingKey || wantsMine)) this.impact(now);
      }
    }

    // Marker reflects the current target and its accumulated damage.
    // A locked block is outlined while the explorer walks up to it, too.
    // Ordinary rock (never minable) shows nothing: no crack, no ring.
    const shown = this.target && this.target.kind === 'block' && isBreakable(this.target.block) && (this.target.inReach || input.lock !== null) ? this.target : null;
    const progress = shown && this.rules.targetKey === shown.key ? this.rules.progress : 0;
    const blocked = !!shown && (shown.tier > this.hooks.pickaxe().tier || shown.protectedReason !== null);
    // The ray hit centres the strike light and the fractures where the pick actually lands.
    this.marker.set(shown ? { x: shown.x, y: shown.y, z: shown.z, point: shown.point } : null, progress, blocked, wantsMine);
    this.marker.update(dt);
    return this.swingTimer > 0;
  }

  private impact(tgt: MiningTarget): void {
    if (tgt.kind === 'block' && !isBreakable(tgt.block)) {
      this.tunk(tgt);
      return;
    }
    const pick = this.hooks.pickaxe();
    const res = this.rules.hit(tgt.key, tgt.hardness, tgt.tier, pick, tgt.protectedReason);
    const p = tgt.point;
    if (res.blocked) {
      this.bus.emit('block:tooHard', { x: tgt.x, y: tgt.y, z: tgt.z, block: tgt.block, requiredTier: tgt.tier });
      // The pick glances off: a few sparks, no shake (calm feedback; the hint says why).
      this.particles.sparkle(p.x, p.y, p.z, 0xffd9a0, 3, this.rng, 1.2);
      if (this.time - this.lastBlockedHint > 2.5) {
        this.lastBlockedHint = this.time;
        if (tgt.protectedReason === 'protected') this.hooks.hint(t('hint.protected'));
        else if (tgt.tier >= UNBREAKABLE_TIER || tgt.protectedReason === 'unbreakable') this.hooks.hint(t('hint.unbreakable'));
        else {
          const toolKey: TextKey = tgt.tier >= 2 ? 'equip.copperPickaxe' : 'equip.rustyPickaxe';
          this.hooks.hint(tgt.tier >= 4 ? t('hint.tooHardGlimmer') : tgt.tier >= 3 ? t('hint.tooHardIron') : t('hint.tooHard', { tool: t(toolKey) }));
        }
      }
      return;
    }
    const def = BLOCKS[tgt.block];
    this.marker.impact(1);
    // No screen shake on mining: the pick's contact, the crack and a few chips carry the hit.
    const n: [number, number, number] = [tgt.nx, tgt.ny, tgt.nz];
    if (!res.broken) {
      // Chips fall off the face (first person: never spat at the eye).
      this.debris.burst(p.x + n[0] * 0.05, p.y + n[1] * 0.05, p.z + n[2] * 0.05, def.debris, this.rng, {
        count: 3, speed: 1.0, size: [0.02, 0.04], dir: [n[0] * 0.12, -0.9, n[2] * 0.12], life: [0.3, 0.5], glow: def.sound === 'crystal',
      });
      if (def.sound === 'crystal') this.particles.sparkle(p.x, p.y, p.z, 0x8ff6ff, 3, this.rng);
      else this.particles.dust(p.x, p.y, p.z, def.debris[0], 1, this.rng, 0.1);
    }

    if (tgt.kind === 'prop' && tgt.prop) {
      this.hooks.propFlash(tgt.prop.id);
      this.bus.emit('prop:hit', { propId: tgt.prop.id, progress: res.progress, x: p.x, y: p.y, z: p.z });
      if (res.broken) {
        const spec = tgt.prop;
        const m = spec.minable!;
        const count = m.min + Math.floor(this.rng.next() * (m.max - m.min + 1));
        this.particles.sparkle(spec.x, spec.y + 0.5, spec.z, 0x8ff6ff, 8, this.rng, 2);
        this.debris.burst(spec.x, spec.y + 0.4, spec.z, [0x52e8f5, 0x9ff6ff, 0x1b8aa8], this.rng, { count: 8, speed: 1.6, size: [0.05, 0.12], glow: true, spread: 0.3, dir: [0, -0.7, 0], life: [0.7, 1.2] });
        this.drops.spawn(m.drop, count, spec.x, spec.y + 0.5, spec.z, this.rng);
        this.bus.emit('prop:broken', { propId: spec.id, x: spec.x, y: spec.y, z: spec.z });
        this.hooks.propBroken(spec);
      }
      return;
    }

    this.bus.emit('block:hit', { x: tgt.x, y: tgt.y, z: tgt.z, block: tgt.block, progress: res.progress });
    if (!res.broken) return;
    const oldId = tgt.block;
    this.world.set(tgt.x, tgt.y, tgt.z, B.AIR);
    const cx = tgt.x + 0.5;
    const cy = tgt.y + 0.5;
    const cz = tgt.z + 0.5;
    // A short crumble: at most 8 chunks and a few dust motes (calm FX).
    // The block crumbles where it stood: the chunks drop and settle (none fly at the eye).
    this.debris.burst(cx - tgt.nx * 0.15, cy, cz - tgt.nz * 0.15, def.debris, this.rng, { count: 8, speed: 1.4, size: [0.05, 0.12], spread: 0.3, dir: [tgt.nx * 0.1, -0.85, tgt.nz * 0.1], life: [0.7, 1.1], glow: def.sound === 'crystal' });
    this.particles.dust(cx, cy, cz, def.debris[0], 4, this.rng);
    if (isEmitter(oldId)) this.particles.sparkle(cx, cy, cz, 0x8ff6ff, 8, this.rng, 2.2);
    if (this.heldByFinger) {
      this.heldKind = oldId;
      this.heldAt.x = tgt.x;
      this.heldAt.y = tgt.y;
      this.heldAt.z = tgt.z;
    }
    if (def.drop) {
      const count = this.hooks.rollDrop(def.drop);
      if (count > 0) this.drops.spawn(def.drop.item, count, cx, cy, cz, this.rng);
    }
    this.bus.emit('block:broken', { x: tgt.x, y: tgt.y, z: tgt.z, block: oldId });
    this.hooks.blockBroken(tgt.x, tgt.y, tgt.z, oldId);
  }

  /**
   * The pick meets ordinary rock: a soft "tunk" and one tiny chip off the face, nothing else (no
   * damage, no crack). Taps on plain stone are never an error, just stone; once in a while the
   * hint line says what can be mined instead (`hint.plainRock`, never spammed).
   */
  private tunk(tgt: MiningTarget): void {
    this.tunkedKey = tgt.key;
    const p = tgt.point;
    const def = BLOCKS[tgt.block];
    const n: [number, number, number] = [tgt.nx, tgt.ny, tgt.nz];
    this.debris.burst(p.x + n[0] * 0.04, p.y + n[1] * 0.04, p.z + n[2] * 0.04, def.debris, this.rng, {
      count: 1, speed: 0.7, size: [0.015, 0.025], dir: [n[0] * 0.2, -0.8, n[2] * 0.2], life: [0.25, 0.4],
    });
    this.particles.dust(p.x, p.y, p.z, def.debris[0], 1, this.rng, 0.06);
    this.bus.emit('block:tunk', { x: tgt.x, y: tgt.y, z: tgt.z, block: tgt.block, px: p.x, py: p.y, pz: p.z });
    if (this.plainRockHint.onTunk(this.time)) this.hooks.hint(t('hint.plainRock'));
  }

  /** HUD summary of the current target (none on ordinary rock). */
  hudTarget(): { name: string; progress: number; blocked: boolean } | null {
    const tg = this.target;
    if (!tg || !tg.inReach) return null;
    if (tg.kind === 'block' && !isBreakable(tg.block)) return null;
    const progress = this.rules.targetKey === tg.key ? this.rules.progress : 0;
    const blocked = tg.tier > this.hooks.pickaxe().tier || tg.protectedReason !== null;
    return { name: tg.name, progress, blocked };
  }

  cancel(): void {
    this.swingTimer = 0;
    this.impactPending = false;
    this.target = null;
    this.marker.set(null, 0, false, false);
  }
}

