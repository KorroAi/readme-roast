import { ITEMS, isItem, type HazardKind, type ItemId } from '../../config/items';
import { ARMOUR_CAP } from '../../config/armour';
import { t, type TextKey } from '../../i18n';

/**
 * Gem sockets (round 3 stretch, LOOP; BRIEF §6): weapons and armour pieces have sockets (a weapon
 * one per band, an armour piece one, two from the Bog set up); a gem set in one gives its effect
 * while the piece is worn: a weapon's damage or attack speed, an armour piece's armour, max health
 * or a hazard ward. Gems are set at a Forge once the trader's gem cutting is bought; a new gem in a
 * full piece replaces the first one (which goes back to the bag).
 */
export interface GemFx {
  weapon: { damage?: number; speed?: number };
  armour: { armour?: number; health?: number; ward?: { hazard: HazardKind; amount: number } };
}

export const GEM_FX: Partial<Record<ItemId, GemFx>> = {
  amber: { weapon: { damage: 0.06 }, armour: { health: 5 } },
  sporeQuartz: { weapon: { speed: 0.06 }, armour: { ward: { hazard: 'gas', amount: 0.15 } } },
  pearl: { weapon: { damage: 0.04, speed: 0.04 }, armour: { health: 8 } },
  glimmerShard: { weapon: { damage: 0.08 }, armour: { armour: 0.02 } },
  echoShard: { weapon: { speed: 0.08 }, armour: { armour: 0.02 } },
  gem: { weapon: { damage: 0.1 }, armour: { armour: 0.03 } },
  frostCrystal: { weapon: { speed: 0.1 }, armour: { ward: { hazard: 'cold', amount: 0.25 } } },
  verdite: { weapon: { damage: 0.12 }, armour: { health: 12 } },
  mireOpal: { weapon: { damage: 0.1, speed: 0.04 }, armour: { ward: { hazard: 'gas', amount: 0.3 } } },
  orichalcum: { weapon: { damage: 0.15 }, armour: { armour: 0.04 } },
  magmaCore: { weapon: { damage: 0.18 }, armour: { ward: { hazard: 'heat', amount: 0.3 } } },
  voidshard: { weapon: { damage: 0.08, speed: 0.12 }, armour: { ward: { hazard: 'dark', amount: 0.3 } } },
};

export const isGem = (item: ItemId): boolean => !!GEM_FX[item];

/** How many sockets a piece of gear has (0: none). */
export function socketsOf(item: ItemId): number {
  const d = ITEMS[item];
  if (!d) return 0;
  if (d.equip === 'weapon') return Math.max(1, Math.min(3, d.tier ?? 1));
  if (d.equip === 'head' || d.equip === 'chest' || d.equip === 'feet') return (d.tier ?? 1) >= 3 ? 2 : 1;
  return 0;
}

/** One line of what a gem does in a weapon or in armour. */
export function gemLine(gem: ItemId, where: 'weapon' | 'armour'): string {
  const fx = GEM_FX[gem];
  if (!fx) return '';
  const parts: string[] = [];
  const pct = (v: number) => Math.round(v * 100);
  if (where === 'weapon') {
    if (fx.weapon.damage) parts.push(t('gem3.fx.damage', { n: pct(fx.weapon.damage) }));
    if (fx.weapon.speed) parts.push(t('gem3.fx.speed', { n: pct(fx.weapon.speed) }));
  } else {
    if (fx.armour.armour) parts.push(t('gem3.fx.armour', { n: pct(fx.armour.armour) }));
    if (fx.armour.health) parts.push(t('gem3.fx.health', { n: fx.armour.health }));
    if (fx.armour.ward) parts.push(t('gem3.fx.ward', { hazard: t(`hazard.${fx.armour.ward.hazard}` as TextKey), n: pct(fx.armour.ward.amount) }));
  }
  return parts.join(', ');
}

export interface SocketTotals {
  damage: number;
  speed: number;
  armour: number;
  health: number;
  wards: Record<HazardKind, number>;
}

export class Sockets {
  /** Gear item → its sockets (a gem id or null). */
  readonly set = new Map<ItemId, Array<ItemId | null>>();

  reset(): void {
    this.set.clear();
  }

  of(item: ItemId): Array<ItemId | null> {
    const n = socketsOf(item);
    const cur = this.set.get(item) ?? [];
    return Array.from({ length: n }, (_, i) => cur[i] ?? null);
  }

  /**
   * Set a gem in a piece. @returns the gem it replaced (the first socket's, when all are full), or
   * null; false when the piece takes no gems or the item is no gem.
   */
  put(item: ItemId, gem: ItemId): { replaced: ItemId | null; socket: number } | false {
    const n = socketsOf(item);
    if (n === 0 || !isGem(gem)) return false;
    const list = this.of(item);
    let i = list.indexOf(null);
    let replaced: ItemId | null = null;
    if (i < 0) {
      i = 0;
      replaced = list[0];
    }
    list[i] = gem;
    this.set.set(item, list);
    return { replaced, socket: i };
  }

  /** The bonuses of the worn weapon and armour pieces. */
  totals(weapon: ItemId | null, armour: ReadonlyArray<ItemId | null>, out?: SocketTotals): SocketTotals {
    const o = out ?? { damage: 0, speed: 0, armour: 0, health: 0, wards: { cold: 0, gas: 0, heat: 0, dark: 0 } };
    o.damage = o.speed = o.armour = o.health = 0;
    o.wards.cold = o.wards.gas = o.wards.heat = o.wards.dark = 0;
    if (weapon) for (const g of this.of(weapon)) {
      const fx = g ? GEM_FX[g] : null;
      if (!fx) continue;
      o.damage += fx.weapon.damage ?? 0;
      o.speed += fx.weapon.speed ?? 0;
    }
    for (const piece of armour) {
      if (!piece) continue;
      for (const g of this.of(piece)) {
        const fx = g ? GEM_FX[g] : null;
        if (!fx) continue;
        o.armour += fx.armour.armour ?? 0;
        o.health += fx.armour.health ?? 0;
        if (fx.armour.ward) o.wards[fx.armour.ward.hazard] = Math.min(1, o.wards[fx.armour.ward.hazard] + fx.armour.ward.amount);
      }
    }
    o.armour = Math.min(ARMOUR_CAP, o.armour);
    return o;
  }

  toJSON(): Partial<Record<ItemId, Array<ItemId | null>>> {
    const out: Partial<Record<ItemId, Array<ItemId | null>>> = {};
    for (const [k, v] of this.set) if (v.some(Boolean)) out[k] = [...v];
    return out;
  }

  load(x: unknown): void {
    this.set.clear();
    if (!x || typeof x !== 'object') return;
    for (const [k, v] of Object.entries(x as Record<string, unknown>)) {
      if (!isItem(k) || socketsOf(k) === 0 || !Array.isArray(v)) continue;
      const list = v.slice(0, socketsOf(k)).map((g) => (isItem(g) && isGem(g) ? g : null));
      this.set.set(k, list);
    }
  }
}
