import type { VoxelWorld } from '../VoxelWorld';

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
  | 'abyssMonolith';

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
  interact?: 'craft' | 'storage' | 'rest' | 'relic';
  /** Minable props (crystal clusters) drop items when broken. */
  minable?: { hardness: number; tier: number; drop: 'glimmerShard'; min: number; max: number };
  /** Variation seed for procedural mesh details. */
  seed: number;
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
      /** A timber beam from a to b (world points on its axis), square section `size` m. */
      kind: 'beam';
      id: string;
      a: [number, number, number];
      b: [number, number, number];
      size: number;
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
      seed: number;
    }
  | {
      /** The landing pylon carrying the stair landing: box x0..x1, z0..z1 from `foot` to `top`
       *  (the landing floor), battered walls, cornice, parapet. */
      kind: 'pylon';
      id: string;
      x0: number;
      x1: number;
      z0: number;
      z1: number;
      foot: number;
      top: number;
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
}
