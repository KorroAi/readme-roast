import * as THREE from 'three';
import { B, BLOCKS, blockDef, isEmitter, UNBREAKABLE_TIER } from '../config/blocks';
import { PLAYER, type PickaxeDef } from '../config/balance';
import type { EventBus, GameEvents } from '../core/events';
import type { Rng } from '../core/rng';
import { t, type TextKey } from '../i18n';
import type { InputState } from '../input/types';
import { raycastVoxels } from '../world/raycast';
import type { VoxelWorld } from '../world/VoxelWorld';
import type { PropSpec } from '../world/gen/types';
import type { CameraRig } from './CameraRig';
import type { DebrisSystem } from './effects/Debris';
import type { ParticleSystem } from './effects/Particles';
import type { TargetMarker } from './effects/TargetMarker';
import type { DropSystem } from './Drops';

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
  /** Start the pickaxe swing animation (duration in seconds). */
  swing(duration: number): void;
  /** Rotate the explorer toward the target. */
  face(x: number, z: number, dt: number): void;
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

  /** Find what the aim ray hits (block or minable prop) and whether it is within reach. */
  findTarget(input: InputState, handX: number, handY: number, handZ: number): MiningTarget | null {
    const ndcX = input.aimFromPointer ? input.aimX : 0;
    const ndcY = input.aimFromPointer ? input.aimY : 0;
    this.cameraRig.rayThrough(ndcX, ndcY, this.origin, this.dir);
    const camToHand = this.origin.distanceTo(this.tmp.set(handX, handY, handZ));
    const maxDist = camToHand + PLAYER.reach + 1.5;
    const hit = raycastVoxels(this.world, this.origin.x, this.origin.y, this.origin.z, this.dir.x, this.dir.y, this.dir.z, maxDist);
    const propHit = this.hooks.propRaycast(this.origin, this.dir, maxDist);
    const propSpec = propHit ? this.hooks.propById(propHit.id) : null;
    const useProp = propHit && propSpec?.minable && (!hit || propHit.distance < hit.distance);
    if (useProp && propSpec && propHit) {
      const m = propSpec.minable!;
      const d = propHit.point.distanceTo(this.tmp.set(handX, handY, handZ));
      return {
        kind: 'prop', key: `prop:${propSpec.id}`, x: propSpec.x, y: propSpec.y, z: propSpec.z, nx: -this.dir.x, ny: -this.dir.y, nz: -this.dir.z,
        point: propHit.point.clone(), block: B.CRYSTAL, prop: propSpec, name: t('block.crystal'), hardness: m.hardness, tier: m.tier,
        protectedReason: null, inReach: d <= PLAYER.reach,
      };
    }
    if (!hit) return null;
    const def = BLOCKS[hit.block];
    const cx = hit.x + 0.5;
    const cy = hit.y + 0.5;
    const cz = hit.z + 0.5;
    const d = Math.hypot(cx - handX, cy - handY, cz - handZ);
    const point = new THREE.Vector3(this.origin.x + this.dir.x * hit.distance, this.origin.y + this.dir.y * hit.distance, this.origin.z + this.dir.z * hit.distance);
    return {
      kind: 'block', key: `${hit.x},${hit.y},${hit.z}`, x: hit.x, y: hit.y, z: hit.z, nx: hit.nx, ny: hit.ny, nz: hit.nz, point,
      block: hit.block, prop: null, name: t(def.name), hardness: def.hardness, tier: def.tier,
      protectedReason: def.protectedReason ?? null, inReach: d <= PLAYER.reach,
    };
  }

  /** @returns true while a swing is in progress (used to slow movement). */
  update(dt: number, input: InputState, active: boolean, handX: number, handY: number, handZ: number): boolean {
    this.time += dt;
    this.rules.update(dt);
    const wantsMine = active && input.mining;
    // Desktop with a crosshair shows the hovered block even when not mining.
    const showHover = active && (wantsMine || (!input.aimFromPointer && input.lastDevice !== 'touch'));
    this.target = showHover ? this.findTarget(input, handX, handY, handZ) : null;
    const tgt = this.target && this.target.inReach ? this.target : null;

    if (wantsMine && tgt && this.swingTimer <= 0) {
      const pick = this.hooks.pickaxe();
      this.swingTimer = pick.swingInterval;
      this.impactPending = true;
      this.impactAt = pick.swingInterval * 0.55;
      this.swingKey = tgt.key;
      this.hooks.swing(pick.swingInterval);
      this.bus.emit('tool:swing', { tier: pick.tier });
    }
    if (tgt && wantsMine) this.hooks.face(tgt.kind === 'block' ? tgt.x + 0.5 : tgt.x, tgt.kind === 'block' ? tgt.z + 0.5 : tgt.z, dt);

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
    const shown = this.target && this.target.kind === 'block' && this.target.inReach ? this.target : null;
    const progress = shown && this.rules.targetKey === shown.key ? this.rules.progress : 0;
    const blocked = !!shown && (shown.tier > this.hooks.pickaxe().tier || shown.protectedReason !== null);
    this.marker.set(shown ? { x: shown.x, y: shown.y, z: shown.z } : null, progress, blocked, wantsMine);
    this.marker.update(dt);
    return this.swingTimer > 0;
  }

  private impact(tgt: MiningTarget): void {
    const pick = this.hooks.pickaxe();
    const res = this.rules.hit(tgt.key, tgt.hardness, tgt.tier, pick, tgt.protectedReason);
    const p = tgt.point;
    if (res.blocked) {
      this.bus.emit('block:tooHard', { x: tgt.x, y: tgt.y, z: tgt.z, block: tgt.block, requiredTier: tgt.tier });
      this.cameraRig.addTrauma(0.12);
      this.particles.sparkle(p.x, p.y, p.z, 0xffd9a0, 4, this.rng, 1.6);
      if (this.time - this.lastBlockedHint > 2.5) {
        this.lastBlockedHint = this.time;
        if (tgt.protectedReason === 'protected') this.hooks.hint(t('hint.protected'));
        else if (tgt.tier >= UNBREAKABLE_TIER || tgt.protectedReason === 'unbreakable') this.hooks.hint(t('hint.unbreakable'));
        else {
          const toolKey: TextKey = tgt.tier >= 2 ? 'equip.copperPickaxe' : 'equip.rustyPickaxe';
          this.hooks.hint(t('hint.tooHard', { tool: t(toolKey) }));
        }
      }
      return;
    }
    const def = BLOCKS[tgt.block];
    this.marker.impact(1);
    this.cameraRig.addTrauma(res.broken ? 0.22 : 0.09);
    const n: [number, number, number] = [tgt.nx, tgt.ny, tgt.nz];
    this.debris.burst(p.x + n[0] * 0.05, p.y + n[1] * 0.05, p.z + n[2] * 0.05, def.debris, this.rng, {
      count: 4, speed: 3.2, size: [0.05, 0.1], dir: n, life: [0.4, 0.8], glow: def.sound === 'crystal',
    });
    if (def.sound === 'crystal') this.particles.sparkle(p.x, p.y, p.z, 0x8ff6ff, 6, this.rng);
    else this.particles.dust(p.x, p.y, p.z, def.debris[0], 2, this.rng, 0.1);

    if (tgt.kind === 'prop' && tgt.prop) {
      this.hooks.propFlash(tgt.prop.id);
      this.bus.emit('prop:hit', { propId: tgt.prop.id, progress: res.progress, x: p.x, y: p.y, z: p.z });
      if (res.broken) {
        const spec = tgt.prop;
        const m = spec.minable!;
        const count = m.min + Math.floor(this.rng.next() * (m.max - m.min + 1));
        this.particles.sparkle(spec.x, spec.y + 0.5, spec.z, 0x8ff6ff, 22, this.rng, 3.2);
        this.debris.burst(spec.x, spec.y + 0.4, spec.z, [0x52e8f5, 0x9ff6ff, 0x1b8aa8], this.rng, { count: 14, speed: 4, size: [0.06, 0.16], glow: true, spread: 0.3 });
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
    this.debris.burst(cx, cy, cz, def.debris, this.rng, { count: 12, speed: 4.2, size: [0.09, 0.22], spread: 0.35, glow: def.sound === 'crystal' });
    this.particles.dust(cx, cy, cz, def.debris[0], 7, this.rng);
    if (isEmitter(oldId)) this.particles.sparkle(cx, cy, cz, 0x8ff6ff, 18, this.rng, 3);
    if (def.drop) {
      const count = this.hooks.rollDrop(def.drop);
      if (count > 0) this.drops.spawn(def.drop.item, count, cx, cy, cz, this.rng);
    }
    this.bus.emit('block:broken', { x: tgt.x, y: tgt.y, z: tgt.z, block: oldId });
    this.hooks.blockBroken(tgt.x, tgt.y, tgt.z, oldId);
  }

  /** HUD summary of the current target. */
  hudTarget(): { name: string; progress: number; blocked: boolean } | null {
    const tg = this.target;
    if (!tg || !tg.inReach) return null;
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

