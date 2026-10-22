import { hasText, t, type TextKey } from '../../i18n';
import type { Rng } from '../../core/rng';
import { SPECIES } from './species';
import type { MobAffix, MobKind } from './types';

/**
 * Elite monsters (round 3 stretch, MOBS; BRIEF §6): now and then a pack has a leader with one
 * affix (two from stratum IV), a clear look and a twist, and better loot:
 * - radiant: it shines and leads its pack: pack-mates near it bite harder and are not cowed by a
 *   raised flame; it is not either. Strike it first: it bursts in light (oil for the lantern,
 *   the others recoil).
 * - armoured: steel plates: blows to its front glance off (45 %); its flanks and back, or its open
 *   guard after an attack, take them in full.
 * - swift: it moves 40 % faster, winds up in 80 % of the time (never under 0.35 s: still told) and
 *   is ready again sooner.
 * - splitting: when it falls it splits in two smaller ones.
 */
export interface AffixDef {
  /** Hit points factor. */
  hp: number;
  /** Movement speed factor (walking, crawling, flying, rushing). */
  pace: number;
  /** Wind-up time factor (a floor of 0.35 s keeps every blow told). */
  tempo: number;
  /** Cooldown recovery factor. */
  haste: number;
  /** The look: the rim and vein colour (sRGB hex), and the affix's bit in the shader. */
  color: number;
  bit: number;
}

export const AFFIXES: Record<MobAffix, AffixDef> = {
  radiant: { hp: 1.8, pace: 1, tempo: 1, haste: 1, color: 0xffd27a, bit: 1 },
  armoured: { hp: 1.5, pace: 0.92, tempo: 1, haste: 1, color: 0xa8bccc, bit: 2 },
  swift: { hp: 1.25, pace: 1.4, tempo: 0.8, haste: 1.43, color: 0x7fe8ff, bit: 4 },
  splitting: { hp: 1.3, pace: 1, tempo: 1, haste: 1, color: 0xe070ff, bit: 8 },
};

/** A blow to an armoured elite's front (within this angle of its facing) glances off. */
export const ARMOUR_FRONT = 0.45;
export const ARMOUR_ARC = (70 * Math.PI) / 180;
/** A radiant leader's reach over its pack (m), and how much harder they bite. */
export const LEADER_REACH = 8;
export const LEADER_POWER = 1.15;
/** Oil seconds a radiant elite's burst of light gives the lantern. */
export const RADIANT_OIL = 20;
/** A splitting elite's children: their size and hit points (of the kind's), and their bite. */
export const SPLIT = { count: 2, scale: 0.68, hp: 0.4, power: 0.7 };

/** The chance a monster pack has an elite leader, by stratum (1..6), and of a second affix from IV down. */
export const ELITE_CHANCE: readonly number[] = [0, 0.06, 0.08, 0.1, 0.12, 0.14, 0.16];
export const SECOND_AFFIX = 0.3;

/** The extra loot of an elite, by stratum: a gem or rare material of that depth (1-2, always). */
export const ELITE_BONUS: Record<number, readonly string[]> = {
  1: ['amber', 'sporeQuartz'],
  2: ['pearl', 'goldOre'],
  3: ['gem', 'glimmerShard'],
  4: ['frostCrystal', 'verdite'],
  5: ['mireOpal', 'orichalcum'],
  6: ['magmaCore', 'voidshard'],
};

/** May this kind carry this affix? (No guardians, no worm; no light for the light-drinker; still things are not swift; exploders do not split.) */
export function canTake(kind: MobKind, affix: MobAffix): boolean {
  const d = SPECIES[kind];
  if (d.family !== 'monster' || d.rank !== 'minion' || d.brain === 'vista' || d.brain === 'sentinel') return false;
  if (affix === 'radiant' && (d.brain === 'drain' || d.brain === 'lurk')) return false;
  if (affix === 'swift' && d.locomotion === 'still') return false;
  if (affix === 'splitting' && (d.brain === 'fuse' || d.brain === 'mimic' || d.size === 'tiny')) return false;
  if (affix === 'armoured' && d.brain === 'drain') return false;
  return true;
}

/** Roll an elite's affixes for a kind in a stratum (one, or two from stratum IV). Pure given `rng`. */
export function rollAffixes(rng: Rng, stratum: number, kind: MobKind): MobAffix[] {
  const pool = (Object.keys(AFFIXES) as MobAffix[]).filter((a) => canTake(kind, a));
  if (!pool.length) return [];
  const out: MobAffix[] = [pool[rng.int(0, pool.length - 1)]];
  if (stratum >= 4 && rng.next() < SECOND_AFFIX) {
    const rest = pool.filter((a) => a !== out[0]);
    if (rest.length) out.push(rest[rng.int(0, rest.length - 1)]);
  }
  return out;
}

/** The affixes' combined numbers. */
export function affixNumbers(affixes: readonly MobAffix[]): { hp: number; pace: number; tempo: number; haste: number; bits: number } {
  let hp = 1;
  let pace = 1;
  let tempo = 1;
  let haste = 1;
  let bits = 0;
  for (const a of affixes) {
    const d = AFFIXES[a];
    hp *= d.hp;
    pace *= d.pace;
    tempo *= d.tempo;
    haste *= d.haste;
    bits |= d.bit;
  }
  return { hp: Math.min(hp, 2.6), pace, tempo, haste, bits };
}

/** "Swift Armoured Icefang" (through t(): the template may reorder for other languages). */
export function eliteName(kind: MobKind, affixes: readonly MobAffix[]): string {
  const key = `mob.${kind}`;
  const name = hasText(key) ? t(key as TextKey) : kind;
  if (!affixes.length) return name;
  const words = affixes.map((a) => t(`mob.elite.${a}` as TextKey)).join(' ');
  return t('mob.elite.name', { affixes: words, name });
}
