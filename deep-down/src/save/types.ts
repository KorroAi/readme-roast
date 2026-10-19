import type { ItemId } from '../config/items';
import type { CacheState } from '../gameplay/Expedition';
import type { RecordsState, TripState } from '../gameplay/Records';
import type { QualityLevel } from '../render/Renderer';

/** Player settings, persisted separately from game progress. */
export interface Settings {
  quality: QualityLevel;
  /** Internal resolution multiplier override (null = preset default). */
  renderScale: number | null;
  bloom: boolean;
  /** Overall image brightness (exposure multiplier) for dark screens and bright rooms. */
  brightness: number; // 0.7 .. 1.5
  showFps: boolean;
  lookSensitivity: number; // 0.25 .. 2
  invertY: boolean;
  leftHanded: boolean;
  /** Short vibrations on hits, breaks, pickups and damage (phones that support it). */
  vibration: boolean;
  /** Touch: walking sideways swings the camera behind the explorer. */
  cameraFollow: boolean;
  masterVolume: number; // 0 .. 1
  musicVolume: number;
  sfxVolume: number;
  ambienceVolume: number;
  cameraShake: number; // 0 .. 1
  textSize: 'normal' | 'large';
  highContrast: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  quality: 'balanced',
  renderScale: null,
  bloom: true,
  brightness: 1,
  showFps: false,
  lookSensitivity: 1,
  invertY: false,
  leftHanded: false,
  vibration: true,
  cameraFollow: true,
  masterVolume: 0.8,
  musicVolume: 0.55,
  sfxVolume: 0.9,
  ambienceVolume: 0.7,
  cameraShake: 1,
  textSize: 'normal',
  highContrast: false,
};

export type ItemCounts = Partial<Record<ItemId, number>>;

export interface SlotData {
  item: ItemId;
  count: number;
}

/**
 * Long-term progress (save v2). Every field has a default filled by normalizeSave, so later waves
 * add optional fields here without bumping SAVE.version.
 */
export interface ProgressionSave {
  /** Days passed in the Hollow (W3: the Bloom). */
  day: number;
  /** Expeditions started so far (the next one is expeditions + 1). */
  expeditions: number;
  /** The expedition in progress, or null at camp. */
  trip: TripState | null;
  records: RecordsState;
  /** The pack left behind on a black-out, or null. */
  cache: CacheState | null;
  /** Camp stations built (W2). */
  stations: string[];
  /** Gear nodes built (W2). */
  gear: string[];
  /** Relics placed on the shelf (W3). */
  relics: string[];
  /** Active ore seams (W3). */
  seams: unknown[];
  /** Day each mined cell was mined: flat [index, day, ...] (W3). */
  minedDay: number[];
  /** Tutorial hints already shown. */
  hintsShown: string[];
  /** The finale has been seen (W3). */
  finale: boolean;
  /** The compass target the player picked (a seam or a site id), or null for camp. */
  compassTarget: string | null;
}

/** Everything needed to resume an expedition. Versioned; see save/SaveSystem migrations. */
export interface SaveData {
  version: number;
  /** WORLD.genVersion of the generator that made the world these edits apply to. */
  genVersion: number;
  savedAt: number;
  worldSeed: number;
  /** Total play time in seconds. */
  playTime: number;
  player: {
    x: number;
    y: number;
    z: number;
    yaw: number;
    health: number;
    lanternFuel: number;
  };
  backpack: Array<SlotData | null>;
  storage: ItemCounts;
  equipment: { pickaxe: number; lantern: number; pack: number };
  journal: string[];
  discoveries: string[];
  objectives: { completed: string[]; current: string | null; stats: Record<string, number> };
  /** World edits relative to the generated world: flat [index, blockId, index, blockId, ...]. */
  worldEdits: number[];
  /** Props removed by the player (mined crystal clusters, collected relics). */
  removedProps: string[];
  stats: { blocksMined: number; deaths: number; itemsBanked: number };
  progression: ProgressionSave;
}
