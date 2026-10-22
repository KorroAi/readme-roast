import type { HazardKind as Ward } from '../config/items';

/**
 * The hazards' gameplay (round 3, LOOP; BRIEF §0.2): what a biome does to the explorer, and its
 * counters. WORLD's biomes and hazard zones say where (config/biomes hazard, layout.hazards); this
 * turns that into a build-up meter, damage and a lantern drain. Pure: Loop feeds it a probe every
 * frame and applies the result (damage that pierces armour, the burn rate, events).
 *
 * | World kind | Meter | Hurts when | Counters |
 * |---|---|---|---|
 * | chill (Flooded Grottoes, gentle) | warmth lost near cold water | full; never below 10 hp | torches, Warming Tonic, Fur set |
 * | cold (Frost Caverns) | warmth lost anywhere in the biome | full: 4 hp/s | torch or camp warmth, Warming Tonic, Fur set (full set: immune) |
 * | gas (Sulphur Bog, in pockets) | breath held | half: up to 6 hp/s | leave the haze, Antidote, Bog set (full: immune) |
 * | lava (Magma Veins) | heat near lava | full: 8 hp/s; in lava 30 hp/s | distance, Cooling Draught, Ember set |
 * | dark / void (Sunken City, Obsidian Abyss) | the dark creeps in once the lantern is out | full: 5 hp/s | Oil Flasks, torches, flares, a Glow or Sun Lantern; the lantern also burns faster |
 * | thorns (Glowroot Jungle) | none | a scratch every 4 s while moving by vines | armour |
 * | falls (Root Galleries, Crystal Geode) | none | falls hurt (1 + strength)× | Miner set (safe drops), ladders, ropes |
 * | rockfall (Old Halden Mines) | none | the events' rockfalls | a helmet (armour) |
 */
export type WorldHazard = 'none' | 'falls' | 'chill' | 'rockfall' | 'cold' | 'thorns' | 'gas' | 'dark' | 'lava' | 'void';

export interface HazardProbe {
  /** The biome's hazard and strength (0..1). */
  kind: WorldHazard;
  strength: number;
  /** Local intensity 0..1: in a gas pocket, near lava (1 at the edge, 0 at 6 m), by cold water; biome-wide hazards pass 1. */
  zone: number;
  /** Standing in lava. */
  inLava: boolean;
  /** A torch, a lamp, the camp fire or an outpost within a few metres (warmth, light). */
  nearWarmth: boolean;
  /** The lantern burns. */
  lit: boolean;
  inCamp: boolean;
  /** Walking (thorns scratch only on the move). */
  moving: boolean;
  /** Hazard wards 0..1 (armour, lantern) and the potions' seconds left. */
  wards: Record<Ward, number>;
  potions: Partial<Record<Ward, number>>;
  /** Current and max health (a gentle hazard never takes the last 10 hp). */
  health: number;
}

/** A creature's element (MOBS' MobElement), for what its landed blows do beside the damage. */
export type Element = 'none' | 'frost' | 'acid' | 'fire' | 'spore' | 'void' | 'shock';

/**
 * What a landed elemental blow adds (cut by the ward of its meter, nothing under its potion):
 * - a bump of the matching meter (frost → cold, fire → heat, acid and spore → gas, void → dark): in
 *   its own biome it brings the hurt closer; elsewhere the meter shows it and fades;
 * - fire and acid keep biting for a moment (`dot` hp/s for `seconds`, piercing armour);
 * - the void drinks `oil` seconds of the lantern's flame.
 */
export const ELEMENT_FX: Record<Element, { meter: Ward | null; bump: number; dot?: number; seconds?: number; oil?: number }> = {
  none: { meter: null, bump: 0 },
  shock: { meter: null, bump: 0 },
  frost: { meter: 'cold', bump: 0.2 },
  fire: { meter: 'heat', bump: 0.2, dot: 2, seconds: 3 },
  acid: { meter: 'gas', bump: 0.12, dot: 1.5, seconds: 4 },
  spore: { meter: 'gas', bump: 0.2 },
  void: { meter: 'dark', bump: 0.15, oil: 8 },
};

/** The meter level at which a building hazard is announced (once per kind per WARN_GAP s). */
export const WARN_LEVEL = 0.4;
export const WARN_GAP = 90;

export interface HitResult {
  meter: Ward | null;
  /** Lantern seconds the blow drank (the void). */
  oil: number;
  /** A lingering burn started (fire, acid). */
  dot: boolean;
}

export interface HazardStep {
  /** The meter's kind (null: nothing building up) and its level 0..1. */
  kind: Ward | null;
  level: number;
  /** Health to take this step (pierces armour). */
  damage: number;
  /** Damage that armour reduces (thorns). */
  blunt: number;
  /** The lantern's burn-rate multiplier (the dark eats oil). */
  burn: number;
  /** Falls hurt this much more. */
  fallFactor: number;
  /** The meter just became full (hurting), or just emptied. */
  startedHurting: boolean;
  stoppedHurting: boolean;
  /** The meter just rose past WARN_LEVEL (announce it with its counter; rate-limited per kind). */
  warn: boolean;
}

const METER: Record<Ward, WorldHazard[]> = { cold: ['cold', 'chill'], gas: ['gas'], heat: ['lava'], dark: ['dark', 'void'] };

function meterOf(kind: WorldHazard): Ward | null {
  for (const w of Object.keys(METER) as Ward[]) if (METER[w].includes(kind)) return w;
  return null;
}

export class Hazards {
  private level = 0;
  private kind: Ward | null = null;
  private hurting = false;
  private scratch = 0;
  /** A lingering burn (fire, acid): hp/s, seconds left, and the ward that cuts it. */
  private dotRate = 0;
  private dotLeft = 0;
  private dotWard: Ward = 'heat';
  private clock = 0;
  private readonly warnedAt: Record<Ward, number> = { cold: -Infinity, gas: -Infinity, heat: -Infinity, dark: -Infinity };
  private readonly out: HazardStep = { kind: null, level: 0, damage: 0, blunt: 0, burn: 1, fallFactor: 1, startedHurting: false, stoppedHurting: false, warn: false };

  get meter(): number {
    return this.level;
  }

  get active(): Ward | null {
    return this.kind;
  }

  reset(): void {
    this.level = 0;
    this.kind = null;
    this.hurting = false;
    this.scratch = 0;
    this.dotRate = 0;
    this.dotLeft = 0;
  }

  /** Seconds of a lingering burn left (fire, acid), 0 when none. */
  get burning(): number {
    return this.dotLeft;
  }

  /**
   * A creature's landed elemental blow (ELEMENT_FX): bumps the matching meter (unless another hazard
   * holds it), starts a lingering burn, or drinks lantern oil; each cut by its ward, nothing under its
   * potion. The meter's rise is announced like the world's (`warn` on the next step).
   */
  hit(element: Element, wards: Readonly<Record<Ward, number>>, potions: Readonly<Partial<Record<Ward, number>>>): HitResult {
    const fx = ELEMENT_FX[element] ?? ELEMENT_FX.none;
    const res: HitResult = { meter: null, oil: 0, dot: false };
    const m = fx.meter;
    if (!m || (potions[m] ?? 0) > 0) return res;
    const cut = 1 - Math.max(0, Math.min(1, wards[m] ?? 0));
    if (cut <= 0) return res;
    res.meter = m;
    if (fx.bump > 0 && (this.kind === null || this.kind === m || this.level < 0.05)) {
      this.kind = m;
      this.level = Math.min(0.95, this.level + fx.bump * cut);
    }
    if (fx.dot && fx.seconds) {
      this.dotRate = Math.max(this.dotRate * (this.dotLeft > 0 ? 1 : 0), fx.dot * cut);
      this.dotLeft = Math.max(this.dotLeft, fx.seconds);
      this.dotWard = m;
      res.dot = true;
    }
    if (fx.oil) res.oil = fx.oil * cut;
    return res;
  }

  update(dt: number, p: HazardProbe): Readonly<HazardStep> {
    const o = this.out;
    o.damage = 0;
    o.blunt = 0;
    o.burn = 1;
    o.fallFactor = 1;
    o.startedHurting = false;
    o.stoppedHurting = false;
    o.warn = false;
    const step = dt > 0 && Number.isFinite(dt) ? Math.min(dt, 0.25) : 0;
    this.clock += step;
    const before = this.level;
    const s = Math.max(0, Math.min(1, p.strength));
    const z = Math.max(0, Math.min(1, p.zone));
    const meter = meterOf(p.kind);
    const potion = meter ? (p.potions[meter] ?? 0) > 0 : false;
    const ward = meter ? (potion ? 1 : Math.max(0, Math.min(1, p.wards[meter] ?? 0))) : 0;
    if (p.kind === 'falls') o.fallFactor = 1 + s;
    if (p.kind === 'void') o.fallFactor = 1 + s * 0.5;

    // Build-up and relief.
    let rise = 0;
    let fall = 1 / 6;
    let hurtAt = 1;
    let rate = 0;
    if (!p.inCamp && meter && step > 0) {
      switch (p.kind) {
        case 'chill':
          rise = z > 0 && !p.nearWarmth ? (s * z) / 45 : 0;
          rate = 1;
          break;
        case 'cold':
          rise = !p.nearWarmth ? (s * Math.max(z, 0.5)) / 40 : 0;
          fall = 1 / 8;
          rate = 4;
          break;
        case 'gas':
          rise = z > 0 ? (s * z) / 6 : 0;
          fall = 1 / 4;
          hurtAt = 0.5;
          rate = 6;
          break;
        case 'lava':
          rise = z > 0 ? (s * z) / 10 : 0;
          fall = 1 / 5;
          rate = 8;
          break;
        case 'dark':
        case 'void':
          o.burn = 1 + s * (1 - Math.max(ward, p.nearWarmth ? 0.6 : 0));
          rise = !p.lit && !p.nearWarmth ? s / 10 : 0;
          fall = 1 / 3;
          rate = 5;
          break;
      }
    }
    const effRise = rise * (1 - ward);
    if (effRise > 0) {
      this.kind = meter;
      this.level = Math.min(1, this.level + effRise * step);
    } else {
      this.level = Math.max(0, this.level - fall * step);
      if (this.level === 0) this.kind = null;
    }

    const was = this.hurting;
    this.hurting = this.level >= hurtAt && effRise > 0;
    if (this.hurting) {
      const scale = p.kind === 'gas' ? this.level : 1;
      let dmg = rate * scale * (1 - ward) * step;
      if (p.kind === 'chill') dmg = Math.min(dmg, Math.max(0, p.health - 10));
      o.damage += dmg;
    }
    if (p.inLava && !p.inCamp) o.damage += 30 * (1 - 0.7 * ward) * step;
    // A lingering burn (fire, acid): its ward and potion still hold it back as it bites; camp puts it out.
    if (this.dotLeft > 0) {
      const t = Math.min(step, this.dotLeft);
      this.dotLeft = Math.max(0, this.dotLeft - step);
      const cut = (p.potions[this.dotWard] ?? 0) > 0 ? 0 : 1 - Math.max(0, Math.min(1, p.wards[this.dotWard] ?? 0));
      if (!p.inCamp) o.damage += this.dotRate * cut * t;
      if (this.dotLeft === 0 || p.inCamp) {
        this.dotLeft = 0;
        this.dotRate = 0;
      }
    }
    if (p.kind === 'thorns' && p.moving && z > 0 && !p.inCamp) {
      this.scratch += step;
      if (this.scratch >= 4) {
        this.scratch = 0;
        o.blunt += 3 * (0.5 + s);
      }
    } else this.scratch = Math.max(0, this.scratch - step);

    o.startedHurting = this.hurting && !was;
    o.stoppedHurting = !this.hurting && was;
    // Announce a meter rising past the warning level (the world's build-up, not a blow's bump).
    if (this.kind && effRise > 0 && before < WARN_LEVEL && this.level >= WARN_LEVEL && this.clock - this.warnedAt[this.kind] >= WARN_GAP) {
      this.warnedAt[this.kind] = this.clock;
      o.warn = true;
    }
    o.kind = this.kind;
    o.level = this.level;
    return o;
  }
}
