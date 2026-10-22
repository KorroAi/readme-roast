import type { TextKey } from '../i18n';
import type { HazardKind, ItemId } from './items';

/**
 * Armour (round 3, LOOP; BRIEF §0.4): four sets of helmet, chest and boots, one per tier band.
 * Each piece takes a share of incoming creature damage and wards a third of its set's hazard; the
 * full set gives the set bonus: the Miner set +20 health and safe long drops, the Fur set warmth
 * (no cold), the Bog set a filter (no gas), the Ember set heat (lava's heat cannot hurt).
 */
export type ArmourSlot = 'head' | 'chest' | 'feet';
export const ARMOUR_SLOTS: readonly ArmourSlot[] = ['head', 'chest', 'feet'];

export type ArmourSetId = 'miner' | 'fur' | 'bog' | 'ember';

export interface ArmourPiece {
  item: ItemId;
  set: ArmourSetId;
  slot: ArmourSlot;
  /** Fraction of creature damage it takes away (the pieces worn add up, capped at ARMOUR_CAP). */
  armour: number;
}

export interface ArmourSetDef {
  id: ArmourSetId;
  name: TextKey;
  /** One line: what the full set does. */
  bonus: TextKey;
  /** The hazard the set answers (each piece wards a third of it; the full set all of it). */
  ward: HazardKind | null;
  pieces: Record<ArmourSlot, ItemId>;
  /** Full-set extras. */
  maxHealth: number;
  safeFall: boolean;
}

export const ARMOUR_SETS: Record<ArmourSetId, ArmourSetDef> = {
  miner: { id: 'miner', name: 'armour.set.miner', bonus: 'armour.set.miner.bonus', ward: null, pieces: { head: 'minerHelmet', chest: 'minerVest', feet: 'minerBoots' }, maxHealth: 20, safeFall: true },
  fur: { id: 'fur', name: 'armour.set.fur', bonus: 'armour.set.fur.bonus', ward: 'cold', pieces: { head: 'furHood', chest: 'furCoat', feet: 'furBoots' }, maxHealth: 0, safeFall: false },
  bog: { id: 'bog', name: 'armour.set.bog', bonus: 'armour.set.bog.bonus', ward: 'gas', pieces: { head: 'bogMask', chest: 'bogCoat', feet: 'bogBoots' }, maxHealth: 0, safeFall: false },
  ember: { id: 'ember', name: 'armour.set.ember', bonus: 'armour.set.ember.bonus', ward: 'heat', pieces: { head: 'emberHelm', chest: 'emberPlate', feet: 'emberGreaves' }, maxHealth: 30, safeFall: false },
};

export const ARMOUR_SET_IDS: readonly ArmourSetId[] = ['miner', 'fur', 'bog', 'ember'];

/** Damage share per piece by band (chest takes the most). */
const SHARE: Record<ArmourSetId, Record<ArmourSlot, number>> = {
  miner: { head: 0.04, chest: 0.07, feet: 0.04 },
  fur: { head: 0.06, chest: 0.1, feet: 0.06 },
  bog: { head: 0.08, chest: 0.12, feet: 0.08 },
  ember: { head: 0.1, chest: 0.15, feet: 0.1 },
};

/** Worn armour never takes away more than this share of a hit. */
export const ARMOUR_CAP = 0.45;

export const ARMOUR_PIECES: Partial<Record<ItemId, ArmourPiece>> = {};
for (const set of ARMOUR_SET_IDS) {
  for (const slot of ARMOUR_SLOTS) {
    const item = ARMOUR_SETS[set].pieces[slot];
    ARMOUR_PIECES[item] = { item, set, slot, armour: SHARE[set][slot] };
  }
}

export function armourPiece(item: ItemId): ArmourPiece | null {
  return ARMOUR_PIECES[item] ?? null;
}
