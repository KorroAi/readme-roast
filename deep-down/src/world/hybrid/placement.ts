// The placed node (BUILD §2: `placeNode(lifeSeed, topo, template): NodePlacement`), as pure data in world metres. The
// layout (layout.ts) computes it from the chart topology and the template; nodeStamp.ts carves it into slabs; DepthScene
// (1C) draws its dressing, sockets and face; HybridGame (1D) walks its stands, exits and nav links.
//
// CONTRACT (W1, 1B, published at 0:45).

import type { Box3, V3 } from './grid';
import type { Dress, ExitType, LightShaft, Mount, NavLinkInfo, SecretKind, SocketKind, TemplateId, WorldLight } from './kits/types';

/** The face frame of a drift (render/hybrid/source.ts FaceFrame, the same fields). */
export interface FaceFramePlaced {
  /** The centre of the heading's floor line on slice 0's front plane. */
  origin: V3;
  /** Unit direction into the rock (horizontal: drifts are level in W1). */
  dir: V3;
  /** Unit up (+y). */
  up: V3;
}

/** A camera pose (eye in metres; yaw/pitch as render/hybrid/types.ts CameraPose: yaw 0 looks along -z, +yaw turns
 *  toward -x; +pitch looks up). */
export interface PoseM {
  pos: V3;
  yaw: number;
  pitch: number;
}

/** A Dig drift (SPEC §4.2): the heading stub where you stand, K slices of face plug, the breach into the chamber. */
export interface DriftPlacement {
  /** The back of the stub (feet, on the floor): where the Way Down lands. */
  origin: V3;
  /** Unit direction of the drift (into the rock). */
  dir: V3;
  up: V3;
  /** K (slices, 1 m each). */
  length: number;
  faceFrame: FaceFramePlaced;
  /** The Dig pose (SPEC §3.1: eye 1.6 m, the face's front surface 3.0 m ahead, pitch −8°). */
  stand: PoseM;
  /** The tube's open part (the stub) and the plug region of every slice (voxels of FACE_PLUG until the slice falls). */
  stub: Box3;
  slices: Box3[];
  /** Tube width and height (m): 3.5 × 3.0, the octagon heading's corners chamfered by one voxel. */
  width: number;
  height: number;
  dressing: Dress[];
  lights: WorldLight[];
}

/** A socket placed in the world (render/hybrid/source.ts ChamberSocket, extended). */
export interface SocketPlaced {
  /** Global id `${node}:${local}` (local = the template's socket id). */
  id: string;
  local: string;
  kind: SocketKind;
  mount: Mount;
  /** The object's anchor (wall surface point for veins and skin, the top of the ledge, crate or plinth for features,
   *  the foot of a lamp post or the bracket point of a wall lamp), world m. */
  pos: V3;
  /** Outward wall normal, or +y for floor pieces. */
  normal: V3;
  /** Half extents of its bound (m). */
  bound: V3;
  level: number;
  /** The walkable feet point you strike / open it from (≤ 3.5 m for strike types, the objective's walk target). */
  approach: V3;
  hidden?: boolean;
  lit?: boolean;
  rich?: boolean;
  /** For 'secret': the voxels (world voxel coordinates) that break open, and the cache socket ids they reveal. */
  secret?: { kind: SecretKind; cells: Array<[number, number, number]>; reveals: string[] };
  /** For 'skin': the voxel cell. */
  cell?: [number, number, number];
}

/** A stand: the arrival pose (stand 0) and the objective line's auto-walk targets. */
export interface StandPlaced {
  id: string;
  /** Eye pose. */
  pos: V3;
  yaw: number;
  pitch: number;
  /** Feet point. */
  feet: V3;
  /** Chalk-arrow facings worth turning to (yaw, pitch). */
  facings: Array<{ yaw: number; pitch: number }>;
  reachSockets: string[];
}

/** An exit with its Way Down ride (the Ride phase, W1-LEAD §3). */
export interface ExitPlaced {
  id: string;
  type: ExitType;
  /** The mouth (tap target centre), world m. */
  pos: V3;
  /** Where the carved octagon plate hangs. */
  plate: V3;
  /** The feet point you take it from (walk there, then the ride starts). */
  approach: V3;
  /** The yaw the ride starts facing. */
  yaw: number;
  /** The ride: eye points from the exit to the next drift's Dig pose (on rails; the camera follows it). */
  ride: V3[];
  /** The next node, or -1 when closed (the Root Knot in W1). */
  to: number;
  /** Pass-by targets along a cart run (ore glints within reach): world points and their ride parameter 0..1. */
  passBys?: Array<{ id: string; pos: V3; normal: V3; t: number }>;
}

/** The chamber of a node: the Explore cavern. */
export interface ChamberPlacement {
  template: TemplateId;
  /** The bounding box of every carved space of the chamber (incl. its exit passage and Way Down). */
  box: Box3;
  /** The carved spaces (the overlap and lap-gap tests use them). */
  volumes: Box3[];
  /** The breach: the opening in the entry wall (centre of its floor line) and the entry floor level. */
  entry: V3;
  floorY: number;
  stands: StandPlaced[];
  exits: ExitPlaced[];
  sockets: SocketPlaced[];
  dressing: Dress[];
  lights: WorldLight[];
  shafts: LightShaft[];
  /** Ladders and ropes inside the chamber (nav.ts links). */
  links: NavLinkInfo[];
  /** Props that block walking (crates, barrels, plinths): centre and radius on the floor (m). */
  blockers: Array<{ pos: V3; r: number }>;
  /** The first-light fill target for C (W1: the mean openness of the chamber, 0..1; the uniform rises 0.6 → 1.0). */
  fill: number;
  /** Set-piece anchors the render keys on (world m): 'wonder' (the hero feature), 'skyShaft', 'hatch', 'cage',
   *  'otherLantern' (the warm point far below), 'balcony', 'knot0'..'knot2' (the Root Knot), 'leak', 'pool'. */
  anchors: Record<string, V3>;
}

export interface NodePlacement {
  node: number;
  biome: number;
  /** The square spiral: lap (0 = the surface lap) and corner (0..3). */
  lap: number;
  corner: number;
  /** Depth of the drift's first slice (m, the model's depth) and K. */
  depthTop: number;
  K: number;
  drift: DriftPlacement;
  chamber: ChamberPlacement;
}

/** The surface camp at dusk (W1-LEAD §3 Camp; 1C draws it): the quarry floor, the adit and the board stations. */
export interface CampPlacement {
  box: Box3;
  floorY: number;
  /** Stations you walk between: 'adit' (into the first drift), 'board' (the crew board), 'lantern' (the lantern maker). */
  stations: Array<{ id: 'adit' | 'board' | 'lantern'; pos: V3; feet: V3; yaw: number; pitch: number }>;
  /** The first-launch pose (looking at the adit). */
  arrival: PoseM;
  dressing: Dress[];
  lights: WorldLight[];
  links: NavLinkInfo[];
  blockers: Array<{ pos: V3; r: number }>;
}
