// The chamber kit seam (BUILD §2, W1-LEAD §3 and §5): what a chamber template is, as pure data (no Three.js), so the
// model (1A: contents per socket, the gold law), the shell (1D: Explore walking, the objective's walk targets) and the
// render (1C: props, the rim, the face) all read the same thing.
//
// CONTRACT (W1, 1B, published at 0:45). `TemplateInfo` and `templateFor` are the seam of BUILD §2; the placed geometry
// (`NodePlacement` in ../layout.ts) carries the world positions.

import type { V3 } from '../grid';

/** Chamber templates of W1 (Topsoil authored, the Glowroot Threshold, the Glowroot mini-kit, the Root Knot hall). */
export type TemplateId =
  | 'topsoil.rootCellar'
  | 'topsoil.copperLode'
  | 'topsoil.lampRoom'
  | 'topsoil.reliquary'
  | 'topsoil.cache'
  | 'topsoil.liftBottom'
  | 'glowroot.threshold'
  | 'glowroot.rootHall'
  | 'glowroot.glowGallery'
  | 'glowroot.mirrorPool'
  | 'glowroot.curtainRift'
  | 'glowroot.rootKnot';

/** The four Glowroot mini-kit templates (W1: 4 templates × 2 sub-zones). */
export const GLOWROOT_KIT: ReadonlyArray<TemplateId> = ['glowroot.rootHall', 'glowroot.glowGallery', 'glowroot.mirrorPool', 'glowroot.curtainRift'];

/** A sub-zone changes dressing, shape and light (SPEC §4.12): Glowroot 'cellars' (root cellars), 'galleries' (glow
 *  galleries). Topsoil rooms are authored ('authored'). */
export type SubZone = 'authored' | 'cellars' | 'galleries';

/** What a template is for (the chart's room kinds, SPEC §4.4). */
export type TemplateKind = 'authored' | 'trunk' | 'landmark' | 'threshold' | 'sealHall';

/** Socket kinds (BUILD §2's socket groups). The model (1A) decides what each holds this run (`contents`). */
export type SocketKind =
  /** a vein of ore in a wall: 3D nuggets half sunk (strike type) */
  | 'vein'
  /** a gem / crystal cluster on a ledge or wall (strike type) */
  | 'gem'
  /** a Halden lamp post or bracket (cold until relit; 'litLamp' when authored burning) */
  | 'lamp'
  /** the focus feature: a chest on a crate, a relic on a plinth, a note on a shelf, a mural (focus type) */
  | 'feature'
  /** a loose stash brick (strike type) */
  | 'stash'
  /** a keystone niche [W2] */
  | 'keystone'
  /** a secret: a cracked wall, a hollow floor or a loose brick that breaks to reveal a cache */
  | 'secret'
  /** the cache a secret reveals (focus type: a small chest or a stash; hidden until the secret opens) */
  | 'cache'
  /** a wall-skin cell (loose rock, strike type, 0.6× gold) */
  | 'skin'
  /** a Halden note or plaque (focus type: lore) */
  | 'note';

/** How a socket's object sits (render dressing and the "nothing floats" contact rule). */
export type Mount = 'wall' | 'floor' | 'ledge' | 'niche' | 'crate' | 'plinth' | 'shelf' | 'ceiling' | 'post' | 'bracket';

/** A secret's kind (W1-LEAD §3): a cracked wall, a hollow floor or a loose brick. */
export type SecretKind = 'crack' | 'hollow' | 'brick';

/** Exit / Way Down types (SPEC §4.2; W1-LEAD §3 Ride). 'cart' is the Copper Lode → Lamp Room cart run. */
export type ExitType = 'ladder' | 'stair' | 'chute' | 'rope' | 'cart' | 'hatch' | 'closed';

/** One socket of a template, as data (ids are template-local: 'v0', 'g1', 'l0', 'f0', 'x0', 's0', 'c0', 'k3'...). */
export interface SocketInfo {
  id: string;
  kind: SocketKind;
  mount: Mount;
  /** The level (0 = the entry level; levels are joined by stairs, ramps, ledges or ladders). */
  level: number;
  /** Hidden until a secret opens (caches behind a crack). */
  hidden?: boolean;
  /** For 'secret': the cache sockets it reveals; for 'cache': the secret that hides it. */
  reveals?: string[];
  secretKind?: SecretKind;
  /** Authored burning lamp (the Lamp Room's lamp still burning on a crate; never a relight target). */
  lit?: boolean;
  /** Rich: the Copper Lode's broad vein, the Lode's large vein (the model may weight its gold). */
  rich?: boolean;
}

/** A stand: the arrival pose and the objective line's auto-walk targets (W1-LEAD §3: stands survive only as these). */
export interface StandInfo {
  id: string;
  /** The sockets that are best used from here (the objective's walk target for them). */
  reachSockets: string[];
}

export interface ExitInfo {
  id: string;
  type: ExitType;
  /** The node the exit leads to (the next node, or -1 for 'closed'). */
  to: number;
}

/**
 * A chamber template as pure data (BUILD §2): its id, biome, kind, sockets grouped by kind, stands and exits, plus the
 * Explore facts the model and the tests need (W1-LEAD §3).
 */
export interface TemplateInfo {
  id: TemplateId;
  biome: number;
  kind: TemplateKind;
  subZone: SubZone;
  /** Every socket, in a stable order. */
  all: SocketInfo[];
  /** Socket ids grouped by kind (BUILD §2). */
  sockets: {
    veins: string[];
    gems: string[];
    lamps: string[];
    feature: string[];
    stash: string[];
    keystone: string[];
    secret: string[];
    cache: string[];
    skin: string[];
    note: string[];
  };
  stands: StandInfo[];
  exits: ExitInfo[];
  /** Plan size and height of the cavern (m): W1-LEAD §3 wants 14–28 wide, 14–30 deep, 6–18 tall in Topsoil. */
  size: { w: number; d: number; h: number };
  /** Levels joined by stairs, ramps, ledges or ladders (2–3). */
  levels: number;
  /** A one-line description (debug views and the capture sheet). */
  label: string;
}

/** The chart topology a template is chosen for (1A's `NodeTopo`; only these fields are read). */
export interface TopoLike {
  i: number;
  biome: number;
  depthTop: number;
  K: number;
  kind: string;
}

/** A dressing piece (decor only: never takes a tap, never blocks a tappable). 1C draws it in the voxel bevel language. */
export type DressKind =
  | 'pebbles'
  | 'rubble'
  | 'boulder'
  | 'root'
  | 'rootCurtain'
  | 'hangingRoots'
  | 'dripstone'
  | 'stalagmite'
  | 'flowstone'
  | 'timberSet'
  | 'timberPost'
  | 'beam'
  | 'plank'
  | 'rail'
  | 'sleeper'
  | 'railBuffer'
  | 'cart'
  | 'brokenCart'
  | 'crate'
  | 'crateStack'
  | 'barrel'
  | 'shelf'
  | 'chain'
  | 'rope'
  | 'ladder'
  | 'ropeLadder'
  | 'stairFlight'
  | 'cobweb'
  | 'plaque'
  | 'rune'
  | 'chalkArrow'
  | 'puddle'
  | 'crystalDecor'
  | 'glowroot'
  | 'hoistCage'
  | 'hatch'
  | 'winch'
  | 'signpost'
  | 'bones'
  | 'lampPost'
  | 'crewLamp'
  /** a Halden lamp hanging on a chain from the vault (lit: it is also a WorldLight) */
  | 'hangingLamp'
  /** a Halden iron wheel of cold lamps hung from the roof (catches the lantern: brass and glass) */
  | 'chandelier'
  | 'survey'
  | 'tools';

export interface Dress {
  kind: DressKind;
  /** Base (bottom centre for floor pieces, attachment point for wall and ceiling pieces), world m. */
  pos: V3;
  /** Yaw (rad) about +y. */
  rotY: number;
  scale: number;
  /** Variation seed (run-seeded: dressing re-rolls per run, SPEC §4.1). */
  seed: number;
  /** The other end of a linear piece (rail, rope, chain, beam, root, ladder): world m. */
  to?: V3;
  /** Size of a boxy piece (m): crate stacks, shelves, timber sets (width, height, depth). */
  size?: V3;
  /** Outward normal for wall pieces (plaque, rune, cobweb, roots on a wall). */
  normal?: V3;
}

/** A light source in the world (1E's practicals and volumetrics; the LightField bakes the warm ones that stay lit). */
export interface WorldLight {
  id: string;
  kind: 'lamp' | 'crew' | 'sky' | 'crystal' | 'glowroot' | 'leak' | 'camp';
  pos: V3;
  /** Linear RGB 0..1 (× intensity in the shader). */
  color: [number, number, number];
  /** Metres. */
  radius: number;
  /** A Halden lamp still cold (lit by the player: then it is a practical, written into the LightField after you leave). */
  cold?: boolean;
  /** The lamp socket this light belongs to. */
  socket?: string;
}

/** A shaft of real light in the air (W1-LEAD §4.5): the Root Cellar's sky shaft, a crystal's glow column. */
export interface LightShaft {
  id: string;
  /** The top (source) and the bottom (where it lands), world m. */
  from: V3;
  to: V3;
  radius: number;
  color: [number, number, number];
}

/** A walk link the grid cannot see by itself (ladders, ropes): both ends are feet points (W1-LEAD §3). */
export interface NavLinkInfo {
  a: V3;
  b: V3;
  kind: 'ladder' | 'rope' | 'step';
}
