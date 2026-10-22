import * as THREE from 'three';
import { Rng } from '../../core/rng';
import { MOBS_RULES, monsterBudget, packSize } from './config';
import { clearLine, clingable, crawlNext, floorNear, flyStep, headroom, standableFor, surfaceNormal, walkStep, type SolidFn, type V3 } from './nav';
import { BESTIARY_BONUS } from './rosters';
import { SPECIES, type BrainId, type GuardianPattern, type ShotDef, type SpeciesDef } from './species';
import { runBrain, crawlerGround } from './brains';
import { guardianBrain, guardianOnHit } from './guardian';
import { lairTick, strataSpawner, type Lair, type Nest } from './spawner';
import { ARMOUR_ARC, ARMOUR_FRONT, LEADER_POWER, LEADER_REACH, SPLIT, affixNumbers } from './elites';
import { lightBoost, type CompanionBrain, type CompanionEvent } from './companion';
import type { Mob, MobAffix, MobBiome, MobContext, MobElement, MobFamily, MobHitResult, MobKind, MobRank, MobRarity, MobRay, MobState, MobStrike } from './types';
import { WEAPONS } from '../../config/weapons';
import { FlowField } from './flow';

/** Each weapon's knock-back (m/s on a mass-1 creature), from LOOP's table (MOBS applies it). */
const WEAPON_KNOCK: Readonly<Record<string, number | undefined>> = Object.fromEntries(Object.entries(WEAPONS).map(([k, w]) => [k, w.knockback]));

/**
 * The creatures' simulation (round 2, MOBS): spawning, the brains of the twelve kinds, combat, the
 * light rules and the projectiles. No three.js objects but vectors, no game references: it reads
 * the world through `MobEnv` and reports what happens as `MobSimEvent`s (the facade, MobSystem,
 * turns them into damage, drops, sounds and hints). Unit-tested in Node.
 *
 * Survival rules (ROUND2 §0.9): monsters appear from the Hollow down, more of them deeper; never in
 * the lantern's pool, never in the camp, never in lit places; every attack is telegraphed (a
 * wind-up with its own sound and pose); the lantern is the explorer's safety: crawlers keep to the
 * edge of its light and recoil from a raised flame, the Stalker only comes when the flame is dim.
 */
export interface MobEnv {
  solid: SolidFn;
  /** Placed light at a cell (lamps, crystals, torches: the light volume's brightest channel, 0..1). */
  light(x: number, y: number, z: number): number;
  inCamp(x: number, y: number, z: number): boolean;
  /** Displayed depth (m) of a world height. */
  depthOf(y: number): number;
  /** The biome at a point (WORLD's strata); absent in the first world. */
  biomeAt?(x: number, y: number, z: number): MobBiome | null;
  /** No monster may spawn or stay here (outposts, the camp's margin): checked with inCamp. */
  safe?(x: number, y: number, z: number): boolean;
}

export type MobSimEvent =
  | { type: 'spawn'; mob: SimMob }
  | { type: 'gone'; mob: SimMob }
  | { type: 'telegraph'; mob: SimMob }
  | { type: 'attack'; mob: SimMob; damage: number; landed: boolean; element?: MobElement; dodged?: boolean }
  | { type: 'hit'; mob: SimMob; damage: number; killed: boolean; armoured: boolean; weak?: boolean }
  | { type: 'die'; mob: SimMob }
  | { type: 'recoil'; mob: SimMob }
  | { type: 'wake'; mob: SimMob }
  | { type: 'interact'; mob: SimMob; action: 'caught' | 'harvested' | 'spores' | 'petted' }
  | { type: 'drain'; mob: SimMob; seconds: number }
  | { type: 'cue'; mob: SimMob; cue: 'breath' | 'chitter' | 'whisper' | 'drone' | 'grind' | 'chirp' | 'squeak' | 'groan' | 'chime' }
  /** A named sound (audio/mobSfx) at a point. */
  | { type: 'sfx'; name: string; x: number; y: number; z: number; mob?: SimMob }
  | { type: 'meet'; mob: SimMob }
  | { type: 'shot'; shot: Shot; phase: 'fly' | 'hit' | 'miss' }
  | { type: 'scanned'; mob: SimMob }
  /** A burst at a point (an exploder, an emerging burrower, a slam): motes and dust, in its colour. */
  | { type: 'burst'; x: number; y: number; z: number; color: number; size: number }
  /** ('open': its guard opens after an attack, the window to strike; `mob.openFor` s.) */
  | { type: 'guardian'; mob: SimMob; phase: 'awake' | 'phase' | 'reset' | 'open' }
  /** The companion did something (sensed an ore, zapped a foe). */
  | { type: 'companion'; mob: SimMob; event: CompanionEvent };

export interface Shot {
  id: number;
  p: THREE.Vector3;
  v: THREE.Vector3;
  target: number;
  dmg: number;
  life: number;
  /** Seconds since it landed (the light shard glows a while where it fell); -1 while flying. */
  landed: number;
}

/** A hostile glob or orb in flight (slow and glowing: side-step it or dash through it). */
export interface Spit {
  id: number;
  p: THREE.Vector3;
  v: THREE.Vector3;
  def: ShotDef;
  owner: SimMob;
  life: number;
  /** Seconds since it burst (its splash glows a moment); -1 while flying. */
  done: number;
}

/**
 * A telegraph on the ground (every big blow is marked before it lands): a disc (a slam, a burst, a
 * drop), a line (a charge, a row of eruptions), a target (a dive), a wave (a rolling shockwave).
 * `progress` runs 0..1 over the wind-up; a wave's radius grows after it.
 */
export interface Marker {
  id: number;
  /** ('pulse': a harmless ring of light, a guardian's phase turning; its `progress` fades it.) */
  kind: 'disc' | 'line' | 'target' | 'wave' | 'ripple' | 'pulse';
  x: number;
  y: number;
  z: number;
  r: number;
  /** Lines: unit direction in xz and length; waves: the band's width. */
  dx: number;
  dz: number;
  len: number;
  progress: number;
  color: number;
  owner: number;
  /** Seconds left (-1: until removed by its owner). */
  life: number;
}

/** A rolling shockwave (a guardian's 'ring'): it hurts once where its band passes the explorer's feet. */
interface Wave {
  marker: Marker;
  speed: number;
  max: number;
  dmg: number;
  element: MobElement;
  owner: SimMob;
  hit: boolean;
}

/** A row of eruptions (a guardian's 'line'): each point bursts in turn. */
interface Eruption {
  marker: Marker;
  points: Array<{ x: number; y: number; z: number; at: number; done: boolean }>;
  t: number;
  dmg: number;
  element: MobElement;
  owner: SimMob;
  hit: boolean;
  color: number;
}

/** A guarded relic: the Stone Sentinel sleeps by it and wakes when it is taken. */
export interface SentinelSite {
  relic: string;
  x: number;
  y: number;
  z: number;
}

let nextId = 1;

/** One creature. Public fields are read by the renderer (poses) and the tests. */
export class SimMob implements Mob {
  readonly id = nextId++;
  readonly family: MobFamily;
  readonly rank: MobRank;
  readonly brain: BrainId;
  readonly position = new THREE.Vector3();
  readonly bounds: { radius: number; halfHeight: number };
  readonly hostile: boolean;
  readonly def: SpeciesDef;
  yaw = 0;
  hp?: number;
  maxHp?: number;
  state: MobState = 'idle';
  stateTime = 0;
  tappable = true;
  rarity?: MobRarity;
  object?: THREE.Object3D;
  /** Feet (walkers), cell (crawlers), the home (nest, roost, guard post). */
  readonly foot = { x: 0, y: 0, z: 0 };
  readonly cell = { x: 0, y: 0, z: 0 };
  readonly next = { x: 0, y: 0, z: 0 };
  readonly normal = { x: 0, y: 1, z: 0 };
  /** The smoothed surface normal a crawler's body is oriented to. */
  readonly up = new THREE.Vector3(0, 1, 0);
  readonly vel = { x: 0, y: 0, z: 0 };
  readonly home = { x: 0, y: 0, z: 0 };
  readonly goal = { x: 0, y: 0, z: 0 };
  /** Animation: stride phase, current speed, jaw / shell open 0..1, strike 0..1, alertness 0..1, glow 0..1. */
  gait = 0;
  speedNow = 0;
  open = 0;
  strike = 0;
  alert = 0;
  glow = 1;
  /** Hit flash 0..1 (on the mob only), and the fade-in / dissolve 0..1 (1 = solid). */
  flash = 0;
  fade = 0;
  cooldown = 0;
  timer = 0;
  /** A crawler pack, a lampling nest group. */
  group = 0;
  /** A Shellback's crystals, a burrower's pouch (1: full), the treasure thief. */
  crystals = 0;
  carry = 0;
  treasure = false;
  /** Per-mob variation 0..1 (size, hue, gait). */
  readonly seed: number;
  scale = 1;
  /** The Sentinel's relic, the worm's pass. */
  relic = '';
  path: { ax: number; ay: number; az: number; bx: number; by: number; bz: number; t: number; len: number; amp: number } | null = null;
  /** Set once a kind's first meeting has been announced for this mob. */
  met = false;
  /** Has struck the explorer during this attack. */
  landed = false;
  stuck = 0;
  /** Seconds since a burrower woke (it digs away after ~14 s). */
  timer2 = 0;
  // ---- Round 3
  /** Its biome (the roster it came from). */
  biome: MobBiome;
  /** A drop-ambusher on the ceiling ('ceiling') or down on the rock ('ground'); a burrower under it ('under'). */
  mode: 'ceiling' | 'ground' | 'under' | '' = '';
  /** A locked direction (a charge, a dive) and target point (a dive, an emergence). */
  readonly dir = { x: 0, y: 0, z: 1 };
  readonly target = { x: 0, y: 0, z: 0 };
  /** Knock-back velocity (m/s, decaying). */
  readonly knock = { x: 0, z: 0 };
  /** The telegraph marker it owns now (0: none). */
  marker = 0;
  /** A guardian's phase (1-based), its pattern now, the last one, its lair, seconds outside the lair. */
  phase = 1;
  pattern: GuardianPattern | null = null;
  lastPattern: GuardianPattern | null = null;
  lair: Lair | null = null;
  leash = 0;
  /** Rush / dive distance travelled. */
  run = 0;
  /** Its nest (0: none) and whether a summoner called it. */
  nest = 0;
  owner = 0;
  /** Seconds the explorer has watched it up close; scanned once. */
  watch = 0;
  scanned = false;
  /** An exploder's fuse is lit, and when (sim clock): struck down in its first 0.35 s it only pops (the tell had no time to read). */
  fused = false;
  fuseAt = 0;
  /** Its blows' damage factor (1: its kind's; the tutorial's first foe hits softly, elites harder). */
  power = 1;
  /** An elite's affixes (game/mobs/elites.ts), and what they make of it: speed, wind-up and cooldown factors. */
  affixes: MobAffix[] = [];
  pace = 1;
  tempo = 1;
  haste = 1;
  /** The look's affix bits (radiant 1, armoured 2, swift 4, splitting 8) for the renderer. */
  affixBits = 0;
  /** A splitting elite's child (it does not split again). */
  split = false;
  /** The companion's body (a tame Lampling), and a wild one's trust (glowcaps fed so far). */
  tame = false;
  trust = 0;
  /** A crawler that climbs above the explorer to drop from the ceiling (once). */
  ambush = false;
  // ---- Round 3: the feel of a fight (hit reactions and deaths read on the body)
  /** A blow's flinch 0..1 (it decays in a quarter second), and the way the blow pushed it (unit, world xz). */
  hurt = 0;
  readonly hurtDir = { x: 0, z: 1 };
  /** Struck down (not put away): it collapses for `collapse` s, then dissolves (`wasFalling`: still in the air last frame). */
  killed = false;
  collapse = 0;
  wasFalling = false;
  /** The Dark Heart's beat: 0..1 through each beat (its pose and its sound follow it). */
  beat = 0;
  /** Seconds left of a guardian's open guard (the window to strike), and its length. */
  openLeft = 0;
  openFor = 0;
  /** Seconds left of following the flow field round rock to the explorer, and the next sight check. */
  detour = 0;
  losIn = 0;

  constructor(readonly kind: MobKind, seed: number) {
    const d = SPECIES[kind];
    this.def = d;
    this.family = d.family;
    this.rank = d.rank;
    this.brain = d.brain;
    this.biome = d.biome;
    this.hostile = d.family === 'monster' && d.brain !== 'vista';
    this.seed = seed;
    this.scale = 1;
    this.bounds = { radius: d.radius, halfHeight: d.halfHeight };
    if (this.hostile) {
      this.hp = d.hp;
      this.maxHp = d.hp;
    }
    this.rarity = d.rarity;
    this.tappable = d.brain !== 'moth' && d.brain !== 'vista';
  }

  setState(s: MobState): void {
    if (this.state === s) return;
    this.state = s;
    this.stateTime = 0;
  }

  get dying(): boolean {
    return this.state === 'dying';
  }

  /** Its guard is open: an attack just ended (recoil), it is stunned, or a burrower has just surfaced. */
  get vulnerable(): boolean {
    return this.state === 'recoil' || this.state === 'stunned';
  }

  get guardian(): boolean {
    return this.rank !== 'minion';
  }

  get elite(): boolean {
    return this.affixes.length > 0;
  }
}

const tmpA: V3 = { x: 0, y: 0, z: 0 };
const tmpStep = { x: 0, z: 0 };
const tmpAir: V3 = { x: 0, y: 0, z: 0 };

/** It is coming for the explorer (not recoiling, fleeing or going home). */
function hunting(m: SimMob): boolean {
  return m.state === 'stalk' || m.state === 'attack' || m.state === 'lurk' || m.state === 'windup';
}
const tmpB: V3 = { x: 0, y: 0, z: 0 };
const tmpUp = new THREE.Vector3(0, 1, 0);
const tmpN: V3 = { x: 0, y: 0, z: 0 };

export class MobSim {
  readonly mobs: SimMob[] = [];
  readonly shots: Shot[] = [];
  readonly rng: Rng;
  /** Lantern intensity factor from the wisps (1 = untouched). */
  dim = 1;
  /** Lantern boost from lamplings and jelly spores (1 = none). */
  boost = 1;
  /** Seconds of jelly boost left. */
  boostLeft = 0;
  /** Monsters stop spawning (tests, the menu). */
  spawning = true;
  /** Brains off (captures): creatures hold still, still breathing. */
  brains = true;
  monsterDepth: number = MOBS_RULES.monsterDepth;
  sentinelSites: SentinelSite[] = [];
  /** Relics already taken / Sentinels already beaten (no Sentinel there). */
  readonly sentinelDone = new Set<string>();
  /** Points the Deep Worm may pass (far chasms, the lake), besides the automatic vista finder. */
  wormAnchors: V3[] = [];
  // ---- Round 3
  readonly spits: Spit[] = [];
  readonly markers: Marker[] = [];
  readonly waves: Wave[] = [];
  readonly eruptions: Eruption[] = [];
  /** The guardians' lairs and the nests of this stratum (from WORLD's layout). */
  lairs: Lair[] = [];
  nests: Nest[] = [];
  /** Biomes whose guardian is beaten (no guardian spawns in its lair again). */
  readonly guardiansDone = new Set<MobBiome>();
  /** Spawn as if in this biome (debug, captures, tests in the first world). */
  forceBiome: MobBiome | null = null;
  /** Kinds whose bestiary page is complete (blows land harder on them). */
  readonly known = new Set<MobKind>();
  /** The companion's brain and level (MobDirector sets it once a Lampling is tamed). */
  companion: { brain: CompanionBrain; level: number } | null = null;
  private readonly companionOut: CompanionEvent[] = [];
  /** A guardian's snuff: seconds of a choked lantern left. */
  snuffLeft = 0;
  /** Seconds since a monster last pressed the explorer (the encounter director brings the next one). */
  quiet = 0;
  encounterDue = 18;
  lastMonster = -Infinity;
  /** The last ambusher placed ahead (they wait to be walked into). */
  lastAmbush = -Infinity;
  /** Spawning density (1; LOOP's daily 'swarm' modifier raises it): more about, sooner. */
  density = 1;
  /** The way to the explorer through the caves (game/mobs/flow), rebuilt about once a second while monsters hunt. */
  readonly flow = new FlowField();
  lastBeing = -Infinity;
  listeners: Array<(e: MobSimEvent) => void> = [];
  attemptIn = 2;
  lastStalker = -Infinity;
  lastWorm = -Infinity;
  clock = 0;
  nextShot = 1;
  nextGroup = 1;
  nextMarker = 1;
  readonly packNext = new Map<number, number>();
  ctx: MobContext | null = null;

  constructor(readonly env: MobEnv, seed = 0x4d0b5) {
    this.rng = new Rng(seed);
    // The first meeting of the session must not be at boot.
    this.lastWorm = -MOBS_RULES.wormGap * 0.6;
  }

  on(fn: (e: MobSimEvent) => void): () => void {
    this.listeners.push(fn);
    return () => {
      this.listeners = this.listeners.filter((f) => f !== fn);
    };
  }

  emit(e: MobSimEvent): void {
    for (const fn of this.listeners) fn(e);
  }

  get time(): number {
    return this.clock;
  }

  count(family?: MobFamily, kind?: MobKind): number {
    let n = 0;
    // The companion is the explorer's, not the cave's: it counts toward no cap.
    for (const m of this.mobs) if (!m.dying && !m.tame && (!family || m.family === family) && (!kind || m.kind === kind)) n++;
    return n;
  }

  /** The group of a new pack. */
  group(): number {
    return this.nextGroup++;
  }

  // ------------------------------------------------------------------------------------
  // Spawning

  /** Put a mob in the world at a point (feet for walkers, the nearest clingable cell for crawlers). @returns null where it cannot stand. */
  /**
   * (`check`: the cell it ends up in, once placed on its floor or its rock, must pass this too, or it
   * is not spawned: a pack member jittered off the checked cell never lands in a lamp's light.)
   */
  spawn(kind: MobKind, x: number, y: number, z: number, opts: { group?: number; treasure?: boolean; relic?: string; asleep?: boolean; biome?: MobBiome; lair?: Lair; nest?: number; owner?: number; ceiling?: boolean; check?: (x: number, y: number, z: number) => boolean } = {}): SimMob | null {
    const m = new SimMob(kind, this.rng.next());
    const d = m.def;
    const s = this.env.solid;
    m.group = opts.group ?? 0;
    if (opts.biome) m.biome = opts.biome;
    m.nest = opts.nest ?? 0;
    m.owner = opts.owner ?? 0;
    if (opts.lair) m.lair = opts.lair;
    if (d.locomotion === 'walk' || d.locomotion === 'still') {
      const h = this.heightOf(m);
      const fx = Math.floor(x);
      const fz = Math.floor(z);
      const fy = floorNear(s, fx, Math.floor(y), fz, h, 4);
      if (fy === null) return null;
      if (opts.check && !opts.check(fx, fy, fz)) return null;
      m.foot.x = fx + 0.5;
      m.foot.y = fy;
      m.foot.z = fz + 0.5;
    } else if (d.locomotion === 'crawl') {
      const c = opts.ceiling ? this.nearestCeiling(Math.floor(x), Math.floor(y), Math.floor(z)) ?? this.nearestCling(Math.floor(x), Math.floor(y), Math.floor(z)) : this.nearestCling(Math.floor(x), Math.floor(y), Math.floor(z));
      if (!c) return null;
      if (opts.check && !opts.check(c.x, c.y, c.z)) return null;
      m.cell.x = m.next.x = c.x;
      m.cell.y = m.next.y = c.y;
      m.cell.z = m.next.z = c.z;
      surfaceNormal(s, c.x, c.y, c.z, m.normal);
      m.up.set(m.normal.x, m.normal.y, m.normal.z);
      this.crawlAnchor(m, m.cell, tmpA);
      m.position.set(tmpA.x, tmpA.y, tmpA.z);
    } else {
      if (s(Math.floor(x), Math.floor(y), Math.floor(z))) return null;
      if (opts.check && !opts.check(Math.floor(x), Math.floor(y), Math.floor(z))) return null;
      m.position.set(x, y, z);
    }
    m.home.x = x;
    m.home.y = y;
    m.home.z = z;
    m.goal.x = x;
    m.goal.y = y;
    m.goal.z = z;
    m.yaw = this.rng.range(-Math.PI, Math.PI);
    m.scale = this.scaleFor(m);
    // The capsule is the drawn size (FP's screen snap and the pick read it as is).
    m.bounds.radius = d.radius * m.scale;
    m.bounds.halfHeight = d.halfHeight * m.scale;
    switch (m.brain) {
      case 'graze':
        m.crystals = 3 + (m.seed > 0.6 ? 1 : 0);
        m.setState('idle');
        break;
      case 'thief':
        m.carry = 1;
        m.treasure = opts.treasure === true;
        if (m.treasure) m.rarity = 'legendary';
        m.setState('wake');
        break;
      case 'sentinel':
        m.relic = opts.relic ?? '';
        m.setState(opts.asleep === false ? 'wake' : 'sleep');
        m.glow = 0.15;
        break;
      case 'mimic':
        m.setState('sleep');
        break;
      case 'lurk':
      case 'cling':
        m.setState('lurk');
        // A crawler that came on the rock overhead creeps along it to drop on the explorer (a told ambush).
        if (m.brain === 'cling' && opts.ceiling && m.up.y < -0.6) m.ambush = true;
        break;
      case 'drain':
        m.setState('wander');
        break;
      case 'drop':
        // On the ceiling when it found one (a cell with rock above and room below), else down on the rock.
        m.mode = s(m.cell.x, m.cell.y + 1, m.cell.z) && !s(m.cell.x, m.cell.y - 1, m.cell.z) ? 'ceiling' : 'ground';
        m.setState(m.mode === 'ceiling' ? 'sleep' : 'lurk');
        break;
      case 'dig':
        // It arrives underground: a rumble coming closer.
        m.mode = opts.asleep === false ? '' : 'under';
        m.setState(m.mode === 'under' ? 'burrow' : 'stalk');
        if (m.mode === 'under') m.tappable = false;
        break;
      case 'guardian':
      case 'heart':
        m.setState(opts.asleep === false ? 'wake' : 'sleep');
        m.glow = 0.3;
        break;
      case 'pack':
      case 'charge':
      case 'spit':
      case 'dive':
      case 'slam':
      case 'fuse':
        m.setState('stalk');
        break;
      default:
        m.setState('idle');
    }
    if (d.locomotion === 'walk' || d.locomotion === 'still') this.placeWalker(m);
    this.mobs.push(m);
    this.emit({ type: 'spawn', mob: m });
    return m;
  }

  scaleFor(m: SimMob): number {
    const [a, b] = m.def.scale;
    return a + m.seed * (b - a);
  }

  heightOf(m: SimMob): number {
    return m.def.height;
  }

  /** The nearest open cell with rock right above it and room below (a drop-ambusher's perch). */
  nearestCeiling(x: number, y: number, z: number): V3 | null {
    const s = this.env.solid;
    for (let dy = 0; dy <= 8; dy++) {
      for (let r = 0; r <= 2; r++)
        for (let dz = -r; dz <= r; dz++)
          for (let dx = -r; dx <= r; dx++) {
            if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
            const cx = x + dx;
            const cy = y + dy;
            const cz = z + dz;
            if (!s(cx, cy, cz) && s(cx, cy + 1, cz) && !s(cx, cy - 1, cz) && !s(cx, cy - 2, cz)) return { x: cx, y: cy, z: cz };
          }
    }
    return null;
  }

  nearestCling(x: number, y: number, z: number): V3 | null {
    const s = this.env.solid;
    for (let r = 0; r <= 3; r++)
      for (let dy = -r; dy <= r; dy++)
        for (let dz = -r; dz <= r; dz++)
          for (let dx = -r; dx <= r; dx++) {
            if (Math.max(Math.abs(dx), Math.abs(dy), Math.abs(dz)) !== r) continue;
            if (clingable(s, x + dx, y + dy, z + dz)) return { x: x + dx, y: y + dy, z: z + dz };
          }
    return null;
  }

  /** Where a crawler's body sits in a cell: hugging its rock (the cell centre moved toward the surface). */
  crawlAnchor(m: SimMob, c: V3, out: V3): V3 {
    surfaceNormal(this.env.solid, c.x, c.y, c.z, tmpN);
    const off = 0.5 - m.def.lift * m.scale;
    out.x = c.x + 0.5 - tmpN.x * off;
    out.y = c.y + 0.5 - tmpN.y * off;
    out.z = c.z + 0.5 - tmpN.z * off;
    return out;
  }

  placeWalker(m: SimMob): void {
    m.position.set(m.foot.x, m.foot.y + m.def.lift * m.scale, m.foot.z);
  }

  /** The lantern's bright pool now (m): crawlers keep out of it, the Stalker waits beyond it. */
  brightRadius(ctx: MobContext): number {
    const l = ctx.lantern;
    if (!l.lit) return 0;
    const r = l.radius * 0.55 * Math.max(0, Math.min(1, l.flame));
    return l.raised ? r * 1.5 + 1.5 : r;
  }

  /** May a monster spawn in this cell now? (dark, outside the pool and the camp, deep enough). Pure, unit-tested. */
  canSpawnMonster(x: number, y: number, z: number, ctx: MobContext): boolean {
    const env = this.env;
    if (this.unsafe(x + 0.5, y, z + 0.5)) return false;
    if (!this.strata && env.depthOf(y) < this.monsterDepth) return false;
    if (env.light(x, y, z) > MOBS_RULES.darkLight) return false;
    const l = ctx.lantern;
    const pool = l.lit ? l.radius * MOBS_RULES.poolFactor * Math.max(0.35, l.flame) + MOBS_RULES.poolMargin : MOBS_RULES.poolMargin + 4;
    if (Math.hypot(x + 0.5 - l.x, y + 0.5 - l.y, z + 0.5 - l.z) < pool) return false;
    if (Math.hypot(x + 0.5 - ctx.player.x, y + 0.5 - ctx.player.y, z + 0.5 - ctx.player.z) < MOBS_RULES.spawnMin) return false;
    return true;
  }

  canSpawnBeing(x: number, y: number, z: number, ctx: MobContext): boolean {
    if (this.unsafe(x + 0.5, y, z + 0.5)) return false;
    if (!this.strata && this.env.depthOf(y) < MOBS_RULES.beingDepth) return false;
    return Math.hypot(x + 0.5 - ctx.player.x, y + 0.5 - ctx.player.y, z + 0.5 - ctx.player.z) >= 7;
  }

  /** A random cell of the wanted shape in the spawn shell. */
  findCell(ctx: MobContext, shape: 'floor' | 'cling' | 'air', ok: (x: number, y: number, z: number) => boolean, height = 1, minR: number = MOBS_RULES.spawnMin, maxR: number = MOBS_RULES.spawnMax, cone?: { yaw: number; half: number }): V3 | null {
    const s = this.env.solid;
    const r = this.rng;
    for (let tries = 0; tries < 28; tries++) {
      const a = cone ? cone.yaw + r.range(-cone.half, cone.half) : r.range(-Math.PI, Math.PI);
      const d = r.range(minR, maxR);
      const x = Math.floor(ctx.player.x + Math.sin(a) * d);
      const z = Math.floor(ctx.player.z + Math.cos(a) * d);
      const y0 = Math.floor(ctx.player.y + r.range(-5, 4));
      for (let k = 0; k < 9; k++) {
        const y = y0 + (k % 2 === 0 ? k / 2 : -(k + 1) / 2);
        let fits: boolean;
        if (shape === 'floor') fits = standableFor(s, x, y, z, height);
        else if (shape === 'cling') fits = clingable(s, x, y, z);
        else fits = !s(x, y, z) && !s(x, y - 1, z) && !s(x, y + 1, z) && headroom(s, x, y - 2, z, 6) >= 4;
        if (fits && ok(x, y, z)) return { x, y, z };
      }
    }
    return null;
  }

  spawner(dt: number, ctx: MobContext): void {
    this.attemptIn -= dt;
    if (this.attemptIn > 0 || ctx.atCamp) return;
    this.attemptIn = MOBS_RULES.attemptEvery;
    // The Sentinel sleeps by its relic until it is taken (placed, not bred: even with the spawner off).
    for (const site of this.sentinelSites) {
      if (this.sentinelDone.has(site.relic)) continue;
      if (this.mobs.some((m) => m.kind === 'sentinel' && m.relic === site.relic)) continue;
      if (Math.hypot(site.x - ctx.player.x, site.y - ctx.player.y, site.z - ctx.player.z) > 34) continue;
      this.spawn('sentinel', site.x, site.y, site.z, { relic: site.relic });
    }
    if (!this.spawning) return;
    const depth = ctx.depth;
    const now = this.clock;
    const r = this.rng;
    const budget = monsterBudget(depth, this.monsterDepth);
    const monsters = this.count('monster') - this.count('monster', 'worm') - this.count('monster', 'sentinel');
    if (monsters < budget && now - this.lastMonster >= MOBS_RULES.monsterGap) {
      const okM = (x: number, y: number, z: number) => this.canSpawnMonster(x, y, z, ctx);
      let kind: MobKind;
      const deep = depth >= this.monsterDepth + 20;
      if (deep && now - this.lastStalker >= MOBS_RULES.stalkerGap && this.count(undefined, 'stalker') === 0 && r.int(0, MOBS_RULES.stalkerOdds - 1) === 0) kind = 'stalker';
      else {
        const roll = r.next();
        kind = roll < 0.5 ? 'crawler' : roll < 0.78 ? 'wisp' : 'gnasher';
        if (kind === 'wisp' && this.count(undefined, 'wisp') >= 2) kind = 'crawler';
        if (kind === 'gnasher' && this.count(undefined, 'gnasher') >= 2) kind = 'crawler';
      }
      let made = 0;
      if (kind === 'crawler') {
        const c = this.findCell(ctx, 'cling', okM);
        if (c) {
          const n = Math.min(packSize(depth, r.next(), this.monsterDepth), budget - monsters + 1);
          const g = this.nextGroup++;
          for (let i = 0; i < n; i++) {
            const m = this.spawn('crawler', c.x + r.int(-1, 1), c.y, c.z + r.int(-1, 1), { group: g });
            if (m) made++;
          }
        }
      } else if (kind === 'wisp') {
        const c = this.findCell(ctx, 'air', okM);
        if (c && this.spawn('wisp', c.x + 0.5, c.y + 0.5, c.z + 0.5)) made++;
      } else if (kind === 'gnasher') {
        // An ambush: on the floor a little nearer the way, but still in the dark.
        const c = this.findCell(ctx, 'floor', okM, 2, MOBS_RULES.spawnMin, MOBS_RULES.spawnMin + 7);
        if (c && this.spawn('gnasher', c.x + 0.5, c.y, c.z + 0.5)) made++;
      } else {
        const c = this.findCell(ctx, 'floor', okM, 2, MOBS_RULES.spawnMin, MOBS_RULES.spawnMin + 5);
        if (c && this.spawn('stalker', c.x + 0.5, c.y, c.z + 0.5)) {
          made++;
          this.lastStalker = now;
        }
      }
      if (made > 0) this.lastMonster = now;
    }
    // Beings: a few about from the tunnel down (never at camp).
    if (depth >= MOBS_RULES.beingDepth && now - this.lastBeing >= MOBS_RULES.beingGap && this.beingCount() < MOBS_RULES.maxBeings) {
      const okB = (x: number, y: number, z: number) => this.canSpawnBeing(x, y, z, ctx);
      const roll = r.next();
      let made = false;
      if (roll < 0.22) {
        const c = this.findCell(ctx, 'floor', okB, 1, 8, 18);
        if (c) made = !!this.spawn('glimmerkin', c.x + 0.5, c.y, c.z + 0.5);
      } else if (roll < 0.36) {
        if (this.count(undefined, 'shellback') === 0) {
          const c = this.findCell(ctx, 'floor', okB, 2, 9, 20);
          if (c) made = !!this.spawn('shellback', c.x + 0.5, c.y, c.z + 0.5);
        }
      } else if (roll < 0.52) {
        if (this.count(undefined, 'jelly') < 2) {
          const c = this.findCell(ctx, 'air', okB, 1, 9, 22);
          if (c) made = !!this.spawn('jelly', c.x + 0.5, c.y + 1.5, c.z + 0.5);
        }
      } else if (roll < 0.7) {
        if (this.count(undefined, 'lampling') === 0) {
          const c = this.findCell(ctx, 'air', okB, 1, 8, 16);
          if (c) {
            const g = this.nextGroup++;
            const n = 2 + r.int(0, 1);
            for (let i = 0; i < n; i++) made = !!this.spawn('lampling', c.x + 0.5 + r.range(-0.6, 0.6), c.y + 0.5 + r.range(-0.3, 0.3), c.z + 0.5 + r.range(-0.6, 0.6), { group: g }) || made;
          }
        }
      } else if (roll < 0.84) {
        if (this.count(undefined, 'moth') < 10) made = this.spawnMoths(ctx, 6 + r.int(0, 4)) > 0;
      } else if (this.count(undefined, 'burrower') === 0) {
        const c = this.findCell(ctx, 'floor', okB, 1, 5, 9);
        if (c) made = !!this.spawn('burrower', c.x + 0.5, c.y, c.z + 0.5);
      }
      if (made) this.lastBeing = now;
    }
  }

  beingCount(): number {
    let n = 0;
    for (const m of this.mobs) if (!m.dying && m.family === 'being' && m.kind !== 'moth') n++;
    return n + (this.count(undefined, 'moth') > 0 ? 1 : 0);
  }

  /** A small cloud of lumen moths somewhere open nearby. @returns how many. */
  spawnMoths(ctx: MobContext, n: number, at?: V3): number {
    const c = at ?? this.findCell(ctx, 'air', (x, y, z) => this.canSpawnBeing(x, y, z, ctx), 1, 7, 15);
    if (!c) return 0;
    const g = this.nextGroup++;
    let k = 0;
    for (let i = 0; i < n; i++) {
      const m = this.spawn('moth', c.x + 0.5 + this.rng.range(-1, 1), c.y + 0.5 + this.rng.range(-0.5, 0.8), c.z + 0.5 + this.rng.range(-1, 1), { group: g });
      if (m) k++;
    }
    return k;
  }

  // ------------------------------------------------------------------------------------
  // The frame

  update(dt: number, ctx: MobContext): void {
    if (!(dt > 0)) return;
    dt = Math.min(dt, 0.1);
    this.ctx = ctx;
    this.clock += dt;
    if (ctx.active) {
      // The guardians sleep in their lairs whatever the spawning (they are the layout's, not the dice's).
      if (this.lairs.length && !ctx.atCamp) lairTick(this, ctx);
      // The strata (a biome map, or a biome forced for tests and captures) spawn from the rosters.
      if (this.forceBiome || ctx.biome || this.env.biomeAt) strataSpawner(this, dt, ctx);
      else this.spawner(dt, ctx);
    }
    let dim = 1;
    let followers = 0;
    let engaged = false;
    // The way to the explorer, kept fresh while anything hunts it.
    if (ctx.active && this.brains && this.mobs.some((m) => m.hostile && !m.dying && !m.guardian)) this.flowFor(ctx);
    for (let i = this.mobs.length - 1; i >= 0; i--) {
      const m = this.mobs[i];
      m.stateTime += dt;
      m.flash = Math.max(0, m.flash - dt / MOBS_RULES.flash);
      m.cooldown -= dt * m.haste;
      if (m.dying) {
        m.hurt = Math.max(0, m.hurt - dt / 0.25);
        // Struck down: it falls, topples or curls up first (the body reads the death), then dissolves;
        // one still falling (off a roof, out of the air) lands first.
        if (m.killed) {
          const falling = this.collapseStep(m, dt);
          // The body comes down: a flier or a roof-crawler hitting the floor, a big one toppling over.
          if (!falling && !m.landed && (m.wasFalling || (m.stateTime >= m.collapse * 0.75 && (m.def.size === 'large' || m.def.size === 'huge') && !m.guardian))) {
            m.landed = true;
            this.sfx(m, 'mob.thud');
          }
          m.wasFalling = falling;
          if (m.stateTime < m.collapse || (falling && m.stateTime < m.collapse + 2.5)) continue;
        }
        m.fade = Math.max(0, m.fade - dt / dissolveOf(m));
        if (!m.killed && m.def.locomotion !== 'fly') this.walkerSettle(m, dt);
        if (m.fade <= 0) {
          this.mobs.splice(i, 1);
          this.emit({ type: 'gone', mob: m });
        }
        continue;
      }
      // A burrower underground stays dissolved (its rumble and the ripple on the floor give it away).
      const fadeTo = m.mode === 'under' ? 0 : 1;
      m.fade += (fadeTo - m.fade) * Math.min(1, dt / (fadeTo > m.fade ? 0.9 : 0.25));
      if (fadeTo === 1 && m.fade > 0.995) m.fade = 1;
      if (ctx.active && this.brains) this.brain(m, dt, ctx);
      this.applyKnock(m, dt);
      this.animate(m, dt);
      if (ctx.active) this.watchScan(m, dt, ctx);
      if (m.brain === 'drain' && m.state === 'attack') dim = Math.min(dim, MOBS_RULES.wispDim + (1 - MOBS_RULES.wispDim) * (1 - Math.min(1, m.stateTime / 1.5)));
      if (m.brain === 'lamp' && (m.state === 'follow' || m.tame)) followers += m.tame ? 0 : 1;
      // Pressing the explorer: hunting it in sight (or close); one walled off in the next tunnel is not.
      if (!engaged && m.hostile && (m.state === 'windup' || m.state === 'attack' || m.state === 'stalk')) {
        const d = this.distToPlayer(m, ctx);
        if (d < 7 || (d < 18 && this.seesPlayer(m, ctx))) engaged = true;
      }
      // Put away what is far behind (and every monster when the explorer is home). Guardians keep to their lairs.
      const reach = m.brain === 'vista' ? 140 : m.guardian ? 90 : m.brain === 'sentinel' ? 60 : m.tame ? Infinity : MOBS_RULES.despawn;
      const far = Math.hypot(m.position.x - ctx.player.x, m.position.y - ctx.player.y, m.position.z - ctx.player.z) > reach;
      if (far || (ctx.atCamp && m.hostile && m.brain !== 'sentinel' && !m.guardian)) this.remove(m);
      // Monsters never enter the camp or an outpost: one that strays in turns back to the dark.
      else if (m.hostile && !m.guardian && (this.unsafe(m.position.x, m.position.y, m.position.z) || (!this.strata && this.env.depthOf(m.position.y) < this.monsterDepth - 12))) this.remove(m);
    }
    this.quiet = engaged ? 0 : this.quiet + dt;
    this.snuffLeft = Math.max(0, this.snuffLeft - dt);
    if (this.snuffLeft > 0) dim = Math.min(dim, 0.32);
    this.dim += (dim - this.dim) * Math.min(1, dt * 3);
    this.boostLeft = Math.max(0, this.boostLeft - dt);
    // Light: a jelly's spores, wild lamplings following, the companion (brighter with its level).
    const tame = this.companion && this.mobs.some((m) => m.tame && !m.dying) ? lightBoost(this.companion.level) : 1;
    const boost = (this.boostLeft > 0 ? MOBS_RULES.jellyBoost : 1) * Math.max(followers > 0 ? 1.1 : 1, tame);
    this.boost += (boost - this.boost) * Math.min(1, dt * 2);
    this.updateShots(dt);
    this.updateHazards(dt, ctx);
    if (ctx.active) this.wormDirector(ctx);
  }

  /** The flow field round the explorer, rebuilt when it is a second old or the explorer has moved 1.5 m. */
  flowFor(ctx: MobContext): FlowField {
    const f = this.flow;
    const p = ctx.player;
    if (this.clock - f.at > 1 || Math.hypot(p.x - f.x, p.y - f.y, p.z - f.z) > 1.5 || f.path !== MOBS_RULES.flowReach) f.build(this.env.solid, p.x, p.y + 0.01, p.z, MOBS_RULES.flowReach, this.clock);
    return f;
  }

  /** Spawning from the biome rosters (the strata), rather than the first world's depth rules. */
  get strata(): boolean {
    return !!(this.forceBiome || this.ctx?.biome || this.env.biomeAt);
  }

  /** The camp, its margin, an outpost: no monster here. */
  unsafe(x: number, y: number, z: number): boolean {
    return this.env.inCamp(x, y, z) || (this.env.safe?.(x, y, z) ?? false);
  }

  /** The biome at a point: forced, WORLD's map, the explorer's, or by depth in the first world. */
  biomeAt(x: number, y: number, z: number): MobBiome {
    if (this.forceBiome) return this.forceBiome;
    return this.env.biomeAt?.(x, y, z) ?? this.ctx?.biome ?? 'amberHollows';
  }

  /** Fade a mob out now (despawn); 'gone' follows. */
  remove(m: SimMob): void {
    if (m.dying) return;
    m.setState('dying');
    m.tappable = false;
    this.dropMarker(m);
  }

  walkerSettle(m: SimMob, dt: number): void {
    if (m.def.locomotion !== 'walk' && m.def.locomotion !== 'still') return;
    if (m.mode === 'under') return;
    walkStep(this.env.solid, m.foot, 0, 0, dt, this.heightOf(m), m.bounds.radius);
    this.placeWalker(m);
  }

  /**
   * A struck-down creature's last moments (before it dissolves): a flier drops out of the air
   * tumbling, a crawler on a wall or a roof falls to the floor, a walker settles where it fell (the
   * blow's push carries it a little); a guardian shudders and bursts with light as it goes down.
   */
  collapseStep(m: SimMob, dt: number): boolean {
    const s = this.env.solid;
    const loco = m.def.locomotion;
    let falling = false;
    if (loco === 'fly') {
      m.vel.x *= Math.exp(-dt * 1.6);
      m.vel.z *= Math.exp(-dt * 1.6);
      m.vel.y -= (m.guardian ? 9 : 16) * dt;
      this.applyKnock(m, dt);
      const r = Math.min(0.45, m.bounds.radius * 0.7);
      const y0 = m.position.y;
      flyStep(s, m.position, m.vel, dt, r);
      m.yaw += dt * (m.seed > 0.5 ? 1.6 : -1.6) * Math.max(0, 1 - m.stateTime / Math.max(0.1, m.collapse));
      // Still in the air: it moved down this step, or there is open air under its body.
      falling = m.position.y < y0 - 1e-4 || !s(Math.floor(m.position.x), Math.floor(m.position.y - r - 0.2), Math.floor(m.position.z));
      if (!falling) {
        m.vel.x = 0;
        m.vel.z = 0;
      }
    } else if (loco === 'crawl') {
      if (m.up.y < 0.6 || m.vel.y !== 0) {
        // Off the wall or the roof: it lets go and falls.
        const floor = this.floorY(m.position.x, m.position.y, m.position.z);
        m.vel.y -= 24 * dt;
        m.position.y += m.vel.y * dt;
        const ground = floor + m.def.lift * m.scale;
        if (m.position.y <= ground) {
          m.position.y = ground;
          m.vel.y = 0;
          m.up.set(0, 1, 0);
        } else {
          m.up.lerp(tmpUp, Math.min(1, dt * 6)).normalize();
          falling = true;
        }
      }
    } else if (m.mode !== 'under') {
      this.applyKnock(m, dt);
      this.walkerSettle(m, dt);
    }
    if (m.guardian && m.stateTime < m.collapse) {
      // Light breaks out of it as it goes down: bursts round its body, quicker toward the end.
      m.timer -= dt;
      if (m.timer <= 0) {
        const k = m.stateTime / Math.max(0.1, m.collapse);
        m.timer = 0.42 - 0.24 * k + this.rng.range(0, 0.08);
        const a = this.rng.range(-Math.PI, Math.PI);
        const r = m.bounds.radius * this.rng.range(0.3, 0.9);
        this.emit({ type: 'burst', x: m.position.x + Math.sin(a) * r, y: m.position.y + this.rng.range(-0.4, 0.8) * (m.bounds.halfHeight + m.bounds.radius), z: m.position.z + Math.cos(a) * r, color: m.def.mote, size: 0.8 + k });
      }
    }
    return falling;
  }

  /** A blow's push, decaying over a quarter second (walkers slide on the floor, fliers drift). */
  applyKnock(m: SimMob, dt: number): void {
    const k = m.knock;
    if (Math.abs(k.x) + Math.abs(k.z) < 0.02) return;
    const loco = m.def.locomotion;
    if (loco === 'walk' || loco === 'still') {
      if (m.mode !== 'under') {
        walkStep(this.env.solid, m.foot, k.x, k.z, dt, this.heightOf(m), m.bounds.radius);
        this.placeWalker(m);
      }
    } else if (loco === 'fly') {
      m.vel.x += k.x * dt * 6;
      m.vel.z += k.z * dt * 6;
    }
    const f = Math.exp(-dt * 9);
    k.x *= f;
    k.z *= f;
  }

  /** Watching a creature up close (near the centre of the view) scans it, once. */
  watchScan(m: SimMob, dt: number, ctx: MobContext): void {
    if (m.scanned || m.fade < 0.6 || m.brain === 'vista') return;
    const look = (ctx as MobContext & { look?: V3 }).look;
    if (!look) return;
    const dx = m.position.x - ctx.eye.x;
    const dy = m.position.y - ctx.eye.y;
    const dz = m.position.z - ctx.eye.z;
    const dd = Math.hypot(dx, dy, dz);
    if (dd > MOBS_RULES.watchRange + m.bounds.radius) {
      m.watch = Math.max(0, m.watch - dt);
      return;
    }
    const cos = (dx * look.x + dy * look.y + dz * look.z) / Math.max(0.01, dd);
    const within = Math.atan2(m.bounds.radius + 0.5, dd);
    if (cos > Math.cos(within + 0.12) && this.seesPlayer(m, ctx)) m.watch += dt;
    else m.watch = Math.max(0, m.watch - dt * 0.5);
    if (m.watch >= MOBS_RULES.watchSeconds) this.markScanned(m);
  }

  /** Scan a creature (the sonar, a long look): a bestiary page. */
  markScanned(m: SimMob): void {
    if (m.scanned) return;
    m.scanned = true;
    this.emit({ type: 'scanned', mob: m });
  }

  /** The sonar: every creature within `radius` (through rock too) is scanned. */
  scan(x: number, y: number, z: number, radius: number): number {
    let n = 0;
    for (const m of this.mobs) {
      if (m.dying || m.brain === 'vista') continue;
      if (Math.hypot(m.position.x - x, m.position.y - y, m.position.z - z) > radius) continue;
      n++;
      this.markScanned(m);
    }
    return n;
  }

  // ------------------------------------------------------------------------------------
  // Brains

  brain(m: SimMob, dt: number, ctx: MobContext): void {
    switch (m.brain) {
      case 'cling':
        return this.crawler(m, dt, ctx);
      case 'mimic':
        return this.gnasher(m, dt, ctx);
      case 'drain':
        return this.wisp(m, dt, ctx);
      case 'lurk':
        return this.stalker(m, dt, ctx);
      case 'sentinel':
        return this.sentinel(m, dt, ctx);
      case 'vista':
        return this.worm(m, dt);
      case 'moth':
        return this.moth(m, dt, ctx);
      case 'lamp':
        if (m.tame && this.companion) {
          this.companionOut.length = 0;
          this.companion.brain.step(this, m, dt, ctx, this.companion.level, this.companionOut);
          for (const event of this.companionOut) this.emit({ type: 'companion', mob: m, event });
          return;
        }
        return this.lampling(m, dt, ctx);
      case 'skitter':
        return this.glimmerkin(m, dt, ctx);
      case 'graze':
        return this.shellback(m, dt, ctx);
      case 'float':
        return this.jelly(m, dt, ctx);
      case 'thief':
        return this.burrower(m, dt, ctx);
      case 'guardian':
      case 'heart':
        return guardianBrain(this, m, dt, ctx);
      case 'drop':
        if (m.mode === 'ground') return crawlerGround(this, m, dt, ctx);
        return runBrain(this, m, dt, ctx);
      default:
        return runBrain(this, m, dt, ctx);
    }
  }

  distToPlayer(m: SimMob, ctx: MobContext): number {
    return Math.hypot(m.position.x - ctx.player.x, m.position.y - (ctx.player.y + 1.0), m.position.z - ctx.player.z);
  }

  flatDist(m: SimMob, ctx: MobContext): number {
    return Math.hypot(m.position.x - ctx.player.x, m.position.z - ctx.player.z);
  }

  seesPlayer(m: SimMob, ctx: MobContext): boolean {
    tmpA.x = m.position.x;
    tmpA.y = m.position.y + 0.1;
    tmpA.z = m.position.z;
    return clearLine(this.env.solid, tmpA, ctx.eye) || clearLine(this.env.solid, tmpA, { x: ctx.player.x, y: ctx.player.y + 0.9, z: ctx.player.z });
  }

  /** A creature's wind-up (s): its kind's, quicker for a swift elite, never under 0.35 s (or its kind's own, if shorter). */
  windupOf(m: SimMob): number {
    return Math.max(Math.min(m.def.windup, 0.35), m.def.windup * m.tempo);
  }

  /** A pack member's slot: its index among the living of its group (and kind of brain), and their count. */
  groupSlot(m: SimMob): { i: number; n: number } {
    if (!m.group) return { i: 0, n: 1 };
    let i = 0;
    let n = 0;
    for (const o of this.mobs) {
      if (o.group !== m.group || o.dying || o.brain !== m.brain) continue;
      if (o.id < m.id) i++;
      n++;
    }
    return { i, n: Math.max(1, n) };
  }

  /**
   * Is it this pack member's turn to strike? Of the ready ones (near, waiting, rested), the one most
   * to the explorer's side (the flank: in sight at the edge of the view, its tell heard on that side).
   * Without a view direction (tests, the first world), any ready one may go.
   */
  flanker(m: SimMob, ctx: MobContext): boolean {
    const look = ctx.look;
    if (!look || !m.group) return true;
    const lx = look.x;
    const lz = look.z;
    const ll = Math.hypot(lx, lz);
    if (ll < 1e-3) return true;
    const score = (o: SimMob) => {
      const dx = o.position.x - ctx.player.x;
      const dz = o.position.z - ctx.player.z;
      const d = Math.max(0.01, Math.hypot(dx, dz));
      // |sin| of the angle between the view and the bearing: 1 at either side, 0 ahead or behind.
      return Math.abs(lx * dz - lz * dx) / (ll * d);
    };
    const mine = score(m);
    for (const o of this.mobs) {
      if (o === m || o.group !== m.group || o.dying || o.brain !== m.brain || o.state !== 'stalk') continue;
      if (o.cooldown > 0 || o.stateTime <= 0.6 || this.flatDist(o, ctx) >= 7.5) continue;
      if (score(o) > mine + 0.05) return false;
    }
    return true;
  }

  /** Not cowed by a raised flame: a radiant elite, or a creature within its leader's reach. */
  brave(m: SimMob): boolean {
    if (m.affixBits & 1) return true;
    for (const o of this.mobs) if (o !== m && o.affixBits & 1 && !o.dying && o.position.distanceTo(m.position) <= LEADER_REACH) return true;
    return false;
  }

  /** Make a creature an elite (its affixes' hit points, speed, tells; a little bigger). */
  makeElite(m: SimMob, affixes: readonly MobAffix[]): void {
    if (!affixes.length || !m.hostile || m.guardian) return;
    const n = affixNumbers(affixes);
    m.affixes = [...affixes];
    m.affixBits = n.bits;
    m.pace = n.pace;
    m.tempo = n.tempo;
    m.haste = n.haste;
    m.maxHp = Math.round((m.maxHp ?? m.def.hp) * n.hp);
    m.hp = m.maxHp;
    m.scale *= 1.12;
    m.bounds.radius = m.def.radius * m.scale;
    m.bounds.halfHeight = m.def.halfHeight * m.scale;
    if (m.def.locomotion === 'walk' || m.def.locomotion === 'still') this.placeWalker(m);
  }

  /** No rock between two points. */
  clearSight(a: V3, b: V3): boolean {
    return clearLine(this.env.solid, a, b);
  }

  announce(m: SimMob, ctx: MobContext): void {
    if (m.met) return;
    if (this.distToPlayer(m, ctx) > (m.brain === 'vista' ? 80 : m.guardian ? 30 : 13)) return;
    if (m.brain !== 'vista' && !this.seesPlayer(m, ctx)) return;
    m.met = true;
    this.emit({ type: 'meet', mob: m });
  }

  /** The crawler: on rock at the edge of the light, darting in from the dark, recoiling from a bright flame. */
  crawler(m: SimMob, dt: number, ctx: MobContext): void {
    if (m.mode === 'ceiling') return this.ceilingDrop(m, dt, ctx);
    const bright = this.brightRadius(ctx);
    const l = ctx.lantern;
    const dl = Math.hypot(m.position.x - l.x, m.position.y - l.y, m.position.z - l.z);
    const dp = this.distToPlayer(m, ctx);
    this.announce(m, ctx);
    let speed = m.def.speed * (0.85 + 0.3 * m.seed);
    let away = false;
    switch (m.state) {
      case 'lurk': {
        // Circle at the edge of the pool (each crawler at its own bearing, drifting slowly).
        const ring = Math.max(1.9, bright + 0.8);
        const a = this.clock * (0.22 + m.seed * 0.12) * (m.seed > 0.5 ? 1 : -1) + m.seed * 6.283 + m.group;
        m.goal.x = ctx.player.x + Math.sin(a) * ring;
        m.goal.y = ctx.player.y + 1 + Math.sin(a * 1.7) * 1.4;
        m.goal.z = ctx.player.z + Math.cos(a) * ring;
        if (l.raised && dl < bright + 1 && !this.brave(m)) {
          this.recoil(m);
          break;
        }
        if (dl < bright * 0.8 && l.flame > 0.5 && !this.brave(m)) away = true;
        const token = this.packNext.get(m.group) ?? 0;
        if (m.ambush) {
          // Up the walls to the rock over the explorer; once there, a drip and a circle, then the drop.
          m.goal.x = ctx.player.x;
          m.goal.y = ctx.player.y + 12;
          m.goal.z = ctx.player.z;
          away = false;
          const fd = this.flatDist(m, ctx);
          if (m.up.y < -0.6 && fd < 2.2 && m.position.y - ctx.player.y > 2.4 && m.cooldown <= 0 && this.clock >= token && m.stateTime > 0.8 && this.seesPlayer(m, ctx)) {
            m.mode = 'ceiling';
            m.ambush = false;
            m.setState('windup');
            m.landed = false;
            m.vel.y = 0;
            this.packNext.set(m.group, this.clock + 2.5);
            this.addMarker(m, 'disc', m.position.x, this.floorY(m.position.x, m.position.y, m.position.z), m.position.z, 1.3);
            this.telegraph(m);
            this.sfx(m, 'mob.drip');
            return;
          }
          break;
        }
        const bold = !l.lit ? 2.2 : l.flame < MOBS_RULES.dimFlame ? 1.6 : 1;
        // It strikes from the dark now and then, and at once when the explorer comes close (still telegraphed).
        const cornered = dp < 3.4 && m.stateTime > 0.5;
        if (m.cooldown <= 0 && this.clock >= token && dp < 9 + bold * 2 && m.stateTime > (cornered ? 0.5 : 1.2) && (cornered || this.rng.next() < dt * 0.55 * bold) && this.seesPlayer(m, ctx)) {
          m.setState('windup');
          m.landed = false;
          this.packNext.set(m.group, this.clock + 2.2 + this.rng.range(0, 1.5));
          this.emit({ type: 'telegraph', mob: m });
          this.emit({ type: 'cue', mob: m, cue: 'chitter' });
        }
        break;
      }
      case 'windup':
        speed = 0;
        if (m.stateTime >= this.windupOf(m)) m.setState('attack');
        break;
      case 'attack': {
        speed = m.def.speed * 2.3;
        m.goal.x = ctx.player.x;
        m.goal.y = ctx.player.y + 1.0;
        m.goal.z = ctx.player.z;
        if (!m.landed && dp <= m.def.reach) {
          m.landed = true;
          this.strikePlayer(m, m.def.damage);
          m.cooldown = m.def.cooldown;
          this.recoil(m, 1.6);
        } else if (m.stateTime > 2.6 || (l.raised && dl < bright)) {
          if (!m.landed) this.emit({ type: 'attack', mob: m, damage: 0, landed: false });
          m.cooldown = m.def.cooldown * 0.6;
          this.recoil(m);
        }
        break;
      }
      case 'recoil':
      case 'flee':
        speed = m.def.speed * 1.6;
        away = true;
        m.goal.x = ctx.player.x;
        m.goal.y = ctx.player.y + 1;
        m.goal.z = ctx.player.z;
        if (m.stateTime >= m.timer) m.setState('lurk');
        break;
      default:
        m.setState('lurk');
    }
    // An ambusher is bolder: the lantern's pool only half keeps it off.
    this.crawlMove(m, dt, speed, away, m.state === 'attack' ? 0 : m.ambush ? bright * 0.4 : bright, ctx);
  }

  /** A crawler's ceiling ambush: the drip and the circle (its wind-up), then it drops on the spot and fights on the floor. */
  ceilingDrop(m: SimMob, dt: number, ctx: MobContext): void {
    if (m.state === 'windup') {
      const k = Math.min(1, m.stateTime / (this.windupOf(m) + 0.25));
      m.strike = k;
      const mk = this.marker(m);
      if (mk) mk.progress = k;
      if (k >= 1) {
        m.setState('attack');
        m.vel.y = 0;
      }
      return;
    }
    if (m.state !== 'attack') {
      m.mode = '';
      return;
    }
    const floor = this.floorY(m.position.x, m.position.y, m.position.z);
    m.vel.y -= 24 * dt;
    m.position.y += m.vel.y * dt;
    // It turns over as it falls (it lands on its feet).
    m.up.lerp(tmpUp, Math.min(1, dt * 8)).normalize();
    const ground = floor + m.def.lift * m.scale;
    if (m.position.y > ground) return;
    m.position.y = ground;
    this.areaStrike(m, m.position.x, floor, m.position.z, 1.3, m.def.damage, false);
    this.emit({ type: 'burst', x: m.position.x, y: floor + 0.2, z: m.position.z, color: m.def.mote, size: 0.6 });
    this.sfx(m, 'mob.thud');
    this.dropMarker(m);
    m.mode = '';
    const c = this.nearestCling(Math.floor(m.position.x), floor, Math.floor(m.position.z));
    if (c) {
      m.cell.x = m.next.x = c.x;
      m.cell.y = m.next.y = c.y;
      m.cell.z = m.next.z = c.z;
    }
    m.cooldown = m.def.cooldown;
    this.recoil(m, 1.4);
    void ctx;
  }

  recoil(m: SimMob, seconds = 2.4): void {
    m.setState('recoil');
    m.timer = seconds;
    this.emit({ type: 'recoil', mob: m });
  }

  /** Step a crawler along the rock toward (or away from) its goal, avoiding the lantern's pool. */
  crawlMove(m: SimMob, dt: number, speed: number, away: boolean, bright: number, ctx: MobContext): void {
    const s = this.env.solid;
    // The rock it clung to was mined away (or its next cell filled): back onto the nearest face.
    if (!clingable(s, m.next.x, m.next.y, m.next.z)) {
      const c = this.nearestCling(m.next.x, m.next.y, m.next.z);
      if (c) {
        m.next.x = c.x;
        m.next.y = c.y;
        m.next.z = c.z;
      }
    }
    this.crawlAnchor(m, m.next, tmpB);
    const dx = tmpB.x - m.position.x;
    const dy = tmpB.y - m.position.y;
    const dz = tmpB.z - m.position.z;
    const d = Math.hypot(dx, dy, dz);
    const step = speed * m.pace * dt * m.scale ** 0.3;
    if (d <= Math.max(0.04, step)) {
      m.position.set(tmpB.x, tmpB.y, tmpB.z);
      m.cell.x = m.next.x;
      m.cell.y = m.next.y;
      m.cell.z = m.next.z;
      if (speed > 0) {
        const l = ctx.lantern;
        const camp = this.env;
        const brave = this.brave(m);
        // Far from the explorer and coming for it: the flow field steers it round the rock.
        const flow = !away && this.flow.ready && hunting(m) && this.distToPlayer(m, ctx) > 7 ? this.flow : null;
        const here = flow ? flow.distAt(m.cell.x, m.cell.y, m.cell.z) : 0;
        const cost = (x: number, y: number, z: number) => {
          let c = 0;
          if (flow) {
            const fd = flow.distAt(x, y, z);
            c += fd === 255 ? 6 : (fd - here) * 2;
          }
          if (bright > 0) {
            const dd = Math.hypot(x + 0.5 - l.x, y + 0.5 - l.y, z + 0.5 - l.z);
            if (dd < bright) c += (bright - dd) * 1.5;
          }
          // Placed light (torches, lamps, crystals): swarmers keep to its edge (a radiant leader's are bolder).
          if (!brave && camp.light(x, y, z) > MOBS_RULES.torchFear) c += 40;
          if (camp.inCamp(x + 0.5, y, z + 0.5)) c += 100;
          return c;
        };
        if (!crawlNext(s, m.cell, m.goal, m.next, cost, () => this.rng.next(), away)) {
          m.next.x = m.cell.x;
          m.next.y = m.cell.y;
          m.next.z = m.cell.z;
        }
      }
      m.speedNow += (0 - m.speedNow) * Math.min(1, dt * 8);
    } else {
      const k = step / d;
      m.position.x += dx * k;
      m.position.y += dy * k;
      m.position.z += dz * k;
      m.speedNow += (speed - m.speedNow) * Math.min(1, dt * 8);
      // Facing: along the move, in the plane of the rock.
      if (Math.abs(dx) + Math.abs(dz) > 1e-4) m.yaw = dampAngle(m.yaw, Math.atan2(dx, dz), 10, dt);
    }
    surfaceNormal(s, m.cell.x, m.cell.y, m.cell.z, tmpN);
    const n = m.up;
    const kk = Math.min(1, dt * 7);
    n.set(n.x + (tmpN.x - n.x) * kk, n.y + (tmpN.y - n.y) * kk, n.z + (tmpN.z - n.z) * kk).normalize();
    m.gait += m.speedNow * dt * 5.5;
  }

  /** The Gnasher: a boulder that breathes; it opens its ring of crystal teeth when you come close. */
  gnasher(m: SimMob, dt: number, ctx: MobContext): void {
    const dp = this.flatDist(m, ctx);
    const vdy = Math.abs(ctx.player.y - m.foot.y);
    switch (m.state) {
      case 'sleep':
        m.open += (0 - m.open) * Math.min(1, dt * 4);
        m.timer -= dt;
        if (m.timer <= 0 && dp < 10) {
          m.timer = 3.5 + this.rng.range(0, 2.5);
          this.emit({ type: 'cue', mob: m, cue: 'breath' });
        }
        if (dp < 3.3 && vdy < 2.5 && m.cooldown <= 0 && this.seesPlayer(m, ctx)) {
          this.announce(m, ctx);
          m.setState('windup');
          m.landed = false;
          this.emit({ type: 'telegraph', mob: m });
        }
        break;
      case 'windup':
        m.open = Math.min(1, m.stateTime / this.windupOf(m)) * 0.75;
        this.face(m, ctx, dt, 6);
        if (m.stateTime >= this.windupOf(m)) m.setState('attack');
        break;
      case 'attack':
        m.open = 1;
        this.face(m, ctx, dt, 6);
        // A short lunge, then the snap.
        if (m.stateTime < 0.25) this.walkToward(m, ctx.player.x, ctx.player.z, 3.2, dt);
        if (!m.landed && m.stateTime >= 0.18) {
          m.landed = true;
          const hitIt = this.flatDist(m, ctx) <= m.def.reach && vdy < 2.2;
          this.blow(m, hitIt);
        }
        if (m.stateTime >= 0.4) {
          // Teeth out: the moment to strike it.
          m.setState('recoil');
          m.timer = 1.8;
          m.cooldown = m.def.cooldown;
        }
        break;
      case 'recoil':
        m.open += (0.85 - m.open) * Math.min(1, dt * 6);
        if (m.stateTime >= m.timer) m.setState('sleep');
        break;
      case 'flee':
        // Stunned by a flash: shut tight.
        m.open += (0 - m.open) * Math.min(1, dt * 10);
        if (m.stateTime >= m.timer) m.setState('sleep');
        break;
      default:
        m.setState('sleep');
    }
    this.walkerSettle(m, dt);
  }

  /** The Shade Wisp: drifting smoke that comes for the flame; it drinks the oil and dims the light. */
  wisp(m: SimMob, dt: number, ctx: MobContext): void {
    const l = ctx.lantern;
    const dl = Math.hypot(m.position.x - l.x, m.position.y - l.y, m.position.z - l.z);
    this.announce(m, ctx);
    let tx = m.home.x + Math.sin(this.clock * 0.3 + m.seed * 9) * 3;
    let ty = m.home.y + Math.sin(this.clock * 0.5 + m.seed * 4) * 0.8;
    let tz = m.home.z + Math.cos(this.clock * 0.27 + m.seed * 7) * 3;
    let speed = m.def.speed * 0.6;
    // A raised flame burns it away.
    if (l.raised && dl < this.brightRadius(ctx)) {
      if (m.state !== 'recoil') this.recoil(m, 2.5);
      if (m.hp !== undefined) {
        m.hp -= dt * 2.2;
        m.flash = Math.max(m.flash, 0.35);
        if (m.hp <= 0) return this.kill(m);
      }
    }
    switch (m.state) {
      case 'wander':
      case 'idle':
        if (dl < 15 && l.lit && this.seesPlayer(m, ctx)) m.setState('stalk');
        break;
      case 'stalk': {
        speed = m.def.speed;
        const a = this.clock * 0.6 + m.seed * 6;
        tx = l.x + Math.sin(a) * 1.6;
        ty = l.y + 0.6;
        tz = l.z + Math.cos(a) * 1.6;
        if (dl < m.def.reach) {
          m.setState('attack');
          this.emit({ type: 'telegraph', mob: m });
        }
        if (dl > 22) m.setState('wander');
        break;
      }
      case 'attack': {
        // Feeding: it wraps the lantern, the flame gutters and the oil drains (a slow whisper).
        speed = m.def.speed * 0.8;
        const a = this.clock * 1.1 + m.seed * 6;
        tx = l.x + Math.sin(a) * 1.1;
        ty = l.y + 0.35 + Math.sin(a * 1.3) * 0.25;
        tz = l.z + Math.cos(a) * 1.1;
        if (l.lit) this.emit({ type: 'drain', mob: m, seconds: MOBS_RULES.wispDrain * dt });
        m.timer -= dt;
        if (m.timer <= 0) {
          m.timer = 2.2;
          this.emit({ type: 'cue', mob: m, cue: 'whisper' });
        }
        if (dl > m.def.reach * 1.8) m.setState('stalk');
        break;
      }
      case 'recoil':
      case 'flee':
        speed = m.def.speed * 2;
        tx = m.position.x + (m.position.x - l.x) * 2;
        ty = m.position.y + 0.5;
        tz = m.position.z + (m.position.z - l.z) * 2;
        if (m.stateTime >= m.timer) m.setState('stalk');
        break;
      default:
        m.setState('wander');
    }
    this.flyToward(m, tx, ty, tz, speed, dt, 1.2);
  }

  /** The Hollow Stalker: tall and thin at the edge of the light; it comes only when the flame is dim. */
  stalker(m: SimMob, dt: number, ctx: MobContext): void {
    const l = ctx.lantern;
    const flame = l.lit ? l.flame : 0;
    const full = (flame >= MOBS_RULES.fullFlame || l.raised) && l.lit;
    const dim = flame < MOBS_RULES.dimFlame && !l.raised;
    const dp = this.flatDist(m, ctx);
    const bright = this.brightRadius(ctx);
    this.announce(m, ctx);
    switch (m.state) {
      case 'lurk':
        this.face(m, ctx, dt, 2);
        m.alert += (0.4 - m.alert) * Math.min(1, dt * 2);
        if (full && dp < bright + 2) this.flee(m, 7);
        else if (dim && m.stateTime > 1.5) m.setState('stalk');
        else if (l.raised) this.flee(m, 7);
        break;
      case 'stalk':
        this.face(m, ctx, dt, 3);
        m.alert += (1 - m.alert) * Math.min(1, dt * 2);
        if (full) {
          this.flee(m, 7);
          break;
        }
        if (!dim) {
          m.setState('lurk');
          break;
        }
        this.walkToward(m, ctx.player.x, ctx.player.z, m.def.speed, dt);
        m.timer -= dt;
        if (m.timer <= 0) {
          m.timer = 4;
          this.emit({ type: 'cue', mob: m, cue: 'drone' });
        }
        if (dp <= m.def.reach) {
          m.setState('windup');
          m.landed = false;
          this.emit({ type: 'telegraph', mob: m });
        }
        break;
      case 'windup':
        this.face(m, ctx, dt, 4);
        m.strike = Math.min(1, m.stateTime / this.windupOf(m));
        if (full) {
          m.strike = 0;
          this.flee(m, 7);
          break;
        }
        if (m.stateTime >= this.windupOf(m)) m.setState('attack');
        break;
      case 'attack':
        m.strike = 1 - Math.min(1, m.stateTime / 0.35);
        if (!m.landed) {
          m.landed = true;
          const hitIt = this.flatDist(m, ctx) <= m.def.reach + 0.4;
          this.blow(m, hitIt);
        }
        if (m.stateTime >= 0.5) {
          m.cooldown = m.def.cooldown;
          this.flee(m, 3.5);
        }
        break;
      case 'flee':
      case 'recoil': {
        m.alert += (1 - m.alert) * Math.min(1, dt * 3);
        const ax = m.foot.x + (m.foot.x - ctx.player.x);
        const az = m.foot.z + (m.foot.z - ctx.player.z);
        const blocked = this.walkToward(m, ax, az, m.def.speed * 2.6, dt, true);
        m.stuck = blocked ? m.stuck + dt : 0;
        // Gone into the dark for good once far or out of sight.
        if (m.stateTime >= m.timer || dp > 22 || m.stuck > 1.5) {
          if (m.state === 'flee' && m.timer > 5) this.remove(m);
          else m.setState(m.cooldown > 0 ? 'lurk' : 'stalk');
        }
        break;
      }
      default:
        m.setState('lurk');
    }
    if (m.state !== 'stalk' && m.state !== 'flee' && m.state !== 'recoil') this.walkerSettle(m, dt);
  }

  flee(m: SimMob, seconds: number): void {
    if (m.state === 'flee') return;
    m.setState('flee');
    m.timer = seconds;
    this.emit({ type: 'recoil', mob: m });
  }

  /** The Stone Sentinel: a Halden automaton; slow sweeps, then its core opens. */
  sentinel(m: SimMob, dt: number, ctx: MobContext): void {
    const dp = this.flatDist(m, ctx);
    const dHome = Math.hypot(ctx.player.x - m.home.x, ctx.player.z - m.home.z);
    switch (m.state) {
      case 'sleep':
        m.glow += (0.12 - m.glow) * Math.min(1, dt * 2);
        m.open += (0 - m.open) * Math.min(1, dt * 2);
        // A Sentinel of the rosters (no relic to guard) keeps its post: it wakes when the explorer comes near.
        if (!m.relic && dp < 6.5 && Math.abs(ctx.player.y - m.foot.y) < 3 && this.seesPlayer(m, ctx)) m.setState('wake');
        return this.walkerSettle(m, dt);
      case 'wake':
        m.glow = Math.min(1, m.stateTime / 2);
        if (m.stateTime < dt * 1.5) {
          this.emit({ type: 'wake', mob: m });
          this.emit({ type: 'cue', mob: m, cue: 'grind' });
        }
        this.face(m, ctx, dt, 1.5);
        if (m.stateTime >= 2.2) {
          this.announce(m, ctx);
          m.setState('stalk');
        }
        return this.walkerSettle(m, dt);
      case 'stalk':
        m.glow += (0.7 - m.glow) * Math.min(1, dt * 3);
        m.open += (0 - m.open) * Math.min(1, dt * 4);
        this.face(m, ctx, dt, 1.8);
        if (dHome > 30) {
          // Leashed to its relic's hall: it walks back.
          this.walkToward(m, m.home.x, m.home.z, m.def.speed, dt);
          return;
        }
        if (dp > m.def.reach * 0.85) this.walkToward(m, ctx.player.x, ctx.player.z, m.def.speed, dt);
        else this.walkerSettle(m, dt);
        if (dp <= m.def.reach && m.cooldown <= 0) {
          m.setState('windup');
          m.landed = false;
          this.emit({ type: 'telegraph', mob: m });
          this.emit({ type: 'cue', mob: m, cue: 'grind' });
        }
        return;
      case 'windup':
        // The sweep is raised slowly: plenty of time to step back.
        m.strike = Math.min(1, m.stateTime / this.windupOf(m));
        this.face(m, ctx, dt, 1.2);
        if (m.stateTime >= this.windupOf(m)) m.setState('attack');
        return this.walkerSettle(m, dt);
      case 'attack': {
        m.strike = 1 - Math.min(1, m.stateTime / 0.45);
        if (!m.landed && m.stateTime >= 0.2) {
          m.landed = true;
          const fx = Math.sin(m.yaw);
          const fz = Math.cos(m.yaw);
          const px = ctx.player.x - m.foot.x;
          const pz = ctx.player.z - m.foot.z;
          const front = (px * fx + pz * fz) / Math.max(0.01, Math.hypot(px, pz)) > Math.cos(1.25);
          const hitIt = front && dp <= m.def.reach + 0.3 && Math.abs(ctx.player.y - m.foot.y) < 2.5;
          this.blow(m, hitIt);
        }
        if (m.stateTime >= 0.55) {
          // The core opens between sweeps: strike it now.
          m.setState('recoil');
          m.timer = 2.2;
          m.cooldown = m.def.cooldown;
        }
        return this.walkerSettle(m, dt);
      }
      case 'recoil':
        m.open += (1 - m.open) * Math.min(1, dt * 6);
        m.glow += (1 - m.glow) * Math.min(1, dt * 6);
        m.strike = 0;
        if (m.stateTime >= m.timer) m.setState('stalk');
        return this.walkerSettle(m, dt);
      case 'flee':
        // Stunned by a flash.
        m.open += (1 - m.open) * Math.min(1, dt * 6);
        if (m.stateTime >= m.timer) m.setState('stalk');
        return this.walkerSettle(m, dt);
      default:
        m.setState('stalk');
    }
  }

  /** Wake the Sentinel guarding `relic` (its relic was taken). @returns whether one woke. */
  wakeSentinel(relic: string): boolean {
    for (const m of this.mobs) {
      if (m.kind !== 'sentinel' || m.relic !== relic || m.dying) continue;
      if (m.state === 'sleep') {
        m.setState('wake');
        return true;
      }
      return false;
    }
    // Not spawned yet (the explorer took the relic from afar): it wakes where it stands.
    const site = this.sentinelSites.find((s) => s.relic === relic);
    if (!site || this.sentinelDone.has(relic)) return false;
    const m = this.spawn('sentinel', site.x, site.y, site.z, { relic, asleep: false });
    return m !== null;
  }

  /** The Deep Worm: a glimpse of something vast passing through a far chasm. */
  worm(m: SimMob, dt: number): void {
    const p = m.path;
    if (!p) return this.remove(m);
    p.t += (m.def.speed * dt) / p.len;
    wormPoint(p, p.t, m.position);
    const ahead = new THREE.Vector3();
    wormPoint(p, p.t + 0.01, ahead);
    m.yaw = Math.atan2(ahead.x - m.position.x, ahead.z - m.position.z);
    m.timer -= dt;
    if (m.timer <= 0) {
      m.timer = 3.2;
      this.emit({ type: 'cue', mob: m, cue: 'groan' });
    }
    if (this.ctx) this.announce(m, this.ctx);
    // The whole body (about 30 m) has passed.
    if (p.t > 1 + 34 / p.len) {
      this.mobs.splice(this.mobs.indexOf(m), 1);
      this.emit({ type: 'gone', mob: m });
    }
  }

  /** Start a pass of the Deep Worm across `at`, crossing the explorer's view. */
  spawnWorm(at: V3, ctx: MobContext): SimMob | null {
    if (this.count(undefined, 'worm') > 0) return null;
    const vx = at.x - ctx.eye.x;
    const vz = at.z - ctx.eye.z;
    const l = Math.max(0.01, Math.hypot(vx, vz));
    // Across the line of sight.
    const sx = -vz / l;
    const sz = vx / l;
    const half = 26;
    const m = new SimMob('worm', this.rng.next());
    m.path = { ax: at.x - sx * half, ay: at.y - 3, az: at.z - sz * half, bx: at.x + sx * half, by: at.y + 2, bz: at.z + sz * half, t: -0.05, len: half * 2, amp: 4 + this.rng.range(0, 3) };
    wormPoint(m.path, m.path.t, m.position);
    m.setState('wander');
    m.tappable = false;
    m.fade = 1;
    this.mobs.push(m);
    this.lastWorm = this.clock;
    this.emit({ type: 'spawn', mob: m });
    return m;
  }

  wormDirector(ctx: MobContext): void {
    if (this.clock - this.lastWorm < MOBS_RULES.wormGap || ctx.depth < this.monsterDepth + 15) return;
    if (this.rng.next() > 0.004) return;
    // A far vista: open air 26-46 m out along the view (or a known anchor in sight).
    const s = this.env.solid;
    for (const a of this.wormAnchors) {
      const d = Math.hypot(a.x - ctx.eye.x, a.y - ctx.eye.y, a.z - ctx.eye.z);
      if (d > 24 && d < 70 && clearLine(s, ctx.eye, a)) {
        this.spawnWorm(a, ctx);
        return;
      }
    }
  }

  /** Lumen moths: drawn to the lantern, they circle it a while, then drift off. */
  moth(m: SimMob, dt: number, ctx: MobContext): void {
    const l = ctx.lantern;
    const dl = Math.hypot(m.position.x - l.x, m.position.y - l.y, m.position.z - l.z);
    let tx: number;
    let ty: number;
    let tz: number;
    let speed = m.def.speed;
    if (m.state === 'flee') {
      // A migration: drifting along its way, a wide flutter.
      tx = m.position.x + m.goal.x * 3;
      ty = m.position.y + m.goal.y * 3 + Math.sin(this.clock * 1.3 + m.seed * 9) * 0.6;
      tz = m.position.z + m.goal.z * 3;
      if (m.stateTime > m.timer) this.remove(m);
    } else if (m.state === 'follow') {
      const a = this.clock * (1.8 + m.seed) + m.seed * 6.28;
      const r = 0.45 + m.seed * 0.45;
      tx = l.x + Math.sin(a) * r;
      ty = l.y + 0.15 + Math.sin(a * 1.7) * 0.3;
      tz = l.z + Math.cos(a) * r;
      speed = 3.2;
      if (!l.lit || l.flame < 0.25 || m.stateTime > 30 + m.seed * 25) {
        m.setState('wander');
        m.timer = 1;
      }
    } else {
      tx = m.home.x + Math.sin(this.clock * 0.7 + m.seed * 9) * 1.4;
      ty = m.home.y + Math.sin(this.clock * 0.9 + m.seed * 5) * 0.5;
      tz = m.home.z + Math.cos(this.clock * 0.6 + m.seed * 7) * 1.4;
      if (m.state === 'wander' && m.stateTime > 12) this.remove(m);
      else if (m.state === 'idle' && l.lit && l.flame > 0.3 && dl < 11) m.setState('follow');
    }
    this.flyToward(m, tx, ty, tz, speed, dt, 6);
    m.gait += dt * (18 + m.seed * 10);
  }

  /** Lamplings: lantern-bodied sprites; they follow and light the way for a while, then go home. */
  lampling(m: SimMob, dt: number, ctx: MobContext): void {
    const l = ctx.lantern;
    const dp = this.distToPlayer(m, ctx);
    let tx = m.home.x + Math.sin(this.clock * 0.9 + m.seed * 9) * 0.7;
    let ty = m.home.y + Math.sin(this.clock * 1.4 + m.seed * 5) * 0.25;
    let tz = m.home.z + Math.cos(this.clock * 0.8 + m.seed * 7) * 0.7;
    let speed = 1.2;
    switch (m.state) {
      case 'idle':
        if (dp < 8 && l.lit && m.cooldown <= 0) {
          this.announce(m, ctx);
          m.setState('follow');
          this.emit({ type: 'cue', mob: m, cue: 'chime' });
        }
        break;
      case 'follow': {
        // Ahead of the explorer along the view, a little to the side, at about head height.
        const fx = ctx.eye.x - ctx.player.x;
        const yaw = Math.atan2(ctx.player.vx, ctx.player.vz);
        const moving = Math.hypot(ctx.player.vx, ctx.player.vz) > 0.4;
        const side = (m.seed - 0.5) * 2.6;
        const ahead = moving ? 2.6 : 1.8;
        const dirx = moving ? Math.sin(yaw) : Math.sin(this.clock * 0.2 + m.seed * 6);
        const dirz = moving ? Math.cos(yaw) : Math.cos(this.clock * 0.2 + m.seed * 6);
        tx = ctx.player.x + dirx * ahead + dirz * side + fx * 0;
        ty = ctx.player.y + 1.9 + Math.sin(this.clock * 2 + m.seed * 4) * 0.2;
        tz = ctx.player.z + dirz * ahead - dirx * side;
        speed = 4.2;
        if (m.stateTime > MOBS_RULES.lamplingFollow || dp > 26) {
          m.setState('flee');
          m.cooldown = 120;
        }
        break;
      }
      case 'flee':
        // Home to the nest.
        speed = 2.4;
        if (Math.hypot(m.position.x - m.home.x, m.position.y - m.home.y, m.position.z - m.home.z) < 1) m.setState('idle');
        if (m.stateTime > 25) this.remove(m);
        break;
      default:
        m.setState('idle');
    }
    this.flyToward(m, tx, ty, tz, speed, dt, 3);
  }

  /** The Glimmerkin: a crystal-backed scurrier; it flees a hurried approach, then stops to look. */
  glimmerkin(m: SimMob, dt: number, ctx: MobContext): void {
    const dp = this.flatDist(m, ctx);
    const pspeed = Math.hypot(ctx.player.vx, ctx.player.vz);
    switch (m.state) {
      case 'idle':
      case 'wander': {
        if (m.state === 'idle') this.face(m, ctx, dt, 3);
        else this.walkToward(m, m.goal.x, m.goal.z, m.def.speed * 0.4, dt);
        if (m.stateTime > 2 + m.seed * 3) {
          if (m.state === 'idle') {
            m.setState('wander');
            m.goal.x = m.home.x + this.rng.range(-4, 4);
            m.goal.z = m.home.z + this.rng.range(-4, 4);
          } else m.setState('idle');
        }
        if (dp < 9) this.announce(m, ctx);
        if (dp < 4.5 && pspeed > 2.2 && m.cooldown <= 0) {
          m.setState('flee');
          m.timer = 1.6 + this.rng.range(0, 1.2);
          this.emit({ type: 'cue', mob: m, cue: 'chirp' });
        }
        if (m.state !== 'idle') break;
        return this.walkerSettle(m, dt);
      }
      case 'flee': {
        const ax = m.foot.x + (m.foot.x - ctx.player.x) * 3;
        const az = m.foot.z + (m.foot.z - ctx.player.z) * 3;
        // Chased, it keeps running but tires; out of breath, it stops, panting: the moment to catch it.
        const tire = this.tire(m, dt, ctx);
        this.walkToward(m, ax, az, m.def.speed * (1 - tire), dt, true);
        if (m.run > MOBS_RULES.chaseTire) {
          m.run = 0;
          m.setState('idle');
          m.cooldown = 3;
          this.emit({ type: 'cue', mob: m, cue: 'chirp' });
        } else if (m.stateTime >= m.timer && !this.chasing(m, ctx)) {
          // It stops to look back: the moment to catch it.
          m.setState('idle');
          m.cooldown = 2.5;
        }
        break;
      }
      case 'caught':
        m.open = Math.min(1, m.stateTime / 0.4);
        if (m.stateTime > 0.9) this.remove(m);
        return this.walkerSettle(m, dt);
      default:
        m.setState('idle');
    }
  }

  /** The Shellback: a big, gentle geode-shelled snail; its crystals regrow. */
  shellback(m: SimMob, dt: number, ctx: MobContext): void {
    if (this.distToPlayer(m, ctx) < 10) this.announce(m, ctx);
    m.timer += dt;
    if (m.crystals < 4 && m.timer >= MOBS_RULES.shellRegrow) {
      m.timer = 0;
      m.crystals++;
      m.tappable = true;
      m.rarity = 'rare';
    }
    if (m.state === 'harvested') {
      m.open += (1 - m.open) * Math.min(1, dt * 5);
      if (m.stateTime > 1.6) m.setState('wander');
      return this.walkerSettle(m, dt);
    }
    m.open += (0 - m.open) * Math.min(1, dt * 1.5);
    if (m.state !== 'wander' || m.stateTime > 14) {
      m.setState('wander');
      m.goal.x = m.home.x + this.rng.range(-5, 5);
      m.goal.z = m.home.z + this.rng.range(-5, 5);
    }
    // It turns its eyestalks to the explorer, and edges aside if walked into.
    if (this.flatDist(m, ctx) < 1.6) this.walkToward(m, m.foot.x + (m.foot.x - ctx.player.x), m.foot.z + (m.foot.z - ctx.player.z), m.def.speed * 2, dt);
    else if (this.walkToward(m, m.goal.x, m.goal.z, m.def.speed, dt)) m.stateTime = 99;
  }

  /** The Drift Jelly: a glowing jelly that floats in the big caverns; a tap gives light spores. */
  jelly(m: SimMob, dt: number, ctx: MobContext): void {
    const dp = this.distToPlayer(m, ctx);
    if (dp < 14) this.announce(m, ctx);
    if (m.cooldown <= 0 && !m.tappable) {
      m.tappable = true;
      m.rarity = 'uncommon';
    }
    let tx = m.home.x + Math.sin(this.clock * 0.13 + m.seed * 9) * 4;
    let ty = m.home.y + Math.sin(this.clock * 0.21 + m.seed * 3) * 0.8;
    let tz = m.home.z + Math.cos(this.clock * 0.11 + m.seed * 7) * 4;
    if (m.tappable && dp < 9 && ctx.lantern.lit) {
      // Curious: it drifts down toward the flame, within a tap's reach.
      tx = ctx.eye.x + (m.position.x - ctx.eye.x) * 0.6;
      ty = ctx.eye.y + 0.7;
      tz = ctx.eye.z + (m.position.z - ctx.eye.z) * 0.6;
      if (Math.hypot(tx - ctx.eye.x, tz - ctx.eye.z) < 1.8) {
        const a = Math.atan2(m.position.x - ctx.eye.x, m.position.z - ctx.eye.z);
        tx = ctx.eye.x + Math.sin(a) * 2;
        tz = ctx.eye.z + Math.cos(a) * 2;
      }
    }
    if (m.state === 'flee') ty = m.home.y + 3;
    if (m.state === 'flee' && m.stateTime > 6) m.setState('idle');
    this.flyToward(m, tx, ty, tz, m.def.speed, dt, 0.8);
    m.gait += dt * (1.1 + m.seed * 0.4);
  }

  /** The Burrower: a cheeky ore thief; it pops up, taunts, runs, and digs away if not caught. */
  burrower(m: SimMob, dt: number, ctx: MobContext): void {
    const dp = this.flatDist(m, ctx);
    switch (m.state) {
      case 'wake':
        m.open = 1 - Math.min(1, m.stateTime / 0.8);
        this.face(m, ctx, dt, 6);
        if (m.stateTime >= 0.8) {
          this.announce(m, ctx);
          m.setState('idle');
          this.emit({ type: 'cue', mob: m, cue: 'squeak' });
        }
        return this.walkerSettle(m, dt);
      case 'idle':
        // A taunt: it shows its loot (out of breath, it cannot run off again at once).
        this.face(m, ctx, dt, 6);
        if ((m.stateTime > 0.9 + m.seed * 0.6 || dp < 2.5) && m.cooldown <= 0) {
          m.setState('flee');
          m.timer = 2.2 + this.rng.range(0, 1.6);
        }
        break;
      case 'flee': {
        const ax = m.foot.x + (m.foot.x - ctx.player.x) * 2 + Math.sin(this.clock * 3 + m.seed * 9) * 2;
        const az = m.foot.z + (m.foot.z - ctx.player.z) * 2 + Math.cos(this.clock * 3 + m.seed * 9) * 2;
        const tire = this.tire(m, dt, ctx);
        this.walkToward(m, ax, az, m.def.speed * (m.treasure ? 1.15 : 1) * (1 - tire), dt, true);
        if (m.run > MOBS_RULES.chaseTire) {
          // Caught up with: it stops, panting, its loot in its paws.
          m.run = 0;
          m.setState('idle');
          m.cooldown = 2.4;
          this.emit({ type: 'cue', mob: m, cue: 'squeak' });
          break;
        }
        if (m.stateTime >= m.timer) {
          const dig = this.clockOf(m) > 14;
          m.setState(dig ? 'sleep' : 'idle');
          if (!dig) this.emit({ type: 'cue', mob: m, cue: 'squeak' });
        }
        break;
      }
      case 'sleep':
        // Digging away.
        m.open = Math.min(1, m.stateTime / 0.9);
        if (m.stateTime > 0.9) this.remove(m);
        return this.walkerSettle(m, dt);
      case 'caught':
        if (m.stateTime > 0.6) {
          m.setState('sleep');
          m.tappable = false;
        }
        return this.walkerSettle(m, dt);
      default:
        m.setState('idle');
    }
    m.timer2 += dt;
  }

  clockOf(m: SimMob): number {
    return m.timer2;
  }

  /** The explorer runs at it (within 7 m, moving its way). */
  chasing(m: SimMob, ctx: MobContext): boolean {
    const vx = ctx.player.vx;
    const vz = ctx.player.vz;
    const v = Math.hypot(vx, vz);
    if (v < 1.5) return false;
    const dx = m.position.x - ctx.player.x;
    const dz = m.position.z - ctx.player.z;
    const d = Math.hypot(dx, dz);
    return d < 7 && (vx * dx + vz * dz) / (v * Math.max(0.01, d)) > 0.5;
  }

  /** A chased being's tiredness (0..0.55: how much slower), from its seconds of being chased (m.run). */
  tire(m: SimMob, dt: number, ctx: MobContext): number {
    m.run = this.chasing(m, ctx) ? m.run + dt : Math.max(0, m.run - dt * 0.5);
    return Math.min(0.55, m.run / 7);
  }

  // ------------------------------------------------------------------------------------
  // Locomotion helpers

  face(m: SimMob, ctx: MobContext, dt: number, rate: number): void {
    m.yaw = dampAngle(m.yaw, Math.atan2(ctx.player.x - m.position.x, ctx.player.z - m.position.z), rate, dt);
  }

  /** Walk the feet toward (x, z). @returns whether the way was blocked. */
  walkToward(m: SimMob, x: number, z: number, speed: number, dt: number, keepCampOut = true): boolean {
    speed *= m.pace;
    // Coming for the explorer but walled off (out of sight) or bumping rock: round it by the flow field.
    const ctx = this.ctx;
    if (m.hostile && ctx && this.flow.ready && hunting(m) && Math.hypot(x - ctx.player.x, z - ctx.player.z) < 10) {
      m.losIn -= dt;
      if (m.losIn <= 0) {
        m.losIn = 0.3;
        if (!this.seesPlayer(m, ctx)) m.detour = Math.max(m.detour, 0.6);
      }
      if (m.detour > 0 && this.flow.walkerStep(this.env.solid, m.foot, this.heightOf(m), tmpStep)) {
        x = tmpStep.x;
        z = tmpStep.z;
      }
    }
    m.detour = Math.max(0, m.detour - dt);
    const dx = x - m.foot.x;
    const dz = z - m.foot.z;
    const d = Math.hypot(dx, dz);
    let vx = 0;
    let vz = 0;
    if (d > 0.15) {
      vx = (dx / d) * speed * m.scale ** 0.5;
      vz = (dz / d) * speed * m.scale ** 0.5;
      m.yaw = dampAngle(m.yaw, Math.atan2(dx, dz), 5, dt);
    }
    if (keepCampOut && m.hostile && this.env.inCamp(m.foot.x + vx * 0.5, m.foot.y + 0.5, m.foot.z + vz * 0.5)) {
      vx = 0;
      vz = 0;
    }
    const bx = m.foot.x;
    const bz = m.foot.z;
    const blocked = walkStep(this.env.solid, m.foot, vx, vz, dt, this.heightOf(m), m.bounds.radius);
    if (blocked && m.hostile) m.detour = Math.max(m.detour, 1);
    const moved = Math.hypot(m.foot.x - bx, m.foot.z - bz) / Math.max(dt, 1e-4);
    m.speedNow += (moved - m.speedNow) * Math.min(1, dt * 10);
    m.gait += (moved * dt * (m.brain === 'lurk' ? 1.6 : m.brain === 'sentinel' ? 1.3 : 6)) / Math.max(0.5, m.def.radius * m.scale * 2.2) ** 0.6;
    this.placeWalker(m);
    return blocked;
  }

  flyToward(m: SimMob, tx: number, ty: number, tz: number, speed: number, dt: number, accel: number): void {
    speed *= m.pace;
    // A hunting flier whose way to the explorer is walled off follows the flow field round the rock.
    const ctx = this.ctx;
    if (m.hostile && !m.guardian && ctx && this.flow.ready && hunting(m) && Math.hypot(tx - ctx.player.x, tz - ctx.player.z) < 10) {
      m.losIn -= dt;
      if (m.losIn <= 0) {
        m.losIn = 0.3;
        tmpA.x = tx;
        tmpA.y = ty;
        tmpA.z = tz;
        m.detour = clearLine(this.env.solid, m.position, tmpA) ? 0 : 0.6;
      }
      if (m.detour > 0 && this.flow.airStep(this.env.solid, m.position, tmpAir)) {
        tx = tmpAir.x;
        ty = tmpAir.y;
        tz = tmpAir.z;
      }
      m.detour = Math.max(0, m.detour - dt);
    }
    const dx = tx - m.position.x;
    const dy = ty - m.position.y;
    const dz = tz - m.position.z;
    const d = Math.hypot(dx, dy, dz);
    const want = d > 0.05 ? Math.min(speed, d * 1.5) / d : 0;
    const k = Math.min(1, dt * accel);
    m.vel.x += (dx * want - m.vel.x) * k;
    m.vel.y += (dy * want - m.vel.y) * k;
    m.vel.z += (dz * want - m.vel.z) * k;
    flyStep(this.env.solid, m.position, m.vel, dt, m.bounds.radius);
    const sp = Math.hypot(m.vel.x, m.vel.z);
    if (sp > 0.05) m.yaw = dampAngle(m.yaw, Math.atan2(m.vel.x, m.vel.z), 3, dt);
    m.speedNow = Math.hypot(m.vel.x, m.vel.y, m.vel.z);
  }

  animate(m: SimMob, dt: number): void {
    m.hurt = Math.max(0, m.hurt - dt / 0.25);
    if (m.openLeft > 0) m.openLeft = Math.max(0, m.openLeft - dt);
    if (m.brain !== 'lurk' && m.brain !== 'sentinel' && !m.guardian && m.brain !== 'slam' && m.brain !== 'spit' && m.brain !== 'charge' && m.brain !== 'fuse') m.strike += ((m.state === 'windup' ? 1 : 0) - m.strike) * Math.min(1, dt * 10);
    m.alert += ((m.state === 'windup' || m.state === 'attack' ? 1 : m.state === 'stalk' ? 0.6 : 0.2) - m.alert) * Math.min(1, dt * 3);
  }

  // ------------------------------------------------------------------------------------
  // Combat and touch

  /** The nearest tappable mob along a ray, not behind rock. */
  pick(ray: MobRay): SimMob | null {
    const len = Math.hypot(ray.dx, ray.dy, ray.dz);
    if (len < 1e-9) return null;
    const dx = ray.dx / len;
    const dy = ray.dy / len;
    const dz = ray.dz / len;
    const maxD = ray.maxDist ?? 30;
    const slack = ray.slack ?? 0.25;
    let best: SimMob | null = null;
    let bestT = Infinity;
    // The companion never takes a tap meant for a creature behind it: it is picked only alone on the ray.
    let pet: SimMob | null = null;
    let petT = Infinity;
    for (const m of this.mobs) {
      if (!m.tappable || m.dying || m.fade < 0.3) continue;
      const r = m.bounds.radius + slack;
      const h = m.bounds.halfHeight;
      const t = rayCapsule(ray.ox, ray.oy, ray.oz, dx, dy, dz, m.position.x, m.position.y - h, m.position.z, m.position.y + h, r);
      if (t === null || t > maxD || t >= (m.tame ? petT : bestT)) continue;
      const hit = { x: ray.ox + dx * t, y: ray.oy + dy * t, z: ray.oz + dz * t };
      if (!clearLine(this.env.solid, { x: ray.ox, y: ray.oy, z: ray.oz }, hit)) continue;
      if (m.tame) {
        pet = m;
        petT = t;
      } else {
        best = m;
        bestT = t;
      }
    }
    return best ?? pet;
  }

  /** Metres from a point to a mob's capsule surface. */
  distanceTo(m: SimMob, x: number, y: number, z: number): number {
    const h = m.bounds.halfHeight;
    const cy = Math.max(m.position.y - h, Math.min(m.position.y + h, y));
    return Math.max(0, Math.hypot(x - m.position.x, y - cy, z - m.position.z) - m.bounds.radius);
  }

  hit(m: SimMob, dmg: number, strike: MobStrike = {}): MobHitResult {
    const miss: MobHitResult = { hit: false, killed: false, hitStop: 0 };
    if (m.dying || !this.mobs.includes(m)) return miss;
    if (m.family === 'being') return this.touch(m);
    if (m.brain === 'vista' || m.mode === 'under') return miss;
    let d = Math.max(0, dmg);
    let armoured = false;
    let weak = false;
    const light = strike.light === true;
    if (light && (m.brain === 'cling' || m.brain === 'drain')) d *= 1.5;
    if (this.known.has(m.kind)) d *= BESTIARY_BONUS;
    // An armoured elite: its plated front turns blows; its flanks, its back, its open guard do not.
    if (m.affixBits & 2 && !strike.blast && !m.vulnerable) {
      const from = strike.from ?? (this.ctx ? this.ctx.player : null);
      if (from) {
        const ax = from.x - m.position.x;
        const az = from.z - m.position.z;
        const al = Math.max(0.01, Math.hypot(ax, az));
        if ((ax * Math.sin(m.yaw) + az * Math.cos(m.yaw)) / al > Math.cos(ARMOUR_ARC)) {
          d *= ARMOUR_FRONT;
          armoured = true;
        } else weak = true;
      }
    }
    switch (m.brain) {
      case 'mimic':
        if (m.open < 0.5 && !strike.blast) {
          // Closed, it is a boulder (a chest, a flower bud): the blow glances off and wakes it.
          d *= m.def.armour;
          armoured = true;
          if (m.state === 'sleep') {
            m.setState('windup');
            m.landed = false;
            this.telegraph(m);
          }
        } else if (m.open >= 0.5) weak = true;
        break;
      case 'sentinel':
        // A relic's Sentinel sleeps until its relic is taken; one at a post wakes to the blow.
        if (m.state === 'sleep') {
          if (m.relic) return miss;
          m.setState('wake');
        }
        // Only the open core takes the full blow.
        if (m.state !== 'recoil' && m.state !== 'flee') {
          d *= m.def.armour;
          armoured = true;
        } else weak = true;
        break;
      case 'slam':
        if (!m.vulnerable && !strike.blast) {
          d *= m.def.armour;
          armoured = true;
        } else weak = true;
        break;
      case 'charge':
        if (m.state === 'stunned') {
          d *= MOBS_RULES.stunned;
          weak = true;
        } else if (m.state === 'windup' && !strike.blast && d >= (m.maxHp ?? m.def.hp) * MOBS_RULES.staggerFrac) {
          // Struck hard while it paws: the charge is broken (it shakes its head and backs off).
          this.dropMarker(m);
          m.strike = 0;
          m.cooldown = Math.max(m.cooldown, m.def.cooldown * 0.5);
          this.recoil(m, 0.8);
        }
        break;
      case 'guardian':
      case 'heart': {
        const r = guardianOnHit(this, m, d, strike);
        if (r === null) return miss;
        d = r.damage;
        armoured = r.armoured;
        weak = r.weak;
        break;
      }
    }
    m.hp = (m.hp ?? 1) - d;
    m.flash = weak ? 1 : armoured ? 0.45 : 0.85;
    const killed = m.hp <= 0;
    // The flinch (its body jolts away from the blow; a guardian barely), and the push's way.
    const from = strike.from ?? (this.ctx ? { x: this.ctx.player.x, y: this.ctx.player.y, z: this.ctx.player.z } : null);
    m.hurt = Math.max(m.hurt, (weak ? 1 : armoured ? 0.45 : 0.8) * (m.guardian ? 0.4 : 1));
    if (from) {
      const kx = m.position.x - from.x;
      const kz = m.position.z - from.z;
      const kl = Math.hypot(kx, kz);
      if (kl > 1e-3) {
        m.hurtDir.x = kx / kl;
        m.hurtDir.z = kz / kl;
      }
    }
    this.emit({ type: 'hit', mob: m, damage: d, killed, armoured, weak });
    // Knock-back: away from the blow, by the weapon's own knock (LOOP's config/weapons: the great axe
    // shoves, the machete nudges), less for the heavy ones and off a plate (none while it rushes). A
    // killing blow throws the body too.
    if (from && m.state !== 'attack') {
      const wk = strike.weapon ? WEAPON_KNOCK[strike.weapon] : undefined;
      const push = ((wk ?? MOBS_RULES.knock) * (strike.knock ?? 1) * (armoured ? 0.3 : 1) * (killed ? 1.3 : 1)) / m.def.mass;
      m.knock.x += m.hurtDir.x * push;
      m.knock.z += m.hurtDir.z * push;
    }
    if (killed) this.kill(m);
    else if (m.brain === 'cling' || (m.brain === 'drop' && m.mode === 'ground')) this.recoil(m, light ? 3 : 1.4);
    else if (m.brain === 'drain') this.recoil(m, 1.6);
    else if (m.brain === 'lurk') this.flee(m, 2.5);
    else if (m.brain === 'mimic' && !armoured && m.state === 'recoil') m.timer = Math.max(m.timer, m.stateTime + 0.6);
    else if (m.brain === 'drop' && m.mode === 'ceiling') {
      // Struck on its perch: it lets go at once.
      m.setState('attack');
      m.landed = false;
    } else if (m.brain === 'pack' && m.state !== 'attack') {
      m.setState('recoil');
      m.timer = 0.7;
    } else if (m.brain === 'dive' && m.state !== 'attack') {
      m.setState('recoil');
      m.timer = 0.8;
    } else if (m.brain === 'spit' && m.state === 'windup' && weak) m.setState('stalk');
    const heavy = killed || weak;
    return { hit: true, killed, hitStop: heavy ? MOBS_RULES.hitStopHeavy : MOBS_RULES.hitStop, weak, armoured, damage: d };
  }

  /** A bomb: every monster within `radius` takes `dmg` (half at the edge) and is thrown back. */
  blast(x: number, y: number, z: number, radius: number, dmg: number): number {
    let n = 0;
    const o = { x, y, z };
    for (const m of [...this.mobs]) {
      if (!m.hostile || m.dying || m.mode === 'under') continue;
      const dd = Math.hypot(m.position.x - x, m.position.y - y, m.position.z - z);
      if (dd > radius + m.bounds.radius) continue;
      n++;
      const k = 1 - 0.5 * Math.min(1, dd / Math.max(0.1, radius));
      this.hit(m, dmg * k, { blast: true, from: o, knock: 2 });
    }
    return n;
  }

  kill(m: SimMob): void {
    if (m.dying) return;
    m.hp = 0;
    m.setState('dying');
    m.tappable = false;
    m.killed = true;
    m.collapse = collapseOf(m);
    m.openLeft = 0;
    // (Reused for its landing thud.)
    m.landed = false;
    m.wasFalling = false;
    m.timer = 0.15;
    if (m.def.locomotion === 'crawl') m.vel.y = 0;
    this.dropMarker(m);
    if (m.brain === 'sentinel' && m.relic) this.sentinelDone.add(m.relic);
    if (m.guardian) this.guardiansDone.add(m.lair?.biome ?? m.biome);
    if (m.nest) {
      const nest = this.nests.find((n) => n.id === m.nest);
      if (nest) nest.kills++;
    }
    this.emit({ type: 'die', mob: m });
    // An exploder struck down: a lit fuse still bursts (it hurts the explorer too); an unlit one pops,
    // and its pop hurts only the monsters round it (a chain).
    if (m.brain === 'fuse') this.burst(m, m.fused && this.clock - m.fuseAt >= MOBS_RULES.fuseRipe);
    // A radiant elite bursts in light: the monsters round it recoil (MobDirector feeds the lantern).
    if (m.affixBits & 1) this.flash(m.position.x, m.position.y, m.position.z, 6, 0);
    // A splitting elite: two smaller ones climb out of it.
    if (m.affixBits & 8 && !m.split) this.splitOf(m);
  }

  /** A splitting elite's children: smaller, weaker, of its kind, round where it fell. */
  splitOf(m: SimMob): SimMob[] {
    const out: SimMob[] = [];
    for (let i = 0; i < SPLIT.count; i++) {
      const a = m.yaw + (i === 0 ? 1.4 : -1.4) + this.rng.range(-0.3, 0.3);
      const r = m.bounds.radius + 0.4;
      const fly = m.def.locomotion === 'fly';
      const c = this.spawn(m.kind, m.position.x + Math.sin(a) * r, fly ? m.position.y : m.foot.y || m.position.y, m.position.z + Math.cos(a) * r, { group: m.group, biome: m.biome });
      if (!c) continue;
      c.split = true;
      c.scale = m.scale / 1.12 * SPLIT.scale;
      c.bounds.radius = c.def.radius * c.scale;
      c.bounds.halfHeight = c.def.halfHeight * c.scale;
      if (c.def.locomotion === 'walk' || c.def.locomotion === 'still') this.placeWalker(c);
      c.maxHp = Math.max(1, Math.round(c.def.hp * SPLIT.hp));
      c.hp = c.maxHp;
      c.power = SPLIT.power;
      c.cooldown = 0.8 + i * 0.5;
      c.fade = 0.4;
      c.met = true;
      // Thrown clear of the body.
      c.knock.x = Math.sin(a) * 3;
      c.knock.z = Math.cos(a) * 3;
      out.push(c);
    }
    if (out.length) this.emit({ type: 'burst', x: m.position.x, y: m.position.y, z: m.position.z, color: 0xe070ff, size: 1 });
    return out;
  }

  /** An exploder's burst at its body. */
  burst(m: SimMob, full: boolean): void {
    const p = m.position;
    const r = (m.def.blast ?? 2.4) * (full ? 1 : 0.8);
    this.emit({ type: 'burst', x: p.x, y: p.y, z: p.z, color: m.def.mote, size: full ? 1.4 : 0.9 });
    this.emit({ type: 'sfx', name: full ? 'mob.boom' : 'mob.pop', x: p.x, y: p.y, z: p.z, mob: m });
    if (full) this.areaStrike(m, p.x, p.y, p.z, r, m.def.damage, false);
    for (const o of [...this.mobs]) {
      if (o === m || !o.hostile || o.dying || o.guardian || o.mode === 'under') continue;
      const dd = o.position.distanceTo(p);
      if (dd > r + o.bounds.radius) continue;
      // A chain: other exploders light at once (each told: its hiss, its swell, its circle on the floor;
      // never quicker than any blow's floor of 0.6 s here, so a chain can be run from).
      if (o.brain === 'fuse' && !o.fused) {
        o.fused = true;
        o.fuseAt = this.clock;
        o.setState('windup');
        o.timer = 0.6 + this.rng.range(0, 0.25);
        this.telegraph(o);
      } else this.hit(o, m.def.damage * (full ? 0.6 : 0.4), { blast: true, from: p, knock: 1.5 });
    }
  }

  /** A tap on a being (within reach of the eye): catch, harvest, spores, a pat. */
  touch(m: SimMob): MobHitResult {
    const miss: MobHitResult = { hit: false, killed: false, hitStop: 0 };
    const ctx = this.ctx;
    if (!m.tappable) return miss;
    if (ctx && this.distanceTo(m, ctx.eye.x, ctx.eye.y, ctx.eye.z) > MOBS_RULES.touchReach) return miss;
    switch (m.brain) {
      case 'skitter':
        if (m.state === 'caught') return miss;
        m.setState('caught');
        m.tappable = false;
        this.emit({ type: 'interact', mob: m, action: 'caught' });
        return { hit: true, killed: true, hitStop: 0, action: 'caught' };
      case 'thief':
        if (m.state === 'caught' || m.state === 'sleep') return miss;
        m.setState('caught');
        m.carry = 0;
        m.tappable = false;
        this.emit({ type: 'interact', mob: m, action: 'caught' });
        this.emit({ type: 'cue', mob: m, cue: 'squeak' });
        return { hit: true, killed: false, hitStop: 0, action: 'caught' };
      case 'graze':
        if (m.crystals <= 0 || m.state === 'harvested') return miss;
        m.crystals--;
        m.timer = 0;
        m.setState('harvested');
        if (m.crystals <= 0) {
          m.tappable = false;
          m.rarity = undefined;
        }
        this.emit({ type: 'interact', mob: m, action: 'harvested' });
        return { hit: true, killed: false, hitStop: 0, action: 'harvested' };
      case 'float':
        m.cooldown = 90;
        m.tappable = false;
        m.rarity = undefined;
        m.flash = 1;
        m.setState('flee');
        this.boostLeft = MOBS_RULES.jellyBoostSeconds;
        this.emit({ type: 'interact', mob: m, action: 'spores' });
        return { hit: true, killed: false, hitStop: 0, action: 'spores' };
      case 'lamp':
        m.flash = 0.6;
        if (m.state === 'follow') m.stateTime = Math.max(0, m.stateTime - 30);
        else if (m.cooldown <= 0 || m.state === 'idle') {
          m.cooldown = 0;
          m.setState('follow');
        }
        this.emit({ type: 'interact', mob: m, action: 'petted' });
        this.emit({ type: 'cue', mob: m, cue: 'chime' });
        return { hit: true, killed: false, hitStop: 0, action: 'petted' };
      default:
        return miss;
    }
  }

  /** A burst of light at a point: monsters in `radius` (and in sight) recoil, flee or close; `dmg` to each. */
  flash(x: number, y: number, z: number, radius: number, dmg = 0): number {
    let n = 0;
    const o = { x, y, z };
    for (const m of [...this.mobs]) {
      if (!m.hostile || m.dying || m.mode === 'under') continue;
      const d = Math.hypot(m.position.x - x, m.position.y - y, m.position.z - z);
      if (d > radius || !clearLine(this.env.solid, o, m.position)) continue;
      n++;
      if (dmg > 0 && m.state !== 'sleep') this.hit(m, dmg, { light: true, from: o });
      if (m.dying) continue;
      switch (m.brain) {
        case 'cling':
        case 'drain':
        case 'pack':
          this.recoil(m, 4);
          break;
        case 'lurk':
          this.flee(m, 8);
          break;
        case 'dive':
          m.setState('recoil');
          m.timer = 2.5;
          this.dropMarker(m);
          break;
        case 'mimic':
        case 'sentinel':
        case 'slam':
        case 'spit':
          if (m.state !== 'sleep') {
            this.dropMarker(m);
            m.setState('flee');
            m.timer = m.brain === 'sentinel' ? 1.6 : 2.2;
          }
          break;
        case 'charge':
          if (m.state !== 'attack') {
            this.dropMarker(m);
            m.setState('stunned');
            m.timer = 1.6;
          }
          break;
        default:
          break;
      }
    }
    return n;
  }

  /** A light shard from the Flare Sling. */
  fire(from: V3, target: SimMob | null, dmg: number, dir?: V3, speed = 22): Shot {
    const v = new THREE.Vector3();
    if (target) v.set(target.position.x - from.x, target.position.y - from.y, target.position.z - from.z);
    else if (dir) v.set(dir.x, dir.y, dir.z);
    else v.set(0, 0, 1);
    v.normalize().multiplyScalar(speed);
    const s: Shot = { id: this.nextShot++, p: new THREE.Vector3(from.x, from.y, from.z), v, target: target?.id ?? 0, dmg, life: 1.6, landed: -1 };
    this.shots.push(s);
    this.emit({ type: 'shot', shot: s, phase: 'fly' });
    return s;
  }

  updateShots(dt: number): void {
    const solid = this.env.solid;
    for (let i = this.shots.length - 1; i >= 0; i--) {
      const s = this.shots[i];
      if (s.landed >= 0) {
        s.landed += dt;
        if (s.landed > 2.5) this.shots.splice(i, 1);
        continue;
      }
      s.life -= dt;
      const tgt = s.target ? this.mobs.find((m) => m.id === s.target && !m.dying) : undefined;
      if (tgt) {
        // A light shard bends a little toward the tapped monster.
        const want = new THREE.Vector3(tgt.position.x - s.p.x, tgt.position.y - s.p.y, tgt.position.z - s.p.z);
        const sp = s.v.length();
        want.normalize().multiplyScalar(sp);
        s.v.lerp(want, Math.min(1, dt * 6));
      } else s.v.y -= 6 * dt;
      const steps = Math.max(1, Math.ceil((s.v.length() * dt) / 0.3));
      let done = false;
      for (let k = 0; k < steps && !done; k++) {
        s.p.addScaledVector(s.v, dt / steps);
        for (const m of this.mobs) {
          if (!m.hostile || m.dying) continue;
          if (this.distanceTo(m, s.p.x, s.p.y, s.p.z) <= 0.25) {
            this.hit(m, s.dmg, { light: true, from: s.p });
            done = true;
            break;
          }
        }
        if (!done && solid(Math.floor(s.p.x), Math.floor(s.p.y), Math.floor(s.p.z))) {
          s.p.addScaledVector(s.v, -dt / steps);
          done = true;
        }
      }
      if (done || s.life <= 0) {
        s.landed = 0;
        // The light where it lands scares crawlers near it.
        for (const m of this.mobs) if (m.brain === 'cling' && !m.dying && m.position.distanceTo(s.p) < 3.2) this.recoil(m, 3);
        this.emit({ type: 'shot', shot: s, phase: done ? 'hit' : 'miss' });
      }
    }
  }

  clear(): void {
    for (const m of this.mobs) this.emit({ type: 'gone', mob: m });
    this.mobs.length = 0;
    this.shots.length = 0;
    this.spits.length = 0;
    this.markers.length = 0;
    this.waves.length = 0;
    this.eruptions.length = 0;
    this.dim = 1;
    this.boost = 1;
    this.boostLeft = 0;
    this.snuffLeft = 0;
    this.quiet = 0;
    // A new stratum (or a respawn): its first encounter comes after a short calm.
    this.encounterDue = 18;
    this.lastAmbush = -Infinity;
  }

  // ------------------------------------------------------------------------------------
  // Round 3: telegraphs, area blows, spits

  /** Announce a wind-up: the telegraph event (its sound, its pose) and its voice. */
  /** (`voice`: the wind-up's own sound instead of the kind's, e.g. a guardian's pattern.) */
  telegraph(m: SimMob, voice: string = m.def.voice.tele): void {
    this.emit({ type: 'telegraph', mob: m });
    this.emit({ type: 'sfx', name: voice, x: m.position.x, y: m.position.y, z: m.position.z, mob: m });
  }

  /** A named sound at the creature. */
  sfx(m: SimMob, name: string): void {
    this.emit({ type: 'sfx', name, x: m.position.x, y: m.position.y, z: m.position.z, mob: m });
  }

  /** Put a telegraph on the ground (replacing the owner's previous one). */
  addMarker(m: SimMob, kind: Marker['kind'], x: number, y: number, z: number, r: number, extra: Partial<Marker> = {}): Marker {
    this.dropMarker(m);
    const mk: Marker = { id: this.nextMarker++, kind, x, y, z, r, dx: 0, dz: 1, len: 0, progress: 0, color: m.def.mote, owner: m.id, life: -1, ...extra };
    this.markers.push(mk);
    m.marker = mk.id;
    return mk;
  }

  marker(m: SimMob): Marker | null {
    if (!m.marker) return null;
    return this.markers.find((k) => k.id === m.marker) ?? null;
  }

  /** Remove the creature's telegraph (its blow landed, or it was interrupted). */
  dropMarker(m: SimMob): void {
    if (!m.marker) return;
    const i = this.markers.findIndex((k) => k.id === m.marker);
    if (i >= 0 && this.markers[i].kind !== 'wave' && this.markers[i].kind !== 'pulse') this.markers.splice(i, 1);
    m.marker = 0;
  }

  /** The floor's height under a point (the feet cell's y), searching down then up a little. */
  floorY(x: number, y: number, z: number): number {
    const s = this.env.solid;
    const fx = Math.floor(x);
    const fz = Math.floor(z);
    let fy = Math.floor(y);
    // A perch can hang high over a cavern floor: look far down (40 m) before giving up.
    for (let k = 0; k < 40; k++) {
      if (s(fx, fy - 1, fz) && !s(fx, fy, fz)) return fy;
      fy--;
    }
    fy = Math.floor(y);
    for (let k = 0; k < 4; k++) {
      fy++;
      if (s(fx, fy - 1, fz) && !s(fx, fy, fz)) return fy;
    }
    return Math.floor(y);
  }

  /** The explorer's feet are off the floor (a jump clears a shockwave and a slam's edge). */
  airborne(ctx: MobContext): boolean {
    if (ctx.airborne !== undefined) return ctx.airborne;
    const p = ctx.player;
    return !this.env.solid(Math.floor(p.x), Math.floor(p.y - 0.12), Math.floor(p.z));
  }

  /** Distance from a point to the explorer's body (a capsule from the feet to the head). */
  playerDistance(x: number, y: number, z: number, ctx: MobContext): number {
    const p = ctx.player;
    const cy = Math.max(p.y + 0.35, Math.min(p.y + 1.45, y));
    return Math.max(0, Math.hypot(x - p.x, y - cy, z - p.z) - 0.35);
  }

  /**
   * A blow reaches the explorer: damage (or a dodge, inside a dash's i-frames). @returns whether it
   * counted (a dodged blow is spent too).
   */
  strikePlayer(m: SimMob, damage: number, element: MobElement = m.def.element): boolean {
    const ctx = this.ctx;
    if (ctx?.invulnerable) {
      this.emit({ type: 'attack', mob: m, damage: 0, landed: false, element, dodged: true });
      return true;
    }
    const led = !(m.affixBits & 1) && this.brave(m) ? LEADER_POWER : 1;
    this.emit({ type: 'attack', mob: m, damage: Math.max(1, Math.round(damage * m.power * led)), landed: true, element });
    return true;
  }

  /** A melee blow that reached the explorer (through `strikePlayer`: a dash dodges it) or missed. */
  blow(m: SimMob, reached: boolean, damage: number = m.def.damage): void {
    if (reached) this.strikePlayer(m, damage);
    else this.emit({ type: 'attack', mob: m, damage: 0, landed: false, element: m.def.element });
  }

  /**
   * A blow over an area (a slam, a burst, an emergence, a drop): it reaches the explorer within `r`
   * of (x, y, z) (feet within 2.5 m of its height). `ground`: it travels along the floor, so a jump clears it.
   */
  areaStrike(m: SimMob, x: number, y: number, z: number, r: number, damage: number, ground: boolean): boolean {
    const ctx = this.ctx;
    if (!ctx) return false;
    const p = ctx.player;
    const flat = Math.hypot(p.x - x, p.z - z);
    const inside = flat <= r + 0.3 && p.y + 1.6 > y - 1.2 && p.y < y + 2.5;
    if (!inside || (ground && this.airborne(ctx))) {
      this.emit({ type: 'attack', mob: m, damage: 0, landed: false, element: m.def.element });
      return false;
    }
    // A wall between them shelters the explorer.
    tmpA.x = x;
    tmpA.y = y + 0.6;
    tmpA.z = z;
    if (!clearLine(this.env.solid, tmpA, { x: p.x, y: p.y + 0.9, z: p.z }) && !clearLine(this.env.solid, tmpA, ctx.eye)) {
      this.emit({ type: 'attack', mob: m, damage: 0, landed: false, element: m.def.element });
      return false;
    }
    return this.strikePlayer(m, damage);
  }

  /** Spit (or a volley): `def.count` globs from the mouth toward the explorer, leading a little. */
  spitAt(m: SimMob, def: ShotDef, from: V3, ctx: MobContext, spreadScale = 1): void {
    const p = ctx.player;
    const tx = p.x;
    const ty = p.y + 1.05;
    const tz = p.z;
    const dist = Math.hypot(tx - from.x, ty - from.y, tz - from.z);
    const flight = dist / def.speed;
    // Lead the explorer by half its motion (a strafe still dodges it).
    const lx = tx + p.vx * flight * 0.5 - from.x;
    const lz = tz + p.vz * flight * 0.5 - from.z;
    // A lobbed glob is thrown up to land on the target.
    const ly = ty - from.y + 0.5 * def.gravity * flight * flight;
    const base = Math.atan2(lx, lz);
    const flatL = Math.hypot(lx, lz);
    for (let i = 0; i < def.count; i++) {
      if (this.spits.length >= MOBS_RULES.maxSpits) break;
      // The first glob flies true (a still explorer is hit); the others fan out to either side
      // (a strafe dodges the true one but may meet a side one). The outermost go at ±spread.
      const k = i === 0 ? 0 : (i % 2 === 1 ? 1 : -1) * Math.ceil(i / 2);
      const a = base + (k / Math.max(1, Math.floor((def.count - 1) / 2))) * def.spread * spreadScale;
      const v = new THREE.Vector3(Math.sin(a) * flatL, ly, Math.cos(a) * flatL).normalize().multiplyScalar(def.speed);
      // Keep the horizontal speed when lobbed (the vertical part comes from the lob).
      if (def.gravity > 0) {
        const hv = def.speed;
        v.set(Math.sin(a) * hv, ly / Math.max(0.05, flight), Math.cos(a) * hv);
      }
      this.spits.push({ id: this.nextShot++, p: new THREE.Vector3(from.x, from.y, from.z), v, def, owner: m, life: MOBS_RULES.spitLife, done: -1 });
    }
    this.sfx(m, 'mob.spit');
  }

  /** A rolling shockwave from a point along the floor. */
  addWave(m: SimMob, x: number, y: number, z: number, max: number, speed: number, damage: number): void {
    const mk: Marker = { id: this.nextMarker++, kind: 'wave', x, y, z, r: 0.5, dx: 0, dz: 1, len: 0.9, progress: 1, color: m.def.mote, owner: m.id, life: max / speed + 0.3 };
    this.markers.push(mk);
    this.waves.push({ marker: mk, speed, max, dmg: damage, element: m.def.element, owner: m, hit: false });
  }

  /**
   * A ring of the creature's own light rolling out along the floor that hurts no one (a guardian's
   * phase turning). Drawn as a soft 'pulse', unlike a shockwave's warning band.
   */
  addRing(m: SimMob, x: number, y: number, z: number, max: number, speed: number): void {
    const mk: Marker = { id: this.nextMarker++, kind: 'pulse', x, y, z, r: 0.5, dx: 0, dz: 1, len: 1.4, progress: 1, color: m.def.mote, owner: m.id, life: max / speed + 0.3 };
    this.markers.push(mk);
    this.waves.push({ marker: mk, speed, max, dmg: 0, element: 'none', owner: m, hit: true });
  }

  /** A row of eruptions along a locked line. */
  addEruption(m: SimMob, mk: Marker, damage: number): void {
    const points: Eruption['points'] = [];
    const n = Math.max(2, Math.floor(mk.len / 1.3));
    for (let i = 1; i <= n; i++) {
      const x = mk.x + mk.dx * (i * mk.len) / n;
      const z = mk.z + mk.dz * (i * mk.len) / n;
      points.push({ x, y: this.floorY(x, mk.y + 1.5, z), z, at: i * 0.07, done: false });
    }
    mk.life = n * 0.07 + 0.5;
    this.eruptions.push({ marker: mk, points, t: 0, dmg: damage, element: m.def.element, owner: m, hit: false, color: m.def.mote });
    // The marker now belongs to the eruption (its owner may move on).
    m.marker = 0;
  }

  /** Spits in flight, rolling waves, eruptions, and the markers' lives. */
  updateHazards(dt: number, ctx: MobContext): void {
    const solid = this.env.solid;
    for (let i = this.spits.length - 1; i >= 0; i--) {
      const s = this.spits[i];
      if (s.done >= 0) {
        s.done += dt;
        if (s.done > 0.6) this.spits.splice(i, 1);
        continue;
      }
      s.life -= dt;
      s.v.y -= s.def.gravity * dt;
      const steps = Math.max(1, Math.ceil((s.v.length() * dt) / 0.25));
      let hit: 'player' | 'rock' | null = null;
      for (let k = 0; k < steps && !hit; k++) {
        s.p.addScaledVector(s.v, dt / steps);
        if (ctx.active && this.playerDistance(s.p.x, s.p.y, s.p.z, ctx) <= s.def.radius) hit = 'player';
        else if (solid(Math.floor(s.p.x), Math.floor(s.p.y), Math.floor(s.p.z))) {
          s.p.addScaledVector(s.v, -dt / steps);
          hit = 'rock';
        }
      }
      if (hit === 'player') {
        this.strikePlayer(s.owner, s.def.damage, s.def.element);
        this.emit({ type: 'sfx', name: 'mob.splat', x: s.p.x, y: s.p.y, z: s.p.z });
        s.done = 0;
      } else if (hit === 'rock' || s.life <= 0) {
        if (s.def.splash > 0 && hit === 'rock') {
          if (ctx.active && this.playerDistance(s.p.x, s.p.y, s.p.z, ctx) <= s.def.splash) this.strikePlayer(s.owner, Math.round(s.def.damage * 0.6), s.def.element);
          this.emit({ type: 'burst', x: s.p.x, y: s.p.y, z: s.p.z, color: s.def.color, size: 0.6 });
        }
        if (hit === 'rock') this.emit({ type: 'sfx', name: 'mob.splat', x: s.p.x, y: s.p.y, z: s.p.z });
        s.done = 0;
      }
    }
    for (let i = this.waves.length - 1; i >= 0; i--) {
      const w = this.waves[i];
      w.marker.r += w.speed * dt;
      if (w.marker.kind === 'pulse') w.marker.progress = Math.max(0, 1 - w.marker.r / w.max);
      if (!w.hit && ctx.active) {
        const p = ctx.player;
        const flat = Math.hypot(p.x - w.marker.x, p.z - w.marker.z);
        if (Math.abs(flat - w.marker.r) < 0.7 && Math.abs(p.y - w.marker.y) < 2.2 && !this.airborne(ctx)) {
          w.hit = true;
          this.strikePlayer(w.owner, w.dmg, w.element);
        }
      }
      if (w.marker.r >= w.max) {
        this.waves.splice(i, 1);
        const j = this.markers.indexOf(w.marker);
        if (j >= 0) this.markers.splice(j, 1);
      }
    }
    for (let i = this.eruptions.length - 1; i >= 0; i--) {
      const e = this.eruptions[i];
      e.t += dt;
      let left = 0;
      for (const pt of e.points) {
        if (pt.done) continue;
        if (e.t < pt.at) {
          left++;
          continue;
        }
        pt.done = true;
        this.emit({ type: 'burst', x: pt.x, y: pt.y + 0.3, z: pt.z, color: e.color, size: 0.7 });
        if (!e.hit && ctx.active) {
          const p = ctx.player;
          if (Math.hypot(p.x - pt.x, p.z - pt.z) < 1.15 && Math.abs(p.y - pt.y) < 2 && !this.airborne(ctx)) {
            e.hit = true;
            this.strikePlayer(e.owner, e.dmg, e.element);
          }
        }
      }
      if (left === 0 && e.t > e.points.length * 0.07 + 0.4) {
        this.eruptions.splice(i, 1);
        const j = this.markers.indexOf(e.marker);
        if (j >= 0) this.markers.splice(j, 1);
      }
    }
    for (let i = this.markers.length - 1; i >= 0; i--) {
      const mk = this.markers[i];
      if (mk.life < 0) {
        // A marker whose owner is gone goes too.
        if (!this.mobs.some((m) => m.id === mk.owner && !m.dying)) this.markers.splice(i, 1);
        continue;
      }
      mk.life -= dt;
      if (mk.life <= 0 && mk.kind !== 'wave' && mk.kind !== 'pulse') this.markers.splice(i, 1);
    }
  }
}

/** A point of the worm's pass at t (0..1 across; the body trails behind at t - s/len). */
export function wormPoint(p: NonNullable<SimMob['path']>, t: number, out: THREE.Vector3): THREE.Vector3 {
  const k = t;
  out.set(p.ax + (p.bx - p.ax) * k, p.ay + (p.by - p.ay) * k + Math.sin(k * Math.PI * 1.6) * p.amp, p.az + (p.bz - p.az) * k);
  // A slow sideways sway, toward and away from the watcher.
  const w = Math.sin(k * Math.PI * 2.3 + 0.7) * p.amp * 0.6;
  out.x += (-(p.bz - p.az) / p.len) * w;
  out.z += ((p.bx - p.ax) / p.len) * w;
  return out;
}

/** How long a struck-down creature's collapse lasts before it dissolves (s): a tick's flick to a guardian's fall. */
export function collapseOf(m: SimMob): number {
  if (m.guardian) return m.brain === 'heart' ? 3.4 : 2.4;
  if (m.brain === 'fuse' || m.brain === 'drain' || m.brain === 'vista') return 0;
  const bySize = { tiny: 0.3, small: 0.42, medium: 0.6, large: 0.85, huge: 1.1 }[m.def.size];
  // A flier is seen to hit the ground (it falls from about head height).
  return m.def.locomotion === 'fly' ? Math.max(0.7, bySize) : bySize;
}

/** How long it takes to dissolve (s): after its collapse when struck down; at once when put away. */
export function dissolveOf(m: SimMob): number {
  if (m.guardian) return m.killed ? 2.2 : 3;
  if (m.brain === 'sentinel') return 2.4;
  if (m.brain === 'drain') return 0.9;
  if (m.killed && (m.def.size === 'large' || m.def.size === 'huge')) return 1.0;
  return 0.7;
}

function dampAngle(a: number, b: number, rate: number, dt: number): number {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * (1 - Math.exp(-rate * dt));
}

/**
 * Distance along a unit ray to a vertical capsule (segment y0..y1 at x, z, radius r), or null.
 * Closest-approach test of the ray against the segment, then the sphere at that point.
 */
export function rayCapsule(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, cx: number, y0: number, cz: number, y1: number, r: number): number | null {
  // Sample the closest point on the segment to the ray by minimising over the segment parameter.
  const segLen = y1 - y0;
  let best: number | null = null;
  const n = segLen > 0.05 ? 5 : 1;
  for (let i = 0; i < n; i++) {
    const cy = n === 1 ? (y0 + y1) / 2 : y0 + (segLen * i) / (n - 1);
    // Ray-sphere.
    const lx = ox - cx;
    const ly = oy - cy;
    const lz = oz - cz;
    const b = lx * dx + ly * dy + lz * dz;
    const c = lx * lx + ly * ly + lz * lz - r * r;
    const disc = b * b - c;
    if (disc < 0) continue;
    const t = -b - Math.sqrt(disc);
    const tt = t >= 0 ? t : c <= 0 ? 0 : null;
    if (tt !== null && (best === null || tt < best)) best = tt;
  }
  if (segLen > 0.05) {
    // The straight part between the samples: a cylinder test in xz.
    const a = dx * dx + dz * dz;
    if (a > 1e-9) {
      const lx = ox - cx;
      const lz = oz - cz;
      const b = lx * dx + lz * dz;
      const c = lx * lx + lz * lz - r * r;
      const disc = b * b - a * c;
      if (disc >= 0) {
        const t = (-b - Math.sqrt(disc)) / a;
        if (t >= 0) {
          const y = oy + dy * t;
          if (y >= y0 && y <= y1 && (best === null || t < best)) best = t;
        }
      }
    }
  }
  return best;
}
