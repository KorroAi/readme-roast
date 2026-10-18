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
}
