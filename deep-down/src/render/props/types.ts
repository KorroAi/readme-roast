// Prop specs drawn by PropRenderer (moved from the deleted zone generator). The
// descent's slab generator places them in alcoves, pockets, the surface camp and the seal halls.

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
  | 'haldenNote'
  | 'hoistWinch'
  | 'satchel'
  | 'plotStake'
  | 'forge'
  | 'surveyTable'
  | 'relicShelf'
  | 'runeStone';

/** What tapping a prop does in the descent (DescentScene.pickEntity reports it). */
export type PropTap = 'chest' | 'gem' | 'fossil' | 'note' | 'crate' | 'crystal' | 'lantern';

export interface PropSpec {
  /** Stable id (a slab's props are `s<slab>:<n>`), used to remove a prop and to remember harvests. */
  id: string;
  kind: PropKind;
  /** Base position (bottom centre) in world units. */
  x: number;
  y: number;
  z: number;
  rotY: number;
  scale: number;
  /** Voxel this prop rests on; if it is broken the prop breaks or falls. */
  anchor: [number, number, number] | null;
  /** Invisible emitter voxels owned by this prop (removed with it). */
  emitters: Array<[number, number, number]>;
  /** A tappable prop (alcove crates, pocket heroes, crystal clusters): what a tap on it does. */
  tap?: PropTap;
  /** Taps it takes (crystal clusters 2-4, crates 1). */
  taps?: number;
  /** Variation seed for procedural mesh details. */
  seed: number;
  /** A chosen model variant (render/props: PROP_VARIANTS), instead of the seed's pick. */
  modelVariant?: number;
}
