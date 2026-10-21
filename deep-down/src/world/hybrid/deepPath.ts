// The descent's path (SPEC §4.10; BUILD §2 `deepPath(lifeSeed, d)`): for every model depth, where it is in the world.
// Depth is the model's metres (1 slice = 1 m along a drift); world height is not depth. The geometry is the square
// spiral of layout.ts. Pure.
//
// CONTRACT (W1, 1B, published at 0:45).

import { nodeOfDepth } from '../../idle/model/chart';
import type { V3 } from './grid';
import { nodeFrame } from './layout';

export type PathKind = 'drift' | 'chamber' | 'wayDown' | 'seal';

export interface PathPoint {
  /** The node whose drift holds this depth. */
  node: number;
  /** World position (m): the centre of slice `slice`'s front plane on the drift floor (for a seal row, the hatch). */
  pos: V3;
  /** Unit direction of the drift (into the rock); straight down for a seal row. */
  dir: V3;
  kind: PathKind;
  /** Slice index in the drift (0 = the first). */
  slice: number;
  /** The square spiral's lap and corner of the node's chamber. */
  lap: number;
  corner: number;
}

/** Where model depth d lies (fractional depths interpolate along the drift). */
export function deepPath(lifeSeed: number, d: number): PathPoint {
  const topo = nodeOfDepth(lifeSeed, d);
  const fr = nodeFrame(lifeSeed, topo.i);
  const t = Math.max(0, Math.min(topo.K, d - topo.depthTop));
  const slice = Math.min(topo.K - 1, Math.floor(t));
  if (fr.fromAbove) {
    return { node: topo.i, pos: { ...fr.face }, dir: { x: 0, y: -1, z: 0 }, kind: 'seal', slice: 0, lap: fr.lap, corner: fr.corner };
  }
  return {
    node: topo.i,
    pos: { x: fr.face.x + fr.dir.x * t, y: fr.face.y, z: fr.face.z + fr.dir.z * t },
    dir: { ...fr.dir },
    kind: 'drift',
    slice,
    lap: fr.lap,
    corner: fr.corner,
  };
}
