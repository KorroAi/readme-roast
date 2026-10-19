import type { MatCanvas, Rng } from './paint';
import { bedrock, dampSide, dampTop, deepSide, deepTop, sealStone, stoneSide, stoneTop, weatheredSide, weatheredTop } from './rock';
import { gravel, soil } from './earth';
import { copperVein, crystal, ironVein } from './minerals';
import { crumbling, floorSlab, hearth, masonry, masonryTop } from './masonry';
import { beamEnd, beamSide, plank } from './timber';

export type MaterialPainter = (c: MatCanvas, rng: Rng) => void;

/** One painter per material layer (keys must match MATERIAL_NAMES). */
export const PAINTERS = {
  stoneSide,
  stoneTop,
  deepSide,
  deepTop,
  weatheredSide,
  weatheredTop,
  dampSide,
  dampTop,
  soil,
  gravel,
  copperVein,
  ironVein,
  crystal,
  sealStone,
  masonry,
  masonryTop,
  floorSlab,
  crumbling,
  plank,
  beamSide,
  beamEnd,
  hearth,
  bedrock,
} satisfies Record<string, MaterialPainter>;
