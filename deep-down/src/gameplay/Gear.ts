import { ARMOUR_CAP, ARMOUR_SETS, ARMOUR_SET_IDS, armourPiece, type ArmourSetId, type ArmourSlot } from '../config/armour';
import { ITEMS, gearFor, isItem, type EquipSlot, type HazardKind, type ItemId } from '../config/items';

/**
 * Gear owned and worn (round 3, LOOP): the pick, the weapon, the lantern, the pack and three armour
 * pieces. Gear is crafted once and kept for good (never in the bag, never lost on a black-out):
 * `owned` is the locker, `equipped` what is worn. A crafted pick, lantern or pack is always the best
 * one and equips at once; a weapon or armour piece equips when its slot is empty or it is a higher
 * band, and the explorer can switch back from the Bag. Pure: Loop applies the effects.
 */
export const EQUIP_SLOTS: readonly EquipSlot[] = ['pick', 'weapon', 'lantern', 'pack', 'head', 'chest', 'feet'];

export interface GearSave {
  owned: ItemId[];
  equipped: Partial<Record<EquipSlot, ItemId>>;
}

export interface Wards {
  cold: number;
  gas: number;
  heat: number;
  dark: number;
}

export class Gear {
  readonly owned = new Set<ItemId>(['rustyPick', 'oilLantern']);
  readonly equipped: Record<EquipSlot, ItemId | null> = { pick: 'rustyPick', weapon: null, lantern: 'oilLantern', pack: null, head: null, chest: null, feet: null };

  /** Tier of the equipped item in a slot (pick 1, lantern 1, pack 1 when none). */
  tier(slot: EquipSlot): number {
    const id = this.equipped[slot];
    return id ? ITEMS[id].tier ?? 1 : 1;
  }

  /** Add a crafted (or granted) gear item; it equips when it is better. @returns true if it was equipped. */
  grant(item: ItemId): boolean {
    const slot = ITEMS[item].equip;
    if (!slot) return false;
    this.owned.add(item);
    const cur = this.equipped[slot];
    const better = !cur || (ITEMS[item].tier ?? 1) > (ITEMS[cur].tier ?? 1);
    if (better) this.equipped[slot] = item;
    return better;
  }

  /** Wear an owned item. Picks, lanterns and packs only go up (the best one is always worn). */
  equip(item: ItemId): boolean {
    const slot = ITEMS[item].equip;
    if (!slot || !this.owned.has(item)) return false;
    if ((slot === 'pick' || slot === 'lantern' || slot === 'pack') && this.equipped[slot] && (ITEMS[item].tier ?? 1) < this.tier(slot)) return false;
    this.equipped[slot] = item;
    return true;
  }

  /** Take an armour piece or the weapon off. */
  unequip(slot: EquipSlot): boolean {
    if (slot === 'pick' || slot === 'lantern' || slot === 'pack' || !this.equipped[slot]) return false;
    this.equipped[slot] = null;
    return true;
  }

  /** The full set worn, if any. */
  fullSet(): ArmourSetId | null {
    for (const id of ARMOUR_SET_IDS) {
      const p = ARMOUR_SETS[id].pieces;
      if (this.equipped.head === p.head && this.equipped.chest === p.chest && this.equipped.feet === p.feet) return id;
    }
    return null;
  }

  /** Share of creature damage the armour takes (0..ARMOUR_CAP). */
  armour(): number {
    let a = 0;
    for (const slot of ['head', 'chest', 'feet'] as ArmourSlot[]) {
      const id = this.equipped[slot];
      const piece = id ? armourPiece(id) : null;
      if (piece) a += piece.armour;
    }
    return Math.min(ARMOUR_CAP, a);
  }

  /**
   * Hazard wards from the armour and the lantern, 0..1 each: each piece of a set wards a third of its
   * hazard, the full set all of it; the lantern holds the dark back by its tier (1: 0, 5: 0.8).
   */
  wards(): Wards {
    const w: Wards = { cold: 0, gas: 0, heat: 0, dark: 0 };
    for (const slot of ['head', 'chest', 'feet'] as ArmourSlot[]) {
      const id = this.equipped[slot];
      const piece = id ? armourPiece(id) : null;
      const ward = piece ? ARMOUR_SETS[piece.set].ward : null;
      if (ward) w[ward] = Math.min(1, w[ward] + 1 / 3 + 1e-9);
    }
    const full = this.fullSet();
    const fullWard: HazardKind | null = full ? ARMOUR_SETS[full].ward : null;
    if (fullWard) w[fullWard] = 1;
    w.dark = Math.max(w.dark, Math.min(0.8, (this.tier('lantern') - 1) * 0.2));
    return w;
  }

  /** Extra max health from a full set (Miner +20, Ember +30). */
  bonusHealth(): number {
    const full = this.fullSet();
    return full ? ARMOUR_SETS[full].maxHealth : 0;
  }

  /** Long drops do not hurt (the Miner set). */
  safeFall(): boolean {
    const full = this.fullSet();
    return full ? ARMOUR_SETS[full].safeFall : false;
  }

  toJSON(): GearSave {
    const equipped: Partial<Record<EquipSlot, ItemId>> = {};
    for (const s of EQUIP_SLOTS) {
      const id = this.equipped[s];
      if (id) equipped[s] = id;
    }
    return { owned: [...this.owned], equipped };
  }

  static fromJSON(x: unknown, legacyTiers?: { pickaxe?: number; lantern?: number; pack?: number }): Gear {
    const g = new Gear();
    const o = x && typeof x === 'object' ? (x as Partial<GearSave>) : {};
    if (Array.isArray(o.owned)) for (const id of o.owned) if (isItem(id) && ITEMS[id].equip) g.owned.add(id);
    // A save without gear (1.x, or before round 3): the tool tiers it had become owned gear.
    if (legacyTiers) {
      const add = (slot: EquipSlot, tier: number | undefined) => {
        for (let t = 1; t <= (tier ?? 1); t++) {
          const id = gearFor(slot, t);
          if (id) g.owned.add(id);
        }
      };
      add('pick', legacyTiers.pickaxe);
      add('lantern', legacyTiers.lantern);
      add('pack', legacyTiers.pack);
    }
    // Best pick, lantern and pack owned; then the saved choices where they are owned.
    for (const id of g.owned) {
      const slot = ITEMS[id].equip;
      if (slot === 'pick' || slot === 'lantern' || slot === 'pack') g.grant(id);
    }
    if (o.equipped && typeof o.equipped === 'object') {
      for (const s of EQUIP_SLOTS) {
        const id = (o.equipped as Record<string, unknown>)[s];
        if (isItem(id) && ITEMS[id].equip === s && g.owned.has(id)) g.equip(id);
      }
    }
    return g;
  }
}
