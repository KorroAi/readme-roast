import type { TextKey } from '../i18n';
import type { ItemId } from './items';

/**
 * Crafting stations (round 3, LOOP seam; BRIEF §0.4).
 *
 * - `hand`: no station, craftable anywhere (torches, planks, bandages...).
 * - `workbench`: the camp's bench, and the field bench of every outpost.
 * - `furnace`: ore to ingots, food; burns fuel (coal 4, heartwood 3, sulphur 3, black oil 2, wood 1).
 * - `forge`: weapons, armour, lanterns.
 * - `alchemy`: potions and bombs.
 *
 * The Furnace, the Forge and the Alchemy Table are items crafted at the Workbench and placed with
 * Place, at the camp or anywhere else (an outpost is the natural spot). A recipe is craftable when
 * its station is within `reach` metres of the explorer (game/craft StationsNear).
 */
export type StationId = 'hand' | 'workbench' | 'furnace' | 'forge' | 'alchemy';

export interface StationDef {
  id: StationId;
  name: TextKey;
  desc: TextKey;
  /** The item that is placed to make this station (null: the hand, or the camp's built-in bench). */
  item: ItemId | null;
  /** Metres from the explorer to the station for its recipes to be open. */
  reach: number;
  /** Burns fuel per craft (the Furnace). */
  fuel: boolean;
}

export const STATIONS: Record<StationId, StationDef> = {
  hand: { id: 'hand', name: 'station.hand', desc: 'station.hand.desc', item: null, reach: Infinity, fuel: false },
  workbench: { id: 'workbench', name: 'station.workbench', desc: 'station.workbench.desc', item: null, reach: 4.5, fuel: false },
  furnace: { id: 'furnace', name: 'station.furnace', desc: 'station.furnace.desc', item: 'furnace', reach: 4.5, fuel: true },
  forge: { id: 'forge', name: 'station.forge', desc: 'station.forge.desc', item: 'forge', reach: 4.5, fuel: false },
  alchemy: { id: 'alchemy', name: 'station.alchemy', desc: 'station.alchemy.desc', item: 'alchemyTable', reach: 4.5, fuel: false },
};

export const STATION_IDS: readonly StationId[] = ['hand', 'workbench', 'furnace', 'forge', 'alchemy'];

/** The station a placed item becomes. */
export function stationOfItem(item: ItemId): StationId | null {
  for (const id of STATION_IDS) if (STATIONS[id].item === item) return id;
  return null;
}

/**
 * The outpost (the Outpost Kit, placed): a small bank, a fast-travel node, a bedroll that sets the
 * respawn point, a light, and a field workbench. Monsters never spawn within `safeRadius`.
 */
export const OUTPOST = {
  /** Metres: the bank, the bedroll and fast travel are used from within this far. */
  useRadius: 4,
  /** Its field workbench counts within this far (the workbench reach). */
  benchRadius: 4.5,
  /** No monster spawns within this many metres (MOBS reads it). */
  safeRadius: 14,
  /** Light it gives (0..1 of a camp lamp). */
  light: 1,
  /** At most this many outposts per stratum (the map stays readable). */
  maxPerStratum: 4,
} as const;

/** Furnace fuel units a craft burns when the recipe gives none (config/recipes Recipe.fuel). */
export const DEFAULT_FUEL = 1;
