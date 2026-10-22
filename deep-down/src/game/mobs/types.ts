import type * as THREE from 'three';

/**
 * The mobs seam (round 3, MOBS). Everything another specialist needs from the creatures of the
 * deep:
 * - FP / UI's tap resolution asks `MobSystem.pick` first and attacks with `hit` (melee) or `fire`
 *   (ranged); the sonar calls `scan`; the HUD's guardian bar reads `activeGuardian()`.
 * - VIS's HighlightSystem reads `list()` for the catchable beings' rarity rims.
 * - WORLD's EventDirector asks `spawnEvent` for the event mobs; WORLD's layout gives the lairs
 *   (one guardian each) and the nests; WORLD's `BiomeId` strings are `MobBiome` here.
 * - LOOP's quests listen to 'mob:guardianDefeated' (the Heart Shard of a biome), 'mob:bestiary'
 *   (a page found or completed) and 'mob:died'.
 *
 * Families: unsettling monsters (they live where the light is not; guardians and the Heart's boss
 * are monsters with a `rank`) and small endearing beings.
 */

// ---------------------------------------------------------------------------------------
// The kinds (36 monsters, 12 beings, 12 guardians and the Heart, plus the Deep Worm's glimpse)

/** The first game's monsters (they join the rosters). */
export type LegacyMonsterKind = 'crawler' | 'gnasher' | 'wisp' | 'stalker' | 'sentinel' | 'worm';
export type RosterMonsterKind =
  // I Amber Hollows / Mushroom Forest
  | 'amberTick'
  | 'gritBoar'
  | 'sporeling'
  | 'capSpitter'
  | 'gillhanger'
  // II Root Galleries / Flooded Grottoes
  | 'rootLasher'
  | 'tunnelGrub'
  | 'thornback'
  | 'rootWeevil'
  | 'brineLeech'
  | 'spitNewt'
  | 'clatterclaw'
  | 'mistwing'
  // III Crystal Geode / Old Halden Mines
  | 'shardling'
  | 'prismBat'
  | 'geodeGolem'
  | 'quartzRam'
  | 'rustMite'
  | 'fuseBeetle'
  | 'cartMimic'
  // IV Frost Caverns / Glowroot Jungle
  | 'icefang'
  | 'frostBat'
  | 'shiverDrip'
  | 'rimeHulk'
  | 'glowMantis'
  | 'bloatToad'
  | 'snapjaw'
  | 'glowAnt'
  // V Sulphur Bog / Sunken City
  | 'gasbag'
  | 'sulphurSpitter'
  | 'mireLurker'
  | 'fumeWasp'
  | 'gildedScarab'
  | 'runeSentry'
  | 'chestMimic'
  | 'drownedKnight'
  // VI Magma Veins / Obsidian Abyss
  | 'cinderHound'
  | 'emberMite'
  | 'magmaBrute'
  | 'lavaToad'
  | 'voidEye'
  | 'glassWraith'
  | 'nullCrawler';
export type MonsterKind = LegacyMonsterKind | RosterMonsterKind;

export type LegacyBeingKind = 'moth' | 'lampling' | 'glimmerkin' | 'shellback' | 'jelly' | 'burrower';
export type RosterBeingKind = 'hearthmite' | 'vinebell' | 'mudpup' | 'relicTurtle' | 'salamander' | 'starmote';
export type BeingKind = LegacyBeingKind | RosterBeingKind;

/** One guardian per biome (each holds that biome's Heart Shard), and the Heart's boss. */
export type GuardianKind =
  | 'amberMatriarch'
  | 'mycelord'
  | 'elderTaproot'
  | 'tideWarden'
  | 'quartzTitan'
  | 'foremanEngine'
  | 'rimeWyrm'
  | 'thornmother'
  | 'miasmaKing'
  | 'gildedColossus'
  | 'magmaBehemoth'
  | 'voidHerald'
  | 'heartOfDark';

export type MobKind = MonsterKind | BeingKind | GuardianKind;
export type MobFamily = 'monster' | 'being';
/** A guardian and the Heart's boss are monsters of a higher rank (a lair, a HUD bar, a shard). */
export type MobRank = 'minion' | 'guardian' | 'boss';

/**
 * The biomes (§0.2), in descent order, plus the Heart. These strings are WORLD's `BiomeId`
 * (src/config/biomes.ts); MOBS keys its rosters by them.
 */
export type MobBiome =
  | 'amberHollows'
  | 'mushroomForest'
  | 'rootGalleries'
  | 'floodedGrottoes'
  | 'crystalGeode'
  | 'haldenMines'
  | 'frostCaverns'
  | 'glowrootJungle'
  | 'sulphurBog'
  | 'sunkenCity'
  | 'magmaVeins'
  | 'obsidianAbyss'
  | 'heart';
export const MOB_BIOMES: readonly MobBiome[] = ['amberHollows', 'mushroomForest', 'rootGalleries', 'floodedGrottoes', 'crystalGeode', 'haldenMines', 'frostCaverns', 'glowrootJungle', 'sulphurBog', 'sunkenCity', 'magmaVeins', 'obsidianAbyss', 'heart'];

/**
 * The behaviour archetypes (§0.5). Monsters: swarmer, charger, ranged spitter, ambusher (ceiling
 * drop or a mimic), flyer (diver or a light drinker), burrower, brute / tank, exploder. Beings:
 * flutter (moth clouds), follower (lights the way), skitter (catch it), grazer (harvest it),
 * floater (spores), thief (catch it before it digs away). Guardians and the boss have patterns.
 */
export type MonsterArchetype = 'swarmer' | 'charger' | 'spitter' | 'ambusher' | 'flyer' | 'burrower' | 'brute' | 'exploder';
export type BeingArchetype = 'flutter' | 'follower' | 'skitter' | 'grazer' | 'floater' | 'thief';
export type MobArchetype = MonsterArchetype | BeingArchetype | 'guardian' | 'boss' | 'vista';

/** What a blow or a spit carries besides damage (LOOP's hazards may add a status: chill, poison, burn, dark). */
export type MobElement = 'none' | 'frost' | 'acid' | 'fire' | 'spore' | 'void' | 'shock';

/** The five tiers of `config/rarity.ts` (kept structural so the seams stay independent). */
export type MobRarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';

export type MobSize = 'tiny' | 'small' | 'medium' | 'large' | 'huge';

/**
 * An elite's affixes (round 3 stretch; game/mobs/elites.ts): radiant (it shines and leads its pack),
 * armoured (its front turns blows), swift (faster, quicker tells), splitting (it splits in two).
 */
export type MobAffix = 'radiant' | 'armoured' | 'swift' | 'splitting';
export const MOB_AFFIXES: readonly MobAffix[] = ['radiant', 'armoured', 'swift', 'splitting'];

// ---------------------------------------------------------------------------------------
// Rosters, guardians, the bestiary

/** One kind in a biome's roster: how often the spawner picks it and in what numbers. */
export interface RosterEntry {
  kind: MobKind;
  /** Relative pick weight inside its family. */
  weight: number;
  /** Pack size [min, max] (a swarm comes several at once). */
  pack: [number, number];
  /** At most this many alive at once. */
  max: number;
  /** Times the weight at night (the day cycle) and in the dark (a low or dead flame). */
  night?: number;
  dark?: number;
  /** Spawns from WORLD's nests in this biome (swarmers). */
  nest?: boolean;
}

export interface BiomeRoster {
  biome: MobBiome;
  /** 1..6 (the Heart counts as VI). */
  stratum: number;
  monsters: RosterEntry[];
  beings: RosterEntry[];
  guardian: GuardianKind;
}

/** The guardian of the fight now, for the HUD's bar (UI's GuardianBarView reads name, hp, max, phase, phases). */
export interface GuardianState {
  id: number;
  kind: GuardianKind;
  biome: MobBiome;
  /** The display name (already through t()) and its key. */
  name: string;
  nameKey: string;
  hp: number;
  max: number;
  /** 1-based phase and how many (the Heart has 3, a guardian 2). */
  phase: number;
  phases: number;
  /** 'dormant' (asleep in its lair), 'awake' (fighting), 'defeated'. */
  status: 'dormant' | 'awake' | 'defeated';
  /** Its guard is open: blows land for more (after each attack). */
  vulnerable: boolean;
  /** The open guard's time left, as a share of the window (1 as it opens, 0 when shut): a HUD may show it closing. */
  window: number;
  /** The attack it is winding up now (a text key, for an optional HUD line), or null. */
  telegraph: string | null;
  /**
   * The Dark Heart only: its beat now, the period (s: 2.0 asleep, 1.5 / 1.0 / 0.75 by phase, on the
   * boss theme's 120 bpm grid) and how far into it (0..1; 0 is the lub, when 'guardian.heartbeat' plays).
   */
  beat?: { period: number; phase: number };
}

/** A bestiary page's data (static; what the explorer has done with it is in `BestiaryProgress`). */
export interface BestiaryEntry {
  kind: MobKind;
  family: MobFamily;
  rank: MobRank;
  archetype: MobArchetype;
  /** Its home biome (the bestiary groups by it). */
  biome: MobBiome;
  /** Text keys (i18n/en/mobs): its name, a line of lore, how to deal with it. */
  nameKey: string;
  loreKey: string;
  tipKey: string;
  /** 0 harmless .. 5 deadly. */
  threat: number;
  size: MobSize;
  hp: number;
  damage: number;
  element: MobElement;
  /** Item ids it may leave (in preference order per drop, the first the game knows is used). */
  drops: string[];
}

export interface BestiaryProgress {
  seen: boolean;
  scanned: boolean;
  defeated: number;
  /** Caught, harvested, petted (beings). */
  befriended: number;
}

/** UI's BestiaryEntryView, filled by MOBS (structurally the same shape). */
export interface BestiaryEntryView {
  kind: string;
  name: string;
  biome: string;
  role: 'monster' | 'being' | 'guardian' | 'boss';
  desc: string;
  seen: boolean;
  scanned: boolean;
  defeated: number;
  bonus: string | null;
}

// ---------------------------------------------------------------------------------------
// Bus events (declared once, here)

declare module '../../core/events' {
  interface GameEvents {
    'mob:spawned': { id: number; kind: MobKind };
    /** A wind-up: every attack is announced (sound, pose, a ground marker for the big ones) before it lands. */
    'mob:telegraph': { id: number; kind: MobKind; pan: number; gain: number };
    'mob:attack': { id: number; kind: MobKind; damage: number; landed: boolean; element?: MobElement };
    'mob:hit': { id: number; kind: MobKind; damage: number; killed: boolean; armoured: boolean; pan: number; gain: number; x?: number; y?: number; z?: number; weak?: boolean };
    'mob:died': { id: number; kind: MobKind; pan: number; gain: number; biome?: MobBiome; rank?: MobRank; elite?: boolean; affixes?: MobAffix[] };
    /** An elite is met (first sight): its name (through t()) and affixes, for a toast or a nameplate. */
    'mob:elite': { id: number; kind: MobKind; affixes: MobAffix[]; name: string };
    /** The companion (round 3 stretch): a wild Lampling fed a glowcap trusts a little more (`trust` of `need`). */
    'companion:trust': { kind: MobKind; trust: number; need: number };
    /** It is tamed: it follows the explorer from now on (saved). */
    'companion:tamed': { kind: MobKind; name: string };
    /** Fed (a glowcap) or rewarded: experience gained, and its total toward the next level. */
    'companion:fed': { kind: MobKind; xp: number; total: number; next: number };
    'companion:level': { kind: MobKind; level: number };
    /** It senses a rare ore nearby and chirps (it hovers by it a moment). */
    'companion:ore': { x: number; y: number; z: number; block: number; rarity: MobRarity };
    /** It zaps a small foe with a mote of light. */
    'companion:zap': { target: number; kind: MobKind; damage: number; killed: boolean };
    'mob:interact': { id: number; kind: MobKind; action: 'caught' | 'harvested' | 'spores' | 'petted' };
    /** A creature's voice (breathing, chitter, whisper, drone...), placed in stereo. */
    'mob:cue': { kind: MobKind; cue: string; pan: number; gain: number };
    'mob:shot': { phase: 'fly' | 'hit' | 'miss'; pan: number; gain: number };
    'mob:met': { kind: MobKind };
    /** Any of the creatures' sounds by its SFX name (audio/mobSfx), placed in stereo (LOOP's eventMap plays it). */
    'mob:sfx': { name: string; pan: number; gain: number; pitch?: number };
    /** A guardian wakes in its lair (the HUD shows its bar; the music may turn). */
    'mob:guardianAwake': { id: number; kind: GuardianKind; biome: MobBiome };
    'mob:guardianPhase': { id: number; kind: GuardianKind; biome: MobBiome; phase: number };
    /** The explorer fled its lair: it heals and sleeps again. */
    'mob:guardianReset': { id: number; kind: GuardianKind; biome: MobBiome };
    /**
     * Round 3 (second MOBS): its guard opens after an attack for `seconds`, the window to strike
     * (blows land 1.6x). Optional in GameEvents so AUDIO's exhaustive table stays typed until mapped.
     */
    'mob:guardianOpen'?: { id: number; kind: GuardianKind; biome: MobBiome; seconds: number };
    /** A guardian is beaten: its biome's Heart Shard drops (the Heart's boss: shard 'heart', the ending). */
    'mob:guardianDefeated': { id: number; kind: GuardianKind; biome: MobBiome; shard: MobBiome; x: number; y: number; z: number };
    /** A creature was scanned (the sonar, or watched up close); `first` for the kind's first scan. */
    'mob:scanned': { id: number; kind: MobKind; first: boolean };
    /** A bestiary page: 'new' (first met), 'complete' (scanned or defeated: its bonus applies). */
    'mob:bestiary': { kind: MobKind; page: 'new' | 'complete'; found: number; total: number };
  }
}

// ---------------------------------------------------------------------------------------
// The live creatures

/**
 * What a mob is doing. Monsters: lurk, stalk, windup (the telegraph), attack, recoil (from light or
 * a hit), flee, burrow (underground). Beings: idle, wander, follow, flee, caught/harvested.
 * Everyone: dying, then gone.
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
  | 'burrow'
  | 'stunned'
  | 'dying';

export interface Mob {
  /** Unique for the session (never reused). */
  readonly id: number;
  readonly kind: MobKind;
  readonly family: MobFamily;
  readonly rank?: MobRank;
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
  /** An elite's affixes (empty for most). */
  readonly affixes?: readonly MobAffix[];
  /**
   * Round 3: its drawn bulk (m: ahead of its centre, behind it, to each side), for the guardians and
   * the large and huge kinds once seen (null otherwise): the explorer is kept out of it, a tap on it
   * picks the creature, and a screen snap may be sized by it (its model can be wider than `bounds`).
   */
  readonly body?: { readonly front: number; readonly back: number; readonly side: number } | null;
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
  /** Hit-stop length to apply (s): 0.04-0.07 on a monster, 0 otherwise. */
  hitStop: number;
  /** The interaction a being answered with, if any. */
  action?: 'caught' | 'harvested' | 'spores' | 'petted' | 'startled';
  /** The blow found an open guard / a weak spot (more damage, a brighter flash). */
  weak?: boolean;
  /** The blow met a shell or a closed guard (less damage, a dull flash, a clank). */
  armoured?: boolean;
  /** The damage dealt after armour and weak spots. */
  damage?: number;
}

export interface MobStrike {
  /** 'pick' when no weapon is equipped (the pickaxe always strikes, weakly). */
  weapon?: string;
  /** Light-bearing strikes (sling shards, flash charges) also make crawlers and wisps recoil. */
  light?: boolean;
  /** Where the strike came from (for knock-back). Defaults to the explorer. */
  from?: { x: number; y: number; z: number };
  /** Knock-back strength multiplier (heavy weapons push more). Default 1. */
  knock?: number;
  /** A bomb's blast (hurts every monster in the radius, ignores a mimic's shell). */
  blast?: boolean;
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
  /** The biome at the explorer (WORLD's biomeAt), and its stratum 1..6. Absent: the first world. */
  biome?: MobBiome;
  stratum?: number;
  /** 0 day .. 1 deep night (the day cycle): more monsters at night. */
  night?: number;
  /** The explorer is dodging (a dash's i-frames): blows and spits pass through. */
  invulnerable?: boolean;
  /** The explorer's feet are off the ground (a jump clears a guardian's shockwave). */
  airborne?: boolean;
  /** Where the explorer looks (unit vector): packs flank outside it, the tutorial's foe comes in it. */
  look?: { x: number; y: number; z: number };
}

export interface MobSystem {
  update(dt: number, ctx: MobContext): void;
  /** The nearest tappable mob along the ray (a monster or a being), or null. */
  pick(ray: MobRay): Mob | null;
  /** A melee strike (or a tap on a being, which catches, harvests or touches it). */
  hit(mob: Mob, dmg: number, strike?: MobStrike): MobHitResult;
  /** A ranged shot (the Flare Sling, a crossbow bolt): flies from `from` to the mob and strikes on arrival. */
  fire(from: { x: number; y: number; z: number }, mob: Mob | null, dmg: number, dir?: { x: number; y: number; z: number }): void;
  /** A burst of light (a Flash Charge, a raised lantern): monsters within `radius` recoil or flee; `dmg` to each. */
  flash(x: number, y: number, z: number, radius: number, dmg?: number): number;
  /** A bomb: `dmg` to every monster within `radius` (falling off to half at the edge), knocked away. @returns how many were hit. */
  blast?(x: number, y: number, z: number, radius: number, dmg: number): number;
  /** The sonar's pulse: every creature within `radius` is scanned (a bestiary page). @returns how many. */
  scan?(x: number, y: number, z: number, radius: number): number;
  /** The event director asks for an event mob (the moth migration, the fleeing treasure mob, the worm). */
  spawnEvent(kind: 'migration' | 'treasure' | 'worm', at: { x: number; y: number; z: number }): Mob[];
  /** The guardian fighting now (awake, in its lair), for the HUD's bar; null when none. */
  activeGuardian?(): GuardianState | null;
  list(): readonly Mob[];
}
