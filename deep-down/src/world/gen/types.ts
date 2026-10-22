import type { VoxelWorld } from '../VoxelWorld';
import type { FeatureLayout } from './features/types';
import type { ItemId } from '../../config/items';

export type PropKind =
  | 'campfire'
  | 'workbench'
  | 'chest'
  | 'bedroll'
  | 'crate'
  | 'barrel'
  | 'lanternPost'
  | 'hangingLantern'
  | 'crystalCluster'
  | 'tablet'
  | 'pickaxeRack'
  | 'ropeCoil'
  | 'brokenCart'
  | 'abyssMonolith'
  // World variety (final pass W2): Halden logs, hoist gear, the pack left behind on a black-out.
  | 'haldenNote'
  | 'hoistWinch'
  | 'satchel'
  // The tree and the runes (final pass W3): camp plots, the three stations, the rune stones.
  | 'plotStake'
  | 'forge'
  | 'surveyTable'
  | 'relicShelf'
  | 'runeStone'
  // Round 3 (WORLD): the strata's ambient props per biome (config/biomes BIOMES[b].props; VIS models
  // them and batches the ones with no use), the lairs' dressing, and LOOP's placed stations.
  | StrataPropKind;

/** Round 3: the strata's prop kinds (ambient dressing, lair dressing, LOOP's stations and outposts). */
export type StrataPropKind =
  | 'bones'
  | 'stalagmite'
  | 'amberDrip'
  | 'mushroomSmall'
  | 'mushroomCluster'
  | 'sporePuff'
  | 'hangingRoots'
  | 'rootKnot'
  | 'reeds'
  | 'shells'
  | 'driftwood'
  | 'waterfall'
  | 'crystalSpire'
  | 'geodeShards'
  | 'rail'
  | 'timberProp'
  | 'icicle'
  | 'iceSpike'
  | 'frozenBones'
  | 'vineCurtain'
  | 'fern'
  | 'glowBulb'
  | 'gasVent'
  | 'bogBubble'
  | 'deadTree'
  | 'statue'
  | 'urn'
  | 'brokenColumn'
  | 'emberVent'
  | 'basaltColumn'
  | 'charredBones'
  | 'lavaGlow'
  | 'glassShard'
  | 'voidSpire'
  | 'lairPillar'
  | 'lairBrazier'
  | 'furnace'
  | 'alchemyTable'
  | 'outpost'
  /** The Halden works' lock (round 3, WORLD): a lever on a wall (VIS models it; its socket lamp shows its state). */
  | 'lever'
  /** A mine set across a Halden Mines drift (two posts and a cap; VIS models it). */
  | 'mineSet';

/** Round 3: ambient props that hang from the roof (anchored on the cell above). */
export const HANGING_PROPS: ReadonlySet<string> = new Set(['amberDrip', 'hangingRoots', 'icicle', 'vineCurtain']);

export interface PropSpec {
  /** Stable id, used by saves to remember removed props. */
  id: string;
  kind: PropKind;
  /** Base position (bottom center) in world units. */
  x: number;
  y: number;
  z: number;
  rotY: number;
  scale: number;
  /** Voxel this prop rests on; if it is mined the prop breaks or falls. */
  anchor: [number, number, number] | null;
  /** Invisible emitter voxels owned by this prop (removed with it). */
  emitters: Array<[number, number, number]>;
  /** Interaction role, if any. */
  interact?: 'craft' | 'storage' | 'rest' | 'relic' | 'feature' | 'station' | 'rune';
  /** Camp plots and stations (interact 'station'): which station (game/Stations). */
  station?: 'surveyTable' | 'forge' | 'relicShelf';
  /** Rune stones (interact 'rune'): the rune's key item and its glyph (config/runes). */
  rune?: { item: string; glyph: number };
  /** World features (interact 'feature'): what using this prop does (game/WorldFeatures). */
  feature?: { kind: 'rope' | 'hoist' | 'note' | 'relic' | 'monolith' | 'cache' | 'gate' | 'lift' | 'lever'; id: string; end?: 'top' | 'bottom' };
  /**
   * Halden caches, supply crates and the builders' coffers (feature 'cache'): what is inside (game/Progression).
   * Round 3: any item (the strata's chests are filled by LOOP's config/loot lootFor).
   */
  loot?: Partial<Record<ItemId, number>>;
  /** A secret alcove's reward (content pass): opening it counts the secret. */
  secret?: string;
  /** Minable props (crystal clusters) drop items when broken. */
  minable?: { hardness: number; tier: number; drop: 'glimmerShard' | 'echoShard'; min: number; max: number };
  /** Variation seed for procedural mesh details. */
  seed: number;
  /** A chosen model variant (render/props: PROP_VARIANTS), instead of the seed's pick. */
  modelVariant?: number;
}

export interface Region {
  id: string;
  /** Axis-aligned box in world units. */
  min: [number, number, number];
  max: [number, number, number];
}

/**
 * A built form drawn as a structure mesh (render/structures) over its collision cells
 * (B.STRUCTURE, the stair B.RAMP_* cells): the generator writes both. All units are world metres.
 */
export type StructureSpec =
  | {
      /** A straight stair flight descending from (x0, top, z0) along `dir` for `run` metres, one
       *  metre down per metre, between parapets; walk width `width` (centred on the line). */
      kind: 'stairFlight';
      id: string;
      x0: number;
      z0: number;
      top: number;
      dir: 'x' | 'z';
      run: number;
      width: number;
      /** Parapet (cheek wall) thickness on each side. */
      parapet: number;
      /** Arched bays between the piers that carry the flight: [s0, s1] along it. */
      bays: Array<[number, number]>;
      seed: number;
    }
  | {
      /** A round column on the floor at (x, y, z): base, shaft with entasis in drums, capital;
       *  `top` = underside of what it carries (full), or the height of the break (broken). */
      kind: 'column';
      id: string;
      x: number;
      y: number;
      z: number;
      radius: number;
      top: number;
      state: 'full' | 'broken' | 'stump';
      seed: number;
    }
  | {
      /** A fallen column drum lying along `axis`, centre (x, y, z). */
      kind: 'drum';
      id: string;
      x: number;
      y: number;
      z: number;
      axis: 'x' | 'z';
      length: number;
      radius: number;
      roll: number;
      seed: number;
    }
  | {
      /** A dressed stone block (kerbs, slabs, newels): box with chamfered arrises. */
      kind: 'block';
      id: string;
      min: [number, number, number];
      max: [number, number, number];
      /** Long axis of the stone (texture), and its strip height class (m). */
      axis: 'x' | 'z';
      chamfer: number;
      seed: number;
    }
  | {
      /** A run of coping / kerb stones on top of a wall from a to b (horizontal), stones about
       *  `stone` m long, section width x height, top at y. */
      kind: 'coping';
      id: string;
      a: [number, number];
      b: [number, number];
      y: number;
      width: number;
      height: number;
      stone: number;
      seed: number;
    }
  | {
      /** A timber from a to b (world points on its axis), section w x h m (h along the
       *  beam's up side), optionally splintered at an end where it snapped. */
      kind: 'beam';
      id: string;
      a: [number, number, number];
      b: [number, number, number];
      w: number;
      h: number;
      /** 0 none, 1 at a, 2 at b. */
      splinter: 0 | 1 | 2;
      /** Twist about the axis (radians): a fallen timber does not lie square. */
      roll: number;
      seed: number;
    }
  | {
      /** A sloped weathering stone on a set-back (the top of a buttress step): x0..x1 across the
       *  step (it rises toward +x), z0..z1 along it, sitting on y, rising `rise` m. */
      kind: 'weathering';
      id: string;
      x0: number;
      x1: number;
      z0: number;
      z1: number;
      y: number;
      rise: number;
      seed: number;
    }
  | {
      /** A sloping (battered) kerb along a paved way from x0 to x1 (cells x0..x1-1): its top edge
       *  at y on the line z, falling one metre toward `out` (the z direction, +1 or -1). */
      kind: 'kerbSlope';
      id: string;
      x0: number;
      x1: number;
      z: number;
      out: number;
      y: number;
      seed: number;
    }
  | {
      /** A plank deck on joists over the floor: x0..x1, z0..z1, its walking surface at y; the
       *  boards run along `along`. */
      kind: 'deck';
      id: string;
      x0: number;
      x1: number;
      z0: number;
      z1: number;
      y: number;
      along: 'x' | 'z';
      seed: number;
    }
  | {
      /** The arched bridge over the chasm: deck at `deck` (walking surface) from z0 to z1,
       *  centred on x, walk width `width`, parapets `parapet` thick. */
      kind: 'bridge';
      id: string;
      x: number;
      z0: number;
      z1: number;
      deck: number;
      width: number;
      parapet: number;
      /** The arch: springing height, the span of its springing points, its intrados crown. */
      spring: number;
      zA: number;
      zB: number;
      crown: number;
      /** z of the cell of the lamp pedestal on the west parapet. */
      mid: number;
      seed: number;
    }
  | {
      /** The landing pylon's dress over its voxel walls: a cornice under the landing (`top`, the
       *  landing floor), a socle at its foot (`foot`, the hall floor), corner rolls, along the
       *  wall faces `path` (horizontal polyline, outward to its left), and frames round its
       *  recesses. */
      kind: 'pylon';
      id: string;
      path: Array<[number, number]>;
      foot: number;
      top: number;
      /** Recess openings: in a wall plane z = at ('z') or x = at ('x'), spanning a0..a1 along it
       *  and y0..y1; `out` = the outward sign of the wall's normal. */
      recesses: Array<{ face: 'x' | 'z'; at: number; out: number; a0: number; a1: number; y0: number; y1: number }>;
      seed: number;
    };

export interface WorldLayout {
  world: VoxelWorld;
  seed: number;
  spawn: { x: number; y: number; z: number; yaw: number };
  /** Inside this box the player is "at camp": banking, refuel, healing. */
  camp: Region;
  /** Entering one of these regions triggers the matching discovery. */
  discoveries: Region[];
  props: PropSpec[];
  /** Waypoints of the marked route from camp to the depths (for tests and the camp beacon). */
  route: Array<[number, number, number]>;
  /** Notable positions for tests, the menu camera and the Visual Lab. */
  landmarks: Record<string, [number, number, number]>;
  /** Built forms drawn as structure meshes over their collision cells. */
  structures: StructureSpec[];
  /** The feature pass (world/gen/features): places, rides, rune doors, moths, the living rock. */
  features?: FeatureLayout;
  /** The progression pass (final pass W3, world/gen/progression): camp plots, runes, Ironbound niches. */
  progression?: ProgressionLayout;
  /** The content pass (finished game, world/gen/content): finds on every stretch of floor, secrets. */
  content?: import('./content').ContentLayout;
}

/** A camp plot: where a station rises once it is built (a chalk outline and a stake until then). */
export interface PlotDef {
  station: 'surveyTable' | 'forge' | 'relicShelf';
  /** Centre of the 2 x 2 plot on the floor (feet height), and the station's turn. */
  x: number;
  y: number;
  z: number;
  rotY: number;
  /** The four floor cells of the plot (x, y = feet, z). */
  cells: Array<[number, number, number]>;
}

/** A rune stone placed by the generator (the Lantern rune is the shrine's tablet, not listed here). */
export interface RuneSite {
  item: string;
  glyph: number;
  /** The prop id of its stone. */
  prop: string;
  /** What has to be done to reach it: nothing, an iron pick (an Ironbound niche), the rope, or both. */
  gate: 'none' | 'tier3' | 'rope' | 'tier3+rope';
  x: number;
  y: number;
  z: number;
  /** Ironbound cells that close its niche (empty when open). */
  seal: Array<[number, number, number]>;
}

export interface ProgressionLayout {
  plots: PlotDef[];
  runes: RuneSite[];
  /** Echo crystal voxels placed in the rift, and the clusters that drop echo shards (prop ids). */
  echoCells: number;
  echoClusters: string[];
}
