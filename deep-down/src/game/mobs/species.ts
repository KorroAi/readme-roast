import type { BeingKind, GuardianKind, MobArchetype, MobBiome, MobElement, MobFamily, MobKind, MobRank, MobRarity, MobSize, MonsterKind } from './types';

/**
 * Every creature's numbers (round 3, MOBS): the first game's twelve kinds kept as they were, and
 * the rosters of the twelve biomes built on eight behaviour archetypes (a brain each) with their
 * own size, stats, element, voice and drops. Damage to the explorer is in health points (100 at
 * the start, more with armour); hit points are on the scale of LOOP's weapons (pickaxe 1, machete
 * 2, spear 5, rising with the tiers: a stratum's monsters take 2-6 blows of its tier's weapon).
 */
export type Locomotion = 'crawl' | 'walk' | 'fly' | 'still' | 'path';

/** The simulation's brains (MobSim dispatches on them; several kinds share one). */
export type BrainId =
  // The first game's (kept, now shared by the archetypes that fit them).
  | 'cling' // crawl on any rock at the edge of the light, dart in (swarmer)
  | 'mimic' // a boulder / chest / flower that opens its teeth (ambusher)
  | 'drain' // drifting smoke that drinks the flame (flyer)
  | 'lurk' // tall thing at the edge of a full flame (ambusher)
  | 'sentinel' // the relic's automaton (brute)
  | 'vista' // the Deep Worm passing far off
  // Round 3 archetypes.
  | 'pack' // ground swarm: circle, nip one at a time
  | 'charge' // paw, lock a line, rush; stunned by a wall
  | 'spit' // keep away, swell, spit a slow glob
  | 'drop' // hang from the ceiling, fall on the explorer, then crawl
  | 'dive' // circle overhead, shriek, dive at a marked point
  | 'dig' // travel underground (a rumble), burst up under the explorer
  | 'slam' // slow armoured brute: raise, slam a marked circle, then open
  | 'fuse' // rush in, swell and blink, burst
  // Beings.
  | 'moth'
  | 'lamp'
  | 'skitter'
  | 'graze'
  | 'float'
  | 'thief'
  // Bosses.
  | 'guardian'
  | 'heart';

/** A hostile spit or volley orb (slow and visible: it can be side-stepped or dashed through). */
export interface ShotDef {
  speed: number;
  damage: number;
  /** Its hit radius (m). */
  radius: number;
  count: number;
  /** Fan half-angle (radians) for several. */
  spread: number;
  element: MobElement;
  /** sRGB hex of its glow. */
  color: number;
  /** Downward pull (m/s²): 0 straight, more for a lobbed glob. */
  gravity: number;
  /** Splash radius where it lands (0: only a direct hit). */
  splash: number;
}

export interface Drop {
  items: readonly string[];
  min: number;
  max: number;
  chance: number;
}

export interface Voice {
  /** SFX names (audio/mobSfx): the wind-up, a blow landing on it, its death, its idle voice. */
  tele: string;
  hit: string;
  die: string;
  idle?: string;
}

export interface MobDef {
  kind: MobKind;
  family: MobFamily;
  /** Capsule round the body centre. */
  radius: number;
  halfHeight: number;
  /** Body centre above the feet (walkers) or off the surface (crawlers). */
  lift: number;
  hp: number;
  speed: number;
  locomotion: Locomotion;
  /** Damage of one attack (monsters). */
  damage: number;
  /** Telegraph (wind-up) seconds before an attack lands. */
  windup: number;
  /** Seconds between two attacks of the same mob. */
  cooldown: number;
  /** Reach of its attack (m, from its body centre to the explorer's); a spitter's range. */
  reach: number;
  rarity?: MobRarity;
}

export interface SpeciesDef extends MobDef {
  archetype: MobArchetype;
  brain: BrainId;
  biome: MobBiome;
  rank: MobRank;
  size: MobSize;
  threat: number;
  element: MobElement;
  /** Body height in cells (walkers' headroom). */
  height: number;
  /** Per-mob size variation [min, max] of the drawn scale. */
  scale: [number, number];
  /** Fraction of a blow taken while its guard is up (1: none; a mimic shut, a brute's plates). */
  armour: number;
  /** Knock-back resistance (1 light .. 6 immovable). */
  mass: number;
  shot?: ShotDef;
  /** Charger rush speed (m/s), exploder / slam blast radius (m). */
  rush?: number;
  blast?: number;
  drops: Drop[];
  /** The motes it leaves as it fades, and its glow. */
  mote: number;
  voice: Voice;
}

type Base = Omit<SpeciesDef, 'kind' | 'family' | 'rank'>;

const V = {
  bug: { tele: 'mob.chitter', hit: 'mob.hit.flesh', die: 'mob.die.monster', idle: 'mob.buzz' },
  beast: { tele: 'mob.roar', hit: 'mob.hit.flesh', die: 'mob.die.monster', idle: 'mob.breath' },
  rock: { tele: 'mob.grind', hit: 'mob.hit.armour', die: 'mob.die.stone' },
  smoke: { tele: 'mob.whisper', hit: 'mob.hit.smoke', die: 'mob.die.smoke' },
  spit: { tele: 'mob.hiss', hit: 'mob.hit.flesh', die: 'mob.die.monster', idle: 'mob.croak' },
  fuse: { tele: 'mob.fuse', hit: 'mob.hit.flesh', die: 'mob.boom' },
  bat: { tele: 'mob.screech', hit: 'mob.hit.flesh', die: 'mob.die.monster', idle: 'mob.flutter' },
  dig: { tele: 'mob.rumble', hit: 'mob.hit.flesh', die: 'mob.die.monster' },
  drip: { tele: 'mob.drip', hit: 'mob.hit.flesh', die: 'mob.die.monster' },
  shell: { tele: 'mob.snarl', hit: 'mob.hit.armour', die: 'mob.die.monster', idle: 'mob.breath' },
  being: { tele: 'mob.chirp', hit: 'mob.hit.flesh', die: 'mob.chime' },
  boss: { tele: 'guardian.roar', hit: 'mob.hit.armour', die: 'guardian.fall', idle: 'mob.breath' },
} as const satisfies Record<string, Voice>;

const d = (items: string[], min: number, max: number, chance: number): Drop => ({ items, min, max, chance });

function m(b: Partial<Base> & Pick<Base, 'archetype' | 'brain' | 'biome' | 'radius' | 'hp' | 'speed' | 'locomotion' | 'damage'>): Base {
  return {
    halfHeight: 0,
    lift: b.radius,
    windup: 0.7,
    cooldown: 2.6,
    reach: 1.3,
    size: 'small',
    threat: 2,
    element: 'none',
    height: 1,
    scale: [0.9, 1.1],
    armour: 1,
    mass: 1,
    drops: [],
    mote: 0xcfd8e0,
    voice: V.bug,
    ...b,
  };
}

const MONSTERS: Record<MonsterKind, Base> = {
  // ---------------------------------------------------------------- I Amber Hollows
  crawler: m({ archetype: 'swarmer', brain: 'cling', biome: 'amberHollows', radius: 0.42, lift: 0.2, hp: 4, speed: 3.1, locomotion: 'crawl', damage: 9, windup: 0.6, cooldown: 3.2, reach: 1.25, size: 'small', threat: 1, scale: [0.7, 1.25], drops: [d(['chitin'], 1, 1, 0.45)], mote: 0x9ff7dc }),
  gnasher: m({ archetype: 'ambusher', brain: 'mimic', biome: 'amberHollows', radius: 0.62, halfHeight: 0.05, lift: 0.58, hp: 8, speed: 1.4, locomotion: 'still', damage: 18, windup: 0.75, cooldown: 2.6, reach: 2.1, size: 'medium', threat: 2, height: 2, armour: 0.3, mass: 4, drops: [d(['amber'], 1, 2, 1), d(['fang'], 1, 2, 0.7), d(['copperOre'], 1, 2, 0.5)], mote: 0xff8a50, voice: V.shell }),
  gritBoar: m({ archetype: 'charger', brain: 'charge', biome: 'amberHollows', radius: 0.46, halfHeight: 0.06, lift: 0.44, hp: 7, speed: 2.2, locomotion: 'walk', damage: 11, windup: 0.95, cooldown: 3.8, reach: 1.3, size: 'small', threat: 2, height: 1, scale: [0.9, 1.15], mass: 2, rush: 8.5, drops: [d(['hide'], 1, 2, 1), d(['fang'], 1, 1, 0.5)], mote: 0xe0a860, voice: V.beast }),
  amberTick: m({ archetype: 'swarmer', brain: 'pack', biome: 'amberHollows', radius: 0.22, lift: 0.16, hp: 2, speed: 3.9, locomotion: 'walk', damage: 5, windup: 0.45, cooldown: 1.8, reach: 1.05, size: 'tiny', threat: 1, scale: [0.8, 1.15], drops: [d(['chitin'], 1, 1, 0.3), d(['amber'], 1, 1, 0.12)], mote: 0xffb347 }),
  // ---------------------------------------------------------------- I Mushroom Forest
  wisp: m({ archetype: 'flyer', brain: 'drain', biome: 'mushroomForest', radius: 0.55, halfHeight: 0.35, lift: 1.5, hp: 4, speed: 1.5, locomotion: 'fly', damage: 0, windup: 0.8, cooldown: 1, reach: 3.2, size: 'medium', threat: 2, element: 'void', drops: [d(['sporeQuartz'], 1, 1, 0.45), d(['gel'], 1, 1, 0.3)], mote: 0xb9a8e8, voice: V.smoke }),
  sporeling: m({ archetype: 'exploder', brain: 'fuse', biome: 'mushroomForest', radius: 0.34, lift: 0.34, hp: 2, speed: 2.7, locomotion: 'walk', damage: 16, windup: 1.05, cooldown: 1, reach: 2.0, size: 'small', threat: 2, element: 'spore', blast: 2.4, drops: [d(['glowcap'], 1, 2, 0.5), d(['gel'], 1, 1, 0.35)], mote: 0x7af2c8, voice: V.fuse }),
  capSpitter: m({ archetype: 'spitter', brain: 'spit', biome: 'mushroomForest', radius: 0.42, halfHeight: 0.25, lift: 0.7, hp: 5, speed: 1.6, locomotion: 'walk', damage: 8, windup: 0.7, cooldown: 2.6, reach: 11, size: 'small', threat: 2, height: 2, element: 'spore', shot: { speed: 10, damage: 8, radius: 0.22, count: 1, spread: 0, element: 'spore', color: 0x6df0d8, gravity: 2, splash: 0 }, drops: [d(['glowcap'], 1, 2, 0.7), d(['gel'], 1, 1, 0.6), d(['fungalWood'], 1, 1, 0.3)], mote: 0xd06cff, voice: V.spit }),
  gillhanger: m({ archetype: 'ambusher', brain: 'drop', biome: 'mushroomForest', radius: 0.45, lift: 0.25, hp: 6, speed: 2.2, locomotion: 'crawl', damage: 12, windup: 0.65, cooldown: 3, reach: 1.4, size: 'small', threat: 2, element: 'spore', blast: 1.6, drops: [d(['glowcap'], 1, 2, 0.7), d(['gel'], 1, 1, 0.4)], mote: 0x6df0d8, voice: V.drip }),
  // ---------------------------------------------------------------- II Root Galleries
  rootLasher: m({ archetype: 'ambusher', brain: 'drop', biome: 'rootGalleries', radius: 0.5, lift: 0.26, hp: 9, speed: 2.4, locomotion: 'crawl', damage: 14, windup: 0.6, cooldown: 3, reach: 1.5, size: 'medium', threat: 2, blast: 1.7, drops: [d(['rootFibre'], 1, 2, 0.8), d(['heartwood'], 1, 1, 0.35)], mote: 0xc8d26a, voice: V.drip }),
  tunnelGrub: m({ archetype: 'burrower', brain: 'dig', biome: 'rootGalleries', radius: 0.55, halfHeight: 0.1, lift: 0.42, hp: 11, speed: 4.6, locomotion: 'walk', damage: 15, windup: 0.95, cooldown: 3.5, reach: 1.8, size: 'medium', threat: 3, height: 1, blast: 1.8, drops: [d(['hide'], 1, 2, 0.8), d(['ironOre'], 1, 2, 0.5)], mote: 0xe0b07a, voice: V.dig }),
  thornback: m({ archetype: 'charger', brain: 'charge', biome: 'rootGalleries', radius: 0.68, halfHeight: 0.1, lift: 0.62, hp: 13, speed: 2.1, locomotion: 'walk', damage: 18, windup: 0.85, cooldown: 3.4, reach: 1.4, size: 'medium', threat: 3, height: 2, mass: 3, rush: 9.5, drops: [d(['hide'], 1, 2, 0.9), d(['fang'], 1, 2, 0.7), d(['heartwood'], 1, 1, 0.25)], mote: 0xa8c84a, voice: V.beast }),
  rootWeevil: m({ archetype: 'swarmer', brain: 'pack', biome: 'rootGalleries', radius: 0.24, lift: 0.17, hp: 4, speed: 4.0, locomotion: 'walk', damage: 7, windup: 0.45, cooldown: 1.8, reach: 1.05, size: 'tiny', threat: 2, scale: [0.85, 1.2], drops: [d(['rootFibre'], 1, 1, 0.4), d(['chitin'], 1, 1, 0.3)], mote: 0xc8d26a }),
  // ---------------------------------------------------------------- II Flooded Grottoes
  brineLeech: m({ archetype: 'swarmer', brain: 'cling', biome: 'floodedGrottoes', radius: 0.3, lift: 0.15, hp: 4, speed: 3.4, locomotion: 'crawl', damage: 7, windup: 0.5, cooldown: 2.6, reach: 1.2, size: 'small', threat: 2, scale: [0.8, 1.2], drops: [d(['gel'], 1, 1, 0.5)], mote: 0x7fd0ff }),
  spitNewt: m({ archetype: 'spitter', brain: 'spit', biome: 'floodedGrottoes', radius: 0.36, lift: 0.3, hp: 7, speed: 2.5, locomotion: 'walk', damage: 10, windup: 0.65, cooldown: 2.4, reach: 12, size: 'small', threat: 2, element: 'frost', shot: { speed: 13, damage: 10, radius: 0.2, count: 1, spread: 0, element: 'frost', color: 0x7fd0ff, gravity: 1, splash: 0 }, drops: [d(['gel'], 1, 1, 0.6), d(['pearl'], 1, 1, 0.3)], mote: 0x6ec8ff, voice: V.spit }),
  clatterclaw: m({ archetype: 'brute', brain: 'slam', biome: 'floodedGrottoes', radius: 0.9, halfHeight: 0.2, lift: 0.72, hp: 26, speed: 1.35, locomotion: 'walk', damage: 22, windup: 1.1, cooldown: 2.6, reach: 2.4, size: 'large', threat: 3, height: 2, armour: 0.4, mass: 5, blast: 2.5, drops: [d(['chitin'], 2, 3, 1), d(['pearl'], 1, 2, 0.6)], mote: 0x5fb0d8, voice: V.shell }),
  mistwing: m({ archetype: 'flyer', brain: 'dive', biome: 'floodedGrottoes', radius: 0.4, lift: 2.2, hp: 7, speed: 4.0, locomotion: 'fly', damage: 12, windup: 0.75, cooldown: 3.3, reach: 1.15, size: 'small', threat: 2, element: 'frost', rush: 10.5, drops: [d(['gel'], 1, 1, 0.5), d(['pearl'], 1, 1, 0.35)], mote: 0x9fe4ff, voice: V.bat }),
  // ---------------------------------------------------------------- III Crystal Geode
  shardling: m({ archetype: 'exploder', brain: 'fuse', biome: 'crystalGeode', radius: 0.36, lift: 0.36, hp: 5, speed: 3.1, locomotion: 'walk', damage: 22, windup: 0.9, cooldown: 1, reach: 2.1, size: 'small', threat: 3, element: 'shock', blast: 2.6, drops: [d(['glimmerShard'], 1, 2, 0.6), d(['echoShard'], 1, 1, 0.3)], mote: 0x52e8f5, voice: V.fuse }),
  prismBat: m({ archetype: 'flyer', brain: 'dive', biome: 'crystalGeode', radius: 0.36, lift: 2.2, hp: 7, speed: 4.2, locomotion: 'fly', damage: 14, windup: 0.7, cooldown: 3.2, reach: 1.15, size: 'small', threat: 3, rush: 11, drops: [d(['glimmerShard'], 1, 1, 0.5), d(['hide'], 1, 1, 0.5)], mote: 0xc29cff, voice: V.bat }),
  geodeGolem: m({ archetype: 'brute', brain: 'slam', biome: 'crystalGeode', radius: 1.0, halfHeight: 0.6, lift: 1.4, hp: 40, speed: 1.15, locomotion: 'walk', damage: 26, windup: 1.3, cooldown: 2.8, reach: 2.8, size: 'large', threat: 4, height: 3, armour: 0.35, mass: 6, blast: 2.9, drops: [d(['gem', 'glimmerShard'], 2, 3, 1), d(['echoShard'], 1, 2, 0.7)], mote: 0x8fe8ff, voice: V.rock }),
  quartzRam: m({ archetype: 'charger', brain: 'charge', biome: 'crystalGeode', radius: 0.62, halfHeight: 0.1, lift: 0.64, hp: 22, speed: 2.4, locomotion: 'walk', damage: 22, windup: 0.85, cooldown: 3.4, reach: 1.4, size: 'medium', threat: 3, height: 2, element: 'shock', mass: 3, rush: 10.5, drops: [d(['glimmerShard'], 1, 2, 0.8), d(['hide'], 1, 1, 0.6)], mote: 0xc29cff, voice: V.beast }),
  // ---------------------------------------------------------------- III Old Halden Mines
  sentinel: m({ archetype: 'brute', brain: 'sentinel', biome: 'haldenMines', radius: 0.95, halfHeight: 0.75, lift: 1.75, hp: 24, speed: 0.85, locomotion: 'walk', damage: 24, windup: 1.4, cooldown: 2.4, reach: 3.1, size: 'large', threat: 4, height: 3, armour: 0.25, mass: 6, drops: [d(['haldenScrap', 'goldOre'], 2, 3, 1), d(['gem', 'echoShard'], 2, 3, 1)], mote: 0xffd27a, voice: V.rock }),
  rustMite: m({ archetype: 'swarmer', brain: 'pack', biome: 'haldenMines', radius: 0.26, lift: 0.18, hp: 4, speed: 4.2, locomotion: 'walk', damage: 8, windup: 0.42, cooldown: 1.7, reach: 1.1, size: 'tiny', threat: 2, scale: [0.85, 1.2], drops: [d(['haldenScrap', 'chitin'], 1, 1, 0.35)], mote: 0xd8783a }),
  fuseBeetle: m({ archetype: 'exploder', brain: 'fuse', biome: 'haldenMines', radius: 0.4, lift: 0.3, hp: 6, speed: 3.4, locomotion: 'walk', damage: 26, windup: 1.0, cooldown: 1, reach: 2.2, size: 'small', threat: 3, element: 'fire', blast: 2.8, drops: [d(['blackOil', 'coal'], 1, 2, 0.7)], mote: 0xff9a3a, voice: V.fuse }),
  cartMimic: m({ archetype: 'ambusher', brain: 'mimic', biome: 'haldenMines', radius: 0.62, halfHeight: 0.05, lift: 0.55, hp: 22, speed: 1.4, locomotion: 'still', damage: 24, windup: 0.75, cooldown: 2.6, reach: 2.1, size: 'medium', threat: 3, height: 2, armour: 0.3, mass: 5, drops: [d(['silverOre', 'goldOre'], 2, 3, 1), d(['haldenScrap'], 1, 2, 0.8)], mote: 0xffb04a, voice: V.shell }),
  // ---------------------------------------------------------------- IV Frost Caverns
  icefang: m({ archetype: 'charger', brain: 'charge', biome: 'frostCaverns', radius: 0.6, halfHeight: 0.1, lift: 0.62, hp: 18, speed: 2.8, locomotion: 'walk', damage: 22, windup: 0.8, cooldown: 3.2, reach: 1.4, size: 'medium', threat: 3, height: 2, element: 'frost', mass: 2.5, rush: 11, drops: [d(['frostFur', 'fang'], 1, 2, 0.9)], mote: 0xbfeaff, voice: V.beast }),
  frostBat: m({ archetype: 'flyer', brain: 'dive', biome: 'frostCaverns', radius: 0.38, lift: 2.4, hp: 10, speed: 4.4, locomotion: 'fly', damage: 16, windup: 0.7, cooldown: 3.1, reach: 1.15, size: 'small', threat: 3, element: 'frost', rush: 11.5, drops: [d(['frostFur', 'frostCrystal'], 1, 1, 0.55)], mote: 0xa8dcff, voice: V.bat }),
  shiverDrip: m({ archetype: 'ambusher', brain: 'drop', biome: 'frostCaverns', radius: 0.5, lift: 0.24, hp: 14, speed: 2.3, locomotion: 'crawl', damage: 24, windup: 0.6, cooldown: 3, reach: 1.5, size: 'medium', threat: 3, element: 'frost', blast: 1.8, drops: [d(['frostCrystal', 'gel'], 1, 2, 0.7)], mote: 0xd8f4ff, voice: V.drip }),
  rimeHulk: m({ archetype: 'brute', brain: 'slam', biome: 'frostCaverns', radius: 1.0, halfHeight: 0.6, lift: 1.4, hp: 46, speed: 1.2, locomotion: 'walk', damage: 30, windup: 1.25, cooldown: 2.7, reach: 2.8, size: 'large', threat: 4, height: 3, element: 'frost', armour: 0.35, mass: 6, blast: 2.8, shot: { speed: 11, damage: 20, radius: 0.32, count: 1, spread: 0, element: 'frost', color: 0xbfeaff, gravity: 8, splash: 1.6 }, drops: [d(['frostCrystal'], 2, 3, 1), d(['rimeIron'], 1, 2, 0.7)], mote: 0xbfeaff, voice: V.rock }),
  // ---------------------------------------------------------------- IV Glowroot Jungle
  glowMantis: m({ archetype: 'charger', brain: 'charge', biome: 'glowrootJungle', radius: 0.55, halfHeight: 0.35, lift: 0.95, hp: 20, speed: 3.0, locomotion: 'walk', damage: 24, windup: 0.7, cooldown: 3, reach: 1.6, size: 'medium', threat: 4, height: 2, mass: 2, rush: 12, drops: [d(['chitin', 'glowvine'], 1, 2, 0.9)], mote: 0x8cff6a, voice: V.bug }),
  bloatToad: m({ archetype: 'spitter', brain: 'spit', biome: 'glowrootJungle', radius: 0.6, halfHeight: 0.1, lift: 0.55, hp: 18, speed: 1.5, locomotion: 'walk', damage: 18, windup: 0.8, cooldown: 2.8, reach: 12, size: 'medium', threat: 3, height: 2, element: 'acid', shot: { speed: 9, damage: 18, radius: 0.3, count: 1, spread: 0, element: 'acid', color: 0xb6ff4a, gravity: 7, splash: 1.6 }, drops: [d(['venomSac'], 1, 1, 0.6), d(['sapAmber'], 1, 1, 0.5)], mote: 0xa8ff60, voice: V.spit }),
  snapjaw: m({ archetype: 'ambusher', brain: 'mimic', biome: 'glowrootJungle', radius: 0.7, halfHeight: 0.1, lift: 0.6, hp: 24, speed: 1.4, locomotion: 'still', damage: 28, windup: 0.7, cooldown: 2.6, reach: 2.2, size: 'medium', threat: 4, height: 2, armour: 0.3, mass: 5, drops: [d(['glowvine', 'verdite'], 1, 2, 1), d(['sapAmber'], 1, 1, 0.6)], mote: 0xff5aa8, voice: V.shell }),
  glowAnt: m({ archetype: 'swarmer', brain: 'pack', biome: 'glowrootJungle', radius: 0.26, lift: 0.17, hp: 7, speed: 4.4, locomotion: 'walk', damage: 10, windup: 0.42, cooldown: 1.7, reach: 1.1, size: 'tiny', threat: 3, element: 'acid', scale: [0.85, 1.2], drops: [d(['glowvine'], 1, 1, 0.4), d(['chitin'], 1, 1, 0.35)], mote: 0x9aff6a }),
  // ---------------------------------------------------------------- V Sulphur Bog
  gasbag: m({ archetype: 'exploder', brain: 'fuse', biome: 'sulphurBog', radius: 0.55, halfHeight: 0.1, lift: 1.6, hp: 10, speed: 2.2, locomotion: 'fly', damage: 30, windup: 1.1, cooldown: 1, reach: 2.4, size: 'medium', threat: 4, element: 'acid', blast: 3.2, drops: [d(['sulphur', 'gel'], 1, 2, 0.7)], mote: 0xe8ff5a, voice: V.fuse }),
  sulphurSpitter: m({ archetype: 'spitter', brain: 'spit', biome: 'sulphurBog', radius: 0.48, halfHeight: 0.3, lift: 0.8, hp: 22, speed: 1.9, locomotion: 'walk', damage: 20, windup: 0.7, cooldown: 2.4, reach: 13, size: 'medium', threat: 4, height: 2, element: 'acid', shot: { speed: 12, damage: 20, radius: 0.24, count: 2, spread: 0.12, element: 'acid', color: 0xe0ff3a, gravity: 2, splash: 0.8 }, drops: [d(['venomSac'], 1, 1, 0.8), d(['sulphur'], 1, 1, 0.4)], mote: 0xd8ff40, voice: V.spit }),
  mireLurker: m({ archetype: 'burrower', brain: 'dig', biome: 'sulphurBog', radius: 0.7, halfHeight: 0.15, lift: 0.5, hp: 28, speed: 5, locomotion: 'walk', damage: 30, windup: 0.9, cooldown: 3.2, reach: 2, size: 'large', threat: 4, height: 2, element: 'acid', mass: 3, blast: 2.1, drops: [d(['hide'], 1, 2, 1), d(['venomSac'], 1, 1, 0.6), d(['mireOpal'], 1, 1, 0.2)], mote: 0xb8c050, voice: V.dig }),
  fumeWasp: m({ archetype: 'flyer', brain: 'dive', biome: 'sulphurBog', radius: 0.38, lift: 2.2, hp: 14, speed: 4.6, locomotion: 'fly', damage: 22, windup: 0.65, cooldown: 3, reach: 1.15, size: 'small', threat: 4, element: 'acid', rush: 12, drops: [d(['venomSac'], 1, 1, 0.6), d(['chitin'], 1, 1, 0.4)], mote: 0xe0ff3a, voice: { tele: 'mob.screech', hit: 'mob.hit.flesh', die: 'mob.die.monster', idle: 'mob.buzz' } }),
  // ---------------------------------------------------------------- V Sunken City
  gildedScarab: m({ archetype: 'swarmer', brain: 'pack', biome: 'sunkenCity', radius: 0.3, lift: 0.2, hp: 8, speed: 4.4, locomotion: 'walk', damage: 12, windup: 0.4, cooldown: 1.6, reach: 1.15, size: 'tiny', threat: 3, drops: [d(['runegold', 'chitin'], 1, 1, 0.4)], mote: 0xffd24a }),
  runeSentry: m({ archetype: 'spitter', brain: 'spit', biome: 'sunkenCity', radius: 0.55, halfHeight: 0.55, lift: 1.25, hp: 26, speed: 1.2, locomotion: 'walk', damage: 22, windup: 0.85, cooldown: 2.8, reach: 14, size: 'medium', threat: 4, height: 3, element: 'shock', armour: 0.6, mass: 5, shot: { speed: 14, damage: 14, radius: 0.22, count: 3, spread: 0.22, element: 'shock', color: 0xffd76a, gravity: 0, splash: 0 }, drops: [d(['runegold'], 1, 2, 1), d(['orichalcum'], 1, 1, 0.3)], mote: 0xffe08a, voice: V.rock }),
  chestMimic: m({ archetype: 'ambusher', brain: 'mimic', biome: 'sunkenCity', radius: 0.6, halfHeight: 0.05, lift: 0.5, hp: 30, speed: 1.4, locomotion: 'still', damage: 32, windup: 0.7, cooldown: 2.4, reach: 2.2, size: 'medium', threat: 4, height: 2, armour: 0.3, mass: 5, drops: [d(['runegold', 'goldOre'], 2, 4, 1), d(['orichalcum', 'gem'], 1, 2, 1)], mote: 0xffc24a, voice: V.shell }),
  drownedKnight: m({ archetype: 'brute', brain: 'slam', biome: 'sunkenCity', radius: 0.8, halfHeight: 0.75, lift: 1.55, hp: 52, speed: 1.3, locomotion: 'walk', damage: 34, windup: 1.15, cooldown: 2.6, reach: 2.6, size: 'large', threat: 5, height: 3, armour: 0.35, mass: 6, blast: 2.6, drops: [d(['runegold'], 1, 2, 1), d(['orichalcum'], 1, 1, 0.4)], mote: 0xffd76a, voice: V.rock }),
  // ---------------------------------------------------------------- VI Magma Veins
  cinderHound: m({ archetype: 'charger', brain: 'charge', biome: 'magmaVeins', radius: 0.6, halfHeight: 0.1, lift: 0.66, hp: 30, speed: 3.1, locomotion: 'walk', damage: 30, windup: 0.75, cooldown: 3, reach: 1.5, size: 'medium', threat: 4, height: 2, element: 'fire', mass: 2.5, rush: 12.5, drops: [d(['emberCore', 'fang'], 1, 2, 0.9)], mote: 0xff6a2a, voice: V.beast }),
  emberMite: m({ archetype: 'swarmer', brain: 'cling', biome: 'magmaVeins', radius: 0.32, lift: 0.16, hp: 10, speed: 3.8, locomotion: 'crawl', damage: 14, windup: 0.45, cooldown: 2.2, reach: 1.25, size: 'small', threat: 4, element: 'fire', drops: [d(['emberite', 'chitin'], 1, 1, 0.4)], mote: 0xff8a3a }),
  magmaBrute: m({ archetype: 'brute', brain: 'slam', biome: 'magmaVeins', radius: 1.1, halfHeight: 0.7, lift: 1.55, hp: 70, speed: 1.2, locomotion: 'walk', damage: 40, windup: 1.25, cooldown: 2.6, reach: 3, size: 'huge', threat: 5, height: 3, element: 'fire', armour: 0.35, mass: 6, blast: 3.1, shot: { speed: 11, damage: 24, radius: 0.35, count: 1, spread: 0, element: 'fire', color: 0xff7a2a, gravity: 8, splash: 1.8 }, drops: [d(['emberCore', 'magmaCore'], 1, 2, 1), d(['emberite'], 2, 3, 1)], mote: 0xff5a1a, voice: V.rock }),
  lavaToad: m({ archetype: 'spitter', brain: 'spit', biome: 'magmaVeins', radius: 0.62, halfHeight: 0.1, lift: 0.55, hp: 30, speed: 1.5, locomotion: 'walk', damage: 26, windup: 0.8, cooldown: 2.7, reach: 12, size: 'medium', threat: 4, height: 2, element: 'fire', shot: { speed: 9, damage: 26, radius: 0.32, count: 1, spread: 0, element: 'fire', color: 0xff7a2a, gravity: 7, splash: 1.6 }, drops: [d(['emberCore'], 1, 1, 0.6), d(['emberite'], 1, 2, 0.7)], mote: 0xff6a2a, voice: V.spit }),
  // ---------------------------------------------------------------- VI Obsidian Abyss
  stalker: m({ archetype: 'ambusher', brain: 'lurk', biome: 'obsidianAbyss', radius: 0.42, halfHeight: 1.05, lift: 1.5, hp: 34, speed: 1.35, locomotion: 'walk', damage: 34, windup: 1.1, cooldown: 4, reach: 2.2, size: 'large', threat: 5, height: 2, element: 'void', drops: [d(['voidEssence'], 1, 2, 1), d(['voidshard'], 1, 1, 0.4)], mote: 0xcfe9ff, voice: { tele: 'mob.shriek', hit: 'mob.hit.flesh', die: 'mob.die.monster', idle: 'mob.drone' } }),
  voidEye: m({ archetype: 'spitter', brain: 'spit', biome: 'obsidianAbyss', radius: 0.55, halfHeight: 0.1, lift: 2.0, hp: 30, speed: 1.6, locomotion: 'fly', damage: 26, windup: 0.8, cooldown: 2.6, reach: 14, size: 'medium', threat: 5, element: 'void', shot: { speed: 12, damage: 26, radius: 0.26, count: 1, spread: 0, element: 'void', color: 0xa070ff, gravity: 0, splash: 0 }, drops: [d(['voidEssence'], 1, 1, 0.8), d(['voidshard'], 1, 1, 0.3)], mote: 0xa070ff, voice: V.smoke }),
  glassWraith: m({ archetype: 'flyer', brain: 'dive', biome: 'obsidianAbyss', radius: 0.5, halfHeight: 0.4, lift: 2.2, hp: 28, speed: 4.6, locomotion: 'fly', damage: 30, windup: 0.65, cooldown: 3, reach: 1.25, size: 'medium', threat: 5, element: 'void', rush: 12.5, drops: [d(['voidshard', 'voidEssence'], 1, 2, 0.8)], mote: 0xd8c8ff, voice: V.bat }),
  nullCrawler: m({ archetype: 'swarmer', brain: 'cling', biome: 'obsidianAbyss', radius: 0.4, lift: 0.2, hp: 14, speed: 3.6, locomotion: 'crawl', damage: 18, windup: 0.5, cooldown: 2.4, reach: 1.3, size: 'small', threat: 5, element: 'void', scale: [0.8, 1.25], drops: [d(['voidEssence'], 1, 1, 0.4), d(['voidshard'], 1, 1, 0.2)], mote: 0xa070ff }),
  worm: m({ archetype: 'vista', brain: 'vista', biome: 'obsidianAbyss', radius: 2.2, lift: 0, hp: 1, speed: 6.5, locomotion: 'path', damage: 0, windup: 0, cooldown: 1, reach: 0, size: 'huge', threat: 0, mass: 99, mote: 0x9a8070, voice: { tele: 'mob.groan', hit: 'mob.hit.flesh', die: 'mob.die.monster', idle: 'mob.groan' } }),
};

const BEINGS: Record<BeingKind, Base> = {
  moth: m({ archetype: 'flutter', brain: 'moth', biome: 'mushroomForest', radius: 0.08, lift: 1.4, hp: 1, speed: 2.4, locomotion: 'fly', damage: 0, windup: 0, cooldown: 1, reach: 0, size: 'tiny', threat: 0, scale: [0.75, 1.25], mote: 0xffd36a, voice: V.being }),
  lampling: m({ archetype: 'follower', brain: 'lamp', biome: 'haldenMines', radius: 0.22, halfHeight: 0.04, lift: 1.5, hp: 1, speed: 3.6, locomotion: 'fly', damage: 0, windup: 0, cooldown: 1, reach: 0, rarity: 'rare', size: 'tiny', threat: 0, scale: [0.88, 1.12], mote: 0xffb04a, voice: { tele: 'mob.chime', hit: 'mob.hit.flesh', die: 'mob.chime' } }),
  glimmerkin: m({ archetype: 'skitter', brain: 'skitter', biome: 'amberHollows', radius: 0.3, lift: 0.26, hp: 1, speed: 2.7, locomotion: 'walk', damage: 0, windup: 0, cooldown: 1, reach: 0, rarity: 'epic', size: 'small', threat: 0, scale: [0.88, 1.12], drops: [d(['amber', 'gem'], 1, 2, 1)], mote: 0xc29cff, voice: V.being }),
  shellback: m({ archetype: 'grazer', brain: 'graze', biome: 'crystalGeode', radius: 0.85, halfHeight: 0.1, lift: 0.62, hp: 1, speed: 0.35, locomotion: 'walk', damage: 0, windup: 0, cooldown: 1, reach: 0, rarity: 'rare', size: 'large', threat: 0, height: 2, drops: [d(['glimmerShard', 'echoShard'], 2, 3, 1)], mote: 0x7ad8ff, voice: V.being }),
  jelly: m({ archetype: 'floater', brain: 'float', biome: 'floodedGrottoes', radius: 0.6, halfHeight: 0.35, lift: 2.6, hp: 1, speed: 0.6, locomotion: 'fly', damage: 0, windup: 0, cooldown: 1, reach: 0, rarity: 'uncommon', size: 'medium', threat: 0, mote: 0x7ad8ff, voice: V.being }),
  burrower: m({ archetype: 'thief', brain: 'thief', biome: 'rootGalleries', radius: 0.3, lift: 0.27, hp: 1, speed: 3.2, locomotion: 'walk', damage: 0, windup: 0, cooldown: 1, reach: 0, rarity: 'uncommon', size: 'small', threat: 0, scale: [0.88, 1.12], drops: [d(['ironOre', 'copperOre'], 2, 3, 1), d(['silverOre', 'gem'], 1, 1, 0.3)], mote: 0xffd36a, voice: { tele: 'mob.squeak', hit: 'mob.hit.flesh', die: 'mob.squeak' } }),
  hearthmite: m({ archetype: 'follower', brain: 'lamp', biome: 'frostCaverns', radius: 0.24, lift: 1.45, hp: 1, speed: 3.4, locomotion: 'fly', damage: 0, windup: 0, cooldown: 1, reach: 0, rarity: 'rare', size: 'tiny', threat: 0, scale: [0.9, 1.1], mote: 0xff9a4a, voice: { tele: 'mob.chime', hit: 'mob.hit.flesh', die: 'mob.chime' } }),
  vinebell: m({ archetype: 'grazer', brain: 'graze', biome: 'glowrootJungle', radius: 0.55, halfHeight: 0.3, lift: 0.9, hp: 1, speed: 0.25, locomotion: 'walk', damage: 0, windup: 0, cooldown: 1, reach: 0, rarity: 'rare', size: 'medium', threat: 0, height: 2, drops: [d(['sapAmber', 'glowvine'], 1, 2, 1)], mote: 0x9aff7a, voice: V.being }),
  mudpup: m({ archetype: 'skitter', brain: 'skitter', biome: 'sulphurBog', radius: 0.32, lift: 0.28, hp: 1, speed: 2.9, locomotion: 'walk', damage: 0, windup: 0, cooldown: 1, reach: 0, rarity: 'epic', size: 'small', threat: 0, drops: [d(['sulphur', 'mireOpal'], 1, 2, 1), d(['mireOpal'], 1, 1, 0.3)], mote: 0xd8e070, voice: V.being }),
  relicTurtle: m({ archetype: 'grazer', brain: 'graze', biome: 'sunkenCity', radius: 0.8, halfHeight: 0.1, lift: 0.55, hp: 1, speed: 0.3, locomotion: 'walk', damage: 0, windup: 0, cooldown: 1, reach: 0, rarity: 'epic', size: 'large', threat: 0, height: 2, drops: [d(['runegold', 'orichalcum'], 1, 2, 1)], mote: 0xffd24a, voice: V.being }),
  salamander: m({ archetype: 'thief', brain: 'thief', biome: 'magmaVeins', radius: 0.32, lift: 0.24, hp: 1, speed: 3.6, locomotion: 'walk', damage: 0, windup: 0, cooldown: 1, reach: 0, rarity: 'epic', size: 'small', threat: 0, drops: [d(['magmaCore', 'emberite'], 1, 2, 1)], mote: 0xff7a3a, voice: { tele: 'mob.squeak', hit: 'mob.hit.flesh', die: 'mob.squeak' } }),
  starmote: m({ archetype: 'follower', brain: 'lamp', biome: 'obsidianAbyss', radius: 0.22, lift: 1.6, hp: 1, speed: 3.8, locomotion: 'fly', damage: 0, windup: 0, cooldown: 1, reach: 0, rarity: 'legendary', size: 'tiny', threat: 0, mote: 0xd8c8ff, voice: { tele: 'mob.chime', hit: 'mob.hit.flesh', die: 'mob.chime' } }),
};

/** A guardian's or the boss's attack patterns (every one telegraphed; MobSim's guardian brain runs them). */
export type GuardianPattern =
  /** Raise and slam: a marked circle round it. */
  | 'slam'
  /** A shockwave ring that rolls outward (jump or dash through it). */
  | 'ring'
  /** A fan of slow orbs at the explorer. */
  | 'volley'
  /** Lock a line on the ground, then rush along it (stunned by a wall). */
  | 'charge'
  /** Call its brood (the biome's swarmers / exploders). */
  | 'summon'
  /** Sink, travel (a rumble), burst up under a marked circle. */
  | 'burrow'
  /** Rise, mark the explorer's spot, dive on it (fliers). */
  | 'dive'
  /** A line of eruptions toward the explorer (roots, runes, thorns). */
  | 'line'
  /** Snuff the light round it for a while, adds come in the dark. */
  | 'snuff';

export interface GuardianDef extends SpeciesDef {
  /** Patterns per phase (phase 1 first); `phases` = its length. */
  patterns: GuardianPattern[][];
  /** Its brood for 'summon'. */
  brood: MonsterKind[];
  /** The lair's fighting radius it keeps to (m) when the layout gives none. */
  arena: number;
  /** Hovering (fliers): height of its centre above the arena floor. */
  hover: number;
  /** Rooted where it grows (it turns to face the explorer but never walks). */
  rooted?: boolean;
}

type GBase = Omit<GuardianDef, 'kind' | 'family' | 'rank'>;

function g(b: Partial<GBase> & Pick<GBase, 'biome' | 'radius' | 'hp' | 'speed' | 'damage' | 'patterns' | 'brood'>): GBase {
  return {
    archetype: 'guardian',
    brain: 'guardian',
    halfHeight: 0.6,
    lift: b.radius,
    locomotion: 'walk',
    windup: 1.1,
    cooldown: 1.2,
    reach: 3,
    size: 'huge',
    threat: 5,
    element: 'none',
    height: 3,
    scale: [1, 1],
    armour: 0.55,
    mass: 99,
    drops: [],
    mote: 0xffd27a,
    voice: V.boss,
    arena: 22,
    hover: 0,
    ...b,
  };
}

const GUARDIANS: Record<GuardianKind, GBase> = {
  amberMatriarch: g({ biome: 'amberHollows', radius: 1.3, halfHeight: 0.3, lift: 0.95, hp: 90, speed: 2.4, damage: 14, element: 'none', patterns: [['charge', 'volley', 'summon'], ['charge', 'volley', 'summon', 'slam']], brood: ['crawler', 'amberTick'], rush: 9, blast: 3, shot: { speed: 9, damage: 10, radius: 0.28, count: 3, spread: 0.32, element: 'none', color: 0xffa83a, gravity: 3, splash: 0 }, drops: [d(['amber', 'copperOre'], 4, 6, 1), d(['hide', 'chitin'], 2, 3, 1), d(['gem'], 1, 2, 1)], mote: 0xffb347 }),
  mycelord: g({ biome: 'mushroomForest', radius: 1.5, halfHeight: 1.0, lift: 2.1, hp: 100, speed: 1.0, damage: 14, element: 'spore', patterns: [['ring', 'volley', 'summon'], ['ring', 'volley', 'summon', 'slam']], brood: ['sporeling'], blast: 3.2, shot: { speed: 8.5, damage: 10, radius: 0.3, count: 5, spread: 0.45, element: 'spore', color: 0x6df0d8, gravity: 2, splash: 0 }, drops: [d(['sporeQuartz', 'glowcap'], 4, 6, 1), d(['fungalWood'], 3, 4, 1), d(['gel'], 2, 3, 1)], mote: 0xd06cff }),
  elderTaproot: g({ biome: 'rootGalleries', radius: 1.4, halfHeight: 0.8, lift: 1.6, hp: 160, speed: 1.6, damage: 20, patterns: [['burrow', 'line', 'summon'], ['burrow', 'line', 'summon', 'ring']], brood: ['tunnelGrub', 'rootLasher'], blast: 2.8, drops: [d(['heartwood', 'rootFibre'], 4, 6, 1), d(['ironOre'], 3, 5, 1)], mote: 0xc8d26a }),
  tideWarden: g({ biome: 'floodedGrottoes', radius: 1.6, halfHeight: 0.4, lift: 1.2, hp: 170, speed: 1.7, damage: 22, element: 'frost', patterns: [['charge', 'volley', 'slam'], ['charge', 'volley', 'slam', 'summon']], brood: ['brineLeech'], rush: 10, blast: 3.2, armour: 0.4, shot: { speed: 12, damage: 14, radius: 0.26, count: 4, spread: 0.36, element: 'frost', color: 0x7fd0ff, gravity: 1, splash: 0 }, drops: [d(['pearl'], 4, 6, 1), d(['gel', 'chitin'], 3, 4, 1)], mote: 0x6ec8ff }),
  quartzTitan: g({ biome: 'crystalGeode', radius: 1.6, halfHeight: 1.0, lift: 2.2, hp: 240, speed: 1.2, damage: 28, element: 'shock', patterns: [['volley', 'slam', 'summon'], ['volley', 'slam', 'summon', 'ring']], brood: ['shardling'], blast: 3.4, shot: { speed: 11, damage: 13, radius: 0.26, count: 5, spread: 0.6, element: 'shock', color: 0x52e8f5, gravity: 0, splash: 0 }, drops: [d(['gem', 'glimmerShard'], 4, 6, 1), d(['echoShard'], 3, 4, 1)], mote: 0x8fe8ff }),
  foremanEngine: g({ biome: 'haldenMines', radius: 1.5, halfHeight: 0.9, lift: 1.9, hp: 230, speed: 1.6, damage: 28, element: 'fire', patterns: [['charge', 'ring', 'summon'], ['charge', 'ring', 'summon', 'volley']], brood: ['rustMite', 'fuseBeetle'], rush: 10.5, blast: 3, shot: { speed: 13, damage: 13, radius: 0.22, count: 5, spread: 0.4, element: 'fire', color: 0xffb04a, gravity: 1, splash: 0 }, drops: [d(['haldenScrap', 'goldOre'], 5, 7, 1), d(['blackOil'], 2, 3, 1)], mote: 0xffd27a }),
  rimeWyrm: g({ biome: 'frostCaverns', radius: 1.5, halfHeight: 0.4, lift: 1.2, hp: 360, speed: 3.2, damage: 30, element: 'frost', locomotion: 'fly', hover: 4, patterns: [['dive', 'volley', 'ring'], ['dive', 'volley', 'ring', 'summon']], brood: ['frostBat'], rush: 13, blast: 3, shot: { speed: 12, damage: 15, radius: 0.28, count: 5, spread: 0.5, element: 'frost', color: 0xbfeaff, gravity: 4, splash: 0.8 }, drops: [d(['frostCrystal', 'rimeIron'], 4, 6, 1), d(['frostFur'], 2, 4, 1)], mote: 0xbfeaff }),
  thornmother: g({ rooted: true, biome: 'glowrootJungle', radius: 1.6, halfHeight: 1.1, lift: 2.3, hp: 300, speed: 1.3, damage: 30, element: 'acid', patterns: [['volley', 'summon', 'line'], ['volley', 'summon', 'line', 'ring']], brood: ['glowMantis'], blast: 3, shot: { speed: 10, damage: 12, radius: 0.28, count: 4, spread: 0.55, element: 'acid', color: 0xb6ff4a, gravity: 3, splash: 0.6 }, drops: [d(['verdite', 'glowvine'], 4, 6, 1), d(['sapAmber'], 2, 4, 1)], mote: 0x8cff6a }),
  miasmaKing: g({ biome: 'sulphurBog', radius: 1.8, halfHeight: 0.6, lift: 1.6, hp: 400, speed: 1.4, damage: 34, element: 'acid', patterns: [['ring', 'volley', 'burrow'], ['ring', 'volley', 'burrow', 'summon']], brood: ['gasbag'], blast: 3.4, shot: { speed: 11, damage: 13, radius: 0.3, count: 5, spread: 0.5, element: 'acid', color: 0xe0ff3a, gravity: 5, splash: 0.8 }, drops: [d(['mireOpal', 'sulphur'], 4, 6, 1), d(['venomSac'], 3, 5, 1)], mote: 0xe8ff5a }),
  gildedColossus: g({ biome: 'sunkenCity', radius: 1.7, halfHeight: 1.2, lift: 2.5, hp: 440, speed: 1.1, damage: 36, element: 'shock', patterns: [['line', 'slam', 'summon'], ['line', 'slam', 'summon', 'volley']], brood: ['gildedScarab'], blast: 3.6, armour: 0.45, shot: { speed: 14, damage: 15, radius: 0.24, count: 5, spread: 0.45, element: 'shock', color: 0xffd76a, gravity: 0, splash: 0 }, drops: [d(['orichalcum', 'runegold'], 5, 7, 1), d(['goldOre'], 3, 5, 1)], mote: 0xffe08a }),
  magmaBehemoth: g({ biome: 'magmaVeins', radius: 1.9, halfHeight: 1.0, lift: 2.3, hp: 560, speed: 1.4, damage: 40, element: 'fire', patterns: [['slam', 'volley', 'charge'], ['slam', 'volley', 'charge', 'ring', 'summon']], brood: ['emberMite'], rush: 11, blast: 3.8, shot: { speed: 11, damage: 18, radius: 0.34, count: 5, spread: 0.5, element: 'fire', color: 0xff7a2a, gravity: 7, splash: 1.2 }, drops: [d(['magmaCore', 'emberCore'], 4, 6, 1), d(['emberite'], 4, 6, 1)], mote: 0xff5a1a }),
  voidHerald: g({ biome: 'obsidianAbyss', radius: 1.5, halfHeight: 0.8, lift: 1.6, hp: 640, speed: 3.4, damage: 40, element: 'void', locomotion: 'fly', hover: 3.5, patterns: [['dive', 'volley', 'snuff'], ['dive', 'volley', 'snuff', 'ring']], brood: ['glassWraith'], rush: 14, blast: 3.2, shot: { speed: 12, damage: 18, radius: 0.28, count: 5, spread: 0.55, element: 'void', color: 0xa070ff, gravity: 0, splash: 0 }, drops: [d(['voidshard', 'voidEssence'], 4, 6, 1), d(['starsteel'], 2, 3, 1)], mote: 0xa070ff }),
  // The Heart keeps its chamber (brain 'heart': it hovers over the centre, beats, rings twice).
  heartOfDark: g({ brain: 'heart', archetype: 'boss', biome: 'heart', radius: 2.4, halfHeight: 0.6, lift: 2.4, hp: 720, speed: 1.6, damage: 38, element: 'void', locomotion: 'fly', hover: 4.5, arena: 26, patterns: [['volley', 'ring'], ['volley', 'ring', 'summon', 'line', 'snuff'], ['volley', 'ring', 'summon', 'line', 'dive']], brood: ['glassWraith', 'emberMite'], rush: 12, blast: 4, armour: 0.5, shot: { speed: 11, damage: 17, radius: 0.32, count: 6, spread: 0.8, element: 'void', color: 0xff6aa0, gravity: 0, splash: 0 }, drops: [d(['voidshard', 'magmaCore'], 6, 8, 1), d(['orichalcum', 'gem'], 4, 6, 1)], mote: 0xff8ab0 }),
};

function finish<K extends MobKind>(kind: K, family: MobFamily, rank: MobRank, b: Base): SpeciesDef {
  return { ...b, kind, family, rank };
}

export const SPECIES: Record<MobKind, SpeciesDef> = {} as Record<MobKind, SpeciesDef>;
for (const [k, b] of Object.entries(MONSTERS)) SPECIES[k as MobKind] = finish(k as MobKind, 'monster', 'minion', b);
for (const [k, b] of Object.entries(BEINGS)) SPECIES[k as MobKind] = finish(k as MobKind, 'being', 'minion', b);
for (const [k, b] of Object.entries(GUARDIANS)) SPECIES[k as MobKind] = finish(k as MobKind, 'monster', k === 'heartOfDark' ? 'boss' : 'guardian', b);

export const GUARDIAN_DEFS = SPECIES as unknown as Record<GuardianKind, GuardianDef>;

export const MONSTER_KINDS = Object.keys(MONSTERS) as MonsterKind[];
export const BEING_KINDS = Object.keys(BEINGS) as BeingKind[];
export const GUARDIAN_KINDS = Object.keys(GUARDIANS) as GuardianKind[];
export const ALL_KINDS = [...MONSTER_KINDS, ...BEING_KINDS, ...GUARDIAN_KINDS] as MobKind[];

export function species(kind: MobKind): SpeciesDef {
  return SPECIES[kind];
}

export function isGuardian(kind: MobKind): kind is GuardianKind {
  return kind in GUARDIANS;
}

export function guardianDef(kind: GuardianKind): GuardianDef {
  return SPECIES[kind] as GuardianDef;
}
