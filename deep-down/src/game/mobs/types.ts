import type * as THREE from 'three';

/**
 * The mobs seam (round 2, MOBS). Everything another specialist needs from the creatures of the
 * deep: FP's tap resolution asks `MobSystem.pick` first and attacks with `hit` (melee) or `fire`
 * (ranged), VIS's HighlightSystem reads `list()` for the catchable beings' rarity rims, WORLD's
 * EventDirector asks `spawnEvent` for the event mobs (the moth migration, the fleeing treasure mob).
 *
 * Two families: unsettling monsters (they live where the light is not) and small endearing beings.
 */
export type MonsterKind = 'crawler' | 'gnasher' | 'wisp' | 'stalker' | 'sentinel' | 'worm';
export type BeingKind = 'moth' | 'lampling' | 'glimmerkin' | 'shellback' | 'jelly' | 'burrower';
export type MobKind = MonsterKind | BeingKind;
export type MobFamily = 'monster' | 'being';

/** The same five tiers as WORLD's `config/rarity.ts` (kept structural so the seams stay independent). */
export type MobRarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';

/**
 * What a mob is doing. Monsters: lurk, stalk, windup (the telegraph), attack, recoil (from light or
 * a hit), flee. Beings: idle, wander, follow, flee, caught/harvested. Everyone: dying, then gone.
 */
export type MobState =
  | 'idle'
  | 'wander'
  | 'lurk'
  | 'stalk'
  | 'windup'
  | 'attack'
  | 'recoil'
  | 'flee'
  | 'follow'
  | 'sleep'
  | 'wake'
  | 'caught'
  | 'harvested'
  | 'dying';

export interface Mob {
  /** Unique for the session (never reused). */
  readonly id: number;
  readonly kind: MobKind;
  readonly family: MobFamily;
  /** The body's centre, world metres (mutated in place by the simulation). */
  readonly position: THREE.Vector3;
  /** A vertical capsule round `position`: radius, and half the height of its straight part. */
  readonly bounds: { radius: number; halfHeight: number };
  /** Facing (radians, 0 = +z, like the explorer's yaw). */
  yaw: number;
  hp?: number;
  maxHp?: number;
  state: MobState;
  /** Seconds in the current state. */
  stateTime: number;
  /** A monster can hurt the explorer; a being never does. */
  readonly hostile: boolean;
  /** A tap does something to it (attack a monster, catch / harvest / touch a being). */
  tappable: boolean;
  /** Catchable or harvestable beings show a rarity rim (HighlightSystem). */
  rarity?: MobRarity;
  /** The render root (set by render/mobs), for outlines and screen-space picking. */
  object?: THREE.Object3D;
}

/** A pick ray in world space (direction need not be normalised). */
export interface MobRay {
  ox: number;
  oy: number;
  oz: number;
  dx: number;
  dy: number;
  dz: number;
  /** Ignore mobs farther than this along the ray (m). Default 30. */
  maxDist?: number;
  /** Extra radius (m) added to every capsule, for generous touch picking. Default 0.25. */
  slack?: number;
}

/** What a strike did, for FP's feedback (hit stop and flash on the mob only, never the screen). */
export interface MobHitResult {
  /** The strike landed (false: out of reach, already dying, or a being that cannot be struck). */
  hit: boolean;
  /** The mob died or was caught / harvested by it. */
  killed: boolean;
  /** Hit-stop length to apply (s): 0.04 on a monster, 0 otherwise. */
  hitStop: number;
  /** The interaction a being answered with, if any. */
  action?: 'caught' | 'harvested' | 'spores' | 'petted' | 'startled';
}

export interface MobStrike {
  /** 'pick' when no weapon is equipped (the pickaxe always strikes, weakly). */
  weapon?: string;
  /** Light-bearing strikes (sling shards, flash charges) also make crawlers and wisps recoil. */
  light?: boolean;
  /** Where the strike came from (for knock-back). Defaults to the explorer. */
  from?: { x: number; y: number; z: number };
}

/** The per-frame view of the world the simulation reads. */
export interface MobContext {
  /** Seconds since the session started (animation clock). */
  time: number;
  player: { x: number; y: number; z: number; vx: number; vz: number };
  /** The eye (camera) position. */
  eye: { x: number; y: number; z: number };
  lantern: {
    x: number;
    y: number;
    z: number;
    /** The light's reach now (m). */
    radius: number;
    /** 0..1: how full the flame is (oil, gusts, wisps); 0 when out. */
    flame: number;
    lit: boolean;
    /** The flame is raised (a tap on the dark): brighter for a moment, monsters recoil. */
    raised: boolean;
  };
  /** Displayed depth of the explorer (m). */
  depth: number;
  atCamp: boolean;
  /** Gameplay is running (false on menus, pause, death). */
  active: boolean;
}

export interface MobSystem {
  update(dt: number, ctx: MobContext): void;
  /** The nearest tappable mob along the ray (a monster or a being), or null. */
  pick(ray: MobRay): Mob | null;
  /** A melee strike (or a tap on a being, which catches, harvests or touches it). */
  hit(mob: Mob, dmg: number, strike?: MobStrike): MobHitResult;
  /** A ranged shot (the Flare Sling): a light shard flies from `from` to the mob and strikes on arrival. */
  fire(from: { x: number; y: number; z: number }, mob: Mob | null, dmg: number, dir?: { x: number; y: number; z: number }): void;
  /** A burst of light (a Flash Charge, a raised lantern): monsters within `radius` recoil or flee; `dmg` to each. */
  flash(x: number, y: number, z: number, radius: number, dmg?: number): number;
  /** The event director asks for an event mob (the moth migration, the fleeing treasure mob). */
  spawnEvent(kind: 'migration' | 'treasure' | 'worm', at: { x: number; y: number; z: number }): Mob[];
  list(): readonly Mob[];
}
