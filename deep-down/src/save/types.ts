import type { QualityLevel } from '../render/Renderer';

/** Player settings, persisted separately from game progress (key `deepdown.settings`; SPEC §9.4, §12.3). */
export interface Settings {
  quality: QualityLevel;
  /** Pick the quality preset from the frame governor (Settings → Quality → Auto). */
  autoQuality: boolean;
  /** Internal resolution multiplier override (null = preset default). */
  renderScale: number | null;
  bloom: boolean;
  /** Overall image brightness (exposure multiplier) for dark screens and bright rooms. */
  brightness: number; // 0.7 .. 1.5
  showFps: boolean;
  /** Mirrors the skill row and the Depth Ruler. */
  leftHanded: boolean;
  /** Haptics master switch (kept for the shell; `hapticStrength` 'off' also silences). */
  vibration: boolean;
  /** Haptic strength (SPEC §10.11): Off / Light / Normal / Strong. */
  hapticStrength: 'off' | 'light' | 'normal' | 'strong';
  masterVolume: number; // 0 .. 1
  musicVolume: number;
  sfxVolume: number;
  ambienceVolume: number;
  cameraShake: number; // 0 .. 1
  textSize: 'normal' | 'large';
  highContrast: boolean;
  /** Motion levels (SPEC §10.13): Full, Reduced (no camera motion), Off (no flights). */
  motion: 'full' | 'reduced' | 'off';
  /** Full-screen flashes: On, Soft (half), Off. */
  flashes: 'on' | 'soft' | 'off';
  /** Number format (SPEC §5.1). */
  notation: 'letters' | 'scientific' | 'engineering';
  /** The 45-minute break reminder (H12). */
  breakReminder: boolean;
  /** Auto-pick facets once unlocked (250 Embers). */
  autoFacets: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  quality: 'balanced',
  autoQuality: true,
  renderScale: null,
  bloom: true,
  brightness: 1,
  showFps: false,
  leftHanded: false,
  vibration: true,
  hapticStrength: 'normal',
  masterVolume: 0.8,
  musicVolume: 0.55,
  sfxVolume: 0.9,
  ambienceVolume: 0.7,
  cameraShake: 1,
  textSize: 'normal',
  highContrast: false,
  motion: 'full',
  flashes: 'on',
  notation: 'letters',
  breakReminder: true,
  autoFacets: false,
};

/** A Big as saved: [mantissa, exponent]. */
export type BigJSON = [number, number];

/** One shaft row as saved: cell kinds (u8) and remaining fractions. */
export interface RowSave {
  kinds: number[];
  left: number[];
}

/** Save v3 (SPEC §12.3). Every field has a default filled by normalizeSave. */
export interface SaveV3 {
  version: 3;
  savedAt: number;
  monotonicMs: number;
  playTime: number;
  seed: number;
  runIndex: number;
  run: {
    depth: number;
    /** The floor row and the rows below it (the live window), each with kinds and remaining fractions. */
    rows: RowSave[];
    gold: BigJSON;
    goldEarned: BigJSON;
    pick: number;
    ups: Record<string, number>;
    lines: number[];
    gear: string[];
    /** Cooldown and effect seconds remaining (model time is not saved). */
    skills: Record<string, { lvl: number; cd: number; active: number; charges: number }>;
    facets: string[];
    pendingHands: number;
    freeReroll: boolean;
    surge: number;
    runTime: number;
    dmaxRun: number;
    rack: number[];
    ghost: number[];
    chests: Array<{ id: string; col: number; depth: number; floor: number }>;
    harvested: Record<string, number[]>;
    breach: null | { id: string; tier: number };
    /** A seal fight in progress: biome, remaining fraction, its HP. */
    seal: null | { biome: number; left: number; hp: BigJSON };
    plantedBonus: number;
    frenzyLeft: number;
    /** W2: Cataclysm and the run boosts (seconds left), and the run's counters. */
    cataclysmLeft: number;
    boosts: Record<string, { left: number; mult: number }>;
    used: string[];
    lanterns: number[];
    sealsBroken: number;
    splits: Record<string, number>;
    par: number[];
    ghostPassed: number;
    counters: { taps: number; cells: number; rows: number; chests: number; stars: number };
  };
  meta: {
    embers: BigJSON;
    embersMax: BigJSON;
    threads: BigJSON;
    loom: Record<string, number>;
    sigils: Record<string, number>;
    record: number;
    cycleRecord: number;
    sealsOpened: number[];
    biomesSeen: number[];
    gems: number;
    timeCrystals: number;
    boostLeft: number;
    finds: Record<string, number>;
    bestiary: Record<string, number>; // a v3 field the purge drops in the v4 migration
    lore: string[];
    biomeSeals: number[];
    feats: Record<string, number>;
    secrets: string[];
    marks: number;
    rank: { r: number; xp: number };
    records: {
      deepest: number;
      splits: Record<string, number>;
      marks500: Record<string, number>;
      bestHit: BigJSON;
      bestCombo: number;
      bestTapCells: number;
      bestChest: number;
      bestOffline: BigJSON;
      bestEmbers: BigJSON;
    };
    planted: Array<{ depth: number; n: number }>;
    contracts: Array<{ tpl: string; target: number; progress: number; base: number; arg: string; grand: boolean }>;
    contractCount: number;
    daily: { lastDay: number; calendarDay: number; claimedToday: boolean };
    pity: { crystal: number; reliquary: number; lintel: number };
    tutorial: { step: number; done: boolean; breaks: number };
    path: { step: number };
    hints: Record<string, number>;
    firstTime: string[];
    revealed: string[];
    cosmetics: { owned: string[]; equipped: Record<string, string> };
    stats: Record<string, number>;
    lifetime: { gold: BigJSON; embersEver: BigJSON };
    toolForm: number;
    markMax: number;
    blueprints: number;
    bestTier: number;
    bestLines: number;
    /** Fastest run seconds to 600 m (−1: never). */
    swift600: number;
    caught: Record<string, number>;
    lastUsed: Record<string, number>;
    dailyReady: boolean;
    rerolls: number;
  };
  /** The Director (W2): its clock and deck memory; and the cells the model changed after generation. */
  director: { wait: number; history: string[]; since: Record<string, number>; dealt: number; codexQuiet: number };
  overrides: Array<{ depth: number; col: number; kind: number; floor: number }>;
  /** The pending return feast (null when none or collected). */
  offline: null | {
    seconds: number; away: number; capped: boolean; fromDepth: number; toDepth: number;
    goldRows: BigJSON; goldGallery: BigJSON; chests: number; chestsGold: number; sealBiome: number; biomeCrossed: number;
  };
  tap: { combo: number; rng: number };
}

/** A chamber of this run as saved (hybrid SPEC §10: harvested, skin, lamps-lit bits and feature state). */
export interface ChamberSave {
  node: number;
  by: '' | 'player' | 'crew';
  lit: boolean;
  /** Strike tappables struck: socket id → remaining fraction. */
  left: Record<string, number>;
  /** Focus objects resolved (opened, read, graded, racked). */
  resolved: string[];
  lamps: string[];
  /** Wall-skin cells struck: id → remaining fraction. */
  skin: Record<string, number>;
  secrets: string[];
  glints: string[];
}

/**
 * Save v4 (hybrid SPEC §10): the node crawl replaces the cutaway's floor model; the purge dropped the old fields. The world is a
 * pure function of the seeds (no voxel deltas). Bitsets are run-length encoded: [start, length, start, length, …].
 */
export interface SaveV4 {
  version: 4;
  savedAt: number;
  monotonicMs: number;
  playTime: number;
  /** The lifetime world seed (the chart's topology; also `meta.lifeSeed`). */
  seed: number;
  runIndex: number;
  run: {
    /** The player's node, phase, stand and walking pose (null = the stand's pose). */
    node: number;
    phase: 'camp' | 'dig' | 'explore' | 'ride' | 'seal';
    resume: 'camp' | 'dig' | 'explore' | 'ride' | 'seal';
    stand: number;
    pose: null | { x: number; y: number; z: number; yaw: number; pitch: number };
    /** The crew's dig front (the model's depth) and its live rows (kinds and remaining fractions, as v3). */
    digDepth: number;
    rows: RowSave[];
    /** The chambers of this run that are open (the player's and the dark ones ahead). */
    chambers: ChamberSave[];
    /** The Works: leftover HP and gold behind the player, and the haul not yet delivered. */
    works: { hp: BigJSON; gold: BigJSON; pending: BigJSON };
    /** Relics skipped to the Chest Rack (Find ids; chests are `rack`). */
    rackRelics: string[];
    gold: BigJSON;
    goldEarned: BigJSON;
    pick: number;
    ups: Record<string, number>;
    lines: number[];
    gear: string[];
    skills: Record<string, { lvl: number; cd: number; active: number; charges: number }>;
    facets: string[];
    pendingHands: number;
    freeReroll: boolean;
    surge: number;
    runTime: number;
    dmaxRun: number;
    rack: number[];
    ghost: number[];
    chests: Array<{ id: string; col: number; depth: number; floor: number }>;
    seal: null | { biome: number; left: number; hp: BigJSON };
    plantedBonus: number;
    /** The Ember Frenzy's seconds left (the Drifting Ember, W2). */
    frenzyLeft: number;
    cataclysmLeft: number;
    boosts: Record<string, { left: number; mult: number }>;
    used: string[];
    lanterns: number[];
    sealsBroken: number;
    splits: Record<string, number>;
    par: number[];
    ghostPassed: number;
    counters: { taps: number; cells: number; rows: number; chests: number; stars: number };
  };
  meta: {
    /** The lifetime world seed (= `seed`). */
    lifeSeed: number;
    /** Lifetime node bits, run-length encoded: first light ever done, every lamp relit once. */
    seen: number[];
    charted: number[];
    relicGrades: Record<string, number>;
    /** The v3 → v4 notice: 0 none, 1 waiting, 2 shown. */
    rechartNotice: number;
    nodeStats: { lamps: number; secrets: number; breaches: number; charted: number; glints: number; skins: number };
    /** Lessons learnt (the sequencer never repeats one) and the spacing clock (play s of the last new mechanic). */
    lessons: string[];
    lastMechanicAt: number;
    /** Digits of lifetime gold (the camp's stages; derived, kept for readers without the model). */
    fortune: number;
    embers: BigJSON;
    embersMax: BigJSON;
    threads: BigJSON;
    loom: Record<string, number>;
    sigils: Record<string, number>;
    record: number;
    cycleRecord: number;
    sealsOpened: number[];
    biomesSeen: number[];
    gems: number;
    timeCrystals: number;
    boostLeft: number;
    finds: Record<string, number>;
    lore: string[];
    biomeSeals: number[];
    feats: Record<string, number>;
    secrets: string[];
    marks: number;
    rank: { r: number; xp: number };
    records: {
      deepest: number;
      splits: Record<string, number>;
      marks500: Record<string, number>;
      bestHit: BigJSON;
      bestCombo: number;
      bestTapCells: number;
      bestChest: number;
      bestOffline: BigJSON;
      bestEmbers: BigJSON;
    };
    planted: Array<{ depth: number; n: number }>;
    contracts: Array<{ tpl: string; target: number; progress: number; base: number; arg: string; grand: boolean }>;
    contractCount: number;
    daily: { lastDay: number; calendarDay: number; claimedToday: boolean };
    pity: { crystal: number; reliquary: number; lintel: number };
    tutorial: { step: number; done: boolean; breaks: number };
    path: { step: number };
    hints: Record<string, number>;
    firstTime: string[];
    revealed: string[];
    cosmetics: { owned: string[]; equipped: Record<string, string> };
    stats: Record<string, number>;
    lifetime: { gold: BigJSON; embersEver: BigJSON };
    toolForm: number;
    markMax: number;
    blueprints: number;
    bestTier: number;
    bestLines: number;
    swift600: number;
    caught: Record<string, number>;
    lastUsed: Record<string, number>;
    dailyReady: boolean;
    rerolls: number;
  };
  director: { wait: number; history: string[]; since: Record<string, number>; dealt: number; codexQuiet: number };
  overrides: Array<{ depth: number; col: number; kind: number; floor: number }>;
  offline: null | {
    seconds: number; away: number; capped: boolean; fromDepth: number; toDepth: number;
    goldRows: BigJSON; goldGallery: BigJSON; chests: number; chestsGold: number; sealBiome: number; biomeCrossed: number;
    chambers: number; glimpses: number[]; darkNode: number; leashStop: boolean;
  };
  tap: { combo: number; rng: number };
}

/** What the save system stores: the current format. */
export type SaveData = SaveV4;
